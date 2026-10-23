/* ============================================================
   OpHUB Finance — sections and sub-pages
   Laid out like Construction Manager (a menu of areas, each with its own
   pages) but grouped the way the work flows:
     Overview        numbers and what needs attention
     Jobs            jobs list · clients
     Sales           applications · certificates · invoices · receipts · retention   (money in)
     Purchases       orders · purchase invoices · invoice inbox · plant hire · suppliers (money out)
     Subcontractors & Labour  orders · applications · payments · labour & timesheets · CIS · rates & workers
     Reports
     Settings        (Team, Suppliers, My account for Finance-only companies)
   On a computer: section bar + sub-tabs. On a phone: section grid + sub-tabs.
   ============================================================ */
const FIN_SECTIONS = [
  {k:'overview', l:'Overview', go:'#/finance'},
  {k:'jobs', l:'Projects', go:'#/finance/jobs'},
  {k:'sales', l:'Sales', go:'#/finance/sales'},
  {k:'purchases', l:'Purchases', go:'#/finance/purchases'},
  {k:'subs', l:'Subcontractors & Labour', go:'#/finance/subs'},
  {k:'reports', l:'Reports', go:'#/finance/reports'},
  {k:'settings', l:'Settings', go:'#/finance/settings'},
];
const FIN_SUBS = {
  jobs: [['list','Projects','#/finance/jobs'], ['clients','Clients','#/finance/jobs/clients']],
  sales: [['apps','Applications & Certificates','#/finance/sales/apps'], ['invoices','Invoices','#/finance/sales/invoices'], ['retention','Retention','#/finance/sales/retention']],
  purchases: [['orders','Purchase orders','#/finance/purchases/orders'], ['invoices','Purchase invoices','#/finance/purchases/invoices'], ['plant','Plant hire','#/finance/purchases/plant'], ['suppliers','Suppliers','#/finance/purchases/suppliers'], ['pricebook','Price book','#/finance/purchases/pricebook']],
  subs: [['opinv','Operative invoices','#/finance/subs/opinv'], ['payrun','Pay run','#/finance/labour/payrun'], ['orders','Subcontractor POs','#/finance/subs/orders'], ['apps','Applications & Certificates','#/finance/subs/apps'], ['cis','CIS','#/finance/labour/cis'], ['rates','People & rates','#/finance/labour/rates']],
};
function finSectionNav(active){
  return `<nav class="finsecnav" aria-label="Finance sections">${FIN_SECTIONS.map(s=>`<button type="button" class="${s.k===active?'on':''}" onclick="go('${s.go}')">${s.l}</button>`).join('')}</nav>`;
}
function finSubTabs(sec, active, badges){
  const subs = FIN_SUBS[sec] || []; badges = badges || {};
  if(subs.length < 2) return ''; // one tab only (e.g. Projects) — no need to repeat the heading
  return `<div class="finsubtabs">${subs.map(([k,l,g])=>`<button type="button" class="${k===active?'on':''}" onclick="go('${g}')">${l}${badges[k]?` <span class="finsubtabs-n">${badges[k]}</span>`:''}</button>`).join('')}</div>`;
}
// Section pages: Back goes to the OpHUB home (nowhere for Finance-only companies).
function finSecBack(){ return (typeof isFinanceOnly==='function' && isFinanceOnly()) ? null : homeHash(); }
function finJobTag(siteId){ const s = SITES.find(x=>x.id===siteId) || {}; return (s.job_number ? s.job_number+' · ' : '')+(s.name||''); }
function finRepJobOr(s){ return (s.job_number ? s.job_number+' ' : '')+(s.name||''); }
const finChip = (on, label, n, onclick)=>`<button type="button" class="pmchip ${on?'on':''}" onclick="${onclick}">${label}${n!=null?` <span class="finchip-n">${n}</span>`:''}</button>`;

