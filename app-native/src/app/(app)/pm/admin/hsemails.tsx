// Admin Centre › H&S › H&S Emails, company admins only (19 Nov 2026). Since 15 Nov the report, COSHH, HAVS, PUWER and
// incident emails copy in the sender's own company's office address (organizations.report_cc_email) instead of one
// fixed address for every company; this is where an admin sets, changes or clears it. Blank = no office copy.
// The database keeps the old address if anyone but an admin saves (trigger guard_org_report_cc), so only admins see it.
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Field, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { officeCopyEmail } from '@/lib/rules/hs';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export default function HsEmails() {
  const { me, org, refresh } = useAuth();
  const toast = useToast();
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // A bad address is said under the box and goes as soon as it's changed (a pop-up note would outstay a quick fix).
  const [bad, setBad] = useState(false);
  if (!me || !org) return null;
  if (me.role !== 'admin') return <><Stack.Screen options={{ title: 'H&S Emails' }} /><Muted style={{ padding: space.l }}>Company admins only.</Muted></>;
  const now = org.report_cc_email || '';
  const email = typed ?? now;
  const save = async () => {
    const v = officeCopyEmail(email);
    if (v === 'bad') { setBad(true); return; }
    setBusy(true);
    const r = await db.from('organizations').update({ report_cc_email: v } as never).eq('id', org.id).select('report_cc_email');
    setBusy(false);
    const row = (r.data as { report_cc_email: string | null }[] | null)?.[0];
    if (r.error || !row) { toast('Could not save — try again.'); return; }
    if ((row.report_cc_email || null) !== v) { toast('Could not change it — only a company admin can.'); return; }
    await refresh();
    // Tabs, no list to step back to: it stays here and the button says Saved until something changes (as Toolbox Talks Required).
    setTyped(null);
    setSaved(true);
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'H&S Emails' }} />
      <Card>
        <Muted style={{ marginBottom: 12 }}>When anyone at {org.name} emails a report, COSHH assessment, HAVS record, PUWER check or incident report from the app, a copy also goes to this address. Leave it blank for no office copy.</Muted>
        <Field label="Copy Health & Safety Emails To" value={email} onChangeText={(t) => { setTyped(t); setSaved(false); setBad(false); }}
          placeholder="e.g. office@yourcompany.co.uk" autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
          accessibilityLabel="Copy health and safety emails to" onSubmitEditing={() => void save()} />
        {bad && <Text style={{ color: base.red, marginTop: -4, marginBottom: 10 }}>Enter a valid email address, or leave it blank for no office copy.</Text>}
        {now
          ? <Text style={{ color: base.ok, marginBottom: 12 }}>✓ Copies go to {now}</Text>
          : <Text style={{ color: base.warn, marginBottom: 12 }}>No office copy at the moment.</Text>}
        <View><Button busy={busy} disabled={saved} title={saved ? 'Saved' : 'Save'} onPress={save} /></View>
      </Card>
    </ScrollView>
  );
}
