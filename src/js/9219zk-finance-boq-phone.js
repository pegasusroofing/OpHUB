/* ============================================================
   OpHUB Finance — Bill of Quantities on the phone, refreshed (24 Oct 2026, Andy: "it's not
   clear… needs a complete refresh").
   - The list reads like a priced bill: section bars with their totals, sub-section bars,
     and one tidy row per item (ref, description, qty × rate, value, cost/margin).
   - Tap any row to edit it in a panel that slides up (all the boxes, move, delete).
   - One "＋ Add" button at the bottom asks what you're adding; each section also has its
     own "＋ Add item here".
   Computers keep the full grid.
   ============================================================ */
function finBqPhone(){ return !(typeof isDeskMode==='function' && isDeskMode()); }
function finBqGroupEnd(i){
  const r = finContractRows[i]; let j = i+1;
  while(j < finContractRows.length){
    const k = finContractRows[j].kind;
    if(k==='section' || (r.kind==='subsection' && k==='subsection')) break;
    j++;
  }
  return j;
}
function finBqQtyTxt(r){
  const q = finCrNum(r.qty), rt = finCrNum(r.rate);
  if(q!=null && rt!=null) return `${Number(q).toLocaleString('en-GB',{maximumFractionDigits:3})} ${escapeHtml(r.unit||'')} × ${finMoney(rt)}`;
  return r.unit ? escapeHtml(r.unit) : 'Lump sum';
}
function finBqPaintPhone(){
  const el = document.getElementById('finContractList'); if(!el) return;
  const rows = finContractRows || [];
  const tot = finGroupTotals(rows, r=>finItemValue(r));
  const html = [];
  rows.forEach((r, i)=>{
    if(r.kind==='section' || r.kind==='subsection'){
      html.push(`<div class="bq-${r.kind==='section'?'sec':'sub'}" onclick="finBqEdit(${i})">
        ${r.ref ? `<span class="bq-ref">${escapeHtml(r.ref)}</span>` : ''}<b class="bq-name">${escapeHtml(r.description||(r.kind==='section'?'Untitled section':'Untitled sub-section'))}</b><span class="bq-tot">${finMoney((tot[i]||{}).value||0)}</span></div>`);
    } else {
      const v = finItemValue(r), c = r.cost;
      const mg = c!=null && !isNaN(c) && v ? `<span class="bq-mg ${v-c<0?'neg':''}">Cost ${finMoney(c, 0)} · ${finPctTxt(finRound((v-c)/v*100))}</span>` : `<span class="bq-mg none">No cost yet</span>`;
      html.push(`<div class="bq-item" onclick="finBqEdit(${i})">
        <div class="bq-l1">${r.ref ? `<span class="bq-ref">${escapeHtml(r.ref)}</span>` : ''}<span class="bq-desc">${escapeHtml(r.description||'New item — tap to fill in')}</span><b class="bq-val">${v!=null && !isNaN(v) ? finMoney(v) : '£—'}</b></div>
        <div class="bq-l2"><span>${finBqQtyTxt(r)}</span>${mg}</div></div>`);
    }
    // "＋ Add item to …" after the last line under each heading
    const next = rows[i+1];
    if((!next || next.kind==='section' || next.kind==='subsection') && !(r.kind==='section' && next && next.kind==='subsection')){
      let h = -1; for(let k=i;k>=0;k--) if(rows[k].kind==='section' || rows[k].kind==='subsection'){ h = k; break; }
      if(h>=0) html.push(`<button type="button" class="bq-additem" onclick="finBqAddAt('item', ${i+1})">＋ Add item to ${escapeHtml(rows[h].description||'this section')}</button>`);
    }
  });
  el.innerHTML = rows.length ? `<div class="bq">${html.join('')}</div>` : `<div class="bq-empty"><b>No lines yet</b><span>Upload the client’s bill (Excel or PDF) below, or start with a section such as “Main Roof”.</span></div>`;
  el.insertAdjacentHTML('beforeend', `<button type="button" class="darkbtn bq-addbtn" onclick="finBqAddSheet()">＋ Add to Bill of Quantities</button><datalist id="finUnitList">${finUnitOptions().map(u=>`<option value="${escapeHtml(u)}">`).join('')}</datalist>`);
  finContractPaintTotal();
}
window.finBqAddAt = function(kind, at){
  const row = {kind, ref:'', description:'', qty:null, unit:'', rate:null, value:null};
  if(at==null || at>finContractRows.length) at = finContractRows.length;
  finContractRows.splice(at, 0, row);
  finContractPaint();
  if(typeof finContractAutoSave==='function') finContractAutoSave();
  finBqEdit(at, true);
};
window.finBqAddSheet = function(){
  const ov = finBqOv();
  ov.innerHTML = `<div class="bq-sheet"><div class="bq-sh-h"><b>Add to the Bill of Quantities</b><button type="button" class="bq-x" onclick="finBqClose()">✕</button></div>
    <button type="button" class="bq-opt" onclick="finBqAddAt('section')"><b>Section</b><span>A main heading, e.g. “Main Roof” or “Plot 3”. Its total adds up from the items under it.</span></button>
    <button type="button" class="bq-opt" onclick="finBqAddAt('subsection')"><b>Sub-section</b><span>A heading inside a section, e.g. “Slating” or “Leadwork”.</span></button>
    <button type="button" class="bq-opt" onclick="finBqAddAt('item')"><b>Item</b><span>A priced line: description, quantity, unit and rate (or a lump sum). Goes at the bottom — use “＋ Add item to…” to put it in a section.</span></button>
  </div>`;
  ov.style.display = 'flex';
};
function finBqOv(){
  let ov = document.getElementById('finBqOv');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finBqOv'; ov.className = 'bq-ov'; document.body.appendChild(ov); ov.addEventListener('click', e=>{ if(e.target===ov) finBqClose(); }); }
  return ov;
}
let finBqOpen = null;   // the line open in the sheet: {row, snap, site}
window.finBqClose = function(){
  const ov = document.getElementById('finBqOv'); if(!ov || ov.style.display==='none') return;
  ov.style.display = 'none'; ov.innerHTML = '';
  // Save if anything changed — either against the last save, or since this line was opened (review 24 Oct H1).
  const o = finBqOpen; finBqOpen = null;
  const lineChanged = !!(o && o.site===finContractSite && JSON.stringify(o.row)!==o.snap);
  finContractPaint();
  if(typeof finContractAutoSave==='function' && (lineChanged || (typeof finContractIsDirty==='function' && finContractIsDirty()))) finContractAutoSave();
};
// Leaving the page closes the sheet (and saves) so it can't sit over the next screen (review 24 Oct M5).
window.addEventListener('hashchange', ()=>{ const ov = document.getElementById('finBqOv'); if(ov && ov.style.display==='flex') finBqClose(); });
window.finBqEdit = function(i, isNew){
  const r = finContractRows[i]; if(!r) return;
  const ov = finBqOv();
  if(!finBqOpen || finBqOpen.row!==r) finBqOpen = {row:r, snap:isNew ? '' : JSON.stringify(r), site:finContractSite};
  const subs = FIN_SUBJOBS[finContractSite] || [];
  const plot = subs.length ? `<label class="bq-f"><span>${escapeHtml(finSubNoun(finContractSite))}</span><select onchange="finContractRows[${i}].sub=this.value"><option value="">${r.kind==='item' ? 'As its section' : 'None'}</option>${subs.map(a=>`<option value="${a.id}" ${r.sub===a.id?'selected':''}>${escapeHtml(a.name||a.label||'')}</option>`).join('')}</select></label>` : '';
  const kinds = Object.keys(FIN_KIND_LABEL).filter(k=>k!==r.kind);
  const acts = `<div class="bq-acts">
      ${i>0 ? `<button type="button" class="ghostbtn" onclick="finBqMove(${i},-1)">↑ Up</button>` : ''}
      ${i<finContractRows.length-1 ? `<button type="button" class="ghostbtn" onclick="finBqMove(${i},1)">↓ Down</button>` : ''}
      <select class="bq-kind" onchange="if(this.value){finContractRows[${i}].kind=this.value;finBqEdit(${i});}"><option value="">Change to…</option>${kinds.map(k=>`<option value="${k}">${escapeHtml(FIN_KIND_LABEL[k])}</option>`).join('')}</select>
      <button type="button" class="ghostbtn bq-del" onclick="finBqDelete(${i})">Remove</button>
    </div>`;
  const money = v=>v==null || isNaN(v) ? '' : finCr2(v);
  let body;
  if(r.kind==='section' || r.kind==='subsection'){
    body = `<div class="bq-g2"><label class="bq-f bq-fref"><span>Ref</span><input type="text" value="${escapeHtml(r.ref||'')}" oninput="finContractRows[${i}].ref=this.value"></label>
      <label class="bq-f"><span>${r.kind==='section'?'Section name':'Sub-section name'}</span><input type="text" id="finBqName" value="${escapeHtml(r.description||'')}" placeholder="${r.kind==='section'?'e.g. Main Roof':'e.g. Slating'}" oninput="finContractRows[${i}].description=this.value"></label></div>${plot}`;
  } else {
    const auto = finCrNum(r.qty)!==null && finCrNum(r.rate)!==null;
    body = `<div class="bq-g2"><label class="bq-f bq-fref"><span>Ref</span><input type="text" value="${escapeHtml(r.ref||'')}" oninput="finContractRows[${i}].ref=this.value"></label>
      <label class="bq-f"><span>Description</span><textarea id="finBqName" rows="2" placeholder="What the work is" oninput="finContractRows[${i}].description=this.value">${escapeHtml(r.description||'')}</textarea></label></div>
      <div class="bq-g2b"><label class="bq-f"><span>Quantity</span><input type="text" inputmode="decimal" id="finBqQty" value="${r.qty!=null && !isNaN(r.qty) ? r.qty : ''}" placeholder="—" oninput="finCrSetNum(${i},'qty',this.value)"></label>
        <label class="bq-f"><span>Unit</span><input type="text" list="finUnitList" autocomplete="off" value="${escapeHtml(r.unit||'')}" placeholder="m², nr…" oninput="finContractRows[${i}].unit=this.value"></label></div>
      <div class="bq-box sell"><span class="bq-bt">Selling price</span><div class="bq-g2b">
        <label class="bq-f"><span>Rate £</span><input type="text" inputmode="decimal" value="${money(finCrNum(r.rate))}" placeholder="0.00" oninput="finCrSetNum(${i},'rate',this.value)"></label>
        <label class="bq-f"><span>Total £</span><input type="text" inputmode="decimal" id="finCVal-${i}" value="${money(finItemValue(r))}" placeholder="0.00" ${auto?'disabled title="Quantity × rate"':''} oninput="finCrSetNum(${i},'value',this.value)"></label></div></div>
      <div class="bq-box cost"><span class="bq-bt">Cost (your budget)</span><div class="bq-g2b">
        <label class="bq-f"><span>Rate £</span><input type="text" inputmode="decimal" id="finCCR-${i}" value="${finCr2(finCrCostRate(r))}" placeholder="0.00" oninput="finCrSetCostRate(${i}, this.value)"></label>
        <label class="bq-f"><span>Total £</span><input type="text" inputmode="decimal" id="finCCost-${i}" value="${finCr2(r.cost)}" placeholder="0.00" oninput="finCrSetCostPrice(${i}, this.value)"></label></div></div>
      <div class="bq-mgline">Margin <span id="finCMg-${i}" class="fincpill-mg">${finCrMarginHtml(r)}</span></div>
      <p class="bq-hint">Leave quantity and rate empty for a lump sum and type the total.</p>${plot}`;
  }
  ov.innerHTML = `<div class="bq-sheet"><div class="bq-sh-h"><b>${isNew?'New ':'Edit '}${escapeHtml(FIN_KIND_LABEL[r.kind]||'Line')}</b><button type="button" class="bq-x" onclick="finBqClose()">✕</button></div>
    ${body}${acts}
    <button type="button" class="darkbtn bq-done" id="finBqDone" onclick="finBqClose()">Done</button></div>`;
  ov.style.display = 'flex';
  if(isNew) setTimeout(()=>{ const n = document.getElementById('finBqName'); if(n) n.focus(); }, 80);
};
window.finBqMove = function(i, d){ const j = i+d; if(j<0 || j>=finContractRows.length) return; finContractMove(i, d); finBqEdit(j); };
window.finBqDelete = async function(i){
  const r = finContractRows[i]; if(!r) return;
  const what = r.description ? '“'+r.description+'”' : 'this line';
  // Hide the sheet first, or the question opens behind it (review 24 Oct H2).
  const ov = document.getElementById('finBqOv'); if(ov) ov.style.display = 'none';
  if(!await customConfirm(`Remove ${what} from the Bill of Quantities?`, {confirmLabel:'Remove'})){ if(ov) ov.style.display = 'flex'; return; }
  finBqOpen = null;
  finContractRows.splice(i, 1);
  if(ov){ ov.style.display = 'none'; ov.innerHTML = ''; }
  finContractPaint();
  if(typeof finContractAutoSave==='function') finContractAutoSave();
};
(function(){
  const desk = finContractPaint;
  finContractPaint = function(){ return finBqPhone() ? finBqPaintPhone() : desk.apply(this, arguments); };
  window.finContractPaint = finContractPaint;
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && document.getElementById('finBqOv') && document.getElementById('finBqOv').style.display==='flex'){ e.stopPropagation(); finBqClose(); } }, true);
  const st = document.createElement('style');
  st.textContent = `html:not(.desk) .finboqadd, html:not(.desk) #finCtBulk, html:not(.desk) .finboqpane .row-gap:has(> button[onclick*="finContractAdd"]){display:none !important;}
.bq{display:flex;flex-direction:column;gap:6px;}
.bq-sec,.bq-sub{display:flex;align-items:center;gap:8px;cursor:pointer;border-radius:10px;}
.bq-sec{background:var(--brand1,#E3262B);color:var(--brand1-text,#fff);padding:10px 12px;margin-top:6px;}
.bq-sec:first-child{margin-top:0;}
.bq-sub{background:#EEF1F5;background:color-mix(in srgb, var(--brand1,#E3262B) 10%, #fff);padding:8px 12px;}
.bq-name{flex:1;min-width:0;font-size:14.5px;}
.bq-sub .bq-name{font-size:13.5px;}
.bq-tot{font-weight:800;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap;}
.bq-ref{font-size:11.5px;font-weight:800;opacity:.75;flex:none;}
.bq-item{border:1px solid var(--line,#ECEEF2);border-radius:10px;padding:8px 10px;cursor:pointer;background:#fff;}
.bq-item:active{background:#F6F7F9;}
.bq-l1{display:flex;align-items:flex-start;gap:8px;}
.bq-desc{flex:1;min-width:0;font-size:13.5px;font-weight:600;line-height:1.3;}
.bq-val{font-size:14px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums;}
.bq-l2{display:flex;justify-content:space-between;gap:8px;margin-top:3px;font-size:12px;color:var(--slate);}
.bq-mg{font-weight:600;color:#1E7A43;white-space:nowrap;} .bq-mg.neg{color:var(--red);} .bq-mg.none{color:#B45309;}
.bq-item .bq-ref{color:var(--slate);margin-top:2px;}
.bq-additem{all:unset;box-sizing:border-box;cursor:pointer;font-size:12.5px;font-weight:700;color:var(--brand1,#E3262B);padding:2px 4px 6px 12px;}
.bq-addbtn{display:block !important;width:100% !important;margin:12px 0 0 !important;padding:12px !important;font-size:15px !important;}
.bq-empty{display:flex;flex-direction:column;gap:4px;text-align:center;padding:18px 8px;color:var(--slate);font-size:13px;} .bq-empty b{color:var(--ink);font-size:15px;}
.bq-ov{position:fixed;inset:0;background:rgba(17,24,39,.45);z-index:10050;display:none;align-items:flex-end;justify-content:center;}
.bq-sheet{background:#fff;width:100%;max-width:560px;max-height:88vh;overflow:auto;border-radius:18px 18px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.18);}
.bq-sh-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;} .bq-sh-h b{font-size:16px;}
.bq-x{all:unset;cursor:pointer;width:32px;height:32px;border-radius:9px;background:#F1F2F4;display:flex;align-items:center;justify-content:center;font-weight:800;}
.bq-opt{all:unset;box-sizing:border-box;display:block;width:100%;cursor:pointer;border:1px solid var(--line,#ECEEF2);border-radius:12px;padding:12px 14px;margin-bottom:8px;}
.bq-opt b{display:block;font-size:15px;margin-bottom:2px;} .bq-opt span{font-size:12.5px;color:var(--slate);line-height:1.35;}
.bq-opt:active{background:#F6F7F9;}
.bq-f{display:flex;flex-direction:column;gap:3px;min-width:0;margin-bottom:8px;} .bq-f > span{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--slate);}
.bq-f input,.bq-f textarea,.bq-f select{width:100% !important;box-sizing:border-box;min-height:38px !important;height:auto;margin:0 !important;font-size:15px !important;padding:8px 10px !important;border-radius:9px !important;}
.bq-f input:disabled{background:#F6F7F9;color:var(--ink);opacity:1;}
.bq-g2{display:grid;grid-template-columns:78px minmax(0,1fr);gap:8px;}
.bq-g2b{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.bq-box{border-radius:12px;padding:8px 10px 0;margin-bottom:8px;} .bq-box.sell{background:#F4F8FF;} .bq-box.cost{background:#FFFBF2;}
.bq-bt{display:block;font-size:12px;font-weight:800;margin-bottom:4px;}
.bq-mgline{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--slate);margin:2px 0 6px;}
.bq-hint{font-size:11.5px;color:var(--slate);margin:0 0 8px;}
.bq-acts{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px;}
.bq-acts .ghostbtn,.bq-acts select{width:auto !important;margin:0 !important;padding:6px 10px !important;font-size:13px !important;min-height:34px !important;height:34px !important;}
.bq-del{color:var(--red) !important;margin-left:auto !important;}
.bq-done{width:100% !important;margin:0 !important;}`;
  document.head.appendChild(st);
})();

