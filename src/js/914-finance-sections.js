/* ============================================================
   OpHUB Finance — sections and sub-pages
   Laid out like Construction Manager (a menu of areas, each with its own
   pages) but grouped the way the work flows:
     Overview        numbers and what needs attention
     Jobs            jobs list · clients
     Sales           applications · certificates · invoices · receipts · retention   (money in)
     Purchases       orders · supplier invoices · invoice inbox · plant hire · suppliers (money out)
     Subcontractors & labour  orders · applications · payments · labour & timesheets · CIS · rates & workers
     Reports
     Settings        (Team, Suppliers, My account for Finance-only companies)
   On a computer: section bar + sub-tabs. On a phone: section grid + sub-tabs.
   ============================================================ */
const FIN_SECTIONS = [
  {k:'overview', l:'Overview', go:'#/finance'},
  {k:'jobs', l:'Projects', go:'#/finance/jobs'},
  {k:'sales', l:'Sales', go:'#/finance/sales'},
  {k:'purchases', l:'Purchases', go:'#/finance/purchases'},
  {k:'subs', l:'Subcontractors & labour', go:'#/finance/subs'},
  {k:'reports', l:'Reports', go:'#/finance/reports'},
  {k:'settings', l:'Settings', go:'#/finance/settings'},
];
const FIN_SUBS = {
  jobs: [['list','Projects','#/finance/jobs'], ['clients','Clients','#/finance/jobs/clients']],
  sales: [['apps','Applications','#/finance/sales/apps'], ['certs','Certificates','#/finance/sales/certs'], ['invoices','Invoices','#/finance/sales/invoices'], ['receipts','Receipts','#/finance/sales/receipts'], ['retention','Retention','#/finance/sales/retention']],
  purchases: [['orders','Orders','#/finance/purchases/orders'], ['invoices','Supplier invoices','#/finance/purchases/invoices'], ['inbox','Invoice inbox','#/finance/inbox'], ['plant','Plant hire','#/finance/purchases/plant'], ['suppliers','Suppliers','#/finance/purchases/suppliers'], ['pricebook','Price book','#/finance/purchases/pricebook']],
  subs: [['orders','Orders','#/finance/subs/orders'], ['apps','Applications','#/finance/subs/apps'], ['payments','Payments','#/finance/subs/payments'], ['week','Labour & timesheets','#/finance/labour'], ['cis','CIS','#/finance/labour/cis'], ['rates','Rates & workers','#/finance/labour/rates']],
};
function finSectionNav(active){
  return `<nav class="finsecnav" aria-label="Finance sections">${FIN_SECTIONS.map(s=>`<button type="button" class="${s.k===active?'on':''}" onclick="go('${s.go}')">${s.l}</button>`).join('')}</nav>`;
}
function finSubTabs(sec, active, badges){
  const subs = FIN_SUBS[sec] || []; badges = badges || {};
  return `<div class="finsubtabs">${subs.map(([k,l,g])=>`<button type="button" class="${k===active?'on':''}" onclick="go('${g}')">${l}${badges[k]?` <span class="finsubtabs-n">${badges[k]}</span>`:''}</button>`).join('')}</div>`;
}
// Section pages: Back goes to the OpHUB home (nowhere for Finance-only companies).
function finSecBack(){ return (typeof isFinanceOnly==='function' && isFinanceOnly()) ? null : homeHash(); }
function finJobTag(siteId){ const s = SITES.find(x=>x.id===siteId) || {}; return (s.job_number ? s.job_number+' · ' : '')+(s.name||''); }
function finRepJobOr(s){ return (s.job_number ? s.job_number+' ' : '')+(s.name||''); }
const finChip = (on, label, n, onclick)=>`<button type="button" class="pmchip ${on?'on':''}" onclick="${onclick}">${label}${n!=null?' ('+n+')':''}</button>`;

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
    dbSelect('job_finance', 'org_id=eq.'+ME.org_id+'&select=site_id,contract_value,app_reminder_day,pc_date,defects_months,ret1_invoice_id,ret2_invoice_id'),
    dbSelect('client_pos', 'org_id=eq.'+ME.org_id+'&select=site_id'),
    dbSelect('fin_invoices', 'org_id=eq.'+ME.org_id+'&status=neq.void&limit=2000&select=id,site_id,status,due_date,total,paid,net'),
    dbSelect('fin_applications', 'org_id=eq.'+ME.org_id+'&limit=2000&select=site_id,number,valuation_date,status,cert_retention'),
    finLoadSettings(),
    dbSelect('purchase_invoices', 'org_id=eq.'+ME.org_id+'&status=in.(to_approve,query)&select=id,net'),
    dbSelect('fin_plant_hires', 'org_id=eq.'+ME.org_id+'&off_hire=is.null&select=id,site_id,item,on_hire,rate,rate_period'),
    dbSelect('fin_inbox', 'org_id=eq.'+ME.org_id+'&status=eq.new&select=id'),
    dbSelect('fin_sub_apps', 'org_id=eq.'+ME.org_id+'&status=eq.received&select=id'),
  ]);
  if(__gen !== RENDER_GEN) return;
  if(typeof finXeroMaybePull==='function') finXeroMaybePull();
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
  const appsDue = liveSites.filter(s=>finAppDueThisMonth(appsBy[s.id]||[], finAppDayFor(jfBy[s.id], st)));
  const longHire = onHire.filter(h=>finPlantCost(h).days>28);
  const one = (list, single, many)=>list.length===1 ? single(list[0]) : many;
  const todo = [];
  if(appsDue.length) todo.push({tone:'warn', t:'Applications due this month', s:appsDue.map(finRepJobOr).join(', '), n:appsDue.length, go:one(appsDue, s=>`#/site/${s.id}/finance`, '#/finance/sales/apps')});
  if(overdueInv.length) todo.push({tone:'bad', t:'Overdue invoices', s:finMoney(overdue, 0)+' to chase', n:overdueInv.length, go:'#/finance/sales/invoices', pre:"finInvFilter='overdue';"});
  if(toApprove.length) todo.push({tone:'warn', t:'Supplier invoices to approve', s:finMoney(toApprove.reduce((t,i)=>t+Number(i.net||0),0), 0)+' excl. VAT', n:toApprove.length, go:'#/finance/purchases/invoices', pre:"finPiFilter='approve';"});
  if(inbox.length) todo.push({tone:'blue', t:'Invoices in the inbox to file', s:'Emailed in by suppliers', n:inbox.length, go:'#/finance/inbox'});
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
    </div>` : `<div class="card"><p class="stub" style="margin:0;">Nothing needs your attention right now.</p></div>`}
  `, {title:'OpHUB Finance', subtitle:fo ? ((ORG&&ORG.name)||'Overview') : 'Overview', back:finSecBack(), tabs:false});
}

