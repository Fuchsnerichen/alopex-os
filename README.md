# ALOPEX OS – Desktop-App

Von **CMDR Fuxy**.

ALOPEX OS als eigenständiges Windows-Programm: eigenes Fenster, kein Browser, kein Node.js,
kein Startskript. Live-Daten von Ardent (Märkte) und Spansh (Ring-Hotspots, Exobiologie, Ausrüstung) und
das Elite-Journal laufen direkt in der App.

## Installieren

Es gibt zwei Varianten, beide ohne Admin-Rechte:

| Datei | Wofür |
|---|---|
| `ALOPEX-OS-<Version>-Setup.exe` | **Empfohlen.** Installiert ALOPEX für deinen Benutzer, legt Startmenü- und Desktop-Verknüpfung an und startet schnell. Deinstallieren über *Einstellungen → Apps* |
| `ALOPEX-OS-<Version>-portable.exe` | Ohne Installation, z. B. vom USB-Stick. Entpackt sich bei jedem Start in einen Temp-Ordner, startet daher ein paar Sekunden langsamer |

Beim ersten Start zeigt Windows „Der Computer wurde durch Windows geschützt“, weil die App nicht
mit einem kostenpflichtigen Zertifikat signiert ist. *Weitere Informationen* → *Trotzdem ausführen*.

## Benutzen

- **Starten:** über die Verknüpfung. Ist ALOPEX schon offen, kommt das vorhandene Fenster nach vorne.
- **Intro:** Beim Start setzt sich der Polarfuchs zusammen, der Bordcomputer meldet Journal, Commander,
  System und Flotte. Es läuft, während das Journal lädt; Klick oder Taste überspringt es, abschalten unter
  *Startup → Show intro*. Mit ausgeschalteten Windows-Animationseffekten erscheint es ohne Bewegung.
- **Journal:** Die App findet `%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous`
  selbst und liest live mit. Liegt dein Journal woanders: *Select Folder*, die App merkt sich den Ordner.
- **Flotte:** Beim Start liest die App die letzten 20 Journal-Dateien. Was sie über deine Schiffe weiß
  (Sprungweite, Frachtraum, eingebaute Module), merkt sie sich pro Commander. Auch Schiffe, die du länger
  nicht geflogen bist, behalten so ihre Daten. Verkaufte Schiffe verschwinden aus der Liste.
- **Stationen:** Unter *Stations* lassen sich Fleet Carrier und Planetenstationen in allen Stationssuchen
  ein- oder ausblenden. Bei jeder Station zeigt die App, ob sie auf einem Planeten liegt oder im All.
- **Outfitting:** Schiff wählen (aus der Flotte oder einen Schiffstyp), die gewünschten Teile auf die Liste
  setzen, suchen. Die App zeigt die nächsten Stationen, die *alle* Teile verkaufen, mit Preisen. Bei Schiffen
  aus der Flotte steht dabei, was gerade eingebaut ist.
  Mit *Shipyard* muss die Station zusätzlich den gewählten Schiffstyp verkaufen, praktisch zum Kaufen und
  Ausrüsten an einem Ort. Ohne Teile auf der Liste sucht die App nur das Schiff.
- **Beenden:** Fenster schließen. Es läuft danach nichts im Hintergrund weiter.

Einstellungen, die gemerkte Flotte und die Warennamen-Liste liegen in `%APPDATA%\ALOPEX OS`.

## Sicherheit

| Schutz | Wirkung |
|---|---|
| Kein Browser, kein offener Port | Die App lauscht auf keiner Netzwerkadresse, andere Programme oder Webseiten können sie nicht ansprechen |
| Oberfläche ohne Internet- und Dateizugriff | Die Seite darf selbst nichts laden (CSP `connect-src 'none'` plus Netzwerksperre im App-Kern); sie fragt nur den App-Kern |
| App-Kern prüft jede Anfrage | Feste Ziele: Ardent (nur lesend), drei Spansh-Suchen, die Warennamen-Liste auf GitHub. Keine frei wählbaren Adressen |
| Journal nur lesend | Nur `Journal.*.log`-Dateien im gewählten Ordner, keine anderen Dateien, keine Unterordner |
| Keine Navigation, keine Pop-ups, keine Berechtigungen | Die Seite kann nicht auf fremde Webseiten wechseln, keine Fenster öffnen und weder Kamera, Mikrofon noch Benachrichtigungen anfordern |
| Sandbox und Context-Isolation | Die Oberfläche läuft in Chromiums Sandbox, ohne Node.js; die Brücke bietet genau fünf Funktionen |
| Electron-Fuses | Die Exe lässt sich nicht als Node.js-Laufzeit missbrauchen, ignoriert `NODE_OPTIONS` und Debug-Schalter und prüft beim Start, ob ihre App-Dateien verändert wurden |

