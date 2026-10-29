// A job's To Do List (350). Managers only. Live / Closed; each to-do has its text,
// a required-by date (red when overdue), the PM it's assigned to, attachments and
// comments. Tick several to email or export just those; or the whole list.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox, todayIso } from '@/components/DateField';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, SectionTitle, Toggle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { nameOf, usePeople } from '@/data/hs';
import { useSite } from '@/data/sites';
import {
  addComment, addTodo, assignTodo, deleteTodo, deleteTodoFile, editTodo, emailTodos, setTodoDone, todoFileUrl, uploadTodoFiles,
  usePmList, useTodos, type Pm, type Todo,
} from '@/data/todos';
import { useAuth } from '@/lib/auth';
import { exportTablePdf } from '@/lib/tableExport';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
type Asset = { uri: string; name: string; mimeType?: string | null; size?: number | null };
const pickFiles = async (): Promise<Asset[]> => {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  return r.canceled ? [] : r.assets.map((a) => ({ uri: a.uri, name: a.name || 'file', mimeType: a.mimeType, size: a.size }));
};

export default function TodoList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useTodos(id);
  const { data: pms } = usePmList();
  const { data: people } = usePeople();
  const [tab, setTab] = useState<'live' | 'closed'>('live');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<{ id: string; text: string; date: string } | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(true);
  const [email, setEmail] = useState<null | { ids: string[] | null }>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['todos', id] });
  const all = data?.todos ?? [];
  const list = all.filter((t) => (tab === 'live' ? !t.done : t.done));
  const picked = list.filter((t) => sel.has(t.id)).map((t) => t.id);
  const ukd = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB');
  const exportPdf = async (ids: string[]) => {
    const rows = list.filter((t) => ids.includes(t.id));
    if (!rows.length) { toast('Nothing to export.'); return; }
    const coms = data?.comments ?? [];
    const ok = await exportTablePdf({ title: tab === 'live' ? 'To Do List' : 'To Do List (closed)', site: site.name, sub: site.name, cols: [{ l: 'To do', w: 260 }, { l: 'Required by', w: 70 }, { l: 'Assigned to', w: 100 }, { l: 'Added', w: 70 }, { l: 'Latest comment', w: 220 }], rows: rows.map((t) => { const c = coms.filter((x) => x.todo_id === t.id).pop(); return [t.text, t.date_required_by ? ukd(t.date_required_by) : '', t.assigned_to ? nameOf(people, t.assigned_to) : 'Unassigned', ukd(t.created_at.slice(0, 10)), c ? c.body : '']; }) }, org).catch(() => false);
    if (!ok) toast('Could not build the PDF.'); else setSel(new Set());
  };
  const choosePm = async (current: string | null): Promise<Pm | null | undefined> => {
    const k = await chooseAction('Assign to a project manager', [{ key: '', label: 'Unassigned' }, ...(pms ?? []).map((p) => ({ key: p.id, label: `${current === p.id ? '✓ ' : ''}${p.name}` }))]);
    if (k === null) return undefined;
    return k ? (pms ?? []).find((p) => p.id === k) ?? null : null;
  };

  const row = (t: Todo) => {
    const files = (data?.files ?? []).filter((f) => f.todo_id === t.id);
    const comments = (data?.comments ?? []).filter((c) => c.todo_id === t.id);
    const showComments = !t.done || openComments.has(t.id);
    return (
      <Card key={t.id}>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <Pressable hitSlop={8} onPress={() => { const n = new Set(sel); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); setSel(n); }}><Text style={{ fontSize: 18 }}>{sel.has(t.id) ? '☑' : '☐'}</Text></Pressable>
          <View style={{ flex: 1 }}>
            {edit?.id === t.id ? (
              <View>
                <TextInput value={edit.text} onChangeText={(x) => setEdit({ ...edit, text: x })} style={box} />
                <DateBox value={edit.date} onChange={(x) => setEdit({ ...edit, date: x })} min={todayIso()} placeholder="Required by (optional)" title="Required by" style={{ marginBottom: 8 }} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Button title="Save" onPress={async () => {
                    if (!edit.text.trim()) { toast("To-do text can't be empty."); return; }
                    const d = edit.date || null;
                    if (await editTodo(t.id, edit.text.trim(), d)) { toast('To-do updated'); setEdit(null); refresh(); } else toast('Could not save — try again.');
                  }} /></View>
                  <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setEdit(null)} /></View>
                </View>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <Text style={{ flex: 1, fontSize: 18, fontWeight: '600', color: t.done ? base.slate : base.ink, textDecorationLine: t.done ? 'line-through' : 'none' }}>{t.text}</Text>
                  {!!t.date_required_by && (
                    <Pressable disabled={t.done} onPress={() => setEdit({ id: t.id, text: t.text, date: t.date_required_by || '' })} style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11.5, color: base.slate }}>Required by</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: base.ink }}>{new Date(`${t.date_required_by}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
            <Pressable disabled={t.done} onPress={async () => {
              const pm = await choosePm(t.assigned_to); if (pm === undefined) return;
              if (await assignTodo(me, id, site.name, t, pm)) { toast(pm ? 'Project manager updated' : 'Project manager removed'); refresh(); }
            }} style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 13.5, fontStyle: 'italic', color: base.slate }}>{t.assigned_to ? <>Assigned to <Text style={{ fontWeight: '700', fontStyle: 'normal' }}>{nameOf(people, t.assigned_to)}</Text>{t.done ? '' : ' — tap to change'}</> : t.done ? 'Unassigned' : 'Tap to assign a project manager'}</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <Pressable onPress={async () => { if (await setTodoDone(t.id, !t.done)) { toast(t.done ? 'Reopened' : 'Closed'); refresh(); } }}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: base.ok, backgroundColor: base.okBg }}>
            <Text style={{ fontWeight: '800', fontSize: 11, color: base.ok }}>{t.done ? '✓ Completed' : 'Mark Complete'}</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={async () => {
            const k = await chooseAction(t.text, [...(!t.done ? [{ key: 'edit', label: '✎ Edit' }] : []), { key: 'del', label: '🗑 Delete', danger: true }]);
            if (k === 'edit') setEdit({ id: t.id, text: t.text, date: t.date_required_by || '' });
            else if (k === 'del' && await confirmAsk("Delete this to-do item? This can't be undone.", 'Delete')) { if (await deleteTodo(me, id, t)) { toast('To-do deleted'); refresh(); } }
          }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
        </View>
        <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: base.line }}>
          {files.map((f) => (
            <View key={f.id} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
              <Pressable style={{ flex: 1 }} onPress={async () => { const u = await todoFileUrl(f); if (u) viewDoc(u); else toast('Could not open file.'); }}>
                <Text style={{ color: base.ink, textDecorationLine: 'underline' }} numberOfLines={1}>📎 {f.name}</Text>
              </Pressable>
              <Pressable onPress={async () => { if (await confirmAsk("Delete this attachment? This can't be undone.", 'Delete') && await deleteTodoFile(f)) { toast('Attachment deleted'); refresh(); } }}><Text style={{ color: base.warn }}>🗑</Text></Pressable>
            </View>
          ))}
          <Pressable onPress={async () => { const a = await pickFiles(); if (!a.length) return; const n = await uploadTodoFiles(me, t.id, a); toast(n ? (n === 1 ? 'Attachment added' : `${n} attachments added`) : 'Could not upload — try again.'); refresh(); }}>
            <Text style={{ fontSize: 13.5, color: base.slate, textDecorationLine: 'underline' }}>+ Add photo/document</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: base.line }}>
          {t.done ? (
            <Pressable onPress={() => { const n = new Set(openComments); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); setOpenComments(n); }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{showComments ? '▼' : '▶'} Comments{comments.length ? ` (${comments.length})` : ''}</Text>
            </Pressable>
          ) : <Muted style={{ fontSize: 12, fontWeight: '700' }}>COMMENTS</Muted>}
          {showComments && (
            <>
              {comments.length ? comments.map((c) => (
                <View key={c.id} style={{ marginTop: 6 }}>
                  <Text style={{ fontSize: 13.5, color: base.ink }}><Text style={{ fontWeight: '700' }}>{nameOf(people, c.created_by)}</Text> <Text style={{ color: base.slate, fontSize: 12 }}>{new Date(c.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text></Text>
                  <Text style={{ color: base.ink, fontSize: 15 }}>{c.body}</Text>
                </View>
              )) : <Muted>No comments yet — add one if something isn&apos;t possible.</Muted>}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TextInput value={comment[t.id] ?? ''} onChangeText={(x) => setComment({ ...comment, [t.id]: x })} placeholder="Add a comment…" style={[box, { flex: 1, marginBottom: 0, fontSize: 15 }]} />
                <Button small kind="ghost" title="Comment" onPress={async () => {
                  const b = (comment[t.id] ?? '').trim(); if (!b) return;
                  if (await addComment(me, t.id, b)) { setComment({ ...comment, [t.id]: '' }); refresh(); }
                }} />
              </View>
            </>
          )}
        </View>
      </Card>
    );
  };

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'To Do List' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {(['live', 'closed'] as const).map((k) => (
          <Pressable key={k} onPress={() => { setTab(k); setSel(new Set()); }} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: tab === k ? base.ink : base.line, backgroundColor: tab === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: tab === k ? '#fff' : base.ink }}>{k === 'live' ? 'Live' : 'Closed'}</Text>
          </Pressable>
        ))}
      </View>
      {picked.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <Button small title={`Email ${picked.length}`} onPress={() => setEmail({ ids: picked })} />
          <Button small kind="ghost" title={`PDF of ${picked.length}`} onPress={() => void exportPdf(picked)} />
          <Button small kind="ghost" title="Clear" onPress={() => setSel(new Set())} />
        </View>
      )}
      {email && <EmailBox site={site} pms={pms ?? []} count={email.ids?.length ?? null} onCancel={() => setEmail(null)} onSend={async (rec, cc) => {
        const err = await emailTodos(id, rec, email.ids, cc);
        if (err) { toast(err); return; }
        toast('To-do list emailed'); setEmail(null); setSel(new Set());
      }} />}
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map(row) : <Empty>No {tab} to-dos.</Empty>}
      {tab === 'live' && (
        <>
          <Toggle title="Add To Do" open={all.length === 0 || addOpen} onPress={() => setAddOpen(!addOpen)} />
          {(all.length === 0 || addOpen) && <AddBox pms={pms ?? []} choosePm={choosePm} onAdd={async (f) => {
            if (await addTodo(me, id, site.name, f)) { toast('Added to the to-do list'); refresh(); return true; }
            toast('Could not save — try again.'); return false;
          }} />}
        </>
      )}
      {list.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {tab === 'live' && <Button small kind="ghost" title="✉ Email To Do List" onPress={() => setEmail({ ids: null })} />}
          <Button small kind="ghost" title={`📄 Export PDF (${tab === 'live' ? 'live' : 'closed'} list)`} onPress={() => void exportPdf(list.map((t) => t.id))} />
        </View>
      )}
    </ScrollView>
  );
}

function AddBox({ choosePm, onAdd }: { pms: Pm[]; choosePm: (c: string | null) => Promise<Pm | null | undefined>; onAdd: (f: { text: string; comment: string; date: string | null; pm: Pm | null; files: Asset[] }) => Promise<boolean> }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [pm, setPm] = useState<Pm | null>(null);
  const [files, setFiles] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim()) { toast('Enter what needs doing first.'); return; }
    const d = date || null;
    setBusy(true);
    if (await onAdd({ text: text.trim(), comment: note.trim(), date: d, pm, files })) { setText(''); setNote(''); setDate(''); setPm(null); setFiles([]); }
    setBusy(false);
  };
  return (
    <Card>
      <TextInput value={text} onChangeText={setText} placeholder="What needs doing?" style={[box, { fontSize: 16 }]} onSubmitEditing={() => void submit()} />
      <Muted style={{ fontWeight: '700' }}>Comments (optional)</Muted>
      <TextInput value={note} onChangeText={setNote} multiline placeholder="Add any notes…" style={[box, { minHeight: 56 }]} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <DateBox value={date} onChange={setDate} min={todayIso()} placeholder="Required by (optional)" title="Required by" style={{ flex: 1, marginBottom: 8 }} />
        <Pressable onPress={async () => { const p = await choosePm(pm?.id ?? null); if (p !== undefined) setPm(p); }} style={[box, { flex: 1, justifyContent: 'center' }]}>
          <Text style={{ color: base.ink }}>▶ {pm ? pm.name : 'Assign to a PM (optional)'}</Text>
        </Pressable>
      </View>
      <Button small kind="ghost" title="📎 Photos / documents (optional)" onPress={async () => setFiles([...files, ...(await pickFiles())])} />
      {files.map((f, i) => (
        <View key={`${f.uri}${i}`} style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          <Text style={{ flex: 1, color: base.slate }} numberOfLines={1}>{f.name}</Text>
          <Pressable onPress={() => setFiles(files.filter((_, j) => j !== i))}><Text style={{ color: base.warn, fontWeight: '700' }}>Remove</Text></Pressable>
        </View>
      ))}
      <View style={{ marginTop: 8 }}><Button small busy={busy} title="Add To Do" onPress={() => void submit()} /></View>
    </Card>
  );
}

function EmailBox({ site, pms, count, onSend, onCancel }: { site: { client_email?: string | null; client_contact_name?: string | null; client_name: string | null }; pms: Pm[]; count: number | null; onSend: (rec: string[], cc: string | null) => Promise<void>; onCancel: () => void }) {
  const toast = useToast();
  const [rec, setRec] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [cc, setCc] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = q.trim() ? pms.filter((p) => `${p.name} ${p.email || ''}`.toLowerCase().includes(q.trim().toLowerCase())) : pms;
  return (
    <Card style={{ borderColor: base.blue, borderWidth: 1.5 }}>
      <SectionTitle>Email To Do List</SectionTitle>
      <Muted>Choose which project managers should receive the {count ? `${count} selected to-do${count === 1 ? '' : 's'}` : 'live to-do list'} for this site.</Muted>
      {pms.length > 10 && <TextInput value={q} onChangeText={setQ} placeholder="Filter project managers…" style={[box, { marginTop: 6 }]} />}
      {shown.map((p) => (
        <Pressable key={p.id} onPress={() => { const n = new Set(rec); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); setRec(n); }}>
          <Text style={{ paddingVertical: 6, color: base.ink }}>{rec.has(p.id) ? '☑' : '☐'} {p.name} <Text style={{ color: base.slate, fontSize: 11 }}>{p.email || ''}</Text></Text>
        </Pressable>
      ))}
      {!!site.client_email && <Check label={`CC client contact${site.client_contact_name || site.client_name ? ` (${site.client_contact_name || site.client_name})` : ''}`} value={cc} onChange={setCc} />}
      <Button busy={busy} title="Send" onPress={async () => {
        if (!rec.size) { toast('Pick at least one project manager.'); return; }
        setBusy(true); await onSend([...rec], cc ? site.client_email ?? null : null); setBusy(false);
      }} />
      <Button kind="ghost" title="Cancel" onPress={onCancel} />
    </Card>
  );
}
