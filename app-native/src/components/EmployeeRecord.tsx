// One person's HR folder (Andy, 14 Nov 2026): Details (personal details they keep up to date themselves, employment,
// right to work, policies), Documents (each folder with what should be in it, flagged when missing, expiring or due),
// Performance (appraisals, goals, feedback), Bonus and History. The HR team (company admins until a company chooses one,
// 15 Nov 2026) sees and changes everything; a line manager only the parts the HR team allows; the person
// sees their own (not private notes) and changes their personal details and adds their own ID, licences and health
// papers; a line manager sees their people's performance side. The database enforces the same (hr_* RLS).
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { CertsPanel } from '@/components/CertsPanel';
import { DateBox, showDate, todayIso } from '@/components/DateField';
import { viewDoc } from '@/components/DocViewer';
import { YesNo } from '@/components/OneDriveSettings';
import { Pop } from '@/components/Pop';
import { QBox } from '@/components/QuoteForm';
import { SelectBox } from '@/components/SelectBox';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { usePolicies } from '@/data/hr';
import {
  addBonus, addFeedback, addGoal, addHistory, deleteFeedback, deleteGoal, deleteHistory, deleteHrDoc, hrDocUrl, saveAppraisalReview, saveAppraisalSelf, saveRecord,
  startAppraisal, updateBonus, updateGoal, uploadHrDoc, useHrAccess, useHrFolder, useHrSectionsFor, useHrWho, useMyReports, useStaff, type HrBonus, type HrGoal, type UpFile,
} from '@/data/hrRecords';
import { useAuth } from '@/lib/auth';
import { publicUrl } from '@/lib/privateFiles';
import {
  APPRAISAL_SCORES, APPRAISAL_SELF, APPRAISAL_STATUS, BONUS_BASIS, BONUS_STATUS, EMPLOYMENT_TYPES, employmentLabel, FEEDBACK_KINDS, GOAL_IDEAS, GOAL_STATUS,
  goalStatusLabel, HISTORY_KINDS, HR_FOLDERS, itemState, itemsFor, nextAppraisal, STATE_LABEL, type Appraisal, type HrDoc, type HrRecord, type ItemState,
} from '@/lib/rules/hrRecords';
import { isManager } from '@/lib/roles';
import { base, page, useDesk, useTheme } from '@/theme/theme';

