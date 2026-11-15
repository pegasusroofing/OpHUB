// HR › Employee Records › HR Access.
// Andy, 15 Nov 2026: "each pm etc has hr to book holiday, has the folders we created, but only they can see their
// folder, and then the admin sets who else can see it ... I can also allow pm 1 to see estimator 1 and pm 3 (as that's
// their team, but I don't want to group by team just individual)".
// - Who Sees Everyone's Folders: every company admin to start (Yes / No), plus anyone named. They see every folder in
//   full and set who else sees what. Only they change it; leaving yourself out asks first.
// - Who Can See Whose Folder: everyone sees their own; person by person, HR chooses whose folders someone else may see
//   too (hr_viewers). They see the parts set under What Others See, like a line manager.
// - Every change is logged (who, when, what).
// - HR Folder In OneDrive (Andy: "I want to have hr linked to a specific folder in the OneDrive where access is
//   managed"): HR documents are copied there, a folder per person. OpHUB hides it from everyone not chosen above
//   (the OneDrive functions lock it); who OneDrive itself shares it with is shown here and managed in OneDrive.
// - What Others See: the parts someone allowed (or a line manager) sees (never contracts, pay, right to work, bonus or
//   disciplinary).
// - How often appraisals come round.
// The database enforces all of this (hr_is_team, hr_save_team, hr_set_viewer_access, hr_lm_sees, hr_save_settings);
// this page only sets it.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { showDate } from '@/components/DateField';
import { YesNo } from '@/components/OneDriveSettings';
import { Pop } from '@/components/Pop';
import { SelectBox } from '@/components/SelectBox';
import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { copyHrToOneDrive, saveHrSettings, saveHrTeam, saveViewerAccess, useHrAccess, useHrFolderAccess, useHrOverview, useHrWho, useStaff, type HrWho } from '@/data/hrRecords';
import type { Person } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { base, page, space } from '@/theme/theme';

/** The parts someone allowed to see another's folder (or their line manager) can be shown. */
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
      {line(<><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>Everyone Else</Text><Muted>Their own folder, and any others HR lets them see (only the parts HR allows)</Muted></View><Text style={{ fontWeight: '700', color: base.ink }}>No</Text></>, 'else')}
    </>
  );
}

