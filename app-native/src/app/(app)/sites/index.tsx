// My projects: live first, then upcoming. Closed jobs aren't shown to operatives.
import { router } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';

import { Empty, Muted, Row, SectionTitle } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { useSites } from '@/data/sites';
import { fullSiteAddress, siteStatusKey } from '@/lib/rules/checkin';
import type { Site } from '@/lib/types';
import { space } from '@/theme/theme';

export default function Sites() {
  const { data, isLoading, refetch, isRefetching, error } = useSites();
  const sites = data ?? [];
  const live = sites.filter((s) => siteStatusKey(s) === 'live');
  const upcoming = sites.filter((s) => siteStatusKey(s) === 'upcoming');
  const row = (s: Site) => (
    <Row key={s.id} title={s.job_number ? `${s.job_number} · ${s.name}` : s.name} sub={fullSiteAddress(s)}
      onPress={() => router.push(`/sites/${s.id}`)} />
  );
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      <HowTo k="sites" />
      {isLoading && <ActivityIndicator style={{ marginTop: 24 }} />}
      {!isLoading && error && !data && <Muted>Couldn't load your projects — check your signal and pull down to try again.</Muted>}
      {!isLoading && !!data && (
        <View>
          <SectionTitle>Live ({live.length})</SectionTitle>
          {live.length ? live.map(row) : <Empty>No live projects.</Empty>}
          {!!upcoming.length && <SectionTitle>Upcoming ({upcoming.length})</SectionTitle>}
          {upcoming.map(row)}
        </View>
      )}
    </ScrollView>
  );
}
