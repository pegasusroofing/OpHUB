// Create COSHH on a job (589 renderCoshhNew): tick the products being used,
// say where (optional), Issue — each becomes its own COSHH assessment in the
// job's list for the team to sign, with its data sheet attached.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput } from 'react-native';

import { promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted } from '@/components/ui';
import { issueToSite, newProduct, useProducts } from '@/data/coshhLib';
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
