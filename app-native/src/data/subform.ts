// The in-app subcontractor form (867): does this operative still need to send it,
// the draft kept on the phone, file uploads, and sending it (admins are told).
import { useQuery } from '@tanstack/react-query';

import { plainGet, plainSet, plainDelete } from '@/lib/kv';
import type { SubDraft } from '@/lib/rules/subform';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

/** Operatives only, unless an admin switched it off for them; done once they've sent one. */
export function useSubformNeeded(me: Profile | null) {
  return useQuery({
    queryKey: ['subformNeeded', me?.id], enabled: !!me && me.role === 'operative',
    queryFn: async () => {
      const p = me as Profile;
      const [prof, sent] = await Promise.all([
        db.from('profiles').select('subform_required').eq('id', p.id).maybeSingle(),
        db.from('subcontractor_applications').select('id').eq('user_id', p.id).limit(1),
      ]);
      if (sent.error) return { needed: false, off: false };
      const off = (prof.data as { subform_required?: boolean | null } | null)?.subform_required === false;
      return { needed: !off && !((sent.data as unknown[] | null) ?? []).length, off };
    },
  });
}

const key = (uid: string) => `ophub_subform_${uid}`;
export const loadSubDraft = (me: Profile): Promise<SubDraft> => plainGet<SubDraft>(key(me.id), { data: { contact_name: me.name || '', email: me.email || '', phone: (me as { phone?: string | null }).phone || '' }, files: {}, agree: false, signed: me.name || '' });
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