/* ================= Jobs ================= */
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
    const by = {};
    SITES.forEach(s=>{ const name = (jfBy[s.id]||{}).billing_name || s.client_name || 'No client'; const c = by[name] = by[name] || {name, email:(jfBy[s.id]||{}).billing_email||s.client_email||'', jobs:[], live:0, value:0, owed:0, overdue:0}; c.jobs.push(s); if(finSiteStatus(s)==='live'){ c.live++; c.value += Number((jfBy[s.id]||{}).contract_value||0); } });
    invs.forEach(i=>{ const s = SITES.find(x=>x.id===i.site_id); if(!s) return; const name = (jfBy[s.id]||{}).billing_name || s.client_name || 'No client'; if(by[name]){ by[name].owed += finInvOutstanding(i); if(finInvOverdue(i)) by[name].overdue += finInvOutstanding(i); } });
    const list = Object.values(by).sort((a,b)=>a.name.localeCompare(b.name));
    body = finSecHead('Clients') + finSearchHtml('Search clients', 'finClientList') + finListHtml('finClientList', list.map(c=>`<div class="pmrow pmrow-card finrow fincli" data-lf="${lfText([c.name, c.email, c.jobs.map(j=>j.name+' '+(j.job_number||'')).join(' ')].join(' '))}">
      <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(c.name)}</span><span class="pmrow-s">${c.jobs.length} job${c.jobs.length===1?'':'s'} · ${c.live} live${c.email?' · '+escapeHtml(c.email):''}</span>
        <span class="fincli-jobs">${c.jobs.map(j=>`<button type="button" class="linkbtn" onclick="go('#/site/${j.id}/finance')">${escapeHtml(finRepJobOr(j))}</button>`).join('')}</span></span>
      <span class="finval">${finMoney(c.owed, 0)}<em>${c.overdue?`<span style="color:var(--red);">${finMoney(c.overdue, 0)} overdue</span>`:'owed'}</em></span></div>`), 'No clients yet.');
  } else {
    if(!['live','upcoming','closed','all'].includes(finHomeTab)) finHomeTab = 'live';
    const sites = SITES.slice().sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
    const counts = {live:0, upcoming:0, closed:0, all:sites.length}; sites.forEach(s=>{ counts[finSiteStatus(s)] = (counts[finSiteStatus(s)]||0)+1; });
    const shown = sites.filter(s=>finHomeTab==='all' || finSiteStatus(s)===finHomeTab);
    body = finSecHead('Projects', fo && isFullManager(ME) ? '+ New project' : '', 'openFinNewJob()')
      + `<div class="pmchips">${['live','upcoming','closed','all'].map(k=>finChip(finHomeTab===k, k[0].toUpperCase()+k.slice(1), counts[k]||0, `finHomeTab='${k}';render()`)).join('')}</div>`
      + finSearchHtml('Search project no., name, client or PO', 'finJobList')
      + finListHtml('finJobList', shown.map(s=>{ const p = posBy[s.id] || []; const v = (jfBy[s.id]||{}).contract_value; const poTxt = p.length ? p.map(x=>x.po_number).join(', ') : 'No client PO'; return `<button type="button" class="pmrow pmrow-card finrow" data-lf="${lfText([s.job_number, s.name, s.client_name, p.map(x=>x.po_number).join(' ')].join(' '))}" onclick="go('#/site/${s.id}/finance')">
          <span class="finjobno ${s.job_number?'':'none'}">${escapeHtml(s.job_number||'No no.')}</span>
          <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(s.name)}</span><span class="pmrow-s">${escapeHtml(s.client_name||'No client')} · <span style="${p.length?'':'color:var(--warn);'}">${escapeHtml(poTxt)}</span></span></span>
          <span class="finval">${v ? finMoney(v, 0) : '<em>No value</em>'}</span></button>`; }), 'No '+(finHomeTab==='all'?'':finHomeTab+' ')+'projects.');
  }
  document.getElementById('app').innerHTML = shell(`${finSectionNav('jobs')}${finSubTabs('jobs', sub==='clients'?'clients':'list')}${body}`,
    {title:'Projects', subtitle:'OpHUB Finance', back:finSecBack(), tabs:false});
}

