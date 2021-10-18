RED.nodes.registerType("shading location", {
    category: "config",
    defaults: {
        name: {value: "Home", required: true},
        lat: {value: "", required: true, validate:RED.validators.number()},
        lon: {value: "", required: true, validate:RED.validators.number()},
    },
    label: function() {
        return this.name;
    }
})

RED.nodes.registerType('shading orientation',{
    category: 'config',
    defaults: {
        name: {required: true},
        config: {type: "shading location"},
        orientation: {required: true},
    },
    label: function() {
        return this.name;       // TODO: automatisch zusammenstellen: shading location.name + orientation
    }
})

RED.nodes.registerType ('shading config set', {
    category: 'config',
    defaults: {
        // window configuration
        windowSunAngleEntry: {value: -75, required: true},
        windowSunAngleExit: {value: 75, required: true},
        // shading configuration
        shadingSetposShade: {value: 80, required: true},
        // incoming messages configuration: button
        inmsgButtonTopic: {value: "button"},
        inmsgButtonPayloadOn: {value: "true", validate: RED.validators.typedInput("buttonPayloadOnType")},
        inmsgButtonPayloadOnType: {value: "initval"},
        inmsgButtonPayloadOff: {value: "false", validate: RED.validators.typedInput("buttonPayloadOffType")},
        inmsgButtonPayloadOffType: {value: "initval"},
        // incoming messages configuration: window switch
        inmsgWinswitchTopic: {value: "switch"},
        inmsgWinswitchPayloadOpened: {value: 1},
        inmsgWinswitchPayloadOpenedType: {value: "initval"},
        inmsgWinswitchPayloadTilted: {value: 2},
        inmsgWinswitchPayloadTiltedType: {value: "initval"},
        inmsgWinswitchPayloadClosed: {value: 3},
        inmsgWinswitchPayloadClosedType: {value: "initval"},
        // behavior configuration
        behSunrise: {value: "initval"},
        behSunset: {value: "initval"},
        behButtonLocksUntil: {value: "initval"}
    }
})





RED.nodes.registerType('shading',{
    category: 'Smart Home',
    color: '#FDF0C2',
    inputs: 1,
    outputs: 1,
    icon: "font-awesome/fa-window-maximize",
    defaults: {
        name: {value: ""},
        configOrientation: {type: "shading orientation"},
        configSet: {type: "shading config set"}
    },
    label: function() {
        return this.name || "Shading"
    },
    oneditprepare: function() {
        // initval
        if (this.buttonPayloadOnType === "initval") {
            $("#node-input-buttonPayloadOnType").val("bool")
        }
        if (this.buttonPayloadOffType === "initval") {
            $("#node-input-buttonPayloadOffType").val("bool")
        }
        if (this.switchPayloadOpenedType === "initval") {
            $("#node-input-switchPayloadOpenedType").val("num")
        }
        if (this.switchPayloadTiltedType === "initval") {
            $("#node-input-switchPayloadTiltedType").val("num")
        }
        if (this.switchPayloadClosedType === "initval") {
            $("#node-input-switchPayloadClosedType").val("num")
        }
        if (this.behSunrise === "initval") {
            $("#node-input-behSunrise").val("nothing")
        }
        if (this.behSunset === "initval") {
            $("#node-input-behSunset").val("nothing")
        }
        if (this.buttonLocksUntil === "initval") {
            $("#node-input-buttonLocksUntil").val("sunriseset")
        }
        // typedinput
        $("#node-input-buttonPayloadOn").typedInput({
            default: "bool",
            typeField: $("#node-input-buttonPayloadOnType"),
            types: ["bool","num","str"]
        })
        $("#node-input-buttonPayloadOff").typedInput({
            default: "bool",
            typeField: $("#node-input-buttonPayloadOffType"),
            types: ["bool","num","str"]
        })
        $("#node-input-switchPayloadOpened").typedInput({
            default: "num",
            typeField: $("#node-input-switchPayloadOpenedType"),
            types: ["bool","num","str"]
        })
        $("#node-input-switchPayloadTilted").typedInput({
            default: "num",
            typeField: $("#node-input-switchPayloadTiltedType"),
            types: ["bool","num","str"]
        })
        $("#node-input-switchPayloadClosed").typedInput({
            default: "num",
            typeField: $("#node-input-switchPayloadClosedType"),
            types: ["bool","num","str"]
        })
        $("#node-input-behSunrise").typedInput({
            types: [
                {
                    value: "behSunrise",
                    options: [
                        {value: "nothing", label: "Nothing"},
                        {value: "open", label: "Open"},
                        {value: "shade", label: "Shade"},
                        {value: "close", label: "Close"}
                    ]
                }
            ]
        })
        $("#node-input-behSunset").typedInput({
            types: [
                {
                    value: "behSunset",
                    options: [
                        {value: "nothing", label: "Nothing"},
                        {value: "open", label: "Open"},
                        {value: "shade", label: "Shade"},
                        {value: "close", label: "Close"}
                    ]
                }
            ]
        })
        $("#node-input-buttonLocksUntil").typedInput({
            types: [
                {
                    value: "buttonLocksUntil",
                    options: [
                        {value: "sunriseset", label: "Next sunrise / sunset"},
                        {value: "forever", label: "Forever"}
                    ]
                }
            ]
        })
    }
});
