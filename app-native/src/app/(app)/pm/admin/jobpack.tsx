// Admin Centre › OneDrive › New job pack: what every new job's folder holds, and what the app files where. All edited here.
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Field, Muted, SectionTitle, Toggle } from '@/components/ui';
import { saveJobPackSettings, useJobPackSettings } from '@/data/jobPack';
import { useAuth } from '@/lib/auth';
import { cleanFolder, PACK_RULES, packProblem, startingPack, WEEK_MARK, weekExample, type PackConfig } from '@/lib/rules/jobPack';
import { base, page, radius, space } from '@/theme/theme';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const line = { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: base.cardLine } as const;
const last = (p: string) => p.split('/').pop() || p;
const depth = (p: string) => p.split('/').length - 1;

export default function JobPackRules() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useJobPackSettings(me?.org_id);
  const [c, setC] = useState<PackConfig>(startingPack());
  const [open, setOpen] = useState<Record<string, boolean>>({ sync: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data?.config) return;
    // A rule added to the app later joins a company's saved set with its starting values.
    setC({ ...startingPack(), ...data.config, rules: { ...startingPack().rules, ...data.config.rules } });
  }, [data?.config]);
  if (!me?.org_id) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Admins only.</Muted>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const orgId = me.org_id;
  const save = async (enabled = !!data?.enabled) => {
    const clean: PackConfig = { ...c, parent_path: cleanFolder(c.parent_path), template_path: cleanFolder(c.template_path) };
    const p = packProblem(clean);
    if (p) { showAlert(p); return false; }
    setBusy(true);
    const ok = await saveJobPackSettings(orgId, me.id, { enabled, config: clean });
    setBusy(false);
    toast(ok ? 'Saved' : 'Could not save. Try again.');
    void qc.invalidateQueries({ queryKey: ['jobPackSettings', orgId] });
    return ok;
  };
  const sorted = [...c.folders].sort();
  const pickFolder = async (title: string, withWeek: boolean, none = false): Promise<string | null> => {
    const k = await chooseAction(title, [...(none ? [{ key: '__top', label: 'The top of the job folder' }] : []), ...(withWeek ? [{ key: '__week', label: '📅 This week’s folder' }] : []), ...sorted.map((f) => ({ key: f, label: `${'  '.repeat(depth(f))}${last(f)}` }))]);
    if (k === null) return null;
    if (k === '__top') return '';
    if (k === '__week') return PACK_RULES.find((r) => r.key === 'sow_progress')?.folder ?? WEEK_MARK;
    return k;
  };
  const addFolder = async (under = '') => {
    const name = cleanFolder((await promptText(under ? `New folder inside ${last(under)}` : 'New folder at the top of the job', '')) ?? '');
    if (!name) return;
    const path = under ? `${under}/${name}` : name;
    if (c.folders.includes(path)) { toast('That folder is already there.'); return; }
    setC({ ...c, folders: [...c.folders, path] });
  };
  const removeFolder = async (f: string) => {
    const inside = c.folders.filter((x) => x === f || x.startsWith(`${f}/`));
    const used = PACK_RULES.filter((r) => c.rules[r.key]?.on && inside.some((x) => c.rules[r.key].folder === x || c.rules[r.key].folder.startsWith(`${x}/`)));
    if (used.length && !(await confirmAsk(`${used.map((r) => r.area).join(', ')} still file into this folder, and OneDrive will make it again when they do. Take it out anyway?`, 'Take it out'))) return;
    setC({ ...c, folders: c.folders.filter((x) => !inside.includes(x)) });
  };
  const renameFolder = async (f: string) => {
    const name = cleanFolder((await promptText('Folder name', last(f))) ?? '').replace(/\//g, '-');
    if (!name || name === last(f)) return;
    const to = `${f.slice(0, f.length - last(f).length)}${name}`;
    const swap = (x: string) => (x === f ? to : x.startsWith(`${f}/`) ? to + x.slice(f.length) : x);
    setC({ ...c, folders: c.folders.map(swap), files: c.files.map((x) => ({ ...x, folder: swap(x.folder) })), rules: Object.fromEntries(Object.entries(c.rules).map(([k, r]) => [k, { ...r, folder: swap(r.folder) }])) });
  };
  const section = (key: string, title: string, sub: string) => (<><Toggle title={title} open={!!open[key]} onPress={() => setOpen({ ...open, [key]: !open[key] })} />{!open[key] && <Muted style={{ marginBottom: 10 }}>{sub}</Muted>}</>);
  const onCount = PACK_RULES.filter((r) => c.rules[r.key]?.on).length;

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New job pack' }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: base.ink }}>Set up new jobs automatically</Text>
            <Muted>{data?.enabled ? 'On: every new job gets its folder.' : data?.config ? 'Off: new jobs don’t get a folder.' : 'Off, and these rules aren’t saved yet.'}</Muted>
          </View>
          <Switch accessibilityLabel="Set up new jobs automatically" value={!!data?.enabled} onValueChange={async (on) => {
            if (on && !(await confirmAsk('Every new job will get a OneDrive folder from these rules. Existing jobs aren’t touched. Switch on?', 'Switch on'))) return;
            await save(on);
          }} />
        </View>
      </Card>
      <Card>
        <SectionTitle>Where</SectionTitle>
        <Field label="New job folders go in" value={c.parent_path} onChangeText={(t) => setC({ ...c, parent_path: t })} />
        <Field label="Template folder, for the documents below" value={c.template_path} onChangeText={(t) => setC({ ...c, template_path: t })} />
      </Card>

      {section('sync', `What the app files where (${onCount} on)`, 'Photos, RAMS, talks and the rest.')}
      {!!open.sync && (
        <Card>
          {PACK_RULES.map((r) => {
            const v = c.rules[r.key] ?? { on: false, folder: r.folder };
            const week = v.folder.includes(WEEK_MARK);
            return (
              <View key={r.key} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: base.cardLine }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: base.ink }}>{r.area}</Text>
                    <Muted>{r.when}</Muted>
                  </View>
                  <Switch accessibilityLabel={`${r.area}: ${r.when}`} value={v.on} onValueChange={(on) => setC({ ...c, rules: { ...c.rules, [r.key]: { ...v, on } } })} />
                </View>
                {v.on && (
                  <Pressable accessibilityRole="button" onPress={async () => { const f = await pickFolder(`${r.area}: file into`, true); if (f !== null) setC({ ...c, rules: { ...c.rules, [r.key]: { ...v, folder: f } } }); }} style={{ marginTop: 5 }}>
                    <Text style={{ color: base.blue, fontSize: 13, fontWeight: '600' }}>📁 {week ? 'This week’s folder' : last(v.folder)} ▾</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </Card>
      )}

      {section('week', 'Weekly folders', `${weekExample(c.weekly, 1)}, ${weekExample(c.weekly, 2)} and so on.`)}
      {!!open.week && (
        <Card>
          <Field label="Name of each week’s folder" value={c.weekly.name} onChangeText={(t) => setC({ ...c, weekly: { ...c.weekly, name: t } })} />
          <Muted style={{ marginBottom: 10 }}>Week 1 will be “{weekExample(c.weekly, 1)}”, week 2 “{weekExample(c.weekly, 2)}”. A week’s folder is made when its first file arrives, so quiet weeks don’t get an empty one.</Muted>
          <View style={[line, { borderBottomWidth: 0 }]}>
            <Text style={{ flex: 1, color: base.ink }}>Add the date to the name</Text>
            <Switch accessibilityLabel="Add the date to the name" value={c.weekly.addDate} onValueChange={(addDate) => setC({ ...c, weekly: { ...c.weekly, addDate } })} />
          </View>
          <View style={{ marginVertical: 6 }}><Button kind="ghost" title={`Weeks start on ${DAYS[c.weekly.weekStart]}`} onPress={async () => { const k = await chooseAction('Weeks start on', DAYS.map((d, i) => ({ key: String(i), label: d }))); if (k !== null) setC({ ...c, weekly: { ...c.weekly, weekStart: Number(k) } }); }} /></View>
          <Button kind="ghost" title={c.weekly.week1 === 'start' ? 'Week 1 is the job’s start date' : 'Week 1 is the first progress photo'} onPress={async () => { const k = await chooseAction('Week 1 is', [{ key: 'start', label: 'The job’s start date' }, { key: 'first', label: 'The first progress photo' }]); if (k) setC({ ...c, weekly: { ...c.weekly, week1: k as 'start' | 'first' } }); }} />
        </Card>
      )}

      {section('folders', `Folders made on each job (${c.folders.length})`, 'Press to open, rename, add or take out.')}
      {!!open.folders && (
        <Card>
          {sorted.map((f) => (
            <View key={f} style={[line, { paddingLeft: depth(f) * 12 }]}>
              <Text style={{ flex: 1, color: base.ink, fontSize: 13.5 }}>📁 {last(f)}</Text>
              <Pressable hitSlop={8} accessibilityLabel={`Change ${last(f)}`} onPress={async () => {
                const k = await chooseAction(last(f), [{ key: 'ren', label: '✎ Rename' }, { key: 'add', label: '+ Add a folder inside' }, { key: 'del', label: '🗑 Take out', danger: true }]);
                if (k === 'ren') void renameFolder(f); else if (k === 'add') void addFolder(f); else if (k === 'del') void removeFolder(f);
              }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
            </View>
          ))}
          <View style={{ marginTop: 10 }}><Button kind="ghost" title="+ Add a folder" onPress={() => void addFolder()} /></View>
        </Card>
      )}

      {section('files', `Documents copied to each job (${c.files.length})`, 'The working documents from your template.')}
      {!!open.files && (
        <Card>
          <Muted style={{ marginBottom: 6 }}>Copied from the template folder. Everything else in the template stays out, so jobs only hold what they use.</Muted>
          {c.files.map((f, i) => (
            <View key={`${f.folder}/${f.name}`} style={line}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: base.ink, fontSize: 13.5 }}>📄 {f.name}</Text>
                <Muted>{f.folder ? last(f.folder) : 'Top of the job folder'}</Muted>
              </View>
              <Pressable hitSlop={8} accessibilityLabel={`Take out ${f.name}`} onPress={() => setC({ ...c, files: c.files.filter((_, j) => j !== i) })}><Text style={{ color: base.warn }}>🗑</Text></Pressable>
            </View>
          ))}
          <AddDocument onAdd={async (name) => {
            const folder = await pickFolder(`Which folder is ${name} in, in the template and on the job?`, false, true);
            if (folder === null) return;
            setC({ ...c, files: [...c.files, { folder, name }] });
          }} />
        </Card>
      )}
      <Button busy={busy} title="Save" onPress={() => void save()} />
    </ScrollView>
  );
}

function AddDocument({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
      <TextInput value={name} onChangeText={setName} placeholder="File name, e.g. Checklist.xlsx" style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, fontSize: 16 }} />
      <Button small kind="ghost" title="Add" onPress={async () => { if (name.trim()) { await onAdd(name.trim()); setName(''); } }} />
    </View>
  );
}
