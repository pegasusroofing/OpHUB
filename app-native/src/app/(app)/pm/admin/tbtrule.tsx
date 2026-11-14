// Admin Centre › Health & Safety › Toolbox Talks Required, company admins only (Andy, 14 Nov 2026: "we need to set up
// the rules for tbt required monthly in the admin please, some companies may have it more infrequent"). How often each
// live project needs a Toolbox Talk issued and signed; the Hub and each project's Toolbox Talks page go by it. Saved on
// the company (organizations.tbt_every), so phone and laptop match. Not set = every month, as before.
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { SelectBox } from '@/components/SelectBox';
import { useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { TBT_EVERY, tbtEvery, tbtPeriod, type TbtEvery } from '@/lib/rules/tbt';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const WHEN: Record<TbtEvery, string> = {
  week: 'Each week runs Monday to Sunday; the talk is due by the Friday.',
  '2weeks': 'Each fortnight starts on a Monday; the talk is due by the first Friday.',
  month: 'Due by the 7th of each month.',
  '2months': 'Due by the 7th of January, March, May, July, September and November.',
  '3months': 'Due by the 7th of January, April, July and October.',
  '6months': 'Due by the 7th of January and July.',
  off: 'No Toolbox Talk reminders in the Hub or on projects.',
};

export default function TbtRuleSettings() {
  const { me, org, refresh } = useAuth();
  const toast = useToast();
  const [picked, setV] = useState<TbtEvery | null>(null);
  const [busy, setBusy] = useState(false);
  const v = picked ?? tbtEvery(org?.tbt_every);
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  const save = async () => {
    setBusy(true);
    const r = await db.from('organizations').update({ tbt_every: v } as never).eq('id', me.org_id as string).select('id');
    setBusy(false);
    if (r.error || !(r.data as unknown[] | null)?.length) { toast('Could not save — try again.'); return; }
    await refresh();
    router.back();
  };
  const p = tbtPeriod(v);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Toolbox Talks Required' }} />
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>How Often Does Each Live Project Need A Toolbox Talk?</Text>
        <Muted style={{ marginBottom: 12 }}>A talk issued on a project counts for the period it was issued in. Projects that are due or overdue show in the Hub and on the project&apos;s Toolbox Talks page.</Muted>
        <SelectBox title="Toolbox Talks Required" value={v} options={TBT_EVERY.map((x) => [x.k, x.l])} onChange={setV} />
        <Muted>{WHEN[v]}{p ? ` The current one is due by ${fmt(p.due)}.` : ''}</Muted>
        <View style={{ marginTop: 14 }}><Button busy={busy} title="Save" onPress={() => void save()} /></View>
      </Card>
    </ScrollView>
  );
}
