/* ================= OUTSTANDING TASKS (Home bottom bar — everyone, scoped to their own sites) ================= */
// A lighter, personal, site-by-site version of the admin Dashboard's
// outstanding-items lists — reachable by every role from the Home screen's
// bottom bar, not just admins. Managers see everyone's outstanding items
// across every live site; operatives see only their own, on sites they're
// assigned to.
let outstandingPmId = null; // company admin only — null = "my own", else a specific PM's id
let outstandingFilterType = 'all'; // operative-facing Outstanding page: 'all'|'rams'|'coshh'|'tbt'
// Shared by renderOutstandingTasks (the actual page) and
// computeMyOutstandingCount (the home-bar badge) so the two can never drift
// out of sync again — see the note on computeMyOutstandingCount above.
// `viewingPmId` is who the rows are FOR: for a manager it's whichever PM's
// sites to show (an admin can view any PM's; a plain PM only ever sees
// their own — `forId` below is ignored for them); for an operative it's
// unused, they only ever see their own assigned sites.
async function computeOutstandingRows(forId){
  const manager = isManager(ME);
  const isAdmin = ME.role==='admin';
  const viewingPmId = isAdmin ? (forId || ME.id) : ME.id;
  let sites;
  if(isAdmin || manager){
    // A PM's outstanding items shouldn't only be the sites they're marked
    // "responsible" for — a PM who's simply assigned to a site (via
    // site_assignments, e.g. covering RAMS/COSHH there) needs to see their
    // own outstanding signatures on it too, even if someone else is listed
    // as the responsible PM of record.
    const targetPmId = isAdmin ? viewingPmId : ME.id;
    const myPmAssignments = await dbSelect('site_assignments', 'user_id=eq.'+targetPmId+'&select=site_id');
    const myPmSiteIds = new Set(myPmAssignments.map(a=>a.site_id));
    sites = SITES.filter(s=>siteStatusKey(s)==='live' && (s.responsible_pm_id===targetPmId || myPmSiteIds.has(s.id)));
  } else {
    const assignments = await dbSelect('site_assignments', 'user_id=eq.'+ME.id+'&select=site_id');
    const ids = new Set(assignments.map(a=>a.site_id));
    sites = SITES.filter(s=>ids.has(s.id) && siteStatusKey(s)==='live');
  }
  const siteIds = sites.map(s=>s.id);
  const idsCsv = siteIds.join(',');
  const [ramsDocs, coshhDocs, liveTbts] = await Promise.all([
    // #(outstanding-resign-cycle-fix): must select resign_cycle_start/
    // uploaded_at too — filterCurrentCycleSigs() below needs them to work out
    // each doc's current sign-off cycle. Without them every doc's cycle start
    // came back as `undefined`, resignCycleStart() fell through to
    // `new Date(undefined)` (Invalid Date), and comparing any real signed_at
    // against an Invalid Date is always false in JS — so EVERY signature got
    // filtered out here, and every roster member showed as still-missing
    // forever, even right after they signed. This is why the Outstanding
    // page/badge could say "RAMS to sign (1)" for a site whose RAMS page
    // itself showed "signed by all operatives": the RAMS page's own fetch
    // (fetchRamsData) already selected these columns and was never affected.
    // subcontractor_company_id=is.null — a subcontractor's own RAMS/COSHH/
    // TBT (uploaded via renderSubRams/renderSubCoshh/renderSubTbt, same
    // tables) must never count towards RTB's own outstanding-signature
    // totals here; they're scoped to that subcontractor's own operatives.
    idsCsv ? dbSelect('rams_docs', 'status=eq.current&site_id=in.('+idsCsv+')&subcontractor_company_id=is.null&select=id,site_id,uploaded_at,resign_cycle_start') : Promise.resolve([]),
    idsCsv ? dbSelect('coshh_docs', 'site_id=in.('+idsCsv+')&subcontractor_company_id=is.null&select=id,site_id,uploaded_at,resign_cycle_start') : Promise.resolve([]),
    // Live TBTs count as outstanding for OPERATIVES personally (they need to
    // sign) — this used to only live in the old computeMyOutstandingCount
    // and never showed on the Outstanding page itself, so an operative's
    // badge could show a number with nothing to click through to. Folding it
    // in here fixes that mismatch.
    (!manager && idsCsv) ? dbSelect('toolbox_talks', 'status=eq.live&site_id=in.('+idsCsv+')&subcontractor_company_id=is.null&select=id,site_id') : Promise.resolve([]),
  ]);
  const ramsIds = ramsDocs.map(d=>d.id).join(',');
  const coshhIds = coshhDocs.map(d=>d.id).join(',');
  const tbtIds = liveTbts.map(t=>t.id).join(',');
  const sigFilter = manager ? '' : ('&user_id=eq.'+ME.id);
  const [ramsSigsRaw, coshhSigsRaw, tbtSigsRaw, assignments, scheduleTasks, openSnags, pendingMaterials] = await Promise.all([
    ramsIds ? dbSelect('rams_signatures', 'rams_id=in.('+ramsIds+')'+sigFilter+'&select=rams_id,user_id,signed_at') : Promise.resolve([]),
    coshhIds ? dbSelect('coshh_signatures', 'coshh_id=in.('+coshhIds+')'+sigFilter+'&select=coshh_id,user_id,signed_at') : Promise.resolve([]),
    tbtIds ? dbSelect('toolbox_talk_signatures', 'tbt_id=in.('+tbtIds+')'+sigFilter+'&select=tbt_id,user_id') : Promise.resolve([]),
    manager && idsCsv ? dbSelect('site_assignments', 'site_id=in.('+idsCsv+')&select=site_id,user_id') : Promise.resolve([]),
    manager && idsCsv ? dbSelect('schedule_tasks', 'site_id=in.('+idsCsv+')&status=neq.done&select=site_id') : Promise.resolve([]),
    manager && idsCsv ? dbSelect('snags', 'site_id=in.('+idsCsv+')&status=eq.open&select=site_id') : Promise.resolve([]),
    // "Material requests pending" should stay up on the Dashboard/Home/tile
    // through the whole in-flight lifecycle — not just while a request is
    // freshly raised (status=pending), but also once a PM has sent it to a
    // supplier (status=sent) — until it's actually received and a PM taps
    // "Close request". Only closed/cancelled requests should stop counting.
    manager && idsCsv ? dbSelect('materials', 'status=in.(pending,sent)&site_id=in.('+idsCsv+')&select=id,site_id') : Promise.resolve([]),
  ]);
  const ramsSigsCur = filterCurrentCycleSigs(ramsSigsRaw, ramsDocs, 'rams_id', {status:'active'});
  const coshhSigsCur = filterCurrentCycleSigs(coshhSigsRaw, coshhDocs, 'coshh_id', {status:'active'});
  const rosterBySite = {};
  assignments.forEach(a=>{ (rosterBySite[a.site_id]=rosterBySite[a.site_id]||[]).push(a.user_id); });
  // #327: PMs/admins can't sign COSHH (#237), so an assigned PM/admin must
  // not sit in the roster COSHH is checked against — otherwise they show up
  // as permanently unsigned (they structurally can't sign) and the PM
  // Outstanding tab never clears down / never matches what the COSHH page
  // itself shows. RAMS keeps the everyone-included roster since PMs can
  // still sign RAMS.
  const operativeRosterBySite = {};
  assignments.forEach(a=>{ if(PROFILES[a.user_id] && PROFILES[a.user_id].role==='operative') (operativeRosterBySite[a.site_id]=operativeRosterBySite[a.site_id]||[]).push(a.user_id); });
  const tasksBySite = {}; scheduleTasks.forEach(t=>{ tasksBySite[t.site_id] = (tasksBySite[t.site_id]||0)+1; });
  const snagsBySite = {}; openSnags.forEach(s=>{ snagsBySite[s.site_id] = (snagsBySite[s.site_id]||0)+1; });
  const materialsBySite = {}; pendingMaterials.forEach(m=>{ materialsBySite[m.site_id] = (materialsBySite[m.site_id]||0)+1; });
  // RAMS/COSHH are only "complete" once every operative assigned to the
  // site has signed the current document — for managers this counts every
  // still-missing (site, operative, doc) combination, not just per-doc.
  function unsignedCount(siteId, docs, sigs, fk, rosterMap){
    const docsHere = docs.filter(d=>d.site_id===siteId);
    if(manager){
      const roster = (rosterMap||rosterBySite)[siteId]||[];
      const signedByDoc = {};
      sigs.forEach(s=>{ (signedByDoc[s[fk]]=signedByDoc[s[fk]]||new Set()).add(s.user_id); });
      let missing = 0;
      docsHere.forEach(d=>{ missing += roster.filter(uid=>!(signedByDoc[d.id]||new Set()).has(uid)).length; });
      return missing;
    }
    const signedIds = new Set(sigs.map(s=>s[fk]));
    return docsHere.filter(d=>!signedIds.has(d.id)).length;
  }
  const rows = sites.map(s=>{
    const rams = unsignedCount(s.id, ramsDocs, ramsSigsCur, 'rams_id');
    const coshh = unsignedCount(s.id, coshhDocs, coshhSigsCur, 'coshh_id', operativeRosterBySite);
    // TBT is a personal "you need to sign this" item, not a manager
    // roster-completion metric (managers already get a live-TBT nudge via
    // the site's TBT tile/notify-outstanding, so it's kept out of their
    // Outstanding list to avoid double-counting the same thing two ways).
    const tbt = manager ? 0 : unsignedCount(s.id, liveTbts, tbtSigsRaw, 'tbt_id');
    const tasks = tasksBySite[s.id]||0;
    const snags = snagsBySite[s.id]||0;
    const materialsPending = materialsBySite[s.id]||0;
    const items = [];
    if(rams) items.push({lbl:`RAMS to sign (${rams})`, href:`#/site/${s.id}/hs/rams`, type:'rams'});
    if(coshh) items.push({lbl:`COSHH to sign (${coshh})`, href:`#/site/${s.id}/hs/coshh`, type:'coshh'});
    if(tbt) items.push({lbl:`Toolbox Talk to sign (${tbt})`, href:`#/site/${s.id}/hs/tbt`, type:'tbt'});
    if(manager && materialsPending) items.push({lbl:`Material requests pending (${materialsPending})`, href:`#/site/${s.id}/materials`, type:'materials'});
    if(manager && tasks) items.push({lbl:`Schedule tasks open (${tasks})`, href:`#/site/${s.id}/schedule`, type:'task'});
    if(manager && snags) items.push({lbl:`Open snags (${snags})`, href:`#/site/${s.id}/snagging/list`, type:'snag'});
    return {site:s, items};
  }).filter(r=>r.items.length);
  return {rows, manager, isAdmin};
}
// A PM/admin's own personal "Notifications" feed — replaces the old
// Outstanding tab for managers (operatives still get the plain Outstanding
// view below, unchanged). Deliberately narrower and more specific than the
// old generic Outstanding list: only the handful of things a PM personally
// needs to act on — this month's mandatory Toolbox Talk, open snagging,
// RAMS/COSHH still unsigned once work has actually started on site,
// messages they haven't read, and to-dos allocated specifically to them —
// plus a single combined "To Do" list of every open to-do across every site
// they're on (not just ones assigned to them), so nothing needs a second
// trip round every site to find.
async function computeNotificationRows(forId){
  const isAdmin = ME.role==='admin';
  const viewingPmId = isAdmin ? (forId || ME.id) : ME.id;
  const myPmAssignments = await dbSelect('site_assignments', 'user_id=eq.'+viewingPmId+'&select=site_id');
  const myPmSiteIds = new Set(myPmAssignments.map(a=>a.site_id));
  const sites = SITES.filter(s=>siteStatusKey(s)==='live' && (s.responsible_pm_id===viewingPmId || myPmSiteIds.has(s.id)));
  const siteIds = sites.map(s=>s.id);
  const idsCsv = siteIds.join(',');

  const [ramsDocs, coshhDocs, allTalks, openSnags, scheduleTasks, assignments, allTodos] = await Promise.all([
    // subcontractor_company_id=is.null — same fix as computeOutstandingRows:
    // subcontractor RAMS/COSHH/TBT must never surface in a PM's own
    // notification feed, only RTB's own.
    idsCsv ? dbSelect('rams_docs', 'status=eq.current&site_id=in.('+idsCsv+')&subcontractor_company_id=is.null&select=id,site_id,uploaded_at,resign_cycle_start') : Promise.resolve([]),
    idsCsv ? dbSelect('coshh_docs', 'site_id=in.('+idsCsv+')&subcontractor_company_id=is.null&select=id,site_id,uploaded_at,resign_cycle_start') : Promise.resolve([]),
    idsCsv ? dbSelect('toolbox_talks', 'site_id=in.('+idsCsv+')&subcontractor_company_id=is.null&select=id,site_id,status,created_at') : Promise.resolve([]),
    idsCsv ? dbSelect('snags', 'site_id=in.('+idsCsv+')&status=eq.open&select=site_id') : Promise.resolve([]),
    idsCsv ? dbSelect('schedule_tasks', 'site_id=in.('+idsCsv+')&select=site_id,status') : Promise.resolve([]),
    idsCsv ? dbSelect('site_assignments', 'site_id=in.('+idsCsv+')&select=site_id,user_id') : Promise.resolve([]),
    idsCsv ? dbSelect('todos', 'site_id=in.('+idsCsv+')&done=eq.false&order=created_at.asc') : Promise.resolve([]),
  ]);
  const ramsIds = ramsDocs.map(d=>d.id).join(',');
  const coshhIds = coshhDocs.map(d=>d.id).join(',');
  const [ramsSigsRaw, coshhSigsRaw] = await Promise.all([
    ramsIds ? dbSelect('rams_signatures', 'rams_id=in.('+ramsIds+')&select=rams_id,user_id,signed_at') : Promise.resolve([]),
    coshhIds ? dbSelect('coshh_signatures', 'coshh_id=in.('+coshhIds+')&select=coshh_id,user_id,signed_at') : Promise.resolve([]),
  ]);
  const ramsSigsCur = filterCurrentCycleSigs(ramsSigsRaw, ramsDocs, 'rams_id', {status:'active'});
  const coshhSigsCur = filterCurrentCycleSigs(coshhSigsRaw, coshhDocs, 'coshh_id', {status:'active'});

  const rosterBySite = {};
  assignments.forEach(a=>{ (rosterBySite[a.site_id]=rosterBySite[a.site_id]||[]).push(a.user_id); });
  // #327: PMs/admins structurally can't sign COSHH, so they must not sit in
  // the roster COSHH completion is checked against — same rule
  // computeOutstandingRows already applies for RAMS/COSHH.
  const operativeRosterBySite = {};
  assignments.forEach(a=>{ if(PROFILES[a.user_id] && PROFILES[a.user_id].role==='operative') (operativeRosterBySite[a.site_id]=operativeRosterBySite[a.site_id]||[]).push(a.user_id); });
  function unsignedCount(siteId, docs, sigs, fk, rosterMap){
    const docsHere = docs.filter(d=>d.site_id===siteId);
    const roster = (rosterMap||rosterBySite)[siteId]||[];
    const signedByDoc = {};
    sigs.forEach(s=>{ (signedByDoc[s[fk]]=signedByDoc[s[fk]]||new Set()).add(s.user_id); });
    let missing = 0;
    docsHere.forEach(d=>{ missing += roster.filter(uid=>!(signedByDoc[d.id]||new Set()).has(uid)).length; });
    return missing;
  }

  // "SOW has started" — at least one Schedule of Works task on the site has
  // moved off 'todo' (i.e. actual work is under way), not merely that a
  // schedule exists. RAMS/COSHH only surface here once that's true — before
  // work starts, nobody's expected to have signed anything yet.
  const sowStartedBySite = {};
  scheduleTasks.forEach(t=>{ if(t.status && t.status!=='todo') sowStartedBySite[t.site_id] = true; });

  const snagsBySite = {}; openSnags.forEach(s=>{ snagsBySite[s.site_id]=(snagsBySite[s.site_id]||0)+1; });
  const talksBySite = {}; allTalks.forEach(t=>{ (talksBySite[t.site_id]=talksBySite[t.site_id]||[]).push(t); });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const myTodosBySite = {};
  allTodos.forEach(t=>{ if(t.assigned_to===viewingPmId) myTodosBySite[t.site_id] = (myTodosBySite[t.site_id]||0)+1; });
  // Unread messages, checked against whichever PM's notifications are being
  // viewed — not always the signed-in admin — so an admin browsing another
  // PM's Notifications sees THEIR unread state, not their own.
  const unreadBySite = {};
  await Promise.all(sites.map(async s=>{ unreadBySite[s.id] = await unreadCountForSiteForUser(s.id, viewingPmId, 'managers'); }));

  const rows = sites.map(s=>{
    const items = [];
    // Toolbox Talk — same "still due" rule the site's own TBT page uses
    // (issued this month AND at least one ever completed), so this never
    // says something different to what you'd see once you tap through.
    const talks = talksBySite[s.id]||[];
    const issuedThisMonth = talks.some(t=>(t.status==='live'||t.status==='completed') && new Date(t.created_at)>=monthStart);
    const everCompleted = talks.some(t=>t.status==='completed');
    if(!issuedThisMonth || !everCompleted) items.push({lbl: !everCompleted ? 'Toolbox Talk — none ever completed at this site' : 'Toolbox Talk due for this month', href:`#/site/${s.id}/hs/tbt`});

    const snags = snagsBySite[s.id]||0;
    if(snags) items.push({lbl:`Open snags (${snags})`, href:`#/site/${s.id}/snagging/list`});

    if(sowStartedBySite[s.id]){
      const rams = unsignedCount(s.id, ramsDocs, ramsSigsCur, 'rams_id');
      if(rams) items.push({lbl:`RAMS not signed by operatives (${rams})`, href:`#/site/${s.id}/hs/rams`});
      const coshh = unsignedCount(s.id, coshhDocs, coshhSigsCur, 'coshh_id', operativeRosterBySite);
      if(coshh) items.push({lbl:`COSHH not signed by operatives (${coshh})`, href:`#/site/${s.id}/hs/coshh`});
    }

    const unread = unreadBySite[s.id]||0;
    if(unread) items.push({lbl:`Messages received (${unread})`, href:`#/site/${s.id}/messages`});

    const mine = myTodosBySite[s.id]||0;
    if(mine) items.push({lbl:`Tasks allocated to you (${mine})`, href:`#/site/${s.id}/todos`});

    return {site:s, items};
  }).filter(r=>r.items.length);

  // The combined "To Do" list — every still-open to-do across every live
  // site this PM is on, whoever it's assigned to, so there's one place to
  // see everything outstanding without opening each site's own To Do tab.
  const todoList = allTodos.map(t=>{
    const site = sites.find(s=>s.id===t.site_id);
    return {...t, siteName: site ? site.name : ''};
  }).sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));

  return {rows, todoList, isAdmin};
}
async function renderOutstandingTasks(){
  const __gen = RENDER_GEN;
  await loadAllProfiles();
  const isAdmin = ME.role==='admin';
  const manager = isManager(ME);
  if(manager){
    const pmOptions = isAdmin ? Object.values(PROFILES).filter(p=>p.role==='pm'||p.role==='admin').sort((a,b)=>a.name.localeCompare(b.name)) : [];
    const {rows, todoList} = await computeNotificationRows(outstandingPmId || ME.id);
    if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
      <p class="stub" style="margin:0 0 14px;">Things that need your attention across your live projects — tap one to go straight to it.</p>
      ${isAdmin && pmOptions.length ? `
        <div class="formfield" style="margin-bottom:14px;">
          <label class="field-label">Viewing notifications for</label>
          <select onchange="outstandingPmId=this.value||null;render()">
            <option value="" ${!outstandingPmId?'selected':''}>Me (${escapeHtml(ME.name)})</option>
            ${pmOptions.filter(p=>p.id!==ME.id).map(p=>`<option value="${p.id}" ${outstandingPmId===p.id?'selected':''}>${escapeHtml(p.name)}${p.role==='admin'?' (Admin)':''}</option>`).join('')}
          </select>
        </div>
      ` : ''}
      ${rows.length ? rows.map(r=>`
        <p class="sectiontitle" style="margin-top:16px;">${escapeHtml(r.site.name)}</p>
        ${r.items.map(it=>`
          <div class="sitecard" style="cursor:pointer;" onclick="go('${it.href}')">
            <div class="swatch" style="background:var(--warn-bg);color:var(--warn);">!</div>
            <div class="info"><div class="name">${escapeHtml(it.lbl)}</div></div>
          </div>
        `).join('')}
      `).join('') : `<div class="empty">Nothing needs your attention right now — nice work.</div>`}

      <p class="sectiontitle" style="margin-top:22px;">📋 To Do — every open task on your sites</p>
      ${todoList.length ? todoList.map(t=>`
        <div class="sitecard" style="cursor:pointer;" onclick="go('#/site/${t.site_id}/todos')">
          <div class="swatch">✓</div>
          <div class="info">
            <div class="name">${escapeHtml(t.text)}</div>
            <div class="sub">${escapeHtml(t.siteName)}${t.assigned_to ? ' · Assigned to '+escapeHtml(nameOf(t.assigned_to)) : ''}</div>
          </div>
        </div>
      `).join('') : `<div class="empty">No open to-dos on your sites.</div>`}
    `, {title:'Notifications', back:'#/sites', tabs:false}); }
    return;
  }
  const {rows} = await computeOutstandingRows(ME.id);
  // #405: an operative is always locked to their own items here — there's
  // no "viewing for" picker like the manager HUB has, they can never
  // choose a different person — but they can still narrow the list down
  // by type (RAMS/COSHH/Toolbox Talk), same idea as the HUB's type chips.
  const outstandingTypeChips = [
    {k:'all', lbl:'All'}, {k:'rams', lbl:'RAMS'}, {k:'coshh', lbl:'COSHH'}, {k:'tbt', lbl:'TBT'},
  ];
  const filteredRows = rows
    .map(r=>({site:r.site, items: outstandingFilterType==='all' ? r.items : r.items.filter(it=>it.type===outstandingFilterType)}))
    .filter(r=>r.items.length);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">Outstanding items on your sites — tap one to go straight to it.</p>
    <div class="filterrow" style="flex-wrap:wrap;margin-bottom:10px;">
      ${outstandingTypeChips.map(c=>`<div class="filterchip ${outstandingFilterType===c.k?'active':''}" onclick="outstandingFilterType='${c.k}';render()">${escapeHtml(c.lbl)}</div>`).join('')}
    </div>
    ${filteredRows.length ? filteredRows.map(r=>`
      <p class="sectiontitle" style="margin-top:16px;">${escapeHtml(r.site.name)}</p>
      ${r.items.map(it=>`
        <div class="sitecard" style="cursor:pointer;" onclick="go('${it.href}')">
          <div class="swatch" style="background:var(--warn-bg);color:var(--warn);">!</div>
          <div class="info"><div class="name">${escapeHtml(it.lbl)}</div></div>
        </div>
      `).join('')}
    `).join('') : `<div class="empty">Nothing outstanding — nice work.</div>`}
  `, {title:'Outstanding Tasks', back:'#/sites', tabs:false}); }
}
