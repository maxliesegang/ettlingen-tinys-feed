/**
 * Legende von https://tinyshouse.de/zusatzstoffe-und-allergene/ (EU-Verordnung 1169/2011).
 * Ziffern = Zusatzstoffe, Buchstaben = Allergene.
 */
export const ADDITIVES: Record<string, string> = {
  "1": "mit Farbstoff(en)",
  "2": "mit Konservierungsstoff(en)",
  "3": "mit Antioxidationsmittel",
  "4": "mit Geschmacksverstärker(n)",
  "5": "mit Schwefeldioxid",
  "6": "mit Schwärzungsmittel",
  "7": "mit Phosphat",
  "8": "mit Milcheiweiß",
  "9": "koffeinhaltig",
  "10": "chininhaltig",
  "11": "mit Süßungsmittel",
  "12": "enthält eine Phenylalaninquelle",
  "13": "gewachst",
  "14": "mit Taurin",
};

export const ALLERGENS: Record<string, string> = {
  a: "Glutenhaltig (Weizen)",
  b: "Fisch",
  c: "Krebstiere",
  d: "Eier",
  e: "Erdnüsse",
  f: "Soja",
  g: "Milch / Laktose",
  h: "Schalenfrüchte",
  i: "Sellerie",
  j: "Senf",
  k: "Sesam",
  l: "Sulfite",
  m: "Lupinen",
  n: "Weichtiere",
};
