/* ================= Drawing mark-up (roof plans / A3 drawings) =================
 * planMarkup(src, opts) opens a full-screen editor over a drawing (a photo or
 * a page rendered from a PDF). Different from the snag photo markup: it is
 * built for large A3 drawings, so the image is kept at high resolution (up to
 * 3600px on the long side), you can pinch / buttons to zoom in and pan, and
 * the marks are symbols sized to the drawing:
 *   - numbered coloured circles (auto-numbering, or the report's "key" items)
 *   - crosses, ticks, warning triangles, arrows, freehand pen and text
 *   - eraser (tap a mark to remove it), undo, clear
 * opts.ops    marks from a previous edit (so a drawing can be re-opened)
 * opts.keys   [{n, label, color}] report items ticked "Add to drawing": tap
 *             one, then tap the drawing to place its number
 * Resolves to {image: JPEG data URL with the marks drawn in, ops} or null. */
// Same colours as the report's condition (traffic-light) levels, so a number
// placed for an item can match that item's condition exactly.
const PLM_COLOURS = [
  {k:'#D32F2F', n:'Red'}, {k:'#EF7D00', n:'Orange'}, {k:'#E0B400', n:'Yellow'}, {k:'#1F9D52', n:'Green'},
  {k:'#2F6FD9', n:'Blue'}, {k:'#7B3FB5', n:'Purple'}, {k:'#111111', n:'Black'}
];
const PLM_SIZES = {xs:0.45, s:0.7, m:1, l:1.45};
const PLM_MAX = 3600; // long edge in px - sharp at A3, still safe for phone memory
let PLM = null;

async function plmLoadImage(src){
  let url = src, obj = null;
  if(!/^data:|^blob:/.test(src)){
    const res = await fetch(src, {cache:'no-store'});
    if(!res.ok) throw new Error('drawing '+res.status);
    obj = url = URL.createObjectURL(await res.blob());
  }
  try{
    return await new Promise((ok, bad)=>{ const im = new Image(); im.onload = ()=>ok(im); im.onerror = ()=>bad(new Error('img')); im.src = url; });
  } finally { if(obj) setTimeout(()=>URL.revokeObjectURL(obj), 4000); }
}

