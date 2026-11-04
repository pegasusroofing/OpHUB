// OneDrive folder picker (310 renderOneDriveFolderPicker): browse your own
// OneDrive, "Shared with me" and "Company Sites", with the company's Quick
// Links at the top, then "Use this folder". ?target= says what it's for
// (progress / materials / siteinductions / repairjob / operative / quicklink)
// and ?id= which project, job or operative. target=estimating (a job's estimating folder, Andy 4 Nov 2026) opens in the
// company's Estimating folder and moves the chosen folder into the job's files.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Empty, Muted, SectionTitle } from '@/components/ui';
import { linkFolder, listFolders, setQuickLinks, useQuickLinks, type OdFolder, type OdTarget } from '@/data/onedrive';
import { estimatingRoot, linkEstimatingFolder } from '@/data/quotes';
import { syncRepairPhotos } from '@/data/repairOneDrive';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const DONE: Record<OdTarget, string> = {
  quote: 'Folder linked to this quote', estimating: 'Estimating folder linked to the job',
  progress: 'Folder linked — photos for this site will sync there from now on', materials: "Folder linked — Material PO's will sync from there daily",
  siteinductions: 'Folder linked — signed inductions will be pushed there from now on', repairjob: 'Folder linked — sending what’s already on the job', operative: 'Folder linked', quicklink: 'Added Quick Link',
};

export default function OneDrivePick() {
  const { target = 'progress', id = '' } = useLocalSearchParams<{ target?: OdTarget; id?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const est = target === 'estimating';
  const { data: estRoot, isLoading: estLoading } = useQuery({ queryKey: ['estRoot', me?.org_id], enabled: est, queryFn: estimatingRoot });
  // Starts in the Estimating folder; once you move, it's your own path.
  const [stack0, setStack] = useState<OdFolder[] | null>(null);
  const stack = stack0 ?? (est && estRoot ? [{ id: estRoot.id, name: estRoot.name, driveId: estRoot.driveId }] : []);
  const [busy, setBusy] = useState(false);
  const cur = stack[stack.length - 1] ?? null;
  const { data, isLoading } = useQuery({ queryKey: ['odFolders', cur?.id ?? 'root', cur?.driveId ?? ''], enabled: !est || !estLoading, queryFn: () => listFolders(cur) });
  const { data: quick = [] } = useQuickLinks(me?.org_id);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const canUse = !!cur && !cur.virtual && !cur.isSite;
  const use = async (f: OdFolder) => {
    setBusy(true);
    try {
      if (est) {
        if (!(await confirmAsk(`Move "${f.name}" into this job's Contract & Commercial › Estimating folder?`, 'Yes, Move It'))) return;
        const r = await linkEstimatingFolder(id, f);
        if (r.error) { showAlert(r.error); return; }
        ['quotes', 'quote', 'odFolders'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
        toast(r.note ? `${r.note.charAt(0).toUpperCase()}${r.note.slice(1)}` : DONE.estimating); router.back();
        return;
      }
      if (target === 'quicklink') {
        if (!quick.some((q) => q.id === f.id) && !(await setQuickLinks(me.org_id as string, [...quick, { id: f.id, name: f.name, driveId: f.driveId || null }]))) { toast('Quick Link not added — it could not be saved.'); return; }
        void qc.invalidateQueries({ queryKey: ['odQuick'] });
      } else if (!(await linkFolder(target, id, f))) { toast('Could not link that folder — please try again.'); return; }
      ['odSites', 'sites', 'site'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      // A newly linked repair job folder gets what's already on the job (photos and the work order).
      if (target === 'repairjob') void syncRepairPhotos(id, { force: true });
      toast(target === 'quicklink' ? `Added Quick Link — "${f.name}"` : DONE[target]); router.back();
    } finally { setBusy(false); }
  };
  const row = (f: OdFolder, onPress: () => void) => (
    <Pressable key={`${f.driveId || ''}${f.id}`} onPress={onPress} style={{ padding: 11, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
      <Text style={{ fontWeight: '700', color: base.ink }}>{f.virtual ? f.name : `📁 ${f.name}`}</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: est ? 'Choose The Estimating Folder' : 'Choose OneDrive folder' }} />
      {est && <Muted style={{ marginBottom: 8 }}>{estRoot ? 'Open the enquiry’s folder and press Use. It moves into this job’s Contract & Commercial › Estimating folder.' : estLoading ? 'Finding the Estimating folder…' : 'No Estimating folder is set in Quote settings, so this starts at the top of OneDrive.'}</Muted>}
      <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 8 }}>{['OneDrive', ...stack.map((s) => s.name)].join(' › ')}</Text>
      {stack.length > 0 && <View style={{ marginBottom: 8 }}><Button kind="ghost" title="‹ Up one level" onPress={() => setStack(stack.slice(0, -1))} /></View>}
      {canUse && <View style={{ marginBottom: 10 }}><Button busy={busy} title={target === 'quicklink' ? `⭐ Pin "${cur.name}" as a Quick Link` : est ? `Use "${cur.name}" For This Job` : `Use "${cur.name}"`} onPress={() => void use(cur)} /></View>}
      {canUse && target !== 'quicklink' && (
        <View style={{ marginBottom: 10 }}><Button kind="ghost" title={quick.some((q) => q.id === cur.id) ? '⭐ Unpin this Quick Link' : '☆ Pin as a Quick Link'} onPress={async () => {
          const on = quick.some((q) => q.id === cur.id);
          const ok = await setQuickLinks(me.org_id as string, on ? quick.filter((q) => q.id !== cur.id) : [...quick, { id: cur.id, name: cur.name, driveId: cur.driveId || null }]);
          toast(ok ? (on ? 'Removed Quick Link' : `Added Quick Link — "${cur.name}"`) : 'Could not save — try again.');
          void qc.invalidateQueries({ queryKey: ['odQuick'] });
        }} /></View>
      )}
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
