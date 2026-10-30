// Managers' "Create / Upload RAMS / COSHH" panel and "Ask Outstanding to Sign" (580/620).
// With `create`, the current app's chooser: two buttons side by side, Create and
// Upload, each opening its own part; in a card when the job has no documents
// yet, else behind a "Create / Upload" heading under the list.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle, Toggle } from '@/components/ui';
import { DOC_LABEL, useHsDocs, type DocKind } from '@/data/hs';
import { outstanding, RAMS_DOC_TYPES, sendSignReminder, uploadHsDoc } from '@/data/hsManager';
import { boxesOf, layoutSummary, useSignTemplates } from '@/data/signTemplates';
import { useAuth } from '@/lib/auth';
import type { Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

export function HsDocUpload({ kind, site, companyId = null, create, createLabel }: { kind: DocKind; site: Site; companyId?: string | null; create?: ReactNode; createLabel?: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useHsDocs(kind, site, companyId);
  const [open, setOpen] = useState(false);
  const [making, setMaking] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('RAMS');
  const [sup, setSup] = useState<string | null>(null);
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState<string | null>(null);
  const [multi, setMulti] = useState(false);
  const { data: tplsAll = [] } = useSignTemplates(kind === 'rams' && !companyId && open);
  const tpls = tplsAll.filter((t) => boxesOf(t.layout).length);
  if (!me) return null;
  const label = DOC_LABEL[kind];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['hsDocs', kind, site.id] }); void qc.invalidateQueries({ queryKey: ['hsSummary', site.id] }); };

  return (
    <View style={{ marginBottom: 12 }}>
      {!!data?.docs.length && kind !== 'layout' && !companyId && (
        <Button kind="ghost" title="🔔 Ask Outstanding to Sign" onPress={async () => {
          const out = outstanding(kind, data.roster, data.docs, data.sigs);
          if (!out.length) { toast(`Everyone on this site has signed all ${label} documents.`); return; }
          if (!(await confirmAsk(`Send a sign-reminder notification to ${out.length} operative${out.length === 1 ? '' : 's'} who still have ${label} to sign?`, 'Send'))) return;
          toast(await sendSignReminder(kind, site.id, out));
        }} />
      )}
      {create ? (
        <>
          {!!data?.docs.length && <Toggle title={`Create / Upload ${label}`} open={wrap} onPress={() => setWrap(!wrap)} />}
          {(wrap || !data?.docs.length) && (
            <Card>
              {!data?.docs.length && <SectionTitle>{`Create / Upload ${label}`}</SectionTitle>}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button kind={making ? 'primary' : 'ghost'} title={createLabel || `Create ${label}`} onPress={() => { setMaking(!making); setOpen(false); }} /></View>
                <View style={{ flex: 1 }}><Button kind={open ? 'primary' : 'ghost'} title={`📄 Upload ${label}`} onPress={() => { setOpen(!open); setMaking(false); }} /></View>
              </View>
              {making && <View style={{ marginTop: 12 }}>{create}</View>}
            </Card>
          )}
        </>
      ) : <Toggle title={`Upload ${label}`} open={open} onPress={() => setOpen(!open)} />}
      {open && (!create || wrap || !data?.docs.length) && (
        <Card>
          <TextInput value={name} onChangeText={setName} placeholder={`${label} name`} style={box} />
          {kind === 'rams' && !companyId && (
            <>
              <Muted style={{ fontWeight: '700' }}>Document type</Muted>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {RAMS_DOC_TYPES.map((t) => <Chip key={t} on={type === t} label={t} onPress={() => setType(t)} />)}
              </View>
              {!!data?.docs.length && (
                <>
                  <Muted style={{ fontWeight: '700' }}>Supersedes (optional)</Muted>
                  <Pressable onPress={() => setSup(null)}><Text style={{ paddingVertical: 5, color: base.ink }}>{!sup ? '◉' : '○'} New document, doesn&apos;t replace anything</Text></Pressable>
                  {data.docs.map((d) => <Pressable key={d.id} onPress={() => setSup(d.id)}><Text style={{ paddingVertical: 5, color: base.ink }}>{sup === d.id ? '◉' : '○'} {d.name}</Text></Pressable>)}
                </>
              )}
            </>
          )}
          {kind === 'rams' && !companyId && <Check label="Multi-page sign required" value={multi} onChange={(v) => { setMulti(v); if (!v) setTpl(null); }} />}
          {kind === 'rams' && !companyId && multi && (
            <Pressable onPress={async () => {
              if (!tpls.length) { toast('No signing templates yet — set one up in Admin Centre → Signing Templates.'); return; }
              const k = await chooseAction('Signing template', [{ key: '-', label: '— None (signatures listed on a page at the end) —' }, ...tpls.map((t) => ({ key: t.id, label: `${t.name} · ${layoutSummary(t.layout)}` }))]);
              if (k) setTpl(k === '-' ? null : k);
            }} style={[box, { justifyContent: 'center' }]}>
              <Text style={{ color: base.ink }}>✍ Signing template: {tpl ? tpls.find((t) => t.id === tpl)?.name : 'None (signatures on a page at the end)'}</Text>
            </Pressable>
          )}
          <Button kind="ghost" title={file ? `📄 ${file.name}` : 'Choose PDF'} onPress={async () => {
            const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
            if (!r.canceled && r.assets[0]) { const a = r.assets[0]; setFile({ uri: a.uri, name: a.name || 'document.pdf' }); if (!name.trim()) setName((a.name || '').replace(/\.pdf$/i, '')); }
          }} />
          <Button busy={busy} title={`Upload ${label}`} onPress={async () => {
            if (!name.trim() || !file) { toast('Add a name and choose a PDF.'); return; }
            setBusy(true);
            const err = await uploadHsDoc(me, kind, site.id, { name: name.trim(), docType: type, supersedesId: sup, file, companyId, signLayout: tpl ? { v: 2, boxes: boxesOf(tpls.find((t) => t.id === tpl)?.layout ?? null), multi: true } : null });
            setBusy(false);
            if (err) { toast(err); return; }
            toast(`${label} uploaded`); setName(''); setFile(null); setSup(null); setTpl(null); refresh();
            if (kind === 'rams') setOpen(false);
          }} />
          {kind === 'rams' && <Muted style={{ marginTop: 6 }}>Signature boxes can be set on any uploaded RAMS from its ⋯ menu (on the office laptop). Send a RAMS to the client to sign from the line under it.</Muted>}
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
