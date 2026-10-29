// COSHH product (589 renderCoshhSubstanceEdit): name, maker, use, the Safety
// Data Sheet, hazard symbols, signal word, H / P codes (type the code, the
// official wording fills in), how it harms, PPE, risk, controls, first aid,
// storage, spills, disposal, fire — and making / updating its assessment.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CoshhFolderPicker } from '@/components/CoshhFolderPicker';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { assessMap, deleteProductFull, loadProduct, previewAssessment, saveAssessment, saveProduct, uploadSds } from '@/data/coshhLib';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { pdfPageTexts } from '@/lib/pdfjs';
import { applySds, dropRepeats, readSds } from '@/lib/rules/sdsRead';
import { COSHH_PICTO_IMG } from '@/lib/coshhPictoImages';
import { deliverPdf } from '@/lib/pdf';
import { codeText, COSHH_PICTOS, COSHH_ROUTES, parseCodes, suggestPictos, suggestSignal, type CoshhData, type CoshhItem } from '@/lib/rules/coshh';
import { RAMS_PPE } from '@/lib/rules/rams';
import { isFullManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const chipStyle = (on: boolean) => ({ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card });

export default function CoshhProduct() {
  const { pid } = useLocalSearchParams<{ pid: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['coshhProduct', pid], enabled: !!pid, gcTime: 0, queryFn: () => loadProduct(pid) });
  if (!me) return null;
  if (!isFullManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>That product is no longer in the library.</Muted>;
  return <Editor key={data.id} initial={data} />;
}

function Codes({ codes }: { codes: string[] }) {
  return <View style={{ marginBottom: 8 }}>{codes.map((c) => { const t = codeText(c); return <Text key={c} style={{ color: base.ink, marginBottom: 2 }}><Text style={{ fontWeight: '800' }}>{c}</Text> {t || <Text style={{ color: '#C0392B' }}>— code not recognised, check it</Text>}</Text>; })}</View>;
}

function Editor({ initial }: { initial: CoshhItem }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [it, setIt] = useState<CoshhItem>(initial);
  const [hText, setHText] = useState(initial.data.h.join(' '));
  const [pText, setPText] = useState(initial.data.p.join(' '));
  const [busy, setBusy] = useState('');
  const [picking, setPicking] = useState(false);
  const { data: amap } = useQuery({ queryKey: ['coshhAssess', me?.org_id, it.id], enabled: !!me, queryFn: () => assessMap(me?.org_id ?? null, [initial]) });
  if (!me) return null;
  const a = amap?.[it.id];
  const d = it.data;
  const set = (patch: Partial<CoshhData>) => setIt((x) => ({ ...x, data: { ...x.data, ...patch } }));
  const toggle = (k: 'pictos' | 'routes' | 'ppe', v: string) => set({ [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : k === 'pictos' ? COSHH_PICTOS.map((p) => p.key).filter((x) => x === v || d.pictos.includes(x)) : [...d[k], v] });
  const refresh = () => { ['coshhProducts', 'coshhAssess', 'coshhFolder'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const saveFirst = async () => {
    if (!it.title.trim()) { toast('Give the product a name first'); return false; }
    if (!(await saveProduct(it))) { toast('Could not save — try again'); return false; }
    return true;
  };
  const area = (k: keyof CoshhData, label: string, h = 70) => (
    <>
      <Muted style={{ fontWeight: '700' }}>{label}</Muted>
      <TextInput value={String(d[k] || '')} onChangeText={(v) => set({ [k]: v })} multiline style={[box, { minHeight: h }]} />
    </>
  );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'COSHH Product' }} />
      <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionTitle>COSHH assessment</SectionTitle>
          {a ? (
            <>
              <Text style={{ fontWeight: '700', color: a.due ? '#B23B2E' : '#1E7A3C', marginBottom: 6 }}>{a.due ? '⚠ Review due — assessed' : '✅ Assessed'} {new Date(a.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {a.folder}</Text>
              <Muted style={{ marginBottom: 8 }}>Changed something, or doing the yearly review? Update rebuilds it from these details and dates it today, replacing the old one in its folder.</Muted>
            </>
          ) : <Muted style={{ marginBottom: 8 }}>Makes the COSHH assessment from these details{d.sdsPath ? ' with the data sheet attached at the back' : ''}, and saves it in a folder of the COSHH Library.</Muted>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 2 }}><Button busy={!!busy} title={a ? '⟳ Update assessment' : 'Create COSHH assessment'} onPress={async () => {
              if (!(await saveFirst())) return;
              if (!a) { setPicking(true); return; }
              if (!(await confirmAsk(`Update the COSHH assessment for "${it.title}"? It's rebuilt from the product details and dated today, replacing the old one in ${a.folder}. Jobs keep the copy they already have.`, 'Update'))) return;
              setBusy('Updating…');
              try { toast((await saveAssessment(me, org, it, [], a.files)) ? 'Assessment updated — dated today' : 'Could not update — try again'); refresh(); } finally { setBusy(''); }
            }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Preview" onPress={async () => { setBusy('Building preview…'); try { await deliverPdf(await previewAssessment(it, org, me), `COSHH preview - ${(it.title || 'product').replace(/[\\/:*?"<>|]+/g, '-')}.pdf`); } finally { setBusy(''); } }} /></View>
          </View>
          {a && <Pressable onPress={async () => { const u = await openDocLink('coshh-library', a.files[0].storage_path); if (u) void Linking.openURL(u); }} style={{ marginTop: 8 }}><Text style={{ color: base.blue, fontWeight: '700' }}>View the current assessment</Text></Pressable>}
        </Card>
        <Card>
          <Muted style={{ fontWeight: '700' }}>Product name <Text style={{ color: '#C0392B' }}>*</Text></Muted>
          <TextInput value={it.title} onChangeText={(t) => setIt((x) => ({ ...x, title: t }))} style={box} />
          <Muted style={{ fontWeight: '700' }}>Manufacturer / supplier</Muted>
          <TextInput value={d.manufacturer} onChangeText={(v) => set({ manufacturer: v })} style={box} />
          <Muted style={{ fontWeight: '700' }}>What it&apos;s used for</Muted>
          <TextInput value={d.use} onChangeText={(v) => set({ use: v })} placeholder="e.g. Bonding insulation boards to the deck" style={box} />
        </Card>
        <Card>
          <SectionTitle>Safety Data Sheet (optional)</SectionTitle>
          {!!d.sdsPath && <Pressable onPress={async () => { const u = await openDocLink('coshh-library', d.sdsPath); if (u) void Linking.openURL(u); else toast('Could not open the file.'); }} style={{ marginBottom: 8 }}><Text style={{ color: base.blue, fontWeight: '700' }}>📄 {d.sdsName || 'Safety Data Sheet'}</Text></Pressable>}
          <Button kind="ghost" busy={busy === 'sds'} title={d.sdsPath ? 'Replace data sheet (PDF)' : 'Add data sheet (PDF)'} onPress={async () => {
            const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
            setBusy('sds');
            try {
              const a = r.assets[0];
              const p = await uploadSds(me, a);
              if (!p) { toast('Upload failed — check your signal and try again.'); return; }
              // Read the data sheet's own text (office laptop) and fill in what it can.
              let n = 0;
              try {
                const pages = await pdfPageTexts(new Uint8Array(await (await fetch(a.uri)).arrayBuffer()));
                if (pages) {
                  const got = applySds(it.title, { ...it.data, sdsPath: p, sdsName: a.name }, readSds(dropRepeats(pages)));
                  n = got.n; setIt({ ...it, title: got.title, data: got.d }); setHText(got.d.h.join(' ')); setPText(got.d.p.join(' '));
                }
              } catch { /* still attached; fill in by hand */ }
              if (!n) set({ sdsPath: p, sdsName: a.name });
              toast(n ? `Data sheet attached — ${n} thing${n === 1 ? '' : 's'} filled in from it. Check them, then Save` : 'Data sheet attached — fill in the codes below from it, then Save');
            } finally { setBusy(''); }
          }} />
          <Muted style={{ marginTop: 6 }}>It&apos;s attached to the back of every COSHH assessment made from this product. On the office laptop the codes, symbols and sections are read off it for you — always check them.</Muted>
        </Card>
        <Card>
          <SectionTitle>Hazard symbols</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {COSHH_PICTOS.map((p) => { const on = d.pictos.includes(p.key); return (
              <Pressable key={p.key} onPress={() => toggle('pictos', p.key)} style={{ width: 92, alignItems: 'center', padding: 6, borderRadius: 10, borderWidth: 2, borderColor: on ? base.ink : base.line, opacity: on ? 1 : 0.55 }}>
                <Image source={{ uri: COSHH_PICTO_IMG[p.key] }} style={{ width: 48, height: 48 }} />
                <Text style={{ fontSize: 11, textAlign: 'center', color: base.ink }}>{p.label}</Text>
              </Pressable>
            ); })}
          </View>
          <Muted style={{ fontWeight: '700', marginTop: 10 }}>Signal word</Muted>
          <View style={{ flexDirection: 'row', gap: 6 }}>{['', 'Warning', 'Danger'].map((w) => <Pressable key={w || 'none'} onPress={() => set({ signal: w })} style={chipStyle(d.signal === w)}><Text style={{ color: d.signal === w ? '#fff' : base.ink }}>{w || 'None'}</Text></Pressable>)}</View>
        </Card>
        <Card>
          <SectionTitle>Hazard statements (H codes)</SectionTitle>
          <TextInput value={hText} onChangeText={(v) => { setHText(v); set({ h: parseCodes(v, 'H') }); }} placeholder="Type the codes, e.g. H315 H317 H319" autoCapitalize="characters" style={box} />
          <Codes codes={d.h} />
          {d.h.length > 0 && !d.pictos.length && <Button kind="ghost" title="Fill in the usual symbols & signal word for these codes" onPress={() => set({ pictos: suggestPictos(d.h), signal: d.signal || suggestSignal(d.h) })} />}
          <SectionTitle>Precautionary statements (P codes)</SectionTitle>
          <TextInput value={pText} onChangeText={(v) => { setPText(v); set({ p: parseCodes(v, 'P') }); }} placeholder="e.g. P280 P305+P351+P338" autoCapitalize="characters" style={box} />
          <Codes codes={d.p} />
          <Muted style={{ fontWeight: '700' }}>Workplace exposure limit (if on the data sheet)</Muted>
          <TextInput value={d.wel} onChangeText={(v) => set({ wel: v })} placeholder="e.g. Portland cement dust 10 mg/m³ inhalable (8hr TWA)" style={box} />
        </Card>
        <Card>
          <SectionTitle>How can it harm you?</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{COSHH_ROUTES.map(([k, l]) => <Pressable key={k} onPress={() => toggle('routes', k)} style={chipStyle(d.routes.includes(k))}><Text style={{ fontSize: 12, color: d.routes.includes(k) ? '#fff' : base.ink }}>{l}</Text></Pressable>)}</View>
          <SectionTitle>PPE to wear</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{RAMS_PPE.map((p) => <Pressable key={p.key} onPress={() => toggle('ppe', p.key)} style={chipStyle(d.ppe.includes(p.key))}><Text style={{ fontSize: 12, color: d.ppe.includes(p.key) ? '#fff' : base.ink }}>{p.icon} {p.label}</Text></Pressable>)}</View>
          <Muted style={{ fontWeight: '700', marginTop: 10 }}>Risk level</Muted>
          <View style={{ flexDirection: 'row', gap: 6 }}>{['Low', 'Medium', 'High'].map((w) => <Pressable key={w} onPress={() => set({ risk: w })} style={chipStyle(d.risk === w)}><Text style={{ color: d.risk === w ? '#fff' : base.ink }}>{w}</Text></Pressable>)}</View>
        </Card>
        <Card>
          {area('controls', 'How to use it safely (controls)', 90)}
          {area('firstAid', 'First aid', 110)}
          {area('storage', 'Storage')}
          {area('spill', 'Spillage')}
          {area('disposal', 'Disposal')}
          {area('fire', 'Fire')}
        </Card>
        <Button title="Save product" onPress={async () => { if (await saveFirst()) { toast('Saved'); refresh(); router.back(); } }} />
        <View style={{ marginTop: 8 }}><Button kind="ghost" title="Delete product" onPress={async () => {
          if (!(await confirmAsk(`Delete "${it.title}"${a ? ' and its COSHH assessment' : ''}? Jobs keep any COSHH already added to them. This can't be undone.`, 'Delete'))) return;
          if (await deleteProductFull(it, a)) { toast('Deleted'); refresh(); router.back(); } else toast('Could not delete — try again.');
        }} /></View>
      </ScrollView>
      {picking && <CoshhFolderPicker title="Save the assessment in which folder(s)? Tick one or more." multi onCancel={() => setPicking(false)} onDone={async (ids) => {
        setPicking(false); setBusy('Building the COSHH assessment…');
        try {
          const ok = await saveAssessment(me, org, it, ids);
          toast(ok ? 'Saved to the COSHH Library — add it to jobs from there' : 'Could not build or save it — try again');
          if (ok) { refresh(); router.back(); }
        } finally { setBusy(''); }
      }} />}
    </View>
  );
}
