// Sites, addresses and check-in history. Every read goes through the offline
// cache, so pages open with no signal (showing the last good copy).
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabase';
import type { Checkin, Site, SubAddress } from '@/lib/types';

// RLS decides which sites each person can see (operatives: the jobs they're assigned to).
export function useSites() {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['sites', me?.id],
    enabled: !!me,
    queryFn: () => cachedQuery(`sites:${me?.id}`, async () =>
      orThrow(await supabase.from('sites').select('*').order('created_at', { ascending: true })) as Site[]),
  });
}

export function useSite(siteId: string | undefined) {
  const q = useSites();
  return { ...q, data: q.data?.find((s) => s.id === siteId) };
}

export function useSubAddresses(siteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['subAddresses', siteId],
    enabled: !!siteId && enabled,
    queryFn: () => cachedQuery(`subAddresses:${siteId}`, async () =>
      orThrow(await supabase.from('site_sub_addresses').select('*').eq('site_id', siteId as string).order('name', { ascending: true })) as SubAddress[]),
  });
}

// My last few check-ins on a job (or one address of a multi-site job), newest first.
export function useMyCheckins(siteId: string | undefined, subId?: string) {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['myCheckins', siteId, subId ?? null, me?.id],
    enabled: !!siteId && !!me,
    queryFn: () => cachedQuery(`myCheckins:${siteId}:${subId ?? ''}:${me?.id}`, async () => {
      let q = supabase.from('checkins').select('*').eq('site_id', siteId as string).eq('user_id', (me as { id: string }).id);
      if (subId) q = q.eq('sub_site_id', subId);
      return orThrow(await q.order('ts', { ascending: false }).limit(5)) as Checkin[];
    }),
  });
}
