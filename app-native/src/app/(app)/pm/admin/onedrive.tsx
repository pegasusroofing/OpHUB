// Admin Centre › OneDrive (260 integrations; Andy, 8 Nov 2026): the connection, New Jobs, Where Things Save, Quick Links and
// each job's folders. The same page is in Finance (fin/onedrive) for a company with only Finance. components/OneDriveSettings.
import { Stack } from 'expo-router';

import { OneDriveSettings } from '@/components/OneDriveSettings';

export default function OneDriveAdmin() {
  return (
    <>
      <Stack.Screen options={{ title: 'OneDrive' }} />
      <OneDriveSettings />
    </>
  );
}
