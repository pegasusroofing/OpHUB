// Schedule of Works manager tools. Ported from 480/460: add/rename/duplicate/delete
// sections, add "Variation N" work, add/rename/move/delete tasks (and their photos),
// link a task to an address, and complete a task by picking photos already on it.
// Copy from the company SoW library, import tasks from Excel / CSV / PDF, the office
// copy of the schedule (documents, managers-only), and tagging a task to a
// subcontractor.
import { supabase } from '@/lib/supabase';
import { moveTask, nextVariationName } from '@/lib/rules/sow';
import type { Profile } from '@/lib/types';
import { mustHit } from '@/lib/mustHit';

const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };

async function nextPos(table: 'schedule_sections' | 'schedule_tasks', siteId: string): Promise<number> {
  const r = await db.from(table).select('position').eq('site_id', siteId).order('position', { ascending: false, nullsFirst: false }).limit(1);
  return (((r.data as { position: number | null }[] | null) ?? [])[0]?.position || 0) + 1;
}
function log(me: Profile, siteId: string, action: string, description: string) {
  if (me.org_id) void db.from('site_activity_log').insert({ site_id: siteId, org_id: me.org_id, actor_id: me.id, action, description } as never).then(undefined, () => undefined);
}

export async function addSection(me: Profile, siteId: string, name: string): Promise<string | null> {
  const r = await db.from('schedule_sections').insert({ site_id: siteId, name, position: await nextPos('schedule_sections', siteId), created_by: me.id } as never).select('id');
  return r.error ? null : (((r.data as { id: string }[] | null) ?? [])[0]?.id ?? null);
}

/** A new auto-numbered "Variation N" section with this as its first task. */
export async function addVariationWork(me: Profile, siteId: string, taskName: string): Promise<string | null> {
  const ex = await db.from('schedule_sections').select('name').eq('site_id', siteId);
  const name = nextVariationName(((ex.data as { name: string }[] | null) ?? []).map((s) => s.name));
  const id = await addSection(me, siteId, name);
  if (!id) return null;
  await db.from('schedule_tasks').insert({ site_id: siteId, section_id: id, name: taskName || name, status: 'todo', position: await nextPos('schedule_tasks', siteId) } as never);
  return name;
}

export async function renameSection(id: string, name: string): Promise<boolean> {
  return !!(await db.from('schedule_sections').update({ name } as never).eq('id', id).select('id')).data?.length;
}

/** Deleting a section moves its tasks back to the ungrouped list (they aren't deleted). */
export async function deleteSection(me: Profile, siteId: string, id: string, name: string): Promise<boolean> {
  const r = mustHit(await db.from('schedule_sections').delete().eq('id', id).select('id'));
  if (r.error) return false;
  log(me, siteId, 'schedule_section_deleted', `Deleted Schedule of Works section "${name}"`);
  return true;
}