// Choose a job, then carry on (for "+ New invoice", "+ New PO" etc. on section pages).
window.finPickJob = function(title, fnName){
  const jobs = SITES.filter(s=>finSiteStatus(s)!=='closed').sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
  let ov = document.getElementById('finPickOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPickOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${escapeHtml(title)}</h3>
    <p class="stub" style="margin:0 0 10px;">Which project is it for?</p>
    <div class="formfield"><input type="text" placeholder="Search projects" oninput="liveFilter(this.value,'#finPickList')"></div>
    <div id="finPickList">${jobs.map(s=>`<button type="button" class="pmrow finrow" data-lf="${lfText([s.job_number, s.name, s.client_name].join(' '))}" onclick="document.getElementById('finPickOverlay').style.display='none';${fnName}('${s.id}')"><span class="finjobno">${escapeHtml(s.job_number||'—')}</span><span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(s.name)}</span><span class="pmrow-s">${escapeHtml(s.client_name||'')}</span></span></button>`).join('')}<div class="empty lf-empty" style="display:none;">No match.</div></div>
    <button class="geo-modal-cancel" onclick="document.getElementById('finPickOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
function finListHtml(id, rows, empty){ return `<div id="${id}">${rows.join('')}<div class="empty lf-empty" style="${rows.length?'display:none;':''}">${empty}</div></div>`; }
function finSearchHtml(ph, target){ return `<div class="formfield"><input type="text" placeholder="${escapeHtml(ph)}" oninput="liveFilter(this.value,'#${target}')"></div>`; }
function finSecHead(title, btnLabel, btnClick){ return `<div class="finsechead"><h3>${escapeHtml(title)}</h3>${btnLabel?`<button class="darkbtn" onclick="${btnClick}">${btnLabel}</button>`:''}</div>`; }

/* ================= Overview ================= */
async function renderFinanceHome(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const [jf, pos, invs, apps, st, toApprove, onHire, inbox, subApps] = await Promise.all([
    dbSelect('job_finance', 'org_id=eq.'+ME.org_id+'&select=site_id,contract_value,app_reminder_day,app_dates,pc_date,defects_months,ret1_invoice_id,ret2_invoice_id'),
    dbSelect('client_pos', 'org_id=eq.'+ME.org_id+'&select=site_id'),
    dbSelect('fin_invoices', 'org_id=eq.'+ME.org_id+'&status=neq.void&limit=2000&select=id,site_id,status,due_date,total,paid,net'),
    dbSelect('fin_applications', 'org_id=eq.'+ME.org_id+'&limit=2000&select=site_id,number,valuation_date,status,cert_retention'),
    finLoadSettings(),
    dbSelect('purchase_invoices', 'org_id=eq.'+ME.org_id+'&status=in.(to_approve,query)&select=id,net'),
    dbSelect('fin_plant_hires', 'org_id=eq.'+ME.org_id+'&off_hire=is.null&select=id,site_id,item,on_hire,rate,rate_period'),
    dbSelect('fin_inbox', 'org_id=eq.'+ME.org_id+'&status=eq.new&stage=neq.with_pm&extracted=not.is.null&select=id'),
    dbSelect('fin_sub_apps', 'org_id=eq.'+ME.org_id+'&status=eq.received&select=id'),
  ]);
  const xeroReady = typeof finXeroReadyLoad==='function' ? await finXeroReadyLoad() : [];
  if(__gen !== RENDER_GEN) return;
  if(typeof finXeroMaybePull==='function') finXeroMaybePull();
  if(typeof finInboxAutoProcess==='function') finInboxAutoProcess().then(ch=>{ if(ch && __gen===RENDER_GEN) render(); });
  const appsBy = {}; apps.forEach(a=>{ (appsBy[a.site_id] = appsBy[a.site_id] || []).push(a); });
  const jfBy = {}; jf.forEach(r=>{ jfBy[r.site_id] = r; });
  const hasPo = new Set(pos.map(p=>p.site_id));
  const liveSites = SITES.filter(s=>finSiteStatus(s)==='live');
  const liveValue = liveSites.reduce((t,s)=>t + Number((jfBy[s.id]||{}).contract_value||0), 0);
  const noPo = liveSites.filter(s=>!hasPo.has(s.id)), noValue = liveSites.filter(s=>!(jfBy[s.id]||{}).contract_value);
  const owed = invs.reduce((t,i)=>t+finInvOutstanding(i), 0);
  const overdueInv = invs.filter(finInvOverdue), overdue = overdueInv.reduce((t,i)=>t+finInvOutstanding(i), 0);
  const retHeld = SITES.reduce((t,s)=>t+finRetentionHeld(appsBy[s.id]||[]), 0);
  const retDue = SITES.map(s=>({s, a:finRetentionAlerts(jfBy[s.id], st, finRetentionHeld(appsBy[s.id]||[]))})).filter(x=>x.a.length);
  const appsDue = liveSites.filter(s=>finAppDueThisMonth(appsBy[s.id]||[], finAppDateFor(jfBy[s.id], st, finToday().slice(0,7))));
  const longHire = onHire.filter(h=>finPlantCost(h).days>28);
  const one = (list, single, many)=>list.length===1 ? single(list[0]) : many;
  const todo = [];
  if(appsDue.length) todo.push({tone:'warn', t:'Applications due this month', s:appsDue.map(finRepJobOr).join(', '), n:appsDue.length, go:one(appsDue, s=>`#/site/${s.id}/finance`, '#/finance/sales/apps')});
  if(overdueInv.length) todo.push({tone:'bad', t:'Overdue invoices', s:finMoney(overdue, 0)+' to chase', n:overdueInv.length, go:'#/finance/sales/invoices', pre:"finInvFilter='overdue';"});
  if(toApprove.length) todo.push({tone:'warn', t:'Purchase invoices to approve', s:finMoney(toApprove.reduce((t,i)=>t+Number(i.net||0),0), 0)+' excl. VAT', n:toApprove.length, go:'#/finance/purchases/invoices', pre:"finPiF='approve';finPiPicked=true;"});
  if(inbox.length) todo.push({tone:'blue', t:'Unallocated purchase invoices', s:'We couldn’t tell the job — allocate them or send to a PM', n:inbox.length, go:'#/finance/purchases/invoices', pre:"finPiF='job';finPiPicked=true;"});
  if(subApps.length) todo.push({tone:'warn', t:'Subcontractor applications to certify', s:'Send a payment or pay less notice in time', n:subApps.length, go:'#/finance/subs/apps', pre:"finSaFilter='received';"});
  if(retDue.length) todo.push({tone:'blue', t:'Retention to claim back', s:retDue.map(x=>finRepJobOr(x.s)).join(', '), n:retDue.length, go:'#/finance/sales/retention'});
  if(longHire.length) todo.push({tone:'warn', t:'Plant on hire over 4 weeks', s:longHire.map(h=>h.item).join(', '), n:longHire.length, go:'#/finance/purchases/plant'});
  if(noPo.length) todo.push({tone:'grey', t:'Live projects with no client PO', s:noPo.map(finRepJobOr).join(', '), n:noPo.length, go:one(noPo, s=>`#/site/${s.id}/finance`, '#/finance/jobs')});
  if(noValue.length) todo.push({tone:'grey', t:'Live projects with no contract value', s:noValue.map(finRepJobOr).join(', '), n:noValue.length, go:one(noValue, s=>`#/site/${s.id}/finance`, '#/finance/jobs')});
  const fo = typeof isFinanceOnly==='function' && isFinanceOnly();
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('overview')}
    ${fo ? '' : '<div class="finbanner">🔒 Only you can see OpHUB Finance while it’s being built.</div>'}
    <div class="pmstats finstats">
      <div class="pmstat" onclick="go('#/finance/jobs')"><b>${finMoney(liveValue, 0)}</b><span>Live contract value · ${liveSites.length} job${liveSites.length===1?'':'s'}</span></div>
      <div class="pmstat" onclick="finInvFilter='outstanding';go('#/finance/sales/invoices')"><b>${finMoney(owed, 0)}</b><span>Owed to you</span></div>
      <div class="pmstat" onclick="finInvFilter='overdue';go('#/finance/sales/invoices')"><b${overdue?' class="hot"':''}>${finMoney(overdue, 0)}</b><span>Overdue</span></div>
      <div class="pmstat" onclick="go('#/finance/sales/retention')"><b>${finMoney(retHeld, 0)}</b><span>Retention held by clients</span></div>
    </div>
    ${todo.length ? `<div class="card fintodo">
      <p class="sectiontitle" style="margin-top:0;">Needs attention</p>
      ${todo.map(x=>`<button type="button" class="fintodo-i" onclick="${x.pre||''}go('${x.go}')"><span class="fintodo-n t-${x.tone}">${x.n}</span><span class="fintodo-t"><b>${escapeHtml(x.t)}</b><em>${escapeHtml(x.s)}</em></span><span class="fintodo-c">›</span></button>`).join('')}
    </div>` : ''}
    ${typeof finXeroReadyHtml==='function' ? finXeroReadyHtml(xeroReady) : ''}
  `, {title:'OpHUB Finance', subtitle:fo ? ((ORG&&ORG.name)||'Overview') : 'Overview', back:finSecBack(), tabs:false});
}

/* ================= Jobs ================= */
let finJobFilt = {pm:'', client:'', sort:'noza'};
// Client filter: any part of the client's name, no re-draw while typing.
function finCliHide(txt){ const q = String(finJobFilt.client||'').trim().toLowerCase(); return q && !String(txt||'').toLowerCase().includes(q) ? 'fincli-hide' : ''; }
window.finJobCli = function(v){
  finJobFilt.client = v;
  document.querySelectorAll('#finJobList [data-cli]').forEach(r=>r.classList.toggle('fincli-hide', !!finCliHide(r.getAttribute('data-cli'))));
};
async function renderFinJobs(sub){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const [jf, pos, invs] = await Promise.all([
    dbSelect('job_finance', 'org_id=eq.'+ME.org_id+'&select=site_id,contract_value,billing_name,billing_email'),
    dbSelect('client_pos', 'org_id=eq.'+ME.org_id+'&select=site_id,po_number&order=created_at.asc'),
    dbSelect('fin_invoices', 'org_id=eq.'+ME.org_id+'&status=neq.void&limit=3000&select=site_id,status,total,paid,net,due_date'),
  ]);
  if(__gen !== RENDER_GEN) return;
  const jfBy = {}; jf.forEach(r=>{ jfBy[r.site_id] = r; });
  const posBy = {}; pos.forEach(p=>{ (posBy[p.site_id] = posBy[p.site_id] || []).push(p); });
  const fo = typeof isFinanceOnly==='function' && isFinanceOnly();
  let body;
  if(sub==='clients'){
    body = await finClientsHtml(jfBy, invs);
  } else {
    if(!['live','upcoming','closed','all'].includes(finHomeTab)) finHomeTab = 'live';
    const sites = SITES.slice().sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
    const counts = {live:0, upcoming:0, closed:0, all:sites.length}; sites.forEach(s=>{ counts[finSiteStatus(s)] = (counts[finSiteStatus(s)]||0)+1; });
    await loadAllProfiles();
    const cliOf = s=>(jfBy[s.id]||{}).billing_name || s.client_name || '';
    const f = finJobFilt;
    let shown = sites.filter(s=>(finHomeTab==='all' || finSiteStatus(s)===finHomeTab) && (!f.pm || (f.pm==='none' ? !s.responsible_pm_id : s.responsible_pm_id===f.pm)) && true);
    const num = s=>String(s.job_number||''), nm = s=>String(s.name||'');
    const cmp = {az:(a,b)=>nm(a).localeCompare(nm(b)), za:(a,b)=>nm(b).localeCompare(nm(a)), noaz:(a,b)=>num(a).localeCompare(num(b), undefined, {numeric:true}), noza:(a,b)=>num(b).localeCompare(num(a), undefined, {numeric:true}), start:(a,b)=>String(b.start_date||'').localeCompare(String(a.start_date||''))}[f.sort];
    if(cmp) shown = shown.slice().sort(cmp);
    const pms = Array.from(new Set(sites.map(s=>s.responsible_pm_id).filter(Boolean))).map(id=>({id, name:(PROFILES[id]||{}).name||'PM'})).sort((a,b)=>a.name.localeCompare(b.name));
    const clients = Array.from(new Set(sites.map(cliOf).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
    const filtHtml = `<div class="finjobfilt">
      <label>PM<select onchange="finJobFilt.pm=this.value;render()"><option value="">All PMs</option>${pms.map(p=>`<option value="${p.id}" ${f.pm===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}<option value="none" ${f.pm==='none'?'selected':''}>No PM</option></select></label>
      <label class="fincli-lbl">Client<input type="search" placeholder="Client name" list="finJobCliList" value="${escapeHtml(f.client||'')}" oninput="finJobCli(this.value)"><datalist id="finJobCliList">${clients.map(c=>`<option value="${escapeHtml(c)}">`).join('')}</datalist></label>
      <label>Sort<select onchange="finJobFilt.sort=this.value;render()">${[['noza','Project no. (newest first)'],['noaz','Project no. (A–Z)'],['az','Name A–Z'],['za','Name Z–A'],['start','Start date (newest)']].map(([k,l])=>`<option value="${k}" ${f.sort===k?'selected':''}>${l}</option>`).join('')}</select></label>
      ${f.pm||f.client ? `<button type="button" class="linkbtn" onclick="finJobFilt.pm='';finJobFilt.client='';render()">Clear</button>` : ''}
    </div>`;
    body = finSecHead('', isFullManager(ME) ? '+ New project' : '', 'openFinNewJob()')
      + filtHtml + finSearchHtml('Search project no., name, client or PO', 'finJobList')
      + finJobGridHtml(shown, {jfBy, posBy, invs, cliOf});
  }
  document.getElementById('app').innerHTML = shell(`${finSectionNav('jobs')}${finSubTabs('jobs', sub==='clients'?'clients':'list')}${body}`,
    {title:'Projects', subtitle:'OpHUB Finance', back:finSecBack(), tabs:false});
}

/* ================= Sales (money in) ================= */
let finInvFilter = 'outstanding', finAppFilter = 'open'; // finAppFilter kept for old links
/* ================= Purchases (money out) ================= */
let finPiFilter = 'approve';
let finPurSup = '', finPurJob = '', finPurStatus = '';

/* ================= Subcontractors ================= */
let finSaFilter = 'open';
