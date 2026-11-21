// Admin Centre › Users (260 users section, 100 roleActionsHtml): everyone by
// role. Tap a person for what you're allowed to do: change role, phone number,
// sub form on/off (operatives), remove. Grouped under the company's own roles, and a role is chosen from that list
// (Andy, 16 Nov 2026; Admin Centre › Roles); a company admin chooses any of them, anyone else each level's default.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { chooseAction, confirmAsk, promptText, showAlert, useToast } from '@/components/toast';
import { Empty, Muted, SectionTitle } from '@/components/ui';
import { removeMember, setPhone, setSubform, toggleFinance, useTeam, type TeamMember } from '@/data/admin';
import { removeCompanyAccess, useAccessElsewhere } from '@/data/companies';
import { isSwitchSite } from '@/lib/betaOnly';
import { setPersonRole, useOrgRoles } from '@/data/orgRoles';
import { useAuth } from '@/lib/auth';
import { isFinanceUser, isFullManager, isManager } from '@/lib/roles';
import { can } from '@/lib/rules/rolePerms';
import { supabase } from '@/lib/supabase';
import { ACCESS_ORDER, accessOf, groupByRole, roleChoices, roleName, roleOf } from '@/lib/rules/orgRoles';
import { roleActionsFor } from '@/lib/rules/users';
import { base, page, radius, space, useTheme } from '@/theme/theme';


