// Main Contractor (510 renderMcHome), made simple (app review, 21 Nov 2026; Andy: "Yes build the 2 plans please").
// Managers: "Set Up: 3 Of 5 Done" at the top (F10, Asbestos Register, Construction Phase Plan, Site Rules, Induction Form,
// each ticking itself), then three tabs in place of nine tiles: Before Work (the plan, with the F10 and Asbestos Register
// it refers to, and the Site Rules), People (subcontractors and inductions together: each person Inducted ✓ and Signed
// Site Rules ✓ on one row) and On Site (permits and inspections). The Programme tile went: it's Drawings › Programme.
// Operatives see two rows, My Induction and Permits To Sign, plus anything a manager shows them (a row's ⋮).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinTabs } from '@/components/FinNav';
import { JobRows, type JobRow } from '@/components/JobRows';
import { OphIcon } from '@/components/OphIcon';
import { chooseAction, useToast } from '@/components/toast';
import { Muted } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { MC_OP_DEFAULT, MC_PART_TITLE, MC_SETUP, mcOpSees, setMcOpSees, useMcHome, useMcPeople, useMcSetup, type McPart } from '@/data/mc';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { heading } from '@/lib/fonts';
import { isManager } from '@/lib/roles';
import { base, page, radius, space, useDesk } from '@/theme/theme';

const ROUTE: Record<McPart, string> = {
  cpp: 'mc/docs/cpp', asbestos: 'mc/docs/asbestos', f10: 'mc/docs/f10', permits: 'mc/permits', inspections: 'mc/inspections',
  site_layout: 'mc/layout', site_inductions: 'mc/inductions', subcontractors: 'mc/subcontractors',
};
const ICON: Record<McPart, string> = {
  cpp: 'book', f10: 'mail', asbestos: 'shield', site_layout: 'clipboard', subcontractors: 'users', site_inductions: 'check', permits: 'pen', inspections: 'eye',
};
type Tab = 'before' | 'people' | 'onsite';
const docs = (n: number) => `${n} document${n === 1 ? '' : 's'}`;

