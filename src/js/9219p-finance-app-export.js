/* ============================================================
   OpHUB Finance — applications: Submit / Return to draft, a clear
   Draft → Submitted → Certified → Invoiced path, a Back button on every
   job Finance page, and the Excel / PDF in the Coreloops layout
   (Andy, 22 Oct — copy of "82B Parchmore Road AFP 003").

   Excel: "General Summary" sheet first (Section | Total | Applied Total |
   Applied % | Certified Total | Certified %, then SubTotal, Retention,
   Net after retention, Previously certified, Gross payment due, VAT, Net
   payment due), then one sheet per header in the Bill of Quantities, then
   Variations (and Dayworks if any). Each sheet: Ref, Description, Qty, Unit,
   Rate, Amount, Prev Certified %, Prev Certified, Applied %, Applied,
   Certified %, Certified, Difference, Notes. Column A (hidden) holds
   OpHUB's key for each row so the file can come back in.
   Upload: the Applied % column updates the application; the Certified %
   column fills in the client's certificate. New rows (no key) become new
   Bill of Quantities lines under the header above them.
   ============================================================ */

/* ---------- the path, and Submit / Return to draft ---------- */
// Status drop-down (Draft · Applied · Certified · Invoiced) and one button for the next step.
FIN_APP_STATUS.submitted = 'Applied';
function finAppStageKey(a){ return a.status==='invoiced' && !a.invoice_id ? 'certified' : a.status==='submitted' ? 'applied' : a.status; }
function finAppNextBtn(a){
  const st = finAppStageKey(a);
  return {
    draft:`<button class="darkbtn" onclick="finAppSubmit('${a.id}')">Apply ›</button>`,
    applied:'',
    // Certified / Invoiced: the one button lives in the certificate box (Raise invoice / Open invoice).
  }[st] || '';
}
function finAppStepsHtml(a){
  const st = finAppStageKey(a); if(st==='void') return '';
  const opts = [['draft','Draft'],['applied','Applied'],['certified','Certified'],['invoiced','Invoiced']];
  const tip = {draft:'Fill in the % done, then press Apply. That locks it — you can still email it to the client.', applied:'When the client’s certificate comes back, put their Certified % on each line (or upload their Excel), then press Certify.', certified:'Press Raise invoice in the certificate box: certified total, less discount, less retention, less previously certified, with VAT on the total.', invoiced:'Done — the invoice is raised.'}[st] || '';
  const at = opts.findIndex(o=>o[0]===st);
  return `<div class="card finappflow">
    <label class="finappflow-st">Status<select onchange="finAppSetStage('${a.id}', this.value, this)">${opts.map(([k,l])=>`<option value="${k}" ${k===st?'selected':''}>${l}</option>`).join('')}</select></label>
    <div class="finappflow-steps">${opts.map(([k,l],i)=>`<span class="${i<at?'done':i===at?'on':''}">${i<at?'✓ ':''}${l}</span>`).join('<i>›</i>')}</div>
    <p class="stub" style="margin:0;font-style:normal;flex-basis:100%;">${tip}</p>
  </div>`;
}
window.finAppCertifyGo = function(){
  const c = document.querySelector('#finCertSlot .card'); if(!c){ toast('Apply the application first.'); return; }
  c.scrollIntoView({behavior:'smooth', block:'start'});
  setTimeout(()=>{ const f = document.getElementById('finCertGross'); if(f) f.focus(); }, 400);
};
window.finAppSetStage = async function(appId, want, sel){
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a) return;
  const cur = finAppStageKey(a);
  const reset = ()=>{ if(sel) sel.value = cur; };
  if(want===cur) return;
  if(want==='draft'){ reset(); await finAppToDraft(appId); return; }
  if(want==='applied'){
    if(cur==='draft'){ reset(); await finAppSubmit(appId); return; }
    if(a.invoice_id){ toast('It’s been invoiced — void the invoice first.'); reset(); return; }
    if(!await customConfirm('Take it back to Applied? The certificate figures will be cleared.')){ reset(); return; }
    await dbUpdate('fin_applications', appId, {cert_net:null, cert_gross:null, cert_retention:null, cert_previous:null, cert_discount:null, cert_lines:null, status:'submitted', updated_at:new Date().toISOString()});
    finApp = null; render(); return;
  }
  if(want==='certified'){
    reset();
    if(cur==='draft'){ toast('Apply it first, then certify.'); return; }
    if(cur==='applied'){ finAppCertifyGo(); return; }
    toast('It’s already been invoiced.'); return;
  }
  if(want==='invoiced'){
    reset();
    if(cur!=='certified'){ toast(cur==='applied' ? 'Certify it first — enter the client’s figures.' : 'Apply and certify it first.'); return; }
    raiseInvoiceFromCert(a.site_id, a.id); return;
  }
};
window.finAppSubmit = async function(appId){
  if(finApp && finApp.id===appId && document.getElementById('finAppSave')){ const ok = await saveFinApplication(false); if(ok===false) return; }
  if(!await customConfirm('Mark this application as Applied? It will be locked so the figures can’t change. You can return it to draft if you need to edit it.')) return;
  const r = await dbUpdate('fin_applications', appId, {status:'submitted', submitted_at:new Date().toISOString(), updated_at:new Date().toISOString()});
  if(r){ finApp = null; toast('Applied — now locked. Email it to the client when ready.'); render(); }
};
window.finAppToDraft = async function(appId){
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a) return;
  if(a.cert_net!=null || a.invoice_id){ toast('It has a certificate — change the certificate figures first.'); return; }
  if(!await customConfirm('Return this application to draft so you can edit it? Submit it again when you’re done.')) return;
  const r = await dbUpdate('fin_applications', appId, {status:'draft', updated_at:new Date().toISOString()});
  if(r){ finApp = null; toast('Back to draft — you can edit it now'); render(); }
};
// The certificate box says what it is.
(function(){
  const base = finCertSlotRender;
  finCertSlotRender = function(a){
    base.apply(this, arguments);
    const el = document.getElementById('finCertSlot'); if(!el) return;
    const t = el.querySelector('.sectiontitle');
    if(t && a.cert_net==null) t.innerHTML = '✅ Certify — enter the client’s certificate';
    const sv = document.getElementById('finCertSave'); if(sv && a.cert_net==null) sv.textContent = 'Certify';
    const inv = document.getElementById('finCertInvoice'); if(inv && a.cert_net==null) inv.checked = false;
    const dsc = document.getElementById('finCertDisc'); if(dsc && a.cert_net==null && Number(a.discount||0) && !Number(finNum(dsc.value)||0)){ dsc.value = String(finRound(a.discount)); if(typeof finCertCalc==='function') finCertCalc(); }
    const card = el.querySelector('.card'); if(card && a.cert_net==null) card.classList.add('fincertify');
  };
})();
(function(){
  const st = document.createElement('style');
  st.textContent = `.finappflow{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:12px 16px !important;}
.finappflow-st{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:var(--slate);}
.finappflow-st select{height:32px !important;min-height:32px !important;padding:0 28px 0 10px !important;line-height:30px !important;font-size:13px !important;font-weight:700;border-radius:8px !important;margin:0 !important;width:auto !important;}
.finappflow-steps{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;color:var(--slate);}
.finappflow-steps span{padding:4px 10px;border-radius:20px;background:#F2F4F7;font-weight:600;}
.finappflow-steps span.done{background:#EAF6EE;color:#1E6B45;} .finappflow-steps span.on{background:var(--brand1);color:#fff;}
.finappflow-steps i{font-style:normal;color:#B8BDC6;}
.finappflow-next{margin-left:auto;display:flex;gap:8px;}
.finappdates{padding:0 !important;}
.finappdates > summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:11px 16px;font-size:13.5px;font-weight:800;}
.finappdates > summary::-webkit-details-marker{display:none}
.finappdates > summary em{font-style:normal;font-weight:500;font-size:12.5px;color:var(--slate);flex:1;}
.finappdates > summary b{color:var(--slate);transition:transform .15s;} .finappdates[open] > summary b{transform:rotate(180deg);}
.finappdates-g{display:grid;grid-template-columns:repeat(4,minmax(0,170px));gap:10px;padding:0 16px 14px;}
.finappdates-g .formfield{margin:0;} .finappdates-g .field-label{font-size:11.5px !important;margin-bottom:3px;}
.finappdates-g input{height:32px !important;min-height:32px !important;padding:0 8px !important;font-size:13px !important;border-radius:8px !important;}
@media (max-width:700px){ .finappdates-g{grid-template-columns:1fr 1fr;} .finappdates > summary em{display:none;} }
.finsubmitted{background:#EEF4FF !important;border-color:#C9DAF8 !important;color:#1F3A5F !important;}
.fincertify{border:2px solid var(--brand1) !important;}
@media (max-width:700px){ .finappflow-next{margin-left:0;} }`;
  document.head.appendChild(st);
})();

