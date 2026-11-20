// The in-app subcontractor form (867): does this operative still need to send it,
// the draft kept on the phone, file uploads, and sending it (admins are told).
import { useQuery } from '@tanstack/react-query';

import { plainGet, plainSet, plainDelete } from '@/lib/kv';
import { subTemplate, type SubDraft, type SubSection } from '@/lib/rules/subform';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: unknown }>;

/** A company's sign-up form questions (Andy, 19 Nov 2026: the form can be edited): its own copy, or the standard form.
 *  Works signed out too (the public sign-up page), through get_subform_template. */
export async function loadSubformTemplate(orgId: string | null | undefined): Promise<{ sections: SubSection[]; custom: boolean }> {
  if (!orgId) return { sections: subTemplate(null), custom: false };
  try {
    const r = await rpc('get_subform_template', { p_org: orgId });
    const raw = r.error ? null : r.data;
    return { sections: subTemplate(raw), custom: Array.isArray(raw) && raw.length > 0 };
  } catch { return { sections: subTemplate(null), custom: false }; }
}
export const useSubformTemplate = (orgId: string | null | undefined) => useQuery({ queryKey: ['subformTemplate', orgId], enabled: !!orgId, queryFn: () => loadSubformTemplate(orgId) });
/** Saves the company's own copy (admins). */
export async function saveSubformTemplate(orgId: string, sections: SubSection[]): Promise<boolean> {
  return !(await db.from('subform_templates').upsert({ org_id: orgId, sections: subTemplate(sections), updated_at: new Date().toISOString() } as never, { onConflict: 'org_id' })).error;
}
/** Back to the standard form (the company's copy is removed). */
export const resetSubformTemplate = async (orgId: string) => !(await db.from('subform_templates').delete().eq('org_id', orgId)).error;

/** Operatives only, unless an admin switched it off for them; done once they've sent one. */
export function useSubformNeeded(me: Profile | null) {
  return useQuery({
    queryKey: ['subformNeeded', me?.id], enabled: !!me && me.role === 'operative',
    queryFn: async () => {
      const p = me as Profile;
      const [prof, sent, subStaff] = await Promise.all([
        db.from('profiles').select('subform_required').eq('id', p.id).maybeSingle(),
        db.from('subcontractor_applications').select('id,status,review_note').eq('user_id', p.id).order('created_at', { ascending: false }).limit(1),
        db.from('subcontractor_operatives').select('is_admin').eq('user_id', p.id),
      ]);
      // A subcontractor's operatives don't fill in the Subcontractor Form; their company's admin does (Andy, 20 Nov 2026).
      const subRows = (subStaff.data as { is_admin: boolean | null }[] | null) ?? [];
      if (subRows.length && !subRows.some((x) => x.is_admin)) return { needed: false, off: true, returned: null as string | null };
      if (sent.error) return { needed: false, off: false, returned: null as string | null };
      const off = (prof.data as { subform_required?: boolean | null } | null)?.subform_required === false;
      const last = ((sent.data as { id: string; status: string; review_note: string | null }[] | null) ?? [])[0];
      // Sent back for more information (18 Nov 2026): needed again, with what's missing.
      const returned = last?.status === 'rejected' ? (last.review_note || 'More information is needed.') : null;
      return { needed: !off && (!last || returned !== null), off, returned, lastId: last?.id ?? null };
    },
  });
}

const key = (uid: string) => `ophub_subform_${uid}`;
/** The draft kept on the phone, else a new one. Their name, email and the mobile they gave on signing up fill any of
 *  those still blank (Andy, 18 Nov 2026: "It needs to pull through the users number from sign up as their contact number"). */
