# storyline.js

**storyline.js** ist eine kleine Bibliothek aus zwei HTML-Elementen, `<timeline-view>` und `<timeline-event>`, mit der man scrollbare Timelines baut. Sie nutzt native Custom Elements, braucht keine Abhängigkeiten und wird per `<link>` und `<script>` eingebunden.

Eine Timeline besteht aus einem **`<timeline-view>`** (die sichtbare Zeitachse) und mehreren **`<timeline-event>`** (die Ereignisse der Timeline). Beim Scrollen wandert man die Timeline entlang; das jeweils erreichte Ereignis wird aktiv.

## Installation

Es gibt zwei Wege — beide binden dieselben Dateien ein.

**1. Herunterladen und einbinden**

`storyline.css` und `storyline.js` herunterladen, neben die eigene HTML-Datei legen und einbinden. Das Stylesheet kommt in den `<head>`, das Script ans **Ende des `<body>`** (direkt vor `</body>`). `effects.js` ist optional und liefert die mitgelieferten Beispiel-Effekte (`emojiRain`, `colorChange`, `shake`).

```html
<!DOCTYPE html>
<html>
<head>
  <!-- … -->
  <link rel="stylesheet" href="storyline.css">
</head>
<body>

  <!-- hier deine <timeline-event> und das <timeline-view> -->

  <!-- ans Ende des <body>, direkt vor </body>: -->
  <script src="storyline.js"></script>
  <script src="effects.js"></script>   <!-- optional -->
</body>
</html>
```

**2. Von trych.dev verlinken** (ohne Download)

Gleiche Platzierung — nur die Pfade zeigen auf trych.dev statt auf lokale Dateien.

```html
<!DOCTYPE html>
<html>
<head>
  <!-- … -->
  <link rel="stylesheet" href="https://trych.dev/timelines/storyline.css">
</head>
<body>

  <!-- hier deine <timeline-event> und das <timeline-view> -->

  <!-- ans Ende des <body>, direkt vor </body>: -->
  <script src="https://trych.dev/timelines/storyline.js"></script>
  <script src="https://trych.dev/timelines/effects.js"></script>   <!-- optional -->
</body>
</html>
```

### Minimalbeispiel

```html
<timeline-event date="1969" label="Mondlandung">
  Neil Armstrong betritt den Mond.
</timeline-event>

<timeline-event date="1989" label="Mauerfall">
  Die Berliner Mauer wird geöffnet.
</timeline-event>

<timeline-view></timeline-view>
```

---

## `<timeline-view>` — die Zeitachse

| Attribut | Bedeutung |
|---|---|
| `start-pos` / `end-pos` | Lage und Richtung der Timeline (siehe unten) |
| `start` / `end` | Beginn und Ende der Timeline, z.B. `1957`, `now`, `-3y` oder eine Zahl. Sonst aus den Events abgeleitet |
| `progress` | Zeigt einen Fortschrittsbalken auf der Timeline |
| `preview` | Beim Hovern über der Timeline: Vorschaupunkt mit Datum, zeigt, wohin ein Klick springt |
| `counter` | Zeigt den aktuellen Wert am Indikator bzw. groß im Hintergrund (Tiefen-Modus) |
| `date-format` | Format der Datumsanzeige, z.B. `YYYY` (Default). Formatregeln s.u. |
| `unit="km"` | Hängt die **Einheit** an die Werte an (z.B. km, Mio km). Werte über `position…` setzen |
| `mode="depth"` | **Räumlicher** Tiefen-Modus |
| `spacing` | Nur im Tiefen-Modus: Abstand/Zoom zwischen Events. `>1` = weiter, `<1` = näher (Default 1) |
| *Inhalt* | Text im `<timeline-view>` wird als Überschrift gezeigt |

### Lage der Timeline (`start-pos` / `end-pos`)

| start-pos | end-pos | Ergebnis |
|---|---|---|
| `top-right` | `bottom-right` | Timeline **rechts** (Default) |
| `top-left` | `bottom-left` | Timeline **links** |
| `bottom-left` | `bottom-right` | **horizontale** Leiste unten |
| `bottom-right` | `top-right` | Zeit läuft **nach oben** |
| `top-left` | `bottom-right` | **diagonal** |
| `"20% 0%"` | `"80% 100%"` | **frei** positionierte Linie (x y in %) |

