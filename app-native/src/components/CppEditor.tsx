// The Construction Phase Plan editor (Andy, 19 Nov 2026), for a job's plan and for the company's CPP template
// (Admin > H&S). A job's plan: Details / People / Plan / Emergency / Issue. The template: Company / Plan / Emergency /
// Contacts. Both save by themselves, with Next at the bottom of every tab (Andy, 20 Nov 2026: "make sure the cpp has a
// next button at the bottom of the tabs to go to the next one and auto save"). Site layout and fire route
// plans are a map snapshot (or a photo) marked up in the app; issuing again is a revision with its history.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { DateBox } from '@/components/DateField';
import { promptEmail } from '@/components/EmailPrompt';
import { FinTabs } from '@/components/FinNav';
import { MapSnapshot } from '@/components/MapSnapshot';
import { MarkupEditor } from '@/components/MarkupEditor';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { deleteCpp, findHospital, issueCpp, pointFor, previewCpp, saveCpp, saveCppDefaults, sowOutline, uploadCppImage, type CppRow } from '@/data/cpp';
import { openDocLink } from '@/data/hs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { deliverPdf, emailPdf, showPdf } from '@/lib/fileOut';
import { pickPhotos } from '@/lib/photos';
import { blankCpp, cppMissing, cppUid, f10Needed, fillCpp, type CppMarks, type CppPlan, type CppSection } from '@/lib/rules/cpp';
import type { MarkOp } from '@/lib/rules/markup';
import { supabase } from '@/lib/supabase';
import { base, radius } from '@/theme/theme';

type Tab = 'details' | 'people' | 'plan' | 'emergency' | 'issue' | 'company' | 'contacts';
const JOB_TABS: Tab[] = ['details', 'people', 'plan', 'emergency', 'issue'];
const TEMPLATE_TABS: Tab[] = ['company', 'plan', 'emergency', 'contacts'];
const TAB_LABEL: Record<Tab, string> = { details: 'Details', people: 'People', plan: 'Plan', emergency: 'Emergency', issue: 'Issue', company: 'Company', contacts: 'Contacts' };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 } as const;
const label = { fontWeight: '600' as const, marginBottom: 3 };
const X_W = 26; // the ✕ column, kept on every line of a row so the boxes line up (Andy, 19 Nov 2026)

type JobProps = { mode: 'job'; row0: CppRow; initial: CppPlan; siteId: string };
type TemplateProps = { mode: 'template'; initial: CppPlan; orgId: string };

