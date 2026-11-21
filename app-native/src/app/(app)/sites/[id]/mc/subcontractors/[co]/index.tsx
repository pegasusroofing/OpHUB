// One subcontractor company's page (550 renderSubcontractorHub). Their Project Manager (is_admin) runs it like our PMs. Like
// the current app's router, only managers, clients and that company's own people get in.
// Four tabs, not 14 tiles (app review, 21 Nov 2026; Andy: "Yes build the 2 plans please"): Documents (RAMS, COSHH, Toolbox
// Talks, Daily Briefings, their inspection files), Work (their Schedule of Works, Snags, Permits), People (operatives and
// their Project Manager) and Handover (close-out and O&M, for managers and their Project Manager). Their own people keep
// Check In, My Induction and the Calendar at the top, as their home on the job (the Site Rules are signed in the induction).
// With Finance on, our Finance people see the subcontractor's money on the job at the top, as clickable tiles like Finance's
// own (Andy, 21 Nov 2026): order value, applied, certified, paid, retention and what's left.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { FinStat, FinTabs } from '@/components/FinNav';
import { chooseAction } from '@/components/toast';
import { JobRows, type JobRow } from '@/components/JobRows';
import { Button, Muted } from '@/components/ui';
import { useSubcoMoney } from '@/data/closeout';
import { useCoOrders, useSubVariations } from '@/data/subVariations';
import { nameOf, usePeople } from '@/data/hs';
import { useInductions } from '@/data/inductions';
import { useSite } from '@/data/sites';
import { useSubco, useSubcos } from '@/data/subcontractors';
import { isFinanceUser, isManager } from '@/lib/roles';
import { money } from '@/lib/rules/finance';
import { useAuth } from '@/lib/auth';
import { page, space, useDesk } from '@/theme/theme';

