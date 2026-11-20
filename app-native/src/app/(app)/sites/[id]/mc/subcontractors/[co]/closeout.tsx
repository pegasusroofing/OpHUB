// A subcontractor's Close-Out (Andy, 20 Nov 2026: "ok i like the close out, our pm/site manager sign off / retention
// release might not always be relevant so all it to be an invoice only style job or application style for the
// subcontractor / no once the job is closed their access is closed"). The checks fill themselves in from the job; how
// they're paid is Invoice Only or Applications (with retention, half at practical completion and half at the end of
// defects); our PM or site manager signs it off and the certificate is filed with the job and in OneDrive. Their project
// manager sees it. Closing out doesn't change anyone's access: that ends when the job closes.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { viewDoc } from '@/components/DocViewer';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, FilterRow, Muted, SectionTitle } from '@/components/ui';
import { linkFinSub, saveCloseout, signCloseout, useCloseout, type Closeout } from '@/data/closeout';
import { openDocLink } from '@/data/hs';
import { useSite } from '@/data/sites';
import { useSubco } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { defectsEndFrom, money, retentionSplit } from '@/lib/rules/closeout';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 } as const;
const uk = (v: string | null | undefined) => (v ? new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function SubcoCloseout() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: sub } = useSubco(co, me);
  const { data, isLoading } = useCloseout(id, co);
  const [busy, setBusy] = useState('');
  const [val, setVal] = useState<string | null>(null);
  const [pct, setPct] = useState<string | null>(null);
  if (!me || !site || !sub) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  if (!mgr && !sub.isAdmin) return <Muted style={{ padding: space.l }}>Only the main contractor&apos;s managers and the company&apos;s Project Manager can see the close-out.</Muted>;
  const c = data.row;
  const signed = !!c?.signed_at;
  const edit = mgr && !signed;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['closeout', co] }); void qc.invalidateQueries({ queryKey: ['subco', co] }); };
  const save = async (patch: Partial<Closeout>) => { if (await saveCloseout(site, co, c, patch)) refresh(); else toast('Could not save — try again.'); };
  const outstanding = data.checks.filter((x) => !x.ok);
  const billing = c?.billing_type ?? null;
  const split = retentionSplit(c?.order_value, c?.retention_pct);
  const linked = data.finSubs.find((f) => f.id === c?.fin_subcontract_id) ?? null;
  const goCheck = (k: string) => router.push(`/sites/${id}/mc/subcontractors/${co}/${k === 'sow' ? 'schedule' : k === 'om' ? 'om' : k === 'rams' ? 'docs?kind=rams' : k === 'snags' ? 'snags' : ''}` as never);

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${sub.company.name} — Close-Out` }} />
      <Card>
        <SectionTitle>Before Close-Out</SectionTitle>
        {data.checks.map((x, i) => (
          <View key={x.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
            <Text style={{ width: 18, textAlign: 'center', fontWeight: '800', color: x.ok ? base.ok : base.warn }}>{x.ok ? '✓' : '!'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: base.ink, fontWeight: '600' }}>{x.label}</Text>
              <Muted>{x.sub}</Muted>
            </View>
            {x.key === 'final' ? (edit ? <View style={{ width: 120 }}><FilterRow seg options={[['yes', 'Yes'], ['no', 'No']]} value={c?.final_account_agreed ? 'yes' : 'no'} onChange={(v) => void save({ final_account_agreed: v === 'yes' })} /></View> : null)
              : !x.ok && x.key !== 'permits' ? <Pressable onPress={() => goCheck(x.key)} accessibilityRole="link"><Text style={{ color: base.blue, fontWeight: '600' }}>Open ›</Text></Pressable> : null}
          </View>
        ))}
      </Card>

      <Card>
        <SectionTitle>How They&apos;re Paid</SectionTitle>
        {edit ? <FilterRow seg options={[['invoice', 'Invoice Only'], ['application', 'Applications']]} value={billing || ''} onChange={(v) => void save({ billing_type: v as 'invoice' | 'application', ...(v === 'application' && c?.retention_pct == null ? { retention_pct: 5 } : {}) })} />
          : <Text style={{ color: base.ink, fontWeight: '600' }}>{billing === 'invoice' ? 'Invoice Only' : billing === 'application' ? 'Applications' : 'Not set'}</Text>}
        {!billing && <Muted style={{ marginTop: 6 }}>Invoice Only: paid on their invoices, no retention. Applications: paid on valuations, with retention held and released at the end.</Muted>}
        {billing === 'invoice' && <Muted style={{ marginTop: 6 }}>Paid on invoice: no retention to release.</Muted>}
        {billing === 'application' && (
          <View style={{ marginTop: 10 }}>
            {data.finSubs.length > 0 && (
              <Pressable disabled={!edit} accessibilityRole="button" onPress={async () => {
                const k = await chooseAction('Finance Subcontract', [{ key: '-', label: 'None — type the figures here' }, ...data.finSubs.map((f) => ({ key: f.id, label: `${f.number || ''} ${f.name || 'Subcontract'} · ${f.order_value ? money(Number(f.order_value)) : 'no order value'}`.trim() }))]);
                if (!k) return;
                if (await linkFinSub(site, co, c, k === '-' ? null : data.finSubs.find((f) => f.id === k) ?? null)) refresh(); else toast('Could not save — try again.');
              }} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, marginBottom: 8 }}>
                <Text style={{ color: base.ink }}>Finance Subcontract: {linked ? `${linked.number || ''} ${linked.name || ''}`.trim() : 'Not linked'}{edit ? ' ▾' : ''}</Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Muted style={{ fontWeight: '600', marginBottom: 3 }}>Order Value (£)</Muted>
                <TextInput editable={edit} value={val ?? (c?.order_value != null ? String(c.order_value) : '')} onChangeText={setVal} onBlur={() => { if (val !== null) { void save({ order_value: val.trim() ? Number(val.replace(/[^\d.]/g, '')) : null }); setVal(null); } }} keyboardType="numeric" placeholder="0.00" placeholderTextColor={base.slateLight} style={box} />
              </View>
              <View style={{ width: 110 }}>
                <Muted style={{ fontWeight: '600', marginBottom: 3 }}>Retention %</Muted>
                <TextInput editable={edit} value={pct ?? (c?.retention_pct != null ? String(c.retention_pct) : '')} onChangeText={setPct} onBlur={() => { if (pct !== null) { void save({ retention_pct: pct.trim() ? Number(pct.replace(/[^\d.]/g, '')) : null }); setPct(null); } }} keyboardType="numeric" placeholder="5" placeholderTextColor={base.slateLight} style={box} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Muted style={{ fontWeight: '600', marginBottom: 3 }}>Practical Completion</Muted>
                <DateBox disabled={!edit} value={c?.pc_date || ''} onChange={(v) => void save({ pc_date: v || null, ...(v && !c?.defects_end ? { defects_end: defectsEndFrom(v) } : {}) })} title="Practical completion" style={{ marginBottom: 8 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Muted style={{ fontWeight: '600', marginBottom: 3 }}>End Of Defects</Muted>
                <DateBox disabled={!edit} value={c?.defects_end || ''} onChange={(v) => void save({ defects_end: v || null })} title="End of defects" style={{ marginBottom: 8 }} />
              </View>
            </View>
            {split ? (
              <View style={{ backgroundColor: '#F6F7F9', borderRadius: radius.input, padding: 10 }}>
                <Text style={{ color: base.ink, fontWeight: '600' }}>Retention Held ({c?.retention_pct}%): {money(split.held)}</Text>
                <Muted>First half {money(split.half)} at practical completion{c?.pc_date ? `, ${uk(c.pc_date)}` : ''}</Muted>
                <Muted>Second half {money(split.half)} at the end of defects{c?.defects_end ? `, ${uk(c.defects_end)}` : ''}</Muted>
              </View>
            ) : <Muted>Add the order value and retention % to see what&apos;s held and when it&apos;s due back.</Muted>}
          </View>
        )}
      </Card>

      <Card>
        <SectionTitle>Sign-Off</SectionTitle>
        {signed ? (
          <>
            <Text style={{ color: base.ok, fontWeight: '700', marginBottom: 4 }}>✓ Signed Off {uk(c?.signed_at)} · Works Complete And Accepted</Text>
            {!!c?.override_reason && <Muted style={{ marginBottom: 6 }}>Closed out with checks outstanding: {c.override_reason}</Muted>}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 }}>
              {!!c?.certificate_path && <Button small title="👁 View Certificate" onPress={async () => { const u = await openDocLink('mc-documents', c.certificate_path as string); if (u) viewDoc(u); else toast('Could not open the certificate.'); }} />}
              {mgr && <Button small kind="ghost" title="Undo Sign-Off" onPress={async () => { if (await confirmAsk('Undo the sign-off? The certificate stays filed; you can sign it off again.', 'Yes', 'No')) await save({ signed_at: null, signed_by: null }); }} />}
            </View>
          </>
        ) : mgr ? (
          <>
            <Muted style={{ marginBottom: 8 }}>Our Project Manager or Site Manager signs to say the works are complete and accepted. It makes the Close-Out Certificate, filed here and in the job&apos;s OneDrive Handover folder.{outstanding.length ? ` ${outstanding.length} check${outstanding.length === 1 ? ' is' : 's are'} still outstanding.` : ''}</Muted>
            {!(me as { signature_path?: string | null }).signature_path ? (
              <Button title="Adopt Your Signature" onPress={() => router.push('/signature')} />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Button busy={busy === 'sign'} title="✍ Sign Off As Complete" onPress={async () => {
                  let reason: string | null = null;
                  if (outstanding.length) {
                    if (!(await confirmAsk(`Still outstanding: ${outstanding.map((x) => x.label).join(', ')}.\n\nClose out anyway?`, 'Yes', 'No'))) return;
                    reason = await promptText('Why is it being closed out anyway?', '');
                    if (reason === null) return;
                    if (!reason.trim()) { showAlert('Say briefly why, so it shows on the certificate.'); return; }
                  }
                  setBusy('sign');
                  const err = await signCloseout(me, org, site, co, sub.company.name, c, data.checks, reason ? reason.trim() : null);
                  setBusy('');
                  if (err) { showAlert(err); return; }
                  refresh();
                }} />
              </View>
            )}
          </>
        ) : <Muted>Waiting for the main contractor&apos;s Project Manager to sign it off.</Muted>}
      </Card>
      <Muted style={{ textAlign: 'center', marginBottom: 20 }}>Closing out doesn&apos;t change who can see the job: their access ends when the job is closed.</Muted>
    </ScrollView>
  );
}
