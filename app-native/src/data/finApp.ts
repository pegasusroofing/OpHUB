// Applications for payment (902 / 903 / 9219p): a new application from the
// Bill of Quantities (last % carried forward, agreed variations, approved day
// works), saving, Applied (locked) / back to draft, the client's certificate,
// and the invoice raised from it.
import { issue } from '@/data/finInvoice';
import { fdb, loadSettings } from '@/data/finance';
import { syncSiteVariationValues } from '@/data/finVar';
import { buildAppPdf } from '@/lib/finAppPdf';
import { deliverPdf, deliverXlsx, PDFDocument } from '@/lib/pdf';
import { buildSowPdf, sowPeriod } from '@/lib/sowPdf';
import { appCalc, certInvoiceLines, isItem, pct, previousCertified } from '@/lib/rules/finApp';
import { appDoc, appExcelSheets, appFilename, type NewBoqLine } from '@/lib/rules/finAppExcel';
import { makeXlsx } from '@/lib/rules/xlsx';
import { daysOr, addDays, appDateFor, fdate, retentionHeld, retentionReleased, retHalf, round2, today } from '@/lib/rules/finance';
import { invTotals, vatFromTreatment } from '@/lib/rules/finInvoice';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';

type Row = Record<string, any>;
const rows = async (q: PromiseLike<{ data: unknown }>) => ((await q).data as Row[] | null) ?? [];

/** The application's variation and day-work rows from the registers: agreed Finance variations, approved
 *  site variations not linked to one, approved day works; percentages carried from `prev` (the last
 *  application, or this draft itself), and hand-typed rows kept. */
function registerRows(prev: Row | undefined, vars: Row[], fvars: Row[], fdays: Row[]) {
  const lastVar: Row = {}, lastFinVar: Row = {}, lastDay: Row = {};
  (prev?.variations || []).forEach((v: Row) => { if (v.variation_id) lastVar[v.variation_id] = v; if (v.fin_variation_id) lastFinVar[v.fin_variation_id] = v; });
  (prev?.dayworks || []).forEach((d: Row) => { if (d.fin_daywork_id) lastDay[d.fin_daywork_id] = d; });
  const linked = new Set(fvars.map((v) => v.variation_id).filter(Boolean));
  const varRows: Row[] = fvars.map((v) => ({ fin_variation_id: v.id, variation_id: v.variation_id || null, description: `${v.number} ${v.title}`, value: v.agreed_value != null ? Number(v.agreed_value) : Number(v.quoted || 0), pct: lastFinVar[v.id] ? lastFinVar[v.id].pct : 100 }));
  vars.filter((v) => !linked.has(v.id)).forEach((v) => { const p = lastVar[v.id], amt = Number(String(v.cost_impact ?? '').replace(/[£,\s]/g, '')); varRows.push({ variation_id: v.id, description: v.description || 'Variation', value: isNaN(amt) || !String(v.cost_impact ?? '').trim() ? (p ? p.value : 0) : amt, pct: p ? p.pct : 100 }); });
  (prev?.variations || []).filter((v: Row) => !v.variation_id && !v.fin_variation_id).forEach((v: Row) => varRows.push({ ...v }));
  const dayRows: Row[] = fdays.map((d) => ({ fin_daywork_id: d.id, description: `${d.number ? `${d.number} ` : ''}${d.title}`, value: Number(d.value || 0) }))
    .concat((prev?.dayworks || []).filter((d: Row) => !d.fin_daywork_id).map((d: Row) => ({ ...d })));
  return { varRows, dayRows };
}
const loadRegisters = (siteId: string) => Promise.all([
  rows(fdb.from('variations').select('*').eq('site_id', siteId).eq('approval_status', 'approved').order('created_at')),
  rows(fdb.from('fin_variations').select('*').eq('site_id', siteId).eq('status', 'agreed').order('seq')),
  rows(fdb.from('fin_dayworks').select('*').eq('site_id', siteId).eq('status', 'approved').order('seq')),
]);

