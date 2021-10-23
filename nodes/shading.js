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
		
		const loopIntervalTime = 5000;
		var context = this.context();
		var that = this;
		var err = false;
		var msgDebug = null;
		var sunTimes;
		var SunCalc = require("suncalc");
		config.set = RED.nodes.getNode(config.configSet).config;
		config.orientation = RED.nodes.getNode(config.configOrientation).config;
		config.location = RED.nodes.getNode(RED.nodes.getNode(config.configOrientation).config.config).config;
		const configOriginal = config;

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
			sunTimes = SunCalc.getTimes(new Date(), 51.5, -0.1);
			console.log(sunTimes);
		}		

		funSunCalc();
		// let loopIntervalHandle = setInterval(funSunCalc, loopIntervalTime);

		// Set replacement values for optional fields
			config.set.inmsgButtonTopic = config.set.inmsgButtonTopic || "button";
			config.set.inmsgWinswitchTopic = config.set.inmsgWinswitchTopic || "switch";

		// Converting typed inputs
			if (config.set.inmsgButtonPayloadOnType === 'num') {config.set.inmsgButtonPayloadOn = Number(config.set.inmsgButtonPayloadOn)}
			else if (config.set.inmsgButtonPayloadOnType === 'bool') {config.set.inmsgButtonPayloadOn = config.set.inmsgButtonPayloadOn === 'true'}

			if (config.set.inmsgButtonPayloadOffType === 'num') {config.set.inmsgButtonPayloadOff = Number(config.set.inmsgButtonPayloadOff)}
			else if (config.set.inmsgButtonPayloadOffType === 'bool') {config.set.inmsgButtonPayloadOff = config.set.inmsgButtonPayloadOff === 'true'}

			if (config.set.inmsgWinswitchPayloadOpenedType === 'num') {config.set.inmsgWinswitchPayloadOpened = Number(config.set.inmsgWinswitchPayloadOpened)}
			else if (config.set.inmsgWinswitchPayloadOpenedType === 'bool') {config.set.inmsgWinswitchPayloadOpened = config.set.inmsgWinswitchPayloadOpened === 'true'}

			if (config.set.inmsgWinswitchPayloadTiltedType === 'num') {config.set.inmsgWinswitchPayloadTilted = Number(config.set.inmsgWinswitchPayloadTilted)}
			else if (config.set.inmsgWinswitchPayloadTiltedType === 'bool') {config.set.inmsgWinswitchPayloadTilted = config.set.inmsgWinswitchPayloadTilted === 'true'}

			if (config.set.inmsgWinswitchPayloadClosedType === 'num') {config.set.inmsgWinswitchPayloadClosed = Number(config.set.inmsgWinswitchPayloadClosed)}
			else if (config.set.inmsgWinswitchPayloadClosedType === 'bool') {config.set.inmsgWinswitchPayloadClosed = config.set.inmsgWinswitchPayloadClosed === 'true'}





		this.on('input', function(msg,send,done) {

			if (msg.debug) {sendMsgDebugFunc(msg, "Debug solo")};







			if (err) {
				if (done) {
					// Node-RED 1.0 compatible
					done(err);
				} else {
					// Node-RED 0.x compatible
					this.error(err,msg);
				}
			}

			this.context = context;

		});

	}

    RED.nodes.registerType("shading",ShadingNode);
}