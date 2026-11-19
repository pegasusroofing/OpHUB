// Platform Admin home for the platform owner (170 renderAdmin): reset your own
// password, invite a company (founding-admin link), and every company with its
// package, modules, "open this company's app" (support mode), delete, and its
// people (role, reset password, delete).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';

import { CompanySetupSteps } from '@/components/CompanySetupSteps';
import { FinChip } from '@/components/FinNav';
import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Button, Card, Field, Muted, SectionTitle } from '@/components/ui';
import { emailInvite, joinLink } from '@/data/admin';
import { createCompany, deleteCompany, deleteUser, orgSystems, resetPassword, setFinanceLive, setOrgPlan, setOrgSystems, setUserRole, usePlatform, viewAsOrg, type OrgSystems } from '@/data/platform';
import { useAuth } from '@/lib/auth';
import { base, page, space } from '@/theme/theme';

const PLAN_LABEL: Record<string, string> = { starter: 'OpHUB Basic', growth: 'OpHUB Pro', enterprise: 'OpHUB Enterprise' };
const SYS_LABEL: Record<OrgSystems, string> = { projects: 'OpHUB Projects', finance: 'OpHUB Finance', both: 'Projects + Finance' };
const ROLES: [string, string][] = [['operative', 'Operative'], ['site_manager', 'Site Manager'], ['pm', 'Project Manager'], ['estimator', 'Estimator'], ['finance_controller', 'Finance Controller'], ['driver', 'Delivery Driver'], ['client', 'Client'], ['admin', 'Admin']];
type Row = Record<string, any>;

