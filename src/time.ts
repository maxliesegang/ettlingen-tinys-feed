export const TIME_ZONE = "Europe/Berlin";

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** z. B. "+02:00" */
  offset: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function zoned(date: Date = new Date(), timeZone = TIME_ZONE): ZonedParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const offset = (parts.timeZoneName ?? "GMT").replace("GMT", "") || "+00:00";
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    offset,
  };
}

export function isoDate(p: Pick<ZonedParts, "year" | "month" | "day">): string {
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Aktueller Zeitpunkt als ISO-String in Berliner Zeit, z. B. "2026-09-24T10:10:03+02:00" */
export function nowIso(date: Date = new Date()): string {
  const p = zoned(date);
  return `${isoDate(p)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${p.offset}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** RFC-822-Datum für RSS, z. B. "Thu, 24 Sep 2026 10:10:03 +0200" */
export function rfc822(iso: string): string {
  const p = zoned(new Date(iso));
  const weekday = DAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
  return `${weekday}, ${pad(p.day)} ${MONTHS[p.month - 1]} ${p.year} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)} ${p.offset.replace(":", "")}`;
}
