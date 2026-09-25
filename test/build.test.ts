import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkMenu, decide } from "../src/check";
import { renderFeed } from "../src/feed";
import { menuHash } from "../src/format";
import { htmlToLines, parseDish, parseMenu } from "../src/parse";
import { type Io, run } from "../src/run";
import { slotOf } from "../src/slot";
import { rfc822 } from "../src/time";
import type { Menu } from "../src/types";
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
  assert.deepEqual(Object.keys(wf), ["tag", "menu", "details", "link"]);
  assert.ok(Object.values(wf).every((v) => typeof v === "string"), "Workflow Builder braucht flache Strings");
  assert.equal(wf.menu, "• Gebratene Ente mit gelbem Curry – 10,90€\n• Pasta Capri – 9,90€\n• Hausgemachter Tiramisú – 5,90€");
  assert.match(String(wf.details), /^• Gebratene Ente mit gelbem Curry – 10,90€\n   würziges.+\n   Allergene: /);
  assert.match(String(wf.details), /Savoiardi Bisquit & Espresso/);
  for (const v of [wf.menu, wf.details]) assert.doesNotMatch(String(v), /[*_]|&amp;/, "Workflow-Variablen zeigen mrkdwn wörtlich an");
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

test("Zeitfenster 09:25–11:25 in Sommer- und Winterzeit", () => {
  // Crons direkt aus dem Workflow, damit Test und Zeitplan nicht auseinanderlaufen.
  const yml = readFileSync(new URL("../.github/workflows/update.yml", import.meta.url), "utf8");
  const crons = [...yml.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]!);
  const slots = (now: string) => crons.map((c) => slotOf(c, new Date(now)));
  const count = (list: string[]) => ({ retry: list.filter((s) => s === "retry").length, last: list.filter((s) => s === "last").length });
  // Beide Zeitzonen: vier Versuche (09:25–10:55) und genau ein letzter um 11:25.
  assert.deepEqual(count(slots("2026-09-24T12:00:00Z")), { retry: 4, last: 1 });
  assert.deepEqual(count(slots("2026-01-15T12:00:00Z")), { retry: 4, last: 1 });
  assert.equal(slotOf("25 9 * * 1-5", new Date("2026-09-24T12:00:00Z")), "last"); // 11:25 MESZ
  assert.equal(slotOf("25 10 * * 1-5", new Date("2026-01-15T12:00:00Z")), "last"); // 11:25 MEZ
  assert.equal(slotOf("55 9 * * 1-5", new Date("2026-09-24T12:00:00Z")), "skip"); // 11:55 MESZ
  assert.equal(slotOf("25 7 * * 1-5", new Date("2026-01-15T12:00:00Z")), "skip"); // 08:25 MEZ
  assert.equal(slotOf(undefined), "last"); // manuell oder lokal
  assert.throws(() => slotOf("*/30 7-10 * * 1-5"), /fester Minute und Stunde/);
});

test("Menü-Prüfung: Datum, Wochentag, Plausibilität", () => {
  const menu = parseMenu(htmlToLines(html), today)!;
  assert.equal(checkMenu(menu, "2026-09-24"), null);
  assert.match(checkMenu(menu, "2026-09-25")!, /noch 2026-09-24/);
  assert.match(checkMenu(menu, "2026-09-23")!, /schon 2026-09-24/);
  assert.match(checkMenu({ ...menu, weekday: "Freitag" }, "2026-09-24")!, /Wochentag passt nicht/);
  assert.match(checkMenu({ ...menu, date: "2026-09-31" }, "2026-09-31")!, /Ungültiges Datum/);
  assert.match(checkMenu({ ...menu, dishes: [] }, "2026-09-24")!, /Kein Mittagstisch/);
  assert.match(checkMenu({ ...menu, dishes: Array(11).fill(menu.dishes[0]) }, "2026-09-24")!, /viele Gerichte/);
  assert.match(checkMenu({ ...menu, dishes: [{ ...menu.dishes[0]!, priceEur: null }] }, "2026-09-24")!, /Preis/);
  assert.equal(checkMenu({ ...menu, weekday: "Freitag" }, null), null); // --force
  assert.match(checkMenu(null, null)!, /Kein Mittagstisch/);
});

const withPrice = (menu: Menu, price: number): Menu => ({
  ...menu,
  dishes: [{ ...menu.dishes[0]!, priceEur: price, price: `${price.toFixed(2).replace(".", ",")}€` }, ...menu.dishes.slice(1)],
});
const published = (menu: Menu, date = menu.date) => ({ ...menu, date, hash: menuHash(menu), fetchedAt: `${date}T09:30:00+02:00` });

