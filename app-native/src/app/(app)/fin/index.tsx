// Finance › Overview (914 renderFinanceHome): six tiles (live contract value and jobs, still to invoice, owed, overdue,
// due out to suppliers, retention held), and what needs attention. Andy, 17 Nov 2026: each tile's ⋯ chooses what it
// shows, kept for each person (profiles.fin_home_tiles); the number of live jobs is a note on the first tile, and Due
// Out To Suppliers is fifth.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FinPage, FinStat, TONE } from '@/components/FinNav';
import { chooseAction, showAlert } from '@/components/toast';
import { Card, Muted } from '@/components/ui';
import { useDueOut, useFinOverview } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/rules/finance';
import { DEFAULT_FIN_TILES, FIN_TILE_KEYS, FIN_TILES, finTileOrder, isStandardTiles, setFinTile, type FinTile } from '@/lib/rules/finTiles';
import { supabase } from '@/lib/supabase';
import { base, useDesk } from '@/theme/theme';

// Finance labels in Title Case, as the current app (9219x finTitleCase).
const KEEP = new Set(['PO', 'POs', 'VAT', 'CIS']);
const titleCase = (x: string) => x.replace(/[A-Za-z][A-Za-z'’.]*/g, (w) => (KEEP.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));

export default function FinOverview() {
  const { me, refresh } = useAuth();
  const { data: sites } = useSites();
  const { data, isLoading } = useFinOverview(me, sites);
  const { data: out } = useDueOut(me?.org_id);
  // Straight after a change, until the profile is read back.
  const [mine, setMine] = useState<FinTile[] | null>(null);
  const tiles = mine ?? finTileOrder(me?.fin_home_tiles);
  // Two rows of three on a laptop, three rows of two on a phone.
  const basis = useDesk() ? '31%' : '45%';

  const choose = async (slot: number) => {
    const cur = tiles[slot];
    const k = await chooseAction(`Show On Tile ${slot + 1}`, [
      ...FIN_TILE_KEYS.map((x) => {
        const at = tiles.indexOf(x);
        return { key: x, label: `${x === cur ? '✓ ' : ''}${FIN_TILES[x]}${at >= 0 && x !== cur ? ` · On Tile ${at + 1}` : ''}` };
      }),
      ...(isStandardTiles(tiles) ? [] : [{ key: '__std', label: 'Back To The Standard Tiles' }]),
    ]);
    if (!k || !me || k === cur) return;
    const next = k === '__std' ? [...DEFAULT_FIN_TILES] : setFinTile(tiles, slot, k as FinTile);
    setMine(next);
    const r = await supabase.from('profiles').update({ fin_home_tiles: isStandardTiles(next) ? null : next } as never).eq('id', me.id).select('id');
    if (r.error || !r.data?.length) { setMine(null); showAlert('Your tiles couldn’t be saved. Try again.'); return; }
    void refresh();
  };

  const show = (k: FinTile): { v: string; tone: 'blue' | 'green' | 'red' | 'amber'; sub?: string | null; go: string } => {
    const d = data!;
    switch (k) {
      case 'live_value': return { v: money(d.liveValue, 0), tone: 'blue', sub: `${d.liveCount} Live Job${d.liveCount === 1 ? '' : 's'}`, go: '/fin/jobs' };
      case 'live_jobs': return { v: String(d.liveCount), tone: 'blue', go: '/fin/jobs' };
      case 'to_invoice': return { v: money(d.toInvoice, 0), tone: 'blue', go: '/fin/sales?tab=invoices' };
      case 'owed': return { v: money(d.owed, 0), tone: 'green', go: '/fin/sales?tab=invoices' };
      case 'overdue': return { v: money(d.overdue, 0), tone: 'red', go: '/fin/sales?tab=invoices&f=overdue' };
      // Approved and not paid, including VAT, as Purchases' To Pay Suppliers; invoices still being checked as a note.
      case 'due_out': return { v: out ? money(out.due, 0) : '…', tone: 'blue', sub: out?.checkingN ? `Plus ${money(out.checking, 0)} To Check` : null, go: '/fin/purchases?tab=invoices&f=unpaid' };
      case 'ret_held': return { v: money(d.retHeld, 0), tone: 'amber', go: '/fin/sales?tab=retention' };
    }
  };

  return (
    <FinPage title="OpHUB Finance" section="overview">
      {isLoading || !data ? <Muted>Loading…</Muted> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            {tiles.map((k, i) => {
              const s = show(k);
              return <FinStat key={k} basis={basis} v={s.v} tone={s.tone} label={FIN_TILES[k]} sub={s.sub} onPress={() => router.push(s.go as never)}
                onMenu={() => void choose(i)} menuLabel={`Change tile ${i + 1}: ${FIN_TILES[k]}`} />;
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
