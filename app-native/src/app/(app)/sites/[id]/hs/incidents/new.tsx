// New Accident / Incident / Near Miss report (690 renderIncidentFill): the paper
// form's questions, photos of the area and of any damage, tick the job's operatives,
// then Sign & Submit with your adopted signature.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { chooseAction, showAlert, useToast } from '@/components/toast';
import { Button, Muted, SectionTitle } from '@/components/ui';
import { incidentProblem, submitIncident, uploadIncidentPhoto, type IncidentDraft } from '@/data/incidents';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { localISODate } from '@/lib/rules/driver';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 12 };
type K = keyof IncidentDraft;

export default function NewIncident() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: ops } = useQuery({
    queryKey: ['incidentOps', id],
    queryFn: async () => {
      const [a, p] = await Promise.all([db.from('site_assignments').select('user_id').eq('site_id', id), db.from('profiles').select('id,name').eq('role', 'operative').order('name')]);
      const on = new Set(((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
      return ((p.data as { id: string; name: string }[] | null) ?? []).filter((x) => on.has(x.id));
    },
  });
  const [d, setD] = useState<IncidentDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const v: IncidentDraft = d ?? {
    type: '', siteAddress: `${site.name}${fullSiteAddress(site) ? `, ${fullSiteAddress(site)}` : ''}`, location: '', date: localISODate(new Date()), operatives: '', filedBy: me.name || '',
    detail: '', areaPhotos: [], dateTime: '', reportedDateTime: '', reportedTo: '', witnesses: '', witnessNames: '', medical: '', medicalDetail: '', injury: '', injuryTo: '',
    injuryDescription: '', injuryFurther: '', damage: '', damageSeverity: '', damagePhotos: [], damageDescription: '', factors: '', corrective: '', potential: '',
    potentialOutcome: '', reoccurrence: '', riddor: '',
  };
  const set = (k: K, val: string | string[]) => setD({ ...v, [k]: val });
  const text = (k: K, label: string, opts: { multi?: boolean; ph?: string } = {}) => (
    <View>
      <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 4 }}>{label}</Text>
      <TextInput value={v[k] as string} onChangeText={(t) => set(k, t)} multiline={opts.multi} placeholder={opts.ph} style={[box, opts.multi ? { minHeight: 70 } : {}]} />
    </View>
  );
  const toggle = (k: K, label: string, options: [string, string][]) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {options.map(([val, l]) => (
          <Pressable key={val} onPress={() => set(k, val)} style={{ flex: 1, minWidth: 70, alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: v[k] === val ? base.ink : base.line, backgroundColor: v[k] === val ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: v[k] === val ? '#fff' : base.ink }}>{l}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  const photos = (k: 'areaPhotos' | 'damagePhotos', label: string) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {v[k].map((p, i) => <Pressable key={p} onPress={() => set(k, v[k].filter((_, j) => j !== i))}><StorageImage bucket="incident-photos" path={p} style={{ width: 60, height: 60, borderRadius: 6 }} /></Pressable>)}
      </View>
      <Button kind="ghost" busy={busy === k} title="📷 Add Photo(s)" onPress={async () => {
        const src = await chooseAction('Add photo', [{ key: 'camera', label: '📷 Take a photo' }, { key: 'library', label: '🖼 Choose from library' }]);
        if (!src) return;
        const p = await pickPhotos(src as 'camera' | 'library', true);
        if ('error' in p) { showAlert(p.error); return; }
        setBusy(k);
        const paths: string[] = []; let failed = 0;
        for (const x of p) { const path = await uploadIncidentPhoto(id, x); if (path) paths.push(path); else failed++; }
        setBusy(null);
        setD((cur) => { const c = cur ?? v; return { ...c, [k]: [...c[k], ...paths] }; });
        if (failed) toast(`${failed} photo${failed > 1 ? 's' : ''} failed to upload — check your connection and try again.`);
      }} />
    </View>
  );
  const ticked = new Set(v.operatives.split(',').map((x) => x.trim()).filter(Boolean));

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New Report' }} />
      <Muted style={{ marginBottom: 14 }}>Fill in what you can — the more detail the better. Fields marked * are required.</Muted>
      {toggle('type', '* What type of report is this?', [['incident', 'Incident'], ['accident', 'Accident'], ['near_miss', 'Near Miss']])}
      {text('siteAddress', 'Site of accident / incident / near miss')}
      {text('location', 'Location of incident')}
      {text('date', 'Date of incident (YYYY-MM-DD)')}
      <Text style={{ fontWeight: '700', color: base.ink, marginBottom: 6 }}>Operatives involved</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {(ops ?? []).map((o) => (
          <Pressable key={o.id} onPress={() => { const n = new Set(ticked); if (n.has(o.name)) n.delete(o.name); else n.add(o.name); set('operatives', [...n].join(', ')); }}
            style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: ticked.has(o.name) ? base.ink : base.line }}>
            <Text style={{ color: base.ink }}>{ticked.has(o.name) ? '☑' : '☐'} {o.name}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={v.operatives} onChangeText={(t) => set('operatives', t)} placeholder="Tick above, or type names not assigned to this site" style={box} />
      {text('filedBy', 'Form filed by')}
      {text('detail', '* Detail of the incident', { multi: true })}
      {photos('areaPhotos', 'Photo of area of incident')}
      {text('dateTime', 'Date and time of incident', { ph: '2026-10-28 14:30' })}
      {text('reportedDateTime', 'Date and time incident was reported', { ph: '2026-10-28 15:00' })}
      {text('reportedTo', 'To whom was the incident reported?')}
      {toggle('witnesses', 'Was there any witness(es)?', [['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']])}
      {v.witnesses === 'yes' && text('witnessNames', 'Witness name(s)')}
      {toggle('medical', '* Operative requires further medical treatment', [['yes', 'Yes'], ['no', 'No']])}
      {v.medical === 'yes' && text('medicalDetail', 'What medical treatment is required/advised?', { multi: true })}
      <SectionTitle>Details of injury, if applicable</SectionTitle>
      {toggle('injury', '* Any injuries occurred?', [['yes', 'Yes'], ['no', 'No']])}
      {v.injury === 'yes' && (
        <>
          {text('injuryTo', 'Injury to who?')}
          {text('injuryDescription', 'Description of injury', { multi: true })}
          {toggle('injuryFurther', 'Further medical treatment required', [['yes', 'Yes'], ['no', 'No']])}
        </>
      )}
      <SectionTitle>Details of damage</SectionTitle>
      {toggle('damage', 'Did any damage occur to any property or plant?', [['yes', 'Yes'], ['no', 'No']])}
      {v.damage === 'yes' && (
        <>
          {toggle('damageSeverity', 'What damage occurred?', [['minor', 'Minor'], ['serious', 'Serious'], ['major', 'Major']])}
          {photos('damagePhotos', 'Photo of damage')}
          {text('damageDescription', 'Detailed description of how the incident happened, and what happened', { multi: true })}
        </>
      )}
      <SectionTitle>Analysis</SectionTitle>
      {text('factors', 'Any contributing factors to incident?', { multi: true })}
      {text('corrective', 'Corrective action (include detail of action and person(s) responsible)', { multi: true })}
      {toggle('potential', 'What was the potential for severity?', [['minor', 'Minor'], ['serious', 'Serious'], ['major', 'Major']])}
      {text('potentialOutcome', 'What could have potentially happened?', { multi: true })}
      {toggle('reoccurrence', 'What is the probability of reoccurrence?', [['remote', 'Remote'], ['improbable', 'Improbable'], ['probable', 'Probable']])}
      {toggle('riddor', '* Riddor reportable?', [['yes', 'Yes'], ['no', 'No']])}
      <Muted style={{ marginBottom: 8 }}>Submitting signs this report with your adopted signature — the same one used on RAMS and Toolbox Talks.</Muted>
      <Button busy={busy === 'submit'} title="Sign & Submit Report" onPress={async () => {
        const p = incidentProblem(v);
        if (p) { toast(p); return; }
        if (!(me as { signature_path?: string | null }).signature_path) { toast("Adopt your signature first — one tap and it's used everywhere."); router.push('/signature'); return; }
        setBusy('submit'); const r = await submitIncident(me, id, v); setBusy(null);
        if (!r.id) { toast(r.error || 'Could not submit.'); return; }
        toast('Report submitted'); void qc.invalidateQueries({ queryKey: ['incidents', id] });
        router.replace(`/sites/${id}/hs/incidents/${r.id}` as never);
      }} />
    </ScrollView>
  );
}
