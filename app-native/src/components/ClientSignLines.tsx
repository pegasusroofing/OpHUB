// "Send to client to sign" lines under a job RAMS (580 ramsClientLineHtml /
// sendRamsToClient): one line per client the document has signature boxes for
// (at least Client 1), showing signed / waiting / link expired, and sending the
// client a private link (client-sign function) — no app needed on their side.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { promptText, useToast } from '@/components/toast';
import { layoutClients, type SignLayout } from '@/lib/signedPdf';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Req = { id: string; client_slot: number | null; client_name: string | null; client_email: string; requested_at: string; expires_at: string; signed_at: string | null; signer_name: string | null };
const dm = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

export function ClientSignLines({ ramsId, site }: { ramsId: string; site: Site }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
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
  const send = async (slot: number) => {
    if (busy) return;
    const prev = data.bySlot[slot];
    const who = count > 1 ? `Client ${slot}` : 'Client';
    const email = await promptText(`${who}'s email address — they'll get a private link to read and sign this document:`, prev?.client_email || (slot === 1 ? site.client_email || '' : ''));
    if (email === null) return;
    const em = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { toast('Enter a valid email address.'); return; }
    const name = await promptText('Client’s name (optional — shown in the email and on the signing page):', prev?.client_name || '');
    if (name === null) return;
    setBusy(true); toast('Sending…');
    const r = await supabase.functions.invoke('client-sign', { body: { action: 'request', rams_id: ramsId, client_email: em, client_name: name.trim() } });
    if (!r.error && slot > 1) { const out = r.data as { id?: string } | null; if (out?.id) await supabase.rpc('set_client_sign_slot' as never, { p_id: out.id, p_slot: slot } as never); }
    setBusy(false);
    toast(r.error ? 'Could not send — try again.' : `Sent to ${em}`);
    void qc.invalidateQueries({ queryKey: ['ramsClientSigs', ramsId] });
  };
  return (
    <View style={{ marginTop: 6 }}>
      {Array.from({ length: count }, (_, i) => i + 1).map((slot) => {
        const c = data.bySlot[slot], label = count > 1 ? `Client ${slot}` : 'Client';
        if (c?.signed_at) return <Text key={slot} style={{ color: base.ok, fontWeight: '600', fontSize: 12.5 }}>✓ {label} signed — {c.signer_name || c.client_name || c.client_email} · {dm(c.signed_at)}</Text>;
        if (c) {
          const expired = new Date(c.expires_at).getTime() < data.now;
          return <Text key={slot} style={{ color: base.slate, fontSize: 12.5 }}>✉ {expired ? `${label} link expired` : `Waiting for ${label.toLowerCase()} to sign`} — {c.client_email} · sent {dm(c.requested_at)} · <Text style={{ color: base.blue }} onPress={() => void send(slot)}>Send again</Text></Text>;
        }
        return <Text key={slot} style={{ color: base.blue, fontSize: 12.5 }} onPress={() => void send(slot)}>✉ Send to {label.toLowerCase()} to sign (no app needed)</Text>;
      })}
    </View>
  );
}
