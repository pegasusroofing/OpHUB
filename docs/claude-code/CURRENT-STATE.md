# Current state (28 Oct 2026)

## Code
- **Laptop repo:** branch `main`. Fix round 3 (`2349a21`) is pushed and live on the website. The handoff pack commit (`65e6613`) adds docs only; Push origin sends it to GitHub.
- **Fix round 3** (in those commits):
  - Variation values reach Finance.
  - The old role comes back when Finance is switched off.
  - Unread badges count one-person messages.
  - Hidden MC tiles are blocked by direct link.
  - The Schedule of Works crash is fixed.
  - The Finance link is checked in Finance-only companies.
  - Reopening a PO restores its site requests.
  - Check-ins carry the device id.
  - OneDrive status.
  - RAMS numbers come from the database.
  - Inbox filing is one server step.
  - The app works with public **or** private buckets.
- **Recent features:**
  - Bill of Quantities tidy-up; purchase invoices with expandable lines.
  - Invoice-only jobs (no Applied/Retention); application dates auto-filled.
  - The send pop-up for invoices and applications.
  - Driver time off, with the delivery block.
  - The Price tile only when ticked in project admin.
  - Saved password on login.
  - Plain-English errors across Finance.
- **Phone apps:** they still carry an older app.html and need rebuilding (App Builder → Android Studio / Xcode) to get the recent changes.

## Database (Supabase `dtrfupmcazoioubhwdml`)
- **SQL files 1–3:** done (security batches and materials).
- **Applied 26–27 Oct (additive):**
  - `fin_fill_defaults`, `driver_time_off` + `delivery_driver_off_check`, `edge_email_log`;
  - bank holidays past 2028, the `hr_leave` approval guard, the device lock at check-in, the collection-received rule;
  - more manager-only field guards, locked signed briefings, `rams_take_numbers`, `fin_inbox_file`, `onedrive_status`, `variation_value_insert_guard`.
- **SQL file 4 (`sql/4 - OpHUB fixes (27 Oct).sql`): NOT run.** It makes 9 storage buckets private. Run it only after **all** of these, in this order:
  1. ~~Push origin~~ (done: the website has the private-file-ready app).
  2. Update 6 server functions to sign files instead of building public links: `client-sign`, `send-expenses-email`, `send-price-builder-email`, `send-site-induction-email`, `send-subcontractor-inspection-email`, and `send-document-email` (multi-file).
  3. Rebuild the phone apps, and make sure everyone has updated.
  4. Andy pastes SQL file 4 into Supabase › SQL Editor.

  If the native app is close, it's fine to wait and do this at switch-over instead.
- **SQL file 15:** run 5 Nov (purchase invoices approve themselves).
- **SQL file 16:** run 7 Nov (Andy asked). Companies can save their own Query With Supplier wording.
- **SQL file 17:** run 7 Nov (Andy asked), sections A–F; checked on Sandbox.
  - Emailed invoices (and ones a PM books) no longer approve themselves; typed-in ones still do.
  - `fin_raise_po` is scoped to the job and company.
  - No faked system notices.
  - PO file records and moved calendar events stay in the company.
  - The approver is stamped by the database.
  - Three look-ups need a sign-in.
  - The finance-inbox comment "never auto-approved" is true again.
