/* ================= PLANT (company-wide plant/tool register: check-in/out with PM electronic sign-off) =================
   Plant items (MEWPs, generators, ladders, PAT-tested appliances, etc.) are
   one company-wide pool (plant_items), not per-site — each item currently
   sits at one site (or at the yard/base, current_site_id null) and a
   PM/admin/site manager moves it between sites (plant_transfers is the log
   of that). An operative can request a check-out (with a short pre-use
   plant checklist) or a check-in (return, with a mandatory photo of its
   condition), but nothing actually changes hands until a PM/admin/site
   manager electronically signs it off — same "sign with your own adopted
   signature, whenever, not necessarily in person" model as Toolbox Talks
   (signToolboxTalk), not a hand-the-phone-over flow. Recurring inspection
   due dates (6 or 12 months, chosen per item) live on plant_items itself
   and advance automatically whenever a LOLER Inspection linked to that item
   is submitted (see the plant_item_id hook inside submitReport above).
   RLS gates every plant_items insert/update/delete on is_pm() (pm/admin/
   site_manager — see the migration), so only the sign-off actions below
   (never a plain check-out/check-in request) ever touch that table; that's
   also why a check-out request doesn't flip plant_items.current_status
   itself — an operative isn't allowed to under RLS — plantEffectiveState()
   below derives the right on-screen status from the pending checkout row
   instead, until a PM's sign-off actually flips it. */
