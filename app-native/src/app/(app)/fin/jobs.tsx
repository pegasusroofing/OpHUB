// Finance › Projects (914 renderFinJobs + 9219f grid): every project with its client, client PO, PM, value, invoiced,
// owed and overdue. Click a heading to sort; nothing chosen means name A to Z. Clients are in the Directory, with their jobs
// and what they owe. A laptop filters by column (Status starts on Live) and has no filter row; a phone has no columns, so it
// keeps the search box and the Status, PM, Client and Start date filters.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { FinFilterBar, type FilterSel } from '@/components/FinFilterBar';
import { FinPage, FinRow } from '@/components/FinNav';
import { Cell, FinTable, FootText } from '@/components/FinTable';
import { askDate } from '@/components/DateField';
import { Button, Empty, Muted } from '@/components/ui';
import { finStatus, selectAll } from '@/data/finance';
import { usePeople } from '@/data/hs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { byJobNoDesc, fdate, invOutstandingNet, invOverdue, money, today, type FinInv } from '@/lib/rules/finance';
import { DATE_RANGES, dateRange, valueTest } from '@/lib/rules/finFilters';
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
      const [jf, pos, invs] = await Promise.all([
        selectAll<JF>('job_finance', 'site_id,contract_value,billing_name,billing_email', (q) => q.eq('org_id', orgId as string)),
        selectAll<{ site_id: string; po_number: string }>('client_pos', 'id,site_id,po_number', (q) => q.eq('org_id', orgId as string)),
        selectAll<FinInv>('fin_invoices', 'id,site_id,status,total,paid,net,due_date', (q) => q.eq('org_id', orgId as string).neq('status', 'void')),
      ]);
      const jfBy: Record<string, JF> = {}; jf.forEach((r) => { jfBy[r.site_id] = r; });
      const posBy: Record<string, string[]> = {}; pos.forEach((p) => { (posBy[p.site_id] = posBy[p.site_id] || []).push(p.po_number); });
      const m: Record<string, { inv: number; owed: number; overdue: number }> = {};
      invs.forEach((i) => { const r = (m[i.site_id] = m[i.site_id] || { inv: 0, owed: 0, overdue: 0 }); if (i.status !== 'draft') { r.inv += Number(i.total || 0); const o = invOutstandingNet(i); r.owed += o; if (invOverdue(i)) r.overdue += o; } });
      return { jfBy, posBy, m, invs };
    },
  });
}

