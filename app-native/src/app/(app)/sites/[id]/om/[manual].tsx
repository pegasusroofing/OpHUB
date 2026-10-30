// One O&M manual (857 renderHandover): the cover, what goes in the back, and
// every section — text, tables (add / remove rows and columns), the Materials
// Log, maintenance procedures per roof system, photos — each can be renamed,
// moved or deleted, and new ones added. Saves as you go. Export the PDF (with
// the data sheets, guarantees, COSHH, drawings and appendix attached behind it)
// or email it. The Scope of Works has to be filled in first. Files can be attached to any table row,
// products picked from the COSHH Library go into the Materials Log with their data sheet and
// assessment, and documents / COSHH added to the job since the manual was started come in on opening.
// Or a Word file to carry on editing.
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { StorageImage } from '@/components/StorageImage';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Check, Muted, SectionTitle } from '@/components/ui';
import { DateBox } from '@/components/DateField';
import { nameOf, openDocLink, usePeople } from '@/data/hs';
import * as DocumentPicker from 'expo-document-picker';
import { assessMap, loadProducts } from '@/data/coshhLib';
import { jobPhotos, loadManual, saveManual, uploadRowFile } from '@/data/omManual';
import { viewDoc } from '@/components/DocViewer';
import { Popup, PopupButtons } from '@/components/Popup';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { buildOmPdf } from '@/lib/omPdf';
import { buildOmWord, deliverDocx } from '@/lib/omWord';
import { deliverPdf, emailPdf } from '@/lib/pdf';
import { addOmProducts, HO_MAINT, omUid, scopeEmpty, type OmData, type OmPhoto, type OmSection } from '@/lib/rules/omManual';
import { compressOne, pickPhotos } from '@/lib/photos';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Organization, Profile, Site } from '@/lib/types';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 8, color: base.ink, backgroundColor: base.card, marginBottom: 6 };
const small = { color: base.blue, fontWeight: '700' as const, paddingHorizontal: 6 };

export default function OmManual() {
  const { id, manual } = useLocalSearchParams<{ id: string; manual: string }>();
  const { me, org } = useAuth();
  const { data: site } = useSite(id);
  const { data, isLoading } = useQuery({ queryKey: ['omManual', manual], enabled: !!me && !!site, gcTime: 0, queryFn: () => loadManual(me as Profile, org, site as Site, manual) });
  if (!me || !site || isLoading) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  if (!data) return <Muted style={{ padding: space.l }}>Manual not found.</Muted>;
  return <Editor key={manual} me={me} org={org} site={site} manualId={manual} name0={data.name} data0={data.data} />;
}

