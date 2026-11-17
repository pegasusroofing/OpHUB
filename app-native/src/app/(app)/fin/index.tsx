// Finance › Overview (914 renderFinanceHome): six tiles and what needs attention. Andy, 17 Nov 2026: the tiles stay in
// their places (Live Contract Value with the number of jobs as a note, Still To Invoice, Owed To You, Overdue, Due Out
// To Suppliers, Retention Held By Clients); each tile's ⋯ changes what its own figure covers (live / upcoming / closed /
// all / by date / by client, next 30 / 60 days, how late, by supplier …), kept for each person (profiles.fin_home_tiles).
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { askDate } from '@/components/DateField';
import { FinPage, FinStat, TONE } from '@/components/FinNav';
import { chooseAction, showAlert } from '@/components/toast';
import { Card, Muted } from '@/components/ui';
import { useDueOut, useFinOverview } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { money, today } from '@/lib/rules/finance';
import { contractFigure, dueOutFigure, overdueFigure, owedFigure, readViews, retentionFigure, TILE_CHOICES, TILE_ORDER, tileLabel, toInvoiceFigure, writeViews, type Figure, type TileKey, type View as TileView, type Views } from '@/lib/rules/finTiles';
import { supabase } from '@/lib/supabase';
import { base, useDesk } from '@/theme/theme';

// Finance labels in Title Case, as the current app (9219x finTitleCase).
const KEEP = new Set(['PO', 'POs', 'VAT', 'CIS']);
const titleCase = (x: string) => x.replace(/[A-Za-z][A-Za-z'’.]*/g, (w) => (KEEP.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));
const NAME: Record<TileKey, string> = { live_value: 'Contract Value', to_invoice: 'Still To Invoice', owed: 'Owed To You', overdue: 'Overdue', due_out: 'Due Out To Suppliers', ret_held: 'Retention Held By Clients' };
const TONES: Record<TileKey, 'blue' | 'green' | 'red' | 'amber'> = { live_value: 'blue', to_invoice: 'blue', owed: 'green', overdue: 'red', due_out: 'blue', ret_held: 'amber' };
const names = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))].sort((a, b) => a.localeCompare(b));

export default function FinOverview() {
  const { me, refresh } = useAuth();
  const { data: sites } = useSites();
  const { data, isLoading } = useFinOverview(me, sites);
  const { data: pinvs } = useDueOut(me?.org_id);
  // Straight after a change, until the profile is read back.
  const [mine, setMine] = useState<Views | null>(null);
  const views = mine ?? readViews(me?.fin_home_tiles);
  // Two rows of three on a laptop, three rows of two on a phone.
  const basis = useDesk() ? '31%' : '45%';
  const now = today();

  const figure = (t: TileKey, v: TileView): Figure | null => {
    if (!data) return null;
    if (t === 'live_value') return contractFigure(data.jobs, v);
    if (t === 'to_invoice') return toInvoiceFigure(data.jobs, v);
    if (t === 'owed') return owedFigure(data.invRows, v, now);
    if (t === 'overdue') return overdueFigure(data.invRows, v, now);
    if (t === 'ret_held') return retentionFigure(data.jobs, v);
    return pinvs ? dueOutFigure(pinvs, v, now) : null;
  };
  // Who can be chosen: only those with something on that tile.
  const whoList = (t: TileKey) => {
    if (!data) return [];
    if (t === 'due_out') return names((pinvs ?? []).map((i) => i.supplier));
    if (t === 'owed') return names(data.invRows.filter((i) => i.out > 0).map((i) => i.client));
    if (t === 'overdue') return names(data.invRows.filter((i) => i.overdue && i.out > 0).map((i) => i.client));
    if (t === 'ret_held') return names(data.jobs.filter((j) => j.ret > 0).map((j) => j.client));
    return names(data.jobs.map((j) => j.client));
  };

  const choose = async (t: TileKey) => {
    const cur = views[t];
    const k = await chooseAction(NAME[t], TILE_CHOICES[t].map(([key, label]) => ({ key, label: `${cur.k === key ? '✓ ' : ''}${label}` })));
    if (!k || !me) return;
    let next: TileView = { k };
    if (k === 'dates') {
      const from = await askDate('From Date'); if (!from) return;
      const to = await askDate('To Date', { min: from }); if (!to) return;
      next = { k, from, to };
    } else if (k === 'client' || k === 'supplier') {
      const list = whoList(t);
      if (!list.length) { showAlert(k === 'client' ? 'There are no clients on this figure yet.' : 'There are no suppliers on this figure yet.'); return; }
      const who = await chooseAction(k === 'client' ? 'Which Client' : 'Which Supplier', list.map((n) => ({ key: n, label: `${cur.who === n ? '✓ ' : ''}${n}` })));
      if (!who) return;
      next = { k, who };
    } else if (k === cur.k) return;
    const all = { ...views, [t]: next };
    setMine(all);
    const r = await supabase.from('profiles').update({ fin_home_tiles: writeViews(all) } as never).eq('id', me.id).select('id');
    if (r.error || !r.data?.length) { setMine(null); showAlert('That couldn’t be saved. Try again.'); return; }
    void refresh();
  };

  // Where a tile opens: the list behind it, showing the same jobs where the list can.
  const go = (t: TileKey, v: TileView) => {
    if (t === 'live_value' || t === 'to_invoice') return `/fin/jobs?st=${['live', 'upcoming', 'closed', 'all'].includes(v.k) ? v.k : 'all'}`;
    if (t === 'owed') return '/fin/sales?tab=invoices';
    if (t === 'overdue') return '/fin/sales?tab=invoices&f=overdue';
    if (t === 'due_out') return '/fin/purchases?tab=invoices&f=unpaid';
    return '/fin/sales?tab=retention';
  };

  return (
    <FinPage title="OpHUB Finance" section="overview">
      {isLoading || !data ? <Muted>Loading…</Muted> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            {TILE_ORDER.map((t, i) => {
              const v = views[t], f = figure(t, v), label = tileLabel(t, v);
              return <FinStat key={t} basis={basis} v={f ? money(f.v, 0) : '…'} tone={TONES[t]} label={label} sub={f?.note} onPress={() => router.push(go(t, v) as never)}
                onMenu={() => void choose(t)} menuLabel={`Change tile ${i + 1}: ${NAME[t]}`} />;
            })}
          </View>
          {data.todo.length > 0 ? (
            <Card>
              <Text style={[{ fontWeight: '600' as const }, { fontSize: 15, color: '#111827', marginBottom: 4 }]}>Needs Attention</Text>
              {data.todo.map((x) => (
                <Pressable key={x.t} onPress={() => router.push(x.go as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderColor: '#F0F1F4' }}>
                  <Text style={{ width: 22, height: 22, lineHeight: 22, textAlign: 'center', fontWeight: '600', fontSize: 12, color: TONE[x.tone], backgroundColor: `${TONE[x.tone]}1F`, borderRadius: 6, overflow: 'hidden' }}>{x.n}</Text>
                  <View style={{ flex: 1 }}><Text style={{ fontWeight: '500', fontSize: 13.5, color: '#111827' }}>{titleCase(x.t)}</Text></View>
                  <Text style={{ color: base.slate }}>›</Text>
                </Pressable>
              ))}
            </Card>
          ) : <Card><Muted>Nothing needs attention right now.</Muted></Card>}
        </>
      )}
    </FinPage>
  );
}
