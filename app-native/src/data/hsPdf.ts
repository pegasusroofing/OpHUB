// Signed RAMS / COSHH PDFs (610 buildSignedRamsPdfBytes, 620 buildSignedCoshhPdf):
// this signing cycle only, newest signature per person; RAMS adds the issuing
// manager and any clients who signed by emailed link; COSHH adds whoever put it
// on the job as "issued by".
import { docBucket } from '@/data/hs';
import { exportFilename, fetchBytes, PDFDocument } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { currentCycleSigs } from '@/lib/rules/hs';
import { isManager } from '@/lib/roles';
import { buildSignedDocPdf, clientRow, drawSignatureTable, signerRow, type SignLayout, type Signer } from '@/lib/signedPdf';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Sig = { id: string; user_id: string | null; signed_at: string; signature_image_path: string | null; issued?: boolean | null };

function newestPerPerson<S extends Sig>(list: S[]): S[] {
  const newest: Record<string, S> = {};
  list.forEach((s) => { const k = s.user_id || `row:${s.id}`; if (!newest[k] || new Date(s.signed_at) >= new Date(newest[k].signed_at)) newest[k] = s; });
  return list.filter((s) => newest[s.user_id || `row:${s.id}`] === s).sort((a, b) => +new Date(a.signed_at) - +new Date(b.signed_at));
}

export async function buildSignedHsPdf(kind: 'rams' | 'coshh', docId: string, site: Site): Promise<{ bytes: Uint8Array; filename: string; name: string } | string> {
  const table = kind === 'rams' ? 'rams_docs' : 'coshh_docs', sigTable = kind === 'rams' ? 'rams_signatures' : 'coshh_signatures', key = kind === 'rams' ? 'rams_id' : 'coshh_id';
  const doc = ((await db.from(table).select('*').eq('id', docId).maybeSingle()).data as { id: string; name: string; storage_path: string; uploaded_by: string | null; uploaded_at: string; resign_cycle_start: string | null; sign_layout?: SignLayout } | null);
  if (!doc) return 'Document not found.';
  const raw = ((await db.from(sigTable).select('*').eq(key, docId).order('signed_at')).data as (Sig & Record<string, string>)[] | null) ?? [];
  const sigs = newestPerPerson(currentCycleSigs(raw, [doc], key as never, site));
  const clientsRaw = kind === 'rams' ? (((await db.from('rams_client_signatures').select('client_slot,signer_name,client_name,signed_at,signature_path').eq('rams_id', docId).not('signed_at', 'is', null).order('signed_at')).data as { client_slot: number | null; signer_name: string | null; client_name: string | null; signed_at: string; signature_path: string | null }[] | null) ?? []) : [];
  if (!sigs.length && !clientsRaw.length) return kind === 'rams' ? 'No signatures yet.' : 'Could not build the signed PDF — check there are signatures and the source file is a valid PDF.';
  const ids = [...new Set([...sigs.map((s) => s.user_id), doc.uploaded_by].filter((x): x is string => !!x))];
  const profs = ids.length ? (((await db.from('profiles').select('id,name,signature_path').in('id', ids)).data as { id: string; name: string; signature_path: string | null }[] | null) ?? []) : [];
  const nm = (id: string | null) => profs.find((p) => p.id === id)?.name || 'Unknown';
  const src = await fetchBytes(publicUrl(docBucket(kind), doc.storage_path));
  if (!src) return 'Could not open the original document.';
  const disclaimer = `I have read and understood the contents of this ${kind === 'rams' ? 'RAMS' : 'COSHH'} document (${doc.name}). At all times employees must work in a safe manner both to prevent personal injury or injury/harm to others. Anything I did not understand has been explained to me to my satisfaction.`;
  let signers: Signer[], clients: Signer[] = [];
  if (kind === 'rams') {
    signers = sigs.map((s) => signerRow(nm(s.user_id), s.signed_at, s.issued ? s.signature_image_path || profs.find((p) => p.id === s.user_id)?.signature_path || null : s.signature_image_path, !!s.issued));
    const bySlot: Record<number, Signer> = {};
    clientsRaw.forEach((c) => { const slot = c.client_slot || 1; bySlot[slot] = clientRow(slot, c.signer_name || c.client_name || 'Client', c.signed_at, c.signature_path); });
    clients = Object.values(bySlot).sort((a, b) => (a.slot || 0) - (b.slot || 0));
  } else {
    signers = sigs.map((s) => ({ ...signerRow(nm(s.user_id), s.signed_at, s.signature_image_path), name: nm(s.user_id) }));
    if (doc.uploaded_by) {
      const issuer = profs.find((p) => p.id === doc.uploaded_by);
      signers.unshift({ ...signerRow(issuer?.name || nm(doc.uploaded_by), doc.uploaded_at, issuer?.signature_path || null, true), name: issuer?.name || nm(doc.uploaded_by), when: new Date(doc.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) });
    }
  }
  try {
    const pdf = await buildSignedDocPdf(src, { title: doc.name, disclaimer, layout: kind === 'rams' ? doc.sign_layout ?? null : null, signers, clients });
    const filename = exportFilename(site.name, `${doc.name} (Signed)`, 'pdf');
    pdf.setTitle(filename.replace(/\.pdf$/i, ''));
    return { bytes: await pdf.save(), filename, name: doc.name };
  } catch { return 'Could not build the signed PDF — the source file may not be a valid PDF.'; }
}

