// Finance › New project (908 openFinNewJob / saveFinNewJob): name, number
// (or the next automatic one), status, how you get paid, contract value, the
// client PO (number + files), the client from the Directory (a new name is
// added), address and start date; PM and job type for companies with
// Projects. Lands on the job's Finance page. During the Finance trial this is
// only for Finance-only companies and the sandbox (9219e) — RTB sets new jobs
// up in Projects.
import { useQueryClient, useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FinChip } from '@/components/FinNav';
import { useToast } from '@/components/toast';
import { Button, Card, Field, Muted } from '@/components/ui';
import { useTeam } from '@/data/admin';
import { fdb } from '@/data/finance';
import { useAuth } from '@/lib/auth';
import { isFinanceOnlyOrg } from '@/lib/roles';
import { FIN_SANDBOX_ORGS, FIN_TRIAL, FIN_TRIAL_MSG, round2 } from '@/lib/rules/finance';
import { supabase } from '@/lib/supabase';
import { base, page, space } from '@/theme/theme';

type Row = Record<string, any>;
const uuid = () => globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); });
const vatOf = (c: Row | null) => { const v = c?.sales_vat; if (!v) return null; if (/^rc/.test(v)) return 'reverse_charge'; return v === '0' || v === 'ex' || v === 'none' ? 'zero' : 'standard'; };

