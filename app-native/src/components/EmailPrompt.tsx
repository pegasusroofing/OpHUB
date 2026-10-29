// "Email this to:" with "CC me a copy" and, when the job has a client email, "CC the client"
// (110 customPromptWithCc / resolvePromptEmailTo). CC me with nobody typed means just send it to me.
// Resolves the recipients, or null if cancelled. EmailPromptHost sits in the app shell.
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { Check } from '@/components/ui';
import { base } from '@/theme/theme';

export type EmailTo = { to: string; cc?: string; clientCc?: string };
type Req = { message: string; myEmail: string | null; clientEmail: string | null; resolve: (v: EmailTo | null) => void };
const listeners = new Set<(r: Req) => void>();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function promptEmail(message: string, o: { myEmail?: string | null; clientEmail?: string | null } = {}): Promise<EmailTo | null> {
  return new Promise((resolve) => { listeners.forEach((l) => l({ message, myEmail: o.myEmail || null, clientEmail: o.clientEmail || null, resolve })); });
}

export function EmailPromptHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [to, setTo] = useState('');
  const [ccMe, setCcMe] = useState(false), [ccClient, setCcClient] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const l = (r: Req) => { setTo(''); setCcMe(false); setCcClient(false); setErr(''); setReq(r); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (!req) return null;
  const done = (v: EmailTo | null) => { req.resolve(v); setReq(null); };
  const send = () => {
    const typed = to.trim();
    if (typed && !EMAIL.test(typed)) { setErr('Enter a valid email address.'); return; }
    const clientCc = ccClient && req.clientEmail ? req.clientEmail : undefined;
    if (typed) done({ to: typed, cc: ccMe && req.myEmail && req.myEmail !== typed ? req.myEmail : undefined, clientCc });
    else if (ccMe && req.myEmail) done({ to: req.myEmail, clientCc });
    else setErr('Enter who to send it to (or tick CC me).');
  };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => done(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, width: '100%', maxWidth: 460, alignSelf: 'center' }}>
          <Text style={{ fontWeight: '700', marginBottom: 8, color: base.ink }}>{req.message}</Text>
          <TextInput value={to} onChangeText={(v) => { setTo(v); setErr(''); }} autoFocus autoCapitalize="none" keyboardType="email-address" placeholder="name@company.co.uk" style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, padding: 10, marginBottom: 8 }} />
          {!!req.myEmail && <Check label={`CC me a copy (${req.myEmail})`} value={ccMe} onChange={setCcMe} />}
          {!!req.clientEmail && <Check label={`CC the client (${req.clientEmail})`} value={ccClient} onChange={setCcClient} />}
          {!!err && <Text style={{ color: '#C0392B', marginTop: 4 }}>{err}</Text>}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 12 }}>
            <Pressable onPress={() => done(null)}><Text style={{ fontWeight: '700' }}>Cancel</Text></Pressable>
            <Pressable onPress={send}><Text style={{ fontWeight: '700', color: base.blue }}>Send</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
