// Admin Centre › Signing Templates (610): upload a sample of a form you use
// again and again, mark its sign boxes once, then pick the template when
// uploading the real document for a job — it keeps the boxes.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { openDocLink } from '@/data/hs';
import { addTemplate, deleteTemplate, layoutSummary, renameTemplate, useSignTemplates } from '@/data/signTemplates';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

export default function SignTemplates() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useSignTemplates(!!me);
  const [name, setName] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['signTemplates'] }); };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Signing Templates' }} />
      <Card>
        <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 4 }}>How this works</Text>
        <Muted>1. Upload a sample of a form you use often. 2. Mark every box and say who it&apos;s for — Operative 1, Operative 2, the Project Manager, the Client. 3. When you upload that form for a job, pick the template: the boxes are already in place and everyone signs with one tap.</Muted>
      </Card>
      <Card>
        <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 8 }}>New template</Text>
        <TextInput value={name} onChangeText={setName} maxLength={80} placeholder="Template name, e.g. Hyde RAMS form" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button kind="ghost" title={file ? `✓ ${file.name}` : 'Choose sample PDF'} onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name || 'sample.pdf' }); }} /></View>
          <View style={{ flex: 1 }}><Button busy={busy} title="Upload & set boxes" onPress={async () => {
            if (!name.trim() || !file) { toast('Add a name and choose a sample PDF.'); return; }
            setBusy(true);
            try {
              const id = await addTemplate(me, name.trim(), file);
              if (!id) { toast('Could not upload — please try again.'); return; }
              toast('Sample uploaded — now mark the boxes'); setName(''); setFile(null); refresh();
              router.push(`/pm/admin/signtemplates/${id}` as never);
            } finally { setBusy(false); }
          }} /></View>
        </View>
      </Card>
      <SectionTitle>Your templates</SectionTitle>
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((tp) => {
        const s = layoutSummary(tp.layout);
        return (
          <Card key={tp.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{tp.name}</Text>
              <Text style={{ color: s ? base.slate : '#B23B2E' }}>{s || 'No boxes set yet'}{tp.page_count ? ` · ${tp.page_count} pages` : ''}</Text>
            </View>
            <Pressable hitSlop={8} onPress={async () => {
              const k = await chooseAction(tp.name, [...(tp.storage_path ? [{ key: 'boxes', label: '✍ Set / edit boxes' }, { key: 'view', label: '👁 View sample' }] : []), { key: 'rename', label: '✎ Rename' }, { key: 'del', label: '🗑 Delete', danger: true }]);
              if (k === 'boxes') router.push(`/pm/admin/signtemplates/${tp.id}` as never);
              else if (k === 'view' && tp.storage_path) { const u = await openDocLink('rams-docs', tp.storage_path); if (u) void Linking.openURL(u); }
              else if (k === 'rename') { const n = await promptText('Template name:', tp.name); if (n && n.trim()) { await renameTemplate(tp.id, n.trim()); refresh(); } }
              else if (k === 'del') { if (await confirmAsk('Delete this template? Documents already uploaded with it keep their boxes.', 'Delete')) { await deleteTemplate(tp.id); refresh(); } }
            }}><Text style={{ fontSize: 18, color: base.slate }}>⋯</Text></Pressable>
          </Card>
        );
      }) : <Empty>No templates yet.</Empty>}
    </ScrollView>
  );
}
