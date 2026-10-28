// PPE, operative side: my current kit, sign for kit issued to me, request kit.
// Ported from 650-ppe-issuance-requests-log.js. The PM/admin side (issue, fulfil,
// site log, exports) comes with the PM screens.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import type { Issuance } from '@/lib/rules/ppe';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type PpeIssuance = Issuance & { issued_by: string | null; site_id: string | null };
export type PpeRequest = { id: string; item_name: string; status: string; date_needed: string | null; created_at: string };

export function useMyPpe() {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['myPpe', me?.id],
    enabled: !!me,
    queryFn: () => cachedQuery(`myPpe:${me?.id}`, async () => {
      const uid = (me as Profile).id;
      const [i, r] = await Promise.all([
        db.from('ppe_issuances').select('*').eq('user_id', uid).order('issued_at', { ascending: false }),
        db.from('ppe_requests').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      ]);
      return { issuances: orThrow(i) as PpeIssuance[], requests: orThrow(r) as PpeRequest[] };
    }),
  });
}

export async function signPpe(me: Profile & { signature_path?: string | null }, id: string): Promise<{ ok: boolean; needSignature?: boolean; msg: string }> {
  if (!me.signature_path) return { ok: false, needSignature: true, msg: "Adopt your signature first — one tap and it's used everywhere." };
  const r = await db.from('ppe_issuances').update({ status: 'signed', signed_at: new Date().toISOString(), signature_image_path: me.signature_path } as never).eq('id', id);
  return r.error ? { ok: false, msg: 'Could not save — check your signal and try again.' } : { ok: true, msg: 'Signed — thank you' };
}

export async function requestPpe(me: Profile, siteId: string, item: string, dateNeeded: string | null): Promise<string | null> {
  const r = await db.from('ppe_requests').insert({ org_id: me.org_id, site_id: siteId, user_id: me.id, item_name: item, date_needed: dateNeeded || null } as never);
  return r.error ? 'Could not send — check your signal and try again.' : null;
}
