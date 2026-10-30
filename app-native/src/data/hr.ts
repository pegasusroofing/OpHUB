// HR (186-hr.js): holiday calendar data — settings, each person's allowance and
// colour, everyone's time off — plus booking, approving, cancelling, the admin
// settings, and company policies / handbook (upload, sign all, sign handbook).
import { useQuery } from '@tanstack/react-query';

import { messageTo } from '@/data/driver';
import { exportFilename, fetchBytes, PDFDocument } from '@/lib/pdf';
import { publicUrl } from '@/lib/privateFiles';
import { drawSignatureTable } from '@/lib/signedPdf';
import { HR_COLOURS, HR_DEFAULT_ALLOWANCE, HR_DEFAULT_CODES, type Leave } from '@/lib/rules/hr';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;

export type HrSettings = { max_off_at_once: number; approval_required: boolean; type_codes: Record<string, string> };
export type HrPerson = { id: string; name: string; role: string };
export type HrData = { settings: HrSettings; people: HrPerson[]; hp: Record<string, { allowance_days: number | null; colour: string | null }>; leave: Leave[]; allLeave: Leave[] };

let bhEnsured = false;
export function useHr(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['hr', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<HrData> => {
      // Bank holidays are real bookings for PMs / site managers, made once per session.
      if (!bhEnsured) { const r = await Promise.resolve(rpc('hr_ensure_bank_holidays', {})).catch(() => ({ error: true })); bhEnsured = !r.error; }
      const y = new Date().getFullYear();
      const [s, hp, p] = await Promise.all([
        db.from('hr_settings').select('*').eq('org_id', orgId as string).limit(1),
        db.from('hr_people').select('*').eq('org_id', orgId as string),
        db.from('profiles').select('id,name,role').eq('org_id', orgId as string).in('role', ['pm', 'admin', 'site_manager']),
      ]);
      const leave: Leave[] = [];
      for (let from = 0; ; from += 1000) {
        const r = await db.from('hr_leave').select('*').eq('org_id', orgId as string).gte('end_date', `${y - 1}-01-01`).lte('start_date', `${y + 1}-12-31`).order('start_date').order('id').range(from, from + 999);
        const rows = (r.data as Leave[] | null) ?? [];
        leave.push(...rows);
        if (rows.length < 1000) break;
      }
      const row = ((s.data as Partial<HrSettings>[] | null) ?? [])[0] ?? {};
      const settings: HrSettings = { max_off_at_once: 2, approval_required: true, ...row, type_codes: { ...HR_DEFAULT_CODES, ...(row.type_codes || {}) } } as HrSettings;
      const hpMap: HrData['hp'] = {};
      ((hp.data as { user_id: string; allowance_days: number | null; colour: string | null }[] | null) ?? []).forEach((r) => { hpMap[r.user_id] = r; });
      const people = (((p.data as HrPerson[] | null) ?? [])).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return { settings, people, hp: hpMap, leave: leave.filter((l) => l.status !== 'cancelled' && l.status !== 'rejected'), allLeave: leave };
    },
  });
}

export const hrColour = (hr: HrData | undefined, uid: string) => {
  const c = hr?.hp[uid]?.colour; if (c) return c;
  const i = hr ? hr.people.findIndex((p) => p.id === uid) : 0;
  return HR_COLOURS[(i < 0 ? 0 : i) % HR_COLOURS.length];
};
export const hrAllowance = (hr: HrData | undefined, uid: string) => { const v = hr?.hp[uid]?.allowance_days; return v != null ? Number(v) : HR_DEFAULT_ALLOWANCE; };
export const hrCode = (hr: HrData | undefined, type: string) => ((hr?.settings.type_codes[type]) || HR_DEFAULT_CODES[type] || '??').toUpperCase().slice(0, 2);

