// HR › Employee Records › HR Access (Andy, 15 Nov 2026: "grouped by role, the click and a pop up"; 16 Nov: "Who can see
// what. Group by roles. Admin: Andy - See everyone. Project managers: Pm 1 - select who and what. So then the admin
// selects pm, then selects what folders they can see for that pm. And then repeat").
// - Who Can See What: everyone sees their own folder, holidays and policies. People are grouped under the company's
//   roles (Admin Centre › Roles), each line saying what they see: See Everyone, the people they see, or Own Folder Only.
//   Tap someone for a pop-up: Sees Everyone's Folders Yes / No, else each person whose folder they see with that
//   person's own parts (contracts, pay, right to work, disciplinary and bonus too, if HR says Yes: Andy, 16 Nov 2026;
//   personal details never), and who can see their own folder.
//   Saved in one go (hr_set_person_access_each).
// - Settings, one line each: company admins / PMs see everyone's, the HR folder in OneDrive (Andy locks it in OneDrive;
//   OpHUB copies HR documents in and hides it from everyone else's folder lists), what line managers see, appraisals,
//   and the change log.
// - One line each, opening a pop-up: the HR folder in OneDrive (Andy locks it in OneDrive; OpHUB copies HR documents in
//   and hides it from everyone else's folder lists), what line managers see, appraisals, and the change log.
// The database enforces all of this (hr_is_team, hr_lm_sees, hr_set_person_access_each, hr_save_team, hr_save_settings);
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
import type { Person } from '@/data/hs';
import { copyHrToOneDrive, saveHrSettings, saveHrTeam, savePersonAccessEach, useHrAccess, useHrFolderAccess, useHrWho, useStaff, type HrAccess as HrAcc, type HrWho } from '@/data/hrRecords';
import { useOrgRoles } from '@/data/orgRoles';
import { useAuth } from '@/lib/auth';
import { groupByRole, roleName } from '@/lib/rules/orgRoles';
import { base, page, space } from '@/theme/theme';

/** The parts someone allowed to see another's folder (or their line manager) can be shown. The last five are off
 *  unless HR says Yes (Andy, 16 Nov 2026: "contracts pay rights to work and disciplinary, this should be selectable by
 *  the admin as well"). Personal details (address, date of birth) and the Other folder stay HR-only. */
export const LM_SECTIONS: [string, string, string][] = [
  ['performance', 'Performance', 'Appraisals, goals and feedback'],
  ['emergency', 'Emergency Contact', 'Who to ring if they’re hurt on site'],
  ['licences', 'Licences & Cards', 'Driving licence, DVLA check'],
  ['health', 'Health & Safety', 'Induction, health questionnaire, HAVS'],
  ['absence', 'Absence & Fit Notes', 'Return to work forms, fit notes'],
  ['history', 'Job History', 'Role changes and training (pay reviews under Pay)'],
  ['contracts', 'Contracts & Letters', 'Contract, offer letter, start and probation dates, hours'],
  ['pay', 'Payslips & Pay', 'Payslips, P60s and pay reviews'],
  ['rtw', 'Right To Work & ID', 'Passport or share code, and the check'],
  ['conduct', 'Disciplinary & Grievance', 'Including notes not shown to them'],
  ['bonus', 'Bonus', 'Bonus targets and payments'],
];
const AMBER = { backgroundColor: '#FFF4DE', borderRadius: 10, padding: 10 } as const;

const line = (children: ReactNode, key: string, onPress?: () => void, label?: string, first?: boolean) => onPress
  ? <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: first ? 0 : 1, borderTopColor: '#F0F1F4', backgroundColor: pressed ? '#F7F8FA' : undefined })}>{children}</Pressable>
  : <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>{children}</View>;
const title = (s: string) => <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>{s}</Text>;
const sub = (s: string) => <Text style={{ fontSize: 12.5, fontWeight: '700', color: base.slate, marginTop: 12, marginBottom: 4 }}>{s}</Text>;
const name = (s: string, small?: string) => <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '500', color: base.ink }}>{s}</Text>{!!small && <Muted>{small}</Muted>}</View>;
const chev = <Text style={{ color: base.slate, fontSize: 17 }}>›</Text>;
const buttons = (children: ReactNode) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12 }}>{children}</View>;

