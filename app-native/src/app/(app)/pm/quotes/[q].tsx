// One quote: client from the Directory, project, value, who priced it, return date; outcome; the email chaser; its
// folder of documents; and Won, convert to job. Laid out like Finance (Andy, 4 Nov 2026): the figures as tiles across the top
// with the outcome and the actions on one row; customer and project side by side on a laptop.
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { OneDriveBrowser } from '@/components/OneDriveBrowser';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Field, Muted, SectionTitle, Toggle } from '@/components/ui';
import { FinStat } from '@/components/FinNav';
import { useTeam } from '@/data/admin';
import { chaseNow, chasePatch, clientId, convertToJob, fileQuoteFolder, makeQuoteFolder, saveQuote, searchClients, setQuoteStatus, uploadTenderDocs, useQuote, useQuoteSettings, type ClientHit } from '@/data/quotes';
import { SubmitQuote } from '@/components/SubmitQuote';
import { useAuth } from '@/lib/auth';
import { DISCIPLINES, isClosed, QUOTE_STATUS, statusLabel } from '@/lib/rules/quotes';
import { supabase } from '@/lib/supabase';
import { base, page, space, useDesk } from '@/theme/theme';

type Form = { client: string; contact: string; email: string; phone: string; title: string; address: string; postcode: string; discipline: string; value: string; profit: string; pricedBy: string; pricedName: string; received: string; ret: string; notes: string };
const EMPTY: Form = { client: '', contact: '', email: '', phone: '', title: '', address: '', postcode: '', discipline: '', value: '', profit: '', pricedBy: '', pricedName: '', received: '', ret: '', notes: '' };
const EMAIL_OK = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export default function QuotePage() {
  const { q: id } = useLocalSearchParams<{ q: string }>();
  const isNew = id === 'new';
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuote(id);
  const { data: settings } = useQuoteSettings(me?.org_id);
  const { data: team } = useTeam(me?.org_id);
  const { data: nums } = useQuery({ queryKey: ['orgNums', me?.org_id], enabled: !!me, queryFn: async () => (await supabase.from('organizations').select('auto_job_numbers').eq('id', me?.org_id as string).maybeSingle()).data as { auto_job_numbers?: boolean } | null });
  const [v, setV] = useState<Form>(EMPTY);
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [busy, setBusy] = useState('');
  const [docs, setDocs] = useState<{ uri: string; name: string }[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const desk = useDesk();
  const q = data?.quote ?? null;
  const firstDays = settings?.chase_first_days ?? 30;
  useEffect(() => {
    if (!q) return;
    setV({ client: q.client_name, contact: q.contact_name ?? '', email: q.contact_email ?? '', phone: q.contact_phone ?? '', title: q.title, address: q.address ?? '', postcode: q.postcode ?? '', discipline: q.discipline ?? '', value: q.value == null ? '' : String(q.value), profit: q.profit_pct == null ? '' : String(Math.round(q.profit_pct * 1000) / 10), pricedBy: q.priced_by ?? '', pricedName: q.priced_by_name ?? '', received: q.received_date ?? '', ret: q.return_date ?? '', notes: q.notes ?? '' });
  }, [q?.id, q?.status, q?.folder_id, q?.chase_count]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  if (me.role !== 'pm' && me.role !== 'admin') return <Muted style={{ padding: space.l }}>Project managers and admins only.</Muted>;
  if (!isNew && !q) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const set = (k: keyof Form) => (t: string) => setV((f) => ({ ...f, [k]: t }));
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['quote', id] }); void qc.invalidateQueries({ queryKey: ['quotes', me.org_id] }); };
  const typeClient = (t: string) => { set('client')(t); if (t.trim().length >= 2) void searchClients(t.trim()).then(setHits); else setHits([]); };

  const save = async (): Promise<string | null> => {
    if (!v.client.trim()) { toast('Who is the customer?'); return null; }
    if (!v.title.trim()) { toast('Give the project a name.'); return null; }
    const email = v.email.trim();
    if (email && !EMAIL_OK.test(email)) { toast('That email address doesn’t look right.'); return null; }
    const val = v.value.trim() ? Number(v.value.replace(/[£,\s]/g, '')) : null, pct = v.profit.trim() ? Number(v.profit.replace(/[%\s]/g, '')) : null;
    if ((val != null && !isFinite(val)) || (pct != null && !isFinite(pct))) { toast('Value and profit need to be numbers.'); return null; }
    setBusy(isNew ? 'Saving…' : 'save');
    const cid = await clientId(v.client.trim(), email, v.phone.trim());
    const saved = await saveQuote(me, isNew ? null : id, {
      client_id: cid, client_name: v.client.trim(), contact_name: v.contact.trim() || null, contact_email: email || null, contact_phone: v.phone.trim() || null, title: v.title.trim(), address: v.address.trim() || null, postcode: v.postcode.trim() || null,
      discipline: v.discipline || null, value: val, profit_pct: pct == null ? null : pct / 100, priced_by: v.pricedBy || (isNew ? me.id : null), priced_by_name: v.pricedName || (isNew ? me.name : null), received_date: v.received || null, return_date: v.ret || null, notes: v.notes.trim() || null,
    });
    if (!saved) { setBusy(''); toast('Could not save. Try again.'); return null; }
    let done = isNew ? 'Enquiry added' : 'Saved';
    // A new enquiry gets its OneDrive folder straight away, with the tender documents in it.
    if (isNew && settings?.open_path && settings?.template_path) {
      setBusy('Making the OneDrive folder…');
      const f = await makeQuoteFolder(saved);
      if (f.error) done = `Enquiry added, but no folder yet: ${f.error}`;
      else if (docs.length) {
        setBusy('Adding the documents…');
        const made = (await supabase.from('quotes' as never).select('folder_id,folder_drive_id').eq('id' as never, saved as never).maybeSingle()).data as { folder_id: string | null; folder_drive_id: string | null } | null;
        const n = made?.folder_id ? await uploadTenderDocs({ id: made.folder_id, driveId: made.folder_drive_id }, docs) : 0;
        done = n === docs.length ? 'Enquiry added, with its folder and documents' : `Enquiry added, but only ${n} of ${docs.length} documents went up. Add the rest below.`;
      } else done = 'Enquiry added, with its folder';
    }
    setBusy('');
    toast(done);
    refresh();
    if (isNew) router.replace(`/pm/quotes/${saved}` as never);
    return saved;
  };
  const changeStatus = async () => {
    if (!q) return;
    const k = await chooseAction('Outcome', QUOTE_STATUS.filter((s) => s.key !== 'won' && (s.key !== 'returned' || !!q.returned_at)).map((s) => ({ key: s.key, label: `${q.status === s.key ? '✓ ' : ''}${s.label}` })));
    if (!k || k === q.status) return;
    setBusy('status');
    const ok = await setQuoteStatus(me, q, k, firstDays);
    let note = '';
    if (ok && isClosed(k) && q.folder_id && !q.filed_at) {
      const f = await fileQuoteFolder(q.id);
      note = f.error ? ` The folder stayed where it is: ${f.error}` : f.data?.year ? ` Folder filed in ${f.data.year}.` : '';
    }
    setBusy('');
    toast(ok ? `Now ${statusLabel(k)}.${note}` : 'Could not save. Try again.');
    refresh();
  };
  const won = async () => {
    if (!q || !(await confirmAsk(`Mark "${q.title}" as won and make it a job? Its folder moves out of Estimating into the new job.`, 'Won, make the job'))) return;
    setBusy('won');
    const r = await convertToJob(me, q, !!nums?.auto_job_numbers, firstDays);
    setBusy('');
    if ('error' in r) { showAlert(r.error); return; }
    void qc.invalidateQueries({ queryKey: ['sites'] });
    refresh();
    if (r.note) showAlert(`The job is made. ${r.note}.`);
    else toast('Won: the job is made');
    router.replace(`/sites/${r.siteId}` as never);
  };
  const people = (team ?? []).filter((p) => p.role === 'pm' || p.role === 'admin');

  return (
    <ScrollView contentContainerStyle={page(desk ? 1000 : 720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'New Enquiry' : 'Quote' }} />
      {!!q && (() => {
        const tone = q.status === 'won' ? '#15803d' : isClosed(q.status) ? '#7A7F87' : q.status === 'returned' ? '#D98A00' : q.status === 'negotiating' ? '#2F6FB3' : '#1E2124';
        const ukd = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
        return (
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: base.ink }}>{q.title}</Text>
                <Text style={{ fontSize: 13, color: base.slate }}>{[q.client_name, q.discipline, q.address].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: tone, backgroundColor: `${tone}1A`, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11, overflow: 'hidden' }}>● {statusLabel(q.status)}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              <FinStat basis={desk ? 150 : '45%'} v={q.value ? `£${Math.round(q.value).toLocaleString('en-GB')}` : '—'} label="Tender value" tone="blue" />
              <FinStat basis={desk ? 150 : '45%'} v={q.profit_pct == null ? '—' : `${Math.round(q.profit_pct * 1000) / 10}%`} label="Profit" tone="green" />
              <FinStat basis={desk ? 150 : '45%'} v={ukd(q.return_date)} label={q.returned_at ? 'Sent' : 'Due back'} tone="amber" />
              <FinStat basis={desk ? 150 : '45%'} v={q.priced_by_name || '—'} label="Priced by" />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {q.site_id ? <Button small title="Open The Job" onPress={() => router.push(`/sites/${q.site_id}` as never)} /> : <Button small busy={busy === 'won'} title="🏆 Won: Convert To Job" onPress={() => void won()} />}
              {!q.site_id && <Button small kind="ghost" busy={busy === 'status'} title="Change Outcome" onPress={() => void changeStatus()} />}
            </View>
          </View>
        );
      })()}
      {!!q && !q.returned_at && !q.site_id && <SubmitQuote q={q} firstDays={firstDays} onDone={refresh} />}
      {!!q && (
        <Card>
          <SectionTitle>Documents</SectionTitle>
          {q.folder_id ? <OneDriveBrowser root={{ id: q.folder_id, driveId: q.folder_drive_id, name: q.folder_name || 'Enquiry folder' }} /> : (
            <>
              <Muted style={{ marginBottom: 8 }}>Makes the enquiry’s folder in OneDrive from your New Enquiry template.</Muted>
              <Button busy={busy === 'folder'} title="📁 Make the folder" onPress={async () => { setBusy('folder'); const r = await makeQuoteFolder(q.id); setBusy(''); toast(r.error || 'Folder made'); refresh(); }} />
              <View style={{ marginTop: 8 }}><Button kind="ghost" title="Link a folder already there" onPress={() => router.push({ pathname: '/pm/onedrive-pick', params: { target: 'quote', id: q.id } } as never)} /></View>
            </>
          )}
        </Card>
      )}
      {!!q && (
        <Card>
          <SectionTitle>Email chaser</SectionTitle>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Text style={{ flex: 1, color: base.ink, fontWeight: '700' }}>Chase this quote</Text>
            <Switch accessibilityLabel="Chase this quote" value={q.chase_on} onValueChange={async (on) => { if (await saveQuote(me, q.id, chasePatch(q, on, firstDays))) refresh(); else toast('Could not save. Try again.'); }} />
          </View>
          <Muted style={{ marginBottom: 8 }}>
            {!settings?.chase_enabled ? 'Automatic chasing is switched off for the company, in Quote settings. Chase now still works.' : q.next_chase_date && q.chase_on ? `Next chase ${new Date(`${q.next_chase_date}T12:00:00`).toLocaleDateString('en-GB')}.` : q.status === 'returned' ? 'No chase due.' : 'Starts once the quote is Returned. Moving it to Tender stage turns it off.'}
            {q.contact_email ? '' : ' Add a contact email first.'}
          </Muted>
          <Button kind="ghost" busy={busy === 'chase'} disabled={!q.contact_email} title="✉ Chase now" onPress={async () => {
            if (!(await confirmAsk(`Send a chaser email to ${q.contact_email} now?`, 'Send'))) return;
            setBusy('chase'); const r = await chaseNow(q.id); setBusy('');
            toast(r.error || 'Chaser sent'); refresh();
          }} />
          {(data?.chases ?? []).map((c) => <Muted key={c.id} style={{ marginTop: 6 }}>{new Date(c.sent_at).toLocaleDateString('en-GB')}: {c.automatic ? 'automatic' : 'by hand'} to {c.sent_to}</Muted>)}
        </Card>
      )}
      {!isNew && <Toggle title="Customer and project details" open={showDetails} onPress={() => setShowDetails(!showDetails)} />}
      {(isNew || showDetails) && (
        <View style={desk ? { flexDirection: 'row', gap: 12, alignItems: 'flex-start' } : undefined}>
      <Card style={desk ? { flex: 1 } : undefined}>
        <SectionTitle>Customer</SectionTitle>
        <Field label="Client *" value={v.client} onChangeText={typeClient} placeholder="Start typing to search your Directory" />
        {hits.filter((h) => h.name.toLowerCase() !== v.client.trim().toLowerCase()).map((h) => (
          <Pressable key={h.id} onPress={() => { setV((f) => ({ ...f, client: h.name, email: f.email || h.email || '', phone: f.phone || h.phone || '' })); setHits([]); }} style={{ paddingVertical: 8 }}>
            <Text style={{ color: base.blue, fontWeight: '700' }}>{h.name}</Text>
          </Pressable>
        ))}
        <Field label="Contact name" value={v.contact} onChangeText={set('contact')} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 2 }}><Field label="Contact number" value={v.phone} onChangeText={set('phone')} keyboardType="phone-pad" /></View>
          <View style={{ flex: 3 }}><Field label="Contact email (the chaser goes here)" value={v.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" /></View>
        </View>
      </Card>
      <Card style={desk ? { flex: 1.3 } : undefined}>
        <SectionTitle>Project</SectionTitle>
        <Field label="Project name *" value={v.title} onChangeText={set('title')} />
        <Field label="Address" value={v.address} onChangeText={set('address')} />
        <Field label="Postcode" value={v.postcode} onChangeText={set('postcode')} />
        <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Discipline</Muted>
        <View style={{ marginBottom: 10 }}><Button kind="ghost" title={v.discipline || 'Choose…'} onPress={async () => { const k = await chooseAction('Discipline', DISCIPLINES.map((d) => ({ key: d, label: d }))); if (k) set('discipline')(k); }} /></View>
        {!isNew && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Tender value £" value={v.value} onChangeText={set('value')} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Profit %" value={v.profit} onChangeText={set('profit')} keyboardType="decimal-pad" /></View>
          </View>
        )}
        {/* Who's pricing it can be set from the start, so the estimator owns it (Andy, 4 Nov 2026). */}
        <Muted style={{ fontWeight: '700', marginBottom: 4 }}>{isNew ? 'Who is pricing it' : 'Priced by'}</Muted>
        <View style={{ marginBottom: 10 }}><Button kind="ghost" title={v.pricedName || (isNew ? `${me.name || 'Me'} (me)` : 'Choose…')} onPress={async () => { const k = await chooseAction(isNew ? 'Who is pricing it' : 'Priced by', people.map((p) => ({ key: p.id, label: p.name || p.email || 'Unknown' }))); const p = people.find((x) => x.id === k); if (p) setV((f) => ({ ...f, pricedBy: p.id, pricedName: p.name || '' })); }} /></View>
        <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Enquiry received</Muted>
        <DateBox value={v.received} onChange={set('received')} title="Enquiry received" style={{ marginBottom: 10 }} />
        <Muted style={{ fontWeight: '700', marginBottom: 4 }}>{q?.returned_at ? 'Date sent' : 'Tender due back'}</Muted>
        <DateBox value={v.ret} onChange={set('ret')} title={q?.returned_at ? 'Date sent' : 'Tender due back'} style={{ marginBottom: 10 }} />
        <Field label="Notes and feedback" value={v.notes} onChangeText={set('notes')} multiline />
        {isNew && (
          <View style={{ marginBottom: 10 }}>
            <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Tender documents</Muted>
            {docs.map((d, i) => <Pressable key={d.uri} onPress={() => setDocs(docs.filter((_, j) => j !== i))}><Text style={{ color: base.ink, paddingVertical: 3 }}>📎 {d.name}  ✕</Text></Pressable>)}
            <Button kind="ghost" title="📎 Add documents" onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true }); if (!r.canceled) setDocs([...docs, ...r.assets.map((a) => ({ uri: a.uri, name: a.name || 'file' }))]); }} />
            <Muted style={{ marginTop: 6 }}>They go in the enquiry’s Tender Documents folder in OneDrive.</Muted>
          </View>
        )}
        {busy && busy !== 'save' && isNew ? <Muted style={{ marginBottom: 8 }}>{busy}</Muted> : null}
        <Button busy={busy === 'save' || (isNew && !!busy)} title={isNew ? 'Create Enquiry' : 'Save'} onPress={() => void save()} />
      </Card>
        </View>
      )}
    </ScrollView>
  );
}
