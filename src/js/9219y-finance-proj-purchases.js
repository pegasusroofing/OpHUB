/* ============================================================
   OpHUB Finance — a project's Purchases tab laid out like Sales (23 Oct 2026, Andy):
   the Purchases & Plant tiles, then tabs — Purchase Orders · Purchase Invoices · Plant · All —
   each a table with a row per item and the totals bar underneath.
   ============================================================ */
let finPpSub = {};
const FIN_PI_ST = {to_approve:['To approve','warn'], query:['Query','bad'], approved:['Approved','blue'], rejected:['Rejected','grey']};
function finPiStatusPill(i){ if(i.paid_on) return '<span class="finpill ok">Paid</span>'; const s = FIN_PI_ST[i.status] || [i.status||'—','grey']; return `<span class="finpill ${s[1]}">${s[0]}</span>`; }
function finPpHead(title, btns){ return `<div class="finpp-h"><p class="sectiontitle" style="margin:0;">${title}</p><span>${btns}</span></div>`; }
function finPpTable(head, rows, empty){
  if(!rows.length) return `<div class="empty" style="margin:6px 0 0;">${empty}</div>`;
  return `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr>${head.map(([l, num])=>`<th class="${num?'num':''}">${l}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
async function finPpFill(siteId){
  const el = document.getElementById('finPpBody'); if(!el) return;
  const [pos, pinvs, hires, xc] = await Promise.all([
    dbSelect('purchase_orders', 'site_id=eq.'+siteId+'&order=created_at.desc&limit=2000').catch(()=>[]),
    dbSelect('purchase_invoices', 'site_id=eq.'+siteId+'&order=invoice_date.desc&limit=5000').catch(()=>[]),
    dbSelect('fin_plant_hires', 'site_id=eq.'+siteId+'&order=on_hire.desc').catch(()=>[]),
    dbSelect('fin_job_costs', 'site_id=eq.'+siteId+'&order=cost_date.desc&limit=5000').catch(()=>[]),
  ]);
  if(!document.getElementById('finPpBody')) return;
  const live = pinvs.filter(i=>i.status!=='rejected');
  const poBy = {}; pos.forEach(p=>poBy[p.id] = p);
  const k = finPpSub[siteId] || 'invoices';
  const btn = (l, js, dark)=>`<button type="button" class="${dark?'darkbtn':'ghostbtn'}" onclick="${js}">${l}</button>`;
  const cnt = {quotes:0, orders:pos.length, invoices:live.length, plant:hires.length, all:live.length+hires.filter(h=>h.cost_from!=='invoices').length+xc.length};
  const tabs = `<div class="finsubtabs finpurtabs">${[['invoices','Purchase Invoices'],['orders','Purchase Orders'],['quotes','Purchase Quotes'],['plant','Plant'],['all','All']].map(([kk,l])=>`<button type="button" class="${kk===k?'on':''}" onclick="finPpSub['${siteId}']='${kk}';finPpFill('${siteId}')">${l}${cnt[kk]?` <em>${cnt[kk]}</em>`:''}</button>`).join('')}</div>`;
  let body = '';
  if(k==='quotes'){
    body = await finPqPaneHtml(siteId);
  } else if(k==='orders'){
    body = finPpHead('Purchase Orders', btn('+ New PO', `openFinNewPo('${siteId}')`, 1))
      + finPpTable([['PO'],['Supplier'],['Date'],['Value',1],['Invoiced',1],['Left To Invoice',1],['Status']], pos.map(p=>{
        const inv = finPoInvoiced(p, live), left = p.value!=null && p.status==='open' ? Math.max(0, finRound(Number(p.value)-inv)) : null;
        return `<tr class="click" onclick="go('#/site/${siteId}/finance/po/${p.id}')"><td data-l="PO" class="d"><b>${escapeHtml(p.number||'')}</b></td><td data-l="Supplier">${escapeHtml(p.supplier_name||'—')}</td><td data-l="Date">${finDate(String(p.issue_date||p.created_at||'').slice(0,10))}</td><td data-l="Value" class="num">${p.value!=null?finMoney(p.value):'—'}</td><td data-l="Invoiced" class="num">${finMoney(inv)}</td><td data-l="Left To Invoice" class="num">${left!=null?finMoney(left):'—'}</td><td data-l="Status">${finPoPill(p)}</td></tr>`;
      }), 'No purchase orders on this project yet.');
  } else if(k==='invoices'){
    body = finPpHead('Purchase Invoices', btn('+ ▾', `finPpAddMenu(this,'${siteId}')`)+btn('+ Add Invoice', `openPurchaseInvoiceForm('${siteId}')`, 1))
      + finPpTable([['Supplier'],['Invoice No.'],['Date'],['PO'],['Net',1],['VAT',1],['Gross',1],['Status']], live.map(i=>{ const po = poBy[i.po_id];
        return `<tr class="click" onclick="openPurchaseInvoiceView('${siteId}','${i.id}')"><td data-l="Supplier" class="d"><b>${escapeHtml(i.supplier_name||'—')}</b></td><td data-l="Invoice No.">${escapeHtml(i.invoice_no||'—')}</td><td data-l="Date">${finDate(i.invoice_date)}</td><td data-l="PO">${po?escapeHtml(po.number):'<span class="stub" style="margin:0;">No PO</span>'}</td><td data-l="Net" class="num">${finMoney(i.net)}</td><td data-l="VAT" class="num">${finMoney(i.vat)}</td><td data-l="Gross" class="num"><b>${finMoney(i.total)}</b></td><td data-l="Status">${finPiStatusPill(i)}</td></tr>`;
      }).concat(xc.filter(x=>x.ref==='YARD' || /^(yard stock|returned to yard)/i.test(String(x.description||''))).map(x=>`<tr class="click" onclick="${typeof openFinJobCost==='function' ? `openFinJobCost('${siteId}','${x.id}')` : ''}"><td data-l="Supplier" class="d"><b>Yard Stock</b></td><td data-l="Invoice No.">—</td><td data-l="Date">${finDate(x.cost_date)}</td><td data-l="PO">${escapeHtml(String(x.description||'').replace(/^yard stock:\s*/i,''))}</td><td data-l="Net" class="num">${finMoney(x.net)}</td><td data-l="VAT" class="num">—</td><td data-l="Gross" class="num"><b>${finMoney(x.net)}</b></td><td data-l="Status"><span class="finpill blue">Approved</span></td></tr>`)), 'No purchase invoices on this project yet.');
  } else if(k==='plant'){
    body = finPpHead('Plant', btn('+ Add Plant', `openFinPlantForm('${siteId}')`, 1))
      + finPpTable([['Item'],['Supplier'],['Hire Ref'],['On Hire'],['Off Hire'],['Weeks'],['Cost',1],['Status']], hires.map(h=>{ const c = finPlantCost(h);
        return `<tr class="click" onclick="openFinPlantForm('${siteId}','${h.id}')"><td data-l="Item" class="d"><b>${escapeHtml(h.item||'')}</b></td><td data-l="Supplier">${escapeHtml(h.supplier_name||'—')}</td><td data-l="Hire Ref">${escapeHtml(h.hire_ref||'—')}</td><td data-l="On Hire">${h.on_hire?finDate(h.on_hire):'—'}</td><td data-l="Off Hire">${h.off_hire?finDate(h.off_hire):'—'}</td><td data-l="Weeks">${c.weeks!=null?c.weeks:'—'}</td><td data-l="Cost" class="num">${finMoney(c.cost)}</td><td data-l="Status"><span class="finpill ${h.off_hire?'grey':'blue'}">${h.off_hire?'Off Hire':'On Hire'}</span></td></tr>`;
      }), 'No plant on this project yet.');
  } else {
    const rows = [];
    live.forEach(i=>rows.push({d:i.invoice_date, t:'Purchase Invoice', who:i.supplier_name, ref:i.invoice_no, desc:i.description||'', net:Number(i.net||0), js:`openPurchaseInvoiceView('${siteId}','${i.id}')`}));
    hires.filter(h=>h.cost_from!=='invoices').forEach(h=>rows.push({d:h.on_hire, t:'Plant', who:h.supplier_name, ref:h.hire_ref, desc:h.item, net:finPlantCost(h).cost, js:`openFinPlantForm('${siteId}','${h.id}')`}));
    xc.forEach(x=>rows.push({d:x.cost_date, t:finTitleCase(FIN_COST_CATS[x.category]||'Other Cost'), who:x.supplier, ref:x.ref, desc:x.description, net:Number(x.net||0), js:typeof openFinJobCost==='function' ? `openFinJobCost('${siteId}','${x.id}')` : ''}));
    rows.sort((a,b)=>String(b.d||'').localeCompare(String(a.d||'')));
    body = finPpHead('All Spend', '') + finPpTable([['Date'],['Type'],['Supplier'],['Ref'],['Description'],['Net',1]], rows.map(r=>`<tr class="${r.js?'click':''}" ${r.js?`onclick="${r.js}"`:''}><td data-l="Date">${r.d?finDate(r.d):'—'}</td><td data-l="Type">${escapeHtml(r.t)}</td><td data-l="Supplier">${escapeHtml(r.who||'—')}</td><td data-l="Ref">${escapeHtml(r.ref||'—')}</td><td data-l="Description">${escapeHtml(r.desc||'—')}</td><td data-l="Net" class="num">${finMoney(r.net)}</td></tr>`), 'Nothing spent on this project yet.');
  }
  // Small figures at the top, like Sales (Andy, 23 Oct) — tap one to open its list.
  const poVal = finRound(pos.filter(p=>p.status!=='cancelled').reduce((t,p)=>t+Number(p.value||0),0));
  const poLeft = finRound(pos.filter(p=>p.status==='open' && p.value!=null).reduce((t,p)=>t+Math.max(0, Number(p.value)-finPoInvoiced(p, live)),0));
  const piNet = finRound(live.reduce((t,i)=>t+Number(i.net||0),0));
  const plantCost = finRound(hires.filter(h=>h.cost_from!=='invoices').reduce((t,h)=>t+finPlantCost(h).cost,0));
  const other = finRound(xc.reduce((t,x)=>t+Number(x.net||0),0));
  const onHire = hires.filter(h=>!h.off_hire).length;
  const cell = (kk, l, v, sub)=>`<div class="click" onclick="finPpSub['${siteId}']='${kk}';finPpFill('${siteId}')"><span>${l}</span><b>${v}</b><em>${sub}</em></div>`;
  // Hybrid tile (Andy, 23 Oct): Material From Yard, Plant, or both together — whatever the job has.
  const yardRows = xc.filter(x=>x.ref==='YARD' || /^(yard stock|returned to yard)/i.test(String(x.description||'')));
  const yardTot = finRound(yardRows.reduce((t,x)=>t+Number(x.net||0),0));
  const yardPlantCell = yardRows.length && (plantCost || hires.length)
    ? cell('invoices','Yard Materials & Plant', finMoney(finRound(yardTot+plantCost), 0), finMoney(yardTot, 0)+' yard · '+finMoney(plantCost, 0)+' plant')
    : yardRows.length ? cell('invoices','Material From Yard', finMoney(yardTot, 0), yardRows.length+' issue'+(yardRows.length===1?'':'s')+' from the yard')
    : cell('plant','Plant', finMoney(plantCost, 0), onHire+' on hire');
  const tiles = `<div class="fintodate finpp-tiles">${cell('orders','Purchase Orders', finMoney(poVal, 0), pos.length+' order'+(pos.length===1?'':'s')+(poLeft?' · '+finMoney(poLeft, 0)+' left to invoice':''))}${cell('invoices','Purchase Invoices', finMoney(piNet, 0), live.length+' invoice'+(live.length===1?'':'s')+', net')}${yardPlantCell}${cell('all','Total Spend', finMoney(finRound(piNet+plantCost+other), 0), 'excl. VAT')}</div>`;
  el.innerHTML = tiles + tabs + `<div class="card finpp-card">${body}</div>`;
}
window.finPpFill = finPpFill;
(function(){
  const base = finAfterProjectRender;
  finAfterProjectRender = function(){
    const r = base.apply(this, arguments);
    const tab = document.querySelector('.finptab[data-t="purchases"]');
    const siteId = (parseRoute()||[])[1];
    if(tab && siteId && !tab.querySelector('#finPpBody')){
      Array.from(tab.children).forEach(c=>{ if(!/^fin-a-/.test(c.id||'')) c.style.display = 'none'; });
      const box = document.createElement('div'); box.id = 'finPpBody'; tab.appendChild(box);
      finPpFill(siteId);
    }
    return r;
  };
  const st = document.createElement('style');
  st.textContent = `.finpurtabs{margin:0 0 10px;}
.finpp-tiles > div.click{cursor:pointer;} .finpp-tiles > div.click:hover{border-color:var(--brand1);}
.finpurtabs button em{font-style:normal;font-size:11px;font-weight:800;background:#EEF1F5;border-radius:9px;padding:1px 7px;margin-left:4px;color:var(--slate);}
.finpp-h{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.finpp-h > span{display:flex;gap:6px;flex-wrap:wrap;}
.finpp-h .ghostbtn, .finpp-h .darkbtn{width:auto !important;margin:0 !important;padding:6px 12px !important;}`;
  document.head.appendChild(st);
})();