export async function newApplication(me: Profile, siteId: string): Promise<{ id?: string; error?: string }> {
  await syncSiteVariationValues(siteId).catch(() => 0); // 9219zzb: PM's variation values first
  const [st, jfR, pos, items, apps, vars, fvars, fdays] = await Promise.all([
    loadSettings(me.org_id), rows(fdb.from('job_finance').select('*').eq('site_id', siteId)), rows(fdb.from('client_pos').select('po_number').eq('site_id', siteId).order('is_primary', { ascending: false }).order('created_at')),
    rows(fdb.from('fin_contract_items').select('*').eq('site_id', siteId).order('position')), rows(fdb.from('fin_applications').select('*').eq('site_id', siteId).order('number', { ascending: false })),
    rows(fdb.from('variations').select('*').eq('site_id', siteId).eq('approval_status', 'approved').order('created_at')), rows(fdb.from('fin_variations').select('*').eq('site_id', siteId).eq('status', 'agreed').order('seq')),
    rows(fdb.from('fin_dayworks').select('*').eq('site_id', siteId).eq('status', 'approved').order('seq')),
  ]);
  if (!items.filter(isItem).length) return { error: 'Set up the Bill of Quantities first.' };
  const jf = jfR[0] || {}, last = apps.find((a) => a.status !== 'void');
  const lastPct: Row = {}; (last?.lines || []).forEach((l: Row) => { if (isItem(l)) lastPct[l.item_id] = l.pct; });
  const val = appDateFor(jf, st, today().slice(0, 7)) || today();
  const due = addDays(val, daysOr(jf.due_days ?? st.default_due_days, 30));
  const { varRows, dayRows } = registerRows(last, vars, fvars, fdays);
  const row: Row = {
    org_id: me.org_id, site_id: siteId, status: 'draft', valuation_date: val, due_date: due, final_date: addDays(due, daysOr(jf.final_days ?? st.default_final_days, 14)), client_po: pos[0]?.po_number || null,
    lines: items.map((i) => (isItem(i) ? { kind: 'item', item_id: i.id, ref: i.ref || '', description: i.description, qty: i.qty != null ? Number(i.qty) : null, unit: i.unit || '', rate: i.rate != null ? Number(i.rate) : null, value: Number(i.value), pct: lastPct[i.id] != null ? lastPct[i.id] : 0 } : { kind: i.kind, item_id: i.id, ref: i.ref || '', description: i.description })),
    variations: varRows,
    dayworks: dayRows,
    retention_pct: jf.retention_pct != null ? jf.retention_pct : st.default_retention_pct, created_by: me.id,
  };
  // Two people starting at once would pick the same number: the database refuses the second, so take the next one.
  for (let tries = 0; tries < 4; tries++) {
    const top = await rows(fdb.from('fin_applications').select('number').eq('site_id', siteId).order('number', { ascending: false }).limit(1));
    row.number = (top[0]?.number || 0) + 1;
    const r = await fdb.from('fin_applications').insert(row as never).select('id').single();
    if (!r.error) return { id: (r.data as { id: string }).id };
    if (r.error.code !== '23505') return { error: `Save failed — ${r.error.message}` };
  }
  return { error: 'Could not number the application — try again.' };
}
export async function loadApplication(id: string) {
  const a = (await fdb.from('fin_applications').select('*').eq('id', id).maybeSingle()).data as Row | null;
  if (!a) return null;
  const [jf, apps] = await Promise.all([fdb.from('job_finance').select('*').eq('site_id', a.site_id).maybeSingle(), rows(fdb.from('fin_applications').select('number,status,cert_net,net_due,lines,cert_lines,variations').eq('site_id', a.site_id))]);
  const j = (jf.data as Row | null) || {}, previousLive = previousCertified(apps, a.number);
  // Each line's % on the last certificate, for the Previous / This time figures (9219r).
  const prevPct = appDoc(a, j, apps).prevPct;
  const siteProgress = await loadSiteProgress(a.site_id);
  if (a.status === 'draft') {
    const [vars, fvars, fdays] = await loadRegisters(a.site_id);
    const { varRows, dayRows } = registerRows(a, vars, fvars, fdays);
    const key = (x: Row[]) => JSON.stringify(x.map((r) => [r.fin_variation_id || r.variation_id || r.fin_daywork_id || r.description, Number(r.value || 0), r.pct ?? null]));
    if (key(varRows) !== key(a.variations || []) || key(dayRows) !== key(a.dayworks || [])) {
      const next = { ...a, variations: varRows, dayworks: dayRows };
      const saved = rowForSave(next, j, previousLive);
      if (!(await fdb.from('fin_applications').update(saved as never).eq('id', a.id).eq('status', 'draft')).error) return { a: { ...next, ...saved }, jf: j, previousLive, prevPct, siteProgress, synced: true };
    }
  }
  return { a, jf: j, previousLive, prevPct, siteProgress, synced: false };
}
export function rowForSave(a: Row, jf: Row, previous: number) {
  const c = appCalc(a, jf.contract_value, jf.retention_limit_pct, previous);
  return { valuation_date: a.valuation_date || null, due_date: a.due_date || null, final_date: a.final_date || null, lines: c.lines, variations: c.variations.map((v: Row) => ({ ...v, description: String(v.description || '').trim() })), dayworks: c.dayworks, gross: c.gross, discount_pct: Number(a.discount_pct || 0), discount: c.discount, retention_pct: Number(a.retention_pct || 0), retention: c.retention, previous: c.previous, net_due: c.net_due, updated_at: new Date().toISOString() };
}
export const saveApplication = async (a: Row, jf: Row, previous: number) => !!(await fdb.from('fin_applications').update(rowForSave(a, jf, previous) as never).eq('id', a.id).select('id')).data?.length;
export const setStatus = async (id: string, patch: Row) => !!(await fdb.from('fin_applications').update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', id).select('id')).data?.length;
export const deleteApplication = async (id: string) => !(await fdb.from('fin_applications').delete().eq('id', id).eq('status', 'draft')).error;
export async function saveCertificate(me: Profile, a: Row, v: Row, file?: { uri: string; name: string; mimeType?: string | null } | null): Promise<string | null> {
  const row: Row = { cert_gross: round2(v.cert_gross), cert_retention: round2(v.cert_retention), cert_previous: round2(v.cert_previous), cert_discount: round2(v.cert_discount || 0), cert_net: round2(v.cert_net), cert_date: v.cert_date || today(), cert_is_payless: !!v.cert_is_payless, cert_notes: v.cert_notes || null, status: 'certified', updated_at: new Date().toISOString(), ...(v.cert_lines ? { cert_lines: v.cert_lines } : {}) };
  if (file) {
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${a.site_id}/certificates/${rid}-${file.name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: file.mimeType || 'application/octet-stream' });
    if (!up.error) { row.cert_file_path = up.data.path; row.cert_file_name = file.name; }
  }
  return !(await fdb.from('fin_applications').update(row as never).eq('id', a.id).select('id')).data?.length ? 'Could not save the certificate.' : null;
}
export const clearCertificate = (id: string) => setStatus(id, { cert_net: null, cert_gross: null, cert_retention: null, cert_previous: null, cert_discount: null, cert_lines: null, status: 'submitted' });
/** The invoice for a certificate: its lines ARE the certificate breakdown. Issued straight away when asked. */
export async function raiseInvoiceFromCert(me: Profile, org: Organization | null, a: Row, site: Row | undefined, issueNow: boolean): Promise<{ id?: string; error?: string; needsBill?: boolean }> {
  if (a.invoice_id) return { id: a.invoice_id };
  const [st, jfR, cliR] = await Promise.all([loadSettings(me.org_id), rows(fdb.from('job_finance').select('*').eq('site_id', a.site_id)), rows(fdb.from('fin_clients').select('name,sales_vat').eq('org_id', me.org_id as string))]);
  const jf = jfR[0] || {}, billName = jf.billing_name || site?.client_name || null;
  const c = cliR.find((x) => String(x.name).trim().toLowerCase() === String(billName || '').trim().toLowerCase());
  const map: Record<string, string> = { '20': '20', '5': '5', rc20: 'rc20', rc5: 'rc5', '0': '0', ex: 'ex', none: 'ex' };
  const treat = jf.vat_treatment || st.default_vat || 'standard';
  const lines = certInvoiceLines(a, fdate).map((l) => ({ ...l, vat: (c && map[c.sales_vat]) || vatFromTreatment(treat, 20) }));
  const t = invTotals(lines, treat, 20);
  const r = await fdb.from('fin_invoices').insert({
    org_id: me.org_id, site_id: a.site_id, status: 'draft', issue_date: today(), due_date: a.final_date || addDays(today(), daysOr(jf.due_days ?? st.default_due_days, 30)),
    client_po: a.client_po || null, bill_name: billName, bill_address: jf.billing_address || null, bill_email: jf.billing_email || site?.client_email || null,
    vat_treatment: treat, lines, net: t.net, vat: t.vat, rc_vat: t.vatDue, total: t.total, source: 'certificate', source_id: a.id, created_by: me.id, notes: `Net due: £${Number(a.cert_net).toLocaleString('en-GB', { minimumFractionDigits: 2 })} (excl. VAT) as certified.`,
  } as never).select('*').single();
  const inv = r.data as Row | null;
  if (!inv) return { error: 'Could not raise the invoice.' };
  await setStatus(a.id, { invoice_id: inv.id, status: 'invoiced' });
  if (issueNow && inv.bill_name) { const x = await issue(me, org, inv.id, site); if (x.error) return { id: inv.id, error: x.error }; }
  return { id: inv.id, needsBill: issueNow && !inv.bill_name };
}

