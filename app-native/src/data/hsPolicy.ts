// Company H&S Policy: the current document, my signature, and the compulsory gate.
// Ported from 640-h-s-policy-org-wide-document-everyone-si.js.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { policyGatePending } from '@/lib/rules/hs';
import { isFinanceOnlyOrg } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type PolicyDoc = { id: string; name: string; storage_path: string; uploaded_at: string; uploaded_by: string | null; expiry_date: string | null; resign_cycle_start: string | null };

export function useHsPolicy() {
  const { me, org } = useAuth();
  return useQuery({
    queryKey: ['hsPolicy', me?.id],
    enabled: !!me && !!me.org_id,
    staleTime: 60000,
    queryFn: async () => {
      const p = me as Profile;
      const d = await db.from('hs_policy_docs').select('*').eq('org_id', p.org_id as string).eq('status', 'current').order('uploaded_at', { ascending: false });
      // No signal: never lock someone out (as today).
      if (d.error) return { doc: null as PolicyDoc | null, mine: [] as { signed_at: string; signature_image_path: string | null }[], pending: false };
      const doc = ((d.data as PolicyDoc[] | null) ?? [])[0] ?? null;
      let mine: { signed_at: string; signature_image_path: string | null }[] = [];
      if (doc) {
        const s = await db.from('hs_policy_signatures').select('signed_at,signature_image_path').eq('policy_id', doc.id).eq('user_id', p.id).order('signed_at', { ascending: true });
        if (s.error) return { doc, mine, pending: false };
        mine = (s.data as typeof mine) ?? [];
      }
      return { doc, mine, pending: policyGatePending(p.role, isFinanceOnlyOrg(org), doc, mine) };
    },
  });
}

export async function signHsPolicy(me: Profile & { signature_path?: string | null }, policyId: string): Promise<{ ok: boolean; needSignature?: boolean; msg: string }> {
  if (!me.signature_path) return { ok: false, needSignature: true, msg: 'Adopt your signature first.' };
  const r = await db.from('hs_policy_signatures').insert({ policy_id: policyId, user_id: me.id, signature_image_path: me.signature_path } as never);
  return r.error ? { ok: false, msg: 'Could not save — check your signal and try again.' } : { ok: true, msg: 'Signed — thank you' };
}
