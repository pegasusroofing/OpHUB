// Admin Centre › H&S Policy (260 hspolicy, 640 addHsPolicy): the current
// company policy, who has signed this cycle, upload a new version (the old one
// is kept as Superseded and everyone signs again), and superseded versions.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Muted, Toggle } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { readIsoDate } from '@/lib/rules/materials';
import { isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Doc = { id: string; name: string; storage_path: string; uploaded_at: string; uploaded_by: string | null; expiry_date: string | null; resign_cycle_start: string | null; superseded_by: string | null };
const d = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const inAYear = () => { const x = new Date(); x.setFullYear(x.getFullYear() + 1); return x.toISOString().slice(0, 10); };

export default function HsPolicyAdmin() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: team = [] } = useTeam(me?.org_id);
  const { data } = useQuery({
    queryKey: ['hsPolicyAdmin', me?.org_id], enabled: !!me,
    queryFn: async () => {
      const [c, s] = await Promise.all([
        db.from('hs_policy_docs').select('*').eq('org_id', me?.org_id as string).eq('status', 'current').order('uploaded_at', { ascending: false }),
        db.from('hs_policy_docs').select('*').eq('org_id', me?.org_id as string).eq('status', 'superseded').order('uploaded_at', { ascending: false }),
      ]);
      const doc = ((c.data as Doc[] | null) ?? [])[0] ?? null;
      const sigs = doc ? (((await db.from('hs_policy_signatures').select('user_id,signed_at').eq('policy_id', doc.id)).data as { user_id: string; signed_at: string }[] | null) ?? []) : [];
      const start = doc ? +new Date(doc.resign_cycle_start || doc.uploaded_at) : 0;
      return { doc, superseded: (s.data as Doc[] | null) ?? [], all: [...((c.data as Doc[] | null) ?? []), ...((s.data as Doc[] | null) ?? [])], signed: new Set(sigs.filter((x) => +new Date(x.signed_at) >= start).map((x) => x.user_id)) };
    },
  });
  const [listOpen, setListOpen] = useState(false), [upOpen, setUpOpen] = useState(false), [oldOpen, setOldOpen] = useState(false);
  const [name, setName] = useState(''), [expiry, setExpiry] = useState(inAYear());
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  const view = async (p: string) => { const u = await openDocLink('rams-docs', p); if (u) void Linking.openURL(u); else toast('Could not open the file.'); };
  const doc = data?.doc;
  const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'H&S Policy' }} />
      <Card>
        {doc ? (
          <>
            <Text style={{ fontWeight: '800', color: base.ink }}>{doc.name}</Text>
            <Muted>Uploaded {d(doc.uploaded_at)} by {team.find((p) => p.id === doc.uploaded_by)?.name || 'Unknown'}{doc.expiry_date ? ` · Expires ${d(`${doc.expiry_date}T00:00:00`)}` : ''}</Muted>
            <Pressable onPress={() => void view(doc.storage_path)}><Text style={{ color: base.blue, marginTop: 4 }}>View document ↗</Text></Pressable>
          </>
        ) : <Muted>No H&amp;S Policy document uploaded yet — everyone signs once and it&apos;s valid for a year (or until you upload a new version, or its expiry date is reached).</Muted>}
      </Card>
      {!!doc && (
        <>
          <Toggle title={`Signed (${data?.signed.size ?? 0} of ${team.length})`} open={listOpen} onPress={() => setListOpen(!listOpen)} />
          {listOpen && <Card>{team.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', paddingVertical: 5 }}>
              <Text style={{ flex: 1, color: base.ink }}>{p.name}</Text>
              <Text style={{ fontWeight: '700', color: data?.signed.has(p.id) ? base.ok : base.warn }}>{data?.signed.has(p.id) ? 'Signed' : 'Outstanding'}</Text>
            </View>
          ))}</Card>}
        </>
      )}
      <Toggle title={doc ? 'Upload New Version' : 'Upload H&S Policy'} open={upOpen} onPress={() => { setUpOpen(!upOpen); if (!upOpen && doc) setName(doc.name); }} />
      {upOpen && (
        <Card>
          <TextInput value={name} onChangeText={setName} placeholder="Document name, e.g. Health & Safety Policy 2026" style={box} />
          <Muted style={{ fontWeight: '700' }}>Expiry date (everyone must re-sign once reached), YYYY-MM-DD</Muted>
          <TextInput value={expiry} onChangeText={setExpiry} autoCapitalize="none" style={box} />
          <Button kind="ghost" title={file ? `📎 ${file.name}` : 'Choose PDF'} onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setFile(r.assets[0]); }} />
          <Button busy={busy} title={doc ? 'Upload New Version' : 'Upload'} onPress={async () => {
            if (!name.trim() || !file) { toast('Add a name and choose a PDF.'); return; }
            const ex = readIsoDate(expiry); if (!ex || ex === 'bad') { toast('Set an expiry date.'); return; }
            setBusy(true);
            try {
              const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
              const up = await supabase.storage.from('rams-docs').upload(`${me.org_id}/hs-policy/${id}-${(file.name || 'policy.pdf').replace(/[^a-z0-9.-]+/gi, '_')}`, await (await fetch(file.uri)).arrayBuffer(), { contentType: 'application/pdf' });
              if (up.error) { toast('Upload failed — try again.'); return; }
              const r = await db.from('hs_policy_docs').insert({ org_id: me.org_id, name: name.trim(), storage_path: up.data.path, expiry_date: ex, uploaded_by: me.id } as never).select('id').single();
              if (r.error || !r.data) { toast('Could not save — try again.'); return; }
              if (doc) await db.from('hs_policy_docs').update({ status: 'superseded', superseded_by: (r.data as { id: string }).id } as never).eq('id', doc.id);
              toast('H&S Policy uploaded — everyone will need to sign it');
              setUpOpen(false); setFile(null);
              void qc.invalidateQueries({ queryKey: ['hsPolicyAdmin'] }); void qc.invalidateQueries({ queryKey: ['hsPolicy'] });
            } finally { setBusy(false); }
          }} />
          {!!doc && <Muted style={{ marginTop: 6 }}>Uploading a new version keeps the old one on file (marked Superseded) and everyone — including those who already signed — will need to sign it again.</Muted>}
        </Card>
      )}
      {!!data?.superseded.length && (
        <>
          <Toggle title={`Superseded Versions (${data.superseded.length})`} open={oldOpen} onPress={() => setOldOpen(!oldOpen)} />
          {oldOpen && <Card>{data.superseded.map((x) => (
            <View key={x.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: base.line }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{x.name}</Text>
              <Muted>Uploaded {d(x.uploaded_at)} · superseded{x.superseded_by ? ` by "${data.all.find((y) => y.id === x.superseded_by)?.name || 'a newer version'}"` : ''}</Muted>
              <Pressable onPress={() => void view(x.storage_path)}><Text style={{ color: base.blue }}>View document ↗</Text></Pressable>
            </View>
          ))}</Card>}
        </>
      )}
    </ScrollView>
  );
}
