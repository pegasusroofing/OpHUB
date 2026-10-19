/* ================= OpHUB FINANCE — Contract breakdown + A2 Applications =================
   Contract breakdown (#/site/<id>/finance/contract): the priced lines the
   job is valued against, typed in or read from an uploaded Excel / PDF. The
   total becomes the job's contract value.
   Applications (#/site/<id>/finance/application/<appId>): % complete per
   contract line + variations + dayworks → gross, less retention, less
   previously certified → amount due. Comes out as an Excel file that can be
   edited and uploaded back; emailed from the app. Certificate fields on the
   same row are filled in at step A3. */

/* ---------------- helpers ---------------- */
function finPct(v){ const n = finNum(v); return (n===null || isNaN(n)) ? 0 : Math.max(0, Math.min(100, n)); }
function finAppCalc(app, contractValue, retLimitPct, previous){
  const lines = (app.lines||[]).map(l=>Object.assign({}, l, {gross: finRound(Number(l.value||0)*finPct(l.pct)/100)}));
  const variations = (app.variations||[]).map(v=>Object.assign({}, v, {gross: finRound(Number(v.value||0)*finPct(v.pct)/100)}));
  const dayworks = (app.dayworks||[]).map(d=>Object.assign({}, d, {gross: finRound(Number(d.value||0))}));
  const gross = finRound([...lines, ...variations, ...dayworks].reduce((t,x)=>t+x.gross, 0));
  let retention = finRound(gross*Number(app.retention_pct||0)/100);
  if(retLimitPct && contractValue){ retention = Math.min(retention, finRound(Number(contractValue)*Number(retLimitPct)/100)); }
  const prev = finRound(previous||0);
  return {lines, variations, dayworks, gross, retention, previous:prev, net_due:finRound(gross - retention - prev)};
}
// What was certified (or, until the certificate is in, applied for) on earlier applications.
function finPreviousCertified(apps, number){
  return finRound(apps.filter(a=>a.number < number && !['draft','void'].includes(a.status))
    .reduce((t,a)=>t + Number(a.cert_net!=null ? a.cert_net : (a.net_due||0)), 0));
}
const FIN_APP_STATUS = {draft:'Draft', submitted:'Submitted', certified:'Certified', invoiced:'Invoiced', void:'Void'};
function finAppPill(a){ if(a.status==='invoiced' && 'invoice_id' in a && !a.invoice_id) a = Object.assign({}, a, {status:'certified'}); const c = {draft:'grey', submitted:'blue', certified:'warn', invoiced:'ok', void:'grey'}[a.status]||'grey'; return `<span class="finpill ${c}">${FIN_APP_STATUS[a.status]||a.status}</span>`; }
function finAppDayFor(jf, st){ return Number((jf && jf.app_reminder_day) || (st && st.app_reminder_day) || 0) || null; }
// Is this month's application due (application day reached, none dated this month)?
function finAppDueThisMonth(apps, appDay){
  if(!appDay) return false;
  const now = new Date(); if(now.getDate() < Math.min(appDay, 28)) return false;
  const ym = finToday().slice(0,7);
  return !apps.some(a=>a.status!=='void' && String(a.valuation_date||'').slice(0,7)===ym);
}

/* ---------------- cards on the job's Finance page ---------------- */
function finContractCardHtml(siteId, items, jf){
  const total = finRound(items.reduce((t,i)=>t+Number(i.value||0), 0));
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <p class="sectiontitle" style="margin:0;">Contract breakdown</p>
      <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="go('#/site/${siteId}/finance/contract')">${items.length?'Open':'Set up'}</button>
    </div>
    <p class="stub" style="margin:4px 0 0;font-style:normal;">${items.length ? `${items.length} line${items.length===1?'':'s'} · total <b>${finMoney(total)}</b>${jf&&jf.contract_file_name?' · from '+escapeHtml(jf.contract_file_name):''}` : 'Upload the priced breakdown (Excel or PDF) or type it in. Applications are valued against it.'}</p>
  </div>`;
}
function finApplicationsCardHtml(siteId, apps, due){
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <p class="sectiontitle" style="margin:0;">Applications</p>
      <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="newFinApplication('${siteId}')">+ New application</button>
    </div>
    ${due ? `<div class="finchecks" style="margin:8px 0 0;"><span>This month’s application is due</span></div>` : ''}
    ${apps.length ? apps.map(a=>`<button type="button" class="pmrow finrow fininvrow" onclick="go('#/site/${siteId}/finance/application/${a.id}')">
        <span class="pmrow-txt"><span class="pmrow-t">Application ${a.number} ${finAppPill(a)}</span>
          <span class="pmrow-s">${finDate(a.valuation_date)} · gross ${finMoney(a.gross)}${a.cert_net!=null?' · certified '+finMoney(a.cert_net):''}</span></span>
        <span class="finval">${finMoney(a.cert_net!=null ? a.cert_net : a.net_due)}</span>
      </button>`).join('') : `<div class="empty" style="margin:8px 0 0;">No applications yet.</div>`}
  </div>`;
}

