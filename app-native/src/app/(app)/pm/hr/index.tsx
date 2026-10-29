// HR hub (186 renderHrHub): holiday calendar (days left, requests to approve)
// and company policies & handbook (how many to sign).
import { router, Stack } from 'expo-router';
import { ScrollView } from 'react-native';

import { ListGroup, ListRow } from '@/components/ListRows';
import { Muted } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { hrAllowance, useHr, usePolicies } from '@/data/hr';
import { useAuth } from '@/lib/auth';
import { usedDays } from '@/lib/rules/hr';
import { isManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

export default function HrHub() {
  const { me } = useAuth();
  const { data: hr } = useHr(me?.org_id);
  const { data: pol } = usePolicies(me?.org_id);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const y = new Date().getFullYear();
  const left = hr ? hrAllowance(hr, me.id) - usedDays(hr.leave, me.id, y, ['approved', 'pending']) : null;
  const pending = hr ? hr.allLeave.filter((l) => l.status === 'pending').length : 0;
  const signed = new Set((pol?.sigs ?? []).filter((s) => s.user_id === me.id).map((s) => s.policy_id));
  const toSign = (pol?.pols ?? []).filter((p) => !signed.has(p.id)).length;
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'HR' }} />
      <HowTo k="hr" />
      <ListGroup first>
        <ListRow icon="calendar" tint="green" label="Holiday calendar" sub={left == null ? '…' : `${left} day${left === 1 ? '' : 's'} left this year${me.role === 'admin' && pending ? ` · ${pending} to approve` : ''}`} badge={me.role === 'admin' ? pending || undefined : undefined} onPress={() => router.push('/pm/hr/holidays' as never)} />
        <ListRow icon="book" tint="blue" label="Company policies & handbook" sub={pol ? (toSign ? `${toSign} to read and sign` : 'All signed') : '…'} badge={toSign || undefined} onPress={() => router.push('/pm/hr/policies' as never)} last />
      </ListGroup>
    </ScrollView>
  );
}
