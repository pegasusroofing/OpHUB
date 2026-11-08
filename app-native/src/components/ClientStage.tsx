// The client stage on a variation or day work, in Projects (Andy, 8 Nov 2026): where it's at with the client, the
// instruction (who, their reference, the date) and its documents, and a Client ▾ to move it on. Finance follows by itself.
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { viewDoc } from '@/components/DocViewer';
import { FinForm } from '@/components/FinForm';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { openDocLink } from '@/data/hs';
import { CLIENT_LABEL, clientTone, type ClientStatus, type SiteDoc } from '@/lib/rules/clientStage';
import { base } from '@/theme/theme';

const fd = (t: string | null | undefined) => (t ? new Date(t.length === 10 ? `${t}T12:00:00` : t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function ClientChip({ status }: { status: ClientStatus | null | undefined }) {
  const tone = clientTone(status), col = tone === 'ok' ? base.ok : tone === 'red' ? base.red : tone === 'warn' ? base.warn : base.slate;
  return <Text style={{ fontSize: 11, fontWeight: '600', color: col, borderWidth: 1, borderColor: col, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>{CLIENT_LABEL[status || 'to_issue']}</Text>;
}

export function ClientStage({ status, at, instruction, docs, withInstruction, onSet, onDocs, upload }: {
  status: ClientStatus | null | undefined; at?: string | null;
  instruction?: { instructed_by?: string | null; instruction_ref?: string | null; instructed_on?: string | null };
  docs: SiteDoc[]; withInstruction?: boolean;
  onSet: (s: ClientStatus, details?: { instructed_by?: string; instruction_ref?: string; instructed_on?: string }) => Promise<boolean>;
  onDocs: (docs: SiteDoc[]) => Promise<boolean>;
  upload: (a: { uri: string; name: string; mimeType?: string | null }) => Promise<SiteDoc | null>;
}) {
  const toast = useToast();
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState('');
  const st = status || 'to_issue';
  const set = async (s: ClientStatus, d?: Parameters<typeof onSet>[1]) => { setBusy('set'); const ok = await onSet(s, d); setBusy(''); if (!ok) toast('Could not save — only a manager can change this.'); return ok; };
  const menu = async () => {
    const k = await chooseAction('Client', [
      { key: 'issued', label: `${st === 'issued' ? '✓ ' : ''}Issued To Client` },
      { key: 'approved', label: `${st === 'approved' ? '✓ ' : ''}Client Approved${withInstruction ? '…' : ''}` },
      { key: 'rejected', label: `${st === 'rejected' ? '✓ ' : ''}Client Rejected` },
      ...(st !== 'to_issue' ? [{ key: 'to_issue', label: 'Back To Not Issued Yet' }] : []),
    ]) as ClientStatus | null;
    if (!k || k === st) return;
    if (k === 'approved' && withInstruction) { setForm(true); return; }
    if (k === 'rejected' && !(await confirmAsk('Mark it as rejected by the client? It won’t go on an application.', 'Rejected'))) return;
    await set(k);
  };
  const addDoc = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
    if (r.canceled || !r.assets.length) return;
    setBusy('doc');
    const got: SiteDoc[] = [];
    for (const a of r.assets) { const d = await upload({ uri: a.uri, name: a.name || 'document', mimeType: a.mimeType }); if (d) got.push(d); }
    const ok = got.length ? await onDocs([...docs, ...got]) : false;
    setBusy('');
    if (!ok) toast('Upload failed — check your signal and try again.');
  };
  return (
    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: base.line, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontWeight: '600', color: base.ink }}>Client</Text>
        <ClientChip status={st} />
        {!!at && st !== 'to_issue' && <Muted>{fd(at)}</Muted>}
      </View>
      {st === 'approved' && (instruction?.instructed_by || instruction?.instruction_ref || instruction?.instructed_on) && (
        <Muted style={{ marginTop: 4 }}>{[instruction?.instructed_by ? `Instructed By ${instruction.instructed_by}` : '', instruction?.instruction_ref ? `Ref ${instruction.instruction_ref}` : '', instruction?.instructed_on ? fd(instruction.instructed_on) : ''].filter(Boolean).join(' · ')}</Muted>
      )}
      {st === 'approved' ? <Muted style={{ marginTop: 2 }}>Goes on the next application for payment.</Muted>
        : st !== 'rejected' ? <Muted style={{ marginTop: 2 }}>Goes on an application once the client approves it.</Muted> : null}
      {docs.map((d, i) => (
        <View key={`${d.path}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text style={{ color: base.blue, flex: 1 }} onPress={async () => { const u = await openDocLink(d.bucket, d.path); if (u) viewDoc(u, d.name); }}>📄 {d.name}</Text>
          <Text accessibilityLabel={`Remove ${d.name}`} style={{ color: base.slate }} onPress={async () => { if (await confirmAsk(`Remove "${d.name}"?`, 'Remove')) await onDocs(docs.filter((_, j) => j !== i)); }}>✕</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 }}>
        <Button small busy={busy === 'set'} title="Client ▾" onPress={() => void menu()} />
        <Button small kind="ghost" busy={busy === 'doc'} title="📎 Add Document" onPress={() => void addDoc()} />
      </View>
      {form && (
        <FinForm title="Client Approved" saveLabel="Client Approved" note="The client's instruction: who gave it, their reference and the date." onClose={() => setForm(false)}
          initial={{ instructed_by: instruction?.instructed_by || '', instruction_ref: instruction?.instruction_ref || '', instructed_on: instruction?.instructed_on || new Date().toISOString().slice(0, 10) }}
          fields={[{ k: 'instructed_by', label: 'Instructed By', half: true }, { k: 'instruction_ref', label: 'Instruction Ref', half: true }, { k: 'instructed_on', label: 'Date', kind: 'date' }]}
          onSave={async (v) => (await set('approved', { instructed_by: String(v.instructed_by || ''), instruction_ref: String(v.instruction_ref || ''), instructed_on: String(v.instructed_on || '') })) ? null : 'Could not save — try again.'} />
      )}
    </View>
  );
}
