# What Andy has tested himself

Andy's own hands-on review of the new app. This is separate from the automatic tests in `TEST-COVERAGE-2026-10-31.md`.
"Reviewed" means he has been through it, not that it has no faults.

## Projects: reviewed
- Schedule of Works (noted 31 Oct 2026)
- Drawings (noted 31 Oct 2026)
- To Do list (noted 31 Oct 2026)
- Messages (noted 31 Oct 2026)
- Calendar (noted 31 Oct 2026, from his list of faults)

## Projects: still to review
- Sites / projects, team and assignments
- Check-in and check-out with GPS
- RAMS
- COSHH
- Toolbox talks
- Daily briefings
- Permits
- PPE
- HAVS
- PUWER
- Incidents
- Inductions
- Snags
- Variations
- Materials and material orders to suppliers
- Yard stock
- Deliveries and the driver app
- Reports and surveys
- Price tile and price builder
- Repair contracts
- Handover O&M
- HR (holidays and policies)
- Plant
- Expenses
- OneDrive sync

## Finance: reviewed (2–3 Nov 2026, laptop then phone)
- Jobs grid and the project overview (forecast, OHP)
- Bill of Quantities, plots
- Applications for payment and certificates (overview, line by line, certify, import, email)
- Retention release through an application
- Sales invoices (draft, lock, issue, email / export)
- Settings: email templates

## Finance: still to review
- Variations and Day works tabs (now fed from applications)
- Purchases (POs, purchase invoices, quotes, plant)
- Subcontractors and CIS
- Operative invoices
- Reports and budgets
- Directory (clients, suppliers, labour)
- Xero
- Finance inbox
- Statements
- Yard stock

## Faults and changes Andy has raised (31 Oct 2026, phone view)
Items 1 to 38 and 40 were done on the night of 31 Oct and checked at phone size, with these limits: 3 and 40 need a check on a real iPhone over https. 13: now 1.7 seconds on the test server. 14: the AI reader for PDF imports isn't built; it reads text only, as before. 9 and 17: development-only messages, hidden and the press works. 20: Change stays for PMs and admins. 39 is for 1 Nov.

### Login and projects list
1. The OpHUB title on the login page is black.
2. The bottom taskbar in Projects is different from the old app.
3. The bottom taskbar gets lost behind the iPhone address bar.
4. Put the Live / Upcoming / All filters under one drop-down.
5. Move New Project onto the taskbar.

### Job header and whole-app behaviour
6. Pressing the bold top row of the header should go to the project's home page.
7. The address under it should be click to copy, as in the old app.
8. Fix the screen width on phone view.
9. "Cannot find active single touch" appears at random.
10. The blue trail (Projects, site name, folder) must stay fixed in place. It is cut off slightly, so make it a bit deeper.
11. That trail doesn't update: in Messages it says Drawings.
12. Back button, as in the old app: inside an area it goes up a folder. After a tile or link into a different part of the app (Projects into Finance, say) it returns to the page you came from, then goes up folders from there. Projects into Drawings, then back, goes up a folder.

### Schedule of Works
13. The page takes a couple of seconds to load.
14. Cut the Add drop-down to three: Add Section (then choose new or from library), Import schedule from Excel, CSV or PDF, and Add Variation. Check whether the PDF import should use the AI reader.
15. Add a Section zooms the screen in, and its text row sits in the pop-up's header row.
16. The add task button in a new section should have the same border as the add task above it.
17. Error when changing a task's progress: "ScrollView doesn't take rejection well - scrolls anyway", memoize-one.esm.js (43:16).
18. Uploading photos takes too long, doesn't clearly show it's uploading, and got stuck on "uploading".
19. Remove the black Save to OneDrive bar. Rename Export PDF to Export, which then offers PDF or OneDrive.
20. Site condition: change "Save - close out" to Submit, with a pop-up: only able to submit once, are you sure? Yes / No.

### Drawings
21. Folder tiles (Programs, Spec, Drawings): the text is crammed. Make all tiles a little bigger and symmetrical.
22. In a folder's Add menu, make upload a file the top option.
23. Put a file's edit and delete buttons in a drop-down.
24. When viewing a file, replace the arrow (open as PDF) with an Export button to share as an attachment by WhatsApp, email or OneDrive.
25. Allow any file type to be uploaded. It is stuck on PDF, PNG and JPEG.

### Messages
26. Change this to a HUB tile.
27. Allow @ mentions of people in the text.
28. Allow replies that turn into a thread.
29. Replace the separate send-to-site and send-company-wide options with a choice after pressing Send: project operatives or all company operatives.
30. Make the filter a drop-down, not the expanded options.

### Calendar
31. Make the back and forward month buttons 1.2 times bigger.
32. Make the month view and option buttons smaller.
33. Items added to the calendar don't show.
34. Make the Add button in the date row 1.25 times bigger and level with the text in that row.
35. Line up the day and the date down the left-hand side.
36. Replace the Private button with Visibility: a drop-down choosing who can see it by role, then a sub-filter to exclude certain managers or operatives.

### To Do list
37. Make it look better.
38. Change the export to the thin style from Finance that sits at the bottom of the page.