export async function loadSubDraft(me: Profile): Promise<SubDraft> {
  const mine = { contact_name: me.name || '', email: me.email || '', phone: (me as { phone?: string | null }).phone || '' };
  const d = await plainGet<SubDraft>(key(me.id), { data: mine, files: {}, agree: false, signed: me.name || '' });
  const data = { ...d.data } as Record<string, unknown>;
  (Object.keys(mine) as (keyof typeof mine)[]).forEach((k) => { if (!String(data[k] ?? '').trim() && mine[k]) data[k] = mine[k]; });
  return { ...d, data: data as SubDraft['data'] };
}
export const saveSubDraft = (me: Profile, d: SubDraft) => plainSet(key(me.id), d);

export async function uploadSubFile(me: Profile, f: { uri: string; name: string; mimeType?: string | null }): Promise<{ name: string; path: string } | null> {
  try {
    const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const up = await supabase.storage.from('subcontractor-apps').upload(`${me.org_id}/${me.id}/${rid}-${(f.name.replace(/[^a-z0-9.\-]+/gi, '_').slice(0, 100) || 'file')}`, await (await fetch(f.uri)).arrayBuffer(), { contentType: f.mimeType || 'application/octet-stream' });
    return up.error ? null : { name: f.name, path: up.data.path };
  } catch { return null; }
}

/** Sends the form; the company's admins get a message. */
export async function sendSubform(me: Profile, d: SubDraft): Promise<boolean> {
  const files = Object.entries(d.files).flatMap(([label, list]) => list.map((f) => ({ label, name: f.name, path: f.path, bucket: 'subcontractor-apps' })));
  const { company_name, contact_name, email, ...data } = d.data;
  const r = await db.from('subcontractor_applications').insert({ org_id: me.org_id, user_id: me.id, company_name: String(company_name).trim(), contact_name: String(contact_name).trim(), email: String(email).trim().toLowerCase(), phone: String(d.data.phone || '').trim() || null, data, files, signed_name: d.signed.trim() } as never);
  if (r.error) return false;
  await plainDelete(key(me.id));
  try {
    const admins = ((await db.from('profiles').select('id').eq('org_id', me.org_id as string).eq('role', 'admin')).data as { id: string }[] | null) ?? [];
    for (const a of admins.filter((x) => x.id !== me.id)) await db.from('messages').insert({ org_id: me.org_id, site_id: null, sender_id: me.id, audience: 'single', recipient_id: a.id, kind: 'message', body: `${me.name} has filled in their subcontractor form — see Admin › Operatives › ${me.name}.` } as never);
  } catch { /* best effort */ }
  return true;
}

/** Managers: the operative's latest form (or that it's switched off), for their page. */
export function useOperativeSubform(opId: string | undefined) {
  return useQuery({
    queryKey: ['opSubform', opId], enabled: !!opId,
    queryFn: async () => {
      const [r, p] = await Promise.all([
        db.from('subcontractor_applications').select('id,created_at').eq('user_id', opId as string).order('created_at', { ascending: false }).limit(1),
        db.from('profiles').select('subform_required').eq('id', opId as string).maybeSingle(),
      ]);
      return { sent: ((r.data as { id: string; created_at: string }[] | null) ?? [])[0] ?? null, off: (p.data as { subform_required?: boolean | null } | null)?.subform_required === false };
    },
  });
}

/** A form that was sent back: its answers and documents, to start the new one from (18 Nov 2026). */
export async function lastSubAnswers(me: Profile, id: string): Promise<Partial<SubDraft> | null> {
  const r = (await db.from('subcontractor_applications').select('company_name,contact_name,email,phone,data,files').eq('id', id).eq('user_id', me.id).maybeSingle()).data as
    { company_name: string; contact_name: string; email: string; phone: string | null; data: Record<string, unknown> | null; files: { label: string; name: string; path: string }[] | null } | null;
  if (!r) return null;
  const files: Record<string, { name: string; path: string }[]> = {};
  (r.files || []).forEach((f) => { (files[f.label] ||= []).push({ name: f.name, path: f.path }); });
  return { data: { ...(r.data || {}), company_name: r.company_name, contact_name: r.contact_name, email: r.email, phone: r.phone || '' } as SubDraft['data'], files };
}
