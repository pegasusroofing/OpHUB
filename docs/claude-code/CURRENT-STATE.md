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

## Server functions
- `send-finance-email` v5 (subject, text, extra attachments, signature with company number, VAT, email and logo).
- 30 send and notify functions hardened. Repo copies are in `supabase/functions/`.
- The `xero` and `finance-inbox` repo copies match live.
- When redeploying, keep each function's `verify_jwt` setting as it is live.

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
- Also built (29 Oct 2026, audit gaps): show / hide H&S, Plant and Expenses tiles per role; HAVS manager screen (log for operatives, tools on site, close / reopen week, completed weeks); in-app subcontractor form for operatives; check-ins Excel; certificates export / email as one PDF; Settings page (phone, Admin Centre, Show Finance) and how-to tips; managers' Projects page (search, tabs, PM filter, status / PM menus, + New project); saved-client picker; materials import from Excel; Search (Ctrl+K); Platform Admin with support mode; clients / subcontractor companies land on their projects; a new company's admin sets up the logo first.
- Look and feel matched to the current app (29 Oct 2026, side by side with the sandbox): fonts (IBM Plex Sans / Sora / Plex Mono), left menu and top bar on the laptop, Home (tiles, stat boxes, Sites map card + full Sites map page), Projects, job home page (job no. + on-site pill, Finance money strip, stat boxes, centred tiles), the Projects › job › page trail and job-home button on every job page, Schedule of Works, H&S and the other tile pages, RAMS / COSHH, check-in, Materials and Material Requests (five tab boxes, Pick from a project quote), Delivery Schedule, both calendars (month grid with items in each day; application dates and supplier deliveries added — they were missing), Admin Centre hub. Fixed on the way: Finance never loaded a project's set-up (contract value, billing type) because `job_finance` has no `id` column. Then (second round): HUB, Company Dashboard, Reports & surveys (+ General surveys card, Sites Map in the left menu), Operatives (Training Matrix exports, Operative Tools), HR (list rows), and OpHUB Finance (left-aligned header, Finance › trail, underline tabs with Directory, flat cards, coloured figures, Needs Attention, and tables with totals bars for Projects, Sales and Purchases on a computer). Third round: a project's Finance page (Home / job / + New bar, Forecasted final account card, tinted tiles), Finance Reports (groups that open), Directory (clients table) and Finance settings (sections that open). Not in the new app yet: the old Finance settings sections "Who can see material costs" and "Invoice inbox (email)".
- **Still in the current app for now:** PDF drawings in reports on phones (photo instead, or the office laptop).
- **Android test build:** `b979c2f7…` was queued on Expo's free plan when last checked.

## Andy's own to-dos
- Press **Push origin** for the handoff pack.
- Turn on leaked-password protection (Supabase › Authentication).
- Reconnect OneDrive, and revoke the old Microsoft sessions.
- Change the finance inbox mail forwarder to send the `x-inbox-key` header instead of the key in the link.
- Check that the API "max rows" setting is 1,000 or more.
- Rebuild the phone apps.

## Still open (carry into the native app, or fix in the old one if urgent)
- **Finance go-live switches:** the trial stubs, and POs for every PM order (proposals P01, P02; map links L28, L51, L52, L59, L73). Finance stays in **TRIAL** until Andy says otherwise.
- **18 "Missing" Projects↔Finance links:** see `context/finance-projects-map-v3.md` and `context/proposals.md`.
- **Messages to one person:** check the database lets people read messages sent only to them (PB-07).
- **Company filter in the database:** check-ins, incidents and drawings have no company column; the app filters them (CORE-L2).
- **Supplier order email:** check it never shows the PO number to operatives.
- **Push function:** check it sends the message's own id.
- **Labour review and repair jobs in Finance:** waiting for Andy.
- **Andy said no** to the Schedule of Works photo upload speed-up and to general speed work on the old app. The native app covers both.
