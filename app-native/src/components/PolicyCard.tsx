// The company H&S Policy as shown at the top of the RAMS page (hsPolicySectionHtml, 580).
// Open by default until you've signed it.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Muted, Toggle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { openDocLink } from '@/data/hs';
import { signHsPolicy, useHsPolicy } from '@/data/hsPolicy';
import { useAuth } from '@/lib/auth';
import { policySigValid } from '@/lib/rules/hs';
import { base } from '@/theme/theme';

const longDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

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
    </>
  );
}