/* ---------------- Contract breakdown page ---------------- */
let finContractRows = null, finContractSite = null, finContractFile = null;
async function renderFinContract(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const [items, jfRows] = await Promise.all([
    dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&order=position.asc'),
    dbSelect('job_finance', 'site_id=eq.'+siteId),
  ]);
  if(__gen !== RENDER_GEN) return;
  if(finContractSite !== siteId || !finContractRows){ finContractRows = items.map(i=>({id:i.id, ref:i.ref||'', section:i.section||'', description:i.description, value:Number(i.value)})); finContractSite = siteId; finContractFile = null; }
  const jf = jfRows[0] || {};
  document.getElementById('app').innerHTML = shell(`
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Upload the breakdown</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">An Excel or PDF of the priced contract (tender, contract sum analysis or bill of quantities). The app reads each line and its amount; you check them before they’re saved.</p>
      <input type="file" id="finContractUpload" accept=".xlsx,.xls,.csv,application/pdf" onchange="finContractUploadPicked(this.files[0])">
      ${jf.contract_file_name ? `<p class="stub" style="margin:8px 0 0;font-style:normal;">Last uploaded: ${escapeHtml(jf.contract_file_name)} <button class="linkbtn" style="color:var(--blue);" onclick="openFinDoc('${jsAttr(jf.contract_file_path||'')}','${jsAttr(jf.contract_file_name||'')}')">view</button></p>` : ''}
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <p class="sectiontitle" style="margin:0;">Lines</p>
        <span class="finval" id="finContractTotal"></span>
      </div>
      <div id="finContractList" style="margin-top:8px;"></div>
      <button class="ghostbtn" style="width:100%;margin-top:6px;" onclick="finContractAdd()">+ Add line</button>
    </div>
    <button class="darkbtn" style="width:100%;" id="finContractSave" onclick="saveFinContract('${siteId}')">Save breakdown</button>
    <p class="stub" style="margin:6px 0 0;font-style:normal;">Saving sets the job’s contract value to the total.</p>
  `, {title:'Contract breakdown', subtitle:site?site.name:'', back:`#/site/${siteId}/finance`, siteId, tabs:false});
  finContractPaint();
}
function finContractPaint(){
  const el = document.getElementById('finContractList'); if(!el) return;
  el.innerHTML = finContractRows.length ? finContractRows.map((r,i)=>`<div class="fincline">
      <input type="text" class="fincline-ref" placeholder="Ref" value="${escapeHtml(r.ref||'')}" oninput="finContractRows[${i}].ref=this.value">
      <textarea rows="1" placeholder="Description" oninput="finContractRows[${i}].description=this.value">${escapeHtml(r.description||'')}</textarea>
      <input type="text" inputmode="decimal" class="fincline-val" placeholder="£" value="${r.value!=null&&!isNaN(r.value)?escapeHtml(String(r.value)):''}" oninput="finContractRows[${i}].value=finNum(this.value);finContractPaintTotal()">
      <button class="linkbtn" onclick="finContractRows.splice(${i},1);finContractPaint()">✕</button>
    </div>`).join('') : `<div class="empty" style="margin:0;">No lines yet.</div>`;
  finContractPaintTotal();
}
window.finContractPaintTotal = function(){ const t = document.getElementById('finContractTotal'); if(t) t.textContent = finMoney(finContractRows.reduce((s,r)=>s+(Number(r.value)||0),0)); };
window.finContractAdd = function(){ finContractRows.push({ref:'', section:'', description:'', value:null}); finContractPaint(); };
window.saveFinContract = async function(siteId){
  const rows = finContractRows.map(r=>({ref:String(r.ref||'').trim()||null, section:r.section||null, description:String(r.description||'').trim(), value:(r.value===null||isNaN(r.value))?null:finRound(r.value), id:r.id}))
    .filter(r=>r.description || r.value!==null);
  if(rows.some(r=>!r.description)){ toast('Every line needs a description.'); return; }
  if(rows.some(r=>r.value===null)){ toast('Every line needs an amount.'); return; }
  const btn = document.getElementById('finContractSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const existing = await dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&select=id');
  const keep = new Set(rows.filter(r=>r.id).map(r=>r.id));
  for(const e of existing) if(!keep.has(e.id)) await dbDelete('fin_contract_items', e.id);
  for(let i=0;i<rows.length;i++){
    const r = rows[i], data = {ref:r.ref, section:r.section, description:r.description, value:r.value, position:i};
    if(r.id && existing.some(e=>e.id===r.id)) await dbUpdate('fin_contract_items', r.id, data);
    else { const ins = await dbInsert('fin_contract_items', Object.assign({org_id:ME.org_id, site_id:siteId}, data)); if(ins && ins[0]) r.id = ins[0].id; }
  }
  const total = finRound(rows.reduce((t,r)=>t+r.value, 0));
  const patch = {site_id:siteId, org_id:ME.org_id, contract_value:total, updated_at:new Date().toISOString(), updated_by:ME.id};
  if(finContractFile){
    const safe = finContractFile.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80);
    const stored = await uploadToStorage('finance-docs', ME.org_id+'/'+siteId+'/contract/'+uid()+'-'+safe, finContractFile, finContractFile.type||'application/octet-stream');
    if(stored){ patch.contract_file_path = stored; patch.contract_file_name = finContractFile.name; }
  }
  await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(patch)});
  finContractRows = null; finContractFile = null;
  if(btn){ btn.disabled = false; btn.textContent = 'Save breakdown'; }
  toast('Breakdown saved — contract value '+finMoney(total));
  render();
};
window.openFinDoc = async function(path, name){
  if(!path) return;
  const url = await resolveStorageUrl(publicUrl('finance-docs', path));
  if(/\.pdf$/i.test(name||path)) return viewPdfInApp(url, name||'Document');
  window.open(url, '_blank');
};

