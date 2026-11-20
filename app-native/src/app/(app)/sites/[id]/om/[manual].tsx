// One O&M manual (857 renderHandover). In tabs like the Construction Phase Plan builder (Andy, 20 Nov 2026: "refresh the o&m
// completion process ... take into account the construction phase plan etc and what it can pull through from there"):
//   Details (cover, start on site, practical completion, introduction) · People (contractor, project team and contacts,
//   filled from the job's Construction Phase Plan) · Works (scope, materials, guarantees, maintenance, drawings, H&S,
//   photos) · Appendix (what goes in the back) · Issue (what's left, the sign-off, issuing a revision, earlier revisions).
// A subcontractor's own manual (their admin, from their company page) uses the same builder: their tasks, their COSHH, no
// practical completion or CPP, and Issue submits it to the main contractor, whose manual takes it in the back.
// Before that (Andy, 8 Nov 2026: "I want it to be so simple"), one page in four steps:
//   1 Cover — a summary, Edit Cover opens the boxes.
//   2 Scope Of Works — has to be filled in; fill it from the Bill of Quantities (with Finance) or the Schedule of Works.
//   3 What Goes In The Back — ticks for data sheets, guarantees, COSHH and drawings, then + Add To The Back ▾ (the Bill of
//     Quantities, a Schedule of Works report for the sections you tick, a report, an uploaded document or a file).
//     Find In OneDrive brings the job folder's guarantees and data sheets in.
//   4 The Rest Of The Manual — each section folded to one line; tap to open it, ⋮ to move or delete.
// One Export ▾ (PDF, Word, email either). Saves as you go. Files can be attached to any table row, products picked from the
// COSHH Library go into the Materials Log with their data sheet and assessment, and documents / COSHH added to the job since
// the manual was started come in on opening.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle } from '@/components/ui';
import { DateBox } from '@/components/DateField';
import { OneDriveFindPopup, siteHasOneDrive } from '@/components/HoOneDriveFind';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import * as DocumentPicker from 'expo-document-picker';
import { assessMap, loadProducts } from '@/data/coshhLib';
import { FinTabs } from '@/components/FinNav';
import { FinForm } from '@/components/FinForm';
import { setCompletion, useCompletion, useHandover } from '@/data/handover';
import { appendixFile, issueManual, jobCpp, jobPhotos, loadManual, loadSubOms, saveManual, scopeFrom, subSowDone, uploadRowFile } from '@/data/omManual';
import { viewDoc } from '@/components/DocViewer';
import { Popup, PopupButtons } from '@/components/Popup';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { buildOmPdf, buildOmWord, deliverDocx } from '@/lib/pdfLazy';
import { deliverPdf, emailPdf, showPdf } from '@/lib/fileOut';
import { addOmProducts, HO_MAINT, nextRevision, OM_TAB_LABEL, OM_TABS, omChecklist, omFromCpp, omTab, omUid, scopeEmpty, type OmData, type OmPhoto, type OmSection, type OmTab } from '@/lib/rules/omManual';
import { compressOne, pickPhotos } from '@/lib/photos';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink, backgroundColor: base.card, marginBottom: 6 };
const small = { color: base.blue, fontWeight: '600' as const, paddingHorizontal: 6 };
const label = { fontWeight: '600' as const, marginBottom: 3 };