/* ================= Sales (money in) ================= */
let finInvFilter = 'outstanding', finAppFilter = 'open';
async function renderFinSales(sub){
  if(!finGuard()) return;
  sub = ['apps','certs','invoices','receipts','retention'].includes(sub) ? sub : 'apps';
  const __gen = RENDER_GEN;
  const [invs, apps, pays, jf, st] = await Promise.all([
    dbSelect('fin_invoices', 'org_id=eq.'+ME.org_id+'&order=created_at.desc&limit=3000'),
    dbSelect('fin_applications', 'org_id=eq.'+ME.org_id+'&order=valuation_date.desc&limit=3000&select=id,site_id,number,status,valuation_date,due_date,final_date,gross,net_due,cert_date,cert_gross,cert_net,cert_retention,cert_is_payless,invoice_id'),
    sub==='receipts' ? dbSelect('fin_payments', 'org_id=eq.'+ME.org_id+'&order=paid_on.desc&limit=2000') : Promise.resolve([]),
    sub==='retention' ? dbSelect('job_finance', 'org_id=eq.'+ME.org_id) : Promise.resolve([]),
    finLoadSettings(),
  ]);
  if(__gen !== RENDER_GEN) return;
  const live = invs.filter(i=>i.status!=='void');
  const owed = live.reduce((t,i)=>t+finInvOutstanding(i),0), overdue = live.filter(finInvOverdue).reduce((t,i)=>t+finInvOutstanding(i),0);
  const awaitingCert = apps.filter(a=>a.status==='submitted');
  const certNotInv = apps.filter(a=>a.status==='certified' && !a.invoice_id);
  const invBy = {}; invs.forEach(i=>invBy[i.id]=i);
  let body = '';
  if(sub==='apps'){
    const F = {open:a=>['draft','submitted'].includes(a.status), draft:a=>a.status==='draft', submitted:a=>a.status==='submitted', all:a=>a.status!=='void'};
    if(!F[finAppFilter]) finAppFilter = 'open';
    const list = apps.filter(F[finAppFilter]);
    body = finSecHead('Applications for payment', '+ New application', "finPickJob('New application','newFinApplication')")
      + `<div class="pmchips">${[['open','Draft & submitted'],['draft','Drafts'],['submitted','Waiting for certificate'],['all','All']].map(([k,l])=>finChip(finAppFilter===k, l, apps.filter(F[k]).length, `finAppFilter='${k}';render()`)).join('')}</div>`
      + finSearchHtml('Search project', 'finSalesList')
      + finListHtml('finSalesList', list.map(a=>`<button type="button" class="pmrow pmrow-card finrow" data-lf="${lfText(finJobTag(a.site_id))}" onclick="go('#/site/${a.site_id}/finance/application/${a.id}')">
          <span class="pmrow-txt"><span class="pmrow-t">Application ${a.number} <span class="finpill ${a.status==='certified'?'ok':a.status==='submitted'?'blue':'grey'}">${escapeHtml(a.status[0].toUpperCase()+a.status.slice(1))}</span></span><span class="pmrow-s">${escapeHtml(finJobTag(a.site_id))}</span><span class="pmrow-s">Valuation ${finDate(a.valuation_date)}${a.final_date?' · final date '+finDate(a.final_date):''}</span></span>
          <span class="finval">${finMoney(a.net_due)}<em>applied (net)</em></span></button>`), 'No applications here.');
  } else if(sub==='certs'){
    const list = apps.filter(a=>a.cert_net!=null && a.status!=='void');
    body = finSecHead('Payment certificates') + `<p class="stub" style="margin:-4px 0 12px;">What clients have certified against each application. Record a certificate on the application itself.</p>`
      + (certNotInv.length ? `<div class="card fintodo">${certNotInv.map(a=>`<button type="button" class="fintodo-i" onclick="go('#/site/${a.site_id}/finance/application/${a.id}')"><span class="fintodo-n t-warn">£</span><span class="fintodo-t"><b>Raise the invoice — ${escapeHtml(finJobTag(a.site_id))} app ${a.number}</b><em>Certified ${finMoney(a.cert_net)}</em></span><span class="fintodo-c">›</span></button>`).join('')}</div>` : '')
      + finSearchHtml('Search project', 'finSalesList')
      + finListHtml('finSalesList', list.map(a=>{ const short = finRound(Number(a.net_due||0)-Number(a.cert_net||0)); const inv = invBy[a.invoice_id]; return `<button type="button" class="pmrow pmrow-card finrow" data-lf="${lfText(finJobTag(a.site_id))}" onclick="go('#/site/${a.site_id}/finance/application/${a.id}')">
          <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(finJobTag(a.site_id))} · app ${a.number} ${a.cert_is_payless?'<span class="finpill bad">Pay less</span>':''}</span><span class="pmrow-s">Certified ${a.cert_date?finDate(a.cert_date):''} · applied ${finMoney(a.net_due)}${short>0.009?` · <span style="color:var(--red);">${finMoney(short)} short</span>`:''}</span><span class="pmrow-s">${inv?'Invoice '+escapeHtml(inv.number||''):'<span style="color:var(--warn);">Not invoiced yet</span>'}</span></span>
          <span class="finval">${finMoney(a.cert_net)}<em>certified (net)</em></span></button>`; }), 'No certificates yet.');
  } else if(sub==='invoices'){
    const F = {outstanding:i=>finInvOutstanding(i)>0, overdue:finInvOverdue, draft:i=>i.status==='draft', paid:i=>i.status==='paid', all:()=>true};
    if(!F[finInvFilter]) finInvFilter = 'outstanding';
    const list = (finInvFilter==='all' ? invs : live).filter(F[finInvFilter]);
    body = finSecHead('Sales invoices', '+ New invoice', "finPickJob('New invoice','newFinInvoice')")
      + `<div class="pmchips">${[['outstanding','Owed'],['overdue','Overdue'],['draft','Drafts'],['paid','Paid'],['all','All']].map(([k,l])=>finChip(finInvFilter===k, l, (k==='all'?invs:live).filter(F[k]).length, `finInvFilter='${k}';render()`)).join('')}</div>`
      + finSearchHtml('Search invoice no., project or client', 'finSalesList')
      + finListHtml('finSalesList', list.map(i=>`<button type="button" class="pmrow pmrow-card finrow" data-lf="${lfText([i.number, i.bill_name, finJobTag(i.site_id)].join(' '))}" onclick="go('#/site/${i.site_id}/finance/invoice/${i.id}')">
          <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(i.number||'Draft')} ${finInvPill(i)}</span><span class="pmrow-s">${escapeHtml(finJobTag(i.site_id))} · ${escapeHtml(i.bill_name||'')}</span><span class="pmrow-s">${i.issue_date?'Issued '+finDate(i.issue_date):'Not issued'}${i.due_date?' · due '+finDate(i.due_date):''}</span></span>
          <span class="finval">${finMoney(i.total)}${finInvOutstanding(i)>0 && finInvOutstanding(i)<Number(i.total) ? `<em>${finMoney(finInvOutstanding(i))} owed</em>` : ''}</span></button>`), 'No invoices here.');
  } else if(sub==='receipts'){
    const month = finToday().slice(0,7);
    const tm = finRound(pays.filter(p=>String(p.paid_on).startsWith(month)).reduce((t,p)=>t+Number(p.amount||0),0));
    body = finSecHead('Receipts') + `<p class="stub" style="margin:-4px 0 12px;">Money received against your invoices — ${finMoney(tm)} so far this month. Record a payment on the invoice; payments made in Xero come across too.</p>`
      + finSearchHtml('Search invoice, project or note', 'finSalesList')
      + finListHtml('finSalesList', pays.map(p=>{ const i = invBy[p.invoice_id] || {}; return `<button type="button" class="pmrow pmrow-card finrow" data-lf="${lfText([i.number, i.bill_name, finJobTag(i.site_id), p.note].join(' '))}" onclick="go('#/site/${i.site_id}/finance/invoice/${i.id}')">
          <span class="pmrow-txt"><span class="pmrow-t">${finDate(p.paid_on)} · ${escapeHtml(i.number||'Invoice')}</span><span class="pmrow-s">${escapeHtml(finJobTag(i.site_id))} · ${escapeHtml(i.bill_name||'')}</span>${p.note?`<span class="pmrow-s">${escapeHtml(p.note)}</span>`:''}</span>
          <span class="finval" style="color:var(--ok);">${finMoney(p.amount)}</span></button>`; }), 'No payments received yet.');
  } else {
    const jfBy = {}; jf.forEach(r=>jfBy[r.site_id]=r);
    const appsBy = {}; apps.forEach(a=>{ (appsBy[a.site_id] = appsBy[a.site_id]||[]).push(a); });
    const rows = SITES.map(s=>({s, held:finRetentionHeld(appsBy[s.id]||[]), jf:jfBy[s.id]||{}})).filter(x=>x.held);
    const total = rows.reduce((t,x)=>t+x.held,0);
    body = finSecHead('Retention') + `<p class="stub" style="margin:-4px 0 12px;">${finMoney(total)} held by clients across ${rows.length} job${rows.length===1?'':'s'}. Set the practical completion date on the project to get release dates and reminders.</p>`
      + finListHtml('finSalesList', rows.map(x=>{ const d = finRetentionDates(x.jf, st); return `<button type="button" class="pmrow pmrow-card finrow" onclick="go('#/site/${x.s.id}/finance')">
          <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(finRepJobOr(x.s))}</span><span class="pmrow-s">${escapeHtml(x.s.client_name||'')}</span><span class="pmrow-s">${d.first ? '1st half '+finDate(d.first)+(x.jf.ret1_invoice_id?' (claimed)':'')+' · 2nd half '+finDate(d.second)+(x.jf.ret2_invoice_id?' (claimed)':'') : '<span style="color:var(--warn);">No practical completion date yet</span>'}</span></span>
          <span class="finval">${finMoney(x.held)}</span></button>`; }), 'No retention held.');
  }
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('sales')}
    <div class="pmstats finstats">
      <div class="pmstat" onclick="finInvFilter='outstanding';go('#/finance/sales/invoices')"><b>${finMoney(owed, 0)}</b><span>Owed to you</span></div>
      <div class="pmstat" onclick="finInvFilter='overdue';go('#/finance/sales/invoices')"><b${overdue?' class="hot"':''}>${finMoney(overdue, 0)}</b><span>Overdue</span></div>
      <div class="pmstat" onclick="finAppFilter='submitted';go('#/finance/sales/apps')"><b>${awaitingCert.length}</b><span>Applications waiting for a certificate</span></div>
      <div class="pmstat" onclick="go('#/finance/sales/certs')"><b>${certNotInv.length}</b><span>Certified, not invoiced</span></div>
    </div>
    ${finSubTabs('sales', sub, {certs:certNotInv.length})}
    ${body}
  `, {title:'Sales', subtitle:'OpHUB Finance · money in', back:finSecBack(), tabs:false});
}

/* ================= Purchases (money out) ================= */
let finPiFilter = 'approve';
async function renderFinPurchases(sub){
  if(!finGuard()) return;
  if(sub==='pricebook' && typeof renderFinPriceBook==='function') return renderFinPriceBook();
  sub = ['orders','invoices','plant','suppliers'].includes(sub) ? sub : 'orders';
  const __gen = RENDER_GEN;
  const [pinvs, pos, inbox, hires, suppliers] = await Promise.all([
    dbSelect('purchase_invoices', 'org_id=eq.'+ME.org_id+'&order=invoice_date.desc&limit=5000'),
    dbSelect('purchase_orders', 'org_id=eq.'+ME.org_id+'&order=created_at.desc&limit=5000'),
    dbSelect('fin_inbox', 'org_id=eq.'+ME.org_id+'&status=eq.new&select=id'),
    dbSelect('fin_plant_hires', 'org_id=eq.'+ME.org_id+'&order=on_hire.desc&limit=2000'),
    sub==='suppliers' ? dbSelect('suppliers', 'select=id,name,email&order=name.asc') : Promise.resolve([]),
  ]);
  if(__gen !== RENDER_GEN) return;
  const live = pinvs.filter(i=>i.status!=='rejected');
  const toApprove = pinvs.filter(i=>['to_approve','query'].includes(i.status));
  const unpaid = pinvs.filter(i=>i.status==='approved' && !i.paid_on);
  const openPos = pos.filter(p=>p.status==='open');
  const committed = finRound(openPos.filter(p=>p.value!=null).reduce((t,p)=>t+Math.max(0, Number(p.value)-finPoInvoiced(p, live)),0));
  const onHire = hires.filter(h=>!h.off_hire);
  const piRow = i=>`<div data-lf="${lfText([i.supplier_name, i.invoice_no, finJobTag(i.site_id)].join(' '))}"><div class="finrowjob">${escapeHtml(finJobTag(i.site_id))}</div>${finPiRowHtml(i.site_id, i)}</div>`;
  let body = '';
  if(sub==='orders'){
    body = finSecHead('Purchase orders', '+ New PO', "finPickJob('New purchase order','openFinNewPo')")
      + `<p class="stub" style="margin:-4px 0 12px;">${openPos.length} open · ${finMoney(committed, 0)} ordered but not invoiced yet. Material orders sent from a project’s Materials tile appear here automatically.</p>`
      + finSearchHtml('Search PO, supplier or project', 'finPurList')
      + finListHtml('finPurList', pos.map(p=>{ const inv = finPoInvoiced(p, live); return `<button type="button" class="pmrow pmrow-card finrow" data-lf="${lfText([p.number, p.supplier_name, finJobTag(p.site_id)].join(' '))}" onclick="go('#/site/${p.site_id}/finance/po/${p.id}')">
          <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(p.number)} ${finPoPill(p)}</span><span class="pmrow-s">${escapeHtml(p.supplier_name||'')} · ${escapeHtml(finJobTag(p.site_id))}</span><span class="pmrow-s">${finDate(String(p.created_at).slice(0,10))}${inv?' · invoiced '+finMoney(inv):''}</span></span>
          <span class="finval">${p.value!=null?finMoney(p.value):'<em>No value</em>'}</span></button>`; }), 'No purchase orders yet.');
  } else if(sub==='invoices'){
    const F = {approve:i=>['to_approve','query'].includes(i.status), unpaid:i=>i.status==='approved' && !i.paid_on, paid:i=>!!i.paid_on, all:()=>true};
    if(!F[finPiFilter]) finPiFilter = 'approve';
    const list = pinvs.filter(F[finPiFilter]);
    body = finSecHead('Supplier invoices', '+ Supplier invoice', "finPickJob('Add supplier invoice','openPurchaseInvoiceForm')")
      + (inbox.length ? `<button type="button" class="fintodo-i card" onclick="go('#/finance/inbox')"><span class="fintodo-n t-blue">${inbox.length}</span><span class="fintodo-t"><b>Invoices in the inbox to file</b><em>Read automatically — check them and file them to a project</em></span><span class="fintodo-c">›</span></button>` : '')
      + `<div class="pmchips">${[['approve','To approve'],['unpaid','Approved, not paid'],['paid','Paid'],['all','All']].map(([k,l])=>finChip(finPiFilter===k, l, pinvs.filter(F[k]).length, `finPiFilter='${k}';render()`)).join('')}</div>`
      + finSearchHtml('Search supplier, invoice no. or project', 'finPurList')
      + finListHtml('finPurList', list.map(piRow), 'No supplier invoices here.');
  } else if(sub==='plant'){
    const off = hires.filter(h=>h.off_hire).slice(0, 40);
    const row = h=>{ const c = finPlantCost(h); const long = !h.off_hire && c.days>28; return `<button type="button" class="pmrow pmrow-card finrow" data-lf="${lfText([h.item, h.supplier_name, finJobTag(h.site_id)].join(' '))}" onclick="openFinPlantForm('${h.site_id}','${h.id}')">
      <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(h.item)} ${h.off_hire?'<span class="finpill grey">Off hire</span>':`<span class="finpill ${long?'bad':'ok'}">On hire ${c.weeks} wk</span>`}</span><span class="pmrow-s">${escapeHtml(finJobTag(h.site_id))}${h.supplier_name?' · '+escapeHtml(h.supplier_name):''}</span><span class="pmrow-s">${finDate(h.on_hire)} → ${h.off_hire?finDate(h.off_hire):'now'} · ${finMoney(h.rate)}/${h.rate_period}</span></span>
      <span class="finval">${finMoney(c.cost, 0)}</span></button>`; };
    body = finSecHead('Plant hire', '+ Plant hire', "finPickJob('Add plant hire','openFinPlantForm')")
      + `<p class="stub" style="margin:-4px 0 12px;">${onHire.length} on hire · ${finMoney(onHire.reduce((t,h)=>t+finPlantCost(h).cost,0), 0)} so far. Tap one to off-hire it.</p>`
      + finListHtml('finPurList', onHire.map(row), 'Nothing on hire.')
      + (off.length ? `<p class="sectiontitle" style="margin-top:22px;">Recently off hire</p>${off.map(row).join('')}` : '');
  } else {
    const by = {}; suppliers.forEach(s=>{ by[s.name] = {name:s.name, email:s.email||'', spend:0, owed:0, n:0}; });
    live.forEach(i=>{ const k = i.supplier_name||'Unknown'; const r = by[k] = by[k] || {name:k, email:'', spend:0, owed:0, n:0}; r.n++; if(i.status==='approved') r.spend += Number(i.net||0); if(i.status==='approved' && !i.paid_on) r.owed += Number(i.total||0); });
    const list = Object.values(by).sort((a,b)=>b.spend-a.spend || a.name.localeCompare(b.name));
    body = finSecHead('Suppliers', isFullManager(ME) ? 'Edit suppliers' : '', "go('#/suppliers')")
      + finSearchHtml('Search suppliers', 'finPurList')
      + finListHtml('finPurList', list.map(r=>`<div class="pmrow pmrow-card finrow" data-lf="${lfText([r.name, r.email].join(' '))}">
          <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(r.name)}</span><span class="pmrow-s">${r.n} invoice${r.n===1?'':'s'}${r.email?' · '+escapeHtml(r.email):''}</span></span>
          <span class="finval">${finMoney(r.spend, 0)}<em>${r.owed?finMoney(r.owed, 0)+' to pay':'spent (net)'}</em></span></div>`), 'No suppliers yet.');
  }
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('purchases')}
    <div class="pmstats finstats">
      <div class="pmstat" onclick="finPiFilter='approve';go('#/finance/purchases/invoices')"><b>${toApprove.length}</b><span>Supplier invoices to approve</span></div>
      <div class="pmstat" onclick="finPiFilter='unpaid';go('#/finance/purchases/invoices')"><b>${finMoney(unpaid.reduce((t,i)=>t+Number(i.total||0),0), 0)}</b><span>To pay suppliers (incl. VAT)</span></div>
      <div class="pmstat" onclick="go('#/finance/purchases/orders')"><b>${finMoney(committed, 0)}</b><span>Ordered, not invoiced</span></div>
      <div class="pmstat" onclick="go('#/finance/purchases/plant')"><b>${onHire.length}</b><span>Plant on hire</span></div>
    </div>
    ${finSubTabs('purchases', sub, {invoices:toApprove.length, inbox:inbox.length})}
    ${body}
  `, {title:'Purchases', subtitle:'OpHUB Finance · money out', back:finSecBack(), tabs:false});
}

