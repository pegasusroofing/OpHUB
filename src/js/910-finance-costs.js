/* ============================================================
   OpHUB Finance — job costs ledger (#/site/<id>/finance/costs)
   Every cost on a job in one list, with tabs: All · Materials · Labour ·
   Plant · Subcontract · Overheads · Other · Committed (ordered, not yet
   invoiced). Search, date range, sort; export to Excel or PDF. Laid out as
   a table on a computer and as cards on a phone.
   Sources: supplier invoices / receipts (by their cost type), open POs
   (committed), sign-in labour days × rate, timesheets, plant hires, and
   costs added here (fin_job_costs).
   ============================================================ */
const FIN_COST_CATS = {materials:'Materials', labour:'Labour', plant:'Plant', subcontract:'Subcontract', overheads:'Overheads', other:'Other'};
let finCosts = null; // {siteId, tab, q, from, to, sort, dir, lines}

async function finJobCostLines(siteId){
  const [pinvs, pos, cks, manual, hires, extra, rates] = await Promise.all([
    dbSelect('purchase_invoices', 'site_id=eq.'+siteId+'&status=neq.rejected&order=invoice_date.desc'),
    dbSelect('purchase_orders', 'site_id=eq.'+siteId+'&status=eq.open'),
    dbSelect('checkins', 'site_id=eq.'+siteId+'&type=eq.in&select=user_id,site_id,ts,type&order=ts.desc&limit=20000'),
    dbSelect('fin_labour_manual', 'site_id=eq.'+siteId+'&order=work_date.desc'),
    dbSelect('fin_plant_hires', 'site_id=eq.'+siteId+'&order=on_hire.desc'),
    dbSelect('fin_job_costs', 'site_id=eq.'+siteId+'&order=cost_date.desc'),
    finLoadRates(),
  ]);
  await loadAllProfiles();
  const poBy = {}; pos.forEach(p=>{ poBy[p.id] = p; });
  const lines = [];
  pinvs.forEach(i=>{
    const cat = FIN_COST_CATS[i.cost_code] ? i.cost_code : 'materials';
    lines.push({key:'pi:'+i.id, date:i.invoice_date, cat, desc:i.description || (i.kind==='receipt' ? 'Receipt' : 'Supplier invoice'), who:i.supplier_name||'', ref:[i.invoice_no, poBy[i.po_id] && poBy[i.po_id].number].filter(Boolean).join(' · '), status:FIN_PI_STATUS[i.status]||i.status, waiting:i.status!=='approved', net:Number(i.net||0), open:`openPurchaseInvoiceView('${siteId}','${i.id}')`});
  });
  const allPinvs = pinvs;
  pos.forEach(p=>{
    if(p.value==null) return;
    const left = finRound(Number(p.value) - finPoInvoiced(p, allPinvs));
    if(left <= 0) return;
    lines.push({key:'po:'+p.id, date:String(p.created_at||'').slice(0,10), cat:'committed', desc:'Ordered, not invoiced yet', who:p.supplier_name||'', ref:p.number, status:'Committed', net:left, open:`go('#/site/${siteId}/finance/po/${p.id}')`});
  });
  finLabourDaysFrom(cks).forEach(d=>{
    const r = rates[d.user_id];
    lines.push({key:'ck:'+d.user_id+d.date, date:d.date, cat:'labour', desc:'Day on site (sign-in)', who:finPersonName(d.user_id), ref:'', status:r && r.day_rate!=null ? '' : 'No day rate', waiting:!(r && r.day_rate!=null), net:r && r.day_rate!=null ? Number(r.day_rate) : 0});
  });
  manual.forEach(m=>{
    lines.push({key:'ml:'+m.id, date:m.work_date, cat:'labour', desc:m.description || 'Timesheet', who:m.name || finPersonName(finPersonKey(m)), ref:m.days ? m.days+' day'+(Number(m.days)===1?'':'s') : '', status:'', net:Number(m.amount||0)});
  });
  hires.forEach(h=>{
    const c = finPlantCost(h);
    lines.push({key:'ph:'+h.id, date:h.on_hire, cat:'plant', desc:h.item+' ('+(h.off_hire ? finDate(h.on_hire)+' – '+finDate(h.off_hire) : 'on hire '+c.weeks+' wk')+')', who:h.supplier_name||'', ref:h.hire_ref||'', status:h.off_hire ? 'Off hire' : 'On hire', net:c.cost, open:`openFinPlantForm('${siteId}','${h.id}')`});
  });
  extra.forEach(x=>{
    lines.push({key:'jc:'+x.id, date:x.cost_date, cat:FIN_COST_CATS[x.category] ? x.category : 'other', desc:x.description, who:x.supplier||'', ref:x.ref||'', status:'', net:Number(x.net||0), open:`openFinJobCost('${siteId}','${x.id}')`});
  });
  return lines;
}

