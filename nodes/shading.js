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
		const configOriginal = config;
		
		const loopIntervalTime = 5000;		// Node loop interval
		var loopIntervalHandle;

		var initDone, err = false;
		var msgDebug;
		var SunCalc = require("suncalc");
		var actDate = new Date();
		
		config.set = RED.nodes.getNode(config.configSet).config;
		config.orientation = RED.nodes.getNode(config.configOrientation).config;
		config.location = RED.nodes.getNode(RED.nodes.getNode(config.configOrientation).config.config).config;

		function sendMsgDebugFunc(msg, reason) {
			if (msg.debug) {
				msgDebug = {
					topic: "debug",
					inmsg: msg,
					config: config,
					configOriginal: configOriginal,
					context: context,
					reason: reason
				}
				that.send(msgDebug);
			}
		}

		function sendMsgCmd(value) {
			msgCmd = {
				topic: "command",
				payload: value
			}
			that.send(msgCmd);
			sendMsgDebugFunc(msg, "New command");
		}
	
		function sunCalcFunc(){
			console.log("DEBUG: new SunCalc call")
			const sunTimes = SunCalc.getTimes(actDate, config.location.lat, config.location.lon);
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
					console.log("DEBUG: sunrise");
					if (config.set.behSunrise === "open") {sendMsgCmd(config.set.shadingSetposOpen)}
					else if (config.set.behSunrise === "shade") {sendMsgCmd(config.set.shadingSetposShade)}
					else if (config.set.behSunrise === "close") {sendMsgCmd(config.set.shadingSetposClose)};
				// End of sunrise actions
				context.blockSunrise = true;
			}
		
			// Sunset
			if (actDate.valueOf() < context.sunset) {context.blockSunset = false};
			if (actDate.valueOf() >= context.sunset && !context.blockSunset) {
				// Begin of sunset actions
					console.log("DEBUG: sunset")
					if (config.set.behSunset === "open") {sendMsgCmd(config.set.shadingSetposOpen)}
					else if (config.set.behSunset === "shade") {sendMsgCmd(config.set.shadingSetposShade)}
					else if (config.set.behSunset === "close") {sendMsgCmd(config.set.shadingSetposClose)};
				// End of sunset actions
				context.blockSunset = true;
			}
			
			console.log("DEBUG: looping... | Time: " + actDate + " | " + context.blockSunrise + " | " + context.blockSunset)

			context.oldTime = actDate.getTime();
			initDone = true;
		}

		// First run actions
		mainloopFunc();

		// Main loop
		loopIntervalHandle = setInterval(mainloopFunc, loopIntervalTime);	// Interval run


		this.on('input', function(msg,send,done) {
				
			// Set replacement values for optional fields
			config.set.inmsgButtonTopicOpen = config.set.inmsgButtonTopicOpen || "openbutton";
			config.set.inmsgButtonTopicClose = config.set.inmsgButtonTopicClose || "closebutton";
			config.set.inmsgWinswitchTopic = config.set.inmsgWinswitchTopic || "switch";
		
			// Converting typed inputs
			if (config.set.inmsgButtonPayloadOpenType === 'num') {config.set.inmsgButtonPayloadOpen = Number(config.set.inmsgButtonPayloadOpen)}
			else if (config.set.inmsgButtonPayloadOpenType === 'bool') {config.set.inmsgButtonPayloadOpen = config.set.inmsgButtonPayloadOpen === 'true'}
			if (config.set.inmsgButtonPayloadCloseType === 'num') {config.set.inmsgButtonPayloadClose = Number(config.set.inmsgButtonPayloadClose)}
			else if (config.set.inmsgButtonPayloadCloseType === 'bool') {config.set.inmsgButtonPayloadClose = config.set.inmsgButtonPayloadClose === 'true'}
			if (config.set.inmsgWinswitchPayloadOpenedType === 'num') {config.set.inmsgWinswitchPayloadOpened = Number(config.set.inmsgWinswitchPayloadOpened)}
			else if (config.set.inmsgWinswitchPayloadOpenedType === 'bool') {config.set.inmsgWinswitchPayloadOpened = config.set.inmsgWinswitchPayloadOpened === 'true'}
			if (config.set.inmsgWinswitchPayloadTiltedType === 'num') {config.set.inmsgWinswitchPayloadTilted = Number(config.set.inmsgWinswitchPayloadTilted)}
			else if (config.set.inmsgWinswitchPayloadTiltedType === 'bool') {config.set.inmsgWinswitchPayloadTilted = config.set.inmsgWinswitchPayloadTilted === 'true'}
			if (config.set.inmsgWinswitchPayloadClosedType === 'num') {config.set.inmsgWinswitchPayloadClosed = Number(config.set.inmsgWinswitchPayloadClosed)}
			else if (config.set.inmsgWinswitchPayloadClosedType === 'bool') {config.set.inmsgWinswitchPayloadClosed = config.set.inmsgWinswitchPayloadClosed === 'true'}
			config.set.shadingSetposOpen = Number(config.set.shadingSetposOpen);
			config.set.shadingSetposShade = Number(config.set.shadingSetposShade);
			config.set.shadingSetposClose = Number(config.set.shadingSetposClose);


			// Button press event
			if (msg.topic === config.set.inmsgButtonTopicOpen || msg.topic === config.set.inmsgButtonTopicClose) {
				context.autoLocked = true;		// TODO unlock
				sendMsgDebugFunc(msg, "Pushbutton");
				console.log("Pushbutton received");
				if (msg.topic === config.set.inmsgButtonTopicOpen && msg.payload === config.set.inmsgButtonPayloadOpen) {
					console.log("Open command received")
				} else if (msg.topic === config.set.inmsgButtonTopicClose && msg.payload === config.set.inmsgButtonPayloadClose) {
					console.log("Close command received")
				}
			}

			// if (msg.debug) {sendMsgDebugFunc(msg, "Debug solo")}; // TODO irgendwie einbauen, damit das nicht immer gesendet wird

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