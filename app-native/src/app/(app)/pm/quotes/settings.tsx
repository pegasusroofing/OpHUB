// Quote settings (admins): the automatic chaser, its wording, and where enquiry folders live.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import { confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Field, Muted, SectionTitle } from '@/components/ui';
import { importTenderLog, saveQuoteSettings, useQuoteSettings } from '@/data/quotes';
import { useAuth } from '@/lib/auth';
import { base, page, space } from '@/theme/theme';

const SUBJECT = 'Our quotation for {project}';
const BODY = 'Hi {contact},\n\nI hope you are well. We sent you our quotation for {project} on {date}, and I wanted to check how things are progressing.\n\nIf you need anything else from us, or there is any feedback, please let me know.\n\nKind regards,\n{sender}\n{company}';

export default function QuoteSettingsPage() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuoteSettings(me?.org_id);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ first: '30', every: '14', max: '3', subject: SUBJECT, body: BODY, open: '', template: '', archive: '', won: '1. Contract & Commercial/2. Estimating' });
  useEffect(() => {
    if (data) setV({ first: String(data.chase_first_days), every: String(data.chase_every_days), max: String(data.chase_max), subject: data.chase_subject || SUBJECT, body: data.chase_body || BODY, open: data.open_path || '', template: data.template_path || '', archive: data.archive_path || '', won: data.won_folder || '1. Contract & Commercial/2. Estimating' });
  }, [data]);
  if (!me?.org_id) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Admins only.</Muted>;
  const orgId = me.org_id;
  const set = (k: keyof typeof v) => (t: string) => setV((f) => ({ ...f, [k]: t }));
  // Once only, to bring the years of quotes across. After that everything is done in the app.
  const bringIn = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const names = await promptText('Who prices quotes? Put the names as they’re written in the Feedback column, split by commas. Those go in Priced by.', 'Andy C, Neil');
    if (names === null) return;
    setBusy(true);
    try {
      const out = await importTenderLog(me, new Uint8Array(await (await fetch(r.assets[0].uri)).arrayBuffer()), names.split(',').map((x) => x.trim()).filter(Boolean));
      showAlert('error' in out ? out.error : `${out.added} quotes brought in. ${out.already} were already here. ${out.skipped} rows skipped as they had no client or project. The chaser is off on all of them.`);
      void qc.invalidateQueries({ queryKey: ['quotes', orgId] });
    } catch { toast('Could not read that file.'); } finally { setBusy(false); }
  };
  const fields = () => ({ org_id: orgId, chase_first_days: Number(v.first) || 30, chase_every_days: Number(v.every) || 14, chase_max: Number(v.max) || 3, chase_subject: v.subject, chase_body: v.body, open_path: v.open.trim() || null, template_path: v.template.trim() || null, archive_path: v.archive.trim() || null, won_folder: v.won.trim() || null });
  const save = async (extra: { chase_enabled?: boolean } = {}) => {
    const ok = await saveQuoteSettings({ ...fields(), ...extra });
    toast(ok ? 'Saved' : 'Could not save. Try again.');
    void qc.invalidateQueries({ queryKey: ['quoteSettings', orgId] });
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Quote settings' }} />
      <Card>
        <SectionTitle>Automatic chaser</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>Send chasers automatically</Text>
          <Switch accessibilityLabel="Send chasers automatically" value={!!data?.chase_enabled} onValueChange={async (on) => {
            if (on && !(await confirmAsk('This emails your clients by itself, each weekday morning, for returned quotes with the chaser on. Imported quotes stay off. Switch on?', 'Switch on'))) return;
            await save({ chase_enabled: on });
          }} />
        </View>
        <Muted style={{ marginBottom: 10 }}>Only returned quotes are chased. Tender stage, won and lost quotes stop.</Muted>
        <Field label="First chase, days after return" value={v.first} onChangeText={set('first')} keyboardType="number-pad" />
        <Field label="Then every, days" value={v.every} onChangeText={set('every')} keyboardType="number-pad" />
        <Field label="Most chasers per quote" value={v.max} onChangeText={set('max')} keyboardType="number-pad" />
        <Field label="Email subject" value={v.subject} onChangeText={set('subject')} />
        <Field label="Email wording" value={v.body} onChangeText={set('body')} multiline />
        <Muted>The app fills in {'{contact}'}, {'{client}'}, {'{project}'}, {'{date}'}, {'{sender}'} and {'{company}'}.</Muted>
      </Card>
      <Card>
        <SectionTitle>OneDrive folders</SectionTitle>
        <Field label="Open tenders go in" value={v.open} onChangeText={set('open')} placeholder="RTB Roofing Ltd/Estimating/Open Tenders" />
        <Field label="New enquiry template" value={v.template} onChangeText={set('template')} placeholder="RTB Roofing Ltd/Estimating/Open Tenders/1. New Enquiry - Template" />
        <Field label="Finished quotes go in ({year} is the year it finished)" value={v.archive} onChangeText={set('archive')} placeholder="RTB Roofing Ltd/Estimating/- Estimating {year}" />
        <Field label="When won, documents go in this folder of the job" value={v.won} onChangeText={set('won')} />
      </Card>
      <Button title="Save" onPress={() => void save()} />
      <Card style={{ marginTop: 14 }}>
        <SectionTitle>Old quotes</SectionTitle>
        <Muted style={{ marginBottom: 8 }}>Brings your old Tender Tracker’s history in, once. You don’t need Excel after that.</Muted>
        <Button kind="ghost" busy={busy} title="Bring in the old tracker" onPress={() => void bringIn()} />
      </Card>
    </ScrollView>
  );
}
