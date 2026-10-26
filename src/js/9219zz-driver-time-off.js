/* ============================================================
   Drivers: book time off (26 Oct 2026, Andy: "add into the drivers home screen to book time off,
   then allow them to add dates either a single date or a range for time off. then block
   deliveries for this date on the app with a pop up saying driver has a scheduled day off").
   - Driver home: a "Book Time Off" tile → pick one day or a range, optional note, and see /
     remove the days already booked.
   - Booking a day that already has deliveries tells whoever booked those deliveries.
   - Deliveries: saving one on a day its driver is off (or, with no driver picked, a day every
     driver is off) stops with a pop-up. The database refuses it too (delivery_driver_off_check).
   ============================================================ */
function dtoFmt(d){ return new Date(d+'T12:00:00').toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short', year:'numeric'}); }
function dtoRange(t){ return t.start_date===t.end_date ? dtoFmt(t.start_date) : dtoFmt(t.start_date)+' – '+dtoFmt(t.end_date); }
function dtoDays(a, b){ return Math.round((new Date(b+'T12:00:00') - new Date(a+'T12:00:00'))/86400000) + 1; }
let dtoMode = 'single';

window.dtoOpen = async function(){
  let ov = document.getElementById('dtoOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'dtoOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display = 'none'; };
  const today = localISODate(new Date());
  const mine = await dbSelect('driver_time_off', 'user_id=eq.'+ME.id+'&end_date=gte.'+today+'&order=start_date.asc').catch(()=>[]);
  ov.innerHTML = `<div class="geo-modal-card dto-card">
    <h3 style="margin:0 0 4px;">🌴 Book Time Off</h3>
    <p class="stub" style="margin:0 0 14px;font-style:normal;">Deliveries can’t be booked for you on these days.</p>
    <div class="dto-seg"><button type="button" data-m="single" class="${dtoMode==='single'?'on':''}" onclick="dtoSetMode('single')">One day</button><button type="button" data-m="range" class="${dtoMode==='range'?'on':''}" onclick="dtoSetMode('range')">Several days</button></div>
    <div class="fingrid2 dto-dates">
      <div class="formfield"><label class="field-label" id="dtoFromL">${dtoMode==='range'?'From':'Date'}</label><input type="date" id="dtoFrom" min="${today}" value="${today}"></div>
      <div class="formfield" id="dtoToF" ${dtoMode==='range'?'':'hidden'}><label class="field-label">To</label><input type="date" id="dtoTo" min="${today}" value="${today}"></div>
    </div>
    <div class="formfield"><label class="field-label">Note (optional)</label><input type="text" id="dtoNote" maxlength="200" placeholder="e.g. Holiday, appointment"></div>
    <button type="button" class="darkbtn" id="dtoGo" style="width:100%;" onclick="dtoSave()">Book Time Off</button>
    <p class="sectiontitle" style="margin:16px 0 6px;">Your Booked Days Off</p>
    <div class="dto-list">${mine.length ? mine.map(t=>`<div class="dto-row"><div><b>${escapeHtml(dtoRange(t))}</b><span>${dtoDays(t.start_date, t.end_date)} day${dtoDays(t.start_date, t.end_date)===1?'':'s'}${t.note?' · '+escapeHtml(t.note):''}</span></div><button type="button" class="linkbtn" onclick="dtoRemove('${t.id}', this)">Remove</button></div>`).join('') : '<div class="empty" style="margin:0;">Nothing booked yet.</div>'}</div>
    <button type="button" class="geo-modal-cancel" onclick="document.getElementById('dtoOverlay').style.display='none'">Close</button>
  </div>`;
  ov.style.display = 'flex';
};
window.dtoSetMode = function(m){
  dtoMode = m;
  document.querySelectorAll('.dto-seg button').forEach(b=>b.classList.toggle('on', b.dataset.m===m));
  const tf = document.getElementById('dtoToF'); if(tf) tf.hidden = m!=='range';
  const l = document.getElementById('dtoFromL'); if(l) l.textContent = m==='range' ? 'From' : 'Date';
};
let dtoBusy = false;
window.dtoSave = async function(){
  if(dtoBusy) return;
  const from = finValSafe('dtoFrom'), to = dtoMode==='range' ? finValSafe('dtoTo') : from;
  if(!from){ toast('Pick the date.'); return; }
  if(!to || to < from){ toast('The “To” date must be on or after the “From” date.'); return; }
  if(from < localISODate(new Date())){ toast('Pick today or a later date.'); return; }
  dtoBusy = true; const btn = document.getElementById('dtoGo'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  try{
    const rows = await dbInsert('driver_time_off', {org_id:ME.org_id, user_id:ME.id, start_date:from, end_date:to, note:finValSafe('dtoNote')||null, created_by:ME.id});
    if(!rows) return;
    // Deliveries already booked for me on those days: tell whoever booked them.
    const clash = await dbSelect('delivery_tasks', 'org_id=eq.'+ME.org_id+'&driver_id=eq.'+ME.id+'&status=neq.completed&scheduled_date=gte.'+from+'&scheduled_date=lte.'+to+'&select=id,site_id,description,scheduled_date,created_by,manual_site_name').catch(()=>[]);
    for(const t of clash){
      if(t.created_by && t.created_by!==ME.id && typeof postSystemMessageToUser==='function'){
        await postSystemMessageToUser(t.created_by, t.site_id, 'message', `${ME.name} has booked a day off on ${dtoFmt(t.scheduled_date)}. Your delivery${t.description?' ('+t.description+')':''} that day needs moving to another day or driver.`, t.id).catch(()=>{});
      }
    }
    toast(clash.length ? `Booked. You had ${clash.length} deliver${clash.length===1?'y':'ies'} on those days — the office has been told.` : 'Time off booked');
    dtoOpen();
  } finally { dtoBusy = false; if(btn){ btn.disabled = false; btn.textContent = 'Book Time Off'; } }
};
window.dtoRemove = async function(id, btn){
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure = '1'; btn.textContent = 'Tap again to remove'; return; }
  if(await dbDelete('driver_time_off', id)){ toast('Removed'); dtoOpen(); }
};
function finValSafe(id){ const el = document.getElementById(id); return el ? String(el.value||'').trim() : ''; }

// Driver home: the tile
(function(){
  if(typeof renderDriverHome!=='function') return;
  const base = renderDriverHome;
  renderDriverHome = async function(){
    const r = await base.apply(this, arguments);
    try{
      const grid = document.querySelector('#app .tilegrid');
      if(grid && !document.getElementById('dtoTile')){
        const today = localISODate(new Date());
        const next = (await dbSelect('driver_time_off', 'user_id=eq.'+ME.id+'&end_date=gte.'+today+'&order=start_date.asc&limit=1').catch(()=>[]))[0];
        if(document.getElementById('dtoTile')) return r;
        const t = document.createElement('div'); t.className = 'tile'; t.id = 'dtoTile'; t.onclick = ()=>dtoOpen();
        t.innerHTML = `<div class="icon" style="background:#ECFDF3;color:#1E7A43;">🌴</div><div class="lbl">Book Time Off</div><div class="sub">${next ? 'Next: '+escapeHtml(next.start_date===next.end_date ? dtoFmt(next.start_date) : dtoFmt(next.start_date)+' →') : 'Days off and holidays'}</div>`;
        grid.appendChild(t);
      }
    }catch(e){ console.error(e); }
    return r;
  };
})();

/* ---------- Deliveries: stop a save on a driver's day off, with a pop-up ---------- */
async function dtoBlockFor(date, driverId){
  if(!date) return null;
  const off = await dbSelect('driver_time_off', 'org_id=eq.'+ME.org_id+'&start_date=lte.'+date+'&end_date=gte.'+date+'&select=user_id').catch(()=>null);
  if(!off || !off.length) return null;
  const offIds = new Set(off.map(o=>o.user_id));
  const who = id=>(PROFILES && PROFILES[id] && PROFILES[id].name) || 'The driver';
  if(driverId) return offIds.has(driverId) ? `${who(driverId)} has a scheduled day off on ${dtoFmt(date)}.` : null;
  if(typeof loadAllProfiles==='function') await loadAllProfiles().catch(()=>{});
  const drivers = Object.values(PROFILES||{}).filter(p=>p && p.role==='driver' && (!p.org_id || p.org_id===ME.org_id));
  if(drivers.length && drivers.every(p=>offIds.has(p.id))) return drivers.length===1 ? `${who(drivers[0].id)} (the driver) has a scheduled day off on ${dtoFmt(date)}.` : `Every driver has a scheduled day off on ${dtoFmt(date)}.`;
  return null;
}
async function dtoStop(msg){
  let ov = document.getElementById('dtoStopOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'dtoStopOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display = 'none'; };
  const one = msg.indexOf('Every')===0 || msg.indexOf('(the driver)')>0;
  ov.innerHTML = `<div class="geo-modal-card dto-stop"><div class="dto-stop-i">🌴</div><h3>Driver has a scheduled day off</h3><p>${escapeHtml(msg)}</p><p class="dto-stop-s">Pick another day${one ? '' : ', or another driver'}. This delivery hasn’t been saved.</p>
    <button type="button" class="darkbtn" style="width:100%;" onclick="document.getElementById('dtoStopOverlay').style.display='none'">OK</button></div>`;
  ov.style.display = 'flex';
}
(function(){
  const ins = dbInsert, upd = dbUpdate;
  dbInsert = async function(table, rowOrRows){
    if(table==='delivery_tasks'){
      const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      for(const r of rows){ if(r && r.scheduled_date && r.status!=='completed'){ const m = await dtoBlockFor(r.scheduled_date, r.driver_id||null); if(m){ await dtoStop(m); return null; } } }
    }
    return ins.apply(this, arguments);
  };
  dbUpdate = async function(table, id, patch){
    if(table==='delivery_tasks' && patch && ('scheduled_date' in patch || 'driver_id' in patch) && patch.status!=='completed'){
      try{
        let date = patch.scheduled_date, drv = 'driver_id' in patch ? patch.driver_id : undefined;
        if(!date || drv===undefined){
          const cur = (await dbSelect('delivery_tasks', 'id=eq.'+id+'&select=scheduled_date,driver_id,status'))[0] || {};
          if(cur.status==='completed') return upd.apply(this, arguments);
          if(!date) date = cur.scheduled_date; if(drv===undefined) drv = cur.driver_id;
          // Only a change of day or driver is checked — editing a delivery already on that day is fine.
          if(date===cur.scheduled_date && (drv||null)===(cur.driver_id||null)) return upd.apply(this, arguments);
        }
        const m = await dtoBlockFor(date, drv||null);
        if(m){ await dtoStop(m); return null; }
      }catch(e){ console.error(e); }
    }
    return upd.apply(this, arguments);
  };
  window.dbInsert = dbInsert; window.dbUpdate = dbUpdate;
})();

(function(){
  const st = document.createElement('style');
  st.textContent = `.dto-card{max-width:460px;text-align:left;}
.dto-seg{display:flex;background:#EEF0F3;border-radius:10px;padding:3px;gap:3px;margin-bottom:12px;}
.dto-seg button{all:unset;flex:1;text-align:center;padding:8px 0;border-radius:8px;font-weight:700;font-size:14px;color:var(--slate);cursor:pointer;}
.dto-seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(16,24,40,.08);}
.dto-list{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto;}
.dto-row{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--line,#ECEEF2);border-radius:10px;padding:8px 10px;}
.dto-stop{max-width:400px;text-align:center;} .dto-stop h3{margin:6px 0 8px;} .dto-stop p{margin:0 0 8px;font-size:15px;color:var(--ink);} .dto-stop .dto-stop-s{font-size:13.5px;color:var(--slate);margin-bottom:16px;} .dto-stop-i{font-size:34px;}
.dto-row b{display:block;font-size:14px;} .dto-row span{font-size:12.5px;color:var(--slate);}`;
  document.head.appendChild(st);
})();
