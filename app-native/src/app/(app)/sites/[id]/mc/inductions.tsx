// Site Inductions (550). Operatives: tick every item, emergency contact, then the
// health questionnaire (any Yes needs details) and sign — once; a manager deletes
// it if it needs redoing. Managers: Outstanding / Completed, view a signed PDF,
// delete one, and edit the company-wide induction questions.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { promptEmail } from '@/components/EmailPrompt';
import { StorageImage } from '@/components/StorageImage';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle, Toggle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { deleteCompletion, HEALTH_ITEMS, inductionItems, setInductionQuestions, submitInduction, useInductions } from '@/data/inductions';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { deliverPdf, emailPdf, exportFilename, fetchBytes, PDFDocument } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { isManager } from '@/lib/roles';
import { base, page as pageStyle, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Inductions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org, refresh: refreshAuth } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useInductions(id);
  const { data: people } = usePeople();
  const [tab, setTab] = useState<'outstanding' | 'completed'>('outstanding');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [qOpen, setQOpen] = useState(false);
  const [newQ, setNewQ] = useState('');
  const [ticks, setTicks] = useState<Record<number, boolean>>({});
  const [ename, setEname] = useState('');
  const [enum_, setEnum] = useState('');
  const [page, setPage] = useState(1);
  const [health, setHealth] = useState<Record<number, string>>({});
  const [details, setDetails] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const items = inductionItems(org);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['inductions', id] }); void qc.invalidateQueries({ queryKey: ['mcTiles', id] }); };
  const view = async (path: string | null) => { if (!path) { toast('PDF not available.'); return; } const u = await openDocLink('mc-documents', path); if (u) viewDoc(u); else toast('Could not open the PDF.'); };

  if (isManager(me) || me.role === 'client') {
    const mgr = isManager(me);
    const roster = data?.roster ?? [];
    const byOp = data?.byOp ?? {};
    const shown = tab === 'completed' ? roster.filter((u) => byOp[u]).sort((a, b) => byOp[b].completed_at.localeCompare(byOp[a].completed_at)) : roster.filter((u) => !byOp[u]);
    return (
      <ScrollView contentContainerStyle={pageStyle(720)} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Site Inductions' }} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {(['outstanding', 'completed'] as const).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: tab === k ? base.ink : base.line, backgroundColor: tab === k ? base.ink : base.card }}>
              <Text style={{ fontWeight: '700', color: tab === k ? '#fff' : base.ink }}>{k === 'outstanding' ? 'Outstanding' : 'Completed Inductions'}</Text>
            </Pressable>
          ))}
        </View>
        {mgr && tab === 'outstanding' && (
          <>
            <Toggle title="Induction Form" open={qOpen} onPress={() => setQOpen(!qOpen)} />
            {qOpen && (
              <Card>
                <Muted style={{ marginBottom: 8 }}>Every operative ticks each of these before signing. Add a question below and it applies to every site&apos;s induction form for your organisation straight away.</Muted>
                {items.map((q, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: base.line }}>
                    <Text style={{ flex: 1, color: base.ink }}>{i + 1}. {q}</Text>
                    {items.length > 1 && <Pressable onPress={async () => {
                      if (!(await confirmAsk("Remove this question from every site's induction form? Operatives who already completed their induction keep their existing signed PDF as-is.", 'Remove'))) return;
                      if (me.org_id && await setInductionQuestions(me.org_id, items.filter((_, j) => j !== i))) { toast('Removed'); await refreshAuth(); }
                    }}><Text>🗑</Text></Pressable>}
                  </View>
                ))}
                <TextInput value={newQ} onChangeText={setNewQ} placeholder="Add another question…" style={[box, { marginTop: 8 }]} />
                <Button kind="ghost" title="+ Add Question" onPress={async () => {
                  if (!newQ.trim()) { toast('Enter a question first.'); return; }
                  if (me.org_id && await setInductionQuestions(me.org_id, [...items, newQ.trim()])) { toast("Question added — now on every site's induction form"); setNewQ(''); await refreshAuth(); }
                }} />
              </Card>
            )}
          </>
        )}
        <Muted style={{ marginBottom: 8 }}>{roster.length} on the roster · {data?.total ?? 0} completed</Muted>
        {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((u) => {
          const c = byOp[u];
          return (
            <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
              {c && mgr && <Pressable hitSlop={8} onPress={() => setSel((x) => { const n = new Set(x); if (n.has(u)) n.delete(u); else n.add(u); return n; })}><Text style={{ fontSize: 18 }}>{sel.has(u) ? '☑' : '☐'}</Text></Pressable>}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{nameOf(people, u)}</Text>
                <Muted>{c ? `✓ Completed ${day(c.completed_at)}` : '○ Not yet completed'}</Muted>
              </View>
              {c && <Pressable onPress={() => void view(c.pdf_path)}><Text>👁</Text></Pressable>}
              {c && mgr && <Pressable hitSlop={8} onPress={async () => {
                const k = await chooseAction(nameOf(people, u), [{ key: 'view', label: '⬇️ View PDF' }, { key: 'del', label: "🗑 Delete — they'll need to redo it", danger: true }]);
                if (k === 'view') void view(c.pdf_path);
                else if (k === 'del' && await confirmAsk('Delete this completed induction? The operative will need to complete it again.', 'Delete') && await deleteCompletion(c.id)) { toast('Deleted — they can now redo their induction'); refresh(); }
              }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>}
            </View>
          );
        }) : <Empty>{tab === 'completed' ? 'No completed inductions yet.' : 'No outstanding operatives — everyone on the roster has completed their induction.'}</Empty>}
        {mgr && <Button kind="ghost" title="☁️ Link OneDrive inductions folder" onPress={() => router.push({ pathname: '/pm/onedrive-pick', params: { target: 'siteinductions', id: id } } as never)} />}
        {mgr && roster.some((u) => byOp[u]?.pdf_path) && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: space.m }}>
            {([['pdf', sel.size ? `📄 Export ${sel.size} selected` : '📄 Export all completed'], ['email', sel.size ? `✉ Email ${sel.size} selected` : '✉ Email all completed']] as const).map(([k, l]) => <View key={k} style={{ flex: 1 }}><Button kind="ghost" title={l} onPress={async () => {
              // The ticked inductions, or every completed one (550 exportSelectedInductions / emailSelectedInductions).
              const who = roster.filter((u) => byOp[u]?.pdf_path && (!sel.size || sel.has(u)));
              let to: Awaited<ReturnType<typeof promptEmail>> = null;
              if (k === 'email') { to = await promptEmail(`Email ${who.length} induction${who.length === 1 ? '' : 's'} to:`, { myEmail: me.email, clientEmail: site?.client_email }); if (!to) return; }
              const paths = who.map((u) => byOp[u]?.pdf_path).filter(Boolean) as string[];
              toast('Building PDF…');
              const merged = await PDFDocument.create(); let failed = 0;
              for (const p of paths) { try { const b = await fetchBytes(publicUrl('mc-documents', p)); if (!b) { failed++; continue; } const src = await PDFDocument.load(b, { ignoreEncryption: true }); (await merged.copyPages(src, src.getPageIndices())).forEach((pg) => merged.addPage(pg)); } catch { failed++; } }
              if (!merged.getPageCount()) { toast('Could not load the induction PDFs — check your connection and try again.'); return; }
              const name = exportFilename(site?.name || '', `Site Inductions (${paths.length - failed})`, 'pdf'), bytes = await merged.save();
              if (k === 'pdf') { if (!(await deliverPdf(bytes, name))) toast('Could not save the PDF.'); }
              else if (to) { const err = await emailPdf(bytes, name, `${id}/induction-exports`, { site_id: id, recipient_email: to.to, cc_email: to.cc, client_cc_email: to.clientCc, doc_title: `Site Inductions — ${site?.name || ''}` }); toast(err || `Emailed to ${to.to}`); if (!err) setSel(new Set()); }
              if (failed) toast(`${failed} induction PDF${failed === 1 ? '' : 's'} could not be included — check your connection.`);
            }} /></View>)}
          </View>
        )}
      </ScrollView>
    );
  }

  const mine = data?.byOp[me.id];
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (mine) {
    return (
      <ScrollView contentContainerStyle={pageStyle(720)}>
        <Stack.Screen options={{ title: 'Site Inductions' }} />
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 34 }}>✅</Text>
          <SectionTitle>Induction completed</SectionTitle>
          <Muted style={{ marginBottom: 12 }}>You completed this site&apos;s induction on {day(mine.completed_at)}.</Muted>
          <Button kind="ghost" title="View My Induction" onPress={() => void view(mine.pdf_path)} />
        </Card>
      </ScrollView>
    );
  }
  const allTicked = items.every((_, i) => ticks[i]);
  const healthDone = HEALTH_ITEMS.every((_, i) => health[i] === 'yes' || health[i] === 'no') && HEALTH_ITEMS.every((_, i) => health[i] !== 'yes' || (details[i] || '').trim());
  const sig = (me as { signature_path?: string | null }).signature_path;

  return (
    <ScrollView contentContainerStyle={pageStyle(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Site Inductions' }} />
      {page === 1 ? (
        <>
          <Muted style={{ marginBottom: 12 }}>Please read and confirm each item below, then continue to the health questionnaire to complete your site induction for {site.name}.</Muted>
          {items.map((t, i) => (
            <Pressable key={i} onPress={() => setTicks({ ...ticks, [i]: !ticks[i] })} style={{ flexDirection: 'row', gap: 8, padding: 12, borderWidth: 1, borderColor: ticks[i] ? base.ok : base.line, backgroundColor: ticks[i] ? base.okBg : base.card, borderRadius: radius.row, marginBottom: 8 }}>
              <Text style={{ fontSize: 18 }}>{ticks[i] ? '☑' : '☐'}</Text>
              <Text style={{ flex: 1, color: base.ink }}>{t}</Text>
            </Pressable>
          ))}
          <Card>
            <SectionTitle>Emergency Contact Details *</SectionTitle>
            <Muted style={{ marginBottom: 8 }}>Required before you can sign and complete this induction.</Muted>
            <TextInput value={ename} onChangeText={setEname} placeholder="Emergency contact name *" style={box} />
            <TextInput value={enum_} onChangeText={setEnum} keyboardType="phone-pad" placeholder="Emergency contact number *" style={box} />
          </Card>
          <Button title="Next: Health Questionnaire ›" onPress={() => {
            if (!allTicked) { toast('Tick every item first.'); return; }
            if (!ename.trim() || !enum_.trim()) { toast('Please enter an emergency contact name and number.'); return; }
            setPage(2);
          }} />
        </>
      ) : (
        <>
          <Muted style={{ marginBottom: 12 }}>Health Questionnaire for {site.name} — please answer every question. Any &quot;Yes&quot; needs a few details so we can keep you safe on site.</Muted>
          {HEALTH_ITEMS.map((it, i) => (
            <Card key={i}>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: base.slate }}>{it.category.toUpperCase()}</Text>
              <Text style={{ color: base.ink, marginVertical: 6 }}>{it.question}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['no', 'yes'].map((v) => (
                  <Pressable key={v} onPress={() => setHealth({ ...health, [i]: v })} style={{ flex: 1, alignItems: 'center', padding: 9, borderRadius: 8, borderWidth: 1, borderColor: health[i] === v ? base.ink : base.line, backgroundColor: health[i] === v ? base.ink : base.card }}>
                    <Text style={{ fontWeight: '700', color: health[i] === v ? '#fff' : base.ink }}>{v === 'yes' ? 'Yes' : 'No'}</Text>
                  </Pressable>
                ))}
              </View>
              {health[i] === 'yes' && <TextInput value={details[i] || ''} onChangeText={(t) => setDetails({ ...details, [i]: t })} multiline placeholder="Please give details *" style={[box, { marginTop: 8, minHeight: 56 }]} />}
            </Card>
          ))}
          <Card>
            <SectionTitle>Sign to confirm</SectionTitle>
            {sig ? (
              <Pressable disabled={!!busy} onPress={async () => {
                if (!healthDone) { toast(HEALTH_ITEMS.every((_, i) => health[i]) ? 'Please give details for every "Yes" answer on the health questionnaire.' : 'Please answer every health questionnaire question.'); return; }
                setBusy('Saving…');
                const err = await submitInduction(me, org, site, { emergencyName: ename.trim(), emergencyNumber: enum_.trim(), health, details }, setBusy);
                setBusy(null);
                if (err) { toast(err); return; }
                toast('Induction completed'); refresh();
              }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, borderRadius: radius.input, padding: 12, opacity: healthDone ? 1 : 0.6 }}>
                <StorageImage bucket="signatures" path={sig} style={{ height: 32, width: 140, resizeMode: 'contain' }} />
                <Text style={{ flex: 1, color: base.ink }}>{busy ?? (healthDone ? 'Tap to sign & complete induction' : 'Answer every health question first')}</Text>
              </Pressable>
            ) : (
              <>
                <Muted style={{ color: base.warn, marginBottom: 8 }}>Adopt your signature first — one tap and it&apos;s used everywhere.</Muted>
                <Button title="Adopt Your Signature" onPress={() => router.push('/signature')} />
              </>
            )}
          </Card>
          <Button kind="ghost" title="‹ Back" onPress={() => setPage(1)} />
        </>
      )}
    </ScrollView>
  );
}
