// Wages and labour waiting to go against a price (9217 pmWagePushesHtml), for the Price tile and Finance: choose the price and
// week and it goes into that price's labour wages, or send it to other job costs if it isn't price work.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { chooseAction, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { useSites } from '@/data/sites';
import { bookWage, unbookWage, useWagePushes, wagesOff } from '@/data/wageBook';
import { fdate, jobTag, money } from '@/lib/rules/finance';
import { PUSH_LABEL, weekChoices } from '@/lib/rules/wageBook';
import type { Profile } from '@/lib/types';
import { base } from '@/theme/theme';

export function WagesToBook({ me, siteId, invoiceId, title = 'Wages to book', showEmpty }: { me: Profile; siteId?: string; invoiceId?: string; title?: string; showEmpty?: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data } = useWagePushes(me, { siteId, invoiceId });
  const [busy, setBusy] = useState('');
  if (!data) return null;
  const refresh = () => ['wagePushes', 'toBook', 'priceTile', 'finSubs', 'siteHome'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const run = async (id: string, f: () => Promise<string | null>, done: string) => { setBusy(id); const e = await f(); setBusy(''); toast(e || done); refresh(); };
  const toPrice = async (p: Record<string, any>) => {
    const els = data.prices.filter((x) => x.site_id === p.site_id);
    if (!els.length) { toast('This job has no prices yet. Add one in its Price tile.'); return; }
    const k = els.length === 1 ? els[0].id : await chooseAction('Which price?', els.map((x) => ({ key: x.id, label: `${x.name}${x.sheet ? ' (price sheet)' : ''}` })));
    const el = els.find((x) => x.id === k); if (!el) return;
    const opts = weekChoices(el.latest, data.starts[p.site_id], p.week_start);
    const wk = await chooseAction(`Which week of ${el.name}?`, opts.map((o) => ({ key: String(o.week), label: `${o.picked ? '✓ ' : ''}${o.label}` })));
    if (!wk) return;
    await run(p.id, () => bookWage(me, p.id, 'price', el.id, Number(wk)), `Added to ${el.name}, week ${wk}`);
  };
  if (!data.pushes.length) {
    if (!showEmpty) return null;
    return <><SectionTitle>{title}</SectionTitle><Empty>{wagesOff(me.org_id) ? 'Sending wages to prices is off during the Finance trial.' : 'Nothing waiting.'}</Empty></>;
  }
  const total = data.pushes.reduce((t, p) => t + Number(p.amount || 0), 0);
  return (
    <>
      <SectionTitle>{`${title} (${data.pushes.length}, ${money(total)})`}</SectionTitle>
      <Card>
        {data.pushes.map((p, i) => {
          const s = sites.find((x) => x.id === p.site_id), el = data.prices.find((x) => x.id === p.element_id);
          return (
            <View key={p.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: base.line, paddingVertical: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: base.ink }}>{p.person_name || 'Worker'}</Text>
                  <Muted>{[!siteId && s ? jobTag(s) : '', p.week_start ? `w/c ${fdate(p.week_start)}` : '', Number(p.days) ? `${Number(p.days)} day${Number(p.days) === 1 ? '' : 's'}` : '', p.description].filter(Boolean).join(' · ')}</Muted>
                </View>
                <Text style={{ fontWeight: '800', color: base.ink }}>{money(Number(p.amount || 0))}</Text>
              </View>
              {p.status === 'pending' ? (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                  <View style={{ flex: 1 }}><Button small busy={busy === p.id} title="Book to a price…" onPress={() => void toPrice(p)} /></View>
                  <View style={{ flex: 1 }}><Button small kind="ghost" title="Other job costs" onPress={() => void run(p.id, () => bookWage(me, p.id, 'general'), 'Added to other job costs')} /></View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <Text style={{ color: base.ok, fontWeight: '700', flex: 1 }}>{PUSH_LABEL[p.status] || p.status}{p.status === 'price' ? `${el ? `: ${el.name}` : ''}, week ${p.week_number}` : ''}</Text>
                  <Button small kind="ghost" title="Change" onPress={() => void run(p.id, () => unbookWage(p.id), 'Back to be booked')} />
                </View>
              )}
            </View>
          );
        })}
      </Card>
    </>
  );
}
