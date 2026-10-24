/* ============================================================
   OpHUB Finance — Detailed Summary for one project (23 Oct 2026, Andy: "a more detailed
   summary … like the attached (Coreloops cost summary), with the tabs to pull all the
   info from the project into one easy screen: Labour/Subcontractors, Plant, Invoices,
   Purchases (POs and purchase invoices)").
   #/site/<id>/finance/summary — opened from "Detailed Summary" on the Project Summary card.
   Every figure comes from the same cost lines as the rest of Finance (finJobForecast),
   excl. VAT, and can be limited to a date range.
   ============================================================ */
let finDsTab = 'summary', finDsF = {from:'', to:''};
const FIN_DS_TABS = [['summary','Cost Summary'],['labour','Labour & Subcontractors'],['plant','Plant'],['sales','Applications & Invoices'],['purchases','Purchases & Orders']];
function finDsIn(d){ const s = String(d||'').slice(0,10); if(finDsF.from && (!s || s < finDsF.from)) return false; if(finDsF.to && (!s || s > finDsF.to)) return false; return true; }
function finDsLinesHtml(lines, empty){
  if(!lines.length) return `<div class="empty" style="margin:6px 0 0;">${empty||'Nothing here.'}</div>`;
  const tot = finRound(lines.reduce((t,l)=>t+Number(l.net||0),0));
  return `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl findstbl"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Supplier / Who</th><th>Ref</th><th>Status</th><th class="num">Net</th></tr></thead><tbody>
    ${lines.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(l=>`<tr class="${l.open?'click':''}" ${l.open?`onclick="${escapeHtml(l.open)}"`:''}><td data-l="Date">${l.date?finDate(l.date):'—'}</td><td data-l="Type">${escapeHtml(l.cat==='committed' ? 'Ordered ('+(FIN_COST_CATS[l.ccat]||'')+')' : FIN_COST_CATS[l.cat]||l.cat)}</td><td data-l="Description">${escapeHtml(l.desc||'')}</td><td data-l="Who">${escapeHtml(l.who||'—')}</td><td data-l="Ref">${escapeHtml(l.ref||'—')}</td><td data-l="Status">${escapeHtml(l.status||'—')}</td><td data-l="Net" class="num"><b>${finMoney(l.net)}</b></td></tr>`).join('')}
  </tbody></table></div><div class="fgfoot findsfoot"><b>${lines.length} line${lines.length===1?'':'s'}</b><span>Total ${finMoney(tot)}</span></div>`;
}
async function renderFinDetail(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId); if(!site){ go('#/finance'); return; }
  const b = await finLoadBook(siteId);
  if(__gen !== RENDER_GEN) return;
  const fc = finJobForecast(b, siteId);
  const jf = fc.jf || {};
  const L = fc.lines.filter(l=>finDsIn(l.date));
  const cost = L.filter(l=>l.cat!=='committed'), committed = L.filter(l=>l.cat==='committed');
  const byCat = k=>finRound(cost.filter(l=>l.cat===k).reduce((t,l)=>t+Number(l.net||0),0));
  const totalCost = finRound(cost.reduce((t,l)=>t+Number(l.net||0),0));
  const committedTot = finRound(committed.reduce((t,l)=>t+Number(l.net||0),0));
  // Sales
  const apps = finBy(b.apps, siteId).filter(a=>a.status!=='void');
  const appsTo = apps.filter(a=>a.status!=='draft' && (!finDsF.to || String(a.valuation_date||'')<=finDsF.to)).sort((x,y)=>x.number-y.number);
  const last = appsTo[appsTo.length-1];
  const appGross = last ? Number(last.gross||0) : 0, appDisc = last ? Number(last.discount||0) : 0;
  const lastCert = appsTo.filter(a=>a.cert_gross!=null).pop(); const certGross = lastCert ? Number(lastCert.cert_gross) : 0;
  const retHeld = typeof finRetentionStillHeld==='function' ? finRetentionStillHeld(appsTo, jf, finBy(b.invs, siteId)) : 0;   // less release invoices raised (audit FA-08)
  const invs = finBy(b.invs, siteId).filter(i=>i.status!=='void' && i.status!=='draft' && finDsIn(i.issue_date));
  const invoiced = finRound(invs.reduce((t,i)=>t+Number(i.net||0),0));
  const outstanding = finRound(invs.reduce((t,i)=>t+finInvOutstandingNet(i),0));
  const received = finRound(invs.reduce((t,i)=>{ const tt = Number(i.total||0); return t + (tt ? Number(i.paid||0)*Number(i.net||0)/tt : 0); },0));
  const bt = finBillingType(jf, fc.schedItemsN, apps.length);
  // Certified gross goes with the certificate's own discount, applied gross with the applied one (audit FB-26).
  const salesValue = bt==='invoice' ? invoiced : (last ? (last.cert_gross!=null ? Number(last.cert_gross) - Number(last.cert_discount!=null ? last.cert_discount : (last.discount||0)) : Number(last.gross||0) - Number(last.discount||0)) : 0);
  const profit = finRound(salesValue - totalCost), pct = salesValue ? finRound(profit/salesValue*100) : null;
  const kv = (l, v, o)=>`<div class="finds-kv${o&&o.bold?' b':''}"><span>${l}</span><b style="${o&&o.col?o.col:''}">${v}</b></div>`;
  const neg = v=>v<0 ? 'color:var(--red);' : (v>0 ? 'color:var(--ok);' : '');
  let body = '';
  if(finDsTab==='summary'){
    body = `<div class="finds-sum">
      <div class="finds-p sales"><p class="sectiontitle">Sales</p>
        ${kv('Applied To Date (gross)', finMoney(appGross))}
        ${kv('Application Discount', '−'+finMoney(appDisc))}
        ${kv('Applied Net Of Discount', finMoney(finRound(appGross-appDisc)))}
        ${kv('Certified To Date (gross)', finMoney(certGross))}
        ${kv('Invoiced', finMoney(invoiced))}
        ${kv('Received', finMoney(received))}
        ${kv('Outstanding', finMoney(outstanding))}
        ${kv('Retention Held By Client', finMoney(retHeld))}
        ${kv('Sales Value', finMoney(salesValue), {bold:1})}
        <p class="stub finds-n">${bt==='invoice' ? 'Sales value = invoiced.' : 'Sales value = latest certified (or applied) to date, less discount.'} All excl. VAT.</p>
      </div>
      <div class="finds-p cost"><p class="sectiontitle">Cost</p>
        ${kv('Purchases (materials)', finMoney(byCat('materials')))}
        ${kv('Plant', finMoney(byCat('plant')))}
        ${kv('Labour', finMoney(byCat('labour')))}
        ${kv('Subcontractors', finMoney(byCat('subcontract')))}
        ${kv('Prelims & Overheads', finMoney(byCat('overheads')))}
        ${kv('Other', finMoney(byCat('other')))}
        ${kv('Total Cost', finMoney(totalCost), {bold:1})}
        ${kv('Profit', finMoney(profit), {bold:1, col:neg(profit)})}
        ${kv('% Profit', finPctTxt(pct), {bold:1, col:neg(profit)})}
        ${kv('Ordered, Not Invoiced Yet', finMoney(committedTot))}
        <p class="stub finds-n">Ordered (open POs and subcontract orders) isn't in Total Cost until it's invoiced or certified.</p>
      </div>
    </div>`;
  } else if(finDsTab==='labour'){
    body = `<p class="sectiontitle finds-h">Labour</p>${finDsLinesHtml(cost.filter(l=>l.cat==='labour'), 'No labour costs.')}
      <p class="sectiontitle finds-h">Subcontractors</p>${finDsLinesHtml(cost.filter(l=>l.cat==='subcontract').concat(committed.filter(l=>l.ccat==='subcontract')), 'No subcontractor costs.')}`;
  } else if(finDsTab==='plant'){
    body = `<p class="sectiontitle finds-h">Plant</p>${finDsLinesHtml(cost.filter(l=>l.cat==='plant').concat(committed.filter(l=>l.ccat==='plant')), 'No plant costs.')}`;
  } else if(finDsTab==='sales'){
    const invBy = {}; finBy(b.invs, siteId).forEach(i=>invBy[i.id] = i);
    const appsF = apps.filter(a=>finDsIn(a.valuation_date)).sort((x,y)=>y.number-x.number);
    body = `<p class="sectiontitle finds-h">Applications &amp; Certificates</p>${finAppTableHtml(appsF, invBy, {empty:'No applications.'})}
      <p class="sectiontitle finds-h">Sales Invoices</p>${finInvTableHtml(finBy(b.invs, siteId).filter(i=>finDsIn(i.issue_date)), {empty:'No invoices.'})}`;
  } else {
    const pos = (b.pos||[]).filter(p=>p.site_id===siteId && finDsIn(String(p.created_at||'').slice(0,10)));
    const poRows = pos.map(p=>{ const inv = finPoInvoiced(p, b.pinvs||[]); const v = p.value!=null ? Number(p.value) : null; return {p, inv, v, left: v!=null ? finRound(v-inv) : null}; });
    const poTot = k=>finRound(poRows.reduce((t,r)=>t+Number(r[k]||0),0));
    body = `<p class="sectiontitle finds-h">Purchase Invoices &amp; Other Costs</p>${finDsLinesHtml(cost.filter(l=>['materials','overheads','other'].includes(l.cat)), 'No purchase invoices.')}
      <p class="sectiontitle finds-h">Purchase Orders</p>${poRows.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl findstbl"><thead><tr><th>PO</th><th>Supplier</th><th>Date</th><th>Status</th><th class="num">Value</th><th class="num">Invoiced</th><th class="num">Left To Invoice</th></tr></thead><tbody>
        ${poRows.map(r=>`<tr class="click" onclick="go('#/site/${siteId}/finance/po/${r.p.id}')"><td data-l="PO"><b>${escapeHtml(r.p.number||'')}</b></td><td data-l="Supplier">${escapeHtml(r.p.supplier_name||'—')}</td><td data-l="Date">${r.p.created_at?finDate(String(r.p.created_at).slice(0,10)):'—'}</td><td data-l="Status">${escapeHtml(r.p.status||'')}</td><td data-l="Value" class="num">${r.v!=null?finMoney(r.v):'—'}</td><td data-l="Invoiced" class="num">${finMoney(r.inv)}</td><td data-l="Left" class="num">${r.left!=null?finMoney(Math.max(0,r.left)):'—'}</td></tr>`).join('')}
      </tbody></table></div><div class="fgfoot findsfoot"><b>${poRows.length} order${poRows.length===1?'':'s'}</b><span>Value ${finMoney(poTot('v'))}</span><span>Invoiced ${finMoney(poTot('inv'))}</span><span>Left ${finMoney(poRows.reduce((t,r)=>t+Math.max(0,Number(r.left||0)),0))}</span></div>` : '<div class="empty" style="margin:6px 0 0;">No purchase orders.</div>'}`;
  }
  const keep = finProjTab[siteId]; finProjTab[siteId] = '__none';
  const tabs = typeof finProjTabsHtml==='function' ? finProjTabsHtml(siteId, bt) : '';
  finProjTab[siteId] = keep;
  document.getElementById('app').innerHTML = shell(`
    ${tabs}
    <div class="card finds-head">
      <div class="finds-hg">
        <div><span>Job No</span><b>${escapeHtml(site.job_number||'—')}</b></div>
        <div><span>Customer</span><b>${escapeHtml(site.client_name||'—')}</b></div>
        <div><span>Contract Name</span><b>${escapeHtml(site.name||'')}</b></div>
        <div class="finds-dates"><label>Date From<input type="date" value="${finDsF.from}" onchange="finDsF.from=this.value;render()"></label><label>Date To<input type="date" value="${finDsF.to}" onchange="finDsF.to=this.value;render()"></label>${finDsF.from||finDsF.to ? `<button type="button" class="linkbtn" onclick="finDsF={from:'',to:''};render()">Clear</button>` : ''}</div>
      </div>
    </div>
    <nav class="finboqsub" role="tablist">${FIN_DS_TABS.map(([k,l])=>`<button type="button" class="${finDsTab===k?'on':''}" onclick="finDsTab='${k}';render()">${l}</button>`).join('')}</nav>
    <div class="card finds-body">${body}</div>
  `, {title:'Detailed Summary', subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
}
window.renderFinDetail = renderFinDetail;
// Run Reports for one project (Andy, 23 Oct): pick any report that can be run per project;
// it opens with this project already chosen.
function renderFinJobReports(siteId){
  if(!finGuard()) return;
  const site = SITES.find(s=>s.id===siteId); if(!site){ go('#/finance'); return; }
  const reps = FIN_REPORTS.filter(r=>(r.filters||[]).includes('job'));
  const card = (t, d, js)=>`<button type="button" class="finrepcard" onclick="${js}"><b>${escapeHtml(t)}</b><span>${escapeHtml(d)}</span></button>`;
  const keep = finProjTab[siteId]; finProjTab[siteId] = '__none';
  const tabs = typeof finProjTabsHtml==='function' ? finProjTabsHtml(siteId, 'application') : '';
  finProjTab[siteId] = keep;
  document.getElementById('app').innerHTML = shell(`
    ${tabs}
    <p class="stub" style="margin:0 0 14px;">Reports for <b>${escapeHtml((site.job_number?site.job_number+' · ':'')+site.name)}</b>. Pick one — it opens for this project; set the dates, then download it as Excel or PDF.</p>
    <p class="sectiontitle">This project</p>
    <div class="finrepgrid">${card('Detailed Summary', 'Sales against cost, with labour, plant, invoices and purchases.', `finDsTab='summary';go('#/site/${siteId}/finance/summary')`)}${card('Monthly Report', 'This month\'s value, cost and margin for the project.', `go('#/site/${siteId}/finance/monthly')`)}</div>
    ${Object.keys(FIN_REPORT_GROUPS).map(g=>{ const rs = reps.filter(r=>r.group===g); return rs.length ? `<p class="sectiontitle">${FIN_REPORT_GROUPS[g]}</p><div class="finrepgrid">${rs.map(r=>card(r.title, r.desc, `finRep={id:'${r.id}', f:{job:'${siteId}', from:'', to:'', status:'all', opening:'', varstatus:'', postatus:''}, sort:null, dir:1};go('#/finance/reports/${r.id}')`)).join('')}</div>` : ''; }).join('')}
  `, {title:'Run Reports', subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
}
window.renderFinJobReports = renderFinJobReports;
(function(){
  const rsf = renderSiteFinance;
  renderSiteFinance = function(siteId){ const p = parseRoute(); if(p[3]==='summary') return renderFinDetail(siteId); if(p[3]==='reports') return renderFinJobReports(siteId); return rsf.apply(this, arguments); };
  const st = document.createElement('style');
  st.textContent = `.finds-hg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(0,1.6fr);gap:10px 18px;align-items:end;}
