// One subcontractor company's hub (550 renderSubcontractorHub). Their Project Manager (is_admin) runs it like our PMs. Like the current
// app's router, only managers, clients and that company's own people get in.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { JobGrid, Muted, Tile } from '@/components/ui';
import { useSite } from '@/data/sites';
import { useSubco, useSubcos } from '@/data/subcontractors';
import { isManager } from '@/lib/roles';
import { useAuth } from '@/lib/auth';
import { page, space } from '@/theme/theme';

export default function SubcoHub() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useSubco(co, me);
  const { data: site } = useSite(id);
  const { data: list } = useSubcos(site, me);
  const allowed = !!me && (isManager(me) || me.role === 'client' || list?.myCompany === co);
  if (me && !allowed) return <Muted style={{ padding: space.l }}>{list ? "You don't have access to this subcontractor." : 'Loading…'}</Muted>;
  if (isLoading || !data) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Subcontractor not found.'}</Muted>;
  const n = data.counts;
  const mine = !!me && !isManager(me) && list?.myCompany === co;
  const go = (p: string) => () => router.push(`/sites/${id}/mc/subcontractors/${co}/${p}` as never);
  const docs = (k: number) => `${k} document${k === 1 ? '' : 's'}`;
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: data.company.name }} />
      {/* Their Project Manager runs their company on the job like our PMs (Andy, 20 Nov 2026): uploads only, no builders. */}
      {mine && data.isAdmin && <Muted style={{ textAlign: 'center', marginBottom: 10 }}>You&apos;re {data.company.name}&apos;s Project Manager on this job. Upload your RAMS, COSHH and Toolbox Talks, log Daily Briefings, add your operatives and close your snags.</Muted>}
      {isManager(me) && !data.hasPm && <Muted style={{ textAlign: 'center', marginBottom: 10 }}>No Project Manager for {data.company.name} yet: invite one from Operatives. They set up their company and upload their documents.</Muted>}
      {/* 550: a tile grid like the Main Contractor page, not a list. */}
      <JobGrid>
      {/* Their own people (20 Nov 2026): this page is their home on the job, so Check In, the induction, the site rules
          and the calendar are here too. */}
      {mine && <Tile icon="📍" tint="#E7E9EE" title="Check In / Out" sub="On site today" onPress={() => router.push(`/sites/${id}/checkin` as never)} />}
      {mine && <Tile icon="🦺" tint="#E7E9EE" title="Site Induction" sub="Before you start" onPress={() => router.push(`/sites/${id}/mc/inductions` as never)} />}
      {mine && <Tile icon="📏" tint="#E7E9EE" title="Site Rules & Layout" sub="Read and sign" onPress={() => router.push(`/sites/${id}/mc/layout` as never)} />}
      {mine && <Tile icon="📅" tint="#E7E9EE" title="Calendar" sub="What's on" onPress={() => router.push(`/sites/${id}/calendar` as never)} />}
      <Tile icon="📄" tint="#E7E9EE" title="RAMS" sub={docs(n.rams)} onPress={go('docs?kind=rams')} />
      <Tile icon="🧪" tint="#E7E9EE" title="COSHH" sub={docs(n.coshh)} onPress={go('docs?kind=coshh')} />
      <Tile icon="📢" tint="#E7E9EE" title="TBT" sub={`${n.tbt} live`} onPress={go('tbt')} />
      <Tile icon="📋" tint="#E7E9EE" title="Schedule of Works" sub={`${n.done} of ${n.tasks} complete`} onPress={go('schedule')} />
      <Tile icon="🧾" tint="#E7E9EE" title="Permits To Work" sub={n.permits ? `${n.permits} open` : 'None open'} onPress={() => router.push(`/sites/${id}/mc/permits?co=${co}` as never)} />
      <Tile icon="🔍" tint="#E7E9EE" title="Inspections" sub={`${n.inspections} file${n.inspections === 1 ? '' : 's'}`} onPress={go('inspections')} />
      <Tile icon="📝" tint="#E7E9EE" title="Daily Briefings" sub={`${n.briefings} logged`} onPress={go('briefings')} />
      <Tile icon="🔧" tint="#E7E9EE" title="Snags" sub={n.snags ? `${n.snags} open` : 'None open'} onPress={go('snags')} />
      <Tile icon="👷" tint="#E7E9EE" title="Operatives" sub={data.isAdmin && mine ? 'Add your operatives' : `${n.operatives} on this job`} onPress={go('operatives')} />
      {/* Their Handover: their O&M manual for the main contractor's (Andy, 20 Nov 2026): managers and the company's admin. */}
      {(isManager(me) || data.isAdmin) && <Tile icon="📘" tint="#E7E9EE" title="Handover" sub={n.om ? `O&M · ${n.omSubmitted} of ${n.om} submitted` : 'O&M manual'} onPress={go('om')} />}
      </JobGrid>
    </ScrollView>
  );
}
