// After a PDF is exported, a small bar offers "☁️ Save to OneDrive" for a short while (the old app's ☁️
// button in its PDF viewer). Managers only; the job you're on decides the folder.
import { useGlobalSearchParams, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { onOneDriveOffer, saveToOneDrive } from '@/lib/oneDriveSave';
import { isManager } from '@/lib/roles';
import { base } from '@/theme/theme';

export function OneDriveSaveBar() {
  const { me } = useAuth();
  const toast = useToast();
  const seg = useSegments() as string[];
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const { data: sites } = useSites();
  const [offer, setOffer] = useState<{ bytes: Uint8Array; filename: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => onOneDriveOffer((o) => setOffer(o)), []);
  useEffect(() => { if (!offer) return; const t = setTimeout(() => setOffer(null), 20000); return () => clearTimeout(t); }, [offer]);
  if (!offer || !me || !isManager(me)) return null;
  const onJob = seg.includes('[id]') && (seg.includes('sites') || (seg.includes('fin') && seg.includes('job')));
  const siteId = onJob && id && id !== 'new' ? id : null;
  const site = siteId ? (sites ?? []).find((s) => s.id === siteId) : null;
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 84, alignItems: 'center' }} pointerEvents="box-none">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: base.ink, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, width: '100%', maxWidth: 520 }}>
        <Text numberOfLines={1} style={{ color: '#fff', flex: 1, fontSize: 13 }}>{offer.filename}</Text>
        <Pressable disabled={busy} onPress={async () => {
          setBusy(true); toast('Saving to OneDrive…');
          const err = await saveToOneDrive(me.org_id, offer.bytes, offer.filename, siteId);
          setBusy(false);
          if (err) toast(`Could not save to OneDrive — ${err}`); else { toast(`Saved to OneDrive — ${site ? site.name : 'Company Exports'} folder`); setOffer(null); }
        }}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? '⏳' : '☁️ Save to OneDrive'}</Text></Pressable>
        <Pressable hitSlop={8} onPress={() => setOffer(null)}><Text style={{ color: '#ccc' }}>✕</Text></Pressable>
      </View>
    </View>
  );
}
