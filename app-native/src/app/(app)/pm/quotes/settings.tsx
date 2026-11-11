// Quote Settings (admins), as tabs (Andy, 11 Nov 2026): Chaser (the automatic chaser and its wording); Sending (the preset
// copy-to address on Submit Quotation); Folders (where tenders live in OneDrive: changed on the OneDrive page in Admin);
// Auto Export (reports emailed and / or saved in OneDrive on a schedule); Old Quotes (bring the old tracker in, once).
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinTabs } from '@/components/FinNav';
import { YesNo } from '@/components/OneDriveSettings';
import { Pop } from '@/components/Pop';
import { QBox, QPick } from '@/components/QuoteForm';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { importTenderLog, saveQuoteSettings, useQuoteSettings, writeTracker } from '@/data/quotes';
import { useAuth } from '@/lib/auth';
import { EVERY, everyText, REPORTS, reportLabel, type AutoExport, type ReportKey } from '@/lib/rules/quoteReports';
import { base, page, space } from '@/theme/theme';

const SUBJECT = 'Our quotation for {project}';
const BODY = 'Hi {contact},\n\nI hope you are well. We sent you our quotation for {project} on {date}, and I wanted to check how things are progressing.\n\nIf you need anything else from us, or there is any feedback, please let me know.\n\nKind regards,\n{sender}\n{company}';
const EMAIL_OK = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
type Tab = 'chaser' | 'sending' | 'folders' | 'auto' | 'old';
const WEEKDAYS: [string, string][] = [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday']];

function AutoPop({ start, onSave, onClose }: { start: AutoExport; onSave: (a: AutoExport) => void; onClose: () => void }) {
  const toast = useToast();
  const [a, setA] = useState<AutoExport>(start);
  return (
    <Pop title="Auto Export" onClose={onClose} footer={(
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
        <Button title="Save" onPress={() => {
          const to = String(a.to || '').split(/[,;\s]+/).filter(Boolean);
          if (to.some((e) => !EMAIL_OK.test(e))) { toast('One of those email addresses doesn’t look right.'); return; }
          if (!to.length && !a.onedrive) { toast('Send it to someone, or save it in OneDrive (or both).'); return; }
          onSave({ ...a, to: to.join(', ') });
        }} />
      </View>
    )}>
      <QPick label="Report" value={reportLabel(a.report)} onPress={async () => { const k = await chooseAction('Report', REPORTS.map(([key, label]) => ({ key, label }))); if (k) setA({ ...a, report: k as ReportKey }); }} />
      <QPick label="How Often" value={EVERY.find(([k]) => k === a.every)?.[1] || ''} onPress={async () => { const k = await chooseAction('How Often', EVERY.map(([key, label]) => ({ key, label }))); if (k) setA({ ...a, every: k as AutoExport['every'], day: k === 'weekly' ? 1 : k === 'monthly' ? 1 : undefined }); }} />
      {a.every === 'weekly' && <QPick label="On" value={WEEKDAYS.find(([k]) => Number(k) === (a.day ?? 1))?.[1] || ''} onPress={async () => { const k = await chooseAction('On', WEEKDAYS.map(([key, label]) => ({ key, label }))); if (k) setA({ ...a, day: Number(k) }); }} />}
      {a.every === 'monthly' && <QBox label="Day Of The Month (1 To 28)" value={String(a.day ?? 1)} keyboardType="number-pad" onChangeText={(t) => setA({ ...a, day: Math.max(1, Math.min(28, Number(t.replace(/\D/g, '')) || 1)) })} />}
      <QBox label="Email It To (Split With Commas)" value={a.to || ''} keyboardType="email-address" autoCapitalize="none" onChangeText={(t) => setA({ ...a, to: t })} placeholder="name@yourcompany.co.uk" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.m }}>
        <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>Save It In OneDrive Too (Open Tenders › Reports)?</Text>
        <YesNo label="Save it in OneDrive" value={!!a.onedrive} onChange={(v) => setA({ ...a, onedrive: v })} />
      </View>
      <Muted style={{ fontSize: 12 }}>It goes as an Excel file, first thing in the morning on the days it’s due.</Muted>
    </Pop>
  );
}

