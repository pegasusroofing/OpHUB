// Variations register for one project (911 / 9219s): issued → approved or
// rejected, with the value issued, the approved value and the cost estimate.
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinChip, FinRow, FinStat } from '@/components/FinNav';
import { promptText, useToast } from '@/components/toast';
import { Button, Empty, Muted } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { fdb, insertNumbered } from '@/data/finance';
import { useBook } from '@/data/finBook';
import { importSiteVariations, setVarGroup, varToSow } from '@/data/finVar';
import { openDocLink } from '@/data/hs';
import { useSites } from '@/data/sites';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import { isFinanceOnlyOrg } from '@/lib/roles';
import { fdate, money, num, round2, today } from '@/lib/rules/finance';
import { base, page, space } from '@/theme/theme';

type Row = Record<string, any>;
const ST: Record<string, [string, string]> = { instructed: ['Instructed', '#7A7F87'], priced: ['Priced', '#2F6FB3'], submitted: ['Issued', '#D98A00'], agreed: ['Approved', '#1E7A3C'], rejected: ['Rejected', '#C0392B'] };

export default function FinVariations() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, org } = useAuth();
  const { data: sites = [] } = useSites();
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useBook(me?.org_id, id);
  const [f, setF] = useState('all');
  const [edit, setEdit] = useState<Row | 'new' | null>(null);
  // Variations raised on site (Projects › Variations) come in here on their own (not for Finance-only companies).
  const finOnly = isFinanceOnlyOrg(org);
  const [site, setSite] = useState<Row[]>([]);
  useEffect(() => {
    if (!me || !id || finOnly) return;
    void importSiteVariations(me, id).then((r) => { setSite(r.site); if (r.added) void qc.invalidateQueries({ queryKey: ['finBook'] }); });
  }, [me, id, finOnly, qc]);
  const [busy, setBusy] = useState('');
  // The instruction / quote document on a variation (911 finVaFile).
  const [vfile, setVfile] = useState<{ uri: string; name: string; mimeType?: string | null } | null>(null);
  if (!data || !me) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  const vars = data.book.vars.filter((v) => v.site_id === id).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const g = (v: Row) => (v.status === 'agreed' ? 'agreed' : v.status === 'rejected' ? 'rejected' : 'submitted');
  const list = vars.filter((v) => f === 'all' || g(v) === f);
  const sum = (k: string, fn: (v: Row) => boolean) => round2(vars.filter(fn).reduce((t, v) => t + Number(v[k] || 0), 0));
  const cur = edit && edit !== 'new' ? edit : null;
  // The register as Excel or PDF (911 finVarExport).
  const exportReg = async (kind: 'xlsx' | 'pdf') => {
    const sn = sites.find((x) => x.id === id), label = [sn?.job_number, sn?.name].filter(Boolean).join(' · ');
    const t: Table = { title: 'Variations register', sub: label, site: [sn?.job_number, sn?.name].filter(Boolean).join(' '),
      cols: [{ l: 'No.', w: 50 }, { l: 'Variation', w: 230 }, { l: 'Instruction', w: 110 }, { l: 'Instructed', w: 70 }, { l: 'Status', w: 70 }, { l: 'Our cost £', money: true, w: 70 }, { l: 'Quoted £', money: true, w: 70 }, { l: 'Agreed £', money: true, w: 70 }],
      rows: vars.map((v) => [v.number, v.title, [v.instruction_ref, v.instructed_by].filter(Boolean).join(' · '), v.instructed_on ? fdate(v.instructed_on) : '', ST[v.status]?.[0] || v.status, v.cost_estimate != null ? Number(v.cost_estimate) : null, v.quoted != null ? Number(v.quoted) : null, v.agreed_value != null ? Number(v.agreed_value) : null]),
      totals: ['Total', '', '', '', '', sum('cost_estimate', () => true), sum('quoted', () => true), sum('agreed_value', () => true)] };
    if (!(await (kind === 'xlsx' ? exportTableExcel(t, org) : exportTablePdf(t, org)))) toast('Could not make the file — try again.');
  };
  const refresh = () => void qc.invalidateQueries({ queryKey: ['finBook'] });
  const siteBy: Record<string, Row> = {}; site.forEach((x) => { siteBy[x.id] = x; });
  const inSow = (v: Row) => !!(v.schedule_section_id || (v.variation_id && siteBy[v.variation_id]?.schedule_section_id));
  const quick = async (v: Row, gr: 'approved' | 'rejected') => {
    let value: number | undefined;
    if (gr === 'approved') {
      const def = v.agreed_value ?? v.quoted;
      const t = await promptText(`Approve ${v.number} — approved value (£)`, def != null ? String(def) : ''); if (t == null) return;
      const n = num(t); if (n === null || isNaN(n)) { toast('Enter the approved value.'); return; }
      value = n;
    }
    setBusy(v.id);
    const ok = await setVarGroup(v, gr, value).finally(() => setBusy(''));
    toast(ok ? (gr === 'approved' ? 'Approved — it goes onto the next application' : 'Variation rejected') : 'Could not save — try again.'); refresh();
  };
  const toSow = async (v: Row) => {
    setBusy(v.id);
    const r = await varToSow(me, id, v, site).finally(() => setBusy(''));
    toast(r.error || r.ok || ''); if (r.ok) { refresh(); void importSiteVariations(me, id).then((x) => setSite(x.site)); }
  };
  const small = (label: string, onPress: () => void, color = base.blue) => (
    <Pressable onPress={onPress} disabled={!!busy} style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 7, borderWidth: 1, borderColor: base.cardLine, opacity: busy ? 0.5 : 1 }}><Text style={{ fontSize: 12, fontWeight: '700', color }}>{label}</Text></Pressable>
  );
  return (
    <ScrollView contentContainerStyle={page(900)}>
      <Stack.Screen options={{ title: 'Variations' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={money(sum('agreed_value', (v) => v.status === 'agreed'), 0)} label="Approved" />
        <FinStat v={money(sum('quoted', (v) => ['priced', 'submitted'].includes(v.status)), 0)} label="Issued, waiting for approval" />
        <FinStat v={money(sum('quoted', (v) => v.status === 'rejected'), 0)} label="Rejected" />
      </View>
      <Muted style={{ marginBottom: 10 }}>{`Only approved variations go onto applications, at their approved value.${finOnly ? '' : ' Variations raised on site (Projects › Variations) come in here on their own.'}`}</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {[['all', 'All'], ['submitted', 'Issued'], ['agreed', 'Approved'], ['rejected', 'Rejected']].map(([k, l]) => <FinChip key={k} on={f === k} label={l} n={vars.filter((v) => k === 'all' || g(v) === k).length} onPress={() => setF(k)} />)}
        <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 6 }}>
          <Button kind="ghost" title="Excel" onPress={() => void exportReg('xlsx')} />
          <Button kind="ghost" title="PDF" onPress={() => void exportReg('pdf')} />
          <Button title="+ Variation" onPress={() => setEdit('new')} />
        </View>
      </View>
      {list.length ? list.map((v) => <FinRow key={v.id} left={v.number} title={v.title} sub={[ST[v.status]?.[0] || v.status, v.instructed_by ? `by ${v.instructed_by}` : '', v.submitted_on ? `issued ${fdate(v.submitted_on)}` : '', v.agreed_on && v.status === 'agreed' ? `approved ${fdate(v.agreed_on)}` : '', v.cost_estimate != null ? `cost ${money(v.cost_estimate)}` : ''].filter(Boolean).join(' · ')} right={money(v.status === 'agreed' ? v.agreed_value ?? v.quoted : v.quoted)} tone={ST[v.status]?.[1]} onPress={() => setEdit(v)}>
          {(v.variation_id || g(v) === 'submitted' || !finOnly) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 5 }}>
              {!!v.variation_id && <Text style={{ fontSize: 11, fontWeight: '700', color: '#7A7F87', backgroundColor: '#F0F1F4', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>Site</Text>}
              {g(v) === 'submitted' && small('Approve', () => void quick(v, 'approved'), '#1E7A3C')}
              {g(v) === 'submitted' && small('Reject', () => void quick(v, 'rejected'), '#C0392B')}
              {!finOnly && (inSow(v) ? <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E7A3C' }}>✓ On the schedule</Text> : v.status !== 'rejected' ? small('+ Schedule of Works', () => void toSow(v)) : null)}
            </View>
          )}
        </FinRow>)
        : <Empty>No variations yet.</Empty>}
      {edit && (
        <FinForm title={cur ? `Variation ${cur.number}` : 'New variation'} initial={cur ? { ...cur, status: g(cur) } : { status: 'submitted' }} onClose={() => { setEdit(null); setVfile(null); }}
          extra={(
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
              {!!cur?.file_path && <Pressable onPress={async () => { const u = await openDocLink('finance-docs', cur.file_path); if (u) viewDoc(u); }}><Text style={{ color: base.blue, fontWeight: '700' }}>📄 {cur.file_name || 'Instruction / quote document'}</Text></Pressable>}
              <Pressable onPress={async () => { const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (!r.canceled && r.assets[0]) setVfile({ uri: r.assets[0].uri, name: r.assets[0].name || 'document', mimeType: r.assets[0].mimeType }); }}><Text style={{ color: base.blue }}>📎 {vfile ? vfile.name : cur?.file_path ? 'Replace the document' : 'Attach the instruction / quote document'}</Text></Pressable>
            </View>
          )}
          fields={[
            { k: 'title', label: 'Title' }, { k: 'description', label: 'Description', kind: 'multiline' },
            { k: 'instructed_by', label: 'Instructed by', half: true }, { k: 'instruction_ref', label: 'Instruction ref', half: true }, { k: 'instructed_on', label: 'Instructed on', kind: 'date', half: true },
            { k: 'status', label: 'Status', kind: 'choice', options: [['submitted', 'Issued'], ['agreed', 'Approved'], ['rejected', 'Rejected']], half: true },
            { k: 'cost_estimate', label: 'Cost estimate £', kind: 'money', half: true }, { k: 'quoted', label: 'Value issued to client £', kind: 'money', half: true },
            { k: 'submitted_on', label: 'Issued on', kind: 'date', half: true }, { k: 'agreed_value', label: 'Approved value £', kind: 'money', half: true }, { k: 'agreed_on', label: 'Approved on', kind: 'date', half: true },
            { k: 'notes', label: 'Notes', kind: 'multiline' },
          ]}
          onSave={async (x) => {
            const title = String(x.title).trim(); if (!title) return 'Give it a title.';
            const n = (k: string) => { const y = num(x[k]); return y === null || isNaN(y) ? null : round2(y); };
            const status = String(x.status || 'submitted');
            let agreed = n('agreed_value'); if (status === 'agreed' && agreed == null) agreed = n('quoted');
            if (status === 'agreed' && agreed == null) return 'Add the approved value.';
            const fileCols: Row = {};
            if (vfile) {
              const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
              const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${id}/variations/${rid}-${vfile.name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, await (await fetch(vfile.uri)).arrayBuffer(), { contentType: vfile.mimeType || 'application/octet-stream' });
              if (!up.error) { fileCols.file_path = up.data.path; fileCols.file_name = vfile.name; }
            }
            const row = { ...fileCols, title, description: String(x.description).trim() || null, instructed_by: String(x.instructed_by).trim() || null, instruction_ref: String(x.instruction_ref).trim() || null, instructed_on: String(x.instructed_on).trim() || null, status, cost_estimate: n('cost_estimate'), quoted: n('quoted'), submitted_on: String(x.submitted_on).trim() || null, agreed_value: agreed, agreed_on: String(x.agreed_on).trim() || (status === 'agreed' ? today() : null), notes: String(x.notes).trim() || null, updated_at: new Date().toISOString() };
            const ok = cur ? !(await fdb.from('fin_variations').update(row as never).eq('id', cur.id)).error : !!(await insertNumbered('fin_variations', { col: 'site_id', val: id }, (s) => `V${String(s).padStart(3, '0')}`, { ...row, org_id: me.org_id, site_id: id, created_by: me.id }));
            if (!ok) return 'Could not save — try again.';
            toast('Variation saved'); setVfile(null); refresh(); return null;
          }} />
      )}
    </ScrollView>
  );
}
