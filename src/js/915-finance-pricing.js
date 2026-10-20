/* ============================================================
   OpHUB Finance — pricing materials
   1. Supplier invoices: the reader picks out every line, matches it to the
      PO's items, prices any unpriced PO lines, and flags price rises, qty
      differences and extra items.
   2. Supplier quotes: upload a quote on a PO and its lines price the PO.
   3. Price book: every priced line is remembered per supplier; new POs from
      the Materials tile are priced from it (estimate) — see fin_raise_po.
   4. Project shopping list: upload a quote for a project; its lines become a
      list the team picks from when requesting materials (and on Finance POs).
      Rates are only visible to Finance users and people allowed to see costs
      (profiles.see_costs) — enforced by the database (fin_shop_prices RLS).
   The reader is the finance-ai-read edge function (Claude). Without its API
   key, a basic reader works on typed PDFs and spreadsheets.
   ============================================================ */
let FIN_AI_OK = null, FIN_AI_CHECKED = 0; // null = unknown; 'false' is re-checked after 10 minutes (in case the key is added)
function finCanSeeCosts(){ return !!(ME && (ME.finance_enabled || ME.see_costs)); }

/* ---------- reading ---------- */
// Basic line reader for typed PDFs / text: "description  qty [unit]  unit price  amount".
function finParseLinesFromText(text){
  const out = [];
  const num = s=>Number(String(s).replace(/[£,]/g,''));
  String(text||'').split(/\n/).forEach(raw=>{
    const l = raw.replace(/ /g,' ').replace(/\s+/g,' ').trim(); if(!l) return;
    let m = /^(?:([A-Z0-9][A-Z0-9\-\/]{2,})\s+)?(.{3,}?)\s+(\d+(?:\.\d+)?)\s*([A-Za-z²0-9]{1,6})?\s+£?(\d[\d,]*\.\d{2,4})\s+£?(\d[\d,]*\.\d{2})$/.exec(l);
    if(m){ const q = num(m[3]), up = num(m[5]), amt = num(m[6]); if(q>0 && Math.abs(q*up - amt) <= Math.max(0.05, amt*0.02)) out.push({code:m[1]||'', description:m[2].trim(), qty:q, unit:(m[4]||'').trim(), unit_price:up, amount:amt, kind:/deliver|carriage/i.test(m[2])?'delivery':'item'}); return; }
    m = /^(.{3,}?)\s+(\d+(?:\.\d+)?)\s*([A-Za-z²]{1,6})?\s+(?:@\s*)?£?(\d[\d,]*\.\d{2,4})(?:\s*(?:each|ea|per\s+\w+))?$/i.exec(l);
    if(m){ const q = num(m[2]), up = num(m[4]); if(q>0 && up>0 && !/total|vat|sub ?total|balance/i.test(m[1])) out.push({description:m[1].trim(), qty:q, unit:(m[3]||'').trim(), unit_price:up, amount:finRound(q*up), kind:'item'}); }
  });
  return out;
}
function finSheetRowsToLines(rows){
  // Find a header row with a description column and a price column.
  const hdr = rows.findIndex(r=>r && r.some(c=>/desc|item|product/i.test(String(c||''))) && r.some(c=>/price|rate|cost|each|amount|total/i.test(String(c||''))));
  if(hdr<0) return [];
  const h = rows[hdr].map(c=>String(c||'').toLowerCase());
  const col = re=>h.findIndex(c=>re.test(c));
  const cD = col(/desc|item|product/), cQ = col(/^qty|quant/), cU = col(/^unit$|uom|^per/), cP = col(/price|rate|each|unit cost|cost/), cA = col(/amount|total|value|line/), cC = col(/code|sku|ref/);
  const out = [];
  rows.slice(hdr+1).forEach(r=>{
    if(!r) return; const d = String(r[cD]==null?'':r[cD]).trim(); if(!d) return;
    if(/^(sub ?)?total|^vat\b|^net\b|^balance|^grand total|carried forward|brought forward/i.test(d)) return;
    const n = i=>{ if(i<0) return null; const v = Number(String(r[i]==null?'':r[i]).replace(/[£,]/g,'')); return isNaN(v) ? null : v; };
    let q = n(cQ), p = n(cP), a = n(cA);
    if(p==null && a!=null && q) p = finRound(a/q);
    if(p==null || p<=0) return;
    out.push({code:cC>-1?String(r[cC]||'').trim():'', description:d, qty:q, unit:cU>-1?String(r[cU]||'').trim():'', unit_price:p, amount:a!=null?a:(q!=null?finRound(q*p):null), kind:'item'});
  });
  return out;
}
// Read a stored file (finance-docs path) or a picked File. Returns {data:{supplier, doc_number, doc_date, net, vat, total, po_number, lines}, via}.
async function finReadDoc(opts){
  const kind = opts.kind || 'invoice';
  let path = opts.path || null, sheetText = null, sheetLines = null;
  const f = opts.file;
  if(f && /\.(xlsx|xls|csv)$/i.test(f.name)){
    if(!(await loadLib('XLSX'))) return {error:'Could not load the Excel reader'};
    const wb = XLSX.read(await f.arrayBuffer(), {type:'array'});
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:true, defval:null, blankrows:false});
    sheetLines = finSheetRowsToLines(rows);
    sheetText = rows.slice(0, 400).map(r=>(r||[]).map(c=>c==null?'':String(c)).join(' | ')).join('\n');
  } else if(f && !path){
    path = await uploadToStorage('finance-docs', ME.org_id+'/'+(opts.siteId||'general')+'/'+(kind==='quote'?'quotes':'purchase')+'/'+uid()+'-'+f.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80), f, f.type||'application/octet-stream');
    if(!path) return {error:'Upload failed'};
  }
  if(FIN_AI_OK === false && Date.now() - FIN_AI_CHECKED > 600000) FIN_AI_OK = null;
  if(FIN_AI_OK !== false){
    try{
      const res = await sbFetch('/functions/v1/finance-ai-read', {method:'POST', timeoutMs:90000, body:JSON.stringify(path ? {path, kind} : {text:sheetText, kind})});
      const j = await res.json().catch(()=>({}));
      if(j.error==='not_configured'){ FIN_AI_OK = false; FIN_AI_CHECKED = Date.now(); }
      else if(j.ok && j.data){ FIN_AI_OK = true; return {data:j.data, via:'ai', path}; }
    }catch(e){}
  }
  // Basic reader
  if(sheetLines) return {data:{lines:sheetLines}, via:'basic', path};
  if(path && /\.pdf$/i.test(path)){
    const url = typeof presignStorageUrl==='function' ? await presignStorageUrl(publicUrl('finance-docs', path)) : publicUrl('finance-docs', path);
    const text = await finPdfText(url);
    const head = finReadInvoiceText(text, {pos:[], suppliers:[], sites:[]}) || {};
    return {data:{supplier:head.supplier, doc_number:head.invoice_no, doc_date:head.date, net:head.net, vat:head.vat, total:head.total, po_number:head.po_number, lines:finParseLinesFromText(text)}, via:'basic', path};
  }
  return {data:{lines:[]}, via:'basic', path, note:'Photos need the AI reader switched on.'};
}

