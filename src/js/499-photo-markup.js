/* ================= Photo markup (draw + text on a photo) =================
 * photoMarkup(src) opens a full-screen editor over a photo (a data URL or a
 * web address). The user can draw (pen, arrow, circle) and add text, each in
 * its own colour (pen and text remember their colours separately). Resolves
 * to a new JPEG data URL on Save, or null on Cancel. Used by Snagging,
 * Deliveries (booking + completion photos).
 *
 * #(markup-select-edit) 2026-10-13: every mark can be picked up again.
 * Tap a mark (or use ✋ Select) and it gets a dashed box:
 *   - drag it to move it
 *   - drag the round handle to make it bigger/smaller (arrows: drag either end)
 *   - two fingers pinch to resize
 *   - tap selected text again (or ✎ Edit text) to change the words
 *   - A− / A+ , a colour, or 🗑 Delete act on the selected mark
 * A new text / arrow / circle is selected straight after it's made, so it can
 * be moved or resized at once. Undo steps back through every change. */
const PM_COLOURS = [
  {k:'#e53935', n:'Red'}, {k:'#ffd400', n:'Yellow'}, {k:'#ff8f00', n:'Orange'},
  {k:'#1e88e5', n:'Blue'}, {k:'#43a047', n:'Green'}, {k:'#ffffff', n:'White'}, {k:'#111111', n:'Black'}
];
const PM_SIZES = {s:0.5, m:1, l:1.8};
let PM = null;

async function pmLoadImage(src){
  let url = src, obj = null;
  if(!/^data:|^blob:/.test(src)){
    // Fetch first so the canvas isn't "tainted" by another site's picture.
    const res = await fetch(src, {cache:'no-store'});
    if(!res.ok) throw new Error('photo '+res.status);
    obj = url = URL.createObjectURL(await res.blob());
  }
  try{
    return await new Promise((ok, bad)=>{ const im = new Image(); im.onload = ()=>ok(im); im.onerror = ()=>bad(new Error('img')); im.src = url; });
  } finally { if(obj) setTimeout(()=>URL.revokeObjectURL(obj), 2000); }
}

function photoMarkup(src, opts){
  opts = opts || {};
  return new Promise(async resolve=>{
    let img;
    try{ img = await pmLoadImage(src); }
    catch(e){ toast('Could not open that photo to mark up.'); return resolve(null); }
    const max = 1600, sc = Math.min(1, max/Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth*sc), H = Math.round(img.naturalHeight*sc);
    PM = {img, W, H, ops:[], hist:[], tool:'pen', colour:{pen:'#e53935', text:'#ffd400'}, size:'m', cur:null, resolve,
          sel:null, drag:null, ptrs:new Map(), pinch:null};
    let ov = document.getElementById('pmOverlay');
    if(!ov){ ov = document.createElement('div'); ov.id = 'pmOverlay'; ov.className = 'pm-overlay'; document.body.appendChild(ov); }
    ov.innerHTML = `
      <div class="pm-top">
        <button class="pm-btn" onclick="pmDone(false)">Cancel</button>
        <div class="pm-title">Mark up photo</div>
        <button class="pm-btn pm-save" onclick="pmDone(true)">${escapeHtml(opts.saveLabel||'Save')}</button>
      </div>
      <div class="pm-stage" id="pmStage"><canvas id="pmCanvas" width="${W}" height="${H}"></canvas></div>
      <div class="pm-hint" id="pmHint"></div>
      <div class="pm-bar">
        <div class="pm-row" id="pmTools"></div>
        <div class="pm-row" id="pmEdit"></div>
        <div class="pm-row" id="pmColours"></div>
      </div>`;
    ov.style.display = 'flex';
    document.body.classList.add('pm-open');
    const cv = document.getElementById('pmCanvas');
    pmFit();
    cv.addEventListener('pointerdown', pmDown);
    cv.addEventListener('pointermove', pmMove);
    cv.addEventListener('pointerup', pmUp);
    cv.addEventListener('pointercancel', pmUp);
    window.addEventListener('resize', pmFit);
    pmBar();
    pmDraw();
  });
}
window.photoMarkup = photoMarkup;

