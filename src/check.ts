import { menuHash } from "./format";
import { isoDate } from "./time";
import type { Menu, PublishedMenu } from "./types";

const MAX_DISHES = 10;

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/**
 * Prüft, ob das Menü von heute ist und plausibel aussieht. Liefert den Grund, falls nicht.
 * Mit todayIso = null (--force) werden Datum und Wochentag nicht geprüft.
 */
export function checkMenu(menu: Menu | null, todayIso: string | null): string | null {
  if (!menu || menu.dishes.length === 0) return "Kein Mittagstisch auf der Seite gefunden (Feiertag? Layout geändert?).";
  if (todayIso) {
    if (menu.date < todayIso) return `Seite zeigt noch ${menu.date}, heute ist ${todayIso}.`;
    if (menu.date > todayIso) return `Seite zeigt schon ${menu.date}, heute ist ${todayIso}.`;
    const [y, m, d] = menu.date.split("-").map(Number);
    const date = new Date(Date.UTC(y!, m! - 1, d));
    const actual = WEEKDAYS[date.getUTCDay()];
    if (isoDate({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }) !== menu.date) {
      return `Ungültiges Datum auf der Seite: ${menu.date}.`;
    }
    if (actual !== menu.weekday) return `Wochentag passt nicht: Seite zeigt ${menu.weekday}, ${menu.date} ist ein ${actual}.`;
  }
  if (menu.dishes.length > MAX_DISHES) return `Unplausibel viele Gerichte (${menu.dishes.length}) – Layout geändert?`;
  const broken = menu.dishes.find((d) => !d.name || d.priceEur === null);
  if (broken) return `Gericht ohne Namen oder lesbaren Preis: "${broken.name}" ${broken.price}`;
  return null;
}

export type Decision =
  | { action: "send" } //      heute noch nicht gesendet: veröffentlichen und Webhooks auslösen
  | { action: "update" } //    heute schon gesendet, Menü korrigiert: nur Feed aktualisieren
  | { action: "done"; reason: string } //  heute schon gesendet, nichts zu tun
  | { action: "wait"; reason: string }; // noch kein gültiges Menü von heute

/**
 * Entscheidet anhand des veröffentlichten today.json, ob gesendet, aktualisiert oder gewartet wird.
 * last: letzter Versuch des Tages – dann wird auch ein Menü gesendet, das dem vorigen gleicht.
 */
export function decide(
  menu: Menu | null,
  published: PublishedMenu | null,
  todayIso: string,
  { force = false, last = false } = {},
): Decision {
  const sentToday = !force && published?.date === todayIso;
  const problem = checkMenu(menu, force ? null : todayIso);
  if (problem) return sentToday ? { action: "done", reason: `Heute bereits gesendet. ${problem}` } : { action: "wait", reason: problem };
  const hash = menuHash(menu!);
  if (!sentToday) {
    // Datum schon aktualisiert, Gerichte noch nicht: Die Seite wird vermutlich gerade bearbeitet.
    if (!force && !last && published?.hash === hash) {
      return { action: "wait", reason: `Datum ist neu, Gerichte aber noch die vom ${published.date}.` };
    }
    return { action: "send" };
  }
  return published.hash === hash ? { action: "done", reason: "Heute bereits gesendet, Menü unverändert." } : { action: "update" };
}
