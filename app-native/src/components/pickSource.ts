// "Take a photo" or "Choose from library" (the old app's plain image inputs allowed either).
import { chooseAction } from '@/components/toast';
import { pickPhotos, type Picked } from '@/lib/photos';

export async function pickCameraOrLibrary(multiple: boolean): Promise<Picked[] | { error: string }> {
  const src = await chooseAction('Add a photo', [{ key: 'camera', label: '📷 Take a photo' }, { key: 'library', label: '🖼 Choose from library' }]);
  if (!src) return [];
  return pickPhotos(src as 'camera' | 'library', multiple);
}
