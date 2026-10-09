/* ================= ASSIGN TEAM (per-site — PM allocates operatives to this job) ================= */
async function renderAssignTeam(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  // Everything this page needs is asked for at once.
  const __mc = !!(site && site.acting_as_main_contractor);
  const __pSubCompanies = __mc ? dbSelect('subcontractor_companies', 'site_id=eq.'+siteId+'&order=created_at.asc') : Promise.resolve([]);
  const __pSubOps = __mc ? dbSelect('subcontractor_operatives', 'site_id=eq.'+siteId+'&select=*') : Promise.resolve([]);
  const __pActivity = Promise.resolve([]); // the Activity History now has its own screen (renderSiteActivity)
  const __pMain = Promise.all([
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
    dbSelect('onedrive_connections', 'org_id=eq.'+ME.org_id+'&select=access_token'),
    dbSelect('site_sub_addresses', 'site_id=eq.'+siteId+'&order=name.asc'),
  ]);
  await loadAllProfiles();
  const operatives = Object.values(PROFILES).filter(p=>p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  const clients = Object.values(PROFILES).filter(p=>p.role==='client').sort((a,b)=>a.name.localeCompare(b.name));
  const siteManagerPeople = Object.values(PROFILES).filter(p=>p.role==='site_manager').sort((a,b)=>a.name.localeCompare(b.name));
  const [assigned, odConnRows, subAddresses] = await __pMain;
  const assignedIds = new Set(assigned.map(a=>a.user_id));
  const odCompanyConnected = odConnRows.length>0 && !!odConnRows[0].access_token;
  // Quick multi-tick "Assign Operatives to X" per subcontractor, right here
  // on Settings & Admin, so a PM doesn't have to go via Subcontractors > the
  // company > Operatives (one-at-a-time) just to build a crew list. Only
  // fetched when this site is acting as a Main Contractor, since that's the
  // only time subcontractor companies exist at all.
  const subCompanies = await __pSubCompanies;
  let subOpByCompany = {};
  if(subCompanies.length){
    const allSubOps = await __pSubOps;
    allSubOps.forEach(r=>{ (subOpByCompany[r.subcontractor_company_id] = subOpByCompany[r.subcontractor_company_id]||new Map()).set(r.user_id, r); });
  }
  // Cached for toggleSubAddrForm() to pull an address's current values into
  // the edit form without a second round-trip.
  assignTeamSubAddresses = subAddresses;
  // Only fetched once the Activity Log section is actually opened — it's a
  // deletion/closure audit trail, not something every visit to this page needs.
  const activityLog = await __pActivity;

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${isFullManager(ME) ? `
    <p class="ddrow" style="margin-top:0;" onclick="toggleSiteTeamSection('address')"><span class="arrow">${siteTeamSectionOpen.address?'▼':'▶'}</span> Amend Site Name, Address &amp; Job Number</p>
    ${siteTeamSectionOpen.address ? `
    <div class="card">
      <div class="formfield"><label class="field-label">Site Name</label><input type="text" id="editSiteName" value="${escapeHtml(site.name||'')}"></div>
      <div class="formfield"><label class="field-label">Address</label><input type="text" id="editSiteAddress" value="${escapeHtml(site.address||'')}" oninput="applyTitleCase(this)"></div>
      <div class="formfield"><label class="field-label">Postcode</label><input type="text" id="editSitePostcode" value="${escapeHtml(site.postcode||'')}" oninput="applyUpperCase(this)"></div>
      <div class="formfield"><label class="field-label">Job Number</label><input type="text" id="editSiteJobNumber" placeholder="Optional" value="${escapeHtml(site.job_number||'')}"></div>
      <div class="formfield" onclick="openDatePickerRow(this)" style="min-width:0;max-width:100%;"><label class="field-label">Start Date</label><input type="date" id="editSiteStartDate" value="${escapeHtml(site.start_date||'')}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;"></div>
      <button class="darkbtn" onclick="saveSiteAddress('${siteId}')">Save</button>
    </div>
    ` : ''}
    ` : ''}

    <p class="ddrow" style="margin-top:18px;" onclick="toggleSiteTeamSection('maincontractor')"><span class="arrow">${siteTeamSectionOpen.maincontractor?'▼':'▶'}</span> Main Contractor</p>
    ${siteTeamSectionOpen.maincontractor ? `
    <div class="card">
      <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0;"><input type="checkbox" style="width:auto;" ${site.acting_as_main_contractor?'checked':''} ${isFullManager(ME)?'':'disabled'} onchange="toggleMainContractor('${siteId}', this.checked)">Acting as a Main Contractor?</label>
      <p class="stub" style="margin:8px 0 0;">When on, a single "Main Contractor" tile appears on this site's home page (position 2, right after Check In/Out) leading to Construction Phase Plan, Site Rules &amp; Layout, Site Inductions, Subcontractors, Permits To Work, Inspections, Asbestos Register and F10 Notification. Site Rules &amp; Layout also stays reachable from Health &amp; Safety, since it applies to every site.</p>
      <button class="ghostbtn" style="margin-top:10px;" onclick="go('#/site/${siteId}/mc/companylibrary')">📚 Company Library</button>
    </div>
    ` : ''}

    <p class="ddrow" style="margin-top:18px;" onclick="toggleSiteTeamSection('subcontractor')"><span class="arrow">${siteTeamSectionOpen.subcontractor?'▼':'▶'}</span> Subcontractor</p>
    ${siteTeamSectionOpen.subcontractor ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Every subcontractor company's own document library (insurance, accreditations, RAMS templates) lives here — shared across every site that company is added to, so nothing needs re-uploading.</p>
      <button class="ghostbtn" onclick="go('#/site/${siteId}/mc/companylibrary')">📚 Company Library</button>
    </div>
    ` : ''}

    <p class="ddrow" style="margin-top:18px;" onclick="toggleSiteTeamSection('multisite')"><span class="arrow">${siteTeamSectionOpen.multisite?'▼':'▶'}</span> Multi-Site</p>
    ${siteTeamSectionOpen.multisite ? `
    <div class="card">
      <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0;"><input type="checkbox" style="width:auto;" ${site.multi_site?'checked':''} ${isFullManager(ME) && !site.repair_contract ? '' : 'disabled'} onchange="toggleMultiSite('${siteId}', this.checked)">This is a multi-site project (several separate addresses under one job)</label>
      <p class="stub" style="margin:8px 0 0;">${site.repair_contract ? 'Turn off Maintenance / Repair Contract first — a project is one or the other, not both.' : 'When on, Check In becomes per-address with its own GPS geofence, and the Schedule of Works "+" button lets a task be linked to a specific address (or left unlinked and linked later).'}</p>
    </div>
    ${site.multi_site ? `
      <p class="sectiontitle" style="margin-top:14px;">Addresses</p>
      ${subAddresses.map(a=>`
        <div class="card" style="padding:10px 12px;margin-bottom:8px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="min-width:0;">
              <div style="font-weight:700;font-size:13px;">${escapeHtml(a.name)}</div>
              ${a.address||a.postcode ? `<div class="meta" style="margin-top:2px;">${escapeHtml([a.address,a.postcode].filter(Boolean).join(', '))}</div>` : ''}
              <div class="stub" style="margin:4px 0 0;">${a.geofence_lat!=null ? `📍 Geofence set — ${a.geofence_radius_m||100}m radius` : 'No geofence set yet'}</div>
            </div>
            ${rowActionsMenuHtml('subaddr-'+a.id, `
              <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;toggleSubAddrForm('${a.id}')">✎ Edit</div>
              <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;openSubGeoOptions('${a.id}')">📍 ${a.geofence_lat!=null?'Update':'Set'} Geofence</div>
              <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteSubAddress('${siteId}','${a.id}')">🗑 Delete</div>
            `)}
          </div>
          ${a.geofence_lat!=null ? `
            ${geoRadiusRowHtml('geoRadiusSel-'+a.id, a.geofence_radius_m, 'setSubGeofenceRadius', a.id)}
          ` : ''}
        </div>
      `).join('') || `<div class="empty">No addresses added yet.</div>`}
      ${subAddrFormOpen ? `
        <div class="card" style="background:var(--paper);">
          <p class="sectiontitle" style="margin-top:0;">${subAddrEditingId?'Edit Address':'Add Address'}</p>
          <div class="formfield"><input type="text" id="subAddrName" placeholder="e.g. 12 High Street" value="${escapeHtml(subAddrNameDraft)}" oninput="subAddrNameDraft=this.value"></div>
          <div class="formfield"><input type="text" id="subAddrAddress" placeholder="Address (optional)" value="${escapeHtml(subAddrAddressDraft)}" oninput="applyTitleCase(this);subAddrAddressDraft=this.value"></div>
          <div class="formfield"><input type="text" id="subAddrPostcode" placeholder="Postcode (optional)" value="${escapeHtml(subAddrPostcodeDraft)}" oninput="applyUpperCase(this);subAddrPostcodeDraft=this.value"></div>
          <div style="display:flex;gap:8px;">
            <button class="darkbtn" style="flex:1;" onclick="saveSubAddress('${siteId}')">${subAddrEditingId?'Save':'Add Address'}</button>
            <button class="ghostbtn" style="width:auto;padding:10px 16px;" onclick="toggleSubAddrForm()">Cancel</button>
          </div>
        </div>
      ` : `<button class="ghostbtn" onclick="toggleSubAddrForm()">+ Add Address</button>`}
    ` : ''}
    ` : ''}

    <p class="ddrow" style="margin-top:18px;" onclick="toggleSiteTeamSection('repaircontract')"><span class="arrow">${siteTeamSectionOpen.repaircontract?'▼':'▶'}</span> Maintenance / Repair Contract</p>
    ${siteTeamSectionOpen.repaircontract ? `
    <div class="card">
      <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0;"><input type="checkbox" style="width:auto;" ${site.repair_contract?'checked':''} ${isFullManager(ME) && !site.multi_site ? '' : 'disabled'} onchange="toggleRepairContract('${siteId}', this.checked)">This is a Maintenance / Repair Contract (a running list of individual repair jobs, each tracked survey → approval → completion)</label>
      <p class="stub" style="margin:8px 0 0;">${site.multi_site ? 'Turn off Multi-site first — a project is one or the other, not both.' : "When on, this project's Home page becomes its repair jobs list instead of the usual Schedule of Works/Check-in layout."}</p>
    </div>
    ` : ''}
    ${odCompanyConnected && isFullManager(ME) ? `
    <p class="ddrow" style="margin-top:18px;" onclick="toggleSiteTeamSection('sync')"><span class="arrow">${siteTeamSectionOpen.sync?'▼':'▶'}</span> Sync Folder</p>
    ${siteTeamSectionOpen.sync ? `
    <div class="card" style="padding:10px 14px;">
      ${site.onedrive_folder_id ? `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <span class="stub" style="margin:0;font-size:13px;color:var(--ok);">📁 Already synced to "${escapeHtml(site.onedrive_folder_name||'')}"</span>
          <select style="width:auto;flex:none;padding:6px 10px;font-size:13px;" onchange="onedriveFolderAction('${siteId}', this.value); this.selectedIndex=0;">
            <option value="" selected disabled>Folder ▾</option>
            <option value="change">Change folder</option>
            <option value="unlink">Unlink folder</option>
          </select>
        </div>
        <button class="ghostbtn" style="margin-top:8px;" ${siteOdSyncBusy===siteId?'disabled':''} onclick="manualSyncSiteOneDrive('${siteId}')">${siteOdSyncBusy===siteId?'Syncing…':'🔄 Manual Sync (pull new files in, push local files out)'}</button>
        ${site.onedrive_last_synced_at ? `<p class="stub" style="margin:4px 0 0;">Last synced ${new Date(site.onedrive_last_synced_at).toLocaleString('en-GB')}</p>` : ''}
      ` : `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <span class="stub" style="margin:0;font-size:13px;">OneDrive folder not linked</span>
          <button class="ghostbtn" style="padding:5px 12px;font-size:13px;" onclick="startOneDriveFolderPicker('${siteId}')">Choose</button>
        </div>
      `}
    </div>
    ` : ''}
    ` : ''}
    <p class="ddrow" style="margin-top:18px;" onclick="toggleSiteTeamSection('operatives')"><span class="arrow">${siteTeamSectionOpen.operatives?'▼':'▶'}</span> Assign Operatives to RTB</p>
    ${siteTeamSectionOpen.operatives ? `
    <p class="stub" style="margin:0 0 14px;">Only operatives assigned here can see this site. Project Managers and Admins can always see every site; Site Managers need to be assigned like anyone else.</p>
    ${operatives.map(p=>`
      <div class="sitecard" style="padding:7px 9px;gap:8px;">
        <div class="swatch personswatch" style="width:34px;height:34px;flex:0 0 34px;border-radius:8px;font-size:12px;background:linear-gradient(135deg,#4B4F58,#2a2c30);">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name" style="font-size:12px;">${escapeHtml(p.name)}</div><div class="addr" style="font-size:10px;">${escapeHtml(p.email)}</div></div>
        <button class="${assignedIds.has(p.id)?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11.5px;" onclick="toggleAssignment('${siteId}','${p.id}',${assignedIds.has(p.id)})">
          ${assignedIds.has(p.id) ? 'Assigned ✓' : 'Assign'}
        </button>
      </div>
    `).join('') || `<div class="empty">No operatives yet — they need to sign up first.</div>`}
    ` : ''}

    <p class="ddrow" style="margin-top:18px;" onclick="toggleSiteTeamSection('sitemanagers')"><span class="arrow">${siteTeamSectionOpen.sitemanagers?'▼':'▶'}</span> Assign Site Managers</p>
    ${siteTeamSectionOpen.sitemanagers ? `
    <p class="stub" style="margin:0 0 14px;">Unlike a Project Manager, a Site Manager only sees the sites assigned here — assign them to every site they run.</p>
    ${siteManagerPeople.map(p=>`
      <div class="sitecard" style="padding:7px 9px;gap:8px;">
        <div class="swatch personswatch" style="width:34px;height:34px;flex:0 0 34px;border-radius:8px;font-size:12px;background:linear-gradient(135deg,#4B4F58,#2a2c30);">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name" style="font-size:12px;">${escapeHtml(p.name)}</div><div class="addr" style="font-size:10px;">${escapeHtml(p.email)}</div></div>
        <button class="${assignedIds.has(p.id)?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11.5px;" onclick="toggleAssignment('${siteId}','${p.id}',${assignedIds.has(p.id)})">
          ${assignedIds.has(p.id) ? 'Assigned ✓' : 'Assign'}
        </button>
      </div>
    `).join('') || `<div class="empty">No site managers yet — promote someone from Operatives in Admin Centre &gt; Users.</div>`}
    ` : ''}

    ${subCompanies.map(c=>{
      const allocMap = subOpByCompany[c.id] || new Map();
      const open = !!siteSubOperativesOpen[c.id];
      return `
      <p class="ddrow" style="margin-top:18px;" onclick="toggleSiteSubOperatives('${c.id}')"><span class="arrow">${open?'▼':'▶'}</span> Assign Operatives to ${escapeHtml(c.name)}</p>
      ${open ? `
      <p class="stub" style="margin:0 0 14px;">Tick every operative working for ${escapeHtml(c.name)} on this site — an operative can be ticked here as well as under RTB above, if they work both. Ticking here also gives them access to this site if they don't have it already.</p>
      ${operatives.map(p=>{
        const alloc = allocMap.get(p.id);
        return `
        <div class="sitecard" style="padding:7px 9px;gap:8px;">
          <div class="swatch personswatch" style="width:34px;height:34px;flex:0 0 34px;border-radius:8px;font-size:12px;background:linear-gradient(135deg,#4B4F58,#2a2c30);">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
          <div class="info"><div class="name" style="font-size:12px;">${escapeHtml(p.name)}</div><div class="addr" style="font-size:10px;">${escapeHtml(p.email)}</div></div>
          <button class="${alloc?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11.5px;" onclick="toggleSubOperativeAssignment('${siteId}','${c.id}','${jsAttr(c.name)}','${p.id}',${alloc?`'${alloc.id}'`:'null'})">
            ${alloc ? 'Assigned ✓' : 'Assign'}
          </button>
        </div>`;
      }).join('') || `<div class="empty">No operatives yet — they need to sign up first.</div>`}
      ` : ''}
      `;
    }).join('')}

    <p class="ddrow" style="margin-top:18px;" onclick="toggleSiteTeamSection('clients')"><span class="arrow">${siteTeamSectionOpen.clients?'▼':'▶'}</span> Assign Clients</p>
    ${siteTeamSectionOpen.clients ? `
    <p class="stub" style="margin:0 0 14px;">Clients get a read-only view of this site — RAMS, COSHH, Toolbox Talks, Schedule of Works, completed inspections, snagging and the operative dashboard. They can view and export, never sign or edit.</p>
    ${clients.map(p=>`
      <div class="sitecard" style="padding:7px 9px;gap:8px;">
        <div class="swatch personswatch" style="width:34px;height:34px;flex:0 0 34px;border-radius:8px;font-size:12px;background:linear-gradient(135deg,#4B4F58,#2a2c30);">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
        <div class="info"><div class="name" style="font-size:12px;">${escapeHtml(p.name)}</div><div class="addr" style="font-size:10px;">${escapeHtml(p.email)}</div></div>
        <button class="${assignedIds.has(p.id)?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11.5px;" onclick="toggleAssignment('${siteId}','${p.id}',${assignedIds.has(p.id)})">
          ${assignedIds.has(p.id) ? 'Assigned ✓' : 'Assign'}
        </button>
      </div>
    `).join('') || `<div class="empty">No clients yet — invite one from Invites &amp; Users.</div>`}
    ` : ''}

    <p class="ddrow" style="margin-top:18px;" onclick="go('#/operatives?from=${encodeURIComponent('#/site/'+siteId+'/team')}')">👷 Operatives Directory</p>

    ${isFullManager(ME) ? `
    <p class="ddrow" style="margin-top:18px;" onclick="toggleSiteTeamSection('price')"><span class="arrow">${siteTeamSectionOpen.price?'▼':'▶'}</span> Price</p>
    ${siteTeamSectionOpen.price ? `
    <div class="card">
      <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0;"><input type="checkbox" style="width:auto;" ${site.price_enabled?'checked':''} onchange="togglePriceEnabled('${siteId}', this.checked)">This project is on a price</label>
      <p class="stub" style="margin:8px 0 0;">When on, a "Price" tile appears on the site home screen — visible to the project admin and this site's responsible PM always, and to any operative granted access to a Pricing Element from inside the Price tile itself.</p>
    </div>
    ${site.price_enabled ? `
      <p class="stub" style="margin:14px 0 0;">Manage Pricing Elements, price totals, weekly figures and who can see each one from the Price tile on the site home page — "Who can see it" now lives inside each Pricing Element there, since access is granted per element.</p>
    ` : ''}
    ` : ''}
    ` : ''}

    <p class="ddrow" style="margin-top:18px;" onclick="go('#/site/${siteId}/activity')"><span class="arrow">▶</span> Activity History <span class="stub" style="font-weight:400;">· who did what, and when</span></p>

    <p class="sectiontitle" style="margin-top:22px;">Site Info</p>
    <div class="card">
      <p class="stub" style="margin:0;">Created ${site.created_at ? new Date(site.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}${site.created_by ? ' by '+escapeHtml(nameOf(site.created_by)) : ''}</p>
      ${site.status==='closed' ? `
        <p class="stub" style="margin:6px 0 0;">Closed ${site.closed_at ? new Date(site.closed_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}${site.closed_by ? ' by '+escapeHtml(nameOf(site.closed_by)) : ''}</p>
      ` : ''}
    </div>
  `, {title:'Settings & Admin', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, tabs:false}); }
}
let siteTeamSectionOpen = {address:false, sync:false, operatives:false, sitemanagers:false, clients:false, price:false, multisite:false, activity:false, maincontractor:false, subcontractor:false};
window.toggleSiteTeamSection = function(key){ siteTeamSectionOpen[key] = !siteTeamSectionOpen[key]; render(); };
// Per-subcontractor-company "Assign Operatives to X" dropdowns on Settings &
// Admin — keyed by subcontractor_companies.id, separate from siteTeamSectionOpen
// since there can be any number of them.
let siteSubOperativesOpen = {};
window.toggleSiteSubOperatives = function(companyId){ siteSubOperativesOpen[companyId] = !siteSubOperativesOpen[companyId]; render(); };
window.toggleSubOperativeAssignment = async function(siteId, companyId, companyName, userId, allocRowId){
  if(allocRowId){
    const ok = await dbDelete('subcontractor_operatives', allocRowId);
    if(ok){ toast('Removed from '+companyName); subOpCache = {}; render(); }
    return;
  }
  // Same "one subcontractor company per site" rule enforced in the picker
  // under Subcontractors > company > Operatives — an operative can't be
  // allocated to two different companies on the same site at once.
  const existing = await dbSelect('subcontractor_operatives', 'site_id=eq.'+siteId+'&user_id=eq.'+userId+'&select=id,subcontractor_company_id');
  if(existing.length && existing[0].subcontractor_company_id !== companyId){
    toast('Already allocated to a different subcontractor on this site — remove them there first.');
    return;
  }
  const rows = await dbInsert('subcontractor_operatives', {site_id:siteId, subcontractor_company_id:companyId, user_id:userId, assigned_by:ME.id, is_admin:false});
  if(!rows) return;
  // A subcontractor allocation is enough on its own to give site access —
  // no need to separately tick "Assign Operatives to RTB" first, since an
  // operative may work only for the subcontractor, not RTB directly.
  const alreadyOnSite = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&user_id=eq.'+userId+'&select=user_id&limit=1');
  if(!alreadyOnSite.length){
    const siteRows = await dbInsert('site_assignments', {site_id:siteId, user_id:userId, assigned_by:ME.id});
    if(siteRows) notifySiteAssignment(siteId, userId);
  }
  toast('Assigned to '+companyName);
  subOpCache = {};
  render();
};
window.saveSiteAddress = async function(siteId){
  const name = document.getElementById('editSiteName').value.trim();
  const address = document.getElementById('editSiteAddress').value.trim();
  const postcode = document.getElementById('editSitePostcode').value.trim();
  const jobNumber = document.getElementById('editSiteJobNumber').value.trim();
  const startDateEl = document.getElementById('editSiteStartDate');
  const startDate = startDateEl ? startDateEl.value.trim() : '';
  if(!name){ toast('Site name cannot be blank.'); return; }
  const row = await dbUpdate('sites', siteId, {name, address: address||null, postcode: postcode||null, job_number: jobNumber||null, start_date: startDate||null});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast('Details updated');
    render();
  }
};
// Client Info — name, contact number and email for whoever the client
// contact on this job is. Reached from the Client tile on Home (position 1,
// where the PM/admin "Operatives on site" stat used to be). Kept as its own
// page rather than folded into Settings & Admin's "Amend Site Name, Address"
// card so it's a single tap from Home instead of two levels deep.
async function renderClientInfo(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site) return;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="card">
      <div class="formfield"><label class="field-label">Client Name</label><input type="text" id="editClientName" placeholder="Optional" value="${escapeHtml(site.client_name||'')}" oninput="applyTitleCase(this)"></div>
      <div class="formfield"><label class="field-label">Client Contact Name</label><input type="text" id="editClientContactName" placeholder="Optional" value="${escapeHtml(site.client_contact_name||'')}" oninput="applyTitleCase(this)"></div>
      <div class="formfield"><label class="field-label">Client Contact Number</label><input type="tel" id="editClientPhone" placeholder="Optional" value="${escapeHtml(site.client_phone||'')}"></div>
      <div class="formfield"><label class="field-label">Client Contact Email</label><input type="email" id="editClientEmail" placeholder="Optional" value="${escapeHtml(site.client_email||'')}"></div>
      <p class="stub" style="margin:8px 0 0;">When an email address is entered here, a "CC client contact" tick box appears on the app's email pickers (Schedule of Works, Snags, To Do List, Reports and more) so whoever's sending can loop the client in on that same email.</p>
      <button class="darkbtn" style="margin-top:14px;" onclick="saveClientInfo('${siteId}')">Save</button>
    </div>
  `, {title:'Client Info', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, tabs:false}); }
}
window.saveClientInfo = async function(siteId){
  const name = document.getElementById('editClientName').value.trim();
  const contactName = document.getElementById('editClientContactName').value.trim();
  const phone = document.getElementById('editClientPhone').value.trim();
  const email = document.getElementById('editClientEmail').value.trim();
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Enter a valid email address.'); return; }
  const row = await dbUpdate('sites', siteId, {client_name: name||null, client_contact_name: contactName||null, client_phone: phone||null, client_email: email||null});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast('Client info updated');
    go(`#/site/${siteId}/home`);
  }
};
// Same field, reachable straight from the site list's "Starts <date>" chip —
// this is a quick edit shortcut so a PM doesn't have to open full Admin just
// to nudge a start date; it writes the exact same sites.start_date column.
window.changeSiteStartDate = async function(siteId, currentDate){
  const next = await customDatePrompt('Site start date', currentDate);
  if(next===null) return;
  const row = await dbUpdate('sites', siteId, {start_date: next||null});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast('Start date updated');
    render();
  }
};
window.toggleAssignment = async function(siteId, userId, isAssigned){
  if(isAssigned){
    const res = await sbFetch('/rest/v1/site_assignments?site_id=eq.'+siteId+'&user_id=eq.'+userId, {method:'DELETE'});
    if(!res.ok){ toast('Could not remove — '+(await safeErr(res))); return; }
    toast('Removed from site');
  } else {
    const rows = await dbInsert('site_assignments', {site_id:siteId, user_id:userId, assigned_by:ME.id});
    if(!rows) return;
    toast('Assigned to site');
    notifySiteAssignment(siteId, userId);
  }
  render();
};
// Best-effort push+email to an operative just added to a site — never blocks
// or errors out the assignment itself, which has already saved by the time
// this is called. Shared by both assignment entry points (the Settings &
// Admin list, and the first-visit modal below).
async function notifySiteAssignment(siteId, userId){
  try{
    await sbFetch('/functions/v1/notify-site-assignment', {method:'POST', body: JSON.stringify({site_id:siteId, user_id:userId})});
  }catch(e){ /* silent */ }
}
// Best-effort email to whoever a new to-do was just assigned to — the
// in-app system message + push (via postSystemMessage) already goes out to
// all PMs/admins, but this puts it straight in the assignee's inbox too.
// Never blocks or errors out the to-do add itself, which has already saved.
async function notifyTodoAssigned(siteId, todoId, userId){
  try{
    await sbFetch('/functions/v1/notify-todo-assigned', {method:'POST', body: JSON.stringify({site_id:siteId, todo_id:todoId, user_id:userId})});
  }catch(e){ /* silent */ }
}
// #384: first-visit "assign operatives" pop-up, triggered from
// renderSiteHome for a live/active site with zero site_assignments. Same
// multi-tick pattern as the Assign Operatives section on Settings & Admin
// (toggleAssignment's insert/delete), just surfaced as a modal so a PM isn't
// forced to go find that screen before anyone can check in.
let assignOpModalAssignedIds = new Set();
window.openAssignOperativesModal = async function(siteId){
  await loadAllProfiles();
  const operatives = Object.values(PROFILES).filter(p=>p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  const assigned = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
  // Someone may have assigned people (from Settings & Admin, or another tab)
  // in the time it took this to fetch — don't pop up over an already-staffed site.
  if(assigned.length) return;
  assignOpModalAssignedIds = new Set();
  renderAssignOperativesModal(siteId, operatives);
};
function renderAssignOperativesModal(siteId, operatives){
  let ov = document.getElementById('assignOpModalOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'assignOpModalOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.innerHTML = `
    <div class="geo-modal-card" style="max-height:78vh;overflow-y:auto;">
      <p class="sectiontitle" style="margin-top:0;">Assign Operatives</p>
      <p class="stub" style="margin:0 0 12px;">This site is now active — tick everyone working on it. You can change this any time from Settings &amp; Admin.</p>
      ${operatives.length ? operatives.map(p=>`
        <div class="sitecard" style="padding:7px 9px;gap:8px;">
          <div class="swatch personswatch" style="width:34px;height:34px;flex:0 0 34px;border-radius:8px;font-size:12px;background:linear-gradient(135deg,#4B4F58,#2a2c30);">${escapeHtml((p.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</div>
          <div class="info"><div class="name" style="font-size:12px;">${escapeHtml(p.name)}</div></div>
          <input type="checkbox" style="width:20px;height:20px;flex:0 0 20px;" ${assignOpModalAssignedIds.has(p.id)?'checked':''} onchange="toggleAssignOpModal('${siteId}','${p.id}',this.checked)">
        </div>
      `).join('') : `<div class="empty">No operatives yet — they need to sign up first.</div>`}
      <button class="darkbtn" style="width:100%;margin-top:14px;" onclick="document.getElementById('assignOpModalOverlay').style.display='none';">Done</button>
    </div>`;
  ov.style.display = 'flex';
}
window.toggleAssignOpModal = async function(siteId, userId, checked){
  if(checked){
    const rows = await dbInsert('site_assignments', {site_id:siteId, user_id:userId, assigned_by:ME.id});
    if(!rows) return;
    assignOpModalAssignedIds.add(userId);
    notifySiteAssignment(siteId, userId);
  } else {
    const res = await sbFetch('/rest/v1/site_assignments?site_id=eq.'+siteId+'&user_id=eq.'+userId, {method:'DELETE'});
    if(!res.ok){ toast('Could not update — '+(await safeErr(res))); return; }
    assignOpModalAssignedIds.delete(userId);
  }
  toast(checked ? 'Assigned to site' : 'Removed from site');
};
window.toggleMainContractor = async function(siteId, checked){
  const row = await dbUpdate('sites', siteId, {acting_as_main_contractor: checked});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast(checked ? 'Main Contractor tiles enabled' : 'Main Contractor tiles disabled');
    render();
  }
};
window.togglePriceEnabled = async function(siteId, checked){
  const row = await dbUpdate('sites', siteId, {price_enabled: checked});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast(checked ? 'Price tile enabled' : 'Price tile disabled');
    render();
  }
};
// #400/#410: price/build-up entry AND labour-invoice access are granted per
// Pricing Element (site_price_access.element_id / site_labour_invoice_access
// .element_id) rather than once for the whole site — a grant for "Flat
// Roofing" no longer implies "Pitched Roofing" too. Originally these were two
// separate "Who can see it" lists (one per underlying grant table); per the
// user's request they're now a single combined "Select Operatives" picker —
// one tick grants/revokes BOTH the price/build-up grant and the labour-
// invoice grant together for that operative+element. Both tables are kept
// (no further schema change) so RLS policies already scoped to each grant
// keep working unchanged; this function is just the one place that now
// writes to both together. hasAccess is the UNION of the two grants (see
// elementAccessIds in pricingElementCardHtml), so granting always inserts
// into both tables (neither can already have a row) and revoking always
// deletes from both (a delete with no matching row is a harmless no-op) —
// this also self-heals any element left with a mismatched grant from before
// the two lists were combined.
window.toggleElementAccess = async function(elementId, siteId, userId, hasAccess){
  if(hasAccess){
    const [r1, r2] = await Promise.all([
      sbFetch('/rest/v1/site_price_access?element_id=eq.'+elementId+'&user_id=eq.'+userId, {method:'DELETE'}),
      sbFetch('/rest/v1/site_labour_invoice_access?element_id=eq.'+elementId+'&user_id=eq.'+userId, {method:'DELETE'}),
    ]);
    if(!r1.ok || !r2.ok){ toast('Could not remove access'); return; }
    toast('Access removed');
  } else {
    const [rows1, rows2] = await Promise.all([
      dbInsert('site_price_access', {site_id:siteId, element_id:elementId, user_id:userId, granted_by:ME.id}),
      dbInsert('site_labour_invoice_access', {site_id:siteId, element_id:elementId, user_id:userId, granted_by:ME.id}),
    ]);
    if(!rows1 || !rows2){ toast('Could not grant access'); return; }
    toast('Access granted');
  }
  render();
};
// Bulk version of the grant half of toggleElementAccess above — used by
// Price Sheet to carry the operatives ticked on the sheet itself straight
// through to the Pricing Element's access list the moment the sheet is
// issued, instead of making the PM open "Select Operatives" separately
// afterwards. Silently skips anyone who already has the grant (e.g. issuing
// a second sheet into the same element) rather than erroring on a duplicate.
async function grantElementAccessBulk(elementId, siteId, userIds){
  if(!userIds || !userIds.length) return;
  const [existingPrice, existingLabour] = await Promise.all([
    dbSelect('site_price_access', 'element_id=eq.'+elementId+'&select=user_id'),
    dbSelect('site_labour_invoice_access', 'element_id=eq.'+elementId+'&select=user_id'),
  ]);
  const havePrice = new Set(existingPrice.map(r=>r.user_id));
  const haveLabour = new Set(existingLabour.map(r=>r.user_id));
  const priceRows = userIds.filter(uid=>!havePrice.has(uid)).map(uid=>({site_id:siteId, element_id:elementId, user_id:uid, granted_by:ME.id}));
  const labourRows = userIds.filter(uid=>!haveLabour.has(uid)).map(uid=>({site_id:siteId, element_id:elementId, user_id:uid, granted_by:ME.id}));
  await Promise.all([
    priceRows.length ? dbInsert('site_price_access', priceRows) : Promise.resolve([]),
    labourRows.length ? dbInsert('site_labour_invoice_access', labourRows) : Promise.resolve([]),
  ]);
}
// Operatives assigned to a site, for the "who's this for" tick-list in Price
// Builder (replaces the old free-text Subcontractor field) — same roster
// the Pricing Element's own "Select Operatives" picker draws from.
async function siteAssignedOperatives(siteId){
  await loadAllProfiles();
  const rows = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
  return rows.map(r=>PROFILES[r.user_id]).filter(p=>p && p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
}
