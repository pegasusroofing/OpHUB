import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { useToast } from '@/components/toast';
import { useAuth } from '@/lib/auth';
import { legacyTarget } from '@/lib/legacyLinks';

export default function Index() {
  const { status } = useAuth();
  const toast = useToast();
  const old = legacyTarget();
  useEffect(() => { if (old?.toast) toast(old.toast); }, [old?.toast, toast]);
  if (old) return <Redirect href={old.to as never} />;
  return <Redirect href={status === 'ready' ? '/home' : '/login'} />;
}