/** Whose folders one person may see besides their own: Yes / No for each of the others. */
function ViewerPop({ viewer, staff, start, onClose, onSaved }: { viewer: Person; staff: Person[]; start: string[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [ids, setIds] = useState(start);
  const [busy, setBusy] = useState(false);
  const others = staff.filter((p) => p.id !== viewer.id);
  const save = async () => {
    setBusy(true); const ok = await saveViewerAccess(viewer.id, ids); setBusy(false);
    if (ok) onSaved(); else toast('Could not save — try again.');
  };
  return (
    <Pop title={`Whose Folders Can ${viewer.name} See?`} onClose={onClose}
      footer={buttons(<><Button busy={busy} title="Save" onPress={save} /><Button kind="ghost" title="Cancel" onPress={onClose} /></>)}>
      <Muted style={{ marginBottom: 6 }}>Besides their own. They see only the parts set under What Others See.</Muted>
      {others.map((p) => line(<>
        <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>{p.name}</Text><Muted>{roleName(p.role)}</Muted></View>
        <YesNo label={p.name} value={ids.includes(p.id)} onChange={(v) => setIds(v ? [...ids, p.id] : ids.filter((x) => x !== p.id))} />
      </>, p.id))}
    </Pop>
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
  const { data: ov } = useHrOverview(me?.org_id, !!acc?.team);
  const [viewing, setViewing] = useState<Person | null>(null);
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
          {title('Who Sees Everyone’s Folders')}
          <Muted style={{ marginBottom: 6 }}>These people see every HR folder in full (contracts, payslips, right to work, bonus, disciplinary), in OpHUB and in the HR folder in OneDrive, and choose who else sees what.</Muted>
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
    if (!chosen.length) { showAlert('Choose at least one person who sees everyone’s folders.'); return; }
    const meIn = chosen.some((x) => x.p.id === me.id);
    if (!meIn && !(await confirmAsk('You’re not in this list. After saving you won’t see everyone’s HR folders or be able to change who can. Save anyway?', 'Yes, Save'))) return;
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
        {title('Who Sees Everyone’s Folders')}
        <Muted style={{ marginBottom: 8 }}>They see every HR folder in full (contracts, payslips, right to work, bonus, disciplinary), in OpHUB and in the HR folder in OneDrive, and choose who else sees what. Only they can change this.</Muted>
        {line(<><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>All Company Admins</Text><Muted>Everyone with the Company Admin role, now and later</Muted></View>
          <YesNo label="All Company Admins" value={d.admins} onChange={(v) => setDraft({ ...d, admins: v })} /></>, 'adm')}
        {/* All Project Managers (15 Nov) shows only where it was switched on: Andy wants PMs to see their own folder and
            the folders he chooses for them, person by person (below). */}
        {saved.pms && line(<><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>All Project Managers</Text><Muted>Everyone with the Project Manager role, now and later</Muted></View>
          <YesNo label="All Project Managers" value={d.pms} onChange={(v) => setDraft({ ...d, pms: v })} /></>, 'pms')}
        <View style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>Named People</Text>
          <Muted style={{ marginBottom: 6 }}>Anyone else who should see every folder: an office manager, a director</Muted>
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
        {sub(`So ${chosen.length === 1 ? 'This Person Sees' : `These ${chosen.length} People See`} Everyone’s Folders`)}
        {chosen.map((x) => line(<>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>{x.p.name}{x.p.id === me.id ? ' (You)' : ''}</Text><Muted>{roleName(x.p.role)}</Muted></View>
          <Muted>{x.why.join(' · ')}</Muted>
        </>, x.p.id))}
        {!chosen.length && <Muted>No one yet. Choose at least one person.</Muted>}
        {line(<><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>Everyone Else</Text><Muted>Their own folder, and any others you let them see below</Muted></View><Text style={{ fontWeight: '700', color: base.ink }}>No</Text></>, 'else')}
        {changed && buttons(<>
          <Button busy={busy === 'team'} title="Save Changes" onPress={saveTeam} />
          {changed && <Button kind="ghost" title="Cancel" onPress={() => setDraft(null)} />}
        </>)}
        {who.set_up && who.set_up_at && <Muted style={{ marginTop: 10 }}>Set up {who.set_up_by ? `by ${who.set_up_by} ` : ''}on {showDate(who.set_up_at.slice(0, 10))}.</Muted>}
      </Card>

      <Card>
        {title('Who Can See Whose Folder')}
        <Muted style={{ marginBottom: 8 }}>Everyone sees their own folder, the holiday calendar and company policies. Choose, person by person, whose folders someone can see as well (their team, say). They see only the parts set under What Others See.</Muted>
        {staff.map((p) => {
          const all = chosen.some((x) => x.p.id === p.id);
          const sees = who.grants.filter((g) => g.viewer_id === p.id).map((g) => staff.find((x) => x.id === g.user_id)?.name).filter(Boolean) as string[];
          const lm = (ov?.recs ?? []).filter((r) => r.line_manager_id === p.id && !who.grants.some((g) => g.viewer_id === p.id && g.user_id === r.user_id)).map((r) => staff.find((x) => x.id === r.user_id)?.name).filter(Boolean) as string[];
          return line(<>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>{p.name}{p.id === me.id ? ' (You)' : ''} <Text style={{ fontWeight: '400', color: base.slate }}>· {roleName(p.role)}</Text></Text>
              <Muted>{all ? 'Everyone’s folders' : sees.length ? `Sees: ${sees.join(', ')}` : 'Their own folder only'}{!all && lm.length ? ` · Line manager of: ${lm.join(', ')}` : ''}</Muted>
            </View>
            {!all && <Button small kind="ghost" title="Change" onPress={() => setViewing(p)} />}
          </>, `v-${p.id}`);
        })}
      </Card>
      {viewing && <ViewerPop viewer={viewing} staff={staff} start={who.grants.filter((g) => g.viewer_id === viewing.id).map((g) => g.user_id)} onClose={() => setViewing(null)} onSaved={() => { setViewing(null); refresh(); }} />}

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
              <Muted>Only the {chosen.length === 1 ? 'person' : `${chosen.length} people`} who see everyone&apos;s folders. OpHUB leaves it out of everyone else&apos;s folder lists and won&apos;t open or save into it for them.</Muted></View></>, 'ophub')}
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
        {title('What Others See')}
        <Muted style={{ marginBottom: 6 }}>When someone can see another person&apos;s folder (chosen above, or as the line manager set on their Employment), they see these parts. Contracts, pay, right to work, bonus and disciplinary are never shown to them.</Muted>
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
