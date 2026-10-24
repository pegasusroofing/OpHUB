/* ============================================================
   Wages from Finance timesheets -> the PM's Price tile.
   Saving a timesheet in Finance sends each person's week on each project
   to that project's PMs (table wage_pushes). In the Price tile the PM
   books it either against a price (a Pricing Element / price sheet, as a
   labour wage for a week — the same as typing it in "Labour wages this
   week") or to general costs (not against any price). Finance sees what
   the PM decided on the timesheet and the project's labour list.
   ============================================================ */
// Finance side: called after a timesheet is saved (t = finTs, rows = fin_labour_manual rows written).
async function finWagePush(t, rows){
  try{
    const key = t.key, week = t.week;
    const isW = key.startsWith('w:'), isN = key.startsWith('n:');
    const who = isN ? key.slice(2) : finPersonName(key);
    const bySite = {};
    rows.forEach(r=>{ const b = bySite[r.site_id] = bySite[r.site_id] || {days:0, amount:0, desc:new Set()}; b.days += Number(r.days||0); b.amount += Number(r.amount||0); if(r.description) b.desc.add(r.description); });
    const existing = await dbSelect('wage_pushes', 'org_id=eq.'+ME.org_id+'&person_key=eq.'+encodeURIComponent(key)+'&week_start=eq.'+week);
    const exBy = {}; existing.forEach(e=>{ exBy[e.site_id] = e; });
    for(const siteId of Object.keys(bySite)){
      const b = bySite[siteId], amount = finRound(b.amount), days = finRound(b.days);
      const row = {org_id:ME.org_id, site_id:siteId, src_key:[key, week, siteId].join('|'), person_key:key, operative_id:(!isW && !isN) ? key : null, person_name:who, week_start:week, days, amount, description:Array.from(b.desc).join(', ')||null, status:'pending', created_by:ME.id};
      const ex = exBy[siteId];
      if(!ex){ await dbInsert('wage_pushes', row); continue; }
      if(Number(ex.amount)===amount && Number(ex.days)===days && ex.status!=='withdrawn') continue;
      const patch = {amount, days, description:row.description};
      if(ex.status==='withdrawn') patch.status = 'pending';
      await dbUpdate('wage_pushes', ex.id, patch);
      // Already booked against a price: keep the PM's wage line in step.
      if(ex.status==='price' && ex.price_entry_id) await sbFetch('/rest/v1/price_week_operative_entries?id=eq.'+ex.price_entry_id, {method:'PATCH', body:JSON.stringify({amount, updated_at:new Date().toISOString()})});
    }
    // Projects taken off the timesheet.
    for(const e of existing){
      if(bySite[e.site_id]) continue;
      if(e.status==='pending') await dbDelete('wage_pushes', e.id);
      else if(e.status!=='withdrawn') await finWagePushWithdraw(e);
    }
  }catch(e){ console.error('wage push', e); }
}
// Take a push off. If the PM had booked it against a price, zero that wage
// line too, so the price doesn't keep the wage (and re-booking later doesn't
// count it twice) — audit FA-17.
async function finWagePushWithdraw(e){
  const ok = await dbUpdate('wage_pushes', e.id, {status:'withdrawn', amount:0});
  if(ok && e.status==='price' && e.price_entry_id){
    try{
      await sbFetch('/rest/v1/price_week_operative_entries?id=eq.'+e.price_entry_id, {method:'PATCH', body:JSON.stringify({amount:0, updated_at:new Date().toISOString()})});
      if(e.element_id && e.week_number){
        const sh = await dbSelect('price_builder_sheets', 'pricing_element_id=eq.'+e.element_id+'&select=id&limit=1');
        if(!sh.length && typeof rollUpPriceWeekFromOperativeEntries==='function') await rollUpPriceWeekFromOperativeEntries(e.element_id, e.site_id, e.week_number);
      }
    }catch(err){ console.error('wage push withdraw', err); }
  }
  return ok;
}
const FIN_WP_LABEL = {pending:'With PM', price:'On price', general:'General costs', withdrawn:'Taken off'};
function finWagePushChip(p){
  if(!p) return '';
  const cls = {pending:'warn', price:'ok', general:'blue', withdrawn:'grey'}[p.status] || 'grey';
  return `<span class="finpill ${cls}" title="${escapeHtml(p.pm_note||'')}">${FIN_WP_LABEL[p.status]||p.status}${p.status==='price' && p.week_number ? ' · wk '+p.week_number : ''}</span>`;
}

