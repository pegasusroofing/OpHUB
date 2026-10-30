// Repair jobs hub (340 renderRepairJobsCategoryHub): a tile per stage with its
// count. Managers add jobs, see every tile (dimmed if hidden from operatives),
// open All Jobs and choose which tiles operatives can see. A work order PDF fills
// in the new job's number, address and description (read from its own text —
// office laptop); Bulk add makes a job from each of many work orders.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { MoneyStrip } from '@/components/MoneyStrip';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Check, JobGrid, Muted, SectionTitle, Tile } from '@/components/ui';
import { addRepairJob, setRepairHiddenTiles, uploadWorkOrder, useRepairHiddenTiles, useRepairJobs } from '@/data/repairs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { supabase } from '@/lib/supabase';
import { pdfLines } from '@/lib/pdfjs';
import { exportRepairTracker } from '@/lib/repairExports';
import { parseWorkOrder } from '@/lib/rules/workOrder';
import { REPAIR_CATEGORIES, REPAIR_TILES, type RepairJob } from '@/lib/rules/repairs';
import { isFinanceUser, isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
/** Work order fields from a picked PDF (nothing when it can't be read). */
async function readWo(uri: string, name?: string | null) {
  if (!/\.pdf$/i.test(name || '')) return {};
  try { const rows = await pdfLines(new Uint8Array(await (await fetch(uri)).arrayBuffer())); return rows ? parseWorkOrder(rows) : {}; } catch { return {}; }
}
const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

export default function RepairsHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  // Nobody assigned yet: the same "assign operatives" prompt as a normal job's home (340).
  const { data: assigned } = useQuery({ queryKey: ['repairAssigned', id], enabled: !!id, queryFn: async () => (((await supabase.from('site_assignments').select('user_id').eq('site_id', id).limit(1)).data ?? []) as unknown[]).length });
  const { data: jobs = [] } = useRepairJobs(id);
  const { data: hidden = [] } = useRepairHiddenTiles(me?.org_id);
  const [adding, setAdding] = useState(false);
  const [num, setNum] = useState('');
  const [addr, setAddr] = useState('');
  const [desc, setDesc] = useState('');
  const [wo, setWo] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [vis, setVis] = useState(false);
  const [bulk, setBulk] = useState('');
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
    if (woFailed) toast('Job added — but the work order failed to upload. Add it from the job later.');
    setAdding(false); setNum(''); setAddr(''); setDesc(''); setWo(null);
    void qc.invalidateQueries({ queryKey: ['repairJobs', id] });
    router.push(`/sites/${site.id}/repairs/job/${jid}` as never);
    // Then straight into choosing the job's OneDrive folder (340) — back out to link it later from the job.
    if (await confirmAsk('Job added. Choose a OneDrive folder for it now? Photos, the work order and notes all go there once it’s linked.', 'Choose folder', 'Later')) router.push({ pathname: '/pm/onedrive-pick', params: { target: 'repairjob', id: jid } } as never);
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Live Jobs' }} />
      {isFinanceUser(me, org) && org?.has_finance && <MoneyStrip site={site} />}
      {mgr && siteStatusKey(site) === 'live' && assigned === 0 && (
        <Pressable onPress={() => router.push(`/sites/${site.id}/admin` as never)}>
          <Card style={{ backgroundColor: base.warnBg, paddingVertical: 10 }}>
            <Text style={{ color: base.ink, fontSize: 13 }}><Text style={{ fontWeight: '700' }}>Nobody is assigned to this contract yet.</Text> Tap to assign operatives so they see its jobs and can check in.</Text>
          </Card>
        </Pressable>
      )}
      {mgr && (adding ? (
        <Card style={{ backgroundColor: base.paper }}>
          <SectionTitle>Add Repair Job</SectionTitle>
          <TextInput value={num} onChangeText={setNum} placeholder="Job number (optional)" style={box} />
          <TextInput value={addr} onChangeText={(v) => setAddr(titleCase(v))} placeholder="Address" style={box} />
          <TextInput value={desc} onChangeText={setDesc} placeholder="Description of call out" multiline style={[box, { minHeight: 56 }]} />
          <Button kind="ghost" title={wo ? `📎 ${wo.name}` : 'Work order (optional)…'} onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) { const a = r.assets[0]; setWo(a); const p = await readWo(a.uri, a.name); let n = 0; if (p.jobNumber) { setNum(p.jobNumber); n++; } if (p.address) { setAddr(p.address); n++; } if (p.description) { setDesc(p.description); n++; } if (n) toast(`Filled ${n} field${n > 1 ? 's' : ''} from the work order — check before saving`); } }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button busy={busy} title="Add Job" onPress={() => void add()} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setAdding(false)} /></View>
          </View>
        </Card>
      ) : <Button title="+ Add Job" onPress={() => setAdding(true)} />)}
      <JobGrid>{tiles.map((k) => {
        const def = REPAIR_CATEGORIES[k];
        const off = mgr && hidden.includes(k);
        return (
          <Tile key={k} dim={off} icon={def.icon} tint={base.paper} title={`${def.label}${off ? ' 🚫' : ''}`} sub={String(jobs.filter(def.match).length)} onPress={() => router.push(`/sites/${site.id}/repairs/list/${k}` as never)} />
        );
      })}</JobGrid>
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
          <Button kind="ghost" title={bulk || '📥 Bulk add from work orders'} disabled={!!bulk} onPress={async () => {
            const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true });
            if (r.canceled || !r.assets.length) return;
            const have = new Set(jobs.map((j) => (j.job_number || '').trim().toLowerCase()).filter(Boolean));
            let made = 0, review = 0, dup = 0;
            for (let i = 0; i < r.assets.length; i++) {
              const a = r.assets[i]; setBulk(`Importing ${i + 1} of ${r.assets.length}…`);
              try {
                const p = await readWo(a.uri, a.name), key = (p.jobNumber || '').trim().toLowerCase();
                if (key && have.has(key)) { dup++; continue; }
                const jid = await addRepairJob(me, site.id, { address: p.address || `⚠ Review — ${(a.name || 'work order').replace(/\.pdf$/i, '')}`, job_number: p.jobNumber || '', description: p.description || '' });
                if (!jid) continue;
                await uploadWorkOrder(me, { id: jid } as RepairJob, { uri: a.uri, name: a.name || 'work-order.pdf', mimeType: a.mimeType });
                made++; if (!p.address) review++; if (key) have.add(key);
              } catch { /* one bad file doesn't stop the rest */ }
            }
            setBulk(''); void qc.invalidateQueries({ queryKey: ['repairJobs', id] });
            toast(`Done — ${made} job${made === 1 ? '' : 's'} created${review ? ` (${review} need review — the address couldn't be read, check the attached PDF)` : ''}${dup ? `, ${dup} already on this contract skipped` : ''}`);
          }} />
          <Button kind="ghost" title="⬇ Export Excel (Repair Tracker)" onPress={async () => { if (!(await exportRepairTracker(site.name, jobs))) toast('Could not make the file — try again.'); }} />
          <Card style={{ marginTop: space.m }}><Muted>Reading the work order works on the office laptop (a typed PDF, not a scan); on a phone the job is still made, marked for review. Route-order exports are on the Survey, Scaffold and Approved lists.</Muted></Card>
        </>
      )}
    </ScrollView>
  );
}
