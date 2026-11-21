// Subcontractor close-out (Andy, 20 Nov 2026): the checks from the job, how they're paid (invoice only or applications
// with retention), our PM / site manager's sign-off and the certificate, filed with the job and in OneDrive (8. Handover).
// Database: SQL file 15 (subcontractor_closeouts; fin_subcontracts.subcontractor_company_id).
import { useQuery } from '@tanstack/react-query';

import { packPdfBytes } from '@/data/jobPack';
import { buildCloseoutPdf } from '@/lib/pdfLazy';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { closeoutChecks, type CloseoutFacts } from '@/lib/rules/closeout';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
export type Closeout = {
  id: string; org_id: string; site_id: string; subcontractor_company_id: string; billing_type: 'invoice' | 'application' | null;
  fin_subcontract_id: string | null; order_value: number | null; retention_pct: number | null; pc_date: string | null; defects_end: string | null;
  final_account_agreed: boolean; override_reason: string | null; signed_by: string | null; signed_at: string | null; signature_path: string | null; certificate_path: string | null;
};
export type FinSub = { id: string; number: string | null; name: string | null; order_value: number | null; retention_pct: number | null; subcontractor_company_id: string | null };

/** The close-out row (or null), what the job says about each check, and the job's Finance subcontracts (if they can see Finance). */
export function useCloseout(siteId: string | undefined, companyId: string | undefined) {
  return useQuery({
    queryKey: ['closeout', companyId], enabled: !!siteId && !!companyId,
    queryFn: async () => {
      const co = companyId as string;
      const [row, tasks, om, rams, permits, snags, fin] = await Promise.all([
        db.from('subcontractor_closeouts').select('*').eq('subcontractor_company_id', co).maybeSingle(),
        db.from('schedule_tasks').select('status').eq('site_id', siteId as string).eq('subcontractor_company_id', co),
        db.from('handover_om_manuals').select('submitted_at').eq('subcontractor_company_id', co),
        db.from('rams_docs').select('status,approval_status').eq('subcontractor_company_id', co),
        db.from('permits').select('id').eq('subcontractor_company_id', co).eq('status', 'open'),
        db.from('snags').select('id').eq('subcontractor_company_id', co).eq('status', 'open'),
        db.from('fin_subcontracts').select('id,number,name,order_value,retention_pct,subcontractor_company_id').eq('site_id', siteId as string),
      ]);
      const t = (tasks.data as { status: string }[] | null) ?? [];
      const subs = ((om.data as { submitted_at: string | null }[] | null) ?? []).map((x) => x.submitted_at).filter(Boolean).sort() as string[];
      const r = ((rams.data as { status: string | null; approval_status: string | null }[] | null) ?? []).filter((x) => (x.status || 'current') === 'current');
      const c = (row.data as Closeout | null) ?? null;
      const facts: CloseoutFacts = {
        tasks: t.length, tasksDone: t.filter((x) => x.status === 'done').length, omSubmitted: subs[subs.length - 1] ?? null,
        ramsApproved: r.filter((x) => x.approval_status === 'approved' || !x.approval_status).length, ramsWaiting: r.filter((x) => x.approval_status === 'pending' || x.approval_status === 'rejected').length,
        permitsOpen: ((permits.data as unknown[] | null) ?? []).length, snagsOpen: ((snags.data as unknown[] | null) ?? []).length, finalAgreed: !!c?.final_account_agreed,
      };
      return { row: c, facts, checks: closeoutChecks(facts), finSubs: (fin.data as FinSub[] | null) ?? [] };
    },
  });
}

/** A subcontractor's money on this job (21 Nov 2026), from Finance's subcontract orders linked to the company (or named
 *  after it): the order value, what they've applied for and what's been certified to date (the latest application of each
 *  order), paid and still to pay, retention held, and what's left on the order. */
