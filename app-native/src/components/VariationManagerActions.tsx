// Manager buttons on an open variation (800): value (PMs/admins only), Approve,
// Decline with a reason, Modify then Approve, Add to Schedule of Works, Close, Delete.
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { addVariationToSchedule, closeVariation, decideVariation, deleteVariation, saveVariationValue, type Variation } from '@/data/variations';
import { useAuth } from '@/lib/auth';
import { readMoney, valueOf } from '@/lib/rules/variations';
import { isFinanceUser, isFullManager } from '@/lib/roles';
import { base, radius } from '@/theme/theme';

type V = Variation & { cost_impact?: string | null; schedule_section_id?: string | null };

export function VariationManagerActions({ v, siteId, onChanged }: { v: V; siteId: string; onChanged: () => void }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const canPrice = isFullManager(me);
  const fin = isFinanceUser(me, org);
  const cur = valueOf(v.cost_impact);
  const [val, setVal] = useState(cur != null ? String(cur) : '');
  const [mode, setMode] = useState<null | 'decline' | 'modify'>(null);
  const [reason, setReason] = useState('');
  const [desc, setDesc] = useState(v.description);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const pending = !v.approval_status || v.approval_status === 'pending';
  const readVal = (): number | null | undefined | 'bad' => {
    if (!canPrice) return undefined;
    const n = readMoney(val);
    return Number.isNaN(n as number) ? 'bad' : n;
  };
  const run = async (fn: () => Promise<boolean | string>, ok: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (typeof r === 'string') toast(r); else if (r) toast(ok); else toast('Could not save — try again.');
    if (r !== false) onChanged();
  };

  if (v.status === 'closed') return null;
  return (
    <View style={{ marginTop: 10 }}>
      {canPrice && (
        <View style={{ marginBottom: 8 }}>
          <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Value to the client (£, ex VAT)</Muted>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={val} onChangeText={setVal} keyboardType="decimal-pad" placeholder="e.g. 850" style={[box, { flex: 1 }]} />
            <Button kind="ghost" title="Save value" onPress={() => {
              const n = readVal(); if (n === 'bad') { toast('Enter the value as a number, e.g. 850'); return; }
              void run(() => saveVariationValue(v, n ?? null, fin), '');
            }} />
          </View>
        </View>
      )}
      {mode === 'decline' ? (
        <View>
          <TextInput value={reason} onChangeText={setReason} placeholder="Reason for declining" multiline style={box} />
          <Button busy={busy} title="Decline" onPress={() => {
            if (!reason.trim()) { toast('Enter a reason for declining.'); return; }
            void run(() => decideVariation(me, siteId, v, { approve: false, reason: reason.trim(), financeUser: fin }), 'Variation declined');
          }} />
          <Button kind="ghost" title="Cancel" onPress={() => setMode(null)} />
        </View>
      ) : mode === 'modify' ? (
        <View>
          <TextInput value={desc} onChangeText={setDesc} multiline style={box} />
          <Button busy={busy} title="Save & Approve" onPress={() => {
            if (!desc.trim()) { toast('Enter a description.'); return; }
            const n = readVal(); if (n === 'bad') { toast('Enter the value as a number, e.g. 850'); return; }
            void run(() => decideVariation(me, siteId, v, { approve: true, description: desc.trim(), value: n, financeUser: fin }), 'Modified and approved');
          }} />
          <Button kind="ghost" title="Cancel" onPress={() => setMode(null)} />
        </View>
      ) : (
        <View style={{ gap: 2 }}>
          {pending && (
            <>
              <Button busy={busy} title="Approve" onPress={() => {
                const n = readVal(); if (n === 'bad') { toast('Enter the value as a number, e.g. 850'); return; }
                void run(() => decideVariation(me, siteId, v, { approve: true, value: n, financeUser: fin }), 'Variation approved');
              }} />
              <Button kind="ghost" title="Decline" onPress={() => setMode('decline')} />
            </>
          )}
          {/* 800: Modify & Approve is on every open variation, so a decline can be reversed. */}
          <Button kind="ghost" title="Modify then Approve" onPress={() => setMode('modify')} />
          {v.approval_status === 'approved' && (v.schedule_section_id
            ? <Text style={{ color: base.ok, marginVertical: 6 }}>✓ In Schedule of Works</Text>
            : <Button kind="ghost" title="Add to Schedule of Works" onPress={() => void run(() => addVariationToSchedule(me, siteId, v), '')} />)}
          <Button kind="ghost" title="Close Variation" onPress={async () => {
            if (!(await confirmAsk('Close this variation?', 'Close'))) return;
            void run(() => closeVariation(me, siteId, v), 'Variation closed');
          }} />
          <Button kind="ghost" title="🗑 Delete" onPress={async () => {
            if (!(await confirmAsk('Delete this variation? This cannot be undone.', 'Delete'))) return;
            void run(() => deleteVariation(me, siteId, v), 'Variation deleted');
          }} />
        </View>
      )}
    </View>
  );
}

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 6 };
