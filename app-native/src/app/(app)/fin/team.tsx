// Finance › Team (908 renderFinTeam) — for Finance-only companies (and any Finance admin): everyone in the
// company, Finance on / off for each (giving Finance also makes them a manager; switching it off puts their
// old role back), make an admin, and an invite link to copy or email.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, Share, Text, TextInput, View } from 'react-native';

import { FinPage } from '@/components/FinNav';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { createInvite, emailInvite, joinLink, setRole, toggleFinance, useTeam } from '@/data/admin';
import { useAuth } from '@/lib/auth';
import { isFinanceUser, isManager } from '@/lib/roles';
import { base, radius } from '@/theme/theme';

const roleWord = (r: string) => (r === 'admin' ? 'Admin' : r === 'pm' ? 'Manager' : 'Member');

export default function FinTeam() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: team = [] } = useTeam(me?.org_id);
  const [invite, setInvite] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  if (!me) return null;
  const canFin = isFinanceUser(me, org) && me.role === 'admin';
  const people = team.filter((p) => p.role !== 'superadmin').slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const refresh = () => void qc.invalidateQueries({ queryKey: ['team'] });
  return (
    <FinPage title="Team" section="settings">
      <Muted style={{ marginBottom: 10 }}>Everyone in {org?.name || 'your company'}. To add someone: make an invite link, they sign up with it, then switch Finance on for them here.</Muted>
      <Card>
        {people.map((p, i) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: base.line }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: base.ink, fontSize: 15 }}>{p.name}{p.id === me.id ? <Text style={{ color: base.slate, fontWeight: '400' }}> (you)</Text> : null}</Text>
              <Muted>{[p.email, roleWord(p.role)].filter(Boolean).join(' · ')}</Muted>
            </View>
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: p.finance_enabled ? '#1E7A3C' : base.slate, backgroundColor: p.finance_enabled ? '#E6F4EA' : '#F1F2F4', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' }}>{p.finance_enabled ? 'Finance on' : 'No Finance'}</Text>
            {canFin && p.id !== me.id && <Button small kind="ghost" title={p.finance_enabled ? 'Switch off' : 'Give Finance'} onPress={async () => {
              if (!p.finance_enabled && !['pm', 'admin'].includes(p.role) && !(await confirmAsk(`Give ${p.name} Finance? This also makes them a manager. Switching Finance off later puts their old role back.`, 'Give Finance'))) return;
              toast(await toggleFinance(p, true)); refresh();
            }} />}
            {me.role === 'admin' && p.id !== me.id && p.role !== 'admin' && p.finance_enabled && <Button small kind="ghost" title="Make admin" onPress={async () => {
              if (!(await confirmAsk(`Make ${p.name} an admin? Admins can give and remove Finance for others.`, 'Make admin'))) return;
              if (!(await setRole(p.id, 'admin'))) toast('Could not save — try again.'); refresh();
            }} />}
          </View>
        ))}
      </Card>
      {isManager(me) && (
        <Card>
          <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 6 }}>Invite someone</Text>
          {invite ? (
            <>
              <Text selectable style={{ fontSize: 12, color: base.ink, backgroundColor: '#F6F7F9', borderRadius: 6, padding: 8 }}>{joinLink(invite)}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <Button small kind="ghost" title="Copy link" onPress={async () => { const link = joinLink(invite); try { if (Platform.OS === 'web' && globalThis.navigator?.clipboard) { await globalThis.navigator.clipboard.writeText(link); toast('Link copied'); } else await Share.share({ message: link }); } catch { toast('Select and copy the link.'); } }} />
                <TextInput value={email} onChangeText={setEmail} placeholder="Or email it to name@company.co.uk" autoCapitalize="none" keyboardType="email-address" style={{ flex: 1, minWidth: 220, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink }} />
                <Button small busy={busy === 'mail'} title="Send" onPress={async () => {
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast('Enter a valid email address.'); return; }
                  setBusy('mail'); const m = await emailInvite(invite, email.trim()); setBusy(''); toast(m); setEmail('');
                }} />
              </View>
            </>
          ) : <Button small busy={busy === 'make'} title="Make an invite link" onPress={async () => { setBusy('make'); const id = await createInvite(me, 'operative'); setBusy(''); if (id) setInvite(id); else toast('Could not make the link — try again.'); }} />}
        </Card>
      )}
    </FinPage>
  );
}
