/* ============================================================
   OpHUB Finance — Bill of Quantities on a computer, made simpler to read (25 Oct 2026, Andy:
   "this should make it a lot simpler to view").
   Computers only (html.desk). The phone Bill of Quantities (9219zk) is unchanged.
   - Numbers show with commas (10,000.00) when you're not typing in them; boxes are sized so
     nothing is cut off, and every line's boxes line up.
   - Only the part you type in is shaded; worked-out boxes are plain.
   - Totals can't be typed: cost price = quantity × cost rate, sell price = quantity × sell rate.
     Lump sums: leave the quantity empty — then the two totals are the boxes you type in and the
     rates are greyed out.
   - Shorter ref / description boxes; section rows on one line with their total; the number boxes
     at 0.9 of the old size; margin shows the % first, then the £.
   - + Section / + Sub-section / + Item stay at the top of the list (the header sticks while you
     scroll); the old row of the same buttons at the bottom is gone.
   - "Budget Cost ▾" opens a drop-down with the margin / mark-up tool and a section-by-section
     budget, instead of a card further down the page.
   - Bottom of the list: the summary (lines, sell total, budget cost, margin), then
     Save Bill of Quantities + Issue as SOW to Operatives, then a quiet Export: Excel · PDF line.
   - Upload Client's Bill sits top right, in line with the Bill of Quantities / Variations /
     Day Works tabs.
   ============================================================ */
function finBqDesk(){ return typeof isDeskMode==='function' && isDeskMode(); }

/* ---------- numbers: commas when not typing, plain while typing ---------- */
function finBqdTxt(kind, v){
  const n = finNum(v); if(v==='' || v==null || n===null || isNaN(n)) return v==null ? '' : String(v);
  if(kind==='q') return n.toLocaleString('en-GB', {maximumFractionDigits:3});
  return n.toLocaleString('en-GB', {minimumFractionDigits:2, maximumFractionDigits:4});
}
function finBqdFmt(el){
  if(!el || !el.dataset || !el.dataset.bqn || el.dataset.bqn==='u' || el===document.activeElement) return;
  if(el.value!=='') el.value = finBqdTxt(el.dataset.bqn, el.value);
}
// Every line's boxes the same width, wide enough for the longest value on the page
// (measured in the box's own font, so nothing is cut off).
let finBqdSizeQ = false, finBqdCanvas = null;
function finBqdSize(){
  if(finBqdSizeQ) return; finBqdSizeQ = true;
  requestAnimationFrame(()=>{
    finBqdSizeQ = false;
    const list = document.getElementById('finContractList'); if(!list) return;
    const els = list.querySelectorAll('input[data-bqn]'); if(!els.length) return;
    const ctx = (finBqdCanvas = finBqdCanvas || document.createElement('canvas')).getContext('2d');
    const cs = getComputedStyle(els[0]); ctx.font = cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
    const minTxt = {q:'0000', u:'item', cr:'00.00', cp:'0,000.00', sr:'00.00', sp:'0,000.00'}, w = {};
    Object.keys(minTxt).forEach(k=>w[k] = ctx.measureText(minTxt[k]).width);
    els.forEach(el=>{ const k = el.dataset.bqn; const t = el.value || el.placeholder || ''; const x = ctx.measureText(t).width; if(x > (w[k]||0)) w[k] = x; });
    Object.keys(w).forEach(k=>list.style.setProperty('--bq-'+k, Math.ceil(Math.min(w[k], 160) + 2)+'px'));
  });
}
// Which boxes can be typed in: with a quantity, the rates (totals are worked out);
// without one (a lump sum), the totals.
function finBqdState(i){
  const r = (finContractRows||[])[i]; const cp = document.getElementById('finCCost-'+i); if(!r || !cp) return;
  const row = cp.closest('.fincrow'); if(!row) return;
  const cr = document.getElementById('finCCR-'+i), sp = document.getElementById('finCVal-'+i), sr = row.querySelector('input[data-bqn="sr"]');
  const hasQ = finCrNum(r.qty)!==null;
  [cr, sr].forEach(x=>{ if(!x) return;
    x.disabled = !hasQ;
    if(!hasQ){ if(x!==document.activeElement) x.value = ''; x.placeholder = '—'; x.title = 'Lump sum — type a quantity to use a rate'; }
    else { x.placeholder = '0.00'; x.title = ''; }
  });
  [cp, sp].forEach(x=>{ if(!x) return; x.disabled = hasQ; x.title = hasQ ? 'Quantity × rate' : 'Lump sum — type the total'; });
  if(hasQ && sr && sr!==document.activeElement){ const rt = finCrNum(r.rate); sr.value = rt===null ? '' : finBqdTxt('sr', finCr2(rt)); }
  row.classList.toggle('bqd-lump', !hasQ);
}
function finBqdRows(){
  const list = document.getElementById('finContractList'); if(!list) return;
  list.querySelectorAll(':scope > .fincrow.item').forEach(row=>{
    const cp = row.querySelector('input[id^="finCCost-"]'); if(!cp) return;
    const i = +cp.id.slice(9);
    const tag = (el, k)=>{ if(el) el.dataset.bqn = k; };
    tag(row.querySelector('input.w-q'), 'q'); tag(row.querySelector('input.w-u'), 'u');
    tag(row.querySelector('input[id^="finCCR-"]'), 'cr'); tag(cp, 'cp');
    tag(row.querySelector('.fincpill.sell input:not([id])'), 'sr'); tag(row.querySelector('input[id^="finCVal-"]'), 'sp');
    finBqdState(i);
  });
  list.querySelectorAll('input[data-bqn]').forEach(finBqdFmt);
  finBqdSize();
}
(function(){
  document.addEventListener('focusin', e=>{ const el = e.target; if(el && el.dataset && el.dataset.bqn && el.dataset.bqn!=='u' && !el.disabled){ const n = finNum(el.value); if(el.value!=='' && n!==null && !isNaN(n)) el.value = String(n); } });
  document.addEventListener('focusout', e=>{ const el = e.target; if(el && el.dataset && el.dataset.bqn){ setTimeout(()=>{ finBqdFmt(el); finBqdSize(); }, 0); } });
  document.addEventListener('input', e=>{ const el = e.target; if(el && el.dataset && el.dataset.bqn) finBqdSize(); });
})();

