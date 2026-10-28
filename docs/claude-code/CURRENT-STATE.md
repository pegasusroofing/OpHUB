# Current state (28 Oct 2026)

## Code
- **Laptop repo:** branch `main`. Fix round 3 (`2349a21`) is pushed and live on the website. The handoff pack commit (`65e6613`) adds docs only; Push origin sends it to GitHub.
- **Fix round 3** (in those commits):
  - Variation values reach Finance.
  - The old role comes back when Finance is switched off.
  - Unread badges count one-person messages.
  - Hidden MC tiles are blocked by direct link.
  - The Schedule of Works crash is fixed.
  - The Finance link is checked in Finance-only companies.
  - Reopening a PO restores its site requests.
  - Check-ins carry the device id.
  - OneDrive status.
  - RAMS numbers come from the database.
  - Inbox filing is one server step.
  - The app works with public **or** private buckets.
- **Recent features:**
  - Bill of Quantities tidy-up; purchase invoices with expandable lines.
  - Invoice-only jobs (no Applied/Retention); application dates auto-filled.
  - The send pop-up for invoices and applications.
  - Driver time off, with the delivery block.
  - The Price tile only when ticked in project admin.
  - Saved password on login.
  - Plain-English errors across Finance.
- **Phone apps:** they still carry an older app.html and need rebuilding (App Builder → Android Studio / Xcode) to get the recent changes.

## Database (Supabase `dtrfupmcazoioubhwdml`)
- **SQL files 1–3:** done (security batches and materials).
- **Applied 26–27 Oct (additive):**
  - `fin_fill_defaults`, `driver_time_off` + `delivery_driver_off_check`, `edge_email_log`;
  - bank holidays past 2028, the `hr_leave` approval guard, the device lock at check-in, the collection-received rule;
  - more manager-only field guards, locked signed briefings, `rams_take_numbers`, `fin_inbox_file`, `onedrive_status`, `variation_value_insert_guard`.
- **SQL file 4 (`sql/4 - OpHUB fixes (27 Oct).sql`): NOT run.** It makes 9 storage buckets private. Run it only after **all** of these, in this order:
  1. ~~Push origin~~ (done: the website has the private-file-ready app).
  2. Update 6 server functions to sign files instead of building public links: `client-sign`, `send-expenses-email`, `send-price-builder-email`, `send-site-induction-email`, `send-subcontractor-inspection-email`, and `send-document-email` (multi-file).
  3. Rebuild the phone apps, and make sure everyone has updated.
  4. Andy pastes SQL file 4 into Supabase › SQL Editor.

  If the native app is close, it's fine to wait and do this at switch-over instead.

## Server functions
- `send-finance-email` v5 (subject, text, extra attachments, signature with company number, VAT, email and logo).
- 30 send and notify functions hardened. Repo copies are in `supabase/functions/`.
- The `xero` and `finance-inbox` repo copies match live.
- When redeploying, keep each function's `verify_jwt` setting as it is live.

## Native app: Phase 0 (started 28 Oct 2026)
- **Built:** `app-native/` (Expo SDK 58, TypeScript strict). See `app-native/README.md`.
  - Sign-in with saved login, password reset, invite join.
  - Profile and company loading, and the device lock (checked again at every start).
  - An empty home for each role: phone tabs, or a left menu on a wide screen.
  - Shared services: offline cache, upload queue, signed links, push registration.
  - `eas.json` build profiles.
- **Tested in the laptop browser:** the sign-in page and its errors, the invite check, the reset page, and the redirect to sign-in when signed out. Signed-in screens still need a real login (Andy).
- **Still to do in Phase 0:**
  - Expo account and EAS login (Andy).
  - The first preview build for Andy's phone.
  - Firebase set-up for Android push: `google-services.json`, held as an EAS file secret, not committed.
  - Using the existing Play Store signing key (`App Builder/ophub-release-key.jks`) through `eas credentials`.
  - The full database types (`npx supabase login`, then `npm run gen:types`).
- **Found while porting:**
  - **iPhone push:** the server sends through Firebase (FCM v1). The current iOS app has no Firebase file, so iPhone pushes probably don't arrive today. The native app on iPhone will need Firebase iOS set up, or the push functions taught to use APNs/Expo.
  - **Device lock at switch-over:** the native app gets a new device id. Each operative's first sign-in on the new app will show up as a new device to approve.
  - **Web output:** the web build is a single-page app (`npm run build:web`). It isn't on Vercel yet.

## Native app: Phase 1 (operatives and drivers), in progress
- **Built:**
  - Operative home, My projects and the job page.
  - Check In / Out, including multi-address jobs.
  - Schedule of Works with the photo upload queue.
  - H&S: RAMS, COSHH, toolbox talks and daily briefings (read and sign), plus My signature.
  - Messages & tasks.
  - Snagging.
  - Driver app: check in/out with breaks, schedule, collections, completion photos, push and re-open, vehicle checklist and time off.
- **Rules:** 46 unit tests in `app-native/src/lib/rules` (`npm test`).
- **Still to do in Phase 1:** HAVS, PPE, holidays (HR leave), expenses, the job Messages page, variations (operative view), and the Getting Started checklist.
- **Known gaps carried to Phase 2:**
  - signed-TBT PDF email on auto-close;
  - all PDF exports and emails;
  - photo mark-up;
  - report traffic-light colours;
  - the office's driver check-in log.
- **Questions for Andy:**
  - RAMS/COSHH rows now have a "View document" link for operatives. The old operative row had none. Keep it?
  - The old "Monday vehicle check before check-in" gate was never switched on. Should it be?
- **Android test build:** `b979c2f7…` was queued on Expo's free plan when last checked.

## Andy's own to-dos
- Press **Push origin** for the handoff pack.
- Turn on leaked-password protection (Supabase › Authentication).
- Reconnect OneDrive, and revoke the old Microsoft sessions.
- Change the finance inbox mail forwarder to send the `x-inbox-key` header instead of the key in the link.
- Check that the API "max rows" setting is 1,000 or more.
- Rebuild the phone apps.

## Still open (carry into the native app, or fix in the old one if urgent)
- **Finance go-live switches:** the trial stubs, and POs for every PM order (proposals P01, P02; map links L28, L51, L52, L59, L73). Finance stays in **TRIAL** until Andy says otherwise.
- **18 "Missing" Projects↔Finance links:** see `context/finance-projects-map-v3.md` and `context/proposals.md`.
- **Messages to one person:** check the database lets people read messages sent only to them (PB-07).
- **Company filter in the database:** check-ins, incidents and drawings have no company column; the app filters them (CORE-L2).
- **Supplier order email:** check it never shows the PO number to operatives.
- **Push function:** check it sends the message's own id.
- **Labour review and repair jobs in Finance:** waiting for Andy.
- **Andy said no** to the Schedule of Works photo upload speed-up and to general speed work on the old app. The native app covers both.