export default function FinJobs() {
  const { me } = useAuth();
  const desk = useDesk();
  const t = useTheme();
  const { data: sitesRaw } = useSites();
  const { data: people = [] } = usePeople();
  const { data } = useJobsData(me?.org_id);
  const [sel, setSel] = useState<FilterSel>({ status: ['live'], pm: [], client: [], start: [] });
  const [q, setQ] = useState('');
  const dr = sel.start[0] || ''; // Start: a date range (9219t)
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [val, setVal] = useState(''); // Value: 50k, >100k, <25k, 25k-100k
  const sites = ((sitesRaw || []) as SiteX[]).slice().sort(byJobNoDesc);
  const cliOf = (s: SiteX) => data?.jfBy[s.id]?.billing_name || s.client_name || '';
  const pmName = (id?: string | null) => (id ? people.find((p) => p.id === id)?.name || 'PM' : '');
  const counts: Record<string, number> = { live: 0, upcoming: 0, closed: 0, all: sites.length };
  sites.forEach((s) => { counts[finStatus(s)] = (counts[finStatus(s)] || 0) + 1; });
  const ql = desk ? '' : q.trim().toLowerCase();
  let shown = sites.filter((s) => desk || ((!sel.status.length || sel.status.includes(finStatus(s))) && (!sel.pm.length || sel.pm.includes(s.responsible_pm_id || 'none'))
    && (!sel.client.length || sel.client.includes(cliOf(s)))))
    .filter((s) => (!ql || [s.job_number, s.name, cliOf(s), s.client_name, (data?.posBy[s.id] || []).join(' '), pmName(s.responsible_pm_id), s.postcode].join(' ').toLowerCase().includes(ql)));
  const nm = (s: SiteX) => String(s.name || '');
  const range = dateRange(dr, today(), custom), vt = valueTest(val);
  const startOf = (s: SiteX) => String(s.start_date || (s as { created_at?: string }).created_at || '').slice(0, 10);
  if (range && !desk) shown = shown.filter((s) => { const d = startOf(s); return !!d && d >= range[0] && d <= range[1]; });
  if (vt && !desk) shown = shown.filter((s) => vt(Number(data?.jfBy[s.id]?.contract_value || 0)));
  shown = shown.slice().sort((a, b) => nm(a).localeCompare(nm(b), 'en-GB', { sensitivity: 'base' }));
  const pms = Array.from(new Set(sites.map((s) => s.responsible_pm_id).filter(Boolean))) as string[];
  // A running tally of whatever the filters leave showing (Andy, 2 Nov 2026).
  const valueOf = (list: typeof shown) => list.reduce((t, s) => t + Number(data?.jfBy[s.id]?.contract_value || 0), 0);
  const tallyText = (list: typeof shown) => `${list.length} project${list.length === 1 ? '' : 's'}`;
  return (
    <FinPage title="Projects" section="jobs" foot={!desk && data && shown.length ? <View accessibilityLabel="Value of works" style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, backgroundColor: base.card, borderTopWidth: 1, borderTopColor: base.line, paddingHorizontal: 16, paddingVertical: 9 }}><Text style={{ fontSize: 12.5, color: base.slate }}>{tallyText(shown)}</Text><Text style={{ fontSize: 14, fontWeight: '800', color: base.ink }}>Value of works {money(valueOf(shown), 0)}</Text></View> : undefined}>
      {me && isFullManager(me) && <View style={{ marginBottom: 10 }}><Button title="+ New project" onPress={() => router.push('/fin/newjob' as never)} /></View>}
      {!desk && <FinFilterBar search={{ value: q, onChange: setQ, placeholder: 'Search project no., name, client or PO' }} sel={sel} moreOn={!!val}
        onClear={() => { setSel({ status: [], pm: [], client: [], start: [] }); setVal(''); }}
        onChange={async (next) => {
          if (next.start[0] === 'custom' && dr !== 'custom') { const from = await askDate('Start dates from'); if (from === null) return; const to = await askDate('Start dates to', { min: from || undefined }); if (to === null) return; setCustom({ from: from || undefined, to: to || undefined }); }
          setSel(next);
        }}
        parts={[
          { key: 'status', label: 'Status', items: (['live', 'upcoming', 'closed'] as const).map((k) => ({ v: k, l: k[0].toUpperCase() + k.slice(1), n: counts[k] })) },
          { key: 'pm', label: 'PM', items: [...pms.map((id) => ({ v: id, l: pmName(id) })), { v: 'none', l: 'No PM' }] },
          { key: 'client', label: 'Client', items: [...new Set(sites.map(cliOf).filter(Boolean))].sort().map((v) => ({ v, l: v })) },
          { key: 'start', label: 'Start date', single: true, items: DATE_RANGES.filter(([k]) => k).map(([k, l]) => ({ v: k, l: k === 'custom' && dr === 'custom' && (custom.from || custom.to) ? `${custom.from ? fdate(custom.from) : '…'} – ${custom.to ? fdate(custom.to) : '…'}` : l })) },
        ]}
        more={<TextInput value={val} onChangeText={setVal} placeholder="Value e.g. >50k, 25k-100k" style={[box, { fontSize: 16 }, val && !vt ? { borderColor: '#C0392B' } : null]} />} />}
      {!data ? <Muted>Loading…</Muted> : desk && shown.length ? (
        <FinTable rows={shown} keyOf={(s) => s.id} onRow={(s) => router.push(`/fin/job/${s.id}` as never)} defaultSort={{ k: 'name', dir: 'asc' }} startFilter={{ st: ['Live'] }}
          cols={[
            { k: 'no', l: 'Job No', min: 90, flex: 0.8, sort: (s) => s.job_number || '', render: (s) => <Text style={{ fontSize: 11, fontWeight: '800', color: t.brand1, borderWidth: 1.5, borderColor: t.brand1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' }}>{s.job_number || '—'}</Text> },
            { k: 'name', l: 'Project', flex: 2.7, min: 230, render: (s) => <Cell bold>{s.name}</Cell> },
            { k: 'cli', l: 'Client', flex: 1.5, min: 150, render: (s) => <Cell bold>{cliOf(s) || '—'}</Cell> },
            { k: 'po', l: 'Client PO', render: (s) => { const po = (data.posBy[s.id] || []).join(', '); return po ? <Cell>{po}</Cell> : <Cell tone="#D97706">No PO</Cell>; } },
            { k: 'pm', l: 'PM', flex: 0.5, min: 56, render: (s) => <Cell>{pmName(s.responsible_pm_id) || '—'}</Cell> },
            { k: 'st', l: 'Status', flex: 0.55, min: 74, noSort: true, choices: ['Live', 'Upcoming', 'Closed'], render: (s) => { const k = finStatus(s); const c = k === 'live' ? ['#E7F6EC', '#1E7A43'] : k === 'upcoming' ? ['#FDF1E6', '#B35A00'] : ['#EEF0F2', '#6b7280']; return <Text style={{ fontSize: 10.5, fontWeight: '800', color: c[1], backgroundColor: c[0], borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden' }}>● {k[0].toUpperCase() + k.slice(1)}</Text>; } },
            { k: 'start', l: 'Start', sort: (s) => String(s.start_date || (s as { created_at?: string }).created_at || '').slice(0, 10), render: (s) => { const d = s.start_date || (s as { created_at?: string }).created_at; return <Cell>{d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</Cell>; } },
            { k: 'v', l: 'Value', sort: (s) => Number(data.jfBy[s.id]?.contract_value || 0) || null, render: (s) => { const v = Number(data.jfBy[s.id]?.contract_value || 0), m = data.m[s.id]; return <Cell tone={m?.overdue ? '#C0392B' : undefined}>{v ? money(v, 0) : '—'}</Cell>; } },
          ]}
          tally foot={(left) => <><FootText>{tallyText(left)}</FootText><FootText bold>Value of works {money(valueOf(left), 0)}</FootText></>} />
      ) : shown.length ? shown.map((s) => {
        const m = data.m[s.id], v = Number(data.jfBy[s.id]?.contract_value || 0), po = (data.posBy[s.id] || []).join(', ');
        return <FinRow compact key={s.id} left={s.job_number || 'No no.'} title={s.name} onPress={() => router.push(`/fin/job/${s.id}` as never)}
          sub={[cliOf(s) || 'No client', po ? `PO ${po}` : 'No PO', pmName(s.responsible_pm_id), m?.owed ? `owed ${money(m.owed, 0)}` : '', m?.overdue ? `${money(m.overdue, 0)} overdue` : ''].filter(Boolean).join(' · ')}
          right={v ? money(v, 0) : 'No value'} tone={m?.overdue ? '#C0392B' : undefined} />;
      }) : <Empty>No projects here.</Empty>}
    </FinPage>
  );
}
