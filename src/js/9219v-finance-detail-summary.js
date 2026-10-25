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
const FIN_DS_TABS = [['summary','Cost Summary'],['purchases','Purchases'],['labour','Labour & Subcontractors'],['sales','Applications & Invoices'],['plant','Plant']];   // Purchases second, Plant last (Andy, 25 Oct)
let finDsBook = null, finDsQ = '';   // last loaded book (tab and date changes redraw from it — no reload, no jumping back)
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
  const cached = finDsBook && finDsBook.siteId===siteId && finDsBook.quick;
  const b = cached ? finDsBook.b : await finLoadBook(siteId);
  if(!cached && __gen !== RENDER_GEN) return;
  finDsBook = {siteId, b};
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
        ${kv('Prelims & Site Costs', finMoney(byCat('overheads')))}
        ${kv('Other', finMoney(byCat('other')))}
        ${kv('Total Cost', finMoney(totalCost), {bold:1})}
        ${kv('Profit Before Overheads', finMoney(profit), {bold:1, col:neg(profit)})}
        ${fc.ohpPct ? kv('Company Overheads (OHP) '+fc.ohpPct+'%', '−'+finMoney(finRound(salesValue*fc.ohpPct/100))) : ''}
        ${fc.ohpPct ? kv('Profit After Overheads', finMoney(finRound(profit - salesValue*fc.ohpPct/100)), {bold:1, col:neg(profit - salesValue*fc.ohpPct/100)}) : ''}
        ${kv('% Profit'+(fc.ohpPct ? ' (after overheads)' : ''), finPctTxt(salesValue ? finRound((profit - salesValue*(fc.ohpPct||0)/100)/salesValue*100) : null), {bold:1, col:neg(profit - salesValue*(fc.ohpPct||0)/100)})}
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
        <div class="finds-dates"><span class="finds-dl">Only show items dated</span><label>From<input type="date" value="${finDsF.from}" onchange="finDsF.from=this.value;finDsGo('${siteId}')"></label><label>To<input type="date" value="${finDsF.to}" onchange="finDsF.to=this.value;finDsGo('${siteId}')"></label>${finDsF.from||finDsF.to ? `<button type="button" class="linkbtn" onclick="finDsF={from:'',to:''};finDsGo('${siteId}')">Whole job</button>` : ''}
          <span class="finds-dn">${finDsF.from||finDsF.to ? 'Showing '+(finDsF.from ? 'from '+finDate(finDsF.from) : '')+(finDsF.to ? ' to '+finDate(finDsF.to) : '')+' — every tab, and the totals, only count items in these dates.' : 'Showing the whole job. Pick dates to see one period (e.g. a month) on every tab.'}</span></div>
      </div>
    </div>
    <nav class="finboqsub" role="tablist">${FIN_DS_TABS.map(([k,l])=>`<button type="button" class="${finDsTab===k?'on':''}" onclick="finDsTab='${k}';finDsQ='';finDsGo('${siteId}')">${l}</button>`).join('')}</nav>
    <div class="finds-tools">${finDsTab==='summary' ? '' : `<input type="search" id="finDsQ" placeholder="Search this tab — supplier, PO, invoice no., description…" value="${escapeHtml(finDsQ)}" oninput="finDsQ=this.value;finDsFilter()">`}
      <button type="button" class="finds-xl" title="Download this tab as Excel" onclick="finDsExcel('${siteId}')"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" fill="#1D6F42"/><path d="M8 7l3.2 5L8 17h2.4l2-3.4 2 3.4H17l-3.2-5L17 7h-2.4l-2 3.3-2-3.3z" fill="#fff"/></svg><span>Excel</span></button></div>
    <div class="card finds-body">${body}</div>
  `, {title:'Detailed Summary', subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
}
window.renderFinDetail = renderFinDetail;
// Tabs and dates redraw from the figures already loaded (quick, and nothing can pull you back to Cost Summary).
window.finDsGo = function(siteId){
  const y = typeof appScrollY==='function' ? appScrollY() : 0;
  if(finDsBook && finDsBook.siteId===siteId) finDsBook.quick = true;
  Promise.resolve(renderFinDetail(siteId)).then(()=>{ if(finDsBook) finDsBook.quick = false; finDsFilter(); if(typeof appScrollTo==='function') appScrollTo(y); });
};
// Search: hides rows (and tables) that don't contain every word typed.
window.finDsFilter = function(){
  const words = String(finDsQ||'').toLowerCase().split(/\s+/).filter(Boolean);
  document.querySelectorAll('.finds-body tbody tr').forEach(tr=>{ const t = tr.textContent.toLowerCase(); tr.style.display = words.every(w=>t.includes(w)) ? '' : 'none'; });
  document.querySelectorAll('.finds-body .finds-nomatch').forEach(x=>x.remove());
  if(words.length) document.querySelectorAll('.finds-body table').forEach(tb=>{ if(![...tb.querySelectorAll('tbody tr')].some(tr=>tr.style.display!=='none')){ const n = document.createElement('div'); n.className = 'empty finds-nomatch'; n.style.margin = '6px 0 0'; n.textContent = 'Nothing matches “'+finDsQ+'”.'; tb.closest('.finreptbl-wrap, table').insertAdjacentElement('afterend', n); } });
};
// Excel: every table on the tab (only the rows showing, if you've searched), one sheet each.
window.finDsExcel = async function(siteId){
  if(!(await loadLib('ExcelJS'))){ toast('Could not load the Excel tool — check your connection.'); return; }
  const site = SITES.find(s=>s.id===siteId) || {};
  const tabName = (FIN_DS_TABS.find(t=>t[0]===finDsTab)||['','Summary'])[1];
  const wb = new ExcelJS.Workbook(); wb.creator = (ORG&&ORG.name)||'OpHUB';
  const head = ws=>{ ws.getCell('A1').value = tabName+' — '+(site.job_number?site.job_number+' · ':'')+(site.name||''); ws.getCell('A1').font = {bold:true, size:14};
    ws.getCell('A2').value = (ORG&&ORG.name||'')+' · '+(finDsF.from||finDsF.to ? 'Dated '+(finDsF.from?finDate(finDsF.from):'start')+' to '+(finDsF.to?finDate(finDsF.to):'today') : 'Whole job')+(finDsQ ? ' · search “'+finDsQ+'”' : '')+' · excl. VAT · exported '+finDate(finToday()); ws.getCell('A2').font = {color:{argb:'FF6B7280'}}; };
  const mon = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
  const cellVal = t=>{
    const s = String(t||'').replace(/\s+/g,' ').trim();
    if(/^[−-]?£-?[\d,]+(\.\d+)?$/.test(s)){ const n = Number(s.replace(/[£,]/g,'').replace('−','-')); if(!isNaN(n)) return {v:n, money:1}; }
    const m = s.match(/^(\d{1,2}) ([A-Za-z]{3,4}) (\d{4})$/); if(m && mon[m[2].toLowerCase()]!=null) return {v:new Date(Number(m[3]), mon[m[2].toLowerCase()], Number(m[1]), 12), date:1};
    return {v:s};
  };
  const used = {};
  if(finDsTab==='summary'){
    const ws = wb.addWorksheet('Cost Summary'); head(ws); let r = 4;
    document.querySelectorAll('.finds-body .finds-p').forEach(p=>{
      const t = (p.querySelector('.sectiontitle')||{}).textContent || ''; ws.getCell('A'+r).value = t; ws.getCell('A'+r).font = {bold:true, size:12}; r++;
      p.querySelectorAll('.finds-kv').forEach(kv=>{ const c = cellVal((kv.querySelector('b')||{}).textContent); ws.getCell('A'+r).value = (kv.querySelector('span')||{}).textContent||''; ws.getCell('B'+r).value = c.v; if(c.money) ws.getCell('B'+r).numFmt = '£#,##0.00'; if(kv.classList.contains('b')) ws.getRow(r).font = {bold:true}; r++; });
      r++;
    });
    ws.getColumn(1).width = 40; ws.getColumn(2).width = 18;
  } else {
    const tables = [...document.querySelectorAll('.finds-body table')];
    if(!tables.length){ toast('Nothing on this tab to export.'); return; }
    tables.forEach((tb, ti)=>{
      let prev = tb.closest('.finreptbl-wrap') || tb; let title = '';
      for(let e = prev.previousElementSibling; e; e = e.previousElementSibling){ if(e.classList.contains('sectiontitle')){ title = e.textContent.trim(); break; } }
      let nm = (title || tabName || 'Sheet').replace(/[\\/?*\[\]:]/g,' ').slice(0,28).trim() || 'Sheet'; if(used[nm]) nm = nm.slice(0,25)+' '+(ti+1); used[nm] = 1;
      const ws = wb.addWorksheet(nm); head(ws);
      const ths = [...((tb.querySelector('thead tr')||{}).children||[])].map(th=>th.textContent.replace(/\s+/g,' ').trim());
      const keep = ths.map((h,i)=>h!=='' || i===0);
      ws.getRow(4).values = ths.filter((h,i)=>keep[i]); ws.getRow(4).font = {bold:true}; ws.getRow(4).fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFEEF1F4'}};
      let r = 5; const moneyCols = new Set();
      tb.querySelectorAll('tbody tr').forEach(tr=>{
        if(tr.style.display==='none') return;
        const tds = [...tr.children].filter((c,i)=>keep[i]); const row = ws.getRow(r);
        tds.forEach((td, j)=>{ const c = cellVal(td.textContent); const cell = row.getCell(j+1); cell.value = c.v; if(c.money){ cell.numFmt = '£#,##0.00'; moneyCols.add(j+1); } if(c.date) cell.numFmt = 'dd/mm/yyyy'; });
        r++;
      });
      if(r>5) moneyCols.forEach(c=>{ const col = ws.getColumn(c).letter; const cell = ws.getRow(r).getCell(c); cell.value = {formula:`SUM(${col}5:${col}${r-1})`}; cell.numFmt = '£#,##0.00'; cell.font = {bold:true}; });
      if(r>5 && moneyCols.size){ ws.getRow(r).getCell(1).value = 'Total'; ws.getRow(r).getCell(1).font = {bold:true}; }
      ths.filter((h,i)=>keep[i]).forEach((h,i)=>{ ws.getColumn(i+1).width = /descr/i.test(h) ? 46 : /supplier|who|client|project/i.test(h) ? 26 : 15; });
      ws.views = [{state:'frozen', ySplit:4}];
      ws.autoFilter = {from:{row:4, column:1}, to:{row:4, column:Math.max(1, ths.filter((h,i)=>keep[i]).length)}};
    });
  }
  const fname = ('Summary - '+(site.job_number?site.job_number+' ':'')+(site.name||'')+' - '+tabName+' - '+finToday()).replace(/[\\/:*?"<>|]+/g,'')+'.xlsx';
  return deliverExcelBuffer(await wb.xlsx.writeBuffer(), fname);
};
// Run Reports for one project (Andy, 23 Oct): pick any report that can be run per project;
// it opens with this project already chosen.
function renderFinJobReports(siteId){
  if(!finGuard()) return;
  const site = SITES.find(s=>s.id===siteId); if(!site){ go('#/finance'); return; }
  const reps = FIN_REPORTS.filter(r=>(r.filters||[]).includes('job'));
  const card = (t, d, js)=>`<button type="button" class="finrepcard" onclick="${js}"><span class="frc-t"><b>${escapeHtml(t)}</b><span>${escapeHtml(d)}</span></span><i aria-hidden="true">›</i></button>`;
  const keep = finProjTab[siteId]; finProjTab[siteId] = '__none';
  const tabs = typeof finProjTabsHtml==='function' ? finProjTabsHtml(siteId, 'application') : '';
  finProjTab[siteId] = keep;
  document.getElementById('app').innerHTML = shell(`
    ${tabs}
    <div class="finjobreps">
    <p class="stub" style="margin:0 0 10px;">Reports for <b>${escapeHtml((site.job_number?site.job_number+' · ':'')+site.name)}</b>. Pick one — it opens for this project; set the dates, then download it as Excel or PDF.</p>
    <p class="sectiontitle">This project</p>
    <div class="finrepgrid">${card('Detailed Summary', 'Sales against cost, with labour, plant, invoices and purchases.', `finDsTab='summary';go('#/site/${siteId}/finance/summary')`)}${card('Monthly Report', 'This month\'s value, cost and margin for the project.', `go('#/site/${siteId}/finance/monthly')`)}</div>
    ${Object.keys(FIN_REPORT_GROUPS).map(g=>{ const rs = reps.filter(r=>r.group===g); return rs.length ? `<p class="sectiontitle">${FIN_REPORT_GROUPS[g]}</p><div class="finrepgrid">${rs.map(r=>card(r.title, r.desc, `finRep={id:'${r.id}', f:{job:'${siteId}', from:'', to:'', status:'all', opening:'', varstatus:'', postatus:''}, sort:null, dir:1};go('#/finance/reports/${r.id}')`)).join('')}</div>` : ''; }).join('')}
  </div>
  `, {title:'Run Reports', subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
}
window.renderFinJobReports = renderFinJobReports;
(function(){
  const rsf = renderSiteFinance;
  renderSiteFinance = function(siteId){ const p = parseRoute(); if(p[3]==='summary') return renderFinDetail(siteId); if(p[3]==='reports') return renderFinJobReports(siteId); return rsf.apply(this, arguments); };
  const st = document.createElement('style');
  st.textContent = `.finds-hg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(0,1.6fr);gap:10px 18px;align-items:center;}
