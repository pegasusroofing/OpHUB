// Account / Settings (220 renderAccountSettings): Admin Centre for managers, your account, Sign Out, and any photos
// waiting for signal. Andy, 18 Nov 2026 ("your account is a big section, my phone number seems to be an open box rather
// than closed and click to edit ... My employee record should be under hr ... Sign out should be a standalone button"):
// plain rows as Finance's lists; the phone number shows as a row and opens to edit; My Employee Record only for people
// with no HR page (managers have it in HR › Employee Records); Sign Out on its own under the card.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { ListGroup, PlainRow } from '@/components/ListRows';
import { useToast } from '@/components/toast';
import { Button, Field, Muted, Screen } from '@/components/ui';
import { saveMyPhone } from '@/data/onboarding';
import { resetHowTo } from '@/lib/howto';
import { useAuth } from '@/lib/auth';
import { finHasAccess, isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { onQueueChange, pendingUploads } from '@/lib/uploadQueue';
import { base } from '@/theme/theme';

export default function Account() {
  const { me, org, signOut, refresh } = useAuth();
  const toast = useToast();
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState<'' | 'out' | 'phone'>('');
  const saved = (me as { phone?: string | null } | null)?.phone || '';
  const [phone, setPhone] = useState<string | null>(null); // null: closed
  useEffect(() => {
    pendingUploads().then((j) => setQueued(j.length));
    return onQueueChange((j) => setQueued(j.length));
  }, []);
  if (!me) return null;
  const finShown = !me.finance_hidden;
  const savePhone = async () => {
    if (phone === null) return;
    setBusy('phone'); const err = await saveMyPhone(me, phone.trim()); setBusy('');
    if (err) { toast(err); return; }
    setPhone(null); void refresh();
  };
  return (
    <Screen>
      {isManager(me) && (
        <ListGroup first>
          <PlainRow label="Admin Centre" sub="Team, libraries, company settings" onPress={() => router.push('/pm/admin' as never)} last />
        </ListGroup>
      )}
      <ListGroup title="Your Account" first={!isManager(me)}>
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F1F4' }}>
          <Text style={{ fontWeight: '600', fontSize: 14, color: base.ink }}>{me.name}</Text>
          <Text style={{ fontSize: 12, color: base.slate, marginTop: 1 }}>{me.email}</Text>
        </View>
        {phone === null ? (
          <PlainRow label="Phone Number" value={saved || 'Not Set'} sub="Shown to delivery drivers when you're a site contact" a11y="Edit phone number" onPress={() => setPhone(saved)} />
        ) : (
          <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0F1F4' }}>
            <Field label="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="e.g. 07123 456789" autoFocus />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
              <Button small busy={busy === 'phone'} title="Save" onPress={() => void savePhone()} />
              <Button small kind="ghost" title="Cancel" onPress={() => setPhone(null)} />
            </View>
          </View>
        )}
        <PlainRow label="My Signature" value={me.signature_path ? 'Adopted' : 'Not Yet'} onPress={() => router.push('/signature')} />
        {/* Managers have their own folder in HR › Employee Records; everyone else (no HR page) keeps it here. */}
        {!isManager(me) && me.role !== 'client' && !me.role.startsWith('subcontractor') && <PlainRow label="My Employee Record" onPress={() => router.push('/myrecord' as never)} />}
        {finHasAccess(me, org) && (
          <PlainRow label="Show Finance" sub="No hides Finance and money figures. Nothing is deleted." value={finShown ? 'Yes' : 'No'} a11y={`Show Finance: ${finShown ? 'Yes' : 'No'}`} onPress={async () => {
            const r = await supabase.from('profiles').update({ finance_hidden: finShown } as never).eq('id', me.id);
            if (r.error) { toast('Could not save — try again.'); return; }
            void refresh();
          }} />
        )}
        <PlainRow label="Show The How-To Tips Again" last onPress={async () => { await resetHowTo(me); toast('The how-to tips will show again as you open each page'); void refresh(); }} />
      </ListGroup>
      {queued > 0 && <Muted style={{ marginTop: 8 }}>{queued} photo{queued === 1 ? '' : 's'} waiting for signal to upload.</Muted>}
      {/* Sign Out on its own, under the card (Andy, 18 Nov 2026). */}
      <View style={{ alignItems: 'center', marginTop: 18 }}>
        <Button kind="ghost" title="Sign Out" busy={busy === 'out'} onPress={async () => { setBusy('out'); await signOut(); }} />
      </View>
    </Screen>
  );
}
