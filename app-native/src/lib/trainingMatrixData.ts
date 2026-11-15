// The Training Matrix's figures (320): every operative × certificate category, with the soonest expiry date. No PDF
// library here, so the matrix screen opens without loading pdf-lib (speed review, 15 Nov 2026); the Excel / PDF
// exports are in lib/trainingMatrix.ts.
import { trainingMatrix, type MatrixCell } from '@/lib/rules/certs';
import { supabase } from '@/lib/supabase';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
export type MatrixData = { operatives: { id: string; name: string }[]; byOp: Record<string, Record<string, MatrixCell>> };

export async function loadTrainingMatrix(orgId: string): Promise<MatrixData> {
  const [p, c, m] = await Promise.all([
    db.from('profiles').select('id,name').eq('role', 'operative'),
    db.from('operative_certifications').select('operative_id,manual_operative_id,category,expiry_date').eq('org_id', orgId),
    db.from('manual_operatives').select('id,name').eq('org_id', orgId).is('linked_profile_id', null),
  ]);
  // Operatives added by hand (4 Nov 2026) are in it too, as 'm-<id>', named "… (not signed up)".
  const manual = (((m.data as { id: string; name: string }[] | null) ?? [])).map((x) => ({ id: `m-${x.id}`, name: `${x.name} (not signed up)` }));
  const operatives = [...(((p.data as { id: string; name: string }[] | null) ?? [])), ...manual].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const certs = ((c.data as { operative_id: string | null; manual_operative_id?: string | null; category: string; expiry_date: string | null }[] | null) ?? [])
    .map((x) => ({ ...x, operative_id: x.operative_id || (x.manual_operative_id ? `m-${x.manual_operative_id}` : '') })).filter((x) => x.operative_id);
  return { operatives, byOp: trainingMatrix(certs) };
}
export const ukDate = (d: string, short = false) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', short ? { day: '2-digit', month: 'short', year: '2-digit' } : undefined);
export const matrixCellText = (e: MatrixCell | undefined, short = false) => (e ? (e.expiry ? (short ? ukDate(e.expiry, true) : `Expires ${ukDate(e.expiry)}`) : short ? 'Y' : '✓') : '');