/* ---------- Back button on the job Finance bar: up one level ---------- */
function finUpTarget(){
  const parts = typeof parseRoute==='function' ? parseRoute() : [];
  if(parts[0]!=='site' || parts[2]!=='finance') return null;
  const id = parts[1], sub = parts[3];
  if(!sub) return {hash:'#/finance/jobs'};
  const tab = {application:'sales', invoice:'sales', po:'purchases', sub:'subs', contract:'boq'}[sub] || 'overview';
  return {hash:'#/site/'+id+'/finance', tab, id};
}
window.finGoUp = function(){
  const t = finUpTarget(); if(!t) return;
  if(t.tab && typeof finProjTab!=='undefined') finProjTab[t.id] = t.tab;
  go(t.hash);
};
(function(){
  const base = finShellPrefix;
  finShellPrefix = function(opts){
    const h = base.apply(this, arguments);
    if(!h) return h;
    return h.replace('<button type="button" class="finprojbar-home"', `<button type="button" class="finprojbar-home finprojbar-back" onclick="finGoUp()" title="Back one level" aria-label="Back">←<span>Back</span></button><button type="button" class="finprojbar-home"`);
  };
  const st = document.createElement('style'); st.textContent = '.finprojbar-back{font-size:15px;} .finprojbar-back span{font-size:13px;}'; document.head.appendChild(st);
})();

/* ---------- shared: the application, previous certificate, sections ---------- */
async function finAppExportData(a){
  const site = SITES.find(s=>s.id===a.site_id) || {};
  const [jfRows, apps] = await Promise.all([dbSelect('job_finance', 'site_id=eq.'+a.site_id), dbSelect('fin_applications', 'site_id=eq.'+a.site_id+'&order=number.asc')]);
  const jf = jfRows[0] || {};
  const prev = apps.filter(x=>x.number < a.number && ['certified','invoiced'].includes(x.status)).pop() || apps.filter(x=>x.number < a.number && x.status==='submitted').pop() || null;
  const prevPct = {}, prevVar = {};
  if(prev){
    const cl = {}; (prev.cert_lines||[]).forEach(l=>{ cl[l.item_id] = l.pct; });
    (prev.lines||[]).filter(finIsItem).forEach(l=>{ prevPct[l.item_id] = cl[l.item_id]!=null ? cl[l.item_id] : finPct(l.pct); });
    (prev.variations||[]).forEach(v=>{ const k = v.fin_variation_id || v.variation_id; if(k) prevVar[k] = finPct(v.pct); });
  }
  const certPct = {}; (a.cert_lines||[]).forEach(l=>{ certPct[l.item_id] = l.pct; });
  const certified = a.cert_net!=null;
  // Group the lines by top-level header.
  const sections = []; let cur = null;
  (a.lines||[]).forEach(l=>{
    if(l.kind==='section'){ cur = {id:l.item_id, title:(l.ref?l.ref+' ':'')+(l.description||'Section'), rows:[]}; sections.push(cur); return; }
    if(!cur){ cur = {id:'', title:'Contract works', rows:[]}; sections.push(cur); }
    cur.rows.push(l);
  });
  const vars = (a.variations||[]).map((v,i)=>({key:'V:'+(v.variation_id||('x'+i)), v, prev: prevVar[v.fin_variation_id||v.variation_id]||0}));
  const vt = finAppVatTreat(jf);
  return {site, jf, prev, prevPct, certPct, certified, sections, vars, vt, retPct:finPct(a.retention_pct), discPct:finPct(a.discount_pct||0), previous:finRound(a.previous||0)};
}
function finSheetName(t, used){
  let n = String(t||'Section').replace(/[\[\]:*?\/\\]/g,' ').trim().slice(0,31) || 'Section';
  let k = n, i = 2; while(used.has(k.toLowerCase())){ k = n.slice(0, 28)+' '+(i++); } used.add(k.toLowerCase()); return k;
}

