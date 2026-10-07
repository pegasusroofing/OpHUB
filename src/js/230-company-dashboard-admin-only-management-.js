/* ================= COMPANY DASHBOARD (admin-only, management overview across every live project) ================= */
async function renderDashboard(){
  const __gen = RENDER_GEN;
  await loadAllProfiles();
  const liveSites = SITES.filter(s=>siteStatusKey(s)==='live');
  const upcomingSites = SITES.filter(s=>siteStatusKey(s)==='upcoming');
  const closedSites = SITES.filter(s=>siteStatusKey(s)==='closed');
  const liveIds = liveSites.map(s=>s.id);
  const liveIdsCsv = liveIds.join(',');

  const [openSnags, ramsDocs, coshhDocs, assignments, scheduleTasks, incidentsRecent, liveTbts] = await Promise.all([
    liveIds.length ? dbSelect('snags', 'status=eq.open&site_id=in.('+liveIdsCsv+')&select=id,site_id') : [],
    // subcontractor_company_id=is.null — same fix as computeOutstandingRows/
    // computeNotificationRows/computeHubItems: keep subcontractor RAMS/
    // COSHH/TBT out of the company-wide admin dashboard totals.
    liveIds.length ? dbSelect('rams_docs', 'status=eq.current&site_id=in.('+liveIdsCsv+')&subcontractor_company_id=is.null&select=id,site_id,uploaded_at,resign_cycle_start') : [],
    liveIds.length ? dbSelect('coshh_docs', 'site_id=in.('+liveIdsCsv+')&subcontractor_company_id=is.null&select=id,site_id,uploaded_at,resign_cycle_start') : [],
    liveIds.length ? dbSelect('site_assignments', 'site_id=in.('+liveIdsCsv+')&select=site_id,user_id') : [],
    liveIds.length ? dbSelect('schedule_tasks', 'site_id=in.('+liveIdsCsv+')&select=site_id,status') : [],
    dbSelect('incident_reports', 'order=created_at.desc&limit=500&select=id,site_id,created_at,riddor_reportable,location,injury_occurred,damage_occurred'),
    liveIds.length ? dbSelect('toolbox_talks', 'status=eq.live&site_id=in.('+liveIdsCsv+')&subcontractor_company_id=is.null&select=id,site_id') : [],
  ]);
  const tbtIds = liveTbts.map(t=>t.id).join(',');
  const ramsIds = ramsDocs.map(d=>d.id).join(',');
  const coshhIds = coshhDocs.map(d=>d.id).join(',');
  // These three all depend on ids resolved from the first Promise.all above,
  // so they can't join that batch — but they don't depend on EACH OTHER,
  // so fire them together in one round-trip instead of one-then-two.
  const [tbtSigs, ramsSigsRaw, coshhSigsRaw] = await Promise.all([
    tbtIds ? dbSelect('toolbox_talk_signatures', 'tbt_id=in.('+tbtIds+')&select=tbt_id,user_id') : [],
    ramsIds ? dbSelect('rams_signatures', 'rams_id=in.('+ramsIds+')&select=rams_id,user_id,signed_at') : [],
    coshhIds ? dbSelect('coshh_signatures', 'coshh_id=in.('+coshhIds+')&select=coshh_id,user_id,signed_at') : [],
  ]);
  // Same 12-month resign-cycle filter used on the RAMS/COSHH pages
  // themselves (every site here is live, so the cycle always applies).
  const ramsSigs = filterCurrentCycleSigs(ramsSigsRaw, ramsDocs, 'rams_id', {status:'active'});
  const coshhSigs = filterCurrentCycleSigs(coshhSigsRaw, coshhDocs, 'coshh_id', {status:'active'});

  const rosterBySite = {};
  assignments.forEach(a=>{ (rosterBySite[a.site_id]=rosterBySite[a.site_id]||[]).push(a.user_id); });
  // TBT/COSHH outstanding — only operatives count towards the roster (PMs/
  // admins can't sign either — the PM running a TBT is recorded separately
  // as "Carried out by", and #237 removed PM's ability to sign COSHH), same
  // rule the per-site TBT/COSHH pages use. Built before outstandingBySite so
  // COSHH can use it too (#327 — it used to reuse the everyone-included
  // rosterBySite, which permanently counted an assigned PM/admin as
  // outstanding on COSHH since they have no way to actually sign it).
  const operativeRosterBySite = {};
  assignments.forEach(a=>{ if(PROFILES[a.user_id] && PROFILES[a.user_id].role==='operative') (operativeRosterBySite[a.site_id]=operativeRosterBySite[a.site_id]||[]).push(a.user_id); });
  function outstandingBySite(docs, sigs, fk, roster){
    const signedByDoc = {};
    sigs.forEach(s=>{ (signedByDoc[s[fk]]=signedByDoc[s[fk]]||new Set()).add(s.user_id); });
    const bySite = {};
    docs.forEach(d=>{
      const siteRoster = roster[d.site_id]||[];
      const missing = siteRoster.filter(uid=>!(signedByDoc[d.id]||new Set()).has(uid)).length;
      bySite[d.site_id] = (bySite[d.site_id]||0) + missing;
    });
    return bySite;
  }
  const ramsOutstandingBySite = outstandingBySite(ramsDocs, ramsSigs, 'rams_id', rosterBySite);
  const coshhOutstandingBySite = outstandingBySite(coshhDocs, coshhSigs, 'coshh_id', operativeRosterBySite);
  const tbtSignedByTalk = {};
  tbtSigs.forEach(s=>{ (tbtSignedByTalk[s.tbt_id]=tbtSignedByTalk[s.tbt_id]||new Set()).add(s.user_id); });
  const tbtOutstandingBySite = {};
  liveTbts.forEach(t=>{
    const roster = operativeRosterBySite[t.site_id]||[];
    const signed = tbtSignedByTalk[t.id]||new Set();
    const missing = roster.filter(uid=>!signed.has(uid)).length;
    tbtOutstandingBySite[t.site_id] = (tbtOutstandingBySite[t.site_id]||0) + missing;
  });
  const totalTbtOutstanding = Object.values(tbtOutstandingBySite).reduce((a,b)=>a+b,0);
  const snagsBySite = {};
  openSnags.forEach(s=>{ snagsBySite[s.site_id] = (snagsBySite[s.site_id]||0)+1; });
  const scheduleBySite = {};
  scheduleTasks.forEach(t=>{
    const b = scheduleBySite[t.site_id] = scheduleBySite[t.site_id] || {todo:0, in_progress:0, complete:0, total:0};
    // NOTE: schedule_tasks statuses are actually 'todo'/'progress'/'done'
    // (see renderSchedule) — this previously checked 'in_progress'/'complete',
    // which never matched, so "Schedule Complete" always read 0%. Fixed to
    // match the real enum.
    b.total++; if(t.status==='todo') b.todo++; else if(t.status==='progress') b.in_progress++; else if(t.status==='done') b.complete++;
  });

  const totalOpenSnags = openSnags.length;
  const totalRamsOutstanding = Object.values(ramsOutstandingBySite).reduce((a,b)=>a+b,0);
  const totalCoshhOutstanding = Object.values(coshhOutstandingBySite).reduce((a,b)=>a+b,0);
  const scheduleTotals = Object.values(scheduleBySite).reduce((acc,b)=>{ acc.total+=b.total; acc.complete+=b.complete; acc.in_progress+=b.in_progress; acc.todo+=b.todo; return acc; }, {total:0, complete:0, in_progress:0, todo:0});
  const completionPct = scheduleTotals.total ? Math.round(scheduleTotals.complete/scheduleTotals.total*100) : 0;

  const topSites = (bySiteMap, count) => liveSites
    .map(s=>({site:s, count: bySiteMap[s.id]||0}))
    .filter(x=>x.count>0)
    .sort((a,b)=>b.count-a.count)
    .slice(0, count===undefined?5:count);

  const statCard = (label, value, sub, onclick) => `
    <div class="card" style="flex:1;min-width:130px;text-align:center;${onclick?'cursor:pointer;':''}" ${onclick?`onclick="${onclick}"`:''}>
      <div style="font-size:26px;font-weight:800;color:var(--ink);">${value}</div>
      <div class="meta" style="margin-top:2px;">${escapeHtml(label)}</div>
      ${sub ? `<div class="stub" style="margin-top:4px;">${sub}</div>` : ''}
      ${onclick ? `<div class="stub" style="margin-top:4px;color:var(--blue);">Tap to open ›</div>` : ''}
    </div>`;

  // No "top 5" cap here any more — a tile that says "12 outstanding" should
  // open to all 12 projects, not just the busiest 5.
  const siteListBlock = (id, title, list, href) => `
    <p class="sectiontitle" id="${id}" style="margin-top:20px;scroll-margin-top:14px;">${title}</p>
    ${list.length ? list.map(x=>`
      <div class="sitecard" style="cursor:pointer;" onclick="go('${href(x.site.id)}')">
        <div class="swatch">${(x.site.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</div>
        <div class="info"><div class="name">${escapeHtml(x.site.name)}</div><div class="addr">${x.count}</div></div>
      </div>
    `).join('') : `<div class="empty">Nothing outstanding.</div>`}`;
  const scrollTo = id => `document.getElementById('${id}').scrollIntoView({behavior:'smooth'})`;

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="row-gap" style="flex-wrap:wrap;margin-bottom:16px;">
      ${statCard('Live Projects', liveSites.length, null, "go('#/sites')")}
      ${statCard('Upcoming', upcomingSites.length, null, "goSitesSection('upcoming')")}
      ${statCard('Closed', closedSites.length, null, "goSitesSection('closed')")}
    </div>
    <div class="row-gap" style="flex-wrap:wrap;margin-bottom:16px;">
      ${statCard('Open Snags', totalOpenSnags, 'across live projects', scrollTo('dash-snags'))}
      ${statCard('RAMS Outstanding', totalRamsOutstanding, 'signatures needed', scrollTo('dash-rams'))}
      ${statCard('COSHH Outstanding', totalCoshhOutstanding, 'signatures needed', scrollTo('dash-coshh'))}
    </div>
    <div class="row-gap" style="flex-wrap:wrap;margin-bottom:6px;">
      ${statCard('Schedule Complete', completionPct+'%', scheduleTotals.total+' tasks across live projects')}
      ${statCard('Incidents', incidentsRecent.length, 'most recent 500 reports', scrollTo('dash-incidents'))}
      ${statCard('Outstanding TBT', totalTbtOutstanding, 'signatures needed', scrollTo('dash-tbt'))}
    </div>

    ${siteListBlock('dash-snags', 'Live Projects With Open Snags', topSites(snagsBySite, 999), id=>`#/site/${id}/snagging`)}
    ${siteListBlock('dash-rams', 'Live Projects With RAMS Outstanding', topSites(ramsOutstandingBySite, 999), id=>`#/site/${id}/hs/rams`)}
    ${siteListBlock('dash-coshh', 'Live Projects With COSHH Outstanding', topSites(coshhOutstandingBySite, 999), id=>`#/site/${id}/hs/coshh`)}
    ${siteListBlock('dash-tbt', 'Live Projects With TBT Outstanding', topSites(tbtOutstandingBySite, 999), id=>`#/site/${id}/hs/tbt`)}

    <p class="sectiontitle" id="dash-incidents" style="margin-top:20px;scroll-margin-top:14px;">Recent Accident / Incident Reports</p>
    ${incidentsRecent.slice(0,8).length ? incidentsRecent.slice(0,8).map(r=>{
      const s = SITES.find(x=>x.id===r.site_id);
      return `<div class="sitecard" style="cursor:pointer;" onclick="go('#/site/${r.site_id}/hs/incidents/${r.id}')">
        <div class="swatch">⚠️</div>
        <div class="info"><div class="name">${escapeHtml((s&&s.name)||'Unknown project')}</div><div class="addr">${escapeHtml(r.location||'')} · ${new Date(r.created_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}${r.riddor_reportable?' · RIDDOR':''}</div></div>
      </div>`;
    }).join('') : `<div class="empty">No accidents, incidents or near misses reported recently.</div>`}
  `, {title:'Company Dashboard', back:'#/team', tabs:false}); }
}
