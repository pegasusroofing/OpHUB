// Admin Centre › Company › Job Numbers, company admins only (Andy, 18 Nov 2026: "There is no simple way of setting up
// job numbers, job numbers should have the option with an optional prefix and when setting up in projects it links to
// finance and vice versa so duplicates not made"). One company setting, the same one Finance › Settings › Project
// Numbers changes: number new jobs automatically (Yes / No), an optional prefix and the next number. Jobs made in
// Projects or in Finance both take the next number, and the database won't give two jobs the same number.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { YesNo } from '@/components/OneDriveSettings';
import { showAlert } from '@/components/toast';
import { Button, Card, Field, Muted } from '@/components/ui';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { jobNumberClash } from '@/lib/rules/jobNumbers';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Nums = { auto_job_numbers?: boolean | null; job_number_prefix?: string | null; next_job_number?: number | null };

export default function JobNumbers() {
  const { me } = useAuth();
  const { data: o, isLoading } = useQuery({ queryKey: ['orgNums', me?.org_id], enabled: !!me?.org_id, queryFn: async () => ((await db.from('organizations').select('auto_job_numbers,job_number_prefix,next_job_number').eq('id', me?.org_id as string).maybeSingle()).data as Nums | null) });
  if (!me) return null;
  if (me.role !== 'admin') return <><Stack.Screen options={{ title: 'Job Numbers' }} /><Muted style={{ padding: space.l }}>Company admins only.</Muted></>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  return <NumbersForm o={o ?? {}} orgId={me.org_id as string} />;
}

/** The form, started from the company's saved setting. */
function NumbersForm({ o, orgId }: { o: Nums; orgId: string }) {
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const [auto, setAuto] = useState(!!o.auto_job_numbers);
  const [prefix, setPrefix] = useState(o.job_number_prefix || '');
  const [next, setNext] = useState(o.next_job_number != null ? String(o.next_job_number) : '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const n = Number(next);
  const save = async () => {
    const p = prefix.trim();
    if (auto && (!Number.isInteger(n) || n < 1)) { showAlert('Enter the next job number, for example 2700.'); return; }
    const clash = auto ? jobNumberClash(`${p}${n}`, sites) : null;
    if (clash) { showAlert(`Job number ${p}${n} is already used on ${clash}. Pick a higher number.`); return; }
    setBusy(true);
    const r = await db.from('organizations').update({ auto_job_numbers: auto, job_number_prefix: p, next_job_number: auto ? n : (o?.next_job_number ?? null) } as never).eq('id', orgId).select('id');
    setBusy(false);
    if (r.error || !(r.data as unknown[] | null)?.length) { showAlert('That couldn’t be saved. Try again.'); return; }
    ['orgNums', 'finOrgNums'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    // The Admin Centre has tabs now, with no list to step back to, so it stays here and the button says Saved until
    // something changes (Andy, 18 Nov 2026: "more tab style please and sub tabs").
    setSaved(true);
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Job Numbers' }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10 }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: base.ink }}>Number new jobs automatically?</Text>
          <YesNo label="Number New Jobs Automatically" value={auto} onChange={(x) => { setAuto(x); setSaved(false); }} />
        </View>
        {auto ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Field label="Prefix (Optional)" value={prefix} onChangeText={(x) => { setPrefix(x); setSaved(false); }} placeholder="e.g. RTB-" autoCapitalize="characters" /></View>
              <View style={{ flex: 1 }}><Field label="Next Number" value={next} onChangeText={(v) => { setNext(v.replace(/[^0-9]/g, '')); setSaved(false); }} keyboardType="number-pad" placeholder="e.g. 2700" /></View>
            </View>
            <Muted style={{ marginBottom: 10 }}>The next new job will be {prefix.trim()}{next || '…'}, whether it&apos;s set up in Projects or in Finance.</Muted>
          </>
        ) : <Muted style={{ marginBottom: 10 }}>Each new job&apos;s number is typed in when it&apos;s set up. A number already used on another job won&apos;t be taken.</Muted>}
        <Muted style={{ marginBottom: 12 }}>This is the same setting as Finance › Settings › Project Numbers.</Muted>
        <View style={{ alignItems: 'center' }}><Button busy={busy} disabled={saved} title={saved ? 'Saved' : 'Save'} onPress={() => void save()} /></View>
      </Card>
    </ScrollView>
  );
}
