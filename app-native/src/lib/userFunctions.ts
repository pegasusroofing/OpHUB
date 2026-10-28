// Some server functions (OneDrive, private file links) are deployed without
// Supabase's own JWT check and read the signed-in user's token from X-User-Token
// instead — the same headers the current app's sbFetchOD sends.
import { supabase, SUPABASE_ANON_KEY } from '@/lib/supabase';

export async function invokeAsUser<T>(name: string, body: object): Promise<{ data: T | null; error: string | null }> {
  const { data: s } = await supabase.auth.getSession();
  try {
    const r = await supabase.functions.invoke(name, { body, headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'X-User-Token': s.session?.access_token ?? '' } });
    const d = r.data as (T & { error?: string }) | null;
    if (r.error || d?.error) return { data: null, error: d?.error || 'could not reach the server' };
    return { data: d, error: null };
  } catch { return { data: null, error: 'could not reach the server' }; }
}
