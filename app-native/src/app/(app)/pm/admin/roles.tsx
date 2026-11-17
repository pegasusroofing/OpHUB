// Admin Centre › People › Roles (Andy, 16 Nov 2026: "a selection of roles ... a set list that the admin can see, but
// also add and remove"). The company's roles in order; each says what it uses the app as (OpHUB's level, which is
// what decides what they can see and do) and how many people have it. Tap one to rename it, change its level (only
// when nobody has it) or remove it; + Add A Role at the foot. Below, What Each Role Can Do: the board (17 Nov 2026).
// Company admins only; the database enforces the same.
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Pop } from '@/components/Pop';
import { RoleBoard } from '@/components/RoleBoard';
import { SelectBox } from '@/components/SelectBox';
import { confirmAsk, showAlert } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { addOrgRole, removeOrgRole, saveOrgRole, saveRolePerms, useOrgRoles } from '@/data/orgRoles';
import { useAuth } from '@/lib/auth';
import { ACCESS_LABEL, ACCESS_ORDER, holders, type OrgRole } from '@/lib/rules/orgRoles';
import { base, page, radius, space } from '@/theme/theme';

function RolePop({ role, n, onClose, onSave, onRemove }: { role: OrgRole | null; n: number; onClose: () => void; onSave: (name: string, access: string) => Promise<string | null>; onRemove: () => Promise<string | null> }) {
  const [name, setName] = useState(role?.name ?? '');
  const [access, setAccess] = useState(role?.access ?? 'operative');
  const [busy, setBusy] = useState(false);
  const locked = !!role && (n > 0 || role.is_default);
  const save = async () => {
    if (!name.trim()) { showAlert('Give the role a name.'); return; }
    setBusy(true); const err = await onSave(name, access); setBusy(false);
    if (err) showAlert(err);
  };
  return (
    <Pop title={role ? role.name : 'Add A Role'} onClose={onClose}
      footer={<View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 12 }}><Button busy={busy} title={role ? 'Save' : 'Add Role'} onPress={save} /><Button kind="ghost" title="Cancel" onPress={onClose} /></View>}>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: base.slate, marginBottom: 4 }}>Name</Text>
      <TextInput value={name} onChangeText={setName} placeholder="E.g. Quantity Surveyor" maxLength={60} accessibilityLabel="Role name"
        style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: base.ink, backgroundColor: base.card, marginBottom: 10 }} />
      {locked ? (
        <View style={{ marginBottom: 6 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: base.slate, marginBottom: 4 }}>Uses The App As</Text>
          <Text style={{ fontSize: 15, color: base.ink }}>{ACCESS_LABEL[role.access as keyof typeof ACCESS_LABEL] ?? role.access}</Text>
          <Muted style={{ marginTop: 4 }}>{n > 0 ? `${n} ${n === 1 ? 'person has' : 'people have'} this role. Move them to another role to change this.` : 'This is the main role for this level: anyone given this level another way gets it. You can rename it.'}</Muted>
        </View>
      ) : (
        <SelectBox label="Uses The App As" title="Uses The App As" value={access as never} options={ACCESS_ORDER.map((a) => [a, ACCESS_LABEL[a]] as [string, string])} onChange={(v) => setAccess(v)} />
      )}
      <Muted style={{ marginTop: 6 }}>This decides what they can see and do in OpHUB.</Muted>
      {!!role && n === 0 && !role.is_default && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${role.name}`} hitSlop={8} style={{ alignSelf: 'center', marginTop: 14 }} onPress={async () => {
          if (!(await confirmAsk(`Remove the ${role.name} role from your list?`, 'Yes, Remove'))) return;
          const err = await onRemove(); if (err) showAlert(err);
        }}><Text style={{ fontSize: 13, fontWeight: '600', color: base.slate }}>Remove This Role</Text></Pressable>
      )}
    </Pop>
  );
}

export default function Roles() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data: roles = [], isLoading } = useOrgRoles(me?.org_id);
  const { data: team = [] } = useTeam(me?.org_id);
  const [pop, setPop] = useState<OrgRole | 'new' | null>(null);
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  const org = me.org_id as string;
  const reread = () => ['orgRoles', 'team', 'people'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const done = () => { setPop(null); reread(); };
  const count = (r: OrgRole) => holders(r, team, roles).length;
  const cur = pop && pop !== 'new' ? pop : null;
  return (
    <ScrollView contentContainerStyle={page(1000)}>
      <Stack.Screen options={{ title: 'Roles' }} />
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>Your Roles</Text>
        <Muted style={{ marginBottom: 4 }}>The roles people can have. Each one uses the app as one of OpHUB&apos;s levels, which decides what they can see and do. Choose someone&apos;s role in Users.</Muted>
        {isLoading ? <Muted>Loading…</Muted> : roles.map((r, i) => {
          const n = count(r);
          return (
            <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`${r.name}: ${n} ${n === 1 ? 'person' : 'people'}`} onPress={() => setPop(r)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: '#F0F1F4', backgroundColor: pressed ? '#F7F8FA' : undefined })}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '600', color: base.ink }}>{r.name}</Text>
                <Muted>Uses The App As {ACCESS_LABEL[r.access as keyof typeof ACCESS_LABEL] ?? r.access}</Muted>
              </View>
              <Muted>{n ? `${n} ${n === 1 ? 'Person' : 'People'}` : 'Nobody Yet'}</Muted>
              <Text style={{ color: base.slate, fontSize: 17 }}>›</Text>
            </Pressable>
          );
        })}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}><Button title="+ Add A Role" onPress={() => setPop('new')} /></View>
      </Card>
      {!isLoading && (
        <Card>
          <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>What Each Role Can Do</Text>
          <RoleBoard roles={roles} onSave={async (r, perms) => { const e = await saveRolePerms(org, roles, r, perms); if (!e) void qc.invalidateQueries({ queryKey: ['orgRoles'] }); return e; }} />
        </Card>
      )}
      {pop && (
        <RolePop key={cur?.id ?? 'new'} role={cur} n={cur ? count(cur) : 0} onClose={() => setPop(null)}
          onSave={async (name, access) => { const e = cur ? await saveOrgRole(org, roles, cur, { name, access }) : await addOrgRole(org, roles, name, access); if (!e) done(); else reread(); return e; }}
          onRemove={async () => { const e = cur ? await removeOrgRole(org, roles, cur) : null; if (!e) done(); else reread(); return e; }} />
      )}
    </ScrollView>
  );
}
