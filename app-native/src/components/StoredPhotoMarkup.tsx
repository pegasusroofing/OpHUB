// Mark up a photo that's already uploaded (499 photoMarkup, as used on
// deliveries): the marked-up copy is uploaded as a new photo and handed back
// so it can take the old one's place.
import { useState } from 'react';

import { MarkupEditor } from '@/components/MarkupEditor';
import { useToast } from '@/components/toast';
import { publicUrl, resolveStorageUrl } from '@/lib/privateFiles';
import { supabase } from '@/lib/supabase';

const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);

/** open(path, folder, done): mark up site-photos/path; the copy goes in folder/<new id>.jpg and done(newPath) is called. */
export function useStoredPhotoMarkup() {
  const toast = useToast();
  const [m, setM] = useState<{ src: string; folder: string; done: (newPath: string) => Promise<void> | void } | null>(null);
  const open = async (path: string, folder: string, done: (newPath: string) => Promise<void> | void) => {
    const src = await resolveStorageUrl(publicUrl('site-photos', path));
    if (!src) { toast('Could not open the photo — check your signal.'); return; }
    setM({ src, folder, done });
  };
  const editor = m ? (
    <MarkupEditor photo src={m.src} onClose={async (out) => {
      const cur = m; setM(null); if (!out) return;
      try {
        const up = await supabase.storage.from('site-photos').upload(`${cur.folder}/${rid()}.jpg`, await (await fetch(out.image)).arrayBuffer(), { contentType: 'image/jpeg' });
        if (up.error) throw new Error(up.error.message);
        await cur.done(up.data.path);
      } catch { toast('Could not save the marked-up photo — check your connection.'); }
    }} />
  ) : null;
  return { open, editor };
}
