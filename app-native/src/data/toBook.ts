// "To book" for a PM (9219b renderPmToBook): purchase invoices the office has sent them to put against a
// job (fin_inbox assigned to them), and wages waiting to be booked against prices on their jobs.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { isFullManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';

type Row = Record<string, any>;
const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from>; rpc: typeof supabase.rpc };

export function useToBook(sites: Site[] | undefined) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['toBook', me?.id, (sites ?? []).length], enabled: !!me && isFullManager(me) && !!sites,
    queryFn: async () => {
      const [inv, wp] = await Promise.all([
        db.from('fin_inbox').select('*').eq('assigned_pm', me!.id).eq('status', 'new').order('assigned_at'),
        db.from('wage_pushes').select('*').eq('status', 'pending').order('week_start'),
      ]);
      const mine = new Set((sites ?? []).filter((s) => (s as Site & { responsible_pm_id?: string | null }).responsible_pm_id === me!.id || me!.role === 'admin').map((s) => s.id));
      return { inv: ((inv.data as Row[] | null) ?? []), wages: ((wp.data as Row[] | null) ?? []).filter((w) => mine.has(w.site_id)) };
    },
  });
}
/** Book an invoice from the office to a job (the office then approves it). Returns why not, or null. */
export async function bookToJob(id: string, siteId: string, note: string): Promise<string | null> {
  const r = await db.rpc('fin_inbox_pm_book' as never, { p_id: id, p_site: siteId, p_note: note || null } as never);
  return r.error ? r.error.message || 'Not booked — try again.' : null;
}
export async function sendBack(id: string, text: string): Promise<string | null> {
  const r = await db.rpc('fin_inbox_pm_reply' as never, { p_id: id, p_text: text } as never);
  return r.error ? r.error.message || 'Not sent — try again.' : null;
}
