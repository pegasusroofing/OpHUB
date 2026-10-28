# OpHUB native app: rebuild roadmap (about 8 weeks)

The goal is to move OpHUB off the single HTML page (`app.html`, about 5 MB, carried inside the Capacitor phone apps) and onto a real app. That gives native iPhone and Android apps plus the same app on the office laptop, from one codebase, on the **same Supabase backend**.

Andy's summary doc is the "OpHUB — moving off the web page: roadmap" Claude Doc. This file is the working version for Claude Code.

## Decisions already made
- **Stack:**
  - React Native + **Expo** (managed workflow, latest stable SDK), **Expo Router**, **TypeScript strict**.
  - `@supabase/supabase-js` v2.
  - **TanStack Query** for server data and caching.
  - `expo-secure-store` for the session and the saved login (no raw passwords in plain storage).
  - `expo-image-picker` / `expo-camera`, `expo-location`, `expo-notifications`, `expo-file-system`, `expo-print` / `expo-sharing` for PDFs.
- **Web for the office:** Expo web export from the same code. Finance is laptop-first.
- **Same app identity:** `com.ophub.app`, "OpHUB Site App", so the new app arrives as an **update** in the stores. Andy's Apple and Google developer accounts carry over.
- **After launch:** most fixes go to phones over the air with EAS Update, with no store review. Only native changes (a new permission, a new native module) need a store release.
- **Keep today's look:** no redesign, to save time and tokens. Rebuild the current colours, spacing and layout as a small design system.
- **The backend is not rewritten.**
  - Same tables, RLS, functions, triggers and server functions.
  - During the rebuild, **only additive** database changes (see CLAUDE.md hard rule 2).
- **Freeze:** the old app gets bug fixes only from phase 2 onwards. New features go in the new app.

## Where the code goes
```
app-native/                  ← new Expo project (own package.json)
  app/                       ← Expo Router screens, grouped by role/area
    (auth)/  (operative)/  (driver)/  (pm)/  (admin)/  (finance)/
  src/
    lib/supabase.ts          ← client + secure-store session adapter
    lib/types.ts             ← generated: supabase gen types typescript
    lib/rules/               ← ported business rules (pure functions, unit-tested)
    data/                    ← one hook file per table/area (useSites, useBoq…)
    ui/                      ← design system (Button, Card, Pill, Table, Sheet…)
    offline/                 ← read cache + upload queue
  eas.json  app.config.ts
```
- **Add `app-native/` to a root `.vercelignore`,** so the current Vercel site never serves the new source.
- **The web build deploys as a separate Vercel project** for beta (for example `beta.operativehub.co.uk`). It moves to the main domain at switch-over.

## How to port each screen (parity first)
1. **Find the screen** in `FEATURE-INVENTORY.md`, then read the old source in `src/js`. Read it in full, **and every later file that wraps or overrides it**: files later in name order win, so check `grep -n "<functionName> *=" src/js/*`.
2. **Write down the rules** as pure functions in `src/lib/rules/`, with unit tests. Examples:
   - who can see what;
   - totals, VAT, retention, OHP;
   - date rules;
   - trial-mode blocks.
3. **Build the screen** with the design system.
4. **Check it side by side:** run the old app (test harness, same seed) and the new app at phone width (390) and laptop width (1300). Compare screenshots and numbers.
5. **Tick the line** in `FEATURE-INVENTORY.md` (add `✅ native`), or mark it `⛔ dropped (Andy agreed)`.

Never drop a rule silently. If the old code does something odd, keep it and add it to a "questions for Andy" list.

## Phases

| # | Phase | Weeks (about) | Ease |
|---|---|---|---|
| 0 | Set-up + foundations | 1–1.5 | Medium |
| 1 | Operatives and drivers | 1–1.5 | Easy–medium |
| 2 | PMs and site managers | 1.5–2 | Medium |
| 3 | Admin and office | under 1 | Medium |
| 4 | Finance | 2–3 | Hard |
| 5 | Switch-over | 1 | Medium |

Total: about **8 weeks** (6 at best, 10 at worst). This assumes Claude Code works most days, uses a few helpers in parallel on separate screens, and Andy can test on a phone within a day or two.

Token use: roughly **50–80 million** in total, perhaps up to a quarter more because parallel helpers each re-read the same old code. Reading the old code and screenshot testing cost more than writing. To keep it down: read only the files a screen needs, reuse the rules modules, and don't redesign.