export default function FinNewJob() {
  const { me, org } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const finOnly = isFinanceOnlyOrg(org);
  const sandbox = !!me?.org_id && FIN_SANDBOX_ORGS.includes(me.org_id);
  const blocked = FIN_TRIAL && !finOnly && !sandbox;
  const { data: nums } = useQuery({ queryKey: ['finOrgNums', me?.org_id], enabled: !!me && !blocked, queryFn: async () => (await fdb.from('organizations').select('auto_job_numbers,job_number_prefix,next_job_number').eq('id', me?.org_id as string).maybeSingle()).data as Row | null });
  const { data: clients } = useQuery({ queryKey: ['finClientsAll', me?.org_id], enabled: !!me && !blocked, queryFn: async () => ((await fdb.from('fin_clients').select('*').eq('org_id', me?.org_id as string).order('name')).data as Row[] | null) ?? [] });
  const { data: team } = useTeam(!blocked && !finOnly ? me?.org_id : null);
  const pms = (team ?? []).filter((p) => p.role === 'pm' || p.role === 'admin');
  const [v, setV] = useState<Record<string, string>>({ status: 'live', kind: 'single', pm: me?.id || '' });
  const [files, setFiles] = useState<{ uri: string; name: string; mime: string; size: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  const auto = !!nums?.auto_job_numbers;
  const q = (v.client || '').trim().toLowerCase();
  const matches = q ? (clients ?? []).filter((c) => String(c.name || '').toLowerCase().includes(q) && String(c.name).toLowerCase() !== q).slice(0, 5) : [];

  if (blocked) return (
    <ScrollView contentContainerStyle={page(700)}>
      <Stack.Screen options={{ title: 'New project' }} />
      <Card><Muted>{`${FIN_TRIAL_MSG} — set new jobs up in Projects. Once a job exists there, its Finance page is ready here.`}</Muted></Card>
      <Button title="Go to Projects" onPress={() => router.push('/sites' as never)} />
    </ScrollView>
  );

  const save = async () => {
    if (!me) return;
    const name = (v.name || '').trim(), no = (v.no || '').trim(), bt = v.bt, poNo = (v.po || '').trim();
    if (!name) { toast('Give the project a name.'); return; }
    if (!auto && !no) { toast('Enter a project number.'); return; }
    if (!bt) { toast('Choose how you get paid on this project.'); return; }
    if (files.length && !poNo) { toast('Add the client PO number for the PO copy.'); return; }
    if (files.some((f) => f.size > 20 * 1024 * 1024)) { toast('One of the PO files is over 20 MB.'); return; }
    const cvRaw = Number(String(v.cv || '').replace(/[£,\s]/g, '')); const cv = v.cv && cvRaw > 0 ? round2(cvRaw) : null;
    setBusy(true);
    try {
      // Client from the Directory — a new name is added to it.
      const cname = (v.client || '').trim();
      let cli: Row | null = cname ? (clients ?? []).find((c) => String(c.name || '').trim().toLowerCase() === cname.toLowerCase()) || null : null;
      if (cname && !cli) cli = ((await fdb.from('fin_clients').insert({ org_id: me.org_id, name: cname, created_by: me.id } as never).select('*').single()).data as Row | null) ?? null;
      const id = uuid();
      const row: Row = { id, org_id: me.org_id, name, address: (v.addr || '').trim() || null, postcode: (v.pc || '').trim() || null, job_number: auto ? null : no, status: v.status || 'live', start_date: (v.start || '').trim() || null, client_name: cli?.name || cname || null, client_email: cli?.email || null, created_by: me.id };
      if (!finOnly) { row.responsible_pm_id = v.pm || null; row.multi_site = v.kind === 'multi'; row.repair_contract = v.kind === 'repair'; }
      // Plain insert (the "return the row" form can be refused by the policy).
      const r = await fdb.from('sites').insert(row as never);
      if (r.error) { toast(`Could not create the project — ${r.error.message}`); return; }
      await fdb.from('job_finance').upsert({ site_id: id, org_id: me.org_id, billing_type: bt, billing_name: row.client_name, billing_email: row.client_email, billing_address: cli ? [cli.address, cli.postcode].filter(Boolean).join('\n') || null : null, vat_treatment: vatOf(cli), contract_value: cv, original_value: cv, contract_value_manual: cv, contract_value_source: cv != null ? 'manual' : null, updated_at: new Date().toISOString(), updated_by: me.id } as never, { onConflict: 'site_id' });
      let warn = '';
      if (poNo) {
        const up: { path: string; name: string }[] = [];
        for (const f of files) {
          const bytes = new Uint8Array(await (await fetch(f.uri)).arrayBuffer());
          const s = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${id}/client-po/${uuid()}-${f.name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, bytes, { contentType: f.mime || 'application/octet-stream' });
          if (!s.error) up.push({ path: s.data.path, name: f.name });
        }
        const p = await fdb.from('client_pos').insert({ org_id: me.org_id, site_id: id, created_by: me.id, po_number: poNo, is_primary: true, file_path: up[0]?.path ?? null, file_name: up[0]?.name ?? null, files: up } as never);
        if (p.error) warn = 'Project created, but the client PO didn’t save — add it in Project Admin.';
        else if (up.length < files.length) warn = 'Project created. Some PO files didn’t upload — add them from Project Admin.';
      }
      const made = ((await fdb.from('sites').select('job_number').eq('id', id).maybeSingle()).data as Row | null) ?? row;
      void qc.invalidateQueries();
      toast(warn || `Project ${made.job_number || ''} created`);
      router.replace(`/fin/job/${id}` as never);
    } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={page(700)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New project' }} />
      <Card>
        <Field label="Project name *" value={v.name || ''} onChangeText={set('name')} />
        <Field label="Project number *" value={auto ? `${nums?.job_number_prefix || ''}${nums?.next_job_number ?? ''} (automatic)` : v.no || ''} onChangeText={set('no')} editable={!auto} />
        <Muted style={{ fontWeight: '700', marginTop: 4 }}>Status</Muted>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginVertical: 4 }}>{[['upcoming', 'Upcoming'], ['live', 'Live'], ['closed', 'Closed']].map(([k, l]) => <FinChip key={k} on={v.status === k} label={l} onPress={() => set('status')(k)} />)}</View>
        <Muted style={{ fontWeight: '700', marginTop: 4 }}>Payment Procedure *</Muted>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginVertical: 4 }}>{[['invoice', 'Invoice'], ['application', 'Application for payment']].map(([k, l]) => <FinChip key={k} on={v.bt === k} label={l} onPress={() => set('bt')(k)} />)}</View>
        <Muted style={{ fontSize: 11.5, marginBottom: 6 }}>Invoice jobs have no applications or retention.</Muted>
        <Field label="Contract value (excl. VAT)" value={v.cv || ''} onChangeText={set('cv')} keyboardType="decimal-pad" placeholder="£0.00" />
        <Field label="Client PO number" value={v.po || ''} onChangeText={set('po')} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <Button kind="ghost" title="📎 Add PO files" onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true }); if (r.canceled) return; setFiles((o) => [...o, ...r.assets.map((a) => ({ uri: a.uri, name: a.name || 'po', mime: a.mimeType || '', size: a.size || 0 }))]); }} />
          {files.map((f, i) => <FinChip key={i} on label={`${f.name} ✕`} onPress={() => setFiles((o) => o.filter((_, j) => j !== i))} />)}
        </View>
        {!finOnly && <>
          <Muted style={{ fontWeight: '700' }}>Project manager</Muted>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginVertical: 4 }}>{pms.map((p) => <FinChip key={p.id} on={v.pm === p.id} label={p.name} onPress={() => set('pm')(p.id)} />)}</View>
          <Muted style={{ fontWeight: '700' }}>Type</Muted>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginVertical: 4 }}>{[['single', 'Single site'], ['multi', 'Multi-site (plots / addresses)'], ['repair', 'Repair contract']].map(([k, l]) => <FinChip key={k} on={v.kind === k} label={l} onPress={() => set('kind')(k)} />)}</View>
        </>}
        <Field label="Client" value={v.client || ''} onChangeText={set('client')} placeholder="From the Directory — a new name is added" />
        {matches.map((c) => <Text key={c.id} onPress={() => set('client')(c.name)} style={{ color: base.blue, paddingVertical: 4 }}>→ {c.name}</Text>)}
        <Field label="Site address" value={v.addr || ''} onChangeText={set('addr')} multiline />
        <Field label="Postcode" value={v.pc || ''} onChangeText={set('pc')} autoCapitalize="characters" />
        <Field label="Start date" value={v.start || ''} onChangeText={set('start')} placeholder="YYYY-MM-DD" />
      </Card>
      <Button busy={busy} title="Create project" onPress={() => void save()} />
    </ScrollView>
  );
}
