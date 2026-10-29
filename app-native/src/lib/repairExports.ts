// Repair contract Excel exports (340): the full Repair Tracker, the route-ordered
// list for a stage (worked out by the repair-jobs-route-export function from the
// yard, CM3 8DQ, and saved as the "last route"), and Approved & Ready oldest first.
import { deliverXlsx, exportFilename } from '@/lib/pdf';
import { REPAIR_ACCESS, REPAIR_CATEGORIES, sortRepairs, type RepairJob } from '@/lib/rules/repairs';
import { makeXlsx, type XCell } from '@/lib/rules/xlsx';
import { supabase } from '@/lib/supabase';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
type Row = Record<string, any>;
export const REPAIR_ROUTE_CATEGORIES = ['survey', 'scaffold', 'approved'];
const dOnly = (v: unknown) => (v ? String(v).slice(0, 10) : '');
const yn = (v: unknown) => (v ? 'Y' : 'N');
const money = (v: unknown) => (v != null && v !== '' ? { v: Number(v), s: 'money' as const } : '');
const sheet = (name: string, head: string[], rows: XCell[][], widths: number[]) => makeXlsx([{ name, widths, rows: [head.map((h) => ({ v: h, s: 'head' as const })), ...rows] }]);

export function exportRepairTracker(siteName: string, jobs: RepairJob[]) {
  const today = new Date().toISOString().slice(0, 10);
  const head = ['Job Number', 'Address', 'Description of Call out', 'Survey Required (Y/N/NA)', 'Survey Date', 'Survey Notes / Quoted works', 'Variation Works (£)', 'Scaffolding Required (Y/N/Tower)', 'Scaff Requirements', 'Quote Approved (Y/N)', 'Scaffold Booking Date', 'Scaffold Erection Date', 'Repair Return Date', 'Works Completed (Y/N)', 'Closed (Y/N)', 'Invoiced (Y/N)', 'Status', 'Overdue'];
  const rows = jobs.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).map((j0) => {
    const j = j0 as RepairJob & Row;
    const scaff = j.access_requirement === 'tower' ? 'Tower' : j.access_requirement === 'scaffold' ? 'Y' : 'N';
    return [j.job_number || '', j.address || '', j.description || '', j.survey_required || '', dOnly(j.survey_date), j.survey_notes || '', money(j.variation_cost), scaff, j.access_notes || '', j.quote_approved == null ? '' : yn(j.quote_approved),
      dOnly(j.scaffold_booking_date), dOnly(j.scaffold_erection_date), dOnly(j.repair_return_date), yn(j.works_completed), yn(j.closed), yn(j.invoiced), j.job_status || '', !j.closed && j.repair_return_date && j.repair_return_date < today ? 'Y' : ''];
  });
  return deliverXlsx(sheet('Repairs Tracker', head, rows, [12, 28, 30, 14, 12, 32, 14, 16, 26, 14, 16, 16, 14, 14, 12, 12, 18, 10]), exportFilename(siteName, 'Repair Tracker', 'xlsx'));
}

function routeFile(siteName: string, category: string, stops: Row[], unlocated: Row[]) {
  const head = ['Order', 'Distance from Previous (mi)', 'Job Number', 'Address', 'Description', 'Notes', 'Access Requirement', 'Variation Works (£)', 'Scaffold Booking Date', 'Scaffold Erection Date', 'Repair Return Date'];
  const rows: XCell[][] = stops.map((s) => [s.order, s.distance_from_previous_mi, s.job_number || '', s.address || '', s.description || '', s.survey_notes || s.access_notes || '', REPAIR_ACCESS[s.access_requirement] || '', money(s.variation_cost), dOnly(s.scaffold_booking_date), dOnly(s.scaffold_erection_date), dOnly(s.repair_return_date)]);
  unlocated.forEach((j) => rows.push(['—', 'Could not locate on map', j.job_number || '', j.address || '']));
  return deliverXlsx(sheet('Route Order', head, rows, [8, 14, 12, 28, 26, 30, 16, 14, 16, 16, 14]), exportFilename(siteName, `${REPAIR_CATEGORIES[category]?.label || 'Repairs'} Route`, 'xlsx'));
}
/** Works out a fresh route (and saves it as the last route). Returns a message for the toast. */
export async function exportRepairRoute(siteId: string, siteName: string, category: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('repair-jobs-route-export', { body: { site_id: siteId, category } });
  const d = (data || {}) as Row;
  if (error || d.error) return d.error || 'Could not work out a route — try again.';
  if (!d.stops?.length) return 'No jobs with addresses in this list yet.';
  if (!(await routeFile(siteName, category, d.stops, d.unlocated || []))) return 'Could not make the file — try again.';
  return `Route exported — starting from the yard (CM3 8DQ)${d.unlocated?.length ? `, ${d.unlocated.length} job(s) couldn’t be located` : ''}`;
}
export async function lastRepairRoute(siteId: string, category: string) {
  return ((await db.from('repair_route_exports').select('*').eq('site_id', siteId).eq('category', category).maybeSingle()).data as Row | null) ?? null;
}
export async function viewLastRepairRoute(siteName: string, category: string, saved: Row): Promise<string> {
  if (!(await routeFile(siteName, category, saved.stops || [], saved.unlocated || []))) return 'Could not make the file — try again.';
  return `Opened the last saved route from ${new Date(saved.generated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
}
export async function exportRepairsByApproved(siteName: string, jobs: RepairJob[]): Promise<string> {
  const list = sortRepairs(jobs.filter(REPAIR_CATEGORIES.approved.match), 'approved_asc') as (RepairJob & Row)[];
  if (!list.length) return 'No jobs in Approved & Ready yet.';
  const head = ['Approved On', 'Job Number', 'Address', 'Description', 'Notes', 'Access Requirement', 'Variation Works (£)', 'Scaffold Booking Date', 'Scaffold Erection Date', 'Repair Return Date'];
  const rows = list.map((j) => [dOnly(j.quote_approved_at), j.job_number || '', j.address || '', j.description || '', j.survey_notes || j.access_notes || '', REPAIR_ACCESS[j.access_requirement || ''] || '', money(j.variation_cost), dOnly(j.scaffold_booking_date), dOnly(j.scaffold_erection_date), dOnly(j.repair_return_date)]);
  return (await deliverXlsx(sheet('Oldest Approved', head, rows, [14, 12, 28, 26, 30, 16, 14, 16, 16, 14]), exportFilename(siteName, 'Approved & Ready — Oldest First', 'xlsx'))) ? 'Exported — oldest approved first' : 'Could not make the file — try again.';
}
