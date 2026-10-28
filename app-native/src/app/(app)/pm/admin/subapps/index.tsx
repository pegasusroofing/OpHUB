// Admin Centre › Subcontractor sign-up (866 renderSubApplications): the public
// sign-up form link to send out, and applications — New / Approved / Rejected.
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
export type SubApp = { id: string; company_name: string; contact_name: string; email: string; phone: string | null; status: string; created_at: string; data: Record<string, unknown> | null };
export const subAppValue = (v: unknown) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? Object.values(x).filter(Boolean).join(' · ') : String(x))).join('\n') : String(v ?? ''));

export default function SubApps() {
  const { me } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'new' | 'approved' | 'rejected'>('new');
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['subApps', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('subcontractor_applications').select('id,company_name,contact_name,email,phone,status,created_at,data').eq('org_id', me?.org_id as string).order('created_at', { ascending: false }).limit(300)).data as SubApp[] | null) ?? [],
  });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const link = `https://www.operativehub.co.uk/subcontractor.html?org=${me.org_id}`;
  const counts = { new: 0, approved: 0, rejected: 0 } as Record<string, number>;
  rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Subcontractor sign-up' }} />
      <Card>
        <SectionTitle>Your sign-up form</SectionTitle>
        <Muted style={{ marginBottom: 8 }}>Send this link to any subcontractor. They fill in their company details, insurance, accreditations and operatives, upload their documents and sign — it lands here.</Muted>
        <Text selectable style={{ fontSize: 12, color: base.ink, padding: 8, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, marginBottom: 8 }}>{link}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title={Platform.OS === 'web' ? '📋 Copy link' : '📋 Share link'} onPress={async () => {
            try { if (Platform.OS === 'web' && globalThis.navigator?.clipboard) { await globalThis.navigator.clipboard.writeText(link); toast('Link copied — paste it into an email or text'); } else await Share.share({ message: link }); } catch { toast('Could not copy — select the link above.'); }
          }} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" title="👁 Open the form" onPress={() => void Linking.openURL(link)} /></View>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: 6, marginVertical: 10 }}>
        {(['new', 'approved', 'rejected'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: tab === k ? base.ink : base.line, backgroundColor: tab === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: tab === k ? '#fff' : base.ink }}>{k[0].toUpperCase() + k.slice(1)} ({counts[k] || 0})</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? <Muted>Loading…</Muted> : rows.filter((r) => r.status === tab).length ? rows.filter((r) => r.status === tab).map((r) => (
        <Pressable key={r.id} onPress={() => router.push(`/pm/admin/subapps/${r.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{r.company_name}</Text>
            <Muted>{r.contact_name} · {subAppValue((r.data || {}).trades)} · {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Muted>
          </View>
          <Text style={{ color: base.slate, fontSize: 18 }}>›</Text>
        </Pressable>
      )) : <Empty>{tab === 'new' ? 'No new applications.' : 'Nothing here yet.'}</Empty>}
    </ScrollView>
  );
}
