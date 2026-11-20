// Subcontractors on this job (550 renderSubcontractors). Everyone sees the list;
// an operative opens only their own company. Managers add (linked to the company
// library), rename (when not shared with another job) and remove.
// + Add Subcontractor (Andy, 20 Nov 2026) picks from the Company Library, approved sign-ups first, each with its insurance;
// a company whose insurance is missing or out of date asks first; the person who signed them up is their Project Manager on the job by default.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Popup } from '@/components/Popup';
import { Button, Empty, Muted } from '@/components/ui';
import { useSite } from '@/data/sites';
import { addSubco, deleteSubco, makeSubAdmin, renameSubco, useLibrary, useSubcos, type LibCompany } from '@/data/subcontractors';
import { usePeople } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function Subcontractors() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useSubcos(site, me);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState('');
  const { data: lib } = useLibrary(me && isManager(me) ? me.org_id : null);
  const { data: people } = usePeople();
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['subcos', id] }); void qc.invalidateQueries({ queryKey: ['mcTiles', id] }); };
  const canOpen = (cid: string) => mgr || me.role === 'client' || cid === data?.myCompany;
  const onJob = new Set((data?.companies ?? []).map((c) => c.master_company_id).filter(Boolean));
  const add = async (name: string, from: LibCompany | null) => {
    if (from && !from.insurance.ok && !(await confirmAsk(`${from.name}: ${from.insurance.warn}. Add them to this job anyway?`, 'Yes', 'No'))) return;
    setBusy(from?.id || 'new');
    const cid = await addSubco(me, site, name, from?.id ?? null);
    setBusy('');
    if (!cid) { toast('Could not save — try again.'); return; }
    setPicking(false); refresh();
    // The person who signed the company up is their Project Manager on the job by default (Andy, 20 Nov 2026: "the
    // subcontractors need a project manager by default who sets up their company"). No one to use: invite one from Operatives.
    const who = from?.contactUserId ? people?.find((p) => p.id === from.contactUserId) : null;
    if (from?.contactUserId) {
      if (await makeSubAdmin(me, site.id, cid, from.contactUserId)) toast(`${who?.name || 'The person who signed them up'} is ${from.name}’s Project Manager on this job.`, { confirm: true });
      else toast('Could not make them their Project Manager — do it from the company’s Operatives tile.');
      refresh();
    } else router.push(`/sites/${id}/mc/subcontractors/${cid}/operatives` as never);
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Subcontractors' }} />
      <Muted style={{ marginBottom: 12 }}>Each subcontractor gets their own tile with RAMS, COSHH, Toolbox Talks, Daily Briefings and their own operatives — only operatives allocated to a company can open that company’s tile.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : data?.companies.length ? data.companies.map((c) => {
        const editable = mgr && (!c.master_company_id || (data.usage[c.master_company_id] || 0) <= 1);
        return (
          <Pressable key={c.id} onPress={() => (canOpen(c.id) ? router.push(`/sites/${id}/mc/subcontractors/${c.id}` as never) : toast("You don't have access to this subcontractor."))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card, opacity: canOpen(c.id) ? 1 : 0.55 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: base.ink }}>{c.name}</Text>
              {mgr && (() => { const l = lib?.find((x) => x.id === c.master_company_id); return l && !l.insurance.ok ? <Text style={{ color: '#b45309', fontSize: 12.5 }}>{l.insurance.label}</Text> : null; })()}
            </View>
            {editable && <Pressable hitSlop={6} onPress={async () => { const n = (await promptText('Rename subcontractor', c.name))?.trim(); if (n && n !== c.name && await renameSubco(c, n)) { toast('Renamed'); refresh(); } }}><Text>✏️</Text></Pressable>}
            {mgr && <Pressable hitSlop={6} onPress={async () => { if (await confirmAsk(`Remove "${c.name}" and everything in their folder? This cannot be undone.`, 'Remove') && await deleteSubco(c.id)) { toast('Removed'); refresh(); } }}><Text>🗑</Text></Pressable>}
          </Pressable>
        );
      }) : <Empty>No subcontractors added yet.</Empty>}
      {mgr && <View style={{ alignItems: 'center' }}><Button kind="ghost" title="+ Add Subcontractor" onPress={() => setPicking(true)} /></View>}
      {picking && (
        <Popup title="Add A Subcontractor" onClose={() => setPicking(false)} width={460}>
          <Muted style={{ marginBottom: 8 }}>From your Company Library. Approved sign-ups come first, with their insurance.</Muted>
          {(lib ?? []).filter((x) => !onJob.has(x.id)).map((x) => (
            <Pressable key={x.id} accessibilityRole="button" disabled={!!busy} onPress={() => void add(x.name, x)}
              style={{ paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card, opacity: busy && busy !== x.id ? 0.5 : 1 }}>
              <Text style={{ fontWeight: '600', color: base.ink }}>{x.name}{x.approvedAt ? '  ·  ✓ Approved Sign-Up' : ''}</Text>
              <Text style={{ fontSize: 12.5, color: x.insurance.ok ? base.ok : '#b45309' }}>{busy === x.id ? 'Adding…' : x.insurance.label}</Text>
            </Pressable>
          ))}
          {!(lib ?? []).filter((x) => !onJob.has(x.id)).length && <Empty>No other companies in the library yet.</Empty>}
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <Button kind="ghost" busy={busy === 'new'} title="+ A New Company" onPress={async () => {
              const n = (await promptText('Company Name', '', { placeholder: 'e.g. Acme Scaffolding' }))?.trim(); if (!n) return;
              await add(n, (lib ?? []).find((x) => x.name.toLowerCase() === n.toLowerCase()) ?? null);
            }} />
          </View>
        </Popup>
      )}
    </ScrollView>
  );
}
