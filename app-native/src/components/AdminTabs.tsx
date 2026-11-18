// The Admin Centre's two rows of tabs (Andy, 18 Nov 2026: "can we make the admin centre more tab style please and sub
// tabs"), as Finance: People · Projects · Finance · H&S · Company, then that tab's pages as sub tabs, and the page
// chosen straight under them. The top bar draws them on every Admin Centre page, so choosing a tab swaps the page under
// it (no list to step back to). 🔍 at the end of the sub tabs finds any page. The pages themselves are as before.
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { Pressable, View } from 'react-native';

import { reopenGuide } from '@/components/AdminGuide';
import { KeepInView, TabItem } from '@/components/FinNav';
import { OphIcon } from '@/components/OphIcon';
import { ADMIN_PAGES, OLD_ADMIN_PAGE, adminItemAt, visibleItems, visiblePages, type AdminItem, type AdminPage } from '@/lib/adminItems';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import type { Organization, Profile } from '@/lib/types';
import { base, useDesk } from '@/theme/theme';

/** The page last open on each tab, and the tab last used, so coming back opens them again. */
const lastOn: Partial<Record<AdminPage, string>> = {};
let lastTab: AdminPage | null = null;
function remember(k: AdminPage, route?: string) { lastTab = k; if (route) lastOn[k] = route; }
const lastFor = (k: AdminPage) => lastOn[k];
const firstOf = (items: AdminItem[], k: AdminPage) => items.find((i) => i.page === k && i.route)?.route ?? null;

/** Where the Admin Centre opens: the tab asked for (?page=), else the last one used; that tab's last page, else its first. */
export function adminStart(me: Profile, org: Organization | null, asked?: string): string | null {
  const tabs = visiblePages(me, org);
  const want = (asked ? OLD_ADMIN_PAGE[asked] ?? asked : null) as AdminPage | null;
  const tab = want && tabs.includes(want) ? want : lastTab && tabs.includes(lastTab) ? lastTab : tabs[0];
  if (!tab) return null;
  return (!want && lastOn[tab]) || firstOf(visibleItems(me, org), tab);
}

/** On an Admin Centre page with the tabs over it: which tab and page. Null anywhere else (and on pages further in).
 *  routeName is the page's own (admin/users): only the page on show draws the tabs, not one kept open behind it. */
export function useAdminTab(routeName?: string) {
  const { me, org } = useAuth();
  const path = usePathname();
  const params = useGlobalSearchParams();
  const here = path.replace(/\/$/, '');
  const own = (routeName || '').replace(/(^|\/)index$/, '').replace(/\/$/, '');
  if (!me || !isManager(me) || !/^\/pm\/admin(\/|$)/.test(here) || !own || !here.endsWith(`/${own}`)) return null;
  const items = visibleItems(me, org);
  const item = adminItemAt(items, path, params);
  if (!item && path.replace(/\/$/, '') !== '/pm/admin') return null;
  const tabs = visiblePages(me, org);
  const raw = typeof params.page === 'string' ? params.page : '';
  const asked = (raw ? OLD_ADMIN_PAGE[raw] ?? raw : null) as AdminPage | null;
  const tab: AdminPage = item?.page ?? (asked && tabs.includes(asked) ? asked : lastTab && tabs.includes(lastTab) ? lastTab : tabs[0]);
  return { me, item, tab, tabs, items };
}

export function AdminTabs({ at }: { at: NonNullable<ReturnType<typeof useAdminTab>> }) {
  const desk = useDesk();
  const { refresh } = useAuth();
  const { me, item, tab, tabs, items } = at;
  const subs = items.filter((i) => i.page === tab && i.route);
  const guide = tab === 'company' && me.role === 'admin';
  const go = (i: AdminItem) => { if (!i.route) return; remember(i.page, i.route); router.replace(i.route as never); };
  const goTab = (k: AdminPage) => { remember(k); const r = lastFor(k) || firstOf(items, k); router.replace((r || `/pm/admin?page=${k}`) as never); };
  const pickSub = async (k: string) => {
    if (k === 'guide') { await reopenGuide(me); await refresh(); router.push('/home' as never); return; }
    const i = subs.find((x) => x.key === k); if (i) go(i);
  };
  const line = { borderBottomWidth: 1, borderBottomColor: '#e5e7eb' } as const;
  return (
    <View style={{ backgroundColor: base.paper, paddingHorizontal: desk ? 40 : 16, paddingTop: desk ? 10 : 6 }}>
      {desk ? (
        <View style={line}>
          <KeepInView on={tab} items={tabs.map((k) => [k, ADMIN_PAGES[k].label] as [string, string])} render={(k, l) => <TabItem on={k === tab} label={l} onPress={() => goTab(k as AdminPage)} />} />
        </View>
      ) : (
        // A phone has the five tabs across the whole width.
        <View style={[line, { flexDirection: 'row', justifyContent: 'space-between' }]}>
          {tabs.map((k) => <TabItem key={k} pad={tabs.length > 4 ? 5 : 10} on={k === tab} label={ADMIN_PAGES[k].label} onPress={() => goTab(k)} />)}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <View style={[line, { flex: 1, minWidth: 0 }]}>
          <KeepInView on={item?.key} items={[...subs.map((i) => [i.key, i.label] as [string, string]), ...(guide ? [['guide', 'Set-Up Guide'] as [string, string]] : [])]}
            render={(k, l) => <TabItem on={k === item?.key} label={l} onPress={() => void pickSub(k)} />} />
        </View>
        <Pressable onPress={() => router.push('/pm/admin?search=1' as never)} hitSlop={8} accessibilityLabel="Search the Admin Centre" style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}>
          <OphIcon name="search" size={18} color={base.ink} />
        </Pressable>
      </View>
    </View>
  );
}
