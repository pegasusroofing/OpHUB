// Toolbox talks for a job (710). Operatives see every talk (live ones to sign).
// Managers get Bank / Live / Completed tabs (Live first when there is one), the
// monthly "due" warning, signed counts and who's still to sign, upload into the
// bank and sync the bank from the Admin Centre library. On Completed, tick talks
// to export or email their signed PDFs as one file (710 exportSelectedTbts).
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { TbtStatusTag } from '@/components/TbtStatusTag';
import { promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { nameOf, usePeople, useTbts } from '@/data/hs';
import { useSite } from '@/data/sites';
import { syncTbtBank, tbtDue, uploadTbt } from '@/data/tbtManager';
import { buildSignedTbtPdf } from '@/data/hsPdf';
import { useAuth } from '@/lib/auth';
import { deliverPdf, emailPdf, exportFilename, PDFDocument } from '@/lib/pdf';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { base, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

export default function Tbts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: talks, isLoading } = useTbts(site);
  const { data: people } = usePeople();
  const mgr = !!me && isManager(me);
  const [tab, setTab] = useState<'bank' | 'live' | 'completed' | null>(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  // Managers: signed counts and who's still to sign on live talks.
  const { data: roster } = useQuery({
    queryKey: ['tbtRoster', id, (talks ?? []).map((t) => t.id).join(',')],
    enabled: mgr && !!talks?.length,
    queryFn: async () => {
      const ids = (talks ?? []).map((t) => t.id);
      const [s, a] = await Promise.all([db.from('toolbox_talk_signatures').select('tbt_id,user_id').in('tbt_id', ids), db.from('site_assignments').select('user_id').eq('site_id', id)]);
      return { sigs: (s.data as { tbt_id: string; user_id: string }[] | null) ?? [], assigned: ((a.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id) };
    },
  });
  if (!me) return null;
  const opIds = new Set((people ?? []).filter((p) => p.role === 'operative').map((p) => p.id));
  const hasLive = (talks ?? []).some((t) => t.status === 'live');
  const cur = tab ?? (hasLive ? 'live' : 'bank');
  const shown = mgr ? (talks ?? []).filter((t) => t.status === cur) : talks ?? [];
  const due = mgr && site && talks ? tbtDue(site, talks) : null;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['tbts', id] });
  const combined = async (): Promise<{ bytes: Uint8Array; filename: string } | null> => {
    if (!site) return null;
    const out = await PDFDocument.create(); let skipped = 0;
    for (const tid of shown.filter((t) => sel.has(t.id)).map((t) => t.id)) {
      const b = await buildSignedTbtPdf(tid, site).catch(() => 'x');
      if (typeof b === 'string') { skipped++; continue; }
      const d = await PDFDocument.load(b.bytes, { ignoreEncryption: true }); (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p));
    }
    if (skipped) toast(`${skipped} talk${skipped > 1 ? 's' : ''} had no signatures or could not be read — left out.`);
    return out.getPageCount() ? { bytes: await out.save(), filename: exportFilename(site.name, `Toolbox Talks (${sel.size}, signed)`, 'pdf') } : null;
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Toolbox Talks' }} />
      <HowTo k="tbt" />
      {!!due && (
        <Card style={{ borderColor: base.warn, borderWidth: 1.5 }}>
          <Text style={{ fontWeight: '700', color: base.warn }}>{due}</Text>
          <Muted>A Toolbox Talk must be issued and signed off every month. Issue one from Bank TBT below.</Muted>
        </Card>
      )}
      {mgr && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {(['bank', 'live', 'completed'] as const).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: cur === k ? base.ink : base.line, backgroundColor: cur === k ? base.ink : base.card }}>
              <Text style={{ fontWeight: '700', color: cur === k ? '#fff' : base.ink }}>{k === 'bank' ? 'Bank TBT' : k === 'live' ? 'Live TBT' : 'Completed TBT'}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {isLoading || !site ? <Muted>Loading…</Muted> : shown.length ? shown.map((t) => {
        const signed = (roster?.sigs ?? []).filter((s) => s.tbt_id === t.id && opIds.has(s.user_id));
        const waiting = t.status === 'live' ? (roster?.assigned ?? []).filter((u) => opIds.has(u) && !signed.some((s) => s.user_id === u)) : [];
        return (
          <Pressable key={t.id} onPress={() => (mgr && cur === 'completed' && sel.size ? setSel((x) => { const n = new Set(x); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; }) : router.push(`/sites/${site.id}/hs/tbt/${t.id}`))} onLongPress={mgr && cur === 'completed' ? () => setSel((x) => new Set(x).add(t.id)) : undefined}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: base.ink }}>{mgr && cur === 'completed' ? <Text onPress={() => setSel((x) => { const n = new Set(x); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}>{sel.has(t.id) ? '☑ ' : '☐ '}</Text> : null}{t.title}</Text>
                  <Muted>{new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted>
                </View>
                <TbtStatusTag status={t.status} />
              </View>
              {mgr && <Muted style={{ marginTop: 6 }}>{signed.length} signed</Muted>}
              {mgr && t.status === 'live' && roster && (waiting.length
                ? <Text style={{ color: base.warn, fontSize: 12.5 }}>Still to sign: {waiting.map((u) => nameOf(people, u)).join(', ')}</Text>
                : <Text style={{ color: base.ok, fontSize: 12.5 }}>✓ Everyone has signed</Text>)}
            </Card>
          </Pressable>
        );
      }) : <Empty>No {mgr ? `${cur === 'bank' ? 'bank' : cur} ` : ''}toolbox talks{mgr ? '' : ' yet'}.</Empty>}

      {mgr && cur === 'bank' && (
        <>
          <Button kind="ghost" busy={busy} title="🔄 Sync Bank TBT from Admin Centre Library" onPress={async () => { setBusy(true); toast(await syncTbtBank(me, id)); setBusy(false); refresh(); }} />
          <Card>
            <SectionTitle>Upload a toolbox talk</SectionTitle>
            <TextInput value={title} onChangeText={setTitle} placeholder="Title, e.g. Week 24 — Manual Handling" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, marginBottom: 8 }} />
            <Button kind="ghost" title={file ? `📄 ${file.name}` : 'Choose PDF'} onPress={async () => {
              const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
              if (!r.canceled && r.assets[0]) setFile({ uri: r.assets[0].uri, name: r.assets[0].name || 'talk.pdf' });
            }} />
            <Button busy={busy} title="Upload" onPress={async () => {
              if (!title.trim() || !file) { toast('Add a title and choose a PDF.'); return; }
              setBusy(true); const err = await uploadTbt(me, id, title.trim(), file); setBusy(false);
              if (err) { toast(err); return; }
              toast('Toolbox talk uploaded to Bank TBT'); setTitle(''); setFile(null); setTab('bank'); refresh();
            }} />
            <Muted>New uploads go into Bank TBT — operatives can&apos;t see them until you tap &quot;Issue for Signing&quot;.</Muted>
          </Card>
        </>
      )}
      {mgr && cur === 'completed' && shown.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button kind="ghost" title={sel.size === shown.length ? 'Clear all' : 'Tick all'} onPress={() => setSel(sel.size === shown.length ? new Set() : new Set(shown.map((t) => t.id)))} />
          {sel.size > 0 && <Button kind="ghost" busy={busy} title={`📄 Signed PDF of ${sel.size}`} onPress={async () => { setBusy(true); toast('Building signed PDF…'); const b = await combined().catch(() => null); setBusy(false); if (!b) { toast('Nothing to export.'); return; } if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); }} />}
          {sel.size > 0 && <Button kind="ghost" busy={busy} title={`✉ Email ${sel.size}`} onPress={async () => {
            const to = (await promptText('Email the signed toolbox talks to:', ''))?.trim(); if (!to) return;
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast('Enter a valid email address.'); return; }
            setBusy(true); const b = await combined().catch(() => null);
            const err = b ? await emailPdf(b.bytes, b.filename, `${id}/tbt-exports`, { site_id: id, recipient_email: to, doc_title: `Toolbox Talks (signed) — ${site?.name || ''}` }) : 'Nothing to email.';
            setBusy(false); toast(err || 'Emailed'); if (!err) setSel(new Set());
          }} />}
        </View>
      )}
      {mgr && cur === 'completed' && <Muted style={{ marginTop: space.m }}>Tick talks to export or email their signed PDFs together.</Muted>}
      {mgr && site && <SubTbts siteId={id} site={site} />}
    </ScrollView>
  );
}

