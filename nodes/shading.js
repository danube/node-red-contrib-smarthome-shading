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
		
		var err = false;
		var msgDebug;
		var SunCalc = require("suncalc");
		const now = new Date();
		
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
	
		function funSunCalc(){
			return SunCalc.getTimes(new Date(), 51.5, -0.1);
		}		

		console.log("DEBUG:");

		// if (!context.oldDate || now.getUTCDay() != context.oldDate.getUTCDay()) {
		// 	console.log("no old date")
		// }

		// let loopIntervalHandle = setInterval(funSunCalc, loopIntervalTime);


			
			
			
			
			
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
		
		context.oldDate = new Date();
		this.context = context;
		

	}

    RED.nodes.registerType("shading",ShadingNode);
}