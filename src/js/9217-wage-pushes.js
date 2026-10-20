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
      else if(e.status!=='withdrawn') await dbUpdate('wage_pushes', e.id, {status:'withdrawn', amount:0});
    }
  }catch(e){ console.error('wage push', e); }
}
const FIN_WP_LABEL = {pending:'With PM', price:'On price', general:'General costs', withdrawn:'Taken off'};
function finWagePushChip(p){
  if(!p) return '';
  const cls = {pending:'warn', price:'ok', general:'blue', withdrawn:'grey'}[p.status] || 'grey';
  return `<span class="finpill ${cls}" title="${escapeHtml(p.pm_note||'')}">${FIN_WP_LABEL[p.status]||p.status}${p.status==='price' && p.week_number ? ' · wk '+p.week_number : ''}</span>`;
}

/* ---------- PM side (Price tile) ---------- */
let pmWpOpen = true;
async function pmWagePushesHtml(siteId, elements){
  let rows = [];
  try{ rows = await dbSelect('wage_pushes', 'site_id=eq.'+siteId+'&status=eq.pending&order=week_start.asc'); }catch(e){ return ''; }
  if(!rows.length) return '';
  const els = (elements||[]).filter(e=>!e.closed);
  window.__pmWpEls = els;
  const total = rows.reduce((t,r)=>t+Number(r.amount||0),0);
  const wkDate = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short'});
  return `<div class="card pmwp">
    <div class="pmwp-head" onclick="pmWpOpen=!pmWpOpen;render()"><span><b>Wages to book</b> <span class="finpill warn">${rows.length}</span></span><span>${fmt2dp(total)} ${pmWpOpen?'▲':'▼'}</span></div>
    ${pmWpOpen ? `<p class="stub" style="margin:4px 0 8px;font-style:normal;">From the office timesheets. Book each one against a price (it goes into that tile’s labour wages for the week you choose) or to general costs.</p>
    ${rows.map(r=>`<div class="pmwp-row" id="pmwp-${r.id}">
      <div class="pmwp-who"><b>${escapeHtml(r.person_name||'Worker')}</b><span>w/c ${wkDate(r.week_start)} · ${Number(r.days||0)} day${Number(r.days)===1?'':'s'}${r.description?' · '+escapeHtml(r.description):''}</span></div>
      <div class="pmwp-amt">${fmt2dp(r.amount)}</div>
      <div class="pmwp-act">
        <select class="pmwp-el">${els.length ? els.map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('') : '<option value="">No price tiles yet</option>'}</select>
        <input class="pmwp-wk" type="number" min="1" step="1" placeholder="Week" title="Price week number">
        <button class="darkbtn" ${els.length?'':'disabled'} onclick="pmWagePushBook('${siteId}','${r.id}','price')">Book to price</button>
        <button class="ghostbtn" onclick="pmWagePushBook('${siteId}','${r.id}','general')">General costs</button>
      </div></div>`).join('')}` : ''}
  </div>`;
}
window.pmWagePushBook = async function(siteId, id, how){
  const box = document.getElementById('pmwp-'+id); if(!box) return;
  const p = (await dbSelect('wage_pushes', 'id=eq.'+id))[0]; if(!p || p.status!=='pending'){ render(); return; }
  const patch = {status:how, decided_by:ME.id, decided_at:new Date().toISOString()};
  if(how==='price'){
    const elId = box.querySelector('.pmwp-el').value; if(!elId){ toast('Add a price tile first.'); return; }
    let wk = Number(box.querySelector('.pmwp-wk').value);
    if(!wk){
      const last = await dbSelect('price_weeks', 'element_id=eq.'+elId+'&select=week_number&order=week_number.desc&limit=1');
      wk = last.length ? Number(last[0].week_number) : 1;
      if(!await customConfirm(`Book ${fmt2dp(p.amount)} for ${p.person_name} to week ${wk} of this price?`)) return;
    }
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
  toast(how==='price' ? 'Booked to the price' : 'Booked to general costs');
  render();
};