/** The invoice that releases one half of the retention (903 raiseRetentionInvoice). Second half = held now less what the first-half invoice released. */
export async function raiseRetentionInvoice(me: Profile, siteId: string, n: 1 | 2, site: Row | undefined): Promise<{ id?: string; error?: string }> {
  const [st, jfR, apps, pos, cli] = await Promise.all([loadSettings(me.org_id), rows(fdb.from('job_finance').select('*').eq('site_id', siteId)), rows(fdb.from('fin_applications').select('number,status,cert_retention,cert_date,valuation_date').eq('site_id', siteId)), rows(fdb.from('client_pos').select('po_number').eq('site_id', siteId).order('is_primary', { ascending: false }).order('created_at')), rows(fdb.from('fin_clients').select('name,sales_vat').eq('org_id', me.org_id as string))]);
  const jf = jfR[0] || {};
  const already = n === 1 ? jf.ret1_invoice_id : jf.ret2_invoice_id;
  if (already) return { id: already };
  const r1inv = n === 2 && jf.ret1_invoice_id ? (((await fdb.from('fin_invoices').select('id,status,net,issue_date').eq('id', jf.ret1_invoice_id).maybeSingle()).data as Row | null) || null) : null;
  const held = retentionHeld(apps as never);
  const invNet = (id: string | null | undefined) => (r1inv && r1inv.id === id && r1inv.status !== 'void' ? round2(r1inv.net) : null);
  let amt: number;
  if (n === 1) amt = retHalf(held, 1);
  else { const r1 = invNet(jf.ret1_invoice_id); const counts = r1 != null ? retentionReleased({ ret1_invoice_id: jf.ret1_invoice_id }, r1inv ? [r1inv as never] : [], apps as never) : 0; amt = r1 != null ? round2(Math.max(0, held - counts)) : retHalf(held, 2); }
  if (!(amt > 0)) return { error: n === 2 && r1inv ? 'Nothing left to release — the first-half invoice already covers all the retention held.' : 'No retention held on this project yet.' };
  const treat = jf.vat_treatment || st.default_vat || 'standard', billName = jf.billing_name || site?.client_name || null;
  const c = cli.find((x) => String(x.name).trim().toLowerCase() === String(billName || '').trim().toLowerCase());
  const map: Record<string, string> = { '20': '20', '5': '5', rc20: 'rc20', rc5: 'rc5', '0': '0', ex: 'ex', none: 'ex' };
  const lines = [{ description: `Release of retention — ${n === 1 ? `first half (practical completion${jf.pc_date ? ` ${fdate(jf.pc_date)}` : ''})` : 'second half (end of defects period)'}`, amount: amt, vat: (c && map[c.sales_vat]) || vatFromTreatment(treat, 20) }];
  const t = invTotals(lines, treat, 20);
  const r = await fdb.from('fin_invoices').insert({ org_id: me.org_id, site_id: siteId, status: 'draft', issue_date: today(), due_date: addDays(today(), daysOr(jf.due_days ?? st.default_due_days, 30)), client_po: pos[0]?.po_number || null, bill_name: billName, bill_address: jf.billing_address || null, bill_email: jf.billing_email || site?.client_email || null, vat_treatment: treat, lines, net: t.net, vat: t.vat, rc_vat: t.vatDue, total: t.total, source: 'retention', created_by: me.id } as never).select('id').single();
  const id = (r.data as Row | null)?.id; if (!id) return { error: 'Could not raise the invoice.' };
  const lk = await fdb.from('job_finance').upsert({ site_id: siteId, org_id: me.org_id, updated_at: new Date().toISOString(), [n === 1 ? 'ret1_invoice_id' : 'ret2_invoice_id']: id } as never, { onConflict: 'site_id' });
  return lk.error ? { id, error: 'Invoice made, but it couldn’t be linked to the retention.' } : { id };
}

