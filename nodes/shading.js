module.exports = function(RED) {

	// Definition of persistant variables
	let handle = null;

    function ShadingAutomaticNode(config) {
		RED.nodes.createNode(this,config);
		this.config = config;
    }
    RED.nodes.registerType("shading automatic",ShadingAutomaticNode);

    function ShadingLocationNode(config) {
		RED.nodes.createNode(this,config);
		this.config = config;
    }
    RED.nodes.registerType("shading location",ShadingLocationNode);

    function ShadingConfigNode(config) {
        RED.nodes.createNode(this,config);
		this.config = config;
    }
    RED.nodes.registerType("shading configuration",ShadingConfigNode);

	function ShadingNode(originalConfig) {

		RED.nodes.createNode(this,originalConfig);

			
		const that = this;
		let config = originalConfig;

		config.set = RED.nodes.getNode(originalConfig.configSet).config;
		if (config.autoActive) {
			config.automatic = RED.nodes.getNode(originalConfig.configAutomatic).config;
			config.location = RED.nodes.getNode(RED.nodes.getNode(originalConfig.configAutomatic).config.config).config;
		}
		
		let nodeContext = that.context();
		let flowContext = that.context().flow;
		let globalContext = that.context().global;
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
		let context = nodeContext.get("context");
		if (!context) {
			if (config.debug) {
				that.warn("W002: No context to restore, so sensor states are unknown. See https://nodered.org/docs/user-guide/context#saving-context-data-to-the-file-system how to save states.");
			}
			context = {};
		}

		// Variable declaration
		const loopIntervalTime = 5000;
		const dblClickTime = 500;			// Waiting time for second button press		// TODO Zeit konfigurierbar machen

		const shadingSetpos = {
			open: 0,
			shade: Number(originalConfig.set.shadingSetposShade),
			close: 100
		}

		const window = {
			opened: 1,
			tilted: 2,
			closed: 3
		}

		let sunTimes = null;
		var err = false;
		let loopCounter = 0;

		/** The backed up time as ISO string */
		let dateStringPrev = null;
		/** The backed up state of sunrise being in the future */
		let sunriseAheadPrev = null;
		/** The backed up state of sunet being in the future */
		let sunsetAheadPrev = null;
		/** The actual time as date object */
		let actDate = new Date();
		// Loading external modules
		var suncalc = require("suncalc");	// https://www.npmjs.com/package/suncalc#reference





		// FUNCTIONS ====>


		/**
		 * This function will write the relevant node's output.
		 * @param {String} a Payload for output 1 (opencommand)
		 * @param {String} b Payload for output 2 (closecommand)
		 * @param {String} c Payload for output 3 (resetcommand)
		 * @param {String} d Payload for output 4 (setpointcommand)
		 */
		function sendCommandFunc(a,b,c,d) {
			
			let msgA, msgB, msgC, msgD = null;
			if (a != null) {
				msgA = {topic: "opencommand", payload: a};
				if (config.debug) {msgA = {topic: msgA.topic, payload: msgA.payload}}		// TODO debug dran hängen
			};
			if (b != null) {
				msgB = {topic: "closecommand", payload: b};
				if (config.debug) {msgB = {topic: msgB.topic, payload: msgB.payload}}
			};
			if (c != null) {
				msgC = {topic: "resetcommand", payload: c};
				if (config.debug) {msgC = {topic: msgC.topic, payload: msgC.payload}}
			};
			if (d != null) {
				msgD = {topic: "setpointcommand", payload: d};
				if (config.debug) {msgD = {topic: msgD.topic, payload: msgD.payload}}
			};
			that.send([msgA, msgB, msgC, msgD])
			that.log("New output values have been written.")
			console.log([msgA, msgB, msgC, msgD])
		}


		/** Checks if automatic movement is allowed and sends setpos values.
		 * This function MUST be called each time an automatic movement should processed.
		 * @param {Boolean} sendNow If true, the setpoint value will be sent. If false, the setpoint will be sent only if it changes.
		 * @param {Boolean} ignoreHardlock If true, the setpoint will be sent even if hardlock is active.
		 */
		function autoMoveFunc(sendNow, ignoreHardlock) {
			if (context.setposHeightPrev == context.setposHeight && !sendNow) {return}
			else if (config.debug) {that.log("New setposHeight is '" + context.setposHeight + "'")}

			if (config.autoActive) {
				if (config.automatic.hardlockType === "flow") {context.hardlock = flowContext.get(config.automatic.hardlock)}
				else if (config.automatic.hardlockType === "global") {context.hardlock = globalContext.get(config.automatic.hardlock)}
				else if (config.automatic.hardlockType === "dis") {context.hardlock = false}
				else {that.err("E003: Undefined hardlock type")}
				if (typeof context.hardlock === "undefined") {
					that.warn("W003: Undefined hard lock variable at '" + config.automatic.hardlockType + "." + config.automatic.hardlock + "'. Assuming false until set.")
					context.hardlock = false
				} else if (typeof context.hardlock !== "boolean") {
					that.warn("W004: Hard lock variable at '" + config.automatic.hardlockType + "." + config.automatic.hardlock + "' defined but not a boolean. Assuming false until set.")
					context.hardlock = false
				}
			} else {
				context.hardlock = false
			}
	
			if (ignoreHardlock) {if (config.debug) {that.log("Hardlock will be ignored, as you configured.")}}


			if (context.hardlock && !ignoreHardlock) {												// Hardlock
				if (config.debug) {that.log("Locked by hardlock, nothing will happen.")}

			} else if (context.autoLocked) {														// Softlock
				if (config.debug) {that.log("Locked by application, nothing will happen.")}
				


			} else if (typeof context.actposHeight == "undefined" && context.setposHeight === 0) {						// Actual height position unknown but setpos is 0
				that.warn("Unknown actual position, but rising may be allowed.")
				sendCommandFunc(null,null,null,context.setposHeight)

				

			} else if (typeof context.actposHeight == "undefined") {								// Actual height position unknown
				that.warn("Unknown actual position. Nothing will happen.")

			
			
			
			} else if (context.setposHeight > context.actposHeight) {								// Lowering
				
				// check plausibility of window switch position
				if (config.automatic.winswitchEnable && (!context.windowState || context.windowState < 1 || context.windowState > 3)) {
					that.warn("Unknown or invalid window State (open/tilted/closed). Nothing will happen.")
				}

				/** Allow lowering after checking security conditions */
				let allowLowering = 
					(context.windowState === window.opened && config.automatic.allowLoweringWhenOpened)
					|| (context.windowState === window.tilted && config.automatic.allowLoweringWhenTilted)
					|| context.windowState === window.closed
					|| !config.automatic.winswitchEnable

				if (allowLowering) {
					sendCommandFunc(null,null,null,context.setposHeight)
				} else {
					if (config.debug) {that.log("Lowering not allowed. Check window switch. Nothing will happen.")}
				}

			}

			context.setposHeightPrev = context.setposHeight
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
		function suncalcFunc(date) {
			return suncalc.getTimes(date, config.location.lat, config.location.lon)
		}
	


		/** This is the loop function which will be processed only if automatic is enabled. */
		function mainLoopFunc(){

			actDate = new Date()								// Set to actual time
			suncalcDate = new Date().setHours(12,0,0)
			
			if (dateStringPrev) {								// We have a previous date already backed up
				const prevDate = new Date(dateStringPrev)		// Convert string to date object
				if (prevDate.getDate() != actDate.getDate()) {	// A new day has arrived
					sunTimes = suncalcFunc(suncalcDate)			// Get new suncalc values and simulate noon
					if (config.debug) {
						that.log("A new day has arrived! Here comes sunTimes:")
						console.log(sunTimes)
					}
				}
			} else {											// This must be the first cycle
				sunTimes = suncalcFunc(suncalcDate);			// Get new suncalc values and simulate noon
				if (config.debug) {
					that.log("This is the first cycle. Here comes sunTimes: ")
					console.log(sunTimes)
				}
			}

			if (!isValidDate(sunTimes.sunrise) || !isValidDate(sunTimes.sunset)) {
				that.err("E002: Something is seriously broken with the suntimes calculator. Please consult the developer!")
			}

			if (actDate >= sunTimes.sunrise && actDate < sunTimes.sunset) {		// Daytime
				if (config.automatic.openIfSunrise) {context.setposHeight = shadingSetpos.open}
				else if (config.automatic.shadeIfSunrise) {context.setposHeight = config.set.shadingSetposShade}
				else if (config.automatic.closeIfSunrise) {context.setposHeight = shadingSetpos.close}
			} else {															// Nighttime
				if (config.automatic.openIfSunset) {context.setposHeight = shadingSetpos.open}
				else if (config.automatic.shadeIfSunset) {context.setposHeight = config.set.shadingSetposShade}
				else if (config.automatic.closeIfSunset) {context.setposHeight = shadingSetpos.close}
			}

			/** Sunrise is in the future */
			let sunriseAhead = sunTimes.sunrise > actDate		// Sunrise is in the future
			/** Sunset is in the future */
			let sunsetAhead = sunTimes.sunset > actDate			// Sunset is in the future

			// Unlock automatic
			if (sunriseAhead === false && sunriseAheadPrev === true) {			// Sunrise
				if (config.debug) {that.log("Now it's sunrise")}				// Send debug message
				if (config.automatic.autoIfSunrise && context.autoLocked) {		// Check if lock needs to be released
					context.autoLocked = false									// Release lock
					if (config.debug) {that.log("Automatic re-enabled")}		// Send debug message
				}
			} else if (sunsetAhead === false && sunsetAheadPrev === true) {		// Sunset
				if (config.debug) {that.log("Now it's sunset")}					// Send debug message
				if (config.automatic.autoIfSunset && context.autoLocked) {		// Check if lock needs to be released
					context.autoLocked = false									// Release lock
					if (config.debug) {that.log("Automatic re-enabled")}		// Send debug message
				}
			}

			// Backing up
			dateStringPrev = actDate.toISOString()
			sunriseAheadPrev = sunriseAhead
			sunsetAheadPrev = sunsetAhead

			autoMoveFunc()

		}


		// <==== FUNCTIONS





		// FIRST RUN ACTIONS ====>

		// Filling empty string fields with defaults
		config.set.inmsgButtonTopicOpen = originalConfig.set.inmsgButtonTopicOpen || "openbutton"
		config.set.inmsgButtonTopicClose = originalConfig.set.inmsgButtonTopicClose || "closebutton"
		if (config.autoActive) {
			config.automatic.inmsgTopicActPosHeight = originalConfig.automatic.inmsgTopicActPosHeight || "heightfeedback"
			config.automatic.autoTopic = config.automatic.autoTopic || "auto"
			if (config.automatic.winswitchEnable) {
				config.automatic.inmsgWinswitchTopic = originalConfig.automatic.inmsgWinswitchTopic || "switch"
			}
		}
		
		// Converting typed inputs
		if (config.autoActive && config.automatic.winswitchEnable) {
			if (config.automatic.inmsgWinswitchPayloadOpenedType === 'num') {config.automatic.inmsgWinswitchPayloadOpened = Number(originalConfig.automatic.inmsgWinswitchPayloadOpened)}
			else if (config.automatic.inmsgWinswitchPayloadOpenedType === 'bool') {config.automatic.inmsgWinswitchPayloadOpened = originalConfig.automatic.inmsgWinswitchPayloadOpened === 'true'}
			if (config.automatic.inmsgWinswitchPayloadTiltedType === 'num') {config.automatic.inmsgWinswitchPayloadTilted = Number(originalConfig.automatic.inmsgWinswitchPayloadTilted)}
			else if (config.automatic.inmsgWinswitchPayloadTiltedType === 'bool') {config.automatic.inmsgWinswitchPayloadTilted = originalConfig.automatic.inmsgWinswitchPayloadTilted === 'true'}
			if (config.automatic.inmsgWinswitchPayloadClosedType === 'num') {config.automatic.inmsgWinswitchPayloadClosed = Number(originalConfig.automatic.inmsgWinswitchPayloadClosed)}
			else if (config.automatic.inmsgWinswitchPayloadClosedType === 'bool') {config.automatic.inmsgWinswitchPayloadClosed = originalConfig.automatic.inmsgWinswitchPayloadClosed === 'true'}
		}
		if (config.set.payloadOpenCmdType === 'num') {config.set.payloadOpenCmd = Number(originalConfig.set.payloadOpenCmd)}
		else if (config.set.payloadOpenCmdType === 'bool') {config.set.payloadOpenCmd = originalConfig.set.payloadOpenCmd === 'true'}
		if (config.set.payloadCloseCmdType === 'num') {config.set.payloadCloseCmd = Number(originalConfig.set.payloadCloseCmd)}
		else if (config.set.payloadCloseCmdType === 'bool') {config.set.payloadCloseCmd = originalConfig.set.payloadCloseCmd === 'true'}
		if (config.set.payloadStopCmdType === 'num') {config.set.payloadStopCmd = Number(originalConfig.set.payloadStopCmd)}
		else if (config.set.payloadStopCmdType === 'bool') {config.set.payloadStopCmd = originalConfig.set.payloadStopCmd === 'true'}

		config.set.shadingSetposShade = shadingSetpos.shade
		
		// Show config and context on console
		if (config.debug) {
			console.log("Debugging is enabled in the node properties. Here comes config:")
			console.log(config)
			console.log("Debugging is enabled in the node properties. Here comes context:")
			console.log(context)
		}

		// Main loop
		if (config.autoActive) {
			mainLoopFunc();		// Trigger once as setInterval will fire first after timeout
			clearInterval(handle);		// Clear eventual previous loop
			handle = setInterval(mainLoopFunc, loopIntervalTime);		// Continuous interval run
		}
		
		// Initially set node status
		if (!config.automatic.winswitchEnable) {
			that.status({})
		} else {
			that.status({fill: "blue", shape: "ring", text: context.windowStateStr})
		}

		// <==== FIRST RUN ACTIONS






		// MESSAGE EVENT ACTIONS ====>

		this.on('input', function(msg,send,done) {
			
			/** Storing peripheral states */
			if (msg.topic === config.set.inmsgButtonTopicOpen) {context.stateButtonOpen = msg.payload}
			else if (msg.topic === config.set.inmsgButtonTopicClose) {context.stateButtonClose = msg.payload}; // TODO logical verification, like drive height position

			/** Resend event */
			var resendEvent = msg.topic === "resend";										// TODO in documentation
			/** Button open/close event based on incoming message topic */
			var buttonEvent = msg.topic === config.set.inmsgButtonTopicOpen || msg.topic === config.set.inmsgButtonTopicClose;
			/** Button press event based on incoming message topic, if payload is TRUE */
			var buttonPressEvent = buttonEvent && msg.payload === true;
			/** Button press open event */
			var buttonPressOpenEvent = msg.topic === config.set.inmsgButtonTopicOpen && msg.payload === true;
			/** Button press close event */
			var buttonPressCloseEvent = msg.topic === config.set.inmsgButtonTopicClose && msg.payload === true;
			/** Button release event based on incoming message topic, if payload is FALSE */
			var buttonReleaseEvent = buttonEvent && msg.payload === false;
			
			if (config.autoActive) {
				/** Window switch event based on incoming message topic */
				var windowEvent = config.automatic.winswitchEnable && msg.topic === config.automatic.inmsgWinswitchTopic
				/** Auto re-enable event based on incoming message topic */
				var autoReenableEvent = config.automatic.autoIfMsgTopic && msg.topic === config.automatic.autoTopic
				/** Height drive position event based on incoming message topic */
				var driveHeightEvent = msg.topic === config.automatic.inmsgTopicActPosHeight
			}

			if (buttonEvent) {

				// Disable automatic
				if (config.debug && !context.autoLocked) {that.log("Automatic disabled")}
				context.autoLocked = true;

				// Button open pressed
				if (buttonPressOpenEvent) {
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
								sendCommandFunc(config.set.payloadOpenCmd,null,null,null);
								context.stateButtonRunning = true;
								// <== LONG CLICK ACTIONS
								
							}
						}, dblClickTime);
					}
					
				// Button close pressed
				} else if (buttonPressCloseEvent) {
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
								sendCommandFunc(null,config.set.payloadCloseCmd,null,null);
								context.stateButtonRunning = true;
								// <== LONG CLICK ACTIONS
								
							}
						}, dblClickTime);
					}
					
				// Any button released
				} else if (buttonReleaseEvent && context.stateButtonRunning) {
					
					// BUTTONS RELEASED ACTIONS ==>
					context.stateButtonRunning = false;
					sendCommandFunc(null,null,config.set.payloadStopCmd,null);
					// <== BUTTONS RELEASED ACTIONS
				}
			}



			else if (windowEvent) {
				let oldState = context.windowState;
				let oldStateStr = context.windowStateStr;

				// Storing context values
				if (msg.payload === config.automatic.inmsgWinswitchPayloadOpened) {
					context.windowState = window.opened
					context.windowStateStr = "opened"
				} else if (msg.payload === config.automatic.inmsgWinswitchPayloadTilted) {
					context.windowState = window.tilted
					context.windowStateStr = "tilted"
				} else if (msg.payload === config.automatic.inmsgWinswitchPayloadClosed) {
					context.windowState = window.closed
					context.windowStateStr = "closed"
				} else {
					context.windowState = null
					context.windowStateStr = "unknown"
				}

				// Sending node status
				that.status({fill: "blue", shape: "ring", text: context.windowStateStr})

				// Sending debug message
				if (config.debug) {that.log("Window switch event detected: " + oldStateStr + " -> "  + context.windowStateStr)}

				// Re-enable automatic
				let reenable = (
					(config.automatic.autoIfWinOpenToTilt && oldState == window.opened && context.windowState == window.tilted)
					|| (config.automatic.autoIfWinClosed && context.windowState == window.closed)
				)
				if (reenable) {
					if (config.debug) {that.log("Re-enabeling automatic due to window switch event")}
					context.autoLocked = false
					autoMoveFunc(true)
				}

				// Move up when window opens
				if (context.windowState == window.opened && config.automatic.openIfWinOpen) {
					context.setposHeight = shadingSetpos.open
					autoMoveFunc(true)
				}

				// Shade when window opens and shading is closed
				if (context.windowState == window.opened && config.automatic.shadeIfWinOpen && context.actposHeight > shadingSetpos.shade) {		// TODO workaround wenn es keine actposHeight gibt
					context.setposHeight = shadingSetpos.shade
					if (config.automatic.shadeIfWinOpenOverrideHardlock) {
						autoMoveFunc(true,true)
						that.log("DEBUG: 111")
					} else {
						autoMoveFunc(true)
						that.log("DEBUG: 222")
					}
				}
				
			}




			else if (autoReenableEvent) {
				if (config.debug) {that.log("Re-enabeling automatic due to manual request")}
				context.autoLocked = false
				autoMoveFunc(true)
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
				if (config.debug) {that.log("Saw request to resend values")}
				autoMoveFunc(true)
			}



			// ONLY FOR DEBUGGING ====>
			
			if (msg.frcSunrise) {
				that.warn("Sunrise value overwritten")
				sunTimes.sunrise = new Date(msg.frcSunrise)
			};

			if (msg.frcSunset) {
				that.warn("Sunset value overwritten")
				sunTimes.sunset = new Date(msg.frcSunset)
			};

			if (msg.frcSunauto) {
				that.warn("Sunrise and sunset values valid")
				actDate = new Date()
				suncalcFunc(actDate)
			};

			if (msg.debug) {
				actDate = new Date();
				const debug = {
					timeUTC: actDate.toISOString(),
					timeLocale: actDate.toLocaleString(),
					originalConfig: originalConfig,
					config: config,
					context: context,
					sunTimes: sunTimes
				}
				console.log(debug);
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

			// if (config.debug) {
			// 	console.log("DEBUG: Message:");
			// 	console.log(msg);
			// 	console.log("DEBUG: Context:");
			// 	console.log(context);
			// 	console.log("\n");
			// }
			
		});


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