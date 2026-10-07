/* ================= Schedule of Works — assignable visibility. A section (or
   an ungrouped task; grouped tasks always inherit their section's setting)
   can be scoped to "All" (default — visible to everyone with site access,
   same as before this feature existed) or to specific Project Managers
   and/or Operatives — enforced server-side by RLS (schedule_visibility_ok),
   not just hidden client-side, so an unassigned operative genuinely cannot
   fetch the row at all. Admins always see everything regardless. ================= */
let scheduleAssignTarget = null; // {kind:'section'|'task', id} of whichever row's assign form is open, or null
let scheduleAssignDraft = {all:true, pmOn:true, pmIds:new Set(), opOn:true, opIds:new Set()};
window.openScheduleAssign = function(kind, id, record, defaultOperativeIds, defaultPmIds){
  scheduleAssignTarget = {kind, id};
  const mode = record ? record.visibility_mode : 'all';
  const presetOpIds = record && record.assigned_operative_ids && record.assigned_operative_ids.length ? record.assigned_operative_ids : (defaultOperativeIds||[]);
  // Project Managers default to fully ticked (everyone visible) whenever
  // there's no genuinely saved PM subset yet — narrowing a section/task down
  // to specific Operatives must never silently drop PM access along with it.
  // A PM has to explicitly untick themselves/others to remove visibility,
  // rather than defaulting to nobody and locking PMs out unless they opt
  // back in blind (this was causing sections to become invisible/"frozen"
  // for the PM who'd just restricted them).
  const savedPmIds = record && record.assigned_pm_ids && record.assigned_pm_ids.length ? record.assigned_pm_ids : null;
  scheduleAssignDraft = {
    all: mode !== 'assigned',
    pmOn: true,
    pmIds: new Set(savedPmIds || defaultPmIds || []),
    opOn: record ? !!(record.assigned_operative_ids && record.assigned_operative_ids.length) : true,
    opIds: new Set(presetOpIds),
  };
  render();
};
// Which table a given "assign visibility" kind lives in — shared by Schedule
// of Works (section/task) and, since Andy asked for the same per-folder
// visibility control on Drawings, drawingfolder -> drawing_folders too.
function scheduleAssignTable(kind){
  if(kind==='section') return 'schedule_sections';
  if(kind==='drawingfolder') return 'drawing_folders';
  return 'schedule_tasks';
}
window.openScheduleAssignExisting = async function(kind, id, siteId){
  const table = scheduleAssignTable(kind);
  const [rows, assignments, pmList] = await Promise.all([
    dbSelect(table, 'id=eq.'+id+'&select=visibility_mode,assigned_pm_ids,assigned_operative_ids'),
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
    loadPMList(),
  ]);
  openScheduleAssign(kind, id, rows[0]||null, assignments.map(a=>a.user_id), pmList.map(p=>p.id));
};
window.closeScheduleAssign = function(){ scheduleAssignTarget = null; render(); };
window.toggleScheduleAssignAll = function(){ scheduleAssignDraft.all = !scheduleAssignDraft.all; render(); };
window.toggleScheduleAssignGroup = function(which){
  if(which==='pm') scheduleAssignDraft.pmOn = !scheduleAssignDraft.pmOn;
  else scheduleAssignDraft.opOn = !scheduleAssignDraft.opOn;
  render();
};
window.toggleScheduleAssignPerson = function(which, id){
  const set = which==='pm' ? scheduleAssignDraft.pmIds : scheduleAssignDraft.opIds;
  if(set.has(id)) set.delete(id); else set.add(id);
  render();
};
window.saveScheduleAssign = async function(siteId){
  const t = scheduleAssignTarget; if(!t) return;
  const table = scheduleAssignTable(t.kind);
  const d = scheduleAssignDraft;
  const patch = d.all
    ? {visibility_mode:'all', assigned_pm_ids:[], assigned_operative_ids:[]}
    : {
        visibility_mode:'assigned',
        assigned_pm_ids: d.pmOn ? [...d.pmIds] : [],
        assigned_operative_ids: d.opOn ? [...d.opIds] : [],
      };
  const row = await dbUpdate(table, t.id, patch);
  if(row){ toast('Visibility updated'); scheduleAssignTarget = null; render(); }
};
function scheduleAssignFormHtml(siteId, pmOptions, operativeOptions){
  const d = scheduleAssignDraft;
  return `
    <div class="card" style="margin:10px 0;background:var(--paper);">
      <p class="sectiontitle" style="margin-top:0;">Who can see this</p>
      <div class="row-gap" style="margin-bottom:10px;">
        <div class="filterchip ${d.all?'active':''}" style="flex:1;text-align:center;" onclick="toggleScheduleAssignAll()">All</div>
      </div>
      ${!d.all ? `
        <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 6px;"><input type="checkbox" style="width:auto;" ${d.pmOn?'checked':''} onchange="toggleScheduleAssignGroup('pm')">Project Managers</label>
        ${d.pmOn ? `<div style="max-height:150px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:8px;margin:0 0 10px;">
          ${pmOptions.length ? pmOptions.map(p=>`<label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 6px;"><input type="checkbox" style="width:auto;" ${d.pmIds.has(p.id)?'checked':''} onchange="toggleScheduleAssignPerson('pm','${p.id}')">${escapeHtml(p.name)}</label>`).join('') : `<p class="stub" style="margin:0;">No PMs to choose from.</p>`}
        </div>` : ''}
        <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 6px;"><input type="checkbox" style="width:auto;" ${d.opOn?'checked':''} onchange="toggleScheduleAssignGroup('op')">Operatives</label>
        ${d.opOn ? `<div style="max-height:150px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:8px;margin:0 0 10px;">
          ${operativeOptions.length ? operativeOptions.map(p=>`<label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 6px;"><input type="checkbox" style="width:auto;" ${d.opIds.has(p.id)?'checked':''} onchange="toggleScheduleAssignPerson('op','${p.id}')">${escapeHtml(p.name)}</label>`).join('') : `<p class="stub" style="margin:0;">No operatives assigned to this site yet.</p>`}
        </div>` : ''}
        ${!d.pmOn && !d.opOn ? `<p class="stub" style="margin:0 0 10px;color:var(--warn);">Nobody but admins will be able to see this until you tick Project Managers and/or Operatives.</p>` : ''}
      ` : ''}
      <div class="row-gap">
        <button class="darkbtn" style="flex:1;" onclick="saveScheduleAssign('${siteId}')">Save</button>
        <button class="ghostbtn" style="width:auto;padding:10px 16px;" onclick="closeScheduleAssign()">Cancel</button>
      </div>
    </div>
  `;
}