// Admin Centre › Expenses Email (590 saveExpensesEmail), admins only: where
// receipts from the Expenses tile are emailed, and how long the app keeps them.
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export default function ExpensesEmail() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const { data, refetch } = useQuery({
    queryKey: ['orgExpenses', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('organizations').select('expenses_email,expenses_retention_months').eq('id', me?.org_id as string).maybeSingle()).data as { expenses_email: string | null; expenses_retention_months: number | null } | null),
  });
  const [email, setEmail] = useState('');
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setEmail(data.expenses_email || ''); setMonths(data.expenses_retention_months || 3); } }, [data]);
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Expenses Email' }} />
      <Card>
        <Muted style={{ marginBottom: 10 }}>Receipts sent from the Expenses tile on any job are emailed to this address.</Muted>
        <Muted style={{ fontWeight: '700' }}>Send expenses to</Muted>
        <TextInput value={email} onChangeText={setEmail} placeholder="e.g. info@yourcompany.co.uk" autoCapitalize="none" keyboardType="email-address" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 10 }} />
        <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Keep receipts in the app for</Muted>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
          {[3, 6, 9, 12].map((m) => (
            <Pressable key={m} onPress={() => setMonths(m)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: months === m ? base.ink : base.line, backgroundColor: months === m ? base.ink : base.card }}>
              <Text style={{ fontWeight: '700', color: months === m ? '#fff' : base.ink }}>{m} months</Text>
            </Pressable>
          ))}
        </View>
        <Muted style={{ marginBottom: 10 }}>After this, receipts are deleted from the app automatically. Emails already sent to the office are not affected.</Muted>
        <Button busy={busy} title="Save" onPress={async () => {
          const v = email.trim();
          if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast('Enter a valid email address.'); return; }
          setBusy(true);
          const ok = !!(await db.from('organizations').update({ expenses_email: v || null, expenses_retention_months: months } as never).eq('id', me.org_id as string).select('id')).data?.length;
          setBusy(false);
          toast(ok ? (v ? 'Expenses settings saved' : 'Saved — no expenses email set') : 'Could not save — only a Project Manager or Admin can change this.');
          if (ok) { void refetch(); void refresh(); }
        }} />
        {data?.expenses_email ? <Text style={{ color: base.ok, marginTop: 8 }}>✓ Currently going to {data.expenses_email}</Text> : <Text style={{ color: base.warn, marginTop: 8 }}>Not set yet — receipts can&apos;t be sent until an address is saved.</Text>}
      </Card>
    </ScrollView>
  );
}