/* ---------- hooks into the existing Bill of Quantities code (9219n / 9219zk) ---------- */
(function(){
  // Lines drawn (computer) → tag, format and size the boxes.
  const paint = finContractPaint;
  finContractPaint = function(){ const r = paint.apply(this, arguments); if(finBqDesk()) try{ finBqdRows(); }catch(e){ console.error(e); } return r; };
  window.finContractPaint = finContractPaint;
  // One line changed → keep its boxes in the right state and formatted.
  const refresh = finCrRefresh;
  finCrRefresh = function(i){
    const r = refresh.apply(this, arguments);
    if(finBqDesk()) try{
      finBqdState(i);
      ['finCCR-','finCCost-','finCVal-'].forEach(p=>finBqdFmt(document.getElementById(p+i)));
      finBqdSize();
    }catch(e){ console.error(e); }
    return r;
  };
  // Margin: the % first, then the £ smaller (computer only — the phone keeps its own).
  const mg = finCrMarginHtml;
  finCrMarginHtml = function(r){
    if(!finBqDesk()) return mg.apply(this, arguments);
    const v = Number(finItemValue(r)), c = r.cost;
    if(c==null || isNaN(c) || !finItemValue(r)) return '<b>—</b>';
    const m = finRound(v - Number(c)), p = v ? (v - Number(c))/v*100 : null;
    return `<b class="${m<0?'neg':''}">${p!=null ? finPctTxt(finRound(p)) : '—'}</b><em>${finMoney(m)}</em>`;
  };
  // Totals → the summary at the bottom (and the Budget Cost drop-down, when open).
  const tot = window.finContractPaintTotal;
  window.finContractPaintTotal = function(){ const r = tot.apply(this, arguments); if(finBqDesk()) try{ finBqdSum(); }catch(e){ console.error(e); } return r; };
  // The ticked-lines bar's "Margin / mark-up" link opens the Budget Cost drop-down.
  const bulk = finContractBulkPaint;
  finContractBulkPaint = function(){
    const r = bulk.apply(this, arguments);
    if(finBqDesk()){ const b = document.querySelector('#finCtBulk button[onclick*="finCtPct"]'); if(b){ b.setAttribute('onclick', 'finBqdBudget(true, true)'); b.textContent = 'Budget Cost…'; } }
    return r;
  };
  // Upload button only shows on the Bill of Quantities sub-tab.
  const sub = window.finBoqSubGo;
  window.finBoqSubGo = function(siteId, k){ const r = sub.apply(this, arguments); document.querySelectorAll('.finboqsub').forEach(n=>n.classList.toggle('bqd-onboq', k==='boq')); if(k!=='boq') finBqdBudget(false); return r; };
  // The page itself.
  const page = renderFinContract;
  renderFinContract = async function(siteId){
    const r = await page.apply(this, arguments);
    if(finBqDesk()) try{ finBqdLayout(siteId); }catch(e){ console.error(e); }
    return r;
  };
})();

