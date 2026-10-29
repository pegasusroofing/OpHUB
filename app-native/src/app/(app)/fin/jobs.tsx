// Finance › Projects (914 renderFinJobs + 9219f grid + 9219i clients): every
// project with its client, client PO, PM, value, invoiced, owed and overdue;
// status tabs, PM / client filters, sort and search. Clients tab: each client
// with its jobs and what they owe.
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { FinChip, FinPage, FinRow } from '@/components/FinNav';
import { Cell, FinTable, FootText } from '@/components/FinTable';
import { chooseAction } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { finStatus, selectAll } from '@/data/finance';
import { usePeople } from '@/data/hs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { byJobNoDesc, invOutstandingNet, invOverdue, jobTag, money, type FinInv } from '@/lib/rules/finance';
import { isFullManager } from '@/lib/roles';
import type { Site } from '@/lib/types';
import { base, radius, useDesk, useTheme } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card };
type JF = { site_id: string; contract_value: number | null; billing_name: string | null; billing_email: string | null };
type SiteX = Site & { job_number?: string | null; responsible_pm_id?: string | null; client_name?: string | null; client_email?: string | null; start_date?: string | null };

export function useJobsData(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['finJobs', orgId], enabled: !!orgId,
    queryFn: async () => {
      const [jf, pos, invs, clients] = await Promise.all([
        selectAll<JF>('job_finance', 'site_id,contract_value,billing_name,billing_email', (q) => q.eq('org_id', orgId as string)),
        selectAll<{ site_id: string; po_number: string }>('client_pos', 'id,site_id,po_number', (q) => q.eq('org_id', orgId as string)),
        selectAll<FinInv>('fin_invoices', 'id,site_id,status,total,paid,net,due_date', (q) => q.eq('org_id', orgId as string).neq('status', 'void')),
        selectAll<{ id: string; name: string; email: string | null; xero_contact_id: string | null; terms_days: number | null }>('fin_clients', 'id,name,email,xero_contact_id,terms_days', (q) => q.eq('org_id', orgId as string)),
      ]);
      const jfBy: Record<string, JF> = {}; jf.forEach((r) => { jfBy[r.site_id] = r; });
      const posBy: Record<string, string[]> = {}; pos.forEach((p) => { (posBy[p.site_id] = posBy[p.site_id] || []).push(p.po_number); });
      const m: Record<string, { inv: number; owed: number; overdue: number }> = {};
      invs.forEach((i) => { const r = (m[i.site_id] = m[i.site_id] || { inv: 0, owed: 0, overdue: 0 }); if (i.status !== 'draft') { r.inv += Number(i.total || 0); const o = invOutstandingNet(i); r.owed += o; if (invOverdue(i)) r.overdue += o; } });
      return { jfBy, posBy, m, invs, clients };
    },
  });
}