/* ---------- matching ---------- */
const FIN_STOP = new Set(['the','and','of','to','for','with','x','mm','per','each','ea','nr','no','pack','pk','box','roll','bag','m','m2','lm']);
function finTokens(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9.]+/g,' ').split(' ').filter(t=>t && !FIN_STOP.has(t)); }
function finSim(a, b){
  const A = finTokens(a), B = finTokens(b); if(!A.length || !B.length) return 0;
  const sa = new Set(A), sb = new Set(B); let inter = 0; sa.forEach(t=>{ if(sb.has(t)) inter++; });
  let s = inter / (sa.size + sb.size - inter);
  const numsA = A.filter(t=>/\d/.test(t)), numsB = new Set(B.filter(t=>/\d/.test(t)));
  if(numsA.length && numsA.every(t=>numsB.has(t))) s += 0.15;
  return s;
}
// Greedy best pairs, score ≥ 0.3. Returns poIdx -> lineIdx.
function finMatchLines(items, lines){
  const pairs = [];
  items.forEach((it,i)=>lines.forEach((l,j)=>{ if((l.kind||'item')!=='item') return; const s = Math.max(finSim(it.item||it.description, l.description), l.code && String(it.item||'').toLowerCase().includes(String(l.code).toLowerCase()) ? 0.9 : 0); if(s>=0.3) pairs.push({i, j, s}); }));
  pairs.sort((a,b)=>b.s-a.s);
  const map = {}, used = new Set();
  pairs.forEach(p=>{ if(map[p.i]===undefined && !used.has(p.j)){ map[p.i] = p.j; used.add(p.j); } });
  return map;
}
function finQtyNum(q){ const m = /^\s*([0-9]+(?:\.[0-9]+)?)/.exec(String(q==null?'':q).replace(/,/g,'')); return m ? Number(m[1]) : null; }

