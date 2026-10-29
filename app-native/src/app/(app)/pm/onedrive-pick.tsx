// OneDrive folder picker (310 renderOneDriveFolderPicker): browse your own
// OneDrive, "Shared with me" and "Company Sites", with the company's Quick
// Links at the top, then "Use this folder". ?target= says what it's for
// (progress / materials / siteinductions / repairjob / operative / quicklink)
// and ?id= which project, job or operative.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Empty, Muted, SectionTitle } from '@/components/ui';
import { linkFolder, listFolders, setQuickLinks, useQuickLinks, type OdFolder, type OdTarget } from '@/data/onedrive';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const DONE: Record<OdTarget, string> = {
  progress: 'Folder linked — photos for this site will sync there from now on', materials: "Folder linked — Material PO's will sync from there daily",
  siteinductions: 'Folder linked — signed inductions will be pushed there from now on', repairjob: 'Folder linked', operative: 'Folder linked', quicklink: 'Added Quick Link',
};

export default function OneDrivePick() {
  const { target = 'progress', id = '' } = useLocalSearchParams<{ target?: OdTarget; id?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [stack, setStack] = useState<OdFolder[]>([]);
  const [busy, setBusy] = useState(false);
  const cur = stack[stack.length - 1] ?? null;
  const { data, isLoading } = useQuery({ queryKey: ['odFolders', cur?.id ?? 'root', cur?.driveId ?? ''], queryFn: () => listFolders(cur) });
  const { data: quick = [] } = useQuickLinks(me?.org_id);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const canUse = !!cur && !cur.virtual && !cur.isSite;
  const use = async (f: OdFolder) => {
    setBusy(true);
    try {
      if (target === 'quicklink') {
        if (!quick.some((q) => q.id === f.id) && !(await setQuickLinks(me.org_id as string, [...quick, { id: f.id, name: f.name, driveId: f.driveId || null }]))) { toast('Quick Link not added — it could not be saved.'); return; }
        void qc.invalidateQueries({ queryKey: ['odQuick'] });
      } else if (!(await linkFolder(target, id, f))) { toast('Could not link that folder — please try again.'); return; }
      ['odSites', 'sites', 'site'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      toast(target === 'quicklink' ? `Added Quick Link — "${f.name}"` : DONE[target]); router.back();
    } finally { setBusy(false); }
  };
  const row = (f: OdFolder, onPress: () => void) => (
    <Pressable key={`${f.driveId || ''}${f.id}`} onPress={onPress} style={{ padding: 11, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
      <Text style={{ fontWeight: '700', color: base.ink }}>{f.virtual ? f.name : `📁 ${f.name}`}</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Choose OneDrive folder' }} />
      <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 8 }}>{['OneDrive', ...stack.map((s) => s.name)].join(' › ')}</Text>
      {stack.length > 0 && <View style={{ marginBottom: 8 }}><Button kind="ghost" title="‹ Up one level" onPress={() => setStack(stack.slice(0, -1))} /></View>}
      {canUse && <View style={{ marginBottom: 10 }}><Button busy={busy} title={target === 'quicklink' ? `⭐ Pin "${cur.name}" as a Quick Link` : `Use "${cur.name}"`} onPress={() => void use(cur)} /></View>}
      {!stack.length && quick.length > 0 && target !== 'quicklink' && (
        <>
          <SectionTitle>⭐ Quick Links</SectionTitle>
          {quick.map((q) => row({ id: q.id, name: q.name, driveId: q.driveId }, () => setStack([{ id: q.id, name: q.name, driveId: q.driveId }])))}
          <SectionTitle>All folders</SectionTitle>
        </>
      )}
      {isLoading ? <Muted>Loading…</Muted> : data?.error ? <Muted>{data.error} Check OneDrive is connected in Admin Centre → OneDrive.</Muted>
        : data?.folders.length ? data.folders.map((f) => row(f, () => setStack([...stack, f]))) : <Empty>No folders in here.</Empty>}
    </ScrollView>
  );
}
