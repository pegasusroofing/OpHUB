// Delivery Schedule export (870 exportDeliveryScheduleExcel / Pdf): the 7 days
// from the day on screen, by date, 1st drops first, then by drop.
import { siteHeading } from '@/data/driver';
import { supabase } from '@/lib/supabase';
import { bySlotOrder, collectionLine, slotLabel } from '@/lib/rules/driver';
import { exportTableExcel, exportTablePdf, type Table } from '@/lib/tableExport';
import type { Organization, Site } from '@/lib/types';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Row = Record<string, any>;

export async function exportDeliverySchedule(kind: 'x' | 'p', orgId: string, days: string[], sites: Site[], people: { id: string; name: string; phone?: string | null }[], org: Organization | null): Promise<string | null> {
  const [t, s] = await Promise.all([
    db.from('delivery_tasks').select('*').eq('org_id', orgId).in('scheduled_date', days),
    db.from('suppliers').select('id,name').eq('org_id', orgId),
  ]);
  const tasks = ((t.data as Row[] | null) ?? []).sort((a, b) => (a.scheduled_date !== b.scheduled_date ? (a.scheduled_date < b.scheduled_date ? -1 : 1) : bySlotOrder(a as never, b as never)));
  if (!tasks.length) return 'No deliveries in this week to export.';
  const sup: Record<string, string> = Object.fromEntries(((s.data as { id: string; name: string }[] | null) ?? []).map((x) => [x.id, x.name]));
  const pm = (x: Row) => { const st = x.site_id ? sites.find((y) => y.id === x.site_id) : null; const p = st?.responsible_pm_id ? people.find((y) => y.id === st.responsible_pm_id) : null; return p ? `${p.name}${p.phone ? ` ${p.phone}` : ''}` : ''; };
  const label = `${new Date(`${days[0]}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${new Date(`${days[days.length - 1]}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  const table: Table = {
    title: 'Delivery Schedule', sub: label,
    cols: [{ l: 'Date', w: 70 }, { l: 'Drop', w: 60 }, { l: 'Site', w: 150 }, { l: 'Job PM', w: 100 }, { l: 'Description', w: 170 }, { l: 'Collection from', w: 110 }, { l: 'Driver', w: 80 }, { l: 'Priority', w: 50 }, { l: 'Status', w: 70 }],
    rows: tasks.map((x) => [new Date(`${x.scheduled_date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }), slotLabel(x.time_slot || ''), siteHeading(x as never, sites).join(', '), pm(x), x.description || '', collectionLine(x as never, sup[x.supplier_id]), people.find((p) => p.id === x.driver_id)?.name || 'Unassigned', x.high_priority ? '1st drop' : '', x.status === 'completed' ? 'Completed' : x.needs_completing ? 'Needs completing' : 'Scheduled']),
  };
  const ok = await (kind === 'x' ? exportTableExcel(table, org) : exportTablePdf(table, org)).catch(() => false);
  return ok ? null : 'Could not build the export — please try again.';
}
