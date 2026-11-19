// Construction Phase Plan builder (Andy, 19 Nov 2026: "replicate it as a rams style builder, pull through as much
// info as you have from the job"). Tabs like the RAMS builder: Details / People / Plan / Emergency / Issue. Changes
// save by themselves; Issue makes the PDF and files it in the job's Construction Phase Plan folder. Beta link only.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { FinTabs } from '@/components/FinNav';
import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { deleteCpp, findHospital, issueCpp, loadCpp, previewCpp, saveCpp, saveCppDefaults, sowOutline, uploadCppImage, type CppRow } from '@/data/cpp';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isBetaSite } from '@/lib/betaOnly';
import { showPdf } from '@/lib/fileOut';
import { pickPhotos } from '@/lib/photos';
import { isManager } from '@/lib/roles';
import { cppMissing, cppUid, f10Needed, fillCpp, type CppPlan, type CppSection } from '@/lib/rules/cpp';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

type Tab = 'details' | 'people' | 'plan' | 'emergency' | 'issue';
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 } as const;
const label = { fontWeight: '600' as const, marginBottom: 3 };

export default function CppScreen() {
  const { id, p: planId } = useLocalSearchParams<{ id: string; p: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['cpp', planId], enabled: !!planId, gcTime: 0, queryFn: () => loadCpp(planId) });
  if (!me) return null;
  if (!isBetaSite()) return <Muted style={{ padding: space.l }}>The Construction Phase Plan builder is on the beta link only for now.</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Project Managers and admins only.</Muted>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>Plan not found.</Muted>;
  return <Editor key={data.row.id} row0={data.row} initial={data.plan} siteId={id} />;
}

