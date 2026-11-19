import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
// Copies of the app's own report code (app-native/src/lib/rules), so an auto export matches Export in the app.
import { autoDue, quoteReport, reportLabel, type AutoExport } from './quoteReports.ts';
import { makeXlsx, reportSheet, type XCell } from './xlsx.ts';

// HR folder lock: an exact copy of app-native/src/lib/rules/hrLock.ts (review 15 Nov 2026, section 3 #5).
// ---- HR folder lock ----
export type HrLock = { id: string; driveId: string | null; path: string | null };
type HrRef = { driveId?: string; path?: string } | undefined;
type HrItem = { id?: string; name?: string; parentReference?: HrRef; remoteItem?: { id?: string; name?: string; parentReference?: HrRef } } | null | undefined;
type HrDb = { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } } } };
/** A Graph parentReference.path ("/drives/x/root:/A/B") as "/a/b" ("" for the top of the drive); null if it isn't one. */
export function hrNorm(p: unknown): string | null {
  const s = String(p ?? '');
  const i = s.indexOf('root:');
  if (i < 0) return null;
  let r = s.slice(i + 5);
  try { r = decodeURIComponent(r); } catch { /* keep it as it is */ }
  return r.replace(/\/+$/, '').toLowerCase();
}
/** A folder path relative to the top of a drive ("A/B/") the way hrNorm gives them ("/a/b"). */
export function hrRel(p: string): string {
  const parts = String(p ?? '').split('/').filter(Boolean);
  return parts.length ? ('/' + parts.join('/')).toLowerCase() : '';
}
/** Is this folder (its drive and path, as hrNorm gives it) the HR folder or inside it? */
export function hrPathInside(lock: HrLock | null, driveId: string | null | undefined, path: string | null): boolean {
  if (!lock || lock.path === null || path === null) return false;
  if (lock.driveId && driveId && driveId !== lock.driveId) return false;
  return lock.path === '' || path === lock.path || path.startsWith(lock.path + '/');
}
/** Is this Graph item the HR folder or inside it? */
export function hrInside(lock: HrLock | null, it: HrItem): boolean {
  if (!lock || !it) return false;
  if (it.id === lock.id || it.remoteItem?.id === lock.id) return true;
  const src = it.remoteItem?.parentReference ? it.remoteItem : it;
  const pp = hrNorm(src.parentReference?.path);
  return pp !== null && hrPathInside(lock, src.parentReference?.driveId, `${pp}/${String(src.name ?? it.name ?? '').toLowerCase()}`);
}
/** Would moving or copying this item carry the HR folder along (it is the HR folder, inside it, or holds it)? */
export function hrHolds(lock: HrLock | null, it: HrItem): boolean {
  if (!lock || !it) return false;
  if (hrInside(lock, it)) return true;
  if (lock.path === null) return false;
  const src = it.remoteItem?.parentReference ? it.remoteItem : it;
  const pp = hrNorm(src.parentReference?.path);
  if (pp === null) return false;
  const d = src.parentReference?.driveId;
  if (lock.driveId && d && d !== lock.driveId) return false;
  return lock.path.startsWith(`${pp}/${String(src.name ?? it.name ?? '').toLowerCase()}/`);
}
/** One folder's contents from Graph: is that folder the HR folder or inside it? */
export function hrListingInside(lock: HrLock | null, parentId: string | null | undefined, children: HrItem[]): boolean {
  if (!lock) return false;
  if (parentId && parentId === lock.id) return true;
  return children.some((c) => hrPathInside(lock, c?.parentReference?.driveId, hrNorm(c?.parentReference?.path)));
}
/** The company's HR folder lock for this caller: null when there's no HR folder or HR Access lets them in. */
export async function hrLockFor(db: HrDb, orgId: string, msToken: string, supabaseUrl: string, anonKey: string, userToken: string): Promise<HrLock | null> {
  const { data } = await db.from('hr_secure_settings').select('onedrive').eq('org_id', orgId).maybeSingle();
  const od = (data as { onedrive?: { id?: string; driveId?: string | null } | null } | null)?.onedrive;
  if (!od?.id) return null;
  // Asked as the caller, so it's the database's own rule.
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/hr_is_team`, { method: 'POST', headers: { Authorization: `Bearer ${userToken}`, apikey: anonKey, 'Content-Type': 'application/json' }, body: '{}' });
    if (r.ok && (await r.json().catch(() => false)) === true) return null;
  } catch { /* not let in */ }
  const lock: HrLock = { id: od.id, driveId: od.driveId || null, path: null };
  const g = 'https://graph.microsoft.com/v1.0';
  const u = od.driveId ? `${g}/drives/${encodeURIComponent(od.driveId)}/items/${encodeURIComponent(od.id)}` : `${g}/me/drive/items/${encodeURIComponent(od.id)}`;
  let r: Response;
  try { r = await fetch(`${u}?$select=id,name,parentReference,root`, { headers: { Authorization: `Bearer ${msToken}` } }); } catch { throw new HrLockUnknown(); }
  // Gone (404), or the company sign-in isn't allowed to see it (403): nothing inside it can be reached, so the id
  // check is all that's needed, and the rest of OneDrive keeps working.
  if (r.status === 404 || r.status === 403) return lock;
  if (!r.ok) throw new HrLockUnknown();
  const it = (await r.json().catch(() => null)) as { name?: string; root?: unknown; parentReference?: { driveId?: string; path?: string } } | null;
  if (!it) throw new HrLockUnknown();
  lock.driveId = it.parentReference?.driveId || lock.driveId;
  const pp = hrNorm(it.parentReference?.path);
  lock.path = it.root ? '' : pp === null ? null : `${pp}/${String(it.name ?? '').toLowerCase()}`;
  return lock;
}
/** A OneDrive item by id, for the checks above: null if it doesn't exist or the company sign-in can't see it (so it
 *  can't be reached either); HrLockUnknown if Microsoft doesn't answer. */
export async function hrItem(msToken: string, driveId: string | null | undefined, itemId: string): Promise<HrItem> {
  const g = 'https://graph.microsoft.com/v1.0';
  const u = driveId ? `${g}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}` : `${g}/me/drive/items/${encodeURIComponent(itemId)}`;
  let r: Response;
  try { r = await fetch(`${u}?$select=id,name,parentReference,remoteItem,root`, { headers: { Authorization: `Bearer ${msToken}` } }); } catch { throw new HrLockUnknown(); }
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new HrLockUnknown();
  const it = (await r.json().catch(() => null)) as HrItem;
  if (!it) throw new HrLockUnknown();
  return it;
}
export const HR_LOCKED = 'This is in the HR folder. Only the people HR › HR Access lets in can open it.';
export const HR_TRY_AGAIN = 'OneDrive didn’t answer about the HR folder, so this has been held back. Please try again in a minute.';
/** Microsoft couldn't say where the HR folder (or an item) is: refuse with HR_TRY_AGAIN. */
export class HrLockUnknown extends Error { constructor() { super(HR_TRY_AGAIN); this.name = 'HrLockUnknown'; } }
// ---- end HR folder lock ----

// Quote tracker (1 Nov 2026). Called by a PM / admin from the app, or by the daily cron with x-cron-secret.
//   { action: 'folder', quote_id }  makes the enquiry's OneDrive folder by copying the company's New Enquiry template.
//   { action: 'file', quote_id }    a finished quote: moves its folder to the Estimating folder for the year it finished.
//   { action: 'won', quote_id, site_id }  moves the folder into the new job's pack.
//   { action: 'chase', quote_id }   a PM presses Chase now: one email to each client's contact on the quote.
//   { action: 'send', quote_id, to, subject, body, files: [{id, driveId, name}] }  sends the quote to the client with
//     files from its OneDrive folder attached, copying the sender in.
//   { action: 'estimating_root' } / { action: 'link_folder', site_id, folder_id, drive_id }  a job's estimating folder
//     chosen from OneDrive (Finance jobs), see below.
//   cron: every company with chase_enabled, returned quotes with chase_on whose date has come.
// Added 11 Nov 2026 (Andy):
//   { action: 'status', quote_id, status }  a new work status moves the folder into that status's folder under Open
//     Tenders (Awaiting More Information, Ready For Checking; Pricing goes to the estimator's own folder, if set).
//   { action: 'subfolder', parent_id, drive_id, name }  a new folder inside an enquiry's folder (Add Documents).
//   send takes cc: the company's preset CC (on by default) as well as the sender.
//   cron: each company's auto exports that are due (Quote Settings › Auto Export), emailed as Excel and / or saved in
//     the Open Tenders folder under Reports.
// Folders are only ever moved or copied, never deleted, and are held by id so a move by hand in OneDrive doesn't lose them.
const corsHeaders = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token, x-cron-secret, cache-control, pragma' };
const OPHUB_ORIGINS = new Set(['https://operativehub.co.uk', 'https://www.operativehub.co.uk', 'https://ophub-ten.vercel.app', 'capacitor://localhost', 'https://localhost', 'http://localhost']);
const originOk = (o: string | null) => !!o && (OPHUB_ORIGINS.has(o) || /^https:\/\/ophub-[a-z0-9-]+-op-hub\.vercel\.app$/.test(o) || /^http:\/\/localhost:\d{2,5}$/.test(o));
const reply = (req: Request, obj: unknown, status = 200) => {
  const h = new Headers({ ...corsHeaders, 'Content-Type': 'application/json', Vary: 'Origin' });
  const o = req.headers.get('Origin');
  if (originOk(o)) h.set('Access-Control-Allow-Origin', o as string);
  return new Response(JSON.stringify(obj), { status, headers: h });
};
const GRAPH = 'https://graph.microsoft.com/v1.0';
const EMAIL_OK = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const seg = (s: unknown) => String(s ?? '').replace(/[\\\u0000-\u001f]+/g, '_').replace(/[:*?"<>|/]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 120);
const cleanPath = (p: unknown) => String(p ?? '').split('/').map(seg).filter(Boolean).join('/');
const uidOf = (t: string) => { try { const p = t.split('.')[1]; return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(p.length / 4) * 4, '='))).sub || null; } catch { return null; } };
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

async function tokenFor(admin: any, conn: any) {
  if (new Date(conn.expires_at).getTime() > Date.now() + 60000) return conn.access_token;
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: Deno.env.get('AZURE_CLIENT_ID')!, client_secret: Deno.env.get('AZURE_CLIENT_SECRET')!, refresh_token: conn.refresh_token, grant_type: 'refresh_token' }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error('OneDrive sign-in needs reconnecting');
  await admin.from('onedrive_connections').update({ access_token: d.access_token, refresh_token: d.refresh_token || conn.refresh_token, expires_at: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString() }).eq('org_id', conn.org_id);
  return d.access_token;
}
// One level at a time, as a level can be a shortcut to another library (see onedrive-job-pack).
type Ref = { drive: string | null; id: string };
const ROOT: Ref = { drive: null, id: 'root' };
const at = (r: Ref) => (r.drive ? `${GRAPH}/drives/${encodeURIComponent(r.drive)}/items/${encodeURIComponent(r.id)}` : `${GRAPH}/me/drive/root`);
const refOf = (i: any): Ref => (i.remoteItem ? { drive: i.remoteItem.parentReference?.driveId, id: i.remoteItem.id } : { drive: i.parentReference?.driveId, id: i.id });
async function walk(token: string, from: Ref, path: string, make: boolean): Promise<Ref | null> {
  let cur = from;
  for (const p of path.split('/').filter(Boolean)) {
    let r = await fetch(`${at(cur)}:/${encodeURIComponent(p)}?select=id,parentReference,remoteItem`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404 && make) r = await fetch(`${at(cur)}/children`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: p, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) });
    if (!r.ok) { if (r.status !== 404) console.error('quote-tracker: folder step failed', r.status); return null; }
    cur = refOf(await r.json());
  }
  return cur;
}
/** Moves a folder under a new parent. Between libraries a move isn't possible, so it's copied and the original stays. */
async function moveFolder(token: string, folder: Ref, to: Ref): Promise<'moved' | 'copied' | 'failed'> {
  const name = (await (await fetch(`${at(folder)}?select=name`, { headers: { Authorization: `Bearer ${token}` } })).json().catch(() => ({})))?.name;
  if (folder.drive === to.drive) {
    const r = await fetch(at(folder), { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ parentReference: { id: to.id }, '@microsoft.graph.conflictBehavior': 'rename' }) });
    if (!r.ok) console.error('quote-tracker: move failed', r.status);
    return r.ok ? 'moved' : 'failed';
  }
  const r = await fetch(`${at(folder)}/copy?@microsoft.graph.conflictBehavior=rename`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ parentReference: { driveId: to.drive, id: to.id }, ...(name ? { name } : {}) }) });
  return r.ok || r.status === 202 ? 'copied' : 'failed';
}

const DEFAULT_SUBJECT = 'Our quotation for {project}';
const DEFAULT_BODY = 'Hi {contact},\n\nI hope you are well. We sent you our quotation for {project} on {date}, and I wanted to check how things are progressing.\n\nIf you need anything else from us, or there is any feedback, please let me know.\n\nKind regards,\n{sender}\n{company}';
// The signature on emails to clients (Andy, 19 Nov 2026: "the email chasers for email need to pull through an email
// footer or logos"): the sender's name, phone and email, then the company's logo, name, address and phone (Admin ›
// company details). The sender's email is their email for this company when they've set one (company switching),
// and replies go there too. The wording's own sign-off ("{sender}" and "{company}" on the last two lines) gives way to it.
type Sig = { html: string; text: string; replyTo: string | null; tail: string };
async function signatureFor(admin: any, orgId: string, sender: { id: string | null; name: string; email: string | null }): Promise<Sig> {
  const [{ data: org }, { data: p }, { data: mem }] = await Promise.all([
    admin.from('organizations').select('name, logo_path, color_primary, rams_settings').eq('id', orgId).maybeSingle(),
    sender.id ? admin.from('profiles').select('phone').eq('id', sender.id).maybeSingle() : Promise.resolve({ data: null }),
    sender.id ? admin.from('company_memberships').select('work_email').eq('user_id', sender.id).eq('org_id', orgId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const company = String(org?.name || ''), st = (org?.rams_settings || {}) as { address?: string; phone?: string };
  const email = String(mem?.work_email || sender.email || '').trim() || null;
  const contact = [String(p?.phone || '').trim(), email].filter(Boolean).join(' · ');
  const addr = String(st.address || '').split(/\s*\n\s*/).map((x) => x.replace(/[\s,]+$/, '')).filter(Boolean).join(', ');
  const tel = String(st.phone || '').trim();
  const logo = org?.logo_path ? `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/org-logos/${org.logo_path}` : null;
  const brand = /^#[0-9a-f]{6}$/i.test(String(org?.color_primary || '')) ? String(org.color_primary) : '#101114';
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;border-top:1px solid #E3E6EA;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.45;color:#3B4048;"><tr>`
    + (logo ? `<td style="vertical-align:top;padding:14px 16px 0 0;"><img src="${esc(logo)}" alt="${esc(company)}" height="52" style="height:52px;width:auto;max-width:170px;display:block;border:0;"></td>` : '')
    + `<td style="vertical-align:top;padding-top:14px;"><div style="font-weight:600;font-size:14px;color:#101114;">${esc(sender.name)}</div>`
    + (contact ? `<div>${esc(contact)}</div>` : '')
    + (company ? `<div style="font-weight:600;color:${brand};margin-top:5px;">${esc(company)}</div>` : '')
    + (addr ? `<div>${esc(addr)}</div>` : '') + (tel ? `<div>Tel: ${esc(tel)}</div>` : '')
    + `</td></tr></table>`;
  const text = `\n\n--\n${[sender.name, contact, company, addr, tel ? `Tel: ${tel}` : ''].filter(Boolean).join('\n')}`;
  return { html, text, replyTo: email, tail: company ? `\n${sender.name}\n${company}` : `\n${sender.name}` };
}
/** The email's wording with the signature under it: its own last-two-lines sign-off gives way to the signature. */
function signed(body: string, sig: Sig): { html: string; text: string } {
  const t = body.replace(/\s+$/, '');
  const main = t.endsWith(sig.tail) ? t.slice(0, -sig.tail.length) : t;
  return {
    html: `<div style="font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.5;color:#101114;white-space:pre-wrap;">${esc(main)}</div>${sig.html}`,
    text: `${main}${sig.text}`,
  };
}