/* ---------- page layout (computer) ---------- */
function finBqdLayout(siteId){
  const pane = document.querySelector('.finboqpane[data-k="boq"]'); const list = document.getElementById('finContractList');
  if(!pane || !list || pane.dataset.bqd) return;
  const lines = list.closest('.card'); if(!lines) return;
  pane.dataset.bqd = '1'; pane.classList.add('bqd'); lines.classList.add('bqd-lines');
  const sid = jsAttr(siteId);
  // Breadcrumb back at the top of the page, like the other Finance pages.
  const sa = document.querySelector('#app .scrollarea'); const crumbs = pane.querySelector('.navcrumbs');
  if(sa && crumbs) sa.prepend(crumbs);
  // Warnings above the list.
  ['#finCvBar', '.finbanner'].forEach(sel=>{ const b = pane.querySelector(sel); if(b) lines.before(b); });

  // Header: Lines · [Budget Cost ▾] [+ Section] [+ Sub-section] [+ Item] — stays at the top while scrolling.
  const title = lines.querySelector('.sectiontitle'); const hdr = title && title.parentNode;
  if(hdr){
    hdr.classList.add('bqd-hdr');
    let add = hdr.querySelector('.finboqadd');
    if(!add){ add = document.createElement('span'); add.className = 'finboqadd'; add.innerHTML = `<button class="ghostbtn" onclick="finContractAdd('section')">+ Section</button><button class="ghostbtn" onclick="finContractAdd('subsection')">+ Sub-section</button><button class="ghostbtn" onclick="finContractAdd('item')">+ Item</button>`; hdr.appendChild(add); }
    const bud = document.createElement('button'); bud.type = 'button'; bud.className = 'ghostbtn bqd-budbtn'; bud.id = 'finBqdBudBtn';
    bud.setAttribute('aria-expanded', 'false'); bud.setAttribute('onclick', 'event.stopPropagation();finBqdBudget()');
    bud.innerHTML = 'Budgets <span aria-hidden="true">▾</span>';
    add.prepend(bud);
    // One "+ Add ▾" button with Section / Sub-section / Item underneath (Andy, 25 Oct)
    Array.from(add.querySelectorAll('button[onclick*="finContractAdd"]')).forEach(b=>b.remove());
    const addWrap = document.createElement('span'); addWrap.className = 'bqd-addwrap';
    addWrap.innerHTML = `<button type="button" class="ghostbtn bqd-addbtn" aria-expanded="false" onclick="event.stopPropagation();finBqdAddMenu()">+ Add <span aria-hidden="true">▾</span></button>
      <span class="bqd-addmenu" id="finBqdAddMenu" hidden><button type="button" onclick="finBqdAddMenu(false);finContractAdd('section')"><b>Section</b><em>A main heading, e.g. Main Roof</em></button><button type="button" onclick="finBqdAddMenu(false);finContractAdd('subsection')"><b>Sub-section</b><em>A heading inside a section</em></button><button type="button" onclick="finBqdAddMenu(false);finContractAdd('item')"><b>Item</b><em>A priced line</em></button></span>`;
    add.appendChild(addWrap);
    const panel = document.createElement('div'); panel.className = 'bqd-budpanel'; panel.id = 'finBqdBud'; panel.hidden = true;
    panel.innerHTML = `<div class="bqd-budhead"><b>Budget Cost</b><button type="button" class="bqd-x" aria-label="Close" onclick="finBqdBudget(false)">✕</button></div>
      <p class="bqd-budtxt">Each line’s budget cost is its quantity × cost rate (or a lump sum when there’s no quantity). Type it on each line, or work it out from the sell price with a margin or mark-up % — for every line, or just the ones you’ve ticked.</p>
      <div class="fincosttool-sm bqd-tool" id="finBqdBudTool"></div>
      <p class="bqd-budsub">By Section</p><div id="finBqdBudTbl"></div>`;
    hdr.appendChild(panel);
    panel.addEventListener('click', e=>e.stopPropagation());
    const tool = pane.querySelector('.fincosttool');
    if(tool){
      const row = tool.querySelector('.fincosttool-row'); const eg = tool.querySelector('#finCtEg');
      const t = row && row.querySelector('.fincosttool-t'); if(t) t.remove();
      const box = panel.querySelector('#finBqdBudTool'); if(row) box.appendChild(row); if(eg) box.appendChild(eg);
      tool.remove();
    }
  }
  // The old row of add buttons under the list.
  Array.from(lines.querySelectorAll(':scope > .row-gap')).forEach(g=>{ if(g.querySelector('button[onclick*="finContractAdd"]')) g.remove(); });

  // Bottom: summary · actions · hint · export.
  const foot = document.createElement('div'); foot.className = 'bqd-foot';
  foot.innerHTML = `<div class="finboqtot bqd-sum" id="finBqdSum"></div><div class="bqd-acts" id="finBqdActs"></div><p class="bqd-hint" id="finBqdHint"></p>
    <div class="finexp"><span>Export:</span><button type="button" class="linkbtn" onclick="finBoqExport('${sid}','xlsx')">Excel</button><button type="button" class="linkbtn" onclick="finBoqExport('${sid}','pdf')">PDF</button></div>`;
  lines.appendChild(foot);
  const acts = foot.querySelector('#finBqdActs');
  const save = pane.querySelector('#finContractSave');
  const oldHint = save && save.nextElementSibling && save.nextElementSibling.matches('p.stub') ? save.nextElementSibling : null;
  if(save){ save.removeAttribute('style'); acts.appendChild(save); }
  const sow = pane.querySelector('#finSowCard');
  if(sow){
    const send = sow.querySelector('button[onclick*="finSendToSow"]');
    if(send){ send.className = 'ghostbtn'; send.removeAttribute('style'); send.textContent = /update/i.test(send.textContent) ? 'Update SOW for Operatives' : 'Issue as SOW to Operatives'; acts.appendChild(send); }
    const copy = sow.querySelector('button[onclick*="finContractFromSow"]');
    if(copy){ copy.className = 'ghostbtn'; copy.removeAttribute('style'); copy.textContent = copy.textContent.trim().replace(/(^|\s)([a-z])/g, (m, s, c)=>s+c.toUpperCase()); acts.appendChild(copy); }
    const st = sow.querySelector('p.stub'); if(st && send){ const s = document.createElement('span'); s.className = 'bqd-sowst'; s.textContent = st.textContent.trim(); acts.appendChild(s); }
    sow.remove();
  }
  const ct = lines.querySelector('.fincontot'); if(ct) acts.appendChild(ct);
  const plots = oldHint && /Put a header[^]*$/.exec(oldHint.textContent || '');
  foot.querySelector('#finBqdHint').textContent = 'Totals are quantity × rate, so you type the rates. For a lump sum, leave the quantity empty and type the total. Saving sets the project’s contract value to the total of the items.' + (plots ? ' '+plots[0] : '');
  if(oldHint) oldHint.remove();

  // Upload: top right, in line with the Bill of Quantities / Variations / Day Works tabs.
  const nav = document.querySelector('.finboqsub'); const inp = pane.querySelector('#finContractUpload');
  if(nav && inp){
    const upCard = inp.closest('details, .card');
    const view = upCard && upCard.querySelector('button[onclick*="openFinDoc"]');
    const last = view && view.closest('p'); const lastName = last ? last.textContent.replace(/^\s*Last uploaded:\s*/i, '').replace(/\s*view\s*$/i, '').trim() : '';
    const up = document.createElement('span'); up.className = 'bqd-up';
    up.innerHTML = `${view ? `<button type="button" class="bqd-lastup" title="${escapeHtml(lastName)}">Last Upload</button>` : ''}<button type="button" class="bqd-upbtn" onclick="document.getElementById('finContractUpload').click()" title="An Excel or PDF of the priced contract — you check the lines before they’re used">⇪ Upload Client’s Bill</button>`;
    if(view) up.querySelector('.bqd-lastup').setAttribute('onclick', view.getAttribute('onclick'));
    inp.hidden = true; up.appendChild(inp);
    nav.appendChild(up);
    nav.classList.toggle('bqd-onboq', (finBoqSub[siteId] || 'boq')==='boq');
    if(upCard && upCard.closest('.finboqpane')) upCard.remove();
  }
  finBqdSum();
  finBqdRows();
}

