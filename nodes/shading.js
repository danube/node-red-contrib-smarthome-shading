module.exports = function(RED) {

    function ShadingOrientationNode(config) {
        RED.nodes.createNode(this,config);
    }
    RED.nodes.registerType("shading orientation",ShadingOrientationNode);

    function ShadingLocationNode(config) {
        RED.nodes.createNode(this,config);
    }
    RED.nodes.registerType("shading location",ShadingLocationNode);

    function ShadingConfigNode(config) {
        RED.nodes.createNode(this,config);
    }
    RED.nodes.registerType("shading configuration",ShadingConfigNode);





    function ShadingNode(config) {

		RED.nodes.createNode(this,config);
		var context = this.context();
		var that = this;
		var err = false;
		var msgDebug = null;
        var configSet = RED.nodes.getNode(config.configSet);
        var configOrientation = RED.nodes.getNode(config.configOrientation);

		this.on('input', function(msg,send,done) {

			function sendMsgDebugFunc(reason) {
				if (msg.debug) {
					msgDebug = {
						topic: "debug",
						inmsg: msg,
						config: config,
                        configSet: configSet,
                        configOrientation: configOrientation,
						context: context,
						reason: reason
					}
					that.send(msgDebug);
				}
			}

			if (msg.debug) {
				sendMsgDebugFunc("Debug solo");
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

			this.context = context;

		});

	}

    RED.nodes.registerType("shading",ShadingNode);
}