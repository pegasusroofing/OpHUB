// Leftovers to allocate (Andy, 4 Nov 2026): anything booked back into the yard as leftovers waits here for a PM,
// admin or Finance to say which job it came from. That job gets the cost back at the yard rate (yard_allocate_leftover);
// "No Job" just leaves it as stock. On a job's Yard Stock page it shows that job's leftovers and ones with no job given.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { chooseAction, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { allocateLeftover, useYard } from '@/data/materials';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { yardQty } from '@/lib/rules/materials';
import { supabase } from '@/lib/supabase';
import { base } from '@/theme/theme';

type Left = { id: string; stock_id: string; qty: number; note: string | null; created_by: string | null; created_at: string; from_site_id: string | null };

export function useLeftovers(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['yard', orgId, 'leftovers'], enabled: !!orgId,
    queryFn: async () => ((await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from('yard_moves').select('id,stock_id,qty,note,created_by,created_at,from_site_id').eq('org_id', orgId as string).eq('leftover', true).eq('alloc_status', 'pending').order('created_at', { ascending: false }).limit(200)).data as Left[] | null) ?? [],
  });
}

export function YardLeftovers({ siteId }: { siteId?: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: all = [] } = useLeftovers(me?.org_id);
  const { data: items = [] } = useYard(me?.org_id);
  const { data: sites = [] } = useSites();
  const { data: people } = usePeople();
  const [busy, setBusy] = useState<string | null>(null);
  const list = siteId ? all.filter((l) => !l.from_site_id || l.from_site_id === siteId) : all;
  if (!me || !list.length) return null;
  const jobName = (id: string | null) => { const s = sites.find((x) => x.id === id); return s ? `${s.job_number ? `${s.job_number} ` : ''}${s.name}` : ''; };
  const go = async (l: Left, site: string | null) => {
    setBusy(l.id);
    const err = await allocateLeftover(l.id, site);
    setBusy(null);
    if (err) { toast(err); return; }
    toast(site ? `Credited to ${jobName(site)}` : 'Kept as yard stock, no job credited');
    void qc.invalidateQueries({ queryKey: ['yard'] });
  };
  const choose = async (l: Left) => {
    const k = await chooseAction('Which job did it come from?', sites.filter((s) => s.status !== 'closed').map((s) => ({ key: s.id, label: jobName(s.id) })));
    if (k) void go(l, k);
  };
  return (
    <Card style={{ borderColor: '#F5D08A', backgroundColor: '#FFFBF0' }}>
      <SectionTitle>↩ Leftovers To Allocate ({list.length})</SectionTitle>
      <Muted style={{ marginBottom: 6 }}>Booked back into the yard. Say which job they came from and that job gets the cost back at the yard rate.</Muted>
      {list.map((l) => {
        const s = items.find((x) => x.id === l.stock_id);
        const target = siteId ?? l.from_site_id;
        return (
          <View key={l.id} style={{ borderTopWidth: 1, borderTopColor: base.line, paddingVertical: 8 }}>
            <Text style={{ fontWeight: '600', color: base.ink }}>{s?.item ?? 'Item'} <Text style={{ color: base.slate, fontWeight: '600' }}>× {yardQty(l.qty)} {s?.unit || ''}</Text></Text>
            <Muted>{[new Date(l.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), l.created_by ? `by ${nameOf(people, l.created_by)}` : '', l.from_site_id ? `says from ${jobName(l.from_site_id)}` : 'no job given', l.note].filter(Boolean).join(' · ')}</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {!!target && <Button small busy={busy === l.id} title={siteId ? 'Credit This Job' : `Credit ${jobName(target)}`} onPress={() => void go(l, target)} />}
              <Button small kind="ghost" title="Choose Job" onPress={() => void choose(l)} />
              <Button small kind="ghost" title="No Job" onPress={() => void go(l, null)} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

