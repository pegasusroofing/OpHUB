/* ================= UNIFORM EXPORT / EMAIL / ONEDRIVE BUTTONS =================
   These buttons were built screen by screen and ended up with different
   colours, icons and wording. Rather than restyle seventy buttons one at a
   time, every button drawn on screen is checked once: if it exports, emails
   or saves to OneDrive it gets the same look (.actbtn), the same icon, and
   the same wording. Confirm steps ("Confirm & Email…") and the OneDrive
   set-up buttons in Admin are left alone. */
function uniformActionLabel(t){
  let txt = t.replace(/^[\s✉️📄📊📋⬇☁🔗🔄\uFE0F]+/u, '').trim();
  if(!txt) return null;
  if(/confirm|link onedrive|sync folder|sync now|disconnect|connect onedrive|import/i.test(txt)) return null;
  let icon = null;
  if(/onedrive/i.test(txt)){ icon = '☁️'; txt = txt.replace(/^Upload to OneDrive/i, 'Save to OneDrive').replace(/^Push to OneDrive/i, 'Save to OneDrive'); }
  else if(/^e-?mail\b|^emailing|\bemail (pdf|report|selected|supplier|to do list)\b/i.test(txt)) icon = '✉️';
  else if(/^export|^exporting|^building/i.test(txt)){
    txt = txt.replace(/^Export to PDF$/i, 'Export PDF').replace(/^Export to Excel$/i, 'Export Excel');
    icon = /excel/i.test(txt) ? '📊' : '📄';
  }
  return icon ? icon+' '+txt : null;
}
function uniformActionButtons(root){
  try{
    (root || document).querySelectorAll('button, label.ghostbtn, label.darkbtn').forEach(el=>{
      if(el.dataset.act) return;
      const node = Array.from(el.childNodes).find(n=>n.nodeType===3 && n.nodeValue.trim());
      if(!node) return;
      // Only plain one-line buttons: skip anything with other visible content inside.
      if(Array.from(el.children).some(c=>c.tagName!=='INPUT')) return;
      const label = uniformActionLabel(node.nodeValue);
      el.dataset.act = label ? '1' : '0';
      if(!label) return;
      node.nodeValue = label;
      el.classList.add('actbtn');
    });
  }catch(e){ /* cosmetic only */ }
}
(function(){
  const start = ()=>{
    const app = document.getElementById('app'); if(!app) return;
    let queued = false;
    new MutationObserver(()=>{ if(queued) return; queued = true; requestAnimationFrame(()=>{ queued = false; uniformActionButtons(document.body); }); }).observe(document.body, {childList:true, subtree:true});
    uniformActionButtons(document.body);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
})();