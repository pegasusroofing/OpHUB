/* ================= ADMIN CENTRE LAYOUT =================
   Front page  (#/team)                 search + day-to-day tiles + four set-up tiles
   Section page (#/team/<page>)         a plain list of what's in Company / Libraries / People / Logs
   Item screen (#/team/<page>/<item>)   that one thing on its own screen
   The item screens reuse the original section markup inside renderTeam: the
   chosen section is switched on, everything else off, and the old drop-down
   headers are hidden with CSS (.adminitem). */
const ADMIN_GROUP_FLAGS = ['brandingintegrations','libraries','healthsafety','invitesusers'];
const ADMIN_PAGES = {
  company:   {label:'Company',   icon:'🎨', sub:'Logo · Theme · Integrations', bg:'var(--brand1)', fg:'var(--brand1-text)', show:()=>ME.role==='admin'},
  libraries: {label:'Libraries', icon:'📚', sub:'Templates · Rates · H&S',     bg:'var(--ok-bg)',  fg:'var(--ok)',          show:()=>isManager(ME)},
  people:    {label:'People',    icon:'👥', sub:'Invites · Users · Phones',    bg:'var(--blue-bg)',fg:'var(--blue)',        show:()=>isManager(ME)},
  logs:      {label:'Logs',      icon:'🕒', sub:'Check-ins · Drivers',         bg:'#EEEEEE',       fg:'#555555',            show:()=>isManager(ME)},
};
// key -> where it lives, what it's called, which original section(s) to open.
const ADMIN_ITEMS = {
  branding:       {page:'company',   group:'Branding',            icon:'🖼️', label:'Company Logo & Theme', sub:'Logo and colours',                 flags:['branding'],                     kw:'logo theme colour color brand', show:()=>ME.role==='admin'},
  expensesemail:  {page:'company',   group:'Integrations',        icon:'🧾', label:'Expenses Email',       sub:()=>((ORG && ORG.expenses_email) || 'Not set')+' · kept '+((ORG && ORG.expenses_retention_months) || 3)+' months', flags:['integrations','expensesemail'], kw:'receipts expenses email', show:()=>ME.role==='admin'},
  onedrive:       {page:'company',   group:'Integrations',        icon:'☁️', label:'OneDrive',             sub:'Photo and export syncing, quick links', flags:['integrations'],                kw:'onedrive sync folder sharepoint', show:()=>ME.role==='admin'},
  reporttemplates:{page:'libraries', group:'Reports & documents', icon:'📝', label:'Report Templates',     sub:'Inspections, surveys, briefings',  flags:['reporttemplates'],              kw:'inspection survey report template briefing', show:()=>isManager(ME)},
  signtemplates:  {page:'libraries', group:'Reports & documents', icon:'✍️', label:'Signing Templates',    sub:'RAMS signature boxes',             href:'#/sign-templates',                kw:'rams signature sign template docusign', show:()=>isManager(ME)},
  sowlibrary:     {page:'libraries', group:'Works & pricing',     icon:'🧱', label:'Schedule of Works Library', sub:'Standard sections and tasks', flags:['sowlibrary'],                   kw:'sow schedule works library', show:()=>isManager(ME)},
  pricebuilder:   {page:'libraries', group:'Works & pricing',     icon:'💷', label:'Price Sheet Rate Card', sub:'Rates by category',             flags:['pricebuilder'],                 kw:'price rate card rates builder', show:()=>ME.role==='admin' && canUsePriceBuilder() && PRICE_BUILDER_LIVE},
  suppliers:      {page:'libraries', group:'Works & pricing',     icon:'🏪', label:'Suppliers',            sub:'Suppliers, order emails and branches', href:'#/suppliers', kw:'supplier merchant branch address materials', show:()=>isFullManager(ME)},
  maincontractor: {page:'libraries', group:'Works & pricing',     icon:'🏢', label:'Main Contractor',      sub:'Inspection templates',             flags:['maincontractor'],               kw:'main contractor mc inspection', show:()=>isManager(ME)},
  hspolicy:       {page:'libraries', group:'Health & Safety',     icon:'📕', label:'H&S Policy',           sub:'Policy document and who has signed', flags:['hspolicy'],                   kw:'health safety policy', show:()=>isFullManager(ME)},
  havstools:      {page:'libraries', group:'Health & Safety',     icon:'🛠️', label:'HAVS Tools',           sub:'Vibration tool list',              flags:['havstools'],                    kw:'havs vibration tools', show:()=>isFullManager(ME)},
  ramslibrary:    {page:'libraries', group:'Health & Safety',     icon:'🦺', label:'RAMS Library',         sub:'Hazards, method statements, templates', href:'#/rams-library', kw:'rams risk assessment method statement hazard template builder', show:()=>isFullManager(ME)},
  coshhlibrary:   {page:'libraries', group:'Health & Safety',     icon:'🧪', label:'COSHH Library',        sub:'Assessments for all sites',        flags:['coshhlibrary'],                 kw:'coshh hazardous substances', show:()=>isFullManager(ME)},
  tbt:            {page:'libraries', group:'Health & Safety',     icon:'🗣️', label:'Toolbox Talk Templates', sub:'All sites',                      flags:['tbt'],                          kw:'toolbox talk tbt', show:()=>isFullManager(ME) && ME.role==='admin'},
  ppelog:         {page:'libraries', group:'Health & Safety',     icon:'🦺', label:'PPE Log',              sub:'Issued PPE and the register',      flags:['ppelog'],                       kw:'ppe register', show:()=>isFullManager(ME)},
  invites:        {page:'people',    group:'',                    icon:'✉️', label:'Invites',              sub:'Invite links and pending invites', flags:['invites'],                      kw:'invite link join', show:()=>isManager(ME)},
  users:          {page:'people',    group:'',                    icon:'👥', label:'Users',                sub:'Roles, passwords, removing people', flags:['users'],                       kw:'user role admin pm estimator operative driver client password remove', show:()=>isManager(ME)},
  devicelocks:    {page:'people',    group:'',                    icon:'📱', label:'Device Locks',         sub:'One phone = one person',           flags:['devicelocks'],                  kw:'device phone lock approve', show:()=>isFullManager(ME)},
  checkinlogs:    {page:'logs',      group:'',                    icon:'📍', label:'Check-In Logs',        sub:'Operatives and PM logins by site', flags:['checkinlogs'],                  kw:'check in out log site attendance', show:()=>isManager(ME)},
  drivercheckins: {page:'logs',      group:'',                    icon:'🚚', label:'Driver Check-In Log',  sub:'Shifts, breaks, hours',            flags:['drivercheckins'],               kw:'driver check in shift break hours', show:()=>isFullManager(ME)},
};
function adminItemHash(key){ const it = ADMIN_ITEMS[key]; return it ? (it.href || '#/team/'+it.page+'/'+key) : '#/team'; }
function adminRowHtml(key, extraSub){
  const it = ADMIN_ITEMS[key];
  const sub = extraSub || (typeof it.sub==='function' ? it.sub() : it.sub);
  return `<div class="sitecard" style="cursor:pointer;" onclick="go('${adminItemHash(key)}')">
    <div style="font-size:20px;flex:0 0 auto;width:26px;text-align:center;">${it.icon}</div>
    <div class="info"><div class="name">${escapeHtml(it.label)}</div>${sub ? `<div class="addr">${escapeHtml(sub)}</div>` : ''}</div>
    <div style="color:var(--slate);font-size:20px;flex:0 0 auto;">›</div>
  </div>`;
}
function adminPageListHtml(page, counts){
  const keys = Object.keys(ADMIN_ITEMS).filter(k=>ADMIN_ITEMS[k].page===page && ADMIN_ITEMS[k].show());
  let lastGroup = null, out = '';
  keys.forEach(k=>{
    const g = ADMIN_ITEMS[k].group;
    if(g && g!==lastGroup){ out += `<p class="sectiontitle" style="margin-top:${lastGroup===null?'0':'18px'};">${escapeHtml(g)}</p>`; }
    lastGroup = g;
    out += adminRowHtml(k, counts && counts[k]);
  });
  return out || `<div class="empty">Nothing here for your role.</div>`;
}
let adminSearch = '', adminSearchOpen = false;
// Search box on the Admin Centre front page: filters every section the
// signed-in person can open. Re-draws only the results area, so typing
// never loses the cursor.
window.adminSearchRender = function(){
  const q = (adminSearch||'').trim().toLowerCase();
  const res = document.getElementById('adminSearchResults'), tiles = document.getElementById('adminHubTiles');
  if(!res || !tiles) return;
  if(!q){ res.innerHTML = ''; tiles.style.display = ''; return; }
  const hits = Object.keys(ADMIN_ITEMS).filter(k=>{ const it = ADMIN_ITEMS[k]; return it.show() && ADMIN_PAGES[it.page].show() && (it.label+' '+it.kw+' '+it.group+' '+ADMIN_PAGES[it.page].label).toLowerCase().includes(q); });
  tiles.style.display = 'none';
  res.innerHTML = `<p class="stub" style="margin:0 0 8px;">${hits.length} result${hits.length===1?'':'s'}</p>` + (hits.map(k=>adminRowHtml(k, ADMIN_PAGES[ADMIN_ITEMS[k].page].label+(ADMIN_ITEMS[k].group ? ' › '+ADMIN_ITEMS[k].group : ''))).join('') || `<div class="empty">Nothing matches "${escapeHtml(adminSearch.trim())}".</div>`);
};
async function renderTeam(adminPage, adminItemKey){
  const __gen = RENDER_GEN;
  // A link into Admin Centre from inside a site file (e.g. "Upload / manage
  // versions in Settings & Admin" from the RAMS page) can pass ?from=<hash>
  // so Back returns to that exact originating page instead of the generic
  // Sites list fallback — same pattern as the Certifications back-nav fix.
  const teamBackFrom = routeQuery().get('from');
  await loadAllProfiles();
  const people = Object.values(PROFILES).sort((a,b)=>a.name.localeCompare(b.name));
  const iAmAdmin = ME.role==='admin';
  // Which screen is this? Front page, a section page, or one item.
  if(adminPage && (!ADMIN_PAGES[adminPage] || !ADMIN_PAGES[adminPage].show())){ go('#/team'); return; }
  const adminItem = adminItemKey ? ADMIN_ITEMS[adminItemKey] : null;
  if(adminItemKey && (!adminItem || adminItem.page!==adminPage || !adminItem.show() || !adminItem.flags)){ go(adminPage ? '#/team/'+adminPage : '#/team'); return; }
  // Only the item on screen is switched on — so only its data is fetched.
  Object.keys(teamSectionOpen).forEach(k=>{ teamSectionOpen[k] = false; });
  if(adminItem){ ADMIN_GROUP_FLAGS.concat(adminItem.flags).forEach(k=>{ teamSectionOpen[k] = true; }); }
  const adminBack = adminItem ? '#/team/'+adminPage : (adminPage ? '#/team' : null);
  // Every fetch below now follows the same "only when that section is
  // actually open" pattern already used further down for Check-In Logs/PPE
  // Log/COSHH Library/Operative Tools/Certifications. Previously these ran
  // unconditionally (several of them sequentially awaited, not even in
  // parallel) on EVERY renderTeam() call — including every single ddrow
  // toggle, even one unrelated to any of these sections — which is what
  // made opening/closing Admin Centre dropdowns feel slow. None of these
  // values are read anywhere outside their own gated section below, so
  // skipping the fetch while collapsed changes nothing about what's shown.
  // Every open section's data is now asked for at the same time instead
  // of one request after another.
  const __tp = [];
  let pendingInvites = [], permanentInvite = null;
  __tp.push((async()=>{ if(teamSectionOpen.invites){
    const [pendingInviteRows, permanentInviteRows] = await Promise.all([
      dbSelect('invites', 'used_at=is.null&is_reusable=eq.false&order=created_at.desc&select=*'),
      dbSelect('invites', 'org_id=eq.'+ME.org_id+'&is_reusable=eq.true&order=created_at.desc&limit=1&select=*'),
    ]);
    pendingInvites = pendingInviteRows;
    permanentInvite = permanentInviteRows[0] || null;
  } })());
  let odConn = null; __tp.push((async()=>{ if(iAmAdmin && teamSectionOpen.integrations) odConn = (await dbSelect('onedrive_connections', 'org_id=eq.'+ME.org_id))[0] || null; })());
  let tbtTemplates = []; __tp.push((async()=>{ if(iAmAdmin && teamSectionOpen.tbt) tbtTemplates = await dbSelect('tbt_templates', 'org_id=eq.'+ME.org_id+'&order=created_at.desc'); })());
  let reportTemplates = []; __tp.push((async()=>{ if(iAmAdmin && teamSectionOpen.reporttemplates) reportTemplates = await dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&archived=eq.false&order=name.asc'); })());
  let deviceLocks = []; __tp.push((async()=>{ if(isFullManager(ME) && teamSectionOpen.devicelocks) deviceLocks = await dbSelect('device_locks', 'org_id=eq.'+ME.org_id+'&order=last_seen_at.desc'); })());
  let suppliers = []; __tp.push((async()=>{ if(isManager(ME) && teamSectionOpen.suppliers) suppliers = await dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&order=name.asc'); })());
  let havsTools = []; __tp.push((async()=>{ if(isManager(ME) && teamSectionOpen.havstools) havsTools = await dbSelect('havs_tools', 'org_id=eq.'+ME.org_id+'&active=eq.true&order=sort_order.asc,name.asc'); })());
  // Price Sheet rate card — admin only for now (rollout gate, see
  // canUsePriceBuilder), org-wide (mirrors Suppliers).
  let priceRateItems = [], priceRateOptions = [];
  __tp.push((async()=>{ if(PRICE_BUILDER_LIVE && canUsePriceBuilder() && teamSectionOpen.pricebuilder){
    priceRateItems = await dbSelect('price_rate_items', 'org_id=eq.'+ME.org_id+'&active=eq.true&order=category.asc,sort_order.asc,name.asc');
    const dropdownIds = priceRateItems.filter(i=>i.is_dropdown).map(i=>i.id).join(',');
    priceRateOptions = dropdownIds ? await dbSelect('price_rate_options', 'rate_item_id=in.('+dropdownIds+')&order=sort_order.asc') : [];
  } })());
  // Schedule of Works library — org-wide reusable templates (org_id=eq. so
  // this stays scoped to this company even though sow_library_templates has
  // no site_id) a PM/admin can pick from when building any site's Schedule
  // of Works. Only loaded while the section is actually open.
  let sowLibTemplates = [];
  __tp.push((async()=>{ if(isManager(ME) && teamSectionOpen.sowlibrary){
    sowLibTemplates = await dbSelect('sow_library_templates', 'org_id=eq.'+ME.org_id+'&order=name.asc');
    if(sowLibOpenTemplateId && !sowLibSectionsCache[sowLibOpenTemplateId]) await loadSowLibContents(sowLibOpenTemplateId);
  } })());
  // H&S Policy is now uploaded ONLY from here — every site-scoped H&S page
  // still shows/signs the current policy, but their own upload forms have
  // been removed and point back to this section instead.
  let hsPolicyAdmin = {doc:null, superseded:[], signedIds:new Set(), allPeople:[], nameById:{}, supersedesName:null};
  __tp.push((async()=>{ if(isManager(ME) && teamSectionOpen.hspolicy){
    const {doc, superseded, sigs, nameById, supersedesName} = await fetchHsPolicyData();
    const validSigs = doc ? sigs.filter(s=>hsPolicySigStillValid(doc, s)) : [];
    hsPolicyAdmin = {doc, superseded, signedIds: new Set(validSigs.map(s=>s.user_id)), allPeople: people, nameById, supersedesName};
  } })());
  // Only queried while the section is actually open — the range can span a
  // whole month across every site, no need to pull it on every Admin Centre
  // visit if nobody's looking at it.
  // Driver check-ins (not tied to a site) for the Driver Check-In Log.
  let driverCheckinRows = [], driverBreakRows = [];
  __tp.push((async()=>{ if(isFullManager(ME) && teamSectionOpen.drivercheckins){
    const since = new Date(); since.setDate(since.getDate() - driverCheckinLogDays); since.setHours(0,0,0,0);
    [driverCheckinRows, driverBreakRows] = await Promise.all([
      dbSelect('driver_checkins', 'org_id=eq.'+ME.org_id+'&ts=gte.'+since.toISOString()+'&order=ts.desc&limit=1000'),
      dbSelect('driver_breaks', 'org_id=eq.'+ME.org_id+'&started_at=gte.'+since.toISOString()+'&order=started_at.asc&limit=1000'),
    ]);
  } })());
  let checkinLogRows = [];
  __tp.push((async()=>{ if(isManager(ME) && teamSectionOpen.checkinlogs){
    const range = checkinLogEffectiveRange();
    checkinLogRows = await dbSelect('checkins', 'ts=gte.'+new Date(range.start).toISOString()+'&ts=lt.'+new Date(range.end).toISOString()+'&order=ts.asc&select=*');
  } })());
  // Same "only when open" pattern — the PPE log spans every site, no need
  // to query it on every Admin Centre visit if nobody's looking at it.
  let ppeLogRows = [];
  __tp.push((async()=>{ if(isManager(ME) && teamSectionOpen.ppelog){
    const range = ppeLogRange(ppeLogMode, ppeLogOffset);
    ppeLogRows = await dbSelect('ppe_issuances', 'issued_at=gte.'+new Date(range.start).toISOString()+'&issued_at=lt.'+new Date(range.end).toISOString()+'&order=issued_at.desc&select=*');
  } })());
  // Same "only when the section is actually open" pattern as Check-In Logs —
  // the library can be several levels deep, no need to query it on every
  // Admin Centre visit if nobody has expanded it.
  let coshhLibraryHtmlBlock = '';
  __tp.push((async()=>{ if(isManager(ME) && teamSectionOpen.coshhlibrary){
    coshhLibraryHtmlBlock = await coshhLibraryBrowserHtml();
  } })());
  await Promise.all(__tp);
  // Operative Tools moved out of Admin Centre entirely (#notif-review-
  // 2026-09) — it now lives at the bottom of the Operatives list (#/operatives)
  // as the same kind of org-wide browse section, with per-operative editing
  // also available on each operative's own page. See renderOperativesList
  // and renderOperativeDetail.
  // Certifications is now per-operative (see the "Operatives" area) — this
  // section is just the root OneDrive folder link, so nothing to query here.
  const smallBtn = 'width:auto;padding:4px 6px;font-size:6.75px;';
  const ddHdr = ''; // dropdown-row headers now share the app-wide .ddrow aesthetic (see CSS)
  // Price Sheet rate card grouped by category, each item's dropdown
  // options (if any) attached — same shape the sheet builder itself uses.
  const priceRateOptionsByItem = {};
  priceRateOptions.forEach(o=>{ (priceRateOptionsByItem[o.rate_item_id]=priceRateOptionsByItem[o.rate_item_id]||[]).push(o); });
  const priceRateCategories = [];
  priceRateItems.forEach(it=>{
    let cat = priceRateCategories.find(c=>c.name===it.category);
    if(!cat){ cat = {name:it.category, items:[]}; priceRateCategories.push(cat); }
    cat.items.push(it);
  });
  sortPriceRateCategories(priceRateCategories);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${adminPage && !adminItem ? adminPageListHtml(adminPage, {users: people.length+' people'}) : ''}
    ${!adminPage ? `
    ${adminSearchOpen || adminSearch ? `
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
        <input type="text" id="adminSearchInput" placeholder="Search settings, libraries, people…" value="${escapeHtml(adminSearch)}" oninput="adminSearch=this.value;adminSearchRender()" autocomplete="off" style="flex:1;min-width:0;margin:0;">
        <span class="homebtn" style="flex:none;" title="Close search" onclick="adminSearchOpen=false;adminSearch='';render()">✕</span>
      </div>` : `
      <div style="display:flex;justify-content:flex-end;margin:-4px 0 2px;"><span class="homebtn" style="flex:none;" title="Search" onclick="adminSearchOpen=true;render().then(()=>{const e=document.getElementById('adminSearchInput'); if(e) e.focus();})">🔍</span></div>`}
    <div id="adminSearchResults"></div>
    <div id="adminHubTiles">
    <p class="sectiontitle" style="margin-top:6px;">Day to day</p>
    <div class="tilegrid admintiles" style="grid-auto-rows:1fr;margin-top:0;">
      <div class="tile" onclick="go('#/dashboard')">
        <div class="icon" style="background:var(--blue-bg);color:var(--blue);">📊</div>
        <div class="lbl">Company Dashboard</div>
      </div>
      ${iAmAdmin ? `<div class="tile" onclick="go('#/operatives')">
        <div class="icon" style="background:var(--ok-bg);color:var(--ok);">👷</div>
        <div class="lbl">Operatives</div>
      </div>` : ''}
      <div class="tile" onclick="generalReportsBackHash='#/team';go('#/general-reports')">
        <div class="icon" style="background:#EDE7F6;color:#5E35B1;">📋</div>
        <div class="lbl">Reports &amp; Inspections</div>
      </div>
      <div class="tile" onclick="go('#/vehicle-checklists')">
        <div class="icon" style="background:var(--warn-bg);color:var(--warn);">🚐</div>
        <div class="lbl">Vehicle Checks</div>
      </div>
      <div class="tile" onclick="go('#/team/libraries/maincontractor')">
        <div class="icon" style="background:#E7E9EE;color:var(--ink);">🏢</div>
        <div class="lbl">Main Contractor</div>
      </div>
    </div>
    <p class="sectiontitle" style="margin-top:18px;">Set-up</p>
    <div class="tilegrid admintiles" style="grid-auto-rows:1fr;margin-top:0;">
      ${Object.keys(ADMIN_PAGES).filter(k=>ADMIN_PAGES[k].show()).map(k=>`
      <div class="tile" onclick="go('#/team/${k}')">
        <div class="icon" style="background:${ADMIN_PAGES[k].bg};color:${ADMIN_PAGES[k].fg};">${ADMIN_PAGES[k].icon}</div>
        <div class="lbl">${escapeHtml(ADMIN_PAGES[k].label)}</div><div class="sub">${escapeHtml(ADMIN_PAGES[k].sub)}</div>
      </div>`).join('')}
    </div>
    </div>
    ` : ''}
    ${adminItem ? `<div class="adminitem adminitem-${adminItemKey}">
    ${iAmAdmin ? `
    <p class="ddrow ddrow-hdr" style="margin-top:14px;" onclick="toggleTeamSection('brandingintegrations')"><span class="icon" style="background:var(--brand1);color:var(--brand1-text);">🎨</span><span class="lbl">Branding &amp; Integrations</span><span class="arrow">${teamSectionOpen.brandingintegrations?'▼':'▶'}</span></p>
    ${teamSectionOpen.brandingintegrations ? `
    <div style="margin:8px 0 0 14px;padding-left:10px;border-left:2px solid var(--line);">
    <p class="ddrow" style="margin-top:0;${ddHdr}" onclick="toggleTeamSection('branding')"><span class="arrow">${teamSectionOpen.branding?'▼':'▶'}</span> Company Logo &amp; Theme</p>
    ${teamSectionOpen.branding ? `
    <p class="sectiontitle" style="margin-top:14px;">Company Logo</p>
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Shown throughout the app and on your team's invite/join screen.</p>
      <div class="photoupload" style="width:120px;height:120px;cursor:${teamLogoProcessing?'default':'pointer'};" onclick="${teamLogoProcessing?'':"document.getElementById('teamLogoInput').click()"}">
        ${teamLogoProcessing ? `<span><span class="spinner"></span> Processing…</span>` : `<img src="${teamLogoPreview || orgLogoUrl(ORG)}" onerror="this.onerror=null;this.src='${OPHUB_LOGO_INLINE}'">`}
      </div>
      <input type="file" id="teamLogoInput" accept="image/*" style="display:none;" onchange="onTeamLogoChosen(event)" ${teamLogoProcessing?'disabled':''}>
      ${teamLogoError ? `<div class="errbox" style="margin-top:10px;">${escapeHtml(teamLogoError)}</div>` : ''}
      ${teamLogoPreview ? `
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="darkbtn" ${teamLogoBusy?'disabled':''} onclick="saveTeamLogo()">${teamLogoBusy?'Saving…':'Save New Logo'}</button>
          <button class="ghostbtn" style="width:auto;padding:8px 12px;" ${teamLogoBusy?'disabled':''} onclick="teamLogoPreview=null;teamLogoError=null;render()">Cancel</button>
        </div>
      ` : `<p class="stub" style="margin-top:10px;">Tap the logo above to choose a new one.</p>`}
    </div>
    <p class="sectiontitle">Company Theme</p>
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Set your company's colours — these apply across the app for everyone at ${escapeHtml(ORG && ORG.name || 'your company')}.</p>
      <div style="display:flex;gap:12px;margin-bottom:10px;">
        <div style="flex:1;">
          <label class="stub" style="display:block;margin-bottom:4px;">Primary colour</label>
          <input type="color" id="themeColor1" value="${escapeHtml((ORG && ORG.color_primary) || DEFAULT_BRAND1)}" oninput="document.documentElement.style.setProperty('--brand1',this.value);document.documentElement.style.setProperty('--brand1-text',readableTextColor(this.value));" style="width:100%;height:44px;padding:4px;">
        </div>
        <div style="flex:1;">
          <label class="stub" style="display:block;margin-bottom:4px;">Secondary colour</label>
          <input type="color" id="themeColor2" value="${escapeHtml((ORG && ORG.color_secondary) || DEFAULT_BRAND2)}" oninput="document.documentElement.style.setProperty('--brand2',this.value);document.documentElement.style.setProperty('--brand2-onlight',onLightTextColor(this.value,'#101114'));" style="width:100%;height:44px;padding:4px;">
        </div>
      </div>
      <p class="stub" style="margin:0 0 10px;">Your primary colour accents the header bar, your company name, and buttons/badges throughout the app.</p>
      <div style="display:flex;gap:8px;">
        <button class="darkbtn" ${themeBusy?'disabled':''} onclick="saveCompanyTheme()">${themeBusy?'Saving…':'Save Theme'}</button>
        <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="resetCompanyTheme()">Reset to Default</button>
      </div>
    </div>
    ` : ''}
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('integrations')"><span class="arrow">${teamSectionOpen.integrations?'▼':'▶'}</span> Integrations</p>
    ${teamSectionOpen.integrations ? `
    <div style="margin:8px 0 0 14px;padding-left:10px;border-left:2px solid var(--line);">
    <p class="ddrow" style="margin-top:0;${ddHdr}" onclick="toggleTeamSection('expensesemail')"><span class="arrow">${teamSectionOpen.expensesemail?'▼':'▶'}</span> Expenses Email <span class="stub" style="font-weight:400;">· ${ORG && ORG.expenses_email ? escapeHtml(ORG.expenses_email) : 'not set'}</span></p>
    ${teamSectionOpen.expensesemail ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Receipts sent from the Expenses tile on any job are emailed to this address.</p>
      <div class="formfield" style="margin-top:0;"><label class="field-label">Send expenses to</label>
        <input type="email" id="expensesEmailInput" value="${escapeHtml((ORG && ORG.expenses_email) || '')}" placeholder="e.g. info@yourcompany.co.uk" autocomplete="off">
      </div>
      <div class="formfield"><label class="field-label">Keep receipts in the app for</label>
        <select id="expensesRetentionInput">${[3,6,9,12].map(m=>`<option value="${m}" ${((ORG && ORG.expenses_retention_months) || 3)===m?'selected':''}>${m} months</option>`).join('')}</select>
      </div>
      <p class="stub" style="margin:4px 0 0;">After this, receipts are deleted from the app automatically. Emails already sent to the office are not affected.</p>
      <button class="darkbtn" style="margin-top:10px;" onclick="saveExpensesEmail()">Save</button>
      ${ORG && ORG.expenses_email ? `<p class="stub" style="margin:8px 0 0;color:var(--good,#1F9D62);">✓ Currently going to ${escapeHtml(ORG.expenses_email)}</p>` : `<p class="stub" style="margin:8px 0 0;color:var(--warn);">Not set yet — receipts can't be sent until an address is saved.</p>`}
    </div>
    ` : ''}
    </div>
    <div class="adm-od">
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">OneDrive — progress report photos</p>
      ${odConn && odConn.access_token ? `
        <p class="stub" style="margin:0 0 8px;color:var(--ok);">Connected — syncing to ${escapeHtml(odConn.account_email||'your OneDrive')} · folder "${escapeHtml(odConn.folder_path)}"</p>
        <button class="ghostbtn" onclick="disconnectOneDrive()">Disconnect</button>
      ` : `
        <p class="stub" style="margin:0 0 8px;">Connect your company's OneDrive so schedule progress photos upload there automatically.</p>
        <button class="darkbtn" ${odBusy?'disabled':''} onclick="connectOneDrive()">${odBusy?'Connecting…':'Connect OneDrive'}</button>
      `}
    </div>
    <div class="card" style="margin-top:10px;">
      <p class="sectiontitle" style="margin-top:0;">⭐ Quick Links</p>
      <p class="stub" style="margin:0 0 10px;">Pin a folder here — e.g. your Live Projects folder — so it shows as a one-tap shortcut anywhere someone chooses a OneDrive sync folder, instead of clicking through every folder each time.</p>
      ${(ORG && ORG.onedrive_pinned_folders && ORG.onedrive_pinned_folders.length) ? ORG.onedrive_pinned_folders.map(p=>`
        <div class="sitecard" style="padding:8px 10px;">
          <div class="swatch">⭐</div>
          <div class="info"><div class="name">${escapeHtml(p.name)}</div></div>
          <div class="taskicon danger" title="Remove Quick Link" onclick="toggleOdFolderPin('${p.id}','${jsAttr(p.name)}','${p.driveId||''}')">🗑</div>
        </div>
      `).join('') : `<div class="empty" style="padding:10px;">No Quick Links yet.</div>`}
      <button class="darkbtn" style="margin-top:10px;" onclick="startQuickLinkPicker()">+ Add Quick Link</button>
    </div>
    <div class="card" style="margin-top:10px;">
      <p class="sectiontitle" style="margin-top:0;">Synced per site</p>
      <p class="stub" style="margin:0 0 10px;">Every site with a OneDrive folder linked — for photos/Drawings import, or for Material PO's auto-sync.</p>
      ${(()=>{
        const syncedSites = SITES.filter(s=>s.onedrive_folder_id || s.material_orders_folder_id);
        if(!syncedSites.length) return `<div class="empty">No sites have a OneDrive folder linked yet.</div>`;
        return syncedSites.map(s=>{
          const tags = [s.onedrive_folder_id ? '📁 Photos/Drawings' : '', s.material_orders_folder_id ? '📦 Material POs' : ''].filter(Boolean).join(' · ');
          return `
          <div class="sitecard" style="padding:6px 10px;">
            <div class="info" style="min-width:0;">
              <div class="name" style="font-size:13px;">${escapeHtml(s.name)}</div>
              <div class="meta" style="font-size:11px;">${tags}</div>
            </div>
            <select style="width:auto;flex:none;padding:5px 8px;font-size:12px;" ${siteOdSyncBusy===s.id?'disabled':''} onchange="syncedSiteAction('${s.id}', this.value); this.selectedIndex=0;">
              <option value="" selected disabled>${siteOdSyncBusy===s.id?'Syncing…':'Actions ▾'}</option>
              <option value="admin">Open Site Admin</option>
              ${s.onedrive_folder_id ? `<option value="sync">Manual Sync</option>` : ''}
            </select>
          </div>
        `;
        }).join('');
      })()}
    </div>
    </div>
    ` : ''}
    </div>
    ` : ''}
    ` : ''}
    <p class="ddrow ddrow-hdr" style="margin-top:14px;" onclick="toggleTeamSection('libraries')"><span class="icon" style="background:var(--ok-bg);color:var(--ok);">📚</span><span class="lbl">Libraries</span><span class="arrow">${teamSectionOpen.libraries?'▼':'▶'}</span></p>
    ${teamSectionOpen.libraries ? `
    <div style="margin:8px 0 0 14px;padding-left:10px;border-left:2px solid var(--line);">
    ${isManager(ME) ? `
    <p class="ddrow" id="teamSectionReporttemplates" style="margin-top:0;${ddHdr}" onclick="toggleTeamSection('reporttemplates')"><span class="arrow">${teamSectionOpen.reporttemplates?'▼':'▶'}</span> Report Templates</p>
    ${teamSectionOpen.reporttemplates ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Build reusable inspection / report templates here. Project Managers can fill these in on site and submit them as a report. Editing a template never changes inspections already started from it.</p>
      ${reportTemplates.map(t=>`
        <div class="sitecard" style="padding:8px 10px;">
          <div class="swatch">📋</div>
          <div class="info"><div class="name">${escapeHtml(t.name)}</div><div class="addr">${(t.sections||[]).length} section${(t.sections||[]).length===1?'':'s'}</div></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="ghostbtn" style="width:auto;padding:6px 10px;" onclick="openTemplateEditor('${t.id}',null,'#/team/libraries/reporttemplates')">Edit</button>
            <button class="ghostbtn" style="width:auto;padding:6px 10px;" onclick="duplicateTemplate('${t.id}')">Duplicate</button>
            <div class="taskicon danger" onclick="deleteTemplate('${t.id}','${jsAttr(t.name)}')">🗑</div>
          </div>
        </div>
      `).join('') || `<div class="empty" style="padding:10px;">No templates yet — create your first one below.</div>`}
      <button class="darkbtn" style="margin-top:10px;" onclick="createNewTemplate(null,'#/team/libraries/reporttemplates')">+ New Template</button>
    </div>
    ` : ''}
    ` : ''}
    ${isManager(ME) ? `
    <p class="ddrow" style="${ddHdr}" onclick="teamSectionOpen.libraries=true;go('#/sign-templates')"><span class="arrow">▶</span> Signing Templates <span class="stub" style="font-weight:400;">— pre-set sign boxes for RAMS</span></p>
    ` : ''}
    ${isManager(ME) ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('sowlibrary')"><span class="arrow">${teamSectionOpen.sowlibrary?'▼':'▶'}</span> Schedule of Works — Library</p>
    ${teamSectionOpen.sowlibrary ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Reusable Schedule of Works templates for the whole company — build one once here, then pick it from any site's Schedule of Works "+ → From Library" to copy the whole structure in. Every copied line becomes an ordinary task on that site, fully editable or deletable afterwards — this library copy is never linked back to.</p>
      ${sowLibTemplates.map(t=>`
        <div class="ddrow" onclick="toggleSowLibTemplate('${t.id}')">
          <span class="arrow">${sowLibOpenTemplateId===t.id?'▼':'▶'}</span> ${escapeHtml(t.name)}
        </div>
        ${sowLibOpenTemplateId===t.id ? `
          <div style="margin:0 0 14px 14px;padding-left:10px;border-left:2px solid var(--line);">
            <div class="row-gap" style="margin-bottom:10px;">
              <button class="ghostbtn" style="flex:1;" onclick="renameSowLibTemplate('${t.id}')">✎ Rename</button>
              <button class="ghostbtn" style="flex:1;color:var(--warn);" onclick="deleteSowLibTemplate('${t.id}')">🗑 Delete Template</button>
            </div>
            ${(sowLibSectionsCache[t.id]||[]).map(sec=>`
              <div class="sitecard" style="padding:8px 10px;flex-direction:column;align-items:stretch;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <span style="font-weight:700;font-size:13px;">${escapeHtml(sec.name)}</span>
                  <span style="display:flex;gap:6px;">
                    <span class="taskicon" style="width:22px;height:22px;font-size:11px;" onclick="renameSowLibSection('${t.id}','${sec.id}')">✎</span>
                    <span class="taskicon danger" style="width:22px;height:22px;font-size:11px;" onclick="deleteSowLibSection('${t.id}','${sec.id}')">🗑</span>
                  </span>
                </div>
                ${(sowLibTasksCache[t.id]||[]).filter(x=>x.section_id===sec.id).map(task=>`
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0 0 10px;">
                    <span style="font-size:12.5px;">${escapeHtml(task.name)}</span>
                    <span style="display:flex;gap:6px;">
                      <span class="taskicon" style="width:20px;height:20px;font-size:10px;" onclick="renameSowLibTask('${t.id}','${task.id}')">✎</span>
                      <span class="taskicon danger" style="width:20px;height:20px;font-size:10px;" onclick="deleteSowLibTask('${t.id}','${task.id}')">🗑</span>
                    </span>
                  </div>
                `).join('')}
                <div class="row-gap" style="margin:8px 0 0 10px;">
                  <input type="text" id="sowLibNewTaskName-${sec.id}" placeholder="e.g. Fit lead flashing" style="flex:2;padding:6px 8px;font-size:11.5px;">
                  <button class="darkbtn" style="flex:1;padding:6px 8px;font-size:11.5px;" onclick="addSowLibTask('${t.id}','${sec.id}')">Add</button>
                </div>
              </div>
            `).join('') || `<div class="empty" style="padding:8px;">No sections yet.</div>`}
            <div class="row-gap" style="margin:10px 0;">
              <input type="text" id="sowLibNewSectionName-${t.id}" placeholder="New section, e.g. Pitched Roofing" style="flex:2;padding:8px 10px;font-size:12px;">
              <button class="darkbtn" style="flex:1;padding:8px 10px;font-size:12px;" onclick="addSowLibSection('${t.id}')">Add Section</button>
            </div>
            <p class="field-label" style="margin:10px 0 6px;">Ungrouped tasks</p>
            ${(sowLibTasksCache[t.id]||[]).filter(x=>!x.section_id).map(task=>`
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px;">
                <span style="font-size:12.5px;">${escapeHtml(task.name)}</span>
                <span style="display:flex;gap:6px;">
                  <span class="taskicon" style="width:20px;height:20px;font-size:10px;" onclick="renameSowLibTask('${t.id}','${task.id}')">✎</span>
                  <span class="taskicon danger" style="width:20px;height:20px;font-size:10px;" onclick="deleteSowLibTask('${t.id}','${task.id}')">🗑</span>
                </span>
              </div>
            `).join('')}
            <div class="row-gap">
              <input type="text" id="sowLibNewTaskName-${t.id}" placeholder="e.g. General site task" style="flex:2;padding:8px 10px;font-size:12px;">
              <button class="darkbtn" style="flex:1;padding:8px 10px;font-size:12px;" onclick="addSowLibTask('${t.id}')">Add</button>
            </div>
          </div>
        ` : ''}
      `).join('') || `<div class="empty">No templates yet.</div>`}
      <button class="darkbtn" style="margin-top:10px;" onclick="addSowLibTemplate()">+ New Template</button>
    </div>
    ` : ''}
    ` : ''}
    ${iAmAdmin && canUsePriceBuilder() && PRICE_BUILDER_LIVE ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('pricebuilder')"><span class="arrow">${teamSectionOpen.pricebuilder?'▼':'▶'}</span> Price Sheet Rate Card <span class="plaintag" style="margin-left:4px;color:var(--slate-light);font-size:11px;font-weight:600;">Admin only for now</span></p>
    ${teamSectionOpen.pricebuilder ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">One shared rate card for the whole company, kept as an Excel file — download it, edit it (add items, rates, or new dropdown options right in the spreadsheet), then re-upload to update the app. The app is the source everyone works from; the Excel is just how you edit it.</p>
      <div class="row-gap" style="margin-bottom:12px;">
        <button class="ghostbtn" style="flex:1;" onclick="exportPriceRateExcel()">⬇ Download Rate Card (Excel)</button>
        <button class="darkbtn" style="flex:1;" onclick="document.getElementById('priceRateExcelInputTop').click()">⬆ Upload Rate Card (Excel)</button>
        <input type="file" id="priceRateExcelInputTop" accept=".xlsx,.xls" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="importPriceRateExcel(this)">
      </div>
      <div class="formfield" style="margin:0 0 16px;">
        <label class="field-label">Terms &amp; Conditions</label>
        <p class="stub" style="margin:0 0 6px;">Shown as its own page 1 on every Price Sheet PDF export, before the priced items — paste your subcontractor T&amp;Cs in here word for word.</p>
        <textarea id="pbTermsField" rows="6" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:inherit;box-sizing:border-box;" placeholder="Paste your subcontractor terms &amp; conditions here...">${escapeHtml((ORG && ORG.price_builder_terms) || '')}</textarea>
        <button class="ghostbtn" style="margin-top:6px;" onclick="savePriceBuilderTerms()">Save Terms</button>
      </div>
      ${priceRateCategories.map(cat=>`
        <p class="sectiontitle" style="margin:14px 0 6px;font-size:12.5px;">${escapeHtml(cat.name)}</p>
        ${cat.items.map(it=>`
          <div class="sitecard" style="padding:8px 10px;flex-wrap:wrap;">
            <div class="info" style="display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;">
              <input type="text" value="${escapeHtml(it.name)}" style="border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:13px;font-weight:700;font-family:inherit;background:#fff;color:var(--ink);" onblur="savePriceRateField(this,'${it.id}','name')">
              <div class="meta">${it.is_dropdown ? 'Dropdown — priced by option below' : escapeHtml(PRICE_UNIT_LABEL[it.unit]||it.unit)}</div>
            </div>
            ${!it.is_dropdown ? `
            <div style="display:flex;align-items:center;gap:3px;">£<input type="number" step="0.01" value="${it.rate!=null?it.rate:''}" style="width:70px;border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;background:#fff;color:var(--ink);" onblur="savePriceRateField(this,'${it.id}','rate')"></div>
            ` : ''}
            <div class="taskicon danger" onclick="deletePriceRateItem('${it.id}','${jsAttr(it.name)}')">🗑</div>
          </div>
          ${it.is_dropdown ? `
          <div style="margin:0 0 8px 14px;padding-left:10px;border-left:2px solid var(--line);">
            ${(priceRateOptionsByItem[it.id]||[]).map(o=>`
              <div class="sitecard" style="padding:6px 8px;">
                <div class="info"><input type="text" value="${escapeHtml(o.label)}" style="border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:12.5px;font-family:inherit;background:#fff;color:var(--ink);width:100%;box-sizing:border-box;" onblur="savePriceRateOptionField(this,'${o.id}','label')"></div>
                <div style="display:flex;align-items:center;gap:3px;">£<input type="number" step="0.01" value="${o.rate}" style="width:64px;border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:12.5px;font-family:inherit;background:#fff;color:var(--ink);" onblur="savePriceRateOptionField(this,'${o.id}','rate')"></div>
                <div class="taskicon danger" onclick="deletePriceRateOption('${o.id}','${it.id}')">🗑</div>
              </div>
            `).join('') || `<div class="empty" style="padding:6px;">No options yet.</div>`}
            <div class="ghostbtn" style="margin-top:4px;padding:6px;font-size:11px;" onclick="addPriceRateOption('${it.id}')">+ Add option</div>
          </div>
          ` : ''}
        `).join('')}
      `).join('') || `<div class="empty" style="padding:10px;">No rate card items yet — add your first one below.</div>`}
      ${priceRateAddOpen ? `
        <div class="formfield" style="margin-top:14px;"><input type="text" id="prCategory" placeholder="Category, e.g. Pitched Roof" value="${escapeHtml(priceRateAddLastCategory)}"></div>
        <div class="formfield"><input type="text" id="prName" placeholder="Item name, e.g. Strip"></div>
        <div class="formfield"><label class="field-label">Unit</label>
          <select id="prUnit"><option value="lm">Linear metre</option><option value="m2">m²</option><option value="each">Each</option></select>
        </div>
        <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 10px;"><input type="checkbox" id="prIsDropdown" style="width:auto;" onchange="document.getElementById('prRateRow').style.display=this.checked?'none':'block'">This is a dropdown (e.g. Tile Type) — priced by option, added after</label>
        <div class="formfield" id="prRateRow"><label class="field-label">Rate (£)</label><input type="number" step="0.01" id="prRate" placeholder="0.00"></div>
        <div class="row-gap">
          <button class="darkbtn" style="flex:1;" onclick="addPriceRateItem()">Add Item</button>
          <button class="ghostbtn" style="flex:1;" onclick="priceRateAddOpen=false;render()">Cancel</button>
        </div>
        <p class="stub" style="margin:12px 0 6px;">Prefer Excel for bulk changes — see Download/Upload Rate Card above.</p>
      ` : `
        <button class="darkbtn" style="margin-top:10px;" onclick="priceRateAddOpen=true;render()">+ Add Rate Item</button>
      `}
    </div>
    ` : ''}
    ` : ''}
    ${isManager(ME) ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('suppliers')"><span class="arrow">${teamSectionOpen.suppliers?'▼':'▶'}</span> Suppliers (All Projects)</p>
    ${teamSectionOpen.suppliers ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">One supplier list for the whole company — every site's Material Requests uses this same list.</p>
      ${suppliers.map(s=>`
        <div class="sitecard" style="padding:8px 10px;flex-wrap:wrap;">
          <div class="info" style="display:flex;flex-direction:column;gap:5px;min-width:0;flex:1;">
            <input type="text" value="${escapeHtml(s.name)}" style="border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:13px;font-weight:700;font-family:inherit;background:#fff;color:var(--ink);" onblur="saveSupplierField(this,'${s.id}','name')">
            <input type="email" value="${escapeHtml(s.email)}" style="border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;background:#fff;color:var(--ink);" onblur="saveSupplierField(this,'${s.id}','email')">
          </div>
          <span style="cursor:pointer;font-size:19px;line-height:1;color:${s.favourite?'#D9A441':'var(--line)'};align-self:center;" title="${s.favourite?'Unfavourite':'Favourite (up to 3 pin to the top)'}" onclick="toggleSupplierFavourite('${s.id}',${s.favourite?'true':'false'})">${s.favourite?'★':'☆'}</span>
          <div class="taskicon danger" onclick="deleteSupplier(null,'${s.id}')">🗑</div>
        </div>
      `).join('') || `<div class="empty" style="padding:10px;">No suppliers yet.</div>`}
      ${supplierAddOpen ? `
        <div class="formfield" style="margin-top:10px;"><input type="text" id="supName" placeholder="Supplier name"></div>
        <div class="formfield"><input type="email" id="supEmail" placeholder="Supplier order email"></div>
        <div class="row-gap">
          <button class="darkbtn" style="flex:1;" onclick="addSupplier(null)">Add Supplier</button>
          <button class="ghostbtn" style="flex:1;" onclick="supplierAddOpen=false;render()">Cancel</button>
        </div>
        <p class="stub" style="margin:12px 0 6px;">Or import a list — Excel/CSV with Name and Email columns (or Name in column A, Email in column B). Anything that looks like an existing supplier (or a near-identical spelling) is skipped automatically.</p>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;" onclick="document.getElementById('supplierExcelInputAdmin').click()">Choose Excel/CSV file</div>
        <input type="file" id="supplierExcelInputAdmin" accept=".xlsx,.xls,.csv" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="importSuppliersExcel(this,null)">
      ` : `
        <button class="darkbtn" style="margin-top:10px;" onclick="supplierAddOpen=true;render()">+ Add Supplier</button>
      `}
    </div>
    ` : ''}
    ` : ''}
    </div>
    ` : ''}
    ${isManager(ME) ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('maincontractor')"><span class="arrow">${teamSectionOpen.maincontractor?'▼':'▶'}</span> Main Contractor</p>
    ${teamSectionOpen.maincontractor ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Company-wide Main Contractor tools — shared across every site.</p>
      <button class="ghostbtn" style="display:block;margin-bottom:8px;" onclick="go('#/companylibrary')">📚 Subcontractor Library</button>
      <button class="ghostbtn" style="display:block;" onclick="go('#/team/libraries/reporttemplates')">📋 Templates (Report Templates, in Libraries)</button>
    </div>
    ` : ''}
    ` : ''}
    ${/* 2026-10-03: Health & Safety (H&S Policy, HAVS Tools, COSHH Library, PPE Log) and Invites & Users (incl. Check-In Logs) are shown to Project Managers as well as Admins — they already had the rights, the sections were just hidden. Toolbox Talk Templates and Device Locks stay admin-only. */ ''}
    ${isFullManager(ME) ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('healthsafety')"><span class="arrow">${teamSectionOpen.healthsafety?'▼':'▶'}</span> Health &amp; Safety</p>
    ${teamSectionOpen.healthsafety ? `
    <div style="margin:8px 0 0 14px;padding-left:10px;border-left:2px solid var(--line);">
    ${isManager(ME) ? `
    <p class="ddrow" style="margin-top:0;${ddHdr}" onclick="toggleTeamSection('hspolicy')"><span class="arrow">${teamSectionOpen.hspolicy?'▼':'▶'}</span> H&amp;S Policy</p>
    ${teamSectionOpen.hspolicy ? `
    <div class="card">
      ${hsPolicyAdmin.doc ? `
        <div style="font-weight:800;font-size:14px;">${escapeHtml(hsPolicyAdmin.doc.name)}</div>
        <div class="meta">Uploaded ${new Date(hsPolicyAdmin.doc.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})} by ${escapeHtml(nameOf(hsPolicyAdmin.doc.uploaded_by))}${hsPolicyAdmin.doc.expiry_date?' · Expires '+new Date(hsPolicyAdmin.doc.expiry_date+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}):''}${hsPolicyAdmin.supersedesName?' · Supersedes "'+escapeHtml(hsPolicyAdmin.supersedesName)+'"':''}</div>
        <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', hsPolicyAdmin.doc.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(hsPolicyAdmin.doc.name)?hsPolicyAdmin.doc.name:hsPolicyAdmin.doc.name+'.pdf')}')">View document ↗</div>
      ` : `<p class="stub" style="margin:0 0 10px;">No H&amp;S Policy document uploaded yet — everyone signs once and it's valid for a year (or until you upload a new version, or its expiry date is reached).</p>`}
    </div>
    ${hsPolicyAdmin.doc ? `
    <p class="ddrow" onclick="toggleHsPolicySignedList()"><span class="arrow">${hsPolicySignedListOpen?'▼':'▶'}</span> Signed (${hsPolicyAdmin.signedIds.size} of ${hsPolicyAdmin.allPeople.length})</p>
    ${hsPolicySignedListOpen ? `<div class="card">
      ${hsPolicyAdmin.allPeople.map(p=>`
        <div class="sitecard" style="padding:8px 10px;">
          <div class="info"><div class="name">${escapeHtml(p.name)}</div></div>
          ${hsPolicyAdmin.signedIds.has(p.id) ? `<span class="pill on">Signed</span>` : `<span class="pill off">Outstanding</span>`}
        </div>
      `).join('') || `<div class="empty" style="padding:10px;">No one on the team yet.</div>`}
    </div>` : ''}
    ` : ''}
    <p class="ddrow" onclick="hsPolicyUploadOpen=!hsPolicyUploadOpen;render()"><span class="arrow">${hsPolicyUploadOpen?'▼':'▶'}</span> ${hsPolicyAdmin.doc?'Upload New Version':'Upload H&amp;S Policy'}</p>
    ${hsPolicyUploadOpen ? `<div class="card">
      <div class="formfield" style="margin-top:0;"><input type="text" id="hsPolicyName" placeholder="Document name, e.g. Health & Safety Policy 2026" value="${hsPolicyAdmin.doc?escapeHtml(hsPolicyAdmin.doc.name):''}"></div>
      <div class="formfield" onclick="openDatePickerRow(this)"><label class="field-label">Expiry date (everyone must re-sign once reached)</label><input type="date" id="hsPolicyExpiry" value="${escapeHtml(defaultHsPolicyExpiry())}"></div>
      <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('hsPolicyFile').click()">Choose PDF</div>
      <input type="file" accept="application/pdf" id="hsPolicyFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('hsPolicyFileName').textContent=this.files[0]?this.files[0].name:''">
      <p class="stub" id="hsPolicyFileName" style="margin:-4px 0 10px;"></p>
      <button class="darkbtn" onclick="addHsPolicy()">${hsPolicyAdmin.doc?'Upload New Version':'Upload'}</button>
      ${hsPolicyAdmin.doc?`<p class="stub">Uploading a new version keeps the old one on file (marked Superseded) and everyone — including those who already signed — will need to sign it again.</p>`:''}
    </div>` : ''}
    ${hsPolicyAdmin.superseded.length ? `
    <p class="ddrow" onclick="hsPolicySupersededOpen=!hsPolicySupersededOpen;render()"><span class="arrow">${hsPolicySupersededOpen?'▼':'▶'}</span> Superseded Versions (${hsPolicyAdmin.superseded.length})</p>
    ${hsPolicySupersededOpen ? `<div class="card">${hsPolicyAdmin.superseded.map(d=>`
      <div style="padding:8px 0;border-bottom:1px solid var(--line);">
        <div style="font-weight:700;font-size:12.5px;">${escapeHtml(d.name)}</div>
        <div class="meta">Uploaded ${new Date(d.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})} · superseded${d.superseded_by?' by "'+escapeHtml(hsPolicyAdmin.nameById[d.superseded_by]||'a newer version')+'"':''}</div>
        <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', d.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(d.name)?d.name:d.name+'.pdf')}')">View document ↗</div>
      </div>
    `).join('')}</div>` : ''}
    ` : ''}
    ` : ''}
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('havstools')"><span class="arrow">${teamSectionOpen.havstools?'▼':'▶'}</span> HAVS Tools</p>
    ${teamSectionOpen.havstools ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">The vibration magnitude (m/s²) used to calculate everyone's HAVS exposure points. These are sensible starting defaults — update them if you have proper manufacturer or measured figures.</p>
      ${havsTools.map(t=>`
        <div class="sitecard" style="padding:8px 10px;flex-wrap:wrap;">
          <div class="info" style="display:flex;flex-direction:column;gap:5px;min-width:0;flex:1;">
            <input type="text" value="${escapeHtml(titleCaseWords(t.name))}" style="border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:13px;font-weight:700;font-family:inherit;background:#fff;color:var(--ink);" onblur="saveHavsToolField(this,'${t.id}','name')">
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="stub" style="margin:0;">Magnitude</span>
              <input type="number" step="0.1" min="0.1" value="${t.vibration_magnitude}" style="width:70px;border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;background:#fff;color:var(--ink);" onblur="saveHavsToolField(this,'${t.id}','vibration_magnitude')">
              <span class="stub" style="margin:0;">m/s²</span>
            </div>
          </div>
          <div class="taskicon danger" onclick="deleteHavsTool('${t.id}','${jsAttr(t.name)}')">🗑</div>
        </div>
      `).join('') || `<div class="empty" style="padding:10px;">No tools yet — add your first one below.</div>`}
      ${havsToolAddOpen ? `
        <div class="formfield" style="margin-top:10px;"><input type="text" id="havsToolName" placeholder="Tool name"></div>
        <div class="formfield"><input type="number" step="0.1" min="0.1" id="havsToolMag" placeholder="Vibration magnitude (m/s²)"></div>
        <div class="row-gap">
          <button class="darkbtn" style="flex:1;" onclick="addHavsTool()">Add Tool</button>
          <button class="ghostbtn" style="flex:1;" onclick="havsToolAddOpen=false;render()">Cancel</button>
        </div>
      ` : `
        <button class="darkbtn" style="margin-top:10px;" onclick="havsToolAddOpen=true;render()">+ Add Tool</button>
      `}
    </div>
    ` : ''}
    ` : ''}
    ${isManager(ME) ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('coshhlibrary')"><span class="arrow">${teamSectionOpen.coshhlibrary?'▼':'▶'}</span> COSHH Library</p>
    ${teamSectionOpen.coshhlibrary ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">One master COSHH library for the whole company, organised by element of works and manufacturer. Sites can pick documents straight from here instead of re-uploading them.</p>
      ${coshhLibraryHtmlBlock}
    </div>
    ` : ''}
    ` : ''}
    ${iAmAdmin ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('tbt')"><span class="arrow">${teamSectionOpen.tbt?'▼':'▶'}</span> Toolbox Talk Templates (All Sites)</p>
    ${teamSectionOpen.tbt ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Templates here are automatically copied into Bank TBT on every new site you create, so standard talks (e.g. Alcohol &amp; Drugs, Manual Handling) are already there without re-uploading per job.</p>
      ${tbtTemplates.map(t=>`
        <div class="sitecard" style="padding:8px 10px;">
          <div class="swatch">🗣</div>
          <div class="info"><div class="name">${escapeHtml(t.title)}</div><div class="addr">Added ${new Date(t.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div></div>
          <div class="taskicon danger" onclick="deleteTbtTemplate('${t.id}','${jsAttr(t.storage_path)}')">🗑</div>
        </div>
      `).join('') || `<div class="empty" style="padding:10px;">No templates yet — anything you upload here will be pre-loaded into every future site's Bank TBT.</div>`}
      <div class="formfield" style="margin-top:10px;"><input type="text" id="tbtTemplateTitle" placeholder="Title, e.g. Alcohol & Drugs"></div>
      <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('tbtTemplateFile').click()">Choose PDF</div>
      <input type="file" accept="application/pdf" id="tbtTemplateFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('tbtTemplateFileName').textContent=this.files[0]?this.files[0].name:''">
      <p class="stub" id="tbtTemplateFileName" style="margin:-4px 0 10px;"></p>
      <button class="ghostbtn" ${tbtTemplateBusy?'disabled':''} onclick="addTbtTemplate()">${tbtTemplateBusy?'Adding…':'Add to Bank'}</button>
    </div>
    ` : ''}
    ` : ''}
    ${isManager(ME) ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('ppelog')"><span class="arrow">${teamSectionOpen.ppelog?'▼':'▶'}</span> PPE Log</p>
    ${teamSectionOpen.ppelog ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">PPE issued across every site, for whichever period and operative(s) you choose.</p>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <div style="display:flex;gap:6px;">
          <button class="${ppeLogMode==='weekly'?'darkbtn':'ghostbtn'}" style="width:auto;padding:4px 10px;font-size:11px;" onclick="setPpeLogMode('weekly')">Weekly</button>
          <button class="${ppeLogMode==='monthly'?'darkbtn':'ghostbtn'}" style="width:auto;padding:4px 10px;font-size:11px;" onclick="setPpeLogMode('monthly')">Monthly</button>
          <button class="${ppeLogMode==='yearly'?'darkbtn':'ghostbtn'}" style="width:auto;padding:4px 10px;font-size:11px;" onclick="setPpeLogMode('yearly')">Yearly</button>
        </div>
        <div style="position:relative;" data-ppelogopfilter-root>
          <button type="button" onclick="event.stopPropagation();togglePpeLogOperativeFilterOpen()" title="Filter by operative" style="width:auto;padding:4px 10px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:20px;border:1px solid var(--line);background:${ppeLogOperativeIds.length?'var(--brand1)':'#fff'};color:${ppeLogOperativeIds.length?'#fff':'var(--slate)'};cursor:pointer;">
            ${ppeLogOperativeIds.length ? (ppeLogOperativeIds.length===1 ? escapeHtml((nameOf(ppeLogOperativeIds[0])||'1 selected')) : ppeLogOperativeIds.length+' selected') : 'All operatives'} ${ppeLogOperativeFilterOpen?'▲':'▼'}
          </button>
          ${ppeLogOperativeFilterOpen ? `
            <div style="position:absolute;right:0;top:calc(100% + 6px);z-index:50;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.18);padding:8px;min-width:170px;max-height:220px;overflow-y:auto;">
              ${people.filter(p=>p.role==='operative').map(p=>`
                <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:12.5px;font-weight:600;text-transform:none;letter-spacing:normal;color:var(--ink);cursor:pointer;">
                  <input type="checkbox" ${ppeLogOperativeIds.includes(p.id)?'checked':''} onchange="togglePpeLogOperativeId('${p.id}')">
                  ${escapeHtml(p.name)}
                </label>
              `).join('')}
              ${ppeLogOperativeIds.length ? `<div style="border-top:1px solid var(--line);margin-top:4px;padding-top:6px;text-align:center;"><span style="font-size:11.5px;color:var(--brand1);cursor:pointer;text-decoration:underline;" onclick="clearPpeLogOperativeFilter()">Clear</span></div>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <span class="taskicon" onclick="shiftPpeLog(-1)">‹</span>
        <span style="font-weight:800;font-size:13px;">${escapeHtml(ppeLogRange(ppeLogMode, ppeLogOffset).label)}</span>
        <span class="taskicon" style="${ppeLogOffset>=0?'opacity:.35;pointer-events:none;':''}" onclick="shiftPpeLog(1)">›</span>
      </div>
      ${(()=>{
        const rows = (ppeLogOperativeIds.length ? ppeLogRows.filter(r=>ppeLogOperativeIds.includes(r.user_id)) : ppeLogRows);
        if(!rows.length) return `<div class="empty" style="padding:10px;">No PPE issued in this period.</div>`;
        return rows.map(r=>{
          const site = SITES.find(s=>s.id===r.site_id);
          return `
          <div class="sitecard" style="padding:8px 10px;flex-direction:column;align-items:stretch;">
            <div style="display:flex;justify-content:space-between;gap:8px;">
              <span class="name" style="font-weight:800;">${escapeHtml(nameOf(r.user_id))}</span>
              <span class="pill ${r.status==='signed'?'on':'off'}">${r.status==='signed'?'Signed':'Pending'}</span>
            </div>
            <div class="addr">${(r.items||[]).map(escapeHtml).join(', ')}</div>
            <div class="meta">${site?escapeHtml(site.name):''} · ${new Date(r.issued_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
          </div>`;
        }).join('');
      })()}
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="darkbtn" style="flex:1;" onclick="exportPpeLog()">Export to Excel</button>
        <button class="darkbtn" style="flex:1;" onclick="exportPpeLogPdf()">Export to PDF</button>
      </div>
      <p class="stub" style="margin:14px 0 8px;">A different view — one row per operative showing what PPE they currently hold, not a chronological log.</p>
      <button class="ghostbtn" onclick="exportPpeRegister()">📋 Export PPE Register (all operatives)</button>
    </div>
    ` : ''}
    ` : ''}
    </div>
    ` : ''}
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('invitesusers')"><span class="arrow">${teamSectionOpen.invitesusers?'▼':'▶'}</span> Invites &amp; Users</p>
    ${teamSectionOpen.invitesusers ? `
    <div style="margin:8px 0 0 14px;padding-left:10px;border-left:2px solid var(--line);">
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('invites')"><span class="arrow">${teamSectionOpen.invites?'▼':'▶'}</span> Invites</p>
    ${teamSectionOpen.invites ? `
    <div class="card">
      ${permanentInvite ? `
        <p class="stub" style="margin:0 0 8px;">Share this one link with as many operatives as you like — it never expires and can be used more than once. Used ${permanentInvite.use_count} time${permanentInvite.use_count===1?'':'s'} so far.</p>
        <input type="text" readonly value="${escapeHtml(OPHUB_WEB_URL + '#/join/' + permanentInvite.id)}" style="font-size:11.5px;margin-bottom:8px;" onclick="this.select()">
        <button class="ghostbtn" onclick="copyPermanentInviteLink('${permanentInvite.id}')">Copy Link</button>
        <button class="ghostbtn" style="margin-top:8px;color:var(--warn);" onclick="revokePermanentInvite('${permanentInvite.id}')">Revoke &amp; Create New Link</button>
      ` : `
        <p class="stub" style="margin:0 0 8px;">Create one link you can share with your whole team at once — in a group chat, on a noticeboard, or as a QR code — instead of sending a separate link to each operative.</p>
        <button class="darkbtn" ${permanentInviteBusy?'disabled':''} onclick="createPermanentInvite()">${permanentInviteBusy?'Creating…':'Create Permanent Invite Link'}</button>
      `}
      <p class="sectiontitle" style="margin-top:16px;">One-time invite</p>
      ${newInviteLink ? `
        <p class="stub" style="margin:0 0 8px;">Share this link — it works once, for the next 14 days:</p>
        <input type="text" readonly value="${escapeHtml(newInviteLink)}" style="font-size:11.5px;margin-bottom:8px;" onclick="this.select()">
        <button class="ghostbtn" onclick="copyInviteLink()">Copy Link</button>
        <p class="sectiontitle" style="margin-top:16px;">Or email it to them</p>
        <p class="stub" style="margin:0 0 8px;">We'll send a nicely branded invite email with a button that takes them straight to sign-up.</p>
        <div class="formfield"><input type="email" id="inviteEmailInput" placeholder="operative@example.com"></div>
        <button class="darkbtn" ${inviteEmailBusy?'disabled':''} onclick="sendInviteEmail()">${inviteEmailBusy?'Sending…':'Send Invite Email'}</button>
      ` : `
        <p class="stub" style="margin:0 0 8px;">Prefer a single-use link for one person instead of the permanent link above?</p>
        <div class="formfield"><label class="field-label">Invite as</label>
          <select id="newInviteRole">
            <option value="operative">Operative</option>
            <option value="driver">Delivery Driver</option>
            <option value="client">Client (view-only)</option>
          </select>
        </div>
        <button class="ghostbtn" ${invitesBusy?'disabled':''} onclick="generateInvite()">${invitesBusy?'Creating…':'Generate One-Time Invite Link'}</button>
        <p class="stub" style="margin:8px 0 0;">A Client invite gives read-only access (RAMS, COSHH, Toolbox Talks, Schedule of Works, completed inspections, snagging and the operative dashboard) once a PM assigns them to a site — they can view and export, but never sign or edit anything. An Operative can be promoted to Project Manager below once they've joined.</p>
      `}
      ${pendingInvites.length ? `
        <p class="sectiontitle" style="margin-top:14px;">Pending invites</p>
        ${pendingInvites.map(i=>`
          <div class="sitecard" style="padding:8px 10px;">
            <div class="info">${i.email ? `<div class="name">${escapeHtml(i.email)}</div>` : ''}<div class="addr">Created ${new Date(i.created_at).toLocaleDateString('en-GB')} · expires ${new Date(i.expires_at).toLocaleDateString('en-GB')}</div></div>
            <button class="ghostbtn" style="width:auto;padding:6px 10px;" onclick="revokeInvite('${i.id}')">Revoke</button>
          </div>
        `).join('')}
      ` : ''}
    </div>
    ` : ''}
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('users')"><span class="arrow">${teamSectionOpen.users?'▼':'▶'}</span> Users</p>
    ${teamSectionOpen.users ? `
    <p class="sectiontitle" style="margin-top:14px;">Company Admins</p>
    ${people.filter(p=>p.role==='admin').map(p=>`
      <div class="sitecard" style="flex-wrap:wrap;${p.id!==ME.id && iAmAdmin ? 'cursor:pointer;' : ''}" ${p.id!==ME.id && iAmAdmin ? `onclick="toggleUserActions('${p.id}')"` : ''}>
        <div class="swatch personswatch" style="background:linear-gradient(135deg,var(--brand2),#000);">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name">${escapeHtml(p.name)}${p.id===ME.id?' (you)':''}</div><div class="addr">${escapeHtml(p.email)}</div></div>
        ${userActionsOpenFor[p.id] ? roleActionsHtml(ME, p, people) : ''}
      </div>
    `).join('') || `<div class="empty">No other admins yet.</div>`}

    <p class="sectiontitle" style="margin-top:18px;">Project Managers</p>
    ${people.filter(p=>p.role==='pm' && !p.is_estimator).map(p=>`
      <div class="sitecard" style="flex-wrap:wrap;${p.id!==ME.id && isFullManager(ME) ? 'cursor:pointer;' : ''}" ${p.id!==ME.id && isFullManager(ME) ? `onclick="toggleUserActions('${p.id}')"` : ''}>
        <div class="swatch personswatch">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name">${escapeHtml(p.name)}${p.id===ME.id?' (you)':''}</div><div class="addr">${escapeHtml(p.email)}</div></div>
        ${userActionsOpenFor[p.id] ? roleActionsHtml(ME, p, people) : ''}
      </div>
    `).join('') || `<div class="empty">No project managers yet.</div>`}
    ${people.some(p=>isEstimator(p)) ? estimatorsSectionHtml(people) : ''}

    <p class="sectiontitle" style="margin-top:18px;">Site Managers</p>
    ${people.filter(p=>p.role==='site_manager').map(p=>`
      <div class="sitecard" style="flex-wrap:wrap;${p.id!==ME.id && isFullManager(ME) ? 'cursor:pointer;' : ''}" ${p.id!==ME.id && isFullManager(ME) ? `onclick="toggleUserActions('${p.id}')"` : ''}>
        <div class="swatch personswatch" style="background:linear-gradient(135deg,#6B6F78,#3a3c40);">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name">${escapeHtml(p.name)}${p.id===ME.id?' (you)':''}</div><div class="addr">${escapeHtml(p.email)}</div></div>
        ${userActionsOpenFor[p.id] ? roleActionsHtml(ME, p, people) : ''}
      </div>
    `).join('') || `<div class="empty">No site managers yet.</div>`}

    <p class="sectiontitle" style="margin-top:18px;">Operatives</p>
    ${people.filter(p=>p.role==='operative').map(p=>`
      <div class="sitecard" style="flex-wrap:wrap;cursor:pointer;" onclick="toggleUserActions('${p.id}')">
        <div class="swatch personswatch" style="background:linear-gradient(135deg,#4B4F58,#2a2c30);">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name">${escapeHtml(p.name)}</div><div class="addr">${escapeHtml(p.email)}</div></div>
        ${userActionsOpenFor[p.id] ? roleActionsHtml(ME, p, people) : ''}
      </div>
    `).join('') || `<div class="empty">No operatives yet.</div>`}

    <p class="sectiontitle" style="margin-top:18px;">Delivery Drivers</p>
    ${people.filter(p=>p.role==='driver').map(p=>`
      <div class="sitecard" style="flex-wrap:wrap;cursor:pointer;" onclick="toggleUserActions('${p.id}')">
        <div class="swatch personswatch" style="background:linear-gradient(135deg,var(--brand1),#000);">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name">${escapeHtml(p.name)}</div><div class="addr">${escapeHtml(p.email)}</div></div>
        ${userActionsOpenFor[p.id] ? roleActionsHtml(ME, p, people) : ''}
      </div>
    `).join('') || `<div class="empty">No delivery drivers yet.</div>`}

    <p class="sectiontitle" style="margin-top:18px;">Clients</p>
    ${people.filter(p=>p.role==='client').map(p=>`
      <div class="sitecard" style="flex-wrap:wrap;cursor:pointer;" onclick="toggleUserActions('${p.id}')">
        <div class="swatch personswatch" style="background:linear-gradient(135deg,#4B4F58,#2a2c30);">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name">${escapeHtml(p.name)}</div><div class="addr">${escapeHtml(p.email)}</div></div>
        ${userActionsOpenFor[p.id] ? roleActionsHtml(ME, p, people) : ''}
      </div>
    `).join('') || `<div class="empty">No clients yet.</div>`}
    <p class="stub" style="margin-top:14px;">Project Managers and Admins can remove Operatives and Site Managers. Only a Company Admin can remove a Project Manager or another Admin. A Company Admin can promote anyone straight to Admin, or move people between Operative, Site Manager, Project Manager and Admin here — you can't change your own role, and the last remaining Admin can't be demoted (add another Admin first). A Site Manager works day-to-day like a Project Manager but only on the sites they're assigned to, and can't create/delete sites or manage other people's accounts.</p>
    ` : ''}
    ${isFullManager(ME) ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('drivercheckins')"><span class="arrow">${teamSectionOpen.drivercheckins?'▼':'▶'}</span> Driver Check-In Log</p>
    ${teamSectionOpen.drivercheckins ? driverCheckinLogHtml(driverCheckinRows, driverBreakRows) : ''}
    ` : ''}
    ${isManager(ME) ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('checkinlogs')"><span class="arrow">${teamSectionOpen.checkinlogs?'▼':'▶'}</span> Check-In Logs</p>
    ${teamSectionOpen.checkinlogs ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Every operative's check-in / check-out times, across all sites.</p>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
        <div style="display:flex;gap:6px;">
          <button class="${checkinLogMode==='weekly'?'darkbtn':'ghostbtn'}" style="width:auto;padding:4px 10px;font-size:11px;" onclick="setCheckinLogMode('weekly')">Weekly</button>
          <button class="${checkinLogMode==='monthly'?'darkbtn':'ghostbtn'}" style="width:auto;padding:4px 10px;font-size:11px;" onclick="setCheckinLogMode('monthly')">Monthly</button>
        </div>
        <div style="position:relative;" data-checkinopfilter-root>
          <button type="button" onclick="event.stopPropagation();toggleCheckinLogOperativeFilterOpen()" title="Filter by operative" style="width:auto;padding:4px 10px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:20px;border:1px solid var(--line);background:${checkinLogOperativeIds.length?'var(--brand1)':'#fff'};color:${checkinLogOperativeIds.length?'#fff':'var(--slate)'};cursor:pointer;">
            ${checkinLogOperativeIds.length ? (checkinLogOperativeIds.length===1 ? escapeHtml((nameOf(checkinLogOperativeIds[0])||'1 selected')) : checkinLogOperativeIds.length+' selected') : 'All operatives'} ${checkinLogOperativeFilterOpen?'▲':'▼'}
          </button>
          ${checkinLogOperativeFilterOpen ? `
            <div style="position:absolute;right:0;top:calc(100% + 6px);z-index:50;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.18);padding:8px;min-width:170px;max-height:220px;overflow-y:auto;">
              ${people.filter(p=>p.role==='operative').map(p=>`
                <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:12.5px;font-weight:600;text-transform:none;letter-spacing:normal;color:var(--ink);cursor:pointer;">
                  <input type="checkbox" ${checkinLogOperativeIds.includes(p.id)?'checked':''} onchange="toggleCheckinLogOperativeId('${p.id}')">
                  ${escapeHtml(p.name)}
                </label>
              `).join('')}
              ${checkinLogOperativeIds.length ? `<div style="border-top:1px solid var(--line);margin-top:4px;padding-top:6px;text-align:center;"><span style="font-size:11.5px;color:var(--brand1);cursor:pointer;text-decoration:underline;" onclick="clearCheckinLogOperativeFilter()">Clear</span></div>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <span class="taskicon" style="${checkinLogFromDate&&checkinLogToDate?'opacity:.35;pointer-events:none;':''}" onclick="shiftCheckinLog(-1)">‹</span>
        <span style="font-weight:800;font-size:13px;">${escapeHtml(checkinLogEffectiveRange().label)}</span>
        <span class="taskicon" style="${(checkinLogOffset>=0)||(checkinLogFromDate&&checkinLogToDate)?'opacity:.35;pointer-events:none;':''}" onclick="shiftCheckinLog(1)">›</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
        <span style="font-size:11px;color:var(--slate);font-weight:700;">From</span>
        <input type="date" value="${escapeHtml(checkinLogFromDate)}" onchange="setCheckinLogFromDate(this.value)" style="width:auto;padding:4px 6px;font-size:11px;">
        <span style="font-size:11px;color:var(--slate);font-weight:700;">To</span>
        <input type="date" value="${escapeHtml(checkinLogToDate)}" onchange="setCheckinLogToDate(this.value)" style="width:auto;padding:4px 6px;font-size:11px;">
        ${checkinLogFromDate||checkinLogToDate ? `<span style="font-size:11.5px;color:var(--brand1);cursor:pointer;text-decoration:underline;" onclick="clearCheckinLogDateFilter()">Clear</span>` : ''}
      </div>
      ${(()=>{
        const operatives = people.filter(p=>p.role==='operative' && (!checkinLogOperativeIds.length || checkinLogOperativeIds.includes(p.id)));
        if(!operatives.length) return `<div class="empty" style="padding:10px;">No operatives yet.</div>`;
        return operatives.map(op=>{
          const rows = checkinLogRows.filter(c=>c.user_id===op.id);
          if(!rows.length) return `
            <div class="sitecard" style="padding:8px 10px;flex-direction:column;align-items:stretch;">
              <div class="name" style="font-weight:800;">${escapeHtml(op.name)}</div>
              <div class="stub" style="margin-top:2px;">No check-ins this ${checkinLogMode==='weekly'?'week':'month'}.</div>
            </div>`;
          const sessions = pairCheckinSessions(rows);
          // Group sessions by calendar day so a week/month reads as a list
          // of days rather than one long undifferentiated feed.
          const byDay = {};
          sessions.forEach(s=>{
            const dayKey = new Date(s.inTs||s.outTs).toLocaleDateString('en-GB');
            (byDay[dayKey] = byDay[dayKey]||[]).push(s);
          });
          let totalMs = 0;
          const dayRows = Object.keys(byDay).map(dayKey=>{
            const daySessions = byDay[dayKey];
            const parts = daySessions.map(s=>{
              const inStr = s.inTs ? new Date(s.inTs).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '—';
              const outStr = s.outTs ? new Date(s.outTs).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : 'still on site';
              if(s.inTs && s.outTs) totalMs += (new Date(s.outTs) - new Date(s.inTs));
              return `${inStr} – ${outStr}`;
            });
            return `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line);"><span>${dayKey}</span><span style="color:var(--slate);">${parts.join(', ')}</span></div>`;
          });
          const totalHrs = (totalMs/3600000).toFixed(1);
          return `
            <div class="sitecard" style="padding:10px;flex-direction:column;align-items:stretch;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <div class="name" style="font-weight:800;">${escapeHtml(op.name)}</div>
                <span class="rolechip" style="margin:0;">${totalHrs}h</span>
              </div>
              ${dayRows.join('')}
            </div>`;
        }).join('');
      })()}
    </div>
    ` : ''}
    ` : ''}
    ${isFullManager(ME) ? `
    <p class="ddrow" style="${ddHdr}" onclick="toggleTeamSection('devicelocks')"><span class="arrow">${teamSectionOpen.devicelocks?'▼':'▶'}</span> Device Locks (one phone = one person)</p>
    ${teamSectionOpen.devicelocks ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Everyone except Project Managers and admins is locked to one phone, and each phone to one person — whether they use the app or the web browser. A person's first phone locks to them automatically. A second phone, or a phone that looks the same as one already locked to somebody else, waits here for approval. Unlock removes a lock entirely (e.g. lost phone, locked by mistake).</p>
      ${deviceLocks.some(d=>d.status==='pending') ? `
      <p class="field-label" style="margin:0 0 6px;color:var(--warn);">Awaiting approval</p>
      ${deviceLocks.filter(d=>d.status==='pending').map(d=>`
        <div class="sitecard" style="padding:8px 10px;border-color:var(--warn);background:var(--warn-bg);">
          <div class="info"><div class="name">${escapeHtml(d.user_name||'Unknown')}</div><div class="addr">Requested ${new Date(d.requested_at||d.locked_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} — new device</div></div>
          <div style="display:flex;gap:6px;">
            <button class="darkbtn" style="width:auto;padding:6px 10px;" onclick="approvePendingDevice('${d.device_id}')">Approve</button>
            <button class="ghostbtn" style="width:auto;padding:6px 10px;color:var(--red);border-color:var(--red);" onclick="unlockDevice('${d.device_id}')">Deny</button>
          </div>
        </div>
      `).join('')}
      <p class="field-label" style="margin:14px 0 6px;">Approved devices</p>
      ` : ''}
      ${deviceLocks.filter(d=>d.status!=='pending').length ? deviceLocks.filter(d=>d.status!=='pending').map(d=>`
        <div class="sitecard" style="padding:8px 10px;">
          <div class="info"><div class="name">${escapeHtml(d.user_name||'Unknown')}</div><div class="addr">Last used ${new Date(d.last_seen_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div></div>
          <button class="ghostbtn" style="width:auto;padding:6px 10px;" onclick="unlockDevice('${d.device_id}')">Unlock</button>
        </div>
      `).join('') : `<div class="empty" style="padding:10px;">No devices locked yet.</div>`}
    </div>
    ` : ''}
    ` : ''}
    </div>
    ` : ''}
    ` : ''}
    </div>` : ''}
    ${!adminPage ? `    <p style="text-align:center;margin-top:20px;">
      <span class="stub">${escapeHtml(ME.name)} · ${escapeHtml(ME.email)}</span><br>
      <span class="stub" style="cursor:pointer;text-decoration:underline;" onclick="go('#/signature')">${ME.signature_path?'My signature':'Adopt your signature'}</span><br>
      <span class="stub" style="cursor:pointer;text-decoration:underline;" onclick="doSignOut()">Sign out</span>
    </p>
    ` : ''}
  `, {title: adminItem ? adminItem.label : (adminPage ? ADMIN_PAGES[adminPage].label : 'Admin Centre'), back: teamBackFrom ? decodeURIComponent(teamBackFrom) : (adminBack || '#/sites'), tabs:false, showRoleChip:!adminPage, titleGoesHome:true});
    if(!adminPage && adminSearch) adminSearchRender(); }
}
let teamSectionOpen = {branding:false, integrations:false, brandingintegrations:false, libraries:false, reporttemplates:false, suppliers:false, healthsafety:false, tbt:false, devicelocks:false, checkinlogs:false, havstools:false, coshhlibrary:false, operativetools:false, invites:false, users:false, ppelog:false, invitesusers:false, hspolicy:false, pricebuilder:false, sowlibrary:false};