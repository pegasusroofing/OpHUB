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
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Field, Muted, SectionTitle, Toggle } from '@/components/ui';
import { FinStat } from '@/components/FinNav';
import { useTeam } from '@/data/admin';
import { addQuoteClient, chaseEmails, chaseNow, chasePatch, setQuoteClientContact, clientId, convertToJob, fileQuoteFolder, linkToJob, removeQuoteClient, setClientMarkup, wonFrom, type Quote, makeQuoteFolder, saveQuote, searchClients, setQuoteStatus, uploadTenderDocs, useQuote, useQuoteSettings, type ClientHit } from '@/data/quotes';
import { SubmitQuote } from '@/components/SubmitQuote';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { DISCIPLINES, isClosed, QUOTE_STATUS, statusLabel } from '@/lib/rules/quotes';
import { supabase } from '@/lib/supabase';
import { base, page, space, useDesk } from '@/theme/theme';

type Form = { client: string; contact: string; email: string; phone: string; title: string; address: string; postcode: string; discipline: string; value: string; profit: string; markup: string; pricedBy: string; pricedName: string; received: string; ret: string; notes: string };
const EMPTY: Form = { client: '', contact: '', email: '', phone: '', title: '', address: '', postcode: '', discipline: '', value: '', profit: '', markup: '', pricedBy: '', pricedName: '', received: '', ret: '', notes: '' };
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
  const [picked, setPicked] = useState<ClientHit | null>(null);
  const [addQ, setAddQ] = useState('');
  const [addHits, setAddHits] = useState<ClientHit[]>([]);
  const [busy, setBusy] = useState('');
  const [docs, setDocs] = useState<{ uri: string; name: string }[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const desk = useDesk();
  const { data: sites = [] } = useSites();
  const q = data?.quote ?? null;
  const firstDays = settings?.chase_first_days ?? 30;
  useEffect(() => {
    if (!q) return;
    setV({ client: q.client_name, contact: q.contact_name ?? '', email: q.contact_email ?? '', phone: q.contact_phone ?? '', title: q.title, address: q.address ?? '', postcode: q.postcode ?? '', discipline: q.discipline ?? '', value: q.value == null ? '' : String(q.value), profit: q.profit_pct == null ? '' : String(Math.round(q.profit_pct * 1000) / 10), markup: q.guide_markup_pct == null ? '' : String(q.guide_markup_pct), pricedBy: q.priced_by ?? '', pricedName: q.priced_by_name ?? '', received: q.received_date ?? '', ret: q.return_date ?? '', notes: q.notes ?? '' });
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
    const mk = v.markup.trim() ? Number(v.markup.replace(/[%\s]/g, '')) : null;
    if ((val != null && !isFinite(val)) || (pct != null && !isFinite(pct)) || (mk != null && !isFinite(mk))) { toast('Value, profit and mark-up need to be numbers.'); return null; }
    setBusy(isNew ? 'Saving…' : 'save');
    const cid = await clientId(v.client.trim(), email, v.phone.trim());
    const saved = await saveQuote(me, isNew ? null : id, {
      client_id: cid, client_name: v.client.trim(), contact_name: v.contact.trim() || null, contact_email: email || null, contact_phone: v.phone.trim() || null, title: v.title.trim(), address: v.address.trim() || null, postcode: v.postcode.trim() || null,
      discipline: v.discipline || null, value: val, profit_pct: pct == null ? null : pct / 100, guide_markup_pct: mk, priced_by: v.pricedBy || (isNew ? me.id : null), priced_by_name: v.pricedName || (isNew ? me.name : null), received_date: v.received || null, return_date: v.ret || null, notes: v.notes.trim() || null,
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
  // Tendered to several clients: say which one it was won from (Andy, 4 Nov 2026).
  const winner = async (): Promise<Quote | null> => {
    if (!q) return null;
    if (!q.others?.length) return q;
    const k = await chooseAction('Which client did you win it from?', [{ key: '-', label: `${q.client_name} (main)` }, ...q.others.map((o) => ({ key: o.id, label: o.client_name }))]);
    if (!k) return null;
    if (k === '-') return q;
    const o = q.others.find((x) => x.id === k);
    const next = o ? await wonFrom(me, q, o) : null;
    if (!next) { toast('Could not save — try again.'); return null; }
    return next;
  };
  const won = async () => {
    const qw = await winner(); if (!qw) return;
    if (!q || !(await confirmAsk(`Mark "${q.title}" as won and make it a job? Its folder moves out of Estimating into the new job.`, 'Won, make the job'))) return;
    setBusy('won');
    const r = await convertToJob(me, qw, !!nums?.auto_job_numbers, firstDays);
    setBusy('');
    if ('error' in r) { showAlert(r.error); return; }
    void qc.invalidateQueries({ queryKey: ['sites'] });
    refresh();
    if (r.note) showAlert(`The job is made. ${r.note}.`);
    else toast('Won: the job is made');
    router.replace(`/sites/${r.siteId}` as never);
  };
  // The job may already be in OpHUB: link the quote to it and move the enquiry's folder into its files (Andy, 4 Nov 2026).
  const wonExisting = async () => {
    const qw = await winner(); if (!q || !qw) return;
    const order = (st: string | null | undefined) => (st === 'closed' ? 2 : st === 'upcoming' ? 1 : 0);
    const opts = sites.slice().sort((a, b) => order(a.status) - order(b.status) || String(b.job_number || '').localeCompare(String(a.job_number || ''), 'en-GB', { numeric: true }))
      .map((s2) => ({ key: s2.id, label: `${s2.status === 'closed' ? 'Closed · ' : s2.status === 'upcoming' ? 'Upcoming · ' : ''}${s2.job_number ? `${s2.job_number} ` : ''}${s2.name}` }));
    const sid = await chooseAction('Which job is it?', opts);
    if (!sid) return;
    const job = sites.find((x) => x.id === sid);
    if (!(await confirmAsk(`Mark "${q.title}" as won for ${job?.name || 'that job'}?${q.folder_id ? ' Its folder moves out of Estimating into the job.' : ''}`, 'Yes, Link It'))) return;
    setBusy('won');
    const r = await linkToJob(me, qw, sid, firstDays);
    setBusy('');
    if ('error' in r) { showAlert(r.error); return; }
    refresh();
    if (r.note) showAlert(`Linked to the job. ${r.note}.`); else toast('Won: linked to the job, with its folder');
    router.replace(`/sites/${sid}` as never);
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
                <Text style={{ fontSize: 13, color: base.slate }}>{[q.client_name + (q.others?.length ? ` +${q.others.length} more` : ''), q.discipline, q.address].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: tone, backgroundColor: `${tone}1A`, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11, overflow: 'hidden' }}>● {statusLabel(q.status)}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              <FinStat basis={desk ? 150 : '45%'} v={q.value ? `£${Math.round(q.value).toLocaleString('en-GB')}` : '—'} label="Tender value" tone="blue" />
              <FinStat basis={desk ? 150 : '45%'} v={q.profit_pct == null ? '—' : `${Math.round(q.profit_pct * 1000) / 10}%`} label={q.guide_markup_pct != null ? `Profit · guide mark-up ${q.guide_markup_pct}%` : 'Profit'} tone="green" />
              <FinStat basis={desk ? 150 : '45%'} v={ukd(q.return_date)} label={q.returned_at ? 'Sent' : 'Due back'} tone="amber" />
              <FinStat basis={desk ? 150 : '45%'} v={q.priced_by_name || '—'} label="Priced by" />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {q.site_id ? <Button small title="Open The Job" onPress={() => router.push(`/sites/${q.site_id}` as never)} /> : <Button small busy={busy === 'won'} title="🏆 Won: Convert To Job" onPress={() => void won()} />}
              {!q.site_id && <Button small kind="ghost" busy={busy === 'won'} title="Won: Link To Existing Job" onPress={() => void wonExisting()} />}
              {!q.site_id && <Button small kind="ghost" busy={busy === 'status'} title="Change Outcome" onPress={() => void changeStatus()} />}
            </View>
          </View>
        );
      })()}
      {!!q && (
        <Card>
          <SectionTitle>Clients Tendering</SectionTitle>
          <Muted style={{ marginBottom: 6 }}>The same job priced for more than one client. When it&apos;s won you choose which client it came from; the reports count it for each of them.</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            <Text style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: base.ink, color: base.ink, fontSize: 12.5, overflow: 'hidden' }}>★ {q.client_name}</Text>
            {(q.others ?? []).map((o) => (
              <Pressable key={o.id} disabled={!!q.site_id} onPress={async () => {
                const k = await chooseAction(o.client_name, [{ key: 'contact', label: o.contact_email ? `✉ Contact: ${o.contact_name ? `${o.contact_name}, ` : ''}${o.contact_email}` : '✉ Add The Contact To Chase' }, { key: 'off', label: 'Take Off This Quote' }]);
                if (k === 'off') { if (await confirmAsk(`Take ${o.client_name} off this quote?`, 'Take Off')) { if (await removeQuoteClient(o.id)) refresh(); else toast('Could not save — try again.'); } }
                if (k === 'contact') {
                  const nm = await promptText(`Contact name at ${o.client_name}`, o.contact_name || ''); if (nm === null) return;
                  const em = await promptText(`${nm.trim() || 'Their'} email (the chaser goes here)`, o.contact_email || ''); if (em === null) return;
                  if (em.trim() && !EMAIL_OK.test(em.trim())) { toast('That email address doesn’t look right.'); return; }
                  if (await setQuoteClientContact(o.id, { contact_name: nm.trim() || null, contact_email: em.trim() || null })) { toast('Saved'); refresh(); } else toast('Could not save — try again.');
                }
              }} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: base.line, backgroundColor: base.card }}>
                <Text style={{ fontSize: 12.5, color: base.ink }}>{o.client_name}{o.contact_name ? ` · ${o.contact_name}` : ''}{o.contact_email ? ' ✉' : ''}{q.site_id ? '' : '  ⋮'}</Text>
              </Pressable>
            ))}
          </View>
          {!q.site_id && (
            <>
              <Field label="Add another client" value={addQ} onChangeText={(t) => { setAddQ(t); if (t.trim().length >= 2) void searchClients(t.trim()).then(setAddHits); else setAddHits([]); }} placeholder="Start typing to search your Directory" />
              {addHits.filter((h) => ![q.client_name, ...(q.others ?? []).map((o) => o.client_name)].some((n) => n.toLowerCase() === h.name.toLowerCase())).map((h) => (
                <Pressable key={h.id} onPress={async () => { if (await addQuoteClient(me, q.id, { name: h.name, email: h.email, phone: h.phone })) { setAddQ(''); setAddHits([]); refresh(); } else toast('Could not save — try again.'); }} style={{ paddingVertical: 7 }}>
                  <Text style={{ color: base.blue, fontWeight: '600' }}>+ {h.name}</Text>
                </Pressable>
              ))}
              {addQ.trim().length >= 2 && !addHits.some((h) => h.name.toLowerCase() === addQ.trim().toLowerCase()) && (
                <Pressable onPress={async () => { if (await addQuoteClient(me, q.id, { name: addQ.trim() })) { setAddQ(''); setAddHits([]); refresh(); toast('Added — and to the Directory'); } else toast('Could not save — try again.'); }} style={{ paddingVertical: 7 }}>
                  <Text style={{ color: base.blue, fontWeight: '600' }}>+ Add &quot;{addQ.trim()}&quot; as a new client</Text>
                </Pressable>
              )}
            </>
          )}
        </Card>
      )}
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
            {chaseEmails(q).length ? ` Chases ${chaseEmails(q).length === 1 ? chaseEmails(q)[0] : `all ${chaseEmails(q).length} clients' contacts`}.` : ' Add a contact email first.'}
          </Muted>
          <Button kind="ghost" busy={busy === 'chase'} disabled={!chaseEmails(q).length} title="✉ Chase now" onPress={async () => {
            if (!(await confirmAsk(`Send a chaser email now to ${chaseEmails(q).join(', ')}?`, 'Send'))) return;
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
          <Pressable key={h.id} onPress={() => { setV((f) => ({ ...f, client: h.name, email: f.email || h.email || '', phone: f.phone || h.phone || '', markup: f.markup || (h.markup != null ? String(h.markup) : '') })); setPicked(h); setHits([]); }} style={{ paddingVertical: 8 }}>
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
        {/* Guide mark-up (Andy, 4 Nov 2026): starts as the client's estimating mark-up from the Directory; change it here, and save it
            back to the client if it should be their new figure. */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Field label="Guide mark-up %" value={v.markup} onChangeText={set('markup')} keyboardType="decimal-pad" placeholder={picked?.markup != null ? `${picked.markup} (client)` : 'e.g. 15'} /></View>
          {!!v.client.trim() && v.markup.trim() !== '' && (picked ? String(picked.markup ?? '') !== v.markup.trim() : true) && (
            <View style={{ flex: 1, marginBottom: 10 }}><Button small kind="ghost" busy={busy === 'markup'} title="Save For This Client" onPress={async () => {
              const n = Number(v.markup.replace(/[%\s]/g, '')); if (!isFinite(n)) { toast('The mark-up needs to be a number.'); return; }
              setBusy('markup');
              const cid = picked?.id ?? (q?.client_id || (await clientId(v.client.trim(), v.email.trim(), v.phone.trim())));
              const ok = !!cid && (await setClientMarkup(cid, n));
              setBusy('');
              if (ok) { setPicked({ ...(picked ?? { id: cid as string, name: v.client.trim(), email: null, phone: null }), markup: n }); toast(`${v.client.trim()}'s estimating mark-up is now ${n}%`); } else toast('Could not save it to the client.');
            }} /></View>
          )}
        </View>
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