// Every client the quote went to is chased, each by name (Andy, 4 Nov 2026): the main contact and the other clients
// tendering the same job (quote_clients) that have a contact email. One round counts once towards the chase limit.
async function sendChase(admin: any, q: any, settings: any, sender: { id: string | null; name: string; email: string | null }, automatic: boolean): Promise<string | null> {
  const { data: extra } = await admin.from('quote_clients').select('client_name, contact_name, contact_email').eq('quote_id', q.id);
  const seen = new Set<string>();
  const people = [{ client: q.client_name, contact: q.contact_name, email: q.contact_email }, ...(extra || []).map((c: any) => ({ client: c.client_name, contact: c.contact_name, email: c.contact_email }))]
    .map((p) => ({ ...p, email: String(p.email || '').trim() }))
    .filter((p) => EMAIL_OK.test(p.email) && !seen.has(p.email.toLowerCase()) && seen.add(p.email.toLowerCase()));
  if (!people.length) return 'This quote has no email address to chase.';
  const KEY = Deno.env.get('RESEND_API_KEY');
  if (!KEY) return 'Email sending is not set up.';
  const { data: org } = await admin.from('organizations').select('name, logo_path, color_primary').eq('id', q.org_id).maybeSingle();
  const company = org?.name || '';
  const date = q.returned_at || q.return_date ? new Date(`${q.returned_at || q.return_date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'recently';
  const m = /<([^>]+)>/.exec(Deno.env.get('ORDERS_FROM_EMAIL') || '');
  const address = (m ? m[1] : Deno.env.get('ORDERS_FROM_EMAIL') || 'orders@ophub.app').trim();
  const sig = await signatureFor(admin, q.org_id, sender);
  let sent = 0;
  for (const p of people) {
    const fill = (t: string) => t.replace(/\{contact\}/g, p.contact || 'there').replace(/\{client\}/g, p.client || '').replace(/\{project\}/g, q.title || '').replace(/\{date\}/g, date).replace(/\{sender\}/g, sender.name).replace(/\{company\}/g, company);
    const subject = fill(settings?.chase_subject || DEFAULT_SUBJECT).replace(/[\r\n]+/g, ' ').slice(0, 200);
    // Reads like a person's email, not a system notice: this one goes to clients. Signed with the company's logo.
    const { text, html } = signed(fill(settings?.chase_body || DEFAULT_BODY), sig);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `"${`${sender.name} - ${company}`.replace(/"/g, "'")}" <${address}>`, to: [p.email], subject, text, html, ...(sig.replyTo ? { reply_to: [sig.replyTo] } : {}) }),
    });
    if (!res.ok) { console.error('quote-tracker: provider refused', res.status, await res.text()); continue; }
    sent++;
    await admin.from('quote_chases').insert({ quote_id: q.id, org_id: q.org_id, sent_to: p.email, sent_by: sender.id, automatic });
    await admin.from('edge_email_log').insert({ fn: 'quote-tracker', sender_id: sender.id, org_id: q.org_id, to_email: p.email.toLowerCase(), cc: [], subject }).then(undefined, () => undefined);
  }
  if (!sent) return 'The email service didn’t accept the email.';
  const now = new Date();
  const count = (q.chase_count || 0) + 1, max = settings?.chase_max ?? 3;
  await admin.from('quotes').update({ chase_count: count, last_chased_at: now.toISOString(), next_chase_date: q.chase_on && count < max ? addDays(now, settings?.chase_every_days ?? 14) : null, updated_at: now.toISOString() }).eq('id', q.id);
  return sent < people.length ? `Sent to ${sent} of ${people.length} — the email service didn’t accept the rest.` : null;
}

