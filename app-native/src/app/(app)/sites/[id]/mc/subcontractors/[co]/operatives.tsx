// A subcontractor's operatives (550 renderSubOperatives). Their Project Manager sets up their company (Andy, 20 Nov 2026:
// "the subcontractors need a project manager by default who sets up their company and their view needs to be like our
// project managers"): they make a join link for each of their operatives (who sign up straight into this company on this
// job, with the lighter login), see everyone in the company and take an operative off. Our managers also allocate people
// already on the job, make or remove their Project Manager, and can invite their Project Manager by link or email.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, FilterRow, Muted, SectionTitle } from '@/components/ui';
import { emailInvite, joinLink } from '@/data/admin';
import { nameOf, usePeople } from '@/data/hs';
import { allocateSubOp, cancelSubInvite, createSubInvite, removeMySubOp, removeSubOp, setSubOpAdmin, useSubco, useSubInvites, useSubOperatives } from '@/data/subcontractors';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function SubOperatives() {
  const { id, co } = useLocalSearchParams<{ id: string; co: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sub } = useSubco(co, me);
  const { data, isLoading } = useSubOperatives(id, co);
  const { data: invites = [] } = useSubInvites(co);
  const { data: people } = usePeople();
  const [pick, setPick] = useState<string | null>(null);
  const [asPm, setAsPm] = useState<'yes' | 'no'>('no');
  const [email, setEmail] = useState('');
  const [made, setMade] = useState<{ id: string; pm: boolean } | null>(null);
  const [newPm, setNewPm] = useState<'yes' | 'no' | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!me || !sub) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const theirPm = !mgr && sub.isAdmin;
  const allocated = data?.allocated ?? [];
  const hasPm = allocated.some((a) => a.is_admin);
  // Our managers: the first link is for their Project Manager until they have one.
  const linkIsPm = mgr && (newPm ?? (hasPm ? 'no' : 'yes')) === 'yes';
  const company = sub.company.name;
  const refresh = () => { for (const k of [['subOps', co], ['subco', co], ['siteTeam', id], ['subInvites', co]]) void qc.invalidateQueries({ queryKey: k }); };
  const share = async (inviteId: string, pm: boolean) => {
    const text = `${company} on OpHUB: ${pm ? 'join as our Project Manager' : 'join our team'} for this job\n${joinLink(inviteId)}`;
    try {
      if (Platform.OS === 'web' && globalThis.navigator?.clipboard) { await globalThis.navigator.clipboard.writeText(text); setCopied(inviteId); setTimeout(() => setCopied((c) => (c === inviteId ? null : c)), 1800); }
      else await Share.share({ message: text });
    } catch { toast('Could not copy — select and copy the link manually.'); }
  };
  const copyTitle = (inviteId: string) => (Platform.OS === 'web' ? (copied === inviteId ? 'Copied ✓' : 'Copy Link') : 'Share Link');
  const goodEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${company} — Operatives` }} />
      <Muted style={{ marginBottom: 10, textAlign: 'center' }}>
        {theirPm
          ? `You're ${company}'s Project Manager on this job. Add your operatives with a join link, and upload your RAMS, COSHH, Toolbox Talks and Daily Briefings from the company page. Your operatives view and sign.`
          : `${company}'s Project Manager sets up their company: they add their operatives and upload their RAMS, COSHH, Toolbox Talks and Daily Briefings. Everyone else here views and signs.`}
      </Muted>

      <SectionTitle>{`On This Job (${allocated.length})`}</SectionTitle>
      {isLoading ? <Muted>Loading…</Muted> : allocated.length ? allocated.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: base.ink }}>{nameOf(people, a.user_id)}{a.user_id === me.id ? ' (You)' : ''}</Text>
            <Muted>{a.is_admin ? '⭐ Project Manager' : 'Operative'}</Muted>
          </View>
          {mgr && <Button small kind="ghost" title={a.is_admin ? 'Not Project Manager' : 'Make Project Manager'} onPress={async () => { if (await setSubOpAdmin(a.id, !a.is_admin)) refresh(); else toast('Could not save — try again.'); }} />}
          {mgr && <Button small kind="ghost" title="Remove" onPress={async () => { if (await confirmAsk(`Take ${nameOf(people, a.user_id)} off ${company}?`, 'Yes', 'No') && await removeSubOp(a.id)) refresh(); }} />}
          {theirPm && !a.is_admin && a.user_id !== me.id && <Button small kind="ghost" title="Remove" onPress={async () => {
            if (!(await confirmAsk(`Take ${nameOf(people, a.user_id)} off this job? They won't see it any more.`, 'Yes', 'No'))) return;
            if (await removeMySubOp(a.id)) refresh(); else toast('Could not remove them — try again.');
          }} />}
        </View>
      )) : <Empty>No one in {company} on this job yet.</Empty>}

      {(mgr || theirPm) && (
        <Card>
          <SectionTitle>{theirPm ? 'Add Your Operatives' : linkIsPm ? 'Invite Their Project Manager' : 'Invite Their Operatives'}</SectionTitle>
          {made ? (
            <>
              <Muted style={{ marginBottom: 8 }}>Send this link to {made.pm ? 'their Project Manager' : 'the operative'}. It works once, for the next 14 days. When they sign up they&apos;re on this job with {company}{made.pm ? ', as its Project Manager' : ''}.</Muted>
              <TextInput value={joinLink(made.id)} editable={false} selectTextOnFocus style={{ borderWidth: 1, borderColor: copied === made.id ? base.ok : base.line, backgroundColor: copied === made.id ? '#F2FBF6' : undefined, borderRadius: radius.input, padding: 8, fontSize: 11.5, color: base.ink, marginBottom: 8 }} />
              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
                <Button grow kind="ghost" title={copyTitle(made.id)} onPress={() => void share(made.id, made.pm)} />
                {mgr && goodEmail(email.trim()) && <Button grow busy={busy === 'email'} title="Email It" onPress={async () => { setBusy('email'); toast(await emailInvite(made.id, email.trim()), { confirm: true }); setBusy(null); }} />}
                <Button grow kind="ghost" title="Make Another" onPress={() => { setMade(null); setEmail(''); setNewPm(null); }} />
              </View>
            </>
          ) : (
            <>
              <Muted style={{ marginBottom: 8 }}>A join link for one person. They sign up with it and are straight onto this job with {company}, with a light login: no Subcontractor Form.</Muted>
              {mgr && (
                <View style={{ marginBottom: 8 }}>
                  <Muted style={{ fontWeight: '600', marginBottom: 4 }}>Is This For Their Project Manager?</Muted>
                  <FilterRow seg options={[['yes', 'Yes'], ['no', 'No']]} value={linkIsPm ? 'yes' : 'no'} onChange={(v) => setNewPm(v)} />
                </View>
              )}
              <TextInput value={email} onChangeText={setEmail} placeholder="Their email (optional: only they can use it)" autoCapitalize="none" keyboardType="email-address" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
              <Button busy={busy === 'make'} title="Make Join Link" onPress={async () => {
                const e = email.trim(); if (e && !goodEmail(e)) { toast('That email doesn’t look right.'); return; }
                setBusy('make'); const inv = await createSubInvite(co, linkIsPm, e); setBusy(null);
                if (!inv) { toast('Could not make the link — try again.'); return; }
                setMade({ id: inv, pm: linkIsPm }); refresh();
              }} />
            </>
          )}
        </Card>
      )}

      {(mgr || theirPm) && !!invites.length && (
        <>
          <SectionTitle>{`Waiting To Join (${invites.length})`}</SectionTitle>
          {invites.map((i) => (
            <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{i.email || 'Join link'}{i.subcontractor_admin ? ' · ⭐ Project Manager' : ''}</Text>
                <Muted>Made {day(i.created_at)} · works until {day(i.expires_at)}</Muted>
              </View>
              <Button small kind="ghost" title={copyTitle(i.id)} onPress={() => void share(i.id, i.subcontractor_admin)} />
              <Button small kind="ghost" title="Cancel" onPress={async () => { if (await confirmAsk('Cancel this join link? It will stop working.', 'Yes', 'No')) { if (await cancelSubInvite(i.id)) refresh(); else toast('Could not cancel it — try again.'); } }} />
            </View>
          ))}
        </>
      )}

      {mgr && (
        <Card>
          <SectionTitle>Allocate Someone Already On The Job</SectionTitle>
          <Muted style={{ marginBottom: 6 }}>Operatives already on this job and not with another subcontractor here.</Muted>
          {data?.pickable.length ? data.pickable.map((p) => (
            <Pressable key={p.id} onPress={() => setPick(p.id)}><Text style={{ paddingVertical: 5, color: base.ink }}>{pick === p.id ? '◉' : '○'} {p.name}</Text></Pressable>
          )) : <Muted>No one available to allocate.</Muted>}
          <Muted style={{ fontWeight: '600', marginTop: 8, marginBottom: 4 }}>Make Them Their Project Manager?</Muted>
          <FilterRow seg options={[['yes', 'Yes'], ['no', 'No']]} value={asPm} onChange={(v) => setAsPm(v)} />
          <View style={{ marginTop: 8 }}>
            <Button title="Allocate" onPress={async () => {
              if (!pick) { toast('Choose an operative.'); return; }
              if (await allocateSubOp(me, id, co, pick, asPm === 'yes')) { setPick(null); setAsPm('no'); refresh(); } else toast('Could not save — try again.');
            }} />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
