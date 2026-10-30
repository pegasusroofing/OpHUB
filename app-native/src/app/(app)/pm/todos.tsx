// To do across your projects (185 renderPmTodos): open to-dos on jobs you run,
// were assigned or created, grouped by project (overdue dates in red), plus
// "Add a to-do" for any live project or General (not a project). Tap one to open that job's To Do List;
// a General one can be ticked off, changed or deleted here.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { askDate, DateBox, todayIso } from '@/components/DateField';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle, Toggle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { usePmTodos } from '@/data/pmHome';
import { useSites } from '@/data/sites';
import { addTodo, deleteTodo, editTodo, setTodoDone, usePmList, type Pm, type Todo } from '@/data/todos';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { localISODate } from '@/lib/rules/driver';
import { base, page, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };

export default function PmTodos() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites } = useSites();
  const { data: rows = [], isLoading } = usePmTodos(sites);
  const { data: people } = usePeople();
  const { data: pms } = usePmList();
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<{ uri: string; name: string; mimeType?: string | null; size?: number | null }[]>([]);
  const [pm, setPm] = useState<Pm | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const today = localISODate(new Date());
  const groups: Record<string, typeof rows> = {};
  rows.forEach((t) => { (groups[t.site_id || 'general'] ||= []).push(t); });
  const keys = Object.keys(groups).sort((a, b) => (a === 'general' ? -1 : b === 'general' ? 1 : (sites?.find((s) => s.id === a)?.name || '').localeCompare(sites?.find((s) => s.id === b)?.name || '')));
  const live = (sites ?? []).filter((s) => siteStatusKey(s) !== 'closed').sort((a, b) => a.name.localeCompare(b.name));
  const reload = () => void qc.invalidateQueries({ queryKey: ['pmTodos'] });
  const generalMenu = async (t: Todo) => {
    const k = await chooseAction(t.text, [{ key: 'done', label: 'Mark done' }, { key: 'edit', label: 'Change the wording' }, { key: 'date', label: 'Change the date required' }, { key: 'del', label: 'Delete', danger: true }]);
    if (k === 'done') { toast((await setTodoDone(t.id, true)) ? 'Marked done' : 'Could not save — try again.'); reload(); }
    if (k === 'edit') { const v = await promptText('What needs doing?', t.text); if (v && v.trim()) { toast((await editTodo(t.id, v.trim(), t.date_required_by)) ? 'Saved' : 'Could not save — try again.'); reload(); } }
    if (k === 'date') { const v = await askDate('Required by', { min: todayIso() }); if (v != null) { if (!(await editTodo(t.id, t.text, v || null))) toast('Could not save — try again.'); reload(); } }
    if (k === 'del' && (await confirmAsk('Delete this to-do?', 'Delete'))) { toast((await deleteTodo(me, 'general', t)) ? 'Deleted' : 'Could not delete — try again.'); reload(); }
  };

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'To do' }} />
      <Toggle title="Add a to-do" open={open} onPress={() => setOpen(!open)} />
      {open && (
        <Card>
          <Pressable onPress={async () => { const k = await chooseAction('Project', [{ key: 'general', label: 'General — not a project' }, ...live.map((s) => ({ key: s.id, label: s.name }))]); if (k) setSiteId(k); }} style={[box, { paddingVertical: 12 }]}>
            <Text style={{ color: siteId ? base.ink : base.slate }}>▼ {siteId === 'general' ? 'General — not a project' : siteId ? live.find((s) => s.id === siteId)?.name : 'Choose a project…'}</Text>
          </Pressable>
          <TextInput value={text} onChangeText={setText} placeholder="What needs doing?" style={box} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <DateBox value={date} onChange={setDate} placeholder="Required by (optional)" title="Required by" style={{ flex: 1, marginBottom: 8 }} />
            <Pressable onPress={async () => { const k = await chooseAction('Assign to a PM', [{ key: '', label: 'Unassigned' }, ...(pms ?? []).map((p) => ({ key: p.id, label: p.name }))]); if (k !== null) setPm((pms ?? []).find((p) => p.id === k) ?? null); }} style={[box, { flex: 1, justifyContent: 'center' }]}>
              <Text style={{ color: base.ink }}>▶ {pm ? pm.name : 'Assign to a PM'}</Text>
            </Pressable>
          </View>
          <TextInput value={comment} onChangeText={setComment} placeholder="Comments (optional)" multiline style={[box, { minHeight: 60 }]} />
          {siteId !== 'general' && (
            <Pressable style={{ marginBottom: 8 }} onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true }); if (!r.canceled) setFiles([...files, ...r.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size }))]); }}>
              <Text style={{ color: base.blue, fontWeight: '700' }}>📎 Photos / documents{files.length ? ` (${files.length})` : ''}</Text>
            </Pressable>
          )}
          <Button busy={busy} title="Add To Do" onPress={async () => {
            if (!siteId) { toast('Choose which project it is for, or General.'); return; }
            if (!text.trim()) { toast('Enter what needs doing first.'); return; }
            const d = date || null;
            setBusy(true);
            const ok = await addTodo(me, siteId, siteId === 'general' ? '' : live.find((s) => s.id === siteId)?.name || '', { text: text.trim(), comment: comment.trim(), date: d, pm, files: siteId === 'general' ? [] : files });
            setBusy(false);
            if (ok) { toast('Added to the to-do list'); setText(''); setDate(''); setPm(null); setComment(''); setFiles([]); void qc.invalidateQueries({ queryKey: ['pmTodos'] }); } else toast('Could not save — try again.');
          }} />
        </Card>
      )}
      {isLoading ? <Muted>Loading…</Muted> : keys.length ? keys.map((k) => (
        <View key={k}>
          <SectionTitle>{k === 'general' ? 'General (not a project)' : sites?.find((s) => s.id === k)?.name || 'Project'} ({groups[k].length})</SectionTitle>
          {groups[k].map((t) => {
            const over = !!t.date_required_by && t.date_required_by < today;
            return (
              <Pressable key={t.id} onPress={() => (k === 'general' ? void generalMenu({ ...t, done: false }) : router.push(`/sites/${k}/todos` as never))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: base.ink, fontWeight: '600' }}>{t.text}</Text>
                  <Muted>{t.assigned_to ? `Assigned to ${nameOf(people, t.assigned_to)}` : 'Unassigned'}</Muted>
                </View>
                {!!t.date_required_by && <Text style={{ fontSize: 11, fontWeight: '700', color: over ? base.warn : base.slate }}>{over ? 'Overdue · ' : ''}{new Date(`${t.date_required_by}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>}
              </Pressable>
            );
          })}
        </View>
      )) : <Empty>Nothing to do — all clear.</Empty>}
    </ScrollView>
  );
}
