// HR › Employee Records › HR Access.
// - Who Can Open HR (Andy, 15 Nov 2026: "I need it to be clear in the app who could have access to it pm / admin /
//   otherwise which is all set at the start by the admin and then there onwards"): All Company Admins Yes / No, All
//   Project Managers Yes / No, and named people of any role. Until it's saved every company admin can; once saved,
//   only the people chosen open everyone's folders (in OpHUB and in the HR folder in OneDrive), and only they change it.
//   The list of who that is, by name, is shown as it's chosen; every change is logged (who, when, what).
// - HR Folder In OneDrive (Andy: "I want to have hr linked to a specific folder in the OneDrive where access is
//   managed"): HR documents are copied there, a folder per person. OpHUB hides it from everyone not chosen above
//   (the OneDrive functions lock it); who OneDrive itself shares it with is shown here and managed in OneDrive.
// - What line managers see of their people (never contracts, pay, right to work, bonus or disciplinary).
// - How often appraisals come round.
// The database enforces all of this (hr_is_team, hr_save_team, hr_lm_sees, hr_save_settings); this page only sets it.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { showDate } from '@/components/DateField';
import { YesNo } from '@/components/OneDriveSettings';
import { SelectBox } from '@/components/SelectBox';
import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { copyHrToOneDrive, saveHrSettings, saveHrTeam, useHrAccess, useHrFolderAccess, useHrWho, useStaff, type HrWho } from '@/data/hrRecords';
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
const ROLE: Record<string, string> = { admin: 'Company Admin', pm: 'Project Manager', site_manager: 'Site Manager', operative: 'Operative', driver: 'Delivery Driver' };
const roleName = (r: string) => ROLE[r] || 'Operative';
const WHY: Record<string, string> = { named: 'Named', admin: 'All Company Admins', pm: 'All Project Managers' };
const AMBER = { backgroundColor: '#FFF4DE', borderRadius: 10, padding: 12, marginBottom: 10 } as const;

const line = (children: ReactNode, key: string) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>{children}</View>;
const title = (s: string) => <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>{s}</Text>;
const sub = (s: string) => <Text style={{ fontSize: 13, fontWeight: '700', color: base.slate, marginTop: 12, marginBottom: 2 }}>{s}</Text>;
const buttons = (children: ReactNode) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12 }}>{children}</View>;

/** The people who can open HR, by name, with why (read-only, for anyone not choosing). */
function WhoList({ who, meId }: { who: HrWho; meId: string }) {
  return (
    <>
      {who.people.map((p) => line(<>
        <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>{p.name}{p.id === meId ? ' (You)' : ''}</Text><Muted>{roleName(p.role)}</Muted></View>
        <Muted>{p.why.map((w) => WHY[w]).join(' · ')}</Muted>
      </>, p.id))}
      {line(<><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>Everyone Else</Text><Muted>Their own folder only (and, as a line manager, the parts HR allows)</Muted></View><Text style={{ fontWeight: '700', color: base.ink }}>No</Text></>, 'else')}
    </>
  );
}

