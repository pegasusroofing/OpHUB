// Submit Quotation (Andy, 11 Nov 2026), at the bottom of a tender. Tick the documents to send, from any of its folders;
// put in the contract value and the mark-up (that becomes the quote's profit mark-up); who priced it is whoever's
// submitting unless changed. Next, the email: To, the company's preset CC (on unless switched off), subject and message.
// Sending marks it Quoted (Returned), starts the chaser's clock and files its folder in that year's Estimating folder.
// "I've Emailed It Myself" does the same without the email.
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DateBox, todayIso } from '@/components/DateField';
import { YesNo } from '@/components/OneDriveSettings';
import { Pop } from '@/components/Pop';
import { QBox, QPick } from '@/components/QuoteForm';
import { useQuoteFiles } from '@/components/QuoteDocs';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { sendQuote, submitQuote, type Quote } from '@/data/quotes';
import { useAuth } from '@/lib/auth';
import { base, radius, space } from '@/theme/theme';

const EMAIL_OK = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export function SubmitQuote({ q, firstDays, cc, people, onDone, onClose }: { q: Quote; firstDays: number; cc: string | null; people: { id: string; name: string | null }[]; onDone: (note: string) => void; onClose: () => void }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [value, setValue] = useState(q.value == null ? '' : String(q.value));
  const [markup, setMarkup] = useState(q.profit_pct != null ? String(Math.round(q.profit_pct * 1000) / 10) : q.guide_markup_pct != null ? String(q.guide_markup_pct) : '');
  const [by, setBy] = useState<{ id: string; name: string | null } | null>(me ? { id: me.id, name: me.name } : null);
  const [sent, setSent] = useState(todayIso());
  const [to, setTo] = useState(q.contact_email ?? '');
  const [useCc, setUseCc] = useState(!!cc);
  const [subject, setSubject] = useState(`Quotation For ${q.title}`);
  const [body, setBody] = useState(`Hi ${q.contact_name || 'there'},\n\nPlease find attached our quotation for ${q.title}.\n\nIf you have any questions, please let me know.\n\nKind regards,\n${me?.name ?? ''}\n${org?.name ?? ''}`);
  const { groups, error } = useQuoteFiles(q.folder_id ? { id: q.folder_id, driveId: q.folder_drive_id } : null);
  const [ticked, setTicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState('');
  // The finished quote is usually in the Quotation folder: those start ticked (not a template).
  useEffect(() => {
    if (!groups || ticked) return;
    setTicked(new Set(groups.filter((g) => /quot/i.test(g.folder)).flatMap((g) => g.files).filter((f) => !/template/i.test(f.name)).map((f) => f.id)));
  }, [groups, ticked]);
  if (!me) return null;
  const files = (groups ?? []).flatMap((g) => g.files.map((f) => ({ ...f, driveId: f.driveId || g.driveId }))).filter((f) => ticked?.has(f.id));

  const figures = () => {
    const val = Number(value.replace(/[£,\s]/g, '')), pct = markup.trim() ? Number(markup.replace(/[%\s]/g, '')) : null;
    if (!value.trim() || !isFinite(val) || val <= 0) { toast('What’s the contract value?'); return null; }
    if (pct != null && !isFinite(pct)) { toast('The mark-up needs to be a number.'); return null; }
    if (!sent) { toast('What date did it go out?'); return null; }
    // A chase date already set on the tender (and still ahead) is kept; otherwise the chaser counts from the date sent.
    return { value: val, profit: pct == null ? null : pct / 100, sent, pricedBy: by, chaseDate: q.chase_on && q.next_chase_date && q.next_chase_date > sent ? q.next_chase_date : undefined };
  };
  const finish = async (emailed: boolean) => {
    const f = figures(); if (!f) return;
    if (emailed) {
      if (!EMAIL_OK.test(to.trim())) { toast('Who is it going to? That email address doesn’t look right.'); return; }
      if (!files.length) { toast('Tick the documents to send.'); return; }
    }
    const year = sent.slice(0, 4);
    const ask = `${emailed ? `Email ${files.length} document${files.length === 1 ? '' : 's'} to ${to.trim()}${useCc && cc ? ` (copy to ${cc})` : ''}, and mark` : 'Mark'} this quote as sent${q.folder_id ? `? Its folder moves to Estimating ${year}.` : '?'}`;
    if (!(await confirmAsk(ask, emailed ? 'Send' : 'Yes', 'No'))) return;
    if (emailed) {
      setBusy('Sending…');
      const r = await sendQuote(q.id, { to: to.trim(), cc: useCc && cc ? [cc] : [], subject, body, files: files.map((x) => ({ id: x.id, driveId: x.driveId, name: x.name })) });
      if (r.error) { setBusy(''); showAlert(`It hasn’t gone: ${r.error}`); return; }
    }
    setBusy('Filing…');
    const out = await submitQuote(me, q, f, firstDays);
    setBusy('');
    if (out.error) { showAlert(out.error); return; }
    if (out.note.startsWith('It’s')) showAlert(out.note);
    onDone(out.note);
  };
  const tick = (id: string) => { const n = new Set(ticked ?? []); if (n.has(id)) n.delete(id); else n.add(id); setTicked(n); };
  const lab = { fontSize: 12, fontWeight: '600' as const, color: base.slate, marginBottom: 4 };

  return (
    <Pop title={step === 1 ? 'Submit Quotation' : 'The Email'} onClose={onClose} footer={(
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {step === 1 ? (
          <>
            <Button title="Next: The Email ›" onPress={() => { if (figures()) setStep(2); }} />
            <Button kind="ghost" busy={!!busy} title={busy || 'I’ve Emailed It Myself'} onPress={() => void finish(false)} />
          </>
        ) : (
          <>
            <Button busy={!!busy} title={busy || 'Send And Submit'} onPress={() => void finish(true)} />
            <Button kind="ghost" title="‹ Back" onPress={() => setStep(1)} />
          </>
        )}
      </View>
    )}>
      {step === 1 ? (
        <>
          <Text style={lab}>Documents To Send (Tick Any, From Any Folder)</Text>
          {!q.folder_id ? <Muted style={{ marginBottom: 8 }}>This tender has no OneDrive folder, so there’s nothing to attach. Make the folder first, or email it yourself.</Muted>
            : !groups ? <Muted style={{ marginBottom: 8 }}>Loading from OneDrive…</Muted>
              : error ? <Muted style={{ color: base.warn, marginBottom: 8 }}>{error}</Muted>
                : groups.map((g) => (
                  <View key={g.id} style={{ marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: base.ink, paddingVertical: 4 }}>📁 {g.folder}</Text>
                    {g.files.length ? g.files.map((f) => (
                      <Pressable key={f.id} accessibilityRole="checkbox" accessibilityState={{ checked: !!ticked?.has(f.id) }} accessibilityLabel={f.name} onPress={() => tick(f.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 10 }}>
                        <Text style={{ fontSize: 16, color: base.ink }}>{ticked?.has(f.id) ? '☑' : '☐'}</Text><Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, color: base.ink }}>{f.name}</Text>
                      </Pressable>
                    )) : <Muted style={{ paddingLeft: 10, fontSize: 12.5 }}>Empty</Muted>}
                  </View>
                ))}
          <View style={{ height: 6 }} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><QBox label="Contract Value £ *" value={value} onChangeText={setValue} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><QBox label="Profit Mark-Up %" value={markup} onChangeText={setMarkup} keyboardType="decimal-pad" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><QPick label="Priced By" value={by?.name || ''} onPress={async () => { const k = await chooseAction('Priced By', people.map((p) => ({ key: p.id, label: p.name || 'Unknown' }))); const p = people.find((x) => x.id === k); if (p) setBy(p); }} /></View>
            <View style={{ flex: 1 }}>
              <Text style={lab}>Date Sent *</Text>
              <DateBox value={sent} onChange={setSent} max={todayIso()} clearable={false} title="Date Sent" style={{ marginBottom: space.m, height: 44, paddingVertical: 0 }} />
            </View>
          </View>
          <Muted style={{ fontSize: 12 }}>{files.length} document{files.length === 1 ? '' : 's'} ticked.</Muted>
        </>
      ) : (
        <>
          <QBox label="To *" value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.m }}>
            <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>{cc ? <>Copy To <Text style={{ fontWeight: '600' }}>{cc}</Text></> : 'No preset copy-to address (Quote Settings)'}</Text>
            {!!cc && <YesNo label="Copy in the preset address" value={useCc} onChange={setUseCc} />}
          </View>
          <QBox label="Subject" value={subject} onChangeText={setSubject} />
          <Text style={lab}>Message</Text>
          <TextInput accessibilityLabel="Message" value={body} onChangeText={setBody} multiline style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 12, minHeight: 200, fontSize: 15, color: base.ink, backgroundColor: base.card, textAlignVertical: 'top', marginBottom: space.m }} />
          <Muted style={{ fontSize: 12 }}>{files.length} document{files.length === 1 ? '' : 's'} attached. You’re copied in too, and replies come to you.</Muted>
        </>
      )}
    </Pop>
  );
}