function finCostsShown(){
  const c = finCosts; const q = (c.q||'').toLowerCase();
  let rows = c.lines.filter(l=>{
    if(c.tab==='all' ? l.cat==='committed' : l.cat!==c.tab) return false;
    if(c.from && l.date < c.from) return false;
    if(c.to && l.date > c.to) return false;
    if(q && ![l.desc, l.who, l.ref, l.status, FIN_COST_CATS[l.cat]].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const k = c.sort, dir = c.dir==='asc' ? 1 : -1;
  rows = rows.slice().sort((a,b)=>{ const x = a[k], y = b[k]; if(x==y) return 0; return (k==='net' ? (Number(x)-Number(y)) : String(x||'').localeCompare(String(y||''))) * dir; });
  return rows;
}
function finCostTotals(){
  const t = {all:0, committed:0}; Object.keys(FIN_COST_CATS).forEach(k=>t[k]=0);
  const n = {all:0, committed:0}; Object.keys(FIN_COST_CATS).forEach(k=>n[k]=0);
  finCosts.lines.forEach(l=>{ t[l.cat] += l.net; n[l.cat]++; if(l.cat!=='committed'){ t.all += l.net; n.all++; } });
  Object.keys(t).forEach(k=>t[k] = finRound(t[k]));
  return {t, n};
}

async function renderFinCosts(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/finance'); return; }
  if(!finCosts || finCosts.siteId!==siteId) finCosts = {siteId, tab:'all', q:'', from:'', to:'', sort:'date', dir:'desc', lines:[]};
  const lines = await finJobCostLines(siteId);
  if(__gen !== RENDER_GEN) return;
  finCosts.lines = lines;
  const {t, n} = finCostTotals();
  const tabs = ['all', ...Object.keys(FIN_COST_CATS), 'committed'];
  const lbl = k=>k==='all' ? 'All costs' : k==='committed' ? 'Committed' : FIN_COST_CATS[k];
  document.getElementById('app').innerHTML = shell(`
    <div class="fincostsum">
      ${tabs.map(k=>`<button type="button" class="fincostsum-i ${finCosts.tab===k?'on':''} ${k==='committed'?'com':''}" onclick="finCostTab('${k}')"><span>${lbl(k)}</span><b>${finMoney(t[k], 0)}</b><em>${n[k]} line${n[k]===1?'':'s'}</em></button>`).join('')}
    </div>
    <div class="fincosttools">
      <input type="search" id="finCostQ" placeholder="Search description, supplier, ref…" value="${escapeHtml(finCosts.q)}" oninput="finCosts.q=this.value;finCostPaint()">
      <label>From<input type="date" value="${finCosts.from}" onchange="finCosts.from=this.value;finCostPaint()"></label>
      <label>To<input type="date" value="${finCosts.to}" onchange="finCosts.to=this.value;finCostPaint()"></label>
      <div class="fincosttools-b">
        <button class="ghostbtn" onclick="finCostExportXlsx()">⬇️ Excel</button>
        <button class="ghostbtn" onclick="finCostExportPdf()">📄 PDF</button>
        <button class="darkbtn" onclick="openFinJobCost('${siteId}')">+ Add cost</button>
      </div>
    </div>
    <div id="finCostTbl"></div>
    <p class="stub" style="margin:10px 0 0;font-style:normal;">Excl. VAT. “All costs” is what’s been spent or invoiced; supplier invoices still waiting for approval are included and marked. Committed = ordered on a PO but not invoiced yet. Labour from sign-in is priced at each person’s day rate.</p>
  `, {title:'Job costs', subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false, wide:true});
  finCostPaint();
}
window.finCostTab = function(k){ finCosts.tab = k; render(); };
window.finCostSort = function(k){ if(finCosts.sort===k) finCosts.dir = finCosts.dir==='asc'?'desc':'asc'; else { finCosts.sort = k; finCosts.dir = k==='net'||k==='date' ? 'desc' : 'asc'; } finCostPaint(); };
window.finCostPaint = function(){
  const box = document.getElementById('finCostTbl'); if(!box) return;
  const rows = finCostsShown();
  const tot = finRound(rows.reduce((s,l)=>s+l.net, 0));
  const waiting = finRound(rows.filter(l=>l.waiting).reduce((s,l)=>s+l.net, 0));
  const th = (k, l, cls)=>`<th class="${cls||''}" onclick="finCostSort('${k}')">${l}${finCosts.sort===k ? (finCosts.dir==='asc'?' ▲':' ▼') : ''}</th>`;
  box.innerHTML = rows.length ? `<table class="fincosttbl">
    <thead><tr>${th('date','Date')}${finCosts.tab==='all'?th('cat','Type'):''}${th('desc','Description')}${th('who','Supplier / person')}${th('ref','Ref')}${th('status','Status')}${th('net','Net £','num')}</tr></thead>
    <tbody>${rows.map(l=>`<tr ${l.open?`class="click" onclick="${l.open}"`:''}>
      <td data-l="Date">${finDate(l.date)}</td>
      ${finCosts.tab==='all'?`<td data-l="Type"><span class="fincat c-${l.cat}">${FIN_COST_CATS[l.cat]||l.cat}</span></td>`:''}
      <td data-l="Description" class="d">${escapeHtml(l.desc)}</td>
      <td data-l="Supplier / person">${escapeHtml(l.who)}</td>
      <td data-l="Ref">${escapeHtml(l.ref)}</td>
      <td data-l="Status">${l.status ? `<span class="finpill ${l.waiting?'warn':'grey'}">${escapeHtml(l.status)}</span>` : ''}</td>
      <td data-l="Net" class="num">${finMoney(l.net)}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="${finCosts.tab==='all'?6:5}">${rows.length} line${rows.length===1?'':'s'}${waiting?' · '+finMoney(waiting)+' waiting approval':''}</td><td class="num">${finMoney(tot)}</td></tr></tfoot>
  </table>` : `<div class="empty">No costs here${finCosts.q||finCosts.from||finCosts.to ? ' for this search' : ' yet'}.</div>`;
};

/* ---------- add / edit a cost ---------- */
window.openFinJobCost = async function(siteId, id){
  const x = id ? (await dbSelect('fin_job_costs', 'id=eq.'+id))[0] : null;
  let ov = document.getElementById('finJcOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finJcOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const cat = x ? x.category : (finCosts && FIN_COST_CATS[finCosts.tab] && finCosts.tab!=='labour' ? finCosts.tab : 'overheads');
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${x?'Cost':'Add a cost'}</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">For costs without a supplier invoice in OpHUB — skips, fuel, travel, accommodation, site set-up, a share of overheads.</p>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Type</label><select id="finJcCat">${Object.keys(FIN_COST_CATS).map(k=>`<option value="${k}" ${cat===k?'selected':''}>${FIN_COST_CATS[k]}</option>`).join('')}</select></div>
      <div class="formfield"><label class="field-label">Date</label><input type="date" id="finJcDate" value="${x?x.cost_date:finToday()}"></div>
    </div>
    <div class="formfield"><label class="field-label">Description</label><input type="text" id="finJcDesc" value="${escapeHtml(x?x.description:'')}"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Supplier</label><input type="text" id="finJcSup" value="${escapeHtml(x&&x.supplier||'')}"></div>
      <div class="formfield"><label class="field-label">Ref</label><input type="text" id="finJcRef" value="${escapeHtml(x&&x.ref||'')}"></div>
      <div class="formfield"><label class="field-label">Net £</label><input type="text" inputmode="decimal" id="finJcNet" value="${x?x.net:''}"></div>
      <div class="formfield"><label class="field-label">VAT £</label><input type="text" inputmode="decimal" id="finJcVat" value="${x?x.vat:''}"></div>
    </div>
    <button class="darkbtn" style="width:100%;" onclick="saveFinJobCost('${siteId}','${x?x.id:''}')">Save</button>
    ${x ? `<button class="ghostbtn" style="width:100%;margin-top:8px;color:var(--red);" onclick="deleteFinJobCost('${x.id}')">Remove</button>` : ''}
    <button class="geo-modal-cancel" onclick="document.getElementById('finJcOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.saveFinJobCost = async function(siteId, id){
  const desc = finVal('finJcDesc'), net = finNum(finVal('finJcNet')), vat = finNum(finVal('finJcVat'));
  if(!desc){ toast('Add a description.'); return; }
  if(net===null || isNaN(net)){ toast('Enter the net amount.'); return; }
  const row = {category:finVal('finJcCat')||'overheads', cost_date:finVal('finJcDate')||finToday(), description:desc, supplier:finVal('finJcSup')||null, ref:finVal('finJcRef')||null, net:finRound(net), vat:(vat===null||isNaN(vat))?0:finRound(vat)};
  const r = id ? await dbUpdate('fin_job_costs', id, row) : await dbInsert('fin_job_costs', Object.assign({org_id:ME.org_id, site_id:siteId, created_by:ME.id}, row));
  if(!r) return;
  document.getElementById('finJcOverlay').style.display = 'none'; toast('Saved'); render();
};
window.deleteFinJobCost = async function(id){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to remove'; return; }
  if(await dbDelete('fin_job_costs', id)){ document.getElementById('finJcOverlay').style.display='none'; toast('Removed'); render(); }
};
// Cost type on a supplier invoice (materials / plant / subcontract / overheads / other).
window.setFinPiCostCode = async function(id, code){
  const r = await dbUpdate('purchase_invoices', id, {cost_code:code});
  if(r) toast('Cost type: '+(FIN_COST_CATS[code]||code));
};

/* ---------- export ---------- */
function finCostExportName(ext){
  const s = SITES.find(x=>x.id===finCosts.siteId) || {};
  const tab = finCosts.tab==='all' ? 'All costs' : finCosts.tab==='committed' ? 'Committed' : FIN_COST_CATS[finCosts.tab];
  return ('Job costs - '+(s.job_number?s.job_number+' ':'')+(s.name||'')+' - '+tab+' - '+finToday()).replace(/[\\/:*?"<>|]+/g,'')+'.'+ext;
}
window.finCostExportXlsx = async function(){
  if(!(await loadLib('ExcelJS'))){ toast('Could not load the Excel tool — check your connection.'); return; }
  const rows = finCostsShown(); const s = SITES.find(x=>x.id===finCosts.siteId) || {};
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Costs', {views:[{state:'frozen', ySplit:4}]});
  ws.getCell('A1').value = 'Job costs — '+(s.job_number?s.job_number+' · ':'')+(s.name||''); ws.getCell('A1').font = {bold:true, size:14};
  ws.getCell('A2').value = (ORG&&ORG.name||'')+' · '+(finCosts.tab==='all'?'All costs':finCosts.tab==='committed'?'Committed':FIN_COST_CATS[finCosts.tab])+' · exported '+finDate(finToday())+' · excl. VAT';
  const head = ['Date','Type','Description','Supplier / person','Ref','Status','Net £'];
  ws.getRow(4).values = head; ws.getRow(4).font = {bold:true}; ws.getRow(4).fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFEEF1F4'}};
  rows.forEach((l,i)=>{ const r = ws.getRow(5+i); r.values = [l.date ? new Date(l.date+'T12:00:00') : '', FIN_COST_CATS[l.cat]||'Committed', l.desc, l.who, l.ref, l.status, finRound(l.net)]; r.getCell(1).numFmt = 'dd/mm/yyyy'; r.getCell(7).numFmt = '#,##0.00'; });
  const tr = ws.getRow(5+rows.length); tr.getCell(6).value = 'Total'; tr.getCell(7).value = rows.length ? {formula:`SUM(G5:G${4+rows.length})`} : 0; tr.font = {bold:true}; tr.getCell(7).numFmt = '#,##0.00';
  [12,14,48,26,20,14,14].forEach((w,i)=>ws.getColumn(i+1).width = w);
  ws.autoFilter = {from:'A4', to:'G4'};
  const buf = await wb.xlsx.writeBuffer();
  return deliverExcelBuffer(buf, finCostExportName('xlsx'));
};
window.finCostExportPdf = async function(){
  if(!(await loadLib('PDFLib'))){ toast('Could not load the PDF tool — check your connection.'); return; }
  const rows = finCostsShown(); const s = SITES.find(x=>x.id===finCosts.siteId) || {};
  const pdf = await PDFLib.PDFDocument.create();
  const reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica), bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 32; // A4 landscape
  const INK = PDFLib.rgb(0.07,0.08,0.09), SLATE = PDFLib.rgb(0.36,0.39,0.45), LINE = PDFLib.rgb(0.86,0.88,0.9);
  const cols = [{k:'date', w:62}, {k:'cat', w:70}, {k:'desc', w:250}, {k:'who', w:150}, {k:'ref', w:110}, {k:'status', w:70}, {k:'net', w:66, r:true}];
  let page, y;
  const fit = (t, f, sz, w)=>{ t = String(t||''); while(t && f.widthOfTextAtSize(t, sz) > w-6) t = t.slice(0,-2); return t; };
  const newPage = ()=>{
    page = pdf.addPage([W, H]); y = H-M;
    page.drawText('Job costs — '+(s.job_number?s.job_number+' · ':'')+(s.name||''), {x:M, y:y-12, size:14, font:bold, color:INK});
    page.drawText((ORG&&ORG.name||'')+' · '+(finCosts.tab==='all'?'All costs':finCosts.tab==='committed'?'Committed':FIN_COST_CATS[finCosts.tab])+' · '+finDate(finToday())+' · excl. VAT', {x:M, y:y-28, size:9, font:reg, color:SLATE});
    y -= 50; let x = M;
    ['Date','Type','Description','Supplier / person','Ref','Status','Net £'].forEach((h,i)=>{ const c = cols[i]; const tw = bold.widthOfTextAtSize(h, 8.5); page.drawText(h, {x: c.r ? x+c.w-tw-3 : x+3, y, size:8.5, font:bold, color:SLATE}); x += c.w; });
    y -= 6; page.drawLine({start:{x:M, y}, end:{x:W-M, y}, thickness:0.8, color:INK}); y -= 13;
  };
  newPage();
  rows.forEach(l=>{
    if(y < M+30) newPage();
    const vals = {date:finDate(l.date), cat:FIN_COST_CATS[l.cat]||'Committed', desc:l.desc, who:l.who, ref:l.ref, status:l.status, net:finMoney(l.net)};
    let x = M;
    cols.forEach(c=>{ const t = fit(vals[c.k], reg, 8.5, c.w); const tw = reg.widthOfTextAtSize(t, 8.5); page.drawText(t, {x: c.r ? x+c.w-tw-3 : x+3, y, size:8.5, font:reg, color:INK}); x += c.w; });
    page.drawLine({start:{x:M, y:y-4}, end:{x:W-M, y:y-4}, thickness:0.4, color:LINE}); y -= 15;
  });
  if(y < M+30) newPage();
  const tot = finMoney(rows.reduce((t,l)=>t+l.net, 0));
  page.drawText(rows.length+' lines', {x:M+3, y:y-4, size:9, font:reg, color:SLATE});
  page.drawText('Total '+tot, {x:W-M-bold.widthOfTextAtSize('Total '+tot, 10)-3, y:y-4, size:10, font:bold, color:INK});
  const pages = pdf.getPages(); pages.forEach((p,i)=>p.drawText((i+1)+' of '+pages.length, {x:W-M-30, y:16, size:8, font:reg, color:SLATE}));
  viewPdfInApp(await pdf.save(), finCostExportName('pdf'));
};
