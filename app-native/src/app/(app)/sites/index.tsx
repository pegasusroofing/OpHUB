// Projects (180 renderSites). Everyone: search by name, address, postcode or
// job number. Operatives / site managers: their live and upcoming jobs.
// PMs / admins: All / Live / Upcoming / Closed, a PM filter, + New project, and
// on each card the responsible PM (tap to set — locks once set; admins can
// change it) and the status (tap: Active / Upcoming / Close / Delete).
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { FinChip } from '@/components/FinNav';
import { HowTo } from '@/components/HowTo';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Empty, Muted, Row, SectionTitle } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { deleteSite, setResponsiblePm, setSiteStatus, siteIsEmpty } from '@/data/siteList';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { fullSiteAddress, siteStatusKey } from '@/lib/rules/checkin';
import { isFullManager } from '@/lib/roles';
import type { Site } from '@/lib/types';
import { base, radius, space, useTheme } from '@/theme/theme';

const LABEL = { live: 'Active', upcoming: 'Upcoming', closed: 'Closed' } as const;
const DOT = { live: base.ok, upcoming: base.warn, closed: base.slate } as const;
const match = (s: Site, q: string) => !q || [s.name, s.address, s.postcode, s.job_number, s.client_name].filter(Boolean).join(' ').toLowerCase().includes(q);
const initials = (n: string) => n.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

