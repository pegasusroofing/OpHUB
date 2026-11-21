// Invite-only account creation. Ported from 150-join-invite-only-account-creation.js.
// Signed in already (company switching, 19 Nov 2026): the invite adds its company to that login instead.
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { confirmAsk } from '@/components/toast';
import { Button, Card, Field, Muted, Notice, Screen, Title } from '@/components/ui';
import { joinCompanyWithInvite, switchCompany } from '@/data/companies';
import { claimSubInvite, subInviteInfo, type SubInviteInfo } from '@/data/subcontractors';
import { getInviteInfo, useAuth } from '@/lib/auth';
import { isSwitchSite } from '@/lib/betaOnly';
import type { InviteInfo } from '@/lib/types';
import { ThemeProvider } from '@/theme/theme';

export default function Join() {
  const { invite } = useLocalSearchParams<{ invite: string }>();
  const { join, me, refresh, signOut } = useAuth();
  const qc = useQueryClient();
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // A subcontractor's link (20 Nov 2026): it says which company and job it's for.
  const [subInfo, setSubInfo] = useState<SubInviteInfo | null>(null);
  useEffect(() => { if (invite) { getInviteInfo(invite).then(setInfo); subInviteInfo(invite).then(setSubInfo); } }, [invite]);
  const forWhat = subInfo ? ` with ${subInfo.company}${subInfo.admin ? ' as its Project Manager' : ''} on ${subInfo.site}` : '';

  const go = async () => {
    if (busy || !invite) return;
    setError(null); setBusy('Creating your account…');
    if (!phone.replace(/[^0-9]/g, '').match(/^[0-9]{10,13}$/)) { setError('Enter your mobile number.'); return; }
    const r = await join(invite, name, email, password, setBusy, phone);
    setBusy(null);
    if (r.error) setError(r.error);
    else if (r.done) setDone(r.done);
  };

  // Signed in, off the beta link: home, as before the page was opened to signed-in people.
  if (me && (!isSwitchSite() || me.role === 'superadmin')) return <Redirect href={'/home' as never} />;
  if (info === undefined) return <Screen center><Muted>Checking invite…</Muted></Screen>;
  if (done) {
    return (
      <Screen center>
        <Card>
          <Title>You&apos;re all set</Title>
          <Muted style={{ marginBottom: 16 }}>{done}</Muted>
          <Button title="Go To Log In" onPress={() => router.replace('/login')} />
        </Card>
      </Screen>
    );
  }
  if (!info || !info.is_valid) {
    return (
      <Screen center>
        <Card>
          <Muted style={{ marginBottom: 12 }}>This invite link isn&apos;t valid — it may have already been used or expired. Ask your Project Manager for a new one.</Muted>
          <Button kind="ghost" title="Back To Sign In" onPress={() => router.replace('/login')} />
        </Card>
      </Screen>
    );
  }
  // Already signed in (company switching, 19 Nov 2026): add this company to the same login instead of a new account.
  if (me && isSwitchSite() && me.role !== 'superadmin') {
    return (
      <ThemeProvider org={{ ...info, id: '', name: info.org_name, plan_tier: '', has_pm: true, has_finance: false }}>
        <Screen center>
          <Card>
            <Title>Add {info.org_name}?</Title>
            <Muted style={{ marginBottom: 12 }}>You&apos;re signed in as {me.name}. Add {info.org_name}{forWhat} to your account, and switch between your companies from the top of the menu. Each company keeps its own work, and your role in it is the one it gave you.</Muted>
            {error && <Notice kind="error" text={error} />}
            <Button title={busy || `Add ${info.org_name} To My Account`} busy={!!busy} onPress={async () => {
              if (busy || !invite) return;
              setError(null); setBusy('Adding…');
              const r = await joinCompanyWithInvite(invite);
              setBusy(null);
              if (typeof r === 'string') { setError(r); return; }
              if (subInfo) await claimSubInvite(invite);
              void qc.invalidateQueries({ queryKey: ['myCompanies'] });
              if (await confirmAsk(`${r.company} is on your account. Switch to it now?`, 'Yes', 'No')) {
                const err = await switchCompany(r.orgId);
                if (err) { setError(err); return; }
                qc.clear(); await refresh();
              }
              router.replace('/home' as never);
            }} />
            <Button kind="ghost" title="Sign Out To Make A Separate Account" onPress={() => void signOut()} />
          </Card>
        </Screen>
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider org={{ ...info, id: '', name: info.org_name, plan_tier: '', has_pm: true, has_finance: false }}>
      <Screen center>
        <Card>
          <Title>Join OpHUB</Title>
          <Muted style={{ marginBottom: 12 }}>{subInfo ? `You've been invited to work${forWhat} for ${info.org_name}, on OpHUB.` : `You've been invited to join ${info.org_name} on OpHUB.`}</Muted>
          {error && <Notice kind="error" text={error} />}
          <Field label="Your Name" value={name} onChangeText={setName} placeholder="e.g. Andy Turner" autoComplete="name" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@yourcompany.co.uk" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          {/* Their mobile, saved on their account and filled in on their forms (18 Nov 2026). */}
          <Field label="Mobile Number" value={phone} onChangeText={setPhone} placeholder="e.g. 07123 456789" keyboardType="phone-pad" autoComplete="tel" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry autoComplete="new-password" />
          <Button title={busy || 'Join Team'} busy={!!busy} onPress={go} />
        </Card>
      </Screen>
    </ThemeProvider>
  );
}
