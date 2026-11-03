// RAMS or COSHH list for operatives: each document with its "tap to sign" box,
// who has/hasn't signed, and Sign All. Ported from ramsDocsHtml / renderRams (580)
// and the COSHH copy (620). Managers also get a ⋮ menu per document (view,
// replace a COSHH file, delete); upload and reminders are in HsDocUpload.
// Added (question for Andy): a "View document" link on each row, so people can
// read the document before signing — the current operative row has none.
// Managers can tick several RAMS / COSHH and export or email them as one signed PDF (580 exportSelectedRams,
// 620 COSHH), with CC me / CC the client.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { testFill } from '@/data/signTemplates';
import { supabase } from '@/lib/supabase';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { ClientSignLines } from '@/components/ClientSignLines';
import { promptEmail } from '@/components/EmailPrompt';
import { StorageImage } from '@/components/StorageImage';
import * as DocumentPicker from 'expo-document-picker';

import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, Toggle, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { DOC_LABEL, docBucket, nameOf, openDocLink, sigDocId, signDocs, useHsDocs, usePeople, type DocKind, type HsDoc, type HsSig } from '@/data/hs';
import { deleteHsDoc, replaceCoshh, uploadHsDoc } from '@/data/hsManager';
import { buildSignedHsPdf, buildSignedLayoutPdf } from '@/data/hsPdf';
import { deliverPdf, emailPdf, fetchBytes, PDFDocument, showPdf } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { useAuth } from '@/lib/auth';
import { resignDue, signers } from '@/lib/rules/hs';
import { isFullManager, isManager } from '@/lib/roles';
import type { Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

const d = (t: string | null) => (t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');

// 580 / 620: each subcontractor's current RAMS or COSHH by company on the job's page — view, export or email the
// signed PDF, or open that company's own page.
function SubDocsByCompany({ site, kind }: { site: Site; kind: 'rams' | 'coshh' }) {
  const { me } = useAuth();
  const toast = useToast();
  const [openFor, setOpenFor] = useState<Record<string, boolean>>({});
  const siteId = site.id, table = kind === 'rams' ? 'rams_docs' : 'coshh_docs', word = kind === 'rams' ? 'RAMS' : 'COSHH';
  const { data } = useQuery({
    queryKey: ['subDocsByCo', kind, siteId],
    queryFn: async () => {
      const cos = ((await supabase.from('subcontractor_companies').select('id,name').eq('site_id', siteId).order('name')).data as { id: string; name: string }[] | null) ?? [];
      if (!cos.length) return [];
      let q = supabase.from(table).select('*').in('subcontractor_company_id', cos.map((c) => c.id));
      if (kind === 'rams') q = q.eq('status', 'current');
      const docs = ((await q.order('uploaded_at', { ascending: false })).data as { id: string; name: string; storage_path: string; uploaded_at: string; subcontractor_company_id: string; doc_type?: string | null }[] | null) ?? [];
      return cos.map((c) => ({ ...c, docs: docs.filter((x) => x.subcontractor_company_id === c.id) })).filter((c) => c.docs.length);
    },
  });
  if (!data?.length || !me) return null;
  const signed = async (id: string, how: 'pdf' | 'email') => {
    let to: Awaited<ReturnType<typeof promptEmail>> = null;
    if (how === 'email') { to = await promptEmail(`Email this signed ${word} PDF to:`, { myEmail: me.email, clientEmail: site.client_email }); if (!to) return; }
    toast('Building signed PDF…');
    const b = await buildSignedHsPdf(kind, id, site).catch(() => 'Could not build the signed PDF.');
    if (typeof b === 'string') { toast(b); return; }
    if (how === 'pdf') { if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); return; }
    const err = await emailPdf(b.bytes, b.filename, `${siteId}/${kind}-exports`, { site_id: siteId, recipient_email: to?.to || '', cc_email: to?.cc, client_cc_email: to?.clientCc, doc_title: `${word} (Signed ${word})` });
    if (err) showAlert(err); else toast('Emailed');
  };
  return (
    <View style={{ marginTop: 14 }}>
      {kind === 'coshh' && <SectionTitle>Subcontractor COSHH</SectionTitle>}
      {data.map((c) => (
        <View key={c.id} style={{ marginBottom: 8 }}>
          <Toggle title={`${c.name} — ${word} (${c.docs.length})`} open={!!openFor[c.id]} onPress={() => setOpenFor({ ...openFor, [c.id]: !openFor[c.id] })} />
          {openFor[c.id] && (
            <View>
              {c.docs.map((x) => (
                <View key={x.id} style={{ padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginTop: 6, backgroundColor: base.card }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{x.name}</Text>
                  <Muted>{x.doc_type || word} · uploaded {new Date(x.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 4 }}>
                    <Text style={{ color: base.blue }} onPress={async () => { const u = await openDocLink(kind === 'rams' ? 'rams-docs' : 'coshh-docs', x.storage_path); if (u) viewDoc(u, /\.pdf$/i.test(x.name) ? x.name : `${x.name}.pdf`); }}>View document ↗</Text>
                    <Text style={{ color: base.blue }} onPress={() => void signed(x.id, 'pdf')}>⬇ Export</Text>
                    <Text style={{ color: base.blue }} onPress={() => void signed(x.id, 'email')}>✉️ Email</Text>
                  </View>
                </View>
              ))}
              <Button kind="ghost" title={`Open ${c.name}'s ${word}`} onPress={() => router.push(`/sites/${siteId}/mc/subcontractors/${c.id}/docs?kind=${kind}` as never)} />
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

/** The chosen documents as one PDF (each signed copy with its sheet, else as uploaded), in list order. */
export async function packHsPdf(kind: DocKind, site: Site, docs: HsDoc[], ids: string[]): Promise<{ bytes: Uint8Array; filename: string; title: string; skipped: string[] } | null> {
  const out = await PDFDocument.create(); const names: string[] = [], skipped: string[] = [];
  const label = DOC_LABEL[kind];
  for (const doc of docs.filter((x) => ids.includes(x.id))) {
    const b = await buildSignedHsPdf(kind as 'rams' | 'coshh', doc.id, site).catch(() => null);
    const bytes = b && typeof b !== 'string' ? b.bytes : await fetchBytes(publicUrl(docBucket(kind), doc.storage_path));
    try {
      if (!bytes) throw new Error('no file');
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p)); names.push(doc.name);
    } catch { skipped.push(doc.name); }
  }
  if (!out.getPageCount()) return null;
  const title = names.length === 1 ? names[0] : `${label} pack (${names.length} documents)`;
  return { bytes: await out.save(), filename: `${title} - ${site.name}`.replace(/[\\/:*?"<>|]+/g, '-') + '.pdf', title, skipped };
}

export function HsDocList({ kind, site, companyId = null, canManage }: { kind: DocKind; site: Site; companyId?: string | null; canManage?: boolean }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useHsDocs(kind, site, companyId);
  const { data: people } = usePeople();
  const [busy, setBusy] = useState(false);
  const [supOpen, setSupOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const narrow = useWindowDimensions().width < 700;
  if (!me) return null;
  const manager = canManage ?? isManager(me);
  const client = me.role === 'client';
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
  // The ticked documents as one signed PDF (each with its signature sheet), in list order.
  const pack = async (ids: string[]) => {
    const out = await PDFDocument.create(); const names: string[] = [];
    for (const id of ids) {
      // Signed copy when anyone has signed, otherwise the document as uploaded (580 ramsBuildPack).
      const b = await buildSignedHsPdf(kind as 'rams' | 'coshh', id, site).catch(() => null);
      const doc = data.docs.find((x) => x.id === id);
      const bytes = b && typeof b !== 'string' ? b.bytes : doc ? await fetchBytes(publicUrl(docBucket(kind), doc.storage_path)) : null;
      try {
        if (!bytes) throw new Error('no file');
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p)); names.push(nameById[id] || label);
      } catch { toast(`Could not add "${nameById[id] || label}" — skipped.`); }
    }
    if (!out.getPageCount()) { toast('Nothing to export.'); return null; }
    const title = names.length === 1 ? names[0] : `${label} pack (${names.length} documents)`;
    return { bytes: await out.save(), filename: `${title} - ${site.name}`.replace(/[\\/:*?"<>|]+/g, '-') + '.pdf', title };
  };
  const emailIds = async (ids: string[]) => {
    const to = await promptEmail(ids.length === 1 ? `Email this signed ${label} PDF to:` : `Email the selected ${label} (${ids.length}) as one PDF to:`, { myEmail: me.email, clientEmail: site.client_email }); if (!to) return;
    setBusy(true); toast('Building signed PDF…');
    try {
      const b = await pack(ids); if (!b) return;
      toast('Sending…');
      const err = await emailPdf(b.bytes, b.filename, `${site.id}/${kind}-exports`, { site_id: site.id, recipient_email: to.to, cc_email: to.cc, client_cc_email: to.clientCc, doc_title: `${b.title} (Signed ${label})` });
      if (err) showAlert(err); else { toast('Emailed'); setSel(new Set()); }
    } finally { setBusy(false); }
  };
  // View shows the signed copy (Andy, 3 Nov 2026): the Issued By row filled with the issuer's name, signature and date,
  // and everyone who has signed. Before anyone has, the document as uploaded.
  const view = async (doc: HsDoc) => {
    if ((kind === 'rams' || kind === 'coshh') && Platform.OS === 'web') {
      const b = await buildSignedHsPdf(kind, doc.id, site).catch(() => null);
      if (b && typeof b !== 'string') { await showPdf(b.bytes, b.filename); return; }
    }
    const u = await openDocLink(docBucket(kind), doc.storage_path);
    if (u) viewDoc(u); else toast('Could not open the document.');
  };

  const ordered = (ids: Set<string>) => data.docs.filter((x) => ids.has(x.id)).map((x) => x.id);
  return (
    <View>
      {manager && kind !== 'layout' && data.docs.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {sel.size > 0 ? (
            <>
              <Text style={{ fontWeight: '700', color: base.ink }}>{sel.size} selected</Text>
              <Button kind="ghost" busy={busy} title="📄 Export as one PDF" onPress={async () => { setBusy(true); toast('Building signed PDF…'); try { const b = await pack(ordered(sel)); if (b && !(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); } finally { setBusy(false); } }} />
              <Button kind="ghost" busy={busy} title="✉ Email" onPress={() => void emailIds(ordered(sel))} />
              <Pressable onPress={() => setSel(new Set())}><Text style={{ color: base.slate }}>Clear</Text></Pressable>
            </>
          ) : <Pressable onPress={() => setSel(new Set(data.docs.map((x) => x.id)))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 15 }}><View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: '#c3c8d0', backgroundColor: '#fff' }} /><Text style={{ color: '#6b7280', fontSize: 13, fontWeight: '500' }}>Select All</Text></Pressable>}
          {kind === 'coshh' && sel.size === 0 && data.docs.some((x) => sigsFor(x.id).length) && <Pressable onPress={async () => {
            const ids = data.docs.filter((x) => sigsFor(x.id).length).map((x) => x.id);
            const cc = site.client_email && (await confirmAsk(`CC client contact (${site.client_name || site.client_email}) on this email?`, 'Yes', 'No')) ? site.client_email : null;
            setBusy(true); toast('Building PDFs…');
            try {
              const b = await pack(ids); if (!b) return;
              const err = await emailPdf(b.bytes, b.filename, `${site.id}/coshh-exports`, { site_id: site.id, recipient_email: me.email || '', client_cc_email: cc, doc_title: `${b.title} (Signed COSHH)` });
              if (err) showAlert(err); else toast(`Signed COSHH emailed to ${me.email}`);
            } finally { setBusy(false); }
          }}><Text style={{ color: base.blue, fontWeight: '700' }}>✉ Email all signed COSHH</Text></Pressable>}
        </View>
      )}
      {data.docs.length ? data.docs.map((r) => {
        const sigs = sigsFor(r.id);
        const mine = mineFor(r.id);
        const { signed, waiting } = signers(data.roster, sigs);
        const issued = sigs.filter((s) => s.issued);
        const due = resignDue(r, site);
        const canTap = !client && !(manager && (issued.length || mine)) && !(kind !== 'rams' && manager);
        return (
          <Card key={r.id} style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
            {/* View and the menu sit to the right, centred on the title and the line under it (Andy, 3 Nov 2026). */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {manager && kind !== 'layout' && <Pressable hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: sel.has(r.id) }} onPress={() => setSel((x) => { const n = new Set(x); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: sel.has(r.id) ? base.blue : '#c3c8d0', backgroundColor: sel.has(r.id) ? base.blue : '#fff', alignItems: 'center', justifyContent: 'center' }}>{sel.has(r.id) && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 }}>✓</Text>}</Pressable>}
              <DocBadge kind={kind} type={r.doc_type} />
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' }}>{docTitle(r.name, site.name)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, paddingLeft: manager && kind !== 'layout' ? 28 : 0 }}>
              <Text numberOfLines={2} style={{ flex: 1, fontSize: 12.5, color: '#6b7280' }}>
                {issued.length ? `Issued by ${issued.map((x) => nameOf(people, x.user_id)).join(', ')}` : `Uploaded by ${nameOf(people, r.uploaded_by)} · ${d(r.uploaded_at)}`}
                {r.supersedes ? ` · Replaces "${nameById[r.supersedes] || 'an earlier version'}"` : ''}
                {due ? ` · Re-sign ${due.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
              </Text>
            </View>
            </View>
              <View style={narrow ? { alignItems: 'flex-end', gap: 6 } : { flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <StatusPill text={issued.length ? `Issued ${d(issued[0].signed_at)}` : kind === 'coshh' && r.uploaded_at && !data.roster.length ? `Issued ${d(r.uploaded_at)}` : data.roster.length ? `${signed.length} of ${data.roster.length} Signed` : 'Not Issued'} tone={issued.length || (kind === 'coshh' && !data.roster.length) || (data.roster.length && !waiting.length) ? 'ok' : waiting.length ? 'warn' : 'grey'} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable onPress={() => view(r)} hitSlop={6} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7, paddingHorizontal: 10, height: 26, justifyContent: 'center' }}><Text style={{ color: '#111827', fontSize: 12.5, fontWeight: '500' }}>View</Text></Pressable>
              {manager && (
                <Pressable hitSlop={8} onPress={async () => {
                  const k = await chooseAction(r.name, [...(kind === 'rams' && !companyId && isFullManager(me) ? [{ key: 'revise', label: '✏️ Revise RAMS' }] : []), // Export and Email live in the row under the list (Andy, 3 Nov 2026).
                    ...(kind === 'layout' && sigsFor(r.id).length ? [{ key: 'pdf', label: '📄 Export signed PDF' }] : []), ...(kind === 'rams' ? [{ key: 'multi', label: `${(r as { sign_layout?: { multi?: boolean } | null }).sign_layout?.multi ? '☑' : '☐'} Multi-page sign required` }, ...((r as { sign_layout?: { multi?: boolean } | null }).sign_layout?.multi ? [{ key: 'boxes', label: '✍ Signature boxes' }, { key: 'testfill', label: '🧪 Test fill the boxes' }] : [])] : []), ...(kind === 'coshh' ? [{ key: 'replace', label: '🔁 Replace file (resets signatures)' }, { key: 'tolib', label: '📚 Save to COSHH Library' }] : []), { key: 'del', label: '🗑 Delete', danger: true }]);
                  const refresh = () => { void qc.invalidateQueries({ queryKey: ['hsDocs', kind, site.id] }); void qc.invalidateQueries({ queryKey: ['hsSummary', site.id] }); };
                  if (k === 'view') void view(r);
                  else if (k === 'revise') {
                    // Built in the app: back into its builder, where Issue re-issues it as the next revision and everyone signs again.
                    const b = ((await supabase.from('rams_builds').select('id').or(`ra_doc_id.eq.${r.id},ms_doc_id.eq.${r.id}`).limit(1)).data as { id: string }[] | null)?.[0];
                    if (b) { router.push(`/sites/${site.id}/hs/rams/build/${b.id}` as never); toast('Make your changes, then Re-issue on the Issue tab'); return; }
                    // Uploaded: the revised PDF replaces it and everyone signs again.
                    if (!(await confirmAsk(`Revise "${r.name}"? Choose the revised PDF — it replaces this one (kept under Superseded) and everyone on the job is asked to sign again.`, 'Choose PDF'))) return;
                    const p = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
                    if (p.canceled || !p.assets[0]) return;
                    setBusy(true);
                    try {
                      const rr = r as HsDoc & { sign_layout?: object | null };
                      const err = await uploadHsDoc(me, 'rams', site.id, { name: r.name, docType: r.doc_type || 'RAMS', supersedesId: r.id, file: { uri: p.assets[0].uri, name: p.assets[0].name || 'rams.pdf' }, signLayout: rr.sign_layout ?? null });
                      toast(err ?? 'RAMS revised and re-issued — everyone will be asked to sign again'); refresh();
                    } finally { setBusy(false); }
                  }
                  else if (k === 'multi') {
                    const cur = (r as { sign_layout?: { multi?: boolean } | null }).sign_layout;
                    const ok = !!(await supabase.from('rams_docs').update({ sign_layout: { v: 2, boxes: [], ...(cur || {}), multi: !cur?.multi } } as never).eq('id', r.id).select('id')).data?.length;
                    toast(ok ? (cur?.multi ? 'Multi-page signing off' : 'Multi-page signing on') : 'Could not save — try again.'); refresh();
                  }
                  else if (k === 'email') void emailIds([r.id]);
                  else if (k === 'pdf') {
                    toast('Building signed PDF…');
                    const b = await (kind === 'layout' ? buildSignedLayoutPdf(r.id, site) : buildSignedHsPdf(kind, r.id, site)).catch(() => 'Could not build the signed PDF.');
                    if (typeof b === 'string') { toast(b); return; }
                    if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.');
                  }
                  else if (k === 'boxes') router.push(`/sites/${site.id}/hs/rams/boxes/${r.id}` as never);
                  else if (k === 'testfill') { toast('Building test fill…'); const row = (await supabase.from('rams_docs').select('name,storage_path,sign_layout').eq('id', r.id).maybeSingle()).data; const e = row ? await testFill(row as never).catch(() => 'Could not build the test fill — please try again.') : 'Document not found.'; if (e) toast(e); }
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
                }} style={{ height: 26, justifyContent: 'center' }}><Text style={{ fontSize: 18, lineHeight: 20, color: base.slate, paddingHorizontal: 4 }}>⋮</Text></Pressable>
              )}
              </View>
              </View>
            </View>
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
            {client && sigsFor(r.id).length > 0 && (
              <View style={{ marginTop: 8 }}><Button small kind="ghost" title="📄 Export Signed PDF" onPress={async () => {
                toast('Building signed PDF…');
                const b = await (kind === 'layout' ? buildSignedLayoutPdf(r.id, site) : buildSignedHsPdf(kind, r.id, site)).catch(() => 'Could not build the signed PDF.');
                if (typeof b === 'string') { toast(b); return; }
                if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.');
              }} /></View>
            )}
            <RowSigners total={data.roster.length} signed={signed} waiting={waiting} people={people} indent={manager && kind !== 'layout'} />
            {kind === 'rams' && manager && !companyId && (r as { sign_layout?: { multi?: boolean } | null }).sign_layout?.multi && <ClientSignLines ramsId={r.id} site={site} />}
          </Card>
        );
      }) : <Empty>No {label} uploaded.</Empty>}

      {data.docs.length > 0 && !client && !(manager && (kind !== 'rams' || !toSign.length)) && (
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
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Pressable onPress={() => view(r)} style={{ flex: 1 }}><Text style={{ color: base.blue }}>View document ↗</Text></Pressable>
                {manager && <Pressable hitSlop={8} accessibilityLabel="Delete superseded version" onPress={async () => {
                  if (!(await confirmAsk(`Delete the superseded "${r.name}" and its signatures? The current version isn't affected. This cannot be undone.`, 'Delete'))) return;
                  if (await deleteHsDoc(me, kind, site.id, r)) void qc.invalidateQueries({ queryKey: ['hsDocs', kind, site.id] }); else toast('Could not delete — try again.');
                }}><Text style={{ fontSize: 16, color: base.red }}>🗑</Text></Pressable>}
              </View>
            </Card>
          ))}
        </>
      )}
      {(kind === 'rams' || kind === 'coshh') && manager && !companyId && <SubDocsByCompany site={site} kind={kind} />}
    </View>
  );
}

/** A small coloured tag for the document type: RA, MS, RAMS, COSHH. */
export function DocBadge({ kind, type, label }: { kind?: DocKind; type?: string | null; label?: string }) {
  const t = label ? label : kind === 'coshh' ? 'COSHH' : kind === 'layout' ? 'Site' : type === 'Risk Assessment' ? 'RA' : type === 'Method Statement' ? 'MS' : 'RAMS';
  const c = t === 'RA' ? ['#fff5f4', '#c81e1e'] : t === 'MS' ? ['#f3f7ff', '#1d4ed8'] : t === 'COSHH' ? ['#fffaf0', '#b45309'] : t === 'TBT' ? ['#f5f3ff', '#6d28d9'] : ['#f1fbf5', '#15803d'];
  return <View style={{ backgroundColor: c[0], borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, minWidth: 34, alignItems: 'center' }}><Text style={{ color: c[1], fontSize: 11, fontWeight: '700' }}>{t}</Text></View>;
}
function StatusPill({ text, tone }: { text: string; tone: 'ok' | 'warn' | 'grey' }) {
  const c = tone === 'ok' ? ['#f1fbf5', '#15803d'] : tone === 'warn' ? ['#fffaf0', '#b45309'] : ['#f3f4f6', '#6b7280'];
  return <View style={{ backgroundColor: c[0], borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 }}><Text numberOfLines={1} style={{ color: c[1], fontSize: 11.5, fontWeight: '600' }}>{text}</Text></View>;
}
/** The name without the job's own name repeated in it ("Method Statement — 123 Test Street — Roof Renewal" → "Method Statement — Roof Renewal"). */
const docTitle = (name: string, siteName: string | null | undefined) => {
  const sn = String(siteName || '').trim();
  return sn ? name.split(' — ').filter((p) => p.trim().toLowerCase() !== sn.toLowerCase()).join(' — ') || name : name;
};

/** Who has signed and who is still to sign, side by side in the row (Andy, 3 Nov 2026). */
export function RowSigners({ total, signed, waiting, people, indent }: { total: number; signed: { id: string; user_id: string | null; signed_at: string | null }[]; waiting: string[]; people: { id: string; name: string; role: string }[] | undefined; indent?: boolean }) {
  const chip = (key: string, text: string, ok: boolean, when?: string | null) => (
    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ok ? '#f1fbf5' : '#fffaf0', borderWidth: 1, borderColor: ok ? '#d3f0de' : '#f8e7c2', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontSize: 12, color: ok ? '#15803d' : '#b45309', fontWeight: '600' }}>{ok ? '✓' : '○'} {text}</Text>
      {!!when && <Text style={{ fontSize: 11, color: '#6b7280' }}>{when}</Text>}
    </View>
  );
  const col = (title: string, n: number, kids: ReactNode[], empty: string) => (
    <View style={{ flex: 1, minWidth: 150, gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: '#6b7280' }}>{title} ({n})</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{kids.length ? kids : <Text style={{ fontSize: 12, color: '#9ca3af' }}>{empty}</Text>}</View>
    </View>
  );
  return (
    <View style={{ marginTop: 10, marginLeft: indent ? 28 : 0, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#f0f1f3', borderRadius: 8 }}>
      {!total ? <Text style={{ fontSize: 12.5, color: '#6b7280' }}>No operatives on this job yet — assign them and they sign here.</Text> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {col('Signed', signed.length, signed.map((x, i) => chip(x.id || `${x.user_id}-${i}`, nameOf(people, x.user_id), true, d(x.signed_at))), 'Nobody yet')}
          {col('Outstanding', waiting.length, waiting.map((id) => chip(id, nameOf(people, id), false)), 'Everyone has signed')}
        </View>
      )}
    </View>
  );
}

export function SignerList({ headline, signed, waiting, people }: { headline: string; signed: HsSig[]; waiting: string[]; people: { id: string; name: string; role: string }[] | undefined }) {
  if (!headline && !signed.length && !waiting.length) return null;
  return (
    <View style={{ marginTop: 10, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#f0f1f3', borderRadius: 8 }}>
      {!!headline && <Text style={{ fontWeight: '700', color: headline.startsWith('✓') ? base.ok : base.ink, marginBottom: 4 }}>{headline}</Text>}
      {signed.map((s) => <Text key={s.id} style={{ color: base.ink, fontSize: 12.5 }}><Text style={{ color: base.ok, fontWeight: '700' }}>✓</Text> {nameOf(people, s.user_id)} <Text style={{ color: base.slate }}>{d(s.signed_at)}</Text></Text>)}
      {waiting.map((id) => <Text key={id} style={{ color: base.slate, fontSize: 12.5 }}>○ {nameOf(people, id)} not signed yet</Text>)}
    </View>
  );
}
