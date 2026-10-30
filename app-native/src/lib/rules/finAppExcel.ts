// The application for payment as the client document (9219p): an Excel workbook ("General Summary",
// one sheet per Bill of Quantities header, Variations, Dayworks) and the figures for the PDF; reading a
// valued copy back (Applied % updates a draft, Certified % fills the certificate). Column A (hidden)
// holds OpHUB's key for each row (L:<item>, V:<variation>, D:<n>, H:<header>) so the file can come back. Pure.
import { isItem, pct } from './finApp.ts';
import { round2 } from './finance.ts';
import { sheetName, type XCell, type XSheet } from './xlsx.ts';

type Row = Record<string, any>;
export type AppDoc = {
  sections: { id: string; title: string; rows: Row[] }[];
  vars: { key: string; v: Row; prev: number }[];
  prevPct: Record<string, number>; certPct: Record<string, number>; certified: boolean;
  vt: string; retPct: number; discPct: number; previous: number; capRet: number | null;
};

/** Everything the Excel and the PDF need. `apps`: the project's applications (for "Prev Certified"). */
export function appDoc(a: Row, jf: Row, apps: Row[], defaultVat?: string | null): AppDoc {
  // "Prev Certified" only ever comes from a certified (or invoiced) application, as on screen.
  const prev = apps.filter((x) => x.number < a.number && ['certified', 'invoiced'].includes(x.status)).sort((x, y) => x.number - y.number).pop() || null;
  const prevPct: Record<string, number> = {}, prevVar: Record<string, number> = {};
  if (prev) {
    const cl: Record<string, number> = {}; (prev.cert_lines || []).forEach((l: Row) => { if (l.item_id) cl[l.item_id] = l.pct; });
    (prev.lines || []).filter(isItem).forEach((l: Row) => { prevPct[l.item_id] = cl[l.item_id] != null ? cl[l.item_id] : pct(l.pct); });
    (prev.variations || []).forEach((v: Row) => { const k = v.fin_variation_id || v.variation_id; if (k) prevVar[k] = pct(v.pct); });
  }
  const certPct: Record<string, number> = {}; (a.cert_lines || []).forEach((l: Row) => { if (l.item_id) certPct[l.item_id] = l.pct; });
  const sections: AppDoc['sections'] = []; let cur: AppDoc['sections'][number] | null = null;
  (a.lines || []).forEach((l: Row) => {
    if (l.kind === 'section') { cur = { id: l.item_id, title: `${l.ref ? `${l.ref} ` : ''}${l.description || 'Section'}`, rows: [] }; sections.push(cur); return; }
    if (!cur) { cur = { id: '', title: 'Contract works', rows: [] }; sections.push(cur); }
    cur.rows.push(l);
  });
  const vars = (a.variations || []).map((v: Row, i: number) => ({ key: `V:${v.variation_id || `x${i}`}`, v, prev: prevVar[v.fin_variation_id || v.variation_id] || 0 }));
  const capRet = jf.retention_limit_pct && jf.contract_value ? round2((Number(jf.contract_value) * Number(jf.retention_limit_pct)) / 100) : null;
  return { sections, vars, prevPct, certPct, certified: a.cert_net != null, vt: jf.vat_treatment || defaultVat || 'standard', retPct: pct(a.retention_pct), discPct: pct(a.discount_pct || 0), previous: round2(Number(a.previous || 0)), capRet };
}

/** Section totals and the summary lines (the PDF and the on-screen check use these; the Excel works them out itself). */
export function appSummary(a: Row, D: AppDoc) {
  const secs = D.sections.map((s) => {
    let t = 0, ap = 0, ce = 0;
    s.rows.filter(isItem).forEach((l) => { const v = Number(l.value || 0), a1 = pct(l.pct), c1 = D.certPct[l.item_id] != null ? D.certPct[l.item_id] : a1; t += v; ap += (v * a1) / 100; ce += (v * c1) / 100; });
    return { title: s.title, t: round2(t), ap: round2(ap), ce: round2(ce) };
  });
  { let t = 0, ap = 0; D.vars.forEach((x) => { t += Number(x.v.value || 0); ap += (Number(x.v.value || 0) * pct(x.v.pct)) / 100; }); secs.push({ title: 'Variations', t: round2(t), ap: round2(ap), ce: round2(ap) }); }
  if ((a.dayworks || []).length) { const t = round2(a.dayworks.reduce((s: number, d: Row) => s + Number(d.value || 0), 0)); secs.push({ title: 'Dayworks', t, ap: t, ce: t }); }
  const T = (k: 't' | 'ap' | 'ce') => round2(secs.reduce((s, x) => s + x[k], 0));
  const side = (g: number) => {
    const disc = round2((g * D.discPct) / 100); let ret = round2(((g - disc) * D.retPct) / 100); if (D.capRet != null) ret = Math.min(ret, D.capRet);
    const net = round2(g - disc - ret), due = round2(net - D.previous), vat = D.vt === 'standard' ? round2(due * 0.2) : 0;
    return { gross: g, disc, ret, net, due, vat, total: round2(due + vat) };
  };
  return { secs, t: T('t'), applied: side(T('ap')), certified: side(T('ce')) };
}
export const vatLabel = (vt: string) => (vt === 'reverse_charge' ? 'VAT (domestic reverse charge — customer to account to HMRC)' : vt === 'zero' ? 'VAT (zero rated)' : 'VAT @ 20%');

