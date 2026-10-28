// Holiday calendar (186 renderHrHolidays): your days left, book time off (full,
// half or part days; admins can book for anyone and go over limits), the month
// grid with everyone's time off, the chosen day, your upcoming time off. Admins
// also get Requests (approve / decline) and Settings (limit, letters, allowance
// and colour per person).
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, SectionTitle } from '@/components/ui';
import { bookLeave, cancelLeave, decideLeave, hrAllowance, hrCode, hrColour, saveHrSettings, useHr } from '@/data/hr';
import { useAuth } from '@/lib/auth';
import { monthGrid } from '@/lib/rules/calendar';
import { localISODate } from '@/lib/rules/driver';
import { bankHolCount, bookingParts, dayFraction, HR_COLOURS, HR_TYPES, isBankHol, leaveDays, limitClash, offOn, usedDays, type Leave } from '@/lib/rules/hr';
import { readIsoDate } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 10 };
function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}><Text style={{ fontWeight: '700', color: on ? '#fff' : base.ink, fontSize: 12.5 }}>{label}</Text></Pressable>;
}
type Draft = { user_id: string; type: string; start: string; end: string; part: string; startPart: string; endPart: string; link: boolean; note: string };

export default function Holidays() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: hr } = useHr(me?.org_id);
  const today = localISODate(new Date());
  const [month, setMonth] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });
  const [sel, setSel] = useState(today);
  const [view, setView] = useState<'cal' | 'req' | 'set'>('cal');
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [setMax, setSetMax] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string> | null>(null);
  const [allow, setAllow] = useState<Record<string, string>>({});
  const [cols, setCols] = useState<Record<string, string>>({});
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (!hr) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const isAdmin = me.role === 'admin';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['hr'] }); };
  const y = new Date().getFullYear();
  const name = (uid: string) => hr.people.find((p) => p.id === uid)?.name || '';
  const initials = (uid: string) => name(uid).split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const myUsed = usedDays(hr.leave, me.id, y, ['approved']), myPend = usedDays(hr.leave, me.id, y, ['pending']), myAllow = hrAllowance(hr, me.id);
  const bhCount = (uid: string) => hr.leave.filter((l) => l.user_id === uid && l.bank_holiday && l.status === 'approved' && l.start_date.startsWith(`${y}-`)).length;
  const pending = hr.allLeave.filter((l) => l.status === 'pending').sort((a, b) => a.start_date.localeCompare(b.start_date));
  const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const range = (l: Leave) => (l.start_date === l.end_date ? fmt(l.start_date) + (l.half ? (l.half === 'am' ? ' (morning)' : ' (afternoon)') : '')
    : `${fmt(l.start_date)}${l.start_part === 'pm' ? ' (afternoon)' : ''} – ${fmt(l.end_date)}${l.end_part === 'am' ? ' (morning)' : ''}`);
  const typeLabel = (l: Leave) => (l.bank_holiday ? 'Bank holiday' : HR_TYPES[l.type] || l.type);
  const chip = (l: Leave, small: boolean, ds?: string) => {
    const c = hrColour(hr, l.user_id), pend = l.status === 'pending';
    const halfHere = !!l.half || (!!ds && dayFraction(l, ds) < 1);
    return (
      <View key={l.id} style={{ flexDirection: 'row', alignSelf: 'flex-start', borderWidth: 1, borderColor: c, backgroundColor: pend ? '#fff' : c, borderRadius: 6, paddingHorizontal: small ? 2 : 6, paddingVertical: 1, marginTop: 1 }}>
        <Text style={{ fontSize: small ? 8 : 12, fontWeight: '700', color: pend ? c : '#fff' }}>{small ? initials(l.user_id) : name(l.user_id)} {l.bank_holiday ? 'BH' : hrCode(hr, l.type)}{halfHere ? '½' : ''}</Text>
      </View>
    );
  };
  const open = (ds?: string) => { const x = ds || sel; setD({ user_id: me.id, type: 'annual', start: x, end: x, part: 'full', startPart: 'full', endPart: 'full', link: true, note: '' }); };

  const save = async () => {
    if (!d) return;
    const s = readIsoDate(d.start), e = readIsoDate(d.end);
    if (!s || !e || s === 'bad' || e === 'bad') { toast('Enter the dates as YYYY-MM-DD.'); return; }
    if (e < s) { toast('The end date is before the start date.'); return; }
    const parts = bookingParts(s, e, d.part, d.startPart, d.endPart);
    const days = leaveDays({ start_date: s, end_date: e, ...parts });
    if (!days) { toast('Those dates are all weekends or bank holidays.'); return; }
    const uid = isAdmin ? d.user_id : me.id;
    if (d.type === 'annual') {
      for (const yr of [...new Set([Number(s.slice(0, 4)), Number(e.slice(0, 4))])]) {
        const need = leaveDays({ start_date: s, end_date: e, ...parts }, yr);
        const left = hrAllowance(hr, uid) - usedDays(hr.leave, uid, yr, ['approved', 'pending']);
        if (need > left) {
          if (!isAdmin) { toast(`Only ${left} day${left === 1 ? '' : 's'} of annual leave left for ${yr}.`); return; }
          if (!(await confirmAsk(`This takes ${need} day${need === 1 ? '' : 's'} in ${yr} but only ${left} are left for ${name(uid)}. Book it anyway?`, 'Book anyway'))) return;
        }
      }
    }
    let override = false;
    const max = Number(hr.settings.max_off_at_once) || 0;
    if (max > 0 && d.type !== 'sick') {
      const c = limitClash(hr.leave, uid, s, e, max);
      if (c) {
        const when = new Date(`${c.day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        if (!isAdmin) { showAlert(`${c.n} people are already off on ${when} — the limit is ${max} at a time. Pick other dates or ask the admin.`); return; }
        if (!(await confirmAsk(`${c.n} people are already off on ${when} (limit ${max}). Override the limit for this booking?`, 'Override'))) return;
        override = true;
      }
    }
    setBusy(true);
    const r = await bookLeave(me, uid, { type: d.type, start: s, end: e, ...parts, days, link: d.link, note: d.note, override }, hr.people);
    setBusy(false);
    if (!r.ok) { toast('Could not save — try again.'); return; }
    toast(r.pending ? 'Request sent to the admin for approval' : 'Booked'); setD(null); refresh();
  };
  const decide = async (l: Leave, ok: boolean) => {
    const max = Number(hr.settings.max_off_at_once) || 0;
    const c = ok && l.type !== 'sick' ? limitClash(hr.leave, l.user_id, l.start_date, l.end_date, max, true) : null;
    if (c && !(await confirmAsk(`${c.n} people are already off on ${new Date(`${c.day}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} (limit ${max}). Approve anyway?`, 'Approve'))) return;
    toast((await decideLeave(me, l.id, ok, !!c)) ? (ok ? 'Approved' : 'Declined') : 'Could not save — try again.'); refresh();
  };

  const grid = monthGrid(month.y, month.m);
  const selOffs = offOn(hr.leave, sel).filter((l) => !l.bank_holiday);
  const myUpcoming = hr.allLeave.filter((l) => l.user_id === me.id && !l.bank_holiday && l.end_date >= today && (l.status === 'approved' || l.status === 'pending'));
  const preview = d ? (() => { const s = readIsoDate(d.start), e = readIsoDate(d.end); return s && e && s !== 'bad' && e !== 'bad' && e >= s ? leaveDays({ start_date: s, end_date: e, ...bookingParts(s, e, d.part, d.startPart, d.endPart) }) : null; })() : null;
  const stat = (n: number, l: string, hot = false) => <Card style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: 22, fontWeight: '800', color: hot && n ? base.warn : base.ink }}>{n}</Text><Muted style={{ textAlign: 'center' }}>{l}</Muted></Card>;

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: view === 'req' ? 'Time off requests' : view === 'set' ? 'Holiday settings' : 'Holiday calendar' }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>{stat(myAllow - myUsed - myPend, `Days left ${y}`)}{stat(myUsed, 'Taken / booked')}{stat(myPend, 'Awaiting approval', true)}</View>
      <Muted style={{ marginBottom: 10 }}>{bhCount(me.id) ? `Includes 1 day for each bank holiday (${bhCount(me.id)} this year), allocated automatically.` : `PMs and site managers get 1 day for each bank holiday (${bankHolCount(y)} this year) allocated automatically.`}</Muted>
      {!d && <Button title="+ Book time off" onPress={() => open()} />}
      {isAdmin && <View style={{ flexDirection: 'row', gap: 6, marginVertical: 10 }}><Chip on={view === 'cal'} label="Calendar" onPress={() => setView('cal')} /><Chip on={view === 'req'} label={`Requests${pending.length ? ` (${pending.length})` : ''}`} onPress={() => setView('req')} /><Chip on={view === 'set'} label="Settings" onPress={() => setView('set')} /></View>}

      {d && (
        <Card>
          <SectionTitle>Book time off</SectionTitle>
          {isAdmin && <Pressable style={[box, { paddingVertical: 12 }]} onPress={async () => { const k = await chooseAction('Who', hr.people.map((p) => ({ key: p.id, label: p.name }))); if (k) setD({ ...d, user_id: k }); }}><Text style={{ color: base.ink }}>▼ {name(d.user_id)}</Text></Pressable>}
          <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Type</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{Object.keys(HR_TYPES).map((k) => <Chip key={k} on={d.type === k} label={`${HR_TYPES[k]} (${hrCode(hr, k)})`} onPress={() => setD({ ...d, type: k })} />)}</View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Muted style={{ fontWeight: '700' }}>From</Muted><TextInput value={d.start} onChangeText={(v) => setD({ ...d, start: v, end: d.end < v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d.end })} autoCapitalize="none" style={box} /></View>
            <View style={{ flex: 1 }}><Muted style={{ fontWeight: '700' }}>To</Muted><TextInput value={d.end} onChangeText={(v) => setD({ ...d, end: v })} autoCapitalize="none" style={box} /></View>
          </View>
          {d.start === d.end ? (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>{[['full', 'Full day'], ['am', 'Morning'], ['pm', 'Afternoon']].map(([k, l]) => <Chip key={k} on={d.part === k} label={l} onPress={() => setD({ ...d, part: k })} />)}</View>
          ) : (
            <>
              <Muted style={{ fontWeight: '700' }}>First day</Muted>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>{[['full', 'Full day'], ['pm', 'Afternoon only']].map(([k, l]) => <Chip key={k} on={d.startPart === k} label={l} onPress={() => setD({ ...d, startPart: k })} />)}</View>
              <Muted style={{ fontWeight: '700' }}>Last day</Muted>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>{[['full', 'Full day'], ['am', 'Morning only']].map(([k, l]) => <Chip key={k} on={d.endPart === k} label={l} onPress={() => setD({ ...d, endPart: k })} />)}</View>
            </>
          )}
          {preview != null && <Muted style={{ marginBottom: 10 }}>{preview} working day{preview === 1 ? '' : 's'}{d.type === 'annual' ? ' of annual leave' : ''} — weekends and bank holidays (already booked) don&apos;t count.</Muted>}
          <TextInput value={d.note} onChangeText={(v) => setD({ ...d, note: v })} placeholder="Note (optional) e.g. Family holiday" style={box} />
          <Check label="Link with project calendars — operatives on jobs I run can see I'm off" value={d.link} onChange={(v) => setD({ ...d, link: v })} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}><Button busy={busy} title={isAdmin || d.type === 'sick' ? 'Book it' : 'Send for approval'} onPress={() => void save()} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setD(null)} /></View>
          </View>
        </Card>
      )}

      {view === 'cal' && (
        <>
          <Card style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Pressable hitSlop={10} onPress={() => setMonth(month.m === 0 ? { y: month.y - 1, m: 11 } : { y: month.y, m: month.m - 1 })}><Text style={{ fontSize: 20, paddingHorizontal: 10 }}>‹</Text></Pressable>
              <Text style={{ flex: 1, textAlign: 'center', fontWeight: '800', color: base.ink }}>{new Date(month.y, month.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
              <Pressable onPress={() => { const t = new Date(); setMonth({ y: t.getFullYear(), m: t.getMonth() }); setSel(today); }}><Text style={{ color: base.blue, fontWeight: '700', paddingHorizontal: 6 }}>Today</Text></Pressable>
              <Pressable hitSlop={10} onPress={() => setMonth(month.m === 11 ? { y: month.y + 1, m: 0 } : { y: month.y, m: month.m + 1 })}><Text style={{ fontSize: 20, paddingHorizontal: 10 }}>›</Text></Pressable>
            </View>
            <View style={{ flexDirection: 'row' }}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <Text key={i} style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, color: base.slate, fontWeight: '700' }}>{x}</Text>)}</View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {grid.map((ds) => {
                const dt = new Date(`${ds}T00:00:00`), offs = offOn(hr.leave, ds).filter((l) => !l.bank_holiday);
                const bh = isBankHol(ds), we = dt.getDay() === 0 || dt.getDay() === 6;
                return (
                  <Pressable key={ds} onPress={() => setSel(ds)} style={{ width: `${100 / 7}%`, minHeight: 62, padding: 2, borderWidth: sel === ds ? 2 : 0.5, borderColor: sel === ds ? base.ink : base.line, backgroundColor: bh || we ? base.paper : base.card, opacity: dt.getMonth() === month.m ? 1 : 0.45 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: ds === today ? base.red : base.ink }}>{dt.getDate()}{bh ? ' BH' : ''}</Text>
                    {offs.slice(0, 3).map((l) => chip(l, true, ds))}
                    {offs.length > 3 && <Text style={{ fontSize: 8, color: base.slate }}>+{offs.length - 3}</Text>}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {hr.people.map((p) => <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: hrColour(hr, p.id) }} /><Text style={{ fontSize: 11, color: base.ink }}>{p.name}</Text></View>)}
            </View>
            <Muted style={{ marginTop: 6, fontSize: 11 }}>{Object.keys(HR_TYPES).map((k) => `${hrCode(hr, k)} ${HR_TYPES[k].toLowerCase()}`).join(' · ')} · BH bank holiday · outlined = waiting approval</Muted>
          </Card>
          {isAdmin && (
            <>
              <SectionTitle>Days left {y}</SectionTitle>
              <Card>
                {hr.people.map((p) => {
                  const al = hrAllowance(hr, p.id), used = usedDays(hr.leave, p.id, y, ['approved']), pend = usedDays(hr.leave, p.id, y, ['pending']);
                  return (
                    <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: base.line }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: hrColour(hr, p.id) }} />
                      <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{p.name}</Text>
                      <Muted>{used} used{pend ? ` · ${pend} waiting` : ''}</Muted>
                      <Text style={{ fontWeight: '800', color: base.ink, minWidth: 50, textAlign: 'right' }}>{al - used - pend}<Text style={{ color: base.slate, fontSize: 11 }}>/{al}</Text></Text>
                    </View>
                  );
                })}
              </Card>
            </>
          )}
          <SectionTitle>{fmt(sel)}{isBankHol(sel) ? ' · Bank holiday' : ''}</SectionTitle>
          {selOffs.length ? selOffs.map((l) => (
            <Card key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {chip(l, false)}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{typeLabel(l)}</Text>
                <Muted>{range(l)}{l.status === 'pending' ? ' · waiting approval' : ''}{l.note ? ` · ${l.note}` : ''}</Muted>
              </View>
            </Card>
          )) : <Muted style={{ marginBottom: 10 }}>{isBankHol(sel) ? 'Bank holiday — 1 day allocated to each PM automatically.' : "Everyone's in."}</Muted>}
          <Button kind="ghost" title="+ Book this day" onPress={() => open(sel)} />
          {myUpcoming.length > 0 && (
            <>
              <SectionTitle>My upcoming time off</SectionTitle>
              {myUpcoming.map((l) => (
                <Card key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: base.ink }}>{typeLabel(l)} · {l.days} day{Number(l.days) === 1 ? '' : 's'}</Text>
                    <Muted>{range(l)}{l.status === 'pending' ? ' · waiting approval' : ''}{l.link_projects ? ' · on project calendars' : ''}</Muted>
                  </View>
                  <Pressable onPress={async () => { if (!(await confirmAsk('Cancel this time off?', 'Cancel it'))) return; toast((await cancelLeave(l.id)) ? 'Cancelled' : 'Could not save — try again.'); refresh(); }}><Text style={{ color: base.warn, fontWeight: '700' }}>Cancel</Text></Pressable>
                </Card>
              ))}
            </>
          )}
        </>
      )}

      {isAdmin && view === 'req' && (pending.length ? pending.map((l) => (
        <Card key={l.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{chip(l, false)}<Muted>{l.days} day{Number(l.days) === 1 ? '' : 's'}</Muted></View>
          <Text style={{ fontWeight: '700', color: base.ink, marginTop: 6 }}>{typeLabel(l)} · {range(l)}</Text>
          {!!l.note && <Muted>{l.note}</Muted>}
          <Muted style={{ marginBottom: 8 }}>{hrAllowance(hr, l.user_id) - usedDays(hr.leave, l.user_id, Number(l.start_date.slice(0, 4)), ['approved'])} days left before this</Muted>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button title="Approve" onPress={() => void decide(l, true)} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Decline" onPress={() => void decide(l, false)} /></View>
          </View>
        </Card>
      )) : <Empty>No requests waiting.</Empty>)}

      {isAdmin && view === 'set' && (
        <>
          <Card>
            <SectionTitle>Rules</SectionTitle>
            <Muted style={{ fontWeight: '700' }}>Most people off at the same time</Muted>
            <TextInput value={setMax ?? String(Number(hr.settings.max_off_at_once) || 0)} onChangeText={setSetMax} keyboardType="number-pad" style={box} />
            <Muted style={{ marginBottom: 10 }}>0 = no limit. You can still go over it yourself when booking or approving. PMs&apos; and site managers&apos; time off always comes to an admin to approve; sick days are recorded straight away.</Muted>
            <Muted style={{ fontWeight: '700', marginBottom: 6 }}>Letters shown in the calendar</Muted>
            {Object.keys(HR_TYPES).map((k) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <TextInput value={(codes ?? {})[k] ?? hrCode(hr, k)} onChangeText={(v) => setCodes({ ...(codes ?? {}), [k]: v.toUpperCase().slice(0, 2) })} maxLength={2} autoCapitalize="characters" style={[box, { width: 60, marginBottom: 0, textAlign: 'center', fontWeight: '800' }]} />
                <Text style={{ color: base.ink }}>{HR_TYPES[k]}</Text>
              </View>
            ))}
          </Card>
          <Card>
            <SectionTitle>People — allowance &amp; colour</SectionTitle>
            <Muted style={{ marginBottom: 10 }}>Days a year including bank holidays. Bank holidays are booked automatically for PMs and site managers (not admins) and come out of this.</Muted>
            {hr.people.map((p) => {
              const cur = cols[p.id] ?? hrColour(hr, p.id);
              return (
                <View key={p.id} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{p.name}</Text>
                    <TextInput value={allow[p.id] ?? String(hrAllowance(hr, p.id))} onChangeText={(v) => setAllow({ ...allow, [p.id]: v })} keyboardType="decimal-pad" style={[box, { width: 72, marginBottom: 0 }]} />
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                    {HR_COLOURS.map((c) => <Pressable key={c} onPress={() => setCols({ ...cols, [p.id]: c })} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c, borderWidth: cur === c ? 3 : 0, borderColor: base.ink }} />)}
                  </View>
                </View>
              );
            })}
          </Card>
          <Button busy={busy} title="Save settings" onPress={async () => {
            const cs: Record<string, string> = {};
            Object.keys(HR_TYPES).forEach((k) => { cs[k] = ((codes ?? {})[k] ?? hrCode(hr, k)).trim().toUpperCase().slice(0, 2) || hrCode(hr, k); });
            setBusy(true);
            const ok = await saveHrSettings(me, Math.max(0, parseInt(setMax ?? String(hr.settings.max_off_at_once), 10) || 0), cs,
              hr.people.map((p) => ({ user_id: p.id, allowance_days: Number(allow[p.id] ?? hrAllowance(hr, p.id)) || 0, colour: cols[p.id] ?? hrColour(hr, p.id) })));
            setBusy(false);
            toast(ok ? 'HR settings saved' : 'Could not save — try again.'); if (ok) { setSetMax(null); setCodes(null); setAllow({}); setCols({}); refresh(); }
          }} />
        </>
      )}
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}
