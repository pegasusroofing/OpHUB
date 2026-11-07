// An operative opening a repair job (Andy, 7 Nov 2026): check in by GPS (against the job's address), then the steps —
// 1. Description Of Fault Found, 2. Description Of Repair Required, 3. Photos, 4. Completed Repair Whilst In Attendance?
// (No — Needs A Quote unless they pick Yes) Yes → 5. Completion Photos and Description Of Works Completed; No → the
// attendance report goes to the office (and OneDrive) to price — then Check Out. No quote figures here: just whether
// the quote has been submitted (Andy, 7 Nov 2026).
// Coming back for the works (quote approved): straight to the completion step.
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { viewDoc } from '@/components/DocViewer';
import { RepairPhotos } from '@/components/RepairPhotos';
import { showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { openDocLink } from '@/data/hs';
import { repairCheck, useRepairCheck } from '@/data/repairCheckin';
import { useSite } from '@/data/sites';
import { exportRepairReport } from '@/lib/repairReportPdf';
import { repairReportsAfter, scheduleRepairReport } from '@/data/repairOneDrive';
import { hasRepairPhoto, notifyPmOfRepairNotes, patchRepairJob, syncRepairEvent, useRepairJob, useRepairJobs } from '@/data/repairs';
import { useAuth } from '@/lib/auth';
import { repairStage, type RJob } from '@/lib/rules/repairStages';
import type { RepairJob } from '@/lib/rules/repairs';
import { base, page, radius, space, useTheme } from '@/theme/theme';

type Row = Record<string, any>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, fontSize: 15, minHeight: 64 } as const;

