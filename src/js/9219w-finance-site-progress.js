/* ============================================================
   OpHUB Finance — site progress suggestions on an application (23 Oct 2026, Andy:
   "can that percentage complete suggest that percentage when doing an application?
   Just suggest, not auto fill").
   1. The "Site 40%" tag on a line can be tapped to use it for that line only.
   2. "Use site progress" lists what would change (Tiling 20% → 40%) before it does it.
   3. BoQ lines that aren't on the operatives' Schedule of Works say so.
   4. Variations pushed to the Schedule of Works suggest their site % too.
   Nothing changes unless you tap; you still Save the application as normal.
   ============================================================ */
// {fin_variation_id | variation_id: pct} from the Schedule of Works section each variation was pushed to.
async function finSiteVarProgress(siteId){
  const [fv, sv, tasks] = await Promise.all([
    dbSelect('fin_variations', 'site_id=eq.'+siteId+'&schedule_section_id=not.is.null&select=id,variation_id,schedule_section_id').catch(()=>[]),
    dbSelect('variations', 'site_id=eq.'+siteId+'&schedule_section_id=not.is.null&select=id,schedule_section_id').catch(()=>[]),
    dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&select=section_id,status,percent_complete&limit=5000').catch(()=>[]),
  ]);
  const bySec = {};
  tasks.forEach(t=>{ if(!t.section_id) return; const p = t.status==='done' ? 100 : Math.max(0, Math.min(100, Number(t.percent_complete||0))); (bySec[t.section_id] = bySec[t.section_id] || []).push(p); });
  const avg = id=>bySec[id] && bySec[id].length ? finRound(bySec[id].reduce((a,b)=>a+b,0)/bySec[id].length) : null;
  const out = {};
  fv.forEach(v=>{ const p = avg(v.schedule_section_id); if(p!=null){ out[v.id] = p; if(v.variation_id) out[v.variation_id] = p; } });
  sv.forEach(v=>{ const p = avg(v.schedule_section_id); if(p!=null && out[v.id]==null) out[v.id] = p; });
  return out;
}
function finVarSiteKey(v){ return v.fin_variation_id || v.variation_id || null; }

