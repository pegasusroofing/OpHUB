// Variations, operative side: see live/closed ones and raise one with a photo.
// Ported from 800-variations.js. Operatives and site managers never see or type money:
// the value column (cost_impact) isn't even downloaded for them, as today.
// The PM decision workflow (approve/decline/modify, value, add to SoW, close, PDFs)
// comes with the PM screens.
import { useQuery } from '@tanstack/react-query';

import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, type Picked } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

const COLS_NO_VALUE = 'id,site_id,photo_path,description,created_by,created_at,status,approval_status,decided_by,decided_at,decline_reason,closed_at,schedule_section_id';

export type Variation = {
  id: string; site_id: string; photo_path: string | null; description: string; created_by: string | null; created_at: string;
  status: string; approval_status: string | null; decline_reason: string | null; closed_at: string | null;
};

export const approvalLabel = (v: Variation) => (v.approval_status === 'approved' ? 'Approved' : v.approval_status === 'declined' ? 'Declined' : 'Awaiting decision');

export function useVariations(siteId: string | undefined, status: 'live' | 'closed') {
  return useQuery({
    queryKey: ['variations', siteId, status],
    enabled: !!siteId,
    queryFn: () => cachedQuery(`variations:${siteId}:${status}`, async () =>
      orThrow(await db.from('variations').select(COLS_NO_VALUE).eq('site_id', siteId as string).eq('status', status).order('created_at', { ascending: false })) as Variation[]),
  });
}

export async function raiseVariation(me: Profile, site: Site, photo: Picked, desc: string): Promise<string | null> {
  const uri = await compressOne(photo);
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const up = await supabase.storage.from('site-photos').upload(`${site.id}/variations/${rid}.jpg`, await (await fetch(uri)).arrayBuffer(), { contentType: 'image/jpeg' });
  if (up.error) return 'Could not upload the photo — check your signal and try again.';
  const r = await db.from('variations').insert({ site_id: site.id, photo_path: up.data.path, description: desc || '—', created_by: me.id, status: 'live', approval_status: 'pending' } as never);
  if (r.error) return 'Could not save — try again.';
  if (me.org_id) void db.from('messages').insert({ org_id: me.org_id, site_id: site.id, sender_id: me.id, audience: 'managers', kind: 'variation', body: `${me.name} raised a variation: ${desc || '(no description)'}` } as never);
  return null;
}
