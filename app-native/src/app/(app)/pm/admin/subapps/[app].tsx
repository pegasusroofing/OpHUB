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
import { subSignUpLink } from '@/data/admin';
import { approveIntoLibrary } from '@/data/subcontractors';
import { openDocLink } from '@/data/hs';
import { useSubformTemplate } from '@/data/subform';
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
type App = { id: string; company_name: string; contact_name: string; email: string; phone: string | null; status: string; created_at: string; signed_name: string | null; reviewed_at: string | null; reviewed_by: string | null; review_note: string | null; user_id?: string | null; data: Record<string, unknown> | null; files: { label?: string; name?: string; path: string; bucket?: string }[] | null };

export default function SubApp() {
  const { app: id } = useLocalSearchParams<{ app: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: team = [] } = useTeam(me?.org_id);
  // Answers labelled as the company's form asks them, so new questions show too (19 Nov 2026: the form can be edited).
  const { data: tpl } = useSubformTemplate(me?.org_id);
  const { data: r, isLoading } = useQuery({ queryKey: ['subApp', id], enabled: !!id, queryFn: async () => ((await db.from('subcontractor_applications').select('*').eq('id', id).maybeSingle()).data as App | null) });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!r) return <Muted style={{ padding: space.l }}>That application has gone.</Muted>;
  const d = r.data || {};
  const label: Record<string, string> = { ...LABELS };
  (tpl?.sections ?? []).forEach((sc) => sc.q.forEach((q) => { if (q.k && q.type !== 'file') label[q.k] = q.l; }));
  const keys = [...new Set([...(tpl?.sections ?? []).flatMap((sc) => sc.q.map((q) => q.k || '')), ...Object.keys(LABELS), ...Object.keys(d)])]
    .filter((k) => k && !['company_name', 'contact_name', 'email'].includes(k) && d[k] != null && subAppValue(d[k]).trim() !== '');
  const st = ({ new: 'New', approved: 'Approved', rejected: 'Sent Back' } as Record<string, string>)[r.status] || r.status;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['subApp', id] }); void qc.invalidateQueries({ queryKey: ['subApps'] }); };
  // Sent back for more information (Andy, 18 Nov 2026: "if it's rejected for missing info sort a process for this"): what's
  // missing has to be said. An operative who sent it from the app gets a message with it, their form opens again with
  // their answers and the note, and sending it again makes a New application. One sent from the public link gets an
  // email from you (Email Them What's Missing), with the form's link.
  const decide = async (status: 'approved' | 'rejected') => {
    const note = await promptText(status === 'approved' ? 'Approve — add a note (optional)' : 'What’s missing or needs changing? They’ll see this.', ''); if (note === null) return;
    if (status === 'rejected' && !note.trim()) { toast('Say what’s missing, so they know what to fix.'); return; }
    if (status === 'rejected' && r.user_id) {
      // A message to them (operatives can't see the office's to-dos); their form and Getting Started show it too.
      await db.from('messages').insert({ org_id: me.org_id, site_id: null, sender_id: me.id, audience: 'single', recipient_id: r.user_id, kind: 'message', body: `Your Subcontractor Form was sent back: ${note.trim()} — open it (Settings › Getting Started, or Subcontractor Form), update it and send it again.` } as never);
    }
    if (!(await db.from('subcontractor_applications').update({ status, reviewed_by: me.id, reviewed_at: new Date().toISOString(), review_note: note.trim() || null } as never).eq('id', r.id).select('id')).data?.length) { toast('Could not save — try again.'); return; }
    // Approving sets the company up (Andy, 20 Nov 2026): its Company Library entry, with their documents and insurance dates,
    // ready to add to a job (Main Contractor › Subcontractors › + Add Subcontractor).
    if (status === 'approved') {
      const lib = await approveIntoLibrary(me, r);
      if (!lib.id) toast('Approved, but the Company Library entry couldn’t be made — try Approve again.');
      else toast(`${r.company_name} is in the Company Library${lib.added ? ` with ${lib.added} document${lib.added === 1 ? '' : 's'}` : ''}.${lib.failed.length ? ` These couldn’t be copied: ${lib.failed.join(', ')}.` : ''}`, { confirm: true });
      void qc.invalidateQueries({ queryKey: ['subLibrary'] });
    }
    refresh();
  };
  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: r.company_name }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontWeight: '600', fontSize: 16, color: base.ink }}>{r.company_name}</Text>
          <Text style={{ fontWeight: '600', color: r.status === 'approved' ? base.ok : r.status === 'rejected' ? base.slate : base.warn }}>{st}</Text>
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
        {keys.map((k) => (
          <View key={k} style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: base.line }}>
            <Text style={{ fontWeight: '600', color: base.ink, fontSize: 12.5 }}>{label[k] || 'Other Answer'}</Text>
            <Text style={{ color: base.ink }}>{subAppValue(d[k])}</Text>
          </View>
        ))}
        {!keys.length && <Empty>No other details.</Empty>}
      </Card>
      <Card>
        <SectionTitle>Documents ({(r.files || []).length})</SectionTitle>
        {(r.files || []).length ? (r.files || []).map((f, i) => (
          <Pressable key={i} onPress={async () => {
            const u = await openDocLink(f.bucket === 'subcontractor-apps' ? 'subcontractor-apps' : 'mc-documents', f.path);
            if (u) viewDoc(u); else toast('Could not open that document.');
          }} style={{ paddingVertical: 6 }}>
            <Text style={{ color: base.ink }}>📎 <Text style={{ fontWeight: '600' }}>{f.label || 'Document'}</Text>  <Muted>{f.name || ''}</Muted></Text>
          </Pressable>
        )) : <Empty>None uploaded.</Empty>}
      </Card>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {r.status !== 'approved' && <View style={{ flex: 1 }}><Button title="✓ Approve" onPress={() => void decide('approved')} /></View>}
        {r.status !== 'rejected' && <View style={{ flex: 1 }}><Button kind="ghost" title="Send Back For More Info" onPress={() => void decide('rejected')} /></View>}
      </View>
      {r.status === 'rejected' && !r.user_id && !!r.email && (
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <Button kind="ghost" title="Email Them What’s Missing" onPress={() => {
            const body = `Hello ${r.contact_name || ''},

Thank you for your subcontractor sign-up. We need a little more before we can approve it:

${r.review_note || ''}

Please fill the form in again here:
${subSignUpLink(me.org_id as string)}

Thanks`;
            void Linking.openURL(`mailto:${r.email}?subject=${encodeURIComponent('Your subcontractor sign-up — more information needed')}&body=${encodeURIComponent(body)}`);
          }} />
        </View>
      )}
      {isFullManager(me) && <Button kind="ghost" title="🗑 Delete application" onPress={async () => {
        if (!(await confirmAsk("Delete this application? This can't be undone.", 'Delete'))) return;
        if (!!(await db.from('subcontractor_applications').delete().eq('id', r.id).select('id')).data?.length) { toast('Deleted'); void qc.invalidateQueries({ queryKey: ['subApps'] }); router.back(); } else toast('Could not delete — try again.');
      }} />}
    </ScrollView>
  );
}
