import { useQuery } from '@tanstack/react-query';
import { Redirect, Stack, useGlobalSearchParams, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { stackHeader } from '@/components/AppBar';
import { useToast } from '@/components/toast';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';

// Which job pages someone may open, whatever address they type (890 router):
// clients only get the job home, Schedule of Works, H&S and Snagging; non-managers can't open a closed
// job; an operative allocated to a subcontractor company only gets the Main Contractor pages (site
// documents, permits, their company's folder) — the rest of the job goes to their company's folder.
const CLIENT_PAGES = ['schedule', 'hs', 'snagging'];
function useJobGuard(): { to: string; why?: string } | null {
  const { me } = useAuth();
  const seg = useSegments() as string[];
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const at = seg.indexOf('[id]'), onJob = at >= 0 && !!id && id !== 'new';
  const page = onJob ? seg[at + 1] || '' : '';
  const { data: site } = useSite(onJob ? id : undefined);
  const op = !!me && !isManager(me) && me.role !== 'client';
  const { data: subCo } = useQuery({
    queryKey: ['mySubCo', id, me?.id], enabled: onJob && op,
    queryFn: async () => (((await supabase.from('subcontractor_operatives').select('subcontractor_company_id').eq('site_id', id as string).eq('user_id', me!.id).limit(1)).data as { subcontractor_company_id: string }[] | null) ?? [])[0]?.subcontractor_company_id ?? null,
  });
  if (!onJob || !me) return null;
  if (!isManager(me) && site && siteStatusKey(site) === 'closed') return { to: '/sites', why: 'This job is closed.' };
  if (me.role === 'client' && page && page !== 'index' && !CLIENT_PAGES.includes(page)) return { to: `/sites/${id}` };
  if (op && subCo && page !== 'mc') return { to: `/sites/${id}/mc/subcontractors/${subCo}` };
  return null;
}

export default function SitesLayout() {
  const g = useJobGuard();
  const toast = useToast();
  const why = g?.why;
  useEffect(() => { if (why) toast(why); }, [why, toast]);
  if (g) return <Redirect href={g.to as never} />;
  return (
    <Stack screenOptions={stackHeader}>
      <Stack.Screen name="index" options={{ title: 'Projects' }} />
    </Stack>
  );
}
