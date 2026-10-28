# OpHUB test harness (current web app)

Playwright tests that load `app.html` against a **fake Supabase** held in memory — no real data is read or written.

```bash
cd tools/test-harness
npm install && npx playwright install chromium
# 90 routes for one role; a single "404 … fetching the script" line is expected
ROLE=pm node smoke.js
# one route, screenshot to shots/, optional JS to run and an expression to print
W=1300 EXTRA=./seeds/ex1.js ROUTES='#/site/SID0/finance' TAG=check NOFULL=1 \
  ACT="..." EVAL="document.title" node s1.js
```

- `APP=<path>` points at the build to test (default: the repo's `app.html`).
- `ROLE` = admin | pm | operative | driver. `W`/`H` = window size (W < 500 = phone).
- `SID0`, `SID1` in a route = the first / second seeded site.
- Seeds: `fresh/seed.js` (base), `seeds/ex1.js` (finance data), `seeds/ex2.js` (applications, SoW, yard).
  Add a scenario by writing a new seed that `require`s one of these and pushes extra rows.
