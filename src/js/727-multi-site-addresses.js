/* ================= MULTI-SITE JOBS — choosing the address =================
 * A multi-site job (site.multi_site) has several addresses
 * (site_sub_addresses). Deliveries and material requests/orders on such a
 * job ask which address it's for; the choice is stored as sub_site_id plus a
 * ready-to-show sub_site_label ("Block A — 12 High St, AB1 2CD") so lists,
 * the driver and emails can show it without another lookup. */
const SUB_ADDR_CACHE = {};
async function loadSubAddrs(siteId){
  if(!siteId) return [];
  const rows = await dbSelect('site_sub_addresses', 'site_id=eq.'+siteId+'&order=name.asc');
  SUB_ADDR_CACHE[siteId] = (rows||[]).filter(a=>!a.closed);
  return SUB_ADDR_CACHE[siteId];
}
function subAddrLabel(a){
  if(!a) return '';
  const addr = [a.address, a.postcode].filter(Boolean).join(', ');
  return (a.name||'') + (addr ? ' — '+addr : '');
}
function siteIsMulti(siteId){ const s = SITES.find(x=>x.id===siteId); return !!(s && s.multi_site); }
// <select> of a multi-site job's addresses (nothing for a normal job).
function subAddrSelectHtml(selId, siteId, selected, onchange, label){
  if(!siteIsMulti(siteId)) return '';
  const list = SUB_ADDR_CACHE[siteId] || [];
  return `<div class="formfield"><label class="field-label">${label || 'Which address on this job?'}</label>
    <select id="${selId}" ${onchange ? `onchange="${onchange}"` : ''}>
      <option value="">— Choose address —</option>
      ${list.map(a=>`<option value="${a.id}" ${selected===a.id?'selected':''}>${escapeHtml(subAddrLabel(a))}</option>`).join('')}
    </select>${list.length ? '' : `<p class="stub" style="margin:4px 0 0;">No addresses added to this job yet — add them in the job's Settings › Multi-Site.</p>`}</div>`;
}
function readSubAddr(selId, siteId){
  const el = document.getElementById(selId);
  const id = el ? el.value : '';
  if(!id) return {sub_site_id:null, sub_site_label:null};
  const a = (SUB_ADDR_CACHE[siteId]||[]).find(x=>x.id===id);
  return {sub_site_id:id, sub_site_label: a ? subAddrLabel(a) : null};
}
function subAddrPill(label){
  return label ? `<span class="subaddrpill">📍 ${escapeHtml(label)}</span>` : '';
}
