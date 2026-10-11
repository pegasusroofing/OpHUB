/* ================= #(pm-home) PM / admin home + all-reports page ================= */
// Project managers and admins land on a home page of tiles (Live projects,
// Reports & surveys, HUB, Calendar, Deliveries, Admin, Dashboard) instead of
// straight on the project list, so the day's three jobs - running projects,
// paperwork, running the company - are kept apart. The project list is
// still #/sites; the home is #/home (and the default route for PMs/admins).
// Operatives, site managers and clients keep the project list as home.

// Line icons (stroke = currentColor) used by the bottom bars and the tiles,
// replacing the old emoji.
const OPH_ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  projects: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  reports: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  admin: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M10 2h4"/>',
};
function ophIcon(name, size, sw){
  const p = OPH_ICONS[name] || OPH_ICONS.list;
  const s = size || 22;
  return `<svg class="ophic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw||2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
function usesPmHome(u){ return !!u && isFullManager(u); }
function homeHash(){ return usesPmHome(ME) ? '#/home' : '#/sites'; }
// The bold header line / logo goes to the project list (Andy, 11 Oct) -
// the Home page is reached from the Home button on the Projects bottom bar.
window.goHome = function(){ go('#/sites'); };

// Report data for the home counts and the Reports page (one query, kept for
// 30s so moving between Home and Reports doesn't re-ask the server).
let pmReportsCache = {at:0, uid:null, rows:[]};
async function loadPmReports(force){
  if(!force && pmReportsCache.uid===ME.id && (Date.now()-pmReportsCache.at) < 30000) return pmReportsCache.rows;
  const [subs, tpls] = await Promise.all([
    dbSelect('report_submissions', 'org_id=eq.'+ME.org_id+'&select=id,site_id,template_id,template_name,general_label,status,submitted_at,submitted_by&order=submitted_at.desc&limit=300'),
    dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&select=id,is_daily_briefing,is_loler_inspection'),
  ]);
  // Daily briefings and LOLER inspections have their own homes (H&S) - leave them out here.
  const skip = new Set((tpls||[]).filter(t=>t.is_daily_briefing || t.is_loler_inspection).map(t=>t.id));
  const rows = (subs||[]).filter(s=>!skip.has(s.template_id));
  pmReportsCache = {at:Date.now(), uid:ME.id, rows};
  return rows;
}
function pmReportHref(r){
  const mode = r.status==='in_progress' ? 'fill' : 'view';
  return r.site_id ? `#/site/${r.site_id}/snagging/reports/${mode}/${r.id}` : `#/general-reports/${mode}/${r.id}`;
}
function pmReportWhere(r){
  if(r.site_id){ const s = SITES.find(x=>x.id===r.site_id); return s ? s.name : 'Project'; }
  return r.general_label || 'General survey';
}
window.openPmReport = function(id){
  const r = pmReportsCache.rows.find(x=>x.id===id); if(!r) return;
  if(!r.site_id) generalReportsBackHash = '#/reports';
  go(pmReportHref(r));
};

