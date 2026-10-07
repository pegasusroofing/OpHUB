/* ================= MULTI-SITE: addresses CRUD (Settings & Admin "Multi-Site" section) ================= */
let assignTeamSubAddresses = []; // cache of the current site's sub-addresses, refreshed each renderAssignTeam()
let subAddrFormOpen = false;
let subAddrEditingId = null;
let subAddrNameDraft = '';
let subAddrAddressDraft = '';
let subAddrPostcodeDraft = '';
window.toggleMultiSite = async function(siteId, checked){
  const row = await dbUpdate('sites', siteId, {multi_site: checked});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast(checked ? 'Multi-site enabled — add its addresses below' : 'Multi-site disabled');
    render();
  }
};
window.toggleRepairContract = async function(siteId, checked){
  const row = await dbUpdate('sites', siteId, {repair_contract: checked});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast(checked ? 'Repair Contract enabled — this project now opens straight into its repair jobs list' : 'Repair Contract disabled');
    if(checked) go('#/site/'+siteId+'/home'); else render();
  }
};
window.toggleSubAddrForm = function(editId){
  if(editId){
    const addr = (assignTeamSubAddresses||[]).find(a=>a.id===editId);
    subAddrEditingId = editId;
    subAddrNameDraft = addr ? (addr.name||'') : '';
    subAddrAddressDraft = addr ? (addr.address||'') : '';
    subAddrPostcodeDraft = addr ? (addr.postcode||'') : '';
    subAddrFormOpen = true;
  } else {
    subAddrFormOpen = !subAddrFormOpen;
    subAddrEditingId = null;
    subAddrNameDraft = ''; subAddrAddressDraft = ''; subAddrPostcodeDraft = '';
  }
  render();
};
window.saveSubAddress = async function(siteId){
  const name = document.getElementById('subAddrName').value.trim();
  const address = document.getElementById('subAddrAddress').value.trim();
  const postcode = document.getElementById('subAddrPostcode').value.trim();
  if(!name){ toast('Enter a name for this address.'); return; }
  if(subAddrEditingId){
    const row = await dbUpdate('site_sub_addresses', subAddrEditingId, {name, address: address||null, postcode: postcode||null});
    if(!row) return;
    toast('Address updated');
  } else {
    const rows = await dbInsert('site_sub_addresses', {site_id:siteId, org_id:ME.org_id, name, address: address||null, postcode: postcode||null, created_by:ME.id});
    if(!rows) return;
    toast('Address added');
  }
  subAddrFormOpen = false; subAddrEditingId = null; subAddrNameDraft=''; subAddrAddressDraft=''; subAddrPostcodeDraft='';
  render();
};
window.deleteSubAddress = async function(siteId, subId){
  if(!await customConfirm('Delete this address? Any tasks or check-ins already linked to it keep their history but will show as unlinked. This can\'t be undone.')) return;
  const rows = await dbSelect('site_sub_addresses', 'id=eq.'+subId+'&select=name');
  const name = rows[0] && rows[0].name;
  const ok = await dbDelete('site_sub_addresses', subId);
  if(ok){ toast('Address deleted'); logSiteActivity(siteId, 'sub_address_deleted', `Deleted address "${name||''}"`); render(); }
};
// Closing an address is a PM/admin action, reachable from that address's own
// Check In page — it stays fully visible everywhere (history, schedule
// links) but drops out of the main "choose an address" list into a
// collapsed "Closed Addresses" section at the bottom, and stops offering
// fresh check-ins (someone already checked in can still check out).
window.closeSubAddress = async function(siteId, subId){
  if(!await customConfirm('Close this address? It\'ll move into the Closed Addresses list and new check-ins there will be switched off. You can reopen it any time.')) return;
  const row = await dbUpdate('site_sub_addresses', subId, {closed:true, closed_by:ME.id, closed_at:new Date().toISOString()});
  if(row){ toast('Address closed'); logSiteActivity(siteId, 'sub_address_closed', `Closed address "${row.name||''}"`); render(); }
};
window.reopenSubAddress = async function(subId){
  const row = await dbUpdate('site_sub_addresses', subId, {closed:false, closed_by:null, closed_at:null});
  if(row){ toast('Address reopened'); render(); }
};
