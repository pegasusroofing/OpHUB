// Documents (Andy, 1 Nov): a window onto the job's own OneDrive folder for PMs and admins, laid out exactly as it is
// there. Nothing is copied into the app, so it doesn't repeat the other tiles and operatives never see it.
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { OneDriveBrowser } from '@/components/OneDriveBrowser';
import { Muted } from '@/components/ui';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { page, space } from '@/theme/theme';

export default function Documents() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data: site } = useSite(id);
  const s = site as (typeof site & { onedrive_folder_id?: string | null; onedrive_drive_id?: string | null; onedrive_folder_name?: string | null }) | undefined;
  if (!me || !s) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (me.role !== 'pm' && me.role !== 'admin') return <Muted style={{ padding: space.l }}>Project managers and admins only.</Muted>;
  if (!s.onedrive_folder_id) return <Muted style={{ padding: space.l }}>This job has no OneDrive folder yet. Set one up or link one in Project Admin.</Muted>;
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Documents' }} />
      <OneDriveBrowser root={{ id: s.onedrive_folder_id, driveId: s.onedrive_drive_id, name: s.onedrive_folder_name || 'Job folder' }} />
    </ScrollView>
  );
}
