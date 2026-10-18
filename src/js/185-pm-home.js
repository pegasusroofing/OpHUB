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
  brush: '<path d="M18 3l3 3-9 9-3-3z"/><path d="M9 12c-3 0-5 2-5 5 0 1-1 2-2 2 2 2 7 2 9-1 1-1.5 1-3 1-3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  pound: '<path d="M17 20H7c2-2 2-4 2-7V8a3 3 0 0 1 6-1"/><path d="M6 13h8"/>',
  store: '<path d="M4 9l2-5h12l2 5"/><path d="M4 9v11h16V9"/><path d="M4 9h16M10 20v-6h4v6"/>',
  book: '<path d="M4 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-4v16"/>',
  flask: '<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .8 3.4 2.6 4 5.5"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
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
// #(op-home) Operatives get the same style of home page, with only what they can already see.
function usesOpHome(u){ return !!u && u.role==='operative'; }
function homeHash(){ return (usesPmHome(ME) || usesOpHome(ME)) ? '#/home' : '#/sites'; }
// The bold header line / logo goes to the project list (Andy, 11 Oct) -
// the Home page is reached from the Home button on the Projects bottom bar.
window.goHome = function(){
  // On the Projects list itself the header takes you up to Home instead.
  const p = String(location.hash||'').split('?')[0];
  const homeUser = usesPmHome(ME) || usesOpHome(ME);
  if((p==='#/sites' || p==='' || p==='#') && homeUser){ go('#/home'); return; }
  // Opened from a Home tile (Hub, Calendar, HR...) → back to Home; from inside
  // Live Projects → back to the projects list.
  if(homeUser && NAV_ROOT==='home' && !p.startsWith('#/site/')){ go('#/home'); return; }
  go('#/sites');
};

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
// #(pm-todos) Open to-dos for this PM across every project: on projects
// they're the responsible PM for, plus any assigned to them or added by them elsewhere.
let pmTodosCache = {at:0, uid:null, rows:[]};
async function loadPmTodos(force){
  if(!force && pmTodosCache.uid===ME.id && (Date.now()-pmTodosCache.at) < 30000) return pmTodosCache.rows;
  const mySites = new Set(SITES.filter(x=>x.responsible_pm_id===ME.id).map(x=>x.id));
  const all = await dbSelect('todos', 'done=eq.false&select=id,site_id,text,assigned_to,created_by,date_required_by,created_at&order=date_required_by.asc.nullslast,created_at.asc&limit=500');
  const rows = (all||[]).filter(t=>!t.site_id || (SITES.some(x=>x.id===t.site_id) && (mySites.has(t.site_id) || t.assigned_to===ME.id || t.created_by===ME.id)));
  pmTodosCache = {at:Date.now(), uid:ME.id, rows};
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

let pmDlvReqAt = 0;
async function renderPmHome(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  if(homeExtras.uid !== ME.id) homeExtras = {uid: ME.id, onboarding: null, count: 0, at: 0, loading: false};
  if(navigator.onLine === false) OFFLINE_CACHE_USED = true;
  let reports = pmReportsCache.uid===ME.id ? pmReportsCache.rows : [];
  let todos = pmTodosCache.uid===ME.id ? pmTodosCache.rows : [];
  let dlvReqN = 0, onSiteN = 0;
  // These four don't depend on each other — fetch them together (used to be
  // four round trips one after another on every Home open).
  if(Date.now() - pmDlvReqAt > 30000){ deliveryRequestsCount = null; pmDlvReqAt = Date.now(); }
  const [repR, dlvR, tdR, osR] = await Promise.allSettled([loadPmReports(), deliveryRequestsBadgeCount(), loadPmTodos(), loadOnSiteNow()]);
  if(repR.status==='fulfilled' && repR.value) reports = repR.value;
  if(dlvR.status==='fulfilled') dlvReqN = dlvR.value || 0;
  if(tdR.status==='fulfilled' && tdR.value) todos = tdR.value;
  if(osR.status==='fulfilled' && osR.value) onSiteN = osR.value.length;
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
      ${stat(onSiteN, 'On site now', "go('#/onsite')")}
      ${stat(todos.length, 'To do', "go('#/todos')")}
      ${stat(hubCount, 'Notifications', "go('#/hub')", hubCount>0)}
    </div>
    <button type="button" class="pmhero" onclick="go('#/sites')">
      <span class="pmhero-top"><span class="pmhero-ic">${ophIcon('projects', 22)}</span>${ophIcon('chevron', 22, 2.4)}</span>
      <span class="pmhero-t">Live projects</span>
      <span class="pmhero-s">${live.length} live${upcoming.length ? ' · '+upcoming.length+' upcoming' : ''}</span>
    </button>
    ${siteMapMiniCardHtml()}
    <div class="pmtiles pmtiles-home">
      ${tile('chart', 'teal', 'Dashboard', 'Company overview', "go('#/dashboard')")}
      ${tile('calendar', 'green', 'Calendar', 'All projects', "go('#/calendar')")}
      ${tile('bell', 'orange', 'HUB', hubCount ? hubCount+' notification'+(hubCount===1?'':'s') : 'Notifications &amp; messages', "go('#/hub')", hubCount)}
      ${tile('truck', 'purple', 'Deliveries', dlvReqN ? dlvReqN+' to schedule' : 'Delivery schedule', "deliveryScheduleBackHash='#/home';go('#/delivery')", dlvReqN)}
      ${tile('reports', 'blue', 'Reports &amp; surveys', open.length ? open.length+' in progress' : 'All projects', "go('#/reports')")}
      ${tile('admin', 'blue', 'Operatives', 'Certifications, training, tools', "go('#/operatives?from=%23%2Fhome')")}
      ${tile('users', 'purple', 'HR', 'Holidays, policies & handbook', "go('#/hr')")}
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
  if(isDeskMode() && isManager(ME)) mountSiteMap('deskMapMini', true);
  maybeShowPmSignNag().then(()=>maybeAskMyPhone());
  refreshHomeExtras();
}
// #(pm-sign-nag) 2026-10-17: once each time the app is opened, a PM / admin
// with company policies or the handbook still to sign gets a pop-up with a
// button straight to them (or X to close).
let pmSignNagDone = false, pmSignNagChecking = false;
// #(pm-phone) 2026-10-18 (Andy): PMs / admins / site managers without a
// mobile number saved get asked for it (once per app open) — drivers and
// the delivery Site contact list use it.
let myPhoneAsked = false;
async function maybeAskMyPhone(){
  if(myPhoneAsked || !ME || ME._support || (ME.phone||'').trim() || !['pm','admin','site_manager'].includes(ME.role)) return;
  if(document.getElementById('signNagOverlay') && document.getElementById('signNagOverlay').style.display==='flex') return; // the sign pop-up is showing — ask next time
  const r0 = parseRoute()[0]; if(r0 && r0!=='home') return;
  myPhoneAsked = true;
  const v = await customPrompt('Add your mobile number so drivers and the team can call you (shown as the Site contact on deliveries).', '');
  if(v===null || !String(v).trim()) return;
  const row = await dbUpdate('profiles', ME.id, {phone: String(v).trim()});
  if(row){ ME.phone = row.phone; if(PROFILES[ME.id]) PROFILES[ME.id].phone = row.phone; toast('Phone number saved'); }
}
async function maybeShowPmSignNag(){
  if(pmSignNagDone || pmSignNagChecking || !ME || !hrCanUse(ME) || navigator.onLine===false) return;
  pmSignNagChecking = true;
  let pols = [], mine = [];
  try{
    pols = await dbSelect('company_policies', 'org_id=eq.'+ME.org_id+'&archived=eq.false&select=id,kind');
    mine = pols.length ? await dbSelect('company_policy_signatures', 'user_id=eq.'+ME.id+'&select=policy_id') : [];
  }catch(e){ return; }
  finally{ pmSignNagChecking = false; }
  const signed = new Set(mine.map(x=>x.policy_id));
  const left = pols.filter(p=>!signed.has(p.id));
  const hb = left.filter(p=>p.kind==='handbook').length, pol = left.length - hb;
  if(!left.length){ pmSignNagDone = true; return; }
  // Home is "#/home" or the empty hash the app opens on.
  const r0 = parseRoute()[0];
  if(r0 && r0!=='home') return;
  pmSignNagDone = true;
  let ov = document.getElementById('signNagOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'signNagOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) closeSignNag(); };
  ov.innerHTML = `<div class="geo-modal-card signnag">
      <button type="button" class="signnag-x" aria-label="Close" onclick="closeSignNag()">×</button>
      <div class="signnag-h">✍️ Needs your signature</div>
      <p class="stub" style="margin:0 0 12px;font-style:normal;">Please read and sign these.</p>
      ${pol ? `<button type="button" class="signnag-row" onclick="closeSignNag();go('#/hr/policies')"><span>📄</span><b>Company policies${pol>1?' ×'+pol:''}</b><em>Sign now ›</em></button>` : ''}
      ${hb ? `<button type="button" class="signnag-row" onclick="closeSignNag();go('#/hr/policies')"><span>📘</span><b>Company handbook</b><em>Sign now ›</em></button>` : ''}
      <button type="button" class="geo-modal-cancel" onclick="closeSignNag()">Not now</button>
    </div>`;
  ov.style.display = 'flex';
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
// Reports page: search + filters (template, surveyor) + tick to select,
// then Export / Email the selected ones (shares selectedReportIds and the
// bulk export/email actions with a project's own Reports list).
let pmReportsTpl = '', pmReportsBy = '', pmReportsFilterOpen = false;
window.setPmReportsFilter = function(k, v){ if(k==='tpl') pmReportsTpl = v; else pmReportsBy = v; render(); };
window.togglePmReportSel = function(id, ev){ if(ev) ev.stopPropagation(); if(selectedReportIds.has(id)) selectedReportIds.delete(id); else selectedReportIds.add(id); render(); };
window.pmReportsSelectAll = function(){
  const box = document.getElementById('pmReportList'); if(!box) return;
  box.querySelectorAll('[data-rid]').forEach(el=>{ if(el.style.display!=='none') selectedReportIds.add(el.getAttribute('data-rid')); });
  render();
};
async function renderAllReports(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  let rows = [];
  try{ rows = await loadPmReports(true); }catch(e){}
  await loadAllProfiles();
  const byFilter = rows.filter(r=>(!pmReportsTpl || r.template_name===pmReportsTpl) && (!pmReportsBy || r.submitted_by===pmReportsBy));
  const counts = {open: byFilter.filter(r=>r.status==='in_progress').length, done: byFilter.filter(r=>r.status!=='in_progress').length, all: byFilter.length};
  const shown = byFilter.filter(r=>pmReportsTab==='all' || (pmReportsTab==='open') === (r.status==='in_progress'));
  const live = SITES.filter(s=>siteStatusKey(s)!=='closed').sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const tplNames = Array.from(new Set(rows.map(r=>r.template_name).filter(Boolean))).sort();
  const surveyors = Array.from(new Set(rows.map(r=>r.submitted_by).filter(Boolean))).map(id=>({id, name:nameOf(id)||'Unknown'})).sort((a,b)=>a.name.localeCompare(b.name));
  const nFilters = (pmReportsTpl?1:0) + (pmReportsBy?1:0);
  const chip = (k, lbl) => `<button type="button" class="pmchip ${pmReportsTab===k?'on':''}" onclick="setPmReportsTab('${k}')">${lbl} (${counts[k]})</button>`;
  const selN = selectedReportIds.size;
  if(__gen !== RENDER_GEN) return;
  app.innerHTML = shell(`
    <button type="button" class="pmprimary" onclick="togglePmReportsStart()">${ophIcon('plus', 20, 2.4)} Start a report</button>
    ${pmReportsStartOpen ? `
      <div class="card" style="margin-top:10px;">
        <p class="sectiontitle" style="margin-top:0;">Which project is it for?</p>
        <button type="button" class="pmrow" onclick="pmStartReportAt(null)"><span class="pmrow-txt"><span class="pmrow-t">General survey</span><span class="pmrow-s">Not linked to a project</span></span>${ophIcon('chevron', 18, 2.2)}</button>
        ${live.map(s=>`<button type="button" class="pmrow" onclick="pmStartReportAt('${s.id}')"><span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(s.name)}</span><span class="pmrow-s">${escapeHtml(fullSiteAddress(s)||'')}</span></span>${ophIcon('chevron', 18, 2.2)}</button>`).join('')}
      </div>` : ''}
<div style="height:12px;"></div>
    <label class="pmsearch">${ophIcon('search', 18)}<input type="search" placeholder="Search reports, projects, people" aria-label="Search reports" oninput="liveFilter(this.value,'#pmReportList')"></label>
    <div class="projfilterrow" style="display:flex;align-items:center;gap:10px;margin-bottom:${pmReportsFilterOpen?'8px':'12px'};">
      <div class="pmchips pmchips-tight" style="margin:0;">${chip('open','In progress')}${chip('done','Completed')}${chip('all','All')}</div>
      <button type="button" class="pmchip ${nFilters?'on':''}" style="flex:none;margin-left:auto;" onclick="pmReportsFilterOpen=!pmReportsFilterOpen;render()">Filter${nFilters?' ('+nFilters+')':''} ▾</button>
    </div>
    ${pmReportsFilterOpen ? `
      <div class="card" style="padding:12px;">
        <div class="formfield" style="margin-top:0;"><label class="field-label">Template</label>
          <select onchange="setPmReportsFilter('tpl', this.value)"><option value="">All templates</option>${tplNames.map(n=>`<option value="${escapeHtml(n)}" ${pmReportsTpl===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select></div>
        <div class="formfield"><label class="field-label">Surveyor</label>
          <select onchange="setPmReportsFilter('by', this.value)"><option value="">Everyone</option>${surveyors.map(p=>`<option value="${p.id}" ${pmReportsBy===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}</select></div>
        ${nFilters ? `<button type="button" class="ghostbtn" style="margin:4px 0 0;" onclick="pmReportsTpl='';pmReportsBy='';render()">Clear filters</button>` : ''}
      </div>` : ''}
    ${selN ? `
      <div class="pmselbar">
        <span><b>${selN}</b> selected</span>
        <button type="button" class="ghostbtn" ${bulkExportBusy?'disabled':''} onclick="exportSelectedReports('')">${bulkExportBusy?'Building…':'Export PDF'}</button>
        <button type="button" class="darkbtn" ${bulkEmailBusy?'disabled':''} onclick="emailSelectedReports()">${bulkEmailBusy?'Emailing…':'Email'}</button>
        <button type="button" class="pmselbar-x" aria-label="Clear selection" onclick="selectedReportIds=new Set();render()">✕</button>
      </div>` : (shown.length ? `<div style="text-align:right;margin:-4px 2px 8px;"><span class="stub" style="margin:0;cursor:pointer;text-decoration:underline;" onclick="pmReportsSelectAll()">Select all</span></div>` : '')}
    <div id="pmReportList">
    ${shown.length ? shown.map(r=>{
      const isOpen = r.status==='in_progress';
      const sel = selectedReportIds.has(r.id);
      return `<div class="pmrep ${sel?'sel':''}" data-rid="${r.id}" data-lf="${lfText([r.template_name, pmReportWhere(r), nameOf(r.submitted_by), r.general_label].filter(Boolean).join(' '))}">
        <button type="button" class="pmrep-chk" aria-label="${sel?'Unselect':'Select'} report" onclick="togglePmReportSel('${r.id}', event)"><span class="pmrep-box">${sel?'✓':''}</span></button>
        <button type="button" class="pmrep-body" onclick="openPmReport('${r.id}')">
          <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(r.template_name||'Report')}</span>
          <span class="pmrow-s">${escapeHtml(pmReportWhere(r))} · ${escapeHtml(nameOf(r.submitted_by)||'')}${isOpen ? '' : ' · '+new Date(r.submitted_at).toLocaleDateString('en-GB')}</span></span>
          <span class="pmbadge ${isOpen?'open':'done'}">${isOpen?'In progress':'Completed'}</span>
        </button>
      </div>`; }).join('') : `<div class="empty">No reports here${nFilters?' for these filters':''}.</div>`}
      <div class="empty lf-empty" style="display:none;">No reports match.</div>
    </div>
    <!-- #(reports-tiles-bottom) 2026-10-17: templates now live only in Admin › Libraries -->
    <div class="pmtiles" style="margin:18px 0 0;">
      <button type="button" class="pmtile pmtile-sm" onclick="generalReportsBackHash='#/reports';go('#/general-reports')"><span class="pmtile-txt"><span class="pmtile-t">General surveys</span><span class="pmtile-s">Not linked to a project</span></span></button>
      <button type="button" class="pmtile pmtile-sm" onclick="go('#/reports/tbt')"><span class="pmtile-txt"><span class="pmtile-t">Completed TBTs</span><span class="pmtile-s">Signed toolbox talks, all projects</span></span></button>
    </div>
  `, {title:'Reports & surveys', subtitle:'All projects', back:'#/home', tabs:false});
}

let pmTodoAddOpen = false;
let pmTodoSiteDraft = '';
window.setPmTodoSite = function(v){ const wasGen = pmTodoSiteDraft==='general'; pmTodoSiteDraft = v; if(wasGen !== (v==='general')) render(); };
window.addTodoFromHome = function(){
  if(!pmTodoSiteDraft){ toast('Choose which project it is for, or General.'); return; }
  pmTodosCache.at = 0;
  addTodo(pmTodoSiteDraft);
};
async function renderPmTodos(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  let rows = [];
  try{ rows = await loadPmTodos(true); }catch(e){}
  await loadAllProfiles();
  const today = localISODate(new Date());
  const bySite = {};
  rows.forEach(t=>{ const k = t.site_id || 'general'; (bySite[k] = bySite[k] || []).push(t); });
  const sites = Object.keys(bySite).filter(id=>id!=='general').map(id=>SITES.find(x=>x.id===id)).filter(Boolean).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  if(bySite.general) sites.unshift({id:'general', name:'General (not a project)', _general:true});
  const pmList = await loadPMList();
  const pickSites = SITES.filter(x=>siteStatusKey(x)!=='closed').sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const sitePicker = `
    <div class="formfield">
      <label class="field-label">Project</label>
      <select id="newTodoSite" onchange="setPmTodoSite(this.value)">
        <option value="">Choose a project…</option>
        <option value="general" ${pmTodoSiteDraft==='general'?'selected':''}>General — not a project</option>
        ${pickSites.map(x=>`<option value="${x.id}" ${pmTodoSiteDraft===x.id?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}
      </select>
    </div>`;
  if(__gen !== RENDER_GEN) return;
  app.innerHTML = shell(`
    <div class="ddrow" style="margin:0 0 ${pmTodoAddOpen?'10px':'4px'};" onclick="pmTodoAddOpen=!pmTodoAddOpen;render()"><span class="arrow">${pmTodoAddOpen?'▼':'▶'}</span> Add a to-do</div>
    ${pmTodoAddOpen ? `<div class="card">${todoAddFormHtml('addTodoFromHome()', pmList, sitePicker, pmTodoSiteDraft==='general')}</div>` : ''}
    ${sites.length ? sites.map(site=>`
      <p class="sectiontitle" style="margin:14px 0 8px;">${escapeHtml(site.name)} (${bySite[site.id].length})</p>
      ${bySite[site.id].map(t=>{
        const over = t.date_required_by && t.date_required_by < today;
        const due = t.date_required_by ? new Date(t.date_required_by+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '';
        return `<button type="button" class="pmrow pmrow-card" onclick="go('${site._general ? '#/todos/general' : '#/site/'+site.id+'/todos'}')">
          <span class="pmrow-txt"><span class="pmrow-t" style="white-space:normal;">${escapeHtml(t.text||'')}</span>
          <span class="pmrow-s">${t.assigned_to ? 'Assigned to '+escapeHtml(nameOf(t.assigned_to)||'') : 'Unassigned'}</span></span>
          ${due ? `<span class="pmbadge ${over?'open':'done'}" style="${over?'':'background:var(--line);color:var(--slate);'}">${over?'Overdue · ':''}${due}</span>` : ''}
        </button>`; }).join('')}
    `).join('') : `<div class="empty">Nothing to do — all clear.</div>`}
  `, {title:'To do', subtitle:'All your projects', back:'#/home', tabs:false});
}

// #(dashboards-chooser) Home › Dashboard: pick the company or operative view.
function renderDashboardsChooser(){
  document.getElementById('app').innerHTML = shell(`
    <div class="admgroup">
      ${admRow('#/dashboard', 'chart', 'teal', 'Company dashboard', 'Projects, people, H&S and activity across the company')}
      ${admRow('#/operatives', 'users', 'blue', 'Operative dashboard', 'Every operative: certifications, training matrix, tools')}
    </div>
  `, {title:'Dashboard', subtitle:'Company & operative overview', back:'#/home', tabs:false});
}

async function renderOpHome(){
  const __gen = RENDER_GEN;
  const app = document.getElementById('app');
  if(homeExtras.uid !== ME.id) homeExtras = {uid: ME.id, onboarding: null, count: 0, at: 0, loading: false};
  if(navigator.onLine === false) OFFLINE_CACHE_USED = true;
  const mine = SITES.filter(s=>siteStatusKey(s)!=='closed');
  const live = mine.filter(s=>siteStatusKey(s)==='live');
  const upcoming = mine.filter(s=>siteStatusKey(s)==='upcoming');
  const outstanding = homeExtras.count || 0;
  let unreadN = 0, subformDue = false;
  try{ [unreadN, subformDue] = await Promise.all([opUnreadCount().catch(()=>0), subformStillNeeded().catch(()=>false)]); }catch(e){}
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
    <div class="pmstats" style="grid-template-columns:repeat(3,minmax(0,1fr));">
      ${stat(live.length, 'Live jobs', "go('#/sites')")}
      ${stat(upcoming.length, 'Upcoming', "go('#/sites')")}
      ${stat(outstanding+unreadN, 'Messages & tasks', "go('#/inbox')", (outstanding+unreadN)>0)}
    </div>
    <button type="button" class="pmhero" onclick="go('#/sites')">
      <span class="pmhero-top"><span class="pmhero-ic">${ophIcon('projects', 22)}</span>${ophIcon('chevron', 22, 2.4)}</span>
      <span class="pmhero-t">My projects</span>
      <span class="pmhero-s">${live.length} live${upcoming.length ? ' · '+upcoming.length+' upcoming' : ''}</span>
    </button>
    <div class="pmtiles pmtiles-home">
      ${subformDue ? subformTileHtml(tile) : ''}
      ${tile('chat', 'blue', 'Messages &amp; tasks', [outstanding ? outstanding+' to sign or do' : 'Nothing to sign', unreadN ? unreadN+' new message'+(unreadN===1?'':'s') : 'no new messages'].join(' · '), "go('#/inbox')", outstanding+unreadN)}
      ${tile('tools', 'green', 'My dashboard', 'Hours, tools, certificates', "go('#/operative-dashboard')")}
      ${tile('gear', 'grey', 'Settings', 'Account, signature, password', "go('#/account')")}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:22px;">
      <span class="stub" style="margin:0;text-align:left;">${escapeHtml(ME.name)}</span>
      <span class="stub" style="margin:0;text-align:right;">${escapeHtml(personRoleLabel(ME))}</span>
    </div>
    <div style="text-align:center;margin-top:8px;">
      <span class="stub" style="margin:0;color:var(--warn);cursor:pointer;text-decoration:underline;" onclick="doSignOut()">Sign out</span>
    </div>
  `, {tabs:false, centerHeader:true, showRefresh:true});
  refreshHomeExtras();
}

// #(op-inbox) Operatives: messages and things to sign/do in one place.
let opUnreadCache = {at:0, n:0};
async function opUnreadCount(){
  if(Date.now()-opUnreadCache.at < 30000) return opUnreadCache.n;
  const ids = SITES.map(s=>s.id);
  const rows = ids.length
    ? await dbSelect('messages', `audience=eq.operatives&parent_id=is.null&or=(site_id.in.(${ids.join(',')}),site_id.is.null)&select=id,sender_id&order=created_at.desc&limit=100`)
    : await dbSelect('messages', `audience=eq.operatives&parent_id=is.null&site_id=is.null&select=id,sender_id&order=created_at.desc&limit=100`);
  let n = 0;
  if(rows.length){
    const reads = await dbSelect('message_reads', `user_id=eq.${ME.id}&message_id=in.(${rows.map(m=>m.id).join(',')})&select=message_id`);
    const readSet = new Set(reads.map(r=>r.message_id));
    n = rows.filter(m=>m.sender_id!==ME.id && !readSet.has(m.id)).length;
  }
  opUnreadCache = {at:Date.now(), n};
  return n;
}
let opInboxTab = null;
window.setOpInboxTab = function(t){ opInboxTab = t; render(); };
async function renderOpInbox(){
  const __gen = RENDER_GEN;
  if(!opInboxTab) opInboxTab = (homeExtras.count||0) > 0 ? 'todo' : 'msgs';
  const tab = opInboxTab;
  const outstanding = homeExtras.count || 0;
  let unreadN = 0; try{ unreadN = await opUnreadCount(); }catch(e){}
  if(tab==='msgs'){ opUnreadCache = {at:Date.now(), n:0}; await renderMyMessages(); }
  else await renderOutstandingTasks();
  if(__gen !== RENDER_GEN) return;
  const area = document.querySelector('.appshell > .scrollarea');
  const h2 = document.querySelector('.appbar h2');
  if(h2) h2.textContent = 'Messages & tasks';
  if(area){
    const bar = document.createElement('div');
    bar.className = 'pmchips';
    bar.style.cssText = 'margin:0 0 12px;flex-wrap:nowrap;';
    bar.innerHTML = `<button type="button" class="pmchip ${tab==='todo'?'on':''}" onclick="setOpInboxTab('todo')">To sign / do${outstanding?' ('+outstanding+')':''}</button><button type="button" class="pmchip ${tab==='msgs'?'on':''}" onclick="setOpInboxTab('msgs')">Messages${unreadN&&tab!=='msgs'?' ('+unreadN+' new)':''}</button>`;
    area.insertBefore(bar, area.firstChild);
  }
}

// ---------- Who's on site right now (#/onsite) ----------
// Everyone whose latest check-in today is an "in": where they are, since when.
let onSiteCache = {at:0, rows:[]};
async function loadOnSiteNow(force){
  if(!force && Date.now()-onSiteCache.at < 30000) return onSiteCache.rows;
  const start = new Date(); start.setHours(0,0,0,0);
  const rows = await dbSelect('checkins', 'ts=gte.'+start.toISOString()+'&order=ts.asc&select=site_id,user_id,type,ts');
  const last = {};
  (rows||[]).forEach(c=>{ if(c.user_id) last[c.user_id] = c; });
  const siteIds = new Set(SITES.map(x=>x.id));
  const out = Object.values(last).filter(c=>c.type==='in' && siteIds.has(c.site_id));
  onSiteCache = {at:Date.now(), rows:out};
  return out;
}
async function renderOnSiteNow(){
  const __gen = RENDER_GEN;
  let rows = [];
  try{ [rows] = await Promise.all([loadOnSiteNow(true), loadAllProfiles()]); }catch(e){}
  if(__gen !== RENDER_GEN) return;
  const bySite = {};
  rows.forEach(r=>{ (bySite[r.site_id] = bySite[r.site_id] || []).push(r); });
  const sites = Object.keys(bySite).map(id=>SITES.find(x=>x.id===id)).filter(Boolean).sort((a,b)=>bySite[b.id].length-bySite[a.id].length || (a.name||'').localeCompare(b.name||''));
  const t = d => new Date(d).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const roleLbl = r => r==='site_manager' ? 'Site manager' : r==='pm' ? 'PM' : r==='admin' ? 'Admin' : r==='subcontractor' ? 'Subcontractor' : '';
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;">
      <div><div style="font-size:26px;font-weight:800;line-height:1;">${rows.length}</div><div class="stub" style="margin:2px 0 0;">on site now across ${sites.length} job${sites.length===1?'':'s'}</div></div>
      <button type="button" class="ghostbtn" style="width:auto;margin:0;padding:8px 12px;" onclick="render()">↻ Refresh</button>
    </div>
    ${sites.length ? sites.map(st=>`
      <div class="card" style="padding:0;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg,#F3F4F6);cursor:pointer;" onclick="go('#/site/${st.id}/checkin')">
          <div style="flex:1;min-width:0;"><div style="font-weight:800;">${escapeHtml(st.name)}</div><div class="stub" style="margin:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(fullSiteAddress(st)||'')}</div></div>
          <span class="pmbadge done" style="flex:none;">${bySite[st.id].length} on site</span>
        </div>
        ${bySite[st.id].sort((a,b)=>new Date(a.ts)-new Date(b.ts)).map(r=>{ const p = PROFILES[r.user_id]||{}; return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid var(--line);">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--ok,#1F9D52);flex:none;"></span>
          <span style="flex:1;min-width:0;font-weight:600;">${escapeHtml(p.name||'Unknown')}${roleLbl(p.role)?` <span class="stub" style="display:inline;margin:0;font-size:11.5px;font-weight:400;">· ${roleLbl(p.role)}</span>`:''}</span>
          <span class="stub" style="margin:0;font-size:12px;">in since ${t(r.ts)}</span>
        </div>`; }).join('')}
      </div>`).join('') : '<div class="empty">Nobody is checked in on site right now.</div>'}
  `, {title:'On site now', subtitle:new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}), back:'#/home', tabs:false});
}
