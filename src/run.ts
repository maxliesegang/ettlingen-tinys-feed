import { decide } from "./check";
import { htmlToLines, parseMenu } from "./parse";
import type { Slot } from "./slot";
import { isoDate, zoned } from "./time";
import type { Menu, PublishedMenu } from "./types";

/** Zugriffe nach außen, für Tests austauschbar. */
export interface Io {
  /** Zuletzt veröffentlichtes Menü (today.json); null, wenn noch nie veröffentlicht. */
  published(): Promise<PublishedMenu | null>;
  html(): Promise<string>;
  /** false, wenn kein einziger Webhook zugestellt wurde. */
  send(menu: Menu): Promise<boolean>;
  /** Schreibt public/ – die Action veröffentlicht es danach. */
  write(menu: Menu): Promise<void>;
  log(message: string): void;
}

const NOT_SENT = "Heute kein Mittagstisch gesendet.";
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Ruft die Seite ab und liest das Menü. Die Seite liefert gelegentlich kurz eine Antwort ohne
 * Mittagstisch (HTTP 200) oder ist nicht erreichbar, eine Minute später aber wieder richtig –
 * daher bis zu `attempts` Abrufe. Der letzte Fehler wird weitergereicht.
 */
async function fetchMenu(io: Io, today: { year: number; month: number }, attempts: number, delayMs: number): Promise<Menu | null> {
  for (let attempt = 1; ; attempt++) {
    let problem: string;
    try {
      const html = await io.html();
      const lines = htmlToLines(html);
      const menu = parseMenu(lines, today);
      if (menu?.dishes.length) return menu;
      // Anfang der Seite ausgeben, damit sich im Log erkennen lässt, was stattdessen kam.
      // Ohne sichtbaren Text das rohe HTML zeigen (z. B. eine Seite nur aus Skript oder Weiterleitung).
      const start = lines.length ? lines.slice(0, 3).join(" | ") : html.replace(/\s+/g, " ").trim();
      problem = `Kein Mittagstisch gefunden. Seite (${lines.length} Zeilen, ${html.length} Zeichen) beginnt mit: "${start.slice(0, 200)}".`;
      if (attempt >= attempts) {
        io.log(problem);
        return menu;
      }
    } catch (err) {
      if (attempt >= attempts) throw err;
      problem = `Seite nicht abrufbar: ${message(err)}.`;
    }
    io.log(`${problem} Neuer Abruf in ${delayMs / 1000} s (${attempt}/${attempts}).`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

/**
 * Ein Lauf: höchstens einmal pro Tag senden, Korrekturen nur veröffentlichen.
 * Liefert false, wenn der Lauf fehlschlagen soll – nur beim letzten Versuch des Tages,
 * damit GitHub genau einmal benachrichtigt.
 */
export async function run(
  slot: Slot,
  io: Io,
  { force = false, now = new Date(), fetchAttempts = 1, fetchDelayMs = 60_000 } = {},
): Promise<boolean> {
  if (slot === "skip") {
    io.log("Außerhalb des Zeitfensters – übersprungen.");
    return true;
  }
  const last = slot === "last";
  const fail = (reason: string, prefix = NOT_SENT): boolean => {
    // Warnung statt Fehler: steht auf der Lauf-Seite, löst aber keine Benachrichtigung aus.
    if (last) io.log(`::error::${prefix} ${reason}`);
    else io.log(`::warning::${prefix === NOT_SENT ? "Noch nicht gesendet." : prefix} ${reason} Nächster Versuch in 30 Minuten.`);
    return !last;
  };

  const today = zoned(now);
  const todayIso = isoDate(today);

  let published: PublishedMenu | null;
  try {
    published = await io.published();
  } catch (err) {
    return fail(message(err), "Nicht prüfbar, ob heute schon gesendet wurde:");
  }
  const sentToday = !force && published?.date === todayIso;
  io.log(
    `Lauf: ${slot}${force ? " (--force)" : ""}, heute ${todayIso}, veröffentlicht: ` +
      (published ? `${published.date} (abgerufen ${published.fetchedAt})` : "nichts") +
      (sentToday ? " – heute bereits gesendet." : "."),
  );

  let menu: Menu | null;
  try {
    menu = await fetchMenu(io, today, sentToday ? 1 : fetchAttempts, fetchDelayMs);
  } catch (err) {
    if (sentToday) {
      io.log(`Heute bereits gesendet. Seite gerade nicht abrufbar: ${message(err)}`);
      return true;
    }
    return fail(`Seite nicht abrufbar: ${message(err)}`);
  }

  const decision = decide(menu, published, todayIso, { force, last });
  io.log(`Seite: ${menu ? `${menu.weekday} ${menu.date}, ${menu.dishes.length} Gerichte` : "kein Menü"} → ${decision.action}.`);
  switch (decision.action) {
    case "done":
      io.log(decision.reason);
      return true;
    case "wait":
      if (!force || !menu?.dishes.length) return fail(decision.reason);
      io.log(`::warning::${decision.reason} Wegen --force trotzdem gesendet.`);
      break;
    case "update":
      io.log("Menü wurde nach dem Senden korrigiert – nur Feed aktualisieren, keine Webhooks.");
      await io.write(menu!);
      return true;
  }

  if (!(await io.send(menu!))) {
    // Vor dem letzten Versuch nichts veröffentlichen, damit der nächste Lauf erneut sendet.
    if (!last) return fail("Kein Webhook zugestellt.");
    await io.write(menu!);
    return fail("Kein Webhook zugestellt, Menü trotzdem veröffentlicht.");
  }
  await io.write(menu!);
  return true;
}