/** Signed Toolbox Talk (710 buildSignedToolboxTalkPdfBytes): the talk, then the record — conducted / issued by first, then operatives, then 6+ blank rows. */
export async function buildSignedTbtPdf(tbtId: string, site: Site): Promise<{ bytes: Uint8Array; filename: string; name: string } | string> {
  const talk = ((await db.from('toolbox_talks').select('*').eq('id', tbtId).maybeSingle()).data as { id: string; title: string; storage_path: string; created_by: string | null; created_at: string } | null);
  if (!talk) return 'Toolbox Talk not found.';
  const sigs = ((await db.from('toolbox_talk_signatures').select('*').eq('tbt_id', tbtId).order('signed_at')).data as Sig[] | null) ?? [];
  if (!sigs.length) return 'No signatures yet.';
  const ids = [...new Set([...sigs.map((s) => s.user_id), talk.created_by].filter((x): x is string => !!x))];
  const profs = (((await db.from('profiles').select('id,name,role,signature_path').in('id', ids)).data as { id: string; name: string; role: string; signature_path: string | null }[] | null) ?? []);
  const prof = (id: string | null) => profs.find((p) => p.id === id);
  const mgr = (id: string | null) => { const p = prof(id); return !!p && isManager(p as never); };
  const src = await fetchBytes(publicUrl('rams-docs', talk.storage_path));
  if (!src) return 'Could not open the original document.';
  const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const managerSig = sigs.find((s) => mgr(s.user_id));
  const conductor = prof(talk.created_by);
  const issued = `Issued ${new Date(managerSig?.signed_at || talk.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  const conduct: Signer | null = managerSig ? { issued: true, label: 'CONDUCTED / ISSUED BY:', name: prof(managerSig.user_id)?.name || 'Unknown', plainName: '', dateText: '', imagePath: managerSig.signature_image_path, when: issued }
    : conductor ? { issued: true, label: 'CONDUCTED / ISSUED BY:', name: conductor.name, plainName: '', dateText: '', imagePath: conductor.signature_path, when: issued } : null;
  const signers: Signer[] = [
    ...(conduct ? [conduct] : []),
    ...sigs.filter((s) => (!managerSig || s.user_id !== managerSig.user_id) && prof(s.user_id) && !mgr(s.user_id)).map((s) => ({ name: prof(s.user_id)?.name || 'Unknown', plainName: '', dateText: '', when: when(s.signed_at), imagePath: s.signature_image_path })),
  ];
  try {
    const pdf = await PDFDocument.load(src, { ignoreEncryption: true });
    await drawSignatureTable(pdf, { title: talk.title, disclaimer: `I have read and understood the contents of this Toolbox Talk (${talk.title}). At all times employees must work in a safe manner both to prevent personal injury or injury/harm to others. Anything I did not understand has been explained to me to my satisfaction.`, signers, minBlank: 6 });
    const filename = exportFilename(site.name, `${talk.title} (Signed)`, 'pdf');
    pdf.setTitle(filename.replace(/\.pdf$/i, ''));
    return { bytes: await pdf.save(), filename, name: talk.title };
  } catch { return 'Could not build the signed PDF — the source file may not be a valid PDF.'; }
}

/** Signed Site Rules & Layout (540 buildSignedSiteLayoutPdf): the document, then this signing round's signatures. */
export async function buildSignedLayoutPdf(layoutId: string, site: Site): Promise<{ bytes: Uint8Array; filename: string; name: string } | string> {
  const doc = ((await db.from('site_layout_docs').select('*').eq('id', layoutId).maybeSingle()).data as { id: string; name: string; storage_path: string; uploaded_at: string; resign_cycle_start: string | null } | null);
  if (!doc) return 'Document not found.';
  const raw = ((await db.from('site_layout_signatures').select('*').eq('layout_id', layoutId).order('signed_at')).data as (Sig & Record<string, string>)[] | null) ?? [];
  const sigs = currentCycleSigs(raw, [doc], 'layout_id' as never, site) as unknown as Sig[];
  if (!sigs.length) return 'No signatures yet.';
  const ids = [...new Set(sigs.map((s) => s.user_id).filter((x): x is string => !!x))];
  const profs = ids.length ? (((await db.from('profiles').select('id,name').in('id', ids)).data as { id: string; name: string }[] | null) ?? []) : [];
  const src = await fetchBytes(publicUrl('mc-documents', doc.storage_path));
  if (!src) return 'Could not open the original document.';
  try {
    const pdf = await PDFDocument.load(src, { ignoreEncryption: true });
    await drawSignatureTable(pdf, {
      title: doc.name, disclaimer: `I have read and understood this Site Rules & Layout document (${doc.name}) and agree to follow it at all times while on this site.`,
      signers: sigs.map((s) => ({ ...signerRow(profs.find((p) => p.id === s.user_id)?.name || 'Unknown', s.signed_at, s.signature_image_path), name: profs.find((p) => p.id === s.user_id)?.name || 'Unknown' })),
    });
    const filename = exportFilename(site.name, `${doc.name} (Signed)`, 'pdf');
    pdf.setTitle(filename.replace(/\.pdf$/i, ''));
    return { bytes: await pdf.save(), filename, name: doc.name };
  } catch { return 'Could not build the signed PDF — check there are signatures and the source file is a valid PDF.'; }
}
