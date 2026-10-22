/* ============================================================
   OpHUB Finance — purchase invoice review (21 Oct 2026, Andy: "do 1, 2, 3, 5"
   from the Coreloops / Construction Manager review).
   1. On a computer an invoice opens docked on the right of the Purchases list,
      with the invoice itself shown above its details (the pop-up is kept on
      phones). Same markup and buttons as before — only where it sits changes.
   2. Code each line: every line on the invoice can go to its own project and
      cost type. Saved as the invoice's split (917) with a cost type per part,
      so job costs and reports pick it up.
   3. Checks column on the list: PO matched / differs, goods received / not /
      problem, at a glance.
   5. Tick several to approve (To approve) or mark paid (Approved, not paid).
   ============================================================ */

/* ---------- 3. checks on each row ---------- */
let FIN_PO_GRN = {}; // po_id -> 'all' | 'some' | 'none' | 'problem' | 'na'
let finPoGrnLoading = false;
function finPiChecksHtml(i, po){
  const out = [];
  if(!po) out.push('<span class="finpill grey">No PO</span>');
  else if(i.match_notes) out.push('<span class="finpill warn" title="'+escapeHtml(i.match_notes)+'">Differs from PO</span>');
  else out.push(`<span class="finpill ${i.lines && i.lines.length ? 'ok' : 'blue'}">${i.lines && i.lines.length ? 'Matches PO' : 'PO linked'}</span>`);
  if(po){
    const g = FIN_PO_GRN[po.id];
    if(g===undefined) finPoGrnEnsure();
    if(g==='all') out.push('<span class="finpill ok">Received</span>');
    else if(g==='some') out.push('<span class="finpill warn">Part received</span>');
    else if(g==='none') out.push('<span class="finpill warn">Not received</span>');
    else if(g==='problem') out.push('<span class="finpill bad">Delivery problem</span>');
  }
  if(Array.isArray(i.split) && i.split.length > 1) out.push(`<span class="finpill blue">Split ${i.split.length} ways</span>`);
  return `<span class="finpi-checks">${out.join('')}</span>`;
}
function finPoGrnEnsure(){
  if(finPoGrnLoading) return;
  finPoGrnLoading = true;
  setTimeout(async ()=>{
    try{
      const pos = await dbSelect('purchase_orders', 'org_id=eq.'+ME.org_id+'&select=id,material_ids&limit=3000');
      const ids = Array.from(new Set(pos.flatMap(p=>p.material_ids||[])));
      const mats = {};
      for(let k=0; k<ids.length; k+=150){
        const part = ids.slice(k, k+150);
        (await dbSelect('materials', 'id=in.('+part.join(',')+')&select=id,grn')).forEach(m=>{ mats[m.id] = m; });
      }
      const next = {};
      pos.forEach(p=>{
        const ms = (p.material_ids||[]).map(id=>mats[id]).filter(Boolean);
        if(!ms.length){ next[p.id] = 'na'; return; }
        if(ms.some(m=>m.grn && m.grn.ok===false)) next[p.id] = 'problem';
        else if(ms.every(m=>m.grn)) next[p.id] = 'all';
        else if(ms.some(m=>m.grn)) next[p.id] = 'some';
        else next[p.id] = 'none';
      });
      const changed = JSON.stringify(next) !== JSON.stringify(FIN_PO_GRN);
      FIN_PO_GRN = next;
      if(changed && /^#\/finance\/purchases/.test(location.hash)) render();
    }catch(e){} finally { setTimeout(()=>{ finPoGrnLoading = false; }, 30000); }
  }, 50);
}

/* ---------- 5. tick several ---------- */
let finPiSel = new Set();
function finPiBulkOn(){ return finPiF==='approve' || finPiF==='unpaid'; }
window.finPiSelToggle = function(id){ if(finPiSel.has(id)) finPiSel.delete(id); else finPiSel.add(id); render(); };
window.finPiSelAll = function(on, ids){ String(ids||'').split(',').filter(Boolean).forEach(id=>{ if(on) finPiSel.add(id); else finPiSel.delete(id); }); render(); };
function finPiBulkBarHtml(list){
  if(!finPiBulkOn()) return '';
  const ids = new Set(list.map(i=>i.id));
  finPiSel = new Set(Array.from(finPiSel).filter(id=>ids.has(id)));
  const n = finPiSel.size; if(!n) return '';
  const sel = list.filter(i=>finPiSel.has(i.id));
  const tot = sel.reduce((t,i)=>t+Number(i.total||0), 0);
  return `<div class="finpi-bulk"><b>${n} selected · ${finMoney(tot)}</b>
    ${finPiF==='approve' ? `<button class="darkbtn" onclick="finPiBulkApprove()">✓ Approve ${n}</button>` : `<button class="darkbtn" onclick="finPiBulkPaid()">Mark ${n} paid</button>`}
    <button class="ghostbtn" onclick="finPiSel=new Set();render()">Clear</button></div>`;
}
window.finPiBulkApprove = async function(){
  const ids = Array.from(finPiSel); if(!ids.length) return;
  const all = await dbSelect('purchase_invoices', 'id=in.('+ids.join(',')+')&select=id,status,query_note,po_id');
  const rows = all.filter(r=>['to_approve','query'].includes(r.status)); // leave anything rejected / approved since
  if(!rows.length){ toast('None of those are waiting for approval.'); return; }
  const q = rows.filter(r=>r.status==='query');
  if(!(await customConfirm(`Approve ${rows.length} purchase invoice${rows.length===1?'':'s'}?${rows.length<ids.length?` (${ids.length-rows.length} skipped — not waiting for approval)`:''}`+(q.length ? `\n\n${q.length} of them ${q.length===1?'is':'are'} marked as a query — they'll be approved too.` : ''), {confirmLabel:'Approve'}))) return;
  let ok = 0;
  for(const r of rows){
    const u = await dbUpdate('purchase_invoices', r.id, {status:'approved', approved_by:ME.id, approved_at:new Date().toISOString()});
    if(u){ ok++; if(typeof finXeroAuto==='function') finXeroAuto('bill', r.id); if(u.po_id && typeof finPoMaybeClose==='function') finPoMaybeClose(u.po_id); }
  }
  finPiSel = new Set();
  toast(ok===rows.length ? ok+' approved' : ok+' of '+rows.length+' approved'); render();
};
window.finPiBulkPaid = async function(){
  const ids = Array.from(finPiSel); if(!ids.length) return;
  const d = await customPrompt(`Paid on which date? (${ids.length} invoice${ids.length===1?'':'s'})`, finToday());
  if(d==null) return;
  const date = String(d).trim() || finToday();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){ toast('Use the date as YYYY-MM-DD, e.g. '+finToday()); return; }
  const ok = (await dbSelect('purchase_invoices', 'id=in.('+ids.join(',')+')&status=eq.approved&select=id')).map(r=>r.id);
  if(!ok.length){ toast('Only approved invoices can be marked paid.'); return; }
  const res = await Promise.all(ok.map(id=>dbUpdate('purchase_invoices', id, {paid_on:date})));
  finPiSel = new Set();
  toast(res.filter(Boolean).length+' marked paid'); render();
};

