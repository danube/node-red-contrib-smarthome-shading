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
	
	function ShadingNode(config) {

		RED.nodes.createNode(this,config);
		
		/** The nodes context object */
		var context = this.context();
		var that = this;
		let myconfig = config;
		
		const loopIntervalTime = 5000;		// Node loop interval
		const dblClickTime = 1000;			// Waiting time for second button press		// TODO Zeit konfigurierbar machen
		var loopIntervalHandle;
		
		var initDone, err = false;
		var SunCalc = require("suncalc");
		var actDate = new Date();

		myconfig.set = RED.nodes.getNode(config.configSet).config;
		if (myconfig.autoActive) {
			myconfig.automatic = RED.nodes.getNode(config.configAutomatic).config;
			myconfig.location = RED.nodes.getNode(RED.nodes.getNode(config.configAutomatic).config.config).config;
		}
		
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
				msg: context.msg,
				config: config,
				myconfig: myconfig,
				context: context
			}
			if (a != null) {
				msgA = {topic: "opencommand", payload: a};
				if (myconfig.debug) {
					msgA = {topic: msgA.topic, payload: msgA.payload, debug: debug}
				}
			};
			if (b != null) {
				msgB = {topic: "closecommand", payload: b};
				if (myconfig.debug) {
					msgB = {topic: msgB.topic, payload: msgB.payload, debug: debug}
				}
			};
			if (c != null) {
				msgC = {topic: "resetcommand", payload: c};
				if (myconfig.debug) {
					msgC = {topic: msgC.topic, payload: msgC.payload, debug: debug}
				}
			};
			if (d != null) {
				msgD = {topic: "setpointcommand", payload: d};
				if (myconfig.debug) {
					msgD = {topic: msgD.topic, payload: msgD.payload, debug: debug}
				}
			};
			that.send([msgA, msgB, msgC, msgD]);
		}
		
		/** Calculates sunrise and sunset */
		function sunCalcFunc() {
			/** Suncalc: https://www.npmjs.com/package/suncalc#reference */
			const sunTimes = SunCalc.getTimes(actDate, myconfig.location.lat, myconfig.location.lon);
			/** Sunrise time in ms since 1.1.1970 */
			context.sunrise = sunTimes.sunrise.valueOf();
			/** Sunset time in ms since 1.1.1970 */
			context.sunset = sunTimes.sunset.valueOf();
		}
		
		/**
		 * Performing actions depending on sunrise or sunset or any of it. 
		 * @param {String} what Must be either "sunrise" or "sunset"
		 */
		function sunriseset(what) {
			if (myconfig.automatic.behButtonLocksUntil === "sunriseset") {context.autoLocked = false};
			if (context.autoLocked) {return};
			if (what === "sunrise") {
				if (config.debug) {console.log("Now it's sunrise")};
				if (myconfig.automatic.behSunrise === "open") {sendCmdFunc(null,null,null,myconfig.set.shadingSetposOpen)}
				else if (myconfig.automatic.behSunrise === "shade") {sendCmdFunc(null,null,null,myconfig.set.shadingSetposShade)}
				else if (myconfig.automatic.behSunrise === "close") {sendCmdFunc(null,null,null,myconfig.set.shadingSetposClose)};
				context.blockSunrise = true;
			} else if (what === "sunset") {
				if (config.debug) {console.log("Now it's sunset")};
				if (myconfig.automatic.behSunset === "open") {sendCmdFunc(null,null,null,myconfig.set.shadingSetposOpen)}
				else if (myconfig.automatic.behSunset === "shade") {sendCmdFunc(null,null,null,myconfig.set.shadingSetposShade)}
				else if (myconfig.automatic.behSunset === "close") {sendCmdFunc(null,null,null,myconfig.set.shadingSetposClose)};
				context.blockSunset = true;
			}
		}



		/** This is the loop function which will be processed only if automatic is enabled. */
		function mainloopFunc(){
			actDate = new Date();
			const oldDate = new Date(context.oldTime);

			// Those blockers help to prevent sunrise/sunset triggers from being fired,
			// after the node is initially loaded (or Node-RED has been restarted).
			if (!initDone) {
				context.blockSunrise = true;
				context.blockSunset = true;
			}
		
			if (oldDate.getDay() != actDate.getDay()){sunCalcFunc()};
		
			// Release blockers
			if (actDate.valueOf() < context.sunrise) {context.blockSunrise = false};
			if (actDate.valueOf() < context.sunset) {context.blockSunset = false};

			// TRIGGER SUNRISE/SUNSET ACTIONS
			if (actDate.valueOf() >= context.sunrise && !context.blockSunrise) {sunriseset("sunrise")};
			if (actDate.valueOf() >= context.sunset && !context.blockSunset) {sunriseset("sunset")};
			
			context.oldTime = actDate.getTime();	// Save actual time as old time
			initDone = true;						// Mark initialization as done
		}


		// FIRST RUN ACTIONS ==>
		
		// Set replacement values for optional fields
		myconfig.set.inmsgButtonTopicOpen = config.set.inmsgButtonTopicOpen || "openbutton";
		myconfig.set.inmsgButtonTopicClose = config.set.inmsgButtonTopicClose || "closebutton";
		myconfig.set.inmsgWinswitchTopic = config.set.inmsgWinswitchTopic || "switch";
		if (myconfig.autoActive) {myconfig.automatic.inmsgTopicAutoReenable = config.automatic.inmsgTopicReset || "auto";};
	
		// Converting typed inputs
		if (myconfig.set.inmsgWinswitchPayloadOpenedType === 'num') {myconfig.set.inmsgWinswitchPayloadOpened = Number(config.set.inmsgWinswitchPayloadOpened)}
		else if (myconfig.set.inmsgWinswitchPayloadOpenedType === 'bool') {myconfig.set.inmsgWinswitchPayloadOpened = config.set.inmsgWinswitchPayloadOpened === 'true'}
		if (myconfig.set.inmsgWinswitchPayloadTiltedType === 'num') {myconfig.set.inmsgWinswitchPayloadTilted = Number(config.set.inmsgWinswitchPayloadTilted)}
		else if (myconfig.set.inmsgWinswitchPayloadTiltedType === 'bool') {myconfig.set.inmsgWinswitchPayloadTilted = config.set.inmsgWinswitchPayloadTilted === 'true'}
		if (myconfig.set.inmsgWinswitchPayloadClosedType === 'num') {myconfig.set.inmsgWinswitchPayloadClosed = Number(config.set.inmsgWinswitchPayloadClosed)}
		else if (myconfig.set.inmsgWinswitchPayloadClosedType === 'bool') {myconfig.set.inmsgWinswitchPayloadClosed = config.set.inmsgWinswitchPayloadClosed === 'true'}
		myconfig.set.shadingSetposOpen = Number(config.set.shadingSetposOpen);
		myconfig.set.shadingSetposShade = Number(config.set.shadingSetposShade);
		myconfig.set.shadingSetposClose = Number(config.set.shadingSetposClose);
		
		// Main loop
		if (myconfig.autoActive) {
			mainloopFunc();														// Trigger once as setInterval will fire first after timeout
			loopIntervalHandle = setInterval(mainloopFunc, loopIntervalTime);	// Continuous interval run
		}
		
		// Show config and context on console
		if (myconfig.debug) {
			that.log("Debugging is enabled in the node properties. Here comes the node configuration:");
			console.log(myconfig);
			that.log("Debugging is enabled in the node properties. Here comes the node context:");
			console.log(context);
		}

		// <== FIRST RUN ACTIONS

		// MESSAGE EVENT ACTIONS ==>

		this.on('input', function(msg,send,done) {
			
			context.msg = msg;

			/** Storing peripheral states */
			if (msg.topic === myconfig.set.inmsgButtonTopicOpen) {context.stateButtonOpen = msg.payload}
			else if (msg.topic === myconfig.set.inmsgButtonTopicClose) {context.stateButtonClose = msg.payload};

			/** Button open/close event based on incoming message topic */
			var buttonEvent = msg.topic === myconfig.set.inmsgButtonTopicOpen || msg.topic === myconfig.set.inmsgButtonTopicClose;
			/** Button press event based on incoming message topic, if payload is TRUE */
			var buttonPressEvent = buttonEvent && msg.payload === true;
			/** Button press open event */
			var buttonPressOpenEvent = msg.topic === myconfig.set.inmsgButtonTopicOpen && msg.payload === true;
			/** Button press close event */
			var buttonPressCloseEvent = msg.topic === myconfig.set.inmsgButtonTopicClose && msg.payload === true;
			/** Button release event based on incoming message topic, if payload is FALSE */
			var buttonReleaseEvent = buttonEvent && msg.payload === false;
			/** Auto re-enable event based on incoming message topic */
			if (myconfig.autoActive) {var autoReenableEvent = msg.topic === myconfig.automatic.inmsgTopicAutoReenable;};

			if (buttonEvent) {
				context.autoLocked = true;		// TODO unlock

				// Button open pressed
				if (buttonPressOpenEvent) {
					clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;

					// Single/double click detection
					if (context.buttonOpenTimeoutHandle) {
						
						// DOUBLE CLICK ACTIONS ==>
						clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
						sendCmdFunc(null,null,null,myconfig.set.shadingSetposOpen);
						// <== DOUBLE CLICK ACTIONS

					} else {
						context.buttonOpenTimeoutHandle = setTimeout(function(){
							clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
							if (context.stateButtonOpen) {

								// SINGLE CLICK ACTIONS ==>
								sendCmdFunc(config.set.payloadOpenCmd,null,null,null);
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
						sendCmdFunc(null,null,null,myconfig.set.shadingSetposClose);
						// <== DOUBLE CLICK ACTIONS
						
					} else {
						context.buttonCloseTimeoutHandle = setTimeout(function(){
							clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;
							if (context.stateButtonClose) {
								
								// SINGLE CLICK ACTIONS ==>
								sendCmdFunc(null,config.set.payloadCloseCmd,null,null);
								context.stateButtonRunning = true;
								// <== SINGLE CLICK ACTIONS
								
							}
						}, dblClickTime);
					}
					
				// Open/close button released
				} else if (buttonReleaseEvent && context.stateButtonRunning) {
					
					// BUTTONS RELEASED ACTIONS -->
					context.stateButtonRunning = false;
					sendCmdFunc(null,null,config.set.payloadStopCmd,null);
				}






	
			}
			
			// Auto re-enable event
			else if (autoReenableEvent) {
				context.autoLocked = false;
			}



			if (err) {
				if (done) {
					// Node-RED 1.0 compatible
					done(err);
				} else {
					// Node-RED 0.x compatible
					this.error(err,msg);
				}
			}

			
		});

		// <== MESSAGE EVENT ACTIONS
		
		this.context = context;		// Backing up context
		

	}

    RED.nodes.registerType("shading",ShadingNode);
}