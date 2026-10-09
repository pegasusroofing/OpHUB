/* ================= Live search filter =================
 * Hides / shows rows as you type instead of redrawing the whole page.
 * Redrawing on every letter made the screen jump (and on phones the keyboard
 * closed and reopened). Rows carry data-lf="<lower-case search text>"; an
 * element with class "lf-empty" shows when nothing matches; the list gets
 * class "lf-on" while a search is typed (used to hide the ↑ ↓ move buttons). */
function liveFilter(q, scope){
  q = String(q||'').trim().toLowerCase();
  const root = typeof scope==='string' ? document.querySelector(scope) : scope;
  if(!root) return 0;
  let n = 0;
  root.querySelectorAll('[data-lf]').forEach(el=>{
    const on = !q || el.dataset.lf.includes(q);
    el.style.display = on ? '' : 'none';
    if(on) n++;
  });
  root.classList.toggle('lf-on', !!q);
  root.querySelectorAll('.lf-empty').forEach(e=>{ e.style.display = n ? 'none' : ''; });
  return n;
}
window.liveFilter = liveFilter;
function lfText(s){ return escapeHtml(String(s||'').toLowerCase()); }
