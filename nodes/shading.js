module.exports = function(RED) {

    function ShadingOrientationNode(n) {
        RED.nodes.createNode(this,n);
    }
    RED.nodes.registerType("shading orientation",ShadingOrientationNode);

    function ShadingLocationNode(n) {
        RED.nodes.createNode(this,n);
    }
    RED.nodes.registerType("shading location",ShadingLocationNode);

    function ShadingNode(n) {
        RED.nodes.createNode(this,n);
    }
    RED.nodes.registerType("shading",ShadingNode);

}