// Reports & surveys › Completed TBTs (710 renderCompletedTbts): every completed
// toolbox talk across the company's projects that someone has signed, newest
// first — search, Open / PDF / Email each, or tick several (or all) for one
// combined signed PDF to download or email.
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted } from '@/components/ui';
import { buildSignedTbtPdf } from '@/data/hsPdf';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { deliverPdf, emailPdf, PDFDocument } from '@/lib/pdf';
import { isManager } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import type { Site } from '@/lib/types';
import { base, page, radius, space } from '@/theme/theme';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Talk = { id: string; site_id: string; title: string; created_at: string };
const fmt = (d: string | undefined) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CompletedTbts() {
  const { me } = useAuth();
  const toast = useToast();
  const { data: sites = [] } = useSites();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['tbtsDone', me?.org_id], enabled: !!me, queryFn: async () => {
    const talks = ((await db.from('toolbox_talks').select('id,site_id,title,created_at').eq('org_id', me?.org_id as string).eq('status', 'completed').is('subcontractor_company_id', null).order('created_at', { ascending: false }).limit(500)).data as Talk[] | null) ?? [];
    const sigs = talks.length ? ((await db.from('toolbox_talk_signatures').select('tbt_id,signed_at').in('tbt_id', talks.map((t) => t.id))).data as { tbt_id: string; signed_at: string }[] | null) ?? [] : [];
    const n: Record<string, number> = {}, last: Record<string, string> = {};
    sigs.forEach((x) => { n[x.tbt_id] = (n[x.tbt_id] || 0) + 1; if (!last[x.tbt_id] || x.signed_at > last[x.tbt_id]) last[x.tbt_id] = x.signed_at; });
    return { talks: talks.filter((t) => n[t.id]), n, last };
  } });
  if (!me) return null;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Managers only.</Muted>;
  const siteOf = (id: string) => sites.find((s) => s.id === id) as Site | undefined;
  const talks = data?.talks ?? [];
  const t0 = q.trim().toLowerCase();
  const shown = talks.filter((t) => !t0 || [t.title, siteOf(t.site_id)?.name, siteOf(t.site_id)?.address].join(' ').toLowerCase().includes(t0));
  const one = async (t: Talk) => { const s = siteOf(t.site_id); if (!s) { toast('Project not found.'); return null; } const b = await buildSignedTbtPdf(t.id, s).catch(() => 'Could not build the signed PDF.'); if (typeof b === 'string') { toast(b); return null; } return b; };
  const merged = async () => {
    const out = await PDFDocument.create(); let n = 0;
    for (const id of sel) { const t = talks.find((x) => x.id === id); if (!t) continue; const b = await one(t); if (!b) continue; const src = await PDFDocument.load(b.bytes, { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p)); n++; }
    if (!n) { toast('None of the ticked talks could be built.'); return null; }
    return { bytes: await out.save(), filename: `Signed Toolbox Talks (${n}) - ${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`, n };
  };
  const ask = async (what: string) => { const to = (await promptText(`Email ${what} to:`, ''))?.trim(); if (!to) return null; if (!EMAIL.test(to)) { toast('Enter a valid email address.'); return null; } return to; };
  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Completed TBTs' }} />
      <TextInput value={q} onChangeText={setQ} placeholder="Search toolbox talks or projects" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 10 }} />
      {sel.size > 0 ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontWeight: '700', color: base.ink }}>{sel.size} selected</Text>
          <Button kind="ghost" busy={busy === 'pdf'} title="Export PDF" onPress={async () => { setBusy('pdf'); toast('Building one PDF…'); const m = await merged().catch(() => null); setBusy(''); if (m && !(await deliverPdf(m.bytes, m.filename))) toast('Could not save the PDF.'); }} />
          <Button busy={busy === 'email'} title="Email all" onPress={async () => {
            const to = await ask(`the ${sel.size} ticked toolbox talk${sel.size === 1 ? '' : 's'}`); if (!to) return;
            setBusy('email'); const m = await merged().catch(() => null);
            const err = m ? await emailPdf(m.bytes, m.filename, `tbt-exports/${me.org_id}`, { general_label: 'Toolbox Talks', recipient_email: to, cc_email: to !== me.email ? me.email || undefined : undefined, doc_title: `Signed Toolbox Talks (${m.n})` }) : 'Nothing to send.';
            setBusy(''); toast(err || `${m?.n} toolbox talk${m?.n === 1 ? '' : 's'} emailed to ${to}`); if (!err) setSel(new Set());
          }} />
          <Pressable onPress={() => setSel(new Set())}><Text style={{ color: base.slate }}>✕</Text></Pressable>
        </Card>
      ) : talks.length > 0 && <Text style={{ textAlign: 'right', color: base.blue, marginBottom: 8 }} onPress={() => setSel(new Set(talks.map((t) => t.id)))}>Select all</Text>}
      {isLoading ? <Muted>Loading…</Muted> : shown.length ? shown.map((t) => {
        const on = sel.has(t.id), s = siteOf(t.site_id);
        return (
          <Card key={t.id} style={on ? { borderColor: base.blue, borderWidth: 1.5 } : undefined}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setSel((x) => { const n = new Set(x); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}><Text style={{ fontSize: 20 }}>{on ? '☑' : '☐'}</Text></Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: base.ink }}>{t.title || 'Toolbox Talk'}</Text>
                <Muted style={{ fontSize: 12 }}>{s?.name || 'Project'} · issued {fmt(t.created_at)}{data?.last[t.id] ? ` · last signed ${fmt(data.last[t.id])}` : ''} · {data?.n[t.id]} signature{data?.n[t.id] === 1 ? '' : 's'}</Muted>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                  <Text style={{ color: base.blue }} onPress={() => router.push(`/sites/${t.site_id}/hs/tbt/${t.id}` as never)}>Open</Text>
                  <Text style={{ color: base.blue }} onPress={async () => { const b = await one(t); if (b && !(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); }}>📄 PDF</Text>
                  <Text style={{ color: base.blue }} onPress={async () => { const to = await ask('this signed Toolbox Talk PDF'); if (!to) return; const b = await one(t); if (!b) return; const err = await emailPdf(b.bytes, b.filename, `${t.site_id}/tbt-exports`, { site_id: t.site_id, recipient_email: to, doc_title: `${t.title} (signed)` }); toast(err || `Emailed to ${to}`); }}>✉ Email</Text>
                </View>
              </View>
            </View>
          </Card>
        );
      }) : <Empty>{t0 ? 'No toolbox talks match.' : 'No signed toolbox talks yet.'}</Empty>}
    </ScrollView>
  );
}