/* ---------- price book ---------- */
function finItemKey(t){ return String(t||'').toLowerCase().replace(/[^a-z0-9.]+/g,' ').replace(/\s+/g,' ').trim(); }
async function finPriceBookSave(supplierName, lines, source, ref){
  const sup = String(supplierName||'').trim(); if(!sup) return;
  const rows = (lines||[]).filter(l=>(l.kind||'item')==='item' && l.description && l.unit_price!=null && Number(l.unit_price)>0).map(l=>({org_id:ME.org_id, supplier_key:sup.toLowerCase(), supplier_name:sup, item_key:finItemKey(l.description), description:String(l.description).slice(0,300), code:l.code||null, unit:l.unit||null, rate:finRound4(l.unit_price), source, source_ref:ref||null, updated_at:new Date().toISOString()}));
  const seen = new Set(); const uniq = rows.filter(r=>{ if(seen.has(r.item_key)) return false; seen.add(r.item_key); return true; });
  if(!uniq.length) return;
  try{ await sbFetch('/rest/v1/fin_price_book?on_conflict=org_id,supplier_key,item_key', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(uniq)}); }catch(e){}
}
function finRound4(n){ return Math.round((Number(n)||0)*10000)/10000; }

/* ---------- 1. supplier invoice lines → PO ---------- */
// Runs after a supplier invoice with a file is saved (form or inbox). Quietly does nothing if it can't read lines.
async function finCheckInvoiceLines(piId, opts){
  opts = opts || {};
  const pi = (await dbSelect('purchase_invoices', 'id=eq.'+piId))[0]; if(!pi || !pi.file_path) return null;
  const r = await finReadDoc({path:pi.file_path, kind:'invoice'});
  if(r.error) return null;
  const lines = (r.data.lines||[]).map(l=>({code:l.code||'', description:l.description, qty:l.qty!=null?Number(l.qty):null, unit:l.unit||'', unit_price:l.unit_price!=null?Number(l.unit_price):null, amount:l.amount!=null?Number(l.amount):null, kind:l.kind||'item'}));
  const notes = [];
  let po = null;
  if(pi.po_id){
    po = (await dbSelect('purchase_orders', 'id=eq.'+pi.po_id))[0];
    if(po){
      const items = (po.items||[]).map(x=>Object.assign({}, x));
      const map = finMatchLines(items, lines);
      const matched = new Set(Object.values(map));
      let changed = false;
      items.forEach((it,i)=>{
        const j = map[i]; if(j===undefined) return;
        const l = lines[j]; const q = finQtyNum(it.qty);
        if(l.unit_price!=null){
          if(it.rate!=null && it.rate_source!=='book' && l.unit_price > Number(it.rate)*1.02 && l.unit_price - Number(it.rate) > 0.01) notes.push(`${it.item}: invoiced at ${finMoney(l.unit_price)} each, PO ${finMoney(it.rate)}`);
          if(it.rate==null || it.rate_source==='book'){ it.rate = finRound4(l.unit_price); it.rate_source = 'invoice'; if(q!=null) it.amount = finRound(q*it.rate); changed = true; }
        }
        if(q!=null && l.qty!=null && Math.abs(q - l.qty) > 0.001) notes.push(`${it.item}: ordered ${q}, invoiced ${l.qty}`);
      });
      lines.forEach((l,j)=>{ if(!matched.has(j) && (l.kind||'item')==='item' && (l.amount||0) > 0) notes.push(`Not on the PO: ${l.description}${l.amount!=null?' ('+finMoney(l.amount)+')':''}`); });
      if(changed){
        const priced = items.filter(x=>x.amount!=null);
        const patch = {items};
        if(po.value==null || po.value_estimated){ patch.value = finRound(priced.reduce((t,x)=>t+Number(x.amount||0),0)) || null; patch.value_estimated = priced.length < items.length; }
        await dbUpdate('purchase_orders', po.id, patch);
      }
    }
  }
  const patch = {lines, match_notes: notes.length ? notes.join('\n') : null};
  if(notes.some(n=>/invoiced at|Not on the PO/.test(n)) && pi.status==='to_approve'){ patch.status = 'query'; patch.query_note = [pi.query_note, 'Check the lines: '+notes.length+' difference'+(notes.length===1?'':'s')+' with the PO'].filter(Boolean).join('; '); }
  await dbUpdate('purchase_invoices', piId, patch);
  await finPriceBookSave(pi.supplier_name || r.data.supplier, lines, 'invoice', pi.invoice_no);
  return {lines, notes, via:r.via};
}
window.finReadPiLines = async function(piId, siteId){
  toast('Reading the invoice lines…');
  const r = await finCheckInvoiceLines(piId);
  if(!r){ toast('Could not read lines from this invoice.'); return; }
  toast(r.lines.length ? r.lines.length+' lines read'+(r.notes.length?' — '+r.notes.length+' to check':' — all match') : 'No lines found'+(FIN_AI_OK===false?' (switch on the AI reader for photos and unusual layouts)':''));
  if(typeof openPurchaseInvoiceView==='function') openPurchaseInvoiceView(siteId, piId);
};
function finPiLinesHtml(i){
  if(!i.lines) return i.file_path ? `<button class="ghostbtn" style="width:100%;margin-top:8px;" onclick="finReadPiLines('${i.id}','${i.site_id}')">Read the invoice lines</button>` : '';
  return `${i.match_notes ? `<div class="finnote warn"><b>Check against the PO</b>${i.match_notes.split('\n').map(n=>`<div>${escapeHtml(n)}</div>`).join('')}</div>` : (i.po_id && i.lines.length ? `<div class="finnote ok">Lines match the PO.</div>` : '')}
    <details class="finlines"><summary>${i.lines.length} line${i.lines.length===1?'':'s'} on the invoice</summary>
      ${i.lines.map(l=>`<div class="finkv"><span>${escapeHtml(l.description)}${l.qty!=null?' · '+l.qty+(l.unit?' '+escapeHtml(l.unit):''):''}${l.unit_price!=null?' × '+finMoney(l.unit_price):''}</span><b>${l.amount!=null?finMoney(l.amount):''}</b></div>`).join('')}
    </details>`;
}

