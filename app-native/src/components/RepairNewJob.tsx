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

export function RepairNewJob({ siteId, onAdded, onCancel }: { siteId: string; onAdded: (jobId: string) => void; onCancel: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [wo, setWo] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((o) => ({ ...o, [k]: k === 'address' ? titleCase(v) : v }));
  const pickWo = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
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
      <Button kind="ghost" title={wo ? `📎 ${wo.name}` : '📎 Choose The Works Order PDF (Fills In The Rest)'} onPress={() => void pickWo()} />
      <View style={row}>
        <TextInput value={f.job_number} onChangeText={set('job_number')} placeholder="Works Order Number" accessibilityLabel="Works Order Number" style={[box, { flex: 1 }]} />
        <TextInput value={f.priority} onChangeText={set('priority')} placeholder="Priority (E.g. 7 Days)" accessibilityLabel="Priority" style={[box, { flex: 1 }]} />
      </View>
      {!!dueFromPriority(f.priority, new Date()) && <Muted style={{ marginTop: -4, marginBottom: 8 }}>Due {dueFromPriority(f.priority, new Date())?.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} (from the priority)</Muted>}
      <TextInput value={f.address} onChangeText={set('address')} placeholder="Address (With The Postcode, For The Check-In)" accessibilityLabel="Address" style={box} />
      <TextInput value={f.description} onChangeText={set('description')} placeholder="Call-Out (What’s Wrong)" accessibilityLabel="Call-Out" multiline style={[box, { minHeight: 56 }]} />
      <View style={row}>
        <TextInput value={f.tenant_name} onChangeText={set('tenant_name')} placeholder="Tenant" accessibilityLabel="Tenant" style={[box, { flex: 1 }]} />
        <TextInput value={f.tenant_phone} onChangeText={set('tenant_phone')} placeholder="Tenant Phone" accessibilityLabel="Tenant Phone" keyboardType="phone-pad" style={[box, { flex: 1 }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        <Button busy={busy} title="Add Job" onPress={() => void add()} />
        <Button kind="ghost" title="Cancel" onPress={() => { setF(EMPTY); setWo(null); onCancel(); }} />
      </View>
    </Card>
  );
}
