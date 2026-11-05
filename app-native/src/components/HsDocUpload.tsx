// Managers' "Create / Upload RAMS / COSHH" panel and "Ask Outstanding to Sign" (580/620).
// With `create`, the current app's chooser: two buttons side by side, Create and
// Upload, each opening its own part; in a card when the job has no documents
// yet, else behind a "Create / Upload" heading under the list.
import * as DocumentPicker from 'expo-document-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { FinEmailPopup } from '@/components/FinEmailPopup';
import { packHsPdf } from '@/components/HsDocList';
import { Popup } from '@/components/Popup';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle, Toggle } from '@/components/ui';
import { DOC_LABEL, nameOf, useHsDocs, usePeople, type DocKind } from '@/data/hs';
import { emailHsPdf, outstanding, outstandingByDoc, RAMS_DOC_TYPES, sendSignReminder, uploadHsDoc } from '@/data/hsManager';
import { boxesOf, layoutSummary, useSignTemplates } from '@/data/signTemplates';
import { useAuth } from '@/lib/auth';
import { isFullManager } from '@/lib/roles';
import { deliverPdf } from '@/lib/pdf';
import { exportTableExcel, exportTablePdf } from '@/lib/tableExport';
import type { Site } from '@/lib/types';
import { base, radius, live } from '@/theme/theme';

