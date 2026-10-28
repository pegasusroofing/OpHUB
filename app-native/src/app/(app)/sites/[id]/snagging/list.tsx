// Snagging list: Live / Closed, photos, close with a "fixed" photo; managers can add.
// Ported from renderSnagging (500). Photo mark-up and PDF export/email come later.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Field, Muted, SectionTitle } from '@/components/ui';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { useSite } from '@/data/sites';
import { addSnag, closeSnag, snagPhotos, useSnags, type Snag } from '@/data/snags';
import { useAuth } from '@/lib/auth';
import { pickPhotos, type Picked } from '@/lib/photos';
import { isManager } from '@/lib/roles';
import { base, radius, space } from '@/theme/theme';

const d = (t: string | null) => (t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');

export default function SnagList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const { data: snags, isLoading } = useSnags(id, filter);
  const { data: people } = usePeople();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [loc, setLoc] = useState('');
  const [newPhotos, setNewPhotos] = useState<Picked[]>([]);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const client = me.role === 'client';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['snags', id] }); void qc.invalidateQueries({ queryKey: ['snagFolder', id] }); };

  const close = async (s: Snag) => {
    const p = await pickPhotos('camera', false);
    if ('error' in p) { showAlert(p.error); return; }
    if (!p[0]) return;
    setBusy(s.id);
    toast(await closeSnag(me, site, s, p[0]));
    setBusy(null); refresh();
  };
  const add = async () => {
    if (!title.trim()) return;
    setBusy('new');
    toast(await addSnag(me, site, title.trim(), loc.trim(), newPhotos));
    setBusy(null); setTitle(''); setLoc(''); setNewPhotos([]); refresh();
  };

  const body = (s: Snag) => (
    <View>
      {snagPhotos(s).length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {snagPhotos(s).map((p) => <StorageImage key={p} bucket="site-photos" path={p} style={{ width: 72, height: 72, borderRadius: 8 }} />)}
        </View>
      )}
      {!!s.pdf_path && (
        <Button kind="ghost" title="📄 View attachment" onPress={async () => { const u = await openDocLink('site-photos', s.pdf_path as string); if (u) void Linking.openURL(u); }} />
      )}
      {s.status === 'closed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
          {!!s.closed_photo_path && <StorageImage bucket="site-photos" path={s.closed_photo_path} style={{ width: 56, height: 56, borderRadius: 8 }} />}
          <Muted>Closed by {nameOf(people, s.closed_by)} · {d(s.closed_at)}</Muted>
        </View>
      ) : !client && (
        <Button kind="ghost" busy={busy === s.id} title={busy === s.id ? 'Uploading…' : '📷 Close snag (photo of the fix)'} onPress={() => close(s)} />
      )}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Stack.Screen options={{ title: 'Snagging' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {([['open', 'Live'], ['closed', 'Closed']] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: filter === k ? base.ink : base.line, backgroundColor: filter === k ? base.ink : base.card }}>
            <Text style={{ fontWeight: '700', color: filter === k ? '#fff' : base.ink }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? <Muted>Loading…</Muted> : snags?.length ? snags.map((s) => {
        if (s.status !== 'closed') {
          return (
            <Card key={s.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: base.ink }}>{s.title}</Text><Muted>{s.location || '—'}</Muted></View>
                <Text style={{ fontSize: 11, fontWeight: '800', color: base.warn, backgroundColor: base.warnBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' }}>{s.status}</Text>
              </View>
              {body(s)}
            </Card>
          );
        }
        const open = expanded.has(s.id);
        return (
          <View key={s.id}>
            <Pressable onPress={() => { const n = new Set(expanded); if (open) n.delete(s.id); else n.add(s.id); setExpanded(n); }}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: radius.row, padding: 12, marginBottom: 8 }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: base.ink }}>{s.title}</Text><Muted>{s.location || '—'} · Closed {d(s.closed_at)}</Muted></View>
              <Text style={{ color: base.slate }}>{open ? '▼' : '▶'}</Text>
            </Pressable>
            {open && <Card>{body(s)}</Card>}
          </View>
        );
      }) : <Empty>No {filter === 'open' ? 'live' : 'closed'} snags.</Empty>}

      {isManager(me) && filter === 'open' && (
        <Card style={{ marginTop: 14 }}>
          <SectionTitle>Add snag</SectionTitle>
          <Field label="Issue" value={title} onChangeText={setTitle} />
          <Field label="Location" value={loc} onChangeText={setLoc} />
          {newPhotos.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {newPhotos.map((p, i) => (
                <Pressable key={p.uri} onPress={() => setNewPhotos(newPhotos.filter((_, j) => j !== i))}>
                  <Image source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />
                </Pressable>
              ))}
            </View>
          )}
          <Button kind="ghost" title="📷 Take a photo or choose from library" onPress={async () => {
            const p = await pickPhotos('library');
            if ('error' in p) showAlert(p.error); else setNewPhotos([...newPhotos, ...p]);
          }} />
          <Button busy={busy === 'new'} title="Add Snag" onPress={add} />
        </Card>
      )}
      <Muted style={{ marginTop: space.m }}>Export and email of the snag list come with the PM screens.</Muted>
    </ScrollView>
  );
}
