// Export / Email for PUWER (680): one operative's inspection, or every
// operative on the job for that week.
import { useState } from 'react';
import { View } from 'react-native';

import { confirmAsk, useToast } from '@/components/toast';
import { Button } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { deliverPdf } from '@/lib/pdf';
import { buildPuwerPdf, emailPuwerPdf } from '@/lib/puwerPdf';
import { supabase } from '@/lib/supabase';

export function PuwerPdfButtons({ siteId, weekStart, one }: { siteId: string; weekStart: string; one?: { id: string; name: string } }) {
  const { org } = useAuth();
  const toast = useToast();
  const { data: site } = useSite(siteId);
  const { data: people } = usePeople();
  const [busy, setBusy] = useState<'pdf' | 'email' | null>(null);
  if (!site) return null;
  const run = async (k: 'pdf' | 'email') => {
    let cc: string | null = null;
    if (k === 'email' && site.client_email && (await confirmAsk(`CC client contact${site.client_contact_name || site.client_name ? ` (${site.client_contact_name || site.client_name})` : ''} on this email?`, 'Yes, CC them'))) cc = site.client_email;
    setBusy(k); toast('Building PDF…');
    try {
      let ops = one ? [one] : [];
      if (!one) {
        const a = (((await supabase.from('site_assignments').select('user_id').eq('site_id', siteId)).data ?? []) as { user_id: string }[]).map((x) => x.user_id);
        ops = a.length ? ((((await supabase.from('profiles').select('id,name,role').in('id', a)).data ?? []) as { id: string; name: string; role: string }[]).filter((p) => p.role === 'operative').sort((x, y) => x.name.localeCompare(y.name))) : [];
      }
      if (!ops.length) { toast(k === 'pdf' ? 'No operatives to export.' : 'No operatives to email.'); return; }
      const b = await buildPuwerPdf(site, org, weekStart, ops, one ? one.name : 'All Operatives', (u) => nameOf(people, u));
      if (k === 'pdf') { if (!(await deliverPdf(b.bytes, b.filename))) toast('Could not save the PDF.'); }
      else toast(await emailPuwerPdf(siteId, b.bytes, b.filename, b.weekLabel, one ? one.name : 'All Operatives', cc));
    } catch { toast(k === 'pdf' ? 'Export failed — try again.' : 'Email failed — try again.'); } finally { setBusy(null); }
  };
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
      <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'pdf'} title={one ? 'Export PDF' : 'Export All'} onPress={() => void run('pdf')} /></View>
      <View style={{ flex: 1 }}><Button kind="ghost" busy={busy === 'email'} title={one ? 'Email PUWER Report' : 'Email All'} onPress={() => void run('email')} /></View>
    </View>
  );
}
