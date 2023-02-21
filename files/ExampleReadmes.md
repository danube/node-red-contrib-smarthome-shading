# Position Commands

One of these commands send the blind in either one of the predefined positions (open, shade, close) or in the position defined in the message.

If you want to send the drive in one of the pre-defined positions, use the relevant command (OPEN, SHADE, CLOSE). Such a message must only contain a `msg.topic` but not a `msg.payload`.

If you want to send the drive in a specific position in percent (%), use the HEIGHT command. The command must contain a `msg.payload` of type `number` with a value between 0 (open) and 100 (close).

The expected `msg.topic` of each message is defined in the shading configuration at section 'Position Commands'. In this example, the defaults are used.

Learn more about that functionality in the [online manual](https://github.com/danube/node-red-contrib-smarthome-shading/wiki/(EN)-3.-Configuration-and-parameters#position-commands).

# Height Feedback

If 'Height Feedback' is disabled, these messages are obsolete. If you send a height feedback message even with the option disabled, it will be dropped by the node.

The node expects such a message right after a position command within the time configured as 'Maximum runtime'.

The expected `msg.topic` of the message is defined in the shading configuration at section 'Height Feedback', option 'Topic'. In this example, the default is used.

Learn more about that functionality in the [online manual](https://github.com/danube/node-red-contrib-smarthome-shading/wiki/(EN)-3.-Configuration-and-parameters#height-feedback).

# Pushbutton

The relevant command must contain a `msg.payload` of boolean `true` if pressed and boolean `false` if released.

Learn more about that functionality in the [online manual](https://github.com/danube/node-red-contrib-smarthome-shading/wiki/(EN)-3.-Configuration-and-parameters#pushbutton).

## Short press (50ms)

This simulates a single and 50ms short press, everytime you click on inject.

In reality, this trigger must not be used, as the pushbuttons usually send `false` as soon as you release it.

This is practicable for simulation only.

## Press (and hold)

Injecting one of these is more realistic. Everytime you press a bushbutton, one message will be sent and as soon as you release the button, another message will be sent.

With the injects here you can also simulate long clicks, which have a different behaviour.

Learn more about that functionality in the [online manual](https://github.com/danube/node-red-contrib-smarthome-shading/wiki).

# Window Switch

If 'Window Switch' is disabled, these messages are obsolete. If you send a window switch message even with the option disabled, it will be dropped by the node.

Everytime you open, close or tilt a window, one of these messages must arrive the node.

`msg.topic` and `msg.payload` can be defined in the shading configuration.

Learn more about that functionality in the [online manual](https://github.com/danube/node-red-contrib-smarthome-shading/wiki/(EN)-3.-Configuration-and-parameters#window-switch).

# Jog outputs

When you press and hold one of the pushbuttons, the drive will move in the relevant direction. The OPEN or CLOSE output will be sent.

If you release the pushbutton, the STOP output will be sent.

The contained `msg.payload` of every message can be defined in the shading configuration. Available types are `boolean`, `number` and `string`.

The contained `msg.topic` is `open`, `close` or `stop`.

Learn more about that functionality in the [online manual](https://github.com/danube/node-red-contrib-smarthome-shading/wiki).

# Position output

If the drive must move in a specific position in percent (%), this output will be written.

The contained `msg.payload` is the number in percent (%).

The contained `msg.topic` is `command`.

Learn more about that functionality in the [online manual](https://github.com/danube/node-red-contrib-smarthome-shading/wiki).

# Status output

This output delivers a couple of internal variables, which can be used for various purpose.

Learn more about that functionality in the [online manual](https://github.com/danube/node-red-contrib-smarthome-shading/wiki).