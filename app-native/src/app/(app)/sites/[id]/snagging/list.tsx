// Snagging (Andy, 11 Nov 2026: "change the layout to something more in line with what we have, and allow someone to be
// tagged"). Live / Closed tabs; + Add Snag (a pop-up: issue, location, photos, Tag Someone); the snags as compact rows that
// open to show their photos, who's tagged and Close Snag. Closing asks again with the fix photo shown, so it doesn't just
// upload and vanish into Closed. Exports in the footer bar. Ported from renderSnagging (500), with the Snagging Report
// PDF export / email, and photo mark-up (draw / add text on a photo before the snag is added, or on a live snag's photo).
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { viewDoc } from '@/components/DocViewer';
import { FinTabs } from '@/components/FinNav';
import { FootBar, FootButton } from '@/components/FootBar';
import { HowTo } from '@/components/HowTo';
import { MarkupEditor } from '@/components/MarkupEditor';
import { Pop } from '@/components/Pop';
import { QBox } from '@/components/QuoteForm';
import { StorageImage } from '@/components/StorageImage';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import { useSite } from '@/data/sites';
import { addSnag, closeSnag, emailSnagPdf, replaceSnagPhoto, snagPhotos, snagsForPdf, tagSnag, useSnags, type Snag } from '@/data/snags';
import { useAuth } from '@/lib/auth';
import { deliverPdf } from '@/lib/pdf';
import { pickPhotos, type Picked } from '@/lib/photos';
import { publicUrl, resolveStorageUrl } from '@/lib/privateFiles';
import { isManager } from '@/lib/roles';
import { buildSnagPdf, type SnagScope } from '@/lib/snagPdf';
import { base, page, space } from '@/theme/theme';