### 0. Set-up + foundations (see PHASE-0-setup.md)
- **Project:** Expo project, EAS builds, generated database types, the design system and app shell (tabs and side menu on a laptop).
- **Sign-in and security:**
  - sign-in, with the saved email and password kept in secure storage;
  - password reset, invite-only join;
  - **device lock** (`check_device_lock_v2`, one phone per person, managers exempt), with the device id on check-ins.
- **Roles and access:** role routing for every role in CLAUDE.md, including Finance access (`profiles.finance_enabled`, `finance_hidden`) and per-company switches (`has_pm`, `has_finance`).
- **Company branding:** logo and colours.
- **Shared services:**
  - offline read cache;
  - upload queue for photos on poor signal;
  - **private files through signed links**, so it works when buckets go private;
  - push registration (check how `080-push-notifications.js` stores tokens and use the same table and columns).

### 1. Operatives and drivers
- **Operatives:**
  - home and inbox;
  - check in and out with GPS;
  - Schedule of Works with photos;
  - sign RAMS, COSHH, toolbox talks and daily briefings (signed briefings are locked);
  - snags (operative view), HAVS, PPE, holidays (HR leave);
  - expenses, messages and HUB.
- **Drivers:**
  - deliveries and collections, including marking a collection received;
  - **time off**: a single day or a range, with the "driver has a scheduled day off" block.
- **Beta:** on TestFlight and Google Play internal testing with 2–3 real staff.

### 2. PMs and site managers
- **Sites:** sites list, site home tiles (the **Price tile only when `site.price_enabled`**), team and assignments, calendar.
- **Site work:**
  - snags, variations (with value);
  - materials and orders to suppliers, yard stock;
  - drawings, reports, surveys.
- **H&S:**
  - the RAMS builder (numbers reserved by the database) and the COSHH builder;
  - permits, incidents, inductions, PUWER.
- **Commercial and admin:** price builder, repair contracts, handover O&M, plant, OneDrive sync.

### 3. Admin and office
- **Admin centre:** users and invites, company settings, HR policies, integrations (OneDrive, Xero connect).
- **Platform admin** (superadmin).
- **Other pages:** client signing (`sign.html`), the subcontractor portal and sign-up (`subcontractor.html`), `admin.html`.

### 4. Finance (laptop-first, still in TRIAL for RTB)
- **Jobs and overview:**
  - jobs grid, with the job-number pill a fixed size;
  - project overview with forecast and OHP. Invoice jobs show no Applied or Retention tiles, and invoiced overrides the forecast when higher.
- **Bill of Quantities:** pills, Add menu, Budgets, Issue as SOW, + on section rows, Select all.
- **Applications, certificates and retention:** application dates auto-filled from the application day.
- **Sales:** sales invoices and the **send pop-up** (subject, text and attachments; the server adds the signature).
- **Purchases:** POs, purchase invoices with expandable item lines and item search, quotes, plant.
- **Subcontractors and labour:** subcontractors and CIS, operative invoices.
- **Reports and records:** reports, budgets, Directory, statements, yard stock.
- **Xero and the finance inbox:** keep `FIN_TRIAL` behaviour exactly as the old app; nothing goes out for RTB.
- **Errors:** plain-English messages for every database or storage error (port `9219zw-plain-errors.js` as a shared helper).
- **Check:** compare totals with the old app on the same jobs, to the penny.

### 5. Switch-over
- **Store releases** under the same app id, so they arrive as an update.
- **Web:** the new web app goes on the main domain. The old `app.html` stays available at a fallback address for 2–4 weeks.
- **Then:** run SQL file 4 (private buckets) once no old builds are in use. Retire the 5-copy routine.

## Checks before each group of staff moves
- [ ] Every inventory line for that group is ticked or agreed as dropped.
- [ ] Unit tests for the rules pass. Side-by-side screenshots match on phone and laptop sizes.
- [ ] Andy (or the beta staff) has used it on a real phone for at least two working days.
- [ ] No destructive database change was needed (or Andy ran the SQL himself).
- [ ] The old app still works for anyone who hasn't moved (same database, so nothing to migrate).

## Things that need Andy
- **Expo account** in the company name. **Apple and Google developer logins** for EAS submit (he enters these himself; never type passwords for him).
- **Beta testers:** 2–3 staff (an operative, a driver, a PM).
- **Freeze:** agree it at the start of phase 2.
- **Look:** keep today's design (the default). A refresh would add about a week.
