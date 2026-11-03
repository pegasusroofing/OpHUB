// Create COSHH on a job (589 renderCoshhNew): tick the products being used,
// say where (optional), Issue — each becomes its own COSHH assessment in the
// job's list for the team to sign, with its data sheet attached.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput } from 'react-native';

import { promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted } from '@/components/ui';
import * as DocumentPicker from 'expo-document-picker';

import { issueToSite, newProduct, productFromSds, useProducts } from '@/data/coshhLib';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isFullManager, isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

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
  const [where, setWhere] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const shown = lib.filter((it) => !q.trim() || `${it.title} ${it.data.manufacturer}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Create COSHH' }} />
      <Card>
        <Muted style={{ marginBottom: 10 }}>Tick the products being used on this job. Each one becomes its own COSHH assessment in the job&apos;s COSHH list for the team to sign, with its data sheet attached.</Muted>
        {lib.length > 0 && <TextInput value={q} onChangeText={setQ} placeholder="Search products…" style={box} />}
        {shown.length > 1 && <Check label="Select all" value={shown.every((i) => sel.includes(i.id))} onChange={(v) => setSel(v ? Array.from(new Set([...sel, ...shown.map((i) => i.id)])) : sel.filter((x) => !shown.some((i) => i.id === x)))} />}
        {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((it) => <Check key={it.id} label={`${it.title}${it.data.manufacturer ? ` · ${it.data.manufacturer}` : ''}${it.data.sdsPath ? '' : ' · no data sheet'}`} value={sel.includes(it.id)} onChange={(v) => setSel(v ? [...sel, it.id] : sel.filter((x) => x !== it.id))} />)
          : <Empty>{lib.length ? 'Nothing matches.' : 'No products in the COSHH Library yet.'}</Empty>}
      </Card>
      {/* A Safety Data Sheet makes the COSHH (Andy, 3 Nov 2026): the sheet is read, the product goes into the COSHH Library
          (or fills the blanks of the one already there) and is ticked here ready to issue. */}
      <Button busy={reading} title="📄 Upload Safety Data Sheet(s)" onPress={async () => {
        const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true });
        if (r.canceled || !r.assets.length) return;
        setReading(true);
        try {
          const got: string[] = []; let failed = 0;
          for (const a of r.assets) {
            toast(`Reading ${a.name || 'the data sheet'}…`);
            const p = await productFromSds(me, { uri: a.uri, name: a.name || 'data-sheet.pdf', mimeType: a.mimeType || 'application/pdf' } as never, lib).catch(() => null);
            if (p) got.push(p.item.id); else failed++;
          }
          await qc.invalidateQueries({ queryKey: ['coshhProducts'] });
          if (got.length) setSel((x) => Array.from(new Set([...x, ...got])));
          toast(got.length ? `${got.length} product${got.length === 1 ? '' : 's'} read from the data sheet${got.length === 1 ? '' : 's'} and ticked — check the details in the COSHH Library, then Issue${failed ? ` (${failed} could not be read)` : ''}` : 'Could not read that data sheet — try again.');
        } finally { setReading(false); }
      }} />
      <Muted style={{ marginTop: 4, marginBottom: 8 }}>Reads the product name, hazards, codes, PPE and first aid from the sheet. Best on the office laptop.</Muted>
      {isFullManager(me) && <Button kind="ghost" title="+ Product not listed? Add it in the COSHH Library" onPress={async () => {
        const n = (await promptText('New product name', ''))?.trim(); if (!n) return;
        const pid = await newProduct(me, n); if (!pid) { toast('Could not create it — try again.'); return; }
        void qc.invalidateQueries({ queryKey: ['coshhProducts'] });
        router.push(`/pm/admin/coshh/${pid}` as never);
      }} />}
      {lib.length > 0 && (
        <>
          <Card>
            <Muted style={{ fontWeight: '700' }}>Where is it used on this job? (optional)</Muted>
            <TextInput value={where} onChangeText={setWhere} placeholder="e.g. Flat roof to rear, applied by roller" style={box} />
            <Muted style={{ fontWeight: '700' }}>Anything else to note (optional)</Muted>
            <TextInput value={note} onChangeText={setNote} placeholder="e.g. Residents' windows to be closed while in use" style={box} />
          </Card>
          <Button busy={busy} title="Issue COSHH" onPress={async () => {
            const picks = lib.filter((i) => sel.includes(i.id));
            if (!picks.length) { toast('Tick at least one product'); return; }
            if (!site) return;
            setBusy(true); toast(`Building ${picks.length} COSHH assessment${picks.length === 1 ? '' : 's'}…`);
            try {
              const n = await issueToSite(me, org, site, picks, { where, note });
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