/* ---------- summary at the bottom ---------- */
function finBqdNums(rows){
  const items = rows.filter(finIsItem);
  const sell = finRound(items.reduce((s,r)=>s+(Number(finItemValue(r))||0), 0));
  const costed = items.filter(r=>r.cost!=null && !isNaN(r.cost));
  const cost = finRound(costed.reduce((s,r)=>s+Number(r.cost), 0));
  const sellC = finRound(costed.reduce((s,r)=>s+(Number(finItemValue(r))||0), 0));
  const m = finRound(sellC - cost);
  return {items:items.length, sell, cost, costed:costed.length, missing:items.length-costed.length, m, p: sellC ? m/sellC*100 : null};
}
function finBqdSum(){
  const el = document.getElementById('finBqdSum'); if(!el) return;
  const rows = finContractRows || [];
  const secs = rows.filter(x=>x.kind==='section').length, subs = rows.filter(x=>x.kind==='subsection').length;
  const n = finBqdNums(rows);
  const pl = (k, w)=>k+' '+w+(k===1?'':'s');
  const count = [secs ? pl(secs, 'section') : '', subs ? pl(subs, 'sub-section') : '', pl(n.items, 'item')].filter(Boolean).join(' · ');
  el.hidden = !rows.length;
  el.innerHTML = `<span class="bqd-cnt"><em>Lines</em><b>${count}</b></span>
    <span><em>Sell Total</em><b>${finMoney(n.sell)}</b></span>
    <span class="${n.missing ? 'warn' : ''}"><em>Budget Cost</em><b>${n.costed ? finMoney(n.cost) : '—'}</b>${n.missing ? `<i>${n.missing} line${n.missing===1?'':'s'} without a cost</i>` : ''}</span>
    <span class="${n.costed ? (n.m<0 ? 'bad' : 'ok') : ''}"><em>Margin${n.missing && n.costed ? ' (Costed Lines)' : ''}</em><b>${n.costed ? finPctTxt(n.p==null ? null : finRound(n.p)) : '—'}${n.costed ? `<small>${finMoney(n.m)}</small>` : ''}</b></span>`;
  const p = document.getElementById('finBqdBud'); if(p && !p.hidden) finBqdBudTable();
}

