// Invoice query (9219zr openPiQuery): a supplier invoice the office has put on query, sent to the job's
// PM — the invoice details, the conversation, and a reply. Works without Finance access
// (fin_pi_query_view / fin_pi_query_reply).
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { FinRow } from '@/components/FinNav';
import { useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fdate, money } from '@/lib/rules/finance';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

type Row = Record<string, any>;
const rpc = supabase.rpc as unknown as (fn: string, args: object) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
const when = (t: string) => (t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function PiQuery() {
  const { pi } = useLocalSearchParams<{ pi: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['piQuery', pi], enabled: !!pi, gcTime: 0,
    queryFn: async () => { const r = await rpc('fin_pi_query_view', { p_pi: pi }); if (r.error) return { error: r.error.code === 'PGRST202' ? 'Invoice queries aren’t switched on yet — ask the office.' : `Couldn’t open the query — ${String(r.error.message || '').slice(0, 120)}` }; const d = Array.isArray(r.data) ? r.data[0] : r.data; return d && typeof d === 'object' ? { d: d as Row } : { error: 'This invoice query couldn’t be found — it may have been sorted already.' }; },
  });
  if (!me) return null;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if ('error' in data) return <Muted style={{ padding: space.l }}>{data.error}</Muted>;
  const d = data.d, thread = (Array.isArray(d.query_thread) ? d.query_thread : []).filter((x: Row) => x && x.text) as Row[];
  return (
    <ScrollView contentContainerStyle={page(640)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Invoice query' }} />
      <Muted style={{ marginBottom: 10 }}>The office needs your help with this supplier invoice.</Muted>
      <Card>
        {[['Supplier', d.supplier_name], ['Invoice no.', d.invoice_no], ['Date', d.invoice_date ? fdate(String(d.invoice_date).slice(0, 10)) : ''], ['Project', d.site_name], ['PO', d.po_number], ['For', d.description], ['Net', d.net != null ? money(d.net) : ''], ['Total', d.total != null ? money(d.total) : '']]
          .filter(([, v]) => v != null && v !== '').map(([k, v]) => <FinRow key={k as string} title={k as string} right={String(v)} />)}
        {!!d.query_note && <Text style={{ color: base.red, marginTop: 8 }}><Text style={{ fontWeight: '800' }}>Query:</Text> {d.query_note}</Text>}
        {!!d.status && d.status !== 'query' && <Text style={{ color: base.ok, marginTop: 8 }}>The office has sorted this one now.</Text>}
      </Card>
      <SectionTitle>Conversation</SectionTitle>
      {thread.length ? thread.map((x, i) => (
        <View key={i} style={{ alignSelf: x.by === me.id ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: x.by === me.id ? base.blueBg : base.card, borderWidth: 1, borderColor: base.line, borderRadius: radius.row, padding: 10, marginBottom: 6 }}>
          <Muted style={{ fontSize: 11 }}>{x.name || 'Office'} · {when(x.at)}</Muted>
          <Text style={{ color: base.ink }}>{x.text}</Text>
        </View>
      )) : <Muted style={{ marginBottom: 8 }}>No replies yet.</Muted>}
      <TextInput value={text} onChangeText={setText} multiline placeholder="e.g. Yes, 2 packs came short — the driver has the note" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, minHeight: 70, color: base.ink, backgroundColor: base.card, marginVertical: 8 }} />
      <Button busy={busy} title="Send reply" onPress={async () => {
        const t = text.trim(); if (!t) { toast('Write a reply first.'); return; }
        setBusy(true); const r = await rpc('fin_pi_query_reply', { p_pi: pi, p_text: t.slice(0, 2000) }); setBusy(false);
        if (r.error) { toast(`Couldn’t send the reply — ${String(r.error.message || '').slice(0, 120)}`); return; }
        toast('Reply sent to the office'); setText(''); void refetch();
      }} />
    </ScrollView>
  );
}
