// Reading purchase invoices: anything new in the inbox (emailed or uploaded) goes through the AI reader; each line gets its
// job and a price check against the newest quote or price list. Clear ones file themselves; the rest wait in Unallocated
// with the reason. While Finance is on trial none of this runs for RTB: finInvoke refuses the reader.
import { fdb, finInvoke } from '@/data/finance';
import { codedParts, codeLines, decide, priceCheck, type PriceCheck, type Quote, type QuoteItem, type Read, type RLine, type RPo, type RSite } from '@/lib/rules/invoiceRead';
import { codePatch } from '@/lib/rules/piCode';
import { checkAgainstPo } from '@/lib/rules/poMatch';
import { round2, today } from '@/lib/rules/finance';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type Row = Record<string, any>;
const rpc = supabase.rpc.bind(supabase) as unknown as (n: string, a: object) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
export const READER_OFF = 'The AI reader isn’t set up yet: it needs its key adding in Supabase.';

export type ReadContext = { sites: RSite[]; pos: RPo[]; quotes: Quote[]; items: QuoteItem[] };
export async function loadReadContext(orgId: string): Promise<ReadContext> {
  const [s, p, q, i] = await Promise.all([
    fdb.from('sites').select('id,job_number,name,address,postcode,status').eq('org_id', orgId),
    fdb.from('purchase_orders').select('id,number,site_id').eq('org_id', orgId).neq('status', 'cancelled'),
    fdb.from('fin_quotes').select('id,site_id,supplier_name,quote_no,quote_date,created_at').eq('org_id', orgId).eq('purpose', 'pquote'),
    fdb.from('fin_quote_items').select('quote_id,code,description,rate,active').eq('org_id', orgId).eq('active', true),
  ]);
  return { sites: (s.data as RSite[] | null) ?? [], pos: (p.data as RPo[] | null) ?? [], quotes: (q.data as Quote[] | null) ?? [], items: (i.data as QuoteItem[] | null) ?? [] };
}
export const checkAll = (lines: RLine[], supplier: string | undefined, c: ReadContext): PriceCheck[] => lines.map((l) => priceCheck(l, supplier, c.quotes, c.items));

/** The lines onto a filed purchase invoice: its jobs (a split if there's more than one), and any price flags. */
export async function saveLinesOnInvoice(pi: Row, lines: RLine[], flags: string[]): Promise<void> {
  const stored = lines.map((l) => ({ ...l, kind: l.kind || 'item', cost_code: l.cost_code || 'materials' }));
  const withLines = { ...pi, lines: stored };
  // Split lines (by %) count against each of their projects (Andy, 5 Nov 2026); the lines are kept exactly as entered.
  const patch = codePatch({ ...withLines, lines: [] }, codedParts(stored));
  await fdb.from('purchase_invoices').update({ ...('patch' in patch ? patch.patch : {}), lines: stored, match_notes: flags.length ? flags.join('\n') : null } as never).eq('id', pi.id);
}

const asItem = (r: Read, code: ReturnType<typeof codeLines>) => ({ ...r, invoice_no: r.doc_number, date: r.doc_date, lines: code.lines });