const d = (t: string | null) => (t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');
type Person = { id: string; name: string | null; role?: string | null };

/** Tick the people to tag. */
function TagPop({ people, start, onDone, onClose }: { people: Person[]; start: string[]; onDone: (ids: string[]) => void; onClose: () => void }) {
  const [on, setOn] = useState<string[]>(start);
  return (
    <Pop title="Tag Someone" onClose={onClose} footer={<View style={{ alignItems: 'center', marginTop: 10 }}><Button title="Done" onPress={() => onDone(on)} /></View>}>
      {people.map((p) => (
        <Pressable key={p.id} accessibilityRole="checkbox" accessibilityState={{ checked: on.includes(p.id) }} accessibilityLabel={p.name || 'Unknown'} onPress={() => setOn(on.includes(p.id) ? on.filter((x) => x !== p.id) : [...on, p.id])}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#EEF0F2' }}>
          <Text style={{ fontSize: 16, color: base.ink }}>{on.includes(p.id) ? '☑' : '☐'}</Text>
          <Text style={{ flex: 1, fontSize: 14, color: base.ink }}>{p.name || 'Unknown'}</Text>
          <Text style={{ fontSize: 12, color: base.slate }}>{p.role === 'pm' ? 'PM' : p.role === 'admin' ? 'Admin' : p.role === 'site_manager' ? 'Site Manager' : p.role === 'operative' ? 'Operative' : ''}</Text>
        </Pressable>
      ))}
    </Pop>
  );
}

export default function SnagList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const { data: snags, isLoading } = useSnags(id, filter);
  const { data: otherSnags } = useSnags(id, filter === 'open' ? 'closed' : 'open');
  const { data: people } = usePeople();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [loc, setLoc] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagFor, setTagFor] = useState<Snag | 'new' | null>(null);
  const [newPhotos, setNewPhotos] = useState<Picked[]>([]);
  const [closing, setClosing] = useState<{ s: Snag; p: Picked } | null>(null);
  const [marking, setMarking] = useState<{ src: string; done: (uri: string) => Promise<void> | void } | null>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const client = me.role === 'client';
  const mgr = isManager(me);
  const team = ((people ?? []) as Person[]).filter((p) => p.role !== 'client' && p.role !== 'driver');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['snags', id] }); void qc.invalidateQueries({ queryKey: ['snagFolder', id] }); };
  const names = (ids?: string[] | null) => (ids ?? []).map((u) => nameOf(people, u)).filter(Boolean).join(', ');

  // Close: the fix photo, then a Yes / No with it shown, before the snag closes (Andy, 11 Nov 2026).
  const close = async (s: Snag) => {
    const src = await chooseAction('Photo Of The Fix', [{ key: 'camera', label: '📷 Take A Photo' }, { key: 'library', label: '🖼 Choose From Library' }]);
    if (!src) return;
    const p = await pickPhotos(src as 'camera' | 'library', false);
    if ('error' in p) { showAlert(p.error); return; }
    if (p[0]) setClosing({ s, p: p[0] });
  };
  const doClose = async () => {
    if (!closing) return;
    const { s, p } = closing;
    setClosing(null); setBusy(s.id);
    const err = await closeSnag(me, site, s, p);
    setBusy(null);
    if (err) showAlert(err);
    refresh();
  };
  const add = async () => {
    if (!title.trim()) { toast('What’s the issue?'); return; }
    setBusy('new');
    const msg = await addSnag(me, site, title.trim(), loc.trim(), newPhotos, tags);
    setBusy(null);
    if (msg) showAlert(msg);
    if (!msg || msg.startsWith('Snag added')) { setTitle(''); setLoc(''); setNewPhotos([]); setTags([]); setAdding(false); refresh(); }
  };

  const detail = (s: Snag) => (
    <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
      {snagPhotos(s).length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {snagPhotos(s).map((p) => (
            <Pressable key={p} onPress={async () => {
              // 500 viewImage: anyone can see a snag photo full size; mark-up stays for live snags (not clients).
              const src = await resolveStorageUrl(publicUrl('site-photos', p)); if (!src) { toast('Could not open the photo — check your signal.'); return; }
              const canMark = !client && s.status !== 'closed';
              const k = canMark ? await chooseAction('Photo', [{ key: 'view', label: '🔍 View Full Size' }, { key: 'mk', label: '✏️ Mark Up (Draw / Add Text)' }]) : 'view';
              if (k === 'view') { viewDoc(src, 'photo.jpg'); return; }
              if (k !== 'mk') return;
              setMarking({ src, done: async (uri) => { setBusy(s.id); const ok = await replaceSnagPhoto(site, s, p, uri); setBusy(null); if (!ok) toast('Could not save the marked-up photo — check your connection.'); refresh(); } });
            }}><StorageImage bucket="site-photos" path={p} style={{ width: 72, height: 72, borderRadius: 8 }} /></Pressable>
          ))}
        </View>
      )}
      {!!s.pdf_path && <View style={{ alignItems: 'flex-start', marginBottom: 6 }}><Button small kind="ghost" title="📄 View Attachment" onPress={async () => { const u = await openDocLink('site-photos', s.pdf_path as string); if (u) viewDoc(u); }} /></View>}
      <Text style={{ fontSize: 12.5, color: base.slate, marginBottom: 8 }}>Tagged: <Text style={{ color: base.ink }}>{names(s.tagged) || 'Nobody'}</Text></Text>
      {s.status === 'closed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {!!s.closed_photo_path && <StorageImage zoom bucket="site-photos" path={s.closed_photo_path} style={{ width: 56, height: 56, borderRadius: 8 }} />}
          <Muted>Closed by {nameOf(people, s.closed_by)} · {d(s.closed_at)}</Muted>
        </View>
      ) : !client && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          <Button small busy={busy === s.id} title={busy === s.id ? 'Uploading…' : '📷 Close Snag'} onPress={() => void close(s)} />
          {mgr && <Button small kind="ghost" title="🏷 Tag Someone" onPress={() => setTagFor(s)} />}
        </View>
      )}
    </View>
  );

  const doExport = async () => {
    const opts = filter === 'open' ? [['live|0', 'Export Live (PDF)'], ['live|1', 'Email Live Snags']] : [['closed|0', 'Export Closed (PDF)'], ['closed|1', 'Email Closed Snags'], ['all|0', 'Export All (PDF)']];
    const k = await chooseAction('What To Export', opts.map(([key, label]) => ({ key, label })));
    if (!k) return;
    const [sc, em] = k.split('|'); const scope = sc as SnagScope, email = em === '1';
    let cc: string | null = null;
    if (email && site.client_email && (await confirmAsk(`Copy in the client contact${site.client_contact_name || site.client_name ? ` (${site.client_contact_name || site.client_name})` : ''} on this email?`, 'Yes', 'No'))) cc = site.client_email;
    setPdfBusy(k);
    try {
      const list = await snagsForPdf(site.id, scope);
      if (!list.length) { toast('No snags to export for that filter.'); return; }
      const b = await buildSnagPdf(list, site, org, scope, (u) => nameOf(people, u));
      if (email) toast(await emailSnagPdf(site.id, site.name, b.bytes, b.filename, scope === 'live' ? 'Live' : scope === 'closed' ? 'Closed' : 'All', cc));
      else if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.');
    } catch { toast('Could not build the PDF.'); } finally { setPdfBusy(null); }
  };

  const liveN = filter === 'open' ? snags?.length ?? 0 : otherSnags?.length ?? 0;
  const closedN = filter === 'closed' ? snags?.length ?? 0 : otherSnags?.length ?? 0;
  return (
    <ScrollView contentContainerStyle={[page(900), { flexGrow: 1 }]}>
      <Stack.Screen options={{ title: 'Snagging' }} />
      <HowTo k="snagging" />
      <FinTabs even items={[['open', 'Live', liveN], ['closed', 'Closed', closedN]]} value={filter} onChange={(k) => setFilter(k as 'open' | 'closed')} />
      {mgr && filter === 'open' && <View style={{ marginBottom: 10 }}><Button title="+ Add Snag" onPress={() => setAdding(true)} /></View>}
      {isLoading ? <Muted>Loading…</Muted> : snags?.length ? (
        <View style={{ backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 12, overflow: 'hidden' }}>
          {snags.map((s, i) => {
            const open = expanded.has(s.id);
            const ph = snagPhotos(s)[0];
            return (
              <View key={s.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: '#EEF0F2' }}>
                <Pressable accessibilityRole="button" accessibilityLabel={s.title} onPress={() => { const n = new Set(expanded); if (open) n.delete(s.id); else n.add(s.id); setExpanded(n); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10 }}>
                  {ph ? <StorageImage bucket="site-photos" path={ph} style={{ width: 40, height: 40, borderRadius: 6 }} /> : <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: '#F1F2F4', alignItems: 'center', justifyContent: 'center' }}><Text>🔧</Text></View>}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '600', color: base.ink }}>{s.title}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 11.5, color: base.slate }}>{[s.location || 'No location', s.status === 'closed' ? `Closed ${d(s.closed_at)}` : `Raised ${d(s.created_at)}`, s.tagged?.length ? `🏷 ${names(s.tagged)}` : ''].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Text style={{ color: base.slate, fontSize: 12 }}>{open ? '▴' : '▾'}</Text>
                </Pressable>
                {open && detail(s)}
              </View>
            );
          })}
        </View>
      ) : <Empty>No {filter === 'open' ? 'live' : 'closed'} snags.</Empty>}

      <View style={{ flexGrow: 1 }} />
      <FootBar left={`${snags?.length ?? 0} ${filter === 'open' ? 'Live' : 'Closed'} Snag${(snags?.length ?? 0) === 1 ? '' : 's'}`} right={<FootButton label={pdfBusy ? 'Making…' : '⬇ Export ▾'} a11y="Export snags" onPress={() => void doExport()} />} />

      {adding && (
        <Pop title="Add Snag" onClose={() => setAdding(false)} footer={<View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}><Button busy={busy === 'new'} title="Add Snag" onPress={() => void add()} /><Button kind="ghost" title="Cancel" onPress={() => setAdding(false)} /></View>}>
          <QBox label="Issue *" value={title} onChangeText={setTitle} />
          <QBox label="Location" value={loc} onChangeText={setLoc} />
          {newPhotos.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {newPhotos.map((p, i) => (
                <Pressable key={p.uri} onPress={async () => {
                  const k = await chooseAction('Photo', [{ key: 'mk', label: '✏️ Mark Up (Draw / Add Text)' }, { key: 'rm', label: '🗑 Remove', danger: true }]);
                  if (k === 'rm') setNewPhotos(newPhotos.filter((_, j) => j !== i));
                  else if (k === 'mk') setMarking({ src: p.uri, done: (uri) => setNewPhotos((all) => all.map((x) => (x.uri === p.uri ? { ...x, uri } : x))) });
                }}>
                  <Image source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />
                </Pressable>
              ))}
            </View>
          )}
          <Text style={{ fontSize: 12.5, color: base.slate, marginBottom: 8 }}>Tagged: <Text style={{ color: base.ink }}>{names(tags) || 'Nobody'}</Text></Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            <Button small kind="ghost" title="📷 Add Photos" onPress={async () => { const p = await pickPhotos('library'); if ('error' in p) showAlert(p.error); else setNewPhotos([...newPhotos, ...p]); }} />
            <Button small kind="ghost" title="🏷 Tag Someone" onPress={() => setTagFor('new')} />
          </View>
        </Pop>
      )}
      {tagFor && <TagPop people={team} start={tagFor === 'new' ? tags : tagFor.tagged ?? []} onClose={() => setTagFor(null)} onDone={async (ids) => {
        const t = tagFor; setTagFor(null);
        if (t === 'new') { setTags(ids); return; }
        if (!(await tagSnag(me, site, t, ids))) toast('Could not save — try again.'); refresh();
      }} />}
      {closing && (
        <Pop title="Close This Snag?" onClose={() => setClosing(null)} footer={<View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}><Button title="Yes, Close It" onPress={() => void doClose()} /><Button kind="ghost" title="No" onPress={() => setClosing(null)} /></View>}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: base.ink, marginBottom: 8 }}>{closing.s.title}{closing.s.location ? ` · ${closing.s.location}` : ''}</Text>
          <Image source={{ uri: closing.p.uri }} style={{ width: '100%', height: 220, borderRadius: 10, backgroundColor: '#F1F2F4' }} resizeMode="contain" />
          <Muted style={{ marginTop: 8, textAlign: 'center' }}>This photo of the fix goes on the snag, and it moves to Closed.</Muted>
        </Pop>
      )}
      {marking && <MarkupEditor photo src={marking.src} onClose={(out) => { const m = marking; setMarking(null); if (out) void m.done(out.image); }} />}
    </ScrollView>
  );
}
