/* ================= Maintenance / Repair Contract =================
   A repair_contract site's "Home" is a list of individual repair jobs
   (repair_jobs) instead of the usual Schedule of Works/Check-in layout —
   see the branch in renderSiteHome above. Operatives get a sleek, minimal
   view (survey, progress, completion); PM/Admin get everything (scaffold
   dates, cost, invoicing, job status, closing, Excel export). Nothing here
   syncs live with OneDrive — repair-tracker-nightly-push (a Supabase cron
   edge function) pushes a fresh read-only tracker-style .xlsx snapshot to
   the site's linked OneDrive folder once a night; this app is the only
   place any of this data is actually edited. */
const REPAIR_ACCESS_LABEL = {none:'None', ladder:'Ladder', scaffold:'Scaffold', tower:'Tower'};
// #(repair-job-status-workflow-v2) 2026-09-25 — job_status used to be a
// purely cosmetic PM-editable label with no effect on which tile a job
// showed up in (every tile was worked out fresh each time from a handful of
// separate booleans — survey_required, quote_approved, scaffold_erection_date,
// works_completed, closed). That made it impossible for a PM to just move a
// job somewhere directly ("this one doesn't need all of the above steps"),
// and gave no single place that said what stage a job was actually at.
// job_status is now the real state machine driving tile placement — every
// action below (survey completed, cost issued, approved/rejected, scaffold
// erected, progress started, works completed, closed) advances it
// automatically, AND a PM can override it directly at any time (the status
// control at the top of the job page) since it's just one plain column.
// The granular fields still exist and still drive the detail page's own
// section gating (e.g. Progress requires quote_approved===true) — job_status
// is what decides which list/tile a job is found in.
const REPAIR_JOB_STATUS_OPTIONS = ['To Survey','Surveyed - Awaiting Cost','Surveyed - Variation Issued','Approved - Awaiting Scaffold','Approved - To Do','In Progress','Rejected','Awaiting Sign-off','Closed'];
// A job needs the Scaffold step only when its access requirement is
// literally Scaffold — Tower and Ladder go straight to Approved - To Do
// once approved (Andy: "if a tower or ladder is chosen it goes into
// approved to do"). Tower used to be treated the same as Scaffold here;
// that's the one behaviour change in this pass that isn't purely additive.
function repairJobNeedsScaffold(j){ return j.access_requirement==='scaffold'; }
const REPAIR_CATEGORY_DEFS = {
  survey:            {label:'Jobs to Survey',              match:j=>!j.closed && (!j.job_status || j.job_status==='To Survey')},
  awaiting_cost:     {label:'Surveyed — Awaiting Cost',    match:j=>!j.closed && j.job_status==='Surveyed - Awaiting Cost'},
  variation_issued:  {label:'Variation Issued',            match:j=>!j.closed && j.job_status==='Surveyed - Variation Issued'},
  scaffold:          {label:'Approved — Awaiting Scaffold',match:j=>!j.closed && j.job_status==='Approved - Awaiting Scaffold'},
  approved:          {label:'Approved — To Do',            match:j=>!j.closed && j.job_status==='Approved - To Do'},
  in_progress:       {label:'In Progress',                 match:j=>!j.closed && j.job_status==='In Progress'},
  awaiting_signoff:  {label:'Awaiting Sign-off',            match:j=>!j.closed && j.job_status==='Awaiting Sign-off'},
  rejected:          {label:'Rejected',                    match:j=>!j.closed && j.job_status==='Rejected'},
  completed:         {label:'Completed Jobs',               match:j=>!!j.works_completed},
  open:              {label:'Open Jobs',                    match:j=>!j.closed},
  closed:            {label:'Closed Jobs',                   match:j=>!!j.closed},
  all:               {label:'All Jobs',                      match:()=>true},
};
// Colour for the status pill at the top of the job detail page — separate
// from tile colours since this is one label shown alone, not a grid.
const REPAIR_JOB_STATUS_COLOR = {
  'To Survey': 'var(--slate)',
  'Surveyed - Awaiting Cost': '#8A6300',
  'Surveyed - Variation Issued': 'var(--warn)',
  'Approved - Awaiting Scaffold': 'var(--blue)',
  'Approved - To Do': 'var(--ok)',
  'In Progress': 'var(--ok)',
  'Rejected': 'var(--red)',
  'Awaiting Sign-off': 'var(--warn)',
  'Closed': 'var(--slate)',
};
// Which category tile a job_status belongs to — used so "back" from a job
// detail page returns to the specific tile it came from (survey/scaffold/
// approved/etc) instead of always bouncing to the hub, since the tile a job
// sits in is a pure function of its job_status anyway.
const JOB_STATUS_TO_CATEGORY = {
  'To Survey': 'survey',
  'Surveyed - Awaiting Cost': 'awaiting_cost',
  'Surveyed - Variation Issued': 'variation_issued',
  'Approved - Awaiting Scaffold': 'scaffold',
  'Approved - To Do': 'approved',
  'In Progress': 'in_progress',
  'Awaiting Sign-off': 'awaiting_signoff',
  'Rejected': 'rejected',
  'Closed': 'closed',
};
// Client-side sort for the repair jobs list page — the underlying query
// always comes back newest-first (order=created_at.desc), these just
// re-sort the already-fetched page in memory. Falls back to date_desc for
// any unrecognised/old value (e.g. a stored key from a future addition).
const REPAIR_JOB_SORTS = {
  date_desc: (a,b) => new Date(b.created_at||0) - new Date(a.created_at||0),
  date_asc:  (a,b) => new Date(a.created_at||0) - new Date(b.created_at||0),
  name_asc:  (a,b) => (a.address||'').localeCompare(b.address||''),
  name_desc: (a,b) => (b.address||'').localeCompare(a.address||''),
  job_number_asc: (a,b) => (a.job_number||'').localeCompare(b.job_number||'', undefined, {numeric:true}),
  // Only offered on the Approved & Ready list (see repairJobSortOptionsFor
  // below) — orders by when the job was actually marked Approved
  // (quote_approved_at), not when it was first created, so the oldest
  // approvals surface first regardless of how long the job sat waiting on
  // a survey/quote beforehand. A job approved before this field existed has
  // no quote_approved_at yet, so it sorts to the end rather than crashing
  // the comparison.
  approved_asc: (a,b) => (a.quote_approved_at ? new Date(a.quote_approved_at).getTime() : Infinity) - (b.quote_approved_at ? new Date(b.quote_approved_at).getTime() : Infinity),
};
const REPAIR_JOB_SORT_LABELS = {
  date_desc: 'Date Added (Newest First)',
  date_asc: 'Date Added (Oldest First)',
  name_asc: 'Address (A–Z)',
  name_desc: 'Address (Z–A)',
  job_number_asc: 'Job Number',
  approved_asc: 'Approved (Oldest First)',
};
// Which sort keys make sense on a given category's list — approved_asc only
// means anything where quote_approved_at is actually being set (Approved &
// Ready), so it's left out of the dropdown everywhere else instead of
// showing a sort option that would silently do nothing useful.
function repairJobSortOptionsFor(category){
  return Object.keys(REPAIR_JOB_SORTS).filter(k => k!=='approved_asc' || category==='approved');
}
let repairJobSortBy = 'date_desc';
window.setRepairJobSort = function(value){
  repairJobSortBy = REPAIR_JOB_SORTS[value] ? value : 'date_desc';
  render();
};
// Free-text filter on the repair jobs list — matches address, description
// or job number (case-insensitive substring). Cleared whenever the visible
// category changes so an old search doesn't silently hide jobs in a list
// the user didn't mean to filter.
let repairJobFilterText = '';
let repairJobFilterCategory = null; // siteId+'/'+category of the list the filter text above belongs to
// Re-draws the screen but puts the cursor straight back in the box the
// user was typing in — a plain render() rebuilt the box and dropped the
// keyboard after every single letter.
let keepFocusTimer = null;
function renderKeepingFocus(inputId, readBack){
  if(keepFocusTimer) clearTimeout(keepFocusTimer);
  keepFocusTimer = setTimeout(async ()=>{
    keepFocusTimer = null;
    const before = document.getElementById(inputId);
    const hadFocus = before && document.activeElement === before;
    await render();
    const el = document.getElementById(inputId);
    if(!el || !hadFocus) return;
    // Anything typed while the screen was re-drawing is kept too.
    if(before && before.value !== el.value){ el.value = before.value; if(readBack) readBack(before.value); }
    el.focus();
    try{ el.setSelectionRange(el.value.length, el.value.length); }catch(e){}
  }, 250);
}
window.setRepairJobFilter = function(value){
  repairJobFilterText = value;
  renderKeepingFocus('repairJobFilterInput', v=>{ repairJobFilterText = v; renderKeepingFocus('repairJobFilterInput'); });
};
window.setPermitAssigneeFilter = function(value){
  permitAssigneeFilterText = value;
  renderKeepingFocus('permitAssigneeFilterInput', v=>{ permitAssigneeFilterText = v; renderKeepingFocus('permitAssigneeFilterInput'); });
};
let addRepairJobFormOpen = false;
let newRepairJobNumberDraft = '';
let newRepairJobAddressDraft = '';
let newRepairJobDescriptionDraft = '';
let bulkAddRepairJobsOpen = false;
// Set while a bulk import is running/finished: {siteId, total, done, created, needsReview, duplicates, failedNames:[]}.
// Drives the progress/summary card in renderRepairJobsCategoryHub; null when no import is in flight.
let bulkImportProgress = null;
let repairJobDetailCurrent = null; // the job row currently loaded on the detail page, refreshed every render
let repairJobPhotoBusy = {}; // category -> bool, disables that upload button mid-upload
let repairJobSelectMode = false;
let repairJobSelectedIds = new Set();
let repairJobInfoEditOpen = {}; // jobId -> bool, closed/display view by default (see renderRepairJobDetail)
let repairSurveyBookingEditOpen = {}; // jobId -> bool, closes to a summary once a booking date is set
// #(repair-job-unsaved-notes-prompt) 2026-09-30 — replaces the explicit "Save
// X Notes" buttons on the repair job detail page with a single unsaved-
// changes guard: typing into a notes textarea marks that section dirty (see
// markRepairJobNotesDirty), and leaving the page via go() (back arrow, tab
// bar, any in-app link) offers to save first — see the check inside go().
// {jobId, survey, progress, completion, pricedSchedule} while viewing a
// repair job's detail page; null everywhere else.
let repairJobUnsavedNotes = null;
window.markRepairJobNotesDirty = function(kind){
  if(!repairJobUnsavedNotes) return;
  repairJobUnsavedNotes[kind] = true;
};
// Fire-and-forget, same as the old Save buttons — this is a same-page SPA
// (no real document unload on a hash change), so an in-flight save request
// keeps running in the background after go() switches the hash. Reuses the
// existing save functions rather than re-implementing them so their side
// effects (PM notification emails, PDF re-export) still happen exactly as
// they did when there was a button to click.
function flushRepairJobUnsavedNotes(){
  const dirty = repairJobUnsavedNotes;
  if(!dirty) return;
  if(dirty.survey && document.getElementById('repairSurveyNotes')) window.saveRepairJobSurvey(dirty.jobId);
  if(dirty.progress && document.getElementById('repairProgressNotes')) window.saveRepairJobProgress(dirty.jobId);
  if(dirty.completion && document.getElementById('repairWorksNotes')) window.saveRepairJobCompletionNotes(dirty.jobId);
  if(dirty.pricedSchedule && document.getElementById('repairPricedSchedule')) window.saveRepairJobPricedSchedule(dirty.jobId);
}
let repairSurveyEditOpen = {}; // jobId -> bool, unlocks the (now-locked-by-default) survey card for editing after it's been marked complete
let repairRouteExportBusy = false;
let repairApprovedExportBusy = false;
const REPAIR_ROUTE_CATEGORIES = ['survey','scaffold','approved']; // the 3 lists a route-ordered export makes sense for

