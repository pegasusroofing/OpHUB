# Quotes: how it works (4 Nov 2026)

Quotes is the tender tracker that replaces your Tender Tracker spreadsheet. It's new in the new app; the old web app didn't have it.

- **Where:** in the side menu (laptop) or on the PM home tile (phone). PMs and admins only.
- **Look:** as of 4 Nov it's laid out like Finance:
  - tiles across the top;
  - outcome chips;
  - the Finance table on a laptop (click a heading to sort, use the box under it to filter, totals bar underneath);
  - compact rows on a phone;
  - the thin Excel / PDF bar at the bottom.

## The life of a quote
1. **+ New Enquiry.** Enter:
   - the customer (it searches the Directory; a new name is added to it);
   - contact, phone and email;
   - project, address, discipline;
   - who is pricing it (new: you can choose from the start);
   - when it came in and when it's due back;
   - any tender documents.

   Saving makes its **OneDrive folder** from your New Enquiry template and puts the documents in its Tender Documents folder.
2. **While pricing:** the outcome is **Pricing**, **Awaiting More Information** or **Ready For Checking** (Change Outcome). The documents are in the folder on the quote's page.
3. **Send & Submit**, the estimator's last step:
   - enter the value, profit % and the date sent;
   - either you've already sent it yourself, or you send it from the app with the files from its Quotation folder;
   - it becomes **Returned**;
   - its folder is filed into that year's Estimating folder;
   - the **chaser clock** starts.
4. **The chaser:**
   - **When:** if it's switched on for the company (Quote Settings), each Returned quote with a contact email is chased automatically. The first chase is after 30 days, then every 14 days, up to 3 times. These are set in Settings. It runs at 8am on weekdays.
   - **Chase Now:** sends one straight away.
   - **When it stops:** moving a quote to **Tender Stage** or closing it stops the chaser. Every chase is listed on the quote.
5. **The result:**
   - **Won: Convert To Job** makes the job (Upcoming) and its job folder, and moves the enquiry's documents into it.
   - **Lost / No Reply / Declined** closes it and files the folder.

## The figures
- **Live quotes:** count and value of everything not yet closed.
- **Returned, waiting:** shows how many chases are due today.
- **Won this year and win rate.** Win rate is won out of won + lost: quotes still live don't count against you.
- **View:** List, or By Customer, By Discipline, By Who Priced It, By Year, By Outcome. Each shows quotes, value, won, won value, not won and win rate. The export follows the view.

## To do before RTB uses it
These need an admin, in Quotes › Settings:
1. **OneDrive folders:**
   - where open enquiries go;
   - the New Enquiry template folder;
   - where finished ones are filed by year;
   - where a won job's documents go.

   None are set for RTB yet, so new enquiries won't get a folder until they are.
2. **The chaser:** check the wording, the timings and the subject, then switch it on. It's off until you do, so nothing is sent.
3. **Load your Tender Tracker** (Settings › Import). It reads the Tender Enquiry Log sheet. Running it again skips quotes already loaded. **Imported quotes never chase**, so loading years of old quotes can't email anyone.

## Questions
1. **Won without a new job:** sometimes the job may already exist, or you may not want a job made. Should there be a "Won, link to an existing job" option?
2. **Chasing tender-stage quotes:** they don't chase now. Do you want a reminder to *you* instead, e.g. "chase this one by phone"?
3. **Value at enquiry:** should you be able to enter a guide value when the enquiry first comes in? At the moment it's only asked at Send & Submit.
