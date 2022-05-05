// TODO auto ist gelocked, wenn taster gedrückt werden. Dann fährt nichts mehr, auch nicht wenn ein command kommt. ist autolocked wirklich noch nötig?
// TODO Error, Warnung, Info Nummern prüfen
// TODO console log DEBUG entfernen



module.exports = function(RED) {

	// Definition of persistant variables
	let handle, sunTimes, lat, lon = null
	let sunriseFuncTimeoutHandle, sunsetFuncTimeoutHandle = null
	/** Closes shading if window closes */
	let closeIfWinCloses = false

	// Loading external modules
	var suncalc = require("suncalc")	// https://www.npmjs.com/package/suncalc#reference


	/** Config node */
    function ShadingConfigNode(node) {
        RED.nodes.createNode(this,node)

		/**
		 * Converts input string to typed defined value
		 * @param {String} type Announced type which to convert to. Allowed: "num", "bool", "str".
		 * @param value Input value to convert
		 * @returns Converted value
		 */
		function typeToNumFunc(type, value) {
			if ((type === "num" && typeof value === "number") || (type === "str" && typeof value === "string") || (type === "bool" && typeof value === "bool")) {return value}		// No need to convert
			if (type === "num" && typeof value === "string" && !isNaN(Number(value))) {return Number(value)}		// Convert number to string
			if (type === "bool" && (value === "true" || value === "false")) {return value === "true"}				// Convert bool to string
			return -1
		}

		node.inmsgWinswitchPayloadOpened = typeToNumFunc(node.inmsgWinswitchPayloadOpenedType, node.inmsgWinswitchPayloadOpened)
		node.inmsgWinswitchPayloadTilted = typeToNumFunc(node.inmsgWinswitchPayloadTiltedType, node.inmsgWinswitchPayloadTilted)
		node.inmsgWinswitchPayloadClosed = typeToNumFunc(node.inmsgWinswitchPayloadClosedType, node.inmsgWinswitchPayloadClosed)
		node.lat = typeToNumFunc("num", node.lat)
		node.lon = typeToNumFunc("num", node.lon)
		node.payloadOpenCmd = typeToNumFunc(node.payloadOpenCmdType, node.payloadOpenCmd)
		node.payloadCloseCmd = typeToNumFunc(node.payloadCloseCmdType, node.payloadCloseCmd)
		node.payloadStopCmd = typeToNumFunc(node.payloadStopCmdType, node.payloadStopCmd)
		node.shadingSetposShade = typeToNumFunc("num", node.shadingSetposShade)
		node.inmsgButtonDblclickTime = typeToNumFunc("num", node.inmsgButtonDblclickTime)
		
		node.inmsgTopicActPosHeight = node.inmsgTopicActPosHeight || "heightfeedback"
		node.inmsgButtonTopicOpen = node.inmsgButtonTopicOpen || "buttonup"
		node.inmsgButtonTopicClose = node.inmsgButtonTopicClose || "buttondown"
		node.openTopic = node.openTopic || "commandopen"
		node.shadeTopic = node.shadeTopic || "commandshade"
		node.closeTopic = node.closeTopic || "commandclose"
		node.inmsgWinswitchTopic = node.inmsgWinswitchTopic || "switch"
		node.inmsgButtonDblclickTime = node.inmsgButtonDblclickTime || 500

		this.config = node

    }
	
    RED.nodes.registerType("shading configuration",ShadingConfigNode)
	
	/** Working node */
	
	function ShadingNode(node) {
		RED.nodes.createNode(this,node)
		const config = RED.nodes.getNode(node.configSet).config
		const that = this
		
		let nodeContext = that.context()
		let flowContext = that.context().flow
		let globalContext = that.context().global
		
		/**
		 * The nodes context object
		 * @property {Number} windowState 1 = opened, 2 = tilted, 3 = closed
		 * @property {Bool} autoLocked If set, no automatic actions will be fired
		 * @property {Bool} stateButtonOpen Button open is pressed
		 * @property {Bool} stateButtonClose Button close is pressed
		 * @property {Bool} stateButtonRunning Any button has been pressed and action is running
		 * @property {Number} buttonCloseTimeoutHandle Handle for the close button single press timer
		 * @property {Number} buttonOpenTimeoutHandle Handle for the open button single press timer
		 */
		let context = nodeContext.get("context")

		if (!context) {
			if (node.debug) {
				that.warn("W002: No context to restore, so sensor states are unknown. See https://nodered.org/docs/user-guide/context#saving-context-data-to-the-file-system how to save states.")
			}
			context = {}
		}

		// Variable declaration
		const loopIntervalTime = 5000

		const shadingSetpos = {
			open: 0,
			shade: config.shadingSetposShade,
			close: 100
		}

		const window = {
			opened: 1,
			tilted: 2,
			closed: 3
		}

		var err = false
		let loopCounter = 0

		/** The backed up state of sunrise being in the future */
		let sunriseAheadPrev = null
		/** The backed up state of sunet being in the future */
		let sunsetAheadPrev = null
		/** The actual time as date object */
		let actDate = new Date()
		// Loading external modules

		// FUNCTIONS ====>


		/**
		 * This function will write the relevant node's output.
		 * @param {String} a Payload for output 1 (opencommand)
		 * @param {String} b Payload for output 2 (closecommand)
		 * @param {String} c Payload for output 3 (resetcommand)
		 * @param {String} d Payload for output 4 (setpointcommand)
		 */
		function sendCommandFunc(a,b,c,d) {
			
			let msgA, msgB, msgC, msgD, msgE = null

			if (a != null) {
				msgA = {topic: "open", payload: a}
				that.log("msgA has content")
			} else msgA = null
			
			if (b != null) {
				msgB = {topic: "close", payload: b}
				that.log("msgB has content")
			} else msgB = null
			
			if (c != null) {
				msgC = {topic: "stop", payload: c}
				that.log("msgC has content")
			} else msgC = null
			
			if (d != null) {
				msgD = {topic: "command", payload: d}
				that.log("msgD has content")
			} else msgD = null

			msgE = {
				topic: "status",
				payload: {
					config: config,
					context: context,
					sunTimes: sunTimes
				}
			}

			that.send([msgA, msgB, msgC, msgD, msgE])

			if (node.debug) {
				that.log("Here are new output values")
				console.log([msgA, msgB, msgC, msgD, msgE])
			}

		}


		/** Checks if automatic movement is allowed and sends setpos values. Prior to that, context.setposHeight must be made available.
		 * This function must be called each time an automatic movement should processed.
		 * @param {Boolean} sendNow If true, the setpoint value will be sent. If false, the setpoint will be sent only if it changes.
		 * @param {Boolean} ignoreLock If true, the setpoint will be sent even if hardlock is active.
		 */
		function autoMoveFunc(sendNow, ignoreLock) {

			const caller = autoMoveFunc.caller.name
			const callee = arguments.callee.name

			if (typeof context.setposHeight != "number") {				// setposHeight is not a number
				that.error("E001: invalid setposHeight ('" + context.setposHeight + "') [" + caller + "]")
				return
			}
			else if (context.setposHeight < 0) {						// setposHeight is negative
				that.error("E002: negative setposHeight ('" + context.setposHeight + "') [" + caller + "]")
				return
			}
			else if (context.setposHeight > 100) {						// setposHeight is above 100
				that.error("E003: setposHeight above 100 ('" + context.setposHeight + "') [" + caller + "]")
				return
			} else {

				// Check for new setposHeight and sendNow
				if (context.setposHeightPrev == context.setposHeight && !sendNow) {return}
				
				// Sending console message
				else if (node.debug) {that.log("setposHeight: " + context.setposHeightPrev + " -> " + context.setposHeight)}

				// Getting hardlock state
				if (config.autoActive) {
					if (config.hardlockType === "flow") {context.hardlock = flowContext.get(config.hardlock)}
					else if (config.hardlockType === "global") {context.hardlock = globalContext.get(config.hardlock)}
					else if (config.hardlockType === "dis") {context.hardlock = false}
					else {that.error("E005: Undefined hardlock type")}
					if (typeof context.hardlock === "undefined") {
						that.warn("W003: Undefined hard lock variable at '" + config.hardlockType + "." + config.hardlock + "'. Assuming false until set.")
						context.hardlock = false
					} else if (typeof context.hardlock !== "boolean") {
						that.warn("W004: Hard lock variable at '" + config.hardlockType + "." + config.hardlock + "' defined but not a boolean. Assuming false until set.")
						context.hardlock = false
					}
				} else {
					context.hardlock = false
				}

				if (ignoreLock) {if (node.debug) {that.log("Lock will be ignored")}}

				let allowLowering = 																// Check security conditions
					(context.windowState === window.opened && config.allowLoweringWhenOpened)
					|| (context.windowState === window.tilted && config.allowLoweringWhenTilted)
					|| context.windowState === window.closed
					|| !config.winswitchEnable

				if (context.hardlock && !ignoreLock) {													// Hardlock -> nothing will happen
					if (node.debug) {that.log("Locked by hardlock, nothing will happen.")}
				} else if (context.autoLocked && !ignoreLock) {											// Softlock -> nothing will happen
					if (node.debug) {that.log("Locked by application, nothing will happen.")}
				} else if (config.inmsgTopicActPosHeightType === "dis") {								// No shading position feedback -> always move
					sendCommandFunc(null,null,null,context.setposHeight)
				} else if (typeof context.actposHeight == "undefined" && context.setposHeight === 0) {	// Actual height position unknown but setpos is 0 -> move up
					that.warn("Unknown actual position, but rising is allowed.")
					sendCommandFunc(null,null,null,context.setposHeight)
				} else if (typeof context.actposHeight == "undefined" && !allowLowering) {				// Actual height position unknown where lowering is not allowed
					that.warn("Unknown actual position. Drive may move down but lowering is not allowed (check window switch permissions). Nothing will happen.")
				} else if (typeof context.actposHeight == "undefined") {
					that.log("Unknown actual position, but lowering is allowed.")
					sendCommandFunc(null,null,null,context.setposHeight)
				} else if (context.setposHeight > context.actposHeight) {								// Lowering -> check conditions
					if (config.winswitchEnable && (!context.windowState || context.windowState < 1 || context.windowState > 3)) {		// Check plausibility of window switch
						that.warn("Unknown or invalid window State (open/tilted/closed). Nothing will happen.")
					}
					if (allowLowering) {
						sendCommandFunc(null,null,null,context.setposHeight)
					} else {
						if (node.debug) {that.log("Lowering not allowed. Check window switch. Nothing will happen.")}
					}
				} else if (context.setposHeight <= context.actposHeight) {								// Rising or unchanged
					sendCommandFunc(null,null,null,context.setposHeight)
				}
				context.setposHeightPrev = context.setposHeight
			}
		}

		/** Checks if the parameter is a valid date type
		 * https://stackoverflow.com/questions/1353684/detecting-an-invalid-date-date-instance-in-javascript
		 */
		function isValidDate(d) {return d instanceof Date && !isNaN(d)}


		/** Recalculates setposHeight */
		function calcSetposHeight() {
			if (context.sunInSky) {
				if (node.debug) {that.log("Checking configuration for daytime")}
				if (config.openIfSunrise) {
					context.setposHeight = shadingSetpos.open
					autoMoveFunc()
					return
				} else if (config.shadeIfSunrise) {
					context.setposHeight = config.shadingSetposShade
					autoMoveFunc()
					return
				} else if (config.closeIfSunrise) {
					context.setposHeight = shadingSetpos.close
					autoMoveFunc()
					return
				} else {
					if (node.debug) {that.log("Nothing configured to happen on daytime")}
				}
			} else {
				if (node.debug) {that.log("Checking configuration for nighttime")}
				if (config.openIfSunset) {
					context.setposHeight = shadingSetpos.open
					autoMoveFunc()
					return
				} else if (config.shadeIfSunset) {
					context.setposHeight = config.shadingSetposShade
					autoMoveFunc()
					return
				} else if (config.closeIfSunset) {
					context.setposHeight = shadingSetpos.close
					autoMoveFunc()
					return
				}
				if (node.debug) {that.log("Nothing configured to happen on nighttime")}
			}
		}

		/** TODO Function description */
		function sunriseFunc(){
			suncalcFunc()
		}
		
		/** TODO Function description */
		function sunsetFunc(){
			suncalcFunc()
		}

		/** This is the loop function which will be processed only if automatic is enabled. It provides the almighty context.setposHeight. */
		function mainLoopFunc() {

			actDate = new Date()								// Set to actual time

			if (!isValidDate(sunTimes.sunrise) || !isValidDate(sunTimes.sunset)) {
				that.error("E004: Suntimes calculator seems broken. Please consult the developer!")
			}

			context.sunriseAhead = sunTimes.sunrise > actDate					// Sunrise is in the future
			context.sunsetAhead = sunTimes.sunset > actDate						// Sunset is in the future
			context.sunInSky = !context.sunriseAhead && context.sunsetAhead		// It's daytime
			
			// Sunrise event
			if (context.sunriseAhead === false && sunriseAheadPrev === true) {
				if (node.debug) {that.log("Now it's sunrise")}								// -> Send debug message
				calcSetposHeight()
				updateNodeStatus()
			}
			
			// Sunset event
			else if (context.sunsetAhead === false && sunsetAheadPrev === true) {
				if (node.debug) {that.log("Now it's sunset")}								// -> Send debug message
				calcSetposHeight()
				updateNodeStatus()
			}

			// Backing up
			sunriseAheadPrev = context.sunriseAhead
			sunsetAheadPrev = context.sunsetAhead

			// Proceed sending if setpoint is valid
			if (context.setposHeight) {
				autoMoveFunc()
			}

		}


		/** This function prints config and context on the console. Add "message" to prefix a message. */
		function printConsoleDebug(message) {

			that.log("========== DEBUGGING START ==========")
			if (message) {
				console.log(message)
			}
			console.log("\n::::: NODE :::::")
			console.log(node)
			console.log("\n::::: CONFIG :::::")
			console.log(config)
			console.log("\n::::: CONTEXT :::::")
			console.log(context)
			console.log("\n")
		}


		/** This function updates the node status. See https://nodered.org/docs/creating-nodes/status for more details.
		 * 
		 * Description "shape"
		 * always "dot"
		 * 
		 * Description "fill"
		 * grey: Automatic is disabled in configuration
		 * green: Automatic is configured but inactive
		 * red: Automatic is configured and active
		 * 
		 * Description "text"
		 * 
		*/
		function updateNodeStatus() {

			let fill = "grey"
			let text = "Auto off "

			function addZero(i) {
				if (i < 10) {i = "0" + i}
				return i
			}

			if (config.autoActive) {
				
				if (context.autoLocked) {
					if (context.actposHeight) {
						text = context.actposHeight + "% | "
					} else {
						text = context.setposHeight + "% | "
					}
					fill = "red"
				} else {
					text = context.setposHeight + "% | "
					fill = "green"
				}

				if (context.sunInSky) {
					text = text + "🌜 " + addZero(sunTimes.sunset.getHours()) + ":" + addZero(sunTimes.sunset.getMinutes())
				} else {
					text = text + "🌞 " + addZero(sunTimes.sunrise.getHours()) + ":" + addZero(sunTimes.sunrise.getMinutes())
				}

			}
			
			if (config.autoActive && config.winswitchEnable) {
				if (context.windowStateStr) {
					text = text + " | " + context.windowStateStr
				} else {
					text = text + " | Unknown"
				}
			}
			
			that.status({fill: fill, shape: "dot", text: text})

		}

		/** Calculates ms from now to 1 second after midnight
		 * @param {Date} now Start time from which to calculate from
		 */
		function msToMidnight(now) {
			let next = new Date()
			next.setDate(now.getDate() + 1)
			next.setHours(0,0,1,0)
			let diff = next.getTime() - now.getTime()
			return diff
		}

		/** Gets suncalc times
		 * @property {Date} dawn dawn (morning nautical twilight ends, morning civil twilight starts)
		 * @property {Date} dusk dusk (evening nautical twilight starts)
		 * @property {Date} goldenHour evening golden hour starts
		 * @property {Date} goldenHourEnd morning golden hour (soft light, best time for photography) ends
		 * @property {Date} nadir nadir (darkest moment of the night, sun is in the lowest position)
		 * @property {Date} nauticalDawn nautical dawn (morning nautical twilight starts)
		 * @property {Date} nauticalDusk nautical dusk (evening astronomical twilight starts)
		 * @property {Date} night night starts (dark enough for astronomical observations)
		 * @property {Date} nightEnd night ends (morning astronomical twilight starts)
		 * @property {Date} solarNoon solar noon (sun is in the highest position)
		 * @property {Date} sunrise sunrise (top edge of the sun appears on the horizon)
		 * @property {Date} sunriseEnd sunrise ends (bottom edge of the sun touches the horizon)
		 * @property {Date} sunset sunset (sun disappears below the horizon, evening civil twilight starts)
		 * @property {Date} sunsetStart sunset starts (bottom edge of the sun touches the horizon)
		*/
		function suncalcFunc() {
			let sunEventTimeoutHandle = null

			/** Actual date */
			let now = new Date()
			
			// Calculate suntimes 
			sunTimes = suncalc.getTimes(now, config.lat, config.lon)
			
			/** Calculate ms to sunrise and sunset
			 * @returns {Bool} TRUE if any sun event is in the future (or now). FALSE if both are in the past.
			*/
			function sunEventInFutureFunc() {
				sunTimes.msToSunrise = sunTimes.sunrise.getTime() - now.getTime()
				sunTimes.msToSunset = sunTimes.sunset.getTime() - now.getTime()
				return sunTimes.msToSunrise >= 0 || sunTimes.msToSunset >= 0
			}
			
			// Retry sequence if sunrise and sunset are both in past
			if (!sunEventInFutureFunc()) {
				let tryThatDate = now
				tryThatDate.setHours(12,0,0)
				sunTimes = suncalc.getTimes(tryThatDate, config.lat, config.lon)
				if (!sunEventInFutureFunc()) {
					tryThatDate.setDate(now.getDate() + 1)
					sunTimes = suncalc.getTimes(tryThatDate, config.lat, config.lon)
					if (!sunEventInFutureFunc()) {
						that.error("E006: Cannot find any valid sunrise or sunset time")
						clearTimeout(sunEventTimeoutHandle)
						return
					}
				}
			}

			if (sunTimes.msToSunrise < sunTimes.msToSunset) {
				sunEventTimeoutHandle = setTimeout(sunriseFunc, sunTimes.msToSunrise)
			} else {
				sunEventTimeoutHandle = setTimeout(sunsetFunc, sunTimes.msToSunset)
			}



			// Setting timeout trigger for sunrise and sunset
			// TODO hier hatte ich aufgehört, weiß grad nimmer was das werden sollte
			
			// clearTimeout(sunriseFuncTimeoutHandle)
			// clearTimeout(sunsetFuncTimeoutHandle)
			// if (sunTimes.msToSunrise >= 0) {
			// 	sunriseFuncTimeoutHandle = 
			// }
			// if (sunTimes.msToSunset >= 0) {
			// }

		}
	
		// <==== FUNCTIONS





		// FIRST RUN ACTIONS (INIT) ====>
		
		
		if (config.autoActive) {
			suncalcFunc()
			calcSetposHeight()
		} else {
			clearTimeout(sunriseFuncTimeoutHandle)
			clearTimeout(sunsetFuncTimeoutHandle)
		}
		

		
		// Main loop
		if (config.autoActive) {
			mainLoopFunc()		// Trigger once as setInterval will fire first after timeout
			clearInterval(handle)		// Clear eventual previous loop
			handle = setInterval(mainLoopFunc, loopIntervalTime)		// Continuous interval run
		}
		
		updateNodeStatus()		// Initially set node status
		sendCommandFunc()		// Providing status
		
		if (node.debug) {printConsoleDebug()}

		// <==== FIRST RUN ACTIONS (INIT)






		// MESSAGE EVENT ACTIONS ====>

		this.on('input', function(msg,send,done) {
			
			/** Storing peripheral states */
			if (msg.topic === config.inmsgButtonTopicOpen) {context.stateButtonOpen = msg.payload}
			else if (msg.topic === config.inmsgButtonTopicClose) {context.stateButtonClose = msg.payload}

			/** Resend event */
			var resendEvent = msg.topic === "resend"										// TODO in documentation
			/** Button open/close event based on incoming message topic */
			var buttonEvent = msg.topic === config.inmsgButtonTopicOpen || msg.topic === config.inmsgButtonTopicClose
			/** Button press event based on incoming message topic, if payload is TRUE */
			var buttonPressEvent = buttonEvent && msg.payload === true
			/** Button press open event */
			var buttonPressOpenEvent = msg.topic === config.inmsgButtonTopicOpen && msg.payload === true
			/** Button press close event */
			var buttonPressCloseEvent = msg.topic === config.inmsgButtonTopicClose && msg.payload === true
			/** Button release event based on incoming message topic, if payload is FALSE */
			var buttonReleaseEvent = buttonEvent && msg.payload === false
			/** Debug on console request */
			var printConsoleDebugEvent = msg.debug

			if (config.autoActive) {
				/** Window switch event based on incoming message topic */
				var windowSwitchEvent = config.winswitchEnable && msg.topic === config.inmsgWinswitchTopic
				/** Window switch open event based on incoming message payload */
				var windowSwitchOpenEvent = msg.payload === config.inmsgWinswitchPayloadOpened
				/** Window switch tilt event based on incoming message payload */
				var windowSwitchTiltEvent = msg.payload === config.inmsgWinswitchPayloadTilted
				/** Window switch close event based on incoming message payload */
				var windowSwitchCloseEvent = msg.payload === config.inmsgWinswitchPayloadClosed
				/** Auto re-enable event based on incoming message topic */
				var autoReenableEvent = config.autoIfMsgTopic && msg.topic === "auto"		// TODO make topic configurable? --> DOC
				/** Open event based on incoming message topic */
				var openCommand = msg.topic === config.openTopic
				/** Shade event based on incoming message topic */
				var shadeCommand = msg.topic === config.shadeTopic
				/** Close event based on incoming message topic */
				var closeCommand = msg.topic === config.closeTopic
				/** Height drive position event based on incoming message topic */
				var driveHeightEvent = config.inmsgTopicActPosHeightType != "dis" && msg.topic === config.inmsgTopicActPosHeight
			}

			if (buttonEvent) {

				closeIfWinCloses = false

				// Button open pressed
				if (buttonPressOpenEvent) {
					context.autoLocked = true
					if (node.debug) {that.log("Automatic disabled")}
					clearTimeout(context.buttonCloseTimeoutHandle)
					context.buttonCloseTimeoutHandle = null

					// Single/double click detection
					if (context.buttonOpenTimeoutHandle) {
						
						// DOUBLE CLICK ACTIONS ==>
						clearTimeout(context.buttonOpenTimeoutHandle)
						context.buttonOpenTimeoutHandle = null
						sendCommandFunc(null,null,null,shadingSetpos.open)
						// <== DOUBLE CLICK ACTIONS

					} else {
						context.buttonOpenTimeoutHandle = setTimeout(function(){
							clearTimeout(context.buttonOpenTimeoutHandle)
							context.buttonOpenTimeoutHandle = null
							if (context.stateButtonOpen) {

								// LONG CLICK ACTIONS ==>
								sendCommandFunc(config.payloadOpenCmd,null,null,null)
								context.stateButtonRunning = true
								// <== LONG CLICK ACTIONS
								
							}
						}, config.inmsgButtonDblclickTime)
					}
					
				// Button close pressed
				} else if (buttonPressCloseEvent) {
					context.autoLocked = true
					if (node.debug) {that.log("Automatic disabled")}
					clearTimeout(context.buttonOpenTimeoutHandle)
					context.buttonOpenTimeoutHandle = null
				
					// Single/double click detection
					if (context.buttonCloseTimeoutHandle) {
						
						// DOUBLE CLICK ACTIONS ==>
						clearTimeout(context.buttonCloseTimeoutHandle)
						context.buttonCloseTimeoutHandle = null
						sendCommandFunc(null,null,null,shadingSetpos.close)
						// <== DOUBLE CLICK ACTIONS
							
					} else {
						context.buttonCloseTimeoutHandle = setTimeout(function(){
							clearTimeout(context.buttonCloseTimeoutHandle)
							context.buttonCloseTimeoutHandle = null
							if (context.stateButtonClose) {
								
								// LONG CLICK ACTIONS ==>
								sendCommandFunc(null,config.payloadCloseCmd,null,null)
								context.stateButtonRunning = true
								// <== LONG CLICK ACTIONS
								
							}
						}, config.inmsgButtonDblclickTime)
					}
					
				// Any button released
				} else if (buttonReleaseEvent && context.stateButtonRunning) {
					
					// BUTTONS RELEASED ACTIONS ==>
					context.stateButtonRunning = false
					sendCommandFunc(null,null,config.payloadStopCmd,null)
					// <== BUTTONS RELEASED ACTIONS
				}
			}

			else if (windowSwitchEvent) {
				
				let oldState = context.windowState
				let oldStateStr = context.windowStateStr

				closeIfWinCloses = false
				
				if ((windowSwitchOpenEvent || windowSwitchTiltEvent) && context.actposHeight > shadingSetpos.shade && config.preventClosing) {
					context.setposHeight = shadingSetpos.shade
					autoMoveFunc(true, true)
					closeIfWinCloses = true
				}

				if (windowSwitchOpenEvent) {
					context.windowState = window.opened
					context.windowStateStr = "Opened"
				} else if (windowSwitchTiltEvent) {
					context.windowState = window.tilted
					context.windowStateStr = "Tilted"
				} else if (windowSwitchCloseEvent) {
					context.windowState = window.closed
					context.windowStateStr = "Closed"
					if (closeIfWinCloses) {
						if (node.debug) {that.log("Held back closing command, now executing.")}
						context.setposHeight = shadingSetpos.close
						autoMoveFunc(true, true)
						closeIfWinCloses = false
					}
				} else {
					context.windowState = null
					context.windowStateStr = "Unknown"
				}

				// Return if window switch state is unknown or unchanged (filter)
				// Enable the following line to prevent equal events (like open -> open)
				// if (oldState == context.windowState || !oldState) {return}
				
				// Sending debug message
				if (node.debug) {that.log("Window switch event detected: " + oldStateStr + " -> "  + context.windowStateStr)}

			}

			else if (autoReenableEvent) {
				if (node.debug) {that.log("Re-enabeling automatic due to manual request")}
				context.autoLocked = false
				calcSetposHeight()
				context.stateButtonRunning = false
				autoMoveFunc(true)
				closeIfWinCloses = false
			}
			
			else if (openCommand){
				if (node.debug) {that.log("Received command to open")}
				context.setposHeight = shadingSetpos.open
				autoMoveFunc(true,true)
				context.autoLocked = true
				closeIfWinCloses = false
			}
			
			else if (shadeCommand){
				if (node.debug) {that.log("Received command to shade")}
				context.setposHeight = shadingSetpos.shade
				autoMoveFunc(true,true)
				context.autoLocked = true
				closeIfWinCloses = false
			}
			
			else if (closeCommand){
				if (node.debug) {that.log("Received command to close")}
				if (config.preventClosing && context.windowState != window.closed) {
					if (node.debug) {that.log("Window is not closed, going to shade position instead.")}
					context.setposHeight = shadingSetpos.shade
					closeIfWinCloses = true
				} else {
					context.setposHeight = shadingSetpos.close
				}
				autoMoveFunc(true,true)
				context.autoLocked = true
			}

			else if (driveHeightEvent) {				// TODO Was wenn es das nicht gibt??
				if (msg.payload >= 0 && msg.payload <= 100 && typeof msg.payload === "number") {
					let prevPos = context.actposHeight
					context.actposHeight = msg.payload
					that.log("New shading position detected: " + prevPos + " -> " + context.actposHeight)
				} else {
					that.warn("W001: Actual drive position must be number between 0 and 100, but received '" + msg.payload + "'.")
				}
			}

			else if (resendEvent) {
				if (node.debug) {that.log("Saw request to resend values")}
				autoMoveFunc(true)
			}

			else if (printConsoleDebugEvent) {
				printConsoleDebug("Debug requested, so here we go.")
			}
			
			
			// ONLY FOR DEBUGGING ====>
			
			else if (msg.frcSunrise) {
				sunTimes.sunrise = new Date(msg.frcSunrise)
				that.warn("Sunrise value overwritten. New value: " + sunTimes.sunrise)
			}
			
			else if (msg.frcSunset) {
				sunTimes.sunset = new Date(msg.frcSunset)
				that.warn("Sunset value overwritten. New value: " + sunTimes.sunset)
			}
			
			else if (msg.frcSunauto) {
				that.log("Sunrise and sunset values reset")
				mainLoopFunc()
			}
			
			else if (node.debug) {
				that.log("Unknown message with topic '" + msg.topic + "'")
			}
			
			// <==== ONLY FOR DEBUGGING

			
			

			if (err) {
				if (done) {
					// Node-RED 1.0 compatible
					done(err)
				} else {
					// Node-RED 0.x compatible
					this.error(err,msg)
				}
			}

			// Updating node status
			updateNodeStatus()

			// Providing status
			sendCommandFunc()

		})


		// <==== MESSAGE EVENT ACTIONS
		




		nodeContext.set("context", context)		// Backing up context

		



		// CLOSE EVENTS ====>

		this.on('close', function() {
			clearInterval(handle)
		})

		// <==== CLOSE EVENTS

	}

    RED.nodes.registerType("shading",ShadingNode)
}