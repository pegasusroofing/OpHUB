import '@/lib/uuidPolyfill';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/lib/webShell';
import { ToastProvider } from '@/components/toast';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useAppFonts } from '@/lib/fonts';
import { startReportSync } from '@/lib/reportOffline';
import { startUploadQueue } from '@/lib/uploadQueue';
import { ThemeProvider } from '@/theme/theme';

// Our own error page: reloads once after a new version went up (18 Nov 2026), else a plain message.
export { AppErrorBoundary as ErrorBoundary } from '@/components/AppErrorBoundary';

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
  const fontsReady = useAppFonts();
  useEffect(() => {
    if (status !== 'loading' && fontsReady) SplashScreen.hideAsync();
    if (status === 'ready') startUploadQueue();
    if (status === 'ready' && me) startReportSync(me);
  }, [status, me, fontsReady]);
  if (status === 'loading' || !fontsReady) return null;
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
        </Stack.Protected>
        {/* Signed in or out (company switching, 19 Nov 2026): signed in, an invite adds its company to that login (beta
            link; elsewhere the page sends a signed-in person home, as before). */}
        <Stack.Screen name="join/[invite]" />
        {/* Reachable signed in or out, like the current app's #/reset. */}
        <Stack.Screen name="reset" />
        {/* The public subcontractor sign-up form (18 Nov 2026), signed in or out. */}
        <Stack.Screen name="subcontractor" />
        {/* Visitor sign-in on a main contractor job (21 Nov 2026): from the job's QR code, no account needed. */}
        <Stack.Screen name="visit/[key]" />
      </Stack>
      </ToastProvider>
    </ThemeProvider>
  );
}