.finds-hg > div > span{display:block;font-size:11.5px;font-weight:700;color:var(--slate);margin-bottom:3px;}
.finds-hg > div > b{font-size:14.5px;}
.finds-dates{display:flex;gap:10px;align-items:end;flex-wrap:wrap;}
.finds-dl{flex:0 0 100%;font-size:11.5px;font-weight:800;color:var(--slate);text-transform:uppercase;letter-spacing:.03em;}
.finds-dn{flex:0 0 100%;font-size:11.5px;color:var(--slate);line-height:1.3;}
.finds-tools{display:flex;gap:8px;align-items:center;margin:0 0 10px;}
.finds-tools input{flex:1;min-width:0;height:38px !important;min-height:38px !important;margin:0 !important;padding:0 12px !important;font-size:14px !important;border-radius:10px !important;}
.finds-xl{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border:1px solid #CFE3D7;background:#F1F8F4;color:#1D6F42;border-radius:10px;font-size:13px;font-weight:800;margin-left:auto;}
.finds-xl:hover{background:#E4F2EA;}
.finds-tools input{-webkit-appearance:none;appearance:none;border:1px solid var(--line,#DCE1E8) !important;box-shadow:none !important;background:#fff;}
.finds-tools input:focus{border-color:var(--brand1,#E3262B) !important;outline:none;}
/* Full Summary tables on a computer: compact, and every column lines up with its heading (Andy, 25 Oct) */
.finds-body table.findstbl{font-size:13px;}
.finds-body table.findstbl th, .finds-body table.findstbl td{text-align:left !important;padding:6px 10px !important;vertical-align:middle !important;line-height:1.3;}
.finds-body table.findstbl th.num, .finds-body table.findstbl td.num, .finds-body table.findstbl td[data-l="Net"], .finds-body table.findstbl td[data-l="Value"], .finds-body table.findstbl td[data-l="Invoiced"], .finds-body table.findstbl td[data-l="Left To Invoice"]{text-align:right !important;}
.finds-body table.findstbl tr.fcf-row{display:none !important;}
.finds-body .findsfoot{padding:3px 12px;font-size:12px;}
/* Applications & Invoices: leave as is, but centre the Application column */
.finds-body table.fininvtbl:not(.findstbl) td[data-l="Application"], .finds-body table.fininvtbl:has(td[data-l="Application"]) thead tr th:first-child{text-align:center !important;}
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
.finjobreps .sectiontitle{margin:12px 0 6px !important;font-size:13px !important;}
.finjobreps .finrepgrid{display:block !important;background:#fff;border:1px solid var(--line,#ECEEF2);border-radius:12px;overflow:hidden;margin:0 0 6px;}
.finjobreps .finrepcard{all:unset;box-sizing:border-box;display:flex !important;align-items:center;gap:10px;width:100%;padding:9px 14px;cursor:pointer;border-top:1px solid var(--line,#ECEEF2);}
.finjobreps .finrepcard:first-child{border-top:0;}
.finjobreps .finrepcard:hover{background:#F8F9FB;}
.finjobreps .frc-t{flex:1;min-width:0;display:flex;flex-direction:column;}
.finjobreps .frc-t b{font-size:14px;font-weight:700;}
.finjobreps .frc-t span{font-size:12px;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.finjobreps .finrepcard i{font-style:normal;font-size:20px;color:var(--slate);}
.findsfoot{margin-top:8px;border-radius:10px;padding:5px 12px;font-size:12.5px;}
@media (max-width:900px){ .finds-sum{grid-template-columns:1fr;} .finds-hg{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 10px;align-items:start;} .finds-hg > div > b{font-size:13.5px;} .finds-dates{grid-column:1/-1;border-top:1px solid var(--line,#ECEEF2);padding-top:10px;} .finds-dates label{flex:1 1 0;min-width:0;} .finds-dates input{width:100% !important;} }`;
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
  // FB-21: the Projects-side "up one level" is for managers. Operatives and drivers open check-in
  // or the SOW from their Home dashboard, so their back arrow keeps going where it always did.
  if(!(typeof isManager==='function' && isManager(ME))) return null;
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
