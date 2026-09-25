/**
 * Zeitfenster der geplanten Läufe. Bewusst ohne Imports: Die Action führt die Datei vor
 * `npm ci` direkt mit Node aus (`node src/slot.ts`), um unnötige Läufe früh zu beenden.
 */

/**
 * Berliner Zeit, zu der alle 30 Minuten geprüft wird: kurz vor :00 und :30, weil GitHub
 * Läufe zur vollen und halben Stunde oft verspätet oder gar nicht startet. Um 11:30 öffnet das Restaurant.
 */
export const WINDOW = { first: "09:25", last: "11:25" };

export type Slot = "skip" | "retry" | "last";

const berlinTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Ordnet einen geplanten Lauf dem Zeitfenster zu. Maßgeblich ist der ausgelöste Cron (UTC),
 * nicht die Startzeit, weil GitHub geplante Läufe oft verspätet startet.
 *   skip  – Cron gehört zur anderen Sommer-/Winterzeit oder liegt außerhalb des Fensters
 *   retry – später folgt noch ein Versuch
 *   last  – letzter Versuch des Tages; ohne gesendetes Menü schlägt der Lauf fehl
 * Ohne Cron (manueller oder lokaler Lauf) gilt jeder Lauf als letzter Versuch.
 */
export function slotOf(schedule: string | undefined, now: Date = new Date()): Slot {
  if (!schedule) return "last";
  const m = /^(\d{1,2})\s+(\d{1,2})\s/.exec(schedule.trim());
  if (!m) throw new Error(`Cron "${schedule}" muss mit fester Minute und Stunde beginnen, z. B. "25 7 * * 1-5".`);
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number(m[2]), Number(m[1]));
  const slot = berlinTime.format(utc);
  if (slot < WINDOW.first || slot > WINDOW.last) return "skip";
  return slot === WINDOW.last ? "last" : "retry";
}

if (import.meta.main) console.log(slotOf(process.env.SCHEDULE));
