// "Send to client to sign" lines under a job RAMS (580 ramsClientLineHtml /
// sendRamsToClient): one line per client the document has signature boxes for
// (at least Client 1), showing signed / waiting / link expired, and sending the
// client a private link (client-sign function) — no app needed on their side.
// One pop-up asks for the client's name, with their email under it; both are needed (Andy, 14 Nov 2026: it was two pop-ups).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Popup, PopupButtons } from '@/components/Popup';
import { useToast } from '@/components/toast';
import { layoutClients, type SignLayout } from '@/lib/signedPdf';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15, color: base.ink, backgroundColor: '#fff', marginBottom: 10 };
const label = { fontSize: 13, fontWeight: '600' as const, color: base.slate, marginBottom: 4 };

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Req = { id: string; client_slot: number | null; client_name: string | null; client_email: string; requested_at: string; expires_at: string; signed_at: string | null; signer_name: string | null };
const dm = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

export function ClientSignLines({ ramsId, site }: { ramsId: string; site: Site }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  // The send pop-up: which client, and what's been typed.
  const [ask, setAsk] = useState<{ slot: number; name: string; email: string; err: string; nerr?: string } | null>(null);
  const { data } = useQuery({
    queryKey: ['ramsClientSigs', ramsId],
    queryFn: async () => {
      const [c, d] = await Promise.all([
        db.from('rams_client_signatures').select('id,client_slot,client_name,client_email,requested_at,expires_at,signed_at,signer_name').eq('rams_id', ramsId).order('requested_at'),
        db.from('rams_docs').select('sign_layout').eq('id', ramsId).maybeSingle(),
      ]);
      const bySlot: Record<number, Req> = {};
      ((c.data as Req[] | null) ?? []).forEach((r) => { const s = r.client_slot || 1, cur = bySlot[s]; if (!cur || r.signed_at || !cur.signed_at) bySlot[s] = r; });
      return { now: Date.now(), bySlot, layout: ((d.data as { sign_layout: SignLayout } | null)?.sign_layout ?? null) };
    },
  });
  if (!data) return null;
  const count = Math.max(1, layoutClients(data.layout), ...Object.keys(data.bySlot).map(Number));
  const send = (slot: number) => {
    if (busy) return;
    const prev = data.bySlot[slot];
    setAsk({ slot, name: prev?.client_name || (slot === 1 ? site.client_contact_name || '' : ''), email: prev?.client_email || (slot === 1 ? site.client_email || '' : ''), err: '' });
  };
  const go = async () => {
    if (!ask || busy) return;
    const { slot } = ask, name = ask.name.trim(), em = ask.email.trim();
    // The name is needed as well as the email (Andy, 14 Nov 2026).
    const nerr = name ? '' : 'Enter the client’s name.', err = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) ? '' : 'Enter a valid email address.';
    if (nerr || err) { setAsk({ ...ask, nerr, err }); return; }
    setAsk(null);
    setBusy(true); toast('Sending…');
    const r = await supabase.functions.invoke('client-sign', { body: { action: 'request', rams_id: ramsId, client_email: em, client_name: name } });
    if (!r.error && slot > 1) { const out = r.data as { id?: string } | null; if (out?.id) await supabase.rpc('set_client_sign_slot' as never, { p_id: out.id, p_slot: slot } as never); }
    setBusy(false);
    toast(r.error ? 'Could not send — try again.' : `Sent to ${em}`);
    void qc.invalidateQueries({ queryKey: ['ramsClientSigs', ramsId] });
  };
  const who = ask && count > 1 ? `Client ${ask.slot}` : 'Client';
  return (
    <View style={{ marginTop: 6 }}>
      {ask && (
        <Popup title={`Send To ${who} To Sign`} onClose={() => setAsk(null)} footer={<PopupButtons yes="Send" onYes={() => void go()} />}>
          <Text style={label}>Name</Text>
          <TextInput accessibilityLabel="Client name" value={ask.name} onChangeText={(v) => setAsk({ ...ask, name: v, nerr: '' })} autoCapitalize="words" placeholder="Shown in the email and on the signing page" placeholderTextColor="#9AA1AB" style={[box, ask.nerr ? { marginBottom: 4 } : null]} />
          {!!ask.nerr && <Text style={{ color: '#C8102E', fontSize: 13, marginBottom: 8 }}>{ask.nerr}</Text>}
          <Text style={label}>Email</Text>
          <TextInput accessibilityLabel="Client email" value={ask.email} onChangeText={(v) => setAsk({ ...ask, email: v, err: '' })} autoCapitalize="none" keyboardType="email-address" placeholder="client@example.co.uk" placeholderTextColor="#9AA1AB" onSubmitEditing={() => void go()} style={[box, { marginBottom: ask.err ? 4 : 2 }]} />
          {!!ask.err && <Text style={{ color: '#C8102E', fontSize: 13 }}>{ask.err}</Text>}
          <Text style={{ color: base.slate, fontSize: 12.5, marginTop: 4 }}>They get a private link to read and sign this document. No app needed.</Text>
        </Popup>
      )}
      {Array.from({ length: count }, (_, i) => i + 1).map((slot) => {
        const c = data.bySlot[slot], label = count > 1 ? `Client ${slot}` : 'Client';
        if (c?.signed_at) return <Text key={slot} style={{ color: base.ok, fontWeight: '600', fontSize: 12.5 }}>✓ {label} signed — {c.signer_name || c.client_name || c.client_email} · {dm(c.signed_at)}</Text>;
        if (c) {
          const expired = new Date(c.expires_at).getTime() < data.now;
          return <Text key={slot} style={{ color: base.slate, fontSize: 12.5 }}>✉ {expired ? `${label} link expired` : `Waiting for ${label.toLowerCase()} to sign`} — {c.client_email} · sent {dm(c.requested_at)} · <Text style={{ color: base.blue }} onPress={() => send(slot)}>Send again</Text></Text>;
        }
        return <Text key={slot} style={{ color: base.blue, fontSize: 12.5 }} onPress={() => send(slot)}>✉ Send to {label.toLowerCase()} to sign (no app needed)</Text>;
      })}
    </View>
  );
}
