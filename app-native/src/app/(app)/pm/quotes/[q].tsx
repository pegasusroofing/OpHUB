// A tender (Andy, 11 Nov 2026: "needs complete rework"). From the top:
//   the status bar (Pricing, Awaiting Information, Ready For Checking), which also moves its OneDrive folder;
//   four small tiles: Tender Value, Mark-Up, Return Date, Chase Date;
//   the client and project as a compact view (Edit Details opens the form), with the clients tendering and + Clients;
//   Documents: its OneDrive folder's files as links, + Add Documents;
//   once it's quoted, the outcome: Won – Convert To Project, Won – Link To Job, Negotiating, Lost;
//   Submit Quotation at the bottom while it's being priced, then the email chaser, short.
// Quoted tenders fold their sections away so the outcome buttons are what you see. New Enquiry is the form on its own.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { YesNo } from '@/components/OneDriveSettings';
import { QuoteDocs } from '@/components/QuoteDocs';
import { ClientsPop, disciplineOf, EMPTY_FORM, formOf, QuoteForm, type QForm } from '@/components/QuoteForm';
import { SubmitQuote } from '@/components/SubmitQuote';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { addQuoteClient, receivedOn, chaseEmails, chaseNow, chasePatch, clientId, linkToJob, makeQuoteFolder, moveToStatusFolder, removeQuoteClient, saveQuote, setQuoteClientContact, setQuoteStatus, syncTracker, uploadTenderDocs, useQuote, useQuoteSettings, wonFrom, type Quote } from '@/data/quotes';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { localISODate } from '@/lib/rules/driver';
import { chaseStatus, isQuoted, outcomeOf, outcomeLabel, WORK_STATUS } from '@/lib/rules/quotes';
import { supabase } from '@/lib/supabase';
import { base, page, space, useDesk } from '@/theme/theme';

const EMAIL_OK = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const ukd = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localISODate(d); };

/** A section that folds away (Andy: once quoted, the rows go compact). */
function Fold({ title, open, onToggle, right, children }: { title: string; open: boolean; onToggle: () => void; right?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: base.slate, letterSpacing: 0.4 }}>{title.toUpperCase()}</Text>
        {right}
        <Text style={{ color: base.slate, fontSize: 12 }}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && <View style={{ marginTop: 10 }}>{children}</View>}
    </Card>
  );
}

