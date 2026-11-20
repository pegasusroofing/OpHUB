// The Site Rules & Layout sheet editor (Andy, 20 Nov 2026: "a customisable (template style) sheet, where we can add in
// numbered items and it creates a pdf with the site rules etc. ... a bit like the rams build"), for a job's sheet and for
// the company's template (Admin › H&S). A job's sheet: Details / Rules / Layout / Issue; the template: Details / Rules.
// Saves by itself, Next at the bottom of every tab. Once issued it closes: View / Edit, like the Construction Phase Plan.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';

import { viewDoc } from '@/components/DocViewer';
import { FinTabs } from '@/components/FinNav';
import { MapSnapshot } from '@/components/MapSnapshot';
import { MarkupEditor } from '@/components/MarkupEditor';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { pointFor, uploadCppImage } from '@/data/cpp';
import { openDocLink } from '@/data/hs';
import { deleteSiteRules, issueSiteRules, previewSiteRules, saveSiteRules, saveSiteRulesTemplate, type SiteRulesRow } from '@/data/siteRules';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { showPdf } from '@/lib/fileOut';
import { pickPhotos } from '@/lib/photos';
import type { MarkOp } from '@/lib/rules/markup';
import { DEFAULT_SITE_RULES, SITE_RULES_INFO_LABELS, siteRulesMissing, type SiteRulesDoc, type SiteRulesInfo } from '@/lib/rules/siteRules';
import { supabase } from '@/lib/supabase';
import { base, radius } from '@/theme/theme';

type Tab = 'details' | 'rules' | 'layout' | 'issue';
const LABEL: Record<Tab, string> = { details: 'Details', rules: 'Rules', layout: 'Layout', issue: 'Issue' };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 } as const;
const label = { fontWeight: '600' as const, marginBottom: 3 };

type JobProps = { mode: 'job'; row0: SiteRulesRow; initial: SiteRulesDoc; siteId: string };
type TemplateProps = { mode: 'template'; initial: SiteRulesDoc; orgId: string };