/* ---------- Excel out (Coreloops layout) ---------- */
async function finAppExcelBytes(a){
  if(!(await loadLib('ExcelJS'))){ toast('Could not load the Excel tool — check your connection.'); return null; }
  const D = await finAppExportData(a);
  const wb = new ExcelJS.Workbook(); wb.creator = (ORG&&ORG.name)||'OpHUB'; wb.calcProperties = {fullCalcOnLoad:true};
  const money = '£#,##0.00', pct = '0.00%';
  const thin = {style:'thin', color:{argb:'FFBFBFBF'}}, box = {top:thin, left:thin, bottom:thin, right:thin};
  const fill = argb=>({type:'pattern', pattern:'solid', fgColor:{argb}});
  const used = new Set(['general summary']);
  const sum = wb.addWorksheet('General Summary', {pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0}});
  sum.columns = [{width:4}, {width:36}, {width:19}, {width:19}, {width:13}, {width:19}, {width:13}];
  const HEAD = ['OpHUB Key','Ref','Description','Qty','Unit','Rate','Amount','Prev Certified %','Prev Certified','Applied %','Applied','Certified %','Certified','Difference','Notes','Include in Summary'];
  const sheetRefs = [];
  const mkSheet = (title, startKey)=>{
    const name = finSheetName(title, used);
    const ws = wb.addWorksheet(name, {pageSetup:{paperSize:9, orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0}, views:[{state:'frozen', ySplit:1}]});
    ws.columns = [{width:11, hidden:true}, {width:9}, {width:46}, {width:9}, {width:11}, {width:15}, {width:15}, {width:16}, {width:15}, {width:12}, {width:15}, {width:12}, {width:15}, {width:14}, {width:21}, {width:11, hidden:true}];
    const h = ws.addRow(HEAD); h.eachCell(c=>{ c.font = {bold:true}; c.fill = fill('FFF5F5DC'); c.border = box; c.alignment = {vertical:'middle', wrapText:true}; });
    const t = ws.addRow([startKey||'', title]); t.getCell(2).font = {bold:true}; for(let c=2;c<=15;c++){ t.getCell(c).fill = fill('FFFFFFCC'); } t.getCell(2).border = box;
    return {ws, name};
  };
  const addItem = (ws, key, ref, desc, qty, unit, rate, value, prevP, appP, certP)=>{
    const r = ws.addRow([key, ref==null?'':String(ref), desc||'', qty, unit||'', rate, null, prevP/100, null, appP/100, null, certP/100, null, null, '', 1]);
    const n = r.number;
    r.getCell(7).value = qty!=null && rate!=null ? {formula:`IFERROR(D${n}*F${n}, 0)`, result:finRound(qty*rate)} : Number(value||0);
    r.getCell(9).value = {formula:`IFERROR(G${n}*H${n}, 0)`}; r.getCell(11).value = {formula:`IFERROR(G${n}*J${n}, 0)`};
    r.getCell(13).value = {formula:`IFERROR(G${n}*L${n}, 0)`}; r.getCell(14).value = {formula:`IFERROR(M${n}-K${n}, 0)`};
    for(let c=2;c<=15;c++){ const cell = r.getCell(c); cell.border = box; cell.font = {size:10}; }
    [6,7,9,11,13,14].forEach(c=>r.getCell(c).numFmt = money); [8,10,12].forEach(c=>r.getCell(c).numFmt = pct);
    r.getCell(10).fill = fill('FFFFF6DB'); r.getCell(12).fill = fill('FFEAF6EE');
    r.getCell(3).alignment = {wrapText:true, vertical:'top'};
  };
  D.sections.forEach(sec=>{
    const {ws, name} = mkSheet(sec.title, sec.id ? 'H:'+sec.id : '');
    sec.rows.forEach(l=>{
      if(l.kind==='subsection'){ const r = ws.addRow(['H:'+l.item_id, l.ref||'', l.description||'']); r.getCell(3).font = {bold:true, size:10}; for(let c=2;c<=15;c++){ r.getCell(c).fill = fill('FFE6F3FF'); r.getCell(c).border = box; } return; }
      const ap = finPct(l.pct), cp = D.certPct[l.item_id]!=null ? D.certPct[l.item_id] : ap;
      addItem(ws, 'L:'+l.item_id, l.ref, l.description, l.qty!=null&&l.rate!=null?Number(l.qty):null, l.unit, l.qty!=null&&l.rate!=null?Number(l.rate):null, Number(l.value||0), D.prevPct[l.item_id]||0, ap, cp);
    });
    sheetRefs.push({title:sec.title, name, last:Math.max(ws.lastRow.number, 3)+200});
  });
  if(D.vars.length || true){
    const {ws, name} = mkSheet('Variations', '');
    D.vars.forEach(x=>addItem(ws, x.key, x.v.fin_variation_id ? '' : '', x.v.description||'Variation', 1, 'item', Number(x.v.value||0), Number(x.v.value||0), x.prev, finPct(x.v.pct), finPct(x.v.pct)));
    sheetRefs.push({title:'Variations', name, last:Math.max(ws.lastRow.number, 3)+200});
  }
  if((a.dayworks||[]).length){
    const {ws, name} = mkSheet('Dayworks', '');
    a.dayworks.forEach((d,i)=>addItem(ws, 'D:'+i, '', d.description||'Daywork', null, '', null, Number(d.value||0), 0, 100, 100));
    sheetRefs.push({title:'Dayworks', name, last:Math.max(ws.lastRow.number, 3)+200});
  }
  // General Summary
  const info = [['Company Name', (ORG&&ORG.name)||''], ['Client Name', D.jf.billing_name||D.site.client_name||''], ['Project Name', D.site.name||''], ['Project ID', D.site.job_number||''], ['Valuation Date', a.valuation_date?finDate(a.valuation_date):''], ['Application No.', a.number], ['Client PO', a.client_po||'']];
  sum.addRow([]);
  info.forEach(([k,v])=>{ const r = sum.addRow(['', k, v]); r.getCell(2).font = {bold:true}; });
  sum.addRow([]);
  const gt = sum.addRow(['', 'General Summary']); gt.getCell(2).font = {bold:true, size:12};
  const sh = sum.addRow(['', 'Section', 'Total', 'Applied Total', 'Applied %', 'Certified Total', 'Certified %']);
  for(let c=2;c<=7;c++){ const cell = sh.getCell(c); cell.font = {bold:true}; cell.fill = fill('FFF5F5DC'); cell.border = box; }
  const q = n=>`'${n.replace(/'/g,"''")}'`;
  const first = sh.number + 1;
  sheetRefs.forEach(s=>{
    const r = sum.addRow(['', s.title]); const n = r.number, rg = c=>`${q(s.name)}!${c}3:${c}${s.last}`;
    r.getCell(3).value = {formula:`IFERROR(SUMIF(${rg('P')},1,${rg('G')}), 0)`};
    r.getCell(4).value = {formula:`IFERROR(SUMIF(${rg('P')},1,${rg('K')}), 0)`};
    r.getCell(5).value = {formula:`IFERROR(IF(OR(C${n}=0,ISBLANK(C${n})),0,D${n}/C${n}), 0)`};
    r.getCell(6).value = {formula:`IFERROR(SUMIF(${rg('P')},1,${rg('M')}), 0)`};
    r.getCell(7).value = {formula:`IFERROR(IF(OR(C${n}=0,ISBLANK(C${n})),0,F${n}/C${n}), 0)`};
    for(let c=2;c<=7;c++){ const cell = r.getCell(c); cell.border = box; cell.fill = fill('FFFFFFCC'); } [3,4,6].forEach(c=>r.getCell(c).numFmt = money); [5,7].forEach(c=>r.getCell(c).numFmt = pct);
  });
  const last = sum.lastRow.number;
  sum.addRow([]);
  const line = (label, cells, bold)=>{ const r = sum.addRow(['', label]); r.getCell(2).font = {bold:!!bold}; Object.keys(cells).forEach(c=>{ const cell = r.getCell(Number(c)); cell.value = cells[c]; cell.numFmt = [5,7].includes(Number(c)) ? pct : money; cell.border = box; if(bold) cell.font = {bold:true}; }); r.getCell(2).border = box; return r.number; };
  const sub = line('SubTotal', {3:{formula:`IFERROR(SUM(C${first}:C${last}), 0)`}, 4:{formula:`IFERROR(SUM(D${first}:D${last}), 0)`}, 6:{formula:`IFERROR(SUM(F${first}:F${last}), 0)`}}, true);
  const cap = D.jf.retention_limit_pct && D.jf.contract_value ? finRound(D.jf.contract_value*D.jf.retention_limit_pct/100) : null;
  const dsc = line('Less Discount at '+D.discPct+'%', {4:{formula:`IFERROR(ROUND(D${sub}*${D.discPct/100},2), 0)`}, 6:{formula:`IFERROR(ROUND(F${sub}*${D.discPct/100},2), 0)`}});
  const retF = c=>cap!=null ? `IFERROR(MIN(ROUND((${c}${sub}-${c}${dsc})*${D.retPct/100},2),${cap}), 0)` : `IFERROR(ROUND((${c}${sub}-${c}${dsc})*${D.retPct/100},2), 0)`;
  const ret = line('Retention at '+D.retPct+'%', {4:{formula:retF('D')}, 6:{formula:retF('F')}});
  const net = line('Net After Retention', {4:{formula:`IFERROR(D${sub}-D${dsc}-D${ret}, 0)`}, 6:{formula:`IFERROR(F${sub}-F${dsc}-F${ret}, 0)`}});
  const prv = line('Previously Certified (excl VAT)', {4:D.previous, 6:D.previous});
  const due = line('Gross Payment Due', {4:{formula:`IFERROR(D${net}-D${prv}, 0)`}, 6:{formula:`IFERROR(F${net}-F${prv}, 0)`}}, true);
  const vatLabel = D.vt==='reverse_charge' ? 'VAT (domestic reverse charge — customer to account to HMRC)' : D.vt==='zero' ? 'VAT (zero rated)' : 'VAT @ 20%';
  const vat = line(vatLabel, D.vt==='standard' ? {4:{formula:`ROUND(D${due}*0.2,2)`}, 6:{formula:`ROUND(F${due}*0.2,2)`}} : {4:0, 6:0});
  line('Net Payment Due', {4:{formula:`IFERROR(D${due}+D${vat}, 0)`}, 6:{formula:`IFERROR(F${due}+F${vat}, 0)`}}, true);
  sum.addRow([]);
  const note = sum.addRow(['', D.certified ? 'Certified figures are as entered from the client’s certificate.' : 'Applied = what we are applying for. Certified starts the same — the client changes the Certified % (green) and sends it back.']); note.getCell(2).font = {italic:true, color:{argb:'FF5B6472'}};
  return await wb.xlsx.writeBuffer();
}

