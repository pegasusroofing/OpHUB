// Export PDF / Email Report on the Schedule of Works (480 / 500): pick the full
// project or a period (today, this week, last week, chosen dates); the report
// covers the tab being looked at.
import { useState } from 'react';
import { View } from 'react-native';

import { chooseAction, showAlert, useToast } from '@/components/toast';
import { Button } from '@/components/ui';
import { promptEmail } from '@/components/EmailPrompt';
import { useTeam } from '@/data/admin';
import { askDate } from '@/components/DateField';
import { useAuth } from '@/lib/auth';
import { deliverPdf } from '@/lib/pdf';
import { localISODate } from '@/lib/rules/driver';
import { buildSowPdf, emailSowPdf, sowPeriod, type SowPeriod, type SowTab } from '@/lib/sowPdf';
import type { Site } from '@/lib/types';

export function SowExport({ site, tab }: { site: Site; tab: SowTab }) {
  const { me, org } = useAuth();
  const { data: people } = useTeam(me?.org_id);
  const toast = useToast();
  const [busy, setBusy] = useState<'pdf' | 'email' | null>(null);
  if (!me) return null;
  const askPeriod = async (): Promise<SowPeriod | undefined> => {
    const k = await chooseAction('What to include', [
      { key: 'full', label: 'Full project — every photo' }, { key: 'today', label: 'Today only' }, { key: 'week', label: 'This week (Mon–Sun)' },
      { key: 'lastweek', label: 'Last week' }, { key: 'custom', label: 'Choose dates…' },
    ]);
    if (!k) return undefined;
    if (k === 'full') return null;
    let from: string | undefined, to: string | undefined;
    if (k === 'custom') {
      const today = localISODate(new Date());
      const f = await askDate('From'); if (f === null) return undefined;
      const t = await askDate('To', { min: f || undefined }); if (t === null) return undefined;
      from = f || today; to = t || from;
    }
    const p = sowPeriod(k, from, to);
    if (p === 'bad') { toast('Pick a valid from and to date.'); return undefined; }
    return p;
  };
  const build = async (period: SowPeriod) => {
    const r = await buildSowPdf(site, org, tab, period, toast).catch(() => 'Could not build the PDF.');
    if (typeof r === 'string') { toast(r); return null; }
    return r;
  };
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
      <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'pdf'} title="📄 Export PDF" onPress={async () => {
        const p = await askPeriod(); if (p === undefined) return;
        setBusy('pdf'); const b = await build(p); if (b && !(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); setBusy(null);
      }} /></View>
      <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'email'} title="✉ Email Report" onPress={async () => {
        // 500 openScheduleEmailPrompt: tick PMs / admins (you're ticked), or add any address; CC the client.
        const pick = (people ?? []).filter((p) => (p.role === 'pm' || p.role === 'admin') && p.email && !(p.role === 'pm' && p.is_estimator)).map((p) => ({ name: p.name || p.email as string, email: p.email as string }));
        const r = await promptEmail('Email Schedule of Works Report', { pick, ticked: me.email && pick.some((p) => p.email === me.email) ? [me.email] : [], clientEmail: site.client_email });
        if (!r) return;
        const list = r.to.split(',');
        const p = await askPeriod(); if (p === undefined) return;
        const cc: string | null = r.clientCc ?? null;
        setBusy('email');
        const b = await build(p);
        if (b) { const err = await emailSowPdf(site.id, b.bytes, b.filename, list, cc); if (err) showAlert(err); else toast(`Emailed to ${list.length} recipient${list.length > 1 ? 's' : ''}`); }
        setBusy(null);
      }} /></View>
    </View>
  );
}
