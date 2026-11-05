// Projects (180 renderSites). Everyone: search by name, address, postcode or
// job number. Operatives / site managers: their live and upcoming jobs.
// PMs / admins: All / Live / Upcoming / Closed, a PM filter, + New project, and
// on each card the responsible PM (tap to set — locks once set; admins can
// change it) and the status (tap: Active / Upcoming / Close / Delete).
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { HomePrompts } from '@/components/HomePrompts';
import { askDate } from '@/components/DateField';
import { HowTo } from '@/components/HowTo';
import { OphIcon } from '@/components/OphIcon';
import { ProjectCard } from '@/components/ProjectCard';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Empty, Muted } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { deleteSite, setResponsiblePm, setSiteStatus, siteIsEmpty } from '@/data/siteList';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { siteStatusKey } from '@/lib/rules/checkin';
import { isFullManager, roleLabel } from '@/lib/roles';
import { useOnboarding } from '@/data/onboarding';
import type { Site } from '@/lib/types';
import { heading } from '@/lib/fonts';
import { base, page, useDesk, useTheme } from '@/theme/theme';

const match = (s: Site, q: string) => !q || [s.name, s.address, s.postcode, s.job_number, s.client_name].filter(Boolean).join(' ').toLowerCase().includes(q);

export default function Sites() {
  const { me, signOut } = useAuth();
  const t = useTheme();
  const desk = useDesk();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching, error } = useSites();
  const full = isFullManager(me);
  // Everyone gets the team, so the PM chip on each card shows the PM's initials (180 siteCardHtml).
  const { data: team = [] } = useTeam(me?.org_id);
  const { data: onboarding } = useOnboarding(full ? undefined : data);
  const [q, setQ] = useState('');
  const { tab: tab0 } = useLocalSearchParams<{ tab?: 'all' | 'live' | 'upcoming' | 'closed' }>();
  const [tab, setTab] = useState<'all' | 'live' | 'upcoming' | 'closed'>(tab0 || 'all');
  const [pmIds, setPmIds] = useState<string[]>([]);
  const [grp, setGrp] = useState<Record<string, boolean>>({ live: true, upcoming: false, closed: false });
  const sites = data ?? [];
  const query = q.trim().toLowerCase();
  const pms = team.filter((p) => p.role === 'pm' || p.role === 'admin');
  const pmName = (id: string | null | undefined) => team.find((p) => p.id === id)?.name || '';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['sites'] }); };
  // The .pmsearch bar, and cards 2+ across on a computer (.projgrp-body grid).
  const searchBar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: base.line, borderRadius: 14, paddingHorizontal: 14, height: 46, marginBottom: 10 }}>
      <OphIcon name="search" size={18} color={base.slate} />
      <TextInput value={q} onChangeText={setQ} placeholder="Search projects" placeholderTextColor={base.slateLight} style={{ flex: 1, fontSize: 14, color: base.ink, height: 44 }} />
    </View>
  );
  const grid = (list: Site[], card: (x: Site) => React.ReactNode) => desk
    ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>{list.map((x) => <View key={x.id} style={{ width: '50%', paddingHorizontal: 6 }}>{card(x)}</View>)}</View>
    : <>{list.map((x) => <View key={x.id}>{card(x)}</View>)}</>;
  const head = (k: string, label: string, n: number, on: boolean, toggle: () => void) => (
    <Pressable key={`h${k}`} onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: base.card, borderWidth: 1, borderColor: base.line, borderRadius: 12 }}>
      <Text style={{ fontWeight: '600', fontSize: 13, letterSpacing: 0.8, color: base.ink }}>{label.toUpperCase()}</Text>
      <Text style={{ fontWeight: '600', fontSize: 13, color: base.slate }}>({n})</Text>
      <View style={{ flex: 1 }} />
      <Text style={{ color: base.ink, transform: [{ rotate: on ? '0deg' : '-90deg' }] }}>▾</Text>
    </Pressable>
  );
  const tabLabel = { all: 'All', live: 'Live', upcoming: 'Upcoming', closed: 'Closed' };
  const chip = (on: boolean, label: string, onPress: () => void, key?: string) => (
    <Pressable key={key ?? label} onPress={onPress} style={{ height: 32, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : '#fff', justifyContent: 'center' }}>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: on ? '#fff' : base.ink }}>{label}</Text>
    </Pressable>
  );

  if (!full) {
    // 180 (not a PM / admin): one "Your Projects" list of live and upcoming jobs, the Getting Started card,
    // and your name, email, role and Sign out underneath.
    const mine = sites.filter((s) => siteStatusKey(s) !== 'closed' && match(s, query));
    return (
      <ScrollView contentContainerStyle={page(720)}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
        <HowTo k="sites" />
        {me?.role === 'site_manager' && <HomePrompts />}
        {me?.role === 'site_manager' && (
          <Pressable onPress={() => router.push('/pm/hr' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#F3EEFA', alignItems: 'center', justifyContent: 'center' }}><OphIcon name="users" size={18} color="#6B3FA8" /></View>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: base.ink }}>HR</Text><Muted>Holidays, policies &amp; handbook</Muted></View>
            <OphIcon name="chevron" size={18} color={base.slateLight} stroke={2.2} />
          </Pressable>
        )}
        {searchBar}
        {isLoading && <ActivityIndicator style={{ marginTop: 24 }} />}
        {!isLoading && error && !data && <Muted>Couldn&apos;t load your projects — check your signal and pull down to try again.</Muted>}
        {!isLoading && !!data && (
          <View>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.8, color: base.slate, marginTop: 4, marginBottom: 10 }}>YOUR PROJECTS</Text>
            {onboarding && !onboarding.allDone && (
              <Pressable onPress={() => router.push('/getting-started' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: base.warnBg, borderWidth: 1, borderColor: base.warn, borderRadius: 18, padding: 14, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 13.5, color: base.warn }}>Getting Started</Text>
                  <Text style={{ color: base.slate, fontStyle: 'italic', marginTop: 2 }}>{onboarding.items.filter((i) => i.done).length} of {onboarding.items.length} steps done — tap to finish</Text>
                </View>
                <Text style={{ fontSize: 20, color: base.warn }}>›</Text>
              </Pressable>
            )}
            {mine.length ? grid(mine, (x) => <ProjectCard s={x} pmName={pmName(x.responsible_pm_id)} />) : <Empty>{query ? 'No projects match.' : 'No active sites.'}</Empty>}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
              <Muted>{me?.name}</Muted>
              <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', color: base.slate, fontStyle: 'italic', fontSize: 12 }}>{me?.email}</Text>
              <Muted>{roleLabel(me)}</Muted>
            </View>
            <Pressable onPress={() => void signOut()} style={{ alignSelf: 'center', marginTop: 8 }}>
              <Text style={{ color: base.warn, textDecorationLine: 'underline' }}>Sign out</Text>
            </Pressable>
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
  const card = (x: Site) => <ProjectCard s={x} pmName={pmName(x.responsible_pm_id)} onPm={() => void pmMenu(x)} onStart={full ? async () => { const d = await askDate(`Start date for ${x.name}`); if (!d) return; if (!(await supabase.from('sites').update({ start_date: d } as never).eq('id', x.id).select('id')).data?.length) { toast('Could not save — try again.'); return; } toast('Start date updated'); void qc.invalidateQueries({ queryKey: ['sites'] }); } : undefined} onStatus={() => void statusMenu(x)} />;
  const group = (k: 'live' | 'upcoming' | 'closed', label: string) => lists[k].length ? (
    <View key={k}>
      {head(k, label, lists[k].length, !!grp[k], () => setGrp({ ...grp, [k]: !grp[k] }))}
      {grp[k] && grid(lists[k], card)}
    </View>
  ) : null;
  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />}>
      <HowTo k="sites" />
      {me?.role === 'site_manager' && <HomePrompts />}
      {searchBar}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        {chip(false, `${tabLabel[tab]} (${tab === 'all' ? filtered.length : lists[tab].length}) ▼`, async () => {
          const k = await chooseAction('Show', ([['all', filtered.length], ['live', lists.live.length], ['upcoming', lists.upcoming.length], ['closed', lists.closed.length]] as const).map(([x, n]) => ({ key: x, label: `${tabLabel[x]} (${n})` })));
          if (k) setTab(k as typeof tab);
        }, 'show')}
        <View style={{ flex: 1 }} />
        {/* Filled, before the PM filter, as 180 renderSites. */}
        {desk && <Pressable onPress={() => router.push('/sites/new' as never)} accessibilityLabel="Add a new project" style={{ height: 32, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.brand1, justifyContent: 'center', marginRight: 4 }}>
          <Text style={[heading(700), { fontSize: 12.5, color: t.brand1Text }]}>+ New Project</Text>
        </Pressable>}
        {pms.length > 0 && chip(!!pmIds.length, pmIds.length ? (pmIds.length === 1 ? pmName(pmIds[0]) : `${pmIds.length} selected`) : 'PM ▼', async () => {
          const k = await chooseAction('Show projects for', [...pms.map((p) => ({ key: p.id, label: `${pmIds.includes(p.id) ? '☑' : '☐'} ${p.name}` })), ...(pmIds.length ? [{ key: '__clear', label: 'Clear' }] : [])]);
          if (!k) return; if (k === '__clear') { setPmIds([]); return; }
          setPmIds(pmIds.includes(k) ? pmIds.filter((x) => x !== k) : [...pmIds, k]);
        }, 'pm')}
      </View>
      {isLoading && <ActivityIndicator style={{ marginTop: 24 }} />}
      {!isLoading && error && !data && <Muted>Couldn&apos;t load your projects — check your signal and pull down to try again.</Muted>}
      {!isLoading && !!data && (tab === 'all'
        ? ([group('live', 'Live'), group('upcoming', 'Upcoming'), group('closed', 'Closed')].some(Boolean) ? <>{group('live', 'Live')}{group('upcoming', 'Upcoming')}{group('closed', 'Closed')}</> : <Empty>{query ? 'No projects match.' : 'No projects.'}</Empty>)
        : lists[tab].length ? grid(lists[tab], card) : <Empty>{query ? 'No projects match.' : `No ${tab} projects.`}</Empty>)}
    </ScrollView>
  );
}

