// My certificates (operative's own). Ported from 320-per-operative-certifications.js.
// The office side (everyone's certs, edit/rename/expiry, Training Matrix, export/email,
// OneDrive sync) comes with the PM/admin screens.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { certPath, type Cert } from '@/lib/rules/certs';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export function useMyCerts() {
  const { me } = useAuth();
  return useQuery({
    queryKey: ['myCerts', me?.id],
    enabled: !!me,
    queryFn: () => cachedQuery(`myCerts:${me?.id}`, async () =>
      orThrow(await db.from('operative_certifications').select('id,category,name,storage_path,expiry_date,other_type_description').eq('operative_id', (me as Profile).id).order('created_at', { ascending: false })) as Cert[]),
  });
}

export async function uploadCert(me: Profile, f: { uri: string; name: string; mimeType?: string | null; size?: number | null }, category: string, otherDesc: string, expiry: string | null): Promise<string | null> {
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const path = certPath(me.org_id as string, me.id, rid, f.name);
  const up = await supabase.storage.from('certifications').upload(path, await (await fetch(f.uri)).arrayBuffer(), { contentType: f.mimeType || 'application/octet-stream' });
  if (up.error) return 'Upload failed — check your signal and try again.';
  const r = await db.from('operative_certifications').insert({
    org_id: me.org_id, operative_id: me.id, category, other_type_description: category === 'other' ? otherDesc || null : null,
    expiry_date: expiry, name: f.name, storage_path: up.data.path, size: f.size ?? null, source: 'upload', uploaded_by: me.id,
  } as never);
  return r.error ? 'Could not save — try again.' : null;
}