// 1 + 3: tags on the lines
(function(){
  const base = finAppPaintLines;
  finAppPaintLines = function(){
    const r = base.apply(this, arguments);
    if(!finApp || !finAppCtx) return r;
    const sp = finAppCtx.siteProgress || {}, any = Object.keys(sp).length > 0, locked = finAppCtx.locked;
    (finApp.lines||[]).forEach((l,i)=>{
      if(!finIsItem(l)) return;
      const cell = document.getElementById('fingAP-'+i); const row = cell && cell.closest('.fing-row'); if(!row) return;
      const name = row.querySelector('.fing-item'); if(!name) return;
      const tag = name.querySelector('.finsitepct');
      if(sp[l.item_id]!=null){
        if(tag && !locked && sp[l.item_id]!==finPct(l.pct)){
          tag.classList.add('finsp-use'); tag.title = 'Use the site figure for this line';
          tag.innerHTML = `Site ${sp[l.item_id]}% <b>Use</b>`;
          tag.onclick = e=>{ e.stopPropagation(); finSpUseLine(i); };
        }
      } else if(any && !name.querySelector('.finsp-none')){
        name.insertAdjacentHTML('beforeend', ' <span class="finsp-none" title="This line was never sent to the operatives’ Schedule of Works, so there is no site figure">Not on site schedule</span>');
      }
    });
    return r;
  };
})();
window.finSpUseLine = function(i){
  const l = finApp && finApp.lines[i]; const sp = finAppCtx && finAppCtx.siteProgress; if(!l || !sp || sp[l.item_id]==null) return;
  const was = finPct(l.pct); l.pct = finPct(sp[l.item_id]);
  finAppPaintLines(); finAppPaint();
  toast(`${l.description}: ${was}% → ${l.pct}% from site — check, then Save`);
};
// 2: preview before using site progress for every line that's behind
window.finAppUseSiteProgress = async function(){
  const sp = finAppCtx && finAppCtx.siteProgress; if(!sp) return;
  const ch = [];
  (finApp.lines||[]).forEach(l=>{ if(finIsItem(l) && sp[l.item_id]!=null && sp[l.item_id] > finPct(l.pct)) ch.push({l, from:finPct(l.pct), to:finPct(sp[l.item_id])}); });
  const vp = finAppCtx.varProgress || {};
  (finApp.variations||[]).forEach(v=>{ const k = finVarSiteKey(v); if(k && vp[k]!=null && vp[k] > finPct(v.pct)) ch.push({v, from:finPct(v.pct), to:finPct(vp[k])}); });
  if(!ch.length){ toast('Already matches site progress'); return; }
  const list = ch.slice(0, 25).map(c=>`• ${(c.l ? c.l.description : c.v.description)||'Line'}: ${c.from}% → ${c.to}%`).join('\n') + (ch.length > 25 ? `\n…and ${ch.length-25} more` : '');
  if(!await customConfirm(`Use site progress on ${ch.length} line${ch.length===1?'':'s'}?\n\n${list}\n\nLines where you've already put more than site are left alone. You can still change any of them before saving.`, {confirmLabel:'Use site progress'})) return;
  ch.forEach(c=>{ if(c.l) c.l.pct = c.to; else c.v.pct = c.to; });
  render();
  toast(ch.length+' line'+(ch.length===1?'':'s')+' updated from site progress — check, then Save');
};
// 4: variations — load their site % and put a tag by each one's % box
(function(){
  const base = renderFinApplication;
  renderFinApplication = async function(siteId, appId){
    const r = await base.apply(this, arguments);
    if(!finApp || !finAppCtx || finApp.id!==appId) return r;
    const vp = await finSiteVarProgress(siteId).catch(()=>({}));
    if(!finApp || finApp.id!==appId) return r;
    finAppCtx.varProgress = vp;
    if(!Object.keys(vp).length) return r;
    (finApp.variations||[]).forEach((v,i)=>{
      const k = finVarSiteKey(v); if(!k || vp[k]==null) return;
      const g = document.getElementById('finAppG-variations-'+i); const item = g && g.closest('.finitem'); if(!item) return;
      const d = item.querySelector('.finitem-d'); if(!d || d.querySelector('.finsitepct')) return;
      const diff = vp[k]!==finPct(v.pct), can = !finAppCtx.locked && diff;
      d.insertAdjacentHTML('beforeend', ` <span class="finsitepct ${vp[k] > finPct(v.pct)?'ahead':''} ${can?'finsp-use':''}" ${can?`onclick="event.stopPropagation();finSpUseVar(${i})" title="Use the site figure for this variation"`:''}>Site ${vp[k]}%${can?' <b>Use</b>':''}</span>`);
    });
    // the "site progress is ahead" note counts variations too
    const ahead = (finApp.variations||[]).filter(v=>{ const k = finVarSiteKey(v); return k && vp[k]!=null && vp[k] > finPct(v.pct); }).length;
    if(ahead && !finAppCtx.locked && !document.querySelector('button[onclick="finAppUseSiteProgress()"]')){
      const card = document.querySelector('.finappcard'); const lines = document.getElementById('finAppLines');
      if(card && lines) lines.insertAdjacentHTML('beforebegin', `<div class="finnote warn" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;"><span>Site progress is ahead on <b style="display:inline;">${ahead} variation${ahead===1?'':'s'}</b> (from the operatives’ Schedule of Works).</span><button class="ghostbtn" style="width:auto;margin:0;padding:7px 12px;" onclick="finAppUseSiteProgress()">Use site progress</button></div>`);
    }
    return r;
  };
})();
window.finSpUseVar = function(i){
  const v = finApp && finApp.variations[i]; const vp = finAppCtx && finAppCtx.varProgress; const k = v && finVarSiteKey(v); if(!v || !vp || vp[k]==null) return;
  const was = finPct(v.pct); v.pct = finPct(vp[k]);
  finAppSaveSoft().then(()=>{ render(); toast(`${v.description||'Variation'}: ${was}% → ${v.pct}% from site`); });
};
(function(){
  const st = document.createElement('style');
  st.textContent = `.finsitepct.finsp-use{cursor:pointer;border:1px solid currentColor;border-radius:8px;padding:1px 6px;margin-left:4px;white-space:nowrap;}
.finsitepct.finsp-use b{font-weight:800;margin-left:3px;text-decoration:underline;}
.finsitepct.finsp-use:hover{background:rgba(0,0,0,.05);}
.finsp-none{font-size:10.5px;font-weight:600;color:var(--slate);background:#F2F4F7;border-radius:6px;padding:1px 6px;margin-left:4px;white-space:nowrap;}`;
  document.head.appendChild(st);
})();