export function PlatformAdmin() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = usePlatform(true);
  const [open, setOpen] = useState<string | null>(null);
  const [co, setCo] = useState({ name: '', email: '' });
  const [invite, setInvite] = useState<{ name: string; link: string; sent?: string } | null>(null);
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
      <Text style={{ fontSize: 21, fontWeight: '600', color: base.ink }}>Platform Admin</Text>
      <Muted style={{ marginBottom: 12 }}>OpHUB · all companies</Muted>
      <SectionTitle>My Account</SectionTitle>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: base.ink }}>{me.name} (you)</Text><Muted>{me.email} · Super Admin</Muted></View>
        <View style={{ width: 170 }}><Button kind="ghost" busy={busy === me.email} title="Reset My Password" onPress={() => void reset(me.email)} /></View>
      </Card>
      <SectionTitle>Invite a Company</SectionTitle>
      <Card>
        {invite ? (
          <>
            {/* The invite is emailed when an email was given (Andy, 19 Nov 2026: "nothing in emails"); the link is still here to share. */}
            {!!invite.sent && <Muted style={{ color: invite.sent.startsWith('Invite email sent') ? base.ok : base.warn, marginBottom: 6 }}>{invite.sent}</Muted>}
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
            <Field label="Their Email (We Email Them The Invite)" value={co.email} onChangeText={(v) => setCo({ ...co, email: v })} keyboardType="email-address" autoCapitalize="none" />
            <Button busy={busy === 'co'} title="Create Company & Invite" onPress={async () => {
              if (!co.name.trim()) { toast('Enter a company name.'); return; }
              setBusy('co'); const r = await createCompany(co.name.trim(), co.email.trim() || null);
              if (r.error || !r.data) { setBusy(''); toast(`Could not create company — ${r.error}`); return; }
              const sent = co.email.trim() ? await emailInvite(r.data.invite_id, co.email.trim()) : '';
              setBusy('');
              setInvite({ name: co.name.trim(), link: joinLink(r.data.invite_id), sent: sent && !sent.startsWith('Invite email sent') ? `The invite email didn't go — ${sent} Copy the link below and send it yourself.` : sent }); setCo({ name: '', email: '' }); reload();
            }} />
            <Muted style={{ marginTop: 6 }}>Sets up a new company outside of Stripe checkout, emails their founding-admin invite (if you give an email), and gives you the link as well.</Muted>
          </>
        )}
      </Card>
      <SectionTitle>All Companies ({data?.orgs.length ?? '…'})</SectionTitle>
      {data?.orgs.map((o) => {
        const sub = data.subByOrg[o.id], people = data.byOrg[o.id] ?? [], waiting = data.invitesByOrg[o.id] ?? [], ex = open === o.id;
        return (
          <Card key={o.id}>
            <Pressable onPress={() => setOpen(ex ? null : o.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{o.name}</Text>
                <Muted>{SYS_LABEL[orgSystems(o)]}{o.has_pm === false ? '' : ` · ${PLAN_LABEL[o.plan_tier] || o.plan_tier || '—'}`} · {sub ? sub.status : 'no Stripe subscription'} · {people.length} member{people.length === 1 ? '' : 's'}</Muted>
              </View>
              <Text style={{ color: base.slate }}>{ex ? '▲' : '▼'}</Text>
            </Pressable>
            {ex && (
              <View style={{ marginTop: 10 }}>
                <Muted style={{ fontWeight: '600', marginBottom: 4 }}>Package</Muted>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {Object.entries(PLAN_LABEL).map(([k, l]) => <FinChip key={k} on={o.plan_tier === k} label={l} onPress={async () => { toast((await setOrgPlan(o.id, k)) ? `Package updated — ${l}` : 'Could not save — try again.'); reload(); }} />)}
                </View>
                {/* Projects, Finance or Both, per company (Andy, 14 Nov 2026): the two systems are sold on their own or together. */}
                <Muted style={{ fontWeight: '600', marginBottom: 4 }}>Systems</Muted>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {(['projects', 'finance', 'both'] as const).map((k) => <FinChip key={k} on={orgSystems(o) === k} label={SYS_LABEL[k]} onPress={async () => {
                    const cur = orgSystems(o); if (cur === k) return;
                    const lose = cur !== 'projects' && k === 'projects' ? 'OpHUB Finance' : cur !== 'finance' && k === 'finance' ? 'OpHUB Projects' : '';
                    if (lose && !(await confirmAsk(`Switch ${o.name} to ${SYS_LABEL[k]}? Their people won't see ${lose} any more. Nothing is deleted; switch it back to see it again.`, 'Switch'))) return;
                    toast((await setOrgSystems(o.id, k)) ? `${o.name}: ${SYS_LABEL[k]}` : 'Could not save — try again.'); reload();
                  }} />)}
                </View>
                <Muted style={{ fontSize: 11.5, marginBottom: 8 }}>With Finance on, their admins get Finance; they give it to anyone else per person.</Muted>
                {/* Finance trial or live, per company (Andy, 19 Nov 2026: "i want to make construction live"). Only the
                    platform's super admin can change it (the database checks). */}
                {orgSystems(o) !== 'projects' && o.id !== '2eb072b7-2704-48c0-8110-62e45e621ded' && (
                  <>
                    <Muted style={{ fontWeight: '600', marginBottom: 4 }}>Finance</Muted>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      {([[false, 'Trial'], [true, 'Live']] as const).map(([live, l]) => <FinChip key={l} on={!!(o as { finance_live?: boolean }).finance_live === live} label={l} onPress={async () => {
                        if (!!(o as { finance_live?: boolean }).finance_live === live) return;
                        const msg = live
                          ? `Put ${o.name}'s Finance live? From now on it posts invoices and bills to their Xero, emails invoices, applications and orders to clients and suppliers, reads their finance inbox and pushes wages. Check their Xero and email settings first.`
                          : `Put ${o.name}'s Finance back on the trial? Nothing goes to Xero or out by email from Finance until it's live again.`;
                        if (!(await confirmAsk(msg, live ? 'Yes, Go Live' : 'Yes', 'No'))) return;
                        if (!(await setFinanceLive(o.id, live))) toast('Could not save — only the platform’s super admin can change this.'); reload();
                      }} />)}
                    </View>
                    <Muted style={{ fontSize: 11.5, marginBottom: 8 }}>{(o as { finance_live?: boolean }).finance_live ? 'Live: Xero posting, finance emails and the finance inbox all work.' : 'Trial: Finance works, but nothing goes to Xero or out by email, and the finance inbox isn’t read.'}</Muted>
                  </>
                )}
                <CompanySetupSteps org={o as never} />
                {/* Open and Delete side by side (Andy, 19 Nov 2026: "i need to be able to delete companies"; it was a small
                    orange link at the bottom). Deleting still asks, then needs the company's name typed in. */}
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <View style={{ flexGrow: 1, flexBasis: 200 }}><Button title="🛠 Open This Company's App" onPress={async () => {
                    if (!(await confirmAsk(`Open ${o.name} as their admin? You'll see and can change everything they can. Use Exit on the bar at the top to come back.`, 'Open'))) return;
                    const err = await viewAsOrg(o.id); if (err) { toast(`Could not switch — ${err}`); return; }
                    qc.clear(); await refresh();
                  }} /></View>
                  <View style={{ flexGrow: 1, flexBasis: 200 }}><Button kind="ghost" busy={busy === `del-${o.id}`} title="🗑 Delete Company" onPress={async () => {
                    if (!(await confirmAsk(`Permanently delete "${o.name}"? This removes the company, its ${people.length} member${people.length === 1 ? '' : 's'}' access, all its projects and its Finance records. This cannot be undone.`, 'Yes', 'No'))) return;
                    if ((await promptText(`Type the company name to confirm deleting "${o.name}":`, ''))?.trim() !== o.name.trim()) { showAlert("The name didn't match, so nothing was deleted."); return; }
                    setBusy(`del-${o.id}`); const r = await deleteCompany(o.id); setBusy('');
                    if (r.error) showAlert(`Delete failed — ${r.error}`); else { setOpen(null); reload(); }
                  }} /></View>
                </View>
                <Muted style={{ fontSize: 11.5, marginBottom: 10, textAlign: 'center' }}>Open goes inside as their admin to look into issues or fix things; a bar at the top lets you exit.</Muted>
                {/* Their admin invite, still waiting to be used: email it (again) or copy the link (Andy, 19 Nov 2026). */}
                {waiting.map((i: Row) => (
                  <View key={i.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
                    <View style={{ flex: 1, minWidth: 180 }}><Text style={{ fontWeight: '600', color: base.ink }}>Admin Invite — Not Signed Up Yet</Text><Muted>{i.email || 'No email given'}{i.expires_at ? ` · link works until ${new Date(i.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</Muted></View>
                    <FinChip on={false} label={busy === i.id ? 'Sending…' : 'Email Invite'} onPress={async () => {
                      const to = (await promptText(`Email ${o.name}'s admin invite to:`, i.email || ''))?.trim();
                      if (!to) return;
                      setBusy(i.id); const msg = await emailInvite(i.id, to); setBusy('');
                      if (msg.startsWith('Invite email sent')) reload(); else showAlert(msg);
                    }} />
                    <FinChip on={false} label="Copy Link" onPress={async () => { const l = joinLink(i.id); try { if (Platform.OS === 'web' && globalThis.navigator?.clipboard) { await globalThis.navigator.clipboard.writeText(l); toast('Link copied'); } else await Share.share({ message: l }); } catch { showAlert(l); } }} />
                  </View>
                ))}
                {people.length ? people.map((p: Row) => (
                  <View key={p.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: base.line }}>
                    <View style={{ flex: 1, minWidth: 180 }}><Text style={{ fontWeight: '600', color: base.ink }}>{p.name}</Text><Muted>{p.email} · {p.is_estimator ? 'Estimator' : ROLES.find(([k]) => k === p.role)?.[1] || p.role}</Muted></View>
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
      {/* No Sign out here (Andy, 19 Nov 2026): it's on the bar / menu already. */}
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
      <Text style={{ flex: 1, color: base.ink, fontSize: 12.5 }}>🛠 Support mode — you&apos;re inside <Text style={{ fontWeight: '600' }}>{org?.name || 'this company'}</Text> as their admin. Changes are real.</Text>
      <Pressable onPress={async () => { const err = await viewAsOrg(null); if (err) { toast(`Could not switch — ${err}`); return; } qc.clear(); await refresh(); }} style={{ backgroundColor: base.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Exit</Text>
      </Pressable>
    </View>
  );
}