/** Subcontractors' own toolbox talks on this job, a fold per company, each signed PDF to export or email (710). */
function SubTbts({ siteId, site }: { siteId: string; site: NonNullable<ReturnType<typeof useSite>['data']> }) {
  const toast = useToast();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { data = [] } = useQuery({ queryKey: ['subTbtsSite', siteId], queryFn: async () => {
    const cos = ((await db.from('subcontractor_companies').select('id,name').eq('site_id', siteId).order('name')).data as { id: string; name: string }[] | null) ?? [];
    if (!cos.length) return [];
    const talks = ((await db.from('toolbox_talks').select('id,title,status,created_at,subcontractor_company_id').in('subcontractor_company_id', cos.map((c) => c.id)).order('created_at', { ascending: false })).data as { id: string; title: string; status: string; created_at: string; subcontractor_company_id: string }[] | null) ?? [];
    return cos.map((c) => ({ ...c, talks: talks.filter((t) => t.subcontractor_company_id === c.id) })).filter((c) => c.talks.length);
  } });
  if (!data.length) return null;
  const pdf = async (tid: string) => {
    toast('Building signed PDF…');
    const b = await buildSignedTbtPdf(tid, site).catch(() => 'Could not build the signed PDF.');
    if (typeof b === 'string') { toast(b); return null; }
    return b;
  };
  return (
    <>
      <SectionTitle>Subcontractor Toolbox Talks</SectionTitle>
      {data.map((c) => (
        <Card key={c.id}>
          <Pressable onPress={() => setOpen({ ...open, [c.id]: !open[c.id] })}><Text style={{ fontWeight: '800', color: base.ink }}>{open[c.id] ? '▼' : '▶'} {c.name} ({c.talks.length})</Text></Pressable>
          {open[c.id] && c.talks.map((t) => (
            <View key={t.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: base.line }}>
              <Pressable onPress={() => router.push(`/sites/${siteId}/mc/subcontractors/${c.id}/tbt` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: base.ink }}>{t.title}</Text><Muted>{new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</Muted></View>
                <TbtStatusTag status={t.status as never} />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                <Text style={{ color: base.blue }} onPress={async () => { const b = await pdf(t.id); if (b && !(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); }}>⬇ Export</Text>
                <Text style={{ color: base.blue }} onPress={async () => {
                  const to = (await promptText('Email this signed Toolbox Talk PDF to:', ''))?.trim(); if (!to) return;
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast('Enter a valid email address.'); return; }
                  const b = await pdf(t.id); if (!b) return;
                  const err = await emailPdf(b.bytes, b.filename, `${siteId}/tbt-exports`, { site_id: siteId, recipient_email: to, doc_title: `${t.title} (signed)` });
                  toast(err || `Emailed to ${to}`);
                }}>✉️ Email</Text>
              </View>
            </View>
          ))}
        </Card>
      ))}
    </>
  );
}
