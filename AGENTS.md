# AGENTS.md

TypeScript (Node ≥ 24, ESM, run via `tsx`, no build step). Only runtime dependency: `htmlparser2`.

## Commands

- `npm test` – tests (`node:test`, `test/*.test.ts`)
- `npm run typecheck` – `tsc --noEmit`, strict + `noUncheckedIndexedAccess`
- `npm run feed -- --html test/fixtures/sample.html --no-webhook` – offline end-to-end run

Tests and typecheck must pass before every commit.

## Layout

`src/build.ts` (entry, network and files only) → `run.ts` (one run, I/O injected for tests) →
`parse.ts` (HTML → menu) → `check.ts` (validation, send/update/wait decision) → `feed.ts` / `format.ts` (output) →
`webhooks.ts` (delivery). Types in `types.ts`, Europe/Berlin time in `time.ts`.

Schedule: `.github/workflows/update.yml` runs every 30 min, 09:30–11:30 Berlin time. `src/slot.ts` maps the
triggering cron to skip/retry/last; it has no imports because the workflow runs it with plain Node before `npm ci`.
Cron entries must be fixed `M H * * …` values (one per time slot).

## Rules

- Code comments, log messages, test names and commit messages are German; keep it that way. README and AGENTS.md are English.
- Parse the visible page text, not CSS classes.
- Workflow Builder payload (`workflow`): flat strings only, **no** mrkdwn and no HTML escaping –
  Slack shows both literally. Add new fields to the Slack trigger before shipping them, and list them in the README table.
- `slack` mode (Incoming Webhook) may use mrkdwn and must escape `& < >`.
- Never log secrets (webhook URLs).
- No history: only the current menu exists; `public/` is build output and not committed.
- At most one message per day. The published `today.json` on GitHub Pages is the only state:
  if its `date` is today, it was sent. Don't add other state (commits, caches) without a reason.
- Only the last attempt (11:30) or a manual run may fail the workflow, so there's at most one alert email per day.