window.finBqdAddMenu = function(open){
  const m = document.getElementById('finBqdAddMenu'); if(!m) return;
  const show = open===undefined ? m.hidden : !!open;
  m.hidden = !show; const b = document.querySelector('.bqd-addbtn'); if(b) b.setAttribute('aria-expanded', String(show));
  if(show) setTimeout(()=>document.addEventListener('click', function c(){ finBqdAddMenu(false); document.removeEventListener('click', c); }), 0);
};
/* ---------- Budget Cost drop-down ---------- */
window.finBqdBudget = function(open, focusPct){
  const p = document.getElementById('finBqdBud'); const b = document.getElementById('finBqdBudBtn'); if(!p) return;
  const show = open==null ? p.hidden : !!open;
  p.hidden = !show; if(b){ b.setAttribute('aria-expanded', show ? 'true' : 'false'); b.classList.toggle('on', show); }
  if(show){ finBqdBudTable(); if(focusPct) setTimeout(()=>{ const x = document.getElementById('finCtPct'); if(x) x.focus(); }, 30); }
};
function finBqdBudTable(){
  const box = document.getElementById('finBqdBudTbl'); if(!box) return;
  const rows = finContractRows || [];
  const groups = []; let g = null;
  rows.forEach(r=>{
    if(r.kind==='section'){ g = {name:(r.ref ? r.ref+' ' : '')+(r.description || 'Untitled section'), rows:[]}; groups.push(g); return; }
    if(!finIsItem(r)) return;
    if(!g){ g = {name:'Lines before the first section', rows:[]}; groups.push(g); }
    g.rows.push(r);
  });
  if(!groups.length){ box.innerHTML = '<p class="bqd-budtxt" style="margin:0;">No lines yet.</p>'; return; }
  const all = finBqdNums(rows);
  const tr = (name, n, b)=>`<tr${b?' class="bqd-tot"':''}><td>${escapeHtml(name)}</td><td class="num">${n.items}</td><td class="num">${finMoney(n.sell)}</td><td class="num">${n.costed ? finMoney(n.cost) : '—'}</td><td class="num ${n.m<0?'neg':''}">${n.costed ? finPctTxt(n.p==null ? null : finRound(n.p))+' <small>'+finMoney(n.m)+'</small>' : '—'}</td><td class="num ${n.missing?'warn':''}">${n.missing || '—'}</td></tr>`;
  box.innerHTML = `<div class="bqd-budwrap"><table class="bqd-budtbl"><thead><tr><th>Section</th><th class="num">Items</th><th class="num">Sell</th><th class="num">Budget Cost</th><th class="num">Margin</th><th class="num">Without A Cost</th></tr></thead><tbody>
    ${groups.map(x=>tr(x.name, finBqdNums(x.rows))).join('')}${groups.length > 1 ? tr('Total', all, true) : ''}</tbody></table></div>`;
}
(function(){
  document.addEventListener('click', e=>{ const p = document.getElementById('finBqdBud'); if(p && !p.hidden && !(e.target.closest && e.target.closest('#finBqdBud, #finBqdBudBtn'))) finBqdBudget(false); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ const p = document.getElementById('finBqdBud'); if(p && !p.hidden) finBqdBudget(false); } });
})();

