// My Tools: an operative's own power tools (name, serial, photo). Ported from
// 670-operative-tools-personal-tool-register.js. PUWER inspections copy from these.
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { cachedQuery, orThrow } from '@/lib/offlineCache';
import { compressOne, type Picked } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export type OpTool = { id: string; name: string; serial_number: string | null; photo_path: string | null };

export function useMyTools(userId?: string) {
  const { me } = useAuth();
  const who = userId || me?.id;
  return useQuery({
    queryKey: ['myTools', who],
    enabled: !!who,
    queryFn: () => cachedQuery(`myTools:${who}`, async () =>
      orThrow(await db.from('operative_tools').select('id,name,serial_number,photo_path').eq('user_id', who as string).order('created_at', { ascending: true })) as OpTool[]),
  });
}

async function upload(me: Profile, p: Picked, userId: string = me.id): Promise<string | null> {
  const uri = await compressOne(p);
  const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
  const up = await supabase.storage.from('operative-tools').upload(`${me.org_id}/${userId}/${rid}.jpg`, await (await fetch(uri)).arrayBuffer(), { contentType: 'image/jpeg' });
  return up.error ? null : up.data.path;
}

export async function addTool(me: Profile, name: string, serial: string, photo: Picked | null, userId: string = me.id): Promise<string | null> {
  if (!name) return 'Enter a tool name.';
  let photo_path: string | null = null;
  if (photo) {
    photo_path = await upload(me, photo, userId).catch(() => null);
    if (!photo_path) return 'Photo failed to upload — check your connection and try again.';
  }
  const r = await db.from('operative_tools').insert({ org_id: me.org_id, user_id: userId, name, serial_number: serial || null, photo_path, created_by: me.id } as never);
  return r.error ? 'Could not save — try again.' : null;
}

export async function setToolPhoto(me: Profile, toolId: string, p: Picked, userId: string = me.id): Promise<boolean> {
  const path = await upload(me, p, userId).catch(() => null);
  if (!path) return false;
  return !(await db.from('operative_tools').update({ photo_path: path } as never).eq('id', toolId)).error;
}

export async function deleteTool(t: OpTool): Promise<boolean> {
  const r = await db.from('operative_tools').delete().eq('id', t.id);
  if (r.error) return false;
  if (t.photo_path) { try { await supabase.storage.from('operative-tools').remove([t.photo_path]); } catch { /* non-fatal */ } }
  return true;
}
