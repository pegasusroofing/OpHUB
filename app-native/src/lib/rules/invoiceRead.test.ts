import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeLines, decide, matchJob, priceCheck, type Read, type RLine } from './invoiceRead.ts';

const sites = [
  { id: 'a', job_number: 'SBX-113', name: 'Paton House', address: '12 Paton Street, London', postcode: 'EC1V 9BX' },
  { id: 'b', job_number: 'SBX-114', name: 'Hyde Park Gate', address: '35a Hyde Park Gate', postcode: 'SW7 5DJ' },
  { id: 'c', job_number: 'SBX-115', name: 'Old Closed Job', address: '9 Gone Road', postcode: 'N1 1AA', status: 'closed' },
];
const pos = [{ id: 'p1', number: 'SBX-113-PO-001', site_id: 'a' }];

test('job is found by PO, job number, postcode, then address', () => {
  assert.deepEqual(matchJob('Your order SBX-113-PO-001', sites, pos), { site_id: 'a', po_id: 'p1', how: 'PO SBX-113-PO-001' });
  assert.equal((matchJob('Ref SBX-114 please', sites, pos) as { site_id: string }).site_id, 'b');
  assert.equal((matchJob('Deliver to London sw7 5dj', sites, pos) as { site_id: string }).site_id, 'b');
  assert.equal((matchJob('12 Paton Street, London', sites, pos) as { site_id: string }).site_id, 'a');
});
test('a job number inside a longer one is not a match, closed jobs are skipped, and two jobs is no answer', () => {
  assert.ok('why' in matchJob('SBX-1134', sites, pos));
  assert.ok('why' in matchJob('9 Gone Road N1 1AA', sites, pos));
  const two = matchJob('SBX-113 and SBX-114', sites, []);
  assert.ok('why' in two && two.why.includes('Could be'));
  assert.ok('why' in matchJob('', sites, pos));
});
test('a line’s own reference wins over the invoice’s', () => {
  const r = codeLines({ po_number: 'SBX-113-PO-001', lines: [{ description: 'A', amount: 10 }, { description: 'B', amount: 5, site_reference: 'SW7 5DJ' }] }, sites, pos);
  assert.deepEqual(r.lines.map((l) => l.site_id), ['a', 'b']);
  assert.equal(r.poId, 'p1');
});
test('no reference leaves lines without a job, with the reason', () => {
  const r = codeLines({ lines: [{ description: 'A', amount: 10 }] }, sites, pos);
  assert.equal(r.lines[0].site_id, null);
  assert.ok(r.why);
});

const quotes = [
  { id: 'list25', site_id: null, supplier_name: 'ZZ Supplies Ltd', quote_date: '2025-01-01' },
  { id: 'list26', site_id: null, supplier_name: 'ZZ Supplies', quote_date: '2026-01-01', quote_no: 'PL26' },
  { id: 'jobA', site_id: 'a', supplier_name: 'ZZ Supplies Limited', quote_date: '2026-06-01', quote_no: 'Q7' },
  { id: 'jobB', site_id: 'b', supplier_name: 'ZZ Supplies', quote_date: '2026-09-01' },
  { id: 'other', site_id: null, supplier_name: 'Somebody Else', quote_date: '2026-10-01' },
];
const items = [
  { quote_id: 'list25', description: 'Bauder underlay roll', rate: 30 },
  { quote_id: 'list26', description: 'Bauder underlay roll', rate: 40, code: 'BU1' },
  { quote_id: 'jobA', description: 'Bauder underlay roll', rate: 42.5 },
  { quote_id: 'jobB', description: 'Bauder underlay roll', rate: 99 },
  { quote_id: 'other', description: 'Bauder underlay roll', rate: 1 },
];
const line = (o: Partial<RLine>): RLine => ({ description: 'Bauder underlay roll', qty: 2, unit_price: 42.5, amount: 85, site_id: 'a', ...o });
test('the most recent of project quote or price list is used, for this supplier and job only', () => {
  const c = priceCheck(line({}), 'ZZ Supplies Ltd', quotes, items);
  assert.deepEqual([c.state, c.rate, c.date], ['ok', 42.5, '2026-06-01']);
  assert.match(c.from ?? '', /project quote Q7/);
});
test('a newer price list beats an older project quote', () => {
  const c = priceCheck(line({}), 'ZZ Supplies', [...quotes, { id: 'list27', site_id: null, supplier_name: 'ZZ Supplies', quote_date: '2026-08-01' }], [...items, { quote_id: 'list27', description: 'Bauder underlay roll', rate: 50 }]);
  assert.deepEqual([c.state, c.rate], ['under', 50]);
});
test('dearer, cheaper, rounding, no price and delivery lines', () => {
  assert.equal(priceCheck(line({ unit_price: 45 }), 'ZZ Supplies', quotes, items).state, 'over');
  assert.equal(priceCheck(line({ unit_price: 40 }), 'ZZ Supplies', quotes, items).state, 'under');
  assert.equal(priceCheck(line({ unit_price: 42.6 }), 'ZZ Supplies', quotes, items).state, 'ok');
  assert.equal(priceCheck(line({ description: 'Something else entirely' }), 'ZZ Supplies', quotes, items).state, 'none');
  assert.equal(priceCheck(line({ kind: 'delivery' }), 'ZZ Supplies', quotes, items).state, 'none');
  assert.equal(priceCheck(line({}), 'Unknown Co', quotes, items).state, 'none');
});
test('unit price is worked out from the amount when it’s missing', () => {
  assert.equal(priceCheck(line({ unit_price: undefined, qty: 2, amount: 100 }), 'ZZ Supplies', quotes, items).state, 'over');
});