// A PDF drawing -> one JPEG data URL per page, PLM_MAX on the long side.
async function planPdfToImages(file){
  if(!(await loadLib('pdfjsLib'))) throw new Error('PDF reader failed to load');
  const buf = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({data: buf}).promise;
  const out = [];
  const pages = Math.min(pdf.numPages, 10);
  for(let i=1;i<=pages;i++){
    const page = await pdf.getPage(i);
    const vp1 = page.getViewport({scale:1});
    const sc = PLM_MAX / Math.max(vp1.width, vp1.height);
    const vp = page.getViewport({scale: sc});
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cv.width,cv.height);
    await page.render({canvasContext: ctx, viewport: vp}).promise;
    out.push(cv.toDataURL('image/jpeg', 0.88));
    cv.width = cv.height = 0;
  }
  return out;
}
// A photo / image file -> JPEG data URL, PLM_MAX on the long side.
async function planImageFileToDataUrl(file){
  const url = URL.createObjectURL(file);
  try{
    const im = await new Promise((ok, bad)=>{ const i = new Image(); i.onload = ()=>ok(i); i.onerror = ()=>bad(new Error('img')); i.src = url; });
    const sc = Math.min(1, PLM_MAX / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(im.naturalWidth*sc); cv.height = Math.round(im.naturalHeight*sc);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.drawImage(im, 0, 0, cv.width, cv.height);
    const d = cv.toDataURL('image/jpeg', 0.88); cv.width = cv.height = 0; return d;
  } finally { URL.revokeObjectURL(url); }
}
window.planPdfToImages = planPdfToImages;
window.planImageFileToDataUrl = planImageFileToDataUrl;

function planMarkup(src, opts){
  opts = opts || {};
  return new Promise(async resolve=>{
    let img;
    try{ img = await plmLoadImage(src); }
    catch(e){ toast('Could not open that drawing.'); return resolve(null); }
    const sc = Math.min(1, PLM_MAX/Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth*sc), H = Math.round(img.naturalHeight*sc);
    const ops = Array.isArray(opts.ops) ? JSON.parse(JSON.stringify(opts.ops)) : [];
    // Numbers placed for a report item take that item's condition colour -
    // refreshed here in case the condition was changed since they were placed
    // (unless a colour was picked by hand for that number).
    const keyCol = {}; (opts.keys||[]).forEach(k=>{ if(k.color) keyCol[+k.n] = k.color; });
    ops.forEach(o=>{ if(o.t==='num' && o.key && o.auto && keyCol[+o.n]) o.c = keyCol[+o.n]; });
    PLM = {img, W, H, ops, keys: (opts.keys||[]).slice(), tool:'num', colour:'#D32F2F', size:'m', cur:null, resolve,
           z:1, tx:0, ty:0, fit:1, ptrs:new Map(), pinch:null, pan:null, keyPick:null, nextNum:null, base:null};
    let ov = document.getElementById('plmOverlay');
    if(!ov){ ov = document.createElement('div'); ov.id = 'plmOverlay'; ov.className = 'pm-overlay plm'; document.body.appendChild(ov); }
    ov.innerHTML = `
      <div class="pm-top">
        <button class="pm-btn" onclick="plmDone(false)">Cancel</button>
        <div class="pm-title">Mark up drawing</div>
        <button class="pm-btn pm-save" onclick="plmDone(true)">Save</button>
      </div>
      <div class="plm-stage" id="plmStage"><div class="plm-zoombox" id="plmBox"><canvas id="plmCanvas" width="${W}" height="${H}"></canvas></div>
        <div class="plm-zoom"><button onclick="plmZoomBy(1.4)">＋</button><button onclick="plmZoomBy(1/1.4)">－</button><button onclick="plmFit()">Fit</button></div>
      </div>
      <div class="pm-bar">
        <div class="pm-row" id="plmKeys"></div>
        <div class="pm-row" id="plmTools"></div>
        <div class="pm-row" id="plmEdit"></div>
        <div class="pm-row" id="plmColours"></div>
      </div>`;
    ov.style.display = 'flex';
    document.body.classList.add('pm-open');
    const base = document.createElement('canvas'); base.width = W; base.height = H; PLM.base = base;
    plmRebuildBase();
    const cv = document.getElementById('plmCanvas');
    cv.addEventListener('pointerdown', plmDown);
    cv.addEventListener('pointermove', plmMove);
    cv.addEventListener('pointerup', plmUp);
    cv.addEventListener('pointercancel', plmUp);
    window.addEventListener('resize', plmFit);
    plmFit();
    plmBar();
    plmDraw();
  });
}
window.planMarkup = planMarkup;

function plmR(){ return Math.max(9, Math.round(Math.max(PLM.W, PLM.H)/95 * PLM_SIZES[PLM.size])); }
function plmMaxNum(){ return PLM.ops.reduce((m,o)=>o.t==='num' ? Math.max(m, +o.n||0) : m, 0); }
function plmKeyNums(){ return new Set(PLM.keys.map(k=>+k.n)); }
function plmNextFree(){
  // Free numbers carry on after both the key numbers and anything placed.
  let n = plmMaxNum();
  PLM.keys.forEach(k=>{ n = Math.max(n, +k.n||0); });
  return n + 1;
}
function plmApplyView(){
  const box = document.getElementById('plmBox'); if(!box) return;
  box.style.transform = `translate(${PLM.tx}px,${PLM.ty}px) scale(${PLM.z})`;
}
window.plmFit = function(){
  if(!PLM) return;
  const st = document.getElementById('plmStage'), cv = document.getElementById('plmCanvas'); if(!st || !cv) return;
  const r = Math.min((st.clientWidth-8)/PLM.W, (st.clientHeight-8)/PLM.H);
  PLM.fit = r;
  cv.style.width = Math.floor(PLM.W*r)+'px'; cv.style.height = Math.floor(PLM.H*r)+'px';
  PLM.z = 1;
  PLM.tx = Math.round((st.clientWidth - PLM.W*r)/2); PLM.ty = Math.round((st.clientHeight - PLM.H*r)/2);
  plmApplyView();
};
function plmZoomAt(factor, cx, cy){
  const nz = Math.max(1, Math.min(8, PLM.z*factor));
  const f = nz/PLM.z;
  PLM.tx = cx - (cx - PLM.tx)*f; PLM.ty = cy - (cy - PLM.ty)*f; PLM.z = nz;
  if(nz===1){ plmFit(); return; }
  plmApplyView();
}
window.plmZoomBy = function(f){
  const st = document.getElementById('plmStage'); if(!st || !PLM) return;
  plmZoomAt(f, st.clientWidth/2, st.clientHeight/2);
};
function plmBar(){
  const keysEl = document.getElementById('plmKeys');
  const placed = new Set(PLM.ops.filter(o=>o.t==='num').map(o=>+o.n));
  keysEl.innerHTML = PLM.keys.length ? `<span class="pm-lbl">Items to place</span>` + PLM.keys.map(k=>`<button class="pm-tool plm-key ${PLM.tool==='key' && PLM.keyPick===k.n?'on':''} ${placed.has(+k.n)?'done':''}" title="${escapeHtml(k.label)}" onclick="plmPickKey(${+k.n})"><span class="plm-keydot" style="background:${k.color||PLM.colour};">${+k.n}</span>${placed.has(+k.n)?'✓':''}</button>`).join('') : '';
  keysEl.style.display = PLM.keys.length ? '' : 'none';
  const nextN = PLM.nextNum || plmNextFree();
  const tools = [['num','<span class="plm-keydot" style="background:'+PLM.colour+';">'+nextN+'</span> Number'],['cross','✕ Cross'],['tick','✓ Tick'],['warn','⚠ Warning'],['arrow','➚ Arrow'],['pen','✏️ Pen'],['text','T Text'],['erase','🧽 Erase'],['pan','✋ Move']];
  document.getElementById('plmTools').innerHTML = tools.map(([k,n])=>`<button class="pm-tool ${PLM.tool===k?'on':''}" onclick="plmSetTool('${k}')">${n}</button>`).join('');
  const selOp = PLM.sel!=null ? PLM.ops[PLM.sel] : null;
  if(selOp){
    document.getElementById('plmEdit').innerHTML = `<span class="pm-lbl">Selected ${selOp.t==='num'?selOp.n:selOp.t==='text'?'text':selOp.t}</span>` +
      `<button class="pm-tool" onclick="plmSelSmaller()">－ Smaller</button><button class="pm-tool" onclick="plmSelBigger()">＋ Bigger</button>` +
      (selOp.t==='text' ? `<button class="pm-tool" onclick="plmSelEditText()">✎ Edit</button>` : '') +
      `<button class="pm-tool" onclick="plmSelDelete()">🗑</button><button class="pm-tool on" onclick="plmSelDone()">Done</button>`;
    document.getElementById('plmColours').innerHTML = `<span class="pm-lbl">Colour</span>` +
      PLM_COLOURS.map(c=>`<button class="pm-dot ${selOp.c===c.k?'on':''}" style="background:${c.k};" title="${c.n}" aria-label="${c.n}" onclick="plmSelColour('${c.k}')"></button>`).join('');
    return;
  }
  document.getElementById('plmEdit').innerHTML =
    `<span class="pm-lbl">Size</span>` + ['xs','s','m','l'].map(k=>`<button class="pm-tool pm-size ${PLM.size===k?'on':''}" onclick="plmSetSize('${k}')">${k.toUpperCase()}</button>`).join('') +
    (PLM.tool==='num' ? `<button class="pm-tool" onclick="plmSetNext()">Start at…</button>` : '') +
    `<span class="pm-gap"></span><button class="pm-tool" onclick="plmUndo()" ${PLM.ops.length?'':'disabled'}>↶ Undo</button><button class="pm-tool" onclick="plmClear()" ${PLM.ops.length?'':'disabled'}>Clear</button>`;
  document.getElementById('plmColours').innerHTML = `<span class="pm-lbl">Colour</span>` +
    PLM_COLOURS.map(c=>`<button class="pm-dot ${PLM.colour===c.k?'on':''}" style="background:${c.k};" title="${c.n}" aria-label="${c.n}" onclick="plmSetColour('${c.k}')"></button>`).join('');
}
window.plmSetTool = function(t){ if(PLM.sel!=null){ PLM.sel = null; plmRebuildBase(); plmDraw(); } PLM.tool = t; if(t!=='key') PLM.keyPick = null; plmBar(); };
// Picking an item switches the colour to that item's condition colour; tapping
// a colour after that overrides it for the numbers you place.
function plmKeyColour(n){ const k = PLM.keys.find(x=>+x.n===+n); return (k && k.color) || null; }
window.plmPickKey = function(n){ PLM.tool = 'key'; PLM.keyPick = n; const c = plmKeyColour(n); if(c){ PLM.colour = c; PLM.colourPicked = false; } plmBar(); toast('Tap the drawing to place '+n); };
window.plmSetSize = function(s){ PLM.size = s; plmBar(); };
window.plmSetColour = function(c){ PLM.colour = c; PLM.colourPicked = true; plmBar(); };
window.plmSetNext = async function(){
  const v = await customPrompt('Next number to place', String(PLM.nextNum || plmNextFree()));
  const n = parseInt(v, 10); if(n>0){ PLM.nextNum = n; plmBar(); }
};
window.plmUndo = function(){ PLM.sel = null; PLM.ops.pop(); plmRebuildBase(); plmDraw(); plmBar(); };
window.plmClear = async function(){
  if(!PLM.ops.length) return;
  if(!(await customConfirm('Remove all marks from this drawing?'))) return;
  PLM.ops = []; PLM.sel = null; PLM.nextNum = null; plmRebuildBase(); plmDraw(); plmBar();
};
function plmPt(e){
  const cv = document.getElementById('plmCanvas'), b = cv.getBoundingClientRect();
  return {x:(e.clientX-b.left)*PLM.W/b.width, y:(e.clientY-b.top)*PLM.H/b.height};
}
function plmStagePt(e){ const st = document.getElementById('plmStage').getBoundingClientRect(); return {x:e.clientX-st.left, y:e.clientY-st.top}; }
function plmDown(e){
  if(!PLM) return;
  e.preventDefault();
  try{ e.target.setPointerCapture(e.pointerId); }catch(_){}
  PLM.ptrs.set(e.pointerId, plmStagePt(e));
  if(PLM.ptrs.size === 2){
    // two fingers: pinch to zoom / drag to pan - or, with a mark selected,
    // squeeze / stretch to make that mark smaller / bigger
    PLM.cur = null; PLM.tap = null;
    if(PLM.drag){ plmEndDrag(false); }
    const [a,b] = Array.from(PLM.ptrs.values());
    PLM.pinch = {d: Math.hypot(a.x-b.x, a.y-b.y), cx:(a.x+b.x)/2, cy:(a.y+b.y)/2, resize: PLM.sel!=null};
    plmDraw(); return;
  }
  if(PLM.ptrs.size > 2) return;
  const sp = plmStagePt(e);
  if(PLM.tool==='pan'){ PLM.pan = {x:sp.x, y:sp.y, tx:PLM.tx, ty:PLM.ty}; return; }
  const p = plmPt(e);
  // Press on a number / symbol / text you've already placed: hold and drag to
  // move it, or just tap it to select it (then resize, edit or delete it).
  if(PLM.tool!=='erase'){
    const hit = plmHit(p);
    if(hit >= 0){
      const o = PLM.ops[hit];
      PLM.drag = {i:hit, dx:o.x-p.x, dy:o.y-p.y, sx:sp.x, sy:sp.y, moved:false};
      PLM.sel = hit;
      plmRebuildBase(hit); plmDraw(); plmBar();
      return;
    }
  }
  if(PLM.tool==='pen' || PLM.tool==='arrow'){
    PLM.cur = {t:PLM.tool, c:PLM.colour, w:Math.max(4, Math.round(plmR()/4)), pts:[p]};
    return;
  }
  PLM.tap = {p, sx:sp.x, sy:sp.y};
}
function plmMove(e){
  if(!PLM || !PLM.ptrs.has(e.pointerId)) return;
  e.preventDefault();
  PLM.ptrs.set(e.pointerId, plmStagePt(e));
  if(PLM.pinch && PLM.ptrs.size >= 2 && PLM.pinch.resize && PLM.sel!=null && PLM.ops[PLM.sel]){
    const [a,b] = Array.from(PLM.ptrs.values());
    const d = Math.hypot(a.x-b.x, a.y-b.y);
    if(PLM.pinch.d > 0) plmScaleSel(d/PLM.pinch.d, true);
    PLM.pinch.d = d;
    return;
  }
  if(PLM.pinch && PLM.ptrs.size >= 2){
    const [a,b] = Array.from(PLM.ptrs.values());
    const d = Math.hypot(a.x-b.x, a.y-b.y), cx = (a.x+b.x)/2, cy = (a.y+b.y)/2;
    PLM.tx += cx - PLM.pinch.cx; PLM.ty += cy - PLM.pinch.cy;
    if(PLM.pinch.d > 0) plmZoomAt(d/PLM.pinch.d, cx, cy); else plmApplyView();
    PLM.pinch = {d, cx, cy};
    return;
  }
  if(PLM.pan){
    const sp = plmStagePt(e);
    PLM.tx = PLM.pan.tx + (sp.x - PLM.pan.x); PLM.ty = PLM.pan.ty + (sp.y - PLM.pan.y);
    plmApplyView(); return;
  }
  if(PLM.drag){
    const sp = plmStagePt(e);
    if(!PLM.drag.moved && Math.hypot(sp.x-PLM.drag.sx, sp.y-PLM.drag.sy) < 6) return;
    PLM.drag.moved = true;
    const p = plmPt(e), o = PLM.ops[PLM.drag.i];
    if(o){ o.x = p.x + PLM.drag.dx; o.y = p.y + PLM.drag.dy; }
    plmDraw(); return;
  }
  if(PLM.cur){
    const p = plmPt(e);
    if(PLM.cur.t==='pen') PLM.cur.pts.push(p); else PLM.cur.pts[1] = p;
    plmDraw(); return;
  }
  if(PLM.tap){
    const sp = plmStagePt(e);
    if(Math.hypot(sp.x-PLM.tap.sx, sp.y-PLM.tap.sy) > 10) PLM.tap = null; // a drag, not a tap
  }
}
async function plmUp(e){
  if(!PLM) return;
  PLM.ptrs.delete(e.pointerId);
  if(PLM.ptrs.size < 2) PLM.pinch = null;
  if(PLM.pinch===null && PLM._resized){ PLM._resized = false; plmRebuildBase(PLM.sel); plmDraw(); }
  if(PLM.pan){ PLM.pan = null; return; }
  if(PLM.drag){
    const d = PLM.drag; PLM.drag = null;
    const o = PLM.ops[d.i];
    if(!d.moved && o && o.t==='text'){
      // tap on text: change what it says
      const txt = await customPrompt('Edit text', o.s);
      if(PLM && txt != null && txt.trim()){ o.s = txt.trim(); }
    }
    if(PLM){ plmRebuildBase(PLM.sel); plmDraw(); plmBar(); }
    return;
  }
  if(PLM.sel!=null && PLM.tap){
    // a tap on an empty spot just puts the selected mark down
    PLM.tap = null; PLM.sel = null; plmRebuildBase(); plmDraw(); plmBar(); return;
  }
  if(PLM.cur){
    const o = PLM.cur; PLM.cur = null;
    const ok = o.t==='pen' ? o.pts.length>1 : (o.pts[1] && Math.hypot(o.pts[1].x-o.pts[0].x, o.pts[1].y-o.pts[0].y) > 8);
    if(ok){ PLM.ops.push(o); plmDrawOp(PLM.base.getContext('2d'), o); plmBar(); }
    plmDraw(); return;
  }
  if(!PLM.tap) return;
  const p = PLM.tap.p; PLM.tap = null;
  const r = plmR();
  const t = PLM.tool;
  if(t==='erase'){
    // remove the mark nearest the tap (within reach)
    let best = -1, bd = Infinity;
    PLM.ops.forEach((o,i)=>{
      let d;
      if(o.pts) d = Math.min.apply(null, o.pts.map(q=>Math.hypot(q.x-p.x, q.y-p.y)));
      else d = Math.hypot(o.x-p.x, o.y-p.y);
      const reach = (o.r || o.fs || o.w*4 || r) * 1.6;
      if(d < reach && d < bd){ bd = d; best = i; }
    });
    if(best >= 0){ PLM.sel = null; PLM.ops.splice(best, 1); plmRebuildBase(); plmDraw(); plmBar(); }
    return;
  }
  let op = null;
  if(t==='key' && PLM.keyPick!=null){
    const kc = plmKeyColour(PLM.keyPick);
    const auto = !!kc && !PLM.colourPicked;
    op = {t:'num', n:+PLM.keyPick, c: auto ? kc : PLM.colour, r, x:p.x, y:p.y, key:true, auto};
    // move on to the next item that hasn't been placed yet (and its colour)
    const placed = new Set(PLM.ops.filter(o=>o.t==='num').map(o=>+o.n)); placed.add(+PLM.keyPick);
    const nxt = PLM.keys.find(x=>!placed.has(+x.n));
    PLM.keyPick = nxt ? +nxt.n : null; if(!nxt) PLM.tool = 'num';
    if(nxt){ const c2 = plmKeyColour(nxt.n); if(c2 && !PLM.colourPicked) PLM.colour = c2; }
  } else if(t==='num'){
    const n = PLM.nextNum || plmNextFree();
    op = {t:'num', n, c:PLM.colour, r, x:p.x, y:p.y};
    PLM.nextNum = n + 1;
    const keyNums = plmKeyNums(); while(keyNums.has(PLM.nextNum)) PLM.nextNum++;
  } else if(t==='cross' || t==='tick' || t==='warn'){
    op = {t, c:PLM.colour, r, x:p.x, y:p.y};
  } else if(t==='text'){
    const txt = await customPrompt('Text to add to the drawing', '');
    if(!PLM || !txt || !txt.trim()) return;
    op = {t:'text', c:PLM.colour, fs:Math.round(r*1.1), s:txt.trim(), x:p.x, y:p.y};
  }
  if(op){ PLM.ops.push(op); plmDrawOp(PLM.base.getContext('2d'), op); plmDraw(); plmBar(); }
}
// The number / symbol / text nearest a point (within reach), or -1.
function plmHit(p){
  let best = -1, bd = Infinity;
  PLM.ops.forEach((o,i)=>{
    if(o.pts) return; // pen lines and arrows are not picked up
    let d, reach;
    if(o.t==='text'){
      const w = (o.s||'').length * o.fs * 0.6;
      const inside = p.x >= o.x - o.fs*0.3 && p.x <= o.x + w + o.fs*0.3 && Math.abs(p.y - o.y) <= o.fs*0.8;
      d = inside ? 0 : Infinity; reach = 1;
    } else { d = Math.hypot(o.x-p.x, o.y-p.y); reach = Math.max(o.r*1.25, 14/(PLM.fit*PLM.z)); }
    if(d < reach && d < bd){ bd = d; best = i; }
  });
  return best;
}
function plmEndDrag(){ PLM.drag = null; }
// Make the selected mark bigger / smaller (buttons, or a pinch while it's selected).
function plmScaleSel(f, live){
  const o = PLM.sel!=null ? PLM.ops[PLM.sel] : null; if(!o) return;
  if(o.t==='text') o.fs = Math.max(8, Math.min(PLM.W/4, o.fs*f));
  else if(o.r) o.r = Math.max(6, Math.min(PLM.W/6, o.r*f));
  if(live){ PLM._resized = true; plmDraw(); }
  else { plmRebuildBase(PLM.sel); plmDraw(); }
}
window.plmSelBigger = function(){ plmScaleSel(1.2); };
window.plmSelSmaller = function(){ plmScaleSel(1/1.2); };
window.plmSelDelete = function(){
  if(PLM.sel==null) return;
  PLM.ops.splice(PLM.sel, 1); PLM.sel = null; plmRebuildBase(); plmDraw(); plmBar();
};
window.plmSelDone = function(){ PLM.sel = null; plmRebuildBase(); plmDraw(); plmBar(); };
window.plmSelEditText = async function(){
  const o = PLM.sel!=null ? PLM.ops[PLM.sel] : null; if(!o || o.t!=='text') return;
  const txt = await customPrompt('Edit text', o.s);
  if(PLM && txt != null && txt.trim()){ o.s = txt.trim(); plmRebuildBase(PLM.sel); plmDraw(); }
};
window.plmSelColour = function(c){
  const o = PLM.sel!=null ? PLM.ops[PLM.sel] : null; if(!o) return;
  o.c = c; o.auto = false; plmRebuildBase(PLM.sel); plmDraw(); plmBar();
};
function plmLight(c){ return ['#ffd400','#ffffff','#E0B400','#e0b400'].indexOf(c) >= 0; }
function plmDrawOp(ctx, o){
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const halo = plmLight(o.c) ? 'rgba(0,0,0,.85)' : '#ffffff';
  if(o.t==='num'){
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI*2);
    ctx.fillStyle = o.c; ctx.fill();
    ctx.lineWidth = Math.max(3, o.r*0.16); ctx.strokeStyle = halo; ctx.stroke();
    const s = String(o.n);
    const fs = Math.round(o.r * (s.length>2 ? 0.85 : s.length>1 ? 1.05 : 1.2));
    ctx.font = 'bold '+fs+'px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = plmLight(o.c) ? '#111' : '#fff';
    ctx.fillText(s, o.x, o.y + fs*0.04);
  } else if(o.t==='cross' || o.t==='tick'){
    const r = o.r;
    const path = c=>{ c.beginPath();
      if(o.t==='cross'){ c.moveTo(o.x-r*0.8, o.y-r*0.8); c.lineTo(o.x+r*0.8, o.y+r*0.8); c.moveTo(o.x+r*0.8, o.y-r*0.8); c.lineTo(o.x-r*0.8, o.y+r*0.8); }
      else { c.moveTo(o.x-r*0.85, o.y); c.lineTo(o.x-r*0.25, o.y+r*0.65); c.lineTo(o.x+r*0.9, o.y-r*0.75); }
      c.stroke(); };
    ctx.lineWidth = r*0.5; ctx.strokeStyle = halo; path(ctx);
    ctx.lineWidth = r*0.3; ctx.strokeStyle = o.c; path(ctx);
  } else if(o.t==='warn'){
    const r = o.r*1.15;
    ctx.beginPath(); ctx.moveTo(o.x, o.y-r); ctx.lineTo(o.x+r*0.95, o.y+r*0.7); ctx.lineTo(o.x-r*0.95, o.y+r*0.7); ctx.closePath();
    ctx.fillStyle = o.c; ctx.fill(); ctx.lineWidth = Math.max(3, r*0.14); ctx.strokeStyle = halo; ctx.stroke();
    ctx.font = 'bold '+Math.round(r*1.05)+'px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = plmLight(o.c) ? '#111' : '#fff';
    ctx.fillText('!', o.x, o.y + r*0.18);
  } else if(o.t==='text'){
    ctx.font = 'bold '+o.fs+'px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, o.fs/5); ctx.strokeStyle = halo; ctx.strokeText(o.s, o.x, o.y);
    ctx.fillStyle = o.c; ctx.fillText(o.s, o.x, o.y);
  } else if(o.t==='pen' || o.t==='arrow'){
    ctx.strokeStyle = o.c; ctx.fillStyle = o.c; ctx.lineWidth = o.w;
    const a = o.pts[0], b = o.pts[1];
    if(o.t==='pen'){
      ctx.beginPath(); ctx.moveTo(a.x, a.y); o.pts.forEach(q=>ctx.lineTo(q.x, q.y)); ctx.stroke();
    } else if(b){
      const ang = Math.atan2(b.y-a.y, b.x-a.x), hl = o.w*4.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - Math.cos(ang)*hl*0.6, b.y - Math.sin(ang)*hl*0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - hl*Math.cos(ang-0.45), b.y - hl*Math.sin(ang-0.45));
      ctx.lineTo(b.x - hl*Math.cos(ang+0.45), b.y - hl*Math.sin(ang+0.45));
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}
function plmRebuildBase(skip){
  const ctx = PLM.base.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,PLM.W,PLM.H);
  ctx.drawImage(PLM.img, 0, 0, PLM.W, PLM.H);
  PLM.ops.forEach((o,i)=>{ if(i!==skip) plmDrawOp(ctx, o); });
  PLM.baseSkip = (skip==null ? null : skip);
}
function plmDraw(){
  const cv = document.getElementById('plmCanvas'); if(!cv || !PLM) return;
  const ctx = cv.getContext('2d');
  ctx.drawImage(PLM.base, 0, 0);
  if(PLM.baseSkip!=null && PLM.ops[PLM.baseSkip]){
    const o = PLM.ops[PLM.baseSkip];
    plmDrawOp(ctx, o);
    // selection ring
    ctx.save(); ctx.setLineDash([Math.max(6, (o.r||o.fs)*0.3), Math.max(4, (o.r||o.fs)*0.2)]);
    ctx.lineWidth = Math.max(3, (o.r||o.fs)*0.12); ctx.strokeStyle = '#1e88e5';
    if(o.t==='text'){ ctx.font = 'bold '+o.fs+'px -apple-system, Segoe UI, Roboto, Arial, sans-serif'; const w = ctx.measureText(o.s).width; ctx.strokeRect(o.x-o.fs*0.3, o.y-o.fs*0.75, w+o.fs*0.6, o.fs*1.5); }
    else { ctx.beginPath(); ctx.arc(o.x, o.y, (o.r||20)*1.45, 0, Math.PI*2); ctx.stroke(); }
    ctx.restore();
  }
  if(PLM.cur) plmDrawOp(ctx, PLM.cur);
}
window.plmDone = async function(save){
  if(!PLM) return;
  if(!save && PLM.ops.length && !(await customConfirm('Close without saving your marks?'))) return;
  const resolve = PLM.resolve;
  let out = null;
  if(save){
    PLM.cur = null; plmRebuildBase();
    try{ out = {image: PLM.base.toDataURL('image/jpeg', 0.86), ops: PLM.ops}; }catch(e){ toast('Could not save the marked-up drawing.'); return; }
  }
  const ov = document.getElementById('plmOverlay');
  if(ov){ ov.style.display = 'none'; ov.innerHTML = ''; }
  document.body.classList.remove('pm-open');
  window.removeEventListener('resize', plmFit);
  try{ PLM.base.width = PLM.base.height = 0; }catch(e){}
  PLM = null;
  resolve(out);
};