type Tab = 'details' | 'docs' | 'perf' | 'bonus' | 'history';
const STATE_TONE: Record<ItemState, [string, string]> = { ok: ['#E8F5EC', '#1E7A43'], missing: ['#F1F2F4', '#5B6470'], expiring: ['#FFF4DE', '#B45309'], expired: ['#FDECEA', '#C0392B'], due: ['#FFF4DE', '#B45309'] };
const label = (pairs: [string, string][], k?: string | null) => pairs.find(([x]) => x === k)?.[1] ?? '—';
const money = (n: number | null) => (n == null ? '—' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export function EmployeeRecord({ userId }: { userId: string }) {
  const { me } = useAuth();
  const t = useTheme();
  const desk = useDesk();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useHrFolder(userId);
  const { data: staff = [] } = useStaff();
  const { data: acc } = useHrAccess(me?.org_id);
  const { data: who } = useHrWho(me?.org_id);
  const { data: reports = [] } = useMyReports(!!acc && !acc.team);
  const { data: secsFor } = useHrSectionsFor(userId, !!acc && !acc.team && userId !== me?.id);
  const months = acc?.appraisal_months ?? 12;
  const { data: pol } = usePolicies(me?.org_id);
  const [tab, setTab] = useState<Tab>('details');
  const [pop, setPop] = useState<ReactNode>(null);
  if (!me) return null;
  const person = staff.find((p) => p.id === userId);
  const name = person?.name || 'This person';
  const first = name.split(' ')[0];
  // "admin" here is the HR team (who sees everyone's folders), not every company admin.
  const admin = !!acc?.team, self = me.id === userId;
  const rec = data?.rec ?? null;
  // Their line manager, or someone HR has allowed to see this folder (Andy, 15 Nov 2026): the parts HR allows.
  const lineMgr = !admin && !self && ((!!rec && rec.line_manager_id === me.id) || reports.some((r) => r.user_id === userId));
  // What their line manager may see (the HR team chooses; never contracts, pay, right to work, bonus or disciplinary).
  // The parts are set person by person (HR Access, 15 Nov 2026); the database says which (hr_sections_for).
  const lmSees = (s: string) => lineMgr && (secsFor ?? acc?.lm_sections ?? []).includes(s) && !['contracts', 'pay', 'rtw', 'conduct', 'bonus', 'other'].includes(s);
  const lmPerf = lmSees('performance');
  // Changing someone's performance side (goals, notes, appraisals): HR and their real line manager only. Someone HR has
  // only allowed to see the folder reads it (review, 15 Nov 2026; the database enforces it: hr_lm_writes).
  const canPerf = admin || (lmPerf && !!rec && rec.line_manager_id === me.id);
  const lmFolders = HR_FOLDERS.filter((f) => lmSees(f.k));
  if (!acc || (!admin && !self && !lineMgr && !isLoading)) return <Muted style={{ padding: 20 }}>{acc ? `This record is private to ${first} and the HR team.` : 'Loading…'}</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['hrFolder', userId] }); void qc.invalidateQueries({ queryKey: ['hrOverview'] }); };
  const close = () => setPop(null);
  const nameOf = (id: string | null | undefined) => staff.find((p) => p.id === id)?.name || '—';
  const role = person?.role || 'operative';
  const docs = data?.docs ?? [];
  const items = itemsFor(rec, role);
  const states = items.map((i) => ({ i, ...itemState(i, docs, todayIso(), rec) }));
  const attention = states.filter((s) => s.state !== 'ok').length;
  const left = !!rec?.end_date && rec.end_date <= todayIso();
  const appr = nextAppraisal(rec, data?.appraisals ?? [], months);
  const full = admin || self;
  const tabs = ([['details', 'Details'], ['docs', 'Documents'], ['perf', 'Performance'], ['bonus', 'Bonus'], ['history', 'History']] as [Tab, string][])
    .filter(([k]) => full || k === 'details' || (k === 'docs' && lmFolders.length > 0) || (k === 'perf' && lmPerf) || (k === 'history' && lmSees('history')));

  // ---------- small parts ----------
  const row = (l: string, v: string | null | undefined) => (
    <View key={l} style={{ flexDirection: 'row', gap: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
      <Text style={{ width: 150, fontSize: 13, color: base.slate }}>{l}</Text>
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '500', color: base.ink }}>{v || '—'}</Text>
    </View>
  );
  const head = (title: string, edit?: () => void, editLabel = 'Edit') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: base.ink }}>{title}</Text>
      {edit && <Pressable accessibilityRole="button" accessibilityLabel={`${editLabel}: ${title}`} onPress={edit} hitSlop={8}><Text style={{ fontSize: 13, fontWeight: '600', color: t.brand1 }}>{editLabel}</Text></Pressable>}
    </View>
  );
  const chip = (txt: string, tone: [string, string]) => <View style={{ backgroundColor: tone[0], borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><Text style={{ fontSize: 11.5, fontWeight: '600', color: tone[1] }}>{txt}</Text></View>;
  const open = async (d: HrDoc) => { const u = await hrDocUrl(d); if (u) viewDoc(u, d.title); else toast('Could not open it — try again.'); };
  const footer = (save: () => Promise<boolean | void>, saveLabel = 'Save') => {
    const Foot = () => {
      const [busy, setBusy] = useState(false);
      return (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}>
          <Button busy={busy} title={saveLabel} onPress={async () => { setBusy(true); const r = await save(); setBusy(false); if (r === false) toast('Could not save — try again.'); else { refresh(); close(); } }} />
          <Button kind="ghost" title="Cancel" onPress={close} />
        </View>
      );
    };
    return <Foot />;
  };

  // ---------- Details: pop-ups ----------
  const editPersonal = () => {
    const v: Partial<HrRecord> = { ...rec };
    const Body = () => {
      const [f, setF] = useState(v);
      Object.assign(v, f);
      const set = (k: keyof HrRecord) => (x: string) => setF({ ...f, [k]: x });
      return (
        <View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, marginBottom: 4 }}>Date Of Birth</Text>
          <DateBox value={f.date_of_birth ?? ''} onChange={(x) => setF({ ...f, date_of_birth: x || null })} title="Date Of Birth" style={{ marginBottom: 12 }} />
          <QBox label="Home Address" value={f.home_address ?? ''} onChangeText={set('home_address')} multiline />
          <QBox label="Postcode" value={f.postcode ?? ''} onChangeText={set('postcode')} />
          <QBox label="Personal Phone" value={f.personal_phone ?? ''} onChangeText={set('personal_phone')} keyboardType="phone-pad" />
          <QBox label="Personal Email" value={f.personal_email ?? ''} onChangeText={set('personal_email')} keyboardType="email-address" autoCapitalize="none" />
          <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink, marginTop: 4, marginBottom: 8 }}>Emergency Contact</Text>
          <QBox label="Name" value={f.emergency_name ?? ''} onChangeText={set('emergency_name')} />
          <QBox label="Relationship" value={f.emergency_relationship ?? ''} onChangeText={set('emergency_relationship')} />
          <QBox label="Phone" value={f.emergency_phone ?? ''} onChangeText={set('emergency_phone')} keyboardType="phone-pad" />
        </View>
      );
    };
    const pick = (k: (keyof HrRecord)[]) => Object.fromEntries(k.map((x) => [x, (typeof v[x] === 'string' ? (v[x] as string).trim() : v[x]) || null]));
    setPop(<Pop title="Personal Details" onClose={close} footer={footer(() => saveRecord(me, userId, pick(['date_of_birth', 'home_address', 'postcode', 'personal_phone', 'personal_email', 'emergency_name', 'emergency_relationship', 'emergency_phone'])))}><Body /></Pop>);
  };
  const managers = staff.filter((p) => ['admin', 'pm', 'site_manager'].includes(p.role) && p.id !== userId);
  const editEmployment = () => {
    const v: Partial<HrRecord> = { ...rec };
    const Body = () => {
      const [f, setF] = useState(v);
      Object.assign(v, f);
      const set = (k: keyof HrRecord) => (x: string) => setF({ ...f, [k]: x });
      const date = (k: keyof HrRecord, l: string) => (
        <View key={k}><Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, marginBottom: 4 }}>{l}</Text>
          <DateBox value={(f[k] as string) ?? ''} onChange={(x) => setF({ ...f, [k]: x || null })} title={l} style={{ marginBottom: 12 }} /></View>
      );
      return (
        <View>
          <QBox label="Job Title" value={f.job_title ?? ''} onChangeText={set('job_title')} placeholder="e.g. Roofer, Site Manager" />
          <QBox label="Department" value={f.department ?? ''} onChangeText={set('department')} placeholder="e.g. Site, Office, Yard" />
          <SelectBox label="Employment Type" value={(f.employment_type as never) ?? null} options={EMPLOYMENT_TYPES} onChange={(x) => setF({ ...f, employment_type: x })} />
          {date('start_date', 'Start Date')}
          {date('probation_end', 'Probation Ends')}
          <QBox label="Contracted Hours" value={f.contracted_hours ?? ''} onChangeText={set('contracted_hours')} placeholder="e.g. 39 hours, Mon to Fri" />
          <SelectBox label="Line Manager" value={(f.line_manager_id as never) ?? null} options={[['', 'No One'], ...managers.map((p) => [p.id, p.name] as [string, string])]} onChange={(x) => setF({ ...f, line_manager_id: x || null })} />
          {date('end_date', 'Leaving Date')}
          <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink, marginTop: 4, marginBottom: 8 }}>Right To Work</Text>
          {date('rtw_checked_on', 'Checked On')}
          <QBox label="Document Seen" value={f.rtw_document ?? ''} onChangeText={set('rtw_document')} placeholder="e.g. British passport, share code" />
          {date('rtw_expiry', 'Expires (If Time-Limited)')}
        </View>
      );
    };
    const keys: (keyof HrRecord)[] = ['job_title', 'department', 'employment_type', 'start_date', 'probation_end', 'contracted_hours', 'line_manager_id', 'end_date', 'rtw_checked_on', 'rtw_document', 'rtw_expiry'];
    setPop(<Pop title="Employment" onClose={close} footer={footer(() => saveRecord(me, userId, Object.fromEntries(keys.map((x) => [x, (typeof v[x] === 'string' ? (v[x] as string).trim() : v[x]) || null]))))}><Body /></Pop>);
  };

  // ---------- Documents: add one ----------
  const addDoc = (folder?: string, itemKey?: string | null) => {
    const folders = HR_FOLDERS.filter((x) => admin || x.self);
    const f0 = folder && folders.some((x) => x.k === folder) ? folder : folders[0].k;
    const it0 = items.find((x) => x.key === itemKey);
    const v = { folder: f0, item: itemKey ?? '', title: it0?.label ?? '', date: todayIso(), expiry: '', hidden: !!HR_FOLDERS.find((x) => x.k === f0)?.privateByDefault, file: null as UpFile | null };
    const Body = () => {
      const [f, setF] = useState(v);
      Object.assign(v, f);
      const inFolder = items.filter((x) => x.folder === f.folder);
      const it = items.find((x) => x.key === f.item);
      return (
        <View>
          <SelectBox label="Folder" value={f.folder as never} options={folders.map((x) => [x.k, x.l] as [string, string])} onChange={(x) => setF({ ...f, folder: x, item: '', hidden: !!HR_FOLDERS.find((y) => y.k === x)?.privateByDefault })} />
          {inFolder.length > 0 && <SelectBox label="What Is It?" value={(f.item || '-') as never} options={[...inFolder.map((x) => [x.key, x.label] as [string, string]), ['-', 'Something Else']]} onChange={(x) => setF({ ...f, item: x === '-' ? '' : x, title: x === '-' ? f.title : items.find((y) => y.key === x)?.label ?? f.title })} />}
          <QBox label="Title" value={f.title} onChangeText={(x) => setF({ ...f, title: x })} placeholder="e.g. Payslip October 2026" />
          <Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, marginBottom: 4 }}>Date Of The Document</Text>
          <DateBox value={f.date} onChange={(x) => setF({ ...f, date: x || '' })} title="Date" style={{ marginBottom: 12 }} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, marginBottom: 4 }}>{it?.expires ? 'Expiry Date' : 'Expiry Date (If It Has One)'}</Text>
          <DateBox value={f.expiry} onChange={(x) => setF({ ...f, expiry: x || '' })} title="Expiry Date" style={{ marginBottom: 12 }} />
          {admin && !self && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}><Text style={{ flex: 1, fontSize: 14, color: base.ink }}>Can {first} See It?</Text><YesNo label={`Can ${first} see it?`} value={!f.hidden} onChange={(x) => setF({ ...f, hidden: !x })} /></View>}
          <Button kind="ghost" title={f.file ? `📎 ${f.file.name}` : 'Choose File…'} onPress={async () => {
            const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true });
            if (!r.canceled && r.assets[0]) setF({ ...f, file: { uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType } });
          }} />
        </View>
      );
    };
    setPop(<Pop title="Add A Document" onClose={close} footer={footer(async () => {
      if (!v.file) { toast('Choose the file first.'); return false; }
      if (!v.title.trim()) { toast('Give it a title.'); return false; }
      return !!await uploadHrDoc(me, userId, { folder: v.folder, item_key: v.item || null, title: v.title.trim(), doc_date: v.date || null, expiry_date: v.expiry || null, hidden: admin && !self ? v.hidden : false }, v.file);
    }, 'Upload')}><Body /></Pop>);
  };
  const removeDoc = async (d: HrDoc) => {
    if (!(await confirmAsk(`Delete "${d.title}"? It can't be got back.`, 'Delete'))) return;
    if (await deleteHrDoc(d)) refresh(); else toast('Could not delete — try again.');
  };

  // ---------- Performance ----------
  const goalPop = (g?: HrGoal) => {
    const v = { title: g?.title ?? '', detail: g?.detail ?? '', due: g?.due_date ?? '', status: g?.status ?? 'not_started', progress: g?.progress ?? 0 };
    const Body = () => {
      const [f, setF] = useState(v);
      Object.assign(v, f);
      return (
        <View>
          <QBox label="Goal" value={f.title} onChangeText={(x) => setF({ ...f, title: x })} />
          {!g && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>{GOAL_IDEAS.map((x) => (
            <Pressable key={x} onPress={() => setF({ ...f, title: x })} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: f.title === x ? '#F1F2F4' : base.card }}><Text style={{ fontSize: 12, color: base.ink }}>{x}</Text></Pressable>
          ))}</View>}
          <QBox label="How We'll Know It's Done" value={f.detail} onChangeText={(x) => setF({ ...f, detail: x })} multiline />
          <Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, marginBottom: 4 }}>By When</Text>
          <DateBox value={f.due} onChange={(x) => setF({ ...f, due: x || '' })} title="By When" style={{ marginBottom: 12 }} />
          {g && <SelectBox label="Where It Stands" value={f.status as never} options={GOAL_STATUS} onChange={(x) => setF({ ...f, status: x, progress: x === 'done' ? 100 : f.progress })} />}
          {g && <><Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, marginBottom: 6 }}>How Far Along</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>{[0, 25, 50, 75, 100].map((n) => (
              <Pressable key={n} accessibilityLabel={`${n}%`} onPress={() => setF({ ...f, progress: n, status: n === 100 ? 'done' : f.status === 'done' ? 'on_track' : f.status })} style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: f.progress === n ? base.ink : base.line, backgroundColor: f.progress === n ? base.ink : base.card }}><Text style={{ fontSize: 12.5, fontWeight: '600', color: f.progress === n ? '#fff' : base.ink }}>{n}%</Text></Pressable>
            ))}</View></>}
        </View>
      );
    };
    setPop(<Pop title={g ? 'Goal' : 'Add A Goal'} onClose={close} footer={footer(async () => {
      if (!v.title.trim()) { toast('What is the goal?'); return false; }
      return g ? updateGoal(g.id, { title: v.title.trim(), detail: v.detail.trim() || null, due_date: v.due || null, status: v.status, progress: v.progress }) : addGoal(me, userId, { title: v.title.trim(), detail: v.detail.trim() || null, due_date: v.due || null });
    })}><Body /></Pop>);
  };
  const feedbackPop = () => {
    const kinds = canPerf ? FEEDBACK_KINDS : FEEDBACK_KINDS.filter(([k]) => k === 'praise');
    const v = { kind: 'praise', body: '', private: false };
    const Body = () => {
      const [f, setF] = useState(v);
      Object.assign(v, f);
      return (
        <View>
          {kinds.length > 1 && <SelectBox label="Type" value={f.kind as never} options={kinds} onChange={(x) => setF({ ...f, kind: x, private: x === 'note' })} />}
          <QBox label={f.kind === 'praise' ? `What Did ${first} Do Well?` : f.kind === 'improve' ? 'What To Work On' : 'Note'} value={f.body} onChangeText={(x) => setF({ ...f, body: x })} multiline />
          {canPerf && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}><Text style={{ flex: 1, fontSize: 14, color: base.ink }}>Can {first} See It?</Text><YesNo label={`Can ${first} see it?`} value={!f.private} onChange={(x) => setF({ ...f, private: !x })} /></View>}
        </View>
      );
    };
    setPop(<Pop title="Give Feedback" onClose={close} footer={footer(async () => {
      if (!v.body.trim()) { toast('Write something first.'); return false; }
      return addFeedback(me, userId, { kind: v.kind, body: v.body.trim(), private: v.private });
    }, 'Send')}><Body /></Pop>);
  };
  const selfPop = (a: Appraisal) => {
    const v: Record<string, string> = { ...(a.self_answers ?? {}) };
    const Body = () => {
      const [f, setF] = useState(v);
      Object.assign(v, f);
      return <View>{APPRAISAL_SELF.map((q, i) => <QBox key={q} label={`${i + 1}. ${q}`} value={f[q] ?? ''} onChangeText={(x) => setF({ ...f, [q]: x })} multiline />)}</View>;
    };
    setPop(<Pop title="Your Side Of The Appraisal" onClose={close} footer={footer(() => saveAppraisalSelf(a.id, v, true), 'Send To My Manager')}><Body /></Pop>);
  };
  const reviewPop = (a: Appraisal) => {
    const v = { scores: { ...(a.review?.scores ?? {}) } as Record<string, number>, comments: a.review?.comments ?? '', goals: a.review?.goals ?? '', summary: a.summary ?? '', signOff: true };
    const Body = () => {
      const [f, setF] = useState(v);
      Object.assign(v, f);
      return (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink, marginBottom: 6 }}>{first}&apos;s Side</Text>
          {a.self_answers ? APPRAISAL_SELF.map((q) => <View key={q} style={{ marginBottom: 8 }}><Text style={{ fontSize: 12, color: base.slate }}>{q}</Text><Text style={{ fontSize: 13.5, color: base.ink }}>{a.self_answers?.[q] || '—'}</Text></View>) : <Muted style={{ marginBottom: 8 }}>Not filled in yet.</Muted>}
          <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink, marginTop: 6, marginBottom: 6 }}>Scores (1 Poor To 5 Excellent)</Text>
          {APPRAISAL_SCORES.map((s) => (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, color: base.ink }}>{s}</Text>
              {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} accessibilityLabel={`${s} ${n}`} onPress={() => setF({ ...f, scores: { ...f.scores, [s]: n } })} style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: f.scores[s] === n ? base.ink : base.line, backgroundColor: f.scores[s] === n ? base.ink : base.card }}><Text style={{ fontWeight: '600', color: f.scores[s] === n ? '#fff' : base.ink }}>{n}</Text></Pressable>)}
            </View>
          ))}
          <QBox label="Comments" value={f.comments} onChangeText={(x) => setF({ ...f, comments: x })} multiline />
          <QBox label="Goals Agreed For Next Time" value={f.goals} onChangeText={(x) => setF({ ...f, goals: x })} multiline />
          <QBox label="Summary" value={f.summary} onChangeText={(x) => setF({ ...f, summary: x })} multiline />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}><Text style={{ flex: 1, fontSize: 14, color: base.ink }}>Sign It Off Now?</Text><YesNo label="Sign it off now?" value={f.signOff} onChange={(x) => setF({ ...f, signOff: x })} /></View>
        </View>
      );
    };
    setPop(<Pop title={`Appraisal: ${name}`} onClose={close} footer={footer(() => {
      const sc = Object.values(v.scores); const rating = sc.length ? Math.round(sc.reduce((s, n) => s + n, 0) / sc.length) : null;
      return saveAppraisalReview(me, a.id, { scores: v.scores, comments: v.comments.trim(), goals: v.goals.trim() }, rating, v.summary.trim(), v.signOff);
    })}><Body /></Pop>);
  };
  const viewAppraisal = (a: Appraisal) => setPop(
    <Pop title={`Appraisal ${showDate(a.completed_at || a.due_date)}`} onClose={close}>
      {APPRAISAL_SELF.map((q) => <View key={q} style={{ marginBottom: 8 }}><Text style={{ fontSize: 12, color: base.slate }}>{q}</Text><Text style={{ fontSize: 13.5, color: base.ink }}>{a.self_answers?.[q] || '—'}</Text></View>)}
      {APPRAISAL_SCORES.map((s) => <View key={s} style={{ flexDirection: 'row', paddingVertical: 3 }}><Text style={{ flex: 1, fontSize: 13, color: base.ink }}>{s}</Text><Text style={{ fontWeight: '600', color: base.ink }}>{a.review?.scores?.[s] ?? '—'} / 5</Text></View>)}
      {!!a.review?.comments && <><Text style={{ fontSize: 12, color: base.slate, marginTop: 8 }}>Comments</Text><Text style={{ color: base.ink }}>{a.review.comments}</Text></>}
      {!!a.review?.goals && <><Text style={{ fontSize: 12, color: base.slate, marginTop: 8 }}>Goals Agreed</Text><Text style={{ color: base.ink }}>{a.review.goals}</Text></>}
      {!!a.summary && <><Text style={{ fontSize: 12, color: base.slate, marginTop: 8 }}>Summary</Text><Text style={{ color: base.ink }}>{a.summary}</Text></>}
      <Muted style={{ marginTop: 8 }}>Reviewed by {nameOf(a.manager_id)}{a.rating ? ` · overall ${a.rating} / 5` : ''}</Muted>
    </Pop>,
  );

  // ---------- Bonus / History ----------
  const bonusPop = (b?: HrBonus) => {
    const v = { period: b?.period ?? '', basis: b?.basis ?? 'safety', target: b?.target ?? '', amount: b?.amount != null ? String(b.amount) : '', status: b?.status ?? 'proposed', notes: b?.notes ?? '' };
    const Body = () => {
      const [f, setF] = useState(v);
      Object.assign(v, f);
      return (
        <View>
          <QBox label="Period" value={f.period} onChangeText={(x) => setF({ ...f, period: x })} placeholder="e.g. October To December 2026" />
          <SelectBox label="For" value={f.basis as never} options={BONUS_BASIS} onChange={(x) => setF({ ...f, basis: x })} />
          <QBox label="Target" value={f.target} onChangeText={(x) => setF({ ...f, target: x })} placeholder="e.g. No accidents and every RAMS signed" multiline />
          <QBox label="Amount (£)" value={f.amount} onChangeText={(x) => setF({ ...f, amount: x.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" />
          <SelectBox label="Where It Stands" value={f.status as never} options={BONUS_STATUS} onChange={(x) => setF({ ...f, status: x })} />
          <QBox label="Notes" value={f.notes} onChangeText={(x) => setF({ ...f, notes: x })} multiline />
        </View>
      );
    };
    setPop(<Pop title={b ? 'Bonus' : 'Add A Bonus'} onClose={close} footer={footer(async () => {
      if (!v.period.trim()) { toast('Which period is it for?'); return false; }
      const row = { period: v.period.trim(), basis: v.basis, target: v.target.trim() || null, amount: v.amount ? Number(v.amount) : null, status: v.status, notes: v.notes.trim() || null };
      return b ? updateBonus(b.id, { ...row, paid_on: v.status === 'paid' ? (b.paid_on || todayIso()) : null }) : addBonus(me, userId, row);
    })}><Body /></Pop>);
  };
  const historyPop = () => {
    const v = { date: todayIso(), kind: 'role', title: '', detail: '' };
    const Body = () => {
      const [f, setF] = useState(v);
      Object.assign(v, f);
      return (
        <View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, marginBottom: 4 }}>Date</Text>
          <DateBox value={f.date} onChange={(x) => setF({ ...f, date: x || todayIso() })} title="Date" style={{ marginBottom: 12 }} />
          <SelectBox label="Type" value={f.kind as never} options={HISTORY_KINDS} onChange={(x) => setF({ ...f, kind: x })} />
          <QBox label="What Happened" value={f.title} onChangeText={(x) => setF({ ...f, title: x })} placeholder="e.g. Promoted to Chargehand" />
          <QBox label="Details" value={f.detail} onChangeText={(x) => setF({ ...f, detail: x })} multiline />
        </View>
      );
    };
    setPop(<Pop title="Add To Job History" onClose={close} footer={footer(async () => {
      if (!v.title.trim()) { toast('What happened?'); return false; }
      return addHistory(me, userId, { on_date: v.date, kind: v.kind, title: v.title.trim(), detail: v.detail.trim() || null });
    })}><Body /></Pop>);
  };

  // ---------- the tabs ----------
  const signed = new Set((pol?.sigs ?? []).filter((s) => s.user_id === userId).map((s) => s.policy_id));
  const details = (
    <>
      {full ? <Card>
        {head(self ? 'Your Personal Details' : 'Personal Details', admin || self ? editPersonal : undefined)}
        {row('Date Of Birth', showDate(rec?.date_of_birth))}
        {row('Home Address', [rec?.home_address, rec?.postcode].filter(Boolean).join(', '))}
        {row('Personal Phone', rec?.personal_phone)}
        {row('Personal Email', rec?.personal_email)}
        {row('Emergency Contact', [rec?.emergency_name, rec?.emergency_relationship ? `(${rec.emergency_relationship})` : '', rec?.emergency_phone].filter(Boolean).join(' '))}
        {self && <Muted style={{ marginTop: 6 }}>Keep these up to date: tap Edit if you move or change your number.</Muted>}
      </Card> : lmSees('emergency') ? <Card>
        {head('Emergency Contact')}
        {row('Name', rec?.emergency_name)}
        {row('Relationship', rec?.emergency_relationship)}
        {row('Phone', rec?.emergency_phone)}
      </Card> : null}
      <Card>
        {head('Employment', admin ? editEmployment : undefined)}
        {row('Job Title', rec?.job_title)}
        {row('Department', rec?.department)}
        {row('Employment Type', employmentLabel(rec?.employment_type))}
        {row('Start Date', showDate(rec?.start_date))}
        {row('Probation Ends', showDate(rec?.probation_end))}
        {full && row('Contracted Hours', rec?.contracted_hours)}
        {row('Line Manager', rec?.line_manager_id ? nameOf(rec.line_manager_id) : null)}
        {!!rec?.end_date && row('Leaving Date', showDate(rec.end_date))}
        {full && row('Right To Work', rec?.rtw_checked_on ? `Checked ${showDate(rec.rtw_checked_on)}${rec.rtw_document ? ` (${rec.rtw_document})` : ''}${rec.rtw_expiry ? `, expires ${showDate(rec.rtw_expiry)}` : ''}` : null)}
      </Card>
      {full && <Card>
        {head('Company Policies', isManager(me) && self ? () => router.push('/pm/hr/policies' as never) : undefined, 'Read And Sign ›')}
        {(pol?.pols ?? []).length ? (pol?.pols ?? []).map((p) => (
          <Pressable key={p.id} accessibilityRole="button" onPress={() => viewDoc(publicUrl('mc-documents', p.storage_path), p.title)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
            <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>{p.title}</Text>
            {chip(signed.has(p.id) ? 'Signed' : 'Not Signed', signed.has(p.id) ? STATE_TONE.ok : STATE_TONE.expiring)}
          </Pressable>
        )) : <Muted>No policies uploaded yet.</Muted>}
      </Card>}
      {!full && <Muted>Of {first}&apos;s folder you see {[lmPerf ? 'their performance' : '', lmSees('emergency') ? 'emergency contact' : '', ...lmFolders.map((f) => f.l.toLowerCase()), lmSees('history') ? 'job history' : ''].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1') || 'their employment details only'}. Contracts, pay and the rest are for the HR team.</Muted>}
    </>
  );
  const docsTab = (
    <>
      {(admin || self) && <View style={{ marginBottom: 10 }}><Button title="+ Add A Document" onPress={() => addDoc()} /></View>}
      {(full ? HR_FOLDERS : lmFolders).map((fo) => {
        const its = states.filter((s) => s.i.folder === fo.k);
        const extra = docs.filter((d) => d.folder === fo.k && !its.some((s) => s.doc?.id === d.id));
        if (!its.length && !extra.length) return null;
        return (
          <Card key={fo.k}>
            {head(fo.l, admin || (self && fo.self) ? () => addDoc(fo.k) : undefined, '+ Add')}
            {its.map(({ i, state, doc }) => (
              <Pressable key={i.key} accessibilityRole="button" accessibilityLabel={i.label} onPress={() => (doc ? void open(doc) : admin || (self && fo.self) ? addDoc(fo.k, i.key) : undefined)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: base.ink }}>{i.label}</Text>
                  <Text numberOfLines={2} style={{ fontSize: 12, color: base.slate }}>{doc ? [doc.title !== i.label ? doc.title : '', doc.doc_date ? showDate(doc.doc_date) : '', doc.expiry_date ? `Expires ${showDate(doc.expiry_date)}` : ''].filter(Boolean).join(' · ') : i.why}</Text>
                </View>
                {chip(STATE_LABEL[state], STATE_TONE[state])}
                {admin && doc && <Pressable accessibilityLabel={`Delete ${doc.title}`} hitSlop={8} onPress={() => void removeDoc(doc)}><Text>🗑</Text></Pressable>}
              </Pressable>
            ))}
            {extra.map((d) => (
              <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={d.title} onPress={() => void open(d)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '500', color: base.ink }}>{d.title}</Text>
                  <Text style={{ fontSize: 12, color: base.slate }}>{[d.doc_date ? showDate(d.doc_date) : '', d.expiry_date ? `Expires ${showDate(d.expiry_date)}` : '', d.hidden_from_employee ? 'Not Shown To Them' : ''].filter(Boolean).join(' · ')}</Text>
                </View>
                {admin && <Pressable accessibilityLabel={`Delete ${d.title}`} hitSlop={8} onPress={() => void removeDoc(d)}><Text>🗑</Text></Pressable>}
              </Pressable>
            ))}
          </Card>
        );
      })}
      <Card>
        {head('Training Certificates & Cards')}
        <CertsPanel userId={userId} />
      </Card>
    </>
  );
  const apps = data?.appraisals ?? [];
  const perf = (
    <>
      <Card>
        {head('Appraisals')}
        <Muted style={{ marginBottom: 8 }}>{appr ? `${appr.open ? 'Open, due' : 'Next due'} ${showDate(appr.due)}${appr.overdue ? ' (overdue)' : ''}. Every ${months} months.` : `Every ${months} months, from the start date${admin ? ' (set it under Details › Employment)' : ''}.`}</Muted>
        {appr?.open ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: base.ink }}>{APPRAISAL_STATUS[appr.open.status]}</Text>
            {self && <Button small title={appr.open.self_answers ? 'Update Your Side' : 'Fill In Your Side'} onPress={() => selfPop(appr.open as Appraisal)} />}
            {canPerf && !self && <Button small title="Review And Sign Off" onPress={() => reviewPop(appr.open as Appraisal)} />}
          </View>
        ) : canPerf && !self ? <Button title="Start An Appraisal" onPress={async () => { if (await startAppraisal(me, userId, appr && appr.due > todayIso() ? appr.due : todayIso(), rec?.line_manager_id ?? null)) refresh(); else toast('Could not start it — try again.'); }} /> : null}
        {apps.filter((a) => a.status === 'done').map((a) => (
          <Pressable key={a.id} accessibilityRole="button" onPress={() => viewAppraisal(a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
            <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>Signed Off {showDate(a.completed_at)}</Text>
            <Text style={{ fontSize: 13, color: base.slate }}>{a.rating ? `${a.rating} / 5` : ''} ›</Text>
          </Pressable>
        ))}
      </Card>
      <Card>
        {head('Goals', canPerf || self ? () => goalPop() : undefined, '+ Add')}
        {(data?.goals ?? []).length ? (data?.goals ?? []).map((g) => (
          <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={g.title} onPress={() => goalPop(g)} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: base.ink }}>{g.title}</Text>
              {chip(goalStatusLabel(g.status), g.status === 'done' ? STATE_TONE.ok : g.status === 'at_risk' ? STATE_TONE.expired : STATE_TONE.missing)}
              {canPerf && <Pressable accessibilityLabel={`Delete goal ${g.title}`} hitSlop={8} onPress={async () => { if (await confirmAsk(`Delete the goal "${g.title}"?`, 'Delete')) { if (await deleteGoal(g.id)) refresh(); } }}><Text>🗑</Text></Pressable>}
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: '#EEF0F2', marginTop: 6, overflow: 'hidden' }}><View style={{ width: `${Math.max(0, Math.min(100, Number(g.progress) || 0))}%`, height: 6, backgroundColor: t.brand1 }} /></View>
            <Text style={{ fontSize: 12, color: base.slate, marginTop: 3 }}>{[`${Number(g.progress) || 0}%`, g.due_date ? `by ${showDate(g.due_date)}` : '', `set by ${nameOf(g.set_by)}`].filter(Boolean).join(' · ')}</Text>
          </Pressable>
        )) : <Muted>No goals yet.</Muted>}
      </Card>
      <Card>
        {head('Feedback', !self ? feedbackPop : undefined, '+ Give Feedback')}
        {(data?.feedback ?? []).length ? (data?.feedback ?? []).map((f) => (
          <View key={f.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {chip(label(FEEDBACK_KINDS, f.kind), f.kind === 'praise' ? STATE_TONE.ok : f.kind === 'improve' ? STATE_TONE.expiring : STATE_TONE.missing)}
              {f.private && chip('Private', STATE_TONE.missing)}
              <Text style={{ flex: 1, fontSize: 12, color: base.slate }}>{nameOf(f.from_id)} · {showDate(f.created_at)}</Text>
              {(admin || f.from_id === me.id) && <Pressable accessibilityLabel="Delete feedback" hitSlop={8} onPress={async () => { if (await confirmAsk('Delete this feedback?', 'Delete')) { if (await deleteFeedback(f.id)) refresh(); } }}><Text>🗑</Text></Pressable>}
            </View>
            <Text style={{ fontSize: 13.5, color: base.ink, marginTop: 4 }}>{f.body}</Text>
          </View>
        )) : <Muted>{self ? 'No feedback yet.' : `Be the first to say something good about ${first}.`}</Muted>}
      </Card>
    </>
  );
  const bonus = (
    <Card>
      {head('Bonus', admin ? () => bonusPop() : undefined, '+ Add')}
      {(data?.bonuses ?? []).length ? (data?.bonuses ?? []).map((b) => (
        <Pressable key={b.id} accessibilityRole="button" disabled={!admin} onPress={() => bonusPop(b)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: base.ink }}>{b.period} · {label(BONUS_BASIS, b.basis)}</Text>
            {!!b.target && <Text style={{ fontSize: 12, color: base.slate }}>{b.target}</Text>}
          </View>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: base.ink }}>{money(b.amount)}</Text>
          {chip(label(BONUS_STATUS, b.status), b.status === 'paid' ? STATE_TONE.ok : b.status === 'not_met' ? STATE_TONE.missing : STATE_TONE.expiring)}
        </Pressable>
      )) : <Muted>{admin ? 'No bonuses yet. Ideas that suit a roofing firm: a safety bonus (no accidents, every RAMS signed), snag-free handovers, finishing on programme, attendance.' : 'No bonuses yet.'}</Muted>}
    </Card>
  );
  const history = (
    <Card>
      {head('Job History', admin ? historyPop : undefined, '+ Add')}
      {(data?.history ?? []).map((h) => (
        <View key={h.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
          <Text style={{ width: 96, fontSize: 12.5, color: base.slate }}>{showDate(h.on_date)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: base.ink }}>{h.title}</Text>
            <Text style={{ fontSize: 12, color: base.slate }}>{[label(HISTORY_KINDS, h.kind), h.detail].filter(Boolean).join(' · ')}</Text>
          </View>
          {admin && <Pressable accessibilityLabel={`Delete ${h.title}`} hitSlop={8} onPress={async () => { if (await confirmAsk(`Delete "${h.title}" from the history?`, 'Delete')) { if (await deleteHistory(h.id)) refresh(); } }}><Text>🗑</Text></Pressable>}
        </View>
      ))}
      {!!rec?.start_date && (
        <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
          <Text style={{ width: 96, fontSize: 12.5, color: base.slate }}>{showDate(rec.start_date)}</Text>
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: base.ink }}>Started{rec.job_title ? ` as ${rec.job_title}` : ''}</Text>
        </View>
      )}
      {!(data?.history ?? []).length && !rec?.start_date && <Muted>Nothing yet.</Muted>}
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: t.brand1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.brand1Text, fontWeight: '700' }}>{name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: base.ink }}>{name}</Text>
              <Text style={{ fontSize: 13, color: base.slate }}>{[rec?.job_title, employmentLabel(rec?.employment_type) !== '—' ? employmentLabel(rec?.employment_type) : '', rec?.start_date ? `Since ${showDate(rec.start_date)}` : ''].filter(Boolean).join(' · ') || 'Nothing filled in yet'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {full && chip(attention ? `${attention} Document${attention === 1 ? '' : 's'} To Sort` : 'Documents Up To Date', attention ? STATE_TONE.expiring : STATE_TONE.ok)}
            {!!appr && (full || lmPerf) && !left && chip(`Appraisal ${appr.overdue ? 'Overdue' : `Due ${showDate(appr.due)}`}`, appr.overdue ? STATE_TONE.expired : STATE_TONE.missing)}
            {left && chip(`Left ${showDate(rec?.end_date)}`, STATE_TONE.missing)}
          </View>
          {self && !!who && (() => {
            const hr = who.people.filter((p) => p.id !== me.id).map((p) => p.name);
            const also = who.sees_mine.filter((p) => p.id !== me.id && !hr.includes(p.name)).map((p) => p.name);
            return <Muted style={{ marginTop: 10 }}>🔒 Who Can See Your Folder: you{hr.length ? `, and HR: ${hr.join(', ')}` : ''}.{also.length ? ` ${also.join(', ')} ${also.length === 1 ? 'sees' : 'see'} only the parts HR allows.` : ''}</Muted>;
          })()}
        </Card>
        {/* The tabs: across the page on a laptop; on a phone they slide sideways rather than squash (each its own width). */}
        <ScrollView horizontal={!desk} scrollEnabled={!desk} showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }} contentContainerStyle={{ flexGrow: 1, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: base.line }}>
          {tabs.map(([k, l]) => (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} accessibilityLabel={l} onPress={() => setTab(k)}
              style={{ ...(desk ? { flex: 1 } : { paddingHorizontal: 14 }), alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: tab === k ? t.brand1 : 'transparent', marginBottom: -1 }}>
              <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: tab === k ? '700' : '600', color: tab === k ? base.ink : base.slate }}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {isLoading ? <Muted>Loading…</Muted> : tab === 'details' ? details : tab === 'docs' ? docsTab : tab === 'perf' ? perf : tab === 'bonus' ? bonus : history}
        <View style={{ height: 24 }} />
      </ScrollView>
      {pop}
    </View>
  );
}

