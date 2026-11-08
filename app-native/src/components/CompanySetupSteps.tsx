// Platform Admin › a company › Setting Up The Company (Andy, 8 Nov 2026): the super admin's steps for a new company, OneDrive
// included, each ticked from what's really there (platform_setup_status: counts and yes / no only). The OneDrive steps are
// done in the company's own Admin › OneDrive, opened here in support mode.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { viewAsOrg } from '@/data/platform';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { base } from '@/theme/theme';

type Status = { admins: number; onedrive: boolean; pack_on: boolean; parent_path: string | null; template_path: string | null; rules_on: number; clients_off: number; jobs_with_folder: number };

export function CompanySetupSteps({ org }: { org: { id: string; name: string; has_pm?: boolean | null } }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: s } = useQuery({
    queryKey: ['platformSetup', org.id],
    queryFn: async () => ((await (supabase.rpc as unknown as (n: string, a: object) => Promise<{ data: unknown }>)('platform_setup_status', { p_org: org.id })).data as Status | null),
  });
  if (!s) return <Muted>Loading the set-up…</Muted>;
  const steps: { done: boolean | null; title: string; sub: string }[] = [
    { done: s.admins > 0, title: 'Company, Plan And First Admin', sub: s.admins ? `${s.admins} admin${s.admins === 1 ? '' : 's'}` : 'No admin yet: send the invite link' },
    { done: s.onedrive, title: 'Connect Their OneDrive', sub: s.onedrive ? 'Connected' : 'Their admin does it (Admin › OneDrive › Connect), signed in to their own Microsoft account' },
    { done: !!s.parent_path && s.pack_on, title: 'Choose Their Folders', sub: s.parent_path ? `New job folders go in ${s.parent_path.split('/').join(' › ')}${s.template_path ? `, built from ${s.template_path.split('/').pop()}` : ', with no template documents'}` : 'Where new job folders go, and their template. No template? Set It Up gives OpHUB’s standard folder list.' },
    { done: s.rules_on > 0, title: 'Where Things Save', sub: s.rules_on ? `${s.rules_on} things saving` : 'Starts from the standard list once folders are chosen' },
    { done: null, title: 'Clients Without Folders', sub: s.clients_off ? `${s.clients_off} client${s.clients_off === 1 ? '' : 's'} set to never (Finance › Directory)` : 'Optional: any clients that never want folders (Finance › Directory)' },
    { done: s.jobs_with_folder > 0, title: 'Test Job', sub: s.jobs_with_folder ? `${s.jobs_with_folder} job${s.jobs_with_folder === 1 ? '' : 's'} with a folder` : 'Make a test job, check its folder is built, then delete it' },
  ];
  const next = steps.findIndex((x) => x.done === false);
  return (
    <View style={{ marginVertical: 8 }}>
      <Muted style={{ fontWeight: '600', marginBottom: 4 }}>Setting Up The Company</Muted>
      {steps.map((x, i) => (
        <View key={x.title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: x.done ? base.ink : '#fff', borderWidth: i === next ? 2 : 1.5, borderColor: x.done ? base.ink : i === next ? '#E3262B' : '#C9CDD3' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: x.done ? '#fff' : i === next ? '#E3262B' : base.slate }}>{x.done ? '✓' : i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: base.ink }}>{x.title}</Text><Muted style={{ fontSize: 12 }}>{x.sub}</Muted></View>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 6 }}>
        <Button small title="Open Their OneDrive Settings ›" onPress={async () => {
          if (!(await confirmAsk(`Open ${org.name}'s OneDrive settings as their admin? Use Exit on the bar at the top to come back.`, 'Open'))) return;
          const err = await viewAsOrg(org.id); if (err) { toast(`Could not switch — ${err}`); return; }
          qc.clear(); await refresh();
          router.push((org.has_pm === false ? '/fin/onedrive' : '/pm/admin/onedrive') as never);
        }} />
      </View>
    </View>
  );
}
