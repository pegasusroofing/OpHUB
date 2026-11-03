# Xero posting: what happens now, and the plan (to discuss 4 Nov 2026)

## How it works today
- **Sales invoices** go to Xero when they're **issued**.
- **Purchase invoices (bills)** go when they're **approved**.
- **Subcontractor payments** only go when someone presses **Post to Xero** on them. There's nothing automatic yet.
- **Conditions:** the automatic ones only happen when Xero is connected, "send automatically" is on in Finance Settings, and the record isn't set to stay out of Xero or already in it.
- **Manual posting:** every record page has a **Post to Xero** button for anything that didn't go automatically.
- **Voids:** voiding an issued invoice that's in Xero voids it there too. Editing lines after posting doesn't re-post; the app warns about that.
- **During the Finance trial** nothing goes to Xero for RTB. Sandbox is exempt.
- **Problems:** if Xero refuses something, the reason is saved on that record (`xero_error`) and shown only on its own page as "Last try: …".
  - There's no list of failures, no record of each attempt, no retry and no alert.
  - A failure is easy to miss unless you open the record.

## Plan (all additive; nothing the current app uses is changed)
1. **Agree the rules tomorrow.** When each kind posts (issue / approve), whether credit notes and retention invoices post, and who can post by hand.
2. **A log of every attempt.**
   - A new table `fin_xero_log`: company, kind (invoice, bill, sub payment), record, action, posted or failed, Xero's reason, who, when.
   - The `xero` server function writes one row each time it tries.
3. **Xero status on every row.** A small pill on the Sales, Purchases and Subcontractor lists: Posted ✓, Waiting, Failed ⚠ (tap for the reason), Not Posting (trial or opted out).
4. **Xero Problems list.**
   - Shows everything that failed or should have posted but hasn't, with the reason.
   - Each item has **Retry**, plus **Retry All**.
   - A tile on Finance › Overview shows the count when there are any.
   - It works like the material orders' sent / not sent.
5. **Retry and alert.** A nightly run retries failed posts once. Anything still failing is emailed to Andy (andy.cramp@rtbroofinglimited.com) only, as a daily summary.
6. **Before trial comes off.**
   - The invoice push uses each line's own sales code (`AccountCode: l.account || s.xero_sales_account || '200'`). The `xero` function is then redeployed with verify_jwt off, as now.
   - Then do a full run on Sandbox against Xero's demo company: issue, approve, void, a forced failure, and a retry.

## Questions for Andy
- Should bills post on approve, or only once marked paid?
- Do credit notes and retention invoices post automatically?
- Who sees the Xero Problems list: admins only, or Finance users too?
- Is the nightly retry and email OK, and at what time?
