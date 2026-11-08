// Finance › Settings › OneDrive (Andy, 8 Nov 2026): the same OneDrive page as Admin in Projects, opening on the Finance tab,
// so a company with only Finance has it too. components/OneDriveSettings.
import { Stack } from 'expo-router';

import { OneDriveSettings } from '@/components/OneDriveSettings';

export default function FinOneDrive() {
  return (
    <>
      <Stack.Screen options={{ title: 'OneDrive' }} />
      <OneDriveSettings finance />
    </>
  );
}
