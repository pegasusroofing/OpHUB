// Manager pages reached from the PM / admin home (185 …): all-projects reports,
// to-dos, calendar, the HUB, deliveries, operatives, HR and the Admin Centre.
// Managers only (PMs, admins, site managers): anyone else typing an address here goes Home.
import { Redirect, Stack, useSegments } from 'expo-router';

import { stackHeader } from '@/components/AppBar';
import { useAuth } from '@/lib/auth';
import { isFullManager, isManager } from '@/lib/roles';

export default function PmLayout() {
  const { me } = useAuth();
  const seg = useSegments() as string[];
  if (me && !isManager(me) && me.role !== 'superadmin') return <Redirect href={'/home' as never} />;
  // 890 usesPmHome: All To-dos and All Reports are for PMs and admins, not site managers.
  const page = seg[seg.indexOf('pm') + 1];
  if (me && !isFullManager(me) && me.role !== 'superadmin' && (page === 'todos' || page === 'reports')) return <Redirect href={'/home' as never} />;
  return (
    <Stack screenOptions={stackHeader} />
  );
}
