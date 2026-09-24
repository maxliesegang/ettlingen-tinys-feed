import { Parser } from "htmlparser2";
import { ADDITIVES, ALLERGENS } from "./allergens";
import type { Coded, Dish, Menu } from "./types";

// Block-Elemente erzeugen Zeilenumbrüche, Inline-Elemente (strong, em, span …) nicht.
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "figcaption", "figure",
  "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol",
  "p", "pre", "section", "table", "td", "th", "tr", "ul",
]);
const SKIP = new Set(["script", "style", "noscript", "template", "svg"]);

const DAY_RE = /^(MONTAG|DIENSTAG|MITTWOCH|DONNERSTAG|FREITAG|SAMSTAG|SONNTAG)\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.?/i;
const PRICE_RE = /^\d+,\d{2}\s*€$/;
const END_MARKER = "Alle Angaben ohne Gewähr";
// Kürzel-Klammer wie "(4,d,n)" oder "(a, g)"; andere Klammern im Text bleiben stehen.
const CODES_RE = /\s*\(\s*((?:\d{1,2}|[a-z])(?:\s*[,;]\s*(?:\d{1,2}|[a-z]))*)\s*\)/gi;
const TAGS: [string, RegExp][] = [
  ["vegan", /\bvegan/i],
  ["vegetarisch", /\bvegetarisch/i],
];

/**
 * Wandelt HTML in sichtbare Textzeilen um. Bewusst Text statt Elementor-CSS-Klassen,
 * weil sich die Klassen bei jeder Bearbeitung der Seite ändern können.
 */
export function htmlToLines(html: string): string[] {
  let text = "";
  let skipDepth = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        if (SKIP.has(name)) skipDepth++;
        if (BLOCK.has(name)) text += "\n";
      },
      onclosetag(name) {
        if (SKIP.has(name)) skipDepth = Math.max(0, skipDepth - 1);
        if (BLOCK.has(name)) text += "\n";
      },
      ontext(chunk) {
        if (skipDepth === 0) text += chunk;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();

  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Sucht "WOCHENTAG - TT.MM" und sammelt Gerichte (Name, Beschreibung…, Preis) bis zum Hinweistext. */
export function parseMenu(lines: string[], today: { year: number; month: number }): Menu | null {
  const start = lines.findIndex((l) => DAY_RE.test(l));
  if (start === -1) return null;

  const m = DAY_RE.exec(lines[start]!)!;
  const day = Number(m[2]);
  const month = Number(m[3]);
  const year = month === 12 && today.month === 1 ? today.year - 1 : today.year; // Jahreswechsel
  const weekday = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase();

  const dishes: Dish[] = [];
  let buf: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith(END_MARKER)) break;
    if (PRICE_RE.test(line)) {
      const [name, ...desc] = buf;
      if (name) dishes.push(parseDish(name, desc.join(" "), line));
      buf = [];
    } else {
      buf.push(line);
    }
  }

  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, weekday, dishes };
}

/** Zerlegt ein Gericht in Name, Beschreibung, Preis und die Kürzel für Allergene/Zusatzstoffe. */
export function parseDish(rawName: string, rawDesc: string, rawPrice: string): Dish {
  const codes: string[] = [];
  const strip = (s: string) =>
    s
      .replace(CODES_RE, (_, list: string) => {
        codes.push(...list.split(/[,;]/).map((c) => c.trim().toLowerCase()));
        return "";
      })
      .replace(/\s+([.,;])/g, "$1")
      .trim();

  const name = strip(rawName);
  const description = strip(rawDesc);
  const price = rawPrice.replace(/\s+/g, "");
  const value = Number(price.replace("€", "").replace(",", "."));

  const allergens: Coded[] = [];
  const additives: Coded[] = [];
  const unknownCodes: string[] = [];
  for (const code of new Set(codes)) {
    if (ALLERGENS[code]) allergens.push({ code, label: ALLERGENS[code] });
    else if (ADDITIVES[code]) additives.push({ code, label: ADDITIVES[code] });
    else unknownCodes.push(code);
  }

  const text = `${name} ${description}`;
  const tags = TAGS.filter(([, re]) => re.test(text)).map(([tag]) => tag);
  if (tags.includes("vegan") && !tags.includes("vegetarisch")) tags.push("vegetarisch");

  return {
    name,
    description,
    price,
    priceEur: Number.isFinite(value) ? value : null,
    allergens,
    additives,
    unknownCodes,
    tags,
  };
}
