// The job home's third box: what's on site and the weather, split corner to corner (Andy, 4 Nov 2026; it used to swap). Tapping the weather lets a manager
// email the client a rain delay day: filled in, editable, and the job's PM is always copied in. Operatives and clients don't get this box.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';

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
      return { temp: Math.round(Number(w?.current?.temperature_2m)), code: w?.current?.weather_code as number, rain: w?.daily?.precipitation_probability_max?.[0] as number | undefined };
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
  const n = <Text style={{ fontSize: 19, fontWeight: '600', color: count ? base.ok : base.ink, fontVariant: ['tabular-nums'] }}>{count}</Text>;
  const lbl = <Text style={{ fontSize: 9.5, color: base.slateLight, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '700' }}>On site</Text>;
  return (
    <>
      <View onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={[style, { flex: 1, minWidth: 0, height: 64, borderRadius: 12, overflow: 'hidden' }]}>
        {w && size.w > 0 && (
          <Svg width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
            <Polygon points={`${size.w},0 ${size.w},${size.h} 0,${size.h}`} fill="#EEF4FB" />
            <Line x1={size.w} y1={0} x2={0} y2={size.h} stroke={base.cardLine} strokeWidth={1} />
          </Svg>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`${count} on site now`} onPress={onSite} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w ? '50%' : '100%', paddingLeft: 10, paddingTop: 6, alignItems: w ? 'flex-start' : 'center', justifyContent: w ? 'flex-start' : 'center' }}>
          {n}{lbl}
        </Pressable>
        {w && say && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Weather: ${say.text}`} onPress={() => setOpen(true)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', paddingRight: 10, paddingBottom: 6, alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: base.ink }}>{say.icon} {Number.isFinite(w.temp) ? `${w.temp}°` : ''}</Text>
            {w.rain != null && <Text style={{ fontSize: 9.5, color: base.slateLight, fontWeight: '600' }}>{w.rain}% rain</Text>}
          </Pressable>
        )}
      </View>
      {open && <RainDelay me={me} site={site} company={company} pm={pm} onClose={() => setOpen(false)} />}
    </>
  );
}

function RainDelay({ me, site, company, pm, onClose }: { me: Profile; site: Site; company: string; pm?: { name?: string | null; email?: string | null } | null; onClose: () => void }) {
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
    toast(`Rain delay sent to ${to.trim()}`); onClose();
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(16,17,20,.45)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: base.card, borderRadius: radius.card, padding: 16, maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: base.ink }}>Email a rain delay</Text>
            <Pressable hitSlop={10} accessibilityLabel="Close" onPress={onClose}><Text style={{ fontSize: 20, color: base.slate }}>✕</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Muted style={{ fontWeight: '700' }}>To</Muted>
            <TextInput accessibilityLabel="To" value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" placeholder="Client's email" style={box} />
            <Muted style={{ marginBottom: 12 }}>Copied in: {pm?.email ? `${pm.name || 'PM'} (${pm.email})` : 'you, as this job has no PM set'}</Muted>
            <Muted style={{ fontWeight: '700' }}>Subject</Muted>
            <TextInput accessibilityLabel="Subject" value={subject} onChangeText={setSubject} style={box} />
            <Muted style={{ fontWeight: '700' }}>Message</Muted>
            <TextInput accessibilityLabel="Message" value={message} onChangeText={setMessage} multiline style={[box, { minHeight: 190, textAlignVertical: 'top' }]} />
            <Button busy={busy} title="Send" onPress={() => void send()} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