/* ---------- 1. docked review on a computer ---------- */
const __finOpenPiOrig = window.openPurchaseInvoiceView;
let finPiOpenId = null;
window.openPurchaseInvoiceView = async function(siteId, id){
  await __finOpenPiOrig(siteId, id);
  const ov = document.getElementById('finPiOverlay'); if(!ov) return;
  const docked = typeof isDeskMode==='function' && isDeskMode();
  ov.classList.toggle('finpi-docked', docked);
  finPiOpenId = id;
  document.querySelectorAll('tr[data-pi]').forEach(tr=>tr.classList.toggle('finpi-on', tr.getAttribute('data-pi')===id));
  const card = ov.querySelector('.geo-modal-card'); if(!card) return;
  const i = (await dbSelect('purchase_invoices', 'id=eq.'+id+'&select=id,site_id,file_path,file_name,lines,split,net,cost_code,status'))[0];
  if(!i || finPiOpenId!==id) return; // another invoice was opened while this one loaded
  // The invoice itself, above the details (computer only — phones keep the "View invoice" button).
  if(docked && i.file_path){
    let url = '';
    try{ url = await resolveStorageUrl(publicUrl('finance-docs', i.file_path)); }catch(e){}
    if(url && finPiOpenId===id){
      const isPdf = /\.pdf$/i.test(i.file_name||i.file_path), isImg = /\.(jpe?g|png|webp|gif)$/i.test(i.file_name||i.file_path);
      const prev = isPdf ? `<iframe class="finpi-doc" src="${escapeHtml(url)}#view=FitH" title="Invoice"></iframe>` : isImg ? `<div class="finpi-docimg"><img src="${escapeHtml(url)}" alt=""></div>` : '';
      if(prev) card.insertAdjacentHTML('afterbegin', prev);
    }
  }
  // 2. Code each line
  if(i.lines && i.lines.length && i.status!=='rejected'){
    card.insertAdjacentHTML('beforeend', `<div id="finPiCodeWrap"><button type="button" class="ghostbtn" style="width:100%;margin-top:8px;" onclick="finPiCodeOpen('${id}')">🏷 Code each line to a project / cost type</button></div>`);
  }
  if(docked) card.insertAdjacentHTML('afterbegin', `<button type="button" class="finpi-x" title="Close" onclick="finPiClose()">✕</button>`);
};
window.finPiClose = function(){
  const ov = document.getElementById('finPiOverlay'); if(ov) ov.style.display = 'none';
  finPiOpenId = null;
  document.querySelectorAll('tr.finpi-on').forEach(tr=>tr.classList.remove('finpi-on'));
};