export default function HrAccess() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: acc } = useHrAccess(me?.org_id);
  const { data: who } = useHrWho(me?.org_id);
  const { data: staff = [] } = useStaff();
  const fa = useHrFolderAccess(acc?.team ? acc.onedrive?.id : null);
  const [busy, setBusy] = useState('');
  const [lmLocal, setLmLocal] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<{ admins: boolean; pms: boolean; people: string[] } | null>(null);
  const [copyNote, setCopyNote] = useState('');
  // Back from choosing the OneDrive folder: look again.
  useFocusEffect(useCallback(() => { ['hrAccess', 'hrWho', 'hrFolderAccess'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); }, [qc]));
  if (!me) return null;
  if (!acc || !who) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!acc.team) {
    return (
      <ScrollView contentContainerStyle={page(720)}>
        <Stack.Screen options={{ title: 'HR Access' }} />
        <Card>
          {title('Who Can Open HR')}
          <Muted style={{ marginBottom: 6 }}>These people open everyone&apos;s HR folders (contracts, payslips, right to work, bonus, disciplinary), in OpHUB and in the HR folder in OneDrive. Only they can change who.</Muted>
          <WhoList who={who} meId={me.id} />
        </Card>
      </ScrollView>
    );
  }
  const refresh = () => ['hrAccess', 'hrWho', 'hrTeam', 'hrFolder', 'hrOverview', 'hrFolderAccess'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const saved = { admins: who.team_admins, pms: who.team_pms, people: who.named };
  const d = draft ?? saved;
  const changed = !!draft && (draft.admins !== saved.admins || draft.pms !== saved.pms || [...draft.people].sort().join() !== [...saved.people].sort().join());
  const chosen = staff.map((p) => ({ p, why: [d.people.includes(p.id) && 'Named', d.admins && p.role === 'admin' && 'All Company Admins', d.pms && p.role === 'pm' && 'All Project Managers'].filter(Boolean) as string[] })).filter((x) => x.why.length);
  const others = staff.filter((p) => !d.people.includes(p.id));
  const saveTeam = async () => {
    if (!chosen.length) { showAlert('Choose at least one person who can open HR.'); return; }
    const meIn = chosen.some((x) => x.p.id === me.id);
    if (!meIn && !(await confirmAsk('You’re not in this list. After saving you won’t be able to open everyone’s HR folders or change who can. Save anyway?', 'Yes, Save'))) return;
    setBusy('team');
    const w = await saveHrTeam(d);
    setBusy('');
    if (!w) { toast('Could not save — try again.'); return; }
    setDraft(null); refresh();
    if (!meIn) router.back();
  };
  const lm = lmLocal ?? acc.lm_sections;
  const setLm = async (k: string, on: boolean) => {
    const next = on ? [...new Set([...lm, k])] : lm.filter((x) => x !== k);
    setLmLocal(next);
    if (await saveHrSettings({ lmSections: next })) refresh(); else { setLmLocal(null); toast('Could not save — try again.'); }
  };
  const od = acc.onedrive;
  const fd = fa.data;
  const warn = (fd?.shared ?? []).some((s) => s.warn);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'HR Access' }} />
      <Card>
        {title('Who Can Open HR')}
        <Muted style={{ marginBottom: 8 }}>The people chosen here open everyone&apos;s HR folders (contracts, payslips, right to work, bonus, disciplinary), in OpHUB and in the HR folder in OneDrive. Everyone else sees only their own folder. Only the people chosen can change this.</Muted>
        {!who.set_up && <View style={AMBER}><Text style={{ color: '#B45309', fontWeight: '600' }}>Not set up yet: every company admin can open HR. Choose who below and press Save.</Text></View>}
        {line(<><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>All Company Admins</Text><Muted>Everyone with the Company Admin role, now and later</Muted></View>
          <YesNo label="All Company Admins" value={d.admins} onChange={(v) => setDraft({ ...d, admins: v })} /></>, 'adm')}
        {line(<><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>All Project Managers</Text><Muted>Everyone with the Project Manager role, now and later</Muted></View>
          <YesNo label="All Project Managers" value={d.pms} onChange={(v) => setDraft({ ...d, pms: v })} /></>, 'pms')}
        <View style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>Named People</Text>
          <Muted style={{ marginBottom: 6 }}>Anyone else, whatever their role: an office manager, a director</Muted>
          {d.people.map((id) => (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
              <Text style={{ flex: 1, fontSize: 14, color: base.ink }}>{staff.find((p) => p.id === id)?.name || 'Someone'}{id === me.id ? ' (You)' : ''}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Take ${staff.find((p) => p.id === id)?.name || 'them'} off`} hitSlop={8} onPress={() => setDraft({ ...d, people: d.people.filter((x) => x !== id) })}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: base.slate }}>✕ Take Off</Text>
              </Pressable>
            </View>
          ))}
          {others.length > 0 && <SelectBox title="Add Someone" placeholder="+ Add Someone" value={null} options={others.map((p) => [p.id, p.name] as [string, string])} onChange={(id) => setDraft({ ...d, people: [...d.people, id] })} />}
        </View>
        {sub(`So ${chosen.length === 1 ? 'This Person Can' : `These ${chosen.length} People Can`} Open HR`)}
        {chosen.map((x) => line(<>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>{x.p.name}{x.p.id === me.id ? ' (You)' : ''}</Text><Muted>{roleName(x.p.role)}</Muted></View>
          <Muted>{x.why.join(' · ')}</Muted>
        </>, x.p.id))}
        {!chosen.length && <Muted>No one yet. Choose at least one person.</Muted>}
        {line(<><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>Everyone Else</Text><Muted>Site managers, operatives, drivers and anyone not listed: their own folder only</Muted></View><Text style={{ fontWeight: '700', color: base.ink }}>No</Text></>, 'else')}
        {(changed || !who.set_up) && buttons(<>
          <Button busy={busy === 'team'} title={who.set_up ? 'Save Changes' : 'Save Who Can Open HR'} onPress={saveTeam} />
          {changed && <Button kind="ghost" title="Cancel" onPress={() => setDraft(null)} />}
        </>)}
        {who.set_up && who.set_up_at && <Muted style={{ marginTop: 10 }}>Set up {who.set_up_by ? `by ${who.set_up_by} ` : ''}on {showDate(who.set_up_at.slice(0, 10))}.</Muted>}
      </Card>

      <Card>
        {title('HR Folder In OneDrive')}
        {!od ? (
          <>
            <Muted>Choose the folder in OneDrive that HR documents are copied into, a folder per person inside. Use a new, empty folder, and in OneDrive share it only with the people above (Share › Manage Access).</Muted>
            {buttons(<Button title="Choose The HR Folder" onPress={() => router.push('/pm/onedrive-pick?target=hr' as never)} />)}
          </>
        ) : (
          <>
            <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink, marginBottom: 4 }}>📁 {fd?.folder?.name || od.name}</Text>
            {line(<><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>Copy HR Documents Here</Text><Muted>Each document added goes into Name › Folder › File</Muted></View>
              <YesNo label="Copy HR Documents Here" value={od.on !== false} onChange={async (v) => { if (await saveHrSettings({ onedrive: { ...od, on: v } })) refresh(); else toast('Could not save — try again.'); }} /></>, 'copy')}
            {buttons(<>
              <Button small kind="ghost" title="Change Folder" onPress={() => router.push('/pm/onedrive-pick?target=hr' as never)} />
              {od.on !== false && <Button small kind="ghost" busy={busy === 'copy'} title="Copy All Now" onPress={async () => {
                setBusy('copy'); const r = await copyHrToOneDrive({ all: true }); setBusy('');
                setCopyNote(r.error ? 'Could not copy — try again.' : `${r.data?.copied ?? 0} document${r.data?.copied === 1 ? '' : 's'} copied.`);
              }} />}
            </>)}
            {!!copyNote && <Muted style={{ textAlign: 'center', marginTop: 6 }}>{copyNote}</Muted>}

            {sub('Who Can Open This Folder')}
            {line(<><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>Through OpHUB</Text>
              <Muted>Only the {chosen.length === 1 ? 'person' : `${chosen.length} people`} above. OpHUB leaves it out of everyone else&apos;s folder lists and won&apos;t open or save into it for them.</Muted></View></>, 'ophub')}
            <View style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>In OneDrive Itself</Text>
              <Muted style={{ marginBottom: 4 }}>Who it&apos;s shared with in Microsoft 365. Change this in OneDrive.</Muted>
              {fa.isLoading ? <Muted>Checking OneDrive…</Muted> : fd?.error ? <Muted>{fd.error}</Muted> : (
                <>
                  {(fd?.shared ?? []).map((s, i) => (
                    <View key={`${s.who}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, color: base.ink }}>{s.warn ? '⚠ ' : ''}{s.who}</Text>
                        {(s.email || s.kind === 'group' || s.inherited) && <Muted>{[s.email, s.kind === 'group' ? 'A group: everyone in it' : '', s.inherited ? 'From the folder above' : ''].filter(Boolean).join(' · ')}</Muted>}
                      </View>
                      <Muted>{s.how}</Muted>
                    </View>
                  ))}
                  {fd?.sharedError && <Muted>{fd.sharedError}</Muted>}
                  {!!fd?.account && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                      <View style={{ flex: 1 }}><Text style={{ fontSize: 14, color: base.ink }}>{fd.account}</Text><Muted>OpHUB&apos;s company Microsoft sign-in: it&apos;s how OpHUB copies files in. Keep its password to the people above.</Muted></View>
                      <Muted>Can Open</Muted>
                    </View>
                  )}
                  {warn && <View style={[AMBER, { marginTop: 8, marginBottom: 0 }]}><Text style={{ color: '#B45309', fontWeight: '600' }}>⚠ A link or group can open this folder outside OpHUB. Check it in OneDrive: Manage Access.</Text></View>}
                </>
              )}
            </View>
            {!!fd?.folder?.webUrl && buttons(<Button kind="ghost" title="Manage Access In OneDrive ↗" onPress={() => void Linking.openURL(fd.folder?.webUrl as string)} />)}
            {/* Taking the folder off is rare and lifts the lock, so it's a quiet link at the foot, asked first. */}
            <Pressable accessibilityRole="button" accessibilityLabel="Remove The HR Folder" hitSlop={8} style={{ alignSelf: 'center', marginTop: 14 }} onPress={async () => {
              if (!(await confirmAsk('Remove the HR folder from OpHUB? OpHUB will stop hiding it from project managers and admins, and stop copying into it. The files already there stay in OneDrive.', 'Yes, Remove'))) return;
              if (await saveHrSettings({ clearOneDrive: true })) refresh(); else toast('Could not save — try again.');
            }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: base.slate }}>Remove The HR Folder</Text>
            </Pressable>
          </>
        )}
      </Card>

      <Card>
        {title('What Line Managers See')}
        <Muted style={{ marginBottom: 6 }}>For the people they line-manage (set on each person&apos;s Employment). Contracts, pay, right to work, bonus and disciplinary are never shown to them.</Muted>
        {LM_SECTIONS.map(([k, l, s]) => line(<>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>{l}</Text><Muted>{s}</Muted></View>
          <YesNo label={l} value={lm.includes(k)} onChange={(v) => void setLm(k, v)} />
        </>, k))}
      </Card>

      <Card>
        {title('Appraisals')}
        <SelectBox label="Appraisals Come Round" value={String(acc.appraisal_months) as never} options={[['3', 'Every 3 Months'], ['6', 'Every 6 Months'], ['12', 'Every 12 Months']]}
          onChange={async (x) => { if (await saveHrSettings({ months: Number(x) })) refresh(); else toast('Could not save — try again.'); }} />
      </Card>

      {who.log.length > 0 && (
        <Card>
          {title('Changes To HR Access')}
          {who.log.map((l, i) => line(<View style={{ flex: 1 }}><Muted>{showDate(l.at.slice(0, 10))}{l.by ? ` · ${l.by}` : ''}</Muted><Text style={{ fontSize: 13.5, color: base.ink }}>{l.what}</Text></View>, `${l.at}${i}`))}
        </Card>
      )}
    </ScrollView>
  );
}
