// Permits To Work for a job (520 renderPermits): Open / Closed, and managers
// issue a permit — type, contractor, who must sign (required), description, date —
// signed with the issuer's adopted signature.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { issuePermit, PERMIT_ICON, PERMIT_LABEL, permitRoster, usePermits } from '@/data/mc';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { fullSiteAddress } from '@/lib/rules/checkin';
import { localISODate } from '@/lib/rules/driver';
import { readIsoDate } from '@/lib/rules/materials';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card }}><Text style={{ fontWeight: '700', color: on ? '#fff' : base.ink }}>{label}</Text></Pressable>;
}

export default function Permits() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const { data, isLoading } = usePermits(id, tab);
  const [issuing, setIssuing] = useState(false);
  const [type, setType] = useState('hot_works');
  const [co, setCo] = useState<string | null>(null);
  const [who, setWho] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState(localISODate(new Date()));
  const [busy, setBusy] = useState(false);
  const { data: roster } = useQuery({ queryKey: ['permitRoster', id, co], enabled: issuing, queryFn: () => permitRoster(id, co) });
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const mgr = isManager(me);
  const names = Object.fromEntries((data?.companies ?? []).map((c) => [c.id, c.name]));
  const shown = (roster ?? []).filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const sig = (me as { signature_path?: string | null }).signature_path;

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Permits To Work' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip on={tab === 'open'} label="Open" onPress={() => { setTab('open'); setIssuing(false); }} />
        <Chip on={tab === 'closed'} label="Closed" onPress={() => { setTab('closed'); setIssuing(false); }} />
      </View>
      {isLoading ? <Muted>Loading…</Muted> : data?.permits.length ? data.permits.map((p) => (
        <Pressable key={p.id} onPress={() => router.push(`/sites/${id}/mc/permits/${p.id}` as never)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, marginBottom: 8, backgroundColor: base.card }}>
          <Text style={{ fontSize: 20 }}>{PERMIT_ICON[p.permit_type] || '🧾'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: base.ink }}>{PERMIT_LABEL[p.permit_type] || p.permit_type}</Text>
            <Muted>{p.description || ''}{p.subcontractor_company_id ? ` · ${names[p.subcontractor_company_id] || 'Subcontractor'}` : ''}</Muted>
          </View>
          <Text style={{ fontWeight: '700', color: p.status === 'open' ? base.warn : base.ok }}>{p.status}</Text>
        </Pressable>
      )) : <Empty>No {tab} permits.</Empty>}

      {mgr && tab === 'open' && (issuing ? (
        <Card style={{ marginTop: 14 }}>
          <SectionTitle>Issue a permit</SectionTitle>
          <Muted style={{ fontWeight: '700' }}>Permit type</Muted>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>
            {Object.keys(PERMIT_LABEL).map((k) => <Chip key={k} on={type === k} label={`${PERMIT_ICON[k]} ${PERMIT_LABEL[k]}`} onPress={() => setType(k)} />)}
          </View>
          {!!data?.companies.length && (
            <>
              <Muted style={{ fontWeight: '700' }}>Contractor</Muted>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>
                <Chip on={!co} label="RTB (no subcontractor)" onPress={() => { setCo(null); setWho(new Set()); }} />
                {data.companies.map((c) => <Chip key={c.id} on={co === c.id} label={c.name} onPress={() => { setCo(c.id); setWho(new Set()); }} />)}
              </View>
            </>
          )}
          <Muted style={{ fontWeight: '700' }}>Who needs to sign this permit? (required)</Muted>
          <TextInput value={q} onChangeText={setQ} placeholder="Filter by name…" style={[box, { marginTop: 6 }]} />
          {shown.length ? shown.map((p) => (
            <Pressable key={p.id} onPress={() => { const n = new Set(who); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); setWho(n); }}>
              <Text style={{ paddingVertical: 5, color: base.ink }}>{who.has(p.id) ? '☑' : '☐'} {p.name}</Text>
            </Pressable>
          )) : <Muted>{q ? `No operatives match "${q}".` : 'No operatives available to pick from yet.'}</Muted>}
          <Muted style={{ fontWeight: '700', marginTop: 8 }}>Description of works</Muted>
          <TextInput value={desc} onChangeText={setDesc} placeholder="e.g. Hot works to re-felt the plant room roof" style={box} />
          <Muted style={{ fontWeight: '700' }}>Location</Muted>
          <Text style={[box, { backgroundColor: base.paper }]}>{fullSiteAddress(site)}</Text>
          <Muted style={{ fontWeight: '700' }}>Date (YYYY-MM-DD)</Muted>
          <TextInput value={date} onChangeText={setDate} autoCapitalize="none" style={box} />
          {!sig && <Pressable onPress={() => router.push('/signature')}><Text style={{ color: base.warn, marginBottom: 8 }}>You haven't adopted a signature yet — tap to set one up before issuing.</Text></Pressable>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setIssuing(false)} /></View>
            <View style={{ flex: 1 }}><Button busy={busy} title="Issue Permit" onPress={async () => {
              if (!sig) { toast('Adopt your signature first.'); router.push('/signature'); return; }
              if (!desc.trim()) { toast('Add a description of the works.'); return; }
              if (!who.size) { toast('Select at least one employee to sign this permit.'); return; }
              const d = readIsoDate(date); if (d === 'bad') { toast('Enter the date as YYYY-MM-DD.'); return; }
              setBusy(true);
              const ok = await issuePermit(me, site, { type, companyId: co, assignees: [...who], description: desc.trim(), date: d, location: fullSiteAddress(site) || '' });
              setBusy(false);
              if (!ok) { toast('Could not issue — try again.'); return; }
              toast('Permit issued'); setIssuing(false); setDesc(''); setWho(new Set()); setCo(null); setQ('');
              void qc.invalidateQueries({ queryKey: ['permits', id] }); void qc.invalidateQueries({ queryKey: ['mcTiles', id] });
            }} /></View>
          </View>
        </Card>
      ) : <Button kind="ghost" title="+ Issue Permit" onPress={() => setIssuing(true)} />)}
    </ScrollView>
  );
}
