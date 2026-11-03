// The Finance send pop-up (Andy, 3 Nov 2026): who it goes to, CC me, a template from Settings › Templates
// (the default first), then the subject and message to change before sending. Email Me Only sends it just to you.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { SelectBox } from '@/components/SelectBox';
import { Button, Check, Muted } from '@/components/ui';
import { fillTpl, TPL_STANDARD, useTemplates, type TplKind } from '@/data/finTemplates';
import { useAuth } from '@/lib/auth';
import { base, radius } from '@/theme/theme';

export type EmailOut = { to: string[]; cc: string[]; subject: string; body: string; logos: string[]; hideLogo: boolean };
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, fontSize: 14 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FinEmailPopup({ kind, title, to: to0, vars, note, onSend, onClose }: { kind: TplKind; title: string; to: string; vars: Record<string, string>; note?: string; onSend: (o: EmailOut) => Promise<string | null>; onClose: () => void }) {
  const { me } = useAuth();
  const { data: all = [] } = useTemplates(me?.org_id);
  const list = all.filter((t) => t.kind === kind);
  // The default template first; choosing another starts its subject and message again. Words typed in are kept until then.
  const [picked, setPicked] = useState<string | null>(null);
  const tplId = picked ?? (list.find((t) => t.is_default)?.id || list[0]?.id || 'std');
  const [to, setTo] = useState(to0);
  const [ccMe, setCcMe] = useState(true);
  const [subjectTyped, setSubject] = useState<string | null>(null);
  const [bodyTyped, setBody] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const tpl = list.find((x) => x.id === tplId), std = TPL_STANDARD[kind];
  const subject = subjectTyped ?? fillTpl(tpl?.subject || std.subject, vars), body = bodyTyped ?? fillTpl(tpl?.body || std.body, vars);
  const send = async (only: boolean) => {
    const list2 = only ? [me?.email || ''] : to.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!list2.length || list2.some((x) => !EMAIL_RE.test(x))) { setErr('Check the email address.'); return; }
    setBusy(only ? 'me' : 'send'); setErr('');
    try {
      const e = await onSend({ to: list2, cc: !only && ccMe && me?.email ? [me.email] : [], subject, body, logos: tpl?.logos || [], hideLogo: tpl ? !tpl.show_logo : false });
      if (e) setErr(e); else onClose();
    } finally { setBusy(''); }
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: base.card, borderRadius: 14, padding: 16, maxHeight: '92%', width: '100%', maxWidth: 600, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
            <Text style={{ flex: 1, fontWeight: '600', fontSize: 16, color: base.ink }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}><Text style={{ fontSize: 18, color: base.slate, fontWeight: '500' }}>✕</Text></Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            {note ? <Muted style={{ marginBottom: 8 }}>{note}</Muted> : null}
            <SelectBox label="Template" title="Template" value={tplId || 'std'} options={[...list.map((t) => [t.id, `${t.name}${t.is_default ? ' (default)' : ''}`] as [string, string]), ...(list.length ? [] : [['std', 'Standard wording'] as [string, string]])]} onChange={(k) => { setPicked(k); setSubject(null); setBody(null); }} />
            <Muted style={{ fontWeight: '500' }}>To</Muted>
            <TextInput value={to} onChangeText={setTo} placeholder="qs@client.co.uk (commas for more than one)" autoCapitalize="none" keyboardType="email-address" style={[box, { marginBottom: 6 }]} />
            <Check label={`CC Me (${me?.email || ''})`} value={ccMe} onChange={setCcMe} />
            <Muted style={{ fontWeight: '500', marginTop: 6 }}>Subject</Muted>
            <TextInput value={subject} onChangeText={setSubject} style={[box, { marginBottom: 8 }]} />
            <Muted style={{ fontWeight: '500' }}>Message</Muted>
            <TextInput accessibilityLabel="Message" value={body} onChangeText={setBody} multiline style={[box, { minHeight: 160, textAlignVertical: 'top' }]} />
            <Muted style={{ fontSize: 11.5, marginTop: 4 }}>Your name, company details{tpl && !tpl.show_logo ? '' : ' and logo'}{tpl?.logos.length ? ` and ${tpl.logos.length} more logo${tpl.logos.length === 1 ? '' : 's'}` : ''} go under the message. Change the wording for good in Settings › Templates.</Muted>
          </ScrollView>
          {err ? <Text style={{ color: '#C0392B', fontWeight: '500', marginTop: 8 }}>{err}</Text> : null}
          <View style={{ gap: 8, marginTop: 8 }}>
            <Button busy={busy === 'send'} title="Send" onPress={() => void send(false)} />
            <Button kind="ghost" busy={busy === 'me'} title="Email Me Only" onPress={() => void send(true)} />
            <Button kind="ghost" title="Cancel" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