export default function Sites() {
  const { me } = useAuth();
  const t = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching, error } = useSites();
  const full = isFullManager(me);
  const { data: team = [] } = useTeam(full ? me?.org_id : null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'live' | 'upcoming' | 'closed'>('all');
  const [pmIds, setPmIds] = useState<string[]>([]);
  const [grp, setGrp] = useState<Record<string, boolean>>({ live: true, upcoming: false, closed: false });
  const sites = data ?? [];
  const query = q.trim().toLowerCase();
  const pms = team.filter((p) => p.role === 'pm' || p.role === 'admin');
  const pmName = (id: string | null | undefined) => pms.find((p) => p.id === id)?.name || '';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['sites'] }); };

  if (!full) {
    const mine = sites.filter((s) => match(s, query));
    const live = mine.filter((s) => siteStatusKey(s) === 'live'), upcoming = mine.filter((s) => siteStatusKey(s) === 'upcoming');
    const row = (s: Site) => <Row key={s.id} title={s.job_number ? `${s.job_number} · ${s.name}` : s.name} sub={fullSiteAddress(s)} onPress={() => router.push(`/sites/${s.id}`)} />;
    return (
      <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
        <HowTo k="sites" />
        <TextInput value={q} onChangeText={setQ} placeholder="🔍 Search projects" style={search} />
        {isLoading && <ActivityIndicator style={{ marginTop: 24 }} />}
        {!isLoading && error && !data && <Muted>Couldn&apos;t load your projects — check your signal and pull down to try again.</Muted>}
        {!isLoading && !!data && (
          <View>
            <SectionTitle>Live ({live.length})</SectionTitle>
            {live.length ? live.map(row) : <Empty>{query ? 'No projects match.' : 'No live projects.'}</Empty>}
            {!!upcoming.length && <SectionTitle>Upcoming ({upcoming.length})</SectionTitle>}
            {upcoming.map(row)}
          </View>
        )}
      </ScrollView>
    );
  }

  const filtered = sites.filter((s) => (!pmIds.length || pmIds.includes(s.responsible_pm_id || '')) && match(s, query));
  const by = (k: 'live' | 'upcoming' | 'closed') => filtered.filter((s) => siteStatusKey(s) === k).sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  const lists = { live: by('live'), upcoming: by('upcoming'), closed: by('closed') };
  const statusMenu = async (s: Site) => {
    const cur = siteStatusKey(s), admin = me?.role === 'admin' || me?.role === 'superadmin';
    const k = await chooseAction(s.name, [
      ...(cur !== 'live' ? [{ key: 'active', label: 'Set Active' }] : []), ...(cur !== 'upcoming' ? [{ key: 'upcoming', label: 'Set Upcoming' }] : []),
      ...(cur !== 'closed' ? [{ key: 'closed', label: 'Close' }] : []), { key: 'del', label: admin ? 'Delete permanently' : 'Delete', danger: true },
    ]);
    if (!k || !me) return;
    if (k === 'del') {
      if (!admin && !(await siteIsEmpty(s.id))) {
        if (!(await confirmAsk(`"${s.name}" already has data in it, so it can't be permanently deleted from here — this will close it instead (hidden from the team; an Admin can still delete it for good if needed). Continue?`, 'Close it'))) return;
        toast((await setSiteStatus(me, s.id, 'closed')) ? 'Status updated' : 'Could not save — try again.'); refresh(); return;
      }
      if (!(await confirmAsk(`Delete "${s.name}"? This permanently removes the site along with its schedule, RAMS, snags, materials, variations and check-in history. This can't be undone.`, 'Delete'))) return;
      toast((await deleteSite(s.id)) ? 'Site deleted' : 'Could not delete — try again.'); refresh(); return;
    }
    toast((await setSiteStatus(me, s.id, k as 'active' | 'upcoming' | 'closed')) ? 'Status updated' : 'Could not save — try again.'); refresh();
  };
  const pmMenu = async (s: Site) => {
    const canChange = me?.role === 'admin' || me?.role === 'superadmin';
    if (s.responsible_pm_id && !canChange) { toast(`Responsible PM: ${pmName(s.responsible_pm_id) || 'set'}`); return; }
    const id = await chooseAction('Responsible project manager', pms.map((p) => ({ key: p.id, label: `${p.name}${p.role === 'admin' ? ' (Admin)' : ''}` })));
    const p = pms.find((x) => x.id === id); if (!p) return;
    if (!(await confirmAsk(`Set ${p.name} as the responsible project manager for this site? A project manager can only be selected once — are you sure?`, 'Set PM'))) return;
    toast((await setResponsiblePm(s.id, p.id)) ? 'Project manager set' : 'Could not save — try again.'); refresh();
  };
  const card = (s: Site) => {
    const st = siteStatusKey(s) as 'live' | 'upcoming' | 'closed';
    const sw = s.job_number || initials(s.name || '');
    return (
      <Pressable key={s.id} onPress={() => router.push(`/sites/${s.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
        <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: t.brand1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.brand1Text, fontWeight: '800', fontSize: sw.length <= 3 ? 13.5 : sw.length <= 5 ? 10 : 8 }} numberOfLines={1}>{sw}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontWeight: '700', color: base.ink }} numberOfLines={1}>{s.name}</Text>
          <Text numberOfLines={1} style={sub}>{fullSiteAddress(s) || '—'}</Text>
          {(!!s.client_name || (st === 'upcoming' && !!s.start_date)) && <Text numberOfLines={1} style={sub}>{st === 'upcoming' && s.start_date ? `Starts ${new Date(`${s.start_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${s.client_name ? ' · ' : ''}` : ''}{s.client_name || ''}</Text>}
        </View>
        <Pressable hitSlop={8} onPress={() => void pmMenu(s)} accessibilityLabel={s.responsible_pm_id ? `Responsible PM ${pmName(s.responsible_pm_id)}` : 'Choose the responsible PM'}
          style={{ minWidth: 26, height: 18, borderRadius: 5, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: s.responsible_pm_id ? t.brand1 : base.line }}>
          <Text style={{ fontSize: 9, color: s.responsible_pm_id ? t.brand1Text : base.slate }}>{s.responsible_pm_id ? initials(pmName(s.responsible_pm_id) || '?') : '–'}</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={() => void statusMenu(s)} accessibilityLabel={`Status ${LABEL[st]}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: DOT[st] }} />
          <Text style={{ fontSize: 11, color: base.slate }}>{st === 'upcoming' ? '🕐' : ''}</Text>
        </Pressable>
      </Pressable>
    );
  };
  const group = (k: 'live' | 'upcoming' | 'closed', label: string) => lists[k].length ? (
    <View key={k}>
      <Pressable onPress={() => setGrp({ ...grp, [k]: !grp[k] })} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ fontWeight: '800', color: base.ink, flex: 1 }}>{label} <Text style={{ fontWeight: '400', color: base.slate }}>({lists[k].length})</Text></Text>
        <Text style={{ color: base.slate }}>{grp[k] ? '▾' : '▸'}</Text>
      </Pressable>
      {grp[k] && lists[k].map(card)}
    </View>
  ) : null;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 820, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      <HowTo k="sites" />
      <TextInput value={q} onChangeText={setQ} placeholder="🔍 Search projects" style={search} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        {([['all', 'All', filtered.length], ['live', 'Live', lists.live.length], ['upcoming', 'Upcoming', lists.upcoming.length], ['closed', 'Closed', lists.closed.length]] as const).map(([k, l, n]) => (
          <FinChip key={k} on={tab === k} label={`${l} ${n}`} onPress={() => setTab(k)} />
        ))}
        <View style={{ flex: 1 }} />
        {pms.length > 0 && <FinChip on={!!pmIds.length} label={pmIds.length ? (pmIds.length === 1 ? pmName(pmIds[0]) : `${pmIds.length} PMs`) : 'PM ▾'} onPress={async () => {
          const k = await chooseAction('Show projects for', [...pms.map((p) => ({ key: p.id, label: `${pmIds.includes(p.id) ? '☑' : '☐'} ${p.name}` })), ...(pmIds.length ? [{ key: '__clear', label: 'Clear' }] : [])]);
          if (!k) return; if (k === '__clear') { setPmIds([]); return; }
          setPmIds(pmIds.includes(k) ? pmIds.filter((x) => x !== k) : [...pmIds, k]);
        }} />}
        <Button title="+ New project" onPress={() => router.push('/sites/new' as never)} />
      </View>
      {isLoading && <ActivityIndicator style={{ marginTop: 24 }} />}
      {!isLoading && error && !data && <Muted>Couldn&apos;t load your projects — check your signal and pull down to try again.</Muted>}
      {!isLoading && !!data && (tab === 'all'
        ? ([group('live', 'Live'), group('upcoming', 'Upcoming'), group('closed', 'Closed')].some(Boolean) ? <>{group('live', 'Live')}{group('upcoming', 'Upcoming')}{group('closed', 'Closed')}</> : <Empty>{query ? 'No projects match.' : 'No projects.'}</Empty>)
        : lists[tab].length ? lists[tab].map(card) : <Empty>{query ? 'No projects match.' : `No ${tab} projects.`}</Empty>)}
    </ScrollView>
  );
}

const search = { borderWidth: 1, borderColor: base.line, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, color: base.ink, backgroundColor: base.card, marginBottom: 12 };
const sub = { color: base.slate, fontSize: 12.5 };
