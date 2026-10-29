// Once each time the app is opened, on Home (185 maybeShowPmSignNag / maybeAskMyPhone): a manager with
// company policies or the handbook still to sign gets a pop-up straight to them; otherwise PMs, admins
// and site managers with no mobile number saved are asked for it (drivers and deliveries use it).
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { promptText, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { savePhone } from '@/data/onboarding';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base } from '@/theme/theme';

let signDone = false, phoneAsked = false;
export function HomePrompts() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [left, setLeft] = useState<{ pol: number; hb: number } | null>(null);
  useEffect(() => {
    if (!me || me._support) return;
    let live = true;
    const askPhone = async () => {
      if (phoneAsked || (me.phone || '').trim() || !['pm', 'admin', 'site_manager'].includes(me.role)) return;
      phoneAsked = true;
      const v = await promptText('Add your mobile number so drivers and the team can call you (shown as the Site contact on deliveries).', '');
      if (!v || !v.trim()) return;
      const err = await savePhone(me, v.trim());
      toast(err || 'Phone number saved'); if (!err) void refresh();
    };
    void (async () => {
      if (!signDone && isManager(me) && me.org_id) {
        const pols = ((await supabase.from('company_policies').select('id,kind').eq('org_id', me.org_id).eq('archived', false)).data as { id: string; kind: string }[] | null) || [];
        const mine = pols.length ? ((await supabase.from('company_policy_signatures').select('policy_id').eq('user_id', me.id)).data as { policy_id: string }[] | null) || [] : [];
        if (!live) return;
        const signed = new Set(mine.map((x) => x.policy_id)), todo = pols.filter((p) => !signed.has(p.id));
        signDone = true;
        if (todo.length) { const hb = todo.filter((p) => p.kind === 'handbook').length; setLeft({ pol: todo.length - hb, hb }); return; } // the phone is asked next time
      }
      if (live) await askPhone();
    })().catch(() => {});
    return () => { live = false; };
  }, [me, refresh, toast]);
  if (!left) return null;
  const go = () => { setLeft(null); router.push('/pm/hr/policies' as never); };
  const row = (icon: string, label: string) => (
    <Pressable key={label} onPress={go} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.line, borderRadius: 10, marginBottom: 8 }}>
      <Text>{icon}</Text><Text style={{ flex: 1, fontWeight: '800', color: base.ink }}>{label}</Text><Text style={{ color: base.blue, fontWeight: '700' }}>Sign now ›</Text>
    </Pressable>
  );
  return (
    <Modal transparent animationType="fade" onRequestClose={() => setLeft(null)}>
      <Pressable onPress={() => setLeft(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: base.card, borderRadius: 14, padding: 16, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
          <Text style={{ fontWeight: '800', fontSize: 17, color: base.ink, marginBottom: 4 }}>✍️ Needs your signature</Text>
          <Muted style={{ marginBottom: 12 }}>Please read and sign these.</Muted>
          {left.pol > 0 && row('📄', `Company policies${left.pol > 1 ? ` ×${left.pol}` : ''}`)}
          {left.hb > 0 && row('📘', 'Company handbook')}
          <View style={{ marginTop: 4 }}><Button kind="ghost" title="Not now" onPress={() => setLeft(null)} /></View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
