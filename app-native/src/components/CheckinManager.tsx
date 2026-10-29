// Manager extras under the Check In / Out button: geofence, team live status,
// history by day, and (admins) the PM's own log. Ported from renderCheckin (440) and
// renderCheckinSubAddress (450). Excel exports come with the export work.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';

import { showAlert, useToast } from '@/components/toast';
import { Popup } from '@/components/Popup';
import { Button, Card, Empty, Muted, Pill, SectionTitle, Toggle } from '@/components/ui';
import { getPosition } from '@/data/checkinAction';
import { checkinsForExport, setFencePoint, setFenceRadius, usePmLogins, useTeamCheckins } from '@/data/checkinManager';
import { nameOf, usePeople } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { exportTableExcel } from '@/lib/tableExport';
import { buildCheckinSessions, checkinDayLabel, timeHM } from '@/lib/rules/checkin';
import { parseCoordToken, radiusOptions, splitCoordPair, validLatLon } from '@/lib/rules/geo';
import type { Site, SubAddress } from '@/lib/types';
import { base, radius as R } from '@/theme/theme';

export function CheckinManager({ site, sub }: { site: Site; sub?: SubAddress }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: rows = [] } = useTeamCheckins(site.id, sub?.id);
  const { data: people } = usePeople();
  const admin = me?.role === 'admin';
  const { data: pmLogins = [] } = usePmLogins(site.id, site.responsible_pm_id, admin && !sub);
  const [fenceOpen, setFenceOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [pmOpen, setPmOpen] = useState(false);
  const [exporting, setExporting] = useState<'week' | 'all' | null>(null);
  const [modal, setModal] = useState<null | 'choose' | 'manual'>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  if (!me) return null;
  const fence = sub ?? site;
  const target = sub ? { table: 'site_sub_addresses' as const, id: sub.id } : { table: 'sites' as const, id: site.id };
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['sites'] }); void qc.invalidateQueries({ queryKey: ['subAddresses', site.id] }); };
  const place = sub ? 'address' : 'site';

  const savePoint = async (la: number, lo: number) => {
    if (await setFencePoint(target, la, lo)) { toast(`${sub ? 'Address' : 'Site'} location saved — now choose the check-in distance below`); setFenceOpen(true); refresh(); }
    else toast('Could not save — try again.');
  };
  const useHere = async () => {
    setModal(null); toast('Getting GPS lock…');
    const g = await getPosition();
    if ('error' in g) { toast(g.error); return; }
    await savePoint(g.lat, g.lon);
  };
  const typed = () => {
    let a = lat, b = lon;
    const pair = splitCoordPair(a) || splitCoordPair(b);
    if (pair && (!a.trim() || !b.trim() || splitCoordPair(a))) [a, b] = pair;
    return { la: parseCoordToken(a), lo: parseCoordToken(b) };
  };
  const { la, lo } = typed();
  const ok = validLatLon(la, lo);

  // Latest per person (oldest-first list, so the last write wins); on site first, newest first.
  const latest: Record<string, (typeof rows)[number]> = {};
  rows.forEach((c) => { if (c.user_id) latest[c.user_id] = c; });
  const status = Object.values(latest).sort((a, b) => (a.type === 'in' ? 0 : 1) - (b.type === 'in' ? 0 : 1) || (b.ts || '').localeCompare(a.ts || ''));
  const sessions = buildCheckinSessions(rows);
  const days: Record<string, typeof sessions> = {};
  sessions.forEach((s) => { const k = new Date((s.in || s.out)?.ts || 0).toDateString(); (days[k] ||= []).push(s); });
  const dayKeys = Object.keys(days).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <View>
      <SectionTitle>{sub ? 'Address Geofence' : 'Site Geofence'}</SectionTitle>
      {fence.geofence_lat != null && fence.geofence_lon != null ? (
        <>
          <Toggle title={`Geofence set — ${fence.geofence_radius_m || 100}m radius`} open={fenceOpen} onPress={() => setFenceOpen(!fenceOpen)} />
          {fenceOpen && (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <View>
                  <Text style={{ fontFamily: 'monospace', color: base.ink }}>{fence.geofence_lat.toFixed(5)}, {fence.geofence_lon.toFixed(5)}</Text>
                  <Text style={{ color: base.blue }} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${fence.geofence_lat},${fence.geofence_lon}`)}>View on map ↗</Text>
                </View>
                <Button kind="ghost" title="Update location" onPress={() => setModal('choose')} />
              </View>
              <RadiusPicker current={fence.geofence_radius_m} onSave={async (r) => { if (await setFenceRadius(target, r)) { toast(`Check-in distance set to ${r}m`); setFenceOpen(false); refresh(); } }} />
            </Card>
          )}
        </>
      ) : (
        <Card>
          <Muted style={{ marginBottom: 8 }}>Not set — check-ins won&apos;t be distance-checked yet.</Muted>
          <Button title={`Set ${place} location`} onPress={() => setModal('choose')} />
          <RadiusPicker current={fence.geofence_radius_m} onSave={async (r) => { if (await setFenceRadius(target, r)) { toast(`Check-in distance set to ${r}m`); refresh(); } }} />
        </Card>
      )}

      <SectionTitle>Site Team — Live Status</SectionTitle>
      {status.length ? status.map((c) => (
        <Card key={c.user_id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
          <Text style={{ fontWeight: '700', color: base.ink }}>{nameOf(people, c.user_id)}{c.user_id === me.id ? <Text style={{ color: base.slate }}> (you)</Text> : null}</Text>
          <Pill on={c.type === 'in'} text={c.type === 'in' && c.ts ? `On site since ${timeHM(c.ts)}` : 'Off site'} />
        </Card>
      )) : <Empty>No check-ins recorded for this {sub ? 'address' : 'site'} yet.</Empty>}

      <Toggle title={sub ? 'All Operatives' : 'All Operatives / PM Logins'} open={histOpen} onPress={() => setHistOpen(!histOpen)} />
      {histOpen && (dayKeys.length ? dayKeys.map((k) => (
        <View key={k} style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: base.slate, marginBottom: 6 }}>{checkinDayLabel(k)}</Text>
          {days[k].sort((a, b) => ((b.in || b.out)?.ts || '').localeCompare((a.in || a.out)?.ts || '')).map((s, i) => (
            <Card key={`${s.user_id}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
              <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{nameOf(people, s.user_id)}</Text>
              <Muted>{s.in?.ts ? `In ${timeHM(s.in.ts)}` : '—'}</Muted>
              {s.out?.ts ? <Muted>Out {timeHM(s.out.ts)}</Muted> : s.in ? <Text style={{ color: base.ok, fontWeight: '700' }}>On site</Text> : <Muted>—</Muted>}
            </Card>
          ))}
        </View>
      )) : <Empty>No check-ins recorded for this {sub ? 'address' : 'site'} yet.</Empty>)}

      {admin && !sub && histOpen && (
        <>
          <Toggle title="PM Logins" open={pmOpen} onPress={() => setPmOpen(!pmOpen)} />
          {pmOpen && (pmLogins.length ? pmLogins.slice(0, 4).map((c) => (
            <Card key={c.id} style={{ paddingVertical: 10 }}>
              <Text style={{ color: base.ink }}><Text style={{ fontWeight: '700' }}>{nameOf(people, site.responsible_pm_id)}</Text> — {c.type === 'in' ? 'Checked in' : 'Checked out'} · {c.ts ? new Date(c.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</Text>
            </Card>
          )) : <Empty>{site.responsible_pm_id ? 'No check-ins yet.' : 'No project manager assigned to this project yet.'}</Empty>)}
        </>
      )}
      {/* Every manager can export, as the current app (440). */}
      {!!me && isManager(me) && !sub && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: base.line }}>
            <Muted style={{ fontSize: 12 }}>Export check-ins:</Muted>
            {(['week', 'all'] as const).map((scope) => (
              <View key={scope}><Button kind="ghost" small busy={exporting === scope} title={scope === 'week' ? '📊 This week (Excel)' : '📊 Full history (Excel)'} onPress={async () => {
                setExporting(scope);
                try {
                  const rows = await checkinsForExport(site.id, scope);
                  if (!rows) { toast('Could not load all the check-ins — check your signal and try again.'); return; }
                  if (!rows.length) { toast('No check-ins in that range.'); return; }
                  const ok = await exportTableExcel({
                    title: scope === 'week' ? 'Check-ins (This Week)' : 'Check-ins (All Time)', site: site.name,
                    cols: [{ l: 'Name', w: 18 }, { l: 'Type', w: 11 }, { l: 'Date', w: 11 }, { l: 'Time', w: 8 }, { l: 'Latitude', num: true, w: 11 }, { l: 'Longitude', num: true, w: 11 }, { l: 'Accuracy (m)', num: true, w: 11 }],
                    rows: rows.map((c) => [nameOf(people, c.user_id), c.type === 'in' ? 'Check In' : 'Check Out', new Date(c.ts).toLocaleDateString('en-GB'), new Date(c.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), c.lat, c.lon, c.accuracy_m ?? '']),
                  }, org);
                  if (!ok) toast('Could not make the file — try again.');
                } finally { setExporting(null); }
              }} /></View>
            ))}
          </View>
        </>
      )}

      {!!modal && (
        <Popup title={modal === 'choose' ? `Set ${place} location` : 'Input GPS Co-Ordinates'} width={440} onClose={() => setModal(null)}>
            {modal === 'choose' ? (
              <>
                <Muted style={{ marginBottom: 10 }}>Choose how to set the GPS point operatives must check in near.</Muted>
                <Button kind="ghost" title="Input GPS Co-Ordinates — type in latitude & longitude" onPress={() => setModal('manual')} />
                <Button kind="ghost" title="Click for GPS Co-Ordinates — use this device's location" onPress={useHere} />
              </>
            ) : (
              <>
                <Muted style={{ marginBottom: 10 }}>Plain decimal (51.51828) or Google&apos;s degrees/minutes/seconds (51°31&apos;05.8&quot;N) both work. You can also paste a full pair from Google into the Latitude box.</Muted>
                <Muted style={{ fontWeight: '700' }}>Latitude</Muted>
                <TextInput value={lat} onChangeText={setLat} placeholder={`e.g. 51.51828 or 51°31'05.8"N`} autoCapitalize="none" style={inp} />
                <Muted style={{ fontWeight: '700' }}>Longitude</Muted>
                <TextInput value={lon} onChangeText={setLon} placeholder={`e.g. -0.15139 or 0°09'05.0"W`} autoCapitalize="none" style={inp} />
                {ok && <Text style={{ fontFamily: 'monospace', color: base.slate }}>Interpreted as: {la.toFixed(5)}, {lo.toFixed(5)}</Text>}
                {ok && <Text style={{ color: base.blue, marginVertical: 6 }} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${la},${lo}`)}>Find this spot on the map ↗</Text>}
                <Button title="Save Location" onPress={async () => {
                  if (!ok) { showAlert(`Could not read that as a co-ordinate — use decimal (51.51828) or degrees/minutes/seconds (51°31'05.8"N).`); return; }
                  setModal(null); await savePoint(la, lo);
                }} />
                <Button kind="ghost" title="‹ Back" onPress={() => setModal('choose')} />
              </>
            )}
        </Popup>
      )}
    </View>
  );
}

function RadiusPicker({ current, onSave }: { current: number | null; onSave: (r: number) => void }) {
  // The radius can come back from the database as text ("100"): compare as numbers so it shows as chosen.
  const [pick, setPick] = useState(Number(current) || 100);
  return (
    <View style={{ marginTop: 14 }}>
      <Muted style={{ marginBottom: 6 }}>Check-in/out distance limit</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {radiusOptions(Number(current) || null).map((r) => (
          <Pressable key={r} onPress={() => setPick(r)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: pick === r ? base.ink : base.line, backgroundColor: pick === r ? base.ink : base.card }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: pick === r ? '#fff' : base.ink }}>{r}m</Text>
          </Pressable>
        ))}
      </View>
      <Button title="Save" onPress={() => onSave(pick)} />
    </View>
  );
}

const inp = { borderWidth: 1, borderColor: base.line, borderRadius: R.input, padding: 10, marginVertical: 6, color: base.ink };
