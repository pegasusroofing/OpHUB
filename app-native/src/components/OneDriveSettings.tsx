// The OneDrive page (Andy, 8 Nov 2026), under Admin in Projects and in Finance — the same page in both, so a company with
// only one of them still has it. The connection; New Jobs (a folder for every new job? where they go, the template);
// Where Things Save, by Projects / Finance / Company, each item's folder (tap to change) and Yes / No to save it
// automatically, + Add Something To Save; Quick Links; and each job's folders. Everything saves as it's changed.
// Items save into jobs whose folder the job pack made; a folder linked by hand keeps working as before.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinTabs } from '@/components/FinNav';
import { Pop } from '@/components/Pop';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { syncSiteFolder } from '@/data/drawings';
import { saveJobPackSettings, setupJobPack, useJobPackSettings } from '@/data/jobPack';
import { connectOneDrive, DEFAULT_MAIN_FOLDER, disconnectOneDrive, folderStack, listFolders, readTemplateTree, setMainFolder, setQuickLinks, unlinkFolder, useOdSites, useOneDriveStatus, useQuickLinks, type OdFolder, type OdTarget } from '@/data/onedrive';
import { saveQuoteSettings, useQuoteSettings } from '@/data/quotes';
import { useAuth } from '@/lib/auth';
import { cleanFolder, folderLabel, foldersUnder, needsTemplateRead, PACK_RULES, ruleTab, startingPack, WEEK_MARK, type PackConfig } from '@/lib/rules/jobPack';
import { base, page, radius, space } from '@/theme/theme';

type Tab = 'projects' | 'finance' | 'company';
// Tenders (Andy, 11 Nov 2026): where enquiries go, their template, a folder per work status, and where finished ones are filed.
type QKey = 'open_path' | 'template_path' | 'archive_path' | 'awaiting' | 'checking';
const Q_TITLES: Record<QKey, string> = { open_path: 'Open Tenders Go In', template_path: 'New Enquiry Template', awaiting: 'Awaiting Information Folder', checking: 'Ready For Checking Folder', archive_path: 'Finished Quotes Go In (A Year Folder)' };
// Every word capitalised, as across the app (Andy's rule).
const caps = (t: string) => t.replace(/(^|\s)([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase());
const head = (t: string) => <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate, letterSpacing: 0.4, marginBottom: 8 }}>{t.toUpperCase()}</Text>;

/** Yes / No, side by side (Andy: questions are Yes / No). */
export function YesNo({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const one = (v: boolean) => (
    <Pressable key={String(v)} accessibilityRole="radio" accessibilityState={{ checked: value === v }} accessibilityLabel={`${label}: ${v ? 'Yes' : 'No'}`} onPress={() => onChange(v)}
      style={{ paddingHorizontal: 12, paddingVertical: 5, backgroundColor: value === v ? base.ink : base.card }}>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: value === v ? '#fff' : base.ink }}>{v ? 'Yes' : 'No'}</Text>
    </Pressable>
  );
  return <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: base.line, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>{one(true)}{one(false)}</View>;
}

function Row({ title, sub, children, right }: { title: string; sub?: string; children?: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
      <View style={{ width: 250, maxWidth: '100%' }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink }}>{title}</Text>
        {!!sub && <Muted style={{ fontSize: 12 }}>{sub}</Muted>}
      </View>
      <View style={{ flex: 1, minWidth: 160 }}>{children}</View>
      {right}
    </View>
  );
}
const FolderLink = ({ label, onPress, muted }: { label: string; onPress?: () => void; muted?: boolean }) => (
  <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`Folder: ${label}`} onPress={onPress}>
    <Text style={{ fontSize: 13, fontWeight: muted ? '400' : '600', color: muted ? base.slate : base.blue }}>{label}{onPress ? ' ▾' : ''}</Text>
  </Pressable>
);