test("höchstens einmal pro Tag senden", () => {
  const menu = parseMenu(htmlToLines(html), today)!;
  const day = "2026-09-24";
  const sent = published(menu);
  const yesterday = published(withPrice(menu, 12), "2026-09-23");
  assert.deepEqual(decide(menu, null, day), { action: "send" }); // noch nie veröffentlicht
  assert.deepEqual(decide(menu, yesterday, day), { action: "send" });
  assert.equal(decide(menu, sent, day).action, "done");
  assert.equal(decide(null, sent, day).action, "done"); // Seite später kaputt: kein Alarm
  assert.equal(decide(menu, yesterday, "2026-09-25").action, "wait"); // noch altes Menü
  assert.deepEqual(decide(withPrice(menu, 11.9), sent, day), { action: "update" });
  assert.deepEqual(decide(menu, sent, day, { force: true }), { action: "send" });
});

test("neues Datum mit den Gerichten von gestern: warten, beim letzten Versuch senden", () => {
  const menu = parseMenu(htmlToLines(html), today)!;
  const sameDishesYesterday = published(menu, "2026-09-23");
  assert.match((decide(menu, sameDishesYesterday, "2026-09-24") as { reason: string }).reason, /Gerichte aber noch die vom 2026-09-23/);
  assert.deepEqual(decide(menu, sameDishesYesterday, "2026-09-24", { last: true }), { action: "send" });
});

/** Io-Attrappe: zeichnet Versand und Veröffentlichung auf. */
function fakeIo(over: Partial<Io> = {}) {
  const calls = { sent: 0, written: 0, logs: [] as string[] };
  const io: Io = {
    published: async () => null,
    html: async () => html,
    send: async () => (calls.sent++, true),
    write: async () => void calls.written++,
    log: (m) => void calls.logs.push(m),
    ...over,
  };
  return { io, calls };
}
const now = new Date("2026-09-24T08:00:00Z");

test("Lauf: sendet und veröffentlicht", async () => {
  const { io, calls } = fakeIo();
  assert.equal(await run("retry", io, { now }), true);
  assert.deepEqual([calls.sent, calls.written], [1, 1]);
});

test("Lauf: Webhook fehlgeschlagen – vorher nichts veröffentlichen, zuletzt veröffentlichen und fehlschlagen", async () => {
  const early = fakeIo({ send: async () => false });
  assert.equal(await run("retry", early.io, { now }), true);
  assert.equal(early.calls.written, 0, "nächster Lauf soll erneut senden");

  const last = fakeIo({ send: async () => false });
  assert.equal(await run("last", last.io, { now }), false);
  assert.equal(last.calls.written, 1);
  assert.match(last.calls.logs.at(-1)!, /^::error::.*Kein Webhook zugestellt/);
});

test("Lauf: Seite nicht abrufbar, aber heute schon gesendet – kein Alarm", async () => {
  const menu = parseMenu(htmlToLines(html), today)!;
  const { io, calls } = fakeIo({ published: async () => published(menu), html: async () => Promise.reject(new Error("fetch failed")) });
  assert.equal(await run("last", io, { now }), true);
  assert.equal(calls.sent, 0);
  assert.match(calls.logs.join("\n"), /Heute bereits gesendet/);
});

test("Lauf: Seite nicht abrufbar und nichts gesendet – erst beim letzten Versuch Alarm", async () => {
  const down = { html: async () => Promise.reject(new Error("fetch failed")) };
  assert.equal(await run("retry", fakeIo(down).io, { now }), true);
  const last = fakeIo(down);
  assert.equal(await run("last", last.io, { now }), false);
  assert.match(last.calls.logs.at(-1)!, /^::error::Heute kein Mittagstisch gesendet\. Seite nicht abrufbar/);
});

test("Lauf: Status nicht lesbar – nichts senden", async () => {
  const { io, calls } = fakeIo({ published: async () => Promise.reject(new Error("HTTP 503")) });
  assert.equal(await run("last", io, { now }), false);
  assert.equal(calls.sent, 0);
  assert.match(calls.logs.at(-1)!, /Nicht prüfbar, ob heute schon gesendet wurde: HTTP 503/);
});

test("Lauf: Korrektur nach dem Senden nur veröffentlichen", async () => {
  const menu = parseMenu(htmlToLines(html), today)!;
  const { io, calls } = fakeIo({ published: async () => published(withPrice(menu, 12)) });
  assert.equal(await run("retry", io, { now }), true);
  assert.deepEqual([calls.sent, calls.written], [0, 1]);
});
