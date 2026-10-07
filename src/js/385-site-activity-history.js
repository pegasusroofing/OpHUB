/* ================= SITE ACTIVITY HISTORY (one timeline per job) ================= */
// Everything recorded against a job, newest first, in one place:
//   - the activity log (things edited, closed and deleted), and
//   - the job's notices (material requested, snag raised or closed,
//     variation raised, to-do assigned, permits, deliveries, flags…).
// Managers only. Filter by type or by person; "Show more" goes further back.
let siteActivityFilter = 'all';     // all | changes | notices
let siteActivityPerson = '';        // '' = everyone
let siteActivityLimit = 150;
const SITE_ACTIVITY_KIND_LABEL = {material_request:'Material requested', variation:'Variation raised', snag_closed:'Snag closed', snag_raised:'Snag raised', schedule_flag:'Site flag raised', delivery_complete:'Delivery completed', permit_issued:'Permit issued', permit_closed:'Permit closed', havs_elv_exceeded:'HAVS limit exceeded', havs_eav_exceeded:'HAVS action value exceeded', vehicle_checklist_fail:'Vehicle check failed', additional_works_requested:'Variation requested', todo_assigned:'To-do assigned', doc_needs_signing:'Document issued for signing', price_sheet_issued:'Price sheet issued', delivery_assigned:'Delivery / collection assigned'};
async function renderSiteActivity(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/sites'); return; }
  const [logRows, msgRows] = await Promise.all([
    dbSelect('site_activity_log', 'site_id=eq.'+siteId+'&order=created_at.desc&limit='+siteActivityLimit),
    // Ordinary chat messages and the routine "checked in" notices are left out — this is a record of actions.
    dbSelect('messages', 'site_id=eq.'+siteId+'&kind=not.in.(message,operative_checked_in)&select=id,kind,body,sender_id,created_at&order=created_at.desc&limit='+siteActivityLimit),
  ]);
  await loadAllProfiles();
  if(__gen !== RENDER_GEN) return;
  const words = a=>String(a||'').replace(/_/g,' ').replace(/^./, c=>c.toUpperCase());
  const items = [
    ...(logRows||[]).map(r=>({type:'changes', at:r.created_at, by:r.actor_id, head:words(r.action), text:r.description||''})),
    ...(msgRows||[]).map(r=>({type:'notices', at:r.created_at, by:r.sender_id, head:SITE_ACTIVITY_KIND_LABEL[r.kind] || words(r.kind), text:r.body||''})),
  ].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  const peopleIds = Array.from(new Set(items.map(i=>i.by).filter(Boolean))).sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
  const shown = items.filter(i=>(siteActivityFilter==='all' || i.type===siteActivityFilter) && (!siteActivityPerson || i.by===siteActivityPerson));
  const more = (logRows||[]).length>=siteActivityLimit || (msgRows||[]).length>=siteActivityLimit;
  let lastDay = '';
  document.getElementById('app').innerHTML = shell(`
    <div class="filterrow" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;overflow:visible;">
      ${[['all','All'],['changes','Changes'],['notices','Notices']].map(c=>`<div class="filterchip ${siteActivityFilter===c[0]?'active':''}" style="flex:none;min-width:0;width:auto;margin:0;text-align:center;" onclick="siteActivityFilter='${c[0]}';render()">${c[1]}</div>`).join('')}
    </div>
    ${peopleIds.length>1 ? `<div class="formfield"><label class="field-label">Person</label><select onchange="siteActivityPerson=this.value;render()"><option value="">Everyone</option>${peopleIds.map(id=>`<option value="${id}" ${siteActivityPerson===id?'selected':''}>${escapeHtml(nameOf(id))}</option>`).join('')}</select></div>` : ''}
    <p class="stub" style="margin:8px 0 10px;">Changes are edits, closures and deletions. Notices are things raised on the job, such as material requests, snags and variations.</p>
    ${shown.map(i=>{
      const d = new Date(i.at);
      const day = d.toLocaleDateString('en-GB',{weekday:'short', day:'2-digit', month:'short', year:'numeric'});
      const dayHdr = day!==lastDay ? `<p class="sectiontitle" style="margin-top:14px;">${day}</p>` : '';
      lastDay = day;
      return dayHdr + `<div class="card" style="padding:9px 12px;margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
          <span style="font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${i.type==='changes'?'var(--warn)':'var(--blue)'};">${escapeHtml(i.head)}</span>
          <span class="stub" style="margin:0;font-size:11px;white-space:nowrap;">${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>
        </div>
        <div style="font-size:13px;margin-top:2px;overflow-wrap:anywhere;">${escapeHtml(i.text)}</div>
        <div class="stub" style="margin:3px 0 0;font-size:11px;">${escapeHtml(i.by ? nameOf(i.by) : 'System')}</div>
      </div>`;
    }).join('') || `<div class="empty">Nothing recorded${siteActivityFilter!=='all' || siteActivityPerson ? ' for that filter' : ' on this job yet'}.</div>`}
    ${more ? `<button class="ghostbtn" style="margin-top:10px;" onclick="siteActivityLimit+=150;render()">Show more</button>` : ''}
  `, {title:'Activity History', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/team`, siteId, tabs:false});
}