async function renderPmHome(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  if(homeExtras.uid !== ME.id) homeExtras = {uid: ME.id, onboarding: null, count: 0, at: 0, loading: false};
  if(navigator.onLine === false) OFFLINE_CACHE_USED = true;
  let reports = pmReportsCache.uid===ME.id ? pmReportsCache.rows : [];
  try{ reports = await loadPmReports(); }catch(e){}
  const live = SITES.filter(s=>siteStatusKey(s)==='live');
  const upcoming = SITES.filter(s=>siteStatusKey(s)==='upcoming');
  const open = reports.filter(r=>r.status==='in_progress');
  const mine = open.filter(r=>r.submitted_by===ME.id).slice(0,2);
  const hubCount = homeExtras.count || 0;
  const onboarding = homeExtras.onboarding;
  const now = new Date();
  const hr = now.getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const first = String(ME.name||'').trim().split(/\s+/)[0] || '';
  const dateTxt = now.toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});
  const stat = (n, lbl, onclick, hot) => `<button type="button" class="pmstat" onclick="${onclick}"><b${hot?' class="hot"':''}>${n}</b><span>${lbl}</span></button>`;
  const tile = (icon, tint, title, sub, onclick, badge) => `
    <button type="button" class="pmtile" onclick="${onclick}">
      <span class="pmtile-ic pmtint-${tint}">${ophIcon(icon, 21)}${badge?`<span class="badge-count pmtile-badge">${badge}</span>`:''}</span>
      <span class="pmtile-txt"><span class="pmtile-t">${title}</span><span class="pmtile-s">${sub}</span></span>
    </button>`;
  if(__gen !== RENDER_GEN) return;
  app.innerHTML = shell(`
    <div class="pmgreet">
      <div class="pmgreet-date">${escapeHtml(dateTxt)}</div>
      <div class="pmgreet-hi">${greet}${first ? ', '+escapeHtml(first) : ''}</div>
    </div>
    ${onboarding && !onboarding.allDone ? `
      <div class="card" style="margin-bottom:14px;cursor:pointer;border-color:var(--warn);background:var(--warn-bg);" onclick="go('#/onboarding-checklist')">
        <div style="font-weight:800;font-size:13.5px;color:var(--warn);">Getting Started</div>
        <div class="stub" style="margin:2px 0 0;">${onboarding.items.filter(i=>i.done).length} of ${onboarding.items.length} steps done — tap to finish</div>
      </div>` : ''}
    <div class="pmstats">
      ${stat(live.length, 'Live jobs', "go('#/sites')")}
      ${stat(open.length, 'Reports open', "go('#/reports')")}
      ${stat(hubCount, 'In HUB', "go('#/hub')", hubCount>0)}
      ${stat(upcoming.length, 'Upcoming', "goSitesSection('upcoming')")}
    </div>
    <button type="button" class="pmhero" onclick="go('#/sites')">
      <span class="pmhero-top"><span class="pmhero-ic">${ophIcon('projects', 22)}</span>${ophIcon('chevron', 22, 2.4)}</span>
      <span class="pmhero-t">Live projects</span>
      <span class="pmhero-s">${live.length} live${upcoming.length ? ' · '+upcoming.length+' upcoming' : ''}</span>
    </button>
    <div class="pmtiles pmtiles-home">
      ${tile('chart', 'teal', 'Dashboard', 'Company overview', "go('#/dashboard')")}
      ${tile('calendar', 'green', 'Calendar', 'All projects', "go('#/calendar')")}
      ${tile('bell', 'orange', 'HUB', 'Notifications &amp; messages', "go('#/hub')", hubCount)}
      ${tile('truck', 'purple', 'Deliveries', 'Delivery schedule', "deliveryScheduleBackHash='#/home';go('#/delivery')")}
      ${tile('reports', 'blue', 'Reports &amp; surveys', open.length ? open.length+' in progress' : 'All projects', "go('#/reports')")}
      ${tile('gear', 'grey', 'Admin', 'Team, libraries, settings', "go('#/team')")}
    </div>
    ${mine.length ? `
      <p class="sectiontitle" style="margin:18px 0 8px;">Pick up where you left off</p>
      ${mine.map(r=>`
        <button type="button" class="pmrow" onclick="openPmReport('${r.id}')">
          <span class="pmdot" style="background:var(--warn);"></span>
          <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(r.template_name||'Report')}</span><span class="pmrow-s">${escapeHtml(pmReportWhere(r))} · in progress</span></span>
          ${ophIcon('chevron', 18, 2.2)}
        </button>`).join('')}
    ` : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:22px;">
      <span class="stub" style="margin:0;text-align:left;">${escapeHtml(ME.name)}</span>
      <span class="stub" style="margin:0;text-align:right;">${escapeHtml(personRoleLabel(ME))}</span>
    </div>
    <div style="text-align:center;margin-top:8px;">
      <span class="stub" style="margin:0;color:var(--warn);cursor:pointer;text-decoration:underline;" onclick="doSignOut()">Sign out</span>
    </div>
  `, {tabs:false, centerHeader:true, showRefresh:true});
  if(typeof appSearchOpen !== 'undefined' && appSearchOpen) appSearchRender();
  refreshHomeExtras();
}

