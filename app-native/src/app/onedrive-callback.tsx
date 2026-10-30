// The phone app's return from the OneDrive sign-in (ophub://onedrive-callback?status=…, 090):
// say whether it worked, refresh the connection and go to Admin › OneDrive.
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';

import { useToast } from '@/components/toast';
import { ONEDRIVE_DONE } from '@/lib/legacyLinks';

export default function OneDriveCallback() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  useEffect(() => {
    Promise.resolve().then(() => WebBrowser.dismissBrowser()).catch(() => undefined); // close the sign-in page if it's ours
    toast(ONEDRIVE_DONE(status));
    void qc.invalidateQueries({ queryKey: ['odStatus'] });
  }, [status, toast, qc]);
  return <Redirect href={'/pm/admin/onedrive' as never} />;
}
