// Finance email templates (Andy, 3 Nov 2026): the subject and wording of each kind of Finance email, kept in
// fin_email_templates. One default per kind is picked first in the send pop-up; the others are in its drop-down.
// {client}, {project} and the rest are filled in when the email is made. The sender's name, company details and
// logo are added under the message by send-finance-email; a template can leave the logo off or add more logos.
import { useQuery } from '@tanstack/react-query';

import { fdb } from '@/data/finance';
import { supabase } from '@/lib/supabase';

export type TplKind = 'application' | 'invoice' | 'certificate' | 'credit' | 'po' | 'signatures' | 'hsdocs' | 'pi_query';
export type Tpl = { id: string; kind: TplKind; name: string; subject: string | null; body: string | null; is_default: boolean; show_logo: boolean; logos: string[] };

export const TPL_KINDS: [TplKind, string][] = [['application', 'Application For Payment'], ['invoice', 'Invoice'], ['certificate', 'Payment Certificate'], ['credit', 'Credit Note'], ['po', 'Purchase Order'], ['pi_query', 'Query On A Supplier’s Invoice'], ['signatures', 'Outstanding Signatures (H&S)'], ['hsdocs', 'RAMS / COSHH Documents (H&S)']];

/** The fill-ins each kind of email can use, as add buttons in the template (Andy, 19 Nov 2026: "add in the place holders
 *  that are possible as add buttons"). Each is filled in by the screen that sends that kind of email. */
const NO_LABEL: Record<TplKind, string> = { application: 'Application No.', invoice: 'Invoice No.', certificate: 'Certificate No.', credit: 'Credit Note No.', po: 'PO No.', pi_query: 'Their Invoice No.', signatures: 'Document Type', hsdocs: 'Document Type' };
export function tplFillIns(kind: TplKind): [string, string][] {
  const no: [string, string] = ['{number}', NO_LABEL[kind] || 'Number'];
  const us: [string, string][] = [['{company}', 'Our Company'], ['{my_name}', 'My Name']];
  const job: [string, string][] = [['{project}', 'Project'], ['{job_no}', 'Job No.']];
  if (kind === 'po') return [['{supplier}', 'Supplier'], ...job, no, ['{amount}', 'Amount'], ['{required_by}', 'Required By'], ...us];
  if (kind === 'pi_query') return [['{supplier}', 'Supplier'], ...job, no, ['{amount}', 'Amount'], ...us];
  if (kind === 'signatures' || kind === 'hsdocs') return [['{document}', 'Document Type (RAMS / COSHH)'], ['{client}', 'Client'], ...job, ...us];
  return [['{client}', 'Client'], ...job, no, ['{amount}', 'Amount'], ['{due}', 'Due Date'], ['{client_po}', 'Client PO'], ...us];
}

/** OpHUB's own wording, used until a company saves its own. */
export const TPL_STANDARD: Record<TplKind, { subject: string; body: string }> = {
  application: { subject: 'Application for payment No. {number} — {project}', body: 'Hello,\n\nPlease find attached our application for payment No. {number} for {project}, for {amount} excl. VAT.\n\nPlease fill in the Certified column and send it back to us, or send us your payment certificate.\n\nKind regards,' },
  invoice: { subject: 'Invoice {number} — {project}', body: 'Hello,\n\nPlease find attached invoice {number} for {project}, for {amount}, due {due}.\n\nKind regards,' },
  certificate: { subject: 'Payment certificate No. {number} — {project}', body: 'Hello,\n\nPlease find attached payment certificate No. {number} for {project}.\n\nKind regards,' },
  credit: { subject: 'Credit note {number} — {project}', body: 'Hello,\n\nPlease find attached credit note {number} for {project}.\n\nKind regards,' },
  // {document} is the kind of document, e.g. RAMS or COSHH (Andy, 19 Nov 2026); an older template's {number} still gives the same.
  signatures: { subject: 'Outstanding {document} signatures — {project}', body: 'Hello,\n\nPlease find attached the list of who is still to sign the {document} documents for {project}.\n\nKind regards,' },
  hsdocs: { subject: '{document} — {project}', body: 'Hello,\n\nPlease find attached the signed {document} for {project}.\n\nKind regards,' },
  // Sent back to a supplier about their invoice (Andy, 6 Nov 2026).
  pi_query: { subject: 'Query on your invoice {number} — {project}', body: 'Hello,\n\nWe have a query on your invoice {number} for {project} ({amount}), attached:\n\n\n\nPlease send us a corrected invoice or a credit note, or let us know.\n\nKind regards,' },
  po: { subject: 'Purchase order {number} — {project}', body: 'Hello,\n\nPlease find attached our purchase order {number} for {project}. Please quote the PO number on your delivery note and invoice.\n\nKind regards,' },
};

/** Puts the job's details in place of {client}, {project} and the rest; anything unknown is left as typed. */
export function fillTpl(text: string | null | undefined, vars: Record<string, string>): string {
  return String(text || '').replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export function useTemplates(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['finTpl', orgId], enabled: !!orgId,
    queryFn: async () => (((await fdb.from('fin_email_templates').select('*').eq('org_id', orgId as string).order('name')).data as Tpl[] | null) ?? []).map((t) => ({ ...t, logos: Array.isArray(t.logos) ? t.logos : [] })),
  });
}

/** Saves a template; making it the default takes the default off the others of the same kind. Gives the problem, or null. */
export async function saveTemplate(orgId: string, t: Partial<Tpl> & { kind: TplKind }): Promise<string | null> {
  const row = { org_id: orgId, kind: t.kind, name: String(t.name || '').trim() || 'Template', subject: t.subject || null, body: t.body || null, is_default: !!t.is_default, show_logo: t.show_logo !== false, logos: t.logos || [], updated_at: new Date().toISOString() };
  const r = t.id ? await fdb.from('fin_email_templates').update(row as never).eq('id', t.id).select('id') : await fdb.from('fin_email_templates').insert(row as never).select('id');
  const id = (r.data as { id: string }[] | null)?.[0]?.id;
  if (r.error || !id) return t.kind === 'pi_query' && /check/i.test(r.error?.message || '') ? 'Supplier query templates need switching on first: run SQL 16 in Supabase.' : 'Could not save — try again.';
  if (row.is_default) await fdb.from('fin_email_templates').update({ is_default: false } as never).eq('org_id', orgId).eq('kind', t.kind).neq('id', id);
  return null;
}
export const deleteTemplate = async (id: string) => !(await fdb.from('fin_email_templates').delete().eq('id', id)).error;

/** A logo for the bottom of the email, kept in the company's folder of the public org-logos bucket. Gives its web address. */
export async function uploadTemplateLogo(orgId: string, file: { uri: string; name?: string | null; mimeType?: string | null }): Promise<string | null> {
  const name = String(file.name || 'logo.png').replace(/[^a-z0-9.]+/gi, '-').slice(-60);
  const bytes = new Uint8Array(await (await fetch(file.uri)).arrayBuffer());
  const up = await supabase.storage.from('org-logos').upload(`${orgId}/email/${Date.now()}-${name}`, bytes, { contentType: file.mimeType || 'image/png' });
  if (up.error) return null;
  return supabase.storage.from('org-logos').getPublicUrl(up.data.path).data.publicUrl;
}