const HEAD = ['OpHUB Key', 'Ref', 'Description', 'Qty', 'Unit', 'Rate', 'Amount', 'Prev Certified %', 'Prev Certified', 'Applied %', 'Applied', 'Certified %', 'Certified', 'Difference', 'Notes', 'Include in Summary'];
const WIDTHS = [11, 9, 46, 9, 11, 15, 15, 16, 15, 12, 15, 12, 15, 14, 21, 11];

/** The workbook, sheet by sheet. `info`: company, client, project, job number, valuation date (as shown). */
export function appExcelSheets(a: Row, D: AppDoc, info: { company: string; client: string; project: string; jobNo: string; valDate: string }): XSheet[] {
  const used = new Set(['general summary']);
  const refs: { title: string; name: string; last: number }[] = [];
  const sheets: XSheet[] = [];
  const mk = (title: string, key: string) => {
    const name = sheetName(title, used);
    const rows: XCell[][] = [HEAD.map((h) => ({ v: h, s: 'hcell' as const })), [key, { v: title, s: 'sec' }, ...Array.from({ length: 13 }, () => ({ v: '', s: 'secfill' as const }))]];
    sheets.push({ name, rows, widths: WIDTHS, hidden: [0, 15], freeze: 1 });
    return { name, rows };
  };
  const item = (rows: XCell[][], key: string, ref: unknown, desc: string, qty: number | null, unit: string, rate: number | null, value: number, prevP: number, appP: number, certP: number) => {
    const n = rows.length + 1, amt = qty != null && rate != null ? round2(qty * rate) : round2(value);
    rows.push([key, { v: ref == null ? '' : String(ref), s: 'cell' }, { v: desc || '', s: 'cwrap' }, { v: qty, s: 'cell' }, { v: unit || '', s: 'cell' }, { v: rate, s: 'cmoney' },
      qty != null && rate != null ? { v: amt, f: `IFERROR(D${n}*F${n}, 0)`, s: 'cmoney' } : { v: amt, s: 'cmoney' },
      { v: prevP / 100, s: 'cpct' }, { v: round2((amt * prevP) / 100), f: `IFERROR(G${n}*H${n}, 0)`, s: 'cmoney' },
      { v: appP / 100, s: 'apct' }, { v: round2((amt * appP) / 100), f: `IFERROR(G${n}*J${n}, 0)`, s: 'cmoney' },
      { v: certP / 100, s: 'cepct' }, { v: round2((amt * certP) / 100), f: `IFERROR(G${n}*L${n}, 0)`, s: 'cmoney' },
      { v: round2((amt * (certP - appP)) / 100), f: `IFERROR(M${n}-K${n}, 0)`, s: 'cmoney' }, { v: '', s: 'cell' }, 1]);
  };
  D.sections.forEach((sec) => {
    const { name, rows } = mk(sec.title, sec.id ? `H:${sec.id}` : '');
    sec.rows.forEach((l) => {
      if (l.kind === 'subsection') { rows.push([`H:${l.item_id}`, { v: l.ref || '', s: 'subfill' }, { v: l.description || '', s: 'sub' }, ...Array.from({ length: 12 }, () => ({ v: '', s: 'subfill' as const }))]); return; }
      const ap = pct(l.pct), cp = D.certPct[l.item_id] != null ? D.certPct[l.item_id] : ap, hasQ = l.qty != null && l.rate != null;
      item(rows, `L:${l.item_id}`, l.ref, l.description, hasQ ? Number(l.qty) : null, l.unit, hasQ ? Number(l.rate) : null, Number(l.value || 0), D.prevPct[l.item_id] || 0, ap, cp);
    });
    refs.push({ title: sec.title, name, last: Math.max(rows.length, 3) + 200 });
  });
  { const { name, rows } = mk('Variations', ''); D.vars.forEach((x) => item(rows, x.key, '', x.v.description || 'Variation', 1, 'item', Number(x.v.value || 0), Number(x.v.value || 0), x.prev, pct(x.v.pct), pct(x.v.pct))); refs.push({ title: 'Variations', name, last: Math.max(rows.length, 3) + 200 }); }
  if ((a.dayworks || []).length) { const { name, rows } = mk('Dayworks', ''); a.dayworks.forEach((d: Row, i: number) => item(rows, `D:${i}`, '', d.description || 'Daywork', null, '', null, Number(d.value || 0), 0, 100, 100)); refs.push({ title: 'Dayworks', name, last: Math.max(rows.length, 3) + 200 }); }

  // General Summary (formulas, with the worked-out values alongside).
  const S = appSummary(a, D), rows: XCell[][] = [[]];
  [['Company Name', info.company], ['Client Name', info.client], ['Project Name', info.project], ['Project ID', info.jobNo], ['Valuation Date', info.valDate], ['Application No.', a.number], ['Client PO', a.client_po || '']]
    .forEach(([k, v]) => rows.push(['', { v: k as string, s: 'bold' }, v as string | number]));
  rows.push([], ['', { v: 'General Summary', s: 'h2' }]);
  rows.push(['', ...['Section', 'Total', 'Applied Total', 'Applied %', 'Certified Total', 'Certified %'].map((h) => ({ v: h, s: 'hcell' as const }))]);
  const first = rows.length + 1, q = (n: string) => `'${n.replace(/'/g, "''")}'`;
  refs.forEach((r, i) => {
    const n = rows.length + 1, rg = (c: string) => `${q(r.name)}!${c}3:${c}${r.last}`, s = S.secs[i];
    rows.push(['', { v: r.title, s: 'secfill' }, { v: s.t, f: `IFERROR(SUMIF(${rg('P')},1,${rg('G')}), 0)`, s: 'secmoney' }, { v: s.ap, f: `IFERROR(SUMIF(${rg('P')},1,${rg('K')}), 0)`, s: 'secmoney' },
      { v: s.t ? s.ap / s.t : 0, f: `IFERROR(IF(OR(C${n}=0,ISBLANK(C${n})),0,D${n}/C${n}), 0)`, s: 'secpct' }, { v: s.ce, f: `IFERROR(SUMIF(${rg('P')},1,${rg('M')}), 0)`, s: 'secmoney' },
      { v: s.t ? s.ce / s.t : 0, f: `IFERROR(IF(OR(C${n}=0,ISBLANK(C${n})),0,F${n}/C${n}), 0)`, s: 'secpct' }]);
  });
  const last = rows.length; rows.push([]);
  const line = (label: string, d: XCell, f: XCell, bold = false, c?: XCell) => { rows.push(['', { v: label, s: bold ? 'bcell' : 'cell' }, c ?? { v: '', s: 'cell' }, d, { v: '', s: 'cell' }, f, { v: '', s: 'cell' }]); return rows.length; };
  const m = (v: number, f?: string, bold = false): XCell => ({ v, f, s: bold ? 'bmoney' : 'cmoney' });
  const A = S.applied, C = S.certified, dp = D.discPct / 100, rp = D.retPct / 100;
  const sub = line('SubTotal', m(A.gross, `IFERROR(SUM(D${first}:D${last}), 0)`, true), m(C.gross, `IFERROR(SUM(F${first}:F${last}), 0)`, true), true, m(S.t, `IFERROR(SUM(C${first}:C${last}), 0)`, true));
  const dsc = line(`Less Discount at ${D.discPct}%`, m(A.disc, `IFERROR(ROUND(D${sub}*${dp},2), 0)`), m(C.disc, `IFERROR(ROUND(F${sub}*${dp},2), 0)`));
  const retF = (c: string) => (D.capRet != null ? `IFERROR(MIN(ROUND((${c}${sub}-${c}${dsc})*${rp},2),${D.capRet}), 0)` : `IFERROR(ROUND((${c}${sub}-${c}${dsc})*${rp},2), 0)`);
  const ret = line(`Retention at ${D.retPct}%`, m(A.ret, retF('D')), m(C.ret, retF('F')));
  const net = line('Net After Retention', m(A.net, `IFERROR(D${sub}-D${dsc}-D${ret}, 0)`), m(C.net, `IFERROR(F${sub}-F${dsc}-F${ret}, 0)`));
  const prv = line('Previously Certified (excl VAT)', m(D.previous), m(D.previous));
  const due = line('Gross Payment Due', m(A.due, `IFERROR(D${net}-D${prv}, 0)`, true), m(C.due, `IFERROR(F${net}-F${prv}, 0)`, true), true);
  const vat = line(vatLabel(D.vt), D.vt === 'standard' ? m(A.vat, `ROUND(D${due}*0.2,2)`) : m(0), D.vt === 'standard' ? m(C.vat, `ROUND(F${due}*0.2,2)`) : m(0));
  line('Net Payment Due', m(A.total, `IFERROR(D${due}+D${vat}, 0)`, true), m(C.total, `IFERROR(F${due}+F${vat}, 0)`, true), true);
  rows.push([], ['', { v: D.certified ? 'Certified figures are as entered from the client’s certificate.' : 'Applied = what we are applying for. Certified starts the same — the client changes the Certified % (green) and sends it back.', s: 'note' }]);
  return [{ name: 'General Summary', rows, widths: [4, 36, 19, 19, 13, 19, 13] }, ...sheets];
}
export const appFilename = (a: Row, site: Row | null | undefined, ext: 'xlsx' | 'pdf') => `Application ${a.number} - ${String(site?.name || '').replace(/[\\/:*?"<>|]+/g, '')}${site?.job_number ? ` (${site.job_number})` : ''}.${ext}`;