/** Copies the section and its task names, all fresh (to do, no photos). */
export async function duplicateSection(me: Profile, siteId: string, fromId: string, name: string): Promise<number | null> {
  const tasks = await db.from('schedule_tasks').select('name').eq('site_id', siteId).eq('section_id', fromId).order('position', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
  const id = await addSection(me, siteId, name);
  if (!id) return null;
  const list = (tasks.data as { name: string }[] | null) ?? [];
  if (list.length) {
    let pos = await nextPos('schedule_tasks', siteId);
    await db.from('schedule_tasks').insert(list.map((t) => ({ site_id: siteId, section_id: id, name: t.name, status: 'todo', position: pos++ })) as never);
  }
  return list.length;
}

export async function addTask(siteId: string, name: string, sectionId: string | null, subId: string | null): Promise<boolean> {
  const row: Record<string, unknown> = { site_id: siteId, name, status: 'todo', position: await nextPos('schedule_tasks', siteId) };
  if (sectionId) row.section_id = sectionId;
  if (subId) row.sub_site_id = subId;
  return !(await db.from('schedule_tasks').insert(row as never)).error;
}

export async function renameTask(id: string, name: string): Promise<boolean> {
  return !!(await db.from('schedule_tasks').update({ name } as never).eq('id', id).select('id')).data?.length;
}

export async function setTaskAddress(id: string, subId: string | null): Promise<boolean> {
  return !!(await db.from('schedule_tasks').update({ sub_site_id: subId } as never).eq('id', id).select('id')).data?.length;
}

export async function moveScheduleTask(siteId: string, taskId: string, dir: -1 | 1): Promise<string | null> {
  const all = await db.from('schedule_tasks').select('id,section_id,status,position').eq('site_id', siteId).order('position', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
  if (all.error) return 'Could not load the tasks — try again.';
  const r = moveTask((all.data as never[]) ?? [], taskId, dir);
  if ('message' in r) return r.message;
  const res = await Promise.all(r.changes.map((c) => db.from('schedule_tasks').update({ position: c.position } as never).eq('id', c.id)));
  return res.some((x) => x.error) ? 'Could not save the new order — please try again.' : null;
}

/** Deletes tasks and their photo files. Returns how many really went (RLS may refuse some). */
export async function deleteTasks(me: Profile, siteId: string, ids: string[], singleName?: string): Promise<number> {
  const photos = await db.from('schedule_photos').select('task_id,storage_path,mid_path,thumb_path').in('task_id', ids);
  const r = await db.from('schedule_tasks').delete().in('id', ids).select('id');
  if (r.error) return 0;
  const gone = ((r.data as { id: string }[] | null) ?? []).map((x) => x.id);
  if (!gone.length) return 0;
  log(me, siteId, 'schedule_task_deleted', singleName ? `Deleted Schedule of Works task "${singleName}"` : `Deleted ${gone.length} Schedule of Works task${gone.length > 1 ? 's' : ''}`);
  try {
    await db.from('schedule_photos').delete().in('task_id', gone);
    const paths: string[] = [];
    ((photos.data as { task_id: string; storage_path: string; mid_path: string | null; thumb_path: string | null }[] | null) ?? []).filter((p) => gone.includes(p.task_id)).forEach((p) => {
      const b = p.storage_path.replace(/\.[a-z0-9]+$/i, '');
      [p.storage_path, p.mid_path || `${b}_m.jpg`, p.thumb_path || `${b}_t.jpg`].forEach((x) => { if (x && !paths.includes(x)) paths.push(x); });
    });
    for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('site-photos').remove(paths.slice(i, i + 100));
  } catch { /* the tasks are gone; tidying files is best effort */ }
  return gone.length;
}

/** Manager completes a task using photos already on it (moved to "done"), or with none. */
export async function pmComplete(siteId: string, me: Profile, taskId: string, photoIds: string[]): Promise<boolean> {
  if (photoIds.length) {
    const r = await supabase.rpc('set_schedule_photo_stage' as never, { p_ids: photoIds, p_stage: 'done' } as never);
    if (r.error) return false;
  }
  const r = await db.from('schedule_tasks').update({ status: 'done', completed_at: new Date().toISOString(), percent_complete: 100 } as never).eq('id', taskId).select('section_id');
  if (r.error) return false;
  // Variation auto-close (same as the photo route).
  const sectionId = ((r.data as { section_id: string | null }[] | null) ?? [])[0]?.section_id;
  if (sectionId) {
    try {
      const v = await db.from('variations').select('id,description').eq('schedule_section_id', sectionId).eq('status', 'live');
      const variation = ((v.data as { id: string; description: string }[] | null) ?? [])[0];
      const t = await db.from('schedule_tasks').select('status').eq('section_id', sectionId);
      const ts = (t.data as { status: string }[] | null) ?? [];
      if (variation && ts.length && ts.every((x) => x.status === 'done')) {
        await db.from('variations').update({ status: 'closed', closed_at: new Date().toISOString() } as never).eq('id', variation.id);
        log(me, siteId, 'variation_closed', `Auto-closed variation "${variation.description || ''}" (all Schedule of Works tasks complete)`);
      }
    } catch { /* non-fatal */ }
  }
  return true;
}

/** Managers: "viewed the Schedule of Works" for the HUB. */
export async function markSowViewed(me: Profile, siteId: string): Promise<void> {
  try { await db.from('sow_views').upsert({ user_id: me.id, site_id: siteId, viewed_at: new Date().toISOString() } as never, { onConflict: 'user_id,site_id' }); } catch { /* best effort */ }
}

/* ---------- From Library (480 useScheduleLibraryTemplate) ---------- */
export async function libraryTemplates(orgId: string) {
  return ((await db.from('sow_library_templates').select('id,name').eq('org_id', orgId).order('name')).data as { id: string; name: string }[] | null) ?? [];
}
/** What a library template holds, as short lines for a preview before copying (480 previewLibraryTemplate). */
export async function libraryPreview(templateId: string): Promise<string> {
  const [s, t] = await Promise.all([
    db.from('sow_library_sections').select('id,name').eq('template_id', templateId).order('position', { ascending: true, nullsFirst: false }).order('created_at'),
    db.from('sow_library_tasks').select('name,section_id').eq('template_id', templateId).order('position', { ascending: true, nullsFirst: false }).order('created_at'),
  ]);
  const secs = (s.data as { id: string; name: string }[] | null) ?? [], tasks = (t.data as { name: string; section_id: string | null }[] | null) ?? [];
  if (!secs.length && !tasks.length) return 'This template is empty.';
  const block = (title: string, list: string[]) => `${title} (${list.length})${list.slice(0, 4).map((n) => `\n  • ${n}`).join('')}${list.length > 4 ? `\n  … and ${list.length - 4} more` : ''}`;
  const out = secs.map((x) => block(x.name, tasks.filter((k) => k.section_id === x.id).map((k) => k.name)));
  const loose = tasks.filter((k) => !k.section_id || !secs.some((x) => x.id === k.section_id)).map((k) => k.name);
  if (loose.length) out.push(block('Ungrouped', loose));
  return out.slice(0, 8).join('\n') + (out.length > 8 ? `\n… and ${out.length - 8} more sections` : '');
}
/** A one-time copy of a library template's sections and tasks into this job (all To Do). */
export async function copyLibraryTemplate(me: Profile, siteId: string, templateId: string): Promise<{ secs: number; tasks: number }> {
  const [s, t] = await Promise.all([
    db.from('sow_library_sections').select('id,name').eq('template_id', templateId).order('position', { ascending: true, nullsFirst: false }).order('created_at'),
    db.from('sow_library_tasks').select('name,section_id').eq('template_id', templateId).order('position', { ascending: true, nullsFirst: false }).order('created_at'),
  ]);
  const secs = (s.data as { id: string; name: string }[] | null) ?? [], tasks = (t.data as { name: string; section_id: string | null }[] | null) ?? [];
  const map: Record<string, string> = {};
  let sp = await nextPos('schedule_sections', siteId);
  for (const sec of secs) {
    const r = await db.from('schedule_sections').insert({ site_id: siteId, name: sec.name, position: sp++, created_by: me.id } as never).select('id').single();
    if (r.data) map[sec.id] = (r.data as { id: string }).id;
  }
  let tp = await nextPos('schedule_tasks', siteId);
  const rows = tasks.filter((x) => !x.section_id || map[x.section_id]).map((x) => ({ site_id: siteId, name: x.name, status: 'todo', position: tp++, ...(x.section_id ? { section_id: map[x.section_id] } : {}) }));
  if (rows.length) await db.from('schedule_tasks').insert(rows as never);
  return { secs: secs.length, tasks: tasks.length };
}

/** Imported task names go on the end of the ungrouped list (480 confirmScheduleImport / confirmPdfImport). */
export async function importTasks(siteId: string, names: string[]): Promise<boolean> {
  const start = await nextPos('schedule_tasks', siteId);
  return !(await db.from('schedule_tasks').insert(names.map((name, i) => ({ site_id: siteId, name, status: 'todo', position: start + i })) as never)).error;
}

/** The office copy of the Schedule of Works (480 uploadScheduleDocument). */
export async function uploadSowDocs(me: Profile, siteId: string, files: { uri: string; name: string; mimeType?: string | null; size?: number | null }[]): Promise<number> {
  let added = 0;
  for (const f of files) {
    try {
      const rid = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}${added}`;
      const up = await supabase.storage.from('schedule-docs').upload(`${siteId}/${rid}-${f.name.replace(/[^a-z0-9.\-]+/gi, '_')}`, await (await fetch(f.uri)).arrayBuffer(), { contentType: f.mimeType || 'application/octet-stream' });
      if (up.error) continue;
      if (!(await db.from('schedule_documents').insert({ site_id: siteId, org_id: me.org_id, name: f.name, storage_path: up.data.path, size: f.size || null, uploaded_by: me.id } as never)).error) added++;
    } catch { /* counted as not added */ }
  }
  return added;
}
export async function setSowDocVisibility(id: string, managersOnly: boolean): Promise<boolean> {
  return !!(await db.from('schedule_documents').update({ visibility: managersOnly ? 'managers' : 'all' } as never).eq('id', id).select('id')).data?.length;
}
export async function deleteSowDoc(me: Profile, siteId: string, doc: { id: string; name: string; storage_path: string }): Promise<boolean> {
  if (!(await db.from('schedule_documents').delete().eq('id', doc.id).select('id')).data?.length) return false;
  void supabase.storage.from('schedule-docs').remove([doc.storage_path]).catch(() => undefined);
  log(me, siteId, 'schedule_document_deleted', `Removed Schedule of Works document "${doc.name}"`);
  return true;
}

/** Main-contractor jobs: tag a task to one of the job's subcontractors (460 setTaskSubcontractor). Visibility is untouched. */
export async function setTaskSubcontractor(taskId: string, companyId: string | null): Promise<boolean> {
  return !!(await db.from('schedule_tasks').update({ subcontractor_company_id: companyId } as never).eq('id', taskId).select('id')).data?.length;
}