export default function McHome() {
  const { id, tab: asked } = useLocalSearchParams<{ id: string; tab?: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const desk = useDesk();
  const { data: site } = useSite(id);
  const mgr = !!me && isManager(me);
  const { data } = useMcHome(site, me);
  const { data: setup } = useMcSetup(site?.id, me?.org_id, mgr);
  const tab: Tab = asked === 'people' || asked === 'onsite' ? asked : 'before';
  const { data: crew } = useMcPeople(site?.id, mgr && tab === 'people');
  const { data: people } = usePeople();
  const [showSetup, setShowSetup] = useState<boolean | null>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!site.acting_as_main_contractor) return <><Stack.Screen options={{ title: 'Main Contractor' }} /><Muted style={{ padding: space.l }}>This job isn&apos;t set up as a Main Contractor job.</Muted></>;
  const go = (p: string) => () => router.push((p.startsWith('/') ? p : `/sites/${id}/${p}`) as never);

  // A part as a row; a manager's ⋮ shows it to operatives or hides it.
  const opNote = (k: McPart) => (mcOpSees(site, k) ? (MC_OP_DEFAULT.includes(k) ? '' : ' · shown to operatives') : (MC_OP_DEFAULT.includes(k) ? ' · hidden from operatives' : ''));
  const part = (k: McPart, sub: string, extra?: Partial<JobRow>): JobRow => ({
    key: k, ic: ICON[k], title: MC_PART_TITLE[k], sub: mgr ? `${sub}${opNote(k)}` : sub, onPress: go(ROUTE[k]), ...extra,
    menu: mgr ? async () => {
      const sees = mcOpSees(site, k);
      const c = await chooseAction(MC_PART_TITLE[k], [{ key: 'vis', label: sees ? '🙈 Hide From Operatives' : '👁 Show To Operatives' }]);
      if (c !== 'vis') return;
      if (await setMcOpSees(id, site, k, !sees)) void qc.invalidateQueries({ queryKey: ['sites'] }); else toast('Could not save — try again.');
    } : undefined,
  });

  const d = data;
  const subOf: Record<McPart, string> = {
    cpp: d ? (d.cpp ? (d.cpp.status === 'issued' ? `Issued · version ${d.cpp.version}` : 'Draft · being written') : docs(d.docs.cpp || 0)) : '…',
    f10: site.f10_not_required ? 'Not required on this job' : d ? `${docs(d.docs.f10 || 0)} · for the plan` : '…',
    asbestos: d ? `${docs(d.docs.asbestos || 0)} · for the plan` : '…',
    site_layout: d ? `${docs(d.layout)} · signed in the induction` : '…',
    subcontractors: d ? `${d.companies} compan${d.companies === 1 ? 'y' : 'ies'}` : '…',
    site_inductions: d ? (d.rosterSize ? `${d.inducted} of ${d.rosterSize} inducted` : `${d.completions} completed`) : '…',
    permits: d ? (d.openPermits ? `${d.openPermits} open` : 'None open') : '…',
    inspections: d ? (d.inspections ? `${d.inspections} logged` : d.templates ? 'None logged yet' : 'Set Up Templates') : '…',
  };

  // Operatives: My Induction and Permits To Sign, and anything shown to them.
  if (!mgr) {
    const rows: JobRow[] = [];
    if (mcOpSees(site, 'site_inductions')) rows.push({ key: 'ind', ic: 'check', title: 'My Induction', sub: d ? (d.meInducted ? 'Done ✓' : 'To do · before you start') : '…', badge: d && !d.meInducted ? '!' : undefined, onPress: go(ROUTE.site_inductions) });
    if (mcOpSees(site, 'permits')) rows.push({ key: 'per', ic: 'pen', title: 'Permits To Sign', sub: d ? (d.toSign ? `${d.toSign} to sign` : 'None to sign') : '…', badge: d?.toSign || undefined, onPress: go(ROUTE.permits) });
    (['cpp', 'f10', 'asbestos', 'subcontractors', 'inspections'] as McPart[]).filter((k) => mcOpSees(site, k)).forEach((k) => rows.push(part(k, subOf[k])));
    return (
      <ScrollView contentContainerStyle={page(720)}>
        <Stack.Screen options={{ title: 'Main Contractor' }} />
        {rows.length ? <JobRows desk={desk} rows={rows} /> : <Muted>Nothing here for you on this job.</Muted>}
      </ScrollView>
    );
  }

  const n = setup?.n ?? 0, all = !!setup && n === MC_SETUP.length;
  const open = showSetup ?? !all;
  const rowsFor: Record<Tab, JobRow[]> = {
    before: [part('cpp', subOf.cpp), part('f10', subOf.f10), part('asbestos', subOf.asbestos), part('site_layout', subOf.site_layout)],
    people: [part('subcontractors', subOf.subcontractors), part('site_inductions', subOf.site_inductions)],
    onsite: [part('permits', subOf.permits), part('inspections', subOf.inspections)],
  };
  const tick = (ok: boolean) => (
    <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: ok ? base.ink : '#C9CDD3', backgroundColor: ok ? base.ink : '#fff', alignItems: 'center', justifyContent: 'center' }}>
      {ok && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
    </View>
  );
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Main Contractor' }} />
      {/* Set Up: n Of 5 Done. Open until it's all done; then one line. */}
      <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 10, marginBottom: 12 }}>
        <Pressable onPress={() => setShowSetup(!open)} accessibilityRole="button" accessibilityLabel={`Set Up: ${all ? 'All Done' : `${n} Of ${MC_SETUP.length} Done`}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 }}>
          <Text style={[heading(600), { flex: 1, fontSize: 14, color: base.ink }]}>{!setup ? 'Set Up: …' : all ? `Set Up: All ${MC_SETUP.length} Done ✓` : `Set Up: ${n} Of ${MC_SETUP.length} Done`}</Text>
          <Text style={{ fontSize: 15, color: base.slate }}>{open ? '▴' : '▾'}</Text>
        </Pressable>
        {open && MC_SETUP.map((s) => {
          const ok = !!setup?.done[s.k];
          return (
            <Pressable key={s.k} onPress={go(s.go)} accessibilityRole="button" accessibilityLabel={`${s.label}${ok ? ', done' : ', to do'}`}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#EEF0F2' }, pressed && { backgroundColor: '#F7F8FA' }]}>
              {tick(ok)}
              <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: ok ? base.slate : base.ink }}>{s.label}</Text>
              <Text style={{ fontSize: 12, color: base.slateLight }}>{ok ? (s.k === 'f10' && setup?.f10Off ? 'Not Required' : 'Done') : s.k === 'form' ? 'Admin' : 'To Do'}</Text>
              <OphIcon name="chevron" size={14} color={base.slateLight} />
            </Pressable>
          );
        })}
      </View>
      <FinTabs even value={tab} onChange={(k) => router.setParams({ tab: k })} items={[['before', 'Before Work'], ['people', 'People'], ['onsite', 'On Site']]} />
      <JobRows desk={desk} rows={rowsFor[tab]} />
      {/* People: ours and the subcontractors' operatives, each Inducted and Signed Site Rules on one row. */}
      {tab === 'people' && (
        <View style={{ marginTop: 12 }}>
          <Text style={[heading(600), { fontSize: 13.5, color: base.ink, marginBottom: 6 }]}>Everyone On This Job</Text>
          {!crew ? <Muted>Loading…</Muted> : crew.people.length ? crew.people.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontWeight: '600', color: base.ink }}>{nameOf(people, p.id)}</Text>
                {!!p.company && <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slateLight }}>{p.company}</Text>}
              </View>
              <Text style={{ fontSize: 12, color: p.inducted ? base.ok : base.slate }}>{p.inducted ? 'Inducted ✓' : 'Not Inducted'}</Text>
              {crew.hasRules && <Text style={{ fontSize: 12, color: p.rules ? base.ok : base.slate }}>{p.rules ? 'Site Rules ✓' : 'Site Rules ✗'}</Text>}
            </View>
          )) : <Muted>Nobody on this job yet. Assign operatives in Project Settings, or add a subcontractor&apos;s operatives.</Muted>}
        </View>
      )}
    </ScrollView>
  );
}
