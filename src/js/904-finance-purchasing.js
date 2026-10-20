/* ================= OpHUB FINANCE — Phase B: purchase orders + purchase invoices =================
   B1 every material order sent from the Materials tile becomes a numbered
      PO (<job no>-PO-001), via fin_raise_po (works for any PM, not just
      finance users, once "Raise POs on every order" is on in Finance
      settings; until then only finance users' orders get one).
   B2 supplier invoices matched to a PO, with checks: over the PO,
      duplicate invoice number, nothing delivered yet.
   B3 receipts / invoices with no PO (bought on site).
   B4 job cost to date on the job's Finance page. */

/* ---------------- B1: raise the PO when an order is sent ---------------- */
async function finRaisePoForOrder(siteId, matIds, supplier, toMe, fulfil, requiredForDelivery){
  try{
    const res = await sbFetch('/rest/v1/rpc/fin_raise_po', {method:'POST', body:JSON.stringify({
      p_site:siteId, p_material_ids:matIds,
      p_supplier_id: (!toMe && supplier && supplier.id && /^[0-9a-f-]{36}$/i.test(supplier.id)) ? supplier.id : null,
      p_supplier_name: toMe ? 'Emailed to '+(ME.name||'me') : ((supplier && supplier.name) || null),
      p_branch: fulfil && fulfil.branch ? (fulfil.branch.name || null) : null,
      p_required: requiredForDelivery || null, p_fulfilment: (fulfil && fulfil.mode) || null, p_note: (fulfil && fulfil.note) || null,
    })});
    if(!res.ok) return null;
    const d = await res.json();
    return (d && d.id) ? d : null;
  }catch(e){ return null; }
}
window.finRaisePoForOrder = finRaisePoForOrder;

/* ---------------- helpers ---------------- */
const FIN_PO_STATUS = {open:'Open', invoiced:'Invoiced', cancelled:'Cancelled'};
function finPoPill(p){ const c = {open:'blue', invoiced:'ok', cancelled:'grey'}[p.status]||'grey'; return `<span class="finpill ${c}">${FIN_PO_STATUS[p.status]||p.status}</span>`; }
const FIN_PI_STATUS = {to_approve:'To approve', approved:'Approved', query:'Query', rejected:'Rejected'};
function finPiPill(i){ const c = {to_approve:'warn', approved:'ok', query:'bad', rejected:'grey'}[i.status]||'grey'; return `<span class="finpill ${c}">${FIN_PI_STATUS[i.status]||i.status}</span>`; }
function finPoInvoiced(po, pinvs){ return finRound(pinvs.filter(i=>i.po_id===po.id && i.status!=='rejected').reduce((t,i)=>t+Number(i.net||0), 0)); }
// Job cost position (all excl. VAT).
function finJobCost(jf, invs, pos, pinvs, labour, plant, other){
  const contract = Number((jf&&jf.contract_value)||0);
  const invoiced = finRound(invs.filter(i=>!['draft','void'].includes(i.status)).reduce((t,i)=>t+Number(i.net||0), 0));
  const costs = finRound(pinvs.filter(i=>i.status==='approved').reduce((t,i)=>t+Number(i.net||0), 0));
  const waiting = finRound(pinvs.filter(i=>['to_approve','query'].includes(i.status)).reduce((t,i)=>t+Number(i.net||0), 0));
  const committed = finRound(pos.filter(p=>p.status==='open' && p.value!=null).reduce((t,p)=>t+Math.max(0, Number(p.value) - finPoInvoiced(p, pinvs)), 0));
  const unpriced = pos.filter(p=>p.status==='open' && p.value==null).length;
  labour = finRound(labour||0); plant = finRound(plant||0); other = finRound(other||0);
  const spent = finRound(costs + labour + plant + other);
  return {contract, invoiced, costs, waiting, committed, unpriced, labour, plant, other, spent, margin: invoiced ? finRound(invoiced - spent) : null};
}