/** Release retention through an application (9219zn finApplyRetention): the draft application (or a new
 *  one) gets retention at half the rate for the first release, 0% for the final, so the client pays
 *  it back when they certify. The project remembers which application did it. */
export async function applyRetention(me: Profile, siteId: string, n: 1 | 2): Promise<{ id?: string; number?: number; pct?: number; error?: string }> {
  const [jfR, apps, st] = await Promise.all([rows(fdb.from('job_finance').select('*').eq('site_id', siteId)), rows(fdb.from('fin_applications').select('id,number,status,cert_retention').eq('site_id', siteId).order('number', { ascending: false })), loadSettings(me.org_id)]);
  const jf = jfR[0] || {};
  const basePct = jf.retention_pct != null ? Number(jf.retention_pct) : Number(st.default_retention_pct || 0);
  if (!basePct && !apps.some((a) => Number(a.cert_retention || 0))) return { error: 'No retention is being held on this project.' };
  const pct = n === 1 ? round2(basePct / 2) : 0;
  let app = apps.find((a) => a.status === 'draft');
  if (!app) {
    const r = await newApplication(me, siteId);
    if (r.error || !r.id) return { error: r.error || 'Could not start the application.' };
    app = ((await rows(fdb.from('fin_applications').select('id,number').eq('id', r.id)))[0]) as Row;
  }
  const up = await fdb.from('fin_applications').update({ retention_pct: pct, retention_release: n, updated_at: new Date().toISOString() } as never).eq('id', app.id);
  if (up.error) return { error: 'Could not update the application — try again.' };
  await fdb.from('job_finance').upsert({ site_id: siteId, org_id: me.org_id, updated_at: new Date().toISOString(), updated_by: me.id, ...(n === 1 ? { ret1_app_id: app.id } : { ret2_app_id: app.id }) } as never, { onConflict: 'site_id' });
  return { id: app.id, number: app.number, pct };
}

