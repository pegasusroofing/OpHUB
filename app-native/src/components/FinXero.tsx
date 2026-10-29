// Xero (907): the settings when connected — account codes, the project tracking category, send
// automatically, check for payments, disconnect — and the line on an invoice / bill / sub payment showing
// whether it's in Xero, with Post to Xero and the last error. While Finance is on trial nothing is posted
// (finInvoke says so); the settings themselves can still be set.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Check, Muted } from '@/components/ui';
import { fdb, finInvoke } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { fdate } from '@/lib/rules/finance';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 8, paddingVertical: 7, color: base.ink, backgroundColor: base.card };
const KIND: Record<string, string> = { invoice: 'push_invoice', bill: 'push_bill', sub: 'push_sub_payment' };
const TABLE: Record<string, string> = { invoice: 'fin_invoices', bill: 'purchase_invoices', sub: 'fin_sub_payments' };

/** Whether Xero is connected (shared with the Settings page). */
export function useXeroStatus() {
  const { me } = useAuth();
  return useQuery({ queryKey: ['finXeroStatus', me?.org_id], enabled: !!me, queryFn: async () => (me ? finInvoke<Row>(me, 'xero', { action: 'status' }) : null) });
}

export function XeroSettings({ s }: { s: Row }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState({ sales: String(s.xero_sales_account || '200'), purch: String(s.xero_purchase_account || '310'), labour: String(s.xero_labour_account || '320'), track: String(s.xero_tracking_name || 'Project'), auto: !!s.xero_auto });
  const [busy, setBusy] = useState('');
  if (!me) return null;
  const f = (k: keyof typeof v, label: string) => (
    <View style={{ flexBasis: '47%', flexGrow: 1, marginBottom: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate, marginBottom: 4 }}>{label}</Text>
      <TextInput value={String(v[k])} onChangeText={(t) => setV({ ...v, [k]: t })} style={box} />
    </View>
  );
  return (
    <View style={{ marginTop: 10 }}>
      {s.xero_connected_at && <Muted>Since {fdate(String(s.xero_connected_at).slice(0, 10))}</Muted>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, marginTop: 6 }}>
        {f('sales', 'Sales account (invoices)')}{f('purch', 'Materials account (bills)')}{f('labour', 'Subcontract labour account')}{f('track', 'Xero tracking category')}
      </View>
      <Muted style={{ fontSize: 12, marginBottom: 6 }}>Account codes are the numbers in your Xero chart of accounts. Projects go into Xero under the tracking category (default “Project”) — create it once in Xero.</Muted>
      <Check label="Send to Xero automatically — invoices when issued, purchase invoices when approved" value={v.auto} onChange={(x) => setV({ ...v, auto: x })} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        <Button small busy={busy === 'save'} title="Save Xero settings" onPress={async () => {
          setBusy('save');
          const r = await fdb.from('fin_settings').upsert({ org_id: me.org_id, xero_sales_account: v.sales.trim() || '200', xero_purchase_account: v.purch.trim() || '310', xero_labour_account: v.labour.trim() || '320', xero_tracking_name: v.track.trim() || 'Project', xero_auto: v.auto, updated_at: new Date().toISOString(), updated_by: me.id } as never, { onConflict: 'org_id' });
          setBusy(''); if (r.error) toast('Could not save the Xero settings.'); else void qc.invalidateQueries({ queryKey: ['finSettings'] });
        }} />
        <Button small kind="ghost" busy={busy === 'pay'} title="Check Xero for payments" onPress={async () => {
          setBusy('pay'); const r = await finInvoke<Row>(me, 'xero', { action: 'pull_payments' }); setBusy('');
          toast(r.error ? `Xero: ${r.error}` : r.data?.updated ? `${r.data.updated} payment${r.data.updated === 1 ? '' : 's'} brought in from Xero` : 'No new payments in Xero');
        }} />
        <Button small kind="ghost" busy={busy === 'off'} title="Disconnect" onPress={async () => {
          if (!(await confirmAsk('Disconnect Xero? Nothing already posted is changed; you can connect again any time.', 'Disconnect'))) return;
          setBusy('off'); const r = await finInvoke<Row>(me, 'xero', { action: 'disconnect' }); setBusy('');
          if (r.error) toast(`Xero: ${r.error}`); else void qc.invalidateQueries({ queryKey: ['finXeroStatus'] });
        }} />
      </View>
    </View>
  );
}

/** "✓ Posted to Xero" / "Not posted to Xero yet" + Post to Xero + the last error (907 finXeroRowHtml). */
export function XeroRow({ kind, rec, onDone }: { kind: 'invoice' | 'bill' | 'sub'; rec: Row; onDone?: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const { data: st } = useXeroStatus();
  const [busy, setBusy] = useState(false);
  if (!me || !st?.data?.connected || !rec) return null;
  const can = kind === 'invoice' ? rec.status !== 'draft' && rec.status !== 'void' : kind === 'bill' ? rec.status === 'approved' : ['approved', 'paid'].includes(rec.status);
  if (!can && !rec.xero_id) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginVertical: 6 }}>
      <Text style={{ color: rec.xero_id ? '#1E7A3C' : base.slate, fontWeight: '700' }}>{rec.xero_id ? `✓ Posted to Xero${rec.xero_synced_at ? ` · ${fdate(String(rec.xero_synced_at).slice(0, 10))}` : ''}` : rec.xero_post === false ? 'Set not to post to Xero' : 'Not posted to Xero yet'}</Text>
      {can && !rec.xero_id && <Button small kind="ghost" busy={busy} title="Post to Xero" onPress={async () => {
        setBusy(true);
        const r = await finInvoke<Row>(me, 'xero', { action: KIND[kind], id: rec.id });
        if (!r.error) await fdb.from(TABLE[kind]).update({ xero_post: true } as never).eq('id', rec.id);
        setBusy(false);
        toast(r.error ? `Xero: ${r.error}` : r.data?.warning ? `Posted to Xero — ${r.data.warning}` : 'Posted to Xero'); onDone?.();
      }} />}
      {!!rec.xero_error && <Text style={{ width: '100%', color: '#C0392B', fontSize: 12.5 }}>Last try: {rec.xero_error}</Text>}
    </View>
  );
}
