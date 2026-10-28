import { router } from 'expo-router';

import { Button, Card, Muted, Screen, Title } from '@/components/ui';

export default function NotFound() {
  return (
    <Screen center>
      <Card>
        <Title>Page not found</Title>
        <Muted style={{ marginBottom: 12 }}>That page doesn't exist in the app yet.</Muted>
        <Button title="Go home" onPress={() => router.replace('/')} />
      </Card>
    </Screen>
  );
}