/* ---------- reading a valued copy back ---------- */
export type AppXlItem = { key: string; sheet: string; head: string; ref: string; desc: string; qty: number | null; unit: string; rate: number | null; amount: number | null; applied: number | null; certified: number | null };
const xn = (v: unknown) => { if (typeof v === 'number') return v; const n = Number(String(v ?? '').replace(/[£,%\s]/g, '')); return String(v ?? '').trim() === '' || isNaN(n) ? null : n; };
// Excel keeps 25% as 0.25; a hand-typed "25" means 25%.
const fracPct = (v: unknown) => { const n = xn(v); return n === null ? null : Math.abs(n) <= 1.5 ? pct(n * 100) : pct(n); };
/** The rows of an OpHUB application workbook, or null when it isn't one (no "Applied %" column). */
export function parseAppBook(book: { name: string; rows: unknown[][] }[]): AppXlItem[] | null {
  if (!book.some((s) => (s.rows[0] || []).some((c) => /^applied %$/i.test(String(c ?? '').trim())))) return null;
  const items: AppXlItem[] = [];
  book.forEach((s) => {
    const H = (s.rows[0] || []).map((c) => String(c ?? '').trim().toLowerCase());
    if (!H.includes('applied %')) return;
    const col = (n: string) => H.indexOf(n);
    const C = { ref: col('ref'), desc: col('description'), qty: col('qty'), unit: col('unit'), rate: col('rate'), amount: col('amount'), applied: col('applied %'), certified: col('certified %') };
    const at = (r: unknown[], i: number) => (i < 0 ? '' : r[i]);
    let head = '';
    s.rows.forEach((r, ri) => {
      if (ri === 0) return;
      const key = String(r[0] ?? '').trim(), hm = /^H:(.+)$/.exec(key);
      if (ri === 1) { head = hm ? hm[1] : ''; return; }
      if (hm) { head = hm[1]; return; }
      items.push({ key, sheet: s.name, head, ref: String(at(r, C.ref) ?? '').trim(), desc: String(at(r, C.desc) ?? '').trim(), qty: xn(at(r, C.qty)), unit: String(at(r, C.unit) ?? '').trim(), rate: xn(at(r, C.rate)), amount: xn(at(r, C.amount)), applied: fracPct(at(r, C.applied)), certified: fracPct(at(r, C.certified)) });
    });
  });
  return items;
}
const sameLine = (list: Row[], desc: string, value: number) => { const d = desc.trim().toLowerCase(); return list.some((l) => String(l.description || '').trim().toLowerCase() === d && Math.abs(Number(l.value || 0) - value) < 0.005); };
export type NewBoqLine = { cost?: number | null; under: string; ref: string | null; desc: string; qty: number | null; unit: string | null; rate: number | null; value: number; pct: number };