/* ---------- Export the Bill of Quantities (Excel / PDF) ---------- */
window.finBoqExport = async function(siteId, kind){
  const site = SITES.find(s=>s.id===siteId) || {};
  let rows = (finContractSite===siteId && finContractRows) ? finContractRows : null;
  if(!rows){
    const items = await dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&order=position.asc');
    rows = items.map(i=>({kind:i.kind||'item', ref:i.ref||'', description:i.description, qty:i.qty!=null?Number(i.qty):null, unit:i.unit||'', rate:i.rate!=null?Number(i.rate):null, value:i.value!=null?Number(i.value):null, cost:i.cost!=null?Number(i.cost):null}));
  }
  if(!rows.length){ toast('No lines to export yet.'); return; }
  const vt = finGroupTotals(rows, r=>finItemValue(r));
  const mgOf = (v, c)=>c!=null && v ? finRound((v-c)/v*100) : null;
  const out = rows.map((r,i)=>{
    if(!finIsItem(r)){
      const g = []; for(let j=i+1;j<rows.length;j++){ const k = rows[j].kind; if(k==='section' || (r.kind==='subsection' && k==='subsection')) break; if(finIsItem(rows[j])) g.push(rows[j]); }
      const n = finBqdNums(g); const v = (vt[i]||{}).value;
      return {ref:r.ref||'', desc: r.kind==='section' ? String(r.description||'').toUpperCase() : String(r.description||''), value:v, cost: n.costed ? n.cost : null, mg: n.costed && !n.missing ? mgOf(v, n.cost) : null};
    }
    const v = finItemValue(r), c = (r.cost==null || isNaN(r.cost)) ? null : Number(r.cost);
    return {ref:r.ref||'', desc:String(r.description||''), qty:finCrNum(r.qty), unit:r.unit||'', rate: finCrNum(r.qty)!==null ? finCrNum(r.rate) : null, value:v, cost:c, mg:mgOf(v, c)};
  });
  const n = finBqdNums(rows);
  out.push({ref:'', desc:'Total', value:n.sell, cost:n.costed ? n.cost : null, mg: n.costed && !n.missing ? mgOf(n.sell, n.cost) : null});
  const cols = [{k:'ref', l:'Ref', w:45}, {k:'desc', l:'Description', w:300}, {k:'qty', l:'Qty', w:50, num:true}, {k:'unit', l:'Unit', w:45}, {k:'rate', l:'Rate', w:70, money:true}, {k:'value', l:'Total', w:80, money:true}, {k:'cost', l:'Budget Cost', w:80, money:true}, {k:'mg', l:'Margin', w:50, pct:true}];
  const job = (site.job_number ? site.job_number+' · ' : '')+(site.name||'');
  return finExportTable(kind, {title:'Bill of Quantities — '+job, cols, rows:out, note: n.missing ? n.missing+' line'+(n.missing===1?' has':'s have')+' no budget cost yet.' : '', name:'Bill of Quantities - '+(site.job_number||'')+' '+(site.name||'')});
};