---

## `<timeline-event>` — ein Ereignis auf der Timeline

| Attribut | Bedeutung |
|---|---|
| `date` / `position` | Position auf der Timeline. `date` für Zeit (Jahr `1969`, Datum `1969-07-20`), `position` für Zahlen-Achsen |
| `label` | Beschriftung des Punkts (Bezeichnung des Ereignisses) |
| `date-label` / `position-label` | Text, der am Punkt angezeigt wird — statt des rohen Werts (z. B. Juli ’69 statt 1969-07-20) |
| `date-end` / `position-end` | Endwert → das Event wird ein **Zeitraum** (Balken) statt ein Zeitpunkt |
| `image` | Bild-URL für ein Bild, das beim Event angezeigt wird |
| `effect` | Effekt-Funktion, die läuft, sobald man das Event erreicht (siehe unten) |

*Hat kein Event `date`/`position`, wird die Timeline zum reinen Fortschrittsbalken — die Punkte verteilen sich nach der Reihenfolge der Events im Artikel.*

---

## Aussehen (CSS-Variablen)

Mit diesen CSS-Variablen kann das Aussehen der Timeline gesteuert werden.

| Variable | Wirkung |
|---|---|
| `--tl-dot-color` | Farbe der Punkte |
| `--tl-dot-size` | Größe der Punkte |
| `--tl-active-color` | Farbe des aktiven Events |
| `--tl-line-color` | Farbe der Linie |
| `--tl-line-width` | Dicke der Linie |
| `--tl-indicator-color` / `--tl-indicator-size` | Der mitlaufende Indikator |
| `--tl-progress-color` | Farbe des Fortschrittsbalkens |
| `--tl-progress-width` | Dicke des Fortschrittsbalkens |
| `--tl-date-color` | Farbe der Datums-/Wert-Beschriftung an den Events |
| `--tl-image-width` | Breite der Event-Bilder |
| `--tl-width` | Breite der Timeline-Spalte |
| `--tl-gap` | Abstand der Achse zum Rand |
| `--tl-background` | Farbiger Hintergrund hinter der Timeline (Default: transparent) |
| `--tl-counter-color` | Farbe des Counters |

Die Variablen können z.B. so überschrieben werden:

```css
:root {
  --tl-dot-color: #ef4444;
  --tl-dot-size: 20px;
  --tl-background: #1a1030;
}
```

---

## Effekte (`effect="…"`)

Laufen, sobald man beim Scrollen ein Event erreicht. Die folgenden Effekte sind in `effects.js` enthalten.

| Aufruf | Wirkung |
|---|---|
| `effect="emojiRain(🌕⭐🚀, 40)"` | **Emoji-Regen** — Emojis + Anzahl. Default: `🌕⭐🚀`, `24` |
| `effect="colorChange(navy, gold)"` | **Farbwechsel** von Hintergrund **und** Text. Default: `#1a1030`, `#ffffff` |
| `effect="shake(16, 700)"` | **Screen-Shake** — Stärke in px, Dauer in ms. Default: `8`, `400` |

```html
<timeline-event date="2007" label="iPhone" effect="shake(16, 700)"></timeline-event>
```

*Jede globale Funktion lässt sich als Effekt nutzen — einfach `function meinEffekt() { … }` schreiben und `effect="meinEffekt"` ans Event hängen. So kannst du eigene Effekte ergänzen.*

---

## Datumsformat (`date-format`)

| Token | Bedeutung | Beispiel |
|---|---|---|
| `YYYY` | Jahr (4-stellig) | 1969 |
| `YY` | Jahr (2-stellig) | 69 |
| `MMMM` | Monat ausgeschrieben | Juli |
| `MM` | Monat (2-stellig) | 07 |
| `DD` | Tag (2-stellig) | 20 |
| `HH` | Stunde | 14 |
| `mm` | Minute | 05 |

Kombinierbar, z. B. `DD. MMMM, HH:mm` → `20. Juli, 14:05`. Groß- und Kleinschreibung beachten.

---

© 2026 Timo Rychert · MIT-Lizenz
