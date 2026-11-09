// The job home's third box: what's on site and the weather, split corner to corner (Andy, 4 Nov 2026; it used to swap). Tapping the weather shows
// today's weather and the next 5 days, and lets a manager email the client a weather delay day: filled in, editable, and the job's PM is always copied in. Operatives and clients don't get this box.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { isEmail } from '@/lib/rules/materials';
import { longDate, rainDelayEmail, weatherWords } from '@/lib/rules/weather';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 12 };

/** From the job's postcode. No account or key needed; refreshed every half hour. */
function useWeather(postcode?: string | null) {
  return useQuery({
    queryKey: ['weather', postcode], enabled: !!postcode, staleTime: 30 * 60000, refetchInterval: 30 * 60000, retry: 1,
    queryFn: async () => {
      const pc = String(postcode).trim();
      let at = (await (await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`)).json())?.result;
      // Only the first half typed in (e.g. "BN1"), or not found: the area's weather instead (Andy, 3 Nov 2026).
      if (!at) at = (await (await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(pc.split(/\s+/)[0])}`)).json())?.result;
      if (!at || at.latitude == null) return null;
      const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${at.latitude}&longitude=${at.longitude}&current=temperature_2m,weather_code&daily=precipitation_probability_max&forecast_days=1&timezone=Europe%2FLondon`)).json();
      return { lat: at.latitude as number, lon: at.longitude as number, temp: Math.round(Number(w?.current?.temperature_2m)), code: w?.current?.weather_code as number, rain: w?.daily?.precipitation_probability_max?.[0] as number | undefined };
    },
  });
}

type Hour = { t: string; temp: number; code: number; rain: number; wind: number };
type Day = { d: string; code: number; hi: number; lo: number; rain: number; wind: number };
/** The full forecast, fetched only when the pop-up opens: today hour by hour, and the next 5 days. Wind in mph. */
function useForecast(lat?: number, lon?: number) {
  return useQuery({
    queryKey: ['forecast', lat, lon], enabled: lat != null && lon != null, staleTime: 30 * 60000, retry: 1,
    queryFn: async () => {
      const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,apparent_temperature&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&forecast_days=6&wind_speed_unit=mph&timezone=Europe%2FLondon`)).json();
      const r = (x: unknown) => Math.round(Number(x));
      const hours: Hour[] = ((w?.hourly?.time ?? []) as string[]).map((t, i) => ({ t, temp: r(w.hourly.temperature_2m[i]), code: w.hourly.weather_code[i], rain: r(w.hourly.precipitation_probability[i]), wind: r(w.hourly.wind_speed_10m[i]) }));
      const days: Day[] = ((w?.daily?.time ?? []) as string[]).map((d, i) => ({ d, code: w.daily.weather_code[i], hi: r(w.daily.temperature_2m_max[i]), lo: r(w.daily.temperature_2m_min[i]), rain: r(w.daily.precipitation_probability_max[i]), wind: r(w.daily.wind_speed_10m_max[i]) }));
      return { now: { temp: r(w?.current?.temperature_2m), feels: r(w?.current?.apparent_temperature), code: w?.current?.weather_code as number, wind: r(w?.current?.wind_speed_10m) }, hours, days, sunrise: w?.daily?.sunrise?.[0] as string | undefined, sunset: w?.daily?.sunset?.[0] as string | undefined };
    },
  });
}

/** One box split corner to corner (Andy, 4 Nov 2026): how many are on site top left, the weather bottom right. Nothing swaps.
 *  Left half opens Check In; right half lets a manager email the client a rain delay day. No postcode: just the count. */