/** The application as the client document (9219p): Excel (summary sheet + a sheet per header, with a hidden
 *  key column so a valued copy can come back) or PDF, handed over to save or share. */
/** The Schedule of Works report to send with an application as proof of works (9219zo): the whole schedule, or
 *  only the photos since the last application (from the day after its valuation date to this one). */
export type AppSow = { mode: 'full' } | { mode: 'since'; from: string; to: string } | null;
export async function appSowChoice(a: Row): Promise<{ has: boolean; since: { from: string; to: string } | null }> {
  const [t, prev] = await Promise.all([
    fdb.from('schedule_tasks').select('id').eq('site_id', a.site_id).limit(1),
    fdb.from('fin_applications').select('valuation_date').eq('site_id', a.site_id).lt('number', a.number).not('status', 'in', '(draft,void)').order('number', { ascending: false }).limit(1),
  ]);
  const has = ((t.data as Row[] | null) ?? []).length > 0;
  const p = ((prev.data as Row[] | null) ?? [])[0]?.valuation_date as string | undefined;
  const to = String(a.valuation_date || today()).slice(0, 10);
  const from = p ? addDays(String(p).slice(0, 10), 1) : null;
  return { has, since: from && from <= to ? { from, to } : null };
}
export async function exportApplication(me: Profile, org: Organization | null, a: Row, kind: 'xlsx' | 'pdf', sow: AppSow = null): Promise<boolean> {
  const [jfR, apps, siteR, st] = await Promise.all([
    rows(fdb.from('job_finance').select('*').eq('site_id', a.site_id)),
    rows(fdb.from('fin_applications').select('number,status,lines,cert_lines,variations').eq('site_id', a.site_id)),
    rows(fdb.from('sites').select('name,job_number,client_name').eq('id', a.site_id)),
    loadSettings(me.org_id),
  ]);
  const jf = jfR[0] || {}, site = siteR[0] || {};
  const D = appDoc(a, jf, apps, (st as Row).default_vat);
  const info = { company: org?.name || '', client: jf.billing_name || site.client_name || '', project: site.name || '', jobNo: site.job_number || '', valDate: a.valuation_date ? fdate(a.valuation_date) : '' };
  // The Schedule of Works report: added to the end of the PDF, or downloaded beside the Excel.
  let sowBytes: Uint8Array | null = null, sowName = '';
  if (sow) {
    const full = ((await fdb.from('sites').select('*').eq('id', a.site_id).maybeSingle()).data as Site | null);
    const period = sow.mode === 'since' ? sowPeriod('custom', sow.from, sow.to) : null;
    const r = full && period !== 'bad' ? await buildSowPdf(full, org, 'all', period) : null;
    if (r && typeof r !== 'string') { sowBytes = r.bytes; sowName = r.filename; }
  }
  if (kind === 'xlsx') {
    const ok = await deliverXlsx(makeXlsx(appExcelSheets(a, D, info)), appFilename(a, site, 'xlsx'));
    if (ok && sowBytes) await deliverPdf(sowBytes, sowName);
    return ok;
  }
  const appBytes = await buildAppPdf(a, D, { ...info, brand: org?.color_primary });
  if (!sowBytes) return deliverPdf(appBytes, appFilename(a, site, 'pdf'));
  const out = await PDFDocument.load(appBytes), add = await PDFDocument.load(sowBytes);
  (await out.copyPages(add, add.getPageIndices())).forEach((p) => out.addPage(p));
  return deliverPdf(await out.save(), appFilename(a, site, 'pdf'));
}

