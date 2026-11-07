// One repair job (Andy, 7 Nov 2026; docs/claude-code/REPAIRS-PLAN.md). Managers and the client get the job hub (no money
// here: Finance opens the same hub with its Money box); an operative gets the check-in and the steps of the works.
import { useLocalSearchParams } from 'expo-router';

import { RepairHub } from '@/components/RepairHub';
import { RepairOperative } from '@/components/RepairOperative';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';

export default function RepairJobPage() {
  const { id, job } = useLocalSearchParams<{ id: string; job: string }>();
  const { me } = useAuth();
  if (!me || !id || !job) return null;
  return isManager(me) || me.role === 'client' ? <RepairHub siteId={id} jobId={job} /> : <RepairOperative siteId={id} jobId={job} />;
}
