import { SOURCE_URL, plainText, slackText, titleOf, workflowDetails, workflowDishes } from "./format";
import type { Menu, PayloadMode } from "./types";

export function buildPayload(menu: Menu, mode: PayloadMode): Record<string, unknown> {
  switch (mode) {
    case "workflow": // Slack Workflow Builder: nur flache Text-Variablen
      return { tag: titleOf(menu), menu: workflowDishes(menu), details: workflowDetails(menu), link: SOURCE_URL };
    case "raw":
      return { ...menu, title: titleOf(menu), text: plainText(menu), link: SOURCE_URL };
    case "slack": // Slack Incoming Webhook
      return { text: slackText(menu) };
  }
}

export function parseMode(value: string | undefined): PayloadMode {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "" || v === "slack") return "slack";
  if (v === "workflow" || v === "raw") return v;
  console.log(`::warning::Unbekannter WEBHOOK_PAYLOAD "${v}", verwende "slack".`);
  return "slack";
}

export function parseUrls(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\n]/)
    .map((u) => u.trim())
    .filter(Boolean);
}

/** Liefert false, wenn kein einziger Webhook zugestellt wurde (ohne URLs: true). */
export async function sendWebhooks(menu: Menu, urls: string[], mode: PayloadMode): Promise<boolean> {
  if (urls.length === 0) {
    console.log("Keine WEBHOOK_URLS gesetzt – überspringe Webhooks.");
    return true;
  }
  const body = JSON.stringify(buildPayload(menu, mode));
  const delivered = await Promise.all(
    urls.map(async (url, i) => {
      const label = `Webhook ${i + 1}/${urls.length}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        console.log(`${label} gesendet.`);
        return true;
      } catch (err) {
        // Nicht abbrechen, damit der Feed trotzdem aktualisiert wird. URL nicht loggen (Secret!).
        console.log(`::warning::${label} fehlgeschlagen: ${(err as Error).message}`);
        return false;
      }
    }),
  );
  return delivered.some(Boolean);
}
