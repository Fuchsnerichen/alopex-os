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
- **Updates:** Die App sieht beim Start und danach alle 6 Stunden nach, ob es eine neue Version gibt. Wenn ja,
  erscheint oben der Button *Update to vX*: einmal klicken lädt sie, ein zweites Mal startet ALOPEX mit der
  neuen Version neu. Mit *Install updates automatically* (unter *Updates*) lädt die App neue Versionen selbst
  und installiert sie, wenn du ALOPEX schließt. Nach einem Update zeigt sie beim nächsten Start, was neu ist.
  Die portable Version kann sich nicht selbst ersetzen; dort öffnet der Button die Download-Seite.
- **Intro:** Beim Start springt der Polarfuchs per Frame Shift aus dem Hyperraum, der Bordcomputer meldet Journal, Commander,
  System und Flotte. Es läuft, während das Journal lädt; Klick oder Taste überspringt es, abschalten unter
  *Startup → Show intro*. Mit ausgeschalteten Windows-Animationseffekten erscheint es ohne Bewegung.
- **Journal:** Die App findet `%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous`
  selbst und liest live mit. Liegt dein Journal woanders: *Select Folder*, die App merkt sich den Ordner.
- **Flotte:** Beim Start liest die App die letzten 20 Journal-Dateien. Was sie über deine Schiffe weiß
  (Sprungweite, Frachtraum, eingebaute Module), merkt sie sich pro Commander. Auch Schiffe, die du länger
  nicht geflogen bist, behalten so ihre Daten. Verkaufte Schiffe verschwinden aus der Liste.
- **Stationen:** Unter *Stations* lassen sich Fleet Carrier und Planetenstationen in allen Stationssuchen
  ein- oder ausblenden. Bei jeder Station zeigt die App, ob sie auf einem Planeten liegt oder im All.
- **Mining:** Unter *Reserve level* wählst du, welche Ringe in Frage kommen (Pristine, Major, Common, Low,
  Depleted). Ringe ohne bekannte Reserve-Stufe fallen dann heraus; die Stufe steht bei jedem Ergebnis dabei.
