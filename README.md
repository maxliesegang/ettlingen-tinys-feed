# Tiny's House – Mittagstisch als RSS-Feed

Inoffizieller Feed für den täglichen Mittagstisch von [Tiny's House](https://tinyshouse.de/) in Ettlingen,
geschrieben in TypeScript. Eine GitHub Action ruft werktags um 10:30 Uhr die Webseite ab, baut daraus `docs/feed.xml` und `docs/menu.json`
und löst bei einem neuen Menü optional Webhooks aus (z. B. Slack).

## Projektstruktur

```
src/
  build.ts      Einstiegspunkt: abrufen → parsen → Feed schreiben → Webhooks
  parse.ts      HTML → Textzeilen → Menü → Gerichte mit Allergenen/Preis
  allergens.ts  Legende der Allergen- und Zusatzstoff-Kürzel
  feed.ts       RSS-2.0-Ausgabe
  webhooks.ts   Payload-Formate und Versand
  format.ts     Texte für Slack, RSS, Hash
  time.ts       Datum/Zeit in Europe/Berlin, RFC 822
  types.ts      gemeinsame Typen
test/           Tests (node:test) mit HTML-Fixture
docs/           wird von der Action befüllt und über GitHub Pages ausgeliefert
```

Laufzeitabhängigkeit ist nur `htmlparser2`; `fetch` bringt Node ab Version 20 selbst mit.

## Einrichtung

1. Repository auf GitHub anlegen, Dateien pushen (inklusive `package-lock.json`).
2. **Pages aktivieren:** *Settings → Pages → Source: Deploy from a branch → `main` / `/docs`*.
   Der Feed liegt danach unter `https://<user>.github.io/<repo>/feed.xml`.
3. **Webhooks (optional):** *Settings → Secrets and variables → Actions*
   - Secret `WEBHOOK_URLS`: eine oder mehrere URLs, getrennt durch Komma oder Zeilenumbruch.
   - Variable `WEBHOOK_PAYLOAD` (Tab *Variables*):
     - `slack` (Standard) – für Slack **Incoming Webhooks**: `{"text": "..."}`
     - `workflow` – für den Slack **Workflow Builder** (Webhook-Auslöser): flache Text-Variablen
       `tag`, `menu`, `link`. Im Workflow genau diese drei als Typ *Text* anlegen.
     - `raw` – komplettes Menü als JSON inkl. Gerichteliste, für eigene Dienste.
4. Unter *Actions → Mittagstisch aktualisieren → Run workflow* einmal manuell starten
   (Häkchen „force“ setzen, um den Webhook zu testen).

## Ablauf

- Läuft einmal Mo–Fr um **10:30 Uhr deutscher Zeit**. Da GitHub-Cron in UTC rechnet, gibt es zwei
  Trigger (08:30 und 09:30 UTC); ein Prüfschritt lässt nur den zur aktuellen Sommer-/Winterzeit
  passenden weiterlaufen. GitHub startet geplante Läufe teils mit einigen Minuten Verspätung.
- Webhooks werden nur gesendet, wenn das Menü **vom heutigen Datum** ist und sich **geändert** hat.
  Wird das Menü tagsüber korrigiert, kommt also eine zweite Nachricht.
- Ein fehlgeschlagener Webhook erzeugt eine Warnung im Log, bricht den Lauf aber nicht ab.
- Bei Pushes auf den Code laufen nur Typecheck und Tests.
- `docs/today.json` enthält das heutige Menü, `docs/menu.json` die letzten 30 Tage (`items`).
  Beides ist gleichzeitig eine einfache JSON-API, z. B. `https://<user>.github.io/<repo>/today.json`.

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
npm run feed -- --no-webhook                       # live abrufen, nur Feed bauen
npm run feed -- --html test/fixtures/sample.html   # mit gespeichertem HTML testen
WEBHOOK_URLS=https://hooks.slack.com/... npm run feed -- --force
```

## Hinweise

- Das Parsen basiert auf dem sichtbaren Seitentext (Zeile `WOCHENTAG - TT.MM` bis
  „Alle Angaben ohne Gewähr“), nicht auf Elementor-CSS-Klassen. Ändert das Restaurant das Layout
  grundlegend, findet der Lauf nichts und meldet das im Log. Dann `test/fixtures/sample.html` mit dem
  neuen HTML aktualisieren und `src/parse.ts` anpassen.
- Ein Abruf pro Werktag belastet die Seite praktisch nicht. Der Feed veröffentlicht allerdings
  Inhalte des Restaurants. Für eine größere Verbreitung vorher kurz bei Tiny's House nachfragen.
- GitHub pausiert geplante Workflows in öffentlichen Repos nach 60 Tagen ohne Aktivität.
  Die Commits der Action halten das Repo normalerweise aktiv; falls nicht, genügt ein
  manueller Klick auf „Enable workflow“.
