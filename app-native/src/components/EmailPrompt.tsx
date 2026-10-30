// "Email this to:" with "CC me a copy" and, when the job has a client email, "CC the client"
// (110 customPromptWithCc / resolvePromptEmailTo). CC me with nobody typed means just send it to me.
// Resolves the recipients, or null if cancelled. EmailPromptHost sits in the app shell.
// With `pick`, colleagues are listed to tick (500 openScheduleEmailPrompt) and `to` comes back
// as a comma-separated list of everyone ticked plus anyone typed.
import { useEffect, useState } from 'react';
import { Text, TextInput } from 'react-native';

import { Popup, PopupButtons } from '@/components/Popup';

import { Check } from '@/components/ui';
import { base } from '@/theme/theme';

export type EmailTo = { to: string; cc?: string; clientCc?: string };
export type Pick = { name: string; email: string };
type Req = { message: string; myEmail: string | null; clientEmail: string | null; pick?: Pick[]; ticked?: string[]; resolve: (v: EmailTo | null) => void };
const listeners = new Set<(r: Req) => void>();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function promptEmail(message: string, o: { myEmail?: string | null; clientEmail?: string | null; pick?: Pick[]; ticked?: string[] } = {}): Promise<EmailTo | null> {
  return new Promise((resolve) => { listeners.forEach((l) => l({ message, myEmail: o.myEmail || null, clientEmail: o.clientEmail || null, pick: o.pick, ticked: o.ticked, resolve })); });
}

export function EmailPromptHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [to, setTo] = useState('');
  const [ccMe, setCcMe] = useState(false), [ccClient, setCcClient] = useState(false);
  const [err, setErr] = useState('');
  const [ticks, setTicks] = useState<string[]>([]);
  useEffect(() => {
    const l = (r: Req) => { setTo(''); setCcMe(false); setCcClient(false); setErr(''); setTicks(r.ticked ?? []); setReq(r); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (!req) return null;
  const done = (v: EmailTo | null) => { req.resolve(v); setReq(null); };
  const send = () => {
    const typed = to.trim();
    if (typed && !EMAIL.test(typed)) { setErr('Enter a valid email address.'); return; }
    const clientCc = ccClient && req.clientEmail ? req.clientEmail : undefined;
    if (req.pick) {
      const all = [...new Set([...ticks, ...(typed ? [typed] : [])])];
      if (!all.length) { setErr('Tick or enter at least one recipient.'); return; }
      done({ to: all.join(','), clientCc }); return;
    }
    if (typed) done({ to: typed, cc: ccMe && req.myEmail && req.myEmail !== typed ? req.myEmail : undefined, clientCc });
    else if (ccMe && req.myEmail) done({ to: req.myEmail, clientCc });
    else setErr('Enter who to send it to (or tick CC me).');
  };
  return (
    <Popup title={req.message} onClose={() => done(null)} width={460} footer={<PopupButtons yes="Send" onYes={send} />}>
      {!!req.pick && (req.pick.length ? req.pick.map((p) => (
        <Check key={p.email} label={`${p.name} (${p.email})`} value={ticks.includes(p.email)} onChange={(v) => { setErr(''); setTicks(v ? [...ticks, p.email] : ticks.filter((x) => x !== p.email)); }} />
      )) : <Text style={{ color: base.slate, marginBottom: 6 }}>No other PMs / admins found.</Text>)}
      {!!req.pick && <Text style={{ color: base.slate, fontSize: 12, marginTop: 6, marginBottom: 4 }}>Add another address</Text>}
      <TextInput value={to} onChangeText={(v) => { setTo(v); setErr(''); }} autoFocus={!req.pick} autoCapitalize="none" keyboardType="email-address" placeholder="name@company.co.uk" placeholderTextColor="#9AA1AB" style={{ borderWidth: 1, borderColor: '#D5D9DF', borderRadius: 10, padding: 10, fontSize: 15, marginBottom: 8, color: base.ink }} />
      {!!req.myEmail && !req.pick && <Check label={`CC me a copy (${req.myEmail})`} value={ccMe} onChange={setCcMe} />}
      {!!req.clientEmail && <Check label={`CC the client (${req.clientEmail})`} value={ccClient} onChange={setCcClient} />}
      {!!err && <Text style={{ color: '#C0392B', marginTop: 4 }}>{err}</Text>}
    </Popup>
  );
}
