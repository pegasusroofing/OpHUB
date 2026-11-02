# OpHUB Applications for Payment and certificates: audit, old app against new app

This was a code read only. Nothing was changed or run. Paths are relative to the repo root.

- **`[app].tsx`** = `app-native/src/app/(app)/fin/job/[id]/application/[app].tsx`
- **`finApp.ts`** = `app-native/src/data/finApp.ts`
- **`boq.tsx`** = `app-native/src/app/(app)/fin/job/[id]/boq.tsx`
- Old files are in `src/js/`.

## Serious: wrong money or wrong documents

**1. Bug: Raise invoice from the laptop applications list overcharges from Application 2 onwards, and issues straight away.**
- The list only loads some columns. It leaves out `cert_previous`, `cert_discount` and `client_po`.
- The invoice lines are built from that partial record, so "Less previously certified" and "Less discount" drop off, and so does the client PO.
- The invoice comes out as total certified to date less retention, gets a real number and is issued.
- New: `components/FinSales.tsx:44`, `:94`; `finApp.ts:119`; `lib/rules/finApp.ts:45-47`
- Old: `903-finance-certs-retention.js:95` re-reads the full row.

**2. Differs: the list button issues the invoice, where the old app makes a draft to check.**
- Old: `9219zf-finance-raise-invoice.js:29` replaces the older "raise and issue" with a draft that opens for checking.
- New: `FinSales.tsx:93-94` asks once, then issues.
- This makes item 1 worse, because there is no draft stage to catch the wrong figure.

**3. Bug: Export Excel and Download PDF from the ⋯ menu on the applications list give an empty document.**
- The list record has no lines, variations, day works, retention %, discount % or previous figure, and `exportApplication` uses that record as given.
- The result has no sections and zero totals.
- The Project Summary list is fine, because it passes full rows.
- New: `FinSales.tsx:44`, `:127`, `:139`; `components/FinRowMenu.tsx:55`; `finApp.ts:194-202`
- Old: `902-finance-applications.js:799-803` and `9219p-finance-app-export.js:393-395` re-read the row by id.

**4. Bug: a new draft downloaded before any edit shows Previously Certified as £0, so the amount due is overstated.**
- `newApplication` never stores `previous`, `gross` or `net_due`.
- `exportAs` only saves if something changed, then exports the stored `previous`.
- A saved draft can also carry an out-of-date figure if an earlier certificate has changed since.
- New: `finApp.ts:57-63`; `[app].tsx:123-125`; `lib/rules/finAppExcel.ts:36`
- Old: `902:800` and `9219p:394` always save first.

**5. Bug: a typed Net due can disagree with the invoice.**
- The Net due box can be overtyped and is saved as `cert_net`.
- The invoice is built from the four parts, not from that figure, so its total can differ from what was certified. The invoice note still quotes the typed figure.
- New: `[app].tsx:406`, `:477`, `:491`; `lib/rules/finApp.ts:43-49`; `finApp.ts:124`
- Old: on the certify screen the net is worked out and the box hidden (`9219p:533`, `:685`).

**6. Differs: the certificate is not built from the lines by default.**
- Old: every line has a Certified % box and the totals are read-only sums. Lines are always saved to `cert_lines` (`9219p:530-537`, `:685`; `9219n:879-883`).
- New: the totals are free-typed, and line-by-line sits behind a toggle. If it stays closed, no `cert_lines` are saved.
- The next application's "Previous" and "Prev Certified" then use the applied % instead of what the client certified.
- New: `[app].tsx:383`, `:416`, `:489-491`; `finAppExcel.ts:24`

**7. Differs: Certified % starts from a different place.**
- Old: starts from the previous certificate, or 0 on a first certificate, so the client's figure must be entered (`9219p:840-849`).
- New: starts from what you applied for, so an untouched line reads as certified in full.
- New: `[app].tsx:385-391`

**8. Bug: a BoQ save that partly fails still counts as saved, and Publish carries on.**
- `saved.current` is set before the failure check.
- Publish then opens an application from an incomplete Bill, and autosave does not try the failed lines again.
- New: `boq.tsx:153`, `:160`, `:176`, `:389`
- Old: `902:252-258` stops and keeps the lines dirty; `9219n` updates its snapshot only when nothing failed.

**9. Bug: pressing Publish again makes another application.**
- Nothing looks for an open draft. Each press creates the next number with the same percentages, and the rapid-tap guard (`components/ui.tsx:64-71`) only holds while the press is running.
- The two drafts can then both be applied. The second has to be paid attention to, because previously certified then includes the first.
- There is also no warning when a draft has just been started by someone else. The old app opens a draft under 15 minutes old on a number clash, and otherwise tells you the new number. The new app silently takes the next number.
- New: `boq.tsx:389`; `[app].tsx:53-57`; `finApp.ts:65-71`
- Old: there is no Publish button. The clash handling is at `902:484-498`.

**10. Bug: a duplicate invoice is possible.**
- The "already invoiced" check uses the copy on screen, not the database, so a second person or an old list can raise another.
- The result of linking the invoice to the application is ignored. If that link fails, the application still shows Raise invoice.
- New: `finApp.ts:113`, `:128`
- Old: `903:95-96` re-reads before raising. It also has no check on the link result, but its update helper appears to report failures. I did not read that helper.

