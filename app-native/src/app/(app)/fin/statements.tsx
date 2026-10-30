// Purchases › Statements (9219l): supplier statements and how each line
// matches the purchase invoices you hold. Change a match by hand, ignore a
// line, match again, mark reconciled. Upload a statement (PDF, Excel or CSV):
// its lines are read in the app (no AI) and matched.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { FinForm } from '@/components/FinForm';
import { FinPage, FinRow, FinStat } from '@/components/FinNav';
import { chooseAction, confirmAsk, promptText, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { viewDoc } from '@/components/DocViewer';
import { fdb, selectAll } from '@/data/finance';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { pdfPageTexts } from '@/lib/pdfjs';
import { guessSupplier, parseStmtText, stmtAmt, stmtBalance, stmtDate, stmtFromRows } from '@/lib/rules/finStatementRead';
import { csvRows, readXlsx } from '@/lib/rules/xlsxRead';
import { supabase } from '@/lib/supabase';
import { fdate, money, round2 } from '@/lib/rules/finance';
import { autoMatch, lineState, sameSupplier, STMT_TYPES, supKey, type Cand, type SLine } from '@/lib/rules/finStatements';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
const TONE: Record<string, string> = { ok: '#1E7A3C', diff: '#D98A00', missing: '#C0392B', payment: '#2F6FB3', ignored: '#7A7F87' };

export default function FinStatements() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return id ? <Statement id={id} /> : <List />;
}

/** What a statement's lines can match: this supplier's purchase invoices, and unallocated ones still in the inbox. */
async function loadCands(orgId: string, supplier: string): Promise<Cand[]> {
  const [pis, inbox] = await Promise.all([
    selectAll<Row>('purchase_invoices', 'id,site_id,supplier_name,invoice_no,invoice_date,total,status,paid_on', (x) => x.eq('org_id', orgId).neq('status', 'rejected')),
    selectAll<Row>('fin_inbox', 'id,extracted,received_at,stage,status,purchase_invoice_id', (x) => x.eq('org_id', orgId).or('status.eq.new,and(status.eq.filed,purchase_invoice_id.is.null)')),
  ]);
  return pis.filter((p) => sameSupplier(p.supplier_name, supplier)).map((p): Cand => ({ id: p.id, kind: 'pi', site_id: p.site_id, invoice_no: p.invoice_no || '', date: p.invoice_date, total: Number(p.total || 0), status: p.paid_on ? 'paid' : p.status }))
    .concat(inbox.filter((i) => i.extracted && sameSupplier(i.extracted.supplier, supplier)).map((i) => ({ id: `in:${i.id}`, kind: 'inbox' as const, invoice_no: i.extracted.invoice_no || '', date: i.extracted.date || String(i.received_at || '').slice(0, 10), total: Number(i.extracted.total || 0), status: 'unallocated' })));
}

type NewStmt = { file: { uri: string; name: string; mimeType?: string | null; size?: number | null }; lines: SLine[]; guess: string; date: string; balance: number | null; names: string[]; mat: Row[] };
/** Read a statement file (PDF, Excel or CSV) — its lines, balance and a supplier guess (9219l finStmtUpload). */
async function readStatement(orgId: string, file: NewStmt['file']): Promise<NewStmt> {
  let lines: Omit<SLine, 'id'>[] = [], text = '';
  try {
    const bytes = new Uint8Array(await (await fetch(file.uri)).arrayBuffer());
    if (/\.pdf$/i.test(file.name) || file.mimeType === 'application/pdf') {
      const pages = (await pdfPageTexts(bytes, 20)) ?? []; const rows = pages.join('\n').split('\n');
      lines = rows.map(parseStmtText).filter(Boolean) as Omit<SLine, 'id'>[]; text = rows.join('\n');
    } else {
      const rows = /\.csv$/i.test(file.name) ? csvRows(new TextDecoder().decode(bytes)) : ((await readXlsx(bytes))[0]?.rows ?? []);
      lines = stmtFromRows(rows); text = rows.map((r) => r.join(' ')).join('\n');
    }
  } catch { /* nothing read — lines can be added by hand */ }
  const [fin, mat, pis] = await Promise.all([
    selectAll<Row>('fin_suppliers', 'name', (x) => x.eq('org_id', orgId)).catch(() => [] as Row[]),
    selectAll<Row>('suppliers', 'id,name', (x) => x.eq('org_id', orgId)).catch(() => [] as Row[]),
    selectAll<Row>('purchase_invoices', 'supplier_name', (x) => x.eq('org_id', orgId)).catch(() => [] as Row[]),
  ]);
  const names = Array.from(new Set([...fin.map((f) => f.name), ...mat.map((m) => m.name), ...pis.map((p) => p.supplier_name)].filter(Boolean).map((s) => String(s).trim()))).sort((a, b) => a.localeCompare(b));
  const dates = lines.map((l) => l.date).filter(Boolean).sort() as string[];
  const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);
  return { file, lines: lines.map((l) => ({ ...l, id: rid() })), guess: guessSupplier(text, names), date: dates[dates.length - 1] || new Date().toISOString().slice(0, 10), balance: stmtBalance(text), names, mat };
}

