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
import { linkHrFolder, useHrAccess } from '@/data/hrRecords';
import { DEFAULT_MAIN_FOLDER, folderStack, linkFolder, listFolders, setQuickLinks, useOneDriveStatus, useQuickLinks, type OdFolder, type OdTarget } from '@/data/onedrive';
import { estimatingRoot, linkEstimatingFolder } from '@/data/quotes';
import { syncRepairPhotos } from '@/data/repairOneDrive';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const DONE: Record<OdTarget, string> = {
  quote: 'Folder linked to this quote', estimating: 'Estimating folder linked to the job',
  progress: 'Folder linked — photos for this site will sync there from now on', materials: "Folder linked — Material POs will sync from there daily",
  siteinductions: 'Folder linked — signed inductions will be pushed there from now on', repairjob: 'Folder linked — sending what’s already on the job', operative: 'Folder linked', quicklink: 'Added Quick Link', hr: 'HR folder chosen',
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
  // Anything else starts in the company's main folder (Andy, 19 Nov 2026), with OneDrive one tap up.
  const { data: odSt } = useOneDriveStatus(me?.org_id);
  const mainPath = !est && odSt?.folder_path && odSt.folder_path !== DEFAULT_MAIN_FOLDER ? odSt.folder_path : '';
  const { data: home, isLoading: homeLoading } = useQuery({ queryKey: ['odStack', mainPath], enabled: !!mainPath, staleTime: 300000, queryFn: async () => { const s = await folderStack(mainPath); return Array.isArray(s) ? s : []; } });
  const stack = stack0 ?? (est ? (estRoot ? [{ id: estRoot.id, name: estRoot.name, driveId: estRoot.driveId }] : []) : home ?? []);
  const [busy, setBusy] = useState(false);
  const cur = stack[stack.length - 1] ?? null;
  const { data, isLoading } = useQuery({ queryKey: ['odFolders', cur?.id ?? 'root', cur?.driveId ?? ''], enabled: est ? !estLoading : !(mainPath && stack0 === null && homeLoading), queryFn: () => listFolders(cur) });
  const { data: quick = [] } = useQuickLinks(me?.org_id);
  // The HR folder (only the people HR Access lets in see it here) is never pinned or linked to anything else.
  const hrId = useHrAccess(me?.org_id).data?.onedrive?.id ?? null;
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const isHr = !!cur && !!hrId && cur.id === hrId && target !== 'hr';
  const canUse = !!cur && !cur.virtual && !cur.isSite && !isHr;
  const use = async (f: OdFolder) => {
    setBusy(true);
    try {
      if (est) {
        if (!(await confirmAsk(`Move "${f.name}" into this job's Contract & Commercial › Estimating folder?`, 'Yes, Move It'))) return;
        const r = await linkEstimatingFolder(id, f);
        if (r.error) { showAlert(r.error); return; }
        ['quotes', 'quote', 'odFolders', 'sites', 'site', 'estLinked'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
        toast(r.note ? `${r.note.charAt(0).toUpperCase()}${r.note.slice(1)}` : DONE.estimating); router.back();
        return;
      }
      if (target === 'hr') {
        if (!(await confirmAsk(`Everything inside "${f.name}" will be hidden in OpHUB from everyone who doesn’t see everyone’s HR folders, including any project folders inside it. Is "${f.name}" only for HR?`, 'Yes, Use It'))) return;
        const err = await linkHrFolder(f);
        if (err) { showAlert(err); return; }
        void qc.invalidateQueries({ queryKey: ['hrAccess'] });
        router.back(); return;
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
      <Text style={{ fontWeight: '600', color: base.ink }}>{f.virtual ? f.name : `📁 ${f.name}`}</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: est ? 'Choose The Estimating Folder' : target === 'hr' ? 'Choose The HR Folder' : 'Choose OneDrive folder' }} />
      {target === 'hr' && <Muted style={{ marginBottom: 8 }}>Open the folder HR documents should go in and press Use. Best a new, empty folder you&apos;ve shared in OneDrive only with the people who can open HR.</Muted>}
      {est && <Muted style={{ marginBottom: 8 }}>{estRoot ? 'Open the enquiry’s folder and press Use. It moves into this job’s Contract & Commercial › Estimating folder.' : estLoading ? 'Finding the Estimating folder…' : 'No Estimating folder is set in Quote settings, so this starts at the top of OneDrive.'}</Muted>}
      <Text style={{ fontWeight: '600', color: base.ink, marginBottom: 8 }}>{['OneDrive', ...stack.map((s) => s.name)].join(' › ')}</Text>
      {isHr && <Muted style={{ marginBottom: 8 }}>This is the HR folder. It can&apos;t be linked to anything else or pinned as a Quick Link.</Muted>}
      {stack.length > 0 && <View style={{ marginBottom: 8 }}><Button kind="ghost" title="‹ Up One Level" onPress={() => setStack(stack.slice(0, -1))} /></View>}
      {canUse && <View style={{ marginBottom: 10 }}><Button busy={busy} title={target === 'quicklink' ? `⭐ Pin "${cur.name}" as a Quick Link` : est ? `Use "${cur.name}" For This Job` : `Use "${cur.name}"`} onPress={() => void use(cur)} /></View>}
      {canUse && target !== 'quicklink' && target !== 'hr' && (
        <View style={{ marginBottom: 10 }}><Button kind="ghost" title={quick.some((q) => q.id === cur.id) ? '⭐ Unpin this Quick Link' : '☆ Pin as a Quick Link'} onPress={async () => {
          const on = quick.some((q) => q.id === cur.id);
          const ok = await setQuickLinks(me.org_id as string, on ? quick.filter((q) => q.id !== cur.id) : [...quick, { id: cur.id, name: cur.name, driveId: cur.driveId || null }]);
          toast(ok ? (on ? 'Removed Quick Link' : `Added Quick Link — "${cur.name}"`) : 'Could not save — try again.');
          void qc.invalidateQueries({ queryKey: ['odQuick'] });
        }} /></View>
      )}
      {(!stack.length || stack0 === null) && quick.length > 0 && target !== 'quicklink' && target !== 'hr' && (
        <>
          <SectionTitle>⭐ Quick Links</SectionTitle>
          {quick.map((q) => row({ id: q.id, name: q.name, driveId: q.driveId }, () => setStack([{ id: q.id, name: q.name, driveId: q.driveId }])))}
          <SectionTitle>All Folders</SectionTitle>
        </>
      )}
      {isLoading ? <Muted>Loading…</Muted> : data?.error ? <Muted>{/HR folder/.test(data.error) ? data.error : `${data.error} Check OneDrive is connected in Admin Centre → OneDrive.`}</Muted>
        : data?.folders.length ? data.folders.map((f) => row(f, () => setStack([...stack, f]))) : <Empty>No folders in here.</Empty>}
    </ScrollView>
  );
}
