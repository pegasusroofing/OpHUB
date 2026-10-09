/* ================= SITE HOME ================= */
async function renderSiteHome(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/sites'); return; }
  // Maintenance / Repair Contract projects skip the normal Schedule of
  // Works / Check-in / tabbar layout entirely — their "Home" is the repair
  // jobs list itself. See renderRepairJobsHub.
  if(site.repair_contract) return renderRepairJobsHub(siteId);
  // Client login: a minimal, view-only home — Schedule of Works, Health &
  // Safety (RAMS/COSHH/TBT/PUWER/Operative Dashboard), and Snagging. No
  // stat row (on-site counts, price, materials etc. aren't theirs to see),
  // no tab bar (Check-in/Inbox/Settings don't apply to them either).
  if(isClient(ME)){
    const [tasks, openSnags] = await Promise.all([
      dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&select=status'),
      dbSelect('snags', 'site_id=eq.'+siteId+'&status=eq.open&select=id'),
    ]);
    const scheduleDone = tasks.filter(t=>t.status==='done').length;
    if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
      <div class="tilegrid" style="grid-auto-rows:1fr;">
        <div class="tile" onclick="go('#/site/${siteId}/schedule')">
          <div class="icon" style="background:var(--blue-bg);color:var(--blue);">📋</div>
          <div class="lbl">Schedule of Works</div><div class="sub">${scheduleDone} of ${tasks.length} done</div>
        </div>
        <div class="tile" onclick="go('#/site/${siteId}/hs')">
          <div class="icon" style="background:#E7E9EE;color:var(--ink);">📄</div>
          <div class="lbl">Health &amp; Safety</div><div class="sub">RAMS · COSHH · TBT</div>
        </div>
        <div class="tile" onclick="go('#/site/${siteId}/snagging/list')">
          <div class="icon" style="background:var(--warn-bg);color:var(--warn);">🔧</div>
          <div class="lbl">Snagging</div><div class="sub">${openSnags.length} open</div>
        </div>
      </div>
    `, {title:site.name, subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:'#/sites', siteId, tabs:false}); }
    return;
  }

  // #384: an active site with nobody assigned yet gets a one-tick-list
  // pop-up the first time its responsible PM/admin opens it, so operatives
  // don't have to be assigned from a separate Settings & Admin screen
  // before anyone can be checked in. It stops appearing the moment at least
  // one operative is assigned — nothing to dismiss or configure.
  if(isManager(ME) && siteStatusKey(site)==='live'){
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id&limit=1').then(rows=>{
      if(!rows.length) openAssignOperativesModal(siteId);
    });
  }

  // 2026-10-03: the price-access check, the "has an operative not signed?"
  // check and the Main Contractor tile count used to run one after another
  // AFTER the main batch below (eight to ten round trips in a row for a
  // manager). None of them depends on that batch, so they now start
  // straight away and run alongside it.
  const pricePromise = (async ()=>{
    let can = false;
    if(site.price_enabled){
      if(ME.role==='admin' || site.responsible_pm_id===ME.id) can = true;
      else {
        const grant = await dbSelect('site_price_access', 'site_id=eq.'+siteId+'&user_id=eq.'+ME.id+'&select=user_id&limit=1');
        can = grant.length>0;
      }
    }
    let pending = 0;
    if(can && isManager(ME)){
      const pendingAw = await dbSelect('additional_works_requests', 'site_id=eq.'+siteId+'&status=eq.pending&select=id');
      pending = pendingAw.length;
    }
    return {can, pending};
  })();
  const hsGapPromise = (async ()=>{
    if(!isManager(ME)) return false;
    const [assignedRowsHere, ramsCurrentHere, coshhDocsHere] = await Promise.all([
      dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
      dbSelect('rams_docs', 'site_id=eq.'+siteId+'&status=eq.current&subcontractor_company_id=is.null&select=id,resign_cycle_start,uploaded_at'),
      dbSelect('coshh_docs', 'site_id=eq.'+siteId+'&subcontractor_company_id=is.null&select=id,resign_cycle_start,uploaded_at'),
      loadAllProfiles(),
    ]);
    const operativeIdsHere = assignedRowsHere.map(r=>r.user_id).filter(uid=>PROFILES[uid] && PROFILES[uid].role==='operative');
    if(!operativeIdsHere.length) return false;
    const [ramsGapHere, coshhGapHere] = await Promise.all([
      anyOperativeMissingSignature('rams_signatures', 'rams_id', ramsCurrentHere, site, operativeIdsHere),
      anyOperativeMissingSignature('coshh_signatures', 'coshh_id', coshhDocsHere, site, operativeIdsHere),
    ]);
    return ramsGapHere || coshhGapHere;
  })();
  const mcTilesPromise = site.acting_as_main_contractor ? getMcTiles(siteId, site) : Promise.resolve(null);
  const todayISO = localISODate(new Date());
  const [tasks, openSnags, ramsDocs, mySignatures, pendingMat, myLastCheckin, openTodos, teamCheckinsForCount, todayCalEvents] = await Promise.all([
    dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&select=status'),
    dbSelect('snags', 'site_id=eq.'+siteId+'&status=eq.open&select=id'),
    dbSelect('rams_docs', 'site_id=eq.'+siteId+'&status=eq.current&subcontractor_company_id=is.null&select=id'), // current versions only — a superseded RAMS can't be signed, so it used to count as "to sign" for ever
    dbSelect('rams_signatures', 'user_id=eq.'+ME.id+'&select=rams_id'),
    // Stays counted through "sent" too, not just "pending" — see the
    // matching comment on the Dashboard's materials query above.
    dbSelect('materials', 'site_id=eq.'+siteId+'&status=in.(pending,sent)&select=id'),
    dbSelect('checkins', 'site_id=eq.'+siteId+'&user_id=eq.'+ME.id+'&order=ts.desc&limit=1'),
    isManager(ME) ? dbSelect('todos', 'site_id=eq.'+siteId+'&done=eq.false&select=id') : Promise.resolve([]),
    // PM/admin stat row needs a site-wide "who's on site right now" count —
    // operatives don't see this stat, so skip the query entirely for them.
    // Most recent 500, not the oldest 500 — order=ts.desc so the cap keeps
    // current activity once a site passes 500 lifetime check-in events;
    // reversed back to ascending right after the fetch below since the
    // "latest per user" walk needs oldest-to-newest order.
    isManager(ME) ? dbSelect('checkins', 'site_id=eq.'+siteId+'&order=ts.desc&limit=500&select=user_id,type').then(r=>r.reverse()) : Promise.resolve([]),
    // Middle stat tile: today's date + what's on the site calendar today.
    dbSelect('site_calendar_events', 'site_id=eq.'+siteId+'&event_date=eq.'+todayISO+'&order=created_at.asc&select=title'),
  ]);
  // The bottom tab bar's badge (currentUnreadMsgs) was already refreshed by
  // the router right before this ran — reuse it here instead of querying twice.
  const unreadMsgs = currentUnreadMsgs;
  const scheduleDone = tasks.filter(t=>t.status==='done').length;
  const signedIds = new Set(mySignatures.map(s=>s.rams_id));
  const pendingRams = ramsDocs.filter(r=>!signedIds.has(r.id)).length;
  const onSite = myLastCheckin[0] && myLastCheckin[0].type==='in';
  // Site-wide "on site now" count for the PM/admin stat row — latest
  // check-in per user (list is ts.asc, so the last write per user_id is
  // their most recent), then count who's currently type==='in'. Same
  // approach as the Check In page's own teamStatusList.
  let onSiteCount = 0;
  if(isManager(ME)){
    const latestByUser = {};
    teamCheckinsForCount.forEach(c=>{ latestByUser[c.user_id] = c; });
    onSiteCount = Object.values(latestByUser).filter(c=>c.type==='in').length;
  }
  // Today's date + what's on the calendar, for the middle stat tile.
  const todayDateLabel = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  const todayCalLabel = !todayCalEvents.length ? 'Nothing today'
    : todayCalEvents.length===1 ? todayCalEvents[0].title
    : todayCalEvents[0].title+' +'+(todayCalEvents.length-1)+' more';
  // Price tile visibility: project admin and this site's responsible PM
  // always see it once enabled; an operative needs an explicit grant.
  const [priceInfo, hsOperativeGap, mcTilesInfo] = await Promise.all([pricePromise, hsGapPromise, mcTilesPromise]);
  const canSeePrice = priceInfo.can, pendingVariationCount = priceInfo.pending;
  const mcAreaCount = mcTilesInfo ? mcTilesInfo.visibleTiles.length : 0;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="status-strip">
      <span>${site.job_number ? '<b>Job No:</b> '+escapeHtml(site.job_number) : ''}</span>
      <span style="white-space:nowrap;">${onSite ? `<span class="pill on"><span class="dot"></span>On Site</span>` : `<span class="pill off"><span class="dot"></span>Not checked in</span>`}</span>
    </div>
    <div class="statrow">
      ${(()=>{
        // First tile: the client details. Managers can tap through to edit
        // them; operatives see the same tile read-only. Anyone signed in as
        // the client keeps "Tasks done" here instead.
        const mgr = isManager(ME), clientUser = isClient(ME);
        const line = 'font-size:11px;line-height:1.35;color:var(--ink);text-transform:none;letter-spacing:0;font-weight:500;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const hasClient = site.client_name || site.client_contact_name || site.client_phone;
        const clientTile = `
        <div class="stat" ${mgr ? `style="cursor:pointer;" onclick="go('#/site/${siteId}/client-info')"` : ''}>
          ${hasClient ? `
            <div style="${line}"><strong>Client:</strong> ${escapeHtml(site.client_name||'—')}</div>
            <div style="${line}"><strong>Contact:</strong> ${[site.client_contact_name, site.client_phone].filter(Boolean).map(escapeHtml).join(' · ')||'—'}</div>
          ` : `<div style="font-size:12px;color:var(--slate-light);font-weight:700;">${mgr ? 'Add client info' : 'No client info yet'}</div>`}
        </div>`;
        const tasksTile = `<div class="stat" style="cursor:pointer;" onclick="go('#/site/${siteId}/schedule')"><b>${scheduleDone}/${tasks.length}</b><span>Tasks done</span></div>`;
        const calTile = `<div class="stat calstat" style="cursor:pointer;" onclick="go('#/site/${siteId}/calendar')" title="${escapeHtml(todayCalLabel)}"><b>${todayDateLabel}</b><span>${escapeHtml(todayCalLabel)}</span></div>`;
        const snagsTile = `<div class="stat" style="cursor:pointer;" onclick="go('#/site/${siteId}/snagging/list')"><b style="${openSnags.length?'color:var(--warn);':''}">${openSnags.length}</b><span>Open snags</span></div>`;
        // Managers: when there are no open snags, the third tile shows who's on site instead.
        const onSiteTile = `<div class="stat" style="cursor:pointer;" onclick="go('#/site/${siteId}/checkin')"><b style="${onSiteCount?'color:var(--ok);':''}">${onSiteCount}</b><span>On site now</span></div>`;
        if(mgr) return clientTile + calTile + (openSnags.length ? snagsTile : onSiteTile);
        if(clientUser) return tasksTile + calTile + snagsTile;
        // Operatives: client details, calendar, then tasks done.
        return clientTile + calTile + tasksTile;
      })()}
    </div>
    ${(()=>{
      // The 2-column tile grid below Check-in (which is always full-width)
      // ends up with an odd tile count whenever the Price tile — or the To
      // Do List tile, or both — gets added on top of the fixed 7 (or is
      // simply 7 to begin with, for an operative with no price access).
      // An odd count leaves the last tile sat alone in a half-empty row, so
      // whichever tile actually lands last gets stretched to fill the row
      // instead — computed here from the real tile count, not hardcoded to
      // any particular tile (Price, To Do, or whatever the set happens to
      // end with for this viewer).
      const regularTiles = [
        `<div class="tile" onclick="go('#/site/${siteId}/schedule')">
          <div class="icon" style="background:var(--blue-bg);color:var(--blue);">📋</div>
          <div class="lbl">Schedule of Works</div><div class="sub">${scheduleDone} of ${tasks.length} done</div>
        </div>`,
        `<div class="tile" onclick="go('#/site/${siteId}/hs')">
          <div class="icon" style="background:#E7E9EE;color:var(--ink);">📄</div>
          <div class="lbl">Health &amp; Safety</div><div class="sub">${pendingRams} to sign</div>
          ${isManager(ME) ? (hsOperativeGap?`<span class="badge-count" title="An operative still needs to sign RAMS/COSHH">!</span>`:'') : (pendingRams?`<span class="badge-count">${pendingRams}</span>`:'')}
        </div>`,
        `<div class="tile" onclick="go('#/site/${siteId}/drawings')">
          <div class="icon" style="background:#E7EFEA;color:#2F6B4A;">✏️</div>
          <div class="lbl">Drawings, Spec's &amp; Programme</div><div class="sub">View &amp; upload</div>
        </div>`,
        `<div class="tile" onclick="go('#/site/${siteId}/materials')">
          <div class="icon" style="background:var(--ok-bg);color:var(--ok);">🧱</div>
          <div class="lbl">${materialsTileLabel()}</div><div class="sub">${pendingMat.length} pending</div>
        </div>`,
        `<div class="tile" onclick="go('#/site/${siteId}/snagging')">
          <div class="icon" style="background:var(--warn-bg);color:var(--warn);">🏷</div>
          <div class="lbl">${escapeHtml(snaggingFolderLabel())}</div><div class="sub">${openSnags.length} open</div>
          ${openSnags.length?`<span class="badge-count">${openSnags.length}</span>`:''}
        </div>`,
      ];
      // Schedule of Works always holds position 2 overall (top left, right
      // after the wide Check In/Out tile) — Main Contractor used to be
      // unshifted in front of it, bumping it to third whenever a site was
      // switched on as main contractor. It slots in straight after instead.
      if(site.acting_as_main_contractor) regularTiles.splice(1, 0, `<div class="tile" onclick="go('#/site/${siteId}/mc')">
          <div class="icon" style="background:#E7E9EE;color:var(--ink);">🏗</div>
          <div class="lbl">Main Contractor</div><div class="sub">${mcAreaCount} area${mcAreaCount===1?'':'s'}</div>
        </div>`);
      // Messages/Inbox is reached via the bottom bar only now — no separate
      // Home tile (it was a duplicate entry point, see the bottom tabbar).
      if(canSeePrice) regularTiles.push(`<div class="tile" onclick="go('#/site/${siteId}/price')">
          <div class="icon" style="background:#FFF3D9;color:#8A6300;">💷</div>
          <div class="lbl">Price</div><div class="sub">${pendingVariationCount ? pendingVariationCount+' variation'+(pendingVariationCount>1?'s':'')+' pending' : 'Restricted access'}</div>
          ${pendingVariationCount?`<span class="badge-count">${pendingVariationCount}</span>`:''}
        </div>`);
      if(isManager(ME)) regularTiles.push(`<div class="tile" onclick="go('#/site/${siteId}/todos')">
          <div class="icon" style="background:#EFEAFB;color:#5B3FA6;">✅</div>
          <div class="lbl">To Do List</div><div class="sub">${openTodos.length ? openTodos.length+' open' : 'Nothing outstanding'}</div>
        </div>`);
      // Operatives no longer gets its own Home tile — it's reached via the
      // Health & Safety tile/hub instead (renderHealthSafety already lists
      // an "Operatives" tile alongside RAMS/COSHH/etc).
      // Calendar lands 2nd-to-last, computed off the real final tile count
      // (Price/To Do List are conditional above) rather than a fixed index.
      regularTiles.splice(Math.max(0, regularTiles.length-1), 0, `<div class="tile" onclick="go('#/site/${siteId}/calendar')">
          <div class="icon" style="background:#E4EEFB;color:var(--blue);">📅</div>
          <div class="lbl">Calendar</div><div class="sub">Key dates</div>
        </div>`);
      if(regularTiles.length % 2 === 1){
        // A stretched tile might already carry its own style="..." (the
        // Main Contractor tiles do, for their ⋮ menu positioning) — merge
        // into that existing attribute rather than bolting on a second
        // style="" (a duplicate attribute, which HTML silently drops).
        const lastIdx = regularTiles.length-1;
        regularTiles[lastIdx] = regularTiles[lastIdx].replace(/class="tile"(\s+style="([^"]*)")?/, (m, stylePart, styleVal)=>
          stylePart ? `class="tile" style="${styleVal}grid-column:1 / -1;"` : `class="tile" style="grid-column:1 / -1;"`
        );
      }
      return `
    <div class="tilegrid hometiles" style="margin-bottom:-16px;">
      <div class="tile tile-wide" onclick="go('#/site/${siteId}/checkin')">
        <div class="icon" style="background:var(--red);color:#fff;">⏱</div>
        <div><div class="lbl">Check In / Out</div><div class="sub">Tap to log time</div></div>
      </div>
      ${regularTiles.join('')}
    </div>
      `;
    })()}
    <div style="display:flex;align-items:center;justify-content:center;gap:5px;padding:0 12px;margin-top:26px;">
      <span class="stub" style="margin:0;">${escapeHtml(ME.name)}</span>
      ${(ORG && ORG.name) ? `<span class="stub" style="margin:0;">-</span><span class="stub" style="margin:0;">${escapeHtml(ORG.name)}</span>` : ''}
    </div>
  `, {title:site.name, titleIsSiteName:true, subtitle:fullSiteAddress(site), back:'#/sites', siteId, activeTab:'home'});
    requestAnimationFrame(function(){ equalizeStatusStripWidths(); fitTileLabelsOneLine(); });
  }
}