/* ---------------- cards on the job's Finance page ---------------- */
function finJobCostCardHtml(c, siteId){
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
      <p class="sectiontitle" style="margin:0;">Project cost to date <span class="stub" style="font-style:normal;text-transform:none;letter-spacing:0;">excl. VAT</span></p>
      ${siteId ? `<button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="go('#/site/${siteId}/finance/costs')">All costs ›</button>` : ''}
    </div>
    <div class="fincost">
      <div><span>Contract value</span><b>${finMoney(c.contract, 0)}</b></div>
      <div><span>Invoiced to client</span><b>${finMoney(c.invoiced, 0)}</b></div>
      <div><span>Supplier invoices</span><b>${finMoney(c.costs, 0)}</b>${c.waiting?`<em>+ ${finMoney(c.waiting, 0)} waiting approval</em>`:''}</div>
      <div><span>Materials committed</span><b>${finMoney(c.committed, 0)}</b>${c.unpriced?`<em>${c.unpriced} PO${c.unpriced===1?'':'s'} with no value yet</em>`:''}</div>
      <div><span>Labour</span><b>${finMoney(c.labour, 0)}</b></div>
      <div><span>Plant</span><b>${finMoney(c.plant, 0)}</b></div>
      ${c.other ? `<div><span>Other costs</span><b>${finMoney(c.other, 0)}</b></div>` : ''}
    </div>
    <div class="finkv big" style="margin-top:8px;"><span>Costs to date</span><b>${finMoney(c.spent, 0)}</b></div>
    ${c.margin!=null ? `<div class="finkv"><span>Invoiced less costs</span><b style="color:${c.margin<0?'var(--red)':'var(--ok)'};">${finMoney(c.margin, 0)}</b></div>` : ''}
  </div>`;
}
function finPurchasingCardHtml(siteId, pos, pinvs){
  const toApprove = pinvs.filter(i=>['to_approve','query'].includes(i.status));
  const noPo = pinvs.filter(i=>!i.po_id);
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <p class="sectiontitle" style="margin:0;">Purchase orders</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="ghostbtn" style="padding:6px 10px;width:auto;flex:none;" onclick="go('#/site/${siteId}/finance/shopping')">Shopping list</button>
        <button class="ghostbtn" style="padding:6px 10px;width:auto;flex:none;" onclick="openFinNewPo('${siteId}')">+ New PO</button>
        <button class="ghostbtn" style="padding:6px 10px;width:auto;flex:none;" onclick="openPurchaseInvoiceForm('${siteId}')">+ Supplier invoice</button>
        <button class="ghostbtn" style="padding:6px 10px;width:auto;flex:none;" onclick="openPurchaseInvoiceForm('${siteId}',null,true)">+ Receipt</button>
      </div>
    </div>
    ${toApprove.length ? `<div class="finchecks" style="margin:8px 0 0;"><span>${toApprove.length} supplier invoice${toApprove.length===1?'':'s'} to approve</span></div>` : ''}
    ${pos.length ? pos.map(p=>{ const inv = finPoInvoiced(p, pinvs); return `<button type="button" class="pmrow finrow fininvrow" onclick="go('#/site/${siteId}/finance/po/${p.id}')">
        <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(p.number)} ${finPoPill(p)}</span>
          <span class="pmrow-s">${escapeHtml(p.supplier_name||'Supplier')} · ${finDate(String(p.created_at).slice(0,10))} · ${(p.items||[]).length} item${(p.items||[]).length===1?'':'s'}${inv?' · invoiced '+finMoney(inv):''}</span></span>
        <span class="finval">${p.value!=null ? finMoney(p.value) : '<em>No value</em>'}</span>
      </button>`; }).join('') : `<p class="stub" style="margin:8px 0 0;font-style:normal;">${typeof isFinanceOnly==='function' && isFinanceOnly() ? 'No purchase orders yet. Tap + New PO to raise one.' : 'No purchase orders yet. Each material order sent from the Materials tile gets one, or tap + New PO.'}</p>`}
    ${noPo.length ? `<p class="sectiontitle" style="margin:14px 0 4px;">Bought without a PO</p>${noPo.map(i=>finPiRowHtml(siteId, i)).join('')}` : ''}
  </div>`;
}
function finPiRowHtml(siteId, i){
  return `<button type="button" class="pmrow finrow fininvrow" onclick="openPurchaseInvoiceView('${siteId}','${i.id}')">
    <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(i.supplier_name||'Supplier')} ${finPiPill(i)}</span>
      <span class="pmrow-s">${i.kind==='receipt'?'Receipt':'Invoice '+escapeHtml(i.invoice_no||'')} · ${finDate(i.invoice_date)}${i.query_note?' · '+escapeHtml(i.query_note.slice(0,60)):''}</span></span>
    <span class="finval">${finMoney(i.net)}</span>
  </button>`;
}

