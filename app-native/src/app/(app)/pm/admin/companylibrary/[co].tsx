// One subcontractor company's library (570 renderCompanyLibraryDocs): insurance,
// accreditations, RAMS templates and the like — follows the company onto every
// site. Upload with a category, view, delete.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { useTeam } from '@/data/admin';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const CATS = [
  { key: 'public_liability_insurance', label: 'Public Liability Insurance' }, { key: 'employers_liability_insurance', label: "Employer's Liability Insurance" },
  { key: 'accreditation', label: 'Accreditation / Certification' }, { key: 'rams_template', label: 'RAMS / Method Statement Template' },
  { key: 'operative_certificate', label: 'Operative Certificate' }, { key: 'other', label: 'Other' },
];
type Doc = { id: string; name: string; category: string; storage_path: string; uploaded_by: string | null; uploaded_at: string; expiry_date: string | null };

export default function CompanyLibraryDocs() {
  const { co } = useLocalSearchParams<{ co: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: team = [] } = useTeam(me?.org_id);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ['companyLibDocs', co], enabled: !!co,
    queryFn: async () => {
      const [p, d] = await Promise.all([
        db.from('subcontractor_company_profiles').select('id,name').eq('id', co).maybeSingle(),
        db.from('subcontractor_company_documents').select('*').eq('master_company_id', co).order('uploaded_at', { ascending: false }),
      ]);
      return { profile: p.data as { id: string; name: string } | null, docs: (d.data as Doc[] | null) ?? [] };
    },
  });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data.profile) return <Muted style={{ padding: space.l }}>That company is no longer in the library.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['companyLibDocs', co] }); };
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: data.profile.name }} />
      <Muted style={{ marginBottom: 12 }}>{data.profile.name}&apos;s own document library — insurance, accreditations, RAMS templates and the like. Anything kept here follows this company onto every site they&apos;re added to.</Muted>
      <Button kind="ghost" busy={busy} title="+ Add to Library" onPress={async () => {
        const cat = await chooseAction('What is it?', CATS); if (!cat) return;
        const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
        const f = r.assets[0];
        setBusy(true);
        try {
          const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
          const up = await supabase.storage.from('mc-documents').upload(`company-library/${co}/${id}-${(f.name || 'document').replace(/[^a-z0-9.-]+/gi, '_')}`, await (await fetch(f.uri)).arrayBuffer(), { contentType: f.mimeType || 'application/octet-stream' });
          if (up.error) { toast('Upload failed.'); return; }
          const ins = await db.from('subcontractor_company_documents').insert({ org_id: me.org_id, master_company_id: co, category: cat, uploaded_by: me.id, name: f.name, storage_path: up.data.path, content_type: f.mimeType || null, size: f.size || null } as never);
          toast(ins.error ? 'Upload failed.' : 'Uploaded'); refresh();
        } finally { setBusy(false); }
      }} />
      {data.docs.length ? data.docs.map((d) => (
        <Card key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{d.name}</Text>
            <Muted>{CATS.find((c) => c.key === d.category)?.label || 'Other'} · {team.find((p) => p.id === d.uploaded_by)?.name || 'Unknown'} · {new Date(d.uploaded_at).toLocaleDateString('en-GB')}{d.expiry_date ? ` · expires ${new Date(`${d.expiry_date}T00:00:00`).toLocaleDateString('en-GB')}` : ''}</Muted>
          </View>
          <Pressable onPress={async () => { const u = await openDocLink('mc-documents', d.storage_path); if (u) viewDoc(u); else toast('Could not open the file.'); }}><Text style={{ color: base.blue, fontWeight: '700' }}>View</Text></Pressable>
          <Pressable hitSlop={8} onPress={async () => {
            if (!(await confirmAsk("Delete this document? This can't be undone.", 'Delete'))) return;
            if ((await db.from('subcontractor_company_documents').delete().eq('id', d.id)).error) { toast('Could not delete — try again.'); return; }
            try { await supabase.storage.from('mc-documents').remove([d.storage_path]); } catch { /* non-fatal */ }
            toast('Deleted'); refresh();
          }}><Text>🗑</Text></Pressable>
        </Card>
      )) : <Empty>No library documents yet.</Empty>}
    </ScrollView>
  );
}
