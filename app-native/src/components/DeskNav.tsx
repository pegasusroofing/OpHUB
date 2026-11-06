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
import { brand } from '@/lib/fonts';
import { homeKind, isFinanceUser, isFullManager, isManager, roleLabel } from '@/lib/roles';
import { base, useTheme } from '@/theme/theme';

type Item = { k: string; ic: string; lbl: string; go: string; badge?: number; kids?: Item[] };

/** The menu's colours: charcoal, light grey text, the page you're on in white with a red edge (Andy, 6 Nov 2026). */
const NAV = { bg: '#16181D', text: '#C9CDD3', dim: '#8A9099', on: '#2A2D35', hover: '#20232A', line: '#2A2D35', search: '#23262D', avatar: '#3A3E47' };
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
        ...(isManager(me) ? [{ k: 'pm/sitemap', ic: 'pin', lbl: 'Sites Map', go: '/pm/sitemap' }] : []),
        ...(isFullManager(me) ? [{ k: 'pm/reports', ic: 'reports', lbl: 'Reports & Surveys', go: '/pm/reports' }] : []),
      ] },
      ...(isFullManager(me) ? [{ k: 'pm/quotes', ic: 'reports', lbl: 'Quotes', go: '/pm/quotes' }] : []),
      // Deliveries opens out like Projects: the delivery schedule, and the yard and plant register (Andy, 5 Nov 2026; it was under Projects).
      { k: 'pm/deliveries', ic: 'truck', lbl: 'Deliveries', go: '/pm/deliveries', kids: [
        { k: 'pm/deliveries', ic: 'truck', lbl: 'Delivery Schedule', go: '/pm/deliveries' },
        ...(isManager(me) ? [{ k: 'pm/yard', ic: 'tools', lbl: 'Yard & Plant', go: '/pm/yard' }] : []),
      ] },
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
      ...(me.role !== 'client' ? [{ k: 'inbox', ic: 'chat', lbl: 'Inbox', go: '/inbox', badge: hubN || undefined }, { k: 'dashboard', ic: 'tools', lbl: 'My Dashboard', go: '/dashboard' }] : []),
      { k: 'account', ic: 'gear', lbl: 'Settings', go: '/account' },
    ];
  // Which item is "on": the longest matching path.
  const seg = path.replace(/^\//, '');
  const siteId = (path.match(/^\/sites\/([0-9a-f-]{36})/) || [])[1];
  const site = siteId ? sites?.find((s) => s.id === siteId) : undefined;
  const isOn = (k: string) => (k === 'home' ? seg === 'home' || seg === '' : k === 'sites' ? seg === 'sites' || seg.startsWith('sites/') : seg === k || seg.startsWith(`${k}/`));
  // Charcoal menu (Andy, 6 Nov 2026: option 1): light text, the page you're on in white with a red edge.
  const row = (i: Item, on: boolean, small = false) => (
    <Pressable key={i.k + i.go} onPress={() => router.navigate(i.go as never)} accessibilityRole="link"
      style={(st) => [{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: small ? 7 : 9, paddingHorizontal: small ? 10 : 12, borderRadius: 10, flex: 1 },
        on ? { backgroundColor: NAV.on, borderLeftWidth: 3, borderLeftColor: t.brand1, paddingLeft: (small ? 10 : 12) - 3 } : (st as { hovered?: boolean }).hovered ? { backgroundColor: NAV.hover } : null]}>
      <OphIcon name={i.ic} size={small ? 15 : 18} color={on ? '#fff' : NAV.dim} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: small ? 13 : 13.5, fontWeight: on ? '600' : '500', color: on ? '#fff' : NAV.text }}>{i.lbl}</Text>
      {!!i.badge && <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: t.brand1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '600' }}>{i.badge}</Text></View>}
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
            <OphIcon name="chevron" size={16} color={NAV.dim} />
          </Pressable>
        </View>
        {shown && <View style={{ marginLeft: 18, marginTop: 2, marginBottom: 4, paddingLeft: 8, borderLeftWidth: 1.5, borderLeftColor: NAV.line }}>{kids.map((c) => <View key={c.k + c.go} style={{ flexDirection: 'row' }}>{row(c, isOn(c.k))}</View>)}</View>}
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
    <View style={{ width: 248, backgroundColor: NAV.bg, paddingTop: 18, paddingHorizontal: 12, paddingBottom: 14 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <Pressable onPress={() => router.navigate('/home' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#EEE', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
            {org?.logo_path ? <StorageImage bucket="org-logos" path={org.logo_path} style={{ width: 38, height: 38, resizeMode: 'contain' }} /> : <Image source={require('@/../assets/images/icon.png')} style={{ width: 38, height: 38 }} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={[brand(700), { fontSize: 14, color: '#fff', lineHeight: 17 }]}>{org?.name || 'OpHUB'}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: NAV.dim, letterSpacing: 0.9 }}>OPHUB</Text>
          </View>
        </Pressable>
        {kind !== 'finance' && kind !== 'superadmin' && (
          <Pressable onPress={() => router.push('/search' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: NAV.search }}>
            <OphIcon name="search" size={16} color={NAV.dim} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: NAV.dim }}>Search</Text>
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: NAV.dim, borderWidth: 1, borderColor: NAV.line, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>Ctrl K</Text>
          </Pressable>
        )}
        <View style={{ gap: 2, marginTop: 4 }}>{items.map(group)}</View>
        {sub.length > 0 && (
          <>
            <Text style={{ marginTop: 18, marginHorizontal: 12, marginBottom: 4, fontSize: 10.5, fontWeight: '600', letterSpacing: 1, color: NAV.dim }}>THIS PROJECT</Text>
            <Text numberOfLines={1} style={{ marginHorizontal: 12, marginBottom: 6, fontWeight: '600', fontSize: 13, color: '#fff' }}>{site?.name || 'Project'}</Text>
            {sub.map((i) => <View key={i.go} style={{ flexDirection: 'row' }}>{row(i, subPart === i.k || (i.k === 'fin' && path.startsWith('/fin/job/')))}</View>)}
          </>
        )}
        <View style={{ flex: 1 }} />
        <View style={{ marginTop: 14, paddingTop: 14, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: NAV.line, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: NAV.avatar, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '600' }}>{(me.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: '#fff' }}>{me.name}</Text>
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '500', color: NAV.dim }}>{roleLabel(me)}</Text>
          </View>
          <Pressable onPress={() => void signOut()}><Text style={{ fontSize: 12, fontWeight: '600', color: base.warn }}>Sign out</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
