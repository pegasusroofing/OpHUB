/* ================= MY SIGNATURE (adopted once, reused on RAMS & Toolbox Talks) ================= */
let sigHasDrawn = false;
function renderSignaturePad(){
  const __gen = RENDER_GEN;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Your signature</p>
      ${ME.signature_path ? `
        <p class="stub" style="margin:0 0 10px;">Currently adopted:</p>
        <div style="background:#fff;border:1.5px solid var(--line);border-radius:8px;padding:10px;margin-bottom:14px;">
          <img src="${publicUrl('signatures', ME.signature_path)}" style="height:50px;max-width:100%;object-fit:contain;">
        </div>
      ` : `<p class="stub" style="margin:0 0 10px;">Draw your signature below — it'll be used automatically whenever you sign a RAMS document or Toolbox Talk.</p>`}
      <p class="field-label" style="margin-bottom:6px;">${ME.signature_path ? 'Draw a new signature to replace it' : 'Draw here'}</p>
      <canvas id="sigCanvas" style="width:100%;height:160px;background:#fff;border:1.5px dashed var(--line);border-radius:8px;touch-action:none;display:block;"></canvas>
      <div class="row-gap" style="margin-top:12px;">
        <button class="ghostbtn" onclick="clearSignaturePad()">Clear</button>
        <button class="darkbtn" onclick="saveSignaturePad()">Save Signature</button>
      </div>
    </div>
  `, {title:'My Signature', subtitle:ME.name, back:'#/sites', tabs:false}); }
  attachSignatureCanvas();
}
let sigCtx = null;
function attachSignatureCanvas(){
  const canvas = document.getElementById('sigCanvas');
  if(!canvas) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#101114';
  sigCtx = ctx;
  sigHasDrawn = false;
  let drawing = false, lastX = 0, lastY = 0;
  function posFromEvent(e){
    const r = canvas.getBoundingClientRect();
    return {x: e.clientX - r.left, y: e.clientY - r.top};
  }
  canvas.onpointerdown = (e)=>{ drawing = true; const p = posFromEvent(e); lastX = p.x; lastY = p.y; canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e)=>{
    if(!drawing) return;
    const p = posFromEvent(e);
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastX = p.x; lastY = p.y;
    sigHasDrawn = true;
  };
  canvas.onpointerup = ()=>{ drawing = false; };
  canvas.onpointerleave = ()=>{ drawing = false; };
}
window.clearSignaturePad = function(){
  const canvas = document.getElementById('sigCanvas');
  if(canvas && sigCtx){ sigCtx.clearRect(0,0,canvas.width,canvas.height); sigHasDrawn = false; }
};
window.saveSignaturePad = async function(){
  if(!sigHasDrawn){ toast('Draw your signature first.'); return; }
  const canvas = document.getElementById('sigCanvas');
  const dataUrl = canvas.toDataURL('image/png');
  const path = ME.id+'/signature-'+Date.now()+'.png';
  const stored = await uploadDataUrl('signatures', path, dataUrl);
  if(!stored) return;
  const row = await dbUpdate('profiles', ME.id, {signature_path: path});
  if(row){
    ME.signature_path = path;
    toast('Signature saved');
    // Plain history.back() would now get caught by the popstate "go up one
    // level" safety net below anyway (see edge-swipe-to-go-back), so just go
    // there directly rather than round-tripping through a real back-nav.
    go(CURRENT_BACK_HASH || '#/sites');
  }
};
