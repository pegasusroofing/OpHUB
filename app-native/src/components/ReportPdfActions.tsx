// Export PDF / Email Report for a report or survey (430 exportReportPDF and
// emailReportPDF). The email goes as a link to the uploaded PDF, so big
// photo-heavy reports still send.
import { useState } from 'react';
import { View } from 'react-native';

import { promptText, showAlert, useToast } from '@/components/toast';
import { Button } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useSites } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { deliverPdf, emailPdf, PDFDocument } from '@/lib/pdf';
import { saveToOneDrive } from '@/lib/oneDriveSave';
import { buildReportPdf, type PdfSub } from '@/lib/reportPdf';
import { drawSignatureTable } from '@/lib/signedPdf';
import { supabase } from '@/lib/supabase';

export function ReportPdfActions({ sub, fromBriefing }: { sub: PdfSub; fromBriefing?: boolean }) {
  const { me, org } = useAuth();
  const toast = useToast();
  const { data: sites } = useSites();
  const { data: people } = usePeople();
  const [busy, setBusy] = useState<'pdf' | 'email' | null>(null);
  if (!me) return null;
  const site = sub.site_id ? (sites ?? []).find((s) => s.id === sub.site_id) ?? null : null;
  const build = async () => {
    toast('Building PDF…');
    const b = await buildReportPdf(sub, site, org, (u) => nameOf(people, u), { fromBriefing, onProgress: toast }).catch(() => null);
    if (!b || !b.bytes.length) { toast('Could not build the PDF.'); return null; }
    // A daily briefing goes out with its signature table (700 buildBriefingPdfWithSignatures).
    if (fromBriefing) {
      const sigs = ((await supabase.from('daily_briefing_signatures').select('user_id,signed_at,signature_image_path').eq('submission_id', sub.id).order('signed_at')).data ?? []) as { user_id: string; signed_at: string; signature_image_path: string | null }[];
      if (sigs.length) {
        const doc = await PDFDocument.load(b.bytes);
        await drawSignatureTable(doc, {
          title: sub.template_name, disclaimer: `I confirm I have read and understood the contents of this briefing (${sub.template_name}).`,
          signers: sigs.map((s) => ({ name: nameOf(people, s.user_id), plainName: '', dateText: '', imagePath: s.signature_image_path, when: new Date(s.signed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })),
        });
        b.bytes = await doc.save();
      }
    }
    if (b.failures) toast(`${b.failures} photo${b.failures > 1 ? 's' : ''} could not be included in the PDF — check your connection and re-export if needed.`);
    return b;
  };
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'pdf'} title="📄 Export PDF" onPress={async () => {
        setBusy('pdf'); const b = await build(); if (b && !(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.');
        // A project report also goes to the project's OneDrive folder (best-effort, 430 exportReportPDF).
        if (b && sub.site_id) void saveToOneDrive(me.org_id, b.bytes, b.filename, sub.site_id);
        setBusy(null);
      }} /></View>
      <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'email'} title="✉ Email Report" onPress={async () => {
        const to = await promptText('Email this report PDF to:', me.email || ''); if (to === null) return;
        const email = to.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter a valid email address.'); return; }
        setBusy('email');
        const b = await build();
        if (b) {
          const err = await emailPdf(b.bytes, b.filename, `${sub.site_id || `general/${me.org_id}`}/report-exports`, {
            site_id: sub.site_id, general_label: sub.site_id ? undefined : sub.general_label || 'General survey', recipient_email: email, doc_title: sub.template_name,
          });
          if (err) showAlert(err); else toast(b.failures ? `Emailed — but ${b.failures} photo${b.failures > 1 ? 's' : ''} could not be included.` : 'Emailed');
        }
        setBusy(null);
      }} /></View>
    </View>
  );
}
