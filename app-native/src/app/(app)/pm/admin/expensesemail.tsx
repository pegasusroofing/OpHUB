// Admin Centre › Company › Expenses (590 saveExpensesEmail), admins only: where receipts from the Expenses tile are
// emailed, how long the app keeps them, and (with Finance) who books them in Finance: one place (Andy, 18 Nov 2026).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { SelectBox } from '@/components/SelectBox';
import { showAlert, useToast } from '@/components/toast';
import { fdb, useFinSettings } from '@/data/finance';
import { usePeople } from '@/data/hs';
import { isFinanceUser } from '@/lib/roles';
import { Button, Card, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space, live } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export default function ExpensesEmail() {
  const { me, org, refresh } = useAuth();
  const toast = useToast();
  const { data, refetch } = useQuery({
    queryKey: ['orgExpenses', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('organizations').select('expenses_email,expenses_retention_months').eq('id', me?.org_id as string).maybeSingle()).data as { expenses_email: string | null; expenses_retention_months: number | null } | null),
  });
  const [email, setEmail] = useState('');
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState(false);
  // Once it's saved it shows as a summary with ✎ Edit (Andy, 19 Nov 2026: "close it once saved and have an edit button").
  const [editing, setEditing] = useState(false);
  const reset = () => { if (data) { setEmail(data.expenses_email || ''); setMonths(data.expenses_retention_months || 3); } };
  useEffect(() => { if (data) { setEmail(data.expenses_email || ''); setMonths(data.expenses_retention_months || 3); } }, [data]);
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  const fin = !!me.org_id && isFinanceUser(me, org);
  if (data?.expenses_email && !editing) {
    const line = (l: string, v: ReactNode) => (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
        <Text style={{ width: 230, fontWeight: '600', color: base.ink }}>{l}</Text><Text style={{ flex: 1, minWidth: 160, color: base.ink }}>{v}</Text>
      </View>
    );
    return (
      <ScrollView contentContainerStyle={page(720)}>
        <Stack.Screen options={{ title: 'Expenses' }} />
        <Card>
          <Muted style={{ marginBottom: 6 }}>Receipts sent from the Expenses tile on any job are emailed to this address.</Muted>
          {line('Send Expenses To', data.expenses_email)}
          {line('Keep Receipts In The App For', `${data.expenses_retention_months || 3} Months`)}
          {fin && line('Who Books Them In Finance', <BookerName orgId={me.org_id as string} />)}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}><Button small title="✎ Edit" onPress={() => setEditing(true)} /></View>
        </Card>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Expenses' }} />
      <Card>
        <Muted style={{ marginBottom: 10 }}>Receipts sent from the Expenses tile on any job are emailed to this address.</Muted>
        <Muted style={{ fontWeight: '600' }}>Send Expenses To</Muted>
        <TextInput value={email} onChangeText={setEmail} placeholder="e.g. info@yourcompany.co.uk" autoCapitalize="none" keyboardType="email-address" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 10 }} />
        <Muted style={{ fontWeight: '600', marginBottom: 4 }}>Keep Receipts In The App For</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {[3, 6, 9, 12].map((m) => (
            <Pressable key={m} onPress={() => setMonths(m)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: months === m ? live.brand1 : base.line, backgroundColor: months === m ? live.brand1 : base.card }}>
              <Text style={{ fontWeight: '500', color: months === m ? live.brand1Text : base.ink }}>{m} Months</Text>
            </Pressable>
          ))}
        </View>
        <Muted style={{ marginBottom: 10 }}>After this, receipts are deleted from the app automatically. Emails already sent to the office are not affected.</Muted>
        {fin && <FinanceBooker orgId={me.org_id as string} meId={me.id} />}
        {!data?.expenses_email && <Text style={{ color: base.warn, marginTop: 8 }}>Not set yet — receipts can&apos;t be sent until an address is saved.</Text>}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <Button busy={busy} title="Save" onPress={async () => {
            const v = email.trim();
            if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast('Enter a valid email address.'); return; }
            setBusy(true);
            const ok = !!(await db.from('organizations').update({ expenses_email: v || null, expenses_retention_months: months } as never).eq('id', me.org_id as string).select('id')).data?.length;
            setBusy(false);
            if (!ok) { toast('Could not save — only a Project Manager or Admin can change this.'); return; }
            setEditing(false); void refetch(); void refresh();
          }} />
          {!!data?.expenses_email && <Button kind="ghost" title="Cancel" onPress={() => { reset(); setEditing(false); }} />}
        </View>
      </Card>
    </ScrollView>
  );
}

/** The Finance person chosen to book receipts, for the summary. */
function BookerName({ orgId }: { orgId: string }) {
  const { data: st } = useFinSettings(orgId);
  const { data: people = [] } = usePeople();
  const id = String((st as { expenses_user?: string | null } | undefined)?.expenses_user || '');
  const p = (people as { id: string; name?: string | null }[]).find((x) => x.id === id);
  return <>{id ? p?.name || 'Unnamed' : 'Nobody Chosen (Any Finance User)'}</>;
}

/** Who books the receipts once they're in Finance (Andy, 18 Nov 2026: one place for expenses; it was Finance › Settings
 *  › Purchase Invoices › Expense Receipts Go To). Receipts emailed to the invoices mailbox that's forwarded into
 *  Finance are given to this Finance person; ones already waiting with nobody go to them too. Saved as you choose. */
function FinanceBooker({ orgId, meId }: { orgId: string; meId: string }) {
  const qc = useQueryClient();
  const { data: st } = useFinSettings(orgId);
  const { data: people = [] } = usePeople();
  const fin = (people as { id: string; name?: string | null; finance_enabled?: boolean | null }[]).filter((p) => p.finance_enabled).sort((x, y) => String(x.name).localeCompare(String(y.name)));
  const cur = String((st as { expenses_user?: string | null } | undefined)?.expenses_user || '');
  const choose = async (v: string) => {
    const r = await fdb.from('fin_settings').upsert({ org_id: orgId, expenses_user: v || null, updated_at: new Date().toISOString(), updated_by: meId } as never, { onConflict: 'org_id' });
    if (r.error) { showAlert('That couldn’t be saved. Try again.'); return; }
    if (v && v !== cur) {
      const wait = (((await fdb.from('fin_inbox').select('id,extracted,assigned_pm').eq('org_id', orgId).eq('status', 'new')).data as { id: string; extracted?: { receipt?: boolean } | null; assigned_pm?: string | null }[] | null) ?? []).filter((x) => x.extracted?.receipt === true && (!x.assigned_pm || x.assigned_pm === cur));
      if (wait.length) await fdb.from('fin_inbox').update({ assigned_pm: v, assigned_at: new Date().toISOString() } as never).in('id', wait.map((x) => x.id));
    }
    ['finSettings', 'finPurchases'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  };
  return (
    <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
      <SelectBox label="Who Books Them In Finance" title="Who Books Expense Receipts" value={cur as never}
        options={[['', 'Nobody Chosen (Any Finance User)'], ...fin.map((p) => [p.id, p.name || 'Unnamed'] as [string, string])]} onChange={(v) => void choose(v)} />
      <Muted style={{ marginTop: 2 }}>When the address above is your invoices mailbox (forwarded into Finance), each receipt is given to this person to book.</Muted>
    </View>
  );
}
