// One job RAMS document's signature boxes (600, document mode): mark them by
// hand, apply a signing template, save these boxes as a new template, or
// remove them (signatures then go on the summary page at the end).
// A Risk Assessment and Method Statement made together in the builder: saving one asks whether to add the same people
// to the other, then opens it with those people to tap into place (?from=<the first one>) (Andy, 14 Nov 2026).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { SignBoxEditor } from '@/components/SignBoxEditor';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { boxesOf, layoutSummary, ramsPartner, saveAsTemplate, saveDocBoxes, signersOf, useSignTemplates } from '@/data/signTemplates';
import { whoLabel } from '@/lib/rules/signBoxes';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import type { SignLayout } from '@/lib/signedPdf';
import { supabase } from '@/lib/supabase';
import { page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export default function DocBoxes() {
  const { id, doc, from } = useLocalSearchParams<{ id: string; doc: string; from?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: d, isLoading } = useQuery({ queryKey: ['ramsDocBoxes', doc], enabled: !!doc, gcTime: 0, queryFn: async () => (await db.from('rams_docs').select('id,name,storage_path,sign_layout').eq('id', doc).maybeSingle()).data as { id: string; name: string; storage_path: string; sign_layout: SignLayout } | null });
  const { data: tpls = [] } = useSignTemplates(!!me);
  // The other half's boxes, when this page was opened from it.
  const { data: src, isLoading: srcLoading } = useQuery({ queryKey: ['ramsDocBoxesFrom', from], enabled: !!from, gcTime: 0, staleTime: 0, queryFn: async () => (await db.from('rams_docs').select('id,name,doc_type,sign_layout').eq('id', from as string).maybeSingle()).data as { id: string; name: string; doc_type: string | null; sign_layout: SignLayout } | null });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (isLoading || (!!from && srcLoading)) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!d) return <Muted style={{ padding: space.l }}>Document not found.</Muted>;
  const usable = tpls.filter((t) => boxesOf(t.layout).length);
  const done = (msg: string) => { toast(msg); void qc.invalidateQueries({ queryKey: ['hsDocs', 'rams', id] }); router.back(); };
  const have = new Set(boxesOf(d.sign_layout).map((b) => b.w));
  const place = src ? boxesOf(src.sign_layout).filter((b) => !have.has(b.w)) : [];
  const srcLabel = src ? (src.doc_type === 'Method Statement' || /^Method Statement/.test(src.name) ? 'Method Statement' : 'Risk Assessment') : '';
  const save = async (boxes: ReturnType<typeof boxesOf>) => {
    if (!(await saveDocBoxes(d.id, boxes))) { toast('Could not save — please try again.'); return; }
    // Made together with a Method Statement (or Risk Assessment)? Offer the same people on that one.
    const other = !from && boxes.length ? await ramsPartner(d.id) : null;
    const missing = other ? signersOf(boxes).filter((w) => !other.boxes.some((b) => b.w === w)) : [];
    if (other && missing.length && (await confirmAsk(`Add the same people to the ${other.label}?

${missing.map((w) => whoLabel(w)).join(', ')}

You then tap where each one signs on it.`, 'Yes', 'No'))) {
      void qc.invalidateQueries({ queryKey: ['hsDocs', 'rams', id] });
      router.replace(`/sites/${id}/hs/rams/boxes/${other.id}?from=${d.id}` as never);
      return;
    }
    done(boxes.length ? 'Signature boxes saved' : 'Signature boxes removed');
  };
  return (
    <ScrollView contentContainerStyle={page(900)}>
      <Stack.Screen options={{ title: 'Signature Boxes' }} />
      <SignBoxEditor key={`${d.id}:${from || ''}`} storagePath={d.storage_path} initial={JSON.parse(JSON.stringify(boxesOf(d.sign_layout)))} saveLabel="Save signature boxes"
        place={place} placeFrom={srcLabel}
        intro={src ? `${d.name} — the same people as the ${srcLabel}. Tap where each one signs on this document, check the boxes, then Save.` : `${d.name} — mark every place someone signs in this document. Operatives fill Operative 1, 2, 3… in the order they sign; the Project Manager box takes whoever issued it; the Client box takes the client's emailed-link signature.`}
        onSave={save}
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
