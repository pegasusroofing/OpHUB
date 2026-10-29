// Purchases › Statements (9219l): supplier statements and how each line
// matches the purchase invoices you hold. Change a match by hand, ignore a
// line, match again, mark reconciled. Uploading a new statement (reading the
// PDF / spreadsheet) is still done in the current app.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';

import { FinPage, FinRow, FinStat } from '@/components/FinNav';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle } from '@/components/ui';
import { fdb, selectAll } from '@/data/finance';
import { openDocLink } from '@/data/hs';
import { useAuth } from '@/lib/auth';
import { fdate, money } from '@/lib/rules/finance';
import { autoMatch, lineState, sameSupplier, STMT_TYPES, type Cand, type SLine } from '@/lib/rules/finStatements';
import { base, radius } from '@/theme/theme';

type Row = Record<string, any>;
const TONE: Record<string, string> = { ok: '#1E7A3C', diff: '#D98A00', missing: '#C0392B', payment: '#2F6FB3', ignored: '#7A7F87' };

export default function FinStatements() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return id ? <Statement id={id} /> : <List />;
}

function List() {
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const { data = [], isLoading } = useQuery({ queryKey: ['finStmts', me?.org_id], enabled: !!me, queryFn: async () => (await selectAll<Row>('fin_statements', '*', (x) => x.eq('org_id', me?.org_id as string))).sort((a, b) => String(b.statement_date || b.created_at).localeCompare(String(a.statement_date || a.created_at))) });
  const list = data.filter((s) => !q.trim() || String(s.supplier_name).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <FinPage title="Statements" section="purchases">
      <Muted style={{ marginBottom: 8 }}>Supplier statements matched to the purchase invoices you hold — by invoice number, or amount and date. Uploading a new statement is still done in the current app.</Muted>
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
    const [pis, inbox] = await Promise.all([
      selectAll<Row>('purchase_invoices', 'id,site_id,supplier_name,invoice_no,invoice_date,total,status,paid_on', (x) => x.eq('org_id', me?.org_id as string).neq('status', 'rejected')),
      selectAll<Row>('fin_inbox', 'id,extracted,received_at,stage,status,purchase_invoice_id', (x) => x.eq('org_id', me?.org_id as string).or('status.eq.new,and(status.eq.filed,purchase_invoice_id.is.null)')),
    ]);
    const cands: Cand[] = pis.filter((p) => sameSupplier(p.supplier_name, s.supplier_name)).map((p): Cand => ({ id: p.id, kind: 'pi', site_id: p.site_id, invoice_no: p.invoice_no || '', date: p.invoice_date, total: Number(p.total || 0), status: p.paid_on ? 'paid' : p.status }))
      .concat(inbox.filter((i) => i.extracted && sameSupplier(i.extracted.supplier, s.supplier_name)).map((i) => ({ id: `in:${i.id}`, kind: 'inbox' as const, invoice_no: i.extracted.invoice_no || '', date: i.extracted.date || String(i.received_at || '').slice(0, 10), total: Number(i.extracted.total || 0), status: 'unallocated' })));
    return { s, cands };
  } });
  if (!me) return null;
  if (isLoading) return <FinPage title="Statement" section="purchases"><Muted>Loading…</Muted></FinPage>;
  if (!data) return <FinPage title="Statement" section="purchases"><Muted>Statement not found.</Muted></FinPage>;
  const { s, cands } = data;
  const lines = (s.lines || []) as SLine[];
  const save = async (patch: Row) => { if ((await fdb.from('fin_statements').update({ ...patch, updated_at: new Date().toISOString() } as never).eq('id', id)).error) { toast('Could not save — try again.'); return false; } void qc.invalidateQueries({ queryKey: ['finStmt'] }); void qc.invalidateQueries({ queryKey: ['finStmts'] }); return true; };
  const setLine = (lid: string, p: Partial<SLine>) => save({ lines: lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) });
  const used = new Set(lines.map((l) => l.match).filter(Boolean));
  const notOnStmt = cands.filter((c) => !used.has(c.id) && (!s.statement_date || !c.date || c.date <= s.statement_date));
  const counts = lines.reduce((o: Record<string, number>, l) => { const k = lineState(l, cands).k; o[k] = (o[k] || 0) + 1; return o; }, {});
  return (
    <FinPage title={s.supplier_name} section="purchases">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <FinStat v={s.statement_date ? fdate(s.statement_date) : '—'} label="Statement date" /><FinStat v={s.closing_balance != null ? money(s.closing_balance) : '—'} label="Balance" />
        <FinStat v={String(counts.ok || 0)} label="Matched" /><FinStat v={String(counts.missing || 0)} label="Not in OpHUB" hot={!!counts.missing} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Button kind="ghost" title="Match again" onPress={async () => { if (await save({ lines: autoMatch(lines, cands) })) toast('Matched again'); }} />
        {s.file_path && <Button kind="ghost" title="📄 Open the statement" onPress={async () => { const u = await openDocLink('finance-docs', s.file_path); if (u) void Linking.openURL(u); }} />}
        {s.status === 'reconciled' ? <Button kind="ghost" title="Reopen" onPress={async () => { if (await save({ status: 'open', reconciled_at: null, reconciled_by: null })) toast('Reopened'); }} />
          : <Button title="Mark reconciled" onPress={async () => { const miss = counts.missing || 0; if (miss && !(await confirmAsk(`${miss} line${miss === 1 ? ' isn’t' : 's aren’t'} matched to an invoice. Mark the statement reconciled anyway?`, 'Mark reconciled'))) return; if (await save({ status: 'reconciled', reconciled_at: new Date().toISOString(), reconciled_by: me.id })) toast('Statement reconciled'); }} />}
      </View>
      <SectionTitle>Lines</SectionTitle>
      {lines.map((l) => {
        const st = lineState(l, cands), c = l.match ? cands.find((x) => x.id === l.match) : null;
        return (
          <FinRow key={l.id} left={l.date ? fdate(l.date) : ''} title={`${STMT_TYPES[l.type] || l.type} ${l.ref || ''}`} sub={[st.label, c ? `→ ${c.invoice_no || 'invoice'} ${fdate(c.date)} ${money(c.total)}${c.kind === 'inbox' ? ' (unallocated)' : ''}` : ''].filter(Boolean).join(' · ')} right={money(l.amount)} tone={TONE[st.k]}
            onPress={async () => {
              const k = await chooseAction(`${l.ref || 'Line'} · ${money(l.amount)}`, [...cands.filter((x) => !used.has(x.id) || x.id === l.match).map((x) => ({ key: x.id, label: `${x.invoice_no || 'No number'} · ${fdate(x.date)} · ${money(x.total)}${x.kind === 'inbox' ? ' (unallocated)' : ''}` })), { key: '-none', label: 'No match' }, { key: l.ignore ? '-unignore' : '-ignore', label: l.ignore ? 'Stop ignoring this line' : 'Ignore this line' }]);
              if (!k) return;
              if (k === '-ignore') void setLine(l.id, { ignore: true }); else if (k === '-unignore') void setLine(l.id, { ignore: false });
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
