# OpHUB handoff pack for Claude Code (28 Oct 2026)

This folder is what a new Claude Code session needs. It covers the current web app and the plan to rebuild it as a real app. Start with `CLAUDE.md` at the repo root, then this file.

| File | What it's for |
|---|---|
| `../../CLAUDE.md` | Rules, who Andy is, how the repo and backend fit together. Read every session. |
| `ROADMAP-native-app.md` | The 8-week rebuild plan: stack, folder layout, phases, checks before each group of staff moves. |
| `PHASE-0-setup.md` | The first job, step by step, and what "done" looks like. |
| `CURRENT-STATE.md` | What is live today, what's waiting (Push origin, SQL file 4, phone rebuild), open items. |
| `FEATURE-INVENTORY.md` | Every source file in `src/js` with its purpose. The parity checklist. |
| `context/finance-projects-map-v3.md` | How Projects and Finance link (each link marked OK / Broken / Missing). |
| `context/proposals.md` | P01–P32: agreed ideas for the missing links. |
| `context/still-to-do-27oct.md` | The open-items list as it stood before fix round 3 (see CURRENT-STATE for what's since done). |
| `context/OpHUB Review v3 - 27 Oct 2026.xlsx` | Full review workbook (findings, map, to-do). |
| `sql/1–4 *.sql` | Security SQL history. 1–3 are already run. **4 is not run yet**; see CURRENT-STATE for when. |

Also useful:
- `tools/test-harness/`: runs the current web app against a fake Supabase in Playwright (see its README).
- `supabase/functions/`: copies of the live server functions.

## How Andy works
- **Tasks come in short messages, often with a screenshot.** Do the task, check it with a screenshot, then reply in two or three plain lines.
- **Commits:** commit to the local repo. Tell him when to press **Push origin** in GitHub Desktop.
- **Phone apps:** they only change when he rebuilds them in Android Studio or Xcode, so say when a rebuild is needed.

## Helpers (set up 7 Nov 2026)
Three helpers live in `.claude/agents/`. Claude Code picks them up when it starts.
- **prepush-check:** before Andy presses Push origin.
  - Runs the types, unit tests, the screen tests for what changed and the old app's build and copies.
  - Checks Finance is still on trial and that no secrets are in the push.
  - Answers "safe to push" or "don't push, because…". Cheap; use every time.
- **bug-reviewer:** after a big batch of work. Traces every button in the changes through to what it saves and lists real bugs only. Costs more (about 200,000–350,000 tokens), so use it per batch, not per small change.
- **andy-ui-checker:** before showing Andy a screen.
  - Uses the changed screens on a laptop and a phone and checks them against his UI rules (SNAGS-2026-10-29.md, top).
  - Returns screenshots and anything that breaks a rule.
