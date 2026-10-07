/* ================= CHECK IN/OUT ================= */
let checkinBusy = false;
let checkinError = null;
let checkinGeofenceOpen = false;
let checkinHistoryOpen = false;
let checkinRecentOpen = true; // this section only ever shows for operatives (their own sign-in) — open by default; PM/admin's "All Operatives / PM Logins" (checkinHistoryOpen) stays closed by default
let checkinPmLoginsOpen = false;
// Pairs up each operative's raw in/out log (chronological, ascending) into
// sessions of {user_id, in, out} — out:null means still on site. An "in"
// with no prior open session starts a new one; a stray "out" with nothing
// open is kept as its own row (in:null) so nothing silently disappears.
function buildCheckinSessions(rowsAsc){
  const byUser = {};
  rowsAsc.forEach(c=>{ (byUser[c.user_id] = byUser[c.user_id] || []).push(c); });
  const sessions = [];
  Object.keys(byUser).forEach(uid=>{
    let open = null;
    byUser[uid].forEach(c=>{
      if(c.type==='in'){
        if(open) sessions.push({user_id:uid, in:open, out:null});
        open = c;
      } else {
        if(open){ sessions.push({user_id:uid, in:open, out:c}); open = null; }
        else sessions.push({user_id:uid, in:null, out:c});
      }
    });
    if(open) sessions.push({user_id:uid, in:open, out:null});
  });
  return sessions;
}
function checkinDayLabel(ts){
  const d = new Date(ts); d.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const yest = new Date(today); yest.setDate(yest.getDate()-1);
  if(d.getTime()===today.getTime()) return 'Today';
  if(d.getTime()===yest.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
}
async function renderCheckin(siteId, subId){
  // Multi-site jobs replace the single site-wide check-in with a per-address
  // flow entirely — branch off before touching any of the single-site state/
  // logic below so a non-multi-site site's Check In page is provably
  // untouched by this feature.
  const __multiSite = SITES.find(s=>s.id===siteId);
  if(__multiSite && __multiSite.multi_site){
    if(subId) return renderCheckinSubAddress(siteId, subId);
    return renderCheckinAddressList(siteId);
  }
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const isPM = isManager(ME);
  const isAdmin = ME.role==='admin';
  const [mine, teamAll, pmMine] = await Promise.all([
    dbSelect('checkins', 'site_id=eq.'+siteId+'&user_id=eq.'+ME.id+'&order=ts.desc&limit=5'),
    // PMs/admins get the whole site's check-in history (ascending, so it can
    // be paired into in/out sessions and grouped by day below) so they can
    // see every operative's activity, not just their own. Fetched newest-
    // first with the 500 cap so a long-running site's most recent activity
    // survives the cap, then reversed back to ascending for the pairing
    // logic below — a plain order=ts.asc&limit=500 was silently returning
    // the OLDEST 500 events instead, freezing "Live Status" once a site
    // passed 500 lifetime check-in events.
    isPM ? dbSelect('checkins', 'site_id=eq.'+siteId+'&order=ts.desc&limit=500').then(r=>r.reverse()) : Promise.resolve([]),
    // Admins get the site's responsible PM's own sign-in/out history as its
    // own standalone section — a separate concern from the combined "All
    // Operatives" history above, which mixes everyone together.
    (isAdmin && site.responsible_pm_id) ? dbSelect('checkins', 'site_id=eq.'+siteId+'&user_id=eq.'+site.responsible_pm_id+'&order=ts.desc&limit=5') : Promise.resolve([]),
  ]);
  const last = mine[0];
  const status = (last && last.type==='in') ? 'in' : 'out';

  // Latest check-in per operative (teamAll is ts.asc, so the last write for
  // each user_id ends up being their most recent check-in/out).
  const latestByUser = {};
  teamAll.forEach(c=>{ latestByUser[c.user_id] = c; });
  const teamStatusList = Object.values(latestByUser).sort((a,b)=>{
    const aIn = a.type==='in' ? 0 : 1, bIn = b.type==='in' ? 0 : 1;
    return aIn - bIn || new Date(b.ts) - new Date(a.ts);
  });

  // Day-grouped history: each operative's sign-in & sign-out shown together
  // in one row, newest day first.
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
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Status</p>
      ${status==='in' ? `<span class="pill on"><span class="dot"></span>On site since ${new Date(last.ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</span>`
                       : `<span class="pill off"><span class="dot"></span>Not checked in</span>`}
    </div>
    ${checkinError ? `<div class="card" style="border-color:var(--warn);"><div class="stub" style="color:var(--warn);margin-top:0;">${escapeHtml(checkinError)}</div></div>` : ''}
    <button class="primarybtn" style="${status==='in'?'background:var(--ink);':''}" ${checkinBusy?'disabled':''} onclick="doCheckAction('${siteId}','${status==='in'?'out':'in'}')">
      ${checkinBusy ? (orgAllowsGps() ? 'Getting GPS lock…' : 'Please wait…') : (status==='in' ? 'Check Out' : 'Check In')}
    </button>
    ${isPM ? `
      <p class="sectiontitle" style="margin-top:18px;">Site Geofence</p>
      ${!orgAllowsGps() ? `
        <div class="card"><p class="stub" style="margin:0;">GPS check-in & geofencing is part of OpHUB Pro and above — your company's currently on OpHUB Basic. Ask your OpHUB platform admin to upgrade your package to switch this on.</p></div>
      ` : site.geofence_lat ? `
        <div class="ddrow" style="margin-top:0;" onclick="checkinGeofenceOpen=!checkinGeofenceOpen;render()"><span class="arrow">${checkinGeofenceOpen?'▼':'▶'}</span> Geofence set — ${site.geofence_radius_m||100}m radius</div>
        ${checkinGeofenceOpen ? `
          <div class="card">
            <div class="stub" style="font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;">${site.geofence_lat.toFixed(5)}, ${site.geofence_lon.toFixed(5)}</div>
            <a class="stub" style="display:inline-block;margin:2px 0 8px;color:var(--blue);" href="https://www.google.com/maps?q=${site.geofence_lat},${site.geofence_lon}" target="_blank" rel="noopener">View on map ↗</a>
            <button class="ghostbtn" onclick="openGeoOptions('${siteId}')">Update location</button>
            <p class="stub" style="margin:14px 0 6px;">Check-in/out distance limit</p>
            <div class="row-gap">
              ${[50,100,200].map(r=>`<button class="${(site.geofence_radius_m||100)===r?'darkbtn':'ghostbtn'}" style="flex:1;" onclick="setGeofenceRadius('${siteId}',${r})">${r}m</button>`).join('')}
            </div>
          </div>
        ` : ''}
      ` : `
        <div class="card">
          <p class="stub" style="margin:0 0 8px;">Not set — check-ins won't be distance-checked yet.</p>
          <button class="darkbtn" onclick="openGeoOptions('${siteId}')">Set site location</button>
          <p class="stub" style="margin:14px 0 6px;">Check-in/out distance limit</p>
          <div class="row-gap">
            ${[50,100,200].map(r=>`<button class="${(site.geofence_radius_m||100)===r?'darkbtn':'ghostbtn'}" style="flex:1;" onclick="setGeofenceRadius('${siteId}',${r})">${r}m</button>`).join('')}
          </div>
        </div>
      `}
      <p class="sectiontitle" style="margin-top:18px;">Site Team — Live Status</p>
      ${teamStatusList.length ? teamStatusList.map(c=>`
        <div class="card" style="padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="font-size:13px;font-weight:700;">${escapeHtml(nameOf(c.user_id))}${c.user_id===ME.id?' <span style="color:var(--slate);font-weight:600;">(you)</span>':''}</div>
          ${c.type==='in' ? `<span class="pill on" style="margin:0;"><span class="dot"></span>On site since ${new Date(c.ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</span>` : `<span class="pill off" style="margin:0;"><span class="dot"></span>Off site</span>`}
        </div>
      `).join('') : `<div class="empty">No check-ins recorded for this site yet.</div>`}
    ` : ''}
    ${isPM ? `
      <div class="ddrow" style="margin-top:18px;" onclick="checkinHistoryOpen=!checkinHistoryOpen;render()"><span class="arrow">${checkinHistoryOpen?'▼':'▶'}</span> All Operatives / PM Logins</div>
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
      `).join('') : `<div class="empty">No check-ins recorded for this site yet.</div>`}
      ${isAdmin ? `
        <div class="ddrow" style="margin-top:10px;" onclick="checkinPmLoginsOpen=!checkinPmLoginsOpen;render()"><span class="arrow">${checkinPmLoginsOpen?'▼':'▶'}</span> PM Logins</div>
        ${checkinPmLoginsOpen ? `<div style="margin-top:10px;">${pmMine.length ? pmMine.slice(0,4).map(c=>`
          <div class="card" style="padding:10px 12px;margin-bottom:8px;">
            <div style="font-size:12.5px;"><b>${escapeHtml(nameOf(site.responsible_pm_id))}</b> — ${c.type==='in'?'Checked in':'Checked out'} · ${new Date(c.ts).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        `).join('') : `<div class="empty">${site.responsible_pm_id ? 'No check-ins yet.' : 'No project manager assigned to this project yet.'}</div>`}</div>` : ''}
      ` : ''}
      <p class="sectiontitle" style="margin-top:18px;">Reports</p>
      <div class="row-gap">
        <button class="ghostbtn exportbtn" style="flex:1;" onclick="exportCheckins('${siteId}','week')">Export this week (Excel)</button>
        <button class="ghostbtn exportbtn" style="flex:1;" onclick="exportCheckins('${siteId}','all')">Export full history (Excel)</button>
      </div>
      <p class="stub">Weekly auto-email needs a scheduled backend job — flagged for the next phase.</p>
      </div>` : ''}
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
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(body, {title:'Check In / Out', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, activeTab:'checkin'}); }
}