export function CppEditor(props: JobProps | TemplateProps) {
  const job = props.mode === 'job';
  const siteId = job ? props.siteId : '';
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const { data: site } = useSite(job ? siteId : undefined);
  const [p, setP] = useState<CppPlan>(props.initial);
  const [row, setRow] = useState<CppRow | null>(job ? props.row0 : null);
  const TABS = job ? JOB_TABS : TEMPLATE_TABS;
  const [tab, setTab] = useState<Tab>(TABS[0]);
  const [editId, setEditId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [snap, setSnap] = useState<{ k: 'sitePlan' | 'firePlan'; at: { lat: number; lon: number } | null } | null>(null);
  const [mark, setMark] = useState<{ k: 'sitePlan' | 'firePlan'; src: string; base: string; ops: MarkOp[] } | null>(null);
  const [saveState, setSaveState] = useState(!job ? 'Your company\'s starting point for every new plan · saves by itself' : props.row0.status === 'issued' ? `Issued v${props.row0.version} · changes go in the next revision` : 'Draft · saves by itself');
  const latest = useRef(p), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = async (x: CppPlan) => (job ? saveCpp((row as CppRow).id, x) : saveCppDefaults((props as TemplateProps).orgId, x));
  const saveNow = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const ok = await persist(latest.current);
    setSaveState(ok ? (job ? (row?.status === 'issued' ? `Issued v${row?.version} · changes go in the next revision` : 'Draft · saves by itself') : 'Your company\'s starting point for every new plan · saves by itself') : 'Not saved - check signal');
    if (job) void qc.invalidateQueries({ queryKey: ['cppPlans', siteId] });
    return ok;
  };
  const change = (fn: (x: CppPlan) => CppPlan) => {
    const next = fn(latest.current); latest.current = next; setP(next);
    setSaveState('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveNow(); }, 700);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void persist(latest.current); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  const set = <K extends keyof CppPlan>(k: K, v: CppPlan[K]) => change((x) => ({ ...x, [k]: v }));
  const setIn = <K extends 'pc' | 'client' | 'pm' | 'hospital' | 'hospitalFrom'>(k: K, f: string, v: string) => change((x) => ({ ...x, [k]: { ...x[k], [f]: v } }));
  const go = async (t: Tab) => { if (timer.current) await saveNow(); setTab(t); setEditId(null); };

  const input = (l: string, value: string, onChange: (v: string) => void, o: { multi?: boolean; kb?: 'phone-pad' | 'email-address' | 'numeric'; ph?: string; lines?: number; off?: boolean } = {}) => (
    <View key={l}>
      <Muted style={label}>{l}</Muted>
      <TextInput value={value} onChangeText={onChange} editable={!o.off} multiline={o.multi} keyboardType={o.kb} placeholder={o.ph} placeholderTextColor={base.slateLight} autoCapitalize={o.kb === 'email-address' ? 'none' : undefined}
        style={[box, o.multi ? { minHeight: 22 * (o.lines || 3), textAlignVertical: 'top' } : null, o.off ? { backgroundColor: '#EEF0F3', color: base.slate } : null]} />
    </View>
  );
  const two = (a: React.ReactNode, b: React.ReactNode) => <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1, minWidth: 0 }}>{a}</View><View style={{ flex: 1, minWidth: 0 }}>{b}</View></View>;
  const centre = (...kids: React.ReactNode[]) => <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>{kids}</View>;
  const remove = (lab: string, fn: () => void) => <Pressable accessibilityLabel={lab} hitSlop={8} onPress={fn} style={{ width: X_W, alignItems: 'center', paddingBottom: 18 }}><Text style={{ color: base.slate, fontSize: 16 }}>✕</Text></Pressable>;
  const spacer = <View style={{ width: X_W }} />;
  const imgUrl = (path: string | null) => (path ? supabase.storage.from('mc-documents').getPublicUrl(path).data.publicUrl : null);

  // ----- Next at the bottom of every tab; it saves by itself (Andy, 19 and 20 Nov 2026) -----
  const footer = (t: Tab) => {
    const nx = TABS[TABS.indexOf(t) + 1];
    return centre(
      nx ? <Button key="next" title={`Next: ${TAB_LABEL[nx]} ›`} onPress={() => void go(nx)} /> : null,
    );
  };

  // ----- Site plans: a map snapshot or a photo, marked up in the app -----
  const startMarkup = async (k: 'sitePlan' | 'firePlan', picture: string) => {
    setBusy(k); const basePath = await uploadCppImage(siteId, picture); setBusy('');
    if (!basePath) { toast('Could not save the picture - try again.'); return; }
    setMark({ k, src: picture, base: basePath, ops: [] });
  };
  const choosePicture = async (k: 'sitePlan' | 'firePlan') => {
    const opts = [{ key: 'map', label: '🗺 Map Snapshot Of The Job' }, { key: 'photo', label: '📷 A Photo Or Picture' }, ...(k === 'firePlan' && p.sitePlanMarks.base ? [{ key: 'copy', label: '📋 Start From The Site Layout Map' }] : [])];
    const c = await chooseAction(k === 'sitePlan' ? 'Site Layout Plan' : 'Fire Route Plan', opts);
    if (c === 'map') { setBusy(k); const at = site ? await pointFor({ address: p.siteAddress, postcode: site.postcode || '' }, site) : null; setBusy(''); setSnap({ k, at }); }
    if (c === 'photo') { const r = await pickPhotos('library', false); if ('error' in r) { toast(r.error); return; } if (r[0]) await startMarkup(k, r[0].uri); }
    if (c === 'copy' && p.sitePlanMarks.base) setMark({ k, src: imgUrl(p.sitePlanMarks.base) as string, base: p.sitePlanMarks.base, ops: [] });
  };
  const picture = (title: string, k: 'sitePlan' | 'firePlan') => {
    const mk = k === 'sitePlan' ? p.sitePlanMarks : p.firePlanMarks, mkKey = k === 'sitePlan' ? 'sitePlanMarks' : 'firePlanMarks';
    return (
      <View key={k} style={{ marginBottom: 12 }}>
        <Muted style={label}>{title}</Muted>
        {p[k] ? <Image source={{ uri: imgUrl(p[k]) as string }} style={{ width: '100%', height: 220, borderRadius: radius.input, backgroundColor: '#EEF0F3', marginBottom: 6 }} resizeMode="contain" /> : <Muted style={{ marginBottom: 6 }}>No plan yet.</Muted>}
        {centre(
          p[k] && mk.base ? <Button key="mk" small busy={busy === k} title="✎ Mark Up" onPress={() => setMark({ k, src: imgUrl(mk.base) as string, base: mk.base as string, ops: (mk.ops || []) as MarkOp[] })} /> : null,
          <Button key="add" small kind={p[k] ? 'ghost' : 'primary'} busy={busy === k && !p[k]} title={p[k] ? 'Start Again' : 'Add Plan'} onPress={() => void choosePicture(k)} />,
          p[k] ? <Button key="rm" small kind="ghost" title="Remove" onPress={async () => { if (await confirmAsk(`Remove the ${title.toLowerCase()} from this plan?`, 'Yes', 'No')) change((x) => ({ ...x, [k]: null, [mkKey]: { base: null, ops: [] } })); }} /> : null,
        )}
      </View>
    );
  };

  // ----- Details (job) / Company (template) -----
  const f10 = f10Needed(p.duration, p.workers);
  const companyCard = (
    <Card>
      <SectionTitle>{job ? 'Principal Contractor' : 'Your Company'}</SectionTitle>
      {job && input('Company Name', p.pc.name, (v) => setIn('pc', 'name', v))}
      {job && input('Address', p.pc.address, (v) => setIn('pc', 'address', v), { multi: true, lines: 3 })}
      {job && two(input('Phone', p.pc.phone, (v) => setIn('pc', 'phone', v), { kb: 'phone-pad' }), input('Email', p.pc.email, (v) => setIn('pc', 'email', v), { kb: 'email-address' }))}
      {two(input('Safety Advisor', p.advisor, (v) => set('advisor', v), { ph: 'e.g. HS Direct Ltd' }), input('Waste Carrier Licence No.', p.wasteLicence, (v) => set('wasteLicence', v), { ph: 'e.g. CBDU...' }))}
      {!job && input('Site Hours', p.siteHours, (v) => set('siteHours', v), { multi: true, lines: 2 })}
      {!job && input('Health And Safety Executive Details', p.hse, (v) => set('hse', v), { multi: true, lines: 3 })}
    </Card>
  );
  const details = () => (
    <>
      {companyCard}
      <Card>
        <SectionTitle>The Job</SectionTitle>
        {input('Site Name', p.siteName, (v) => set('siteName', v))}
        {input('Site Address', p.siteAddress, (v) => set('siteAddress', v), { multi: true, lines: 3 })}
        {two(<View><Muted style={label}>Start Date</Muted><DateBox value={p.startDate} onChange={(v) => set('startDate', v)} title="Start Date" style={{ marginBottom: 8 }} /></View>, input('Expected Duration', p.duration, (v) => set('duration', v), { ph: 'e.g. 6 weeks' }))}
        {input('Most Workers On Site At Once', p.workers, (v) => set('workers', v), { kb: 'numeric', ph: 'e.g. 6' })}
        <Muted style={{ marginBottom: 8 }}>{f10 === null ? 'Add the duration and the number of workers to check whether HSE must be told (F10).' : f10 ? 'HSE must be told about this job: an F10 is needed before work starts.' : 'This job does not need an F10.'}</Muted>
        {input('Site Hours', p.siteHours, (v) => set('siteHours', v), { multi: true, lines: 2 })}
      </Card>
      <Card>
        <SectionTitle>Outline Of Works</SectionTitle>
        {input('From The Schedule Of Works (Edit As Needed)', p.outline, (v) => set('outline', v), { multi: true, lines: 6 })}
        {centre(<Button key="sow" small kind="ghost" busy={busy === 'sow'} title="Refresh From Schedule Of Works" onPress={async () => {
          if (p.outline.trim() && !(await confirmAsk('Replace the outline with the Schedule of Works as it is now?', 'Yes', 'No'))) return;
          setBusy('sow'); const o = await sowOutline(siteId); setBusy('');
          if (o) set('outline', o); else toast('The Schedule of Works is empty.');
        }} />)}
      </Card>
      <Card>
        <SectionTitle>Version And Issue Record</SectionTitle>
        {two(input('Version', String(p.version), () => undefined, { off: true }), <View><Muted style={label}>Date Prepared</Muted><DateBox value={p.preparedDate} onChange={(v) => set('preparedDate', v)} title="Date Prepared" style={{ marginBottom: 8 }} /></View>)}
        {input('Prepared By', p.preparedBy, (v) => set('preparedBy', v))}
        {p.issues.map((iss, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
            <View style={{ width: 54 }}>{input('Copy', iss.copy, (v) => set('issues', p.issues.map((x, k) => (k === i ? { ...x, copy: v } : x))))}</View>
            <View style={{ width: 62 }}>{input('Version', iss.version, (v) => set('issues', p.issues.map((x, k) => (k === i ? { ...x, version: v } : x))))}</View>
            <View style={{ flex: 1, minWidth: 0 }}>{input('Issued To', iss.issuedTo, (v) => set('issues', p.issues.map((x, k) => (k === i ? { ...x, issuedTo: v } : x))))}</View>
            {remove('Remove this row', () => set('issues', p.issues.filter((_, k) => k !== i)))}
          </View>
        ))}
        {centre(<Button key="iss" small kind="ghost" title="+ Add Issue Row" onPress={() => set('issues', [...p.issues, { copy: String(p.issues.length + 1), version: String(p.version), issuedTo: '', date: '' }])} />)}
      </Card>
      <Card>
        <SectionTitle>Site Plans</SectionTitle>
        <Muted style={{ marginBottom: 8 }}>Take a map snapshot of the job (or use a photo) and mark it up here: access, egress, compound, skips, welfare, fire escape route and assembly point. They go at the back of the plan.</Muted>
        {picture('Site Layout Plan', 'sitePlan')}
        {picture('Fire Route Plan', 'firePlan')}
      </Card>
    </>
  );

  // ----- People (job) / Contacts (template) -----
  const contactsCard = (
    <Card>
      <SectionTitle>Contact Details Sheet</SectionTitle>
      {p.contacts.map((c, i) => {
        const upd = (f: keyof typeof c, v: string) => set('contacts', p.contacts.map((x, k) => (k === i ? { ...x, [f]: v } : x)));
        return (
          <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: base.line, paddingTop: i ? 8 : 0 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
              <View style={{ flex: 1, minWidth: 0 }}>{input('Person', c.role, (v) => upd('role', v))}</View>
              <View style={{ flex: 1, minWidth: 0 }}>{input('Name', c.name, (v) => upd('name', v))}</View>
              {remove('Remove this contact', () => set('contacts', p.contacts.filter((_, k) => k !== i)))}
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
              <View style={{ flex: 1, minWidth: 0 }}>{input('Daytime Phone', c.day, (v) => upd('day', v), { kb: 'phone-pad' })}</View>
              <View style={{ flex: 1, minWidth: 0 }}>{input('Out Of Hours', c.ooh, (v) => upd('ooh', v), { kb: 'phone-pad' })}</View>
              {spacer}
            </View>
          </View>
        );
      })}
      {centre(<Button key="c" small kind="ghost" title="+ Add Contact" onPress={() => set('contacts', [...p.contacts, { role: '', name: '', day: '', ooh: '' }])} />)}
    </Card>
  );
  const people = () => (
    <>
      <Card>
        <SectionTitle>Client</SectionTitle>
        {two(input('Client', p.client.name, (v) => setIn('client', 'name', v)), input('Contact', p.client.contact, (v) => setIn('client', 'contact', v)))}
        {input('Address', p.client.address, (v) => setIn('client', 'address', v), { multi: true, lines: 3 })}
        {two(input('Phone', p.client.phone, (v) => setIn('client', 'phone', v), { kb: 'phone-pad' }), input('Email', p.client.email, (v) => setIn('client', 'email', v), { kb: 'email-address' }))}
        {input('Client Agent / Project Management', p.clientAgent, (v) => set('clientAgent', v), { ph: 'e.g. As per client info' })}
        {two(input('Principal Designer', p.principalDesigner, (v) => set('principalDesigner', v)), input('Architect', p.architect, (v) => set('architect', v)))}
      </Card>
      <Card>
        <SectionTitle>Project Manager And First Aiders</SectionTitle>
        {input('Project Manager', p.pm.name, (v) => setIn('pm', 'name', v))}
        {two(input('Phone', p.pm.phone, (v) => setIn('pm', 'phone', v), { kb: 'phone-pad' }), input('Email', p.pm.email, (v) => setIn('pm', 'email', v), { kb: 'email-address' }))}
        {input('First Aiders (From Certificates Of People On This Job)', p.firstAiders, (v) => set('firstAiders', v), { multi: true, lines: 2, ph: 'Nobody on the job has an in-date first aid certificate - type who it is' })}
      </Card>
      {contactsCard}
    </>
  );

  // ----- Plan (the numbered sections) -----
  const setS = (sid: string, patch: Partial<CppSection>) => change((x) => ({ ...x, sections: x.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }));
  const move = (i: number, d: -1 | 1) => change((x) => { const a = x.sections.slice(), j = i + d; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, sections: a }; });
  const plan = () => (
    <>
      <Muted style={{ marginBottom: 8 }}>{job ? 'Section 1 (Project Directory) is made from the People tab. ' : ''}Words in curly brackets fill themselves in on each plan: {'{company}'}, {'{client}'}, {'{site}'}, {'{advisor}'}, {'{wasteLicence}'}, {'{siteHours}'}, {'{emergencyMobile}'}.</Muted>
      {p.sections.map((s, i) => {
        const editing = editId === s.id, open = openId === s.id, shown = job ? fillCpp(s.body, p) : s.body, lines = shown.split('\n');
        return (
          <Card key={s.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable style={{ flex: 1 }} onPress={() => setOpenId(open ? null : s.id)}><Text style={{ fontWeight: '600', fontSize: 15, color: base.ink }}>{s.num}. {s.title} {open ? '▴' : '▾'}</Text></Pressable>
              {[['↑', i === 0, () => move(i, -1)], ['↓', i === p.sections.length - 1, () => move(i, 1)], ['✎', false, () => { setEditId(editing ? null : s.id); setOpenId(s.id); }],
                ['🗑', false, async () => { if (await confirmAsk(`Remove section ${s.num}, "${s.title}", from this ${job ? 'plan' : 'template'}?`, 'Yes', 'No')) change((x) => ({ ...x, sections: x.sections.filter((y) => y.id !== s.id) })); }],
              ].map(([l, dis, fn]) => <Pressable key={l as string} disabled={dis as boolean} onPress={fn as () => void} hitSlop={6} style={{ opacity: dis ? 0.3 : 1 }} accessibilityLabel={`${l}`}><Text style={{ fontSize: 16 }}>{l as string}</Text></Pressable>)}
            </View>
            {editing ? (
              <View style={{ marginTop: 8 }}>
                {two(input('Number', s.num, (v) => setS(s.id, { num: v })), input('Title', s.title, (v) => setS(s.id, { title: v })))}
                {input('Wording', s.body, (v) => setS(s.id, { body: v }), { multi: true, lines: 14 })}
                {centre(<Button key="done" small title="Close" onPress={() => setEditId(null)} />)}
              </View>
            ) : (
              <Text style={{ marginTop: 6, color: base.slate, fontSize: 13, lineHeight: 19 }}>{open ? shown : `${lines.slice(0, 3).join('\n')}${lines.length > 3 ? ' …' : ''}`}</Text>
            )}
          </Card>
        );
      })}
      {centre(
        <Button key="add" small kind="ghost" title="+ Add Section" onPress={() => { const n = { id: cppUid(), num: String((Number(p.sections[p.sections.length - 1]?.num) || 18) + 1), title: 'New Section', body: '' }; change((x) => ({ ...x, sections: [...x.sections, n] })); setEditId(n.id); setOpenId(n.id); }} />,
        !job ? <Button key="std" small kind="ghost" title="Back To Standard Wording" onPress={async () => { if (await confirmAsk('Put every section back to the standard wording? Your changes to the sections are lost.', 'Yes', 'No')) set('sections', blankCpp().sections); }} /> : null,
      )}
    </>
  );

  // ----- Emergency -----
  const wide = width >= 640;
  const numberBlock = (u: CppPlan['utilities'][number], i: number) => {
    const upd = (f: keyof typeof u, v: string) => set('utilities', p.utilities.map((x, k) => (k === i ? { ...x, [f]: v } : x)));
    return (
      <View key={i} style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{input('Service', u.service, (v) => upd('service', v))}</View>
          <View style={{ flex: 1.4, minWidth: 0 }}>{input('Company', u.company, (v) => upd('company', v), { ph: u.service === 'Water' ? 'Your area\'s water company' : undefined })}</View>
          {remove('Remove this number', () => set('utilities', p.utilities.filter((_, k) => k !== i)))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{input('Emergency Contact No.', u.emergency || u.phone, (v) => upd('emergency', v), { kb: 'phone-pad' })}</View>
          {spacer}
        </View>
      </View>
    );
  };
  const numbers = () => {
    const rows: [number, number | null][] = [];
    const per = wide ? 2 : 1;
    for (let i = 0; i < p.utilities.length; i += per) rows.push([i, per === 2 && i + 1 < p.utilities.length ? i + 1 : null]);
    return (
      <Card>
        <SectionTitle>Emergency Numbers</SectionTitle>
        {rows.map(([a, b], r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 12, borderTopWidth: r ? 1 : 0, borderTopColor: base.line, paddingTop: r ? 8 : 0 }}>
            {numberBlock(p.utilities[a], a)}
            {wide && <View style={{ width: 1, backgroundColor: base.line, marginBottom: 8 }} />}
            {wide && (b !== null ? numberBlock(p.utilities[b], b) : <View style={{ flex: 1 }} />)}
          </View>
        ))}
        {centre(<Button key="u" small kind="ghost" title="+ Add Number" onPress={() => set('utilities', [...p.utilities, { service: '', company: '', phone: '', emergency: '' }])} />)}
      </Card>
    );
  };
  const emergency = () => (
    <>
      {job && (
        <Card>
          <SectionTitle>Nearest A&amp;E</SectionTitle>
          {/* Just the job's postcode, changeable (Andy, 19 Nov 2026: "delete this and just pull through the project postcode"). */}
          <Muted style={{ marginBottom: 6 }}>Searches from the job&apos;s postcode. Change it if needed, then press Find Nearest A&amp;E.</Muted>
          {two(input('Postcode', p.hospitalFrom.postcode || site?.postcode || '', (v) => setIn('hospitalFrom', 'postcode', v.toUpperCase())), <View />)}
          {centre(
            <Button key="find" small busy={busy === 'h'} title="Find Nearest A&E" onPress={async () => {
              const from = latest.current.hospitalFrom, pc = (from.postcode || site?.postcode || '').trim();
              // The job's address only when there's no postcode at all.
              setBusy('h'); const h = await findHospital({ address: pc ? '' : from.address, postcode: pc }, site); setBusy('');
              if (typeof h === 'string') { showAlert(h); return; }
              set('hospital', h);
            }} />,
            p.hospital.route ? <Button key="route" small kind="ghost" title="Open Route ↗" onPress={() => void Linking.openURL(p.hospital.route)} /> : null,
          )}
          <View style={{ height: 10 }} />
          {input('Hospital', p.hospital.name, (v) => setIn('hospital', 'name', v))}
          {input('Address', p.hospital.address, (v) => setIn('hospital', 'address', v), { multi: true, lines: 2 })}
          {two(input('Phone', p.hospital.phone, (v) => setIn('hospital', 'phone', v), { kb: 'phone-pad' }), input('Distance', p.hospital.distance, (v) => setIn('hospital', 'distance', v)))}
          {input('Route Plan (Link)', p.hospital.route, (v) => setIn('hospital', 'route', v))}
          <Muted>Found on OpenStreetMap. Check it has a 24-hour A&amp;E before issuing.</Muted>
        </Card>
      )}
      {job && <Card>{input('Emergency Mobile For This Job', p.emergencyMobile, (v) => set('emergencyMobile', v), { kb: 'phone-pad' })}</Card>}
      {numbers()}
      {job && <Card><SectionTitle>Health And Safety Executive</SectionTitle>{input('HSE Details', p.hse, (v) => set('hse', v), { multi: true, lines: 3 })}</Card>}
    </>
  );

  // ----- Issue and revisions -----
  const missing = cppMissing(p);
  const issued = row?.status === 'issued';
  // The issued plan first, as a RAMS row: its version, when and who, and View / Export / Email; revising it underneath,
  // smaller (Andy, 19 Nov 2026: "make this a bit more like the rams layout, so the issued CPP is more prominent rather
  // than the preview pdf etc. also add export / email buttons in here please").
  const cur = issued ? p.revisions.find((r) => r.version === row?.version && r.path) ?? null : null;
  const older = p.revisions.filter((r) => r.version !== cur?.version).sort((a, b) => b.version - a.version);
  const fileName = (v: number) => `Construction Phase Plan - ${(p.siteName || 'Job').replace(/[\\/:*?"<>|]+/g, '-')} - v${v}.pdf`;
  const issuedBytes = async (path: string) => { const u = await openDocLink('mc-documents', path); if (!u) return null; try { return new Uint8Array(await (await fetch(u)).arrayBuffer()); } catch { return null; } };
  const exportPdf = async (path: string, v: number) => {
    setBusy('ex'); const b = await issuedBytes(path); setBusy('');
    if (!b || !(await deliverPdf(b, fileName(v)))) toast('Could not save the PDF - try again.');
  };
  const emailIt = async (path: string, v: number) => {
    const to = await promptEmail('Email the Construction Phase Plan to:', { myEmail: me.email, clientEmail: site?.client_email }); if (!to) return;
    setBusy('em'); const b = await issuedBytes(path);
    const err = b ? await emailPdf(b, fileName(v), `${siteId}/cpp-exports`, { site_id: siteId, recipient_email: to.to, cc_email: to.cc, client_cc_email: to.clientCc, doc_title: `Construction Phase Plan - ${p.siteName || 'Job'} (Version ${v})` }) : 'Could not open the PDF - try again.';
    setBusy('');
    if (err) showAlert(err);
  };
  const when = (r: { date?: string | null; by?: string | null }) => `${r.date ? new Date(`${r.date}T00:00:00`).toLocaleDateString('en-GB') : ''}${r.by ? ` by ${r.by}` : ''}`;
  const issue = () => (
    <>
      {cur ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 28 }}>📘</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: base.ink }}>Construction Phase Plan · Version {cur.version}</Text>
              <Muted>Issued {when(cur)} · in the Construction Phase Plan folder{cur.note && cur.version > 1 ? ` · ${cur.note}` : ''}</Muted>
            </View>
          </View>
          {centre(
            <Button key="vw" small kind="ghost" title="👁 View" onPress={async () => { const u = await openDocLink('mc-documents', cur.path as string); if (u) viewDoc(u); else toast('Could not open the PDF.'); }} />,
            <Button key="ex" small kind="ghost" busy={busy === 'ex'} title="⬇ Export" onPress={() => void exportPdf(cur.path as string, cur.version)} />,
            <Button key="em" small kind="ghost" busy={busy === 'em'} title="✉ Email" onPress={() => void emailIt(cur.path as string, cur.version)} />,
          )}
          {older.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Muted style={{ fontWeight: '600', marginBottom: 2 }}>Earlier Versions</Muted>
              {older.map((r) => (
                <View key={r.version} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: base.line }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: base.ink }}>Version {r.version} (Superseded)</Text>
                    <Muted style={{ fontSize: 12 }}>{when(r)}{r.note ? ` · ${r.note}` : ''}</Muted>
                  </View>
                  {r.path ? <Button small kind="ghost" title="View" onPress={async () => { const u = await openDocLink('mc-documents', r.path as string); if (u) viewDoc(u); else toast('Could not open the PDF.'); }} /> : null}
                </View>
              ))}
            </View>
          )}
        </Card>
      ) : null}
      <Card>
        <SectionTitle>{issued ? 'Revise The Plan' : 'Ready To Issue?'}</SectionTitle>
        {missing.length ? <Muted style={{ color: base.warn, marginBottom: 8 }}>Still to fill in: {missing.join(', ')}.</Muted> : <Muted style={{ marginBottom: 8 }}>Everything needed is filled in.</Muted>}
        <Muted style={{ marginBottom: 10 }}>{issued ? `Change what's needed on the other tabs, then issue revision ${p.version + 1} here. You'll be asked what has changed; the earlier version stays in the folder, marked superseded.` : 'Issuing makes the PDF and puts it in this job\'s Construction Phase Plan folder.'}</Muted>
        {centre(
          <Button key="pv" small={issued} kind="ghost" busy={busy === 'pv'} title="Preview PDF" onPress={async () => {
            if (timer.current) await saveNow();
            setBusy('pv');
            try { const out = await previewCpp(org as never, siteId, latest.current); await showPdf(out.bytes, `Construction Phase Plan - ${p.siteName || 'Job'}.pdf`); } catch { toast('Could not make the PDF - try again.'); }
            setBusy('');
          }} />,
          <Button key="is" small={issued} kind={issued ? 'ghost' : 'primary'} busy={busy === 'is'} title={issued ? `Issue Revision ${p.version + 1}` : 'Issue Plan'} onPress={async () => {
            if (missing.length && !(await confirmAsk(`Still to fill in: ${missing.join(', ')}.\n\nIssue it anyway?`, 'Yes', 'No'))) return;
            let note = 'First issue';
            if (issued) { const n = await promptText(`What has changed in revision ${p.version + 1}?`, ''); if (n === null) return; if (!n.trim()) { showAlert('Say briefly what has changed, so it shows in the revision history.'); return; } note = n.trim(); }
            if (timer.current) await saveNow();
            setBusy('is'); const r = await issueCpp(me, org as never, row as CppRow, latest.current, note); setBusy('');
            if (typeof r === 'string') { showAlert(r); return; }
            latest.current = r.plan; setP(r.plan); setRow({ ...(row as CppRow), status: 'issued', version: r.plan.version, mc_document_id: r.docId });
            setSaveState(`Issued v${r.plan.version} · in the Construction Phase Plan folder`);
            void qc.invalidateQueries({ queryKey: ['cppPlans', siteId] }); void qc.invalidateQueries({ queryKey: ['mcDocs', siteId, 'cpp'] }); void qc.invalidateQueries({ queryKey: ['mcTiles', siteId] });
          }} />,
        )}
      </Card>
      <Card>
        {centre(
          <Button key="def" small kind="ghost" busy={busy === 'def'} title="Save Wording To Company Template" onPress={async () => {
            if (!(await confirmAsk('Use this plan\'s wording, safety advisor, waste licence, site hours, emergency numbers and contacts as your company\'s CPP template (Admin › H&S) for every new plan?', 'Yes', 'No'))) return;
            setBusy('def'); const ok = await saveCppDefaults(me.org_id as string, latest.current); setBusy('');
            setSaveState(ok ? 'Wording saved to the company template' : 'Could not save the wording - try again');
          }} />,
          <Button key="del" small kind="ghost" title="Delete This Plan" onPress={async () => {
            if (!(await confirmAsk(`Delete this plan?${issued ? ' The issued PDFs stay in the folder.' : ''}`, 'Yes', 'No'))) return;
            if (await deleteCpp((row as CppRow).id)) { void qc.invalidateQueries({ queryKey: ['cppPlans', siteId] }); router.back(); } else toast('Could not delete - try again.');
          }} />,
        )}
      </Card>
    </>
  );

  const tabCount = (t: Tab) => (t === 'plan' ? `Plan (${p.sections.length})` : t === 'details' && missing.some((m) => /Principal|Site|Outline/.test(m)) ? 'Details ⚠' : t === 'emergency' && job && missing.some((m) => /A&E|mobile/.test(m)) ? 'Emergency ⚠' : TAB_LABEL[t]);
  const body = tab === 'details' ? details() : tab === 'people' ? people() : tab === 'plan' ? plan() : tab === 'emergency' ? emergency() : tab === 'issue' ? issue() : tab === 'company' ? companyCard : contactsCard;
  return (
    <>
      <Text style={{ fontSize: 19, fontWeight: '600', color: base.ink }}>{job ? p.siteName || 'Construction Phase Plan' : 'Construction Phase Plan Template'}</Text>
      <Muted style={{ marginBottom: 8 }}>{saveState}</Muted>
      <FinTabs even value={tab} onChange={(k) => void go(k as Tab)} items={TABS.map((t) => [t, tabCount(t)] as [string, string])} />
      <View style={{ height: 10 }} />
      {body}
      <View style={{ marginTop: 6, marginBottom: 20 }}>{footer(tab)}</View>
      {snap && <MapSnapshot at={snap.at} onClose={(pic) => { const k = snap.k; setSnap(null); if (pic) void startMarkup(k, pic); }} />}
      {mark && <MarkupEditor plan src={mark.src} ops={mark.ops} onClose={async (out) => {
        const m = mark; setMark(null);
        const mkKey = m.k === 'sitePlan' ? 'sitePlanMarks' : 'firePlanMarks';
        if (!out) { if (!latest.current[m.k]) change((x) => ({ ...x, [m.k]: m.base, [mkKey]: { base: m.base, ops: [] } as CppMarks })); return; }
        setBusy(m.k); const path = await uploadCppImage(siteId, out.image); setBusy('');
        if (!path) { toast('Could not save the marked-up plan - try again.'); return; }
        change((x) => ({ ...x, [m.k]: path, [mkKey]: { base: m.base, ops: out.ops } as CppMarks }));
      }} />}
    </>
  );
}
