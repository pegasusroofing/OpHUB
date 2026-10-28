// A subcontractor's own RAMS or COSHH (550 renderSubRams / renderSubCoshh):
// signed by that company's allocated operatives. RTB managers and the company's
// admin operative upload and manage.
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { HsDocList } from '@/components/HsDocList';
import { HsDocUpload } from '@/components/HsDocUpload';
import { Muted } from '@/components/ui';
import { useSite } from '@/data/sites';
import { useSubco } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { space } from '@/theme/theme';

export default function SubcoDocs() {
  const { id, co, kind } = useLocalSearchParams<{ id: string; co: string; kind: 'rams' | 'coshh' }>();
  const { me } = useAuth();
  const { data: site } = useSite(id);
  const { data } = useSubco(co, me);
  if (!me || !site || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const k = kind === 'coshh' ? 'coshh' : 'rams';
  const manage = isManager(me) || data.isAdmin;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: `${data.company.name} — ${k === 'rams' ? 'RAMS' : 'COSHH'}` }} />
      {manage && <HsDocUpload kind={k} site={site} companyId={co} />}
      <HsDocList kind={k} site={site} companyId={co} canManage={manage} />
    </ScrollView>
  );
}
