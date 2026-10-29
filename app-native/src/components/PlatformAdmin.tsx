// Platform Admin home for the platform owner (170 renderAdmin): reset your own
// password, invite a company (founding-admin link), and every company with its
// package, modules, "open this company's app" (support mode), delete, and its
// people (role, reset password, delete).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';

import { FinChip } from '@/components/FinNav';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Check, Field, Muted, SectionTitle } from '@/components/ui';
import { joinLink } from '@/data/admin';
import { createCompany, deleteCompany, deleteUser, resetPassword, setOrgModules, setOrgPlan, setUserRole, usePlatform, viewAsOrg } from '@/data/platform';
import { useAuth } from '@/lib/auth';
import { base, page, space } from '@/theme/theme';

const PLAN_LABEL: Record<string, string> = { starter: 'OpHUB Basic', growth: 'OpHUB Pro', enterprise: 'OpHUB Enterprise' };
const ROLES: [string, string][] = [['operative', 'Operative'], ['site_manager', 'Site Manager'], ['pm', 'Project Manager'], ['estimator', 'Estimator'], ['driver', 'Delivery Driver'], ['client', 'Client'], ['admin', 'Admin']];
type Row = Record<string, any>;

export function PlatformAdmin() {
  const { me, signOut, refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = usePlatform(true);
  const [open, setOpen] = useState<string | null>(null);
  const [co, setCo] = useState({ name: '', email: '' });
  const [invite, setInvite] = useState<{ name: string; link: string } | null>(null);
  const [busy, setBusy] = useState('');
  if (!me) return null;
  const reload = () => void qc.invalidateQueries({ queryKey: ['platform'] });
  const reset = async (email: string) => {
    const pw = await promptText(`Set a new password for ${email}. Type a password (min 8 characters), or leave this blank for a random one.`, '');
    if (pw === null) return;
    if (pw.trim() && pw.trim().length < 8) { toast('Password must be at least 8 characters.'); return; }
    setBusy(email); const r = await resetPassword(email, pw.trim() || null); setBusy('');
    if (r.error || !r.data) { toast(`Reset failed — ${r.error}`); return; }
    showAlert(`New password for ${r.data.email} — share it with them securely; they should change it after signing in:\n\n${r.data.new_password}`);
  };
  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 21, fontWeight: '800', color: base.ink }}>Platform Admin</Text>
      <Muted style={{ marginBottom: 12 }}>OpHUB · all companies</Muted>
      <SectionTitle>My Account</SectionTitle>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: base.ink }}>{me.name} (you)</Text><Muted>{me.email} · Super Admin</Muted></View>
        <View style={{ width: 170 }}><Button kind="ghost" busy={busy === me.email} title="Reset My Password" onPress={() => void reset(me.email)} /></View>
      </Card>
      <SectionTitle>Invite a Company</SectionTitle>
      <Card>
        {invite ? (
          <>
            <Muted style={{ color: base.ok, marginBottom: 6 }}>Company &quot;{invite.name}&quot; created — share this link with whoever should become their admin. It works once, for the next 14 days:</Muted>
            <TextInput value={invite.link} editable={false} selectTextOnFocus style={{ borderWidth: 1, borderColor: base.line, borderRadius: 8, padding: 8, color: base.ink, fontSize: 12, marginBottom: 8 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button kind="ghost" title={Platform.OS === 'web' ? 'Copy Link' : 'Share Link'} onPress={async () => { try { if (Platform.OS === 'web' && globalThis.navigator?.clipboard) { await globalThis.navigator.clipboard.writeText(invite.link); toast('Link copied'); } else await Share.share({ message: invite.link }); } catch { toast('Could not copy — select and copy the link manually.'); } }} /></View>
              <View style={{ flex: 1 }}><Button kind="ghost" title="Invite Another" onPress={() => setInvite(null)} /></View>
            </View>
          </>
        ) : (
          <>
            <Field label="Company name" value={co.name} onChangeText={(v) => setCo({ ...co, name: v })} />
            <Field label="Their email (optional)" value={co.email} onChangeText={(v) => setCo({ ...co, email: v })} keyboardType="email-address" autoCapitalize="none" />
            <Button busy={busy === 'co'} title="Create Company & Invite" onPress={async () => {
              if (!co.name.trim()) { toast('Enter a company name.'); return; }
              setBusy('co'); const r = await createCompany(co.name.trim(), co.email.trim() || null); setBusy('');
              if (r.error || !r.data) { toast(`Could not create company — ${r.error}`); return; }
              setInvite({ name: co.name.trim(), link: joinLink(r.data.invite_id) }); setCo({ name: '', email: '' }); toast('Company created'); reload();
            }} />
            <Muted style={{ marginTop: 6 }}>Sets up a new company outside of Stripe checkout and gives you a founding-admin invite link to send them directly.</Muted>
          </>
        )}
      </Card>
      <SectionTitle>All Companies ({data?.orgs.length ?? '…'})</SectionTitle>
      {data?.orgs.map((o) => {
        const sub = data.subByOrg[o.id], people = data.byOrg[o.id] ?? [], ex = open === o.id;
        return (
          <Card key={o.id}>
            <Pressable onPress={() => setOpen(ex ? null : o.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: base.ink }}>{o.name}</Text>
                <Muted>{o.has_pm === false ? 'OpHUB Finance only' : `${PLAN_LABEL[o.plan_tier] || o.plan_tier || '—'}${o.has_finance ? ' + Finance' : ''}`} · {sub ? sub.status : 'no Stripe subscription'} · {people.length} member{people.length === 1 ? '' : 's'}</Muted>
              </View>
              <Text style={{ color: base.slate }}>{ex ? '▲' : '▼'}</Text>
            </Pressable>
            {ex && (
              <View style={{ marginTop: 10 }}>
                <Muted style={{ fontWeight: '700', marginBottom: 4 }}>Package</Muted>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {Object.entries(PLAN_LABEL).map(([k, l]) => <FinChip key={k} on={o.plan_tier === k} label={l} onPress={async () => { toast((await setOrgPlan(o.id, k)) ? `Package updated — ${l}` : 'Could not save — try again.'); reload(); }} />)}
                </View>
                <Muted style={{ fontWeight: '700' }}>Modules</Muted>
                <Check label="Project management (site app)" value={o.has_pm !== false} onChange={async (on) => {
                  if (!on && !(await confirmAsk('Make this company Finance only? Their people will only see OpHUB Finance.', 'Finance only'))) return;
                  toast((await setOrgModules(o.id, 'has_pm', on)) ? 'Modules updated' : 'Could not save — try again.'); reload();
                }} />
                <Check label="OpHUB Finance" value={!!o.has_finance} onChange={async (on) => { toast((await setOrgModules(o.id, 'has_finance', on)) ? 'Modules updated' : 'Could not save — try again.'); reload(); }} />
                <Muted style={{ fontSize: 11.5, marginBottom: 8 }}>Finance only = project management off. Finance is then given per person by their admin.</Muted>
                <Button title="🛠 Open this company's app" onPress={async () => {
                  if (!(await confirmAsk(`Open ${o.name} as their admin? You'll see and can change everything they can. Use Exit on the bar at the top to come back.`, 'Open'))) return;
                  const err = await viewAsOrg(o.id); if (err) { toast(`Could not switch — ${err}`); return; }
                  qc.clear(); await refresh();
                }} />
                <Muted style={{ fontSize: 11.5 }}>Go inside as their admin to look into issues or fix things. A bar at the top lets you exit.</Muted>
                <Pressable onPress={async () => {
                  if (!(await confirmAsk(`Permanently delete "${o.name}"? This removes the company, all its sites, and all its team members' access. This cannot be undone.`, 'Delete'))) return;
                  if ((await promptText(`Type the company name to confirm deleting "${o.name}":`, '')) !== o.name) { toast("Names didn't match — nothing deleted."); return; }
                  const r = await deleteCompany(o.id); toast(r.error ? `Delete failed — ${r.error}` : `Deleted ${r.data?.deleted || o.name}`); reload();
                }} style={{ marginVertical: 10 }}><Text style={{ color: base.warn, fontWeight: '700' }}>Delete Company</Text></Pressable>
                {people.length ? people.map((p: Row) => (
                  <View key={p.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
                    <View style={{ flex: 1, minWidth: 180 }}><Text style={{ fontWeight: '700', color: base.ink }}>{p.name}</Text><Muted>{p.email} · {p.is_estimator ? 'Estimator' : ROLES.find(([k]) => k === p.role)?.[1] || p.role}</Muted></View>
                    {p.role !== 'superadmin' && <FinChip on={false} label="Role ▾" onPress={async () => {
                      const r = await chooseAction(`Role for ${p.name}`, ROLES.map(([k, l]) => ({ key: k, label: `${(p.is_estimator ? 'estimator' : p.role) === k ? '✓ ' : ''}${l}` })));
                      if (!r || !(await confirmAsk(`Change this person's role to ${ROLES.find(([k]) => k === r)?.[1]}?`, 'Change'))) return;
                      toast((await setUserRole(p.id, r)) ? `Role changed to ${ROLES.find(([k]) => k === r)?.[1]}` : 'Could not save — try again.'); reload();
                    }} />}
                    <FinChip on={false} label={busy === p.email ? '…' : 'Reset Password'} onPress={() => void reset(p.email)} />
                    <FinChip on={false} label="Delete User" onPress={async () => {
                      if (p.id === me.id) { toast("You can't delete your own account this way."); return; }
                      if (!(await confirmAsk(`Permanently delete ${p.name || 'this user'}? This removes their login completely — they will not be able to sign in again. This cannot be undone.`, 'Delete'))) return;
                      const r = await deleteUser(p.id); toast(r.error ? `Delete failed — ${r.error}` : `${r.data?.deleted || p.name || 'User'} deleted`); reload();
                    }} />
                  </View>
                )) : <Muted>No members yet.</Muted>}
              </View>
            )}
          </Card>
        );
      })}
      <Pressable onPress={() => void signOut()} style={{ alignSelf: 'center', marginTop: 10 }}><Text style={{ color: base.slate, textDecorationLine: 'underline' }}>Sign out</Text></Pressable>
    </ScrollView>
  );
}

/** The bar shown while the platform owner is inside a company (130 supportbar). */
export function SupportBar() {
  const { me, org, refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  if (!me?._support) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF3CD', borderBottomWidth: 1, borderBottomColor: '#E6C766', paddingHorizontal: 12, paddingVertical: 8 }}>
      <Text style={{ flex: 1, color: base.ink, fontSize: 12.5 }}>🛠 Support mode — you&apos;re inside <Text style={{ fontWeight: '800' }}>{org?.name || 'this company'}</Text> as their admin. Changes are real.</Text>
      <Pressable onPress={async () => { const err = await viewAsOrg(null); if (err) { toast(`Could not switch — ${err}`); return; } qc.clear(); await refresh(); }} style={{ backgroundColor: base.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Exit</Text>
      </Pressable>
    </View>
  );
}
