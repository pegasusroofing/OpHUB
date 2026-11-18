// Admin Centre › People › Roles (Andy, 16 Nov 2026: "a selection of roles ... a set list that the admin can see, but
// also add and remove"). The company's roles in order; each says what it uses the app as (OpHUB's level, which is
// what decides what they can see and do) and who has it. Andy, 17 Nov 2026: 'a lot more compact ... a drop down that
// then gives a brief': choose one from the drop-down for a short brief; Edit Role renames it, changes its level (only
// when nobody has it) or removes it; + Add A Role beside it. The role chosen also opens in What Each Role Can Do. Below, What Each Role Can Do: one role at a time, chosen
// from a drop-down, with the parts it can have on the left and the parts it has on the right (17 Nov 2026).
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
import { legacyExtra } from '@/lib/homeTiles';
import { ALL_PARTS, BOARD_LEVELS, partsOf } from '@/lib/rules/rolePerms';
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

/** Who has a role, briefly: up to five names, then how many more. */
const names = (people: { name?: string | null }[]) => {
  const n = people.map((p) => p.name || 'Unnamed');
  return n.length > 5 ? `${n.slice(0, 5).join(', ')} And ${n.length - 5} More` : n.join(', ');
};

export default function Roles() {
  const { me, org: company } = useAuth();
  const qc = useQueryClient();
  const { data: roles = [], isLoading } = useOrgRoles(me?.org_id);
  const { data: team = [] } = useTeam(me?.org_id);
  const [pop, setPop] = useState<OrgRole | 'new' | null>(null);
  // The role on show, here and in What Each Role Can Do. By id, else by name: the starting list's roles get new ids
  // when it's first saved, and a role just added is only known by its name until it's read back.
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  if (!me) return null;
  if (me.role !== 'admin') return <Muted style={{ padding: space.l }}>Company admins only.</Muted>;
  const org = me.org_id as string;
  const reread = () => ['orgRoles', 'team', 'people'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const done = () => { setPop(null); reread(); };
  const choose = (id: string) => { const r = roles.find((x) => x.id === id); if (r) setPick({ id: r.id, name: r.name }); };
  const sel = roles.find((r) => r.id === pick?.id) ?? roles.find((r) => r.name === pick?.name) ?? roles[0];
  const cur = pop && pop !== 'new' ? pop : null;
  const who = sel ? holders(sel, team, roles) : [];
  const has = sel ? partsOf(sel.perms, sel.perms_extra, legacyExtra(sel.access, company)).length : 0;
  return (
    <ScrollView contentContainerStyle={page(1000)}>
      <Stack.Screen options={{ title: 'Roles' }} />
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>Your Roles</Text>
        <Muted style={{ marginBottom: 8 }}>The roles people can have. Choose one to see who has it. Choose someone&apos;s role in Users.</Muted>
        {isLoading || !sel ? <Muted>Loading…</Muted> : (
          <View style={{ maxWidth: 640 }}>
            <SelectBox title="Your Roles" value={sel.id} options={roles.map((r) => [r.id, r.name] as [string, string])} onChange={choose} style={{ marginBottom: 8 }} />
            <View accessibilityLabel={`About ${sel.name}`} style={{ backgroundColor: '#F7F8FA', borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, padding: 10, gap: 3 }}>
              <Text style={{ fontSize: 13.5, color: base.ink }}>Uses The App As {ACCESS_LABEL[sel.access as keyof typeof ACCESS_LABEL] ?? sel.access}</Text>
              <Text style={{ fontSize: 13.5, color: base.ink }}>{who.length ? `${who.length} ${who.length === 1 ? 'Person' : 'People'}: ${names(who)}` : 'Nobody Yet'}</Text>
              {BOARD_LEVELS.includes(sel.access) && <Muted>Can Use {has === ALL_PARTS.length ? 'Every Part' : `${has} Of ${ALL_PARTS.length} Parts`}: Set Below</Muted>}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 12 }}>
              <Button kind="ghost" title="Edit Role" onPress={() => setPop(sel)} />
              <Button title="+ Add A Role" onPress={() => setPop('new')} />
            </View>
          </View>
        )}
      </Card>
      {!isLoading && (
        <Card>
          <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>What Each Role Can Do</Text>
          <RoleBoard roles={roles} pick={sel?.id ?? null} onPick={choose}
            onSave={async (r, perms) => { const e = await saveRolePerms(org, roles, r, perms); if (!e) void qc.invalidateQueries({ queryKey: ['orgRoles'] }); return e; }} />
        </Card>
      )}
      {pop && (
        <RolePop key={cur?.id ?? 'new'} role={cur} n={cur ? holders(cur, team, roles).length : 0} onClose={() => setPop(null)}
          onSave={async (name, access) => {
            const e = cur ? await saveOrgRole(org, roles, cur, { name, access }) : await addOrgRole(org, roles, name, access);
            if (!e) { setPick({ id: cur?.id ?? '', name: name.trim() }); done(); } else reread();
            return e;
          }}
          onRemove={async () => { const e = cur ? await removeOrgRole(org, roles, cur) : null; if (!e) { setPick(null); done(); } else reread(); return e; }} />
      )}
    </ScrollView>
  );
}