function Editor({ row0, initial, siteId }: { row0: CppRow; initial: CppPlan; siteId: string }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(siteId);
  const [p, setP] = useState<CppPlan>(initial);
  const [row, setRow] = useState<CppRow>(row0);
  const [tab, setTab] = useState<Tab>('details');
  const [editId, setEditId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [saveState, setSaveState] = useState(row0.status === 'issued' ? `Issued v${row0.version} · changes need re-issuing` : 'Draft · saves by itself');
  const latest = useRef(p), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveNow = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setSaveState((await saveCpp(row.id, latest.current)) ? 'All changes saved' : 'Not saved - check signal');
    void qc.invalidateQueries({ queryKey: ['cppPlans', siteId] });
  };
  const change = (fn: (x: CppPlan) => CppPlan) => {
    const next = fn(latest.current); latest.current = next; setP(next);
    setSaveState('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveNow(); }, 700);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void saveCpp(row.id, latest.current); } }, [row.id]);
  if (!me) return null;
  const set = <K extends keyof CppPlan>(k: K, v: CppPlan[K]) => change((x) => ({ ...x, [k]: v }));
  const setIn = <K extends 'pc' | 'client' | 'pm' | 'hospital'>(k: K, f: string, v: string) => change((x) => ({ ...x, [k]: { ...x[k], [f]: v } }));
  const go = async (t: Tab) => { if (timer.current) await saveNow(); setTab(t); setEditId(null); };

  const input = (l: string, value: string, onChange: (v: string) => void, o: { multi?: boolean; kb?: 'phone-pad' | 'email-address' | 'numeric'; ph?: string; lines?: number } = {}) => (
    <View key={l}>
      <Muted style={label}>{l}</Muted>
      <TextInput value={value} onChangeText={onChange} multiline={o.multi} keyboardType={o.kb} placeholder={o.ph} placeholderTextColor={base.slateLight} autoCapitalize={o.kb === 'email-address' ? 'none' : undefined}
        style={[box, o.multi ? { minHeight: 22 * (o.lines || 3), textAlignVertical: 'top' } : null]} />
    </View>
  );
  const two = (a: React.ReactNode, b: React.ReactNode) => <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1, minWidth: 0 }}>{a}</View><View style={{ flex: 1, minWidth: 0 }}>{b}</View></View>;
  const centre = (...kids: React.ReactNode[]) => <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>{kids}</View>;
  const imgUrl = (path: string | null) => (path ? supabase.storage.from('mc-documents').getPublicUrl(path).data.publicUrl : null);

  // ----- Details -----
  const f10 = f10Needed(p.duration, p.workers);
  const picture = (title: string, k: 'sitePlan' | 'firePlan') => (
    <View key={k} style={{ marginBottom: 10 }}>
      <Muted style={label}>{title}</Muted>
      {p[k] ? <Image source={{ uri: imgUrl(p[k]) as string }} style={{ width: '100%', height: 180, borderRadius: radius.input, backgroundColor: '#EEF0F3', marginBottom: 6 }} resizeMode="contain" /> : <Muted style={{ marginBottom: 6 }}>No picture yet.</Muted>}
      {centre(
        <Button key="add" small kind="ghost" busy={busy === k} title={p[k] ? 'Change Picture' : 'Add Picture'} onPress={async () => {
          const r = await pickPhotos('library', false);
          if ('error' in r) { toast(r.error); return; }
          if (!r[0]) return;
          setBusy(k); const path = await uploadCppImage(siteId, r[0].uri); setBusy('');
          if (path) set(k, path); else toast('Could not upload the picture - try again.');
        }} />,
        p[k] ? <Button key="rm" small kind="ghost" title="Remove" onPress={() => set(k, null)} /> : null,
      )}
    </View>
  );
  const details = () => (
    <>
      <Card>
        <SectionTitle>Principal Contractor</SectionTitle>
        {input('Company Name', p.pc.name, (v) => setIn('pc', 'name', v))}
        {input('Address', p.pc.address, (v) => setIn('pc', 'address', v), { multi: true, lines: 3 })}
        {two(input('Phone', p.pc.phone, (v) => setIn('pc', 'phone', v), { kb: 'phone-pad' }), input('Email', p.pc.email, (v) => setIn('pc', 'email', v), { kb: 'email-address' }))}
        {two(input('Safety Advisor', p.advisor, (v) => set('advisor', v), { ph: 'e.g. HS Direct Ltd' }), input('Waste Carrier Licence No.', p.wasteLicence, (v) => set('wasteLicence', v), { ph: 'e.g. CBDU...' }))}
      </Card>
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
        {two(input('Version', String(p.version), () => undefined), <View><Muted style={label}>Date Prepared</Muted><DateBox value={p.preparedDate} onChange={(v) => set('preparedDate', v)} title="Date Prepared" style={{ marginBottom: 8 }} /></View>)}
        {input('Prepared By', p.preparedBy, (v) => set('preparedBy', v))}
        {p.issues.map((iss, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
            <View style={{ width: 54 }}>{input('Copy', iss.copy, (v) => set('issues', p.issues.map((x, k) => (k === i ? { ...x, copy: v } : x))))}</View>
            <View style={{ width: 62 }}>{input('Version', iss.version, (v) => set('issues', p.issues.map((x, k) => (k === i ? { ...x, version: v } : x))))}</View>
            <View style={{ flex: 1, minWidth: 0 }}>{input('Issued To', iss.issuedTo, (v) => set('issues', p.issues.map((x, k) => (k === i ? { ...x, issuedTo: v } : x))))}</View>
            <Pressable accessibilityLabel="Remove this row" hitSlop={8} onPress={() => set('issues', p.issues.filter((_, k) => k !== i))} style={{ paddingBottom: 18 }}><Text style={{ color: base.slate, fontSize: 16 }}>✕</Text></Pressable>
          </View>
        ))}
        {centre(<Button key="iss" small kind="ghost" title="+ Add Issue Row" onPress={() => set('issues', [...p.issues, { copy: String(p.issues.length + 1), version: String(p.version), issuedTo: '', date: '' }])} />)}
      </Card>
      <Card>
        <SectionTitle>Site Plans</SectionTitle>
        <Muted style={{ marginBottom: 8 }}>A picture of the access, egress and compound layout, and of the fire escape route. They go at the back of the plan.</Muted>
        {picture('Site Layout Plan', 'sitePlan')}
        {picture('Fire Route Plan', 'firePlan')}
      </Card>
    </>
  );

  // ----- People -----
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
      <Card>
        <SectionTitle>Contact Details Sheet</SectionTitle>
        {p.contacts.map((c, i) => {
          const upd = (f: keyof typeof c, v: string) => set('contacts', p.contacts.map((x, k) => (k === i ? { ...x, [f]: v } : x)));
          return (
            <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: base.line, paddingTop: i ? 8 : 0 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
                <View style={{ flex: 1, minWidth: 0 }}>{input('Person', c.role, (v) => upd('role', v))}</View>
                <View style={{ flex: 1, minWidth: 0 }}>{input('Name', c.name, (v) => upd('name', v))}</View>
                <Pressable accessibilityLabel="Remove this contact" hitSlop={8} onPress={() => set('contacts', p.contacts.filter((_, k) => k !== i))} style={{ paddingBottom: 18 }}><Text style={{ color: base.slate, fontSize: 16 }}>✕</Text></Pressable>
              </View>
              {two(input('Daytime Phone', c.day, (v) => upd('day', v), { kb: 'phone-pad' }), input('Out Of Hours', c.ooh, (v) => upd('ooh', v), { kb: 'phone-pad' }))}
            </View>
          );
        })}
        {centre(<Button key="c" small kind="ghost" title="+ Add Contact" onPress={() => set('contacts', [...p.contacts, { role: '', name: '', day: '', ooh: '' }])} />)}
      </Card>
    </>
  );

  // ----- Plan (the numbered sections) -----
  const setS = (sid: string, patch: Partial<CppSection>) => change((x) => ({ ...x, sections: x.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }));
  const move = (i: number, d: -1 | 1) => change((x) => { const a = x.sections.slice(), j = i + d; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, sections: a }; });
  const plan = () => (
    <>
      <Muted style={{ marginBottom: 8 }}>Section 1 (Project Directory) is made from the People tab. Words in curly brackets, like {'{company}'}, fill in from the Details tab.</Muted>
      {p.sections.map((s, i) => {
        const editing = editId === s.id, open = openId === s.id, filled = fillCpp(s.body, p), lines = filled.split('\n');
        return (
          <Card key={s.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable style={{ flex: 1 }} onPress={() => setOpenId(open ? null : s.id)}><Text style={{ fontWeight: '600', fontSize: 15, color: base.ink }}>{s.num}. {s.title} {open ? '▴' : '▾'}</Text></Pressable>
              {[['↑', i === 0, () => move(i, -1)], ['↓', i === p.sections.length - 1, () => move(i, 1)], ['✎', false, () => { setEditId(editing ? null : s.id); setOpenId(s.id); }],
                ['🗑', false, async () => { if (await confirmAsk(`Remove section ${s.num}, "${s.title}", from this plan?`, 'Yes', 'No')) change((x) => ({ ...x, sections: x.sections.filter((y) => y.id !== s.id) })); }],
              ].map(([l, dis, fn]) => <Pressable key={l as string} disabled={dis as boolean} onPress={fn as () => void} hitSlop={6} style={{ opacity: dis ? 0.3 : 1 }} accessibilityLabel={`${l}`}><Text style={{ fontSize: 16 }}>{l as string}</Text></Pressable>)}
            </View>
            {editing ? (
              <View style={{ marginTop: 8 }}>
                {two(input('Number', s.num, (v) => setS(s.id, { num: v })), input('Title', s.title, (v) => setS(s.id, { title: v })))}
                {input('Wording', s.body, (v) => setS(s.id, { body: v }), { multi: true, lines: 14 })}
                {centre(<Button key="done" small title="Close" onPress={() => setEditId(null)} />)}
              </View>
            ) : (
              <Text style={{ marginTop: 6, color: base.slate, fontSize: 13, lineHeight: 19 }}>{open ? filled : `${lines.slice(0, 3).join('\n')}${lines.length > 3 ? ' …' : ''}`}</Text>
            )}
          </Card>
        );
      })}
      {centre(<Button key="add" kind="ghost" title="+ Add Section" onPress={() => { const n = { id: cppUid(), num: String((Number(p.sections[p.sections.length - 1]?.num) || 18) + 1), title: 'New Section', body: '' }; change((x) => ({ ...x, sections: [...x.sections, n] })); setEditId(n.id); setOpenId(n.id); }} />)}
    </>
  );

  // ----- Emergency -----
  const emergency = () => (
    <>
      <Card>
        <SectionTitle>Nearest A&amp;E</SectionTitle>
        {input('Hospital', p.hospital.name, (v) => setIn('hospital', 'name', v))}
        {input('Address', p.hospital.address, (v) => setIn('hospital', 'address', v), { multi: true, lines: 2 })}
        {two(input('Phone', p.hospital.phone, (v) => setIn('hospital', 'phone', v), { kb: 'phone-pad' }), input('Distance', p.hospital.distance, (v) => setIn('hospital', 'distance', v)))}
        {input('Route Plan (Link)', p.hospital.route, (v) => setIn('hospital', 'route', v))}
        <Muted style={{ marginBottom: 8 }}>Found on OpenStreetMap from the job&apos;s location. Check it has a 24-hour A&amp;E before issuing.</Muted>
        {centre(
          <Button key="find" small busy={busy === 'h'} title="Find Nearest A&E" onPress={async () => {
            if (!site) return;
            setBusy('h'); const h = await findHospital(site); setBusy('');
            if (typeof h === 'string') { showAlert(h); return; }
            set('hospital', h);
          }} />,
          p.hospital.route ? <Button key="route" small kind="ghost" title="Open Route ↗" onPress={() => void Linking.openURL(p.hospital.route)} /> : null,
        )}
      </Card>
      <Card>
        <SectionTitle>Emergency Numbers</SectionTitle>
        {input('Emergency Mobile For This Job', p.emergencyMobile, (v) => set('emergencyMobile', v), { kb: 'phone-pad' })}
        {p.utilities.map((u, i) => {
          const upd = (f: keyof typeof u, v: string) => set('utilities', p.utilities.map((x, k) => (k === i ? { ...x, [f]: v } : x)));
          return (
            <View key={i} style={{ borderTopWidth: 1, borderTopColor: base.line, paddingTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
                <View style={{ flex: 1, minWidth: 0 }}>{input('Service', u.service, (v) => upd('service', v))}</View>
                <View style={{ flex: 2, minWidth: 0 }}>{input('Company', u.company, (v) => upd('company', v), { ph: u.service === 'Water' ? 'Your area\'s water company' : undefined })}</View>
                <Pressable accessibilityLabel="Remove this number" hitSlop={8} onPress={() => set('utilities', p.utilities.filter((_, k) => k !== i))} style={{ paddingBottom: 18 }}><Text style={{ color: base.slate, fontSize: 16 }}>✕</Text></Pressable>
              </View>
              {two(input('Telephone', u.phone, (v) => upd('phone', v), { kb: 'phone-pad' }), input('Emergency', u.emergency, (v) => upd('emergency', v), { kb: 'phone-pad' }))}
            </View>
          );
        })}
        {centre(<Button key="u" small kind="ghost" title="+ Add Number" onPress={() => set('utilities', [...p.utilities, { service: '', company: '', phone: '', emergency: '' }])} />)}
      </Card>
      <Card>
        <SectionTitle>Health And Safety Executive</SectionTitle>
        {input('HSE Details', p.hse, (v) => set('hse', v), { multi: true, lines: 3 })}
      </Card>
    </>
  );

  // ----- Issue -----
  const missing = cppMissing(p);
  const issue = () => (
    <Card>
      <SectionTitle>{row.status === 'issued' ? `Issued As Version ${row.version}` : 'Ready To Issue?'}</SectionTitle>
      {missing.length ? <Muted style={{ color: base.warn, marginBottom: 8 }}>Still to fill in: {missing.join(', ')}.</Muted> : <Muted style={{ marginBottom: 8 }}>Everything needed is filled in.</Muted>}
      <Muted style={{ marginBottom: 10 }}>Issuing makes the PDF and puts it in this job&apos;s Construction Phase Plan folder.{row.status === 'issued' ? ` Issuing again makes version ${p.version + 1}; the earlier PDF stays in the folder.` : ''}</Muted>
      {centre(
        <Button key="pv" kind="ghost" busy={busy === 'pv'} title="Preview PDF" onPress={async () => {
          if (timer.current) await saveNow();
          setBusy('pv');
          try { const out = await previewCpp(org as never, siteId, latest.current); await showPdf(out.bytes, `Construction Phase Plan - ${p.siteName || 'Job'}.pdf`); } catch { toast('Could not make the PDF - try again.'); }
          setBusy('');
        }} />,
        <Button key="is" busy={busy === 'is'} title={row.status === 'issued' ? `Issue Version ${p.version + 1}` : 'Issue Plan'} onPress={async () => {
          if (missing.length && !(await confirmAsk(`Still to fill in: ${missing.join(', ')}.\n\nIssue it anyway?`, 'Yes', 'No'))) return;
          if (timer.current) await saveNow();
          setBusy('is'); const r = await issueCpp(me, org as never, row, latest.current); setBusy('');
          if (typeof r === 'string') { showAlert(r); return; }
          latest.current = r.plan; setP(r.plan); setRow({ ...row, status: 'issued', version: r.plan.version });
          setSaveState(`Issued v${r.plan.version} · in the Construction Phase Plan folder`);
          void qc.invalidateQueries({ queryKey: ['cppPlans', siteId] }); void qc.invalidateQueries({ queryKey: ['mcDocs', siteId, 'cpp'] }); void qc.invalidateQueries({ queryKey: ['mcTiles', siteId] });
        }} />,
      )}
      <View style={{ height: 14 }} />
      {centre(
        <Button key="def" small kind="ghost" busy={busy === 'def'} title="Save Wording For Future Plans" onPress={async () => {
          if (!(await confirmAsk('Use this plan\'s wording, safety advisor, waste licence, site hours, emergency numbers and contacts as the starting point for every new plan your company makes?', 'Yes', 'No'))) return;
          setBusy('def'); const ok = await saveCppDefaults(me.org_id as string, latest.current); setBusy('');
          setSaveState(ok ? 'Wording saved for future plans' : 'Could not save the wording - try again');
        }} />,
        <Button key="del" small kind="ghost" title="Delete This Plan" onPress={async () => {
          if (!(await confirmAsk(`Delete this plan?${row.status === 'issued' ? ' The issued PDF stays in the folder.' : ''}`, 'Yes', 'No'))) return;
          if (await deleteCpp(row.id)) { void qc.invalidateQueries({ queryKey: ['cppPlans', siteId] }); router.back(); } else toast('Could not delete - try again.');
        }} />,
      )}
    </Card>
  );

  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Construction Phase Plan' }} />
      <Text style={{ fontSize: 19, fontWeight: '600', color: base.ink }}>{p.siteName || 'Construction Phase Plan'}</Text>
      <Muted style={{ marginBottom: 8 }}>{saveState}</Muted>
      <FinTabs even value={tab} onChange={(k) => void go(k as Tab)} items={[['details', missing.some((m) => /Principal|Site|Outline/.test(m)) ? 'Details ⚠' : 'Details'], ['people', 'People'], ['plan', `Plan (${p.sections.length})`], ['emergency', missing.some((m) => /A&E|mobile/.test(m)) ? 'Emergency ⚠' : 'Emergency'], ['issue', 'Issue']]} />
      <View style={{ height: 10 }} />
      {tab === 'details' ? details() : tab === 'people' ? people() : tab === 'plan' ? plan() : tab === 'emergency' ? emergency() : issue()}
    </ScrollView>
  );
}
