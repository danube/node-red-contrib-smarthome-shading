This configuration node holds all parameters for your shading. You can create several different configuration nodes. Then, choose the according configuration node in your node setting.

# Parameters
### Name
This is the name, with which you identify your set of parameters. If you plan to have more than one such configuration sets, it is recommended to give a specific name. You may use some values, so that you are able to identify specific parameters you set. If you habe only one single configuration node, you may leave this field empty. A default value "Shading configuration" will then be used.

## Blind
| Option | Description | Default |
|-|-|-|
| Shade position | This value defines the position between completedy opened and completely closed in percent, where 0% is opened/up and 100% is closed/down. Usually, this position is that one, where the blind provides a good sunshade, with gaps between the blades for ventilation. | 80 |
| Height feedback topic | Choose between `Disabled` and `String` from the type selector. If `string` is selected, fill in what comes as `msg.topic` of the message holding the feedback value as `msg.payload` from the connected drive. This value must be beteen `0` (representing a completely opened shade) and `100` (representing a completely closed shade). | Disabled |
            
## Pushbutton
A connected pushbutton must send a message, where `msg.payload` is `true`, when the pushbutton is pressed and `false`, when the pushbutton is released. `msg.topic` can be configured below. If you have no pushbutton, you can ignore this section.
| Option | Description | Default |
|-|-|-|
| Topic: Move up | `msg.topic` of the message, when the down button is pressed or released. | if left blank: "buttonup". |
| Topic: Move down | `msg.topic` of the message, when the up button is pressed or released. | if left blank: "buttondown". |
| Doubleclick time | Each button can be single- or double-pressed. A single press moves the blind between the three default positions (open/shade/close). A double-press will move the blind either completely up or completely down, depending on the button pressed. This is the time in miliseconds, the node waits between the presses. | 400 |

## Position commands
Commands are supported to move the shade in one of three predefined positions: open, shade and close. `msg.payload` will be ignored, as long as `msg.topic` contains one of the following strings.
| Option | Description | Default |
|-|-|-|
| Topic: Open | `msg.topic` of the message, to move to open position. | if left blank: "commandopen" |
| Topic: Shade | `msg.topic` of the message, to move to shade position. | if left blank: "commandshade" |
| Topic: Close | `msg.topic` of the message, to move to close position. | if left blank: "commandclose" |

## Output
The node has several outputs. Three of them provide jog control signals: Open, close and stop. They are used for jogging the drive with the pushbuttons.
- Long-pressing the open pushbutton will trigger the output "open".
- Long-pressing the close pushbutton will trigger the output "close".
- Releasing any of the buttons after a long-press will trigger the output "stop".

Define `msg.payload` for each of these outputs.
| Option | Description | Default |
|-|-|-|
| Payload: Open | `msg.payload` of the message been sent on the open output, when you long-press the open pushbutton. | boolean, "true" |
| Payload: Close | `msg.payload` of the message been sent on the close output, when you long-press the close pushbutton. | boolean, "true" |
| Payload: Stop | `msg.payload` of the message been sent on the stop output, when you release the open or close pushbutton, after you long-pressed any of them. | boolean, "true" |

## Automatic
Automating your shades may be wanted in several installations. Options below offer you several options to automate the shading behavior.
| Option | Description | Default |
|-|-|-|
| Enable | When enabled, the node periodically checks the sun position according to the coordinates you provide. You have the possibility to define what happens on sunrise and sunset. Enable this option to see any of the parameters below. | Disabled |
| Latitude / Longitude | Provide latitude and longitude of the installation. If unknown, use one of the mapping tools from the internet or check [latlong.net](https://www.latlong.net/). | empty |
| Hard lock | Hardlock gives you the possibility to suppress any automatic movement. The variable must be available either in the flow or global context data and must be `true` or `false`. Note, that it is still possible to move the drive with the pushbuttons and the position commands. | Disabled |

## Window switch
If you have a window switch installed, you can configure below the expected message. Additional security settings offer you a configuration, how the window position affects automatic movements.
| Option | Description | Default |
|-|-|-|
| Enable | To configure the window switch message, you must enable this option. | Disabled |
| Topic | Define the `msg.topic` of the message containing the window switch position value. | If left blank: "switch" |
| Payload: Opened | Define the `msg.payload` of the message, when the window is opened. | number, "1" |
| Payload: Closed | Define the `msg.payload` of the message, when the window is closed. | number, "3" |
| Tilted sensor | Check this option, if your window is equipped with a tilt sensor. | Disabled |
| Payload: Tilted | Define the `msg.payload` of the message, when the window is tilted. | number, "2" |
| Preserve shade position | If the node receives a close command, without having this option enabled, it moves the blind completely down.<br>**Scenario 1:** When this option is enabled and the window is not closed, the blind instead of going to close position, it remains in the shade position. If you close the window later, the blind will also close.<br>**Scenario 2:** When the option is enabled, the window is closed and the blind is in close position, it will move into shade position, once you unclose the window. Closing the window closes also the shade. | Disabled |
        
## Security
This parameters are essential to prevent accidents or lock you out of your house.
| Option | Description | Default |
|-|-|-|
| Lowering allowed if window is tilted | The blind is allowed to lower, when the window is tilted. | Disabled |
| Lowering allowed if window is opened | The blind is allowed to lower, when the window is opened. | Disabled |
| Ignore window state if msg.commandforce = true | With the position commands, you can send the drive to one of the pre-defined positions. If you have configured a window switch, going down may not be allowed, depending on the window state. Use this checkbox, to allow a position command message to override the window state. While `msg.topic` defines the position to go (see above), set `msg.commandforce = true` in the position command message. | Disabled |
            
## Events
### Re-enable automatic conditions
When you manually move the blind (either with the pushbuttons or by sending a command message), automatic mode is disabled. The node icon will change and `payload.context.autoLocked` in the status-output is `true`. Check, with which of the options below you allow automatic mode to be re-enabled.
| Option | Description | Default |
|-|-|-|
| Message with topic 'auto' | Automatic will be re-enabled, if `msg.topic = auto`. | Disabled |
| Sunrise | Automatic will be re-enabled on sunrise. | Disabled |
| Sunset | Automatic will be re-enabled on sunset. | Disabled |
### Open conditions
| Option | Description | Default |
|-|-|-|
| Sunrise | If checked and automatic mode is active, the blind will move to open position on sunrise. | Disabled |
| Sunset | If checked and automatic mode is active, the blind will move to open position on sunset. | Disabled |
### Shade conditions
| Option | Description | Default |
|-|-|-|
| Sunrise | If checked and automatic mode is active, the blind will move to shade position on sunrise. | Disabled |
| Sunset | If checked and automatic mode is active, the blind will move to shade position on sunset. | Disabled |
### Close conditions
| Option | Description | Default |
|-|-|-|
| Sunrise | If checked and automatic mode is active, the blind will move to close position on sunrise. | Disabled |
| Sunset | If checked and automatic mode is active, the blind will move to close position on sunset. | Disabled |