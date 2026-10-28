// Schedule of Works rules, ported from 480-schedule-of-works-from-library-site-side.js,
// 481-sow-instant-photos.js and sowOverallPct (100-state.js). Pure functions only.

export type TaskStatus = 'todo' | 'progress' | 'done';
export type SowTask = {
  id: string;
  name: string;
  status: string | null;
  section_id: string | null;
  sub_site_id: string | null;
  percent_complete: number | null;
  completed_at: string | null;
  created_at: string | null;
  visibility_mode?: string | null;
};
export type SowFilter = 'active' | 'done' | 'all';
export const SOW_FILTERS: SowFilter[] = ['active', 'done', 'all'];
export const SOW_FILTER_LABEL: Record<SowFilter, string> = { active: 'To Do / In Progress', done: 'Complete', all: 'All' };

// Photo sizes (same as today): full 1280 wide @0.72, mid 800 longest side @0.62, thumb 200 @0.7.
export const SOW_PHOTO = { full: { maxW: 1280, q: 0.72 }, mid: { max: 800, q: 0.62 }, thumb: { max: 200, q: 0.7 } };

/** Done counts 100, in progress counts its %, to do counts 0; averaged over all tasks. */
export function overallPct(tasks: Pick<SowTask, 'status' | 'percent_complete'>[]): number {
  if (!tasks.length) return 0;
  let sum = 0;
  for (const t of tasks) sum += t.status === 'done' ? 100 : t.status === 'progress' ? Math.max(0, Math.min(100, Number(t.percent_complete) || 0)) : 0;
  return Math.round(sum / tasks.length);
}

export function filterTasks<T extends Pick<SowTask, 'status'>>(tasks: T[], f: SowFilter): T[] {
  if (f === 'all') return tasks;
  if (f === 'done') return tasks.filter((t) => t.status === 'done');
  return tasks.filter((t) => t.status === 'todo' || t.status === 'progress');
}

/** Multi-site: checked in at an address = only that address's tasks (plus untagged ones), unless "show all". */
export function tasksForAddress<T extends Pick<SowTask, 'sub_site_id'>>(tasks: T[], hereSubId: string | null, showAll: boolean): T[] {
  if (!hereSubId || showAll) return tasks;
  return tasks.filter((t) => !t.sub_site_id || t.sub_site_id === hereSubId);
}

/** % slider snaps to tens, 0-100. 100 means "complete", which needs a photo instead. */
export function snapPct(v: number): number {
  return Math.max(0, Math.min(100, Math.round(Number(v) / 10) * 10));
}

/** Patch for the To Commence / In Progress buttons. Complete never goes through here (it needs a photo). */
export function statusPatch(next: 'todo' | 'progress'): Record<string, unknown> {
  const patch: Record<string, unknown> = { status: next, completed_at: null };
  if (next === 'todo') patch.percent_complete = null;
  return patch;
}

/** Patch saved (after the photos upload) when a task is completed with photos. */
export function completePatch(now: Date = new Date()): Record<string, unknown> {
  return { status: 'done', completed_at: now.toISOString(), percent_complete: 100 };
}

/** The stage a new photo is filed under, from the task's status when it was taken. */
export function photoStage(status: string | null): TaskStatus {
  return status === 'done' ? 'done' : status === 'progress' ? 'progress' : 'todo';
}

/** Section/ungrouped: shown on this tab? Sections with no matching tasks hide (except, for managers, empty new sections on the active tab). */
export function sectionVisible(f: SowFilter, matching: number, everAdded: number, isManager: boolean): boolean {
  if (f === 'all' || matching) return true;
  return f === 'active' && !everAdded && isManager;
}

/** "Site condition" close-out stays closed unless tasks were added after it was saved. */
export function siteConditionSaved(flag: { closeout_saved_at: string | null } | null | undefined, tasks: Pick<SowTask, 'created_at'>[]): boolean {
  if (!flag || !flag.closeout_saved_at) return false;
  const at = flag.closeout_saved_at;
  return !tasks.some((t) => t.created_at && t.created_at > at);
}

/** Storage paths for a photo: <site>/schedule/<task>/<id>.jpg plus _m and _t. */
export function photoPaths(siteId: string, taskId: string, id: string) {
  const base = `${siteId}/schedule/${taskId}/${id}`;
  return { full: `${base}.jpg`, mid: `${base}_m.jpg`, thumb: `${base}_t.jpg` };
}

/** File name used when the photo is copied to the job's OneDrive folder. */
export function oneDriveName(taskName: string, takenAt: Date, id: string): string {
  const clean = (taskName || 'Photo').replace(/[^a-z0-9 ]+/gi, '').trim() || 'Photo';
  return `${clean} ${takenAt.toISOString().slice(0, 16).replace(/[:T]/g, '-')} ${id.slice(0, 4)}.jpg`;
}

/** A variation tied to a section closes itself when every task in that section is done. */
export function allDone(tasks: Pick<SowTask, 'status'>[]): boolean {
  return tasks.length > 0 && tasks.every((t) => t.status === 'done');
}

/** "3/5 done" counter for a section header. */
export function doneCount(tasks: Pick<SowTask, 'status'>[]): string {
  return `${tasks.filter((t) => t.status === 'done').length}/${tasks.length} done`;
}
