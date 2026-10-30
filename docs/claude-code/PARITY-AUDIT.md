# Old app vs new app — function-by-function check (29 Oct 2026)

Seven read-only checks went through every old file in `src/js/` and compared each action and rule with `app-native/src/`. Only gaps are listed. Status: **FIXED** (done in the new app), **OPEN** (still to do), **TRIAL** (only matters once Finance's trial ends; still to build).

HIGH = money, data, permissions, safety or a daily job. MED = noticeable. LOW = rarely used or minor.

## Core, Home, Admin (000–270)
- HIGH FIXED — Phone tabs for site managers, clients and subcontractor logins: no way to HR, HUB, Inbox or My Dashboard on a phone (old bottom bar). Site managers had an HR row on Projects.
- MED FIXED — Tapping a push notification doesn't open the right page (no tap listener; route map uses old paths).
- MED FIXED — Setting the responsible PM from the Projects list doesn't notify that PM (notify-site-assignment).
- MED FIXED — "Needs your signature" pop-up on Home for unsigned company policies. Also asks PMs, admins and site managers with no mobile number for it.
- MED FIXED — General (not a project) to-dos: can't add, tick, edit or delete.
- MED FIXED — Refresh data when the app comes back from the background (role changes, removal, finance switch).
- MED FIXED — Clients can type the address of non-client job pages (old router allowed home, schedule, hs, snagging only). Also found and fixed: non-managers kept out of closed jobs, and operatives allocated to a subcontractor company kept to the Main Contractor pages.
- MED FIXED — "Save to OneDrive" on exported PDFs. After any PDF export a bar offers it (managers); the job you're on (Projects or Finance) decides the folder, otherwise Company Exports.
- LOW FIXED — "Add your mobile number" prompt (home); manager-only pages now need a manager (all of /pm and On site now); search finds material requests, to-dos, snags and Admin Centre items; HR people list filtered to the company; tap a job's address under the title to copy it; "CC me" on emails.

## Repairs, pricing, reports (290–435)
- HIGH FIXED — Repair jobs to OneDrive: photos (each marked once sent, retried when the job opens or the app comes back), work order, Survey and Completed Works PDFs (rebuilt automatically on changes), job's own folder or a job-number subfolder, "Send everything" re-sync, existing items sent after linking.
- MED FIXED — Change a certificate's type (Other asks for a description).
- MED FIXED — Certificates for people not on the app (certification_manual_people): add person, upload, remove; shown on the job's operatives dashboard.
- MED FIXED — Operatives' "Needs your signature" pop-up when opening a job (RAMS, COSHH, TBT, Sign now).
- MED FIXED — Price tile badge: variations to price + pending wage pushes.
- MED FIXED — Repair job notes saved when leaving the page (and the PM email).
- MED FIXED — Repair bulk actions: Mark Scaffold Erected, Mark Invoiced.
- MED FIXED — Photo on a variation to price.
- MED FIXED — Email selected reports from a project's reports list.
- MED FIXED — Exported report PDF also saved to the site's OneDrive folder.
- MED FIXED — Start a new report with no signal.
- LOW OPEN — price sheet Excel weekly booked-in and wages sections; add a condition while filling a report. FIXED since: quick-create a Daily Briefing / Main Contractor Inspection template where none exists; close several prices at once; ☁️ / 📱 source icon on certificates; money strip and "nobody assigned" prompt on repair contracts; OneDrive folder prompt after adding a repair job; Invoiced tick before sign-off; the work order shows its file name; re-sync after linking a repair folder; repair job numbers shown to managers only; reports waiting to send shown on the Reports page with Send now.

## Schedule of Works, snags, RAMS (440–580)
- HIGH FIXED — Status change waiting for photos now shows straight away (481 sowPendingForRender).
- MED FIXED — Check-in Excel export for every manager (was admins only).
- MED FIXED — Schedule of Works Export PDF / Email for everyone (was managers only).
- MED FIXED — Opening another company's subcontractor hub by link now blocked for non-managers.
- MED FIXED — Plan mark-up: select a mark to move, resize, recolour, edit text or delete; "Number from…".
- MED FIXED — Subcontractor admin issuing and closing permits (incl. override).
- MED FIXED — Site Rules & Layout: Export Signed PDF.
- MED FIXED — Inductions: email/export one or a ticked selection, with CC me / CC client.
- MED FIXED — Subcontractor's Schedule of Works tile: full task rows (status, photos) not read-only.
- MED FIXED — RAMS: tick several and export / email as one pack.
- LOW OPEN — close/reopen address from the list; SoW email recipient tick list; library template preview; Excel import template download; multi-site address carry-over on add; old photo size backfill; leftover-photo view; photo mark-up select tool; snag closing photo from library; MC inspections listed per company; inspection templates from the job; client sees sign box on site layout; OneDrive inductions folder show/unlink; sub company library in the hub; subcontractor RAMS per company on the RAMS page; delete superseded RAMS; RAMS multi-page signing tick.

## H&S, materials, plant (584–760)
- HIGH FIXED — Clients' H&S folder shows only RAMS, COSHH, TBT, Completed Inspections (PUWER) and Operative Dashboard (new shows all 8).
- HIGH FIXED — HAVS typed minutes saved when you leave the page or the app goes to the background.
- MED FIXED — Hidden H&S screens open by direct link (no route guard).
- MED FIXED — Client's Operatives tile: read-only list of the job's operatives and certificates.
- MED FIXED — HAVS: manager adds an operative not assigned to the job.
- MED FIXED — COSHH products in bulk from many data sheets.
- MED FIXED — COSHH on a job: tick several / select all → one PDF or email; "Email all signed COSHH".
- MED FIXED — CC me / CC client on RAMS, COSHH and TBT emails.
- MED FIXED — Daily briefings: tick several → one PDF or email.
- LOW OPEN — HAVS/PUWER export a ticked set; bring old COSHH PDFs in as products; product ↔ job shortcuts; expenses "Send now" for the sender; PPE requests tick/export/email; certificate email to a team member; briefing delete logged; TBT "needs signing" wording; manual TBT "Email to PM"; import suppliers from Excel.

## Drawings, calendar, driver, deliveries (770–890, 9219zr/zq/m/zz)
- HIGH FIXED — Tapping a push notification opens the right screen (same as above).
- MED FIXED — PM reply to a supplier-invoice query (fin_pi_query_view / fin_pi_query_reply).
- MED FIXED — Finance PO PDF saved into the job's Material PO's › Finance POs folder.
- MED FIXED — Cancelling a PO cancels its site requests; remove lines; reopen restores.
- MED FIXED — Driver day off: clear "Driver has a scheduled day off" message (now "Could not save"), and the all-drivers-off check.
- MED FIXED — O&M manual: attach files to table rows; choose data sheets from the COSHH library; add documents added since the manual started.
- MED FIXED — COSHH library: drop several data sheets into a folder → an assessment each.
- MED FIXED — PM's "Things the office has sent you" page (#/to-book).
- LOW OPEN — message taps for delivery problem / invoice query; delivery form role check; cover photo from camera; uploaded SoW PDF as appendix; wipe COSHH library; sub company library from the job; delete sub application (any manager); pick PO when booking stock in.

## Finance part 1 (900–9219j)
The money calculations themselves (invoice VAT rounding, application maths, retention, CIS, plant cost, forecast/OHP, reports) were checked line by line and match. The gaps are missing actions:
- HIGH FIXED — Xero posting rule: only post when Xero is connected, the company's "send automatically" is on and the record isn't already in Xero (invoices and approved purchase invoices). Today only the trial stops it.
- HIGH FIXED — Application as Excel (the client document) and upload a valued Excel back. (Same as part 2.)
- HIGH FIXED — CIS payment statement PDF for a subcontractor payment (paid subcontract applications) and operative invoices.
- HIGH FIXED — Add / edit / delete "other" job costs (prelims, site costs) from the Costs ledger; yard-stock costs point you to Yard stock.
- HIGH FIXED — Split a cost across projects and plots, or book it to one plot / repair job (purchase invoices, POs, plant hire, other costs), and the Costs by plot report (values typed, from the Bill of Quantities, or the repair job's cost). Still open (MED): a plot per line in the PO builder (TRIAL), a plot on subcontracts, and Excel / PDF of the plot report.
- MED OPEN — check purchase-invoice lines against the PO (TRIAL — needs the invoice reader). FIXED since: voiding an invoice that is in Xero voids it there too (during the trial it says to do it by hand). Finance-only company mode (Finance is the home and the only part reachable, a Finance Team page, project name / client / address / status edited in Finance, and a no-access screen for people without Finance). Xero settings (account codes, tracking, send automatically, check payments, disconnect) and the per-record Post to Xero / last error line — posting itself waits for the trial. Subcontractor PO from your workers list (linked to the worker) with priced lines, into the Price file as an issued price sheet. Code purchase-invoice lines to projects / cost types. Site variations come into the register by themselves. Raise a PO from Finance with typed lines (fin_new_po; emailing it waits for the trial). BoQ costing tools (margin / mark-up %, ticks and bulk actions, plot per line). Variations register export (Excel, PDF). PO auto-closes / reopens with approved invoices; change cost type on a saved purchase invoice. Bulk approve / mark paid purchase invoices. Final retention release date override; monthly application date editor. Inbox: ignore an item, add invoices by hand (unread ones listed to file by hand). Set the original to today's figures (Budget page). Subcontractor application: attach their PDF / photo (delete was already there for received ones). Project shopping list (Project Quotes page: Excel / CSV upload, rates, hide / show, add by hand; PDF / photo reading waits for the trial). Variation instruction / quote document.
- LOW OPEN — several client PO files and 20 MB check; email invoice/reminder (trial); Directory client fills a draft's address; qty entry mode; PM "to book" (trial); workers from Xero; email PO (trial); costs PDF; price-sheet sync (trial); billing-type change warning; wage pushes (trial); operative invoice: new person inline, mark paid; jobs grid column chooser; checks column; PO VAT default setting.

## Finance part 2 (9219k–922)
- HIGH FIXED — Site variations imported into Finance's register (when the project or its Variations page opens), tagged "Site", with quick Approve / Reject and "+ Schedule of Works" (off during the trial).
- HIGH FIXED — New invoice takes the client's default VAT code (reverse charge).
- HIGH FIXED — Application Excel / PDF in the old layout; upload the Excel back (Applied % updates a draft, new rows become new lines); the certificate fills in from the client's Excel. Still open (MED): the optional Schedule of Works progress PDF alongside, and the old one-sheet Excel layout from before 22 Oct.
- HIGH FIXED — Certify line by line (Certified % per line; cert_lines saved; from the client's Excel/PDF).
- HIGH FIXED — Certificate discount starts from the application's discount. (The discount on an Applied application can no longer be typed into and then lost; it's set while the application is a draft.)
- HIGH FIXED — Open draft application keeps up with newly approved / unapproved variations and day works.
- HIGH FIXED — Application autosave with a copy kept on the device.
- HIGH FIXED — Release retention through an application.
- HIGH TRIAL — New PO builder in Finance (job per line, Disc %, cost codes, site contact).
- MED FIXED — "Raise and issue the invoice now" should start unticked when certifying.
- MED FIXED — Statements: add a line by hand, change a line's type, "lines add up to" check.
- MED FIXED — add a line / section inside an application; delete a job (with the booked-items check, else close it); send a variation to the SoW. FIXED since: bill-to picked from the Directory (address and accounts email follow the client; a Directory change carries to its projects). BoQ autosave and line fields (plot, cost rate, margin).
- MED OPEN — Send pop-up (TRIAL — emailing from Finance is off). FIXED since: double-tap locks — every button ignores a second tap while the first is still running. Schedule of Works report with an application (end of the PDF, or beside the Excel; whole schedule or photos since the last application — emailing it waits for the trial). Link a Directory supplier to a Projects supplier, from either side. A yard-stock cost line explains it changes with the stock and opens Yard stock (as the current app). Purchase Quotes tab on each project (Excel / CSV quotes and every-project price lists, tick items → PO) and Finance › Purchases › Price lists with edit / duplicate. List month pickers (Sales, Purchases) and value / start-date filters (Projects, Purchases). BoQ export (Excel / PDF), margin tool, add a line at any position. Retention halves use what the certificate holds. Per-line Previous / This time on applications. Site variation value sync was already there (finance users). Project Admin fields: QS, monthly application dates, final release date. Delete an application at any stage (latest only, no invoice); export is on the application page. Company VAT rates list (Settings; the Directory choices follow it). Contract value vs Bill of Quantities total: asked after saving the Bill. Budgets from a target margin. Site progress on applications (Site x% per line, Use site progress).
- LOW OPEN — Getting started card; stage drop-down; tile option menus; variation/day work attachments; over/under budget bars; voided invoices fold; raw database messages; Detailed Summary search; project Purchases "All" tab.
