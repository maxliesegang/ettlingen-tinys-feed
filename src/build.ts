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
 * SITE_URL (Pages-Adresse), SLOT (skip | retry | last aus src/slot.ts; ohne: last)
 *
 * Ablauf und Regeln stehen in src/run.ts und src/check.ts; hier nur Netzwerk und Dateien.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { renderFeed } from "./feed";
import { SOURCE_URL, menuHash, titleOf } from "./format";
import { htmlToLines } from "./parse";
import { run } from "./run";
import { SLOTS, type Slot } from "./slot";
import { nowIso } from "./time";
import type { Menu, PublishedMenu } from "./types";
import { parseMode, parseUrls, sendWebhooks } from "./webhooks";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const SITE_URL = process.env.SITE_URL?.replace(/\/+$/, "") || undefined;

/** Antwort-Header, die bei der Fehlersuche helfen (Cache des Hosters, Weiterleitungen). */
const DEBUG_HEADERS = ["content-type", "x-proxy-cache", "x-proxy-cache-info", "location", "retry-after"];

/**
 * Header wie bei einem normalen Browser: Die Bot-Abfrage des Hosters (sgcaptcha) hat
 * GitHub-Runner mit dem eigenen User-Agent "tinys-mittagstisch-feed/1.0" ausgesperrt.
 */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
};

/** GET mit Log-Zeile: Status, Größe, Dauer und Debug-Header. */
async function get(label: string, url: string): Promise<{ status: number; body: string }> {
  const started = Date.now();
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  const headers = DEBUG_HEADERS.flatMap((h) => (res.headers.has(h) ? [`${h}: ${res.headers.get(h)}`] : []));
  console.log(
    `${label}: HTTP ${res.status}, ${body.length} Zeichen, ${Date.now() - started} ms` +
      (headers.length ? ` (${headers.join("; ")})` : ""),
  );
  return { status: res.status, body };
}

/** Inhalt der Startseite (WordPress-Seite 79) über die REST-API, ohne Theme drumherum. */
const API_URL = `${SOURCE_URL}wp-json/wp/v2/pages/79?_fields=content`;

/**
 * Startseite abrufen; ist sie unbrauchbar, den Seiteninhalt über die WordPress-API holen.
 * GitHub-Runner bekommen von der Startseite zeitweise eine Antwort ohne sichtbaren Text
 * (vermutlich die Bot-Abfrage des Hosters), von anderen Rechnern aber die richtige Seite.
 * Der Zeitstempel umgeht den Seiten-Cache des Hosters, damit keine veraltete Kopie kommt.
 */
async function fetchHtml(): Promise<string> {
  let problem: string;
  try {
    const { status, body } = await get("Startseite", `${SOURCE_URL}?t=${Date.now()}`);
    if (status === 200 && htmlToLines(body).length > 0) return body;
    problem = `HTTP ${status}, ${body.length} Zeichen: "${body.replace(/\s+/g, " ").trim().slice(0, 200)}"`;
  } catch (err) {
    problem = err instanceof Error ? err.message : String(err);
  }
  console.log(`::warning::Startseite unbrauchbar (${problem}) – Inhalt über die WordPress-API abrufen.`);
  const { status, body } = await get("WordPress-API", API_URL);
  if (status !== 200) throw new Error(`Startseite unbrauchbar (${problem}), WordPress-API: HTTP ${status}`);
  const html = (JSON.parse(body) as { content?: { rendered?: string } }).content?.rendered;
  if (!html) throw new Error(`Startseite unbrauchbar (${problem}), WordPress-API ohne Inhalt`);
  return html;
}

/** Zuletzt veröffentlichtes Menü; null, wenn noch nie veröffentlicht. Netzwerkfehler brechen ab. */
async function fetchPublished(): Promise<PublishedMenu | null> {
  if (!SITE_URL) return null;
  // Zeitstempel umgeht den CDN-Cache von GitHub Pages (max-age 10 Minuten).
  const { status, body } = await get("today.json", `${SITE_URL}/today.json?t=${Date.now()}`);
  if (status === 404) return null;
  if (status !== 200) throw new Error(`Veröffentlichtes today.json nicht lesbar: HTTP ${status}`);
  return JSON.parse(body) as PublishedMenu;
}

async function writeOutput(menu: Menu): Promise<void> {
  const entry: PublishedMenu = { ...menu, hash: menuHash(menu), fetchedAt: nowIso() };
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "today.json"), JSON.stringify(entry, null, 2) + "\n", "utf8");
  await writeFile(join(OUT, "feed.xml"), renderFeed(entry, SITE_URL && `${SITE_URL}/feed.xml`), "utf8");
  console.log(`${titleOf(menu)}: ${menu.dishes.length} Gerichte, public/ gebaut.`);
}

function parseSlot(value: string | undefined): Slot {
  if (!value) return "last";
  if ((SLOTS as readonly string[]).includes(value)) return value as Slot;
  throw new Error(`SLOT "${value}" unbekannt, erlaubt: ${SLOTS.join(", ")}.`);
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
    parseSlot(process.env.SLOT),
    {
      published: fetchPublished,
      html: () => (args.html ? readFile(args.html, "utf8") : fetchHtml()),
      send: async (menu) =>
        args["no-webhook"] ||
        sendWebhooks(menu, parseUrls(process.env.WEBHOOK_URLS), parseMode(process.env.WEBHOOK_PAYLOAD)),
      write: writeOutput,
      log: console.log,
    },
    // Live-Seite bis zu dreimal abrufen (siehe fetchMenu in src/run.ts), lokale Datei einmal.
    { force: args.force, fetchAttempts: args.html ? 1 : 3 },
  );
  if (!ok) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
