/**
 * Zeitfenster der Läufe. Bewusst ohne Imports: Die Action führt die Datei vor `npm ci` direkt mit
 * Node aus (`node src/slot.ts`), um unnötige Läufe früh zu beenden.
 *
 * Ausgelöst wird von einem externen Cron-Dienst (Mo–Fr um :29 und :59, 09:29–11:59 Berliner Zeit)
 * per workflow_dispatch mit `scheduled`, weil GitHub eigene geplante Läufe teils Stunden zu spät
 * startet. Die Rolle eines Laufs ergibt sich daher aus seiner Startzeit.
 */

/** Erster Versuch. */
export const FIRST = "09:29";
/**
 * Vorletzter Versuch: Ohne gesendetes Menü schlägt auch dieser Lauf schon fehl, damit vor dem
 * letzten Versuch noch Zeit zum Eingreifen bleibt (z. B. wenn der Hoster die Runner aussperrt).
 */
export const ALERT = "10:59";
/** Letzter Versuch, kurz bevor das Restaurant um 11:30 öffnet: Ohne gesendetes Menü schlägt der Lauf fehl. */
export const LAST = "11:29";
/**
 * Spätere Läufe enden ohne Senden und ohne Fehler – auch der 11:59-Lauf des Cron-Dienstes, damit es
 * nur einen letzten Versuch gibt. Der Abstand zu LAST fängt einen verspäteten Start des letzten ab.
 */
export const END = "11:45";

/** So viel früher darf ein Lauf starten, ohne dem vorigen Zeitfenster zugeordnet zu werden. */
const EARLY_MINUTES = 5;

export const SLOTS = ["skip", "retry", "alert", "last"] as const;
export type Slot = (typeof SLOTS)[number];

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
 *   alert – wie retry, schlägt aber ohne gesendetes Menü fehl (Vorwarnung vor dem letzten Versuch)
 *   last  – letzter Versuch des Tages; nur einer, damit nicht noch der 11:59-Lauf benachrichtigt
 * Nicht geplante Läufe (manuell oder lokal) gelten immer als letzter Versuch.
 */
export function slotOf(scheduled: boolean, now: Date = new Date()): Slot {
  if (!scheduled) return "last";
  const started = minutes(berlinTime.format(now));
  if (started < minutes(FIRST) - EARLY_MINUTES || started >= minutes(END)) return "skip";
  if (started >= minutes(LAST) - EARLY_MINUTES) return "last";
  return started >= minutes(ALERT) - EARLY_MINUTES ? "alert" : "retry";
}

if (import.meta.main) console.log(slotOf(process.env.SCHEDULED === "true"));
