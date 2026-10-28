// Subcontractors on this job (550 renderSubcontractors). Everyone sees the list;
// an operative opens only their own company. Managers add (linked to the company
// library), rename (when not shared with another job) and remove.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { useSite } from '@/data/sites';
import { addSubco, deleteSubco, renameSubco, useSubcos } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

export default function Subcontractors() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useSubcos(site, me);
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['subcos', id] }); void qc.invalidateQueries({ queryKey: ['mcTiles', id] }); };
  const canOpen = (cid: string) => mgr || me.role === 'client' || cid === data?.myCompany;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Subcontractors' }} />
      <Muted style={{ marginBottom: 12 }}>Each subcontractor gets their own tile with RAMS, COSHH, Toolbox Talks, Daily Briefings and their own operatives — only operatives allocated to a company can open that company's tile.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : data?.companies.length ? data.companies.map((c) => {
        const editable = mgr && (!c.master_company_id || (data.usage[c.master_company_id] || 0) <= 1);
        return (
          <Pressable key={c.id} onPress={() => (canOpen(c.id) ? router.push(`/sites/${id}/mc/subcontractors/${c.id}` as never) : toast("You don't have access to this subcontractor."))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card, opacity: canOpen(c.id) ? 1 : 0.55 }}>
            <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{c.name}</Text>
            {editable && <Pressable hitSlop={6} onPress={async () => { const n = (await promptText('Rename subcontractor', c.name))?.trim(); if (n && n !== c.name && await renameSubco(c, n)) { toast('Renamed'); refresh(); } }}><Text>✏️</Text></Pressable>}
            {mgr && <Pressable hitSlop={6} onPress={async () => { if (await confirmAsk(`Remove "${c.name}" and everything in their folder? This cannot be undone.`, 'Remove') && await deleteSubco(c.id)) { toast('Removed'); refresh(); } }}><Text>🗑</Text></Pressable>}
          </Pressable>
        );
      }) : <Empty>No subcontractors added yet.</Empty>}
      {mgr && (adding !== null ? (
        <Card>
          <TextInput value={adding} onChangeText={setAdding} placeholder="e.g. Acme Scaffolding" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} autoFocus />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setAdding(null)} /></View>
            <View style={{ flex: 1 }}><Button busy={busy} title="Add" onPress={async () => {
              if (!adding.trim()) { toast('Enter a company name.'); return; }
              setBusy(true); const ok = await addSubco(me, site, adding.trim()); setBusy(false);
              if (ok) { toast('Subcontractor added'); setAdding(null); refresh(); } else toast('Could not save — try again.');
            }} /></View>
          </View>
        </Card>
      ) : <Button kind="ghost" title="+ Add Subcontractor" onPress={() => setAdding('')} />)}
    </ScrollView>
  );
}
