// Admin Centre › COSHH Library (589 renderCoshhLibrary + 820 browser): the
// assessment folders (tick to move, list in more folders, export or email as
// one PDF; upload ready-made PDFs) and the products the assessments are made
// from (grouped by where their assessment is filed, duplicates marked).
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CoshhFolderPicker } from '@/components/CoshhFolderPicker';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { alsoIn, deleteFile, deleteFolder, deleteProductFull, moveFiles, newProduct, packPdf, removeDuplicates, renameFile, renameFolder, saveAssessment, uploadFiles, useAssessMap, useFolderView, useProducts, createFolder } from '@/data/coshhLib';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { COSHH_PICTO_IMG } from '@/lib/coshhPictoImages';
import { deliverPdf, emailPdf } from '@/lib/pdf';
import { brandOf, titleKey, type CoshhItem } from '@/lib/rules/coshh';
import { isFullManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card };
const chip = (on: boolean) => ({ flex: 1, padding: 9, borderRadius: 16, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card });
type Pick = { title: string; multi?: boolean; then: (ids: (string | null)[]) => void };

function Folders({ setPick }: { setPick: (p: Pick | null) => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const { data, isLoading } = useFolderView(me?.org_id, folderId);
  if (!me) return null;
  const refresh = () => { ['coshhFolder', 'coshhFolders', 'coshhAssess'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const cur = data?.current ?? null;
  return (
    <View>
      {sel.length > 0 && (
        <Card style={{ backgroundColor: '#EEF3FA' }}>
          <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 6 }}>{sel.length} selected</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {([['Move', () => setPick({ title: `Move ${sel.length} assessment${sel.length === 1 ? '' : 's'} to which folder?`, then: async ([d]) => { setPick(null); toast(`${await moveFiles(sel, d)} moved`); setSel([]); setFolderId(d); refresh(); } })],
              ['+ Also in…', () => setPick({ title: `Also put ${sel.length} assessment${sel.length === 1 ? '' : 's'} in which folder(s)?`, multi: true, then: async (ds) => { setPick(null); const n = await alsoIn(me, sel, ds); toast(n ? `Added to ${n} more folder place${n === 1 ? '' : 's'}` : 'Already in those folders'); setSel([]); refresh(); } })],
              ['Export PDF', async () => { setBusy('Building PDF…'); try { const p = await packPdf(sel); if (!p) { toast('Nothing to export.'); return; } if (p.skipped.length) toast(`Skipped (PDFs only): ${p.skipped.join(', ')}`); await deliverPdf(p.bytes, p.filename); } finally { setBusy(''); } }],
              ['Email', async () => {
                const to = (await promptText(`Email the selected COSHH assessments (${sel.length}) as one PDF to:`, ''))?.trim(); if (!to) return;
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast('Enter a valid email address.'); return; }
                setBusy('Sending…');
                try { const p = await packPdf(sel); if (!p) { toast('Nothing to email.'); return; } const err = await emailPdf(p.bytes, p.filename, `coshh-exports/${me.org_id}`, { general_label: 'COSHH assessments', recipient_email: to, cc_email: to !== me.email ? me.email || undefined : undefined, doc_title: p.label }); toast(err || 'Emailed'); if (!err) setSel([]); } finally { setBusy(''); }
              }],
              ['Clear', () => setSel([])]] as [string, () => void][]).map(([l, fn]) => <Pressable key={l} onPress={fn} style={[box, { paddingVertical: 6 }]}><Text style={{ color: base.ink, fontWeight: '700', fontSize: 12 }}>{l}</Text></Pressable>)}
          </View>
        </Card>
      )}
      {!!busy && <Card><Muted>{busy}</Muted></Card>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {cur && <Pressable onPress={() => setFolderId(cur.parent_id)} style={[box, { paddingVertical: 5 }]}><Text style={{ color: base.ink }}>‹ Up</Text></Pressable>}
        <Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{cur ? cur.name : 'Folders'}</Text>
        <Pressable onPress={async () => { const n = await promptText('New folder name', ''); if (!n || !n.trim()) return; toast((await createFolder(me, folderId, n.trim())) ? 'Folder created' : 'Could not create the folder'); refresh(); }} style={[box, { paddingVertical: 5 }]}><Text style={{ color: base.ink, fontWeight: '700' }}>+ Folder</Text></Pressable>
      </View>
      {isLoading ? <Muted>Loading…</Muted> : (data?.subfolders.length || data?.files.length) ? (
        <>
          {data.subfolders.map((f) => (
            <Pressable key={f.id} onPress={() => setFolderId(f.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
              <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>📁 {f.name}</Text>
              <Pressable hitSlop={8} onPress={async () => { const n = await promptText('Rename folder', f.name); if (n && n.trim() && n.trim() !== f.name) { toast((await renameFolder(f.id, n.trim())) ? 'Folder renamed' : 'Could not rename'); refresh(); } }}><Text>✏️</Text></Pressable>
              <Pressable hitSlop={8} onPress={async () => { if (await confirmAsk("Delete this folder and everything inside it? This can't be undone.", 'Delete')) { toast((await deleteFolder(f.id)) ? 'Folder deleted' : 'Could not delete'); refresh(); } }}><Text>🗑</Text></Pressable>
            </Pressable>
          ))}
          {data.files.map((f) => {
            const on = sel.includes(f.id);
            return (
              <Card key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderColor: on ? base.ink : base.cardLine }}>
                <Pressable onPress={() => setSel(on ? sel.filter((x) => x !== f.id) : [...sel, f.id])} hitSlop={6} style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>{on ? '✓' : ''}</Text></Pressable>
                <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{f.name}</Text>
                <Pressable onPress={async () => { const u = await openDocLink('coshh-library', f.storage_path); if (u) void Linking.openURL(u); else toast('Could not open the file.'); }}><Text style={{ color: base.blue, fontWeight: '700' }}>View</Text></Pressable>
                <Pressable hitSlop={8} onPress={async () => { const n = await promptText('Rename document', f.name); if (n && n.trim() && n.trim() !== f.name) { toast((await renameFile(f.id, n.trim())) ? 'Document renamed' : 'Could not rename'); refresh(); } }}><Text>✏️</Text></Pressable>
                <Pressable hitSlop={8} onPress={async () => { if (await confirmAsk("Delete this document from the library? This can't be undone.", 'Delete')) { toast((await deleteFile(f)) ? 'Document deleted' : 'Could not delete'); refresh(); } }}><Text>🗑</Text></Pressable>
              </Card>
            );
          })}
        </>
      ) : <Empty>Nothing here yet.</Empty>}
      <Button kind="ghost" title={`+ Upload ready-made PDFs into ${cur ? `"${cur.name}"` : 'the top level'}`} onPress={async () => {
        const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true }); if (r.canceled || !r.assets.length) return;
        const n = await uploadFiles(me, folderId, r.assets, (i) => setBusy(`Uploading ${i + 1} of ${r.assets.length}…`));
        setBusy(''); refresh();
        showAlert(n ? `✓ Upload complete — ${n === 1 ? '1 document' : `${n} documents`} added to the COSHH library.${n < r.assets.length ? ` ${r.assets.length - n} could not be uploaded — try those again.` : ''}` : 'Upload failed — nothing was added. Check your connection and try again.');
      }} />
      <Muted style={{ marginTop: 6 }}>To make an assessment from a data sheet, add the product on the Products tab, then tap Assess. On the office laptop the codes are read off the data sheet for you when you attach it.</Muted>
    </View>
  );
}

