// Email templates (Andy, 19 Nov 2026: "in the email templates can we add in the place holders that are possible as add
// buttons and autopopulate the email signatures please like you did for rtb roofing"). Two small rules shared by the
// Finance templates and the quote chaser wording:
//  - addFillIn: a tap on "+ Project" puts {project} where the cursor is, with a space either side when it would
//    otherwise run into a word;
//  - signatureParts: the signature that goes under the email, filled in from what the app already knows (the same as
//    the quote chasers since 19 Nov, and send-finance-email v12): the sender's name, their phone and their email for
//    this company, the company, its address and phone, and on Finance emails its company and VAT numbers.

export type Sel = { start: number; end: number };

/** The text with the fill-in put in at the cursor (or over what's selected), and where the cursor goes after it. */
export function addFillIn(text: string, token: string, sel?: Sel | null): { text: string; sel: Sel } {
  const t = String(text || '');
  const a = Math.max(0, Math.min(sel?.start ?? t.length, t.length));
  const b = Math.max(a, Math.min(sel?.end ?? a, t.length));
  const before = t.slice(0, a), after = t.slice(b);
  const pre = before && !/[\s([/'"£-]$/.test(before) ? ' ' : '';
  const post = after && /^[A-Za-z0-9({]/.test(after) ? ' ' : '';
  const put = pre + token + post;
  const at = a + put.length;
  return { text: before + put + after, sel: { start: at, end: at } };
}

export type SigIn = {
  name?: string | null; phone?: string | null; email?: string | null; company?: string | null;
  address?: string | null; tel?: string | null; regNo?: string | null; vatNo?: string | null;
};
export type SigParts = { name: string; contact: string; company: string; address: string; tel: string; numbers: string };

/** The signature's lines, as the email shows them. Blank parts are left out. */
export function signatureParts(s: SigIn, finance = false): SigParts {
  const clean = (x: string | null | undefined) => String(x || '').trim();
  const address = clean(s.address).split(/\s*\n\s*/).map((x) => x.replace(/[\s,]+$/, '')).filter(Boolean).join(', ');
  const reg = clean(s.regNo), vat = clean(s.vatNo);
  return {
    name: clean(s.name),
    contact: [clean(s.phone), clean(s.email)].filter(Boolean).join(' · '),
    company: clean(s.company),
    address,
    tel: clean(s.tel) ? `Tel: ${clean(s.tel)}` : '',
    numbers: finance ? [reg ? `Company No. ${reg}` : '', vat ? `VAT No. ${vat}` : ''].filter(Boolean).join(' · ') : '',
  };
}

/** What the signature is still missing, in words, so it can be filled in. */
export function signatureGaps(s: SigIn): string[] {
  const gaps: string[] = [];
  if (!String(s.address || '').trim()) gaps.push('the company address');
  if (!String(s.tel || '').trim()) gaps.push('the company phone');
  if (!String(s.phone || '').trim()) gaps.push('your phone');
  return gaps;
}
