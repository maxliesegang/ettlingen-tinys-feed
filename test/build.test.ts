import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { renderFeed } from "../src/feed";
import { menuHash } from "../src/format";
import { htmlToLines, parseDish, parseMenu } from "../src/parse";
import { rfc822 } from "../src/time";
import { buildPayload, parseMode, parseUrls } from "../src/webhooks";

const html = readFileSync(new URL("./fixtures/sample.html", import.meta.url), "utf8");
const today = { year: 2026, month: 9 };

test("parst Datum und Gerichte", () => {
  const menu = parseMenu(htmlToLines(html), today);
  assert.ok(menu);
  assert.equal(menu.date, "2026-09-24");
  assert.equal(menu.weekday, "Donnerstag");
  assert.deepEqual(
    menu.dishes.map((d) => [d.name, d.price]),
    [
      ["Gebratene Ente mit gelbem Curry", "10,90€"],
      ["Pasta Capri", "9,90€"],
      ["Hausgemachter Tiramisú", "5,90€"],
    ],
  );
  const tiramisu = menu.dishes[2]!;
  assert.equal(tiramisu.description, "mit Savoiardi Bisquit & Espresso.");
  assert.equal(tiramisu.priceEur, 5.9);
  assert.deepEqual(tiramisu.allergens, [{ code: "g", label: "Milch / Laktose" }]);
  assert.deepEqual(tiramisu.additives, [{ code: "9", label: "koffeinhaltig" }]);
});

test("Gericht: Kürzel, Preis, Merkmale", () => {
  const d = parseDish(
    "Gelbes-Curry vegetarisch",
    "würziges Curry (mild) in Kokosmilch mit Reis. (4, d,n,z)",
    "8,90 €",
  );
  assert.equal(d.description, "würziges Curry (mild) in Kokosmilch mit Reis.");
  assert.equal(d.price, "8,90€");
  assert.equal(d.priceEur, 8.9);
  assert.deepEqual(d.allergens.map((a) => a.code), ["d", "n"]);
  assert.deepEqual(d.additives.map((a) => a.code), ["4"]);
  assert.deepEqual(d.unknownCodes, ["z"]);
  assert.deepEqual(d.tags, ["vegetarisch"]);
  assert.deepEqual(parseDish("Tofu Bowl", "vegane Bowl", "7,50€").tags, ["vegan", "vegetarisch"]);
});

test("ignoriert Skripte und liefert null ohne Menü", () => {
  assert.equal(parseMenu(htmlToLines("<p>Heute geschlossen</p><script>DONNERSTAG - 24.09</script>"), today), null);
});

test("Jahreswechsel: Dezember-Menü im Januar gehört zum Vorjahr", () => {
  const menu = parseMenu(["FREITAG - 31.12", "Suppe", "5,00€"], { year: 2027, month: 1 });
  assert.equal(menu?.date, "2026-12-31");
});

test("Webhook-Payloads", () => {
  const menu = parseMenu(htmlToLines(html), today)!;
  assert.deepEqual(Object.keys(buildPayload(menu, "slack")), ["text"]);
  const wf = buildPayload(menu, "workflow");
  assert.deepEqual(Object.keys(wf), ["tag", "menu", "link"]);
  assert.ok(Object.values(wf).every((v) => typeof v === "string"), "Workflow Builder braucht flache Strings");
  assert.equal(parseMode(" Workflow "), "workflow");
  assert.deepEqual(parseUrls("https://a, https://b\nhttps://c\n"), ["https://a", "https://b", "https://c"]);
});

test("Feed und RFC-822-Datum", () => {
  const menu = parseMenu(htmlToLines(html), today)!;
  const xml = renderFeed({ ...menu, hash: menuHash(menu), fetchedAt: "2026-09-24T10:10:03+02:00" }, "https://x.github.io/r/feed.xml");
  assert.match(xml, /<pubDate>Thu, 24 Sep 2026 10:10:03 \+0200<\/pubDate>/);
  assert.match(xml, /Savoiardi Bisquit &amp;amp; Espresso/); // HTML-escaped, dann XML-escaped
  assert.match(xml, /Allergene: Milch \/ Laktose · Zusatzstoffe: koffeinhaltig/);
  assert.equal(rfc822("2026-01-15T09:00:00+01:00"), "Thu, 15 Jan 2026 09:00:00 +0100");
});
