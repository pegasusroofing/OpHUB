// Finance › Settings › OneDrive (Andy, 8 Nov 2026): the same OneDrive page as Admin in Projects, opening on the Finance tab,
// so a company with only Finance has it too. components/OneDriveSettings.
import { Stack } from 'expo-router';

import { OneDriveSettings } from '@/components/OneDriveSettings';
import { Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { canEditFinance } from '@/lib/roles';
import { space } from '@/theme/theme';

export default function FinOneDrive() {
  const { me } = useAuth();
  return (
    <>
      <Stack.Screen options={{ title: 'OneDrive' }} />
      {/* The OneDrive settings are changes: Finance – Edit only (Admin › People › Invites & Roles). */}
      {canEditFinance(me) ? <OneDriveSettings finance /> : <Muted style={{ padding: space.l }}>Your role can view Finance but not change it. Ask your admin (Admin › People › Invites & Roles).</Muted>}
    </>
  );
}
