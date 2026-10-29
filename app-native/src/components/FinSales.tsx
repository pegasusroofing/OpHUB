// Sales lists (9219 renderFinSales): applications & certificates, invoices,
// retention — for the whole company or one project (siteId).
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { FinChip, FinRow, FinStat } from '@/components/FinNav';
import { chooseAction } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { selectAll, useFinSettings } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { byJobNoDesc, fdate, INV_STATUS, invOutstanding, invOutstandingNet, invOverdue, jobTag, money, retentionDates, retentionStillHeld, round2, type FinApp, type FinInv, type JobFin } from '@/lib/rules/finance';
import { base, radius } from '@/theme/theme';

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
  const [inf, setInf] = useState(f0 || 'outstanding');
  const [q, setQ] = useState('');
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
    const cur = af || ['certified', 'open', 'invoiced'].find((k) => data.apps.filter(F[k]).length) || 'all';
    const list = data.apps.filter(F[cur]).filter((a) => !ql || `${a.number} ${jobTag(site(a.site_id))} ${site(a.site_id)?.client_name || ''}`.toLowerCase().includes(ql));
    return (
      <View>
        <Muted style={{ marginBottom: 8 }}>Apply → the client certifies it (enter their figures on the application) → the invoice is raised for you.</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {[['open', 'In progress'], ['certified', 'Certified — to invoice'], ['invoiced', 'Invoiced'], ['all', 'All']].map(([k, l]) => <FinChip key={k} on={cur === k} label={l} n={data.apps.filter(F[k]).length} onPress={() => setAf(k)} />)}
          <View style={{ marginLeft: 'auto' }}><Button title="+ New application" onPress={() => void newFor('application')} /></View>
        </View>
        <TextInput value={q} onChangeText={setQ} placeholder="Search application no., project or client" style={box} />
        {list.length ? list.map((a) => { const s = appStage(a); return (
          <FinRow key={a.id} left={`App ${a.number}`} title={siteId ? fdate(a.valuation_date) : jobTag(site(a.site_id))} sub={[siteId ? '' : fdate(a.valuation_date), s.l, a.cert_net != null ? `certified ${money(a.cert_net)}` : ''].filter(Boolean).join(' · ')} right={money(a.cert_net ?? a.net_due)} tone={s.c} onPress={() => router.push(`/fin/job/${a.site_id}/application/${a.id}` as never)} />
        ); }) : <Empty>Nothing here.</Empty>}
      </View>
    );
  }
  if (tab === 'invoices') {
    const F: Record<string, (i: Inv) => boolean> = { outstanding: (i) => invOutstanding(i) > 0, overdue: (i) => invOverdue(i), draft: (i) => i.status === 'draft', paid: (i) => i.status === 'paid', all: () => true };
    const list = (inf === 'all' ? data.invs : live).filter(F[inf] || F.outstanding).filter((i) => !ql || `${i.number || ''} ${i.client_name || ''} ${jobTag(site(i.site_id))}`.toLowerCase().includes(ql));
    return (
      <View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {[['outstanding', 'Owed'], ['overdue', 'Overdue'], ['draft', 'Drafts'], ['paid', 'Paid'], ['all', 'All']].map(([k, l]) => <FinChip key={k} on={inf === k} label={l} n={(k === 'all' ? data.invs : live).filter(F[k]).length} onPress={() => setInf(k)} />)}
          <View style={{ marginLeft: 'auto' }}><Button title="+ New invoice" onPress={() => void newFor('invoice')} /></View>
        </View>
        <TextInput value={q} onChangeText={setQ} placeholder="Search invoice no., client or project" style={box} />
        {list.length ? list.map((i) => {
          const od = invOverdue(i), o = invOutstanding(i);
          return <FinRow key={i.id} left={i.number || 'Draft'} title={siteId ? (i.client_name || '—') : jobTag(site(i.site_id))} sub={[siteId ? '' : i.client_name, i.issue_date ? fdate(i.issue_date) : '', INV_STATUS[i.status] || i.status, o ? `${money(o)} owed${od ? ' — overdue' : ''}` : ''].filter(Boolean).join(' · ')} right={money(i.total)} tone={od ? '#C0392B' : undefined} onPress={() => router.push(`/fin/job/${i.site_id}/invoice/${i.id}` as never)} />;
        }) : <Empty>No invoices here.</Empty>}
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
      {rows.length ? rows.map((x) => { const d = retentionDates(x.jf, st || {}); return (
        <FinRow key={x.s.id} title={jobTag(x.s)} sub={[x.s.client_name, `1st release ${d.first ? fdate(d.first) : 'not set'}${x.jf.ret1_invoice_id || x.jf.ret1_app_id ? ' (claimed)' : ''}`, `final ${d.second ? fdate(d.second) : 'not set'}${x.jf.ret2_invoice_id || x.jf.ret2_app_id ? ' (claimed)' : ''}`].filter(Boolean).join(' · ')} right={money(x.held)} onPress={() => router.push(`/fin/job/${x.s.id}?tab=setup` as never)} />
      ); }) : <Empty>No retention held.</Empty>}
      {rows.length > 0 && <Card><Text style={{ fontWeight: '800', color: base.ink }}>{rows.length} job{rows.length === 1 ? '' : 's'} · {money(total)} still held</Text></Card>}
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <FinStat v={money(applied, 0)} label="Applied value · this month" /><FinStat v={money(invoiced, 0)} label="Invoiced value · this month" />
      <FinStat v={money(overdue, 0)} label="Overdue" hot={overdue > 0} /><FinStat v={money(waiting, 0)} label="Applied, not certified or invoiced" />
    </View>
  );
}
