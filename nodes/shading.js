// TODO auto ist gelocked, wenn taster gedrückt werden. Dann fährt nichts mehr, auch nicht wenn ein command kommt. ist autolocked wirklich noch nötig?
// TODO Error, Warnung, Info Nummern prüfen
// TODO console log DEBUG entfernen
// TODO verstecke DEBUG Option
// TODO schön die Uhrzeit beim node status formatieren (dzt. zb. 9:8 für 09:08)
// TODO Schlafen Modus überlegen


module.exports = function(RED) {

	// Definition of persistant variables
	let handle = null


	/** Config node */
    function ShadingConfigNode(node) {
        RED.nodes.createNode(this,node)

		console.log("DEBUG: CONFIG NODE")
		console.log(node)
		
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
		
		this.config = node
		
    }
	
	
	/** Working node */
    RED.nodes.registerType("shading configuration",ShadingConfigNode)
	
	function ShadingNode(node) {
		RED.nodes.createNode(this,node)
		const cfg = RED.nodes.getNode(node.configSet).config
		const that = this
		
		let nodeContext = that.context()
		let flowContext = that.context().flow
		let globalContext = that.context().global
		
		console.log("DEBUG: WORKING NODE")
		console.log(cfg)
		/**
		 * The nodes context object
		 * @property {Number} windowState 1 = opened, 2 = tilted, 3 = closed
		 * @property {Bool} autoLocked If set, no automatic actios will be fired
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
		const loopIntervalTime = 5000;

		const shadingSetpos = {
			open: 0,
			shade: cfg.shadingSetposShade,
			close: 100
		}

		const window = {
			opened: 1,
			tilted: 2,
			closed: 3
		}

		let sunTimes = null
		var err = false
		let loopCounter = 0

		/** The backed up time as ISO string */
		let dateStringPrev = null
		/** The backed up state of sunrise being in the future */
		let sunriseAheadPrev = null
		/** The backed up state of sunet being in the future */
		let sunsetAheadPrev = null
		/** The actual time as date object */
		let actDate = new Date()
		// Loading external modules
		var suncalc = require("suncalc")	// https://www.npmjs.com/package/suncalc#reference

		// FUNCTIONS ====>


		/**
		 * This function will write the relevant node's output.
		 * @param {String} a Payload for output 1 (opencommand)
		 * @param {String} b Payload for output 2 (closecommand)
		 * @param {String} c Payload for output 3 (resetcommand)
		 * @param {String} d Payload for output 4 (setpointcommand)
		 */
		function sendCommandFunc(a,b,c,d) {
			
			let msgA, msgB, msgC, msgD, msgE = null;

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
					automatic: cfg.autoActive && !context.autoLocked,
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
		 * @param {Boolean} ignoreHardlock If true, the setpoint will be sent even if hardlock is active.
		 */
		function autoMoveFunc(sendNow, ignoreHardlock) {

			if (typeof context.setposHeight != "number") {				// setposHeight is not a number
				that.error("E001: setposHeight is not valid (" + context.setposHeight + ")")
				return
			}
			else if (context.setposHeight < 0) {						// setposHeight is negative
				that.error("E001: setposHeight is negative (" + context.setposHeight + ")")
				return
			}
			else if (context.setposHeight > 100) {						// setposHeight is above 100
				that.error("E001: setposHeight is above 100 (" + context.setposHeight + ")")
				return
			} else {

				// Check for new setposHeight and sendNow
				if (context.setposHeightPrev == context.setposHeight && !sendNow) {return}
				
				// Sending console message
				else if (node.debug) {that.log("setposHeight: " + context.setposHeightPrev + " -> " + context.setposHeight)}

				// Getting hardlock state
				if (cfg.autoActive) {
					if (cfg.hardlockType === "flow") {context.hardlock = flowContext.get(cfg.hardlock)}
					else if (cfg.hardlockType === "global") {context.hardlock = globalContext.get(cfg.hardlock)}
					else if (cfg.hardlockType === "dis") {context.hardlock = false}
					else {that.error("E003: Undefined hardlock type")}
					if (typeof context.hardlock === "undefined") {
						that.warn("W003: Undefined hard lock variable at '" + cfg.hardlockType + "." + cfg.hardlock + "'. Assuming false until set.")
						context.hardlock = false
					} else if (typeof context.hardlock !== "boolean") {
						that.warn("W004: Hard lock variable at '" + cfg.hardlockType + "." + cfg.hardlock + "' defined but not a boolean. Assuming false until set.")
						context.hardlock = false
					}
				} else {
					context.hardlock = false
				}

				if (ignoreHardlock) {if (node.debug) {that.log("Hardlock will be ignored, as you configured.")}}

				let allowLowering = 																// Check security conditions
					(context.windowState === window.opened && cfg.allowLoweringWhenOpened)
					|| (context.windowState === window.tilted && cfg.allowLoweringWhenTilted)
					|| context.windowState === window.closed
					|| !cfg.winswitchEnable

				if (context.hardlock && !ignoreHardlock) {												// Hardlock -> nothing will happen
					if (node.debug) {that.log("Locked by hardlock, nothing will happen.")}
				} else if (context.autoLocked) {														// Softlock -> nothing will happen
					if (node.debug) {that.log("Locked by application, nothing will happen.")}
				} else if (cfg.inmsgTopicActPosHeightType === "dis") {							// No shading position feedback -> always move
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
					if (cfg.winswitchEnable && (!context.windowState || context.windowState < 1 || context.windowState > 3)) {		// Check plausibility of window switch
						that.warn("Unknown or invalid window State (open/tilted/closed). Nothing will happen.")		// TODO move this to another position, i.e. window switch event detection
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
			return suncalc.getTimes(new Date().setHours(12,0,0), cfg.lat, cfg.lon)
		}
	


		/** Recalculates setposHeight */
		function calcSetposHeight() {
			if (node.debug) {that.log("Calculating new setposHeight")}
			if (context.sunInSky) {																					// Daytime ->
				if (cfg.openIfSunrise) {context.setposHeight = shadingSetpos.open}							// open
				else if (cfg.shadeIfSunrise) {context.setposHeight = cfg.shadingSetposShade}			// shade
				else if (cfg.closeIfSunrise) {context.setposHeight = shadingSetpos.close}					// close
			} else {																								// Nighttime ->
				if (cfg.openIfSunset) {context.setposHeight = shadingSetpos.open}							// open
				else if (cfg.shadeIfSunset) {context.setposHeight = cfg.shadingSetposShade}			// shade
				else if (cfg.closeIfSunset) {context.setposHeight = shadingSetpos.close}						// close
			}
			autoMoveFunc()
		}


		/** This is the loop function which will be processed only if automatic is enabled. It provides the almighty context.setposHeight. */
		function mainLoopFunc(){

			actDate = new Date()								// Set to actual time
			let init = false

			if (dateStringPrev) {								// We have a previous date already backed up
				const prevDate = new Date(dateStringPrev)		// Convert string to date object
				if (prevDate.getDate() != actDate.getDate()) {	// A new day has arrived
					sunTimes = suncalcFunc()					// Get new suncalc values and simulate noon
					if (node.debug) {
						that.log("A new day has arrived! Here comes sunTimes:")
						console.log(sunTimes)
					}
				}
			} else {											// This must be the first cycle
				sunTimes = suncalcFunc();						// Get new suncalc values and simulate noon
				if (node.debug) {
					console.log("\n::::: SUNTIMES :::::")
					console.log(sunTimes)
					console.log("\n")
				}
				init = true
			}

			if (!isValidDate(sunTimes.sunrise) || !isValidDate(sunTimes.sunset)) {
				that.error("E002: Suntimes calculator seems broken. Please consult the developer!")
			}

			context.sunriseAhead = sunTimes.sunrise > actDate		// Sunrise is in the future
			context.sunsetAhead = sunTimes.sunset > actDate			// Sunset is in the future
			context.sunInSky = !context.sunriseAhead && context.sunsetAhead			// It's daytime

			if (init) {
				calcSetposHeight()
			}

			// Sunrise event
			if (context.sunriseAhead === false && sunriseAheadPrev === true) {
				if (node.debug) {that.log("Now it's sunrise")}													// -> Send debug message
				calcSetposHeight()
				if (cfg.autoIfSunrise && context.autoLocked) {												// -> Check if lock needs to be released
					context.autoLocked = false
					if (node.debug) {that.log("Automatic re-enabled")}											// -> Send debug message
				}
				updateNodeStatus()
			}
			
			// Sunset event
			else if (context.sunsetAhead === false && sunsetAheadPrev === true) {
				if (node.debug) {that.log("Now it's sunset")}														// -> Send debug message
				calcSetposHeight()
				if (cfg.autoIfSunset && context.autoLocked) {												// -> Check if lock needs to be released
					context.autoLocked = false																		// -> Release lock
					if (node.debug) {that.log("Automatic re-enabled")}											// -> Send debug message
				}
				updateNodeStatus()
			}

			// Backing up
			dateStringPrev = actDate.toISOString()
			sunriseAheadPrev = context.sunriseAhead
			sunsetAheadPrev = context.sunsetAhead

			// Proceed sending if setpoint is valid
			if (context.setposHeight) {autoMoveFunc()}

		}


		/** This function prints config and context on the console. Add "message" to prefix a message. */
		function printConsoleDebug(message) {
			return // TODO ENTFERNEN WENN FERTIG
			that.log("========== DEBUGGING START ==========")
			if (message) {
				console.log(message)
			}
			console.log("\n::::: CONFIG :::::")
			console.log(config)
			console.log("\n::::: CONTEXT :::::")
			console.log(context)
			if (sunTimes) {
				console.log("\n::::: SUNTIMES :::::")
				console.log(sunTimes)
				console.log("\n")
			}
		}


		/** This function updates the node status. See https://nodered.org/docs/creating-nodes/status for more details. */
		function updateNodeStatus() {

			let fill = "grey"
			let shape = "dot"
			let text = "Auto off"

			function addZero(i) {
				if (i < 10) {i = "0" + i}
				return i
			  }

			if (cfg.autoActive) {
				text = context.setposHeight + "%"
				if (context.sunInSky) {
					text = text + " | 🌜 " + addZero(sunTimes.sunset.getHours()) + ":" + addZero(sunTimes.sunset.getMinutes())
				} else {
					text = text + " | 🌞 " + addZero(sunTimes.sunrise.getHours()) + ":" + addZero(sunTimes.sunrise.getMinutes())
				}
				if (context.autoLocked) {fill = "red"} else {fill = "green"}
			}
			
			if (cfg.autoActive && cfg.winswitchEnable && context.windowStateStr) {
				text = text + " | " + context.windowStateStr
			}
			
			that.status({fill: fill, shape: shape, text: text})

		}

		// <==== FUNCTIONS





		// FIRST RUN ACTIONS ====>

		// Filling empty string fields with defaults
		cfg.inmsgButtonTopicOpen = cfg.inmsgButtonTopicOpen || "buttonup"
		cfg.inmsgButtonTopicClose = cfg.inmsgButtonTopicClose || "buttondown"
		if (cfg.autoActive) {
			cfg.autoTopic = cfg.autoTopic || "auto"
			cfg.openTopic = cfg.openTopic || "commandopen"
			cfg.shadeTopic = cfg.shadeTopic || "commandshade"
			cfg.closeTopic = cfg.closeTopic || "commandclose"
			if (cfg.winswitchEnable) {
				cfg.inmsgWinswitchTopic = cfg.inmsgWinswitchTopic || "switch"
			}
		}
		

		cfg.inmsgButtonDblclickTime = cfg.inmsgButtonDblclickTime | 500;

		cfg.shadingSetposShade = shadingSetpos.shade
		
		// Show config and context on console
		if (node.debug) {printConsoleDebug()}

		// Main loop
		if (cfg.autoActive) {
			mainLoopFunc()		// Trigger once as setInterval will fire first after timeout
			clearInterval(handle)		// Clear eventual previous loop
			handle = setInterval(mainLoopFunc, loopIntervalTime)		// Continuous interval run
		}
		
		updateNodeStatus()		// Initially set node status
		sendCommandFunc()		// Providing status

		// <==== FIRST RUN ACTIONS






		// MESSAGE EVENT ACTIONS ====>

		this.on('input', function(msg,send,done) {
			
			/** Storing peripheral states */
			if (msg.topic === cfg.inmsgButtonTopicOpen) {context.stateButtonOpen = msg.payload}
			else if (msg.topic === cfg.inmsgButtonTopicClose) {context.stateButtonClose = msg.payload}; // TODO logical verification, like drive height position

			/** Resend event */
			var resendEvent = msg.topic === "resend";										// TODO in documentation
			/** Button open/close event based on incoming message topic */
			var buttonEvent = msg.topic === cfg.inmsgButtonTopicOpen || msg.topic === cfg.inmsgButtonTopicClose;
			/** Button press event based on incoming message topic, if payload is TRUE */
			var buttonPressEvent = buttonEvent && msg.payload === true;
			/** Button press open event */
			var buttonPressOpenEvent = msg.topic === cfg.inmsgButtonTopicOpen && msg.payload === true;
			/** Button press close event */
			var buttonPressCloseEvent = msg.topic === cfg.inmsgButtonTopicClose && msg.payload === true;
			/** Button release event based on incoming message topic, if payload is FALSE */
			var buttonReleaseEvent = buttonEvent && msg.payload === false;
			/** Debug on console request */
			var printConsoleDebugEvent = msg.debug;

			if (cfg.autoActive) {
				/** Window switch event based on incoming message topic */
				var windowSwitchEvent = cfg.winswitchEnable && msg.topic === cfg.inmsgWinswitchTopic
				/** Auto re-enable event based on incoming message topic */
				var autoReenableEvent = cfg.autoIfMsgTopic && msg.topic === cfg.autoTopic
				/** Open event based on incoming message topic */
				var openCommand = msg.topic === cfg.openTopic
				/** Shade event based on incoming message topic */
				var shadeCommand = msg.topic === cfg.shadeTopic
				/** Close event based on incoming message topic */
				var closeCommand = msg.topic === cfg.closeTopic
				/** Height drive position event based on incoming message topic */
				var driveHeightEvent = cfg.inmsgTopicActPosHeightType != "dis" && msg.topic === cfg.inmsgTopicActPosHeight
			}

			if (buttonEvent) {

				// Button open pressed
				if (buttonPressOpenEvent) {
					context.autoLocked = true
					if (node.debug) {that.log("Automatic disabled")}
					clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;

					// Single/double click detection
					if (context.buttonOpenTimeoutHandle) {
						
						// DOUBLE CLICK ACTIONS ==>
						clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
						sendCommandFunc(null,null,null,shadingSetpos.open);
						// <== DOUBLE CLICK ACTIONS

					} else {
						context.buttonOpenTimeoutHandle = setTimeout(function(){
							clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
							if (context.stateButtonOpen) {

								// LONG CLICK ACTIONS ==>
								sendCommandFunc(cfg.payloadOpenCmd,null,null,null);
								context.stateButtonRunning = true;
								// <== LONG CLICK ACTIONS
								
							}
						}, cfg.inmsgButtonDblclickTime);
					}
					
				// Button close pressed
				} else if (buttonPressCloseEvent) {
					context.autoLocked = true
					if (node.debug) {that.log("Automatic disabled")}
					clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
				
					// Single/double click detection
					if (context.buttonCloseTimeoutHandle) {
						
						// DOUBLE CLICK ACTIONS ==>
						clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;
						sendCommandFunc(null,null,null,shadingSetpos.close);
						// <== DOUBLE CLICK ACTIONS
							
					} else {
						context.buttonCloseTimeoutHandle = setTimeout(function(){
							clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;
							if (context.stateButtonClose) {
								
								// LONG CLICK ACTIONS ==>
								sendCommandFunc(null,cfg.payloadCloseCmd,null,null);
								context.stateButtonRunning = true;
								// <== LONG CLICK ACTIONS
								
							}
						}, cfg.inmsgButtonDblclickTime);
					}
					
				// Any button released
				} else if (buttonReleaseEvent && context.stateButtonRunning) {
					
					// BUTTONS RELEASED ACTIONS ==>
					context.stateButtonRunning = false;
					sendCommandFunc(null,null,cfg.payloadStopCmd,null);
					// <== BUTTONS RELEASED ACTIONS
				}
			}

			else if (windowSwitchEvent) {
				
				let oldState = context.windowState;
				let oldStateStr = context.windowStateStr;

				// Storing context values
				if (msg.payload === cfg.inmsgWinswitchPayloadOpened) {
					context.windowState = window.opened
					context.windowStateStr = "opened"
				} else if (msg.payload === cfg.inmsgWinswitchPayloadTilted) {
					context.windowState = window.tilted
					context.windowStateStr = "tilted"
				} else if (msg.payload === cfg.inmsgWinswitchPayloadClosed) {
					context.windowState = window.closed
					context.windowStateStr = "closed"
				} else {
					context.windowState = null
					context.windowStateStr = "unknown"
				}

				// Return if window switch state is unknown or unchanged (filter)
				if (oldState == context.windowState || !oldState) {return}
				
				// Sending debug message
				if (node.debug) {that.log("Window switch event detected: " + oldStateStr + " -> "  + context.windowStateStr)}

				// Re-enable automatic
				let reenable = (
					(cfg.autoIfWinOpenToTilt && oldState == window.opened && context.windowState == window.tilted)
					|| (cfg.autoIfWinClosed && context.windowState == window.closed)
				)
				if (reenable) {
					if (node.debug) {that.log("Re-enabeling automatic due to window switch event")}
					context.autoLocked = false
					autoMoveFunc(true)
				}

				// Move up when window opens
				if (context.windowState == window.opened && cfg.openIfWinOpen) {
					context.setposHeight = shadingSetpos.open
					autoMoveFunc(true)
				}

				// Shade when window opens and shading is closed
				// if (context.windowState == window.opened && cfg.shadeIfWinOpen && context.actposHeight > shadingSetpos.shade) {		// TODO workaround wenn es keine actposHeight gibt
				// 	context.setposHeight = shadingSetpos.shade
				// 	if (cfg.shadeIfWinOpenOverrideHardlock) {
				// 		autoMoveFunc(true,true)
				// 	} else {
				// 		autoMoveFunc(true)
				// 	}
				// }
				
			}

			else if (autoReenableEvent) {
				if (node.debug) {that.log("Re-enabeling automatic due to manual request")}
				context.autoLocked = false
				calcSetposHeight()
				context.stateButtonRunning = false
				autoMoveFunc(true)
			}
			
			else if (openCommand){
				if (node.debug) {that.log("Received command to open")}
				context.setposHeight = shadingSetpos.open
				autoMoveFunc(true)
				context.autoLocked = true
			}
			
			else if (shadeCommand){
				if (node.debug) {that.log("Received command to shade")}
				context.setposHeight = shadingSetpos.shade
				autoMoveFunc(true)
				context.autoLocked = true
			}
			
			else if (closeCommand){
				if (node.debug) {that.log("Received command to close")}
				context.setposHeight = shadingSetpos.close
				autoMoveFunc(true)
				context.autoLocked = true
			}

			else if (driveHeightEvent) {				// TODO Was wenn es das nicht gibt??
				if (msg.payload >= 0 && msg.payload <= 100 && typeof msg.payload === "number") {
					let prevPos = context.actposHeight;
					context.actposHeight = msg.payload;
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
				that.warn("Sunrise value overwritten")
				console.log("\n::::: SUNTIMES :::::")
				console.log(sunTimes)
				console.log("\n")

			}
			
			else if (msg.frcSunset) {
				sunTimes.sunset = new Date(msg.frcSunset)
				that.warn("Sunset value overwritten")
				console.log("\n::::: SUNTIMES :::::")
				console.log(sunTimes)
				console.log("\n")
			}
			
			else if (msg.frcSunauto) {
				that.warn("Sunrise and sunset values reset")
				dateStringPrev = null;
				mainLoopFunc();
			}
			
			else if (node.debug) {
				that.log("Unknown message with topic '" + msg.topic + "'")
			}
			
			// <==== ONLY FOR DEBUGGING

			
			

			if (err) {
				if (done) {
					// Node-RED 1.0 compatible
					done(err);
				} else {
					// Node-RED 0.x compatible
					this.error(err,msg);
				}
			}

			// Updating node status
			updateNodeStatus()

			// Providing status
			sendCommandFunc()

		})


		// <==== MESSAGE EVENT ACTIONS
		




		nodeContext.set("context", context);		// Backing up context

		



		// CLOSE EVENTS ====>

		this.on('close', function() {
			clearInterval(handle);
		})

		// <==== CLOSE EVENTS

	}

    RED.nodes.registerType("shading",ShadingNode);
}