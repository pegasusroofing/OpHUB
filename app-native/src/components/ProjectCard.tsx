// A project card (180 siteCardHtml, .sitecard.projcard): the job number in a
// company-coloured swatch, the name (Sora), address and client on one line
// each, then the responsible PM's initials and the status pill. Managers tap
// the PM chip / status pill for their menus.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { heading } from '@/lib/fonts';
import { fullSiteAddress, siteStatusKey } from '@/lib/rules/checkin';
import type { Site } from '@/lib/types';
import { base, useTheme } from '@/theme/theme';

const initials = (n: string) => n.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
const PILL = { live: { bg: base.okBg, fg: base.ok }, upcoming: { bg: base.warnBg, fg: base.warn }, closed: { bg: base.line, fg: base.slate } } as const;

export function ProjectCard({ s, pmName, onPm, onStatus, onStart }: { s: Site; pmName?: string; onPm?: () => void; onStatus?: () => void; onStart?: () => void }) {
  const t = useTheme();
  const st = siteStatusKey(s) as 'live' | 'upcoming' | 'closed';
  const sw = s.job_number || initials(s.name || '');
  const fs = sw.length <= 3 ? 13.5 : sw.length <= 5 ? 9.9 : sw.length <= 7 ? 8.1 : 6.75;
  const startLine = st === 'upcoming' && s.start_date ? `Starts ${new Date(`${s.start_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '';
  return (
    <Pressable onPress={() => router.push(`/sites/${s.id}` as never)}
      style={(st2) => [{ flexDirection: 'row', alignItems: 'center', gap: 10.8, height: 76, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10, shadowColor: '#14181D', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
        (st2 as { hovered?: boolean }).hovered && { shadowOpacity: 0.12, transform: [{ translateY: -1 }] }]}>
      <View style={{ width: 50.4, height: 43.2, borderRadius: 14, backgroundColor: t.brand1, borderWidth: 1.8, borderColor: t.brand2, alignItems: 'center', justifyContent: 'center', padding: 1.8 }}>
        <Text numberOfLines={2} style={{ color: t.brand1Text, fontWeight: '800', fontSize: fs, textAlign: 'center' }}>{sw}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[heading(800), { fontSize: 14.5, color: base.ink }]}>{s.name}</Text>
        <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate, marginTop: 1 }}>{fullSiteAddress(s) || '—'}</Text>
        {(!!s.client_name || !!startLine || (st === 'upcoming' && !!onStart)) && <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate, fontWeight: '500' }}>{st === 'upcoming' && onStart ? <Text onPress={onStart} style={{ color: base.blue }}>{startLine || 'Set start date'}</Text> : startLine}{(st === 'upcoming' && onStart) || startLine ? (s.client_name ? ' · ' : '') : ''}{s.client_name || ''}</Text>}
      </View>
      <Pressable onPress={onPm} disabled={!onPm} hitSlop={8} accessibilityLabel={s.responsible_pm_id ? `Responsible PM ${pmName || ''}` : 'Choose the responsible PM'}
        style={{ width: 24, height: 16.8, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: s.responsible_pm_id ? t.brand1 : base.line }}>
        <Text style={{ fontSize: 8, color: s.responsible_pm_id ? '#fff' : base.slate }}>{s.responsible_pm_id ? initials(pmName || '?') : '–'}</Text>
      </Pressable>
      <Pressable onPress={onStatus} disabled={!onStatus} hitSlop={8} accessibilityLabel={`Status ${st}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3.2, paddingHorizontal: 8.6, borderRadius: 999, backgroundColor: PILL[st].bg }}>
        {st === 'upcoming' ? <Text style={{ fontSize: 10 }}>🕐</Text> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: PILL[st].fg }} />}
        {onStatus && <Text style={{ fontSize: 9, color: PILL[st].fg, fontWeight: '800' }}>▾</Text>}
      </Pressable>
    </Pressable>
  );
}
