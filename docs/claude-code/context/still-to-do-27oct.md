# Still to do (27 Oct 2026, before fix round 3)

Exported from "OpHUB Review v3 - 27 Oct 2026.xlsx", sheet "Still to do".

| Priority | What | Why it matters | Who | Refs | Status |
|---|---|---|---|---|---|
| 1 — now | Turn on leaked-password protection | Stops people using passwords that are known to have leaked. Supabase › Authentication › Attack Protection (or Passwords). | You (Andy) | SEC-L10 | Your task |
| 1 — now | Reconnect OneDrive, and revoke the old Microsoft sessions | The old tokens could have been read before 25 Oct. Admin Centre › Integrations: disconnect and reconnect. Then Microsoft Entra › the OneDrive user › Revoke sessions. | You (Andy) | SEC-C1, SEC-N1 | Your task |
| 1 — now | Press Push origin for the 26–27 Oct changes (if not done) | Send pop-up, invoice jobs, purchase invoices table, driver time off and the polish are on the laptop; they go live when pushed. | You (Andy) | Changes since v2 | Your task |
| 2 — soon | Make the storage buckets private and use signed links | Files are now limited to your company inside the app, but anyone with a file's exact web link can still open it. | Claude (database — needs your go-ahead) | SEC-H3 | Partly fixed |
| 2 — soon | Copy the live Xero and finance-inbox functions into the code | The live versions are newer than the copies in the code. A redeploy from the code would undo the contra line and the inbox checks. | Claude (server function) | SEC-N3 | Partly fixed |
| 2 — soon | Check a driver can mark a collection as received | If the database doesn't let a driver's login write the "received" mark, it fails quietly. Safer: do it on the server when the delivery task is completed. | Claude (database — needs your go-ahead) | Map L41; materials-done item 4 | Needs check |
| 2 — soon | Give site variations a value (they reach Finance at £0) | The only Broken money link that reaches the client: site variations arrive in the register and on applications at £0. | Claude (app) | Map L22; P06 | Open |
| 2 — soon | Holiday approvals checked by the database | Approvals and the limits are only checked in the app, so someone could approve their own holiday through the API. | Claude (database — needs your go-ahead) | CORE-M7 | Open |
| 2 — soon | Device lock checked by the server at check-in | The app checks the device, but the server accepts a check-in from any device. | Claude (database — needs your go-ahead) | CORE-M3 | Partly fixed |
| 2 — soon | Finance switch-off restores the old role on every device | The old role is only remembered on the device that gave Finance. The database column now exists; the app needs to use it. | Claude (app) | FA-15 | Partly fixed |
| 2 — soon | Go-live switches: trial stubs and POs for every PM order | Needed before Finance leaves the trial: fixes Broken links L51, L52, L59 and the PM "To book" badge; PMs without Finance don't raise POs yet. | Claude (app) | P01, P02; Map L28, L51, L52, L59, L73 | Open |
| 3 — later | Confirm the server's row limit is 1,000 or more | The new paging assumes it. One quick look in Supabase settings. | Claude (database — needs your go-ahead) | FA-05, CORE-M5 | Needs check |
| 3 — later | Unread badges count one-person messages | They now show in the Inbox, but the home and HUB badges don't count them. | Claude (app) | PB-07 | Open |
| 3 — later | Check the database lets people read messages sent to them alone | If not, those messages just don't show (no error). | Claude (database — needs your go-ahead) | PB-07 | Needs check |
| 3 — later | Hidden MC tiles can be opened by a direct link | Hiding a tile only hides the button. | Claude (app) | PA-38 | Partly fixed |
| 3 — later | Schedule of Works page crash on a cut-off link | A rare crash, not a security hole. | Claude (app) | CORE-L11 (480:854) | Partly fixed |
| 3 — later | OneDrive "Connected" shows whenever a record exists | It can say Connected when the connection has actually broken. | Claude (database — needs your go-ahead) | CP-NEW-1 | Open |
| 3 — later | Job check on the Finance link in Finance-only companies | Small gap left from CORE-C1. | Claude (app) | CORE-C1 (908 finOnlyRoute) | Open |
| 3 — later | Manager-only fields on snags, schedule and site layout | H6 covered variations, permits, RAMS, COSHH and materials. These lower-risk tables still use the general job rule. | Claude (database — needs your go-ahead) | SEC-H6 | Open |
| 3 — later | Supplier order email copied to operatives may show the PO number | Operatives should never see POs. Fix in the order email function. | Claude (server function) | materials-done (left over) | Needs check |
| 3 — later | Reopening a cancelled PO leaves its site requests cancelled | Rare; they stay cancelled with a note. | Claude (app) | materials-done (left over) | Open |
| 3 — later | Push notification sends the wrong id name | The app copes; the push function should send the message's own id. | Claude (server function) | materials-done (left over) | Open |
| 3 — later | Lock signed briefings in the database | The app opens them read-only; the database doesn't stop an edit. | Claude (database — needs your go-ahead) | PA-02 | Open |
| 3 — later | RAMS numbers reserved by the database | The app's guarded update works; one database step would be stronger. | Claude (database — needs your go-ahead) | PA-19 | Open |
| 3 — later | File inbox invoices in one server step | The short-term fix works; one step can't be half-done. | Claude (database — needs your go-ahead) | FX-P1 | Open |
| 3 — later | Check-ins, incidents and drawings filtered by company in the database | The app filters them; the tables have no company column. | Claude (database — needs your go-ahead) | CORE-L2 | Open |
| 3 — later | Check the server bank-holiday list goes past 2028 | The app now works any year out; the server's auto-booking may not. | Claude (database — needs your go-ahead) | CORE-L5 | Needs check |
| 3 — later | Review the other send/notify functions | 11 were hardened on 25 Oct; about 20 more were never read. | Claude (server function) | SEC-I2 | Needs check |
| 3 — later | Inbox mail forwarder: use the key header, then stop accepting the old link | The key in the link can end up in logs. | Claude (server function) | SEC-L5 | Open |
| 3 — later | The other Missing links between Projects and Finance | 18 links are still Missing (see Finance-Projects Map v3 and Proposals). | Claude (app) | Map v3; P01–P32 | Open |
| 4 — waiting for you | Labour (Projects ↔ Finance): full review | You said: review once everything else is complete, as it is complex. | You (Andy) | Map L48–L56, L62; P01, P09–P12 | Later |
| 4 — waiting for you | Repair jobs in Finance | When you ask. | You (Andy) | Map L13–L15; P25 | Later |
