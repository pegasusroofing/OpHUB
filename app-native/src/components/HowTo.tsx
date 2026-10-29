// The how-to tip banner (135 maybeShowHowTo): "💡 How X works ▾" at the top of
// a page, opening to the steps. Shown once per page per session until dismissed;
// not for clients, drivers or the platform owner.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { useAuth } from '@/lib/auth';
import { dismissHowTo, HOWTO, howtoDismissed } from '@/lib/howto';
import { isManager } from '@/lib/roles';
import { base } from '@/theme/theme';

const shownThisSession = new Set<string>();

export function HowTo({ k }: { k: string }) {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  // Counted as shown the first time this page draws it in this session.
  const [first] = useState(() => !shownThisSession.has(k));
  useEffect(() => { shownThisSession.add(k); }, [k]);
  if (!me || gone || !first || ['client', 'driver', 'superadmin'].includes(me.role)) return null;
  const done = howtoDismissed(me);
  const h = HOWTO[k], steps = h && (isManager(me) ? h.pm : h.op);
  if (!steps?.length || done.includes('*') || done.includes(k)) return null;
  const close = async (key: string | null) => {
    setGone(true);
    if (!key) return;
    await dismissHowTo(me, key); void refresh();
    if (key === '*') toast('Tips turned off — turn them back on in Settings.');
  };
  return (
    <View style={{ backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#F3D98B', borderRadius: 12, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ fontSize: 15 }}>💡</Text>
        <Pressable onPress={() => setOpen(!open)} style={{ flex: 1, marginLeft: 8 }}><Text style={{ fontWeight: '700', color: base.ink }}>How {h.title} works {open ? '▴' : '▾'}</Text></Pressable>
        <Pressable onPress={() => void close(null)} hitSlop={8} accessibilityLabel="Close tip"><Text style={{ color: base.slate, fontSize: 16 }}>✕</Text></Pressable>
      </View>
      {open && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          {steps.map((s, i) => <Text key={i} style={{ color: base.ink, marginBottom: 4 }}>{i + 1}. {s}</Text>)}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }}>
            <Pressable onPress={() => void close(k)} style={{ borderWidth: 1, borderColor: base.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: base.card }}><Text style={{ fontWeight: '700', color: base.ink }}>Got it — don&apos;t show again</Text></Pressable>
            <Pressable onPress={() => void close('*')}><Text style={{ color: base.slate, textDecorationLine: 'underline' }}>Turn off all tips</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