export function OnSiteWeather({ me, site, company, count, onSite, style }: { me: Profile; site: Site; company: string; count: number; onSite: () => void; style: object }) {
  const { data: w } = useWeather(site.postcode);
  const pmId = (site as Site & { responsible_pm_id?: string | null }).responsible_pm_id;
  const { data: pm } = useQuery({ queryKey: ['jobPm', pmId], enabled: !!pmId, queryFn: async () => (await supabase.from('profiles').select('name,email').eq('id', pmId as string).maybeSingle()).data as { name?: string | null; email?: string | null } | null });
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 64 });
  const say = w ? weatherWords(w.code) : null;
  // A narrow tile (a phone) gets slightly smaller text so the count and the weather each fit their corner.
  const narrow = size.w > 0 && size.w < 170;
  const n = <Text style={{ fontSize: narrow ? 17 : 19, fontWeight: '600', color: count ? base.ok : base.ink, fontVariant: ['tabular-nums'] }}>{count}</Text>;
  const lbl = <Text numberOfLines={1} style={{ fontSize: narrow ? 8.5 : 9.5, color: base.slateLight, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600' }}>On site</Text>;
  return (
    <>
      <View onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={[style, { flex: 1, minWidth: 0, height: 64, borderRadius: 12, overflow: 'hidden' }]}>
        {w && size.w > 0 && (
          <Svg width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
            {/* One colour all over, split by a soft grey line corner to corner (Andy, 4 Nov 2026). */}
            <Line x1={size.w} y1={0} x2={0} y2={size.h} stroke="#D6DAE0" strokeWidth={1.5} strokeLinecap="round" />
          </Svg>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`${count} on site now`} onPress={onSite} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w ? '62%' : '100%', paddingLeft: narrow ? 8 : 10, paddingTop: 6, alignItems: w ? 'flex-start' : 'center', justifyContent: w ? 'flex-start' : 'center' }}>
          {w ? <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>{n}{lbl}</View> : <>{n}{lbl}</>}
        </Pressable>
        {w && say && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Weather: ${say.text}`} onPress={() => setOpen(true)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: narrow ? '62%' : '50%', paddingRight: 10, paddingBottom: 6, alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <Text numberOfLines={1} style={{ fontSize: narrow ? 13.5 : 15, fontWeight: '600', color: base.ink }}>{say.icon} {Number.isFinite(w.temp) ? `${w.temp}°` : ''}</Text>
            {w.rain != null && <Text style={{ fontSize: 9.5, color: base.slateLight, fontWeight: '600' }}>{w.rain}% rain</Text>}
          </Pressable>
        )}
      </View>
      {open && w && <WeatherPopup me={me} site={site} company={company} pm={pm} lat={w.lat} lon={w.lon} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The weather as one line in the job's info bar (Andy, 9 Nov 2026): the same tap for today, the next 5 days and the
 *  weather delay email. Nothing until the postcode finds it. */
export function WeatherLink({ me, site, company, small }: { me: Profile; site: Site; company: string; small?: boolean }) {
  const { data: w, isLoading } = useWeather(site.postcode);
  const pmId = (site as Site & { responsible_pm_id?: string | null }).responsible_pm_id;
  const { data: pm } = useQuery({ queryKey: ['jobPm', pmId], enabled: !!pmId, queryFn: async () => (await supabase.from('profiles').select('name,email').eq('id', pmId as string).maybeSingle()).data as { name?: string | null; email?: string | null } | null });
  const [open, setOpen] = useState(false);
  const say = w ? weatherWords(w.code) : null;
  if (!w || !say) return <Text style={{ fontSize: small ? 11.5 : 13, color: base.slateLight }}>{!site.postcode ? 'No Postcode' : isLoading ? '…' : 'No Weather Found'}</Text>;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Weather: ${say.text}`} onPress={() => setOpen(true)} hitSlop={6}>
        <Text numberOfLines={1} style={small ? { fontSize: 11.5, color: base.slateLight } : { fontSize: 13.5, fontWeight: '600', color: base.ink }}>{say.icon} {Number.isFinite(w.temp) ? `${w.temp}°` : ''}{w.rain != null ? ` · ${w.rain}% Rain` : ''} ›</Text>
      </Pressable>
      {open && <WeatherPopup me={me} site={site} company={company} pm={pm} lat={w.lat} lon={w.lon} onClose={() => setOpen(false)} />}
    </>
  );
}

