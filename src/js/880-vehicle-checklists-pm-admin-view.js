/* ================= VEHICLE CHECKLISTS (PM/admin view) ================= */
// Read-only for managers — drivers own their own checklists (see the RLS
// policies added in the vehicle_checklists_table migration). This is just a
// list of submissions, newest first, with a filter for failed-item ones,
// and a detail view that shows every item plus fail photos/notes.
let vehicleChecklistsAdminFilter = 'all'; // 'all' | 'fails'
let vehicleChecksBackHash = '#/delivery';
// #(vehicle-health) Marking a vehicle's health check done restarts its
// 10,000-mile count from the latest mileage reported for it.
window.markVehicleHealthDone = async function(reg){
  if(!(await customConfirm('Mark the vehicle health check for '+reg+' as done? This restarts its 10,000-mile count.'))) return;
  const rows = await dbSelect('vehicle_service_status', 'org_id=eq.'+ME.org_id+'&vehicle_reg=eq.'+encodeURIComponent(reg)+'&limit=1');
  const r = rows[0]; if(!r) return;
  const ok = await sbFetch('/rest/v1/vehicle_service_status?org_id=eq.'+ME.org_id+'&vehicle_reg=eq.'+encodeURIComponent(reg), {method:'PATCH', headers:{'Prefer':'return=minimal'}, body: JSON.stringify({baseline_miles: r.last_miles, last_reminder_miles: null, health_check_done_at: new Date().toISOString(), health_check_done_by: ME.id, updated_at: new Date().toISOString()})});
  if(ok && ok.ok){ toast('Health check recorded for '+reg); render(); } else toast('Could not save — try again.');
};
async function renderVehicleChecklistsAdmin(){
  const __gen = RENDER_GEN;
  const [rows, vstat] = await Promise.all([
    dbSelect('vehicle_checklists', 'org_id=eq.'+ME.org_id+'&status=eq.submitted&order=submitted_at.desc&limit=200'),
    dbSelect('vehicle_service_status', 'org_id=eq.'+ME.org_id+'&order=vehicle_reg.asc'),
  ]);
  await loadAllProfiles();
  const filtered = vehicleChecklistsAdminFilter==='fails' ? rows.filter(r=>r.has_fails) : rows;
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <p class="sectiontitle" style="margin-top:0;">Vehicles · 10,000-mile health checks</p>
    ${vstat.length ? `<div class="admgroup" style="margin-bottom:16px;">${vstat.map(v=>{
      const since = (v.last_miles!=null && v.baseline_miles!=null) ? v.last_miles - v.baseline_miles : 0;
      const due = since >= 10000;
      const pct = Math.max(0, Math.min(100, Math.round(since/100)));
      return `<div style="padding:12px 14px;${''}border-top:1px solid #F0F1F4;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="flex:1;min-width:0;"><div style="font-weight:800;font-size:14px;">${escapeHtml(v.vehicle_reg)}</div>
            <div class="stub" style="margin:2px 0 0;">${v.last_miles!=null?Number(v.last_miles).toLocaleString('en-GB')+' miles':''} · ${Number(since).toLocaleString('en-GB')} since last health check${v.health_check_done_at?' ('+new Date(v.health_check_done_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})+')':''}</div></div>
          ${due ? `<span class="pmbadge open">Due</span>` : ''}
        </div>
        <div style="height:6px;border-radius:99px;background:#ECEEF2;margin:8px 0;overflow:hidden;"><div style="height:6px;width:${pct}%;background:${due?'var(--red)':'var(--ok)'};"></div></div>
        <button class="ghostbtn" style="width:auto;margin:0;padding:6px 12px;font-size:12px;" onclick="markVehicleHealthDone('${jsAttr(v.vehicle_reg)}')">✓ Health check done</button>
      </div>`; }).join('')}</div>` : `<p class="stub" style="margin:0 0 16px;">Mileage starts being tracked from each vehicle's next weekly check.</p>`}
    <p class="sectiontitle">Weekly checklists</p>
    <div class="row" style="gap:8px;margin-bottom:14px;">
      <button class="ghostbtn" style="flex:1;${vehicleChecklistsAdminFilter==='all'?'background:var(--blue-bg);color:var(--blue);border-color:var(--blue);':''}" onclick="vehicleChecklistsAdminFilter='all';render()">All</button>
      <button class="ghostbtn" style="flex:1;${vehicleChecklistsAdminFilter==='fails'?'background:var(--warn-bg);color:var(--warn);border-color:var(--warn);':''}" onclick="vehicleChecklistsAdminFilter='fails';render()">⚠ Had Fails</button>
    </div>
    ${filtered.length ? filtered.map(r=>`
      <div class="sitecard" onclick="go('#/vehicle-checklists/${r.id}')" style="cursor:pointer;">
        <div class="info">
          <div class="name">${escapeHtml((PROFILES[r.driver_id]||{}).name || 'Unknown driver')}${r.vehicle_reg?' · '+escapeHtml(r.vehicle_reg):''}</div>
          <div class="addr">Week of ${new Date(r.week_start+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}${r.mileage?' · '+Number(r.mileage).toLocaleString('en-GB')+' miles':''} · ${r.has_fails?'⚠ Had failed items':'All passed'}</div>
        </div>
      </div>
    `).join('') : `<div class="empty">No submitted checklists${vehicleChecklistsAdminFilter==='fails'?' with failed items':''} yet.</div>`}
  `, {title:'Vehicle health checks', back: vehicleChecksBackHash || '#/delivery'});
}
async function renderVehicleChecklistDetail(id){
  const __gen = RENDER_GEN;
  const rows = await dbSelect('vehicle_checklists', 'id=eq.'+id+'&limit=1');
  const r = rows[0];
  if(!r){ go('#/vehicle-checklists'); return; }
  await loadAllProfiles();
  if(__gen !== RENDER_GEN) return;
  const itemsMap = {}; (r.items||[]).forEach(it=>{ itemsMap[it.key]=it; });
  const cats = [...new Set(VEHICLE_CHECKLIST_ITEMS.map(i=>i.cat))];
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="margin-bottom:14px;">
      <p style="margin:0 0 4px;font-weight:700;">${escapeHtml((PROFILES[r.driver_id]||{}).name || 'Unknown driver')}</p>
      <p class="stub" style="margin:0;">${r.vehicle_reg?escapeHtml(r.vehicle_reg)+' · ':''}${r.mileage?Number(r.mileage).toLocaleString('en-GB')+' miles · ':''}Week of ${new Date(r.week_start+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</p>
      <p class="stub" style="margin:4px 0 0;">Submitted ${r.submitted_at?new Date(r.submitted_at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):''}</p>
    </div>
    ${vehiclePhotosHtml(itemsMap, false)}
    ${cats.map(cat=>`
      <p class="sectiontitle" style="margin-top:16px;">${escapeHtml(cat)}</p>
      ${VEHICLE_CHECKLIST_ITEMS.filter(i=>i.cat===cat).map(item=>{
        const ans = itemsMap[item.key] || {};
        return `
        <div class="card" style="margin-bottom:8px;">
          <p style="margin:0 0 4px;">${escapeHtml(item.label)}</p>
          <p style="margin:0;font-weight:700;color:${ans.result==='fail'?'var(--warn)':'var(--ok)'};">${ans.result==='fail'?'✕ Fail':ans.result==='pass'?'✓ Pass':'— Not answered'}</p>
          ${ans.result==='fail' ? `
            <p class="stub" style="margin:6px 0 0;">${escapeHtml(ans.note||'')}</p>
            ${ans.photo_path ? `<img src="${publicUrl('site-photos', ans.photo_path)}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;margin-top:6px;cursor:pointer;" onclick="viewImage('${publicUrl('site-photos', ans.photo_path)}')" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';">` : ''}
          ` : ''}
        </div>
      `}).join('')}
    `).join('')}
  `, {title:'Vehicle Checklist', back:'#/vehicle-checklists'});
}
