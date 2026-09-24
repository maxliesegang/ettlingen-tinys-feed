import { createHash } from "node:crypto";
import type { Dish, Menu } from "./types";

export const SOURCE_URL = "https://tinyshouse.de/";

export function titleOf(menu: Menu): string {
  const [y, m, d] = menu.date.split("-");
  return `Mittagstisch ${menu.weekday}, ${d}.${m}.${y}`;
}

/** "vegetarisch · Allergene: Eier, Weichtiere · Zusatzstoffe: mit Geschmacksverstärker(n)" */
export function dishInfo(d: Dish): string {
  return [
    d.tags.join(", "),
    d.allergens.length ? `Allergene: ${d.allergens.map((a) => a.label).join(", ")}` : "",
    d.additives.length ? `Zusatzstoffe: ${d.additives.map((a) => a.label).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function plainText(menu: Menu): string {
  return menu.dishes
    .map((d) => [`${d.name} – ${d.price}`, d.description, dishInfo(d)].filter(Boolean).join("\n"))
    .join("\n");
}

const escSlack = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Gerichte als Slack-mrkdwn-Liste; auch für den Workflow Builder (Variable "menu"). */
export function slackDishes(menu: Menu): string {
  return menu.dishes
    .map((d) =>
      [`• *${escSlack(d.name)}* – ${d.price}`, d.description && `   _${escSlack(d.description)}_`, dishInfo(d) && `   ${escSlack(dishInfo(d))}`]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

export function slackText(menu: Menu): string {
  return [
    `*${escSlack(titleOf(menu))}* (Abholung 11:30–13:30)`,
    slackDishes(menu),
    `<${SOURCE_URL}|Zur Webseite / bestellen>`,
  ].join("\n");
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function htmlDescription(menu: Menu): string {
  const items = menu.dishes
    .map((d) => {
      const info = dishInfo(d);
      return `<li><b>${escapeXml(d.name)}</b> – ${escapeXml(d.price)}<br/>${escapeXml(d.description)}${info ? `<br/><small>${escapeXml(info)}</small>` : ""}</li>`;
    })
    .join("");
  return `<ul>${items}</ul><p>Abholung 11:30–13:30 · <a href="${SOURCE_URL}">Bestellen</a></p>`;
}

export function menuHash(menu: Menu): string {
  return createHash("sha256").update(JSON.stringify(menu.dishes)).digest("hex").slice(0, 16);
}
