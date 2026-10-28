// Invite-only account creation. Ported from 150-join-invite-only-account-creation.js.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, Card, Field, Muted, Notice, Screen, Title } from '@/components/ui';
import { getInviteInfo, useAuth } from '@/lib/auth';
import type { InviteInfo } from '@/lib/types';
import { ThemeProvider } from '@/theme/theme';

export default function Join() {
  const { invite } = useLocalSearchParams<{ invite: string }>();
  const { join } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => { if (invite) getInviteInfo(invite).then(setInfo); }, [invite]);

  const go = async () => {
    if (busy || !invite) return;
    setError(null); setBusy('Creating your account…');
    const r = await join(invite, name, email, password, setBusy);
    setBusy(null);
    if (r.error) setError(r.error);
    else if (r.done) setDone(r.done);
  };

  if (info === undefined) return <Screen center><Muted>Checking invite…</Muted></Screen>;
  if (done) {
    return (
      <Screen center>
        <Card>
          <Title>You're all set</Title>
          <Muted style={{ marginBottom: 16 }}>{done}</Muted>
          <Button title="Go to log in" onPress={() => router.replace('/login')} />
        </Card>
      </Screen>
    );
  }
  if (!info || !info.is_valid) {
    return (
      <Screen center>
        <Card>
          <Muted style={{ marginBottom: 12 }}>This invite link isn't valid — it may have already been used or expired. Ask your Project Manager for a new one.</Muted>
          <Button kind="ghost" title="Back to Sign In" onPress={() => router.replace('/login')} />
        </Card>
      </Screen>
    );
  }
  return (
    <ThemeProvider org={{ ...info, id: '', name: info.org_name, plan_tier: '', has_pm: true, has_finance: false }}>
      <Screen center>
        <Card>
          <Title>Join OpHUB</Title>
          <Muted style={{ marginBottom: 12 }}>You've been invited to join {info.org_name} on OpHUB.</Muted>
          {error && <Notice kind="error" text={error} />}
          <Field label="Your name" value={name} onChangeText={setName} placeholder="e.g. Andy Turner" autoComplete="name" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@yourcompany.co.uk" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry autoComplete="new-password" />
          <Button title={busy || 'Join Team'} busy={!!busy} onPress={go} />
        </Card>
      </Screen>
    </ThemeProvider>
  );
}