## Important: rules that differ

**11. Differs: discount is locked once Applied.** Old lets you change it after Applied, until certified, and saves it straight away. New: `[app].tsx:316`. Old: `902:680-690`, `:704`; `9219p:651`.

**12. Differs: reopening a draft overwrites edits.**
- Each time a draft opens, the new app rebuilds its variations and day works from the registers and saves them. The old app only reads the registers when the application is first made.
- New approved items do appear, which is useful. But a value or description you changed on a register variation goes back without warning, even though the value box is editable.
- That save also moves `updated_at`, so unsent changes on the device can be dropped rather than restored.
- New: `finApp.ts:30-31`, `:82-90`; `[app].tsx:93`, `:281-284`
- Old: `902:460-471`

**13. Differs: after certifying, the Applied and Certified side-by-side summary has gone,** including VAT on the certified figure. New shows Applied figures, then a separate certificate card with no VAT. New: `[app].tsx:309-328`, `:355-358`. Old: `9219p:953-977`.

**14. Missing: warning that earlier certificates have changed since this application was sent.** New: nothing near `[app].tsx:340-345`. Old: `902:528-529`.

**15. Missing: the warning on the BoQ that "This project already has applications".** Old warns that changes only affect new applications. New has no such text anywhere in `app-native/src`. Old: `902:129`.

**16. Differs: Apply for retention has no confirmation.** Old says which draft will change and from what % to what %. New changes it after a two-option menu. New: `app/(app)/fin/job/[id]/index.tsx:232-239`; `finApp.ts:160-175`. Old: `9219zn:66-68`.

**17. Bug: saves can overtake each other.** There is no "save in progress" guard, so on poor signal an older save can land after a newer one. New: `[app].tsx:103-109`. Old: `9219ze:25`, `:29`.

**18. Bug: boxes can show the wrong figure.**
- Discount, retention, variation value and day work value boxes only take their value when first drawn. After an Excel upload, the box shows the old number while the sums use the new one.
- Restoring unsent changes from the device has the same problem on every % box, because the redraw counter is not bumped.
- New: `[app].tsx:93`, `:225`, `:284`, `:303`, `:316`, `:321`

**19. Bug: failures hidden.**
- Mark as Applied, Return to draft and Change the certificate figures do nothing and say nothing if the save fails (`[app].tsx:335`, `:343`, `:365`).
- Delete draft can say "Draft deleted" even if no row was removed, because it only checks for an error (`finApp.ts:100`).
- If the certificate copy fails to upload, the certificate saves without it and no message appears (`finApp.ts:105-106`).
- Picking a file that can't be fetched has no error handling (`[app].tsx:39`, `:431`).

**20. Bug, only if both apps are in use: certificates saved by the new app display badly in the old one.** New `cert_lines` have no `var_index`, `day_index`, `applied_pct` or `value`. The old screen would show certified variations and day works wrongly, and applied as 0%. New: `[app].tsx:490`. Old: `9219p:544`, `:958`, `:834`; `9219n:875`.

## Lesser differences

