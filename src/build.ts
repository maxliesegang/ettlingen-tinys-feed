/**
 * Holt den Mittagstisch von tinyshouse.de, pflegt daraus einen RSS-Feed (docs/feed.xml) sowie
 * JSON (docs/today.json = heutiges Menü, docs/menu.json = letzte 30 Tage) und löst bei einem neuen Menü die konfigurierten Webhooks aus.
 *
 *   npm run feed -- --no-webhook          live abrufen, nur Feed bauen
 *   npm run feed -- --html seite.html     gespeichertes HTML verwenden
 *   npm run feed -- --force               auch ohne Änderung senden
 *
 * Umgebungsvariablen: WEBHOOK_URLS, WEBHOOK_PAYLOAD (slack | workflow | raw), FEED_URL
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { renderFeed } from "./feed";
import { SOURCE_URL, menuHash, titleOf } from "./format";
import { htmlToLines, parseMenu } from "./parse";
import { isoDate, nowIso, zoned } from "./time";
import type { StoredMenu } from "./types";
import { parseMode, parseUrls, sendWebhooks } from "./webhooks";

const DOCS = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
const STATE_FILE = join(DOCS, "menu.json");
const FEED_FILE = join(DOCS, "feed.xml");
const TODAY_FILE = join(DOCS, "today.json");
const MAX_ITEMS = 30;

async function fetchHtml(): Promise<string> {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "tinys-mittagstisch-feed/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Abruf fehlgeschlagen: HTTP ${res.status}`);
  return res.text();
}

async function loadItems(): Promise<StoredMenu[]> {
  try {
    const data = JSON.parse(await readFile(STATE_FILE, "utf8")) as { items?: StoredMenu[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: {
      html: { type: "string" },
      force: { type: "boolean", default: false },
      "no-webhook": { type: "boolean", default: false },
    },
  });

  const today = zoned();
  const todayIso = isoDate(today);
  const html = args.html ? await readFile(args.html, "utf8") : await fetchHtml();
  const menu = parseMenu(htmlToLines(html), today);

  if (!menu || menu.dishes.length === 0) {
    console.log("Kein Mittagstisch auf der Seite gefunden (Feiertag? Layout geändert?).");
    return;
  }
  if (menu.date !== todayIso && !args.force) {
    console.log(`Seite zeigt ${menu.date}, heute ist ${todayIso} – noch kein neues Menü.`);
    return;
  }

  const hash = menuHash(menu);
  const items = await loadItems();
  const previous = items.find((it) => it.date === menu.date);
  if (previous?.hash === hash && !args.force) {
    console.log(`Menü für ${menu.date} unverändert.`);
    return;
  }

  const entry: StoredMenu = { ...menu, hash, fetchedAt: nowIso() };
  const updated = [entry, ...items.filter((it) => it.date !== menu.date)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_ITEMS);

  await mkdir(DOCS, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify({ items: updated }, null, 2) + "\n", "utf8");
  await writeFile(TODAY_FILE, JSON.stringify(entry, null, 2) + "\n", "utf8");
  await writeFile(FEED_FILE, renderFeed(updated, process.env.FEED_URL || undefined), "utf8");
  console.log(`${titleOf(menu)}: ${menu.dishes.length} Gerichte, Feed aktualisiert.`);

  if (!args["no-webhook"]) {
    await sendWebhooks(menu, parseUrls(process.env.WEBHOOK_URLS), parseMode(process.env.WEBHOOK_PAYLOAD));
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
