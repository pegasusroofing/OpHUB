// Tag people (Andy, 11 Nov 2026): on a snag, a calendar entry or a to-do. A line saying who's tagged, a button to change
// it, and the tick list pop-up. Whoever's newly tagged gets a message in their Inbox / Hub.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Pop } from '@/components/Pop';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { base } from '@/theme/theme';

export type TagPerson = { id: string; name: string | null; role?: string | null };
const roleWord = (r?: string | null) => (r === 'pm' ? 'PM' : r === 'admin' ? 'Admin' : r === 'site_manager' ? 'Site Manager' : r === 'operative' ? 'Operative' : r === 'driver' ? 'Driver' : '');

export function TagPop({ people, start, onDone, onClose }: { people: TagPerson[]; start: string[]; onDone: (ids: string[]) => void; onClose: () => void }) {
  const [on, setOn] = useState<string[]>(start);
  return (
    <Pop title="Tag Someone" onClose={onClose} footer={<View style={{ alignItems: 'center', marginTop: 10 }}><Button title="Done" onPress={() => onDone(on)} /></View>}>
      {people.map((p) => (
        <Pressable key={p.id} accessibilityRole="checkbox" accessibilityState={{ checked: on.includes(p.id) }} accessibilityLabel={p.name || 'Unknown'} onPress={() => setOn(on.includes(p.id) ? on.filter((x) => x !== p.id) : [...on, p.id])}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
          <Text style={{ fontSize: 16, color: base.ink }}>{on.includes(p.id) ? '☑' : '☐'}</Text>
          <Text style={{ flex: 1, fontSize: 14, color: base.ink }}>{p.name || 'Unknown'}</Text>
          <Text style={{ fontSize: 12, color: base.slate }}>{roleWord(p.role)}</Text>
        </Pressable>
      ))}
    </Pop>
  );
}

/** "Tagged: Jake, Tom  🏷 Tag People" — the pop-up opens from it. */
export function TagLine({ people, value, onChange }: { people: TagPerson[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const names = value.map((u) => people.find((p) => p.id === u)?.name).filter(Boolean).join(', ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <Text style={{ flex: 1, fontSize: 13, color: base.slate }}>Tagged: <Text style={{ color: base.ink }}>{names || 'Nobody'}</Text></Text>
      <Button small kind="ghost" title="🏷 Tag People" onPress={() => setOpen(true)} />
      {open && <TagPop people={people} start={value} onClose={() => setOpen(false)} onDone={(ids) => { setOpen(false); onChange(ids); }} />}
    </View>
  );
}

/** A message to each person newly tagged (not yourself). */
export async function tellTagged(me: Profile, ids: string[], body: string, siteId: string | null, kind: string, relatedId?: string | null) {
  const to = [...new Set(ids)].filter((u) => u && u !== me.id);
  if (!me.org_id || !to.length) return;
  await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from('messages')
    .insert(to.map((u) => ({ org_id: me.org_id, site_id: siteId, sender_id: me.id, audience: 'single', recipient_id: u, kind, body: body.slice(0, 1000), related_id: relatedId ?? null })) as never)
    .then(undefined, () => undefined);
}