export default function Users() {
  const { me, org, refresh: refreshMe } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: team = [], isLoading } = useTeam(me?.org_id);
  const { data: roles = [], isLoading: rolesLoading } = useOrgRoles(me?.org_id);
  const th = useTheme();
  const { data: elsewhere = [] } = useAccessElsewhere(isSwitchSite() && me?.role === 'admin', me?.org_id);
  // Initials coloured by role, as the current app (260): admins the company's second colour, PMs and drivers the main colour, the rest grey.
  const swatch = (role: string) => (role === 'admin' ? th.brand2 || base.ink : role === 'pm' || role === 'driver' ? th.brand1 : role === 'site_manager' ? '#6B6F78' : '#4B4F58');
  const swatchText = (role: string) => (role === 'pm' || role === 'driver' ? th.brand1Text : '#fff');
  if (!me) return null;
  if (!can(me, 'people')) return <Muted style={{ padding: space.l }}>Your role doesn’t manage people. Ask your admin (Admin › Roles).</Muted>;
  if (!isManager(me)) return <><Stack.Screen options={{ title: 'Users' }} /><Muted style={{ padding: space.l }}>Managers only.</Muted></>;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['team'] }); void qc.invalidateQueries({ queryKey: ['people'] }); };
  const iAmAdmin = me.role === 'admin';
  // Finance is switched on the person's row: office roles only, never operatives (Andy, 2 Nov 2026).
  const finRole = (p: TeamMember) => p.role === 'admin' || p.role === 'pm';
  // Their role on Admin › Roles has no Finance – View: the switch would do nothing, so say why (Andy, 18 Nov 2026).
  const roleNoFin = (p: TeamMember) => { if (p.role === 'admin') return false; const r = roleOf(p, roles); return !!r && r.perms != null && !r.perms.includes('fin_view'); };
  const canFin = me.role === 'admin' && isFinanceUser(me, org);
  const flipFinance = async (p: TeamMember) => {
    if (!(await confirmAsk(p.finance_enabled ? `Switch Finance off for ${p.name}?` : `Give ${p.name} access to Finance?`, p.finance_enabled ? 'Switch off' : 'Give Finance'))) return;
    toast(await toggleFinance(p)); refresh();
  };
  const act = async (p: TeamMember) => {
    const { options, canRemove } = roleActionsFor(me, p, team);
    const full = isFullManager(me);
    const opts = [
      // An operative's own page: their certificates, tools and Subcontractor Form (Andy, 18 Nov 2026: "when i click it
      // should give me the option to go to operatives hub where it shows the subcontractor sign ups").
      ...(p.role === 'operative' ? [{ key: 'hub', label: '👷 Open In Operatives Hub (Subcontractor Form)' }] : []),
      ...(options && roleChoices(options.map((o) => o.value), roles, iAmAdmin, accessOf(p)).filter((r) => r.id !== roleOf(p, roles)?.id).length ? [{ key: 'role', label: `Role: ${roleName(p, roles)} — change` }] : []),
      ...(full && p.role === 'operative' ? [{ key: 'subform', label: `📝 Sub form: ${p.subform_required === false ? 'Off' : 'On'}` }] : []),
      ...(p.id === me.id && isFinanceUser(me, org) ? [{ key: 'myfin', label: `💷 Finance: ${me.finance_hidden ? 'Off — turn on' : 'On — turn off'}` }] : []),
      ...(me.role === 'superadmin' && p.email ? [{ key: 'pw', label: '🔑 Reset password' }] : []),
      ...(full ? [{ key: 'phone', label: `📞 ${p.phone ? `${p.phone} — change` : 'Add phone'}` }] : []),
      ...(canRemove ? [{ key: 'remove', label: '🗑 Remove', danger: true }] : []),
    ];
    if (!opts.length) return;
    const k = await chooseAction(p.name, opts);
    if (k === 'hub') { router.push(`/pm/operatives/${p.id}` as never); return; }
    if (k === 'role' && options) {
      const choices = roleChoices(options.map((o) => o.value), roles, iAmAdmin, accessOf(p)).filter((r) => r.id !== roleOf(p, roles)?.id);
      const k2 = await chooseAction(`Change ${p.name}'s role`, choices.map((r) => ({ key: r.id, label: r.name })));
      const r = choices.find((x) => x.id === k2);
      if (!r || !(await confirmAsk(`Change ${p.name}'s role to ${r.name}?`, 'Change'))) return;
      toast((await setPersonRole(p.id, r, iAmAdmin)) ? `Role changed to ${r.name}` : 'Could not save — try again.'); refresh();
    } else if (k === 'subform') {
      toast((await setSubform(p.id, p.subform_required === false)) ? 'Saved' : 'Could not save — try again.'); refresh();
    } else if (k === 'phone') {
      const v = await promptText(`Mobile number for ${p.name}`, p.phone || ''); if (v === null) return;
      toast((await setPhone(p.id, v.trim() || null)) ? 'Phone number saved' : "Could not save — admins can set anyone's number; PMs can set operatives', drivers' and site managers'."); refresh();
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
      {/* No link to Roles here: it's the next tab (Andy, 18 Nov 2026). */}
      {isLoading || rolesLoading ? <Muted>Loading…</Muted> : groupByRole(team.filter((p) => (ACCESS_ORDER as string[]).includes(accessOf(p))), roles).map((g) => {
        const list = g.people;
        return (
          <View key={g.role?.id ?? g.title}>
            <SectionTitle>{g.title}</SectionTitle>
            {g.role?.access === 'estimator' && <Muted style={{ marginBottom: 6 }}>Same access as a Project Manager, but they get no notifications or automatic emails.</Muted>}
            {list.length ? list.map((p) => (
              <Pressable key={p.id} onPress={() => void act(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 4, backgroundColor: base.card }}>
                <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: swatch(p.role), alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: swatchText(p.role), fontWeight: '600', fontSize: 11 }}>{(p.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</Text>
                </View>
                {/* One line: the name, then the email and phone (Andy, 18 Nov 2026: "the rows need compacting"). */}
                <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                  <Text style={{ fontWeight: '600', color: base.ink }}>{p.name}{p.id === me.id ? ' (you)' : ''}</Text>
                  <Text style={{ fontSize: 12, color: base.slate }}>{p.email ? `  ${p.email}` : ''}{p.phone ? ` · ${p.phone}` : ''}</Text>
                </Text>
                {finRole(p) && roleNoFin(p) ? <Text accessibilityLabel={`${p.name}: their role doesn't include Finance (Admin › Roles)`} style={{ fontSize: 11.5, color: base.slate, maxWidth: 110, textAlign: 'right' }}>Role Has No Finance</Text> : finRole(p) && (canFin && p.id !== me.id
                  ? <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!p.finance_enabled }} accessibilityLabel={`Finance for ${p.name}`} hitSlop={6} onPress={(e) => { e.stopPropagation(); void flipFinance(p); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: base.ink }}>Finance</Text>
                      <View style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: p.finance_enabled ? '#15803d' : '#d1d5db', padding: 2, alignItems: p.finance_enabled ? 'flex-end' : 'flex-start' }}><View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' }} /></View>
                    </Pressable>
                  : p.finance_enabled ? <Text style={{ fontSize: 12, fontWeight: '600', color: '#15803d' }}>Finance on</Text> : null)}
              </Pressable>
            )) : <Empty>Nobody yet.</Empty>}
          </View>
        );
      })}
      {/* Company switching (19 Nov 2026): people who can switch into this company but are in another of theirs right now.
          The company's admin can take that access away. */}
      {!!elsewhere.length && (
        <View>
          <SectionTitle>Also Has Access</SectionTitle>
          <Muted style={{ marginBottom: 6 }}>These people also belong to another company and are using it right now. They can switch back here with the role shown.</Muted>
          {elsewhere.map((p) => (
            <View key={p.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 4, backgroundColor: base.card }}>
              <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{p.name}</Text>
                <Text style={{ fontSize: 12, color: base.slate }}>{p.work_email ? `  ${p.work_email}` : ''}{p.role ? ` · ${roleName({ id: p.user_id, role: p.role }, roles)}` : ''}</Text>
              </Text>
              {iAmAdmin && <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${p.name}'s access`} hitSlop={6} onPress={async () => {
                if (!(await confirmAsk(`Remove ${p.name}'s access to ${org?.name || 'this company'}? Their other companies aren't affected.`, 'Yes', 'No'))) return;
                const err = await removeCompanyAccess(p.user_id);
                if (err) { showAlert(err); return; }
                void qc.invalidateQueries({ queryKey: ['accessElsewhere'] });
              }}><Text style={{ fontSize: 12, fontWeight: '600', color: base.warn }}>Remove Access</Text></Pressable>}
            </View>
          ))}
        </View>
      )}
      <Muted style={{ marginTop: 14 }}>Project Managers and Admins can remove Operatives and Drivers. Only a Company Admin can remove a Project Manager, Site Manager or another Admin.</Muted>
    </ScrollView>
  );
}