Was nach außen geht: Marktdaten-Abfragen an Ardent Insight, Suchen an Spansh und einmal pro Woche
die Warennamen-Liste von GitHub. Diese Dienste sehen dabei deine IP-Adresse.

Fragt die Windows-Firewall, ob ALOPEX OS ins Internet darf: zulassen, sonst gibt es keine Live-Daten.
Eingehende Verbindungen braucht ALOPEX nicht.

## Wenn es nicht klappt

| Symptom | Lösung |
|---|---|
| Windows-Schutz-Dialog beim Start | *Weitere Informationen* → *Trotzdem ausführen* (siehe oben) |
| Virenscanner meldet die Datei | Fehlalarme sind bei unsignierten Programmen möglich. Prüfsumme mit `SHA256SUMS.txt` vergleichen und eine Ausnahme anlegen |
| „Journal folder not found“ | *Select Folder* und den Ordner mit den `Journal.*.log`-Dateien wählen |
| Suche meldet „not reachable – are you online?“ | Internetverbindung prüfen, ALOPEX OS in Firewall oder Virenscanner ins Internet lassen |

## Aktualisieren und selbst bauen

Die App enthält ein eigenes Chromium (Electron 44.7.0). Damit es sicher bleibt, alle paar Monate mit
einer aktuellen Electron-Version neu bauen:

```bash
npm install               # Node.js 22 oder neuer
npm install --save-dev --save-exact electron@<neue Version>
npm test                  # optional: Unit- und End-to-End-Tests
npm run dist              # erzeugt dist/ALOPEX-OS-<version>-Setup.exe und -portable.exe
```

Unter Windows ist das der einfachste Weg. Unter Linux braucht der Installer zusätzlich Wine
(`wine`, `wine64`, `wine32:i386`), Tests laufen dort mit `npm run test:linux`.

## Aufbau

| Datei | Inhalt |
|---|---|
| `main.mjs` | App-Kern: Fenster, Sicherheitseinstellungen, Brücken-Funktionen |
| `preload.cjs` | Die Brücke: genau die fünf Funktionen, die die Oberfläche nutzen darf |
| `lib/` | Ardent, Spansh, Warennamen, Journal und der gemeinsame Netzwerk-Helfer |
| `app/` | Die Oberfläche (HTML, CSS, JavaScript, Schrift Rajdhani unter SIL OFL 1.1) |
| `app/outfitting-data.js` | Modulliste für Outfitting, erzeugt aus EDCD FDevIDs `outfitting.csv` |
| `scripts/build-outfitting-data.mjs` | Erzeugt `app/outfitting-data.js` neu: `node scripts/build-outfitting-data.mjs <Pfad>/outfitting.csv` (bei neuen Schiffen oder Modulen) |
| `test/` | Unit-Tests (`lib.test.mjs`) und End-to-End-Tests der echten App (`app.test.mjs`) |
| `build/icon.png` | App-Icon |
| `LICENSE` | Nutzungsbedingungen (nur lesen) und Lizenzen von Schrift und Moduldaten |

## Lizenz

Der Quellcode ist zum Lesen veröffentlicht, alle Rechte liegen bei CMDR Fuxy. Kopieren, Verändern und
Weitergeben nur mit Erlaubnis; die fertige App darfst du privat nutzen. Details und die Lizenzen der
mitgelieferten Schrift und Moduldaten in [`LICENSE`](LICENSE).

Elite Dangerous ist eine Marke von Frontier Developments plc. ALOPEX OS ist ein Fanprojekt ohne
Verbindung zu Frontier Developments.
