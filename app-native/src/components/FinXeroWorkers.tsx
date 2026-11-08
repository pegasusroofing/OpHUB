// Directory › Labour › Bring People In From Xero (old 9216-finance-xero-workers.js): subcontractors and PAYE staff read
// from Xero, each matched to someone already in OpHUB or added as a new worker. Only reads from Xero; nothing is removed.
// During the Finance trial it's blocked for RTB, as in the current app (Sandbox Roofing can use it).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Popup } from '@/components/Popup';
import { useToast } from '@/components/toast';
import { Button, Check, Muted } from '@/components/ui';
import { fdb, finInvoke, selectAll } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/rules/finance';
import { xeroWorkerMatch, xeroWorkerPatch, type XeroMatch, type XeroPerson } from '@/lib/rules/xeroWorkers';
import { base } from '@/theme/theme';

type Row = Record<string, any>;
type Item = XeroPerson & { i: number; match: XeroMatch | null; tick: boolean };

export function XeroWorkersButton() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [state, setState] = useState<{ people: Item[]; notes: string[]; names: Record<string, string> } | 'loading' | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const open = async () => {
    setState('loading');
    const [j, rates, profiles] = await Promise.all([
      finInvoke<{ people?: XeroPerson[]; notes?: string[] }>(me, 'xero', { action: 'workers' }),
      selectAll<Row>('fin_labour_rates', '*', (x) => x.eq('org_id', me.org_id as string)),
      selectAll<Row>('profiles', 'id,name,email', (x) => x.eq('org_id', me.org_id as string)),
    ]);
    if (j.error) { setState(null); toast(/not_configured|not connected/i.test(j.error) ? 'Xero isn’t connected yet — connect it in Finance › Settings, then try again.' : `Xero: ${j.error.slice(0, 160)}`); return; }
    const byKey: Record<string, Row> = {}; rates.forEach((r) => { byKey[r.user_id || `w:${r.id}`] = r; });
    const names: Record<string, string> = {}; profiles.forEach((p) => { names[p.id] = p.name || 'Someone'; });
    const people = (j.data?.people || []).map((p, i) => { const m = xeroWorkerMatch(p, byKey, profiles as never); return { ...p, i, match: m, tick: !m || m.how !== 'linked' }; });
    setState({ people, notes: j.data?.notes || [], names });
  };
  const save = async () => {
    if (!state || state === 'loading') return;
    const pick = state.people.filter((p) => p.tick); if (!pick.length) return;
    setBusy(true);
    const now = new Date().toISOString();
    let added = 0, updated = 0, failed = 0;
    for (const p of pick) {
      const row = xeroWorkerPatch(p, now), m = p.match;
      let ok = false;
      if (m && m.key.startsWith('w:')) {
        if (!m.row.email && p.email) row.email = p.email;
        ok = !!(await fdb.from('fin_labour_rates').update(row as never).eq('id', m.key.slice(2)).select('id')).data?.length; if (ok) updated++;
      } else if (m) {
        ok = !(await fdb.from('fin_labour_rates').upsert({ org_id: me.org_id, user_id: m.key, ...row } as never, { onConflict: 'org_id,user_id' })).error; if (ok) updated++;
      } else {
        ok = !(await fdb.from('fin_labour_rates').insert({ org_id: me.org_id, user_id: null, name: String(p.name || 'Worker').slice(0, 200), email: p.email || null, cis_rate: row.cis_rate != null ? row.cis_rate : 20, vat_registered: !!p.vat_registered, active: true, ...row } as never)).error; if (ok) added++;
      }
      if (!ok) failed++;
    }
    setBusy(false); setState(null);
    void qc.invalidateQueries({ queryKey: ['finDir'] });
    toast([added ? `${added} added` : '', updated ? `${updated} updated` : '', failed ? `${failed} couldn’t be saved — try again` : ''].filter(Boolean).join(', ') || 'Nothing changed', { confirm: true });
  };
  const st = state && state !== 'loading' ? state : null;
  const n = st ? st.people.filter((p) => p.tick).length : 0;
  const setAll = (v: boolean) => { if (st) setState({ ...st, people: st.people.map((p) => ({ ...p, tick: v })) }); };
  const group = (kind: 'sub' | 'paye', title: string) => {
    const ps = st?.people.filter((p) => p.kind === kind) || []; if (!ps.length) return null;
    return (
      <View key={kind}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: base.slate, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 4 }}>{title} ({ps.length})</Text>
        {ps.map((p) => {
          const m = p.match;
          const where = !m ? 'New' : m.how === 'linked' ? 'Already Linked' : `Matches ${m.key.startsWith('w:') ? (m.row.name || 'worker') : st?.names[m.key] || 'someone'}`;
          const bits = [kind === 'sub' ? (p.cis_rate != null ? `CIS ${p.cis_rate}%` : 'CIS not set') : '', p.day_rate != null ? `${money(p.day_rate)}/day${p.rate_note ? ` · ${p.rate_note}` : ''}` : kind === 'paye' ? 'No pay rate in Xero' : '', p.vat_registered ? 'VAT registered' : '', p.email || ''].filter(Boolean);
          return (
            <View key={p.i} style={{ borderBottomWidth: 1, borderBottomColor: '#EEF0F2', paddingVertical: 4 }}>
              <Check label={`${p.name || '(No Name)'} — ${where}`} value={p.tick} onChange={(v) => st && setState({ ...st, people: st.people.map((x) => (x.i === p.i ? { ...x, tick: v } : x)) })} />
              {!!bits.length && <Muted style={{ fontSize: 12, marginLeft: 30 }}>{bits.join(' · ')}</Muted>}
            </View>
          );
        })}
      </View>
    );
  };
  return (
    <>
      <Button kind="ghost" busy={state === 'loading'} title="Bring People In From Xero" onPress={() => void open()} />
      {st && (
        <Popup title="Bring In From Xero" onClose={() => setState(null)} width={460}
          footer={st.people.length ? <View style={{ alignItems: 'center' }}><Button busy={busy} disabled={!n} title={`Import ${n} ${n === 1 ? 'Person' : 'People'}`} onPress={() => void save()} /></View> : undefined}>
          {st.notes.map((t) => <Muted key={t} style={{ marginBottom: 4 }}>{t}</Muted>)}
          {st.people.length ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 4 }}><Button small kind="ghost" title="Tick All" onPress={() => setAll(true)} /><Button small kind="ghost" title="Untick All" onPress={() => setAll(false)} /></View>
              <ScrollView style={{ maxHeight: 380 }}>{group('sub', 'Subcontractors')}{group('paye', 'PAYE Staff')}</ScrollView>
              <Muted style={{ fontSize: 12, marginTop: 8 }}>Ticked people are added as workers, or their pay type, CIS rate and day rate are updated if they’re already in OpHUB. Rates you’ve typed in are only replaced when Xero has one.</Muted>
            </>
          ) : <Muted>No subcontractors or staff found in Xero.</Muted>}
        </Popup>
      )}
    </>
  );
}
