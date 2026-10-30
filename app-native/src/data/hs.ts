// H&S documents: RAMS, COSHH and toolbox talks — loading, signing, and the saved
// signature. Ported from 580-rams.js, 620-coshh, 630, 710-toolbox-talks.js, 240.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { currentCycleSigs, tbtAllSigned } from '@/lib/rules/hs';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type HsDoc = {
  id: string; site_id: string; name: string; storage_path: string; uploaded_by: string | null; uploaded_at: string | null;
  resign_cycle_start: string | null; status?: string; supersedes?: string | null; superseded_by?: string | null; doc_type?: string;
};
export type HsSig = { id: string; user_id: string | null; signed_at: string | null; signature_image_path: string | null; issued?: boolean | null; rams_id?: string; coshh_id?: string; layout_id?: string; tbt_id?: string };
export type Tbt = { id: string; site_id: string; title: string; storage_path: string; created_by: string | null; created_at: string; status: string };
export type Person = { id: string; name: string; role: string };

/** Everyone in my company I can see (names for signer lists). */
export function usePeople() {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['people', me?.org_id],
    enabled: !!me,
    staleTime: 300000,
    queryFn: () => cachedQuery(`people:${me?.org_id}`, async () => orThrow(await db.from('profiles').select('id,name,role')) as Person[]),
  });
}
export const nameOf = (people: Person[] | undefined, id: string | null | undefined) =>
  (id && people?.find((p) => p.id === id)?.name) || 'Unknown';

async function companyRoster(companyId: string): Promise<string[]> {
  return (((await db.from('subcontractor_operatives').select('user_id').eq('subcontractor_company_id', companyId)).data as { user_id: string }[] | null) ?? []).map((x) => x.user_id);
}
async function operativeRoster(siteId: string): Promise<string[]> {
  const [a, p] = await Promise.all([
    db.from('site_assignments').select('user_id').eq('site_id', siteId),
    db.from('profiles').select('id,role').eq('role', 'operative'),
  ]);
  const ops = new Set(((p.data as { id: string }[] | null) ?? []).map((x) => x.id));
  return ((orThrow(a) as { user_id: string }[]) ?? []).map((x) => x.user_id).filter((id) => ops.has(id));
}

/* ---------- RAMS / COSHH (same shape) ---------- */
export type DocKind = 'rams' | 'coshh' | 'layout';
const T = {
  rams: { docs: 'rams_docs', sigs: 'rams_signatures', key: 'rams_id' as const, bucket: 'rams-docs' },
  coshh: { docs: 'coshh_docs', sigs: 'coshh_signatures', key: 'coshh_id' as const, bucket: 'coshh-docs' },
  // Site Rules & Layout (540): signed like COSHH; no subcontractor copies.
  layout: { docs: 'site_layout_docs', sigs: 'site_layout_signatures', key: 'layout_id' as const, bucket: 'mc-documents' },
};
export const DOC_LABEL: Record<DocKind, string> = { rams: 'RAMS', coshh: 'COSHH', layout: 'Site Rules & Layout' };
/** Which document a signature belongs to. */
export const sigDocId = (kind: DocKind, s: HsSig) => s[T[kind].key];

/** companyId: a subcontractor company's own documents, signed by its allocated operatives. */
export function useHsDocs(kind: DocKind, site: Site | undefined, companyId: string | null = null) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['hsDocs', kind, site?.id, me?.id, companyId],
    enabled: !!site && !!me,
    queryFn: () => cachedQuery(`hsDocs:${kind}:${site?.id}:${me?.id}:${companyId ?? ''}`, async () => {
      const s = site as Site, t = T[kind];
      let cur = db.from(t.docs).select('*').eq('site_id', s.id);
      if (kind !== 'layout') cur = companyId ? cur.eq('subcontractor_company_id', companyId) : cur.is('subcontractor_company_id', null);
      if (kind === 'rams') cur = cur.eq('status', 'current');
      const [docsR, supR, roster] = await Promise.all([
        cur.order('uploaded_at', { ascending: false }),
        kind === 'rams' && !companyId
          ? db.from(t.docs).select('*').eq('site_id', s.id).eq('status', 'superseded').is('subcontractor_company_id', null).order('uploaded_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        companyId ? companyRoster(companyId) : operativeRoster(s.id),
      ]);
      const docs = orThrow(docsR) as HsDoc[];
      let sigs: HsSig[] = [];
      if (docs.length) {
        const r = await db.from(t.sigs).select('*').in(t.key, docs.map((d) => d.id));
        sigs = currentCycleSigs(orThrow(r) as HsSig[], docs, t.key, s);
      }
      return { docs, superseded: orThrow(supR) as HsDoc[], sigs, roster };
    }),
  });
}

export function docBucket(kind: DocKind | 'tbt') { return kind === 'tbt' ? 'rams-docs' : T[kind].bucket; }

export async function openDocLink(bucket: string, path: string): Promise<string | null> {
  const r = await supabase.storage.from(bucket).createSignedUrl(path, 600);
  return r.data?.signedUrl ?? null;
}

