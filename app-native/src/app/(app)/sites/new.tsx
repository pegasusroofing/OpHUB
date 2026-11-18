// Add a Project (180 addSite): name, address, postcode, job number (or the next
// automatic one), client (typing suggests Directory clients and past clients; free text is fine),
// contact number and email, multi-site or repair contract, Active or Upcoming, and a start date.
// Client, address and start date are required (Andy). PMs / admins only.
// From a won quote (?quote=, Andy 11 Nov 2026): filled in from the quote; making it makes the OneDrive folders, moves the
// quote's folder across and marks the quote won, with a line saying what it's doing, then opens the new project.
import { setupJobPack, setupNewJobPack, useNewJobFolderDefault } from '@/data/jobPack';
import { linkToJob, syncTracker, useQuote, useQuoteSettings } from '@/data/quotes';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FinChip } from '@/components/FinNav';
import { DateField } from '@/components/DateField';
import { SuggestField } from '@/components/SuggestField';
import { showAlert } from '@/components/toast';
import { Button, Card, Check, Field, Muted } from '@/components/ui';
import { createSite, type NewSite } from '@/data/siteList';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { clientPortfolio } from '@/lib/rules/checkin';
import { clientContacts, contactLabel, contactSub } from '@/lib/rules/contacts';
import { jobNumberClash, jobNumberError } from '@/lib/rules/jobNumbers';
import { canCreateProjects, isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, space, useDesk } from '@/theme/theme';

