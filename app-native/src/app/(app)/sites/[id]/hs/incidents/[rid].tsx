// One Accident / Incident / Near Miss report, read-only (690 renderIncidentView).
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { deleteIncident, useIncident } from '@/data/incidents';
import { useSite } from '@/data/sites';
import { buildIncidentPdf, emailIncidentPdf } from '@/lib/incidentPdf';
import { deliverPdf } from '@/lib/pdf';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';
import { base, space } from '@/theme/theme';

const cap = (s: unknown) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const yn = (b: unknown) => (b === true ? 'Yes' : b === false ? 'No' : '');
const when = (s: unknown) => (s ? new Date(String(s)).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export default function IncidentView() {
  const { id, rid } = useLocalSearchParams<{ id: string; rid: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: r, isLoading } = useIncident(rid);
  const { data: site } = useSite(id);
  const [pdfBusy, setPdfBusy] = useState<'pdf' | 'email' | null>(null);
  const { data: people } = usePeople();
  if (!me) return null;
  if (isLoading || !r) return <Muted style={{ padding: space.l }}>{isLoading ? 'Loading…' : 'Report not found.'}</Muted>;
  const row = (label: string, value: unknown) => (value === null || value === undefined || value === '' ? null : (
    <View key={label} style={{ marginBottom: 10 }}>
      <Muted style={{ fontWeight: '700' }}>{label}</Muted>
      <Text style={{ color: base.ink, fontSize: 14 }}>{String(value)}</Text>
    </View>
  ));
  const pics = (label: string, list: string[] | null) => (list?.length ? (
    <View style={{ marginBottom: 10 }}>
      <Muted style={{ fontWeight: '700' }}>{label}</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>{list.map((p) => <StorageImage key={p} bucket="incident-photos" path={p} style={{ width: 70, height: 70, borderRadius: 6 }} />)}</View>
    </View>
  ) : null);
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Incident Report' }} />
      <Card>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {r.riddor_reportable && <Text style={{ color: base.red, fontWeight: '700' }}>RIDDOR Reportable</Text>}
          {r.injury_occurred && <Text style={{ fontWeight: '700', color: base.ink }}>· Injury</Text>}
          {r.damage_occurred && <Text style={{ fontWeight: '700', color: base.ink }}>· Damage</Text>}
        </View>
        {row('Type', cap(String(r.incident_type || '').replace('_', ' ')))}
        {row('Site of accident / incident / near miss', r.site_address)}
        {row('Location of incident', r.location)}
        {row('Date of incident', r.incident_date ? new Date(`${r.incident_date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '')}
        {row('Operatives involved', r.operatives_involved)}
        {row('Form filed by', r.filed_by_name)}
        {row('Detail of the incident', r.detail)}
        {pics('Photo of area of incident', r.area_photo_paths)}
        {row('Date and time of incident', when(r.incident_datetime))}
        {row('Date and time incident was reported', when(r.reported_datetime))}
        {row('Reported to', r.reported_to)}
        {row('Witnesses', r.witnesses === 'na' ? 'N/A' : cap(r.witnesses))}
        {row('Witness name(s)', r.witness_names)}
        {row('Operative requires further medical treatment', yn(r.medical_treatment_required))}
        {row('Medical treatment required/advised', r.medical_treatment_detail)}
        {row('Any injuries occurred', yn(r.injury_occurred))}
        {row('Injury to who', r.injury_to)}
        {row('Description of injury', r.injury_description)}
        {row('Further medical treatment required', yn(r.injury_further_treatment))}
        {row('Damage to property/plant', yn(r.damage_occurred))}
        {row('Damage severity', cap(r.damage_severity))}
        {pics('Photo of damage', r.damage_photo_paths)}
        {row('How the incident happened', r.damage_description)}
        {row('Contributing factors', r.contributing_factors)}
        {row('Corrective action', r.corrective_action)}
        {row('Potential severity', cap(r.potential_severity))}
        {row('What could have potentially happened', r.potential_outcome)}
        {row('Probability of reoccurrence', cap(r.reoccurrence_probability))}
        {row('RIDDOR reportable', yn(r.riddor_reportable))}
        <Muted style={{ marginTop: 10 }}>Signed by {nameOf(people, r.created_by)} · {when(r.signed_at)}</Muted>
        {!!r.signature_image_path && <StorageImage bucket="signatures" path={r.signature_image_path} style={{ height: 28, width: 120, resizeMode: 'contain', marginTop: 4 }} />}
      </Card>
      {isManager(me) && <Button kind="ghost" title="Delete Report" onPress={async () => {
        if (await confirmAsk('Delete this report? This cannot be undone.', 'Delete') && await deleteIncident(me, r)) { toast('Report deleted'); void qc.invalidateQueries({ queryKey: ['incidents', id] }); router.back(); }
      }} />}
      {!!site && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: space.m }}>
          <View style={{ flex: 1 }}><Button kind="ghost" busy={pdfBusy === 'pdf'} title="Export PDF" onPress={async () => {
            setPdfBusy('pdf'); toast('Building PDF…');
            try { const b = await buildIncidentPdf(r as never, site, org, (u) => nameOf(people, u)); if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); } catch { toast('Export failed — try again.'); } finally { setPdfBusy(null); }
          }} /></View>
          <View style={{ flex: 1 }}><Button kind="ghost" busy={pdfBusy === 'email'} title="Email PDF" onPress={async () => {
            let cc: string | null = null;
            if (site.client_email && (await confirmAsk(`CC client contact${site.client_contact_name || site.client_name ? ` (${site.client_contact_name || site.client_name})` : ''} on this email?`, 'Yes, CC them'))) cc = site.client_email;
            setPdfBusy('email'); toast('Building PDF…');
            try { const b = await buildIncidentPdf(r as never, site, org, (u) => nameOf(people, u)); toast(await emailIncidentPdf(site.id, b.bytes, b.filename, cc)); } catch { toast('Email failed — try again.'); } finally { setPdfBusy(null); }
          }} /></View>
        </View>
      )}
    </ScrollView>
  );
}
