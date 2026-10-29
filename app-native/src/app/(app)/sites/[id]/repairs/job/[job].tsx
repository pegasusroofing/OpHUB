// One repair job (340 renderRepairJobDetail). Status (managers can override),
// job details and work order, survey booking, the survey (notes, photos, access;
// notes and a photo needed to complete it), self-authorise for operatives,
// approval / variation cost, scaffold, progress and completion (notes and a
// photo needed), then sign-off and invoicing. Key dates go on the site Calendar.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage, useStorageUrl } from '@/components/StorageImage';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { useSite } from '@/data/sites';
import { repairReportsAfter, scheduleRepairReport, syncRepairPhotos } from '@/data/repairOneDrive';
import { exportRepairReport } from '@/lib/repairReportPdf';
import { addRepairPhotos, deleteRepairJob, hasRepairPhoto, hideRepairPhoto, notifyPmOfRepairNotes, patchRepairJob, syncRepairEvent, uploadWorkOrder, useRepairJob, type RepairPhoto } from '@/data/repairs';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import { useFlushOnLeave } from '@/lib/useFlushOnLeave';
import { readIsoDate } from '@/lib/rules/materials';
import { approveStatus, needsScaffold, progressMove, REPAIR_ACCESS, REPAIR_STATUSES, scaffoldMove, surveyStatusMove, type RepairJob } from '@/lib/rules/repairs';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const HINT: Record<string, string> = {
  'To Survey': 'Waiting on a survey.', 'Surveyed - Variation Issued': 'Cost sent to the client — awaiting their decision.',
  'Approved - Awaiting Scaffold': 'Approved — waiting on scaffold to go up.', 'Approved - To Do': 'Approved and ready to be worked.', 'In Progress': 'Work under way.',
  Rejected: 'Quote rejected.', 'Awaiting Sign-off': 'Operative has marked this complete — awaiting PM sign-off.', Closed: 'Closed.',
};
const fmt = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const Label = ({ children }: { children: ReactNode }) => <Text style={{ fontSize: 12, fontWeight: '700', color: base.slate, marginTop: 10, marginBottom: 4 }}>{children}</Text>;

function Photo({ p, onRemove }: { p: RepairPhoto; onRemove?: () => void }) {
  const big = useStorageUrl('site-photos', p.hires_path || p.storage_path);
  return (
    <Pressable onPress={() => { if (big) void Linking.openURL(big); }} style={{ position: 'relative' }}>
      <StorageImage bucket="site-photos" path={p.storage_path} style={{ width: 76, height: 76, borderRadius: 8 }} />
      {!!onRemove && <Pressable hitSlop={6} onPress={onRemove} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11 }}>✕</Text></Pressable>}
    </Pressable>
  );
}

