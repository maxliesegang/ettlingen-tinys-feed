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
 * Ein Lauf: höchstens einmal pro Tag senden, Korrekturen nur veröffentlichen.
 * Liefert false, wenn der Lauf fehlschlagen soll – nur beim letzten Versuch des Tages,
 * damit GitHub genau einmal benachrichtigt.
 */
export async function run(slot: Slot, io: Io, { force = false, now = new Date() } = {}): Promise<boolean> {
  if (slot === "skip") {
    io.log("Außerhalb des Zeitfensters – übersprungen.");
    return true;
  }
  const last = slot === "last";
  const fail = (reason: string, prefix = NOT_SENT): boolean => {
    if (last) io.log(`::error::${prefix} ${reason}`);
    else io.log(`${reason} Nächster Versuch in 30 Minuten.`);
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

  let menu: Menu | null;
  try {
    menu = parseMenu(htmlToLines(await io.html()), today);
  } catch (err) {
    if (sentToday) {
      io.log(`Heute bereits gesendet. Seite gerade nicht abrufbar: ${message(err)}`);
      return true;
    }
    return fail(`Seite nicht abrufbar: ${message(err)}`);
  }

  const decision = decide(menu, published, todayIso, { force, last });
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
