// The left-hand menu on a computer (125 deskSidebar): company logo and name,
// Search (Ctrl K), the person's pages with drop-downs for sub-pages, a "This
// project" section while inside a job, and their name, role and Sign out at
// the bottom. Phones keep the bottom tab bar.
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { OphIcon } from '@/components/OphIcon';
import { StorageImage } from '@/components/StorageImage';
import { useHub } from '@/data/hub';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { homeKind, isFinanceUser, isFullManager, isManager, roleLabel } from '@/lib/roles';
import { base, useTheme } from '@/theme/theme';

type Item = { k: string; ic: string; lbl: string; go: string; badge?: number; kids?: Item[] };

export function DeskNav() {
  const { me, org, signOut } = useAuth();
  const t = useTheme();
  const path = usePathname();
  const { data: sites } = useSites();
  const mgr = isManager(me);
  const { data: hub } = useHub(me, sites, '');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!me) return null;
  const kind = homeKind(me, org);
  // Managers: the HUB feed count, as the current app (130 computeMyOutstandingCount).
  const hubN = hub?.items.length ?? 0;
  const items: Item[] = kind === 'finance' ? [{ k: 'fin', ic: 'pound', lbl: 'OpHUB Finance', go: '/fin' }, { k: 'account', ic: 'gear', lbl: 'Settings', go: '/account' }]
    : kind === 'superadmin' ? [{ k: 'home', ic: 'building', lbl: 'Platform Admin', go: '/home' }]
    : me.role === 'driver' ? [{ k: 'home', ic: 'home', lbl: 'Home', go: '/home' }, { k: 'driver/schedule', ic: 'truck', lbl: 'My schedule', go: '/driver/schedule' }, { k: 'account', ic: 'gear', lbl: 'Settings', go: '/account' }]
    : mgr ? [
      ...(isFullManager(me) ? [{ k: 'home', ic: 'home', lbl: 'Home', go: '/home' }] : []),
      { k: 'sites', ic: 'projects', lbl: 'Projects', go: '/sites', kids: [
        ...(isFullManager(me) ? [{ k: 'onsite', ic: 'users', lbl: 'On Site Now', go: '/onsite' }] : []),
        ...(isFullManager(me) ? [{ k: 'pm/reports', ic: 'reports', lbl: 'Reports & Surveys', go: '/pm/reports' }] : []),
      ] },
      { k: 'pm/deliveries', ic: 'truck', lbl: 'Deliveries', go: '/pm/deliveries' },
      { k: 'pm/calendar', ic: 'calendar', lbl: 'Calendar', go: '/pm/calendar' },
      { k: 'pm/hub', ic: 'bell', lbl: 'Hub', go: '/pm/hub', badge: hubN },
      { k: 'pm/dashboard', ic: 'chart', lbl: 'Dashboard', go: '/pm/dashboard', kids: [
        { k: 'pm/dashboard', ic: 'chart', lbl: 'Company', go: '/pm/dashboard' },
        { k: 'pm/operatives', ic: 'admin', lbl: 'Operatives', go: '/pm/operatives' },
        { k: 'pm/hr', ic: 'users', lbl: 'HR', go: '/pm/hr' },
      ] },
      ...(isFinanceUser(me, org) ? [{ k: 'fin', ic: 'pound', lbl: 'OpHUB Finance', go: '/fin' }] : []),
      { k: 'pm/admin', ic: 'gear', lbl: 'Admin', go: '/pm/admin' },
    ]
    : [
      ...(me.role === 'operative' ? [{ k: 'home', ic: 'home', lbl: 'Home', go: '/home' }] : []),
      { k: 'sites', ic: 'projects', lbl: 'My projects', go: '/sites' },
      ...(me.role !== 'client' ? [{ k: 'inbox', ic: 'chat', lbl: 'Inbox', go: '/inbox' }, { k: 'dashboard', ic: 'tools', lbl: 'My Dashboard', go: '/dashboard' }] : []),
      { k: 'account', ic: 'gear', lbl: 'Settings', go: '/account' },
    ];
  // Which item is "on": the longest matching path.
  const seg = path.replace(/^\//, '');
  const siteId = (path.match(/^\/sites\/([0-9a-f-]{36})/) || [])[1];
  const site = siteId ? sites?.find((s) => s.id === siteId) : undefined;
  const isOn = (k: string) => (k === 'home' ? seg === 'home' || seg === '' : k === 'sites' ? seg === 'sites' || seg.startsWith('sites/') : seg === k || seg.startsWith(`${k}/`));
  const row = (i: Item, on: boolean, small = false) => (
    <Pressable key={i.k + i.go} onPress={() => router.navigate(i.go as never)} accessibilityRole="link"
      style={(st) => [{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: small ? 7 : 9, paddingHorizontal: small ? 10 : 12, borderRadius: 10, flex: 1 },
        on ? { backgroundColor: `${t.brand1}1A` } : (st as { hovered?: boolean }).hovered ? { backgroundColor: '#F1F3F6' } : null]}>
      <OphIcon name={i.ic} size={small ? 15 : 18} color={on ? t.brand1 : '#7A7E87'} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: small ? 13 : 13.5, fontWeight: on ? '800' : '600', color: on ? t.brand1 : '#3A3D44' }}>{i.lbl}</Text>
      {!!i.badge && <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: t.brand1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>{i.badge}</Text></View>}
    </Pressable>
  );
  const group = (i: Item) => {
    const kids = i.kids ?? [];
    if (!kids.length) return <View key={i.k}>{row(i, isOn(i.k) && !(siteId && i.k === 'sites' && false))}</View>;
    const kidOn = kids.some((c) => c.go !== i.go && isOn(c.k));
    const shown = open[i.k] ?? kidOn;
    return (
      <View key={i.k}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {row(i, isOn(i.k) && !kidOn)}
          <Pressable onPress={() => setOpen({ ...open, [i.k]: !shown })} accessibilityLabel={`Show ${i.lbl} pages`} style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: shown ? '90deg' : '0deg' }] }}>
            <OphIcon name="chevron" size={16} color="#7A7E87" />
          </Pressable>
        </View>
        {shown && <View style={{ marginLeft: 18, marginTop: 2, marginBottom: 4, paddingLeft: 8, borderLeftWidth: 1.5, borderLeftColor: '#ECEEF2' }}>{kids.map((c) => <View key={c.k + c.go} style={{ flexDirection: 'row' }}>{row(c, isOn(c.k))}</View>)}</View>}
      </View>
    );
  };
  const sub = siteId && kind !== 'finance' ? [
    { k: '', ic: 'home', lbl: 'Project Home', go: `/sites/${siteId}` },
    { k: 'schedule', ic: 'clipboard', lbl: 'Schedule of Works', go: `/sites/${siteId}/schedule` },
    { k: 'hs', ic: 'shield', lbl: 'Health & Safety', go: `/sites/${siteId}/hs` },
    { k: 'checkin', ic: 'pin', lbl: 'Check In', go: `/sites/${siteId}/checkin` },
    { k: 'messages', ic: 'chat', lbl: 'Inbox', go: `/sites/${siteId}/messages` },
    ...(site?.price_enabled && mgr ? [{ k: 'price', ic: 'pound', lbl: 'Price', go: `/sites/${siteId}/price` }] : []),
    ...(isFinanceUser(me, org) ? [{ k: 'fin', ic: 'chart', lbl: 'Finance', go: `/fin/job/${siteId}` }] : []),
    ...(mgr ? [{ k: 'admin', ic: 'gear', lbl: 'Project Settings', go: `/sites/${siteId}/admin` }] : []),
  ] : [];
  const subPart = siteId ? (path.split('/')[3] || '') : null;
  return (
    <View style={{ width: 248, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#E5E8ED', paddingTop: 18, paddingHorizontal: 12, paddingBottom: 14 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <Pressable onPress={() => router.navigate('/home' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#EEE', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
            {org?.logo_path ? <StorageImage bucket="org-logos" path={org.logo_path} style={{ width: 38, height: 38, resizeMode: 'contain' }} /> : <Image source={require('@/../assets/images/icon.png')} style={{ width: 38, height: 38 }} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={[heading(800), { fontSize: 14, color: t.brand1, lineHeight: 17 }]}>{org?.name || 'OpHUB'}</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: base.slate, letterSpacing: 0.9 }}>OPHUB</Text>
          </View>
        </Pressable>
        {kind !== 'finance' && kind !== 'superadmin' && (
          <Pressable onPress={() => router.push('/search' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#ECEEF2', borderRadius: 12, backgroundColor: '#F7F8FA' }}>
            <OphIcon name="search" size={16} color={t.brand1} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#6B7080' }}>Search</Text>
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#8A90A0', borderWidth: 1, borderColor: '#E3E6EB', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: '#fff' }}>Ctrl K</Text>
          </Pressable>
        )}
        <View style={{ gap: 2, marginTop: 4 }}>{items.map(group)}</View>
        {sub.length > 0 && (
          <>
            <Text style={{ marginTop: 18, marginHorizontal: 12, marginBottom: 4, fontSize: 10.5, fontWeight: '800', letterSpacing: 1, color: '#9A9DA4' }}>THIS PROJECT</Text>
            <Text numberOfLines={1} style={{ marginHorizontal: 12, marginBottom: 6, fontWeight: '800', fontSize: 13, color: base.ink }}>{site?.name || 'Project'}</Text>
            {sub.map((i) => <View key={i.go} style={{ flexDirection: 'row' }}>{row(i, subPart === i.k || (i.k === 'fin' && path.startsWith('/fin/job/')))}</View>)}
          </>
        )}
        <View style={{ flex: 1 }} />
        <View style={{ marginTop: 14, paddingTop: 14, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#EEE', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: base.ink }}>{me.name}</Text>
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: base.slate }}>{roleLabel(me)}</Text>
          </View>
          <Pressable onPress={() => void signOut()}><Text style={{ fontSize: 12, fontWeight: '700', color: base.warn }}>Sign out</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
