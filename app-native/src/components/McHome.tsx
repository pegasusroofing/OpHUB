// Main Contractor mode (Andy, 21 Nov 2026: "change the main contractor to be a main contractor mode which completely
// changes the layouts when chosen ... when you're a main contractor that's the focal point"; he chose Ideas 1 + 3 mixed).
// A manager's job home on a main contractor job: the counts (On Site Now, Inductions To Do, Permits Open, RAMS To
// Approve) and Set Up at the top, then Today (a checklist made from what's due, who's on site with Fire Roll Call, what's
// arriving, the programme), Run The Site (the daily running and the subcontractors), Documents and Handover. Our own
// trade's rows fold away under Our Own Works. Operatives and clients keep the ordinary job page.
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { FinTabs } from '@/components/FinNav';
import { JobRows, type JobRow } from '@/components/JobRows';
import { Pop } from '@/components/Pop';
import { QrCode } from '@/components/QrCode';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { MC_DOC_LABEL, MC_SETUP, useMcHome, useMcSetup, useMcToday } from '@/data/mc';
import { newVisitorKey, signOutVisitor, useSiteVisitors, visitLink } from '@/data/visitors';
import { money } from '@/lib/rules/finance';
import type { Profile, Site } from '@/lib/types';
import { base } from '@/theme/theme';

