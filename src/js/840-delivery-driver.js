/* ================= DELIVERY DRIVER ================= */
// A Delivery Driver is a simplified role: no site list, just two tiles —
// GPS check in/out (not geofenced, see doDriverCheckAction) and today's
// delivery schedule. Delivery tasks themselves are created by PMs (Phase 3
// of this build) — until then this view just shows "nothing scheduled",
// which is the correct empty state, not a bug.
// The slots are the driver's running order for the day — "1st drop",
// "2nd drop"… — not clock times. The keys are the original hourly ones
// ('7am'…'5pm') and are what's stored on every delivery, so existing
// deliveries, their order, the priority within a slot and the calendar
// entries all carry on exactly as before; only the wording changed.
const DELIVERY_TIME_SLOTS = [
  {key:'7am', label:'1st drop'},
  {key:'8am', label:'2nd drop'},
  {key:'9am', label:'3rd drop'},
  {key:'10am', label:'4th drop'},
  {key:'11am', label:'5th drop'},
  {key:'12pm', label:'6th drop'},
  {key:'1pm', label:'7th drop'},
  {key:'2pm', label:'8th drop'},
  {key:'3pm', label:'9th drop'},
  {key:'4pm', label:'10th drop'},
  {key:'5pm', label:'11th drop'},
];
let driverCheckinBusy = false, driverCheckinError = null;
// Admin Centre › Driver Check-In Log: every driver check-in and check-out
// for the last 14 / 30 / 90 days, newest day first, with the time, how long
// they were on duty, and a map link to where each one was recorded.
let driverCheckinLogDays = 14;
window.setDriverCheckinLogDays = function(n){ driverCheckinLogDays = n; render(); };
function driverCheckinLogHtml(rows, breaks){
  breaks = breaks || [];
  const dayKey = ts=>localISODate(new Date(ts));
  const timeOf = ts=>new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const mapLink = r=>(typeof r.lat==='number' && typeof r.lon==='number')
    ? ` · <a href="https://www.google.com/maps?q=${r.lat},${r.lon}" target="_blank" rel="noopener" class="viewlink" onclick="event.stopPropagation();">Map ↗</a>${r.accuracy_m ? ` <span class="stub">(±${r.accuracy_m}m)</span>` : ''}` : '';
  const days = [];
  rows.forEach(r=>{ const k = dayKey(r.ts); let d = days.find(x=>x.key===k); if(!d){ d = {key:k, rows:[]}; days.push(d); } d.rows.push(r); });
  return `
    <div class="card">
      <div class="filterrow" style="margin-bottom:10px;">
        ${[14,30,90].map(n=>`<div class="filterchip ${driverCheckinLogDays===n?'active':''}" onclick="setDriverCheckinLogDays(${n})">Last ${n} days</div>`).join('')}
      </div>
      ${days.length ? days.map(d=>{
        const byDriver = {};
        d.rows.forEach(r=>{ (byDriver[r.user_id]=byDriver[r.user_id]||[]).push(r); });
        return `
        <p class="field-label" style="margin:12px 0 6px;">${new Date(d.key+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'short',year:'numeric'})}</p>
        ${Object.keys(byDriver).map(uid=>{
          const list = byDriver[uid].slice().sort((a,b)=>new Date(a.ts)-new Date(b.ts));
          // Time on duty: each check-in paired with the next check-out that day.
          let mins = 0, openIn = null;
          list.forEach(r=>{ if(r.type==='in') openIn = r; else if(r.type==='out' && openIn){ mins += Math.max(0, Math.round((new Date(r.ts)-new Date(openIn.ts))/60000)); openIn = null; } });
          // Breaks that day come off the time on duty to give time worked.
          const myBreaks = breaks.filter(b=>b.user_id===uid && dayKey(b.started_at)===d.key);
          const tot = driverDayTotals(list, myBreaks, d.key);
          const dur = mins ? driverMinsLabel(Math.max(0, mins - Math.min(mins, tot.brk)))+' worked'+(tot.brk ? ' · '+driverMinsLabel(tot.brk)+' breaks' : '') : '';
          const stillIn = !!openIn && d.key===localISODate(new Date());
          return `
          <div class="sitecard" style="padding:8px 10px;display:block;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="name" style="flex:1;min-width:0;">🚐 ${escapeHtml((PROFILES[uid]||{}).name || 'Unknown driver')}</div>
              <span class="stub" style="white-space:nowrap;">${stillIn ? '<span style="color:var(--ok);font-weight:700;">On duty now</span>' : (openIn ? '<span style="color:var(--warn);font-weight:700;">No check-out</span>' : dur)}</span>
            </div>
            ${list.map(r=>({ts:r.ts, html:`${r.type==='in' ? '▶ Checked in' : '■ Checked out'} ${timeOf(r.ts)}${mapLink(r)}`}))
              .concat(myBreaks.map(b=>({ts:b.started_at, html:`☕ Break ${timeOf(b.started_at)} – ${b.ended_at ? timeOf(b.ended_at)+' ('+driverMinsLabel((new Date(b.ended_at)-new Date(b.started_at))/60000)+')' : '<span style="color:var(--warn);font-weight:700;">not ended</span>'}`})))
              .sort((x,y)=>new Date(x.ts)-new Date(y.ts)).map(e=>`<div class="addr" style="margin-top:3px;">${e.html}</div>`).join('')}
            ${stillIn && dur ? `<div class="addr" style="margin-top:3px;">${dur} earlier today</div>` : ''}
          </div>`;
        }).join('')}`;
      }).join('') : `<div class="empty" style="padding:10px;">No driver check-ins in the last ${driverCheckinLogDays} days.</div>`}
    </div>`;
}
let driverScheduleDateOffset = 0; // 0 = today, +1 = tomorrow, -1 = yesterday
let driverScheduleTab = 'todo'; // 'todo' | 'done' — which of the day's two tabs the driver is on
async function renderDriverHome(){
  const __gen = RENDER_GEN;
  const todayISO = localISODate(new Date());
  const [lastCheckin, todayTasks, openBreaks] = await Promise.all([
    dbSelect('driver_checkins', 'user_id=eq.'+ME.id+'&order=ts.desc&limit=1'),
    dbSelect('delivery_tasks', 'org_id=eq.'+ME.org_id+'&scheduled_date=eq.'+todayISO+'&order=time_slot.asc'),
    dbSelect('driver_breaks', 'user_id=eq.'+ME.id+'&ended_at=is.null&order=started_at.desc&limit=1'),
  ]);
  const onDuty = !!(lastCheckin[0] && lastCheckin[0].type==='in');
  const onBreak = onDuty && !!openBreaks[0];
  const myTasksToday = todayTasks.filter(t=>!t.driver_id || t.driver_id===ME.id);
  const pendingToday = myTasksToday.filter(t=>t.status!=='completed').length;
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid" style="grid-auto-rows:1fr;">
      <div class="tile" onclick="go('#/driver/checkin')">
        <div class="icon" style="background:${onDuty?'var(--ok-bg)':'#E7E9EE'};color:${onDuty?'var(--ok)':'var(--ink)'};">📍</div>
        <div class="lbl">Check In / Out</div><div class="sub">${onBreak?'On a break':(onDuty?'Currently checked in':'Not checked in')}</div>
      </div>
      <div class="tile" onclick="go('#/driver/schedule')">
        <div class="icon" style="background:var(--blue-bg);color:var(--blue);">📅</div>
        <div class="lbl">Today's Schedule</div><div class="sub">${pendingToday} ${pendingToday===1?'delivery':'deliveries'} today</div>
      </div>
      <div class="tile" onclick="go('#/driver/vehicle-checklist')">
        <div class="icon" style="background:var(--warn-bg);color:var(--warn);">🚐</div>
        <div class="lbl">Vehicle Checklist</div><div class="sub">Weekly inspection</div>
      </div>
    </div>
    <p class="stub" style="text-align:center;margin-top:22px;"><a href="#/account" onclick="event.preventDefault();go('#/account')" style="color:var(--blue);">Account &amp; Settings</a></p>
  `, {title:ME.name, subtitle:'Delivery Driver', tabs:false});
}
window.doDriverCheckAction = async function(type){
  if(driverCheckinBusy) return;
  driverCheckinError = null; driverCheckinBusy = true; render();
  // 2026-10-05: drivers no longer need location to check in or out — a
  // blocked or refused location permission was stopping them checking in at
  // all. Only the time is recorded. (To bring location back, restore the
  // getGeo() call here and send lat/lon/accuracy_m with the row.)
  // Checking out while a break is still running ends the break at the same moment.
  if(type==='out'){
    try{
      const open = await dbSelect('driver_breaks', 'user_id=eq.'+ME.id+'&ended_at=is.null&select=id');
      for(const b of open) await dbUpdate('driver_breaks', b.id, {ended_at: new Date().toISOString()});
    }catch(e){ /* the weekly summary also closes a break at check-out */ }
  }
  const rows = await dbInsert('driver_checkins', {org_id:ME.org_id, user_id:ME.id, type});
  driverCheckinBusy = false;
  if(rows){
    toast((type==='in'?'Checked in':'Checked out')+' · '+new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}));
    // Tell the office (push + email): PMs on check-in, the admin on
    // check-out. Best-effort and silent — it never affects the check-in.
    try{ sbFetch('/functions/v1/notify-driver-checkin', {method:'POST', timeoutMs:30000, body: JSON.stringify({type})}).catch(()=>{}); }catch(e){}
  }
  else { driverCheckinError = 'Could not save — check your connection and try again.'; }
  render();
};
// Breaks: a driver who is checked in can start a break and end it. Each
// break is its own row (driver_breaks: started_at / ended_at). Time worked =
// time checked in, less breaks — shown to the driver, in the office's
// Driver Check-In Log, and in the Friday 2pm weekly hours email.
window.doDriverBreak = async function(action){
  if(driverCheckinBusy) return;
  driverCheckinError = null; driverCheckinBusy = true; render();
  let ok = false;
  try{
    const open = await dbSelect('driver_breaks', 'user_id=eq.'+ME.id+'&ended_at=is.null&order=started_at.desc&select=id');
    if(action==='start'){
      if(open.length) ok = true; // already on a break
      else ok = !!(await dbInsert('driver_breaks', {org_id:ME.org_id, user_id:ME.id, started_at: new Date().toISOString()}));
    } else {
      ok = true;
      for(const b of open){ if(!(await dbUpdate('driver_breaks', b.id, {ended_at: new Date().toISOString()}))) ok = false; }
    }
  }catch(e){ ok = false; }
  driverCheckinBusy = false;
  if(ok) toast((action==='start'?'Break started':'Break ended')+' · '+new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}));
  else driverCheckinError = 'Could not save — check your connection and try again.';
  render();
};
function driverMinsLabel(mins){ mins = Math.max(0, Math.round(mins)); return Math.floor(mins/60)+'h '+String(mins%60).padStart(2,'0')+'m'; }
// Today's figures for one driver from their check-ins (oldest first) and breaks.
function driverDayTotals(checks, breaks, dayKey){
  const now = Date.now(), isToday = dayKey===localISODate(new Date());
  let duty = 0, openIn = null;
  checks.filter(c=>localISODate(new Date(c.ts))===dayKey).forEach(c=>{
    if(c.type==='in') openIn = new Date(c.ts).getTime();
    else if(c.type==='out' && openIn){ duty += (new Date(c.ts).getTime()-openIn)/60000; openIn = null; }
  });
  const stillIn = !!openIn && isToday;
  if(stillIn) duty += (now-openIn)/60000;
  let brk = 0, count = 0;
  breaks.filter(b=>localISODate(new Date(b.started_at))===dayKey).forEach(b=>{
    const st = new Date(b.started_at).getTime();
    const en = b.ended_at ? new Date(b.ended_at).getTime() : (isToday ? now : st);
    brk += Math.max(0, (en-st)/60000); count++;
  });
  duty = Math.round(duty); brk = Math.min(duty, Math.round(brk));
  return {duty, brk, worked: duty-brk, count, stillIn, noCheckout: !!openIn && !isToday};
}
async function renderDriverCheckin(){
  const __gen = RENDER_GEN;
  const since = new Date(); since.setDate(since.getDate()-7); since.setHours(0,0,0,0);
  const [history, breaks] = await Promise.all([
    dbSelect('driver_checkins', 'user_id=eq.'+ME.id+'&order=ts.desc&limit=40'),
    dbSelect('driver_breaks', 'user_id=eq.'+ME.id+'&started_at=gte.'+since.toISOString()+'&order=started_at.desc&limit=60'),
  ]);
  const last = history[0];
  const onDuty = !!(last && last.type==='in');
  const openBreak = onDuty ? breaks.find(b=>!b.ended_at) : null;
  const t = d=>new Date(d).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const dt = d=>new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const today = driverDayTotals(history.slice().reverse(), breaks, localISODate(new Date()));
  // One "Recent" list: check-ins and breaks together, newest first.
  const events = history.map(c=>({ts:c.ts, label:c.type==='in'?'Checked In':'Checked Out', sub:dt(c.ts)}))
    .concat(breaks.map(b=>({ts:b.started_at, label:'☕ Break', sub: dt(b.started_at)+' – '+(b.ended_at ? t(b.ended_at)+' · '+driverMinsLabel((new Date(b.ended_at)-new Date(b.started_at))/60000) : 'still on break')})))
    .sort((x,y)=>new Date(y.ts)-new Date(x.ts)).slice(0,30);
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="text-align:center;padding:24px 16px;">
      <p class="stub" style="margin:0 0 14px;">${openBreak ? `☕ On a break since ${t(openBreak.started_at)}` : (last ? `${onDuty?'Checked in':'Checked out'} ${dt(last.ts)}` : 'You are not currently checked in.')}</p>
      ${driverCheckinError ? `<p class="stub" style="color:var(--warn);margin:0 0 14px;">${escapeHtml(driverCheckinError)}</p>` : ''}
      ${onDuty ? `
      <button class="${openBreak?'darkbtn':'ghostbtn'}" style="width:100%;padding:16px;font-size:16px;margin:0 0 10px;" ${driverCheckinBusy?'disabled':''} onclick="doDriverBreak('${openBreak?'end':'start'}')">
        ${driverCheckinBusy ? 'Saving…' : openBreak ? '▶ End Break' : '☕ Start Break'}
      </button>` : ''}
      <button class="${openBreak?'ghostbtn':'darkbtn'}" style="width:100%;padding:16px;font-size:16px;margin:0;" ${driverCheckinBusy?'disabled':''} onclick="doDriverCheckAction('${onDuty?'out':'in'}')">
        ${driverCheckinBusy ? 'Saving…' : onDuty ? 'Check Out' : 'Check In'}
      </button>
      ${today.duty ? `<p class="stub" style="margin-top:12px;">Today: <b>${driverMinsLabel(today.worked)}</b> worked${today.brk ? ' · '+driverMinsLabel(today.brk)+' on breaks' : ''}</p>` : ''}
      <p class="stub" style="margin-top:10px;">The time of each check in/out and break is recorded for the office. Your location is not needed.</p>
    </div>
    <p class="sectiontitle" style="margin-top:20px;">Recent</p>
    ${events.length ? events.map(c=>`
      <div class="sitecard">
        <div class="info"><div class="name">${c.label}</div><div class="addr">${c.sub}</div></div>
      </div>
    `).join('') : `<div class="empty">No check-ins yet.</div>`}
  `, {title:'Check In / Out', back:'#/driver'});
}
// Two "nothing to pick up" choices sit alongside the yard / suppliers / a
// typed address: "No collection" (go straight to the job) and "Clear site"
// (the job is to clear the site). They are saved as the typed-address kind
// with these exact words, so phones on an older version of the app still
// show something sensible.
const DELIVERY_NO_COLLECTION = 'No collection';
const DELIVERY_CLEAR_SITE = 'Clear site';
function deliveryCollectionKind(t){
  if(t.collection_type==='manual'){
    const a = String(t.collection_address_manual||'').trim().toLowerCase();
    if(a===DELIVERY_NO_COLLECTION.toLowerCase()) return 'none';
    if(a===DELIVERY_CLEAR_SITE.toLowerCase()) return 'clear';
  }
  return t.collection_type;
}
// The one-line "where from" text shown on a delivery card.
function deliveryCollectionLine(t){
  const k = deliveryCollectionKind(t);
  if(k==='none') return '🚫 No collection';
  if(k==='clear') return '🧹 Clear site';
  return '📦 Collect from: '+deliveryCollectionLabel(t);
}
function deliveryCollectionLabel(t){
  if(t.collection_type==='yard') return 'YARD';
  if(t.collection_type==='supplier') return t._supplierName || 'Supplier';
  return t.collection_address_manual || 'Collection address';
}
// "Collections" summary at the top of the driver's day: one row per place
// things are being collected from (the yard, each supplier, each typed
// address). Tapping a row lists everything to pick up there, job by job, so
// the van can be loaded in one visit.
let driverCollectOpen = {};
window.toggleDriverCollect = function(key){ driverCollectOpen[key] = !driverCollectOpen[key]; render(); };
function deliveryCollectionPlaceKey(t){
  if(t.collection_type==='yard') return 'yard';
  if(t.collection_type==='supplier') return 'supplier:'+(t.supplier_id||'none');
  return 'manual:'+String(t.collection_address_manual||'').trim().toLowerCase();
}
function deliveryCollectionSummaryHtml(tasks){
  tasks = tasks.filter(t=>{ const k = deliveryCollectionKind(t); return k!=='none' && k!=='clear'; }); // nothing to pick up for these
  if(!tasks.length) return '';
  const slotOrder = {}; DELIVERY_TIME_SLOTS.forEach((sl,i)=>{ slotOrder[sl.key]=i; });
  const slotLabel = {}; DELIVERY_TIME_SLOTS.forEach(sl=>{ slotLabel[sl.key]=sl.label; });
  const places = [];
  tasks.forEach(t=>{
    const key = deliveryCollectionPlaceKey(t);
    let pl = places.find(x=>x.key===key);
    if(!pl){ pl = {key, label: deliveryCollectionLabel(t), tasks:[]}; places.push(pl); }
    pl.tasks.push(t);
  });
  // Yard first, then the rest alphabetically.
  places.sort((a,b)=> (a.key==='yard'?-1:b.key==='yard'?1:a.label.localeCompare(b.label)));
  places.forEach(pl=>pl.tasks.sort((a,b)=>((slotOrder[a.time_slot]??99)-(slotOrder[b.time_slot]??99)) || ((a.sub_priority==null?999:a.sub_priority)-(b.sub_priority==null?999:b.sub_priority))));
  return `
    <p class="sectiontitle" style="margin-top:0;">Collections — what to pick up where</p>
    ${places.map(pl=>{
      const open = !!driverCollectOpen[pl.key];
      const left = pl.tasks.filter(t=>t.status!=='completed').length;
      return `
      <p class="ddrow" style="margin-top:8px;" onclick="toggleDriverCollect('${jsAttr(pl.key)}')">
        <span class="arrow">${open?'▼':'▶'}</span> 📦 Collect from ${escapeHtml(pl.label)}
        <span class="stub" style="margin-left:auto;white-space:nowrap;">${pl.tasks.length} job${pl.tasks.length===1?'':'s'}${left<pl.tasks.length ? ' · '+left+' left' : ''}</span>
      </p>
      ${open ? `
      <div class="card" style="margin-top:0;">
        ${pl.tasks.map((t,i)=>`
          <div style="padding:8px 0;${i?'border-top:1px solid var(--line);':''}${t.status==='completed'?'opacity:.55;':''}">
            <p style="margin:0 0 3px;font-weight:700;">${t.high_priority?'<span style="color:var(--brand1);font-weight:800;">! </span>':''}${deliverySiteHeadingHtml(t)}</p>
            <p style="margin:0 0 3px;white-space:pre-wrap;overflow-wrap:break-word;">${escapeHtml(t.description||'')}</p>
            <p class="stub" style="margin:0;">${escapeHtml(slotLabel[t.time_slot]||t.time_slot||'')}${t.status==='completed'?' · ✓ Completed':''}</p>
          </div>`).join('')}
      </div>` : ''}`;
    }).join('')}
    <div style="height:6px;"></div>`;
}
// preview=true is the PM's "Driver view": the same screen the driver gets,
// for whichever driver is picked, but read-only (no photo / complete / push
// buttons) and with a back arrow to the PM's Delivery Schedule.
let driverPreviewId = null;
async function renderDriverSchedule(preview){
  const __gen = RENDER_GEN;
  const d = new Date(); d.setDate(d.getDate()+driverScheduleDateOffset);
  const dateISO = localISODate(d);
  const dateLabel = d.toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'short'});
  const [tasks, suppliers] = await Promise.all([
    dbSelect('delivery_tasks', 'org_id=eq.'+ME.org_id+'&scheduled_date=eq.'+dateISO+'&order=sub_priority.asc'),
    dbSelect('suppliers', 'org_id=eq.'+ME.org_id),
    loadAllProfiles(),
  ]);
  const supplierName = {}; suppliers.forEach(s=>{ supplierName[s.id]=s.name; });
  const previewDrivers = preview ? Object.values(PROFILES).filter(p=>p && p.role==='driver').sort((a,b)=>a.name.localeCompare(b.name)) : [];
  if(preview && (!driverPreviewId || !previewDrivers.some(p=>p.id===driverPreviewId))) driverPreviewId = previewDrivers.length ? previewDrivers[0].id : null;
  const viewAsId = preview ? driverPreviewId : ME.id;
  const myTasks = tasks.filter(t=>!t.driver_id || t.driver_id===viewAsId);
  // A driver can only see a site once a delivery to it exists, and the site
  // list is loaded at sign-in — so a delivery booked since then would show
  // as "Unknown site" with no address. Top the list up when that happens.
  if(myTasks.some(t=>t.site_id && !SITES.find(s=>s.id===t.site_id))){
    const fresh = await dbSelectChecked('sites', 'select=*&order=created_at.asc');
    if(fresh.ok){ SITES = fresh.data; saveBootSnapshot(); }
  }
  myTasks.forEach(t=>{ t._supplierName = supplierName[t.supplier_id]; });
  // Two tabs for the day: what's left to do, and what's been completed.
  // A delivery moves across the moment it is marked complete.
  const doneTasks = myTasks.filter(t=>t.status==='completed').sort((a,b)=>new Date(b.completed_at||0)-new Date(a.completed_at||0));
  const todoTasks = myTasks.filter(t=>t.status!=='completed');
  const showDone = driverScheduleTab==='done';
  const bySlot = {}; DELIVERY_TIME_SLOTS.forEach(s=>bySlot[s.key]=[]);
  (showDone ? doneTasks : todoTasks).forEach(t=>{ if(bySlot[t.time_slot]) bySlot[t.time_slot].push(t); });
  const shownSlots = showDone ? DELIVERY_TIME_SLOTS.filter(sl=>bySlot[sl.key].length) : DELIVERY_TIME_SLOTS;
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    ${preview ? `
    <style>.driverpreview .card button,.driverpreview .card label.ghostbtn,.driverpreview .card .row-gap,.driverpreview .taskphotodel{display:none!important;}</style>
    <div class="card" style="margin-bottom:12px;background:var(--blue-bg);">
      <p style="margin:0 0 4px;font-weight:700;">👁 Driver view</p>
      <p class="stub" style="margin:0;">${previewDrivers.length ? 'This is what the driver sees: their own deliveries plus any not yet given to a driver. View only.' : 'There are no drivers set up yet, so this shows only deliveries not given to a driver.'}</p>
      ${previewDrivers.length>1 ? `<select style="margin-top:8px;" onchange="driverPreviewId=this.value;render()">${previewDrivers.map(p=>`<option value="${p.id}" ${p.id===driverPreviewId?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}</select>` : (previewDrivers.length ? `<p class="stub" style="margin:6px 0 0;"><b>${escapeHtml(previewDrivers[0].name)}</b></p>` : '')}
    </div>` : ''}
    <div class="${preview?'driverpreview':''}">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
      <span class="homebtn" style="flex:none;" onclick="driverScheduleDateOffset--;render()">‹</span>
      <div style="flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:center;font-weight:700;font-size:15px;">${dateLabel}${driverScheduleDateOffset===0?' (Today)':''}</div>
      <span class="homebtn" style="flex:none;" onclick="driverScheduleDateOffset++;render()">›</span>
    </div>
    <div class="filterrow" style="margin-bottom:12px;">
      <div class="filterchip ${showDone?'':'active'}" style="flex:1;text-align:center;" onclick="driverScheduleTab='todo';render()">To do (${todoTasks.length})</div>
      <div class="filterchip ${showDone?'active':''}" style="flex:1;text-align:center;" onclick="driverScheduleTab='done';render()">✓ Completed (${doneTasks.length})</div>
    </div>
    ${showDone ? '' : deliveryCollectionSummaryHtml(todoTasks)}
    ${showDone && !doneTasks.length ? `<div class="empty">No completed deliveries ${driverScheduleDateOffset===0?'yet today':'on this day'}.</div>` : ''}
    ${!showDone && !todoTasks.length && doneTasks.length ? `<div class="card" style="text-align:center;margin-bottom:8px;"><p style="margin:0;font-weight:700;color:var(--ok);">✓ All done for ${driverScheduleDateOffset===0?'today':'this day'}</p><p class="stub" style="margin:4px 0 0;">${doneTasks.length} completed — see the Completed tab.</p></div>` : ''}
    ${shownSlots.map(slot=>`
      <p class="sectiontitle" style="margin-top:16px;">${slot.label}</p>
      ${bySlot[slot.key].length ? bySlot[slot.key].map(t=>`
        <div class="card" style="margin-bottom:8px;">
          ${t.high_priority ? `<p style="margin:0 0 6px;color:var(--brand1);font-weight:800;">! HIGH PRIORITY<br><span style="font-weight:500;font-size:12px;color:var(--slate);">This delivery needs to happen first — treat it as urgent.</span></p>` : ''}
          <p style="margin:0 0 4px;font-weight:700;">${deliverySiteHeadingHtml(t)}</p>
          <p class="stub" style="margin:0 0 4px;">${escapeHtml(t.description||'')}</p>
          <p class="stub" style="margin:0 0 4px;">${escapeHtml(deliveryCollectionLine(t))}</p>
          ${t.site_contact_id && PROFILES[t.site_contact_id] ? `<p class="stub" style="margin:0 0 4px;">👤 Site contact: ${escapeHtml(PROFILES[t.site_contact_id].name)}${PROFILES[t.site_contact_id].phone?' · '+escapeHtml(PROFILES[t.site_contact_id].phone):''}</p>` : ''}
          ${deliveryPhotoThumbsHtml(deliveryPhotos(t), 64)}
          ${myTasks.filter(x=>x.time_slot===slot.key).length>1 && t.sub_priority ? `<p class="stub" style="margin:4px 0;">Order within this drop: ${t.sub_priority}</p>` : ''}
          ${t.status==='completed' ? `
            <p class="stub" style="color:var(--ok);margin:8px 0 0;">✓ Completed ${new Date(t.completed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</p>
            <button class="ghostbtn" style="width:100%;margin-top:8px;" onclick="reopenDeliveryTask('${t.id}')">↩ Re-open delivery</button>
          ` : `
            ${deliveryCompletionPhotos(t).length ? `<p class="stub" style="margin:8px 0 0;">Completion photos (${deliveryCompletionPhotos(t).length})</p>${deliveryPhotoThumbsHtml(deliveryCompletionPhotos(t), 64, i=>`removeDeliveryCompletionPhoto('${t.id}',${i})`)}` : ''}
            <div class="row-gap" style="margin-top:8px;">
              <label class="ghostbtn" style="flex:1;display:block;text-align:center;cursor:pointer;${deliveryCompletionBusyId?'opacity:.6;pointer-events:none;':''}">
                ${deliveryCompletionBusyId===t.id ? 'Uploading…' : '📷 Take photo'}
                <input type="file" accept="image/*" capture="environment" style="display:none;" ${deliveryCompletionBusyId?'disabled':''} onchange="addDeliveryCompletionPhotos(this,'${t.id}')">
              </label>
              <label class="ghostbtn" style="flex:1;display:block;text-align:center;cursor:pointer;${deliveryCompletionBusyId?'opacity:.6;pointer-events:none;':''}">
                🖼 Choose photos
                <input type="file" accept="image/*" multiple style="display:none;" ${deliveryCompletionBusyId?'disabled':''} onchange="addDeliveryCompletionPhotos(this,'${t.id}')">
              </label>
            </div>
            <button class="darkbtn" style="width:100%;margin-top:8px;" ${deliveryCompletionBusyId || !deliveryCompletionPhotos(t).length ? 'disabled' : ''} onclick="markDeliveryComplete('${t.id}')">${deliveryCompletionPhotos(t).length ? '✓ Mark Complete' : '✓ Mark Complete (add a photo first)'}</button>
            <button class="ghostbtn" style="width:100%;margin-top:8px;" ${deliveryPushBusyId===t.id?'disabled':''} onclick="pushDeliveryToTomorrow('${t.id}')">${deliveryPushBusyId===t.id ? 'Moving…' : '⏭ Push to Next Working Day (2pm)'}</button>
          `}
        </div>
      `).join('') : `<div class="empty">Nothing in this drop.</div>`}
    `).join('')}
    </div>
  `, preview ? {title:'Driver View', back:'#/delivery', tabs:false} : {title:'Delivery Schedule', back:'#/driver'});
}
// Site name plus the full address and postcode for the driver's view — all
// inside the same bold heading. If the site's name is already just the
// start of its address, only the address is shown rather than repeating it.
function deliverySiteHeadingHtml(taskOrSiteId){
  const t = (taskOrSiteId && typeof taskOrSiteId==='object') ? taskOrSiteId : null;
  const siteId = t ? t.site_id : taskOrSiteId;
  // A job that isn't on the app: the name and address typed on the delivery.
  if(t && !siteId){
    const mName = (t.manual_site_name||'').trim(), mAddr = (t.manual_site_address||'').trim();
    if(!mName && !mAddr) return 'Unknown site';
    if(!mAddr || mAddr.toLowerCase().indexOf(mName.toLowerCase())===0 && mName) return escapeHtml(mAddr || mName);
    return (mName ? escapeHtml(mName)+'<br>' : '')+escapeHtml(mAddr);
  }
  const site = SITES.find(s=>s.id===siteId);
  if(!site) return 'Unknown site';
  const name = (site.name||'').trim();
  const addr = fullSiteAddress(site);
  if(!addr) return escapeHtml(name || 'Unknown site');
  if(!name || addr.toLowerCase().indexOf(name.toLowerCase())===0) return escapeHtml(addr);
  return escapeHtml(name)+'<br>'+escapeHtml(addr);
}
function deliverySiteLabel(taskOrSiteId){
  const t = (taskOrSiteId && typeof taskOrSiteId==='object') ? taskOrSiteId : null;
  const siteId = t ? t.site_id : taskOrSiteId;
  if(t && !siteId) return (t.manual_site_name||'').trim() || (t.manual_site_address||'').trim() || 'a site';
  const site = SITES.find(s=>s.id===siteId);
  return site ? site.name : 'a site';
}
// Full "name, address" on one line — for exports.
function deliverySiteFullLabel(t){
  if(t.site_id) return pdfSiteLabel(SITES.find(s=>s.id===t.site_id)) || 'Unknown site';
  return [(t.manual_site_name||'').trim(), (t.manual_site_address||'').trim()].filter(Boolean).join(', ') || 'Unknown site';
}
// "Push to Tomorrow" — for when a drop doesn't get done. Moves the delivery
// to the next working day's 2pm slot (the day after its own date, or after
// today if it was already overdue; Saturday/Sunday roll on to Monday), moves the linked Key Dates entry with it, and
// tells the PM who booked it. If that next day already has a first-drop
// high priority, the pushed one loses its flag so the day never ends up
// with two.
let deliveryPushBusyId = null;
window.pushDeliveryToTomorrow = async function(taskId){
  const rows = await dbSelect('delivery_tasks', 'id=eq.'+taskId);
  const t = rows[0];
  if(!t || t.status==='completed') { render(); return; }
  const todayISO = localISODate(new Date());
  const baseISO = t.scheduled_date > todayISO ? t.scheduled_date : todayISO;
  const next = new Date(baseISO+'T00:00:00'); next.setDate(next.getDate()+1);
  // Weekends are skipped — a Friday (or Saturday) push lands on Monday.
  while(next.getDay()===6 || next.getDay()===0) next.setDate(next.getDate()+1);
  const nextISO = localISODate(next);
  const nextLabel = next.toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'short'});
  if(!await customConfirm('Push this delivery to '+nextLabel+' at 2pm?', {confirmLabel:'Yes — push it', cancelLabel:'No'})) return;
  deliveryPushBusyId = taskId; render();
  let keepHigh = !!t.high_priority;
  if(keepHigh){
    const clash = await dbSelect('delivery_tasks', 'org_id=eq.'+ME.org_id+'&scheduled_date=eq.'+nextISO+'&high_priority=is.true&status=eq.pending&id=neq.'+taskId+'&select=id');
    if(clash.length) keepHigh = false;
  }
  const row = await dbUpdate('delivery_tasks', taskId, {scheduled_date: nextISO, time_slot:'2pm', sub_priority: 999, high_priority: keepHigh});
  deliveryPushBusyId = null;
  if(!row){ toast('Could not move it — try again.'); render(); return; }
  try{
    await resequenceSlot(t.scheduled_date, t.time_slot);
    await resequenceSlot(nextISO, '2pm');
    if(t.calendar_event_id) await dbUpdate('site_calendar_events', t.calendar_event_id, {event_date: nextISO, reminder_sent:false});
  }catch(e){ /* the move itself is saved — ordering/calendar tidy-up is best-effort */ }
  if(t.created_by && t.created_by!==ME.id){
    postSystemMessageToUser(t.created_by, t.site_id, 'message',
      `Delivery pushed to ${nextLabel}, 2pm by ${ME.name} — ${deliverySiteLabel(t)}: ${t.description||''}`+(t.high_priority && !keepHigh ? ' (high priority removed — that day already has one)' : ''),
      taskId);
  }
  toast('Moved to '+nextLabel+', 2pm');
  render();
};
// Re-open a completed delivery. Asks whether it goes back on its original
// date and time or on a new one, clears the completion (so a fresh photo is
// needed to complete it again), moves the linked Key Dates entry, and tells
// the driver and whoever booked it.
function askDeliveryReopen(t){
  return new Promise(resolve=>{
    let ov = document.getElementById('deliveryReopenOverlay');
    if(!ov){ ov = document.createElement('div'); ov.id = 'deliveryReopenOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
    const done = v=>{ ov.style.display = 'none'; ov.innerHTML = ''; resolve(v); };
    const slotLabel = k=>((DELIVERY_TIME_SLOTS.find(x=>x.key===k)||{}).label || k || '');
    const origLabel = new Date(t.scheduled_date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'})+', '+slotLabel(t.time_slot);
    const todayISO = localISODate(new Date());
    const isPast = t.scheduled_date < todayISO;
    ov.onclick = e=>{ if(e.target===ov) done(null); };
    ov.innerHTML = `
      <div class="geo-modal-card">
        <p class="stub" style="margin:0 0 14px;font-weight:700;color:var(--ink);">Re-open this delivery</p>
        <button class="darkbtn" id="drSame" style="width:100%;margin-bottom:6px;">Same date &amp; time<br><span style="font-weight:500;font-size:12px;">${escapeHtml(origLabel)}</span></button>
        ${isPast ? `<p class="stub" style="margin:0 0 10px;color:var(--warn);">That date has already passed.</p>` : ''}
        <p class="stub" style="margin:12px 0 6px;font-weight:600;color:var(--ink);">Or choose a new date</p>
        <div class="formfield" style="margin-top:0;"><input type="date" id="drDate" value="${isPast ? todayISO : t.scheduled_date}"></div>
        <div class="formfield"><select id="drSlot">${DELIVERY_TIME_SLOTS.map(x=>`<option value="${x.key}" ${x.key===t.time_slot?'selected':''}>${x.label}</option>`).join('')}</select></div>
        <button class="darkbtn" id="drNew" style="width:100%;margin-bottom:8px;">Re-open on this date</button>
        <button class="geo-modal-cancel" id="drCancel">Cancel</button>
      </div>`;
    ov.style.display = 'flex';
    ov.querySelector('#drSame').onclick = ()=>done({date:t.scheduled_date, slot:t.time_slot, same:true});
    ov.querySelector('#drCancel').onclick = ()=>done(null);
    ov.querySelector('#drNew').onclick = ()=>{
      const d = ov.querySelector('#drDate').value, sl = ov.querySelector('#drSlot').value;
      if(!d){ toast('Choose a date first.'); return; }
      done({date:d, slot:sl, same:(d===t.scheduled_date && sl===t.time_slot)});
    };
  });
}
let deliveryReopenBusy = false;
window.reopenDeliveryTask = async function(taskId){
  if(deliveryReopenBusy) return;
  const t = (await dbSelect('delivery_tasks', 'id=eq.'+taskId))[0];
  if(!t){ toast('Delivery not found.'); return; }
  if(t.status!=='completed'){ toast('This delivery is already open.'); render(); return; }
  const choice = await askDeliveryReopen(t);
  if(!choice) return;
  deliveryReopenBusy = true;
  try{
    // Only one first-drop high priority per day: if the day it's going back
    // onto already has one, this one comes back without the flag.
    let keepHigh = !!t.high_priority;
    if(keepHigh){
      const clash = await dbSelect('delivery_tasks', 'org_id=eq.'+ME.org_id+'&scheduled_date=eq.'+choice.date+'&high_priority=is.true&status=eq.pending&id=neq.'+taskId+'&select=id');
      if(clash.length) keepHigh = false;
    }
    const patch = {status:'pending', completed_at:null, completed_by:null, completion_photo_path:null, completion_photo_paths:[], high_priority:keepHigh};
    if(!choice.same){ patch.scheduled_date = choice.date; patch.time_slot = choice.slot; patch.sub_priority = 999; }
    const row = await dbUpdate('delivery_tasks', taskId, patch);
    if(!row){ toast('Could not re-open it — try again.'); return; }
    if(!choice.same){
      try{
        await resequenceSlot(t.scheduled_date, t.time_slot);
        await resequenceSlot(choice.date, choice.slot);
        if(t.calendar_event_id) await dbUpdate('site_calendar_events', t.calendar_event_id, {event_date: choice.date, reminder_sent:false});
      }catch(e){ /* the re-open itself is saved — ordering/calendar tidy-up is best-effort */ }
    }
    const slotLabel = (DELIVERY_TIME_SLOTS.find(x=>x.key===choice.slot)||{}).label || choice.slot;
    const whenLabel = new Date(choice.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'short'})+', '+slotLabel;
    const body = `Delivery re-opened by ${ME.name} for ${whenLabel} — ${deliverySiteLabel(t)}: ${t.description||''}`+(t.high_priority && !keepHigh ? ' (high priority removed — that day already has one)' : '');
    const tell = new Set([t.driver_id, t.created_by].filter(id=>id && id!==ME.id));
    tell.forEach(id=>{ try{ postSystemMessageToUser(id, t.site_id, 'message', body, taskId); }catch(e){} });
    toast('Re-opened for '+whenLabel);
    if(typeof deliveryFormDraft !== 'undefined') deliveryFormDraft = null;
  }finally{
    deliveryReopenBusy = false;
    render();
  }
};
// A delivery can carry several photos: the ones added when it's booked
// (photo_paths) and the ones taken on completion (completion_photo_paths).
// The older single-photo columns are still filled with the first photo so
// phones on an older version of the app keep working.
function deliveryPhotos(t){
  const many = Array.isArray(t.photo_paths) ? t.photo_paths.filter(Boolean) : [];
  return many.length ? many : (t.photo_path ? [t.photo_path] : []);
}
function deliveryCompletionPhotos(t){
  const many = Array.isArray(t.completion_photo_paths) ? t.completion_photo_paths.filter(Boolean) : [];
  return many.length ? many : (t.completion_photo_path ? [t.completion_photo_path] : []);
}
function deliveryPhotoThumbsHtml(paths, size, removeFn){
  if(!paths.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0;">${paths.map((p,i)=>{
    const url = publicUrl('site-photos', p);
    return `<div style="position:relative;width:${size}px;height:${size}px;flex:0 0 ${size}px;">
      <img src="${url}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:8px;cursor:pointer;display:block;" onclick="viewImage('${url}')" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';">
      ${removeFn ? `<div class="taskphotodel" title="Remove photo" onclick="event.stopPropagation();${removeFn(i)}">×</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}
// Driver adds one or more completion photos (they save as they upload, so a
// dropped signal doesn't lose them), then taps Mark Complete.
window.addDeliveryCompletionPhotos = async function(input, taskId){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length || deliveryCompletionBusyId) return;
  deliveryCompletionBusyId = taskId; render();
  const added = []; let failed = 0;
  for(const file of files){
    try{
      const dataUrl = await compressImage(file);
      const path = await uploadDataUrl('site-photos', ME.org_id+'/delivery/'+taskId+'/'+crypto.randomUUID()+'.jpg', dataUrl);
      if(path) added.push(path); else failed++;
    }catch(e){ failed++; }
  }
  if(added.length){
    const t = (await dbSelect('delivery_tasks', 'id=eq.'+taskId+'&select=completion_photo_paths,completion_photo_path'))[0] || {};
    const all = deliveryCompletionPhotos(t).concat(added);
    const row = await dbUpdate('delivery_tasks', taskId, {completion_photo_paths: all, completion_photo_path: all[0]});
    if(!row){ failed += added.length; }
  }
  deliveryCompletionBusyId = null;
  if(failed) toast(failed+' photo'+(failed===1?'':'s')+' could not be uploaded — check your connection and try again.');
  else toast(added.length===1 ? 'Photo added' : added.length+' photos added');
  render();
};
window.removeDeliveryCompletionPhoto = async function(taskId, index){
  const t = (await dbSelect('delivery_tasks', 'id=eq.'+taskId+'&select=status,completion_photo_paths,completion_photo_path'))[0];
  if(!t || t.status==='completed') { render(); return; }
  const all = deliveryCompletionPhotos(t); all.splice(index, 1);
  await dbUpdate('delivery_tasks', taskId, {completion_photo_paths: all, completion_photo_path: all[0] || null});
  render();
};
window.markDeliveryComplete = async function(taskId){
  if(deliveryCompletionBusyId) return;
  const t = (await dbSelect('delivery_tasks', 'id=eq.'+taskId+'&select=status,completion_photo_paths,completion_photo_path'))[0];
  if(!t){ toast('Delivery not found.'); render(); return; }
  if(t.status==='completed'){ render(); return; }
  const photos = deliveryCompletionPhotos(t);
  if(!photos.length){ toast('Add at least one photo before marking this complete.'); return; }
  deliveryCompletionBusyId = taskId; render();
  const row = await dbUpdate('delivery_tasks', taskId, {status:'completed', completed_at:new Date().toISOString(), completed_by:ME.id, completion_photo_paths:photos, completion_photo_path:photos[0]});
  deliveryCompletionBusyId = null;
  if(row){ toast('Delivery marked complete'); notifyDeliveryComplete(taskId).catch(()=>{}); }
  else { toast('Could not save — try again.'); }
  render();
};
let deliveryCompletionBusyId = null;
window.completeDeliveryTask = async function(input, taskId){
  const file = input.files && input.files[0];
  if(!file) return;
  deliveryCompletionBusyId = taskId; render();
  let photoPath = null;
  try{
    const dataUrl = await compressImage(file);
    photoPath = await uploadDataUrl('site-photos', ME.org_id+'/delivery/'+taskId+'/'+crypto.randomUUID()+'.jpg', dataUrl);
  }catch(e){ photoPath = null; }
  if(!photoPath){
    deliveryCompletionBusyId = null;
    toast('Photo upload failed — check your connection and try again.');
    render();
    return;
  }
  const row = await dbUpdate('delivery_tasks', taskId, {status:'completed', completed_at:new Date().toISOString(), completed_by:ME.id, completion_photo_path:photoPath});
  deliveryCompletionBusyId = null;
  if(row){ toast('Delivery marked complete'); notifyDeliveryComplete(taskId).catch(()=>{}); }
  else { toast('Could not save — try again.'); }
  render();
};
// Site contact push notification on completion — the assigned site contact
// gets told with the completion photo, date and time, via the targeted
// (single-recipient) push added in Phase 5. Silently does nothing if the
// task has no site contact set, or the site contact has no phone/whatever
// — it's a best-effort notification, never something that should block the
// driver's "mark complete" action.
async function notifyDeliveryComplete(taskId){
  const rows = await dbSelect('delivery_tasks', 'id=eq.'+taskId);
  const t = rows[0];
  if(!t) return;
  const site = SITES.find(s=>s.id===t.site_id);
  const when = t.completed_at ? new Date(t.completed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
  const body = `Delivery to ${site ? site.name : (t.site_id ? 'your site' : deliverySiteLabel(t))} completed by ${ME.name}${when?' at '+when:''}.${deliveryCompletionPhotos(t).length>1 ? ' '+deliveryCompletionPhotos(t).length+' photos attached.' : (deliveryCompletionPhotos(t).length ? ' Photo attached.' : '')}`;
  // Who hears about it: the job's PM and the site contact only
  // (not every operative on the job). The database works the list out (a driver can't read site
  // assignments); if that fails we still tell the site contact and the PM.
  let ids = [];
  try{
    const res = await sbFetch('/rest/v1/rpc/delivery_notify_recipients', {method:'POST', body: JSON.stringify({p_task_id: taskId})});
    if(res.ok){ const out = await res.json(); if(Array.isArray(out)) ids = out.map(r=> (r && typeof r==='object') ? (r.delivery_notify_recipients||r.id) : r); }
  }catch(e){ /* fall back below */ }
  if(!ids.length) ids = [t.site_contact_id, site && site.responsible_pm_id];
  ids = [...new Set(ids.filter(id=>id && id!==ME.id))];
  await Promise.all(ids.map(id=>postSystemMessageToUser(id, t.site_id, 'delivery_complete', body, taskId)));
}
// Weekly vehicle inspection — a fixed pass/fail checklist (researched from
// the standard DVSA/GOV.UK van daily-walkaround-check items, grouped into
// categories) rather than the general-purpose report_templates builder,
// since it isn't site-scoped and needs a fixed, always-the-same-every-week
// structure. Every item is mandatory pass/fail; any item marked Fail
// requires a photo + note before the checklist can be submitted, and a
// submission with any fail posts a message to managers so it gets seen.
const VEHICLE_CHECKLIST_ITEMS = [
  {key:'windscreen', cat:'Cab / Interior', label:'Windscreen is undamaged and the view is unobscured'},
  {key:'mirrors', cat:'Cab / Interior', label:'Mirrors are present, secure and unbroken'},
  {key:'wipers', cat:'Cab / Interior', label:'Washers and wipers work properly'},
  {key:'warning_lights', cat:'Cab / Interior', label:'No dashboard warning lights stay on after starting'},
  {key:'steering', cat:'Cab / Interior', label:'Steering moves freely, no excessive play or jamming'},
  {key:'horn', cat:'Cab / Interior', label:'Horn works'},
  {key:'footbrake', cat:'Cab / Interior', label:'Footbrake is firm, no excessive travel'},
  {key:'handbrake', cat:'Cab / Interior', label:'Handbrake holds the vehicle securely'},
  {key:'seats_belts', cat:'Cab / Interior', label:'Seats are secure and seatbelts are undamaged, latch and retract properly'},
  {key:'lights', cat:'Exterior', label:'All lights and indicators work, lenses clean and correct colour'},
  {key:'plates', cat:'Exterior', label:'Number plates are secure, clean and legible'},
  {key:'bodywork', cat:'Exterior', label:'Bodywork and doors undamaged, no sharp edges, doors shut and lock securely'},
  {key:'exhaust', cat:'Exterior', label:'No exhaust leaks, excessive smoke or noise'},
  {key:'battery', cat:'Battery', label:'Battery is secure, in good condition and not leaking'},
  {key:'tyre_tread', cat:'Tyres & Wheels', label:'Legal tread depth on all tyres'},
  {key:'tyre_pressure', cat:'Tyres & Wheels', label:'Tyre pressures correct'},
  {key:'tyre_damage', cat:'Tyres & Wheels', label:'No cuts, bulges or sidewall damage, no wire/cord visible'},
  {key:'wheels', cat:'Tyres & Wheels', label:'Wheels and wheel nuts secure, undamaged'},
  {key:'load_area', cat:'Load Securing', label:'Load area / racking secure, nothing loose'},
  {key:'rear_doors', cat:'Load Securing', label:'Rear doors / tailgate lock properly'},
];
let vehicleChecklistDraft = null; // {id, vehicle_reg, week_start, items:{key:{result,note,photo_path}}, status}
let vehicleChecklistBusy = false;
let vehicleChecklistPhotoBusyKey = null;
function vehicleChecklistWeekStart(){ return localISODate(new Date(startOfWeek(new Date()))); } // startOfWeek returns a timestamp, not a Date
// Four photos of the vehicle that must be taken before a checklist can be
// submitted. Stored alongside the answers under their own keys, so they
// never count as a Pass/Fail item.
const VEHICLE_CHECKLIST_PHOTOS = [
  {key:'photo_front', label:'Front'},
  {key:'photo_back', label:'Back'},
  {key:'photo_left', label:'Left hand side'},
  {key:'photo_right', label:'Right hand side'},
];
function vehiclePhotosHtml(itemsMap, editable){
  return `
    <p class="sectiontitle" style="margin-top:16px;">Vehicle photos${editable ? ' (all 4 required)' : ''}</p>
    <div class="card" style="margin-bottom:8px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${VEHICLE_CHECKLIST_PHOTOS.map((ph,i)=>{
          const path = (itemsMap[ph.key]||{}).photo_path;
          const url = path ? publicUrl('site-photos', path) : null;
          const busy = vehicleChecklistPhotoBusyKey===ph.key;
          return `
          <div style="min-width:0;">
            <p style="margin:0 0 6px;font-weight:700;font-size:13px;">${i+1}. ${ph.label}</p>
            ${url ? `<img src="${url}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;cursor:pointer;display:block;" onclick="viewImage('${url}')" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';">`
                  : `<div style="width:100%;aspect-ratio:4/3;border:1.5px dashed var(--line);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--slate);font-size:12px;">${editable ? 'No photo yet' : 'Not taken'}</div>`}
            ${editable ? `
            <label class="ghostbtn" style="display:block;text-align:center;margin-top:6px;cursor:pointer;">
              ${busy ? 'Uploading…' : (url ? '📷 Retake' : '📷 Take photo')}
              <input type="file" accept="image/*" capture="environment" style="display:none;" ${busy?'disabled':''} onchange="uploadVehicleChecklistPhoto(this,'${ph.key}')">
            </label>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}
async function loadOrStartVehicleChecklist(){
  const weekStart = vehicleChecklistWeekStart();
  const rows = await dbSelect('vehicle_checklists', 'driver_id=eq.'+ME.id+'&week_start=eq.'+weekStart+'&order=created_at.asc&limit=1');
  if(rows[0]){
    const itemsMap = {};
    (rows[0].items||[]).forEach(it=>{ itemsMap[it.key] = it; });
    vehicleChecklistDraft = {id:rows[0].id, vehicle_reg:rows[0].vehicle_reg||'', week_start:weekStart, items:itemsMap, status:rows[0].status};
  } else {
    vehicleChecklistDraft = {id:null, vehicle_reg:'', week_start:weekStart, items:{}, status:'in_progress'};
  }
}
async function renderDriverVehicleChecklist(){
  const __gen = RENDER_GEN;
  if(!vehicleChecklistDraft || vehicleChecklistDraft.week_start !== vehicleChecklistWeekStart()){
    await loadOrStartVehicleChecklist();
  }
  const history = await dbSelect('vehicle_checklists', 'driver_id=eq.'+ME.id+'&status=eq.submitted&order=week_start.desc&limit=8');
  if(__gen !== RENDER_GEN) return;
  const d = vehicleChecklistDraft;
  const submitted = d.status==='submitted';
  const cats = [...new Set(VEHICLE_CHECKLIST_ITEMS.map(i=>i.cat))];
  const answeredCount = VEHICLE_CHECKLIST_ITEMS.filter(i=>d.items[i.key] && d.items[i.key].result).length;
  const weekLabel = new Date(d.week_start+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="margin-bottom:14px;">
      <p style="margin:0 0 4px;font-weight:700;">Week commencing ${weekLabel}</p>
      ${submitted ? `<p class="stub" style="color:var(--ok);margin:0;">✓ Submitted</p>` : `<p class="stub" style="margin:0;">${answeredCount} of ${VEHICLE_CHECKLIST_ITEMS.length} checked</p>`}
      <label style="display:block;margin-top:10px;">Vehicle registration
        <input type="text" value="${jsAttr(d.vehicle_reg)}" ${submitted?'disabled':''} placeholder="e.g. AB12 CDE" oninput="vehicleChecklistDraft.vehicle_reg=this.value" onblur="saveVehicleChecklistDraft()">
      </label>
    </div>
    ${vehiclePhotosHtml(d.items, !submitted)}
    ${cats.map(cat=>`
      <p class="sectiontitle" style="margin-top:16px;">${escapeHtml(cat)}</p>
      ${VEHICLE_CHECKLIST_ITEMS.filter(i=>i.cat===cat).map(item=>{
        const ans = d.items[item.key] || {};
        return `
        <div class="card" style="margin-bottom:8px;">
          <p style="margin:0 0 8px;">${escapeHtml(item.label)}</p>
          <div class="row" style="gap:8px;">
            <button class="ghostbtn" style="flex:1;${ans.result==='pass'?'background:var(--ok-bg);color:var(--ok);border-color:var(--ok);':''}" ${submitted?'disabled':''} onclick="setVehicleChecklistResult('${item.key}','pass')">✓ Pass</button>
            <button class="ghostbtn" style="flex:1;${ans.result==='fail'?'background:var(--warn-bg);color:var(--warn);border-color:var(--warn);':''}" ${submitted?'disabled':''} onclick="setVehicleChecklistResult('${item.key}','fail')">✕ Fail</button>
          </div>
          ${ans.result==='fail' ? `
            <div style="margin-top:8px;">
              <textarea rows="2" style="width:100%;font-family:inherit;font-size:13px;padding:10px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;" placeholder="What's wrong? (required)" ${submitted?'disabled':''} oninput="vehicleChecklistDraft.items['${item.key}'].note=this.value" onblur="saveVehicleChecklistDraft()">${escapeHtml(ans.note||'')}</textarea>
              ${ans.photo_path ? `<img src="${publicUrl('site-photos', ans.photo_path)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;margin-top:6px;cursor:pointer;" onclick="viewImage('${publicUrl('site-photos', ans.photo_path)}')" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';">` : ''}
              ${!submitted ? `
                <label class="ghostbtn" style="display:block;text-align:center;margin-top:6px;cursor:pointer;">
                  ${vehicleChecklistPhotoBusyKey===item.key ? 'Uploading…' : (ans.photo_path?'📷 Retake Photo':'📷 Add Photo (required)')}
                  <input type="file" accept="image/*" capture="environment" style="display:none;" ${vehicleChecklistPhotoBusyKey===item.key?'disabled':''} onchange="uploadVehicleChecklistPhoto(this,'${item.key}')">
                </label>
              ` : ''}
              ${!ans.photo_path && !submitted ? `<p class="stub" style="color:var(--warn);margin:4px 0 0;">Photo required for a failed item</p>` : ''}
            </div>
          ` : ''}
        </div>
      `}).join('')}
    `).join('')}
    ${!submitted ? `
      <button class="darkbtn" style="width:100%;padding:16px;font-size:16px;margin-top:16px;" ${vehicleChecklistBusy?'disabled':''} onclick="submitVehicleChecklist()">
        ${vehicleChecklistBusy ? 'Submitting…' : 'Submit Checklist'}
      </button>
    ` : ''}
    <p class="sectiontitle" style="margin-top:24px;">Previous Weeks</p>
    ${history.length ? history.map(h=>`
      <div class="sitecard">
        <div class="info"><div class="name">Week of ${new Date(h.week_start+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</div><div class="addr">${h.has_fails?'⚠ Had failed items':'All passed'}</div></div>
      </div>
    `).join('') : `<div class="empty">No previous checklists yet.</div>`}
  `, {title:'Vehicle Checklist', back:'#/driver'});
}
window.setVehicleChecklistResult = function(key, result){
  if(!vehicleChecklistDraft.items[key]) vehicleChecklistDraft.items[key] = {key};
  vehicleChecklistDraft.items[key].result = result;
  render();
  saveVehicleChecklistDraft();
};
window.uploadVehicleChecklistPhoto = async function(input, key){
  const file = input.files && input.files[0];
  if(!file) return;
  vehicleChecklistPhotoBusyKey = key; render();
  let photoPath = null;
  try{
    const dataUrl = await compressImage(file);
    photoPath = await uploadDataUrl('site-photos', ME.org_id+'/vehicle-checklist/'+ME.id+'/'+crypto.randomUUID()+'.jpg', dataUrl);
  }catch(e){ photoPath = null; }
  vehicleChecklistPhotoBusyKey = null;
  if(!photoPath){ toast('Photo upload failed — check your connection and try again.'); render(); return; }
  if(!vehicleChecklistDraft.items[key]) vehicleChecklistDraft.items[key] = {key};
  vehicleChecklistDraft.items[key].photo_path = photoPath;
  render();
  await saveVehicleChecklistDraft();
};
// One inspection per driver per week (the database now enforces it too).
// Saves are queued one behind another: each Pass/Fail tap saves in the
// background, and two quick taps on a brand-new checklist used to both see
// "no row yet" and each create one.
let vehicleChecklistSaveQueue = Promise.resolve();
function saveVehicleChecklistDraft(){
  vehicleChecklistSaveQueue = vehicleChecklistSaveQueue.then(saveVehicleChecklistDraftNow).catch(e=>{ console.error(e); });
  return vehicleChecklistSaveQueue;
}
async function saveVehicleChecklistDraftNow(){
  const d = vehicleChecklistDraft;
  if(!d) return;
  const itemsArr = Object.keys(d.items).map(k=>d.items[k]);
  const hasFails = VEHICLE_CHECKLIST_ITEMS.some(i=>d.items[i.key] && d.items[i.key].result==='fail'); // only items still on the checklist count
  if(d.id){
    await dbUpdate('vehicle_checklists', d.id, {vehicle_reg:d.vehicle_reg||null, items:itemsArr, has_fails:hasFails});
  } else {
    // If this week's row already exists (started on another phone, say),
    // carry on with that one rather than trying to create a second.
    const existing = await dbSelect('vehicle_checklists', 'driver_id=eq.'+ME.id+'&week_start=eq.'+d.week_start+'&select=id&limit=1');
    if(existing[0]){
      d.id = existing[0].id;
      await dbUpdate('vehicle_checklists', d.id, {vehicle_reg:d.vehicle_reg||null, items:itemsArr, has_fails:hasFails});
    } else {
      const rows = await dbInsert('vehicle_checklists', {org_id:ME.org_id, driver_id:ME.id, vehicle_reg:d.vehicle_reg||null, week_start:d.week_start, items:itemsArr, has_fails:hasFails, status:'in_progress'});
      if(rows && rows[0]) d.id = rows[0].id;
    }
  }
}
window.submitVehicleChecklist = async function(){
  const d = vehicleChecklistDraft;
  const missing = VEHICLE_CHECKLIST_ITEMS.find(i=>!d.items[i.key] || !d.items[i.key].result);
  if(missing){ toast('Every item needs a Pass or Fail before you can submit.'); return; }
  const missingPhoto = VEHICLE_CHECKLIST_PHOTOS.find(ph=>!d.items[ph.key] || !d.items[ph.key].photo_path);
  if(missingPhoto){ toast('All 4 vehicle photos are needed before you can submit — missing: '+missingPhoto.label+'.'); return; }
  const badFail = VEHICLE_CHECKLIST_ITEMS.find(i=>{
    const it = d.items[i.key];
    return it.result==='fail' && (!it.photo_path || !it.note);
  });
  if(badFail){ toast('Every failed item needs both a photo and a note before you can submit.'); return; }
  vehicleChecklistBusy = true; render();
  const itemsArr = Object.keys(d.items).map(k=>d.items[k]);
  const hasFails = VEHICLE_CHECKLIST_ITEMS.some(i=>d.items[i.key] && d.items[i.key].result==='fail'); // only items still on the checklist count
  let row;
  if(d.id){
    row = await dbUpdate('vehicle_checklists', d.id, {vehicle_reg:d.vehicle_reg||null, items:itemsArr, has_fails:hasFails, status:'submitted', submitted_at:new Date().toISOString()});
  } else {
    const rows = await dbInsert('vehicle_checklists', {org_id:ME.org_id, driver_id:ME.id, vehicle_reg:d.vehicle_reg||null, week_start:d.week_start, items:itemsArr, has_fails:hasFails, status:'submitted', submitted_at:new Date().toISOString()});
    row = rows && rows[0];
  }
  vehicleChecklistBusy = false;
  if(!row){ toast('Could not save — try again.'); render(); return; }
  d.id = row.id; d.status = 'submitted';
  toast('Checklist submitted');
  if(hasFails){
    const failedLabels = VEHICLE_CHECKLIST_ITEMS.filter(i=>d.items[i.key].result==='fail').map(i=>i.label);
    postSystemMessage(null, 'vehicle_checklist_fail', `${ME.name}'s weekly vehicle checklist (${d.vehicle_reg||'no reg given'}) has ${failedLabels.length} failed item${failedLabels.length===1?'':'s'}: ${failedLabels.join('; ')}.`).catch(()=>{});
  }
  render();
};