/* ---------- reading an Excel back in (Coreloops layout or the older one-sheet layout) ---------- */
async function finXlBook(file){
  if(!(await loadLib('XLSX'))){ toast('Could not load the Excel reader — check your connection.'); return null; }
  try{ const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array'}); return wb.SheetNames.map(n=>({name:n, rows:XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, raw:true, defval:''})})); }
  catch(e){ toast('Could not read that file.'); return null; }
}
// → {format:'sheets'|'old', items:[{key, sheetHead, head, ref, desc, qty, unit, rate, amount, applied, certified}]}
function finXlParse(book){
  const fracPct = v=>{ const n = finXlNum(v); if(n===null) return null; return Math.abs(n) <= 1.5 ? finPct(n*100) : finPct(n); };
  const isNew = book.some(s=>(s.rows[0]||[]).some(c=>/^applied %$/i.test(String(c).trim())));
  const items = [];
  if(isNew){
    book.forEach(s=>{
      const H = (s.rows[0]||[]).map(c=>String(c).trim().toLowerCase());
      if(!H.includes('applied %')) return;
      const col = name=>H.indexOf(name);
      const C = {key:0, ref:col('ref'), desc:col('description'), qty:col('qty'), unit:col('unit'), rate:col('rate'), amount:col('amount'), applied:col('applied %'), certified:col('certified %')};
      let sheetHead = '', head = '';
      s.rows.forEach((r, ri)=>{
        if(ri===0) return;
        const key = String(r[C.key]||'').trim(), desc = String(r[C.desc]||'').trim();
        if(ri===1){ const m = /^H:(.+)$/.exec(key); sheetHead = m ? m[1] : ''; head = sheetHead; return; }
        const hm = /^H:(.+)$/.exec(key); if(hm){ head = hm[1]; return; }
        items.push({key, sheet:s.name, sheetHead, head, ref:String(r[C.ref]??'').trim(), desc, qty:finXlNum(r[C.qty]), unit:String(r[C.unit]||'').trim(), rate:finXlNum(r[C.rate]), amount:finXlNum(r[C.amount]), applied:fracPct(r[C.applied]), certified:fracPct(r[C.certified])});
      });
    });
    return {format:'sheets', items};
  }
  const rows = book[0] ? book[0].rows : [];
  const C = finXlCols(rows); let inContract = false, head = '';
  rows.forEach((r, ri)=>{
    if(ri<=C.hi) return;
    const key = String(r[0]||'').trim(), desc = String(r[C.desc]||'').trim();
    if(/^CONTRACT WORKS$/i.test(desc)){ inContract = true; return; }
    if(/^(VARIATIONS|DAYWORKS)$/i.test(desc) || /^Gross valuation/i.test(desc)){ inContract = false; }
    const hm = /^H:(.+)$/.exec(key); if(hm){ head = hm[1]; return; }
    const p = finXlNum(r[C.pct]);
    items.push({key, inContract, head, ref:String(r[C.ref]||'').trim(), desc, qty:finXlNum(r[C.qty]), unit:String(r[C.unit]||'').trim(), rate:finXlNum(r[C.rate]), amount:finXlNum(r[C.value]), applied:p===null?null:finPct(p), certified:p===null?null:finPct(p)});
  });
  return {format:'old', items};
}

(function(){
  const older = window.uploadFinAppExcel;
  window.uploadFinAppExcel = async function(file){
    if(!file || !finApp) return;
    const book = await finXlBook(file); if(!book) return;
    const P = finXlParse(book);
    if(P.format!=='sheets') return older.call(this, file);
    let changed = 0, added = 0;
    const lineBy = {}; (finApp.lines||[]).forEach(l=>{ if(finIsItem(l)) lineBy[l.item_id] = l; });
    for(const it of P.items){
      let m;
      if((m = /^L:(.+)$/.exec(it.key))){ const l = lineBy[m[1]]; if(l && it.applied!=null && it.applied!==finPct(l.pct)){ l.pct = it.applied; changed++; } continue; }
      if((m = /^V:(.+)$/.exec(it.key))){
        const v = (finApp.variations||[]).find((x,i)=>(x.variation_id||('x'+i))===m[1]); if(!v) continue;
        const val = it.qty!=null && it.rate!=null ? finRound(it.qty*it.rate) : it.amount;
        if(it.applied!=null && it.applied!==finPct(v.pct)){ v.pct = it.applied; changed++; }
        if(val!=null && val!==Number(v.value)){ v.value = val; changed++; }
        if(it.desc && it.desc!==v.description){ v.description = it.desc; changed++; }
        continue;
      }
      if((m = /^D:(\d+)$/.exec(it.key))){ const d = (finApp.dayworks||[])[+m[1]]; if(d){ if(it.amount!=null && it.amount!==Number(d.value)){ d.value = it.amount; changed++; } if(it.desc && it.desc!==d.description){ d.description = it.desc; changed++; } } continue; }
      if(it.key || !it.desc) continue;
      if(/^variations$/i.test(it.sheet)){ const val = it.qty!=null && it.rate!=null ? finRound(it.qty*it.rate) : it.amount; if(val!=null){ (finApp.variations = finApp.variations||[]).push({variation_id:null, description:it.desc, value:val, pct:it.applied==null?100:it.applied}); added++; } continue; }
      if(/^dayworks$/i.test(it.sheet)){ if(it.amount!=null){ (finApp.dayworks = finApp.dayworks||[]).push({description:it.desc, value:it.amount}); added++; } continue; }
      const value = it.qty!=null && it.rate!=null ? finRound(it.qty*it.rate) : it.amount;
      if(value==null) continue;
      try{ await finAppAddLineCore(finApp.site_id, {kind:'item', under:(finApp.lines||[]).some(l=>l.item_id===it.head) ? it.head : '', ref:it.ref||null, desc:it.desc, qty:it.qty, unit:it.unit||null, rate:it.rate, value, cost:null, pct:it.applied||0}); added++; }
      catch(e){ console.error(e); }
    }
    const r = await dbUpdate('fin_applications', finApp.id, finAppRowForSave());
    if(!r) return;
    finApp = null;
    toast(changed||added ? `Updated from Excel: ${changed} change${changed===1?'':'s'}${added?', '+added+' new line'+(added===1?'':'s'):''}` : 'No changes found in that file');
    render();
  };
})();

// Certificate from the client's Excel: Certified % column (new layout) or % complete (old).
window.finCertFromExcel = async function(file, appId){
  if(!file) return;
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a) return;
  const book = await finXlBook(file); if(!book) return;
  const P = finXlParse(book);
  const byKey = {}; P.items.forEach(it=>{ if(it.key) byKey[it.key] = it; });
  const lines = [], diffs = [];
  let gross = 0, found = 0;
  (a.lines||[]).filter(finIsItem).forEach(l=>{
    const it = byKey['L:'+l.item_id]; const p = it && it.certified!=null ? it.certified : finPct(l.pct); if(it) found++;
    const g = finRound(Number(l.value||0)*p/100); gross += g;
    lines.push({item_id:l.item_id, description:l.description, value:Number(l.value||0), applied_pct:finPct(l.pct), pct:p, gross:g});
    if(p!==finPct(l.pct)) diffs.push(l.description+': '+finPct(l.pct)+'% → '+p+'%');
  });
  (a.variations||[]).forEach((v,i)=>{ const it = byKey['V:'+(v.variation_id||('x'+i))]; const p = it && it.certified!=null ? it.certified : finPct(v.pct); const val = it && it.amount!=null ? it.amount : Number(v.value||0); if(it) found++; gross += finRound(val*p/100); if(p!==finPct(v.pct) || val!==Number(v.value||0)) diffs.push((v.description||'Variation')+' changed'); });
  (a.dayworks||[]).forEach((d,i)=>{ const it = byKey['D:'+i]; const p = it && it.certified!=null ? it.certified : 100; const val = it && it.amount!=null ? it.amount : Number(d.value||0); if(it) found++; gross += finRound(val*p/100); if(p!==100 || val!==Number(d.value||0)) diffs.push((d.description||'Daywork')+' changed'); });
  if(!found){ toast('That doesn’t look like this application’s Excel — download it from OpHUB, send it to the client and upload their copy.'); return; }
  gross = finRound(gross);
  const jf = (await dbSelect('job_finance', 'site_id=eq.'+a.site_id))[0] || {};
  const disc = finRound(gross*finPct(a.discount_pct||0)/100);
  let ret = finRound((gross-disc)*finPct(a.retention_pct)/100);
  if(jf.retention_limit_pct && jf.contract_value) ret = Math.min(ret, finRound(jf.contract_value*jf.retention_limit_pct/100));
  const set = (id, v)=>{ const el = document.getElementById(id); if(el) el.value = String(finRound(v)); };
  set('finCertGross', gross); set('finCertRet', ret); set('finCertDisc', disc);
  if(typeof finCertCalc==='function') finCertCalc();
  finCertLines = lines;
  const box = document.getElementById('finCertXlNote');
  if(box) box.innerHTML = `<b>Read from the client’s Excel:</b> certified to date ${finMoney(gross)}. ${diffs.length ? diffs.length+(diffs.length===1?' line differs':' lines differ')+' from what you applied for:<br>'+diffs.slice(0,8).map(escapeHtml).join('<br>')+(diffs.length>8?'<br>…and '+(diffs.length-8)+' more':'') : 'Every line matches what you applied for.'} Check the figures, then save.`;
  toast('Certificate filled in from the Excel');
};

