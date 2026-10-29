// Applications for payment (902 / 903 / 9219p): a new application from the
// Bill of Quantities (last % carried forward, agreed variations, approved day
// works), saving, Applied (locked) / back to draft, the client's certificate,
// and the invoice raised from it.
import { issue } from '@/data/finInvoice';
import { fdb, loadSettings } from '@/data/finance';
import { appCalc, certInvoiceLines, isItem, previousCertified } from '@/lib/rules/finApp';
import { addDays, appDateFor, fdate, retentionHeld, retentionReleased, retHalf, round2, today } from '@/lib/rules/finance';
import { invTotals, vatFromTreatment } from '@/lib/rules/finInvoice';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile } from '@/lib/types';

type Row = Record<string, any>;
const rows = async (q: PromiseLike<{ data: unknown }>) => ((await q).data as Row[] | null) ?? [];

export async function newApplication(me: Profile, siteId: string): Promise<{ id?: string; error?: string }> {
  const [st, jfR, pos, items, apps, vars, fvars, fdays] = await Promise.all([
    loadSettings(me.org_id), rows(fdb.from('job_finance').select('*').eq('site_id', siteId)), rows(fdb.from('client_pos').select('po_number').eq('site_id', siteId).order('is_primary', { ascending: false }).order('created_at')),
    rows(fdb.from('fin_contract_items').select('*').eq('site_id', siteId).order('position')), rows(fdb.from('fin_applications').select('*').eq('site_id', siteId).order('number', { ascending: false })),
    rows(fdb.from('variations').select('*').eq('site_id', siteId).eq('approval_status', 'approved').order('created_at')), rows(fdb.from('fin_variations').select('*').eq('site_id', siteId).eq('status', 'agreed').order('seq')),
    rows(fdb.from('fin_dayworks').select('*').eq('site_id', siteId).eq('status', 'approved').order('seq')),
  ]);
  if (!items.filter(isItem).length) return { error: 'Set up the Bill of Quantities first.' };
  const jf = jfR[0] || {}, last = apps.find((a) => a.status !== 'void');
  const lastPct: Row = {}; (last?.lines || []).forEach((l: Row) => { if (isItem(l)) lastPct[l.item_id] = l.pct; });
  const lastVar: Row = {}, lastFinVar: Row = {}; (last?.variations || []).forEach((v: Row) => { if (v.variation_id) lastVar[v.variation_id] = v; if (v.fin_variation_id) lastFinVar[v.fin_variation_id] = v; });
  const val = appDateFor(jf, st, today().slice(0, 7)) || today();
  const due = addDays(val, Number(jf.due_days ?? st.default_due_days) || 30);
  const linked = new Set(fvars.map((v) => v.variation_id).filter(Boolean));
  const varRows: Row[] = fvars.map((v) => ({ fin_variation_id: v.id, variation_id: v.variation_id || null, description: `${v.number} ${v.title}`, value: v.agreed_value != null ? Number(v.agreed_value) : Number(v.quoted || 0), pct: lastFinVar[v.id] ? lastFinVar[v.id].pct : 100 }));
  vars.filter((v) => !linked.has(v.id)).forEach((v) => { const p = lastVar[v.id], amt = Number(String(v.cost_impact ?? '').replace(/[£,\s]/g, '')); varRows.push({ variation_id: v.id, description: v.description || 'Variation', value: p ? p.value : isNaN(amt) ? 0 : amt, pct: p ? p.pct : 100 }); });
  (last?.variations || []).filter((v: Row) => !v.variation_id && !v.fin_variation_id).forEach((v: Row) => varRows.push({ ...v }));
  const row: Row = {
    org_id: me.org_id, site_id: siteId, status: 'draft', valuation_date: val, due_date: due, final_date: addDays(due, Number(jf.final_days ?? st.default_final_days) || 14), client_po: pos[0]?.po_number || null,
    lines: items.map((i) => (isItem(i) ? { kind: 'item', item_id: i.id, ref: i.ref || '', description: i.description, qty: i.qty != null ? Number(i.qty) : null, unit: i.unit || '', rate: i.rate != null ? Number(i.rate) : null, value: Number(i.value), pct: lastPct[i.id] != null ? lastPct[i.id] : 0 } : { kind: i.kind, item_id: i.id, ref: i.ref || '', description: i.description })),
    variations: varRows,
    dayworks: fdays.map((d) => ({ fin_daywork_id: d.id, description: `${d.number ? `${d.number} ` : ''}${d.title}`, value: Number(d.value || 0) })).concat((last?.dayworks || []).filter((d: Row) => !d.fin_daywork_id).map((d: Row) => ({ ...d }))),
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
  const [jf, apps] = await Promise.all([fdb.from('job_finance').select('*').eq('site_id', a.site_id).maybeSingle(), rows(fdb.from('fin_applications').select('number,status,cert_net,net_due').eq('site_id', a.site_id))]);
  return { a, jf: (jf.data as Row | null) || {}, previousLive: previousCertified(apps, a.number) };
}
export function rowForSave(a: Row, jf: Row, previous: number) {
  const c = appCalc(a, jf.contract_value, jf.retention_limit_pct, previous);
  return { valuation_date: a.valuation_date || null, due_date: a.due_date || null, final_date: a.final_date || null, lines: c.lines, variations: c.variations.map((v: Row) => ({ ...v, description: String(v.description || '').trim() })), dayworks: c.dayworks, gross: c.gross, discount_pct: Number(a.discount_pct || 0), discount: c.discount, retention_pct: Number(a.retention_pct || 0), retention: c.retention, previous: c.previous, net_due: c.net_due, updated_at: new Date().toISOString() };
}
export const saveApplication = async (a: Row, jf: Row, previous: number) => !(await fdb.from('fin_applications').update(rowForSave(a, jf, previous) as never).eq('id', a.id)).error;
export const setStatus = async (id: string, patch: Row) => !(await fdb.from('fin_applications').update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', id)).error;
export const deleteApplication = async (id: string) => !(await fdb.from('fin_applications').delete().eq('id', id).eq('status', 'draft')).error;
export async function saveCertificate(me: Profile, a: Row, v: Row, file?: { uri: string; name: string; mimeType?: string | null } | null): Promise<string | null> {
  const row: Row = { cert_gross: round2(v.cert_gross), cert_retention: round2(v.cert_retention), cert_previous: round2(v.cert_previous), cert_discount: round2(v.cert_discount || 0), cert_net: round2(v.cert_net), cert_date: v.cert_date || today(), cert_is_payless: !!v.cert_is_payless, cert_notes: v.cert_notes || null, status: 'certified', updated_at: new Date().toISOString() };
  if (file) {
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${a.site_id}/certificates/${rid}-${file.name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: file.mimeType || 'application/octet-stream' });
    if (!up.error) { row.cert_file_path = up.data.path; row.cert_file_name = file.name; }
  }
  return (await fdb.from('fin_applications').update(row as never).eq('id', a.id)).error ? 'Could not save the certificate.' : null;
}
export const clearCertificate = (id: string) => setStatus(id, { cert_net: null, cert_gross: null, cert_retention: null, cert_previous: null, cert_discount: null, cert_lines: null, status: 'submitted' });
/** The invoice for a certificate: its lines ARE the certificate breakdown. Issued straight away when asked. */
export async function raiseInvoiceFromCert(me: Profile, org: Organization | null, a: Row, site: Row | undefined, issueNow: boolean): Promise<{ id?: string; error?: string }> {
  if (a.invoice_id) return { id: a.invoice_id };
  const [st, jfR, cliR] = await Promise.all([loadSettings(me.org_id), rows(fdb.from('job_finance').select('*').eq('site_id', a.site_id)), rows(fdb.from('fin_clients').select('name,sales_vat').eq('org_id', me.org_id as string))]);
  const jf = jfR[0] || {}, billName = jf.billing_name || site?.client_name || null;
  const c = cliR.find((x) => String(x.name).trim().toLowerCase() === String(billName || '').trim().toLowerCase());
  const map: Record<string, string> = { '20': '20', '5': '5', rc20: 'rc20', rc5: 'rc5', '0': '0', ex: 'ex', none: 'ex' };
  const treat = jf.vat_treatment || st.default_vat || 'standard';
  const lines = certInvoiceLines(a, fdate).map((l) => ({ ...l, vat: (c && map[c.sales_vat]) || vatFromTreatment(treat, 20) }));
  const t = invTotals(lines, treat, 20);
  const r = await fdb.from('fin_invoices').insert({
    org_id: me.org_id, site_id: a.site_id, status: 'draft', issue_date: today(), due_date: a.final_date || addDays(today(), Number(jf.due_days ?? st.default_due_days) || 30),
    client_po: a.client_po || null, bill_name: billName, bill_address: jf.billing_address || null, bill_email: jf.billing_email || site?.client_email || null,
    vat_treatment: treat, lines, net: t.net, vat: t.vat, rc_vat: t.vatDue, total: t.total, source: 'certificate', source_id: a.id, created_by: me.id, notes: `Net due: £${Number(a.cert_net).toLocaleString('en-GB', { minimumFractionDigits: 2 })} (excl. VAT) as certified.`,
  } as never).select('*').single();
  const inv = r.data as Row | null;
  if (!inv) return { error: 'Could not raise the invoice.' };
  await setStatus(a.id, { invoice_id: inv.id, status: 'invoiced' });
  if (issueNow && inv.bill_name) { const x = await issue(me, org, inv.id, site); if (x.error) return { id: inv.id, error: x.error }; }
  return { id: inv.id };
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
  const r = await fdb.from('fin_invoices').insert({ org_id: me.org_id, site_id: siteId, status: 'draft', issue_date: today(), due_date: addDays(today(), Number(jf.due_days ?? st.default_due_days) || 30), client_po: pos[0]?.po_number || null, bill_name: billName, bill_address: jf.billing_address || null, bill_email: jf.billing_email || site?.client_email || null, vat_treatment: treat, lines, net: t.net, vat: t.vat, rc_vat: t.vatDue, total: t.total, source: 'retention', created_by: me.id } as never).select('id').single();
  const id = (r.data as Row | null)?.id; if (!id) return { error: 'Could not raise the invoice.' };
  const lk = await fdb.from('job_finance').upsert({ site_id: siteId, org_id: me.org_id, updated_at: new Date().toISOString(), [n === 1 ? 'ret1_invoice_id' : 'ret2_invoice_id']: id } as never, { onConflict: 'site_id' });
  return lk.error ? { id, error: 'Invoice made, but it couldn’t be linked to the retention.' } : { id };
}
