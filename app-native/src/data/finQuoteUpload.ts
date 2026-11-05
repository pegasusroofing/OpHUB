// Upload supplier quotes or price lists (Excel or CSV): each file becomes a quote with its priced lines.
// Shared by Purchases › Price Lists and the new PO's quote panel (Andy, 5 Nov 2026).
import { fdb } from '@/data/finance';
import { bestSheet, guessColumns, importRows } from '@/lib/rules/boqImport';
import { csvRows, readXlsx } from '@/lib/rules/xlsxRead';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type Asset = { uri: string; name?: string | null; mimeType?: string | null };
const rid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** siteId null = a price list for every project. Gives back how many were added, the files it couldn't read, and the new quote ids. */
export async function uploadQuotes(me: Profile, siteId: string | null, supplier: string, assets: Asset[], progress?: (t: string) => void): Promise<{ added: number; skipped: string[]; ids: string[] }> {
  let added = 0; const skipped: string[] = [], ids: string[] = [];
  for (let n = 0; n < assets.length; n++) {
    const a = assets[n], nm = a.name || 'quote';
    if (!/\.(xlsx|csv)$/i.test(nm)) { skipped.push(nm); continue; }
    progress?.(`Reading ${n + 1} of ${assets.length}…`);
    try {
      const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
      const sheet = /\.csv$/i.test(nm) ? { name: 'CSV', rows: csvRows(new TextDecoder().decode(bytes)) } : bestSheet(await readXlsx(bytes));
      if (!sheet) { skipped.push(nm); continue; }
      const g = guessColumns(sheet.rows);
      const lines = importRows(sheet.rows, g.header, g.cols).filter((l) => l.kind === 'item' && l.description);
      if (!lines.length) { skipped.push(nm); continue; }
      const qid = rid();
      const path = (await supabase.storage.from('finance-docs').upload(`${me.org_id}/${siteId || 'all'}/quotes/${qid}-${nm.replace(/[^a-z0-9.-]+/gi, '_').slice(-80)}`, bytes, { contentType: a.mimeType || 'application/octet-stream' })).data?.path ?? null;
      const ins = await fdb.from('fin_quotes').insert({ id: qid, org_id: me.org_id, site_id: siteId, purpose: 'pquote', supplier_name: supplier.trim() || null, file_name: nm, file_path: path, created_by: me.id } as never);
      if (ins.error) { skipped.push(nm); continue; }
      await fdb.from('fin_quote_items').insert(lines.map((l, i) => ({ org_id: me.org_id, quote_id: qid, site_id: siteId, supplier_name: supplier.trim() || null, code: l.ref ? String(l.ref).slice(0, 60) : null, description: String(l.description).slice(0, 300), unit: l.unit || null, rate: l.rate ?? null, position: i, active: true, created_by: me.id })) as never);
      added++; ids.push(qid);
    } catch { skipped.push(nm); }
  }
  return { added, skipped, ids };
}
export const QUOTE_SKIP_MSG = (skipped: string[]) => `Couldn’t read: ${skipped.join(', ')}. Upload quotes as Excel (.xlsx) or CSV — reading PDFs and photos is switched off while Finance is on trial.`;