/* ---------- PDF (same layout: summary page, then each section) ---------- */
window.downloadFinAppPdf = async function(id){
  if(finApp && finApp.id===id && document.getElementById('finAppSave')) await saveFinApplication(false);
  const a = (await dbSelect('fin_applications', 'id=eq.'+id))[0]; if(!a) return;
  if(!(await loadLib('PDFLib'))){ toast('Could not load the PDF tool — check your connection.'); return; }
  const bytes = await finAppPdfBytes(a); if(!bytes) return;
  return deliverPdf(bytes, finAppFilename(a).replace(/\.xlsx$/i, '.pdf'));
};
async function finAppPdfBytes(a){
  const D = await finAppExportData(a);
  const {PDFDocument, StandardFonts, rgb} = PDFLib;
  const doc = await PDFDocument.create();
  const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, Hh = 595, M = 30;
  const brandHex = String((ORG&&ORG.color_primary)||'#C8102E').replace('#','');
  const brand = rgb(parseInt(brandHex.slice(0,2),16)/255||0, parseInt(brandHex.slice(2,4),16)/255||0, parseInt(brandHex.slice(4,6),16)/255||0);
  const grey = rgb(.36,.39,.45), line = rgb(.82,.84,.87), headBg = rgb(.96,.96,.86), secBg = rgb(1,1,.8), subBg = rgb(.9,.95,1);
  let page, y;
  const newPage = ()=>{ page = doc.addPage([W, Hh]); y = Hh - M; page.drawText(((ORG&&ORG.name)||'')+'  ·  Application for payment No. '+a.number+'  ·  '+(D.site.name||''), {x:M, y:M-16+0, size:7.5, font:F, color:grey}); };
  const txt = (s, x, yy, o)=>page.drawText(String(s==null?'':s), Object.assign({x, y:yy, size:8.5, font:F, color:rgb(0,0,0)}, o||{}));
  const fit = (s, w, size, font)=>{ s = String(s==null?'':s); font = font||F; size = size||8.5; if(font.widthOfTextAtSize(s, size) <= w) return s; while(s.length>1 && font.widthOfTextAtSize(s+'…', size) > w) s = s.slice(0,-1); return s+'…'; };
  const wrap = (s, w, size, font)=>{ font = font||F; const words = String(s||'').split(/\s+/); const out = []; let cur = ''; words.forEach(wd=>{ const t = cur ? cur+' '+wd : wd; if(font.widthOfTextAtSize(t, size) <= w) cur = t; else { if(cur) out.push(cur); cur = wd; } }); if(cur) out.push(cur); return out.slice(0,3); };
  const right = (s, xr, yy, o)=>{ const f = (o&&o.font)||F, sz = (o&&o.size)||8.5; s = String(s); txt(s, xr - f.widthOfTextAtSize(s, sz), yy, o); };
  const m = v=>finMoney(v), p = v=>(Math.round(Number(v||0)*100)/100)+'%';
  // Page 1 — summary
  newPage();
  page.drawText((ORG&&ORG.name)||'', {x:M, y:y-14, size:16, font:B, color:brand}); y -= 34;
  page.drawText('Application for Payment No. '+a.number, {x:M, y, size:13, font:B}); y -= 22;
  [['Client Name', D.jf.billing_name||D.site.client_name||''], ['Project Name', D.site.name||''], ['Project ID', D.site.job_number||''], ['Valuation Date', a.valuation_date?finDate(a.valuation_date):''], ['Client PO', a.client_po||''], ['Status', (FIN_APP_STATUS[a.status]||a.status)]].forEach(([k,v])=>{ txt(k, M, y, {font:B, color:grey}); txt(fit(v, 400), M+120, y); y -= 13; });
  y -= 12;
  page.drawText('General Summary', {x:M, y, size:11.5, font:B}); y -= 8;
  const cols = [M, M+260, M+380, M+500, M+570, M+690, W-M];
  const row = (cells, o)=>{ o = o||{}; const h = 16; if(o.bg) page.drawRectangle({x:M, y:y-h+4, width:W-2*M, height:h, color:o.bg}); page.drawLine({start:{x:M, y:y-h+4}, end:{x:W-M, y:y-h+4}, thickness:.5, color:line}); cells.forEach((c,i)=>{ if(c==null || c==='') return; const f = o.bold ? B : F; if(i===0) txt(fit(c, cols[1]-cols[0]-6), cols[0]+4, y-8, {font:f}); else right(c, cols[i+1]-6, y-8, {font:f}); }); y -= h; };
  row(['Section','Total','Applied Total','Applied %','Certified Total','Certified %'], {bold:true, bg:headBg});
  const secTot = D.sections.map(sec=>{ let t=0, ap=0, ce=0; sec.rows.filter(finIsItem).forEach(l=>{ const v = Number(l.value||0), a1 = finPct(l.pct), c1 = D.certPct[l.item_id]!=null ? D.certPct[l.item_id] : a1; t += v; ap += v*a1/100; ce += v*c1/100; }); return {title:sec.title, t:finRound(t), ap:finRound(ap), ce:finRound(ce)}; });
  if(D.vars.length || true){ let t=0, ap=0; D.vars.forEach(x=>{ t += Number(x.v.value||0); ap += Number(x.v.value||0)*finPct(x.v.pct)/100; }); secTot.push({title:'Variations', t:finRound(t), ap:finRound(ap), ce:finRound(ap)}); }
  if((a.dayworks||[]).length){ const t = finRound(a.dayworks.reduce((s,d)=>s+Number(d.value||0),0)); secTot.push({title:'Dayworks', t, ap:t, ce:t}); }
  secTot.forEach(s=>row([s.title, m(s.t), m(s.ap), p(s.t?s.ap/s.t*100:0), m(s.ce), p(s.t?s.ce/s.t*100:0)], {bg:secBg}));
  const T = k=>finRound(secTot.reduce((s,x)=>s+x[k],0));
  const tt = T('t'), tap = T('ap'), tce = T('ce');
  y -= 6;
  row(['SubTotal', m(tt), m(tap), p(tt?tap/tt*100:0), m(tce), p(tt?tce/tt*100:0)], {bold:true});
  const cap = D.jf.retention_limit_pct && D.jf.contract_value ? finRound(D.jf.contract_value*D.jf.retention_limit_pct/100) : null;
  const rr = v=>{ let r = finRound(v*D.retPct/100); if(cap!=null) r = Math.min(r, cap); return r; };
  const dap0 = finRound(tap*D.discPct/100), dce0 = finRound(tce*D.discPct/100);
  row(['Less Discount at '+D.discPct+'%', '', m(dap0), '', m(dce0), '']);
  const rap = rr(tap-dap0), rce = rr(tce-dce0);
  row(['Retention at '+D.retPct+'%', '', m(rap), '', m(rce), '']);
  row(['Net After Retention', '', m(tap-dap0-rap), '', m(tce-dce0-rce), '']);
  row(['Previously Certified (excl VAT)', '', m(D.previous), '', m(D.previous), '']);
  const dap = finRound(tap-dap0-rap-D.previous), dce = finRound(tce-dce0-rce-D.previous);
  row(['Gross Payment Due', '', m(dap), '', m(dce), ''], {bold:true});
  const vap = D.vt==='standard' ? finRound(dap*.2) : 0, vce = D.vt==='standard' ? finRound(dce*.2) : 0;
  row([D.vt==='reverse_charge' ? 'VAT (domestic reverse charge — customer to account)' : D.vt==='zero' ? 'VAT (zero rated)' : 'VAT @ 20%', '', m(vap), '', m(vce), '']);
  row(['Net Payment Due', '', m(dap+vap), '', m(dce+vce), ''], {bold:true, bg:headBg});
  // Section pages
  const X = {ref:M, desc:M+34, qty:M+300, unit:M+340, rate:M+378, amt:M+440, prevp:M+505, appp:M+548, app:M+612, certp:M+656, cert:W-M};
  const headRow = ()=>{ const h = 18; page.drawRectangle({x:M, y:y-h+4, width:W-2*M, height:h, color:headBg}); [['Ref',X.ref,'l'],['Description',X.desc,'l'],['Qty',X.unit-6,'r'],['Unit',X.unit,'l'],['Rate',X.amt-6,'r'],['Amount',X.prevp-6,'r'],['Prev %',X.appp-6,'r'],['Applied %',X.app-6,'r'],['Applied',X.certp-6,'r'],['Cert %',X.certp+40,'r'],['Certified',X.cert-4,'r']].forEach(([t,x,al])=>{ if(al==='l') txt(t, x+2, y-9, {font:B, size:8}); else right(t, x, y-9, {font:B, size:8}); }); y -= h; };
  const ensure = (need, title)=>{ if(y - need < M+10){ newPage(); if(title){ page.drawText(title+' (continued)', {x:M, y:y-12, size:11, font:B}); y -= 22; headRow(); } } };
  const itemRow = (ref, desc, qty, unit, rate, amount, prevP, appP, certP)=>{
    const lines = wrap(desc, X.qty - X.desc - 8, 8.5); const h = Math.max(15, 11*lines.length + 4);
    ensure(h, curTitle);
    page.drawLine({start:{x:M, y:y-h+4}, end:{x:W-M, y:y-h+4}, thickness:.4, color:line});
    txt(fit(ref, 30), X.ref+2, y-9); lines.forEach((l,i)=>txt(l, X.desc+2, y-9-i*11));
    if(qty!=null) right(String(qty), X.unit-6, y-9); txt(fit(unit||'', 34), X.unit+2, y-9); if(rate!=null) right(m(rate), X.amt-6, y-9);
    right(m(amount), X.prevp-6, y-9); right(p(prevP), X.appp-6, y-9); right(p(appP), X.app-6, y-9); right(m(finRound(amount*appP/100)), X.certp-6, y-9);
    right(p(certP), X.certp+40, y-9); right(m(finRound(amount*certP/100)), X.cert-4, y-9);
    y -= h;
  };
  let curTitle = '';
  const sectionStart = title=>{ curTitle = title; ensure(60); y -= 8; page.drawRectangle({x:M, y:y-14, width:W-2*M, height:18, color:secBg}); page.drawText(fit(title, 600, 11, B), {x:M+4, y:y-9, size:11, font:B}); y -= 22; headRow(); };
  newPage();
  D.sections.forEach(sec=>{
    sectionStart(sec.title);
    sec.rows.forEach(l=>{
      if(l.kind==='subsection'){ ensure(16, curTitle); page.drawRectangle({x:M, y:y-11, width:W-2*M, height:15, color:subBg}); txt(fit((l.ref?l.ref+' ':'')+l.description, 600), X.desc+2, y-8, {font:B}); y -= 16; return; }
      const ap = finPct(l.pct), cp = D.certPct[l.item_id]!=null ? D.certPct[l.item_id] : ap;
      const hasQ = l.qty!=null && l.rate!=null;
      itemRow(l.ref||'', l.description, hasQ?Number(l.qty):null, l.unit, hasQ?Number(l.rate):null, Number(l.value||0), D.prevPct[l.item_id]||0, ap, cp);
    });
  });
  if(D.vars.length){ sectionStart('Variations'); D.vars.forEach(x=>itemRow('', x.v.description||'Variation', 1, 'item', Number(x.v.value||0), Number(x.v.value||0), x.prev, finPct(x.v.pct), finPct(x.v.pct))); }
  if((a.dayworks||[]).length){ sectionStart('Dayworks'); a.dayworks.forEach(d=>itemRow('', d.description||'Daywork', null, '', null, Number(d.value||0), 0, 100, 100)); }
  return await doc.save();
}

