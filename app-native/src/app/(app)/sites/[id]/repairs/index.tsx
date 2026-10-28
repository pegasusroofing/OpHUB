// Repair jobs hub (340 renderRepairJobsCategoryHub): a tile per stage with its
// count. Managers add jobs, see every tile (dimmed if hidden from operatives),
// open All Jobs and choose which tiles operatives can see.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle, Tile } from '@/components/ui';
import { addRepairJob, setRepairHiddenTiles, uploadWorkOrder, useRepairHiddenTiles, useRepairJobs } from '@/data/repairs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { REPAIR_CATEGORIES, REPAIR_TILES, type RepairJob } from '@/lib/rules/repairs';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

export default function RepairsHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: jobs = [] } = useRepairJobs(id);
  const { data: hidden = [] } = useRepairHiddenTiles(me?.org_id);
  const [adding, setAdding] = useState(false);
  const [num, setNum] = useState('');
  const [addr, setAddr] = useState('');
  const [desc, setDesc] = useState('');
  const [wo, setWo] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [vis, setVis] = useState(false);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const tiles = REPAIR_TILES.filter((k) => (k === 'to_invoice' ? mgr : mgr || !hidden.includes(k)));
  const add = async () => {
    if (!addr.trim()) { toast('Enter an address.'); return; }
    setBusy(true);
    const jid = await addRepairJob(me, site.id, { address: addr.trim(), job_number: num.trim(), description: desc.trim() });
    let woFailed = false;
    if (jid && wo) woFailed = !(await uploadWorkOrder(me, { id: jid } as RepairJob, { uri: wo.uri, name: wo.name || 'work-order.pdf', mimeType: wo.mimeType }));
    setBusy(false);
    if (!jid) { toast('Could not save — try again.'); return; }
    toast(woFailed ? 'Job added — but the work order failed to upload. Add it from the job later.' : 'Job added');
    setAdding(false); setNum(''); setAddr(''); setDesc(''); setWo(null);
    void qc.invalidateQueries({ queryKey: ['repairJobs', id] });
    router.push(`/sites/${site.id}/repairs/job/${jid}` as never);
  };
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Live Jobs' }} />
      {mgr && (adding ? (
        <Card style={{ backgroundColor: base.paper }}>
          <SectionTitle>Add Repair Job</SectionTitle>
          <TextInput value={num} onChangeText={setNum} placeholder="Job number (optional)" style={box} />
          <TextInput value={addr} onChangeText={(v) => setAddr(titleCase(v))} placeholder="Address" style={box} />
          <TextInput value={desc} onChangeText={setDesc} placeholder="Description of call out" multiline style={[box, { minHeight: 56 }]} />
          <Button kind="ghost" title={wo ? `📎 ${wo.name}` : 'Work order (optional)…'} onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setWo(r.assets[0]); }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button busy={busy} title="Add Job" onPress={() => void add()} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setAdding(false)} /></View>
          </View>
        </Card>
      ) : <Button title="+ Add Job" onPress={() => setAdding(true)} />)}
      {tiles.map((k) => {
        const def = REPAIR_CATEGORIES[k];
        const off = mgr && hidden.includes(k);
        return (
          <View key={k} style={{ opacity: off ? 0.55 : 1 }}>
            <Tile icon={def.icon} tint={base.paper} title={`${def.label}${off ? ' 🚫' : ''}`} sub={String(jobs.filter(def.match).length)} onPress={() => router.push(`/sites/${site.id}/repairs/list/${k}` as never)} />
          </View>
        );
      })}
      {mgr && (
        <>
          <Button kind="ghost" title={`View All Jobs (${jobs.length})`} onPress={() => router.push(`/sites/${site.id}/repairs/list/all` as never)} />
          <Text onPress={() => setVis(!vis)} style={{ textAlign: 'right', color: base.slate, textDecorationLine: 'underline', marginVertical: 6 }}>{vis ? 'Hide' : 'Manage'} operative tile visibility ›</Text>
          {vis && (
            <Card>
              <Muted style={{ marginBottom: 6 }}>Untick a tile to hide it from operatives on every repair contract.</Muted>
              {REPAIR_TILES.filter((k) => k !== 'to_invoice').map((k) => (
                <Check key={k} label={REPAIR_CATEGORIES[k].label} value={!hidden.includes(k)} onChange={async (v) => {
                  const next = v ? hidden.filter((x) => x !== k) : [...hidden, k];
                  if (await setRepairHiddenTiles(me.org_id as string, next)) void qc.invalidateQueries({ queryKey: ['repairHidden'] }); else toast('Could not save — try again.');
                }} />
              ))}
            </Card>
          )}
          <Card style={{ marginTop: space.m }}><Muted>Excel export, bulk add from work orders, route-order exports and OneDrive folders for jobs are still in the current app for now.</Muted></Card>
        </>
      )}
    </ScrollView>
  );
}
