// Daily Briefings list, grouped by week (current week open). Tap to read;
// "Tap to sign" shows on completed briefings that are issued and you haven't signed.
// Managers: "+ New Briefing" from the company's Daily Briefing template, and an
// unfinished one opens to carry on filling it in; admins can delete unfinished ones.
// Ported from renderDailyBriefings (700). Managers can tick several completed briefings and export or
// email them as one PDF, each with its signatures.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { promptEmail } from '@/components/EmailPrompt';
import { buildReportWithSigs } from '@/components/ReportPdfActions';
import { confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Empty, Muted, Row, Toggle } from '@/components/ui';
import { briefingTemplate, deleteBriefing, signBriefing, useBriefings, type Submission } from '@/data/briefings';
import { nameOf, usePeople } from '@/data/hs';
import { quickTemplate, startReport } from '@/data/reports';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { deliverPdf, emailPdf, exportFilename, PDFDocument } from '@/lib/pdf';
import type { PdfSub } from '@/lib/reportPdf';
import { supabase } from '@/lib/supabase';
import { REPORT_STATUS_LABEL, weekKeyOf, weekLabelOf } from '@/lib/rules/reports';
import { isFullManager, isManager } from '@/lib/roles';
import { base, page, radius } from '@/theme/theme';

export default function Briefings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data, isLoading } = useBriefings(id);
  const { data: people } = usePeople();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  if (!me) return null;
  const mgr = isManager(me);
  const current = weekKeyOf(new Date());
  const weeks: Record<string, Submission[]> = {};
  (data?.subs ?? []).forEach((s) => { (weeks[weekKeyOf(new Date(s.submitted_at))] ||= []).push(s); });
  const keys = Object.keys(weeks).sort((a, b) => b.localeCompare(a));
  const refresh = () => void qc.invalidateQueries({ queryKey: ['briefings', id] });

  const sign = async (s: Submission) => {
    const r = await signBriefing(me, s.id);
    toast(r.msg);
    if (r.needSignature) router.push('/signature');
    if (r.ok) refresh();
  };

  // The ticked briefings as one PDF, oldest first, each with its signature table.
  const merged = async () => {
    const ids = (data?.subs ?? []).filter((s) => sel.has(s.id) && s.status === 'completed').sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)).map((s) => s.id);
    if (!ids.length || !site) { toast('Only completed briefings can be exported.'); return null; }
    const rows = ((await supabase.from('report_submissions').select('*').in('id', ids)).data ?? []) as unknown as PdfSub[];
    const out = await PDFDocument.create(); let n = 0;
    for (const sid of ids) {
      const r = rows.find((x) => x.id === sid); if (!r) continue;
      toast(`Building ${r.template_name}…`);
      const b = await buildReportWithSigs(r, site, org, (u) => nameOf(people, u), true);
      if (!b) { toast(`Could not add "${r.template_name}" — skipped.`); continue; }
      const d = await PDFDocument.load(b.bytes); (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p)); n++;
    }
    if (!n) { toast('Could not build the PDF.'); return null; }
    return { bytes: await out.save(), filename: exportFilename(site.name, `Daily Briefings (${n})`, 'pdf'), n };
  };
  const tick = (sid: string) => setSel((x) => { const s = new Set(x); if (s.has(sid)) s.delete(sid); else s.add(sid); return s; });

  return (
    <ScrollView contentContainerStyle={page(720)}>
      <Stack.Screen options={{ title: 'Daily Briefings' }} />
      {mgr && sel.size > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Text style={{ fontWeight: '700', color: base.ink }}>{sel.size} selected</Text>
          <Button kind="ghost" busy={busy} title="📄 Export as one PDF" onPress={async () => { setBusy(true); try { const m = await merged(); if (m && !(await deliverPdf(m.bytes, m.filename))) toast('Could not save the PDF.'); } finally { setBusy(false); } }} />
          <Button kind="ghost" busy={busy} title="✉ Email" onPress={async () => {
            if (!site) return;
            const to = await promptEmail(`Email the selected briefings (${sel.size}) as one PDF to:`, { myEmail: me.email, clientEmail: site.client_email }); if (!to) return;
            setBusy(true);
            try {
              const m = await merged(); if (!m) return;
              const err = await emailPdf(m.bytes, m.filename, `${id}/briefing-exports`, { site_id: id, recipient_email: to.to, cc_email: to.cc, client_cc_email: to.clientCc, doc_title: `Daily Briefings (${m.n})` });
              if (err) showAlert(err); else { toast('Emailed'); setSel(new Set()); }
            } finally { setBusy(false); }
          }} />
          <Pressable onPress={() => setSel(new Set())}><Text style={{ color: base.slate }}>Clear</Text></Pressable>
        </View>
      )}
      {mgr && site && (
        <>
          <Button busy={busy} disabled={data?.hasTemplate === false} title="+ New Briefing" onPress={async () => {
            setBusy(true);
            const t = me.org_id ? await briefingTemplate(me.org_id) : null;
            const sid = t ? await startReport(me, site, t) : null;
            setBusy(false);
            if (!t) { toast('No Daily Briefing template set up yet — an admin can flag one in Admin Centre › Report Templates.'); return; }
            if (!sid) { toast('Could not start — check your signal and try again.'); return; }
            toast('Briefing started'); refresh();
            router.push(`/sites/${id}/hs/briefings/fill/${sid}` as never);
          }} />
          {data?.hasTemplate === false && <Muted style={{ marginBottom: 6 }}>No Daily Briefing template set up yet.</Muted>}
          {data?.hasTemplate === false && isFullManager(me) && <View style={{ marginBottom: 10 }}><Button small title="+ Create a Daily Briefing template" onPress={async () => { const tid = await quickTemplate(me, 'briefing'); if (tid) router.push(`/pm/admin/templates/${tid}` as never); else toast('Could not create it — try again.'); }} /></View>}
        </>
      )}
      {isLoading ? <Muted>Loading…</Muted> : keys.length ? keys.map((k) => {
        const isOpen = open[k] ?? k === current;
        return (
          <View key={k}>
            <Toggle title={`${weekLabelOf(k)}${k === current ? ' (current)' : ''} (${weeks[k].length})`} open={isOpen} onPress={() => setOpen({ ...open, [k]: !isOpen })} />
            {isOpen && weeks[k].map((s) => {
              const sigs = (data?.sigs ?? []).filter((x) => x.submission_id === s.id);
              const mine = sigs.find((x) => x.user_id === me.id);
              const needsMe = !!s.issued_at && s.status === 'completed' && !mine;
              const go = s.status === 'completed' ? () => router.push(`/sites/${id}/hs/briefings/${s.id}`)
                : mgr ? () => router.push(`/sites/${id}/hs/briefings/fill/${s.id}` as never) : undefined;
              return (
                <View key={s.id} style={{ marginTop: 8 }}>
                  <Row title={`${s.template_name} · ${REPORT_STATUS_LABEL[s.status] || s.status}`}
                    sub={`${s.status === 'in_progress' ? 'Started' : 'Completed'} ${new Date(s.submitted_at).toLocaleString('en-GB')} · ${nameOf(people, s.submitted_by)}\n${s.issued_at ? `Issued for signing · ${sigs.length} signed` : 'Not issued for signing'}`}
                    onPress={go}
                    extra={mgr && s.status === 'completed' ? (
                      <Pressable hitSlop={8} onPress={() => tick(s.id)}><Text style={{ fontSize: 18 }}>{sel.has(s.id) ? '☑' : '☐'}</Text></Pressable>
                    ) : s.status === 'in_progress' && me.role === 'admin' ? (
                      <Pressable hitSlop={8} onPress={async () => {
                        if (!(await confirmAsk('Delete this unfinished briefing? This cannot be undone.', 'Delete'))) return;
                        if (await deleteBriefing(s.id)) { toast('Briefing deleted'); refresh(); } else toast('Could not delete — try again.');
                      }}><Text style={{ color: base.red }}>🗑</Text></Pressable>
                    ) : undefined} />
                  {needsMe && (
                    <Pressable onPress={() => sign(s)} style={{ marginTop: -4, marginBottom: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: base.line, borderRadius: radius.input, padding: 12, backgroundColor: base.card }}>
                      <Text style={{ fontWeight: '700', color: base.ink }}>✍ Tap to sign — {s.template_name}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        );
      }) : <Empty>No Daily Briefings yet{data?.hasTemplate === false ? ' — set up a Daily Briefing template first.' : '.'}</Empty>}
    </ScrollView>
  );
}
