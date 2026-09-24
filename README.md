# Tiny's House – Lunch Menu Feed

Unofficial feed for the daily lunch menu of [Tiny's House](https://tinyshouse.de/) in Ettlingen.
A GitHub Action checks the site Mon–Fri every 30 minutes from 09:30 to 11:30 (Europe/Berlin),
publishes `feed.xml` and `today.json` to GitHub Pages and optionally posts the menu to Slack.

## Schedule

- Only a menu dated today, whose weekday matches the date and whose dishes all have a name and price,
  is sent. Otherwise the run waits for the next attempt. If the date is new but the dishes are
  still yesterday's (page half updated), it also waits, and only sends them on the last attempt.
- At most one message per day: each run first reads the published `today.json`; if it already has
  today's date, nothing is sent. Corrections after that update the feed but are not sent again.
- If no webhook gets through, nothing is published, so the next attempt sends again.
- If nothing was sent by the last attempt (11:30, when the restaurant opens), that run fails and
  GitHub emails you (this also happens on holidays). A manual run counts as a last attempt; with
  "force" it sends again and ignores date and weekday.

## Setup

1. *Settings → Pages → Source:* **GitHub Actions**.
2. *Settings → Secrets and variables → Actions:*
   - Secret `WEBHOOK_URLS`: one or more URLs (comma or newline separated).
   - Variable `WEBHOOK_PAYLOAD`: `slack` (Incoming Webhook, default), `workflow` (Workflow Builder) or `raw` (full JSON).
3. *Actions → Mittagstisch aktualisieren → Run workflow* with "force" to test (sends even if already sent today).

## Slack Workflow Builder

Add these Text variables to the webhook trigger:

| Variable  | Content                                          |
| --------- | ------------------------------------------------ |
| `tag`     | "Mittagstisch Donnerstag, 24.09.2026"            |
| `menu`    | `• Name – Price` per dish                        |
| `details` | plus description and allergens (for the thread)  |
| `link`    | https://tinyshouse.de/                           |

Slack shows formatting inside variables literally, so all values are plain text.
The sender's name and icon are set in the workflow itself.

## Local

```bash
npm install
npm test && npm run typecheck
npm run feed -- --no-webhook                      # fetch live, only build public/
npm run feed -- --html test/fixtures/sample.html  # use saved HTML
```

If a run finds nothing, the site layout has probably changed: save the new HTML to
`test/fixtures/sample.html` and adjust `src/parse.ts`.