/* ---------- "Send & export" menu on an application (Andy, 22 Oct) ---------- */
window.finAppMoreMenu = function(ev, siteId, appId, locked){
  ev.stopPropagation();
  const old = document.getElementById('finAppMorePop'); if(old){ old.remove(); return; }
  const pop = document.createElement('div'); pop.id = 'finAppMorePop'; pop.className = 'fincrow-pop';
  pop.innerHTML = `<button type="button" data-a="email">✉️ Email to client</button><button type="button" data-a="xlsx">⬇ Download Excel</button><button type="button" data-a="pdf">⬇ Download PDF</button>${locked ? '' : '<button type="button" data-a="up">⬆ Upload edited Excel</button>'}`;
  pop.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return; e.stopPropagation(); pop.remove();
    const a = b.dataset.a;
    if(a==='email') openFinAppEmail(siteId, appId);
    else if(a==='xlsx') downloadFinAppExcel(appId);
    else if(a==='pdf') downloadFinAppPdf(appId);
    else if(a==='up'){ const f = document.getElementById('finAppXlUp'); if(f){ f.value = ''; f.click(); } }
  });
  document.body.appendChild(pop);
  const rc = ev.currentTarget.getBoundingClientRect();
  const up = rc.bottom + pop.offsetHeight + 8 > window.innerHeight;
  pop.style.top = (up ? rc.top + window.scrollY - pop.offsetHeight - 4 : rc.bottom + window.scrollY + 4)+'px'; pop.style.left = (rc.left + window.scrollX)+'px';
  setTimeout(()=>document.addEventListener('click', function close(){ pop.remove(); document.removeEventListener('click', close); }), 0);
};

/* ---------- Certify line by line (Andy, 22 Oct: "the certified needs to be per item … put
   the certify in the box where you normally apply … this all gets calculated from the rows").
   While an application is Applied, every line shows what was applied and has a Certified %
   box (variations too; dayworks a certified £). The certificate below adds them up:
   certified to date, less discount, less retention, less previously certified = net due. ---- */
let finCertWork = null; // {appId, lines:{item_id:pct}, vars:{i:pct}, days:{i:value}}
function finCertMode(){ return !!(finApp && finApp.status==='submitted' && finApp.cert_net==null); }
function finCertShowMode(){ return !!(finApp && finApp.cert_net!=null && Array.isArray(finApp.cert_lines)); }
function finCertWorkInit(){
  if(finCertWork && finCertWork.appId===finApp.id) return finCertWork;
  const cl = {}; (finApp.cert_lines||[]).forEach(l=>{ if(l.item_id) cl[l.item_id] = l.pct; });
  const W = {appId:finApp.id, lines:{}, vars:{}, days:{}};
  (finApp.lines||[]).forEach(l=>{ if(finIsItem(l)) W.lines[l.item_id] = cl[l.item_id]!=null ? cl[l.item_id] : finPct(l.pct); });
  (finApp.variations||[]).forEach((v,i)=>{ W.vars[i] = finPct(v.pct); });
  (finApp.dayworks||[]).forEach((d,i)=>{ W.days[i] = Number(d.value||0); });
  return (finCertWork = W);
}
function finCertTotals(){
  const W = finCertWorkInit();
  let gross = 0; const lines = [];
  (finApp.lines||[]).forEach(l=>{ if(!finIsItem(l)) return; const p = finPct(W.lines[l.item_id]); const g = finRound(Number(l.value||0)*p/100); gross += g; lines.push({item_id:l.item_id, description:l.description, value:Number(l.value||0), applied_pct:finPct(l.pct), pct:p, gross:g}); });
  (finApp.variations||[]).forEach((v,i)=>{ const p = finPct(W.vars[i]); const g = finRound(Number(v.value||0)*p/100); gross += g; lines.push({var_index:i, description:v.description, value:Number(v.value||0), applied_pct:finPct(v.pct), pct:p, gross:g}); });
  (finApp.dayworks||[]).forEach((d,i)=>{ const g = finRound(Number(W.days[i]||0)); gross += g; lines.push({day_index:i, description:d.description, value:Number(d.value||0), applied_pct:100, pct:Number(d.value||0) ? finRound(g/Number(d.value)*100) : 0, gross:g}); });
  gross = finRound(gross);
  const disc = finRound(gross*finPct(finApp.discount_pct||0)/100);
  let ret = finRound((gross-disc)*finPct(finApp.retention_pct)/100);
  const jf = (finAppCtx && finAppCtx.jf) || {};
  if(jf.retention_limit_pct && jf.contract_value) ret = Math.min(ret, finRound(jf.contract_value*jf.retention_limit_pct/100));
  return {gross, disc, ret, lines};
}
// Fill the certificate from the lines (it can't be typed over — it comes from the rows).
function finCertRecalc(){
  if(!finCertMode()) return;
  const t = finCertTotals();
  const set = (id, v)=>{ const el = document.getElementById(id); if(el){ el.value = String(finRound(v)); el.readOnly = true; el.classList.add('fincalc'); } };
  set('finCertGross', t.gross); set('finCertRet', t.ret); set('finCertDisc', t.disc);
  if(typeof finCertCalc==='function') finCertCalc();
  finCertLines = t.lines;
  const sumEl = document.getElementById('finCertSum'); if(sumEl) sumEl.textContent = finMoney(t.gross);
}
function finCertDecorate(){
  if(!finApp) return;
  const mode = finCertMode(), show = finCertShowMode();
  if(!mode && !show) return;
  const W = mode ? finCertWorkInit() : null;
  const cl = {}; if(show) (finApp.cert_lines||[]).forEach(l=>{ if(l.item_id) cl['L'+l.item_id] = l; else if(l.var_index!=null) cl['V'+l.var_index] = l; else if(l.day_index!=null) cl['D'+l.day_index] = l; });
  const box = (kind, i, val, gross)=>mode
    ? `<label class="fincertin">Certified ${kind==='D'?'£':'%'}<input type="text" inputmode="decimal" value="${val}" oninput="finCertSet('${kind}','${i}',this.value)"></label><b class="fincertg" id="finCertG-${kind}-${i}">${finMoney(gross)}</b>`
    : `<span class="fincertro">Certified ${val}${kind==='D'?'':'%'}</span><b class="fincertg">${finMoney(gross)}</b>`;
  (finApp.lines||[]).forEach((l,i)=>{
    if(!finIsItem(l)) return;
    const b = document.getElementById('finAppG-lines-'+i); if(!b || b.dataset.cert) return;
    const p = mode ? finPct(W.lines[l.item_id]) : finPct((cl['L'+l.item_id]||{}).pct ?? l.pct);
    b.dataset.cert = '1'; b.classList.add('finappliedg');
    b.insertAdjacentHTML('afterend', box('L', l.item_id, p, finRound(Number(l.value||0)*p/100)));
  });
  (finApp.variations||[]).forEach((v,i)=>{
    const b = document.getElementById('finAppG-variations-'+i); if(!b || b.dataset.cert) return;
    const p = mode ? finPct(W.vars[i]) : finPct((cl['V'+i]||{}).pct ?? v.pct);
    b.dataset.cert = '1'; b.classList.add('finappliedg');
    b.insertAdjacentHTML('afterend', box('V', i, p, finRound(Number(v.value||0)*p/100)));
  });
  (finApp.dayworks||[]).forEach((d,i)=>{
    const b = document.getElementById('finAppG-dayworks-'+i); if(!b || b.dataset.cert) return;
    const val = mode ? Number(W.days[i]||0) : Number(((cl['D'+i]||{}).gross) ?? d.value ?? 0);
    b.dataset.cert = '1'; b.classList.add('finappliedg');
    b.insertAdjacentHTML('afterend', box('D', i, finRound(val), val));
  });
  document.querySelectorAll('#finAppLines .finitem-sum').forEach(el=>{ if(!el.dataset.cert){ el.dataset.cert = '1'; el.textContent = 'Applied '+el.textContent; } });
  const card = document.querySelector('.finappcard'); if(card) card.classList.add(mode ? 'fincertmode' : 'fincertshow');
}
window.finCertSet = function(kind, i, v){
  const W = finCertWorkInit(); const n = finNum(v);
  if(kind==='L'){ W.lines[i] = n===null||isNaN(n) ? 0 : Math.max(0, Math.min(100, n)); const l = (finApp.lines||[]).find(x=>x.item_id===i); const el = document.getElementById('finCertG-L-'+i); if(el && l) el.textContent = finMoney(finRound(Number(l.value||0)*W.lines[i]/100)); }
  if(kind==='V'){ W.vars[i] = n===null||isNaN(n) ? 0 : Math.max(0, Math.min(100, n)); const x = finApp.variations[i]; const el = document.getElementById('finCertG-V-'+i); if(el && x) el.textContent = finMoney(finRound(Number(x.value||0)*W.vars[i]/100)); }
  if(kind==='D'){ W.days[i] = n===null||isNaN(n) ? 0 : n; const el = document.getElementById('finCertG-D-'+i); if(el) el.textContent = finMoney(W.days[i]); }
  finCertRecalc();
};
(function(){
  const lp = finAppPaintLines;
  finAppPaintLines = function(){ const r = lp.apply(this, arguments); finCertDecorate(); return r; };
  const ap = window.finAppPaint;
  window.finAppPaint = function(){ const r = ap.apply(this, arguments); return r; };
  const slot = finCertSlotRender;
  finCertSlotRender = function(a){
    if(finCertWork && finCertWork.appId!==a.id) finCertWork = null;
    slot.apply(this, arguments);
    finCertDecorate();
    if(finCertMode()){
      const el = document.getElementById('finCertSlot');
      const intro = el && Array.from(el.querySelectorAll('p.stub')).find(p=>/comes back, enter its figures/.test(p.textContent));
      if(intro) intro.innerHTML = 'Enter the client’s <b>Certified %</b> against each line above (it starts as what you applied for). The figures below add themselves up from those lines.';
      finCertRecalc();
    }
  };
  // The client's Excel fills the line boxes.
  const xl = window.finCertFromExcel;
  window.finCertFromExcel = async function(file, appId){
    await xl.apply(this, arguments);
    if(!finCertMode() || !Array.isArray(finCertLines)) return;
    const W = finCertWorkInit();
    finCertLines.forEach(l=>{ if(l.item_id) W.lines[l.item_id] = l.pct; });
    document.querySelectorAll('.fincertin, .fincertg, .fincertro').forEach(e=>e.remove());
    document.querySelectorAll('[data-cert]').forEach(e=>{ delete e.dataset.cert; });
    finAppPaintLines(); finAppPaint(); finCertDecorate(); finCertRecalc();
  };
})();
(function(){
  const st = document.createElement('style');
  st.textContent = `.fincertin{display:inline-flex !important;flex-direction:row !important;align-items:center;gap:5px !important;font-size:11.5px;font-weight:700;color:#1E6B45;white-space:nowrap;width:auto !important;}
.fincertin input{width:64px !important;height:30px !important;min-height:30px !important;padding:0 8px !important;text-align:right;border:1.5px solid #2E9E5B !important;border-radius:7px !important;background:#F3FBF6 !important;font-size:13.5px !important;margin:0 !important;}
.fincertro{font-size:12px;font-weight:700;color:#1E6B45;white-space:nowrap;}
.fincertg{min-width:92px;text-align:right;color:#1E6B45;font-size:14px;}
.finappliedg{color:var(--slate) !important;font-weight:600 !important;font-size:12.5px !important;min-width:80px !important;}
.fincertmode .finitem-sum, .fincertshow .finitem-sum{font-size:12px;color:var(--slate);}
input.fincalc{background:#F6F7F9 !important;color:var(--ink) !important;}`;
  document.head.appendChild(st);
})();

