// Plant register (Andy, 4 Nov 2026): where every item is and who signed for it last.
// One list for the job's Plant tile (siteId: items here and items people have for this job) and the company-wide
// Yard › Plant page (no siteId). Each item is its own numbered line, so a lost gas cylinder can be traced.
//   Allocate (PM: person + job) or Request (operative, pre-use checklist) → PM approves → the operative signs for it.
//   Hand back: the operative signs with a photo and says where it's left → a PM / yard manager confirms.
//   A PM returning it just signs. Lost / found, out of service, inspection due as before.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { StorageImage } from '@/components/StorageImage';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { acceptPlant, addPlantBatch, allocatePlant, approvePlant, confirmReturn, declineCheckout, markLost, opReturn, pmReturn, requestCheckout, setOutOfService, useOrgPlant, type PlantRow } from '@/data/plant';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { pickPhotos, type Picked } from '@/lib/photos';
import { readIsoDate } from '@/lib/rules/materials';
import { batchNames, daysOut, dueBadge, effectiveState, PLANT_CHECKLIST, PLANT_STATE, type Checkout } from '@/lib/rules/plant';
import { isManager } from '@/lib/roles';
import { base, radius, live } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const TONE = { ok: base.ok, warn: base.warn, bad: base.red, none: base.slate };
type Filter = 'all' | 'yard' | 'out' | 'wait' | 'confirm' | 'lost';
const FILTERS: [Filter, string][] = [['all', 'All'], ['yard', 'In The Yard'], ['out', 'Signed Out'], ['wait', 'To Sign / Approve'], ['confirm', 'Returns To Confirm'], ['lost', 'Lost / Out Of Service']];
type Adding = { name: string; count: string; category: string; serial: string; description: string; interval: number | null; nextDue: string; photo: Picked | null; here: boolean };

async function photo(): Promise<Picked | null> {
  const k = await chooseAction('Add photo', [{ key: 'camera', label: '📷 Take a photo' }, { key: 'library', label: '🖼 Choose from library' }]);
  if (!k) return null;
  const p = await pickPhotos(k as 'camera' | 'library', false);
  if ('error' in p) { showAlert(p.error); return null; }
  return p[0] ?? null;
}