function Products({ setPick }: { setPick: (p: Pick | null) => void }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [mfr, setMfr] = useState('');
  const { data: lib, isLoading } = useProducts(me?.org_id);
  const { data: amap = {} } = useAssessMap(me?.org_id, lib);
  if (!me) return null;
  const all = lib || [];
  const refresh = () => { ['coshhProducts', 'coshhAssess', 'coshhFolder'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const of = brandOf(all);
  const brands = Array.from(new Set(all.map(of))).sort((a, b) => (a === 'No manufacturer' ? 1 : b === 'No manufacturer' ? -1 : a.localeCompare(b)));
  const cnt: Record<string, number> = {}; all.forEach((i) => { const k = titleKey(i.title); cnt[k] = (cnt[k] || 0) + 1; });
  const dupN = Object.values(cnt).reduce((t, v) => t + (v > 1 ? v - 1 : 0), 0);
  const ql = q.trim().toLowerCase();
  const list = all.filter((i) => (!mfr || of(i) === mfr) && (!ql || `${i.title} ${i.data.manufacturer} ${amap[i.id]?.folder || ''}`.toLowerCase().includes(ql)));
  const groups: Record<string, CoshhItem[]> = {}; list.forEach((it) => { const g = amap[it.id]?.folder || ''; (groups[g] = groups[g] || []).push(it); });
  const order = Object.keys(groups).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  const fmtD = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const assess = (it: CoshhItem) => setPick({ title: 'Save the assessment in which folder(s)? Tick one or more.', multi: true, then: async (ids) => {
    setPick(null); toast('Building the COSHH assessment…');
    toast((await saveAssessment(me, org, it, ids)) ? 'Saved to the COSHH Library — add it to jobs from there' : 'Could not build or save it — try again'); refresh();
  } });
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search products…" style={[box, { flex: 2 }]} />
        <Pressable onPress={async () => { const k = await chooseAction('Manufacturer', [{ key: '*', label: `All manufacturers (${all.length})` }, ...brands.map((b) => ({ key: b, label: `${b} (${all.filter((i) => of(i) === b).length})` }))]); if (k) setMfr(k === '*' ? '' : k); }} style={[box, { flex: 1, justifyContent: 'center' }]}><Text numberOfLines={1} style={{ color: base.ink }}>{mfr || 'All makers'}</Text></Pressable>
      </View>
      {dupN > 0 && (
        <Card style={{ backgroundColor: '#FDECEA', borderColor: '#F5C2BD', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, color: '#8E2B20' }}><Text style={{ fontWeight: '800' }}>{dupN} duplicate{dupN === 1 ? '' : 's'}</Text> — marked in red below</Text>
          <Button title="Remove duplicates" onPress={async () => {
            if (!(await confirmAsk(`Remove ${dupN} duplicate product${dupN === 1 ? '' : 's'}? The first copy of each is kept. Assessments already in folders aren't touched.`, 'Remove'))) return;
            const n = await removeDuplicates(all); toast(`${n} duplicate${n === 1 ? '' : 's'} removed`); refresh();
          }} />
        </Card>
      )}
      {isLoading ? <Muted>Loading…</Muted> : list.length ? order.map((g) => (
        <View key={g || 'none'}>
          <SectionTitle>{g ? `📁 ${g}` : '⚠ Not assessed yet'} ({groups[g].length})</SectionTitle>
          {groups[g].map((it) => {
            const a = amap[it.id], dup = cnt[titleKey(it.title)] > 1;
            return (
              <Pressable key={it.id} onPress={() => router.push(`/pm/admin/coshh/${it.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1, borderColor: dup ? '#E0301E' : base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
                <View style={{ flexDirection: 'row', width: 58, gap: 2 }}>{it.data.pictos.slice(0, 3).map((k) => <Image key={k} source={{ uri: COSHH_PICTO_IMG[k] }} style={{ width: 18, height: 18 }} />)}</View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{it.title}{dup ? '  · Duplicate' : ''}{it.data.needsCheck ? '  · Check' : ''}</Text>
                  <Muted>{it.data.manufacturer || 'No manufacturer'}{it.data.sdsPath ? ' · data sheet' : ' · no data sheet'}{a ? ` · ${a.due ? 'review due' : `assessed ${fmtD(a.at)}`}` : ''}</Muted>
                </View>
                {a ? (
                  <Pressable hitSlop={8} onPress={async () => {
                    const k = await chooseAction(it.title, [{ key: 'edit', label: '✏️ Edit product' }, { key: 'upd', label: '⟳ Update assessment' }, { key: 'del', label: '🗑 Delete', danger: true }]);
                    if (k === 'edit') router.push(`/pm/admin/coshh/${it.id}` as never);
                    else if (k === 'upd') {
                      if (!(await confirmAsk(`Update the COSHH assessment for "${it.title}"? It's rebuilt from the product details and dated today, replacing the old one in ${a.folder}. Jobs keep the copy they already have.`, 'Update'))) return;
                      toast('Updating…'); toast((await saveAssessment(me, org, it, [], a.files)) ? 'Assessment updated — dated today' : 'Could not update — try again'); refresh();
                    } else if (k === 'del') {
                      if (!(await confirmAsk(`Delete "${it.title}" and its COSHH assessment? Jobs keep any COSHH already added to them. This can't be undone.`, 'Delete'))) return;
                      toast((await deleteProductFull(it, a)) ? 'Deleted' : 'Could not delete'); refresh();
                    }
                  }}><Text style={{ fontSize: 18, color: base.slate }}>⋯</Text></Pressable>
                ) : <Pressable onPress={() => assess(it)} style={[box, { paddingVertical: 5 }]}><Text style={{ fontWeight: '700', color: base.ink, fontSize: 12 }}>+ Assess</Text></Pressable>}
              </Pressable>
            );
          })}
        </View>
      )) : <Empty>{all.length ? 'Nothing matches.' : 'No products yet — add your first one below.'}</Empty>}
      <Button title="+ Add a product" onPress={async () => {
        const n = await promptText('Product name', ''); if (!n || !n.trim()) return;
        const id = await newProduct(me, n.trim()); if (!id) { toast('Could not add — try again.'); return; }
        refresh(); router.push(`/pm/admin/coshh/${id}` as never);
      }} />
    </View>
  );
}

export default function CoshhLibrary() {
  const { me } = useAuth();
  const [tab, setTab] = useState<'assess' | 'products'>('assess');
  const [pick, setPick] = useState<Pick | null>(null);
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'COSHH Library' }} />
      <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
        <Muted style={{ marginBottom: 10 }}>1. Add a product and its data sheet. 2. Check it and tap Assess — the assessment is saved in a folder. 3. Add assessments to a job from its COSHH page (Add from COSHH Library), or tick them here to export or email.</Muted>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
          {([['assess', 'Assessments (folders)'], ['products', 'Products (data sheets)']] as const).map(([k, l]) => <Pressable key={k} onPress={() => setTab(k)} style={chip(tab === k)}><Text style={{ textAlign: 'center', fontWeight: '700', fontSize: 12, color: tab === k ? '#fff' : base.ink }}>{l}</Text></Pressable>)}
        </View>
        {tab === 'assess' ? <Folders setPick={setPick} /> : <Products setPick={setPick} />}
      </ScrollView>
      {pick && <CoshhFolderPicker title={pick.title} multi={pick.multi} onCancel={() => setPick(null)} onDone={pick.then} />}
    </View>
  );
}