// ---- Auto exports (Andy, 11 Nov 2026) ----
const ukDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function reportXlsx(kind: string, rows: any[], today: string, company: string): Uint8Array {
  const t = quoteReport(kind as never, rows, today);
  const cell = (c: { money?: boolean }, v: unknown, bold = false): XCell => (c.money && typeof v === 'number' ? { v, s: 'money' } : bold ? { v: v as string, s: 'bold' } : (v as string | number | null));
  const body = t.rows.map((r) => t.cols.map((c, i) => cell(c, r[i])));
  if (t.totals) body.push(t.cols.map((c, i) => cell(c, t.totals?.[i], true)));
  return makeXlsx([reportSheet(t.title, `${company} — ${t.title}`, t.cols.map((c) => c.l), body, t.cols.map((c, i) => (c.w ? c.w / 6 : i === 0 ? 30 : 14)), `${t.sub || ''} · ${ukDay(today)}`)]);
}
async function runAutoExports(admin: any, today: string): Promise<number> {
  const { data: all } = await admin.from('quote_settings').select('*');
  const KEY = Deno.env.get('RESEND_API_KEY');
  let n = 0;
  for (const s of all || []) {
    const list: AutoExport[] = Array.isArray(s.auto_exports) ? s.auto_exports : [];
    if (!list.length) continue;
    const sent: Record<string, string> = { ...(s.auto_exports_sent || {}) };
    const due = list.map((a) => ({ a, ...autoDue(a, today, sent[a.id]) })).filter((x) => x.due);
    if (!due.length) continue;
    const { data: org } = await admin.from('organizations').select('name').eq('id', s.org_id).maybeSingle();
    const { data: qs } = await admin.from('quotes').select('*').eq('org_id', s.org_id).order('return_date', { ascending: false, nullsFirst: false }).limit(5000);
    const { data: extra } = await admin.from('quote_clients').select('quote_id, client_name').eq('org_id', s.org_id).limit(20000);
    const rows = (qs || []).map((q: any) => ({ ...q, others: (extra || []).filter((c: any) => c.quote_id === q.id) }));
    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', s.org_id).maybeSingle();
    for (const { a, period } of due) {
      const name = `${reportLabel(a.report)} ${today}.xlsx`.replace(/[\\/:*?"<>|]+/g, '-');
      const bytes = reportXlsx(a.report, rows, today, org?.name || '');
      let ok = false;
      const to = String(a.to || '').split(/[,;\s]+/).map((e) => e.trim()).filter((e) => EMAIL_OK.test(e)).slice(0, 5);
      if (to.length && KEY) {
        const m = /<([^>]+)>/.exec(Deno.env.get('ORDERS_FROM_EMAIL') || '');
        const address = (m ? m[1] : Deno.env.get('ORDERS_FROM_EMAIL') || 'orders@ophub.app').trim();
        const subject = `${reportLabel(a.report)} — ${ukDay(today)}`;
        const text = `Your ${reportLabel(a.report).toLowerCase()} report from OpHUB is attached.\n\n${org?.name || ''}`;
        const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: `"${`OpHUB - ${org?.name || ''}`.replace(/"/g, "'")}" <${address}>`, to, subject, text, attachments: [{ filename: name, content: encodeBase64(bytes) }] }) });
        if (res.ok) { ok = true; for (const e of to) await admin.from('edge_email_log').insert({ fn: 'quote-tracker', sender_id: null, org_id: s.org_id, to_email: e.toLowerCase(), cc: [], subject }).then(undefined, () => undefined); }
        else console.error('quote-tracker: auto export email refused', res.status);
      }
      if (a.onedrive && conn?.access_token && s.open_path) {
        try {
          const g = await tokenFor(admin, conn);
          const dir = await walk(g, ROOT, cleanPath(`${s.open_path}/Reports`), true);
          if (dir) {
            const r = await fetch(`${at(dir)}:/${encodeURIComponent(name)}:/content`, { method: 'PUT', headers: { Authorization: `Bearer ${g}`, 'Content-Type': 'application/octet-stream' }, body: bytes });
            if (r.ok) ok = true; else console.error('quote-tracker: auto export save failed', r.status);
          }
        } catch (e) { console.error('quote-tracker: auto export save failed', e); }
      }
      if (ok) { sent[a.id] = period; n++; }
    }
    await admin.from('quote_settings').update({ auto_exports_sent: sent }).eq('org_id', s.org_id);
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(req, { ok: true });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!, CRON = Deno.env.get('CRON_SECRET');
    const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });

    if (CRON && req.headers.get('x-cron-secret') === CRON) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: on } = await admin.from('quote_settings').select('*').eq('chase_enabled', true);
      let sent = 0;
      for (const s of on || []) {
        const { data: due } = await admin.from('quotes').select('*').eq('org_id', s.org_id).eq('status', 'returned').eq('chase_on', true).lte('next_chase_date', today).lt('chase_count', s.chase_max ?? 3).limit(100);
        for (const q of due || []) {
          const { data: p } = q.priced_by ? await admin.from('profiles').select('id, name, email').eq('id', q.priced_by).maybeSingle() : { data: null };
          const err = await sendChase(admin, q, s, { id: p?.id ?? null, name: p?.name || q.priced_by_name || 'Estimating', email: p?.email ?? null }, true);
          if (!err) sent++; else console.error('quote-tracker: chase skipped', q.id, err);
        }
      }
      const exported = await runAutoExports(admin, today);
      // The year's Estimating folder is there from the start of January (Andy, 11 Nov 2026), not only once a quote is filed.
      if (today.slice(5, 7) === '01') {
        const { data: yr } = await admin.from('quote_settings').select('org_id, archive_path').not('archive_path', 'is', null);
        for (const s of yr || []) {
          try {
            const { data: cn } = await admin.from('onedrive_connections').select('*').eq('org_id', s.org_id).maybeSingle();
            if (cn?.access_token) await walk(await tokenFor(admin, cn), ROOT, cleanPath(String(s.archive_path).replace('{year}', today.slice(0, 4))), true);
          } catch (e) { console.error('quote-tracker: year folder', e); }
        }
      }
      return reply(req, { ok: true, sent, exported });
    }

    const token = req.headers.get('X-User-Token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const uid = token ? uidOf(token) : null;
    if (!uid) return reply(req, { error: 'Not authenticated' }, 401);
    const who = await (await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,org_id,role,name,email&id=eq.${uid}`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON } })).json().catch(() => []);
    const me = Array.isArray(who) ? who[0] : null;
    if (!me?.org_id || !['pm', 'admin'].includes(String(me.role))) return reply(req, { error: 'Project managers and admins only.' }, 403);
    // HR folder lock (review 15 Nov 2026, section 3 #5): a OneDrive item the caller names (or a quote's folder about to be
    // moved) is checked against the HR folder for anyone HR › HR Access doesn't let in. carry: a move or copy, so a
    // folder holding the HR folder is refused too.
    const hrRefuse = async (g: string, items: { drive: string | null; id: string }[], carry: boolean): Promise<Response | null> => {
      try {
        const lock = await hrLockFor(admin, me.org_id, g, SUPABASE_URL, ANON, token);
        if (!lock) return null;
        for (const i of items) {
          const it = await hrItem(g, i.drive, i.id);
          if (carry ? hrHolds(lock, it) : hrInside(lock, it)) return reply(req, { error: HR_LOCKED }, 403);
        }
        return null;
      } catch (e) { if (e instanceof HrLockUnknown) return reply(req, { error: HR_TRY_AGAIN }, 503); throw e; }
    };

    const body = await req.json().catch(() => ({}));
    // A job's estimating folder, chosen from OneDrive (Andy, 4 Nov 2026), e.g. for a job made in Finance. No quote needed.
    //   { action: 'estimating_root' }  where open enquiries live (Quote settings), so the picker can start there.
    //   { action: 'link_folder', site_id, folder_id, drive_id }  moves that folder into the job's Contract & Commercial ›
    //     Estimating folder; a quote using that folder is marked won and linked to the job.
    if (body.action === 'estimating_root' || body.action === 'link_folder' || body.action === 'subfolder') {
      const { data: st } = await admin.from('quote_settings').select('*').eq('org_id', me.org_id).maybeSingle();
      const { data: cn } = await admin.from('onedrive_connections').select('*').eq('org_id', me.org_id).maybeSingle();
      if (!cn?.access_token) return reply(req, { error: 'OneDrive isn’t connected.' });
      const g = await tokenFor(admin, cn);
      if (body.action === 'subfolder') {
        const name = seg(body.name), pid = String(body.parent_id || ''), pdrive = String(body.drive_id || '');
        if (!name || !pid || !pdrive) return reply(req, { error: 'Name the folder.' }, 400);
        const hrNo = await hrRefuse(g, [{ drive: pdrive, id: pid }], false);
        if (hrNo) return hrNo;
        const r = await fetch(`${at({ drive: pdrive, id: pid })}/children`, { method: 'POST', headers: { Authorization: `Bearer ${g}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }) });
        if (!r.ok) { console.error('quote-tracker: new folder failed', r.status); return reply(req, { error: 'Could not make the folder.' }); }
        return reply(req, { ok: true, id: (await r.json().catch(() => ({})))?.id ?? null });
      }
      if (body.action === 'estimating_root') {
        const path = cleanPath(st?.open_path || '');
        const r = path ? await walk(g, ROOT, path, false) : null;
        return reply(req, r ? { ok: true, id: r.id, driveId: r.drive, name: path.split('/').pop() } : { ok: true, none: true });
      }
      const { data: site } = await admin.from('sites').select('org_id, job_pack').eq('id', String(body.site_id || '')).maybeSingle();
      if (!site || site.org_id !== me.org_id) return reply(req, { error: 'Forbidden' }, 403);
      if (!site.job_pack) return reply(req, { error: 'This job has no OneDrive folder yet.' });
      const fid = String(body.folder_id || '');
      if (!fid) return reply(req, { error: 'Choose the folder.' }, 400);
      let fdrive = String(body.drive_id || '') || null;
      if (!fdrive) fdrive = (await (await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(fid)}?select=parentReference`, { headers: { Authorization: `Bearer ${g}` } })).json().catch(() => ({})))?.parentReference?.driveId || null;
      if (!fdrive) return reply(req, { error: 'Could not find that folder in OneDrive.' });
      const hrNo = await hrRefuse(g, [{ drive: fdrive, id: fid }], true);
      if (hrNo) return hrNo;
      const to = await walk(g, { drive: site.job_pack.drive_id, id: site.job_pack.root_id }, cleanPath(st?.won_folder || '1. Contract & Commercial/2. Estimating'), true);
      if (!to) return reply(req, { error: 'Could not find the job’s estimating folder.' }, 502);
      const how = await moveFolder(g, { drive: fdrive, id: fid }, to);
      if (how === 'failed') return reply(req, { error: 'Could not move the folder.' });
      const { data: hit } = await admin.from('quotes').select('id, title').eq('org_id', me.org_id).eq('folder_id', fid).is('site_id', null).limit(1);
      if (hit?.[0]) await admin.from('quotes').update({ site_id: String(body.site_id), status: 'won', completed_at: new Date().toISOString().slice(0, 10), chase_on: false, next_chase_date: null, updated_at: new Date().toISOString() }).eq('id', hit[0].id);
      return reply(req, { ok: true, how, quote: hit?.[0]?.title ?? null });
    }
    const { data: q } = await admin.from('quotes').select('*').eq('id', String(body.quote_id || '')).maybeSingle();
    if (!q || q.org_id !== me.org_id) return reply(req, { error: 'Forbidden' }, 403);
    const { data: settings } = await admin.from('quote_settings').select('*').eq('org_id', me.org_id).maybeSingle();

    if (body.action === 'chase') {
      const err = await sendChase(admin, q, settings, { id: me.id, name: me.name || 'Estimating', email: me.email || null }, false);
      return reply(req, err ? { error: err } : { ok: true });
    }

    const { data: conn } = await admin.from('onedrive_connections').select('*').eq('org_id', me.org_id).maybeSingle();
    if (!conn?.access_token) return reply(req, { error: 'OneDrive isn’t connected.' });
    const graph = await tokenFor(admin, conn);
    const folder: Ref | null = q.folder_id && q.folder_drive_id ? { drive: q.folder_drive_id, id: q.folder_id } : null;

    if (body.action === 'folder') {
      if (folder) return reply(req, { ok: true, already: true });
      if (!settings?.open_path || !settings?.template_path) return reply(req, { error: 'Set the estimating folders in Quote settings first.' });
      const parent = await walk(graph, ROOT, cleanPath(settings.open_path), true);
      const template = await walk(graph, ROOT, cleanPath(settings.template_path), false);
      if (!parent?.drive || !template) return reply(req, { error: 'Could not find the estimating folders in OneDrive.' });
      const hrNo = await hrRefuse(graph, [template], true);
      if (hrNo) return hrNo;
      const name = seg(q.title) || seg(q.client_name) || 'New enquiry';
      let made = await walk(graph, parent, name, false);
      if (!made) {
        const r = await fetch(`${at(template)}/copy`, { method: 'POST', headers: { Authorization: `Bearer ${graph}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ parentReference: { driveId: parent.drive, id: parent.id }, name }) });
        if (!r.ok && r.status !== 202) { console.error('quote-tracker: copy failed', r.status); return reply(req, { error: 'Could not copy the template.' }, 502); }
        // OneDrive copies in the background: the folder shows up shortly after.
        for (let i = 0; i < 12 && !made; i++) { await new Promise((w) => setTimeout(w, 1500)); made = await walk(graph, parent, name, false); }
      }
      if (!made) return reply(req, { error: 'OneDrive is still copying the template. Try again in a minute.' });
      await admin.from('quotes').update({ folder_id: made.id, folder_drive_id: made.drive, folder_name: name, updated_at: new Date().toISOString() }).eq('id', q.id);
      return reply(req, { ok: true, name });
    }
    if (body.action === 'send') {
      const to = String(body.to || '').trim();
      if (!EMAIL_OK.test(to)) return reply(req, { error: 'That email address doesn’t look right.' });
      const list = Array.isArray(body.files) ? body.files.slice(0, 20) : [];
      if (!list.length) return reply(req, { error: 'Tick the files to send.' });
      const hrNo = await hrRefuse(graph, list.map((f: any) => ({ drive: String(f?.driveId || q.folder_drive_id || '') || null, id: String(f?.id || '') })), false);
      if (hrNo) return hrNo;
      const KEY = Deno.env.get('RESEND_API_KEY');
      if (!KEY) return reply(req, { error: 'Email sending is not set up.' });
      const since = new Date(Date.now() - 864e5).toISOString();
      const { count } = await admin.from('edge_email_log').select('id', { count: 'exact', head: true }).eq('fn', 'quote-tracker').eq('sender_id', me.id).gte('created_at', since);
      if ((count || 0) >= 100) return reply(req, { error: 'You’ve reached today’s limit of 100 emails.' });
      const attachments: { filename: string; content: string }[] = [];
      let total = 0;
      for (const f of list) {
        const r = await fetch(`${at({ drive: String(f.driveId || q.folder_drive_id), id: String(f.id) })}/content`, { headers: { Authorization: `Bearer ${graph}` } });
        if (!r.ok) return reply(req, { error: `Could not read ${seg(f.name)} from OneDrive.` });
        const bytes = new Uint8Array(await r.arrayBuffer());
        total += bytes.length;
        if (total > 25 * 1024 * 1024) return reply(req, { error: 'Those files are over 25MB together, which is too big to email. Send fewer, or email them yourself.' });
        attachments.push({ filename: seg(f.name) || 'Document', content: encodeBase64(bytes) });
      }
      const { data: org } = await admin.from('organizations').select('name').eq('id', me.org_id).maybeSingle();
      const subject = String(body.subject || `Quotation for ${q.title}`).replace(/[\r\n]+/g, ' ').slice(0, 200);
      const text = String(body.body || '').slice(0, 5000);
      const m = /<([^>]+)>/.exec(Deno.env.get('ORDERS_FROM_EMAIL') || '');
      const address = (m ? m[1] : Deno.env.get('ORDERS_FROM_EMAIL') || 'orders@ophub.app').trim();
      // Copied in: the sender, and the company's preset CC when it's left on (Andy, 11 Nov 2026), at most 5.
      // Signed like the chaser: the sender's details and the company's logo (19 Nov 2026).
      const sig = await signatureFor(admin, me.org_id, { id: me.id, name: me.name || 'Estimating', email: me.email || null });
      const out = signed(text, sig);
      const cc = [...new Set([...(sig.replyTo ? [String(sig.replyTo)] : []), ...(Array.isArray(body.cc) ? body.cc : [])].map((e) => String(e || '').trim().toLowerCase()).filter((e) => EMAIL_OK.test(e) && e !== to.toLowerCase()))].slice(0, 5);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `"${`${me.name || 'Estimating'} - ${org?.name || ''}`.replace(/"/g, "'")}" <${address}>`, to: [to], ...(cc.length ? { cc } : {}), ...(sig.replyTo ? { reply_to: [sig.replyTo] } : {}), subject, text: out.text, html: out.html, attachments }),
      });
      if (!res.ok) { console.error('quote-tracker: send refused', res.status, await res.text()); return reply(req, { error: 'The email service didn’t accept the email.' }); }
      await admin.from('edge_email_log').insert({ fn: 'quote-tracker', sender_id: me.id, org_id: me.org_id, to_email: to.toLowerCase(), cc, subject }).then(undefined, () => undefined);
      return reply(req, { ok: true });
    }
    if (!folder) return reply(req, { ok: true, skipped: 'no folder' });
    if (['status', 'file', 'won'].includes(String(body.action))) {
      const hrNo = await hrRefuse(graph, [folder], true);
      if (hrNo) return hrNo;
    }

    if (body.action === 'status') {
      if (q.filed_at || q.site_id) return reply(req, { ok: true, skipped: 'already filed' });
      if (!settings?.open_path) return reply(req, { ok: true, skipped: 'no open tenders folder set' });
      const st = String(body.status || q.status);
      const sf: Record<string, string> = { awaiting: '- Awaiting More Information', checking: '- Ready For Checking', ...(settings.status_folders || {}) };
      const own = q.priced_by ? String((settings.person_folders || {})[q.priced_by] || '') : '';
      const sub = st === 'pricing' ? own || sf.pricing || '' : sf[st] || '';
      if (!['pricing', 'awaiting', 'checking'].includes(st)) return reply(req, { ok: true, skipped: 'not a work status' });
      // A folder starting "/" is a whole path from the top of OneDrive; otherwise it's inside Open Tenders.
      const to = await walk(graph, ROOT, sub.startsWith('/') ? cleanPath(sub) : cleanPath(`${settings.open_path}/${sub}`), true);
      if (!to) return reply(req, { error: 'Could not find that status’s folder in OneDrive.' }, 502);
      const cur = await (await fetch(`${at(folder)}?select=parentReference`, { headers: { Authorization: `Bearer ${graph}` } })).json().catch(() => ({}));
      if (cur?.parentReference?.id === to.id) return reply(req, { ok: true, how: 'already' });
      // Moved only within the same library, so a status change never leaves two copies about.
      if (to.drive && folder.drive && to.drive !== folder.drive) return reply(req, { ok: true, skipped: 'different library' });
      const how = await moveFolder(graph, folder, to);
      return reply(req, how === 'failed' ? { error: 'Could not move the folder.' } : { ok: true, how });
    }

    if (body.action === 'file') {
      if (q.filed_at) return reply(req, { ok: true, skipped: 'already filed' });
      if (!settings?.archive_path) return reply(req, { ok: true, skipped: 'no archive folder set' });
      const year = String(q.returned_at || q.completed_at || new Date().toISOString()).slice(0, 4);
      const to = await walk(graph, ROOT, cleanPath(String(settings.archive_path).replace('{year}', year)), true);
      if (!to) return reply(req, { error: 'Could not find that year’s estimating folder.' }, 502);
      const how = await moveFolder(graph, folder, to);
      if (how === 'failed') return reply(req, { error: 'Could not move the folder.' });
      await admin.from('quotes').update({ filed_at: new Date().toISOString() }).eq('id', q.id);
      return reply(req, { ok: true, how, year });
    }
    if (body.action === 'won') {
      const { data: site } = await admin.from('sites').select('org_id, job_pack').eq('id', String(body.site_id || '')).maybeSingle();
      if (!site || site.org_id !== me.org_id) return reply(req, { error: 'Forbidden' }, 403);
      if (!site.job_pack) return reply(req, { ok: true, skipped: 'no job pack' });
      const root: Ref = { drive: site.job_pack.drive_id, id: site.job_pack.root_id };
      const to = await walk(graph, root, cleanPath(settings?.won_folder || '1. Contract & Commercial/2. Estimating'), true);
      if (!to) return reply(req, { error: 'Could not find the job’s estimating folder.' }, 502);
      const how = await moveFolder(graph, folder, to);
      return reply(req, how === 'failed' ? { error: 'Could not move the folder.' } : { ok: true, how });
    }
    return reply(req, { error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('quote-tracker failed', e);
    return reply(req, { error: 'Something went wrong with the quote tracker.' }, 500);
  }
});