/* ---------- 2. code each line ---------- */
let finPiCode = null; // {id, row, lines:[{site_id, cost_code, amount, description}]}
window.finPiCodeOpen = async function(id){
  const i = (await dbSelect('purchase_invoices', 'id=eq.'+id))[0]; if(!i) return;
  const items = (i.lines||[]).filter(l=>l && (l.kind||'item')!=='total');
  const defCode = FIN_COST_CATS[i.cost_code] ? i.cost_code : 'materials';
  finPiCode = {id, row:i, lines: items.map(l=>({description:l.description||'', amount: l.amount!=null ? Number(l.amount) : (l.qty!=null && l.unit_price!=null ? finRound(Number(l.qty)*Number(l.unit_price)) : 0), site_id: l.site_id || i.site_id, cost_code: FIN_COST_CATS[l.cost_code] ? l.cost_code : defCode}))};
  finPiCodePaint();
};
function finPiCodePaint(){
  const w = document.getElementById('finPiCodeWrap'); if(!w || !finPiCode) return;
  const sites = SITES.filter(s=>['live','upcoming'].includes(finSiteStatus(s)) || finPiCode.lines.some(l=>l.site_id===s.id)).sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
  const cats = Object.keys(FIN_COST_CATS).filter(k=>k!=='labour');
  const tot = finRound(finPiCode.lines.reduce((t,l)=>t+Number(l.amount||0), 0));
  w.innerHTML = `<div class="finpi-code">
    <p class="sectiontitle" style="margin:12px 0 6px;">Code each line</p>
    <p class="stub" style="margin:0 0 8px;">Pick the project and cost type for each line. One invoice can cover several jobs.</p>
    ${finPiCode.lines.map((l,k)=>`<div class="finpi-line">
      <div class="finpi-line-t"><b>${escapeHtml(l.description||'Line '+(k+1))}</b><span>${finMoney(l.amount)}</span></div>
      <div class="finpi-line-s">
        <select onchange="finPiCode.lines[${k}].site_id=this.value">${sites.map(s=>`<option value="${s.id}" ${s.id===l.site_id?'selected':''}>${escapeHtml(finJobTag(s.id))}</option>`).join('')}</select>
        <select onchange="finPiCode.lines[${k}].cost_code=this.value">${cats.map(c=>`<option value="${c}" ${c===l.cost_code?'selected':''}>${escapeHtml(FIN_COST_CATS[c])}</option>`).join('')}</select>
      </div></div>`).join('')}
    <div class="finkv" style="margin-top:6px;"><span>Lines total (net)</span><b>${finMoney(tot)}</b></div>
    ${Math.abs(tot - Number(finPiCode.row.net||0)) >= 0.5 ? `<p class="stub" style="margin:0 0 6px;color:var(--warn);font-style:normal;">The lines add up to ${finMoney(tot)}, the invoice net is ${finMoney(finPiCode.row.net)}. The invoice total is shared in the same proportions.</p>` : ''}
    <div class="row-gap" style="margin-top:8px;"><button class="darkbtn" style="flex:1;" onclick="finPiCodeSave()">Save coding</button><button class="ghostbtn" style="flex:1;" onclick="finPiCode=null;document.getElementById('finPiCodeWrap').innerHTML=''">Cancel</button></div>
  </div>`;
}
window.finPiCodeSave = async function(){
  const d = finPiCode; if(!d) return;
  const tot = d.lines.reduce((t,l)=>t+Math.max(0, Number(l.amount||0)), 0);
  if(!(tot > 0)){ toast('These lines have no amounts to share by.'); return; }
  const by = {};
  d.lines.forEach(l=>{ const k = l.site_id+'|'+l.cost_code; const e = by[k] = by[k] || {site_id:l.site_id, cost_code:l.cost_code, amt:0}; e.amt += Math.max(0, Number(l.amount||0)); });
  const parts = Object.values(by).filter(e=>e.amt > 0).sort((a,b)=>b.amt-a.amt);
  const net = Number(d.row.net||0);
  const linesOut = (d.row.lines||[]).slice();
  let j = 0; linesOut.forEach((l, idx)=>{ if(l && (l.kind||'item')!=='total'){ const c = d.lines[j++]; if(c) linesOut[idx] = Object.assign({}, l, {site_id:c.site_id, cost_code:c.cost_code}); } });
  let patch;
  if(parts.length===1 && parts[0].site_id===d.row.site_id){
    patch = {cost_code:parts[0].cost_code, split:null, lines:linesOut};
  } else {
    const out = parts.map(e=>({site_id:e.site_id, sub_job_id:null, pct:Math.round(e.amt/tot*1000000)/10000, amount:finRound(e.amt/tot*net), cost_code:e.cost_code}));
    const sumP = out.reduce((t,x)=>t+x.pct, 0); out[out.length-1].pct = Math.round((out[out.length-1].pct + 100 - sumP)*10000)/10000;
    patch = {cost_code:parts[0].cost_code, split:out, sub_job_id:null, lines:linesOut};
  }
  const r = await dbUpdate('purchase_invoices', d.id, patch);
  if(!r){ toast('Could not save the coding.'); return; }
  toast(patch.split ? 'Coded across '+patch.split.length+' project / cost type'+(patch.split.length===1?'':'s') : 'Coded to '+FIN_COST_CATS[patch.cost_code]);
  const siteId = d.row.site_id; finPiCode = null;
  render();
  openPurchaseInvoiceView(siteId, d.id);
};