type Tab = 'today' | 'site' | 'docs' | 'handover';
const card = { backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, padding: 12, marginBottom: 12 } as const;
const secT = { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6, color: base.slate, marginBottom: 6 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Which week of the job this is, counting from its start date. */
const weekOf = (start: string | null | undefined) => (start ? Math.max(1, Math.floor((new Date().getTime() - new Date(`${start}T00:00:00`).getTime()) / (7 * 864e5)) + 1) : null);

export function McHome({ site, me, desk, top, ownRows }: { site: Site; me: Profile; desk: boolean; top: ReactNode; ownRows: JobRow[] }) {
  const { tab: tabIn } = useLocalSearchParams<{ tab?: string }>();
  const tab: Tab = (['today', 'site', 'docs', 'handover'] as Tab[]).includes(tabIn as Tab) ? (tabIn as Tab) : 'today';
  const { data: t } = useMcToday(site, me);
  const { data: setup } = useMcSetup(site.id, me.org_id);
  const { data: d } = useMcHome(site, me);
  const [roll, setRoll] = useState(false);
  // Visitors (Andy, 21 Nov 2026): signed in from the job's QR code; on site until they (or a manager) sign them out.
  const { data: visitors = [] } = useSiteVisitors(site.id);
  const visitorsIn = visitors.filter((v) => !v.signed_out_at);
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const onSiteAll = t ? t.onSiteTotal + visitorsIn.length : null;
  const openRoll = () => { void qc.invalidateQueries({ queryKey: ['mcTiles', site.id] }); setRoll(true); };
  const [own, setOwn] = useState(false);
  const go = (p: string) => () => router.push(`/sites/${site.id}/${p}` as never);
  // The check-in point to confirm stays at the top; a laptop's HUB row sits on Today; the rest is Our Own Works.
  const geoRow = ownRows.find((r) => r.key === 'geo'), hubRow = ownRows.find((r) => r.key === 'hub');
  const restRows = ownRows.filter((r) => r.key !== 'geo' && r.key !== 'hub');
  const dash = '…';

  // ----- The counts -----
  const stat = (n: number | null, label: string, hot: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${n ?? ''} ${label}`}
      style={({ pressed }) => [{ flexGrow: 1, flexBasis: desk ? 0 : '45%', backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }, pressed && { opacity: 0.85 }]}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: hot && n ? base.red : base.ink }}>{n ?? dash}</Text>
      <Text style={{ fontSize: 12, color: base.slate }}>{label}</Text>
    </Pressable>
  );
  const ours = t?.onSite.find((g) => g.ours)?.people.length ?? 0;
  const closingToday = (t?.permits ?? []).filter((p) => p.workDate && p.workDate <= new Date().toISOString().slice(0, 10));
  const counts = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
      {stat(onSiteAll, desk && t ? `On Site Now · ${ours} Ours · ${t.onSiteTotal - ours} Subcontractors${visitorsIn.length ? ` · ${visitorsIn.length} Visitors` : ''}` : 'On Site Now', false, openRoll)}
      {stat(t ? t.toInduct.length : null, 'Inductions To Do', true, go('mc/inductions'))}
      {stat(t ? t.permits.length : null, desk && closingToday.length ? `Permits Open · ${closingToday.length} For Today` : 'Permits Open', false, go('mc/permits'))}
      {stat(t ? t.rams.length : null, 'RAMS To Approve', true, go('hs/rams'))}
    </View>
  );
  const setupLeft = setup ? MC_SETUP.length - setup.n : 0;
  const setupLine = setup && setupLeft > 0 ? (
    <Pressable onPress={go('mc')} accessibilityRole="button" style={[card, { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }]}>
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: base.ink }}>{`Set Up: ${setup.n} Of ${MC_SETUP.length} Done`}</Text>
      <Text style={{ fontSize: 12.5, color: base.slate }}>{`${MC_SETUP.find((x) => !setup.done[x.k])?.label ?? ''} To Do ›`}</Text>
    </Pressable>
  ) : null;

  // ----- Today -----
  const tick = (key: string, done: boolean, title: string, sub: string, onPress: () => void) => (
    <Pressable key={key} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}${done ? ', done' : ''}`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F1F2F4' }, pressed && { backgroundColor: '#F7F8FA' }]}>
      <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: done ? base.ink : '#C9CDD3', backgroundColor: done ? base.ink : base.card, alignItems: 'center', justifyContent: 'center' }}>
        {done && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, color: base.ink }}>{title}</Text>
        {!!sub && <Text style={{ fontSize: 11.5, color: base.slate }}>{sub}</Text>}
      </View>
      <Text style={{ color: base.slateLight }}>›</Text>
    </Pressable>
  );
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  const todo = t ? [
    tick('brief', !!t.briefing, t.briefing ? `Daily Briefing Done At ${t.briefing.at}` : 'Daily Briefing', t.briefing ? '' : 'Not done yet today', go('hs/briefings')),
    t.toInduct.length
      ? tick('ind', false, `Induct ${plural(t.toInduct.length, 'Person', 'People')}`, t.toInduct.slice(0, 3).map((p) => `${p.name} (${p.company})`).join(' · ') + (t.toInduct.length > 3 ? ` +${t.toInduct.length - 3} more` : ''), go('mc/inductions'))
      : tick('ind', true, 'Everyone On The Job Is Inducted', `${t.inducted} inducted`, go('mc/inductions')),
    ...closingToday.map((p) => tick(`p${p.id}`, false, `Close ${p.type} Permit`, [p.location, p.workDate ? `For ${new Date(`${p.workDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''].filter(Boolean).join(' · '), go(`mc/permits/${p.id}`))),
    ...t.rams.map((r) => tick(`r${r.id}`, false, `Approve ${r.name}`, r.company, go('hs/rams'))),
    ...t.variations.map((v) => tick(`v${v.id}`, false, `Approve Variation: ${v.title}`, `${v.company} · ${money(v.value)}`, go(`mc/subcontractors/${v.coId}/variations`))),
    ...(setupLeft > 0 ? [tick('setup', false, `Finish Setting Up: ${plural(setupLeft, 'Thing')} To Do`, MC_SETUP.filter((x) => !setup?.done[x.k]).map((x) => x.label).join(' · '), go('mc'))] : []),
  ] : [];
  const onSiteCard = (
    <View style={card}>
      <Text style={secT}>{`ON SITE NOW · ${onSiteAll ?? dash}`}</Text>
      {t && !t.onSite.length && !visitorsIn.length ? <Muted>Nobody is checked in.</Muted> : [...(t?.onSite ?? []), ...(visitorsIn.length ? [{ company: 'Visitors', ours: false, people: visitorsIn.map((v) => ({ id: v.id, name: v.name })) }] : [])].map((g) => (
        <View key={g.company} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F1F2F4' }}>
          <Text style={{ fontSize: 13, color: base.ink }}>{g.ours ? 'Our Team' : g.company}</Text>
          <Text style={{ fontSize: 13, color: base.slate }}>{g.people.length}</Text>
        </View>
      ))}
      <View style={{ alignItems: 'center', marginTop: 8 }}><Button small kind="ghost" title="Fire Roll Call" onPress={openRoll} /></View>
    </View>
  );
  // Visitors today: who, from where, in and out; a manager can sign someone out who forgot.
  const visitorsCard = (
    <View style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={[secT, { flex: 1, marginBottom: 0 }]}>{`VISITORS TODAY · ${visitors.length}`}</Text>
        <Button small kind="ghost" title="Visitor Sign-In (QR)" onPress={() => setQr(true)} />
      </View>
      {!visitors.length ? <Muted>No visitors yet today. They sign in with the QR code at the gate.</Muted> : visitors.map((v) => (
        <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F1F2F4' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: base.ink }}>{v.name}{v.company ? ` · ${v.company}` : ''}</Text>
            <Text style={{ fontSize: 11.5, color: base.slate }}>{[`In ${new Date(v.signed_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, v.signed_out_at ? `Out ${new Date(v.signed_out_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'On site', v.phone].filter(Boolean).join(' · ')}</Text>
          </View>
          {!v.signed_out_at && <Button small kind="ghost" title="Sign Them Out" onPress={async () => { if (await signOutVisitor(v.id, me.id)) void qc.invalidateQueries({ queryKey: ['mcTiles', site.id, 'visitors'] }); else toast('Could not sign them out — try again.'); }} />}
        </View>
      ))}
    </View>
  );
  const weekNo = weekOf(site.start_date);
  const programmeCard = (
    <Pressable onPress={go('drawings')} accessibilityRole="button" style={card}>
      <Text style={secT}>PROGRAMME</Text>
      <Text style={{ fontSize: 13, color: base.ink }}>{weekNo && site.start_date && new Date(`${site.start_date}T00:00:00`) <= new Date() ? `Week ${weekNo} · Started ${new Date(`${site.start_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : site.start_date ? `Starts ${new Date(`${site.start_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No start date yet'}</Text>
      <Text style={{ fontSize: 12, color: base.slate, marginTop: 3 }}>Open The Programme (Drawings, Specs &amp; Programme) ›</Text>
    </Pressable>
  );
  const arrivingCard = (
    <View style={card}>
      <Text style={secT}>ARRIVING TODAY</Text>
      {t && !t.arriving.length ? <Muted>Nothing booked in for today.</Muted> : (t?.arriving ?? []).map((a, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F1F2F4' }}>
          <Text style={{ flex: 1, fontSize: 13, color: base.ink }} numberOfLines={1}>{a.what}</Text>
          <Text style={{ fontSize: 12.5, color: base.slate }}>{a.when}</Text>
        </View>
      ))}
    </View>
  );
  const todayTab = (
    <View style={{ flexDirection: desk ? 'row' : 'column', gap: desk ? 14 : 0, alignItems: 'flex-start' }}>
      <View style={{ flex: desk ? 1 : undefined, width: desk ? undefined : '100%' }}>
        <View style={card}><Text style={secT}>{`TO DO TODAY · ${todayLabel}`}</Text>{t ? todo : <Muted>Loading…</Muted>}</View>
        {arrivingCard}
        {visitorsCard}
      </View>
      <View style={{ flex: desk ? 1 : undefined, width: desk ? undefined : '100%' }}>{hubRow && <View style={{ marginBottom: 12 }}><JobRows desk={desk} rows={[hubRow]} /></View>}{onSiteCard}{programmeCard}</View>
    </View>
  );

  // ----- Run The Site -----
  const docs = (n: number) => plural(n, 'document');
  const running: JobRow[] = [
    { key: 'ind', ic: 'check', title: 'Site Inductions', sub: t ? `${t.toInduct.length} to do · ${t.inducted} inducted` : dash, badge: t?.toInduct.length || undefined, onPress: go('mc/inductions') },
    { key: 'per', ic: 'pen', title: 'Permits To Work', sub: t ? (t.permits.length ? `${t.permits.length} open${closingToday.length ? ` · ${closingToday.length} for today` : ''}` : 'None open') : dash, onPress: go('mc/permits') },
    { key: 'brief', ic: 'list', title: 'Daily Briefing', sub: t ? (t.briefing ? `Done at ${t.briefing.at}` : 'Not done yet today') : dash, badge: t && !t.briefing ? '!' : undefined, onPress: go('hs/briefings') },
    { key: 'insp', ic: 'eye', title: 'Inspections', sub: d ? (d.inspections ? `${d.inspections} logged` : d.templates ? 'None logged yet' : 'Set Up Templates') : dash, onPress: go('mc/inspections') },
    { key: 'tbt', ic: 'chat', title: 'Toolbox Talks', sub: 'Talks and who has signed', onPress: go('hs/tbt') },
    { key: 'ppl', ic: 'users', title: 'Everyone On This Job', sub: 'Inducted and site rules, ours and subcontractors', onPress: () => router.push(`/sites/${site.id}/mc?tab=people` as never) },
  ];
  const subRows: JobRow[] = (t?.companies ?? []).map((c) => ({
    key: c.id, ic: 'building', title: c.name,
    sub: [plural(c.people, 'operative'), c.onSite ? `${c.onSite} on site` : '', c.toInduct ? `${c.toInduct} to induct` : '', c.ramsPending ? 'RAMS to approve' : ''].filter(Boolean).join(' · '),
    badge: c.toInduct + c.ramsPending || undefined, onPress: go(`mc/subcontractors/${c.id}`),
  }));
  const siteTab = (
    <View style={{ flexDirection: desk ? 'row' : 'column', gap: desk ? 14 : 0, alignItems: 'flex-start' }}>
      <View style={{ flex: desk ? 1 : undefined, width: desk ? undefined : '100%' }}><Text style={secT}>DAILY RUNNING</Text><JobRows desk={desk} rows={running} /></View>
      <View style={{ flex: desk ? 1 : undefined, width: desk ? undefined : '100%', marginTop: desk ? 0 : 12 }}>
        <Text style={secT}>{`SUBCONTRACTORS (${t?.companies.length ?? dash})`}</Text>
        {t && !t.companies.length ? <Muted style={{ marginBottom: 8 }}>No subcontractors on this job yet.</Muted> : <JobRows desk={desk} rows={subRows} />}
        <View style={{ alignItems: 'center', marginTop: 6 }}><Button small title="+ Add Subcontractor" onPress={go('mc/subcontractors')} /></View>
      </View>
    </View>
  );

  // ----- Documents -----
  const docRows: JobRow[] = [
    { key: 'cpp', ic: 'book', title: MC_DOC_LABEL.cpp, sub: d ? (d.cpp ? (d.cpp.status === 'issued' ? `Issued · version ${d.cpp.version}` : 'Draft · being written') : docs(d.docs.cpp || 0)) : dash, onPress: go('mc/docs/cpp') },
    { key: 'rules', ic: 'clipboard', title: 'Site Rules & Layout', sub: d ? `${docs(d.layout)} · signed in the induction` : dash, onPress: go('mc/layout') },
    { key: 'f10', ic: 'mail', title: MC_DOC_LABEL.f10, sub: site.f10_not_required ? 'Not required on this job' : d ? docs(d.docs.f10 || 0) : dash, onPress: go('mc/docs/f10') },
    { key: 'asb', ic: 'shield', title: MC_DOC_LABEL.asbestos, sub: d ? docs(d.docs.asbestos || 0) : dash, onPress: go('mc/docs/asbestos') },
    { key: 'dwg', ic: 'layers', title: 'Drawings, Specs & Programme', sub: 'View & upload', onPress: go('drawings') },
  ];
  // ----- Handover -----
  const hoRows: JobRow[] = [
    { key: 'om', ic: 'book', title: 'Handover', sub: 'O&M manual · data sheets · guarantees', onPress: go('handover') },
    ...(t?.companies ?? []).map((c) => ({ key: `ho${c.id}`, ic: 'building', title: `${c.name} · Close-Out`, sub: 'Their handover and O&M', onPress: () => router.push(`/sites/${site.id}/mc/subcontractors/${c.id}?tab=handover` as never) })),
  ];

  const body = tab === 'today' ? todayTab : tab === 'site' ? siteTab : tab === 'docs' ? <JobRows desk={desk} cols={desk ? 2 : 1} rows={docRows} /> : <JobRows desk={desk} cols={desk ? 2 : 1} rows={hoRows} />;
  return (
    <>
      {top}
      {geoRow && <View style={{ marginBottom: 10 }}><JobRows desk={desk} rows={[geoRow]} /></View>}
      <View style={{ flexDirection: 'row', marginBottom: 8 }}><Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: base.ink, borderWidth: 1, borderColor: base.ink, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 9 }}>MAIN CONTRACTOR</Text></View>
      {counts}
      {setupLine}
      <FinTabs even value={tab} onChange={(k) => router.setParams({ tab: k })} items={[['today', 'Today'], ['site', desk ? 'Run The Site' : 'Site'], ['docs', desk ? 'Documents' : 'Docs'], ['handover', 'Handover']]} />
      <View style={{ height: 12 }} />
      {body}
      {/* Our own trade's work, folded away (it's not the focal point on a main contractor job). */}
      <Pressable onPress={() => setOwn(!own)} accessibilityRole="button" accessibilityState={{ expanded: own }}
        style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F7F8FA', marginTop: 4 }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: base.ink }}>Our Own Works</Text>
          <Text style={{ fontSize: 12, color: base.slate }} numberOfLines={1}>{restRows.map((r) => r.title).slice(0, 5).join(' · ')}</Text>
        </View>
        <Text style={{ color: base.slate }}>{own ? '▴' : '▾'}</Text>
      </Pressable>
      {own && <JobRows desk={desk} cols={desk ? 2 : 1} rows={restRows} />}
      {(me.role === 'admin' || me.role === 'pm') && <View style={{ alignItems: 'center', marginTop: 4, marginBottom: 6 }}><Button small kind="ghost" title="Who Sees Main Contractor Mode ›" onPress={() => router.push(`/sites/${site.id}/admin` as never)} /></View>}
      {qr && !!site.visitor_key && (
        <Pop title="Visitor Sign-In" onClose={() => setQr(false)}>
          <View style={{ alignItems: 'center' }}>
            <QrCode value={visitLink(site.visitor_key)} size={desk ? 260 : 220} />
            <Text selectable style={{ fontSize: 12, color: base.slate, marginTop: 8, textAlign: 'center' }}>{visitLink(site.visitor_key)}</Text>
            <Muted style={{ textAlign: 'center', marginTop: 6 }}>Put this at the gate (print it or show it on a phone). Visitors scan it, give their name, phone, email and company, and sign in; the same page signs them out.</Muted>
            {(me.role === 'admin' || me.role === 'pm') && <View style={{ marginTop: 10 }}><Button small kind="ghost" title="New QR Code" onPress={async () => {
              if (!(await confirmAsk('Make a new QR code for this job? The old one stops working, so print and put up the new one.', 'Yes', 'No'))) return;
              if (await newVisitorKey(site.id)) void qc.invalidateQueries({ queryKey: ['sites'] }); else toast('Could not make a new one — try again.');
            }} /></View>}
            {Platform.OS === 'web' && <View style={{ marginTop: 10 }}><Button small kind="ghost" title={copied ? 'Copied ✓' : 'Copy Link'} onPress={async () => { try { await globalThis.navigator?.clipboard?.writeText(visitLink(site.visitor_key as string)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { toast('Select the link and copy it.'); } }} /></View>}
          </View>
        </Pop>
      )}
      {roll && (
        <Pop title={`Fire Roll Call · ${onSiteAll ?? 0} On Site`} onClose={() => setRoll(false)}>
          <RollCall groups={[...(t?.onSite ?? []), ...(visitorsIn.length ? [{ company: 'Visitors', ours: false, people: visitorsIn.map((v) => ({ id: v.id, name: v.name })) }] : [])]} />
        </Pop>
      )}
    </>
  );
}

/** Everyone checked in, by company: tick each person as they're accounted for (nothing is saved). */
function RollCall({ groups }: { groups: { company: string; ours: boolean; people: { id: string; name: string }[] }[] }) {
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const total = groups.reduce((n, g) => n + g.people.length, 0), done = Object.values(ok).filter(Boolean).length;
  if (!total) return <Muted>Nobody is checked in.</Muted>;
  return (
    <View>
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: done === total ? base.ok : base.ink, marginBottom: 6 }}>{`${done} Of ${total} Accounted For`}</Text>
      {groups.map((g) => (
        <View key={g.company} style={{ marginBottom: 8 }}>
          <Text style={secT}>{(g.ours ? 'Our Team' : g.company).toUpperCase()}</Text>
          {g.people.map((p) => (
            <Pressable key={p.id} onPress={() => setOk((x) => ({ ...x, [p.id]: !x[p.id] }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!ok[p.id] }} accessibilityLabel={p.name}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F1F2F4' }}>
              <Text style={{ fontSize: 17 }}>{ok[p.id] ? '☑' : '☐'}</Text>
              <Text style={{ flex: 1, fontSize: 13.5, color: base.ink }}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      <Muted style={{ fontSize: 11.5 }}>From who is checked in on OpHUB. Visitors who haven&apos;t checked in aren&apos;t on it.</Muted>
    </View>
  );
}
