/* ============================================================
   OpHUB Finance — a project's Purchases tab laid out like Sales (23 Oct 2026, Andy):
   the Purchases & Plant tiles, then tabs — Purchase Orders · Purchase Invoices · Plant · All —
   each a table with a row per item and the totals bar underneath.
   ============================================================ */
let finPpSub = {};
const FIN_PI_ST = {to_approve:['To approve','warn'], query:['Query','bad'], approved:['Approved','blue'], rejected:['Rejected','grey']};
function finPiStatusPill(i){ if(i.paid_on) return '<span class="finpill ok">Paid</span>'; const s = FIN_PI_ST[i.status] || [i.status||'—','grey']; return `<span class="finpill ${s[1]}">${s[0]}</span>`; }
function finPpHead(title, btns){ return `<div class="finpp-h"><p class="sectiontitle" style="margin:0;">${title}</p><span>${btns}</span></div>`; }
function finPpTable(head, rows, empty, cls){
  if(!rows.length) return `<div class="empty" style="margin:6px 0 0;">${empty}</div>`;
  return `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl${cls ? ' '+cls : ''}"><thead><tr>${head.map(([l, num])=>`<th class="${num?'num':''}">${l}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
// The line items on a supplier invoice: description, "qty unit × £rate", and the line's amount.
function finPiLines(i){
  const ls = Array.isArray(i && i.lines) ? i.lines : [];
  return ls.filter(l=>l && (l.description || l.rate!=null || l.qty!=null)).map(l=>{
    const q = l.qty!=null && l.qty!=='' ? Number(l.qty) : null, r = l.rate!=null && l.rate!=='' ? Number(l.rate) : null;
    const amt = r==null ? null : finRound((q==null || isNaN(q) ? 1 : q) * r);
    const qtxt = q!=null && !isNaN(q) && r!=null ? `${q}${l.unit ? ' '+l.unit : ''} × ${finMoney(r)}` : '';
    return {d: String(l.description||'Item'), q: qtxt, amt};
  });
}
function finShortDate(iso){ if(!iso) return '—'; const d = String(iso).slice(0,10).split('-'); return d.length===3 ? d[2]+'/'+d[1]+'/'+d[0].slice(2) : '—'; }
let finPiOpen = {};
window.finPiToggle = function(siteId, id){
  const o = finPiOpen[siteId] || (finPiOpen[siteId] = {}); o[id] = !o[id];
  document.querySelectorAll('#app tr.finpi-row[data-pi="'+id+'"]').forEach(tr=>{ tr.classList.toggle('finpi-open', o[id]); const b = tr.querySelector('.finpi-tg'); if(b) b.setAttribute('aria-expanded', o[id]); });
  document.querySelectorAll('#app tr.finpi-line[data-pof="'+id+'"]').forEach(tr=>tr.classList.toggle('finpi-shut', !o[id]));
  finPiAllBtn();
};
window.finPiAll = function(siteId, on){
  const o = finPiOpen[siteId] || (finPiOpen[siteId] = {});
  document.querySelectorAll('#app tr.finpi-row[data-pi]').forEach(tr=>{ if(!tr.querySelector('.finpi-tg')) return; const id = tr.dataset.pi; o[id] = on;
    tr.classList.toggle('finpi-open', on); tr.querySelector('.finpi-tg').setAttribute('aria-expanded', on); });
  document.querySelectorAll('#app tr.finpi-line').forEach(tr=>tr.classList.toggle('finpi-shut', !on));
  finPiAllBtn();
};
function finPiAllBtn(){
  const b = Array.from(document.querySelectorAll('#app .finpp-h button')).find(x=>/^(Expand|Collapse) all$/.test(x.textContent.trim())); if(!b) return;
  const tg = Array.from(document.querySelectorAll('#app tr.finpi-row .finpi-tg'));
  const allOpen = tg.length && tg.every(x=>x.getAttribute('aria-expanded')==='true');
  const sid = (parseRoute()||[])[1];
  b.textContent = allOpen ? 'Collapse all' : 'Expand all'; b.setAttribute('onclick', `finPiAll('${sid}',${allOpen?'false':'true'})`);
}
async function finPpFill(siteId){
  const el = document.getElementById('finPpBody'); if(!el) return;
  const [pos, pinvs, hires, xcAll] = await Promise.all([
    finSelectAll('purchase_orders', 'site_id=eq.'+siteId+'&order=created_at.desc').catch(()=>[]),
    finSelectAll('purchase_invoices', 'site_id=eq.'+siteId+'&order=invoice_date.desc').catch(()=>[]),
    dbSelect('fin_plant_hires', 'site_id=eq.'+siteId+'&order=on_hire.desc').catch(()=>[]),
    finSelectAll('fin_job_costs', 'site_id=eq.'+siteId+'&order=cost_date.desc').catch(()=>[]),
  ]);
  if(!document.getElementById('finPpBody')) return;
  // FB-25: this tab is purchases only — labour and subcontract costs entered by hand live on their
  // own tab, so leave them out here (same as the Purchases card in 9219x).
  const xc = xcAll.filter(x=>!['labour','subcontract'].includes(x.category));
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
    // Andy 26 Oct: no PO column (invoices come in after the work); an Item column between Date and Net;
    // each invoice opens to show its line items; the filters search the items too; Expand all.
    const open = finPiOpen[siteId] || (finPiOpen[siteId] = {});
    const rowsH = [];
    live.forEach(i=>{
      const ls = finPiLines(i);
      const many = ls.length > 1, isOpen = many && !!open[i.id];
      const itemTxt = ls.length===1 ? ls[0].d : ls.length ? ls.length+' items' : (i.description || '—');
      const all = ls.map(l=>l.d).join(' · ');
      rowsH.push(`<tr class="click finpi-row${isOpen?' finpi-open':''}" data-pi="${i.id}" onclick="openPurchaseInvoiceView('${siteId}','${i.id}')"><td data-l="Supplier" class="d"><b>${escapeHtml(i.supplier_name||'—')}</b></td><td data-l="Invoice No.">${escapeHtml(i.invoice_no||'—')}</td><td data-l="Date">${finShortDate(i.invoice_date)}</td><td data-l="Item" class="finpi-item">${many ? `<button type="button" class="finpi-tg" aria-expanded="${isOpen}" onclick="event.stopPropagation();finPiToggle('${siteId}','${i.id}')"><i></i>${escapeHtml(itemTxt)}</button>` : `<span class="finpi-one" title="${escapeHtml(itemTxt)}">${escapeHtml(itemTxt)}</span>`}${many ? `<span class="finpi-all">${escapeHtml(all)}</span>` : ''}</td><td data-l="Net" class="num">${finMoney(i.net)}</td><td data-l="VAT" class="num">${finMoney(i.vat)}</td><td data-l="Gross" class="num"><b>${finMoney(i.total)}</b></td><td data-l="Status">${finPiStatusPill(i)}</td></tr>`);
      if(many) ls.forEach(l=>rowsH.push(`<tr class="finpi-line${isOpen?'':' finpi-shut'}" data-pof="${i.id}"><td data-l="Supplier"></td><td data-l="Invoice No."></td><td data-l="Date"></td><td data-l="Item" class="finpi-item"><span class="finpi-ld">${escapeHtml(l.d)}</span>${l.q ? `<em>${escapeHtml(l.q)}</em>` : ''}</td><td data-l="Net" class="num">${l.amt!=null ? finMoney(l.amt) : '—'}</td><td data-l="VAT"></td><td data-l="Gross"></td><td data-l="Status"></td></tr>`));
    });
    xc.filter(x=>x.ref==='YARD' || /^(yard stock|returned to yard)/i.test(String(x.description||''))).forEach(x=>rowsH.push(`<tr class="click finpi-row" onclick="${typeof openFinJobCost==='function' ? `openFinJobCost('${siteId}','${x.id}')` : ''}"><td data-l="Supplier" class="d"><b>Yard Stock</b></td><td data-l="Invoice No.">—</td><td data-l="Date">${finShortDate(x.cost_date)}</td><td data-l="Item" class="finpi-item"><span class="finpi-one">${escapeHtml(String(x.description||'').replace(/^yard stock:\s*/i,'')||'—')}</span></td><td data-l="Net" class="num">${finMoney(x.net)}</td><td data-l="VAT" class="num">—</td><td data-l="Gross" class="num"><b>${finMoney(x.net)}</b></td><td data-l="Status"><span class="finpill blue">Approved</span></td></tr>`));
    const anyMany = live.some(i=>finPiLines(i).length > 1);
    const allOpen = anyMany && live.filter(i=>finPiLines(i).length > 1).every(i=>open[i.id]);
    body = finPpHead('Purchase Invoices', (anyMany ? btn(allOpen ? 'Collapse all' : 'Expand all', `finPiAll('${siteId}',${allOpen?'false':'true'})`) : '')+btn('+ ▾', `finPpAddMenu(this,'${siteId}')`)+btn('+ Add Invoice', `openPurchaseInvoiceForm('${siteId}')`, 1))
      + finPpTable([['Supplier'],['Invoice No.'],['Date'],['Item'],['Net',1],['VAT',1],['Gross',1],['Status']], rowsH, 'No purchase invoices on this project yet.', 'finpp-pitbl');
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
.finpp-h .ghostbtn, .finpp-h .darkbtn{width:auto !important;margin:0 !important;padding:6px 12px !important;}
/* Purchase Invoices table (Andy, 25–26 Oct): short rows, text centred under the column titles,
   an Item column that opens to show the invoice's lines. */
.finpp-pitbl .finpi-all{display:none;}
.finpp-pitbl tr.finpi-line.finpi-shut{display:none !important;}
.finpp-pitbl .finpi-tg{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-weight:700;color:var(--ink);border-radius:6px;padding:1px 6px 1px 2px;}
.finpp-pitbl .finpi-tg:hover{background:rgba(16,24,40,.06);}
.finpp-pitbl .finpi-tg i{width:6px;height:6px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);opacity:.6;transition:transform .15s;margin-right:2px;}
.finpp-pitbl tr.finpi-open .finpi-tg i{transform:rotate(45deg);margin-top:-3px;}
.finpp-pitbl tr.finpi-line td{background:rgba(16,24,40,.025);font-size:12.5px;}
.finpp-pitbl tr.finpi-line td.finpi-item{padding-left:26px !important;}
.finpp-pitbl tr.finpi-line .finpi-ld{display:block;}
.finpp-pitbl tr.finpi-line em{display:block;font-style:normal;font-size:11px;color:var(--slate);}
.finpp-pitbl .finpi-one{display:inline-block;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;}
html.desk .finreptbl-wrap table.finpp-pitbl tbody td{padding-top:5px !important;padding-bottom:5px !important;line-height:1.3;}
html.desk .finreptbl-wrap table.finpp-pitbl thead tr:first-child th{padding-top:7px !important;padding-bottom:7px !important;}
html.desk .finreptbl-wrap table.finpp-pitbl th, html.desk .finreptbl-wrap table.finpp-pitbl td{text-align:center !important;}
html.desk .finreptbl-wrap table.finpp-pitbl th:nth-child(4), html.desk .finreptbl-wrap table.finpp-pitbl td.finpi-item{text-align:left !important;}
html.desk .finreptbl-wrap table.finpp-pitbl thead tr:first-child th:nth-child(4){width:30%;}
html.desk .finreptbl-wrap table.finpp-pitbl thead tr:first-child th:nth-child(3){width:78px;}
html.desk .finreptbl-wrap table.finpp-pitbl thead tr:first-child th.num{width:92px;}
html.desk .finreptbl-wrap table.finpp-pitbl thead tr:first-child th:nth-child(8){width:150px;}
html.desk .finreptbl-wrap table.finpp-pitbl td[data-l="Supplier"], html.desk .finreptbl-wrap table.finpp-pitbl td[data-l="Invoice No."]{white-space:nowrap;}
html.desk .finreptbl-wrap table.finpp-pitbl td.num{white-space:nowrap;font-variant-numeric:tabular-nums;}
html.desk .finreptbl-wrap table.finpp-pitbl td[data-l="Date"], html.desk .finreptbl-wrap table.finpp-pitbl td[data-l="Status"]{white-space:nowrap;}
html.desk .finreptbl-wrap table.finpp-pitbl td[data-l="Status"] .finpill{font-size:10.5px;padding:1px 7px;line-height:16px;}
html.desk .finfa .finfa-col.finpp-r{transform:translate(-50%,-50%);}`;
  document.head.appendChild(st);
  // The totals under Net / VAT / Gross line up with the right-hand edge of their column, like the amounts.
  if(typeof finFootAlign==='function'){
    const fa = finFootAlign;
    finFootAlign = function(){
      const r = fa.apply(this, arguments);
      if(typeof isDeskMode==='function' && isDeskMode()) try{
        document.querySelectorAll('#app table.finpp-pitbl').forEach(tbl=>{
          const wrap = tbl.closest('.finreptbl-wrap'); const foot = wrap && wrap.nextElementSibling;
          if(!foot || !foot.classList.contains('finfa')) return;
          const ths = Array.from(tbl.querySelectorAll('thead tr:first-child th.num')); const fr = foot.getBoundingClientRect();
          foot.querySelectorAll('.finfa-col').forEach(sp=>{
            const th = ths.find(t=>t.textContent.trim().toLowerCase()===String(sp.dataset.lbl||'').toLowerCase()); if(!th) return;
            const rc = th.getBoundingClientRect();
            sp.style.left = Math.round(rc.left + rc.width/2 - fr.left)+'px'; sp.classList.add('finpp-r');
          });
        });
      }catch(e){ console.error(e); }
      return r;
    };
    window.finFootAlign = finFootAlign;
  }
})();
