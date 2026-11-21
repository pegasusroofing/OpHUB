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
  2. ~~Update 6 server functions~~ (done and live 16 Nov 2026: `client-sign` v5, `send-document-email` v15, `send-expenses-email` v9, `send-price-builder-email` v10, `send-site-induction-email` v12, `send-subcontractor-inspection-email` v11; they download with the service role and send signed links, 30 days in emails, and refuse paths outside the caller's company). Every other function was checked and needs nothing.
  3. Rebuild the phone apps, and make sure everyone has updated. On 16 Nov three operatives had the old Android app (push tokens; two used it in the last month). Their copy is from September, before private files worked: they need the rebuilt app, or to use the website on their phone, before step 4.
  4. Andy pastes SQL file 4 into Supabase › SQL Editor (Andy said 16 Nov to do it now, once step 3 is safe). Links in emails sent before late October stop opening; about 70 old files under deleted jobs or people will only open for HR/admins through the app, if at all.

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
- **Xero set up 20 Nov 2026.** The Xero developer app "OpHUB" (Web app, standard auth code) is under Robert Beeson's Xero login at developer.xero.com, on Xero's free Starter plan (up to 5 connected Xero companies, 1,000 calls a day each; 50 companies needs the Core plan). Redirect URI `https://dtrfupmcazoioubhwdml.supabase.co/functions/v1/xero`. Its keys are the Supabase secrets `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` (Andy added them). Connected: RTB Construction Group → Xero "RTB Construction & Maintenance Limited". The callback now uses only the Xero company ticked on that visit, and refuses one already linked to another OpHUB company (two companies sit under one Xero login).
- When redeploying, keep each function's `verify_jwt` setting as it is live.
- `finance-report-run` (verify_jwt off): v3 deployed 20 Nov 2026, matching the repo byte for byte. It brought live the 6 Nov rule (draft POs aren't counted as ordered) and the 20 Nov one (a labour price sheet's order is a guide, not committed cost: only operatives' invoices count as labour).
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

## Overnight 20–21 Nov 2026 (app.operativehub, plus one old-app fix)
- **Built:** subcontractors' Project Manager (join links, their people, upload only); snags given to a subcontractor company; subcontractor close-out (Invoice Only or Applications with retention halves; our PM / site manager signs; certificate to OneDrive 8. Handover); project settings Site Type row and OneDrive drop-down with Documents; CPP pull-through and lock-after-issue with Edit; Site Rules & Layout builder; customisable induction form; check-in location from the postcode (suggested until a manager confirms); underlined tabs replacing pills on many screens.
- **SQL files 11–15** applied and proved (additive, or only tonight's own functions). **security-fixes-21nov-FOR-ANDY.sql** waits for Andy (older rules: subcontractor rows tied to their own job and company, toolbox talk inserts, Company Chat, storage general/exports/report-pdfs).
- **Old app:** a subcontractor's toolbox talk now sends org_id (it never saved before). Rebuilt with a Node copy of build.py (no Python here) and copied to the 5 places.
- **Store apps:** a new Capacitor project with the new app's web build is in Operative Hub AppApp Builder - New App (Nov 2026) (Android .aab built unsigned; iOS needs a Mac). README-NEW-APP.md and PHONE-TEST-CHECKLIST.md there.
- **Reviews:** OpHUB Progress ReportsOvernight Review 21 Nov 2026 (security, request check, app review). Open items: OneDrive per-company separation (one Microsoft account for three companies), OneDrive server fixes, Main Contractor simplification (needs Andy).
- **Review quick fixes (21 Nov, day, app.operativehub):** about 320 button / field / tile / page labels in capitals (proper names kept: Schedule of Works, Bill of Quantities, Application for Payment); "Project Settings" everywhere (Finance's job tab too); plain tiles (H&S, snagging, driver, operative home, HR rows, Finance figures); the last pill rows are tabs (Plant, Price addresses, RAMS / COSHH libraries, PPE log, vehicles, driver check-ins, price sheet steps); choice pills are ▾ drop-downs (time off, permit type and contractor, calendar repeats / reminder, RAMS document type, PPE item, receipts months); new projects say Live / Upcoming; buttons small and centred (material requests, PPE, subcontractor operatives, permits, F10 / asbestos documents, Add A Project, Sign-Up, COSHH wipe, Finance overview, MC Inspections now one row and one way to make a template); pop-ups close with ✕ only (no Cancel); blocked admin pages keep their titles; Finance header on a phone shows the company name; Admin tabs never cut the first tab; logo colour cards fit a phone; a site manager's phone bar has no separate Inbox (HUB has it); a client's job bar has no Check In / Inbox. Not done: the Subcontractor Form rename (question for Andy in the review).
- **Main Contractor made simple and Get Going (21 Nov, day, app.operativehub; Andy: "Yes build the 2 plans please"):** Add A Project asks "Are We The Main Contractor On This Job?" Yes / No (not for repair contracts; Site Type still changes it). The job row says "n to set up" / "All set up" (operatives: "My induction · permits to sign"). The Main Contractor page: "Set Up: n Of 5 Done" (F10, Asbestos Register, Construction Phase Plan issued or uploaded, Site Rules, Induction Form; each ticks itself), then Before Work / People / On Site tabs as plain rows; People lists everyone (ours and subcontractors' operatives) with Inducted ✓ and Site Rules ✓; no Programme tile (Drawings › Programme). Operatives see only My Induction and Permits To Sign; a manager shows any other part from its ⋮ (new column sites.mc_shown_tiles, added; mc_hidden_tiles unchanged and still used for the two defaults); links to hidden parts are blocked. A subcontractor's page: Documents / Work / People / Handover tabs, their own people keep Check In, My Induction and Calendar at the top. Admin Centre: a Main Contractor tab (CPP Template, Site Rules Template, Induction Form, Subcontractor Library with Sign-Ups inside, Inspection Templates = report templates ?kind=mc). Get Going: the logo lock is gone (reminder under Later; the logo page says the OpHUB colours are used until then); Home's guide is Add Your First Job / Invite Your Team / Put Them On The Job / Check In Once, the rest under Later. Finance for the first admin was already automatic on the live database (triggers new_admin_gets_finance and org_admins_get_finance; every admin in a Finance company has it): the review saw it only in the test copy.

## Main contractor walk-through answered; more screens in tabs (20 Nov 2026, late, app.operativehub)
Andy's answers to `MAIN-CONTRACTOR-PROCESS-2026-11-20.md`, built:
- **Their operatives:** Check In, Calendar and Messages now open (Check In used to bounce them to their company page). Their company page has Check In / Out, Site Induction, Site Rules & Layout and Calendar tiles. SOW opens their company's schedule.
- **Handover tile for their admin:**
  - Their O&M can be submitted only once every Schedule of Works task given to them is done (database rule `guard_sub_om_submit`).
  - On submit, a managers message goes to the job's PM and admins (email, alert, HUB "Subcontractor O&M").
  - Handover shows on a live main contractor job too.
  - SQL file 8. Messages use kind 'message': adding new kinds would change `messages_kind_check`, which needs Andy's go-ahead.
- **Approving a sign-up:**
  - It makes the Company Library entry (`approved_at`, `contact_user_id`) and copies their documents across with insurance expiry dates (`rules/subLibrary.ts`).
  - + Add Subcontractor picks from the library, approved sign-ups first, with insurance status. It warns before adding a company with expired or missing insurance, and offers the person who signed up as the company's admin.
  - SQL file 9.
- **Lighter login for their operatives:** no Subcontractor Form step and no My Employee Record (`useSubStaff`).
- **Site induction:** includes the Site Rules & Layout. Signing the induction signs them too, and they're attached to the induction PDF.
- **Subcontractors' daily briefings:**
  - Who Must Sign is ticked when the briefing is logged; the chosen operatives sign, and it's on their To Do.
  - Table `subcontractor_briefing_signatures`, SQL file 9.
- **Subcontractors' RAMS approval:**
  - A subcontractor's upload awaits approval. ✓ Approve, or ✕ Send Back with a comment and marked-up pages (laptop: `pdfPageImage` and the mark-up tools, sent as a PDF).
  - Nobody signs it until it's approved. They upload a revised version, which supersedes the old one once approved.
  - The HUB shows "RAMS To Approve". SQL file 10.
- **Close-out:** a proposal only (`SUBCONTRACTOR-CLOSE-OUT-PROPOSAL.md`), with 4 decisions for Andy.
- **Sample O&M** (Andy's handover plus a painter's): `tools/test-harness/om-sample.js`, output in `shots/om-sample/`.
- **Screens now in tabs:**
  - filling in reports, briefings and inspections (one tab per section, then Finish);
  - the incident report;
  - the Purchase Order (Details / Lines / Delivery / Raise);
  - the subcontractor sign-up form, both the public link and in the app (one tab per section, then Declaration);
  - the report template builder (Details / Settings / Questions);
  - the subcontractor form builder (one tab per section);
  - the Application for Payment (standard tabs for Overview / Line By Line, plus Next).
- **Not yet:** the Application's certify step as its own tab needs a design chat. `price-check.js` (Price tile) fails on a step that doesn't involve today's work; to look at.

## O&M builder in tabs, with the CPP; subcontractors' O&Ms (20 Nov 2026, evening, app.operativehub)
- **O&M builder:** `sites/[id]/om/[manual].tsx`.
  - Tabs: Details · People · Works · Appendix · Issue, with Next at the bottom of each tab. It saves as you type.
  - A new manual takes the client, client's agent, principal designer, architect, PM, start date and outline of works from the job's CPP (the issued one first; `jobCpp`, `omFromCpp`).
  - New **Project Team** table. Unnamed roles are left out of the PDF.
  - Page 2 has **Project Dates** (start on site, practical completion).
  - **Issue tab:**
    - a "Before You Issue" checklist;
    - Issue Revision N keeps each PDF with the manual (`data.revisions`) and copies it to OneDrive ('om_manual' rule);
    - offers practical completion as today if it isn't set.
- **Subcontractors' O&Ms:**
  - The company page has an **O&M Manual** tile (their admin and our managers).
  - They upload a PDF (submitted at once), or build one in the same builder (`mc/subcontractors/[co]/om/[manual]` re-exports it). That starts from the tasks assigned to them and their COSHH, and Submit sends it to us.
  - Our Handover lists them. Our manual's Appendix ticks "Subcontractors' O&M Manuals (N Submitted)", which puts them in the back of our PDF.
  - DB: `handover_om_manuals.subcontractor_company_id / file_path / submitted_at`, `is_sub_admin_of()`, four sub-admin policies (SQL file 7, proved with a self-undoing test).
- **CPP:** the company template (Admin › H&S) now saves by itself like a job's plan. There's no Save button, just Next at the bottom of each tab.
- **Main contractor walk-through and gaps:** `MAIN-CONTRACTOR-PROCESS-2026-11-20.md`.
- **Tests:** `om20-check.js`, `subom20-check.js`; the older O&M and CPP tests are updated for the tabs.

## Close a RAMS / COSHH for signing (20 Nov 2026, both apps)
- **Old web app:** ⋯ menu › Close for signing (`src/js/9219zzh-hs-close-signing.js`).
- **New app (afternoon):** ⋮ menu › 🔒 Close For Signing / ↺ Reopen For Signing, for managers with Sign Off H&S (`components/HsDocList.tsx`). A closed document shows "🔒 Closed" and stays on file. It drops out of the HUB, the job tiles, the PM dashboard, operatives' To Do, Sign All, and Ask Outstanding To Sign. Operatives see "Closed — No Signature Needed".
- **Database:** `rams_docs` / `coshh_docs.signing_closed_at`; only managers can set it (guard trigger, SQL file 6). The reminder emails (`rams-coshh-nudge` v10, `resign-check-daily` v7) skip closed documents.
- **Test:** `tools/test-harness/closesign20n-check.js`.

## Also on 19 Nov 2026 (evening)
- **Satellite map snapshots (CPP):** Esri World Imagery through MapLibre (`components/MapSnapshot.tsx`), key in the `app_settings` row 'esri_basemap_key' (`sql/app-settings-19nov.sql` shows how to set it). Key in since 19 Nov 2026: ArcGIS Location Platform item "OpHUB Satellite Map Snapshots" (ophub.maps.arcgis.com, pay-as-you-go off), Basemaps only, limited to app.operativehub.co.uk and ophub-beta.vercel.app. **It expires 18 Nov 2027**: before then, make a new key on the same item and update the app_settings row. Esri's agreement clause 6B allows output in PDF/JPEG "in an unalterable final form"; clause 4 needs Esri credited - drawn on every snapshot. Without a key the snapshot shows the street map with a note.
- **Company sign-up email:** a platform-owner invite for a company's first admin is now the OpHUB welcome (`supabase/functions/send-invite-email/welcome.ts`, v17): OpHUB logo and blue, from "OpHUB", replies to sales@operativehub.co.uk. `assets/ophub-mark.png` (every email's fallback logo) was missing - added (live on push).
- **Delete Company:** clear button in Platform Admin; `admin-delete-company` v21 clears the 25 tables that block a delete (Finance, permits, yard) first.
- **OneDrive from the new app:** `onedrive-oauth-callback` v33 sends app.operativehub.co.uk / the beta back to themselves. Connections, refreshes and folders are per company (RTB Construction Group connected 19 Nov 17:53 to the same Microsoft account; it picks its own main folder).
- **OneDrive library shortcuts (the purple "RTB Roofing Ltd"):** Microsoft leaves shortcuts to a whole SharePoint library out of the top-folder list, and a plain path can't go through them. `onedrive-list-folders` v27 adds them at the top (found by a search and the company's own folder settings, each checked by opening it by name), so every folder picker can open them. `onedrive-upload` v37 follows the main folder one level at a time (as `onedrive-job-pack` does), so a main folder inside the shortcut works; it falls back to saving by path if a level isn't there yet.
- **OneDrive, a clean slate per company (19 Nov, late):** `startingPack(true)` has no rules, folders or documents, and nothing defaults to RTB's folders (Where Things Save, the Add pop-up, the job pack page). Choosing "Built From" reads that template's folders and documents from OneDrive (`readTemplateTree`, up to 6 levels / 300 folders); "↻ Read Again From The Template" does it again. RTB Construction Group's copied rules were cleared at Andy's request; the old set is kept in its config as `rules_before_19nov`. Its folder list is still RTB Roofing's until Andy presses Read Again. The current app's job pack page (`9219zzc-job-pack.js`) still fills missing rules with RTB's if someone saves there.
- **Quote emails signed (19 Nov):** `quote-tracker` v10: chasers and Send Quotation end with a signature: sender's name, phone and email (their company email when set in company switching, which also gets the replies), then the company logo, name, address and phone (`rams_settings`). The wording's last two lines ({sender} / {company}) give way to it.
- **CPP mark-up:** Line (a two-point pen line, so it opens in the current app), sizes XL / XXL, and on CPP plans Hatch (draw round an area: diagonal hatching) with Straight Lines on to start with. A&E search: postcode only, by OpenStreetMap's own search (Nominatim), as Overpass now refuses most requests; Overpass is the backup.
- **Expenses settings:** once saved, a summary with ✎ Edit.
- **OneDrive pickers (19 Nov, later):** every OneDrive folder picker opens in the company's main folder; "save it in" browses the company's own template in OneDrive (live), and a new item saves into each job's own folder (folder '' = the top of the job folder, which `onedrive-job-pack` put already handles) until another is chosen. A pack whose template isn't RTB Roofing's and hasn't been read (`template_read`) is read again from its own template when the OneDrive page opens (RTB Construction's copied list).
- **Invite as a Project Manager / Quantity Surveyor (19 Nov):** migration `invite_roles_19nov` (`sql/invite-roles-19nov.sql`): `invites.org_role_id`, policy "admin create pm invites" (company admins, own company, role pm), triggers that drop a role at the wrong level and give the role when the invite is used. Admin › Invites lists the company's roles (admins: PM-level and estimators too; PMs: operative, driver, client). Site Managers and Finance Controllers are still given their role after joining (the invites table's role list doesn't include them).
- **Finance trial or live, per company (19 Nov):** Platform Admin › the company › Finance: Trial / Live (super admin only, asks first). `organizations.finance_live` (`sql/finance-live-19nov.sql`); xero v15, send-finance-email v11 and finance-inbox v8 let a live company through. RTB Construction Group put live by Andy on 19 Nov; RTB Roofing still on trial.
- **Admins get Finance automatically (19 Nov):** migration `admins_get_finance_19nov` (`sql/admins-get-finance-19nov.sql`): when a company's Finance is switched on or put live, all its admins get Finance; someone joining as, or made, an admin of a company with Finance gets it too. RTB Construction's two admins (Joanna, Andy) given Finance the same day.
- **Email templates (19 Nov, late):** Finance › Settings › Templates and the quote chaser wording have + buttons for the fill-ins (per kind of email; RAMS / COSHH emails have `{document}`), adding at the cursor. The signature shows filled in (`components/EmailSignature.tsx`): name, phone, the email for this company, the company's address and phone (`rams_settings`, else Finance's company address), company / VAT numbers, logo; `send-finance-email` v12 signs the same and replies / CC go to the company email.
- **Toolbox Talks (19 Nov, late):** Admin › H&S › Toolbox Talks is one tab (How Often at the top, then templates). + Create A Toolbox Talk builds a talk in RTB Roofing's layout (`components/TbtBuilder.tsx`, `lib/tbtPdf.ts`), saved as a template with its wording (`tbt_templates.builder`, migration `tbt_builder_19nov`, adds only) and ✎ Edit.
- **Expenses (19 Nov, late):** its own page `/expenses`, on the menu below Finance and above HR for admins, PMs, site managers, Finance people and drivers (not operatives or clients). Off the job's Materials page; `/sites/<id>/expenses` opens it with that job chosen. Every receipt must be put against a job on the app (a This Is Fuel tick instead of the old Fuel / not-on-the-app choices); each still goes to Finance to book in (trigger `zz_expense_to_finance`) and to the expenses email.
- **Deploys:** `deploy-beta-clean.sh` builds with `--clear` and stops if the build has no app screens (the 20:13 build on 19 Nov went out blank: "No routes found"). Always open app.operativehub.co.uk after a deploy.
- **Company colours by clicking:** `components/LogoColourPicker.tsx` - Primary / Secondary, click the logo to take a colour, colours found in the logo, palette.

## Company switching on one login (19 Nov 2026; on the beta link and, since late 19 Nov at Andy's request, app.operativehub.co.uk)
- **Andy asked (19 Nov):** one login email for RTB Roofing and RTB Construction, switch top left; "anyone can have two logins ... make it secure, so no one can cross contaminate"; replies for Construction to go to his Construction email.
- **How it works:** still one profile per login; switching rewrites the profile's per-company columns (role, finance switches, named role, OneDrive folder, etc.) from `company_memberships.state`, so every existing rule and server function keeps working unchanged. `profiles.email` becomes that company's "email for this company" (replies go there); the login email never changes. SQL: `docs/claude-code/sql/company-switching-19nov.sql` (applied as migration `company_switching`).
- **Joining:** only with an invite from that company (invite email must be the login email; the role is the invite's; never superadmin). Signed in on the beta, `/join/<invite>` shows "Add {Company} To My Account".
- **Screens (web only, `isSwitchSite()`):** Switch Company ▾ at the top of the laptop sidebar and the phone menu (`components/CompanySwitch.tsx`, `components/DeskNav.tsx`); My Account › My Companies (switch, change the email for each); Admin › People › Also Has Access with Remove Access. Test: `tools/test-harness/switch19-check.js`.
- **Server functions:** `remove-team-member` removes someone from this company only if they have another (`detach_from_company`), else deletes the login as before; `admin-reset-password` / `send-password-reset` find people by login email (`login_user_by_email`); the six senders that set reply-to use the profile email (the company's). Deleting a company moves people with another company out first (trigger `cm_move_members_out`).
- **Security review (same evening) and fixes** (`sql/company-email-codes-19nov.sql`, migration `company_email_codes`): an email for a company other than your sign-in email is only saved once you type the 6-digit code emailed to it (`send-company-email-code` v1, `cm_new_email_code` service role only, `confirm_company_email`; 15 minutes, 5 tries, 10 codes a day). Without that, anyone could have claimed a colleague's address and, through the older hand-added-operative linking, taken their certificates. Removing someone from one company now also clears their links to that company's sites and Responsible PM, as deleting a login did. Left as they are (low): PMs' invites and the reusable team link can add a company to an existing login, the same as signing up with them today.
- **Know:** a switch applies on every device signed in, including the old web app and phone apps (they read the same profile). While you're in company A you don't get company B's notifications and aren't on its people lists.

## Construction Phase Plan builder (19 Nov 2026; on the beta link and, since late 19 Nov, app.operativehub.co.uk)
- **Andy asked:** "when a main contractor build a construction phase plan in the construction phase plan tile ... replicate it as a rams style builder, pull through as much info as you have from the job ... can we just do on beta for now?" His example is the Richardson Court CPP (Live Projects/Richardson Court/9. Richardson Court - Hyde/1. Health & Safety/2. Construction Phase Plan).
- **Where:** Main Contractor > Construction Phase Plan folder > Build A Construction Phase Plan (managers). Editor `sites/[id]/mc/cpp/[p].tsx`, tabs Details / People / Plan / Emergency / Issue; saves by itself. Issue makes the PDF (`lib/cppPdf.ts`) and files it in the same folder (mc_documents 'cpp'); re-issuing makes the next version.
- **Filled from the job** (`data/cpp.ts` createCpp): company (name, RAMS settings address/phone), site, client, PM, first aiders (people on the job with an in-date first aid certificate), outline (Schedule of Works), start date, duration (latest RAMS build), nearest A&E (OpenStreetMap Overpass, emergency=yes first; route link), national gas / power-cut / Environment Agency numbers, the job's current RAMS and COSHH (section 17). "Save Wording For Future Plans" keeps a company's wording (cpp_defaults).
- **Beta only:** `lib/betaOnly.ts` isBetaSite() (ophub-beta.vercel.app and localhost); hidden on app.operativehub.co.uk and phones. To release: widen isBetaSite or remove the checks in mc/docs/[cat].tsx and mc/cpp/[p].tsx.
- SQL: `sql/cpp-builder-19nov.sql` (applied). Checks: `cpp19-check.js` (laptop + phone), `src/lib/rules/cpp.test.ts`.
- **Second round (19 Nov, same day):** the editor is now `components/CppEditor.tsx` (job plan and company template). Site layout / fire route plans: Map Snapshot (`components/MapSnapshot.tsx`, MapLibre view of the job, red pin, OSM credit) or a photo, then the drawing mark-up tools; the plain picture and the marks are kept (`sitePlanMarks` / `firePlanMarks`) so it can be marked up again; the fire plan can start from the site layout map. Save and Next at the bottom of every tab. Contact rows line up. Nearest A&E searches from an editable address and postcode (`hospitalFrom`; postcodes.io, then Nominatim). Emergency numbers two to a row (one on a phone), Service / Company / Emergency Contact No. Revisions: Issue Revision n asks what changed; the history is kept (`revisions`, with each PDF) and printed; the old PDF is renamed "(Superseded by vN)". CPP Template under Admin > H&S (`/pm/admin/cpptemplate`, cpp_defaults), beta only.
- Not done yet: OneDrive job-pack copy of the issued plan; operatives signing the plan.

## The new app is live at app.operativehub.co.uk (19 Nov 2026)
- **Andy asked (19 Nov):** "are we able to make this live now? but still keep the old html whilst we slowly transfer over?" Then: "Yes, set it up".
- **Address:** https://app.operativehub.co.uk, added to the Vercel project `ophub-beta` (same deploys as the beta link, which keeps working). The domain's DNS is at GoDaddy, so Andy adds one record: **CNAME, name `app`, value `14dce9a353b21d09.vercel-dns-017.com`**. Added 19 Nov by Claude in Andy's own browser (he asked; he was signed in to GoDaddy there), certificate issued the same day (`vercel certs issue`); checked live: page, sign-up page and server calls all answer.
- **Old app untouched:** operativehub.co.uk/app.html and the store phone apps carry on as before. Both apps use the same database, so staff move over group by group (office and PMs on laptops first).
- **Code for the address:** `app-native/src/lib/supabase.ts` (`SITE_HOSTS`: server calls go through the site) and `send-invite-email` (`JOIN_BASES`, v15, verify_jwt true): invite emails sent from the new app open its own sign-up page.
- **Gaps while both run:** no phone alerts from the new app on the web (alerts come through the old phone app until the new store app is built); emailed links (notify-*, reminders) still open the old app. The device lock lets an operative's first sign-in on the new address straight in (the new app sends no hardware id), and their old app stays approved.

## Native app: web links for Andy's phone (11 Nov 2026)
- **Live data: https://ophub-beta.vercel.app** (Vercel project `ophub-beta`, team op-hub; unlisted, not indexed; Andy OK'd it 11 Nov). It's the new app as a web page, signed in with real logins against the live Supabase, so everything done in it is real. It is a snapshot, so it only changes when redeployed.
  - Update it: `cd app-native && npx expo export --platform web --output-dir <folder>`, then `node tools/beta/make-beta.js <folder>`, then `npx vercel deploy --prod --yes --scope op-hub` in that folder.
  - `make-beta.js` adds the home-screen settings (so Add To Home Screen opens full screen with the OpHUB icon), the `vercel.json` rewrites and the noindex header.
  - Made because hotel Wi-Fi stops the phone reaching the laptop's test copy.
- **Pretend data: https://ophub-offline-demo.vercel.app** (works with no signal). See `offline/HOW TO USE.txt`.

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

## Repairs, later list (Andy, 8 Nov 2026)
- Works Orders: boxes all the same size; a box opens its own page (?box=, pushed so Back returns) with a drop-down to jump between boxes; jobs in a table (phone: Order No, Address, Booked; laptop adds Stage, Operative, Due); the path shows Live Jobs / Works Orders › box › job in Projects and Finance; footer one line (jobs, Export Excel).
- Finance: Live Jobs | Costs By Job | Schedule Of Rates tabs; Costs By Plot under the Bill tabs. A job: Quoted / Costs / Profit open pop-ups (costs by type, ordered, profit, margin); See Every Cost, + Add A Cost (booked to the job), Book A Cost To This Job (unbooked purchase invoices, POs, plant hire, other costs; components/FinBookCost). Costs By Job / Plot rows: Book A Cost To It, + Add A Cost To It.
- Quote page: View Quote | Save | Send To Client in one row; both make it Awaiting Client Approval. Quote Update ▾ (Approved; Rejected = back to Quotation Required; Rejected And Close Job = closed for good). Work Summary has ‹ Job Page. Works order box: heading, number, View ›. Attended By defaults to the operative who uploaded the visit photos (none if a PM did).
- Checks: `repairs-money-check.js` (25), `repairs-check.js` (61), `repairs-8nov-check.js` (23), all passing. Andy's summary and test list: `SUMMARY-2026-11-08.md`.

## OneDrive set-up (Andy, 8 Nov 2026)
- **One OneDrive page**, under Admin in Projects (Admin › OneDrive) and in Finance (Settings › OneDrive), the same page in both: the connection; **New Jobs** (a folder for every new job? Yes/No, where they go and the template, chosen by browsing OneDrive); **Where Things Save** by Projects / Finance / Company (each item's folder in the job, tapped to change from the template's folders; Yes/No to save automatically; + Add Something To Save); Quick Links; each job's folders, with Set Up From Template for a job with none.
- **New in Finance:** Applications For Payment and Sales Invoices can be added to save into the job's folder (off until added).
- **Add a Project / Finance New Project:** a "Create OneDrive folder" tick. It starts unticked when New Jobs is No or the client is set to no folders. **Finance › Directory › a client:** "Create OneDrive Folders For This Client's Jobs?" (fin_clients.onedrive_folders). A won quote follows the same two.
- **Super admin:** Platform Admin › a company › Setting Up The Company (six steps ticked from what's there) and Open Their OneDrive Settings.
- **Limits:** items save only into jobs whose folder the job pack made (14 RTB jobs linked by hand carry on as before). The current web app still makes a folder for every new job and doesn't know the client switch, until switch-over. The OneDrive sign-in return fix (supabase/functions/onedrive-oauth-*) went live on 8 Nov 2026 with Andy's OK (callback v31, start v27, verify_jwt off as before): it goes back to the page you started on, office-network addresses work, and it never shows the page as code.
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
  - **Query To PM during the trial (decided 17 Nov, Andy: "No, keep it"):** it keeps messaging the PM (and so emailing them through the messages trigger), as the old app does. It is an in-house message, not something sent from Finance to the outside, so don't block it or raise it again.
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
