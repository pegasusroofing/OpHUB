/* ================= RAMS SIGNATURE BOXES (DocuSign-style placement) ================= */
// A manager marks, once, every place in a document where somebody signs —
// in the Signing Templates library (on a sample of the form) or on one
// job's document. Every box says WHO it belongs to and WHAT goes in it:
//   who  : 'op1', 'op2' … (operatives, in the order they sign), 'pm'
//          (the project manager who issues it) or 'client'
//   what : 'sig' (signature), 'name' (printed name) or 'date'
// One person can have as many boxes as the form needs, anywhere, on any
// page. Boxes for people who never sign (operative 8 on a 3-man job, no
// client) are simply left empty.
//
// Stored as {v:2, boxes:[{p, w, t, r:[x,y,w,h]}]} — p is the 1-based page,
// r is in fractions of the page (0..1) from the top-left. The first version
// stored repeating tables ({v:1, tables:[…]}); ramsLayoutBoxes() reads both.
let ramsBoxEd = null;
const RAMS_BOX_WHAT = [{key:'sig', label:'Signature'}, {key:'name', label:'Name'}, {key:'date', label:'Date'}];
const RAMS_BOX_MAX_OPS = 40;
// 'client' (first version) means the same as 'client1'.
function ramsBoxClientNum(w){ const m = /^client(\d*)$/.exec(String(w)); return m ? (parseInt(m[1],10) || 1) : 0; }
function ramsBoxOpNum(w){ const m = /^op(\d+)$/.exec(String(w)); return m ? parseInt(m[1],10) : 0; }
function ramsBoxWhoLabel(w, short){
  const cn = ramsBoxClientNum(w);
  if(cn) return 'Client ' + cn;
  if(w==='pm') return short ? 'PM' : 'Project Manager';
  const n = parseInt(String(w).slice(2),10) || 1;
  return (short ? 'Op ' : 'Operative ') + n;
}
// Every operative and every client gets their own colour, so it's obvious
// at a glance whose box is whose. Operatives: cool/varied; clients: warm;
// the project manager: purple. The lists repeat after 12 / 6.
const RAMS_OP_COLORS = ['#1F9D62','#2F6FB3','#0E8C8C','#455A64','#7A8B00','#1B7FA6','#2E7D32','#3F51B5','#00897B','#37474F','#558B2F','#0277BD'];
const RAMS_CLIENT_COLORS = ['#D9540B','#C2185B','#B0740F','#D32F2F','#AD5A00','#B5179E'];
function ramsBoxWhoColor(w){
  const cn = ramsBoxClientNum(w);
  if(cn) return RAMS_CLIENT_COLORS[(cn-1) % RAMS_CLIENT_COLORS.length];
  if(w==='pm') return '#6B3F86';
  return RAMS_OP_COLORS[(Math.max(1, ramsBoxOpNum(w))-1) % RAMS_OP_COLORS.length];
}
function ramsLayoutBoxes(layout){
  if(!layout) return [];
  if(Array.isArray(layout.boxes)) return layout.boxes.filter(b=>b && b.p && b.w && b.t && Array.isArray(b.r) && b.r.length===4);
  const out = [];
  (Array.isArray(layout.tables) ? layout.tables : []).forEach(t=>{
    if(!t || !t.page) return;
    const rows = t.rows||1;
    for(let i=0;i<rows;i++){
      if(i>0 && !t.step) break;
      ['name','sig','date'].forEach(k=>{ const b = t[k]; if(b) out.push({p:t.page, w:'op'+(i+1), t:k, r:[b[0], b[1]+i*t.step, b[2], b[3]]}); });
    }
  });
  return out;
}
// How many operatives the layout has room for.
function ramsLayoutSlots(layout){ return ramsLayoutBoxes(layout).reduce((m,b)=>/^op\d+$/.test(b.w) ? Math.max(m, parseInt(b.w.slice(2),10)) : m, 0); }
function ramsLayoutHas(layout, who){ return ramsLayoutBoxes(layout).some(b=>b.w===who); }
// How many clients the layout has boxes for (Client 1, 2, 3…).
function ramsLayoutClients(layout){ return ramsLayoutBoxes(layout).reduce((m,b)=>Math.max(m, ramsBoxClientNum(b.w)), 0); }
function ramsLayoutSummary(layout){
  const n = ramsLayoutBoxes(layout).length; if(!n) return '';
  const bits = [];
  const ops = ramsLayoutSlots(layout); if(ops) bits.push(ops+' operative'+(ops===1?'':'s'));
  if(ramsLayoutHas(layout,'pm')) bits.push('project manager');
  const cl = ramsLayoutClients(layout); if(cl) bits.push(cl===1 ? 'client' : cl+' clients');
  return n+' box'+(n===1?'':'es')+(bits.length ? ' · '+bits.join(', ') : '');
}
// tplId set = editing a template in the Signing Templates library (its
// sample document); otherwise editing one job's RAMS document.
async function renderRamsBoxes(siteId, ramsId, tplId){
  const __gen = RENDER_GEN;
  const backHash = tplId ? '#/sign-templates' : `#/site/${siteId}/hs/rams`;
  if(!isManager(ME)){ go(tplId ? '#/sites' : backHash); return; }
  const key = tplId ? 'tpl:'+tplId : 'doc:'+ramsId;
  if(!ramsBoxEd || ramsBoxEd.key !== key){
    let doc;
    if(tplId){
      const rows = await dbSelect('sign_layout_templates', 'id=eq.'+tplId+'&select=*');
      const tp = rows[0];
      if(!tp){ toast('Template not found.'); go(backHash); return; }
      if(!tp.storage_path){ toast('This template has no sample document to show.'); go(backHash); return; }
      doc = {name: tp.name, storage_path: tp.storage_path, sign_layout: tp.layout};
    } else {
      const rows = await dbSelect('rams_docs', 'id=eq.'+ramsId+'&select=*');
      doc = rows[0];
      if(!doc){ toast('Document not found.'); go(backHash); return; }
    }
    const boxes = JSON.parse(JSON.stringify(ramsLayoutBoxes(doc.sign_layout)));
    ramsBoxEd = {key, tplId: tplId||null, backHash, ramsId, siteId, doc, pdf:null, numPages:0, page:(boxes[0] && boxes[0].p) || 1, boxes, who:'op1', mode:null, sels:[], offset:null, dirty:false, templates:[], busy:false};
  }
  const ed = ramsBoxEd;
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="margin-bottom:10px;">
      <p style="margin:0 0 4px;font-weight:700;">${escapeHtml(ed.doc.name||'RAMS document')}</p>
      <p class="stub" style="margin:0;">${ed.tplId ? 'This is the template\'s sample document. Mark every place someone signs. Any document you later upload with this template gets the same boxes in the same places.' : 'Mark every place someone signs in this document. You only do this once.'}</p>
    </div>
    <div id="rbCtl"></div>
    <div id="rbPageWrap" style="position:relative;margin:10px 0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;">
      <canvas id="rbCanvas" style="display:block;width:100%;height:auto;"></canvas>
      <div id="rbOv" style="position:absolute;inset:0;"></div>
    </div>
    <div id="rbFoot"></div>
  `, ed.tplId ? {title:'Template Boxes', back:backHash, tabs:false} : {title:'Signature Boxes', back:backHash, siteId, tabs:false});
  ramsBoxRefresh();
  try{
    if(!ed.pdf){
      if(!(await loadLib('pdfjsLib'))) throw new Error('PDF reader failed to load');
      const bytes = await (await fetchWithTimeout(publicUrl('rams-docs', ed.doc.storage_path), {}, 60000)).arrayBuffer();
      ed.pdf = await pdfjsLib.getDocument({data: bytes}).promise;
      ed.numPages = ed.pdf.numPages;
      if(ed.page > ed.numPages) ed.page = 1;
    }
    if(ramsBoxEd !== ed) return;
    const tpl = ed.tplId ? [] : await dbSelect('sign_layout_templates', 'order=name.asc&select=id,name,page_count,layout');
    ed.templates = (tpl || []).filter(tp=>ramsLayoutBoxes(tp.layout).length);
    await ramsBoxDrawPage();
    ramsBoxRefresh();
  }catch(e){
    console.error('[renderRamsBoxes]', e);
    const c = document.getElementById('rbCtl'); if(c) c.innerHTML = `<div class="empty">Could not open this document — it needs to be a PDF. ${escapeHtml((e && e.message)||'')}</div>`;
  }
}
async function ramsBoxDrawPage(){
  const ed = ramsBoxEd; if(!ed || !ed.pdf) return;
  const canvas = document.getElementById('rbCanvas'); if(!canvas) return;
  const token = ed.drawToken = (ed.drawToken||0)+1;
  const page = await ed.pdf.getPage(ed.page);
  const base = page.getViewport({scale:1});
  const cssW = canvas.parentElement.clientWidth || 360;
  const scale = Math.min(3, (cssW * Math.min(2, window.devicePixelRatio||1)) / base.width);
  const vp = page.getViewport({scale});
  if(token !== ed.drawToken) return;
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({canvasContext: canvas.getContext('2d'), viewport: vp}).promise;
}
function ramsBoxRefresh(){
  const ed = ramsBoxEd; if(!ed) return;
  const ctl = document.getElementById('rbCtl'), ov = document.getElementById('rbOv'), foot = document.getElementById('rbFoot');
  if(!ctl || !ov) return;
  const opNum = /^op\d+$/.test(ed.who) ? parseInt(ed.who.slice(2),10) : 0;
  const lastOp = opNum || ed.lastOp || 1;
  const clNum = ramsBoxClientNum(ed.who), lastClient = clNum || ed.lastClient || 1;
  const minePage = ed.boxes.filter(b=>b.w===ed.who && b.p===ed.page);
  ed.sels = (ed.sels||[]).filter(i=>ed.boxes[i] && ed.boxes[i].p===ed.page);
  const selBoxes = ed.sels.map(i=>ed.boxes[i]);
  const pageCount = ed.boxes.filter(b=>b.p===ed.page).length;
  const chip = (on, color)=>`flex:0 0 auto;margin:0;padding:8px 12px;font-size:12.5px;border-radius:999px;border:1.5px solid ${color};background:${on?color:'transparent'};color:${on?'#fff':color};font-weight:700;cursor:pointer;`;
  const pagesWithBoxes = [...new Set(ed.boxes.map(b=>b.p))].sort((a,b)=>a-b);
  const help = ed.mode==='repeat' ? `Tap where ${ramsBoxWhoLabel('op'+(opNum+1))}'s signature goes (the next row down).`
    : ed.mode ? `Drag a box where ${ramsBoxWhoLabel(ed.who)}'s ${RAMS_BOX_WHAT.find(x=>x.key===ed.mode).label.toLowerCase()} goes.` : '';
  ctl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span class="homebtn" style="flex:none;" onclick="ramsBoxGoPage(-1)">‹</span>
      <div style="flex:1;text-align:center;font-weight:700;">Page ${ed.page}${ed.numPages?' of '+ed.numPages:''}</div>
      <span class="homebtn" style="flex:none;" onclick="ramsBoxGoPage(1)">›</span>
    </div>
    ${pagesWithBoxes.length ? `<p class="stub" style="margin:0 0 8px;">${escapeHtml(ramsLayoutSummary({v:2,boxes:ed.boxes}))} · pages with boxes: ${pagesWithBoxes.map(p=>`<span class="viewlink" style="cursor:pointer;${p===ed.page?'font-weight:800;':''}" onclick="ramsBoxJump(${p})">${p}</span>`).join(', ')}</p>` : ''}
    <div class="card" style="margin-bottom:0;padding:12px;">
      <p class="field-label" style="margin:0 0 6px;">1. Who signs here?</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <span style="${chip(!!opNum, ramsBoxWhoColor('op'+lastOp))}" onclick="ramsBoxWho('op${lastOp}')">Operative ${lastOp}</span>
        <span class="homebtn" style="flex:none;" onclick="ramsBoxOp(-1)">−</span>
        <span class="homebtn" style="flex:none;" onclick="ramsBoxOp(1)">+</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;">
        <span style="${chip(!!clNum, ramsBoxWhoColor('client'+lastClient))}" onclick="ramsBoxWho('client${lastClient}')">Client ${lastClient}</span>
        <span class="homebtn" style="flex:none;" onclick="ramsBoxClient(-1)">−</span>
        <span class="homebtn" style="flex:none;" onclick="ramsBoxClient(1)">+</span>
        <span style="${chip(ed.who==='pm', ramsBoxWhoColor('pm'))}" onclick="ramsBoxWho('pm')">Project Manager</span>
      </div>
      <p class="field-label" style="margin:12px 0 6px;">2. What goes in the box? Then drag it on the page.</p>
      <div style="display:flex;gap:6px;">
        ${RAMS_BOX_WHAT.map(x=>{ const n = minePage.filter(b=>b.t===x.key).length; return `<button class="${ed.mode===x.key?'darkbtn':'ghostbtn'}" style="flex:1;margin:0;padding:9px 4px;font-size:12.5px;" onclick="ramsBoxMode('${x.key}')">${x.label}${n?' ✓'+(n>1?n:''):''}</button>`; }).join('')}
      </div>
      ${opNum && minePage.length ? `
      <p class="field-label" style="margin:12px 0 6px;">Same boxes for the next operative?</p>
      <div style="display:flex;gap:6px;">
        <button class="${ed.mode==='repeat'?'darkbtn':'ghostbtn'}" style="flex:1;margin:0;padding:9px 4px;font-size:12.5px;" onclick="ramsBoxMode('repeat')">Copy to Operative ${opNum+1} — tap where</button>
        ${ed.offset ? `<button class="ghostbtn" style="flex:1;margin:0;padding:9px 4px;font-size:12.5px;" onclick="ramsBoxRepeatAgain()">Copy again, same spacing</button>` : ''}
      </div>` : ''}
      ${help ? `<p style="margin:10px 0 0;font-weight:700;color:var(--brand1);">${escapeHtml(help)}</p>` : `<p class="stub" style="margin:10px 0 0;">Tap a box on the page to select it, tap others to add them, or drag a box to move it.</p>`}
      ${selBoxes.length ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;font-weight:700;">${selBoxes.length===1 ? 'Selected: '+escapeHtml(ramsBoxWhoLabel(selBoxes[0].w))+' · '+RAMS_BOX_WHAT.find(x=>x.key===selBoxes[0].t).label : selBoxes.length+' boxes selected'}</div>
          <span class="viewlink" style="cursor:pointer;" onclick="ramsBoxSelectNone()">Clear</span>
        </div>
        <p class="stub" style="margin:4px 0 8px;">Drag ${selBoxes.length===1?'it':'any of them'} on the page to move ${selBoxes.length===1?'it':'them together'}. Tap more boxes to add them.</p>
        ${selBoxes.length>1 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <button class="ghostbtn" style="flex:1;min-width:130px;margin:0;padding:8px 4px;font-size:12.5px;" onclick="ramsBoxAlign('v')">⬍ Align vertically</button>
          <button class="ghostbtn" style="flex:1;min-width:130px;margin:0;padding:8px 4px;font-size:12.5px;" onclick="ramsBoxAlign('h')">⬌ Align horizontally</button>
          <button class="ghostbtn" style="flex:1;min-width:130px;margin:0;padding:8px 4px;font-size:12.5px;" onclick="ramsBoxAlign('size')">▭ Make same size</button>
        </div>
        <p class="stub" style="margin:0 0 8px;">They line up with the first box you tapped (the one with the thick outline).</p>` : ''}
        <button class="ghostbtn" style="width:100%;margin:0;padding:8px 12px;color:var(--danger,#B23A3A);" onclick="ramsBoxDelete()">Delete ${selBoxes.length===1?'box':selBoxes.length+' boxes'}</button>
      </div>` : (pageCount>1 && !ed.mode ? `<p style="margin:8px 0 0;"><span class="viewlink" style="cursor:pointer;" onclick="ramsBoxSelectAll()">Select all ${pageCount} boxes on this page</span></p>` : '')}
    </div>`;
  let html = '';
  ed.boxes.forEach((b,i)=>{
    if(b.p !== ed.page) return;
    const color = ramsBoxWhoColor(b.w), on = ed.sels.includes(i), first = ed.sels[0]===i, mine = b.w===ed.who;
    html += `<div data-i="${i}" style="touch-action:none;position:absolute;left:${b.r[0]*100}%;top:${b.r[1]*100}%;width:${b.r[2]*100}%;height:${b.r[3]*100}%;border:${first?4:(on?2.5:(mine?2:1.5))}px ${b.t==='sig'?'solid':'dashed'} ${on?'#111':color};background:${color}${mine?'38':'1c'};border-radius:3px;box-sizing:border-box;pointer-events:${ed.mode?'none':'auto'};cursor:${on?'move':'pointer'};font-size:9px;font-weight:800;color:${color};line-height:1.05;padding:1px 2px;overflow:hidden;white-space:nowrap;">${escapeHtml(ramsBoxWhoLabel(b.w, true))} ${b.t==='sig'?'sign':b.t}</div>`;
  });
  html += `<div id="rbDrag" style="position:absolute;display:none;border:2px solid #111;background:rgba(17,17,17,.12);border-radius:3px;pointer-events:none;"></div>`;
  ov.innerHTML = html;
  ov.style.touchAction = ed.mode ? 'none' : 'auto';
  ov.style.cursor = ed.mode ? 'crosshair' : 'default';
  ov.onpointerdown = ed.mode ? ramsBoxPointerDown : ramsBoxMoveDown;
  if(foot) foot.innerHTML = `
    <button class="darkbtn" style="width:100%;margin:0 0 8px;" ${ed.busy?'disabled':''} onclick="ramsBoxSave()">${ed.busy?'Saving…':(ed.tplId?'Save template':'Save signature boxes')}</button>
    ${ed.tplId ? `<p class="stub" style="margin:4px 0 0;">Set up as many operatives as the form has room for. If fewer people sign, the spare boxes just stay empty.</p>` : `
    <div class="row-gap">
      <button class="ghostbtn" style="flex:1;margin:0;" ${ed.boxes.length?'':'disabled'} onclick="ramsBoxSaveTemplate()">Save as template</button>
      <button class="ghostbtn" style="flex:1;margin:0;" ${ed.templates.length?'':'disabled'} onclick="ramsBoxUseTemplate()">Use a template</button>
    </div>
    ${ed.doc.sign_layout ? `<button class="ghostbtn" style="width:100%;margin:8px 0 0;" onclick="ramsBoxClear()">Remove all boxes from this document</button>` : ''}
    <p class="stub" style="margin:10px 0 0;">Tip: set your standard forms up once under Settings → Libraries → Signing Templates, then just pick the template when you upload.</p>`}`;
}
function ramsBoxPointerDown(ev){
  const ed = ramsBoxEd; if(!ed || !ed.mode) return;
  const ov = document.getElementById('rbOv'); const rect = ov.getBoundingClientRect();
  const fx = e=>Math.min(1, Math.max(0, (e.clientX-rect.left)/rect.width));
  const fy = e=>Math.min(1, Math.max(0, (e.clientY-rect.top)/rect.height));
  const r4 = n=>Math.round(n*10000)/10000;
  ev.preventDefault();
  if(ed.mode==='repeat'){
    // The tap marks the middle of the NEXT operative's signature box (or
    // their first box, if this operative has no signature box on this page).
    const mine = ed.boxes.filter(b=>b.w===ed.who && b.p===ed.page);
    if(!mine.length) return;
    // The tap can be on ANY of the next person's spaces (their name, their
    // signature, their date). Work out which of this person's boxes it
    // lines up with — the one in the same column (next row down) or the
    // same row (next column across) — and measure the gap from that one.
    // It used to always measure from the signature box, so tapping the
    // next person's NAME space shoved every box off the side of the page
    // and reported "no room".
    const tx = fx(ev), ty = fy(ev);
    let anchor = null, best = Infinity;
    mine.forEach(b=>{
      const ax = Math.abs(tx - (b.r[0]+b.r[2]/2)) / b.r[2], ay = Math.abs(ty - (b.r[1]+b.r[3]/2)) / b.r[3];
      const score = Math.min(ax, ay); // how far off this box's column, or its row, in box-widths
      if(score < best){ best = score; anchor = b; }
    });
    let dx = tx - (anchor.r[0]+anchor.r[2]/2), dy = ty - (anchor.r[1]+anchor.r[3]/2);
    // Inside the anchor's own column -> straight down; inside its own row -> straight across.
    if(Math.abs(dx) <= anchor.r[2]*0.6) dx = 0;
    if(Math.abs(dy) <= anchor.r[3]*0.6) dy = 0;
    ed.offset = {dx: r4(dx), dy: r4(dy)};
    if(!ed.offset.dx && !ed.offset.dy){ ed.offset = null; toast('Tap on the next person\'s space, not the same one.'); return; }
    ed.mode = null; ramsBoxRepeatAgain(); return;
  }
  const x0 = fx(ev), y0 = fy(ev); const drag = document.getElementById('rbDrag');
  const move = e=>{
    const x1 = fx(e), y1 = fy(e);
    drag.style.display = 'block';
    drag.style.left = Math.min(x0,x1)*100+'%'; drag.style.top = Math.min(y0,y1)*100+'%';
    drag.style.width = Math.abs(x1-x0)*100+'%'; drag.style.height = Math.abs(y1-y0)*100+'%';
  };
  const up = e=>{
    ov.removeEventListener('pointermove', move); ov.removeEventListener('pointerup', up); ov.removeEventListener('pointercancel', up);
    const x1 = fx(e), y1 = fy(e);
    const w = Math.abs(x1-x0), h = Math.abs(y1-y0);
    if(w < 0.03 || h < 0.008){ toast('Drag across the space to draw the box.'); ramsBoxRefresh(); return; }
    ed.boxes.push({p:ed.page, w:ed.who, t:ed.mode, r:[Math.min(x0,x1), Math.min(y0,y1), w, h].map(r4)});
    ed.dirty = true; ed.sels = [ed.boxes.length-1];
    // Move on to the next kind this person doesn't have on this page yet.
    const have = ed.boxes.filter(b=>b.w===ed.who && b.p===ed.page).map(b=>b.t);
    const next = RAMS_BOX_WHAT.find(x=>!have.includes(x.key));
    ed.mode = next ? next.key : null;
    ramsBoxRefresh();
  };
  try{ ov.setPointerCapture(ev.pointerId); }catch(e){}
  ov.addEventListener('pointermove', move); ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
}
window.ramsBoxGoPage = async function(d){
  const ed = ramsBoxEd; if(!ed || !ed.numPages) return;
  const p = Math.min(ed.numPages, Math.max(1, ed.page+d)); if(p===ed.page) return;
  ed.page = p; ed.mode = null; ed.sels = [];
  ramsBoxRefresh(); await ramsBoxDrawPage();
};
window.ramsBoxJump = async function(p){ const ed = ramsBoxEd; if(!ed || p===ed.page) return; ed.page = p; ed.mode = null; ed.sels = []; ramsBoxRefresh(); await ramsBoxDrawPage(); };
window.ramsBoxWho = function(w){ const ed = ramsBoxEd; if(!ed) return; if(/^op\d+$/.test(ed.who)) ed.lastOp = parseInt(ed.who.slice(2),10); if(ramsBoxClientNum(ed.who)) ed.lastClient = ramsBoxClientNum(ed.who); ed.who = w; ed.mode = null; ed.sels = []; ramsBoxRefresh(); };
window.ramsBoxClient = function(d){
  const ed = ramsBoxEd; if(!ed) return;
  const on = ramsBoxClientNum(ed.who), cur = on || ed.lastClient || 1;
  const n = Math.min(20, Math.max(1, on ? cur+d : cur));
  if(/^op\d+$/.test(ed.who)) ed.lastOp = parseInt(ed.who.slice(2),10);
  ed.who = 'client'+n; ed.lastClient = n; ed.mode = null; ed.sels = []; ramsBoxRefresh();
};
window.ramsBoxOp = function(d){
  const ed = ramsBoxEd; if(!ed) return;
  const cur = /^op\d+$/.test(ed.who) ? parseInt(ed.who.slice(2),10) : (ed.lastOp||1);
  const n = Math.min(RAMS_BOX_MAX_OPS, Math.max(1, /^op\d+$/.test(ed.who) ? cur+d : cur));
  ed.who = 'op'+n; ed.lastOp = n; ed.mode = null; ed.sels = []; ramsBoxRefresh();
};
window.ramsBoxMode = function(m){ const ed = ramsBoxEd; if(!ed) return; ed.mode = ed.mode===m ? null : m; ed.sels = []; ramsBoxRefresh(); };
// Tap = add to / remove from the selection. Drag = move every selected box
// together (dragging an unselected box selects just that one and moves it).
function ramsBoxMoveDown(ev){
  const ed = ramsBoxEd; if(!ed || ed.mode) return;
  const el = ev.target.closest ? ev.target.closest('[data-i]') : null; if(!el) return;
  const i = parseInt(el.getAttribute('data-i'),10); const b = ed.boxes[i]; if(!b) return;
  const ov = document.getElementById('rbOv'); const rect = ov.getBoundingClientRect();
  ev.preventDefault();
  const sx = ev.clientX, sy = ev.clientY; let moved = false;
  const group = ed.sels.includes(i) ? ed.sels.slice() : [i];
  const start = group.map(k=>ed.boxes[k].r.slice());
  // The whole group stops together at the page edge, so it keeps its shape.
  const minX = Math.min(...start.map(r=>r[0])), minY = Math.min(...start.map(r=>r[1]));
  const maxX = Math.max(...start.map(r=>r[0]+r[2])), maxY = Math.max(...start.map(r=>r[1]+r[3]));
  const els = group.map(k=>ov.querySelector('[data-i="'+k+'"]'));
  let dx = 0, dy = 0;
  const move = e=>{
    if(!moved && Math.abs(e.clientX-sx) < 5 && Math.abs(e.clientY-sy) < 5) return;
    moved = true;
    dx = Math.max(-minX, Math.min(1-maxX, (e.clientX-sx)/rect.width));
    dy = Math.max(-minY, Math.min(1-maxY, (e.clientY-sy)/rect.height));
    els.forEach((x,n)=>{ if(x){ x.style.left = (start[n][0]+dx)*100+'%'; x.style.top = (start[n][1]+dy)*100+'%'; } });
  };
  const up = ()=>{
    ov.removeEventListener('pointermove', move); ov.removeEventListener('pointerup', up); ov.removeEventListener('pointercancel', up);
    if(moved){
      group.forEach((k,n)=>{ ed.boxes[k].r[0] = Math.round((start[n][0]+dx)*10000)/10000; ed.boxes[k].r[1] = Math.round((start[n][1]+dy)*10000)/10000; });
      ed.sels = group; ed.dirty = true;
    } else {
      // a tap: toggle this box in the selection
      if(ed.sels.includes(i)) ed.sels = ed.sels.filter(k=>k!==i);
      else { ed.sels = ed.sels.concat([i]); if(/^op\d+$/.test(b.w)) ed.lastOp = parseInt(b.w.slice(2),10); if(ramsBoxClientNum(b.w)) ed.lastClient = ramsBoxClientNum(b.w); ed.who = b.w; }
    }
    ramsBoxRefresh();
  };
  try{ ov.setPointerCapture(ev.pointerId); }catch(e){}
  ov.addEventListener('pointermove', move); ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);
}
window.ramsBoxSelectAll = function(){ const ed = ramsBoxEd; if(!ed) return; ed.mode = null; ed.sels = ed.boxes.map((b,i)=>b.p===ed.page ? i : -1).filter(i=>i>=0); ramsBoxRefresh(); };
window.ramsBoxSelectNone = function(){ const ed = ramsBoxEd; if(!ed) return; ed.sels = []; ramsBoxRefresh(); };
// Lines the selected boxes up with the FIRST one tapped.
//   'v'    = align vertically: one straight column (same left edge)
//   'h'    = align horizontally: one straight row (same top edge)
//   'size' = same width and height as the first
window.ramsBoxAlign = function(how){
  const ed = ramsBoxEd; if(!ed || ed.sels.length < 2) return;
  const ref = ed.boxes[ed.sels[0]].r;
  ed.sels.slice(1).forEach(k=>{
    const r = ed.boxes[k].r;
    if(how==='v') r[0] = Math.max(0, Math.min(1-r[2], ref[0]));
    else if(how==='h') r[1] = Math.max(0, Math.min(1-r[3], ref[1]));
    else { r[2] = Math.min(ref[2], 1-r[0]); r[3] = Math.min(ref[3], 1-r[1]); }
  });
  ed.dirty = true; ramsBoxRefresh();
};
window.ramsBoxDelete = function(){ const ed = ramsBoxEd; if(!ed || !ed.sels.length) return; const gone = new Set(ed.sels); ed.boxes = ed.boxes.filter((b,i)=>!gone.has(i)); ed.sels = []; ed.dirty = true; ramsBoxRefresh(); };
// Copies the current operative's boxes on this page to the next operative,
// shifted by the remembered spacing, and moves on to that operative — so a
// ten-row sign-off sheet is one tap and then eight presses of this button.
window.ramsBoxRepeatAgain = function(){
  const ed = ramsBoxEd; if(!ed || !ed.offset || !/^op\d+$/.test(ed.who)) return;
  const n = parseInt(ed.who.slice(2),10);
  if(n >= RAMS_BOX_MAX_OPS){ toast('That\'s the most operatives a document can have.'); return; }
  const mine = ed.boxes.filter(b=>b.w===ed.who && b.p===ed.page);
  const next = 'op'+(n+1);
  const moved = mine.map(b=>({p:b.p, w:next, t:b.t, r:[b.r[0]+ed.offset.dx, b.r[1]+ed.offset.dy, b.r[2], b.r[3]].map(v=>Math.round(v*10000)/10000)}));
  // Only refuse when a box would land mostly off the page. A box that just
  // overhangs an edge is nudged back inside instead.
  if(moved.some(b=>b.r[0]+b.r[2]/2 < 0 || b.r[1]+b.r[3]/2 < 0 || b.r[0]+b.r[2]/2 > 1 || b.r[1]+b.r[3]/2 > 1)){ toast('That would put '+ramsBoxWhoLabel(next)+'\'s boxes off the page. Draw theirs by hand, or go to the next page.'); ed.mode = null; ramsBoxRefresh(); return; }
  moved.forEach(b=>{ b.r[0] = Math.max(0, Math.min(1-b.r[2], b.r[0])); b.r[1] = Math.max(0, Math.min(1-b.r[3], b.r[1])); });
  // Replace anything that operative already had on this page.
  ed.boxes = ed.boxes.filter(b=>!(b.w===next && b.p===ed.page)).concat(moved);
  ed.who = next; ed.lastOp = n+1; ed.sels = []; ed.mode = null; ed.dirty = true;
  ramsBoxRefresh();
};
window.ramsBoxSave = async function(){
  const ed = ramsBoxEd; if(!ed || ed.busy) return;
  ed.busy = true; ramsBoxRefresh();
  const layout = ed.boxes.length ? {v:2, boxes: ed.boxes} : null;
  if(ed.tplId){
    const row = await dbUpdate('sign_layout_templates', ed.tplId, {layout: layout || {v:2, boxes:[]}, page_count: ed.numPages||null});
    ed.busy = false;
    if(!row){ toast('Could not save — please try again.'); ramsBoxRefresh(); return; }
    toast('Template saved'); const back = ed.backHash; ramsBoxEd = null; go(back); return;
  }
  const row = await dbUpdate('rams_docs', ed.ramsId, {sign_layout: layout});
  ed.busy = false;
  if(!row){ toast('Could not save — please try again.'); ramsBoxRefresh(); return; }
  toast(layout ? 'Signature boxes saved' : 'Signature boxes removed');
  const back = ed.backHash; ramsBoxEd = null;
  go(back);
};
window.ramsBoxClear = async function(){
  const ed = ramsBoxEd; if(!ed) return;
  if(!await customConfirm('Remove all signature boxes from this document? Signatures will go back to the summary page at the end.', {confirmLabel:'Remove', danger:true})) return;
  ed.boxes = []; ed.sels = []; ed.mode = null;
  await ramsBoxSave();
};
window.ramsBoxSaveTemplate = async function(){
  const ed = ramsBoxEd; if(!ed || !ed.boxes.length) return;
  const name = await customPrompt('Name this template (e.g. "Hyde RAMS form"):', '');
  if(!name || !String(name).trim()) return;
  const rows = await dbInsert('sign_layout_templates', {name:String(name).trim().slice(0,80), page_count: ed.numPages||null, layout:{v:2, boxes: ed.boxes}, storage_path: ed.doc.storage_path||null});
  if(rows){ toast('Template saved'); ed.templates = (await dbSelect('sign_layout_templates', 'order=name.asc&select=id,name,page_count,layout')).filter(tp=>ramsLayoutBoxes(tp.layout).length); ramsBoxRefresh(); }
};
window.ramsBoxUseTemplate = function(){
  const ed = ramsBoxEd; if(!ed || !ed.templates.length) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'rbTplOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;';
  ov.innerHTML = `<div style="background:var(--card,#fff);width:100%;max-width:520px;border-radius:16px 16px 0 0;padding:18px;max-height:75vh;overflow:auto;">
    <p style="margin:0 0 10px;font-weight:800;">Use a template</p>
    ${ed.templates.map(tp=>`<div style="padding:10px 0;border-top:1px solid var(--line);cursor:pointer;" onclick="ramsBoxApplyTemplate('${tp.id}')"><b>${escapeHtml(tp.name)}</b><div class="stub">${escapeHtml(ramsLayoutSummary(tp.layout))}${tp.page_count && ed.numPages && tp.page_count!==ed.numPages ? ' <span style="color:var(--warn);">(made on a '+tp.page_count+'-page document; this one has '+ed.numPages+')</span>' : ''}</div></div>`).join('')}
    <button class="ghostbtn" style="width:100%;margin:12px 0 0;" onclick="document.getElementById('rbTplOv').remove()">Cancel</button>
  </div>`;
  ov.addEventListener('click', e=>{ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
};
window.ramsBoxApplyTemplate = async function(id){
  const ed = ramsBoxEd; if(!ed) return;
  const tp = ed.templates.find(x=>x.id===id); if(!tp) return;
  const o = document.getElementById('rbTplOv'); if(o) o.remove();
  const all = JSON.parse(JSON.stringify(ramsLayoutBoxes(tp.layout)));
  const fit = all.filter(b=>!ed.numPages || b.p<=ed.numPages);
  ed.boxes = fit; ed.dirty = true; ed.mode = null; ed.sels = [];
  if(fit.length) ed.page = fit[0].p;
  toast(fit.length < all.length ? (all.length-fit.length)+' box(es) left out — this document has fewer pages.' : 'Template applied — check the boxes line up, then Save.');
  ramsBoxRefresh(); await ramsBoxDrawPage();
};