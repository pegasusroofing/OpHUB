import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { startReportSync } from '@/lib/reportOffline';
import { startUploadQueue } from '@/lib/uploadQueue';
import { ThemeProvider } from '@/theme/theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { status, org, me } = useAuth();
  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
    if (status === 'ready') startUploadQueue();
    if (status === 'ready' && me) startReportSync(me);
  }, [status, me]);
  if (status === 'loading') return null;
  const signedIn = status === 'ready';
  return (
    <ThemeProvider org={org}>
      <ToastProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
          <Stack.Screen name="join/[invite]" />
        </Stack.Protected>
        {/* Reachable signed in or out, like the current app's #/reset. */}
        <Stack.Screen name="reset" />
      </Stack>
      </ToastProvider>
    </ThemeProvider>
  );
}
