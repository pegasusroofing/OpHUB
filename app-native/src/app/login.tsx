// Sign-in page. Ported from 140-login.js.
import { useEffect, useState } from 'react';
import { Image, Platform, Text } from 'react-native';

import { Button, Card, Check, Field, Link, Muted, Notice, Screen } from '@/components/ui';
import { sendPasswordReset, useAuth } from '@/lib/auth';
import { loadRemembered } from '@/lib/remember';

export default function Login() {
  const { signIn, notice, setNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    loadRemembered().then((r) => {
      if (!r.remember) return;
      setRemember(true);
      setEmail((e) => e || r.email);
      setPassword((p) => p || r.password);
    });
  }, []);

  const go = async () => {
    if (busy) return;
    setBusy('Signing in…');
    const err = await signIn(email, password, remember, setBusy);
    setBusy(null);
    if (err) setNotice({ kind: 'error', text: err });
  };

  const sendReset = async () => {
    const err = await sendPasswordReset(email);
    if (err) { setNotice({ kind: 'error', text: err }); return; }
    setForgot(false);
    setNotice({ kind: 'info', text: `If ${email.trim().toLowerCase()} has an account, a reset link is on its way. Check your email (and junk folder).` });
  };

  return (
    <Screen center>
      <Text style={{ fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 16, color: '#1E2124' }}>OpHUB</Text>
      <Card>
        {notice && <Notice kind={notice.kind} text={notice.text} />}
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@yourcompany.co.uk"
          autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
        {!forgot && (
          <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry
            autoComplete="current-password" textContentType="password" onSubmitEditing={go} returnKeyType="go" />
        )}
        {forgot ? (
          <>
            <Muted style={{ marginBottom: 8 }}>Enter the email you log in with and we'll send you a link to choose a new password.</Muted>
            <Button title="Send reset link" onPress={sendReset} />
            <Link title="Back to log in" onPress={() => setForgot(false)} />
          </>
        ) : (
          <>
            <Check label="Remember my email and password on this device" value={remember} onChange={setRemember} />
            <Button title={busy || 'Sign In'} busy={!!busy} onPress={go} />
            <Link title="Forgot password?" onPress={() => { setNotice(null); setForgot(true); }} />
          </>
        )}
        <Muted style={{ marginTop: 10 }}>
          Ticking "Remember" keeps your email and password on this {Platform.OS === 'web' ? 'computer (the password is stored encrypted)' : 'phone, locked in its secure storage'} so they're filled in next time. Untick it on a shared device. You stay signed in until you tap Sign out.
        </Muted>
        <Muted style={{ marginTop: 10 }}>
          New team member? You'll need an invite link from your Project Manager to create an account — sign-up isn't open to the public.
        </Muted>
      </Card>
      <Image source={require('../../assets/images/icon.png')} style={{ width: 120, height: 120, borderRadius: 24, alignSelf: 'center', marginTop: 16 }} />
    </Screen>
  );
}