/* ---------- the status row goes at the very bottom (Andy, 22 Oct) ---------- */
(function(){
  const base = renderFinApplication;
  renderFinApplication = async function(siteId, appId){
    const r = await base.apply(this, arguments);
    if(finApp && !document.querySelector('.finappflow')){
      const anchor = document.getElementById('finCertSlot') || document.querySelector('.finappbtns');
      if(anchor) anchor.insertAdjacentHTML('afterend', finAppStepsHtml(finApp));
    }
    return r;
  };
})();

/* ---------- One place to certify (Andy, 22 Oct: "there's 2 certify bits … all this
   information is calculated above?"). While Applied, the summary shows Applied and
   Certified side by side, worked out from the lines; the certificate box underneath only
   asks for the date, pay-less, a copy and notes, then Certify. ---- */
function finCertSummaryHtml(){
  const c = finAppCalc(finApp, finAppCtx.jf.contract_value, finAppCtx.jf.retention_limit_pct, finAppCtx.previous);
  const t = finCertTotals();
  const W = finCertWorkInit();
  let cLines = 0, cVars = 0, cDays = 0;
  (finApp.lines||[]).forEach(l=>{ if(finIsItem(l)) cLines += finRound(Number(l.value||0)*finPct(W.lines[l.item_id])/100); });
  (finApp.variations||[]).forEach((v,i)=>{ cVars += finRound(Number(v.value||0)*finPct(W.vars[i])/100); });
  (finApp.dayworks||[]).forEach((d,i)=>{ cDays += Number(W.days[i]||0); });
  const prev = finRound(finAppCtx.previous||0);
  const cNet = finRound(t.gross - t.disc - t.ret - prev);
  const vt = finAppVatTreat(finAppCtx.jf);
  const row = (label, a, b, cls)=>`<div class="fincs-r ${cls||''}"><span>${label}</span><b>${a}</b><b class="c">${b}</b></div>`;
  const neg = v=>'−'+finMoney(v);
  const editable = finApp.status==='submitted' && finApp.cert_net==null;
  const disc = editable ? `<label class="finpctin" style="display:inline-flex;width:84px;height:28px;margin-left:6px;vertical-align:middle;"><input type="text" inputmode="decimal" value="${finPct(finApp.discount_pct||0)}" oninput="finApp.discount_pct=finPct(this.value);finAppPaintSoon();finAppDiscSave()" style="padding:2px 0;font-size:13px;"><span>%</span></label>` : '@ '+finPct(finApp.discount_pct||0)+'%';
  const contractTotal = (finApp.lines||[]).filter(finIsItem).reduce((s,l)=>s+Number(l.value||0),0);
  const aLines = c.lines.reduce((s,l)=>s+l.gross,0);
  let h = `<div class="fincs-r head"><span></span><b>Applied</b><b class="c">Certified</b></div>`
    + row(`Contract works to date${contractTotal?' (of '+finMoney(contractTotal)+')':''}`, finMoney(aLines), finMoney(cLines))
    + (c.variations.length ? row('Variations', finMoney(c.variations.reduce((s,x)=>s+x.gross,0)), finMoney(cVars)) : '')
    + (c.dayworks.length ? row('Dayworks', finMoney(c.dayworks.reduce((s,x)=>s+x.gross,0)), finMoney(cDays)) : '')
    + row('<b>Gross valuation to date</b>', finMoney(c.gross), finMoney(t.gross), 'bold')
    + row('Less discount '+disc, neg(c.discount), neg(t.disc))
    + row(`Less retention @ ${finPct(finApp.retention_pct)}%`, neg(c.retention), neg(t.ret))
    + row('Less previously certified', neg(prev), neg(prev))
    + row('Amount due this application', finMoney(c.net_due), finMoney(cNet), 'big');
  if(vt==='standard') h += row('VAT @ 20%', finMoney(finRound(c.net_due*.2)), finMoney(finRound(cNet*.2))) + row('Total incl. VAT', finMoney(finRound(c.net_due*1.2)), finMoney(finRound(cNet*1.2)), 'bold');
  else if(vt==='reverse_charge') h += row('Reverse charge VAT @ 20% <em class="stub" style="font-style:normal;">client pays HMRC</em>', finMoney(finRound(c.net_due*.2)), finMoney(finRound(cNet*.2)));
  const diff = finRound(cNet - c.net_due);
  if(diff) h += `<p class="stub" style="margin:8px 0 0;font-style:normal;color:${diff<0?'var(--red)':'var(--ok)'};"><b>${diff<0?'Short by':'Over by'} ${finMoney(Math.abs(diff))}</b> against what you applied for.</p>`;
  return h;
}
(function(){
  const ap = window.finAppPaint;
  window.finAppPaint = function(){
    const r = ap.apply(this, arguments);
    if(finCertMode()){ const s = document.getElementById('finAppSummary'); if(s){ s.innerHTML = finCertSummaryHtml(); s.classList.add('fincs'); } }
    return r;
  };
  const rc = finCertRecalc;
  finCertRecalc = function(){
    rc.apply(this, arguments);
    if(!finCertMode()) return;
    const s = document.getElementById('finAppSummary');
    if(s){ const a = document.activeElement; const inSum = a && s.contains(a); if(!inSum){ s.innerHTML = finCertSummaryHtml(); s.classList.add('fincs'); } }
    // the certificate box: just the bits that aren't worked out above
    const el = document.getElementById('finCertSlot'); const card = el && el.querySelector('.card'); if(!card) return;
    card.classList.add('fincertlite');
    ['finCertGross','finCertRet','finCertPrev','finCertDisc','finCertNet'].forEach(id=>{ const f = document.getElementById(id); const ff = f && f.closest('.formfield'); if(ff) ff.style.display = 'none'; });
    const diff = document.getElementById('finCertDiff'); if(diff) diff.style.display = 'none';
    const inv = document.getElementById('finCertInvoice'); const invL = inv && inv.closest('label'); if(invL) invL.style.display = 'none';
    // pay-less, a copy and notes tucked under "More"
    if(!card.querySelector('.fincertmore')){
      const more = document.createElement('details'); more.className = 'fincertmore'; more.innerHTML = '<summary>More: pay-less notice, copy of the certificate, notes</summary>';
      const pl = document.getElementById('finCertPayless'); const plL = pl && pl.closest('label');
      const file = card.querySelector('input[type=file][accept^="application/pdf"]'); const fileF = file && file.closest('.formfield');
      const notes = document.getElementById('finCertNotes'); const notesF = notes && notes.closest('.formfield');
      [plL, fileF, notesF].forEach(n=>{ if(n) more.appendChild(n); });
      const save = document.getElementById('finCertSave'); if(save) save.parentNode.insertBefore(more, save);
    }
    const t = card.querySelector('.sectiontitle'); if(t) t.innerHTML = '✅ Certify';
    const intro = Array.from(card.querySelectorAll('p.stub')).find(p=>/Certified %|comes back, enter its figures/.test(p.textContent));
    const net = finNum(finVal('finCertNet'));
    if(intro) intro.innerHTML = `Put the client’s <b>Certified %</b> on each line above — the Certified column in the summary adds itself up. Net due: <b>${finMoney(net||0)}</b> (excl. VAT). Add the certificate date, then press Certify.`;
  };
})();
(function(){
  const st = document.createElement('style');
  st.textContent = `.fincs-r{display:grid;grid-template-columns:minmax(0,1fr) 130px 130px;gap:10px;align-items:center;padding:9px 0;border-top:1px solid #EEF0F3;font-size:14px;}
.fincs-r:first-child{border-top:0;}
.fincs-r > b{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;}
.fincs-r > b.c{color:#1E6B45;font-weight:700;}
.fincs-r.head{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--slate);padding-top:0;} .fincs-r.head b{font-weight:800;}
.fincs-r.bold > b{font-weight:800;} .fincs-r.big{font-size:16px;font-weight:800;} .fincs-r.big > b{font-weight:800;}
.fincertlite .fingrid2{grid-template-columns:minmax(0,220px) !important;}
.fincertmore{margin:0 0 12px;} .fincertmore > summary{cursor:pointer;font-size:12.5px;font-weight:700;color:var(--slate);margin-bottom:8px;}
@media (max-width:600px){ .fincs-r{grid-template-columns:minmax(0,1fr) 90px 90px;font-size:13px;} }`;
  document.head.appendChild(st);
})();

