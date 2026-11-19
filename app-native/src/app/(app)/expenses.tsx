// Expenses: send receipts to the office. Ported from renderExpenses (590).
// Its own page from the menu since 19 Nov 2026 (Andy: "an expenses button on the taskbar to left hand side below finance
// but above HR. this is for all users excl operatives ... remove it from anywhere else in the app. make sure we have to
// allocate it to a job on uploading and it gets issued to the finance for approval like we set previously"). Every set of
// receipts must be put against a job on the app (fuel too, with a tick); each receipt goes to Finance to book in
// (trigger zz_expense_to_finance, 7 Nov) and is emailed to the expenses address. /sites/<id>/expenses opens it with that job.
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { SelectBox } from '@/components/SelectBox';
import { Button, Card, Check, Empty, Field, Muted, Row, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { deleteExpense, expProblem, newGroup, saveExpenses, sendExpenses, useRecentExpenses, type ExpGroup, type ExpenseRow } from '@/data/expenses';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { pickPhotos } from '@/lib/photos';
import { canUseExpenses, isFullManager } from '@/lib/roles';
import { base, page, space } from '@/theme/theme';

export default function Expenses() {
  const { site: id } = useLocalSearchParams<{ site?: string }>();
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
  if (!me) return null;
  if (!canUseExpenses(me)) return <><Stack.Screen options={{ title: 'Expenses' }} /><Muted style={{ padding: space.l }}>Expenses aren&apos;t part of your login.</Muted></>;
  const toEmail = (org as unknown as { expenses_email?: string | null })?.expenses_email || '';
  const total = groups.reduce((n, g) => n + g.files.length, 0);
  const upd = (key: string, patch: Partial<ExpGroup>) => setGroups(groups.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const jobs: [string, string][] = sites.slice().sort((a, b) => a.name.localeCompare(b.name)).map((x) => [`site:${x.id}`, `${x.job_number ? `${x.job_number} · ` : ''}${x.name}`]);
  const rowLabel = (r: ExpenseRow) => (r.site_id ? `${sites.find((s) => s.id === r.site_id)?.name || 'Job'}${r.category === 'fuel' ? ` — Fuel${r.manual_label ? ` (${r.manual_label})` : ''}` : ''}` : r.category === 'fuel' ? `Fuel${r.manual_label ? ` — ${r.manual_label}` : ''}` : r.manual_label || 'Not on the app');

  const addPhotos = async (g: ExpGroup, source: 'camera' | 'library') => {
    const p = await pickPhotos(source);
    if ('error' in p) { showAlert(p.error); return; }
    upd(g.key, { files: [...g.files, ...p.map((x) => ({ name: 'receipt.jpg', uri: x.uri, isPdf: false, picked: x }))] });
  };
  // Photos of receipts or PDFs, several at once. On an iPhone the website's chooser is the phone's own: Take Photo,
  // Photo Library or Choose File. Photos are made smaller before they go, as from the camera.
  const addFiles = async (g: ExpGroup) => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
    if (r.canceled) return;
    const ok = r.assets.filter((a) => { if ((a.size || 0) > 15 * 1024 * 1024) { toast(`${a.name || 'That file'} is over 15MB — too big to send.`); return false; } return true; });
    const size = (uri: string) => new Promise<{ width: number; height: number } | null>((res) => Image.getSize(uri, (width, height) => res({ width, height }), () => res(null)));
    const files = await Promise.all(ok.map(async (a) => {
      const isPdf = /pdf/i.test(a.mimeType || '') || /\.pdf$/i.test(a.name || '');
      if (isPdf) return { name: a.name || 'receipt.pdf', uri: a.uri, isPdf: true, size: a.size };
      const d = await size(a.uri);
      return { name: 'receipt.jpg', uri: a.uri, isPdf: false, size: a.size, ...(d ? { picked: { uri: a.uri, ...d } } : {}) };
    }));
    setGroups((gs) => gs.map((x) => (x.key === g.key ? { ...x, files: [...x.files, ...files] } : x)));
  };
  // One Upload button (Andy, 19 Nov 2026: "remove the 3 buttons and have it as an upload button which is camera, photos
  // or files as normal"). In the phone apps, where the chooser is only files, it asks which first.
  const upload = async (g: ExpGroup) => {
    if (Platform.OS === 'web') { await addFiles(g); return; }
    const k = await chooseAction('Upload Receipt', [{ key: 'camera', label: '📷 Take Photo' }, { key: 'library', label: '🖼 Photo Library' }, { key: 'files', label: '📎 Files' }]);
    if (k === 'camera' || k === 'library') await addPhotos(g, k); else if (k === 'files') await addFiles(g);
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
    // No "done" message (Andy's rule): the receipts show straight away under Sent Receipts, marked ✓ Emailed.
    if (!sent.ok) toast(`Saved and sent to Finance, but the email did not send — ${sent.error} Use "Resend" below.`);
    void qc.invalidateQueries({ queryKey: ['expenses'] });
  };

  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Expenses' }} />
      <Card>
        <Text style={{ fontWeight: '600', color: base.ink }}>🧾 Send Receipts To The Office</Text>
        <Muted>Add a photo or file of each receipt and choose the job it&apos;s for. Each receipt goes to Finance to check and book in against that job.{toEmail ? ` It is also emailed on its own to ${toEmail}, labelled with the job.` : ''}</Muted>
      </Card>
      {groups.map((g, i) => (
        <Card key={g.key}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>Receipt{groups.length > 1 ? ` Group ${i + 1}` : 's'}</Text>
            {groups.length > 1 && <Pressable onPress={() => setGroups(groups.filter((x) => x.key !== g.key))}><Text style={{ color: base.red }}>Remove</Text></Pressable>}
          </View>
          <SelectBox label="Which Job Is This For?" title="Which Job Is This For?" placeholder="Choose The Job…" value={g.job || null} options={jobs} onChange={(k) => upd(g.key, { job: k })} />
          <Check label="This Is Fuel" value={g.fuel} onChange={(v) => upd(g.key, { fuel: v, manual: v ? g.manual : '' })} />
          {g.fuel && <Field label="Vehicle (Optional)" value={g.manual} maxLength={60} onChangeText={(v) => upd(g.key, { manual: v })} placeholder="e.g. Van reg AB12 CDE" />}
          <Field label="Note (Optional)" value={g.note} maxLength={300} onChangeText={(v) => upd(g.key, { note: v })} placeholder="What it was for, or the amount" />
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
          <Button kind="ghost" disabled={!!busy} title={g.files.length ? '📎 Upload Another Receipt' : '📎 Upload Receipt'} onPress={() => void upload(g)} />
        </Card>
      ))}
      {/* The page's buttons all full width and the same height (Andy, 19 Nov 2026: "the buttons need to be the same size"). */}
      <Button kind="ghost" disabled={!!busy} title="+ Add Receipts For Another Job" onPress={() => setGroups([...groups, newGroup(null)])} />
      <View style={{ marginVertical: 6 }}><Check label={`CC Me A Copy${me.email ? ` (${me.email})` : ''}`} value={ccMe} onChange={setCcMe} /></View>
      <Button disabled={!!busy || !total} busy={!!busy} title={busy || (total ? `Save & Send ${total} Receipt${total === 1 ? '' : 's'}` : 'Add A Receipt To Send')} onPress={save} />
      {/* A clear gap before the list (Andy, 19 Nov 2026: "the sent receipts sits too high"). */}
      <View style={{ height: 32 }} />

      <SectionTitle>Sent Receipts</SectionTitle>
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
                <Text style={{ color: r.emailed_at ? base.ok : base.warn, fontWeight: '600', marginVertical: 6 }}>{r.emailed_at ? `✓ Emailed${r.emailed_to ? ` to ${r.emailed_to}` : ''}` : 'Not emailed yet'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(r.file_paths || []).map((p, k) => (
                    <Button key={p} kind="ghost" title={`${/\.pdf$/i.test(p) ? '📄' : '🖼'} ${(r.file_names || [])[k] || 'Receipt'}`}
                      onPress={async () => { const u = await openDocLink('site-photos', p); if (u) viewDoc(u); }} />
                  ))}
                  {(r.created_by === me.id || full) && (
                    <Button kind="ghost" title={r.emailed_at ? '✉️ Resend' : '✉️ Send Now'} onPress={async () => {
                      if (!(await confirmAsk(`Email ${nf === 1 ? 'this receipt' : `these ${nf} receipts`} to the office${r.emailed_at ? ' again' : ''}?`, 'Send'))) return;
                      const s = await sendExpenses(r.emailed_at ? { batch_id: r.batch_id, expense_id: r.id, resend: true } : { batch_id: r.batch_id });
                      if (s.ok) showAlert(`✓ ${r.emailed_at ? 'Sent again' : 'Sent'}${s.to ? ` to ${s.to}` : ''}${(s.emails || 0) > 1 ? ` — ${s.emails} emails` : ''}.`); else toast(`Could not send — ${s.error}`);
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
