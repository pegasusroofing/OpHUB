// Add a Project (180 addSite): name, address, postcode, job number (or the next
// automatic one), client (typing suggests Directory clients and past clients; free text is fine),
// contact number and email, multi-site or repair contract, Active or Upcoming, and a start date.
// Client, address and start date are required (Andy). PMs / admins only.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FinChip } from '@/components/FinNav';
import { DateField } from '@/components/DateField';
import { SuggestField } from '@/components/SuggestField';
import { useToast } from '@/components/toast';
import { Button, Card, Check, Field, Muted } from '@/components/ui';
import { createSite, type NewSite } from '@/data/siteList';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { clientPortfolio } from '@/lib/rules/checkin';
import { isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

// 030 applyTitleCase: capitals only at the start or after a space (Andy's House, not Andy'S House).
const titleCase = (t: string) => t.replace(/(^|\s)([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase());
const EMPTY: NewSite = { name: '', address: '', postcode: '', job_number: '', client_name: '', client_phone: '', client_email: '', multi_site: false, repair_contract: false, status: 'active', start_date: '' };

export default function NewProject() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data: nums } = useQuery({ queryKey: ['orgNums', me?.org_id], enabled: !!me, queryFn: async () => (await supabase.from('organizations').select('auto_job_numbers,job_number_prefix,next_job_number').eq('id', me?.org_id as string).maybeSingle()).data as { auto_job_numbers?: boolean; job_number_prefix?: string | null; next_job_number?: number | null } | null });
  // Directory clients (Finance) — PMs without Finance just get past clients.
  const { data: dir = [] } = useQuery({ queryKey: ['dirClients', me?.org_id], enabled: !!me, queryFn: async () => ((await supabase.from('fin_clients').select('id,name,email,phone').eq('org_id', me?.org_id as string).order('name')).data as { id: string; name: string; email?: string | null; phone?: string | null }[] | null) ?? [] });
  const [d, setD] = useState<NewSite>(EMPTY);
  const [chosen, setChosen] = useState(false); // Active / Upcoming must be picked
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project managers and admins only.</Muted>;
  const set = (p: Partial<NewSite>) => setD({ ...d, ...p });
  const auto = !!nums?.auto_job_numbers;
  const saved = clientPortfolio(sites);
  const clients = (() => {
    const by: Record<string, { key: string; label: string; sub?: string; phone: string; email: string }> = {};
    dir.forEach((c) => { const n = String(c.name || '').trim(); if (n) by[n.toLowerCase()] = { key: `d${c.id}`, label: n, phone: c.phone || '', email: c.email || '' }; });
    saved.forEach((c) => { const k = c.name.toLowerCase(), x = by[k]; if (x) { x.phone ||= c.phone; x.email ||= c.email; } else by[k] = { key: `p${k}`, label: c.name, phone: c.phone, email: c.email }; });
    return Object.values(by).map((c) => ({ ...c, sub: [c.phone, c.email].filter(Boolean).join(' · ') }));
  })();
  const save = async () => {
    if (!d.name.trim()) { toast('Enter a site name.'); return; }
    if (!d.address.trim()) { toast('Enter the address.'); return; }
    if (!auto && !d.job_number.trim()) { toast('Enter a job number.'); return; }
    if (!d.client_name.trim()) { toast('Enter the client.'); return; }
    if (!chosen) { toast('Choose whether this site is Active or Upcoming.'); return; }
    if (!d.start_date) { toast('Choose the start date.'); return; }
    if (d.client_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.client_email.trim())) { toast('Enter a valid client email address.'); return; }
    setBusy(true);
    const r = await createSite(me, { ...d, name: d.name.trim(), address: d.address.trim(), postcode: d.postcode.trim(), job_number: d.job_number.trim(), client_name: d.client_name.trim(), client_phone: d.client_phone.trim(), client_email: d.client_email.trim(), start_date: d.start_date }, auto);
    setBusy(false);
    if ('error' in r) { toast(r.error); return; }
    await qc.invalidateQueries({ queryKey: ['sites'] });
    router.replace(`/sites/${r.id}` as never);
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Add a Project' }} />
      <Card>
        <Field label="Site name *" value={d.name} onChangeText={(v) => set({ name: titleCase(v) })} />
        <Field label="Address *" value={d.address} onChangeText={(v) => set({ address: titleCase(v) })} />
        <Field label="Postcode" value={d.postcode} onChangeText={(v) => set({ postcode: v.toUpperCase() })} autoCapitalize="characters" />
        <Field label="Job number" value={auto ? `${nums?.job_number_prefix || ''}${nums?.next_job_number ?? ''} (given automatically)` : d.job_number} onChangeText={(v) => set({ job_number: v })} editable={!auto} />
        <SuggestField label="Client *" value={d.client_name} onChangeText={(v) => set({ client_name: titleCase(v) })} placeholder="Start typing — clients from the Directory come up" items={clients}
          onPick={(c) => { const x = clients.find((y) => y.key === c.key); set({ client_name: c.label, client_phone: x?.phone || d.client_phone, client_email: x?.email || d.client_email }); }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 4 }}><Field label="Contact number" value={d.client_phone} onChangeText={(v) => set({ client_phone: v })} keyboardType="phone-pad" /></View>
          <View style={{ flex: 6 }}><Field label="Contact email" value={d.client_email} onChangeText={(v) => set({ client_email: v })} keyboardType="email-address" autoCapitalize="none" /></View>
        </View>
        <Check label="Multi-site job (several addresses / plots)" value={d.multi_site} onChange={(x) => set({ multi_site: x, repair_contract: x ? false : d.repair_contract })} />
        <Check label="Repair / maintenance contract" value={d.repair_contract} onChange={(x) => set({ repair_contract: x, multi_site: x ? false : d.multi_site })} />
        <Text style={{ fontWeight: '700', color: base.ink, marginTop: 10, marginBottom: 6 }}>Status</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <FinChip on={chosen && d.status === 'active'} label="Active" onPress={() => { setChosen(true); set({ status: 'active' }); }} />
          <FinChip on={chosen && d.status === 'upcoming'} label="Upcoming" onPress={() => { setChosen(true); set({ status: 'upcoming' }); }} />
        </View>
        <DateField label="Start date *" value={d.start_date} onChange={(v) => set({ start_date: v })} clearable={false} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <View style={{ flex: 2 }}><Button busy={busy} title="Create Project" onPress={() => void save()} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => router.back()} /></View>
        </View>
      </Card>
    </ScrollView>
  );
}
