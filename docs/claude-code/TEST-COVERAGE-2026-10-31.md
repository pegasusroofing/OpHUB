# What has been tested in the native app (31 Oct 2026)

All of this ran on the laptop against a fake database, in a web browser at computer size and phone size.
Nothing here touched the real database, real phones, real emails, Xero or OneDrive.

The Sandbox section below is the exception: it ran against the real database.

## Second pass on Sandbox (1 Nov 2026)
Parts `hs1` to `hs6`, `pack1` to `pack4`, `sowdays` in `tools/test-harness/jobtest-parts/`. Phone size, real database.

**Worked to the end:** daily briefing (start, complete, issue, operative signs, Edit goes after the first signature, PDF); induction (all three stages by an operative, PDF stored, manager sees it under Completed); incident (operative signs and submits, manager reads it); HAVS (manager adds a tool, site manager logs minutes; operatives only see HAVS when it's switched on for the job); inspection (start and complete); expense (receipt saved; email blocked by the test rule, and Sandbox has no expenses address); subcontractor as their company's admin (made admin, uploads RAMS to their folder, sees only their tasks, opens their briefings).

**To Do:** option A with counts across the top. Counts filter, press to open, comment, Mark Complete, + Add To Do all worked.

**Variations:** the mark-up screen opens on the chosen photo and the marked-up photo saves.

**Permits:** new PDF (the old app has none). Made and stored on issue and close, Export gives a real PDF.

**Schedule of Works PDF:** now always covers every task. Photos, date tag and the line between days checked by eye on a drawn page.

**Fault found and fixed:** on the website version a queued photo was only a browser link, dead after a reload, so it stayed on "Not sent yet" for good. The photo itself is now kept when queued. Five at once: all arrive, nothing stuck, 27 seconds. A photo still being prepared at the moment of a reload can be lost (one of five in the reload test): the rest arrive.

**Job pack, real OneDrive, test folder `OpHUB Progress Reports/ZZ Job Packs`:** making a job built all 38 folders; the 6 template documents copied (through RTB's shortcut, which needed a fix); RAMS landed in 1. RAMS; pre-start photo in 1. Pre Start; progress photo in 2. Week 1; with the job moved on two weeks, a new 4. Week 3 appeared by itself; Documents tile lists the folder and adds a file.

**Job pack rules not run for real:** toolbox talk issued, COSHH added, permit closed, variation approved, briefing or report completed, drawing added, O&M, hand exports. The code is in; the rule behind them is the one tested. Not run on the real Live Projects folder. Not switched on for RTB.

**Emails, not tested:** the new material table, variation photo and permit attachment were not sent, as test emails to the managers are blocked. The HTML hasn't been seen in an inbox.

**A correction to the night's report:** `messages` rows for managers email every PM and admin through a database trigger (`messages_push_notify` to `send-message-push`), which the browser guard can't see. Test runs did email Sandbox's manager logins (+demo seen by Andy). Nothing goes beyond that company's own managers. The guard now holds those rows, so HUB and notices to managers aren't sent in tests.

## Real jobs worked on Sandbox (night of 31 Oct to 1 Nov 2026)
`tools/test-harness/jobtest.js` with `FULL=1`, parts in `jobtest-parts/`. Phone size, real database, real file uploads, as the project manager, site manager, operative, driver, client and subcontractor logins. Andy's admin login had expired, so the project manager led. Each step checks what the database holds afterwards.

**Used for real and worked:** new job; team; Schedule of Works sections, tasks, pre-start, progress and completed photos (3 seconds, three sizes), slider, status changes, site condition Submit, CSV import; Export to PDF (opened and checked as a PDF), hand-off to a stand-in share menu, OneDrive (file arrived on this laptop); one real email (to Andy only, no copies, confirmed in the email log); Drawings upload, any file type, rename, supersede, delete, sub-folder, Export; RAMS upload, issue, operative signature, signed PDF, supersede with re-sign, RAMS builder through to issued; toolbox talk upload, issue, operative signature, signed PDF; COSHH upload and signature; snag with photo and close; variation with photo and approval; material request; calendar date and Visibility (operative really can't read a managers-only date); To Do; HUB @ mention, Send choice, thread; check-in and out with location and phone id; PPE request; plant item; repair job from survey to sign-off and closed, survey PDF, tracker Excel; multi-site addresses, task on a plot, check-in at a plot; main contractor switch, subcontractor company, person attached, their folder, only their tasks, their RAMS signed, hot works permit; O&M manual and PDF; price started; delivery from office to driver, completed with a photo; site manager snag; client read-only view.

**Faults found and fixed:** photo records refused for good where phones or non-https pages couldn't make a proper id (every record id, whole app); calendar never showed its dates; the trail kept a folder's steps on other pages; a subcontractor landed on Projects, not their folder; clients saw no tasks that sit in a section (see SQL file 6); a project manager's new subcontractor lost its library profile (fix not rerun).

**Started or opened only, not finished:** daily briefing and reports (started, not submitted); HAVS and induction (page opened); incident form (opened); expenses (receipt added, not sent).

**Not tested:**
- Finance on real jobs: the admin login had expired and the project manager has no Finance access.
- Company admin pages: same reason.
- OneDrive folder picker and sync from OneDrive. Uploads went to the automatic folder for the job.
- Emails other than the Schedule of Works report. Those that copy the sender or pick people from the database were blocked, as the only allowed address was Andy's.
- Real phones: camera, GPS, push, finger signing, the real WhatsApp share menu, and the taskbar against a real iPhone address bar.
- The phone-size button run wasn't rerun for the moment the app reloaded (about 22:12). It had no crashes.

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
- 35 screens were skipped at first because Sandbox had no matching record. Test records were added and all 35 were then opened and pressed (929 presses, no crashes).
- 51 busy screens reached 30 or more presses. Each view stops at 30 different buttons, so some buttons on them weren't pressed here.
- 433 presses were flagged. 205 "nothing happened": the ones checked were information rows, tabs already open and the backgrounds of pop-ups. 222 "covered" and 6 "could not press" came to 94 different buttons, 46 of which were pressed fine another time in the run. The rest were pressed one at a time by `sandbox-recheck.js` on a fresh screen, except those under "Still not pressed" below.
- **Recheck on the real database:** yard rates and repair photos load with no database error. Delete project lists what's booked to a job with records, and asks to confirm on an empty job (not confirmed). Schedule task To Commence and In Progress, section close-out, and HAVS save and close all saved. Schedule export and email open their forms (not sent). Change dates and the library buttons open or save. The Final Account, Day Works and Prelims menus on the job page are the Contract Value, Variations and Costs cards after a different figure is chosen, and those menus opened fine.
- **Still not pressed on the real database:** New Briefing, Add a receipt, Submit Variation and Apply to ticked (greyed out until filled in), and date picks in driver time off and material requests. Also the pop-up Close buttons (those pop-ups closed other ways) and plant "Finance".
- Saves that happen behind the scenes (positions, links, synced dates) were left without the new check, as a failure there isn't something a person acts on.

**Phone size (31 Oct):** all 173 screens, 5,846 presses, no crashes, no failed reads. One save refused: a duplicate company name in the test data.

**Dead-looking buttons:** 177 checked against the old app, 2 real gaps, both fixed.

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
