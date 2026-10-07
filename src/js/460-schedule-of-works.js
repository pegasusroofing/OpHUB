/* ================= SCHEDULE OF WORKS ================= */
let editingTaskId = null;
// Multi-site: which task's row currently has its "link to an address" picker
// open (via the row's ▾ dropdown, or from the Add Task panel's Address step).
let addressPickerTaskId = null;
window.setTaskSubAddress = async function(siteId, taskId, subId){
  const row = await dbUpdate('schedule_tasks', taskId, {sub_site_id: subId||null});
  if(row){
    addressPickerTaskId = null;
    toast(subId ? 'Address linked' : 'Address unlinked');
    render();
  }
};
// Which task's "assign to a subcontractor" picker is open — see taskRowHtml.
// Tagging a task here doesn't touch visibility_mode/assigned_*_ids at all;
// it's a separate access path (see the "subcontractor own tasks
// select/update" RLS policies) so a subcontractor's operatives can reach
// their tagged tasks regardless of whatever PM/operative visibility a
// section or task otherwise has.
let subcontractorAssignPickerTaskId = null;
window.openSubcontractorAssignPicker = function(taskId){
  subcontractorAssignPickerTaskId = subcontractorAssignPickerTaskId===taskId ? null : taskId;
  render();
};
window.setTaskSubcontractor = async function(siteId, taskId, companyId){
  const row = await dbUpdate('schedule_tasks', taskId, {subcontractor_company_id: companyId||null});
  if(row){
    subcontractorAssignPickerTaskId = null;
    toast(companyId ? 'Assigned to subcontractor' : 'Unassigned from subcontractor');
    render();
  }
};
let schedulePollTimer = null;
let subSchedulePollTimer = null;
let scheduleFilter = 'active';
let scheduleLastSiteId; // undefined initially so the first render always sets a default
// A task moving to "Complete" isn't saved as done straight away — it sits
// here as a pending completion until at least one completion photo is
// uploaded, so nobody can mark a job done with no evidence attached. They
// can back out to In Progress at any point if they haven't got photos yet.
let pendingCompleteTaskId = null;
// Task whose "how far along is this now?" prompt is showing — set right
// after a progress photo uploads (see taskPhoto), cleared once the slider
// is moved or Skip is tapped. The slider itself is always there on an In
// Progress task; this only controls the highlighted prompt around it.
let percentPromptTaskId = null;
let pdfImportSiteId = null;
let pdfImportText = '';
// Excel/CSV import now asks which column to use instead of always assuming
// column A is the task name (some companies export a Line ID/Ref column
// first and the actual scope/description sits further along the row).
// null until a file's been chosen; then holds the parsed sheet so the
// column picker can preview values before anything's actually imported.
let scheduleImportPreview = null; // {headers:[...], dataRows:[[...],...], colIndex:number} | null
// Sections default to OPEN (undefined/not-false = open) so switching a site
// over to sections doesn't hide any tasks that were already visible.
let scheduleSectionsOpen = {};
let scheduleAddMode = 'task'; // 'task' | 'section'
let scheduleUploadOpen = false;
// Add is now a single "+" menu at the top of the page (works from any tab)
// instead of a big always-there card at the bottom — this tracks which of
// the three panels it opened, if any. null = nothing open.
let scheduleAddPanel = null; // null | 'task' | 'section' | 'upload'
// Multi-select delete — off by default; a task's own "..." menu has a
// "Select Multiple" item (right below its single Delete) that turns this on
// and pre-ticks that task, so a PM can then tick more lines and delete them
// all in one go instead of one at a time.
let scheduleMultiSelectMode = false;
let scheduleMultiSelectedIds = new Set();
// Multi-site "Add Task": once one task has been added to a given add-row
// (keyed by sectionId, or '__ungrouped__' for the top-level Add Task panel)
// with a sub-address actually chosen, later adds in that same row auto-tag
// to that same address instead of asking again — see addTask().
let sectionFirstSubAddr = {};
// Was a "+" button opening a 5-option popup modal (Add Task/Section/
// Variation/Library/Upload) — Andy found that an extra tap for no reason,
// so Add Task and Add Section are now always-visible buttons in the header
// (see renderSchedule) and the other three live under a small "More" menu
// (rowActionsMenuHtml) next to them instead of a full-screen modal.
let scheduleSectionsCache = [];