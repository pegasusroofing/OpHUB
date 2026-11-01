// The bottom bar on a phone in Projects (130 tabbar / homeBottomBar). On the projects list, for PMs and
// admins: Home, Deliveries, + Add, HUB, Calendar. On a job: Home (the job's; from there, all projects),
// Deliveries for managers or Schedule of Works for everyone else, Check In, Inbox, Settings.
import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OphIcon } from '@/components/OphIcon';
import { useAuth } from '@/lib/auth';
import { isFullManager, isManager } from '@/lib/roles';
import { base, useTheme } from '@/theme/theme';

type Item = { k: string; icon: string; label: string; href: string; emph?: boolean; branded?: boolean; badge?: number; on?: boolean };

const JOB = /^\/sites\/([0-9a-f-]{36})(?:\/(.*))?$/;
/** Whether this path has the Projects bar, not the general one. */
export const usesPhoneBar = (path: string, fullManager: boolean) => JOB.test(path) || fullManager;

export function PhoneBar({ hubCount, inboxCount }: { hubCount?: number; inboxCount?: number }) {
  const { me } = useAuth();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname().replace(/\/$/, '');
  const job = path.match(JOB);
  let items: Item[];
  if (job) {
    const id = job[1], sub = job[2] || '';
    items = [
      { k: 'home', icon: 'home', label: 'Home', href: sub ? `/sites/${id}` : '/sites', on: !sub },
      isManager(me) ? { k: 'deliveries', icon: 'truck', label: 'Deliveries', href: '/pm/deliveries' } : { k: 'sow', icon: 'list', label: 'SOW', href: `/sites/${id}/schedule`, on: sub.startsWith('schedule') },
      { k: 'checkin', icon: 'pin', label: 'Check In', href: `/sites/${id}/checkin`, emph: true, on: sub.startsWith('checkin') },
      { k: 'inbox', icon: 'chat', label: 'Inbox', href: `/sites/${id}/messages`, badge: inboxCount, on: sub.startsWith('messages') },
      { k: 'more', icon: 'gear', label: 'Settings', href: isManager(me) ? `/sites/${id}/admin` : '/account', on: sub.startsWith('admin') },
    ];
  } else if (isFullManager(me)) {
    items = [
      { k: 'home', icon: 'home', label: 'Home', href: '/home', on: path === '/home' },
      { k: 'deliveries', icon: 'truck', label: 'Deliveries', href: '/pm/deliveries', on: path.startsWith('/pm/deliver') },
      { k: 'add', icon: 'plus', label: 'Add', href: '/sites/new', emph: true, branded: true, on: path === '/sites/new' },
      { k: 'hub', icon: 'bell', label: 'HUB', href: '/pm/hub', badge: hubCount, on: path === '/pm/hub' },
      { k: 'calendar', icon: 'calendar', label: 'Calendar', href: '/pm/calendar', on: path === '/pm/calendar' },
    ];
  } else return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: base.card, borderTopWidth: 1, borderTopColor: base.cardLine, paddingTop: 6, paddingBottom: 8 + insets.bottom }}>
      {items.map((x) => {
        const colour = x.branded ? t.brand1Text : x.on ? t.brand1 : base.tabIdle;
        return (
          <Pressable key={x.k} onPress={() => router.navigate(x.href as never)} accessibilityRole="button" accessibilityLabel={x.label}
            style={{ alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 58, minHeight: 44, borderRadius: 12, paddingHorizontal: x.emph ? 14 : 6, paddingVertical: 4, ...(x.emph ? { borderWidth: 1.5, borderColor: x.branded ? t.brand1 : x.on ? t.brand1 : base.line, backgroundColor: x.branded ? t.brand1 : base.paper } : {}) }}>
            <OphIcon name={x.icon} size={x.emph ? 24 : 22} color={colour} />
            {!x.branded && <Text style={{ fontSize: 10, fontWeight: '700', color: colour }}>{x.label}</Text>}
            {!!x.badge && <View style={{ position: 'absolute', top: 0, right: 8, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: base.red, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800' }}>{x.badge}</Text></View>}
          </Pressable>
        );
      })}
    </View>
  );
}
