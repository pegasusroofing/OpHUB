// Admin Centre › People › Material Costs For Operatives (Andy, 18 Nov 2026: cross-referencing the settings against the
// new roles). Office roles get See Material Costs on Admin › Roles; operatives aren't on the board, so they're switched
// on one by one here (always off unless an admin says Yes). Anyone in an office role who was switched on one by one
// before the roles is listed too, so it can be turned off. Finance users always see costs. Changed by a company admin
// with Finance, as the database allows (it was Finance › Settings › Who Can See Material Costs).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { YesNo } from '@/components/OneDriveSettings';
import { confirmAsk, showAlert } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isFinanceUser } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type P = { id: string; name: string | null; role: string; see_costs: boolean | null; finance_enabled: boolean | null };

export default function MaterialCosts() {
  const { me, org } = useAuth();
  const qc = useQueryClient();
  const { data: team = [], refetch } = useQuery({ queryKey: ['matCosts', me?.org_id], enabled: !!me?.org_id, queryFn: async () => (((await db.from('profiles').select('id,name,role,see_costs,finance_enabled').eq('org_id', me?.org_id as string)).data as P[] | null) ?? []).sort((a, b) => String(a.name).localeCompare(String(b.name))) });
  if (!me) return null;
  if (me.role !== 'admin') return <><Stack.Screen options={{ title: 'Material Costs' }} /><Muted style={{ padding: space.l }}>Company admins only.</Muted></>;
  const canEdit = isFinanceUser(me, org);
  const ops = team.filter((p) => p.role === 'operative');
  const office = team.filter((p) => !['operative', 'admin', 'driver', 'client'].includes(p.role) && !p.role.startsWith('subcontractor') && p.see_costs && !p.finance_enabled);
  const setOn = async (ids: string[], on: boolean) => {
    const r = await db.from('profiles').update({ see_costs: on } as never).in('id', ids).select('id');
    if (r.error || !(r.data as unknown[] | null)?.length) showAlert('Only a company admin with Finance can change this.');
    void refetch(); void qc.invalidateQueries({ queryKey: ['team'] });
  };
  const row = (p: P) => (
    <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F0F1F4' }}>
      <Text style={{ flex: 1, fontSize: 14, color: base.ink }}>{p.name || 'Unnamed'}</Text>
      {canEdit ? <YesNo label={`${p.name} sees material costs`} value={!!p.see_costs} onChange={(v) => void setOn([p.id], v)} /> : <Text style={{ color: base.slate }}>{p.see_costs ? 'Yes' : 'No'}</Text>}
    </View>
  );
  const allOn = ops.length > 0 && ops.every((p) => p.see_costs);
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Material Costs' }} />
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>Operatives</Text>
        <Muted style={{ marginBottom: 8 }}>Material prices on a job&apos;s orders and shop. Always off unless you say Yes.</Muted>
        {ops.length ? ops.map(row) : <Muted>No operatives yet.</Muted>}
        {canEdit && ops.length > 1 && (
          <View style={{ alignItems: 'center', marginTop: 10 }}>
            <Button small kind="ghost" title={allOn ? 'No For Everyone' : 'Yes For Everyone'} onPress={async () => {
              if (!allOn && !(await confirmAsk('Let every operative see material costs?', 'Yes', 'No'))) return;
              void setOn(ops.map((p) => p.id), !allOn);
            }} />
          </View>
        )}
      </Card>
      {office.length > 0 && (
        <Card>
          <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>Also Switched On One By One</Text>
          <Muted style={{ marginBottom: 8 }}>People in office roles who were given material costs before the roles. Their role now decides (Admin › Roles › See Material Costs); say No here to leave it to the role.</Muted>
          {office.map(row)}
        </Card>
      )}
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '600', color: base.ink, marginBottom: 4 }}>Office Roles</Text>
        <Muted style={{ marginBottom: 10 }}>Project managers, site managers and the other office roles get material costs from their role. Finance users always see them.</Muted>
        <View style={{ alignItems: 'center' }}><Button small title="Open Roles" onPress={() => router.push('/pm/admin/roles' as never)} /></View>
      </Card>
      {!canEdit && <Muted style={{ marginTop: 4 }}>Only a company admin with Finance can change these.</Muted>}
    </ScrollView>
  );
}