/* styles for the above (kept here so this file can be dropped in on its own) */
(function(){
  const css = `
  html.desk #finPiOverlay.finpi-docked{position:fixed !important;inset:auto 16px 16px auto !important;top:104px !important;width:min(560px, calc((100vw - 248px) * .46)) !important;height:auto !important;background:transparent !important;align-items:stretch !important;justify-content:stretch !important;padding:0 !important;z-index:60 !important;}
  html.desk #finPiOverlay.finpi-docked .geo-modal-card{max-width:none !important;width:100% !important;max-height:none !important;height:100%;overflow:auto;margin:0 !important;border:1px solid #ECEEF2;border-radius:16px;box-shadow:0 10px 30px rgba(20,24,29,.12);position:relative;}
  html.desk body:has(#finPiOverlay.finpi-docked[style*="flex"]) .scrollarea{margin-right:min(576px, calc((100vw - 248px) * .46 + 16px));}
  .finpi-doc{display:block;width:100%;height:46vh;border:0;border-radius:10px;background:#E9EBEF;margin:0 0 12px;}
  .finpi-docimg{max-height:46vh;overflow:auto;background:#E9EBEF;border-radius:10px;margin:0 0 12px;text-align:center;}
  .finpi-docimg img{max-width:100%;}
  .finpi-x{position:sticky;top:0;float:right;margin:-6px -6px 4px 8px;width:32px;height:32px;border-radius:50%;border:1px solid #E3E6EB;background:#fff;cursor:pointer;z-index:2;}
  tr.finpi-on td{background:#FDF1F1 !important;}
  tr.finpi-on td:first-child{box-shadow:inset 3px 0 0 var(--brand1,#E3262E);}
  .finpi-cb{width:34px;text-align:center;}
  .finpi-cb input{width:17px;height:17px;margin:0;}
  .finpi-checks{display:inline-flex;flex-wrap:wrap;gap:4px;}
  .finpi-checks .finpill{margin-left:0;white-space:nowrap;}
  .finpi-bulk{position:sticky;bottom:12px;z-index:20;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;padding:10px 14px;background:#14171C;color:#fff;border-radius:14px;box-shadow:0 10px 26px rgba(0,0,0,.25);}
  .finpi-bulk b{flex:1;font-size:13px;}
  .finpi-bulk button{width:auto !important;margin:0 !important;padding:7px 14px !important;font-size:12.5px !important;}
  .finpi-bulk .ghostbtn{background:transparent;color:#fff;border-color:rgba(255,255,255,.4);}
  .finpi-line{border:1px solid #ECEEF2;border-radius:10px;padding:8px 10px;margin-bottom:6px;}
  .finpi-line-t{display:flex;justify-content:space-between;gap:8px;font-size:13px;}
  .finpi-line-t span{font-variant-numeric:tabular-nums;white-space:nowrap;}
  .finpi-line-s{display:flex;gap:6px;margin-top:6px;}
  .finpi-line-s select{flex:1;min-width:0;font-size:12.5px;padding:6px 8px;}
  @media (max-width:700px){ .finpi-checks{display:flex;} }`;
  try{ const st = document.createElement('style'); st.id = 'finPiReviewCss'; st.textContent = css; document.head.appendChild(st); }catch(e){}
})();
