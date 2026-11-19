// Company switching on one login (Andy, 19 Nov 2026: "i want one login email and switch ... anyone can have two logins
// ... make it secure"). The companies I belong to, switching between them, adding one with that company's own invite,
// my email for each company, and (admins) who else has access to this company. The rules are all in the database
// (docs/claude-code/sql/company-switching-19nov.sql); these only call them.
import { useQuery } from '@tanstack/react-query';

import { clearOfflineCache } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';

const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a?: object) => Promise<{ data: unknown; error: unknown }>;
export type MyCompany = { org_id: string; name: string; logo_path: string | null; role: string | null; work_email: string | null; is_current: boolean };
export type ElsewhereMember = { user_id: string; name: string | null; work_email: string | null; role: string | null; last_used_at: string | null };

const SAY: Record<string, string> = {
  not_a_member: "You don't have access to that company.",
  invite_not_valid: "This invite link isn't valid - it may have been used or expired. Ask for a new one.",
  invite_for_another_email: 'This invite was sent to a different email from the one you sign in with. Ask for an invite to your sign-in email.',
  already_member: 'That company is already on your account.',
  email_in_use: 'Another account already uses that email.',
  bad_email: 'Enter a proper email address.',
  in_this_company_now: "They're in this company right now - use Remove on their row instead.",
  superadmin_uses_open_company: 'The platform owner opens companies from Platform Admin instead.',
};
const say = (d: { error?: string } | null, fallback: string) => (d?.error && SAY[d.error]) || fallback;

export function useMyCompanies(enabled: boolean, meKey: string | null | undefined) {
  return useQuery({
    queryKey: ['myCompanies', meKey], enabled: enabled && !!meKey, staleTime: 60_000,
    queryFn: async () => ((await rpc('my_companies')).data as MyCompany[] | null) ?? [],
  });
}
/** Switch to another of my companies. The app's saved copies are cleared so nothing from one company shows in the other. */
export async function switchCompany(orgId: string): Promise<string | null> {
  const r = await rpc('switch_company', { p_org_id: orgId });
  const d = r.data as { ok?: boolean; error?: string } | null;
  if (r.error || !d?.ok) return say(d, 'Could not switch company - check your signal and try again.');
  await clearOfflineCache();
  return null;
}
export async function joinCompanyWithInvite(inviteId: string): Promise<{ orgId: string; company: string } | string> {
  const r = await rpc('join_company_with_invite', { p_invite_id: inviteId });
  const d = r.data as { ok?: boolean; error?: string; org_id?: string; company?: string } | null;
  if (r.error || !d?.ok || !d.org_id) return say(d, 'Could not add the company - try again.');
  return { orgId: d.org_id, company: d.company || 'the company' };
}
export async function setCompanyEmail(orgId: string, email: string): Promise<string | null> {
  const r = await rpc('set_company_email', { p_org_id: orgId, p_email: email });
  const d = r.data as { ok?: boolean; error?: string } | null;
  return r.error || !d?.ok ? say(d, 'Could not save the email - try again.') : null;
}
export function useAccessElsewhere(enabled: boolean, orgId: string | null | undefined) {
  return useQuery({ queryKey: ['accessElsewhere', orgId], enabled: enabled && !!orgId, queryFn: async () => ((await rpc('company_access_elsewhere')).data as ElsewhereMember[] | null) ?? [] });
}
export async function removeCompanyAccess(userId: string): Promise<string | null> {
  const r = await rpc('remove_company_access', { p_user_id: userId });
  const d = r.data as { ok?: boolean; error?: string } | null;
  return r.error || !d?.ok ? say(d, 'Could not remove their access - try again.') : null;
}
