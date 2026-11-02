// Bill of Quantities for one project (902 renderFinContract / saveFinContract):
// sections, sub-sections and items (ref, description, qty × rate or a lump
// sum, and an optional cost price). Saving sets the contract value (unless
// it was typed by hand) and makes the project billed by application.
// Import a breakdown from Excel, CSV or PDF (902 finContractUploadPicked) and check it
// before use. Copy in the site's Schedule of Works to price it, or send the BoQ out to
// the operatives' schedule (without prices; never deletes, never touches progress).
// Budget cost per line (typed, from a cost rate, or set by a margin / mark-up %), a plot per line, tick
// lines or a heading to change them together, add lines at any position, saves by itself, and exports
// to Excel / PDF (902 / 9219zs).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { DEFAULT_UNITS, UnitField } from '@/components/UnitField';
import { autoRefs } from '@/lib/rules/boqRefs';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

import { viewDoc } from '@/components/DocViewer';
import { openDocLink } from '@/data/hs';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ThinExportBar } from '@/components/FinFilterBar';
import { FinRow } from '@/components/FinNav';
import { SelectBox } from '@/components/SelectBox';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Muted } from '@/components/ui';
import { useFinSettings, fdb } from '@/data/finance';
import { useSubJobs } from '@/data/finSubJobs';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { pdfPageTexts } from '@/lib/pdfjs';
import { costFromPct, groupRange, insertAt, marginText } from '@/lib/rules/boqCost';
import { bestSheet, boqRows, guessColumns, importPdfLines, importRows, type BoqLine } from '@/lib/rules/boqImport';
import { csvRows, readXlsx, type Cell } from '@/lib/rules/xlsxRead';
import { groupTotals, isItem, itemValue } from '@/lib/rules/finApp';
import { money, num, round2 } from '@/lib/rules/finance';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import { base, page, radius, space, useDesk, useTheme } from '@/theme/theme';

type Row = Record<string, any>;
const slim = { height: 28, paddingVertical: 2, paddingHorizontal: 8, fontSize: 13, borderRadius: 7 };
const lab = { fontSize: 11.5, fontWeight: '700' as const, color: base.slate };
const Pound = ({ width, children }: { width: number | '100%'; children: ReactNode }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', width, height: 28, paddingHorizontal: 8, borderWidth: 1, borderColor: base.line, borderRadius: 7, backgroundColor: base.card, gap: 3 }}><Text style={{ fontSize: 13, color: base.slate }}>£</Text>{children}</View>
);
const inPound = { flex: 1, minWidth: 0, fontSize: 13, color: base.ink, padding: 0, outlineStyle: 'none' as 'solid' };
const Above = ({ l, flex = 1, children }: { l: string; flex?: number; children: ReactNode }) => <View style={{ flex, minWidth: 0 }}><Text style={[lab, { marginBottom: 2 }]}>{l}</Text>{children}</View>;
const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 7, color: base.ink, backgroundColor: base.card };

export default function FinBoq() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['finBoq', id], gcTime: 0, queryFn: async () => ((await fdb.from('fin_contract_items').select('*').eq('site_id', id).order('position')).data as Row[] | null) ?? [] });
  if (!me || isLoading || !data) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  return <Editor id={id} initial={data} me={me} />;
}