export type SignResult = { ok: true; msg: string } | { ok: false; needSignature?: boolean; msg: string };
const NEED_SIG: SignResult = { ok: false, needSignature: true, msg: "Adopt your signature first — one tap and it's used everywhere." };

/**
 * Sign one or more RAMS/COSHH. PMs/admins can't sign COSHH, and on RAMS they
 * "mark as issued" instead (with their signature if they have one).
 */
export async function signDocs(kind: DocKind, me: Profile & { signature_path?: string | null }, docIds: string[]): Promise<SignResult> {
  if (!docIds.length) return { ok: false, msg: 'Already signed everything.' };
  const t = T[kind];
  const manager = ['pm', 'admin', 'site_manager'].includes(me.role);
  if (kind === 'rams' && manager) {
    const r = await db.from(t.sigs).insert(docIds.map((id) => ({ rams_id: id, user_id: me.id, issued: true, signature_image_path: me.signature_path || null })) as never);
    if (r.error) return { ok: false, msg: 'Could not save — check your signal and try again.' };
    return { ok: true, msg: docIds.length === 1 ? 'Marked as issued' : `Marked as issued on ${docIds.length} documents` };
  }
  if (!me.signature_path) return NEED_SIG;
  const r = await db.from(t.sigs).insert(docIds.map((id) => ({ [t.key]: id, user_id: me.id, signature_image_path: me.signature_path })) as never);
  if (r.error) return { ok: false, msg: 'Could not save — check your signal and try again.' };
  return { ok: true, msg: docIds.length === 1 ? 'Signed — archived automatically' : `Signed ${docIds.length} documents` };
}

/* ---------- toolbox talks ---------- */
export function useTbts(site: Site | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['tbts', site?.id, me?.id],
    enabled: !!site && !!me,
    queryFn: () => cachedQuery(`tbts:${site?.id}`, async () =>
      orThrow(await db.from('toolbox_talks').select('*').eq('site_id', (site as Site).id).is('subcontractor_company_id', null).order('created_at', { ascending: false })) as Tbt[]),
  });
}

export function useTbt(tbtId: string | undefined, siteId: string | undefined) {
  return useQuery({
    queryKey: ['tbt', tbtId],
    enabled: !!tbtId && !!siteId,
    queryFn: () => cachedQuery(`tbt:${tbtId}`, async () => {
      const [t, s, roster] = await Promise.all([
        db.from('toolbox_talks').select('*').eq('id', tbtId as string),
        db.from('toolbox_talk_signatures').select('*').eq('tbt_id', tbtId as string).order('signed_at', { ascending: true }),
        operativeRoster(siteId as string),
      ]);
      return { talk: ((orThrow(t) as Tbt[]) ?? [])[0] ?? null, sigs: orThrow(s) as HsSig[], roster };
    }),
  });
}