export function SiteRulesEditor(props: JobProps | TemplateProps) {
  const job = props.mode === 'job';
  const siteId = job ? props.siteId : '';
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(job ? siteId : undefined);
  const TABS: Tab[] = job ? ['details', 'rules', 'layout', 'issue'] : ['details', 'rules'];
  const [d, setD] = useState<SiteRulesDoc>(props.initial);
  const [row, setRow] = useState<SiteRulesRow | null>(job ? props.row0 : null);
  const [tab, setTab] = useState<Tab>('details');
  const [editing, setEditing] = useState(!job || props.row0.status !== 'issued');
  const [busy, setBusy] = useState('');
  const [snap, setSnap] = useState<{ at: { lat: number; lon: number } | null } | null>(null);
  const [mark, setMark] = useState<{ src: string; base: string; ops: MarkOp[] } | null>(null);
  const issued = row?.status === 'issued';
  const stateText = () => (!job ? 'Your company\'s starting point for every job\'s site rules · saves by itself' : issued ? (editing ? `Editing · issue version ${(row?.version || 1) + 1} from the Issue tab · saves by itself` : `Issued v${row?.version} · in Site Rules & Layout for signing`) : 'Draft · saves by itself');
  const [saveState, setSaveState] = useState(stateText());
  const latest = useRef(d), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = async (x: SiteRulesDoc) => (job ? saveSiteRules((row as SiteRulesRow).id, x) : saveSiteRulesTemplate((props as TemplateProps).orgId, x));
  const saveNow = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const ok = await persist(latest.current);
    setSaveState(ok ? stateText() : 'Not saved - check signal');
    if (job) void qc.invalidateQueries({ queryKey: ['siteRulesBuilds', siteId] });
    return ok;
  };
  const change = (fn: (x: SiteRulesDoc) => SiteRulesDoc) => {
    const next = fn(latest.current); latest.current = next; setD(next); setSaveState('Saving…');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveNow(); }, 700);
  };
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void persist(latest.current); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;
  const go = async (t: Tab) => { if (timer.current) await saveNow(); setTab(t); };
  const setInfo = (k: keyof SiteRulesInfo, v: string) => change((x) => ({ ...x, info: { ...x.info, [k]: v } }));
  const input = (l: string, value: string, onChange: (v: string) => void, o: { multi?: boolean; lines?: number; ph?: string } = {}) => (
    <View key={l}>
      <Muted style={label}>{l}</Muted>
      <TextInput value={value} onChangeText={onChange} multiline={o.multi} placeholder={o.ph} placeholderTextColor={base.slateLight}
        style={[box, o.multi ? { minHeight: 22 * (o.lines || 2), textAlignVertical: 'top' } : null]} />
    </View>
  );
  const centre = (...kids: React.ReactNode[]) => <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>{kids}</View>;
  const imgUrl = (path: string | null) => (path ? supabase.storage.from('mc-documents').getPublicUrl(path).data.publicUrl : null);

  // ----- Details -----
  const details = () => (
    <>
      <Card>
        <SectionTitle>The Sheet</SectionTitle>
        {input('Title', d.title, (v) => change((x) => ({ ...x, title: v })), { ph: 'Site Rules' })}
        {job && input('Site Name', d.siteName, (v) => change((x) => ({ ...x, siteName: v })))}
        {job && input('Site Address', d.siteAddress, (v) => change((x) => ({ ...x, siteAddress: v })), { multi: true, lines: 2 })}
        {input('Introduction', d.intro, (v) => change((x) => ({ ...x, intro: v })), { multi: true, lines: 3 })}
      </Card>
      <Card>
        <SectionTitle>Key Site Information</SectionTitle>
        <Muted style={{ marginBottom: 8 }}>Anything left blank is left off the sheet.</Muted>
        {SITE_RULES_INFO_LABELS.filter(([k]) => job || !['firstAiders', 'emergencyName', 'emergencyPhone', 'assembly', 'parking'].includes(k)).map(([k, l, ph]) => input(l, d.info[k], (v) => setInfo(k, v), { ph, multi: k === 'ppe' || k === 'welfare' || k === 'parking' }))}
      </Card>
    </>
  );

  // ----- Rules: numbered, added, moved, removed -----
  const setRule = (i: number, v: string) => change((x) => ({ ...x, rules: x.rules.map((r, k) => (k === i ? v : r)) }));
  const moveRule = (i: number, dir: -1 | 1) => change((x) => { const a = x.rules.slice(), j = i + dir; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, rules: a }; });
  const rules = () => (
    <Card>
      <SectionTitle>{`Site Rules (${d.rules.length})`}</SectionTitle>
      {d.rules.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
          <Text style={{ width: 26, paddingTop: 10, fontWeight: '700', color: base.ink, textAlign: 'right' }}>{i + 1}.</Text>
          <TextInput value={r} onChangeText={(v) => setRule(i, v)} multiline placeholder="Type the rule" placeholderTextColor={base.slateLight} accessibilityLabel={`Rule ${i + 1}`}
            style={[box, { flex: 1, minWidth: 0, marginBottom: 0, minHeight: 40, textAlignVertical: 'top' }]} />
          <View style={{ gap: 2, paddingTop: 4 }}>
            <Pressable accessibilityLabel={`Move rule ${i + 1} up`} disabled={i === 0} hitSlop={4} onPress={() => moveRule(i, -1)} style={{ opacity: i === 0 ? 0.3 : 1 }}><Text style={{ fontSize: 15 }}>↑</Text></Pressable>
            <Pressable accessibilityLabel={`Move rule ${i + 1} down`} disabled={i === d.rules.length - 1} hitSlop={4} onPress={() => moveRule(i, 1)} style={{ opacity: i === d.rules.length - 1 ? 0.3 : 1 }}><Text style={{ fontSize: 15 }}>↓</Text></Pressable>
          </View>
          <Pressable accessibilityLabel={`Remove rule ${i + 1}`} hitSlop={6} onPress={async () => { if (!r.trim() || await confirmAsk(`Remove rule ${i + 1}?`, 'Yes', 'No')) change((x) => ({ ...x, rules: x.rules.filter((_, k) => k !== i) })); }} style={{ paddingTop: 10 }}>
            <Text style={{ color: base.slate, fontSize: 15 }}>✕</Text>
          </Pressable>
        </View>
      ))}
      {centre(
        <Button key="add" small title="+ Add Rule" onPress={() => change((x) => ({ ...x, rules: [...x.rules, ''] }))} />,
        <Button key="std" small kind="ghost" title="Back To Standard Rules" onPress={async () => { if (await confirmAsk('Put the rules back to the standard list? Your changes to the rules are lost.', 'Yes', 'No')) change((x) => ({ ...x, rules: [...DEFAULT_SITE_RULES] })); }} />,
      )}
    </Card>
  );

  // ----- Layout plan: a map snapshot or photo, marked up -----
  const startMarkup = async (picture: string) => {
    setBusy('lay'); const basePath = await uploadCppImage(siteId, picture); setBusy('');
    if (!basePath) { toast('Could not save the picture - try again.'); return; }
    setMark({ src: picture, base: basePath, ops: [] });
  };
  const layout = () => (
    <Card>
      <SectionTitle>Site Layout Plan</SectionTitle>
      <Muted style={{ marginBottom: 8 }}>Mark up access, egress, the compound, skips, welfare, fire points and the assembly point. It goes on its own page at the back of the sheet.</Muted>
      {d.layout ? <Image source={{ uri: imgUrl(d.layout) as string }} style={{ width: '100%', height: 240, borderRadius: radius.input, backgroundColor: '#EEF0F3', marginBottom: 6 }} resizeMode="contain" /> : <Muted style={{ marginBottom: 6 }}>No layout plan yet.</Muted>}
      {centre(
        d.layout && d.layoutMarks.base ? <Button key="mk" small busy={busy === 'lay'} title="✎ Mark Up" onPress={() => setMark({ src: imgUrl(d.layoutMarks.base) as string, base: d.layoutMarks.base as string, ops: (d.layoutMarks.ops || []) as MarkOp[] })} /> : null,
        <Button key="add" small kind={d.layout ? 'ghost' : 'primary'} busy={busy === 'lay' && !d.layout} title={d.layout ? 'Start Again' : 'Add Layout Plan'} onPress={async () => {
          const c = await chooseAction('Site Layout Plan', [{ key: 'map', label: '🗺 Map Snapshot Of The Job' }, { key: 'photo', label: '📷 A Photo Or Picture' }]);
          if (c === 'map') { setBusy('lay'); const at = site ? await pointFor({ address: d.siteAddress, postcode: site.postcode || '' }, site) : null; setBusy(''); setSnap({ at }); }
          if (c === 'photo') { const r = await pickPhotos('library', false); if ('error' in r) { toast(r.error); return; } if (r[0]) await startMarkup(r[0].uri); }
        }} />,
        d.layout ? <Button key="rm" small kind="ghost" title="Remove" onPress={async () => { if (await confirmAsk('Remove the layout plan from this sheet?', 'Yes', 'No')) change((x) => ({ ...x, layout: null, layoutMarks: { base: null, ops: [] } })); }} /> : null,
      )}
    </Card>
  );

  // ----- Issue -----
  const missing = siteRulesMissing(d);
  const cur = issued ? d.revisions.find((r) => r.version === row?.version && r.path) ?? null : null;
  const view = async (path: string) => { const u = await openDocLink('mc-documents', path); if (u) viewDoc(u); else toast('Could not open the PDF.'); };
  const issuedCard = (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontSize: 28 }}>📏</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: base.ink }}>{d.title || 'Site Rules'} · Version {row?.version}</Text>
          <Muted>Issued{cur?.date ? ` ${new Date(`${cur.date}T00:00:00`).toLocaleDateString('en-GB')}` : ''}{cur?.by ? ` by ${cur.by}` : ''} · in Site Rules &amp; Layout for everyone to sign</Muted>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
        <Button small grow oneLine kind="ghost" title="✎ Edit" onPress={() => { setEditing(true); setTab('details'); }} />
        {cur?.path ? <Button small grow oneLine title="👁 View" onPress={() => void view(cur.path as string)} /> : null}
      </View>
      {d.revisions.filter((r) => r.version !== row?.version && r.path).sort((a, b) => b.version - a.version).map((r) => (
        <View key={r.version} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: base.line, marginTop: 6 }}>
          <View style={{ flex: 1 }}><Text style={{ color: base.ink }}>Version {r.version} (Superseded)</Text><Muted style={{ fontSize: 12 }}>{r.note}</Muted></View>
          <Button small kind="ghost" title="View" onPress={() => void view(r.path as string)} />
        </View>
      ))}
    </Card>
  );
  const issue = () => (
    <>
      <Card>
        <SectionTitle>{issued ? `Issue Version ${(row?.version || 1) + 1}` : 'Ready To Issue?'}</SectionTitle>
        {missing.length ? <Muted style={{ color: base.warn, marginBottom: 8 }}>Still to fill in: {missing.join(', ')}.</Muted> : <Muted style={{ marginBottom: 8 }}>Everything needed is filled in.</Muted>}
        <Muted style={{ marginBottom: 10 }}>{issued ? `Issuing version ${(row?.version || 1) + 1} files a new sheet for everyone to sign; version ${row?.version} stays, marked superseded.` : 'Issuing makes the PDF and puts it in Site Rules & Layout, where everyone on the job signs it (and it goes with their induction).'}</Muted>
        {centre(
          <Button key="pv" kind="ghost" busy={busy === 'pv'} title="Preview PDF" onPress={async () => {
            if (timer.current) await saveNow();
            setBusy('pv');
            try { const out = await previewSiteRules(org as never, latest.current, issued ? (row?.version || 1) + 1 : row?.version || 1); await showPdf(out.bytes, out.filename); } catch { toast('Could not make the PDF - try again.'); }
            setBusy('');
          }} />,
          <Button key="is" busy={busy === 'is'} title={issued ? `Issue Version ${(row?.version || 1) + 1}` : 'Issue Site Rules'} onPress={async () => {
            if (missing.length && !(await confirmAsk(`Still to fill in: ${missing.join(', ')}.\n\nIssue it anyway?`, 'Yes', 'No'))) return;
            let note = 'First issue';
            if (issued) { const n = await promptText(`What has changed in version ${(row?.version || 1) + 1}?`, ''); if (n === null) return; if (!n.trim()) { showAlert('Say briefly what has changed.'); return; } note = n.trim(); }
            if (timer.current) await saveNow();
            setBusy('is'); const r = await issueSiteRules(me, org as never, row as SiteRulesRow, latest.current, note); setBusy('');
            if (typeof r === 'string') { showAlert(r); return; }
            latest.current = r.doc; setD(r.doc); setRow({ ...(row as SiteRulesRow), status: 'issued', version: r.version, layout_doc_id: r.docId });
            setEditing(false); setTab('details'); setSaveState(`Issued v${r.version} · in Site Rules & Layout for signing`);
            for (const k of [['siteRulesBuilds', siteId], ['hsDocs', 'layout', siteId], ['mcTiles', siteId], ['siteRules', siteId]]) void qc.invalidateQueries({ queryKey: k });
          }} />,
          issued ? <Button key="stop" kind="ghost" title="Stop Editing" onPress={() => setEditing(false)} /> : null,
        )}
      </Card>
      <Card>
        {centre(
          <Button key="tpl" small kind="ghost" title="Save Rules To Company Template" onPress={async () => {
            if (!(await confirmAsk('Use this sheet\'s rules, introduction and site information as your company\'s Site Rules template for every new job?', 'Yes', 'No'))) return;
            setSaveState((await saveSiteRulesTemplate(me.org_id as string, latest.current)) ? 'Rules saved to the company template' : 'Could not save the template - try again');
          }} />,
          <Button key="del" small kind="ghost" title="Delete This Sheet" onPress={async () => {
            if (!(await confirmAsk(`Delete this sheet?${issued ? ' The issued PDFs stay in Site Rules & Layout.' : ''}`, 'Yes', 'No'))) return;
            if (await deleteSiteRules((row as SiteRulesRow).id)) { void qc.invalidateQueries({ queryKey: ['siteRulesBuilds', siteId] }); router.back(); } else toast('Could not delete - try again.');
          }} />,
        )}
      </Card>
    </>
  );

  const closed = job && issued && !editing;
  const body = tab === 'details' ? details() : tab === 'rules' ? rules() : tab === 'layout' ? layout() : issue();
  const nx = TABS[TABS.indexOf(tab) + 1];
  return (
    <>
      <Text style={{ fontSize: 19, fontWeight: '600', color: base.ink }}>{job ? `${d.title || 'Site Rules'}${d.siteName ? ` · ${d.siteName}` : ''}` : 'Site Rules Template'}</Text>
      <Muted style={{ marginBottom: 8 }}>{saveState}</Muted>
      {closed ? issuedCard : (
        <>
          <FinTabs even value={tab} onChange={(k) => void go(k as Tab)} items={TABS.map((t) => [t, t === 'rules' ? `Rules (${d.rules.length})` : t === 'issue' && missing.length ? 'Issue ⚠' : LABEL[t]] as [string, string])} />
          <View style={{ height: 10 }} />
          {body}
          {nx ? <View style={{ marginTop: 6, marginBottom: 20, alignItems: 'center' }}><Button title={`Next: ${LABEL[nx]} ›`} onPress={() => void go(nx)} /></View> : <View style={{ height: 20 }} />}
        </>
      )}
      {snap && <MapSnapshot at={snap.at} onClose={(pic) => { setSnap(null); if (pic) void startMarkup(pic); }} />}
      {mark && <MarkupEditor plan src={mark.src} ops={mark.ops} onClose={async (out) => {
        const m = mark; setMark(null);
        if (!out) { if (!latest.current.layout) change((x) => ({ ...x, layout: m.base, layoutMarks: { base: m.base, ops: [] } })); return; }
        setBusy('lay'); const path = await uploadCppImage(siteId, out.image); setBusy('');
        if (!path) { toast('Could not save the marked-up plan - try again.'); return; }
        change((x) => ({ ...x, layout: path, layoutMarks: { base: m.base, ops: out.ops } }));
      }} />}
    </>
  );
}
