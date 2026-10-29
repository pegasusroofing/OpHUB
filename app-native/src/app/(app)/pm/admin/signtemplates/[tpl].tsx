// A signing template's boxes (600, template mode): marked on its sample document.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { SignBoxEditor } from '@/components/SignBoxEditor';
import { useToast } from '@/components/toast';
import { Muted } from '@/components/ui';
import { boxesOf, loadTemplate, saveTemplateBoxes } from '@/data/signTemplates';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function TemplateBoxes() {
  const { tpl } = useLocalSearchParams<{ tpl: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: tp, isLoading } = useQuery({ queryKey: ['signTemplate', tpl], enabled: !!tpl, gcTime: 0, queryFn: () => loadTemplate(tpl) });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!tp) return <Muted style={{ padding: space.l }}>Template not found.</Muted>;
  if (!tp.storage_path) return <Muted style={{ padding: space.l }}>This template has no sample document to show.</Muted>;
  return (
    <ScrollView contentContainerStyle={page(900)}>
      <Stack.Screen options={{ title: 'Template Boxes' }} />
      <SignBoxEditor storagePath={tp.storage_path} initial={JSON.parse(JSON.stringify(boxesOf(tp.layout)))} saveLabel="Save template"
        intro={`${tp.name} — this is the template's sample document. Mark every place someone signs. Any document you later upload with this template gets the same boxes in the same places. Set up as many operatives as the form has room for; spare boxes just stay empty.`}
        onSave={async (boxes, pages) => {
          if (!(await saveTemplateBoxes(tp.id, boxes, pages))) { toast('Could not save — please try again.'); return; }
          toast('Template saved'); void qc.invalidateQueries({ queryKey: ['signTemplates'] }); router.back();
        }} />
    </ScrollView>
  );
}
