// HR › Employee Records › HR Access (Andy, 15 Nov 2026: "We need to be able to set security measures for the items just
// set up as it will need to link to the one drive too but I can't have everyone seeing everyone's contracts etc").
// - The HR Team: only they open everyone's folders. Until one is chosen, every company admin can; once chosen, other
//   admins can't, and only the HR team changes who's on it.
// - What line managers see of their people (never contracts, pay, right to work, bonus or disciplinary).
// - How often appraisals come round.
// - OneDrive: copy HR documents into a folder only the HR team can open in Microsoft 365, a folder per person inside.
// The database enforces all of this (hr_is_team, hr_lm_sees, hr_save_settings); this page only sets it.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { YesNo } from '@/components/OneDriveSettings';
import { SelectBox } from '@/components/SelectBox';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { addToHrTeam, removeFromHrTeam, saveHrSettings, useHrAccess, useHrTeam, useStaff } from '@/data/hrRecords';
import { useAuth } from '@/lib/auth';
import { base, page, space } from '@/theme/theme';

/** The parts a line manager can be allowed to see. */
export const LM_SECTIONS: [string, string, string][] = [
  ['performance', 'Performance', 'Appraisals, goals and feedback'],
  ['emergency', 'Emergency Contact', 'Who to ring if they’re hurt on site'],
  ['licences', 'Licences & Cards', 'Driving licence, DVLA check'],
  ['health', 'Health & Safety', 'Induction, health questionnaire, HAVS'],
  ['absence', 'Absence & Fit Notes', 'Return to work forms, fit notes'],
  ['history', 'Job History', 'Role changes and training (pay reviews are left out)'],
];

export default function HrAccess() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: acc } = useHrAccess(me?.org_id);
  const { data: teamRows = [] } = useHrTeam(me?.org_id);
  const { data: staff = [] } = useStaff();
  const [busy, setBusy] = useState('');
  const [lmLocal, setLmLocal] = useState<string[] | null>(null);
  // Back from choosing the OneDrive folder: look again.
  useFocusEffect(useCallback(() => { void qc.invalidateQueries({ queryKey: ['hrAccess'] }); }, [qc]));
  if (!me) return null;
  if (!acc) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!acc.team) return <Muted style={{ padding: space.l }}>Only the HR team can change who sees HR records.</Muted>;
  const refresh = () => ['hrAccess', 'hrTeam', 'hrFolder', 'hrOverview'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const nameOf = (id: string) => staff.find((p) => p.id === id)?.name || 'Someone';
  const team = teamRows.map((r) => r.user_id);
  const others = staff.filter((p) => !team.includes(p.id) && !['operative', 'driver'].includes(p.role));
  const add = async (id: string) => { if (await addToHrTeam(me, id)) refresh(); else toast('Could not add them — try again.'); };
  const remove = async (id: string) => {
    const last = team.length === 1;
    const msg = id === me.id
      ? (last ? 'Take yourself off? With no one on the HR team, every company admin can see everyone’s folders again.' : 'Take yourself off the HR team? You won’t see anyone else’s folder after this.')
      : `Take ${nameOf(id)} off the HR team? They won’t see anyone else’s folder after this.`;
    if (!(await confirmAsk(msg, 'Take Off'))) return;
    if (await removeFromHrTeam(me, id)) { refresh(); if (id === me.id && !last) router.back(); } else toast('Could not change it — try again.');
  };
  const lm = lmLocal ?? acc.lm_sections;
  const setLm = async (k: string, on: boolean) => {
    const next = on ? [...new Set([...lm, k])] : lm.filter((x) => x !== k);
    setLmLocal(next);
    if (await saveHrSettings({ lmSections: next })) refresh(); else { setLmLocal(null); toast('Could not save — try again.'); }
  };
  const row = (children: React.ReactNode, key: string) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>{children}</View>;
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'HR Access' }} />
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>The HR Team</Text>
        <Muted style={{ marginBottom: 8 }}>Only the HR team can open everyone&apos;s folders: contracts, payslips, right to work, bonus, disciplinary. Everyone else sees only their own (and, as a line manager, the parts allowed below). Only the HR team can change who&apos;s on it.</Muted>
        {!acc.team_set ? (
          <>
            <View style={{ backgroundColor: '#FFF4DE', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <Text style={{ color: '#B45309', fontWeight: '600' }}>No HR team yet: every company admin can see everyone&apos;s folders.</Text>
            </View>
            <Button busy={busy === 'start'} title="Start The HR Team With Me" onPress={async () => { setBusy('start'); await add(me.id); setBusy(''); }} />
          </>
        ) : (
          <>
            {team.map((id) => row(<>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: base.ink }}>{nameOf(id)}{id === me.id ? ' (You)' : ''}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Take ${nameOf(id)} off the HR team`} onPress={() => void remove(id)} hitSlop={8}><Text style={{ fontSize: 13, fontWeight: '600', color: base.slate }}>Take Off</Text></Pressable>
            </>, id))}
            {others.length > 0 && <View style={{ marginTop: 10 }}><SelectBox title="Add To The HR Team" placeholder="+ Add Someone" value={null} options={others.map((p) => [p.id, p.name] as [string, string])} onChange={(id) => void add(id)} /></View>}
          </>
        )}
      </Card>

      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>What Line Managers See</Text>
        <Muted style={{ marginBottom: 6 }}>For the people they line-manage (set on each person&apos;s Employment). Contracts, pay, right to work, bonus and disciplinary are never shown to them.</Muted>
        {LM_SECTIONS.map(([k, l, sub]) => row(<>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>{l}</Text><Muted>{sub}</Muted></View>
          <YesNo label={l} value={lm.includes(k)} onChange={(v) => void setLm(k, v)} />
        </>, k))}
      </Card>

      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>Appraisals</Text>
        <SelectBox label="Appraisals Come Round" value={String(acc.appraisal_months) as never} options={[['3', 'Every 3 Months'], ['6', 'Every 6 Months'], ['12', 'Every 12 Months']]}
          onChange={async (x) => { if (await saveHrSettings({ months: Number(x) })) refresh(); else toast('Could not save — try again.'); }} />
      </Card>

      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>OneDrive</Text>
        {/* Switched off (review, 15 Nov 2026): OpHUB reaches OneDrive through the one company Microsoft sign-in, and PMs and
            admins can browse that through OpHUB, so an HR folder there wouldn't be private. */}
        <Muted>Copying HR documents to OneDrive is switched off for now. OpHUB reaches OneDrive through the one company Microsoft sign-in, and every PM and admin can browse that through OpHUB, so an HR folder there wouldn&apos;t be private. It needs HR&apos;s own Microsoft sign-in first. Until then HR documents are kept only in OpHUB&apos;s private store.</Muted>
      </Card>
    </ScrollView>
  );
}