function pmFit(){
  if(!PM) return;
  const st = document.getElementById('pmStage'), cv = document.getElementById('pmCanvas');
  if(!st || !cv) return;
  const r = Math.min((st.clientWidth-8)/PM.W, (st.clientHeight-8)/PM.H);
  cv.style.width = Math.max(10, Math.floor(PM.W*r))+'px';
  cv.style.height = Math.max(10, Math.floor(PM.H*r))+'px';
}
function pmSelOp(){ return PM && PM.sel!=null ? PM.ops[PM.sel] : null; }
function pmBar(){
  const tools = [['select','✋ Select'],['pen','✏️ Pen'],['arrow','➚ Arrow'],['circle','◯ Circle'],['text','T Text']];
  const so = pmSelOp();
  const colKey = so ? (so.t==='text' ? 'text' : 'pen') : (PM.tool==='text' ? 'text' : 'pen');
  const curCol = so ? so.c : PM.colour[colKey];
  document.getElementById('pmTools').innerHTML =
    tools.map(([k,n])=>`<button class="pm-tool ${PM.tool===k?'on':''}" onclick="pmSetTool('${k}')">${n}</button>`).join('');
  const undoBtns = `<button class="pm-tool" onclick="pmUndo()" ${PM.hist.length?'':'disabled'}>↶ Undo</button>` +
    `<button class="pm-tool" onclick="pmClear()" ${PM.ops.length?'':'disabled'}>Clear</button>`;
  document.getElementById('pmEdit').innerHTML = so
    ? (so.t==='text' ? `<button class="pm-tool" onclick="pmEditText()">✎ Edit text</button>` : '') +
      `<button class="pm-tool pm-size" onclick="pmScaleSel(0.8)" title="Smaller">A−</button>` +
      `<button class="pm-tool pm-size" onclick="pmScaleSel(1.25)" title="Bigger">A+</button>` +
      `<button class="pm-tool" onclick="pmDeleteSel()">🗑 Delete</button>` +
      `<button class="pm-tool on" onclick="pmDeselect()">✓ Done</button>`
    : `<span class="pm-lbl">Size</span>` +
      ['s','m','l'].map(k=>`<button class="pm-tool pm-size ${PM.size===k?'on':''}" onclick="pmSetSize('${k}')" title="Size">${k.toUpperCase()}</button>`).join('') +
      `<span class="pm-gap"></span>` + undoBtns;
  document.getElementById('pmColours').innerHTML =
    `<span class="pm-lbl">${so ? 'Colour' : (colKey==='text'?'Text colour':'Pen colour')}</span>` +
    PM_COLOURS.map(c=>`<button class="pm-dot ${curCol===c.k?'on':''}" style="background:${c.k};" title="${c.n}" aria-label="${c.n}" onclick="pmSetColour('${c.k}')"></button>`).join('');
  const hint = document.getElementById('pmHint');
  if(hint){
    hint.textContent = so
      ? (so.t==='text' ? 'Drag to move · drag the round handle or pinch to resize · tap the text again to change it'
         : so.t==='arrow' ? 'Drag to move · drag either end to change it'
         : 'Drag to move · drag the round handle or pinch to resize')
      : PM.tool==='select' ? 'Tap a mark to pick it up'
      : PM.tool==='text' ? 'Tap where the text should go'
      : 'Draw on the photo · tap text to move it · ✋ Select to move or resize any mark';
  }
}
// Every change is undoable: snapshot the marks before it.
function pmPush(){ PM.hist.push(JSON.stringify(PM.ops)); if(PM.hist.length>60) PM.hist.shift(); }
window.pmSetTool = function(t){ PM.tool = t; if(t!=='select') PM.sel = null; pmBar(); pmDraw(); };
window.pmSetSize = function(s){ PM.size = s; pmBar(); };
window.pmSetColour = function(c){
  const so = pmSelOp();
  if(so){ pmPush(); so.c = c; PM.colour[so.t==='text'?'text':'pen'] = c; pmDraw(); pmBar(); return; }
  PM.colour[PM.tool==='text'?'text':'pen'] = c; pmBar();
};
window.pmUndo = function(){
  if(!PM.hist.length) return;
  PM.ops = JSON.parse(PM.hist.pop()); PM.sel = null; pmDraw(); pmBar();
};
window.pmClear = async function(){
  if(!PM.ops.length) return;
  if(!(await customConfirm('Remove all markings from this photo?'))) return;
  pmPush(); PM.ops = []; PM.sel = null; pmDraw(); pmBar();
};
window.pmDeselect = function(){ PM.sel = null; pmDraw(); pmBar(); };
window.pmDeleteSel = function(){
  if(PM.sel==null) return;
  pmPush(); PM.ops.splice(PM.sel, 1); PM.sel = null; pmDraw(); pmBar();
};
window.pmScaleSel = function(f){
  const o = pmSelOp(); if(!o) return;
  pmPush(); pmScaleOp(o, f, JSON.parse(JSON.stringify(o))); pmDraw(); pmBar();
};
window.pmEditText = async function(){
  const o = pmSelOp(); if(!o || o.t!=='text') return;
  const txt = await customPrompt('Change the text', o.s);
  if(!PM || txt==null) return;
  pmPush();
  if(!txt.trim()){ PM.ops.splice(PM.sel, 1); PM.sel = null; }
  else o.s = txt.trim();
  pmDraw(); pmBar();
};
function pmPt(e){
  const cv = document.getElementById('pmCanvas'), b = cv.getBoundingClientRect();
  return {x:(e.clientX-b.left)*PM.W/b.width, y:(e.clientY-b.top)*PM.H/b.height};
}
// Canvas pixels per screen pixel, so touch targets are finger-sized.
function pmPx(){ const cv = document.getElementById('pmCanvas'); const b = cv ? cv.getBoundingClientRect() : null; return b && b.width ? PM.W/b.width : 1; }
function pmLineW(){ return Math.max(3, Math.round(Math.max(PM.W, PM.H)/220 * PM_SIZES[PM.size])); }
function pmFont(fs){ return 'bold '+fs+'px -apple-system, Segoe UI, Roboto, Arial, sans-serif'; }
// Box round a mark, in canvas pixels.
function pmBox(o){
  if(o.t==='text'){
    const ctx = document.getElementById('pmCanvas').getContext('2d');
    ctx.save(); ctx.font = pmFont(o.fs);
    const lines = o.s.split(/\n/);
    const w = Math.max.apply(null, lines.map(l=>ctx.measureText(l).width));
    ctx.restore();
    return {x:o.x, y:o.y - o.fs*0.6, w, h:o.fs*1.15*(lines.length-1) + o.fs*1.2};
  }
  const xs = o.pts.map(p=>p.x), ys = o.pts.map(p=>p.y);
  const x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
  const pad = (o.w||4)/2;
  return {x:x0-pad, y:y0-pad, w:Math.max.apply(null, xs)-x0+pad*2, h:Math.max.apply(null, ys)-y0+pad*2};
}
function pmSegDist(p, a, b){
  const dx = b.x-a.x, dy = b.y-a.y, L = dx*dx+dy*dy;
  let t = L ? ((p.x-a.x)*dx + (p.y-a.y)*dy)/L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy));
}
function pmHit(o, p){
  const tol = 22*pmPx();
  if(o.t==='text'){
    const b = pmBox(o);
    return p.x>=b.x-tol && p.x<=b.x+b.w+tol && p.y>=b.y-tol && p.y<=b.y+b.h+tol;
  }
  if(o.t==='circle'){
    // On (or near) the ring itself, so a new circle can still be drawn inside one.
    const a = o.pts[0], b = o.pts[1]; if(!b) return false;
    const cx = (a.x+b.x)/2, cy = (a.y+b.y)/2, rx = Math.max(1, Math.abs(b.x-a.x)/2), ry = Math.max(1, Math.abs(b.y-a.y)/2);
    const d = Math.hypot((p.x-cx)/rx, (p.y-cy)/ry);
    return Math.abs(d-1)*Math.min(rx, ry) <= Math.max(tol, o.w||4);
  }
  const t2 = Math.max(tol, (o.w||4));
  if(o.pts.length===1) return Math.hypot(p.x-o.pts[0].x, p.y-o.pts[0].y) <= t2;
  for(let i=1;i<o.pts.length;i++){ if(pmSegDist(p, o.pts[i-1], o.pts[i]) <= t2) return true; }
  return false;
}
// The round handles on the selected mark.
function pmHandles(o){
  if(o.t==='arrow') return [{k:'end0', x:o.pts[0].x, y:o.pts[0].y}, {k:'end1', x:o.pts[1].x, y:o.pts[1].y}];
  const b = pmBox(o), pad = 10*pmPx();
  return [{k:'resize', x:b.x+b.w+pad, y:b.y+b.h+pad}];
}
function pmHitHandle(o, p){
  const r = 26*pmPx();
  return pmHandles(o).find(h=>Math.hypot(p.x-h.x, p.y-h.y) <= r) || null;
}
// Grows/shrinks a mark by f, about its own centre (text: about its start).
function pmScaleOp(o, f, orig){
  if(o.t==='text'){ o.fs = Math.max(10, Math.min(600, Math.round(orig.fs*f))); return; }
  const b = pmBox(orig), cx = b.x+b.w/2, cy = b.y+b.h/2;
  if(o.t==='pen' || o.t==='arrow' || o.t==='circle'){
    o.pts = orig.pts.map(p=>({x:cx+(p.x-cx)*f, y:cy+(p.y-cy)*f}));
    if(o.t!=='circle') o.w = Math.max(2, Math.min(80, Math.round(orig.w*Math.sqrt(f))));
  }
}
function pmMoveOp(o, orig, dx, dy){
  if(o.t==='text'){ o.x = orig.x+dx; o.y = orig.y+dy; return; }
  o.pts = orig.pts.map(p=>({x:p.x+dx, y:p.y+dy}));
}
function pmDown(e){
  if(!PM) return;
  e.preventDefault();
  const p = pmPt(e);
  PM.ptrs.set(e.pointerId, p);
  try{ e.target.setPointerCapture(e.pointerId); }catch(_){}
  // Second finger on a selected mark: pinch to resize it.
  if(PM.ptrs.size===2 && pmSelOp()){
    const [a, b] = Array.from(PM.ptrs.values());
    if(!PM.drag || !PM.drag.pushed) pmPush();
    PM.cur = null;
    PM.pinch = {d0: Math.max(1, Math.hypot(a.x-b.x, a.y-b.y)), orig: JSON.parse(JSON.stringify(pmSelOp()))};
    PM.drag = null; return;
  }
  if(PM.ptrs.size>1) return;
  const so = pmSelOp();
  // Grab a handle or the body of the mark that's already selected.
  if(so){
    const h = pmHitHandle(so, p);
    if(h){ PM.drag = {mode:h.k, p0:p, orig:JSON.parse(JSON.stringify(so)), moved:false, pushed:false}; return; }
    if(pmHit(so, p)){ PM.drag = {mode:'move', p0:p, orig:JSON.parse(JSON.stringify(so)), moved:false, pushed:false, wasSel:true, t0:Date.now()}; return; }
  }
  // Tap on another mark: pick it up. ✋ Select picks up anything; the
  // drawing tools only pick up text, so drawing near a line still draws.
  {
    for(let i=PM.ops.length-1;i>=0;i--){
      if((PM.tool==='select' || PM.ops[i].t==='text') && pmHit(PM.ops[i], p)){
        PM.sel = i; pmBar();
        PM.drag = {mode:'move', p0:p, orig:JSON.parse(JSON.stringify(PM.ops[i])), moved:false, pushed:false};
        pmDraw(); return;
      }
    }
  }
  if(PM.sel!=null){ PM.sel = null; pmBar(); pmDraw(); if(PM.tool==='select') return; }
  if(PM.tool==='select') return;
  if(PM.tool==='text'){ PM.ptrs.delete(e.pointerId); pmAddText(p); return; }
  PM.cur = {t:PM.tool, c:PM.colour.pen, w:pmLineW(), pts:[p]};
}
function pmMove(e){
  if(!PM) return;
  if(PM.ptrs.has(e.pointerId)) PM.ptrs.set(e.pointerId, pmPt(e));
  if(PM.pinch && PM.ptrs.size>=2){
    e.preventDefault();
    const [a, b] = Array.from(PM.ptrs.values());
    const f = Math.max(0.15, Math.min(8, Math.hypot(a.x-b.x, a.y-b.y)/PM.pinch.d0));
    const o = pmSelOp(); if(o){ pmScaleOp(o, f, PM.pinch.orig); pmDraw(); }
    return;
  }
  if(PM.drag){
    e.preventDefault();
    const p = pmPt(e), d = PM.drag, o = pmSelOp(); if(!o) return;
    const dx = p.x-d.p0.x, dy = p.y-d.p0.y;
    if(!d.moved && Math.hypot(dx, dy) < 6*pmPx()) return;
    if(!d.pushed){ pmPush(); d.pushed = true; }
    d.moved = true;
    if(d.mode==='move') pmMoveOp(o, d.orig, dx, dy);
    else if(d.mode==='end0') o.pts[0] = {x:d.orig.pts[0].x+dx, y:d.orig.pts[0].y+dy};
    else if(d.mode==='end1') o.pts[1] = {x:d.orig.pts[1].x+dx, y:d.orig.pts[1].y+dy};
    else if(d.mode==='resize'){
      // Distance from the mark's anchor sets the size.
      const b = pmBox(d.orig);
      const ax = d.orig.t==='text' ? b.x : b.x+b.w/2, ay = d.orig.t==='text' ? b.y : b.y+b.h/2;
      const r0 = Math.max(8, Math.hypot(d.p0.x-ax, d.p0.y-ay));
      const f = Math.max(0.15, Math.min(8, Math.hypot(p.x-ax, p.y-ay)/r0));
      pmScaleOp(o, f, d.orig);
    }
    pmDraw(); return;
  }
  if(!PM.cur) return;
  e.preventDefault();
  const p = pmPt(e);
  if(PM.cur.t==='pen') PM.cur.pts.push(p); else PM.cur.pts[1] = p;
  pmDraw();
}
function pmUp(e){
  if(!PM) return;
  if(e && e.pointerId!=null) PM.ptrs.delete(e.pointerId);
  if(PM.pinch){ if(PM.ptrs.size<2){ PM.pinch = null; pmBar(); } return; }
  if(PM.drag){
    const d = PM.drag; PM.drag = null;
    // A plain tap on text that was already selected: change the words.
    const o = pmSelOp();
    if(!d.moved && d.wasSel && o && o.t==='text' && d.mode==='move') pmEditText();
    pmBar(); pmDraw(); return;
  }
  if(!PM.cur) return;
  const o = PM.cur; PM.cur = null;
  const ok = o.t==='pen' ? o.pts.length>0 : (o.pts[1] && Math.hypot(o.pts[1].x-o.pts[0].x, o.pts[1].y-o.pts[0].y) > 6);
  if(ok){
    pmPush(); PM.ops.push(o);
    // Arrows and circles are picked up straight away so they can be adjusted.
    if(o.t!=='pen') PM.sel = PM.ops.length-1;
    pmBar();
  }
  pmDraw();
}
async function pmAddText(p){
  const txt = await customPrompt('Text to add to the photo', '');
  if(!PM || !txt || !txt.trim()) return;
  const fs = Math.max(16, Math.round(Math.max(PM.W, PM.H)/28 * PM_SIZES[PM.size]));
  pmPush();
  PM.ops.push({t:'text', c:PM.colour.text, fs, s:txt.trim(), x:p.x, y:p.y});
  PM.sel = PM.ops.length-1;
  pmDraw(); pmBar();
}
function pmDark(c){ return ['#ffffff','#ffd400','#ff8f00'].indexOf(c) >= 0; }
function pmDrawOp(ctx, o){
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if(o.t==='text'){
    ctx.font = pmFont(o.fs);
    ctx.textBaseline = 'middle';
    const lines = o.s.split(/\n/);
    lines.forEach((ln, i)=>{
      const y = o.y + i*o.fs*1.15;
      ctx.lineWidth = Math.max(3, o.fs/6);
      ctx.strokeStyle = pmDark(o.c) ? 'rgba(0,0,0,.85)' : 'rgba(255,255,255,.9)';
      ctx.strokeText(ln, o.x, y);
      ctx.fillStyle = o.c; ctx.fillText(ln, o.x, y);
    });
  } else {
    ctx.strokeStyle = o.c; ctx.fillStyle = o.c; ctx.lineWidth = o.w;
    const a = o.pts[0], b = o.pts[1];
    if(o.t==='pen'){
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if(o.pts.length===1) ctx.lineTo(a.x+0.1, a.y+0.1);
      o.pts.forEach(p=>ctx.lineTo(p.x, p.y)); ctx.stroke();
    } else if(o.t==='arrow' && b){
      const ang = Math.atan2(b.y-a.y, b.x-a.x), hl = o.w*4.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - Math.cos(ang)*hl*0.6, b.y - Math.sin(ang)*hl*0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - hl*Math.cos(ang-0.45), b.y - hl*Math.sin(ang-0.45));
      ctx.lineTo(b.x - hl*Math.cos(ang+0.45), b.y - hl*Math.sin(ang+0.45));
      ctx.closePath(); ctx.fill();
    } else if(o.t==='circle' && b){
      ctx.beginPath();
      ctx.ellipse((a.x+b.x)/2, (a.y+b.y)/2, Math.abs(b.x-a.x)/2, Math.abs(b.y-a.y)/2, 0, 0, Math.PI*2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
// Dashed box and round handles round the selected mark (never saved).
function pmDrawSel(ctx, o){
  const px = pmPx(), b = pmBox(o), pad = 10*px;
  ctx.save();
  ctx.lineWidth = Math.max(2, 2*px);
  ctx.setLineDash([8*px, 6*px]);
  ctx.strokeStyle = '#fff'; ctx.strokeRect(b.x-pad, b.y-pad, b.w+pad*2, b.h+pad*2);
  ctx.lineDashOffset = 7*px; ctx.strokeStyle = '#1e88e5'; ctx.strokeRect(b.x-pad, b.y-pad, b.w+pad*2, b.h+pad*2);
  ctx.setLineDash([]);
  pmHandles(o).forEach(h=>{
    ctx.beginPath(); ctx.arc(h.x, h.y, 13*px, 0, Math.PI*2);
    ctx.fillStyle = '#1e88e5'; ctx.fill(); ctx.lineWidth = 3*px; ctx.strokeStyle = '#fff'; ctx.stroke();
    if(h.k==='resize'){
      ctx.beginPath(); ctx.lineWidth = 2.2*px;
      ctx.moveTo(h.x-5*px, h.y-5*px); ctx.lineTo(h.x+5*px, h.y+5*px);
      ctx.moveTo(h.x+5*px, h.y-1*px); ctx.lineTo(h.x+5*px, h.y+5*px); ctx.lineTo(h.x-1*px, h.y+5*px);
      ctx.moveTo(h.x-5*px, h.y+1*px); ctx.lineTo(h.x-5*px, h.y-5*px); ctx.lineTo(h.x+1*px, h.y-5*px);
      ctx.stroke();
    }
  });
  ctx.restore();
}
function pmDraw(forSave){
  const cv = document.getElementById('pmCanvas'); if(!cv || !PM) return;
  const ctx = cv.getContext('2d');
  ctx.drawImage(PM.img, 0, 0, PM.W, PM.H);
  PM.ops.forEach(o=>pmDrawOp(ctx, o));
  if(PM.cur) pmDrawOp(ctx, PM.cur);
  const so = pmSelOp();
  if(so && !forSave) pmDrawSel(ctx, so);
}
window.pmDone = async function(save){
  if(!PM) return;
  if(!save && PM.ops.length && !(await customConfirm('Discard your markings?'))) return;
  const resolve = PM.resolve;
  let out = null;
  if(save && !PM.ops.length) save = false; // nothing drawn: keep the photo as it was
  if(save){
    const cv = document.getElementById('pmCanvas');
    PM.cur = null; pmDraw(true);
    try{ out = cv.toDataURL('image/jpeg', 0.88); }catch(e){ toast('Could not save the marked-up photo.'); return; }
  }
  const ov = document.getElementById('pmOverlay');
  if(ov){ ov.style.display = 'none'; ov.innerHTML = ''; }
  document.body.classList.remove('pm-open');
  window.removeEventListener('resize', pmFit);
  PM = null;
  resolve(out);
};
