/* ================= HEALTH & SAFETY (folder: RAMS + COSHH + Toolbox Talks) ================= */
async function renderHealthSafety(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(isClient(ME)){
    const [ramsRows, coshhRows, liveTbts] = await Promise.all([
      // subcontractor_company_id=is.null on all three — same fix as
      // fetchRamsData/fetchCoshhData: subcontractor-specific docs are scoped
      // to their own tile, not RTB's main Health & Safety counts.
      dbSelect('rams_docs', 'site_id=eq.'+siteId+'&status=eq.current&subcontractor_company_id=is.null&select=id'),
      dbSelect('coshh_docs', 'site_id=eq.'+siteId+'&subcontractor_company_id=is.null&select=id'),
      dbSelect('toolbox_talks', 'site_id=eq.'+siteId+'&status=eq.live&subcontractor_company_id=is.null&select=id'),
    ]);
    if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
      <div class="tilegrid hstiles" style="grid-auto-rows:1fr;">
        <div class="tile" onclick="go('#/site/${siteId}/hs/rams')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">📄</div><div class="lbl">RAMS</div><div class="sub">${ramsRows.length} document${ramsRows.length===1?'':'s'}</div></div>
        <div class="tile" onclick="go('#/site/${siteId}/hs/coshh')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">🧪</div><div class="lbl">COSHH</div><div class="sub">${coshhRows.length} document${coshhRows.length===1?'':'s'}</div></div>
        <div class="tile" onclick="go('#/site/${siteId}/hs/tbt')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">📢</div><div class="lbl">TBT</div><div class="sub">${liveTbts.length} live</div></div>
        <div class="tile" onclick="go('#/site/${siteId}/hs/puwer')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">🛠</div><div class="lbl">Completed Inspections</div><div class="sub">PUWER</div></div>
        <div class="tile" onclick="go('#/site/${siteId}/hs/operatives')"><div class="icon" style="background:#E7E9EE;color:var(--ink);">👷</div><div class="lbl">Operative Dashboard</div><div class="sub">Roster &amp; certificates</div></div>
      </div>
    `, {title:'Health & Safety', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, activeTab:'more'}); }
    return;
  }
  // 2026-10-03: this page used to make about ten round trips one after
  // another before drawing anything — including fetching RAMS and COSHH
  // twice each, and the site-layout and H&S policy data whose results were
  // never shown. It is now two waves: everything independent together, then
  // the signature checks that need the first wave's document ids.
  // (The RAMS query also now excludes subcontractor RAMS, same as the RAMS
  // page itself — they used to inflate the badge here with documents that
  // can't be signed from the main RAMS page.)
  const mgr = isManager(ME);
  const [ramsCurrentRows, coshhCurrentRows, liveTbt, briefingTemplates, incidentCount, ppeRows, assignedRows] = await Promise.all([
    dbSelect('rams_docs', 'site_id=eq.'+siteId+'&status=eq.current&subcontractor_company_id=is.null&select=id,resign_cycle_start,uploaded_at'),
    dbSelect('coshh_docs', 'site_id=eq.'+siteId+'&subcontractor_company_id=is.null&select=id,resign_cycle_start,uploaded_at'),
    dbSelect('toolbox_talks', 'site_id=eq.'+siteId+'&status=eq.live&subcontractor_company_id=is.null&select=id,title'),
    dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&is_daily_briefing=eq.true&archived=eq.false&select=id'),
    dbSelect('incident_reports', 'site_id=eq.'+siteId+'&select=id'),
    mgr ? dbSelect('ppe_requests', 'site_id=eq.'+siteId+'&status=eq.pending&select=id')
        : dbSelect('ppe_issuances', 'user_id=eq.'+ME.id+'&status=eq.pending_signature&select=id'),
    mgr ? dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : Promise.resolve([]),
    mgr ? loadAllProfiles() : Promise.resolve(),
  ]);
  const pendingRamsRows = ramsCurrentRows, pendingCoshhRows = coshhCurrentRows;
  async function pendingSignCount(table, docKeyField, docRows){
    if(!docRows.length) return 0;
    const ids = docRows.map(d=>d.id).join(',');
    const mySigs = await dbSelect(table, 'user_id=eq.'+ME.id+'&'+docKeyField+'=in.('+ids+')&select='+docKeyField+',signed_at');
    const validSigs = filterCurrentCycleSigs(mySigs, docRows, docKeyField, site);
    return docRows.length - new Set(validSigs.map(s=>s[docKeyField])).size;
  }
  const operativeIds = mgr ? assignedRows.map(r=>r.user_id).filter(uid=>PROFILES[uid] && PROFILES[uid].role==='operative') : [];
  const [ramsUnsignedCount, coshhUnsignedCount, ramsOperativeGap, coshhOperativeGap, briefings] = await Promise.all([
    mgr ? 0 : pendingSignCount('rams_signatures', 'rams_id', ramsCurrentRows),
    mgr ? 0 : pendingSignCount('coshh_signatures', 'coshh_id', coshhCurrentRows),
    operativeIds.length ? anyOperativeMissingSignature('rams_signatures', 'rams_id', ramsCurrentRows, site, operativeIds) : false,
    operativeIds.length ? anyOperativeMissingSignature('coshh_signatures', 'coshh_id', coshhCurrentRows, site, operativeIds) : false,
    briefingTemplates.length ? dbSelect('report_submissions', 'site_id=eq.'+siteId+'&template_id=in.('+briefingTemplates.map(t=>t.id).join(',')+')&select=id') : Promise.resolve([]),
  ]);
  const briefingSub = briefings.length ? `${briefings.length} briefing${briefings.length===1?'':'s'}` : 'None yet';
  const ppeTileCount = ppeRows.length;
  const ppeTileSub = mgr ? (ppeRows.length ? ppeRows.length+' request'+(ppeRows.length===1?'':'s') : 'Issue & track PPE')
                         : (ppeRows.length ? ppeRows.length+' to sign' : 'My PPE');
  const ramsBadge = isManager(ME) ? (ramsOperativeGap?`<span class="badge-count" title="An operative still needs to sign">!</span>`:'') : (ramsUnsignedCount?`<span class="badge-count">${ramsUnsignedCount}</span>`:'');
  const coshhBadge = isManager(ME) ? (coshhOperativeGap?`<span class="badge-count" title="An operative still needs to sign">!</span>`:'') : (coshhUnsignedCount?`<span class="badge-count">${coshhUnsignedCount}</span>`:'');
  const hsTiles = [
    ['hs_rams', {href:`#/site/${siteId}/hs/rams`, icon:'📄', bg:'#E7E9EE', fg:'var(--ink)', label:'RAMS', sub:`${pendingRamsRows.length} document${pendingRamsRows.length===1?'':'s'}`, badge:ramsBadge}],
    ['hs_coshh', {href:`#/site/${siteId}/hs/coshh`, icon:'🧪', bg:'#E7E9EE', fg:'var(--ink)', label:'COSHH', sub:`${pendingCoshhRows.length} document${pendingCoshhRows.length===1?'':'s'}`, badge:coshhBadge}],
    ['hs_tbt', {href:`#/site/${siteId}/hs/tbt`, icon:'🗣', bg:'var(--blue-bg)', fg:'var(--blue)', label:'TBT', sub:liveTbt.length ? 'Live now' : 'None live'}],
    ['hs_briefings', {href:`#/site/${siteId}/hs/briefings`, icon:'📣', bg:'#FDECEA', fg:'var(--brand1)', label:'Daily Briefings', sub:briefingSub}],
    ['hs_havspuwer', {href:`#/site/${siteId}/hs/havspuwer`, icon:'🖐', bg:'#FFF3E0', fg:'#B85C00', label:'Tools, HAVS &amp; PUWER', sub:'Tools, vibration &amp; tool checks'}],
    ['hs_ppe', {href:`#/site/${siteId}/ppe`, icon:'🦺', bg:'#FDECEA', fg:'#B4231A', label:'PPE', sub:ppeTileSub, badge: ppeTileCount?`<span class="badge-count">${ppeTileCount}</span>`:''}],
    ['hs_incidents', {href:`#/site/${siteId}/hs/incidents`, icon:'⚠️', bg:'#FDECEA', fg:'#B4231A', label:'Accident / Incident', sub: incidentCount.length ? incidentCount.length+' filed' : 'Report near miss'}],
    ['hs_operatives', {href:`#/site/${siteId}/hs/operatives`, icon:'🪪', bg:'#E8F0FE', fg:'#1A56B0', label:'Operatives', sub:'Dashboard &amp; certifications'}],
  ];
  const hsHtml = hsTiles.map(([k,t])=>visTileHtml(site, k, t)).join('');
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid hstiles" style="grid-auto-rows:1fr;">
      ${hsHtml || `<div class="empty" style="grid-column:1/-1;">Nothing here for you on this job.</div>`}
    </div>
  `, {title:'Health & Safety', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, activeTab:'more'}); }
}
// HAVS and PUWER share one tile on the Health & Safety page now — this is
// just a small picker in between, matching the existing tile visual style,
// so both stay their own full pages underneath (routes unchanged).
async function renderHavsPuwer(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  // My Tools moved here (operatives only) as its own sub-tile — a badge
  // stays on it until at least one tool has been added, same "keep nagging
  // until done" pattern as the RAMS/COSHH/PPE badges.
  let myToolCount = 0;
  if(!isManager(ME)){
    const tools = await dbSelect('operative_tools', 'user_id=eq.'+ME.id+'&select=id');
    myToolCount = tools.length;
  }
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid" style="grid-auto-rows:1fr;">
      ${!isManager(ME) ? `
      <div class="tile" onclick="go('#/operative-dashboard')">
        <div class="icon" style="background:#E8F0FE;color:#1A56B0;">🔧</div>
        <div class="lbl">My Tools</div><div class="sub">${myToolCount ? myToolCount+' tool'+(myToolCount===1?'':'s') : 'Add your tools'} — now in My Dashboard</div>
        ${myToolCount?'':'<span class="badge-count">!</span>'}
      </div>
      ` : ''}
      <div class="tile" onclick="go('#/site/${siteId}/hs/havs')">
        <div class="icon" style="background:#FFF3E0;color:#B85C00;">🖐</div>
        <div class="lbl">HAVS</div><div class="sub">Vibration exposure</div>
      </div>
      <div class="tile" onclick="go('#/site/${siteId}/hs/puwer')">
        <div class="icon" style="background:#E8F0FE;color:#1A56B0;">🛠</div>
        <div class="lbl">PUWER Tool Inspection</div><div class="sub">Weekly tool checks</div>
      </div>
      <div class="tile" onclick="go('#/site/${siteId}/hs/loler')">
        <div class="icon" style="background:#F3EAFB;color:#6A2E99;">⛓</div>
        <div class="lbl">LOLER Inspection</div><div class="sub">Lifting equipment</div>
      </div>
    </div>
  `, {title:'Tools, HAVS & PUWER', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs`, siteId, activeTab:'more'}); }
}
