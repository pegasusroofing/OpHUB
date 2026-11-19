// Switching company (Andy, 19 Nov 2026: "top left in the side bar i can change companies"): the company name at the top
// of the menu (laptop sidebar and the phone's ☰ menu) gets a ▾ when the person belongs to two or more companies; tapping
// it lists them. Switching clears the app's saved copies and reloads everything for the chosen company. Beta link only
// for now.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { chooseAction, showAlert } from '@/components/toast';
import { switchCompany, useMyCompanies, type MyCompany } from '@/data/companies';
import { useAuth } from '@/lib/auth';
import { isSwitchSite } from '@/lib/betaOnly';

export function useCompanySwitcher(): { companies: MyCompany[]; multi: boolean; choose: () => Promise<void> } {
  const { me, refresh } = useAuth();
  const qc = useQueryClient();
  const on = isSwitchSite() && !!me && me.role !== 'superadmin';
  const { data: companies = [] } = useMyCompanies(on, me ? `${me.id}:${me.org_id}` : null);
  const multi = on && companies.length > 1;
  const choose = async () => {
    const k = await chooseAction('Switch Company', companies.map((c) => ({ key: c.org_id, label: `${c.is_current ? '✓ ' : ''}${c.name}` })));
    if (!k || companies.find((c) => c.org_id === k)?.is_current) return;
    const err = await switchCompany(k);
    if (err) { showAlert(err); return; }
    qc.clear();
    await refresh();
    router.replace('/home' as never);
  };
  return { companies, multi, choose };
}
