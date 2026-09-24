import { SOURCE_URL, escapeXml as x, htmlDescription, titleOf } from "./format";
import { nowIso, rfc822 } from "./time";
import type { StoredMenu } from "./types";

export function renderFeed(items: StoredMenu[], feedUrl?: string): string {
  const entries = items
    .map(
      (it) => `    <item>
      <title>${x(titleOf(it))}</title>
      <link>${SOURCE_URL}</link>
      <guid isPermaLink="false">tinyshouse-${it.date}-${it.hash}</guid>
      <pubDate>${rfc822(it.fetchedAt)}</pubDate>
      <description>${x(htmlDescription(it))}</description>
    </item>`,
    )
    .join("\n");

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
${entries}
  </channel>
</rss>
`;
}
