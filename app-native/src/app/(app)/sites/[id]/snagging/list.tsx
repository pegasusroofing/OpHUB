// Snagging list: Live / Closed, photos, close with a "fixed" photo; managers can add.
// Ported from renderSnagging (500), with the Snagging Report PDF export / email, and photo mark-up (draw / add text on a
// photo before the snag is added, or on a live snag's photo — the marked copy replaces it).
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { MarkupEditor } from '@/components/MarkupEditor';
import { StorageImage } from '@/components/StorageImage';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Field, Muted, SectionTitle } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { viewDoc } from '@/components/DocViewer';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { useSite } from '@/data/sites';
import { addSnag, closeSnag, emailSnagPdf, replaceSnagPhoto, snagPhotos, snagsForPdf, useSnags, type Snag } from '@/data/snags';
import { useAuth } from '@/lib/auth';
import { deliverPdf } from '@/lib/pdf';
import { pickPhotos, type Picked } from '@/lib/photos';
import { buildSnagPdf, type SnagScope } from '@/lib/snagPdf';
import { publicUrl, resolveStorageUrl } from '@/lib/privateFiles';
import { isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const d = (t: string | null) => (t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');

export default function SnagList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const { data: snags, isLoading } = useSnags(id, filter);
  const { data: people } = usePeople();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [loc, setLoc] = useState('');
  const [newPhotos, setNewPhotos] = useState<Picked[]>([]);
  const [marking, setMarking] = useState<{ src: string; done: (uri: string) => Promise<void> | void } | null>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const client = me.role === 'client';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['snags', id] }); void qc.invalidateQueries({ queryKey: ['snagFolder', id] }); };

  const close = async (s: Snag) => {
    // 520: the fix photo from the camera or one already taken.
    const src = await chooseAction('Photo of the fix', [{ key: 'camera', label: '📷 Take a photo' }, { key: 'library', label: '🖼 Choose from library' }]);
    if (!src) return;
    const p = await pickPhotos(src as 'camera' | 'library', false);
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
          {snagPhotos(s).map((p) => (
            <Pressable key={p} disabled={client || s.status === 'closed'} onPress={async () => {
              if ((await chooseAction('Photo', [{ key: 'mk', label: '✏️ Mark up (draw / add text)' }])) !== 'mk') return;
              const src = await resolveStorageUrl(publicUrl('site-photos', p)); if (!src) { toast('Could not open the photo — check your signal.'); return; }
              setMarking({ src, done: async (uri) => { setBusy(s.id); const ok = await replaceSnagPhoto(site, s, p, uri); setBusy(null); toast(ok ? '✓ Photo marked up' : 'Could not save the marked-up photo — check your connection.'); refresh(); } });
            }}><StorageImage bucket="site-photos" path={p} style={{ width: 72, height: 72, borderRadius: 8 }} /></Pressable>
          ))}
        </View>
      )}
      {!!s.pdf_path && (
        <Button kind="ghost" title="📄 View attachment" onPress={async () => { const u = await openDocLink('site-photos', s.pdf_path as string); if (u) viewDoc(u); }} />
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
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Snagging' }} />
      <HowTo k="snagging" />
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
                <Pressable key={p.uri} onPress={async () => {
                  const k = await chooseAction('Photo', [{ key: 'mk', label: '✏️ Mark up (draw / add text)' }, { key: 'rm', label: '🗑 Remove', danger: true }]);
                  if (k === 'rm') setNewPhotos(newPhotos.filter((_, j) => j !== i));
                  else if (k === 'mk') setMarking({ src: p.uri, done: (uri) => setNewPhotos((all) => all.map((x) => (x.uri === p.uri ? { ...x, uri } : x))) });
                }}>
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
      {marking && <MarkupEditor photo src={marking.src} onClose={(out) => { const m = marking; setMarking(null); if (out) void m.done(out.image); }} />}
      <SectionTitle>Export</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {(filter === 'open' ? [['live', 'Export Live', false], ['live', 'Email Live Snags', true]] : [['closed', 'Export Closed', false], ['closed', 'Email Closed', true], ['all', 'Export All', false]]).map(([sc, label, email]) => (
          <View key={label as string} style={{ flex: 1, minWidth: 100 }}><Button kind="ghost" busy={pdfBusy === label} title={label as string} onPress={async () => {
            const scope = sc as SnagScope;
            let cc: string | null = null;
            if (email && site.client_email && (await confirmAsk(`CC client contact${site.client_contact_name || site.client_name ? ` (${site.client_contact_name || site.client_name})` : ''} on this email?`, 'Yes, CC them'))) cc = site.client_email;
            setPdfBusy(label as string);
            try {
              const list = await snagsForPdf(site.id, scope);
              if (!list.length) { toast('No snags to export for that filter.'); return; }
              toast('Building PDF…');
              const b = await buildSnagPdf(list, site, org, scope, (u) => nameOf(people, u));
              if (email) toast(await emailSnagPdf(site.id, site.name, b.bytes, b.filename, scope === 'live' ? 'Live' : scope === 'closed' ? 'Closed' : 'All', cc));
              else if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.');
            } catch { toast('Could not build the PDF.'); } finally { setPdfBusy(null); }
          }} /></View>
        ))}
      </View>
    </ScrollView>
  );
}
