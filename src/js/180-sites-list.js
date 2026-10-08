/* ================= SITES LIST ================= */
// Everything (org theme/package, team, sites, responsible PMs, etc.) is
// loaded once at sign-in and only patched locally when an action on this
// device changes it — so a change made by someone else in Admin Centre
// doesn't show up here until this device re-fetches it. This gives
// operatives/PMs a manual "pull the latest" button rather than waiting on
// their next full sign-in.
let refreshingAppData = false;
window.refreshAppData = async function(){
  if(refreshingAppData) return;
  addSiteFormOpen = false; newSiteStatus = null; newSiteNameDraft=''; newSiteAddrDraft=''; newSitePostcodeDraft=''; newSiteJobNumberDraft=''; newSiteStartDateDraft=''; newSiteMultiSiteDraft=false; newSiteRepairContractDraft=false; newSiteClientNameDraft=''; newSiteClientPhoneDraft=''; newSiteClientEmailDraft=''; // close the collapsed add-site form back up on refresh
  refreshingAppData = true; render();
  await loadProfile();
  let refreshedOk = false;
  if(ME){
    const [, , sitesRes] = await Promise.all([
      loadOrg(),
      loadAllProfiles(true),
      dbSelectChecked('sites', 'select=*&order=created_at.asc'),
    ]);
    // A failed fetch must not blank the project list — only replace it with
    // a real answer from the server.
    if(sitesRes.ok){ SITES = sitesRes.data; refreshedOk = true; saveBootSnapshot(); }
    homeExtras.at = 0;
  }
  refreshingAppData = false;
  toast(refreshedOk ? 'Up to date' : 'Could not refresh — check your connection.');
  render();
};
function fullSiteAddress(s){
  if(!s) return null;
  return [s.address, s.postcode].map(v=>(v||'').trim()).filter(Boolean).join(', ') || null;
}
const SITE_STATUS_LABEL = {live:'Active', upcoming:'Upcoming', closed:'Closed'};
// Site list status badge shows a symbol instead of the text label for
// Active/Upcoming (same badge colour/shade as before — see .status.live /
// .status.upcoming CSS) — currently Active='✓' tick, Upcoming='🕐' clock.
// Closed keeps its text label. Swap these two values here if the mapping
// ever needs reversing.
const SITE_STATUS_ICON = {live:'✓', upcoming:'🕐'};
// Some sites in the database ended up with status='live' literally instead
// of 'active' (an old naming inconsistency) — both mean the same thing
// ("currently live/active project") and must be treated identically
// everywhere. This was previously only handled in siteCardHtml/renderSites;
// the Dashboard had its own strict `s.status==='active'` check that silently
// dropped every 'live'-status site from every dashboard figure (RAMS/COSHH
// outstanding, snags, schedule %, live project count) — this shared helper
// fixes that by being the one place status is interpreted.
function siteStatusKey(s){ return (s.status==='active' || s.status==='live') ? 'live' : (SITE_STATUS_LABEL[s.status] ? s.status : 'upcoming'); }
function siteCardHtml(s, canAdd, pmOptions){
  const statusKey = siteStatusKey(s);
  const pmLocked = !!s.responsible_pm_id;
  const canChangePm = ME.role==='admin' || ME.role==='superadmin';
  const canSetPm = canAdd && (!pmLocked || canChangePm);
  const pmInitials = pmLocked ? (nameOf(s.responsible_pm_id)||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '–';
  const initials = s.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
  // Admin Centre lets a company choose what the tile itself shows — job
  // number and postcode both fall back to the initials when a site simply
  // doesn't have one set yet, rather than showing an empty tile.
  // The Site Tile Label picker has been removed from Admin Centre — every
  // company's tiles show the job number now, regardless of any preference
  // stored from when the picker still existed.
  const tileMode = 'jobnumber';
  const swatchText = tileMode==='jobnumber' ? (s.job_number || initials)
    : tileMode==='postcode' ? (s.postcode || initials)
    : initials;
  // Long job numbers/postcodes won't fit the fixed-size tile at the normal
  // initials font size — shrink proportionally to length instead of
  // truncating or overflowing.
  const swatchFontSize = swatchText.length<=3 ? 13.5 : swatchText.length<=5 ? 9.9 : swatchText.length<=7 ? 8.1 : 6.75;
  // The status/PM dropdowns are absolutely positioned and spill down over
  // the next row in the list — without an elevated stacking context here,
  // a tap on the dropdown (e.g. "Delete permanently") could land on the
  // row underneath instead, since neither row otherwise sets a z-index.
  // Only the row whose dropdown is actually open gets bumped, so this
  // never affects normal layout/stacking anywhere else in the list.
  const menuOpenHere = canAdd && (siteStatusMenuOpenId===s.id || sitePmPickerOpenId===s.id);
  return `
    <div class="sitecard" style="${menuOpenHere?'position:relative;z-index:70;':''}" onclick="go('#/site/${s.id}/home')">
      <div class="swatch" style="font-size:${swatchFontSize}px;">${escapeHtml(swatchText)}</div>
      <div class="info">
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="addr" style="${s.client_name ? '' : 'white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;'}">${escapeHtml(fullSiteAddress(s)||'—')}</div>
        ${s.client_name ? `<div class="addr" style="font-weight:500;color:var(--slate);">${escapeHtml(s.client_name)}</div>` : ''}
      </div>
      ${statusKey==='upcoming' && s.start_date ? `<span class="stub" style="margin-left:4px;margin-right:2px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:92px;flex:0 1 auto;${canAdd?'text-decoration:underline;cursor:pointer;':''}" title="${canAdd?'Tap to change start date':''}" ${canAdd?`onclick="event.stopPropagation();changeSiteStartDate('${s.id}','${s.start_date}')"`:''}>Starts ${new Date(s.start_date+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</span>` : (statusKey==='upcoming' && canAdd ? `<span class="stub" style="margin-left:4px;margin-right:2px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:92px;flex:0 1 auto;text-decoration:underline;cursor:pointer;" onclick="event.stopPropagation();changeSiteStartDate('${s.id}','')">Set start date</span>` : '')}
      ${canAdd ? `
        <span class="rolechip" title="${pmLocked?'Responsible PM: '+escapeHtml(nameOf(s.responsible_pm_id))+(canChangePm?' — tap to change':''):'No project manager assigned yet — tap to choose (locks once set)'}"
          style="margin-left:4px;width:24px;height:16.8px;flex:0 0 24px;font-size:7.96px;font-weight:400;letter-spacing:normal;text-align:center;justify-content:center;${pmLocked?'background:var(--brand1);color:#fff;':'background:var(--line);color:var(--slate);'}${canSetPm?'cursor:pointer;':''}"
          onclick="event.stopPropagation();${canSetPm?`openPmPicker('${s.id}')`:''}">${pmInitials}</span>
      ` : (pmLocked ? `<span class="rolechip" style="margin-left:4px;width:24px;height:16.8px;flex:0 0 24px;font-size:7.96px;font-weight:400;letter-spacing:normal;text-align:center;justify-content:center;background:var(--brand1);color:#fff;" title="Responsible PM: ${escapeHtml(nameOf(s.responsible_pm_id))}">${pmInitials}</span>` : '')}
      <span class="status ${statusKey}" title="${SITE_STATUS_LABEL[statusKey]}" ${canAdd?`style="cursor:pointer;" onclick="event.stopPropagation();toggleSiteStatusMenu('${s.id}')"`:''}>${SITE_STATUS_ICON[statusKey] || SITE_STATUS_LABEL[statusKey]}${canAdd?' ▾':''}</span>
      ${canAdd && siteStatusMenuOpenId===s.id ? `
        <div class="statusmenu" onclick="event.stopPropagation()">
          ${statusKey!=='live' ? `<div class="statusmenu-item" onclick="setSiteStatus('${s.id}','live')">Set Active</div>` : ''}
          ${statusKey!=='upcoming' ? `<div class="statusmenu-item" onclick="setSiteStatus('${s.id}','upcoming')">Set Upcoming</div>` : ''}
          ${statusKey!=='closed' ? `<div class="statusmenu-item" onclick="setSiteStatus('${s.id}','closed')">Close</div>` : ''}
          <div class="statusmenu-item danger" onclick="deleteSite('${s.id}','${jsAttr(s.name)}')">${(ME.role==='admin'||ME.role==='superadmin') ? 'Delete permanently' : 'Delete'}</div>
        </div>
      ` : ''}
      ${canSetPm && sitePmPickerOpenId===s.id ? `
        <div class="statusmenu" onclick="event.stopPropagation()">
          ${pmOptions.length ? pmOptions.map(p=>`<div class="statusmenu-item" onclick="confirmSetResponsiblePm('${s.id}','${p.id}','${jsAttr(p.name)}')">${escapeHtml(p.name)}${p.role==='admin'?' (Admin)':''}</div>`).join('') : `<div class="statusmenu-item" style="cursor:default;color:var(--slate);">No project managers yet</div>`}
        </div>
      ` : ''}
    </div>
  `;
}
let siteFilterPmIds = []; // multi-select — empty = all PMs
let pmFilterOpen = false;
let addSiteFormOpen = false;
let newSiteStatus = null; // 'active' | 'upcoming' — must be explicitly chosen, no silent default
// The name/address/postcode inputs used to be plain uncontrolled DOM fields —
// fine while nothing else re-rendered, but clicking Active/Upcoming calls
// render() (to restyle the buttons), which replaces #app's innerHTML and
// silently wiped out anything already typed. These drafts are kept in state
// and fed back in as each input's value= so typed text survives any render().
let newSiteNameDraft = '';
let newSiteAddrDraft = '';
let newSitePostcodeDraft = '';
let newSiteJobNumberDraft = '';
let newSiteStartDateDraft = '';
let newSiteMultiSiteDraft = false;
let newSiteRepairContractDraft = false;
let newSiteClientNameDraft = '';
let newSiteClientPhoneDraft = '';
let newSiteClientEmailDraft = '';
let siteStatusMenuOpenId = null;
let sitePmPickerOpenId = null;
// upcoming:null means "no explicit user choice yet" — renderSites resolves
// it once (open if there are upcoming jobs, closed if there aren't) the
// first time it's computed, then leaves it alone so the user's own
// toggling takes over from there.
let siteSectionOpen = {live:true, upcoming:null, closed:false};
window.toggleSiteStatusMenu = function(siteId){
  siteStatusMenuOpenId = siteStatusMenuOpenId===siteId ? null : siteId;
  sitePmPickerOpenId = null;
  render();
};
window.openPmPicker = function(siteId){
  sitePmPickerOpenId = sitePmPickerOpenId===siteId ? null : siteId;
  siteStatusMenuOpenId = null;
  render();
};
window.confirmSetResponsiblePm = async function(siteId, pmId, pmName){
  sitePmPickerOpenId = null;
  if(!await customConfirm(`Set ${pmName} as the responsible project manager for this site? A project manager can only be selected once — are you sure?`)){ render(); return; }
  await setResponsiblePM(siteId, pmId);
};
window.setSiteStatus = async function(siteId, status){
  siteStatusMenuOpenId = null;
  // Stamp who/when a site was closed; clear the stamp if it's reopened
  // (moved back to active/upcoming) so a re-closed job records the latest
  // closer rather than showing stale info from a previous closure.
  const patch = status==='closed'
    ? {status, closed_at:new Date().toISOString(), closed_by:ME.id}
    : {status, closed_at:null, closed_by:null};
  const row = await dbUpdate('sites', siteId, patch);
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast('Status updated');
    // Closing a site should stop any repeating calendar series dead —
    // sweep away recurring key-date instances still dated after the
    // closure so they don't linger on the calendar (one-off, non-recurring
    // events are left alone; only rows tagged with a recurrence group and
    // dated beyond today are removed).
    if(status==='closed'){
      const todayStr = localISODate(new Date());
      try{ await sbFetch('/rest/v1/site_calendar_events?site_id=eq.'+siteId+'&recurrence_group_id=not.is.null&event_date=gt.'+todayStr, {method:'DELETE'}); }catch(e){ /* non-fatal */ }
    }
  }
  render();
};
window.toggleSiteSection = function(key){ siteSectionOpen[key] = !siteSectionOpen[key]; render(); };
window.goSitesSection = function(key){ siteSectionOpen[key] = true; go('#/sites'); };
async function renderSites(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  // Creating/deleting sites and the PM-filtered sectioned view stay true
  // PM/Admin only — a Site Manager sees the same site list as an operative,
  // scoped to whichever sites they've been assigned to (see isFullManager).
  const canAdd = isFullManager(ME);
  await loadAllProfiles(); // so nameOf() can resolve each site's responsible_pm_id for the initials badge
  const pmOptions = Object.values(PROFILES).filter(p=>p.role==='pm'||p.role==='admin').sort((a,b)=>a.name.localeCompare(b.name));
  const filtered = (canAdd && siteFilterPmIds.length) ? SITES.filter(s=>siteFilterPmIds.includes(s.responsible_pm_id)) : SITES;
  const statusOf = siteStatusKey;
  // Live jobs: alphabetical by site name, with the demo site ("Andy's House")
  // permanently pinned to the top regardless of alphabetical order — remove
  // this special-case once the demo site itself is deleted.
  const isDemoSite = s => /andy'?s house/i.test(s.name||'');
  const alphaSort = (a,b) => (a.name||'').localeCompare(b.name||'', undefined, {sensitivity:'base'});
  const liveSites = filtered.filter(s=>statusOf(s)==='live').sort((a,b)=>{
    const ad = isDemoSite(a), bd = isDemoSite(b);
    if(ad && !bd) return -1;
    if(bd && !ad) return 1;
    return alphaSort(a,b);
  });
  const upcomingSites = filtered.filter(s=>statusOf(s)==='upcoming');
  const closedSites = filtered.filter(s=>statusOf(s)==='closed');
  if(siteSectionOpen.upcoming===null) siteSectionOpen.upcoming = upcomingSites.length>0;
  // The Getting Started card and the HUB/Outstanding badge take a dozen or
  // so requests to work out. They used to be awaited BEFORE anything was
  // drawn, on every visit to this page; now the page paints straight away
  // with the last known values and refreshHomeExtras() (called once it's on
  // screen) updates them in the background, redrawing only if they changed.
  if(homeExtras.uid !== ME.id) homeExtras = {uid: ME.id, onboarding: null, count: 0, at: 0, loading: false};
  if(navigator.onLine === false) OFFLINE_CACHE_USED = true; // this page is drawn from the saved snapshot — show the "Offline — showing saved data" banner
  const onboarding = homeExtras.onboarding;
  const myOutstandingCount = homeExtras.count;
  const siteSection = (key, label, list, isFirst) => canAdd ? `
      <div id="sitesection-${key}" class="ddrow" style="margin-top:${isFirst?'0':'18px'};scroll-margin-top:14px;" onclick="toggleSiteSection('${key}')">
        <span class="arrow">${siteSectionOpen[key]?'▼':'▶'}</span> ${label} (${list.length})
      </div>
      ${siteSectionOpen[key] ? `<div style="margin-top:10px;">${list.map(s=>siteCardHtml(s,canAdd,pmOptions)).join('') || `<div class="empty">No ${label.toLowerCase()}.</div>`}</div>` : ''}
    ` : '';
  if(__gen === RENDER_GEN){ app.innerHTML = shell(`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <p class="sectiontitle" style="margin:4px 0 10px;">Your Projects</p>
      <div style="display:flex;align-items:center;gap:8px;">
      ${canAdd && pmOptions.length ? `
        <div style="position:relative;margin-top:-9px;" data-pmfilter-root>
          <button type="button" onclick="event.stopPropagation();togglePmFilterOpen()" title="Filter by project manager" style="width:auto;flex:none;min-width:96px;padding:4px 10px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:20px;border:1px solid var(--line);background:${siteFilterPmIds.length?'var(--brand1)':'#fff'};color:${siteFilterPmIds.length?'#fff':'var(--slate)'};cursor:pointer;">
            ${siteFilterPmIds.length ? (siteFilterPmIds.length===1 ? escapeHtml((nameOf(siteFilterPmIds[0])||'1 selected')) : siteFilterPmIds.length+' selected') : 'Select PM'} ${pmFilterOpen?'▲':'▼'}
          </button>
          ${pmFilterOpen ? `
            <div style="position:absolute;right:0;top:calc(100% + 6px);z-index:50;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.18);padding:8px;min-width:170px;">
              ${pmOptions.map(p=>`
                <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:12.5px;font-weight:600;text-transform:none;letter-spacing:normal;color:var(--ink);cursor:pointer;">
                  <input type="checkbox" ${siteFilterPmIds.includes(p.id)?'checked':''} onchange="togglePmFilterId('${p.id}')">
                  ${escapeHtml(p.name)}
                </label>
              `).join('')}
              ${siteFilterPmIds.length ? `<div style="border-top:1px solid var(--line);margin-top:4px;padding-top:6px;text-align:center;"><span style="font-size:11.5px;color:var(--brand1);cursor:pointer;text-decoration:underline;" onclick="setSiteFilterPm([])">Clear</span></div>` : ''}
            </div>
          ` : ''}
        </div>
      ` : ''}
      </div>
    </div>
    ${onboarding && !onboarding.allDone ? `
      <div class="card" style="margin-bottom:16px;cursor:pointer;border-color:var(--warn);background:var(--warn-bg);" onclick="go('#/onboarding-checklist')">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-weight:800;font-size:13.5px;color:var(--warn);">Getting Started</div>
            <div class="stub" style="margin:2px 0 0;">${onboarding.items.filter(i=>i.done).length} of ${onboarding.items.length} steps done — tap to finish</div>
          </div>
          <span style="font-size:20px;color:var(--warn);">›</span>
        </div>
      </div>
    ` : ''}
    ${canAdd && addSiteFormOpen ? `
      <div class="card" style="margin-bottom:20px;background:var(--paper);">
        <p class="sectiontitle" style="margin-top:0;">Add a Project</p>
        <div class="formfield"><input type="text" id="newSiteName" placeholder="Site name" value="${escapeHtml(newSiteNameDraft)}" oninput="applyTitleCase(this);newSiteNameDraft=this.value"></div>
        <div class="formfield"><input type="text" id="newSiteAddr" placeholder="Address" value="${escapeHtml(newSiteAddrDraft)}" oninput="applyTitleCase(this);newSiteAddrDraft=this.value"></div>
        <div class="formfield"><input type="text" id="newSitePostcode" placeholder="Postcode" value="${escapeHtml(newSitePostcodeDraft)}" oninput="applyUpperCase(this);newSitePostcodeDraft=this.value"></div>
        <div class="formfield"><input type="text" id="newSiteJobNumber" placeholder="Job number" value="${escapeHtml(newSiteJobNumberDraft)}" oninput="newSiteJobNumberDraft=this.value"></div>
        <p class="field-label" style="margin-bottom:6px;">Client (optional)</p>
        <div class="formfield"><input type="text" id="newSiteClientName" placeholder="Client name" value="${escapeHtml(newSiteClientNameDraft)}" oninput="applyTitleCase(this);newSiteClientNameDraft=this.value"></div>
        <div class="formfield"><input type="tel" id="newSiteClientPhone" placeholder="Client contact number" value="${escapeHtml(newSiteClientPhoneDraft)}" oninput="newSiteClientPhoneDraft=this.value"></div>
        <div class="formfield"><input type="email" id="newSiteClientEmail" placeholder="Client contact email" value="${escapeHtml(newSiteClientEmailDraft)}" oninput="newSiteClientEmailDraft=this.value"></div>
        <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 10px;"><input type="checkbox" id="newSiteMultiSite" style="width:auto;" ${newSiteMultiSiteDraft?'checked':''} ${newSiteRepairContractDraft?'disabled':''} onchange="newSiteMultiSiteDraft=this.checked">Multi-site (several separate addresses under one job — addresses are added once the project's created)</label>
        <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 14px;"><input type="checkbox" id="newSiteRepairContract" style="width:auto;" ${newSiteRepairContractDraft?'checked':''} ${newSiteMultiSiteDraft?'disabled':''} onchange="newSiteRepairContractDraft=this.checked">Maintenance / Repair Contract (a running list of individual repair jobs/addresses, each tracked through survey → approval → completion)</label>
        <p class="field-label" style="margin-bottom:6px;">Status</p>
        <div class="row-gap" style="margin-bottom:14px;">
          <button type="button" class="${newSiteStatus==='active'?'darkbtn':'ghostbtn'}" style="flex:1;" onclick="newSiteStatus='active';render()">Active</button>
          <button type="button" class="${newSiteStatus==='upcoming'?'darkbtn':'ghostbtn'}" style="flex:1;" onclick="newSiteStatus='upcoming';render()">Upcoming</button>
        </div>
        ${newSiteStatus==='upcoming' ? `
          <p class="field-label" style="margin-bottom:6px;">Start date</p>
          <div class="formfield" onclick="openDatePickerRow(this)" style="min-width:0;max-width:100%;"><input type="date" id="newSiteStartDate" value="${escapeHtml(newSiteStartDateDraft)}" oninput="newSiteStartDateDraft=this.value" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;"></div>
        ` : ''}
        <div style="display:flex;gap:8px;">
          <button class="darkbtn" style="flex:1;" onclick="addSite()">Create Project</button>
          <button class="ghostbtn" style="width:auto;padding:10px 16px;" onclick="toggleAddSiteForm()">Cancel</button>
        </div>
      </div>
    ` : ''}
    ${canAdd ? `
      ${siteSection('live','Live Projects',liveSites,true)}
      ${siteSection('upcoming','Upcoming Projects',upcomingSites)}
      ${siteSection('closed','Closed Projects',closedSites)}
    ` : `
      ${filtered.filter(s=>statusOf(s)!=='closed').map(s=>siteCardHtml(s,canAdd,pmOptions)).join('') || `<div class="empty">No active sites.</div>`}
    `}
    ${canAdd ? `
      <div class="sitecard" style="cursor:pointer;margin-top:16px;" onclick="generalReportsBackHash='#/sites';go('#/general-reports')">
        <div style="font-size:22px;flex:0 0 auto;">📋</div>
        <div class="info"><div class="name">Inspections &amp; Reports</div></div>
        <div style="color:var(--slate);font-size:20px;">›</div>
      </div>
    ` : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:20px;">
      <span class="stub" style="margin:0;text-align:left;">${escapeHtml(ME.name)}</span>
      <span class="stub" style="margin:0;text-align:center;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(ME.email)}</span>
      <span class="stub" style="margin:0;text-align:right;flex:0 0 auto;">${escapeHtml(personRoleLabel(ME))}</span>
    </div>
    <div style="text-align:center;margin-top:8px;">
      <span class="stub" style="margin:0;color:var(--warn);cursor:pointer;text-decoration:underline;" onclick="doSignOut()">Sign out</span>
    </div>
  `, {homeBar:true, homeBarCanAdd:canAdd, homeBarOutstanding:myOutstandingCount, centerHeader:true, showRefresh:true});
    if(appSearchOpen) appSearchRender(); }
  refreshHomeExtras();
  if(pendingSiteScrollSection){
    const key = pendingSiteScrollSection; pendingSiteScrollSection = null;
    const el = document.getElementById('sitesection-'+key);
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }
}
// Jumps into Your Projects with a given section (upcoming/closed) forced
// open and scrolled to — used by the Dashboard's Upcoming/Closed stat cards,
// which previously called a goSitesSection() that didn't exist, so tapping
// them silently did nothing and just left you on the dashboard/home.
let pendingSiteScrollSection = null;
window.goSitesSection = function(key){
  siteSectionOpen[key] = true;
  pendingSiteScrollSection = key;
  go('#/sites');
};
window.setSiteFilterPm = function(pmIds){ siteFilterPmIds = pmIds || []; render(); };
window.togglePmFilterOpen = function(){ pmFilterOpen = !pmFilterOpen; render(); };
window.togglePmFilterId = function(id){
  siteFilterPmIds = siteFilterPmIds.includes(id) ? siteFilterPmIds.filter(x=>x!==id) : [...siteFilterPmIds, id];
  render();
};
window.toggleAddSiteForm = function(){ addSiteFormOpen = !addSiteFormOpen; newSiteStatus = null; newSiteNameDraft=''; newSiteAddrDraft=''; newSitePostcodeDraft=''; newSiteJobNumberDraft=''; newSiteStartDateDraft=''; newSiteMultiSiteDraft=false; newSiteRepairContractDraft=false; newSiteClientNameDraft=''; newSiteClientPhoneDraft=''; newSiteClientEmailDraft=''; render(); };
window.addSite = async function(){
  const name = document.getElementById('newSiteName').value.trim();
  const addr = document.getElementById('newSiteAddr').value.trim();
  const postcode = document.getElementById('newSitePostcode').value.trim();
  const jobNumber = document.getElementById('newSiteJobNumber').value.trim();
  const clientName = document.getElementById('newSiteClientName').value.trim();
  const clientPhone = document.getElementById('newSiteClientPhone').value.trim();
  const clientEmail = document.getElementById('newSiteClientEmail').value.trim();
  const startDate = newSiteStatus==='upcoming' ? (document.getElementById('newSiteStartDate')?.value || '') : '';
  if(!name){ toast('Enter a site name.'); return; }
  if(!jobNumber){ toast('Enter a job number.'); return; }
  if(!newSiteStatus){ toast('Choose whether this site is Active or Upcoming.'); return; }
  if(clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)){ toast('Enter a valid client email address.'); return; }
  // Deliberately not asking PostgREST for the row back here (no
  // Prefer: return=representation) — Postgres has a known quirk where a
  // table's own SELECT policy, if it re-queries that same table (as sites'
  // does via has_site_access()), can't reliably see a row that's still
  // mid-insert within the same statement, which makes any "insert and
  // return the new row" call get rejected even though the insert itself
  // is fully allowed. Inserting plain, then re-fetching the list, sidesteps
  // it without weakening the security policy.
  const res = await sbFetch('/rest/v1/sites', {method:'POST', body: JSON.stringify({name, address:addr||null, postcode:postcode||null, job_number:jobNumber||null, status:newSiteStatus, start_date:startDate||null, multi_site:!!newSiteMultiSiteDraft, repair_contract:!!newSiteRepairContractDraft, client_name:clientName||null, client_phone:clientPhone||null, client_email:clientEmail||null, created_by:ME.id, org_id:ME.org_id})});
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return; }
  newSiteStatus = null;
  newSiteNameDraft = ''; newSiteAddrDraft = ''; newSitePostcodeDraft = ''; newSiteJobNumberDraft = ''; newSiteStartDateDraft = ''; newSiteMultiSiteDraft = false; newSiteRepairContractDraft = false; newSiteClientNameDraft = ''; newSiteClientPhoneDraft = ''; newSiteClientEmailDraft = '';
  SITES = await dbSelect('sites', 'select=*&order=created_at.asc');
  const newSite = SITES.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
  await preloadTbtBankForSite(newSite);
  await preloadDrawingFoldersForSite(newSite);
  addSiteFormOpen = false;
  toast('Site created');
  render();
};
// Every new site gets its top-level structure preset — a "Drawings &
// Specification" folder (itself holding the two preset "Drawings" and
// "Specification" sub-folders) sitting alongside a sibling "Programme"
// folder, so PMs don't have to set any of this up by hand. Mirrors the
// one-off migration that reorganised existing sites the same way when the
// Programme tile was introduced — see ensureMcProgrammeFolderId just below
// for the equivalent, lazily-created "Programme" folder used by the Main
// Contractor tab (a separate root folder, since a site's own programme and
// its Main Contractor's programme can genuinely differ).
async function preloadDrawingFoldersForSite(site){
  if(!site) return;
  try{
    // Used to be a "Drawings & Specification" wrapper folder containing
    // "Drawings" and "Specification" as its two children — one level of
    // nesting too many for what people actually wanted to see. Flattened
    // (per Andy) to three plain top-level folders instead.
    await dbInsert('drawing_folders', [
      {site_id:site.id, parent_id:null, name:'Drawings', position:0, created_by:ME.id},
      {site_id:site.id, parent_id:null, name:'Specification', position:1, created_by:ME.id},
      {site_id:site.id, parent_id:null, name:'Programme', position:2, created_by:ME.id},
    ]);
  }catch(e){ console.error('Could not preload drawing folders for new site', e); }
}
// The Main Contractor tab's own "Programme" tile — a separate root
// drawing_folders entry (distinct name, so it never collides with or gets
// listed alongside the site's general Drawings/Programme area) for
// whatever construction programme the acting Main Contractor is running,
// which can genuinely be a different document to the site's own. Created
// lazily on first visit rather than pre-seeded for every site, since only
// sites actually switched on as a Main Contractor ever show this tile.
async function ensureMcProgrammeFolderId(siteId){
  const existing = await dbSelect('drawing_folders', 'site_id=eq.'+siteId+'&parent_id=is.null&name=eq.Main Contractor Programme&select=id');
  if(existing && existing[0]) return existing[0].id;
  const rows = await dbInsert('drawing_folders', {site_id:siteId, parent_id:null, name:'Main Contractor Programme', position:99, created_by:ME.id});
  return rows && rows[0] ? rows[0].id : null;
}
// Pre-loads every company-wide Toolbox Talk template into this new site's
// Bank TBT, so standard talks are already there without a PM re-uploading
// them on every job.
async function preloadTbtBankForSite(site){
  if(!site) return;
  try{
    const templates = await dbSelect('tbt_templates', 'org_id=eq.'+ME.org_id);
    if(!templates.length) return;
    const rows = templates.map(t=>({site_id:site.id, org_id:ME.org_id, title:t.title, storage_path:t.storage_path, status:'bank', created_by:ME.id}));
    await dbInsert('toolbox_talks', rows);
  }catch(e){ console.error('Could not preload TBT bank for new site', e); }
}
// Pulls any Admin Centre TBT template into this site's Bank TBT that isn't
// there yet — matched on title+file so nothing duplicates. Covers sites
// created before a template existed (preloadTbtBankForSite only runs once,
// at site-creation time) and any template added to the library since.
let tbtSyncBusy = false;
window.syncTbtBankFromLibrary = async function(siteId){
  tbtSyncBusy = true; render();
  try{
    const [templates, existing] = await Promise.all([
      dbSelect('tbt_templates', 'org_id=eq.'+ME.org_id),
      dbSelect('toolbox_talks', 'site_id=eq.'+siteId+'&select=title,storage_path'),
    ]);
    const existingKeys = new Set(existing.map(t=>t.title+'|'+t.storage_path));
    const missing = templates.filter(t=>!existingKeys.has(t.title+'|'+t.storage_path));
    if(!missing.length){ toast('Bank TBT is already up to date with the library.'); }
    else{
      const rows = missing.map(t=>({site_id:siteId, org_id:ME.org_id, title:t.title, storage_path:t.storage_path, status:'bank', created_by:ME.id}));
      const inserted = await dbInsert('toolbox_talks', rows);
      toast(inserted ? `${missing.length} template${missing.length===1?'':'s'} added to Bank TBT` : 'Could not sync — try again.');
    }
  }catch(e){ console.error('TBT library sync failed', e); toast('Could not sync — try again.'); }
  tbtSyncBusy = false; render();
};
window.deleteSite = async function(siteId, name){
  siteStatusMenuOpenId = null;
  // #(pm-restricted-site-delete): a full hard delete is only safe once
  // nothing has been entered into the site yet (e.g. a PM catches a
  // mistyped address/job number right after creating it), or when an Admin
  // does it deliberately. A PM hitting Delete on a site that already has
  // real data gets it closed instead — same effect as the
  // Close action, hidden from non-managers, still visible to an Admin in
  // Closed Projects — so only an Admin can actually purge it for good.
  // site_is_empty() runs under the caller's own RLS (see migration), so
  // this can't be used to snoop on data the caller couldn't already see.
  if(ME.role!=='admin' && ME.role!=='superadmin'){
    let isEmpty = false; // fail closed: if the check errors, treat as non-empty
    try{
      const res = await sbFetch('/rest/v1/rpc/site_is_empty', {method:'POST', body: JSON.stringify({p_site_id: siteId})});
      if(res.ok) isEmpty = !!(await res.json());
    }catch(e){ /* isEmpty stays false */ }
    if(!isEmpty){
      if(!await customConfirm(`"${name}" already has data in it, so it can't be permanently deleted from here — this will close it instead (hidden from the team; an Admin can still delete it for good if needed). Continue?`)) return;
      await setSiteStatus(siteId, 'closed');
      return;
    }
  }
  if(!await customConfirm(`Delete "${name}"? This permanently removes the site along with its schedule, RAMS, snags, materials, variations and check-in history. This can't be undone.`)) return;
  const ok = await dbDelete('sites', siteId);
  if(ok){
    SITES = SITES.filter(s=>s.id!==siteId);
    toast('Site deleted');
  } else {
    toast('Could not delete — try again.');
  }
  // Deleting always happens from the sites list itself, so go('#/sites') was
  // a same-hash no-op — no hashchange event fires for that, and render() is
  // only ever wired up as a hashchange listener, so the screen never
  // reflected the deletion (or the closed dropdown) even though it had
  // already succeeded. Call render() directly instead of relying on go().
  render();
};