export default function RepairJobPage() {
  const { id, job: jobId } = useLocalSearchParams<{ id: string; job: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useRepairJob(jobId);
  const { data: people = [] } = usePeople();
  const { data: site } = useSite(id);
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [surveyEdit, setSurveyEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [odNote, setOdNote] = useState('');
  // Notes typed but not saved are saved (and the PM emailed) when you leave the page or the app (340 flushRepairJobUnsavedNotes).
  const flushNotes = useRef<(() => Promise<unknown>) | null>(null);
  useFlushOnLeave(flushNotes);
  // Photos not yet in OneDrive go when the job opens and when the app comes back to the front (e.g. after the camera).
  useEffect(() => {
    if (!jobId) return;
    const go = () => { void syncRepairPhotos(jobId).then((r) => { if (r.failed) toast(`${r.failed} photo${r.failed === 1 ? '' : 's'} still to go to OneDrive — will retry`); }); };
    const t = setTimeout(go, 1200);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setTimeout(go, 1500); });
    return () => { clearTimeout(t); sub.remove(); };
  }, [jobId, toast]);
  if (!me) return null;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const job = data.job;
  if (!job) return <Muted style={{ padding: space.l }}>This job no longer exists.</Muted>;
  const mgr = isManager(me);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['repairJob', jobId] }); void qc.invalidateQueries({ queryKey: ['repairJobs', id] }); };
  // The Survey / Completed Works reports in OneDrive are rebuilt after a change that's in them.
  const reportsAfter = (j: Record<string, unknown>, c: { keys?: string[]; photoCategory?: string }) => repairReportsAfter(j, c).forEach((k) => scheduleRepairReport(k, job.id, org, k === 'survey' && job.surveyed_by ? nameOf(people, job.surveyed_by) : ''));
  const save = async (patch: Partial<RepairJob> & Record<string, unknown>, msg = 'Saved') => { const ok = await patchRepairJob(job.id, patch); toast(ok ? msg : 'Could not save — try again.'); refresh(); if (ok) reportsAfter({ ...job, ...patch }, { keys: Object.keys(patch) }); return ok; };
  const val = (k: keyof RepairJob) => (draft[k] ?? (job[k] == null ? '' : String(job[k])));
  const setVal = (k: keyof RepairJob) => (v: string) => setDraft({ ...draft, [k]: v });
  const ops = people.filter((p) => p.role === 'operative');
  const label = job.address || 'Repair Job';
  const surveyDone = job.survey_required === 'Y' || job.survey_required === 'NA';
  const surveying = !surveyDone || surveyEdit;
  const canEditSurvey = mgr || job.surveyed_by === me.id;
  const approved = job.quote_approved === true, rejected = job.quote_approved === false;
  const canSelfAuth = !mgr && surveyDone && job.quote_approved == null && job.access_requirement !== 'scaffold';
  const live = data.photos.filter((p) => !p.deleted_at), gone = data.photos.filter((p) => p.deleted_at);
  const pickDate = (v: string) => { const d = readIsoDate(v); if (d === 'bad') { toast('Enter the date as YYYY-MM-DD.'); return undefined; } return d || null; };

  const photoRow = (category: string, title: string) => {
    const list = live.filter((p) => p.category === category), hiddenOnes = mgr ? gone.filter((p) => p.category === category) : [];
    return (
      <View style={{ marginTop: 8 }}>
        <Label>{title}{list.length ? ` (${list.length})` : ''}</Label>
        {list.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>{list.map((p) => <Photo key={p.id} p={p} onRemove={mgr ? async () => {
          if (!(await confirmAsk('Remove this photo? It stays saved on the job under "Deleted photos" so you can restore it.', 'Remove'))) return;
          toast((await hideRepairPhoto(me, p.id)) ? 'Photo removed' : 'Could not remove — try again.'); refresh(); reportsAfter(job, { photoCategory: category });
        } : undefined} />)}</View>}
        <Button kind="ghost" busy={busy === category} title="📷 Add photos" onPress={async () => {
          const src = await chooseAction('Add photos', [{ key: 'camera', label: 'Take a photo' }, { key: 'library', label: 'Choose from library' }]);
          if (!src) return;
          const picked = await pickPhotos(src as 'camera' | 'library', true);
          if ('error' in picked) { showAlert(picked.error); return; }
          if (!picked.length) return;
          setBusy(category); const failed = await addRepairPhotos(me, job.id, category, picked); setBusy(null);
          toast(failed ? `${failed} photo${failed === 1 ? '' : 's'} failed to upload — try again.` : 'Photo(s) added'); refresh(); reportsAfter(job, { photoCategory: category });
        }} />
        {hiddenOnes.length > 0 && <Pressable onPress={async () => {
          const k = await chooseAction('Deleted photos — tap one to restore', hiddenOnes.map((p, i) => ({ key: p.id, label: `Photo ${i + 1}${p.uploaded_at ? ` · ${fmt(p.uploaded_at)}` : ''}` })));
          if (k) { toast((await hideRepairPhoto(me, k, true)) ? 'Photo restored' : 'Could not restore — try again.'); refresh(); reportsAfter(job, { photoCategory: category }); }
        }}><Muted style={{ textDecorationLine: 'underline' }}>Deleted photos ({hiddenOnes.length})</Muted></Pressable>}
      </View>
    );
  };

  const setSurvey = async (value: string) => {
    const patch: Record<string, unknown> = { survey_required: value };
    if (value === 'Y') {
      const notes = val('survey_notes').trim();
      if (!notes) { toast('Add survey notes before marking the survey complete.'); return; }
      if (!(await hasRepairPhoto(job.id, 'survey'))) { toast('Add at least one survey photo before marking the survey complete.'); return; }
      patch.survey_notes = notes;
      if (!job.surveyed_by) patch.surveyed_by = me.id;
      if (!job.survey_date) patch.survey_date = new Date().toISOString();
    }
    const date = (patch.survey_date as string | undefined) || job.survey_date;
    patch.survey_event_id = await syncRepairEvent(me, job.site_id, job.survey_event_id, date ? date.slice(0, 10) : null, `Survey: ${label}`);
    const next = surveyStatusMove(job, value); if (next) patch.job_status = next;
    if (await save(patch)) { setSurveyEdit(false); if (value === 'Y' && draft.survey_notes != null) notifyPmOfRepairNotes(job.id, job.site_id, 'survey', patch.survey_notes as string); setDraft({}); }
  };
  const saveNotes = async (k: 'survey_notes' | 'progress_notes' | 'works_notes' | 'priced_schedule_of_works') => {
    const v = val(k).trim();
    const patch: Record<string, unknown> = { [k]: v || null };
    if (k === 'survey_notes' && !job.surveyed_by) patch.surveyed_by = me.id;
    if (k === 'progress_notes') { const n = progressMove(job, v); if (n) patch.job_status = n; }
    if (await save(patch)) {
      const { [k]: _drop, ...rest } = draft; setDraft(rest);
      const section = { survey_notes: 'survey', progress_notes: 'progress', works_notes: 'completion' }[k as string] as 'survey' | 'progress' | 'completion' | undefined;
      if (section) notifyPmOfRepairNotes(job.id, job.site_id, section, v);
    }
  };
  // eslint-disable-next-line react-hooks/refs
  flushNotes.current = async () => { for (const k of ['survey_notes', 'progress_notes', 'works_notes', 'priced_schedule_of_works'] as const) if (draft[k] != null && draft[k] !== (job[k] || '')) await saveNotes(k); };
  const notesBox = (k: 'survey_notes' | 'progress_notes' | 'works_notes' | 'priced_schedule_of_works', placeholder: string) => (
    <>
      <TextInput value={val(k)} onChangeText={setVal(k)} placeholder={placeholder} multiline style={[box, { minHeight: 70 }]} />
      {draft[k] != null && draft[k] !== (job[k] || '') && <Button kind="ghost" title="Save notes" onPress={() => void saveNotes(k)} />}
    </>
  );
  const pickPerson = async (title: string) => chooseAction(title, [{ key: '', label: 'Unassigned' }, ...ops.map((p) => ({ key: p.id, label: p.name }))]);

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: label }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}><Muted style={{ fontWeight: '700' }}>Status</Muted><Text style={{ fontSize: 15, fontWeight: '800', color: base.ink }}>{job.job_status || 'To Survey'}</Text></View>
          {mgr && <Pressable onPress={async () => { const k = await chooseAction('Move this job to', REPAIR_STATUSES.map((s) => ({ key: s, label: s }))); if (k) void save({ job_status: k }); }}><Text style={{ color: base.blue, fontWeight: '700' }}>Change ▾</Text></Pressable>}
        </View>
        {!!(job.job_status === 'Surveyed - Awaiting Cost' ? (mgr ? 'Enter a variation cost and issue it to the client, or approve/reject directly below.' : 'Awaiting a cost decision from the office.') : HINT[job.job_status || '']) && (
          <Muted style={{ marginTop: 6 }}>{job.job_status === 'Surveyed - Awaiting Cost' ? (mgr ? 'Enter a variation cost and issue it to the client, or approve/reject directly below.' : 'Awaiting a cost decision from the office.') : HINT[job.job_status || '']}</Muted>
        )}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{label}</Text>
          {mgr && <Pressable onPress={() => setEdit(edit ? null : { job_number: job.job_number || '', address: job.address || '', description: job.description || '' })}><Text style={{ color: base.blue, fontWeight: '700' }}>{edit ? 'Cancel' : 'Edit'}</Text></Pressable>}
        </View>
        {edit ? (
          <View style={{ marginTop: 8 }}>
            <TextInput value={edit.job_number} onChangeText={(v) => setEdit({ ...edit, job_number: v })} placeholder="Job number" style={box} />
            <TextInput value={edit.address} onChangeText={(v) => setEdit({ ...edit, address: v })} placeholder="Address" style={box} />
            <TextInput value={edit.description} onChangeText={(v) => setEdit({ ...edit, description: v })} placeholder="Description of call out" multiline style={[box, { minHeight: 56 }]} />
            <Button title="Save Job Details" onPress={async () => { if (!edit.address.trim()) { toast('Enter an address.'); return; } if (await save({ job_number: edit.job_number.trim() || null, address: edit.address.trim(), description: edit.description.trim() || null })) setEdit(null); }} />
          </View>
        ) : (
          <>
            {!!job.job_number && <Muted>Job #{job.job_number}</Muted>}
            {!!job.description && <Muted>{job.description}</Muted>}
          </>
        )}
        <Label>Work Order</Label>
        {job.work_order_path ? <Pressable onPress={async () => { const u = await openDocLink('site-photos', job.work_order_path as string); if (u) void Linking.openURL(u); else toast('Could not open the file.'); }}><Text style={{ fontWeight: '600', textDecorationLine: 'underline', color: base.ink }}>📄 View work order</Text></Pressable> : <Muted>None attached.</Muted>}
        {mgr && <Button kind="ghost" busy={busy === 'wo'} title={job.work_order_path ? 'Replace File' : '+ Upload Work Order'} onPress={async () => {
          const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
          setBusy('wo'); const ok = await uploadWorkOrder(me, job, { uri: r.assets[0].uri, name: r.assets[0].name || 'work-order.pdf', mimeType: r.assets[0].mimeType }); setBusy(null);
          toast(ok ? 'Work order saved' : 'Upload failed — try again.'); refresh();
        }} />}
        {mgr ? (
          <>
            <Label>Survey booking</Label>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={val('survey_booking_date')} onChangeText={setVal('survey_booking_date')} placeholder="Date (YYYY-MM-DD)" autoCapitalize="none" style={[box, { flex: 1 }]} />
              <Pressable onPress={async () => { const k = await pickPerson('Assign survey to'); if (k !== null) setDraft({ ...draft, survey_booking_assigned_to: k }); }} style={[box, { flex: 1, justifyContent: 'center' }]}>
                <Text style={{ color: base.ink }} numberOfLines={1}>▼ {val('survey_booking_assigned_to') ? nameOf(people, val('survey_booking_assigned_to')) : 'Unassigned'}</Text>
              </Pressable>
            </View>
            {(draft.survey_booking_date != null || draft.survey_booking_assigned_to != null) && <Button kind="ghost" title="Save Booking" onPress={async () => {
              const d = pickDate(val('survey_booking_date')); if (d === undefined) return;
              const who = val('survey_booking_assigned_to') || null;
              const ev = await syncRepairEvent(me, job.site_id, job.survey_booking_event_id, d, `Survey Booking: ${label}`, who ? [who] : []);
              if (await save({ survey_booking_date: d, survey_booking_assigned_to: who, survey_booking_event_id: ev })) setDraft({});
            }} />}
          </>
        ) : job.survey_booking_date && job.survey_booking_assigned_to === me.id ? <><Label>Survey booking</Label><Muted>{fmt(job.survey_booking_date)} — you&apos;re assigned to this one</Muted></> : null}
        {!!job.survey_date && <><Label>Survey Date</Label><Text style={{ fontWeight: '800', color: base.ink }}>{fmt(job.survey_date)}{job.surveyed_by ? ` · ${nameOf(people, job.surveyed_by)}` : ''}</Text></>}
        {mgr && <Button kind="ghost" title="Delete Job" onPress={async () => {
          if (!(await confirmAsk('Permanently delete this job and all its photos? This cannot be undone.', 'Delete'))) return;
          if (await deleteRepairJob(job)) { toast('Job deleted'); void qc.invalidateQueries({ queryKey: ['repairJobs', id] }); router.back(); } else toast('Could not delete — try again.');
        }} />}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}><SectionTitle>Survey</SectionTitle></View>
          {surveyDone && <Text style={{ color: base.ok, fontWeight: '700' }}>✅ {job.survey_required === 'NA' ? 'N/A' : `Completed ${fmt(job.survey_date)}`}</Text>}
        </View>
        {!surveying ? (
          <>
            <Muted>{job.surveyed_by ? `Surveyed by ${nameOf(people, job.surveyed_by)}` : ''}{job.access_requirement && job.access_requirement !== 'none' ? `${job.surveyed_by ? ' · ' : ''}Access: ${REPAIR_ACCESS[job.access_requirement] || job.access_requirement}` : ''}</Muted>
            {!!job.survey_notes && <Text style={{ color: base.ink, marginTop: 6 }}>{job.survey_notes}</Text>}
            {live.some((p) => p.category === 'survey' || p.category === 'access') && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{live.filter((p) => p.category === 'survey' || p.category === 'access').map((p) => <Photo key={p.id} p={p} />)}</View>}
            {canEditSurvey && <Button kind="ghost" title="✎ Edit survey" onPress={() => setSurveyEdit(true)} />}
          </>
        ) : (
          <>
            <Label>Survey completed?</Label>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[['N', 'To Survey'], ['Y', 'Completed'], ['NA', 'N/A']].map(([k, l]) => (
                <Pressable key={k} onPress={() => void setSurvey(k)} style={{ flex: k === 'NA' ? 0.5 : 1, padding: 10, borderRadius: radius.input, borderWidth: 1, borderColor: (job.survey_required || 'N') === k ? base.ink : base.line, backgroundColor: (job.survey_required || 'N') === k ? (k === 'Y' ? base.okBg : base.paper) : base.card, alignItems: 'center' }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{l}</Text>
                </Pressable>
              ))}
            </View>
            <Label>Survey notes / quoted works</Label>
            {notesBox('survey_notes', 'Survey notes / quoted works')}
            {photoRow('survey', 'Survey / before photos')}
            <Label>Access requirement</Label>
            <Pressable onPress={async () => { const k = await chooseAction('Access requirement', Object.entries(REPAIR_ACCESS).map(([key, l]) => ({ key, label: l }))); if (k) void save({ access_requirement: k }); }} style={[box, { paddingVertical: 12 }]}>
              <Text style={{ color: base.ink }}>▼ {REPAIR_ACCESS[job.access_requirement || 'none'] || 'None'}</Text>
            </Pressable>
            <TextInput value={val('access_notes')} onChangeText={setVal('access_notes')} placeholder="Access-specific notes (e.g. where a tower needs to go up)" multiline style={[box, { minHeight: 50 }]} />
            {draft.access_notes != null && <Button kind="ghost" title="Save Access Details" onPress={async () => { if (await save({ access_notes: val('access_notes').trim() || null })) setDraft({}); }} />}
            {needsScaffold(job) && photoRow('access', 'Scaffold/tower access photo')}
            {job.survey_required !== 'Y' ? <Button title="✅ Mark Survey as Completed" onPress={() => void setSurvey('Y')} /> : <Button kind="ghost" title="Done editing" onPress={() => setSurveyEdit(false)} />}
          </>
        )}
      </Card>

      {!surveyDone ? <Muted style={{ textAlign: 'center', marginBottom: 16 }}>Complete the survey to unlock the rest of this job.</Muted> : (
        <>
          {canSelfAuth && (
            <Card>
              <SectionTitle>Ready to do this job?</SectionTitle>
              <Muted style={{ marginBottom: 8 }}>If you can do this one now without waiting on a quote decision, self-authorise it here and get started straight away.</Muted>
              <Button title="✅ I Can Do This Now — Self-Authorise" onPress={async () => {
                if (!(await confirmAsk("Self-authorise this job? You're confirming you can do the work now without PM approval.", 'Self-authorise'))) return;
                void save({ quote_approved: true, quote_approved_at: new Date().toISOString(), approved_by: me.id, self_authorized: true, job_status: 'Approved - To Do' });
              }} />
            </Card>
          )}
          {mgr && needsScaffold(job) && approved && (
            <Card>
              <SectionTitle>Scaffold</SectionTitle>
              <Label>Scaffold booking date</Label>
              <TextInput value={val('scaffold_booking_date')} onChangeText={setVal('scaffold_booking_date')} placeholder="YYYY-MM-DD" autoCapitalize="none" style={box} />
              <Label>Assign booking to</Label>
              <Pressable onPress={async () => { const k = await pickPerson('Assign booking to'); if (k !== null) setDraft({ ...draft, scaffold_booking_assigned_to: k }); }} style={[box, { paddingVertical: 12 }]}>
                <Text style={{ color: base.ink }}>▼ {val('scaffold_booking_assigned_to') ? nameOf(people, val('scaffold_booking_assigned_to')) : 'Unassigned'}</Text>
              </Pressable>
              <Label>Scaffold erection date</Label>
              <TextInput value={val('scaffold_erection_date')} onChangeText={setVal('scaffold_erection_date')} placeholder="YYYY-MM-DD" autoCapitalize="none" style={box} />
              <Button kind="ghost" title="Save" onPress={async () => {
                const b = pickDate(val('scaffold_booking_date')), e = pickDate(val('scaffold_erection_date')); if (b === undefined || e === undefined) return;
                const who = val('scaffold_booking_assigned_to') || null;
                const [be, ee] = await Promise.all([
                  syncRepairEvent(me, job.site_id, job.scaffold_booking_event_id, b, `Scaffold Booking: ${label}`, who ? [who] : []),
                  syncRepairEvent(me, job.site_id, job.scaffold_erection_event_id, e, `Scaffold Erection: ${label}`),
                ]);
                const next = scaffoldMove(job, e);
                if (await save({ scaffold_booking_date: b, scaffold_erection_date: e, scaffold_booking_assigned_to: who, scaffold_booking_event_id: be, scaffold_erection_event_id: ee, ...(next ? { job_status: next } : {}) })) setDraft({});
              }} />
              {photoRow('scaffold', 'Scaffold photos')}
            </Card>
          )}
          {mgr && (
            <Card>
              <SectionTitle>Approval</SectionTitle>
              {approved || rejected ? (
                <>
                  <Muted style={{ marginBottom: 8, color: rejected ? base.red : base.ink }}>{approved ? `✅ Approved${job.quote_approved_at ? ` on ${fmt(job.quote_approved_at)}` : ''}${job.self_authorized ? ` — self-authorised by ${nameOf(people, job.approved_by)}` : job.approved_by ? ` by ${nameOf(people, job.approved_by)}` : ''}` : '❌ Rejected'}</Muted>
                  {approved ? <Button kind="ghost" title="Reject instead" onPress={async () => { if (await confirmAsk('Reject this job? The operative/PM will need to review it again.', 'Reject')) void save({ quote_approved: false, quote_approved_at: null, approved_by: null, self_authorized: false, job_status: 'Rejected' }); }} />
                    : <Button kind="ghost" title="Approve instead" onPress={() => void save({ quote_approved: true, approved_by: me.id, self_authorized: false, job_status: approveStatus(job), ...(job.quote_approved_at ? {} : { quote_approved_at: new Date().toISOString() }) })} />}
                  <Button kind="ghost" title="↺ Undo — back to awaiting approval" onPress={async () => {
                    if (!(await confirmAsk('Put this job back to awaiting approval?', 'Undo'))) return;
                    void save({ quote_approved: null, quote_approved_at: null, approved_by: null, self_authorized: false, job_status: job.variation_issued_at ? 'Surveyed - Variation Issued' : 'Surveyed - Awaiting Cost' });
                  }} />
                </>
              ) : (
                <>
                  <Label>Variation works (£)</Label>
                  <TextInput value={val('variation_cost')} onChangeText={setVal('variation_cost')} keyboardType="decimal-pad" placeholder="0.00" style={box} />
                  {job.variation_issued_at ? <Muted style={{ marginBottom: 8 }}>Cost issued to the client {fmt(job.variation_issued_at)} — awaiting their decision.</Muted>
                    : <Button kind="ghost" title="Issue variation cost" onPress={() => { const v = val('variation_cost'); if (v === '') { toast('Enter the variation cost first.'); return; } void save({ variation_cost: Number(v), variation_issued_at: new Date().toISOString(), job_status: 'Surveyed - Variation Issued' }); }} />}
                  <Label>Priced schedule of works</Label>
                  {notesBox('priced_schedule_of_works', 'Priced schedule of works')}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><Button title="✅ Approve" onPress={() => void save({ quote_approved: true, approved_by: me.id, self_authorized: false, job_status: approveStatus(job), ...(job.quote_approved_at ? {} : { quote_approved_at: new Date().toISOString() }) })} /></View>
                    <View style={{ flex: 1 }}><Button kind="ghost" title="❌ Reject" onPress={async () => { if (await confirmAsk('Reject this job? The operative/PM will need to review it again.', 'Reject')) void save({ quote_approved: false, quote_approved_at: null, approved_by: null, self_authorized: false, job_status: 'Rejected' }); }} /></View>
                  </View>
                </>
              )}
            </Card>
          )}
          {approved && (
            <Card>
              <SectionTitle>Progress / Completion</SectionTitle>
              <Label>Progress notes</Label>
              {notesBox('progress_notes', 'Progress notes')}
              {photoRow('progress', 'Progress photos')}
              <Label>Completion notes</Label>
              {!!job.works_completed_date && <Muted>Marked complete {fmt(job.works_completed_date)}{job.works_completed && !job.closed ? ' — awaiting PM sign-off' : ''}</Muted>}
              {notesBox('works_notes', 'Completion notes')}
              {photoRow('completion', 'Completion photos (required to mark complete)')}
              {!job.works_completed ? <Button title="✅ Mark Works as Completed" onPress={async () => {
                const notes = val('works_notes').trim();
                if (!notes) { toast('Add completion notes before marking the works complete.'); return; }
                if (!(await hasRepairPhoto(job.id, 'completion'))) { toast('Add at least one completion photo before marking the works complete.'); return; }
                const when = job.works_completed_date || new Date().toISOString();
                const ev = await syncRepairEvent(me, job.site_id, job.works_completed_event_id, when.slice(0, 10), `Job Completed: ${label}`);
                if (await save({ works_completed: true, works_notes: notes, works_completed_date: when, works_completed_event_id: ev, ...(job.closed ? {} : { job_status: 'Awaiting Sign-off' }) })) setDraft({});
              }} /> : !job.closed && <Button kind="ghost" title="Undo — not actually complete" onPress={async () => {
                const ev = await syncRepairEvent(me, job.site_id, job.works_completed_event_id, null, `Job Completed: ${label}`);
                void save({ works_completed: false, works_completed_event_id: ev, job_status: 'In Progress' });
              }} />}
            </Card>
          )}
          {mgr && (
            <Card>
              <SectionTitle>Admin</SectionTitle>
              {job.closed ? (
                <>
                  <Muted style={{ marginBottom: 8 }}>✅ Signed off — {job.invoiced ? 'invoiced, fully closed' : 'closed subject to invoice'}.</Muted>
                  {job.invoiced ? <Button kind="ghost" title="Undo invoiced (back to subject to invoice)" onPress={() => void save({ invoiced: false }, 'Back to closed subject to invoice')} />
                    : <Button title="🧾 Mark as Invoiced — fully close" onPress={async () => { if (await confirmAsk('Mark this job as invoiced? It will be fully closed.', 'Mark invoiced')) void save({ invoiced: true }, 'Invoiced — job fully closed'); }} />}
                  <Button kind="ghost" title="Reopen Job" onPress={() => void save({ closed: false, closed_by: null, closed_at: null, job_status: 'Awaiting Sign-off' })} />
                </>
              ) : job.works_completed ? (
                <>
                  <Button title="✅ Sign Off & Close Job" onPress={async () => { if (await confirmAsk("Sign off and close this job, subject to invoice? It will drop off the operative's list.", 'Sign off')) void save({ closed: true, closed_by: me.id, closed_at: new Date().toISOString(), job_status: 'Closed' }); }} />
                  <Muted>This closes it subject to invoice and removes it from the operative&apos;s list. Mark it invoiced afterwards to fully close it.</Muted>
                </>
              ) : <Muted>Sign-off becomes available once the operative marks the works completed.</Muted>}
            </Card>
          )}
        </>
      )}
      <Button kind="ghost" title="☁️ Link this job's OneDrive folder" onPress={() => router.push({ pathname: '/pm/onedrive-pick', params: { target: 'repairjob', id: jobId } } as never)} />
      {mgr && <Button kind="ghost" busy={!!odNote} title={odNote ? `Sending to OneDrive… ${odNote}` : '☁️ Send everything on this job to OneDrive'} onPress={async () => {
        setOdNote('…');
        const r = await syncRepairPhotos(job.id, { force: true, onProgress: setOdNote, reports: { org, surveyor: job.surveyed_by ? nameOf(people, job.surveyed_by) : '' } }).finally(() => setOdNote(''));
        toast(!r.linked ? 'Link a OneDrive folder first.' : r.failed ? `${r.done} photo${r.done === 1 ? '' : 's'} sent to OneDrive, ${r.failed} didn’t go — they’ll retry next time the job is opened` : `Sent ${r.done} photo${r.done === 1 ? '' : 's'} to OneDrive`);
      }} />}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.xl }}>
        <View style={{ flex: 1 }}><Button kind="ghost" title="📄 Survey report PDF" onPress={async () => { if (!(await exportRepairReport('survey', job, site, org, job.surveyed_by ? nameOf(people, job.surveyed_by) : '').catch(() => false))) toast('Could not build the PDF.'); }} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="📄 Completed works PDF" onPress={async () => { if (!(await exportRepairReport('completion', job, site, org, '').catch(() => false))) toast('Could not build the PDF.'); }} /></View>
      </View>
    </ScrollView>
  );
}