function List() {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [nw, setNw] = useState<NewStmt | null>(null);
  const { data = [], isLoading } = useQuery({ queryKey: ['finStmts', me?.org_id], enabled: !!me, queryFn: async () => (await selectAll<Row>('fin_statements', '*', (x) => x.eq('org_id', me?.org_id as string))).sort((a, b) => String(b.statement_date || b.created_at).localeCompare(String(a.statement_date || a.created_at))) });
  const list = data.filter((s) => !q.trim() || String(s.supplier_name).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <FinPage title="Statements" section="purchases">
      <Muted style={{ marginBottom: 8 }}>Supplier statements matched to the purchase invoices you hold — by invoice number, or amount and date. Upload a statement (PDF, Excel or CSV) and its lines are read and matched. Nothing leaves OpHUB.</Muted>
      <Button busy={busy} title="⬆ Upload a statement" onPress={async () => {
        const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '*/*'], copyToCacheDirectory: true });
        if (r.canceled || !r.assets[0]) return;
        const a = r.assets[0];
        if ((a.size || 0) > 20 * 1024 * 1024) { toast('That file is over 20 MB.'); return; }
        if (/\.xls$/i.test(a.name || '')) { toast('Save it as .xlsx or .csv first — old .xls files can’t be read.'); return; }
        setBusy(true); toast('Reading the statement…');
        try { setNw(await readStatement(me?.org_id as string, { uri: a.uri, name: a.name || 'statement', mimeType: a.mimeType, size: a.size })); } finally { setBusy(false); }
      }} />
      {nw && me && (
        <FinForm title="New statement" saveLabel="Match the invoices" onClose={() => setNw(null)}
          note={`${nw.file.name} · ${nw.lines.length ? `${nw.lines.length} line${nw.lines.length === 1 ? '' : 's'} read` : 'no lines could be read — you can add them by hand'}.${nw.names.length ? ` Known suppliers include: ${nw.names.slice(0, 6).join(', ')}${nw.names.length > 6 ? '…' : ''}` : ''}`}
          initial={{ supplier: nw.guess, date: nw.date, balance: nw.balance ?? '' }}
          fields={[{ k: 'supplier', label: 'Supplier *', ph: 'Start typing…' }, { k: 'date', label: 'Statement date', kind: 'date', half: true }, { k: 'balance', label: 'Balance on statement £', kind: 'money', half: true }]}
          onSave={async (v) => {
            const sup = String(v.supplier || '').trim(); if (!sup) return 'Enter the supplier.';
            let cands: Cand[]; try { cands = await loadCands(me.org_id as string, sup); } catch { return 'Could not load the invoices — try again.'; }
            const safeName = nw.file.name.replace(/[^a-z0-9.-]+/gi, '_').slice(-80);
            const up = await supabase.storage.from('finance-docs').upload(`${me.org_id}/statements/${Date.now()}-${safeName}`, await (await fetch(nw.file.uri)).arrayBuffer(), { contentType: nw.file.mimeType || 'application/octet-stream' });
            const lines = autoMatch(nw.lines, cands);
            const m = nw.mat.find((x) => supKey(x.name) === supKey(sup));
            const bal = String(v.balance ?? '').trim() === '' ? null : Number(v.balance);
            const ins = await fdb.from('fin_statements').insert({ org_id: me.org_id, created_by: me.id, supplier_name: sup, supplier_id: m ? m.id : null, statement_date: String(v.date || '') || null, closing_balance: bal == null || Number.isNaN(bal) ? null : bal, lines, file_path: up.error ? null : up.data.path, file_name: nw.file.name } as never).select('id').single();
            if (ins.error) return 'Could not save — try again.';
            toast(`${lines.filter((l) => l.match).length} of ${lines.filter((l) => l.type !== 'payment').length} lines matched`);
            setNw(null); void qc.invalidateQueries({ queryKey: ['finStmts'] });
            router.setParams({ id: (ins.data as { id: string }).id });
            return null;
          }} />
      )}
      <TextInput value={q} onChangeText={setQ} placeholder="Search supplier" style={{ borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 9, color: base.ink, backgroundColor: base.card, marginBottom: 10 }} />
      {isLoading ? <Muted>Loading…</Muted> : list.length ? list.map((s) => {
        const ls = ((s.lines || []) as SLine[]).filter((l) => !l.ignore && l.type !== 'payment'), miss = ls.filter((l) => !l.match).length;
        return <FinRow key={s.id} title={s.supplier_name} sub={[s.statement_date ? fdate(s.statement_date) : '', `${ls.length} lines · ${ls.length - miss} matched`, miss ? `${miss} not in OpHUB` : '', s.status === 'reconciled' ? 'Reconciled' : 'To check'].filter(Boolean).join(' · ')} right={s.closing_balance != null ? money(s.closing_balance) : '—'} tone={miss ? '#C0392B' : undefined} onPress={() => router.setParams({ id: s.id })} />;
      }) : <Empty>No statements yet.</Empty>}
    </FinPage>
  );
}

