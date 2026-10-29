// To book (9219b renderPmToBook): things the office has sent you to put against a job — purchase
// invoices (book to a job, or send back with a note) — and wages waiting on your jobs' prices.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { pickJob } from '@/components/FinSales';
import { FinRow } from '@/components/FinNav';
import { promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { openDocLink } from '@/data/hs';
import { useSites } from '@/data/sites';
import { bookToJob, sendBack, useToBook } from '@/data/toBook';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { fdate, jobTag, money } from '@/lib/rules/finance';
import { base, page, radius, space } from '@/theme/theme';

type Row = Record<string, any>;
export default function ToBook() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites } = useSites();
  const { data, isLoading } = useToBook(sites);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  if (!me) return null;
  const open = (sites ?? []).filter((s) => siteStatusKey(s) !== 'closed');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['toBook'] });
  const wBy: Record<string, Row[]> = {}; (data?.wages ?? []).forEach((w) => { (wBy[w.site_id] ||= []).push(w); });
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'To book' }} />
      <Muted style={{ marginBottom: 12 }}>Things the office has sent you to put against a job.</Muted>
      <SectionTitle>Purchase invoices to book{data?.inv.length ? ` (${data.inv.length})` : ''}</SectionTitle>
      {isLoading ? <Muted>Loading…</Muted> : data?.inv.length ? data.inv.map((it) => {
        const ex = (it.extracted || {}) as Row, last = (it.comments || []).slice(-1)[0] as Row | undefined;
        const site = open.find((s) => s.id === pick[it.id]);
        return (
          <Card key={it.id}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: base.ink }}>{ex.supplier || it.from_email || 'Purchase invoice'}</Text>
                <Muted>{[ex.invoice_no ? `Invoice ${ex.invoice_no}` : '', ex.date ? fdate(ex.date) : ''].filter(Boolean).join(' · ')}</Muted>
              </View>
              {ex.total != null && <Text style={{ fontWeight: '800', color: base.ink }}>{money(ex.total)}</Text>}
            </View>
            {!!last && <Text style={{ marginTop: 6, color: base.ink }}><Text style={{ fontWeight: '700' }}>{last.name || 'Office'}:</Text> {last.text || ''}</Text>}
            {!!it.file_path && <Button kind="ghost" title="View the invoice" onPress={async () => { const u = await openDocLink('finance-docs', it.file_path); if (u) viewDoc(u); else toast('Could not open the file.'); }} />}
            <Pressable onPress={async () => { const s = await pickJob('Which job is it for', open); if (s) setPick({ ...pick, [it.id]: s }); }} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, marginTop: 8, backgroundColor: base.card }}>
              <Text style={{ color: site ? base.ink : base.slate }}>{site ? jobTag(site) : 'Which job is it for? ▾'}</Text>
            </Pressable>
            <TextInput value={note[it.id] || ''} onChangeText={(v) => setNote({ ...note, [it.id]: v })} placeholder="Note or reply to the office (optional)" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, marginTop: 8, color: base.ink, backgroundColor: base.card }} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{ flex: 2 }}><Button busy={busy === it.id} title="Book to this job" onPress={async () => {
                if (!pick[it.id]) { toast('Choose the job.'); return; }
                setBusy(it.id); const err = await bookToJob(it.id, pick[it.id], (note[it.id] || '').trim()); setBusy('');
                toast(err ? `Not booked — ${err}` : `Booked to ${site?.name || 'the job'} — the office will approve it`); if (!err) refresh();
              }} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Send back" onPress={async () => {
                const text = ((await promptText('Send it back to the office with a note (e.g. “Not one of mine — try Mike”)', note[it.id] || '')) || '').trim(); if (!text) return;
                const err = await sendBack(it.id, text); toast(err ? `Not sent — ${err}` : `Sent back to the office: “${text.slice(0, 60)}”`); if (!err) refresh();
              }} /></View>
            </View>
          </Card>
        );
      }) : <Empty>Nothing waiting.</Empty>}
      <SectionTitle>Wages to book against your prices{data?.wages.length ? ` (${data.wages.length})` : ''}</SectionTitle>
      {Object.keys(wBy).length ? Object.keys(wBy).map((sid) => {
        const s = (sites ?? []).find((x) => x.id === sid), tot = wBy[sid].reduce((t, w) => t + Number(w.amount || 0), 0);
        return <FinRow key={sid} title={s ? jobTag(s) : 'Job'} sub={`${wBy[sid].length} week${wBy[sid].length === 1 ? '' : 's'} of wages`} right={money(tot)} onPress={() => router.push(`/sites/${sid}/price` as never)} />;
      }) : <Empty>Nothing waiting.</Empty>}
      <View style={{ height: space.l }} />
    </ScrollView>
  );
}
