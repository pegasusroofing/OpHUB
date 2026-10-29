// Add a Project (180 addSite): name, address, postcode, job number (or the next
// automatic one), client (type or pick a saved client), multi-site or repair
// contract, Active or Upcoming (with a start date). PMs / admins only.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FinChip } from '@/components/FinNav';
import { chooseAction, useToast } from '@/components/toast';
import { Button, Card, Check, Field, Muted } from '@/components/ui';
import { createSite, type NewSite } from '@/data/siteList';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { clientPortfolio } from '@/lib/rules/checkin';
import { readIsoDate } from '@/lib/rules/materials';
import { isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, space } from '@/theme/theme';

const titleCase = (t: string) => t.replace(/\b([a-z])/g, (c) => c.toUpperCase());
const EMPTY: NewSite = { name: '', address: '', postcode: '', job_number: '', client_name: '', client_phone: '', client_email: '', multi_site: false, repair_contract: false, status: 'active', start_date: '' };

export default function NewProject() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data: nums } = useQuery({ queryKey: ['orgNums', me?.org_id], enabled: !!me, queryFn: async () => (await supabase.from('organizations').select('auto_job_numbers,job_number_prefix,next_job_number').eq('id', me?.org_id as string).maybeSingle()).data as { auto_job_numbers?: boolean; job_number_prefix?: string | null; next_job_number?: number | null } | null });
  const [d, setD] = useState<NewSite>(EMPTY);
  const [chosen, setChosen] = useState(false); // Active / Upcoming must be picked
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project managers and admins only.</Muted>;
  const set = (p: Partial<NewSite>) => setD({ ...d, ...p });
  const auto = !!nums?.auto_job_numbers;
  const saved = clientPortfolio(sites);
  const save = async () => {
    if (!d.name.trim()) { toast('Enter a site name.'); return; }
    if (!auto && !d.job_number.trim()) { toast('Enter a job number.'); return; }
    if (!chosen) { toast('Choose whether this site is Active or Upcoming.'); return; }
    if (d.client_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.client_email.trim())) { toast('Enter a valid client email address.'); return; }
    const sd = d.status === 'upcoming' && d.start_date.trim() ? readIsoDate(d.start_date) : '';
    if (sd === 'bad') { toast('Start date should look like 2026-11-30.'); return; }
    setBusy(true);
    const r = await createSite(me, { ...d, name: d.name.trim(), address: d.address.trim(), postcode: d.postcode.trim(), job_number: d.job_number.trim(), client_name: d.client_name.trim(), client_phone: d.client_phone.trim(), client_email: d.client_email.trim(), start_date: sd || '' }, auto);
    setBusy(false);
    if ('error' in r) { toast(r.error); return; }
    await qc.invalidateQueries({ queryKey: ['sites'] });
    const made = ((await supabase.from('sites').select('job_number').eq('id', r.id).maybeSingle()).data as { job_number?: string | null } | null);
    toast(auto && made?.job_number ? `Site created — job number ${made.job_number}` : 'Site created');
    router.replace(`/sites/${r.id}` as never);
  };
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Add a Project' }} />
      <Card>
        <Field label="Site name" value={d.name} onChangeText={(v) => set({ name: titleCase(v) })} />
        <Field label="Address" value={d.address} onChangeText={(v) => set({ address: titleCase(v) })} />
        <Field label="Postcode" value={d.postcode} onChangeText={(v) => set({ postcode: v.toUpperCase() })} autoCapitalize="characters" />
        <Field label="Job number" value={auto ? `${nums?.job_number_prefix || ''}${nums?.next_job_number ?? ''} (given automatically)` : d.job_number} onChangeText={(v) => set({ job_number: v })} editable={!auto} />
        <Text style={{ fontWeight: '700', color: base.ink, marginTop: 6, marginBottom: 4 }}>Client (optional)</Text>
        {saved.length > 0 && <Button kind="ghost" title={`📇 Choose a saved client (${saved.length})`} onPress={async () => {
          const k = await chooseAction('Saved clients', saved.map((c) => ({ key: c.name, label: `${c.name}${c.contact ? ` — ${c.contact}` : ''}` })));
          const c = saved.find((x) => x.name === k); if (!c) return;
          set({ client_name: c.name, client_phone: c.phone || d.client_phone, client_email: c.email || d.client_email }); toast('Client details filled in');
        }} />}
        <Field label="Client name" value={d.client_name} onChangeText={(v) => set({ client_name: titleCase(v) })} placeholder="Client name — type or pick" />
        <Field label="Client contact number" value={d.client_phone} onChangeText={(v) => set({ client_phone: v })} keyboardType="phone-pad" />
        <Field label="Client contact email" value={d.client_email} onChangeText={(v) => set({ client_email: v })} keyboardType="email-address" autoCapitalize="none" />
        <Check label="Multi-site job (several addresses / plots)" value={d.multi_site} onChange={(x) => set({ multi_site: x, repair_contract: x ? false : d.repair_contract })} />
        <Check label="Repair / maintenance contract" value={d.repair_contract} onChange={(x) => set({ repair_contract: x, multi_site: x ? false : d.multi_site })} />
        <Text style={{ fontWeight: '700', color: base.ink, marginTop: 10, marginBottom: 6 }}>Status</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <FinChip on={chosen && d.status === 'active'} label="Active" onPress={() => { setChosen(true); set({ status: 'active' }); }} />
          <FinChip on={chosen && d.status === 'upcoming'} label="Upcoming" onPress={() => { setChosen(true); set({ status: 'upcoming' }); }} />
        </View>
        {chosen && d.status === 'upcoming' && <Field label="Start date" value={d.start_date} onChangeText={(v) => set({ start_date: v })} placeholder="YYYY-MM-DD" autoCapitalize="none" />}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <View style={{ flex: 2 }}><Button busy={busy} title="Create Project" onPress={() => void save()} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => router.back()} /></View>
        </View>
      </Card>
    </ScrollView>
  );
}
