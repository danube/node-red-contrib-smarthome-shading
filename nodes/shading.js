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

		function sendCmdFunc(a,b,c,d) {
			var msgA, msgB, msgC, msgD = null;
			if (myconfig.debug) {
				const debug = {
					msg: context.msg,
					config: config,
					myconfig: myconfig,
					context: context
				}
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
		
		/** Calculates sunrise and sunset, only if atomatic is enabled. */
		function sunCalcFunc() {
			if (myconfig.autoActive) {
				const sunTimes = SunCalc.getTimes(actDate, myconfig.location.lat, myconfig.location.lon);
				context.sunrise = sunTimes.sunrise.valueOf();
				context.sunset = sunTimes.sunset.valueOf();
			}
		}
		
		function mainloopFunc(){
			actDate = new Date();
			const oldDate = new Date(context.oldTime);

			if (!initDone) {
				context.blockSunrise = true;
				context.blockSunset = true;
			}
		
			// console.log("DEBUG: looping... | Time: " + actDate + " | Old DOW: " + oldDate.getDay() + " | New DOW: " + actDate.getDay())
		
			// if (oldDate.getDay() != actDate.getDay()){
			if (oldDate.getMinutes() != actDate.getMinutes()){
				sunCalcFunc();
			}
		
			// Sunrise
			if (actDate.valueOf() < context.sunrise) {context.blockSunrise = false};
			if (actDate.valueOf() >= context.sunrise && !context.blockSunrise) {
				// Begin of sunrise actions
					// console.log("DEBUG: sunrise");
					// TODO umschreiben auf vier Ausgänge Prinzip:
					// if (myconfig.set.behSunrise === "open") {sendMsgCmd(myconfig.set.shadingSetposOpen)}
					// else if (myconfig.set.behSunrise === "shade") {sendMsgCmd(myconfig.set.shadingSetposShade)}
					// else if (myconfig.set.behSunrise === "close") {sendMsgCmd(myconfig.set.shadingSetposClose)};
					// End of sunrise actions
					context.blockSunrise = true;
				}
				
				// Sunset
				if (actDate.valueOf() < context.sunset) {context.blockSunset = false};
				if (actDate.valueOf() >= context.sunset && !context.blockSunset) {
					// Begin of sunset actions
					// console.log("DEBUG: sunset")
					// TODO umschreiben auf vier Ausgänge Prinzip:
					// if (myconfig.set.behSunset === "open") {sendMsgCmd(myconfig.set.shadingSetposOpen)}
					// else if (myconfig.set.behSunset === "shade") {sendMsgCmd(myconfig.set.shadingSetposShade)}
					// else if (myconfig.set.behSunset === "close") {sendMsgCmd(myconfig.set.shadingSetposClose)};
				// End of sunset actions
				context.blockSunset = true;
			}
			
			// console.log("DEBUG: looping... | Time: " + actDate + " | " + context.blockSunrise + " | " + context.blockSunset)

			context.oldTime = actDate.getTime();
			initDone = true;
		}


		// FIRST RUN ACTIONS -->

		if (myconfig.debug) {
			that.log("node-red-contrib-smarthome-shading: Debugging is enabled. Disable it in the node properties. Here comes the node configuration:");
			console.log(myconfig);
		}

		// Set replacement values for optional fields
		myconfig.set.inmsgButtonTopicOpen = config.set.inmsgButtonTopicOpen || "openbutton";
		myconfig.set.inmsgButtonTopicClose = config.set.inmsgButtonTopicClose || "closebutton";
		myconfig.set.inmsgWinswitchTopic = config.set.inmsgWinswitchTopic || "switch";
		myconfig.automatic.inmsgTopicAutoReenable = config.automatic.inmsgTopicReset || "auto";
	
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
		mainloopFunc();
		loopIntervalHandle = setInterval(mainloopFunc, loopIntervalTime);	// Interval run



		// MESSAGE EVENT ACTIONS -->

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
			var autoReenableEvent = msg.topic === myconfig.automatic.inmsgTopicAutoReenable;

			if (buttonEvent) {
				context.autoLocked = true;		// TODO unlock

				// Button open pressed
				if (buttonPressOpenEvent) {
					clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;

					// Single/double click detection
					if (context.buttonOpenTimeoutHandle) {
						
						// double click actions
						clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
						sendCmdFunc(null,null,null,myconfig.set.shadingSetposOpen);

					} else {
						context.buttonOpenTimeoutHandle = setTimeout(function(){
							clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
							if (context.stateButtonOpen) {

								// single click actions
								sendCmdFunc(true,null,null,null);
								context.stateButtonRunning = true;
								
							}
						}, dblClickTime);
					}
					
					
					
				// Button close pressed
				} else if (buttonPressCloseEvent) {
					clearTimeout(context.buttonOpenTimeoutHandle); context.buttonOpenTimeoutHandle = null;
					
					// Single/double click detection
					if (context.buttonCloseTimeoutHandle) {
						clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;
						
						// double click actions
						sendCmdFunc(null,null,null,myconfig.set.shadingSetposClose);
						
					} else {
						context.buttonCloseTimeoutHandle = setTimeout(function(){
							clearTimeout(context.buttonCloseTimeoutHandle); context.buttonCloseTimeoutHandle = null;
							if (context.stateButtonClose) {
								
								// single click actions
								sendCmdFunc(null,true,null,null);
								context.stateButtonRunning = true;
								
							}
						}, dblClickTime);
					}
					
				// Open/close button released
				} else if (buttonReleaseEvent && context.stateButtonRunning) {
					
					// auto re-enable actions
					context.stateButtonRunning = false;
					sendCmdFunc(null,null,true,null);
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
		
		// Backing up context
		this.context = context;
		

	}

    RED.nodes.registerType("shading",ShadingNode);
}