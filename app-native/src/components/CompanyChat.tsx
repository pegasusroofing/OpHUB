// Company Chat (Andy, 7 Nov 2026): the whole company in one chat. Newest at the bottom, your own messages on the right.
// Type @ and a few letters to tag someone (a list with an ✕ opens just above the box); they get a notification on their
// phone. Opening the chat clears its red count. Fills the space it's given: the page around it doesn't scroll.
import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { usePeople } from '@/data/hs';
import { markChatRead, sendChat, useCompanyChat, type ChatMsg } from '@/data/companyChat';
import { useAuth } from '@/lib/auth';
import { base, useTheme } from '@/theme/theme';

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const dayWord = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const k = (x: Date) => x.toDateString();
  if (k(d) === k(now)) return 'Today';
  if (k(d) === k(new Date(now.getTime() - 864e5))) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text with each @tag in bold. */
function Body({ m, names, mine }: { m: ChatMsg; names: string[]; mine: boolean }) {
  const col = mine ? '#fff' : base.ink;
  if (!names.length) return <Text style={{ fontSize: 14, lineHeight: 19, color: col }}>{m.body}</Text>;
  const parts = m.body.split(new RegExp(`(${names.map((n) => `@${esc(n)}`).join('|')})`));
  return <Text style={{ fontSize: 14, lineHeight: 19, color: col }}>{parts.map((p, i) => (names.some((n) => p === `@${n}`) ? <Text key={i} style={{ fontWeight: '700' }}>{p}</Text> : <Fragment key={i}>{p}</Fragment>))}</Text>;
}

export function CompanyChat() {
  const { me } = useAuth();
  const t = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: msgs, isLoading, refetch } = useCompanyChat(me, true);
  const { data: people = [] } = usePeople();
  const [text, setText] = useState('');
  const [tagged, setTagged] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [noTag, setNoTag] = useState(false); // ✕ on the tag list: hidden until the next @
  // Everyone who can be tagged: the company's people, not clients, not you.
  const team = useMemo(() => people.filter((p) => p.id !== me?.id && p.role !== 'client' && !String(p.role || '').startsWith('subcontractor') && p.name).sort((a, b) => String(a.name).localeCompare(String(b.name))), [people, me?.id]);
  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, String(p.name || '')])), [people]);

  // Opening the chat, and each new message while it's open, clears the red count.
  const newest = msgs?.[0]?.id;
  useEffect(() => {
    if (!me) return;
    void markChatRead(me).then(() => { void qc.invalidateQueries({ queryKey: ['companyChatUnread'] }); void qc.invalidateQueries({ queryKey: ['hub'] }); });
  }, [me, newest, qc]);

  // "@" then letters at the end of the box: the people whose names match.
  const at = /(^|\s)@([^@\n]{0,30})$/.exec(text);
  const q = at ? at[2].toLowerCase() : null;
  const matches = q === null || noTag ? [] : team.filter((p) => String(p.name).toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || String(p.name).toLowerCase().startsWith(q)).slice(0, 6);
  const pickTag = (p: { id: string; name: string }) => {
    setText((v) => v.replace(/@([^@\n]{0,30})$/, `@${p.name} `));
    setTagged((x) => (x.some((y) => y.id === p.id) ? x : [...x, { id: p.id, name: p.name }]));
  };
  const send = async () => {
    if (!me || busy || !text.trim()) return;
    setBusy(true); const err = await sendChat(me, text, tagged); setBusy(false);
    if (err) { toast(err); return; }
    setText(''); setTagged([]); void refetch();
  };

  const list = msgs ?? [];
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {isLoading ? <Text style={{ color: base.slate, padding: 12 }}>Loading…</Text> : !list.length ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: base.slate, textAlign: 'center' }}>No messages yet. Say hello to the team, and type @ to tag someone.</Text>
        </View>
      ) : (
        <FlatList inverted data={list} keyExtractor={(m) => m.id} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 10, gap: 8 }}
          renderItem={({ item: m, index: i }) => {
            const mine = m.sender_id === me?.id;
            const older = list[i + 1];
            const showDay = !older || new Date(older.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const who = m.sender_name || nameById[m.sender_id] || 'Former Team Member';
            const names = (m.mentions || []).map((id) => nameById[id]).filter(Boolean);
            return (
              <View>
                {showDay && <Text style={{ textAlign: 'center', fontSize: 11.5, fontWeight: '600', color: base.slate, marginVertical: 6 }}>{dayWord(m.created_at)}</Text>}
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  {!mine && <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, fontWeight: '700', color: base.ink }}>{initials(who)}</Text></View>}
                  <View accessibilityLabel={`${who}: ${m.body}`} style={{ maxWidth: '78%', borderRadius: 14, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: mine ? base.ink : base.card, borderWidth: 1, borderColor: mine ? base.ink : base.cardLine }}>
                    {!mine && <Text style={{ fontSize: 11.5, fontWeight: '600', color: base.slate, marginBottom: 2 }}>{who}</Text>}
                    <Body m={m} names={names} mine={mine} />
                    <Text style={{ fontSize: 10.5, color: mine ? '#C9CDD2' : base.slate, marginTop: 3, textAlign: 'right' }}>{time(m.created_at)}</Text>
                  </View>
                </View>
              </View>
            );
          }} />
      )}
      {matches.length > 0 && (
        <View accessibilityLabel="Tag Someone" style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.line, borderRadius: 12, overflow: 'hidden', marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#F6F7F9' }}>
            <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>Tag Someone</Text>
            <Pressable accessibilityLabel="Close" hitSlop={8} onPress={() => setNoTag(true)}><Text style={{ fontSize: 16, color: base.slate }}>✕</Text></Pressable>
          </View>
          {matches.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Tag ${p.name}`} onPress={() => pickTag({ id: p.id, name: String(p.name) })} style={{ paddingVertical: 9, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
              <Text style={{ fontSize: 14, color: base.ink }}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8, paddingBottom: 4, borderTopWidth: 1, borderTopColor: base.line }}>
        <TextInput value={text} onChangeText={(v) => { setText(v); if (/@[^@\s]*$/.test(v) && !/@[^@\s]*$/.test(text)) setNoTag(false); }} placeholder="Message The Team — Type @ To Tag Someone" multiline
          accessibilityLabel="Message"
          // On a laptop, Enter sends and Shift+Enter starts a new line.
          onKeyPress={(e) => { const k = e.nativeEvent as { key?: string; shiftKey?: boolean }; if (Platform.OS === 'web' && k.key === 'Enter' && !k.shiftKey) { (e as unknown as { preventDefault?: () => void }).preventDefault?.(); void send(); } }}
          style={{ flex: 1, maxHeight: 110, minHeight: 40, outlineStyle: 'none' as 'solid', borderWidth: 1, borderColor: base.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, color: base.ink, backgroundColor: base.card }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={busy || !text.trim()} onPress={() => void send()}
          style={{ height: 40, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.brand1, opacity: busy || !text.trim() ? 0.5 : 1 }}>
          <Text style={{ color: t.brand1Text, fontWeight: '600', fontSize: 14 }}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}
