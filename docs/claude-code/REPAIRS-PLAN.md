# Repair contracts rebuild: the plan (Andy, 7 Nov 2026)

Pictures: `docs/claude-code/mockups/repair-*.png` (drawn from `repairs.html`). Nothing is built yet.
Research behind it (Joblogic, BigChange, Simpro): about five or six steps, moved on by what people do, invoice
raised from the job (one per job or a monthly batch). Ours had 9 stages and no link to Finance.

## How it works
1. **Set up the contract:** New Project › Project Type: Repair Contract (Projects or Finance).
2. **New job from the works order:** upload the PDF (or several at once). Job number, address, call-out,
   tenant name / number and priority are read in. It lands in **To Book**. Projects and Finance both have + New Job.
3. **Booked In** (booking date; on the calendar and the operative's app) → **Attended** (the operative's visit).
4. **Fixed first time** → Works Done. **Or a quote:** price it and send it (**Quote**), the client approves
   (**Approved**), book the works in, attend.
5. **Works Done:** completion photos and signature; the PM checks it (ready to invoice).
6. **Invoiced → Paid** (Finance only): raise from the job, or **Invoice Done Jobs** for the month (one invoice for
   several). The job ticks Invoiced by itself, then Paid when the money's in.

**Progress bar** (like purchase invoices): To Book · Booked In · Attended · Quote · Approved · Works Done, then
Invoiced · Paid in Finance. Fixed first time: Quote and Approved show "Not Needed".
**Flags, not stages:** On Hold (with a reason) and Other Trades (e.g. scaffold, with dates). Each has a tile.

## Screens
- **Projects home (Andy, 7 Nov):** just four tiles — **Works Orders**, **Health & Safety**, **Calendar**, **To Do List**.
- **Works Orders, operative:** the jobs booked to them, soonest booking date at the top, with **Show All**. If
  nobody has been booked on any jobs yet, everyone sees them all.
- **Works Orders, managers:** stage boxes (To Book, Booked In, Quote Needed, Awaiting Approval,
  Approved — To Book, On Hold / Other Trades), + New Job (Read Works Order), All Jobs, the list.
- **Opening a job (operative):** check in by GPS as now, against the job's own address. Then their steps:
  1. Description Of Fault · 2. Description Of Repair · 3. Photos (→ Survey Photos) ·
  4. Completed In This Visit? **Yes** → 5. Completion Photos (→ Completion Photos) and Description Of Works
  Completed. **No — Needs A Quote** → the attendance report goes to the office to price (and to OneDrive) ·
  6. Check Out (GPS).
- **Job hub** (one per job): progress bar and what's next; the works order with a PDF viewer; address, call-out,
  tenant name, phone and tenant no.; booked / attended / completed dates; notes (the client can see these).
  Finance sees a Money box (quoted, costs, margin); Projects sees the same page without it.
- **Repair page:** each stage of the works, opened up to update it (Book The Works, Put On Hold, photos…).
- **Finance:** like plots — costs go to the contract, then the job (or split across jobs; blank = the contract as
  a whole). Each job shows its stage, quoted and costs; Invoice Done Jobs.

## Attendance report and OneDrive (Andy, 7 Nov 2026)
- **Attendance creates a PDF report of the works required** (what was found, works needed, photos), which can be
  exported, with the photos also saved separately.
- **Everything goes to OneDrive by itself**, into a subfolder for each job (named by the job / works order number):
  - `Survey Photos/` (folder) — the photos from attending;
  - `Completion Photos/` (folder) — the photos when the works are done;
  - the **works order PDF** (in the job folder, not in a subfolder);
  - the **attendance report PDF** (in the job folder), and the completion report when the job is done.
- Already in the app (the current repair screens) and kept: each job's own OneDrive folder (or a job-number
  subfolder of the contract's folder), photos sent one at a time and retried, the work order, and survey and
  completion report PDFs rebuilt when they change. To change: the survey report becomes the **Attendance Report**
  (works required); photos go into just the two folders (access, scaffold and progress photos to fold into these);
  the job folder holds only the two folders plus the PDFs.

## Moving the 109 jobs already in OpHUB (nothing lost)
To Survey → To Book (Booked In if it has a booking date) · Surveyed - Awaiting Cost → Quote Needed ·
Surveyed - Variation Issued → Awaiting Approval · Approved - Awaiting Scaffold → Approved + Other Trades ·
Approved - To Do → Approved · In Progress → Booked In · Awaiting Sign-off → Works Done · Closed → Works Done /
Invoiced (from the Invoiced tick) · Rejected → Rejected. The old status stays where it is; new fields only.

## Database (additions only)
Tenant name, phone and number; attendance date; on hold + reason; other trades + dates; the new stage; the
invoice a job went on.
