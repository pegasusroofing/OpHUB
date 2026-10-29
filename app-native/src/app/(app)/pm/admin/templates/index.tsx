// Admin Centre › Report Templates (260 reporttemplates, 420): the company's
// inspection / report / briefing templates — new, edit, duplicate, delete.
// Editing a template never changes reports already started from it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { uid } from '@/lib/rules/templates';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Tpl = { id: string; name: string; description: string | null; sections: unknown[] | null; is_daily_briefing: boolean | null; is_mc_inspection: boolean | null; is_loler_inspection: boolean | null };

export default function Templates() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['reportTplAdmin', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('report_templates').select('*').eq('org_id', me?.org_id as string).eq('archived', false).order('name')).data as Tpl[] | null) ?? [],
  });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['reportTplAdmin'] }); void qc.invalidateQueries({ queryKey: ['templates'] }); };
  const kind = (t: Tpl) => (t.is_daily_briefing ? 'Daily Briefing' : t.is_mc_inspection ? 'Main Contractor inspection' : t.is_loler_inspection ? 'LOLER inspection' : 'Report / survey');
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Report Templates' }} />
      <Muted style={{ marginBottom: 10 }}>Build reusable inspection / report templates here. Project Managers can fill these in on site and submit them as a report. Editing a template never changes inspections already started from it.</Muted>
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((t) => (
        <Pressable key={t.id} onPress={() => router.push(`/pm/admin/templates/${t.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          <Text style={{ fontSize: 20 }}>📋</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{t.name}</Text>
            <Muted>{(t.sections || []).length} section{(t.sections || []).length === 1 ? '' : 's'} · {kind(t)}</Muted>
          </View>
          <Pressable hitSlop={8} onPress={async () => {
            const k = await chooseAction(t.name, [{ key: 'edit', label: '✎ Edit' }, { key: 'dup', label: '⧉ Duplicate' }, { key: 'del', label: '🗑 Delete', danger: true }]);
            if (k === 'edit') router.push(`/pm/admin/templates/${t.id}` as never);
            else if (k === 'dup') { toast((await db.from('report_templates').insert({ org_id: me.org_id, name: `${t.name} (Copy)`, description: t.description, sections: t.sections, created_by: me.id } as never)).error ? 'Could not duplicate — try again.' : 'Template duplicated'); refresh(); }
            else if (k === 'del') {
              if (!(await confirmAsk(`Delete template "${t.name}"? Reports already submitted from it are kept.`, 'Delete'))) return;
              toast((await db.from('report_templates').delete().eq('id', t.id)).error ? 'Could not delete — try again.' : 'Template deleted'); refresh();
            }
          }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
        </Pressable>
      )) : <Empty>No templates yet — create your first one below.</Empty>}
      <Button title="+ New Template" onPress={async () => {
        const r = await db.from('report_templates').insert({ org_id: me.org_id, name: 'Untitled Template', created_by: me.id, sections: [{ id: uid(), title: 'Section 1', items: [] }] } as never).select('id').single();
        if (r.error || !r.data) { toast('Could not create — try again.'); return; }
        refresh(); router.push(`/pm/admin/templates/${(r.data as { id: string }).id}` as never);
      }} />
    </ScrollView>
  );
}