/** A draft updated from the Applied % column (and changed variations / day works). New rows with no key
 *  become new variation / day-work rows, or new Bill of Quantities lines (`newLines`, added by the caller).
 *  A new row already on the application (the same file uploaded twice) is skipped. */
export function applyAppUpload(a: Row, items: AppXlItem[]) {
  const next: Row = { ...a, lines: (a.lines || []).map((l: Row) => ({ ...l })), variations: (a.variations || []).map((v: Row) => ({ ...v })), dayworks: (a.dayworks || []).map((d: Row) => ({ ...d })) };
  const lineBy: Record<string, Row> = {}; next.lines.forEach((l: Row) => { if (isItem(l)) lineBy[l.item_id] = l; });
  const newLines: NewBoqLine[] = [];
  let changed = 0, added = 0, skipped = 0;
  const valOf = (it: AppXlItem) => (it.qty != null && it.rate != null ? round2(it.qty * it.rate) : it.amount);
  for (const it of items) {
    let m: RegExpExecArray | null;
    if ((m = /^L:(.+)$/.exec(it.key))) { const l = lineBy[m[1]]; if (l && it.applied != null && it.applied !== pct(l.pct)) { l.pct = it.applied; changed++; } continue; }
    if ((m = /^V:(.+)$/.exec(it.key))) {
      const k = m[1], v = next.variations.find((x: Row, i: number) => (x.variation_id || `x${i}`) === k); if (!v) continue;
      const val = valOf(it);
      if (it.applied != null && it.applied !== pct(v.pct)) { v.pct = it.applied; changed++; }
      if (val != null && val !== Number(v.value)) { v.value = val; changed++; }
      if (it.desc && it.desc !== v.description) { v.description = it.desc; changed++; }
      continue;
    }
    if ((m = /^D:(\d+)$/.exec(it.key))) { const d = next.dayworks[+m[1]]; if (d) { if (it.amount != null && it.amount !== Number(d.value)) { d.value = it.amount; changed++; } if (it.desc && it.desc !== d.description) { d.description = it.desc; changed++; } } continue; }
    if (it.key || !it.desc) continue;
    const val = valOf(it); if (val == null) continue;
    const isVar = /^variations$/i.test(it.sheet), isDay = /^dayworks$/i.test(it.sheet);
    if (sameLine(isVar ? next.variations : isDay ? next.dayworks : next.lines.filter(isItem), it.desc, val)) { skipped++; continue; }
    if (isVar) { next.variations.push({ variation_id: null, description: it.desc, value: val, pct: it.applied == null ? 100 : it.applied }); added++; continue; }
    if (isDay) { if (it.amount != null) { next.dayworks.push({ description: it.desc, value: it.amount }); added++; } continue; }
    newLines.push({ under: next.lines.some((l: Row) => l.item_id === it.head) ? it.head : '', ref: it.ref || null, desc: it.desc, qty: it.qty, unit: it.unit || null, rate: it.rate, value: val, pct: it.applied || 0 });
  }
  return { a: next, changed, added, skipped, newLines };
}