function Statement({ id }: { id: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['finStmt', id], enabled: !!me, queryFn: async () => {
    const s = (await fdb.from('fin_statements').select('*').eq('id', id).maybeSingle()).data as Row | null;
    if (!s) return null;
    return { s, cands: await loadCands(me?.org_id as string, s.supplier_name) };
  } });
  if (!me) return null;
  if (isLoading) return <FinPage title="Statement" section="purchases"><Muted>Loading…</Muted></FinPage>;
  if (!data) return <FinPage title="Statement" section="purchases"><Muted>Statement not found.</Muted></FinPage>;
  const { s, cands } = data;
  const lines = (s.lines || []) as SLine[];
  const save = async (patch: Row) => { if (!(await fdb.from('fin_statements').update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', id).select('id')).data?.length) { toast('Could not save — try again.'); return false; } void qc.invalidateQueries({ queryKey: ['finStmt'] }); void qc.invalidateQueries({ queryKey: ['finStmts'] }); return true; };
  const setLine = (lid: string, p: Partial<SLine>) => save({ lines: lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) });
  const used = new Set(lines.map((l) => l.match).filter(Boolean));
  const notOnStmt = cands.filter((c) => !used.has(c.id) && c.status !== 'paid' && (!s.statement_date || !c.date || c.date <= s.statement_date));
  // The lines (not ignored) add up to — checked against the balance on the statement (9219l).
  const tot = round2(lines.filter((l) => !l.ignore).reduce((t, l) => t + Number(l.amount || 0), 0));
  const off = s.closing_balance != null ? round2(tot - Number(s.closing_balance)) : 0;
  const addLine = async () => {
    const ref = await promptText('Reference / invoice number on the statement:', ''); if (ref === null) return;
    const a = await promptText('Amount £ (use a minus for a credit or payment):', ''); if (a === null) return;
    const n = stmtAmt(a); if (n === null) { toast('Enter the amount as a number.'); return; }
    const dt = await promptText('Date (dd/mm/yyyy):', fdate(s.statement_date || new Date().toISOString().slice(0, 10)));
    const id2 = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}`;
    const line: SLine = { id: id2, ref: ref.trim(), amount: round2(n), date: stmtDate(dt) || null, type: n < 0 ? 'credit' : 'invoice', text: 'Added by hand' } as SLine;
    if (await save({ lines: autoMatch([...lines, line], cands) })) toast('Line added');
  };
  const counts = lines.reduce((o: Record<string, number>, l) => { const k = lineState(l, cands).k; o[k] = (o[k] || 0) + 1; return o; }, {});
  return (
    <FinPage title={s.supplier_name} section="purchases">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={s.statement_date ? fdate(s.statement_date) : '—'} label="Statement date" /><FinStat v={s.closing_balance != null ? money(s.closing_balance) : '—'} label="Balance" />
        <FinStat v={money(tot)} label={s.closing_balance != null && Math.abs(off) >= 0.01 ? `Lines add up to (${off > 0 ? '+' : '−'}${money(Math.abs(off))} vs balance)` : 'Lines add up to'} hot={s.closing_balance != null && Math.abs(off) >= 0.01} />
        <FinStat v={String(counts.ok || 0)} label="Matched" /><FinStat v={String(counts.missing || 0)} label="Not in OpHUB" hot={!!counts.missing} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Button kind="ghost" title="+ Add a line" onPress={() => void addLine()} />
        <Button kind="ghost" title="Match again" onPress={async () => { if (await save({ lines: autoMatch(lines, cands) })) toast('Matched again'); }} />
        {s.file_path && <Button kind="ghost" title="📄 Open the statement" onPress={async () => { const u = await openDocLink('finance-docs', s.file_path); if (u) viewDoc(u); }} />}
        {s.status === 'reconciled' ? <Button kind="ghost" title="Reopen" onPress={async () => { if (await save({ status: 'open', reconciled_at: null, reconciled_by: null })) toast('Reopened'); }} />
          : <Button title="Mark reconciled" onPress={async () => { const miss = counts.missing || 0; if (miss && !(await confirmAsk(`${miss} line${miss === 1 ? ' isn’t' : 's aren’t'} matched to an invoice. Mark the statement reconciled anyway?`, 'Mark reconciled'))) return; if (await save({ status: 'reconciled', reconciled_at: new Date().toISOString(), reconciled_by: me.id })) toast('Statement reconciled'); }} />}
      </View>
      <SectionTitle>Lines</SectionTitle>
      {lines.map((l) => {
        const st = lineState(l, cands), c = l.match ? cands.find((x) => x.id === l.match) : null;
        return (
          <FinRow key={l.id} left={l.date ? fdate(l.date) : ''} title={`${STMT_TYPES[l.type] || l.type} ${l.ref || ''}`} sub={[st.label, c ? `→ ${c.invoice_no || 'invoice'} ${fdate(c.date)} ${money(c.total)}${c.kind === 'inbox' ? ' (unallocated)' : ''}` : ''].filter(Boolean).join(' · ')} right={money(l.amount)} tone={TONE[st.k]}
            onPress={async () => {
              const k = await chooseAction(`${l.ref || 'Line'} · ${money(l.amount)}`, [...cands.filter((x) => !used.has(x.id) || x.id === l.match).map((x) => ({ key: x.id, label: `${x.invoice_no || 'No number'} · ${fdate(x.date)} · ${money(x.total)}${x.kind === 'inbox' ? ' (unallocated)' : ''}` })), { key: '-none', label: 'No match' }, { key: '-type', label: `Change type (now ${STMT_TYPES[l.type] || l.type})` }, { key: l.ignore ? '-unignore' : '-ignore', label: l.ignore ? 'Stop ignoring this line' : 'Ignore this line' }]);
              if (!k) return;
              if (k === '-type') {
                // Credits and payments are negative, invoices positive; a payment isn't matched to an invoice.
                const t = await chooseAction('Type of line', Object.entries(STMT_TYPES).map(([key, label]) => ({ key, label }))); if (!t) return;
                const amt = Math.abs(Number(l.amount || 0));
                void setLine(l.id, { type: t, ...(t === 'credit' || t === 'payment' ? { amount: -amt } : t === 'invoice' ? { amount: amt } : {}), ...(t === 'payment' ? { match: null, how: null } : {}) });
              } else if (k === '-ignore') void setLine(l.id, { ignore: true, match: null, how: null }); else if (k === '-unignore') void setLine(l.id, { ignore: false });
              else if (k === '-none') void setLine(l.id, { match: null, how: 'manual' }); else void setLine(l.id, { match: k, how: 'manual', ignore: false });
            }} />
        );
      })}
      {!lines.length && <Empty>No lines read from this statement.</Empty>}
      {notOnStmt.length > 0 && (
        <Card>
          <SectionTitle>In OpHUB but not on this statement</SectionTitle>
          {notOnStmt.map((c) => <FinRow key={c.id} title={`${c.invoice_no || 'No number'}${c.kind === 'inbox' ? ' (unallocated)' : ''}`} sub={`${fdate(c.date)} · ${c.status}`} right={money(c.total)} onPress={c.kind === 'pi' ? () => router.push(`/fin/pinv/${c.id}` as never) : () => router.push(`/fin/inbox/${c.id.slice(3)}` as never)} />)}
        </Card>
      )}
      <Text style={{ color: base.slate, marginTop: 6 }}>Tap a line to change its match or ignore it.</Text>
    </FinPage>
  );
}
