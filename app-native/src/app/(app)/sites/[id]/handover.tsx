// Handover (857, managers): O&M manuals on this job, the products' data sheets
// and the guarantees (provider, reference, expiry, maintenance to keep it valid).
// Tap a manual to edit and export it; start a new one built from the job.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { addBlankGuarantee, attachToDoc, deleteHoDoc, renameManual, setHoField, uploadHoDocs, useHandover, type HoDoc } from '@/data/handover';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { deleteManual, duplicateManual, newManual } from '@/data/omManual';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { readIsoDate } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 6 };
const pick = async (multiple: boolean) => {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple, copyToCacheDirectory: true });
  return r.canceled ? [] : r.assets.map((a) => ({ uri: a.uri, name: a.name || 'document.pdf', mimeType: a.mimeType }));
};

/** A text box that saves when you leave it. */
function SaveField({ value, placeholder, onSave, multiline, bold }: { value: string; placeholder: string; onSave: (v: string) => void; multiline?: boolean; bold?: boolean }) {
  const [v, setV] = useState(value);
  return <TextInput value={v} onChangeText={setV} placeholder={placeholder} multiline={multiline} onBlur={() => { if (v !== value) onSave(v); }} style={[box, multiline ? { minHeight: 54 } : null, bold ? { fontWeight: '700' } : null]} />;
}

