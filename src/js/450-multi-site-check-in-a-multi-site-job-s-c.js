/* ================= MULTI-SITE CHECK-IN: a multi-site job's Check In page
   replaces the single site-wide button with a list of its addresses; each
   address gets its own GPS-geofenced check-in flow (renderCheckinSubAddress)
   writing checkins.sub_site_id, entirely separate from the single-site path
   above. ================= */
let checkinClosedAddressesOpen = false;
function checkinAddressRowHtml(siteId, a){
  return `
    <div class="sitecard" style="cursor:pointer;${a.closed?'opacity:.7;':''}" onclick="go('#/site/${siteId}/checkin/${a.id}')">
      <div class="info">
        <div class="name">${escapeHtml(a.name)}${a.closed?' <span class="statustag closed" style="margin-left:4px;">Closed</span>':''}</div>
        ${a.address||a.postcode ? `<div class="addr">${escapeHtml([a.address,a.postcode].filter(Boolean).join(', '))}</div>` : ''}
        <div class="stub" style="margin:4px 0 0;">${a.geofence_lat!=null ? `📍 Geofence set — ${a.geofence_radius_m||100}m radius` : 'No geofence set yet'}</div>
      </div>
      ${isManager(ME) ? `<button type="button" class="ghostbtn" style="flex:0 0 auto;width:auto;margin:0 6px 0 0;padding:6px 12px;font-size:11px;${a.closed?'':'color:var(--warn);'}" onclick="event.stopPropagation();${a.closed?`reopenSubAddress('${a.id}')`:`closeSubAddress('${siteId}','${a.id}')`}">${a.closed?'Reopen':'Close'}</button>` : ''}
      <span style="font-size:20px;color:var(--slate);">›</span>
    </div>
  `;
}
async function renderCheckinAddressList(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const allSubAddresses = await dbSelect('site_sub_addresses', 'site_id=eq.'+siteId+'&order=name.asc');
  const subAddresses = allSubAddresses.filter(a=>!a.closed);
  const closedSubAddresses = allSubAddresses.filter(a=>a.closed);
  const body = `
    <p class="sectiontitle" style="margin-top:0;">Choose the address you're checking in to</p>
    ${subAddresses.length ? subAddresses.map(a=>checkinAddressRowHtml(siteId,a)).join('')
      : (closedSubAddresses.length ? `<div class="empty">No open addresses — see Closed Addresses below.</div>` : `<div class="empty">No addresses have been added for this project yet.${isManager(ME)?'':' Ask your project manager to add one.'}</div>`)}
    ${closedSubAddresses.length ? `
      <div class="ddrow" style="margin-top:18px;" onclick="checkinClosedAddressesOpen=!checkinClosedAddressesOpen;render()"><span class="arrow">${checkinClosedAddressesOpen?'▼':'▶'}</span> Closed Addresses (${closedSubAddresses.length})</div>
      ${checkinClosedAddressesOpen ? `<div style="margin-top:10px;">${closedSubAddresses.map(a=>checkinAddressRowHtml(siteId,a)).join('')}</div>` : ''}
    ` : ''}
    ${isManager(ME) ? (subAddrFormOpen ? `
      <div class="card" style="background:var(--paper);">
        <p class="sectiontitle" style="margin-top:0;">${subAddrEditingId?'Edit Address':'Add Address'}</p>
        <div class="formfield"><input type="text" id="subAddrName" placeholder="e.g. 12 High Street" value="${escapeHtml(subAddrNameDraft)}" oninput="subAddrNameDraft=this.value"></div>
        <div class="formfield"><input type="text" id="subAddrAddress" placeholder="Address (optional)" value="${escapeHtml(subAddrAddressDraft)}" oninput="applyTitleCase(this);subAddrAddressDraft=this.value"></div>
        <div class="formfield"><input type="text" id="subAddrPostcode" placeholder="Postcode (optional)" value="${escapeHtml(subAddrPostcodeDraft)}" oninput="applyUpperCase(this);subAddrPostcodeDraft=this.value"></div>
        <p class="stub" style="margin:0 0 10px;">Geofencing for this address can be set afterwards from Settings &amp; Admin → Multi-Site.</p>
        <div style="display:flex;gap:8px;">
          <button class="darkbtn" style="flex:1;" onclick="saveSubAddress('${siteId}')">${subAddrEditingId?'Save':'Add Address'}</button>
          <button class="ghostbtn" style="width:auto;padding:10px 16px;" onclick="toggleSubAddrForm()">Cancel</button>
        </div>
      </div>
    ` : `<button class="ghostbtn" style="margin-top:${subAddresses.length?'0':'10px'};" onclick="toggleSubAddrForm()">+ Add Address</button>`) : ''}
  `;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(body, {title:'Check In / Out', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, activeTab:'checkin'}); }
}
async function renderCheckinSubAddress(siteId, subId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const addresses = await dbSelect('site_sub_addresses', 'site_id=eq.'+siteId+'&order=name.asc');
  const addr = addresses.find(a=>a.id===subId);
  if(!addr){ toast('Address not found.'); go(`#/site/${siteId}/checkin`); return; }
  const isPM = isManager(ME);
  const [mine, teamAll] = await Promise.all([
    dbSelect('checkins', 'site_id=eq.'+siteId+'&sub_site_id=eq.'+subId+'&user_id=eq.'+ME.id+'&order=ts.desc&limit=5'),
    // See the same fix/comment in renderCheckin — fetch newest-first so the
    // 500 cap keeps current activity, then reverse back to ascending.
    isPM ? dbSelect('checkins', 'site_id=eq.'+siteId+'&sub_site_id=eq.'+subId+'&order=ts.desc&limit=500').then(r=>r.reverse()) : Promise.resolve([]),
  ]);
  const last = mine[0];
  const status = (last && last.type==='in') ? 'in' : 'out';

  const latestByUser = {};
  teamAll.forEach(c=>{ latestByUser[c.user_id] = c; });
  const teamStatusList = Object.values(latestByUser).sort((a,b)=>{
    const aIn = a.type==='in' ? 0 : 1, bIn = b.type==='in' ? 0 : 1;
    return aIn - bIn || new Date(b.ts) - new Date(a.ts);
  });
  const sessions = buildCheckinSessions(teamAll);
  const dayGroups = {};
  sessions.forEach(s=>{
    const anchor = s.in || s.out;
    const dayKey = new Date(anchor.ts).toDateString();
    (dayGroups[dayKey] = dayGroups[dayKey] || []).push(s);
  });
  const dayKeysSorted = Object.keys(dayGroups).sort((a,b)=>new Date(b)-new Date(a));
  dayKeysSorted.forEach(k=>{
    dayGroups[k].sort((a,b)=>{
      const aTs = new Date((a.in||a.out).ts), bTs = new Date((b.in||b.out).ts);
      return bTs - aTs;
    });
  });

  const body = `
    <p class="stub" style="margin:0 0 10px;"><a href="#/site/${siteId}/checkin" onclick="event.preventDefault();go('#/site/${siteId}/checkin')" style="color:var(--blue);">‹ All addresses</a></p>
    <div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <p class="sectiontitle" style="margin-top:0;">Status — ${escapeHtml(addr.name)}</p>
        ${addr.closed ? `<span class="statustag closed" style="white-space:nowrap;">Closed</span>` : ''}
      </div>
      ${addr.closed ? `<p class="stub" style="margin:0 0 8px;color:var(--warn);">This address is closed — checked-in operatives should check out elsewhere; new check-ins are switched off.</p>` : ''}
      ${status==='in' ? `<span class="pill on"><span class="dot"></span>On site since ${new Date(last.ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</span>`
                       : `<span class="pill off"><span class="dot"></span>Not checked in</span>`}
      ${isPM ? `<button class="ghostbtn" style="margin-top:10px;${addr.closed?'':'color:var(--warn);'}" onclick="${addr.closed?`reopenSubAddress('${subId}')`:`closeSubAddress('${siteId}','${subId}')`}">${addr.closed?'Reopen Address':'Close Address'}</button>` : ''}
    </div>
    ${checkinError ? `<div class="card" style="border-color:var(--warn);"><div class="stub" style="color:var(--warn);margin-top:0;">${escapeHtml(checkinError)}</div></div>` : ''}
    ${(!addr.closed || status==='in') ? `
    <button class="primarybtn" style="${status==='in'?'background:var(--ink);':''}" ${checkinBusy?'disabled':''} onclick="doCheckActionSub('${siteId}','${subId}','${status==='in'?'out':'in'}')">
      ${checkinBusy ? (orgAllowsGps() ? 'Getting GPS lock…' : 'Please wait…') : (status==='in' ? 'Check Out' : 'Check In')}
    </button>
    ` : ''}
    ${isPM ? `
      <p class="sectiontitle" style="margin-top:18px;">Address Geofence</p>
      ${!orgAllowsGps() ? `
        <div class="card"><p class="stub" style="margin:0;">GPS check-in & geofencing is part of OpHUB Pro and above — your company's currently on OpHUB Basic. Ask your OpHUB platform admin to upgrade your package to switch this on.</p></div>
      ` : addr.geofence_lat!=null ? `
        <div class="ddrow" style="margin-top:0;" onclick="checkinGeofenceOpen=!checkinGeofenceOpen;render()"><span class="arrow">${checkinGeofenceOpen?'▼':'▶'}</span> Geofence set — ${addr.geofence_radius_m||100}m radius</div>
        ${checkinGeofenceOpen ? `
          <div class="card">
            ${geoLocRowHtml(addr.geofence_lat, addr.geofence_lon, `openSubGeoOptions('${subId}')`)}
            ${geoRadiusRowHtml('geoRadiusSel', addr.geofence_radius_m, 'setSubGeofenceRadius', subId)}
          </div>
        ` : ''}
      ` : `
        <div class="card">
          <p class="stub" style="margin:0 0 8px;">Not set — check-ins won't be distance-checked yet.</p>
          <button class="darkbtn" onclick="openSubGeoOptions('${subId}')">Set address location</button>
          ${geoRadiusRowHtml('geoRadiusSel', addr.geofence_radius_m, 'setSubGeofenceRadius', subId)}
        </div>
      `}
      <p class="sectiontitle" style="margin-top:18px;">Site Team — Live Status</p>
      ${teamStatusList.length ? teamStatusList.map(c=>`
        <div class="card" style="padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="font-size:13px;font-weight:700;">${escapeHtml(nameOf(c.user_id))}${c.user_id===ME.id?' <span style="color:var(--slate);font-weight:600;">(you)</span>':''}</div>
          ${c.type==='in' ? `<span class="pill on" style="margin:0;"><span class="dot"></span>On site since ${new Date(c.ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</span>` : `<span class="pill off" style="margin:0;"><span class="dot"></span>Off site</span>`}
        </div>
      `).join('') : `<div class="empty">No check-ins recorded for this address yet.</div>`}
      <div class="ddrow" style="margin-top:18px;" onclick="checkinHistoryOpen=!checkinHistoryOpen;render()"><span class="arrow">${checkinHistoryOpen?'▼':'▶'}</span> All Operatives</div>
      ${checkinHistoryOpen ? `<div style="margin-top:10px;">${dayKeysSorted.length ? dayKeysSorted.map(dayKey=>`
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--slate);margin:0 0 6px;">${checkinDayLabel(dayKey)}</div>
          ${dayGroups[dayKey].map(s=>`
            <div class="card" style="padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <div style="font-size:13px;font-weight:700;flex:1;min-width:90px;">${escapeHtml(nameOf(s.user_id))}</div>
              <div style="font-size:12px;color:var(--slate);display:flex;align-items:center;gap:14px;">
                <span>${s.in ? 'In '+new Date(s.in.ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}) : '—'}</span>
                <span>${s.out ? 'Out '+new Date(s.out.ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}) : (s.in ? '<span style="color:var(--ok);font-weight:700;">On site</span>' : '—')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('') : `<div class="empty">No check-ins recorded for this address yet.</div>`}</div>` : ''}
    ` : ''}
    ${ME.role==='operative' ? `
      <div class="ddrow" style="margin-top:18px;" onclick="checkinRecentOpen=!checkinRecentOpen;render()"><span class="arrow">${checkinRecentOpen?'▼':'▶'}</span> Recent</div>
      ${checkinRecentOpen ? `<div style="margin-top:10px;">${mine.slice(0,4).map(c=>`
        <div class="card" style="padding:10px 12px;margin-bottom:8px;">
          <div style="font-size:12.5px;"><b>${c.type==='in'?'Checked in':'Checked out'}</b> · ${new Date(c.ts).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      `).join('') || `<div class="empty">No check-ins yet.</div>`}</div>` : ''}
    ` : ''}
  `;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(body, {title:'Check In / Out', subtitle:site.name+' — '+addr.name, siteNameSubtitle:true, back:`#/site/${siteId}/checkin`, siteId, activeTab:'checkin'}); }
}
// This person's latest check-in / out on a job, per address ('' = the
// job itself, no address), read fresh from the server — so a page left open
// (or a second tab) can't make a second check-in or a check-out with no check-in.
async function checkinLatestByAddress(siteId){
  const rows = await dbSelectNet('checkins', 'site_id=eq.'+siteId+'&user_id=eq.'+ME.id+'&select=sub_site_id,type,ts&order=ts.desc&limit=200');
  const latest = {};
  (rows||[]).forEach(r=>{ const k = r.sub_site_id||''; if(!(k in latest)) latest[k] = r; });
  return latest;
}
window.doCheckActionSub = async function(siteId, subId, type){
  checkinError = null;
  checkinBusy = true;
  render();

  // Closed address: no new check-ins (checking out is still allowed).
  // Only one address at a time: check out of the other one first.
  {
    const [addrRows, latest] = await Promise.all([
      dbSelectNet('site_sub_addresses', 'id=eq.'+subId+'&select=id,name,closed'),
      checkinLatestByAddress(siteId),
    ]);
    const here = latest[subId];
    const amIn = !!(here && here.type==='in');
    if(type==='in'){
      if(addrRows[0] && addrRows[0].closed){ checkinBusy = false; checkinError = 'This address is closed — new check-ins are switched off.'; render(); return; }
      if(amIn){ checkinBusy = false; toast('You\'re already checked in here.'); render(); return; }
      const elsewhere = Object.keys(latest).filter(k=>k!==subId && latest[k].type==='in');
      if(elsewhere.length){
        const all = await dbSelect('site_sub_addresses', 'site_id=eq.'+siteId+'&select=id,name');
        const names = elsewhere.map(k=>{ const a = all.find(x=>x.id===k); return a ? a.name : (k ? 'another address' : 'this job'); }).join(', ');
        checkinBusy = false; render();
        customAlert(`You're still checked in at ${names}. Check out there first, then check in here.`);
        return;
      }
    } else if(!amIn){ checkinBusy = false; toast('You\'re not checked in here.'); render(); return; }
  }

  // Check-out from a multi-site address is blocked until every Schedule of
  // Works task linked to that specific address has at least one photo
  // attached (schedule_photos) — catches someone leaving without recording
  // any progress/completion evidence for that address's work.
  if(type==='out'){
    const linkedTasks = await dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&sub_site_id=eq.'+subId+'&select=id,name');
    if(linkedTasks.length){
      const taskIds = linkedTasks.map(t=>t.id).join(',');
      const photoRows = await dbSelect('schedule_photos', 'task_id=in.('+taskIds+')&select=task_id');
      const withPhoto = new Set(photoRows.map(p=>p.task_id));
      // Photos taken but still waiting on the phone to send count too.
      try{ (await sowOfflineAll()).forEach(r=>{ if(r.kind==='photo') withPhoto.add(r.taskId); }); }catch(e){}
      try{ Object.keys(SOW_PENDING).forEach(k=>withPhoto.add(k)); }catch(e){}
      const missing = linkedTasks.filter(t=>!withPhoto.has(t.id));
      if(missing.length){
        checkinBusy = false;
        render();
        customAlert(`Add at least one photo to the Schedule of Works task${missing.length===1?'':'s'} for this address before checking out: ${missing.map(t=>t.name).join(', ')}.`);
        return;
      }
    }
  }

  if(!orgAllowsGps() || isManager(ME)){
    const rows = await dbInsert('checkins', {site_id:siteId, sub_site_id:subId, user_id:ME.id, type, ...checkinDeviceField()});
    checkinBusy = false;
    if(rows){
      toast((type==='in'?'Checked in':'Checked out')+' · '+new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}));
      notifyOperativeCheckin(siteId, type);
    }
    render();
    return;
  }

  const g = await getGeo();
  if(g.error){
    checkinBusy = false; checkinError = g.error; render(); return;
  }
  const addresses = await dbSelect('site_sub_addresses', 'id=eq.'+subId);
  const addr = addresses[0];
  if(addr && addr.geofence_lat!=null){
    const dist = Math.round(distMeters(g.lat, g.lon, addr.geofence_lat, addr.geofence_lon));
    const allowedRadius = addr.geofence_radius_m || 100;
    if(dist > allowedRadius){
      checkinBusy = false;
      checkinError = `${dist}m from this address — must be within ${allowedRadius}m to ${type==='in'?'check in':'check out'}. Move closer and try again.`;
      render();
      return;
    }
  }
  const rows = await dbInsert('checkins', {site_id:siteId, sub_site_id:subId, user_id:ME.id, type, lat:g.lat, lon:g.lon, accuracy_m:Math.round(g.accuracy||0), ...checkinDeviceField()});
  checkinBusy = false;
  if(rows){
    toast((type==='in'?'Checked in':'Checked out')+' · '+new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}));
    notifyOperativeCheckin(siteId, type);
  }
  render();
};

window.doCheckAction = async function(siteId, type){
  checkinError = null;
  checkinBusy = true;
  render();
  // Re-check against the server: a page left open could otherwise add a
  // second check-in, or a check-out with no check-in.
  {
    const here = (await dbSelectNet('checkins', 'site_id=eq.'+siteId+'&user_id=eq.'+ME.id+'&select=type,ts&order=ts.desc&limit=1'))[0]; // same rule as the Status card
    const amIn = !!(here && here.type==='in');
    if(type==='in' && amIn){ checkinBusy = false; toast('You\'re already checked in.'); render(); return; }
    if(type==='out' && !amIn){ checkinBusy = false; toast('You\'re not checked in.'); render(); return; }
  }

  // OpHUB Basic doesn't include GPS check-in & geofencing — just log the
  // timestamp with no location and skip the distance check entirely. PMs
  // and admins get the same no-GPS path regardless of tier — they don't
  // need to be physically on site to check themselves in/out.
  if(!orgAllowsGps() || isManager(ME)){
    const rows = await dbInsert('checkins', {site_id:siteId, user_id:ME.id, type, ...checkinDeviceField()});
    checkinBusy = false;
    if(rows){
      toast((type==='in'?'Checked in':'Checked out')+' · '+new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}));
      notifyOperativeCheckin(siteId, type);
    }
    render();
    return;
  }

  const g = await getGeo();
  if(g.error){
    checkinBusy = false; checkinError = g.error; render(); return;
  }
  const site = SITES.find(s=>s.id===siteId);
  if(site.geofence_lat!=null){
    const dist = Math.round(distMeters(g.lat, g.lon, site.geofence_lat, site.geofence_lon));
    const allowedRadius = site.geofence_radius_m || 100;
    if(dist > allowedRadius){
      checkinBusy = false;
      checkinError = `${dist}m from site — must be within ${allowedRadius}m to ${type==='in'?'check in':'check out'}. Move closer and try again.`;
      render();
      return;
    }
  }
  const rows = await dbInsert('checkins', {site_id:siteId, user_id:ME.id, type, lat:g.lat, lon:g.lon, accuracy_m:Math.round(g.accuracy||0), ...checkinDeviceField()});
  checkinBusy = false;
  if(rows){
    toast((type==='in'?'Checked in':'Checked out')+' · '+new Date().toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}));
    notifyOperativeCheckin(siteId, type);
  }
  render();
};
window.exportCheckins = async function(siteId, scope){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  const site = SITES.find(s=>s.id===siteId);
  let qs = 'site_id=eq.'+siteId+'&order=ts.asc,id.asc';
  if(scope==='week') qs += '&ts=gte.'+new Date(startOfWeek(Date.now())).toISOString();
  // The server hands back at most 1,000 rows at a time, so a long job's full
  // history is fetched page by page — otherwise the newest weeks were cut off.
  // Keeps going until a page comes back empty, so it works whatever the
  // server's own row cap is.
  const PAGE = 1000, rows = [], seenIds = new Set();
  for(let guard=0; guard<500; guard++){
    const r = await dbSelectChecked('checkins', qs+'&limit='+PAGE+'&offset='+rows.length);
    if(!r.ok){ toast('Could not load all the check-ins — check your signal and try again.'); return; }
    const fresh = r.data.filter(c=>!seenIds.has(c.id));
    if(!fresh.length) break;
    fresh.forEach(c=>seenIds.add(c.id));
    rows.push(...fresh);
  }
  if(!rows.length){ toast('No check-ins in that range.'); return; }
  const data = rows.map(c=>({
    Name: nameOf(c.user_id),
    Type: c.type==='in'?'Check In':'Check Out',
    Date: new Date(c.ts).toLocaleDateString('en-GB'),
    Time: new Date(c.ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),
    Latitude: c.lat,
    Longitude: c.lon,
    'Accuracy (m)': c.accuracy_m||''
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:18},{wch:11},{wch:11},{wch:8},{wch:11},{wch:11},{wch:11}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Check-ins');
  const label = scope==='week' ? 'Check-ins (This Week)' : 'Check-ins (All Time)';
  await deliverExcelFile(wb, exportFilename(site.name, label, 'xlsx'));
};