export default function FinJobs() {
  const { tab = 'list' } = useLocalSearchParams<{ tab?: string }>();
  const { me } = useAuth();
  const desk = useDesk();
  const t = useTheme();
  const { data: sitesRaw } = useSites();
  const { data: people = [] } = usePeople();
  const { data } = useJobsData(me?.org_id);
  const [st, setSt] = useState<'live' | 'upcoming' | 'closed' | 'all'>('live');
  const [pm, setPm] = useState('');
  const [cli, setCli] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('noza');
  const sites = ((sitesRaw || []) as SiteX[]).slice().sort(byJobNoDesc);
  const go = (k: string) => router.setParams({ tab: k });
  const cliOf = (s: SiteX) => data?.jfBy[s.id]?.billing_name || s.client_name || '';
  const pmName = (id?: string | null) => (id ? people.find((p) => p.id === id)?.name || 'PM' : '');
  if (tab === 'clients') return <Clients sites={sites} data={data} cliOf={cliOf} go={go} />;
  const counts: Record<string, number> = { live: 0, upcoming: 0, closed: 0, all: sites.length };
  sites.forEach((s) => { counts[finStatus(s)] = (counts[finStatus(s)] || 0) + 1; });
  const ql = q.trim().toLowerCase(), cl = cli.trim().toLowerCase();
  let shown = sites.filter((s) => (st === 'all' || finStatus(s) === st) && (!pm || (pm === 'none' ? !s.responsible_pm_id : s.responsible_pm_id === pm))
    && (!cl || `${cliOf(s)} ${s.client_name || ''}`.toLowerCase().includes(cl))
    && (!ql || [s.job_number, s.name, cliOf(s), s.client_name, (data?.posBy[s.id] || []).join(' '), pmName(s.responsible_pm_id), s.postcode].join(' ').toLowerCase().includes(ql)));
  const num = (s: SiteX) => String(s.job_number || ''), nm = (s: SiteX) => String(s.name || '');
  const cmp: Record<string, (a: SiteX, b: SiteX) => number> = { az: (a, b) => nm(a).localeCompare(nm(b)), za: (a, b) => nm(b).localeCompare(nm(a)), noaz: (a, b) => num(a).localeCompare(num(b), undefined, { numeric: true }), noza: byJobNoDesc, start: (a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')) };
  shown = shown.slice().sort(cmp[sort]);
  const pms = Array.from(new Set(sites.map((s) => s.responsible_pm_id).filter(Boolean))) as string[];
  const tot = shown.reduce((t, s) => { const m = data?.m[s.id]; return { v: t.v + Number(data?.jfBy[s.id]?.contract_value || 0), inv: t.inv + (m?.inv || 0), owed: t.owed + (m?.owed || 0), od: t.od + (m?.overdue || 0) }; }, { v: 0, inv: 0, owed: 0, od: 0 });
  return (
    <FinPage title="Projects" section="jobs" sub="list" onSub={go}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {(['live', 'upcoming', 'closed', 'all'] as const).map((k) => <FinChip key={k} on={st === k} label={k[0].toUpperCase() + k.slice(1)} n={counts[k]} onPress={() => setSt(k)} />)}
        {me && isFullManager(me) && <View style={{ marginLeft: 'auto' }}><Button title="+ New project" onPress={() => router.push('/fin/newjob' as never)} /></View>}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <Pressable onPress={async () => { const k = await chooseAction('PM', [{ key: '*', label: 'All PMs' }, ...pms.map((id) => ({ key: id, label: pmName(id) })), { key: 'none', label: 'No PM' }]); if (k) setPm(k === '*' ? '' : k); }} style={box}><Text style={{ color: base.ink }}>PM: {pm ? (pm === 'none' ? 'No PM' : pmName(pm)) : 'All'} ▾</Text></Pressable>
        <TextInput value={cli} onChangeText={setCli} placeholder="Client name" style={[box, { minWidth: 140 }]} />
        <Pressable onPress={async () => { const k = await chooseAction('Sort', [['noza', 'Project no. (newest first)'], ['noaz', 'Project no. (A–Z)'], ['az', 'Name A–Z'], ['za', 'Name Z–A'], ['start', 'Start date (newest)']].map(([key, label]) => ({ key, label }))); if (k) setSort(k); }} style={box}><Text style={{ color: base.ink }}>Sort ▾</Text></Pressable>
        {!!(pm || cli) && <Pressable onPress={() => { setPm(''); setCli(''); }} style={{ justifyContent: 'center' }}><Text style={{ color: base.blue }}>Clear</Text></Pressable>}
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search project no., name, client or PO" style={[box, { marginBottom: 10 }]} />
      {!data ? <Muted>Loading…</Muted> : desk && shown.length ? (
        <FinTable rows={shown} keyOf={(s) => s.id} onRow={(s) => router.push(`/fin/job/${s.id}` as never)}
          cols={[
            { k: 'no', l: 'Job No', min: 90, flex: 0.8, render: (s) => <Text style={{ fontSize: 11, fontWeight: '800', color: t.brand1, borderWidth: 1.5, borderColor: t.brand1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' }}>{s.job_number || '—'}</Text> },
            { k: 'name', l: 'Project', flex: 1.6, min: 160, render: (s) => <Cell bold>{s.name}</Cell> },
            { k: 'cli', l: 'Client', flex: 1.5, min: 150, render: (s) => <Cell bold>{cliOf(s) || '—'}</Cell> },
            { k: 'po', l: 'Client PO', render: (s) => { const po = (data.posBy[s.id] || []).join(', '); return po ? <Cell>{po}</Cell> : <Cell tone="#D97706">No PO</Cell>; } },
            { k: 'pm', l: 'PM', render: (s) => <Cell>{pmName(s.responsible_pm_id) || '—'}</Cell> },
            { k: 'st', l: 'Status', render: (s) => { const k = finStatus(s); const c = k === 'live' ? ['#E7F6EC', '#1E7A43'] : k === 'upcoming' ? ['#FDF1E6', '#B35A00'] : ['#EEF0F2', '#6b7280']; return <Text style={{ fontSize: 10.5, fontWeight: '800', color: c[1], backgroundColor: c[0], borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden' }}>● {k[0].toUpperCase() + k.slice(1)}</Text>; } },
            { k: 'start', l: 'Start', render: (s) => { const d = s.start_date || (s as { created_at?: string }).created_at; return <Cell>{d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</Cell>; } },
            { k: 'v', l: 'Value', render: (s) => { const v = Number(data.jfBy[s.id]?.contract_value || 0), m = data.m[s.id]; return <Cell tone={m?.overdue ? '#C0392B' : undefined}>{v ? money(v, 0) : '—'}</Cell>; } },
          ]}
          foot={<><FootText bold>{shown.length} project{shown.length === 1 ? '' : 's'}</FootText><FootText>Value {money(tot.v, 0)}</FootText><FootText>Invoiced {money(tot.inv, 0)}</FootText><FootText>Owed {money(tot.owed, 0)}</FootText>{tot.od ? <FootText>Overdue {money(tot.od, 0)}</FootText> : null}</>} />
      ) : shown.length ? shown.map((s) => {
        const m = data.m[s.id], v = Number(data.jfBy[s.id]?.contract_value || 0), po = (data.posBy[s.id] || []).join(', ');
        return <FinRow key={s.id} left={s.job_number || 'No no.'} title={s.name} onPress={() => router.push(`/fin/job/${s.id}` as never)}
          sub={[cliOf(s) || 'No client', po ? `PO ${po}` : 'No PO', pmName(s.responsible_pm_id), m?.owed ? `owed ${money(m.owed, 0)}` : '', m?.overdue ? `${money(m.overdue, 0)} overdue` : ''].filter(Boolean).join(' · ')}
          right={v ? money(v, 0) : 'No value'} tone={m?.overdue ? '#C0392B' : undefined} />;
      }) : <Empty>No projects here.</Empty>}
      {!desk && shown.length > 0 && <Card><Text style={{ color: base.ink, fontWeight: '700' }}>{shown.length} project{shown.length === 1 ? '' : 's'} · Value {money(tot.v, 0)} · Invoiced {money(tot.inv, 0)} · Owed {money(tot.owed, 0)}{tot.od ? ` · Overdue ${money(tot.od, 0)}` : ''}</Text></Card>}
    </FinPage>
  );
}

function Clients({ sites, data, cliOf, go }: { sites: SiteX[]; data: ReturnType<typeof useJobsData>['data']; cliOf: (s: SiteX) => string; go: (k: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const key = (n: string) => n.trim().toLowerCase();
  const by: Record<string, { name: string; id: string | null; email: string; xero: boolean; jobs: SiteX[]; live: number; owed: number; overdue: number }> = {};
  (data?.clients || []).forEach((c) => { by[key(c.name)] = { name: c.name, id: c.id, email: c.email || '', xero: !!c.xero_contact_id, jobs: [], live: 0, owed: 0, overdue: 0 }; });
  sites.forEach((s) => { const n = cliOf(s); if (!n) return; const c = (by[key(n)] = by[key(n)] || { name: n, id: null, email: data?.jfBy[s.id]?.billing_email || s.client_email || '', xero: false, jobs: [], live: 0, owed: 0, overdue: 0 }); c.jobs.push(s); if (finStatus(s) === 'live') c.live++; c.owed += data?.m[s.id]?.owed || 0; c.overdue += data?.m[s.id]?.overdue || 0; });
  const list = Object.values(by).sort((a, b) => a.name.localeCompare(b.name)).filter((c) => !q.trim() || `${c.name} ${c.email} ${c.jobs.map((j) => `${j.name} ${j.job_number || ''}`).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  const noClient = sites.filter((s) => !cliOf(s));
  return (
    <FinPage title="Clients" section="jobs" sub="clients" onSub={go}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1 }}><Button kind="ghost" title="Directory (edit clients, Xero)" onPress={() => router.push('/fin/directory?kind=client' as never)} /></View>
      </View>
      <Muted style={{ marginBottom: 8 }}>{list.length} client{list.length === 1 ? '' : 's'} · {list.filter((c) => c.xero).length} in Xero.</Muted>
      <TextInput value={q} onChangeText={setQ} placeholder="Search clients" style={[box, { marginBottom: 10 }]} />
      {!data ? <Muted>Loading…</Muted> : list.length ? list.map((c) => (
        <View key={c.name}>
          <FinRow title={c.name} sub={[c.email, `${c.jobs.length} job${c.jobs.length === 1 ? '' : 's'} · ${c.live} live`, c.xero ? 'In Xero' : '', c.overdue ? `${money(c.overdue, 0)} overdue` : ''].filter(Boolean).join(' · ')} right={c.owed ? money(c.owed, 0) : '—'} tone={c.overdue ? '#C0392B' : undefined} onPress={() => setOpen(open === c.name ? null : c.name)} />
          {open === c.name && <View style={{ marginLeft: 14, marginBottom: 8 }}>{c.jobs.map((j) => <Pressable key={j.id} onPress={() => router.push(`/fin/job/${j.id}` as never)}><Text style={{ color: base.blue, paddingVertical: 3 }}>{jobTag(j)}</Text></Pressable>)}</View>}
        </View>
      )) : <Empty>No clients yet.</Empty>}
      {noClient.length > 0 && <Muted style={{ marginTop: 10 }}>{noClient.length} job{noClient.length === 1 ? '' : 's'} with no client set: {noClient.map(jobTag).join(', ')}</Muted>}
    </FinPage>
  );
}
