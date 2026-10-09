/* ================= Photo markup (draw + text on a photo) =================
 * photoMarkup(src) opens a full-screen editor over a photo (a data URL or a
 * web address). The user can draw (pen, arrow, circle) and add text, each in
 * its own colour (pen and text remember their colours separately). Resolves
 * to a new JPEG data URL on Save, or null on Cancel. Used by Snagging. */
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
    PM = {img, W, H, ops:[], tool:'pen', colour:{pen:'#e53935', text:'#ffd400'}, size:'m', cur:null, resolve};
    let ov = document.getElementById('pmOverlay');
    if(!ov){ ov = document.createElement('div'); ov.id = 'pmOverlay'; ov.className = 'pm-overlay'; document.body.appendChild(ov); }
    ov.innerHTML = `
      <div class="pm-top">
        <button class="pm-btn" onclick="pmDone(false)">Cancel</button>
        <div class="pm-title">Mark up photo</div>
        <button class="pm-btn pm-save" onclick="pmDone(true)">${escapeHtml(opts.saveLabel||'Save')}</button>
      </div>
      <div class="pm-stage" id="pmStage"><canvas id="pmCanvas" width="${W}" height="${H}"></canvas></div>
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
function pmBar(){
  const tools = [['pen','✏️ Pen'],['arrow','➚ Arrow'],['circle','◯ Circle'],['text','T Text']];
  const colKey = PM.tool==='text' ? 'text' : 'pen';
  document.getElementById('pmTools').innerHTML =
    tools.map(([k,n])=>`<button class="pm-tool ${PM.tool===k?'on':''}" onclick="pmSetTool('${k}')">${n}</button>`).join('');
  document.getElementById('pmEdit').innerHTML =
    `<span class="pm-lbl">Size</span>` +
    ['s','m','l'].map(k=>`<button class="pm-tool pm-size ${PM.size===k?'on':''}" onclick="pmSetSize('${k}')" title="Size">${k.toUpperCase()}</button>`).join('') +
    `<span class="pm-gap"></span>` +
    `<button class="pm-tool" onclick="pmUndo()" ${PM.ops.length?'':'disabled'}>↶ Undo</button>` +
    `<button class="pm-tool" onclick="pmClear()" ${PM.ops.length?'':'disabled'}>Clear</button>`;
  document.getElementById('pmColours').innerHTML =
    `<span class="pm-lbl">${colKey==='text'?'Text colour':'Pen colour'}</span>` +
    PM_COLOURS.map(c=>`<button class="pm-dot ${PM.colour[colKey]===c.k?'on':''}" style="background:${c.k};" title="${c.n}" aria-label="${c.n}" onclick="pmSetColour('${c.k}')"></button>`).join('');
}
window.pmSetTool = function(t){ PM.tool = t; pmBar(); };
window.pmSetSize = function(s){ PM.size = s; pmBar(); };
window.pmSetColour = function(c){ PM.colour[PM.tool==='text'?'text':'pen'] = c; pmBar(); };
window.pmUndo = function(){ PM.ops.pop(); pmDraw(); pmBar(); };
window.pmClear = async function(){
  if(!PM.ops.length) return;
  if(!(await customConfirm('Remove all markings from this photo?'))) return;
  PM.ops = []; pmDraw(); pmBar();
};
function pmPt(e){
  const cv = document.getElementById('pmCanvas'), b = cv.getBoundingClientRect();
  return {x:(e.clientX-b.left)*PM.W/b.width, y:(e.clientY-b.top)*PM.H/b.height};
}
function pmLineW(){ return Math.max(3, Math.round(Math.max(PM.W, PM.H)/220 * PM_SIZES[PM.size])); }
function pmDown(e){
  if(!PM) return;
  e.preventDefault();
  const p = pmPt(e);
  if(PM.tool==='text'){ pmAddText(p); return; }
  try{ e.target.setPointerCapture(e.pointerId); }catch(_){}
  PM.cur = {t:PM.tool, c:PM.colour.pen, w:pmLineW(), pts:[p]};
}
function pmMove(e){
  if(!PM || !PM.cur) return;
  e.preventDefault();
  const p = pmPt(e);
  if(PM.cur.t==='pen') PM.cur.pts.push(p); else PM.cur.pts[1] = p;
  pmDraw();
}
function pmUp(){
  if(!PM || !PM.cur) return;
  const o = PM.cur; PM.cur = null;
  const ok = o.t==='pen' ? o.pts.length>0 : (o.pts[1] && Math.hypot(o.pts[1].x-o.pts[0].x, o.pts[1].y-o.pts[0].y) > 6);
  if(ok){ PM.ops.push(o); pmBar(); }
  pmDraw();
}
async function pmAddText(p){
  const txt = await customPrompt('Text to add to the photo', '');
  if(!PM || !txt || !txt.trim()) return;
  const fs = Math.max(16, Math.round(Math.max(PM.W, PM.H)/28 * PM_SIZES[PM.size]));
  PM.ops.push({t:'text', c:PM.colour.text, fs, s:txt.trim(), x:p.x, y:p.y});
  pmDraw(); pmBar();
}
function pmDark(c){ return ['#ffffff','#ffd400','#ff8f00'].indexOf(c) >= 0; }
function pmDrawOp(ctx, o){
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if(o.t==='text'){
    ctx.font = 'bold '+o.fs+'px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
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
function pmDraw(){
  const cv = document.getElementById('pmCanvas'); if(!cv || !PM) return;
  const ctx = cv.getContext('2d');
  ctx.drawImage(PM.img, 0, 0, PM.W, PM.H);
  PM.ops.forEach(o=>pmDrawOp(ctx, o));
  if(PM.cur) pmDrawOp(ctx, PM.cur);
}
window.pmDone = async function(save){
  if(!PM) return;
  if(!save && PM.ops.length && !(await customConfirm('Discard your markings?'))) return;
  const resolve = PM.resolve;
  let out = null;
  if(save && !PM.ops.length) save = false; // nothing drawn: keep the photo as it was
  if(save){
    const cv = document.getElementById('pmCanvas');
    PM.cur = null; pmDraw();
    try{ out = cv.toDataURL('image/jpeg', 0.88); }catch(e){ toast('Could not save the marked-up photo.'); return; }
  }
  const ov = document.getElementById('pmOverlay');
  if(ov){ ov.style.display = 'none'; ov.innerHTML = ''; }
  document.body.classList.remove('pm-open');
  window.removeEventListener('resize', pmFit);
  PM = null;
  resolve(out);
};