async function renderRepairJobsHub(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/sites'); return; }
  // Same first-open "assign operatives" prompt as a normal site's Home page
  // (see renderSiteHome) — repair-contract sites short-circuit straight
  // here before that code runs, so without this a newly-flipped-on repair
  // site never gets the prompt at all and stays unstaffed until someone
  // remembers to go and do it manually from Settings & Admin.
  if(isManager(ME) && siteStatusKey(site)==='live'){
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id&limit=1').then(rows=>{
      if(!rows.length) openAssignOperativesModal(siteId);
    });
  }
  const jobs = await dbSelect('repair_jobs', 'site_id=eq.'+siteId+'&select=id,closed');
  if(__gen !== RENDER_GEN) return;
  const openCount = jobs.filter(j=>!j.closed).length;
  document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid" style="margin-bottom:0;">
      <div class="tile" onclick="go('#/site/${siteId}/repairjobs')">
        <div class="icon" style="background:var(--brand1);color:var(--brand1-text);">🛠</div>
        <div class="lbl">Live Jobs</div><div class="sub">${openCount} open</div>
      </div>
      <div class="tile" onclick="go('#/site/${siteId}/hs')">
        <div class="icon" style="background:#E7E9EE;color:var(--ink);">📄</div>
        <div class="lbl">Health &amp; Safety</div><div class="sub">RAMS · COSHH · TBT</div>
      </div>
      <div class="tile" onclick="go('#/site/${siteId}/materials')">
        <div class="icon" style="background:var(--ok-bg);color:var(--ok);">🧱</div>
        <div class="lbl">${materialsTileLabel()}</div><div class="sub">Orders</div>
      </div>
      <div class="tile" onclick="go('#/site/${siteId}/calendar')">
        <div class="icon" style="background:#E4EEFB;color:var(--blue);">📅</div>
        <div class="lbl">Calendar</div><div class="sub">Key dates</div>
      </div>
      <div class="tile tile-wide" onclick="go('#/site/${siteId}/todos')">
        <div class="icon" style="background:#EFEAFB;color:#5B3FA6;">✅</div>
        <div><div class="lbl">To Do List</div><div class="sub">Tasks</div></div>
      </div>
    </div>
  `, {title:site.name, titleIsSiteName:true, subtitle:fullSiteAddress(site), back:'#/sites', siteId, activeTab:'home'});
}

async function renderRepairJobsCategoryHub(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/sites'); return; }
  const canManage = isManager(ME);
  // Only the columns REPAIR_CATEGORY_DEFS' match() functions actually look
  // at — this page just counts jobs into tiles, it doesn't display their
  // notes/description, so there's no reason to pull those (sometimes
  // sizeable) text fields over the wire just to throw them away.
  const jobs = await dbSelect('repair_jobs', 'site_id=eq.'+siteId+'&select=id,closed,survey_required,access_requirement,scaffold_erection_date,quote_approved,works_completed,job_status&order=created_at.desc');
  if(__gen !== RENDER_GEN) return;
  const tileDefs = [
    {key:'survey', icon:'🔍', bg:'#FFF3D9', color:'#8A6300'},
    {key:'awaiting_cost', icon:'💷', bg:'#FFF3D9', color:'#8A6300'},
    {key:'variation_issued', icon:'⏳', bg:'var(--warn-bg)', color:'var(--warn)'},
    {key:'scaffold', icon:'🪜', bg:'#E4EEFB', color:'var(--blue)'},
    {key:'approved', icon:'✅', bg:'var(--ok-bg)', color:'var(--ok)'},
    {key:'in_progress', icon:'🔧', bg:'var(--ok-bg)', color:'var(--ok)'},
    {key:'awaiting_signoff', icon:'🖊️', bg:'var(--warn-bg)', color:'var(--warn)'},
    {key:'rejected', icon:'✕', bg:'#FBE4E4', color:'var(--red)'},
  ];
  // PM/Admin can hide whole tiles from operatives (e.g. Awaiting Approval,
  // Rejected — things an operative doesn't need to see at all), org-wide,
  // via the "Manage operative tile visibility" panel below. Managers always
  // see every tile regardless, just dimmed/marked so they know what's hidden.
  const hiddenTiles = (ORG && ORG.repair_hidden_tiles) || [];
  const visibleTileDefs = canManage ? tileDefs : tileDefs.filter(t=>!hiddenTiles.includes(t.key));
  document.getElementById('app').innerHTML = shell(`
    ${canManage ? `
      <div class="row-gap" style="margin-bottom:14px;align-items:stretch;">
        <button class="darkbtn" style="flex:1;" onclick="toggleAddRepairJobForm()">+ Add Job</button>
        ${rowActionsMenuHtml('repairhub-menu', `
          <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;exportRepairTrackerExcel('${siteId}')">⬇ Export Excel</div>
          <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;toggleBulkAddRepairJobs()">📥 Bulk Add from Work Orders</div>
        `)}
      </div>
      ${addRepairJobFormOpen ? `
        <div class="card" style="margin-bottom:16px;background:var(--paper);">
          <p class="sectiontitle" style="margin-top:0;">Add Repair Job</p>
          <div class="formfield"><input type="text" id="newRepairJobNumber" placeholder="Job number (optional)" value="${escapeHtml(newRepairJobNumberDraft)}" oninput="newRepairJobNumberDraft=this.value"></div>
          <div class="formfield"><input type="text" id="newRepairJobAddress" placeholder="Address" value="${escapeHtml(newRepairJobAddressDraft)}" oninput="applyTitleCase(this);newRepairJobAddressDraft=this.value"></div>
          <div class="formfield"><textarea id="newRepairJobDescription" placeholder="Description of call out" rows="2" oninput="newRepairJobDescriptionDraft=this.value">${escapeHtml(newRepairJobDescriptionDraft)}</textarea></div>
          <p class="field-label" style="margin-bottom:4px;">Work Order (optional)</p>
          <div class="formfield"><input type="file" id="newRepairJobWorkOrder" accept=".pdf,image/*" onchange="prefillRepairJobFromWorkOrder(this)"></div>
          <p class="stub" style="margin:-4px 0 10px;">PDF work orders on the standard template auto-fill the fields above — check them before saving.</p>
          <div style="display:flex;gap:8px;">
            <button class="darkbtn" style="flex:1;" onclick="addRepairJob('${siteId}')">Add Job</button>
            <button class="ghostbtn" style="width:auto;padding:10px 16px;" onclick="toggleAddRepairJobForm()">Cancel</button>
          </div>
        </div>
      ` : ''}
      ${bulkAddRepairJobsOpen ? `
        <div class="card" style="margin-bottom:16px;background:var(--paper);">
          <p class="sectiontitle" style="margin-top:0;">Bulk Add from Work Orders</p>
          ${bulkImportProgress && bulkImportProgress.siteId===siteId ? `
            <p class="stub" style="margin:0 0 10px;">${bulkImportProgress.done<bulkImportProgress.total
              ? `Importing ${bulkImportProgress.done} of ${bulkImportProgress.total}… please keep this tab open.`
              : `Done — ${bulkImportProgress.created} job${bulkImportProgress.created===1?'':'s'} created${bulkImportProgress.needsReview?` (${bulkImportProgress.needsReview} need review — the address couldn't be read, check the attached PDF)`:''}${bulkImportProgress.duplicates?`, ${bulkImportProgress.duplicates} skipped (already had a job with that Job Number)`:''}.`}</p>
            <div style="background:var(--line);height:6px;border-radius:3px;overflow:hidden;margin-bottom:12px;">
              <div style="background:var(--blue);height:100%;width:${Math.round(100*bulkImportProgress.done/bulkImportProgress.total)}%;"></div>
            </div>
            ${bulkImportProgress.done>=bulkImportProgress.total ? `<button class="darkbtn" style="width:100%;" onclick="bulkImportProgress=null;bulkAddRepairJobsOpen=false;render();">Done</button>` : ''}
          ` : `
            <p class="stub" style="margin:0 0 10px;">Select every work order PDF for this batch — a separate job is created for each one, auto-filled from the PDF the same way the single Add Job form does. Any PDF it can't read a property address from still creates a job (flagged for review) with the file attached, so nothing gets lost.</p>
            <div class="formfield"><input type="file" id="bulkRepairJobWorkOrders" accept=".pdf" multiple></div>
            <div style="display:flex;gap:8px;">
              <button class="darkbtn" style="flex:1;" onclick="startBulkImportRepairJobs(document.getElementById('bulkRepairJobWorkOrders'),'${siteId}')">Start Import</button>
              <button class="ghostbtn" style="width:auto;padding:10px 16px;" onclick="toggleBulkAddRepairJobs()">Cancel</button>
            </div>
          `}
        </div>
      ` : ''}
    ` : ''}
    <div class="tilegrid" style="margin-bottom:14px;">
      ${visibleTileDefs.map(t=>{
        const def = REPAIR_CATEGORY_DEFS[t.key];
        const count = jobs.filter(def.match).length;
        const hiddenFromOps = canManage && hiddenTiles.includes(t.key);
        return `<div class="tile" style="${hiddenFromOps?'opacity:0.55;':''}" onclick="go('#/site/${siteId}/repairjobs/${t.key}')">
          <div class="icon" style="background:${t.bg};color:${t.color};">${t.icon}</div>
          <div class="lbl">${def.label}${hiddenFromOps?' 🚫':''}</div><div class="sub">${count}</div>
        </div>`;
      }).join('')}
    </div>
    ${canManage ? `
      <button class="ghostbtn" style="width:100%;margin-bottom:10px;" onclick="go('#/site/${siteId}/repairjobs/all')">View All Jobs (${jobs.length})</button>
      <p class="stub" style="text-align:right;margin:-4px 0 4px;text-decoration:underline;cursor:pointer;" onclick="toggleRepairTileVisibilityPanel()">${repairTileVisibilityOpen?'Hide':'Manage'} operative tile visibility ›</p>
      ${repairTileVisibilityOpen ? `
        <div class="card" style="margin-bottom:16px;">
          <p class="sectiontitle" style="margin-top:0;">Operative Visibility</p>
          <p class="stub" style="margin:0 0 10px;">Untick a tile to hide it from operatives entirely — they'll still see the tiles left ticked. PM/Admin always see every tile.</p>
          ${tileDefs.map(t=>{
            const def = REPAIR_CATEGORY_DEFS[t.key];
            const visible = !hiddenTiles.includes(t.key);
            return `<label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 8px;font-style:normal;"><input type="checkbox" style="width:auto;" ${visible?'checked':''} onchange="toggleRepairTileOperativeVisibility('${siteId}','${t.key}', this.checked)">${def.label}</label>`;
          }).join('')}
        </div>
      ` : ''}
      ${isFullManager(ME) ? `<p class="stub" style="text-align:right;margin:-4px 0 4px;text-decoration:underline;cursor:pointer;" onclick="siteTeamSectionOpen.repaircontract=true;siteTeamSectionOpen.sync=true;go('#/site/${siteId}/team')">OneDrive folder ${site.onedrive_folder_id?'— "'+escapeHtml(site.onedrive_folder_name||'')+'"':'— not linked yet'} ›</p>` : ''}
    ` : ''}
  `, {title:'Live Jobs', subtitle:site.name, back:'#/site/'+siteId+'/home', siteId, activeTab:'home'});
}
let repairTileVisibilityOpen = false;
window.toggleRepairTileVisibilityPanel = function(){ repairTileVisibilityOpen = !repairTileVisibilityOpen; render(); };
// Org-wide (not per-site) — which Live Jobs category tiles operatives never
// see at all. PM/Admin always see every tile regardless of this list.
window.toggleRepairTileOperativeVisibility = async function(siteId, key, visible){
  const current = (ORG && ORG.repair_hidden_tiles) || [];
  const next = visible ? current.filter(k=>k!==key) : (current.includes(key) ? current : [...current, key]);
  const row = await dbUpdate('organizations', ME.org_id, {repair_hidden_tiles: next});
  if(row){ ORG.repair_hidden_tiles = row.repair_hidden_tiles; toast('Saved'); render(); }
  else toast('Could not save — try again.');
};
window.toggleAddRepairJobForm = function(){
  addRepairJobFormOpen = !addRepairJobFormOpen;
  newRepairJobNumberDraft=''; newRepairJobAddressDraft=''; newRepairJobDescriptionDraft='';
  render();
};
window.toggleBulkAddRepairJobs = function(){
  bulkAddRepairJobsOpen = !bulkAddRepairJobsOpen;
  bulkImportProgress = null;
  render();
};
// Free, offline, no third-party service — reads the work order PDF's own
// text layer with pdf.js (already loaded app-wide, see importSchedulePdf
// above for the same line-grouping approach) and matches it against the
// fixed "Axis" work order template's field labels (Work Order / Repair
// Description / Property). This only works because that template is
// digitally generated text, not a scan — a scanned/photographed work order
// has no text layer to read, so it's silently skipped and the file is
// still attached as normal, just without a prefill. Deliberately does NOT
// call render() — this only patches the 3 form fields' DOM values and
// draft vars in place, so the file the person just picked stays selected
// (a full re-render would recreate the <input type="file"> from scratch,
// which always comes back empty — browsers won't let JS restore a file
// selection into one).
// Shared by the single-job prefill below AND the bulk importer — reads a
// work order PDF's own text layer with pdf.js and matches it against the
// fixed "Axis" work order template's field labels. Returns
// {jobNumber, address, description} (any of which may be undefined if that
// label wasn't found) or null if the file isn't a PDF, pdf.js isn't
// available, or nothing could be read from it (e.g. a scanned/photographed
// work order with no text layer).
// #(pdf-multiline-field-grabber) 2026-09-25 — the old single-row regex
// extraction only ever captured text up to the FIRST stop-label match, but
// on the Axis work order template a multi-line field (Repair Description,
// Property) wraps onto full-row-width continuation lines below its own
// label row, and a stop label (e.g. "Notes:") can land on the SAME row as
// a short adjacent field's own label mid-row. extractField() below walks
// rows after the label row and keeps appending until it hits the next
// known label anywhere in a row, so multi-line values are captured in full.
const WORK_ORDER_STOP_LABELS = ['Work Order:','Workstream','Client:','Case:','Supplier:','Booking:','Issued On:','Repair Contact:','Tel:','Repair Description:','Version:','Notes:','Resident Phone:','Property:','Resident:','Property Flag:','Company Registration Number:','Property Attributes','Work Items'];
function workOrderEarliestStop(text){
  let best = null;
  for(const label of WORK_ORDER_STOP_LABELS){
    const idx = text.indexOf(label);
    if(idx>-1 && (!best || idx<best.idx)) best = {idx, label};
  }
  return best;
}
function extractWorkOrderField(rows, startLabel){
  const startIdx = rows.findIndex(r=>r.includes(startLabel));
  if(startIdx===-1) return null;
  const firstRow = rows[startIdx];
  const labelPos = firstRow.indexOf(startLabel);
  const afterLabel = firstRow.slice(labelPos+startLabel.length);
  const parts = [];
  const firstStop = workOrderEarliestStop(afterLabel);
  parts.push((firstStop ? afterLabel.slice(0, firstStop.idx) : afterLabel).trim());
  for(let r=startIdx+1; r<rows.length && r<startIdx+6; r++){
    const stop = workOrderEarliestStop(rows[r]);
    if(stop){
      const before = rows[r].slice(0, stop.idx).trim();
      if(before) parts.push(before);
      break;
    }
    parts.push(rows[r].trim());
  }
  return parts.filter(Boolean).join(' ').replace(/\s+/g,' ').trim() || null;
}
async function parseWorkOrderPdf(file){
  if(file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name||'')) return null; // a photo/scan — nothing to read
  if(!(await loadLib('pdfjsLib'))) return null;
  try{
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: buf}).promise;
    let lines = [];
    for(let i=1;i<=pdf.numPages;i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let lineMap = {};
      content.items.forEach(it=>{
        const y = Math.round(it.transform[5]);
        (lineMap[y] = lineMap[y] || []).push(it.str);
      });
      Object.keys(lineMap).map(Number).sort((a,b)=>b-a).forEach(y=>{
        const text = lineMap[y].join(' ').replace(/\s+/g,' ').trim();
        if(text) lines.push(text);
      });
    }
    const fullText = lines.join(' ').replace(/\s+/g,' ');
    // "Work Order:" (the table cell) not "Work Order Number:" (the
    // header/footer repeat of the same value) — the colon position tells
    // them apart, so this only ever matches the one we want. This one's a
    // single-line field so the old regex is still correct and simplest.
    const jobNumMatch = fullText.match(/Work Order:\s*(\S+)/);
    const result = {};
    if(jobNumMatch) result.jobNumber = jobNumMatch[1].trim();
    const addrField = extractWorkOrderField(lines, 'Property:');
    if(addrField){
      // The template prints this in ALL CAPS — leaving any token with a
      // digit alone (house numbers, postcode) and title-casing the rest
      // reads far closer to how an address is normally written, without
      // needing real postcode-formatting logic.
      result.address = addrField.split(/\s+/).map(w=>/\d/.test(w) ? w : (w.charAt(0).toUpperCase()+w.slice(1).toLowerCase())).join(' ');
    }
    const descField = extractWorkOrderField(lines, 'Repair Description:');
    if(descField) result.description = descField;
    return result;
  }catch(e){ return null; }
}
window.prefillRepairJobFromWorkOrder = async function(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const parsed = await parseWorkOrderPdf(file);
  if(!parsed) return;
  let filled = 0;
  if(parsed.jobNumber){
    newRepairJobNumberDraft = parsed.jobNumber;
    const el = document.getElementById('newRepairJobNumber'); if(el) el.value = parsed.jobNumber;
    filled++;
  }
  if(parsed.address){
    newRepairJobAddressDraft = parsed.address;
    const el = document.getElementById('newRepairJobAddress'); if(el) el.value = parsed.address;
    filled++;
  }
  if(parsed.description){
    newRepairJobDescriptionDraft = parsed.description;
    const el = document.getElementById('newRepairJobDescription'); if(el) el.value = parsed.description;
    filled++;
  }
  if(filled) toast(`Filled ${filled} field${filled>1?'s':''} from the work order — check before saving`);
};
// Bulk importer — one job per selected PDF, reusing parseWorkOrderPdf above.
// A PDF whose address can't be read still creates a job (address set to a
// "⚠ Review" placeholder built from the filename, so nothing silently
// vanishes) with the PDF attached as its work order, so the PM can open it
// and fix the address by hand. A PDF whose Job Number matches a job this
// site already has is skipped entirely, so re-selecting an already-imported
// batch by mistake doesn't create duplicates.
window.startBulkImportRepairJobs = async function(input, siteId){
  const files = Array.from((input && input.files) || []);
  if(!files.length){ toast('Choose one or more PDF work orders first.'); return; }
  const existingRows = await dbSelect('repair_jobs', 'site_id=eq.'+siteId+'&select=job_number');
  const existingJobNumbers = new Set((existingRows||[]).filter(r=>r.job_number).map(r=>r.job_number.trim().toLowerCase()));
  bulkImportProgress = {siteId, total: files.length, done: 0, created: 0, needsReview: 0, duplicates: 0};
  render();
  for(const file of files){
    try{
      const parsed = (await parseWorkOrderPdf(file)) || {};
      const jobNumberKey = parsed.jobNumber ? parsed.jobNumber.trim().toLowerCase() : '';
      if(jobNumberKey && existingJobNumbers.has(jobNumberKey)){
        bulkImportProgress.duplicates++;
      } else {
        const needsReview = !parsed.address;
        const address = parsed.address || ('⚠ Review — '+file.name.replace(/\.pdf$/i,''));
        const rows = await dbInsert('repair_jobs', {site_id:siteId, org_id:ME.org_id, address, job_number:parsed.jobNumber||null, description:parsed.description||null, survey_required:'N', job_status:'To Survey', created_by:ME.id});
        const job = rows && rows[0];
        if(job){
          await uploadRepairJobWorkOrderFile(job, file);
          bulkImportProgress.created++;
          if(needsReview) bulkImportProgress.needsReview++;
          if(jobNumberKey) existingJobNumbers.add(jobNumberKey);
        }
      }
    }catch(e){ /* one bad file shouldn't stop the rest of the batch */ }
    bulkImportProgress.done++;
    render();
  }
  toast('Bulk import finished');
};
window.addRepairJob = async function(siteId){
  const address = (document.getElementById('newRepairJobAddress').value||'').trim();
  if(!address){ toast('Enter an address.'); return; }
  const jobNumber = (document.getElementById('newRepairJobNumber').value||'').trim();
  const description = (document.getElementById('newRepairJobDescription').value||'').trim();
  const workOrderInput = document.getElementById('newRepairJobWorkOrder');
  const workOrderFile = workOrderInput && workOrderInput.files && workOrderInput.files[0];
  const rows = await dbInsert('repair_jobs', {site_id:siteId, org_id:ME.org_id, address, job_number:jobNumber||null, description:description||null, survey_required:'N', job_status:'To Survey', created_by:ME.id});
  const job = rows && rows[0];
  if(!job){ return; }
  let workOrderFailed = false;
  if(workOrderFile){
    const updated = await uploadRepairJobWorkOrderFile(job, workOrderFile);
    if(!updated) workOrderFailed = true;
  }
  addRepairJobFormOpen = false; newRepairJobNumberDraft=''; newRepairJobAddressDraft=''; newRepairJobDescriptionDraft='';
  toast(workOrderFailed ? 'Job added — but the work order failed to upload. Add it from the job later.' : 'Job added — now choose a OneDrive folder for it');
  // Straight into the folder picker for the brand-new job — photos, the
  // work order and notes all push there once it's linked. Backing out of
  // the picker without picking one is fine; it can be linked later from
  // the job's own page.
  startRepairJobFolderPicker(siteId, job.id);
};

async function renderRepairJobsListPage(siteId, category){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/sites'); return; }
  if(!REPAIR_CATEGORY_DEFS[category]) category = 'open';
  if(repairJobFilterCategory !== siteId+'/'+category){ repairJobFilterCategory = siteId+'/'+category; repairJobFilterText = ''; }
  const canManage = isManager(ME);
  // An operative reaching a tile hidden from them (bookmark/typed URL —
  // there's no chip or tile pointing here for them) gets bounced back to
  // the hub rather than seeing the list anyway.
  if(!canManage && ((ORG && ORG.repair_hidden_tiles) || []).includes(category)){
    toast("You don't have access to that list.");
    go('#/site/'+siteId+'/repairjobs');
    return;
  }
  // jobCardHtml only ever reads these columns (plus the ones match() needs)
  // — same reasoning as renderRepairJobsCategoryHub's trimmed select, this
  // page can list dozens of jobs so it's worth not pulling every job's full
  // notes/description text just to render a status card.
  const jobs = await dbSelect('repair_jobs', 'site_id=eq.'+siteId+'&select=id,address,description,job_number,survey_required,works_completed,invoiced,closed,job_status,access_requirement,scaffold_erection_date,quote_approved,quote_approved_at,created_at&order=created_at.desc');
  if(__gen !== RENDER_GEN) return;
  // Last saved route for this site+category, if there's ever been one —
  // shown as a small strip above the export buttons so there's always a
  // copy on hand to view/work from, even if a fresh route-planning run
  // fails or hasn't been done yet today.
  let lastRoute = null;
  if(canManage && REPAIR_ROUTE_CATEGORIES.includes(category)){
    await loadAllProfiles();
    lastRoute = (await dbSelect('repair_route_exports', 'site_id=eq.'+siteId+'&category=eq.'+category))[0] || null;
  }
  if(__gen !== RENDER_GEN) return;
  let filtered = jobs.filter(REPAIR_CATEGORY_DEFS[category].match);
  const filterQuery = (repairJobFilterText||'').trim().toLowerCase();
  if(filterQuery){
    filtered = filtered.filter(j=>(j.address||'').toLowerCase().includes(filterQuery) || (j.description||'').toLowerCase().includes(filterQuery) || (j.job_number||'').toLowerCase().includes(filterQuery));
  }
  const sortFn = REPAIR_JOB_SORTS[repairJobSortBy] || REPAIR_JOB_SORTS.date_desc;
  filtered.sort(sortFn);
  if(!canManage) repairJobSelectMode = false;

  function jobCardHtml(j){
    const statusLabel = j.closed ? 'Closed' : (j.job_status || 'To Survey');
    const badgeColor = j.closed ? 'var(--ok)' : (REPAIR_JOB_STATUS_COLOR[j.job_status] || 'var(--brand1)');
    const checked = repairJobSelectedIds.has(j.id);
    // #(repair-job-row-cleanup) 2026-09-27 — the row used to show the full
    // description plus a permanent Survey/Completed/Invoiced strip (ticks
    // AND pending hourglasses) regardless of progress, which read as busy
    // even on a brand-new job with nothing done yet. Now only the steps
    // that are actually DONE show at all, as a short tick list under the
    // status badge — description dropped from the row entirely (still on
    // the job detail page).
    const doneLines = [];
    if(j.survey_required==='Y' || j.survey_required==='NA') doneLines.push('Surveyed');
    if(j.works_completed) doneLines.push('Completed');
    if(canManage && j.invoiced) doneLines.push('Invoiced');
    return `
      <div class="card" style="margin-bottom:10px;cursor:pointer;display:flex;gap:10px;align-items:flex-start;" onclick="${repairJobSelectMode ? `toggleRepairJobSelected('${j.id}')` : `go('#/site/${siteId}/repairjob/${j.id}')`}">
        ${repairJobSelectMode ? `<input type="checkbox" style="width:auto;margin-top:3px;" ${checked?'checked':''} onclick="event.stopPropagation();toggleRepairJobSelected('${j.id}')">` : ''}
        <div style="flex:1;min-width:0;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:14px;">${escapeHtml(j.address||'—')}</div>
            ${canManage && j.job_number ? `<div class="stub" style="margin:2px 0 0;">${escapeHtml(j.job_number)}</div>` : ''}
            ${j.quote_approved===true && j.quote_approved_at ? `<div class="stub" style="margin:2px 0 0;">Approved ${new Date(j.quote_approved_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>` : ''}
          </div>
          <div style="flex:none;text-align:right;">
            <span class="plaintag" style="color:${badgeColor};">${escapeHtml(statusLabel)}</span>
            ${doneLines.length ? doneLines.map(l=>`<div class="stub" style="margin:4px 0 0;color:var(--ok);white-space:nowrap;">${l} ✓</div>`).join('') : ''}
          </div>
        </div>
      </div>
    `;
  }

  document.getElementById('app').innerHTML = shell(`
    ${canManage ? `
      <!-- #(repair-category-tabs-dropdown) 2026-09-28 — this was a row of
      12 category buttons; flex-wrap pushed the job list off the top of the
      screen on a phone, and a sideways-scrolling version of the same row
      (tried first) wasn't wanted either. Now a single dropdown that
      navigates on change — one control, no wrapping, no scrolling. -->
      <select style="width:100%;margin-bottom:14px;" onchange="go('#/site/${siteId}/repairjobs/'+this.value)">
        ${Object.keys(REPAIR_CATEGORY_DEFS).filter(k=>k!=='closed').map(k=>`<option value="${k}" ${category===k?'selected':''}>${REPAIR_CATEGORY_DEFS[k].label}</option>`).join('')}
        <option value="closed" ${category==='closed'?'selected':''}>${REPAIR_CATEGORY_DEFS.closed.label}</option>
      </select>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px;">
        <p class="stub" style="margin:0;">${lastRoute ? 'Last route: '+new Date(lastRoute.generated_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}${repairRouteExportBusy ? 'Working out route…' : ''}</p>
        ${rowActionsMenuHtml('repairlist-menu', `
          <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;toggleRepairJobSelectMode()">${repairJobSelectMode?'✕ Cancel Select':'☑ Select / Bulk Edit'}</div>
          ${REPAIR_ROUTE_CATEGORIES.includes(category) ? (lastRoute ? `
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;viewSavedRepairRouteOrder('${siteId}','${category}')">👁️ View Last Route</div>
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;exportRepairJobsRouteOrder('${siteId}','${category}')">🔄 Update Route</div>
          ` : `
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;exportRepairJobsRouteOrder('${siteId}','${category}')">🗺️ Export Route Order</div>
          `) : ''}
          ${category==='approved' ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;exportRepairJobsByApprovedDate('${siteId}')">📋 Export by Oldest Approved</div>` : ''}
        `)}
      </div>
    ` : ''}
    <div class="formfield" style="margin:0 0 10px;">
      <input type="text" id="repairJobFilterInput" placeholder="Filter by address, description or job number…" value="${escapeHtml(repairJobFilterText)}" oninput="setRepairJobFilter(this.value)">
    </div>
    <div class="formfield" style="margin:0 0 14px;">
      <select id="repairJobSortSelect" style="width:100%;" onchange="setRepairJobSort(this.value)">
        ${repairJobSortOptionsFor(category).map(k=>`<option value="${k}" ${repairJobSortBy===k?'selected':''}>${REPAIR_JOB_SORT_LABELS[k]}</option>`).join('')}
      </select>
    </div>
    ${canManage ? `
      ${repairJobSelectMode ? `
        <div class="card" style="margin-bottom:14px;background:var(--paper);">
          <p class="stub" style="margin:0 0 10px;">${repairJobSelectedIds.size} selected</p>
          <div class="row-gap" style="flex-wrap:wrap;">
            <button class="ghostbtn" style="flex:1;min-width:140px;" onclick="bulkApproveRepairJobs('${siteId}')">Approve Quote</button>
            <button class="ghostbtn" style="flex:1;min-width:140px;" onclick="bulkMarkScaffoldErected('${siteId}')">Mark Scaffold Erected</button>
            <button class="ghostbtn" style="flex:1;min-width:140px;" onclick="bulkMarkCompletedRepairJobs('${siteId}')">Mark Completed</button>
            <button class="ghostbtn" style="flex:1;min-width:140px;" onclick="bulkPatchRepairJobs('${siteId}',{invoiced:true})">Mark Invoiced</button>
            <button class="darkbtn" style="flex:1;min-width:140px;" onclick="bulkCloseRepairJobs('${siteId}')">Close Selected</button>
          </div>
        </div>
      ` : ''}
    ` : ''}
    ${filtered.length ? filtered.map(jobCardHtml).join('') : `<div class="empty">No jobs in this list.</div>`}
  `, {title:REPAIR_CATEGORY_DEFS[category].label, subtitle:site.name, back:'#/site/'+siteId+'/repairjobs', siteId, activeTab:'home'});
}
window.toggleRepairJobSelectMode = function(){
  repairJobSelectMode = !repairJobSelectMode;
  repairJobSelectedIds = new Set();
  render();
};
window.toggleRepairJobSelected = function(jobId){
  if(repairJobSelectedIds.has(jobId)) repairJobSelectedIds.delete(jobId); else repairJobSelectedIds.add(jobId);
  render();
};
window.bulkPatchRepairJobs = async function(siteId, patch){
  const ids = [...repairJobSelectedIds];
  if(!ids.length){ toast('Nothing selected.'); return; }
  for(const id of ids){ await dbUpdate('repair_jobs', id, patch); }
  repairJobSelectMode = false; repairJobSelectedIds = new Set();
  toast(ids.length+' job'+(ids.length>1?'s':'')+' updated');
  render();
};
// job_status is now the canonical state machine driving which tile a job
// sits in, so bulk actions need to advance it the same way their
// single-job equivalents (approveRepairJob/saveRepairJobScaffold/
// setRepairJobWorksCompleted) do — not just flip the underlying boolean —
// or a bulk-approved job would stay stuck showing in its old tile.
window.bulkApproveRepairJobs = async function(siteId){
  const ids = [...repairJobSelectedIds];
  if(!ids.length){ toast('Nothing selected.'); return; }
  for(const id of ids){
    const rows = await dbSelect('repair_jobs', 'id=eq.'+id+'&select=access_requirement,quote_approved_at');
    const j = rows[0]; if(!j) continue;
    const patch = {
      quote_approved: true,
      approved_by: ME.id,
      self_authorized: false,
      job_status: repairJobNeedsScaffold(j) ? 'Approved - Awaiting Scaffold' : 'Approved - To Do',
    };
    if(!j.quote_approved_at) patch.quote_approved_at = new Date().toISOString();
    await dbUpdate('repair_jobs', id, patch);
  }
  repairJobSelectMode = false; repairJobSelectedIds = new Set();
  toast(ids.length+' job'+(ids.length>1?'s':'')+' approved');
  render();
};
window.bulkMarkScaffoldErected = async function(siteId){
  const ids = [...repairJobSelectedIds];
  if(!ids.length){ toast('Nothing selected.'); return; }
  const today = todayISODate();
  for(const id of ids){
    const rows = await dbSelect('repair_jobs', 'id=eq.'+id+'&select=job_status');
    const j = rows[0]; if(!j) continue;
    const patch = {scaffold_erection_date: today};
    if(j.job_status==='Approved - Awaiting Scaffold') patch.job_status = 'Approved - To Do';
    await dbUpdate('repair_jobs', id, patch);
  }
  repairJobSelectMode = false; repairJobSelectedIds = new Set();
  toast(ids.length+' job'+(ids.length>1?'s':'')+' updated');
  render();
};
window.bulkMarkCompletedRepairJobs = async function(siteId){
  const ids = [...repairJobSelectedIds];
  if(!ids.length){ toast('Nothing selected.'); return; }
  const nowIso = new Date().toISOString();
  for(const id of ids){
    const rows = await dbSelect('repair_jobs', 'id=eq.'+id+'&select=closed');
    const j = rows[0]; if(!j) continue;
    const patch = {works_completed: true, works_completed_date: nowIso};
    if(!j.closed) patch.job_status = 'Awaiting Sign-off';
    await dbUpdate('repair_jobs', id, patch);
  }
  repairJobSelectMode = false; repairJobSelectedIds = new Set();
  toast(ids.length+' job'+(ids.length>1?'s':'')+' updated');
  render();
};
window.bulkCloseRepairJobs = async function(siteId){
  const ids = [...repairJobSelectedIds];
  if(!ids.length){ toast('Nothing selected.'); return; }
  const yes = await customConfirm('Close '+ids.length+' job'+(ids.length>1?'s':'')+'? They’ll drop off the operative’s list.');
  if(!yes) return;
  for(const id of ids){ await dbUpdate('repair_jobs', id, {closed:true, closed_by:ME.id, closed_at:new Date().toISOString(), job_status:'Closed'}); }
  repairJobSelectMode = false; repairJobSelectedIds = new Set();
  toast(ids.length+' job'+(ids.length>1?'s':'')+' closed');
  render();
};
window.exportRepairTrackerExcel = async function(siteId){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  const site = SITES.find(s=>s.id===siteId);
  const jobs = await dbSelect('repair_jobs', 'site_id=eq.'+siteId+'&order=created_at.desc');
  const header = ['Job Number','Address','Description of Call out','Survey Required (Y/N/NA)','Survey Date','Survey Notes / Quoted works','Variation Works (£)','Scaffolding Required (Y/N/Tower)','Scaff Requirements','Quote Approved (Y/N)','Scaffold Booking Date','Scaffold Erection Date','Repair Return Date','Repair Completed? (Y/N)','Closed on Portal','Invoiced? (Y/N)','Job Status','Overdue?'];
  const todayStr = todayISODate();
  const dOnly = v => v ? String(v).slice(0,10) : '';
  const yn = v => v ? 'Y' : 'N';
  const rows = jobs.map(j=>{
    const overdue = !j.closed && j.repair_return_date && j.repair_return_date < todayStr ? 'Y' : '';
    const scaffReq = (j.access_requirement==='scaffold'||j.access_requirement==='tower') ? (j.access_requirement==='tower'?'Tower':'Y') : 'N';
    return [j.job_number||'', j.address||'', j.description||'', j.survey_required||'', dOnly(j.survey_date), j.survey_notes||'',
      j.variation_cost!=null?Number(j.variation_cost):'', scaffReq, j.access_notes||'', j.quote_approved==null?'':yn(j.quote_approved),
      dOnly(j.scaffold_booking_date), dOnly(j.scaffold_erection_date), dOnly(j.repair_return_date), yn(j.works_completed), yn(j.closed), yn(j.invoiced),
      j.job_status||'', overdue];
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{wch:12},{wch:28},{wch:30},{wch:14},{wch:12},{wch:32},{wch:14},{wch:16},{wch:26},{wch:14},{wch:16},{wch:16},{wch:14},{wch:14},{wch:12},{wch:12},{wch:18},{wch:10}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Repairs Tracker');
  await deliverExcelFile(wb, exportFilename(site?site.name:'', 'Repair Tracker', 'xlsx'));
};
// Exports the given category's jobs as an Excel ordered into a "milk run"
// route — nearest-job-next, starting from the fixed yard/depot postcode
// (CM3 8DQ) — via the repair-jobs-route-export edge function, which
// geocodes each address (cached after the first time, so repeat exports on
// the same jobs are fast) and works the route out server-side. Straight-line
// distance, not road distance — same trade-off as the free-geocoding choice.
// Shared by the live export and "View Last Route" below, so both produce
// the exact same spreadsheet layout from a {stops, unlocated} payload —
// the live one fresh off the edge function, the saved one straight out of
// repair_route_exports with no network/geocoding round trip at all.
async function buildRepairRouteExcelAndDeliver(site, category, stops, unlocated){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return null; }
  const dOnly = v => v ? String(v).slice(0,10) : '';
  const header = ['Order','Distance from Previous (mi)','Job Number','Address','Description','Notes','Access Requirement','Variation Works (£)','Scaffold Booking Date','Scaffold Erection Date','Repair Return Date'];
  const rows = (stops||[]).map(s=>[
    s.order, s.distance_from_previous_mi, s.job_number||'', s.address||'', s.description||'',
    s.survey_notes||s.access_notes||'', REPAIR_ACCESS_LABEL[s.access_requirement]||'', s.variation_cost!=null?Number(s.variation_cost):'',
    dOnly(s.scaffold_booking_date), dOnly(s.scaffold_erection_date), dOnly(s.repair_return_date),
  ]);
  (unlocated||[]).forEach(j=>{ rows.push(['—','Could not locate on map', j.job_number||'', j.address||'', '', '', '', '', '', '', '']); });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{wch:8},{wch:14},{wch:12},{wch:28},{wch:26},{wch:30},{wch:16},{wch:14},{wch:16},{wch:16},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Route Order');
  await deliverExcelFile(wb, exportFilename(site?site.name:'', REPAIR_CATEGORY_DEFS[category].label+' Route', 'xlsx'));
}
// Exports the given category's jobs as an Excel ordered into a "milk run"
// route — nearest-job-next, starting from the fixed yard/depot postcode
// (CM3 8DQ) — via the repair-jobs-route-export edge function, which
// geocodes each address (cached after the first time, so repeat exports on
// the same jobs are fast) and works the route out server-side. Straight-line
// distance, not road distance — same trade-off as the free-geocoding choice.
// The edge function also saves this result as the site+category's "last
// run" (repair_route_exports), which is what View Last Route below reads —
// so every successful Update here immediately becomes the new "last run".
window.exportRepairJobsRouteOrder = async function(siteId, category){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  const site = SITES.find(s=>s.id===siteId);
  repairRouteExportBusy = true; render();
  try{
    const res = await sbFetch('/functions/v1/repair-jobs-route-export', {method:'POST', body: JSON.stringify({site_id:siteId, category})});
    const d = await res.json().catch(()=>({}));
    if(!res.ok || d.error){ toast(d.error || 'Could not work out a route — try again.'); return; }
    if(!d.stops || !d.stops.length){ toast('No jobs with addresses in this list yet.'); return; }
    await buildRepairRouteExcelAndDeliver(site, category, d.stops, d.unlocated);
    toast('Route exported — starting from the yard (CM3 8DQ)'+((d.unlocated&&d.unlocated.length)?`, ${d.unlocated.length} job(s) couldn't be located`:''));
  } catch(e){
    toast('Could not work out a route — check your connection and try again.');
  } finally {
    repairRouteExportBusy = false; render();
  }
};
// Re-downloads the last saved route for this site+category straight from
// repair_route_exports — no geocoding, no edge function call, so it's
// instant and can never fail the way a fresh route-planning call can. This
// is the "always have a copy to view and work to" copy Andy asked for;
// hitting "Update Route" (exportRepairJobsRouteOrder above) is what
// replaces it with a freshly-worked-out one.
window.viewSavedRepairRouteOrder = async function(siteId, category){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  const site = SITES.find(s=>s.id===siteId);
  const rows = await dbSelect('repair_route_exports', 'site_id=eq.'+siteId+'&category=eq.'+category);
  const saved = rows[0];
  if(!saved){ toast('No saved route yet — run Export Route Order first.'); return; }
  await buildRepairRouteExcelAndDeliver(site, category, saved.stops, saved.unlocated);
  toast('Opened the last saved route from '+new Date(saved.generated_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}));
};
// A plain chronological export of the Approved & Ready list, oldest
// approval first — separate from Export Route Order above, which orders by
// nearest-neighbour distance from the yard instead. Andy wants both: the
// route for planning the day's driving, this one for working the backlog
// in the order jobs were actually approved so nothing sits waiting
// indefinitely just because it's geographically inconvenient.
window.exportRepairJobsByApprovedDate = async function(siteId){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  const site = SITES.find(s=>s.id===siteId);
  repairApprovedExportBusy = true; render();
  try{
    const jobs = await dbSelect('repair_jobs', 'site_id=eq.'+siteId+'&select=job_number,address,description,survey_notes,access_notes,access_requirement,variation_cost,scaffold_booking_date,scaffold_erection_date,repair_return_date,quote_approved_at,closed,quote_approved,works_completed');
    const filtered = jobs.filter(REPAIR_CATEGORY_DEFS.approved.match);
    if(!filtered.length){ toast('No jobs in Approved & Ready yet.'); return; }
    filtered.sort(REPAIR_JOB_SORTS.approved_asc);
    const dOnly = v => v ? String(v).slice(0,10) : '';
    const header = ['Approved On','Job Number','Address','Description','Notes','Access Requirement','Variation Works (£)','Scaffold Booking Date','Scaffold Erection Date','Repair Return Date'];
    const rows = filtered.map(j=>[
      dOnly(j.quote_approved_at), j.job_number||'', j.address||'', j.description||'',
      j.survey_notes||j.access_notes||'', REPAIR_ACCESS_LABEL[j.access_requirement]||'', j.variation_cost!=null?Number(j.variation_cost):'',
      dOnly(j.scaffold_booking_date), dOnly(j.scaffold_erection_date), dOnly(j.repair_return_date),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{wch:14},{wch:12},{wch:28},{wch:26},{wch:30},{wch:16},{wch:14},{wch:16},{wch:16},{wch:14}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Oldest Approved');
    await deliverExcelFile(wb, exportFilename(site?site.name:'', 'Approved & Ready — Oldest First', 'xlsx'));
    toast('Exported — oldest approved first');
  } catch(e){
    toast('Could not export — check your connection and try again.');
  } finally {
    repairApprovedExportBusy = false; render();
  }
};

async function renderRepairJobDetail(siteId, jobId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/sites'); return; }
  const [jobRows, photos, operatives] = await Promise.all([
    dbSelect('repair_jobs', 'id=eq.'+jobId),
    dbSelect('repair_job_photos', 'repair_job_id=eq.'+jobId+'&order=created_at.asc'),
    siteAssignedOperatives(siteId),
  ]);
  const job = jobRows[0];
  if(!job){ go('#/site/'+siteId+'/home'); return; }
  if(__gen !== RENDER_GEN) return;
  repairJobDetailCurrent = job;
  if(!repairJobUnsavedNotes || repairJobUnsavedNotes.jobId !== jobId) repairJobUnsavedNotes = {jobId, survey:false, progress:false, completion:false, pricedSchedule:false};
  // Anything typed into a notes box but not saved yet has to survive this
  // redraw — adding a photo, saving access details, etc. all re-render the
  // page, and that used to refill the boxes from the database and wipe what
  // had just been typed (e.g. survey notes lost on tapping "+ Add Photo").
  const REPAIR_NOTE_BOXES = {survey:'repairSurveyNotes', progress:'repairProgressNotes', completion:'repairWorksNotes', pricedSchedule:'repairPricedSchedule'};
  const typedRepairNotes = {};
  Object.keys(REPAIR_NOTE_BOXES).forEach(kind=>{
    const el = document.getElementById(REPAIR_NOTE_BOXES[kind]);
    if(el && repairJobUnsavedNotes[kind]) typedRepairNotes[kind] = el.value;
  });
  const canManage = isManager(ME);

  function photoGalleryHtml(category){
    const cat = photos.filter(p=>p.category===category);
    if(!cat.length) return `<div class="empty" style="margin:8px 0;">No photos yet.</div>`;
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;margin:8px 0;">
      ${cat.map(p=>`
        <div style="position:relative;">
          <img src="${publicUrl('site-photos', p.storage_path)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="viewImage('${publicUrl('site-photos', p.storage_path)}')">
          <span onclick="deleteRepairJobPhoto('${p.id}','${jsAttr(p.storage_path)}','${jobId}')" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border-radius:50%;width:20px;height:20px;line-height:20px;text-align:center;font-size:12px;cursor:pointer;">✕</span>
        </div>
      `).join('')}
    </div>`;
  }
  function photoUploadRow(category, label){
    const busy = !!repairJobPhotoBusy[category];
    return `
      <p class="field-label" style="margin:14px 0 4px;">${label}</p>
      ${photoGalleryHtml(category)}
      <button class="ghostbtn" ${busy?'disabled':''} onclick="document.getElementById('repairPhoto_${category}').click()">${busy?'Uploading…':'+ Add Photo'}</button>
      <!-- #(repair-photo-capture-attr) 2026-09-30 — capture=environment forces
      straight into the camera on Android (Chrome/WebView skip the normal file
      picker entirely when it's present), so there was no way to pick existing
      photos from the gallery, and the camera only ever takes one shot at a
      time regardless of multiple — both reported as "can only take photos,
      not upload them" and "can't add more than one at once". Dropping
      capture restores the full picker (Camera + Photo Library, with
      multi-select) on both iOS and Android; accept=image/* alone still
      keeps it filtered to images. -->
      <input type="file" id="repairPhoto_${category}" accept="image/*" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="addRepairJobPhoto(this,'${jobId}','${category}')">
    `;
  }

  function fmtDate(iso){ return iso ? new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : ''; }
  function profileName(id){ return id && PROFILES[id] ? PROFILES[id].name : null; }

  // #(repair-job-status-workflow-v2) 2026-09-25 — surveyDone now also covers
  // 'NA' (no survey needed) so an NA'd job unlocks the rest of the page the
  // same way a completed one does, instead of sitting permanently stuck
  // behind "Complete the survey to unlock the rest of this job."
  const surveyDone = job.survey_required === 'Y' || job.survey_required === 'NA';
  const needsScaffold = repairJobNeedsScaffold(job);
  const approved = job.quote_approved === true;
  const rejected = job.quote_approved === false;
  const infoEditing = canManage && !!repairJobInfoEditOpen[jobId];
  const surveyEditing = !surveyDone || !!repairSurveyEditOpen[jobId];
  // A non-manager can unlock the (otherwise locked-once-complete) survey
  // card to fix a mistake only if they're the one who actually surveyed it.
  const canEditSurvey = canManage || job.surveyed_by===ME.id;
  // Self-authorise is only offered to operatives, only before a decision's
  // been made, and — per Andy — never for a job that needs Scaffold, since
  // booking scaffold is a PM cost/logistics call.
  const canSelfAuthorise = !canManage && surveyDone && job.quote_approved==null && job.access_requirement!=='scaffold';
  const statusHint = {
    'To Survey': 'Waiting on a survey.',
    'Surveyed - Awaiting Cost': canManage ? 'Enter a variation cost and issue it to the client, or approve/reject directly below.' : 'Awaiting a cost decision from the office.',
    'Surveyed - Variation Issued': 'Cost sent to the client — awaiting their decision.',
    'Approved - Awaiting Scaffold': 'Approved — waiting on scaffold to go up.',
    'Approved - To Do': 'Approved and ready to be worked.',
    'In Progress': 'Work under way.',
    'Rejected': 'Quote rejected.',
    'Awaiting Sign-off': 'Operative has marked this complete — awaiting PM sign-off.',
    'Closed': 'Closed.',
  }[job.job_status] || '';

  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div>
          <p class="field-label" style="margin:0 0 4px;">Status</p>
          <span style="font-size:15px;font-weight:800;color:${REPAIR_JOB_STATUS_COLOR[job.job_status]||'var(--ink)'};">${escapeHtml(job.job_status||'To Survey')}</span>
        </div>
        ${canManage ? `
          <select id="repairJobStatusOverride" style="width:auto;min-width:180px;flex:0 0 auto;" onchange="overrideRepairJobStatus('${jobId}', this.value)">
            ${REPAIR_JOB_STATUS_OPTIONS.map(s=>`<option value="${s}" ${job.job_status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        ` : ''}
      </div>
      ${statusHint ? `<p class="stub" style="margin:8px 0 0;">${escapeHtml(statusHint)}</p>` : ''}
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:${infoEditing?'14':'4'}px;">
        <p class="sectiontitle" style="margin:0;font-size:14px;">${escapeHtml(job.address||'Job')}</p>
        ${canManage ? `<button class="darkbtn" style="flex:0 0 auto;width:auto;padding:8px 14px;" onclick="toggleRepairJobInfoEdit('${jobId}')">${infoEditing?'Cancel':'Edit'}</button>` : ''}
      </div>
      ${infoEditing ? `
        <div class="formfield"><input type="text" id="repairJobNumber" placeholder="Job number" value="${escapeHtml(job.job_number||'')}"></div>
        <div class="formfield"><input type="text" id="repairJobAddress" placeholder="Address" value="${escapeHtml(job.address||'')}"></div>
        <div class="formfield"><textarea id="repairJobDescription" placeholder="Description of call out" rows="2">${escapeHtml(job.description||'')}</textarea></div>
        <button class="ghostbtn" onclick="saveRepairJobBasics('${jobId}')">Save Job Details</button>
      ` : `
        ${job.job_number ? `<p class="stub" style="margin:0 0 4px;font-size:13px;">Job #${escapeHtml(job.job_number)}</p>` : ''}
        ${job.description ? `<p class="stub" style="margin:0;font-size:13px;">${escapeHtml(job.description)}</p>` : ''}
      `}
      <p class="field-label" style="margin:14px 0 4px;">Work Order</p>
      ${job.work_order_path ? `<p style="margin:0 0 10px;font-size:15px;font-weight:600;text-decoration:underline;cursor:pointer;" onclick="window.open('${publicUrl('site-photos', job.work_order_path)}','_blank')">📄 ${escapeHtml(job.work_order_name||'View file')}</p>` : `<p class="stub" style="margin:0 0 8px;">Not uploaded yet.</p>`}
      ${canManage ? `
        <button class="ghostbtn" style="width:auto;padding:6px 12px;font-size:12px;" onclick="document.getElementById('repairWorkOrderInput').click()">${job.work_order_path?'Replace File':'+ Upload Work Order'}</button>
        <input type="file" id="repairWorkOrderInput" accept=".pdf,image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="addRepairJobWorkOrder(this,'${jobId}')">
      ` : ''}
      ${/* #(operative-survey-assignee-visibility) 2026-09-25 — this card used
        to show "Assign survey to" (and the read-only "Survey booking —
        assigned to X" line) to every viewer, including operatives who had
        nothing to do with this job's survey. An operative now only sees the
        booking info when THEY are the one it's assigned to (read-only —
        assigning/reassigning stays a manager action), and sees nothing here
        at all otherwise. Managers still get the full editable card. */ ''}
      ${canManage ? (surveyDone ? `
        <!-- #(repair-survey-booking-compact-dropdown) 2026-09-30 — once the
        survey itself is done, the booking date/assignee it took to get there
        is no longer the important thing on this page — collapses into a
        native <details> dropdown instead of a standing block, same idea as
        the locked Survey card summary below it. -->
        <details style="margin:14px 0 0;">
          <summary class="field-label" style="cursor:pointer;margin:0;">Survey booking${job.survey_booking_date ? ' — '+new Date(job.survey_booking_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})+(job.survey_booking_assigned_to && PROFILES[job.survey_booking_assigned_to] ? ' — '+escapeHtml(PROFILES[job.survey_booking_assigned_to].name) : '') : ' (not booked)'}</summary>
          <div style="margin-top:10px;">
            <p class="field-label" style="margin-bottom:4px;">Survey booking date</p>
            <div class="formfield" onclick="openDatePickerRow(this)"><input type="date" id="repairSurveyBookingDate" value="${job.survey_booking_date||''}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;"></div>
            <p class="field-label" style="margin-bottom:4px;">Assign survey to</p>
            <select id="repairSurveyBookingAssignee" style="width:100%;margin-bottom:10px;">
              <option value="">Unassigned</option>
              ${operatives.map(p=>`<option value="${p.id}" ${job.survey_booking_assigned_to===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
            </select>
            <button class="ghostbtn" onclick="saveRepairJobSurveyBooking('${jobId}')">Save Booking</button>
          </div>
        </details>
      ` : `
        <p class="field-label" style="margin:14px 0 4px;">Survey booking date</p>
        <div class="formfield" onclick="openDatePickerRow(this)"><input type="date" id="repairSurveyBookingDate" value="${job.survey_booking_date||''}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;"></div>
        <p class="field-label" style="margin-bottom:4px;">Assign survey to</p>
        <select id="repairSurveyBookingAssignee" style="width:100%;margin-bottom:10px;">
          <option value="">Unassigned</option>
          ${operatives.map(p=>`<option value="${p.id}" ${job.survey_booking_assigned_to===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
        <button class="ghostbtn" onclick="saveRepairJobSurveyBooking('${jobId}')">Save Booking</button>
      `) : (job.survey_booking_date && job.survey_booking_assigned_to===ME.id ? `
        <div style="margin:14px 0 0;">
          <p class="field-label" style="margin-bottom:2px;">Survey booking</p>
          <p class="stub" style="margin:0;">${new Date(job.survey_booking_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} — you're assigned to this one</p>
        </div>
      ` : '')}
      ${job.survey_date ? `
        <p class="field-label" style="margin:14px 0 4px;">Survey Date</p>
        <p class="stub" style="margin:0;">${new Date(job.survey_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}${job.surveyed_by && PROFILES[job.surveyed_by] ? ' — '+escapeHtml(PROFILES[job.surveyed_by].name) : ''}</p>
      ` : ''}
      ${canManage ? `
        <p class="field-label" style="margin:14px 0 4px;">OneDrive Folder</p>
        <p class="stub" style="margin:0 0 8px;${job.onedrive_folder_id?'color:var(--ok);':''}text-decoration:underline;cursor:pointer;" onclick="startRepairJobFolderPicker('${siteId}','${jobId}')">${job.onedrive_folder_id?'📁 "'+escapeHtml(job.onedrive_folder_name||'')+'"':'Not linked yet — tap to choose a folder'} ›</p>
      ` : ''}
      ${canManage ? `
        <button class="ghostbtn" style="width:100%;margin-top:16px;color:var(--warn);border-color:var(--warn);" onclick="deleteRepairJob('${jobId}','${siteId}')">Delete Job</button>
        <p class="stub" style="margin:8px 0 0;">Permanently deletes this job and its photos. This cannot be undone — use Close (in Admin, once surveyed) instead if you just want it off the active lists.</p>
      ` : ''}
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <p class="sectiontitle" style="margin:0;">Survey</p>
        ${surveyDone ? `<span class="plaintag" style="color:var(--ok);">✅ Completed${job.survey_date?' '+fmtDate(job.survey_date):''}</span>` : ''}
      </div>
      ${!surveyEditing ? `
        ${/* #(repair-survey-locked-view) 2026-09-25 — a completed survey used
          to stay a wide-open editable form forever, notes textarea and all,
          which read as unfinished even once it was actually done. Once
          survey_required is Y/NA it now collapses to this small, read-only
          summary — the real detail lives in the generated Survey Report PDF
          (notes + every survey/access photo laid out properly), which this
          pushes people toward opening rather than re-reading raw notes in
          the app. A pencil unlocks editing again for whoever surveyed it,
          or any manager, in case something genuinely needs correcting. */ ''}
        <p class="stub" style="margin:8px 0 2px;">${job.surveyed_by && profileName(job.surveyed_by) ? 'Surveyed by '+escapeHtml(profileName(job.surveyed_by)) : ''}${job.access_requirement && job.access_requirement!=='none' ? (job.surveyed_by && profileName(job.surveyed_by)?' — ':'')+'Access: '+escapeHtml(REPAIR_ACCESS_LABEL[job.access_requirement]) : ''}</p>
        ${/* #(repair-survey-locked-view-shows-notes) 2026-09-30 — the locked
          summary used to hide the actual survey notes behind the PDF, so
          anyone glancing at the job couldn't tell what work was quoted
          without opening a separate file. Shown inline here now, read-only —
          the PDF is still the one to open for photos/access notes/print. */ ''}
        ${job.survey_notes ? `<p style="margin:8px 0 0;font-size:13.5px;line-height:1.45;white-space:pre-wrap;">${escapeHtml(job.survey_notes)}</p>` : ''}
        <div class="row-gap" style="margin-top:10px;">
          <button class="darkbtn" style="flex:1;" onclick="viewRepairJobSurveyReport('${jobId}')">📄 View Survey Report</button>
          ${canEditSurvey ? `<button class="ghostbtn" style="flex:0 0 auto;width:auto;padding:10px 14px;" onclick="toggleRepairSurveyEdit('${jobId}')">✎ Edit</button>` : ''}
        </div>
      ` : `
        <p class="field-label" style="margin:12px 0 4px;">Survey completed?</p>
        <div class="row-gap" style="margin-bottom:12px;align-items:stretch;">
          <button class="${job.survey_required==='N'||!job.survey_required?'darkbtn':'ghostbtn'}" style="flex:1;color:var(--ink);" onclick="setRepairJobSurveyStatus('${jobId}','N')">To Survey</button>
          <button class="${job.survey_required==='Y'?'darkbtn':'ghostbtn'}" style="flex:1;color:var(--ink);${job.survey_required==='Y'?'background:var(--ok);border-color:var(--ok);':''}" onclick="setRepairJobSurveyStatus('${jobId}','Y')">Completed</button>
          <button class="${job.survey_required==='NA'?'darkbtn':'ghostbtn'}" style="flex:0 0 56px;padding:10px 4px;font-size:12px;color:var(--ink);" onclick="setRepairJobSurveyStatus('${jobId}','NA')">N/A</button>
        </div>

        <textarea id="repairSurveyNotes" placeholder="Survey notes / quoted works" rows="3" style="margin:14px 0 10px;" oninput="markRepairJobNotesDirty('survey')">${escapeHtml(job.survey_notes||'')}</textarea>
        ${photoUploadRow('survey','Survey / before photos')}

        <p class="field-label" style="margin:14px 0 4px;">Access requirement</p>
        <select id="repairAccessRequirement" style="width:100%;margin-bottom:10px;">
          ${['none','ladder','scaffold','tower'].map(v=>`<option value="${v}" ${job.access_requirement===v?'selected':''}>${REPAIR_ACCESS_LABEL[v]}</option>`).join('')}
        </select>
        <textarea id="repairAccessNotes" placeholder="Access-specific notes (e.g. where a tower needs to go up)" rows="2" style="margin-bottom:10px;">${escapeHtml(job.access_notes||'')}</textarea>
        <button class="ghostbtn" onclick="saveRepairJobAccess('${jobId}')">Save Access Details</button>
        ${needsScaffold ? photoUploadRow('access','Scaffold/tower access photo') : ''}
        ${job.survey_required!=='Y' ? `<button class="darkbtn" style="width:100%;margin-top:16px;color:var(--ink);background:var(--ok);border-color:var(--ok);" onclick="setRepairJobSurveyStatus('${jobId}','Y')">✅ Mark Survey as Completed</button>` : `<button class="ghostbtn" style="width:100%;margin-top:16px;" onclick="flushRepairJobUnsavedNotes();toggleRepairSurveyEdit('${jobId}')">Done Editing</button>`}
      `}
    </div>

    ${surveyDone ? `
      ${canSelfAuthorise ? `
      <div class="card" style="margin-bottom:16px;">
        <p class="sectiontitle" style="margin-top:0;">Ready to do this job?</p>
        <p class="stub" style="margin:0 0 10px;">If you can do this one now without waiting on a quote decision, self-authorise it here and get started straight away.</p>
        <button class="darkbtn" style="width:100%;color:var(--ink);background:var(--ok);border-color:var(--ok);" onclick="selfAuthoriseRepairJob('${jobId}')">✅ I Can Do This Now — Self-Authorise</button>
      </div>
      ` : ''}

      ${canManage && needsScaffold && approved ? `
      <div class="card" style="margin-bottom:16px;">
        <p class="sectiontitle" style="margin-top:0;">Scaffold</p>
        <p class="field-label" style="margin-bottom:4px;">Scaffold booking date</p>
        <div class="formfield" onclick="openDatePickerRow(this)"><input type="date" id="repairScaffBookingDate" value="${job.scaffold_booking_date||''}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;"></div>
        <p class="field-label" style="margin-bottom:4px;">Assign booking to</p>
        <select id="repairScaffBookingAssignee" style="width:100%;margin-bottom:10px;">
          <option value="">Unassigned</option>
          ${operatives.map(p=>`<option value="${p.id}" ${job.scaffold_booking_assigned_to===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
        <p class="field-label" style="margin-bottom:4px;">Scaffold erection date</p>
        <div class="formfield" onclick="openDatePickerRow(this)"><input type="date" id="repairScaffErectionDate" value="${job.scaffold_erection_date||''}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;"></div>
        <button class="ghostbtn" onclick="saveRepairJobScaffold('${jobId}')">Save</button>
        ${photoUploadRow('scaffold','Scaffold photos')}
      </div>
      ` : ''}

      ${canManage ? `
      <div class="card" style="margin-bottom:16px;">
        <p class="sectiontitle" style="margin-top:0;">Approval</p>
        ${approved ? `
          <p class="stub" style="margin:0 0 10px;">✅ Approved${job.quote_approved_at?' on '+fmtDate(job.quote_approved_at):''}${job.self_authorized ? ' — self-authorised by '+(profileName(job.approved_by)?escapeHtml(profileName(job.approved_by)):'the operative') : (profileName(job.approved_by) ? ' — approved by '+escapeHtml(profileName(job.approved_by)) : '')}</p>
          <button class="ghostbtn" style="color:var(--red);border-color:var(--red);" onclick="rejectRepairJob('${jobId}')">Reject instead</button>
        ` : rejected ? `
          <p class="stub" style="margin:0 0 10px;color:var(--red);">❌ Rejected</p>
          <button class="ghostbtn" style="color:var(--ok);border-color:var(--ok);" onclick="approveRepairJob('${jobId}')">Approve instead</button>
        ` : `
          <p class="field-label" style="margin-bottom:4px;">Variation works (£)</p>
          <div class="formfield"><input type="number" step="0.01" id="repairVariationCost" placeholder="0.00" value="${job.variation_cost!=null?job.variation_cost:''}"></div>
          ${job.variation_issued_at ? `<p class="stub" style="margin:-6px 0 10px;">Cost issued to the client ${fmtDate(job.variation_issued_at)} — awaiting their decision.</p>` : `<button class="ghostbtn" style="margin-bottom:10px;" onclick="issueRepairJobVariationCost('${jobId}')">Issue Cost to Client</button>`}
          <p class="field-label" style="margin-bottom:4px;">Priced schedule of works</p>
          <textarea id="repairPricedSchedule" placeholder="Priced schedule of works" rows="3" style="margin-bottom:10px;" oninput="markRepairJobNotesDirty('pricedSchedule')">${escapeHtml(job.priced_schedule_of_works||'')}</textarea>
          <div class="row-gap" style="align-items:stretch;">
            <button class="darkbtn" style="flex:1;color:var(--ink);background:var(--ok);border-color:var(--ok);" onclick="approveRepairJob('${jobId}')">✅ Approve</button>
            <button class="darkbtn" style="flex:1;color:var(--ink);background:var(--red);border-color:var(--red);" onclick="rejectRepairJob('${jobId}')">❌ Reject</button>
          </div>
        `}
        <p class="field-label" style="margin:14px 0 4px;">Repair return date</p>
        <div class="formfield" onclick="openDatePickerRow(this)"><input type="date" id="repairReturnDate" value="${job.repair_return_date||''}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;" onchange="saveRepairJobField('${jobId}',{repair_return_date:this.value||null})"></div>
      </div>
      ` : ''}

      ${approved ? `
      <div class="card" style="margin-bottom:16px;">
        <!-- #(repair-progress-completion-merge) 2026-09-30 — Progress and
        Completion used to be two separate cards; merged into one so the
        whole "doing it → done" arc for a job reads as a single flow instead
        of two disconnected sections. -->
        <p class="sectiontitle" style="margin-top:0;">Progress / Completion</p>
        <p class="field-label" style="margin-bottom:4px;">Progress notes</p>
        <textarea id="repairProgressNotes" placeholder="Progress notes" rows="3" style="margin-bottom:10px;" oninput="markRepairJobNotesDirty('progress')">${escapeHtml(job.progress_notes||'')}</textarea>
        ${photoUploadRow('progress','Progress photos')}

        <p class="field-label" style="margin:18px 0 4px;">Completion notes</p>
        ${job.works_completed_date ? `<p class="stub" style="margin:0 0 10px;">Marked complete ${fmtDate(job.works_completed_date)}${job.works_completed && !job.closed ? ' — awaiting PM sign-off' : ''}</p>` : ''}
        <textarea id="repairWorksNotes" placeholder="Completion notes" rows="3" style="margin-bottom:10px;" oninput="markRepairJobNotesDirty('completion')">${escapeHtml(job.works_notes||'')}</textarea>
        ${/* #(works-complete-mandatory-photo) — completion photos are
          mandatory before this can be ticked complete (see
          setRepairJobWorksCompleted); labelled here so it's clear why. */ ''}
        ${photoUploadRow('completion','Completion photos (required to mark complete)')}
        ${!job.works_completed ? `
          <button class="darkbtn" style="width:100%;margin-top:16px;color:var(--ink);background:var(--ok);border-color:var(--ok);" onclick="setRepairJobWorksCompleted('${jobId}', true)">✅ Mark Works as Completed</button>
        ` : `
          <label class="stub" style="display:flex;align-items:center;gap:8px;margin-top:16px;"><input type="checkbox" style="width:auto;" checked onchange="setRepairJobWorksCompleted('${jobId}', this.checked)">${job.closed ? 'Works completed' : 'Undo — not actually complete yet'}</label>
        `}
      </div>
      ` : ''}

      ${canManage ? `
      <div class="card" style="margin-bottom:16px;">
        <p class="sectiontitle" style="margin-top:0;">Admin</p>
        <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 12px;"><input type="checkbox" style="width:auto;" ${job.invoiced?'checked':''} onchange="saveRepairJobField('${jobId}',{invoiced:this.checked})">Invoiced</label>
        ${/* #(pm-signoff-button) 2026-09-30 — the only way to actually sign a
          job off used to be a small checkbox buried under "Admin", easy to
          miss entirely. Once works are completed this is now a proper full-
          width button, same treatment as Mark Works as Completed above it. */ ''}
        ${job.closed ? `
          <p class="stub" style="margin:0 0 10px;">✅ Signed off &amp; closed${job.closed_at?' '+fmtDate(job.closed_at):''}${job.closed_by && profileName(job.closed_by) ? ' by '+escapeHtml(profileName(job.closed_by)) : ''}</p>
          <button class="ghostbtn" style="width:100%;" onclick="setRepairJobClosed('${jobId}', false)">Reopen Job</button>
        ` : job.works_completed ? `
          <button class="darkbtn" style="width:100%;color:var(--ink);background:var(--ok);border-color:var(--ok);" onclick="setRepairJobClosed('${jobId}', true)">✅ Sign Off &amp; Close Job</button>
          <p class="stub" style="margin:8px 0 0;">The operative has marked the works completed — this closes it off and removes it from their list.</p>
        ` : `
          <p class="stub" style="margin:0;">Sign-off becomes available once the operative marks the works completed.</p>
        `}
      </div>
      ` : ''}
    ` : `<p class="stub" style="text-align:center;margin:0 0 16px;">Complete the survey to unlock the rest of this job.</p>`}
  `, {title:job.address||'Repair Job', titleTwoLine:true, subtitle:site.name, back:'#/site/'+siteId+'/repairjobs/'+(job.closed ? 'closed' : (JOB_STATUS_TO_CATEGORY[job.job_status] || 'survey')), siteId, activeTab:'home'});
  Object.keys(typedRepairNotes).forEach(kind=>{
    const el = document.getElementById(REPAIR_NOTE_BOXES[kind]);
    if(el) el.value = typedRepairNotes[kind];
  });
}
window.toggleRepairJobInfoEdit = function(jobId){
  repairJobInfoEditOpen[jobId] = !repairJobInfoEditOpen[jobId];
  render();
};
window.toggleRepairSurveyBookingEdit = function(jobId){
  repairSurveyBookingEditOpen[jobId] = !repairSurveyBookingEditOpen[jobId];
  render();
};
// A repair job gets its own subfolder in the site's linked OneDrive folder
// (named after its job number, or its address if it has none), with photos
// and the work order dropping into category subfolders underneath it —
// Graph's path-addressed upload creates every intermediate folder on the
// fly, so nothing has to be pre-created on the OneDrive side. Invalid path
// characters are swapped for '-' since job numbers/addresses are free text.
function onedrivePathSegment(s){
  return String(s||'').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim() || 'Job';
}
function repairJobOneDriveFolder(job){
  const label = (job && job.job_number && job.job_number.trim()) ? job.job_number.trim() : ((job && job.address) || 'Job');
  return onedrivePathSegment(label);
}
const REPAIR_PHOTO_CATEGORY_FOLDER = {survey:'Survey Photos', access:'Access Photos', scaffold:'Scaffold Photos', progress:'Progress Photos', completion:'Completion Photos'};
window.addRepairJobPhoto = async function(input, jobId, category){
  const files = Array.from(input.files||[]);
  if(!files.length) return;
  repairJobPhotoBusy[category] = true; render();
  const job = repairJobDetailCurrent;
  const site = job ? SITES.find(s=>s.id===job.site_id) : null;
  const jobLinked = job && job.onedrive_folder_id;
  const jobFolder = (job && !jobLinked) ? repairJobOneDriveFolder(job) : null;
  for(const file of files){
    try{
      const dataUrl = await compressImage(file);
      const path = ME.org_id+'/repairjobs/'+jobId+'/'+category+'/'+crypto.randomUUID()+'.jpg';
      const stored = await uploadDataUrl('site-photos', path, dataUrl);
      if(stored) await dbInsert('repair_job_photos', {repair_job_id:jobId, category, storage_path:stored, uploaded_by:ME.id});
      // Best-effort, live push to OneDrive — never blocks the in-app save
      // above, which is what actually matters if this fails or nothing's
      // linked at all. Prefer the job's own linked folder if it has one;
      // otherwise fall back to the old auto-created subfolder under the
      // site's linked folder. OneDrive gets a separately-compressed, higher
      // resolution/quality copy than the in-app one — the app copy stays
      // small so galleries load fast on-site, but the OneDrive copy is
      // meant to be the one anyone actually opens/prints/zooms into later.
      if(stored && job){
        const filename = (REPAIR_PHOTO_CATEGORY_FOLDER[category]||category)+'/'+crypto.randomUUID()+'.jpg';
        let hiResDataUrl = dataUrl;
        try{ hiResDataUrl = await compressImage(file, {maxW:3000, quality:0.95}); }catch(e){ /* fall back to the app copy if this fails */ }
        if(jobLinked) syncPhotoToOneDriveFolder(hiResDataUrl, filename, job.onedrive_folder_id, job.onedrive_drive_id);
        else if(site && site.onedrive_folder_id && jobFolder) syncPhotoToOneDrive(hiResDataUrl, jobFolder+'/'+filename, job.site_id);
      }
    }catch(e){ toast('One photo failed to upload — try again.'); }
  }
  repairJobPhotoBusy[category] = false;
  toast('Photo(s) added');
  render();
  // Keep the survey report PDF (if this job's already been surveyed) in
  // sync with whatever photos are actually on the job — see
  // exportRepairJobSurveyPdf below.
  if((category==='survey'||category==='access') && job && job.survey_required==='Y') scheduleRepairJobReportExport(jobId,'survey');
  // Same idea for the Completed Works Report, once works are marked complete.
  if(category==='completion' && job && job.works_completed) scheduleRepairJobReportExport(jobId,'completion');
};
window.deleteRepairJobPhoto = async function(photoId, storagePath, jobId){
  const yes = await customConfirm('Delete this photo?');
  if(!yes) return;
  const done = await dbDelete('repair_job_photos', photoId);
  if(done){
    sbFetch('/storage/v1/object/site-photos/'+storagePath, {method:'DELETE'}).catch(()=>{});
    toast('Photo deleted');
    render();
  }
};
// Shared by addRepairJob (attaching a work order at creation time) and
// addRepairJobWorkOrder (adding/replacing one later from the job detail
// page) — uploads to storage, saves the path on the job row, and
// best-effort pushes a copy into that job's OneDrive subfolder if the site
// is linked. Returns the updated row, or null if the storage upload itself
// failed (the OneDrive push is opportunistic and never fails this).
async function uploadRepairJobWorkOrderFile(job, file){
  const path = ME.org_id+'/repairjobs/'+job.id+'/workorder/'+crypto.randomUUID()+'-'+file.name.replace(/[^a-zA-Z0-9.-]/g,'_');
  const stored = await uploadToStorage('site-photos', path, file, file.type);
  if(!stored) return null;
  const row = await dbUpdate('repair_jobs', job.id, {work_order_path:stored, work_order_name:file.name});
  if(row){
    const site = SITES.find(s=>s.id===job.site_id);
    const jobLinked = job.onedrive_folder_id;
    if(jobLinked || (site && site.onedrive_folder_id)){
      try{
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary=''; const chunk=0x8000;
        for(let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk));
        const cleanName = file.name.replace(/[\\/:*?"<>|]/g,'-');
        sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify(jobLinked ? {
          filename: 'Work Order/'+cleanName,
          content_base64: btoa(binary),
          folder_id: job.onedrive_folder_id,
          drive_id: job.onedrive_drive_id||undefined,
        } : {
          filename: repairJobOneDriveFolder(job)+'/Work Order/'+cleanName,
          content_base64: btoa(binary),
          site_id: job.site_id,
        })}).catch(()=>{});
      }catch(e){ /* silent — OneDrive sync is opportunistic */ }
    }
  }
  return row;
}
window.addRepairJobWorkOrder = async function(input, jobId){
  const file = input.files && input.files[0];
  if(!file) return;
  const job = repairJobDetailCurrent;
  if(!job){ return; }
  const row = await uploadRepairJobWorkOrderFile(job, file);
  if(!row){ toast('Upload failed — try again.'); return; }
  toast('Work order uploaded');
  render();
};
window.saveRepairJobField = async function(jobId, patch){
  const row = await dbUpdate('repair_jobs', jobId, patch);
  if(row){ toast('Saved'); render(); }
};
window.saveRepairJobBasics = async function(jobId){
  const jobNumber = document.getElementById('repairJobNumber').value.trim();
  const address = document.getElementById('repairJobAddress').value.trim();
  const description = document.getElementById('repairJobDescription').value.trim();
  if(!address){ toast('Enter an address.'); return; }
  const row = await dbUpdate('repair_jobs', jobId, {job_number:jobNumber||null, address, description:description||null});
  if(row){ repairJobInfoEditOpen[jobId] = false; toast('Saved'); render(); }
};
window.setRepairJobSurveyStatus = async function(jobId, value){
  const job = repairJobDetailCurrent;
  const patch = {survey_required: value};
  // #(survey-complete-requires-notes-and-photo) 2026-09-30 — marking a
  // survey "Completed" used to be a single tap regardless of whether
  // anything had actually been recorded, so a job could get waved through
  // with no notes and no photos backing it up. Andy asked for both to be
  // compulsory before it can move to Completed — N/A is unaffected (that
  // means no survey was needed at all, so nothing to require). Reads the
  // notes textarea live rather than job.survey_notes so a typed-but-not-yet-
  // saved note still counts, and saves it in the same patch below so a tap
  // on "Completed" alone is enough once both requirements are actually met.
  if(value==='Y'){
    const notesInput = document.getElementById('repairSurveyNotes');
    const notesText = (notesInput ? notesInput.value : (job && job.survey_notes) || '').trim();
    if(!notesText){ toast('Add survey notes before marking the survey complete.'); return; }
    const photoRows = await dbSelect('repair_job_photos', 'repair_job_id=eq.'+jobId+'&category=eq.survey&select=id&limit=1');
    if(!photoRows.length){ toast('Add at least one survey photo before marking the survey complete.'); return; }
    patch.survey_notes = notesText;
    // Whoever completes the survey is the surveyor if nobody is recorded
    // yet — without this the operative couldn't use "Edit" afterwards and
    // the Survey Report PDF had no surveyor's name.
    if(job && !job.surveyed_by) patch.surveyed_by = ME.id;
  }
  // Notes typed but not saved separately are saved by this same tap — so the
  // PM's "survey notes saved" email has to go from here too, since the notes
  // box disappears once the survey is complete and the usual save never runs.
  const surveyNotesWereUnsaved = value==='Y' && repairJobUnsavedNotes && repairJobUnsavedNotes.jobId===jobId && repairJobUnsavedNotes.survey;
  if(value==='Y' && job && !job.survey_date) patch.survey_date = new Date().toISOString();
  const effectiveDate = (patch.survey_date || (job && job.survey_date) || null);
  const surveyDateOnly = effectiveDate ? effectiveDate.slice(0,10) : null;
  const addressLabel = (job && job.address) || 'Repair Job';
  patch.survey_event_id = await syncRepairCalendarEvent(ME.org_id, job && job.site_id, job && job.survey_event_id, surveyDateOnly, 'Survey: '+addressLabel, []);
  // Auto-advance job_status: marking the survey done (Y or N/A) moves it
  // out of "To Survey" and into the costing stage, but only if no
  // approval decision has been made yet — otherwise leave a later-stage
  // status alone (e.g. re-editing survey notes on an already-approved job
  // shouldn't knock it back). Reverting to "not surveyed" sends it back.
  if((value==='Y' || value==='NA') && job && job.quote_approved==null && (!job.job_status || job.job_status==='To Survey')){
    patch.job_status = job.variation_cost!=null ? 'Surveyed - Variation Issued' : 'Surveyed - Awaiting Cost';
  } else if((!value || value==='N') && job && (!job.job_status || job.job_status==='Surveyed - Awaiting Cost' || job.job_status==='Surveyed - Variation Issued')){
    patch.job_status = 'To Survey';
  }
  await saveRepairJobField(jobId, patch);
  if(surveyNotesWereUnsaved){
    repairJobUnsavedNotes.survey = false;
    if(job && job.site_id) notifyPmOfRepairJobUpdate(jobId, job.site_id, 'survey', patch.survey_notes);
  }
  if(value==='Y') scheduleRepairJobReportExport(jobId,'survey');
};
// Best-effort — emails the site's responsible PM whenever an operative
// saves notes for a repair job section (Survey/Progress/Completion), so
// they know to come and action the next step (e.g. get costs sorted after
// a survey) without checking the app. Photos for that section are already
// live in OneDrive by the time this fires (see addRepairJobPhoto) — the
// edge function just counts them and points the PM at the app. Silently
// no-ops if the site has no PM assigned yet; never blocks the notes save.
function notifyPmOfRepairJobUpdate(jobId, siteId, section, notesText){
  try{
    sbFetch('/functions/v1/send-repair-job-notes-email', {method:'POST', body: JSON.stringify({site_id:siteId, job_id:jobId, section, notes: notesText||''})}).catch(()=>{});
  }catch(e){ /* silent — best effort only */ }
}
// Rebuilding and re-uploading the whole Survey/Completion Report PDF after
// every single photo (see addRepairJobPhoto, setRepairJobSurveyStatus,
// setRepairJobWorksCompleted, saveRepairJobSurvey/Access) used to fire one
// full rebuild-and-upload per photo — harmless for one or two photos, but
// for a job with a dozen-plus survey photos added back-to-back it meant a
// dozen-plus PDF rebuilds in a few seconds, each bigger than the last as
// more photos accumulated. That's what was actually failing silently and
// leaving the PDF out of the OneDrive folder (see exportRepairJobSurveyPdf/
// exportRepairJobCompletionPdf below — once the embedded photos push the
// PDF past OneDrive's single-request upload limit, the upload starts
// failing, and the catch around it was entirely silent) while the raw
// photos themselves kept landing fine, since those are synced individually
// and never grow. Debouncing to "once, 2.5s after the last change" means
// only the final, complete PDF is ever built and pushed — see the matching
// chunked-upload fix in the onedrive-upload edge function for the size
// side of this.
const _repairJobReportExportTimers = {};
function scheduleRepairJobReportExport(jobId, kind){
  const key = kind+':'+jobId;
  clearTimeout(_repairJobReportExportTimers[key]);
  _repairJobReportExportTimers[key] = setTimeout(()=>{
    delete _repairJobReportExportTimers[key];
    if(kind==='survey') exportRepairJobSurveyPdf(jobId);
    else exportRepairJobCompletionPdf(jobId);
  }, 2500);
}
// Branded "Survey Report" PDF for a single repair job — same header
// band/footer look as the other branded exports (Snagging, Inspection
// Reports): logo + org colour band, job details, the survey notes, access
// requirement/notes, and every survey/access photo laid out via the same
// Media summary grid those other exports use. Built fresh every time it's
// requested rather than cached, so it's always up to date with whatever's
// on the job right now.
async function buildRepairJobSurveyPdf(jobId){
  if(!(await loadLib('PDFLib'))) return null;
  const rows = await dbSelect('repair_jobs', 'id=eq.'+jobId);
  const job = rows[0]; if(!job) return null;
  const site = SITES.find(s=>s.id===job.site_id);
  await loadAllProfiles();
  try{
    const pdfDoc = await PDFLib.PDFDocument.create();
    const bold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const reg = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const WHITE = PDFLib.rgb(1,1,1);
    const INK = PDFLib.rgb(0.06,0.06,0.07);
    const SLATE = PDFLib.rgb(0.36,0.37,0.41);
    const FAINT = PDFLib.rgb(0.85,0.84,0.80);
    const HEADBAR = PDFLib.rgb(0.933,0.941,0.961);
    const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1);
    const PAGE_W = 595.28, PAGE_H = 841.89;
    const MARGIN = 44;
    const CONTENT_W = PAGE_W - 2*MARGIN;
    const companyName = (ORG && ORG.name) || 'OpHUB';

    let logoImg = null;
    const logoUrl = ORG && ORG.logo_path ? publicUrl('org-logos', ORG.logo_path) : null;
    if(logoUrl){
      const bytes = await pdfFetchImageBytes(logoUrl);
      if(bytes){ try{ logoImg = await pdfDoc.embedJpg(bytes); }catch(e){ try{ logoImg = await pdfDoc.embedPng(bytes); }catch(e2){} } }
    }

    let page, y;
    function drawHeaderBand(){
      page.drawRectangle({x:0, y:PAGE_H-92, width:PAGE_W, height:92, color:BRAND});
      if(logoImg){
        const dim = logoImg.scale(1);
        const s = 40/Math.max(dim.width, dim.height);
        const w = dim.width*s, h = dim.height*s;
        page.drawRectangle({x:MARGIN, y:PAGE_H-76, width:40, height:40, color:WHITE});
        page.drawImage(logoImg, {x:MARGIN+(40-w)/2, y:PAGE_H-76+(40-h)/2, width:w, height:h});
      }
      const textX = logoImg ? MARGIN+52 : MARGIN;
      const addressLabel = job.address || 'Repair Job';
      const titleText = addressLabel.length>44 ? addressLabel.slice(0,41)+'…' : addressLabel;
      page.drawText('SURVEY REPORT', {x:textX, y:PAGE_H-40, size:9, font:bold, color:WHITE, opacity:0.85});
      page.drawText(titleText, {x:textX, y:PAGE_H-60, size:16, font:bold, color:WHITE});
      pdfDrawFit(page, companyName + (site ? ' · '+pdfSiteLabel(site) : ''), {x:textX, y:PAGE_H-76, size:9.5, font:reg, color:WHITE, opacity:0.9});
    }
    function drawFooter(pageLabel){
      page.drawLine({start:{x:MARGIN,y:34}, end:{x:PAGE_W-MARGIN,y:34}, thickness:0.75, color:FAINT});
      page.drawText('Generated via OpHUB', {x:MARGIN, y:20, size:8, font:reg, color:SLATE});
      if(pageLabel){
        const w = reg.widthOfTextAtSize(pageLabel,8);
        page.drawText(pageLabel, {x:PAGE_W-MARGIN-w, y:20, size:8, font:reg, color:SLATE});
      }
    }
    function newPage(){
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      drawHeaderBand();
      y = PAGE_H - 118;
    }
    function ensureSpace(h){ if(y - h < 50) newPage(); }
    function wrapText(text, font, size, maxWidth){
      const words = String(text).split(/\s+/);
      const lines = []; let line = '';
      words.forEach(w=>{
        const test = line ? line+' '+w : w;
        if(font.widthOfTextAtSize(test, size) > maxWidth && line){ lines.push(line); line = w; }
        else line = test;
      });
      if(line) lines.push(line);
      return lines;
    }
    function drawHeadingBar(label){
      const h = 26;
      ensureSpace(h+4);
      page.drawRectangle({x:MARGIN, y:y-h, width:CONTENT_W, height:h, color:HEADBAR});
      page.drawText(label, {x:MARGIN+10, y:y-h+8, size:11.5, font:bold, color:INK});
      y -= h+8;
    }
    function drawField(label, value){
      ensureSpace(30);
      page.drawText(label.toUpperCase(), {x:MARGIN, y:y-11, size:8.5, font:bold, color:SLATE});
      y -= 16;
      wrapText(value||'—', reg, 10.5, CONTENT_W).forEach(l=>{ ensureSpace(14); page.drawText(l, {x:MARGIN, y:y-10, size:10.5, font:reg, color:INK}); y -= 14; });
      y -= 8;
    }

    newPage();
    drawHeadingBar('Job Details');
    drawField('Job Number', job.job_number || '—');
    drawField('Address', job.address || '—');
    if(job.description) drawField('Description of Call Out', job.description);

    drawHeadingBar('Survey');
    const surveyorName = job.surveyed_by && PROFILES[job.surveyed_by] ? PROFILES[job.surveyed_by].name : null;
    drawField('Survey Date', job.survey_date ? (new Date(job.survey_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) + (surveyorName?' — surveyed by '+surveyorName:'')) : 'Not yet surveyed');
    drawField('Access Requirement', REPAIR_ACCESS_LABEL[job.access_requirement] || 'None');
    if(job.access_notes) drawField('Access Notes', job.access_notes);
    drawField('Survey Notes', job.survey_notes || '(no notes recorded)');

    const photos = await dbSelect('repair_job_photos', 'repair_job_id=eq.'+jobId+'&category=in.(survey,access)&order=created_at.asc');
    await appendMediaSummaryPages(pdfDoc, photos.map(p=>({path:p.storage_path, bucket:'site-photos'})), {maxDim:900, quality:0.72});

    const total = pdfDoc.getPageCount();
    pdfDoc.getPages().forEach((p,idx)=>{ page = p; drawFooter((idx+1)+' of '+total); });

    const filename = exportFilename(job.address||'', 'Survey Report', 'pdf');
    pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await pdfDoc.save();
    let binary=''; const chunk=0x8000;
    for(let i=0;i<outBytes.length;i+=chunk) binary += String.fromCharCode.apply(null, outBytes.subarray(i,i+chunk));
    const base64 = btoa(binary);
    return {bytes: outBytes, base64, filename, job};
  }catch(e){
    console.error(e);
    return null;
  }
}
// Auto-export, best-effort and silent (never surfaces an error to the
// person who just saved notes/a photo) — rebuilds the Survey Report PDF
// and pushes it into the job's own linked OneDrive folder, or the site's
// (auto-created job subfolder) if the job itself isn't linked yet. Called
// whenever survey-relevant data changes AFTER the survey has been marked
// complete (see setRepairJobSurveyStatus/saveRepairJobSurvey/
// saveRepairJobAccess/addRepairJobPhoto), so the exported PDF always
// reflects the latest notes and photos rather than a stale snapshot.
async function exportRepairJobSurveyPdf(jobId){
  try{
    const built = await buildRepairJobSurveyPdf(jobId);
    if(!built) return;
    const job = built.job;
    const site = SITES.find(s=>s.id===job.site_id);
    let res;
    if(job.onedrive_folder_id){
      res = await sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify({
        filename: built.filename,
        content_base64: built.base64,
        folder_id: job.onedrive_folder_id,
        drive_id: job.onedrive_drive_id||undefined,
      })});
    } else if(site && site.onedrive_folder_id){
      res = await sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify({
        filename: repairJobOneDriveFolder(job)+'/'+built.filename,
        content_base64: built.base64,
        site_id: job.site_id,
      })});
    }
    // Best-effort only — never surfaces an error to whoever just saved a
    // note/photo — but a failed push used to vanish completely (fetch()
    // doesn't throw on a non-2xx response, so the try/catch below never
    // caught it either). Logging it means a failure is at least visible in
    // the console instead of just absent from OneDrive with no trace.
    if(res && !res.ok){ const body = await res.text().catch(()=>''); console.error('exportRepairJobSurveyPdf: onedrive-upload failed', res.status, body); }
  }catch(e){ console.error('exportRepairJobSurveyPdf failed', e); }
}
// #(repair-job-completion-report) 2026-09-30 — mirrors buildRepairJobSurveyPdf
// / exportRepairJobSurveyPdf exactly, but for the "works completed" side of a
// job instead of the survey: job details, completion date/notes, and every
// completion photo. Andy asked for this so signing off a job leaves the same
// kind of paper trail in OneDrive that surveying one already does.
async function buildRepairJobCompletionPdf(jobId){
  if(!(await loadLib('PDFLib'))) return null;
  const rows = await dbSelect('repair_jobs', 'id=eq.'+jobId);
  const job = rows[0]; if(!job) return null;
  const site = SITES.find(s=>s.id===job.site_id);
  await loadAllProfiles();
  try{
    const pdfDoc = await PDFLib.PDFDocument.create();
    const bold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const reg = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const WHITE = PDFLib.rgb(1,1,1);
    const INK = PDFLib.rgb(0.06,0.06,0.07);
    const SLATE = PDFLib.rgb(0.36,0.37,0.41);
    const FAINT = PDFLib.rgb(0.85,0.84,0.80);
    const HEADBAR = PDFLib.rgb(0.933,0.941,0.961);
    const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1);
    const PAGE_W = 595.28, PAGE_H = 841.89;
    const MARGIN = 44;
    const CONTENT_W = PAGE_W - 2*MARGIN;
    const companyName = (ORG && ORG.name) || 'OpHUB';

    let logoImg = null;
    const logoUrl = ORG && ORG.logo_path ? publicUrl('org-logos', ORG.logo_path) : null;
    if(logoUrl){
      const bytes = await pdfFetchImageBytes(logoUrl);
      if(bytes){ try{ logoImg = await pdfDoc.embedJpg(bytes); }catch(e){ try{ logoImg = await pdfDoc.embedPng(bytes); }catch(e2){} } }
    }

    let page, y;
    function drawHeaderBand(){
      page.drawRectangle({x:0, y:PAGE_H-92, width:PAGE_W, height:92, color:BRAND});
      if(logoImg){
        const dim = logoImg.scale(1);
        const s = 40/Math.max(dim.width, dim.height);
        const w = dim.width*s, h = dim.height*s;
        page.drawRectangle({x:MARGIN, y:PAGE_H-76, width:40, height:40, color:WHITE});
        page.drawImage(logoImg, {x:MARGIN+(40-w)/2, y:PAGE_H-76+(40-h)/2, width:w, height:h});
      }
      const textX = logoImg ? MARGIN+52 : MARGIN;
      const addressLabel = job.address || 'Repair Job';
      const titleText = addressLabel.length>44 ? addressLabel.slice(0,41)+'…' : addressLabel;
      page.drawText('COMPLETED WORKS REPORT', {x:textX, y:PAGE_H-40, size:9, font:bold, color:WHITE, opacity:0.85});
      page.drawText(titleText, {x:textX, y:PAGE_H-60, size:16, font:bold, color:WHITE});
      pdfDrawFit(page, companyName + (site ? ' · '+pdfSiteLabel(site) : ''), {x:textX, y:PAGE_H-76, size:9.5, font:reg, color:WHITE, opacity:0.9});
    }
    function drawFooter(pageLabel){
      page.drawLine({start:{x:MARGIN,y:34}, end:{x:PAGE_W-MARGIN,y:34}, thickness:0.75, color:FAINT});
      page.drawText('Generated via OpHUB', {x:MARGIN, y:20, size:8, font:reg, color:SLATE});
      if(pageLabel){
        const w = reg.widthOfTextAtSize(pageLabel,8);
        page.drawText(pageLabel, {x:PAGE_W-MARGIN-w, y:20, size:8, font:reg, color:SLATE});
      }
    }
    function newPage(){
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      drawHeaderBand();
      y = PAGE_H - 118;
    }
    function ensureSpace(h){ if(y - h < 50) newPage(); }
    function wrapText(text, font, size, maxWidth){
      const words = String(text).split(/\s+/);
      const lines = []; let line = '';
      words.forEach(w=>{
        const test = line ? line+' '+w : w;
        if(font.widthOfTextAtSize(test, size) > maxWidth && line){ lines.push(line); line = w; }
        else line = test;
      });
      if(line) lines.push(line);
      return lines;
    }
    function drawHeadingBar(label){
      const h = 26;
      ensureSpace(h+4);
      page.drawRectangle({x:MARGIN, y:y-h, width:CONTENT_W, height:h, color:HEADBAR});
      page.drawText(label, {x:MARGIN+10, y:y-h+8, size:11.5, font:bold, color:INK});
      y -= h+8;
    }
    function drawField(label, value){
      ensureSpace(30);
      page.drawText(label.toUpperCase(), {x:MARGIN, y:y-11, size:8.5, font:bold, color:SLATE});
      y -= 16;
      wrapText(value||'—', reg, 10.5, CONTENT_W).forEach(l=>{ ensureSpace(14); page.drawText(l, {x:MARGIN, y:y-10, size:10.5, font:reg, color:INK}); y -= 14; });
      y -= 8;
    }

    newPage();
    drawHeadingBar('Job Details');
    drawField('Job Number', job.job_number || '—');
    drawField('Address', job.address || '—');
    if(job.description) drawField('Description of Call Out', job.description);

    drawHeadingBar('Completion');
    drawField('Works Completed', job.works_completed_date ? new Date(job.works_completed_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : 'Not yet marked complete');
    drawField('Completion Notes', job.works_notes || '(no notes recorded)');

    const photos = await dbSelect('repair_job_photos', 'repair_job_id=eq.'+jobId+'&category=eq.completion&order=created_at.asc');
    await appendMediaSummaryPages(pdfDoc, photos.map(p=>({path:p.storage_path, bucket:'site-photos'})), {maxDim:900, quality:0.72});

    const total = pdfDoc.getPageCount();
    pdfDoc.getPages().forEach((p,idx)=>{ page = p; drawFooter((idx+1)+' of '+total); });

    const filename = exportFilename(job.address||'', 'Completed Works Report', 'pdf');
    pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await pdfDoc.save();
    let binary=''; const chunk=0x8000;
    for(let i=0;i<outBytes.length;i+=chunk) binary += String.fromCharCode.apply(null, outBytes.subarray(i,i+chunk));
    const base64 = btoa(binary);
    return {bytes: outBytes, base64, filename, job};
  }catch(e){
    console.error(e);
    return null;
  }
}
// Same auto-export-and-push pattern as exportRepairJobSurveyPdf, for the
// Completed Works Report instead — best-effort and silent, called whenever
// completion-relevant data changes AFTER works have been marked complete
// (see setRepairJobWorksCompleted/saveRepairJobCompletionNotes/
// addRepairJobPhoto).
async function exportRepairJobCompletionPdf(jobId){
  try{
    const built = await buildRepairJobCompletionPdf(jobId);
    if(!built) return;
    const job = built.job;
    const site = SITES.find(s=>s.id===job.site_id);
    let res;
    if(job.onedrive_folder_id){
      res = await sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify({
        filename: built.filename,
        content_base64: built.base64,
        folder_id: job.onedrive_folder_id,
        drive_id: job.onedrive_drive_id||undefined,
      })});
    } else if(site && site.onedrive_folder_id){
      res = await sbFetchOD('/functions/v1/onedrive-upload', {method:'POST', body: JSON.stringify({
        filename: repairJobOneDriveFolder(job)+'/'+built.filename,
        content_base64: built.base64,
        site_id: job.site_id,
      })});
    }
    // See the matching comment in exportRepairJobSurveyPdf — fetch() doesn't
    // throw on a non-2xx response, so a failed push used to vanish with no
    // trace at all. Logging it at least makes a failure diagnosable.
    if(res && !res.ok){ const body = await res.text().catch(()=>''); console.error('exportRepairJobCompletionPdf: onedrive-upload failed', res.status, body); }
  }catch(e){ console.error('exportRepairJobCompletionPdf failed', e); }
}
// Surveyor is never picked from a dropdown — it's just whoever actually
// filled the survey notes in, captured automatically the first time notes
// are saved for this job (re-saving edits doesn't change who did the survey).
window.saveRepairJobSurvey = function(jobId){
  const job = repairJobDetailCurrent;
  const survey_notes = document.getElementById('repairSurveyNotes').value.trim();
  const patch = {survey_notes: survey_notes||null};
  if(!job || !job.surveyed_by) patch.surveyed_by = ME.id;
  saveRepairJobField(jobId, patch);
  if(job && job.site_id) notifyPmOfRepairJobUpdate(jobId, job.site_id, 'survey', survey_notes);
  // If the survey's already marked complete, an edit to the notes here
  // should be reflected in the exported PDF too, not just the app.
  if(job && job.survey_required==='Y') scheduleRepairJobReportExport(jobId,'survey');
};
window.saveRepairJobAccess = function(jobId){
  const access_requirement = document.getElementById('repairAccessRequirement').value;
  const access_notes = document.getElementById('repairAccessNotes').value.trim();
  saveRepairJobField(jobId, {access_requirement, access_notes: access_notes||null});
  const job = repairJobDetailCurrent;
  if(job && job.survey_required==='Y') scheduleRepairJobReportExport(jobId,'survey');
};
// Mirrors the scaffold-booking pattern below — books who's doing the survey
// and when, with the date synced onto the site Calendar the same way.
window.saveRepairJobSurveyBooking = async function(jobId){
  const job = repairJobDetailCurrent;
  const survey_booking_date = document.getElementById('repairSurveyBookingDate').value || null;
  const survey_booking_assigned_to = document.getElementById('repairSurveyBookingAssignee').value || null;
  const addressLabel = (job && job.address) || 'Repair Job';
  const siteId = job && job.site_id;
  const survey_booking_event_id = await syncRepairCalendarEvent(ME.org_id, siteId, job && job.survey_booking_event_id, survey_booking_date, 'Survey Booking: '+addressLabel, survey_booking_assigned_to ? [survey_booking_assigned_to] : []);
  const row = await dbUpdate('repair_jobs', jobId, {survey_booking_date, survey_booking_assigned_to, survey_booking_event_id});
  if(row){ repairSurveyBookingEditOpen[jobId] = false; toast('Saved'); render(); }
};
// Mirrors syncDeliveryCalendarEvent's linked-record pattern — pushes any of
// a repair job's key dates (survey date, scaffold booking date, scaffold
// erection date, works-completed date) onto the site's own Calendar
// (site_calendar_events), keeping the link on the job row (survey_event_id /
// scaffold_booking_event_id / scaffold_erection_event_id /
// works_completed_event_id) so re-saving updates the same entry instead of
// duplicating it, and clearing/un-ticking the date removes it. Only the
// booking event carries the assigned operative on reminder_recipient_ids so
// they get notified like any other reminder; the rest are manager-only
// planning entries with no recipients. Never blocks the job save itself — a
// calendar hiccup just leaves the old link in place.
async function syncRepairCalendarEvent(orgId, siteId, existingEventId, date, title, reminderRecipientIds){
  try{
    if(!date){
      if(existingEventId) await dbDelete('site_calendar_events', existingEventId).catch(()=>{});
      return null;
    }
    if(existingEventId){
      await dbUpdate('site_calendar_events', existingEventId, {title, event_date:date, site_id:siteId, reminder_recipient_ids:reminderRecipientIds||[], reminder_sent:false});
      return existingEventId;
    } else {
      const rows = await dbInsert('site_calendar_events', {org_id:orgId, site_id:siteId, title, event_date:date, is_private:false, reminder_recipient_ids:reminderRecipientIds||[], created_by:ME.id});
      return rows && rows[0] && rows[0].id;
    }
  }catch(e){ return existingEventId||null; }
}
window.saveRepairJobScaffold = async function(jobId){
  const job = repairJobDetailCurrent;
  const scaffold_booking_date = document.getElementById('repairScaffBookingDate').value || null;
  const scaffold_erection_date = document.getElementById('repairScaffErectionDate').value || null;
  const scaffold_booking_assigned_to = document.getElementById('repairScaffBookingAssignee').value || null;
  const addressLabel = (job && job.address) || 'Repair Job';
  const siteId = job && job.site_id;
  const [bookingEventId, erectionEventId] = await Promise.all([
    syncRepairCalendarEvent(ME.org_id, siteId, job && job.scaffold_booking_event_id, scaffold_booking_date, 'Scaffold Booking: '+addressLabel, scaffold_booking_assigned_to ? [scaffold_booking_assigned_to] : []),
    syncRepairCalendarEvent(ME.org_id, siteId, job && job.scaffold_erection_event_id, scaffold_erection_date, 'Scaffold Erection: '+addressLabel, []),
  ]);
  const patch = {scaffold_booking_date, scaffold_erection_date, scaffold_booking_assigned_to, scaffold_booking_event_id:bookingEventId, scaffold_erection_event_id:erectionEventId};
  // Auto-advance: once scaffold is up, an "Approved - Awaiting Scaffold"
  // job is ready for the operative to actually do the work. Clearing the
  // erection date (e.g. a mistaken entry) reverts it, but only while it
  // hasn't moved further on (don't knock back a job that's already In
  // Progress or beyond just because someone edited an old date).
  if(scaffold_erection_date && job && job.job_status==='Approved - Awaiting Scaffold'){
    patch.job_status = 'Approved - To Do';
  } else if(!scaffold_erection_date && job && job.job_status==='Approved - To Do' && repairJobNeedsScaffold(job)){
    patch.job_status = 'Approved - Awaiting Scaffold';
  }
  saveRepairJobField(jobId, patch);
};
window.overrideRepairJobStatus = function(jobId, value){
  saveRepairJobField(jobId, {job_status: value});
};
window.viewRepairJobSurveyReport = async function(jobId){
  toast('Opening survey report…');
  const built = await buildRepairJobSurveyPdf(jobId);
  if(!built){ toast('Could not build the survey report — try again.'); return; }
  await deliverPdf(built.bytes, built.filename);
};
window.toggleRepairSurveyEdit = function(jobId){
  repairSurveyEditOpen[jobId] = !repairSurveyEditOpen[jobId];
  render();
};
window.issueRepairJobVariationCost = function(jobId){
  const costVal = document.getElementById('repairVariationCost').value;
  if(costVal===''){ toast('Enter the variation cost first.'); return; }
  const variation_cost = Number(costVal);
  saveRepairJobField(jobId, {variation_cost, variation_issued_at:new Date().toISOString(), job_status:'Surveyed - Variation Issued'});
};
window.approveRepairJob = async function(jobId){
  const job = repairJobDetailCurrent;
  const needsScaffold = job && repairJobNeedsScaffold(job);
  const patch = {
    quote_approved: true,
    approved_by: ME.id,
    self_authorized: false,
    job_status: needsScaffold ? 'Approved - Awaiting Scaffold' : 'Approved - To Do',
  };
  if(job && !job.quote_approved_at) patch.quote_approved_at = new Date().toISOString();
  saveRepairJobField(jobId, patch);
};
window.rejectRepairJob = async function(jobId){
  const yes = await customConfirm('Reject this job? The operative/PM will need to review it again.');
  if(!yes) return;
  saveRepairJobField(jobId, {quote_approved:false, quote_approved_at:null, approved_by:null, self_authorized:false, job_status:'Rejected'});
};
window.selfAuthoriseRepairJob = async function(jobId){
  const yes = await customConfirm("Self-authorise this job? You're confirming you can do the work now without PM approval.");
  if(!yes) return;
  saveRepairJobField(jobId, {
    quote_approved: true,
    quote_approved_at: new Date().toISOString(),
    approved_by: ME.id,
    self_authorized: true,
    job_status: 'Approved - To Do',
  });
};
window.saveRepairJobProgress = function(jobId){
  const job = repairJobDetailCurrent;
  const progress_notes = document.getElementById('repairProgressNotes').value.trim();
  const patch = {progress_notes: progress_notes||null};
  if(progress_notes && job && (job.job_status==='Approved - To Do' || job.job_status==='Approved - Awaiting Scaffold')){
    patch.job_status = 'In Progress';
  }
  saveRepairJobField(jobId, patch);
  if(job && job.site_id) notifyPmOfRepairJobUpdate(jobId, job.site_id, 'progress', progress_notes);
};
window.setRepairJobWorksCompleted = async function(jobId, checked){
  const job = repairJobDetailCurrent;
  const patch = {works_completed: checked};
  // #(works-complete-requires-notes-and-photo) 2026-09-30 — mirrors the same
  // compulsory-evidence rule already in place for marking a survey complete
  // (see setRepairJobSurveyStatus): completion notes and at least one
  // completion photo must be on the job before an operative can tick "works
  // completed". Reads the notes textarea live so a typed-but-not-yet-saved
  // note still counts, and saves it in the same patch below so ticking the
  // box is enough once both requirements are actually met. Ticking the box
  // reverts to unchecked on failure since it's a checkbox onchange, not a
  // button — render() redraws it from the (unchanged) job row.
  if(checked){
    const notesInput = document.getElementById('repairWorksNotes');
    const notesText = (notesInput ? notesInput.value : (job && job.works_notes) || '').trim();
    if(!notesText){ toast('Add completion notes before marking the works complete.'); render(); return; }
    const photoRows = await dbSelect('repair_job_photos', 'repair_job_id=eq.'+jobId+'&category=eq.completion&select=id&limit=1');
    if(!photoRows.length){ toast('Add at least one completion photo before marking the works complete.'); render(); return; }
    patch.works_notes = notesText;
  }
  if(checked && job && !job.works_completed_date) patch.works_completed_date = new Date().toISOString();
  const effectiveDate = checked ? (patch.works_completed_date || (job && job.works_completed_date) || null) : null;
  const completionDateOnly = effectiveDate ? effectiveDate.slice(0,10) : null;
  const addressLabel = (job && job.address) || 'Repair Job';
  patch.works_completed_event_id = await syncRepairCalendarEvent(ME.org_id, job && job.site_id, job && job.works_completed_event_id, completionDateOnly, 'Job Completed: '+addressLabel, []);
  // Marking works complete hands the job to the PM for sign-off — it does
  // NOT close it. Un-ticking sends it back to In Progress (unless it's
  // already been fully closed, which has its own separate reopen flow).
  if(job && !job.closed) patch.job_status = checked ? 'Awaiting Sign-off' : 'In Progress';
  saveRepairJobField(jobId, patch);
  // Push the Completed Works Report to OneDrive the moment the job is
  // actually marked complete — same best-effort/silent pattern as the
  // Survey Report export.
  if(checked) scheduleRepairJobReportExport(jobId,'completion');
};
window.saveRepairJobCompletionNotes = function(jobId){
  const job = repairJobDetailCurrent;
  const works_notes = document.getElementById('repairWorksNotes').value.trim();
  saveRepairJobField(jobId, {works_notes: works_notes||null});
  if(job && job.site_id) notifyPmOfRepairJobUpdate(jobId, job.site_id, 'completion', works_notes);
  // If works are already marked complete, an edit to the notes here should
  // be reflected in the exported Completed Works Report too, not just the app.
  if(job && job.works_completed) scheduleRepairJobReportExport(jobId,'completion');
};
window.saveRepairJobPricedSchedule = function(jobId){
  const v = document.getElementById('repairPricedSchedule').value.trim();
  saveRepairJobField(jobId, {priced_schedule_of_works: v||null});
};
window.setRepairJobClosed = async function(jobId, checked){
  if(checked){
    const yes = await customConfirm("Confirm sign-off and close this job? It will drop off the operative's list.");
    if(!yes){ render(); return; }
  }
  saveRepairJobField(jobId, checked
    ? {closed:true, closed_by:ME.id, closed_at:new Date().toISOString(), job_status:'Closed'}
    : {closed:false, closed_by:null, closed_at:null, job_status:'Awaiting Sign-off'});
};
// PM/Admin only (matches the DB's "pm delete" RLS policy on repair_jobs).
// Unlike closing a job, this is permanent — the row and its photo records
// (repair_job_photos cascades off repair_jobs) are gone. Best-effort
// cleans up the underlying storage objects (photos + work order) too, but
// that's opportunistic — a stray orphaned file in storage is harmless and
// never blocks the actual delete, which is what the user is waiting on.
window.deleteRepairJob = async function(jobId, siteId){
  const yes = await customConfirm('Permanently delete this job and all its photos? This cannot be undone.');
  if(!yes) return;
  const job = repairJobDetailCurrent;
  const photos = await dbSelect('repair_job_photos', 'repair_job_id=eq.'+jobId+'&select=storage_path');
  const done = await dbDelete('repair_jobs', jobId);
  if(!done){ toast('Could not delete — try again.'); return; }
  (photos||[]).forEach(p=>{ if(p.storage_path) sbFetch('/storage/v1/object/site-photos/'+p.storage_path, {method:'DELETE'}).catch(()=>{}); });
  if(job && job.work_order_path) sbFetch('/storage/v1/object/site-photos/'+job.work_order_path, {method:'DELETE'}).catch(()=>{});
  toast('Job deleted');
  go('#/site/'+siteId+'/repairjobs');
};

