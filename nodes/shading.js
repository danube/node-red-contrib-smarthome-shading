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

		config.set = RED.nodes.getNode(config.configSet).config;
		config.orientation = RED.nodes.getNode(config.configOrientation).config;
		config.location = RED.nodes.getNode(RED.nodes.getNode(config.configOrientation).config.config).config;
		context.config = config;

		context.config.set.inmsgButtonTopic = context.config.set.inmsgButtonTopic || "button";
		context.config.set.inmsgWinswitchTopic = context.config.set.inmsgWinswitchTopic || "switch";

		if (context.config.set.inmsgButtonPayloadOnType === 'num') {context.config.set.inmsgButtonPayloadOn = Number(config.togglePayload)}
		else if (config.togglePayloadType === 'bool') {context.togglePayload = config.togglePayload === 'true'}
		else {context.togglePayload = config.togglePayload};

		if (config.node.inmsgButtonPayloadOnType === 'num') {config.node.inmsgButtonPayloadOn = Number(config.node.inmsgButtonPayloadOn)}
		else if (config.node.inmsgButtonPayloadOnType === 'bool') {config.node.inmsgButtonPayloadOn = config.node.inmsgButtonPayloadOn === 'true'}
		else {context.togglePayload = config.togglePayload};

		function sendMsgDebugFunc(msg, reason) {
			if (msg.debug) {
				msgDebug = {
					topic: "debug",
					inmsg: msg,
					config: config,
					context: context,
					reason: reason
				}
				that.send(msgDebug);
			}
		}
		
		let loopIntervalHandle = setInterval(function(){}, loopIntervalTime);

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