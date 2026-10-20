/* ============================================================
   OpHUB Finance — weekly timesheet grid (Andy, 21 Oct: "book one operative
   to multiple jobs… half a day Monday here, half a day Monday there").
   One person, one week, as many rows as needed: each row is a project
   (and plot), with days (or half days) under Mon–Sun. Saved as one
   fin_labour_manual row per project per day (days × day rate, or a price
   for price work spread over the row's days), grouped by sheet_id.
   Sign-in days for the week are shown so nothing is booked twice.
   ============================================================ */
const FIN_TS_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
let finTs = null; // {key, name, week, rate, rows:[{site_id, sub, d:[7], price, desc}], ids:[], signins:[]}
function finTsPeople(){
  const people = Object.values(PROFILES).filter(p=>['operative','site_manager','pm'].includes(p.role)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const workers = Object.values(FIN_WORKERS||{}).filter(w=>w.active!==false).sort((a,b)=>String(a.name||a.trading_name).localeCompare(String(b.name||b.trading_name)));
  return {people, workers};
}
function finTsBlankRow(siteId){ return {site_id:siteId||'', sub:'', d:[null,null,null,null,null,null,null], price:null, desc:''}; }
// The old one-entry form now opens the timesheet (project page "+ Add labour", week page "+ Add timesheet").
window.openFinManualLabour = function(siteId, date){ return openFinTimesheet(null, finMonday(date||finToday()), siteId||null); };
window.openFinTimesheet = async function(key, week, siteId){
  await loadAllProfiles();
  const rates = await finLoadRates();
  week = finMonday(week || finToday());
  finTs = {key:key||'', name:'', week, rate:null, rows:[], ids:[], signins:[], rates};
  if(siteId) finTs.rows.push(finTsBlankRow(siteId));
  if(key) await finTsLoad();
  if(!finTs.rows.length) finTs.rows.push(finTsBlankRow(siteId));
  await Promise.all(Array.from(new Set(finTs.rows.map(r=>r.site_id).filter(Boolean))).map(s=>finSubJobsLoad(s)));
  let ov = document.getElementById('finTsOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finTsOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.style.display = 'flex';
  finTsPaint();
};
// Everything already booked by hand for this person and week (any project) → rows.
async function finTsLoad(){
  const t = finTs, k = t.key, from = t.week, to = finAddDays(from, 6);
  const who = k.startsWith('w:') ? 'worker_id=eq.'+k.slice(2) : k.startsWith('n:') ? 'name=eq.'+encodeURIComponent(k.slice(2))+'&user_id=is.null&worker_id=is.null' : 'user_id=eq.'+k;
  const [man, cks] = await Promise.all([
    dbSelect('fin_labour_manual', 'org_id=eq.'+ME.org_id+'&'+who+'&work_date=gte.'+from+'&work_date=lte.'+to+'&order=work_date.asc'),
    (!k.startsWith('w:') && !k.startsWith('n:')) ? dbSelect('checkins', 'user_id=eq.'+k+'&type=eq.in&ts=gte.'+from+'T00:00:00&ts=lte.'+to+'T23:59:59&select=user_id,site_id,ts,type') : Promise.resolve([]),
  ]);
  if(k.startsWith('n:')) t.name = k.slice(2);
  const r = t.rates[k] || {};
  t.rate = r.day_rate!=null ? Number(r.day_rate) : null;
  t.ids = man.map(m=>m.id);
  t.signins = finLabourDaysFrom(cks);
  const rows = {};
  man.forEach(m=>{
    const rk = [m.site_id, m.sub_job_id||'', m.description||''].join('|');
    const row = rows[rk] = rows[rk] || Object.assign(finTsBlankRow(m.site_id), {sub:m.sub_job_id||'', desc:m.description||'', _amt:0, _days:0});
    const i = Math.round((new Date(m.work_date+'T12:00:00') - new Date(from+'T12:00:00'))/86400000);
    if(i>=0 && i<7) row.d[i] = finRound((row.d[i]||0) + Number(m.days||0)) || null;
    row._amt += Number(m.amount||0); row._days += Number(m.days||0);
    if(m.rate!=null && t.rate==null) t.rate = Number(m.rate);
  });
  // A row whose money isn't days × rate was price work: keep its price.
  Object.values(rows).forEach(row=>{ const calc = t.rate!=null ? finRound(row._days*t.rate) : null; if(calc===null || Math.abs(calc - row._amt) > 0.01) row.price = finRound(row._amt); delete row._amt; delete row._days; });
  t.rows = Object.values(rows);
  t.push = {};
  try{ (await dbSelect('wage_pushes', 'org_id=eq.'+ME.org_id+'&person_key=eq.'+encodeURIComponent(k)+'&week_start=eq.'+from)).forEach(p=>{ t.push[p.site_id] = p; }); }catch(e){}
}
function finTsRowDays(r){ return finRound(r.d.reduce((s,x)=>s+(Number(x)||0),0)); }
function finTsRowAmount(r){ if(r.price!=null && !isNaN(r.price)) return finRound(r.price); return finTs.rate!=null ? finRound(finTsRowDays(r)*finTs.rate) : 0; }
window.finTsPaint = function(){
  const ov = document.getElementById('finTsOverlay'); if(!ov || !finTs) return;
  const t = finTs, {people, workers} = finTsPeople();
  const jobs = SITES.filter(x=>finSiteStatus(x)!=='closed' || t.rows.some(r=>r.site_id===x.id)).sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
  const dates = FIN_TS_DAYS.map((_,i)=>finAddDays(t.week, i));
  const fmt = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric', month:'short'});
  const anySubs = t.rows.some(r=>(FIN_SUBJOBS[r.site_id]||[]).length);
  ov.innerHTML = `<div class="geo-modal-card finbuilder fints">
    <div class="finb-head"><div><h3 style="margin:0;">Timesheet</h3><p class="stub" style="margin:2px 0 0;font-style:normal;">One person, one week — add a row for each project they worked on. Use 0.5 for half a day.</p></div>
      <button type="button" class="finb-x" aria-label="Close" onclick="document.getElementById('finTsOverlay').style.display='none'">✕</button></div>
    <div class="fints-top">
      <label class="fints-who"><span>Who</span><select onchange="finTsWho(this.value)"><option value="">Choose…</option>
        ${workers.length ? `<optgroup label="Workers">${workers.map(w=>`<option value="w:${w.id}" ${t.key==='w:'+w.id?'selected':''}>${escapeHtml(w.name||w.trading_name||'Worker')}</option>`).join('')}</optgroup>` : ''}
        ${people.length ? `<optgroup label="App users">${people.map(p=>`<option value="${p.id}" ${t.key===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}</optgroup>` : ''}
        <option value="__name" ${t.key.startsWith('n:')?'selected':''}>Someone else (type a name)…</option></select></label>
      ${t.key.startsWith('n:') || t.key==='__name' ? `<label><span>Name</span><input type="text" value="${escapeHtml(t.name)}" oninput="finTs.name=this.value;finTs.key=this.value.trim()?'n:'+this.value.trim():'__name'"></label>` : ''}
      <label class="fints-week"><span>Week starting</span><span class="fints-wk"><button type="button" class="ghostbtn" onclick="finTsWeek(-7)">‹</button><b>${fmt(t.week)}</b><button type="button" class="ghostbtn" onclick="finTsWeek(7)">›</button></span></label>
      <label><span>Day rate</span><input type="text" inputmode="decimal" data-money value="${t.rate!=null?t.rate:''}" placeholder="£ per day" oninput="finTs.rate=finNum(this.value);finTsTotals()"></label>
    </div>
    ${t.signins.length ? `<div class="finnote" style="margin:0 0 10px;"><b style="display:inline;">Already counted from site sign-in:</b> ${t.signins.map(s=>{ const st = SITES.find(x=>x.id===s.site_id)||{}; return escapeHtml(FIN_TS_DAYS[(new Date(s.date+'T12:00:00').getDay()+6)%7]+' '+(st.job_number||st.name||'')); }).join(', ')} — don’t add these again here.</div>` : ''}
    <div class="fints-grid">
      <div class="fints-h"><span>Project</span>${anySubs?'<span>Plot</span>':''}${dates.map((d,i)=>`<span class="c">${FIN_TS_DAYS[i]}<em>${fmt(d)}</em></span>`).join('')}<span class="c">Days</span><span class="c">Price work £</span><span class="r">Cost</span><span></span></div>
      ${t.rows.map((r,i)=>{ const subs = FIN_SUBJOBS[r.site_id]||[]; return `<div class="fints-r ${anySubs?'subs':''}">
        <label class="fints-p"><span>Project</span><select onchange="finTsSite(${i}, this.value)"><option value="">Choose…</option>${jobs.map(j=>`<option value="${j.id}" ${r.site_id===j.id?'selected':''}>${escapeHtml((j.job_number?j.job_number+' · ':'')+j.name)}</option>`).join('')}</select>
          <input type="text" class="fints-desc" placeholder="What for (optional)" value="${escapeHtml(r.desc||'')}" oninput="finTs.rows[${i}].desc=this.value">${t.push && t.push[r.site_id] && typeof finWagePushChip==='function' ? `<span class="fints-pm">PM: ${finWagePushChip(t.push[r.site_id])}</span>` : ''}</label>
        ${anySubs ? `<label><span>Plot</span>${subs.length ? `<select onchange="finTs.rows[${i}].sub=this.value"><option value="">Whole project</option>${subs.map(a=>`<option value="${a.id}" ${r.sub===a.id?'selected':''}>${escapeHtml(a.short)}</option>`).join('')}</select>` : '<em class="stub">—</em>'}</label>` : ''}
        ${r.d.map((v,j)=>`<label class="c"><span>${FIN_TS_DAYS[j]}</span><input type="text" inputmode="decimal" class="fints-d" value="${v!=null&&v!==0?v:''}" placeholder="–" oninput="finTsDay(${i},${j},this.value)"></label>`).join('')}
        <b class="c" id="finTsD-${i}">${finTsRowDays(r)||'–'}</b>
        <label class="c"><span>Price work £</span><input type="text" inputmode="decimal" data-money value="${r.price!=null?r.price:''}" placeholder="—" oninput="finTsPrice(${i},this.value)"></label>
        <b class="r" id="finTsA-${i}">${finMoney(finTsRowAmount(r))}</b>
        ${t.rows.length>1 ? `<button type="button" class="linkbtn" aria-label="Remove row" onclick="finTs.rows.splice(${i},1);finTsPaint()">✕</button>` : '<span></span>'}
      </div>`; }).join('')}
      <div class="fints-f ${anySubs?'subs':''}"><span>Day totals</span>${anySubs?'<span></span>':''}${FIN_TS_DAYS.map((_,j)=>`<span class="c" id="finTsT-${j}"></span>`).join('')}<b class="c" id="finTsTD"></b><span></span><b class="r" id="finTsTA"></b><span></span></div>
    </div>
    <div class="finb-add"><button class="ghostbtn" onclick="finTsAddRow()">+ Add a project</button></div>
    <div class="fints-foot">
      <span id="finTsWarn" class="stub" style="margin:0;font-style:normal;"></span>
      <button class="darkbtn" onclick="saveFinTimesheet()">Save timesheet</button>
    </div>
  </div>`;
  finTsTotals();
};
window.finTsTotals = function(){
  const t = finTs; if(!t) return;
  let td = 0, ta = 0; const per = [0,0,0,0,0,0,0];
  t.rows.forEach((r,i)=>{ r.d.forEach((v,j)=>per[j] += Number(v)||0); const d = finTsRowDays(r), a = finTsRowAmount(r); td += d; ta += a;
    const de = document.getElementById('finTsD-'+i); if(de) de.textContent = d || '–'; const ae = document.getElementById('finTsA-'+i); if(ae) ae.textContent = finMoney(a); });
  // sign-in days count as a full day on that date
  t.signins.forEach(s=>{ const j = Math.round((new Date(s.date+'T12:00:00') - new Date(t.week+'T12:00:00'))/86400000); if(j>=0 && j<7) per[j] += 1; });
  per.forEach((v,j)=>{ const el = document.getElementById('finTsT-'+j); if(el){ el.textContent = v ? finRound(v) : ''; el.classList.toggle('over', v > 1.0001); } });
  const set = (id, v)=>{ const el = document.getElementById(id); if(el) el.textContent = v; };
  set('finTsTD', finRound(td) || '–'); set('finTsTA', finMoney(ta));
  const over = per.map((v,j)=>v>1.0001 ? FIN_TS_DAYS[j] : '').filter(Boolean);
  set('finTsWarn', t.rate==null && t.rows.some(r=>finTsRowDays(r) && r.price==null) ? 'Add their day rate (or a price-work £ on each row).' : over.length ? 'More than a full day on '+over.join(', ')+' — check that’s right.' : '');
};
window.finTsDay = function(i, j, v){ const n = finNum(v); finTs.rows[i].d[j] = (n===null || isNaN(n) || n===0) ? null : Math.max(0, Math.min(2, n)); finTsTotals(); };
window.finTsPrice = function(i, v){ const n = finNum(v); finTs.rows[i].price = (n===null || isNaN(n)) ? null : n; finTsTotals(); };
window.finTsSite = async function(i, siteId){ finTs.rows[i].site_id = siteId; finTs.rows[i].sub = ''; if(siteId) await finSubJobsLoad(siteId); finTsPaint(); };
window.finTsAddRow = function(){ finTs.rows.push(finTsBlankRow('')); finTsPaint(); };
window.finTsWho = async function(v){
  if(v==='__name'){ finTs.key = '__name'; finTs.name = ''; finTs.rows = finTs.rows.length ? finTs.rows : [finTsBlankRow('')]; finTs.ids = []; finTs.signins = []; finTs.rate = null; finTsPaint(); return; }
  const keepRows = finTs.rows.filter(r=>r.site_id && !finTsRowDays(r) && r.price==null); // a project picked from the project page
  finTs.key = v; finTs.name = '';
  if(v){ await finTsLoad(); if(!finTs.rows.length) finTs.rows = keepRows.length ? keepRows : [finTsBlankRow('')]; }
  await Promise.all(Array.from(new Set(finTs.rows.map(r=>r.site_id).filter(Boolean))).map(s=>finSubJobsLoad(s)));
  finTsPaint();
};
window.finTsWeek = async function(dd){
  finTs.week = finAddDays(finTs.week, dd);
  if(finTs.key && finTs.key!=='__name'){ const keep = finTs.rate; await finTsLoad(); if(finTs.rate==null) finTs.rate = keep; if(!finTs.rows.length) finTs.rows = [finTsBlankRow('')]; }
  finTsPaint();
};
window.saveFinTimesheet = async function(){
  const t = finTs; if(!t) return;
  if(!t.key || t.key==='__name'){ toast('Choose who the timesheet is for.'); return; }
  const used = t.rows.filter(r=>finTsRowDays(r) || (r.price!=null && r.price>0));
  if(used.some(r=>!r.site_id)){ toast('Choose the project on every row.'); return; }
  if(t.rate==null && used.some(r=>r.price==null)){ toast('Add their day rate, or a price-work £ on each row.'); return; }
  const isW = t.key.startsWith('w:'), isN = t.key.startsWith('n:');
  const sheet = crypto.randomUUID();
  const base = {org_id:ME.org_id, user_id:(!isW && !isN) ? t.key : null, worker_id:isW ? t.key.slice(2) : null, name:isN ? t.key.slice(2) : (isW ? finPersonName(t.key) : null), sheet_id:sheet, rate:t.rate, created_by:ME.id};
  const rows = [];
  used.forEach(r=>{
    const total = finTsRowDays(r), amt = finTsRowAmount(r);
    if(!total){ rows.push(Object.assign({}, base, {site_id:r.site_id, sub_job_id:r.sub||null, work_date:t.week, days:0, amount:finRound(amt), description:r.desc||'Price work'})); return; }
    let left = amt; const days = r.d.map((v,j)=>[j, Number(v)||0]).filter(x=>x[1]>0);
    days.forEach(([j, v], k)=>{ const a = k===days.length-1 ? finRound(left) : finRound(amt*v/total); left = finRound(left - a);
      rows.push(Object.assign({}, base, {site_id:r.site_id, sub_job_id:r.sub||null, work_date:finAddDays(t.week, j), days:v, amount:a, description:r.desc||null})); });
  });
  // Replace what was booked by hand for this person and week.
  for(const id of t.ids){ if(!(await dbDelete('fin_labour_manual', id))){ toast('Couldn’t update the old entries — try again.'); return; } }
  if(rows.length){ const res = await sbFetch('/rest/v1/fin_labour_manual', {method:'POST', body:JSON.stringify(rows)}); if(!res.ok){ toast('Save failed — '+(await safeErr(res))); t.ids = []; return; } }
  if(typeof finWagePush==='function') await finWagePush(t, rows);
  document.getElementById('finTsOverlay').style.display = 'none';
  toast(rows.length ? 'Timesheet saved — '+finRound(used.reduce((s,r)=>s+finTsRowDays(r),0))+' days on '+new Set(used.map(r=>r.site_id)).size+' project'+(new Set(used.map(r=>r.site_id)).size===1?'':'s') : 'Timesheet cleared');
  finTs = null; render();
};