const good: Read = { doc_type: 'invoice', supplier: 'ZZ', net: 100, vat: 20, total: 120 };
const lines: RLine[] = [{ description: 'A', amount: 60, site_id: 'a' }, { description: 'B', amount: 40, site_id: 'b' }];
test('a clean invoice files itself, and the biggest job is the main one', () => {
  const d = decide(good, lines, [{ state: 'ok' }, { state: 'none' }]);
  assert.deepEqual([d.canFile, d.mainSite, d.flags.length], [true, 'a', 0]);
});
test('a dearer price still files, with a flag', () => {
  const d = decide(good, lines, [{ state: 'over', charged: 45, rate: 40, from: 'price list' }, { state: 'ok' }]);
  assert.equal(d.canFile, true);
  assert.match(d.flags[0], /A: £45.00 a unit, price list says £40.00/);
});
test('anything unclear goes to a person, with the reason', () => {
  const why = (r: Read, l = lines) => decide(r, l, []).why;
  assert.match(why({ ...good, supplier: '' }) ?? '', /supplier/);
  assert.match(why({ ...good, net: undefined }) ?? '', /amounts/);
  assert.match(why({ ...good, total: 999 }) ?? '', /don’t add up/);
  assert.match(why({ ...good, doc_type: 'delivery_note' }) ?? '', /look like an invoice/);
  assert.match(why({ ...good, doc_type: 'credit_note' }) ?? '', /credit note/);
  assert.match(why(good, [{ description: 'A', amount: 50, site_id: 'a' }]) ?? '', /lines add up/);
  assert.match(why(good, []) ?? '', /No lines/);
  assert.match(why(good, [{ description: 'A', amount: 60, site_id: 'a' }, { description: 'B', amount: 40 }]) ?? '', /job for 1 line/);
  assert.match(why(good, [{ description: 'A', amount: 100 }]) ?? '', /which job/);
});

test('purchase lines (5 Nov 2026): discount, 3 decimals, split by %, VAT', async () => {
  const { lineAmount, r3, allocProblem, codedParts, linesNet, linesVat } = await import('./invoiceRead.ts');
  assert.equal(lineAmount(24, 86.45, 10), 1867.32);
  assert.equal(lineAmount(12, 54.275, 10), 586.17);
  assert.equal(r3(7.7104), 7.71);
  assert.equal(allocProblem({ alloc: [{ site_id: 'a', pct: 50 }, { site_id: 'b', pct: 30 }] }), 'The split adds up to 80% — it needs to be 100%.');
  assert.equal(allocProblem({ alloc: [{ site_id: 'a', pct: 50 }, { site_id: '', pct: 50 }] }), 'Choose the project on every row of the split.');
  assert.equal(allocProblem({ alloc: [{ site_id: 'a', pct: 50 }, { site_id: 'b', pct: 50 }] }), null);
  const lines = [{ amount: 100, site_id: 'a', cost_code: 'materials' }, { amount: 308.4, alloc: [{ site_id: 'a', pct: 50 }, { site_id: 'b', pct: 30 }, { site_id: 'c', pct: 20 }] }, { amount: 50, vat_rate: 'rc' as const, site_id: 'a', cost_code: 'plant' }];
  const parts = codedParts(lines);
  assert.deepEqual(parts.map((p) => [p.site_id, p.amount, p.cost_code]), [['a', 100, 'materials'], ['a', 154.2, 'materials'], ['b', 92.52, 'materials'], ['c', 61.68, 'materials'], ['a', 50, 'plant']]);
  assert.equal(linesNet(lines), 458.4);
  assert.equal(linesVat(lines), 81.68);
});
