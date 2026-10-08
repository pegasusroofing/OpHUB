/* ================= TILE VISIBILITY BY JOB ROLE (per job) =================
 * Generic version of the Plant/Expenses ⋮ menu: any tile can be shown or
 * hidden per job role on a given job. Stored on sites.tile_visibility as
 * {tileKey: [roles that can see it]}; a key that isn't there uses the tile's
 * default list. PMs/admins always see every tile — for them a tile hidden
 * from operatives is greyed out, with the ⋮ menu to change it. */
const TILE_VIS_ALL = ['site_manager','operative','driver'];
function tileVisRoles(site, key, def){
  const v = site && site.tile_visibility && site.tile_visibility[key];
  return Array.isArray(v) ? v : (def || TILE_VIS_ALL);
}
function canSeeTile(site, key, def, p){
  p = p || ME;
  if(!p) return false;
  if(isFullManager(p) || p.role==='superadmin') return true;
  if(isClient(p)) return true;
  return tileVisRoles(site, key, def).includes(p.role);
}
// t: {href, icon, bg, fg, label, sub, badge, def}
function visTileHtml(site, key, t){
  if(!canSeeTile(site, key, t.def)) return '';
  const full = isFullManager(ME);
  const v = tileVisRoles(site, key, t.def);
  const hiddenFromOps = !v.includes('operative');
  return `<div class="tile ${full && hiddenFromOps ? 'matvis-off' : ''}" style="position:relative;" onclick="go('${t.href}')">
      ${full ? `<div style="position:absolute;top:6px;right:6px;z-index:1;" onclick="event.stopPropagation()">${rowActionsMenuHtml('vistile-'+key, MAT_VIS_ROLES.map(r=>{
        const on = v.includes(r.role);
        return `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;setTileVisibility('${site.id}','${key}','${r.role}',${on?'false':'true'})">${on ? '🙈 Hide from '+r.label : '👁 Show to '+r.label}</div>`;
      }).join(''))}</div>` : ''}
      <div class="icon" style="background:${t.bg};color:${t.fg};">${t.icon}</div>
      <div class="lbl">${t.label}</div>${t.sub ? `<div class="sub">${t.sub}</div>` : ''}
      ${t.badge || ''}
    </div>`;
}
const TILE_VIS_DEFAULTS = {};
window.setTileVisibility = async function(siteId, key, role, on){
  const site = SITES.find(s=>s.id===siteId);
  const cur = tileVisRoles(site, key, TILE_VIS_DEFAULTS[key]).slice();
  const nextRoles = on ? Array.from(new Set(cur.concat(role))) : cur.filter(r=>r!==role);
  const next = Object.assign({}, (site && site.tile_visibility) || {}, {[key]: nextRoles});
  const row = await dbUpdate('sites', siteId, {tile_visibility: next});
  if(row){
    if(site) site.tile_visibility = next;
    const label = (MAT_VIS_ROLES.find(r=>r.role===role)||{}).label || role;
    toast((on ? 'Now shown to ' : 'Hidden from ')+label);
    logSiteActivity(siteId, 'tile_visibility', `${key.replace(/^hs_/,'H&S ').replace(/_/g,' ')} ${on?'shown to':'hidden from'} ${label}`);
  }
  render();
};
// Health & Safety sub-pages → their tile key (used by the router to stop
// someone opening a hidden page from an old link).
const HS_ROUTE_TILE = {rams:'hs_rams', coshh:'hs_coshh', tbt:'hs_tbt', briefings:'hs_briefings', havspuwer:'hs_havspuwer', havs:'hs_havspuwer', puwer:'hs_havspuwer', loler:'hs_havspuwer', incidents:'hs_incidents', operatives:'hs_operatives'};
