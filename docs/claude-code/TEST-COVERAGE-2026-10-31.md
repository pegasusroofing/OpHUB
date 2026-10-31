# What has been tested in the native app (31 Oct 2026)

All of this ran on the laptop against a fake database, in a web browser at computer size and phone size.
Nothing here touched the real database, real phones, real emails, Xero or OneDrive.

The Sandbox section below is the exception: it ran against the real database.

## Sandbox run on the real database (31 Oct 2026)
`crawl.js` with `REAL=1` behind `tools/test-harness/sandbox-guard.js`. Admin login, computer size, 3 hours 25 minutes. 138 screens opened, 4,423 presses, no crashes.

**What stopped it doing harm:**
- Every server function was refused (148 Xero calls, 25 OneDrive and 1 driver check-in notice among them). The Sandbox email log still has the same 3 rows, all from before today.
- 309 changes to existing records were held back and answered as if they worked. Every column they named exists in the database.
- Rows changed today in Sandbox are only the ones the test added. This could only be checked on tables that record a change date.

**Faults found and fixed:**
- Repair job photos never loaded: the list asked for a column that doesn't exist.
- Finance "Delete this project" could never work: its check on operative invoices was badly formed, so it always said it couldn't check.
- Finance yard stock rates never loaded.
- Saves refused by the database looked as if they worked (0 rows, no error). Client Schedule of Works presses were one. About 25 more saves that a person presses directly now report the failure: snags, materials, plant, PPE, variations, permits, PUWER, section flags, repairs, calendar, addresses, driver jobs, vehicle checks, COSHH.

**Not covered:**
- Other roles have no Sandbox login. They were checked by a database rules test that was undone afterwards. It showed no role can see or change another company's data, and that site managers, operatives, drivers and clients can't see or edit invoices or POs.
- 35 screens were skipped because Sandbox has no matching record: subcontractor pages, briefings, permits, RAMS builder, incidents, O&M, drawing files, operative detail and others.
- 51 busy screens reached 30 or more presses. Each view stops at 30 different buttons, so some buttons on them weren't pressed here.
- 433 presses were flagged. 205 "nothing happened": the ones checked were information rows, tabs already open and the backgrounds of pop-ups. 222 "covered" and 6 "could not press": mostly a pop-up in the way or a greyed-out button, so those buttons were not pressed on the real database. They include Schedule of Works close-out and export, and HAVS save and close for the week.
- The fixes above were not rerun on the real database, because the sign-in had expired. They were rerun on the fake database.
- Saves that happen behind the scenes (positions, links, synced dates) were left without the new check, as a failure there isn't something a person acts on.

Test rows are removed by `docs/claude-code/sql/5 - Sandbox test tidy-up (31 Oct).sql`.

## Pressed by the crawler
`tools/test-harness/crawl.js` opens each of 173 screens as a role and presses each different button, then the menu items and the yes / delete / save that follow. About 14,000 presses in all.

| Role | Screens opened | Presses | Saved something | Notes |
|---|---|---|---|---|
| Admin, computer | 173 | about 3,800 | about 370 | |
| Admin, phone size | 173 | about 4,000 | 524 | |
| Project manager | 173 | 3,633 | 355 | 5 screens correctly refused |
| Site manager | 173 | 1,833 | 187 | 51 correctly refused |
| Operative | 173 | 577 | 35 | 50 refused, 53 sent elsewhere |
| Driver | 173 | 119 | 11 | 35 refused, 125 sent elsewhere |
| Client | 173 | 229 | 21 | 41 refused, 106 sent elsewhere |

No screen crashed. The only rows marked as crashes came from the laptop sleeping; those screens were run again.

Limits: forms were filled with "Test" and 10 only; dates and pickers in forms were left alone; at most 30 different buttons a screen and 5 minutes a screen; repeated row buttons were pressed once.

## Figures compared with the old app
`tools/test-harness/figures-compare.js` loads the same data in both apps and compares every pound figure and percentage.
Match: overview, costs, budget, variations, day works, summary, applications, invoices, POs, subcontracts, jobs, sales, purchases, subs, yard. Differences left, all explained: monthly shows whole pounds; some new pages add extra figures (retention card, starting point, mark-up, line totals); the draft application has no combined Variations & Day Works total or Retention % in its header.

## Faults this found (all fixed)
- PO: Save without typing blanked the value.
- Costs: "All" wrongly included orders.
- Budget page: summary, over / under, totals and Value list missing.
- Sales and Purchases: ⋯ date range on figure cards missing.
- Sales, Purchases and Subs: figure cards did nothing when tapped.
- Application and invoice rows: ⋯ menu missing.
- Sales invoices: client blank on every invoice; Due, Net, VAT, Xero state missing; Owed included VAT.
- Applications list: Certificate wording, how short, Raise invoice missing.
- Purchase invoices: VAT, Checks and goods-received state missing.
- Finance tables ran off the page once the filter boxes were added, hiding the Status column.
- BoQ: margin in pounds missing.
- Client could open other H&S pages by link.
- Phone: long file name pushed the Save to OneDrive bar and its ✕ off the screen.
- Job Activity: empty name in a View (can crash a phone). Briefing not yet completed showed "Invalid Date".

## Same as the old app, worth a decision
- A client can press To Commence / In Progress on Schedule of Works tasks, and close out a section. The old app shows them too. Whether it saves depends on the database rules, which were not tested here.
- Anyone can open the driver check-in and vehicle pages by link, as in the old app. No menu leads there for other roles.

## Only read in the code, not run
Repair job "Signed off by" line, separate PDFs for briefings, over-PO flag when filing from the inbox, one supplier per PO from quotes, bulk reopen question, PPE export buttons, Open a subcontractor's Inspections.
Buttons greyed out in the test data, so not pressed: New Briefing (no template in the test data), Save / Use a template on signature boxes, Submit Variation (needs a photo), Add a receipt (needs a receipt).

## Cannot be tested here
Real phones (camera, signing, GPS, push, signature box page picture, dragging inside a scroll); the real database and its rules; real emails; Xero; OneDrive; server functions; file pickers beyond opening them.

Some Finance lists (subcontractors, plant, suppliers) show as cards on a laptop where the old app has tables. The information is all there; the look differs.
