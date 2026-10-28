// Each role lands on its own home. Phase 0: the homes are empty placeholders;
// their tiles arrive in phases 2-5.
import { Text, View } from 'react-native';

import { Card, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { homeKind, isFinanceUser, roleLabel, type HomeKind } from '@/lib/roles';
import { base, useTheme } from '@/theme/theme';

const HOME_TITLE: Record<HomeKind, string> = {
  superadmin: 'Platform admin',
  finance: 'Finance',
  manager: 'Projects home',
  operative: 'Your day',
  driver: 'Your deliveries',
  client: 'Your projects',
  subcontractor: 'Your company',
  other: 'Home',
};
const HOME_COMING: Record<HomeKind, string> = {
  superadmin: 'Company oversight comes in phase 4.',
  finance: 'Jobs, invoices and the rest of Finance come in phase 5.',
  manager: 'Projects, team, reports and approvals come in phase 3.',
  operative: 'Check-in, your sites and Schedule of Works come in phase 2.',
  driver: 'Your delivery schedule comes in phase 2.',
  client: 'Client screens come in a later phase.',
  subcontractor: 'Subcontractor screens come in a later phase.',
  other: '',
};

export default function Home() {
  const { me, org } = useAuth();
  const t = useTheme();
  const kind = homeKind(me, org);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const first = (me?.name || '').split(' ')[0];
  return (
    <Screen>
      <Text style={{ fontSize: 12.5, color: base.slate, fontWeight: '600' }}>{today}</Text>
      <Text style={{ fontSize: 21, fontWeight: '800', color: base.ink, marginBottom: 14 }}>Hi {first}</Text>
      <View style={{ backgroundColor: t.brand1, borderRadius: 22, padding: 20, marginBottom: 12 }}>
        <Text style={{ color: t.brand1Text, fontSize: 20, fontWeight: '800' }}>{HOME_TITLE[kind]}</Text>
        <Text style={{ color: t.brand1Text, opacity: 0.85, marginTop: 4 }}>{org?.name || 'OpHUB'} · {roleLabel(me)}</Text>
      </View>
      <Card>
        <Muted>{HOME_COMING[kind]}</Muted>
        {kind === 'manager' && isFinanceUser(me, org) && <Muted style={{ marginTop: 8 }}>You have Finance access too.</Muted>}
      </Card>
    </Screen>
  );
}
