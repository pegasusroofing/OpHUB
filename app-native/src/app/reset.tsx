// Choose a new password, from the emailed link (?t=<token hash>&e=<email>). Ported from 140-login.js.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Field, Link, Muted, Notice, Screen, Title } from '@/components/ui';
import { resetPassword, useAuth } from '@/lib/auth';

export default function Reset() {
  const { t, e } = useLocalSearchParams<{ t?: string; e?: string }>();
  const { me, signOut, setNotice } = useAuth();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!t) return;
    setBusy(true); setError(null);
    const r = await resetPassword(t, pw1, pw2);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    const email = (e || r.email || '').toLowerCase();
    if (me && email && me.email.toLowerCase() === email) await signOut();
    setNotice({ kind: 'info', text: 'Password changed — log in with your new password.' });
    router.replace('/login');
  };

  return (
    <Screen center>
      <Card>
        <Title>Choose a new password</Title>
        {!!e && <Muted style={{ marginBottom: 12 }}>For {e}</Muted>}
        {error && <Notice kind="error" text={error} />}
        {!t ? (
          <Muted>This link isn't complete. Go back to the log in page and tap "Forgot password?" again.</Muted>
        ) : (
          <>
            <Field label="New password" value={pw1} onChangeText={setPw1} secureTextEntry placeholder="At least 8 characters" autoComplete="new-password" />
            <Field label="Type it again" value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" />
            <Button title={busy ? 'Saving…' : 'Save new password'} busy={busy} onPress={save} />
          </>
        )}
        <Link title="Back to log in" onPress={() => router.replace(me ? '/' : '/login')} />
      </Card>
    </Screen>
  );
}
