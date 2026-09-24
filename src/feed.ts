import { SOURCE_URL, escapeXml as x, htmlDescription, titleOf } from "./format";
import { nowIso, rfc822 } from "./time";
import type { PublishedMenu } from "./types";

/** Feed mit genau einem Eintrag: dem aktuellen Menü. */
export function renderFeed(menu: PublishedMenu, feedUrl?: string): string {
  const entry = `    <item>
      <title>${x(titleOf(menu))}</title>
      <link>${SOURCE_URL}</link>
      <guid isPermaLink="false">tinyshouse-${menu.date}-${menu.hash}</guid>
      <pubDate>${rfc822(menu.fetchedAt)}</pubDate>
      <description>${x(htmlDescription(menu))}</description>
    </item>`;

  const self = feedUrl
    ? `\n    <atom:link href="${x(feedUrl)}" rel="self" type="application/rss+xml" />`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Tiny's House – Mittagstisch</title>
    <link>${SOURCE_URL}</link>
    <description>Täglicher Mittagstisch von Tiny's House, Ettlingen (inoffiziell)</description>
    <language>de-de</language>
    <lastBuildDate>${rfc822(nowIso())}</lastBuildDate>${self}
${entry}
  </channel>
</rss>
`;
}