| Type | What | New | Old |
|---|---|---|---|
| Missing | Enter by quantity done, and the "qty done" box beside % | `[app].tsx:178` | `902:619-621`, `:642`, `:667-668` |
| Missing | Fold sections and Collapse all (a big help on a long Bill) | `[app].tsx:201-213` | `902:644`, `:647-648` |
| Missing | Status row: Draft, Applied, Certified, Invoiced with next-step tips | `[app].tsx:162` | `9219p:32-42` |
| Missing | Cert Previous and Cert Current per line | `[app].tsx:452-457` | `9219r:20-22`, `:62-64` |
| Missing | Client PO on screen; "Submitted on… to…"; "Valuation after discount"; "Certified in full" | `[app].tsx:162-163`, `:315-318`, `:359` | `902:536`, `:539`, `:705`; `903:50` |
| Missing | Email to client and Email again. Stated as off for the Finance trial, so this looks deliberate | `[app].tsx:344` | `902:848-891` |
| Differs | Day works from the register are read-only on a draft | `[app].tsx:300` | `902:571-573` editable |
| Differs | Older one-sheet Excel files are refused | `finAppExcel.ts:131` | `9219p:317` falls back to `902:807` |
| Differs | Due and final dates default to 30 and 14 days if no setting exists | `finApp.ts:55`, `:58` | `902:456-457` has no such default |
| Differs | Reading a client PDF won't work on a phone, going by the app's own message; you enter by hand | `[app].tsx:433` | `9219p:868` |
| Bug | Manual Save redraws the whole screen: back to the top, and Enter £ / Hide 0% reset | `[app].tsx:61`, `:118`, `:154` | `902:506` keeps its state |
| Bug | Schedule of Works tasks are read without paging, so a very large job could be cut short (depends on the server's row limit) | `finApp.ts:272`, `:283` | `9219w:16`; `918:188` |

## Phone layout

| What | Where |
|---|---|
| **Variations row is the worst.** Fixed boxes of 90, 56 and 90 plus gaps use about 260px, leaving very little for the description at 375px wide, and less with a Site tag. Old stacks these rows. | `[app].tsx:280-294`; old `902:559-566` |
| Day works row: fixed 100 + 90 | `[app].tsx:301-304` |
| BoQ line row: £ box 100 + total 96, so wordy descriptions get a narrow, tall column | `[app].tsx:226-227` |
| Line-by-line day work: 90 + £ + 90 | `[app].tsx:469-470` |
| Small tap targets: "Use" is inline text about 12px; "Set all to 100%" is plain text; boxes have only 7px padding | `[app].tsx:45`, `:210`, `:220`, `:292` |
| Section header: the "£x of £y" total does not shrink, so long titles get squeezed | `[app].tsx:206-208` |
| The Add a line and Add a section buttons sit in a row that does not wrap | `[app].tsx:232` |

## Bill of Quantities writing `billing_type='application'`

**Does the old app do it too?** Yes, both the Save button and autosave: `902:245` and `9219n:524`. The new `boq.tsx:155` matches, and it also runs on the quiet autosave about 2.5 seconds after any edit.

**Is it a risk for an invoice-billed job?** Yes, but a moderate one, because it is hard to reach.
- It skips the "Change to applications?" confirmation (`918:42-46`) and gives no message.
- The job would then get the Bill tab, the Applied and Retention tiles, and different forecast rules (`lib/rules/finBook.ts:175-182`).
- Unless the contract value source is `manual`, the value is overwritten by the Bill total (`boq.tsx:156`).

**How it can be reached.** The new app hides the Bill tab on invoice jobs (`index.tsx:89`). The route is still open by direct link, and there is a link at `index.tsx:204`.

**Safest fix when you want it:** only set it when `billing_type` is blank.

## Same in both, but worth knowing

- **Retention after a release:** the next application goes back to the job's full retention % after a half release, so unless changed it would hold the released money again (`finApp.ts:62`; `902:472`).
- **Deleting a release application:** this leaves `ret1_app_id` or `ret2_app_id` set, so the job can still show "(claimed)" and retention alerts stay off (`finApp.ts:258-262`; `FinSales.tsx:210`, `:216`; `lib/rules/finance.ts:102`; `9219zn:22`). `voidFinApplication` is only ever wrapped, never defined (`9219zn:103`), so neither app has a void for applications. Both only delete.
- **Lines removed from the Bill:** they drop off the next application, so their value leaves the cumulative total. Lines added start at 0%. Existing applications keep their lines (`finApp.ts:59`; `902:466-468`).
- **Blank variation rows:** they can't be removed on screen in either app.

## Checked and matching

- **Numbering:** highest number + 1, voids included, and percentages carried from the last non-void application.
- **Sums:** line, discount-before-retention, retention limit and previously certified, including the rounding (`finApp.ts:15-28` against `902:32-49`).
- **Set all to 100% / 0%:** the same.
- **£ entry:** the same, including rounding to 2dp on the %.
- **Retention halves and carry-over.**
- **VAT and reverse charge wording:** reverse charge VAT is shown on the invoice only, and the figures on the application are the same.
- **Certificate-to-invoice line order.**
- **Pay-less notice:** a tick box with a label; no separate calculation in either app.
- **Excel layout, hidden keys and upload rules; PDF layout.** The Certified column for variations copies the applied % in both apps.
- **Delete rules:** not with an invoice, and latest first.
- **Site progress suggestions.**
- **Calendar dates:** the same `site_application_dates` lookup and labels.
- **CIS:** neither application flow has any.

## What I could not check

- **Live behaviour:** nothing was run, tested on a phone or checked on screen, so phone widths are worked out from the code.
- **Database rules:** I did not query the live database, and the repo has no `.sql` file mentioning `invoice_id`. I can't say what the triggers and permissions do. In particular, nothing in `src/js` or `app-native/src` clears `invoice_id` when an invoice is voided, yet both apps tell you to void the invoice first. If no trigger clears it, the application stays Invoiced and can't be deleted or re-invoiced.
- **Old wrappers not fully read:** `9219t` (around the Send menu), `9219zy` (send popup), `9219zo` (Schedule of Works proof), `9219zzb`, and most of `9219n`, including its add-a-line code. A later wrapper could change an old-app reference above.
- **Other:**
  - I did not trace the role check on the new calendar's caller.
  - I did not read `readXlsx` / `makeXlsx`, so Excel files re-saved by a client are untested.
  - I did not verify double-tap navigation on real devices.

## Fixed on 2 Nov 2026
Items 1, 2, 3, 4, 8 and 10 (the re-read and the failed link). Click test: tools/test-harness/jobtest-parts/appdive2.js.

## Click-through on Sandbox, 2 Nov 2026
- A new draft holds £0 in the database until first saved, so the applications list shows £0 for it (same cause as item 4).
- The sums on Application 4 were right: 11,200 gross, less 300 retention (3% limit), less 6,900 previous, 4,000 due.
- At phone size the variations row runs to the edge of the screen.
