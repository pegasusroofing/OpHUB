// Finance › Projects (914 renderFinJobs + 9219f grid): every project with its client, client PO, PM, value, invoiced,
// owed and overdue. Click a heading to sort; nothing chosen means name A to Z. Clients are in the Directory, with their jobs
// and what they owe. A laptop filters by column (Status starts on Live) and has no filter row. A phone keeps the search box
// and the Status, PM, Client and Start date filters, over a small table: Job No, Project (client underneath), Value and PM
// (Andy, 7 Nov 2026: Option 2 of the three, without Owed; Job No, Value and PM centred, the project on the left).
// Phone, like the laptop table (Andy, 14 Nov 2026): tap a heading to sort, a search box under each (Project also finds the
// client, PO and postcode; Value takes ">50k"), Live / Upcoming / Closed / All in a strip above, + New Project full width.
// The Filter / Sort buttons and the search bar went.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FinPage } from '@/components/FinNav';
import { Cell, FinTable, FootText } from '@/components/FinTable';
import { PhoneClear, PhoneFindRow, PhoneHeads, usePhoneFind, type PCol } from '@/components/PhoneTable';
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
import { base, useDesk, useTheme } from '@/theme/theme';

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
  // A phone shows Live, Upcoming, Closed or All from the strip above the table (it was in the Filter).
  const [stat, setStat] = useState<'live' | 'upcoming' | 'closed' | 'all'>('live');
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const sites = ((sitesRaw || []) as SiteX[]).slice().sort(byJobNoDesc);
  const cliOf = (s: SiteX) => data?.jfBy[s.id]?.billing_name || s.client_name || '';
  const pmName = (id?: string | null) => (id ? people.find((p) => p.id === id)?.name || 'PM' : '');
  const counts: Record<string, number> = { live: 0, upcoming: 0, closed: 0, all: sites.length };
  sites.forEach((s) => { counts[finStatus(s)] = (counts[finStatus(s)] || 0) + 1; });
  const nm = (s: SiteX) => String(s.name || '');
  const startOf = (s: SiteX) => String(s.start_date || (s as { created_at?: string }).created_at || '').slice(0, 10);
  const shown = sites.filter((s) => desk || stat === 'all' || finStatus(s) === stat).slice().sort((a, b) => nm(a).localeCompare(nm(b), 'en-GB', { sensitivity: 'base' }));
  // Start › Choose dates…: ask for the dates, then filter (the drop-down on the Start heading).
  const pickStart = async (k: string, v: string) => {
    if (k !== 'start' || v !== 'custom') return true;
    const from = await askDate('Start dates from'); if (from === null) return false;
    const to = await askDate('Start dates to', { min: from || undefined }); if (to === null) return false;
    setCustom({ from: from || undefined, to: to || undefined }); return true;
  };
  // A running tally of whatever the filters leave showing (Andy, 2 Nov 2026).
  const valueOf = (list: typeof shown) => list.reduce((t, s) => t + Number(data?.jfBy[s.id]?.contract_value || 0), 0);
  const tallyText = (list: typeof shown) => `${list.length} Project${list.length === 1 ? '' : 's'}`;
  // The phone table: the columns, what each searches and sorts by. Rows start Project A to Z.
  const valOf = (s: SiteX) => Number(data?.jfBy[s.id]?.contract_value || 0);
  const W = { no: 58, v: 74, pm: 66 };
  const pcols: PCol<SiteX>[] = [
    { k: 'no', l: 'Job No', w: W.no, center: true, main: (s) => s.job_number || '—', sort: (s) => s.job_number || '', find: (s) => String(s.job_number || '') },
    { k: 'name', l: 'Project', main: (s) => s.name, sub: (s) => cliOf(s) || 'No Client', sort: (s) => nm(s).toLowerCase(), find: (s) => [s.name, cliOf(s), s.client_name, (data?.posBy[s.id] || []).join(' '), s.postcode].join(' ') },
    { k: 'v', l: 'Value', w: W.v, center: true, bigFirst: true, main: (s) => (valOf(s) ? money(valOf(s), 0) : '—'), sort: (s) => valOf(s) || null, match: (s, qv) => { const tv = valueTest(qv); return tv ? tv(valOf(s)) : money(valOf(s), 0).toLowerCase().includes(qv.toLowerCase()); } },
    { k: 'pm', l: 'PM', w: W.pm, center: true, main: (s) => pmName(s.responsible_pm_id) || '—', sort: (s) => pmName(s.responsible_pm_id) },
  ];
  const find = usePhoneFind(pcols, shown, !desk);
  const phoneRows = find.shown;
  const newBtn = me && isFullManager(me) ? <Button small title="+ New Project" onPress={() => router.push('/fin/newjob' as never)} /> : undefined;
  // + New Project sits at the end of the Finance tab row on a laptop (Andy, 5 Nov 2026); full width above the table on a phone.
  // The phone's bottom bar: the count on the left, the value of works on the right, small and grey (Andy, 7 Nov 2026).
  return (
    <FinPage title="Projects" section="jobs" subRight={desk ? newBtn : undefined} foot={!desk && data && phoneRows.length ? <View accessibilityLabel="Value of works" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, backgroundColor: base.card, borderTopWidth: 1, borderTopColor: base.line, paddingHorizontal: 16, paddingVertical: 8 }}><Text style={{ fontSize: 11.5, color: base.slate }}>{tallyText(phoneRows)}</Text><Text style={{ fontSize: 11.5, fontWeight: '500', color: base.slate }}>Value Of Works {money(valueOf(phoneRows), 0)}</Text></View> : undefined}>
      {!desk && <>
        {!!newBtn && <View style={{ marginBottom: 10 }}><Button title="+ New Project" onPress={() => router.push('/fin/newjob' as never)} /></View>}
        <View style={{ flexDirection: 'row', backgroundColor: '#EEF0F2', borderRadius: 10, padding: 3, gap: 2, marginBottom: 10 }}>
          {([['live', 'Live'], ['upcoming', 'Upcoming'], ['closed', 'Closed'], ['all', 'All']] as const).map(([k, l]) => (
            <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: stat === k }} accessibilityLabel={`${l} ${counts[k] || 0}`} onPress={() => setStat(k)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: stat === k ? base.card : 'transparent' }}>
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: stat === k ? '700' : '500', color: stat === k ? base.ink : base.slate }}>{l}</Text>
              <Text style={{ fontSize: 10.5, color: base.slate }}>{counts[k] || 0}</Text>
            </Pressable>
          ))}
        </View>
      </>}
      {!data ? <Muted>Loading…</Muted> : desk && shown.length ? (
        <FinTable colsKey="jobs" onPick={pickStart} rows={shown} keyOf={(s) => s.id} onRow={(s) => router.push(`/fin/job/${s.id}` as never)} defaultSort={{ k: 'name', dir: 'asc' }} startFilter={{ st: ['Live'] }}
          cols={[
            { k: 'no', l: 'Job No', lock: true, min: 90, flex: 0.8, sort: (s) => s.job_number || '', render: (s) => <Text style={{ fontSize: 11, fontWeight: '600', color: t.brand1, borderWidth: 1.5, borderColor: t.brand1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' }}>{s.job_number || '—'}</Text> },
            { k: 'name', l: 'Project', lock: true, flex: 2.7, min: 230, render: (s) => <Cell bold>{s.name}</Cell> },
            { k: 'cli', l: 'Client', flex: 1.5, min: 150, render: (s) => <Cell bold>{cliOf(s) || '—'}</Cell> },
            { k: 'po', l: 'Client PO', render: (s) => { const po = (data.posBy[s.id] || []).join(', '); return po ? <Cell>{po}</Cell> : <Cell tone="#D97706">No PO</Cell>; } },
            { k: 'pm', l: 'PM', flex: 0.5, min: 56, render: (s) => <Cell>{pmName(s.responsible_pm_id) || '—'}</Cell> },
            { k: 'st', l: 'Status', flex: 0.6, min: 88, noSort: true, choices: ['Live', 'Upcoming', 'Closed'], render: (s) => { const k = finStatus(s); const c = k === 'live' ? ['#E7F6EC', '#1E7A43'] : k === 'upcoming' ? ['#FDF1E6', '#B35A00'] : ['#EEF0F2', '#6b7280']; return <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: '600', color: c[1], backgroundColor: c[0], borderRadius: 999, paddingVertical: 3, paddingHorizontal: 7, overflow: 'hidden' }}>{k[0].toUpperCase() + k.slice(1)}</Text>; } },
            { k: 'start', l: 'Start', pick: DATE_RANGES.map(([k, l]) => ({ v: k, l: k === 'custom' && (custom.from || custom.to) ? `${custom.from ? fdate(custom.from) : '…'} – ${custom.to ? fdate(custom.to) : '…'}` : l, test: k ? (s: SiteX) => { const r = dateRange(k, today(), custom), d = startOf(s); return !r || (!!d && d >= r[0] && d <= r[1]); } : undefined })), sort: (s) => String(s.start_date || (s as { created_at?: string }).created_at || '').slice(0, 10), render: (s) => { const d = s.start_date || (s as { created_at?: string }).created_at; return <Cell>{d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</Cell>; } },
            { k: 'pc', l: 'Postcode', off: true, render: (s) => <Cell>{s.postcode || '—'}</Cell> },
            { k: 'v', l: 'Value', ph: 'e.g. >50k', match: (s, qv) => { const tv = valueTest(qv); return !tv || tv(Number(data.jfBy[s.id]?.contract_value || 0)); }, sort: (s) => Number(data.jfBy[s.id]?.contract_value || 0) || null, render: (s) => { const v = Number(data.jfBy[s.id]?.contract_value || 0), m = data.m[s.id]; return <Cell tone={m?.overdue ? '#C0392B' : undefined}>{v ? money(v, 0) : '—'}</Cell>; } },
            // Off until ticked in ⚙ Columns, as the current app (9219f FIN_JOB_COLS).
            { k: 'inv', l: 'Invoiced', off: true, sort: (s) => data.m[s.id]?.inv || 0, render: (s) => <Cell>{data.m[s.id]?.inv ? money(data.m[s.id].inv, 0) : '—'}</Cell> },
            { k: 'owed', l: 'Owed', off: true, sort: (s) => data.m[s.id]?.owed || 0, render: (s) => <Cell>{data.m[s.id]?.owed ? money(data.m[s.id].owed, 0) : '—'}</Cell> },
            { k: 'od', l: 'Overdue', off: true, sort: (s) => data.m[s.id]?.overdue || 0, render: (s) => <Cell tone={data.m[s.id]?.overdue ? '#C0392B' : undefined}>{data.m[s.id]?.overdue ? money(data.m[s.id].overdue, 0) : '—'}</Cell> },
          ]}
          tally foot={(left) => <><FootText>{tallyText(left)}</FootText><FootText bold>Value Of Works {money(valueOf(left), 0)}</FootText></>} />
      ) : shown.length ? (
        <>
          <View accessibilityLabel="Projects table" style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden' }}>
            <PhoneHeads cols={pcols} find={find} pad={8} />
            <PhoneFindRow cols={pcols} find={find} pad={8} />
            {!phoneRows.length && <Text style={{ padding: 14, textAlign: 'center', color: base.slate, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>Nothing matches.</Text>}
            {phoneRows.map((s) => {
              const v = valOf(s), pm = pmName(s.responsible_pm_id);
              return (
                <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`${s.job_number || ''} ${s.name}`.trim()} onPress={() => router.push(`/fin/job/${s.id}` as never)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
                  <Text numberOfLines={1} style={{ width: W.no, textAlign: 'center', fontSize: 12, fontWeight: '600', color: base.ink }}>{s.job_number || '—'}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={{ fontSize: 13.5, fontWeight: '600', color: base.ink }}>{s.name}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate, marginTop: 1 }}>{cliOf(s) || 'No Client'}</Text>
                  </View>
                  {/* Red when money on the job is overdue, as on the laptop. */}
                  <Text numberOfLines={1} style={{ width: W.v, textAlign: 'center', fontSize: 13, fontWeight: '600', color: data.m[s.id]?.overdue ? '#C0392B' : base.ink }}>{v ? money(v, 0) : '—'}</Text>
                  <Text numberOfLines={2} style={{ width: W.pm, textAlign: 'center', fontSize: 12, color: pm ? base.ink : base.slate }}>{pm || '—'}</Text>
                </Pressable>
              );
            })}
          </View>
          <PhoneClear find={find} />
        </>
      ) : <Empty>No projects here.</Empty>}
    </FinPage>
  );
}