/* ---- reading an uploaded breakdown ---- */
let finImport = null; // {kind:'sheet', sheets:{name:rows}, sheet, header, descCol, valCol, refCol} | {kind:'pdf', lines:[{description,value}]}
const FIN_TOTAL_RE = /^(sub[\s-]?total|total|grand total|carried|brought|c\/f|b\/f|collection|summary|vat|net total|contract sum)\b/i;
window.finContractUploadPicked = async function(file){
  if(!file) return;
  finContractFile = file;
  const isPdf = /\.pdf$/i.test(file.name) || file.type==='application/pdf';
  try{
    if(isPdf){
      if(!(await loadLib('pdfjsLib'))){ toast('Could not load the PDF reader — check your connection.'); return; }
      const pdf = await pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
      const lines = [];
      for(let p=1; p<=Math.min(pdf.numPages, 40); p++){
        const tc = await (await pdf.getPage(p)).getTextContent();
        const rows = {};
        tc.items.forEach(it=>{ const y = Math.round(it.transform[5]/3)*3; (rows[y] = rows[y] || []).push({x:it.transform[4], s:it.str}); });
        Object.keys(rows).map(Number).sort((a,b)=>b-a).forEach(y=>{ lines.push(rows[y].sort((a,b)=>a.x-b.x).map(t=>t.s).join(' ').replace(/\s+/g,' ').trim()); });
      }
      const found = [];
      lines.forEach(t=>{
        const m = /^(.*?[A-Za-z].*?)\s+£?\s?(-?[\d,]+\.\d{2})\s*$/.exec(t);
        if(!m) return;
        const desc = m[1].replace(/\s+£?\s?[\d,]+\.\d{2}\s*$/,'').trim();
        const val = Number(m[2].replace(/,/g,''));
        if(!desc || isNaN(val)) return;
        found.push({description:desc, value:val, skip:FIN_TOTAL_RE.test(desc)});
      });
      finImport = {kind:'pdf', lines:found};
    } else {
      if(!(await loadLib('XLSX'))){ toast('Could not load the Excel reader — check your connection.'); return; }
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array'});
      const sheets = {};
      wb.SheetNames.forEach(n=>{ sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, raw:true, blankrows:false, defval:''}); });
      // Pick the sheet with the most rows that have both words and a number.
      const score = rows=>rows.filter(r=>r.some(c=>typeof c==='number') && r.some(c=>typeof c==='string' && /[a-z]{3}/i.test(c))).length;
      const sheet = wb.SheetNames.slice().sort((a,b)=>score(sheets[b])-score(sheets[a]))[0];
      finImport = Object.assign({kind:'sheet', sheets}, finGuessColumns(sheets[sheet]), {sheet});
    }
  }catch(e){ console.error(e); toast('Could not read that file.'); return; }
  finImportShow();
};
function finGuessColumns(rows){
  const width = Math.max(0, ...rows.slice(0, 400).map(r=>r.length));
  let header = -1;
  for(let i=0;i<Math.min(rows.length, 40);i++){ if(rows[i].some(c=>typeof c==='string' && /^(description|item|details|element|work|amount|total|£|value|price|ref)/i.test(c.trim()))){ header = i; break; } }
  const body = rows.slice(header+1, header+400);
  let descCol = 0, best = -1, valCol = 0, bestN = -1, refCol = -1;
  for(let c=0;c<width;c++){
    const txt = body.reduce((t,r)=>t + (typeof r[c]==='string' ? Math.min(60, r[c].trim().length) : 0), 0);
    if(txt > best){ best = txt; descCol = c; }
  }
  for(let c=width-1;c>=0;c--){
    if(c===descCol) continue;
    const n = body.filter(r=>typeof r[c]==='number' && r[c]!==0).length;
    if(n > bestN){ bestN = n; valCol = c; }
  }
  // A short code column to the left of the description is the reference.
  for(let c=0;c<descCol;c++){ const n = body.filter(r=>String(r[c]||'').trim().length && String(r[c]).trim().length<=8).length; if(n > body.length*0.3){ refCol = c; break; } }
  return {header, descCol, valCol, refCol};
}
function finImportRows(){
  if(!finImport) return [];
  if(finImport.kind==='pdf') return finImport.lines;
  const rows = finImport.sheets[finImport.sheet] || [];
  const out = [];
  rows.slice(finImport.header+1).forEach(r=>{
    const desc = String(r[finImport.descCol]==null?'':r[finImport.descCol]).trim();
    let v = r[finImport.valCol];
    if(typeof v==='string') v = Number(v.replace(/[£,\s]/g,''));
    if(!desc || typeof v!=='number' || isNaN(v) || v===0) return;
    out.push({ref: finImport.refCol>=0 ? String(r[finImport.refCol]||'').trim() : '', description:desc, value:finRound(v), skip:FIN_TOTAL_RE.test(desc)});
  });
  return out;
}
function finImportShow(){
  let ov = document.getElementById('finImportOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finImportOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const rows = finImportRows();
  finImport.preview = rows;
  const used = rows.filter(r=>!r.skip);
  const total = used.reduce((t,r)=>t+r.value, 0);
  const colName = i=>{ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; };
  const sheetRows = finImport.kind==='sheet' ? finImport.sheets[finImport.sheet] : [];
  const width = finImport.kind==='sheet' ? Math.max(1, ...sheetRows.slice(0,200).map(r=>r.length)) : 0;
  const hdr = finImport.kind==='sheet' ? (sheetRows[finImport.header]||[]) : [];
  const colOpts = sel=>Array.from({length:width}, (_,i)=>`<option value="${i}" ${sel===i?'selected':''}>${colName(i)}${hdr[i]?' — '+escapeHtml(String(hdr[i]).slice(0,24)):''}</option>`).join('');
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:640px;">
    <h3>Check the lines</h3>
    ${finImport.kind==='sheet' ? `
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Sheet</label><select onchange="finImportSet('sheet', this.value)">${Object.keys(finImport.sheets).map(n=>`<option ${n===finImport.sheet?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select></div>
        <div class="formfield"><label class="field-label">Description column</label><select onchange="finImportSet('descCol', +this.value)">${colOpts(finImport.descCol)}</select></div>
        <div class="formfield"><label class="field-label">Amount column</label><select onchange="finImportSet('valCol', +this.value)">${colOpts(finImport.valCol)}</select></div>
        <div class="formfield"><label class="field-label">Ref column</label><select onchange="finImportSet('refCol', +this.value)"><option value="-1">None</option>${colOpts(finImport.refCol)}</select></div>
      </div>` : `<p class="stub" style="margin:0 0 8px;font-style:normal;">Read from the PDF: each line that ends in an amount.</p>`}
    <p class="stub" style="margin:0 0 6px;font-style:normal;">${used.length} line${used.length===1?'':'s'} · total <b>${finMoney(total)}</b>. Untick totals and sub-totals so they aren’t counted twice.</p>
    <div class="finimport">${rows.length ? rows.map((r,i)=>`<label class="finimport-r ${r.skip?'off':''}"><input type="checkbox" ${r.skip?'':'checked'} onchange="finImport.preview[${i}].skip=!this.checked;finImportSync()"><span>${escapeHtml(r.ref?r.ref+' · ':'')}${escapeHtml(r.description)}</span><b>${finMoney(r.value)}</b></label>`).join('') : '<div class="empty" style="margin:0;">No lines with amounts found. Try another sheet or column.</div>'}</div>
    <button class="darkbtn" style="width:100%;margin-top:10px;" onclick="finImportUse()" ${used.length?'':'disabled'}>Use these lines</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finImportOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
}
window.finImportSet = function(k, v){
  finImport[k] = v;
  if(k==='sheet') Object.assign(finImport, finGuessColumns(finImport.sheets[v]));
  finImportShow();
};
window.finImportSync = function(){
  if(finImport.kind==='pdf') finImport.lines = finImport.preview;
  const keepSkips = finImport.preview.map(r=>r.skip);
  const used = finImport.preview.filter(r=>!r.skip);
  const p = document.querySelector('#finImportOverlay .stub b'); if(p) p.textContent = finMoney(used.reduce((t,r)=>t+r.value,0));
  document.querySelectorAll('#finImportOverlay .finimport-r').forEach((el,i)=>el.classList.toggle('off', !!keepSkips[i]));
};
window.finImportUse = function(){
  const used = (finImport.preview||[]).filter(r=>!r.skip);
  finContractRows = used.map(r=>({ref:r.ref||'', section:'', description:r.description, value:r.value}));
  document.getElementById('finImportOverlay').style.display = 'none';
  finContractPaint();
  toast(used.length+' lines ready — check them and tap Save breakdown');
};

/* ---------------- Applications ---------------- */
window.newFinApplication = async function(siteId){
  const site = SITES.find(s=>s.id===siteId); if(!site) return;
  const [st, jfRows, pos, items, apps, vars] = await Promise.all([
    finLoadSettings(),
    dbSelect('job_finance', 'site_id=eq.'+siteId),
    dbSelect('client_pos', 'site_id=eq.'+siteId+'&order=is_primary.desc,created_at.asc&select=po_number'),
    dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&order=position.asc'),
    dbSelect('fin_applications', 'site_id=eq.'+siteId+'&order=number.desc'),
    dbSelect('variations', 'site_id=eq.'+siteId+'&approval_status=eq.approved&order=created_at.asc'),
  ]);
  if(!items.length){ toast('Set up the contract breakdown first.'); go(`#/site/${siteId}/finance/contract`); return; }
  const jf = jfRows[0] || {};
  const last = apps.find(a=>a.status!=='void');
  const lastPct = {}; ((last&&last.lines)||[]).forEach(l=>{ lastPct[l.item_id] = l.pct; });
  const lastVar = {}; ((last&&last.variations)||[]).forEach(v=>{ if(v.variation_id) lastVar[v.variation_id] = v; });
  const appDay = finAppDayFor(jf, st);
  const today = finToday();
  let val = today;
  if(appDay){ const d = new Date(); const day = Math.min(appDay, new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()); val = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'); }
  const dueDays = jf.due_days!=null ? jf.due_days : st.default_due_days, finalDays = jf.final_days!=null ? jf.final_days : st.default_final_days;
  const due = finAddDays(val, dueDays);
  const varRows = vars.map(v=>{ const prev = lastVar[v.id]; const amt = finNum(v.cost_impact); return {variation_id:v.id, description:v.description||'Variation', value: prev ? prev.value : ((amt===null||isNaN(amt))?0:amt), pct: prev ? prev.pct : 100}; });
  ((last&&last.variations)||[]).filter(v=>!v.variation_id).forEach(v=>varRows.push(Object.assign({}, v)));
  const row = {
    org_id:ME.org_id, site_id:siteId, number:(apps[0] ? apps[0].number : 0)+1, status:'draft',
    valuation_date:val, due_date:due, final_date:finAddDays(due, finalDays), client_po:(pos[0]||{}).po_number||null,
    lines: items.map(i=>({item_id:i.id, ref:i.ref||'', description:i.description, value:Number(i.value), pct: lastPct[i.id]!=null ? lastPct[i.id] : 0})),
    variations: varRows, dayworks: [],
    retention_pct: jf.retention_pct!=null ? jf.retention_pct : st.default_retention_pct, created_by:ME.id,
  };
  const ins = await dbInsert('fin_applications', row);
  if(ins && ins[0]) go(`#/site/${siteId}/finance/application/${ins[0].id}`);
};

let finApp = null, finAppCtx = null;
async function renderFinApplication(siteId, appId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const [rows, apps, jfRows] = await Promise.all([
    dbSelect('fin_applications', 'id=eq.'+appId),
    dbSelect('fin_applications', 'site_id=eq.'+siteId+'&select=id,number,status,net_due,cert_net,cert_previous'),
    dbSelect('job_finance', 'site_id=eq.'+siteId),
  ]);
  if(__gen !== RENDER_GEN) return;
  const a = rows[0];
  if(!a || !site){ toast('Application not found.'); go(`#/site/${siteId}/finance`); return; }
  if(!finApp || finApp.id!==a.id || finApp.__loaded !== a.updated_at){ finApp = JSON.parse(JSON.stringify(a)); finApp.__loaded = a.updated_at; }
  const jf = jfRows[0] || {};
  finAppCtx = {site, jf, previous: finPreviousCertified(apps, a.number)};
  const locked = ['certified','invoiced','void'].includes(a.status);
  const pctInput = (path, i, v)=> locked ? `<b>${finPct(v)}%</b>` : `<input type="text" inputmode="decimal" class="finpct" value="${finPct(v)}" oninput="finAppSet('${path}',${i},'pct',this.value)">`;
  document.getElementById('app').innerHTML = shell(`
    <div class="card finhead">
      <div><div class="finhead-l">Application</div><div class="finhead-v">No. ${a.number} ${finAppPill(a)}</div></div>
      <div><div class="finhead-l">Valuation date</div><div class="finhead-v">${finDate(a.valuation_date)}</div></div>
      <div><div class="finhead-l">Client PO</div><div class="finhead-v">${escapeHtml(a.client_po||'—')}</div></div>
      <div><div class="finhead-l">Due this time</div><div class="finhead-v" id="finAppDueHead">—</div></div>
    </div>
    ${locked ? `<div class="finbanner" style="background:var(--warn-bg);color:var(--warn);border-color:#F2D9B8;">This application has been certified, so it can’t be changed.</div>` : `
    <div class="card">
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Valuation date</label><input type="date" value="${a.valuation_date||''}" onchange="finApp.valuation_date=this.value"></div>
        <div class="formfield"><label class="field-label">Due date</label><input type="date" value="${a.due_date||''}" onchange="finApp.due_date=this.value"></div>
        <div class="formfield"><label class="field-label">Final date for payment</label><input type="date" value="${a.final_date||''}" onchange="finApp.final_date=this.value"></div>
        <div class="formfield"><label class="field-label">Retention %</label><input type="text" inputmode="decimal" value="${finPct(a.retention_pct)}" oninput="finApp.retention_pct=finPct(this.value);finAppPaint()"></div>
      </div>
    </div>`}
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Contract works</p>
      ${(finApp.lines||[]).map((l,i)=>`<div class="finapprow"><span class="finapprow-d">${escapeHtml(l.ref?l.ref+' · ':'')}${escapeHtml(l.description)}<em>${finMoney(l.value)}</em></span>${pctInput('lines', i, l.pct)}<b id="finAppG-lines-${i}">—</b></div>`).join('')}
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Variations</p>
      ${(finApp.variations||[]).length ? finApp.variations.map((v,i)=>`<div class="finapprow"><span class="finapprow-d">${escapeHtml(v.description)}${locked ? `<em>${finMoney(v.value)}</em>` : `<input type="text" inputmode="decimal" class="finvarval" value="${v.value!=null?escapeHtml(String(v.value)):''}" placeholder="£ value" oninput="finAppSet('variations',${i},'value',this.value)">`}</span>${pctInput('variations', i, v.pct)}<b id="finAppG-variations-${i}">—</b></div>`).join('') : `<p class="stub" style="margin:0;font-style:normal;">No approved variations on this job.</p>`}
      ${locked ? '' : `<button class="ghostbtn" style="width:100%;margin-top:6px;" onclick="finAppAddVar()">+ Add a variation not in the app</button>`}
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Dayworks</p>
      ${(finApp.dayworks||[]).map((d,i)=>`<div class="finapprow"><span class="finapprow-d">${locked ? escapeHtml(d.description) : `<input type="text" value="${escapeHtml(d.description||'')}" placeholder="Description" oninput="finApp.dayworks[${i}].description=this.value">`}</span>${locked ? '' : `<input type="text" inputmode="decimal" class="finpct" value="${d.value!=null?escapeHtml(String(d.value)):''}" placeholder="£" oninput="finAppSet('dayworks',${i},'value',this.value)">`}<b id="finAppG-dayworks-${i}">—</b></div>`).join('') || `<p class="stub" style="margin:0;font-style:normal;">None.</p>`}
      ${locked ? '' : `<button class="ghostbtn" style="width:100%;margin-top:6px;" onclick="finApp.dayworks.push({description:'',value:null});finAppSaveSoft().then(render)">+ Add daywork</button>`}
    </div>
    <div class="card" id="finAppSummary"></div>
    ${locked ? '' : `<div class="row-gap" style="flex-wrap:wrap;">
      <button class="darkbtn" style="flex:1;min-width:140px;" id="finAppSave" onclick="saveFinApplication(true)">Save</button>
      <button class="darkbtn" style="flex:1;min-width:140px;" onclick="openFinAppEmail('${siteId}','${a.id}')">✉️ Email</button>
    </div>`}
    <div class="row-gap" style="flex-wrap:wrap;margin-top:10px;">
      <button class="ghostbtn" style="flex:1;min-width:140px;" onclick="downloadFinAppExcel('${a.id}')">⬇️ Excel</button>
      ${locked ? '' : `<label class="ghostbtn" style="flex:1;min-width:140px;text-align:center;cursor:pointer;">⬆️ Upload edited Excel<input type="file" accept=".xlsx,.xls" style="display:none;" onchange="uploadFinAppExcel(this.files[0])"></label>`}
    </div>
    ${['submitted','certified','invoiced'].includes(a.status) ? `<div id="finCertSlot"></div>` : ''}
    ${a.status==='draft' ? `<button class="ghostbtn" style="width:100%;margin-top:14px;color:var(--red);" onclick="deleteFinApplication('${siteId}','${a.id}')">Delete draft</button>` : ''}
  `, {title:'Application '+a.number, subtitle:site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
  finAppPaint();
  if(typeof finCertSlotRender==='function') finCertSlotRender(a);
}
window.finAppSet = function(path, i, key, v){
  finApp[path][i][key] = key==='pct' ? finPct(v) : finNum(v);
  finAppPaint();
};
window.finAppAddVar = function(){ finApp.variations.push({variation_id:null, description:'', value:null, pct:100}); finAppSaveSoft().then(render); };
window.finAppPaint = function(){
  if(!finApp || !finAppCtx) return;
  const c = finAppCalc(finApp, finAppCtx.jf.contract_value, finAppCtx.jf.retention_limit_pct, finAppCtx.previous);
  ['lines','variations','dayworks'].forEach(k=>c[k].forEach((x,i)=>{ const el = document.getElementById(`finAppG-${k}-${i}`); if(el) el.textContent = finMoney(x.gross); }));
  const s = document.getElementById('finAppSummary');
  if(s) s.innerHTML = `<div class="finkv"><span>Gross valuation to date</span><b>${finMoney(c.gross)}</b></div>
    <div class="finkv"><span>Less retention @ ${finPct(finApp.retention_pct)}%${finAppCtx.jf.retention_limit_pct?' (limit '+finAppCtx.jf.retention_limit_pct+'%)':''}</span><b>−${finMoney(c.retention)}</b></div>
    <div class="finkv"><span>Less previously certified</span><b>−${finMoney(c.previous)}</b></div>
    <div class="finkv big"><span>Amount due this application</span><b>${finMoney(c.net_due)}</b></div>
    <p class="stub" style="margin:6px 0 0;font-style:normal;">Excl. VAT. An application isn’t a VAT invoice; the invoice follows the certificate.</p>`;
  const h = document.getElementById('finAppDueHead'); if(h) h.textContent = finMoney(c.net_due);
  return c;
};
function finAppRowForSave(){
  const c = finAppCalc(finApp, finAppCtx.jf.contract_value, finAppCtx.jf.retention_limit_pct, finAppCtx.previous);
  return {valuation_date:finApp.valuation_date||null, due_date:finApp.due_date||null, final_date:finApp.final_date||null,
    lines:c.lines, variations:c.variations.map(v=>Object.assign(v, {description:String(v.description||'').trim()})), dayworks:c.dayworks,
    gross:c.gross, retention_pct:finPct(finApp.retention_pct), retention:c.retention, previous:c.previous, net_due:c.net_due, updated_at:new Date().toISOString()};
}
window.finAppSaveSoft = async function(){ const r = await dbUpdate('fin_applications', finApp.id, finAppRowForSave()); if(r){ finApp = null; } return r; };
window.saveFinApplication = async function(showToast){
  const btn = document.getElementById('finAppSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const r = await dbUpdate('fin_applications', finApp.id, finAppRowForSave());
  if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
  if(r){ finApp = null; if(showToast) toast('Application saved'); render(); }
  return r;
};
window.deleteFinApplication = async function(siteId, id){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to delete'; return; }
  if(await dbDelete('fin_applications', id)){ finApp = null; toast('Draft deleted'); go(`#/site/${siteId}/finance`); }
};

/* ---- Excel out ---- */
async function finAppExcelBytes(a){
  if(!(await loadLib('ExcelJS'))){ toast('Could not load the Excel tool — check your connection.'); return null; }
  const site = SITES.find(s=>s.id===a.site_id) || {};
  const jfRows = await dbSelect('job_finance', 'site_id=eq.'+a.site_id); const jf = jfRows[0] || {};
  const wb = new ExcelJS.Workbook(); wb.creator = (ORG&&ORG.name)||'OpHUB';
  const ws = wb.addWorksheet('Application '+a.number, {pageSetup:{paperSize:9, orientation:'portrait', fitToPage:true, fitToWidth:1, fitToHeight:0}});
  ws.columns = [{key:'id', width:4, hidden:true}, {key:'ref', width:22}, {key:'desc', width:52}, {key:'value', width:16}, {key:'pct', width:13}, {key:'gross', width:17}];
  const money = '£#,##0.00;[Red]-£#,##0.00';
  const brand = String((ORG&&ORG.color_primary)||'#C8102E').replace('#','').toUpperCase();
  const t = ws.addRow(['', (ORG&&ORG.name)||'']); t.getCell(2).font = {bold:true, size:16, color:{argb:'FF'+brand}};
  const t2 = ws.addRow(['', 'Application for payment No. '+a.number]); t2.getCell(2).font = {bold:true, size:13};
  ws.addRow([]);
  const info = [['Client', jf.billing_name||site.client_name||''], ['Job', site.name||''], ['Job no.', site.job_number||''], ['Client PO', a.client_po||''], ['Valuation date', a.valuation_date?finDate(a.valuation_date):''], ['Due date', a.due_date?finDate(a.due_date):''], ['Final date for payment', a.final_date?finDate(a.final_date):'']];
  info.forEach(([k,v])=>{ const r = ws.addRow(['', k, v]); r.getCell(2).font = {bold:true, color:{argb:'FF5B6472'}}; r.getCell(3).font = {bold:true}; });
  ws.addRow([]);
  const head = ws.addRow(['ID', 'Ref', 'Description', 'Contract value', '% complete', 'Value to date']);
  head.eachCell(c=>{ c.font = {bold:true, color:{argb:'FFFFFFFF'}}; c.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF1F3A5F'}}; });
  const firstData = head.number + 1;
  const section = name=>{ const r = ws.addRow(['', '', name]); r.getCell(3).font = {bold:true}; r.eachCell(c=>{ c.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFEEF1F5'}}; }); };
  const line = (id, ref, desc, value, pct, gross)=>{
    const r = ws.addRow([id, ref||'', desc||'', value, pct, null]);
    const n = r.number;
    r.getCell(6).value = pct===null ? {formula:`D${n}`, result:gross} : {formula:`ROUND(D${n}*E${n}/100,2)`, result:gross};
    r.getCell(4).numFmt = money; r.getCell(6).numFmt = money; r.getCell(5).numFmt = '0.##';
    if(pct!==null) r.getCell(5).fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFFFF6DB'}};
    r.getCell(3).alignment = {wrapText:true, vertical:'top'};
  };
  const c = finAppCalc(a, jf.contract_value, jf.retention_limit_pct, a.previous);
  section('CONTRACT WORKS'); c.lines.forEach(l=>line('L:'+l.item_id, l.ref, l.description, Number(l.value), finPct(l.pct), l.gross));
  section('VARIATIONS'); c.variations.forEach((v,i)=>line('V:'+(v.variation_id||('x'+i)), '', v.description, Number(v.value||0), finPct(v.pct), v.gross));
  section('DAYWORKS'); c.dayworks.forEach((d,i)=>line('D:'+i, '', d.description, Number(d.value||0), null, d.gross));
  const lastData = ws.lastRow.number;
  ws.addRow([]);
  const sum = (label, formula, result, bold)=>{ const r = ws.addRow(['', '', label, null, null, {formula, result}]); r.getCell(3).font = {bold:!!bold}; r.getCell(3).alignment = {horizontal:'right'}; r.getCell(6).numFmt = money; r.getCell(6).font = {bold:!!bold}; return r.number; };
  const g = sum('Gross valuation to date', `SUM(F${firstData}:F${lastData})`, c.gross, true);
  const rr = ws.addRow(['', '', 'Retention %', null, finPct(a.retention_pct), null]); rr.getCell(3).alignment = {horizontal:'right'}; rr.getCell(5).fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFFFF6DB'}};
  const ret = sum('Less retention', jf.retention_limit_pct && jf.contract_value ? `-MIN(ROUND(F${g}*E${rr.number}/100,2),${finRound(jf.contract_value*jf.retention_limit_pct/100)})` : `-ROUND(F${g}*E${rr.number}/100,2)`, -c.retention);
  const prev = sum('Less previously certified', `-${finRound(a.previous||0)}`, -finRound(a.previous||0));
  sum('Amount due this application (excl. VAT)', `F${g}+F${ret}+F${prev}`, c.net_due, true);
  ws.addRow([]);
  const note = ws.addRow(['', '', 'This application is not a VAT invoice. Edit the yellow cells and upload this file back to OpHUB to update it.']); note.getCell(3).font = {italic:true, color:{argb:'FF5B6472'}};
  return await wb.xlsx.writeBuffer();
}
function finAppFilename(a){ const site = SITES.find(s=>s.id===a.site_id) || {}; return 'Application '+a.number+' - '+String(site.name||'').replace(/[\\/:*?"<>|]+/g,'')+(site.job_number?' ('+site.job_number+')':'')+'.xlsx'; }
window.downloadFinAppExcel = async function(id){
  if(finApp && finApp.id===id && document.getElementById('finAppSave')) await saveFinApplication(false);
  const a = (await dbSelect('fin_applications', 'id=eq.'+id))[0]; if(!a) return;
  const buf = await finAppExcelBytes(a); if(!buf) return;
  const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  return deliverExcelBuffer(buf, finAppFilename(a));
};

/* ---- Excel back in ---- */
window.uploadFinAppExcel = async function(file){
  if(!file || !finApp) return;
  if(!(await loadLib('XLSX'))){ toast('Could not load the Excel reader — check your connection.'); return; }
  let rows;
  try{ const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array'}); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:true, defval:''}); }
  catch(e){ toast('Could not read that file.'); return; }
  const num = v=>{ if(typeof v==='number') return v; const n = Number(String(v||'').replace(/[£,%\s]/g,'')); return isNaN(n) ? null : n; };
  let changed = 0, added = 0, inDay = false;
  const newDay = [];
  rows.forEach(r=>{
    const id = String(r[0]||'').trim(), desc = String(r[2]||'').trim();
    if(/^DAYWORKS$/i.test(desc)){ inDay = true; return; }
    if(/^(CONTRACT WORKS|VARIATIONS)$/i.test(desc)){ inDay = false; return; }
    if(/^Gross valuation/i.test(desc)){ inDay = false; return; }
    if(/^Retention %$/i.test(desc)){ const p = num(r[4]); if(p!==null && p!==finPct(finApp.retention_pct)){ finApp.retention_pct = finPct(p); changed++; } return; }
    let m;
    if((m = /^L:(.+)$/.exec(id))){ const l = finApp.lines.find(x=>x.item_id===m[1]); const p = num(r[4]); if(l && p!==null && finPct(p)!==finPct(l.pct)){ l.pct = finPct(p); changed++; } return; }
    if((m = /^V:(.+)$/.exec(id))){
      const v = finApp.variations.find((x,i)=>(x.variation_id||('x'+i))===m[1]); if(!v) return;
      const p = num(r[4]), val = num(r[3]);
      if(p!==null && finPct(p)!==finPct(v.pct)){ v.pct = finPct(p); changed++; }
      if(val!==null && val!==Number(v.value)){ v.value = val; changed++; }
      if(desc && desc!==v.description){ v.description = desc; changed++; }
      return;
    }
    if((m = /^D:(\d+)$/.exec(id))){ const val = num(r[3]); const d = finApp.dayworks[+m[1]]; if(d){ newDay.push({description:desc||d.description, value:val!==null?val:d.value}); if(val!==Number(d.value) || desc!==d.description) changed++; } return; }
    if(inDay && !id && desc){ const val = num(r[3]) ?? num(r[5]); if(val!==null){ newDay.push({description:desc, value:val}); added++; } }
  });
  if(rows.some(r=>/^D:\d+$/.test(String(r[0]||'').trim())) || added) finApp.dayworks = newDay;
  const r = await dbUpdate('fin_applications', finApp.id, finAppRowForSave());
  if(!r) return;
  finApp = null;
  toast(changed||added ? `Updated from Excel: ${changed} change${changed===1?'':'s'}${added?', '+added+' new daywork'+(added===1?'':'s'):''}` : 'No changes found in that file');
  render();
};

/* ---- email ---- */
window.openFinAppEmail = async function(siteId, appId){
  await saveFinApplication(false);
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a) return;
  const jf = (await dbSelect('job_finance', 'site_id=eq.'+siteId))[0] || {};
  const site = SITES.find(s=>s.id===siteId) || {};
  let ov = document.getElementById('finMailOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finMailOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>Email application ${a.number}</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">Sent as an Excel file. Amount due: <b>${finMoney(a.net_due)}</b></p>
    <div class="formfield"><label class="field-label">To</label><input type="text" id="finMailTo" value="${escapeHtml(jf.billing_email||site.client_email||'')}" placeholder="qs@client.co.uk (use commas for more than one)"></div>
    <label class="finswitch"><input type="checkbox" id="finMailMe" checked> Send me a copy (${escapeHtml(ME.email||'')})</label>
    <div class="formfield"><label class="field-label">Message (optional)</label><textarea id="finMailMsg" rows="3"></textarea></div>
    <button class="darkbtn" style="width:100%;" id="finMailSend" onclick="sendFinAppEmail('${siteId}','${appId}')">Send</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finMailOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.sendFinAppEmail = async function(siteId, appId){
  const to = finVal('finMailTo').split(/[,;\s]+/).map(s=>s.trim()).filter(Boolean);
  if(!to.length || to.some(e=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))){ toast('Check the email address.'); return; }
  const btn = document.getElementById('finMailSend'); const reset = ()=>{ if(btn){ btn.disabled=false; btn.textContent='Send'; } };
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a){ reset(); return; }
  const buf = await finAppExcelBytes(a); if(!buf){ reset(); return; }
  const path = ME.org_id+'/'+siteId+'/applications/Application-'+a.number+'-'+Date.now()+'.xlsx';
  const stored = await uploadToStorage('finance-docs', path, new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if(!stored){ reset(); return; }
  let res;
  try{
    res = await sbFetch('/functions/v1/send-finance-email', {method:'POST', timeoutMs:60000, body:JSON.stringify({
      kind:'application', site_id:siteId, storage_path:stored, filename:finAppFilename(a), recipients:to,
      cc: document.getElementById('finMailMe').checked && ME.email ? [ME.email] : [],
      reference:'No. '+a.number, client_po:a.client_po||'', amount:finMoney(a.net_due)+' excl. VAT', due:a.due_date?finDate(a.due_date):'', message:finVal('finMailMsg'),
    })});
  }catch(e){ toast('Could not reach the server — check your connection.'); reset(); return; }
  const d = await res.json().catch(()=>({}));
  if(!res.ok || d.error){ toast('Email failed — '+String(d.error||res.status).slice(0,140)); reset(); return; }
  await dbUpdate('fin_applications', appId, {excel_path:stored, submitted_at:new Date().toISOString(), sent_to:to.join(', '), status: a.status==='draft' ? 'submitted' : a.status});
  document.getElementById('finMailOverlay').style.display = 'none';
  finApp = null; toast('Application emailed'); render();
};
