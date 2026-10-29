// The top bar on every page (130 shell .appbar): a back arrow on the left, the
// title centred in Sora with a small sub-line under it in IBM Plex Mono — the
// job's address on a job's pages, otherwise the company — and on Home the
// company name in its own colour over "OpHUB" with a refresh button. A job's
// pages also get the job-home button on the right and the trail under the bar
// (9219x navCrumbs): Projects › SBX-109 Andy House 2 › Schedule Of Works.
import { useQueryClient } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OphIcon } from '@/components/OphIcon';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading, mono } from '@/lib/fonts';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { base, useDesk, useTheme } from '@/theme/theme';

const titleCase = (x: string) => x.replace(/[A-Za-z][A-Za-z'’.]*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));

export function AppBar({ title, onBack, home, right }: { title?: string; onBack?: () => void; home?: boolean; right?: ReactNode }) {
  const { org } = useAuth();
  const t = useTheme();
  const desk = useDesk();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { data: sites } = useSites();
  const siteId = (path.match(/^\/sites\/([0-9a-f-]{36})/) || [])[1];
  const site = siteId ? sites?.find((s) => s.id === siteId) : undefined;
  const jobHome = !!site && path.replace(/\/$/, '') === `/sites/${site.id}`;
  const sub = home ? 'OpHUB' : site ? fullSiteAddress(site) || site.name : org?.name || 'OpHUB';
  const main = home ? org?.name || 'OpHUB' : title || '';
  const sName = site ? [site.job_number, site.name].filter(Boolean).join(' ') : '';
  const crumbs: [string, string | null][] = site
    ? [['Projects', '/sites'], [sName, jobHome ? null : `/sites/${site.id}`], ...(jobHome || !title ? [] : [[titleCase(title), null] as [string, null]])]
    : [];
  const cfs = desk ? 12.5 : 11.5;
  const roundBtn = { width: 38, height: 38, borderRadius: 19, backgroundColor: base.paper, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <View>
      <View style={{ backgroundColor: base.card, borderBottomWidth: 1, borderBottomColor: desk ? '#E5E8ED' : base.line, paddingTop: insets.top + (desk ? 14 : 10), paddingBottom: desk ? 14 : 10, paddingHorizontal: desk ? 40 : 14 }}>
        <View style={{ minHeight: desk ? 52 : 44, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 44 }}>
            {onBack && (
              <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back"
                style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 30, lineHeight: 32, color: base.ink, marginTop: -3 }}>‹</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
            <Text numberOfLines={1} style={[heading(home ? 800 : 700), { fontSize: desk ? 22.8 : 19, color: home ? t.brand1 : base.ink, letterSpacing: -0.2 }]}>{main}</Text>
            {!!sub && <Text numberOfLines={1} style={[home ? heading(700) : mono(500), { fontSize: home ? 11 : 12, color: base.slate, marginTop: 3, letterSpacing: home ? 1 : 0, textTransform: home ? 'uppercase' : 'none' }]}>{sub}</Text>}
          </View>
          <View style={{ minWidth: 44, alignItems: 'flex-end' }}>
            {right ?? (site && !jobHome && (
              <Pressable onPress={() => router.navigate(`/sites/${site.id}` as never)} hitSlop={10} accessibilityLabel="Job home" style={roundBtn}>
                <OphIcon name="home" size={18} color={base.ink} />
              </Pressable>
            ))}
            {home && (
              <Pressable onPress={() => void qc.invalidateQueries()} hitSlop={10} accessibilityLabel="Refresh" style={roundBtn}>
                <Text style={{ fontSize: 17, color: base.ink }}>↻</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
      {crumbs.length > 1 && (
        <View style={{ backgroundColor: base.paper, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: desk ? 40 : 16, paddingTop: desk ? 14 : 10 }}>
          {crumbs.map(([l, href], i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
              {i > 0 && <Text style={{ color: '#B8BDC6', fontSize: cfs }}>›</Text>}
              {href
                ? <Pressable onPress={() => router.navigate(href as never)}><Text style={{ fontSize: cfs, fontWeight: '700', color: t.brand1 }}>{l}</Text></Pressable>
                : <Text numberOfLines={1} style={{ fontSize: cfs, fontWeight: '700', color: base.ink }}>{l}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

type HeaderProps = { options: { title?: string; headerRight?: (p: { tintColor?: string; canGoBack: boolean }) => ReactNode }; route: { name: string }; back?: unknown; navigation: { goBack: () => void } };
/** Header for every Stack (sites, pm, fin, driver): the shared top bar. */
export const stackHeader = {
  // First page of a section (opened from the menu): back goes Home, as the current app's back arrow did.
  header: (p: HeaderProps) => (
    <AppBar title={p.options.title ?? p.route.name} right={p.options.headerRight?.({ canGoBack: !!p.back })}
      onBack={p.back ? () => p.navigation.goBack() : () => router.navigate('/home' as never)} />
  ),
  contentStyle: { backgroundColor: base.paper },
};
