// Bill of Quantities numbering (Andy, 1 Nov 2026): sections 1, 2; their lines and sub-sections 1.1, 1.2; a sub-section's lines 1.2.1.
// It follows the order of the lines. A ref someone has typed with letters in it (A1, say) is kept.
type RefRow = { kind?: string | null; ref?: string | null };
const typed = (r: RefRow) => { const x = String(r.ref ?? '').trim(); return /[^0-9.]/.test(x) ? x : ''; };

export function autoRefs(rows: RefRow[]): string[] {
  let sec = 0, child = 0, sub = 0, inSub = false, loose = 0;
  return rows.map((r) => {
    let n: string;
    if (r.kind === 'section') { sec++; child = 0; inSub = false; n = String(sec); }
    else if (r.kind === 'subsection') { child++; sub = 0; inSub = true; n = sec ? `${sec}.${child}` : String(child); }
    else if (inSub) { sub++; n = `${sec ? `${sec}.` : ''}${child}.${sub}`; }
    else if (sec) { child++; n = `${sec}.${child}`; }
    else { loose++; n = String(loose); }
    return typed(r) || n;
  });
}