/** Sign a toolbox talk; if that was the last operative on the job, the talk closes itself. */
export async function signTbt(me: Profile & { signature_path?: string | null }, talk: Tbt): Promise<SignResult & { closed?: boolean }> {
  if (!me.signature_path) return NEED_SIG;
  const r = await db.from('toolbox_talk_signatures').insert({ tbt_id: talk.id, user_id: me.id, signature_image_path: me.signature_path } as never);
  if (r.error) return { ok: false, msg: 'Could not save — check your signal and try again.' };
  try {
    const [roster, sigs] = await Promise.all([
      operativeRoster(talk.site_id),
      db.from('toolbox_talk_signatures').select('user_id').eq('tbt_id', talk.id),
    ]);
    const signed = ((sigs.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id);
    if (tbtAllSigned(roster, signed)) {
      const u = await db.from('toolbox_talks').update({ status: 'completed' } as never).eq('id', talk.id);
      if (!u.error) { void emailCompletedTbt(talk); return { ok: true, msg: 'Everyone has signed — TBT closed automatically', closed: true }; }
    }
  } catch { /* best effort */ }
  return { ok: true, msg: 'Signed' };
}

/* ---------- my signature ---------- */
export async function saveSignature(me: Profile, pngBytes: ArrayBuffer): Promise<string | null> {
  const path = `${me.id}/signature-${Date.now()}.png`;
  const up = await supabase.storage.from('signatures').upload(path, pngBytes, { contentType: 'image/png' });
  if (up.error) return null;
  const r = await db.from('profiles').update({ signature_path: path } as never).eq('id', me.id);
  return r.error ? null : path;
}

/* ---------- H&S folder counts ---------- */
export function useHsSummary(site: Site | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['hsSummary', site?.id, me?.id],
    enabled: !!site && !!me,
    queryFn: () => cachedQuery(`hsSummary:${site?.id}:${me?.id}`, async () => {
      const s = site as Site, uid = (me as Profile).id;
      const [rams, coshh, tbts, ppe] = await Promise.all([
        db.from('rams_docs').select('id,resign_cycle_start,uploaded_at').eq('site_id', s.id).eq('status', 'current').is('subcontractor_company_id', null),
        db.from('coshh_docs').select('id,resign_cycle_start,uploaded_at').eq('site_id', s.id).is('subcontractor_company_id', null),
        db.from('toolbox_talks').select('id').eq('site_id', s.id).eq('status', 'live').is('subcontractor_company_id', null),
        db.from('ppe_issuances').select('id').eq('user_id', uid).eq('status', 'pending_signature'),
      ]);
      const ramsDocs = orThrow(rams) as HsDoc[], coshhDocs = orThrow(coshh) as HsDoc[];
      const pending = async (table: string, key: 'rams_id' | 'coshh_id', docs: HsDoc[]) => {
        if (!docs.length) return 0;
        const r = await db.from(table).select(`${key},signed_at,user_id`).eq('user_id', uid).in(key, docs.map((d) => d.id));
        const valid = currentCycleSigs(orThrow(r) as HsSig[], docs, key, s);
        return docs.length - new Set(valid.map((x) => x[key])).size;
      };
      const [ramsTodo, coshhTodo] = await Promise.all([pending('rams_signatures', 'rams_id', ramsDocs), pending('coshh_signatures', 'coshh_id', coshhDocs)]);
      // 630 for managers: "!" when an operative on the job still has to sign; PPE requests waiting; briefings and incidents counted.
      let mgr: { ramsGap: boolean; coshhGap: boolean; ppeRequests: number; briefings: number; incidents: number } | null = null;
      if (isManager(me)) {
        const [asg, ops, reqs, inc, tpls] = await Promise.all([
          db.from('site_assignments').select('user_id').eq('site_id', s.id),
          db.from('profiles').select('id').eq('role', 'operative'),
          db.from('ppe_requests').select('id').eq('site_id', s.id).eq('status', 'pending'),
          db.from('incident_reports').select('id').eq('site_id', s.id),
          db.from('report_templates').select('id').eq('org_id', (me as Profile).org_id as string).eq('is_daily_briefing', true).eq('archived', false),
        ]);
        const opSet = new Set(((ops.data as { id: string }[] | null) ?? []).map((o) => o.id));
        const roster = [...new Set(((asg.data as { user_id: string }[] | null) ?? []).map((a) => a.user_id).filter((u) => opSet.has(u)))];
        const gap = async (table: string, key: 'rams_id' | 'coshh_id', docs: HsDoc[]) => {
          if (!docs.length || !roster.length) return false;
          const r = await db.from(table).select(`${key},signed_at,user_id`).in(key, docs.map((d) => d.id)).in('user_id', roster);
          const valid = currentCycleSigs((r.data as HsSig[] | null) ?? [], docs, key, s);
          return docs.some((d) => roster.some((u) => !valid.some((x) => x[key] === d.id && (x as { user_id?: string }).user_id === u)));
        };
        const tIds = ((tpls.data as { id: string }[] | null) ?? []).map((t) => t.id);
        const [ramsGap, coshhGap, br] = await Promise.all([gap('rams_signatures', 'rams_id', ramsDocs), gap('coshh_signatures', 'coshh_id', coshhDocs),
          tIds.length ? db.from('report_submissions').select('id').eq('site_id', s.id).in('template_id', tIds) : Promise.resolve({ data: [] })]);
        mgr = { ramsGap, coshhGap, ppeRequests: ((reqs.data as unknown[] | null) ?? []).length, briefings: ((br.data as unknown[] | null) ?? []).length, incidents: ((inc.data as unknown[] | null) ?? []).length };
      }
      return { rams: ramsDocs.length, coshh: coshhDocs.length, liveTbts: (orThrow(tbts) as unknown[]).length, ramsTodo, coshhTodo, ppeToSign: ((ppe.data as unknown[] | null) ?? []).length, mgr };
    }),
  });
}

/**
 * When the last operative signs, the signed talk goes by email to the job's
 * responsible PM, or to every PM / admin (not estimators) if none is set
 * (710 emailCompletedTbtToPM). Best effort: never holds up the signing.
 */
async function emailCompletedTbt(talk: Tbt): Promise<void> {
  try {
    const site = ((await db.from('sites').select('*').eq('id', talk.site_id).limit(1)).data as Site[] | null)?.[0];
    if (!site) return;
    const { buildSignedTbtPdf } = await import('@/data/hsPdf');
    const { emailPdf } = await import('@/lib/pdf');
    const built = await buildSignedTbtPdf(talk.id, site);
    if (typeof built === 'string') return;
    const s = site as Site & { responsible_pm_id?: string | null; org_id?: string | null };
    const people = ((await db.from('profiles').select('id,email,role,is_estimator').eq('org_id', s.org_id as string)).data as { id: string; email: string | null; role: string; is_estimator: boolean | null }[] | null) ?? [];
    const pm = s.responsible_pm_id ? people.find((p) => p.id === s.responsible_pm_id && p.email) : null;
    const to = pm ? [pm.email as string] : people.filter((p) => (p.role === 'pm' || p.role === 'admin') && p.email && !(p.role === 'pm' && p.is_estimator)).map((p) => p.email as string);
    for (const email of to.slice(0, 6)) await emailPdf(built.bytes, built.filename, `${site.id}/tbt-exports`, { site_id: site.id, recipient_email: email, doc_title: `${talk.title || 'Toolbox Talk'} — completed, signed by all operatives` });
  } catch { /* best effort */ }
}
