/* ============================================================
   OpHUB Finance — job costs ledger (#/site/<id>/finance/costs)
   Every cost on a job in one list, with tabs: All · Materials · Labour ·
   Plant · Subcontract · Overheads · Other · Committed (ordered, not yet
   invoiced). Search, date range, sort; export to Excel or PDF. Laid out as
   a table on a computer and as cards on a phone.
   Sources: purchase invoices / receipts (by their cost type), open POs
   (committed), sign-in labour days × rate, timesheets, plant hires, and
   costs added here (fin_job_costs).
   ============================================================ */
const FIN_COST_CATS = {materials:'Materials', labour:'Labour', plant:'Plant', subcontract:'Subcontract', overheads:'Prelims & site costs', other:'Other'};
let finCosts = null; // {siteId, tab, q, from, to, sort, dir, lines}

// Built from the job's "book" (911) so the ledger, job page and reports agree.
async function finJobCostLines(siteId){
  const b = await finLoadBook(siteId);
  return finCostLinesFromBook(b, siteId);
}

// Lines for the chosen plot / repair job ('' = all, 'none' = not allocated).
function finCostsBase(){
  const c = finCosts; if(!c.sub) return c.lines;
  return c.lines.filter(l=>c.sub==='none' ? !l.sub : l.sub===c.sub);
}
function finCostsShown(){
  const c = finCosts; const q = (c.q||'').toLowerCase();
  let rows = finCostsBase().filter(l=>{
    if(c.tab==='all' ? l.cat==='committed' : l.cat!==c.tab) return false;
    if(c.from && l.date < c.from) return false;
    if(c.to && l.date > c.to) return false;
    if(q && ![l.desc, l.who, l.ref, l.status, FIN_COST_CATS[l.cat], l.sub ? finSubLabel(c.siteId, l.sub) : ''].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  rows.forEach(l=>l.subl = l.sub ? finSubLabel(c.siteId, l.sub, true) : '');
  const k = c.sort, dir = c.dir==='asc' ? 1 : -1;
  rows = rows.slice().sort((a,b)=>{ const x = a[k], y = b[k]; if(x==y) return 0; return (k==='net' ? (Number(x)-Number(y)) : String(x||'').localeCompare(String(y||''))) * dir; });
  return rows;
}
function finCostTotals(){
  const t = {all:0, committed:0}; Object.keys(FIN_COST_CATS).forEach(k=>t[k]=0);
  const n = {all:0, committed:0}; Object.keys(FIN_COST_CATS).forEach(k=>n[k]=0);
  finCostsBase().forEach(l=>{ t[l.cat] += l.net; n[l.cat]++; if(l.cat!=='committed'){ t.all += l.net; n.all++; } });
  Object.keys(t).forEach(k=>t[k] = finRound(t[k]));
  return {t, n};
}

async function renderFinCosts(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/finance'); return; }
  if(!finCosts || finCosts.siteId!==siteId) finCosts = {siteId, tab:'all', q:'', from:'', to:'', sort:'date', dir:'desc', lines:[], sub:''};
  const qs = typeof routeQuery==='function' ? routeQuery() : new URLSearchParams('');
  if(qs.has('sub')) finCosts.sub = qs.get('sub')||'';
  const [lines, subs] = await Promise.all([finJobCostLines(siteId), finSubJobsLoad(siteId, true)]);
  finCosts.hasSubs = subs.length > 0;
  if(__gen !== RENDER_GEN) return;
  finCosts.lines = lines;
  const {t, n} = finCostTotals();
  const tabs = ['all', ...Object.keys(FIN_COST_CATS), 'committed'];
  const lbl = k=>k==='all' ? 'All costs' : k==='committed' ? 'Committed' : FIN_COST_CATS[k];
  document.getElementById('app').innerHTML = shell(`
    <div class="fincostsum">
      ${tabs.map(k=>`<button type="button" class="fincostsum-i ${finCosts.tab===k?'on':''} ${k==='committed'?'com':''}" onclick="finCostTab('${k}')"><span>${lbl(k)}</span><b>${finMoney(t[k], 0)}</b><em>${n[k]} line${n[k]===1?'':'s'}</em></button>`).join('')}
    </div>
    ${finCosts.hasSubs ? `<div class="fincostsub">
      <label class="field-label" for="finCostSub">${escapeHtml(finSubNoun(siteId))}</label>
      <select id="finCostSub" onchange="finCostSetSub(this.value)">
        <option value="">All ${escapeHtml(finSubNoun(siteId, true).toLowerCase())}</option>
        <option value="none" ${finCosts.sub==='none'?'selected':''}>Not allocated (whole project)</option>
        ${subs.map(a=>`<option value="${a.id}" ${finCosts.sub===a.id?'selected':''}>${escapeHtml(a.label)}</option>`).join('')}
      </select>
      <button class="ghostbtn" onclick="go('#/site/${siteId}/finance/parts')">Overview by ${finSubKind(siteId)==='repair'?'repair job':'plot'}</button>
    </div>` : ''}
    <div class="fincosttools">
      <input type="search" id="finCostQ" placeholder="Search description, supplier, ref…" value="${escapeHtml(finCosts.q)}" oninput="finCosts.q=this.value;finCostPaint()">
      <label>From<input type="date" value="${finCosts.from}" onchange="finCosts.from=this.value;finCostPaint()"></label>
      <label>To<input type="date" value="${finCosts.to}" onchange="finCosts.to=this.value;finCostPaint()"></label>
      <div class="fincosttools-b">
        <button class="ghostbtn" onclick="finCostExportXlsx()">Excel</button>
        <button class="ghostbtn" onclick="finCostExportPdf()">PDF</button>
        <button class="darkbtn" onclick="openFinJobCost('${siteId}')">+ Add cost</button>
      </div>
    </div>
    <div id="finCostTbl"></div>
    <p class="stub" style="margin:10px 0 0;font-style:normal;">Excl. VAT. “All costs” is what’s been spent or invoiced; purchase invoices still waiting for approval are included and marked. Committed = ordered on a PO but not invoiced yet. Labour from sign-in is priced at each person’s day rate.</p>
  `, {title:finCosts.sub && finCosts.sub!=='none' ? finSubLabel(siteId, finCosts.sub, true)+' costs' : 'Project costs', subtitle:(site.job_number?site.job_number+' · ':'')+site.name, back:finCosts.sub ? `#/site/${siteId}/finance/parts` : `#/site/${siteId}/finance`, siteId, tabs:false, wide:true});
  finCostPaint();
}
window.finCostTab = function(k){ finCosts.tab = k; render(); };
window.finCostSetSub = function(v){ finCosts.sub = v; go('#/site/'+finCosts.siteId+'/finance/costs'+(v?'?sub='+v:'')); };
function finCostSubCell(l){
  if(!finCosts.hasSubs) return '';
  const lbl = l.sub ? finSubLabel(finCosts.siteId, l.sub, true) : '';
  const btn = l.src ? ` onclick="event.stopPropagation();openFinSplit('${l.src.t}','${l.src.id}')" title="Allocate / split"` : '';
  return `<td data-l="${escapeHtml(finSubNoun(finCosts.siteId))}">${lbl ? `<span class="finsubpill ${l.share<0.9999?'split':''}" ${btn} ${btn?'style="cursor:pointer;"':''}>${escapeHtml(lbl)}${l.share<0.9999?' · '+finRound(l.share*100)+'%':''}</span>` : `<span class="finsubpill un" ${btn}>${l.src?'Allocate':'Not allocated'}</span>`}</td>`;
}
window.finCostSort = function(k){ if(finCosts.sort===k) finCosts.dir = finCosts.dir==='asc'?'desc':'asc'; else { finCosts.sort = k; finCosts.dir = k==='net'||k==='date' ? 'desc' : 'asc'; } finCostPaint(); };
window.finCostPaint = function(){
  const box = document.getElementById('finCostTbl'); if(!box) return;
  const rows = finCostsShown();
  const tot = finRound(rows.reduce((s,l)=>s+l.net, 0));
  const waiting = finRound(rows.filter(l=>l.waiting).reduce((s,l)=>s+l.net, 0));
  const th = (k, l, cls)=>`<th class="${cls||''}" onclick="finCostSort('${k}')">${l}${finCosts.sort===k ? (finCosts.dir==='asc'?' ▲':' ▼') : ''}</th>`;
  box.innerHTML = rows.length ? `<table class="fincosttbl">
    <thead><tr>${th('date','Date')}${finCosts.tab==='all'?th('cat','Type'):''}${th('desc','Description')}${th('who','Supplier / person')}${th('ref','Ref')}${finCosts.hasSubs?th('subl',escapeHtml(finSubNoun(finCosts.siteId))):''}${th('status','Status')}${th('net','Net £','num')}</tr></thead>
    <tbody>${rows.map(l=>`<tr ${l.open?`class="click" onclick="${l.open}"`:''}>
      <td data-l="Date">${finDate(l.date)}</td>
      ${finCosts.tab==='all'?`<td data-l="Type"><span class="fincat c-${l.cat}">${FIN_COST_CATS[l.cat]||l.cat}</span></td>`:''}
      <td data-l="Description" class="d">${escapeHtml(l.desc)}</td>
      <td data-l="Supplier / person">${escapeHtml(l.who)}</td>
      <td data-l="Ref">${escapeHtml(l.ref)}</td>
      ${finCostSubCell(l)}
      <td data-l="Status">${l.status ? `<span class="finpill ${l.waiting?'warn':'grey'}">${escapeHtml(l.status)}</span>` : ''}</td>
      <td data-l="Net" class="num">${finMoney(l.net)}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="${(finCosts.tab==='all'?6:5)+(finCosts.hasSubs?1:0)}">${rows.length} line${rows.length===1?'':'s'}${waiting?' · '+finMoney(waiting)+' waiting approval':''}</td><td class="num">${finMoney(tot)}</td></tr></tfoot>
  </table>` : `<div class="empty">No costs here${finCosts.q||finCosts.from||finCosts.to ? ' for this search' : ' yet'}.</div>`;
};

/* ---------- add / edit a cost ---------- */
window.openFinJobCost = async function(siteId, id){
  const x = id ? (await dbSelect('fin_job_costs', 'id=eq.'+id))[0] : null;
  if(x && x.supplier==='Yard' && x.ref==='YARD'){ customAlert('This cost came from yard stock ('+(x.description||'')+'). To change it, issue or return the stock in Purchases › Yard stock (or the project’s Material Requests) — the cost updates itself.'); return; }
  await finSubJobsLoad(siteId);
  const subSel = x ? (x.sub_job_id||'') : (finCosts && finCosts.siteId===siteId && finCosts.sub && finCosts.sub!=='none' ? finCosts.sub : '');
  let ov = document.getElementById('finJcOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finJcOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const cat = x ? x.category : (finCosts && FIN_COST_CATS[finCosts.tab] && finCosts.tab!=='labour' ? finCosts.tab : 'overheads');
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${x?'Cost':'Add a cost'}</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">For costs without a purchase invoice in OpHUB — skips, fuel, travel, accommodation, site set-up. (Company overheads are added automatically — Finance › Settings › Company overheads.)</p>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Type</label><select id="finJcCat">${Object.keys(FIN_COST_CATS).map(k=>`<option value="${k}" ${cat===k?'selected':''}>${FIN_COST_CATS[k]}</option>`).join('')}</select></div>
      <div class="formfield"><label class="field-label">Date</label><input type="date" id="finJcDate" value="${x?x.cost_date:finToday()}"></div>
    </div>
    <div class="formfield"><label class="field-label">Description</label><input type="text" id="finJcDesc" value="${escapeHtml(x?x.description:'')}"></div>
    ${x && x.split ? finAllocBlockHtml('fin_job_costs', x) : finSubJobSelectHtml('finJcSub', siteId, subSel)}
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Supplier</label><input type="text" id="finJcSup" value="${escapeHtml(x&&x.supplier||'')}"></div>
      <div class="formfield"><label class="field-label">Ref</label><input type="text" id="finJcRef" value="${escapeHtml(x&&x.ref||'')}"></div>
      <div class="formfield"><label class="field-label">Net £</label><input type="text" inputmode="decimal" data-money id="finJcNet" value="${x?x.net:''}"></div>
      <div class="formfield"><label class="field-label">VAT £</label><input type="text" inputmode="decimal" data-money id="finJcVat" value="${x?x.vat:''}"></div>
    </div>
    <button class="darkbtn" style="width:100%;" onclick="saveFinJobCost('${siteId}','${x?x.id:''}')">Save</button>
    ${x ? `<button class="ghostbtn" style="width:100%;margin-top:8px;" onclick="document.getElementById('finJcOverlay').style.display='none';openFinSplit('fin_job_costs','${x.id}')">Split across ${FIN_SUBJOBS[siteId]&&FIN_SUBJOBS[siteId].length?escapeHtml(finSubNoun(siteId, true).toLowerCase())+' / ':''}projects</button>` : ''}
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
  const subEl = document.getElementById('finJcSub'); if(subEl) row.sub_job_id = subEl.value || null;
  const r = id ? await dbUpdate('fin_job_costs', id, row) : await dbInsert('fin_job_costs', Object.assign({org_id:ME.org_id, site_id:siteId, created_by:ME.id}, row));
  if(!r) return;
  document.getElementById('finJcOverlay').style.display = 'none'; toast('Saved'); render();
};
window.deleteFinJobCost = async function(id){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to remove'; return; }
  if(await dbDelete('fin_job_costs', id)){ document.getElementById('finJcOverlay').style.display='none'; toast('Removed'); render(); }
};
// Cost type on a purchase invoice (materials / plant / subcontract / overheads / other).
window.setFinPiCostCode = async function(id, code){
  const r = await dbUpdate('purchase_invoices', id, {cost_code:code});
  if(r) toast('Cost type: '+(FIN_COST_CATS[code]||code));
};

/* ---------- export ---------- */
function finCostExportName(ext){
  const s = SITES.find(x=>x.id===finCosts.siteId) || {};
  const tab = (finCosts.sub ? (finCosts.sub==='none' ? 'Not allocated' : finSubLabel(finCosts.siteId, finCosts.sub, true))+' - ' : '')+(finCosts.tab==='all' ? 'All costs' : finCosts.tab==='committed' ? 'Committed' : FIN_COST_CATS[finCosts.tab]);
  return ('Project costs - '+(s.job_number?s.job_number+' ':'')+(s.name||'')+' - '+tab+' - '+finToday()).replace(/[\\/:*?"<>|]+/g,'')+'.'+ext;
}
window.finCostExportXlsx = async function(){
  if(!(await loadLib('ExcelJS'))){ toast('Could not load the Excel tool — check your connection.'); return; }
  const rows = finCostsShown(); const s = SITES.find(x=>x.id===finCosts.siteId) || {};
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Costs', {views:[{state:'frozen', ySplit:4}]});
  ws.getCell('A1').value = 'Project costs — '+(s.job_number?s.job_number+' · ':'')+(s.name||''); ws.getCell('A1').font = {bold:true, size:14};
  ws.getCell('A2').value = (ORG&&ORG.name||'')+(finCosts.sub ? ' · '+(finCosts.sub==='none' ? 'Not allocated' : finSubLabel(finCosts.siteId, finCosts.sub)) : '')+' · '+(finCosts.tab==='all'?'All costs':finCosts.tab==='committed'?'Committed':FIN_COST_CATS[finCosts.tab])+' · exported '+finDate(finToday())+' · excl. VAT';
  const head = ['Date','Type','Description','Supplier / person','Ref','Status','Net £', finCosts.hasSubs ? finSubNoun(finCosts.siteId) : null].filter(Boolean);
  ws.getRow(4).values = head; ws.getRow(4).font = {bold:true}; ws.getRow(4).fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFEEF1F4'}};
  rows.forEach((l,i)=>{ const r = ws.getRow(5+i); r.values = [l.date ? new Date(l.date+'T12:00:00') : '', FIN_COST_CATS[l.cat]||'Committed', l.desc, l.who, l.ref, l.status, finRound(l.net)].concat(finCosts.hasSubs ? [l.sub ? finSubLabel(finCosts.siteId, l.sub) : 'Not allocated'] : []); r.getCell(1).numFmt = 'dd/mm/yyyy'; r.getCell(7).numFmt = '£#,##0.00'; });
  const tr = ws.getRow(5+rows.length); tr.getCell(6).value = 'Total'; tr.getCell(7).value = rows.length ? {formula:`SUM(G5:G${4+rows.length})`} : 0; tr.font = {bold:true}; tr.getCell(7).numFmt = '£#,##0.00';
  [12,14,48,26,20,14,14,30].forEach((w,i)=>ws.getColumn(i+1).width = w);
  ws.autoFilter = {from:'A4', to:finCosts.hasSubs ? 'H4' : 'G4'};
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
    page.drawText('Project costs — '+(s.job_number?s.job_number+' · ':'')+(s.name||''), {x:M, y:y-12, size:14, font:bold, color:INK});
    page.drawText((ORG&&ORG.name||'')+(finCosts.sub ? ' · '+(finCosts.sub==='none' ? 'Not allocated' : finSubLabel(finCosts.siteId, finCosts.sub)) : '')+' · '+(finCosts.tab==='all'?'All costs':finCosts.tab==='committed'?'Committed':FIN_COST_CATS[finCosts.tab])+' · '+finDate(finToday())+' · excl. VAT', {x:M, y:y-28, size:9, font:reg, color:SLATE});
    y -= 50; let x = M;
    ['Date','Type','Description','Supplier / person','Ref','Status','Net £'].forEach((h,i)=>{ const c = cols[i]; const tw = bold.widthOfTextAtSize(h, 8.5); page.drawText(h, {x: c.r ? x+c.w-tw-3 : x+3, y, size:8.5, font:bold, color:SLATE}); x += c.w; });
    y -= 6; page.drawLine({start:{x:M, y}, end:{x:W-M, y}, thickness:0.8, color:INK}); y -= 13;
  };
  newPage();
  rows.forEach(l=>{
    if(y < M+30) newPage();
    const vals = {date:finDate(l.date), cat:FIN_COST_CATS[l.cat]||'Committed', desc:(finCosts.hasSubs && !finCosts.sub ? '['+(l.sub ? finSubLabel(finCosts.siteId, l.sub, true) : 'n/a')+'] ' : '')+l.desc, who:l.who, ref:l.ref, status:l.status, net:finMoney(l.net)};
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

/* ---------- FA-20 (24 Oct 2026): plant card total ----------
   A hire set to "cost comes from the hire company's invoices" is already counted through those
   invoices, so it mustn't be added again at rate × time in the card's "Plant to date" total
   (911's job costs and 9219y's Purchases tab already leave it out). The hire is still listed. */
(function(){
  if(typeof finPlantCardHtml!=='function') return;
  const base = finPlantCardHtml;
  finPlantCardHtml = function(siteId, hires){
    const html = base.apply(this, arguments);
    const list = hires || [];
    if(!list.some(h=>h.cost_from==='invoices')) return html;
    const all = finMoney(list.reduce((t,h)=>t+finPlantCost(h).cost, 0));
    const fixed = finMoney(list.filter(h=>h.cost_from!=='invoices').reduce((t,h)=>t+finPlantCost(h).cost, 0));
    const at = html.indexOf('<div class="finkv big"><span>Plant to date'); if(at < 0) return html;
    const tail = html.slice(at).replace('<b>'+all+'</b></div>', '<b>'+fixed+'</b></div><p class="stub" style="margin:4px 0 0;font-style:normal;">Hires costed from the hire company’s invoices are counted with the purchase invoices, not in this total.</p>');
    return html.slice(0, at) + tail;
  };
})();
