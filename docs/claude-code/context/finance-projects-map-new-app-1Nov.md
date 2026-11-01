# Finance-Projects map v3: audit of the NEW app (app-native/src), 1 Nov 2026

Read-only. Paths are under app-native/src. DB catalogue checked read-only (pg_trigger / pg_proc): triggers price_sheets_to_fin_order, yard_moves_apply, zz_delivery_task_grn, trg_sites_job_number, schedule_flags_delivery_request exist; rpcs fin_raise_po, fin_new_po, fin_flag_grn_problem, fin_pi_query_view/reply, fin_inbox_pm_book/reply, site_office_orders, site_delivery_dates, site_application_dates, site_is_empty, yard_cost_edit exist.

Status key: WORKS, PARTIAL, MISSING (regression), NBA (not built anywhere), TRIAL-OFF, SERVER, BEING BUILT.
"Same as old" under PARTIAL means the new app has the same gap the map already listed for the old app (not a regression).

| ID | Status | Evidence | What's absent | How to test (test company, click-through) |
|---|---|---|---|---|
| L01 | WORKS | data/admin.ts:92 toggleFinance; fin/team.tsx:41; pm/admin/users.tsx:41-62; account.tsx:50-58 (finance_hidden) | nothing | Admin > Finance > Team > "Give Finance" on an operative: asks first, role becomes PM; switch off: old role returns. Account > Show Finance toggle hides tile. |
| L02 | WORKS | components/PmHome.tsx:83; app/(app)/sites/[id]/index.tsx:149; lib/adminItems.ts:38; fin/_layout.tsx:14 guard | nothing | Log in as PM with Finance on / off: tile appears / vanishes; type /fin as non-finance user: bounced home. |
| L03 | WORKS | components/MoneyStrip.tsx (useBook); sites/[id]/index.tsx:170; repairs/index.tsx:75 | nothing | Open a project home as finance user with costs and an invoice: strip shows costs, invoiced, margin. |
| L04 | WORKS | app/(app)/_layout.tsx:66; lib/roles.ts:15,22 | nothing | Org with has_pm=false: only Finance reachable; non-finance user is told who switches it on. |
| L05 | PARTIAL | fin/job/[id]/index.tsx:288-306 (name, status, start, client, address, postcode, closed_at/by); finBook.ts:45 saveJobNumber; finBook.ts:42 stamps setup_checked_at | Project manager (sites.responsible_pm_id) can't be changed from Finance Project Admin (old 908 finJePm). Only set on New job form (newjob.tsx:75) or Projects > Sites menu (sites/index.tsx pmMenu). | Project Admin > Project: edit name/address/status, check Projects site card changes. Look for a PM picker (none). |
| L06 | SERVER | sites/new.tsx:42,73; data/siteList.ts:21 sends job_number null; DB trigger trg_sites_job_number; settings in fin/settings.tsx:148-163 | nothing (same as old: client passes null, trigger numbers it) | Finance > Settings > turn on automatic numbering, then Projects > New site: number given; counter in settings moves on. |
| L07 | TRIAL-OFF | fin/newjob.tsx:37 `blocked = FIN_TRIAL && !finOnly && !sandbox`; form otherwise full (newjob.tsx:60-100) | Normal companies can't create from Finance during trial (same as old) | On Sandbox company: Finance > New project; check sites + job_finance + client_pos rows appear in Projects. On RTB: blocked message. |
| L08 | PARTIAL | fin/job/[id]/index.tsx:299-305 and fin/directory.tsx:271-272 (client name to billing); data/finApp.ts:123,151 (bill_* on invoice) | Matched by name only, no client_id (same as old) | Change client on a project to a Directory client; raise invoice: Bill to / address / email filled. |
| L09 | WORKS | lib/finInvoicePdf.ts:33-36 (site name, job no, address); data/finApp.ts:203 + lib/finAppPdf.ts:30 (project, project id) | Application PDF/Excel show name + job number only; no address (same as old 9219p) | Issue invoice, open PDF; export an application PDF and Excel. |
| L10 | PARTIAL | data/invoiceRead.ts:18; lib/rules/invoiceRead.ts:18-32 (PO, job no, postcode, address/name) | Rebuilt separately. Plots (site_sub_addresses) and repair_jobs addresses still not checked | Not retested here. |
| L11 | WORKS | fin/job/[id]/index.tsx:255; siteList.ts setSiteStatus; closed jobs filtered at fin/yard.tsx:53, FinSales.tsx:101, FinSubs.tsx:135, FinPurchases.tsx:129, fin/pinv/[pid].tsx:181 | nothing | Close a project in Projects; check it is gone from New invoice / New PO / yard pickers; reopen it, back again. |
| L12 | PARTIAL | fin/job/[id]/index.tsx:252-262 + finBook.ts:70-82 finBookedOn (20 tables, fail-closed); sites/index.tsx:114-121 | Projects-side delete unchanged (same as old): admin "Delete permanently" skips any finance check and hard-deletes (sites/index.tsx:114). PM relies on site_is_empty RPC (siteList.ts:58) | As PM delete a project that has an invoice: should be told it will be closed. As admin do the same from Projects (don't, on RTB): see what happens. |
| L13 | WORKS | data/finSubJobs.ts:21,24; used by fin/job/[id]/boq.tsx, parts.tsx, monthly.tsx, components/FinNewPo.tsx, FinSplit.tsx | nothing | Project with plots: BoQ line "plot" picker; cost split by plot; Costs by plot report. |
| L14 | WORKS | data/finSubJobs.ts:21 (variation_cost); fin/job/[id]/monthly.tsx:39 | nothing | Repair contract: set a repair job variation cost, open Finance Costs by repair job. |
| L15 | NBA | no read of repair_jobs.invoiced in fin; none in data/repairs.ts | map says Missing; still missing | n/a |
| L16 | PARTIAL | QS: fin/job/[id]/index.tsx:344 (qs_id). PM: newjob.tsx:75, siteList.ts:50 | Same gap as L05: PM not editable from Finance Project Admin | Project Admin > Project details: QS picker works; look for PM picker. |
| L17 | PARTIAL | fin/job/[id]/boq.tsx:183-205 | Same as old: deleted BoQ lines leave orphan tasks; qty/unit not carried; a line moved to another plot only updated; repair contracts not excluded (not checked) | BoQ with sections/items > "Send to the operatives' schedule"; open Projects Schedule of Works. |
| L18 | WORKS | boq.tsx:165-180 (copy in tasks), 113-114 (contract_item_id written back) | nothing | Schedule with tasks, empty BoQ > "Copy in N tasks"; save twice: no doubles. |
| L19 | WORKS | data/finApp.ts:282-287 loadSiteProgress; fin/job/[id]/application/[app].tsx:182-220 | Plain average (same as old) | Mark SoW tasks done / % in Projects; open application: "Site 40%" tag, "Use site progress". |
| L20 | WORKS | data/finApp.ts:268-280; application/[app].tsx (varProgress prop) | nothing | Variation on SoW section with task progress; open application: variation % filled. |
| L21 | WORKS | data/finVar.ts:16-36 importSiteVariations; fin/job/[id]/variations.tsx:43 (runs when tab opens); data/finApp.ts:31 | Imports only when a Finance user opens the tab (same as old); later on-site changes not re-synced | Raise + approve a variation on site; open Finance > Variations: appears as Approved. |
| L22 | WORKS (better than old) | data/variations.ts:42,81-107 writes cost_impact; syncToFinance :67; data/finVar.ts:44-66 fillSiteValues; syncSiteVariationValues before new application | nothing | PM sets £ on a site variation; Finance variation quoted/agreed fills; new application carries it. |
| L23 | WORKS | data/finVar.ts:70-84 varToSow; variations.tsx:65,109 | nothing | Finance variation > "+ Schedule of Works"; see new section in Projects. |
| L24 | WORKS | data/variations.ts:113-121; fin/job/[id]/variations.tsx:65 | auto-closed site variations not seen (same as old) | PM "Add variation to schedule"; Finance row shows "On the schedule". |
| L25 | NBA | data/finVar.ts:88-92 setVarGroup writes fin_variations only | one-way; nothing writes variations.approval_status from Finance | n/a |
| L26 | NBA | additional_works_requests only in data/price.ts, data/siteHome.ts; nothing under fin/ | Finance never reads it | n/a |
| L27 | NBA | Finance side only: fin/job/[id]/dayworks.tsx:53-90 -> data/finApp.ts:40,49 (works) | no day-work sheet on site | n/a (Finance-typed day works: create, approve, check they land on application) |
| L28 | SERVER | data/materials.ts:305 rpc fin_raise_po (financeUser only); requests.tsx:42 | PMs without Finance never raise a PO (same as old); trial also needs po_enabled | Finance PM sends a material order: PO number on order email; Finance > Purchases shows PO. Non-finance PM: no PO. |
| L29 | WORKS | data/materials.ts:109-116 poLock; requests.tsx:67,89; materials.ts:337 reemailOrder (no new PO) | nothing | Send order; try Edit / Send again: locked, told to use Finance. |
| L30 | WORKS | data/finPurchase.ts:114-136 (cancel PO -> requests cancelled, reopen -> restored), lines 150 (remove lines); lock above | nothing | Cancel a PO in Finance: its requests show cancelled in Projects; reopen: back. |
| L31 | WORKS | components/ShopPicker.tsx; data/materials.ts:98 shop_item_id | picker Finance users only (same as old) | Request "From a project quote"; PO line rate source = list. |
| L32 | PARTIAL / UNSURE | data/materials.ts:98-100 save sub_site_id / repair_job_id on material; fin_raise_po call (:306) passes no sub-job | Whether fin_raise_po infers sub_job_id server side not checked (same as old "Needs check") | Request for Plot 3, send order; check PO sub job in Finance. |
| L33 | PARTIAL | data/materials.ts:434-435 (grn); data/finPurchase.ts:30,97 (PI checks, PO item received/problem) | Inbox filing doesn't check "not received" (same as old) | Save a GRN as operative; open PO in Finance: line received. |
| L34 | SERVER | data/materials.ts:443 rpc fin_flag_grn_problem | nothing | GRN with problem: Finance gets "Delivery problem", that PO's supplier invoices go on query. |
| L35 | SERVER | data/materials.ts:461-470 rpc site_office_orders; app/(app)/sites/[id]/materials/index.tsx:44-58; data/calendar.ts:36 + :149 rpc site_delivery_dates | nothing | Raise a Finance PO with date; PM sees "Ordered By The Office" (no prices), job calendar shows delivery. Operative sees no PO number. |
| L36 | MISSING | components/FinNewPo.tsx has no site contact / phone fields; grep site_contact on purchase_orders: none in app-native | Site contact picker (PM, assigned operatives, admins, typed) + phone, saved as purchase_orders.site_contact / site_contact_phone and "Site contact" line in note; not on PO PDF either | Finance > New PO: look for Site contact field (none). Old: web app New PO. |
| L37 | WORKS | components/FinNewPo.tsx:32,71; FinPurchases.tsx:44; data/invoiceRead.ts | nothing | Add supplier in Admin > Suppliers, pick on New PO. |
| L38 | PARTIAL | fin/directory.tsx:260-262 manual link (supplier_id, "__new" creates suppliers row) | No auto-link by exact name on Xero pull (directory.tsx:80-99 never sets supplier_id) or on new PO supplier; PI keeps supplier_name text (same as old) | Directory > Suppliers > pull from Xero (Sandbox): linked? Edit supplier: link to Projects supplier works. |
| L39 | MISSING | FinNewPo.tsx:34 uses org po_vat_default only; purchase_vat only read/written in directory.tsx | Supplier default VAT not applied to PO lines on Finance-built POs (old 9219j:271-283) | Directory: set supplier purchase VAT to Zero; New PO for that supplier: lines should default zero. |
| L40 | WORKS | data/materials.ts:309 p_branch; fin/po/[po].tsx:65; lib/finPoPdf.ts:30 | nothing | Order to a supplier branch; PO shows branch. |
| L41 | SERVER | booking sets delivery_tasks.material_ids/po_id: data/materials.ts:256; completion in data/driver.ts:221 only updates task; DB trigger zz_delivery_task_grn marks received | nothing client-side (as in old: server does it) | Book a collection from an order, driver completes with photo: items show received "Collected by". |
| L42 | WORKS | data/finPurchase.ts:166-182 filePoPdf; called fin/po/[po].tsx:110 | nothing | PO PDF / email: check job's Material PO's > Finance POs folder, one file updated in place. |
| L43 | NBA | flags written by data/sow.ts, DB trigger schedule_flags_delivery_request -> Delivery Schedule; Finance has nothing | no cost to job (map: Not needed) | n/a |
| L44 | SERVER | data/materials.ts:511-519 yardMove inserts yard_moves with material_id and closes the request; DB trigger yard_moves_apply makes fin_job_costs | item without rate puts no cost (same as old) | Request > fill from yard stock: Finance costs ledger gets "YARD" line. |
| L45 | SERVER | same yardMove; materials/yard.tsx:33 | not tied to request (same as old) | Quick-issue from yard overlay; cost on job. |
| L46 | PARTIAL | fin/yard.tsx:84-88 issue/return/adjust; rate fin/yard.tsx:71; costs.tsx:59-63 | Editing a yard cost in place (qty, rate, date, job via rpc yard_cost_edit, old 9219zd-price-list-edit.js:112-160) not built: no client call to yard_cost_edit; user is told to re-issue stock | Costs ledger > tap a YARD cost: only a message, no edit form. |
| L47 | WORKS | components/YardBookIn.tsx:29,108 (poId); used by driver/yard.tsx, fin/yardin.tsx, materials/yard.tsx | not linked to the supplier invoice (same as old) | Book stock in as PM, driver, finance (pick PO). |
| L48 | PARTIAL | data/finBook.ts:20; lib/rules/finBook.ts:94-98 | Same as old: one full day per person per site per date, hours ignored, no repair-job allocation | Operative checks in; PAYE rate in People & rates; job labour shows day rate. |
| L49 | NBA | no finPayLinesFor equivalent; labour/[lid].tsx has no check-in days | n/a | n/a |
| L50 | WORKS | fin/labour/[lid].tsx:63-88; lib/rules/finBook.ts:75-88 (lines + materials) | nothing | Enter operative invoice split across two jobs with materials: both jobs get labour + "Materials supplied by operative". |
| L51 | BEING BUILT | data/wageBook.ts exists, being built separately | skipped | skipped |
| L52 | BEING BUILT | as above | skipped | skipped |
| L53 | BEING BUILT | as above | skipped | skipped |
| L54 | NBA | labour_invoices written/read only in components/PriceFiles.tsx; no fin reader | n/a | n/a |
| L55 | WORKS | fin/directory.tsx:61,118 | nothing | Directory > Labour: operatives listed from profiles; set rate. |
| L56 | WORKS | fin/directory.tsx:71,175-176 (app -> fin_labour_rates) | insurance dates not carried (same as old) | Submitted subcontractor form > Add in Directory > Labour. |
| L57 | NBA | no use of subcontractor_companies/operatives under fin | n/a | n/a |
| L58 | SERVER | DB trigger price_sheets_to_fin_order exists; priceSheets.ts issues the sheet; client doesn't create the fin_subcontracts row | trigger not in repo (UNSURE that it behaves as map says) | PM issues price sheet; Finance > Subcontractors shows an order, value follows re-issue. |
| L59 | WORKS (old was broken) | fin/sub/[sid].tsx:108,223-244 orderToSheet (pricing_elements, price_builder_sheets, items, price_sheet_id) | nothing | New subcontract PO with tick: project Price tile gets issued sheet. |
| L60 | MISSING | fin/sub/[sid].tsx only writes price_sheet_id (:242); no read of price_builder_sheets, no link | Price sheet block on subcontract page (title, status, total, link to sheet; old 912 finScSheetBlockHtml :344-350 and header :140) | Open a subcontract that has a sheet: no sheet block (old shows one). |
| L61 | NBA | contra typed in fin/sub/[sid].tsx; snags untouched | n/a | n/a |
| L62 | NBA | no driver_checkins in fin | n/a | n/a |
| L63 | NBA | plant register not read by fin | n/a | n/a |
| L64 | PARTIAL | fin/plant/[pid].tsx; fin_plant_hires costed in finBook | Site has no view of hired plant / off-hire request (same as old) | Add hire to a job; cost lines appear. |
| L65 | NBA | pc_date only typed in FinSales.tsx:62 and Project Admin | nothing from handover | n/a |
| L66 | SERVER | data/calendar.ts:132-147 rpc site_application_dates; pm/calendar.tsx:61,108 | nothing | Set application day; check job calendar + all-projects calendar for "Application due". |
| L67 | WORKS | data/finApp.ts:~205-210 (buildSowPdf appended) | email of it is TRIAL-OFF | Export application with Schedule of Works report ticked. |
| L68 | NBA | no expenses read in fin | n/a | n/a |
| L69 | TRIAL-OFF | finInvoke/finBlocked: data/finance.ts:28-29, lib/rules/finance.ts:13-17; call sites FinXero.tsx, fin/job/[id]/invoice/[inv].tsx, finInvoice.ts, finPurchase.ts | posting deliberately off on RTB | On Sandbox only: approve invoice, check Xero post. |
| L70 | PARTIAL | fin/directory.tsx:80-99 customers/suppliers pull (add or update by xero_contact_id/name) | "Bring in from Xero" for workers/employees to fin_labour_rates (old 9216 openFinXeroWorkers + finXwMatch; Xero action "workers") not built; action not in XERO_CLIENT_OK either | Directory > Labour: look for "Bring in from Xero" (none). |
| L71 | WORKS | fin/reports.tsx:75; data/finBook.ts:20; lib/finReports.ts | nothing | Run Labour by person, CVR, cash flow on test data. |
| L72 | NBA | report_submissions not read by fin | n/a | n/a |
| L73 | PARTIAL | PM side built: data/toBook.ts:19-33 (rpcs fin_inbox_pm_book / _reply), pm/tobook.tsx, PmHome.tsx:39; Finance list FinPurchases.tsx:162 reads stage=with_pm | Nothing in the new app writes stage='with_pm' / assigned_pm (no "Send to PM" in fin/inbox/[iid].tsx) | skipped per brief |
| L74 | WORKS | fin/pinv/[pid].tsx:103,132,165 (tellPmOfPi, reply); pm/piquery/[pi].tsx rpcs fin_pi_query_view/reply | nothing | Mark supplier invoice Query: PM gets message, answers, Finance sees thread. |
| L75 | NBA | drawing_files not used in fin | n/a | n/a |
| L76 | NBA | lib/rules/boqCost.ts is margin / mark-up % only; no rate card link in boq.tsx | n/a | n/a |
| L77 | NBA | no sow_library in fin | n/a | n/a |
| L78 | SERVER | fin_raise_po server pricing; client sends nothing (materials.ts:305) | not verified (UNSURE, same as old "Needs check") | Order with item on price book; PO line rate estimate. |
| L79 | NBA | app/(app)/search.tsx:37-42 searches reports, drawings, materials, todos, snags only | no PO / invoice / application numbers | n/a |
| L80 | PARTIAL | order note to PO: data/materials.ts:310,317 | other request messages still go only to site thread (same as old) | Send order with note: PO note shows in Finance. |
| L81 | PARTIAL | fin/newjob.tsx:84-95 (client_pos with files), data/finBook.ts:48-60 saveClientPo; fin/job/[id]/index.tsx:285-380 (Project Admin) | New-project form trial-gated (L07); multiple PO files per PO picker not seen (one attach at a time) | Project Admin > + Client PO with file; PO number on next invoice. |
| L82 | WORKS | fin/job/[id]/index.tsx:367; boq.tsx:121-132 (Use BoQ / Keep typed); data/finApp.ts:241 | not checked: whether a failed read overwrites typed value (old gap) | Type contract value, save BoQ with different total: prompt appears. |
| L83 | WORKS | components/FinSales.tsx:59-70 | nothing | Sales > Retention: type PC date and final release; Project Admin shows same. |
| L84 | PARTIAL | setup_checked_at written at data/finBook.ts:42 on every saveJobFinance; never read anywhere | The Getting Started card on project Overview (old 9219zi finStartCardHtml :87-104, finSetupDone) not built; partly covered by NeedsAttention list (fin/job/[id]/index.tsx:408-417) | New project Overview: no step card. |
| L85 | PARTIAL | fin/job/[id]/index.tsx:109,152 (reads fin_variations + fin_dayworks live, no stale cache) | Reads fin_variations only, so site variations count only after Finance opens Variations tab (same as old) | Raise site variation; Overview Variations row stays at 0 until tab opened. |
| L86 | WORKS | fin/job/[id]/index.tsx:165; lib/rules/finBook.ts forecast | nothing | Open Overview on a project with data. |
| L87 | WORKS | fin/jobs.tsx:70-72 (name, number, client, PO, PM, postcode) | nothing | Type a PO number into Search projects. |
| L88 | WORKS | fin/job/[id]/index.tsx:252-262 + data/finBook.ts:70-82 | nothing | Delete project with an invoice: offered "Close it instead"; empty one: deleted. |

## Counts
- WORKS: 34
- SERVER: 10 (L06, L28, L34, L35, L41, L44, L45, L58, L66, L78)
- TRIAL-OFF: 2 (L07, L69)
- NBA: 18
- BEING BUILT: 3 (L51-53)
- PARTIAL: 18
- MISSING: 3 (L36, L39, L60)
Total 88.