// 030 applyTitleCase: capitals only at the start or after a space (Andy's House, not Andy'S House).
const titleCase = (t: string) => t.replace(/(^|\s)([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase());
const EMPTY: NewSite = { name: '', address: '', postcode: '', job_number: '', client_name: '', client_contact_name: '', client_phone: '', client_email: '', multi_site: false, repair_contract: false, status: 'active', start_date: '' };

export default function NewProject() {
  const desk = useDesk();
  const { me, org } = useAuth();
  const { quote: quoteId } = useLocalSearchParams<{ quote?: string }>();
  const { data: fromQuote } = useQuote(quoteId);
  const { data: qSettings } = useQuoteSettings(quoteId ? me?.org_id : null);
  const [step, setStep] = useState('');
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data: nums } = useQuery({ queryKey: ['orgNums', me?.org_id], enabled: !!me, queryFn: async () => (await supabase.from('organizations').select('auto_job_numbers,job_number_prefix,next_job_number').eq('id', me?.org_id as string).maybeSingle()).data as { auto_job_numbers?: boolean; job_number_prefix?: string | null; next_job_number?: number | null } | null });
  // Directory clients (Finance) — PMs without Finance just get past clients.
  const { data: dir = [] } = useQuery({ queryKey: ['dirClients', me?.org_id, 'contacts'], enabled: !!me, queryFn: async () => ((await supabase.from('fin_clients').select('id,name,email,phone,estimator_name,estimator_email,estimator_phone').eq('org_id', me?.org_id as string).order('name')).data as { id: string; name: string; email?: string | null; phone?: string | null; estimator_name?: string | null; estimator_email?: string | null; estimator_phone?: string | null }[] | null) ?? [] });
  // Contacts on the company's quotes too (18 Nov 2026), so a client's people are offered whichever way they came in.
  const { data: quoteContacts = [] } = useQuery({ queryKey: ['quoteContacts', me?.org_id], enabled: !!me, queryFn: async () => ((await supabase.from('quotes' as never).select('client_name,contact_name,contact_phone,contact_email').eq('org_id', me?.org_id as string)).data as { client_name?: string | null; contact_name?: string | null; contact_phone?: string | null; contact_email?: string | null }[] | null) ?? [] });
  const [d, setD] = useState<NewSite>(EMPTY);
  const qq = fromQuote?.quote ?? null;
  // Filled in from the quote once it's loaded.
  useEffect(() => { if (qq) setD((x) => ({ ...x, name: titleCase(qq.title), address: qq.address || x.address, postcode: (qq.postcode || x.postcode).toUpperCase(), client_name: qq.client_name, client_contact_name: qq.contact_name || '', client_phone: qq.contact_phone || '', client_email: qq.contact_email || '' })); }, [qq?.id, qq?.client_name]); // eslint-disable-line react-hooks/exhaustive-deps
  const [chosen, setChosen] = useState(false); // Active / Upcoming must be picked
  const [busy, setBusy] = useState(false);
  // Create OneDrive folder (Andy, 8 Nov 2026): ticked unless the company or the client says no; the tick wins once touched.
  const [folderTick, setFolderTick] = useState<boolean | null>(null);
  const fd = useNewJobFolderDefault(me?.org_id, d.client_name);
  const wantFolder = folderTick ?? fd.start;
  if (!me) return null;
  if (!canCreateProjects(me)) return <Muted style={{ padding: space.l }}>{isFullManager(me) ? 'Your role doesn’t create projects. Ask your admin (Admin › Roles).' : 'Project managers and admins only.'}</Muted>;
  const set = (p: Partial<NewSite>) => setD({ ...d, ...p });
  const auto = !!nums?.auto_job_numbers;
  const saved = clientPortfolio(sites);
  const clients = (() => {
    const by: Record<string, { key: string; label: string; sub?: string; phone: string; email: string }> = {};
    dir.forEach((c) => { const n = String(c.name || '').trim(); if (n) by[n.toLowerCase()] = { key: `d${c.id}`, label: n, phone: c.phone || '', email: c.email || '' }; });
    saved.forEach((c) => { const k = c.name.toLowerCase(), x = by[k]; if (x) { x.phone ||= c.phone; x.email ||= c.email; } else by[k] = { key: `p${k}`, label: c.name, phone: c.phone, email: c.email }; });
    return Object.values(by).map((c) => ({ ...c, sub: [c.phone, c.email].filter(Boolean).join(' · ') }));
  })();
  // The chosen client's contacts (Directory, past projects, quotes): one is filled in; several are offered under
  // Contact Name; or type one in (Andy, 18 Nov 2026).
  const contactsOf = (client: string) => clientContacts(client, dir, sites, quoteContacts);
  const contacts = contactsOf(d.client_name);
  const fillFor = (client: string) => { const c = contactsOf(client); return c.length === 1 && !d.client_contact_name && !d.client_phone && !d.client_email ? { client_contact_name: c[0].name, client_phone: c[0].phone, client_email: c[0].email } : {}; };
  const save = async () => {
    // What's missing in a pop-up, not a line at the foot the phone's keyboard covers (Andy, 18 Nov 2026: "on the offline
    // I can't create a new job"; it was waiting for Active or Upcoming).
    if (!d.name.trim()) { showAlert('Enter the site name.'); return; }
    if (!d.address.trim()) { showAlert('Enter the address.'); return; }
    if (!auto && !d.job_number.trim()) { showAlert('Enter a job number.'); return; }
    const clash = auto ? null : jobNumberClash(d.job_number, sites);
    if (clash) { showAlert(`Job number ${d.job_number.trim()} is already used on ${clash}. Use another number.`); return; }
    if (!d.client_name.trim()) { showAlert('Enter the client name.'); return; }
    if (!chosen) { showAlert('Choose whether the job is Active or Upcoming.'); return; }
    if (!d.start_date) { showAlert('Choose the start date.'); return; }
    if (d.client_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.client_email.trim())) { showAlert('Enter a valid client email address.'); return; }
    setBusy(true);
    const r = await createSite(me, { ...d, name: d.name.trim(), address: d.address.trim(), postcode: d.postcode.trim(), job_number: d.job_number.trim(), client_name: d.client_name.trim(), client_contact_name: (d.client_contact_name || '').trim(), client_phone: d.client_phone.trim(), client_email: d.client_email.trim(), start_date: d.start_date }, auto);
    if ('error' in r) { setBusy(false); showAlert(jobNumberError(r.error) || r.error); return; }
    if (qq) {
      // A won quote: the folders first, then the quote's folder moves into them and the quote is marked won.
      const notes: string[] = [];
      if (wantFolder) { setStep('Making the OneDrive folders…'); const p = await setupJobPack(r.id); if ('error' in p) notes.push(`No OneDrive folder: ${p.error}`); }
      setStep(qq.folder_id ? 'Moving the quote’s folder across…' : 'Marking the quote won…');
      const w = await linkToJob(me, qq, r.id, qSettings?.chase_first_days ?? 30);
      if ('error' in w) notes.push(w.error); else if (w.note) notes.push(w.note);
      setStep('');
      syncTracker(me.org_id as string, org);
      if (notes.length) showAlert(`The project is made. ${notes.join('. ')}.`);
    } else void setupNewJobPack(me.org_id, r.id, wantFolder);
    setBusy(false);
    await qc.invalidateQueries({ queryKey: ['sites'] });
    await qc.invalidateQueries({ queryKey: ['quotes'] });
    router.replace(`/sites/${r.id}` as never);
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: qq ? 'Convert To Project' : 'Add a Project' }} />
      {!!qq && <Muted style={{ marginBottom: 10 }}>Won: {qq.title}. Filled in from the quote. Check it, choose Active or Upcoming and the start date, then Create Project.</Muted>}
      <Card>
        <Field label="Site Name *" value={d.name} onChangeText={(v) => set({ name: titleCase(v) })} />
        <Field label="Address *" value={d.address} onChangeText={(v) => set({ address: titleCase(v) })} />
        <Field label="Postcode" value={d.postcode} onChangeText={(v) => set({ postcode: v.toUpperCase() })} autoCapitalize="characters" />
        <Field label="Job Number" value={auto ? `${nums?.job_number_prefix || ''}${nums?.next_job_number ?? ''} (given automatically)` : d.job_number} onChangeText={(v) => set({ job_number: v })} editable={!auto} />
        {/* Job numbers are one company setting, shared with Finance (Andy, 18 Nov 2026). */}
        {me.role === 'admin' && <Text accessibilityRole="link" onPress={() => router.push('/pm/admin/jobnumbers' as never)} style={{ fontSize: 12.5, color: base.blue, marginTop: -6, marginBottom: 10 }}>{auto ? 'Change The Job Numbers ›' : 'Number Jobs Automatically ›'}</Text>}
        {/* The client and its contact (Andy, 18 Nov 2026: "client full row, contact name, contact number split rows,
            contact email ... all pulls through from directory, if multiple contacts allow to choose, or manually type"):
            the client on its own row from the Directory and past clients; Contact Name and Contact Number half each, the
            name offering the client's contacts (picking one fills the number and email); the email under them. */}
        <View style={{ zIndex: 30 }}>
          <SuggestField label="Client Name *" value={d.client_name} onChangeText={(v) => { const name = titleCase(v), x = clients.find((y) => y.label.toLowerCase() === name.trim().toLowerCase()); set({ client_name: name, ...(x ? fillFor(x.label) : {}) }); }} placeholder={desk ? 'Start typing: clients from the Directory come up' : 'Start typing'} items={clients}
            onPick={(c) => set({ client_name: c.label, ...fillFor(c.label) })} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', zIndex: 20 }}>
          <View style={{ flex: 1, minWidth: 0 }}><SuggestField label="Contact Name" value={d.client_contact_name || ''} onChangeText={(v) => set({ client_contact_name: titleCase(v) })} placeholder={contacts.length ? 'Tap To Choose' : 'Type A Name'} showAllOnFocus
            items={contacts.map((c, i) => ({ key: String(i), label: contactLabel(c), sub: contactSub(c) }))}
            onPick={(s) => { const c = contacts[Number(s.key)]; if (c) set({ client_contact_name: c.name, client_phone: c.phone || d.client_phone, client_email: c.email || d.client_email }); }} /></View>
          <View style={{ flex: 1, minWidth: 0 }}><Field label="Contact Number" value={d.client_phone} onChangeText={(v) => set({ client_phone: v })} keyboardType="phone-pad" /></View>
        </View>
        <Field label="Contact Email" value={d.client_email} onChangeText={(v) => set({ client_email: v })} keyboardType="email-address" autoCapitalize="none" />
        {contacts.length > 1 && !d.client_contact_name && !d.client_phone && <Muted style={{ marginTop: -6, marginBottom: 10 }}>{contacts.length} contacts on file for {d.client_name.trim()}: tap Contact Name to choose one, or type one in.</Muted>}
        <Check label="Multi-site job (several addresses / plots)" value={d.multi_site} onChange={(x) => set({ multi_site: x, repair_contract: x ? false : d.repair_contract })} />
        <Check label="Repair / maintenance contract" value={d.repair_contract} onChange={(x) => set({ repair_contract: x, multi_site: x ? false : d.multi_site })} />
        {fd.shown && <Check label="Create OneDrive folder" value={wantFolder} onChange={setFolderTick} />}
        {fd.shown && fd.clientOff && folderTick === null && <Muted style={{ marginTop: -4, marginBottom: 8 }}>{d.client_name.trim()} is set to no OneDrive folders in the Directory. Tick it to make one for this job only.</Muted>}
        <Text style={{ fontWeight: '600', color: base.ink, marginTop: 10, marginBottom: 6 }}>Status *</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <FinChip on={chosen && d.status === 'active'} label="Active" onPress={() => { setChosen(true); set({ status: 'active' }); }} />
          <FinChip on={chosen && d.status === 'upcoming'} label="Upcoming" onPress={() => { setChosen(true); set({ status: 'upcoming' }); }} />
        </View>
        <DateField label="Start Date *" value={d.start_date} onChange={(v) => set({ start_date: v })} clearable={false} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <View style={{ flex: 2 }}><Button busy={busy} title={step || 'Create Project'} onPress={() => void save()} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => router.back()} /></View>
        </View>
      </Card>
    </ScrollView>
  );
}