/* Variations / Day Works (24 Oct, Andy): the three totals fit on one row on a phone, and
   Excel / PDF move to a quiet "Export" line at the bottom. */
(function(){
  const tidy = id=>{
    const box = document.getElementById(id); if(!box) return;
    const btns = Array.from(box.querySelectorAll('button')).filter(b=>/Export\(/.test(b.getAttribute('onclick')||''));
    if(!btns.length) return;
    const wrap = document.createElement('div'); wrap.className = 'finexp'; wrap.innerHTML = '<span>Export:</span>';
    btns.forEach(b=>{ b.className = 'linkbtn'; b.removeAttribute('style'); wrap.appendChild(b); });
    box.appendChild(wrap);
  };
  if(typeof finCtVariationsFill==='function'){ const v = finCtVariationsFill; finCtVariationsFill = async function(){ const r = await v.apply(this, arguments); tidy('finCtVars'); return r; }; }
  if(typeof finDwFill==='function'){ const d = finDwFill; finDwFill = async function(){ const r = await d.apply(this, arguments); tidy('finDwCard'); return r; }; }
  const st = document.createElement('style');
  st.textContent = `.finexp{display:flex;align-items:center;gap:12px;justify-content:flex-end;margin-top:12px;padding-top:8px;border-top:1px solid var(--line,#ECEEF2);font-size:12.5px;color:var(--slate);}
.finexp button.linkbtn{font-size:12.5px !important;padding:0 !important;margin:0 !important;color:var(--slate) !important;font-weight:600 !important;text-decoration:underline;}
@media (max-width:700px){
  .finboqtot{display:grid !important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px !important;}
  .finboqtot > span{min-width:0 !important;padding:7px 8px !important;}
  .finboqtot em{font-size:10.5px !important;} .finboqtot b{font-size:14px !important;white-space:nowrap;}
}`;
  document.head.appendChild(st);
})();
