module.exports = function(RED) {

	// Loading external modules
	var suncalc = require("suncalc")	// https://www.npmjs.com/package/suncalc#reference


	/** Config node */
    function ShadingConfigNode(node) {
        RED.nodes.createNode(this, node)
		this.config = node

		/**
		 * Converts input string to typed defined value
		 * @param {String} type Announced type which to convert to. Allowed: "num", "bool", "str".
		 * @param {Any} value Input value to convert
		 * @returns {Any} Converted value
		 */
		function strToTypeFunc(type, value) {
			if ((type === "num" && typeof value === "number")
			|| (type === "str" && typeof value === "string")
			|| (type === "bool" && typeof value === "bool")) {
				return value				// Value already in destination format -> no need to convert
			}
			if (type === "num" && typeof value === "string" && !isNaN(Number(value))) {
				return Number(value)		// Return number converted from string
			}
			if (type === "bool" && (value === "true" || value === "false")) {
				return value === "true"		// Return boolean TRUE if string is "true"
			}
			return -1
		}

		this.config.heightFbRt = strToTypeFunc("num", node.heightFbRt)
		this.config.preventClosing = node.preventClosing && node.heightFbEnable
		this.config.inmsgWinswitchPayloadOpened = strToTypeFunc(node.inmsgWinswitchPayloadOpenedType, node.inmsgWinswitchPayloadOpened)
		this.config.inmsgWinswitchPayloadTilted = strToTypeFunc(node.inmsgWinswitchPayloadTiltedType, node.inmsgWinswitchPayloadTilted)
		this.config.inmsgWinswitchPayloadClosed = strToTypeFunc(node.inmsgWinswitchPayloadClosedType, node.inmsgWinswitchPayloadClosed)
		this.config.lat = strToTypeFunc("num", node.lat)
		this.config.lon = strToTypeFunc("num", node.lon)
		this.config.payloadOpenCmd = strToTypeFunc(node.payloadOpenCmdType, node.payloadOpenCmd)
		this.config.payloadCloseCmd = strToTypeFunc(node.payloadCloseCmdType, node.payloadCloseCmd)
		this.config.payloadStopCmd = strToTypeFunc(node.payloadStopCmdType, node.payloadStopCmd)
		this.config.shadingSetposShade = strToTypeFunc("num", node.shadingSetposShade)
		this.config.inmsgButtonDblclickTime = strToTypeFunc("num", node.inmsgButtonDblclickTime)
		
		this.config.heightFbTopic = node.heightFbTopic || "heightfeedback"
		this.config.inmsgButtonTopicOpen = node.inmsgButtonTopicOpen || "buttonup"
		this.config.inmsgButtonTopicClose = node.inmsgButtonTopicClose || "buttondown"
		this.config.openTopic = node.openTopic || "commandopen"
		this.config.shadeTopic = node.shadeTopic || "commandshade"
		this.config.closeTopic = node.closeTopic || "commandclose"
		this.config.heightTopic = node.heightTopic || "commandheight"
		this.config.inmsgWinswitchTopic = node.inmsgWinswitchTopic || "switch"
		this.config.inmsgButtonDblclickTime = node.inmsgButtonDblclickTime || 500

    }
	
    RED.nodes.registerType("shading configuration",ShadingConfigNode)

	
	/** Working node */
	function ShadingNode(node) {
		RED.nodes.createNode(this, node)
		const that = this
		/** This is the content of the associated configuration node, including all necessary conversions. */
		let config = {}
		config = RED.nodes.getNode(node.configSet).config

		// Definition of persistant variables
		let handle, handleRtHeightStarttime, sunTimes, lat, lon = null
		let sunriseFuncTimeoutHandle, sunsetFuncTimeoutHandle = null
		let nodeContext = that.context()
		let flowContext = that.context().flow
		let globalContext = that.context().global

		/** If this handle is not null, the drive runtime is running (aka drive is running). */
		let handleRtHeight = null
		/** This variable defines, if the blind closes, as soon as the window closes (due to config parameter 'preserve shade position'). */
		let closeIfWinCloses  = false
		/** If the configured runtime has elapsed, the drive will be sent to shade position. */
		let shadeIfTimeout  = false
		
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
			that.warn("W001: Cannot restore sensor states")
			context = {}
		}

		// Variable declaration
		
		/** Main loop interval [ms] in which the environment (sun position, temperatures, ...) will be checked. */
		const loopIntervalTime = 20000

		/** Positions [%] for shading commands
		 * @property {number} open Constant 0
		 * @property {number} shade The value set in the node configuration
		 * @property {number} close Constant 100
		 */
		const shadingSetpos = {
			open: 0,
			shade: config.shadingSetposShade,
			close: 100
		}

		/** Enum list for window swith position
		 * @property {number} opened Value 1
		 * @property {number} tilted Value 2
		 * @property {number} closed Value 3
		 */
		const window = {
			opened: 1,
			tilted: 2,
			closed: 3
		}

		var err = false

		/** The backed up state of sunrise being in the future */
		let sunriseAheadPrev = null
		/** The backed up state of sunet being in the future */
		let sunsetAheadPrev = null
		// Loading external modules


		// FUNCTIONS ====>


		/**
		 * This function sets all variables accordingly, so that automatic can be re-started.
		 */
		function autoReenableFunc() {
			if (config.autoActive) {
				context.autoLocked = false
				context.stateButtonRunning = false
				closeIfWinCloses = false
				calcSetposHeight(true)
				clearInterval(handle)										// Clear eventual previous loop
				handle = setInterval(mainLoopFunc, loopIntervalTime)		// Continuous interval run
			}
		}

		/**
		 * This function will write the relevant node's output.
		 * @param {String} a Payload for output 1 (opencommand)
		 * @param {String} b Payload for output 2 (closecommand)
		 * @param {String} c Payload for output 3 (resetcommand)
		 * @param {String} d Payload for output 4 (setpointcommand)
		 */
		function sendCommandFunc(a,b,c,d) {

			const callee = arguments.callee.name

			let msgA, msgB, msgC, msgD, msgE = null

			if (a != null) {
				msgA = {topic: "open", payload: a}
			} else msgA = null
			
			if (b != null) {
				msgB = {topic: "close", payload: b}
			} else msgB = null
			
			if (c != null) {
				msgC = {topic: "stop", payload: c}
			} else msgC = null
			
			if (d != null) {
				if (node.debug) {that.log("["+callee+"] Sending height setpoint '" + d + "'")}
				msgD = {topic: "command", payload: d}

				handleRtHeightStarttime = new Date().getTime()
				handleRtHeight = setTimeout(() => {
					that.warn("W009: Height runtime elapsed")
					if (shadeIfTimeout) {
						shadeIfTimeout = false
						closeIfWinCloses = true
						if (node.debug) {that.log("Going to shade position")}
						context.setposHeight = shadingSetpos.shade
						autoMoveFunc(true, true)
					}
				}, config.heightFbRt * 1000)

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

		}


		/** Checks if automatic movement is allowed and sends setpos values. Prior to that, context.setposHeight must be made available.
		 * This function must be called each time an automatic movement should processed.
		 * @param {Boolean} sendNow If true, the setpoint value will be sent. If false, the setpoint will be sent only if it differs from the actual position.
		 * @param {Boolean} ignoreAutoLocked If true, the setpoint will be sent even if context.autoLocked is active.
		 * @param {Boolean} ignoreWindow If true, the window position (and according security settings) will be ignored.
		 */
		function autoMoveFunc(sendNow, ignoreAutoLocked, ignoreWindow) {

			const caller = autoMoveFunc.caller.name
			const callee = arguments.callee.name
			// that.log("DEBUG: "+callee+" called from '"+caller+"'")

			if (typeof context.setposHeight != "number") {				// setposHeight is not a number
				that.error("E001: invalid setposHeight type ('" + typeof context.setposHeight + "') [" + caller + "]")
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
				if (context.setposHeightPrev == context.setposHeight && !sendNow) {
					// -- DEBUG: some useful lines for debugging -->
					// if (node.debug) {that.log("Not re-sending already sent setposHeight '" + context.setposHeight + "'")}
					return
				}
				
				// Sending console message
				else if (node.debug) {that.log("["+callee+"] " + "setposHeight: " + context.setposHeightPrev + " -> " + context.setposHeight)}

				// Getting hardlock state
				if (config.autoActive) {

					if (config.hardlockType === "flow") {
						context.hardlock = flowContext.get(config.hardlock)
					} else if (config.hardlockType === "global") {
						context.hardlock = globalContext.get(config.hardlock)
					} else if (config.hardlockType === "dis") {
						context.hardlock = false
					} else {
						that.error("E005: Undefined hardlock type")
					}

					if (typeof context.hardlock === "undefined") {
						that.warn("W003: Undefined hardlock variable at '" + config.hardlockType + "." + config.hardlock + "'.")
						context.hardlock = true
					} else if (typeof context.hardlock !== "boolean") {
						that.warn("W004: Hard lock variable not a boolean")
						context.hardlock = true
					}

				
				// Check if movement is allowed
				} else {
					context.hardlock = false
				}

				let allowLowering = 																// Check security conditions
					(context.windowState === window.opened && config.allowLoweringWhenOpened)
					|| (context.windowState === window.tilted && config.allowLoweringWhenTilted)
					|| context.windowState === window.closed
					|| !config.winswitchEnable
					|| ignoreWindow

				if (context.hardlock) {																	// Hardlock -> nothing will happen
					if (node.debug) {that.log("Locked by hardlock, nothing will happen.")}
				} else if (context.autoLocked && !ignoreAutoLocked) {									// Auto locked (off) -> nothing will happen
					if (node.debug) {that.log("Not in automatic mode, nothing will happen.")}
				} else if (!config.heightFbEnable) {								// No shading position feedback configured -> always move
					sendCommandFunc(null,null,null,context.setposHeight)
				} else if (typeof context.actposHeight == "undefined" && context.setposHeight === 0) {	// Actual height position unknown but setpos is 0 -> move up
					that.warn("W005: Unknown actual position, but rising is allowed.")
					sendCommandFunc(null,null,null,context.setposHeight)
				} else if (typeof context.actposHeight == "undefined" && !allowLowering) {				// Actual height position unknown where lowering is not allowed
					that.warn("W006: Unknown actual position. Nothing will happen.")
				} else if (typeof context.actposHeight == "undefined") {        // Actual height position unknown (setpos must be > 0)
					that.warn("W007: Unknown actual position")
					sendCommandFunc(null,null,null,context.setposHeight)
				} else if (context.setposHeight > context.actposHeight) {								// Lowering -> check conditions
					// Check plausibility of window switch
					if (!ignoreWindow && config.winswitchEnable && (!context.windowState || context.windowState < 1 || context.windowState > 3)) {
						that.warn("W008: Unknown or invalid window State. Nothing will happen.")
					} else if (allowLowering) {
						sendCommandFunc(null,null,null,context.setposHeight)
					} else {
						if (node.debug) {that.log("Actual window position prevents lowering, holding back command.")}
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


		/** Recalculates setposHeight
		 * @param {Boolean} sendNow Will be forwarded to autoMoveFunc
		 */
		function calcSetposHeight(sendNow) {

			const callee = arguments.callee.name
		
			sunInSkyFunc()
			
			if (context.sunInSky) {   			// This is the routine for daytime
				if (node.debug) {that.log("["+callee+"] Checking configuration for daytime")}
				if (config.openIfSunrise) {
					context.setposHeight = shadingSetpos.open
					autoMoveFunc(sendNow)
					return
				} else if (config.shadeIfSunrise) {
					context.setposHeight = config.shadingSetposShade
					autoMoveFunc(sendNow)
					return
				} else if (config.closeIfSunrise) {
					context.setposHeight = shadingSetpos.close
					autoMoveFunc(sendNow)
					return
				} else {
					if (node.debug) {that.log("["+callee+"] Nothing configured to happen on daytime")}
				}
			} else {        // This is the routine for nighttime
				if (node.debug) {that.log("["+callee+"] Checking configuration for nighttime")}
				if (config.openIfSunset) {
					context.setposHeight = shadingSetpos.open
					autoMoveFunc(sendNow)
					return
				} else if (config.shadeIfSunset) {
					context.setposHeight = config.shadingSetposShade
					autoMoveFunc(sendNow)
					return
				} else if (config.closeIfSunset) {
					context.setposHeight = shadingSetpos.close
					autoMoveFunc(sendNow)
					return
				}
				if (node.debug) {that.log("["+callee+"] Nothing configured to happen on nighttime")}
			}
		}

		/** This function is called on sunrise */
		function sunriseFunc() {
			suncalcFunc()
		}
		
		/** This function is called on sunset */
		function sunsetFunc() {
			suncalcFunc()
		}

		
		/** This function determines:
		 * @property {bool} context.sunriseAhead Sunrise is in the future
		 * @property {bool} context.sunsetAhead Sunset is in the future
		 * @property {bool} context.sunInSky Sun is in the sky (daytime) or not (nighttime) */
		function sunInSkyFunc() {
			actDate = new Date()								// Set to actual time
			
			if (!isValidDate(sunTimes.sunrise) || !isValidDate(sunTimes.sunset)) {
				that.error("E004: Suntimes calculator broken")
			}

			context.sunriseAhead = sunTimes.sunrise > actDate					// Sunrise is in the future
			context.sunsetAhead = sunTimes.sunset > actDate						// Sunset is in the future
			context.sunInSky = !context.sunriseAhead && context.sunsetAhead		// It's daytime

		}
		
		
		/** This is the loop function which will be processed only if automatic is enabled. It provides the almighty context.setposHeight. */
		function mainLoopFunc() {

			sunInSkyFunc()

			// -- DEBUG: some useful lines for debugging -->
			// that.log("DEBUG: actdate = " + actDate)
			// that.log("DEBUG: sunset = " + sunTimes.sunset)
			// that.log("DEBUG: sunsetAhead = " + context.sunsetAhead + ", sunsetAheadPrev = " + sunsetAheadPrev)

			// Sunrise event
			if (context.sunriseAhead === false && sunriseAheadPrev === true) {
				if (node.debug) {that.log("Now it's sunrise")}								// -> Send debug message
				if (config.autoIfSunrise) {
					if (node.debug) {that.log("Re-enabeling automatic")}
					autoReenableFunc()
				} else {
					calcSetposHeight()
				}
				updateNodeStatus()
			}
			
			// Sunset event
			else if (context.sunsetAhead === false && sunsetAheadPrev === true) {
				if (node.debug) {that.log("Now it's sunset")}								// -> Send debug message
				if (config.autoIfSunset) {
					if (node.debug) {that.log("Re-enabeling automatic")}
					autoReenableFunc()
				} else {
					calcSetposHeight()
				}
				updateNodeStatus()
			}

			// -- DEBUG: some useful lines for debugging -->
			// else {that.log("DEBUG: nothing to do\n\r\n\r")}

			// Backing up
			sunriseAheadPrev = context.sunriseAhead
			sunsetAheadPrev = context.sunsetAhead

			// Proceed sending if setpoint is valid
			if (context.setposHeight) {
				autoMoveFunc()
			}

			// Backing up context
			contextBackup()

		}


		/** This function prints config and context on the console. Add "message" to prefix a message. */
		function printConsoleDebug(message) {

			if (message) {
				that.log("========== DEBUGGING START ==========")
				console.log(message)
			}
			// console.log("\n::::: NODE :::::")
			// console.log(node)
			// console.log("\n::::: CONFIG :::::")
			// console.log(config)
			// console.log("\n::::: CONTEXT :::::")
			// console.log(context)
			// console.log("\n")
		}


		/** This function updates the node status. See https://nodered.org/docs/creating-nodes/status for more details.
		 * 
		 * // DOCME
		 * Description "fill" / "shape"
		 * grey: Automatic is disabled in configuration
		 * green dot: Automatic is configured and active (context.autoLocked is FALSE)
		 * red ring: Automatic is configured but inactive (context.autoLocked is TRUE)
		 * 
		 * Description "text"
		 * If automatic is configured: Part 1 = next sunrise or sunset. Else = Auto off.
		 * If drive feedback is enabled and a valid feedback has been received: Part 2 = that value.
		*/
		function updateNodeStatus() {

			function addZero(i) {
				if (i < 10) {i = "0" + i}
				return i
			}

			let fill, text
			let shape = "dot"

			if (config.autoActive) {

				if (context.autoLocked === false) {
					fill = "green"
					shape = "dot"
				} else {
					fill = "red"
					shape = "ring"
				}

				if (context.sunInSky) {
					text = "🌜 " + addZero(sunTimes.sunset.getHours()) + ":" + addZero(sunTimes.sunset.getMinutes())
				} else {
					text = "🌞 " + addZero(sunTimes.sunrise.getHours()) + ":" + addZero(sunTimes.sunrise.getMinutes())
				}

			} else {
				fill = "grey"
				text = "Auto off"
			}


			if (config.heightFbEnable && typeof context.actposHeight === "number") {
				text = text + " | Drive at " + context.actposHeight + "%"
			}
			
			that.status({fill: fill, shape: shape, text: text})

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
						that.error("E006: Cannot find valid sunrise or sunset times")
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

		}

		/** This function writes back the context */
		function contextBackup() {
			nodeContext.set("context", context)		// Backing up context
		}
	

		// <==== FUNCTIONS





		// FIRST RUN ACTIONS (INIT) ====>
		
		if (!config.heightFbEnable) {
			delete context.actposHeight
		}
		
		if (config.autoActive) {
			if (node.debug) {that.log("Automatic configured, starting interval.")}
			suncalcFunc()
			// sunInSkyFunc()		// Versuchsweise in calcsetposheight verschoben, kann dann weg wenn das passt.
			calcSetposHeight()
			mainLoopFunc()												// Trigger once as setInterval will fire first after timeout
			clearInterval(handle)										// Clear eventual previous loop
			handle = setInterval(mainLoopFunc, loopIntervalTime)		// Continuous interval run
		} else {
			clearTimeout(sunriseFuncTimeoutHandle)
			clearTimeout(sunsetFuncTimeoutHandle)
		}
		
		updateNodeStatus()		// Initially set node status

		setTimeout(() => {			// Seems to be necessary, otherwise the message will be sent before Node-RED "Started flows"
			sendCommandFunc()		// Providing status on startup
		}, 10);

		if (node.debug) {printConsoleDebug()}

		// <==== FIRST RUN ACTIONS (INIT)






		// MESSAGE EVENT ACTIONS ====>

		this.on('input', function(msg,send,done) {

			/** Storing peripheral states */
			if (msg.topic === config.inmsgButtonTopicOpen) {context.stateButtonOpen = msg.payload}
			else if (msg.topic === config.inmsgButtonTopicClose) {context.stateButtonClose = msg.payload}

			/** Resend event */
			var resendEvent = msg.topic === "resend"
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
			/** This event happens, when the drive sends the actual position. */
			var driveHeightEvent = config.heightFbEnable && msg.topic === config.heightFbTopic

			/** Open event based on incoming message topic */
			var openCommand = msg.topic === config.openTopic
			/** Shade event based on incoming message topic */
			var shadeCommand = msg.topic === config.shadeTopic
			/** Close event based on incoming message topic */
			var closeCommand = msg.topic === config.closeTopic
			/** Height setpoint command based on incoming message topic */
			var heightSetposCommand = msg.topic === config.heightTopic

			if (config.winswitchEnable) {
				/** Window switch event based on incoming message topic */
				var windowSwitchEvent = msg.topic === config.inmsgWinswitchTopic
				/** Window switch open event based on incoming message payload */
				var windowSwitchOpenEvent = msg.payload === config.inmsgWinswitchPayloadOpened
				/** Window switch tilt event based on incoming message payload */
				var windowSwitchTiltEvent = msg.payload === config.inmsgWinswitchPayloadTilted
				/** Window switch close event based on incoming message payload */
				var windowSwitchCloseEvent = msg.payload === config.inmsgWinswitchPayloadClosed
			}

			if (config.autoActive) {
				/** Auto re-enable event based on incoming message topic */
				var autoReenableEvent = config.autoIfMsgTopic && msg.topic === "auto"
			}

			if (buttonEvent) {

				closeIfWinCloses = false

				// Button open pressed
				if (buttonPressOpenEvent) {
					clearTimeout(context.buttonCloseTimeoutHandle)
					context.buttonCloseTimeoutHandle = null

					// Both buttons pressed detection -> enable automatic
					if (context.stateButtonClose && config.autoIfBothBtns) {
						if (node.debug) {that.log("Both buttons pressed (first 'down' then 'up')")}
						autoReenableEvent = true
					}
					
					// Single/double click detection
					else if (context.buttonOpenTimeoutHandle) {								// handle present -> must be second click
						
						// DOUBLE CLICK ACTIONS ==>
						if (node.debug) {that.log("Open doubleclick detected")}
						if (!context.autoLocked) {
							context.autoLocked = true
							if (node.debug) {that.log("Automatic disabled")}
						}
						clearTimeout(context.buttonOpenTimeoutHandle)
						context.buttonOpenTimeoutHandle = null
						sendCommandFunc(null,null,null,shadingSetpos.open)
						// <== DOUBLE CLICK ACTIONS
						
					} else {																// no handle present -> must be first click
						context.buttonOpenTimeoutHandle = setTimeout(function(){			// set timeout with function
							if (!context.autoLocked) {
								context.autoLocked = true
								if (node.debug) {that.log("Automatic disabled")}
							}
							clearTimeout(context.buttonOpenTimeoutHandle)
							context.buttonOpenTimeoutHandle = null
							if (context.stateButtonOpen) {									// button is still pressed -> must be a long click

								// LONG CLICK ACTIONS ==>
								if (node.debug) {that.log("Open longclick detected")}
								sendCommandFunc(config.payloadOpenCmd,null,null,null)
								context.stateButtonRunning = true
								// <== LONG CLICK ACTIONS
								
							} else {														// button not pressed anymore -> must be a single click
								
								// SINGLE CLICK ACTIONS ==>
  								if (node.debug) {that.log("Open singleclick detected")}
								if (context.actposHeight > shadingSetpos.shade) {
									sendCommandFunc(null,null,null,shadingSetpos.shade)
								} else {
									sendCommandFunc(null,null,null,shadingSetpos.open)
								}
								// <== SINGLE CLICK ACTIONS
							}
						}, config.inmsgButtonDblclickTime)
					}
					
				// Button close pressed
				} else if (buttonPressCloseEvent) {
					clearTimeout(context.buttonOpenTimeoutHandle)
					context.buttonOpenTimeoutHandle = null
				
					// Both buttons pressed detection -> enable automatic
					if (context.stateButtonOpen && config.autoIfBothBtns) {
						if (node.debug) {that.log("Both buttons pressed (first 'up' then 'down')")}
						autoReenableEvent = true
					}

					// Single/double click detection
					else if (context.buttonCloseTimeoutHandle) {
						
						// DOUBLE CLICK ACTIONS ==>
						if (node.debug) {that.log("Close doubleclick detected")}
						if (!context.autoLocked) {
							context.autoLocked = true
							if (node.debug) {that.log("Automatic disabled")}
						}
						clearTimeout(context.buttonCloseTimeoutHandle)
						context.buttonCloseTimeoutHandle = null
						sendCommandFunc(null,null,null,shadingSetpos.close)
						// <== DOUBLE CLICK ACTIONS
						
					} else {
						context.buttonCloseTimeoutHandle = setTimeout(function(){
							if (!context.autoLocked) {
								context.autoLocked = true
								if (node.debug) {that.log("Automatic disabled")}
							}
							clearTimeout(context.buttonCloseTimeoutHandle)
							context.buttonCloseTimeoutHandle = null
							if (context.stateButtonClose) {
								
								// LONG CLICK ACTIONS ==>
  								if (node.debug) {that.log("Close longclick detected")}
								sendCommandFunc(null,config.payloadCloseCmd,null,null)
								context.stateButtonRunning = true
								// <== LONG CLICK ACTIONS
								
							} else {
								
								// SINGLE CLICK ACTIONS ==>
  								if (node.debug) {that.log("Close singleclick detected")}
								if (context.actposHeight < shadingSetpos.shade) {
									sendCommandFunc(null,null,null,shadingSetpos.shade)
								} else {
									sendCommandFunc(null,null,null,shadingSetpos.close)
								}
								// <== SINGLE CLICK ACTIONS
							}
						}, config.inmsgButtonDblclickTime)
					}
					
				// Any button released
				} else if (buttonReleaseEvent && context.stateButtonRunning) {
					
					// BUTTONS RELEASED ACTIONS ==>
					if (node.debug) {that.log("Button released")}
					context.stateButtonRunning = false
					sendCommandFunc(null,null,config.payloadStopCmd,null)
					// <== BUTTONS RELEASED ACTIONS
				}
			}

			else if (windowSwitchEvent) {
				
				// Store previous state
				let oldStateStr = context.windowStateStr

				// Storing new state
				if (windowSwitchOpenEvent) {
					context.windowState = window.opened
					context.windowStateStr = "Opened"
				} else if (windowSwitchTiltEvent) {
					context.windowState = window.tilted
					context.windowStateStr = "Tilted"
				} else if (windowSwitchCloseEvent) {
					context.windowState = window.closed
					context.windowStateStr = "Closed"
				} else {
					context.windowState = null
					context.windowStateStr = "Unknown"
				}
				
				// Sending debug message
				if (node.debug) {that.log("Window switch event detected: " + oldStateStr + " -> "  + context.windowStateStr)}

				// Preserve shade position
				if ((windowSwitchOpenEvent || windowSwitchTiltEvent)		// AND Window was opened or tilted
				&& context.actposHeight > shadingSetpos.shade				// AND Actual position is below shade position
				&& config.preventClosing) {									// AND Preserve config parameter is set
					if (!handleRtHeight) {									// Drive is not moving
						context.setposHeight = shadingSetpos.shade			// New setpos is shade position
						closeIfWinCloses = true								// Set marker to close blind when window closes
						autoMoveFunc(true, true)							// Send command
					} else {												// Drive is moving
						shadeIfTimeout = true								// Set marker to shade blind when runtime elapses
					}
				}

				// Close shade if shade position was preserved
				else if (windowSwitchCloseEvent && closeIfWinCloses) {
					context.setposHeight = shadingSetpos.close
					autoMoveFunc(true, true)
					closeIfWinCloses = false
				}	

			}

			else if (openCommand) {
				if (node.debug) {that.log("Received command to open")}
				context.setposHeight = shadingSetpos.open
				autoMoveFunc(true,true)
				context.autoLocked = true
				closeIfWinCloses = false
			}
			
			else if (shadeCommand) {
				if (node.debug) {that.log("Received command to shade")}
				if (typeof context.windowState == "undefined") {
					if (node.debug) {that.log("Unknown window position. Nothing will happen.")}
				} else {
					context.setposHeight = shadingSetpos.shade
					if (config.allowForce && msg.commandforce === true) {
						if (node.debug) {that.log("msg.commandforce is set, window position will be ignored!")}
						autoMoveFunc(true,true,true)
					} else {
						autoMoveFunc(true,true)
					}
					context.autoLocked = true
					closeIfWinCloses = false
				}
			}
			
			else if (heightSetposCommand) {
				if (typeof msg.payload != "number") {that.error("E008: Setpoint in message must be of type 'number' (but is '" + typeof msg.payload + "')")}
				else if (msg.payload < 0 || msg.payload > 100) {that.error("E007: Setpoint in message must be between 0-100 (but is '" + msg.payload + "')")}
				else {
					if (node.debug) {that.log("Received height setpoint command '" + msg.payload + "'")}
					if (msg.payload == 100) {
						closeCommand = true
					} else {
						context.setposHeight = msg.payload
						context.autoLocked = true
						if (config.allowForce && msg.commandforce === true) {
							if (node.debug) {that.log("msg.commandforce is set, window position will be ignored!")}
							autoMoveFunc(true,true,true)
						} else {
							autoMoveFunc(true,true)
						}
					}
				}
			}
			
			else if (driveHeightEvent) {
				if (msg.payload >= 0 && msg.payload <= 100 && typeof msg.payload === "number") {
					let prevPos = context.actposHeight
					context.actposHeight = msg.payload
					context.setposHeightPrev = msg.payload
					if (handleRtHeight) {
						clearTimeout(handleRtHeight)
						handleRtHeight = null
						// closeIfWinCloses = false
						shadeIfTimeout = false
						if (node.debug) {
							that.log("Received new position: " + prevPos + " -> " + context.actposHeight + " (runtime " + ((new Date().getTime()) - handleRtHeightStarttime) + " ms)")
						}
					} else if (node.debug) {that.log("Received new position: " + prevPos + " -> " + context.actposHeight)}
				} else {
					that.warn("W002: Received invalid drive position '" + msg.payload + "'.")
				}
			}

			else if (resendEvent && false) {		// Disabled for now. No idea if and when this may be useful.
				if (node.debug) {that.log("Saw request to resend values")}
				autoMoveFunc(true)
			}

			else if (printConsoleDebugEvent) {
				printConsoleDebug("Debug requested, so here we go.")
			}

			if (closeCommand) {
				if (node.debug) {that.log("Received command to close")}

				if (config.allowForce && msg.commandforce === true) {
					if (node.debug) {that.log("msg.commandforce is set, window position will be ignored!")}
					context.setposHeight = shadingSetpos.close
					autoMoveFunc(true,true,true)
				} else if (typeof context.windowState == "undefined") {
					if (node.debug) {that.log("Unknown window position. Nothing will happen.")}
				} else if (config.preventClosing && context.windowState != window.closed) {
					if (node.debug) {that.log("Window is not closed, going to shade position instead.")}
					context.setposHeight = shadingSetpos.shade
					closeIfWinCloses = true
					autoMoveFunc(true,true)
				} else {
					context.setposHeight = shadingSetpos.close
					autoMoveFunc(true,true)
				}

				context.autoLocked = true
			}



			if (autoReenableEvent && config.autoActive) {
				if (node.debug) {that.log("Re-enabeling automatic due to manual request")}
				autoReenableFunc()
			}
			

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

			// Backing up context
			contextBackup()

		})





		// <==== MESSAGE EVENT ACTIONS
		





		// CLOSE EVENTS ====>

		this.on('close', function() {
			if (node.debug && !context.autoLocked && config.autoActive) {that.log("Stopping automatic interval")}
			clearInterval(handle)
		})

		// <==== CLOSE EVENTS

	}

    RED.nodes.registerType("shading",ShadingNode)
}