async function fileRead(item: Row, r: Read, lines: RLine[], poId: string | null, mainSite: string, flags: string[]): Promise<boolean> {
  const no = String(r.doc_number ?? '').trim(), sup = String(r.supplier).trim();
  const all = [...flags];
  // Line by line against the PO it quotes (Andy, 6 Nov 2026): dearer, more than ordered or not on it → a query.
  if (poId) { const po = (await fdb.from('purchase_orders').select('number,items').eq('id', poId).maybeSingle()).data as Row | null; if (po) all.push(...checkAgainstPo(lines, (po.items || []) as never, po.number || 'the PO').flags); }
  if (no) { const dup = ((await fdb.from('purchase_invoices').select('supplier_name').eq('invoice_no', no)).data as Row[] | null) ?? []; if (dup.some((d) => String(d.supplier_name ?? '').trim().toLowerCase() === sup.toLowerCase())) all.unshift('Possible duplicate: this supplier’s invoice number is already on the system'); }
  const f = await rpc('fin_inbox_file', { p_id: item.id, p_pi: { site_id: mainSite, po_id: poId, supplier_name: sup, invoice_no: no || null, invoice_date: r.doc_date || today(), net: round2(Number(r.net)), vat: round2(Number(r.vat ?? 0)), total: round2(Number(r.total)), status: all.length ? 'query' : 'to_approve', query_note: all[0] ?? null } });
  const d = f.data as Row | null;
  if (f.error || !d?.ok || !d.pi) return false;
  await saveLinesOnInvoice(d.pi as Row, lines, all);
  await fdb.from('fin_inbox').update({ auto_filed: true, stage: 'auto', comments: [{ name: 'OpHUB', at: new Date().toISOString(), text: 'Read and filed by itself.' }] } as never).eq('id', item.id);
  return true;
}

let running = false;
/** Reads what's new. Returns what happened, or why nothing could be read. Safe to call each time Purchases opens. */
export async function readNewInvoices(me: Profile): Promise<{ read: number; filed: number; off?: string }> {
  if (running || !me.org_id) return { read: 0, filed: 0 };
  running = true;
  let read = 0, filed = 0;
  try {
    const items = ((await fdb.from('fin_inbox').select('*').eq('org_id', me.org_id).eq('status', 'new').is('extracted', null).order('received_at').limit(10)).data as Row[] | null) ?? [];
    if (!items.length) return { read, filed };
    const ctx = await loadReadContext(me.org_id);
    for (const it of items) {
      const res = await finInvoke<{ data: Read }>(me, 'finance-ai-read', { path: it.file_path, kind: 'invoice' });
      if (res.error === 'not_configured') return { read, filed, off: READER_OFF };
      if (res.error && /trial/i.test(res.error)) return { read, filed, off: res.error };
      if (res.error || !res.data?.data) {
        await fdb.from('fin_inbox').update({ extracted: { read: false }, stage: 'query', query_reason: `Couldn’t read it: ${res.error ?? 'nothing came back'}` } as never).eq('id', it.id).eq('status', 'new');
        continue;
      }
      read++;
      const r = res.data.data;
      const code = codeLines(r, ctx.sites, ctx.pos);
      const d = decide(r, code.lines, checkAll(code.lines, r.supplier, ctx));
      // Only while it's still new: someone else may have filed it meanwhile.
      const saved = await fdb.from('fin_inbox').update({ extracted: asItem(r, code), site_id: d.mainSite, po_id: code.poId, ...(d.canFile ? {} : { stage: 'query', query_reason: d.why ?? code.why }) } as never).eq('id', it.id).eq('status', 'new').select('id');
      if (!saved.data?.length) continue;
      if (d.canFile && d.mainSite && (await fileRead(it, r, code.lines, code.poId, d.mainSite, d.flags))) filed++;
    }
    return { read, filed };
  } finally { running = false; }
}

/** Read one by hand, from its page. */
export async function readOne(me: Profile, it: Row): Promise<string | null> {
  if (!me.org_id) return 'No company';
  const res = await finInvoke<{ data: Read }>(me, 'finance-ai-read', { path: it.file_path, kind: 'invoice' });
  if (res.error === 'not_configured') return READER_OFF;
  if (res.error || !res.data?.data) return res.error ?? 'Nothing came back from the reader.';
  const ctx = await loadReadContext(me.org_id);
  const r = res.data.data, code = codeLines(r, ctx.sites, ctx.pos), d = decide(r, code.lines, checkAll(code.lines, r.supplier, ctx));
  const saved = await fdb.from('fin_inbox').update({ extracted: asItem(r, code), site_id: d.mainSite, po_id: code.poId, stage: 'query', query_reason: d.why } as never).eq('id', it.id).select('id');
  return saved.data?.length ? null : 'Could not save what was read.';
}