export function PlantRegister({ siteId }: { siteId?: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useOrgPlant(me?.org_id);
  const { data: people = [] } = usePeople();
  const { data: sites = [] } = useSites();
  const [f, setF] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [ans, setAns] = useState<Record<string, boolean> | null>(null);
  const [back, setBack] = useState<{ photo: Picked | null; notes: string } | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const mgr = isManager(me);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['plant'] }); };
  const jobName = (id: string | null | undefined) => { const s = sites.find((x) => x.id === id); return s ? `${s.job_number ? `${s.job_number} ` : ''}${s.name}` : ''; };
  const where = (it: PlantRow) => (it.current_site_id ? jobName(it.current_site_id) || 'A job' : 'The yard');
  const run = async (p: Promise<string | null>, ok: string) => {
    setBusy(true); const err = await p; setBusy(false);
    if (err) { if (err.startsWith('Adopt')) { toast(err); router.push('/signature'); } else showAlert(err); return false; }
    toast(ok); setOpen(null); setAns(null); setBack(null); refresh(); return true;
  };
  const pickPerson = async () => chooseAction('Who is it for?', people.filter((p) => ['operative', 'site_manager', 'pm', 'admin', 'driver'].includes(p.role)).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((p) => ({ key: p.id, label: p.name || 'Unnamed' })));
  const pickJob = async (title: string, withYard: boolean) => {
    const k = await chooseAction(title, [...(withYard ? [{ key: '-', label: '🏠 The yard' }] : []), ...sites.filter((s) => s.status !== 'closed').map((s) => ({ key: s.id, label: jobName(s.id) }))]);
    return k === undefined || k === null ? undefined : k === '-' ? null : k;
  };

  const all = data?.items ?? [];
  const latest = data?.latest ?? {};
  const st = (it: PlantRow) => effectiveState(it, latest[it.id]);
  // On a job: what's here, and what anyone has signed out (or been allocated) for this job.
  const scoped = siteId ? all.filter((it) => it.current_site_id === siteId || (latest[it.id]?.site_id === siteId && !['available', 'lost', 'out_of_service'].includes(st(it)))) : all;
  const inF: Record<Filter, (it: PlantRow) => boolean> = {
    all: () => true, yard: (it) => !it.current_site_id && st(it) === 'available', out: (it) => st(it) === 'checked_out',
    wait: (it) => ['pending_checkout_signoff', 'awaiting_op'].includes(st(it)), confirm: (it) => st(it) === 'pending_checkin_signoff', lost: (it) => ['lost', 'out_of_service'].includes(st(it)),
  };
  const t = q.trim().toLowerCase();
  const list = scoped.filter(inF[f]).filter((it) => !t || [it.name, it.serial_number, where(it), latest[it.id]?.operative_id ? nameOf(people, latest[it.id].operative_id as string) : ''].join(' ').toLowerCase().includes(t));
  const yardFree = siteId ? all.filter((it) => !it.current_site_id && st(it) === 'available') : [];

  const actions = (it: PlantRow, c: Checkout | undefined) => {
    const s = st(it), mine = c?.operative_id === me.id;
    return (
      <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: base.line, paddingTop: 8, gap: 6 }}>
        {!!it.description && <Muted>{it.description}</Muted>}
        {s === 'lost' && !!it.lost_note && <Muted>Lost: {it.lost_note}</Muted>}
        {/* Operative: request it (pre-use checklist), sign for it, hand it back. */}
        {s === 'available' && !ans && <Button small title="Request It" onPress={() => setAns({})} />}
        {s === 'available' && ans && (
          <View>
            <SectionTitle>Pre-Use Plant Checklist</SectionTitle>
            {PLANT_CHECKLIST.map((k) => (
              <View key={k.key} style={{ marginBottom: 6 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{k.label}</Text>
                <Muted>{k.text}</Muted>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {[true, false].map((v) => (
                    <Pressable key={String(v)} onPress={() => setAns({ ...ans, [k.key]: v })} style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: ans[k.key] === v ? live.brand1 : base.line, backgroundColor: ans[k.key] === v ? live.brand1 : base.card }}>
                      <Text style={{ color: ans[k.key] === v ? live.brand1Text : base.ink }}>{v ? 'Yes' : 'No'}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            <Button small busy={busy} title="Send Request" onPress={async () => {
              if (PLANT_CHECKLIST.some((k) => ans[k.key] === undefined)) { toast('Answer every checklist question first.'); return; }
              const job = siteId ?? (await pickJob('Which job is it for?', false)); if (job === undefined) return;
              setBusy(true); const ok = await requestCheckout(me, job as string, it.id, ans); setBusy(false);
              if (ok) { toast('Requested — your PM will approve it, then you sign for it'); setAns(null); setOpen(null); refresh(); } else toast('Could not save — try again.');
            }} />
          </View>
        )}
        {s === 'awaiting_op' && mine && <Button small busy={busy} title="✍ Sign For It" onPress={() => void run(acceptPlant(c!.id), `Signed for ${it.name} — it's with you now`)} />}
        {s === 'checked_out' && mine && !back && <Button small title="↩ Hand It Back" onPress={() => setBack({ photo: null, notes: '' })} />}
        {s === 'checked_out' && mine && back && (
          <View>
            <SectionTitle>Hand It Back</SectionTitle>
            {back.photo && <Image source={{ uri: back.photo.uri }} style={{ width: 110, height: 110, borderRadius: 8, marginBottom: 6 }} />}
            <Button small kind="ghost" title={back.photo ? 'Change Photo' : '📷 Photo Of Where It Is (Required)'} onPress={async () => { const p = await photo(); if (p) setBack({ ...back, photo: p }); }} />
            <TextInput value={back.notes} onChangeText={(v) => setBack({ ...back, notes: v })} placeholder="Notes (optional), e.g. left in the container" style={[box, { marginTop: 6 }]} />
            <Button small busy={busy} title="Sign It Back" onPress={async () => {
              if (!back.photo) { toast('A photo is needed to hand it back.'); return; }
              const dest = await pickJob('Where have you left it?', true); if (dest === undefined) return;
              void run(opReturn(me, c!.id, back.photo, back.notes.trim(), dest), 'Signed back — a PM will confirm it');
            }} />
          </View>
        )}
        {/* Managers. */}
        {mgr && s === 'pending_checkout_signoff' && c && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ flex: 1 }}><Button small busy={busy} title={`Approve For ${nameOf(people, c.operative_id as string)}`} onPress={() => void run(approvePlant(c.id), 'Approved — they will be asked to sign for it')} /></View>
            <Button small kind="ghost" title="Decline" onPress={async () => { if (await confirmAsk('Decline this request?', 'Decline') && await declineCheckout(c.id)) { toast('Declined'); refresh(); } }} />
          </View>
        )}
        {mgr && s === 'available' && <Button small busy={busy} title="Allocate To Someone" onPress={async () => {
          const who = await pickPerson(); if (!who) return;
          const job = siteId ?? (await pickJob('Which job?', false)); if (job === undefined) return;
          void run(allocatePlant(it.id, who, job), `Allocated — ${nameOf(people, who)} has been asked to sign for it`);
        }} />}
        {mgr && s === 'awaiting_op' && c && <Button small kind="ghost" title="Cancel Allocation" onPress={async () => { if (await confirmAsk(`Cancel this? ${it.name} stays where it is.`, 'Cancel It')) void run(pmReturn(c.id, it.current_site_id), 'Allocation cancelled'); }} />}
        {mgr && s === 'pending_checkin_signoff' && c && (
          <View>
            {!!c.checkin_photo_path && <StorageImage bucket="operative-tools" path={c.checkin_photo_path} style={{ width: 200, height: 200, borderRadius: 10, marginBottom: 6 }} />}
            <Muted>Left at: {c.return_to_site_id ? jobName(c.return_to_site_id) : 'the yard'}{c.checkin_notes ? ` · ${c.checkin_notes}` : ''}</Muted>
            <Button small busy={busy} title="✍ Confirm It's Back" onPress={() => void run(confirmReturn(c.id), 'Return confirmed')} />
          </View>
        )}
        {mgr && s === 'checked_out' && c && <Button small kind="ghost" title="↩ Return It (I'll Sign)" onPress={async () => { const dest = await pickJob('Where is it going?', true); if (dest !== undefined) void run(pmReturn(c.id, dest), 'Returned and signed'); }} />}
        {mgr && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {s !== 'lost' && <Button small kind="ghost" title="Mark Lost" onPress={async () => { const n = await promptText(`Mark ${it.name} lost? Add a note (optional)`, ''); if (n !== null) void run(markLost(it.id, true, n), 'Marked lost — the last person who signed for it stays on record'); }} />}
            {s === 'lost' && <Button small kind="ghost" title="Found It" onPress={() => void run(markLost(it.id, false), 'Marked found')} />}
            {['available', 'out_of_service'].includes(s) && <Button small kind="ghost" title={s === 'out_of_service' ? 'Back In Service' : 'Out Of Service'} onPress={async () => { if (await setOutOfService(it.id, s !== 'out_of_service')) { toast('Updated'); refresh(); } }} />}
          </View>
        )}
      </View>
    );
  };

  const row = (it: PlantRow) => {
    const c = latest[it.id], s = st(it), info = PLANT_STATE[s] ?? { label: s, tone: 'none' as const }, d = daysOut(c), badge = dueBadge(it);
    const who = c?.operative_id && !['available', 'lost', 'out_of_service'].includes(s) ? nameOf(people, c.operative_id) : '';
    const isOpen = open === it.id;
    return (
      <Card key={it.id} style={{ paddingVertical: 10, marginBottom: 6, borderColor: s === 'awaiting_op' && c?.operative_id === me.id ? live.brand1 : undefined }}>
        <Pressable onPress={() => { setOpen(isOpen ? null : it.id); setAns(null); setBack(null); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {it.photo_path ? <StorageImage bucket="operative-tools" path={it.photo_path} style={{ width: 40, height: 40, borderRadius: 8 }} /> : <Text style={{ fontSize: 22 }}>🏗</Text>}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '600', color: base.ink }} numberOfLines={1}>{it.name}</Text>
            <Text style={{ fontSize: 12, color: base.slate }} numberOfLines={2}>{[who ? `${who} · ${jobName(c?.site_id) || where(it)}` : where(it), d != null ? `${d} day${d === 1 ? '' : 's'} out` : '', it.serial_number, it.next_inspection_due ? badge.label : ''].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={{ fontSize: 11, fontWeight: '600', color: TONE[info.tone], textAlign: 'right' }}>{s === 'awaiting_op' && c?.operative_id === me.id ? 'Sign for it' : info.label}</Text>
        </Pressable>
        {isOpen && actions(it, c)}
      </Card>
    );
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {FILTERS.map(([k, l]) => { const n = scoped.filter(inF[k]).length, on = f === k; return (
          <Pressable key={k} onPress={() => setF(k)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: on ? live.brand1 : base.line, backgroundColor: on ? live.brand1 : base.card }}>
            <Text style={{ fontSize: 12.5, color: on ? live.brand1Text : base.ink }}>{l}{k !== 'all' && n ? ` (${n})` : ''}</Text>
          </Pressable>
        ); })}
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search item, number, person or job" style={box} />
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map(row) : <Empty>{siteId ? 'No plant on this job.' : 'No plant here yet.'}</Empty>}
      {siteId && yardFree.length > 0 && (
        <>
          <SectionTitle>In The Yard ({yardFree.length})</SectionTitle>
          <Muted style={{ marginBottom: 6 }}>{mgr ? 'Allocate any of these to someone on this job.' : 'Request any of these for this job.'}</Muted>
          {yardFree.filter((it) => !t || it.name.toLowerCase().includes(t)).map(row)}
        </>
      )}
      {mgr && (adding ? (
        <Card style={{ marginTop: 12 }}>
          <SectionTitle>Add Plant</SectionTitle>
          <TextInput value={adding.name} onChangeText={(v) => setAdding({ ...adding, name: v })} placeholder="Item, e.g. Propane 47kg or Harras fence panel" style={box} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Muted style={{ fontWeight: '600' }}>How many?</Muted><TextInput value={adding.count} onChangeText={(v) => setAdding({ ...adding, count: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" style={box} /></View>
            <View style={{ flex: 2 }}><Muted style={{ fontWeight: '600' }}>Serial / ID {Number(adding.count) > 1 ? '(numbered #01, #02 …)' : ''}</Muted><TextInput editable={!(Number(adding.count) > 1)} value={Number(adding.count) > 1 ? '' : adding.serial} onChangeText={(v) => setAdding({ ...adding, serial: v })} placeholder={Number(adding.count) > 1 ? 'Each one is numbered' : 'Optional'} style={box} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {[['plant', 'Plant / Equipment'], ['pat', 'PAT Tested Appliance']].map(([v, l]) => (
              <Pressable key={v} onPress={() => setAdding({ ...adding, category: v })} style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: adding.category === v ? live.brand1 : base.line, backgroundColor: adding.category === v ? live.brand1 : base.card }}>
                <Text style={{ color: adding.category === v ? live.brand1Text : base.ink }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <Muted style={{ fontWeight: '600' }}>Inspection</Muted>
          <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
            {([[null, 'None'], [6, 'Every 6 Months'], [12, 'Every 12 Months']] as const).map(([m, l]) => (
              <Pressable key={String(m)} onPress={() => setAdding({ ...adding, interval: m })} style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: adding.interval === m ? live.brand1 : base.line, backgroundColor: adding.interval === m ? live.brand1 : base.card }}>
                <Text style={{ fontSize: 12.5, color: adding.interval === m ? live.brand1Text : base.ink }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          {adding.interval != null && <DateBox value={adding.nextDue} onChange={(v) => setAdding({ ...adding, nextDue: v })} placeholder="Next inspection due" title="Next inspection due" style={{ marginBottom: 8 }} />}
          <TextInput value={adding.description} onChangeText={(v) => setAdding({ ...adding, description: v })} placeholder="Description (optional)" style={box} />
          {siteId && <Pressable onPress={() => setAdding({ ...adding, here: !adding.here })} style={{ paddingVertical: 6 }}><Text style={{ color: base.ink }}>{adding.here ? '☑' : '☐'} Put it on this job (otherwise it goes in the yard)</Text></Pressable>}
          {adding.photo && <Image source={{ uri: adding.photo.uri }} style={{ width: 90, height: 90, borderRadius: 8, marginBottom: 6 }} />}
          <Button small kind="ghost" title={adding.photo ? 'Change Photo' : '📷 Photo (Required)'} onPress={async () => { const p = await photo(); if (p) setAdding({ ...adding, photo: p }); }} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button small busy={busy} title={Number(adding.count) > 1 ? `Add ${adding.count} Items` : 'Add Item'} onPress={async () => {
              if (!adding.name.trim()) { toast('Enter the item.'); return; }
              if (!adding.photo) { toast('A photo is needed.'); return; }
              const due = adding.interval != null ? readIsoDate(adding.nextDue) : null;
              if (adding.interval != null && (!due || due === 'bad')) { toast('Choose the next inspection due date.'); return; }
              const names = batchNames(adding.name, Number(adding.count) || 1);
              setBusy(true);
              const err = await addPlantBatch(me, siteId && adding.here ? siteId : null, { names, category: adding.category, serial: adding.serial.trim(), description: adding.description.trim(), interval: adding.interval, nextDue: due as string | null, photo: adding.photo });
              setBusy(false);
              if (err) { toast(err); return; }
              toast(names.length > 1 ? `${names.length} items added, numbered ${names[0].split(' #').pop()} to ${names[names.length - 1].split(' #').pop()}` : 'Item added'); setAdding(null); refresh();
            }} />
            <Button small kind="ghost" title="Cancel" onPress={() => setAdding(null)} />
          </View>
        </Card>
      ) : <View style={{ marginTop: 10 }}><Button title="+ Add Plant" onPress={() => setAdding({ name: '', count: '1', category: 'plant', serial: '', description: '', interval: null, nextDue: '', photo: null, here: false })} /></View>)}
    </View>
  );
}