/* ---------- styles (computer only) ---------- */
(function(){
  const st = document.createElement('style');
  const L = 'html.desk .bqd-lines';
  st.textContent = `
${L} .bqd-hdr{position:sticky;top:-24px;z-index:8;background:#fff;padding:10px 0 8px;margin:-10px 0 0;border-bottom:1px solid #EEF0F3;}
${L} .bqd-hdr .sectiontitle{font-size:16px;}
${L} .bqd-hdr #finCtCount, ${L} .bqd-hdr .fincontot{display:none !important;}
${L} .finboqadd{align-items:center;gap:6px;}
${L} .finboqadd .ghostbtn{height:32px;min-height:32px !important;padding:0 12px !important;font-size:13px !important;border-radius:8px !important;}
${L} .bqd-budbtn{margin-right:8px !important;display:inline-flex !important;align-items:center;gap:6px;}
${L} .bqd-budbtn span{font-size:10px;color:var(--slate);}
${L} .bqd-budbtn.on{background:#F2F4F7 !important;border-color:#C9CFD8 !important;}
${L} .bqd-budpanel{position:absolute;right:0;top:calc(100% + 6px);z-index:30;width:min(720px, 100%);box-sizing:border-box;background:#fff;border:1px solid #E1E4EA;border-radius:12px;box-shadow:0 14px 36px rgba(16,24,40,.18);padding:14px 16px 16px;text-align:left;}
${L} .bqd-budpanel[hidden]{display:none !important;}
.bqd-budhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;} .bqd-budhead b{font-size:15px;}
.bqd-x{all:unset;cursor:pointer;width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--slate);} .bqd-x:hover{background:#F1F2F4;}
.bqd-budtxt{font-size:12.5px;color:var(--slate);margin:0 0 10px;line-height:1.4;}
.bqd-tool{padding:0 !important;} .bqd-tool #finCtEg{margin:6px 0 0 !important;}
.bqd-budsub{font-size:12px;font-weight:800;color:var(--slate);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.03em;}
.bqd-budwrap{max-height:320px;overflow:auto;border:1px solid #EEF0F3;border-radius:10px;}
.bqd-budtbl{width:100%;border-collapse:collapse;font-size:12.5px;}
.bqd-budtbl th{position:sticky;top:0;background:#F7F8FA;text-align:left;font-size:11.5px;font-weight:800;color:var(--slate);padding:7px 10px;}
.bqd-budtbl td{padding:6px 10px;border-top:1px solid #F0F1F4;font-variant-numeric:tabular-nums;}
.bqd-budtbl .num{text-align:right;white-space:nowrap;} .bqd-budtbl td.neg{color:var(--red);} .bqd-budtbl td.warn{color:#B45309;font-weight:700;}
.bqd-budtbl small{font-size:11px;color:var(--slate);margin-left:4px;}
.bqd-budtbl tr.bqd-tot td{font-weight:800;background:#FAFBFC;}
/* lines: shorter boxes */
${L} #finCtBulk{margin-top:8px;padding:6px 12px;font-size:13px;}
${L} #finCtBulk:empty{display:none !important;}
${L} .fincrow{padding:7px 0 !important;}
${L} .fincrow-head{grid-template-columns:18px 64px minmax(0,1fr) 30px !important;gap:6px !important;}
${L} .fincrow-head input[type=text], ${L} .fincrow-head textarea{height:32px !important;min-height:32px !important;padding:5px 10px !important;font-size:13.5px !important;line-height:20px !important;border-radius:8px !important;box-sizing:border-box;}
${L} .fincrow-head textarea{resize:vertical;overflow:hidden;}
${L} .fincrow-menu{width:30px;height:30px;font-size:18px;}
/* section / sub-section: one line with the total */
${L} .fincrow.section, ${L} .fincrow.subsection{display:flex;align-items:center;gap:6px;padding:6px 8px !important;}
${L} .fincrow.section > .fincrow-head, ${L} .fincrow.subsection > .fincrow-head{display:contents;}
${L} .fincrow.section .fincsel, ${L} .fincrow.subsection .fincsel{flex:none;}
${L} .fincrow.section .fincline-ref, ${L} .fincrow.subsection .fincline-ref{flex:0 0 64px;width:64px !important;}
${L} .fincrow.section .fincrow-title, ${L} .fincrow.subsection .fincrow-title{flex:1 1 auto;min-width:0;}
${L} .fincrow.section .fincrow-foot, ${L} .fincrow.subsection .fincrow-foot{order:2;flex:none;margin:0 0 0 8px !important;gap:8px;}
${L} .fincrow.section .fincrow-foot b, ${L} .fincrow.subsection .fincrow-foot b{min-width:100px;text-align:right;font-size:14px;}
${L} .fincrow.section .fincrow-menu, ${L} .fincrow.subsection .fincrow-menu{order:3;}
/* the number boxes, 0.9 of the old size */
${L} .fincrow.item{margin-left:12px !important;}
${L} .fincpills{gap:4px;margin:6px 0 0 0;}
${L} .fincpill{height:29px;padding:0 2px 0 7px;font-size:11.3px;border-radius:7px;gap:5px;}
${L} .fincpill input{height:23px !important;font-size:12.2px !important;padding:0 4px !important;border-radius:5px;font-variant-numeric:tabular-nums;background:rgba(30,50,80,.06);box-shadow:inset 0 0 0 1px rgba(30,50,80,.14);}
${L} .fincpill input:focus{background:#fff;box-shadow:inset 0 0 0 1.5px var(--blue,#2F6FDE);}
${L} .fincpill input:disabled{background:transparent;box-shadow:none;color:var(--ink);-webkit-text-fill-color:var(--ink);opacity:1;cursor:default;}
${L} .fincpill input:disabled::placeholder{color:#A9B0BA;-webkit-text-fill-color:#A9B0BA;}
${L} .fincpill input[data-bqn=q]{width:calc(var(--bq-q,4ch) + 10px) !important;}
${L} .fincpill input[data-bqn=u]{width:calc(var(--bq-u,4ch) + 10px) !important;}
${L} .fincpill input[data-bqn=cr]{width:calc(var(--bq-cr,6ch) + 10px) !important;}
${L} .fincpill input[data-bqn=cp]{width:calc(var(--bq-cp,8ch) + 10px) !important;}
${L} .fincpill input[data-bqn=sr]{width:calc(var(--bq-sr,6ch) + 10px) !important;}
${L} .fincpill input[data-bqn=sp]{width:calc(var(--bq-sp,8ch) + 10px) !important;}
${L} .fincpill.mg{padding-right:8px;}
${L} .fincpill input[data-bqn=u]::-webkit-calendar-picker-indicator{display:none !important;}
${L} .fincpill input[data-bqn=u]{text-align:left;}
${L} .fincpill-mg{gap:5px;} ${L} .fincpill-mg b{font-size:12.2px;} ${L} .fincpill-mg em{font-size:10.8px;}
${L} .fincpills .fincrow-plot{height:29px;font-size:11.3px;}
/* bottom: summary, actions, export */
${L} .bqd-foot{margin-top:12px;padding-top:4px;border-top:1px solid #E3E6EB;}
${L} .bqd-sum{margin:12px 0 14px !important;}
${L} .bqd-sum[hidden]{display:none !important;}
${L} .bqd-sum[hidden] + .bqd-acts{margin-top:12px;}
${L} .bqd-sum > span{min-width:140px;}
${L} .bqd-sum > span.warn{background:#FFF7EB;} ${L} .bqd-sum > span.bad{background:#FDECEC;} ${L} .bqd-sum > span.ok{background:#EAF6EE;}
${L} .bqd-sum b small{font-size:12px;font-weight:600;color:var(--slate);margin-left:8px;}
${L} .bqd-sum i{font-style:normal;font-size:11.5px;font-weight:600;color:#B45309;margin-top:1px;}
${L} .bqd-sum .bqd-cnt b{font-size:13.5px;line-height:22px;}
${L} .bqd-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
${L} .bqd-acts .darkbtn, ${L} .bqd-acts .ghostbtn{width:auto !important;flex:none !important;margin:0 !important;height:38px;min-height:38px !important;padding:0 18px !important;font-size:13.5px !important;border-radius:10px !important;}
${L} .bqd-sowst{font-size:12.5px;color:var(--slate);}
${L} .bqd-acts .fincontot{margin-left:auto;}
${L} .bqd-acts .fincontot > :not(.finctauto){display:none !important;}
${L} .bqd-hint{font-size:12px;color:var(--slate);margin:10px 0 0;line-height:1.4;}
/* 25 Oct (Andy): smaller tick boxes and buttons, "+ Add ▾", boxes across the whole row */
${L} .fincsel, ${L} .fincsel input[type=checkbox], ${L} input[type=checkbox].fincsel{width:14px !important;height:14px !important;min-width:14px;margin:0 !important;transform:none;}
${L} .fincrow-head{grid-template-columns:14px 64px minmax(0,1fr) 30px !important;}
${L} #finCtBulk input[type=checkbox]{width:14px !important;height:14px !important;}
${L} .finboqadd .ghostbtn{height:28px !important;min-height:28px !important;padding:0 10px !important;font-size:12.5px !important;border-radius:7px !important;}
${L} .bqd-budbtn{margin-right:4px !important;gap:4px !important;}
${L} .bqd-addwrap{position:relative;display:inline-flex;}
${L} .bqd-addbtn span{font-size:10px;color:var(--slate);margin-left:2px;}
${L} .bqd-addmenu{position:absolute;right:0;top:calc(100% + 6px);z-index:31;min-width:230px;background:#fff;border:1px solid #E1E4EA;border-radius:10px;box-shadow:0 12px 30px rgba(16,24,40,.16);padding:5px;display:flex;flex-direction:column;}
${L} .bqd-addmenu[hidden]{display:none !important;}
${L} .bqd-addmenu button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;padding:7px 10px;border-radius:7px;text-align:left;}
${L} .bqd-addmenu button:hover, ${L} .bqd-addmenu button:focus-visible{background:#F4F6F9;}
${L} .bqd-addmenu b{font-size:13px;} ${L} .bqd-addmenu em{font-style:normal;font-size:11.5px;color:var(--slate);}
${L} .bqd-acts .darkbtn, ${L} .bqd-acts .ghostbtn{height:30px !important;min-height:30px !important;padding:0 12px !important;font-size:12.5px !important;border-radius:8px !important;}
${L} .fincrow.item .fincpills{display:flex !important;flex-wrap:nowrap;gap:4px;width:100%;}
${L} .fincrow.item .fincpill{flex:1 1 auto;min-width:max-content;justify-content:space-between;}
${L} .fincrow.item .fincpill input{flex:1 1 auto;max-width:none;text-align:right;}
${L} .fincrow.item .fincpill input[data-bqn=u]{text-align:left;}
${L} .fincrow.item .fincpill.mg{flex:1 1 auto;justify-content:flex-start;}
${L} .fincrow.item .fincpills .fincrow-plot{flex:1 1 auto;min-width:max-content;}
/* upload, top right of the tab row */
html.desk .finboqsub{align-items:center;}
html.desk .finboqsub .bqd-up{margin-left:auto;display:flex;align-items:center;gap:12px;padding:0 2px;flex:none;}
html.desk .finboqsub:not(.bqd-onboq) .bqd-up{display:none;}
html.desk .finboqsub .bqd-up button.bqd-upbtn{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border:1px solid #D9DDE3;border-radius:8px;background:#fff;font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap;}
html.desk .finboqsub .bqd-up button.bqd-upbtn:hover{background:#F6F7F9;}
html.desk .finboqsub .bqd-up button.bqd-lastup{all:unset;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--slate);text-decoration:underline;white-space:nowrap;}`;
  document.head.appendChild(st);
})();
