/* ============================================================
   OpHUB Finance — a ⋯ on each figure card to choose its date range
   (21 Oct 2026, Andy: "owed to us (this month), date range, same for
   received this month etc"). Remembered on this device per card.
   ============================================================ */
const FIN_PERIODS = [['month','This month'],['lastmonth','Last month'],['quarter','This quarter'],['year','This year'],['all','All time'],['custom','Pick dates…']];
let FIN_STAT_P = {};
try{ FIN_STAT_P = JSON.parse(localStorage.getItem('finStatP')||'{}') || {}; }catch(e){ FIN_STAT_P = {}; }
let finStatMenuOpen = null;
function finStatPeriod(key, def){
  const p = FIN_STAT_P[key] || {k:def||'all'};
  const t = finToday(), y = Number(t.slice(0,4)), m = Number(t.slice(5,7));
  const pad = n=>String(n).padStart(2,'0');
  const last = (yy,mm)=>new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if(p.k==='month') return {k:p.k, from:`${y}-${pad(m)}-01`, to:t, label:'this month'};
  if(p.k==='lastmonth'){ const yy = m===1?y-1:y, mm = m===1?12:m-1; return {k:p.k, from:`${yy}-${pad(mm)}-01`, to:`${yy}-${pad(mm)}-${pad(last(yy,mm))}`, label:'last month'}; }
  if(p.k==='quarter'){ const qm = Math.floor((m-1)/3)*3+1; return {k:p.k, from:`${y}-${pad(qm)}-01`, to:t, label:'this quarter'}; }
  if(p.k==='year') return {k:p.k, from:`${y}-01-01`, to:t, label:'this year'};
  if(p.k==='custom' && p.from && p.to) return {k:p.k, from:p.from, to:p.to, label:finDate(p.from)+' – '+finDate(p.to)};
  return {k:'all', from:null, to:null, label:'all time'};
}
function finInPeriod(d, r){ if(!r || !r.from) return true; const s = String(d||'').slice(0,10); return !!s && s>=r.from && s<=r.to; }
// One figure card with a ⋯ period menu. o = {key, def, value, label, onclick, tone}
function finStatCardHtml(o){
  const r = finStatPeriod(o.key, o.def);
  const open = finStatMenuOpen===o.key;
  return `<div class="pmstat finstatp" onclick="${o.onclick||''}">
    <button type="button" class="finstatp-dots" title="Change dates" onclick="event.stopPropagation();finStatMenuOpen=finStatMenuOpen==='${o.key}'?null:'${o.key}';render()">⋯</button>
    ${open ? `<div class="finstatp-menu" onclick="event.stopPropagation()">${FIN_PERIODS.map(([k,l])=>`<div class="statusmenu-item ${r.k===k?'on':''}" onclick="finStatSet('${o.key}','${k}')">${r.k===k?'✓ ':''}${l}</div>`).join('')}</div>` : ''}
    <b>${o.value}</b><span>${escapeHtml(o.label)} <em class="finstatp-l">${escapeHtml(r.label)}</em></span></div>`;
}
window.finStatSet = async function(key, k){
  finStatMenuOpen = null;
  if(k==='custom'){
    const cur = FIN_STAT_P[key] || {};
    const from = await customPrompt('From date (YYYY-MM-DD)', cur.from || finToday().slice(0,8)+'01'); if(from==null){ render(); return; }
    const to = await customPrompt('To date (YYYY-MM-DD)', cur.to || finToday()); if(to==null){ render(); return; }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(to.trim())){ toast('Use dates like '+finToday()); render(); return; }
    FIN_STAT_P[key] = {k, from:from.trim(), to:to.trim()};
  } else FIN_STAT_P[key] = {k};
  try{ localStorage.setItem('finStatP', JSON.stringify(FIN_STAT_P)); }catch(e){}
  render();
};
document.addEventListener('click', ()=>{ if(finStatMenuOpen){ finStatMenuOpen = null; render(); } });
(function(){
  const css = `.finstatp{position:relative;}
  .finstatp-dots{position:absolute;top:6px;right:8px;width:28px;height:24px;border:0;background:transparent;border-radius:7px;font-size:16px;line-height:1;color:var(--slate);cursor:pointer;padding:0;}
  .finstatp-dots:hover{background:rgba(0,0,0,.06);}
  .finstatp-menu{position:absolute;top:32px;right:6px;z-index:50;background:#fff;border:1px solid #E3E6EB;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.15);padding:4px 0;min-width:170px;}
  .finstatp-menu .statusmenu-item{padding:8px 14px;font-size:13px;white-space:nowrap;}
  .finstatp-menu .statusmenu-item.on{font-weight:800;}
  .finstatp-l{font-style:normal;opacity:.75;}
  .finstatp-l::before{content:'· ';}`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();
