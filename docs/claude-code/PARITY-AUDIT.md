# Old app vs new app — function-by-function check (29 Oct 2026)

Seven read-only checks went through every old file in `src/js/` and compared each action and rule with `app-native/src/`. Only gaps are listed. Status: **FIXED** (done in the new app), **OPEN** (still to do), **TRIAL** (only matters once Finance's trial ends; still to build).

HIGH = money, data, permissions, safety or a daily job. MED = noticeable. LOW = rarely used or minor.

## Core, Home, Admin (000–270)
- HIGH OPEN — Phone tabs for site managers, clients and subcontractor logins: no way to HR, HUB, Inbox or My Dashboard on a phone (old bottom bar). Site managers had an HR row on Projects.
- MED OPEN — Tapping a push notification doesn't open the right page (no tap listener; route map uses old paths).
- MED OPEN — Setting the responsible PM from the Projects list doesn't notify that PM (notify-site-assignment).
- MED OPEN — "Needs your signature" pop-up on Home for unsigned company policies.
- MED OPEN — General (not a project) to-dos: can't add, tick, edit or delete.
- MED OPEN — Refresh data when the app comes back from the background (role changes, removal, finance switch).
- MED OPEN — Clients can type the address of non-client job pages (old router allowed home, schedule, hs, snagging only).
- MED OPEN — "Save to OneDrive" on exported PDFs.
- LOW OPEN — "Add your mobile number" prompt; manager-only pages with no role check (onsite, todos, hub, sitemap); search depth (materials, to-dos, snags, admin items); HR people query not company-filtered; copy the address by tapping the header; "CC me" on emails.

## Repairs, pricing, reports (290–435)
- (report pending)

## Schedule of Works, snags, RAMS (440–580)
- HIGH FIXED — Status change waiting for photos now shows straight away (481 sowPendingForRender).
- MED FIXED — Check-in Excel export for every manager (was admins only).
- MED FIXED — Schedule of Works Export PDF / Email for everyone (was managers only).
- MED FIXED — Opening another company's subcontractor hub by link now blocked for non-managers.
- MED OPEN — Plan mark-up: select a mark to move, resize, recolour, edit text or delete; "Number from…".
- MED OPEN — Subcontractor admin issuing and closing permits (incl. override).
- MED OPEN — Site Rules & Layout: Export Signed PDF.
- MED OPEN — Inductions: email/export one or a ticked selection, with CC me / CC client.
- MED OPEN — Subcontractor's Schedule of Works tile: full task rows (status, photos) not read-only.
- MED OPEN — RAMS: tick several and export / email as one pack.
- LOW OPEN — close/reopen address from the list; SoW email recipient tick list; library template preview; Excel import template download; multi-site address carry-over on add; old photo size backfill; leftover-photo view; photo mark-up select tool; snag closing photo from library; MC inspections listed per company; inspection templates from the job; client sees sign box on site layout; OneDrive inductions folder show/unlink; sub company library in the hub; subcontractor RAMS per company on the RAMS page; delete superseded RAMS; RAMS multi-page signing tick.

## H&S, materials, plant (584–760)
- (report pending)

## Drawings, calendar, driver, deliveries (770–890, 9219zr/zq/m/zz)
- HIGH OPEN — Tapping a push notification opens the right screen (same as above).
- MED OPEN — PM reply to a supplier-invoice query (fin_pi_query_view / fin_pi_query_reply).
- MED OPEN — Finance PO PDF saved into the job's Material PO's › Finance POs folder.
- MED OPEN — Cancelling a PO cancels its site requests; remove lines; reopen restores.
- MED OPEN — Driver day off: clear "Driver has a scheduled day off" message (now "Could not save"), and the all-drivers-off check.
- MED OPEN — O&M manual: attach files to table rows; choose data sheets from the COSHH library; add documents added since the manual started.
- MED OPEN — COSHH library: drop several data sheets into a folder → an assessment each.
- MED OPEN — PM's "Things the office has sent you" page (#/to-book).
- LOW OPEN — message taps for delivery problem / invoice query; delivery form role check; cover photo from camera; uploaded SoW PDF as appendix; wipe COSHH library; sub company library from the job; delete sub application (any manager); pick PO when booking stock in.

## Finance part 1 (900–9219j)
- (report pending)

## Finance part 2 (9219k–922)
- HIGH OPEN — Site variations imported into Finance's register (forecast, Variations tile and page leave them out).
- HIGH OPEN — New invoice takes the client's default VAT code (reverse charge).
- HIGH OPEN — Application Excel / PDF in the old layout; upload the Excel back.
- HIGH OPEN — Certify line by line (Certified % per line; cert_lines saved; from the client's Excel/PDF).
- HIGH OPEN — Certificate discount starts from the application's discount; discount on an Applied application saved.
- HIGH OPEN — Open draft application keeps up with newly approved / unapproved variations and day works.
- HIGH OPEN — Application autosave with a copy kept on the device.
- HIGH OPEN — Release retention through an application.
- HIGH TRIAL — New PO builder in Finance (job per line, Disc %, cost codes, site contact).
- MED OPEN — "Raise and issue the invoice now" should start unticked when certifying.
- MED OPEN — Statements: add a line by hand, change a line's type, "lines add up to" check.
- MED OPEN — Add a line / section inside an application; delete a job (with the booked-items check); BoQ autosave and line fields (plot, cost rate, margin); bill-to synced with the Directory; send a variation to the SoW.
- MED OPEN — Company VAT rates list; row ⋯ delete application at any stage + export; per-line Previous / This period columns; list month pickers and value filters; Project Admin fields (QS, monthly application dates, final release date, project details); site-progress suggestions on applications; Purchase Quotes tab and price list edit; edit a yard-stock cost line; link Directory supplier to Projects supplier; contract value vs BoQ total choice; budgets from a target margin; retention halves use held not still-held; SoW report attached to applications; Send pop-up; BoQ export / margin tool / add item at a position; site variation value sync; double-tap locks (retention half could raise two invoices).
- LOW OPEN — Getting started card; stage drop-down; tile option menus; variation/day work attachments; over/under budget bars; voided invoices fold; raw database messages; Detailed Summary search; project Purchases "All" tab.
