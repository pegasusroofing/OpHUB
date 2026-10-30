// OpHUB Finance pages (900–922 in the current app).
import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';

import { stackHeader } from '@/components/AppBar';
import { useToast } from '@/components/toast';
import { useAuth } from '@/lib/auth';
import { isFinanceUser } from '@/lib/roles';

export default function FinLayout() {
  const { me, org } = useAuth();
  const toast = useToast();
  // 900 finGuard: every Finance page, whatever address is typed, needs Finance switched on for you.
  const blocked = !!me && !isFinanceUser(me, org);
  useEffect(() => { if (blocked) toast('OpHUB Finance isn’t switched on for your account.'); }, [blocked, toast]);
  if (blocked) return <Redirect href={'/home' as never} />;
  return (
    <Stack screenOptions={stackHeader} />
  );
}
