// One Permit To Work (520 renderPermitView): details and issuer's signature, who
// must sign (and who has), Sign this permit, and Close it down — hot works needs
// two fire-extinguisher photos; a manager can close with signatures missing after
// confirming, which is recorded on the permit and in the job's history.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { closePermit, PERMIT_ICON, PERMIT_LABEL, signPermit, usePermit } from '@/data/mc';
import { useAuth } from '@/lib/auth';
import { pickPhotos, type Picked } from '@/lib/photos';
import { useIsSubAdmin } from '@/data/subcontractors';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const d = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T00:00:00` : s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function PermitView() {
  const { id, pid } = useLocalSearchParams<{ id: string; pid: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = usePermit(pid);
  const { data: people } = usePeople();
  const [p1, setP1] = useState<Picked | null>(null);
  const [p2, setP2] = useState<Picked | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  // The permit's subcontractor admin manages it as a PM would (520), override included.
  const { data: subAdmin } = useIsSubAdmin(data?.permit?.subcontractor_company_id, me);
  if (!me) return null;
  const permit = data?.permit;
  if (isLoading || !permit) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Permit not found.'}</Muted>;
  const sig = (me as { signature_path?: string | null }).signature_path;
  const signed = Object.fromEntries((data?.signoffs ?? []).map((s) => [s.user_id, s]));
  const assigned = permit.assigned_user_ids ?? [];
  const mine = assigned.includes(me.id);
  const mgr = isManager(me) || !!subAdmin;
  const canClose = permit.status === 'open' && (mgr || mine);
  const hot = permit.permit_type === 'hot_works';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['permit', pid] }); void qc.invalidateQueries({ queryKey: ['permits', id] }); void qc.invalidateQueries({ queryKey: ['mcTiles', id] }); };
  const photo = async (set: (p: Picked) => void) => {
    const k = await chooseAction('Fire extinguisher photo', [{ key: 'camera', label: '📷 Take a photo' }, { key: 'library', label: '🖼 Choose from library' }]);
    if (!k) return;
    const r = await pickPhotos(k as 'camera' | 'library', false);
    if ('error' in r) showAlert(r.error); else if (r[0]) set(r[0]);
  };

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: PERMIT_LABEL[permit.permit_type] || 'Permit' }} />
      <Card>
        <SectionTitle>{PERMIT_ICON[permit.permit_type] || '🧾'} {PERMIT_LABEL[permit.permit_type] || permit.permit_type}</SectionTitle>
        <Text style={{ color: base.ink, marginBottom: 6 }}>{permit.description}</Text>
        <Muted><Text style={{ fontWeight: '700' }}>Location:</Text> {permit.location}</Muted>
        <Muted><Text style={{ fontWeight: '700' }}>Date:</Text> {d(permit.work_date)}</Muted>
        {!!data?.company && <Muted><Text style={{ fontWeight: '700' }}>Subcontractor:</Text> {data.company}</Muted>}
        <Muted><Text style={{ fontWeight: '700' }}>Status:</Text> {permit.status}</Muted>
        <Muted style={{ marginTop: 6 }}><Text style={{ fontWeight: '700' }}>Issued by</Text> {nameOf(people, permit.issued_by)} on {d(permit.issued_at)}</Muted>
        {!!permit.issuer_signature_path && <StorageImage bucket="signatures" path={permit.issuer_signature_path} style={{ height: 40, width: 180, resizeMode: 'contain' }} />}
      </Card>

      <SectionTitle>Sign-off required</SectionTitle>
      {assigned.length ? assigned.map((u) => (
        <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{nameOf(people, u)}</Text>
            <Muted>{signed[u] ? `Signed ${d(signed[u].signed_at)}` : 'Awaiting signature'}</Muted>
          </View>
          {!!signed[u]?.signature_image_path && <StorageImage bucket="signatures" path={signed[u].signature_image_path} style={{ height: 32, width: 100, resizeMode: 'contain' }} />}
        </View>
      )) : <Empty>No employees selected.</Empty>}
      {mine && !signed[me.id] && permit.status === 'open' && (
        sig ? <Button busy={busy} title="Sign this permit" onPress={async () => { setBusy(true); const ok = await signPermit(me, permit.id); setBusy(false); toast(ok ? 'Signed' : 'Could not save — try again.'); refresh(); }} />
          : <Pressable onPress={() => router.push('/signature')}><Text style={{ color: base.warn }}>You haven't adopted a signature yet — tap to set one up before signing.</Text></Pressable>
      )}

      {permit.status === 'closed' && (
        <>
          <SectionTitle>Closed down</SectionTitle>
          <Card>
            <Muted><Text style={{ fontWeight: '700' }}>Closed by</Text> {nameOf(people, permit.closed_by)} on {d(permit.closed_at)}</Muted>
            {!!permit.closed_notes && <Text style={{ color: base.ink, marginVertical: 6 }}>{permit.closed_notes}</Text>}
            {!!permit.closer_signature_path && <StorageImage bucket="signatures" path={permit.closer_signature_path} style={{ height: 40, width: 180, resizeMode: 'contain' }} />}
            {(!!permit.closedown_photo_path_1 || !!permit.closedown_photo_path_2) && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {[permit.closedown_photo_path_1, permit.closedown_photo_path_2].filter(Boolean).map((p) => <StorageImage key={p as string} bucket="site-photos" path={p} style={{ width: 100, height: 100, borderRadius: 8 }} />)}
              </View>
            )}
          </Card>
        </>
      )}

      {canClose && (
        <>
          <SectionTitle>Close this permit down</SectionTitle>
          <Card>
            {hot && (
              <>
                <Muted style={{ marginBottom: 8 }}>Hot works can't be closed down without both fire-extinguisher photos attached.</Muted>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  {([[p1, setP1], [p2, setP2]] as const).map(([p, set], i) => (
                    <Pressable key={i} onPress={() => void photo(set)} style={{ width: 90, height: 90, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {p ? <Image source={{ uri: p.uri }} style={{ width: 90, height: 90 }} /> : <Text style={{ color: base.slate }}>📷 Photo {i + 1}</Text>}
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <TextInput value={notes} onChangeText={setNotes} placeholder="Closing notes (optional)" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
            <Button busy={busy} title="Close Permit" onPress={async () => {
              if (!sig) { toast('Adopt your signature first.'); router.push('/signature'); return; }
              if (hot && (!p1 || !p2)) { toast('Both fire-extinguisher photos are required to close a hot works permit.'); return; }
              let override = '';
              const unsigned = assigned.filter((u) => !signed[u]);
              if (unsigned.length) {
                const names = unsigned.map((u) => nameOf(people, u)).join(', ');
                if (!mgr) { showAlert(`This permit can't be closed yet — still waiting for ${unsigned.length === 1 ? 'a signature' : 'signatures'} from: ${names}.`); return; }
                if (!(await confirmAsk(`Still waiting for ${unsigned.length === 1 ? 'a signature' : 'signatures'} from: ${names}.\n\nClose the permit anyway? This will be recorded on the permit and in the job's history.`, 'Close without their signature'))) return;
                override = `Closed by ${me.name || 'a manager'} without sign-off from: ${names}.`;
              }
              setBusy(true); const err = await closePermit(me, permit, { photo1: p1, photo2: p2, notes: notes.trim(), overrideNote: override }); setBusy(false);
              if (err) { toast(err); return; }
              toast('Permit closed'); refresh();
            }} />
          </Card>
        </>
      )}
    </ScrollView>
  );
}