/* ---------------- PO page ---------------- */
async function renderFinPo(siteId, poId){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const [rows, pinvs] = await Promise.all([dbSelect('purchase_orders', 'id=eq.'+poId), dbSelect('purchase_invoices', 'po_id=eq.'+poId+'&order=invoice_date.asc')]);
  const po = rows[0];
  const mats = po && (po.material_ids||[]).length ? await dbSelect('materials', 'id=in.('+po.material_ids.join(',')+')&select=id,item,qty,grn,status,cancel_reason') : [];
  if(__gen !== RENDER_GEN) return;
  if(!po || !site){ toast('PO not found.'); go(`#/site/${siteId}/finance`); return; }
  const inv = finPoInvoiced(po, pinvs);
  const matBy = {}; mats.forEach(m=>{ matBy[m.id] = m; });
  document.getElementById('app').innerHTML = shell(`
    <div class="card finhead">
      <div><div class="finhead-l">PO</div><div class="finhead-v">${escapeHtml(po.number)} ${finPoPill(po)}</div></div>
      <div><div class="finhead-l">Supplier</div><div class="finhead-v">${escapeHtml(po.supplier_name||'—')}</div></div>
      <div><div class="finhead-l">PO value</div><div class="finhead-v">${po.value!=null?finMoney(po.value):'—'}</div></div>
      <div><div class="finhead-l">Invoiced</div><div class="finhead-v" style="${po.value!=null && inv>Number(po.value)?'color:var(--red);':''}">${finMoney(inv)}</div></div>
    </div>
    <div class="card">
      <div class="finkv"><span>Ordered</span><b>${finDate(String(po.created_at).slice(0,10))} by ${escapeHtml(po.ordered_by_name||'—')}</b></div>
      <div class="finkv"><span>${po.fulfilment==='collection'?'Collection':'Required for delivery'}</span><b>${finDate(po.required_by)}</b></div>
      ${po.supplier_branch ? `<div class="finkv"><span>Branch</span><b>${escapeHtml(po.supplier_branch)}</b></div>` : ''}
      ${po.note ? `<div class="finkv"><span>Note</span><b style="white-space:normal;">${escapeHtml(po.note)}</b></div>` : ''}
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Items</p>
      ${(po.items||[]).map(it=>{ if(!it.material_id) return `<div class="finkv"><span>${escapeHtml(it.item)}${it.qty!=null?' · '+escapeHtml(String(it.qty))+(it.unit?' '+escapeHtml(it.unit):''):''}${it.rate!=null?' × '+finMoney(it.rate):''}</span><b>${it.amount!=null?finMoney(it.amount):''}</b></div>`; const m = matBy[it.material_id]; const got = m && m.grn; return `<div class="finkv"><span>${escapeHtml(it.item)} · qty ${escapeHtml(String(it.qty||'1'))}${it.rate!=null?` × ${finMoney(it.rate)}${it.amount!=null?' = '+finMoney(it.amount):''} <em class="finrate-src">${{list:'shopping list',book:'price book — estimate',quote:'quote',invoice:'invoice'}[it.rate_source]||''}</em>`:''}</span><b>${!m ? '<span class="finpill grey">Removed</span>' : got ? (got.ok===false ? '<span class="finpill bad">Received — problem</span>' : '<span class="finpill ok">Received</span>') : '<span class="finpill grey">Not received yet</span>'}</b></div>`; }).join('')}
    </div>
    ${po.status!=='cancelled' ? `<div class="card">
      <div class="formfield" style="margin:0;"><label class="field-label">PO value (£, excl. VAT)</label>
        <div class="row-gap"><input type="text" inputmode="decimal" id="finPoValue" value="${po.value!=null?escapeHtml(String(po.value)):''}" placeholder="From the supplier’s quote or price list" style="flex:1;"><button class="darkbtn" style="width:auto;flex:none;" onclick="saveFinPoValue('${po.id}')">Save</button></div>
      </div>
      <p class="stub" style="margin:6px 0 0;font-style:normal;">${po.value_estimated && po.value!=null ? '<b style="color:var(--warn);">Estimate</b> — some items are priced from the price book or not priced yet. ' : ''}${po.source==='finance' ? 'Set from the priced items; change it if the supplier’s price changes.' : 'Priced from the shopping list or price book where possible; upload the supplier’s quote to price it properly, or the invoice will price it when it arrives.'} Invoices over this value are flagged.</p>
      <label class="ghostbtn" style="width:100%;margin-top:10px;cursor:pointer;">Price from a supplier quote (PDF, photo or Excel)<input type="file" accept=".pdf,image/*,.xlsx,.xls,.csv" style="display:none;" onchange="finPoFromQuote('${siteId}','${po.id}',this)"></label>
    </div>` : ''}
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <p class="sectiontitle" style="margin:0;">Supplier invoices</p>
        ${po.status!=='cancelled' ? `<button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="openPurchaseInvoiceForm('${siteId}','${po.id}')">+ Add invoice</button>` : ''}
      </div>
      ${pinvs.length ? pinvs.map(i=>finPiRowHtml(siteId, i)).join('') : `<p class="stub" style="margin:8px 0 0;font-style:normal;">None yet.</p>`}
    </div>
    <div class="row-gap" style="flex-wrap:wrap;margin-bottom:8px;">
      <button class="darkbtn" style="flex:1;min-width:140px;" onclick="openFinPoPdf('${po.id}')">PO PDF</button>
      ${po.status!=='cancelled' && po.source==='finance' ? `<button class="darkbtn" style="flex:1;min-width:140px;" onclick="openFinPoEmail('${siteId}','${po.id}')">${po.sent_at?'Email again':'Email to supplier'}</button>` : ''}
    </div>
    ${po.sent_at ? `<p class="stub" style="margin:0 0 8px;font-style:normal;">Emailed ${finDate(po.sent_at.slice(0,10))} to ${escapeHtml(po.sent_to||'')}</p>` : ''}
    <div class="row-gap" style="flex-wrap:wrap;">
      ${po.status==='open' ? `<button class="ghostbtn" style="flex:1;" onclick="setFinPoStatus('${po.id}','invoiced')">Mark fully invoiced</button><button class="ghostbtn" style="flex:1;color:var(--red);" onclick="setFinPoStatus('${po.id}','cancelled')">Cancel PO</button>` : `<button class="ghostbtn" style="flex:1;" onclick="setFinPoStatus('${po.id}','open')">Reopen PO</button>`}
    </div>
  `, {title:po.number, subtitle:site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
}
window.saveFinPoValue = async function(poId){
  const v = finNum(finVal('finPoValue'));
  if(v!==null && (isNaN(v) || v<0)){ toast('Enter the value as a number.'); return; }
  const r = await dbUpdate('purchase_orders', poId, {value: v===null ? null : finRound(v)});
  if(r){ toast('PO value saved'); render(); }
};
window.setFinPoStatus = async function(poId, status){
  const btn = event && event.target;
  if(status==='cancelled' && btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to cancel'; return; }
  const r = await dbUpdate('purchase_orders', poId, {status});
  if(r){ toast(status==='open' ? 'PO reopened' : status==='invoiced' ? 'PO marked fully invoiced' : 'PO cancelled'); render(); }
};

/* ---------------- B2/B3: add a supplier invoice or receipt ---------------- */
let finPiFile = null;
window.openPurchaseInvoiceForm = async function(siteId, poId, receipt){
  const [pos, suppliers] = await Promise.all([
    dbSelect('purchase_orders', 'site_id=eq.'+siteId+'&status=neq.cancelled&order=seq.desc&select=id,number,supplier_name,supplier_id,value,status'),
    dbSelect('suppliers', 'select=id,name&order=name.asc'),
  ]);
  finPiFile = null;
  const po = poId ? pos.find(p=>p.id===poId) : null;
  let ov = document.getElementById('finPiOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPiOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${receipt ? 'Add a receipt (no PO)' : 'Add supplier invoice'}</h3>
    ${receipt ? `<p class="stub" style="margin:0 0 10px;font-style:normal;">For materials bought on site without a PO. It still counts against this project.</p>` : `
    <div class="formfield"><label class="field-label">Purchase order</label>
      <select id="finPiPo" onchange="finPiPoPicked(this.value)"><option value="">No PO</option>${pos.map(p=>`<option value="${p.id}" ${po&&po.id===p.id?'selected':''}>${escapeHtml(p.number)} · ${escapeHtml(p.supplier_name||'')}</option>`).join('')}</select>
    </div>`}
    <div class="formfield"><label class="field-label">Supplier</label><input type="text" id="finPiSupplier" list="finPiSupplierList" value="${escapeHtml(po?po.supplier_name||'':'')}" placeholder="Supplier or shop"><datalist id="finPiSupplierList">${suppliers.map(s=>`<option value="${escapeHtml(s.name)}">`).join('')}</datalist></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">${receipt?'Receipt / ref no.':'Invoice number'}</label><input type="text" id="finPiNo"></div>
      <div class="formfield"><label class="field-label">Date</label><input type="date" id="finPiDate" value="${finToday()}"></div>
      <div class="formfield"><label class="field-label">Due date (blank = 30 days)</label><input type="date" id="finPiDue"></div>
      <div class="formfield"><label class="field-label">Net (£)</label><input type="text" inputmode="decimal" id="finPiNet" oninput="finPiCalc('net')"></div>
      <div class="formfield"><label class="field-label">VAT (£)</label><input type="text" inputmode="decimal" id="finPiVat" oninput="finPiCalc('vat')"></div>
    </div>
    <div class="formfield"><label class="field-label">Total (£)</label><input type="text" inputmode="decimal" id="finPiTotal" oninput="finPiCalc('total')"></div>
    <div class="formfield"><label class="field-label">What it’s for (optional)</label><input type="text" id="finPiDesc" placeholder="e.g. battens, fixings"></div>
    <div class="formfield"><label class="field-label">Cost type</label><select id="finPiCat">${Object.keys(FIN_COST_CATS).filter(k=>k!=='labour').map(k=>`<option value="${k}">${FIN_COST_CATS[k]}</option>`).join('')}</select></div>
    <div class="formfield"><label class="field-label">${receipt?'Photo of the receipt':'Copy of the invoice'} (optional)</label><input type="file" accept="application/pdf,image/*" ${receipt?'capture="environment"':''} onchange="finPiFile=this.files[0]||null"></div>
    <div id="finPiWarn"></div>
    <button class="darkbtn" style="width:100%;" id="finPiSave" onclick="savePurchaseInvoice('${siteId}', ${receipt?'true':'false'})">Save</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finPiOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
  window.__finPiPos = pos;
};
window.finPiPoPicked = function(id){ const p = (window.__finPiPos||[]).find(x=>x.id===id); const s = document.getElementById('finPiSupplier'); if(p && s && !s.value) s.value = p.supplier_name||''; };
let finPiLast = 'net';
window.finPiCalc = function(which){
  finPiLast = which;
  const n = finNum(finVal('finPiNet')), v = finNum(finVal('finPiVat')), t = finNum(finVal('finPiTotal'));
  const set = (id, x)=>{ const el = document.getElementById(id); if(el) el.value = x; };
  if(which==='net' && n!==null && !isNaN(n)){ const vat = finRound(n*0.2); set('finPiVat', vat); set('finPiTotal', finRound(n+vat)); }
  else if(which==='vat' && n!==null && !isNaN(n) && v!==null && !isNaN(v)){ set('finPiTotal', finRound(n+v)); }
  else if(which==='total' && t!==null && !isNaN(t) && (n===null || isNaN(n))){ const net = finRound(t/1.2); set('finPiNet', net); set('finPiVat', finRound(t-net)); }
};
window.savePurchaseInvoice = async function(siteId, receipt){
  const poId = receipt ? '' : finVal('finPiPo');
  const supplier = finVal('finPiSupplier'), no = finVal('finPiNo');
  const net = finNum(finVal('finPiNet')), vat = finNum(finVal('finPiVat'))||0, total = finNum(finVal('finPiTotal'));
  if(!supplier){ toast('Enter the supplier.'); return; }
  if(!receipt && !no){ toast('Enter the invoice number.'); return; }
  if(net===null || isNaN(net)){ toast('Enter the net amount.'); return; }
  const warnEl = document.getElementById('finPiWarn');
  const btn = document.getElementById('finPiSave');
  // Duplicate: same supplier + invoice number anywhere in the company.
  if(no && !(btn && btn.dataset.dupOk==='1')){
    const dup = await dbSelect('purchase_invoices', 'invoice_no=eq.'+encodeURIComponent(no)+'&select=id,supplier_name,site_id,invoice_date');
    const same = dup.filter(d=>String(d.supplier_name||'').trim().toLowerCase()===supplier.toLowerCase());
    if(same.length){ const s = SITES.find(x=>x.id===same[0].site_id); if(warnEl) warnEl.innerHTML = `<p class="stub" style="margin:0 0 8px;font-style:normal;color:var(--red);"><b>Possible duplicate:</b> ${escapeHtml(supplier)} invoice ${escapeHtml(no)} is already on ${escapeHtml(s?s.name:'another project')}. Tap Save again to add it anyway.</p>`; if(btn) btn.dataset.dupOk='1'; return; }
  }
  const flags = [];
  let po = null;
  if(poId){
    po = (await dbSelect('purchase_orders', 'id=eq.'+poId))[0];
    if(po){
      const others = await dbSelect('purchase_invoices', 'po_id=eq.'+poId+'&status=neq.rejected&select=net');
      const sofar = others.reduce((t,i)=>t+Number(i.net||0), 0) + net;
      if(po.value!=null && sofar > Number(po.value)+0.005) flags.push(finMoney(sofar-Number(po.value))+' over the PO value of '+finMoney(po.value));
      const mats = (po.material_ids||[]).length ? await dbSelect('materials', 'id=in.('+po.material_ids.join(',')+')&select=grn') : [];
      if(mats.length && !mats.some(m=>m.grn)) flags.push('nothing on this PO has been marked received yet');
      if(mats.some(m=>m.grn && m.grn.ok===false)) flags.push('a delivery on this PO was marked with a problem');
    }
  }
  if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const row = {org_id:ME.org_id, site_id:siteId, po_id:poId||null, no_po:!poId, kind:receipt?'receipt':'invoice', supplier_id:po?po.supplier_id:null, supplier_name:supplier,
    invoice_no:no||null, invoice_date:finVal('finPiDate')||finToday(), net:finRound(net), vat:finRound(vat), total:total!==null&&!isNaN(total)?finRound(total):finRound(net+vat),
    due_date:finVal('finPiDue')||null, description:finVal('finPiDesc')||null, cost_code:finVal('finPiCat')||'materials', status: flags.length ? 'query' : 'to_approve', query_note: flags.length ? flags.join('; ') : null, created_by:ME.id};
  if(finPiFile){
    const safe = finPiFile.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80);
    const stored = await uploadToStorage('finance-docs', ME.org_id+'/'+siteId+'/purchase/'+uid()+'-'+safe, finPiFile, finPiFile.type||'application/octet-stream');
    if(stored){ row.file_path = stored; row.file_name = finPiFile.name; }
  }
  const ins = await dbInsert('purchase_invoices', row);
  if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
  if(!ins) return;
  document.getElementById('finPiOverlay').style.display = 'none';
  toast(flags.length ? 'Saved and flagged: '+flags[0] : 'Saved — waiting for approval');
  render();
  // Read the invoice lines in the background and check them against the PO (915).
  if(row.file_path && ins[0] && typeof finCheckInvoiceLines==='function') finCheckInvoiceLines(ins[0].id).then(r=>{ if(r && r.notes.length){ toast('Invoice lines read — '+r.notes.length+' difference'+(r.notes.length===1?'':'s')+' with the PO'); render(); } });
};

/* ---------------- view / approve a supplier invoice ---------------- */
window.openPurchaseInvoiceView = async function(siteId, id){
  if(!FIN_SETTINGS) await finLoadSettings();
  const i = (await dbSelect('purchase_invoices', 'id=eq.'+id))[0]; if(!i) return;
  const po = i.po_id ? (await dbSelect('purchase_orders', 'id=eq.'+i.po_id+'&select=number'))[0] : null;
  let ov = document.getElementById('finPiOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPiOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${escapeHtml(i.supplier_name||'Supplier')} ${finPiPill(i)}</h3>
    ${i.query_note ? `<p class="stub" style="margin:0 0 10px;font-style:normal;color:var(--red);"><b>Check:</b> ${escapeHtml(i.query_note)}</p>` : ''}
    <div class="finkv"><span>${i.kind==='receipt'?'Receipt':'Invoice'} no.</span><b>${escapeHtml(i.invoice_no||'—')}</b></div>
    <div class="finkv"><span>Date</span><b>${finDate(i.invoice_date)}</b></div>
    <div class="finkv"><span>PO</span><b>${po?escapeHtml(po.number):'No PO'}</b></div>
    <div class="finkv"><span>Cost type</span><b><select onchange="setFinPiCostCode('${i.id}', this.value)" style="width:auto;padding:4px 8px;">${Object.keys(FIN_COST_CATS).filter(k=>k!=='labour').map(k=>`<option value="${k}" ${(i.cost_code||'materials')===k?'selected':''}>${FIN_COST_CATS[k]}</option>`).join('')}</select></b></div>
    ${i.description?`<div class="finkv"><span>For</span><b style="white-space:normal;">${escapeHtml(i.description)}</b></div>`:''}
    <div class="finkv"><span>Net</span><b>${finMoney(i.net)}</b></div>
    <div class="finkv"><span>VAT</span><b>${finMoney(i.vat)}</b></div>
    <div class="finkv big"><span>Total</span><b>${finMoney(i.total)}</b></div>
    ${typeof finPiLinesHtml==='function' ? finPiLinesHtml(i) : ''}
    ${i.file_path ? `<button class="ghostbtn" style="width:100%;margin:8px 0;" onclick="openFinDoc('${jsAttr(i.file_path)}','${jsAttr(i.file_name||'')}')">View ${i.kind==='receipt'?'receipt':'invoice'}</button>` : ''}
    ${i.status!=='approved' ? `<button class="darkbtn" style="width:100%;margin-top:8px;" onclick="setPurchaseInvoiceStatus('${i.id}','approved')">✓ Approve</button>` : `<p class="stub" style="margin:8px 0 0;font-style:normal;color:var(--ok);">Approved ${i.approved_at?finDate(i.approved_at.slice(0,10)):''}</p>`}
    ${i.status==='approved' ? (i.paid_on ? `<p class="stub" style="margin:8px 0 0;color:var(--ok);">Paid ${finDate(i.paid_on)} <button class="linkbtn" onclick="setFinPiPaid('${i.id}', null)">undo</button></p>` : `<div class="finkv"><span>Due</span><b>${finDate(i.due_date || finAddDays(i.invoice_date, 30))}</b></div><button class="ghostbtn" style="width:100%;margin-top:8px;" onclick="setFinPiPaid('${i.id}', finToday())">Mark paid today</button>`) : ''}
    ${typeof finXeroRowHtml==='function' ? finXeroRowHtml('bill', i) : ''}
    <div class="row-gap" style="margin-top:8px;">
      ${i.status!=='query' ? `<button class="ghostbtn" style="flex:1;" onclick="queryPurchaseInvoice('${i.id}')">Query</button>` : ''}
      ${i.status!=='rejected' ? `<button class="ghostbtn" style="flex:1;color:var(--red);" onclick="setPurchaseInvoiceStatus('${i.id}','rejected')">Reject</button>` : ''}
    </div>
    <button class="geo-modal-cancel" onclick="document.getElementById('finPiOverlay').style.display='none'">Close</button>
  </div>`;
  ov.style.display = 'flex';
};
window.setFinPiPaid = async function(id, date){
  const r = await dbUpdate('purchase_invoices', id, {paid_on:date});
  if(!r) return;
  document.getElementById('finPiOverlay').style.display = 'none';
  toast(date ? 'Marked paid' : 'Paid date removed'); render();
};
window.setPurchaseInvoiceStatus = async function(id, status){
  const patch = {status};
  if(status==='approved'){ patch.approved_by = ME.id; patch.approved_at = new Date().toISOString(); }
  const r = await dbUpdate('purchase_invoices', id, patch);
  if(!r) return;
  document.getElementById('finPiOverlay').style.display = 'none';
  toast(status==='approved' ? 'Approved' : status==='rejected' ? 'Rejected' : 'Updated'); render();
  if(status==='approved' && typeof finXeroAuto==='function') finXeroAuto('bill', id);
};
window.queryPurchaseInvoice = function(id){
  const card = document.querySelector('#finPiOverlay .geo-modal-card'); if(!card) return;
  card.insertAdjacentHTML('beforeend', `<div class="formfield" style="margin-top:10px;"><label class="field-label">What needs checking?</label><input type="text" id="finPiQuery" placeholder="e.g. 2 packs short, price higher than quote"></div><button class="darkbtn" style="width:100%;" onclick="savePurchaseInvoiceQuery('${id}')">Save query</button>`);
};
window.savePurchaseInvoiceQuery = async function(id){
  const r = await dbUpdate('purchase_invoices', id, {status:'query', query_note:finVal('finPiQuery')||'Query'});
  if(!r) return;
  document.getElementById('finPiOverlay').style.display = 'none'; toast('Marked as query'); render();
};
