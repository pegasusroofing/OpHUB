/* ============================================================
   OpHUB Finance — Purchase Quotes (23 Oct 2026, Andy): a tab on the project's Purchases
   page (replaces the Shopping List button). Upload one or many supplier quotes; the AI
   reader lists the items; tick what you want and raise a PO from them.
   - "This project" quotes (e.g. a Bauder project quote) show on that project only.
   - "All projects" quotes (e.g. Alltype's yearly price list) show on every project.
   - No figures from a quote are kept or put on any document — only the item wording,
     product code and unit. It's an aid to ordering, nothing more.
   Tables: fin_quotes (purpose 'pquote', site_id null = all projects) + fin_quote_items.
   ============================================================ */
let finPqSel = {}, finPqFilter = {}, finPqScope = {}, finPqBusy = false;
async function finPqLoad(siteId){
  const [quotes, items] = await Promise.all([
    dbSelect('fin_quotes', 'org_id=eq.'+ME.org_id+'&purpose=eq.pquote&or=(site_id.eq.'+siteId+',site_id.is.null)&order=created_at.desc').catch(()=>[]),
    dbSelect('fin_quote_items', 'org_id=eq.'+ME.org_id+'&or=(site_id.eq.'+siteId+',site_id.is.null)&active=eq.true&order=position.asc&limit=10000').catch(()=>[]),
  ]);
  return {quotes, items};
}
async function finPqPaneHtml(siteId){
  const {quotes, items} = await finPqLoad(siteId);
  const sel = finPqSel[siteId] = finPqSel[siteId] || new Set();
  const qBy = {}; quotes.forEach(q=>qBy[q.id] = q);
  const f = finPqFilter[siteId] || '';
  const qOrder = {}; quotes.forEach((q,i)=>qOrder[q.id] = (q.site_id?0:1000)+i);
  const shown = items.filter(i=>!f || i.quote_id===f).sort((a,b)=>(qOrder[a.quote_id]-qOrder[b.quote_id]) || (a.position-b.position));
  const qLabel = q=>[q.supplier_name, q.quote_no].filter(Boolean).join(' · ') || (q.file_name || 'Quote');
  const nSel = Array.from(sel).filter(id=>items.some(i=>i.id===id)).length;
  return `<div class="finpp-h"><p class="sectiontitle" style="margin:0;">Purchase Quotes</p><span>
      <button type="button" class="darkbtn" ${nSel?'':'disabled'} onclick="finPqRaisePo('${siteId}')">Raise PO From Ticked${nSel?' ('+nSel+')':''}</button></span></div>
    <div class="finpq-up">
      <label class="finpq-scope">Supplier<input type="text" id="finPqSup" placeholder="Read from the quote" style="width:180px;"></label>
      <label class="darkbtn finpq-file">+ Upload Project Quotes<input type="file" multiple accept=".pdf,image/*,.xlsx,.xls,.csv" style="display:none;" onchange="finPqScope['${siteId}']='project';finPqUpload('${siteId}', this.files)"></label>
      <span class="stub" id="finPqMsg" style="margin:0;font-style:normal;">Quotes for this project only. Yearly price lists (e.g. Alltype) are uploaded once under <a href="#/finance/purchases/pricebook">Finance › Purchases › Price Book</a> and show here on every project. Prices aren't kept, just the items.</span>
    </div>
    ${quotes.length ? `<div class="finquotes">
      <button type="button" class="finquote ${!f?'on':''}" onclick="finPqFilter['${siteId}']='';finPpFill('${siteId}')"><b>All Quotes</b><em>${items.length} item${items.length===1?'':'s'}</em></button>
      ${quotes.slice().sort((a,b)=>(a.site_id?0:1)-(b.site_id?0:1)).map(q=>{ const n = items.filter(i=>i.quote_id===q.id).length; return `<button type="button" class="finquote ${f===q.id?'on':''}" onclick="finPqFilter['${siteId}']='${q.id}';finPpFill('${siteId}')"><b>${escapeHtml(qLabel(q))}</b><em>${q.site_id ? 'Project quote' : 'Annual price list'} · ${n} item${n===1?'':'s'}</em></button>`; }).join('')}
    </div>` : ''}
    ${f && qBy[f] ? `<div class="finkv" style="margin:0 0 6px;"><span>${escapeHtml(qLabel(qBy[f]))}${qBy[f].file_name?' · '+escapeHtml(qBy[f].file_name):''} · ${qBy[f].site_id?'this project only':'all projects'}</span><b>${qBy[f].file_path?`<button class="linkbtn" onclick="openFinDoc('${jsAttr(qBy[f].file_path)}','${jsAttr(qBy[f].file_name||'')}')">View</button> `:''}<button class="linkbtn" style="color:var(--red);" onclick="finPqDelete('${siteId}','${f}')">Remove</button></b></div>` : ''}
    ${shown.length ? `${finSearchHtml('Search items or codes', 'finPqList')}<div id="finPqList"><div class="finreptbl-wrap"><table class="fincosttbl fininvtbl finpqtbl"><thead><tr><th class="finpq-cb"><input type="checkbox" ${shown.every(i=>sel.has(i.id))?'checked':''} onclick="finPqTickAll('${siteId}', this.checked)"></th><th>Item</th><th>Code</th><th>Unit</th><th>Supplier</th><th>Quote</th></tr></thead><tbody>
      ${shown.map(i=>{ const q = qBy[i.quote_id]; return `<tr class="click" data-lf="${lfText([i.description, i.code, i.supplier_name].join(' '))}" onclick="finPqTick('${siteId}','${i.id}')"><td class="finpq-cb" data-l=""><input type="checkbox" ${sel.has(i.id)?'checked':''} onclick="event.stopPropagation();finPqTick('${siteId}','${i.id}')"></td><td data-l="Item" class="d"><b>${escapeHtml(i.description)}</b></td><td data-l="Code">${escapeHtml(i.code||'—')}</td><td data-l="Unit">${escapeHtml(i.unit||'—')}</td><td data-l="Supplier">${escapeHtml(i.supplier_name||'—')}</td><td data-l="Quote">${q ? escapeHtml(q.quote_no||'')+(q.site_id?'':' <span class="finpill grey">Price list</span>') : '—'}</td></tr>`; }).join('')}
    </tbody></table></div></div>` : `<div class="empty" style="margin:6px 0 0;">No quotes yet. Upload a supplier's quote or price list and its items will appear here to tick.</div>`}`;
}
window.finPqPaneHtml = finPqPaneHtml;
window.finPqTick = function(siteId, id){ const s = finPqSel[siteId] = finPqSel[siteId] || new Set(); if(s.has(id)) s.delete(id); else s.add(id); finPpFill(siteId); };
window.finPqTickAll = function(siteId, on){
  const s = finPqSel[siteId] = finPqSel[siteId] || new Set();
  document.querySelectorAll('#finPqList tbody tr').forEach(tr=>{ if(tr.style.display==='none') return; const m = /finPqTick\('[^']*','([^']+)'\)/.exec(tr.getAttribute('onclick')||''); if(m){ if(on) s.add(m[1]); else s.delete(m[1]); } });
  finPpFill(siteId);
};
window.finPqUpload = async function(siteId, files){
  files = Array.from(files||[]); if(!files.length || finPqBusy) return;
  finPqBusy = true;
  const scope = finPqScope[siteId] || 'project';
  const msg = t=>{ const el = document.getElementById('finPqMsg'); if(el) el.textContent = t; };
  let added = 0, failed = 0;
  try{
    for(let n=0; n<files.length; n++){
      const file = files[n];
      msg(`Reading ${file.name} (${n+1} of ${files.length})…`);
      const r = await finReadDoc({file, kind:'quote', siteId: scope==='all' || siteId==='__all' ? null : siteId});
      if(r.error){ failed++; continue; }
      const d = r.data || {}; const supBox = document.getElementById('finPqSup'); if(supBox && supBox.value.trim()) d.supplier = supBox.value.trim();
      const lines = (d.lines||[]).filter(l=>(l.kind||'item')==='item' && String(l.description||'').trim());
      if(!lines.length){ failed++; continue; }
      const q = await dbInsert('fin_quotes', {org_id:ME.org_id, site_id: scope==='all' || siteId==='__all' ? null : siteId, purpose:'pquote', supplier_name:d.supplier||null, quote_no:d.doc_number||null, quote_date:d.doc_date||null, file_path:r.path||null, file_name:file.name, lines:[], read_by:r.via||null, created_by:ME.id});
      const qid = q && q[0] && q[0].id; if(!qid){ failed++; continue; }
      // Only the wording, code and unit are kept — no prices or quantities (Andy, 23 Oct).
      const rows = lines.map((l,i)=>({org_id:ME.org_id, quote_id:qid, site_id: scope==='all' || siteId==='__all' ? null : siteId, supplier_name:d.supplier||null, code:l.code ? String(l.code).slice(0,80) : null, description:String(l.description).trim().slice(0,300), unit:l.unit ? String(l.unit).slice(0,30) : null, position:i, active:true, created_by:ME.id}));
      const res = await sbFetch('/rest/v1/fin_quote_items', {method:'POST', body:JSON.stringify(rows)});
      if(!res.ok){ failed++; continue; }
      added++;
    }
  } finally { finPqBusy = false; }
  toast(added ? `${added} quote${added===1?'':'s'} read${scope==='all'?' — on every project':''}${failed?` · ${failed} couldn't be read`:''}` : 'Couldn’t read those files — try a PDF or Excel copy');
  finPqFilter[siteId] = '';
  if(siteId==='__all') render(); else finPpFill(siteId);
};
window.finPqDelete = async function(siteId, qid){
  const q = (await dbSelect('fin_quotes', 'id=eq.'+qid))[0]; if(!q) return;
  if(!await customConfirm(`Remove this quote${q.site_id ? '' : ' from every project'}? Its items come off the list. POs already raised aren't changed.`, {confirmLabel:'Remove'})) return;
  if(await dbDelete('fin_quotes', qid)){ finPqFilter[siteId] = ''; toast('Removed'); if(siteId==='__all') render(); else finPpFill(siteId); }
};
window.finPqRaisePo = async function(siteId){
  const sel = finPqSel[siteId]; if(!sel || !sel.size) return;
  const items = (await dbSelect('fin_quote_items', 'id=in.('+Array.from(sel).join(',')+')').catch(()=>[]));
  if(!items.length) return;
  const sups = Array.from(new Set(items.map(i=>String(i.supplier_name||'').trim().toLowerCase() || 'q:'+i.quote_id)));
  if(sups.length > 1){ toast('Tick items from one supplier at a time — each supplier gets its own PO.'); return; }
  await openFinNewPo(siteId);
  if(typeof finNewPo==='undefined' || !finNewPo) return;
  const vat = finNewPo.vat;
  finNewPo.lines = items.map(i=>({description:(i.code ? i.code+' – ' : '')+i.description, qty:1, unit:i.unit||'', rate:null, amount:0, cost_code:'materials', vat}));
  if(typeof finNpoPaint==='function') finNpoPaint();
  const supName = String(items[0].supplier_name||'').trim().toLowerCase();
  const s = document.getElementById('finNpoSup');
  if(s && supName){ const o = Array.from(s.options).find(o=>o.value && o.value!=='__new' && (o.text.toLowerCase()===supName || o.text.toLowerCase().includes(supName) || supName.includes(o.text.toLowerCase()))); if(o){ s.value = o.value; if(typeof finNpoSupPicked==='function') finNpoSupPicked(o.value); } }
  sel.clear();
  toast(items.length+' item'+(items.length===1?'':'s')+' added — set the quantities, then Raise PO');
};
/* Finance › Purchases › Price Lists — the annual price lists that apply to every project. */
if(typeof FIN_SUBS!=='undefined' && FIN_SUBS.purchases){
  const inv = FIN_SUBS.purchases.find(t=>t[0]==='invoices'), ord = FIN_SUBS.purchases.find(t=>t[0]==='orders');
  if(inv && ord){ FIN_SUBS.purchases = [inv, ord].concat(FIN_SUBS.purchases.filter(t=>t!==inv && t!==ord)); }
  // The Price Book tab is now where the yearly supplier price lists live (Andy, 23 Oct).
  FIN_SUBS.purchases.forEach(t=>{ if(t[0]==='pricebook'){ t[1] = 'Price Book'; t[2] = '#/finance/purchases/pricebook'; } });
}
async function renderFinPriceLists(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const [quotes, items] = await Promise.all([
    dbSelect('fin_quotes', 'org_id=eq.'+ME.org_id+'&purpose=eq.pquote&site_id=is.null&order=created_at.desc').catch(()=>[]),
    dbSelect('fin_quote_items', 'org_id=eq.'+ME.org_id+'&site_id=is.null&select=quote_id&limit=20000').catch(()=>[]),
  ]);
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('purchases')}${finSubTabs('purchases','pricebook')}
    <div class="card">
      <div class="finpp-h"><p class="sectiontitle" style="margin:0;">Price Book — Yearly Supplier Price Lists</p><span></span></div>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">Your main suppliers' yearly price lists (e.g. Alltype). They apply to <b>every project</b> — their items show under each project's Purchases › Purchase Quotes, ready to tick and order. Project-specific quotes (e.g. a Bauder quote for one job) are uploaded on that project instead. No prices are kept or put on any document.</p>
      <div class="finpq-up">
        <label class="finpq-scope">Supplier<input type="text" id="finPqSup" placeholder="Read from the list" style="width:200px;"></label>
        <label class="darkbtn finpq-file">+ Upload Price Lists<input type="file" multiple accept=".pdf,image/*,.xlsx,.xls,.csv" style="display:none;" onchange="finPqScope['__all']='all';finPqUpload('__all', this.files)"></label>
        <span class="stub" id="finPqMsg" style="margin:0;font-style:normal;">PDF, photo or Excel — you can pick several at once.</span>
      </div>
      ${quotes.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>Supplier</th><th>Ref</th><th>Date</th><th>File</th><th>Items</th><th></th></tr></thead><tbody>
        ${quotes.map(q=>`<tr><td data-l="Supplier" class="d"><b>${escapeHtml(q.supplier_name||'—')}</b></td><td data-l="Ref">${escapeHtml(q.quote_no||'—')}</td><td data-l="Date">${finDate(q.quote_date || String(q.created_at).slice(0,10))}</td><td data-l="File">${q.file_path?`<button class="linkbtn" onclick="openFinDoc('${jsAttr(q.file_path)}','${jsAttr(q.file_name||'')}')">${escapeHtml(q.file_name||'View')}</button>`:escapeHtml(q.file_name||'—')}</td><td data-l="Items">${items.filter(i=>i.quote_id===q.id).length}</td><td data-l=""><button class="linkbtn" style="color:var(--red);" onclick="finPqDelete('__all','${q.id}')">Remove</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty" style="margin:0;">No price lists yet.</div>'}
    </div>
  `, {title:'Price Book', subtitle:'OpHUB Finance · purchases', back:finSecBack(), tabs:false});
}
window.renderFinPriceLists = renderFinPriceLists;
(function(){
  const rp = renderFinPurchases;
  renderFinPurchases = function(sub){ if(sub==='pricelists' || sub==='pricebook') return renderFinPriceLists(); return rp.apply(this, arguments); };
})();

(function(){
  const st = document.createElement('style');
  st.textContent = `.finpq-up{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;padding:10px 12px;border:1px dashed var(--line);border-radius:10px;background:#FAFBFC;}
.finpq-scope{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--slate);}
.finpq-scope select{height:32px !important;min-height:32px !important;padding:0 26px 0 10px !important;font-size:13px !important;border-radius:8px !important;margin:0 !important;width:auto !important;}
.finpq-scope input{height:32px !important;min-height:32px !important;padding:0 10px !important;font-size:13px !important;border-radius:8px !important;margin:0 !important;}
.finpq-file{width:auto !important;margin:0 !important;padding:6px 12px !important;cursor:pointer;}
.finpqtbl th.finpq-cb, .finpqtbl td.finpq-cb{width:34px;text-align:center !important;}
.finpqtbl td.d, .finpqtbl th:nth-child(2){text-align:left !important;}`;
  document.head.appendChild(st);
})();

/* Every pop-up gets an ✕ top right, and Esc closes the top one (Andy, 23 Oct). */
function modalClose(card){
  const cancel = card.querySelector('.geo-modal-cancel, .finb-x');
  if(cancel){ cancel.click(); return; }
  const ov = card.closest('.geo-modal-overlay'); if(ov) ov.style.display = 'none';
}
function modalAddX(){
  document.querySelectorAll('.geo-modal-overlay .geo-modal-card').forEach(card=>{
    if(card.querySelector(':scope > .modal-x, .finb-x')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'modal-x'; b.setAttribute('aria-label', 'Close'); b.textContent = '✕';
    b.onclick = e=>{ e.stopPropagation(); modalClose(card); };
    card.prepend(b);
  });
}
(function(){
  let t = null;
  new MutationObserver(()=>{ clearTimeout(t); t = setTimeout(modalAddX, 30); }).observe(document.body, {childList:true, subtree:true});
  document.addEventListener('keydown', e=>{
    if(e.key!=='Escape') return;
    const open = Array.from(document.querySelectorAll('.geo-modal-overlay')).filter(o=>getComputedStyle(o).display!=='none');
    const top = open[open.length-1]; const card = top && top.querySelector('.geo-modal-card'); if(card) modalClose(card);
  });
  const st = document.createElement('style');
  st.textContent = `.geo-modal-card > .modal-x{position:sticky;top:0;float:right;z-index:3;margin:-8px -8px 0 8px;width:34px;height:34px;border:0;border-radius:10px;background:#F1F3F6;color:var(--ink);font-size:16px;font-weight:700;cursor:pointer;line-height:1;}
.geo-modal-card > .modal-x:hover{background:#E4E7EC;}`;
  document.head.appendChild(st);
})();

/* Purchase Invoices "+ ▾": Receipt or Yard Stock (Andy, 23 Oct). Yard Stock opens the yard list
   for this project — issuing puts the cost on the job (yard_moves → fin_job_costs) and it shows
   in the Purchase Invoices list as "From Yard". */
window.finPpAddMenu = function(btn, siteId){
  if(window.event) window.event.stopPropagation();
  const was = document.getElementById('finRowMenu'); if(was){ was.remove(); return; }
  const m = document.createElement('div'); m.id = 'finRowMenu'; m.className = 'finrowmenu';
  m.innerHTML = `<button type="button" onclick="finRowMenuClose();openPurchaseInvoiceForm('${siteId}',null,true)">+ Receipt</button><button type="button" onclick="finRowMenuClose();yardPmOpen('${siteId}')">+ Yard Stock</button>`;
  m.onclick = e=>e.stopPropagation();
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))+'px';
  m.style.top = (r.bottom + 4)+'px';
  setTimeout(()=>{}, 0);
};
(function(){
  const q = window.yardQuickIssue;
  window.yardQuickIssue = async function(stockId, siteId){ const r = await q.apply(this, arguments); if(document.getElementById('finPpBody')) setTimeout(()=>finPpFill(siteId), 600); return r; };
})();
