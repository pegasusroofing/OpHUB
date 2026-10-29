// Search (136 quick search): projects (name, job number, address, postcode,
// client), people for managers, then — after two letters — reports and
// drawings from the server, plus quick "Go to" links. Nothing is searched
// until you type. Opened from 🔍 on Home, or Ctrl / ⌘ K on the office laptop.
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Muted } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { isManager, roleLabel } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { base, radius, space } from '@/theme/theme';

type Hit = { g: string; ic: string; t: string; s?: string; go: string };
const has = (v: unknown, q: string) => String(v ?? '').toLowerCase().includes(q);

export default function Search() {
  const { me } = useAuth();
  const { data: sites = [] } = useSites();
  const mgr = isManager(me);
  const { data: team = [] } = useTeam(mgr ? me?.org_id : null);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const like = `%${query.replace(/[%_,()]/g, ' ')}%`;
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name || '';
  const { data: remote = [] } = useQuery({
    queryKey: ['qs', query], enabled: query.length >= 2, staleTime: 30000,
    queryFn: async () => {
      const [reps, docs] = await Promise.all([
        mgr ? supabase.from('report_submissions' as never).select('id,site_id,template_name,general_label,status,submitted_at').eq('org_id', me?.org_id as string).or(`template_name.ilike.${like},general_label.ilike.${like}`).order('submitted_at', { ascending: false, nullsFirst: false }).limit(5) : Promise.resolve({ data: [] }),
        supabase.from('drawing_files' as never).select('id,site_id,name,storage_path,folder_id').ilike('name', like).eq('status', 'current').limit(6),
      ]);
      const out: Hit[] = [];
      (((reps.data ?? []) as { id: string; site_id: string | null; template_name: string | null; general_label: string | null; status: string }[])).filter((r) => r.site_id).forEach((r) => out.push({ g: 'Reports', ic: '📋', t: r.general_label || r.template_name || 'Report', s: [siteName(r.site_id as string), r.status === 'in_progress' ? 'Draft' : ''].filter(Boolean).join(' · '), go: `/sites/${r.site_id}/snagging/reports/${r.status === 'in_progress' ? 'fill' : 'view'}/${r.id}` }));
      (((docs.data ?? []) as { id: string; site_id: string; name: string; storage_path: string | null; folder_id: string | null }[])).filter((d) => sites.some((s) => s.id === d.site_id)).forEach((d) => out.push({ g: 'Documents', ic: /\.(jpe?g|png)$/i.test(d.storage_path || '') ? '🖼' : /\.docx?$/i.test(d.name || '') ? '📝' : '📐', t: d.name, s: siteName(d.site_id), go: `/sites/${d.site_id}/drawings${d.folder_id ? `/${d.folder_id}` : ''}` }));
      return out;
    },
  });
  if (!me) return null;
  const actions: Hit[] = (mgr ? [
    { g: 'Go to', ic: '➕', t: 'New project', s: 'Set up a new job', go: '/sites/new' }, { g: 'Go to', ic: '🏗', t: 'Projects', s: 'All your projects', go: '/sites' },
    { g: 'Go to', ic: '🚚', t: 'Deliveries', s: 'Delivery schedule', go: '/pm/deliveries' }, { g: 'Go to', ic: '📅', t: 'Calendar', go: '/pm/calendar' },
    { g: 'Go to', ic: '🔔', t: 'HUB', s: 'Messages and alerts', go: '/pm/hub' }, { g: 'Go to', ic: '📋', t: 'Reports & surveys', go: '/pm/reports' },
    { g: 'Go to', ic: '👷', t: 'Operatives', go: '/pm/operatives' }, { g: 'Go to', ic: '⚙️', t: 'Admin Centre', go: '/pm/admin' },
  ] : [{ g: 'Go to', ic: '🏗', t: 'Projects', s: 'All your projects', go: '/sites' }, { g: 'Go to', ic: '⚙️', t: 'Settings', go: '/account' }]).filter((a) => !query || has(a.t, query)).slice(0, query ? 4 : 8);
  const local: Hit[] = [];
  if (query) {
    sites.filter((s) => [s.name, s.job_number, s.address, s.postcode, s.client_name].some((x) => has(x, query))).slice(0, 6)
      .forEach((s) => local.push({ g: 'Projects', ic: '🏗', t: `${s.job_number ? `${s.job_number} · ` : ''}${s.name || ''}`, s: [s.client_name, s.postcode].filter(Boolean).join(' · '), go: `/sites/${s.id}` }));
    if (mgr) team.filter((p) => [p.name, p.email, p.phone].some((x) => has(x, query))).slice(0, 5)
      .forEach((p) => local.push({ g: 'People', ic: '👷', t: p.name || p.email || '', s: [roleLabel(p as unknown as Profile), p.phone].filter(Boolean).join(' · '), go: p.role === 'operative' ? `/pm/operatives/${p.id}` : '/pm/admin/users' }));
  }
  const items = [...local, ...(query.length >= 2 ? remote : []), ...actions];
  let last = '';
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Search' }} />
      <TextInput value={q} onChangeText={setQ} autoFocus placeholder="🔍 Search projects, people, reports, documents…" autoCapitalize="none"
        onSubmitEditing={() => { if (items[0]) router.push(items[0].go as never); }}
        style={{ borderWidth: 1, borderColor: base.line, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 11, color: base.ink, backgroundColor: base.card, marginBottom: 12, fontSize: 15 }} />
      {query && !local.length && !(query.length >= 2 && remote.length) && <Muted style={{ marginBottom: 8 }}>Nothing found for “{q.trim()}”.</Muted>}
      {items.map((it, i) => {
        const head = it.g !== last; last = it.g;
        return (
          <View key={`${it.g}${i}${it.go}`}>
            {head && <Text style={{ fontSize: 11, fontWeight: '800', color: base.slate, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 4 }}>{it.g}</Text>}
            <Pressable onPress={() => router.push(it.go as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.row, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, marginBottom: 6 }}>
              <Text style={{ fontSize: 17 }}>{it.ic}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '700', color: base.ink }} numberOfLines={1}>{it.t}</Text>
                {!!it.s && <Text style={{ color: base.slate, fontSize: 12 }} numberOfLines={1}>{it.s}</Text>}
              </View>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}
