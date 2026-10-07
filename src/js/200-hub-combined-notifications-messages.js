/* ================= HUB (combined Notifications + Messages) ================= */
// Per the user's request: fold the PM Notifications feed and the Messages
// tile into one "HUB" page — a single flat, filterable feed of every item a
// manager needs to act on (Toolbox Talk due, open snags, RAMS/COSHH unsigned,
// unread messages, tasks allocated), filterable by type, site, PM (whose
// site it is — admin only, mirrors the old outstandingPmId picker), and due
// date. Tapping an item still jumps straight to the real page (site's own
// RAMS tab, Inbox thread, etc.) — HUB is the unified index, not a
// reimplementation of those pages.
// #405: HUB defaults to the signed-in PM/admin's own items — hubFilterPmId
// '' means exactly that — but any manager (not just an admin, as before)
// can switch it to 'all' (every PM company-wide, the old admin-only
// default) or to one specific colleague's id via the dropdown in renderHub.
// Whichever they pick persists for the rest of the session, same as the
// type/site/due filters below already did.
let hubFilterType = 'all'; // 'all'|'tbt'|'snag'|'rams'|'coshh'|'message'|'task'
let hubFilterSiteId = '';   // '' = all sites
let hubFilterPmId = '';     // '' = me (default), 'all' = every PM, else a specific PM's id
let hubFilterDue = 'all';   // 'all'|'overdue'|'week'|'nodate'
// `forcedPmId`, when passed, overrides the ambient hubFilterPmId — used by
// the Home bottom-bar badge (computeMyOutstandingCount) so the badge always
// counts YOUR OWN outstanding items, even if you last left the HUB page
// itself switched to viewing "All PMs" or a colleague — the badge is a
// personal nudge, not a mirror of whatever HUB was last filtered to.
async function computeHubItems(forcedPmId){
  const isAdmin = ME.role==='admin';
  const effectivePmId = forcedPmId!==undefined ? forcedPmId : hubFilterPmId;
  // Live AND upcoming sites — Hub used to be live-only, which silently hid
  // everything (RAMS, COSHH, TBTs, snags, to-dos, messages) on a site that
  // hasn't started yet, under every filter combination, with no way to see
  // it was even being excluded. PMs plan and assign work on upcoming sites
  // ahead of the start date, so Hub needs to surface that too. Closed sites
  // stay excluded — there's nothing outstanding to action once a site's done.
  const allLiveSites = SITES.filter(s=>{ const k = siteStatusKey(s); return k==='live' || k==='upcoming'; });
  let sites;
  if(effectivePmId === 'all'){
    sites = allLiveSites;
  } else {
    // '' (default) means "me"; anything else is a specific chosen PM's id.
    const targetPmId = effectivePmId || ME.id;
    const targetAssignments = await dbSelect('site_assignments', 'user_id=eq.'+targetPmId+'&select=site_id');
    const targetSiteIds = new Set(targetAssignments.map(a=>a.site_id));
    sites = allLiveSites.filter(s=>s.responsible_pm_id===targetPmId || targetSiteIds.has(s.id));
  }
  const siteIds = sites.map(s=>s.id);
  const idsCsv = siteIds.join(',');
  const [ramsDocs, coshhDocs, allTalks, openSnags, scheduleTasks, assignments, allTodos, mgrMsgs] = await Promise.all([
    // subcontractor_company_id=is.null — same fix as computeOutstandingRows/
    // computeNotificationRows: keep subcontractor RAMS/COSHH/TBT out of HUB.
    idsCsv ? dbSelect('rams_docs', 'status=eq.current&site_id=in.('+idsCsv+')&subcontractor_company_id=is.null&select=id,site_id,uploaded_at,resign_cycle_start') : Promise.resolve([]),
    idsCsv ? dbSelect('coshh_docs', 'site_id=in.('+idsCsv+')&subcontractor_company_id=is.null&select=id,site_id,uploaded_at,resign_cycle_start') : Promise.resolve([]),
    idsCsv ? dbSelect('toolbox_talks', 'site_id=in.('+idsCsv+')&subcontractor_company_id=is.null&select=id,site_id,status,created_at') : Promise.resolve([]),
    idsCsv ? dbSelect('snags', 'site_id=in.('+idsCsv+')&status=eq.open&select=id,site_id,created_at') : Promise.resolve([]),
    idsCsv ? dbSelect('schedule_tasks', 'site_id=in.('+idsCsv+')&select=site_id,status') : Promise.resolve([]),
    idsCsv ? dbSelect('site_assignments', 'site_id=in.('+idsCsv+')&select=site_id,user_id') : Promise.resolve([]),
    idsCsv ? dbSelect('todos', 'site_id=in.('+idsCsv+')&done=eq.false&order=created_at.asc') : Promise.resolve([]),
    idsCsv ? dbSelect('messages', 'audience=eq.managers&or=(site_id.in.('+idsCsv+'),site_id.is.null)&sender_id=neq.'+ME.id+'&select=id,site_id,created_at') : Promise.resolve([]),
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
  const sowStartedBySite = {};
  scheduleTasks.forEach(t=>{ if(t.status && t.status!=='todo') sowStartedBySite[t.site_id]=true; });
  const talksBySite = {}; allTalks.forEach(t=>{ (talksBySite[t.site_id]=talksBySite[t.site_id]||[]).push(t); });
  const snagsBySite = {}; openSnags.forEach(s=>{ (snagsBySite[s.site_id]=snagsBySite[s.site_id]||[]).push(s); });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // TBT has no explicit due-date field — the whole site is treated as due by
  // the 7th of the current month, same "compulsory by the 7th" rule used
  // everywhere else in the app.
  const dueTbt = new Date(now.getFullYear(), now.getMonth(), 7, 23, 59, 59);

  const items = [];
  sites.forEach(s=>{
    const talks = talksBySite[s.id]||[];
    const issuedThisMonth = talks.some(t=>(t.status==='live'||t.status==='completed') && new Date(t.created_at)>=monthStart);
    const everCompleted = talks.some(t=>t.status==='completed');
    if(!issuedThisMonth || !everCompleted){
      items.push({type:'tbt', typeLbl:'Toolbox Talk', label: !everCompleted ? 'Toolbox Talk — none ever completed at this site' : 'Toolbox Talk due for this month', siteId:s.id, siteName:s.name, pmId:s.responsible_pm_id, dueDate:dueTbt, href:`#/site/${s.id}/hs/tbt`});
    }
    (snagsBySite[s.id]||[]).forEach(sn=>{
      items.push({type:'snag', typeLbl:'Snag', label:'Open snag', siteId:s.id, siteName:s.name, pmId:s.responsible_pm_id, dueDate:null, href:`#/site/${s.id}/snagging/list`});
    });
    if(sowStartedBySite[s.id]){
      const rams = unsignedCount(s.id, ramsDocs, ramsSigsCur, 'rams_id');
      if(rams) items.push({type:'rams', typeLbl:'RAMS', label:`RAMS not signed by operatives (${rams})`, siteId:s.id, siteName:s.name, pmId:s.responsible_pm_id, dueDate:null, href:`#/site/${s.id}/hs/rams`});
      const coshh = unsignedCount(s.id, coshhDocs, coshhSigsCur, 'coshh_id', operativeRosterBySite);
      if(coshh) items.push({type:'coshh', typeLbl:'COSHH', label:`COSHH not signed by operatives (${coshh})`, siteId:s.id, siteName:s.name, pmId:s.responsible_pm_id, dueDate:null, href:`#/site/${s.id}/hs/coshh`});
    }
  });
  allTodos.forEach(t=>{
    const site = sites.find(s=>s.id===t.site_id);
    if(!site) return;
    items.push({type:'task', typeLbl:'Task', label:t.text, siteId:t.site_id, siteName:site.name, pmId:t.assigned_to||null, dueDate: t.date_required_by ? new Date(t.date_required_by+'T00:00:00') : null, href:`#/site/${t.site_id}/todos`});
  });
  const msgIds = mgrMsgs.map(m=>m.id);
  const reads = msgIds.length ? await dbSelect('message_reads', 'user_id=eq.'+ME.id+'&message_id=in.('+msgIds.join(',')+')&select=message_id') : [];
  const readSet = new Set(reads.map(r=>r.message_id));
  mgrMsgs.filter(m=>!readSet.has(m.id)).forEach(m=>{
    const site = m.site_id ? sites.find(s=>s.id===m.site_id) : null;
    items.push({type:'message', typeLbl:'Message', label: site ? 'New message' : 'New message (all sites)', siteId: m.site_id||null, siteName: site ? site.name : 'All sites', pmId: site ? site.responsible_pm_id : null, dueDate: new Date(m.created_at), href: site ? `#/site/${site.id}/messages` : '#/my-messages'});
  });
  return {items, sites, isAdmin};
}
async function renderHub(){
  const __gen = RENDER_GEN;
  await loadAllProfiles();
  const {items, sites} = await computeHubItems();
  // #405: every manager gets the switcher now, not just admins — defaults
  // to "Me", with "All PMs" (the old admin-only default) and each named
  // colleague (excluding yourself — "Me" already covers that) as the
  // other choices.
  const pmOptions = Object.values(PROFILES).filter(p=>(p.role==='pm'||p.role==='admin') && p.id!==ME.id).sort((a,b)=>a.name.localeCompare(b.name));
  const typeChips = [
    {k:'all', lbl:'All'}, {k:'tbt', lbl:'TBT'}, {k:'snag', lbl:'Snags'},
    {k:'rams', lbl:'RAMS'}, {k:'coshh', lbl:'COSHH'}, {k:'message', lbl:'Messages'}, {k:'task', lbl:'Tasks'},
  ];
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7*24*60*60*1000);
  let filtered = items.filter(it=>{
    if(hubFilterType!=='all' && it.type!==hubFilterType) return false;
    if(hubFilterSiteId && it.siteId!==hubFilterSiteId) return false;
    // Who this feed is "for" is already resolved into `sites` inside
    // computeHubItems (self by default, or whoever hubFilterPmId names) —
    // no separate per-item pmId check needed here on top of that.
    if(hubFilterDue==='overdue' && !(it.dueDate && it.dueDate<now)) return false;
    if(hubFilterDue==='week' && !(it.dueDate && it.dueDate>=now && it.dueDate<=weekAhead)) return false;
    if(hubFilterDue==='nodate' && it.dueDate) return false;
    return true;
  });
  // Soonest due date first; items with no due date (RAMS/COSHH/snags have no
  // natural one) sort to the end rather than being treated as most urgent.
  filtered = filtered.sort((a,b)=>{
    if(a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
    if(a.dueDate) return -1;
    if(b.dueDate) return 1;
    return 0;
  });
  const fmtDue = d => !d ? '—' : d.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">Everything needing your attention — Toolbox Talks, RAMS/COSHH, snags, tasks and messages — in one place. Tap a row to jump straight to it.</p>
    <div class="filterrow" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;overflow:visible;">
      ${typeChips.map(c=>`<div class="filterchip ${hubFilterType===c.k?'active':''}" style="flex:none;min-width:0;width:auto;margin:0;padding-left:4px;padding-right:4px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onclick="hubFilterType='${c.k}';render()">${escapeHtml(c.lbl)}</div>`).join('')}
    </div>
    <div class="formfield" style="margin-top:12px;">
      <label class="field-label">Site</label>
      <select onchange="hubFilterSiteId=this.value;render()">
        <option value="">All sites</option>
        ${sites.map(s=>`<option value="${s.id}" ${hubFilterSiteId===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
      </select>
    </div>
    ${pmOptions.length ? `
      <div class="formfield">
        <label class="field-label">Viewing</label>
        <select onchange="hubFilterPmId=this.value;render()">
          <option value="" ${hubFilterPmId===''?'selected':''}>Me (${escapeHtml(ME.name)})</option>
          <option value="all" ${hubFilterPmId==='all'?'selected':''}>All PMs</option>
          ${pmOptions.map(p=>`<option value="${p.id}" ${hubFilterPmId===p.id?'selected':''}>${escapeHtml(p.name)}${p.role==='admin'?' (Admin)':''}</option>`).join('')}
        </select>
      </div>
    ` : ''}
    <div class="formfield">
      <label class="field-label">Due date</label>
      <select onchange="hubFilterDue=this.value;render()">
        <option value="all" ${hubFilterDue==='all'?'selected':''}>Any time</option>
        <option value="overdue" ${hubFilterDue==='overdue'?'selected':''}>Overdue</option>
        <option value="week" ${hubFilterDue==='week'?'selected':''}>Due within 7 days</option>
        <option value="nodate" ${hubFilterDue==='nodate'?'selected':''}>No due date</option>
      </select>
    </div>
    <div style="margin-top:14px;">
      ${filtered.length ? filtered.map(it=>`
        <div class="sitecard" style="cursor:pointer;" onclick="go('${it.href}')">
          <div class="swatch" style="background:var(--warn-bg);color:var(--warn);">!</div>
          <div class="info">
            <div class="name">${escapeHtml(it.label)}</div>
            <div class="sub">${escapeHtml(it.typeLbl)} · ${escapeHtml(it.siteName)}${it.dueDate?' · Due '+fmtDue(it.dueDate):''}</div>
          </div>
        </div>
      `).join('') : `<div class="empty">Nothing matches these filters right now.</div>`}
    </div>
  `, {title:'HUB', back:'#/sites', tabs:false}); }
}
