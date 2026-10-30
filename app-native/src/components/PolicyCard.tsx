// The company H&S Policy as shown at the top of the RAMS page (hsPolicySectionHtml, 580).
// Open by default until you've signed it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Muted, Toggle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { openDocLink, usePeople } from '@/data/hs';
import { signHsPolicy, useHsPolicy } from '@/data/hsPolicy';
import { useAuth } from '@/lib/auth';
import { policySigValid } from '@/lib/rules/hs';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base } from '@/theme/theme';

const longDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function PolicySignedList({ docId, doc }: { docId: string; doc: Parameters<typeof policySigValid>[0] }) {
  const [open, setOpen] = useState(false);
  const { data: people } = usePeople();
  const { data: sigs } = useQuery({ queryKey: ['policySigned', docId], queryFn: async () => ((await supabase.from('hs_policy_signatures').select('user_id,signed_at').eq('policy_id', docId)).data as { user_id: string; signed_at: string | null }[] | null) ?? [] });
  const team = (people ?? []).filter((p) => !['client', 'superadmin'].includes(p.role)).sort((a, b) => a.name.localeCompare(b.name));
  const done = new Set((sigs ?? []).filter((x) => policySigValid(doc, x)).map((x) => x.user_id));
  return (
    <>
      <Toggle title={`Signed (${team.filter((p) => done.has(p.id)).length} of ${team.length})`} open={open} onPress={() => setOpen(!open)} />
      {open && <Card>{team.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', paddingVertical: 5 }}>
          <Text style={{ flex: 1, color: base.ink }}>{p.name}</Text>
          <Text style={{ fontWeight: '700', color: done.has(p.id) ? base.ok : base.warn }}>{done.has(p.id) ? 'Signed' : 'Outstanding'}</Text>
        </View>
      ))}</Card>}
    </>
  );
}

export function PolicyCard() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useHsPolicy();
  const [open, setOpen] = useState<boolean | null>(null);
  if (!me || !data?.doc) return null;
  const doc = data.doc;
  const mine = [...data.mine].reverse().find((s) => policySigValid(doc, s));
  const isOpen = open ?? !mine;
  return (
    <>
      <Toggle title={`H&S Policy${mine ? '' : '  (!)'}`} open={isOpen} onPress={() => setOpen(!isOpen)} />
      {isOpen && (
        <Card>
          <Text style={{ fontWeight: '800', fontSize: 14, color: base.ink }}>{doc.name}</Text>
          <Muted>Uploaded {longDate(doc.uploaded_at)}{doc.expiry_date ? ` · Expires ${longDate(`${doc.expiry_date}T00:00:00`)}` : ''}</Muted>
          <Pressable onPress={async () => { const u = await openDocLink('rams-docs', doc.storage_path); if (u) viewDoc(u); }}>
            <Text style={{ color: base.blue, marginTop: 6 }}>View document ↗</Text>
          </Pressable>
          {mine ? (
            <Text style={{ color: base.ok, marginTop: 10 }}>✓ You signed this on {longDate(mine.signed_at)} — valid for one year, and travels with you to every site.</Text>
          ) : me.role !== 'client' && (
            <Button title="I have read and understood this policy — Sign" onPress={async () => {
              const r = await signHsPolicy(me, doc.id);
              toast(r.msg);
              if (r.needSignature) router.push('/signature');
              if (r.ok) void qc.invalidateQueries({ queryKey: ['hsPolicy'] });
            }} />
          )}
        </Card>
      )}
      {isOpen && isManager(me) && <PolicySignedList docId={doc.id} doc={doc} />}
    </>
  );
}