/* ---------- 2. quote → PO ---------- */
let finPoQuote = null;
window.finPoFromQuote = async function(siteId, poId, input){
  const f = input && input.files && input.files[0]; if(!f) return;
  try{ input.value = ''; }catch(e){}
  toast('Reading the quote…');
  const po = (await dbSelect('purchase_orders', 'id=eq.'+poId))[0]; if(!po) return;
  const r = await finReadDoc({file:f, kind:'quote', siteId});
  if(r.error){ toast(r.error); return; }
  const lines = (r.data.lines||[]).filter(l=>l.unit_price!=null);
  if(!lines.length){ toast('No priced lines found in that quote'+(FIN_AI_OK===false?' — the AI reader isn’t switched on yet, so photos and some layouts can’t be read.':'.')); return; }
  const items = po.items||[];
  finPoQuote = {siteId, po, lines, map:finMatchLines(items, lines), path:r.path, file:f.name, data:r.data};
  let ov = document.getElementById('finPqOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPqOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const opt = (i, sel)=>`<option value="">— not on the quote —</option>`+lines.map((l,j)=>`<option value="${j}" ${sel===j?'selected':''}>${escapeHtml(l.description.slice(0,70))} · ${finMoney(l.unit_price)}${l.unit?'/'+escapeHtml(l.unit):''}</option>`).join('');
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:640px;">
    <h3>Price ${escapeHtml(po.number)} from the quote</h3>
    <p class="stub" style="margin:0 0 12px;">${lines.length} priced line${lines.length===1?'':'s'} read${r.via==='ai'?'':' (basic reader)'}${r.data.supplier?' from '+escapeHtml(r.data.supplier):''}. Check each match, then apply.</p>
    ${items.map((it,i)=>`<div class="finitem"><div class="finitem-d">${escapeHtml(it.item)} · qty ${escapeHtml(String(it.qty||''))}</div><select data-i="${i}" style="margin-top:6px;">${opt(i, finPoQuote.map[i])}</select></div>`).join('')}
    <button class="darkbtn" style="width:100%;margin-top:12px;" onclick="finPoQuoteApply()">Apply prices</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finPqOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.finPoQuoteApply = async function(){
  const q = finPoQuote; if(!q) return;
  const items = (q.po.items||[]).map(x=>Object.assign({}, x));
  document.querySelectorAll('#finPqOverlay select[data-i]').forEach(sel=>{
    const i = Number(sel.dataset.i), j = sel.value===''?null:Number(sel.value);
    if(j==null) return;
    const l = q.lines[j]; const qn = finQtyNum(items[i].qty);
    items[i].rate = finRound4(l.unit_price); items[i].rate_source = 'quote'; items[i].amount = qn!=null ? finRound(qn*items[i].rate) : null;
  });
  const priced = items.filter(x=>x.amount!=null);
  const quote = await dbInsert('fin_quotes', {org_id:ME.org_id, site_id:q.siteId, po_id:q.po.id, purpose:'po', supplier_id:q.po.supplier_id||null, supplier_name:q.data.supplier||q.po.supplier_name, quote_no:q.data.doc_number||null, quote_date:q.data.doc_date||null, file_path:q.path||null, file_name:q.file, lines:q.lines, net:q.data.net||null, vat:q.data.vat||null, total:q.data.total||null, created_by:ME.id});
  await dbUpdate('purchase_orders', q.po.id, {items, value: priced.length ? finRound(priced.reduce((t,x)=>t+Number(x.amount||0),0)) : q.po.value, value_estimated: priced.length < items.length, quote_id: quote && quote[0] ? quote[0].id : null});
  await finPriceBookSave(q.po.supplier_name || q.data.supplier, q.lines, 'quote', q.data.doc_number);
  document.getElementById('finPqOverlay').style.display = 'none';
  finPoQuote = null; toast(priced.length+' of '+items.length+' items priced from the quote'); render();
};

/* ---------- 3. price book page (Purchases › Price book) ---------- */
async function renderFinPriceBook(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const rows = await dbSelect('fin_price_book', 'org_id=eq.'+ME.org_id+'&order=supplier_name.asc,description.asc&limit=5000');
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('purchases')}${finSubTabs('purchases','pricebook')}
    ${finSecHead('Price book', '+ Add a price', 'openFinPriceRow()')}
    <p class="stub" style="margin:-4px 0 12px;">Each supplier’s latest price for every item, learned from quotes and invoices. New POs from the Materials tile are priced from here as an estimate until the real price comes in.</p>
    ${finSearchHtml('Search supplier, item or code', 'finPbList')}
    ${finListHtml('finPbList', rows.map(r=>`<button type="button" class="pmrow pmrow-card finrow" data-lf="${lfText([r.supplier_name, r.description, r.code].join(' '))}" onclick="openFinPriceRow('${r.id}')">
      <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(r.description)}</span><span class="pmrow-s">${escapeHtml(r.supplier_name||r.supplier_key)}${r.code?' · '+escapeHtml(r.code):''} · from ${escapeHtml(r.source||'manual')} ${finDate(String(r.updated_at).slice(0,10))}</span></span>
      <span class="finval">${finMoney(r.rate)}<em>${r.unit?'per '+escapeHtml(r.unit):'each'}</em></span></button>`), 'No prices yet — they’re added as quotes and invoices are read.')}
  `, {title:'Price book', subtitle:'OpHUB Finance · purchases', back:finSecBack(), tabs:false});
}
window.openFinPriceRow = async function(id){
  const r = id ? (await dbSelect('fin_price_book', 'id=eq.'+id))[0] : null;
  let ov = document.getElementById('finPbOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPbOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const v = k=>r && r[k]!=null ? escapeHtml(String(r[k])) : '';
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${r?'Price':'Add a price'}</h3>
    <div class="formfield"><label class="field-label">Supplier</label><input type="text" id="finPbSup" value="${v('supplier_name')}"></div>
    <div class="formfield"><label class="field-label">Item</label><input type="text" id="finPbDesc" value="${v('description')}"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Code</label><input type="text" id="finPbCode" value="${v('code')}"></div>
      <div class="formfield"><label class="field-label">Unit</label><input type="text" id="finPbUnit" value="${v('unit')}" placeholder="nr, m2, roll"></div>
      <div class="formfield"><label class="field-label">Price £ (excl. VAT)</label><input type="text" inputmode="decimal" data-money id="finPbRate" value="${v('rate')}"></div>
    </div>
    <button class="darkbtn" style="width:100%;" onclick="saveFinPriceRow('${r?r.id:''}')">Save</button>
    ${r ? `<button class="ghostbtn" style="width:100%;margin-top:8px;color:var(--red);" onclick="deleteFinPriceRow('${r.id}')">Remove</button>` : ''}
    <button class="geo-modal-cancel" onclick="document.getElementById('finPbOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.saveFinPriceRow = async function(id){
  const sup = finVal('finPbSup'), desc = finVal('finPbDesc'), rate = finNum(finVal('finPbRate'));
  if(!sup || !desc){ toast('Enter the supplier and item.'); return; }
  if(rate===null || isNaN(rate) || rate<0){ toast('Enter the price.'); return; }
  const row = {supplier_key:sup.toLowerCase(), supplier_name:sup, item_key:finItemKey(desc), description:desc, code:finVal('finPbCode')||null, unit:finVal('finPbUnit')||null, rate:finRound4(rate), source:'manual', updated_at:new Date().toISOString()};
  const r = id ? await dbUpdate('fin_price_book', id, row) : await dbInsert('fin_price_book', Object.assign({org_id:ME.org_id}, row));
  if(!r) return;
  document.getElementById('finPbOverlay').style.display = 'none'; toast('Price saved'); render();
};
window.deleteFinPriceRow = async function(id){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to remove'; return; }
  if(await dbDelete('fin_price_book', id)){ document.getElementById('finPbOverlay').style.display='none'; toast('Removed'); render(); }
};

/* ---------- 4. project shopping list ---------- */
let finShopDraft = null;
async function renderFinShopping(siteId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId); if(!site){ go('#/finance'); return; }
  const [items, prices, quotes, suppliers] = await Promise.all([
    dbSelect('fin_shop_items', 'site_id=eq.'+siteId+'&order=supplier_name.asc,position.asc'),
    dbSelect('fin_shop_prices', 'org_id=eq.'+ME.org_id),
    dbSelect('fin_quotes', 'site_id=eq.'+siteId+'&purpose=eq.shopping&order=created_at.desc'),
    dbSelect('suppliers', 'select=id,name&order=name.asc'),
  ]);
  if(__gen !== RENDER_GEN) return;
  const rate = {}; prices.forEach(p=>rate[p.item_id] = p.rate);
  const bySup = {}; items.forEach(i=>{ (bySup[i.supplier_name||'No supplier'] = bySup[i.supplier_name||'No supplier'] || []).push(i); });
  document.getElementById('app').innerHTML = shell(`
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Add a quote to the list</p>
      <p class="stub" style="margin:0 0 12px;">Upload a supplier quote or price list (PDF, photo or Excel). Its lines become this project’s shopping list: the team pick items from it when they request materials, and POs are priced from it. Only Finance users and people you allow can see the prices.</p>
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Supplier</label><select id="finShopSup"><option value="">From the quote</option>${suppliers.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select></div>
        <div class="formfield"><label class="field-label">Quote</label><input type="file" id="finShopFile" accept=".pdf,image/*,.xlsx,.xls,.csv" onchange="finShopRead('${siteId}', this)"></div>
      </div>
      <div id="finShopDraft"></div>
    </div>
    ${finSecHead('Shopping list', '+ Add an item', `finShopAddManual('${siteId}')`)}
    ${items.length ? finSearchHtml('Search the list', 'finShopList') : ''}
    <div id="finShopList">${Object.keys(bySup).map(s=>`<p class="sectiontitle" style="margin-top:16px;">${escapeHtml(s)}</p>${bySup[s].map(i=>`<div class="pmrow pmrow-card finrow" data-lf="${lfText([i.description, i.code, s].join(' '))}" style="${i.active?'':'opacity:.5;'}">
        <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(i.description)}</span><span class="pmrow-s">${[i.code, i.unit?'per '+i.unit:'', i.qty!=null?'quoted qty '+i.qty:''].filter(Boolean).map(escapeHtml).join(' · ')}${i.active?'':' · hidden from the team'}</span></span>
        <span class="finval"><input type="text" inputmode="decimal" data-money class="finshoprate" value="${rate[i.id]!=null?rate[i.id]:''}" placeholder="£" onchange="finShopSetRate('${i.id}', this.value)"><button class="linkbtn" onclick="finShopToggle('${i.id}', ${!i.active})">${i.active?'hide':'show'}</button></span></div>`).join('')}`).join('') || `<div class="empty">No items yet. Upload a quote above.</div>`}
      <div class="empty lf-empty" style="display:none;">No match.</div></div>
    ${quotes.length ? `<p class="sectiontitle" style="margin-top:22px;">Quotes used</p>${quotes.map(q=>`<div class="finkv"><span>${escapeHtml(q.supplier_name||'')} ${escapeHtml(q.quote_no||'')} · ${finDate(String(q.created_at).slice(0,10))}</span><b>${q.file_path?`<button class="linkbtn" onclick="openFinDoc('${jsAttr(q.file_path)}','${jsAttr(q.file_name||'')}')">view</button>`:''}</b></div>`).join('')}` : ''}
  `, {title:'Shopping list', subtitle:finJobTag(siteId), back:`#/site/${siteId}/finance`, siteId, tabs:false});
}
window.finShopRead = async function(siteId, input){
  const f = input.files && input.files[0]; if(!f) return;
  const box = document.getElementById('finShopDraft'); if(box) box.innerHTML = '<p class="stub">Reading the quote…</p>';
  const r = await finReadDoc({file:f, kind:'quote', siteId});
  if(r.error){ if(box) box.innerHTML = `<p class="stub" style="color:var(--red);">${escapeHtml(r.error)}</p>`; return; }
  const lines = (r.data.lines||[]).filter(l=>(l.kind||'item')==='item' && l.description);
  const supSel = document.getElementById('finShopSup');
  finShopDraft = {siteId, path:r.path, file:f.name, data:r.data, lines:lines.map(l=>Object.assign({keep:true}, l)), supplier_id:supSel?supSel.value:'', supplier_name: supSel && supSel.value ? supSel.options[supSel.selectedIndex].text : (r.data.supplier||'')};
  finShopPaintDraft();
};
function finShopPaintDraft(){
  const d = finShopDraft, box = document.getElementById('finShopDraft'); if(!d || !box) return;
  if(!d.lines.length){ box.innerHTML = `<p class="stub" style="color:var(--warn);">No lines found in that file${FIN_AI_OK===false?' — the AI reader isn’t switched on yet, so photos and unusual layouts can’t be read. Excel quotes with Description and Price columns work now.':'.'}</p>`; return; }
  box.innerHTML = `<div class="formfield"><label class="field-label">Supplier name</label><input type="text" value="${escapeHtml(d.supplier_name||'')}" oninput="finShopDraft.supplier_name=this.value"></div>
    <p class="stub" style="margin:0 0 8px;">${d.lines.length} lines found. Untick anything that shouldn’t be on the list, and correct any wording.</p>
    ${d.lines.map((l,i)=>`<div class="finitem"><label class="finswitch" style="margin:0;"><input type="checkbox" ${l.keep?'checked':''} onchange="finShopDraft.lines[${i}].keep=this.checked"><input type="text" value="${escapeHtml(l.description)}" oninput="finShopDraft.lines[${i}].description=this.value" style="flex:1;"></label>
      <div class="finitem-in"><label>Unit<input type="text" value="${escapeHtml(l.unit||'')}" oninput="finShopDraft.lines[${i}].unit=this.value"></label><label>Qty<input type="text" inputmode="decimal" value="${l.qty!=null?l.qty:''}" oninput="finShopDraft.lines[${i}].qty=finNum(this.value)"></label><label>Rate £<input type="text" inputmode="decimal" data-money value="${l.unit_price!=null?l.unit_price:''}" oninput="finShopDraft.lines[${i}].unit_price=finNum(this.value)"></label></div></div>`).join('')}
    <button class="darkbtn" style="width:100%;margin-top:12px;" onclick="finShopSave()">Add ${d.lines.length} items to the shopping list</button>`;
}
window.finShopSave = async function(){
  const d = finShopDraft; if(!d) return;
  const keep = d.lines.filter(l=>l.keep && String(l.description||'').trim());
  if(!keep.length){ toast('Nothing ticked.'); return; }
  const quote = await dbInsert('fin_quotes', {org_id:ME.org_id, site_id:d.siteId, purpose:'shopping', supplier_id:d.supplier_id||null, supplier_name:d.supplier_name||null, quote_no:d.data.doc_number||null, quote_date:d.data.doc_date||null, file_path:d.path||null, file_name:d.file, lines:keep, net:d.data.net||null, vat:d.data.vat||null, total:d.data.total||null, created_by:ME.id});
  const ex = await dbSelect('fin_shop_items', 'site_id=eq.'+d.siteId+'&select=position&order=position.desc&limit=1');
  let pos = ex[0] ? ex[0].position : 0;
  const rows = keep.map(l=>({id:crypto.randomUUID(), org_id:ME.org_id, site_id:d.siteId, supplier_id:d.supplier_id||null, supplier_name:d.supplier_name||null, code:l.code||null, description:String(l.description).trim().slice(0,300), unit:l.unit||null, qty:l.qty!=null?l.qty:null, quote_id:quote&&quote[0]?quote[0].id:null, position:++pos, active:true, created_by:ME.id}));
  const ins = await sbFetch('/rest/v1/fin_shop_items', {method:'POST', body:JSON.stringify(rows)});
  if(!ins.ok){ toast('Could not save the list — '+(await safeErr(ins))); return; }
  const pr = rows.map((r,i)=>({item_id:r.id, org_id:ME.org_id, rate:keep[i].unit_price!=null?finRound4(keep[i].unit_price):null})).filter(p=>p.rate!=null);
  if(pr.length) await sbFetch('/rest/v1/fin_shop_prices', {method:'POST', body:JSON.stringify(pr)});
  await finPriceBookSave(d.supplier_name, keep, 'quote', d.data.doc_number);
  finShopDraft = null; toast(rows.length+' items added to the shopping list'); render();
};
window.finShopSetRate = async function(itemId, v){
  const n = finNum(v); const rate = (n===null || isNaN(n)) ? null : finRound4(n);
  const res = await sbFetch('/rest/v1/fin_shop_prices?on_conflict=item_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({item_id:itemId, org_id:ME.org_id, rate})});
  toast(res.ok ? 'Rate saved' : 'Could not save the rate');
};
window.finShopToggle = async function(itemId, on){ if(await dbUpdate('fin_shop_items', itemId, {active:!!on})) render(); };
window.finShopAddManual = async function(siteId){
  const desc = String(await customPrompt('Item description') || '').trim(); if(!desc) return;
  const unit = String(await customPrompt('Unit (e.g. nr, m2, roll) — optional') || '').trim();
  const rows = await dbInsert('fin_shop_items', {org_id:ME.org_id, site_id:siteId, description:desc, unit:unit||null, position:9999, active:true, created_by:ME.id});
  if(rows) render();
};

/* ---------- picking from the shopping list (Materials tile, Finance POs) ---------- */
let finShopPick = null; // {id, description, unit, supplier_id, rate}
window.openShopPicker = async function(siteId, mode){
  const [items, prices] = await Promise.all([
    dbSelect('fin_shop_items', 'site_id=eq.'+siteId+'&active=eq.true&order=supplier_name.asc,position.asc'),
    finCanSeeCosts() ? dbSelect('fin_shop_prices', 'org_id=eq.'+ME.org_id) : Promise.resolve([]),
  ]);
  const rate = {}; prices.forEach(p=>rate[p.item_id] = p.rate);
  window.__shopItems = items; window.__shopRates = rate;
  let ov = document.getElementById('shopPickOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'shopPickOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:560px;max-height:calc(100dvh - 40px);overflow-y:auto;">
    <h3>Project shopping list</h3>
    ${items.length ? `<div class="formfield"><input type="text" placeholder="Search" oninput="liveFilter(this.value,'#shopPickList')"></div>
    <div id="shopPickList">${items.map((i,k)=>`<button type="button" class="pmrow finrow" data-lf="${lfText([i.description, i.code, i.supplier_name].join(' '))}" onclick="pickShopItem(${k},'${mode}')">
      <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(i.description)}</span><span class="pmrow-s">${[i.supplier_name, i.code, i.unit?'per '+i.unit:''].filter(Boolean).map(escapeHtml).join(' · ')}</span></span>
      ${rate[i.id]!=null ? `<span class="finval">${finMoney(rate[i.id])}</span>` : ''}</button>`).join('')}<div class="empty lf-empty" style="display:none;">No match.</div></div>`
    : `<p class="stub">There’s no shopping list for this project yet. Finance can add one from a supplier quote (project › Finance › Shopping list).</p>`}
    <button class="geo-modal-cancel" onclick="document.getElementById('shopPickOverlay').style.display='none'">Close</button>
  </div>`;
  ov.style.display = 'flex';
};
window.pickShopItem = function(k, mode){
  const i = (window.__shopItems||[])[k]; if(!i) return;
  finShopPick = {id:i.id, description:i.description, unit:i.unit||'', supplier_id:i.supplier_id||null, rate:(window.__shopRates||{})[i.id]};
  document.getElementById('shopPickOverlay').style.display = 'none';
  if(mode==='po' && typeof finNewPo!=='undefined' && finNewPo){
    const line = {description:i.description, qty:1, unit:i.unit||'', rate:finShopPick.rate!=null?Number(finShopPick.rate):null, amount:0};
    line.amount = finRound(Number(line.qty||0)*Number(line.rate||0));
    const empty = finNewPo.lines.findIndex(l=>!String(l.description||'').trim());
    if(empty>-1) finNewPo.lines[empty] = line; else finNewPo.lines.push(line);
    finNpoPaint(); return;
  }
  const it = document.getElementById('matItem'); if(it){ it.value = i.description; }
  const q = document.getElementById('matQty'); if(q){ q.placeholder = i.unit ? 'Quantity ('+i.unit+')' : 'Quantity'; q.focus(); }
  const tag = document.getElementById('matShopTag'); if(tag) tag.innerHTML = `From the shopping list${i.supplier_name?' · '+escapeHtml(i.supplier_name):''}${finShopPick.rate!=null?' · '+finMoney(finShopPick.rate)+(i.unit?'/'+escapeHtml(i.unit):''):''} <button class="linkbtn" onclick="finShopPick=null;this.parentNode.innerHTML=''">clear</button>`;
};
// Used by addMaterial (760): the picked shopping-list item, if the text wasn't changed.
function finShopPickFor(itemText){
  if(!finShopPick || String(itemText||'').trim()!==String(finShopPick.description).trim()) return null;
  return finShopPick;
}