export default function OmManual() {
  const { id, manual } = useLocalSearchParams<{ id: string; manual: string }>();
  const { me, org } = useAuth();
  const { data: site } = useSite(id);
  const { data, isLoading } = useQuery({ queryKey: ['omManual', manual], enabled: !!me && !!site, gcTime: 0, queryFn: () => loadManual(me as Profile, org, site as Site, manual) });
  if (!me || !site || isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>Manual not found.</Muted>;
  // A subcontractor's admin opens their own company's manual (the database only gives them their own).
  if (!isManager(me) && !data.data.forCompany) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  return <Editor key={manual} me={me} org={org} site={site} manualId={manual} name0={data.name} data0={data.data} />;
}

// What a folded section says on its one line.
const summary = (s: OmSection) => s.type === 'text' ? (String(s.body || '').trim() ? String(s.body).trim().split('\n')[0].slice(0, 60) : 'Empty')
  : s.type === 'materials' ? `${(s.rows || []).length} Products` : s.type === 'table' ? `${(s.rows || []).length} Rows`
  : s.type === 'maint' ? `${(s.items || []).length} Procedures` : `${(s.photos || []).length} Photos`;

function Editor({ me, org, site, manualId, name0, data0 }: { me: Profile; org: Organization | null; site: Site; manualId: string; name0: string; data0: OmData }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: people } = usePeople();
  const { data: ho } = useHandover(site.id);
  // A subcontractor's own manual: submitted to the main contractor (Andy, 20 Nov 2026).
  const sub = !!data0.forCompany;
  const hasFin = !sub && !!(org as (Organization & { has_finance?: boolean }) | null)?.has_finance;
  const { data: subOms } = useQuery({ queryKey: ['subOms', site.id], enabled: !sub, queryFn: () => loadSubOms(site.id) });
  const nSubs = (subOms || []).filter((x) => x.submittedAt && x.path).length;
  // A subcontractor submits once every Schedule of Works task given to them is complete (Andy, 20 Nov 2026).
  const { data: sow } = useQuery({ queryKey: ['subSow', site.id, data0.forCompany], enabled: sub, queryFn: () => subSowDone(site.id, data0.forCompany as string) });
  const sowBlocked = sub && !isManager(me) && !!sow && !sow.complete;
  const [d, setD] = useState<OmData>(data0);
  const [name, setName] = useState(name0);
  const [status, setStatus] = useState('');
  const [picker, setPicker] = useState<null | { sec: string | null }>(null);
  const [libFor, setLibFor] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState('');
  const [coverOpen, setCoverOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sowPick, setSowPick] = useState(false);
  const [finding, setFinding] = useState(false);
  const [tab, setTab] = useState<OmTab>('details');
  const [pcEdit, setPcEdit] = useState(false);
  // The job's Construction Phase Plan: who's who, the start date and the outline of works (Andy, 20 Nov 2026).
  const { data: cppInfo } = useQuery({ queryKey: ['omCpp', site.id], enabled: !data0.forCompany, queryFn: () => jobCpp(site.id) });
  const { data: pc } = useCompletion(data0.forCompany ? undefined : site.id);
  const attachRow = async (sid: string, ri: number) => {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true }); if (r.canceled || !r.assets.length) return;
    const got: { bucket: string; path: string; name: string }[] = [];
    for (let i = 0; i < r.assets.length; i++) { setBusyRow(`Uploading ${i + 1} of ${r.assets.length}…`); const f = await uploadRowFile(me, site, { uri: r.assets[i].uri, name: r.assets[i].name || 'file', mimeType: r.assets[i].mimeType }); if (f) got.push(f); }
    setBusyRow('');
    if (!got.length) { toast('Upload failed — check your signal and try again.'); return; }
    up((x) => { const t = sec(x, sid); t.links = t.links || []; t.links[ri] = [...(t.links[ri] || []), ...got]; });
  };
  const pending = useRef<{ name: string; d: OmData } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const p = pending.current; if (!p) return true;
    pending.current = null;
    const ok = await saveManual(me, manualId, p.name, p.d);
    if (!ok) { pending.current = p; toast('Could not save the manual — check signal'); }
    return ok;
  };
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; });
  useEffect(() => () => { void flushRef.current(); }, []);
  const queue = (nd: OmData, nm = name) => { pending.current = { name: nm, d: nd }; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(); }, 900); };
  const up = (fn: (x: OmData) => void) => { const nd = JSON.parse(JSON.stringify(d)) as OmData; fn(nd); setD(nd); queue(nd); };
  const sec = (x: OmData, sid: string) => x.sections.find((s) => s.id === sid) as OmSection;
  const scope = d.sections.find((s) => s.key === 'scope');

  const move = (sid: string, dir: number) => up((x) => { const i = x.sections.findIndex((s) => s.id === sid), j = i + dir; if (i < 0 || j < 0 || j >= x.sections.length) return; [x.sections[i], x.sections[j]] = [x.sections[j], x.sections[i]]; });
  const secMenu = async (s: OmSection) => {
    const k = await chooseAction(s.title || 'Section', [{ key: 'up', label: 'Move Up' }, { key: 'down', label: 'Move Down' }, { key: 'del', label: 'Delete', danger: true }]);
    if (k === 'up') move(s.id, -1); else if (k === 'down') move(s.id, 1);
    else if (k === 'del' && (await confirmAsk(`Delete the "${s.title || 'section'}" section?`, 'Delete'))) up((x) => { x.sections = x.sections.filter((y) => y.id !== s.id); });
  };
  const addSec = async () => {
    const k = await chooseAction('Add A Section', [{ key: 'text', label: 'Text' }, { key: 'table', label: 'Table' }, { key: 'photos', label: 'Photos' }, { key: 'maint', label: 'Maintenance Procedures' }]);
    if (!k) return;
    const nid = omUid();
    up((x) => x.sections.push(k === 'table' ? { id: nid, type: 'table', title: 'New table', columns: ['Column 1', 'Column 2'], rows: [['', '']], links: [[]] } : k === 'photos' ? { id: nid, type: 'photos', title: 'Photographs', photos: [] } : k === 'maint' ? { id: nid, type: 'maint', title: 'Maintenance Procedures', items: [] } : { id: nid, type: 'text', title: 'New section', body: '' }));
    setOpen((o) => ({ ...o, [nid]: true }));
  };
  const fillScope = async (from: 'boq' | 'sow') => {
    if (!scope) return;
    const txt = await scopeFrom(site.id, from, d.forCompany);
    if (!txt) { toast(from === 'boq' ? 'There’s no Bill of Quantities on this job yet.' : 'There are no Schedule of Works tasks on this job yet.'); return; }
    if (String(scope.body || '').trim() && !(await confirmAsk(`Replace the Scope of Works with the ${from === 'boq' ? 'Bill of Quantities' : 'Schedule of Works'}?`, 'Replace'))) return;
    up((x) => { sec(x, scope.id).body = txt; });
  };
  const build = async () => {
    if (scopeEmpty(d)) { toast('Fill in the Scope of Works first — it has to be in the manual.'); return null; }
    await flush();
    setStatus('Building the PDF…');
    try {
      const r = await buildOmPdf({ ...d, dates: { ...(d.dates || {}), pc: pc?.pc_date || null } }, site, org, (u) => nameOf(people, u), setStatus);
      if (r.notAttached.length) toast(`These could not be added to the back of the manual: ${r.notAttached.join('; ')}`);
      return { bytes: r.bytes, filename: `O&M Manual - ${(site.name || 'Project').replace(/[\\/:*?"<>|]+/g, '-')}.pdf` };
    } catch { toast('Could not build the PDF — try again'); return null; } finally { setStatus(''); }
  };
  const word = async () => {
    if (scopeEmpty(d)) { toast('Fill in the Scope of Works first — it has to be in the manual.'); return null; }
    await flush(); setStatus('Building the Word file…');
    try { return await buildOmWord({ ...d, dates: { ...(d.dates || {}), pc: pc?.pc_date || null } }, site, org); } catch { toast('Could not build the Word file — try again'); return null; } finally { setStatus(''); }
  };
  const exportMenu = async () => {
    const k = await chooseAction('Export', [{ key: 'pdf', label: '📄 Download PDF' }, { key: 'word', label: '📝 Download Word' }, { key: 'epdf', label: '✉ Email PDF' }, { key: 'eword', label: '✉ Email Word' }]);
    if (!k) return;
    if (k === 'pdf') { const b = await build(); if (b && !(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); return; }
    if (k === 'word') { const w = await word(); if (w && !(await deliverDocx(w.bytes, w.filename))) toast('Could not save the Word file.'); return; }
    const to = (await promptText(`Email the O&M manual (${k === 'epdf' ? 'PDF' : 'Word'}) to:`, site.client_email || ''))?.trim(); if (!to) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast('Enter a valid email address.'); return; }
    const f = k === 'epdf' ? await build() : await word(); if (!f) return;
    setStatus('Sending…');
    const err = await emailPdf(f.bytes, f.filename, `${site.id}/om-exports`, { site_id: site.id, recipient_email: to, doc_title: `O&M Manual — ${site.name}` }, k === 'eword' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : undefined);
    setStatus('');
    toast(err || `Emailed to ${to}`, { confirm: true });
  };
  // + Add To The Back ▾ (857 hoAddAppendix): the Bill of Quantities (with Finance), a Schedule of Works report for the
  // sections ticked, a report, a document uploaded to the Schedule of Works, or a file.
  const addBack = async () => {
    if (sub) {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets[0]) return;
      const g = await appendixFile(me, site, { uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType });
      if (!g) { toast('Couldn’t add that file — try again.'); return; }
      up((x) => { x.appendix.push({ kind: 'file', bucket: g.bucket, path: g.path, label: g.name }); });
      return;
    }
    const docs = (((await supabase.from('schedule_documents').select('id,name,storage_path').eq('site_id', site.id).order('created_at', { ascending: true })).data ?? []) as { id: string; name: string; storage_path: string }[]).filter((x) => /\.(pdf|jpe?g|png)$/i.test(x.storage_path || ''));
    // The job's issued Construction Phase Plan (not the superseded versions).
    const cppDocs = (((await supabase.from('mc_documents').select('id,name,storage_path').eq('site_id', site.id).eq('category', 'cpp').order('created_at', { ascending: false })).data ?? []) as { id: string; name: string; storage_path: string }[]).filter((x) => !/superseded/i.test(x.name) && /.pdf$/i.test(x.storage_path || ''));
    const k = await chooseAction('Add To The Back', [
      ...(hasFin ? [{ key: 'boq', label: '📋 Bill Of Quantities (Works Completed, No Prices)' }] : []),
      { key: 'sow', label: '📋 Schedule Of Works Report (Choose The Sections)' },
      { key: 'report', label: '📄 A Report Or Survey' },
      ...cppDocs.map((x) => ({ key: `cpp:${x.id}`, label: `📋 ${x.name}` })),
      ...docs.map((x) => ({ key: `doc:${x.id}`, label: `📄 ${x.name} (Schedule Of Works Document)` })),
      { key: 'up', label: '⬆️ Upload A File (PDF Or Photo)' },
    ]);
    if (!k) return;
    if (k === 'boq') { if (d.appendix.some((e) => e.kind === 'boq')) { toast('The Bill of Quantities is already in the back.'); return; } up((x) => { x.appendix.unshift({ kind: 'boq', label: 'Bill Of Quantities — Works Completed' }); }); return; }
    if (k === 'sow') { setSowPick(true); return; }
    if (k.startsWith('cpp:')) { const x = cppDocs.find((y) => `cpp:${y.id}` === k); if (x) up((n) => { n.appendix.push({ kind: 'file', bucket: 'mc-documents', path: x.storage_path, label: x.name }); }); return; }
    if (k === 'report') {
      const subs = ((await supabase.from('report_submissions').select('id,template_name,submitted_at,status').eq('site_id', site.id).order('submitted_at', { ascending: false }).limit(100)).data ?? []) as { id: string; template_name: string; submitted_at: string | null; status: string }[];
      const done = subs.filter((s) => s.status !== 'in_progress');
      if (!done.length) { toast('No submitted reports on this job.'); return; }
      const r = await chooseAction('Add A Report', done.map((s) => ({ key: s.id, label: `${s.template_name}${s.submitted_at ? ` · ${new Date(s.submitted_at).toLocaleDateString('en-GB')}` : ''}` })));
      const s = done.find((x) => x.id === r); if (s) up((x) => { x.appendix.push({ kind: 'report', label: s.template_name, reportId: s.id }); });
      return;
    }
    let f: { bucket: string; path: string; name: string } | null = null;
    if (k === 'up') {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets[0]) return;
      f = await appendixFile(me, site, { uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType });
    } else {
      const doc = docs.find((x) => `doc:${x.id}` === k); if (!doc) return;
      f = await appendixFile(me, site, { bucket: 'schedule-docs', path: doc.storage_path, name: doc.name });
    }
    if (!f) { toast('Couldn’t add that file — try again.'); return; }
    const got = f;
    up((x) => { x.appendix.push({ kind: 'file', bucket: got.bucket, path: got.path, label: got.name }); });
  };
  const c = d.cover || {};
  const cover = (k: keyof typeof c, v: string) => up((x) => { (x.cover as Record<string, unknown>)[k] = v; });
  const nGuar = (ho?.docs || []).filter((x) => x.kind === 'guarantee').length, nSheet = (ho?.docs || []).filter((x) => x.kind === 'datasheet').length;
  const checks = [...(sub && sow && sow.total ? [{ key: 'sow', label: `Your Schedule Of Works Complete (${sow.done} of ${sow.total})`, ok: sow.complete, tab: 'works' as OmTab, must: true }] : []),
    ...omChecklist(d, { pcDate: pc?.pc_date }).filter((k) => !sub || (k.key !== 'pc' && k.key !== 'pd'))];
  const revs = d.revisions || [];
  const lastRev = revs[revs.length - 1];
  const when = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const centre = (...kids: ReactNode[]) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 6 }}>{kids}</View>;
  const go = async (t: OmTab) => { await flush(); setTab(t); };

  // One section, folded to a line (tap to open), with ⋮ to move or delete. People and the sign-off start open.
  const secRow = (s: OmSection) => {
    const isOpen = open[s.id] ?? (tab === 'people' || tab === 'issue');
    return (
      <View key={s.id} style={{ borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${s.title || 'Section'}${isOpen ? ', open' : ''}`} onPress={() => setOpen((o) => ({ ...o, [s.id]: !isOpen }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: base.ink }}>{s.title || 'Untitled Section'}</Text>
            {!isOpen && <Muted>{summary(s)}</Muted>}
          </View>
          <Text style={{ color: base.slate }}>{isOpen ? '▴' : '▾'}</Text>
          <Pressable hitSlop={8} accessibilityLabel={`${s.title || 'Section'} options`} onPress={() => void secMenu(s)}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
        </Pressable>
        {isOpen && (
          <View style={{ paddingBottom: 10 }}>
            <TextInput value={s.title} onChangeText={(v) => up((x) => { sec(x, s.id).title = v; })} placeholder="Section Heading" accessibilityLabel="Section heading" style={[box, { fontWeight: '600' }]} />
            {s.key === 'team' && <Muted style={{ marginBottom: 6 }}>Only the roles with a name go in the manual.</Muted>}
            {s.type === 'text' && <TextInput value={s.body || ''} onChangeText={(v) => up((x) => { sec(x, s.id).body = v; })} multiline placeholder="Text" style={[box, { minHeight: 90, textAlignVertical: 'top' }]} />}
            {(s.type === 'table' || s.type === 'materials') && <TableEdit s={s} up={(fn) => up((x) => fn(sec(x, s.id)))} onAttach={(ri) => void attachRow(s.id, ri)} busy={busyRow} />}
            {s.type === 'materials' && <Text style={small} onPress={() => setLibFor(s.id)}>📚 Choose Data Sheets From The COSHH Library</Text>}
            {s.type === 'maint' && <MaintEdit s={s} up={(fn) => up((x) => fn(sec(x, s.id)))} />}
            {s.type === 'photos' && (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(s.photos || []).map((p, i) => (
                    <View key={`${p.path}${i}`} style={{ width: 150 }}>
                      <StorageImage bucket={p.bucket} path={p.path} style={{ width: 150, height: 110, borderRadius: 6 }} />
                      <TextInput value={p.caption || ''} onChangeText={(v) => up((x) => { (sec(x, s.id).photos as OmPhoto[])[i].caption = v; })} placeholder="Caption" style={[box, { fontSize: 12 }]} />
                      <Text style={[small, { color: base.red }]} onPress={() => up((x) => { (sec(x, s.id).photos as OmPhoto[]).splice(i, 1); })}>Remove</Text>
                    </View>
                  ))}
                </View>
                <Text style={small} onPress={() => setPicker({ sec: s.id })}>+ Add Job Photos</Text>
              </>
            )}
          </View>
        )}
      </View>
    );
  };
  const secsOn = (t: OmTab) => d.sections.filter((s) => s.key !== 'scope' && omTab(s) === t);

  // ----- Details: the cover, the key dates and the introduction -----
  const details = () => (
    <>
      <Card>
        <SectionTitle>Cover</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          {c.coverPhoto ? <StorageImage bucket={c.coverPhoto.bucket} path={c.coverPhoto.path} style={{ width: 96, height: 60, borderRadius: 6 }} /> : <View style={{ width: 96, height: 60, borderRadius: 6, backgroundColor: '#EEF0F2', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: base.slate, fontSize: 11 }}>No Photo</Text></View>}
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Button small kind="ghost" title="Photo From The Job" onPress={() => setPicker({ sec: null })} />
            <Button small kind="ghost" title="📷 Take Or Upload" onPress={async () => {
              // 857: the cover photo can also be taken now or picked from the phone.
              const src = await chooseAction('Cover Photo', [{ key: 'camera', label: '📷 Take A Photo' }, { key: 'library', label: '🖼 Choose From Library' }]); if (!src) return;
              const p = await pickPhotos(src as 'camera' | 'library', false); if ('error' in p) { toast(p.error); return; } if (!p[0]) return;
              const f = await uploadRowFile(me, site, { uri: await compressOne(p[0]), name: 'cover.jpg', mimeType: 'image/jpeg' });
              if (f) up((x) => { x.cover.coverPhoto = { bucket: f.bucket, path: f.path }; }); else toast('Could not upload — check your signal and try again.');
            }} />
            {c.coverPhoto && <Button small kind="ghost" title="Remove Photo" onPress={() => up((x) => { x.cover.coverPhoto = null; })} />}
          </View>
        </View>
        <Muted style={label}>Title</Muted>
        <TextInput value={c.title || ''} onChangeText={(v) => cover('title', v)} placeholder="O&M MANUAL" accessibilityLabel="Cover title" style={box} />
        <Muted style={label}>Project</Muted>
        <TextInput value={c.project || ''} onChangeText={(v) => cover('project', v)} placeholder="Project" accessibilityLabel="Project" style={box} />
        <Muted style={label}>Address</Muted>
        <TextInput value={c.address || ''} onChangeText={(v) => cover('address', v)} placeholder="Address" accessibilityLabel="Address" style={box} />
        <Muted style={{ marginBottom: 6 }}>{lastRev ? `Revision ${lastRev.rev}, issued ${when(lastRev.date)}. The next revision number and date go on when you issue it again.` : 'The revision number and date go on when you issue it (Issue tab).'}</Muted>
        <Pressable onPress={() => setCoverOpen(!coverOpen)} accessibilityRole="button"><Text style={small}>{coverOpen ? 'Hide The Cover Wording ▴' : 'Change The Cover Wording ▾'}</Text></Pressable>
        {coverOpen && (
          <View style={{ marginTop: 8 }}>
            <Muted style={label}>Heading</Muted>
            <TextInput value={c.header || ''} onChangeText={(v) => cover('header', v)} placeholder="Heading" style={box} />
            <Muted style={label}>Volume Line</Muted>
            <TextInput value={c.volume || ''} onChangeText={(v) => cover('volume', v)} placeholder="Volume Line" style={box} />
            <Muted style={label}>Page 2 Wording</Muted>
            <TextInput value={c.subtitle || ''} onChangeText={(v) => cover('subtitle', v)} placeholder="Page 2 Wording" multiline style={[box, { minHeight: 70 }]} />
          </View>
        )}
      </Card>
      <Card>
        <SectionTitle>Key Dates</SectionTitle>
        <Muted style={label}>Start On Site</Muted>
        <DateBox value={d.dates?.start || ''} onChange={(v) => up((x) => { x.dates = { ...(x.dates || {}), start: v || null }; })} placeholder="Start date" title="Start On Site" style={{ marginBottom: 8 }} />
        {!sub && (
          <>
            <Muted style={label}>Practical Completion</Muted>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, color: pc?.pc_date ? base.ink : base.slate }}>{pc?.pc_date ? `${when(pc.pc_date)}${pc.defects_months != null ? ` · Defects Period ${pc.defects_months} Months` : ''}` : 'Not Set Yet'}</Text>
              <Button small kind="ghost" title={pc?.pc_date ? 'Change' : 'Set'} onPress={() => setPcEdit(true)} />
            </View>
            <Muted style={{ marginTop: 4 }}>The job’s own date, the same as on Handover. Finance uses it for the retention release dates.</Muted>
          </>
        )}
      </Card>
      {secsOn('details').length > 0 && <Card>{secsOn('details').map(secRow)}</Card>}
    </>
  );

  // ----- People: who's who, from the Construction Phase Plan -----
  const fillFromCpp = () => {
    if (!cppInfo) return;
    let n = 0;
    up((x) => { n = omFromCpp(x, cppInfo.plan); });
    if (!n) toast('Nothing to fill in — every box the plan covers already has something in it.');
    setOpen((o) => { const nx = { ...o }; d.sections.filter((s) => omTab(s) === 'people').forEach((s) => { nx[s.id] = true; }); return nx; });
  };
  const whoTab = () => (
    <>
      {!sub && <Card>
        <SectionTitle>Construction Phase Plan</SectionTitle>
        {cppInfo ? (
          <>
            <Muted>The client, client’s agent, principal designer, architect, project manager and start date come from the job’s Construction Phase Plan (v{cppInfo.version}{cppInfo.issued ? ', issued' : ', not issued yet'}). Filling only puts them in empty boxes; nothing typed is changed.</Muted>
            {centre(<Button key="fill" small title="↻ Fill From The Construction Phase Plan" onPress={fillFromCpp} />)}
          </>
        ) : <Muted>There’s no Construction Phase Plan on this job. Fill these in here, or build the plan on the job’s Construction Phase Plan tile and fill from it.</Muted>}
      </Card>}
      <Card>{secsOn('people').map(secRow)}</Card>
    </>
  );

  // ----- Works: the scope (required), then the materials, guarantees, maintenance, drawings, H&S and photos -----
  const works = () => (
    <>
      {scope && (
        <Card>
          <SectionTitle>Scope Of Works Completed</SectionTitle>
          {scopeEmpty(d) && <Text style={{ color: base.red, marginBottom: 4 }}>Required — describe the works carried out.</Text>}
          <TextInput value={scope.body || ''} onChangeText={(v) => up((x) => { sec(x, scope.id).body = v; })} multiline placeholder="Describe the works carried out." accessibilityLabel="Scope of works" style={[box, { minHeight: 110, textAlignVertical: 'top' }]} />
          {centre(
            hasFin ? <Button key="boq" small kind="ghost" title="Fill From The Bill Of Quantities" onPress={() => void fillScope('boq')} /> : null,
            <Button key="sow" small kind="ghost" title="Fill From The Schedule Of Works" onPress={() => void fillScope('sow')} />,
            !sub && cppInfo?.plan.outline.trim() ? <Button key="cpp" small kind="ghost" title="Fill From The Construction Phase Plan" onPress={async () => {
              if (String(scope.body || '').trim() && !(await confirmAsk('Replace the Scope of Works with the Construction Phase Plan’s outline of works?', 'Yes', 'No'))) return;
              up((x) => { sec(x, scope.id).body = cppInfo.plan.outline.trim(); });
            }} /> : null,
          )}
        </Card>
      )}
      <Card>
        <SectionTitle>The Rest Of The Manual</SectionTitle>
        <Muted style={{ marginBottom: 6 }}>Tap a section to open it.</Muted>
        {secsOn('works').map(secRow)}
        {centre(<Button key="add" small kind="ghost" title="+ Add A Section" onPress={() => void addSec()} />)}
      </Card>
    </>
  );

  // ----- Appendix: what goes in the back -----
  const appendix = () => (
    <Card>
      <SectionTitle>What Goes In The Back</SectionTitle>
      {!sub && <Check label={`Data Sheets${ho ? ` (${nSheet})` : ''}`} value={!!d.attach.datasheets} onChange={(v) => up((x) => { x.attach.datasheets = v; })} />}
      {!sub && <Check label={`Guarantees${ho ? ` (${nGuar})` : ''}`} value={!!d.attach.guarantees} onChange={(v) => up((x) => { x.attach.guarantees = v; })} />}
      <Check label={sub ? 'Your COSHH Assessments On This Job' : 'The Job’s COSHH Assessments'} value={!!d.attach.coshh} onChange={(v) => up((x) => { x.attach.coshh = v; })} />
      {!sub && <Check label="Drawings" value={!!d.attach.drawings} onChange={(v) => up((x) => { x.attach.drawings = v; })} />}
      {!sub && <Check label={`Subcontractors’ O&M Manuals (${nSubs} Submitted)`} value={d.attach.subs !== false} onChange={(v) => up((x) => { x.attach.subs = v; })} />}
      {d.appendix.map((e, i) => (
        <View key={`${e.label}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: i ? 0 : 8 }}>
          <TextInput value={e.label} onChangeText={(v) => up((x) => { x.appendix[i].label = v; })} accessibilityLabel={`Appendix ${i + 1}`} style={[box, { flex: 1 }]} />
          <Text style={small} accessibilityLabel={`Move ${e.label} up`} onPress={() => up((x) => { const j = i - 1; if (j >= 0) [x.appendix[i], x.appendix[j]] = [x.appendix[j], x.appendix[i]]; })}>▲</Text>
          <Text style={small} accessibilityLabel={`Remove ${e.label}`} onPress={async () => { if (await confirmAsk(`Remove "${e.label}" from the back of the manual?`, 'Yes', 'No')) up((x) => { x.appendix.splice(i, 1); }); }}>✕</Text>
        </View>
      ))}
      {centre(
        <Button key="add" small title={sub ? '⬆️ Add A File To The Back' : '+ Add To The Back ▾'} onPress={() => void addBack()} />,
        !sub && siteHasOneDrive(site) ? <Button key="od" small kind="ghost" title="🔍 Find In OneDrive" onPress={() => setFinding(true)} /> : null,
      )}
    </Card>
  );

  // ----- Issue: what's left, the sign-off, issuing a revision, and the revisions so far -----
  const doIssue = async () => {
    if (sowBlocked) { toast('Your Schedule of Works isn’t complete yet, so your O&M can’t be submitted.'); return; }
    if (scopeEmpty(d)) { toast('Fill in the Scope of Works first — it has to be in the manual.'); setTab('works'); return; }
    const rev = nextRevision(d);
    const note = revs.length ? await promptText(`What Has Changed In Revision ${rev}?`, '') : '';
    if (note === null) return;
    // Practical completion goes with the handover (proposal P19): offer today's date if the job hasn't one.
    if (!sub && !pc?.pc_date) {
      const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (await confirmAsk(`Practical completion isn’t set for this job. Set it to today, ${when(iso)}?`, 'Yes', 'No')) {
        if (await setCompletion(site.id, iso, pc?.defects_months ?? 12)) { void qc.invalidateQueries({ queryKey: ['siteCompletion', site.id] }); void qc.invalidateQueries({ queryKey: ['finBook'] }); }
        else toast('Could not set practical completion — only a manager on this job can set it.');
      }
    }
    await flush();
    setStatus('Issuing…');
    const r = await issueManual(me, org, site, manualId, name, d, note || '', (u) => nameOf(people, u), setStatus);
    setStatus('');
    if (typeof r === 'string') { toast(r); return; }
    setD(r.d);
    void qc.invalidateQueries({ queryKey: ['handover', site.id] }); void qc.invalidateQueries({ queryKey: ['subOms', site.id] });
    if (r.notAttached.length) toast(`These could not be added to the back of the manual: ${r.notAttached.join('; ')}`);
    await showPdf(r.bytes, r.filename);
  };
  const issue = () => (
    <>
      <Card>
        <SectionTitle>Before You Issue</SectionTitle>
        {checks.map((k) => (
          <Pressable key={k.key} accessibilityRole="button" onPress={() => { if (!k.ok && k.tab !== 'issue') void go(k.tab); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}>
            <Text style={{ width: 20, textAlign: 'center', fontSize: 15, color: k.ok ? base.ok : k.must ? base.red : '#b45309', fontWeight: '600' }}>{k.ok ? '✓' : k.must ? '✕' : '!'}</Text>
            <Text style={{ flex: 1, color: k.ok ? base.slate : base.ink }}>{k.label}{!k.ok && k.must ? ' — Required' : ''}</Text>
            {!k.ok && k.tab !== 'issue' && <Text style={{ color: base.blue, fontWeight: '600' }}>{OM_TAB_LABEL[k.tab]} ›</Text>}
          </Pressable>
        ))}
      </Card>
      {secsOn('issue').length > 0 && <Card>{secsOn('issue').map(secRow)}</Card>}
      <Card>
        <SectionTitle>Issue The Manual</SectionTitle>
        <Muted>{sub ? `Submitting puts ${revs.length ? 'the next revision number' : 'Revision 1'} and today’s date on the cover, makes the PDF and sends it to ${org?.name || 'the main contractor'}. It goes in the back of their O&M manual.${revs.length ? ' Earlier revisions are kept below.' : ''}`
          : <>{revs.length ? 'Issuing again puts the next revision number and today’s date on the cover, and keeps the earlier revisions below.' : 'Issuing puts Revision 1 and today’s date on the cover, makes the PDF and keeps it with the manual.'}{siteHasOneDrive(site) ? ' A copy goes in the job’s OneDrive folder.' : ''}</>}</Muted>
        {centre(
          <Button key="issue" title={status || (sub ? `Submit Revision ${nextRevision(d)}` : `Issue Revision ${nextRevision(d)}`)} disabled={!!status || sowBlocked} onPress={() => void doIssue()} />,
          <Button key="exp" kind="ghost" title="Export ▾" disabled={!!status} onPress={() => void exportMenu()} />,
        )}
      </Card>
      {revs.length > 0 && (
        <Card>
          <SectionTitle>Revisions</SectionTitle>
          {revs.slice().reverse().map((r, i) => (
            <View key={`${r.rev}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>Revision {r.rev} · {when(r.date)}</Text>
                <Muted>{[r.by, r.note].filter(Boolean).join(' · ')}</Muted>
              </View>
              {!!r.path && <Text style={small} onPress={async () => { const u = await openDocLink('mc-documents', r.path as string); if (u) viewDoc(u); else toast('Could not open the PDF.'); }}>View</Text>}
            </View>
          ))}
        </Card>
      )}
    </>
  );

  const tabLabel = (t: OmTab) => (t === 'works' && scopeEmpty(d) ? 'Works ⚠' : OM_TAB_LABEL[t]);
  const nx = OM_TABS[OM_TABS.indexOf(tab) + 1];
  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: name || 'O&M Manual' }} />
      <TextInput value={name} onChangeText={(v) => { setName(v); queue(d, v); }} placeholder="Manual Name" accessibilityLabel="Manual name" style={[box, { fontWeight: '600', fontSize: 16 }]} />
      <Muted style={{ marginBottom: 8 }}>{lastRev ? `Revision ${lastRev.rev} ${sub ? 'Submitted' : 'Issued'} ${when(lastRev.date)}` : sub ? 'Not Submitted Yet' : 'Not Issued Yet'} · Saves As You Type</Muted>
      <FinTabs even value={tab} onChange={(k) => void go(k as OmTab)} items={OM_TABS.map((t) => [t, tabLabel(t)] as [string, string])} />
      <View style={{ height: 10 }} />
      {tab === 'details' ? details() : tab === 'people' ? whoTab() : tab === 'works' ? works() : tab === 'back' ? appendix() : issue()}
      {nx && <View style={{ marginTop: 6, marginBottom: 20 }}>{centre(<Button key="next" title={`Next: ${OM_TAB_LABEL[nx]} ›`} onPress={() => void go(nx)} />)}</View>}
      <View style={{ height: space.xl }} />
      {pcEdit && (
        <FinForm title="Practical Completion" note="The defects period runs from this date. Finance uses both for the retention release dates." onClose={() => setPcEdit(false)}
          initial={{ pc_date: pc?.pc_date || '', defects: pc?.defects_months != null ? String(pc.defects_months) : '12' }}
          fields={[{ k: 'pc_date', label: 'Practical Completion Date', kind: 'date', half: true }, { k: 'defects', label: 'Defects Period (Months)', kind: 'number', half: true }]}
          onSave={async (v) => {
            const m = String(v.defects ?? '').trim() === '' ? null : Number(v.defects);
            if (m !== null && (!Number.isInteger(m) || m < 0 || m > 120)) return 'Enter the defects period in whole months, e.g. 12.';
            if (!(await setCompletion(site.id, String(v.pc_date || '') || null, m))) return 'Could not save — only a manager on this job can set it.';
            void qc.invalidateQueries({ queryKey: ['siteCompletion', site.id] }); void qc.invalidateQueries({ queryKey: ['finBook'] }); return null;
          }} />
      )}

      {sowPick && <SowSectionsPopup siteId={site.id} onClose={() => setSowPick(false)} onAdd={(secs, names, doneOnly) => {
        setSowPick(false);
        up((x) => { x.appendix.push({ kind: 'sow-app', label: `Schedule Of Works${doneOnly ? ' — Completed Works' : ''}${names.length ? ` (${names.join(', ')})` : ''}`, sections: secs, doneOnly }); });
      }} />}
      {finding && <OneDriveFindPopup me={me} site={site} have={(ho?.docs || []).map((x) => x.name)} onDone={(n) => {
        setFinding(false);
        if (n) { void qc.invalidateQueries({ queryKey: ['handover', site.id] }); up((x) => { x.attach.guarantees = true; x.attach.datasheets = true; }); toast(`${n} added from OneDrive — they go into the manual.`, { confirm: true }); }
      }} />}
      {libFor && <LibraryPicker orgId={me.org_id as string} have={(d.sections.find((q) => q.id === libFor)?.rows || []).map((r) => String(r[2] || '').trim().toLowerCase())} onClose={() => setLibFor(null)} onPick={(ps) => { const sid = libFor; setLibFor(null); up((x) => { addOmProducts(x, sid, ps); }); }} />}
      {picker && <PhotoPicker siteId={site.id} single={picker.sec === null} onClose={() => setPicker(null)} onPick={(ps) => {
        if (picker.sec === null) up((x) => { x.cover.coverPhoto = ps[0] ? { bucket: ps[0].bucket, path: ps[0].path } : x.cover.coverPhoto; });
        else { const sid = picker.sec; up((x) => { const t = sec(x, sid); t.photos = [...(t.photos || []), ...ps]; }); }
        setPicker(null);
      }} />}
    </ScrollView>
  );
}

// Schedule Of Works Report: tick the sections it covers, and whether it's the completed works only.
function SowSectionsPopup({ siteId, onAdd, onClose }: { siteId: string; onAdd: (ids: string[], names: string[], doneOnly: boolean) => void; onClose: () => void }) {
  const { data: secs, isLoading } = useQuery({ queryKey: ['omSowSecs', siteId], queryFn: async () => {
    const [s, t] = await Promise.all([
      supabase.from('schedule_sections').select('id,name').eq('site_id', siteId).order('position'),
      supabase.from('schedule_tasks').select('id,section_id').eq('site_id', siteId),
    ]);
    const tasks = (t.data ?? []) as unknown as { section_id: string | null }[];
    const list = ((s.data ?? []) as { id: string; name: string }[]).map((x) => ({ ...x, n: tasks.filter((y) => y.section_id === x.id).length }));
    const loose = tasks.filter((y) => !y.section_id).length;
    return loose ? [...list, { id: '', name: 'Tasks Not In A Section', n: loose }] : list;
  } });
  const [tick, setTick] = useState<Record<string, boolean> | null>(null);
  const [doneOnly, setDoneOnly] = useState(true);
  const t = tick ?? Object.fromEntries((secs || []).map((x) => [x.id, true]));
  const picked = (secs || []).filter((x) => t[x.id]);
  const yn = (v: boolean, l: string) => (
    <Pressable key={l} accessibilityRole="radio" aria-checked={doneOnly === v} onPress={() => setDoneOnly(v)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: doneOnly === v ? base.ink : base.line, backgroundColor: doneOnly === v ? base.ink : base.card }}>
      <Text style={{ color: doneOnly === v ? '#fff' : base.ink, fontWeight: '500' }}>{l}</Text>
    </Pressable>
  );
  return (
    <Popup title="Schedule Of Works Report" onClose={onClose} width={440}
      footer={<View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}><Button disabled={!picked.length} title="Add To The Back" onPress={() => onAdd(picked.length === (secs || []).length ? [] : picked.map((x) => x.id), picked.length === (secs || []).length ? [] : picked.map((x) => x.name), doneOnly)} /><Button kind="ghost" title="Cancel" onPress={onClose} /></View>}>
      <Muted style={{ marginBottom: 6 }}>Tick the sections to include. Each task comes with its photos.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : !secs?.length ? <Muted>There are no Schedule of Works tasks on this job yet.</Muted> : (
        <ScrollView style={{ maxHeight: 300 }}>{secs.map((x) => <Check key={x.id || 'none'} label={`${x.name} (${x.n} ${x.n === 1 ? 'Task' : 'Tasks'})`} value={!!t[x.id]} onChange={(v) => setTick({ ...t, [x.id]: v })} />)}</ScrollView>
      )}
      <Text style={{ fontWeight: '600', color: base.ink, marginTop: 10, marginBottom: 6 }}>Completed Works Only?</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>{yn(true, 'Yes')}{yn(false, 'No')}</View>
    </Popup>
  );
}

function TableEdit({ s, up, onAttach, busy }: { s: OmSection; up: (fn: (t: OmSection) => void) => void; onAttach: (row: number) => void; busy: string }) {
  const cols = s.columns || [], rows = s.rows || [];
  const cw = 150;
  return (
    <>
      <ScrollView horizontal>
        <View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {cols.map((h, ci) => (
              <View key={ci} style={{ width: cw }}>
                <TextInput value={h} onChangeText={(v) => up((t) => { (t.columns as string[])[ci] = v; })} placeholder="(no heading)" style={[box, { fontWeight: '600', backgroundColor: '#EEF0F4' }]} />
                {cols.length > 1 && <Text style={[small, { fontSize: 11 }]} onPress={() => up((t) => { (t.columns as string[]).splice(ci, 1); (t.rows || []).forEach((r) => r.splice(ci, 1)); })}>✕ column</Text>}
              </View>
            ))}
          </View>
          {rows.map((r, ri) => (
            <View key={ri}>
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-start' }}>
              {cols.map((_, ci) => <TextInput key={ci} value={r[ci] || ''} onChangeText={(v) => up((t) => { (t.rows as string[][])[ri][ci] = v; })} multiline style={[box, { width: cw }]} />)}
              <Text style={[small, { color: base.red, paddingTop: 8 }]} onPress={() => up((t) => { (t.rows as string[][]).splice(ri, 1); if (t.links) t.links.splice(ri, 1); })}>✕</Text>
              <Text style={[small, { paddingTop: 8 }]} onPress={() => onAttach(ri)}>📎 Attach</Text>
            </View>
            {(s.links?.[ri]?.length ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6, marginLeft: 4 }}>
                {(s.links?.[ri] || []).map((l, li) => (
                  <View key={li} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ color: base.blue, fontSize: 12.5 }} onPress={async () => { const u = l.path && l.bucket ? await openDocLink(l.bucket, l.path) : null; if (u) viewDoc(u, l.name || ''); }}>📄 {l.name || 'Document'}</Text>
                    <Text style={{ color: base.red, fontSize: 12 }} onPress={async () => { if (await confirmAsk(`Remove "${l.name || 'this file'}" from this row?`, 'Remove')) up((t) => { (t.links as { name?: string }[][])[ri].splice(li, 1); }); }}>✕</Text>
                  </View>
                ))}
              </View>
            )}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Text style={small} onPress={() => up((t) => { (t.rows = t.rows || []).push((t.columns || []).map((_, i) => (t.type === 'materials' && i === 0 ? String((t.rows || []).length + 1) : ''))); (t.links = t.links || []).push([]); })}>+ Row</Text>
        <Text style={small} onPress={() => up((t) => { (t.columns = t.columns || []).push('New column'); (t.rows || []).forEach((r) => r.push('')); })}>+ Column</Text>
      </View>
      {!!busy && <Muted>{busy}</Muted>}
      <Muted style={{ marginTop: 4 }}>Files attached to a row go in the back of the PDF{s.type === 'materials' ? ', straight after that product' : ''}.</Muted>
    </>
  );
}

function MaintEdit({ s, up }: { s: OmSection; up: (fn: (t: OmSection) => void) => void }) {
  const items = s.items || [];
  const missing = Object.keys(HO_MAINT).filter((k) => !items.some((i) => i.key === k));
  return (
    <>
      {items.map((it, i) => (
        <View key={it.id} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput value={it.title} onChangeText={(v) => up((t) => { (t.items || [])[i].title = v; })} placeholder="Heading" style={[box, { flex: 1, fontWeight: '600' }]} />
            <Text style={small} onPress={() => up((t) => { const a = t.items || []; if (i > 0) [a[i], a[i - 1]] = [a[i - 1], a[i]]; })}>▲</Text>
            <Text style={[small, { color: base.red }]} onPress={() => up((t) => { t.items = (t.items || []).filter((x) => x.id !== it.id); })}>✕</Text>
          </View>
          <TextInput value={it.text} onChangeText={(v) => up((t) => { (t.items || [])[i].text = v; })} multiline style={[box, { minHeight: 80, textAlignVertical: 'top' }]} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {missing.map((k) => <Text key={k} style={small} onPress={() => up((t) => { (t.items = t.items || []).push({ id: omUid(), key: k, title: HO_MAINT[k].label, text: HO_MAINT[k].text }); })}>+ {HO_MAINT[k].label}</Text>)}
        <Text style={small} onPress={() => up((t) => { (t.items = t.items || []).push({ id: omUid(), key: null, title: '', text: '' }); })}>+ Your own</Text>
      </View>
    </>
  );
}

function PhotoPicker({ siteId, single, onPick, onClose }: { siteId: string; single: boolean; onPick: (p: OmPhoto[]) => void; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['omPhotos', siteId], queryFn: () => jobPhotos(siteId) });
  const [sel, setSel] = useState<number[]>([]);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: base.card, borderRadius: 12, padding: 14, maxHeight: '90%', maxWidth: 760, width: '100%', alignSelf: 'center' }}>
          <SectionTitle>{single ? 'Choose the cover photo' : 'Add job photos'}</SectionTitle>
          <ScrollView>
            {isLoading ? <Muted>Loading…</Muted> : !data.length ? <Muted>No Schedule of Works photos on this job yet.</Muted> : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {data.map((p, i) => (
                  <Pressable key={`${p.path}${i}`} onPress={() => (single ? onPick([p]) : setSel(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]))} style={{ borderWidth: 3, borderColor: sel.includes(i) ? base.blue : 'transparent', borderRadius: 8 }}>
                    <StorageImage bucket={p.bucket} path={p.thumb} style={{ width: 104, height: 80, borderRadius: 5 }} />
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {!single && <View style={{ flex: 1 }}><Button title={`Add ${sel.length || ''}`} disabled={!sel.length} onPress={() => onPick(sel.map((i) => ({ bucket: data[i].bucket, path: data[i].path, caption: data[i].caption })))} /></View>}
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={onClose} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Products from the COSHH Library, ticked to go into the Materials Log (857 hoPickDatasheets).
function LibraryPicker({ orgId, have, onPick, onClose }: { orgId: string; have: string[]; onPick: (p: { title: string; manufacturer: string; sdsPath: string | null; assessPath: string | null }[]) => void; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['omLib', orgId], queryFn: async () => { const lib = await loadProducts(orgId); return { lib, amap: await assessMap(orgId, lib) }; } });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const lib = (data?.lib || []).filter((it) => !q.trim() || `${it.title} ${it.data.manufacturer || ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Popup title="Choose data sheets from the library" onClose={onClose} width={560} center footer={<PopupButtons yes={`Add ${sel.length || ''} ticked`} no="Cancel" onNo={onClose} onYes={() => onPick((data?.lib || []).filter((it) => sel.includes(it.id)).map((it) => ({ title: it.title, manufacturer: it.data.manufacturer || '', sdsPath: it.data.sdsPath || null, assessPath: data?.amap[it.id]?.files[0]?.storage_path || null })))} />}>
      <TextInput value={q} onChangeText={setQ} placeholder="Search products" style={box} />
      <Muted style={{ marginBottom: 6 }}>Each product goes into the log with its data sheet, and its COSHH assessment straight after.</Muted>
      {isLoading ? <Muted>Loading the library…</Muted> : !data?.lib.length ? <Muted>No products in the COSHH library yet — add data sheets in Admin › COSHH Library.</Muted> : lib.map((it) => {
        const inLog = have.includes(it.title.trim().toLowerCase()), on = sel.includes(it.id), a = data.amap[it.id];
        return (
          <Pressable key={it.id} disabled={inLog} onPress={() => setSel(on ? sel.filter((x) => x !== it.id) : [...sel, it.id])} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: base.line, opacity: inLog ? 0.5 : 1 }}>
            <Text style={{ fontSize: 18 }}>{on || inLog ? '☑' : '☐'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: base.ink }}>{it.title}</Text>
              <Muted>{[it.data.manufacturer, it.data.sdsPath ? '📄 data sheet' : 'no data sheet', a ? '✓ COSHH assessment' : 'no COSHH yet', inLog ? 'already in the log' : ''].filter(Boolean).join(' · ')}</Muted>
            </View>
          </Pressable>
        );
      })}
    </Popup>
  );
}