export async function bookLeave(me: Profile, uid: string, b: { type: string; start: string; end: string; half: string | null; start_part: string | null; end_part: string | null; days: number; link: boolean; note: string; override: boolean }, admins: HrPerson[]): Promise<{ ok: boolean; pending: boolean }> {
  const isAdmin = me.role === 'admin';
  const status = isAdmin || b.type === 'sick' ? 'approved' : 'pending';
  const r = await db.from('hr_leave').insert({
    org_id: me.org_id, user_id: uid, type: b.type, start_date: b.start, end_date: b.end, half: b.half, start_part: b.start_part, end_part: b.end_part, days: b.days, status,
    link_projects: b.link, note: b.note.trim() || null, override_limit: b.override, created_by: me.id,
    ...(status === 'approved' && isAdmin ? { decided_by: me.id, decided_at: new Date().toISOString() } : {}),
  } as never);
  if (r.error) return { ok: false, pending: false };
  if (status === 'pending') {
    const f = (x: string) => new Date(`${x}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const label = { annual: 'Annual leave', training: 'Training course', sick: 'Sick' }[b.type] || b.type;
    for (const a of admins.filter((x) => x.role === 'admin' && x.id !== me.id)) {
      await messageTo(me, a.id, null, 'message', `${me.name} has asked for time off (${label}, ${b.days} day${b.days === 1 ? '' : 's'}: ${f(b.start)}${b.end !== b.start ? ` – ${f(b.end)}` : ''}) — approve it in HR › Holiday calendar › Requests.`);
    }
  }
  return { ok: true, pending: status === 'pending' };
}
export async function decideLeave(me: Profile, id: string, ok: boolean, overrode: boolean): Promise<boolean> {
  return !(await db.from('hr_leave').update({ status: ok ? 'approved' : 'rejected', decided_by: me.id, decided_at: new Date().toISOString(), ...(ok && overrode ? { override_limit: true } : {}) } as never).eq('id', id)).error;
}
export async function cancelLeave(id: string): Promise<boolean> {
  return !(await db.from('hr_leave').update({ status: 'cancelled' } as never).eq('id', id)).error;
}
export async function saveHrSettings(me: Profile, max: number, codes: Record<string, string>, people: { user_id: string; allowance_days: number; colour: string }[]): Promise<boolean> {
  const now = new Date().toISOString();
  const a = await db.from('hr_settings').upsert({ org_id: me.org_id, max_off_at_once: max, approval_required: true, type_codes: codes, updated_at: now } as never, { onConflict: 'org_id' });
  const b = await db.from('hr_people').upsert(people.map((p) => ({ org_id: me.org_id, ...p, updated_at: now })) as never, { onConflict: 'org_id,user_id' });
  return !a.error && !b.error;
}

/* ---------- policies & handbook ---------- */
export type Policy = { id: string; kind: 'policy' | 'handbook'; title: string; storage_path: string; file_name: string | null; uploaded_at: string };
export type PolicySig = { policy_id: string; user_id: string; signed_at: string; signature_image_path?: string | null };
export function usePolicies(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ['hrPolicies', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const pols = ((await db.from('company_policies').select('*').eq('org_id', orgId as string).eq('archived', false).order('uploaded_at')).data as Policy[] | null) ?? [];
      const sigs = pols.length ? (((await db.from('company_policy_signatures').select('policy_id,user_id,signed_at,signature_image_path').in('policy_id', pols.map((p) => p.id)).order('signed_at')).data as PolicySig[] | null) ?? []) : [];
      return { pols, sigs };
    },
  });
}
const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);
export async function uploadPolicies(me: Profile, files: { uri: string; name: string; mimeType?: string | null }[], kind: 'policy' | 'handbook'): Promise<number> {
  let ok = 0;
  for (const f of files) {
    const path = `company-policies/${me.org_id}/${rid()}-${f.name.replace(/[^a-z0-9.-]+/gi, '_')}`;
    const up = await supabase.storage.from('mc-documents').upload(path, await (await fetch(f.uri)).arrayBuffer(), { contentType: f.mimeType || 'application/octet-stream' });
    if (up.error) continue;
    const title = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const r = await db.from('company_policies').insert({ org_id: me.org_id, kind, title: kind === 'handbook' ? title || 'Company handbook' : title, storage_path: up.data.path, file_name: f.name, uploaded_by: me.id, archived: false } as never);
    if (!r.error) ok++;
  }
  return ok;
}
/** Hides it from the list; signatures already collected stay on record. */
export async function archivePolicy(id: string): Promise<boolean> {
  return !(await db.from('company_policies').update({ archived: true } as never).eq('id', id)).error;
}
export async function signPolicies(me: Profile & { signature_path?: string | null }, ids: string[]): Promise<number> {
  const at = new Date().toISOString();
  const res = await Promise.all(ids.map((id) => db.from('company_policy_signatures').insert({ policy_id: id, user_id: me.id, signature_image_path: me.signature_path, signed_at: at } as never)));
  return res.filter((r) => !r.error).length;
}

/* ---------- signed policy record (186 hrBuildPolicyPdf) ---------- */
export async function buildPolicyPdf(p: Policy, sigs: PolicySig[], orgName: string, nameOf: (id: string) => string) {
  let doc: PDFDocument | null = null;
  if (/\.pdf$/i.test(p.file_name || p.storage_path)) {
    const src = await fetchBytes(publicUrl('mc-documents', p.storage_path));
    if (src) { try { doc = await PDFDocument.load(src, { ignoreEncryption: true }); } catch { doc = null; } }
  }
  if (!doc) doc = await PDFDocument.create();
  const disclaimer = p.kind === 'handbook'
    ? `I have read and understood the ${orgName ? `${orgName} ` : ''}company handbook (${p.title}) and agree to follow it.`
    : `I have read and understood this company policy (${p.title}) and agree to follow it.`;
  await drawSignatureTable(doc, {
    title: p.title, disclaimer,
    signers: sigs.filter((s) => s.policy_id === p.id).map((s) => ({ name: nameOf(s.user_id), plainName: '', dateText: '', imagePath: s.signature_image_path ?? null, when: new Date(s.signed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })),
  });
  const filename = exportFilename('', `${p.title} (Signed)`, 'pdf');
  doc.setTitle(filename.replace(/\.pdf$/i, ''));
  return { bytes: await doc.save(), filename };
}
