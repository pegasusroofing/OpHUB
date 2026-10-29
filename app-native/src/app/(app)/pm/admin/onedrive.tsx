// Admin Centre › OneDrive (260 integrations): the company connection
// (connect / reconnect / disconnect), the pinned Quick Links, and every
// project's linked folders (photos & exports, Material PO's, site inductions).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { connectOneDrive, disconnectOneDrive, setQuickLinks, unlinkFolder, useOdSites, useOneDriveStatus, useQuickLinks, type OdTarget } from '@/data/onedrive';
import { useAuth } from '@/lib/auth';
import { base, page, radius, space } from '@/theme/theme';

export default function OneDriveAdmin() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: st, isLoading } = useOneDriveStatus(me?.org_id);
  const { data: quick = [] } = useQuickLinks(me?.org_id);
  const { data: sites = [] } = useOdSites(me?.org_id);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Admins only.</Muted>;
  const refresh = () => ['odStatus', 'odQuick', 'odSites'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const connect = async () => { setBusy(true); try { const e = await connectOneDrive(); if (e) toast(e); } finally { setBusy(false); } };
  const pick = (target: OdTarget, id = '') => router.push({ pathname: '/pm/onedrive-pick', params: { target, id } } as never);
  const shown = sites.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'OneDrive' }} />
      <Card>
        <SectionTitle>Connection</SectionTitle>
        {isLoading ? <Muted>Checking…</Muted> : st && st.needs_reconnect ? (
          <>
            <Text style={{ color: '#B23B2E', marginBottom: 8 }}>Not syncing — the connection to {st.account_email || 'your OneDrive'} has {st.reason === 'expired' ? 'run out (not used for over 90 days)' : 'stopped working'}. Reconnect it to start syncing again.</Text>
            <Button busy={busy} title="Reconnect OneDrive" onPress={() => void connect()} />
          </>
        ) : st ? <Text style={{ color: '#1E7A3C', marginBottom: 8 }}>Connected — syncing to {st.account_email || 'your OneDrive'}{st.folder_path ? ` · folder "${st.folder_path}"` : ''}</Text>
          : (
            <>
              <Muted style={{ marginBottom: 8 }}>Connect your company&apos;s OneDrive so schedule progress photos, drawings and exports upload there automatically.</Muted>
              <Button busy={busy} title="Connect OneDrive" onPress={() => void connect()} />
            </>
          )}
        {st && <View style={{ marginTop: 8 }}><Button kind="ghost" title="Disconnect" onPress={async () => {
          if (!(await confirmAsk('Disconnect OneDrive? Photos will stop syncing until reconnected.', 'Disconnect'))) return;
          toast((await disconnectOneDrive(me.org_id as string)) ? 'OneDrive disconnected' : 'Could not disconnect — try again.'); refresh();
        }} /></View>}
        <Muted style={{ marginTop: 8 }}>After signing in to Microsoft, come back here — the status updates when the page is opened again.</Muted>
      </Card>
      <Card>
        <SectionTitle>Quick Links</SectionTitle>
        <Muted style={{ marginBottom: 8 }}>Pin a folder here — e.g. your Live Projects folder — so it shows as a one-tap shortcut wherever someone chooses a OneDrive folder.</Muted>
        {quick.map((l) => (
          <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
            <Text style={{ flex: 1, color: base.ink, fontWeight: '700' }}>⭐ {l.name}</Text>
            <Pressable hitSlop={8} onPress={async () => { toast((await setQuickLinks(me.org_id as string, quick.filter((x) => x.id !== l.id))) ? 'Removed Quick Link' : 'Could not save'); refresh(); }}><Text>🗑</Text></Pressable>
          </View>
        ))}
        <Button kind="ghost" title="+ Add a Quick Link" onPress={() => pick('quicklink')} />
      </Card>
      <SectionTitle>Integrations by project</SectionTitle>
      <TextInput value={q} onChangeText={setQ} placeholder="Search projects…" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 8 }} />
      {shown.length ? shown.map((s) => {
        const links: [OdTarget, string, string | null, string | null][] = [['progress', 'Photos, drawings & exports', s.onedrive_folder_id, s.onedrive_folder_name], ['materials', "Material PO's", s.material_orders_folder_id, s.material_orders_folder_name], ['siteinductions', 'Signed site inductions', s.site_inductions_folder_id, s.site_inductions_folder_name]];
        const n = links.filter((l) => l[2]).length;
        return (
          <Card key={s.id} style={{ padding: 10 }}>
            <Pressable onPress={() => setOpen(open === s.id ? null : s.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{s.name}</Text>
              <Muted>{n ? `${n} linked` : 'Not linked'} {open === s.id ? '▾' : '▸'}</Muted>
            </Pressable>
            {open === s.id && links.map(([t, label, fid, fname]) => (
              <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <View style={{ flex: 1 }}><Text style={{ color: base.ink }}>{label}</Text><Muted>{fid ? `📁 ${fname || 'Linked folder'}` : 'Not linked'}</Muted></View>
                <Pressable onPress={() => pick(t, s.id)} style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: base.ink, fontWeight: '700', fontSize: 12 }}>{fid ? 'Change' : 'Link'}</Text></Pressable>
                {!!fid && <Pressable hitSlop={8} onPress={async () => { if (await confirmAsk(`Unlink the ${label.toLowerCase()} folder? Sync stops until a new one is linked.`, 'Unlink')) { toast((await unlinkFolder(t, s.id)) ? 'Folder unlinked' : 'Could not unlink'); refresh(); } }}><Text>✕</Text></Pressable>}
              </View>
            ))}
          </Card>
        );
      }) : <Empty>No projects.</Empty>}
    </ScrollView>
  );
}