/* ---------- Invoice shown beside the application (Andy, 22 Oct: "do the dual screen thing the
   drawings do"). On a computer, Raise invoice makes the invoice and shows it in a panel on the
   right of the application; Open invoice does the same. Phones go to the invoice page. ---- */
let finInvPanel = null; // {appId, invId, url, name}
function finInvPanelOn(){ return !!(finInvPanel && finApp && finInvPanel.appId===finApp.id && typeof isDeskMode==='function' && isDeskMode()); }
window.finAppShowInvoice = async function(invId, appId){
  const siteIdOf = async()=>((await dbSelect('fin_invoices', 'id=eq.'+invId))[0]||{}).site_id;
  if(!(typeof isDeskMode==='function' && isDeskMode())){ const s = await siteIdOf(); go(`#/site/${s}/finance/invoice/${invId}`); return; }
  const inv = (await dbSelect('fin_invoices', 'id=eq.'+invId))[0]; if(!inv) return;
  const site = SITES.find(s=>s.id===inv.site_id) || {};
  const bytes = await finBuildInvoicePdf(inv, site, await finLoadSettings()); if(!bytes) return;
  if(finInvPanel && finInvPanel.url) try{ URL.revokeObjectURL(finInvPanel.url); }catch(e){}
  finInvPanel = {appId: appId || (finApp && finApp.id), invId, siteId:inv.site_id, url:URL.createObjectURL(new Blob([bytes], {type:'application/pdf'})), name:finInvFilename(inv, site), draft:inv.status==='draft'};
  finInvPanelPaint();
};
window.finInvPanelClose = function(){ if(finInvPanel && finInvPanel.url) try{ URL.revokeObjectURL(finInvPanel.url); }catch(e){} finInvPanel = null; finInvPanelPaint(); };
function finInvPanelPaint(){
  const old = document.getElementById('finInvPanel'); if(old) old.remove();
  const wrap = document.querySelector('.scrollarea');
  document.documentElement.classList.toggle('fininvsplit', finInvPanelOn());
  if(!finInvPanelOn() || !wrap) return;
  const p = finInvPanel;
  wrap.insertAdjacentHTML('beforeend', `<div class="dwpanel" id="finInvPanel">
    <div class="dwpanel-bar"><b title="${escapeHtml(p.name)}">🧾 ${escapeHtml(p.name)}${p.draft?' <span class="finpill grey">Draft</span>':''}</b>
      <button type="button" class="darkbtn dwpanel-btn" onclick="go('#/site/${p.siteId}/finance/invoice/${p.invId}')">${p.draft?'Check & issue ›':'Open invoice'}</button>
      <a class="ghostbtn dwpanel-btn" href="${p.url}" download="${escapeHtml(p.name)}">⬇ Download</a>
      <button type="button" class="ghostbtn dwpanel-btn" title="Close" onclick="finInvPanelClose()">✕</button></div>
    <iframe class="dwpanel-frame" src="${p.url}#view=FitH" title="${escapeHtml(p.name)}"></iframe>
  </div>`);
}
(function(){
  // Raise invoice from the application → stay on the application and show the invoice beside it.
  const base = window.raiseInvoiceFromCert;
  window.raiseInvoiceFromCert = async function(siteId, appId, issueNow){
    if(issueNow || !(typeof isDeskMode==='function' && isDeskMode()) || !/\/finance\/application\//.test(location.hash)) return base.apply(this, arguments);
    const realGo = window.go; let target = null;
    window.go = h=>{ target = h; };
    try{ await base.call(this, siteId, appId, false); } finally { window.go = realGo; }
    const m = target && /\/invoice\/([^/?]+)/.exec(target);
    if(!m){ if(target) go(target); return; }
    finApp = null; render();
    setTimeout(()=>finAppShowInvoice(m[1], appId), 400);
    toast('Invoice made — check it on the right, then issue it');
  };
  // Keep the panel when the application redraws.
  const rf = renderFinApplication;
  renderFinApplication = async function(siteId, appId){ const r = await rf.apply(this, arguments); if(finInvPanel && finInvPanel.appId!==appId) finInvPanel = null; finInvPanelPaint(); return r; };
  // "Open invoice" in the certificate box opens the panel on a computer.
  const slot = finCertSlotRender;
  finCertSlotRender = function(a){
    slot.apply(this, arguments);
    if(a.invoice_id && typeof isDeskMode==='function' && isDeskMode()){
      const el = document.getElementById('finCertSlot');
      const b = el && Array.from(el.querySelectorAll('button')).find(x=>/Open invoice/.test(x.textContent));
      if(b) b.setAttribute('onclick', `finAppShowInvoice('${a.invoice_id}','${a.id}')`);
    }
  };
})();
(function(){
  const st = document.createElement('style');
  st.textContent = `html.desk.fininvsplit .scrollarea > *:not(#finInvPanel){margin-right:calc((100vw - 248px) * .5) !important;}
html.desk #finInvPanel{width:calc((100vw - 248px) * .5 - 24px);}`;
  document.head.appendChild(st);
})();

/* ---------- Job Sales tab split into three (Andy, 22 Oct): Applications & Certificates ·
   Invoices · Retention — one at a time. Invoice-billed jobs start on Invoices. ---- */
let finSalesSub = {}; // siteId -> 'apps'|'invoices'|'retention'
function finSalesSubTabsHtml(siteId, bt, nApps){
  const def = (bt==='application' || nApps) ? 'apps' : 'invoices';
  const cur = finSalesSub[siteId] || def;
  const tabs = [['apps','Applications & Certificates'],['invoices','Invoices'],['retention','Retention']].filter(t=>t[0]!=='apps' || bt==='application' || nApps);
  return `<div class="finsubtabs finsalestabs">${tabs.map(([k,l])=>`<button type="button" data-s="${k}" class="${k===cur?'on':''}" onclick="finSalesSubGo('${siteId}','${k}')">${l}</button>`).join('')}</div>`;
}
window.finSalesSubGo = function(siteId, k){
  finSalesSub[siteId] = k;
  document.querySelectorAll('.finsalesub').forEach(el=>el.style.display = el.dataset.s===k ? '' : 'none');
  document.querySelectorAll('.finsalestabs button').forEach(b=>b.classList.toggle('on', b.dataset.s===k));
};
function finSalesSubApply(){
  const on = document.querySelector('.finsalestabs button.on');
  if(on) document.querySelectorAll('.finsalesub').forEach(el=>el.style.display = el.dataset.s===on.dataset.s ? '' : 'none');
}
(function(){
  const base = window.finAfterProjectRender || (typeof finAfterProjectRender==='function' ? finAfterProjectRender : null);
  finAfterProjectRender = function(){ finSalesSubApply(); if(base) return base.apply(this, arguments); };
  // Go-to links (apps / invoices) open the right sub-tab first.
  const sc = finScrollToAnchor;
  finScrollToAnchor = function(id){
    const k = id==='fin-a-apps' ? 'apps' : id==='fin-a-invoices' ? 'invoices' : null;
    const sid = (location.hash.match(/#\/site\/([^/?]+)/)||[])[1];
    if(k && sid){ finSalesSub[sid] = k; finSalesSubGo(sid, k); }
    return sc.apply(this, arguments);
  };
})();