let pmReportsTab = 'open';
let pmReportsStartOpen = false;
window.setPmReportsTab = function(t){ pmReportsTab = t; render(); };
window.togglePmReportsStart = function(){ pmReportsStartOpen = !pmReportsStartOpen; render(); };
window.pmStartReportAt = function(siteId){
  pmReportsStartOpen = false;
  if(!siteId){ generalReportsBackHash = '#/reports'; go('#/general-reports'); return; }
  go(`#/site/${siteId}/snagging/reports`);
};
async function renderAllReports(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  let rows = [];
  try{ rows = await loadPmReports(true); }catch(e){}
  await loadAllProfiles();
  const counts = {open: rows.filter(r=>r.status==='in_progress').length, done: rows.filter(r=>r.status!=='in_progress').length, all: rows.length};
  const shown = rows.filter(r=>pmReportsTab==='all' || (pmReportsTab==='open') === (r.status==='in_progress'));
  const live = SITES.filter(s=>siteStatusKey(s)!=='closed').sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const chip = (k, lbl) => `<button type="button" class="pmchip ${pmReportsTab===k?'on':''}" onclick="setPmReportsTab('${k}')">${lbl} (${counts[k]})</button>`;
  if(__gen !== RENDER_GEN) return;
  app.innerHTML = shell(`
    <button type="button" class="pmprimary" onclick="togglePmReportsStart()">${ophIcon('plus', 20, 2.4)} Start a report</button>
    ${pmReportsStartOpen ? `
      <div class="card" style="margin-top:10px;">
        <p class="sectiontitle" style="margin-top:0;">Which project is it for?</p>
        <button type="button" class="pmrow" onclick="pmStartReportAt(null)"><span class="pmrow-txt"><span class="pmrow-t">General survey</span><span class="pmrow-s">Not linked to a project</span></span>${ophIcon('chevron', 18, 2.2)}</button>
        ${live.map(s=>`<button type="button" class="pmrow" onclick="pmStartReportAt('${s.id}')"><span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(s.name)}</span><span class="pmrow-s">${escapeHtml(fullSiteAddress(s)||'')}</span></span>${ophIcon('chevron', 18, 2.2)}</button>`).join('')}
      </div>` : ''}
    <div class="pmtiles" style="margin-top:12px;">
      <button type="button" class="pmtile pmtile-sm" onclick="generalReportsBackHash='#/reports';go('#/general-reports')"><span class="pmtile-txt"><span class="pmtile-t">General surveys</span><span class="pmtile-s">Not linked to a project</span></span></button>
      <button type="button" class="pmtile pmtile-sm" onclick="go('#/team/libraries')"><span class="pmtile-txt"><span class="pmtile-t">Templates</span><span class="pmtile-s">Build &amp; edit report templates</span></span></button>
    </div>
    <div class="pmchips">${chip('open','In progress')}${chip('done','Completed')}${chip('all','All')}</div>
    ${shown.length ? shown.map(r=>{
      const isOpen = r.status==='in_progress';
      return `<button type="button" class="pmrow pmrow-card" onclick="openPmReport('${r.id}')">
        <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(r.template_name||'Report')}</span>
        <span class="pmrow-s">${escapeHtml(pmReportWhere(r))} · ${escapeHtml(nameOf(r.submitted_by)||'')}${isOpen ? '' : ' · '+new Date(r.submitted_at).toLocaleDateString('en-GB')}</span></span>
        <span class="pmbadge ${isOpen?'open':'done'}">${isOpen?'In progress':'Completed'}</span>
      </button>`; }).join('') : `<div class="empty">No reports here yet.</div>`}
  `, {title:'Reports & surveys', subtitle:'All projects', back:'#/home', tabs:false});
}
