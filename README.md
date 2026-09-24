# Tiny's House – Mittagstisch als RSS-Feed

Inoffizieller Feed für den täglichen Mittagstisch von [Tiny's House](https://tinyshouse.de/) in Ettlingen,
geschrieben in TypeScript. Eine GitHub Action ruft werktags um 10:30 Uhr die Webseite ab, baut daraus `feed.xml` und `today.json`,
veröffentlicht beides auf GitHub Pages und löst optional Webhooks aus (z. B. Slack).
Es wird nur das aktuelle Menü vorgehalten, kein Verlauf.

## Projektstruktur

```
src/
  build.ts      Einstiegspunkt: abrufen → parsen → public/ schreiben → Webhooks
  parse.ts      HTML → Textzeilen → Menü → Gerichte mit Allergenen/Preis
  allergens.ts  Legende der Allergen- und Zusatzstoff-Kürzel
  feed.ts       RSS-2.0-Ausgabe
  webhooks.ts   Payload-Formate und Versand
  format.ts     Texte für Slack, RSS, Hash
  time.ts       Datum/Zeit in Europe/Berlin, RFC 822
  types.ts      gemeinsame Typen
test/           Tests (node:test) mit HTML-Fixture
public/         Build-Ausgabe (nicht im Repo), wird per Action auf GitHub Pages veröffentlicht
```

Laufzeitabhängigkeit ist nur `htmlparser2`; `fetch` bringt Node ab Version 20 selbst mit.

## Einrichtung

1. Repository auf GitHub anlegen, Dateien pushen (inklusive `package-lock.json`).
2. **Pages aktivieren:** *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
   Die Action veröffentlicht `public/` bei jedem Lauf (`actions/deploy-pages`). Der Feed liegt danach
   unter `https://<user>.github.io/<repo>/feed.xml`, das Tagesmenü unter `…/today.json`.
3. **Webhooks (optional):** *Settings → Secrets and variables → Actions*
   - Secret `WEBHOOK_URLS`: eine oder mehrere URLs, getrennt durch Komma oder Zeilenumbruch.
   - Variable `WEBHOOK_PAYLOAD` (Tab *Variables*):
     - `slack` (Standard) – für Slack **Incoming Webhooks**: `{"text": "..."}`
     - `workflow` – für den Slack **Workflow Builder** (Webhook-Auslöser): flache Text-Variablen
       `tag`, `menu`, `link`. Im Workflow genau diese drei als Typ *Text* anlegen.
       `menu` enthält die Gerichte als Slack-Formatierung (`• *Name* – Preis`, `_Beschreibung_`),
       wie beim Modus `slack`.
     - `raw` – komplettes Menü als JSON inkl. Gerichteliste, für eigene Dienste.
4. Unter *Actions → Mittagstisch aktualisieren → Run workflow* einmal manuell starten
   (Häkchen „force“ setzen, um den Webhook zu testen).

## Ablauf

- Läuft einmal Mo–Fr um **10:30 Uhr deutscher Zeit**. Da GitHub-Cron in UTC rechnet, gibt es zwei
  Trigger (08:30 und 09:30 UTC); ein Prüfschritt lässt nur den zur aktuellen Sommer-/Winterzeit
  passenden weiterlaufen. GitHub startet geplante Läufe teils mit einigen Minuten Verspätung.
- Nur wenn die Seite ein Menü **vom heutigen Datum** zeigt, werden Feed und JSON neu veröffentlicht
  und Webhooks gesendet. Sonst bleibt die bisherige Seite online und es wird nichts gesendet.
- Ein manueller Lauf sendet den Webhook erneut; mit „force“ wird auch ein Menü mit anderem Datum verwendet.
- Ein fehlgeschlagener Webhook erzeugt eine Warnung im Log, bricht den Lauf aber nicht ab.
- Bei Pushes auf den Code laufen nur Typecheck und Tests.
- `today.json` enthält das aktuelle Menü, `feed.xml` genau einen Eintrag dazu.
  `https://<user>.github.io/<repo>/today.json` ist damit eine einfache JSON-API.

## JSON-Format pro Gericht

```json
{
  "name": "Gelbes-Curry vegetarisch",
  "description": "würziges gelbes Curry in cremiger Kokosmilch mit frischem Gemüse und Reis.",
  "price": "8,90€",
  "priceEur": 8.9,
  "allergens": [{ "code": "d", "label": "Eier" }, { "code": "n", "label": "Weichtiere" }],
  "additives": [{ "code": "4", "label": "mit Geschmacksverstärker(n)" }],
  "unknownCodes": [],
  "tags": ["vegetarisch"]
}
```

- Die Kürzel wie `(4,d,n)` werden aus Name/Beschreibung entfernt und über die
  [Legende der Seite](https://tinyshouse.de/zusatzstoffe-und-allergene/) aufgelöst
  (Ziffern = Zusatzstoffe, Buchstaben = Allergene). Unbekannte Kürzel landen in `unknownCodes`.
- `tags` enthält nur, was ausdrücklich im Text steht (`vegetarisch`, `vegan`), keine Vermutungen.
- Der Webhook-Modus `raw` schickt genau diese Struktur mit.

## Lokal

```bash
npm install
npm test
npm run feed -- --no-webhook                       # live abrufen, nur public/ bauen
npm run feed -- --html test/fixtures/sample.html   # mit gespeichertem HTML testen
WEBHOOK_URLS=https://hooks.slack.com/... npm run feed   # inkl. Webhook
```

## Hinweise

- Das Parsen basiert auf dem sichtbaren Seitentext (Zeile `WOCHENTAG - TT.MM` bis
  „Alle Angaben ohne Gewähr“), nicht auf Elementor-CSS-Klassen. Ändert das Restaurant das Layout
  grundlegend, findet der Lauf nichts und meldet das im Log. Dann `test/fixtures/sample.html` mit dem
  neuen HTML aktualisieren und `src/parse.ts` anpassen.
- Ein Abruf pro Werktag belastet die Seite praktisch nicht. Der Feed veröffentlicht allerdings
  Inhalte des Restaurants. Für eine größere Verbreitung vorher kurz bei Tiny's House nachfragen.
- GitHub pausiert geplante Workflows in öffentlichen Repos nach 60 Tagen ohne Aktivität. Da die
  Action nichts committet, reaktiviert sie sich bei jedem Lauf selbst per API. Falls der Zeitplan
  trotzdem einmal stoppt, genügt unter *Actions* ein Klick auf „Enable workflow“.
