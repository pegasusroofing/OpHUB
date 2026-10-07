/* ================= VEHICLE CHECKLISTS (PM/admin view) ================= */
// Read-only for managers — drivers own their own checklists (see the RLS
// policies added in the vehicle_checklists_table migration). This is just a
// list of submissions, newest first, with a filter for failed-item ones,
// and a detail view that shows every item plus fail photos/notes.
let vehicleChecklistsAdminFilter = 'all'; // 'all' | 'fails'
async function renderVehicleChecklistsAdmin(){
  const __gen = RENDER_GEN;
  const rows = await dbSelect('vehicle_checklists', 'org_id=eq.'+ME.org_id+'&status=eq.submitted&order=submitted_at.desc&limit=200');
  await loadAllProfiles();
  const filtered = vehicleChecklistsAdminFilter==='fails' ? rows.filter(r=>r.has_fails) : rows;
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <div class="row" style="gap:8px;margin-bottom:14px;">
      <button class="ghostbtn" style="flex:1;${vehicleChecklistsAdminFilter==='all'?'background:var(--blue-bg);color:var(--blue);border-color:var(--blue);':''}" onclick="vehicleChecklistsAdminFilter='all';render()">All</button>
      <button class="ghostbtn" style="flex:1;${vehicleChecklistsAdminFilter==='fails'?'background:var(--warn-bg);color:var(--warn);border-color:var(--warn);':''}" onclick="vehicleChecklistsAdminFilter='fails';render()">⚠ Had Fails</button>
    </div>
    ${filtered.length ? filtered.map(r=>`
      <div class="sitecard" onclick="go('#/vehicle-checklists/${r.id}')" style="cursor:pointer;">
        <div class="info">
          <div class="name">${escapeHtml((PROFILES[r.driver_id]||{}).name || 'Unknown driver')}${r.vehicle_reg?' · '+escapeHtml(r.vehicle_reg):''}</div>
          <div class="addr">Week of ${new Date(r.week_start+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} · ${r.has_fails?'⚠ Had failed items':'All passed'}</div>
        </div>
      </div>
    `).join('') : `<div class="empty">No submitted checklists${vehicleChecklistsAdminFilter==='fails'?' with failed items':''} yet.</div>`}
  `, {title:'Vehicle Checklists', back:'#/team'});
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
      <p class="stub" style="margin:0;">${r.vehicle_reg?escapeHtml(r.vehicle_reg)+' · ':''}Week of ${new Date(r.week_start+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</p>
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