/** The client's certificate read from their copy (Certified % column): a Certified % for each line and
 *  variation and an amount for each day work, keyed as the line-by-line certificate is (l<i>, v<i>, d<i>). */
export function certFromItems(a: Row, items: AppXlItem[]) {
  const by: Record<string, AppXlItem> = {}; items.forEach((it) => { if (it.key) by[it.key] = it; });
  const cp: Record<string, string> = {}, diffs: string[] = [];
  let found = 0;
  (a.lines || []).forEach((l: Row, i: number) => {
    if (!isItem(l)) return;
    const it = by[`L:${l.item_id}`], p = it && it.certified != null ? it.certified : pct(l.pct); if (it) found++;
    cp[`l${i}`] = String(p); if (p !== pct(l.pct)) diffs.push(`${l.description}: ${pct(l.pct)}% → ${p}%`);
  });
  // A variation's certified £ is kept as a % of our value, capped at 100% of it.
  (a.variations || []).forEach((v: Row, i: number) => {
    const it = by[`V:${v.variation_id || `x${i}`}`], p = it && it.certified != null ? it.certified : pct(v.pct), val = it && it.amount != null ? it.amount : Number(v.value || 0); if (it) found++;
    const ov = Number(v.value || 0), raw = round2((val * p) / 100), pc = ov ? pct((raw / ov) * 100) : pct(p);
    cp[`v${i}`] = String(pc);
    if (Math.abs(raw - round2((ov * pc) / 100)) >= 0.01) diffs.push(`${v.description || 'Variation'}: client certified £${raw.toFixed(2)}, capped at our value`);
    else if (p !== pct(v.pct) || val !== ov) diffs.push(`${v.description || 'Variation'} changed`);
  });
  (a.dayworks || []).forEach((d: Row, i: number) => {
    const it = by[`D:${i}`], p = it && it.certified != null ? it.certified : 100, val = it && it.amount != null ? it.amount : Number(d.value || 0); if (it) found++;
    const g = round2((val * p) / 100); cp[`d${i}`] = String(g); if (g !== Number(d.value || 0)) diffs.push(`${d.description || 'Daywork'} changed`);
  });
  return { found, cp, diffs };
}