const folderRow = (name: string, onPress: () => void, sel = false) => (
  <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Open ${name}`} onPress={onPress}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: '#F0F1F4', backgroundColor: sel ? '#F0F4FF' : undefined, borderRadius: sel ? 6 : 0 }}>
    <Text>📁</Text><Text style={{ flex: 1, fontSize: 14, color: base.ink, fontWeight: sel ? '600' : '400' }}>{name}</Text><Text style={{ color: base.slate }}>›</Text>
  </Pressable>
);

/** Choose a folder inside each job's folder. It browses the company's own template in OneDrive (Andy, 19 Nov 2026: "it
 *  should just go to the main folder the company sets up", not folders copied from another company), plus any folder
 *  made here; without a template that can be opened, the folders saved for new jobs. The top is each job's own folder.
 *  A new folder joins the list, so new jobs get it. */
function TemplateFolderPop({ title, cfg, start, weekly, onPick, onClose }: { title: string; cfg: PackConfig; start: string; weekly?: boolean; onPick: (folder: string, newFolders: string[]) => void; onClose: () => void }) {
  const tpl = cleanFolder(cfg.template_path || '');
  const { data: home, isLoading: opening } = useQuery({ queryKey: ['odStack', tpl], enabled: !!tpl, staleTime: 300000, queryFn: async () => { const s = await folderStack(tpl); return Array.isArray(s) && s.length ? s[s.length - 1] : null; } });
  const live = home ?? null;
  const startAt = live ? '' : cleanFolder(start.replace(WEEK_MARK, '')).split('/').slice(0, -1).join('/');
  const [at0, setAt] = useState<string | null>(null);
  const at = at0 ?? startAt;
  const [refs, setRefs] = useState<Record<string, OdFolder>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const curRef = live ? (at ? refs[at] : live) : null;
  const { data: got } = useQuery({ queryKey: ['odFolders', curRef?.id ?? 'none', curRef?.driveId ?? ''], enabled: !!curRef, queryFn: () => listFolders(curRef) });
  const liveKids = live && curRef ? (got?.folders || []).filter((f) => !f.virtual) : [];
  const listed = foldersUnder(live ? extra : [...cfg.folders, ...extra], at);
  const kids = [...liveKids.map((f) => f.name), ...listed.filter((n) => !liveKids.some((f) => f.name.toLowerCase() === n.toLowerCase()))];
  const parts = at ? at.split('/') : [];
  const open = (name: string) => {
    const next = at ? `${at}/${name}` : name;
    const ref = liveKids.find((f) => f.name === name);
    if (ref) setRefs((r) => ({ ...r, [next]: ref }));
    setAt(next);
  };
  const loading = !!tpl && opening;
  return (
    <Pop title={title} onClose={onClose} footer={!loading && (
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button small title={at ? `Use “${parts[parts.length - 1]}”` : 'Use Each Job’s Folder'} onPress={() => onPick(at, extra)} />
        {weekly && <Button small kind="ghost" title="Use This Week’s Folder In It" onPress={() => onPick(at ? `${at}/${WEEK_MARK}` : WEEK_MARK, extra)} />}
        <Button small kind="ghost" title="+ New Folder" onPress={async () => {
          const n = (await promptText('New folder name', ''))?.trim(); if (!n) return;
          const f = cleanFolder(at ? `${at}/${n}` : n); setExtra((x) => [...x, f]); setAt(f);
        }} />
      </View>
    )}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        <Text onPress={() => setAt('')} style={{ fontSize: 13, fontWeight: '600', color: at ? base.blue : base.ink }}>Each Job’s Folder</Text>
        {parts.map((p, i) => <Text key={i} onPress={() => setAt(parts.slice(0, i + 1).join('/'))} style={{ fontSize: 13, fontWeight: '600', color: i === parts.length - 1 ? base.ink : base.blue }}>  ›  {p}</Text>)}
      </View>
      {loading ? <Muted>Opening Your Template…</Muted> : live && curRef && !got ? <Muted>Loading…</Muted>
        : kids.length ? kids.map((k) => folderRow(k, () => open(k))) : <Muted>No folders in here.</Muted>}
      <Muted style={{ marginTop: 8 }}>{live
        ? `Each job’s folder is made in ${cleanFolder(cfg.parent_path).split('/').join(' › ') || 'your new job folder'}, from your template (${tpl.split('/').pop()}). A new folder is added to every new job.`
        : 'These are the folders every new job gets. A new one is added to that list too.'}</Muted>
    </Pop>
  );
}

/** Choose a folder in OneDrive itself (where new job folders go, the template), as a path from the top of the drive. It
 *  opens in the company's main folder when one is set (Andy, 19 Nov 2026), and My Files is one tap up. */
function DrivePathPop({ title, start, onPick, onClose }: { title: string; start?: string; onPick: (path: string) => void; onClose: () => void }) {
  const from = cleanFolder(start || '');
  const { data: home, isLoading: opening } = useQuery({ queryKey: ['odStack', from], enabled: !!from, staleTime: 300000, queryFn: async () => { const s = await folderStack(from); return Array.isArray(s) ? s : []; } });
  const [stack0, setStack] = useState<OdFolder[] | null>(null);
  const stack = stack0 ?? home ?? [];
  const waiting = !!from && stack0 === null && opening;
  const cur = stack[stack.length - 1] ?? null;
  const { data } = useQuery({ queryKey: ['odFolders', cur?.id ?? 'root', cur?.driveId ?? ''], enabled: !waiting, queryFn: () => listFolders(cur) });
  const list = data ? data.folders.filter((f) => !f.virtual) : null, err = data?.error || '';
  return (
    <Pop title={title} onClose={onClose} footer={!!cur && !waiting && (
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}><Button small title={`Use “${cur.name}”`} onPress={() => onPick(stack.map((s) => s.name).join('/'))} /></View>
    )}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        <Text onPress={() => setStack([])} style={{ fontSize: 13, fontWeight: '600', color: stack.length ? base.blue : base.ink }}>My Files</Text>
        {stack.map((s, i) => <Text key={s.id} onPress={() => setStack(stack.slice(0, i + 1))} style={{ fontSize: 13, fontWeight: '600', color: i === stack.length - 1 ? base.ink : base.blue }}>  ›  {s.name}</Text>)}
      </View>
      {waiting ? <Muted>Opening Your Main Folder…</Muted> : err ? <Text style={{ color: '#C0392B' }}>{err}</Text> : !list ? <Muted>Loading…</Muted> : list.length ? list.map((f) => folderRow(f.name, () => setStack([...stack, f]))) : <Muted>No folders in here.</Muted>}
    </Pop>
  );
}

export function OneDriveSettings({ finance = false }: { finance?: boolean }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: st, isLoading } = useOneDriveStatus(me?.org_id);
  const { data: quick = [] } = useQuickLinks(me?.org_id);
  const { data: sites = [] } = useOdSites(me?.org_id);
  const { data: pack } = useJobPackSettings(me?.org_id);
  const hasPm = org?.has_pm !== false, hasFin = !!org?.has_finance;
  const tabs: [Tab, string][] = [...(hasPm ? [['projects', 'Projects'] as [Tab, string]] : []), ...(hasFin ? [['finance', 'Finance'] as [Tab, string]] : []), ['company', 'Company']];
  const [tab, setTab] = useState<Tab>(finance && hasFin ? 'finance' : tabs[0][0]);
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState<{ kind: 'rule'; key: string } | { kind: 'parent' | 'template' | 'main' } | { kind: 'quote'; key: QKey } | null>(null);
  // Just connected (or reconnected): ask which main folder this company uses (Andy, 19 Nov 2026).
  const { onedrive: justConnected } = useLocalSearchParams<{ onedrive?: string }>();
  const askedMain = useRef(false);
  useEffect(() => { if (justConnected === 'success' && st && !askedMain.current) { askedMain.current = true; setPick({ kind: 'main' }); } }, [justConnected, st]);
  const { data: qs } = useQuoteSettings(hasPm ? me?.org_id : null);
  const [adding, setAdding] = useState<{ key: string; folder: string; on: boolean; extra?: string[] } | null>(null);
  // A folder list copied from another company (before 19 Nov 2026) is read again from this company's own template, so
  // the folders it saves into are its own (Andy: "its just defaulting to rtb folders still which shouldnt happen").
  const autoRead = useRef(false);
  useEffect(() => {
    const c = pack?.config;
    if (!me?.org_id || !st || st.needs_reconnect || autoRead.current || !c || !needsTemplateRead(c)) return;
    autoRead.current = true;
    void readTemplateTree(c.template_path).then(async (t) => {
      if (typeof t === 'string') return;
      const ruleFolders = Object.values(c.rules || {}).filter((r) => r.on && r.folder && !r.folder.includes('{')).map((r) => cleanFolder(r.folder));
      const next = { ...c, folders: [...new Set([...t.folders, ...ruleFolders])], files: t.files, template_read: new Date().toISOString() };
      if (await saveJobPackSettings(me.org_id as string, me.id, { enabled: pack?.enabled ?? true, config: next })) void qc.invalidateQueries({ queryKey: ['jobPackSettings'] });
    });
  }, [pack, st, me, qc]);
  if (!me) return null;
  if (me.role !== 'admin' && me.role !== 'superadmin') return <Muted style={{ padding: space.l }}>Admins only.</Muted>;
  const cfg = pack?.config ?? null;
  // Pickers open in this company's main folder (Andy, 19 Nov 2026), not at the top of OneDrive.
  const mainPath = st?.folder_path && st.folder_path !== DEFAULT_MAIN_FOLDER ? st.folder_path : '';
  const refresh = () => ['odStatus', 'odQuick', 'odSites', 'jobPackSettings'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const save = async (next: PackConfig, enabled = pack?.enabled ?? true) => {
    if (!(await saveJobPackSettings(me.org_id as string, me.id, { enabled, config: next }))) { toast('Could not save — try again.'); return false; }
    void qc.invalidateQueries({ queryKey: ['jobPackSettings'] }); return true;
  };
  // The template chosen: every new job gets its folders and documents (a company's own, never another's: 19 Nov 2026).
  const fromTemplate = async (p: string) => {
    if (!cfg) return;
    setBusy('tpl'); const t = await readTemplateTree(p); setBusy('');
    if (typeof t === 'string') { toast(t); if (cleanFolder(p) !== cleanFolder(cfg.template_path)) await save({ ...cfg, template_path: p }); return; }
    // Folders things already save into stay on the list (each job gets them too).
    const ruleFolders = Object.values(cfg.rules).filter((r) => r.on && r.folder && !r.folder.includes('{')).map((r) => cleanFolder(r.folder));
    await save({ ...cfg, template_path: p, folders: [...new Set([...t.folders, ...ruleFolders])], files: t.files, template_read: new Date().toISOString() });
  };
  const connect = async () => { setBusy('connect'); try { const e = await connectOneDrive(); if (e) toast(e); } finally { setBusy(''); } };
  const pickSite = (target: OdTarget, id = '') => router.push({ pathname: '/pm/onedrive-pick', params: { target, id } } as never);
  const shown = sites.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const addable = cfg ? PACK_RULES.filter((r) => ruleTab(r.key) === tab && (!cfg.rules[r.key] || !cfg.rules[r.key].on)) : [];
  const listed = cfg ? PACK_RULES.filter((r) => ruleTab(r.key) === tab && !!cfg.rules[r.key]) : [];
  const setRule = (key: string, patch: Partial<{ on: boolean; folder: string }>, newFolders: string[] = []) => {
    if (!cfg) return;
    const cur = cfg.rules[key] ?? { on: false, folder: '' };
    const folders = [...cfg.folders];
    newFolders.concat(patch.folder ? [cleanFolder(patch.folder.replace(`/${WEEK_MARK}`, ''))] : []).forEach((f) => { if (f && !folders.map(cleanFolder).includes(cleanFolder(f))) folders.push(f); });
    void save({ ...cfg, folders, rules: { ...cfg.rules, [key]: { ...cur, ...patch } } });
  };
  const groups: { area: string; rules: typeof listed }[] = [];
  listed.forEach((r) => { let g = groups.find((x) => x.area === r.area); if (!g) { g = { area: r.area, rules: [] }; groups.push(g); } g.rules.push(r); });

  return (
    <ScrollView contentContainerStyle={page(1000)} keyboardShouldPersistTaps="handled">
      {/* ---- Connection ---- */}
      <Card style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 240 }}>
          {head('Connection')}
          {isLoading ? <Muted>Checking…</Muted> : st && st.needs_reconnect
            ? <Text style={{ color: '#B23B2E' }}>Not syncing — the connection to {st.account_email || 'your OneDrive'} has {st.reason === 'expired' ? 'run out (not used for over 90 days)' : 'stopped working'}. Reconnect it.</Text>
            : st ? <Text style={{ color: base.ink }}><Text style={{ color: '#1E7A43', fontWeight: '600' }}>● Connected</Text>  <Muted>· {st.account_email || 'Your OneDrive'}</Muted></Text>
              : <Muted>Not connected. Connect your company’s OneDrive so jobs get their folders and things save there.</Muted>}
          {/* This company's own main folder (19 Nov 2026): two companies on one Microsoft account each pick their own. */}
          {!!st && !st.needs_reconnect && <Text onPress={() => setPick({ kind: 'main' })} style={{ marginTop: 6, color: base.blue, fontWeight: '600' }}>Main Folder: 📁 {st.folder_path && st.folder_path !== DEFAULT_MAIN_FOLDER ? st.folder_path.split('/').join(' › ') : 'Choose Your Main Folder'} ▾</Text>}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small kind={st && !st.needs_reconnect ? 'ghost' : undefined} busy={busy === 'connect'} title={st ? 'Reconnect' : 'Connect OneDrive'} onPress={() => void connect()} />
          {!!st && <Button small kind="ghost" title="Disconnect" onPress={async () => {
            if (!(await confirmAsk('Disconnect OneDrive? Nothing saves to it until it’s connected again.', 'Disconnect'))) return;
            if (!(await disconnectOneDrive(me.org_id as string))) toast('Could not disconnect — try again.'); refresh();
          }} />}
        </View>
      </Card>

      {/* Not connected: only the connection shows (Andy, 19 Nov 2026: "dont delete it but dont show it until the onedrive
          is connected"). Everything below is kept and comes back once it's connected again. */}
      {isLoading ? null : !st ? (
        <Muted style={{ textAlign: 'center', marginTop: 4 }}>Connect OneDrive to choose this company’s folders. Anything set up before is kept and shows again once it’s connected.</Muted>
      ) : (<>
      {/* ---- New Jobs ---- */}
      <Card>
        {head('New Jobs')}
        {!cfg ? (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Muted>Not set up yet. Every new job can get its own folder, built from your template, with things saving in the right place.</Muted>
            <Button small busy={busy === 'setup'} title="Set It Up" onPress={async () => {
              // A company's own folders only (19 Nov 2026): it starts from its main folder, never another company's paths
              // (it used RTB Roofing's for any company with "RTB" in its name).
              const main = st?.folder_path && st.folder_path !== DEFAULT_MAIN_FOLDER ? st.folder_path : '';
              setBusy('setup'); await save({ ...startingPack(true), parent_path: main }, true); setBusy('');
              if (!main) setPick({ kind: 'parent' });
            }} />
          </View>
        ) : (
          <>
            {pack?.enabled === false && <Row title="The Job Pack Is Switched Off" sub="Nothing makes folders or saves by these rules"><View /></Row>}
            <Row title="Create A OneDrive Folder For Every New Job?" sub="A job can be unticked when it’s made; a client can be set to never (Finance › Directory)"
              right={<YesNo label="Create a OneDrive folder for every new job" value={pack?.enabled !== false && cfg.create_new !== false} onChange={(v) => void save({ ...cfg, create_new: v }, v ? true : pack?.enabled ?? true)} />} />
            <Row title="New Job Folders Go In" sub="Each job gets its own folder here"><FolderLink label={`📁 ${cfg.parent_path ? cfg.parent_path.split('/').join(' › ') : 'Choose A Folder'}`} onPress={() => setPick({ kind: 'parent' })} /></Row>
            <Row title="Built From" sub="Your template folder; its folders and documents are copied in"><FolderLink label={`📁 ${cfg.template_path ? cfg.template_path.split('/').join(' › ') : 'Choose A Folder'}`} onPress={() => setPick({ kind: 'template' })} /></Row>
            {!!cfg.template_path && (
              <Row title="Every Job Gets" sub="Read from your template">
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <Text style={{ fontSize: 13, color: base.ink }}>{busy === 'tpl' ? 'Reading Your Template…' : `${cfg.folders.length} Folders, ${cfg.files.length} Documents`}</Text>
                  {busy !== 'tpl' && <Text onPress={() => void fromTemplate(cfg.template_path)} style={{ color: base.blue, fontWeight: '600', fontSize: 13 }}>↻ Read Again From The Template</Text>}
                </View>
              </Row>
            )}
            {hasPm && <View style={{ alignItems: 'center', marginTop: 6 }}><Text onPress={() => router.push('/pm/admin/jobpack' as never)} style={{ color: base.blue, fontWeight: '600', fontSize: 13 }}>Template Folders, Documents And Week Folders ›</Text></View>}
          </>
        )}
      </Card>

      {/* ---- Tenders (Andy, 11 Nov 2026) ---- */}
      {hasPm && (() => {
        const sf = { awaiting: '- Awaiting More Information', checking: '- Ready For Checking', ...(qs?.status_folders || {}) } as Record<string, string>;
        const shown2 = (k: QKey) => {
          const p = k === 'awaiting' || k === 'checking' ? (sf[k].startsWith('/') ? sf[k].slice(1) : `${qs?.open_path || 'Open Tenders'}/${sf[k]}`) : (qs?.[k] as string | null | undefined);
          return p ? `📁 ${p.split('/').join(' › ')}` : 'Choose A Folder';
        };
        return (
          <Card>
            {head('Tenders (Quotes)')}
            <Muted style={{ marginBottom: 4 }}>A new enquiry gets its own folder from the template (1. Tender Documents, 2. Estimating, 3. Quotation). It moves with its status, and once it’s submitted it’s filed in that year’s folder.</Muted>
            {(['open_path', 'template_path', 'awaiting', 'checking', 'archive_path'] as QKey[]).map((k) => (
              <Row key={k} title={Q_TITLES[k]} sub={k === 'archive_path' ? 'Pick this year’s folder: next year’s is made in January' : k === 'awaiting' || k === 'checking' ? 'Inside Open Tenders' : undefined}>
                <FolderLink label={shown2(k)} onPress={() => setPick({ kind: 'quote', key: k })} />
              </Row>
            ))}
            <View style={{ alignItems: 'center', marginTop: 6 }}><Text onPress={() => router.push('/pm/quotes/settings' as never)} style={{ color: base.blue, fontWeight: '600', fontSize: 13 }}>Quote Settings (Chaser, Copy-To, Auto Export) ›</Text></View>
          </Card>
        );
      })()}

      {/* ---- Where Things Save ---- */}
      <Card>
        {head('Where Things Save')}
        <FinTabs items={tabs} value={tab} onChange={(k) => setTab(k as Tab)} />
        {tab === 'company' ? (
          <>
            <Muted style={{ marginBottom: 4 }}>Things that aren’t for one job, and where each one is set.</Muted>
            <Row title="Quotes" sub="Each enquiry’s folder"><FolderLink muted label="The Estimating folder in Quote Settings" /></Row>
            <Row title="Won Quotes" sub="When a quote becomes a job"><FolderLink muted label="Moved into the job’s 1. Contract & Commercial › 2. Estimating" /></Row>
            <Row title="Operative Certificates" sub="When a certificate is added"><FolderLink muted label="Each operative’s own folder (on their record)" /></Row>
            {hasFin && <Row title="Scheduled Finance Reports" sub="When a report runs"><FolderLink muted label="The folder chosen on each report (Finance › Reports)" /></Row>}
            <Row title="Exports Not For A Job" sub="Save To OneDrive on a company-wide PDF"><FolderLink muted label="Company Exports" /></Row>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {hasPm && <Button small kind="ghost" title="Quote Settings ›" onPress={() => router.push('/pm/quotes/settings' as never)} />}
              {hasPm && <Button small kind="ghost" title="Operatives ›" onPress={() => router.push('/pm/operatives' as never)} />}
              {hasFin && <Button small kind="ghost" title="Finance Reports ›" onPress={() => router.push('/fin/reports' as never)} />}
            </View>
          </>
        ) : !cfg ? <Muted>Set up New Jobs first: things save into each job’s folder.</Muted> : (
          <>
            <Muted style={{ marginBottom: 4 }}>Inside each job’s folder. Tap a folder to change it; Yes / No saves it automatically or not.</Muted>
            {groups.map((g) => (
              <View key={g.area}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: base.ink, marginTop: 8 }}>{caps(g.area)}</Text>
                {g.rules.map((r) => {
                  const rule = cfg.rules[r.key];
                  return (
                    <Row key={r.key} title={caps(r.when)} right={<YesNo label={r.when} value={!!rule.on} onChange={(v) => setRule(r.key, { on: v })} />}>
                      {rule.on ? <FolderLink label={folderLabel(rule.folder)} onPress={() => setPick({ kind: 'rule', key: r.key })} /> : <FolderLink muted label="Not Saving" />}
                    </Row>
                  );
                })}
              </View>
            ))}
            {/* Only POs worth at least the minimum go to OneDrive (Andy, 19 Nov 2026: "Otherwise we could have excess data on
                OneDrive for info we don't need"). They're kept in the app either way. */}
            {tab === 'finance' && (
              <Row title="Purchase Orders" sub={Number(cfg.po_min) > 0 ? `Their PDF, when it’s made · only POs of £${Number(cfg.po_min).toLocaleString('en-GB')} or more (excl. VAT)` : 'Their PDF, when it’s made · every PO'}
                right={<Button small kind="ghost" title={Number(cfg.po_min) > 0 ? `✎ Minimum £${Number(cfg.po_min).toLocaleString('en-GB')}` : '✎ Set A Minimum'} onPress={async () => {
                  const v = await promptText('Only save POs to OneDrive when they’re worth at least (£, excl. VAT). Leave it blank to save every PO.', Number(cfg.po_min) > 0 ? String(cfg.po_min) : '', { placeholder: 'e.g. 500' });
                  if (v === null) return;
                  const n = Number(String(v).replace(/[£,\s]/g, ''));
                  if (String(v).trim() && (!Number.isFinite(n) || n < 0)) { toast('Enter an amount in pounds, e.g. 500.'); return; }
                  await save({ ...cfg, po_min: String(v).trim() ? Math.round(n * 100) / 100 : 0 });
                }} />}>
                <FolderLink muted label="Each job’s Material PO’s folder (set on the job)" />
              </Row>
            )}
            {!groups.length && tab !== 'finance' && <Muted>Nothing saving here yet.</Muted>}
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              {addable.length ? <Button title="+ Add Something To Save" onPress={() => { const r = addable[0]; setAdding({ key: r.key, folder: cfg.rules[r.key]?.folder || '', on: true }); }} />
                : <Muted>Everything that can save from here is in the list.</Muted>}
            </View>
          </>
        )}
      </Card>

      {/* ---- Quick Links ---- */}
      <Card>
        {head('Quick Links')}
        <Muted style={{ marginBottom: 8 }}>Pin a folder (e.g. Live Projects) so it’s one tap away wherever someone chooses a OneDrive folder.</Muted>
        {quick.map((l) => (
          <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
            <Text style={{ flex: 1, color: base.ink, fontWeight: '600' }}>⭐ {l.name}</Text>
            <Pressable accessibilityLabel={`Remove ${l.name}`} hitSlop={8} onPress={async () => { if (!(await setQuickLinks(me.org_id as string, quick.filter((x) => x.id !== l.id)))) toast('Could not save'); refresh(); }}><Text style={{ color: base.slate }}>✕</Text></Pressable>
          </View>
        ))}
        <View style={{ alignItems: 'center' }}><Button small kind="ghost" title="+ Add A Quick Link" onPress={() => pickSite('quicklink')} /></View>
      </Card>

      {/* ---- Each job's folders ---- */}
      <SectionTitle>Each Job’s Folders</SectionTitle>
      <TextInput value={q} onChangeText={setQ} placeholder="Search Projects…" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 }} />
      {shown.length ? shown.map((s) => {
        const links: [OdTarget, string, string | null, string | null][] = [['progress', 'Job Folder (Photos, Drawings, Exports)', s.onedrive_folder_id, s.onedrive_folder_name], ['materials', 'Material PO’s', s.material_orders_folder_id, s.material_orders_folder_name], ['siteinductions', 'Signed Site Inductions', s.site_inductions_folder_id, s.site_inductions_folder_name]];
        const n = links.filter((l) => l[2]).length;
        return (
          <Card key={s.id} style={{ padding: 10 }}>
            <Pressable onPress={() => setOpen(open === s.id ? null : s.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>{s.name}</Text>
              <Muted>{s.onedrive_folder_id ? `${n}/3 Linked` : 'No Folder'} {open === s.id ? '▾' : '▸'}</Muted>
            </Pressable>
            {open === s.id && (
              <>
                {links.map(([t, label, fid, fname]) => (
                  <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}><Text style={{ color: base.ink }}>{label}</Text><Muted>{fid ? `📁 ${fname || 'Linked Folder'}` : 'Not Linked'}</Muted></View>
                    <Button small kind="ghost" title={fid ? 'Change' : 'Link'} onPress={() => pickSite(t, s.id)} />
                    {!!fid && <Pressable accessibilityLabel={`Unlink ${label}`} hitSlop={8} onPress={async () => { if (await confirmAsk(`Unlink the ${label} folder? Nothing saves there until a folder is linked again.`, 'Unlink')) { if (!(await unlinkFolder(t, s.id))) toast('Could not unlink'); refresh(); } }}><Text style={{ color: base.slate }}>✕</Text></Pressable>}
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}>
                  {!s.onedrive_folder_id && !!cfg && pack?.enabled !== false && <Button small busy={busy === s.id} title="Set Up From Template" onPress={async () => {
                    setBusy(s.id); const r = await setupJobPack(s.id); setBusy('');
                    if ('error' in r) toast(r.error); else if (r.failed.length) toast(`Folder made — these didn’t copy: ${r.failed.join(', ')}`); refresh();
                  }} />}
                  {!!s.onedrive_folder_id && <Button small kind="ghost" busy={busy === `sync${s.id}`} title="🔄 Sync Now" onPress={async () => { setBusy(`sync${s.id}`); toast(await syncSiteFolder(me, s as never, () => undefined)); setBusy(''); refresh(); }} />}
                </View>
              </>
            )}
          </Card>
        );
      }) : <Empty>No projects.</Empty>}
      </>)}

      {/* ---- pop-ups ---- */}
      {pick?.kind === 'rule' && cfg && (() => {
        const r = PACK_RULES.find((x) => x.key === pick.key);
        return <TemplateFolderPop title={`${caps(r?.when || 'It')}: Save In`} cfg={cfg} start={cfg.rules[pick.key]?.folder || ''} weekly={(r?.folder || '').includes(WEEK_MARK)}
          onClose={() => setPick(null)} onPick={(f, extra) => { if (adding && adding.key === pick.key) setAdding({ ...adding, folder: f, extra }); else setRule(pick.key, { folder: f }, extra); setPick(null); }} />;
      })()}
      {pick?.kind === 'main' && (
        <DrivePathPop title="Choose This Company’s Main OneDrive Folder" onClose={() => setPick(null)} onPick={async (p) => {
          setPick(null);
          if (!(await setMainFolder(p))) { toast('Could not save the main folder — try again.'); return; }
          refresh();
          // New job folders start in the main folder until another is chosen.
          if (cfg && !cleanFolder(cfg.parent_path)) { void save({ ...cfg, parent_path: p }); return; }
          // Job folders or the template outside the main folder (e.g. another company's, set up before): offer to move
          // them in, so this company's jobs never go in someone else's folders (19 Nov 2026).
          const inside = (x: string) => { const a = cleanFolder(x).toLowerCase(), b = cleanFolder(p).toLowerCase(); return a === b || a.startsWith(`${b}/`); };
          if (cfg && (!inside(cfg.parent_path) || (cleanFolder(cfg.template_path) && !inside(cfg.template_path)))) {
            const where = `New job folders go in “${cleanFolder(cfg.parent_path).split('/').join(' › ')}”${cleanFolder(cfg.template_path) && !inside(cfg.template_path) ? ` and are built from “${cleanFolder(cfg.template_path).split('/').join(' › ')}”` : ''}, outside your main folder.`;
            if (await confirmAsk(`${where}\n\nMove new job folders into “${p.split('/').join(' › ')}”? You then choose its template.`, 'Yes', 'No')) {
              await save({ ...cfg, parent_path: p, template_path: inside(cfg.template_path) ? cfg.template_path : '' });
            }
          }
        }} />
      )}
      {(pick?.kind === 'parent' || pick?.kind === 'template') && cfg && (
        <DrivePathPop title={pick.kind === 'parent' ? 'New Job Folders Go In' : 'Your Template Folder'} start={mainPath} onClose={() => setPick(null)}
          onPick={(p) => { if (pick.kind === 'parent') void save({ ...cfg, parent_path: p }); else void fromTemplate(p); setPick(null); }} />
      )}
      {pick?.kind === 'quote' && (
        <DrivePathPop title={Q_TITLES[pick.key]} start={mainPath} onClose={() => setPick(null)} onPick={async (p) => {
          const k = pick.key; setPick(null);
          let patch: Record<string, unknown>;
          if (k === 'awaiting' || k === 'checking') {
            // Inside Open Tenders it's kept as the folder's name, so it follows if Open Tenders moves; elsewhere, the whole path.
            const open = (qs?.open_path || '').replace(/\/+$/, '');
            const rel = open && p.toLowerCase().startsWith(`${open.toLowerCase()}/`) ? p.slice(open.length + 1) : `/${p}`;
            patch = { status_folders: { awaiting: '- Awaiting More Information', checking: '- Ready For Checking', ...(qs?.status_folders || {}), [k]: rel } };
          } else if (k === 'archive_path') patch = { archive_path: p.replace(/(19|20)\d\d(?!.*(19|20)\d\d)/, '{year}') };
          else patch = { [k]: p };
          if (!(await saveQuoteSettings({ org_id: me.org_id as string, ...patch } as never))) toast('Could not save. Try again.');
          void qc.invalidateQueries({ queryKey: ['quoteSettings'] });
        }} />
      )}
      {adding && cfg && (() => {
        const r = PACK_RULES.find((x) => x.key === adding.key);
        return (
          <>
            <Pop title="Add Something To Save" onClose={() => setAdding(null)} footer={(
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}>
                <Button title="Add" onPress={() => { setRule(adding.key, { on: adding.on, folder: adding.folder }, adding.extra); setAdding(null); }} />
                <Button kind="ghost" title="Cancel" onPress={() => setAdding(null)} />
              </View>
            )}>
              <Muted style={{ fontWeight: '500' }}>What</Muted>
              <Pressable accessibilityRole="button" accessibilityLabel="What" onPress={async () => {
                const k = await chooseAction('What', addable.map((x) => ({ key: x.key, label: `${caps(x.area)}: ${caps(x.when)}` })));
                const nx = addable.find((x) => x.key === k); if (nx) setAdding({ key: nx.key, folder: cfg.rules[nx.key]?.folder || '', on: true });
              }} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, marginBottom: 10 }}>
                <Text style={{ color: base.ink }}>{caps(r?.area || '')} ▾</Text>
              </Pressable>
              <Muted style={{ fontWeight: '500' }}>When</Muted>
              <Text style={{ color: base.ink, marginBottom: 10 }}>{caps(r?.when || '')}</Text>
              <Muted style={{ fontWeight: '500' }}>Save It In</Muted>
              <View style={{ marginBottom: 10, marginTop: 2 }}><FolderLink label={`📁 ${folderLabel(adding.folder)}`} onPress={() => setPick({ kind: 'rule', key: adding.key })} /></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: base.ink }}>Save Automatically?</Text><Muted style={{ fontSize: 12 }}>No: it stays on the list, not saving, ready to switch on</Muted></View>
                <YesNo label="Save automatically" value={adding.on} onChange={(v) => setAdding({ ...adding, on: v })} />
              </View>
            </Pop>
          </>
        );
      })()}
    </ScrollView>
  );
}