function Editor({ me, org, site, manualId, name0, data0 }: { me: Profile; org: Organization | null; site: Site; manualId: string; name0: string; data0: OmData }) {
  const toast = useToast();
  const { data: people } = usePeople();
  const [d, setD] = useState<OmData>(data0);
  const [name, setName] = useState(name0);
  const [status, setStatus] = useState('');
  const [picker, setPicker] = useState<null | { sec: string | null }>(null);
  const [libFor, setLibFor] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState('');
  const attachRow = async (sid: string, ri: number) => {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true }); if (r.canceled || !r.assets.length) return;
    const got: { bucket: string; path: string; name: string }[] = [];
    for (let i = 0; i < r.assets.length; i++) { setBusyRow(`Uploading ${i + 1} of ${r.assets.length}…`); const f = await uploadRowFile(me, site, { uri: r.assets[i].uri, name: r.assets[i].name || 'file', mimeType: r.assets[i].mimeType }); if (f) got.push(f); }
    setBusyRow('');
    if (!got.length) { toast('Upload failed — check your signal and try again.'); return; }
    up((x) => { const t = sec(x, sid); t.links = t.links || []; t.links[ri] = [...(t.links[ri] || []), ...got]; });
  };
  const pending = useRef<{ name: string; d: OmData } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const p = pending.current; if (!p) return true;
    pending.current = null;
    const ok = await saveManual(me, manualId, p.name, p.d);
    if (!ok) { pending.current = p; toast('Could not save the manual — check signal'); }
    return ok;
  };
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; });
  useEffect(() => () => { void flushRef.current(); }, []);
  const queue = (nd: OmData, nm = name) => { pending.current = { name: nm, d: nd }; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(); }, 900); };
  const up = (fn: (x: OmData) => void) => { const nd = JSON.parse(JSON.stringify(d)) as OmData; fn(nd); setD(nd); queue(nd); };
  const sec = (x: OmData, sid: string) => x.sections.find((s) => s.id === sid) as OmSection;

  const move = (sid: string, dir: number) => up((x) => { const i = x.sections.findIndex((s) => s.id === sid), j = i + dir; if (i < 0 || j < 0 || j >= x.sections.length) return; [x.sections[i], x.sections[j]] = [x.sections[j], x.sections[i]]; });
  const delSec = async (s: OmSection) => {
    if (s.key === 'scope') { toast('The Scope of Works has to stay in the manual'); return; }
    if (!(await confirmAsk(`Delete the "${s.title || 'section'}" section?`, 'Delete'))) return;
    up((x) => { x.sections = x.sections.filter((y) => y.id !== s.id); });
  };
  const addSec = async () => {
    const k = await chooseAction('Add a section', [{ key: 'text', label: 'Text' }, { key: 'table', label: 'Table' }, { key: 'photos', label: 'Photos' }, { key: 'maint', label: 'Maintenance procedures' }]);
    if (!k) return;
    up((x) => x.sections.push(k === 'table' ? { id: omUid(), type: 'table', title: 'New table', columns: ['Column 1', 'Column 2'], rows: [['', '']], links: [[]] } : k === 'photos' ? { id: omUid(), type: 'photos', title: 'Photographs', photos: [] } : k === 'maint' ? { id: omUid(), type: 'maint', title: 'Maintenance Procedures', items: [] } : { id: omUid(), type: 'text', title: 'New section', body: '' }));
  };
  const build = async () => {
    if (scopeEmpty(d)) { toast('Describe the Scope of Works first — it has to be filled in'); return null; }
    await flush();
    setStatus('Building the PDF…');
    try {
      const r = await buildOmPdf(d, site, org, (u) => nameOf(people, u), setStatus);
      if (r.notAttached.length) toast(`These could not be added to the back of the manual: ${r.notAttached.join('; ')}`);
      return { bytes: r.bytes, filename: `O&M Manual - ${(site.name || 'Project').replace(/[\\/:*?"<>|]+/g, '-')}.pdf` };
    } catch { toast('Could not build the PDF — try again'); return null; } finally { setStatus(''); }
  };
  const c = d.cover || {};
  const cover = (k: keyof typeof c, v: string) => up((x) => { (x.cover as Record<string, unknown>)[k] = v; });

  return (
    <ScrollView contentContainerStyle={page(820)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: name || 'O&M Manual' }} />
      <TextInput value={name} onChangeText={(v) => { setName(v); queue(d, v); }} placeholder="Manual name" style={[box, { fontWeight: '800', fontSize: 16 }]} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <Button title={status || '📄 Export PDF'} disabled={!!status} onPress={async () => { const b = await build(); if (b && !(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); }} />
        <Button kind="ghost" title="✉ Email PDF" disabled={!!status} onPress={async () => {
          const to = (await promptText('Email the O&M manual to:', site.client_email || ''))?.trim(); if (!to) return;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast('Enter a valid email address.'); return; }
          const b = await build(); if (!b) return;
          setStatus('Sending…'); const err = await emailPdf(b.bytes, b.filename, `${site.id}/om-exports`, { site_id: site.id, recipient_email: to, doc_title: `O&M Manual — ${site.name}` }); setStatus('');
          toast(err || `Emailed to ${to}`);
        }} />
        <Button kind="ghost" title="📝 Word" disabled={!!status} onPress={async () => {
          if (scopeEmpty(d)) { toast('Describe the Scope of Works first — it has to be filled in'); return; }
          await flush(); setStatus('Building the Word file…');
          try { const w = await buildOmWord(d, site, org); if (!(await deliverDocx(w.bytes, w.filename))) toast('Could not save the Word file.'); }
          catch { toast('Could not build the Word file — try again'); } finally { setStatus(''); }
        }} />
      </View>

      <Card>
        <SectionTitle>Cover</SectionTitle>
        <TextInput value={c.title || ''} onChangeText={(v) => cover('title', v)} placeholder="Title" style={box} />
        <TextInput value={c.project || ''} onChangeText={(v) => cover('project', v)} placeholder="Project" style={box} />
        <TextInput value={c.address || ''} onChangeText={(v) => cover('address', v)} placeholder="Address" style={box} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={c.revision || ''} onChangeText={(v) => cover('revision', v)} placeholder="Revision" style={[box, { flex: 1 }]} />
          <DateBox value={c.date || ''} onChange={(v) => cover('date', v)} placeholder="Date" title="Date" style={{ flex: 2, marginBottom: 8 }} />
        </View>
        <TextInput value={c.header || ''} onChangeText={(v) => cover('header', v)} placeholder="Heading" style={box} />
        <TextInput value={c.volume || ''} onChangeText={(v) => cover('volume', v)} placeholder="Volume line" style={box} />
        <TextInput value={c.subtitle || ''} onChangeText={(v) => cover('subtitle', v)} placeholder="Page 2 wording" multiline style={[box, { minHeight: 70 }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {c.coverPhoto ? <StorageImage bucket={c.coverPhoto.bucket} path={c.coverPhoto.path} style={{ width: 120, height: 60, borderRadius: 6 }} /> : <Muted>No cover photo</Muted>}
          <Text style={small} onPress={() => setPicker({ sec: null })}>{c.coverPhoto ? 'Change' : 'Choose'} from the job</Text>
          <Text style={small} onPress={async () => {
            // 857: the cover photo can also be taken now or picked from the phone.
            const src = await chooseAction('Cover photo', [{ key: 'camera', label: '📷 Take a photo' }, { key: 'library', label: '🖼 Choose from library' }]); if (!src) return;
            const p = await pickPhotos(src as 'camera' | 'library', false); if ('error' in p) { toast(p.error); return; } if (!p[0]) return;
            const f = await uploadRowFile(me, site, { uri: await compressOne(p[0]), name: 'cover.jpg', mimeType: 'image/jpeg' });
            if (f) up((x) => { x.cover.coverPhoto = { bucket: f.bucket, path: f.path }; }); else toast('Could not upload — check your signal and try again.');
          }}>📷 Take / upload</Text>
          {c.coverPhoto && <Text style={small} onPress={() => up((x) => { x.cover.coverPhoto = null; })}>Remove</Text>}
        </View>
      </Card>

      <Card>
        <SectionTitle>Attach in the back of the PDF</SectionTitle>
        {([['datasheets', 'Data sheets'], ['guarantees', 'Guarantees'], ['coshh', 'The job’s COSHH assessments'], ['drawings', 'Drawings']] as const).map(([k, l]) => <Check key={k} label={l} value={!!d.attach[k]} onChange={(v) => up((x) => { x.attach[k] = v; })} />)}
        {d.appendix.length > 0 && <Muted style={{ marginTop: 6, fontWeight: '700' }}>Appendix</Muted>}
        {d.appendix.map((e, i) => (
          <View key={`${e.label}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TextInput value={e.label} onChangeText={(v) => up((x) => { x.appendix[i].label = v; })} style={[box, { flex: 1 }]} />
            <Text style={small} onPress={() => up((x) => { const j = i - 1; if (j >= 0) [x.appendix[i], x.appendix[j]] = [x.appendix[j], x.appendix[i]]; })}>▲</Text>
            <Text style={small} onPress={async () => { if (await confirmAsk(`Remove "${e.label}" from the back of the manual?`, 'Remove')) up((x) => { x.appendix.splice(i, 1); }); }}>✕</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          <Text style={small} onPress={() => up((x) => { if (!x.appendix.some((e) => e.kind === 'sow-app')) x.appendix.push({ kind: 'sow-app', label: 'Schedule of Works' }); })}>+ Schedule of Works</Text>
          <Text style={small} onPress={async () => {
            const subs = ((await supabase.from('report_submissions').select('id,template_name,submitted_at,status').eq('site_id', site.id).order('submitted_at', { ascending: false }).limit(100)).data ?? []) as { id: string; template_name: string; submitted_at: string | null; status: string }[];
            const done = subs.filter((s) => s.status !== 'in_progress');
            if (!done.length) { toast('No submitted reports on this job.'); return; }
            const k = await chooseAction('Add a report', done.map((s) => ({ key: s.id, label: `${s.template_name}${s.submitted_at ? ` · ${new Date(s.submitted_at).toLocaleDateString('en-GB')}` : ''}` })));
            const s = done.find((x) => x.id === k); if (s) up((x) => { x.appendix.push({ kind: 'report', label: s.template_name, reportId: s.id }); });
          }}>+ A report</Text>
        </View>
      </Card>

      {d.sections.map((s, si) => (
        <Card key={s.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TextInput value={s.title} onChangeText={(v) => up((x) => { sec(x, s.id).title = v; })} style={[box, { flex: 1, fontWeight: '800', marginBottom: 0 }]} />
            <Text style={[small, { opacity: si ? 1 : 0.3 }]} onPress={() => move(s.id, -1)}>▲</Text>
            <Text style={[small, { opacity: si < d.sections.length - 1 ? 1 : 0.3 }]} onPress={() => move(s.id, 1)}>▼</Text>
            <Text style={[small, { color: base.red }]} onPress={() => void delSec(s)}>🗑</Text>
          </View>
          {s.key === 'scope' && scopeEmpty(d) && <Text style={{ color: base.red, marginTop: 4 }}>Required — describe the works carried out.</Text>}
          <View style={{ marginTop: 8 }}>
            {s.type === 'text' && <TextInput value={s.body || ''} onChangeText={(v) => up((x) => { sec(x, s.id).body = v; })} multiline placeholder={s.key === 'scope' ? 'Describe the works carried out.' : 'Text'} style={[box, { minHeight: 90, textAlignVertical: 'top' }]} />}
            {(s.type === 'table' || s.type === 'materials') && <TableEdit s={s} up={(fn) => up((x) => fn(sec(x, s.id)))} onAttach={(ri) => void attachRow(s.id, ri)} busy={busyRow} />}
            {s.type === 'materials' && <Text style={small} onPress={() => setLibFor(s.id)}>📚 Choose data sheets from the COSHH Library</Text>}
            {s.type === 'maint' && <MaintEdit s={s} up={(fn) => up((x) => fn(sec(x, s.id)))} />}
            {s.type === 'photos' && (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(s.photos || []).map((p, i) => (
                    <View key={`${p.path}${i}`} style={{ width: 150 }}>
                      <StorageImage bucket={p.bucket} path={p.path} style={{ width: 150, height: 110, borderRadius: 6 }} />
                      <TextInput value={p.caption || ''} onChangeText={(v) => up((x) => { (sec(x, s.id).photos as OmPhoto[])[i].caption = v; })} placeholder="Caption" style={[box, { fontSize: 12 }]} />
                      <Text style={[small, { color: base.red }]} onPress={() => up((x) => { (sec(x, s.id).photos as OmPhoto[]).splice(i, 1); })}>Remove</Text>
                    </View>
                  ))}
                </View>
                <Text style={small} onPress={() => setPicker({ sec: s.id })}>+ Add job photos</Text>
              </>
            )}
          </View>
        </Card>
      ))}
      <Button kind="ghost" title="+ Add a section" onPress={() => void addSec()} />
      <Muted style={{ marginTop: 8, marginBottom: space.xl }}>Saves as you type.</Muted>
      {libFor && <LibraryPicker orgId={me.org_id as string} have={(d.sections.find((q) => q.id === libFor)?.rows || []).map((r) => String(r[2] || '').trim().toLowerCase())} onClose={() => setLibFor(null)} onPick={(ps) => { const sid = libFor; setLibFor(null); up((x) => { addOmProducts(x, sid, ps); }); }} />}
      {picker && <PhotoPicker siteId={site.id} single={picker.sec === null} onClose={() => setPicker(null)} onPick={(ps) => {
        if (picker.sec === null) up((x) => { x.cover.coverPhoto = ps[0] ? { bucket: ps[0].bucket, path: ps[0].path } : x.cover.coverPhoto; });
        else { const sid = picker.sec; up((x) => { const t = sec(x, sid); t.photos = [...(t.photos || []), ...ps]; }); }
        setPicker(null);
      }} />}
    </ScrollView>
  );
}

function TableEdit({ s, up, onAttach, busy }: { s: OmSection; up: (fn: (t: OmSection) => void) => void; onAttach: (row: number) => void; busy: string }) {
  const cols = s.columns || [], rows = s.rows || [];
  const cw = 150;
  return (
    <>
      <ScrollView horizontal>
        <View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {cols.map((h, ci) => (
              <View key={ci} style={{ width: cw }}>
                <TextInput value={h} onChangeText={(v) => up((t) => { (t.columns as string[])[ci] = v; })} placeholder="(no heading)" style={[box, { fontWeight: '700', backgroundColor: '#EEF0F4' }]} />
                {cols.length > 1 && <Text style={[small, { fontSize: 11 }]} onPress={() => up((t) => { (t.columns as string[]).splice(ci, 1); (t.rows || []).forEach((r) => r.splice(ci, 1)); })}>✕ column</Text>}
              </View>
            ))}
          </View>
          {rows.map((r, ri) => (
            <View key={ri}>
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-start' }}>
              {cols.map((_, ci) => <TextInput key={ci} value={r[ci] || ''} onChangeText={(v) => up((t) => { (t.rows as string[][])[ri][ci] = v; })} multiline style={[box, { width: cw }]} />)}
              <Text style={[small, { color: base.red, paddingTop: 8 }]} onPress={() => up((t) => { (t.rows as string[][]).splice(ri, 1); if (t.links) t.links.splice(ri, 1); })}>✕</Text>
              <Text style={[small, { paddingTop: 8 }]} onPress={() => onAttach(ri)}>📎 Attach</Text>
            </View>
            {(s.links?.[ri]?.length ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6, marginLeft: 4 }}>
                {(s.links?.[ri] || []).map((l, li) => (
                  <View key={li} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ color: base.blue, fontSize: 12.5 }} onPress={async () => { const u = l.path && l.bucket ? await openDocLink(l.bucket, l.path) : null; if (u) viewDoc(u, l.name || ''); }}>📄 {l.name || 'Document'}</Text>
                    <Text style={{ color: base.red, fontSize: 12 }} onPress={async () => { if (await confirmAsk(`Remove "${l.name || 'this file'}" from this row?`, 'Remove')) up((t) => { (t.links as { name?: string }[][])[ri].splice(li, 1); }); }}>✕</Text>
                  </View>
                ))}
              </View>
            )}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Text style={small} onPress={() => up((t) => { (t.rows = t.rows || []).push((t.columns || []).map((_, i) => (t.type === 'materials' && i === 0 ? String((t.rows || []).length + 1) : ''))); (t.links = t.links || []).push([]); })}>+ Row</Text>
        <Text style={small} onPress={() => up((t) => { (t.columns = t.columns || []).push('New column'); (t.rows || []).forEach((r) => r.push('')); })}>+ Column</Text>
      </View>
      {!!busy && <Muted>{busy}</Muted>}
      <Muted style={{ marginTop: 4 }}>Files attached to a row go in the back of the PDF{s.type === 'materials' ? ', straight after that product' : ''}.</Muted>
    </>
  );
}

function MaintEdit({ s, up }: { s: OmSection; up: (fn: (t: OmSection) => void) => void }) {
  const items = s.items || [];
  const missing = Object.keys(HO_MAINT).filter((k) => !items.some((i) => i.key === k));
  return (
    <>
      {items.map((it, i) => (
        <View key={it.id} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput value={it.title} onChangeText={(v) => up((t) => { (t.items || [])[i].title = v; })} placeholder="Heading" style={[box, { flex: 1, fontWeight: '700' }]} />
            <Text style={small} onPress={() => up((t) => { const a = t.items || []; if (i > 0) [a[i], a[i - 1]] = [a[i - 1], a[i]]; })}>▲</Text>
            <Text style={[small, { color: base.red }]} onPress={() => up((t) => { t.items = (t.items || []).filter((x) => x.id !== it.id); })}>✕</Text>
          </View>
          <TextInput value={it.text} onChangeText={(v) => up((t) => { (t.items || [])[i].text = v; })} multiline style={[box, { minHeight: 80, textAlignVertical: 'top' }]} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {missing.map((k) => <Text key={k} style={small} onPress={() => up((t) => { (t.items = t.items || []).push({ id: omUid(), key: k, title: HO_MAINT[k].label, text: HO_MAINT[k].text }); })}>+ {HO_MAINT[k].label}</Text>)}
        <Text style={small} onPress={() => up((t) => { (t.items = t.items || []).push({ id: omUid(), key: null, title: '', text: '' }); })}>+ Your own</Text>
      </View>
    </>
  );
}

function PhotoPicker({ siteId, single, onPick, onClose }: { siteId: string; single: boolean; onPick: (p: OmPhoto[]) => void; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['omPhotos', siteId], queryFn: () => jobPhotos(siteId) });
  const [sel, setSel] = useState<number[]>([]);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: base.card, borderRadius: 12, padding: 14, maxHeight: '90%', maxWidth: 760, width: '100%', alignSelf: 'center' }}>
          <SectionTitle>{single ? 'Choose the cover photo' : 'Add job photos'}</SectionTitle>
          <ScrollView>
            {isLoading ? <Muted>Loading…</Muted> : !data.length ? <Muted>No Schedule of Works photos on this job yet.</Muted> : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {data.map((p, i) => (
                  <Pressable key={`${p.path}${i}`} onPress={() => (single ? onPick([p]) : setSel(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i]))} style={{ borderWidth: 3, borderColor: sel.includes(i) ? base.blue : 'transparent', borderRadius: 8 }}>
                    <StorageImage bucket={p.bucket} path={p.thumb} style={{ width: 104, height: 80, borderRadius: 5 }} />
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {!single && <View style={{ flex: 1 }}><Button title={`Add ${sel.length || ''}`} disabled={!sel.length} onPress={() => onPick(sel.map((i) => ({ bucket: data[i].bucket, path: data[i].path, caption: data[i].caption })))} /></View>}
            <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={onClose} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Products from the COSHH Library, ticked to go into the Materials Log (857 hoPickDatasheets).
function LibraryPicker({ orgId, have, onPick, onClose }: { orgId: string; have: string[]; onPick: (p: { title: string; manufacturer: string; sdsPath: string | null; assessPath: string | null }[]) => void; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['omLib', orgId], queryFn: async () => { const lib = await loadProducts(orgId); return { lib, amap: await assessMap(orgId, lib) }; } });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const lib = (data?.lib || []).filter((it) => !q.trim() || `${it.title} ${it.data.manufacturer || ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Popup title="Choose data sheets from the library" onClose={onClose} width={560} center footer={<PopupButtons yes={`Add ${sel.length || ''} ticked`} no="Cancel" onNo={onClose} onYes={() => onPick((data?.lib || []).filter((it) => sel.includes(it.id)).map((it) => ({ title: it.title, manufacturer: it.data.manufacturer || '', sdsPath: it.data.sdsPath || null, assessPath: data?.amap[it.id]?.files[0]?.storage_path || null })))} />}>
      <TextInput value={q} onChangeText={setQ} placeholder="Search products" style={box} />
      <Muted style={{ marginBottom: 6 }}>Each product goes into the log with its data sheet, and its COSHH assessment straight after.</Muted>
      {isLoading ? <Muted>Loading the library…</Muted> : !data?.lib.length ? <Muted>No products in the COSHH library yet — add data sheets in Admin › COSHH Library.</Muted> : lib.map((it) => {
        const inLog = have.includes(it.title.trim().toLowerCase()), on = sel.includes(it.id), a = data.amap[it.id];
        return (
          <Pressable key={it.id} disabled={inLog} onPress={() => setSel(on ? sel.filter((x) => x !== it.id) : [...sel, it.id])} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: base.line, opacity: inLog ? 0.5 : 1 }}>
            <Text style={{ fontSize: 18 }}>{on || inLog ? '☑' : '☐'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: base.ink }}>{it.title}</Text>
              <Muted>{[it.data.manufacturer, it.data.sdsPath ? '📄 data sheet' : 'no data sheet', a ? '✓ COSHH assessment' : 'no COSHH yet', inLog ? 'already in the log' : ''].filter(Boolean).join(' · ')}</Muted>
            </View>
          </Pressable>
        );
      })}
    </Popup>
  );
}
