// Finance email templates (Andy, 3 Nov 2026): the subject and wording of each kind of Finance email, kept in
// fin_email_templates. One default per kind is picked first in the send pop-up; the others are in its drop-down.
// {client}, {project} and the rest are filled in when the email is made. The sender's name, company details and
// logo are added under the message by send-finance-email; a template can leave the logo off or add more logos.
import { useQuery } from '@tanstack/react-query';

import { fdb } from '@/data/finance';
import { supabase } from '@/lib/supabase';

export type TplKind = 'application' | 'invoice' | 'certificate' | 'credit' | 'po' | 'signatures' | 'hsdocs';
export type Tpl = { id: string; kind: TplKind; name: string; subject: string | null; body: string | null; is_default: boolean; show_logo: boolean; logos: string[] };

export const TPL_KINDS: [TplKind, string][] = [['application', 'Application for payment'], ['invoice', 'Invoice'], ['certificate', 'Payment certificate'], ['credit', 'Credit note'], ['po', 'Purchase order'], ['signatures', 'Outstanding signatures (H&S)'], ['hsdocs', 'RAMS / COSHH documents (H&S)']];
export const TPL_FIELDS = '{client} {project} {job_no} {number} {amount} {due} {client_po} {company} {my_name}';

/** OpHUB's own wording, used until a company saves its own. */
export const TPL_STANDARD: Record<TplKind, { subject: string; body: string }> = {
  application: { subject: 'Application for payment No. {number} — {project}', body: 'Hello,\n\nPlease find attached our application for payment No. {number} for {project}, for {amount} excl. VAT.\n\nPlease fill in the Certified column and send it back to us, or send us your payment certificate.\n\nKind regards,' },
  invoice: { subject: 'Invoice {number} — {project}', body: 'Hello,\n\nPlease find attached invoice {number} for {project}, for {amount}, due {due}.\n\nKind regards,' },
  certificate: { subject: 'Payment certificate No. {number} — {project}', body: 'Hello,\n\nPlease find attached payment certificate No. {number} for {project}.\n\nKind regards,' },
  credit: { subject: 'Credit note {number} — {project}', body: 'Hello,\n\nPlease find attached credit note {number} for {project}.\n\nKind regards,' },
  signatures: { subject: 'Outstanding {number} signatures — {project}', body: 'Hello,\n\nPlease find attached the list of who is still to sign the {number} documents for {project}.\n\nKind regards,' },
  hsdocs: { subject: '{number} — {project}', body: 'Hello,\n\nPlease find attached the signed {number} for {project}.\n\nKind regards,' },
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
  if (r.error || !id) return 'Could not save — try again.';
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
