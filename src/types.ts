export interface Coded {
  /** Kürzel laut Legende der Webseite, z. B. "g" oder "4" */
  code: string;
  label: string;
}

export interface Dish {
  name: string;
  /** Beschreibung ohne Allergen-Kürzel */
  description: string;
  /** wie auf der Seite, z. B. "10,90€" */
  price: string;
  /** Preis in Euro als Zahl, z. B. 10.9 (null, wenn nicht lesbar) */
  priceEur: number | null;
  allergens: Coded[];
  additives: Coded[];
  /** Kürzel, die nicht in der Legende stehen (Tippfehler auf der Seite o. Ä.) */
  unknownCodes: string[];
  /** Nur ausdrücklich genannte Merkmale, z. B. "vegetarisch", "vegan" */
  tags: string[];
}

export interface Menu {
  /** ISO-Datum, z. B. "2026-09-24" */
  date: string;
  /** z. B. "Donnerstag" */
  weekday: string;
  dishes: Dish[];
}

export interface PublishedMenu extends Menu {
  /** Ändert sich mit dem Menü; Teil der RSS-guid, damit Korrekturen als neuer Eintrag erscheinen */
  hash: string;
  /** ISO-Zeitstempel mit Offset, z. B. "2026-09-24T10:10:03+02:00" */
  fetchedAt: string;
}

export type PayloadMode = "slack" | "workflow" | "raw";
