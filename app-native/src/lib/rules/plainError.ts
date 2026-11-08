// Plain-English save errors (old 9219zw-plain-errors.js; Andy, 26 Oct 2026: no database messages anywhere). Any database
// or storage message that reaches a pop-up becomes a plain sentence. Messages the app writes itself are left alone.
const PLAIN_FIELD: Record<string, string> = {
  value: 'value', description: 'description', name: 'name', title: 'title', amount: 'amount', qty: 'quantity', rate: 'rate',
  item: 'item', work_date: 'date', po_number: 'PO number', invoice_no: 'invoice number', supplier_name: 'supplier', number: 'number',
  on_hire: 'on-hire date', period_start: 'start date', period_end: 'end date', file_path: 'file', category: 'category', src_key: 'reference',
};

/** One database / storage error message as a plain sentence (unknown text comes back as it was). */
export function plainDbError(raw: unknown): string {
  const m = String(raw == null ? '' : raw);
  const x = /null value in column "([a-z0-9_]+)"/i.exec(m);
  if (x) {
    const c = x[1];
    if (/(^|_)id$/.test(c)) return 'Something this needs is missing. Refresh the page and try again.';
    return `Please fill in the ${PLAIN_FIELD[c] || c.replace(/_/g, ' ')} box.`;
  }
  if (/resource already exists/i.test(m)) return 'A file with that name is already there. Rename it and try again.';
  if (/duplicate key value|already exists|23505/i.test(m)) return 'That already exists. Try a different number or name.';
  if (/violates foreign key constraint/i.test(m)) return /update or delete|delete/i.test(m)
    ? 'It’s still used somewhere else, so it can’t be removed yet.'
    : 'Something this links to no longer exists. Refresh the page and try again.';
  if (/violates check constraint/i.test(m)) return 'One of the boxes has a value that isn’t allowed. Check it and try again.';
  if (/row-level security|permission denied|42501|new row violates/i.test(m)) return 'You don’t have permission to do that.';
  if (/invalid input syntax for type (numeric|integer|bigint|double|real)|numeric field overflow|out of range for type/i.test(m)) return 'A number box has something that isn’t a number, or is too big.';
  if (/invalid input syntax for type (date|timestamp)|date\/time field value out of range|invalid input value for enum/i.test(m)) return 'One of the dates isn’t valid.';
  if (/value too long/i.test(m)) return 'One of the boxes has too much text.';
  if (/JWT expired|invalid JWT|\bjwt\b/i.test(m)) return 'Your sign-in has run out. Sign in again and try once more.';
  if (/payload too large|entity too large|exceeded the maximum allowed size|\b413\b/i.test(m)) return 'That file is too big to upload.';
  if (/mime type|invalid mime/i.test(m)) return 'That type of file can’t be uploaded here.';
  if (/^\s*(4\d\d|5\d\d)\s*$/.test(m) || /PGRST\d+|relation "|column "|constraint|syntax error|could not find the|schema cache|function .*does not exist|violates/i.test(m))
    return 'That didn’t save. Please try again. If it keeps happening, let your admin know.';
  return m;
}

const LOOKS_DB = /null value|duplicate key|violates|row-level security|permission denied|invalid input|out of range|value too long|JWT|PGRST|relation "|column "|constraint|syntax error|schema cache|payload too large|entity too large|exceeded the maximum allowed size|mime type|resource already exists|function .*does not exist/i;

/** A whole message: only rewritten when it carries a database message. "Could not save — <db text>" keeps its start. */
export function plainDbText(text: string): string {
  const t = String(text == null ? '' : text);
  if (!LOOKS_DB.test(t)) return t;
  for (const sep of [' — ', ': ']) {
    const i = t.indexOf(sep);
    if (i > 0 && i < 40) return `${t.slice(0, i)}${sep}${plainDbError(t.slice(i + sep.length))}`;
  }
  return plainDbError(t);
}