function Editor({ id, initial, me }: { id: string; initial: Row[]; me: Profile }) {
  const { org } = useAuth();
  const t = useTheme();
  const desk = useDesk();
  const [costOpen, setCostOpen] = useState<Record<string, boolean>>({}); // phone: a line's budget cost drop-down
  // The tick boxes stay hidden until Select is chosen from a line's ⋯ menu (Andy, 1 Nov 2026).
  const [selectMode, setSelectMode] = useState(false);
  const [editRefs, setEditRefs] = useState(false); // refs are fixed text until Edit ref numbers is chosen from a ⋯ menu
  const [bulkOpen, setBulkOpen] = useState(false); // phone: the budget cost tools
  // Every line stays open (Andy, 1 Nov 2026). This is only the new line that takes the cursor.
  const [openK, setOpenK] = useState<string | null>(null);
  const [descH, setDescH] = useState<Record<string, number>>({});
  const qtyBox = useRef<Record<string, { focus: () => void } | null>>({});
  const qcUnits = useQueryClient();
  const { data: finSt } = useFinSettings(me.org_id);
  const savedUnits = (finSt as { unit_presets?: string[] | null } | undefined)?.unit_presets;
  const units = savedUnits?.length ? savedUnits : DEFAULT_UNITS;
  const editUnits = async () => {
    const v = await promptText('Saved units, separated by commas', units.join(', '));
    if (v === null) return;
    const list = [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))];
    const r = await fdb.from('fin_settings').upsert({ org_id: me.org_id, unit_presets: list, updated_at: new Date().toISOString(), updated_by: me.id } as never, { onConflict: 'org_id' });
    if (r.error) { toast('Not saved — try again.'); return; }
    void qcUnits.invalidateQueries({ queryKey: ['finSettings', me.org_id] });
  };
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: subs = [] } = useSubJobs(site);
  const [rows, setRows] = useState<Row[]>(() => initial.map((r) => ({ ...r, _k: r.id || key(), sub: r.sub_job_id || '', qty: r.qty ?? '', rate: r.rate ?? '', value: r.value ?? '', cost: r.cost ?? '' })));
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastUp, setLastUp] = useState<{ path: string; name: string } | null>(null);
  useEffect(() => { void fdb.from('job_finance').select('contract_file_path,contract_file_name').eq('site_id', id).maybeSingle().then((r: { data: unknown }) => { const j = r.data as Row | null; if (j?.contract_file_path) setLastUp({ path: j.contract_file_path, name: j.contract_file_name || 'BoQ' }); }); }, [id]);
  const [imp, setImp] = useState<Imp | null>(null);
  const [pct, setPct] = useState('');
  const [basis, setBasis] = useState<'margin' | 'markup'>('margin');
  const [autoNote, setAutoNote] = useState('');
  const saved = useRef(snap(initial.map((r) => ({ ...r, sub: r.sub_job_id || '' }))));
  const saving = useRef(false);
  const latest = useRef(rows);
  useEffect(() => { latest.current = rows; }, [rows]);
  const set = (i: number, k: string, v: unknown) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= rows.length) return; const x = rows.slice(); [x[i], x[j]] = [x[j], x[i]]; setRows(x); };
  const blank = (kind: string): Row => ({ _k: key(), kind, ref: '', description: '', qty: '', unit: '', rate: '', value: '', cost: '', sub: '' });
  const add = (kind: string) => { const n = blank(kind); setRows([...rows, n]); setOpenK(n._k); };
  const addAt = (i: number, kind: string) => { const at = insertAt(rows, i, kind); const n = blank(kind), x = rows.slice(); x.splice(at, 0, n); setRows(x); setOpenK(n._k); };
  const refs = autoRefs(rows);
  const selecting = selectMode || rows.some((x) => x._sel);
  const vals = rows.map((r) => (isItem(r) ? itemValue(r) || 0 : 0));
  const tots = groupTotals(rows.map((r, i) => ({ ...r, v: vals[i] })), (r) => r.v, () => 0);
  const total = round2(vals.reduce((t, v) => t + v, 0));
  const costTotal = round2(rows.filter(isItem).reduce((t, r) => t + (Number(num(r.cost)) || 0), 0));
  const itemIdx = rows.map((r, i) => (isItem(r) ? i : -1)).filter((i) => i >= 0);
  const ticked = itemIdx.filter((i) => rows[i]._sel);
  const tick = (idx: number[], on: boolean) => setRows((rs) => rs.map((r, j) => (idx.includes(j) ? { ...r, _sel: on } : r)));
  const applyPct = (only: boolean) => {
    const p = num(pct);
    if (p === null || isNaN(p) || p < 0 || (basis === 'margin' && p >= 100)) { toast(basis === 'margin' ? 'Enter a margin between 0 and 99%.' : 'Enter a mark-up %.'); return; }
    const idx = only ? ticked : itemIdx; if (!idx.length) { toast(only ? 'Tick some lines first.' : 'No lines yet.'); return; }
    setRows((rs) => rs.map((r, j) => { if (!idx.includes(j)) return r; const v = itemValue(r); return v == null ? r : { ...r, cost_basis: basis, cost_pct: p, cost: costFromPct(v, basis, p) ?? '' }; }));
  };
  const costRate = (r: Row) => { const q = num(r.qty), c = num(r.cost); return c === null || isNaN(c) ? '' : q ? String(round2(c / q)) : String(c); };

  const save = async (quiet = false) => {
    if (saving.current) return;
    const now = latest.current;
    const numbered = autoRefs(now);
    const clean = now.map((r, ri) => ({ _k: r._k, id: r.id, _task_id: r._task_id, _sec_id: r._sec_id, kind: r.kind || 'item', ref: numbered[ri] || null, description: String(r.description || '').trim(), qty: num(r.qty), unit: String(r.unit || '').trim() || null, rate: num(r.rate), value: itemValue(r), cost: num(r.cost), sub: r.sub || null, cost_basis: r.cost_basis || null, cost_pct: r.cost_pct ?? null }))
      .map((r) => ({ ...r, qty: r.qty === null || isNaN(r.qty) ? null : r.qty, rate: r.rate === null || isNaN(r.rate) ? null : r.rate, cost: r.cost === null || isNaN(r.cost) ? null : round2(r.cost) }))
      .filter((r) => r.description || r.value !== null);
    const bad = clean.some((r) => !r.description) ? 'Every line needs a description.' : clean.some((r) => isItem(r) && r.value === null) ? 'Every item needs a value (quantity × rate, or a lump sum).' : '';
    if (bad) { if (!quiet) toast(bad); else setAutoNote('Not saved yet — finish the lines'); return; }
    saving.current = true; if (!quiet) setBusy(true); else setAutoNote('Saving…');
    try {
      const ex = await fdb.from('fin_contract_items').select('id').eq('site_id', id);
      if (ex.error) { if (!quiet) toast('Couldn’t reach the server, so nothing was saved — try again.'); else setAutoNote('Not saved — no signal'); return; }
      const keep = new Set(clean.filter((r) => r.id).map((r) => r.id));
      let failed = 0;
      for (const e of (ex.data as Row[]) || []) if (!keep.has(e.id) && !(await fdb.from('fin_contract_items').delete().eq('id', e.id).select('id')).data?.length) failed++;
      const got: Record<string, Row> = {};
      for (let i = 0; i < clean.length; i++) {
        const r = clean[i], item = isItem(r);
        const d = { kind: r.kind, ref: r.ref, description: r.description, qty: r.qty, unit: r.unit, rate: r.rate, value: item ? r.value : 0, position: i, cost: item ? r.cost : null, sub_job_id: item ? r.sub : null, cost_basis: item ? r.cost_basis : null, cost_pct: item ? r.cost_pct : null };
        let savedId = r.id as string | undefined;
        if (r.id) { if (!(await fdb.from('fin_contract_items').update(d as never).eq('id', r.id).select('id')).data?.length) failed++; }
        else { const ins = await fdb.from('fin_contract_items').insert({ ...d, org_id: me.org_id, site_id: id } as never).select('id').single(); if (ins.data) { savedId = (ins.data as Row).id; got[r._k] = { id: savedId }; } else failed++; }
        // Copied in from the site schedule: link the task / section to this line.
        if (savedId && r._task_id) { await fdb.from('schedule_tasks').update({ contract_item_id: savedId } as never).eq('id', r._task_id); got[r._k] = { ...(got[r._k] || {}), _task_id: null }; }
        if (savedId && r._sec_id) { await fdb.from('schedule_sections').update({ contract_item_id: savedId } as never).eq('id', r._sec_id); got[r._k] = { ...(got[r._k] || {}), _sec_id: null }; }
      }
      // New ids go onto the lines by their key, so anything typed while saving is kept.
      setRows((rs) => rs.map((r) => (got[r._k] ? { ...r, ...got[r._k] } : r)));
      const wasSaved = saved.current;
      saved.current = snap(now.map((r) => (got[r._k] ? { ...r, ...got[r._k] } : r)));
      if (failed) saved.current = wasSaved;
      const jf = ((await fdb.from('job_finance').select('*').eq('site_id', id).maybeSingle()).data as Row | null) || {};
      const patch: Row = { site_id: id, org_id: me.org_id, ...(jf.billing_type ? {} : { billing_type: 'application' }), updated_at: new Date().toISOString(), updated_by: me.id };
      if (jf.contract_value_source !== 'manual') patch.contract_value = total;
      if (jf.original_value == null) { patch.original_value = total; patch.original_at = new Date().toISOString(); }
      if (jf.original_cost == null && clean.filter(isItem).every((r) => r.cost != null) && costTotal) patch.original_cost = costTotal;
      const jr = await fdb.from('job_finance').upsert(patch as never, { onConflict: 'site_id' });
      if (failed || jr.error) { const m = failed ? `${failed} line${failed === 1 ? '' : 's'} didn’t save — tap Save again.` : 'The contract value didn’t update.'; if (quiet) setAutoNote(m); else toast(m); return; }
      setAutoNote(`Saved ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      // A typed contract value that doesn't match the Bill: ask which the project should use (9219zi finCvPrompt) — only when Save is tapped.
      const typed = round2(Number(jf.contract_value || 0));
      if (!quiet && jf.contract_value_source === 'manual' && total && Math.abs(total - typed) >= 0.5) {
        const k = await chooseAction(`The Bill of Quantities adds up to ${money(total)}, but the contract value typed on the project is ${money(typed)} (excl. VAT). Which should the project use?`, [{ key: 'boq', label: `Use the Bill of Quantities — ${money(total)}` }, { key: 'keep', label: `Keep the typed value — ${money(typed)}` }]);
        if (k === 'boq') {
          const r2 = await fdb.from('job_finance').upsert({ site_id: id, org_id: me.org_id, contract_value: total, contract_value_source: 'boq', updated_at: new Date().toISOString(), updated_by: me.id } as never, { onConflict: 'site_id' });
          if (r2.error) toast('Not saved — try again.');
        }
      }
      ['finBook', 'finJobs'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    } finally { saving.current = false; setBusy(false); }
  };
  // Saves by itself a few seconds after a change (9219ze autosave), when every line is complete.
  useEffect(() => {
    if (snap(rows) === saved.current) return;
    const t = setTimeout(() => { void save(true); }, 2500);
    return () => clearTimeout(t);
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportBoq = async (kind: 'x' | 'p') => {
    if (!rows.length) { toast('No lines to export yet.'); return; }
    const out = rows.map((r, i) => {
      if (!isItem(r)) {
        const g = groupRange(rows, i), cs = g.map((j) => num(rows[j].cost)), costed = cs.some((c) => c !== null && !isNaN(c as number)), cost = round2(cs.reduce<number>((t, c) => t + (Number(c) || 0), 0)), v = tots[i]?.value || 0;
        return [refs[rows.indexOf(r)] || '', r.kind === 'section' ? String(r.description || '').toUpperCase() : String(r.description || ''), null, '', null, v, costed ? cost : null, costed && v ? `${Math.round(((v - cost) / v) * 1000) / 10}%` : ''];
      }
      const v = vals[i], c = num(r.cost), q = num(r.qty);
      return [refs[rows.indexOf(r)] || '', String(r.description || ''), q, r.unit || '', q !== null ? num(r.rate) : null, v, c, c !== null && v ? `${Math.round(((v - (c as number)) / v) * 1000) / 10}%` : ''];
    });
    const job = [site?.job_number, site?.name].filter(Boolean).join(' · ');
    const t: Table = { title: `Bill of Quantities — ${job}`, site: site?.name || '', cols: [{ l: 'Ref', w: 8 }, { l: 'Description', w: 46 }, { l: 'Qty', num: true, w: 8 }, { l: 'Unit', w: 7 }, { l: 'Rate', money: true, w: 11 }, { l: 'Total', money: true, w: 13 }, { l: 'Budget Cost', money: true, w: 13 }, { l: 'Margin', w: 9 }], rows: out, totals: ['', 'Total', null, '', null, total, costTotal || null, costTotal && total ? `${Math.round(((total - costTotal) / total) * 1000) / 10}%` : ''] };
    const ok = await (kind === 'x' ? exportTableExcel(t, org) : exportTablePdf(t, org)).catch(() => false);
    if (!ok) toast('Could not make the file — try again.');
  };

  const ioBtn = (
        <Button small kind="ghost" busy={importing} title="Import / Export" onPress={async () => {
          const k = await chooseAction('Import / Export', [{ key: 'copy', label: 'Copy in tasks from the site schedule' }, { key: 'send', label: "Send to the operatives' schedule" }, { key: 'imp', label: 'Import a breakdown (Excel, CSV or PDF)' }, ...(lastUp?.path ? [{ key: 'last', label: 'Last Upload' }] : [])]);
          if (k === 'copy') await bqCopy(); else if (k === 'send') await bqSend(); else if (k === 'imp') await bqImport(); else if (k === 'last') await bqLast();
        }} />
  );
  const bqCopy = async () => {
          const [secs, tasks] = await Promise.all([
            fdb.from('schedule_sections').select('id,name,contract_item_id').eq('site_id', id).order('position', { ascending: true, nullsFirst: false }).order('created_at'),
            fdb.from('schedule_tasks').select('id,name,section_id,contract_item_id').eq('site_id', id).order('position', { ascending: true, nullsFirst: false }).order('created_at'),
          ]);
          const have = new Set(rows.map((r) => r._task_id).filter(Boolean));
          const free = ((tasks.data as Row[] | null) ?? []).filter((t) => !t.contract_item_id && !have.has(t.id));
          if (!free.length) { toast('Everything on the site schedule is already in here.'); return; }
          const addRows: Row[] = free.filter((t) => !t.section_id).map((t) => ({ ...blank('item'), description: t.name, _task_id: t.id }));
          ((secs.data as Row[] | null) ?? []).forEach((s) => {
            const ts = free.filter((t) => t.section_id === s.id); if (!ts.length) return;
            addRows.push({ ...blank('section'), description: s.name, _sec_id: s.contract_item_id ? null : s.id }, ...ts.map((t) => ({ ...blank('item'), description: t.name, _task_id: t.id })));
          });
          setRows([...rows, ...addRows]);
          toast(`${free.length} task${free.length === 1 ? '' : 's'} copied in — add a price to each`);
        };
  const bqSend = async () => {
          if (rows.some((r) => !r.id)) { toast('Save the schedule first.'); return; }
          const [secs, tasks] = await Promise.all([fdb.from('schedule_sections').select('id,contract_item_id,name,position').eq('site_id', id), fdb.from('schedule_tasks').select('id,contract_item_id,name,section_id,position').eq('site_id', id)]);
          const sl = (secs.data as Row[] | null) ?? [], tl = (tasks.data as Row[] | null) ?? [];
          const secBy: Record<string, Row> = {}, taskBy: Record<string, Row> = {};
          sl.forEach((s) => { if (s.contract_item_id) secBy[s.contract_item_id] = s; }); tl.forEach((t) => { if (t.contract_item_id) taskBy[t.contract_item_id] = t; });
          let secPos = sl.reduce((m, s) => Math.max(m, Number(s.position || 0)), 0) + 1, taskPos = tl.reduce((m, t) => Math.max(m, Number(t.position || 0)), 0) + 1;
          let cur: string | null = null, head = '', added = 0, updated = 0;
          const nm = (i: Row) => `${i.ref ? `${i.ref} ` : ''}${String(i.description || '').trim()}`;
          for (const i of rows) {
            if (i.kind === 'section' || i.kind === 'subsection') {
              const name = i.kind === 'section' ? nm(i) : `${head ? `${head} — ` : ''}${nm(i)}`; if (i.kind === 'section') head = nm(i);
              const ex = secBy[i.id];
              if (ex) { if (ex.name !== name) await fdb.from('schedule_sections').update({ name } as never).eq('id', ex.id); cur = ex.id; }
              else { const r = await fdb.from('schedule_sections').insert({ site_id: id, name, position: secPos++, created_by: me.id, contract_item_id: i.id } as never).select('id').single(); cur = r.data ? (r.data as Row).id : null; }
              continue;
            }
            const name = nm(i) || 'Item', ex = taskBy[i.id];
            if (ex) { const p: Row = {}; if (ex.name !== name) p.name = name; if ((ex.section_id || null) !== (cur || null)) p.section_id = cur; if (Object.keys(p).length) { await fdb.from('schedule_tasks').update(p as never).eq('id', ex.id); updated++; } }
            else if (!(await fdb.from('schedule_tasks').insert({ site_id: id, name, status: 'todo', position: taskPos++, contract_item_id: i.id, ...(cur ? { section_id: cur } : {}) } as never)).error) added++;
          }
          toast(added || updated ? `Operatives' schedule: ${added} task${added === 1 ? '' : 's'} added${updated ? `, ${updated} updated` : ''}` : 'The operatives’ schedule is already up to date');
        };
  const bqImport = async () => {
          const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }); if (r.canceled || !r.assets[0]) return;
          const a = r.assets[0];
          if (/\.xls$/i.test(a.name || '')) { toast('Save it as .xlsx or .csv first — old .xls files can’t be read.'); return; }
          setImporting(true);
          try {
            const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
            const kept = await supabase.storage.from('finance-docs').upload(`${me.org_id}/${id}/contract/${Date.now()}-${(a.name || 'boq').replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, bytes, { contentType: a.mimeType || 'application/octet-stream' });
            if (!kept.error) { await fdb.from('job_finance').update({ contract_file_path: kept.data.path, contract_file_name: a.name || 'BoQ' } as never).eq('site_id', id); setLastUp({ path: kept.data.path, name: a.name || 'BoQ' }); }
            if (/\.pdf$/i.test(a.name || '') || a.mimeType === 'application/pdf') {
              const pages = await pdfPageTexts(bytes, 40);
              setImp({ sheets: [], sheet: '', lines: importPdfLines((pages ?? []).join('\n').split('\n')) });
            } else {
              const sheets = /\.csv$/i.test(a.name || '') ? [{ name: 'CSV', rows: csvRows(new TextDecoder().decode(bytes)) }] : await readXlsx(bytes);
              const best = bestSheet(sheets); if (!best) { toast('Nothing found in that file.'); return; }
              const g = guessColumns(best.rows);
              setImp({ sheets, sheet: best.name, lines: importRows(best.rows, g.header, g.cols) });
            }
          } catch { toast('Could not read that file.'); } finally { setImporting(false); }
        };
  const bqLast = async () => { const u = await openDocLink('finance-docs', (lastUp?.path as string)); if (u) viewDoc(u, lastUp?.name); else toast('Could not open the file.'); };
  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={page(1100)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Bill of Quantities' }} />
      {imp && <ImportPreview imp={imp} setImp={setImp} onUse={async (lines) => {
        if (rows.some((x) => String(x.description || '').trim()) && !(await confirmAsk('Replace the lines here with the imported breakdown?', 'Replace'))) return;
        setRows(boqRows(lines).map((r) => ({ ...r, _k: key(), sub: '' }))); setImp(null);
      }} />}

      {/* Each section sits in its own border (Andy, 1 Nov 2026); lines before any section don't. */}
      {rows.reduce<number[][]>((gs, r, i) => { if (r.kind === 'section' || !gs.length) gs.push([i]); else gs[gs.length - 1].push(i); return gs; }, []).map((g) => (
      <View key={rows[g[0]]._k} style={rows[g[0]].kind === 'section' ? { borderWidth: 1.5, borderColor: t.brand1, borderRadius: 10, backgroundColor: base.card, marginBottom: 12, zIndex: rows.length - g[0] } : undefined}>
      {g.map((i) => {
        const r = rows[i];
        const head = r.kind === 'section' || r.kind === 'subsection';
        const grp = head ? groupRange(rows, i) : [];
        const on = head ? grp.length > 0 && grp.every((j) => rows[j]._sel) : !!r._sel;
        // Headings are one aligned line in a deeper colour: a section in the company colour, a sub-section in grey (Andy, 1 Nov 2026).
        const sec = r.kind === 'section', ink = sec ? t.brand1Text : base.ink;
        const headBox = { flex: 0, height: 28, paddingVertical: 0, paddingHorizontal: 6, borderWidth: 0, backgroundColor: 'transparent', color: ink, fontWeight: '800' as const };
        // The Add button sits at the end of each section or sub-section: an item, or a sub-section (only ever inside a section).
        let h = i; while (h >= 0 && rows[h].kind !== 'section' && rows[h].kind !== 'subsection') h--;
        const next = rows[i + 1]?.kind, nextHead = next === 'section' || next === 'subsection' || i === rows.length - 1;
        const addHere = async () => {
          const canSub = next !== 'subsection' && rows.slice(0, i + 1).some((x) => x.kind === 'section');
          const k = canSub ? await chooseAction('Add', [{ key: 'item', label: 'Item' }, { key: 'subsection', label: 'Sub-section' }]) : 'item';
          if (!k) return;
          const n = blank(k), x = rows.slice(); x.splice(i + 1, 0, n); setRows(x); setOpenK(n._k);
        };
        return (
          <Fragment key={r._k}>
          <View style={{ borderWidth: 1, borderColor: sec ? t.brand1 : r.kind === 'subsection' ? '#DFE3EA' : base.cardLine, borderRadius: 8, paddingVertical: head ? (desk ? 2 : 4) : desk ? 6 : 10, paddingHorizontal: 8, marginBottom: 6, backgroundColor: sec ? t.brand1 : r.kind === 'subsection' ? '#DFE3EA' : base.card, marginLeft: r.kind === 'subsection' ? 10 : 0, ...(rows[g[0]].kind === 'section' ? { marginBottom: 0, marginLeft: 0, borderRadius: 0, borderWidth: 0, borderBottomWidth: 1, borderBottomColor: base.cardLine, ...(sec ? { borderTopLeftRadius: 8, borderTopRightRadius: 8 } : null) } : null), zIndex: rows.length - i }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {selecting && <Pressable hitSlop={6} focusable={false} accessibilityLabel="Tick" onPress={() => (head ? tick(grp, !on) : set(i, '_sel', !on))}><Text style={{ fontSize: 17, color: head ? ink : base.ink }}>{on ? '☑' : '☐'}</Text></Pressable>}
              {editRefs ? <TextInput value={refs[i]} onChangeText={(v) => set(i, 'ref', v)} placeholder="Ref" placeholderTextColor={head ? ink : undefined} style={[box, slim, { width: desk ? 64 : head ? 30 : 40 }, head && headBox, !desk && { fontSize: 11 }]} /> : <Text numberOfLines={1} accessibilityLabel="Ref" style={{ width: desk ? 64 : head ? 30 : 40, fontSize: desk ? 13 : 11, fontWeight: '700', color: head ? ink : base.slate, paddingHorizontal: 2 }}>{refs[i]}</Text>}
              <TextInput value={r.description || ''} onChangeText={(v) => set(i, 'description', v)} placeholder={head ? (r.kind === 'section' ? 'Section heading' : 'Sub-section heading') : 'Description'} placeholderTextColor={head ? ink : undefined} autoFocus={openK === r._k} multiline={!head} onContentSizeChange={head ? undefined : (e) => { const h = Math.ceil(e.nativeEvent.contentSize.height); setDescH((o) => (o[r._k] === h ? o : { ...o, [r._k]: h })); }} onKeyPress={head ? undefined : (e) => { const n = e.nativeEvent as unknown as { key: string; shiftKey?: boolean }; if (n.key === 'Tab' && !n.shiftKey) { (e as unknown as { preventDefault: () => void }).preventDefault(); qtyBox.current[r._k]?.focus(); } }} style={[box, slim, { flex: 1, minWidth: 0, height: Math.max(28, descH[r._k] || 0), paddingVertical: 4, lineHeight: 18, fontWeight: desk ? '400' : '700', paddingLeft: desk ? 8 : 16 }, head && { ...headBox, flex: 1, minWidth: 0 }]} />
              {head && <Text style={{ fontWeight: '800', color: ink, minWidth: desk ? 90 : 0, fontSize: desk ? 14 : 12.5, textAlign: 'right' }}>{money(tots[i]?.value || 0)}</Text>}
              <Pressable hitSlop={6} focusable={false} onPress={async () => {
                const k = await chooseAction('Line', [selecting ? { key: 'unsel', label: 'Stop selecting' } : { key: 'sel', label: 'Select' }, { key: 'refs', label: editRefs ? 'Finish editing ref numbers' : 'Edit ref numbers' }, { key: 'ai', label: head ? '+ Item under this heading' : '+ Item below' }, ...(r.kind === 'section' ? [{ key: 'as', label: '+ Sub-section in this section' }] : []), { key: 'asec', label: '+ Section after this' }, { key: 'up', label: '↑ Move up' }, { key: 'down', label: '↓ Move down' }, { key: 'kind', label: 'Change type' }, { key: 'del', label: '🗑 Remove', danger: true }]);
                if (k === 'refs') setEditRefs(!editRefs); else if (k === 'sel') { setSelectMode(true); setBulkOpen(true); if (head) tick(grp, true); else set(i, '_sel', true); } else if (k === 'unsel') { setSelectMode(false); setRows((rs) => rs.map((x) => (x._sel ? { ...x, _sel: false } : x))); } else if (k === 'ai') addAt(i, 'item'); else if (k === 'as') addAt(i, 'subsection'); else if (k === 'asec') { const x = rows.slice(); let at = i + 1; while (at < x.length && x[at].kind !== 'section') at++; const n = blank('section'); x.splice(at, 0, n); setRows(x); setOpenK(n._k); }
                else if (k === 'up') move(i, -1); else if (k === 'down') move(i, 1); else if (k === 'del') setRows(rows.filter((_, j) => j !== i));
                else if (k === 'kind') { const t = await chooseAction('Type', [{ key: 'item', label: 'Item' }, { key: 'section', label: 'Section heading' }, { key: 'subsection', label: 'Sub-section heading' }]); if (t) set(i, 'kind', t); }
              }}><Text style={{ fontSize: 18, color: head ? ink : base.slate }}>⋯</Text></Pressable>
            </View>
            {head ? null : desk ? (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <Text style={lab}>Qty</Text>
                <TextInput ref={(el) => { qtyBox.current[r._k] = el as unknown as { focus: () => void } | null; }} value={String(r.qty ?? '')} onChangeText={(v) => set(i, 'qty', v)} accessibilityLabel="Qty" keyboardType="decimal-pad" style={[box, slim, { width: 70 }]} />
                <Text style={lab}>Unit</Text>
                <UnitField value={r.unit || ''} onChangeText={(v) => set(i, 'unit', v)} units={units} onEdit={() => void editUnits()} style={[box, slim, { width: 60 }]} />
                <Text style={lab}>Sell rate</Text><Pound width={90}><TextInput accessibilityLabel="Rate £" value={String(r.rate ?? '')} onChangeText={(v) => set(i, 'rate', v)} keyboardType="decimal-pad" style={inPound} /></Pound>
                {num(r.value) !== null && num(r.qty) === null && num(r.rate) === null && <Pound width={90}><TextInput accessibilityLabel="Amount" value={String(r.value ?? '')} onChangeText={(v) => set(i, 'value', v)} keyboardType="decimal-pad" style={inPound} /></Pound>}
                <Text style={lab}>{num(r.qty) ? 'Cost rate' : 'Cost'}</Text>
                <Pound width={90}><TextInput accessibilityLabel="Amount" value={costRate(r)} onChangeText={(v) => { const n = num(v), q = num(r.qty); setRows((rs) => rs.map((x, j) => (j === i ? { ...x, cost: n === null || isNaN(n) ? '' : q ? round2(n * q) : n, cost_basis: null, cost_pct: null } : x))); }} keyboardType="decimal-pad" style={inPound} /></Pound>
                <Text style={lab}>Budget cost</Text>
                <Pound width={90}><TextInput accessibilityLabel="Amount" value={String(r.cost ?? '')} onChangeText={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, cost: v, cost_basis: null, cost_pct: null } : x)))} keyboardType="decimal-pad" style={inPound} /></Pound>
                {subs.length > 0 && <SelectBox value={r.sub || '-'} options={[['-', 'No plot'], ...subs.map((s) => [s.id, s.short] as [string, string])]} onChange={(k) => set(i, 'sub', k === '-' ? '' : k)} title="Plot" compact style={{ marginBottom: 0, width: 130 }} />}
                <Text style={{ fontSize: 12, color: num(r.cost) !== null && vals[i] && (num(r.cost) as number) > vals[i] ? base.red : base.slate }}>{marginText(vals[i], num(r.cost))}{r.cost_basis && r.cost_pct != null ? ` (set at ${r.cost_pct}% ${r.cost_basis === 'markup' ? 'mark-up' : 'margin'})` : ''}</Text>
                <Text style={{ marginLeft: 'auto', fontWeight: '800', color: base.ink }}>{money(vals[i])}</Text>
              </View>
            ) : (
              <View style={{ marginTop: 8, gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, zIndex: 2 }}>
                  <Above l="Qty"><TextInput ref={(el) => { qtyBox.current[r._k] = el as unknown as { focus: () => void } | null; }} value={String(r.qty ?? '')} onChangeText={(v) => set(i, 'qty', v)} accessibilityLabel="Qty" keyboardType="decimal-pad" style={[box, slim, { width: '100%' }]} /></Above>
                  <Above l="Unit"><UnitField value={r.unit || ''} onChangeText={(v) => set(i, 'unit', v)} units={units} onEdit={() => void editUnits()} style={[box, slim, { width: '100%' }]} /></Above>
                  <Above l="Sell rate" flex={1.3}><Pound width="100%"><TextInput accessibilityLabel="Rate £" value={String(r.rate ?? '')} onChangeText={(v) => set(i, 'rate', v)} keyboardType="decimal-pad" style={inPound} /></Pound></Above>
                </View>
                {num(r.value) !== null && num(r.qty) === null && num(r.rate) === null && <Pound width="100%"><TextInput accessibilityLabel="Amount" value={String(r.value ?? '')} onChangeText={(v) => set(i, 'value', v)} keyboardType="decimal-pad" style={inPound} /></Pound>}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Budget cost" hitSlop={6} onPress={() => setCostOpen((o) => ({ ...o, [r._k]: !o[r._k] }))}><Text style={{ fontSize: 12.5, fontWeight: '700', color: t.brand1 }}>Budget cost {costOpen[r._k] ? '▴' : '▾'}</Text></Pressable>
                  <Text style={{ marginLeft: 'auto', fontWeight: '800', color: base.ink }}>{money(vals[i])}</Text>
                </View>
                {costOpen[r._k] && (
                  <>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Above l={num(r.qty) ? 'Cost rate' : 'Cost'}><Pound width="100%"><TextInput accessibilityLabel="Amount" value={costRate(r)} onChangeText={(v) => { const n = num(v), q = num(r.qty); setRows((rs) => rs.map((x, j) => (j === i ? { ...x, cost: n === null || isNaN(n) ? '' : q ? round2(n * q) : n, cost_basis: null, cost_pct: null } : x))); }} keyboardType="decimal-pad" style={inPound} /></Pound></Above>
                      <Above l="Budget cost"><Pound width="100%"><TextInput accessibilityLabel="Amount" value={String(r.cost ?? '')} onChangeText={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, cost: v, cost_basis: null, cost_pct: null } : x)))} keyboardType="decimal-pad" style={inPound} /></Pound></Above>
                    </View>
                    {subs.length > 0 && <SelectBox value={r.sub || '-'} options={[['-', 'No plot'], ...subs.map((s) => [s.id, s.short] as [string, string])]} onChange={(k) => set(i, 'sub', k === '-' ? '' : k)} title="Plot" compact style={{ marginBottom: 0, width: 130 }} />}
                    <Text style={{ fontSize: 12, color: num(r.cost) !== null && vals[i] && (num(r.cost) as number) > vals[i] ? base.red : base.slate }}>{marginText(vals[i], num(r.cost))}{r.cost_basis && r.cost_pct != null ? ` (set at ${r.cost_pct}% ${r.cost_basis === 'markup' ? 'mark-up' : 'margin'})` : ''}</Text>
                  </>
                )}
              </View>
            )}
          </View>
          {h >= 0 && nextHead && <View style={{ marginVertical: 6, marginLeft: 8 }}><Button small kind="ghost" title="+ Add" onPress={() => void addHere()} /></View>}
          </Fragment>
        );
      })}
      </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8, marginBottom: 24 }}>
        <Button small kind="ghost" title="+ Add Works" onPress={async () => { const k = await chooseAction('Add Works', [{ key: 'section', label: 'Section' }, { key: 'item', label: 'Item' }]); if (k) add(k); }} />
      </View>
      {/* The Bill's summary sits at the bottom; each section's total is on its heading (Andy, 1 Nov 2026). */}
        <View style={{ flexDirection: 'row', backgroundColor: base.card, borderWidth: 1, borderColor: base.cardLine, borderRadius: 10, paddingVertical: 8, marginBottom: 10 }}>
          {[['Total', money(total)], ['Budget cost', costTotal ? money(costTotal) : '—'], ['Margin', costTotal && total ? `${Math.round(((total - costTotal) / total) * 1000) / 10}%` : '—']].map(([l, v], n) => (
            <View key={l} style={{ flex: 1, alignItems: 'center', borderLeftWidth: n ? 1 : 0, borderLeftColor: base.cardLine }}><Text style={{ fontSize: 11, color: base.slate }}>{l}</Text><Text style={{ fontSize: 13, fontWeight: '800', color: base.ink }}>{v}</Text></View>
          ))}
        </View>
      {/* Budget cost: margin / mark-up for all or the ticked lines, and changes to the ticked lines together (902). */}
      {!desk && <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}><Button small kind="ghost" title={`Budget cost tools ${bulkOpen ? '▴' : '▾'}`} onPress={() => setBulkOpen(!bulkOpen)} />{ioBtn}</View>}
      {(desk || bulkOpen) && (
      <Card style={{ paddingVertical: 5, paddingHorizontal: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', fontSize: 12, color: base.ink }}>Budget cost:</Text>
          <TextInput value={pct} onChangeText={(v) => setPct(v.replace(/[^0-9.]/g, ''))} placeholder="%" keyboardType="decimal-pad" style={[box, { width: 48, height: 26, paddingVertical: 2, paddingHorizontal: 6, fontSize: 12 }]} />
          <SelectBox value={basis} options={[['margin', '% margin'], ['markup', '% mark-up']]} onChange={setBasis} compact style={{ marginBottom: 0, width: 110 }} title="Margin or mark-up" />
          <Button small kind="ghost" title={ticked.length ? `Apply to ${ticked.length} ticked` : 'Apply to ticked'} disabled={!ticked.length} onPress={() => applyPct(true)} />
          <Button small kind="ghost" title="Apply to all lines" onPress={() => applyPct(false)} />
          {ticked.length ? (
            <>
              <Text style={{ fontWeight: '700', color: base.ink }}>{ticked.length} ticked</Text>
              {subs.length > 0 && <SelectBox value="" placeholder="Set plot…" title="Plot for the ticked lines" options={[['-', 'No plot'], ...subs.map((s) => [s.id, s.short] as [string, string])]} onChange={(k) => setRows((rs) => rs.map((r, j) => (ticked.includes(j) ? { ...r, sub: k === '-' ? '' : k } : r)))} style={{ marginBottom: 0, width: 170 }} />}
              <Button small kind="ghost" title="Set unit" onPress={async () => { const u = await promptText('Unit for the ticked lines (e.g. m², nr, item)', ''); if (u !== null) setRows((rs) => rs.map((r, j) => (ticked.includes(j) ? { ...r, unit: u.trim() } : r))); }} />
              <Button small kind="ghost" title="Clear costs" onPress={() => setRows((rs) => rs.map((r, j) => (ticked.includes(j) ? { ...r, cost: '', cost_basis: null, cost_pct: null } : r)))} />
              <Button small kind="ghost" title="Remove" onPress={async () => { if (await confirmAsk(`Remove ${ticked.length} ticked line${ticked.length === 1 ? '' : 's'}?`, 'Remove')) setRows((rs) => rs.filter((_, j) => !ticked.includes(j))); }} />
              <Button small kind="ghost" title="Untick all" onPress={() => tick(itemIdx, false)} />
            </>
          ) : itemIdx.length ? <><Button small kind="ghost" title={`Tick all ${itemIdx.length} lines`} onPress={() => tick(itemIdx, true)} /><Muted>Tick lines (or a heading) to change them together.</Muted></> : null}
        </View>
      </Card>
      )}

      {desk && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>{ioBtn}</View>}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button small busy={busy} title="Save Bill of Quantities" onPress={() => void save()} />
        <Button small kind="ghost" title="Publish to Application for Payment" onPress={async () => { await save(); if (snap(latest.current) !== saved.current) return; router.push(`/fin/job/${id}/application/new` as never); }} />
      </View>
      <Muted style={{ marginTop: 6, fontSize: 12 }}>Saves by itself a few seconds after a change once every line has a description and a value.{autoNote ? ` ${autoNote}` : ''}</Muted>
      {rows.length === 0 && <FinRow title="No lines yet" sub="Add sections and items, then save." />}
    </ScrollView>
    {rows.length > 0 && <ThinExportBar onExcel={() => void exportBoq('x')} onPdf={() => void exportBoq('p')} />}
    </View>
  );
}

const key = () => `k${Math.random().toString(36).slice(2, 10)}`;
// What's saved, to tell when something has changed (ticks and keys don't count).
const snap = (rs: Row[]) => JSON.stringify(rs.map((r) => [r.kind, r.ref, r.description, String(r.qty ?? ''), r.unit, String(r.rate ?? ''), String(r.value ?? ''), String(r.cost ?? ''), r.sub || '', r.cost_basis || '', r.cost_pct ?? '']));

type Imp = { sheets: { name: string; rows: Cell[][] }[]; sheet: string; lines: BoqLine[] };
const KINDS: BoqLine['kind'][] = ['section', 'subsection', 'item', 'skip'];
const KIND_LABEL: Record<string, string> = { section: 'Section', subsection: 'Sub-section', item: 'Item', skip: 'Skip' };
/** Check the breakdown (902 finImportShow): pick the sheet, tap a line to change its type; totals start as Skip. */
function ImportPreview({ imp, setImp, onUse }: { imp: Imp; setImp: (i: Imp | null) => void; onUse: (lines: BoqLine[]) => void }) {
  const used = imp.lines.filter((l) => l.kind === 'item');
  const total = round2(used.reduce((t, l) => t + Number(l.value || 0), 0));
  return (
    <Card style={{ borderColor: base.blue, borderWidth: 1.5 }}>
      <Text style={{ fontWeight: '800', color: base.ink, marginBottom: 4 }}>Check the breakdown</Text>
      {imp.sheets.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {imp.sheets.map((s) => <Pressable key={s.name} onPress={() => { const g = guessColumns(s.rows); setImp({ ...imp, sheet: s.name, lines: importRows(s.rows, g.header, g.cols) }); }} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: imp.sheet === s.name ? base.ink : base.line, backgroundColor: imp.sheet === s.name ? base.ink : base.card }}><Text style={{ color: imp.sheet === s.name ? '#fff' : base.ink, fontWeight: '700' }}>{s.name}</Text></Pressable>)}
        </View>
      )}
      <Muted style={{ marginBottom: 6 }}>{used.length} item{used.length === 1 ? '' : 's'} · total {money(total)}. Tap a line to change its type; totals are skipped so nothing is counted twice.</Muted>
      {imp.lines.length ? imp.lines.map((l, i) => (
        <Pressable key={i} onPress={() => { const n = imp.lines.slice(); n[i] = { ...l, kind: KINDS[(KINDS.indexOf(l.kind) + 1) % KINDS.length] }; setImp({ ...imp, lines: n }); }} style={{ flexDirection: 'row', gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: base.line, opacity: l.kind === 'skip' ? 0.45 : 1 }}>
          <Text style={{ width: 82, fontSize: 11.5, fontWeight: '800', color: l.kind === 'item' ? base.ink : base.blue }}>{KIND_LABEL[l.kind]}</Text>
          <Text style={{ flex: 1, color: base.ink, fontWeight: l.kind === 'section' ? '800' : '400' }}>{l.ref ? `${l.ref} · ` : ''}{l.description}{l.qty != null || l.rate != null ? `  (${l.qty ?? ''} ${l.unit || ''}${l.rate != null ? ` × ${l.rate}` : ''})` : ''}</Text>
          <Text style={{ fontWeight: '700', color: base.ink }}>{l.value != null ? money(l.value) : ''}</Text>
        </Pressable>
      )) : <Muted>Nothing found. Try another sheet.</Muted>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}><Button title="Use this breakdown" disabled={!used.length} onPress={() => onUse(imp.lines)} /></View>
        <View style={{ flex: 1 }}><Button kind="ghost" title="Cancel" onPress={() => setImp(null)} /></View>
      </View>
    </Card>
  );
}