- **Outfitting:** Schiff wählen (aus der Flotte oder einen Schiffstyp), die gewünschten Teile auf die Liste
  setzen, suchen. Teile findest du per Texteingabe, auch mit Kürzeln wie *FSD*, *SCB*, *HRP* oder gleich mit
  Größe (*6A scoop*). Die Teile sind nach Kategorien sortiert wie im Spiel (Hardpoints, Utility mounts, Core und
  Optional internal, darin z. B. *Lasers*, *Mining tools*, *Shields & hull*): Unter *Category* eine Kategorie
  wählen, um ihre Teile durchzublättern, oder den Kategorienamen eintippen (*mining*). Angeboten werden nur
  Größen, die in einen Steckplatz des gewählten Schiffs passen; Teile auf der Liste, die nicht passen, sind rot
  markiert. Schiffe mit Spezial-Plätzen (Military-Plätze, Mining-Hardpoints der Type-11 Prospector, Cargo-Plätze
  der Panther Clipper Mk II …) oder eigenen Teilen haben in der Schiffsauswahl einen ★, darunter steht, welche
  Plätze es sind. In der Teileliste kommt die Kategorie *★ Special* zuerst, getrennt nach Art des Platzes und
  „Only for this ship“ (z. B. Mining Volley Repeater und Mk II Mining Multi-Limpet Controller der Type-11).
  Dieselben Teile stehen auch in ihrer normalen Kategorie, dort mit ★ gekennzeichnet. *mk2* findet alle Mk-II-Teile.
  Jedes Schiff hat seine eigene Teileliste, die auch nach einem Neustart erhalten bleibt: Der Mining-Ausbau der
  Type-11 und der Explorer-Ausbau der Anaconda liegen also nebeneinander.
  Für Schiffe, für die es noch keine Steckplatz-Daten gibt (Anaconda Mk II, Lynx Highliner), liest die App die
  Plätze aus dem Journal, sofern das Schiff in deiner Flotte ist. Ein Loadout nennt nur Plätze, in denen etwas
  steckt, also sind die Kern-Plätze vollständig (ohne die fliegt kein Schiff), der Rest ist eine Untergrenze.
  Deshalb wird dort nichts ausgeblendet: Teile jenseits der bekannten Plätze stehen weiter zur Auswahl und sind
  als *not in your loadout* markiert. *A-rated core package* setzt Thrusters, Power Plant, Frame Shift Drive (SCO)
  und Power Distributor in A auf die Liste, jeweils in der Größe, die das gewählte Schiff nimmt; wechselst du das
  Schiff, passt sich das Paket an. Die App zeigt die nächsten Stationen, die *alle* Teile verkaufen, mit Preisen. Bei Schiffen
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
| App-Kern prüft jede Anfrage | Feste Ziele: Ardent (nur lesend), drei Spansh-Suchen, die Warennamen-Liste auf GitHub und die Releases dieses Repos. Keine frei wählbaren Adressen |
| Journal nur lesend | Nur `Journal.*.log`-Dateien im gewählten Ordner, keine anderen Dateien, keine Unterordner |
| Keine Navigation, keine Pop-ups, keine Berechtigungen | Die Seite kann nicht auf fremde Webseiten wechseln, keine Fenster öffnen und weder Kamera, Mikrofon noch Benachrichtigungen anfordern |
| Sandbox und Context-Isolation | Die Oberfläche läuft in Chromiums Sandbox, ohne Node.js; die Brücke bietet nur die Funktionen aus `preload.cjs` |
| Electron-Fuses | Die Exe lässt sich nicht als Node.js-Laufzeit missbrauchen, ignoriert `NODE_OPTIONS` und Debug-Schalter und prüft beim Start, ob ihre App-Dateien verändert wurden |
| Updates nur aus diesem Repo | Neue Versionen kommen ausschließlich aus den Releases von `Fuchsnerichen/alopex-os`. Der Installer wird vor dem Start gegen die SHA-512-Prüfsumme aus `latest.yml` geprüft. Wer das GitHub-Konto kontrolliert, kontrolliert die Updates: Zwei-Faktor-Anmeldung auf GitHub ist Pflicht |

Was nach außen geht: Marktdaten-Abfragen an Ardent Insight, Suchen an Spansh, einmal pro Woche die
Warennamen-Liste von GitHub und beim Start sowie alle 6 Stunden die Update-Prüfung bei GitHub. Diese
Dienste sehen dabei deine IP-Adresse.

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

Die App enthält ein eigenes Chromium (Electron 44.9.3). Damit es sicher bleibt, alle paar Monate mit
einer aktuellen Electron-Version neu bauen:

```bash
npm install               # Node.js 22 oder neuer
npm install --save-dev --save-exact electron@<neue Version>
npm test                  # optional: Unit- und End-to-End-Tests
npm run dist              # erzeugt dist/ALOPEX-OS-<version>-Setup.exe und -portable.exe
```

Unter Windows ist das der einfachste Weg. Unter Linux braucht der Installer zusätzlich Wine
(`wine`, `wine64`, `wine32:i386`), Tests laufen dort mit `npm run test:linux`.

### Neue Version veröffentlichen (Updates für alle)

GitHub baut die Dateien selbst (`.github/workflows/release.yml`), hochladen muss man nichts:

1. In `package.json` die `version` erhöhen, in `build/kurzanleitung.txt` den Abschnitt *Neu in …*
   schreiben, beides nach `main` mergen.
2. Auf GitHub unter *Releases → Draft a new release* ein Tag `v<version>` anlegen (z. B. `v1.0.18`),
   Titel `ALOPEX OS <version>`. Der Beschreibungstext erscheint in der App unter *What's new*.
3. *Publish release* (kein Entwurf, keine Vorabversion).

Der Workflow baut daraufhin unter Windows aus genau dem getaggten Stand, prüft die Sicherheits-Fuses
und dass `latest.yml` zur Setup-Datei passt, und hängt sechs Dateien an das Release: Setup, Blockmap,
`latest.yml`, portable, `SHA256SUMS.txt` und die Kurzanleitung. Schlägt etwas fehl, bleibt das Release
ohne Dateien, und niemand bekommt ein kaputtes Update angeboten.