async function loadPMList(){
  await loadAllProfiles();
  // Company admins act as project managers too (they have full PM-level
  // access to every site already), so they're valid choices for "responsible
  // project manager" on a job, not just accounts with the literal 'pm' role.
  return Object.values(PROFILES).filter(p=>p.role==='pm' || p.role==='admin').sort((a,b)=>a.name.localeCompare(b.name));
}
window.setResponsiblePM = async function(siteId, pmId){
  const row = await dbUpdate('sites', siteId, {responsible_pm_id: pmId || null});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    SITES[idx] = row;
    toast('Responsible project manager updated');
    if(pmId) notifySiteAssignment(siteId, pmId);
  }
  render();
};
async function unreadCountForSite(siteId){
  return unreadCountForSiteForUser(siteId, ME.id, isManager(ME) ? 'managers' : 'operatives');
}
// Same query unreadCountForSite runs, but parameterised on WHO's read
// receipts to check — needed so an admin can view a specific PM's own
// Notifications (see computeNotificationRows) without it silently reading
// as the viewing admin's own unread state instead.
async function unreadCountForSiteForUser(siteId, userId, audience){
  // Company-wide (no site) messages only count towards a SITE's badge for
  // operatives, whose site Inbox actually lists them. For managers the site
  // Messages page lists that site's messages only — so a no-site message
  // such as a driver's "vehicle checklist failed item" notice used to sit
  // on every site's badge for ever, with nowhere on that page to read it.
  // (Managers still see those in HUB.) parent_id=is.null: replies aren't
  // listed as their own rows either.
  const siteFilter = audience==='managers' ? `site_id=eq.${siteId}` : `or=(site_id.eq.${siteId},site_id.is.null)`;
  const msgs = await dbSelect('messages', `audience=eq.${audience}&${siteFilter}&sender_id=neq.${userId}&select=id`);
  if(!msgs.length) return 0;
  const ids = msgs.map(m=>m.id);
  const reads = await dbSelect('message_reads', `user_id=eq.${userId}&message_id=in.(${ids.join(',')})&select=message_id`);
  const readSet = new Set(reads.map(r=>r.message_id));
  return msgs.filter(m=>!readSet.has(m.id)).length;
}
// Non-blocking unread-badge refresh. The router used to `await unreadCountForSite`
// on every single site-scoped page transition, which forced 2 sequential DB
// round-trips (messages, then message_reads) before ANY page could render —
// the main cause of "20-30 seconds to open a site" on weak mobile signal.
// Now: show the cached count instantly (or 0 first time), then fetch in the
// background and only re-render if the count changed and the user hasn't
// already navigated away.
function refreshUnreadBadge(siteId){
  const cached = unreadMsgsCache[siteId];
  const fresh = cached && (Date.now() - cached.at) < UNREAD_MSGS_TTL_MS;
  currentUnreadMsgs = fresh ? cached.count : (cached ? cached.count : 0);
  if(fresh) return;
  const hashAtRequest = location.hash;
  unreadCountForSite(siteId).then(count=>{
    unreadMsgsCache[siteId] = {count, at: Date.now()};
    if(location.hash !== hashAtRequest) return; // navigated away already — don't clobber the new page's state
    if(count !== currentUnreadMsgs){
      currentUnreadMsgs = count;
      render();
    }
  }).catch(()=>{});
}