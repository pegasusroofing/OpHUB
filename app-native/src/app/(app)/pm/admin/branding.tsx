// Admin Centre › Company Logo & Theme (250 saveTeamLogo, 300 saveCompanyTheme /
// resetCompanyTheme), admins only: a new logo (shrunk to a small JPEG), and the
// two company colours, or back to the OpHUB defaults.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { DEFAULT_BRAND1 } from '@/lib/pdf';
import { pickPhotos } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const DEFAULT_BRAND2 = '#101114';
const HEX = /^#[0-9a-f]{6}$/i;

export default function Branding() {
  const { me, org, refresh } = useAuth();
  const toast = useToast();
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [c1, setC1] = useState((org as { color_primary?: string | null } | null)?.color_primary || DEFAULT_BRAND1);
  const [c2, setC2] = useState((org as { color_secondary?: string | null } | null)?.color_secondary || DEFAULT_BRAND2);
  if (!me || !org) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  const swatch = (c: string) => <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: HEX.test(c) ? c : base.line, borderWidth: 1, borderColor: base.line }} />;
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: org && !org.logo_path ? 'Set Up Your Company' : 'Company Logo & Theme' }} />
      {!!org && !org.logo_path && <Card style={{ backgroundColor: base.warnBg, borderColor: base.warn }}><Text style={{ color: base.ink }}>Before you get started, set up <Text style={{ fontWeight: '800' }}>{org.name}</Text>&apos;s branding — your logo and colours are shown throughout the app and on your team&apos;s invite link. Add your logo to carry on.</Text></Card>}
      <SectionTitle>Company Logo</SectionTitle>
      <Card>
        <Muted style={{ marginBottom: 10 }}>Shown throughout the app and on your team&apos;s invite/join screen.</Muted>
        <Pressable disabled={!!busy} onPress={async () => {
          const p = await pickPhotos('library', false);
          if ('error' in p) { showAlert(p.error); return; }
          if (!p[0]) return;
          setBusy('process');
          try {
            const r = await ImageManipulator.manipulate(p[0].uri).resize({ width: Math.min(400, p[0].width || 400) }).renderAsync();
            setLogo((await r.saveAsync({ compress: 0.85, format: SaveFormat.JPEG })).uri);
          } catch { toast('Could not process that image — try a different photo.'); } finally { setBusy(null); }
        }} style={{ width: 120, height: 120, borderRadius: 12, borderWidth: 1, borderColor: base.line, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: base.paper }}>
          {busy === 'process' ? <Muted>Processing…</Muted> : logo ? <Image source={{ uri: logo }} style={{ width: 120, height: 120 }} resizeMode="contain" />
            : org.logo_path ? <StorageImage bucket="org-logos" path={org.logo_path} style={{ width: 120, height: 120, resizeMode: 'contain' }} /> : <Text style={{ color: base.slate }}>Add logo</Text>}
        </Pressable>
        {logo ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <View style={{ flex: 1 }}><Button busy={busy === 'logo'} title="Save New Logo" onPress={async () => {
              setBusy('logo');
              try {
                const up = await supabase.storage.from('org-logos').upload(`${me.org_id}/logo-${Date.now()}.jpg`, await (await fetch(logo)).arrayBuffer(), { contentType: 'image/jpeg' });
                if (up.error) { toast('Logo upload failed — try again.'); return; }
                if (!(await db.from('organizations').update({ logo_path: up.data.path } as never).eq('id', org.id).select('id')).data?.length) { toast('Could not save — try again.'); return; }
                await refresh(); setLogo(null); toast('Logo updated');
              } catch { toast('Something went wrong saving that — check your connection and try again.'); } finally { setBusy(null); }
            }} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setLogo(null)} /></View>
          </View>
        ) : <Muted style={{ marginTop: 10 }}>Tap the logo above to choose a new one.</Muted>}
      </Card>
      <SectionTitle>Company Theme</SectionTitle>
      <Card>
        <Muted style={{ marginBottom: 10 }}>Set your company&apos;s colours — these apply across the app for everyone at {org.name}. Type a colour code like #4E8FD1.</Muted>
        {[['Primary colour', c1, setC1], ['Secondary colour', c2, setC2]].map(([l, v, set]) => (
          <View key={l as string} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            {swatch(v as string)}
            <View style={{ flex: 1 }}>
              <Muted style={{ fontWeight: '700' }}>{l as string}</Muted>
              <TextInput value={v as string} onChangeText={set as (s: string) => void} autoCapitalize="none" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink }} />
            </View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button busy={busy === 'theme'} title="Save Theme" onPress={async () => {
            if (!HEX.test(c1.trim()) || !HEX.test(c2.trim())) { toast('Enter both colours as a code like #4E8FD1.'); return; }
            setBusy('theme');
            const ok = !!(await db.from('organizations').update({ color_primary: c1.trim(), color_secondary: c2.trim() } as never).eq('id', org.id).select('id')).data?.length;
            setBusy(null);
            if (!ok) { toast('Could not save theme — try again.'); return; }
            await refresh(); toast('Company theme saved.');
          }} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="Reset to default" onPress={async () => {
            if (!(await confirmAsk('Reset the company colours to the OpHUB defaults?', 'Reset'))) return;
            setBusy('theme');
            const ok = !!(await db.from('organizations').update({ color_primary: null, color_secondary: null } as never).eq('id', org.id).select('id')).data?.length;
            setBusy(null);
            if (!ok) { toast('Could not reset theme — try again.'); return; }
            setC1(DEFAULT_BRAND1); setC2(DEFAULT_BRAND2); await refresh(); toast('Company theme reset to default.');
          }} /></View>
        </View>
      </Card>
    </ScrollView>
  );
}