.finds-hg > div > span{display:block;font-size:11.5px;font-weight:700;color:var(--slate);margin-bottom:3px;}
.finds-hg > div > b{font-size:14.5px;}
.finds-dates{display:flex;gap:10px;align-items:end;flex-wrap:wrap;}
.finds-dates label{display:flex;flex-direction:column;gap:3px;font-size:11.5px;font-weight:700;color:var(--slate);}
.finds-dates input{height:32px !important;min-height:32px !important;padding:0 8px !important;font-size:13px !important;border-radius:8px !important;margin:0 !important;}
.finds-sum{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.finds-p{border-radius:12px;padding:14px 18px;}
.finds-p.sales{background:#EEF2FB;} .finds-p.cost{background:#FFF7E3;}
.finds-p .sectiontitle{margin:0 0 8px !important;}
.finds-kv{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid rgba(0,0,0,.06);font-size:14px;}
.finds-kv b{font-variant-numeric:tabular-nums;font-weight:600;}
.finds-kv.b span, .finds-kv.b b{font-weight:800;}
.finds-n{margin:8px 0 0 !important;font-size:12px;font-style:normal;}
.finds-h{margin:16px 0 6px !important;} .finds-body > .finds-h:first-child{margin-top:0 !important;}
.findsfoot{margin-top:8px;border-radius:10px;padding:5px 12px;font-size:12.5px;}
@media (max-width:900px){ .finds-sum{grid-template-columns:1fr;} .finds-hg{grid-template-columns:1fr 1fr;} }`;
  document.head.appendChild(st);
})();

/* Top-left back arrow goes up one level (Andy, 23 Oct): Finance → project page → Finance
   Projects → Finance → Home; Projects → project page → Projects → Home. The bold page title
   in Finance goes to the Finance overview. */
function navUpTarget(){
  const p = parseRoute(); const [a, b, c, d] = p;
  if(a==='site' && b && c==='finance'){
    const t = typeof finUpTarget==='function' ? finUpTarget() : null;
    if(t && t.tab && typeof finProjTab!=='undefined') finProjTab[t.id||b] = t.tab;
    return t ? t.hash : '#/site/'+b+'/finance';
  }
  if(a==='finance'){
    if(!b) return 'HOME';
    if(c) return '#/finance/'+b;
    return '#/finance';
  }
  if(a==='site' && b){
    if(!c || c==='home') return '#/sites';
    if(!d) return '#/site/'+b+'/home';
    return null; // deeper project pages keep their own back
  }
  if(a==='sites') return 'HOME';
  return null;
}
(function(){
  const gb = goBack;
  goBack = function(target){
    // Finance (24 Oct, Andy): back goes to the page you came from (e.g. Sales › Invoices → an
    // invoice → back to Sales › Invoices). With no trail, it goes up one level as before.
    const p = parseRoute(), cur = String(location.hash||'');
    const inFin = p[0]==='finance' || (p[0]==='site' && p[2]==='finance');
    if(inFin && NAV_STACK.length >= 2 && NAV_STACK[NAV_STACK.length-1] === cur){
      const prev = NAV_STACK[NAV_STACK.length-2];
      if(prev && prev!==cur && prev.split('?')[0]!==cur.split('?')[0]) return gb.call(this, prev);
    }
    const up = navUpTarget();
    if(!up) return gb.apply(this, arguments);
    if(up==='HOME'){ NAV_GOING_BACK = true; if(typeof usesPmHome==='function' && usesPmHome(ME)) go('#/home'); else goHome(); setTimeout(()=>{ NAV_GOING_BACK = false; }, 1500); return; }
    return gb.call(this, up);
  };
  window.goBack = goBack;
  const sh = shell;
  shell = function(inner, opts){
    let h = sh.apply(this, arguments);
    const p = parseRoute();
    if(p[0]==='finance' || (p[0]==='site' && p[2]==='finance')) h = h.replace(/(<h2 style="cursor:pointer;[^"]*" onclick=")goHome\(\)(")/, '$1go(\'#/finance\')$2');
    return h;
  };
})();