export default function QuotePage() {
  const { q: id } = useLocalSearchParams<{ q: string }>();
  const isNew = id === 'new';
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const desk = useDesk();
  const { data } = useQuote(id);
  const { data: settings } = useQuoteSettings(me?.org_id);
  const { data: team } = useTeam(me?.org_id);
  const { data: sites = [] } = useSites();
  // A new enquiry is received the day it's added, unless changed (Andy, 11 Nov 2026).
  const [v, setV] = useState<QForm>(() => ({ ...EMPTY_FORM, received: localISODate(new Date()) }));
  const [newOthers, setNewOthers] = useState<{ name: string; email?: string | null; phone?: string | null; contact?: string | null }[]>([]);
  const [docs, setDocs] = useState<{ uri: string; name: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [clientsPop, setClientsPop] = useState(false);
  const [submit, setSubmit] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const q = data?.quote ?? null;
  const firstDays = settings?.chase_first_days ?? 30;
  useEffect(() => { if (q) setV(formOf(q)); }, [q?.id, q?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  if (me.role !== 'pm' && me.role !== 'admin') return <Muted style={{ padding: space.l }}>Project managers and admins only.</Muted>;
  if (!isNew && !q) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const people = (team ?? []).filter((p) => p.role === 'pm' || p.role === 'admin');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['quote', id] }); void qc.invalidateQueries({ queryKey: ['quotes', me.org_id] }); syncTracker(me.org_id as string, org); };

  // ---- Save the details (New Enquiry, or Edit Details) ----
  const save = async () => {
    if (!v.client.trim()) { toast('Who is the customer?'); return; }
    if (!v.title.trim()) { toast('Give the project a name.'); return; }
    const email = v.email.trim();
    if (email && !EMAIL_OK.test(email)) { toast('That email address doesn’t look right.'); return; }
    const mk = v.markup.trim() ? Number(v.markup.replace(/[%\s]/g, '')) : null;
    if (mk != null && !isFinite(mk)) { toast('The mark-up needs to be a number.'); return; }
    setBusy(isNew ? 'Saving…' : 'save');
    const cid = await clientId(v.client.trim(), email, v.phone.trim());
    const saved = await saveQuote(me, isNew ? null : id, {
      client_id: cid, client_name: v.client.trim(), contact_name: v.contact.trim() || null, contact_email: email || null, contact_phone: v.phone.trim() || null, title: v.title.trim(), address: v.address.trim() || null, postcode: v.postcode.trim() || null,
      discipline: disciplineOf(v), guide_markup_pct: mk, priced_by: v.pricedBy || (isNew ? me.id : null), priced_by_name: v.pricedName || (isNew ? me.name : null), received_date: v.received || null, return_date: v.ret || null, notes: v.notes.trim() || null,
      // The client's Auto Chase setting (Directory › Estimating) for a new quote.
      ...(isNew && v.chase === 'no' ? { chase_on: false } : {}),
    });
    if (!saved) { setBusy(''); toast('Could not save. Try again.'); return; }
    if (!isNew) { setBusy(''); setEditing(false); refresh(); return; }
    for (const o of newOthers) await addQuoteClient(me, saved, o);
    // The tender's OneDrive folder straight away, from the New Enquiry template, with the documents in Tender Documents.
    let note = '';
    if (settings?.open_path && settings?.template_path) {
      setBusy('Making the OneDrive folder…');
      const f = await makeQuoteFolder(saved);
      if (f.error) note = `No OneDrive folder yet: ${f.error}`;
      else if (docs.length) {
        setBusy('Adding the documents…');
        const made = (await supabase.from('quotes' as never).select('folder_id,folder_drive_id').eq('id' as never, saved as never).maybeSingle()).data as { folder_id: string | null; folder_drive_id: string | null } | null;
        const n = made?.folder_id ? await uploadTenderDocs({ id: made.folder_id, driveId: made.folder_drive_id }, docs) : 0;
        if (n !== docs.length) note = `Only ${n} of ${docs.length} documents went up. Add the rest under Documents.`;
      }
      if (!f.error && (v.pricedBy && v.pricedBy !== me.id)) void moveToStatusFolder(saved, 'pricing');
    } else note = 'No OneDrive folder was made: set the Open Tenders folder in Admin › OneDrive.';
    setBusy('');
    if (note) showAlert(note);
    refresh();
    router.replace(`/pm/quotes/${saved}` as never);
  };

  if (isNew) return (
    <ScrollView contentContainerStyle={page(desk ? 900 : 720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New Enquiry' }} />
      <QuoteForm v={v} setV={(f) => setV(f)} isNew people={people} others={newOthers} onOthers={() => setClientsPop(true)} docs={docs} setDocs={setDocs} busy={busy} onSave={() => void save()} saveTitle="Create Enquiry" />
      {clientsPop && <ClientsPop have={[v.client, ...newOthers.map((o) => o.name)]} onClose={() => setClientsPop(false)} onDone={(p) => { setNewOthers([...newOthers, ...p]); setClientsPop(false); }} />}
    </ScrollView>
  );
  if (!q) return null;
  const quoted = isQuoted(q);
  const isOpen = (k: string, dflt: boolean) => open[k] ?? dflt;
  const flip = (k: string, dflt: boolean) => setOpen({ ...open, [k]: !isOpen(k, dflt) });

  // ---- The work status: saved, and its folder moves to that status's folder (Andy, 11 Nov 2026) ----
  const setWork = async (k: string) => {
    if (k === q.status) return;
    setBusy('status');
    const ok = await setQuoteStatus(me, q, k, firstDays);
    if (ok && q.folder_id) { const m = await moveToStatusFolder(q.id, k); if (m.error) toast(`Saved, but the folder stayed where it is: ${m.error}`); }
    setBusy('');
    if (!ok) toast('Could not save. Try again.');
    refresh();
  };
  const setOutcome = async (k: 'returned' | 'negotiating' | 'lost') => {
    const word = k === 'returned' ? 'No News' : k === 'negotiating' ? 'Negotiating' : 'Lost';
    if (k === 'lost' && !(await confirmAsk(`Mark "${q.title}" as lost?`, 'Yes, Lost', 'No'))) return;
    setBusy('status');
    const ok = await setQuoteStatus(me, q, k, firstDays);
    setBusy('');
    if (!ok) toast(`Could not mark it ${word}. Try again.`);
    refresh();
  };
  // Tendered to several clients: which one was it won from (Andy, 4 Nov 2026).
  const winner = async (): Promise<Quote | null> => {
    if (!q.others?.length) return q;
    const k = await chooseAction('Which Client Did You Win It From?', [{ key: '-', label: `${q.client_name} (Main)` }, ...q.others.map((o) => ({ key: o.id, label: o.client_name }))]);
    if (!k) return null;
    if (k === '-') return q;
    const o = q.others.find((x) => x.id === k);
    const next = o ? await wonFrom(me, q, o) : null;
    if (!next) toast('Could not save. Try again.');
    return next;
  };
  // Won – Convert To Project: straight into Create Project, filled in from the quote (Andy, 11 Nov 2026). Making the project
  // there makes its OneDrive folders and moves the quote's folder across. A quote that already has a project asks first.
  const convert = async () => {
    const already = q.site_id ? sites.find((s) => s.id === q.site_id) : sites.find((s) => s.name.trim().toLowerCase() === q.title.trim().toLowerCase());
    if (already && !(await confirmAsk(`${q.site_id ? 'This quote already has a project' : 'There’s already a project with this name'}: ${already.job_number ? `${already.job_number} ` : ''}${already.name}. Make another one anyway?`, 'Yes, Make Another', 'No'))) return;
    if (!already && !(await confirmAsk(`Mark "${q.title}" as won and make it a project?`, 'Won, Convert To Project', 'No'))) return;
    const qw = await winner(); if (!qw) return;
    // Won from another client: Create Project must load the quote as it now stands.
    await qc.invalidateQueries({ queryKey: ['quote', q.id] });
    router.push({ pathname: '/sites/new', params: { quote: q.id } } as never);
  };
  // Won – Link To Job: the job's already in OpHUB; the quote's folder moves into its files.
  const linkJob = async () => {
    const qw = await winner(); if (!qw) return;
    const order = (st: string | null | undefined) => (st === 'closed' ? 2 : st === 'upcoming' ? 1 : 0);
    const opts = sites.slice().sort((a, b) => order(a.status) - order(b.status) || String(b.job_number || '').localeCompare(String(a.job_number || ''), 'en-GB', { numeric: true }))
      .map((s2) => ({ key: s2.id, label: `${s2.status === 'closed' ? 'Closed · ' : s2.status === 'upcoming' ? 'Upcoming · ' : ''}${s2.job_number ? `${s2.job_number} ` : ''}${s2.name}` }));
    const sid = await chooseAction('Which Job Is It?', opts);
    if (!sid) return;
    const job = sites.find((x) => x.id === sid);
    if (!(await confirmAsk(`Mark "${q.title}" as won for ${job?.name || 'that job'}?${q.folder_id ? ' Its folder moves into the job.' : ''}`, 'Yes, Link It', 'No'))) return;
    setBusy('won');
    const r = await linkToJob(me, qw, sid, firstDays);
    setBusy('');
    if ('error' in r) { showAlert(r.error); return; }
    refresh();
    if (r.note) showAlert(`Linked to the job. ${r.note}.`);
    router.replace(`/sites/${sid}` as never);
  };

  // ---- The page ----
  const tile = (v2: string, label: string) => (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: base.card, borderRadius: 10, borderWidth: 1, borderColor: base.cardLine, paddingVertical: 8, paddingHorizontal: 9 }}>
      <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '700', color: base.ink }}>{v2}</Text>
      <Text numberOfLines={2} style={{ fontSize: 10.5, fontWeight: '500', color: base.slate }}>{label}</Text>
    </View>
  );
  const seg = (items: readonly (readonly [string, string])[], on: string, press: (k: string) => void) => (
    <View style={{ flexDirection: 'row', backgroundColor: '#EEF0F2', borderRadius: 10, padding: 3, gap: 3, marginBottom: 10 }}>
      {items.map(([k, l]) => (
        <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: on === k }} accessibilityLabel={l} disabled={busy === 'status'} onPress={() => press(k)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 4, borderRadius: 8, backgroundColor: on === k ? base.card : 'transparent', borderWidth: on === k ? 1 : 0, borderColor: base.line }}>
          <Text numberOfLines={2} style={{ fontSize: 12, textAlign: 'center', fontWeight: on === k ? '700' : '500', color: on === k ? base.ink : base.slate }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
  const kv = (l: string, val: ReactNode) => (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 5, width: desk ? '50%' : '100%' }}>
      <Text style={{ width: 92, fontSize: 12, fontWeight: '600', color: base.slate }}>{l}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>{typeof val === 'string' ? <Text style={{ fontSize: 13.5, color: base.ink }}>{val || '—'}</Text> : val}</View>
    </View>
  );
  const markupTile = q.profit_pct != null ? tile(`${Math.round(q.profit_pct * 1000) / 10}%`, 'Profit Mark-Up') : tile(q.guide_markup_pct != null ? `${q.guide_markup_pct}%` : '—', 'Guide Mark-Up');
  const outcome = outcomeOf(q.status);
  const chaseTo = chaseEmails(q);

  return (
    <ScrollView contentContainerStyle={page(desk ? 1000 : 720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Tender' }} />
      <Text style={{ fontSize: 17, fontWeight: '700', color: base.ink }}>{q.title}</Text>
      <Text style={{ fontSize: 12.5, color: base.slate, marginBottom: 10 }}>{[q.client_name + (q.others?.length ? ` +${q.others.length} More` : ''), q.address].filter(Boolean).join(' · ')}</Text>

      {/* The status bar, or once quoted its outcome. */}
      {!quoted ? seg(WORK_STATUS, q.status, (k) => void setWork(k)) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EEF0F2', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 }}>
          <Text style={{ flex: 1, fontSize: 13, color: base.ink }}>Quoted {ukd(q.returned_at || q.return_date)}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: base.ink }}>{q.site_id ? 'Won · Project Made' : outcomeLabel(q.status)}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        {tile(q.value ? `£${Math.round(q.value).toLocaleString('en-GB')}` : '—', 'Tender Value')}
        {markupTile}
        {tile(ukd(quoted ? q.returned_at || q.return_date : q.return_date).replace(/ \d{4}$/, ''), quoted ? 'Returned' : 'Due Back')}
        {tile(q.chase_on && q.next_chase_date ? ukd(q.next_chase_date).replace(/ \d{4}$/, '') : 'Off', 'Chase Date')}
      </View>

      {/* Once quoted: the outcome (Andy, 11 Nov 2026). */}
      {quoted && (
        <Card>
          <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginBottom: 8 }}>OUTCOME</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {q.site_id && <Button small title="Open The Project" onPress={() => router.push(`/sites/${q.site_id}` as never)} />}
            <Button small kind={q.site_id ? 'ghost' : 'primary'} busy={busy === 'won'} title="🏆 Won – Convert To Project" onPress={() => void convert()} />
            {!q.site_id && <Button small kind="ghost" busy={busy === 'won'} title="Won – Link To Job" onPress={() => void linkJob()} />}
            {!q.site_id && <Button small kind="ghost" busy={busy === 'status'} title={`${outcome === 'negotiating' ? '✓ ' : ''}Negotiating`} onPress={() => void setOutcome('negotiating')} />}
            {!q.site_id && <Button small kind="ghost" busy={busy === 'status'} title={`${outcome === 'lost' ? '✓ ' : ''}Lost`} onPress={() => void setOutcome('lost')} />}
            {!q.site_id && outcome !== 'no_news' && <Button small kind="ghost" title="No News" onPress={() => void setOutcome('returned')} />}
          </View>
        </Card>
      )}

      {/* Client and project: compact; Edit Details opens the form. */}
      {editing ? (
        <QuoteForm v={v} setV={(f) => setV(f)} isNew={false} people={people} others={(q.others ?? []).map((o) => ({ name: o.client_name }))} onOthers={() => setClientsPop(true)} busy={busy === 'save' ? 'save' : ''} onSave={() => void save()} onCancel={() => { setV(formOf(q)); setEditing(false); }} saveTitle="Save" />
      ) : (
        <Fold title="Client And Project" open={isOpen('details', !quoted)} onToggle={() => flip('details', !quoted)} right={<Text onPress={() => setEditing(true)} style={{ fontSize: 12.5, fontWeight: '600', color: base.blue, marginRight: 6 }}>✎ Edit</Text>}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {kv('Client', q.client_name)}
            {kv('Contact', [q.contact_name, q.contact_phone, q.contact_email].filter(Boolean).join(' · '))}
            {kv('Also Tendering', (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {(q.others ?? []).map((o) => (
                  <Pressable key={o.id} disabled={!!q.site_id} onPress={async () => {
                    const k = await chooseAction(o.client_name, [{ key: 'contact', label: o.contact_email ? `✉ Contact: ${o.contact_name ? `${o.contact_name}, ` : ''}${o.contact_email}` : '✉ Add The Contact To Chase' }, { key: 'off', label: 'Take Off This Quote' }]);
                    if (k === 'off') { if (await confirmAsk(`Take ${o.client_name} off this quote?`, 'Take Off', 'No')) { if (await removeQuoteClient(o.id)) refresh(); else toast('Could not save. Try again.'); } }
                    if (k === 'contact') {
                      const nm = await promptText(`Contact name at ${o.client_name}`, o.contact_name || ''); if (nm === null) return;
                      const em = await promptText(`${nm.trim() || 'Their'} email (the chaser goes here)`, o.contact_email || ''); if (em === null) return;
                      if (em.trim() && !EMAIL_OK.test(em.trim())) { toast('That email address doesn’t look right.'); return; }
                      if (await setQuoteClientContact(o.id, { contact_name: nm.trim() || null, contact_email: em.trim() || null })) refresh(); else toast('Could not save. Try again.');
                    }
                  }} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: base.line, backgroundColor: base.card }}>
                    <Text style={{ fontSize: 12.5, color: base.ink }}>{o.client_name}{o.contact_email ? ' ✉' : ''}{q.site_id ? '' : ' ⋮'}</Text>
                  </Pressable>
                ))}
                {!q.site_id && <Text onPress={() => setClientsPop(true)} style={{ fontSize: 12.5, fontWeight: '600', color: base.blue }}>+ Clients</Text>}
              </View>
            ))}
            {kv('Address', [q.address, q.postcode].filter(Boolean).join(', '))}
            {kv('Discipline', q.discipline || '')}
            {kv('Received', receivedOn(q) ? ukd(receivedOn(q)) : '')}
            {kv('Priced By', q.priced_by_name || '')}
            {!!q.notes && kv('Notes', q.notes)}
          </View>
        </Fold>
      )}

      {/* Documents: the OneDrive folder, read live. Only asks to make or link a folder when there isn't one. */}
      <Fold title="Documents" open={isOpen('docs', !quoted)} onToggle={() => flip('docs', !quoted)}>
        {q.folder_id ? <QuoteDocs folder={{ id: q.folder_id, driveId: q.folder_drive_id }} name={q.folder_name || 'Tender Folder'} /> : (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Muted style={{ textAlign: 'center' }}>No OneDrive folder yet. Make one from the New Enquiry template (1. Tender Documents, 2. Estimating, 3. Quotation).</Muted>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button small busy={busy === 'folder'} title="📁 Make The Folder" onPress={async () => { setBusy('folder'); const r = await makeQuoteFolder(q.id); setBusy(''); if (r.error) showAlert(r.error); refresh(); }} />
              <Button small kind="ghost" title="Link A Folder Already There" onPress={() => router.push({ pathname: '/pm/onedrive-pick', params: { target: 'quote', id: q.id } } as never)} />
            </View>
          </View>
        )}
      </Fold>

      {/* Submit Quotation, while it's being priced. */}
      {!quoted && !q.site_id && <View style={{ marginBottom: 12 }}><Button title="📨 Submit Quotation" onPress={() => setSubmit(true)} /></View>}

      {/* The email chaser, short (Andy, 11 Nov 2026): on or off, when it next goes (a date, or so many days), who it goes to. */}
      <Fold title="Email Chaser" open={isOpen('chase', true)} onToggle={() => flip('chase', true)} right={<Text style={{ fontSize: 12, color: base.slate, marginRight: 6 }}>{quoted ? chaseStatus(q, localISODate(new Date())) : q.chase_on ? 'On' : 'Off'}</Text>}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>Chase This Quote</Text>
          <YesNo label="Chase this quote" value={q.chase_on} onChange={async (on) => { if (await saveQuote(me, q.id, chasePatch(q, on, firstDays))) refresh(); else toast('Could not save. Try again.'); }} />
        </View>
        {q.chase_on && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: base.ink, width: 70 }}>Next Chase</Text>
              <DateBox value={q.next_chase_date || ''} onChange={async (d) => { if (await saveQuote(me, q.id, { next_chase_date: d || null })) refresh(); }} title="Next Chase" style={{ flex: 1, minWidth: 130, paddingVertical: 7 }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: base.ink, width: 70 }}>Or In</Text>
              {[7, 14, 30].map((n) => (
                <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Chase in ${n} days`} onPress={async () => { if (await saveQuote(me, q.id, { next_chase_date: plusDays(n) })) refresh(); }} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: base.card }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: base.ink }}>{n} Days</Text>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" accessibilityLabel="Chase in so many days" onPress={async () => { const n = Number(await promptText('Chase in how many days?', '21')); if (n > 0 && n < 400 && (await saveQuote(me, q.id, { next_chase_date: plusDays(Math.round(n)) }))) refresh(); }} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: base.card }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: base.ink }}>Other…</Text>
              </Pressable>
            </View>
          </>
        )}
        {!q.chase_on && quoted && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: base.ink, width: 70 }}>Chase Date</Text>
            <DateBox value={q.next_chase_date || ''} onChange={async (d) => { if (await saveQuote(me, q.id, { next_chase_date: d || null })) refresh(); }} title="Chase Date" style={{ flex: 1, minWidth: 130, paddingVertical: 7 }} />
            <Muted style={{ width: '100%', fontSize: 12 }}>For you to chase. Nothing is emailed while the chaser is off.</Muted>
          </View>
        )}
        <Muted style={{ fontSize: 12.5, marginBottom: 8 }}>
          {chaseTo.length ? `Goes to ${q.contact_name ? `${q.contact_name} at ` : ''}${q.client_name}${chaseTo.length > 1 ? ` and ${chaseTo.length - 1} more` : ''} (from the Directory).` : 'Add a contact email (Edit) to chase.'}
          {!settings?.chase_enabled ? ' Automatic chasing is off for the company (Settings).' : !quoted ? ' It starts once the quote is submitted.' : ''}
        </Muted>
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          <Button small kind="ghost" busy={busy === 'chase'} disabled={!chaseTo.length} title="✉ Chase Now" onPress={async () => {
            if (!(await confirmAsk(`Send a chaser email now to ${chaseTo.join(', ')}?`, 'Send', 'No'))) return;
            setBusy('chase'); const r = await chaseNow(q.id); setBusy('');
            if (r.error) showAlert(r.error); refresh();
          }} />
        </View>
        {(data?.chases ?? []).length > 0 && <Muted style={{ marginTop: 6, fontSize: 12, textAlign: 'center' }}>Chased {data?.chases.length}× · last {ukd(data?.chases[0].sent_at)}</Muted>}
      </Fold>

      {clientsPop && <ClientsPop have={[q.client_name, ...(q.others ?? []).map((o) => o.client_name)]} onClose={() => setClientsPop(false)} onDone={async (p) => { setClientsPop(false); for (const c of p) await addQuoteClient(me, q.id, c); if (p.length) refresh(); }} />}
      {submit && <SubmitQuote q={q} firstDays={firstDays} cc={settings?.cc_email ?? null} people={people.map((p) => ({ id: p.id, name: p.name }))} onClose={() => setSubmit(false)} onDone={() => { setSubmit(false); refresh(); }} />}
    </ScrollView>
  );
}
