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
  suppliers:      {page:'libraries', group:'Works & pricing',     icon:'🏪', label:'Suppliers',            sub:'Used on all projects',             flags:['suppliers'],                    kw:'supplier merchant', show:()=>isManager(ME)},
  maincontractor: {page:'libraries', group:'Works & pricing',     icon:'🏢', label:'Main Contractor',      sub:'Inspection templates',             flags:['maincontractor'],               kw:'main contractor mc inspection', show:()=>isManager(ME)},
  hspolicy:       {page:'libraries', group:'Health & Safety',     icon:'📕', label:'H&S Policy',           sub:'Policy document and who has signed', flags:['hspolicy'],                   kw:'health safety policy', show:()=>isFullManager(ME)},
  havstools:      {page:'libraries', group:'Health & Safety',     icon:'🛠️', label:'HAVS Tools',           sub:'Vibration tool list',              flags:['havstools'],                    kw:'havs vibration tools', show:()=>isFullManager(ME)},
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
