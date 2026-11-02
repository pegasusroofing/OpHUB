// The top bar on every page (130 shell .appbar): a back arrow on the left, the
// title centred in Sora with a small sub-line under it in IBM Plex Mono — the
// job's address on a job's pages, otherwise the company — and on Home the
// company name in its own colour over "OpHUB" with a refresh button. A job's
// pages also get the job-home button on the right and the trail under the bar
// (9219x navCrumbs): Projects › SBX-109 Andy House 2 › Schedule Of Works.
import { useQueryClient } from '@tanstack/react-query';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTrail } from '@/components/Crumbs';
import { FIN_SUBS, FinJobTabs } from '@/components/FinNav';
import { OphIcon } from '@/components/OphIcon';
import { StorageImage } from '@/components/StorageImage';
import { showAlert } from '@/components/toast';
import { isManager } from '@/lib/roles';
import { areaHome, parentOf, takeJump } from '@/lib/navBack';
import { isFullManager } from '@/lib/roles';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading, mono } from '@/lib/fonts';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { base, useDesk, useTheme } from '@/theme/theme';

// Pages with no section of their own: the trail takes you back to the list they came from.
const FIN_PARENT: Record<string, [string, string]> = { po: ['Purchases', '/fin/purchases'], pinv: ['Purchases', '/fin/purchases?tab=invoices'], plant: ['Purchases', '/fin/purchases?tab=plant'], yardin: ['Yard stock', '/fin/yard'], sub: ['Subcontractors', '/fin/subs?tab=orders'], labour: ['Subcontractors', '/fin/subs?tab=opinv'], inbox: ['Purchases', '/fin/purchases?tab=invoices'] };
const FIN_SUB: Record<string, string> = { '': 'Overview', jobs: 'Projects', sales: 'Sales', purchases: 'Purchases', subs: 'Subcontractors & Labour', reports: 'Reports', settings: 'Settings', directory: 'Directory', statements: 'Statements', yard: 'Yard stock', inbox: 'Inbox', newjob: 'New project' };
// A project's Finance tabs and the pages inside it, for the trail.
const FIN_JOB_TABS: [string, string][] = [['overview', 'Overview'], ['sales', 'Sales'], ['purchases', 'Purchases'], ['subs', 'Subcontractors & Labour'], ['setup', 'Project Admin'], ['docs', 'Documents']];
const FIN_JOB_PAGES: Record<string, string> = { boq: 'Bill of Quantities', budget: 'Budgets', costs: 'Costs', dayworks: 'Day Works', monthly: 'Monthly Report', parts: 'Parts', quotes: 'Project Quotes', summary: 'Full Summary', variations: 'Variations', invoice: 'Invoice', application: 'Application' };
// A job's sections, so a page further in can step back to its section from the trail.
const SECTION: Record<string, string> = { schedule: 'Schedule Of Works', drawings: "Drawings, Spec's & Programme", materials: 'Materials', hs: 'Health & Safety', snagging: 'Snagging', checkin: 'Check In / Out', price: 'Price', repairs: 'Repairs', om: 'O&M Manual', mc: 'Main Contractor', handover: 'Handover', todos: 'To Do List' };
// Tapping a job's address under the title copies it (or shares it on a phone) — 130 shell.
async function copyAddress(a: string): Promise<boolean> {
  try {
    if (Platform.OS !== 'web') { await Share.share({ message: a }); return false; }
    const done = await globalThis.navigator?.clipboard?.writeText(a).then(() => true).catch(() => false);
    if (!done) {
      // No clipboard on a page without https: copy the old way.
      const box = document.createElement('textarea'); box.value = a; document.body.appendChild(box); box.select(); document.execCommand('copy'); box.remove();
    }
    return true;
  } catch { /* nothing to do */ }
  return false;
}
const titleCase = (x: string) => x.replace(/[A-Za-z][A-Za-z'’.]*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));

export function AppBar({ title, onBack, home, right, noHistory }: { title?: string; onBack?: () => void; home?: boolean; right?: ReactNode; noHistory?: boolean }) {
  const { org, me } = useAuth();
  const t = useTheme();
  const desk = useDesk();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { tab: qTab, kind: qKind } = useGlobalSearchParams<{ tab?: string; kind?: string }>();
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
  // Finance trail, the whole way down (Andy, 1 Nov 2026): Finance › Projects › SBX-107 Andy House › Project Admin, or
  // Finance › Purchases › Purchase invoices. Every step but the last is a link.
  const finJob = fin ? (path.match(/^\/fin\/job\/([0-9a-f-]{36})/) || [])[1] : undefined;
  const fJob = finJob ? sites?.find((s) => s.id === finJob) : undefined;
  const finSec = path.split('/')[2] || '', finRest = path.split('/').slice(4);
  const tabLabel = (list: [string, string][] | undefined, k: string | undefined) => (k ? list?.find(([v]) => v === k)?.[1] : undefined);
  const jobTab = finJob && !finRest.length ? tabLabel(FIN_JOB_TABS, typeof qTab === 'string' ? qTab : undefined) : undefined;
  const jobPage = finRest.length ? FIN_JOB_PAGES[finRest[0]] || titleCase(title || '') : undefined;
  const inside = finRest.length > 1 && finRest[1] !== 'new' ? (title && titleCase(title) !== jobPage ? titleCase(title) : null) : finRest[1] === 'new' ? 'New' : null;
  const secTab = tabLabel(FIN_SUBS[finSec], finSec === 'directory' ? (typeof qKind === 'string' ? qKind : undefined) : typeof qTab === 'string' ? qTab : undefined);
  const finCrumbs: [string, string | null][] = path === '/fin' ? []
    : finJob ? [['Finance', '/fin'], ['Projects', '/fin/jobs'], [fJob ? `${[fJob.job_number, fJob.name].filter(Boolean).join(' ')}${finClient ? ` · ${finClient}` : ''}` : 'Project', jobTab || jobPage ? `/fin/job/${finJob}` : null],
      ...(jobTab && jobTab !== 'Overview' ? [[jobTab, null] as [string, null]] : []),
      ...(jobPage ? [[jobPage, inside ? `/fin/job/${finJob}/${finRest[0]}` : null] as [string, string | null]] : []),
      ...(inside ? [[inside, null] as [string, null]] : [])]
      : FIN_PARENT[finSec] ? [['Finance', '/fin'], FIN_PARENT[finSec], ...(title && titleCase(title) !== FIN_PARENT[finSec][0] ? [[titleCase(title), null] as [string, null]] : [])]
      : finSec === 'reports' && title && title !== 'Reports' ? [['Finance', '/fin'], ['Reports', '/fin/reports'], [titleCase(title), null]]
      : finSec === 'directory' && qKind === 'codes' ? [['Finance', '/fin'], ['Settings', '/fin/settings'], ['Cost Codes', null]]
      : secTab && secTab !== finSub ? [['Finance', '/fin'], [finSub, `/fin/${finSec}`], [secTab, null]]
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
  // The bold line: to the first page of this part of the app. The small line under it copies, rather than selecting the text.
  const area = areaHome(path);
  const titleGo = home || path.split('?')[0].replace(/\/$/, '') === area ? null : area;
  const copyable = !home && !!sub;
  const [copied, setCopied] = useState(false);
  const settingsBtn = home && isFullManager(me);
  const noSelect = { userSelect: 'none' } as never;
  const pressBack = () => {
    const from = takeJump(path.replace(/\/$/, '') || path);
    if (from) { router.navigate(from as never); return; }
    // A manager on a job goes up one level; a page further in than the trail shows, and everyone else, keeps its own back.
    const up = site && isManager(me) && (pageTrail || path.split('/').filter(Boolean).length <= 4) ? [...crumbs].reverse().find((c) => c[1])?.[1] : null;
    if (up) { router.navigate(up as never); return; }
    // Finance and manager pages one level in always go up: the section keeps old pages behind them, so history could land anywhere.
    // A page with no history at all, as after a refresh, goes up too rather than to Home.
    const clean = path.replace(/\/$/, '');
    if (noHistory || /^\/(pm|fin)(\/[^/]+)?$/.test(clean)) { router.navigate(parentOf(clean) as never); return; }
    onBack?.();
  };
  const roundBtn = { width: 38, height: 38, borderRadius: 19, backgroundColor: base.paper, alignItems: 'center', justifyContent: 'center' } as const;
  // Finance's bar (Andy, 2 Nov 2026): slim, just the back arrow and OpHUB x the company. The trail under it names the page.
  if (fin) return (
    <View>
      <View style={{ backgroundColor: base.card, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: insets.top + 6, paddingBottom: 6, paddingHorizontal: desk ? 28 : 10 }}>
        {onBack && (
          <Pressable onPress={pressBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 28, height: 30, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 26, lineHeight: 28, color: base.ink, marginTop: -3 }}>‹</Text>
          </Pressable>
        )}
        <Pressable onPress={() => router.navigate('/fin' as never)} accessibilityRole="link" accessibilityLabel="Finance overview" style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[heading(800), { fontSize: 18, letterSpacing: -0.3, color: '#111318' }]}><Text style={{ color: '#2B73D4' }}>Op</Text>HUB</Text>
          <Text style={{ fontSize: 14, color: base.slate, fontWeight: '600' }}>×</Text>
          {org?.logo_path && <StorageImage bucket="org-logos" path={org.logo_path} style={{ width: 28, height: 28, resizeMode: 'contain' }} />}
          <Text numberOfLines={1} style={[heading(700), { flexShrink: 1, fontSize: 14.5, color: t.brand1 }]}>{org?.name || ''}</Text>
        </Pressable>
        {right}
      </View>
      {crumbs.length > 1 && (
        <View style={{ backgroundColor: base.paper, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: desk ? 40 : 16, paddingTop: 8, paddingBottom: 4 }}>
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
      {!!finJob && <View style={{ backgroundColor: base.paper, paddingHorizontal: desk ? 40 : 16 }}><FinJobTabs id={finJob} job={fJob?.job_number} name={fJob?.name} onOverview={!finRest.length} active={!finRest.length ? (typeof qTab === 'string' && qTab ? qTab : 'overview') : finRest[0] === 'boq' ? 'boq' : ['invoice', 'application'].includes(finRest[0]) ? 'sales' : finRest[0] === 'quotes' ? 'purchases' : 'overview'} /></View>}
    </View>
  );
  return (
    <View>
      <View style={{ backgroundColor: base.card, borderBottomWidth: 1, borderBottomColor: fin ? '#e5e7eb' : desk ? '#E5E8ED' : base.line, paddingTop: insets.top + (desk ? 14 : 10), paddingBottom: desk ? 14 : 10, paddingHorizontal: desk ? 40 : 14 }}>
        <View style={{ minHeight: desk ? 52 : 44, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 44 }}>
            {settingsBtn && (
              <Pressable onPress={() => router.navigate('/account' as never)} hitSlop={10} accessibilityLabel="Settings" style={roundBtn}>
                <OphIcon name="gear" size={18} color={base.ink} />
              </Pressable>
            )}
            {onBack && (
              <Pressable onPress={pressBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back"
                style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 30, lineHeight: 32, color: base.ink, marginTop: -3 }}>‹</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flex: 1, alignItems: fin ? 'flex-start' : 'center', minWidth: 0 }}>
            <Pressable disabled={!titleGo} onPress={() => { if (titleGo) router.navigate(titleGo as never); }} accessibilityRole={titleGo ? 'link' : undefined} style={noSelect}><Text numberOfLines={1} style={[heading(home ? 800 : 700), { fontSize: fin ? 21 : desk ? 22.8 : 19, color: home ? t.brand1 : fin ? '#111827' : base.ink, letterSpacing: -0.2 }]}>{main}</Text></Pressable>
            {!!sub && <Pressable disabled={!copyable} onPress={async () => { if (await copyAddress(sub)) { setCopied(true); setTimeout(() => setCopied(false), 1300); } }} accessibilityRole={copyable ? 'button' : undefined} accessibilityHint={copyable ? 'Copies this text' : undefined} style={noSelect}><Text numberOfLines={1} style={[home ? heading(700) : fin ? {} : mono(500), { fontSize: home ? 11 : fin ? 12.5 : 12, color: fin ? '#6b7280' : base.slate, marginTop: 3, letterSpacing: home ? 1 : 0, textTransform: home ? 'uppercase' : 'none' }]}>{sub}</Text></Pressable>}
            {copied && <View pointerEvents="none" style={{ position: 'absolute', bottom: -8, alignSelf: 'center', backgroundColor: base.ink, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 2, zIndex: 5 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Copied</Text></View>}
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
        <View style={{ backgroundColor: base.paper, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: desk ? 40 : 16, paddingTop: desk ? 14 : 10, paddingBottom: desk ? 6 : 8 }}>
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
      noHistory={!p.back} onBack={p.back ? () => p.navigation.goBack() : () => router.navigate('/home' as never)} />
  ),
  contentStyle: { backgroundColor: base.paper },
};
