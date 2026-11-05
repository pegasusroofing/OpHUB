// Create COSHH on a job (Andy, 3 Nov 2026): two clear ways in. Upload Data Sheet reads each sheet into a product in
// the COSHH Library and ticks it here ready to issue; Enter Manually opens the full product form (data sheet optional)
// with Save & Issue To This Job. Products already in the library are below, closed. Issuing makes each product its own
// COSHH assessment in the job's list for the team to sign (589 renderCoshhNew).
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted } from '@/components/ui';
import { issueToSite, newProduct, previewAssessment, productFromSds, useProducts } from '@/data/coshhLib';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { showPdf } from '@/lib/pdf';
import { isFullManager, isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const pill = { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7, paddingHorizontal: 10, height: 26, justifyContent: 'center' as const };
const pillText = { fontSize: 12.5, color: '#111827' };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 };

export default function CoshhNew() {
  const { id, pick } = useLocalSearchParams<{ id: string; pick?: string }>();
  const { me, org } = useAuth();
  const { data: site } = useSite(id);
  const { data: lib = [], isLoading } = useProducts(me?.org_id);
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(pick ? [pick] : []);
  const [read, setRead] = useState<string[]>([]);
  const [mode, setMode] = useState<'sheet' | 'library' | null>(pick ? 'library' : null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assessor, setAssessor] = useState<string | null>(null);
  const [where, setWhere] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const shown = lib.filter((it) => !read.includes(it.id) && (!q.trim() || `${it.title} ${it.data.manufacturer}`.toLowerCase().includes(q.trim().toLowerCase())));
  const fromSheets = lib.filter((it) => read.includes(it.id));
  const tick = (pid: string, v: boolean) => setSel(v ? [...sel, pid] : sel.filter((x) => x !== pid));

  const uploadSheets = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true });
    if (r.canceled || !r.assets.length) return;
    setReading(true);
    try {
      const got: string[] = []; let failed = 0;
      for (const a of r.assets) {
        toast(`Reading ${a.name || 'the data sheet'}…`);
        const p = await productFromSds(me, { uri: a.uri, name: a.name || 'data-sheet.pdf', mimeType: a.mimeType || 'application/pdf' }, lib).catch(() => null);
        if (p) got.push(p.item.id); else failed++;
      }
      await qc.invalidateQueries({ queryKey: ['coshhProducts'] });
      if (got.length) { setMode('sheet'); setRead((x) => Array.from(new Set([...x, ...got]))); setSel((x) => Array.from(new Set([...x, ...got]))); }
      toast(got.length ? `${got.length} data sheet${got.length === 1 ? '' : 's'} read${failed ? ` (${failed} could not be read)` : ''}` : 'Could not read that data sheet — try again.');
    } finally { setReading(false); }
  };
  const manual = async () => {
    const n = (await promptText('Product name', ''))?.trim(); if (!n) return;
    const pid = await newProduct(me, n); if (!pid) { toast('Could not create it — try again.'); return; }
    void qc.invalidateQueries({ queryKey: ['coshhProducts'] });
    router.push(`/pm/admin/coshh/${pid}?site=${id}` as never);
  };
  const choice = (icon: string, title: string, sub: string, onPress: () => void, on?: boolean) => (
    <Pressable onPress={onPress} disabled={reading} style={({ pressed }) => ({ flex: 1, minWidth: 220, borderWidth: 1, borderColor: on ? base.blue : '#e5e7eb', backgroundColor: pressed ? '#f9fafb' : '#fff', borderRadius: 10, padding: 14, gap: 4 })}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>{icon} {title}</Text>
      <Text style={{ fontSize: 12.5, color: '#6b7280' }}>{sub}</Text>
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Create COSHH' }} />
      {!mode ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {choice('📄', reading ? 'Reading…' : 'Upload Data Sheet', 'Reads the name, hazards, codes, PPE and first aid off the Safety Data Sheet. Best on the office laptop.', () => void uploadSheets())}
          {isFullManager(me) && choice('✏️', 'Enter Manually', 'Fill in the product details yourself, and add its data sheet if you have one.', () => void manual())}
          {lib.length > 0 && choice('📚', 'Product Already In The Library', `Pick from the ${lib.length} product${lib.length === 1 ? '' : 's'} already set up.`, () => setMode('library'))}
        </View>
      ) : (
        <Pressable onPress={() => { setMode(null); setSel([]); setRead([]); }} style={{ marginBottom: 10 }}><Text style={{ color: base.blue, fontWeight: '500' }}>‹ Choose a different way</Text></Pressable>
      )}

      {mode === 'sheet' && (
        <Card>
          <Text style={{ fontWeight: '600', color: '#111827', marginBottom: 2 }}>From The Data Sheet{fromSheets.length === 1 ? '' : 's'}</Text>
          <Muted style={{ marginBottom: 8 }}>Name each assessment, check what was read, and preview it before issuing. The product is saved in the COSHH Library too.</Muted>
          {fromSheets.map((it) => (
            <View key={it.id} style={{ borderTopWidth: 1, borderTopColor: '#f0f1f3', paddingTop: 8, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}><Check label={`${it.title}${it.data.manufacturer ? ` · ${it.data.manufacturer}` : ''}`} value={sel.includes(it.id)} onChange={(v) => tick(it.id, v)} /></View>
                <Pressable onPress={async () => { toast('Building the preview…'); try { await showPdf(await previewAssessment({ ...it }, org, me, site ?? null, { where, note, name: (names[it.id] || '').replace(/^COSHH\s*[—-]\s*/i, ''), date, assessor: assessor ?? me.name ?? '' }), `COSHH - ${it.title}.pdf`); } catch { toast('Could not build the preview.'); } }} hitSlop={6} style={pill}><Text style={pillText}>Preview</Text></Pressable>
                {isFullManager(me) && <Pressable onPress={() => router.push(`/pm/admin/coshh/${it.id}?site=${id}` as never)} hitSlop={6} style={pill}><Text style={pillText}>Edit Details</Text></Pressable>}
              </View>
              <Muted style={{ fontWeight: '600', marginTop: 4 }}>COSHH name</Muted>
              <TextInput value={names[it.id] ?? `COSHH — ${it.title}`} onChangeText={(v) => setNames({ ...names, [it.id]: v })} style={box} />
            </View>
          ))}
          <Button kind="ghost" busy={reading} title="+ Another Data Sheet" onPress={() => void uploadSheets()} />
        </Card>
      )}

      {mode === 'library' && (
        <Card>
          {lib.length > 6 && <TextInput value={q} onChangeText={setQ} placeholder="Search products…" style={box} />}
          {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((it) => <Check key={it.id} label={`${it.title}${it.data.manufacturer ? ` · ${it.data.manufacturer}` : ''}`} value={sel.includes(it.id)} onChange={(v) => tick(it.id, v)} />)
            : <Empty>{lib.length ? 'Nothing matches.' : 'No products in the COSHH Library yet.'}</Empty>}
        </Card>
      )}

      {sel.length > 0 && (
        <>
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Muted style={{ fontWeight: '600' }}>Date of assessment</Muted><DateBox value={date} onChange={setDate} title="Date of assessment" style={{ marginBottom: 8 }} /></View>
              <View style={{ flex: 1 }}><Muted style={{ fontWeight: '600' }}>Assessed by</Muted><TextInput value={assessor ?? me.name ?? ''} onChangeText={setAssessor} style={box} /></View>
            </View>
            <Muted style={{ fontWeight: '600' }}>Where is it used on this job? (optional)</Muted>
            <TextInput value={where} onChangeText={setWhere} placeholder="e.g. Flat roof to rear, applied by roller" style={box} />
            <Muted style={{ fontWeight: '600' }}>Anything else to note (optional)</Muted>
            <TextInput value={note} onChangeText={setNote} placeholder="e.g. Residents' windows to be closed while in use" style={box} />
          </Card>
          <Button busy={busy} title={`Issue ${sel.length} COSHH Assessment${sel.length === 1 ? '' : 's'}`} onPress={async () => {
            const picks = lib.filter((i) => sel.includes(i.id));
            if (!picks.length || !site) return;
            setBusy(true); toast(`Building ${picks.length} COSHH assessment${picks.length === 1 ? '' : 's'}…`);
            try {
              const n = await issueToSite(me, org, site, picks, { where, note, date, assessor: assessor ?? me.name ?? '' }, names);
              if (!n) { showAlert('Could not issue — check signal and try again.'); return; }
              void qc.invalidateQueries({ queryKey: ['hsDocs', 'coshh', id] }); void qc.invalidateQueries({ queryKey: ['hsSummary', id] });
              toast(`${n} COSHH assessment${n === 1 ? '' : 's'} issued`); router.back();
            } finally { setBusy(false); }
          }} />
        </>
      )}
    </ScrollView>
  );
}
