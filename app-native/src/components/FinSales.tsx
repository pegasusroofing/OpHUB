// Sales lists (9219 renderFinSales): applications & certificates, invoices,
// retention — for the whole company or one project (siteId).
// Phone (Andy, 14 Nov 2026): the tables sort by tapping a heading and have a search box under each, the status a ▾ choice
// under the amount (starting on In Progress / Owed as the Filter did); no Filter / Sort buttons or search bar above.
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { askDate, DateBox } from '@/components/DateField';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { FinRow, FinStat } from '@/components/FinNav';
import { useFinRowMenu } from '@/components/FinRowMenu';
import { Cell, FinChoicePop, FinTable, FootPick } from '@/components/FinTable';
import { PhoneTable } from '@/components/PhoneTable';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, Toggle } from '@/components/ui';
import { raiseInvoiceFromCert } from '@/data/finApp';
import { fdb, selectAll, useFinSettings } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { byJobNoDesc, fdate, INV_STATUS, invOutstanding, invOutstandingNet, invOverdue, jobTag, money, retentionDates, retentionStillHeld, round2, type FinApp, type FinInv, type JobFin } from '@/lib/rules/finance';
import { monthLabel, monthOf, monthsIn } from '@/lib/rules/finFilters';
import { inPeriod, useStatPeriods } from '@/lib/useStatPeriods';
import { base, useDesk } from '@/theme/theme';

export type App = FinApp & { id: string; site_id: string; due_date?: string | null; gross?: number | null; net_due?: number | null; cert_gross?: number | null; cert_net?: number | null; cert_is_payless?: boolean | null; invoice_id?: string | null; submitted_at?: string | null; created_at?: string };
export type Inv = FinInv & { bill_name?: string | null; bill_address?: string | null; net?: number | null; vat?: number | null; rc_vat?: number | null; xero_id?: string | null; xero_post?: boolean | null; created_at?: string; kind?: string | null; lines?: { description?: string; amount?: number | string | null }[] | null; created_by?: string | null; updated_at?: string };
export function appStage(a: App) {
  if (a.status === 'void') return { k: 'void', l: 'Void', c: '#7A7F87' };
  if (a.invoice_id) return { k: 'invoiced', l: 'Invoiced', c: '#1E7A3C' };
  if (a.cert_net != null) return a.cert_is_payless ? { k: 'certified', l: 'Pay less notice', c: '#C0392B' } : { k: 'certified', l: 'Certified', c: '#D98A00' };
  if (a.status === 'submitted') return { k: 'submitted', l: 'Waiting for certificate', c: '#2F6FB3' };
  return { k: 'draft', l: 'Draft', c: '#7A7F87' };
}
const emptyDraft = (i: Inv) => i.status === 'draft' && !i.number && (i.lines || []).every((l) => !String(l.description || '').trim() && (l.amount == null || l.amount === ''));

export function useSales(orgId: string | null | undefined, siteId?: string) {
  return useQuery({
    queryKey: ['finSales', orgId, siteId || ''], enabled: !!orgId,
    queryFn: async () => {
      const f = (q: Parameters<Parameters<typeof selectAll>[2]>[0]) => (siteId ? q.eq('site_id', siteId) : q.eq('org_id', orgId as string));
      const [invs, apps, jf] = await Promise.all([
        selectAll<Inv>('fin_invoices', '*', f),
        selectAll<App>('fin_applications', 'id,site_id,number,status,valuation_date,due_date,final_date,gross,net_due,cert_date,cert_gross,cert_net,cert_retention,cert_is_payless,invoice_id,submitted_at,created_at', f),
        selectAll<JobFin & { site_id: string }>('job_finance', '*', f),
      ]);
      // Old empty drafts are hidden (not deleted).
      const age = (i: Inv) => Date.now() - Date.parse(i.updated_at || i.created_at || '');
      return { invs: invs.filter((i) => !(emptyDraft(i) && age(i) > 7 * 864e5)).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))), apps: apps.sort((a, b) => String(b.valuation_date || '').localeCompare(String(a.valuation_date || ''))), jf };
    },
  });
}
/** Pick a project, then go somewhere with it (finPickJob). */
export async function pickJob(title: string, sites: { id: string; name: string; job_number?: string | null }[]): Promise<string | null> {
  return chooseAction(`${title} — which project?`, sites.slice().sort(byJobNoDesc).map((s) => ({ key: s.id, label: jobTag(s) })));
}

