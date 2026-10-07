/* ================= MAIN CONTRACTOR TILES ================= */
// Turned on per-site via the "Acting as a Main Contractor?" tick box in
// Settings & Admin (toggleMainContractor / site.acting_as_main_contractor).
// Six simple document tiles (mc_documents, one table shared across all six,
// distinguished by `category`) plus Subcontractors, which is its own
// structure below.
const MC_CATEGORY_LABEL = {cpp:'Construction Phase Plan', site_layout:'Site Rules & Layout', site_inductions:'Site Inductions', asbestos:'Asbestos Register', f10:'F10 Notification'};
const MC_CATEGORY_ICON = {cpp:'📘', site_layout:'🗺', site_inductions:'🪪', asbestos:'☣️', f10:'📮'};
// Upload panel on the CPP/Asbestos/F10 document pages: open by default until
// the first document is uploaded, then collapses into a closed dropdown so
// the page reads as "here's the document" rather than "here's an upload
// form" — keyed per site+category so different pages don't share state.
let mcDocUploadOpen = {};
// #408: Permits To Work moved off the generic mc_documents upload-folder
// model (like Site Layout and Site Inductions did before it) into its own
// full issue → sign-off → close-down workflow — see the Permit to Work
// module below. PERMIT_TYPE_* is the fixed library of permit types the
// user named (hot works, working at height, ACM, hazardous areas); unlike
// the MC document categories these aren't a customisable admin-managed
// list, just a fixed set picked at issue time.
const PERMIT_TYPE_LABEL = {hot_works:'Hot Works', height:'Working at Height', acm:'Working with ACM (Asbestos)', hazardous:'Hazardous Areas'};
const PERMIT_TYPE_ICON = {hot_works:'🔥', height:'🪜', acm:'☣️', hazardous:'⚠️'};
// Main Contractor tiles a PM/admin can hide from operatives (per site) via
// the ⋮ menu below — purely a display toggle (site.mc_hidden_tiles, a plain
// jsonb array of tile keys) so a PM can tuck away whichever of these don't
// apply to a given job without needing a code change; PMs/admins/clients
// always see every tile regardless, with a "hidden from operatives" note.
function mcTileHtml(key, href, icon, lbl, sub, canAdd, hidden, siteId){
  return `
    <div class="tile" style="position:relative;" onclick="go('${href}')">
      ${canAdd ? `<div style="position:absolute;top:6px;right:6px;z-index:1;" onclick="event.stopPropagation()">${rowActionsMenuHtml('mctile-'+key, `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;toggleMcTileHidden('${siteId}','${key}',${hidden?'false':'true'})">${hidden?'👁 Show to operatives':'🙈 Hide from operatives'}</div>`)}</div>` : ''}
      <div class="icon" style="background:#E7E9EE;color:var(--ink);">${icon}</div>
      <div class="lbl">${lbl}</div>
      <div class="sub">${sub}${canAdd && hidden ? ' · hidden from operatives' : ''}</div>
    </div>
  `;
}
// Shared data-fetch + tile-array builder for the Main Contractor tiles
// (CPP, Site Inductions, Subcontractors, Permits, Inspections, Asbestos,
// F10) — used by renderMcHome (the page the single "Main Contractor" tile
// on Home leads to) and by Home itself just for the area count shown on
// that tile, so the two never drift apart. Gated on
// site.acting_as_main_contractor and respecting the ⋮ hide-from-operatives
// toggle below. Site Rules & Layout is tile two here (right after CPP) and
// also stays reachable from Health & Safety, since it applies to every
// site — but Site Inductions is deliberately kept Main-Contractor-only,
// nowhere else.
async function getMcTiles(siteId, site){
  const canAdd = isManager(ME);
  const counts = await dbSelect('mc_documents', 'site_id=eq.'+siteId+'&category=neq.site_inductions&select=category');
  const countByCat = {}; counts.forEach(c=>{ countByCat[c.category] = (countByCat[c.category]||0)+1; });
  const [companies, inductionAssigned, inductionDone, openPermits, mcInspectionTemplates, layoutRows] = await Promise.all([
    dbSelect('subcontractor_companies', 'site_id=eq.'+siteId+'&select=id'),
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
    dbSelect('site_induction_completions', 'site_id=eq.'+siteId+'&select=operative_id'),
    dbSelect('permits', 'site_id=eq.'+siteId+'&status=eq.open&select=id'),
    dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&is_mc_inspection=eq.true&archived=eq.false&select=id'),
    dbSelect('site_layout_docs', 'site_id=eq.'+siteId+'&select=id'),
  ]);
  const inductionSub = inductionAssigned.length ? `${inductionDone.length} of ${inductionAssigned.length} inducted` : `${inductionDone.length} completed`;
  const permitsSub = openPermits.length ? `${openPermits.length} open` : 'None open';
  let mcInspectionsCount = 0;
  if(mcInspectionTemplates.length){
    const ids = mcInspectionTemplates.map(t=>t.id).join(',');
    const subs = await dbSelect('report_submissions', 'site_id=eq.'+siteId+'&template_id=in.('+ids+')&select=id');
    mcInspectionsCount = subs.length;
  }
  const inspectionsSub = mcInspectionsCount ? `${mcInspectionsCount} logged` : (mcInspectionTemplates.length ? 'None logged yet' : 'Set up templates');
  // Main Contractor's own Programme — a separate document to the site's
  // general Programme (different main contractors can be running different
  // programmes), so it's counted from its own dedicated root folder rather
  // than the one under Drawings, Spec's & Programme.
  const mcProgrammeFolder = await dbSelect('drawing_folders', 'site_id=eq.'+siteId+'&parent_id=is.null&name=eq.Main Contractor Programme&select=id');
  const mcProgrammeCount = mcProgrammeFolder && mcProgrammeFolder[0] ? (await dbSelect('drawing_files', 'site_id=eq.'+siteId+'&folder_id=eq.'+mcProgrammeFolder[0].id+'&status=eq.current&select=id')).length : 0;
  const hiddenSet = new Set((site && site.mc_hidden_tiles) || []);
  const tiles = [
    {key:'cpp', href:`#/site/${siteId}/mc/cpp`, icon:MC_CATEGORY_ICON.cpp, lbl:MC_CATEGORY_LABEL.cpp, sub:`${countByCat.cpp||0} document${(countByCat.cpp||0)===1?'':'s'}`},
    {key:'site_layout', href:`#/site/${siteId}/mc/site_layout`, icon:MC_CATEGORY_ICON.site_layout, lbl:MC_CATEGORY_LABEL.site_layout, sub:`${layoutRows.length} document${layoutRows.length===1?'':'s'}`},
    {key:'site_inductions', href:`#/site/${siteId}/mc/site_inductions`, icon:MC_CATEGORY_ICON.site_inductions, lbl:MC_CATEGORY_LABEL.site_inductions, sub:inductionSub},
    {key:'subcontractors', href:`#/site/${siteId}/mc/subcontractors`, icon:'👷', lbl:'Subcontractors', sub:`${companies.length} compan${companies.length===1?'y':'ies'}`},
    {key:'permits', href:`#/site/${siteId}/mc/permits`, icon:'🧾', lbl:'Permits To Work', sub:permitsSub},
    {key:'inspections', href:`#/site/${siteId}/mc/inspections`, icon:'🔍', lbl:'Inspections', sub:inspectionsSub},
    {key:'asbestos', href:`#/site/${siteId}/mc/asbestos`, icon:MC_CATEGORY_ICON.asbestos, lbl:MC_CATEGORY_LABEL.asbestos, sub:`${countByCat.asbestos||0} document${(countByCat.asbestos||0)===1?'':'s'}`},
    {key:'f10', href:`#/site/${siteId}/mc/f10`, icon:MC_CATEGORY_ICON.f10, lbl:MC_CATEGORY_LABEL.f10, sub:`${countByCat.f10||0} document${(countByCat.f10||0)===1?'':'s'}`},
    {key:'programme', href:`#/site/${siteId}/mc/programme`, icon:'📅', lbl:'Programme', sub:`${mcProgrammeCount} document${mcProgrammeCount===1?'':'s'}`},
  ];
  const visibleTiles = canAdd ? tiles : tiles.filter(t=>!hiddenSet.has(t.key));
  return {canAdd, hiddenSet, visibleTiles};
}
window.toggleMcTileHidden = async function(siteId, key, hide){
  const site = SITES.find(s=>s.id===siteId);
  const current = new Set((site && site.mc_hidden_tiles) || []);
  if(hide) current.add(key); else current.delete(key);
  const row = await dbUpdate('sites', siteId, {mc_hidden_tiles: Array.from(current)});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast(hide ? 'Hidden from operatives' : 'Now visible to everyone');
    render();
  }
};
// Site Home carries a single "Main Contractor" tile (position 2, right
// after Check In/Out) rather than each of these tiles individually — this
// is what that tile leads to, listing CPP/Site Rules/Inductions/
// Subcontractors/Permits/Inspections/Asbestos/F10 underneath it, same as
// before #404 flattened them straight onto Home.
async function renderMcHome(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site || !site.acting_as_main_contractor){ go(`#/site/${siteId}/home`); return; }
  const mcTiles = await getMcTiles(siteId, site);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid" style="grid-auto-rows:1fr;">
      ${mcTiles.visibleTiles.map(t=>mcTileHtml(t.key, t.href, t.icon, t.lbl, t.sub, mcTiles.canAdd, mcTiles.hiddenSet.has(t.key), siteId)).join('')}
    </div>
  `, {title:'Main Contractor', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, activeTab:'more'}); }
}