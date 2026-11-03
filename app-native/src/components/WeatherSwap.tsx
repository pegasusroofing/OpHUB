// The job home's third box swaps between what's on site and the weather (Andy, 1 Nov 2026). Tapping the weather lets a manager
// email the client a rain delay day: filled in, editable, and the job's PM is always copied in. Operatives and clients don't get this box.
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { isEmail } from '@/lib/rules/materials';
import { longDate, rainDelayEmail, weatherWords } from '@/lib/rules/weather';
import { supabase } from '@/lib/supabase';
import type { Profile, Site } from '@/lib/types';
import { base, radius } from '@/theme/theme';

const SWAP_MS = 8000;
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

export function WeatherSwap({ me, site, company, tiles, style }: { me: Profile; site: Site; company: string; tiles: ReactNode[]; style: object }) {
  const { data: w } = useWeather(site.postcode);
  const pmId = (site as Site & { responsible_pm_id?: string | null }).responsible_pm_id;
  const { data: pm } = useQuery({ queryKey: ['jobPm', pmId], enabled: !!pmId, queryFn: async () => (await supabase.from('profiles').select('name,email').eq('id', pmId as string).maybeSingle()).data as { name?: string | null; email?: string | null } | null });
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const all = w ? tiles.length + 1 : tiles.length;
  useEffect(() => { if (all < 2) return undefined; const t = setInterval(() => setI((x) => x + 1), SWAP_MS); return () => clearInterval(t); }, [all]);
  const at = i % all;
  if (at < tiles.length || !w) return <>{tiles[at] ?? tiles[0]}</>;
  const say = weatherWords(w.code);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Weather" onPress={() => setOpen(true)} style={[style, { flex: 1, minWidth: 0, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 6 }]}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: base.ink }}>{say.icon} {Number.isFinite(w.temp) ? `${w.temp}°` : ''}</Text>
        <Text numberOfLines={1} style={{ fontSize: 10, color: base.slateLight, fontWeight: '600' }}>{say.text}{w.rain != null ? ` · ${w.rain}% rain` : ''}</Text>
      </Pressable>
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
