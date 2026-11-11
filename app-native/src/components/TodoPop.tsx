// Add a to-do (Andy, 11 Nov 2026: the to-do list a big feature, in the HUB, and from any message): what it is, the project
// (or none), when it's due, and the people tagged on it. The first person tagged is who it's assigned to; everyone tagged
// gets a message. Made from a message, it starts with the message's words and remembers which message it came from.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { Pop } from '@/components/Pop';
import { QBox, QPick } from '@/components/QuoteForm';
import { TagLine, tellTagged, type TagPerson } from '@/components/TagPeople';
import { chooseAction, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { usePeople } from '@/data/hs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { supabase } from '@/lib/supabase';
import { base } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export function TodoPop({ start, siteId, messageId, onClose, onDone }: { start?: string; siteId?: string | null; messageId?: string | null; onClose: () => void; onDone?: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data: people } = usePeople();
  const [text, setText] = useState(start || '');
  const [site, setSite] = useState<string | null>(siteId ?? null);
  const [date, setDate] = useState('');
  const [tagged, setTagged] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const team = ((people ?? []) as TagPerson[]).filter((p) => p.role !== 'client');
  const sname = (id: string | null) => { const s = sites.find((x) => x.id === id); return s ? `${s.job_number ? `${s.job_number} ` : ''}${s.name}` : ''; };
  const save = async () => {
    if (!text.trim()) { toast('What needs doing?'); return; }
    setBusy(true);
    const r = await db.from('todos').insert({ org_id: me.org_id, site_id: site, text: text.trim(), date_required_by: date || null, assigned_to: tagged[0] ?? null, tagged, created_by: me.id, ...(messageId ? { message_id: messageId } : {}) } as never).select('id').single();
    setBusy(false);
    if (r.error) { toast('Could not save — try again.'); return; }
    void tellTagged(me, tagged, `${me.name || 'Someone'} tagged you in a to-do${site ? ` on ${sname(site)}` : ''}: "${text.trim()}"${date ? ` (due ${new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})` : ''}`, site, 'todo_tagged', (r.data as { id: string }).id);
    ['hubTodos', 'pmTodos', 'todos'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    onDone?.(); onClose();
  };
  return (
    <Pop title={messageId ? 'Make It A To Do' : 'Add A To Do'} onClose={onClose} footer={<View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}><Button busy={busy} title="Add To Do" onPress={() => void save()} /><Button kind="ghost" title="Cancel" onPress={onClose} /></View>}>
      <QBox label="What Needs Doing *" value={text} onChangeText={setText} multiline />
      <QPick label="Project" value={site ? sname(site) : 'No Project'} onPress={async () => {
        const k = await chooseAction('Which Project', [{ key: '-', label: 'No Project' }, ...sites.filter((s) => siteStatusKey(s) !== 'closed').map((s) => ({ key: s.id, label: sname(s.id) }))]);
        if (k) setSite(k === '-' ? null : k);
      }} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, marginBottom: 4 }}>Due</Text>
      <DateBox value={date} onChange={setDate} title="Due" style={{ marginBottom: 12 }} />
      <TagLine people={team} value={tagged} onChange={setTagged} />
      <Muted style={{ fontSize: 12 }}>The first person tagged is who it’s assigned to. Everyone tagged gets a message.</Muted>
    </Pop>
  );
}
