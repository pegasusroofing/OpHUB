// Visitor sign-in on a main contractor job (Andy, 21 Nov 2026: "a visitor button / qr code for each site that can sign and
// the visitors sign in giving their name number email company and then sign out"). Each job has a visitor link (its own
// key) shown as a QR code; visitors sign in and out on it without an account, through database functions that only do
// that. Managers see today's visitors and can sign one out. Database: site_visitors, visitor_* functions.
import { useQuery } from '@tanstack/react-query';

import { webOrigin } from '@/data/admin';
import { supabase } from '@/lib/supabase';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const rpc = (n: string, a: object) => (supabase as unknown as { rpc: (n: string, a: object) => Promise<{ data: unknown; error: { message?: string } | null }> }).rpc(n, a);

/** The job's visitor sign-in link (the QR code). */
export const visitLink = (key: string) => `${webOrigin() || 'https://app.operativehub.co.uk'}/visit/${key}`;

export type VisitInfo = { site: string; company: string; logo: string | null; colour: string | null };
export async function visitInfo(key: string): Promise<VisitInfo | null> {
  const r = await rpc('visitor_site_info', { p_key: key });
  return r.error ? null : (r.data as VisitInfo | null);
}
export type Visit = { id: string; token: string };
/** Signs a visitor in: the visit, or why not. */
export async function visitorSignIn(key: string, v: { name: string; phone: string; email: string; company: string }): Promise<Visit | string> {
  const r = await rpc('visitor_sign_in', { p_key: key, p_name: v.name, p_phone: v.phone, p_email: v.email, p_company: v.company });
  if (r.error) return String(r.error.message || 'Could not sign in — try again.').replace(/^.*?: /, '');
  const d = r.data as { id: string; token: string } | null;
  return d ? { id: d.id, token: d.token } : 'Could not sign in — try again.';
}
export const visitorSignOut = async (v: Visit) => (await rpc('visitor_sign_out', { p_id: v.id, p_token: v.token })).data === true;
export async function visitStatus(v: Visit): Promise<{ name: string; signed_in_at: string; signed_out_at: string | null } | null> {
  const r = await rpc('visitor_status', { p_id: v.id, p_token: v.token });
  return r.error ? null : (r.data as { name: string; signed_in_at: string; signed_out_at: string | null } | null);
}

/** Their visit, kept on their phone so they can sign out later. */
const store = () => (typeof globalThis !== 'undefined' && 'localStorage' in globalThis ? (globalThis as unknown as { localStorage: Storage }).localStorage : null);
export const savedVisit = (key: string): Visit | null => { try { const s = store()?.getItem(`ophub-visit-${key}`); return s ? (JSON.parse(s) as Visit) : null; } catch { return null; } };
export const keepVisit = (key: string, v: Visit | null) => { try { if (v) store()?.setItem(`ophub-visit-${key}`, JSON.stringify(v)); else store()?.removeItem(`ophub-visit-${key}`); } catch { /* private browsing */ } };

/** A manager's view: today's visitors on the job, and anyone still signed in from before. */
export type SiteVisitor = { id: string; name: string; phone: string | null; email: string | null; company: string | null; signed_in_at: string; signed_out_at: string | null };
export function useSiteVisitors(siteId: string | undefined, on = true) {
  return useQuery({
    queryKey: ['mcTiles', siteId, 'visitors'], enabled: !!siteId && on, refetchInterval: 60000,
    queryFn: async () => {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      const r = (await db.from('site_visitors').select('id,name,phone,email,company,signed_in_at,signed_out_at').eq('site_id', siteId as string).order('signed_in_at', { ascending: false }).limit(300)).data as SiteVisitor[] | null;
      return (r ?? []).filter((v) => !v.signed_out_at || new Date(v.signed_in_at) >= d);
    },
  });
}
export const signOutVisitor = async (id: string, by: string) =>
  !!(await db.from('site_visitors').update({ signed_out_at: new Date().toISOString(), signed_out_by: by } as never).eq('id', id).is('signed_out_at', null).select('id')).data?.length;
