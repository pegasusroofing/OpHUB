// Managers' "Upload RAMS / COSHH" panel and "Ask Outstanding to Sign" (580/620).
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted, Toggle } from '@/components/ui';
import { DOC_LABEL, useHsDocs, type DocKind } from '@/data/hs';
import { outstanding, RAMS_DOC_TYPES, sendSignReminder, uploadHsDoc } from '@/data/hsManager';
import { useAuth } from '@/lib/auth';
import type { Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

export function HsDocUpload({ kind, site }: { kind: DocKind; site: Site }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useHsDocs(kind, site);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('RAMS');
  const [sup, setSup] = useState<string | null>(null);
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const label = DOC_LABEL[kind];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['hsDocs', kind, site.id] }); void qc.invalidateQueries({ queryKey: ['hsSummary', site.id] }); };

  return (
    <View style={{ marginBottom: 12 }}>
      {!!data?.docs.length && kind !== 'layout' && (
        <Button kind="ghost" title="🔔 Ask Outstanding to Sign" onPress={async () => {
          const out = outstanding(kind, data.roster, data.docs, data.sigs);
          if (!out.length) { toast(`Everyone on this site has signed all ${label} documents.`); return; }
          if (!(await confirmAsk(`Send a sign-reminder notification to ${out.length} operative${out.length === 1 ? '' : 's'} who still have ${label} to sign?`, 'Send'))) return;
          toast(await sendSignReminder(kind, site.id, out));
        }} />
      )}
      <Toggle title={`Upload ${label}`} open={open} onPress={() => setOpen(!open)} />
      {open && (
        <Card>
          <TextInput value={name} onChangeText={setName} placeholder={`${label} name`} style={box} />
          {kind === 'rams' && (
            <>
              <Muted style={{ fontWeight: '700' }}>Document type</Muted>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {RAMS_DOC_TYPES.map((t) => <Chip key={t} on={type === t} label={t} onPress={() => setType(t)} />)}
              </View>
              {!!data?.docs.length && (
                <>
                  <Muted style={{ fontWeight: '700' }}>Supersedes (optional)</Muted>
                  <Pressable onPress={() => setSup(null)}><Text style={{ paddingVertical: 5, color: base.ink }}>{!sup ? '◉' : '○'} New document, doesn't replace anything</Text></Pressable>
                  {data.docs.map((d) => <Pressable key={d.id} onPress={() => setSup(d.id)}><Text style={{ paddingVertical: 5, color: base.ink }}>{sup === d.id ? '◉' : '○'} {d.name}</Text></Pressable>)}
                </>
              )}
            </>
          )}
          <Button kind="ghost" title={file ? `📄 ${file.name}` : 'Choose PDF'} onPress={async () => {
            const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
            if (!r.canceled && r.assets[0]) { const a = r.assets[0]; setFile({ uri: a.uri, name: a.name || 'document.pdf' }); if (!name.trim()) setName((a.name || '').replace(/\.pdf$/i, '')); }
          }} />
          <Button busy={busy} title={`Upload ${label}`} onPress={async () => {
            if (!name.trim() || !file) { toast('Add a name and choose a PDF.'); return; }
            setBusy(true);
            const err = await uploadHsDoc(me, kind, site.id, { name: name.trim(), docType: type, supersedesId: sup, file });
            setBusy(false);
            if (err) { toast(err); return; }
            toast(`${label} uploaded`); setName(''); setFile(null); setSup(null); refresh();
            if (kind === 'rams') setOpen(false);
          }} />
          {kind === 'rams' && <Muted style={{ marginTop: 6 }}>Building a RAMS in the app, signing boxes inside the document and sending it to the client to sign are still in the current app for now.</Muted>}
        </Card>
      )}
    </View>
  );
}

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}>
      <Text style={{ fontWeight: '700', color: on ? '#fff' : base.ink }}>{label}</Text>
    </Pressable>
  );
}