/* ---------- PM side (Price tile) ---------- */
// Week choices for a price tile: its existing weeks (latest first, picked) and a new one.
function pmWpWeekOpts(elId, ws){
  const m = (window.__pmWpMax||{})[elId] || 0, st = window.__pmWpStart;
  const dt = n=>st ? ' · w/c '+new Date(finAddDays(st, (n-1)*7)+'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short'}) : '';
  let pick = m || 1;
  if(st && ws){ const n = Math.floor((new Date(finMonday(ws)+'T12:00:00') - new Date(st+'T12:00:00'))/(7*864e5)) + 1; if(n>=1) pick = n; }
  const top = Math.max(m+1, pick);
  const o = []; for(let w=top; w>=1; w--) o.push(`<option value="${w}" ${w===pick?'selected':''}>Week ${w}${dt(w)}${w===m?' (latest)':w>m?' (new)':''}</option>`);
  return o.join('');
}
let pmWpOpen = true;
async function pmWagePushesHtml(siteId, elements){
  let rows = [];
  try{ rows = await dbSelect('wage_pushes', 'site_id=eq.'+siteId+'&status=eq.pending&order=week_start.asc'); }catch(e){ return ''; }
  if(!rows.length) return '';
  const els = (elements||[]).filter(e=>!e.closed);
  window.__pmWpEls = els;
  const wks = els.length ? await dbSelect('price_weeks', 'site_id=eq.'+siteId+'&select=element_id,week_number') : [];
  const maxW = {}; wks.forEach(w=>{ maxW[w.element_id] = Math.max(maxW[w.element_id]||0, Number(w.week_number)||0); });
  window.__pmWpMax = maxW;
  const site = SITES.find(x=>x.id===siteId) || {};
  window.__pmWpStart = site.start_date ? finMonday(site.start_date) : null;
  const total = rows.reduce((t,r)=>t+Number(r.amount||0),0);
  const wkDate = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short'});
  return `<div class="card pmwp">
    <div class="pmwp-head" onclick="pmWpOpen=!pmWpOpen;render()"><span><b>Wages to book</b> <span class="finpill warn">${rows.length}</span></span><span>${fmt2dp(total)} ${pmWpOpen?'▲':'▼'}</span></div>
    ${pmWpOpen ? `<p class="stub" style="margin:4px 0 8px;font-style:normal;">From the office timesheets. Put each one against a price (it goes into that price’s labour wages for the week you choose), or to other job costs if it isn’t price work.</p>
    ${rows.map(r=>`<div class="pmwp-row" id="pmwp-${r.id}">
      <div class="pmwp-who"><b>${escapeHtml(r.person_name||'Worker')}</b><span>Work w/c ${wkDate(r.week_start)}${Number(r.days)?' · '+Number(r.days)+' day'+(Number(r.days)===1?'':'s'):''}${r.description?' · '+escapeHtml(r.description):''}</span></div>
      <div class="pmwp-amt">${fmt2dp(r.amount)}</div>
      <div class="pmwp-act">
        <select class="pmwp-el" onchange="this.nextElementSibling.innerHTML=pmWpWeekOpts(this.value,'${r.week_start||''}')">${els.length ? els.map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('') : '<option value="">No price tiles yet</option>'}</select>
        <select class="pmwp-wk" title="Which week of the price">${els.length ? pmWpWeekOpts(els[0].id, r.week_start) : ''}</select>
        <button class="darkbtn" ${els.length?'':'disabled'} onclick="pmWagePushBook('${siteId}','${r.id}','price')">Add to this price</button>
        <button class="ghostbtn" onclick="pmWagePushBook('${siteId}','${r.id}','general')">Other job costs</button>
      </div></div>`).join('')}` : ''}
  </div>`;
}
window.pmWagePushBook = async function(siteId, id, how){
  const box = document.getElementById('pmwp-'+id); if(!box) return;
  // One tap at a time — a second tap must not book the wage twice (audit FA-17).
  if(box.dataset.busy==='1') return;
  const btns = Array.from(box.querySelectorAll('button')).filter(x=>!x.disabled);
  box.dataset.busy = '1'; btns.forEach(x=>{ x.disabled = true; });
  try{ return await pmWagePushBookOnce(box, siteId, id, how); }
  finally{ if(document.body.contains(box)){ box.dataset.busy = ''; btns.forEach(x=>{ x.disabled = false; }); } }
};
async function pmWagePushBookOnce(box, siteId, id, how){
  const p = (await dbSelectNet('wage_pushes', 'id=eq.'+id))[0]; if(!p || p.status!=='pending'){ render(); return; }
  const patch = {status:how, decided_by:ME.id, decided_at:new Date().toISOString()};
  if(how==='price'){
    const elId = box.querySelector('.pmwp-el').value; if(!elId){ toast('Add a price tile first.'); return; }
    const wk = Number(box.querySelector('.pmwp-wk').value) || 1;
    const entry = {site_id:siteId, element_id:elId, week_number:wk, amount:Number(p.amount||0), entered_by:ME.id, updated_at:new Date().toISOString()};
    if(p.operative_id) Object.assign(entry, {operative_id:p.operative_id, kind:'extra_operative'}); else Object.assign(entry, {operative_id:null, kind:'cost', label:p.person_name||'Worker'});
    const res = await sbFetch('/rest/v1/price_week_operative_entries', {method:'POST', headers:{'Prefer':'return=representation'}, body:JSON.stringify(entry)});
    if(!res.ok){ toast('Not booked — '+(await safeErr(res))); return; }
    const made = (await res.json())[0];
    Object.assign(patch, {element_id:elId, week_number:wk, price_entry_id:made ? made.id : null});
    // Elements without a price sheet add their wage lines up into the week's booked-in figure.
    try{ const sh = await dbSelect('price_builder_sheets', 'pricing_element_id=eq.'+elId+'&select=id&limit=1'); if(!sh.length && typeof rollUpPriceWeekFromOperativeEntries==='function') await rollUpPriceWeekFromOperativeEntries(elId, siteId, wk); }catch(e){}
  }
  if(!(await dbUpdate('wage_pushes', id, patch))) return;
  toast(how==='price' ? 'Added to the price' : 'Added to other job costs');
  render();
}
