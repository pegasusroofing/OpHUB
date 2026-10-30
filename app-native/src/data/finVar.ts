// Finance variations and the site side (9219n / 9219s finCtVariationsFill, finVarToSow, finVarSetGroup):
// variations raised on site come into the Finance register on their own; a Finance variation can be put
// on the operatives' Schedule of Works; quick approve / reject.
import { fdb, insertNumbered } from '@/data/finance';
import { addSection } from '@/data/sowManager';
import { FIN_SANDBOX_ORGS, FIN_TRIAL, num, round2, today } from '@/lib/rules/finance';
import { nextVariationName } from '@/lib/rules/sow';
import type { Profile } from '@/lib/types';

type Row = Record<string, any>;
const label = (s: number) => `V${String(s).padStart(3, '0')}`;
let busy = false;

/** Site variations (not declined) with no Finance variation yet are added to the register. Returns
 *  the site variations (to show which are on the Schedule of Works) and how many came in. */
export async function importSiteVariations(me: Profile, siteId: string): Promise<{ site: Row[]; added: number }> {
  const [fv, sv] = await Promise.all([
    fdb.from('fin_variations').select('variation_id').eq('site_id', siteId),
    fdb.from('variations').select('*').eq('site_id', siteId).order('created_at'),
  ]);
  const site = (sv.data as Row[] | null) || [];
  const linked = new Set(((fv.data as Row[] | null) || []).map((v) => v.variation_id).filter(Boolean));
  const fresh = site.filter((v) => !linked.has(v.id) && v.approval_status !== 'declined');
  let added = 0;
  if (fresh.length && !busy && !fv.error) {
    busy = true;
    try {
      for (const v of fresh) {
        const amt = num(v.cost_impact), ok = amt !== null && !isNaN(amt), approved = v.approval_status === 'approved';
        const r = await insertNumbered('fin_variations', { col: 'site_id', val: siteId }, label, {
          org_id: me.org_id, site_id: siteId, created_by: me.id, title: String(v.description || 'Variation').slice(0, 200), description: v.description || null,
          variation_id: v.id, instructed_on: String(v.created_at || '').slice(0, 10) || null, status: approved ? 'agreed' : 'submitted',
          quoted: ok ? amt : null, agreed_value: approved && ok ? amt : null, notes: 'Raised on site',
        });
        if (r) added++;
      }
    } finally { busy = false; }
  }
  return { site, added };
}

/** Puts a Finance variation on the Schedule of Works as its own section (no prices). Off during the trial. */
export async function varToSow(me: Profile, siteId: string, v: Row, site: Row[]): Promise<{ ok?: string; error?: string }> {
  if (FIN_TRIAL && !(me.org_id && FIN_SANDBOX_ORGS.includes(me.org_id))) return { error: 'Finance trial — switched off while testing (nothing is added to the Schedule of Works yet).' };
  if (v.schedule_section_id) return { ok: 'Already on the Schedule of Works.' };
  const sv = v.variation_id ? site.find((x) => x.id === v.variation_id) : null;
  if (sv?.schedule_section_id) {
    await fdb.from('fin_variations').update({ schedule_section_id: sv.schedule_section_id } as never).eq('id', v.id);
    return { ok: 'Already on the Schedule of Works.' };
  }
  const ex = await fdb.from('schedule_sections').select('name').eq('site_id', siteId);
  const secId = await addSection(me, siteId, nextVariationName(((ex.data as Row[] | null) || []).map((s) => s.name)));
  if (!secId) return { error: 'Could not add to the schedule — try again.' };
  const pos = await fdb.from('schedule_tasks').select('position').eq('site_id', siteId).order('position', { ascending: false, nullsFirst: false }).limit(1);
  await fdb.from('schedule_tasks').insert({ site_id: siteId, section_id: secId, name: `${v.number ? `${v.number} ` : ''}${v.title || 'Variation work'}`, status: 'todo', position: ((((pos.data as Row[] | null) || [])[0]?.position) || 0) + 1 } as never);
  await fdb.from('fin_variations').update({ schedule_section_id: secId } as never).eq('id', v.id);
  if (sv) await fdb.from('variations').update({ schedule_section_id: secId } as never).eq('id', sv.id);
  return { ok: 'Added to the Schedule of Works.' };
}

/** Quick approve (at the value given) or reject. */
export async function setVarGroup(v: Row, g: 'approved' | 'rejected', value?: number): Promise<boolean> {
  const row: Row = { status: g === 'approved' ? 'agreed' : 'rejected', updated_at: new Date().toISOString() };
  if (g === 'approved') { row.agreed_value = round2(value || 0); row.agreed_on = today(); }
  return !!(await fdb.from('fin_variations').update(row as never).eq('id', v.id).select('id')).data?.length;
}
