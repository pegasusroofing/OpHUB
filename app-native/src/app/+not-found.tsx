import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';

import { useToast } from '@/components/toast';
import { Button, Card, Muted, Screen, Title } from '@/components/ui';
import { legacyTarget } from '@/lib/legacyLinks';

export default function NotFound() {
  const toast = useToast();
  // An old app.html#/… link (invite, password reset, OneDrive return) goes to its new page.
  const old = legacyTarget();
  useEffect(() => { if (old?.toast) toast(old.toast); }, [old?.toast, toast]);
  if (old) return <Redirect href={old.to as never} />;
  return (
    <Screen center>
      <Card>
        <Title>Page not found</Title>
        <Muted style={{ marginBottom: 12 }}>That page doesn&apos;t exist in the app yet.</Muted>
        <Button title="Go home" onPress={() => router.replace('/')} />
      </Card>
    </Screen>
  );
}
