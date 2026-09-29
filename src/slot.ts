/**
 * Zeitfenster der Läufe. Bewusst ohne Imports: Die Action führt die Datei vor `npm ci` direkt mit
 * Node aus (`node src/slot.ts`), um unnötige Läufe früh zu beenden.
 *
 * Ausgelöst wird von einem externen Cron-Dienst (Mo–Fr alle 30 Minuten, 09:00–11:00 Berliner Zeit)
 * per workflow_dispatch mit `scheduled`, weil GitHub eigene geplante Läufe teils Stunden zu spät
 * startet. Die Rolle eines Laufs ergibt sich daher aus seiner Startzeit.
 */

/** Erster Versuch. */
export const FIRST = "09:00";
/** Ab hier letzter Versuch: Ohne gesendetes Menü schlägt der Lauf fehl. */
export const LAST = "11:00";
/** Ab hier öffnet das Restaurant; spätere Läufe enden ohne Senden und ohne Fehler. */
export const END = "11:30";

/** So viel früher darf ein Lauf starten, ohne dem vorigen Zeitfenster zugeordnet zu werden. */
const EARLY_MINUTES = 5;

export type Slot = "skip" | "retry" | "last";

const berlinTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/**
 * Ordnet einen Lauf dem Zeitfenster zu.
 *   skip  – vor FIRST oder ab END gestartet
 *   retry – später folgt noch ein Versuch
 *   last  – letzter Versuch des Tages; nur einer, damit GitHub höchstens einmal pro Tag benachrichtigt
 * Nicht geplante Läufe (manuell oder lokal) gelten immer als letzter Versuch.
 */
export function slotOf(scheduled: boolean, now: Date = new Date()): Slot {
  if (!scheduled) return "last";
  const started = minutes(berlinTime.format(now));
  if (started < minutes(FIRST) - EARLY_MINUTES || started >= minutes(END)) return "skip";
  return started >= minutes(LAST) - EARLY_MINUTES ? "last" : "retry";
}

if (import.meta.main) console.log(slotOf(process.env.SCHEDULED === "true"));