export function HsDocUpload({ kind, site, companyId = null, create, createLabel, options }: { kind: DocKind; site: Site; companyId?: string | null; create?: ReactNode; createLabel?: string; options?: { label: string; go: () => void }[] }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useHsDocs(kind, site, companyId);
  const { data: people } = usePeople();
  const [picking, setPicking] = useState<'export' | 'email' | null>(null);
  const [mailing, setMailing] = useState<{ ids: string[]; what: 'signed' | 'outstanding' } | null>(null);
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
  // Who is still to sign, as a table (document, person, role) for the export and the email.
  const table = (ids?: string[]) => {
    const rows = data ? outstandingByDoc(kind, data.roster, data.docs.filter((x) => !ids || ids.includes(x.id)), data.sigs) : [];
    return { title: `Outstanding ${label} Signatures`, site: site.name, cols: [{ l: 'Document', w: 34 }, { l: 'Still To Sign', w: 22 }, { l: 'Role', w: 14 }],
      rows: rows.flatMap((r) => r.users.map((u) => [r.doc.name, nameOf(people, u), (people?.find((p) => p.id === u)?.role || '').replace(/_/g, ' ')])) };
  };
  const pdfFile = () => `Outstanding ${label} signatures - ${site.name}.pdf`.replace(/[\\/:*?"<>|]+/g, '-');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['hsDocs', kind, site.id] }); void qc.invalidateQueries({ queryKey: ['hsSummary', site.id] }); };

  return (
    <View style={{ marginBottom: 12 }}>
      {/* Ask, Export and Email on one row (Andy, 3 Nov 2026): Export gives Excel or PDF; Email is the Finance send pop-up. */}
      {!!data?.docs.length && kind !== 'layout' && !companyId && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 2, minWidth: 0 }}><Button grow kind="ghost" title="🔔 Ask Outstanding To Sign" onPress={async () => {
            const out = outstanding(kind, data.roster, data.docs, data.sigs);
            if (!out.length) { toast(`Everyone on this site has signed all ${label} documents.`); return; }
            if (!(await confirmAsk(`Send a sign-reminder notification to ${out.length} operative${out.length === 1 ? '' : 's'} who still have ${label} to sign?`, 'Send'))) return;
            toast(await sendSignReminder(kind, site.id, out));
          }} /></View>
          <View style={{ flex: 1 }}><Button grow kind="ghost" title="Export" onPress={() => setPicking('export')} /></View>
          {isFullManager(me) && <View style={{ flex: 1 }}><Button grow kind="ghost" title="Email" onPress={() => setPicking('email')} /></View>}
        </View>
      )}
      {picking && data && (
        <PickDocs mode={picking} label={label} docs={data.docs.map((x) => ({ id: x.id, name: x.name }))} onClose={() => setPicking(null)}
          onGo={async (ids, what, fmt) => {
            if (picking === 'email') { setPicking(null); setMailing({ ids, what }); return; }
            if (what === 'outstanding') {
              const t = table(ids); if (!t.rows.length) { toast(`Everyone has signed the ticked ${label} documents.`); return; }
              const ok = fmt === 'xl' ? await exportTableExcel(t, org) : await exportTablePdf(t, org, (b) => deliverPdf(b, pdfFile()));
              if (!ok) toast('Could not make the file — try again.'); else setPicking(null);
              return;
            }
            toast('Building the PDF…');
            const b = await packHsPdf(kind, site, data.docs, ids);
            if (!b) { toast('Nothing to export.'); return; }
            if (b.skipped.length) toast(`Could not add: ${b.skipped.join(', ')}`);
            if (await deliverPdf(b.bytes, b.filename)) setPicking(null); else toast('Could not save the PDF.');
          }} />
      )}
      {mailing && data && (
        <FinEmailPopup kind={mailing.what === 'outstanding' ? 'signatures' : 'hsdocs'} title={mailing.what === 'outstanding' ? `Email Outstanding ${label} Signatures` : `Email Signed ${label}`} to={site.client_email || ''}
          note={mailing.what === 'outstanding' ? 'The list of who is still to sign the ticked documents goes with it as a PDF.' : `The ticked ${label} documents go with it as one signed PDF.`}
          vars={{ client: site.client_name || '', project: site.name || '', job_no: site.job_number || '', number: label, amount: '', due: '', client_po: '', company: org?.name || '', my_name: me.name || '' }}
          onSend={async (o) => {
            if (mailing.what === 'outstanding') {
              const t = table(mailing.ids); if (!t.rows.length) return `Everyone has signed the ticked ${label} documents.`;
              let bytes: Uint8Array | null = null;
              await exportTablePdf(t, org, async (b) => { bytes = b; return true; });
              if (!bytes) return 'Could not make the PDF — try again.';
              const e = await emailHsPdf(site.id, 'signatures', bytes, pdfFile(), o); if (e) return e;
            } else {
              const b = await packHsPdf(kind, site, data.docs, mailing.ids);
              if (!b) return 'Could not build the PDF — try again.';
              if (b.bytes.length > 10 * 1024 * 1024) return `That PDF is ${Math.round(b.bytes.length / 1048576)}MB — too big to email. Tick fewer documents, or use Export.`;
              const e = await emailHsPdf(site.id, kind === 'coshh' ? 'coshh' : 'rams', b.bytes, b.filename, o); if (e) return e;
            }
            toast(`Emailed to ${o.to.join(', ')}`); return null;
          }}
          onClose={() => setMailing(null)} />
      )}
      {options ? (
        <View style={{ marginTop: 8 }}><Button title={createLabel || `Create ${label}`} onPress={async () => {
          const k = await chooseAction(createLabel || `Create ${label}`, [...options.map((o, i) => ({ key: String(i), label: o.label })), { key: 'up', label: `Upload ${label} Assessment` }]);
          if (k === 'up') { setOpen(true); setMaking(false); } else if (k != null && options[Number(k)]) options[Number(k)].go();
        }} /></View>
      ) : create ? (
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
      {open && (!!options || !create || wrap || !data?.docs.length) && (
        <Card>
          <TextInput value={name} onChangeText={setName} placeholder={`${label} name`} style={box} />
          {kind === 'rams' && !companyId && (
            <>
              <Muted style={{ fontWeight: '600' }}>Document type</Muted>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {RAMS_DOC_TYPES.map((t) => <Chip key={t} on={type === t} label={t} onPress={() => setType(t)} />)}
              </View>
              {!!data?.docs.length && (
                <>
                  <Muted style={{ fontWeight: '600' }}>Supersedes (optional)</Muted>
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

/** Tick the documents (all to start), choose what goes, then export or email. */
function PickDocs({ mode, label, docs, onClose, onGo }: { mode: 'export' | 'email'; label: string; docs: { id: string; name: string }[]; onClose: () => void; onGo: (ids: string[], what: 'signed' | 'outstanding', fmt: 'pdf' | 'xl') => Promise<void> }) {
  const [ids, setIds] = useState<string[]>(docs.map((x) => x.id));
  const [what, setWhat] = useState<'signed' | 'outstanding'>('signed');
  const [busy, setBusy] = useState<'' | 'pdf' | 'xl'>('');
  const go = async (fmt: 'pdf' | 'xl') => { if (!ids.length) return; setBusy(fmt); try { await onGo(ids, what, fmt); } finally { setBusy(''); } };
  return (
    <Popup center title={mode === 'export' ? `Export ${label}` : `Email ${label}`} width={460} onClose={onClose}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        {([['signed', 'Signed Documents'], ['outstanding', 'Who Still Has To Sign']] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setWhat(k)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: what === k ? '#111827' : '#e5e7eb', backgroundColor: what === k ? '#111827' : '#fff', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: what === k ? '#fff' : '#111827' }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {docs.length > 1 && <Check label={`All Documents (${docs.length})`} value={ids.length === docs.length} onChange={(v) => setIds(v ? docs.map((x) => x.id) : [])} />}
      {docs.map((x) => <Check key={x.id} label={x.name} value={ids.includes(x.id)} onChange={(v) => setIds(v ? [...ids, x.id] : ids.filter((y) => y !== x.id))} />)}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        {mode === 'export' ? (
          <>
            <View style={{ flex: 1 }}><Button grow busy={busy === 'pdf'} disabled={!ids.length} title="Export PDF" onPress={() => void go('pdf')} /></View>
            {what === 'outstanding' && <View style={{ flex: 1 }}><Button grow kind="ghost" busy={busy === 'xl'} disabled={!ids.length} title="Export Excel" onPress={() => void go('xl')} /></View>}
          </>
        ) : <View style={{ flex: 1 }}><Button grow disabled={!ids.length} title="Next — Write The Email" onPress={() => void go('pdf')} /></View>}
      </View>
    </Popup>
  );
}

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? live.brand1 : base.line, backgroundColor: on ? live.brand1 : base.card }}>
      <Text style={{ fontWeight: '500', color: on ? live.brand1Text : base.ink }}>{label}</Text>
    </Pressable>
  );
}
