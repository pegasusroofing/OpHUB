// RAMS or COSHH list for operatives: each document with its "tap to sign" box,
// who has/hasn't signed, and Sign All. Ported from ramsDocsHtml / renderRams (580)
// and the COSHH copy (620). Managers also get a ⋮ menu per document (view,
// replace a COSHH file, delete); upload and reminders are in HsDocUpload.
// Added (question for Andy): a "View document" link on each row, so people can
// read the document before signing — the current operative row has none.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import * as DocumentPicker from 'expo-document-picker';

import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, Toggle } from '@/components/ui';
import { DOC_LABEL, docBucket, nameOf, openDocLink, sigDocId, signDocs, useHsDocs, usePeople, type DocKind, type HsDoc, type HsSig } from '@/data/hs';
import { deleteHsDoc, replaceCoshh } from '@/data/hsManager';
import { buildSignedHsPdf } from '@/data/hsPdf';
import { deliverPdf, emailPdf } from '@/lib/pdf';
import { useAuth } from '@/lib/auth';
import { resignDue, signedHeadline, signers } from '@/lib/rules/hs';
import { isManager } from '@/lib/roles';
import type { Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

const d = (t: string | null) => (t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');

export function HsDocList({ kind, site, companyId = null, canManage }: { kind: DocKind; site: Site; companyId?: string | null; canManage?: boolean }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useHsDocs(kind, site, companyId);
  const { data: people } = usePeople();
  const [busy, setBusy] = useState(false);
  const [supOpen, setSupOpen] = useState(false);
  if (!me) return null;
  const manager = canManage ?? isManager(me);
  if (isLoading || !data) return <Muted>Loading…</Muted>;

  const sigsFor = (id: string) => data.sigs.filter((s) => sigDocId(kind, s) === id);
  const mineFor = (id: string) => sigsFor(id).find((s) => s.user_id === me.id);
  const label = DOC_LABEL[kind];
  const toSign = data.docs.filter((r) => manager && kind === 'rams'
    ? !sigsFor(r.id).some((s) => s.issued || s.user_id === me.id)
    : !mineFor(r.id));
  const nameById = Object.fromEntries([...data.docs, ...data.superseded].map((x) => [x.id, x.name]));

  const sign = async (ids: string[]) => {
    if (busy) return;
    setBusy(true);
    const r = await signDocs(kind, me, ids);
    setBusy(false);
    toast(r.msg);
    if (!r.ok && r.needSignature) router.push('/signature');
    if (r.ok) { await qc.invalidateQueries({ queryKey: ['hsDocs', kind, site.id] }); void qc.invalidateQueries({ queryKey: ['hsSummary', site.id] }); }
  };
  const view = async (doc: HsDoc) => {
    const u = await openDocLink(docBucket(kind), doc.storage_path);
    if (u) void Linking.openURL(u); else toast('Could not open the document.');
  };

  return (
    <View>
      {data.docs.length ? data.docs.map((r) => {
        const sigs = sigsFor(r.id);
        const mine = mineFor(r.id);
        const { signed, waiting } = signers(data.roster, sigs);
        const issued = sigs.filter((s) => s.issued);
        const due = resignDue(r, site);
        const canTap = !(manager && (issued.length || mine)) && !(kind !== 'rams' && manager);
        return (
          <Card key={r.id} style={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 16.5, fontWeight: '800', color: base.ink }}>{r.name}</Text>
              {manager && (
                <Pressable hitSlop={8} onPress={async () => {
                  const k = await chooseAction(r.name, [{ key: 'view', label: '👁 View document' }, ...(kind !== 'layout' ? [{ key: 'pdf', label: '📄 Export signed PDF' }, { key: 'email', label: '✉ Email signed PDF' }] : []), ...(kind === 'coshh' ? [{ key: 'replace', label: '🔁 Replace file (resets signatures)' }, { key: 'tolib', label: '📚 Save to COSHH Library' }] : []), { key: 'del', label: '🗑 Delete', danger: true }]);
                  const refresh = () => { void qc.invalidateQueries({ queryKey: ['hsDocs', kind, site.id] }); void qc.invalidateQueries({ queryKey: ['hsSummary', site.id] }); };
                  if (k === 'view') void view(r);
                  else if (k === 'pdf' || k === 'email') {
                    let to = '';
                    if (k === 'email') { const t = await promptText(`Email this signed ${label} PDF to:`, ''); if (t === null) return; to = t.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast('Enter a valid email address.'); return; } }
                    toast('Building signed PDF…');
                    const b = await buildSignedHsPdf(kind as 'rams' | 'coshh', r.id, site).catch(() => 'Could not build the signed PDF.');
                    if (typeof b === 'string') { toast(b); return; }
                    if (k === 'pdf') { if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); return; }
                    toast('Sending…');
                    const err = await emailPdf(b.bytes, b.filename, `${site.id}/${kind}-exports`, { site_id: site.id, recipient_email: to, doc_title: `${b.name} (Signed ${label})` });
                    if (err) showAlert(err); else toast('Emailed');
                  }
                  else if (k === 'tolib') router.push({ pathname: '/sites/[id]/hs/coshh/save', params: { id: site.id, name: r.name, path: r.storage_path } } as never);
                  else if (k === 'replace') {
                    if (!(await confirmAsk('Replace this COSHH document with a new file? Everyone who has already signed will need to sign again.', 'Replace'))) return;
                    const p = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
                    if (p.canceled || !p.assets[0]) return;
                    const err = await replaceCoshh(me, site.id, r, { uri: p.assets[0].uri, name: p.assets[0].name || 'document.pdf' });
                    toast(err ?? 'COSHH document replaced — signatures reset'); refresh();
                  } else if (k === 'del') {
                    if (!(await confirmAsk(`Delete this ${label} document and all its signatures? This cannot be undone.`, 'Delete'))) return;
                    if (await deleteHsDoc(me, kind, site.id, r)) { toast(`${label} document deleted`); refresh(); } else toast('Could not delete — try again.');
                  }
                }}><Text style={{ fontSize: 18, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
              )}
            </View>
            <Muted>
              Uploaded by {nameOf(people, r.uploaded_by)} · {d(r.uploaded_at)}
              {r.supersedes ? ` · Supersedes "${nameById[r.supersedes] || 'an earlier version'}"` : ''}
              {due ? ` · Re-sign due ${due.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
            </Muted>
            <Pressable onPress={() => view(r)}><Text style={{ color: base.blue, marginTop: 4 }}>View document ↗</Text></Pressable>
            {canTap && (
              <Pressable disabled={!!mine || busy} onPress={() => sign([r.id])}
                style={{ marginTop: 8, borderWidth: 1.5, borderStyle: mine ? 'solid' : 'dashed', borderColor: mine ? base.ok : base.line, backgroundColor: mine ? base.okBg : base.card, borderRadius: radius.input, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                {mine ? (
                  <>
                    {mine.signature_image_path
                      ? <StorageImage bucket="signatures" path={mine.signature_image_path} style={{ height: 24, width: 100, resizeMode: 'contain' }} />
                      : <Text style={{ fontWeight: '700' }}>{me.name}</Text>}
                    <Text style={{ color: base.ok, fontWeight: '700' }}>Signed {d(mine.signed_at)}</Text>
                  </>
                ) : <Text style={{ color: base.ink, fontWeight: '700' }}>✍ Tap to {kind === 'rams' && manager ? 'mark as issued' : 'sign'}</Text>}
              </Pressable>
            )}
            {issued.map((s) => (
              <Text key={s.id} style={{ marginTop: 6, color: base.ink }}><Text style={{ fontWeight: '800' }}>ISSUED BY:</Text> {nameOf(people, s.user_id)} · {d(s.signed_at)}</Text>
            ))}
            <SignerList headline={signedHeadline(data.roster.length, waiting.length)} signed={signed} waiting={waiting} people={people} />
          </Card>
        );
      }) : <Empty>No {label} uploaded.</Empty>}

      {data.docs.length > 0 && !(manager && (kind !== 'rams' || !toSign.length)) && (
        <Button busy={busy} disabled={!toSign.length} onPress={() => sign(toSign.map((x) => x.id))}
          title={manager
            ? (toSign.length ? `Mark All RAMS as Issued (${toSign.length})` : 'All RAMS documents marked as issued')
            : (toSign.length ? `Sign All ${label} Documents (${toSign.length} unsigned)` : `All ${label} documents signed`)} />
      )}

      {data.superseded.length > 0 && (
        <>
          <Toggle title={`Superseded Documents (${data.superseded.length})`} open={supOpen} onPress={() => setSupOpen(!supOpen)} />
          {supOpen && data.superseded.map((r) => (
            <Card key={r.id} style={{ padding: 12 }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{r.name}</Text>
              <Muted>Uploaded {r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''} · superseded{r.superseded_by ? ` by "${nameById[r.superseded_by] || 'a newer version'}"` : ''}</Muted>
              <Pressable onPress={() => view(r)}><Text style={{ color: base.blue, marginTop: 4 }}>View document ↗</Text></Pressable>
            </Card>
          ))}
        </>
      )}
    </View>
  );
}

export function SignerList({ headline, signed, waiting, people }: { headline: string; signed: HsSig[]; waiting: string[]; people: { id: string; name: string; role: string }[] | undefined }) {
  if (!headline && !signed.length && !waiting.length) return null;
  return (
    <View style={{ marginTop: 8, padding: 8, backgroundColor: base.paper, borderRadius: 10 }}>
      {!!headline && <Text style={{ fontWeight: '700', color: headline.startsWith('✓') ? base.ok : base.ink, marginBottom: 4 }}>{headline}</Text>}
      {signed.map((s) => <Text key={s.id} style={{ color: base.ink, fontSize: 12.5 }}><Text style={{ color: base.ok, fontWeight: '700' }}>✓</Text> {nameOf(people, s.user_id)} <Text style={{ color: base.slate }}>{d(s.signed_at)}</Text></Text>)}
      {waiting.map((id) => <Text key={id} style={{ color: base.slate, fontSize: 12.5 }}>○ {nameOf(people, id)} not signed yet</Text>)}
    </View>
  );
}
