// A Main Contractor document folder — Construction Phase Plan, Asbestos Register
// or F10 Notification (530 renderMcDocuments). Everyone views; managers upload,
// rename and delete.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, Toggle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { createCpp, useCppPlans } from '@/data/cpp';
import { deleteMcDoc, MC_DOC_LABEL, renameMcDoc, setF10NotRequired, uploadMcDoc, useMcDocs } from '@/data/mc';
import { useSite } from '@/data/sites';
import { isBetaSite } from '@/lib/betaOnly';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function McDocs() {
  const { id, cat } = useLocalSearchParams<{ id: string; cat: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: docs, isLoading } = useMcDocs(id, cat);
  const { data: people } = usePeople();
  const [open, setOpen] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The Construction Phase Plan builder (Andy, 19 Nov 2026), on the beta link only for now.
  const builder = cat === 'cpp' && isBetaSite();
  const { data: site } = useSite(id);
  const { data: plans } = useCppPlans(builder ? id : undefined);
  const [making, setMaking] = useState(false);
  const [showF10, setShowF10] = useState(false);
  if (!me) return null;
  const mgr = isManager(me);
  const label = MC_DOC_LABEL[cat] ?? 'Documents';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['mcDocs', id, cat] }); void qc.invalidateQueries({ queryKey: ['mcTiles', id] }); };
  const isOpen = open ?? !docs?.length;
  // F10 not required (Andy, 21 Nov 2026): a tick box at the top; ticked, the folder closes and only managers see it.
  const f10Off = cat === 'f10' && !!site?.f10_not_required;
  if (f10Off && !mgr) return <Muted style={{ padding: space.l }}>An F10 isn’t required on this job.</Muted>;
  const hidden = f10Off && !showF10;
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: label }} />
      {cat === 'f10' && mgr && (
        <Card>
          <Check label="F10 Not Required On This Job" value={f10Off} onChange={async (on) => {
            if (!(await setF10NotRequired(id, on))) { toast('Could not save — try again.'); return; }
            setShowF10(false);
            void qc.invalidateQueries({ queryKey: ['sites'] }); void qc.invalidateQueries({ queryKey: ['mcTiles', id] });
          }} />
          <Muted style={{ fontSize: 12.5 }}>{f10Off ? 'Closed: only Project Managers and admins see the F10 on this job. Untick it if one is needed.' : 'An F10 is needed when the work lasts more than 30 working days with more than 20 people on site at once, or more than 500 person days.'}</Muted>
          {f10Off && <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 6 }}><Button small kind="ghost" title={showF10 ? 'Hide The F10 Folder' : `Open The F10 Folder${docs?.length ? ` (${docs.length})` : ''}`} onPress={() => setShowF10(!showF10)} /></View>}
        </Card>
      )}
      {builder && mgr && (
        <Card>
          <Text style={{ fontSize: 16.5, fontWeight: '600', color: base.ink }}>Build A Construction Phase Plan</Text>
          <Muted style={{ marginBottom: 8 }}>Starts from this job: the client, PM, first aiders, Schedule of Works, start date and nearest A&amp;E are filled in for you. Issuing it puts the PDF in this folder.</Muted>
          {(plans ?? []).map((pl) => (
            <Pressable key={pl.id} onPress={() => router.push(`/sites/${id}/mc/cpp/${pl.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: base.line }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: base.ink }}>{pl.title}</Text><Muted>{pl.status === 'issued' ? `Issued · version ${pl.version}` : 'Draft'} · {new Date(pl.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted></View>
              <Text style={{ color: base.slate }}>Open ›</Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 6 }}>
            <Button small busy={making} title="+ Build A New Plan" onPress={async () => {
              if (!site) return;
              setMaking(true); const nid = await createCpp(me, org as never, site); setMaking(false);
              if (nid) router.push(`/sites/${id}/mc/cpp/${nid}` as never); else toast('Could not start the plan - try again.');
            }} />
          </View>
        </Card>
      )}
      {hidden ? null : isLoading ? <Muted>Loading…</Muted> : docs?.length ? docs.map((d) => (
        <Card key={d.id}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 16.5, fontWeight: '600', color: base.ink }}>{d.name}</Text>
            {mgr && <Pressable hitSlop={6} onPress={async () => { const n = (await promptText('Rename document', d.name))?.trim(); if (n && n !== d.name && await renameMcDoc(d.id, n)) { toast('Renamed'); refresh(); } }}><Text>✏️</Text></Pressable>}
            {mgr && <Pressable hitSlop={6} onPress={async () => { if (await confirmAsk('Delete this document?', 'Delete') && await deleteMcDoc(d)) { toast('Deleted'); refresh(); } }}><Text>🗑</Text></Pressable>}
          </View>
          <Muted>{nameOf(people, d.uploaded_by) === 'Unknown' ? 'Uploaded' : `Uploaded by ${nameOf(people, d.uploaded_by)}`} · {new Date(d.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
          <Button small kind="ghost" title="📄 View Document" onPress={async () => { const u = await openDocLink('mc-documents', d.storage_path); if (u) viewDoc(u); else toast('Could not open the document.'); }} />
        </Card>
      )) : <Empty>No documents uploaded.</Empty>}
      {mgr && !hidden && (
        <>
          <Toggle title={`Upload ${label}`} open={isOpen} onPress={() => setOpen(!isOpen)} />
          {isOpen && (
            <Card>
              <TextInput value={name} onChangeText={setName} placeholder="Document name" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
              <Button small kind="ghost" title={file ? `📄 ${file.name}` : 'Choose PDF'} onPress={async () => {
                const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
                if (!r.canceled && r.assets[0]) { setFile({ uri: r.assets[0].uri, name: r.assets[0].name || 'document.pdf' }); if (!name.trim()) setName((r.assets[0].name || '').replace(/\.pdf$/i, '')); }
              }} />
              <Button small busy={busy} title="Upload" onPress={async () => {
                if (!name.trim() || !file) { toast('Add a name and choose a PDF.'); return; }
                setBusy(true); const ok = await uploadMcDoc(me, id, cat, name.trim(), file); setBusy(false);
                if (ok) { toast('Uploaded'); setName(''); setFile(null); setOpen(false); refresh(); } else toast('Could not upload — try again.');
              }} />
              </View>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}
