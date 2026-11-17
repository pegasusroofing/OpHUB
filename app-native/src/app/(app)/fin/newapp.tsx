// Finance › Sales › New Application (Andy, 17 Nov 2026, option A: "I don't like choosing the job with the big drop down
// that pops up ... there is a header where we open a new application that chooses the job"). + New Application opens
// this page: a Project box at the top; type a few letters and the matching jobs drop just under the box; pick one and
// its application opens with its lines. Jobs billed by invoice have no applications, so they aren't offered. A job with
// no Bill of Quantities starts with one line, Contract Works (newApplication).
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FinPage } from '@/components/FinNav';
import { SuggestField, type Suggestion } from '@/components/SuggestField';
import { Card, Muted } from '@/components/ui';
import { finStatus, selectAll } from '@/data/finance';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { canEditFinance } from '@/lib/roles';

export default function NewApplicationPick() {
  const { me } = useAuth();
  const { data: sites = [] } = useSites();
  const { data: billing } = useQuery({
    queryKey: ['finBillingTypes', me?.org_id], enabled: !!me?.org_id, staleTime: 60000,
    queryFn: async () => Object.fromEntries((await selectAll<{ site_id: string; billing_type: string | null }>('job_finance', 'site_id,billing_type', (q) => q.eq('org_id', me?.org_id as string))).map((r) => [r.site_id, r.billing_type])),
  });
  const [q, setQ] = useState('');
  const jobs: Suggestion[] = sites
    .filter((s) => finStatus(s) !== 'closed' && (billing?.[s.id] ?? null) !== 'invoice')
    .map((s) => ({ key: s.id, label: `${s.job_number ? `${s.job_number} · ` : ''}${s.name}`, sub: [s.client_name, finStatus(s) === 'upcoming' ? 'Upcoming' : ''].filter(Boolean).join(' · ') || undefined }));
  if (!me) return null;
  return (
    <FinPage title="New Application" section="sales">
      {!canEditFinance(me) ? <Muted>View Only: starting an application needs Finance – Edit.</Muted> : (
        <View style={{ maxWidth: 640 }}>
          <Card style={{ overflow: 'visible', zIndex: 5 }}>
            <SuggestField label="Project" value={q} onChangeText={setQ} items={jobs} max={8} showAllOnFocus autoFocus
              placeholder="Type The Job Number Or Name" accessibilityLabel="Project"
              onPick={(s) => router.replace(`/fin/job/${s.key}/application/new` as never)} style={{ marginBottom: 0 }} />
          </Card>
          <Muted style={{ marginTop: 4 }}>Choose the project, then its application opens with its lines.</Muted>
        </View>
      )}
    </FinPage>
  );
}
