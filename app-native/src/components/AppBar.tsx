// The top bar on every page (130 shell .appbar): a back arrow on the left, the
// title centred in Sora with a small sub-line under it in IBM Plex Mono — the
// job's address on a job's pages, otherwise the company — and on Home the
// company name in its own colour over "OpHUB" with a refresh button. A job's
// pages also get the job-home button on the right and the trail under the bar
// (9219x navCrumbs): Projects › SBX-109 Andy House 2 › Schedule Of Works.
import { useQueryClient } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTrail } from '@/components/Crumbs';
import { OphIcon } from '@/components/OphIcon';
import { showAlert } from '@/components/toast';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading, mono } from '@/lib/fonts';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { base, useDesk, useTheme } from '@/theme/theme';

const FIN_SUB: Record<string, string> = { '': 'Overview', jobs: 'Projects', sales: 'Sales', purchases: 'Purchases', subs: 'Subcontractors & Labour', reports: 'Reports', settings: 'Settings', directory: 'Directory', statements: 'Statements', yard: 'Yard stock', inbox: 'Inbox', newjob: 'New project' };
// A job's sections, so a page further in can step back to its section from the trail.
const SECTION: Record<string, string> = { schedule: 'Schedule Of Works', drawings: "Drawings, Spec's & Programme", materials: 'Materials', hs: 'Health & Safety', snagging: 'Snagging', checkin: 'Check In / Out', price: 'Price', repairs: 'Repairs', om: 'O&M Manual', mc: 'Main Contractor', handover: 'Handover', todos: 'To Do List' };
// Tapping a job's address under the title copies it (or shares it on a phone) — 130 shell.
async function copyAddress(a: string) {
  try { if (Platform.OS === 'web' && globalThis.navigator?.clipboard) { await globalThis.navigator.clipboard.writeText(a); showAlert(`Address copied:
${a}`); } else await Share.share({ message: a }); } catch { /* nothing to do */ }
}
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
  // OpHUB Finance: title on the left, the section under it.
  const fin = /^\/fin(\/|$)/.test(path);
  const finSub = FIN_SUB[(path.split('/')[2] || '')] || 'OpHUB Finance';
  const finJobSub = (path.match(/^\/fin\/job\/([0-9a-f-]{36})$/) || [])[1];
  const finClient = finJobSub ? sites?.find((s) => s.id === finJobSub)?.client_name : null;
  const sub = home ? 'OpHUB' : fin ? (finJobSub ? `Finance${finClient ? ` · ${finClient}` : ''}` : title === 'OpHUB Finance' ? finSub : 'OpHUB Finance') : site ? fullSiteAddress(site) || site.name : org?.name || 'OpHUB';
  const main = home ? org?.name || 'OpHUB' : title || '';
  const sName = site ? [site.job_number, site.name].filter(Boolean).join(' ') : '';
  // Finance trail: Finance › Projects (› SBX-107 Andy House on a project's Finance).
  const finJob = fin ? (path.match(/^\/fin\/job\/([0-9a-f-]{36})/) || [])[1] : undefined;
  const fJob = finJob ? sites?.find((s) => s.id === finJob) : undefined;
  const finCrumbs: [string, string | null][] = path === '/fin' ? []
    : finJob ? [['Finance', '/fin'], ['Projects', '/fin/jobs'], [fJob ? [fJob.job_number, fJob.name].filter(Boolean).join(' ') : 'Project', null]]
      : [['Finance', '/fin'], [finSub, null]];
  // A page can give its own steps after the job (e.g. Drawings › Roof plans); otherwise a page inside a
  // section (Materials › Requests) gets the section as a step back.
  const pageTrail = useTrail(path);
  const secKey = site ? (path.split('/')[3] || '') : '';
  const secStep: [string, string][] = site && SECTION[secKey] && path.split('/').filter(Boolean).length > 3 && titleCase(title || '') !== SECTION[secKey] ? [[SECTION[secKey], `/sites/${site.id}/${secKey}`]] : [];
  const crumbs: [string, string | null][] = fin ? finCrumbs : site
    ? [['Projects', '/sites'], [sName, jobHome ? null : `/sites/${site.id}`], ...(jobHome ? [] : pageTrail ?? [...secStep, ...(!title ? [] : [[titleCase(title), null] as [string, null]])])]
    : [];
  const cfs = desk ? 12.5 : 11.5;
  const roundBtn = { width: 38, height: 38, borderRadius: 19, backgroundColor: base.paper, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <View>
      <View style={{ backgroundColor: base.card, borderBottomWidth: 1, borderBottomColor: fin ? '#e5e7eb' : desk ? '#E5E8ED' : base.line, paddingTop: insets.top + (desk ? 14 : 10), paddingBottom: desk ? 14 : 10, paddingHorizontal: desk ? 40 : 14 }}>
        <View style={{ minHeight: desk ? 52 : 44, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 44 }}>
            {onBack && (
              <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back"
                style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 30, lineHeight: 32, color: base.ink, marginTop: -3 }}>‹</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flex: 1, alignItems: fin ? 'flex-start' : 'center', minWidth: 0 }}>
            <Text numberOfLines={1} style={[heading(home ? 800 : 700), { fontSize: fin ? 21 : desk ? 22.8 : 19, color: home ? t.brand1 : fin ? '#111827' : base.ink, letterSpacing: -0.2 }]}>{main}</Text>
            {!!sub && <Text numberOfLines={1} onPress={site && !fin && !home ? () => void copyAddress(sub) : undefined} accessibilityHint={site && !fin && !home ? 'Copies the address' : undefined} style={[home ? heading(700) : fin ? {} : mono(500), { fontSize: home ? 11 : fin ? 12.5 : 12, color: fin ? '#6b7280' : base.slate, marginTop: 3, letterSpacing: home ? 1 : 0, textTransform: home ? 'uppercase' : 'none' }]}>{sub}</Text>}
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