Stimmt das Tag nicht mit der `version` in `package.json` überein, bricht der Workflow sofort ab. Zum
Ausprobieren ohne Release: *Actions → Release → Run workflow*, das baut und prüft alles, hängt aber
nichts an.

Nach dem Veröffentlichen meldet GitHub eine neue Version oft erst nach einigen Minuten; bis dahin zeigt
*Check now* noch *Up to date*.

Lokal von Hand bauen geht weiter: `npm run dist`, danach `node scripts/release-files.mjs` für
Prüfsummen und Kurzanleitung.

## Aufbau

| Datei | Inhalt |
|---|---|
| `main.mjs` | App-Kern: Fenster, Sicherheitseinstellungen, Brücken-Funktionen |
| `preload.cjs` | Die Brücke: genau die Funktionen, die die Oberfläche nutzen darf |
| `lib/` | Ardent, Spansh, Warennamen, Journal, Updates und der gemeinsame Netzwerk-Helfer |
| `app/` | Die Oberfläche (HTML, CSS, JavaScript, Schrift Rajdhani unter SIL OFL 1.1) |
| `app/js/` | Die Skripte der Oberfläche, eine Datei pro Bereich: `constants`, `utils`, `api`, `audio`, `fleet`, `prefs`, `ui`, `journal`, `trade`, `passengers`, `mining`, `exobio`, `outfitting`, `intro`, `updates` und `main` (Ereignisse und Start). Sie teilen sich einen Namensraum und laden in dieser Reihenfolge (`index.html`) |
| `app/outfitting-data.js` | Modulliste für Outfitting, erzeugt aus EDCD FDevIDs `outfitting.csv` |
| `app/ship-slots.js` | Steckplatz-Größen jedes Schiffs, Spezial-Steckplätze und Teile nur für ein Schiff, erzeugt aus EDCD coriolis-data |
| `scripts/build-ship-slots.mjs` | Erzeugt `app/ship-slots.js` neu: `node scripts/build-ship-slots.mjs <Pfad>/coriolis-data <Pfad>/FDevIDs` |
| `scripts/build-outfitting-data.mjs` | Erzeugt `app/outfitting-data.js` neu: `node scripts/build-outfitting-data.mjs <Pfad>/outfitting.csv` (bei neuen Schiffen oder Modulen) |
| `.github/workflows/` | `tests.yml` lässt bei jedem Push nach `main` oder `release/*` die Tests laufen, `release.yml` baut ein veröffentlichtes Release unter Windows und hängt die Dateien an |
| `build/kurzanleitung.txt` | Vorlage der Kurzanleitung für die Downloads; `%VERSION%` und die Prüfsummen setzt `scripts/release-files.mjs` ein |
| `scripts/release-files.mjs` | Prüft den Build in `dist/` und schreibt `SHA256SUMS.txt` und die Kurzanleitung |
| `test/` | Unit-Tests (`lib.test.mjs`) und End-to-End-Tests der echten App (`app.test.mjs`) |
| `build/icon.*` | App-Icon, der Fuchskopf aus dem Intro: `icon.svg` (Zeichnung), `icon.png` (512 px), `icon.ico` (16–256 px, kleine Größen vereinfacht). Neu erzeugen mit `node scripts/build-icons.mjs` |
| `LICENSE` | Nutzungsbedingungen (nur lesen) und Lizenzen von Schrift und Moduldaten |

## Lizenz

Der Quellcode ist zum Lesen veröffentlicht, alle Rechte liegen bei CMDR Fuxy. Kopieren, Verändern und
Weitergeben nur mit Erlaubnis; die fertige App darfst du privat nutzen. Details und die Lizenzen der
mitgelieferten Schrift und Moduldaten in [`LICENSE`](LICENSE).

Elite Dangerous ist eine Marke von Frontier Developments plc. ALOPEX OS ist ein Fanprojekt ohne
Verbindung zu Frontier Developments.