/** Does this person see everyone's folders, and why? */
const everyoneWhy = (who: HrWho, id: string) => who.people.find((x) => x.id === id)?.why ?? [];

/** The parts' names, short, for one line. */
const partsOf = (secs: string[]) => LM_SECTIONS.filter(([k]) => secs.includes(k)).map(([, l]) => l).join(', ') || 'Nothing yet';

/** One person: sees everyone's folders, or whose folders they see and, for each of those, which parts (Andy, 16 Nov
 *  2026: "the admin selects pm, then selects what folders they can see for that pm. And then repeat"). */
function PersonPop({ p, who, acc, staff, roleOfP, meId, onClose, onSaved }: { p: Person; who: HrWho; acc: HrAcc; staff: Person[]; roleOfP: (x: Person) => string; meId: string; onClose: () => void; onSaved: (left: boolean) => void }) {
  const why = everyoneWhy(who, p.id);
  const byRole = why.includes('admin') || why.includes('pm');
  const [all, setAll] = useState(why.length > 0);
  const [grants, setGrants] = useState(who.grants.filter((g) => g.viewer_id === p.id).map((g) => ({ user_id: g.user_id, sections: g.sections?.length ? g.sections : acc.lm_sections })));
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nm = (id: string) => staff.find((x) => x.id === id)?.name || 'Someone';
  const first = p.name.split(' ')[0];
  const hrNames = who.people.filter((x) => x.id !== p.id).map((x) => x.name);
  const seenBy = who.grants.filter((g) => g.user_id === p.id).map((g) => nm(g.viewer_id));
  const setSecs = (id: string, k: string, on: boolean) => setGrants(grants.map((g) => (g.user_id !== id ? g : { ...g, sections: on ? [...new Set([...g.sections, k])] : g.sections.filter((x) => x !== k) })));
  const save = async () => {
    const empty = !all ? grants.find((g) => !g.sections.length) : undefined;
    if (empty) { setOpenId(empty.user_id); showAlert(`Choose at least one part of ${nm(empty.user_id)}’s folder, or take them off.`); return; }
    const leaving = p.id === meId && why.length > 0 && !all && !byRole;
    if (leaving && !(await confirmAsk('You won’t see everyone’s folders or be able to change HR Access after this. Carry on?', 'Yes, Save'))) return;
    setBusy(true);
    const err = await savePersonAccessEach(p.id, all && !byRole, all ? [] : grants);
    setBusy(false);
    if (err) { showAlert(err); return; }
    onSaved(leaving);
  };
  return (
    <Pop title={`${p.name} · ${roleOfP(p)}`} onClose={onClose}
      footer={byRole ? undefined : buttons(<><Button busy={busy} title="Save" onPress={save} /><Button kind="ghost" title="Cancel" onPress={onClose} /></>)}>
      {line(<>{name('Sees Everyone’s Folders', byRole ? `Yes, as a ${why.includes('admin') ? 'company admin' : 'project manager'} (set under Settings below)` : 'Every folder in full, and can change HR Access')}
        {!byRole && <YesNo label="Sees Everyone’s Folders" value={all} onChange={setAll} />}</>, 'all', undefined, undefined, true)}
      {!all && !byRole && (
        <>
          {sub('Whose Folders They Can See (Not Change)')}
          {!grants.length && <Muted style={{ marginBottom: 6 }}>Only their own.</Muted>}
          {grants.map((g) => {
            const x = staff.find((s) => s.id === g.user_id);
            const isOpen = openId === g.user_id;
            return (
              <View key={g.user_id} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 10, marginBottom: 6, paddingHorizontal: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${nm(g.user_id)}: ${isOpen ? 'hide' : 'choose'} what they see`} onPress={() => setOpenId(isOpen ? null : g.user_id)} style={{ flex: 1, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink }}>{nm(g.user_id)}{x ? <Text style={{ fontWeight: '400', color: base.slate }}> · {roleOfP(x)}</Text> : null}</Text>
                    <Muted>{partsOf(g.sections)} {isOpen ? '▴' : '▾'}</Muted>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Take ${nm(g.user_id)} off`} hitSlop={8} onPress={() => setGrants(grants.filter((y) => y.user_id !== g.user_id))}>
                    <Text style={{ fontSize: 15, color: base.slate }}>✕</Text>
                  </Pressable>
                </View>
                {isOpen && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, paddingBottom: 8 }}>
                    {LM_SECTIONS.map(([k, l]) => (
                      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, flexBasis: 210, flexGrow: 1 }}>
                        <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>{l}</Text>
                        <YesNo label={`${nm(g.user_id)}: ${l}`} value={g.sections.includes(k)} onChange={(v) => setSecs(g.user_id, k, v)} />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
          <SelectBox title="Add Someone" placeholder="+ Add Someone" value={null}
            options={staff.filter((x) => x.id !== p.id && !grants.some((g) => g.user_id === x.id)).map((x) => [x.id, `${x.name} · ${roleOfP(x)}`] as [string, string])}
            onChange={(id) => { setGrants([...grants, { user_id: id, sections: acc.lm_sections }]); setOpenId(id); }} />
          <Muted style={{ marginTop: 4 }}>Personal details (address, date of birth) stay with HR.</Muted>
        </>
      )}
      {sub(`Who Can See ${first}’s Folder`)}
      <Muted>{[`${first}`, hrNames.length ? `HR (${hrNames.join(', ')})` : '', seenBy.length ? `${seenBy.join(', ')} (the parts allowed)` : ''].filter(Boolean).join(', ')}.</Muted>
    </Pop>
  );
}

/** The HR folder in OneDrive: copying, the folder, who can open it. */
function FolderPop({ acc, peopleN, onClose, refresh }: { acc: HrAcc; peopleN: number; onClose: () => void; refresh: () => void }) {
  const toast = useToast();
  const od = acc.onedrive;
  const fa = useHrFolderAccess(od?.id);
  const fd = fa.data;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const warn = (fd?.shared ?? []).some((s) => s.warn);
  const pick = () => { onClose(); router.push('/pm/onedrive-pick?target=hr' as never); };
  return (
    <Pop title="HR Folder In OneDrive" onClose={onClose}>
      {!od ? (
        <>
          <Muted>Lock the HR folder in OneDrive (Share › Manage Access) to the people who should see everyone&apos;s contracts, then choose it here. OpHUB copies HR documents into it, a folder per person, and hides it from everyone else&apos;s folder lists.</Muted>
          {buttons(<Button title="Choose The HR Folder" onPress={pick} />)}
        </>
      ) : (
        <>
          <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink, marginBottom: 2 }}>📁 {fd?.folder?.name || od.name}</Text>
          {line(<>{name('Copy HR Documents Here', 'Name › Folder › File')}
            <YesNo label="Copy HR Documents Here" value={od.on !== false} onChange={async (v) => { if (await saveHrSettings({ onedrive: { ...od, on: v } })) refresh(); else toast('Could not save — try again.'); }} /></>, 'copy')}
          {buttons(<>
            <Button small kind="ghost" title="Change Folder" onPress={pick} />
            {od.on !== false && <Button small kind="ghost" busy={busy} title="Copy All Now" onPress={async () => {
              setBusy(true); const r = await copyHrToOneDrive({ all: true }); setBusy(false);
              setNote(r.error ? 'Could not copy — try again.' : `${r.data?.copied ?? 0} document${r.data?.copied === 1 ? '' : 's'} copied.`);
            }} />}
          </>)}
          {!!note && <Muted style={{ textAlign: 'center', marginTop: 6 }}>{note}</Muted>}
          {sub('Who Can Open It')}
          <Muted>Through OpHUB: only the {peopleN === 1 ? 'person' : `${peopleN} people`} who see everyone&apos;s folders.</Muted>
          {fa.isLoading ? <Muted style={{ marginTop: 6 }}>Checking OneDrive…</Muted> : fd?.error ? <Muted style={{ marginTop: 6 }}>{fd.error}</Muted> : (
            <View style={{ marginTop: 6 }}>
              <Muted>In OneDrive itself:</Muted>
              {(fd?.shared ?? []).map((s, i) => (
                <View key={`${s.who}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 }}>
                  <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>{s.warn ? '⚠ ' : ''}{s.who}{s.kind === 'group' ? ' (a group)' : ''}</Text>
                  <Muted>{s.how}</Muted>
                </View>
              ))}
              {!!fd?.account && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 }}>
                  <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>{fd.account} <Text style={{ color: base.slate }}>(OpHUB&apos;s company sign-in)</Text></Text>
                  <Muted>Can Open</Muted>
                </View>
              )}
              {warn && <View style={[AMBER, { marginTop: 6 }]}><Text style={{ color: '#B45309', fontWeight: '600', fontSize: 13 }}>⚠ A link or group can open this folder outside OpHUB. Check it in OneDrive: Manage Access.</Text></View>}
            </View>
          )}
          {!!fd?.folder?.webUrl && buttons(<Button small kind="ghost" title="Manage Access In OneDrive ↗" onPress={() => void Linking.openURL(fd.folder?.webUrl as string)} />)}
          <Pressable accessibilityRole="button" accessibilityLabel="Remove The HR Folder" hitSlop={8} style={{ alignSelf: 'center', marginTop: 12 }} onPress={async () => {
            if (!(await confirmAsk('Remove the HR folder from OpHUB? OpHUB will stop hiding it from project managers and admins, and stop copying into it. The files already there stay in OneDrive.', 'Yes, Remove'))) return;
            if (await saveHrSettings({ clearOneDrive: true })) { refresh(); onClose(); } else toast('Could not save — try again.');
          }}><Text style={{ fontSize: 13, fontWeight: '600', color: base.slate }}>Remove The HR Folder</Text></Pressable>
        </>
      )}
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
  const { data: roles } = useOrgRoles(me?.org_id);
  const roleOfP = (x: Person) => roleName(x, roles ?? []);
  const [pop, setPop] = useState<string>('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [lmLocal, setLmLocal] = useState<string[] | null>(null);
  // Back from choosing the OneDrive folder: look again.
  useFocusEffect(useCallback(() => { ['hrAccess', 'hrWho', 'hrFolderAccess'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); }, [qc]));
  if (!me) return null;
  if (!acc || !who || !roles) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!acc.team) {
    return (
      <ScrollView contentContainerStyle={page(720)}>
        <Stack.Screen options={{ title: 'HR Access' }} />
        <Card>
          {title('Who Sees Everyone’s Folders')}
          <Muted style={{ marginBottom: 4 }}>They see every HR folder in full and choose who else sees what. Everyone else sees their own folder, and any others HR lets them see.</Muted>
          {who.people.map((p) => line(name(`${p.name}${p.id === me.id ? ' (You)' : ''}`), p.id))}
        </Card>
      </ScrollView>
    );
  }
  const refresh = () => ['hrAccess', 'hrWho', 'hrTeam', 'hrFolder', 'hrOverview', 'hrFolderAccess', 'hrMyReports'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const summary = (p: Person) => {
    if (everyoneWhy(who, p.id).length) return 'Sees Everyone';
    const names = who.grants.filter((g) => g.viewer_id === p.id).map((g) => staff.find((x) => x.id === g.user_id)?.name).filter(Boolean) as string[];
    return !names.length ? 'Own Folder Only' : names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  };
  const setAdmins = async (v: boolean) => {
    const meNamed = who.named.includes(me.id);
    if (!v && me.role === 'admin' && !meNamed && !(await confirmAsk('Switch this off? You won’t see everyone’s folders or be able to change HR Access unless you’re set to Yes yourself.', 'Yes, Switch Off'))) return;
    const w = await saveHrTeam({ admins: v, pms: who.team_pms, people: who.named });
    if (!w) { showAlert('Someone has to see everyone’s folders. Set a person to Yes first.'); return; }
    refresh();
    if (!v && me.role === 'admin' && !meNamed) router.back();
  };
  const lm = lmLocal ?? acc.lm_sections;
  const setLm = async (k: string, on: boolean) => {
    const next = on ? [...new Set([...lm, k])] : lm.filter((x) => x !== k);
    setLmLocal(next);
    if (await saveHrSettings({ lmSections: next })) refresh(); else { setLmLocal(null); toast('Could not save — try again.'); }
  };
  const person = pop.startsWith('p:') ? staff.find((x) => x.id === pop.slice(2)) ?? null : null;
  const od = acc.onedrive;
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'HR Access' }} />
      <Card>
        {title('Who Can See What')}
        <Muted style={{ marginBottom: 2 }}>Everyone sees their own folder, the holiday calendar and policies. Tap someone to choose whose folders they see, and what of each.</Muted>
        {groupByRole(staff, roles).map((g) => {
          const key = g.role?.id ?? g.title;
          const big = ['operative', 'driver', 'client'].includes(g.role?.access ?? '');
          const isOpen = open[key] ?? !big;
          return (
            <View key={key}>
              {big ? line(<><Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: base.slate }}>{g.title} · {g.people.length}</Text><Text style={{ color: base.slate }}>{isOpen ? '▾' : '▸'}</Text></>,
                `g-${key}`, () => setOpen({ ...open, [key]: !isOpen }), `${g.title}: ${isOpen ? 'hide' : 'show'}`)
                : <Text key={`g-${key}`} style={{ fontSize: 13, fontWeight: '700', color: base.slate, marginTop: 12, marginBottom: 2 }}>{g.title}</Text>}
              {isOpen && g.people.map((p) => line(<>
                {name(`${p.name}${p.id === me.id ? ' (You)' : ''}`)}
                <Text numberOfLines={1} style={{ fontSize: 13, color: base.slate, maxWidth: '55%', textAlign: 'right' }}>{summary(p)}</Text>{chev}
              </>, p.id, () => setPop(`p:${p.id}`), `${p.name}: ${summary(p)}`))}
            </View>
          );
        })}
      </Card>

      <Card>
        {title('Settings')}
        {line(<>{name('Company Admins See Everyone’s Folders')}<YesNo label="Company Admins See Everyone’s Folders" value={who.team_admins} onChange={(v) => void setAdmins(v)} /></>, 'adm', undefined, undefined, true)}
        {who.team_pms && line(<>{name('Project Managers See Everyone’s Folders')}<YesNo label="Project Managers See Everyone’s Folders" value={who.team_pms} onChange={async (v) => {
          if (await saveHrTeam({ admins: who.team_admins, pms: v, people: who.named })) refresh(); else showAlert('Someone has to see everyone’s folders. Set a person to Yes first.');
        }} /></>, 'pms')}
        {line(<>{name('HR Folder In OneDrive', od ? `📁 ${od.name}${od.on === false ? ' · copying off' : ''}` : 'Not Chosen Yet')}{chev}</>, 'od', () => setPop('folder'), 'HR Folder In OneDrive')}
        {line(<>{name('What Line Managers See', LM_SECTIONS.filter(([k]) => lm.includes(k)).map(([, l]) => l).join(', ') || 'Nothing')}{chev}</>, 'lm', () => setPop('lm'), 'What Line Managers See')}
        <View style={{ paddingTop: 9, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
          <SelectBox label="Appraisals Come Round" value={String(acc.appraisal_months) as never} options={[['3', 'Every 3 Months'], ['6', 'Every 6 Months'], ['12', 'Every 12 Months']]}
            onChange={async (x) => { if (await saveHrSettings({ months: Number(x) })) refresh(); else toast('Could not save — try again.'); }} />
        </View>
        {who.log.length > 0 && line(<>{name('Changes', `${showDate(who.log[0].at.slice(0, 10))}: ${who.log[0].what}`)}{chev}</>, 'log', () => setPop('log'), 'Changes')}
      </Card>

      {person && <PersonPop key={person.id} p={person} who={who} acc={acc} staff={staff} roleOfP={roleOfP} meId={me.id} onClose={() => setPop('')} onSaved={(left) => { setPop(''); refresh(); if (left) router.back(); }} />}
      {pop === 'folder' && <FolderPop acc={acc} peopleN={who.people.length} onClose={() => setPop('')} refresh={refresh} />}
      {pop === 'lm' && (
        <Pop title="What Line Managers See" onClose={() => setPop('')}>
          <Muted style={{ marginBottom: 4 }}>Of the people they line-manage (set on each person&apos;s Employment). Personal details (address, date of birth) stay with HR.</Muted>
          {LM_SECTIONS.map(([k, l, s]) => line(<>{name(l, s)}<YesNo label={l} value={lm.includes(k)} onChange={(v) => void setLm(k, v)} /></>, k))}
        </Pop>
      )}
      {pop === 'log' && (
        <Pop title="Changes To HR Access" onClose={() => setPop('')}>
          {who.log.map((l, i) => line(<View style={{ flex: 1 }}><Muted>{showDate(l.at.slice(0, 10))}{l.by ? ` · ${l.by}` : ''}</Muted><Text style={{ fontSize: 13.5, color: base.ink }}>{l.what}</Text></View>, `${l.at}${i}`))}
        </Pop>
      )}
    </ScrollView>
  );
}
