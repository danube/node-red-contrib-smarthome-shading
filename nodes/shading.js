module.exports = function(RED) {

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
		
		var that = this;

		let config = originalConfig;
		config.set = RED.nodes.getNode(originalConfig.configSet).config;
		if (config.autoActive) {
			config.automatic = RED.nodes.getNode(originalConfig.configAutomatic).config;
			config.location = RED.nodes.getNode(RED.nodes.getNode(originalConfig.configAutomatic).config.config).config;
		}
		
		let nodeContext = that.context();
		/**
		 * The nodes context object
		 * @property {object} context The context object
		 * @property {Number} context.windowState 1 = opened, 2 = tilted, 3 = closed
		 * @property {Bool} context.autoLocked If set, no automatic actios will be fired
		 * @property {Bool} context.stateButtonOpen Button open is pressed
		 * @property {Bool} context.stateButtonClose Button close is pressed
		 * @property {Bool} context.stateButtonRunning Any button has been pressed and action is running
		 * @property {Number} context.buttonCloseTimeoutHandle Handle for the close button single press timer
		 * @property {Number} context.buttonOpenTimeoutHandle Handle for the open button single press timer
		 */
		let context = nodeContext.get("context");

		if (!context) {
			if (config.debug) {
				that.warn("No context to restore, so sensor states are unknown. See https://nodered.org/docs/user-guide/context#saving-context-data-to-the-file-system how to save states.");
			}
			context = {};
		}

		const loopIntervalTime = 5000;		// Node loop interval
		const dblClickTime = 500;			// Waiting time for second button press		// TODO Zeit konfigurierbar machen
		const shadingSetposOpen = 0;
		const shadingSetposClose = 100;

		var loopIntervalHandle;
		let prevDateString, sunriseAheadPrev, sunsetAheadPrev, sunTimes = null;
		
		var initDone, err = false;
		var suncalc = require("suncalc");	// https://www.npmjs.com/package/suncalc#reference

		/**
		 * This function will write the relevant node's output.
		 * @param {String} a Payload for output 1 (opencommand)
		 * @param {String} b Payload for output 2 (closecommand)
		 * @param {String} c Payload for output 3 (resetcommand)
		 * @param {String} d Payload for output 4 (setpointcommand)
		 */
		function sendCmdFunc(a,b,c,d) {
			
			var msgA, msgB, msgC, msgD = null;
			const debug = {
				config: originalConfig,
				myconfig: config,
				context: context
			}
			if (a != null) {
				msgA = {topic: "opencommand", payload: a};
				if (config.debug) {
					msgA = {topic: msgA.topic, payload: msgA.payload, debug: debug}
				}
			};
			if (b != null) {
				msgB = {topic: "closecommand", payload: b};
				if (config.debug) {
					msgB = {topic: msgB.topic, payload: msgB.payload, debug: debug}
				}
			};
			if (c != null) {
				msgC = {topic: "resetcommand", payload: c};
				if (config.debug) {
					msgC = {topic: msgC.topic, payload: msgC.payload, debug: debug}
				}
			};
			if (d != null) {
				msgD = {topic: "setpointcommand", payload: d};
				if (config.debug) {
					msgD = {topic: msgD.topic, payload: msgD.payload, debug: debug}
				}
			};
			that.send([msgA, msgB, msgC, msgD]);
		}

		/** Checks if automatic movement is allowed and sends setpos values */
		function checkAndSendFunc() {
			if (context.setposHeight < context.actposHeight) {										// Lowering
				if (context.windowState === 3) {														// Window closed
					sendCmdFunc(null,null,null,context.setposHeight)
				} else if (context.windowState === 2 && config.automatic.allowLoweringWhenTilted) {		// Window tilted
					sendCmdFunc(null,null,null,context.setposHeight)
				} else if (context.windowState === 1 && config.automatic.allowLoweringWhenOpened) {		// Window open
					sendCmdFunc(null,null,null,context.setposHeight)
				}
			} else if (context.setposHeight >= context.actposHeight) {								// Rising
				sendCmdFunc(null,null,null,context.setposHeight)
			}
		}



		/**
		 * Performing actions depending on sunrise or sunset or any of it. 
		 * @param {String} what Must be either "sunrise" or "sunset"
		 * @todo Sollwerte auch verfügbar machen, wenn autoLocked, damit bei Unlock diese angefahren werden können.
		 */
		function sunRiseSetFunc(what) {
			if (config.automatic.behButtonLocksUntil === "sunriseset") {autoReenableFunc()};
			if (context.autoLocked) {return};
			if (what === "sunrise") {
				if (originalConfig.debug) {that.log("Now it's sunrise")};
				if (config.automatic.behSunrise === "open") {context.setposHeight = shadingSetposOpen}
				else if (config.automatic.behSunrise === "shade") {context.setposHeight = config.set.shadingSetposShade}
				else if (config.automatic.behSunrise === "close") {context.setposHeight = shadingSetposClose};
			} else if (what === "sunset") {
				if (originalConfig.debug) {that.log("Now it's sunset")};
				if (config.automatic.behSunset === "open") {context.setposHeight = shadingSetposOpen}
				else if (config.automatic.behSunset === "shade") {context.setposHeight = config.set.shadingSetposShade}
				else if (config.automatic.behSunset === "close") {context.setposHeight = shadingSetposClose};
			}
		}

		/** This function checks if the parameter is a valid date type
		 * https://stackoverflow.com/questions/1353684/detecting-an-invalid-date-date-instance-in-javascript
		 */
		function isValidDate(d) {
			return d instanceof Date && !isNaN(d);
		}

		function suncalcFunc(date) {
			return suncalc.getTimes(date, config.location.lat, config.location.lon);
		}

		/** This function releases the automatic lock and sends a log message, if debugging is enabled. */
		function autoReenableFunc() {
			if (config.debug && context.autoLocked) {that.log("Automatic enabled")}
			context.autoLocked = false;
			checkAndSendFunc();
		}

		/** This is the loop function which will be processed only if automatic is enabled. */
		function mainloopFunc(){
			const actDate = new Date();
			
			if (prevDateString) {
				const prevDate = new Date(prevDateString);
				if (prevDate.getDay() != actDate.getDay()) {
					sunTimes = suncalcFunc(actDate);
				};
			} else {
				sunTimes = suncalcFunc(actDate);
			}

			if (!isValidDate(sunTimes.sunrise) || !isValidDate(sunTimes.sunset)) {
				return -1;		// TODO break, something is wrong;
			}
			
			let sunriseAhead = sunTimes.sunrise > actDate;
			let sunsetAhead = sunTimes.sunset > actDate;

			if (sunriseAhead === false && sunriseAheadPrev === true) {
				sunRiseSetFunc("sunrise");
			} else if (sunsetAhead === false && sunsetAheadPrev === true) {
				sunRiseSetFunc("sunset");
			}
			
			prevDateString = actDate.toISOString();
			sunriseAheadPrev = sunriseAhead;
			sunsetAheadPrev = sunsetAhead;

		}


		// FIRST RUN ACTIONS ====>

		// Set replacement values for optional fields
		config.set.inmsgButtonTopicOpen = originalConfig.set.inmsgButtonTopicOpen || "openbutton";
		config.set.inmsgButtonTopicClose = originalConfig.set.inmsgButtonTopicClose || "closebutton";
		config.automatic.inmsgWinswitchTopic = originalConfig.set.inmsgWinswitchTopic || "switch";
		if (config.autoActive) {
			config.automatic.inmsgTopicAutoReenable = originalConfig.automatic.inmsgTopicAutoReenable || "auto";
		};
	
		// Converting typed inputs
		if (config.automatic.inmsgWinswitchPayloadOpenedType === 'num') {config.automatic.inmsgWinswitchPayloadOpened = Number(originalConfig.automatic.inmsgWinswitchPayloadOpened)}
		else if (config.automatic.inmsgWinswitchPayloadOpenedType === 'bool') {config.automatic.inmsgWinswitchPayloadOpened = originalConfig.automatic.inmsgWinswitchPayloadOpened === 'true'}
		if (config.automatic.inmsgWinswitchPayloadTiltedType === 'num') {config.automatic.inmsgWinswitchPayloadTilted = Number(originalConfig.automatic.inmsgWinswitchPayloadTilted)}
		else if (config.automatic.inmsgWinswitchPayloadTiltedType === 'bool') {config.automatic.inmsgWinswitchPayloadTilted = originalConfig.automatic.inmsgWinswitchPayloadTilted === 'true'}
		if (config.automatic.inmsgWinswitchPayloadClosedType === 'num') {config.automatic.inmsgWinswitchPayloadClosed = Number(originalConfig.automatic.inmsgWinswitchPayloadClosed)}
		else if (config.automatic.inmsgWinswitchPayloadClosedType === 'bool') {config.automatic.inmsgWinswitchPayloadClosed = originalConfig.automatic.inmsgWinswitchPayloadClosed === 'true'}
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
			mainloopFunc();														// Trigger once as setInterval will fire first after timeout
			loopIntervalHandle = setInterval(mainloopFunc, loopIntervalTime);	// Continuous interval run
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



			if (buttonEvent) {
				if (config.debug && !context.autoLocked) {that.log("Automatic disabled")}
				context.autoLocked = true;

				// Button open pressed
				if (buttonPressOpenEvent) {
					clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;

					// Single/double click detection
					if (context.buttonOpenTimeoutHandle) {
						
						// DOUBLE CLICK ACTIONS ==>
						clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
						sendCmdFunc(null,null,null,shadingSetposOpen);
						// <== DOUBLE CLICK ACTIONS

					} else {
						context.buttonOpenTimeoutHandle = setTimeout(function(){
							clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
							if (context.stateButtonOpen) {

								// SINGLE CLICK ACTIONS ==>
								sendCmdFunc(originalConfig.set.payloadOpenCmd,null,null,null);
								context.stateButtonRunning = true;
								// <== SINGLE CLICK ACTIONS
								
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
						sendCmdFunc(null,null,null,shadingSetposClose);
						// <== DOUBLE CLICK ACTIONS
						
					} else {
						context.buttonCloseTimeoutHandle = setTimeout(function(){
							clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;
							if (context.stateButtonClose) {
								
								// SINGLE CLICK ACTIONS ==>
								sendCmdFunc(null,originalConfig.set.payloadCloseCmd,null,null);
								context.stateButtonRunning = true;
								// <== SINGLE CLICK ACTIONS
								
							}
						}, dblClickTime);
					}
					
				// Open/close button released
				} else if (buttonReleaseEvent && context.stateButtonRunning) {
					
					// BUTTONS RELEASED ACTIONS -->
					context.stateButtonRunning = false;
					sendCmdFunc(null,null,originalConfig.set.payloadStopCmd,null);
				}
			}
			else if (windowEvent) {
				/** Storing context values */
				if (config.debug) {that.log("DEBUG: Window switch event detected")};
				if (msg.payload === config.automatic.inmsgWinswitchPayloadOpened) {context.windowState = 1} else
				if (msg.payload === config.automatic.inmsgWinswitchPayloadTilted) {context.windowState = 2} else
				if (msg.payload === config.automatic.inmsgWinswitchPayloadClosed) {context.windowState = 3};
			}
			else if (autoReenableEvent) {
				autoReenableFunc()
			}
			else if (driveHeightEvent) {
				if (msg.payload >= 0 && msg.payload <= 100 && typeof msg.payload === "number") {
					context.actposHeight = msg.payload;
				} else {
					that.warn("W001: Actual drive position must be number between 0 and 100, but received '" + msg.payload + "'.")
				}
			};



			if (err) {
				if (done) {
					// Node-RED 1.0 compatible
					done(err);
				} else {
					// Node-RED 0.x compatible
					this.error(err,msg);
				}
			}

			if (config.debug) {
				console.log("DEBUG: Message:");
				console.log(msg);
				console.log("DEBUG: Context:");
				console.log(context);
				console.log("\n");
			}
			
		});


		// <==== MESSAGE EVENT ACTIONS
		
		nodeContext.set("context", context);		// Backing up context
	

	}

    RED.nodes.registerType("shading",ShadingNode);
}