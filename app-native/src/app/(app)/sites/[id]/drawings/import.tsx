// Import from OneDrive (810 renderDrawingImportPicker): browse the job's
// linked OneDrive folder, tick files, and they are copied into this Drawings
// folder (?folder=, else the top level).
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { importFromOneDrive, listOneDriveLevel, type OdItem } from '@/data/drawings';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const card = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card };

export default function DrawingsImport() {
  const { id, folder } = useLocalSearchParams<{ id: string; folder?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const { data: site } = useSite(id);
  const s = site as { onedrive_folder_id?: string | null; onedrive_folder_name?: string | null; onedrive_drive_id?: string | null } | undefined;
  const [stack, setStack] = useState<OdItem[]>([]);
  const [sel, setSel] = useState<Record<string, OdItem>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const root: OdItem | null = s?.onedrive_folder_id ? { id: s.onedrive_folder_id, name: s.onedrive_folder_name || 'Linked Folder', driveId: s.onedrive_drive_id } : null;
  const path = root ? [root, ...stack] : [];
  const cur = path[path.length - 1];
  const { data, isLoading } = useQuery({ queryKey: ['odDrawLevel', cur?.id, cur?.driveId], enabled: !!cur, queryFn: () => listOneDriveLevel(cur as OdItem) });
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const keys = Object.keys(sel);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Import from OneDrive' }} />
      {!root ? <Empty>This job has no OneDrive folder linked — link one in Team &amp; Admin › Sync Folder.</Empty> : <>
        <Muted style={{ marginBottom: 8 }}>{path.map((p) => p.name).join(' › ')}</Muted>
        {stack.length > 0 && <Button kind="ghost" title="‹ Up one level" onPress={() => setStack(stack.slice(0, -1))} />}
        {isLoading ? <Muted>Loading…</Muted> : data?.error ? <Empty>{data.error}</Empty> : <>
          {data?.folders.map((f) => (
            <Pressable key={f.id} onPress={() => setStack([...stack, { ...f, driveId: f.driveId || cur?.driveId }])} style={card}>
              <Text style={{ fontWeight: '700', color: base.ink }}>📁 {f.name}</Text>
            </Pressable>
          ))}
          {data?.files.map((f) => { const k = `${f.id}|${f.driveId || ''}`; return (
            <Pressable key={k} onPress={() => { const n = { ...sel }; if (n[k]) delete n[k]; else n[k] = { ...f, driveId: f.driveId || cur?.driveId }; setSel(n); }} style={card}>
              <Text style={{ fontSize: 18, color: base.ink }}>{sel[k] ? '☑' : '☐'}</Text>
              <Text style={{ flex: 1, fontWeight: '600', color: base.ink }}>{/\.(jpe?g|png)$/i.test(f.name) ? '🖼' : '📐'} {f.name}</Text>
            </Pressable>
          ); })}
          {!data?.folders.length && !data?.files.length && <Empty>Nothing here.</Empty>}
        </>}
        {keys.length > 0 && <Button busy={!!busy} title={busy ?? `Import ${keys.length} Selected`} onPress={async () => {
          const r = await importFromOneDrive(me, id, folder || null, Object.values(sel), setBusy);
          setBusy(null);
          toast(r.imported ? `${r.imported} drawing${r.imported === 1 ? '' : 's'} imported from OneDrive${r.failed ? `, ${r.failed} failed` : ''}` : 'Import failed — try again.');
          if (r.imported) router.back();
        }} />}
      </>}
    </ScrollView>
  );
}
