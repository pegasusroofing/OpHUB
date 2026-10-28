// A job's home page. Ported from renderSiteHome (330): Check In / Out, today's calendar
// events, then the tiles. Clients get a cut-down view (Schedule of Works, H&S, Snagging).
// Tiles for pages not built yet say so.
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';

import { useToast } from '@/components/toast';
import { Card, Muted, Tile } from '@/components/ui';
import { useSiteHome } from '@/data/siteHome';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { fullSiteAddress, siteStatusKey } from '@/lib/rules/checkin';
import { overallPct } from '@/lib/rules/sow';
import { isFinanceUser, isManager } from '@/lib/roles';
import { base, space } from '@/theme/theme';

export default function SiteHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const { data: site, isLoading } = useSite(id);
  const { data: h, refetch } = useSiteHome(site);
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  if (!site || !me) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Project not found.'}</Muted>;
  const mgr = isManager(me);
  const client = me.role === 'client';
  const go = (p: string) => () => router.push(`/sites/${site.id}/${p}` as never);
  const soon = (what: string) => () => toast(`${what} is still being built in the new app.`);
  const done = h ? h.tasks.filter((t) => t.status === 'done').length : 0;
  const sowSub = h ? `${done} of ${h.tasks.length} done${h.tasks.length ? ` · ${overallPct(h.tasks)}%` : ''}` : '…';

  if (site.repair_contract) {
    return (
      <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Stack.Screen options={{ title: site.name }} />
        <Muted>This is a maintenance / repair contract. Its repair jobs list is still being built in the new app.</Muted>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{
        title: site.name,
        headerRight: mgr ? () => <Pressable onPress={go('admin')} hitSlop={10} style={{ paddingHorizontal: 12 }}><Text style={{ fontSize: 15, color: base.ink }}>⚙ Settings</Text></Pressable> : undefined,
      }} />
      {!!fullSiteAddress(site) && <Muted style={{ marginBottom: space.m }}>{fullSiteAddress(site)}</Muted>}
      {!client && (
        <Pressable disabled={!mgr} onPress={go('client')}>
          <Card style={{ paddingVertical: 10 }}>
            {site.client_name || site.client_contact_name || site.client_phone ? (
              <>
                <Text style={{ color: base.ink }} numberOfLines={1}><Text style={{ fontWeight: '700' }}>Client:</Text> {site.client_name || '—'}</Text>
                <Text style={{ color: base.ink }} numberOfLines={1}><Text style={{ fontWeight: '700' }}>Contact:</Text> {[site.client_contact_name, site.client_phone].filter(Boolean).join(' · ') || '—'}</Text>
              </>
            ) : <Text style={{ color: base.slate, fontWeight: '700' }}>{mgr ? 'Add client info' : 'No client info yet'}</Text>}
          </Card>
        </Pressable>
      )}
      {mgr && siteStatusKey(site) === 'live' && h?.assignedCount === 0 && (
        <Pressable onPress={go('admin')}>
          <Card style={{ backgroundColor: base.warnBg }}>
            <Text style={{ color: base.ink }}><Text style={{ fontWeight: '700' }}>Nobody is assigned to this job yet.</Text> Tap to assign operatives so they can check in.</Text>
          </Card>
        </Pressable>
      )}
      {client ? (
        <>
          <Tile icon="📋" tint={base.blueBg} title="Schedule of Works" sub={sowSub} onPress={go('schedule')} />
          <Tile icon="🛡" tint="#E7E9EE" title="Health & Safety" sub="RAMS · COSHH · TBT" onPress={go('hs')} />
          <Tile icon="🔧" tint={base.warnBg} title="Snagging" sub={h ? `${h.openSnags} open` : '…'} onPress={go('snagging/list')} />
        </>
      ) : (
        <>
          <Tile icon="📍" tint={base.okBg} title="Check In / Out" sub={mgr && h ? `Tap to log time · ${h.onSiteCount} on site` : 'Tap to log time'} onPress={go('checkin')} />
          {!!h?.todayEvents.length && (
            <Card style={{ backgroundColor: base.blueBg }}>
              <Text style={{ fontWeight: '700', color: base.blue }}>Today: {h.todayEvents.join(' · ')}</Text>
            </Card>
          )}
          <Tile icon="📋" tint={base.blueBg} title="Schedule of Works" sub={sowSub} onPress={go('schedule')} />
          {site.acting_as_main_contractor && <Tile icon="🏢" tint="#E7E9EE" title="Main Contractor" sub="Areas and subcontractors" onPress={soon('The Main Contractor area')} />}
          <Tile icon="🛡" tint="#E7E9EE" title="Health & Safety" sub={h ? `${h.pendingRams} to sign` : '…'}
            badge={mgr ? (h?.hsGap ? 1 : undefined) : h?.pendingRams || undefined} onPress={go('hs')} />
          <Tile icon="✏️" tint="#E7EFEA" title="Drawings, Spec's & Programme" sub="View & upload" onPress={go('drawings')} />
          <Tile icon="📦" tint={base.okBg} title="Materials" sub={h ? `${h.pendingMaterials} pending` : '…'} onPress={go('materials')} />
          <Tile icon="🏷" tint={base.warnBg} title={mgr ? 'Inspections & Reports' : 'Snagging & Variations'} sub={h ? `${h.openSnags} open` : '…'} badge={h?.openSnags || undefined} onPress={go('snagging')} />
          {h?.canSeePrice && <Tile icon="💷" tint="#FFF3D9" title="Price" sub="Restricted access" onPress={soon('The Price tile')} />}
          {isFinanceUser(me, org) && <Tile icon="£" tint={base.okBg} title="Finance" sub={site.job_number ? `Job ${site.job_number}` : 'OpHUB Finance'} onPress={soon('Finance')} />}
          <Tile icon="📅" tint={base.okBg} title="Calendar" sub="Key dates" onPress={go('calendar')} />
          {mgr && siteStatusKey(site) === 'closed'
            ? <Tile icon="📚" tint={base.paper} title="Handover" sub="O&M manual · data sheets · guarantees" onPress={soon('Handover')} />
            : mgr && <Tile icon="✅" tint={base.paper} title="To Do List" sub={h ? (h.openTodos ? `${h.openTodos} open` : 'Nothing outstanding') : '…'} onPress={go('todos')} />}
          <Tile icon="💬" tint={base.blueBg} title="Messages" sub="Team messages for this job" onPress={go('messages')} />
        </>
      )}
    </ScrollView>
  );
}
