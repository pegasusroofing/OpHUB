// Admin Centre › Schedule of Works Library (290): company templates of sections
// and tasks, picked from any job's Schedule of Works "From Library". Sites that
// already used a template keep their own copy.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Row = { id: string; name: string; position: number | null; section_id?: string | null };

function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => Promise<void> }) {
  const [v, setV] = useState('');
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
      <TextInput value={v} onChangeText={setV} placeholder={placeholder} style={{ flex: 1, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink, backgroundColor: base.card }} />
      <Pressable onPress={async () => { if (!v.trim()) return; await onAdd(v.trim()); setV(''); }} style={{ paddingHorizontal: 12, justifyContent: 'center', borderRadius: radius.input, backgroundColor: base.ink }}><Text style={{ color: '#fff', fontWeight: '800' }}>+</Text></Pressable>
    </View>
  );
}

export default function SowLibrary() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const { data: tpls = [], isLoading } = useQuery({
    queryKey: ['sowLib', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('sow_library_templates').select('id,name').eq('org_id', me?.org_id as string).order('name')).data as { id: string; name: string }[] | null) ?? [],
  });
  const { data: body } = useQuery({
    queryKey: ['sowLibBody', open], enabled: !!open,
    queryFn: async () => {
      const [s, t] = await Promise.all([
        db.from('sow_library_sections').select('*').eq('template_id', open as string).order('position', { ascending: true, nullsFirst: false }).order('created_at'),
        db.from('sow_library_tasks').select('*').eq('template_id', open as string).order('position', { ascending: true, nullsFirst: false }).order('created_at'),
      ]);
      return { secs: (s.data as Row[] | null) ?? [], tasks: (t.data as Row[] | null) ?? [] };
    },
  });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['sowLib'] }); void qc.invalidateQueries({ queryKey: ['sowLibBody'] }); };
  const nextPos = (rows: Row[]) => (rows.length ? Math.max(...rows.map((r) => r.position || 0)) + 1 : 0);
  const rename = async (table: string, r: { id: string; name: string }, label: string) => {
    const n = await promptText(label, r.name); if (n === null) return;
    if (!n.trim()) { toast("Name can't be empty."); return; }
    toast(!(await db.from(table).update({ name: n.trim() } as never).eq('id', r.id).select('id')).data?.length ? 'Could not save — try again.' : 'Renamed'); refresh();
  };
  const del = async (table: string, id: string, q: string, done: string) => {
    if (!(await confirmAsk(q, 'Delete'))) return;
    toast(!(await db.from(table).delete().eq('id', id).select('id')).data?.length ? 'Could not delete — try again.' : done); if (table === 'sow_library_templates' && open === id) setOpen(null); refresh();
  };
  const addTask = async (tid: string, sectionId: string | null, name: string) => {
    toast((await db.from('sow_library_tasks').insert({ template_id: tid, name, position: nextPos(body?.tasks ?? []), ...(sectionId ? { section_id: sectionId } : {}) } as never)).error ? 'Could not save — try again.' : 'Task added'); refresh();
  };
  const taskRow = (tid: string, t: Row) => (
    <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginLeft: 10 }}>
      <Text style={{ flex: 1, color: base.ink }}>• {t.name}</Text>
      <Pressable hitSlop={6} onPress={() => void rename('sow_library_tasks', t, 'Task name')}><Text>✎</Text></Pressable>
      <Pressable hitSlop={6} onPress={() => void del('sow_library_tasks', t.id, 'Delete this task?', 'Task deleted')}><Text>🗑</Text></Pressable>
    </View>
  );
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Schedule of Works Library' }} />
      <Muted style={{ marginBottom: 10 }}>Reusable Schedule of Works templates for the whole company — build one once here, then pick it from any site&apos;s Schedule of Works &quot;+ → From Library&quot; to copy the whole structure in. Every copied line becomes an ordinary task on that job.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : tpls.length ? tpls.map((t) => (
        <Card key={t.id} style={{ padding: 0, overflow: 'hidden' }}>
          <Pressable onPress={() => setOpen(open === t.id ? null : t.id)} style={{ flexDirection: 'row', padding: 12 }}>
            <Text style={{ color: base.slate, width: 18 }}>{open === t.id ? '▼' : '▶'}</Text>
            <Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{t.name}</Text>
          </Pressable>
          {open === t.id && (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                <View style={{ flex: 1 }}><Button kind="ghost" title="✎ Rename" onPress={() => void rename('sow_library_templates', t, 'Template name')} /></View>
                <View style={{ flex: 1 }}><Button kind="ghost" title="🗑 Delete Template" onPress={() => void del('sow_library_templates', t.id, "Delete this library template? This can't be undone (sites that already used it keep their own copied tasks).", 'Template deleted')} /></View>
              </View>
              {!body ? <Muted>Loading…</Muted> : (
                <>
                  {body.secs.map((s) => (
                    <View key={s.id} style={{ borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 10, marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{s.name}</Text>
                        <Pressable hitSlop={6} onPress={() => void rename('sow_library_sections', s, 'Section name')}><Text>✎</Text></Pressable>
                        <Pressable hitSlop={6} onPress={() => void del('sow_library_sections', s.id, 'Delete this section? Its tasks in the library are deleted too.', 'Section deleted')}><Text>🗑</Text></Pressable>
                      </View>
                      {body.tasks.filter((x) => x.section_id === s.id).map((x) => taskRow(t.id, x))}
                      <AddLine placeholder="Add a task to this section" onAdd={(v) => addTask(t.id, s.id, v)} />
                    </View>
                  ))}
                  {body.tasks.filter((x) => !x.section_id).length > 0 && <Muted style={{ fontWeight: '700', marginTop: 4 }}>Tasks not in a section</Muted>}
                  {body.tasks.filter((x) => !x.section_id).map((x) => taskRow(t.id, x))}
                  <AddLine placeholder="Add a task (no section)" onAdd={(v) => addTask(t.id, null, v)} />
                  <AddLine placeholder="Add a section" onAdd={async (v) => { toast((await db.from('sow_library_sections').insert({ template_id: t.id, name: v, position: nextPos(body.secs) } as never)).error ? 'Could not save — try again.' : 'Section added'); refresh(); }} />
                </>
              )}
            </View>
          )}
        </Card>
      )) : <Empty>No library templates yet.</Empty>}
      <Button title="+ New Template" onPress={async () => {
        const n = await promptText('Template name', ''); if (n === null) return;
        if (!n.trim()) { toast('Enter a name.'); return; }
        const r = await db.from('sow_library_templates').insert({ org_id: me.org_id, name: n.trim(), created_by: me.id } as never).select('id').single();
        if (r.error || !r.data) { toast('Could not save — try again.'); return; }
        toast('Template created'); setOpen((r.data as { id: string }).id); refresh();
      }} />
    </ScrollView>
  );
}
