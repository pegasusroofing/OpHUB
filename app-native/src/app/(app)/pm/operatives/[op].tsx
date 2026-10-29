// One operative (320 renderOperativeDetail): name and phone (editable), sites
// assigned / live now, their certificates and their tools.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { CertsPanel } from '@/components/CertsPanel';
import { MyToolsList } from '@/components/MyToolsList';
import { OperativeOneDrive } from '@/components/OperativeOneDrive';
import { promptText, useToast } from '@/components/toast';
import { Button, Card, Muted, SectionTitle } from '@/components/ui';
import { saveOperativeField, useOperativeList } from '@/data/certs';
import { useOperativeSubform } from '@/data/subform';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

export default function OperativeDetail() {
  const { op } = useLocalSearchParams<{ op: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: ops = [] } = useOperativeList(me?.org_id);
  const { data: sites = [] } = useSites();
  const { data: sub } = useOperativeSubform(op);
  const { data: siteIds = [] } = useQuery({
    queryKey: ['opSites', op], enabled: !!op,
    queryFn: async () => [...new Set((((await supabase.from('site_assignments').select('site_id').eq('user_id', op)).data ?? []) as { site_id: string }[]).map((r) => r.site_id))],
  });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const o = ops.find((x) => x.id === op);
  if (!o) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const live = sites.filter((s) => siteIds.includes(s.id) && siteStatusKey(s) === 'live');
  const edit = async (field: 'name' | 'phone') => {
    const v = await promptText(field === 'name' ? 'Full name' : 'Contact number', (field === 'name' ? o.name : o.phone) || '');
    if (v === null) return;
    if (field === 'name' && !v.trim()) { toast('Name cannot be blank.'); return; }
    const ok = await saveOperativeField(o.id, field === 'name' ? { name: v.trim() } : { phone: v.trim() || null });
    toast(ok ? 'Saved' : 'Could not save — try again.');
    void qc.invalidateQueries({ queryKey: ['operativeList'] }); void qc.invalidateQueries({ queryKey: ['people'] });
  };
  const box = (n: number, l: string) => (
    <Card style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: 26, fontWeight: '800', color: base.ink }}>{n}</Text><Muted>{l}</Muted></Card>
  );
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: o.name }} />
      <SectionTitle>Details</SectionTitle>
      <Card>
        <Muted style={{ fontWeight: '700' }}>Name</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ flex: 1, fontWeight: '700', fontSize: 15, color: base.ink }}>{o.name || '—'}</Text>
          <View style={{ width: 90 }}><Button kind="ghost" title="Edit" onPress={() => void edit('name')} /></View>
        </View>
        <Muted style={{ fontWeight: '700' }}>Contact number</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontWeight: '700', fontSize: 15, color: base.ink }}>{o.phone || '—'}</Text>
          <View style={{ width: 90 }}><Button kind="ghost" title="Edit" onPress={() => void edit('phone')} /></View>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8 }}>{box(siteIds.length, 'Sites Assigned')}{box(live.length, 'Live Now')}</View>
      {live.length > 0 && <Muted style={{ marginBottom: 6 }}>On: {live.map((s) => s.name).join(', ')}</Muted>}
      {me.org_id && <><SectionTitle>OneDrive Sync</SectionTitle><OperativeOneDrive orgId={me.org_id} opId={o.id} /></>}
      <SectionTitle>Certificates</SectionTitle>
      <Muted style={{ marginBottom: 6 }}>This is {o.name}&apos;s record in the company Training Matrix — it also shows on their own My Dashboard.</Muted>
      <CertsPanel userId={o.id} />
      <SectionTitle>Subcontractor form</SectionTitle>
      <Card>
        <Text style={{ fontWeight: '700', color: sub?.sent ? base.ok : sub?.off ? base.slate : base.warn }}>{sub?.sent ? `Sent ${new Date(sub.sent.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : sub?.off ? 'Turned off' : 'Not sent yet'}</Text>
        {sub?.sent ? <Button kind="ghost" title="View form" onPress={() => router.push(`/pm/admin/subapps/${sub.sent?.id}` as never)} />
          : <Muted>{sub?.off ? 'Not asked for — switch it on from Admin Centre › Invites & Users.' : 'It’s on their Home screen until they send it.'}</Muted>}
      </Card>
      <SectionTitle>Tools</SectionTitle>
      <MyToolsList userId={o.id} name={o.name} />
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}
