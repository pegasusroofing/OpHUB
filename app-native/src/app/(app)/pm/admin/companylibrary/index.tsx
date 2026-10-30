// Admin Centre › Main Contractor › Subcontractor Library (570 renderCompanyLibraryHub):
// every subcontractor company's own document library, shared across every site
// that company is added to. Add and rename companies (a rename follows onto
// every job, so the company is never added twice under two names).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export default function CompanyLibrary() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['companyLib', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('subcontractor_company_profiles').select('id,name').eq('org_id', me?.org_id as string).order('name')).data as { id: string; name: string }[] | null) ?? [],
  });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['companyLib'] }); };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Subcontractor Library' }} />
      <Muted style={{ marginBottom: 12 }}>Every subcontractor company&apos;s own document library — shared across every site that company is added to.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((p) => (
        <Pressable key={p.id} onPress={() => router.push(`/pm/admin/companylibrary/${p.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: base.ink, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>{p.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</Text></View>
          <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{p.name}</Text>
          <Pressable hitSlop={8} onPress={async () => {
            const n = await promptText('Rename company', p.name); if (!n || !n.trim() || n.trim() === p.name) return;
            if (!(await db.from('subcontractor_company_profiles').update({ name: n.trim() } as never).eq('id', p.id).select('id')).data?.length) { toast('Could not rename — try again.'); return; }
            const jobs = !(await db.from('subcontractor_companies').update({ name: n.trim() } as never).eq('master_company_id', p.id)).error;
            toast(jobs ? 'Renamed' : 'Renamed in the library, but not on every job — try again.'); refresh();
          }}><Text>✏️</Text></Pressable>
        </Pressable>
      )) : <Empty>No companies in the library yet.</Empty>}
      {adding ? (
        <Card>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Acme Scaffolding" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setAdding(false)} /></View>
            <View style={{ flex: 1 }}><Button title="Add" onPress={async () => {
              if (!name.trim()) { toast('Enter a company name.'); return; }
              if ((await db.from('subcontractor_company_profiles').insert({ org_id: me.org_id, name: name.trim(), created_by: me.id } as never)).error) { toast('Could not save — try again.'); return; }
              toast('Company added to the library'); setAdding(false); setName(''); refresh();
            }} /></View>
          </View>
        </Card>
      ) : <Button kind="ghost" title="+ Add Company" onPress={() => setAdding(true)} />}
      <Button kind="ghost" title="📋 Inspection templates (Report Templates)" onPress={() => router.push('/pm/admin/templates' as never)} />
    </ScrollView>
  );
}
