// The OneDrive page (Andy, 8 Nov 2026), under Admin in Projects and in Finance — the same page in both, so a company with
// only one of them still has it. The connection; New Jobs (a folder for every new job? where they go, the template);
// Where Things Save, by Projects / Finance / Company, each item's folder (tap to change) and Yes / No to save it
// automatically, + Add Something To Save; Quick Links; and each job's folders. Everything saves as it's changed.
// Items save into jobs whose folder the job pack made; a folder linked by hand keeps working as before.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FinTabs } from '@/components/FinNav';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { syncSiteFolder } from '@/data/drawings';
import { saveJobPackSettings, setupJobPack, useJobPackSettings } from '@/data/jobPack';
import { connectOneDrive, disconnectOneDrive, listFolders, setQuickLinks, unlinkFolder, useOdSites, useOneDriveStatus, useQuickLinks, type OdFolder, type OdTarget } from '@/data/onedrive';
import { useAuth } from '@/lib/auth';
import { cleanFolder, folderLabel, foldersUnder, PACK_RULES, ruleTab, startingPack, WEEK_MARK, type PackConfig } from '@/lib/rules/jobPack';
import { base, page, radius, space } from '@/theme/theme';

type Tab = 'projects' | 'finance' | 'company';
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

/** A pop-up with a ✕ (Andy: pop-ups have a ✕), used for choosing folders and adding an item. */
function Pop({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: base.card, borderRadius: 14, padding: 16, maxHeight: '88%', width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
            <Text style={{ flex: 1, fontWeight: '600', fontSize: 16, color: base.ink }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}><Text style={{ fontSize: 18, color: base.slate }}>✕</Text></Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}
const folderRow = (name: string, onPress: () => void, sel = false) => (
  <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Open ${name}`} onPress={onPress}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: '#F0F1F4', backgroundColor: sel ? '#F0F4FF' : undefined, borderRadius: sel ? 6 : 0 }}>
    <Text>📁</Text><Text style={{ flex: 1, fontSize: 14, color: base.ink, fontWeight: sel ? '600' : '400' }}>{name}</Text><Text style={{ color: base.slate }}>›</Text>
  </Pressable>
);

/** Choose a folder inside the job folder, from the template's folder list. A new folder joins the list (so new jobs get it). */
function TemplateFolderPop({ title, cfg, start, weekly, onPick, onClose }: { title: string; cfg: PackConfig; start: string; weekly?: boolean; onPick: (folder: string, newFolders: string[]) => void; onClose: () => void }) {
  const startAt = cleanFolder(start.replace(WEEK_MARK, '')).split('/').slice(0, -1).join('/');
  const [at, setAt] = useState(startAt);
  const [extra, setExtra] = useState<string[]>([]);
  const all = [...cfg.folders, ...extra];
  const kids = foldersUnder(all, at);
  const parts = at ? at.split('/') : [];
  return (
    <Pop title={title} onClose={onClose} footer={(
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {!!at && <Button small title={`Use “${parts[parts.length - 1]}”`} onPress={() => onPick(at, extra)} />}
        {!!at && weekly && <Button small kind="ghost" title="Use This Week’s Folder In It" onPress={() => onPick(`${at}/${WEEK_MARK}`, extra)} />}
        <Button small kind="ghost" title="+ New Folder" onPress={async () => {
          const n = (await promptText('New folder name', ''))?.trim(); if (!n) return;
          const f = cleanFolder(at ? `${at}/${n}` : n); setExtra((x) => [...x, f]); setAt(f);
        }} />
      </View>
    )}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        <Text onPress={() => setAt('')} style={{ fontSize: 13, fontWeight: '600', color: at ? base.blue : base.ink }}>Job Folder</Text>
        {parts.map((p, i) => <Text key={i} onPress={() => setAt(parts.slice(0, i + 1).join('/'))} style={{ fontSize: 13, fontWeight: '600', color: i === parts.length - 1 ? base.ink : base.blue }}>  ›  {p}</Text>)}
      </View>
      {kids.length ? kids.map((k) => folderRow(k, () => setAt(at ? `${at}/${k}` : k))) : <Muted>No folders in here.</Muted>}
      <Muted style={{ marginTop: 8 }}>These are the folders every new job gets. A new one is added to that list too.</Muted>
    </Pop>
  );
}

/** Choose a folder in OneDrive itself (where new job folders go, the template), as a path from the top of the drive. */
function DrivePathPop({ title, onPick, onClose }: { title: string; onPick: (path: string) => void; onClose: () => void }) {
  const [stack, setStack] = useState<OdFolder[]>([]);
  const cur = stack[stack.length - 1] ?? null;
  const { data } = useQuery({ queryKey: ['odFolders', cur?.id ?? 'root', cur?.driveId ?? ''], queryFn: () => listFolders(cur) });
  const list = data ? data.folders.filter((f) => !f.virtual) : null, err = data?.error || '';
  return (
    <Pop title={title} onClose={onClose} footer={!!cur && (
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}><Button small title={`Use “${cur.name}”`} onPress={() => onPick(stack.map((s) => s.name).join('/'))} /></View>
    )}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        <Text onPress={() => setStack([])} style={{ fontSize: 13, fontWeight: '600', color: stack.length ? base.blue : base.ink }}>My Files</Text>
        {stack.map((s, i) => <Text key={s.id} onPress={() => setStack(stack.slice(0, i + 1))} style={{ fontSize: 13, fontWeight: '600', color: i === stack.length - 1 ? base.ink : base.blue }}>  ›  {s.name}</Text>)}
      </View>
      {err ? <Text style={{ color: '#C0392B' }}>{err}</Text> : !list ? <Muted>Loading…</Muted> : list.length ? list.map((f) => folderRow(f.name, () => setStack([...stack, f]))) : <Muted>No folders in here.</Muted>}
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
  const [pick, setPick] = useState<{ kind: 'rule'; key: string } | { kind: 'parent' | 'template' } | null>(null);
  const [adding, setAdding] = useState<{ key: string; folder: string; on: boolean; extra?: string[] } | null>(null);
  if (!me) return null;
  if (me.role !== 'admin' && me.role !== 'superadmin') return <Muted style={{ padding: space.l }}>Admins only.</Muted>;
  const cfg = pack?.config ?? null;
  const refresh = () => ['odStatus', 'odQuick', 'odSites', 'jobPackSettings'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const save = async (next: PackConfig, enabled = pack?.enabled ?? true) => {
    if (!(await saveJobPackSettings(me.org_id as string, me.id, { enabled, config: next }))) { toast('Could not save — try again.'); return false; }
    void qc.invalidateQueries({ queryKey: ['jobPackSettings'] }); return true;
  };
  const connect = async () => { setBusy('connect'); try { const e = await connectOneDrive(); if (e) toast(e); } finally { setBusy(''); } };
  const pickSite = (target: OdTarget, id = '') => router.push({ pathname: '/pm/onedrive-pick', params: { target, id } } as never);
  const shown = sites.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const addable = cfg ? PACK_RULES.filter((r) => ruleTab(r.key) === tab && (!cfg.rules[r.key] || !cfg.rules[r.key].on)) : [];
  const listed = cfg ? PACK_RULES.filter((r) => ruleTab(r.key) === tab && !!cfg.rules[r.key]) : [];
  const setRule = (key: string, patch: Partial<{ on: boolean; folder: string }>, newFolders: string[] = []) => {
    if (!cfg) return;
    const cur = cfg.rules[key] ?? { on: false, folder: PACK_RULES.find((r) => r.key === key)?.folder || '' };
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
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small kind={st && !st.needs_reconnect ? 'ghost' : undefined} busy={busy === 'connect'} title={st ? 'Reconnect' : 'Connect OneDrive'} onPress={() => void connect()} />
          {!!st && <Button small kind="ghost" title="Disconnect" onPress={async () => {
            if (!(await confirmAsk('Disconnect OneDrive? Nothing saves to it until it’s connected again.', 'Disconnect'))) return;
            if (!(await disconnectOneDrive(me.org_id as string))) toast('Could not disconnect — try again.'); refresh();
          }} />}
        </View>
      </Card>

      {/* ---- New Jobs ---- */}
      <Card>
        {head('New Jobs')}
        {!cfg ? (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Muted>Not set up yet. Every new job can get its own folder, built from your template, with things saving in the right place.</Muted>
            <Button small busy={busy === 'setup'} title="Set It Up" onPress={async () => {
              setBusy('setup'); await save(startingPack(!/\bRTB\b/i.test(org?.name || '')), true); setBusy('');
            }} />
          </View>
        ) : (
          <>
            {pack?.enabled === false && <Row title="The Job Pack Is Switched Off" sub="Nothing makes folders or saves by these rules"><View /></Row>}
            <Row title="Create A OneDrive Folder For Every New Job?" sub="A job can be unticked when it’s made; a client can be set to never (Finance › Directory)"
              right={<YesNo label="Create a OneDrive folder for every new job" value={pack?.enabled !== false && cfg.create_new !== false} onChange={(v) => void save({ ...cfg, create_new: v }, v ? true : pack?.enabled ?? true)} />} />
            <Row title="New Job Folders Go In" sub="Each job gets its own folder here"><FolderLink label={`📁 ${cfg.parent_path ? cfg.parent_path.split('/').join(' › ') : 'Choose A Folder'}`} onPress={() => setPick({ kind: 'parent' })} /></Row>
            <Row title="Built From" sub="Your template folder; its documents are copied in"><FolderLink label={`📁 ${cfg.template_path ? cfg.template_path.split('/').join(' › ') : 'Choose A Folder'}`} onPress={() => setPick({ kind: 'template' })} /></Row>
            {hasPm && <View style={{ alignItems: 'center', marginTop: 6 }}><Text onPress={() => router.push('/pm/admin/jobpack' as never)} style={{ color: base.blue, fontWeight: '600', fontSize: 13 }}>Template Folders, Documents And Week Folders ›</Text></View>}
          </>
        )}
      </Card>

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
            {tab === 'finance' && <Row title="Purchase Orders" sub="Their PDF, when it’s made"><FolderLink muted label="Each job’s Material PO’s folder (set on the job)" /></Row>}
            {!groups.length && tab !== 'finance' && <Muted>Nothing saving here yet.</Muted>}
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              {addable.length ? <Button title="+ Add Something To Save" onPress={() => { const r = addable[0]; setAdding({ key: r.key, folder: cfg.rules[r.key]?.folder || r.folder, on: true }); }} />
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

      {/* ---- pop-ups ---- */}
      {pick?.kind === 'rule' && cfg && (() => {
        const r = PACK_RULES.find((x) => x.key === pick.key);
        return <TemplateFolderPop title={`${caps(r?.when || 'It')}: Save In`} cfg={cfg} start={cfg.rules[pick.key]?.folder || r?.folder || ''} weekly={(r?.folder || '').includes(WEEK_MARK)}
          onClose={() => setPick(null)} onPick={(f, extra) => { if (adding && adding.key === pick.key) setAdding({ ...adding, folder: f, extra }); else setRule(pick.key, { folder: f }, extra); setPick(null); }} />;
      })()}
      {(pick?.kind === 'parent' || pick?.kind === 'template') && cfg && (
        <DrivePathPop title={pick.kind === 'parent' ? 'New Job Folders Go In' : 'Your Template Folder'} onClose={() => setPick(null)}
          onPick={(p) => { void save(pick.kind === 'parent' ? { ...cfg, parent_path: p } : { ...cfg, template_path: p }); setPick(null); }} />
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
                const nx = addable.find((x) => x.key === k); if (nx) setAdding({ key: nx.key, folder: cfg.rules[nx.key]?.folder || nx.folder, on: true });
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
