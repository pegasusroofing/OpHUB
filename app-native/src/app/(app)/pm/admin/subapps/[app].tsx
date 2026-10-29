// One subcontractor application (866 renderSubApplication): contact, every
// answer, documents (private bucket, opened by a short-lived link), approve /
// reject with a note, delete (PMs and admins).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { useTeam } from '@/data/admin';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { isFullManager, isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

import { subAppValue } from './index';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const LABELS: Record<string, string> = {
  trading_name: 'Trading name', company_type: 'Business type', company_number: 'Company number', vat_number: 'VAT number', utr: 'UTR', cis_status: 'CIS status',
  address: 'Address', postcode: 'Postcode', contact_role: 'Position', phone: 'Phone', office_phone: 'Office phone', website_url: 'Website',
  trades: 'Trades', other_trade: 'Other trade', areas: 'Areas covered', team_size: 'Operatives available', own_access: 'Own access equipment', plant: 'Plant / equipment',
  pl_cover: 'Public liability cover', pl_expiry: 'PL expiry', el_cover: 'Employers liability cover', el_expiry: 'EL expiry', pi_cover: 'Professional indemnity', car_cover: 'Contract works cover',
  accreditations: 'Accreditations', other_accreditation: 'Other accreditation', hs_policy: 'Written H&S policy', rams_ability: 'Writes own RAMS', competent_person: 'H&S competent person',
  riddor: 'RIDDOR incidents (3 yrs)', riddor_detail: 'RIDDOR detail', enforcement: 'HSE notices (3 yrs)', enforcement_detail: 'Notices detail',
  operatives: 'Operatives', ref1: 'Reference 1', ref2: 'Reference 2', bank_note: 'Payment terms', notes: 'Anything else',
};
type App = { id: string; company_name: string; contact_name: string; email: string; phone: string | null; status: string; created_at: string; signed_name: string | null; reviewed_at: string | null; reviewed_by: string | null; review_note: string | null; data: Record<string, unknown> | null; files: { label?: string; name?: string; path: string; bucket?: string }[] | null };

export default function SubApp() {
  const { app: id } = useLocalSearchParams<{ app: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: team = [] } = useTeam(me?.org_id);
  const { data: r, isLoading } = useQuery({ queryKey: ['subApp', id], enabled: !!id, queryFn: async () => ((await db.from('subcontractor_applications').select('*').eq('id', id).maybeSingle()).data as App | null) });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!r) return <Muted style={{ padding: space.l }}>That application has gone.</Muted>;
  const d = r.data || {};
  const st = ({ new: 'New', approved: 'Approved', rejected: 'Rejected' } as Record<string, string>)[r.status] || r.status;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['subApp', id] }); void qc.invalidateQueries({ queryKey: ['subApps'] }); };
  const decide = async (status: 'approved' | 'rejected') => {
    const note = await promptText(status === 'approved' ? 'Approve — add a note (optional)' : 'Reject — reason (optional)', ''); if (note === null) return;
    toast((await db.from('subcontractor_applications').update({ status, reviewed_by: me.id, reviewed_at: new Date().toISOString(), review_note: note.trim() || null } as never).eq('id', r.id)).error ? 'Could not save — try again.' : status === 'approved' ? 'Approved' : 'Rejected');
    refresh();
  };
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: r.company_name }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontWeight: '800', fontSize: 16, color: base.ink }}>{r.company_name}</Text>
          <Text style={{ fontWeight: '700', color: r.status === 'approved' ? base.ok : r.status === 'rejected' ? base.slate : base.warn }}>{st}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          <Muted>{r.contact_name} ·</Muted>
          <Pressable onPress={() => void Linking.openURL(`mailto:${r.email}`)}><Text style={{ color: base.blue }}>{r.email}</Text></Pressable>
          {!!r.phone && <Pressable onPress={() => void Linking.openURL(`tel:${r.phone}`)}><Text style={{ color: base.blue }}>{r.phone}</Text></Pressable>}
        </View>
        <Muted>Sent {new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · signed by {r.signed_name || ''}</Muted>
        {!!r.reviewed_at && <Muted>{st} by {team.find((p) => p.id === r.reviewed_by)?.name || ''} {new Date(r.reviewed_at).toLocaleDateString('en-GB')}{r.review_note ? ` — ${r.review_note}` : ''}</Muted>}
      </Card>
      <Card>
        {Object.keys(LABELS).filter((k) => d[k] != null && subAppValue(d[k]).trim() !== '').map((k) => (
          <View key={k} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: base.line }}>
            <Text style={{ fontWeight: '700', color: base.ink, fontSize: 12.5 }}>{LABELS[k]}</Text>
            <Text style={{ color: base.ink }}>{subAppValue(d[k])}</Text>
          </View>
        ))}
        {!Object.keys(LABELS).some((k) => d[k] != null && subAppValue(d[k]).trim() !== '') && <Empty>No other details.</Empty>}
      </Card>
      <Card>
        <SectionTitle>Documents ({(r.files || []).length})</SectionTitle>
        {(r.files || []).length ? (r.files || []).map((f, i) => (
          <Pressable key={i} onPress={async () => {
            const u = await openDocLink(f.bucket === 'subcontractor-apps' ? 'subcontractor-apps' : 'mc-documents', f.path);
            if (u) viewDoc(u); else toast('Could not open that document.');
          }} style={{ paddingVertical: 6 }}>
            <Text style={{ color: base.ink }}>📎 <Text style={{ fontWeight: '700' }}>{f.label || 'Document'}</Text>  <Muted>{f.name || ''}</Muted></Text>
          </Pressable>
        )) : <Empty>None uploaded.</Empty>}
      </Card>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {r.status !== 'approved' && <View style={{ flex: 1 }}><Button title="✓ Approve" onPress={() => void decide('approved')} /></View>}
        {r.status !== 'rejected' && <View style={{ flex: 1 }}><Button kind="ghost" title="Reject" onPress={() => void decide('rejected')} /></View>}
      </View>
      {isFullManager(me) && <Button kind="ghost" title="🗑 Delete application" onPress={async () => {
        if (!(await confirmAsk("Delete this application? This can't be undone.", 'Delete'))) return;
        if (!(await db.from('subcontractor_applications').delete().eq('id', r.id)).error) { toast('Deleted'); void qc.invalidateQueries({ queryKey: ['subApps'] }); router.back(); } else toast('Could not delete — try again.');
      }} />}
    </ScrollView>
  );
}
