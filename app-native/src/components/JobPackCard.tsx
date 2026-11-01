// Admin Centre › OneDrive: where the new job pack stands, and the way in to its rules.
import { router } from 'expo-router';
import { Text } from 'react-native';

import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { useJobPackSettings } from '@/data/jobPack';
import { useAuth } from '@/lib/auth';
import { base } from '@/theme/theme';

export function JobPackCard() {
  const { me } = useAuth();
  const { data } = useJobPackSettings(me?.org_id);
  const cfg = data?.config;
  return (
    <Card>
      <SectionTitle>New job pack</SectionTitle>
      <Muted style={{ marginBottom: 8 }}>A new job gets its own OneDrive folder from your rules, and the app files things where the rules say.</Muted>
      {cfg ? <Text style={{ color: base.ink, marginBottom: 8 }}>{cfg.folders.length} folders, {cfg.files.length} documents, {Object.values(cfg.rules).filter((x) => x.on).length} rules on. {data?.enabled ? 'Switched on.' : 'Switched off.'}</Text> : <Text style={{ color: base.ink, marginBottom: 8 }}>Not set up yet.</Text>}
      <Button kind="ghost" title={cfg ? 'Change the rules' : 'Set it up'} onPress={() => router.push('/pm/admin/jobpack' as never)} />
    </Card>
  );
}