export default function QuoteSettingsPage() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuoteSettings(me?.org_id);
  const [tab, setTab] = useState<Tab>('chaser');
  const [busy, setBusy] = useState('');
  const [edit, setEdit] = useState<AutoExport | null>(null);
  const [v, setV] = useState({ first: '30', every: '14', max: '3', subject: SUBJECT, body: BODY, cc: '' });
  useEffect(() => {
    if (data) setV({ first: String(data.chase_first_days), every: String(data.chase_every_days), max: String(data.chase_max), subject: data.chase_subject || SUBJECT, body: data.chase_body || BODY, cc: data.cc_email || '' });
  }, [data]);
  if (!me?.org_id) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Admins only.</Muted>;
  const orgId = me.org_id;
  const set = (k: keyof typeof v) => (t: string) => setV((f) => ({ ...f, [k]: t }));
  const autos: AutoExport[] = data?.auto_exports ?? [];
  const put = async (patch: Record<string, unknown>) => {
    const ok = await saveQuoteSettings({ org_id: orgId, ...patch } as never);
    if (!ok) toast('Could not save. Try again.');
    void qc.invalidateQueries({ queryKey: ['quoteSettings', orgId] });
    return ok;
  };
  const saveChaser = () => put({ chase_first_days: Number(v.first) || 30, chase_every_days: Number(v.every) || 14, chase_max: Number(v.max) || 3, chase_subject: v.subject, chase_body: v.body });
  // Once only, to bring the years of quotes across. After that everything is done in the app.
  const bringIn = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const names = await promptText('Who prices quotes? Put the names as they’re written in the Feedback column, split by commas. Those go in Priced By.', 'Andy C, Neil');
    if (names === null) return;
    setBusy('old');
    try {
      const out = await importTenderLog(me, new Uint8Array(await (await fetch(r.assets[0].uri)).arrayBuffer()), names.split(',').map((x) => x.trim()).filter(Boolean));
      showAlert('error' in out ? out.error : `${out.added} quotes brought in. ${out.already} were already here. ${out.skipped} rows skipped as they had no client or project. The chaser is off on all of them.`);
      void qc.invalidateQueries({ queryKey: ['quotes', orgId] });
    } catch { toast('Could not read that file.'); } finally { setBusy(''); }
  };
  const path = (p: string | null | undefined) => (p ? p.split('/').join(' › ') : 'Not Set');
  const sf = { awaiting: '- Awaiting More Information', checking: '- Ready For Checking', ...(data?.status_folders || {}) } as Record<string, string>;

  return (
    <ScrollView contentContainerStyle={page(760)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Quote Settings' }} />
      <FinTabs items={[['chaser', 'Chaser'], ['sending', 'Sending'], ['folders', 'Folders'], ['auto', 'Auto Export', autos.length || undefined], ['old', 'Old Quotes']]} value={tab} onChange={(k) => setTab(k as Tab)} />
      {tab === 'chaser' && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>Send Chasers Automatically?</Text>
            <YesNo label="Send chasers automatically" value={!!data?.chase_enabled} onChange={async (on) => {
              if (on && !(await confirmAsk('This emails your clients by itself, each weekday morning, for quoted jobs with the chaser on. Imported quotes stay off. Switch on?', 'Yes', 'No'))) return;
              await put({ chase_enabled: on });
            }} />
          </View>
          <Muted style={{ marginBottom: 10 }}>Only quoted jobs with No News are chased. Negotiating, won and lost ones stop.</Muted>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><QBox label="First (Days)" value={v.first} onChangeText={set('first')} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><QBox label="Every (Days)" value={v.every} onChangeText={set('every')} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><QBox label="Most Sent" value={v.max} onChangeText={set('max')} keyboardType="number-pad" /></View>
          </View>
          <Muted style={{ marginTop: -6, marginBottom: 10, fontSize: 12 }}>The first chaser goes so many days after it’s quoted, then every so many days, up to the most sent.</Muted>
          <QBox label="Email Subject" value={v.subject} onChangeText={set('subject')} />
          <QBox label="Email Wording" value={v.body} onChangeText={set('body')} multiline tall />
          <Muted style={{ marginBottom: 10 }}>The app fills in {'{contact}'}, {'{client}'}, {'{project}'}, {'{date}'}, {'{sender}'} and {'{company}'}.</Muted>
          <View style={{ alignItems: 'center' }}><Button title="Save" onPress={() => void saveChaser()} /></View>
        </Card>
      )}
      {tab === 'sending' && (
        <Card>
          <SectionTitle>Submit Quotation</SectionTitle>
          <QBox label="Always Copy In (CC)" value={v.cc} onChangeText={set('cc')} keyboardType="email-address" autoCapitalize="none" placeholder="estimating@yourcompany.co.uk" />
          <Muted style={{ marginBottom: 10 }}>Every quote sent from the app copies this address in, unless it’s switched off on that email. The person sending is always copied in too.</Muted>
          <View style={{ alignItems: 'center' }}><Button title="Save" onPress={async () => { const cc = v.cc.trim(); if (cc && !EMAIL_OK.test(cc)) { toast('That email address doesn’t look right.'); return; } await put({ cc_email: cc || null }); }} /></View>
        </Card>
      )}
      {tab === 'folders' && (
        <Card>
          <SectionTitle>Where Tenders Live In OneDrive</SectionTitle>
          {[['Open Tenders', path(data?.open_path)], ['New Enquiry Template', path(data?.template_path)], ['Awaiting Information', sf.awaiting], ['Ready For Checking', sf.checking], ['Finished Quotes', path(data?.archive_path)], ['When Won', `The project’s ${path(data?.won_folder || '1. Contract & Commercial/2. Estimating')}`]].map(([l, p]) => (
            <View key={l} style={{ flexDirection: 'row', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
              <Text style={{ width: 150, fontSize: 13, fontWeight: '600', color: base.ink }}>{l}</Text>
              <Text style={{ flex: 1, fontSize: 13, color: base.slate }}>{p}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: base.ink }}>Keep A Tender Tracker Spreadsheet Up To Date In Open Tenders?</Text>
            <YesNo label="Keep the tender tracker up to date" value={data?.tracker_on !== false} onChange={(on) => void put({ tracker_on: on })} />
          </View>
          <Muted style={{ marginBottom: 10 }}>“{data?.tracker_name || 'Tender Tracker - OpHUB.xlsx'}” is saved again whenever a quote changes. Your old Tender Tracker.xlsm isn’t touched.</Muted>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button small title="Change In Admin › OneDrive" onPress={() => router.push('/pm/admin/onedrive' as never)} />
            <Button small kind="ghost" busy={busy === 'tracker'} title="Update The Tracker Now" onPress={async () => { setBusy('tracker'); const ok = await writeTracker(orgId, org); setBusy(''); if (!ok) showAlert('The tracker couldn’t be saved. Check OneDrive is connected and the Open Tenders folder is set.'); }} />
          </View>
        </Card>
      )}
      {tab === 'auto' && (
        <Card>
          <SectionTitle>Auto Export</SectionTitle>
          <Muted style={{ marginBottom: 8 }}>Reports that go out by themselves: emailed as Excel, and / or saved in Open Tenders › Reports.</Muted>
          {autos.length ? autos.map((a) => (
            <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={reportLabel(a.report)} onPress={() => setEdit(a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: base.ink }}>{reportLabel(a.report)}</Text>
                <Text style={{ fontSize: 12, color: base.slate }}>{everyText(a)} · {[a.to, a.onedrive ? 'OneDrive' : ''].filter(Boolean).join(' · ')}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${reportLabel(a.report)}`} hitSlop={8} onPress={async () => { if (await confirmAsk(`Stop the ${reportLabel(a.report)} auto export?`, 'Yes', 'No')) await put({ auto_exports: autos.filter((x) => x.id !== a.id) }); }}>
                <Text style={{ color: base.slate, fontSize: 15 }}>✕</Text>
              </Pressable>
            </Pressable>
          )) : <Muted style={{ marginBottom: 8 }}>None yet.</Muted>}
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <Button title="+ Add An Auto Export" onPress={() => setEdit({ id: `a${Date.now()}`, report: 'live', every: 'weekly', day: 1, format: 'xlsx', to: me.email || '', onedrive: false })} />
          </View>
        </Card>
      )}
      {tab === 'old' && (
        <Card>
          <SectionTitle>Old Quotes</SectionTitle>
          <Muted style={{ marginBottom: 8 }}>Brings your old Tender Tracker’s history in, once. You don’t need Excel after that.</Muted>
          <View style={{ alignItems: 'center' }}><Button kind="ghost" busy={busy === 'old'} title="Bring In The Old Tracker" onPress={() => void bringIn()} /></View>
        </Card>
      )}
      {edit && <AutoPop start={edit} onClose={() => setEdit(null)} onSave={async (a) => { const next = autos.some((x) => x.id === a.id) ? autos.map((x) => (x.id === a.id ? a : x)) : [...autos, a]; if (await put({ auto_exports: next })) setEdit(null); }} />}
    </ScrollView>
  );
}