/** New Bill of Quantities lines from an uploaded Excel (9219n finAppAddLineCore): each goes in under its
 *  header (or at the end), positions renumbered, and the contract value follows the Bill unless it was
 *  typed in. Returns the application lines to add, with where they go. */
export async function addBoqLines(me: Profile, siteId: string, adds: NewBoqLine[]): Promise<{ under: string; line: Row }[] | null> {
  let boq = await rows(fdb.from('fin_contract_items').select('*').eq('site_id', siteId).order('position'));
  const out: { under: string; line: Row }[] = [];
  for (const e of adds) {
    const ins = await fdb.from('fin_contract_items').insert({ org_id: me.org_id, site_id: siteId, position: 0, kind: 'item', ref: e.ref, description: e.desc, qty: e.qty, unit: e.unit, rate: e.rate, value: e.value, cost: null } as never).select('*').single();
    if (ins.error || !ins.data) return out.length ? out : null;
    const b = ins.data as Row;
    let at = boq.length;
    const hi = e.under ? boq.findIndex((x) => x.id === e.under) : -1;
    if (hi >= 0) { at = hi + 1; while (at < boq.length && boq[at].kind !== 'section' && !(boq[hi].kind === 'subsection' && boq[at].kind === 'subsection')) at++; }
    boq = [...boq.slice(0, at), b, ...boq.slice(at)];
    out.push({ under: e.under, line: { kind: 'item', item_id: b.id, ref: b.ref || '', description: b.description, qty: b.qty != null ? Number(b.qty) : null, unit: b.unit || '', rate: b.rate != null ? Number(b.rate) : null, value: Number(b.value || 0), pct: pct(e.pct) } });
  }
  for (let i = 0; i < boq.length; i++) if (boq[i].position !== i) await fdb.from('fin_contract_items').update({ position: i } as never).eq('id', boq[i].id);
  const jf = await fdb.from('job_finance').select('contract_value_source').eq('site_id', siteId).maybeSingle();
  if (!jf.error && (jf.data as Row | null)?.contract_value_source !== 'manual') {
    const total = round2(boq.filter(isItem).reduce((t, x) => t + Number(x.value || 0), 0));
    await fdb.from('job_finance').upsert({ site_id: siteId, org_id: me.org_id, contract_value: total, updated_at: new Date().toISOString(), updated_by: me.id } as never, { onConflict: 'site_id' });
  }
  return out;
}

