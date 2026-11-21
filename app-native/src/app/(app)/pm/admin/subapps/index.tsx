// Admin Centre › Subcontractor sign-up (866 renderSubApplications): the public
// sign-up form link to send out, and applications — New / Approved / Sent Back (for more information; 18 Nov 2026).
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { SelectBox } from '@/components/SelectBox';
import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { createPermanentInvite, subSignUpLink, useInvites, useTeam, webOrigin } from '@/data/admin';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, radius, space } from '@/theme/theme';
import { FinTabs } from '@/components/FinNav';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
export type SubApp = { id: string; company_name: string; contact_name: string; email: string; phone: string | null; status: string; created_at: string; data: Record<string, unknown> | null };
export const subAppValue = (v: unknown) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? Object.values(x).filter(Boolean).join(' · ') : String(x))).join('\n') : String(v ?? ''));

/** Who checks sign-ups (Andy, 18 Nov 2026: "flag to the document controller or whoever approves the sign up form"): they
 *  get the to-dos for certificates whose expiry date couldn't be read. Nobody chosen: the company admins. Admins set it. */
function SignupChecker() {
  const { me, org, refresh } = useAuth();
  const toast = useToast();
  const { data: team = [] } = useTeam(me?.org_id);
  const [busy, setBusy] = useState(false);
  if (!me || me.role !== 'admin' || !org) return null;
  const managers = team.filter((p) => ['admin', 'pm'].includes(p.role)); // they see the office's to-dos (site managers don't)
  const cur = (org as unknown as { signup_checker?: string | null }).signup_checker || '';
  return (
    <Card>
      <SectionTitle>Who Checks Sign-Ups</SectionTitle>
      <Muted style={{ marginBottom: 8 }}>They approve or send back sign-up forms, and get a to-do when a certificate’s expiry date can’t be read. Nobody chosen: the company admins.</Muted>
      <SelectBox title="Who Checks Sign-Ups" value={cur || 'admins'} options={[['admins', 'The Company Admins'], ...managers.map((p) => [p.id, p.name || 'Unnamed'] as [string, string])]} onChange={async (v) => {
        if (busy) return; setBusy(true);
        const r = await db.from('organizations').update({ signup_checker: v === 'admins' ? null : v } as never).eq('id', org.id).select('id');
        setBusy(false);
        if (r.error || !(r.data as unknown[] | null)?.length) { toast('Could not save — try again.'); return; }
        await refresh();
      }} />
    </Card>
  );
}

export default function SubApps() {
  const { me } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'new' | 'approved' | 'rejected'>('new');
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['subApps', me?.org_id], enabled: !!me,
    queryFn: async () => ((await db.from('subcontractor_applications').select('id,company_name,contact_name,email,phone,status,created_at,data').eq('org_id', me?.org_id as string).order('created_at', { ascending: false }).limit(300)).data as SubApp[] | null) ?? [],
  });
  // The link signs them up to the app, then opens the form (Andy, 19 Nov 2026), using the company's joining invite.
  const { data: inv, refetch: reloadInv } = useInvites(me?.org_id);
  const [making, setMaking] = useState(false);
  if (!me) return null;
  if (!isManager(me)) return <><Stack.Screen options={{ title: 'Subcontractor Sign-Up' }} /><Muted style={{ padding: space.l }}>Managers only.</Muted></>;
  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  const joinId = inv?.permanent?.id || null;
  const link = joinId && web ? `${webOrigin() || window.location.origin}/subcontractor?invite=${joinId}` : subSignUpLink(me.org_id as string);
  const counts = { new: 0, approved: 0, rejected: 0 } as Record<string, number>;
  rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Subcontractor Sign-Up' }} />
      <Card>
        <SectionTitle>Your Sign-Up Form</SectionTitle>
        <Muted style={{ marginBottom: 8 }}>{joinId && web
          ? 'Send this link to any subcontractor. They sign up to the app first, then go straight to the form: company details, insurance, accreditations, operatives and their documents. It lands here, and they’re on your team in the app.'
          : 'Send this link to any subcontractor. They fill in their company details, insurance, accreditations and operatives, upload their documents and sign — it lands here.'}</Muted>
        {web && !joinId && me.role === 'admin' && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>
            <Button small busy={making} title="Make The Sign-Up Link (They Join The App First)" onPress={async () => {
              setMaking(true); const ok = await createPermanentInvite(me); setMaking(false);
              if (ok) void reloadInv(); else toast('Could not make the link — try again.');
            }} />
          </View>
        )}
        <Text selectable style={{ fontSize: 12, color: base.ink, padding: 8, borderWidth: 1, borderColor: base.line, borderRadius: radius.input, marginBottom: 8 }}>{link}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
          <Button small title={Platform.OS === 'web' ? '📋 Copy Link' : '📋 Share Link'} onPress={async () => {
            try { if (Platform.OS === 'web' && globalThis.navigator?.clipboard) { await globalThis.navigator.clipboard.writeText(link); toast('Link copied — paste it into an email or text'); } else await Share.share({ message: link }); } catch { toast('Could not copy — select the link above.'); }
          }} />
          <Button small kind="ghost" title="👁 Open The Form" onPress={() => void Linking.openURL(link)} />
        </View>
        {/* Edit the form's questions (Andy, 19 Nov 2026). */}
        {(me.role === 'admin' || me.role === 'superadmin') && <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8 }}><Button kind="ghost" title="✎ Edit The Form" onPress={() => router.push('/pm/admin/subapps/form' as never)} /></View>}
      </Card>
      <SignupChecker />
      <FinTabs even value={tab} onChange={(k) => setTab(k as typeof tab)} items={[['new', `New (${counts.new || 0})`], ['approved', `Approved (${counts.approved || 0})`], ['rejected', `Sent Back (${counts.rejected || 0})`]]} />
      {isLoading ? <Muted>Loading…</Muted> : rows.filter((r) => r.status === tab).length ? rows.filter((r) => r.status === tab).map((r) => (
        <Pressable key={r.id} onPress={() => router.push(`/pm/admin/subapps/${r.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: base.ink }}>{r.company_name}</Text>
            <Muted>{r.contact_name} · {subAppValue((r.data || {}).trades)} · {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Muted>
          </View>
          <Text style={{ color: base.slate, fontSize: 18 }}>›</Text>
        </Pressable>
      )) : <Empty>{tab === 'new' ? 'No new applications.' : 'Nothing here yet.'}</Empty>}
    </ScrollView>
  );
}
