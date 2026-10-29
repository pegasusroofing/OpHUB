// Expenses: send receipts to the office. Ported from renderExpenses (590).
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Field, Muted, Row, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { deleteExpense, expProblem, newGroup, saveExpenses, sendExpenses, useRecentExpenses, type ExpGroup, type ExpenseRow } from '@/data/expenses';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import { isFullManager } from '@/lib/roles';
import { base, page, space } from '@/theme/theme';

export default function Expenses() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data: people } = usePeople();
  const full = isFullManager(me);
  const { data: recent } = useRecentExpenses(org, full);
  const [groups, setGroups] = useState<ExpGroup[]>([newGroup(id)]);
  const [ccMe, setCcMe] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pickJobFor, setPickJobFor] = useState<string | null>(null);
  if (!me) return null;
  const toEmail = (org as unknown as { expenses_email?: string | null })?.expenses_email || '';
  const total = groups.reduce((n, g) => n + g.files.length, 0);
  const upd = (key: string, patch: Partial<ExpGroup>) => setGroups(groups.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const jobLabel = (g: ExpGroup) => (g.job === 'fuel' ? '⛽ Fuel' : g.job === 'manual' ? '✏️ A job not on the app' : sites.find((s) => `site:${s.id}` === g.job)?.name || 'Choose a job…');
  const rowLabel = (r: ExpenseRow) => (r.site_id ? sites.find((s) => s.id === r.site_id)?.name || 'Job' : r.category === 'fuel' ? `Fuel${r.manual_label ? ` — ${r.manual_label}` : ''}` : r.manual_label || 'Not on the app');

  const addPhotos = async (g: ExpGroup, source: 'camera' | 'library') => {
    const p = await pickPhotos(source);
    if ('error' in p) { showAlert(p.error); return; }
    upd(g.key, { files: [...g.files, ...p.map((x) => ({ name: 'receipt.jpg', uri: x.uri, isPdf: false, picked: x }))] });
  };
  const addPdf = async (g: ExpGroup) => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true });
    if (r.canceled) return;
    const ok = r.assets.filter((a) => { if ((a.size || 0) > 15 * 1024 * 1024) { toast(`${a.name || 'That file'} is over 15MB — too big to send.`); return false; } return true; });
    upd(g.key, { files: [...g.files, ...ok.map((a) => ({ name: a.name || 'receipt.pdf', uri: a.uri, isPdf: true, size: a.size }))] });
  };
  const save = async () => {
    const p = expProblem(groups);
    if (p) { toast(p); return; }
    setBusy('Uploading…');
    const r = await saveExpenses(me, groups, setBusy);
    if ('error' in r) { setBusy(null); toast(r.error); return; }
    setBusy('Sending email…');
    const sent = await sendExpenses({ batch_id: r.batchId, cc_me: ccMe });
    setBusy(null);
    setGroups([newGroup(id)]); setCcMe(false);
    if (sent.ok) {
      const n = sent.emails || 0;
      showAlert(`✓ ${n ? `${n} receipt${n === 1 ? '' : 's'} saved and emailed${n > 1 ? ' — one email each' : ''}` : 'Receipts saved and emailed'}${sent.to ? `, to ${sent.to}` : ''}${ccMe && me.email ? ', with a copy to you' : ''}.`);
    } else toast(`Saved, but the email did not send — ${sent.error} Use "Resend" below.`);
    void qc.invalidateQueries({ queryKey: ['expenses'] });
  };

  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Expenses' }} />
      <Card>
        <Text style={{ fontWeight: '700', color: base.ink }}>🧾 Send receipts to the office</Text>
        <Muted>Add a photo or file of each receipt and say which job it's for.{toEmail ? ` When you save, each receipt is emailed on its own to ${toEmail}, labelled with the job.` : ' No expenses email is set up yet — receipts are saved and the office can see them here.'}</Muted>
      </Card>
      {groups.map((g, i) => (
        <Card key={g.key}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>Receipt{groups.length > 1 ? ` group ${i + 1}` : 's'}</Text>
            {groups.length > 1 && <Pressable onPress={() => setGroups(groups.filter((x) => x.key !== g.key))}><Text style={{ color: base.red }}>Remove</Text></Pressable>}
          </View>
          <Muted style={{ fontWeight: '700' }}>Which job is this for?</Muted>
          <Row title={jobLabel(g)} onPress={() => setPickJobFor(pickJobFor === g.key ? null : g.key)} />
          {pickJobFor === g.key && (
            <View style={{ marginBottom: 8 }}>
              {sites.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                <Pressable key={s.id} onPress={() => { upd(g.key, { job: `site:${s.id}`, manual: '' }); setPickJobFor(null); }} style={{ paddingVertical: 8 }}><Text style={{ color: base.ink }}>{s.name}</Text></Pressable>
              ))}
              <Pressable onPress={() => { upd(g.key, { job: 'fuel' }); setPickJobFor(null); }} style={{ paddingVertical: 8 }}><Text style={{ color: base.ink }}>⛽ Fuel</Text></Pressable>
              <Pressable onPress={() => { upd(g.key, { job: 'manual' }); setPickJobFor(null); }} style={{ paddingVertical: 8 }}><Text style={{ color: base.ink }}>✏️ A job not on the app (type it in)</Text></Pressable>
            </View>
          )}
          {g.job === 'manual' && <Field label="Job name / address" value={g.manual} maxLength={120} onChangeText={(v) => upd(g.key, { manual: v })} placeholder="e.g. 14 High St" />}
          {g.job === 'fuel' && <Field label="Vehicle (optional)" value={g.manual} maxLength={60} onChangeText={(v) => upd(g.key, { manual: v })} placeholder="e.g. Van reg AB12 CDE" />}
          <Field label="Note (optional)" value={g.note} maxLength={300} onChangeText={(v) => upd(g.key, { note: v })} placeholder="What it was for, or the amount" />
          {g.files.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
              {g.files.map((f, k) => (
                <Pressable key={`${f.uri}-${k}`} onPress={() => upd(g.key, { files: g.files.filter((_, j) => j !== k) })}
                  style={{ width: 64, height: 64, borderWidth: 1, borderColor: base.line, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: base.paper }}>
                  {f.isPdf ? <Text style={{ fontSize: 10, textAlign: 'center' }}>📄{'\n'}{f.name.slice(0, 14)}</Text> : <Image source={{ uri: f.uri }} style={{ width: 64, height: 64 }} />}
                </Pressable>
              ))}
            </View>
          )}
          {g.files.length > 0 && <Muted style={{ marginBottom: 4 }}>Tap a receipt to remove it.</Muted>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button kind="ghost" disabled={!!busy} title="📷 Take photo" onPress={() => addPhotos(g, 'camera')} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" disabled={!!busy} title="🖼 Photos" onPress={() => addPhotos(g, 'library')} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" disabled={!!busy} title="📎 PDF" onPress={() => addPdf(g)} /></View>
          </View>
        </Card>
      ))}
      <Button kind="ghost" disabled={!!busy} title="+ Add receipts for another job" onPress={() => setGroups([...groups, newGroup(null)])} />
      <Check label={`CC me a copy${me.email ? ` (${me.email})` : ''}`} value={ccMe} onChange={setCcMe} />
      <Button disabled={!!busy || !total} busy={!!busy} title={busy || (total ? `Save & send ${total} receipt${total === 1 ? '' : 's'}` : 'Add a receipt to send')} onPress={save} />

      <SectionTitle>Sent receipts</SectionTitle>
      <Muted style={{ marginBottom: 8 }}>Kept for {recent?.months ?? 3} months, then deleted automatically.</Muted>
      {recent?.rows.length ? recent.rows.map((r) => {
        const isOpen = open.has(r.id);
        const nf = (r.file_paths || []).length;
        return (
          <View key={r.id}>
            <Row title={rowLabel(r)} sub={`${new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · ${nf} file${nf === 1 ? '' : 's'} · ${r.emailed_at ? '✓ Emailed' : 'Not emailed yet'}`}
              onPress={() => { const n = new Set(open); if (isOpen) n.delete(r.id); else n.add(r.id); setOpen(n); }} />
            {isOpen && (
              <Card>
                {!!r.note && <Muted>{r.note}</Muted>}
                {full && r.created_by !== me.id && <Muted>Sent by {nameOf(people, r.created_by)}</Muted>}
                <Text style={{ color: r.emailed_at ? base.ok : base.warn, fontWeight: '700', marginVertical: 6 }}>{r.emailed_at ? `✓ Emailed${r.emailed_to ? ` to ${r.emailed_to}` : ''}` : 'Not emailed yet'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(r.file_paths || []).map((p, k) => (
                    <Button key={p} kind="ghost" title={`${/\.pdf$/i.test(p) ? '📄' : '🖼'} ${(r.file_names || [])[k] || 'Receipt'}`}
                      onPress={async () => { const u = await openDocLink('site-photos', p); if (u) viewDoc(u); }} />
                  ))}
                  {(r.created_by === me.id || full) && (
                    <Button kind="ghost" title="✉️ Resend" onPress={async () => {
                      if (!(await confirmAsk(`Email ${nf === 1 ? 'this receipt' : `these ${nf} receipts`} to the office again?`, 'Send'))) return;
                      const s = await sendExpenses({ batch_id: r.batch_id, expense_id: r.id, resend: true });
                      if (s.ok) showAlert(`✓ Sent again${s.to ? ` to ${s.to}` : ''}${(s.emails || 0) > 1 ? ` — ${s.emails} emails` : ''}.`); else toast(`Could not send — ${s.error}`);
                      void qc.invalidateQueries({ queryKey: ['expenses'] });
                    }} />
                  )}
                  {full && (
                    <Button kind="ghost" title="🗑 Delete" onPress={async () => {
                      if (!(await confirmAsk("Delete this expense entry? This removes it from the app only — any email already sent to the office stays sent. This can't be undone.", 'Delete'))) return;
                      toast((await deleteExpense(r.id)) ? 'Expense deleted' : 'Could not delete — only a Project Manager or Admin can.');
                      void qc.invalidateQueries({ queryKey: ['expenses'] });
                    }} />
                  )}
                </View>
              </Card>
            )}
          </View>
        );
      }) : <Empty>Nothing sent in the last {recent?.months ?? 3} months.</Empty>}
    </ScrollView>
  );
}
