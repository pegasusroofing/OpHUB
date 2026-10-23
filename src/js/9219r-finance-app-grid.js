/* ============================================================
   OpHUB Finance — application lines as a table (23 Oct 2026, Andy):
   "the measure, rate, total etc on 1 line … have row titles: item, measure, unit,
   applied %, applied £, applied total, cert %, cert £, cert total";
   variations and dayworks fold away; the summary has a heading that follows the
   stage (Application / Certificate / Invoice Summary); section bars and the title
   row use the company colours.
   Applied £ / Cert £ = this time: the line's total to date less what was certified
   on it last time (so they add up to the amount due before retention/discount).
   ============================================================ */
let finGridPrevLoading = null;
function finGridPrev(){ return (typeof finCertPrev!=='undefined' && finCertPrev && finApp && finCertPrev.appId===finApp.id) ? finCertPrev : null; }
function finGridCertPct(l){
  if(finCertMode()){ const W = finCertWorkInit(); return finPct(W.lines[l.item_id]); }
  const c = (finApp.cert_lines||[]).find(x=>x.item_id===l.item_id);
  return finPct(c ? c.pct : l.pct);
}
function finGridCols(){ return finCertMode() || finCertShowMode() || (finApp && finApp.cert_net!=null); }
function finGridHeadHtml(cert){
  return `<div class="fing-row fing-head${cert?' c':''}"><span class="fing-item">Item</span><span>Measure</span><span>Unit</span><span>Rate</span><span>Total</span>
    <span class="fing-a" title="% complete to date">Applied %</span><span class="fing-a" title="Applied to date">Applied<br>Cumulative</span><span class="fing-a" title="Certified on the last certificate">Applied<br>Previous</span><span class="fing-a" title="This application: cumulative less previous">Applied<br>Current</span>
    ${cert ? `<span class="fing-c" title="% certified to date">Cert %</span><span class="fing-c" title="Certified to date">Cert<br>Cumulative</span><span class="fing-c" title="Certified on the last certificate">Cert<br>Previous</span><span class="fing-c" title="This certificate: cumulative less previous">Cert<br>Current</span>` : ''}</div>`;
}
finAppPaintLines = function(){
  const el = document.getElementById('finAppLines'); if(!el || !finApp) return;
  const locked = finAppCtx.locked, cert = finGridCols(), cmode = finCertMode();
  const P = finGridPrev();
  if(!P && !finGridPrevLoading && typeof finCertPrevLoad==='function'){
    const id = finApp.id;
    finGridPrevLoading = finCertPrevLoad().then(()=>{ finGridPrevLoading = null;
      if(!finApp || finApp.id!==id) return;
      if(finCertMode() && !(finApp.cert_lines||[]).length) finCertWork = null;
      finAppPaintLines(); finAppPaint(); if(finCertMode()) finCertRecalc(); }).catch(()=>{ finGridPrevLoading = null; });
  }
  const lines = finApp.lines || [];
  let html = finGridHeadHtml(cert), hiddenSec = false, hiddenSub = false, shown = 0;
  lines.forEach((l,i)=>{
    if(l.kind==='section'){ hiddenSec = !!finAppCollapsed[i]; hiddenSub = false;
      html += `<div class="finapphead sec" onclick="finAppToggle(${i})"><span><span class="finarrow">${hiddenSec?'▶':'▼'}</span>${escapeHtml(l.ref?l.ref+' ':'')}${escapeHtml(l.description)}</span><b id="finAppH-${i}"></b></div>`;
      if(!locked && !hiddenSec) html += `<div class="finappfill"><button class="linkbtn" onclick="finAppFillGroup(${i},100)">Set all to 100%</button><button class="linkbtn" style="color:var(--slate);" onclick="finAppFillGroup(${i},0)">Set all to 0%</button></div>`;
      return; }
    if(l.kind==='subsection'){ hiddenSub = !!finAppCollapsed[i]; if(hiddenSec) return;
      html += `<div class="finapphead sub" onclick="finAppToggle(${i})"><span><span class="finarrow">${hiddenSub?'▶':'▼'}</span>${escapeHtml(l.ref?l.ref+' ':'')}${escapeHtml(l.description)}</span><b id="finAppH-${i}"></b></div>`;
      return; }
    if(hiddenSec || hiddenSub) return;
    if(finAppValued && !finPct(l.pct)) return;
    shown++;
    const hasQty = l.qty!=null && !isNaN(Number(l.qty)) && Number(l.qty)!==0;
    const mode = finAppMode==='qty' && !hasQty ? 'pct' : finAppMode;
    const p = finPct(l.pct), at = finRound(Number(l.value||0)*p/100);
    const sp = finAppCtx.siteProgress && finAppCtx.siteProgress[l.item_id]!=null ? `<span class="finsitepct ${finAppCtx.siteProgress[l.item_id] > p ? 'ahead' : ''}">Site ${finAppCtx.siteProgress[l.item_id]}%</span>` : '';
    let aPct;
    if(locked) aPct = `${p}%${hasQty?`<em>${finQtyFmt(finRound(Number(l.qty)*p/100))} ${escapeHtml(l.unit||'')}</em>`:''}`;
    else if(mode==='qty') aPct = `<input type="text" inputmode="decimal" class="fing-in" id="finAppQ-${i}" value="${finRound(Number(l.qty)*p/100)}" title="${escapeHtml(l.unit||'Qty')} done" oninput="finAppSetLine(${i},'qty',this.value);finGridRow(${i})"><em id="fingP-${i}">${p}%</em>`;
    else if(mode==='gbp') aPct = `<span id="fingP-${i}">${p}%</span>`;
    else aPct = `<input type="text" inputmode="decimal" class="fing-in" id="finAppP-${i}" value="${p}" oninput="finAppSetLine(${i},'pct',this.value);finGridRow(${i})">`;
    const aTot = !locked && mode==='gbp' ? `<input type="text" inputmode="decimal" data-money class="fing-in w" id="finAppM-${i}" value="${at}" oninput="finAppSetLine(${i},'gbp',this.value);finGridRow(${i})"><b id="finAppG-lines-${i}" data-cert="1" hidden></b>` : `<b id="finAppG-lines-${i}" data-cert="1">${finMoney(at)}</b>`;
    let cCells = '';
    if(cert){
      const cp = finGridCertPct(l), ct = finRound(Number(l.value||0)*cp/100);
      cCells = `<span class="fing-c" data-l="Cert %">${cmode ? `<input type="text" inputmode="decimal" class="fing-in cert" value="${cp}" oninput="finCertSet('L','${l.item_id}',this.value);finGridRow(${i})">` : cp+'%'}</span>
        <span class="fing-c tot" data-l="Cert Cumulative" id="finCertG-L-${l.item_id}">${finMoney(ct)}</span>
        <span class="fing-c prev" data-l="Cert Previous">${P ? finMoney(finGridPrevTot(l, P)) : '…'}</span>
        <span class="fing-c" data-l="Cert Current" id="fingCP-${i}">${P ? finMoney(finRound(ct - finGridPrevTot(l, P))) : '…'}</span>`;
    }
    html += `<div class="fing-row${cert?' c':''}">
      <span class="fing-item">${escapeHtml(l.ref?l.ref+' · ':'')}${escapeHtml(l.description)} ${sp}${hasQty ? `<em class="fing-m">${finQtyFmt(l.qty)} ${escapeHtml(l.unit||'')} × ${finRateFmt(l.rate)}</em>` : ''}</span>
      <span class="num" data-l="Measure">${hasQty ? finQtyFmt(l.qty) : '—'}</span>
      <span data-l="Unit">${escapeHtml(l.unit||'—')}</span>
      <span class="num" data-l="Rate">${hasQty ? finRateFmt(l.rate) : '—'}</span>
      <span class="num" data-l="Total">${finMoney(l.value)}</span>
      <span class="fing-a" data-l="Applied %">${aPct}</span>
      <span class="fing-a tot" data-l="Applied Cumulative">${aTot}</span>
      <span class="fing-a prev" data-l="Applied Previous">${P ? finMoney(finGridPrevTot(l, P)) : '…'}</span>
      <span class="fing-a" data-l="Applied Current" id="fingAP-${i}">${P ? finMoney(finRound(at - finGridPrevTot(l, P))) : '…'}</span>
      ${cCells}
    </div>`;
  });
  el.innerHTML = `<div class="fing">${html}${shown ? '' : `<div class="empty" style="margin:8px 0 0;">${finAppValued ? 'Nothing valued yet.' : 'No lines.'}</div>`}</div>`;
  finAppToolsPaint();
  if(typeof finCertDecorate==='function') finCertDecorate();
};
function finGridPrevTot(l, P){ const pp = P && P.lines[l.item_id]!=null ? finPct(P.lines[l.item_id]) : 0; return finRound(Number(l.value||0)*pp/100); }
// Refresh the worked-out cells on one row after typing (leaves the box you're in alone).
window.finGridRow = function(i){
  const l = finApp && finApp.lines[i]; if(!l) return;
  const P = finGridPrev(), p = finPct(l.pct), at = finRound(Number(l.value||0)*p/100);
  const pe = document.getElementById('fingP-'+i); if(pe) pe.textContent = p+'%';
  const ap = document.getElementById('fingAP-'+i); if(ap && P) ap.textContent = finMoney(finRound(at - finGridPrevTot(l, P)));
  const g = document.getElementById('finAppG-lines-'+i); if(g) g.textContent = finMoney(at);
  if(finGridCols()){ const ct = finRound(Number(l.value||0)*finGridCertPct(l)/100);
    const cp = document.getElementById('fingCP-'+i); if(cp && P) cp.textContent = finMoney(finRound(ct - finGridPrevTot(l, P))); }
};