### Sharing
40. Copy the old app's share button to the new app's website version (`shareFile` in 060, `sharePdfViewerDoc` in 030): hand the file to the phone's share menu, so WhatsApp and the like appear. It currently only downloads. Needs an https address, so it can't work on the laptop test link. To do tonight, with item 24. Andy says the old empty-file fault on his iPhone went away when the OneDrive cloud button was added, reason unknown. So copy the old viewer's order of steps exactly, including how it gets the file ready before the button is pressed, and don't assume the fault still exists.

### Raised 1 Nov 2026
41. To Do: option A with the counts header from option C. Done.
42. Schedule of Works report had no photos: the export followed the tab showing, so the To Do tab left out finished work. Now always every task. Date tag and line between days confirmed.
43. Material requested email as a table. Built and live; see 46.
44. Variation email to carry the photos, and mark up photos on upload. Mark-up done; email see 46.
45. Permit email to carry the permit as an attachment. New permit PDF built; email see 46.
46. Any email with a link to a file should attach it. Audit: subcontractor inspection and site induction emails were links; the rest attach, some falling back to a link only when too big. The live functions were updated on 1 Nov with Andy's go-ahead (send-message-push v13, inspection v8, induction v9), but none has sent a real email yet.
47. Documents tile for PMs and admins showing the job's OneDrive folder. Done. Nothing is copied into the app, so tiles aren't duplicated. Site managers don't get it, as the OneDrive functions are PM and admin only.

### Quote tracker (built 1 Nov; for Andy to load)
48. Replaces `Estimating/Open Tenders/Tender Tracker.xlsm`. Home › Quotes. Client from the Directory, filters and views by customer, discipline, who priced it, year and outcome; Excel and PDF exports; folder from the New Enquiry template; filed by year when finished; Won makes the job and moves the folder into its pack; chaser per quote, off at Tender stage, company switch off by default. Settings need the real paths before folders work for RTB. Day to day there is no Excel. The old tracker comes in once, from Quote settings. Real tracker not loaded yet: dry run read 500-odd quotes.

49. The estimator's flow (Andy, 1 Nov): New Enquiry with documents makes the OneDrive folder; he works in OneDrive; Send & submit records how it went, value and date, and files the folder to Estimating {year}. Won moves it on to the job. Sending from the app and filing were tested on Sandbox; "I've emailed it" wasn't pressed. List is compact, table on a laptop, with Filter (multi-select), Sort and View drop-downs.

50. Purchase invoices (Andy, 1 Nov): emailed or uploaded, AI reads each line with project, VAT and summary, checks prices against the most recent of project quote or yearly price list, allocates to the job; unclear ones go to an unassigned tab for admin or PMs; split by %, amend line by line. Checked 1 Nov: AI reader not configured (no API key) and the new app never calls it; no line-by-line project reading; no check against quotes or price lists; no real email has ever arrived. Unallocated list, split by % and manual line coding exist. Not built yet. Built 1 Nov and tested on Sandbox with a stand-in for the AI's answer: filing by itself, a job per line, split by value, Unallocated with the reason, amending a line, price check against the newest quote or list. Real AI reading and a real email are not proven: they need the Anthropic key and an invoices mailbox. Allocating needs Finance access, so PMs need a decision.

### New job pack (built 1 Nov; on for Sandbox only)
Rules are edited in the app, Admin Centre › OneDrive › New job pack (Andy, 1 Nov: no working off Excel). The editor was checked against the fake data; saving on the real database needs an admin login. The Excel in this folder was the first draft and nothing reads it now.
39. Setting up a new job makes its OneDrive folder from `RTB Roofing Ltd/Live Projects/- New Job Pack - Template`, and links areas of the app to the right sub-folders. Needs a new server function and more folder links on each job. Not to run for RTB without Andy's say-so while Finance is in trial.
   - **Andy, 31 Oct 2026:** loves it, to be done on 1 Nov, not before. Work out how to do it without OneDrive holding documents the app doesn't use. OneDrive currently has loads of files that aren't relevant.
   - **What he wants synced:** only issued toolbox talks go to OneDrive. RAMS sync. Schedule of Works syncs into weekly folders.
   - **What stays in the app:** data sheets. They get selected as part of the O&Ms.

51. Andy's list of 1 Nov, built and tested on Sandbox unless noted: Finance Controller login (Finance only; locked out in the new app, not in the old web app); wages and labour booked to a price from Finance or the Price tile (off for RTB during trial; a price with a sheet shares the wage over its lines, so that week's booked-in updates straight away and replaces quantities typed for that week, £ overrides stay); Dashboard with company and operative parts; back button; one gap across the main screens (list rows stay tighter); full-word tabs kept on Collections, Suppliers tab gone; bottom bar as the old app; bold header line goes to its home, small line copies with a small Copied; no Finance or HUB tile; client page with Edit and Finance lock. Rules tested, not seen on a real 2-drop job: one delivery per driver per drop. Not sent yet: rain delay email. Not click-tested: PM change from Finance, Send to a PM.
52. Finance-Projects sheet checked link by link in the new app, 1 Nov: docs/claude-code/context/finance-projects-map-new-app-1Nov.md. All three built on 8 Nov 2026: yard cost edit (L46), bring staff in from Xero (L70; held back for RTB during the trial, as in the current app), Getting Started card (L84).

## To discuss with Andy
- Sort out plots: how multi-site (multi-plot) jobs should work (Andy, 2 Nov 2026; asked again 5 Nov 2026: "we need to discuss and sort plots out"). Bring this up before Finance is signed off. Plots show today on BoQ lines and as a column on PO lines (only when the project has plots).