- **Expense receipts go to Finance (7 Nov, Andy asked; additive migration `expense_receipts_into_finance_7nov`):**
  - Trigger `zz_expense_to_finance` on `expenses`: each receipt file sent in becomes a `fin_inbox` item (source `upload`, `extracted.receipt = true` plus expense_id, category, note, label, sent_by), assigned to `fin_settings.expenses_user`. One-off items were added for the receipts already sent in (8 RTB, 1 other).
  - The photo stays in `site-photos` at `expenses/<org>/…`. Both apps open `finance-docs` paths starting `expenses/` from `site-photos` (`openDocLink` in the new app, `publicUrl` in the old one).
  - New app: Received shows "Receipt For <name>"; the invoice screen opens as a receipt with a line ready (fuel → Prelims & site costs); Finance Settings › Purchase invoices › "Expense receipts go to".
  - **POs to OneDrive (7 Nov, Andy asked):** whenever the new app files a PO's PDF in the project's PO folder (the "File In Project PO Folder" tick, Export PDF, Email PO), `pushPoToOneDrive` also copies it into the job's linked OneDrive "Material PO's" folder (`sites.material_orders_folder_id`) through the existing `onedrive-upload` function, under the same name as in OpHUB, so `sync-material-orders` skips it rather than bringing it back. No folder linked: OpHUB only. Not held back by the Finance trial (it's the company's own OneDrive). Can't be tried for real until OneDrive is reconnected. Old app unchanged.
  - Not used (kept, harmless): `expenses.fin_status / fin_cost_id / fin_booked_at / fin_booked_by`, `fin_book_expense`, `fin_skip_expense` (from a first try with a separate Expenses tab, dropped at Andy's request).
- **Company Chat (7 Nov, Andy asked; additive migration `company_chat_7nov`, copy in `docs/claude-code/sql/company-chat-7nov.sql`):**
  - New tables `company_chat` (org, sender, sender_name, body, mentions uuid[], created_at; no update or delete) and `company_chat_reads` (when each person last opened it, for the red count). RLS: same company and `company_chat_member()` (everyone but clients and subcontractor logins).
  - Triggers on the new table only: `company_chat_before` (sender, name, time; keeps only tags of people in the same company) and `zz_company_chat_mentions` (a one-person `messages` row, kind `message`, body "X tagged you in Company Chat: …" for each tag, which pushes to their phone; one-person messages are never emailed). The app knows a tag by that wording (`isChatTag`). The messages kind list wasn't changed.
  - New app: the HUB (`pm/hub.tsx`) has tabs Everything / Projects / Finance / Company Chat with red counts. Finance brings in fin_inbox items assigned to you (status new), pending wage_pushes on your jobs, invoice queries (`pi_query`, cleared once you reply or the office sorts it) and PM replies, plus Finance's to-do list for Finance users. Each item drops off once dealt with; tapping a message marks it read. Inbox has a Company Chat tab for everyone else. Checked by `hub-check.js`.
  - Found and fixed: the PM's invoice query page (`pm/piquery/[pi]`) never loaded (an unbound `supabase.rpc`).
- **Repair contracts rebuilt in the new app (7 Nov, Andy; plan in `REPAIRS-PLAN.md`). Additive migrations `repairs_rebuild_7nov` and `repairs_quotes_7nov` (copies in `docs/claude-code/sql/repairs-rebuild-7nov.sql`, `repairs-quotes-7nov.sql`):**
  - New on `repair_jobs`: tenant name / phone / no., priority, fault and repair descriptions, completed_in_visit, works booking (date, operative, event), on hold + reason, other trades + date, invoice_id, GPS (from the postcode via postcodes.io), quote_lines, quote_discount_pct. `checkins.repair_job_id`. New tables `repair_job_notes` (everyone on the contract incl. the client reads and adds) and `repair_rates` (schedule of rates per contract); `sites.repair_discount_pct`; function `repair_contract_vat(site)` (the contract's VAT treatment for anyone on it).
  - Stages (To Book, Booked In, Attended, Quote, Approved, Works Done; Invoiced / Paid in Finance) are worked out from the fields and the old `job_status` (`lib/rules/repairStages.ts`), so the 109 existing jobs land in place with nothing rewritten. Every new-app action also writes the old `job_status`, as the old app is still live for repairs.
  - Screens: contract home four tiles; Works Orders (managers: stage boxes, + New Job reading the works order incl. tenant; operatives: their jobs by booking day, Show All; client: every job); job hub (`components/RepairHub.tsx`, Finance adds Money and Raise Invoice); repair page tab; operative check-in by GPS and steps (`components/RepairOperative.tsx`); quote screen and Schedule Of Rates; Finance › project › Works Orders with Invoice Done Jobs. Attendance Report replaces the Survey Report; OneDrive job folder: Survey Photos, Completion Photos, the works order and reports. Checked by `repairs-check.js`.
  - Later on 7 Nov (Andy): no money in Projects (quote pricing and the schedule of rates moved to `/fin/job/[id]/quote/[job]` and `/fin/job/[id]/rates`); Works Orders is one shared screen (`components/WorksOrders.tsx`) used by Projects and Finance › **Live Jobs** (in place of the BoQ / Variations tab for a repair contract), with Andy's box names (To Schedule … Completed Works - Paid, All Jobs), + New Job across the top, boxes down the left with the jobs on the right on the laptop, and ticking done jobs onto one invoice in Finance. One tenant (name and phone). Adding a job makes its OneDrive folder in the contract's folder (new server function `onedrive-repair-folder`, verify_jwt off like the other OneDrive functions; asks to link the contract's folder if there isn't one). Booked For tappable; attendance wording (fault found / repair required / completed whilst in attendance, default No); the attendance report on the repair page and the operative's page; quote Save ▾ (Not Sent Yet / Awaiting Approval / Client Approved / Client Rejected); NHF schedule of rates upload (every sheet; category, heading, code, title) with Category ▾ / Item ▾ / search on the quote; Finance set-up "Contract Rates?" Yes → discount and upload; a Repair Booked row with other trades (booked dates, done, their own photos); Works Done notes any time; Mark Job As Complete; reports open to read (no OneDrive question). Repair contracts are billed by invoice unless set, and Project Financials hides retention / final / application dates as soon as Invoice is picked; the Projects client is used when Finance has none. Additive migrations `repairs_rates_trades_7nov` and `repair_jobs_paid_7nov` (copy in `docs/claude-code/sql/repairs-rates-trades-7nov.sql`).
  - Then (7 Nov, Andy): **due dates** from the priority (`lib/rules/repairDue.ts`: a time in it, else Emergency 24 hours, Urgent 7 days, Routine 28 days; `repair_jobs.due_at`, set on adding, changeable in Job Details) with an Overdue box; **No Access** visits (operative: photo of the card left and what happened; office: Update ▾ › Record No Access) — the booking comes off and the job goes back to be booked, kept in `repair_jobs.no_access`, charged on the invoice at the contract's No Access Charge; **client approves online** as a switch in Finance › Project Admin (`sites.repair_online_approval`): Save & Send To Client opens a send pop-up and emails the quote PDF with an Approve Or Reject Online button (new function `send-repair-quote`, held back in the Finance trial except Sandbox; `action: 'link'` just gives the link, for Copy Approval Link), the client's page is `quote.html` at the site root (public, plain script) answered by new function `repair-quote-decision` (by the job's random `quote_token`; opening the page decides nothing), which marks the job approved / rejected and adds a note; **rates Less or Plus** (a minus `repair_discount_pct` is an uplift). Migrations `repairs_noaccess_due_online_7nov`, `repairs_quote_online_7nov`. Checks: `repairs-check.js` (60), `quote-page-check.js` (7).
- **Statements (7 Nov):** the table's filter row (no separate search on a laptop), Gross After Statement Date column, the statement date and total due read better (`stmtDateFromText`, `stmtBalance`), Upload Statement, a reconciled statement locked with a green banner. Reconciling doesn't touch Xero (the Xero link has read-only payments scope); Andy (7 Nov): leave it as it is — no Xero change.
- **`sites.estimating_linked_at` (7 Nov, additive migration `sites_estimating_linked_at_7nov`):** set by the new app when a job's estimating folder is linked; Project Admin then stops offering Link Estimating Folder (a quote already linked to the job counts too).

## Server functions
- `send-finance-email` v5 (subject, text, extra attachments, signature with company number, VAT, email and logo).
- 30 send and notify functions hardened. Repo copies are in `supabase/functions/`.
- The `xero` and `finance-inbox` repo copies match live.
- When redeploying, keep each function's `verify_jwt` setting as it is live.
- `finance-report-run` (verify_jwt off): the repo copy of `book.ts` is one line ahead of live (6 Nov 2026: draft POs, `purchase_orders.is_draft`, are not counted as ordered). Redeploy it with the next server deploy; until then the scheduled reports count a draft PO as ordered.
- **Recommended at the next server deploy (overnight review, 7 Nov):** server-side Finance trial guards.
  - `xero` and `send-finance-email` don't check the trial themselves. Only the apps do.
  - Copy finance-inbox's `FIN_TRIAL` / `FIN_SANDBOX_ORGS` check into both:
    - `xero`: refuse `push_*` and `create_contact` unless the company is Sandbox;
    - `send-finance-email`: refuse after the caller lookup.
  - Remove the guards when the trial ends.
  - Also: `finance-ai-read` has `*` CORS (it still needs a sign-in) and no daily limit; finance-inbox's comment "never auto-approved" is out of date until SQL 17 section A is run.
- `send-hs-email` v2 (3 Nov, verify_jwt on): H&S documents and signature sheets from the new app.
- `rams-ai-draft` v3 (4 Nov, verify_jwt on): the AI RAMS writer.
  - Company admins only, because each draft is a paid AI call (Andy, 4 Nov).
  - The app asks "additional feature, charged per build" (Yes / No) before every build.
  - Each successful build emails the platform admin(s): company, who, job, and the company's builds this month, for billing. These emails are logged in `edge_email_log`.
  - It uses the same `ANTHROPIC_API_KEY` secret as `finance-ai-read`.
  - 30 drafts a day per company. Each call is logged in the new table `ai_usage_log`, which only admins can read.

## Native app: Phase 0 (started 28 Oct 2026)
- **Built:** `app-native/` (Expo SDK 58, TypeScript strict). See `app-native/README.md`.
  - Sign-in with saved login, password reset, invite join.
  - Profile and company loading, and the device lock (checked again at every start).
  - An empty home for each role: phone tabs, or a left menu on a wide screen.
  - Shared services: offline cache, upload queue, signed links, push registration.
  - `eas.json` build profiles.
- **Tested in the laptop browser:** the sign-in page and its errors, the invite check, the reset page, and the redirect to sign-in when signed out. Signed-in screens still need a real login (Andy).
- **Still to do in Phase 0:**
  - Expo account and EAS login (Andy).
  - The first preview build for Andy's phone.
  - Firebase set-up for Android push: `google-services.json`, held as an EAS file secret, not committed.
  - Using the existing Play Store signing key (`App Builder/ophub-release-key.jks`) through `eas credentials`.
  - The full database types (`npx supabase login`, then `npm run gen:types`).
- **Found while porting:**
  - **iPhone push:** the server sends through Firebase (FCM v1). The current iOS app has no Firebase file, so iPhone pushes probably don't arrive today. The native app on iPhone will need Firebase iOS set up, or the push functions taught to use APNs/Expo.
  - **Device lock at switch-over:** the native app gets a new device id. Each operative's first sign-in on the new app will show up as a new device to approve.
  - **Web output:** the web build is a single-page app (`npm run build:web`). It isn't on Vercel yet.

## Native app: Phase 1 (operatives and drivers): built, awaiting testing
- **Built:**
  - Operative home, My projects and the job page, with the Getting Started checklist.
  - The compulsory H&S Policy gate.
  - Check In / Out, including multi-address jobs.
  - Schedule of Works with the photo upload queue.
  - H&S: RAMS, COSHH, toolbox talks and daily briefings (read and sign), the H&S Policy, PPE, HAVS, PUWER, My Tools, and My signature.
  - My dashboard: certificates and My Tools.
  - Messages & tasks, and the job Messages page.
  - Snagging and variations, plus expenses.
  - Driver app: check in/out with breaks, schedule, collections, completion photos, push and re-open, vehicle checklist and time off.
- **Rules:** 82 unit tests in `app-native/src/lib/rules` (`npm test`).
- **Phase 1 is built.** Next: Andy tests it on the web and on a phone build. LOLER moves to Phase 2, because it uses the report-form engine.
- **Moved to Phase 2:** holidays (HR) are managers-only in the old app.
- **Noticed for Phase 3:** the old app forces a new company's admin through Company Setup (logo and colours) before anything else.
- **Known gaps carried to Phase 2:**
  - signed-TBT PDF email on auto-close;
  - all PDF exports and emails;
  - photo mark-up;
  - report traffic-light colours;
  - the office's driver check-in log.
- **Questions for Andy:**
  - RAMS/COSHH rows now have a "View document" link for operatives. The old operative row had none. Keep it?
  - The old "Monday vehicle check before check-in" gate was never switched on. Should it be?
- **Phase 2 (PMs and site managers), built so far, awaiting testing:**
  - PM home, On site now, the full job page tiles, and the job's Settings & Admin (details, Main Contractor, Multi-Site addresses, Repair Contract, team assignments, job status, Price switch), Activity History and Client Info.
  - Manager side of Check In / Out (geofence, team status, history, PM logins), Schedule of Works tools, job Messages, Variations (decide, value, add to SoW).
  - Materials: requests, sending orders to suppliers, Collections, goods received (GRN), Ordered By The Office, yard stock and booking stock in (drivers too), Material PO's.
  - Drawings, Spec's & Programme; the job Calendar; the To Do List.
  - Expenses now sits inside Materials and follows the job's visibility setting, as in the current app.
  - Reports & surveys (form engine), LOLER, Daily Briefings, permits, incidents, inductions, Main Contractor and subcontractor pages, Plant, the manager H&S tools.
  - PM home pages: the HUB (notifications), all-projects Reports, To do and Calendar, the office Delivery Schedule (day view, add/edit, moves, To schedule, driver hours), the Operatives dashboard (record, certificates, tools; also the job's H&S › Operatives tile), HR (holiday calendar, requests, settings, policies and handbook), the Company Dashboard.
  - PDFs: reports and surveys, Snagging, Schedule of Works (full or a period), Variations, signed RAMS / COSHH (stamped boxes + signature record), signed Toolbox Talks, incident reports — export and email.
  - More PDFs: HAVS, PUWER, PPE issuance records, Daily Briefings with signatures, signed policy / handbook records.
  - Phase 3 started — Admin Centre: front page with search, Users, Invites, Device Locks, Check-In Logs, Driver Check-In Log, Subcontractor sign-up, Suppliers, HAVS Tools, H&S Policy, PPE Log, Toolbox Talk Templates, Company Logo & Theme, Expenses Email, Report Template builder, Schedule of Works Library (plus From Library on each job), Main Contractor Subcontractor Library, RAMS Library (hazards, safe systems, method statements, templates, company details), COSHH Library (products with H/P codes, assessments in folders, export / email), Price Sheet Rate Card and Terms. On each job: RAMS Builder (start from templates or other jobs, edit, preview, issue as RA + MS PDFs to sign), Create COSHH, Add from COSHH Library, Save to COSHH Library. Signing Templates and signature boxes on any job RAMS (web / office laptop only — phones can't draw on the PDF), with a template picked at upload and a test fill. OneDrive (connection, Quick Links, folder links on jobs, Material PO's, inductions, repair jobs). Still in the current app: loading the RAMS starter library, reading codes off a COSHH data sheet automatically, the rate card Excel download / upload, wiping the whole COSHH folder library.
  - Job page: Handover (data sheets, guarantees, O&M manual list), maintenance / repair contracts (job hub, lists, full job page), the Price tile (pricing elements, figures, variations to price).
- Phase 5 (Finance) built in the new app, trial rules kept (nothing goes out: no Xero posting, no finance emails, no inbox auto-reading, no PM pushes, no POs or new jobs from Finance — the sandbox company excepted): Overview, Projects and Clients, Sales (applications, invoices, retention), Purchases (POs, purchase invoices, inbox filing, supplier statements matched to invoices, plant hire, suppliers, price book, yard stock with rates, book in / issue / return / adjust), Subcontractors & Labour (operative invoices with CIS, pay run, subcontract POs and applications with certify / pay less / paid + CIS record, CIS month), each project's Finance page (summary, cost to date, retention and release invoices, Set-up, client POs), Detailed Summary, costs ledger, budget, variations, Bill of Quantities, sales invoices (VAT per line, issue + PDF, payments, void), applications (valuation, Applied, certificate, invoice), Directory (clients, suppliers, labour, cost codes), Settings, 15 reports, day works register, monthly project report, retention release invoices. Excel / PDF downloads of every report, Detailed Summary Excel (a sheet per tab), PO PDF, payment / pay less notice PDF. Still in the current app: emailing invoices / applications / POs (off during the trial anyway), uploading a new statement, plot groups in the monthly report, new project form, BoQ import from Excel.
- Also built in the new app (29 Oct 2026): Training Matrix (grid, Excel, PDF); Excel / PDF of the PPE Log and the PPE Register; Delivery Schedule Excel / PDF (7 days from the day shown) and the managers' Driver view; Repair Tracker Excel, route-order exports (Survey, Scaffold, Approved) with "View last route", and Approved & Ready oldest-first. Excel files are made in the app itself (lib/rules/xlsx.ts), no library needed.
- Also built (29 Oct 2026, later): O&M manuals (new from the job, edit cover / sections / tables / maintenance / photos / appendix, PDF with data sheets, guarantees, COSHH and drawings attached, email; Word export still in the current app); repair Survey and Completed Works report PDFs; several reports as one PDF; completed toolbox talks - signed PDF / email of ticked talks; Add to phone calendar (.ics); send a job RAMS to the client to sign. Then: Price Sheets (build from the rate card, draft, issue to a price tile with access and Schedule of Works tasks, edit, un-issue, delete, PDF / Excel / email) and the weekly build-up on each price tile (operatives, extras, costs; sheet-fed tiles book qty per line with the wages check and share-out). Then: bulk add repair jobs from work orders (and fill a new job from its work order), export / email all completed inductions, subcontractor toolbox talks on the job TBT page, the PM's time off on the job calendar, the RAMS starter library. Then: O&M Word export, supplier statement upload (PDF / Excel / CSV, read in the app), BoQ import (Excel / CSV / PDF), reading Safety Data Sheets into COSHH products, moving a delivery to any drop (⇄), vehicle health checks for managers. Excel files are read in the app (lib/rules/xlsxRead.ts, office laptop). Still in the current app (smaller): Finance new-project form for Finance-only companies, PO pricing from a quote file, monthly report plot groups and its Excel / PDF, rate card Excel download / upload, password resets and the Finance switch on Users, OneDrive certificate sync, PM Reports page multi-export and completed-TBTs page, labour invoices on a price tile, drawings folder visibility / OneDrive import / key dates from an Excel programme / mark-up, PPE request summary PDF, report filling offline / "add another item" / drawing mark-up, copying the site schedule into a BoQ.
- Also built (29 Oct 2026, last round): price files and labour invoices with who-can-see ticks; finance users and own Finance hide in Users; superadmin password reset; rate card Excel download / upload; Completed TBTs across jobs and merged report PDFs; requested-PPE PDF; BoQ ↔ Schedule of Works copy both ways; price a PO from a supplier quote file (price book learns); monthly report by plot / repair job with Excel / PDF; Finance new-project form (Finance-only companies and the sandbox only); OneDrive certificate sync on each operative; who-can-see-this on drawings folders and Schedule of Works sections; OneDrive import and copy for drawings; key dates read from an Excel programme; drawing mark-up in reports (numbered pins for ticked items, colours follow the condition); + Add another item; reports kept on the phone with no signal and sent later.
- Also built (29 Oct 2026, leftovers): photo mark-up (pen, arrow, circle, text) on snag photos and on delivery booking / completion photos; zoom (− / + up to 4×, ✋ Move) in mark-up; who-can-see-this on single ungrouped Schedule of Works tasks.
- Also built (29 Oct 2026, final gaps): Schedule of Works import from Excel / CSV / PDF, the office copy of the schedule (managers-only, remove), tagging tasks to a subcontractor on main-contractor jobs; the signed Toolbox Talk emailed to the PM when the last operative signs; Price tile colour groups set up from each tile.
- Andy's snag list (29 Oct 2026, evening) is all done: see `SNAGS-2026-10-29.md`. New job form (Directory client suggestions, contact on one row, required start date), Schedule of Works (slider, pre-start photos, Yes / No to complete, faster), Check In (GPS radius shown, small exports), Drawings (built-in viewer, mark-up, back trail, OneDrive sync), Materials (Order from Merchant / Yard Stock / Close Request, delivery drop-down with operative collection, supplier search with favourites, grouped collections, yard bookings under Completed), project settings (slim bars, status drop-down), To Do list. App-wide: every date is a calendar, every pop-up has an x and opens beside the tap, Yes / No questions, no "saved" toasts. New column: `material_required_items.group_id` (nullable). Next: the OPEN items left in `PARITY-AUDIT.md`.
- Also built (29 Oct 2026, audit gaps): show / hide H&S, Plant and Expenses tiles per role; HAVS manager screen (log for operatives, tools on site, close / reopen week, completed weeks); in-app subcontractor form for operatives; check-ins Excel; certificates export / email as one PDF; Settings page (phone, Admin Centre, Show Finance) and how-to tips; managers' Projects page (search, tabs, PM filter, status / PM menus, + New project); saved-client picker; materials import from Excel; Search (Ctrl+K); Platform Admin with support mode; clients / subcontractor companies land on their projects; a new company's admin sets up the logo first.
- Look and feel matched to the current app (29 Oct 2026, side by side with the sandbox): fonts (IBM Plex Sans / Sora / Plex Mono), left menu and top bar on the laptop, Home (tiles, stat boxes, Sites map card + full Sites map page), Projects, job home page (job no. + on-site pill, Finance money strip, stat boxes, centred tiles), the Projects › job › page trail and job-home button on every job page, Schedule of Works, H&S and the other tile pages, RAMS / COSHH, check-in, Materials and Material Requests (five tab boxes, Pick from a project quote), Delivery Schedule, both calendars (month grid with items in each day; application dates and supplier deliveries added — they were missing), Admin Centre hub. Fixed on the way: Finance never loaded a project's set-up (contract value, billing type) because `job_finance` has no `id` column. Then (second round): HUB, Company Dashboard, Reports & surveys (+ General surveys card, Sites Map in the left menu), Operatives (Training Matrix exports, Operative Tools), HR (list rows), and OpHUB Finance (left-aligned header, Finance › trail, underline tabs with Directory, flat cards, coloured figures, Needs Attention, and tables with totals bars for Projects, Sales and Purchases on a computer). Third round: a project's Finance page (Home / job / + New bar, Forecasted final account card, tinted tiles), Finance Reports (groups that open), Directory (clients table) and Finance settings (sections that open). Not in the new app yet: the old Finance settings sections "Who can see material costs" and "Invoice inbox (email)".
- **Function-by-function check (29 Oct 2026):** every old file compared with the new app. Findings, with FIXED / OPEN against each, are in `docs/claude-code/PARITY-AUDIT.md`. All HIGH items are FIXED except the Finance PO builder (waits for the trial to end). Next: the MED OPEN ones (39), then LOW, before switch-over.
- **Overnight 29–30 Oct 2026:** every non-trial MED item in `PARITY-AUDIT.md` is FIXED (BoQ tools, PO builder from ticked lines, PI line coding, filters, Purchase Quotes / price lists, Xero settings, Finance-only companies, O&M attachments, reports with no signal, COSHH from data sheets, plan mark-up select). The two trial-parked MED items stay parked (they send things). Then LOW items, line by line, each in its own commit with a `tools/test-harness/*-check.js`.
- **LOW items done (30 Oct 2026):** multi-site address close / reopen; library template preview; leftover photo view; SoW Excel import template; SoW email tick list; snag fix photo from library; Inspections page manages templates and lists subcontractor inspections; RAMS: subcontractor RAMS per company, delete superseded, Multi-page sign tick; clients see signed status (no sign box); Site Inductions OneDrive folder change / unlink; Company Library from the job; small copies of old SoW photos; mark-up Select tool for lines / arrows / circles; briefing delete logged; HAVS / PUWER Export Selected; certificates emailed to a picked PM; suppliers from Excel / CSV; O&M cover photo from the phone; Inbox taps for delivery problems / invoice queries; voided invoices folded away. Still LOW OPEN: see `PARITY-AUDIT.md` (lines marked LOW OPEN — about 30, mostly Finance screens, several of them TRIAL).
- **Bug fixed (30 Oct 2026):** 42 "fire and forget" writes in the new app never reached the database, because Supabase only sends a query when it is awaited. That included Activity History entries and the "new RAMS / COSHH / TBT needs signing" and snag / variation / to-do notices. All now send.
- **Still in the current app for now:** PDF drawings in reports on phones (photo instead, or the office laptop).
- **Android test build:** `b979c2f7…` was queued on Expo's free plan when last checked.

## Button-by-button deep dive (30 Oct 2026)
- Eight checks compared every old file with the new app, button by button. The list and its ticks are in `DEEP-DIVE-2026-10-30.md`.
- All HIGH and MED items are done, except that one HIGH needed no change (the database already marks collected goods as received).
- Every item on that list is now done, including the last small ones (30 Oct 2026). Trial items stay parked.
- Added on the way: `react-native-webview`, for signature boxes on phones (`components/NativePdfPage.tsx`). The phone apps need a rebuild to include it.
- Not yet tested on real phones: everything so far was tested in the browser against the fake database in `tools/test-harness`. `run-all.sh` runs all the checks. First things to try on a phone: camera, signing, GPS, push, and signature boxes (the page picture and dragging inside a scrolling page have never run on a phone).
- Seen but not exercised by any test: repair job "Signed off by" line, separate PDFs for briefings, over-PO flag on inbox filing, one supplier per PO from quotes, bulk reopen question, PPE Export link, Open Inspections button. The price sheet email still uses send-document-email, not send-price-builder-email.

## Press-every-button run (31 Oct 2026)
About 14,000 presses across 173 screens, every role, computer and phone size, on the fake database. No crashes. What it found, what was fixed and what still can't be tested: `TEST-COVERAGE-2026-10-31.md`.

Then the same run on Sandbox Roofing against the real database, admin only: 138 screens, 4,423 presses, no crashes, nothing sent out. Found repair photos not loading, Finance project delete never working, yard rates not loading, and refused saves looking successful; all fixed. Same file has the details and what it didn't cover.

## Projects does everything a PM needs; Finance is only the money (Andy, 8 Nov 2026)
- **Variations:** an approved variation is taken through the client in Projects (To Issue → Issued To Client → Client Approved with who instructed it, their ref and date / Client Rejected), with its instruction documents. Finance's register follows by itself (database trigger). Only client-approved variations go on an application (older ones, approved before the client stage, as before).
- **Day Works:** new Projects page and tile (date, title, what was done, sheet no., labour / plant / materials, signed sheet, client stage). Finance's day works register follows by itself; Finance adds the value.
- **Practical completion and defects period:** set on Handover; Finance uses them for the retention release dates.
- **O&M:** four simple steps; Scope of Works from the Bill of Quantities (no prices) when the company has Finance; guarantees and data sheets found in the job's OneDrive folder.
- Checks: `pm-projects-check.js` (14), `om-check.js` (15). SQL record: `sql/projects-variations-dayworks-8nov.sql`, `sql/site-boq-works-8nov.sql`.
- **Also in Projects now (8 Nov 2026, part 2):** the client's PO on Client Info (number, date, files, kept in Finance's own folder; no value); hired plant on / off hire on Plant (Finance adds the rate and sees "Rate To Add"); Materials › Subcontract Orders (who and the scope, from the labour list or anyone; Finance adds value, CIS, retention); Material PO's lists the job's POs without prices (change the delivery date or note, take lines off, cancel; not once invoiced); every PM's order raises a PO when the company has POs switched on, Finance or not; a client set up in Finance keeps its name but the PM changes the contact. Checks: `pm-orders-check.js` (21). SQL: `sql/projects-orders-8nov.sql` (functions checked on Sandbox, rolled back).
- **Still to do from that audit:** the Schedule of Works "Add Variation" makes only a section, not a variation (variations need a photo; making it optional is a database change for Andy to agree). Finance's Getting Started still prompts "No client PO" and "Client not in the Directory". Amending or cancelling a PO doesn't email the supplier (the screen says so).
- **Repairs (8 Nov 2026, Andy's list):** Booking Date (was Booked For) opens the booking pop-up: date, time slot (AM / PM / All Day / two-hour slots), operative and notes for the booking; the same for the repair booking; the calendar title carries the slot; the operative sees the slot and notes. Attended opens Update Status (was Record The Attendance): date, who, fault found, repair required, the photos, and Delete Visit for PMs and admins (back to Scheduled, its photos to Deleted Photos). The Repair tab is Work Summary. The Job tab has Client and Works Order half and half, and Reports & Photos once in. Tenant is Resident throughout (Resident Name, Resident Contact Number, the PDFs). Attendance Report is Booking Visit Report. Works Orders: the open box is in the trail like a folder, Export Excel in a footer bar, no Bulk Add (New Job's Upload Works Order/Orders takes one or several). Checks: `repairs-8nov-check.js` (23), `repairs-check.js` (59). SQL: `sql/repair-booking-8nov.sql`.

## OneDrive set-up (Andy, 8 Nov 2026)
- **One OneDrive page**, under Admin in Projects (Admin › OneDrive) and in Finance (Settings › OneDrive), the same page in both: the connection; **New Jobs** (a folder for every new job? Yes/No, where they go and the template, chosen by browsing OneDrive); **Where Things Save** by Projects / Finance / Company (each item's folder in the job, tapped to change from the template's folders; Yes/No to save automatically; + Add Something To Save); Quick Links; each job's folders, with Set Up From Template for a job with none.
- **New in Finance:** Applications For Payment and Sales Invoices can be added to save into the job's folder (off until added).
- **Add a Project / Finance New Project:** a "Create OneDrive folder" tick. It starts unticked when New Jobs is No or the client is set to no folders. **Finance › Directory › a client:** "Create OneDrive Folders For This Client's Jobs?" (fin_clients.onedrive_folders). A won quote follows the same two.
- **Super admin:** Platform Admin › a company › Setting Up The Company (six steps ticked from what's there) and Open Their OneDrive Settings.
- **Limits:** items save only into jobs whose folder the job pack made (14 RTB jobs linked by hand carry on as before). The current web app still makes a folder for every new job and doesn't know the client switch, until switch-over. The OneDrive sign-in return fix (supabase/functions/onedrive-oauth-*) is written but not deployed: it needs Andy's OK.
- Checks: `onedrive-setup-check.js` (21). SQL: `sql/onedrive-setup-8nov.sql`.

## Leftovers against the old app (8 Nov 2026)
Every LOW item in `PARITY-AUDIT.md` is now done, already done, or not needed; only the TRIAL ones wait (they send things). Checked by `tools/test-harness/leftovers-check.js` (23 pass) and unit tests (plainError, xeroWorkers, priceWeeks).
- Finance: Getting Started card (BoQ, client PO, set-up); several client PO files, 20 MB each; Billed By change asks first; an application's Status ▾; + Someone New… on an operative invoice; Bring People In From Xero (Directory › Labour); a yard-stock cost can be changed from the project's Costs (yard_cost_edit); Status column on the costs PDF; budget bars on a phone; database messages in plain English everywhere.
- Projects: price sheet Excel with Weekly Booked In and Labour Wages; + Add Condition while filling a report; Schedule of Works keeps the last task's address per section; COSHH product › Use On A Job; O&M › + Schedule of Works (uploaded SoW documents or a file).
- Not built: bringing old COSHH PDFs in as products (switched off in the current app, never used).

## Andy's own to-dos
- ~~Sandbox test tidy-up~~: done 8 Nov 2026 with `sql/9` (file 5 not needed). `sql/10` was already in place.
- `sql/4` (private file storage) waits until the phone apps are rebuilt.
- Press **Push origin** for the handoff pack.
- Turn on leaked-password protection (Supabase › Authentication).
- Reconnect OneDrive, and revoke the old Microsoft sessions.
- Change the finance inbox mail forwarder to send the `x-inbox-key` header instead of the key in the link.
- Check that the API "max rows" setting is 1,000 or more.
- Rebuild the phone apps.
- Change the cron secret: follow `sql/8 - Change the cron secret (1 Nov).sql`, then tell Claude to check the jobs.

## Still open (carry into the native app, or fix in the old one if urgent)
- **Finance go-live switches:** the trial stubs, and POs for every PM order (proposals P01, P02; map links L28, L51, L52, L59, L73). Finance stays in **TRIAL** until Andy says otherwise.
- **18 "Missing" Projects↔Finance links:** see `context/finance-projects-map-v3.md` and `context/proposals.md`.
- **Messages to one person:** check the database lets people read messages sent only to them (PB-07).
- **Company filter in the database:** check-ins, incidents and drawings have no company column; the app filters them (CORE-L2).
- **Supplier order email:** check it never shows the PO number to operatives.
- **Push function:** check it sends the message's own id.
- **Labour review and repair jobs in Finance:** waiting for Andy.
- **Sales code per invoice line (3 Nov 2026):** the new app saves each line's own sales code as `lines[].account` (blank = the company default). Before Finance comes off trial, the `xero` function's invoice push needs `AccountCode: l.account || s.xero_sales_account || '200'` (supabase/functions/xero/index.ts, the `push_invoice` lines map), then a redeploy with verify_jwt off as now.
- **Andy said no** to the Schedule of Works photo upload speed-up and to general speed work on the old app. The native app covers both.

## Finance snags from Andy's run-through (1 Nov 2026, evening)
- Done and clicked through on Sandbox: six-tile Finance overview; Projects without the Clients tab, search bar or filter row on a laptop (Status is a tick drop-down starting on Live); click a heading to sort (A to Z, Z to A, off; default name A to Z); PM and Status columns narrower; the trail shows the whole path in Finance and every step is a link; the Home button in a project's bar has gone; a Documents tab on a project's Finance shows its OneDrive folder; the Retention box moved from the Overview to Sales › Retention with its invoices; Sales lists inside a project have no search or filter row on a laptop; Needs Attention is tighter.
- The AI reader is live with Andy's key (model `claude-opus-5-5`, about 3p an invoice). Real test on Sandbox: three PDFs and a photo read; the photo's invoice number was missed. `finance-inbox` now keeps but doesn't read emailed invoices during the trial, except Sandbox.
- Xero automatic posting asked for actions Xero doesn't have (`post_invoice`, `post_bill`); fixed to `push_invoice` / `push_bill`. Not tried against real Xero.
- Button style: Andy chose A (solid and soft); rolled out in `342457d`.
- Waiting on Andy: the cron secret change (`sql/8`).