/* ---------- Summary heading follows the stage ---------- */
function finSumTitle(){
  if(!finApp) return '';
  return finApp.invoice_id || finApp.status==='invoiced' ? 'Invoice Summary' : (['submitted','certified'].includes(finApp.status) || finApp.cert_net!=null) ? 'Certificate Summary' : 'Application Summary';
}
function finSumTitleEnsure(){
  const s = document.getElementById('finAppSummary'); if(!s || s.querySelector('.finsumtitle')) return;
  s.insertAdjacentHTML('afterbegin', `<p class="sectiontitle finsumtitle">${finSumTitle()}</p>`);
}
/* ---------- Variations and Dayworks fold away ---------- */
function finFoldTotals(){
  if(!finApp || !finAppCtx) return;
  const c = finAppCalc(finApp, finAppCtx.jf.contract_value, finAppCtx.jf.retention_limit_pct, finAppCtx.previous);
  const set = (k, list)=>{ const el = document.getElementById('finFoldT-'+k); if(!el) return;
    let txt = list.length ? finMoney(list.reduce((t,x)=>t+x.gross,0)) : '';
    if(list.length && finGridCols() && typeof finCertTotals==='function'){ const t = finCertTotals().lines.filter(x=>k==='variations' ? x.var_index!=null : x.day_index!=null); txt = 'Applied '+txt+' · Cert '+finMoney(t.reduce((s,x)=>s+x.gross,0)); }
    el.textContent = txt; };
  set('variations', c.variations); set('dayworks', c.dayworks);
}
(function(){
  const ap = window.finAppPaint;
  window.finAppPaint = function(){ const r = ap.apply(this, arguments); finSumTitleEnsure(); finFoldTotals(); return r; };
  const rc = finCertRecalc;
  finCertRecalc = function(){ const r = rc.apply(this, arguments); finSumTitleEnsure(); finFoldTotals(); return r; };
  const cs = window.finCertSet;
  window.finCertSet = function(){ const r = cs.apply(this, arguments); finFoldTotals(); return r; };
  const base = renderFinApplication;
  renderFinApplication = async function(siteId, appId){
    const r = await base.apply(this, arguments);
    document.querySelectorAll('.card > p.sectiontitle').forEach(t=>{
      const k = t.textContent.trim(); if(k!=='Variations' && k!=='Dayworks') return;
      const card = t.parentNode; if(card.tagName==='DETAILS') return;
      const key = k.toLowerCase(), n = (finApp && finApp[key] || []).length;
      const d = document.createElement('details'); d.className = 'card finfold';
      d.innerHTML = `<summary><span class="finfold-t">${k}${n ? ` <em>${n}</em>` : ''}</span><b id="finFoldT-${key}"></b><span class="finfold-a">▾</span></summary><div class="finfold-b"></div>`;
      const body = d.querySelector('.finfold-b');
      t.remove(); while(card.firstChild) body.appendChild(card.firstChild);
      card.replaceWith(d);
    });
    finFoldTotals(); finSumTitleEnsure();
    return r;
  };
})();
(function(){
  const st = document.createElement('style');
  st.textContent = `.fing{overflow-x:auto;margin-top:8px;}
.fing-row{display:grid;grid-template-columns:minmax(120px,1fr) 56px 42px 70px 88px 64px 92px 86px 86px;gap:6px;align-items:center;padding:6px 8px;border-top:1px solid var(--line,#EEF0F3);font-size:13px;min-width:780px;}
.fing-row.c{grid-template-columns:minmax(110px,1fr) 52px 40px 66px 84px 60px 88px 80px 80px 60px 88px 80px 80px;min-width:1100px;}
.fing-row .prev{color:var(--slate) !important;font-weight:500 !important;}
.fing-head .prev, .fing-head span{line-height:1.25;}
.fing-row > span{min-width:0;font-variant-numeric:tabular-nums;}
.fing-row > span:not(.fing-item){text-align:right;}
.fing-row > span:nth-child(3){text-align:left;}
.fing-item{font-weight:600;overflow-wrap:anywhere;}
.fing-row em{display:block;font-style:normal;font-size:11px;color:var(--slate);}
.fing-row .tot b{font-weight:700;}
.fing-m{display:none !important;}
.fing-row .fing-c{color:#1E6B45;font-weight:600;} .fing-row .fing-c.tot{font-weight:800;}
.fing-head{background:var(--brand1);color:var(--brand1-text,#fff);border-radius:9px 9px 0 0;border-top:0;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.02em;padding:9px 8px;line-height:1.2;}
.fing-head .fing-c{color:var(--brand1-text,#fff);}
.fing-in{width:100% !important;max-width:72px;height:30px !important;min-height:30px !important;padding:0 8px !important;text-align:right;font-size:13.5px !important;border-radius:7px !important;margin:0 !important;box-sizing:border-box;}
.fing-in.w{max-width:100px;}
.fing-in.cert{border:1.5px solid #2E9E5B !important;background:#F3FBF6 !important;}
.fing .finapphead{min-width:780px;}
.fing-row.c ~ .finapphead, .fing-head.c ~ .finapphead{min-width:1100px;}
#finAppLines .fing .finapphead.sec{background:var(--brand1) !important;background:color-mix(in srgb, var(--brand1) 80%, #000) !important;color:var(--brand1-text,#fff) !important;border-radius:0 !important;margin-top:0 !important;padding:8px 10px !important;}
#finAppLines .fing .finapphead.sub{background:#EEF1F5 !important;background:color-mix(in srgb, var(--brand1) 12%, #fff) !important;color:var(--ink) !important;border-radius:0 !important;margin-top:0 !important;padding:7px 10px !important;}
#finAppLines .fing .finappfill{padding:4px 8px !important;margin:0 !important;}
#finAppLines .fing .finappfill .linkbtn:first-child{color:var(--brand1);}
.finsumtitle{margin:0 0 6px !important;}
details.finfold{padding:0 !important;}
details.finfold > summary{list-style:none;display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;}
details.finfold > summary::-webkit-details-marker{display:none;}
.finfold-t{font-weight:800;font-size:15px;flex:1;} .finfold-t em{font-style:normal;font-size:11.5px;font-weight:800;background:#EEF1F5;border-radius:10px;padding:1px 8px;margin-left:4px;}
details.finfold > summary b{font-variant-numeric:tabular-nums;font-size:13.5px;}
.finfold-a{color:var(--slate);transition:transform .15s;} details.finfold[open] .finfold-a{transform:rotate(180deg);}
.finfold-b{padding:0 16px 14px;}
@media (max-width:700px){
  .fing{overflow:visible;}
  .fing-head{display:none;}
  .fing-row, .fing-row.c{grid-template-columns:repeat(3,minmax(0,1fr));min-width:0;gap:4px 10px;padding:8px 4px;}
  .fing-row > .fing-item{grid-column:1/-1;}
  .fing-m{display:block !important;}
  .fing-row > span:not(.fing-item){text-align:left;font-size:12.5px;}
  .fing-row > span[data-l]::before{content:attr(data-l);display:block;font-size:10px;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.03em;}
  .fing-row > span[data-l="Measure"], .fing-row > span[data-l="Unit"], .fing-row > span[data-l="Rate"]{display:none;}
  .fing-row > span[data-l="Total"]::after{content:'';}
  .fing .finapphead{min-width:0 !important;}
  .fing-in{max-width:none;}
}`;
  document.head.appendChild(st);
})();

