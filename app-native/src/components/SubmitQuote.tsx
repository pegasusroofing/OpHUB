// Send & submit: the estimator's last step. Says how the quote went out, the value and the date, and Submit marks it
// sent, starts the chaser's clock and files its OneDrive folder in that year's Estimating folder.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DateBox, todayIso } from '@/components/DateField';
import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Field, Muted, SectionTitle } from '@/components/ui';
import type { OdItem } from '@/data/drawings';
import { quotationFiles, sendQuote, submitQuote, type Quote } from '@/data/quotes';
import { useAuth } from '@/lib/auth';
import { base, radius } from '@/theme/theme';

const EMAIL_OK = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export function SubmitQuote({ q, firstDays, onDone }: { q: Quote; firstDays: number; onDone: () => void }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [how, setHow] = useState<'self' | 'app'>('self');
  const [value, setValue] = useState(q.value == null ? '' : String(q.value));
  const [profit, setProfit] = useState(q.profit_pct == null ? '' : String(Math.round(q.profit_pct * 1000) / 10));
  const [sent, setSent] = useState(todayIso());
  const [to, setTo] = useState(q.contact_email ?? '');
  const [subject, setSubject] = useState(`Quotation for ${q.title}`);
  const [body, setBody] = useState(`Hi ${q.contact_name || 'there'},\n\nPlease find attached our quotation for ${q.title}.\n\nIf you have any questions, please let me know.\n\nKind regards,\n${me?.name ?? ''}\n${org?.name ?? ''}`);
  const [files, setFiles] = useState<OdItem[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (how !== 'app' || files || !q.folder_id) return;
    void quotationFiles({ id: q.folder_id, driveId: q.folder_drive_id }).then((r) => { setFiles(r.files); setFileError(r.error ?? ''); setTicked(new Set(r.files.filter((f) => !/template/i.test(f.name)).map((f) => f.id))); });
  }, [how, files, q.folder_id, q.folder_drive_id]);
  if (!me) return null;
  if (!open) return <View style={{ marginBottom: 12 }}><Button title="📨 Send & submit" onPress={() => setOpen(true)} /></View>;

  const submit = async () => {
    const val = Number(value.replace(/[£,\s]/g, '')), pct = profit.trim() ? Number(profit.replace(/[%\s]/g, '')) : null;
    if (!value.trim() || !isFinite(val) || val <= 0) { toast('What’s the value of the quote?'); return; }
    if (pct != null && !isFinite(pct)) { toast('Profit needs to be a number.'); return; }
    if (!sent) { toast('What date did it go out?'); return; }
    const chosen = (files ?? []).filter((f) => ticked.has(f.id));
    if (how === 'app') {
      if (!EMAIL_OK.test(to.trim())) { toast('Who is it going to? That email address doesn’t look right.'); return; }
      if (!chosen.length) { toast('Tick the files to send.'); return; }
    }
    const year = sent.slice(0, 4);
    const ask = `${how === 'app' ? `Email ${chosen.length} file${chosen.length === 1 ? '' : 's'} to ${to.trim()}, mark` : 'Mark'} this quote as sent${q.folder_id ? `, and move its folder to Estimating ${year}` : ''}?`;
    if (!(await confirmAsk(ask, 'Submit'))) return;
    if (how === 'app') {
      setBusy('Sending…');
      const r = await sendQuote(q.id, { to: to.trim(), subject, body, files: chosen.map((f) => ({ id: f.id, driveId: f.driveId, name: f.name })) });
      if (r.error) { setBusy(''); showAlert(`It hasn’t gone: ${r.error}`); return; }
    }
    setBusy('Filing…');
    const out = await submitQuote(me, q, { value: val, profit: pct == null ? null : pct / 100, sent }, firstDays);
    setBusy('');
    if (out.error) { showAlert(out.error); return; }
    if (out.note.startsWith('It’s')) showAlert(out.note); else toast(out.note ? `Submitted. ${out.note}.` : 'Submitted');
    onDone();
  };
  const choice = (k: 'self' | 'app', label: string) => (
    <Pressable onPress={() => setHow(k)} style={{ flex: 1, alignItems: 'center', padding: 9, borderRadius: radius.input, borderWidth: 1, borderColor: how === k ? base.ink : base.line, backgroundColor: how === k ? base.ink : base.card }}>
      <Text style={{ fontWeight: '700', fontSize: 13, color: how === k ? '#fff' : base.ink }}>{label}</Text>
    </Pressable>
  );
  return (
    <Card>
      <SectionTitle>Send & submit</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {choice('self', 'I’ve emailed it')}
        {choice('app', 'Send it from here')}
      </View>
      <Field label="Value £ *" value={value} onChangeText={setValue} keyboardType="decimal-pad" />
      <Field label="Profit %" value={profit} onChangeText={setProfit} keyboardType="decimal-pad" />
      <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Date sent *</Muted>
      <DateBox value={sent} onChange={setSent} max={todayIso()} clearable={false} title="Date sent" style={{ marginBottom: 10 }} />
      {how === 'app' && (
        <>
          <Field label="Send to *" value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Subject" value={subject} onChangeText={setSubject} />
          <Field label="Message" value={body} onChangeText={setBody} multiline />
          <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Attach from the Quotation folder</Muted>
          {!q.folder_id ? <Muted style={{ marginBottom: 8 }}>This quote has no folder, so there’s nothing to attach. Make the folder below first, or email it yourself.</Muted>
            : !files ? <Muted style={{ marginBottom: 8 }}>Loading from OneDrive…</Muted>
            : fileError ? <Muted style={{ color: base.warn, marginBottom: 8 }}>{fileError}</Muted>
            : !files.length ? <Muted style={{ marginBottom: 8 }}>Nothing in the Quotation folder yet.</Muted>
            : files.map((f) => <Check key={f.id} label={f.name} value={ticked.has(f.id)} onChange={(on) => { const n = new Set(ticked); if (on) n.add(f.id); else n.delete(f.id); setTicked(n); }} />)}
          <Muted style={{ marginBottom: 8 }}>You’re copied in, and replies come to you.</Muted>
        </>
      )}
      <Button busy={!!busy} title={busy || 'Submit'} onPress={() => void submit()} />
      <View style={{ marginTop: 6 }}><Button kind="ghost" title="Cancel" onPress={() => setOpen(false)} /></View>
    </Card>
  );
}
