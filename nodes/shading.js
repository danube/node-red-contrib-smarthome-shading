module.exports = function(RED) {

    function ShadingOrientationNode(config) {
		RED.nodes.createNode(this,config);
		this.config = config;
    }
    RED.nodes.registerType("shading orientation",ShadingOrientationNode);

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
		var msgDebug;
		var SunCalc = require("suncalc");
		var actDate = new Date();
		

		myconfig.set = RED.nodes.getNode(config.configSet).config;
		myconfig.orientation = RED.nodes.getNode(config.configOrientation).config;
		myconfig.location = RED.nodes.getNode(RED.nodes.getNode(config.configOrientation).config.config).config;

		function sendMsgDebugFunc(msg, reason) {
			if (msg.debug) {
				msgDebug = {
					topic: "debug",
					inmsg: msg,
					config: config,
					myconfig: myconfig,
					context: context,
					reason: reason
				}
				that.send(msgDebug); // TODO umschreiben auf vier Ausg�nge
			}
		}

		function sendCmdFunc(a,b,c,d) {
			var msgA, msgB, msgC, msgD = null;
			if (a != null) {
				msgA = {
					topic: "opencommand",
					cmd: a
				};
			};
			if (b != null) {
				msgB = {
					topic: "closecommand",
					cmd: b
				};
			};
			if (c != null) {
				msgC = {
					topic: "resetcommand",
					cmd: c
				};
			};
			if (d != null) {
				msgD = {
					topic: "setpointcommand",
					cmd: d
				};
			};
			that.send([msgA, msgB, msgC, msgD]);

		}
		
		function sunCalcFunc() {
			// console.log("DEBUG: new SunCalc call")
			const sunTimes = SunCalc.getTimes(actDate, myconfig.location.lat, myconfig.location.lon);
			context.sunrise = sunTimes.sunrise.valueOf();
			context.sunset = sunTimes.sunset.valueOf();
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
					// TODO umschreiben auf vier Ausg�nge Prinzip:
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
					// TODO umschreiben auf vier Ausg�nge Prinzip:
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

		// Set replacement values for optional fields
		myconfig.set.inmsgButtonTopicOpen = config.set.inmsgButtonTopicOpen || "openbutton";
		myconfig.set.inmsgButtonTopicClose = config.set.inmsgButtonTopicClose || "closebutton";
		myconfig.set.inmsgTopicReset = config.set.inmsgTopicReset || "reset";
		myconfig.set.inmsgWinswitchTopic = config.set.inmsgWinswitchTopic || "switch";
	
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
			
			// Storing peripheral states
			if (msg.topic === myconfig.set.inmsgButtonTopicOpen) {context.stateButtonOpen = msg.payload}
			else if (msg.topic === myconfig.set.inmsgButtonTopicClose) {context.stateButtonClose = msg.payload};

			// Button open/close event
			if (msg.topic === myconfig.set.inmsgButtonTopicOpen || msg.topic === myconfig.set.inmsgButtonTopicClose) {
				context.autoLocked = true;		// TODO unlock
				context.stateButtonRunning = false;

				// Button open pressed
				if (msg.topic === myconfig.set.inmsgButtonTopicOpen && msg.payload) {
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
				} else if (msg.topic === myconfig.set.inmsgButtonTopicClose && msg.payload) {
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
				} else if ((msg.topic === myconfig.set.inmsgButtonTopicOpen || msg.topic === myconfig.set.inmsgButtonTopicClose) && !msg.payload && context.stateButtonRunning) {
					
					// reset actions
					console.log("reset");
					context.stateButtonRunning = false;
					sendCmdFunc(null,null,true,null);
				}






	
			}
			
			// Button reset event
			else if (msg.topic === myconfig.set.inmsgTopicReset) {
				context.autoLocked = false;
				sendMsgDebugFunc(msg, "Reset");
			}

			// Debug solo
			else if (msg.debug) {
				sendMsgDebugFunc(msg, "Debug solo")
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

			
		});
		
		// Backing up context
		this.context = context;
		

	}

    RED.nodes.registerType("shading",ShadingNode);
}