/* 23 Oct (Andy): one "Upload client's certificate" (the box at the top) — the copy upload in
   the Certify box goes — and the Certify box is one compact row: date, more, Certify. */
(function(){
  const slot = finCertSlotRender;
  finCertSlotRender = function(a){
    slot.apply(this, arguments);
    if(!finCertMode()) return;
    const card = document.querySelector('#finCertSlot .fincertify'); if(!card || card.dataset.compact) return;
    card.dataset.compact = '1'; card.classList.add('fincertc');
    const f = card.querySelector('input[type=file]'); const ff = f && f.closest('.formfield'); if(ff) ff.remove();
    const sm = card.querySelector('.fincertmore > summary'); if(sm) sm.textContent = 'Pay-less notice / notes';
    const intro = Array.from(card.querySelectorAll('p.stub')).find(p=>/Certified %/.test(p.textContent));
    const net = finNum(finVal('finCertNet'));
    if(intro) intro.innerHTML = `Net due <b>${finMoney(net||0)}</b> excl. VAT — from the Cert % above.`;
    const date = document.getElementById('finCertDate'), save = document.getElementById('finCertSave'), more = card.querySelector('.fincertmore');
    const row = document.createElement('div'); row.className = 'fincertc-row';
    const dField = date && date.closest('.formfield'); if(dField) row.appendChild(dField);
    if(more) row.appendChild(more);
    if(save){ save.style.width = 'auto'; row.appendChild(save); }
    card.appendChild(row);
  };
  // keep the net-due line current while typing Cert %
  const rc = finCertRecalc;
  finCertRecalc = function(){ const r = rc.apply(this, arguments);
    const card = document.querySelector('#finCertSlot .fincertc'); const p = card && card.querySelector('p.stub');
    if(p) p.innerHTML = `Net due <b>${finMoney(finNum(finVal('finCertNet'))||0)}</b> excl. VAT — from the Cert % above.`;
    return r; };
  const st = document.createElement('style');
  st.textContent = `.fincertc{padding:12px 16px !important;}
.fincertc .sectiontitle{margin:0 0 2px !important;font-size:15px;}
.fincertc > p.stub{margin:0 0 8px !important;font-size:13px;}
.fincertc .fingrid2:empty, .fincertc .fingrid2{margin:0 !important;}
.fincertc-row{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;}
.fincertc-row .formfield{margin:0 !important;}
.fincertc-row .field-label{font-size:11px;margin-bottom:3px;}
.fincertc-row .fincertmore{margin:0 0 6px !important;flex:1 1 180px;}
.fincertc-row .fincertmore[open]{flex-basis:100%;order:3;}
.fincertc-row #finCertSave{margin:0 0 0 auto !important;height:36px;padding:0 22px !important;}`;
  document.head.appendChild(st);
})();