/** A new header at the end of the Bill of Quantities, for the application to add lines under (9219n). */
export async function addBoqSection(me: Profile, siteId: string, ref: string | null, desc: string): Promise<Row | null> {
  const top = await rows(fdb.from('fin_contract_items').select('position').eq('site_id', siteId).order('position', { ascending: false }).limit(1));
  const r = await fdb.from('fin_contract_items').insert({ org_id: me.org_id, site_id: siteId, position: (Number(top[0]?.position) || 0) + 1, kind: 'section', ref, description: desc, value: 0 } as never).select('*').single();
  return r.error ? null : { kind: 'section', item_id: (r.data as Row).id, ref: ref || '', description: desc };
}

/** Delete an application at any stage (9219q finRowDelApp): not one with an invoice (void it first), and only
 *  the latest — each one builds on the last. Returns why not, or null when deleted. */
export async function deleteApplicationAny(a: Row): Promise<string | null> {
  if (a.invoice_id) return 'This application has an invoice — void the invoice first, then delete it.';
  const later = (await rows(fdb.from('fin_applications').select('id,number,status').eq('site_id', a.site_id).gt('number', a.number))).filter((x) => x.status !== 'void');
  if (later.length) return `Delete the later application${later.length > 1 ? 's' : ''} first (No. ${later.map((x) => x.number).sort((p, q) => q - p).join(', ')}) — each one builds on the last.`;
  return !(await fdb.from('fin_applications').delete().eq('id', a.id).select('id')).data?.length ? 'Could not delete — try again.' : null;
}

/** Each Bill of Quantities line's progress on site (918 finSiteProgress): the average of the operatives'
 *  Schedule of Works tasks linked to it (done = 100%). */
export async function loadSiteProgress(siteId: string): Promise<Record<string, number>> {
  const tasks = await rows(fdb.from('schedule_tasks').select('contract_item_id,status,percent_complete').eq('site_id', siteId).not('contract_item_id', 'is', null));
  const acc: Record<string, number[]> = {};
  tasks.forEach((t) => { const p = t.status === 'done' ? 100 : Math.max(0, Math.min(100, Number(t.percent_complete || 0))); (acc[t.contract_item_id] ||= []).push(p); });
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, round2(v.reduce((x, y) => x + y, 0) / v.length)]));
}