export function RepairOperative({ siteId, jobId }: { siteId: string; jobId: string }) {
  const { me, org } = useAuth();
  const t = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useRepairJob(jobId);
  const { data: jobs = [] } = useRepairJobs(siteId);
  const { data: chk, refetch: refetchChk } = useRepairCheck(siteId, jobId, me?.id);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [inVisit, setInVisit] = useState<'no' | 'yes'>('no');
  const { data: site } = useSite(siteId);
  if (!me) return null;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const job = data.job as (RepairJob & RJob & Row) | null;
  if (!job) return <Muted style={{ padding: space.l }}>This job no longer exists.</Muted>;
  const st = repairStage(job);
  const worksVisit = job.quote_approved === true;
  const inNow = !!chk?.in;
  const refresh = () => { ['repairJob', 'repairJobs'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); };
  const val = (k: string) => (draft[k] ?? (job[k] == null ? '' : String(job[k])));
  const changed = (k: string) => draft[k] != null && draft[k] !== (job[k] || '');
  const save = async (patch: Row, msg?: string) => {
    const ok = await patchRepairJob(job.id, patch);
    if (!ok) { toast('Could not save — try again.'); return false; }
    if (msg) toast(msg);
    refresh();
    repairReportsAfter({ ...job, ...patch }, { keys: Object.keys(patch) }).forEach((k) => scheduleRepairReport(k, job.id, org, me.name));
    return true;
  };
  const saveText = async (k: string) => { if (await save({ [k]: val(k).trim() || null })) setDraft((d) => { const n = { ...d }; delete n[k]; return n; }); };
  const check = async (type: 'in' | 'out') => {
    setBusy(type); const r = await repairCheck(me, siteId, job, type, jobs as Row[]); setBusy('');
    if (r.ok) { toast(r.toast); void refetchChk(); } else if (r.alert) showAlert(r.alert); else if (r.error) showAlert(r.error); else if (r.toast) toast(r.toast);
  };
  const answer = async (yes: boolean) => {
    if (!val('fault_description').trim() || !val('repair_description').trim()) { toast('Fill in the fault and the repair first.'); return; }
    if (!(await hasRepairPhoto(job.id, 'survey'))) { toast('Add at least one photo first.'); return; }
    const patch: Row = { fault_description: val('fault_description').trim(), repair_description: val('repair_description').trim(), completed_in_visit: yes, survey_required: 'Y', survey_date: job.survey_date || new Date().toISOString(), surveyed_by: job.surveyed_by || me.id };
    if (!yes) patch.job_status = 'Surveyed - Awaiting Cost';
    if (await save(patch, yes ? 'Now the completion photos and the works completed' : 'Sent to the office to price')) {
      setDraft({});
      if (!yes) notifyPmOfRepairNotes(job.id, siteId, 'survey', `Fault: ${patch.fault_description}\nRepair needed: ${patch.repair_description}`);
    }
  };
  const worksDone = async () => {
    const n = val('works_notes').trim();
    if (!n) { toast('Describe the works completed first.'); return; }
    if (!(await hasRepairPhoto(job.id, 'completion'))) { toast('Add at least one completion photo first.'); return; }
    const when = job.works_completed_date || new Date().toISOString();
    const ev = await syncRepairEvent(me, siteId, job.works_completed_event_id, when.slice(0, 10), `Job Completed: ${job.address || 'Repair'}`);
    if (await save({ works_completed: true, works_notes: n, works_completed_date: when, works_completed_event_id: ev, job_status: 'Awaiting Sign-off' }, 'Works done — remember to check out')) { setDraft({}); notifyPmOfRepairNotes(job.id, siteId, 'completion', n); }
  };

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
  // The attendance report (fault found, repair required, photos): to look at here; it's in OneDrive too.
  const report = async () => { setBusy('rep'); const ok = await exportRepairReport('survey', job, site, org, job.surveyed_by === me.id ? me.name : '').catch(() => false); setBusy(''); if (!ok) toast('Could not build the report.'); };
  const pick = (k: 'no' | 'yes', label: string) => (
    <Pressable key={k} role="radio" aria-checked={inVisit === k} onPress={() => setInVisit(k)}
      style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.input, borderWidth: 1, borderColor: inVisit === k ? base.ink : base.line, backgroundColor: inVisit === k ? base.ink : base.card }}>
      <Text style={{ fontWeight: '600', color: inVisit === k ? '#fff' : base.ink }}>{label}</Text>
    </Pressable>
  );
  const step = (n: number | string, title: string, done: boolean, now: boolean, body: ReactNode) => (
    <View style={{ backgroundColor: base.card, borderWidth: now ? 1.5 : 1, borderColor: now ? base.ink : base.cardLine, borderRadius: 12, marginBottom: 8, padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: body ? 8 : 0 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? base.ink : '#fff', borderWidth: now ? 2 : 1.5, borderColor: done ? base.ink : now ? t.brand1 : '#C9CDD3' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: done ? '#fff' : now ? t.brand1 : base.slate }}>{done ? '✓' : n}</Text>
        </View>
        <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '700', color: base.ink }}>{title}</Text>
      </View>
      {body}
    </View>
  );
  const textStep = (k: string, ph: string) => (
    <>
      <TextInput value={val(k)} onChangeText={(v) => setDraft((d) => ({ ...d, [k]: v }))} placeholder={ph} multiline accessibilityLabel={ph} style={box} />
      {changed(k) && <View style={{ alignSelf: 'flex-start', marginTop: 6 }}><Button small title="Save" onPress={() => void saveText(k)} /></View>}
    </>
  );
  const answered = job.completed_in_visit != null && (job.survey_required === 'Y');
  const done = st === 'done';

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: job.job_number || 'Repair Job' }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!!job.job_number && <Text style={{ fontSize: 12, fontWeight: '700', color: base.ink, borderWidth: 1.5, borderColor: base.ink, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>{job.job_number}</Text>}
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: base.ink }}>{job.address || 'Repair job'}</Text>
        </View>
        {!!job.description && <Text style={{ fontSize: 13, color: base.ink, marginTop: 6 }}>{job.description}</Text>}
        {!!(job.tenant_name || job.tenant_phone) && (
          <Pressable disabled={!job.tenant_phone} onPress={() => void Linking.openURL(`tel:${String(job.tenant_phone).replace(/\s+/g, '')}`)}>
            <Text style={{ fontSize: 13, color: job.tenant_phone ? base.blue : base.slate, marginTop: 4 }}>Tenant: {[job.tenant_name, job.tenant_phone].filter(Boolean).join(' · ')}</Text>
          </Pressable>
        )}
        {!!job.work_order_path && <Pressable onPress={async () => { const u = await openDocLink('site-photos', job.work_order_path as string); if (u) viewDoc(u, String(job.work_order_name || 'Works Order')); }}><Text style={{ fontWeight: '600', color: base.blue, marginTop: 6 }}>📄 View The Works Order</Text></Pressable>}
        {worksVisit && <Text style={{ fontSize: 12.5, fontWeight: '600', color: base.ink, marginTop: 6 }}>Works visit: the quote was approved.</Text>}
      </Card>

      {/* Check in first (GPS, as normal). */}
      <View style={{ backgroundColor: inNow ? '#E7F6EC' : base.card, borderWidth: 1, borderColor: inNow ? '#BFE3CB' : base.cardLine, borderRadius: 12, padding: 14, marginBottom: 10, alignItems: 'center' }}>
        {inNow ? <Text style={{ fontWeight: '700', color: '#1E7A43' }}>📍 Checked In{chk?.ts ? ` ${new Date(chk.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</Text>
          : <><Text style={{ fontSize: 15, fontWeight: '700', color: base.ink }}>📍 Check In To Start</Text><Muted style={{ marginTop: 2, textAlign: 'center' }}>Your location is checked against the job’s address.</Muted></>}
        {!inNow && <View style={{ marginTop: 10 }}><Button busy={busy === 'in'} title="Check In" onPress={() => void check('in')} /></View>}
      </View>

      {!inNow ? <Muted style={{ textAlign: 'center', marginBottom: 10 }}>The steps open once you’ve checked in.</Muted> : (
        <>
          {!worksVisit && (
            <>
              {step(1, 'Description Of Fault Found', !!job.fault_description && !changed('fault_description'), !job.fault_description, textStep('fault_description', 'What’s wrong, what you found'))}
              {step(2, 'Description Of Repair Required', !!job.repair_description && !changed('repair_description'), !!job.fault_description && !job.repair_description, textStep('repair_description', 'What needs doing to fix it'))}
              {step(3, 'Photos', data.photos.some((p) => p.category === 'survey' && !p.deleted_at), false, <RepairPhotos jobId={job.id} photos={data.photos} cats={['survey']} onChanged={refresh} addLabel="📷 Add Photos" />)}
              {step(4, 'Completed Repair Whilst In Attendance?', answered, !answered, answered ? (
                <>
                  <Muted>{job.completed_in_visit ? 'Yes.' : job.variation_issued_at ? `No — Quote Submitted ${fmt(job.variation_issued_at)}.` : 'No — sent to the office to price.'}</Muted>
                  <View style={{ alignSelf: 'flex-start', marginTop: 8 }}><Button small kind="ghost" busy={busy === 'rep'} title="📄 Attendance Report" onPress={() => void report()} /></View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 8 }}>{pick('no', 'No — Needs A Quote')}{pick('yes', 'Yes')}</View>
                  <View style={{ alignSelf: 'center', marginTop: 10 }}><Button title="Save Attendance" onPress={() => void answer(inVisit === 'yes')} /></View>
                </>
              ))}
            </>
          )}
          {(worksVisit || job.completed_in_visit === true) && step(worksVisit ? 1 : 5, 'Completion Photos And Works Completed', done, !done, done ? <Muted>Done{job.works_notes ? `: ${job.works_notes}` : ''}.</Muted> : (
            <>
              <RepairPhotos jobId={job.id} photos={data.photos} cats={['completion']} onChanged={refresh} addLabel="📷 Completion Photos" />
              <View style={{ marginTop: 8 }}>{textStep('works_notes', 'Description of the works completed')}</View>
              <View style={{ alignSelf: 'flex-start', marginTop: 8 }}><Button title="Mark Job As Complete" onPress={() => void worksDone()} /></View>
            </>
          ))}
          {step(worksVisit ? 2 : 6, 'Check Out', false, done || job.completed_in_visit === false, (
            <View style={{ alignSelf: 'flex-start' }}><Button kind="ghost" busy={busy === 'out'} title="Check Out" onPress={() => void check('out')} /></View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
