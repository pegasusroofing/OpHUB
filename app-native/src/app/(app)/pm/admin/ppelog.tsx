// Admin Centre › PPE Log (260 ppelog, 300 ppeLogRange): PPE issued across every
// site, weekly / monthly / yearly, filter by operative. Excel / PDF of the log,
// and the PPE Register (who currently holds which item, 300 exportPpeRegister).
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { logRange } from '@/lib/rules/checkinLog';
import { currentPpe, PPE_STANDARD_ITEMS, type Issuance } from '@/lib/rules/ppe';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import { isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Row = { id: string; user_id: string; site_id: string; items: string[] | null; status: string; issued_at: string; issued_by?: string | null };

export default function PpeLog() {
  const { me, org } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const { data: team = [] } = useTeam(me?.org_id);
  const { data: sites = [] } = useSites();
  const [mode, setMode] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [offset, setOffset] = useState(0);
  const [ops, setOps] = useState<string[]>([]);
  const range = logRange(mode, offset);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['ppeLog', me?.org_id, range.start, range.end],
    enabled: !!me,
    queryFn: async () => {
      const out: Row[] = [];
      for (let i = 0; ; i += 1000) {
        const r = ((await db.from('ppe_issuances').select('*').eq('org_id', me?.org_id as string).gte('issued_at', new Date(range.start).toISOString()).lt('issued_at', new Date(range.end).toISOString()).order('issued_at', { ascending: false }).order('id', { ascending: false }).range(i, i + 999)).data as Row[] | null) ?? [];
        out.push(...r); if (r.length < 1000) break;
      }
      return out;
    },
  });
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  const shown = ops.length ? rows.filter((r) => ops.includes(r.user_id)) : rows;
  const name = (id: string) => team.find((p) => p.id === id)?.name || 'Unknown';
  const logTable = (): Table => ({ title: `PPE Log (${range.label})`, cols: [{ l: 'Operative' }, { l: 'Item' }, { l: 'Site' }, { l: 'Issued date' }, { l: 'Status' }, { l: 'Issued by' }], rows: shown.slice().sort((a, b) => a.issued_at.localeCompare(b.issued_at)).flatMap((r) => (r.items?.length ? r.items : ['—']).map((item) => [name(r.user_id), item, sites.find((x) => x.id === r.site_id)?.name || '', new Date(r.issued_at).toLocaleDateString('en-GB'), r.status === 'signed' ? 'Signed' : 'Pending signature', r.issued_by ? name(r.issued_by) : ''])) });
  const register = async (): Promise<boolean> => {
    const all: Issuance[] = [];
    for (let i = 0; ; i += 1000) { const r = ((await db.from('ppe_issuances').select('id,user_id,items,status,issued_at').eq('org_id', me.org_id as string).eq('status', 'signed').order('issued_at', { ascending: false }).range(i, i + 999)).data as Issuance[] | null) ?? []; all.push(...r); if (r.length < 1000) break; }
    const opsAll = team.filter((p) => p.role === 'operative').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (!opsAll.length) { toast('No operatives to report on.'); return true; }
    const items = Array.from(new Set([...PPE_STANDARD_ITEMS, ...all.flatMap((x) => x.items || [])])).sort();
    return exportTableExcel({ title: 'PPE Register', sub: 'Items each operative currently holds (latest signed issue)', cols: [{ l: 'Operative' }, ...items.map((x) => ({ l: x, w: 70 }))], rows: opsAll.map((p) => { const cur = new Set(currentPpe(all, p.id)); return [p.name, ...items.map((x) => (cur.has(x) ? 'Issued' : ''))]; }) }, org);
  };
  const run = async (k: string, fn: () => Promise<boolean>) => { if (k !== 'r' && !shown.length) { toast('No PPE issued in that range.'); return; } setBusy(k); const ok = await fn().catch(() => false); setBusy(''); if (!ok) toast('Could not make the file — try again.'); };
  const chip = (on: boolean, l: string, onPress: () => void) => <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}><Text style={{ fontWeight: '700', fontSize: 12, color: on ? '#fff' : base.ink }}>{l}</Text></Pressable>;
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'PPE Log' }} />
      <Muted style={{ marginBottom: 10 }}>PPE issued across every site, for whichever period and operative(s) you choose.</Muted>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['weekly', 'monthly', 'yearly'] as const).map((m) => chip(mode === m, m[0].toUpperCase() + m.slice(1), () => { setMode(m); setOffset(0); }))}
        <View style={{ flex: 1 }} />
        {chip(!!ops.length, ops.length ? (ops.length === 1 ? name(ops[0]) : `${ops.length} selected`) : 'All operatives', async () => {
          const k = await chooseAction('Filter by operative', [{ key: '__clear', label: 'Clear filter' }, ...team.filter((p) => p.role === 'operative').map((p) => ({ key: p.id, label: `${ops.includes(p.id) ? '☑' : '☐'} ${p.name}` }))]);
          if (k === '__clear') setOps([]); else if (k) setOps(ops.includes(k) ? ops.filter((x) => x !== k) : [...ops, k]);
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Pressable onPress={() => setOffset(offset - 1)} style={{ padding: 8 }}><Text style={{ fontSize: 18 }}>‹</Text></Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontWeight: '800', color: base.ink }}>{range.label}</Text>
        <Pressable disabled={offset >= 0} onPress={() => setOffset(offset + 1)} style={{ padding: 8, opacity: offset >= 0 ? 0.35 : 1 }}><Text style={{ fontSize: 18 }}>›</Text></Pressable>
      </View>
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{name(r.user_id)}</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: r.status === 'signed' ? base.ok : base.warn }}>{r.status === 'signed' ? 'Signed' : 'Pending'}</Text>
          </View>
          <Text style={{ color: base.ink }}>{(r.items || []).join(', ')}</Text>
          <Muted>{sites.find((s) => s.id === r.site_id)?.name || ''} · {new Date(r.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
        </Card>
      )) : <Empty>No PPE issued in this period.</Empty>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <Button kind="ghost" title={busy === 'x' ? 'Making…' : '📊 Export to Excel'} onPress={() => run('x', () => exportTableExcel(logTable(), org))} />
        <Button kind="ghost" title={busy === 'p' ? 'Making…' : '📄 Export to PDF'} onPress={() => run('p', () => exportTablePdf(logTable(), org))} />
        <Button kind="ghost" title={busy === 'r' ? 'Making…' : '📋 PPE Register (all operatives)'} onPress={() => run('r', register)} />
      </View>
    </ScrollView>
  );
}
