// + New Job on a repair contract (Andy, 7 Nov 2026), the same in Projects and in Finance › Works Orders.
// Choose the works order PDF and it fills in the rest; one tenant (name and phone). Saving makes the job's own
// folder in the contract's OneDrive folder straight away, from the template (Survey Photos, Completion Photos, and
// the works order in the job folder itself). No OneDrive folder on the contract yet: it offers to choose one.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { makeRepairJobFolder } from '@/data/repairOneDrive';
import { addRepairJob, uploadWorkOrder } from '@/data/repairs';
import { useAuth } from '@/lib/auth';
import { pdfLines } from '@/lib/pdfjs';
import { dueFromPriority } from '@/lib/rules/repairDue';
import { parseWorkOrder } from '@/lib/rules/workOrder';
import type { RepairJob } from '@/lib/rules/repairs';
import { base, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8, fontSize: 15 } as const;
/** Works order fields from a picked PDF (nothing when it can't be read). */
export async function readWo(uri: string, name?: string | null) {
  if (!/\.pdf$/i.test(name || '')) return {};
  try { const rows = await pdfLines(new Uint8Array(await (await fetch(uri)).arrayBuffer())); return rows ? parseWorkOrder(rows) : {}; } catch { return {}; }
}
// 030 applyTitleCase: capitals only at the start or after a space (Andy's House, not Andy'S House).
const titleCase = (t: string) => t.replace(/(^|\s)([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase());
const EMPTY = { job_number: '', address: '', description: '', tenant_name: '', tenant_phone: '', priority: '' };

/** After a job is added (and after the bulk add): its OneDrive folder, or the offer to link the contract's folder. */
export async function afterJobsAdded(siteId: string, folder: { ok: boolean; error?: string }, toast: (t: string) => void) {
  if (folder.ok) return;
  if (folder.error === 'no_site_folder') {
    if (await confirmAsk('This contract has no OneDrive folder yet, so the job’s folder couldn’t be made. Choose the contract’s main folder now? Each job then gets its own folder in it, with Survey Photos and Completion Photos.', 'Choose Folder', 'Later')) {
      router.push({ pathname: '/pm/onedrive-pick', params: { target: 'progress', id: siteId } } as never);
    }
    return;
  }
  toast(folder.error === 'not_connected' ? 'Job added — OneDrive isn’t connected, so its folder wasn’t made.' : 'Job added — its OneDrive folder couldn’t be made. Update ▾ › Send Everything To OneDrive tries again.');
}

export function RepairNewJob({ siteId, existing = [], onAdded, onCancel }: { siteId: string; existing?: string[]; onAdded: (jobId: string | null) => void; onCancel: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [wo, setWo] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState('');
  if (!me) return null;
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((o) => ({ ...o, [k]: k === 'address' ? titleCase(v) : v }));
  // Several works orders at once (Andy, 8 Nov 2026: one upload for one or many): a job for each, read from its PDF;
  // ones already on the contract (same works order number) are skipped.
  const addMany = async (assets: DocumentPicker.DocumentPickerAsset[]) => {
    const have = new Set(existing.map((n) => n.trim().toLowerCase()).filter(Boolean));
    let made = 0, review = 0, dup = 0, noFolder = false;
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i]; setBulk(`Adding ${i + 1} of ${assets.length}…`);
      try {
        const p = await readWo(a.uri, a.name), key = (p.jobNumber || '').trim().toLowerCase();
        if (key && have.has(key)) { dup++; continue; }
        const jid = await addRepairJob(me, siteId, { address: p.address || `⚠ Review — ${(a.name || 'works order').replace(/\.pdf$/i, '')}`, job_number: p.jobNumber || '', description: p.description || '', tenant_name: p.tenant || '', tenant_phone: p.tenantPhone || '' });
        if (!jid) continue;
        // Each job's own OneDrive folder first, so its works order lands in it.
        if (!noFolder) { const fo = await makeRepairJobFolder(jid); if (fo.error === 'no_site_folder') noFolder = true; }
        await uploadWorkOrder(me, { id: jid, site_id: siteId } as RepairJob, { uri: a.uri, name: a.name || 'work-order.pdf', mimeType: a.mimeType });
        made++; if (!p.address) review++; if (key) have.add(key);
      } catch { /* one bad file doesn't stop the rest */ }
    }
    setBulk(''); void qc.invalidateQueries({ queryKey: ['repairJobs', siteId] });
    toast(`${made} job${made === 1 ? '' : 's'} added${review ? ` (${review} need checking — the address couldn't be read, see the attached PDF)` : ''}${dup ? `, ${dup} already on this contract skipped` : ''}`);
    onAdded(null);
    if (noFolder && made) await afterJobsAdded(siteId, { ok: false, error: 'no_site_folder' }, toast);
  };
  const pickWo = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
    if (r.canceled || !r.assets.length) return;
    if (r.assets.length > 1) { await addMany(r.assets); return; }
    const a = r.assets[0]; setWo(a);
    const p = await readWo(a.uri, a.name);
    const next = { ...f, ...(p.jobNumber ? { job_number: p.jobNumber } : {}), ...(p.address ? { address: p.address } : {}), ...(p.description ? { description: p.description } : {}), ...(p.tenant ? { tenant_name: p.tenant } : {}), ...(p.tenantPhone ? { tenant_phone: p.tenantPhone } : {}) };
    const n = Object.keys(next).filter((k) => next[k as keyof typeof EMPTY] !== f[k as keyof typeof EMPTY]).length;
    setF(next);
    if (n) toast(`Filled ${n} field${n > 1 ? 's' : ''} from the works order — check before saving`);
  };
  const add = async () => {
    if (!f.address.trim()) { toast('Enter an address.'); return; }
    setBusy(true);
    const jid = await addRepairJob(me, siteId, f);
    if (!jid) { setBusy(false); toast('Could not save — try again.'); return; }
    // The job's folder first, so the works order lands in it.
    const folder = await makeRepairJobFolder(jid);
    let woFailed = false;
    if (wo) woFailed = !(await uploadWorkOrder(me, { id: jid, site_id: siteId } as RepairJob, { uri: wo.uri, name: wo.name || 'work-order.pdf', mimeType: wo.mimeType }));
    setBusy(false);
    if (woFailed) toast('Job added — but the works order failed to upload. Add it from the job later.');
    setF(EMPTY); setWo(null);
    void qc.invalidateQueries({ queryKey: ['repairJobs', siteId] });
    onAdded(jid);
    await afterJobsAdded(siteId, folder, toast);
  };
  const row = { flexDirection: 'row', gap: 8 } as const;
  return (
    <Card style={{ backgroundColor: base.paper }}>
      <SectionTitle>New Job</SectionTitle>
      <View style={{ marginBottom: 12 }}><Button kind="ghost" busy={!!bulk} title={bulk || (wo ? `📎 ${wo.name}` : '📎 Upload Works Order/Orders')} onPress={() => void pickWo()} /></View>
      {!bulk && !wo && <Muted style={{ marginTop: -6, marginBottom: 10, textAlign: 'center' }}>One works order fills in the boxes below. Several make a job each.</Muted>}
      <View style={row}>
        <TextInput value={f.job_number} onChangeText={set('job_number')} placeholder="Works Order Number" accessibilityLabel="Works Order Number" style={[box, { flex: 1 }]} />
        <TextInput value={f.priority} onChangeText={set('priority')} placeholder="Priority (E.g. 7 Days)" accessibilityLabel="Priority" style={[box, { flex: 1 }]} />
      </View>
      {!!dueFromPriority(f.priority, new Date()) && <Muted style={{ marginTop: -4, marginBottom: 8 }}>Due {dueFromPriority(f.priority, new Date())?.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} (from the priority)</Muted>}
      <TextInput value={f.address} onChangeText={set('address')} placeholder="Address (With The Postcode, For The Check-In)" accessibilityLabel="Address" style={box} />
      <TextInput value={f.description} onChangeText={set('description')} placeholder="Call-Out (What’s Wrong)" accessibilityLabel="Call-Out" multiline style={[box, { minHeight: 56 }]} />
      <View style={row}>
        <TextInput value={f.tenant_name} onChangeText={set('tenant_name')} placeholder="Resident Name" accessibilityLabel="Resident Name" style={[box, { flex: 1 }]} />
        <TextInput value={f.tenant_phone} onChangeText={set('tenant_phone')} placeholder="Resident Contact Number" accessibilityLabel="Resident Contact Number" keyboardType="phone-pad" style={[box, { flex: 1 }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        <Button busy={busy} title="Add Job" onPress={() => void add()} />
        <Button kind="ghost" title="Cancel" onPress={() => { setF(EMPTY); setWo(null); onCancel(); }} />
      </View>
    </Card>
  );
}