const PLANT_CHECKLIST_ITEMS = [
  {key:'q_condition', label:'Condition', text:'Is the item free from visible damage, wear or defects?'},
  {key:'q_guards', label:'Guards & Safety Devices', text:'Are all guards, safety devices and emergency stops fitted and working?'},
  {key:'q_controls', label:'Controls', text:'Do all controls operate correctly and are they clearly labelled?'},
  {key:'q_inspection', label:'Inspection In Date', text:"Is the item's inspection/PAT test still in date?"},
  {key:'q_ppe', label:'PPE', text:'Has the correct PPE for using this item been identified and is it available?'},
];
function plantCategoryLabel(c){ return c==='pat' ? 'PAT Tested Appliance' : 'Plant / Equipment'; }
function plantDueBadge(item){
  if(!item.next_inspection_due) return {label:'No inspection date set', color:'var(--slate)', bg:'var(--line)'};
  const now = new Date(); now.setHours(0,0,0,0);
  const due = new Date(item.next_inspection_due+'T00:00:00');
  const in30 = new Date(now); in30.setDate(in30.getDate()+30);
  const dueStr = due.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  if(due < now) return {label:'Overdue — was due '+dueStr, color:'var(--red)', bg:'var(--warn-bg)'};
  if(due <= in30) return {label:'Due '+dueStr, color:'var(--warn)', bg:'var(--warn-bg)'};
  return {label:'Due '+dueStr, color:'var(--ok)', bg:'var(--ok-bg)'};
}
// Reduces a plant_checkouts list to the single latest row per plant_item_id
// (same "newest row wins per key" idiom used to reduce checkins in
// auto-checkout-2359) so each item card only ever looks at its current cycle.
function latestCheckoutByItem(checkouts){
  const byItem = {};
  checkouts.forEach(c=>{
    const existing = byItem[c.plant_item_id];
    if(!existing || new Date(c.requested_at) > new Date(existing.requested_at)) byItem[c.plant_item_id] = c;
  });
  return byItem;
}
function plantEffectiveState(item, latest){
  if(latest && latest.checkout_status==='pending_signoff' && !latest.checkin_status) return 'pending_checkout_signoff';
  if(item.current_status==='checked_out' && latest && latest.checkin_status==='pending_signoff') return 'pending_checkin_signoff';
  return item.current_status; // 'available' | 'checked_out' | 'out_of_service'
}
let plantAddOpen = false;
let plantAddPhotoFile = null;
let plantAddDraft = {name:'', category:'plant', description:'', serialNumber:'', intervalMonths:12, nextDue:''};
let plantExpandedId = null;
let plantCheckoutAnswers = {}; // itemId -> {qKey: bool} — presence of the key means the checklist form is open
let plantCheckinPhotoFile = {}; // itemId -> File|null — presence of the key means the check-in form is open
let plantCheckinNotesDraft = {}; // itemId -> string
let plantOtherSitesOpen = false;
let plantBusy = false;
window.togglePlantAdd = function(){ plantAddOpen = !plantAddOpen; plantAddPhotoFile = null; plantAddDraft = {name:'', category:'plant', description:'', serialNumber:'', intervalMonths:12, nextDue:''}; render(); };
window.onPlantAddPhotoChosen = function(input){
  plantAddDraft.name = document.getElementById('plantAddName')?.value ?? plantAddDraft.name;
  plantAddDraft.description = document.getElementById('plantAddDesc')?.value ?? plantAddDraft.description;
  plantAddDraft.serialNumber = document.getElementById('plantAddSerial')?.value ?? plantAddDraft.serialNumber;
  plantAddDraft.nextDue = document.getElementById('plantAddDue')?.value ?? plantAddDraft.nextDue;
  plantAddPhotoFile = (input.files && input.files[0]) || null;
  render();
};
window.addPlantItem = async function(siteId){
  const name = document.getElementById('plantAddName').value.trim();
  const description = document.getElementById('plantAddDesc').value.trim();
  const serialNumber = document.getElementById('plantAddSerial').value.trim();
  const nextDue = document.getElementById('plantAddDue').value;
  if(!name){ toast('Enter an item name.'); return; }
  if(!plantAddPhotoFile){ toast('A photo is required to add a plant item.'); return; }
  if(!nextDue){ toast('Set the next inspection due date.'); return; }
  plantBusy = true; render();
  let photoPath;
  try{
    const dataUrl = await compressImage(plantAddPhotoFile);
    photoPath = await uploadDataUrl('operative-tools', ME.org_id+'/plant/'+crypto.randomUUID()+'.jpg', dataUrl);
  }catch(e){ photoPath = null; }
  if(!photoPath){ plantBusy = false; toast('Photo failed to upload — check your connection and try again.'); render(); return; }
  const rows = await dbInsert('plant_items', {
    org_id: ME.org_id, name, category: plantAddDraft.category, description: description||null,
    serial_number: serialNumber||null, photo_path: photoPath, inspection_interval_months: plantAddDraft.intervalMonths,
    next_inspection_due: nextDue, current_site_id: siteId, current_status:'available', created_by: ME.id,
  });
  plantBusy = false;
  if(rows){ toast('Plant item added'); plantAddOpen=false; plantAddPhotoFile=null; render(); }
  else render();
};
window.togglePlantExpand = function(itemId){ plantExpandedId = plantExpandedId===itemId ? null : itemId; render(); };
window.openPlantCheckoutForm = function(itemId){ plantCheckoutAnswers[itemId] = {}; render(); };
window.setPlantChecklistAnswer = function(itemId, key, val){
  plantCheckoutAnswers[itemId][key] = val;
  if(!val) customAlert("This will be flagged to your PM — they may decline the check-out until it's resolved.");
  render();
};
window.submitPlantCheckout = async function(siteId, itemId){
  const answers = plantCheckoutAnswers[itemId] || {};
  if(PLANT_CHECKLIST_ITEMS.some(q=>answers[q.key]===undefined)){ toast('Answer every checklist question first.'); return; }
  const checklist_answers = PLANT_CHECKLIST_ITEMS.map(q=>({key:q.key, label:q.label, answer:!!answers[q.key]}));
  plantBusy = true; render();
  const rows = await dbInsert('plant_checkouts', {
    org_id: ME.org_id, plant_item_id: itemId, site_id: siteId, operative_id: ME.id,
    checklist_answers, checkout_status:'pending_signoff',
  });
  plantBusy = false;
  if(rows){ toast('Check-out requested — awaiting PM sign-off'); delete plantCheckoutAnswers[itemId]; plantExpandedId=null; render(); }
  else render();
};
window.openPlantCheckinForm = function(itemId){ plantCheckinPhotoFile[itemId] = null; plantCheckinNotesDraft[itemId] = ''; render(); };
window.onPlantCheckinPhotoChosen = function(input, itemId){
  plantCheckinNotesDraft[itemId] = document.getElementById('plantCheckinNotes-'+itemId)?.value ?? (plantCheckinNotesDraft[itemId]||'');
  plantCheckinPhotoFile[itemId] = (input.files && input.files[0]) || null;
  render();
};
window.submitPlantCheckin = async function(itemId, checkoutId){
  const file = plantCheckinPhotoFile[itemId];
  if(!file){ toast('A photo is required to check this item back in.'); return; }
  const notes = document.getElementById('plantCheckinNotes-'+itemId)?.value.trim() || '';
  plantBusy = true; render();
  let photoPath;
  try{
    const dataUrl = await compressImage(file);
    photoPath = await uploadDataUrl('operative-tools', ME.org_id+'/plant/'+crypto.randomUUID()+'.jpg', dataUrl);
  }catch(e){ photoPath = null; }
  if(!photoPath){ plantBusy = false; toast('Photo failed to upload — check your connection and try again.'); render(); return; }
  const rows = await dbUpdate('plant_checkouts', checkoutId, {
    checkin_requested_at: new Date().toISOString(), checkin_photo_path: photoPath, checkin_notes: notes||null, checkin_status:'pending_signoff',
  });
  plantBusy = false;
  if(rows){ toast('Check-in submitted — awaiting PM sign-off'); delete plantCheckinPhotoFile[itemId]; delete plantCheckinNotesDraft[itemId]; plantExpandedId=null; render(); }
  else render();
};
window.signPlantCheckout = async function(checkoutId, itemId){
  if(!ME.signature_path){ toast("Adopt your signature first — one tap and it's used everywhere."); go('#/signature'); return; }
  const rows = await dbUpdate('plant_checkouts', checkoutId, {checkout_status:'checked_out', checkout_signed_by:ME.id, checkout_signed_at:new Date().toISOString(), checkout_signature_path:ME.signature_path});
  if(rows){
    await dbUpdate('plant_items', itemId, {current_status:'checked_out'});
    toast('Check-out signed off'); render();
  }
};
window.declinePlantCheckout = async function(checkoutId){
  if(!await customConfirm('Decline this check-out request?')) return;
  const rows = await dbUpdate('plant_checkouts', checkoutId, {checkout_status:'declined'});
  if(rows){ toast('Check-out declined'); render(); }
};
window.signPlantCheckin = async function(checkoutId, itemId){
  if(!ME.signature_path){ toast("Adopt your signature first — one tap and it's used everywhere."); go('#/signature'); return; }
  const rows = await dbUpdate('plant_checkouts', checkoutId, {checkin_status:'returned', checkin_signed_by:ME.id, checkin_signed_at:new Date().toISOString(), checkin_signature_path:ME.signature_path});
  if(rows){
    await dbUpdate('plant_items', itemId, {current_status:'available'});
    toast('Check-in signed off'); render();
  }
};
window.declinePlantCheckin = async function(checkoutId){
  if(!await customConfirm('Decline this check-in? The item stays checked out to the operative.')) return;
  const rows = await dbUpdate('plant_checkouts', checkoutId, {checkin_status:'declined'});
  if(rows){ toast('Check-in declined'); render(); }
};
window.setPlantOutOfService = async function(itemId, outOfService){
  const rows = await dbUpdate('plant_items', itemId, {current_status: outOfService?'out_of_service':'available'});
  if(rows){ toast(outOfService?'Marked out of service':'Marked available'); render(); }
};
window.deletePlantItem = async function(itemId, name){
  if(!await customConfirm(`Remove "${name}" from the plant register? This can't be undone.`)) return;
  const ok = await dbDelete('plant_items', itemId);
  if(ok){ toast('Removed'); render(); }
};
window.togglePlantOtherSites = function(){ plantOtherSitesOpen = !plantOtherSitesOpen; render(); };
window.transferPlantItemHere = async function(itemId, name, siteId){
  if(!await customConfirm(`Bring "${name}" to this site?`)) return;
  const rows = await dbSelect('plant_items', 'id=eq.'+itemId+'&limit=1');
  const item = rows[0];
  if(!item){ toast('Item not found'); return; }
  if(item.current_status!=='available'){ toast("This item is currently checked out or out of service — it can't be transferred right now."); return; }
  await dbInsert('plant_transfers', {org_id:ME.org_id, plant_item_id:itemId, from_site_id:item.current_site_id, to_site_id:siteId, transferred_by:ME.id});
  const updated = await dbUpdate('plant_items', itemId, {current_site_id: siteId});
  if(updated){ toast('Item transferred here'); render(); }
};
function plantChecklistFormHtml(itemId, siteId){
  const answers = plantCheckoutAnswers[itemId] || {};
  return `
    <div class="card" style="margin-top:8px;">
      <p class="sectiontitle" style="margin-top:0;">Pre-Use Plant Checklist</p>
      ${PLANT_CHECKLIST_ITEMS.map(q=>`
        <div class="formfield">
          <label class="field-label">${escapeHtml(q.label)}</label>
          <p class="stub" style="margin:0 0 6px;">${escapeHtml(q.text)}</p>
          <div class="row-gap">${[{v:true,l:'Yes'},{v:false,l:'No'}].map(o=>`<button type="button" class="${answers[q.key]===o.v?'darkbtn':'ghostbtn'}" style="flex:1;" onclick="setPlantChecklistAnswer('${itemId}','${q.key}',${o.v})">${o.l}</button>`).join('')}</div>
        </div>
      `).join('')}
      <button class="darkbtn" ${plantBusy?'disabled':''} onclick="submitPlantCheckout('${siteId}','${itemId}')">${plantBusy?'Submitting…':'Request Check-Out'}</button>
    </div>
  `;
}
function plantCheckinFormHtml(itemId, checkoutId){
  const file = plantCheckinPhotoFile[itemId];
  return `
    <div class="card" style="margin-top:8px;">
      <p class="sectiontitle" style="margin-top:0;">Check In</p>
      <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('plantCheckinPhoto-${itemId}').click()">${file ? 'Photo chosen: '+escapeHtml(file.name) : 'Take Photo of Item (required)'}</div>
      <input type="file" id="plantCheckinPhoto-${itemId}" accept="image/*" capture="environment" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="onPlantCheckinPhotoChosen(this,'${itemId}')">
      <div class="formfield"><label class="field-label">Condition Notes (optional)</label><textarea id="plantCheckinNotes-${itemId}" oninput="plantCheckinNotesDraft['${itemId}']=this.value">${escapeHtml(plantCheckinNotesDraft[itemId]||'')}</textarea></div>
      <button class="darkbtn" ${plantBusy?'disabled':''} onclick="submitPlantCheckin('${itemId}','${checkoutId}')">${plantBusy?'Submitting…':'Request Check-In'}</button>
    </div>
  `;
}
function plantItemCardHtml(item, siteId, latest, canManage){
  const state = plantEffectiveState(item, latest);
  const badge = plantDueBadge(item);
  const expanded = plantExpandedId===item.id;
  const holderName = latest && latest.operative_id ? nameOf(latest.operative_id) : '';
  let statusLine = 'Available';
  if(state==='pending_checkout_signoff') statusLine = `Awaiting PM sign-off — requested by ${escapeHtml(holderName)}`;
  else if(state==='checked_out') statusLine = `Checked out to ${escapeHtml(holderName)}`;
  else if(state==='pending_checkin_signoff') statusLine = `Check-in awaiting PM sign-off — ${escapeHtml(holderName)}`;
  else if(state==='out_of_service') statusLine = 'Out of service';
  const checkoutFormOpen = !!plantCheckoutAnswers[item.id];
  const checkinFormOpen = plantCheckinPhotoFile[item.id]!==undefined;
  return `
    <div class="card" style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="togglePlantExpand('${item.id}')">
        ${item.photo_path ? `<img src="${publicUrl('operative-tools', item.photo_path)}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;flex:0 0 48px;border:1px solid var(--line);" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';">` : `<div class="swatch" style="flex:0 0 48px;width:48px;height:48px;">🏗</div>`}
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:var(--ink);">${escapeHtml(item.name)}</div>
          <div class="stub" style="margin:2px 0 0;">${plantCategoryLabel(item.category)}${item.serial_number ? ' · '+escapeHtml(item.serial_number) : ''}</div>
          <div class="stub" style="margin:2px 0 0;font-weight:700;">${statusLine}</div>
        </div>
        <span style="flex:0 0 auto;font-size:10.5px;font-weight:700;padding:4px 8px;border-radius:20px;background:${badge.bg};color:${badge.color};white-space:nowrap;">${badge.label}</span>
      </div>
      ${expanded ? `
        <div style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px;">
          ${item.description ? `<p class="stub" style="margin:0 0 8px;">${escapeHtml(item.description)}</p>` : ''}
          ${state==='available' && !checkoutFormOpen ? `<button class="darkbtn" onclick="openPlantCheckoutForm('${item.id}')">Check Out</button>` : ''}
          ${state==='available' && checkoutFormOpen ? plantChecklistFormHtml(item.id, siteId) : ''}
          ${state==='checked_out' && latest && latest.operative_id===ME.id && !checkinFormOpen ? `<button class="darkbtn" onclick="openPlantCheckinForm('${item.id}')">Check In</button>` : ''}
          ${state==='checked_out' && latest && latest.operative_id===ME.id && checkinFormOpen ? plantCheckinFormHtml(item.id, latest.id) : ''}
          ${state==='pending_checkout_signoff' && canManage ? `
            <div class="row-gap">
              <button class="darkbtn" style="flex:1;" onclick="signPlantCheckout('${latest.id}','${item.id}')">Sign Off Check-Out</button>
              <button class="ghostbtn" style="flex:1;color:var(--warn);" onclick="declinePlantCheckout('${latest.id}')">Decline</button>
            </div>
          ` : ''}
          ${state==='pending_checkin_signoff' && canManage ? `
            ${latest.checkin_photo_path ? `<img src="${publicUrl('operative-tools', latest.checkin_photo_path)}" style="width:100%;max-width:260px;border-radius:10px;margin-bottom:8px;display:block;">` : ''}
            ${latest.checkin_notes ? `<p class="stub" style="margin:0 0 8px;">Notes: ${escapeHtml(latest.checkin_notes)}</p>` : ''}
            <div class="row-gap">
              <button class="darkbtn" style="flex:1;" onclick="signPlantCheckin('${latest.id}','${item.id}')">Sign Off Check-In</button>
              <button class="ghostbtn" style="flex:1;color:var(--warn);" onclick="declinePlantCheckin('${latest.id}')">Decline</button>
            </div>
          ` : ''}
          ${canManage ? `
            <div class="row-gap" style="margin-top:10px;">
              <button class="ghostbtn" style="flex:1;" onclick="setPlantOutOfService('${item.id}',${state!=='out_of_service'})">${state==='out_of_service'?'Mark Available':'Mark Out Of Service'}</button>
              <button class="ghostbtn" style="flex:1;color:var(--warn);" onclick="deletePlantItem('${item.id}','${jsAttr(item.name)}')">Remove</button>
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}
async function renderPlant(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canManage = isManager(ME);
  await loadAllProfiles();
  const [atSite, otherItems] = await Promise.all([
    dbSelect('plant_items', 'org_id=eq.'+ME.org_id+'&current_site_id=eq.'+siteId+'&order=name.asc'),
    plantOtherSitesOpen ? dbSelect('plant_items', 'org_id=eq.'+ME.org_id+'&or=(current_site_id.neq.'+siteId+',current_site_id.is.null)&order=name.asc') : Promise.resolve([]),
  ]);
  const allIds = atSite.map(i=>i.id);
  const checkouts = allIds.length ? await dbSelect('plant_checkouts', 'plant_item_id=in.('+allIds.join(',')+')&order=requested_at.desc') : [];
  const latestByItem = latestCheckoutByItem(checkouts);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 12px;">Check plant and equipment in and out — every check-out and check-in needs a Project Manager's electronic sign-off.</p>
    ${atSite.map(item=>plantItemCardHtml(item, siteId, latestByItem[item.id], canManage)).join('') || `<div class="empty">No plant assigned to this site yet.</div>`}
    ${canManage ? `
      <p class="sectiontitle" style="margin-top:18px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="togglePlantOtherSites()">
        <span>Plant At Other Sites / Yard</span><span class="arrow">${plantOtherSitesOpen?'▼':'▶'}</span>
      </p>
      ${plantOtherSitesOpen ? (otherItems.map(item=>`
        <div class="sitecard">
          <div class="info"><div class="name">${escapeHtml(item.name)}</div><div class="addr">${item.current_site_id ? (SITES.find(s=>s.id===item.current_site_id)?.name || 'Another site') : 'At the yard / base'} · ${item.current_status==='available'?'Available':(item.current_status==='out_of_service'?'Out of service':'Checked out')}</div></div>
          ${item.current_status==='available' ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="transferPlantItemHere('${item.id}','${jsAttr(item.name)}','${siteId}')">Bring Here</button>` : ''}
        </div>
      `).join('') || `<div class="empty">No plant elsewhere.</div>`) : ''}
      <button class="darkbtn" style="margin-top:14px;" onclick="togglePlantAdd()">${plantAddOpen?'Cancel':'+ Add Plant Item'}</button>
      ${plantAddOpen ? `
        <div class="card" style="margin-top:10px;">
          <p class="sectiontitle" style="margin-top:0;">Add Plant Item</p>
          <div class="formfield" style="margin-top:0;"><input type="text" id="plantAddName" placeholder="Item name, e.g. Genie GS-1930 MEWP" value="${escapeHtml(plantAddDraft.name)}" oninput="plantAddDraft.name=this.value"></div>
          <div class="row-gap" style="margin-bottom:10px;">${[{v:'plant',l:'Plant / Equipment'},{v:'pat',l:'PAT Tested Appliance'}].map(o=>`<button type="button" class="${plantAddDraft.category===o.v?'darkbtn':'ghostbtn'}" style="flex:1;" onclick="plantAddDraft.category='${o.v}';render()">${o.l}</button>`).join('')}</div>
          <div class="formfield"><input type="text" id="plantAddSerial" placeholder="Serial / identification number" value="${escapeHtml(plantAddDraft.serialNumber)}" oninput="plantAddDraft.serialNumber=this.value"></div>
          <div class="formfield"><textarea id="plantAddDesc" placeholder="Description (optional)" oninput="plantAddDraft.description=this.value">${escapeHtml(plantAddDraft.description)}</textarea></div>
          <label class="field-label">Recurring Inspection Interval</label>
          <div class="row-gap" style="margin-bottom:10px;">${[6,12].map(m=>`<button type="button" class="${plantAddDraft.intervalMonths===m?'darkbtn':'ghostbtn'}" style="flex:1;" onclick="plantAddDraft.intervalMonths=${m};render()">Every ${m} months</button>`).join('')}</div>
          <div class="formfield" onclick="openDatePickerRow(this)"><label class="field-label">Next Inspection Due</label><input type="date" id="plantAddDue" value="${escapeHtml(plantAddDraft.nextDue)}" oninput="plantAddDraft.nextDue=this.value"></div>
          <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('plantAddPhotoInput').click()">${plantAddPhotoFile ? 'Photo chosen: '+escapeHtml(plantAddPhotoFile.name) : 'Choose Photo (required)'}</div>
          <input type="file" id="plantAddPhotoInput" accept="image/*" capture="environment" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="onPlantAddPhotoChosen(this)">
          <button class="darkbtn" ${plantBusy?'disabled':''} onclick="addPlantItem('${siteId}')">${plantBusy?'Saving…':'Save Item'}</button>
        </div>
      ` : ''}
    ` : ''}
  `, {title:'Plant', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/materials`, siteId, activeTab:'materials'}); }
}
