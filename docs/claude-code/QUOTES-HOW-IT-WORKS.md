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

## Added 4 Nov (from Andy's answers)
- **Several clients on one enquiry:** the same job priced for several main contractors is one quote.
  - **Clients Tendering** on the quote lists the main client and the others. Add more from the Directory, or as new clients.
  - **Winning:** Won asks *which client you won it from*. That client becomes the main one, and the job is made (or linked) for them.
  - **Reports:** **By Customer** counts the quote for every client: won for the winner, not won for the others. The Customer filter and search find a quote by any of its clients.
  - **Totals:** in By Customer, the value total counts a quote once per client.
  - **The chaser emails every client** on a returned quote (Andy, 4 Nov). Each gets their own email, with their own name and company. It covers the automatic chases and Chase Now, and one round counts once towards the chase limit. Tap another client on the quote to add the contact to chase there.
- **Won: Link To Existing Job:** for a job that's already in OpHUB. Pick the job, and the enquiry's folder moves into its Contract & Commercial › Estimating folder. The job's OneDrive folder is made first if it has none.
- **Link Estimating Folder (Finance):** a job made in Finance opens its Project Financials pop-up, which now has **Link Estimating Folder** at the top. It's also in Project Admin.
  - The OneDrive picker opens in your Estimating folder. Pick the enquiry's folder and it moves into the job's Contract & Commercial › Estimating folder.
  - If a quote uses that folder, the quote is marked won and linked.
  - Pressing the link closes the pop-up, so save anything you've typed first.
- **Guide mark-up %:**
  - each client in the Directory has an **Estimating mark-up %**;
  - a quote's guide mark-up fills in from the client when you pick them, and can be changed;
  - **Save For This Client** puts it back on the client.
- **Who is pricing it** can be chosen on a new enquiry.

## Still to decide
- **Chasing tender-stage quotes:** they don't chase. Do you want a reminder to *you* instead, e.g. "chase this one by phone"?
