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
		const shadingSetposOpen = 0;
		const shadingSetposClose = 100;
		
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
		/** Sunrise is in the future */
		let sunriseAhead;
		/** Sunset is in the future */
		let sunsetAhead;
		/** Hard lock */
		context.hardlock = null;
		if (config.automatic.hardlock && config.automatic.hardlockType) {
			if (config.automatic.hardlockType === "flow") {context.hardlock = flowContext.get(config.automatic.hardlock)}
			else if (config.automatic.hardlockType === "global") {context.hardlock = globalContext.get(config.automatic.hardlock)}
			if (typeof context.hardlock === "undefined") {
				that.warn("W003: Undefined hard lock variable at '" + config.automatic.hardlockType + "." + config.automatic.hardlock + "'. Assuming false until set.")
			} else if (typeof context.hardlock !== "boolean") {
				that.warn("W004: Hard lock variable at '" + config.automatic.hardlockType + "." + config.automatic.hardlock + "' defined but not a boolean. Assuming false until set.")
			}
		}

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
			that.send([msgA, msgB, msgC, msgD]);
		}


		/** Checks if automatic movement is allowed and sends setpos values.
		 * This function MUST be called each time an automatic movement should processed.
		 * @returns {Boolean} true if allowed, false if not.
		 */
		function checkAutoMoveAllowedFunc() {
			if (context.hardlock) {
				return false
			} else if (context.setposHeight < context.actposHeight) {		// Lowering
				if (context.windowState === 3) {
					return true												// Window closed
				} else if (context.windowState === 2 && config.automatic.allowLoweringWhenTilted) {
					return true												// Window tilted
				} else if (context.windowState === 1 && config.automatic.allowLoweringWhenOpened) {
					return true												// Window open
				}
			} else if (context.setposHeight >= context.actposHeight) {		// Rising
				return true
			} else {
				return false
			}
		}
		

		/**
		 * Performing actions depending on sunrise or sunset or any of it. 
		 * @param {String} what Must be either "sunrise" or "sunset"
		 */
		function prepareAutoposFunc(what) {
			if (what === "sunrise") {
				if (config.auto.autoIfSunrise) {context.autoLocked = false};
				if (config.debug) {that.log("Automatic enabled")}
				if (!context.autoLocked) {
					if (config.debug) {that.log("Now it's sunrise")};
					if (config.automatic.openIfSunrise) {context.setposHeight = shadingSetposOpen}
					else if (config.automatic.shadeIfSunrise) {context.setposHeight = config.set.shadingSetposShade}
					else if (config.automatic.closeIfSunrise) {context.setposHeight = shadingSetposClose};
					if (checkAutoMoveAllowedFunc()) {sendCommandFunc(null,null,null,context.setposHeight)}
				}
			} else if (what === "sunset") {
				if (config.auto.autoIfSunset) {context.autoLocked = false};
				if (config.debug) {that.log("Automatic enabled")}
				if (!context.autoLocked) {
					if (config.debug) {that.log("Now it's sunset")};
					if (config.automatic.openIfSunset) {context.setposHeight = shadingSetposOpen}
					else if (config.automatic.shadeIfSunset) {context.setposHeight = config.set.shadingSetposShade}
					else if (config.automatic.closeIfSunset) {context.setposHeight = shadingSetposClose};
					if (checkAutoMoveAllowedFunc()) {sendCommandFunc(null,null,null,context.setposHeight)}
				}
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
		function suncalcFunc(date) {return suncalc.getTimes(date, config.location.lat, config.location.lon)}
	

		/** This is the loop function which will be processed only if automatic is enabled. */
		function mainloopFunc(){
			actDate = new Date();		// Set to actual time
			suncalcDate = new Date().setHours(12,0,0);
			
			if (dateStringPrev) {								// We have a previous date already backed up
				const prevDate = new Date(dateStringPrev);		// Convert string to date object
				if (prevDate.getDate() != actDate.getDate()) {	// A new day has arrived
					sunTimes = suncalcFunc(suncalcDate);		// Get new suncalc values and simulate noon
					if (config.debug) {
						that.log("A new day has arrived! Here comes sunTimes:");
						console.log(sunTimes);
					}
				};
			} else {											// This must be the first cycle
				sunTimes = suncalcFunc(suncalcDate);			// Get new suncalc values and simulate noon
				if (config.debug) {
					that.log("This is the first cycle. Here comes sunTimes: ")
					console.log(sunTimes);
				}
			}

			if (!isValidDate(sunTimes.sunrise) || !isValidDate(sunTimes.sunset)) {return -1}		// TODO break, something is wrong;
			
			/** Sunrise is in the future */
			sunriseAhead = sunTimes.sunrise > actDate;
			/** Sunset is in the future */
			sunsetAhead = sunTimes.sunset > actDate;

			// if (config.debug) {
			// 	that.log("Date: " + actDate.toLocaleString() + ", Sunrise: " + sunTimes.sunrise.toLocaleString() + ", Sunset: " + sunTimes.sunset.toLocaleString());
			// }

			if (sunriseAhead === false && sunriseAheadPrev === true) {			// Now it's sunrise
				prepareAutoposFunc("sunrise");
			} else if (sunsetAhead === false && sunsetAheadPrev === true) {		// Now it's sunset
				prepareAutoposFunc("sunset");
			}
			
			// Backing up
			dateStringPrev = actDate.toISOString();
			sunriseAheadPrev = sunriseAhead;
			sunsetAheadPrev = sunsetAhead;

		}


		// <==== FUNCTIONS





		// FIRST RUN ACTIONS ====>

		// Filling empty string fields with defaults
		config.set.inmsgButtonTopicOpen = originalConfig.set.inmsgButtonTopicOpen || "openbutton";
		config.set.inmsgButtonTopicClose = originalConfig.set.inmsgButtonTopicClose || "closebutton";
		config.automatic.inmsgTopicAutoReenable = originalConfig.automatic.inmsgTopicAutoReenable || "auto";
		config.automatic.inmsgTopicActPosHeight = originalConfig.automatic.inmsgTopicActPosHeight || "heightfeedback";
		config.automatic.inmsgWinswitchTopic = originalConfig.automatic.inmsgWinswitchTopic || "switch";

		// Converting typed inputs
		if (config.automatic.inmsgWinswitchPayloadOpenedType === 'num') {config.automatic.inmsgWinswitchPayloadOpened = Number(originalConfig.automatic.inmsgWinswitchPayloadOpened)}
		else if (config.automatic.inmsgWinswitchPayloadOpenedType === 'bool') {config.automatic.inmsgWinswitchPayloadOpened = originalConfig.automatic.inmsgWinswitchPayloadOpened === 'true'}

		if (config.automatic.inmsgWinswitchPayloadTiltedType === 'num') {config.automatic.inmsgWinswitchPayloadTilted = Number(originalConfig.automatic.inmsgWinswitchPayloadTilted)}
		else if (config.automatic.inmsgWinswitchPayloadTiltedType === 'bool') {config.automatic.inmsgWinswitchPayloadTilted = originalConfig.automatic.inmsgWinswitchPayloadTilted === 'true'}
		
		if (config.automatic.inmsgWinswitchPayloadClosedType === 'num') {config.automatic.inmsgWinswitchPayloadClosed = Number(originalConfig.automatic.inmsgWinswitchPayloadClosed)}
		else if (config.automatic.inmsgWinswitchPayloadClosedType === 'bool') {config.automatic.inmsgWinswitchPayloadClosed = originalConfig.automatic.inmsgWinswitchPayloadClosed === 'true'}
		
		if (config.set.payloadOpenCmdType === 'num') {config.set.payloadOpenCmd = Number(originalConfig.set.payloadOpenCmd)}
		else if (config.set.payloadOpenCmdType === 'bool') {config.set.payloadOpenCmd = originalConfig.set.payloadOpenCmd === 'true'}

		if (config.set.payloadCloseCmdType === 'num') {config.set.payloadCloseCmd = Number(originalConfig.set.payloadCloseCmd)}
		else if (config.set.payloadCloseCmdType === 'bool') {config.set.payloadCloseCmd = originalConfig.set.payloadCloseCmd === 'true'}
		
		if (config.set.payloadStopCmdType === 'num') {config.set.payloadStopCmd = Number(originalConfig.set.payloadStopCmd)}
		else if (config.set.payloadStopCmdType === 'bool') {config.set.payloadStopCmd = originalConfig.set.payloadStopCmd === 'true'}

		config.set.shadingSetposShade = Number(originalConfig.set.shadingSetposShade);
		
		// Show config and context on console
		if (config.debug) {
			console.log("Debugging is enabled in the node properties. Here comes config:");
			console.log(config);
			console.log("Debugging is enabled in the node properties. Here comes context:");
			console.log(context);
		}

		// Main loop
		if (config.autoActive) {
			mainloopFunc();		// Trigger once as setInterval will fire first after timeout
			clearInterval(handle);		// Clear eventual previous loop
			handle = setInterval(mainloopFunc, loopIntervalTime);		// Continuous interval run
		}
		
		// <==== FIRST RUN ACTIONS






		// MESSAGE EVENT ACTIONS ====>

		this.on('input', function(msg,send,done) {
			
			/** Storing peripheral states */
			if (msg.topic === config.set.inmsgButtonTopicOpen) {context.stateButtonOpen = msg.payload}
			else if (msg.topic === config.set.inmsgButtonTopicClose) {context.stateButtonClose = msg.payload}; // TODO logical verification, like drive height position

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
				var windowEvent = msg.topic === config.automatic.inmsgWinswitchTopic;
				/** Auto re-enable event based on incoming message topic */
				var autoReenableEvent = msg.topic === config.automatic.inmsgTopicAutoReenable;
				/** Height drive position event based on incoming message topic */
				var driveHeightEvent = msg.topic === config.automatic.inmsgTopicActPosHeight;
			}

			console.log("DEBUG: topic = " + msg.topic);
			console.log("DEBUG: inmsgWinswitchTopic = " + config.automatic.inmsgWinswitchTopic);



			if (buttonEvent) {

				// Sending debug message
				if (config.debug && !context.autoLocked) {that.log("Automatic disabled")}		// TODO irgendwo automatic enabled senden
				context.autoLocked = true;

				// Button open pressed
				if (buttonPressOpenEvent) {
					clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;

					// Single/double click detection
					if (context.buttonOpenTimeoutHandle) {
						
						// DOUBLE CLICK ACTIONS ==>
						clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
						sendCommandFunc(null,null,null,shadingSetposOpen);		// TODO stimmt das??
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
						sendCommandFunc(null,null,null,shadingSetposClose);
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
				
				console.log("DEBUG: window event")
				let oldState = context.windowStateStr;

				// Storing context values
				if (msg.payload === config.automatic.inmsgWinswitchPayloadOpened) {
					context.windowState = 1
					context.windowStateStr = "open"
				} else if (msg.payload === config.automatic.inmsgWinswitchPayloadTilted) {
					context.windowState = 2
					context.windowStateStr = "tilted"
				} else if (msg.payload === config.automatic.inmsgWinswitchPayloadClosed) {
					context.windowState = 3
					context.windowStateStr = "close"
				} else {
					context.windowState = null
					context.windowStateStr = "unknown"
				};

				if (config.debug) {
					that.log("Window switch event detected: " + oldState + " -> "  + context.windowStateStr)
				}

				// Process
				// TODO Define window event process
			}



			else if (autoReenableEvent) {
				// TODO Define auto reenable event process
			}



			else if (driveHeightEvent) {
				if (msg.payload >= 0 && msg.payload <= 100 && typeof msg.payload === "number") {
					let prevPos = context.actposHeight;
					context.actposHeight = msg.payload;
					that.log("New shading position detected: " + prevPos + " -> " + context.actposHeight)
				} else {
					that.warn("W001: Actual drive position must be number between 0 and 100, but received '" + msg.payload + "'.")
				}
			};





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
				actDate = new Date();
				suncalcFunc(actDate);
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