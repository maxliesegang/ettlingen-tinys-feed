/**
 * Holt den heutigen Mittagstisch von tinyshouse.de, schreibt ihn als RSS (public/feed.xml) und
 * JSON (public/today.json) und löst die konfigurierten Webhooks aus. Es wird kein Verlauf
 * gespeichert; zeigt die Seite noch kein Menü von heute, wird nichts geschrieben.
 *
 *   npm run feed -- --no-webhook          live abrufen, nur Dateien bauen
 *   npm run feed -- --html seite.html     gespeichertes HTML verwenden
 *   npm run feed -- --force               auch ein Menü mit anderem Datum verwenden
 *
 * Umgebungsvariablen: WEBHOOK_URLS, WEBHOOK_PAYLOAD (slack | workflow | raw), FEED_URL
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { renderFeed } from "./feed";
import { SOURCE_URL, menuHash, titleOf } from "./format";
import { htmlToLines, parseMenu } from "./parse";
import { isoDate, nowIso, zoned } from "./time";
import type { PublishedMenu } from "./types";
import { parseMode, parseUrls, sendWebhooks } from "./webhooks";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

async function fetchHtml(): Promise<string> {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "tinys-mittagstisch-feed/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Abruf fehlgeschlagen: HTTP ${res.status}`);
  return res.text();
}

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: {
      html: { type: "string" },
      force: { type: "boolean", default: false },
      "no-webhook": { type: "boolean", default: false },
    },
  });

  // Alte Ausgabe entfernen: Die Action veröffentlicht nur, wenn public/ neu gebaut wurde.
  await rm(OUT, { recursive: true, force: true });

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

  const entry: PublishedMenu = { ...menu, hash: menuHash(menu), fetchedAt: nowIso() };
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "today.json"), JSON.stringify(entry, null, 2) + "\n", "utf8");
  await writeFile(join(OUT, "feed.xml"), renderFeed(entry, process.env.FEED_URL || undefined), "utf8");
  console.log(`${titleOf(menu)}: ${menu.dishes.length} Gerichte, public/ gebaut.`);

  if (!args["no-webhook"]) {
    await sendWebhooks(menu, parseUrls(process.env.WEBHOOK_URLS), parseMode(process.env.WEBHOOK_PAYLOAD));
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
