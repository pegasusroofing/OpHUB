import { useQuery } from '@tanstack/react-query';
import { Redirect, Stack, useGlobalSearchParams, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { stackHeader } from '@/components/AppBar';
import { useToast } from '@/components/toast';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { canSeeTile } from '@/lib/rules/hs';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';

// Which job pages someone may open, whatever address they type (890 router):
// clients only get the job home, Schedule of Works, H&S and Snagging; non-managers can't open a closed
// job; an operative allocated to a subcontractor company only gets the Main Contractor pages (site
// documents, permits, their company's folder) — the rest of the job goes to their company's folder.
const CLIENT_PAGES = ['schedule', 'hs', 'snagging'];
// An H&S screen hidden from your role (the H&S tile's who-can-see setting) doesn't open by link either.
const HS_KEY: Record<string, string> = { rams: 'hs_rams', coshh: 'hs_coshh', tbt: 'hs_tbt', briefings: 'hs_briefings', havspuwer: 'hs_havspuwer', havs: 'hs_havs', puwer: 'hs_havspuwer', mytools: 'hs_havspuwer', loler: 'hs_loler', incidents: 'hs_incidents' };
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
  const sub = seg[at + 2] || '';
  // 890 snagging: a client only gets the snag list (no variations, reports or templates by link).
  if (me.role === 'client' && page === 'snagging' && sub && sub !== 'index' && sub !== 'list') return { to: `/sites/${id}/snagging/list` };
  // 890 todos: managers only, except on a repair contract job (its home has a To Do List tile for everyone).
  if (page === 'todos' && !isManager(me) && site && !site.repair_contract) return { to: `/sites/${id}`, why: 'Project managers and admins only.' };
  // 890 mc: everything but Site Rules & Layout needs the job switched on as Main Contractor, and a tile hidden
  // from operatives can't be opened by link (a subcontractor operative still reaches their own company's folder).
  if (page === 'mc' && sub && sub !== 'index' && sub !== 'layout' && site && !site.acting_as_main_contractor) return { to: `/sites/${id}` };
  const mcKey = page === 'mc' ? (sub === 'docs' ? seg[at + 3] || '' : ({ layout: 'site_layout', inductions: 'site_inductions' } as Record<string, string>)[sub] || sub) : '';
  if (mcKey && mcKey !== 'index' && !isManager(me) && site && (site.mc_hidden_tiles ?? []).includes(mcKey) && !(mcKey === 'subcontractors' && subCo)) return { to: `/sites/${id}`, why: 'That page isn’t available on this job.' };
  const hsKey = page === 'ppe' ? 'hs_ppe' : page === 'hs' ? HS_KEY[seg[at + 2] || ''] : undefined;
  // 629 TILE_VIS_DEFAULTS: HAVS and LOLER start as site managers only.
  if (hsKey && site && !canSeeTile(site, hsKey, me.role, hsKey === 'hs_havs' || hsKey === 'hs_loler' ? ['site_manager'] : undefined)) return { to: `/sites/${id}/hs`, why: 'That isn’t available to you on this job.' };
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
