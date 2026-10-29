// One job RAMS document's signature boxes (600, document mode): mark them by
// hand, apply a signing template, save these boxes as a new template, or
// remove them (signatures then go on the summary page at the end).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { SignBoxEditor } from '@/components/SignBoxEditor';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { boxesOf, layoutSummary, saveAsTemplate, saveDocBoxes, useSignTemplates } from '@/data/signTemplates';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import type { SignLayout } from '@/lib/signedPdf';
import { supabase } from '@/lib/supabase';
import { page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export default function DocBoxes() {
  const { id, doc } = useLocalSearchParams<{ id: string; doc: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: d, isLoading } = useQuery({ queryKey: ['ramsDocBoxes', doc], enabled: !!doc, gcTime: 0, queryFn: async () => (await db.from('rams_docs').select('id,name,storage_path,sign_layout').eq('id', doc).maybeSingle()).data as { id: string; name: string; storage_path: string; sign_layout: SignLayout } | null });
  const { data: tpls = [] } = useSignTemplates(!!me);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!d) return <Muted style={{ padding: space.l }}>Document not found.</Muted>;
  const usable = tpls.filter((t) => boxesOf(t.layout).length);
  const done = (msg: string) => { toast(msg); void qc.invalidateQueries({ queryKey: ['hsDocs', 'rams', id] }); router.back(); };
  return (
    <ScrollView contentContainerStyle={page(900)}>
      <Stack.Screen options={{ title: 'Signature Boxes' }} />
      <SignBoxEditor storagePath={d.storage_path} initial={JSON.parse(JSON.stringify(boxesOf(d.sign_layout)))} saveLabel="Save signature boxes"
        intro={`${d.name} — mark every place someone signs in this document. Operatives fill Operative 1, 2, 3… in the order they sign; the Project Manager box takes whoever issued it; the Client box takes the client's emailed-link signature.`}
        onSave={async (boxes) => { if (await saveDocBoxes(d.id, boxes)) done(boxes.length ? 'Signature boxes saved' : 'Signature boxes removed'); else toast('Could not save — please try again.'); }}
        extra={({ boxes, numPages, setBoxes }) => (
          <View style={{ gap: 8, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button kind="ghost" disabled={!boxes.length} title="Save as template" onPress={async () => {
                const n = await promptText('Name this template (e.g. "Hyde RAMS form"):', ''); if (!n || !n.trim()) return;
                toast((await saveAsTemplate(n.trim(), boxes, numPages, d.storage_path)) ? 'Template saved' : 'Could not save'); void qc.invalidateQueries({ queryKey: ['signTemplates'] });
              }} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" disabled={!usable.length} title="Use a template" onPress={async () => {
                const k = await chooseAction('Use a template', usable.map((t) => ({ key: t.id, label: `${t.name} · ${layoutSummary(t.layout)}` }))); if (!k) return;
                const all = JSON.parse(JSON.stringify(boxesOf(usable.find((t) => t.id === k)!.layout))) as ReturnType<typeof boxesOf>;
                const fit = all.filter((b) => !numPages || b.p <= numPages);
                setBoxes(fit);
                toast(fit.length < all.length ? `${all.length - fit.length} box(es) left out — this document has fewer pages.` : 'Template applied — check the boxes line up, then Save.');
              }} /></View>
            </View>
            {!!d.sign_layout && <Button kind="ghost" title="Remove all boxes from this document" onPress={async () => {
              if (!(await confirmAsk('Remove all signature boxes from this document? Signatures will go back to the summary page at the end.', 'Remove'))) return;
              if (await saveDocBoxes(d.id, [])) done('Signature boxes removed'); else toast('Could not save — please try again.');
            }} />}
            <Muted>Tip: set your standard forms up once in Admin Centre → Signing Templates, then just pick the template when you upload.</Muted>
          </View>
        )} />
    </ScrollView>
  );
}
