Die Konfiguration enthält alle Parameter für Deine Beschattung. Du kannst verschiedene solche Konfigurationen erstellen und diese anschließend Deinen Nodes zuweisen.

# Parameter
### Name
Das ist der Name, mit dem Du kein Konfigurations-Set identifizierst. Wenn Du mit mehreren solcher Sets planst empfiehlt sich, dem einen aussagekräftigen Namen zu geben. Verwende beispielsweise konkrete Werte im Namen. Wenn Du nur ein Set verwenden wirst, kannst Du dieses Feld leer lassen. Stattdessen wird automatisch "Shading configuration" verwendet.

## Beschattung
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Schatten-Position | <p>Dieser Wert gibt die Position zwischen komplett offen (0%) und komplett geschlossen (100%) an. Üblicherweise ist das die Position, an dem das Rollo nur so weit geschlossen ist, dass die Schlitze noch offen sind. Diese Position bietet einen Sonnenschutz und gewährleistet die Durchlüftung. | 80 |
| Topic: Istposition | Wähle zwischen `Disabled` und `string` aus dem Typenselektor. Wenn `string` gewählt ist, fülle aus, was als `msg.topic` erwartet wird, wenn eine Istposition im `msg.payload` vom verbundenen Antrieb eingeht. Der Wert selbst muss zwischen `0` (für komplett offen/oben) und `100` (für komplett geschlossen/unten) liegen. | Deaktiviert |
            
## Taster
Ein verbundener Drucktaster muss eine Nachricht senden, deren `msg.payload` den Wert `true` bei gedrücktem bzw. `false` bei losgelassenem Tastendruck enthält. `msg.topic` kann konfiguriert werden. Wenn Du keinen Taster hast, kannst Du diesen Bereich ignorieren.
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Topic: Fahre hoch | `msg.topic` der Nachricht, wenn der Taster zum Hochfahren betätigt wird. | Wenn leer: "buttonup" |
| Topic: Fahre runter | `msg.topic` der Nachricht, wenn der Taster zum Runterfahren betätigt wird. | Wenn leer: "buttondown" |
| Doppelklick Zeit | Jeder Taster kann ein- oder zweimal betätigt werden. Eine einfache Betätigung fährt den Antrieb in die jeweils nächste Position in der gewählten Richtung (offen/schatten/zu). Eine zweifache Betätigung fährt den Antrieb entweder komplett auf oder zu, je nach betätigtem Taster. Diese Zeit in Milisekunden wird nach dem ersten Tastendruck gewartet, ob sich ein zweiter Tastendruck ereignet. | 400 |

## Positionsbefehle
Positionsbefehle lassen den Antrieb in eine der drei definierten Positionen fahren (offen/schatten/zu). `msg.payload` wird ignoriert, solange `msg.topic` einen der folgenden Werte enthält.
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Topic: Öffnen | `msg.topic` der Nachricht, um den Antrieb auf die Offen-Position zu fahren. | Wenn leer: "commandopen" |
| Topic: Beschatten | `msg.topic` der Nachricht, um den Antrieb auf die Schatten-Position zu fahren. | Wenn leer: "commandshade" |
| Topic: Schließen | `msg.topic` der Nachricht, um den Antrieb auf die Geschlossen-Position zu fahren. | Wenn leer: "commandclose" |
| Topic: Vorgabe Höhe | `msg.topic` der Nachricht, um den Antrieb auf eine gewünschte Zielposition zu fahren. `msg.payload` der Nachricht muss vom Typ 'number' sein und eine Zahl zwischen 0 (oben) und 100 (unten) enthalten. | Wenn leer: "commandheight" |

## Ausgänge
Der Node hat verschiedene Ausgänge. Drei stehen für den Tippbetrieb zur Verfügung: Open, close und stop. Diese werden verwendet, um den Antrieb per Tastendruck in Bewegung zu versetzen und wiederum anzuhalten.
- Eine lange Betätigung des "Öffnen"-Tasters wird den Ausgang "open" ansteuern.
- Eine lange Betätigung des "Schließen"-Tasters wird den Ausgang "close" ansteuern.
- Das Loslassen eines der betätigten Tasters nach langer Betätigung wird den Ausgang "stop" ansteuern.