const hhmm = (t?: string) => (t ? t.slice(11, 16) : '');
const dayName = (d: string, i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }));
const tab = (on: boolean) => ({ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' as const, backgroundColor: on ? base.card : 'transparent', ...(on ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } } : {}) });

/** Tapping the weather (Andy, 4 Nov 2026): today's weather, a button for the next 5 days, and Email Weather Delay. */
function WeatherPopup({ me, site, company, pm, lat, lon, onClose }: { me: Profile; site: Site; company: string; pm?: { name?: string | null; email?: string | null } | null; lat: number; lon: number; onClose: () => void }) {
  const { data: f, isLoading } = useForecast(lat, lon);
  const [view, setView] = useState<'today' | 'week' | 'email'>('today');
  if (view === 'email') return <RainDelay me={me} site={site} company={company} pm={pm} onClose={onClose} onBack={() => setView('today')} />;
  const nowHr = new Date().getHours();
  const today = f?.days[0]?.d;
  const hours = (f?.hours ?? []).filter((h) => h.t.slice(0, 10) === today && Number(h.t.slice(11, 13)) >= nowHr);
  const say = f ? weatherWords(f.now.code) : null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(16,17,20,.45)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: base.card, borderRadius: radius.card, padding: 16, maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '600', color: base.ink }}>Weather</Text>
              <Muted>{site.name}{site.postcode ? ` · ${site.postcode}` : ''}</Muted>
            </View>
            <Pressable hitSlop={10} accessibilityLabel="Close" onPress={onClose}><Text style={{ fontSize: 20, color: base.slate }}>✕</Text></Pressable>
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: base.paper, borderRadius: 11, padding: 3, marginBottom: 12 }}>
            <Pressable accessibilityRole="button" onPress={() => setView('today')} style={tab(view === 'today')}><Text style={{ fontWeight: '600', color: base.ink }}>Today</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setView('week')} style={tab(view === 'week')}><Text style={{ fontWeight: '600', color: base.ink }}>Next 5 Days</Text></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 420 }}>
            {isLoading || !f ? <Muted>{isLoading ? 'Loading the forecast…' : 'The forecast could not be loaded. Try again later.'}</Muted> : view === 'today' ? (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <Text style={{ fontSize: 40 }}>{say?.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 26, fontWeight: '600', color: base.ink }}>{f.now.temp}°</Text>
                    <Text style={{ color: base.ink, fontWeight: '600' }}>{say?.text}</Text>
                    <Muted>Feels like {f.now.feels}° · Wind {f.now.wind} mph</Muted>
                  </View>
                  {f.days[0] && <View style={{ alignItems: 'flex-end' }}><Text style={{ fontWeight: '600', color: base.ink }}>High {f.days[0].hi}° · Low {f.days[0].lo}°</Text><Muted>{f.days[0].rain}% chance of rain</Muted><Muted>Sunrise {hhmm(f.sunrise)} · Sunset {hhmm(f.sunset)}</Muted></View>}
                </View>
                {hours.length > 0 && <Text style={{ fontSize: 11, fontWeight: '600', color: base.slate, letterSpacing: 0.5, marginBottom: 6 }}>HOUR BY HOUR</Text>}
                {hours.map((h) => (
                  <View key={h.t} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: base.line }}>
                    <Text style={{ width: 52, color: base.ink, fontWeight: '600' }}>{hhmm(h.t)}</Text>
                    <Text style={{ width: 30 }}>{weatherWords(h.code).icon}</Text>
                    <Text style={{ width: 44, color: base.ink, fontWeight: '600' }}>{h.temp}°</Text>
                    <Text style={{ flex: 1, color: h.rain >= 50 ? base.blue : base.slate }}>💧 {h.rain}%</Text>
                    <Text style={{ color: base.slate }}>💨 {h.wind} mph</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View>
                {f.days.slice(1, 6).map((d, i) => (
                  <View key={d.d} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: base.line }}>
                    <Text style={{ fontSize: 24, width: 40 }}>{weatherWords(d.code).icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: base.ink }}>{dayName(d.d, i + 1)}</Text>
                      <Muted>{weatherWords(d.code).text}</Muted>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontWeight: '600', color: base.ink }}>{d.hi}° / {d.lo}°</Text>
                      <Text style={{ fontSize: 12, color: d.rain >= 50 ? base.blue : base.slate }}>💧 {d.rain}% · 💨 {d.wind} mph</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={{ marginTop: 12 }}><Button title="✉ Email Weather Delay" onPress={() => setView('email')} /></View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RainDelay({ me, site, company, pm, onClose, onBack }: { me: Profile; site: Site; company: string; pm?: { name?: string | null; email?: string | null } | null; onClose: () => void; onBack?: () => void }) {
  const toast = useToast();
  const start = rainDelayEmail(site as never, me.name || '', company, longDate(new Date()));
  const [to, setTo] = useState(site.client_email || '');
  const [subject, setSubject] = useState(start.subject);
  const [message, setMessage] = useState(start.message);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!isEmail(to)) { toast('Enter the email address to send it to.'); return; }
    if (!message.trim()) { toast('Write the message first.'); return; }
    setBusy(true);
    const r = await supabase.functions.invoke('send-rain-delay-email', { body: { site_id: site.id, to: to.trim(), subject: subject.trim(), message } });
    setBusy(false);
    const err = (r.data as { error?: string } | null)?.error || (r.error ? 'Not sent. Try again.' : '');
    if (err) { toast(err); return; }
    toast(`Weather delay sent to ${to.trim()}`); onClose();
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(16,17,20,.45)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: base.card, borderRadius: radius.card, padding: 16, maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            {onBack && <Pressable hitSlop={10} accessibilityLabel="Back" onPress={onBack} style={{ marginRight: 10 }}><Text style={{ fontSize: 20, color: base.slate }}>‹</Text></Pressable>}
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: base.ink }}>Email Weather Delay</Text>
            <Pressable hitSlop={10} accessibilityLabel="Close" onPress={onClose}><Text style={{ fontSize: 20, color: base.slate }}>✕</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Muted style={{ fontWeight: '600' }}>To</Muted>
            <TextInput accessibilityLabel="To" value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" placeholder="Client's email" style={box} />
            <Muted style={{ marginBottom: 12 }}>Copied in: {pm?.email ? `${pm.name || 'PM'} (${pm.email})` : 'you, as this job has no PM set'}</Muted>
            <Muted style={{ fontWeight: '600' }}>Subject</Muted>
            <TextInput accessibilityLabel="Subject" value={subject} onChangeText={setSubject} style={box} />
            <Muted style={{ fontWeight: '600' }}>Message</Muted>
            <TextInput accessibilityLabel="Message" value={message} onChangeText={setMessage} multiline style={[box, { minHeight: 190, textAlignVertical: 'top' }]} />
            <Button busy={busy} title="Send" onPress={() => void send()} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
