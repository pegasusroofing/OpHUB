/* ============================================================
   OpHUB Finance — raise a purchase order from Finance
   For Finance-only companies (no Materials tile) and for office orders in
   any company: supplier, priced lines, delivery details → a numbered PO
   (fin_new_po, same <job>-PO-NNN numbering as material orders), a PO PDF,
   and email it to the supplier.
   ============================================================ */
let finNewPo = null;
window.openFinNewPo = async function(siteId){
  const suppliers = await dbSelect('suppliers', 'select=id,name,email&order=name.asc');
  finNewPo = {siteId, suppliers, lines:[{description:'', qty:1, unit:'', rate:null, amount:0}]};
  let ov = document.getElementById('finNpoOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finNpoOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:620px;">
    <h3>New purchase order</h3>
    <div class="formfield"><label class="field-label">Supplier</label>
      <select id="finNpoSup" onchange="finNpoSupPicked(this.value)"><option value="">Choose…</option>${suppliers.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}<option value="__new">+ New supplier…</option></select></div>
    <div id="finNpoNewSup" style="display:none;" class="fingrid2">
      <div class="formfield"><label class="field-label">Supplier name</label><input type="text" id="finNpoSupName"></div>
      <div class="formfield"><label class="field-label">Orders email</label><input type="email" id="finNpoSupEmail"></div>
    </div>
    <p class="sectiontitle" style="margin:10px 0 4px;">Items</p>
    <div id="finNpoLines"></div>
    <button class="ghostbtn" style="width:100%;margin:6px 0 10px;" onclick="finNpoAdd()">+ Add item</button>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Delivery</label><select id="finNpoDel"><option value="delivery">Deliver to site</option><option value="collection">Collection</option></select></div>
      <div class="formfield"><label class="field-label">Required by</label><input type="date" id="finNpoReq"></div>
    </div>
    <div class="formfield"><label class="field-label">Notes for the supplier</label><textarea id="finNpoNote" rows="2" placeholder="e.g. Call 30 minutes before delivery"></textarea></div>
    <div class="finkv big"><span>PO value (excl. VAT)</span><b id="finNpoTot">£0.00</b></div>
    <button class="darkbtn" style="width:100%;" id="finNpoSave" onclick="saveFinNewPo()">Raise PO</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finNpoOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
  finNpoPaint();
};
window.finNpoSupPicked = function(v){ const el = document.getElementById('finNpoNewSup'); if(el) el.style.display = v==='__new' ? '' : 'none'; };
function finNpoPaint(){
  const box = document.getElementById('finNpoLines'); if(!box || !finNewPo) return;
  box.innerHTML = finNewPo.lines.map((l,i)=>`<div class="finitem">
    <div class="finitem-d"><input type="text" placeholder="Description" value="${escapeHtml(l.description)}" oninput="finNpoSet(${i},'description',this.value)" style="width:100%;"></div>
    <div class="finitem-in">
      <label>Qty<input type="text" inputmode="decimal" value="${l.qty!=null?l.qty:''}" oninput="finNpoSet(${i},'qty',this.value)"></label>
      <label>Unit<input type="text" value="${escapeHtml(l.unit||'')}" placeholder="m2, nr" oninput="finNpoSet(${i},'unit',this.value)"></label>
      <label>Rate £<input type="text" inputmode="decimal" value="${l.rate!=null?l.rate:''}" oninput="finNpoSet(${i},'rate',this.value)"></label>
      <b id="finNpoL-${i}">${finMoney(l.amount)}</b>
      ${finNewPo.lines.length>1 ? `<button class="linkbtn" onclick="finNpoDel(${i})">✕</button>` : ''}
    </div></div>`).join('');
  finNpoTotal();
}
function finNpoTotal(){ const el = document.getElementById('finNpoTot'); if(el) el.textContent = finMoney(finNewPo.lines.reduce((t,l)=>t+Number(l.amount||0),0)); }
window.finNpoSet = function(i, k, v){
  const l = finNewPo.lines[i]; if(!l) return;
  if(k==='qty' || k==='rate'){ const n = finNum(v); l[k] = (n===null || isNaN(n)) ? null : n; } else l[k] = v;
  l.amount = finRound(Number(l.qty||0) * Number(l.rate||0));
  const el = document.getElementById('finNpoL-'+i); if(el) el.textContent = finMoney(l.amount);
  finNpoTotal();
};
window.finNpoAdd = function(){ finNewPo.lines.push({description:'', qty:1, unit:'', rate:null, amount:0}); finNpoPaint(); };
window.finNpoDel = function(i){ finNewPo.lines.splice(i,1); finNpoPaint(); };
window.saveFinNewPo = async function(){
  const n = finNewPo; if(!n) return;
  let supId = finVal('finNpoSup'), supName = '';
  if(!supId){ toast('Choose the supplier.'); return; }
  if(supId==='__new'){
    supName = finVal('finNpoSupName'); const email = finVal('finNpoSupEmail');
    if(!supName){ toast('Enter the supplier’s name.'); return; }
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Check the supplier’s email.'); return; }
    const made = await dbInsert('suppliers', {org_id:ME.org_id, name:supName, email:email||null, created_by:ME.id});
    supId = made && made[0] ? made[0].id : null;
  } else {
    const s = n.suppliers.find(x=>x.id===supId); supName = s ? s.name : '';
  }
  const items = n.lines.filter(l=>String(l.description||'').trim()).map(l=>({item:l.description.trim(), qty:l.qty, unit:l.unit||null, rate:l.rate, amount:finRound(l.amount)}));
  if(!items.length){ toast('Add at least one item.'); return; }
  const btn = document.getElementById('finNpoSave'); if(btn){ btn.disabled = true; btn.textContent = 'Raising…'; }
  const res = await sbFetch('/rest/v1/rpc/fin_new_po', {method:'POST', body:JSON.stringify({p_site:n.siteId, p_supplier_id:supId||null, p_supplier_name:supName, p_items:items, p_required:finVal('finNpoReq')||null, p_note:finVal('finNpoNote')||null, p_delivery:finVal('finNpoDel')||'delivery'})});
  if(btn){ btn.disabled = false; btn.textContent = 'Raise PO'; }
  if(!res.ok){ toast('Could not raise the PO — '+(await safeErr(res))); return; }
  const d = await res.json();
  document.getElementById('finNpoOverlay').style.display = 'none';
  finNewPo = null;
  toast('PO '+d.number+' raised');
  go('#/site/'+n.siteId+'/finance/po/'+d.id);
};

/* ---------- PO PDF ---------- */
async function finBuildPoPdf(po, site, st, supplier){
  if(!(await loadLib('PDFLib'))){ toast('Could not load the PDF tool — check your connection.'); return null; }
  try{
    const pdf = await PDFLib.PDFDocument.create();
    const reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, M = 44;
    const INK = PDFLib.rgb(0.07,0.08,0.09), SLATE = PDFLib.rgb(0.36,0.39,0.45), LINE = PDFLib.rgb(0.86,0.88,0.9), WHITE = PDFLib.rgb(1,1,1);
    const BRAND = finHexRgb(ORG && ORG.color_primary, PDFLib.rgb(0.78,0.06,0.18));
    let page = pdf.addPage([W, H]);
    let logo = null;
    if(ORG && ORG.logo_path){ try{ const b = await pdfFetchImageBytes(publicUrl('org-logos', ORG.logo_path)); if(b){ try{ logo = await pdf.embedPng(b); }catch(e){ logo = await pdf.embedJpg(b); } } }catch(e){} }
    const txt = (s, x, y, o)=> page.drawText(String(s==null?'':s), Object.assign({x, y, size:10, font:reg, color:INK}, o||{}));
    const right = (s, xr, y, o)=>{ const f = (o&&o.font)||reg, sz = (o&&o.size)||10; txt(s, xr - f.widthOfTextAtSize(String(s), sz), y, o); };
    const money = v=>Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2});
    page.drawRectangle({x:0, y:H-96, width:W, height:96, color:BRAND});
    let hx = M;
    if(logo){ const d = logo.scale(1), s = 52/Math.max(d.width, d.height); page.drawRectangle({x:M, y:H-76, width:56, height:56, color:WHITE}); page.drawImage(logo, {x:M+2+(52-d.width*s)/2, y:H-74+(52-d.height*s)/2, width:d.width*s, height:d.height*s}); hx = M+70; }
    txt((ORG&&ORG.name)||'', hx, H-48, {font:bold, size:16, color:WHITE});
    right(po.status==='cancelled' ? 'CANCELLED' : 'PURCHASE ORDER', W-M, H-54, {font:bold, size:20, color:WHITE});
    let y = H-130;
    txt('SUPPLIER', M, y, {font:bold, size:8.5, color:SLATE});
    let by = y-15;
    txt(po.supplier_name||'', M, by, {font:bold, size:11}); by -= 14;
    if(supplier && supplier.email){ txt(supplier.email, M, by, {size:9.5, color:SLATE}); by -= 13; }
    by -= 8;
    txt(po.fulfilment==='collection' ? 'COLLECTION' : 'DELIVER TO', M, by, {font:bold, size:8.5, color:SLATE}); by -= 15;
    if(po.fulfilment!=='collection'){
      txt((site&&site.name)||'', M, by, {font:bold, size:10.5}); by -= 13;
      finWrap(site ? (typeof fullSiteAddress==='function' ? fullSiteAddress(site) : [site.address, site.postcode].filter(Boolean).join(', ')) : '', reg, 10, 240).slice(0,4).forEach(l=>{ txt(l, M, by); by -= 13; });
    } else { txt('Supplier’s branch — we will collect', M, by); by -= 13; }
    const det = [['PO number', po.number], ['Date', finDate(String(po.created_at||'').slice(0,10))], ['Job no.', (site&&site.job_number)||'—'], ['Required by', po.required_by ? finDate(po.required_by) : 'Please advise'], ['Ordered by', po.ordered_by_name||'']];
    let dy = y;
    det.forEach(([k,v])=>{ txt(k, 330, dy, {size:9, color:SLATE}); txt(v, 420, dy, {font:bold, size:10}); dy -= 15; });
    y = Math.min(by, dy) - 20;
    const cols = {d:M+8, q:W-M-230, u:W-M-180, r:W-M-90, a:W-M-8};
    page.drawRectangle({x:M, y:y-6, width:W-2*M, height:22, color:PDFLib.rgb(0.95,0.96,0.97)});
    txt('DESCRIPTION', cols.d, y+1, {font:bold, size:8.5, color:SLATE}); right('QTY', cols.q, y+1, {font:bold, size:8.5, color:SLATE}); txt('UNIT', cols.u, y+1, {font:bold, size:8.5, color:SLATE}); right('RATE £', cols.r, y+1, {font:bold, size:8.5, color:SLATE}); right('AMOUNT £', cols.a, y+1, {font:bold, size:8.5, color:SLATE});
    y -= 26;
    for(const it of (po.items||[])){
      const lines = finWrap(it.item||'', reg, 10, cols.q - cols.d - 50);
      if(y - lines.length*13 < 150){ page = pdf.addPage([W, H]); y = H-M; }
      lines.forEach((ln,i)=>txt(ln, cols.d, y-i*13));
      right(it.qty!=null ? String(it.qty) : '', cols.q, y); txt(it.unit||'', cols.u, y);
      if(it.rate!=null) right(money(it.rate), cols.r, y);
      if(it.amount!=null) right(money(it.amount), cols.a, y);
      const last = y - (lines.length-1)*13;
      page.drawLine({start:{x:M, y:last-7}, end:{x:W-M, y:last-7}, thickness:0.6, color:LINE});
      y = last - 22;
    }
    y -= 6;
    if(po.value!=null){ txt('Order total (excl. VAT)', W-M-210, y, {font:bold, size:11}); right(finMoney(po.value), W-M-8, y, {font:bold, size:11}); y -= 22; }
    if(po.note){ txt('NOTES', M, y, {font:bold, size:8.5, color:SLATE}); y -= 14; finWrap(po.note, reg, 10, W-2*M).forEach(l=>{ txt(l, M, y); y -= 13; }); y -= 6; }
    finWrap('Please quote PO '+po.number+' on your delivery note and invoice. Invoices without a PO number, or over the value of this order, may be held.', reg, 9.5, W-2*M).forEach(l=>{ txt(l, M, y, {size:9.5, color:SLATE}); y -= 12; });
    const fy = 90;
    page.drawLine({start:{x:M, y:fy+18}, end:{x:W-M, y:fy+18}, thickness:0.6, color:LINE});
    let cy = fy;
    [st.company_address||'', st.company_reg_no ? 'Company no. '+st.company_reg_no : '', st.company_vat_no ? 'VAT no. '+st.company_vat_no : ''].filter(Boolean).forEach(s=>finWrap(s, reg, 9, W-2*M).forEach(l=>{ txt(l, M, cy, {size:9, color:SLATE}); cy -= 11; }));
    pdf.setTitle('Purchase order '+po.number);
    return await pdf.save();
  }catch(e){ console.error(e); toast('Could not build the PO PDF.'); return null; }
}
async function finStorePoPdf(po){
  const site = SITES.find(s=>s.id===po.site_id);
  const sup = po.supplier_id ? (await dbSelect('suppliers', 'id=eq.'+po.supplier_id+'&select=id,name,email'))[0] : null;
  const bytes = await finBuildPoPdf(po, site, await finLoadSettings(), sup);
  if(!bytes) return null;
  const path = ME.org_id+'/'+po.site_id+'/po/'+String(po.number).replace(/[^a-z0-9\-]+/gi,'_')+'-'+Date.now()+'.pdf';
  const stored = await uploadToStorage('finance-docs', path, new Blob([bytes], {type:'application/pdf'}), 'application/pdf');
  if(!stored) return null;
  await dbUpdate('purchase_orders', po.id, {pdf_path:stored});
  return stored;
}
window.openFinPoPdf = async function(poId){
  const po = (await dbSelect('purchase_orders', 'id=eq.'+poId))[0]; if(!po) return;
  // Always rebuild so the PDF matches any value changes.
  const path = await finStorePoPdf(po); if(!path) return;
  openFinDoc(path, 'PO '+po.number+'.pdf');
};
window.openFinPoEmail = async function(siteId, poId){
  const po = (await dbSelect('purchase_orders', 'id=eq.'+poId))[0]; if(!po) return;
  const sup = po.supplier_id ? (await dbSelect('suppliers', 'id=eq.'+po.supplier_id+'&select=email'))[0] : null;
  let ov = document.getElementById('finMailOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finMailOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>Email PO ${escapeHtml(po.number)}</h3>
    <div class="formfield"><label class="field-label">To</label><input type="text" id="finMailTo" value="${escapeHtml((sup&&sup.email)||'')}" placeholder="orders@supplier.co.uk"></div>
    <label class="finswitch"><input type="checkbox" id="finMailMe" checked> Send me a copy (${escapeHtml(ME.email||'')})</label>
    <div class="formfield"><label class="field-label">Message (optional)</label><textarea id="finMailMsg" rows="3"></textarea></div>
    <button class="darkbtn" style="width:100%;" id="finMailSend" onclick="sendFinPoEmail('${siteId}','${poId}')">Send</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finMailOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.sendFinPoEmail = async function(siteId, poId){
  const to = finVal('finMailTo').split(/[,;\s]+/).map(s=>s.trim()).filter(Boolean);
  if(!to.length || to.some(e=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))){ toast('Check the email address.'); return; }
  const btn = document.getElementById('finMailSend'); const reset = ()=>{ if(btn){ btn.disabled=false; btn.textContent='Send'; } };
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  const po = (await dbSelect('purchase_orders', 'id=eq.'+poId))[0]; if(!po){ reset(); return; }
  const path = await finStorePoPdf(po); if(!path){ reset(); return; }
  let res;
  try{
    res = await sbFetch('/functions/v1/send-finance-email', {method:'POST', timeoutMs:60000, body:JSON.stringify({
      kind:'po', site_id:siteId, storage_path:path, filename:'PO '+po.number+'.pdf', recipients:to,
      cc: document.getElementById('finMailMe').checked && ME.email ? [ME.email] : [],
      reference:po.number, amount: po.value!=null ? finMoney(po.value)+' + VAT' : '', due: po.required_by ? 'Required by '+finDate(po.required_by) : '', message:finVal('finMailMsg'),
    })});
  }catch(e){ toast('Could not reach the server — check your connection.'); reset(); return; }
  const d = await res.json().catch(()=>({}));
  if(!res.ok || d.error){ toast('Email failed — '+String(d.error||res.status).slice(0,140)); reset(); return; }
  await dbUpdate('purchase_orders', poId, {sent_at:new Date().toISOString(), sent_to:to.join(', ')});
  document.getElementById('finMailOverlay').style.display = 'none';
  toast('PO emailed'); render();
};
