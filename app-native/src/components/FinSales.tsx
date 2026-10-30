// Sales lists (9219 renderFinSales): applications & certificates, invoices,
// retention — for the whole company or one project (siteId).
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { FinRow, FinSeg, FinStat } from '@/components/FinNav';
import { Cell, FinTable, FootText } from '@/components/FinTable';
import { SelectBox } from '@/components/SelectBox';
import { chooseAction } from '@/components/toast';
import { Button, Card, Empty, Muted, Toggle } from '@/components/ui';
import { selectAll, useFinSettings } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { byJobNoDesc, fdate, INV_STATUS, invOutstanding, invOutstandingNet, invOverdue, jobTag, money, retentionDates, retentionStillHeld, round2, type FinApp, type FinInv, type JobFin } from '@/lib/rules/finance';
import { monthLabel, monthOf, monthsIn } from '@/lib/rules/finFilters';
import { base, radius, useDesk } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 10 };
export type App = FinApp & { id: string; site_id: string; due_date?: string | null; gross?: number | null; net_due?: number | null; cert_gross?: number | null; cert_net?: number | null; cert_is_payless?: boolean | null; invoice_id?: string | null; submitted_at?: string | null; created_at?: string };
export type Inv = FinInv & { client_name?: string | null; created_at?: string; kind?: string | null; lines?: { description?: string; amount?: number | string | null }[] | null; created_by?: string | null; updated_at?: string };
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

