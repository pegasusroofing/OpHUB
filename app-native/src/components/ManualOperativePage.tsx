// A hand-added operative's own page (9219zzg renderManualOperativeDetail, 4 Nov 2026): "Not signed up yet",
// their details (Edit), "Signed Up Already?" to link them to their login, OneDrive Sync, certificates and the
// Training Matrix — the same as a signed-up operative's page — and Remove.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { CertsPanel } from '@/components/CertsPanel';
import { OperativeOneDrive } from '@/components/OperativeOneDrive';
import { SelectBox } from '@/components/SelectBox';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Field, Muted, SectionTitle } from '@/components/ui';
import { EMAIL_OK, linkManualOperative, removeManualOperative, saveManualOperative, useManualOperative } from '@/data/manualOps';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { exportTrainingMatrixExcel, loadTrainingMatrix } from '@/lib/trainingMatrix';
import { base, page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export function ManualOperativePage({ uuid }: { uuid: string }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: m, isLoading } = useManualOperative(uuid);
  const { data: signedUp = [] } = useQuery({
    queryKey: ['signedUpOps', me?.org_id], enabled: !!me?.org_id,
    queryFn: async () => (((await db.from('profiles').select('id,name,email').eq('role', 'operative')).data as { id: string; name: string; email: string | null }[] | null) ?? [])
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
  });
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', email: '', trade: '' });
  const [linkTo, setLinkTo] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  // Already linked (they signed up with the same email): show their real page instead.
  useEffect(() => { if (m?.linked_profile_id) router.replace(`/pm/operatives/${m.linked_profile_id}` as never); }, [m?.linked_profile_id]);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!m) return <Muted style={{ padding: space.l }}>That operative is no longer on the list.</Muted>;
  if (m.linked_profile_id) return null;
  const opId = `m-${uuid}`;
  const refresh = () => { ['manualOp', 'manualOps', 'operativeList', 'trainingMatrix', 'signedUpOps'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const row = (label: string, v: string | null) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: base.line }}>
      <Muted style={{ fontWeight: '600' }}>{label}</Muted>
      <Text style={{ flexShrink: 1, fontWeight: '600', fontSize: 14.5, color: base.ink, textAlign: 'right' }}>{v || '—'}</Text>
    </View>
  );
  const save = async () => {
    const v = { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim().toLowerCase(), trade: f.trade.trim() };
    if (!v.name) { toast('Enter their name.'); return; }
    if (v.email && !EMAIL_OK.test(v.email)) { toast('Check the email address.'); return; }
    setBusy('save');
    const ok = await saveManualOperative(uuid, v);
    setBusy('');
    if (!ok) { toast('Could not save — try again.'); return; }
    setEditing(false); refresh();
  };
  const link = async () => {
    if (!linkTo) { toast('Choose who they signed up as.'); return; }
    const p = signedUp.find((x) => x.id === linkTo);
    if (!(await confirmAsk(`Link to ${p?.name || 'this operative'}?\n\nTheir certificates move onto that login, and the OneDrive folder and number are used if the login has none yet.`, 'Link'))) return;
    setBusy('link');
    const err = await linkManualOperative(uuid, linkTo);
    setBusy('');
    if (err) { toast(err); return; }
    refresh(); void qc.invalidateQueries({ queryKey: ['myCerts'] }); void qc.invalidateQueries({ queryKey: ['opOneDrive'] });
    router.replace(`/pm/operatives/${linkTo}` as never);
  };
  const remove = async () => {
    if (!(await confirmAsk(`Remove ${m.name} from OpHUB?\n\nTheir certificates here are removed too. Files in their OneDrive folder are not touched.`, 'Remove'))) return;
    if (!(await removeManualOperative(uuid))) { toast('Could not remove — try again.'); return; }
    refresh(); router.replace('/pm/operatives' as never);
  };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: m.name }} />
      <Card style={{ backgroundColor: '#FFF8EC', borderColor: '#F1D9A8' }}>
        <Text style={{ fontWeight: '600', color: '#8A5300' }}>Not Signed Up Yet</Text>
        <Muted>{m.email ? `When they sign up with ${m.email}, their certificates and OneDrive folder move onto their login by themselves.` : 'Add their email so they link up by themselves when they sign up, or link them below once they have.'}</Muted>
      </Card>

      <SectionTitle>Details</SectionTitle>
      <Card>
        {editing ? <>
          <Field label="Name" value={f.name} onChangeText={(t) => setF({ ...f, name: t })} autoCapitalize="words" />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 200 }}><Field label="Contact Number" value={f.phone} onChangeText={(t) => setF({ ...f, phone: t })} keyboardType="phone-pad" /></View>
            <View style={{ flex: 1, minWidth: 200 }}><Field label="Email" value={f.email} onChangeText={(t) => setF({ ...f, email: t })} keyboardType="email-address" autoCapitalize="none" autoComplete="off" /></View>
          </View>
          <Field label="Trade / Role" value={f.trade} onChangeText={(t) => setF({ ...f, trade: t })} autoCapitalize="words" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 2 }}><Button busy={busy === 'save'} title="Save" onPress={save} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setEditing(false)} /></View>
          </View>
        </> : <>
          {row('Name', m.name)}{row('Contact Number', m.phone)}{row('Email', m.email)}{row('Trade / Role', m.trade)}
          <View style={{ alignSelf: 'flex-start', marginTop: 10, width: 110 }}><Button kind="ghost" title="Edit" onPress={() => { setF({ name: m.name || '', phone: m.phone || '', email: m.email || '', trade: m.trade || '' }); setEditing(true); }} /></View>
        </>}
      </Card>

      {signedUp.length > 0 && <>
        <SectionTitle>Signed Up Already?</SectionTitle>
        <Card>
          <Muted style={{ marginBottom: 8 }}>Pick their login to move everything here onto it (certificates, OneDrive folder and number).</Muted>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <SelectBox style={{ flex: 2, minWidth: 0, marginBottom: 0 }} title="Link To" placeholder="Choose The Operative…" value={linkTo}
              options={signedUp.map((p) => [p.id, p.email ? `${p.name} — ${p.email}` : p.name] as [string, string])} onChange={setLinkTo} />
            <View style={{ flex: 1, minWidth: 0 }}><Button busy={busy === 'link'} title="Link" onPress={link} /></View>
          </View>
        </Card>
      </>}

      {me.org_id && <><SectionTitle>OneDrive Sync</SectionTitle><OperativeOneDrive orgId={me.org_id} opId={opId} /></>}
      <SectionTitle>Certificates</SectionTitle>
      <Muted style={{ marginBottom: 6 }}>This is {m.name}&apos;s record in the company Training Matrix.</Muted>
      <CertsPanel userId={uuid} manual="operative" />
      <Button kind="ghost" busy={busy === 'x'} title="📊 Export Full Training Matrix (Excel)" onPress={async () => {
        if (!me.org_id) return; setBusy('x');
        try { await exportTrainingMatrixExcel(await loadTrainingMatrix(me.org_id), org ?? null); } catch { toast('Could not make the Training Matrix — try again.'); }
        setBusy('');
      }} />
      <View style={{ height: space.m }} />
      <Button kind="ghost" title={`Remove ${m.name}`} onPress={remove} />
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}