/** A retention release date as the calendar date box (every date is a calendar); "(claimed)" once applied for or invoiced (9219zh). */
function RetDateBox({ d, claimed, label, onPick }: { d?: string | null; claimed: boolean; label: string; onPick: (iso: string) => void }) {
  return (
    <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: 2 }}>
      <DateBox value={d || null} title={label} clearable={false} onChange={(iso) => { if (iso) onPick(iso); }} style={{ alignSelf: 'stretch', paddingVertical: 6, paddingHorizontal: 8 }} />
      {claimed ? <Text style={{ fontSize: 11, color: base.slate }}>(claimed)</Text> : null}
    </View>
  );
}
/** + New Application / + New Invoice in the Sales tab row (Andy, 5 Nov 2026): pick the project, then the new one. */
export function NewSalesButton({ what }: { what: 'invoice' | 'application' }) {
  const { data: sites = [] } = useSites();
  return <Button small title={what === 'invoice' ? '+ New Invoice' : '+ New Application'} onPress={async () => { const sid = await pickJob(what === 'invoice' ? 'New invoice' : 'New application', sites.filter((s) => s.status !== 'closed')); if (sid) router.push(`/fin/job/${sid}/${what}/new` as never); }} />;
}
export function SalesLists({ tab, siteId, f: f0 }: { tab: 'apps' | 'invoices' | 'retention'; siteId?: string; f?: string }) {
  const qcRet = useQueryClient();
  const setRetDate = async (sid: string, n: 1 | 2, jf: JobFin, picked?: string) => {
    const v = picked || (await askDate(n === 1 ? 'Practical completion date' : 'Final retention release date')); if (!v) return;
    const patch: Record<string, unknown> = n === 1 ? { pc_date: v } : { final_release_date: v };
    const pc = (jf as { pc_date?: string | null }).pc_date;
    // Keep the project's defects period in step, so Project Admin shows the same final date.
    if (n === 2 && pc) { const m = Math.round((new Date(`${v}T12:00:00`).getTime() - new Date(`${pc}T12:00:00`).getTime()) / (864e5 * 30.44)); if (m >= 0 && m <= 120) patch.defects_months = m; }
    const r = await fdb.from('job_finance').upsert({ site_id: sid, org_id: me?.org_id, updated_at: new Date().toISOString(), updated_by: me?.id, ...patch } as never, { onConflict: 'site_id' });
    if (r.error) { toastRet('Not saved — try again.'); return; }
    toastRet(`${n === 1 ? 'Practical completion' : 'Final retention release'} date saved to the project`);
    ['finSales', 'finBook', 'finOverview'].forEach((k) => void qcRet.invalidateQueries({ queryKey: [k] }));
  };
  const toastRet = useToast();
  const { me, org } = useAuth();
  const { data: sitesRaw = [] } = useSites();
  const { data: st } = useFinSettings(me?.org_id);
  const { data } = useSales(me?.org_id, siteId);
  // Filter: status, month and project, tick as many as you like. An application list with nothing chosen yet starts on the first group with anything in it.
  const sort = 'new';
  const rowMenu = useFinRowMenu(data?.invs);
  const [voidOpen, setVoidOpen] = useState(false); // voided invoices sit in a closed drop-down (9219zn)
  // Laptop: the current app's "All months" picker on the totals bar (9219 sales tables; cmp-fin 5 Nov 2026).
  const [deskMon, setDeskMon] = useState('');
  const [monAt, setMonAt] = useState<{ x: number; y: number } | null>(null);
  const monthPick = (months: string[]) => (
    <>
      <FootPick label={deskMon ? monthLabel(deskMon) : 'All months'} onPress={(x, y) => setMonAt({ x, y })} />
      <FinChoicePop at={monAt} value={deskMon} options={[['', 'All months'], ...months.map((m) => [m, monthLabel(m)] as [string, string])]} onPick={setDeskMon} onClose={() => setMonAt(null)} />
    </>
  );
  const desk = useDesk();
  // On a laptop the table's own headings sort and filter, so the Filter / Sort bar is for phones only (Andy, 3 Nov 2026).
  const bare = desk;
  const sites = sitesRaw as (typeof sitesRaw[number] & { job_number?: string | null; client_name?: string | null })[];
  const site = (id: string) => sites.find((s) => s.id === id);
  const billTo = (i: Inv) => i.bill_name || site(i.site_id)?.client_name || '';
  const addr1 = (i: Inv) => String(i.bill_address || '').split(/\n|,/).map((x) => x.trim()).filter(Boolean).slice(0, 2).join(', ');
  const xeroOn = !!(st as { xero_tenant_name?: string | null } | null | undefined)?.xero_tenant_name;
  const xeroTag = (i: Inv) => i.status === 'draft' || i.status === 'void' ? '' : i.xero_id ? 'Xero ✓' : i.xero_post === false ? 'Not for Xero' : xeroOn ? 'To post' : '';
  const raise = async (a: App) => {
    if (!me || !(await confirmAsk(`Raise a draft invoice for this certificate (${money(a.cert_net)} net)? It opens for you to check before issuing.`, 'Raise draft'))) return;
    const r = await raiseInvoiceFromCert(me, org, a, site(a.site_id) as never, false);
    if (r.error) { toastRet(r.error); return; }
    ['finSales', 'finBook', 'finOverview'].forEach((k) => void qcRet.invalidateQueries({ queryKey: [k] }));
    if (r.id) router.push(`/fin/job/${a.site_id}/invoice/${r.id}` as never);
  };
  // No search bar: the laptop table's headings filter (Andy, 3 Nov 2026), and a phone's table has a box under each heading
  // (Andy, 14 Nov 2026).
  const ql = '';
  if (!data) return <Muted>Loading…</Muted>;
  const live = data.invs.filter((i) => i.status !== 'void');
  const stage = (a: App) => appStage(a).k;
  const newFor = async (what: 'invoice' | 'application') => {
    const sid = siteId || (await pickJob(what === 'invoice' ? 'New invoice' : 'New application', sites.filter((s) => s.status !== 'closed')));
    if (sid) router.push(`/fin/job/${sid}/${what}/new` as never);
  };
  if (tab === 'apps') {
    const F: Record<string, (a: App) => boolean> = { open: (a) => ['draft', 'submitted'].includes(stage(a)), certified: (a) => stage(a) === 'certified', invoiced: (a) => stage(a) === 'invoiced', all: (a) => stage(a) !== 'void' };
    const first = ['open', 'certified', 'invoiced'].find((k) => data.apps.filter(F[k]).length);
    const sel: { status: string[]; mon: string[]; job: string[] } = { status: [], mon: bare && deskMon ? [deskMon] : [], job: [] };
    const aMonth = (a: App) => monthOf(a.valuation_date);
    const sorter: Record<string, (x: App, y: App) => number> = { new: (x, y) => String(y.valuation_date || '').localeCompare(String(x.valuation_date || '')), old: (x, y) => String(x.valuation_date || '').localeCompare(String(y.valuation_date || '')), big: (x, y) => Number(y.cert_net ?? y.net_due ?? 0) - Number(x.cert_net ?? x.net_due ?? 0), job: (x, y) => jobTag(site(x.site_id)).localeCompare(jobTag(site(y.site_id))) };
    const list = data.apps.filter(F.all).filter((a) => !sel.status.length || sel.status.some((k) => F[k](a))).filter((a) => !sel.mon.length || sel.mon.includes(aMonth(a))).filter((a) => !sel.job.length || sel.job.includes(a.site_id)).filter((a) => !ql || `${a.number} ${jobTag(site(a.site_id))} ${site(a.site_id)?.client_name || ''}`.toLowerCase().includes(ql)).slice().sort(sorter[sort]);
    const months = monthsIn(data.apps.filter(F.all), aMonth);
    return (
      <View>
        {/* No text under the tabs; + New full width above the search (Andy, 11 Nov 2026). */}
        <View style={{ marginBottom: 10 }}><Button title="+ New Application" onPress={() => void newFor('application')} /></View>
        {desk && list.length ? (
          <FinTable rows={list} keyOf={(a) => a.id} onMenu={(a) => void rowMenu.appMenu(a, stage(a))} onRow={(a) => router.push(`/fin/job/${a.site_id}/application/${a.id}` as never)}
            cols={[
              ...(siteId ? [] : [{ k: 'p', l: 'Project', flex: 1.8, min: 180, render: (a: App) => <Cell bold>{jobTag(site(a.site_id))}</Cell> }]),
              { k: 'n', l: 'Application', render: (a: App) => <Cell>{a.cert_net != null || a.invoice_id ? 'Certificate' : 'Application'} {a.number}</Cell> },
              { k: 'd', l: 'Date', date: (a: App) => a.valuation_date, sort: (a: App) => String(a.valuation_date || ''), render: (a: App) => <Cell>{fdate(a.valuation_date)}</Cell> },
              { k: 'ap', l: 'Applied (Net)', total: (l: App[]) => money(l.reduce((t, a) => t + Number(a.net_due || 0), 0)), render: (a: App) => <Cell>{money(a.net_due)}</Cell> },
              { k: 'ce', l: 'Certified (Net)', total: (l: App[]) => money(l.reduce((t, a) => t + Number(a.cert_net || 0), 0)), render: (a: App) => { const short = a.cert_net != null ? round2(Number(a.cert_net) - Number(a.net_due || 0)) : 0; return <View style={{ alignItems: 'center' }}><Cell>{a.cert_net != null ? money(a.cert_net) : '—'}</Cell>{short < -0.009 ? <Text style={{ fontSize: 11, color: '#C0392B' }}>{money(-short)} short</Text> : null}</View>; } },
              { k: 'st', l: 'Stage', noSort: true, choices: ['Draft', 'Waiting for certificate', 'Certified', 'Invoiced', 'Pay less notice'], render: (a: App) => { const s = appStage(a); return <Text style={{ fontSize: 10.5, fontWeight: '600', color: s.c, backgroundColor: `${s.c}1A`, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden', textAlign: 'center' }}>● {s.l}</Text>; } },
              { k: 'inv', l: 'Invoice', render: (a: App) => { const inv = data.invs.find((i) => i.id === a.invoice_id); return inv ? <Text accessibilityRole="link" onPress={() => router.push(`/fin/job/${a.site_id}/invoice/${inv.id}` as never)} style={{ fontSize: 12.5, fontWeight: '500', color: base.blue }}>{inv.number || 'Draft'}</Text> : appStage(a).k === 'certified' ? <Text accessibilityRole="button" onPress={() => void raise(a)} style={{ fontSize: 12.5, fontWeight: '500', color: base.blue, textAlign: 'center' }}>Raise Invoice</Text> : <Cell>—</Cell>; } },
            ]}
            footLabel={(list) => `${list.length} application${list.length === 1 ? '' : 's'}`} footRight={siteId ? undefined : monthPick(months)} />
        ) : list.length ? (
          <PhoneTable key="apps" label="Applications" rows={list} keyOf={(a) => a.id} onRow={(a) => router.push(`/fin/job/${a.site_id}/application/${a.id}` as never)}
            cols={[
              { l: 'App', w: 52, main: (a) => `${a.number}`, sub: (a) => fdate(a.valuation_date), sort: (a) => Number(a.number) || 0 },
              { l: siteId ? 'Stage' : 'Project', main: (a) => (siteId ? appStage(a).l : jobTag(site(a.site_id))), sub: (a) => (siteId ? '' : appStage(a).l), find: (a) => `${jobTag(site(a.site_id))} ${site(a.site_id)?.client_name || ''} ${appStage(a).l}` },
              { l: 'Amount', w: 88, right: true, headCenter: true, bold: true, bigFirst: true, main: (a) => money(a.cert_net ?? a.net_due), sub: (a) => (a.cert_net != null ? 'Certified' : 'Applied'), sort: (a) => Number(a.cert_net ?? a.net_due ?? 0),
                choose: { opts: [['', 'All'], ['open', 'In Progress'], ['certified', 'Certified'], ['invoiced', 'Invoiced']], test: (a, v) => (F[v] ? F[v](a) : true), start: f0 === 'all' ? '' : f0 || first || '' } },
            ]} />
        ) : <Empty>Nothing here.</Empty>}
        {rowMenu.form}
      </View>
    );
  }
  if (tab === 'invoices') {
    const F: Record<string, (i: Inv) => boolean> = { outstanding: (i) => invOutstanding(i) > 0, overdue: (i) => invOverdue(i), draft: (i) => i.status === 'draft', paid: (i) => i.status === 'paid', all: () => true };
    const iMonth = (i: Inv) => monthOf(i.issue_date || i.created_at);
    const sel: { status: string[]; mon: string[]; job: string[] } = { status: [], mon: bare && deskMon ? [deskMon] : [], job: [] };
    const sorter: Record<string, (x: Inv, y: Inv) => number> = { new: () => 0, old: (x, y) => String(x.created_at || '').localeCompare(String(y.created_at || '')), big: (x, y) => Number(y.total || 0) - Number(x.total || 0), client: (x, y) => billTo(x).localeCompare(billTo(y)) };
    const list = live.filter((i) => !sel.status.length || sel.status.some((k) => (F[k] || F.outstanding)(i))).filter((i) => !sel.mon.length || sel.mon.includes(iMonth(i))).filter((i) => !sel.job.length || sel.job.includes(i.site_id)).filter((i) => !ql || `${i.number || ''} ${billTo(i)} ${i.bill_address || ''} ${jobTag(site(i.site_id))}`.toLowerCase().includes(ql)).slice().sort(sorter[sort]);
    const months = monthsIn(live, iMonth);
    return (
      <View>
        <View style={{ marginBottom: 10 }}><Button title="+ New Invoice" onPress={() => void newFor('invoice')} /></View>
        {desk && list.length ? (
          // Starts on the owed ones, as the current app's Owed chip (9219 sales tables; cmp-fin 5 Nov 2026). Untick to see paid and drafts.
          <FinTable startFilter={f0 === 'overdue' ? { s: ['Overdue'] } : siteId ? undefined : { s: ['Issued', 'Sent', 'Part paid', 'Overdue'] }} rows={list} keyOf={(i) => i.id} onMenu={(i) => void rowMenu.invMenu(i)} onRow={(i) => router.push(`/fin/job/${i.site_id}/invoice/${i.id}` as never)}
            cols={[
              { k: 'no', l: 'Invoice', render: (i: Inv) => <Cell bold>{i.number || 'Draft'}</Cell> },
              { k: 'c', l: 'Client', flex: 1.4, min: 130, render: (i: Inv) => <View style={{ alignItems: 'center' }}><Cell>{billTo(i) || '—'}</Cell>{addr1(i) ? <Text numberOfLines={1} style={{ fontSize: 11, color: base.slate }}>{addr1(i)}</Text> : null}</View> },
              ...(siteId ? [] : [{ k: 'p', l: 'Project', flex: 1.6, min: 150, render: (i: Inv) => <Cell>{jobTag(site(i.site_id))}</Cell> }]),
              { k: 'd', l: 'Date', min: 76, date: (i: Inv) => (i.status === 'draft' ? '' : i.issue_date), sort: (i: Inv) => String(i.issue_date || ''), render: (i: Inv) => <Cell>{i.status === 'draft' ? 'Not issued' : i.issue_date ? fdate(i.issue_date) : '—'}</Cell> },
              { k: 'du', l: 'Due', min: 76, date: (i: Inv) => (i.status === 'draft' ? '' : i.due_date), sort: (i: Inv) => String(i.due_date || ''), render: (i: Inv) => <Cell tone={invOverdue(i) ? '#C0392B' : undefined}>{i.status === 'draft' || !i.due_date ? '—' : fdate(i.due_date)}</Cell> },
              { k: 'n', l: 'Net', min: 76, total: (l: Inv[]) => money(l.reduce((t, i) => t + Number(i.net || 0), 0)), render: (i: Inv) => <Cell>{money(i.net)}</Cell> },
              { k: 'v', l: 'VAT', min: 70, total: (l: Inv[]) => money(l.reduce((t, i) => t + Number(i.vat || 0), 0)), render: (i: Inv) => <View style={{ alignItems: 'center' }}><Cell>{money(i.vat)}</Cell>{Number(i.rc_vat || 0) ? <Text style={{ fontSize: 11, color: base.slate }}>RC {money(i.rc_vat)}</Text> : null}</View> },
              { k: 't', l: 'Gross', min: 80, total: (l: Inv[]) => money(l.reduce((t, i) => t + Number(i.total || 0), 0)), render: (i: Inv) => { const o = invOutstanding(i); return <View style={{ alignItems: 'center' }}><Cell bold>{money(i.total)}</Cell>{o > 0 && o < Number(i.total) ? <Text style={{ fontSize: 11, color: base.slate }}>{money(o)} owed</Text> : null}</View>; } },
              { k: 's', l: 'Status', min: 76, noSort: true, choices: ['Draft', 'Issued', 'Sent', 'Part paid', 'Paid', 'Overdue'], render: (i: Inv) => <View style={{ alignItems: 'center' }}>{(() => { const c = invOverdue(i) ? '#C0392B' : i.status === 'paid' ? '#1E7A43' : i.status === 'draft' ? '#6b7280' : i.status === 'part_paid' ? '#B35A00' : '#1d4ed8'; return <Text style={{ fontSize: 10.5, fontWeight: '600', color: c, backgroundColor: `${c}1A`, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, overflow: 'hidden' }}>● {invOverdue(i) ? 'Overdue' : INV_STATUS[i.status] || i.status}</Text>; })()}{xeroTag(i) ? <Text style={{ fontSize: 10.5, color: base.slate }}>{xeroTag(i)}</Text> : null}</View> },
            ]}
            footLabel={(list) => `${list.length} invoice${list.length === 1 ? '' : 's'} · Owed ${money(list.reduce((t, i) => t + invOutstandingNet(i), 0))}`} footRight={siteId ? undefined : monthPick(months)} />
        ) : list.length ? (
          <PhoneTable key="invoices" label="Invoices" rows={list} keyOf={(i) => i.id} onRow={(i) => router.push(`/fin/job/${i.site_id}/invoice/${i.id}` as never)}
            cols={[
              { l: 'Invoice', w: 74, main: (i) => i.number || 'Draft', sub: (i) => (i.issue_date ? fdate(i.issue_date) : 'Not issued'), sort: (i) => String(i.issue_date || '') },
              { l: siteId ? 'Client' : 'Project', main: (i) => (siteId ? billTo(i) || '—' : jobTag(site(i.site_id))), sub: (i) => (siteId ? '' : billTo(i)), find: (i) => `${jobTag(site(i.site_id))} ${billTo(i)} ${i.bill_address || ''}` },
              { l: 'Gross', w: 84, right: true, bold: true, bigFirst: true, main: (i) => money(i.total), sub: (i) => (invOverdue(i) ? 'Overdue' : INV_STATUS[i.status] || i.status), tone: (i) => (invOverdue(i) ? '#C0392B' : undefined), sort: (i) => Number(i.total || 0),
                choose: { opts: [['', 'All'], ['outstanding', 'Owed'], ['overdue', 'Overdue'], ['draft', 'Drafts'], ['paid', 'Paid']], test: (i, v) => (F[v] ? F[v](i) : true), start: f0 === 'all' ? '' : f0 || 'outstanding' } },
            ]} />
        ) : <Empty>No invoices here.</Empty>}
        {rowMenu.form}
        {(() => {
          const voided = data.invs.filter((i) => i.status === 'void' && (!sel.mon.length || sel.mon.includes(iMonth(i))) && (!ql || `${i.number || ''} ${billTo(i)} ${i.bill_address || ''} ${jobTag(site(i.site_id))}`.toLowerCase().includes(ql)));
          if (!voided.length) return null;
          return (
            <View style={{ marginTop: 10 }}>
              <Toggle title={`Voided invoices (${voided.length})`} open={voidOpen} onPress={() => setVoidOpen(!voidOpen)} />
              {voidOpen && voided.map((i) => <FinRow key={i.id} left={i.number || 'Draft'} title={siteId ? (billTo(i) || '—') : jobTag(site(i.site_id))} sub={[siteId ? '' : billTo(i), i.issue_date ? fdate(i.issue_date) : '', 'Void'].filter(Boolean).join(' · ')} right={money(i.total)} onPress={() => router.push(`/fin/job/${i.site_id}/invoice/${i.id}` as never)} />)}
            </View>
          );
        })()}
      </View>
    );
  }
  // retention
  const jfBy: Record<string, JobFin> = {}; data.jf.forEach((r) => { jfBy[r.site_id] = r; });
  const appsBy: Record<string, App[]> = {}; data.apps.forEach((a) => { (appsBy[a.site_id] = appsBy[a.site_id] || []).push(a); });
  const rows = sites.filter((s) => !siteId || s.id === siteId).map((s) => ({ s, held: retentionStillHeld(appsBy[s.id] || [], jfBy[s.id], data.invs), jf: jfBy[s.id] || {} })).filter((x) => x.held)
    .filter((x) => !ql || `${jobTag(x.s)} ${x.s.client_name || ''}`.toLowerCase().includes(ql));
  const total = round2(rows.reduce((t, x) => t + x.held, 0));
  // The next release date for a job, as words: the dates themselves are set on the project (Andy, 11 Nov 2026).
  const nextRelease = (x: (typeof rows)[number]) => { const d = retentionDates(x.jf, st || {}); const one = !(x.jf.ret1_invoice_id || x.jf.ret1_app_id) && d.first ? d.first : null; const two = !(x.jf.ret2_invoice_id || x.jf.ret2_app_id) && d.second ? d.second : null; const n = one || two; return n ? fdate(n) : 'Not Set'; };
  return (
    <View>
      {desk && rows.length ? (
        <FinTable rows={rows} keyOf={(x) => x.s.id} onRow={(x) => router.push(`/fin/job/${x.s.id}?tab=setup` as never)}
          cols={[
            { k: 'p', l: 'Project', flex: 1.8, min: 180, render: (x) => <Cell bold>{jobTag(x.s)}</Cell> },
            { k: 'c', l: 'Client', flex: 1.4, min: 140, render: (x) => <Cell>{x.s.client_name || '—'}</Cell> },
            { k: 'nx', l: 'Next Release', render: (x) => <Cell>{nextRelease(x)}</Cell> },
            { k: 'h', l: 'Still Held', total: (l) => money(round2(l.reduce((t, x) => t + x.held, 0))), render: (x) => <Cell bold>{money(x.held)}</Cell> },
          ]}
          footLabel={(left) => `${left.length} job${left.length === 1 ? '' : 's'}`} />
      ) : rows.length ? (
        <PhoneTable label="Retention" rows={rows} keyOf={(x) => x.s.id} onRow={(x) => router.push(`/fin/job/${x.s.id}?tab=setup` as never)}
          cols={[
            { l: 'Project', main: (x) => jobTag(x.s), sub: (x) => x.s.client_name || '' },
            { l: 'Next Release', w: 92, main: (x) => nextRelease(x) },
            { l: 'Held', w: 80, right: true, bold: true, main: (x) => money(x.held) },
          ]} />
      ) : <Empty>No retention held.</Empty>}
      {!desk && rows.length > 0 && <Card><Text style={{ fontWeight: '600', color: base.ink }}>{rows.length} job{rows.length === 1 ? '' : 's'} · {money(total)} still held</Text></Card>}
    </View>
  );
}

/** Sales headline figures, each with its own date range (9219h): applied value, invoiced value, overdue, applied but not certified. */
/** Sub-tab counts: certificates still to invoice (9219 toInvoice). */
export function useSalesBadges(): Record<string, number> | undefined {
  const { me } = useAuth();
  const { data } = useSales(me?.org_id);
  return data ? { apps: data.apps.filter((a) => appStage(a).k === 'certified').length } : undefined;
}
export function SalesStats() {
  const { me } = useAuth();
  const { data } = useSales(me?.org_id);
  const { period, pick } = useStatPeriods();
  if (!data) return null;
  const pA = period('s_appv', 'month'), pI = period('s_invv', 'month'), pD = period('s_over', 'all'), pN = period('s_anc', 'all');
  const aDate = (a: App) => a.valuation_date || String(a.submitted_at || a.created_at || '').slice(0, 10);
  const live = data.invs.filter((i) => i.status !== 'void');
  const applied = data.apps.filter((a) => !['draft', 'void'].includes(a.status) && inPeriod(aDate(a), pA)).reduce((t, a) => t + Number(a.net_due || 0), 0);
  const invoiced = live.filter((i) => i.status !== 'draft' && inPeriod(i.issue_date, pI)).reduce((t, i) => t + Number(i.net || 0), 0);
  const overdue = live.filter((i) => invOverdue(i) && inPeriod(i.due_date, pD)).reduce((t, i) => t + invOutstandingNet(i), 0);
  // The last tile: retention still held by clients, every job (Andy, 11 Nov 2026).
  const jfBy2: Record<string, JobFin> = {}; data.jf.forEach((r) => { jfBy2[r.site_id] = r; });
  const appsBy2: Record<string, App[]> = {}; data.apps.forEach((a) => { (appsBy2[a.site_id] = appsBy2[a.site_id] || []).push(a); });
  const retOwed = round2(Object.keys(appsBy2).reduce((t, sid) => t + retentionStillHeld(appsBy2[sid] || [], jfBy2[sid], data.invs), 0));
  const to = (tab: string, f: string) => () => router.setParams({ tab, f });
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
      <FinStat tone="blue" v={money(applied, 0)} label={`Applied Value · ${pA.label}`} onPress={to('apps', 'all')} onMenu={() => void pick('s_appv', 'month')} /><FinStat tone="green" v={money(invoiced, 0)} label={`Invoiced Value · ${pI.label}`} onPress={to('invoices', 'all')} onMenu={() => void pick('s_invv', 'month')} />
      <FinStat tone="red" v={money(overdue, 0)} label={`Overdue · ${pD.label}`} onPress={to('invoices', 'overdue')} onMenu={() => void pick('s_over', 'all')} /><FinStat tone="amber" v={money(retOwed, 0)} label="Retention Owed Total" onPress={to('retention', '')} />
    </View>
  );
}