export function SalesLists({ tab, siteId, f: f0 }: { tab: 'apps' | 'invoices' | 'retention'; siteId?: string; f?: string }) {
  const { me } = useAuth();
  const { data: sitesRaw = [] } = useSites();
  const { data: st } = useFinSettings(me?.org_id);
  const { data } = useSales(me?.org_id, siteId);
  const [af, setAf] = useState<string | null>(null);
  const [mon, setMon] = useState(''); // month picker (9219t): the list and its totals follow it
  const [inf, setInf] = useState(f0 || 'outstanding');
  const [q, setQ] = useState('');
  const [voidOpen, setVoidOpen] = useState(false); // voided invoices sit in a closed drop-down (9219zn)
  const desk = useDesk();
  const sites = sitesRaw as (typeof sitesRaw[number] & { job_number?: string | null; client_name?: string | null })[];
  const site = (id: string) => sites.find((s) => s.id === id);
  const ql = q.trim().toLowerCase();
  if (!data) return <Muted>Loading…</Muted>;
  const live = data.invs.filter((i) => i.status !== 'void');
  const stage = (a: App) => appStage(a).k;
  const newFor = async (what: 'invoice' | 'application') => {
    const sid = siteId || (await pickJob(what === 'invoice' ? 'New invoice' : 'New application', sites.filter((s) => s.status !== 'closed')));
    if (sid) router.push(`/fin/job/${sid}/${what}/new` as never);
  };
  if (tab === 'apps') {
    const F: Record<string, (a: App) => boolean> = { open: (a) => ['draft', 'submitted'].includes(stage(a)), certified: (a) => stage(a) === 'certified', invoiced: (a) => stage(a) === 'invoiced', all: (a) => stage(a) !== 'void' };
    const cur = af || ['open', 'certified', 'invoiced'].find((k) => data.apps.filter(F[k]).length) || 'all';
    const aMonth = (a: App) => monthOf(a.valuation_date);
    const list = data.apps.filter(F[cur]).filter((a) => !mon || aMonth(a) === mon).filter((a) => !ql || `${a.number} ${jobTag(site(a.site_id))} ${site(a.site_id)?.client_name || ''}`.toLowerCase().includes(ql));
    const months = monthsIn(data.apps.filter(F[cur]), aMonth);
    return (
      <View>
        <Muted style={{ marginBottom: 8, fontSize: 12 }}>Apply → the client certifies it (enter their figures on the application) → the invoice is raised for you. A certificate is just a certified application.</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <FinSeg value={cur} onChange={setAf} items={[['open', 'In Progress'], ['certified', 'Certified — To Invoice'], ['invoiced', 'Invoiced'], ['all', 'All']].map(([k, l]) => [k, l, data.apps.filter(F[k]).length] as [string, string, number])} />
          <SelectBox value={mon} title="Month" options={[['', 'All months'], ...(mon && !months.includes(mon) ? [mon, ...months] : months).map((m) => [m, monthLabel(m)] as [string, string])]} onChange={setMon} style={{ marginBottom: 0, width: 150 }} />
          <View style={{ marginLeft: 'auto' }}><Button title="+ New application" onPress={() => void newFor('application')} /></View>
        </View>
        <TextInput value={q} onChangeText={setQ} placeholder="Search application no., project or client" style={box} />
        {desk && list.length ? (
          <FinTable rows={list} keyOf={(a) => a.id} onRow={(a) => router.push(`/fin/job/${a.site_id}/application/${a.id}` as never)}
            cols={[
              ...(siteId ? [] : [{ k: 'p', l: 'Project', flex: 1.8, min: 180, render: (a: App) => <Cell bold>{jobTag(site(a.site_id))}</Cell> }]),
              { k: 'n', l: 'Application', render: (a: App) => <Cell>Application {a.number}</Cell> },
              { k: 'd', l: 'Date', render: (a: App) => <Cell>{fdate(a.valuation_date)}</Cell> },
              { k: 'ap', l: 'Applied (Net)', render: (a: App) => <Cell>{money(a.net_due)}</Cell> },
              { k: 'ce', l: 'Certified (Net)', render: (a: App) => <Cell>{a.cert_net != null ? money(a.cert_net) : '—'}</Cell> },
              { k: 'st', l: 'Stage', render: (a: App) => { const s = appStage(a); return <Text style={{ fontSize: 10.5, fontWeight: '800', color: s.c, backgroundColor: `${s.c}1A`, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden', textAlign: 'center' }}>● {s.l}</Text>; } },
              { k: 'inv', l: 'Invoice', render: (a: App) => <Cell>{a.invoice_id ? data.invs.find((i) => i.id === a.invoice_id)?.number || 'Invoiced' : '—'}</Cell> },
            ]}
            foot={<><FootText bold>{list.length} application{list.length === 1 ? '' : 's'}</FootText><FootText>Applied {money(list.reduce((t, a) => t + Number(a.net_due || 0), 0))}</FootText><FootText>Certified {money(list.reduce((t, a) => t + Number(a.cert_net || 0), 0))}</FootText></>} />
        ) : list.length ? list.map((a) => { const s = appStage(a); return (
          <FinRow key={a.id} left={`App ${a.number}`} title={siteId ? fdate(a.valuation_date) : jobTag(site(a.site_id))} sub={[siteId ? '' : fdate(a.valuation_date), s.l, a.cert_net != null ? `certified ${money(a.cert_net)}` : ''].filter(Boolean).join(' · ')} right={money(a.cert_net ?? a.net_due)} tone={s.c} onPress={() => router.push(`/fin/job/${a.site_id}/application/${a.id}` as never)} />
        ); }) : <Empty>Nothing here.</Empty>}
      </View>
    );
  }
  if (tab === 'invoices') {
    const F: Record<string, (i: Inv) => boolean> = { outstanding: (i) => invOutstanding(i) > 0, overdue: (i) => invOverdue(i), draft: (i) => i.status === 'draft', paid: (i) => i.status === 'paid', all: () => true };
    const iMonth = (i: Inv) => monthOf(i.issue_date || i.created_at);
    const base0 = live.filter(F[inf] || F.outstanding);
    const list = base0.filter((i) => !mon || iMonth(i) === mon).filter((i) => !ql || `${i.number || ''} ${i.client_name || ''} ${jobTag(site(i.site_id))}`.toLowerCase().includes(ql));
    const months = monthsIn(base0, iMonth);
    return (
      <View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <FinSeg value={inf} onChange={setInf} items={[['outstanding', 'Owed'], ['overdue', 'Overdue'], ['draft', 'Drafts'], ['paid', 'Paid'], ['all', 'All']].map(([k, l]) => [k, l, live.filter(F[k]).length] as [string, string, number])} />
          <SelectBox value={mon} title="Month" options={[['', 'All months'], ...(mon && !months.includes(mon) ? [mon, ...months] : months).map((m) => [m, monthLabel(m)] as [string, string])]} onChange={setMon} style={{ marginBottom: 0, width: 150 }} />
          <View style={{ marginLeft: 'auto' }}><Button title="+ New invoice" onPress={() => void newFor('invoice')} /></View>
        </View>
        <TextInput value={q} onChangeText={setQ} placeholder="Search invoice no., client or project" style={box} />
        {desk && list.length ? (
          <FinTable rows={list} keyOf={(i) => i.id} onRow={(i) => router.push(`/fin/job/${i.site_id}/invoice/${i.id}` as never)}
            cols={[
              { k: 'no', l: 'Invoice', render: (i: Inv) => <Cell bold>{i.number || 'Draft'}</Cell> },
              ...(siteId ? [] : [{ k: 'p', l: 'Project', flex: 1.8, min: 180, render: (i: Inv) => <Cell bold>{jobTag(site(i.site_id))}</Cell> }]),
              { k: 'c', l: 'Client', flex: 1.4, min: 140, render: (i: Inv) => <Cell>{i.client_name || '—'}</Cell> },
              { k: 'd', l: 'Date', render: (i: Inv) => <Cell>{i.issue_date ? fdate(i.issue_date) : '—'}</Cell> },
              { k: 't', l: 'Total', render: (i: Inv) => <Cell>{money(i.total)}</Cell> },
              { k: 'o', l: 'Owed', render: (i: Inv) => { const o = invOutstanding(i); return <Cell tone={invOverdue(i) ? '#C0392B' : undefined}>{o ? money(o) : '—'}</Cell>; } },
              { k: 's', l: 'Status', render: (i: Inv) => <Cell tone={invOverdue(i) ? '#C0392B' : undefined}>{invOverdue(i) ? 'Overdue' : INV_STATUS[i.status] || i.status}</Cell> },
            ]}
            foot={<><FootText bold>{list.length} invoice{list.length === 1 ? '' : 's'}</FootText><FootText>Total {money(list.reduce((t, i) => t + Number(i.total || 0), 0))}</FootText><FootText>Owed {money(list.reduce((t, i) => t + invOutstanding(i), 0))}</FootText></>} />
        ) : list.length ? list.map((i) => {
          const od = invOverdue(i), o = invOutstanding(i);
          return <FinRow key={i.id} left={i.number || 'Draft'} title={siteId ? (i.client_name || '—') : jobTag(site(i.site_id))} sub={[siteId ? '' : i.client_name, i.issue_date ? fdate(i.issue_date) : '', INV_STATUS[i.status] || i.status, o ? `${money(o)} owed${od ? ' — overdue' : ''}` : ''].filter(Boolean).join(' · ')} right={money(i.total)} tone={od ? '#C0392B' : undefined} onPress={() => router.push(`/fin/job/${i.site_id}/invoice/${i.id}` as never)} />;
        }) : <Empty>No invoices here.</Empty>}
        {(() => {
          const voided = data.invs.filter((i) => i.status === 'void' && (!mon || iMonth(i) === mon) && (!ql || `${i.number || ''} ${i.client_name || ''} ${jobTag(site(i.site_id))}`.toLowerCase().includes(ql)));
          if (!voided.length) return null;
          return (
            <View style={{ marginTop: 10 }}>
              <Toggle title={`Voided invoices (${voided.length})`} open={voidOpen} onPress={() => setVoidOpen(!voidOpen)} />
              {voidOpen && voided.map((i) => <FinRow key={i.id} left={i.number || 'Draft'} title={siteId ? (i.client_name || '—') : jobTag(site(i.site_id))} sub={[siteId ? '' : i.client_name, i.issue_date ? fdate(i.issue_date) : '', 'Void'].filter(Boolean).join(' · ')} right={money(i.total)} onPress={() => router.push(`/fin/job/${i.site_id}/invoice/${i.id}` as never)} />)}
            </View>
          );
        })()}
        <Muted style={{ marginTop: 8 }}>Record money received on the invoice itself.</Muted>
      </View>
    );
  }
  // retention
  const jfBy: Record<string, JobFin> = {}; data.jf.forEach((r) => { jfBy[r.site_id] = r; });
  const appsBy: Record<string, App[]> = {}; data.apps.forEach((a) => { (appsBy[a.site_id] = appsBy[a.site_id] || []).push(a); });
  const rows = sites.filter((s) => !siteId || s.id === siteId).map((s) => ({ s, held: retentionStillHeld(appsBy[s.id] || [], jfBy[s.id], data.invs), jf: jfBy[s.id] || {} })).filter((x) => x.held)
    .filter((x) => !ql || `${jobTag(x.s)} ${x.s.client_name || ''}`.toLowerCase().includes(ql));
  const total = round2(rows.reduce((t, x) => t + x.held, 0));
  return (
    <View>
      <Muted style={{ marginBottom: 8 }}>Money your clients are holding back until the work is signed off: {money(total)} across {rows.length} job{rows.length === 1 ? '' : 's'}. Half usually comes back at practical completion and half at the end of the defects period — set the dates on each project.</Muted>
      {!siteId && <TextInput value={q} onChangeText={setQ} placeholder="Search project, client" style={box} />}
      {desk && rows.length ? (
        <FinTable rows={rows} keyOf={(x) => x.s.id} onRow={(x) => router.push(`/fin/job/${x.s.id}?tab=setup` as never)}
          cols={[
            { k: 'p', l: 'Project', flex: 1.8, min: 180, render: (x) => <Cell bold>{jobTag(x.s)}</Cell> },
            { k: 'c', l: 'Client', flex: 1.4, min: 140, render: (x) => <Cell>{x.s.client_name || '—'}</Cell> },
            { k: 'f', l: '1st Release', render: (x) => { const d = retentionDates(x.jf, st || {}); return <Cell>{d.first ? fdate(d.first) : 'Not set'}{x.jf.ret1_invoice_id || x.jf.ret1_app_id ? ' (claimed)' : ''}</Cell>; } },
            { k: 's', l: 'Final Release', render: (x) => { const d = retentionDates(x.jf, st || {}); return <Cell>{d.second ? fdate(d.second) : 'Not set'}{x.jf.ret2_invoice_id || x.jf.ret2_app_id ? ' (claimed)' : ''}</Cell>; } },
            { k: 'h', l: 'Held', render: (x) => <Cell bold>{money(x.held)}</Cell> },
          ]}
          foot={<><FootText bold>{rows.length} job{rows.length === 1 ? '' : 's'}</FootText><FootText>{money(total)} still held</FootText></>} />
      ) : rows.length ? rows.map((x) => { const d = retentionDates(x.jf, st || {}); return (
        <FinRow key={x.s.id} title={jobTag(x.s)} sub={[x.s.client_name, `1st release ${d.first ? fdate(d.first) : 'not set'}${x.jf.ret1_invoice_id || x.jf.ret1_app_id ? ' (claimed)' : ''}`, `final ${d.second ? fdate(d.second) : 'not set'}${x.jf.ret2_invoice_id || x.jf.ret2_app_id ? ' (claimed)' : ''}`].filter(Boolean).join(' · ')} right={money(x.held)} onPress={() => router.push(`/fin/job/${x.s.id}?tab=setup` as never)} />
      ); }) : <Empty>No retention held.</Empty>}
      {!desk && rows.length > 0 && <Card><Text style={{ fontWeight: '800', color: base.ink }}>{rows.length} job{rows.length === 1 ? '' : 's'} · {money(total)} still held</Text></Card>}
    </View>
  );
}

/** Sales headline figures (this month): applied value, invoiced value, overdue, applied but not certified. */
export function SalesStats() {
  const { me } = useAuth();
  const { data } = useSales(me?.org_id);
  if (!data) return null;
  const ym = new Date().toISOString().slice(0, 7);
  const aDate = (a: App) => a.valuation_date || String(a.submitted_at || a.created_at || '').slice(0, 10);
  const live = data.invs.filter((i) => i.status !== 'void');
  const applied = data.apps.filter((a) => !['draft', 'void'].includes(a.status) && aDate(a).startsWith(ym)).reduce((t, a) => t + Number(a.net_due || 0), 0);
  const invoiced = live.filter((i) => i.status !== 'draft' && String(i.issue_date || '').startsWith(ym)).reduce((t, i) => t + Number(i.net || 0), 0);
  const overdue = live.filter((i) => invOverdue(i)).reduce((t, i) => t + invOutstandingNet(i), 0);
  const waiting = data.apps.filter((a) => appStage(a).k === 'submitted').reduce((t, a) => t + Number(a.net_due || 0), 0);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      <FinStat tone="blue" v={money(applied, 0)} label="Applied Value · this month" /><FinStat tone="green" v={money(invoiced, 0)} label="Invoiced Value · this month" />
      <FinStat tone="red" v={money(overdue, 0)} label="Overdue · all time" /><FinStat tone="amber" v={money(waiting, 0)} label="Applied, Not Certified Or Invoiced · all time" />
    </View>
  );
}