export default function SubcoHub() {
  const { id, co, tab: asked } = useLocalSearchParams<{ id: string; co: string; tab?: string }>();
  const { me, org } = useAuth();
  const desk = useDesk();
  const { data, isLoading } = useSubco(co, me);
  const fin = !!me && isManager(me) && isFinanceUser(me, org) && org?.has_finance !== false;
  const { data: m } = useSubcoMoney(id, co, data?.company.name, fin && !!data);
  const { data: site } = useSite(id);
  const { data: list } = useSubcos(site, me);
  const mine = !!me && !isManager(me) && list?.myCompany === co;
  const { data: ind } = useInductions(mine ? id : undefined);
  const { data: people } = usePeople();
  // Their subcontract orders and variations (21 Nov 2026).
  const { data: ords = [] } = useCoOrders(id, co, !!me && isManager(me));
  const { data: vars = [] } = useSubVariations(co, !!me && (isManager(me) || mine));
  const allowed = !!me && (isManager(me) || me.role === 'client' || list?.myCompany === co);
  if (me && !allowed) return <><Stack.Screen options={{ title: 'Subcontractor' }} /><Muted style={{ padding: space.l }}>{list ? "You don't have access to this subcontractor." : 'Loading…'}</Muted></>;
  if (isLoading || !data) return <><Stack.Screen options={{ title: 'Subcontractor' }} /><Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Subcontractor not found.'}</Muted></>;
  const n = data.counts;
  const go = (p: string) => () => router.push(`/sites/${id}/mc/subcontractors/${co}/${p}` as never);
  const job = (p: string) => () => router.push(`/sites/${id}/${p}` as never);
  const docs = (k: number) => `${k} document${k === 1 ? '' : 's'}`;
  const handover = isManager(me) || data.isAdmin;
  const tabs: [string, string][] = [['docs', 'Documents'], ['work', 'Work'], ['people', 'People'], ...(handover ? [['handover', 'Handover'] as [string, string]] : [])];
  const tab = tabs.some(([k]) => k === asked) ? (asked as string) : 'docs';
  const pms = (data.pmIds ?? []).map((u) => nameOf(people, u)).join(', ');
  const rows: Record<string, JobRow[]> = {
    docs: [
      { key: 'rams', ic: 'shield', title: 'RAMS', sub: docs(n.rams), onPress: go('docs?kind=rams') },
      { key: 'coshh', ic: 'flask', title: 'COSHH', sub: docs(n.coshh), onPress: go('docs?kind=coshh') },
      { key: 'tbt', ic: 'chat', title: 'Toolbox Talks', sub: `${n.tbt} live`, onPress: go('tbt') },
      { key: 'brief', ic: 'list', title: 'Daily Briefings', sub: `${n.briefings} logged`, onPress: go('briefings') },
      { key: 'insp', ic: 'eye', title: 'Inspections', sub: `${n.inspections} file${n.inspections === 1 ? '' : 's'}`, onPress: go('inspections') },
    ],
    work: [
      { key: 'sow', ic: 'clipboard', title: 'Schedule of Works', sub: `${n.done} of ${n.tasks} complete`, onPress: go('schedule') },
      { key: 'snags', ic: 'wrench', title: 'Snags', sub: n.snags ? `${n.snags} open` : 'None open', badge: n.snags || undefined, onPress: go('snags') },
      { key: 'permits', ic: 'pen', title: 'Permits To Work', sub: n.permits ? `${n.permits} open` : 'None open', onPress: () => router.push(`/sites/${id}/mc/permits?co=${co}` as never) },
      // Their subcontract orders (ours to tick or raise) and variations (asked for by them or us; approved adds to the order).
      ...(isManager(me) ? [{ key: 'orders', ic: 'pound', title: 'Subcontract Orders', sub: (() => { const k = ords.filter((o) => o.tracked).length; return k ? `${k} tracked here` : 'Tick or raise their order'; })(), onPress: go('orders') }] : []),
      ...(isManager(me) || (mine && data.isAdmin) ? [{ key: 'vars', ic: 'receipt', title: 'Variations', sub: (() => { const w = vars.filter((v) => v.status === 'requested').length, a = vars.filter((v) => v.status === 'approved').length; return w ? `${w} waiting for approval${a ? ` · ${a} approved` : ''}` : a ? `${a} approved` : mine ? 'Request a variation' : 'None yet'; })(), badge: isManager(me) ? vars.filter((v) => v.status === 'requested').length || undefined : undefined, onPress: go('variations') }] : []),
    ],
    people: [
      { key: 'ops', ic: 'users', title: 'Operatives', sub: data.isAdmin && mine ? 'Add your operatives' : `${n.operatives} on this job`, onPress: go('operatives') },
      { key: 'pm', ic: 'admin', title: 'Project Manager', sub: pms || 'None yet · invite one from Operatives', onPress: go('operatives') },
    ],
    // Their close-out (21 Nov 2026): our managers sign it off; their Project Manager sees it. Their O&M manual for ours (20 Nov 2026).
    handover: [
      { key: 'close', ic: 'check', title: 'Close-Out', sub: n.closedOut ? 'Signed off' : 'Checks and sign-off', onPress: go('closeout') },
      { key: 'om', ic: 'book', title: 'O&M Manual', sub: n.om ? `${n.omSubmitted} of ${n.om} submitted` : 'Their O&M manual', onPress: go('om') },
    ],
  };
  const mineDone = !!(me && ind?.byOp[me.id]);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: data.company.name }} />
      {/* Their Project Manager runs their company on the job like our PMs (Andy, 20 Nov 2026): uploads only, no builders. */}
      {mine && data.isAdmin && <Muted style={{ textAlign: 'center', marginBottom: 10 }}>You&apos;re {data.company.name}&apos;s Project Manager on this job. Upload your RAMS, COSHH and Toolbox Talks, log Daily Briefings, add your operatives and close your snags.</Muted>}
      {isManager(me) && !data.hasPm && <Muted style={{ textAlign: 'center', marginBottom: 10 }}>No Project Manager for {data.company.name} yet: invite one from People › Operatives. They set up their company and upload their documents.</Muted>}
      {/* Their own people: this page is their home on the job (20 Nov 2026), so Check In, the induction and the calendar stay here. */}
      {mine && (
        <View style={{ marginBottom: 12 }}>
          <JobRows desk={desk} rows={[
            { key: 'in', ic: 'pin', title: 'Check In / Out', sub: 'On site today', onPress: job('checkin') },
            { key: 'ind', ic: 'check', title: 'My Induction', sub: mineDone ? 'Done ✓' : 'To do · before you start', badge: ind && !mineDone ? '!' : undefined, onPress: job('mc/inductions') },
            { key: 'cal', ic: 'calendar', title: 'Calendar', sub: "What's on", onPress: job('calendar') },
          ]} />
        </View>
      )}
      {fin && m && (m.subs.length ? (() => {
        // Each tile opens the order (or asks which, when there's more than one).
        const open = async () => {
          if (m.subs.length === 1) { router.push(`/fin/sub/${m.subs[0].id}` as never); return; }
          const k = await chooseAction('Which Subcontract Order', m.subs.map((s) => ({ key: s.id, label: [s.number, s.name].filter(Boolean).join(' · ') || 'Order' })));
          if (k) router.push(`/fin/sub/${k}` as never);
        };
        const basis = desk ? 150 : 140;
        return (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <FinStat basis={basis} v={money(m.order, 0)} label="Order Value" tone="blue" sub={[m.subs.length > 1 ? `${m.subs.length} orders` : m.subs[0].number || '', (() => { const a = vars.filter((v) => v.status === 'approved').reduce((t, v) => t + Number(v.added_to_order ?? v.value), 0); return a ? `incl. ${money(a, 0)} variations` : ''; })()].filter(Boolean).join(' · ') || undefined} onPress={() => void open()} />
            <FinStat basis={basis} v={money(m.applied, 0)} label="Applied To Date" tone="amber" onPress={() => void open()} />
            <FinStat basis={basis} v={money(m.certified, 0)} label="Certified To Date" tone="green" sub={m.toPay ? `${money(m.toPay, 0)} to pay` : undefined} onPress={() => void open()} />
            <FinStat basis={basis} v={money(m.paid, 0)} label="Paid To Date (Net)" tone="green" onPress={() => void open()} />
            <FinStat basis={basis} v={money(m.retention, 0)} label="Retention Held" tone="amber" onPress={() => void open()} />
            <FinStat basis={basis} v={money(m.remaining, 0)} label="Remaining On Order" tone={m.remaining < 0 ? 'red' : 'blue'} sub={m.remaining < 0 ? 'Over the order' : undefined} onPress={() => void open()} />
          </View>
        );
      })() : (
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <Muted style={{ textAlign: 'center', marginBottom: 6 }}>No subcontract order with {data.company.name} on this job yet.</Muted>
          <Button small kind="ghost" title="Subcontract Orders ›" onPress={go('orders')} />
        </View>
      ))}
      <FinTabs even value={tab} onChange={(k) => router.setParams({ tab: k })} items={tabs} />
      <JobRows desk={desk} rows={rows[tab]} />
    </ScrollView>
  );
}
