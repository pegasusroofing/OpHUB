// OpHUB Finance pages (900–922 in the current app).
import { Stack } from 'expo-router';

import { stackHeader } from '@/components/AppBar';

export default function FinLayout() {
  return (
    <Stack screenOptions={stackHeader} />
  );
}