export default function Handover() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useHandover(id);
  const { data: people } = usePeople();
  const [tab, setTab] = useState<'manual' | 'sheets' | 'guar'>('manual');
  const [busy, setBusy] = useState('');
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['handover', id] }); };
  const docs = data?.docs ?? [];
  const sheets = docs.filter((d) => d.kind === 'datasheet'), guars = docs.filter((d) => d.kind === 'guarantee');
  const save = async (d: HoDoc, key: Parameters<typeof setHoField>[1], v: string) => {
    if (key === 'expiry_date') { const x = readIsoDate(v); if (x === 'bad') { toast('Enter the date as YYYY-MM-DD.'); return; } v = x || ''; }
    if (!(await setHoField(d.id, key, v.trim()))) toast('Could not save — try again.'); else refresh();
  };
  const view = async (d: HoDoc) => { const u = d.storage_path ? await openDocLink('mc-documents', d.storage_path) : null; if (u) viewDoc(u); else toast('Could not open the file.'); };
  const del = async (d: HoDoc) => { if (!(await confirmAsk('Delete this document from the handover?', 'Delete'))) return; toast((await deleteHoDoc(d)) ? 'Deleted' : 'Could not delete — try again.'); refresh(); };
  const upload = async (kind: HoDoc['kind']) => {
    const files = await pick(true); if (!files.length) return;
    const n = await uploadHoDocs(me, site, files, kind, (i) => setBusy(`Uploading ${i} of ${files.length}…`));
    setBusy(''); toast(`${n} added`); refresh();
  };
  const chip = (k: typeof tab, l: string, n?: number) => (
    <Pressable onPress={() => setTab(k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: tab === k ? base.ink : base.line, backgroundColor: tab === k ? base.ink : base.card }}>
      <Text style={{ fontWeight: '700', color: tab === k ? '#fff' : base.ink }}>{l}{n != null ? ` (${n})` : ''}</Text>
    </Pressable>
  );
  const when = (t: string | null) => (t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Handover' }} />
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>{chip('manual', 'O&M manuals')}{chip('sheets', 'Data sheets', sheets.length)}{chip('guar', 'Guarantees', guars.length)}</View>
      {!!busy && <Muted style={{ marginBottom: 8 }}>{busy}</Muted>}
      {isLoading ? <Muted>Loading…</Muted> : tab === 'manual' ? (
        <>
          <Muted style={{ marginBottom: 12 }}>Operation &amp; Maintenance manuals for this job.</Muted>
          {data?.manuals.length ? data.manuals.map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/sites/${site.id}/om/${m.id}` as never)}><Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 24 }}>📘</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{m.name || 'O&M Manual'}</Text>
                <Muted>Updated {when(m.updated_at || m.created_at)}{m.updated_by ? ` by ${nameOf(people, m.updated_by)}` : ''}</Muted>
              </View>
              <Pressable onPress={async () => { const n = await promptText('Rename this O&M manual', m.name || 'O&M Manual'); if (!n || !n.trim()) return; toast((await renameManual(me, m.id, n.trim())) ? 'Renamed' : 'Could not save — try again.'); refresh(); }}><Text style={{ color: base.blue }}>Rename</Text></Pressable>
              <Pressable hitSlop={8} onPress={async () => {
                const k = await chooseAction(m.name || 'O&M Manual', [{ key: 'dup', label: '⧉ Duplicate' }, { key: 'del', label: '🗑 Delete' }]);
                if (k === 'dup') { toast((await duplicateManual(me, m.id)) ? 'Copied' : 'Could not copy — try again.'); refresh(); }
                if (k === 'del' && (await confirmAsk(`Delete "${m.name || 'O&M Manual'}"? This can't be undone.`, 'Yes — delete'))) { toast((await deleteManual(m.id)) ? 'Deleted' : 'Could not delete — try again.'); refresh(); }
              }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
            </Card></Pressable>
          )) : <Empty>No O&amp;M manuals yet.</Empty>}
          <Button title="+ New O&M manual" onPress={async () => {
            const n = await promptText('Name for the new O&M manual', `O&M Manual${data?.manuals.length ? ` ${data.manuals.length + 1}` : ''}`); if (n === null) return;
            setBusy('Building from the job…'); const mid = await newManual(me, org, site, n); setBusy('');
            if (!mid) { toast('Could not create the manual — try again.'); return; }
            refresh(); router.push(`/sites/${site.id}/om/${mid}` as never);
          }} />
          <Muted style={{ marginTop: 8 }}>A new manual is built from the job — Schedule of Works, data sheets, COSHH, guarantees, drawings and photos. The data sheets and guarantees you add here feed straight into it.</Muted>
        </>
      ) : tab === 'sheets' ? (
        <>
          <Card>
            <Muted style={{ marginBottom: 8 }}>Technical data sheets, declarations of performance and specs for the products used. They&apos;re listed in the manual&apos;s Materials Log and attached to the back of the PDF.</Muted>
            <Button title="📄 Upload data sheets (several at once)" onPress={() => void upload('datasheet')} />
          </Card>
          {sheets.length ? sheets.map((x) => (
            <Card key={x.id}>
              <SaveField value={x.name} placeholder="Name" bold onSave={(v) => void save(x, 'name', v)} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}><SaveField value={x.provider || ''} placeholder="Manufacturer" onSave={(v) => void save(x, 'provider', v)} /></View>
                {!!x.storage_path && <Pressable onPress={() => void view(x)}><Text style={{ color: base.blue, fontWeight: '700' }}>View</Text></Pressable>}
                <Pressable hitSlop={6} onPress={() => void del(x)}><Text>🗑</Text></Pressable>
              </View>
            </Card>
          )) : <Empty>No data sheets yet.</Empty>}
        </>
      ) : (
        <>
          <Card>
            <Muted style={{ marginBottom: 8 }}>Manufacturer guarantees and your own workmanship warranty. They fill the manual&apos;s Guarantees table and the certificates are attached to the PDF.</Muted>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button title="📄 Upload certificates" onPress={() => void upload('guarantee')} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="+ Add without a file" onPress={async () => { if (await addBlankGuarantee(me, site)) refresh(); else toast('Could not save — try again.'); }} /></View>
            </View>
          </Card>
          {guars.length ? guars.map((x) => (
            <Card key={x.id}>
              <SaveField value={x.name} placeholder="Name" bold onSave={(v) => void save(x, 'name', v)} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><SaveField value={x.provider || ''} placeholder="Manufacturer / provider" onSave={(v) => void save(x, 'provider', v)} /></View>
                <View style={{ flex: 1 }}><SaveField value={x.ref || ''} placeholder="Guarantee ref" onSave={(v) => void save(x, 'ref', v)} /></View>
              </View>
              <SaveField value={x.expiry_date || ''} placeholder="Expiry date (YYYY-MM-DD)" onSave={(v) => void save(x, 'expiry_date', v)} />
              <SaveField value={x.maintenance || ''} multiline placeholder="Maintenance required to keep the guarantee (e.g. outlets cleared every 3 months)" onSave={(v) => void save(x, 'maintenance', v)} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                {x.storage_path ? <Pressable onPress={() => void view(x)}><Text style={{ color: base.blue, fontWeight: '700' }}>View</Text></Pressable>
                  : <Pressable onPress={async () => { const f = await pick(false); if (!f[0]) return; setBusy('Uploading…'); const ok = await attachToDoc(me, site, x.id, f[0]); setBusy(''); toast(ok ? 'Attached' : 'Upload failed — try again.'); refresh(); }}><Text style={{ color: base.blue, fontWeight: '700' }}>Attach certificate</Text></Pressable>}
                <View style={{ flex: 1 }} />
                <Pressable hitSlop={6} onPress={() => void del(x)}><Text>🗑</Text></Pressable>
              </View>
            </Card>
          )) : <Empty>No guarantees yet.</Empty>}
        </>
      )}
    </ScrollView>
  );
}