/* ================= Subcontractors ================= */
let finSaFilter = 'open';
async function renderFinSubsSection(sub){
  if(!finGuard()) return;
  sub = ['orders','apps','payments'].includes(sub) ? sub : 'orders';
  const __gen = RENDER_GEN;
  const [scs, sapps] = await Promise.all([
    dbSelect('fin_subcontracts', 'org_id=eq.'+ME.org_id+'&order=created_at.desc'),
    dbSelect('fin_sub_apps', 'org_id=eq.'+ME.org_id+'&order=app_date.desc'),
  ]);
  if(__gen !== RENDER_GEN) return;
  const scBy = {}; scs.forEach(s=>scBy[s.id]=s);
  const toCert = sapps.filter(a=>a.status==='received'), toPay = sapps.filter(a=>a.status==='certified');
  const lastCert = id=>sapps.filter(a=>a.subcontract_id===id && a.certified_gross!=null).sort((x,y)=>y.number-x.number)[0];
  const retHeld = finRound(scs.reduce((t,sc)=>{ const l = lastCert(sc.id); return t + (l ? Number(l.retention||0) : 0); }, 0));
  const appRow = a=>{ const sc = scBy[a.subcontract_id] || {}; return `<button type="button" class="pmrow pmrow-card finrow" data-lf="${lfText([sc.name, sc.number, finJobTag(a.site_id)].join(' '))}" onclick="go('#/site/${a.site_id}/finance/sub/${a.subcontract_id}')">
    <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(sc.name||'')} · app ${a.number} <span class="finpill ${a.status==='paid'?'ok':a.status==='certified'?'blue':'warn'}">${FIN_SA_STATUS[a.status]||a.status}</span>${a.payless?' <span class="finpill bad">Pay less</span>':''}</span><span class="pmrow-s">${escapeHtml(sc.number||'')} · ${escapeHtml(finJobTag(a.site_id))}</span><span class="pmrow-s">${finDate(a.app_date)} · applied ${finMoney(a.applied_gross)}${a.final_date && a.status!=='paid'?' · final date '+finDate(a.final_date):''}${a.paid_on?' · paid '+finDate(a.paid_on):''}</span></span>
    <span class="finval">${a.certified_gross!=null ? finMoney(a.pay_amount)+'<em>to pay after CIS</em>' : '<em>not certified</em>'}</span></button>`; };
  let body = '';
  if(sub==='orders'){
    body = finSecHead('Subcontract orders', '+ Subcontract order', "finPickJob('New subcontract order','openFinSubcontract')")
      + finSearchHtml('Search subcontractor or project', 'finSubList')
      + finListHtml('finSubList', scs.map(sc=>{ const l = lastCert(sc.id); return `<button type="button" class="pmrow pmrow-card finrow" data-lf="${lfText([sc.name, sc.number, sc.description, finJobTag(sc.site_id)].join(' '))}" onclick="go('#/site/${sc.site_id}/finance/sub/${sc.id}')">
          <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(sc.name)} <span class="finpill grey">${escapeHtml(sc.number)}</span>${sc.status==='complete'?' <span class="finpill ok">Complete</span>':''}</span><span class="pmrow-s">${escapeHtml(finJobTag(sc.site_id))}${sc.description?' · '+escapeHtml(sc.description):''}</span><span class="pmrow-s">Certified ${finMoney(l?l.certified_gross:0)}${sc.order_value!=null?' of '+finMoney(sc.order_value):''} · retention ${finMoney(l?l.retention:0)}</span></span>
          <span class="finval">${sc.order_value!=null?finMoney(sc.order_value, 0):''}</span></button>`; }), 'No subcontract orders yet.');
  } else if(sub==='apps'){
    const F = {open:a=>a.status!=='paid', received:a=>a.status==='received', certified:a=>a.status==='certified', all:()=>true};
    if(!F[finSaFilter]) finSaFilter = 'open';
    const list = sapps.filter(a=>a.status!=='paid' || finSaFilter==='all').filter(F[finSaFilter]);
    body = finSecHead('Subcontractor applications') + `<p class="stub" style="margin:-4px 0 12px;">Record an application on the subcontract order. Certify it and send the payment (or pay less) notice before the final date for payment.</p>`
      + `<div class="pmchips">${[['open','Not paid'],['received','To certify'],['certified','Certified, to pay'],['all','All']].map(([k,l])=>finChip(finSaFilter===k, l, sapps.filter(F[k]).length, `finSaFilter='${k}';render()`)).join('')}</div>`
      + finSearchHtml('Search subcontractor or project', 'finSubList') + finListHtml('finSubList', list.map(appRow), 'No applications here.');
  } else {
    const paid = sapps.filter(a=>a.status==='paid').sort((x,y)=>String(y.paid_on).localeCompare(String(x.paid_on)));
    body = finSecHead('Payments to subcontractors') + `<p class="stub" style="margin:-4px 0 12px;">Paid applications. Each one is also in the CIS tab for your CIS return.</p>`
      + finSearchHtml('Search subcontractor or project', 'finSubList') + finListHtml('finSubList', paid.map(appRow), 'No payments yet.');
  }
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('subs')}
    <div class="pmstats finstats">
      <div class="pmstat" onclick="go('#/finance/subs/orders')"><b>${scs.filter(s=>s.status!=='complete').length}</b><span>Active subcontract orders</span></div>
      <div class="pmstat" onclick="finSaFilter='received';go('#/finance/subs/apps')"><b${toCert.length?' class="hot"':''}>${toCert.length}</b><span>Applications to certify</span></div>
      <div class="pmstat" onclick="finSaFilter='certified';go('#/finance/subs/apps')"><b>${finMoney(toPay.reduce((t,a)=>t+Number(a.pay_amount||0),0), 0)}</b><span>Certified, to pay</span></div>
      <div class="pmstat"><b>${finMoney(retHeld, 0)}</b><span>Retention you hold</span></div>
    </div>
    ${finSubTabs('subs', sub, {apps:toCert.length})}
    ${body}
  `, {title:'Subcontractors', subtitle:'Subcontractors & labour', back:finSecBack(), tabs:false});
}