export type SubcoMoney = { subs: { id: string; number: string | null; name: string | null }[]; order: number; applied: number; certified: number; paid: number; toPay: number; retention: number; remaining: number };
export function useSubcoMoney(siteId: string | undefined, coId: string | undefined, coName: string | undefined, on: boolean) {
  return useQuery({
    queryKey: ['subcoMoney', siteId, coId], enabled: on && !!siteId && !!coId,
    queryFn: async (): Promise<SubcoMoney> => {
      const key = (x: unknown) => String(x || '').trim().toLowerCase();
      const all = ((await db.from('fin_subcontracts').select('id,number,name,order_value,retention_pct,subcontractor_company_id').eq('site_id', siteId as string)).data as (FinSub & { retention_pct: number | null })[] | null) ?? [];
      const mine = all.filter((s) => s.subcontractor_company_id === coId || (!s.subcontractor_company_id && key(s.name) === key(coName)));
      const out: SubcoMoney = { subs: mine.map((s) => ({ id: s.id, number: s.number, name: s.name })), order: 0, applied: 0, certified: 0, paid: 0, toPay: 0, retention: 0, remaining: 0 };
      if (!mine.length) return out;
      type App = { subcontract_id: string; number: number; applied_gross: number | null; certified_gross: number | null; retention: number | null; pay_amount: number | null; status: string | null };
      const apps = ((await db.from('fin_sub_apps').select('subcontract_id,number,applied_gross,certified_gross,retention,pay_amount,status').in('subcontract_id', mine.map((s) => s.id))).data as App[] | null) ?? [];
      mine.forEach((s) => {
        const a = apps.filter((x) => x.subcontract_id === s.id).sort((x, y) => x.number - y.number);
        const lastCert = a.filter((x) => x.certified_gross != null).pop();
        out.order += Number(s.order_value || 0);
        out.applied += Number(a[a.length - 1]?.applied_gross || 0);
        out.certified += Number(lastCert?.certified_gross || 0);
        out.retention += lastCert ? (lastCert.retention != null ? Number(lastCert.retention) : Number(lastCert.certified_gross || 0) * Number(s.retention_pct || 0) / 100) : 0;
        a.forEach((x) => { if (x.status === 'paid') out.paid += Number(x.pay_amount || 0); else if (x.status === 'certified') out.toPay += Number(x.pay_amount || 0); });
      });
      out.remaining = out.order - out.certified;
      return out;
    },
  });
}

/** Saves the close-out's settings (making the row the first time). */
export async function saveCloseout(site: Site, companyId: string, cur: Closeout | null, patch: Partial<Closeout>): Promise<boolean> {
  if (cur) return !!(await db.from('subcontractor_closeouts').update(patch as never).eq('id', cur.id).select('id')).data?.length;
  return !(await db.from('subcontractor_closeouts').insert({ org_id: site.org_id, site_id: site.id, subcontractor_company_id: companyId, ...patch } as never)).error;
}
/** Links (or unlinks) Finance's subcontract to this company, and takes its order value and retention %. */
export async function linkFinSub(site: Site, companyId: string, cur: Closeout | null, fs: FinSub | null): Promise<boolean> {
  if (fs) await db.from('fin_subcontracts').update({ subcontractor_company_id: companyId } as never).eq('id', fs.id);
  return saveCloseout(site, companyId, cur, fs ? { fin_subcontract_id: fs.id, order_value: fs.order_value, retention_pct: fs.retention_pct } : { fin_subcontract_id: null });
}

/** Our PM / site manager signs it off: the certificate is made, filed on the close-out and in the job's OneDrive. */
export async function signCloseout(me: Profile & { signature_path?: string | null }, org: Organization | null, site: Site, companyId: string, company: string, cur: Closeout | null, checks: ReturnType<typeof closeoutChecks>, reason: string | null): Promise<string | null> {
  const now = new Date().toISOString();
  const c = cur ?? ({ billing_type: null, order_value: null, retention_pct: null, pc_date: null, defects_end: null } as unknown as Closeout);
  let out: { bytes: Uint8Array; filename: string };
  try {
    out = await buildCloseoutPdf({ org: org as never, siteName: site.name || '', siteAddress: String(fullSiteAddress(site) || ''), company, checks, billing: c.billing_type, orderValue: c.order_value, retentionPct: c.retention_pct, pcDate: c.pc_date, defectsEnd: c.defects_end, overrideReason: reason, signer: me.name || '', signaturePath: me.signature_path || null, signedAt: now });
  } catch { return 'Could not make the certificate - try again.'; }
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const up = await supabase.storage.from('mc-documents').upload(`${site.id}/closeout/${rid}.pdf`, out.bytes, { contentType: 'application/pdf' });
  if (up.error) return 'Could not save the certificate - check signal and try again.';
  const ok = await saveCloseout(site, companyId, cur, { signed_at: now, signed_by: me.id, signature_path: me.signature_path || null, certificate_path: up.data.path, override_reason: reason });
  if (!ok) return 'The certificate is saved, but the close-out could not be updated - try again.';
  packPdfBytes(site.id, 'closeout_certificate', out.filename, out.bytes);
  return null;
}
