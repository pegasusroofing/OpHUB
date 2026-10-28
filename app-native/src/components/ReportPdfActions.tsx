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
import { deliverPdf, emailPdf } from '@/lib/pdf';
import { buildReportPdf, type PdfSub } from '@/lib/reportPdf';

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
    if (b.failures) toast(`${b.failures} photo${b.failures > 1 ? 's' : ''} could not be included in the PDF — check your connection and re-export if needed.`);
    return b;
  };
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'pdf'} title="📄 Export PDF" onPress={async () => {
        setBusy('pdf'); const b = await build(); if (b && !(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); setBusy(null);
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
