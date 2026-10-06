# Tiny's House – Lunch Menu Feed

Unofficial feed for the daily lunch menu of [Tiny's House](https://tinyshouse.de/) in Ettlingen.
A GitHub Action checks the site Mon–Fri at :29 and :59 from 09:29 to 11:29 (Europe/Berlin),
publishes `feed.xml` and `today.json` to GitHub Pages and optionally posts the menu to Slack.

## Schedule

- Only a menu dated today, whose weekday matches the date and whose dishes all have a name and price,
  is sent. Otherwise the run waits for the next attempt. If the date is new but the dishes are
  still yesterday's (page half updated), it also waits, and only sends them on the last attempt.
- At most one message per day: each run first reads the published `today.json`; if it already has
  today's date, nothing is sent. Corrections after that update the feed but are not sent again.
- If no webhook gets through, nothing is published, so the next attempt sends again.
- If nothing was sent by the second-to-last attempt (10:59), that run fails as an early warning,
  so there's still time to react. If nothing was sent by the last attempt (11:29, before the
  restaurant opens at 11:30), that run fails too. GitHub emails you each time (this also happens
  on holidays). A manual run counts as a last attempt; with "force" it sends again and ignores
  date and weekday.
- GitHub sometimes starts its own scheduled runs hours late, so an external cron service triggers
  the attempts (see Setup). A run's role follows from its start time; runs before 09:24 or from
  11:45 on are skipped: no message, no alert.

## Setup

1. *Settings → Pages → Source:* **GitHub Actions**.
2. *Settings → Secrets and variables → Actions:*
   - Secret `WEBHOOK_URLS`: one or more URLs (comma or newline separated).
   - Variable `WEBHOOK_PAYLOAD`: `slack` (Incoming Webhook, default), `workflow` (Workflow Builder) or `raw` (full JSON).
3. *Actions → Mittagstisch aktualisieren → Run workflow* with "force" to test (sends even if already sent today).
4. External trigger, e.g. [cron-job.org](https://cron-job.org/), one job:
   - Fine-grained token for this repository only, permission *Actions: Read and write*.
   - Schedule `29,59 9-11 * * 1-5`, time zone Europe/Berlin (the 11:59 run is skipped).
   - `POST https://api.github.com/repos/OWNER/REPO/actions/workflows/update.yml/dispatches`,
     headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`,
     body `{"ref":"main","inputs":{"scheduled":"true"}}`.
   - Turn on the service's failure notifications: if it stops, nothing runs and GitHub won't alert you.

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
