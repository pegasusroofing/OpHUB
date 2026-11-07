// Finance › a repair contract › Works Orders (Andy, 7 Nov 2026): like plots — costs go to the contract, then the job.
// Every job with where it's at, what it was quoted and what it's cost so far; Invoice Done Jobs puts every checked job
// not invoiced yet on one invoice (or open a job and Raise Invoice for just that one). Tap a job for its hub.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { FinJobTabs, FinPage, FinStat } from '@/components/FinNav';
import { Cell, FinTable } from '@/components/FinTable';
import { confirmAsk, useToast } from '@/components/toast';
import { Button, Muted } from '@/components/ui';
import { useBook } from '@/data/finBook';
import { raiseRepairInvoice } from '@/data/repairInvoice';
import { useRepairJobs } from '@/data/repairs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { forecast } from '@/lib/rules/finBook';
import { money } from '@/lib/rules/finance';
import { repairStage, STAGE_LABEL, type RJob } from '@/lib/rules/repairStages';
import { base } from '@/theme/theme';

type Row = Record<string, any>;

export default function FinRepairs() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: jobs = [] } = useRepairJobs(id);
  const { data: book } = useBook(me?.org_id, id);
  const [busy, setBusy] = useState(false);
  if (!me || !site) return <FinPage title="Works Orders" section="jobs"><Muted>Loading…</Muted></FinPage>;
  const fc = book ? forecast(book.book, id, book.settings) : null;
  const costOf = (jid: string) => (fc ? fc.lines.filter((l) => l.sub === jid && l.cat !== 'committed').reduce((t, l) => t + l.net, 0) : 0);
  const all = jobs as unknown as (RJob & Row)[];
  const invStage = (j: RJob & Row) => (j.invoice_id ? (j.invoiced ? 'Invoiced' : 'Invoice Draft') : STAGE_LABEL[repairStage(j)]);
  const ready = all.filter((j) => repairStage(j) === 'done' && j.closed && !j.invoice_id);
  const quoted = all.reduce((t, j) => t + Number(j.variation_cost || 0), 0);
  const costs = all.reduce((t, j) => t + costOf(j.id), 0);
  const toInvoice = ready.reduce((t, j) => t + Number(j.variation_cost || 0), 0);
  const invoiceDone = async () => {
    if (!ready.length) { toast('No checked jobs waiting to be invoiced. A job is checked in its hub (Update ▾ › Checked).'); return; }
    if (!(await confirmAsk(`Put ${ready.length} done job${ready.length === 1 ? '' : 's'} (${money(toInvoice)}) on one invoice?`, 'Yes, Invoice Them'))) return;
    setBusy(true); const inv = await raiseRepairInvoice(me, site as never, ready); setBusy(false);
    if (!inv) { toast('Could not start the invoice — try again.'); return; }
    void qc.invalidateQueries({ queryKey: ['repairJobs', id] });
    router.push(`/fin/job/${id}/invoice/${inv}` as never);
  };
  return (
    <FinPage title="Works Orders" section="jobs">
      <Stack.Screen options={{ title: 'Works Orders' }} />
      <FinJobTabs id={id} active="overview" job={(site as Row).job_number} name={site.name} onOverview={false} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }}>
        <FinStat v={money(quoted, 0)} label="Quoted" /><FinStat v={money(costs, 0)} label="Costs" /><FinStat v={money(toInvoice, 0)} label={`Done, To Invoice (${ready.length})`} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
        <Button busy={busy} title={`Invoice Done Jobs (${ready.length})`} onPress={() => void invoiceDone()} />
        <Button kind="ghost" title="+ New Job" onPress={() => router.push(`/sites/${id}/repairs` as never)} />
        <Button kind="ghost" title="Costs By Job ›" onPress={() => router.push(`/fin/job/${id}/parts` as never)} />
      </View>
      {all.length ? (
        <FinTable rows={all} keyOf={(j) => j.id} onRow={(j) => router.push(`/fin/job/${id}/repair/${j.id}` as never)} defaultSort={{ k: 'no', dir: 'desc' }}
          cols={[
            { k: 'no', l: 'Job', min: 90, sort: (j) => String(j.job_number || ''), render: (j) => <Cell bold>{j.job_number || '—'}</Cell> },
            { k: 'a', l: 'Address', flex: 2, min: 180, render: (j) => <Cell>{j.address || '—'}</Cell> },
            { k: 's', l: 'Stage', flex: 1.2, min: 130, choices: ['To Book', 'Booked In', 'Attended', 'Quote Needed', 'Awaiting Approval', 'Approved — To Book', 'Approved — Booked In', 'Works Done', 'Invoice Draft', 'Invoiced', 'Rejected'], text: (j) => invStage(j), render: (j) => <Cell>{invStage(j)}{j.on_hold ? ' · On Hold' : ''}</Cell> },
            { k: 'q', l: 'Quoted', min: 90, sort: (j) => Number(j.variation_cost || 0), total: (rs) => money(rs.reduce((t, j) => t + Number(j.variation_cost || 0), 0)), render: (j) => <Cell>{j.variation_cost != null ? money(j.variation_cost) : '—'}</Cell> },
            { k: 'c', l: 'Costs', min: 90, sort: (j) => costOf(j.id), total: (rs) => money(rs.reduce((t, j) => t + costOf(j.id), 0)), render: (j) => <Cell>{costOf(j.id) ? money(costOf(j.id)) : '—'}</Cell> },
            { k: 'm', l: 'Margin', min: 90, sort: (j) => (j.variation_cost != null ? Number(j.variation_cost) - costOf(j.id) : -1e9), render: (j) => <Cell>{j.variation_cost != null ? money(Number(j.variation_cost) - costOf(j.id)) : '—'}</Cell> },
          ]}
          footLabel={(rs) => `${rs.length} job${rs.length === 1 ? '' : 's'}`} />
      ) : <Muted>No jobs on this contract yet. + New Job adds one from its works order.</Muted>}
      <Text style={{ color: base.slate, marginTop: 8, fontSize: 12 }}>Costs are booked to the contract, then to the job (on the PO, purchase invoice or wages), as with plots.</Text>
    </FinPage>
  );
}