Konfiguriere das ´msg.payload´ eines jeden Ausgangs.
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Payload: Auf | `msg.payload` der Nachricht, die am Ausgang "Open" gesendet wird, wenn der Taster "Fahre hoch" lange gedrückt wird. | boolean, "true" |
| Payload: Ab | `msg.payload` der Nachricht, die am Ausgang "Close" gesendet wird, wenn der Taster "Fahre runter" lange gedrückt wird. | boolean, "true" |
| Payload: Stop | `msg.payload` der Nachricht, die am Ausgang "Stop" gesendet wird, wenn nach langem Betätigen eines der beiden Tasters dieser losgelassen wird. | boolean, "true" |

## Automatik
Das Automatisieren einer Beschattung kann bei manchen Installationen erwünscht sein. Mit den unten stehenden Parametern kannst Du ein automatisches Verhalten aktivieren und beeinflussen.
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Aktivieren | Wenn aktiviert, prüft der Node periodisch die Sonnenposition anhand der eingestellten Koordinaten. Du kannst einstellen, was bei Sonnenaufgang bzw. -untergang passiert. Aktiviere diese Option, um die folgenden Parameter sichtbar zu machen. | Deaktiviert |
| Längengrad / Breitengrad | Gib hier die Koordinaten der Installation an. Wenn diese nicht bekannt sind, verwende eines der Kartentools im Internet, das hier zum Beispiel: [latlong.net](https://www.latlong.net/). | Leer |
| Sperre | Die Sperre-Variable gibt Dir die Möglichkeit, jede automatische Bewegung zu unterbinden. Die Variable muss entweder im flow oder global Daten Context verfügbar sein und muss den Wert `true` oder `false` haben. Beachte, dass es immer noch möglich ist, den Antrieb mit den Tastern oder den Positionsbefehlen zu betreiben. Es wird allerdings eine Meldung in der Konsole ausgegeben. | Deaktiviert |

## Fensterschalter
Wenn Du einen Fensterschalter hast, kannst Du hier angeben, wie die Nachricht dieses Schalters erwartet wird. Mit diesem und zusätzlichen Sicherheitseinstellungen kannst Du das automatische Verfahren des Antriebs beeinflussen.
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Aktivieren | Gib hier an, ob Du einen Fensterschalter installiert hast. | Deaktiviert |
| Topic | `msg.topic` einer Nachricht des Fensterschalters. | Wenn leer: "switch" |
| Payload: Geöffnet | `msg.payload` einer Nachricht des Fensterschalters, wenn das Fenster geöffnet wird. | number, "1" |
| Payload: Geschlossen | `msg.payload` einer Nachricht des Fensterschalters, wenn das Fenster geschlossen wird. | number, "3" |
| Kippsensor | Aktiviere diese Option, wenn Dein Fenster zusätzlich mit einem Kippsensor ausgestattet ist. | Deaktiviert |
| Payload: Gekippt | `msg.payload` einer Nachricht des Fensterschalters, wenn das Fenster gekippt wird. | number, "2" |
| Bewahre Schatten-Position | Wenn diese Option nicht gewählt ist und der Node einen Befehl zum Schließen erhält, fährt der Antrieb ganz zu. Szenario 1: Wenn diese Option gewählt ist und das Fenster nicht geschlossen ist, fährt der Antrieb statt in die Geschlossen- nur in die Schatten-Position. Wird später das Fenster geschlossen, fährt auch der Antrieb in die Geschlossen-Position. Szenario 2: Wenn die Option gewählt, das Fenster geschlossen und der Antrieb in der Geschlossen-Position ist, wird dieser in die Schatten-Position fahren, wenn das Fenster gekippt oder geöffnet wird. Durch das Schließen des Fensters fährt auch der Antrieb wieder in die Geschlossen-Position. | Deaktiviert |
        
## Sicherheit
Diese Parameter sind wichtig, um Unfälle zu vermeiden und zu verhindern, dass Dich die Beschattung ungewollt aus dem Haus aussperrt.
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Abwärtsfahrt erlaubt wenn gekippt | Die Beschattung darf selbst dann abwärts fahren, wenn das Fenster gekippt ist. | Deaktiviert |
| Abwärtsfahrt erlaubt wenn geöffnet | Die Beschattung darf selbst dann abwärts fahren, wenn das Fenster geöffnet ist. | Deaktiviert |
| Ignoriere Fensterposition wenn msg.commandforce = true | Mit den Positionsbefehlen kannst Du den Antrieb in eine der definierten Positionen fahren lassen. Wenn Du einen Fensterschalter konfiguriert hast kann es sein, dass die Abwärtsfahrt nicht erlaubt ist, wenn das Fenster offen oder gekippt ist. Diese Blockade kannst Du mit dem Aktivieren dieser Option umgehen. Während `msg.topic` dann (wie oben beschrieben) die Zielposition des Antriebs angibt, setze das `msg.commandforce` der Nachricht auf `true` innerhalb der selben Nachricht. | Deaktiviert |
           
## Ereignisse
### Reaktiviere Automatik Ereignisse
Wenn Du manuell den Antrieb verfährst (entweder mit den Tastern oder einem Positionsbefehl), wird der Automatikmodus deaktiviert. Das Node Symbol wird sich ändern und `payload.context.autoLocked` im Status-Ausgang wird `true`. Mit den unten stehenden Optionen kannst Du angeben, wann der Automatikmodus wieder aktiviert werden kann.
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Nachricht mit msg.topic = 'auto' | Wenn diese Option ausgewählt ist und eine Nachricht mit `auto` im `msg.topic` eingeht, wird die Automatik wieder aktiviert. | Deaktiviert |
| Beide Taster werden gleichzeitig gedrückt | Reaktiviere die Automatik, wenn Du beide Taster gleichzeitig drückst. In der Praxis wirst Du zuerst einen Taster drücken und während Du diesen gedrückt hältst, betätigst Du den zweiten Taster. Da auch eine lange Betätigung eines Tasters eine Aktion ausführt, steht Dir zum Betätigen des zweiten Tasters, nachdem Du den ersten Taster gedrückt hast, nur ein gewisses Zeitfenster zur Verfügung. Diese Zeit legst Du fest in der Sektion "Taster" weiter oben unter "Doppelklick Zeit". Wenn diese Zeit bspw. 500ms beträgt, hast Du nach dem Drücken des ersten Tasters 500ms Zeit, um den zweiten Taster zu drücken. | Deaktiviert |
| Sonnenaufgang | Reaktiviere die Automatik bei Sonnenaufgang. | Deaktiviert |
| Sonnenuntergang | Reaktiviere die Automatik bei Sonnenuntergang. | Deaktiviert |
### Ereignisse zum Öffnen
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Sonnenaufgang | Wenn gewählt und Automatik aktiv, wird der Antrieb bei Sonnenaufgang nach oben fahren. | Deaktiviert |
| Sonnenuntergang | Wenn gewählt und Automatik aktiv, wird der Antrieb bei Sonnenuntergang nach oben fahren. | Deaktiviert |
### Ereignisse zur Schattenfahrt
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Sonnenaufgang | Wenn gewählt und Automatik aktiv, wird der Antrieb bei Sonnenaufgang in die Schatten-Position fahren. | Deaktiviert |
| Sonnenuntergang | Wenn gewählt und Automatik aktiv, wird der Antrieb bei Sonnenuntergang in die Schatten-Position fahren. | Deaktiviert |
### Ereignisse zum Schließen
| Parameter | Beschreibung | Standart-Wert |
|-|-|-|
| Sonnenaufgang | Wenn gewählt und Automatik aktiv, wird der Antrieb bei Sonnenaufgang nach unten fahren. | Deaktiviert |
| Sonnenuntergang | Wenn gewählt und Automatik aktiv, wird der Antrieb bei Sonnenuntergang nach unten fahren. | Deaktiviert |