// Day works in Projects (Andy, 8 Nov 2026: "as a PM you can do everything you need and don't need to go into Finance").
// Record the day work (date, what was done, the sheet number, labour / plant / materials), attach the signed sheet, and
// take it through the client: Issued To Client → Client Approved / Rejected. Finance's register follows by itself and
// Finance puts the value on it. Managers only.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ClientChip, ClientStage } from '@/components/ClientStage';
import { FinForm } from '@/components/FinForm';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { deleteDaywork, saveDaywork, setDayworkClient, setDayworkDocs, uploadSiteDoc, useSiteDayworks, type SiteDaywork } from '@/data/dayworks';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { CLIENT_LABEL, clientCounts, type ClientStatus } from '@/lib/rules/clientStage';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const fd = (t: string | null) => (t ? new Date(`${t.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const today = () => new Date().toISOString().slice(0, 10);

export default function DayWorks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: list, isLoading } = useSiteDayworks(id);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<SiteDaywork | 'new' | null>(null);
  const [show, setShow] = useState<ClientStatus | 'all'>('all');
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['siteDayworks', id] });
  const cn = clientCounts(list || []);
  const shown = (list || []).filter((d) => show === 'all' || d.client_status === show);
  const cur = edit && edit !== 'new' ? edit : null;
  const tile = (k: ClientStatus | 'all', l: string, n: number) => (
    <Pressable key={k} accessibilityRole="button" accessibilityLabel={`${l}, ${n}`} onPress={() => setShow(show === k ? 'all' : k)}
      style={{ flexGrow: 1, flexBasis: 110, borderWidth: 1.5, borderColor: show === k ? base.ink : base.cardLine, backgroundColor: base.card, borderRadius: radius.row, padding: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: base.ink }}>{n}</Text>
      <Muted>{l}</Muted>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Day Works' }} />
      <View style={{ alignItems: 'center', marginBottom: 12 }}><Button title="+ New Day Work" onPress={() => setEdit('new')} /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {tile('to_issue', CLIENT_LABEL.to_issue, cn.to_issue)}{tile('issued', CLIENT_LABEL.issued, cn.issued)}{tile('approved', CLIENT_LABEL.approved, cn.approved)}{tile('rejected', CLIENT_LABEL.rejected, cn.rejected)}
      </View>
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((d) => {
        const isOpen = open === d.id;
        return (
          <View key={d.id}>
            <Pressable accessibilityRole="button" onPress={() => setOpen(isOpen ? null : d.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 12, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: base.ink }}>{d.title || 'Day Work'}</Text>
                <Muted>{[fd(d.work_date), d.ref ? `Sheet ${d.ref}` : ''].filter(Boolean).join(' · ')}</Muted>
              </View>
              <ClientChip status={d.client_status} />
              <Text style={{ color: base.slate }}>{isOpen ? '▼' : '▶'}</Text>
            </Pressable>
            {isOpen && (
              <Card>
                {!!d.description && <Text style={{ color: base.ink, marginBottom: 4 }}>{d.description}</Text>}
                {([['Labour', d.labour], ['Plant', d.plant], ['Materials', d.materials]] as const).filter(([, v]) => !!v).map(([l, v]) => <Muted key={l}><Text style={{ fontWeight: '600' }}>{l}:</Text> {v}</Muted>)}
                <ClientStage status={d.client_status} at={d.client_at} docs={d.docs || []}
                  onSet={async (s) => { const ok = await setDayworkClient(d.id, s); if (ok) refresh(); return ok; }}
                  onDocs={async (docs) => { const ok = await setDayworkDocs(d.id, docs); if (ok) refresh(); return ok; }}
                  upload={(a) => uploadSiteDoc(site, 'dayworks', a)} />
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                  <Button small kind="ghost" title="Edit" onPress={() => setEdit(d)} />
                  {d.client_status === 'to_issue' && <Button small kind="danger" title="Delete" onPress={async () => { if (!(await confirmAsk('Delete this day work?', 'Delete'))) return; if (await deleteDaywork(d.id)) { setOpen(null); refresh(); } else toast('Could not delete — try again.'); }} />}
                </View>
              </Card>
            )}
          </View>
        );
      }) : <Empty>{show === 'all' ? 'No day works yet.' : `None ${CLIENT_LABEL[show as ClientStatus].toLowerCase()}.`}</Empty>}
      <Muted style={{ marginTop: 10, textAlign: 'center' }}>Attach the signed sheet, then mark it Issued To Client and Client Approved. Approved day works go to Finance to be valued and put on the next application.</Muted>
      {edit && (
        <FinForm title={cur ? 'Day Work' : 'New Day Work'} saveLabel="Save" onClose={() => setEdit(null)}
          initial={cur ? { work_date: cur.work_date, title: cur.title, description: cur.description || '', ref: cur.ref || '', labour: cur.labour || '', plant: cur.plant || '', materials: cur.materials || '' } : { work_date: today(), title: '', description: '', ref: '', labour: '', plant: '', materials: '' }}
          fields={[
            { k: 'work_date', label: 'Date', kind: 'date', half: true }, { k: 'ref', label: 'Day Work Sheet No.', half: true },
            { k: 'title', label: 'Title (e.g. Clear Gutters After Storm)' }, { k: 'description', label: 'What Was Done', kind: 'multiline' },
            { k: 'labour', label: 'Labour (e.g. 2 Men, 1 Day)' }, { k: 'plant', label: 'Plant' }, { k: 'materials', label: 'Materials' },
          ]}
          onSave={async (v) => {
            if (!String(v.title || '').trim()) return 'Give it a title.';
            if (!String(v.work_date || '').trim()) return 'Choose the date.';
            const e = await saveDaywork(me, site, cur?.id || null, { work_date: String(v.work_date), title: String(v.title), description: String(v.description || ''), ref: String(v.ref || ''), labour: String(v.labour || ''), plant: String(v.plant || ''), materials: String(v.materials || '') });
            if (e) return e;
            refresh(); return null;
          }} />
      )}
    </ScrollView>
  );
}
