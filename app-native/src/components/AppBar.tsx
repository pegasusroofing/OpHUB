// The top bar on every page (130 shell .appbar): a back arrow on the left, the
// title centred in Sora with a small sub-line under it in IBM Plex Mono — the
// job's name and address on a job's pages, otherwise the company — and on Home
// the company name in its own colour over "OpHUB" with a refresh button.
import { useQueryClient } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading, mono } from '@/lib/fonts';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { base, useDesk, useTheme } from '@/theme/theme';

export function AppBar({ title, onBack, home }: { title?: string; onBack?: () => void; home?: boolean }) {
  const { org } = useAuth();
  const t = useTheme();
  const desk = useDesk();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { data: sites } = useSites();
  const siteId = (path.match(/^\/sites\/([0-9a-f-]{36})/) || [])[1];
  const site = siteId ? sites?.find((s) => s.id === siteId) : undefined;
  // A job's own home page already has its name as the title, so just the address under it.
  const sub = home ? 'OpHUB' : site ? [title === site.name ? '' : site.name, fullSiteAddress(site)].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ') : org?.name || 'OpHUB';
  const main = home ? org?.name || 'OpHUB' : title || '';
  return (
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
        <View style={{ width: 44, alignItems: 'flex-end' }}>
          {home && (
            <Pressable onPress={() => void qc.invalidateQueries()} hitSlop={10} accessibilityLabel="Refresh" style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: base.paper, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 17, color: base.ink }}>↻</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

type HeaderProps = { options: { title?: string }; route: { name: string }; back?: unknown; navigation: { goBack: () => void } };
/** Header for every Stack (sites, pm, fin, driver): the shared top bar. */
export const stackHeader = {
  // First page of a section (opened from the menu): back goes Home, as the current app's back arrow did.
  header: (p: HeaderProps) => <AppBar title={p.options.title ?? p.route.name} onBack={p.back ? () => p.navigation.goBack() : () => router.navigate('/home' as never)} />,
  contentStyle: { backgroundColor: base.paper },
};
