// Main Contractor home (510 renderMcHome): CPP, Site Rules & Layout, Site
// Inductions, Subcontractors, Permits, Inspections, Asbestos, F10, Programme.
// Managers can hide a tile from operatives on this job (long-press / ⋮ menu).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { chooseAction, useToast } from '@/components/toast';
import { Muted, Tile } from '@/components/ui';
import { setMcTileHidden, useMcTiles } from '@/data/mc';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { page, space } from '@/theme/theme';

const ROUTE: Record<string, string> = {
  cpp: 'mc/docs/cpp', asbestos: 'mc/docs/asbestos', f10: 'mc/docs/f10', permits: 'mc/permits', inspections: 'mc/inspections',
  site_layout: 'mc/layout', site_inductions: 'mc/inductions', subcontractors: 'mc/subcontractors',
};

export default function McHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data } = useMcTiles(site, me?.org_id);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!site.acting_as_main_contractor) return <Muted style={{ padding: space.l }}>This job isn't set up as a Main Contractor job.</Muted>;
  const mgr = isManager(me);
  const hidden = site.mc_hidden_tiles ?? [];
  const tiles = (data?.tiles ?? []).filter((t) => mgr || !hidden.includes(t.key));
  const open = (key: string) => {
    if (key === 'programme') {
      if (data?.progFolderId) router.push(`/sites/${id}/drawings/${data.progFolderId}` as never);
      else toast('No "Main Contractor Programme" folder yet — a manager can add it in Drawings.');
      return;
    }
    router.push(`/sites/${id}/${ROUTE[key]}` as never);
  };
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Main Contractor' }} />
      {!data ? <Muted>Loading…</Muted> : tiles.map((t) => (
        <Tile key={t.key} icon={t.icon} tint="#E7E9EE" title={t.title} sub={`${t.sub}${mgr && hidden.includes(t.key) ? ' · hidden from operatives' : ''}`}
          onPress={async () => {
            if (!mgr) { open(t.key); return; }
            const k = await chooseAction(t.title, [{ key: 'open', label: 'Open' }, { key: 'hide', label: hidden.includes(t.key) ? '👁 Show to operatives' : '🙈 Hide from operatives' }]);
            if (k === 'open') open(t.key);
            else if (k === 'hide') {
              const hide = !hidden.includes(t.key);
              if (await setMcTileHidden(id, hidden, t.key, hide)) { toast(hide ? 'Hidden from operatives' : 'Now visible to everyone'); void qc.invalidateQueries({ queryKey: ['sites'] }); }
            }
          }} />
      ))}
    </ScrollView>
  );
}
