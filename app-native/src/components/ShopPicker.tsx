// "Pick from a project quote" (915 openShopPicker): the job's shopping-list
// items from Finance's project quotes, with a search, a quote filter when there
// are several, and the rate for people who can see costs.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/rules/finance';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { base, radius } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
export type ShopItem = { id: string; description: string; unit: string | null; code: string | null; supplier_id: string | null; supplier_name: string | null; quote_id: string | null; quote_label: string | null; rate?: number | null };

/** Costs are shown to Finance users (unless hidden) and anyone given "see costs". */
export const canSeeCosts = (me: Profile | null | undefined) => !!me && ((me.finance_enabled && me.finance_hidden !== true) || !!me.see_costs);

export function useShopItems(siteId: string, on: boolean) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['shopItems', siteId], enabled: on && !!me,
    queryFn: async () => {
      const [items, prices] = await Promise.all([
        db.from('fin_shop_items').select('*').eq('site_id', siteId).eq('active', true).order('position', { ascending: true }),
        canSeeCosts(me) ? db.from('fin_shop_prices').select('item_id,rate').eq('org_id', me?.org_id as string) : Promise.resolve({ data: [] }),
      ]);
      const rate: Record<string, number> = {};
      ((prices.data as { item_id: string; rate: number }[] | null) ?? []).forEach((p) => { rate[p.item_id] = p.rate; });
      return ((items.data as ShopItem[] | null) ?? []).map((i) => ({ ...i, rate: rate[i.id] ?? null }));
    },
  });
}

export function ShopPicker({ siteId, onPick, onClose }: { siteId: string; onPick: (i: ShopItem) => void; onClose: () => void }) {
  const { data: items, isLoading } = useShopItems(siteId, true);
  const [q, setQ] = useState('');
  const [quote, setQuote] = useState<string>('');
  const quotes: Record<string, string> = {};
  (items ?? []).forEach((i) => { const k = i.quote_id || 'manual'; if (!quotes[k]) quotes[k] = i.quote_id ? i.quote_label || 'Quote' : 'Added by hand'; });
  const needle = q.trim().toLowerCase();
  const shown = (items ?? []).filter((i) => (!quote || (i.quote_id || 'manual') === quote)
    && (!needle || [i.description, i.code, i.supplier_name].join(' ').toLowerCase().includes(needle)));
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: base.card, borderRadius: radius.card, padding: 16, maxWidth: 560, width: '100%', alignSelf: 'center', maxHeight: '90%' }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: base.ink, marginBottom: 10 }}>Project quotes</Text>
          {isLoading ? <Text style={{ color: base.slate }}>Loading…</Text> : !items?.length ? (
            <Text style={{ color: base.slate, marginBottom: 10 }}>There are no project quotes for this project yet. Finance can add them from a supplier quote.</Text>
          ) : (
            <>
              {Object.keys(quotes).length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
                  {[['', 'All quotes'], ...Object.entries(quotes)].map(([k, l]) => (
                    <Pressable key={k || 'all'} onPress={() => setQuote(k)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: quote === k ? base.ink : base.line, backgroundColor: quote === k ? base.ink : base.card }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: quote === k ? '#fff' : base.ink }}>{l}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <TextInput value={q} onChangeText={setQ} placeholder="Search" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, color: base.ink }} />
              <ScrollView style={{ maxHeight: 420 }}>
                {shown.map((i) => (
                  <Pressable key={i.id} onPress={() => onPick(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: base.line }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontWeight: '700', color: base.ink }}>{i.description}</Text>
                      <Text style={{ fontSize: 12, color: base.slate }}>{[i.quote_label || i.supplier_name, i.code, i.unit ? `per ${i.unit}` : ''].filter(Boolean).join(' · ')}</Text>
                    </View>
                    {i.rate != null && <Text style={{ fontWeight: '700', color: base.ink }}>{money(i.rate)}</Text>}
                  </Pressable>
                ))}
                {!shown.length && <Text style={{ color: base.slate, textAlign: 'center', paddingVertical: 14 }}>No match.</Text>}
              </ScrollView>
            </>
          )}
          <View style={{ marginTop: 12 }}><Button kind="ghost" title="Close" onPress={onClose} /></View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
