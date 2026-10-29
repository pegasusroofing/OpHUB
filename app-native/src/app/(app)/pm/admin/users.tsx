// Admin Centre › Users (260 users section, 100 roleActionsHtml): everyone by
// role. Tap a person for what you're allowed to do: change role, phone number,
// sub form on/off (operatives), remove.
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Empty, Muted, SectionTitle } from '@/components/ui';
import { removeMember, setPhone, setRole, setSubform, toggleFinance, useTeam, type TeamMember } from '@/data/admin';
import { useAuth } from '@/lib/auth';
import { isFinanceUser, isFullManager, isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { ROLE_LABEL, roleActionsFor, shownRole } from '@/lib/rules/users';
import { base, page, radius, space } from '@/theme/theme';

const GROUPS: { title: string; match: (p: TeamMember) => boolean; empty: string }[] = [
  { title: 'Company Admins', match: (p) => p.role === 'admin', empty: 'No other admins yet.' },
  { title: 'Project Managers', match: (p) => p.role === 'pm' && !p.is_estimator, empty: 'No project managers yet.' },
  { title: 'Estimators', match: (p) => p.role === 'pm' && !!p.is_estimator, empty: '' },
  { title: 'Site Managers', match: (p) => p.role === 'site_manager', empty: 'No site managers yet.' },
  { title: 'Operatives', match: (p) => p.role === 'operative', empty: 'No operatives yet.' },
  { title: 'Delivery Drivers', match: (p) => p.role === 'driver', empty: 'No delivery drivers yet.' },
  { title: 'Clients', match: (p) => p.role === 'client', empty: 'No clients yet.' },
];

export default function Users() {
  const { me, org, refresh: refreshMe } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: team = [], isLoading } = useTeam(me?.org_id);
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['team'] }); void qc.invalidateQueries({ queryKey: ['people'] }); };
  const act = async (p: TeamMember) => {
    const { options, canRemove } = roleActionsFor(me, p, team);
    const full = isFullManager(me);
    const opts = [
      ...(options && options.length > 1 ? [{ key: 'role', label: `Role: ${ROLE_LABEL[shownRole(p)] || p.role} — change` }] : []),
      ...(full && p.role === 'operative' ? [{ key: 'subform', label: `📝 Sub form: ${p.subform_required === false ? 'Off' : 'On'}` }] : []),
      ...(p.id === me.id && isFinanceUser(me, org) ? [{ key: 'myfin', label: `💷 Finance: ${me.finance_hidden ? 'Off — turn on' : 'On — turn off'}` }] : []),
      ...(isFinanceUser(me, org) && p.id !== me.id && (p.role === 'admin' || p.role === 'pm') ? [{ key: 'fin', label: `💷 Finance: ${p.finance_enabled ? 'On — turn off' : 'Off — turn on'}` }] : []),
      ...(me.role === 'superadmin' && p.email ? [{ key: 'pw', label: '🔑 Reset password' }] : []),
      ...(full ? [{ key: 'phone', label: `📞 ${p.phone ? `${p.phone} — change` : 'Add phone'}` }] : []),
      ...(canRemove ? [{ key: 'remove', label: '🗑 Remove', danger: true }] : []),
    ];
    if (!opts.length) return;
    const k = await chooseAction(p.name, opts);
    if (k === 'role' && options) {
      const r = await chooseAction(`Change ${p.name}'s role`, options.filter((o) => o.value !== shownRole(p)).map((o) => ({ key: o.value, label: o.label })));
      if (!r || !(await confirmAsk(`Change this person's role to ${ROLE_LABEL[r]}?`, 'Change'))) return;
      toast((await setRole(p.id, r)) ? `Role changed to ${ROLE_LABEL[r]}` : 'Could not save — try again.'); refresh();
    } else if (k === 'subform') {
      toast((await setSubform(p.id, p.subform_required === false)) ? 'Saved' : 'Could not save — try again.'); refresh();
    } else if (k === 'phone') {
      const v = await promptText(`Mobile number for ${p.name}`, p.phone || ''); if (v === null) return;
      toast((await setPhone(p.id, v.trim() || null)) ? 'Phone number saved' : "Could not save — admins can set anyone's number; PMs can set operatives', drivers' and site managers'."); refresh();
    } else if (k === 'fin') {
      toast(await toggleFinance(p)); refresh();
    } else if (k === 'myfin') {
      const show = !!me.finance_hidden;
      const r = await supabase.from('profiles').update({ finance_hidden: !show } as never).eq('id', me.id);
      toast(r.error ? 'Could not save — try again.' : show ? 'Finance shown' : 'Finance hidden'); await refreshMe();
    } else if (k === 'pw' && p.email) {
      const custom = await promptText(`Set a new password for ${p.email}.

Type a password (min 8 characters), or leave this blank and press OK for a random one.`, '');
      if (custom === null) return;
      const pw = custom.trim(); if (pw && pw.length < 8) { toast('Password must be at least 8 characters.'); return; }
      const r = await supabase.functions.invoke('admin-reset-password', { body: { target_email: p.email, new_password: pw || undefined } });
      const d = r.data as { email?: string; new_password?: string; error?: string } | null;
      if (r.error || d?.error) { toast(`Reset failed — ${d?.error || 'try again'}`); return; }
      showAlert(`New password for ${d?.email || p.email}:

${d?.new_password || pw}

Pass it on securely — it won’t be shown again.`, 'Password reset');
    } else if (k === 'remove') {
      if (!(await confirmAsk(`Remove ${p.name || 'this person'} from the team? They will immediately lose access, and their email will be free to sign up fresh again later.`, 'Remove'))) return;
      const r = await removeMember(p.id); toast(r.msg); if (r.ok) refresh();
    }
  };
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Users' }} />
      {isLoading ? <Muted>Loading…</Muted> : GROUPS.map((g) => {
        const list = team.filter(g.match);
        if (!list.length && !g.empty) return null;
        return (
          <View key={g.title}>
            <SectionTitle>{g.title}</SectionTitle>
            {g.title === 'Estimators' && <Muted style={{ marginBottom: 6 }}>Same access as a Project Manager, but they get no notifications or automatic emails.</Muted>}
            {list.length ? list.map((p) => (
              <Pressable key={p.id} onPress={() => void act(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 6, backgroundColor: base.card }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: base.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{(p.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{p.name}{p.id === me.id ? ' (you)' : ''}</Text>
                  <Muted>{p.email || ''}{p.phone ? ` · ${p.phone}` : ''}</Muted>
                </View>
              </Pressable>
            )) : <Empty>{g.empty}</Empty>}
          </View>
        );
      })}
      <Muted style={{ marginTop: 14 }}>Project Managers and Admins can remove Operatives and Drivers. Only a Company Admin can remove a Project Manager, Site Manager or another Admin.</Muted>
    </ScrollView>
  );
}
