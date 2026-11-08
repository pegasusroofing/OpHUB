// Handover (857, managers): O&M manuals on this job, the products' data sheets
// and the guarantees (provider, reference, expiry, maintenance to keep it valid).
// Tap a manual to edit and export it; start a new one built from the job. With a OneDrive folder on the job, its guarantees
// and data sheets are found there (Andy, 8 Nov 2026) — before a new manual is built, and with Find In OneDrive.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { OneDriveFindPopup, siteHasOneDrive } from '@/components/HoOneDriveFind';
import { DateBox } from '@/components/DateField';
import { addBlankGuarantee, attachToDoc, deleteHoDoc, renameManual, setHoField, uploadHoDocs, useHandover, type HoDoc } from '@/data/handover';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { deleteManual, duplicateManual, newManual } from '@/data/omManual';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { readIsoDate } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, page, radius, space, live } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 6 };
const pick = async (multiple: boolean) => {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple, copyToCacheDirectory: true });
  return r.canceled ? [] : r.assets.map((a) => ({ uri: a.uri, name: a.name || 'document.pdf', mimeType: a.mimeType }));
};

/** A text box that saves when you leave it. */
function SaveField({ value, placeholder, onSave, multiline, bold }: { value: string; placeholder: string; onSave: (v: string) => void; multiline?: boolean; bold?: boolean }) {
  const [v, setV] = useState(value);
  return <TextInput value={v} onChangeText={setV} placeholder={placeholder} multiline={multiline} onBlur={() => { if (v !== value) onSave(v); }} style={[box, multiline ? { minHeight: 54 } : null, bold ? { fontWeight: '600' } : null]} />;
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
  const [finding, setFinding] = useState<'' | 'find' | 'new'>('');
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
  const makeManual = async () => {
    setBusy('Building the manual from the job…');
    const mid = await newManual(me, org, site, `O&M Manual${data?.manuals.length ? ` ${data.manuals.length + 1}` : ''}`); setBusy('');
    if (!mid) { toast('Could not create the manual — try again.'); return; }
    refresh(); router.push(`/sites/${site.id}/om/${mid}` as never);
  };
  const findBtn = siteHasOneDrive(site) && <View style={{ flex: 1 }}><Button kind="ghost" title="🔍 Find In OneDrive" onPress={() => setFinding('find')} /></View>;
  const chip = (k: typeof tab, l: string, n?: number) => (
    <Pressable onPress={() => setTab(k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: tab === k ? live.brand1 : base.line, backgroundColor: tab === k ? live.brand1 : base.card }}>
      <Text style={{ fontWeight: '500', color: tab === k ? live.brand1Text : base.ink }}>{l}{n != null ? ` (${n})` : ''}</Text>
    </Pressable>
  );
  const when = (t: string | null) => (t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Handover' }} />
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>{chip('manual', 'O&M Manuals')}{chip('sheets', 'Data Sheets', sheets.length)}{chip('guar', 'Guarantees', guars.length)}</View>
      {!!busy && <Muted style={{ marginBottom: 8 }}>{busy}</Muted>}
      {isLoading ? <Muted>Loading…</Muted> : tab === 'manual' ? (
        <>

          {data?.manuals.length ? data.manuals.map((m) => (
            <Pressable key={m.id} onPress={() => router.push(`/sites/${site.id}/om/${m.id}` as never)}><Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 24 }}>📘</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{m.name || 'O&M Manual'}</Text>
                <Muted>Updated {when(m.updated_at || m.created_at)}{m.updated_by ? ` by ${nameOf(people, m.updated_by)}` : ''}</Muted>
              </View>
              <Pressable hitSlop={8} accessibilityLabel={`${m.name || 'O&M Manual'} options`} onPress={async () => {
                const k = await chooseAction(m.name || 'O&M Manual', [{ key: 'ren', label: '✎ Rename' }, { key: 'dup', label: '⧉ Duplicate' }, { key: 'del', label: '🗑 Delete', danger: true }]);
                if (k === 'ren') { const n = await promptText('Rename This O&M Manual', m.name || 'O&M Manual'); if (!n || !n.trim()) return; if (!(await renameManual(me, m.id, n.trim()))) toast('Could not save — try again.'); refresh(); }
                if (k === 'dup') { toast((await duplicateManual(me, m.id)) ? 'Copied' : 'Could not copy — try again.'); refresh(); }
                if (k === 'del' && (await confirmAsk(`Delete "${m.name || 'O&M Manual'}"? This can't be undone.`, 'Yes — delete'))) { toast((await deleteManual(m.id)) ? 'Deleted' : 'Could not delete — try again.'); refresh(); }
              }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
            </Card></Pressable>
          )) : <Empty>No O&amp;M manuals yet.</Empty>}
          <View style={{ alignItems: 'center' }}><Button busy={!!busy} title="+ New O&M Manual" onPress={() => { if (siteHasOneDrive(site)) setFinding('new'); else void makeManual(); }} /></View>
          <Muted style={{ marginTop: 8, textAlign: 'center' }}>Built from the job: {org && (org as { has_finance?: boolean }).has_finance ? 'the Bill of Quantities (or the Schedule of Works), ' : 'the Schedule of Works, '}data sheets, guarantees, COSHH, drawings and photos.{siteHasOneDrive(site) ? ' The job’s OneDrive folder is searched for guarantees and data sheets first.' : ''}</Muted>
        </>
      ) : tab === 'sheets' ? (
        <>
          <Card>
            <Muted style={{ marginBottom: 8 }}>Technical data sheets, declarations of performance and specs for the products used. They&apos;re listed in the manual&apos;s Materials Log and attached to the back of the PDF.</Muted>
            <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button title="📄 Upload Data Sheets" onPress={() => void upload('datasheet')} /></View>{findBtn}</View>
          </Card>
          {sheets.length ? sheets.map((x) => (
            <Card key={x.id}>
              <SaveField value={x.name} placeholder="Name" bold onSave={(v) => void save(x, 'name', v)} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}><SaveField value={x.provider || ''} placeholder="Manufacturer" onSave={(v) => void save(x, 'provider', v)} /></View>
                {!!x.storage_path && <Pressable onPress={() => void view(x)}><Text style={{ color: base.blue, fontWeight: '600' }}>View</Text></Pressable>}
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
              <View style={{ flex: 1 }}><Button title="📄 Upload Certificates" onPress={() => void upload('guarantee')} /></View>
              {findBtn}
              <View style={{ flex: 1 }}><Button kind="ghost" title="+ Add Without A File" onPress={async () => { if (await addBlankGuarantee(me, site)) refresh(); else toast('Could not save — try again.'); }} /></View>
            </View>
          </Card>
          {guars.length ? guars.map((x) => (
            <Card key={x.id}>
              <SaveField value={x.name} placeholder="Name" bold onSave={(v) => void save(x, 'name', v)} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><SaveField value={x.provider || ''} placeholder="Manufacturer / provider" onSave={(v) => void save(x, 'provider', v)} /></View>
                <View style={{ flex: 1 }}><SaveField value={x.ref || ''} placeholder="Guarantee ref" onSave={(v) => void save(x, 'ref', v)} /></View>
              </View>
              <DateBox value={x.expiry_date || ''} placeholder="Expiry date" title="Expiry date" onChange={(v) => void save(x, 'expiry_date', v)} style={{ marginBottom: 8 }} />
              <SaveField value={x.maintenance || ''} multiline placeholder="Maintenance required to keep the guarantee (e.g. outlets cleared every 3 months)" onSave={(v) => void save(x, 'maintenance', v)} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                {x.storage_path ? <Pressable onPress={() => void view(x)}><Text style={{ color: base.blue, fontWeight: '600' }}>View</Text></Pressable>
                  : <Pressable onPress={async () => { const f = await pick(false); if (!f[0]) return; setBusy('Uploading…'); const ok = await attachToDoc(me, site, x.id, f[0]); setBusy(''); toast(ok ? 'Attached' : 'Upload failed — try again.'); refresh(); }}><Text style={{ color: base.blue, fontWeight: '600' }}>Attach certificate</Text></Pressable>}
                <View style={{ flex: 1 }} />
                <Pressable hitSlop={6} onPress={() => void del(x)}><Text>🗑</Text></Pressable>
              </View>
            </Card>
          )) : <Empty>No guarantees yet.</Empty>}
        </>
      )}
      {!!finding && <OneDriveFindPopup me={me} site={site} have={docs.map((x) => x.name)} silentIfNone={finding === 'new'}
        title={finding === 'new' ? 'Found In The Job’s OneDrive Folder' : 'Find In OneDrive'} skipLabel={finding === 'new' ? 'Skip' : 'Cancel'}
        onDone={(n) => { const was = finding; setFinding(''); if (n) { refresh(); toast(`${n} added from OneDrive`, { confirm: true }); } if (was === 'new') void makeManual(); }} />}
    </ScrollView>
  );
}
