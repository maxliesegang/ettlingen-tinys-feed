/**
 * Holt den heutigen Mittagstisch von tinyshouse.de, schreibt ihn als RSS (public/feed.xml) und
 * JSON (public/today.json) und löst die konfigurierten Webhooks aus – höchstens einmal pro Tag.
 * Ob heute schon gesendet wurde, zeigt das bereits veröffentlichte today.json (SITE_URL).
 * Wird public/ nicht geschrieben, bleibt die bisherige Seite online.
 *
 *   npm run feed -- --no-webhook          live abrufen, nur Dateien bauen
 *   npm run feed -- --html seite.html     gespeichertes HTML verwenden
 *   npm run feed -- --force               senden, auch wenn schon gesendet oder das Datum nicht passt
 *
 * Umgebungsvariablen: WEBHOOK_URLS, WEBHOOK_PAYLOAD (slack | workflow | raw),
 * SITE_URL (Pages-Adresse), SCHEDULE (ausgelöster Cron, siehe src/slot.ts)
 *
 * Ablauf und Regeln stehen in src/run.ts und src/check.ts; hier nur Netzwerk und Dateien.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { renderFeed } from "./feed";
import { SOURCE_URL, menuHash, titleOf } from "./format";
import { run } from "./run";
import { slotOf } from "./slot";
import { nowIso } from "./time";
import type { Menu, PublishedMenu } from "./types";
import { parseMode, parseUrls, sendWebhooks } from "./webhooks";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const SITE_URL = process.env.SITE_URL?.replace(/\/+$/, "") || undefined;

async function get(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": "tinys-mittagstisch-feed/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
}

async function fetchHtml(): Promise<string> {
  const res = await get(SOURCE_URL);
  if (!res.ok) throw new Error(`Abruf fehlgeschlagen: HTTP ${res.status}`);
  return res.text();
}

/** Zuletzt veröffentlichtes Menü; null, wenn noch nie veröffentlicht. Netzwerkfehler brechen ab. */
async function fetchPublished(): Promise<PublishedMenu | null> {
  if (!SITE_URL) return null;
  // Zeitstempel umgeht den CDN-Cache von GitHub Pages (max-age 10 Minuten).
  const res = await get(`${SITE_URL}/today.json?t=${Date.now()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Veröffentlichtes today.json nicht lesbar: HTTP ${res.status}`);
  return (await res.json()) as PublishedMenu;
}

async function writeOutput(menu: Menu): Promise<void> {
  const entry: PublishedMenu = { ...menu, hash: menuHash(menu), fetchedAt: nowIso() };
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "today.json"), JSON.stringify(entry, null, 2) + "\n", "utf8");
  await writeFile(join(OUT, "feed.xml"), renderFeed(entry, SITE_URL && `${SITE_URL}/feed.xml`), "utf8");
  console.log(`${titleOf(menu)}: ${menu.dishes.length} Gerichte, public/ gebaut.`);
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

  const ok = await run(
    slotOf(process.env.SCHEDULE),
    {
      published: fetchPublished,
      html: () => (args.html ? readFile(args.html, "utf8") : fetchHtml()),
      send: async (menu) =>
        args["no-webhook"] ||
        sendWebhooks(menu, parseUrls(process.env.WEBHOOK_URLS), parseMode(process.env.WEBHOOK_PAYLOAD)),
      write: writeOutput,
      log: console.log,
    },
    { force: args.force },
  );
  if (!ok) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
