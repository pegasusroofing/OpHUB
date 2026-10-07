/* ================= PRICING ELEMENTS ================= */
// #400: a site's Price page is split into named "Pricing Elements" (e.g.
// "Flat Roofing", "Pitched Roofing") — each with its own Price Total/Booked
// In/Balance, weekly build-up, Price Sheet, Labour Invoices, Variations to
// Price and its own "who can see it" access, so a multi-trade job doesn't
// have to lump everything into one figure. The Overview card at the top of
// the Price tile auto-totals every element's Price Total into one figure
// and every element's Booked In into another.
let priceElementOpen = {};          // elementId -> expanded/collapsed; open by default
let priceElementSelected = {};      // elementId -> true while ticked for bulk-close
let priceElementRenamingId = null;  // element currently being renamed, or null
let priceElementRenameDraft = '';
let priceElementAddOpen = {};       // scopeKey (site, or site+sub-address) -> add-form open
let priceElementAddName = '';
let priceClosedGroupOpen = false;   // the "Closed" group dropdown at the bottom of the Price tile
let priceSubAddrSelected = {};      // siteId -> currently-selected sub_site_id, for multi-site jobs
let priceElementOperativesPickerFor = null; // elementId whose "Select Operatives" popup is open, or null
function priceScopeKey(siteId, subSiteId){ return siteId+'__'+(subSiteId||'none'); }
window.togglePriceElementAdd = function(siteId, subSiteId){
  const key = priceScopeKey(siteId, subSiteId);
  priceElementAddOpen[key] = !priceElementAddOpen[key];
  priceElementAddName = '';
  render();
};
window.addPricingElement = async function(siteId, subSiteId){
  const key = priceScopeKey(siteId, subSiteId);
  const input = document.getElementById('newPricingElementName_'+key);
  const name = String(input ? input.value : priceElementAddName || '').trim();
  if(!name){ toast('Enter a name for the Pricing Element'); return; }
  const existing = await dbSelect('pricing_elements', 'site_id=eq.'+siteId+(subSiteId?('&sub_site_id=eq.'+subSiteId):'&sub_site_id=is.null')+'&select=sort_order&order=sort_order.desc&limit=1');
  const nextOrder = existing.length ? Number(existing[0].sort_order||0)+1 : 0;
  const rows = await dbInsert('pricing_elements', {site_id:siteId, sub_site_id:subSiteId||null, name, sort_order:nextOrder, created_by:ME.id});
  if(!rows) return;
  priceElementAddOpen[key] = false;
  priceElementAddName = '';
  toast('Pricing Element added');
  render();
};
window.startRenamePricingElement = function(elementId, currentName){
  priceElementRenamingId = elementId;
  priceElementRenameDraft = currentName || '';
  render();
};
window.cancelRenamePricingElement = function(){ priceElementRenamingId = null; render(); };
window.saveRenamePricingElement = async function(elementId){
  const input = document.getElementById('renamePricingElement_'+elementId);
  const name = String(input ? input.value : priceElementRenameDraft || '').trim();
  if(!name){ toast('Enter a name'); return; }
  const row = await dbUpdate('pricing_elements', elementId, {name});
  if(!row) return;
  priceElementRenamingId = null;
  toast('Renamed');
  render();
};
window.deletePricingElement = async function(elementId, name){
  if(!await customConfirm(`Delete the Pricing Element "${name||''}"? This deletes its price total, build-up, price sheet, labour invoices and variations. This can't be undone.`)) return;
  const ok = await dbDelete('pricing_elements', elementId);
  if(ok){
    delete priceElementSelected[elementId];
    toast('Pricing Element deleted');
    render();
  }
};
window.togglePricingElementSelected = function(elementId){
  if(priceElementSelected[elementId]) delete priceElementSelected[elementId];
  else priceElementSelected[elementId] = true;
  render();
};
window.closeSelectedPricingElements = async function(){
  const ids = Object.keys(priceElementSelected);
  if(!ids.length){ toast('Select at least one Pricing Element'); return; }
  for(const id of ids){
    await dbUpdate('pricing_elements', id, {closed:true, closed_by:ME.id, closed_at:new Date().toISOString()});
  }
  priceElementSelected = {};
  toast(ids.length===1 ? 'Pricing Element closed' : ids.length+' Pricing Elements closed');
  render();
};
window.reopenPricingElement = async function(elementId){
  const row = await dbUpdate('pricing_elements', elementId, {closed:false, closed_by:null, closed_at:null});
  if(row){ toast('Reopened'); render(); }
};
window.togglePriceElementOperativesPicker = function(elementId){
  priceElementOperativesPickerFor = priceElementOperativesPickerFor===elementId ? null : elementId;
  render();
};
// #410: "Include in summary" — ticked on by default. Unticking an element
// only excludes it from the Overview card's totals at the top of the Price
// tile; the element's own card still shows its own figures as normal (per
// the user's confirmed answer).
window.toggleIncludeInSummary = async function(elementId, checked){
  const row = await dbUpdate('pricing_elements', elementId, {include_in_summary: checked});
  if(row){ toast(checked ? 'Included in summary' : 'Excluded from summary'); render(); }
};
// PM-only toggle, defaults OFF: while an element is closed, an operative
// (even one with price access) sees it collapsed with no figures at all
// unless a PM switches this on for that element.
window.togglePricingElementShowWhenClosed = async function(elementId, checked){
  const row = await dbUpdate('pricing_elements', elementId, {closed_show_price_to_operatives: checked});
  if(row){ toast(checked ? 'Operatives can see the price while closed' : 'Price hidden from operatives while closed'); render(); }
};
/* ---- Price files — manual multi-upload (PDF/Excel), no OneDrive link.
   Each upload is its own row in price_files; view/download goes through
   the price-file-access edge function, which is the only thing allowed to
   touch the private price-files bucket. ---- */
let priceFilePreview = {path:null, filename:null, loading:false, error:null, sheetHtml:null};
let priceFileApplyToAll = {}; // elementId -> checkbox state on the upload form, before upload
window.togglePriceFileApplyToAll = function(elementId, checked){ priceFileApplyToAll[elementId] = checked; };
// #400: "Apply to all" ticks element_id to null (and stamps sub_site_id so a
// multi-site job's sheet only spreads to elements of the SAME address) — the
// file then shows up under every Pricing Element at that address instead of
// being duplicated per element, and one Delete removes it everywhere at once.
window.uploadPriceFiles = async function(siteId, elementId, subSiteId, input){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length) return;
  const applyToAll = !!priceFileApplyToAll[elementId];
  let uploaded = 0;
  for(const file of files){
    const path = siteId+'/price/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-_]/gi,'_');
    const stored = await uploadToStorage('price-files', path, file, file.type);
    if(!stored) continue;
    const rows = await dbInsert('price_files', {site_id:siteId, element_id: applyToAll?null:elementId, sub_site_id: applyToAll?(subSiteId||null):null, filename:file.name, storage_path:stored, content_type:file.type||null, uploaded_by:ME.id});
    if(rows) uploaded++;
  }
  input.value = '';
  priceFileApplyToAll[elementId] = false;
  if(uploaded){ toast(uploaded===1 ? 'File uploaded' : uploaded+' files uploaded'); render(); }
};
window.deletePriceFile = async function(siteId, fileId, storagePath){
  if(!await customConfirm('Delete this price file? This can\'t be undone. If it was applied to all elements, it will be removed from all of them.')) return;
  const rows = await dbSelect('price_files', 'id=eq.'+fileId+'&select=filename');
  const filename = rows[0] && rows[0].filename;
  try{ await sbFetch('/storage/v1/object/price-files/'+storagePath, {method:'DELETE'}); }catch(e){}
  const ok = await dbDelete('price_files', fileId);
  if(ok){
    toast('File deleted');
    logSiteActivity(siteId, 'price_file_deleted', `Deleted price file "${filename||''}"`);
    if(priceFilePreview.path===storagePath) priceFilePreview = {path:null, filename:null, loading:false, error:null, sheetHtml:null};
    render();
  }
};
window.viewPriceFile = async function(siteId, storagePath, filename){
  const isSheet = /\.(xlsx|xls|csv)$/i.test(filename);
  if(!isSheet){
    const res = await sbFetchOD('/functions/v1/price-file-access', {method:'POST', body:JSON.stringify({site_id:siteId, storage_path:storagePath})});
    const d = await res.json();
    if(!res.ok || d.error || !d.url){ toast(d.error || 'Could not open file.'); return; }
    if(/\.pdf$/i.test(filename)){ await viewPdfInApp(d.url, filename); return; }
    await openExternalFile(d.url);
    return;
  }
  priceFilePreview = {path:storagePath, filename, loading:true, error:null, sheetHtml:null};
  render();
  try{
    const res = await sbFetchOD('/functions/v1/price-file-access', {method:'POST', body:JSON.stringify({site_id:siteId, storage_path:storagePath})});
    const d = await res.json();
    if(!res.ok || d.error || !d.url){ priceFilePreview = {path:storagePath, filename, loading:false, error: d.error || 'Could not load the file.', sheetHtml:null}; render(); return; }
    if(!(await loadLib('XLSX'))){ priceFilePreview = {path:storagePath, filename, loading:false, error:'Excel library failed to load — check connection.', sheetHtml:null}; render(); return; }
    const buf = await (await fetch(d.url)).arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const html = XLSX.utils.sheet_to_html(firstSheet, {id:'priceSheetTable'});
    priceFilePreview = {path:storagePath, filename, loading:false, error:null, sheetHtml:html};
  }catch(e){
    priceFilePreview = {path:storagePath, filename, loading:false, error:'Could not open the file.', sheetHtml:null};
  }
  render();
};
window.closePriceFilePreview = function(){ priceFilePreview = {path:null, filename:null, loading:false, error:null, sheetHtml:null}; render(); };
let additionalWorksFormOpen = {}; // elementId -> "Variation to Price Request" add-form toggle
let priceFilesSectionOpen = {}; // elementId -> Price Sheet ddrow; undefined = not yet toggled (auto-open while empty)
// #307: Variation to Price auto-expands by default (was: only auto-open
// while empty) — true until the operative/PM explicitly collapses it.
let variationSectionOpen = {}; // elementId -> bool, default true (read with ??true below)
// #310: "Weekly price costs" (Booked In) is a dropdown too, but unlike the
// other two above it defaults OPEN rather than open-only-while-empty — true
// until the user explicitly collapses it.
let weeklyPriceSectionOpen = {}; // elementId -> bool, default true (read with ??true below)
// Each individual week row inside "Booked In" collapses to a one-line
// summary once it's not the latest week — only the current/latest week (the
// one you'd actually still be filling in) opens by default; anything older
// is history you can still expand, just not what the page leads with.
let priceWeekRowOpen = {}; // `${elId}:${wk}` -> explicit bool override, else defaults to (wk===latest week)
function priceWeekRowIsOpen(elId, wk, isLatest){
  const key = elId+':'+wk;
  return priceWeekRowOpen[key] !== undefined ? priceWeekRowOpen[key] : isLatest;
}
window.togglePriceWeekRow = function(elId, wk, isLatest){
  const key = elId+':'+wk;
  priceWeekRowOpen[key] = !priceWeekRowIsOpen(elId, wk, isLatest);
  render();
};
let awRevisingId = null; // id of the additional_works_requests row currently being revised/revisited by a PM, or null
let awRevisingOriginalStatus = null; // status the row was in when revision started — decides what Save does (see saveRevisedAdditionalWorks)
let awRejectingId = null; // id of the row whose reject-reason box is open (#301)
let awRejectReasonDraft = '';
// Best-effort push notification to the operative who raised the request —
// never blocks the approve/reject/revise action it's attached to.
async function notifyVariationDecision(siteId, userId, decision){
  try{
    const site = SITES.find(s=>s.id===siteId);
    await sbFetch('/functions/v1/notify-variation-decision', {method:'POST', body: JSON.stringify({site_id:siteId, user_id:userId, decision, site_name: site?site.name:''})});
  }catch(e){ /* silent — push delivery is best-effort */ }
}
window.submitAdditionalWorksRequest = async function(siteId, elementId){
  const amtInput = document.getElementById('awAmount_'+elementId);
  const noteInput = document.getElementById('awNote_'+elementId);
  const amount = Number(amtInput ? amtInput.value : '');
  const note = String(noteInput ? noteInput.value : '').trim();
  if(!amount || isNaN(amount) || amount<=0){ toast('Enter an amount'); return; }
  if(!note){ toast('Explain the variation'); return; }
  const rows = await dbInsert('additional_works_requests', {site_id:siteId, element_id:elementId, amount, note, requested_by:ME.id});
  if(!rows) return;
  const site = SITES.find(s=>s.id===siteId);
  const fmt = n => '£' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
  postSystemMessage(siteId, 'additional_works_requested', `${site?site.name:''}: Variation to price requested for ${fmt(amount)} — needs approval.`);
  toast('Request added');
  render();
};
window.approveAdditionalWorks = async function(siteId, id){
  const row = await dbUpdate('additional_works_requests', id, {status:'approved', approved_by:ME.id, approved_at:new Date().toISOString(), rejection_reason:null});
  if(row){ toast('Approved'); notifyVariationDecision(siteId, row.requested_by, 'approved'); render(); }
};
// #301: rejecting now takes a reason — opens a small inline textbox rather
// than rejecting instantly. The reason is stored and shown on the row
// afterward (rejection_reason), and the operative gets a push notification.
window.startRejectAdditionalWorks = function(id){ awRejectingId = id; awRejectReasonDraft = ''; render(); };
window.cancelRejectAdditionalWorks = function(){ awRejectingId = null; render(); };
window.confirmRejectAdditionalWorks = async function(siteId, id){
  const input = document.getElementById('awRejectReason');
  const reason = String(input ? input.value : awRejectReasonDraft || '').trim();
  if(!reason){ toast('Enter a reason for rejecting.'); return; }
  const row = await dbUpdate('additional_works_requests', id, {status:'rejected', approved_by:ME.id, approved_at:new Date().toISOString(), rejection_reason:reason});
  if(row){
    awRejectingId = null;
    toast('Rejected');
    notifyVariationDecision(siteId, row.requested_by, 'rejected');
    render();
  }
};
// #300: neither startReviseAdditionalWorks nor either save path below ever
// touches a "closed"/completed state — pricing/approving a variation stays
// fully independent of closing it, so nothing here auto-closes/completes a
// variation just because it's been priced.
window.startReviseAdditionalWorks = function(id, currentStatus){ awRevisingId = id; awRevisingOriginalStatus = currentStatus; render(); };
window.cancelReviseAdditionalWorks = function(){ awRevisingId = null; awRevisingOriginalStatus = null; render(); };
// #301/#302: what Save does depends on the status the row was in when the
// PM opened it — a pending row gets revised AND approved in one step
// ("Revise and Approve"); a rejected row gets revised and resubmitted for a
// fresh decision ("Revisit" — #302), not auto-approved.
window.saveRevisedAdditionalWorks = async function(siteId, id){
  const amtInput = document.getElementById('awReviseAmount');
  const noteInput = document.getElementById('awReviseNote');
  const amount = Number(amtInput ? amtInput.value : '');
  const note = String(noteInput ? noteInput.value : '').trim();
  if(!amount || isNaN(amount) || amount<=0){ toast('Enter an amount'); return; }
  if(!note){ toast('Explain the variation'); return; }
  const wasRejected = awRevisingOriginalStatus==='rejected';
  const wasApproved = awRevisingOriginalStatus==='approved';
  // #321: a PM/admin can still edit an already-approved variation's amount/note
  // in place — it stays approved (no re-approval step needed) rather than
  // being locked out entirely once approved, as it was before.
  const patch = wasRejected
    ? {amount, note, status:'pending', approved_by:null, approved_at:null, rejection_reason:null}
    : wasApproved
    ? {amount, note}
    : {amount, note, status:'approved', approved_by:ME.id, approved_at:new Date().toISOString(), rejection_reason:null};
  const row = await dbUpdate('additional_works_requests', id, patch);
  if(!row) return;
  awRevisingId = null; awRevisingOriginalStatus = null;
  toast(wasRejected ? 'Revised — resubmitted for approval' : wasApproved ? 'Variation updated' : 'Revised and approved');
  if(!wasApproved) notifyVariationDecision(siteId, row.requested_by, wasRejected ? 'reopened' : 'revised_approved');
  render();
};
// #308: small "+" photo-upload button on the variation-to-price row —
// deliberately not a full standalone upload panel, just one quick photo.
window.uploadAwPhoto = async function(input, siteId, id){
  const file = input.files && input.files[0]; if(!file) return;
  try{
    const dataUrl = await compressImage(file);
    const path = await uploadDataUrl('site-photos', siteId+'/variations-to-price/'+id+'-'+crypto.randomUUID()+'.jpg', dataUrl);
    if(!path) return;
    const row = await dbUpdate('additional_works_requests', id, {photo_path:path});
    if(row){ toast('Photo added'); render(); }
  }catch(e){ toast('Could not process photo.'); }
};
window.deleteAdditionalWorksRequest = async function(siteId, id){
  if(!await customConfirm('Remove this variation request?')) return;
  const rows = await dbSelect('additional_works_requests', 'id=eq.'+id+'&select=note');
  const note = rows[0] && rows[0].note;
  const ok = await dbDelete('additional_works_requests', id);
  if(ok){ if(awRevisingId===id) awRevisingId=null; toast('Request removed'); logSiteActivity(siteId, 'variation_to_price_deleted', `Deleted variation to price request "${note||''}"`); render(); }
};
// #400: price_total / price_booked_override now live on the Pricing
// Element the figure belongs to, not on the site itself.
window.savePriceField = async function(elementId, field, rawValue){
  const v = String(rawValue||'').trim();
  const patch = {};
  if(v===''){
    patch[field] = null;
  } else {
    const n = Number(v);
    if(isNaN(n)){ toast('Enter a number'); render(); return; }
    patch[field] = n;
  }
  await dbUpdate('pricing_elements', elementId, patch);
  render();
};
window.savePriceNote = async function(siteId, field, rawValue){
  const row = await dbUpdate('sites', siteId, {[field]: rawValue.trim() || null});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
  }
};
// #306 — operative-submitted weekly value entries, held pending until a PM
// approves them (at which point the amount is added onto the official
// price_weeks figure for that week). Minimal version: one free-text week
// number + amount per submission, rather than a fixed per-operative grid —
// there was no existing "assigned operatives individually input weekly
// values" feature to extend (task #299 covering that isn't in this batch),
// so this is built from scratch to satisfy #306 on its own.
// #317: per-operative weekly build-up. Entries are made directly by whoever
// already has price-tab access for the site (PM/admin, or an operative
// granted site_price_access) — the same authorization that already gates
// the Price tab and Variation-to-Price requests. There is no separate
// approval step: the person entering a value is already authorized, so it
// counts immediately and rolls straight into that week's total.
let priceOpBreakdownOpen = {}; // per-week expand state, keyed `${elementId}_${week}` — open by default once a week has entries
// #319: two extra row kinds sit alongside the auto-populated assigned rows
// in the same build-up, sharing the price_week_operative_entries table via
// a `kind` column ('assigned' | 'extra_operative' | 'cost') — an
// extra_operative row is keyed by operative_id just like an assigned row
// (so it can reuse savePriceWeekOperativeEntry for edit/clear), while a
// cost row has no operative and is addressed by its own id instead.
// #323: the old separate "+ Add operative" / "+ Add cost" buttons are merged
// into one "+ Add" control — priceAddOpen toggles the inline picker, and
// priceAddType ('operative'|'manual'|'cost') selects which fields it shows.
// 'operative' picks an existing org operative; 'manual' is a free-text name
// for someone not in the system (kind:'extra_operative', operative_id:null,
// label set — the same row shape a cost line already uses).
let priceAddOpen = {}; // per-week "+ Add" inline-picker open state, keyed `${elementId}_${week}`
let priceAddType = {}; // per-week selected add-type once opened: 'operative' | 'manual' | 'cost'
function priceWeekOperativeBreakdownHtml(elementId, siteId, wk, assignedOperatives, orgOperatives, entriesForWeek, extraOpEntries, costEntries, fmt){
  const key = elementId+'_'+wk;
  const open = priceOpBreakdownOpen[key] !== undefined ? priceOpBreakdownOpen[key] : (Object.keys(entriesForWeek).length>0 || extraOpEntries.length>0 || costEntries.length>0);
  const sum = Object.values(entriesForWeek).reduce((s,v)=>s+Number(v||0), 0)
    + extraOpEntries.reduce((s,e)=>s+Number(e.amount||0), 0)
    + costEntries.reduce((s,e)=>s+Number(e.amount||0), 0);
  const adding = !!priceAddOpen[key];
  const addType = priceAddType[key] || 'operative';
  // #340: an operative can be added as an extra row more than once in the
  // same week (e.g. two separate pieces of work), so the picker no longer
  // excludes operatives already present as an extra row.
  const pickable = orgOperatives;
  // #350: table-like grid (name / value / action) so every row kind — an
  // assigned operative, an extra person, a one-off cost, and the subtotal —
  // lines up in the same three columns instead of each drifting slightly
  // depending on label length; a fixed value-column width keeps the £
  // figures reading as a clean vertical strip even once a long operative
  // name wraps onto a second line. Row kinds get a faint group tint so the
  // eye can tell "assigned" from "extra" from "cost" at a glance, and the
  // total sits below a solid divider like a receipt subtotal.
  const rowGrid = 'display:grid;grid-template-columns:1fr 96px 26px;column-gap:8px;align-items:center;';
  const groupLabel = (text)=>`<div style="grid-column:1/-1;font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--slate-light);padding:7px 10px 2px;">${text}</div>`;
  return `
    <div style="margin:-6px 0 12px;">
      <p class="ddrow" style="margin:0;padding:6px 0;border:none;border-radius:0;background:transparent;font-size:11.5px;" onclick="priceOpBreakdownOpen['${key}']=${!open};render()">
        <span class="arrow">${open?'▼':'▶'}</span> Build-up${sum ? ' — '+fmt(sum) : ''}
      </p>
      ${open ? `
      <div style="border:1px solid var(--line);border-radius:10px;background:var(--card);overflow:hidden;">
        <div style="display:grid;">
          ${assignedOperatives.length ? groupLabel('Operatives') : ''}
          ${assignedOperatives.map(o=>`
            <div style="${rowGrid}padding:6px 10px;border-bottom:1px solid var(--line);">
              <label class="field-label" style="font-weight:600;margin:0;text-transform:none;letter-spacing:normal;font-size:12.5px;overflow-wrap:anywhere;">${escapeHtml(o.name)}</label>
              <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" step="0.01" inputmode="decimal" value="${entriesForWeek[o.id]!=null?entriesForWeek[o.id]:''}" placeholder="0.00" style="width:100%;" onblur="savePriceWeekOperativeEntry('${elementId}','${siteId}',${wk},'${o.id}',this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"></div>
              ${entriesForWeek[o.id]!=null ? `<div class="roundplusbtn" style="width:24px;height:24px;font-size:14px;" title="Remove" onclick="savePriceWeekOperativeEntry('${elementId}','${siteId}',${wk},'${o.id}','')">×</div>` : ''}
            </div>
          `).join('')}
          ${extraOpEntries.length ? groupLabel('Added') : ''}
          ${extraOpEntries.map(e=>{
            // Manual (not-in-system) entries have no operative_id — name
            // comes from `label` instead, and edits go by row id (like a
            // cost line) since there's no operative_id to key an upsert off
            // of.
            const isManualName = !e.operative_id;
            const p = isManualName ? null : PROFILES[e.operative_id];
            const name = isManualName ? (e.label||'Unnamed') : (p?p.name:'Unknown');
            // #340: extra_operative rows are no longer unique per operative
            // (the same person can have several rows in a week), so edits go
            // by this row's own id — same path a manual/cost row already
            // used — rather than an upsert keyed on operative_id.
            return `
            <div style="${rowGrid}padding:6px 10px;border-bottom:1px solid var(--line);background:color-mix(in srgb, var(--brand1) 4%, transparent);">
              <label class="field-label" style="font-weight:600;margin:0;text-transform:none;letter-spacing:normal;font-size:12.5px;overflow-wrap:anywhere;">${escapeHtml(name)}</label>
              <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" step="0.01" inputmode="decimal" value="${e.amount!=null?e.amount:''}" placeholder="0.00" style="width:100%;" onblur="savePriceWeekCostLineValue('${elementId}','${siteId}',${wk},'${e.id}',this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"></div>
              <div class="roundplusbtn" style="width:24px;height:24px;font-size:14px;" title="Remove" onclick="deletePriceWeekExtraEntry('${elementId}','${siteId}',${wk},'${e.id}')">×</div>
            </div>
          `;}).join('')}
          ${costEntries.length ? groupLabel('One-off costs') : ''}
          ${costEntries.map(e=>`
            <div style="${rowGrid}padding:6px 10px;border-bottom:1px solid var(--line);background:var(--warn-bg);">
              <label class="field-label" style="font-weight:600;margin:0;text-transform:none;letter-spacing:normal;font-size:12.5px;overflow-wrap:anywhere;">${escapeHtml(e.label)}</label>
              <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" step="0.01" inputmode="decimal" value="${e.amount!=null?e.amount:''}" placeholder="0.00" style="width:100%;" onblur="savePriceWeekCostLineValue('${elementId}','${siteId}',${wk},'${e.id}',this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"></div>
              <div class="roundplusbtn" style="width:24px;height:24px;font-size:14px;" title="Remove" onclick="deletePriceWeekExtraEntry('${elementId}','${siteId}',${wk},'${e.id}')">×</div>
            </div>
          `).join('')}
          ${!assignedOperatives.length && !extraOpEntries.length && !costEntries.length ? `<div style="padding:10px;font-size:12px;color:var(--slate);">No rows yet — add an operative, a named extra, or a one-off cost below.</div>` : `
          <div style="${rowGrid}padding:8px 10px;border-top:2px solid var(--ink);">
            <div style="font-weight:800;font-size:12px;">Week total</div>
            <div style="font-weight:800;font-size:12.5px;">${fmt(sum)}</div>
            <div></div>
          </div>
          `}
        </div>
        <div style="padding:8px 10px;border-top:1px solid var(--line);">
          <button class="ghostbtn" style="width:auto;padding:7px 12px;font-size:11px;" onclick="priceAddOpen['${key}']=!priceAddOpen['${key}'];render()">${adding?'× Cancel':'+ Add'}</button>
        </div>
        ${adding ? `
        <div class="formfield" style="margin:0 0 10px;background:color-mix(in srgb, var(--brand1) 5%, transparent);padding:8px;border-radius:8px;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <button class="${addType==='operative'?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11px;" onclick="priceAddType['${key}']='operative';render()">Operative</button>
            <button class="${addType==='manual'?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11px;" onclick="priceAddType['${key}']='manual';render()">Name (not on app)</button>
            <button class="${addType==='cost'?'darkbtn':'ghostbtn'}" style="width:auto;padding:6px 10px;font-size:11px;" onclick="priceAddType['${key}']='cost';render()">Cost</button>
          </div>
          ${addType==='operative' ? `
          <label class="field-label">Operative</label>
          <select id="pwExtraOpSelect_${key}" style="width:100%;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;">
            ${pickable.length ? pickable.map(o=>`<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('') : `<option value="">No other operatives available</option>`}
          </select>
          <label class="field-label" style="margin-top:8px;">Value</label>
          <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" id="pwExtraOpValue_${key}" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="darkbtn" style="width:auto;padding:8px 12px;" onclick="addPriceWeekExtraOperative('${elementId}','${siteId}',${wk})">Add</button>
            <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="priceAddOpen['${key}']=false;render()">Cancel</button>
          </div>
          ` : addType==='manual' ? `
          <label class="field-label">Name</label>
          <input type="text" id="pwManualOpName_${key}" placeholder="e.g. J. Smith (subcontractor)" style="width:100%;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;">
          <label class="field-label" style="margin-top:8px;">Value</label>
          <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" id="pwManualOpValue_${key}" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="darkbtn" style="width:auto;padding:8px 12px;" onclick="addPriceWeekManualOperative('${elementId}','${siteId}',${wk})">Add</button>
            <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="priceAddOpen['${key}']=false;render()">Cancel</button>
          </div>
          ` : `
          <label class="field-label">Description</label>
          <input type="text" id="pwCostLabel_${key}" placeholder="e.g. Plant hire" style="width:100%;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;">
          <label class="field-label" style="margin-top:8px;">Value</label>
          <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" id="pwCostValue_${key}" step="0.01" inputmode="decimal" placeholder="0.00"></div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="darkbtn" style="width:auto;padding:8px 12px;" onclick="addPriceWeekCostLine('${elementId}','${siteId}',${wk})">Add</button>
            <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="priceAddOpen['${key}']=false;render()">Cancel</button>
          </div>
          `}
        </div>
        ` : ''}
      </div>
      ` : ''}
    </div>
  `;
}
window.savePriceWeekOperativeEntry = async function(elementId, siteId, week, operativeId, rawValue, kind){
  kind = kind || 'assigned';
  const v = String(rawValue||'').trim();
  if(v===''){
    const res = await sbFetch('/rest/v1/price_week_operative_entries?element_id=eq.'+elementId+'&week_number=eq.'+week+'&operative_id=eq.'+operativeId+'&kind=eq.'+kind, {method:'DELETE'});
    if(!res.ok){ toast('Could not clear — '+(await safeErr(res))); render(); return; }
  } else {
    const amount = Number(v);
    if(isNaN(amount) || amount<0){ toast('Enter a number'); render(); return; }
    // #340: 'assigned' rows are one-per-operative-per-week (enforced by a
    // partial unique index scoped to kind='assigned'), but PostgREST's
    // on_conflict can't target a partial index — so look the row up first
    // and PATCH it if it exists, INSERT if not, instead of relying on
    // upsert-by-on_conflict.
    const existing = await dbSelect('price_week_operative_entries', 'element_id=eq.'+elementId+'&week_number=eq.'+week+'&operative_id=eq.'+operativeId+'&kind=eq.'+kind+'&select=id');
    let res;
    if(existing.length){
      res = await sbFetch('/rest/v1/price_week_operative_entries?id=eq.'+existing[0].id, {
        method:'PATCH',
        headers:{'Prefer':'return=representation'},
        body: JSON.stringify({amount, entered_by:ME.id, updated_at:new Date().toISOString()})
      });
    } else {
      res = await sbFetch('/rest/v1/price_week_operative_entries', {
        method:'POST',
        headers:{'Prefer':'return=representation'},
        body: JSON.stringify({site_id:siteId, element_id:elementId, week_number:week, operative_id:operativeId, amount, kind, entered_by:ME.id, updated_at:new Date().toISOString()})
      });
    }
    if(!res.ok){ toast('Save failed — '+(await safeErr(res))); render(); return; }
  }
  await rollUpPriceWeekFromOperativeEntries(elementId, siteId, week);
  render();
};
// #319/#340: add an extra operative (not in site_assignments for this site,
// or the same operative again for a second piece of work) to a week's
// build-up. This always INSERTs a new row — extra_operative rows aren't
// unique per operative (only 'assigned' rows are), so there's no existing
// row to upsert onto; later edits of this row go by its own id instead.
window.addPriceWeekExtraOperative = async function(elementId, siteId, week){
  const key = elementId+'_'+week;
  const sel = document.getElementById('pwExtraOpSelect_'+key);
  const valEl = document.getElementById('pwExtraOpValue_'+key);
  const operativeId = sel && sel.value;
  if(!operativeId){ toast('Pick an operative'); return; }
  const v = String(valEl && valEl.value || '').trim();
  const amount = v==='' ? 0 : Number(v);
  if(isNaN(amount) || amount<0){ toast('Enter a number'); return; }
  const res = await sbFetch('/rest/v1/price_week_operative_entries', {
    method:'POST',
    headers:{'Prefer':'return=representation'},
    body: JSON.stringify({site_id:siteId, element_id:elementId, week_number:week, operative_id:operativeId, amount, kind:'extra_operative', entered_by:ME.id, updated_at:new Date().toISOString()})
  });
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return; }
  priceAddOpen[key] = false;
  await rollUpPriceWeekFromOperativeEntries(elementId, siteId, week);
  render();
};
// #323: a manual/free-text "extra operative" for someone not in the system —
// same kind ('extra_operative') and row shape as a picked org operative, but
// operative_id is null and `label` carries the typed name instead.
window.addPriceWeekManualOperative = async function(elementId, siteId, week){
  const key = elementId+'_'+week;
  const nameEl = document.getElementById('pwManualOpName_'+key);
  const valEl = document.getElementById('pwManualOpValue_'+key);
  const name = String(nameEl && nameEl.value || '').trim();
  if(!name){ toast('Enter a name'); return; }
  const v = String(valEl && valEl.value || '').trim();
  const amount = v==='' ? 0 : Number(v);
  if(isNaN(amount) || amount<0){ toast('Enter a number'); return; }
  const res = await sbFetch('/rest/v1/price_week_operative_entries', {
    method:'POST',
    headers:{'Prefer':'return=representation'},
    body: JSON.stringify({site_id:siteId, element_id:elementId, week_number:week, operative_id:null, kind:'extra_operative', label:name, amount, entered_by:ME.id, updated_at:new Date().toISOString()})
  });
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return; }
  priceAddOpen[key] = false;
  await rollUpPriceWeekFromOperativeEntries(elementId, siteId, week);
  render();
};
// #319: add a one-off cost line (plant hire, misc cost) not tied to any
// operative — its own row addressed by id since several can exist per week.
window.addPriceWeekCostLine = async function(elementId, siteId, week){
  const key = elementId+'_'+week;
  const labelEl = document.getElementById('pwCostLabel_'+key);
  const valEl = document.getElementById('pwCostValue_'+key);
  const label = String(labelEl && labelEl.value || '').trim();
  if(!label){ toast('Enter a description'); return; }
  const v = String(valEl && valEl.value || '').trim();
  const amount = v==='' ? 0 : Number(v);
  if(isNaN(amount) || amount<0){ toast('Enter a number'); return; }
  const res = await sbFetch('/rest/v1/price_week_operative_entries', {
    method:'POST',
    headers:{'Prefer':'return=representation'},
    body: JSON.stringify({site_id:siteId, element_id:elementId, week_number:week, operative_id:null, kind:'cost', label, amount, entered_by:ME.id, updated_at:new Date().toISOString()})
  });
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return; }
  priceAddOpen[key] = false;
  await rollUpPriceWeekFromOperativeEntries(elementId, siteId, week);
  render();
};
window.savePriceWeekCostLineValue = async function(elementId, siteId, week, entryId, rawValue){
  const v = String(rawValue||'').trim();
  if(v===''){
    await deletePriceWeekExtraEntry(elementId, siteId, week, entryId);
    return;
  }
  const amount = Number(v);
  if(isNaN(amount) || amount<0){ toast('Enter a number'); render(); return; }
  const res = await sbFetch('/rest/v1/price_week_operative_entries?id=eq.'+entryId, {
    method:'PATCH',
    headers:{'Prefer':'return=representation'},
    body: JSON.stringify({amount, updated_at:new Date().toISOString()})
  });
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); render(); return; }
  await rollUpPriceWeekFromOperativeEntries(elementId, siteId, week);
  render();
};
// Deletes an extra-operative or cost row by id — used by both kinds' × button.
window.deletePriceWeekExtraEntry = async function(elementId, siteId, week, entryId){
  const res = await sbFetch('/rest/v1/price_week_operative_entries?id=eq.'+entryId, {method:'DELETE'});
  if(!res.ok){ toast('Could not remove — '+(await safeErr(res))); render(); return; }
  logSiteActivity(siteId, 'price_week_entry_deleted', `Deleted price entry for Week ${week}`);
  await rollUpPriceWeekFromOperativeEntries(elementId, siteId, week);
  render();
};
// Recomputes a week's price_weeks total from its per-operative entries and
// writes it back — mirrors savePriceWeek's own upsert/clear shape so the two
// paths feed the same "Week N" figure coherently.
async function rollUpPriceWeekFromOperativeEntries(elementId, siteId, week){
  const entries = await dbSelect('price_week_operative_entries', 'element_id=eq.'+elementId+'&week_number=eq.'+week+'&select=amount');
  if(entries.length){
    const total = entries.reduce((sum,e)=>sum+Number(e.amount||0), 0);
    await sbFetch('/rest/v1/price_weeks?on_conflict=element_id,week_number', {
      method:'POST',
      headers:{'Prefer':'resolution=merge-duplicates,return=representation'},
      body: JSON.stringify({site_id:siteId, element_id:elementId, week_number:week, amount:total})
    });
  } else {
    await sbFetch('/rest/v1/price_weeks?element_id=eq.'+elementId+'&week_number=eq.'+week, {method:'DELETE'});
  }
}
// #324: explicit recalculate button on an "auto" week cell — forces a fresh
// rollup from the current build-up rows, overwriting any manual value that
// was typed directly into the total cell.
window.recalcPriceWeek = async function(elementId, siteId, weekNumber){
  await rollUpPriceWeekFromOperativeEntries(elementId, siteId, weekNumber);
  toast('Recalculated from build-up');
  render();
};
window.savePriceWeek = async function(elementId, siteId, weekNumber, rawValue){
  const v = String(rawValue||'').trim();
  if(v===''){
    // #324 fix: clearing a manually-typed value here used to just delete the
    // price_weeks row outright, leaving the cell permanently blank even when
    // build-up rows still existed underneath it. Re-run the rollup instead —
    // it recalculates the auto total from any remaining build-up entries, or
    // deletes the row itself when there are none, restoring the "auto"
    // formula behaviour rather than leaving a dead manual value behind.
    await rollUpPriceWeekFromOperativeEntries(elementId, siteId, weekNumber);
    priceWeekRowOpen[elementId+':'+weekNumber] = true;
    render();
    return;
  }
  const amount = Number(v);
  if(isNaN(amount)){ toast('Enter a number'); render(); return; }
  const res = await sbFetch('/rest/v1/price_weeks?on_conflict=element_id,week_number', {
    method:'POST',
    headers:{'Prefer':'resolution=merge-duplicates,return=representation'},
    body: JSON.stringify({site_id:siteId, element_id:elementId, week_number:weekNumber, amount})
  });
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); }
  priceWeekRowOpen[elementId+':'+weekNumber] = true;
  render();
};
// Price landing page — the single "Price" tile on Site Home lands here, with
// two sub-tiles underneath it: the existing Pricing Elements tool (renamed
// "Price" here, unchanged otherwise, now reached via /price/elements) and
// Price Sheet (still WIP, reached via /pricebuilder as before). Keeps one
// entry point on Site Home while still giving Price Sheet its own clearly
// separate space rather than being buried inside the Pricing Elements page.
async function renderPriceHome(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  let canSeePrice = false;
  if(site.price_enabled){
    if(ME.role==='admin' || site.responsible_pm_id===ME.id) canSeePrice = true;
    else {
      const grant = await dbSelect('site_price_access', 'site_id=eq.'+siteId+'&user_id=eq.'+ME.id+'&select=user_id&limit=1');
      canSeePrice = grant.length>0;
    }
  }
  let pendingVariationCount = 0;
  if(canSeePrice && isManager(ME)){
    const pendingAw = await dbSelect('additional_works_requests', 'site_id=eq.'+siteId+'&status=eq.pending&select=id');
    pendingVariationCount = pendingAw.length;
  }
  let priceBuilderTileCount = 0;
  // Creating/editing sheets (drafts) is PM/admin only (canUsePriceBuilder).
  // Viewing an already-ISSUED sheet is a PM/admin default instead — a PM sees
  // every issued sheet on their site same as admin does, but a plain
  // operative only sees a sheet if they were specifically ticked "Assign to"
  // when it was issued, not just because they can see the Price tile at all.
  if(canUsePriceBuilder()) priceBuilderTileCount = (await dbSelect('price_builder_sheets', 'site_id=eq.'+siteId+'&select=id')).length;
  else if(isManager(ME)) priceBuilderTileCount = (await dbSelect('price_builder_sheets', 'site_id=eq.'+siteId+'&status=eq.issued&select=id')).length;
  else if(canSeePrice) priceBuilderTileCount = (await dbSelect('price_builder_sheets', 'site_id=eq.'+siteId+'&status=eq.issued&assigned_user_ids=cs.{'+ME.id+'}&select=id')).length;
  const showPriceBuilderTile = isManager(ME) ? true : priceBuilderTileCount>0;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="tilegrid">
      ${canSeePrice ? `<div class="tile" onclick="go('#/site/${siteId}/price/elements')">
        <div class="icon" style="background:#FFF3D9;color:#8A6300;">💷</div>
        <div class="lbl">Price</div><div class="sub">${pendingVariationCount ? pendingVariationCount+' variation'+(pendingVariationCount>1?'s':'')+' pending' : 'Pricing elements'}</div>
        ${pendingVariationCount?`<span class="badge-count">${pendingVariationCount}</span>`:''}
      </div>` : `<div class="tile" style="opacity:.55;cursor:default;">
        <div class="icon" style="background:#FFF3D9;color:#8A6300;">💷</div>
        <div class="lbl">Price</div><div class="sub">Restricted access</div>
      </div>`}
      ${showPriceBuilderTile ? `<div class="tile" onclick="go('#/site/${siteId}/pricebuilder')">
        <div class="icon" style="background:#FFF3D9;color:#8A6300;">🧮</div>
        <div class="lbl">Price Sheet</div><div class="sub">${priceBuilderTileCount ? priceBuilderTileCount+' sheet'+(priceBuilderTileCount>1?'s':'') : (canUsePriceBuilder()?'No sheets yet':'None issued')}</div>
      </div>` : ''}
    </div>
  `, {title:'Price', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, tabs:false}); }
}
// #430: shared by both the tile-grid page (renderPriceTile) and a single
// element's own detail page (renderPricingElementDetail) — everything about
// every Pricing Element on this site, computed once. Pulled out into its own
// function when the grid/detail split was introduced so the two pages can't
// drift out of sync on how a figure or an access check is worked out.
async function loadPriceTileData(siteId){
  const site = SITES.find(s=>s.id===siteId);
  const canManage = isManager(ME);
  const isMultiSite = !!(site && site.multi_site);
  const fmt = n => '£' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});

  // #400: every Pricing Element on this site, its weekly build-up totals and
  // its variations — fetched once and reused both for the job-level
  // Overview (always ALL elements, whichever sub-address tab is picked
  // below) and for each element's own card.
  const [allElements, allWeeks, allAwRows, subAddressesList, elementGroups, pbLinkedSheets] = await Promise.all([
    dbSelect('pricing_elements', 'site_id=eq.'+siteId+'&order=sort_order.asc,created_at.asc'),
    dbSelect('price_weeks', 'site_id=eq.'+siteId+'&select=element_id,week_number,amount,wage_mismatch_override_reason'),
    dbSelect('additional_works_requests', 'site_id=eq.'+siteId+'&select=element_id,amount,status'),
    isMultiSite ? dbSelect('site_sub_addresses', 'site_id=eq.'+siteId+'&order=name.asc') : Promise.resolve([]),
    // Groups let a PM visually cluster related sub tiles (e.g. every element
    // on one elevation) with a shared coloured border and one combined
    // figures card — set up per tile via its own "⋮" menu.
    dbSelect('pricing_element_groups', 'site_id=eq.'+siteId+'&order=created_at.asc'),
    // Price Sheets that have been issued into a Pricing Element on
    // this site — keyed by element so each card can show its priced-item
    // weekly booking breakdown instead of the free-form operative build-up.
    dbSelect('price_builder_sheets', 'site_id=eq.'+siteId+'&pricing_element_id=not.is.null&select=id,pricing_element_id,title'),
  ]);
  const pbSheetByElementId = {};
  pbLinkedSheets.forEach(s=>{ pbSheetByElementId[s.pricing_element_id] = s; });
  await loadAllProfiles();
  // Price Sheet now has its own Site Home tile (see the tile-grid render
  // function) — no longer fetched or entry-pointed from here.

  // Per-element price/labour-invoice access for the current user — two
  // queries total regardless of how many elements exist. PM/admin always
  // has access to everything, so these are only consulted for an operative.
  const [myPriceGrants, myLabourGrants] = canManage ? [null, null] : await Promise.all([
    dbSelect('site_price_access', 'site_id=eq.'+siteId+'&user_id=eq.'+ME.id+'&select=element_id'),
    dbSelect('site_labour_invoice_access', 'site_id=eq.'+siteId+'&user_id=eq.'+ME.id+'&select=element_id'),
  ]);
  const myPriceElementIds = canManage ? null : new Set(myPriceGrants.map(g=>g.element_id));
  const myLabourElementIds = canManage ? null : new Set(myLabourGrants.map(g=>g.element_id));
  const hasPriceAccessTo = elId => canManage || myPriceElementIds.has(elId);
  const canSeeLabourInvoicesFor = elId => canManage || myLabourElementIds.has(elId);

  const weeksByElement = {};
  allWeeks.forEach(w=>{ (weeksByElement[w.element_id]=weeksByElement[w.element_id]||[]).push(w); });
  const awByElement = {};
  allAwRows.forEach(r=>{ (awByElement[r.element_id]=awByElement[r.element_id]||[]).push(r); });

  const elementFigures = {};
  allElements.forEach(el=>{
    const weeks = weeksByElement[el.id]||[];
    const autoBookedIn = weeks.reduce((s,w)=>s+Number(w.amount||0),0);
    const hasOverride = el.price_booked_override !== null && el.price_booked_override !== undefined;
    const bookedIn = hasOverride ? Number(el.price_booked_override) : autoBookedIn;
    const priceTotal = Number(el.price_total||0);
    const awRows = awByElement[el.id]||[];
    const awNotApprovedTotal = awRows.filter(r=>r.status!=='approved').reduce((s,r)=>s+Number(r.amount||0),0);
    const awApprovedTotal = awRows.filter(r=>r.status==='approved').reduce((s,r)=>s+Number(r.amount||0),0);
    const balance = (priceTotal + awApprovedTotal) - bookedIn;
    elementFigures[el.id] = {autoBookedIn, hasOverride, bookedIn, priceTotal, awNotApprovedTotal, awApprovedTotal, balance};
  });

  // #400: on a multi-site job, each address manages its own Pricing
  // Elements — pick which address's elements are shown/edited below,
  // remembering the choice per site.
  let selectedSubId = null;
  if(isMultiSite){
    const stored = priceSubAddrSelected[siteId];
    selectedSubId = (stored && subAddressesList.some(a=>a.id===stored)) ? stored : (subAddressesList[0] ? subAddressesList[0].id : null);
    priceSubAddrSelected[siteId] = selectedSubId;
  }
  // #400: only show elements this user actually has price access to, or at
  // least Labour Invoice access to (or every element, for a PM/admin) —
  // access is per element now, so being able to see the Price tile at all
  // (granted for at least one element) no longer implies seeing every
  // Pricing Element on the page. A labour-invoice-only grant still shows
  // the element (read-only, no build-up entry) so that invoice access keeps
  // working exactly as before.
  const visibleElements = allElements.filter(el => (isMultiSite ? el.sub_site_id===selectedSubId : !el.sub_site_id) && (hasPriceAccessTo(el.id) || canSeeLabourInvoicesFor(el.id)));
  const openElements = visibleElements.filter(el=>!el.closed);
  const closedElements = visibleElements.filter(el=>el.closed);

  // Grouped tiles get one combined figures card (Price Total/Booked In/
  // Balance summed across every member currently visible/open) shown above
  // that group's own tiles — replaces the old single job-wide Overview,
  // scoped instead to whichever tiles someone has actually chosen to link.
  const groupsById = {}; elementGroups.forEach(g=>{ groupsById[g.id] = g; });
  const groupFigures = {};
  openElements.forEach(el=>{
    if(!el.group_id || !groupsById[el.group_id]) return;
    const f = elementFigures[el.id];
    const g = groupFigures[el.group_id] = groupFigures[el.group_id] || {priceTotal:0, bookedIn:0, awApprovedTotal:0, awNotApprovedTotal:0, count:0};
    g.priceTotal += f.priceTotal; g.bookedIn += f.bookedIn; g.awApprovedTotal += f.awApprovedTotal; g.awNotApprovedTotal += f.awNotApprovedTotal; g.count++;
  });
  Object.keys(groupFigures).forEach(gid=>{ groupFigures[gid].balance = (groupFigures[gid].priceTotal + groupFigures[gid].awApprovedTotal) - groupFigures[gid].bookedIn; });

  const elementData = {};
  await Promise.all(visibleElements.map(async el=>{
    const canSeeLabour = canSeeLabourInvoicesFor(el.id);
    const hasPriceAcc = hasPriceAccessTo(el.id);
    const pbSheet = pbSheetByElementId[el.id] || null;
    const [ownFiles, applyAllFiles, labourFiles, awRows, weekEntries, assignedRows, labourOperatives, labourAccessRows, priceAccessRows, pbItems] = await Promise.all([
      dbSelect('price_files', 'element_id=eq.'+el.id+'&order=uploaded_at.desc'),
      dbSelect('price_files', 'site_id=eq.'+siteId+'&element_id=is.null&sub_site_id='+(el.sub_site_id?('eq.'+el.sub_site_id):'is.null')+'&order=uploaded_at.desc'),
      canSeeLabour ? dbSelect('labour_invoices', 'element_id=eq.'+el.id+'&order=uploaded_at.desc') : Promise.resolve([]),
      dbSelect('additional_works_requests', 'element_id=eq.'+el.id+'&order=created_at.asc'),
      hasPriceAcc ? dbSelect('price_week_operative_entries', 'element_id=eq.'+el.id+'&order=week_number.asc') : Promise.resolve([]),
      hasPriceAcc ? dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : Promise.resolve([]),
      canManage ? Promise.resolve(Object.values(PROFILES).filter(p=>p&&p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name))) : Promise.resolve([]),
      canManage ? dbSelect('site_labour_invoice_access', 'element_id=eq.'+el.id+'&select=user_id') : Promise.resolve([]),
      canManage ? dbSelect('site_price_access', 'element_id=eq.'+el.id+'&select=user_id') : Promise.resolve([]),
      pbSheet ? dbSelect('price_builder_sheet_items', 'sheet_id=eq.'+pbSheet.id+'&order=sort_order.asc') : Promise.resolve([]),
    ]);
    // Apply-to-all files are merged in alongside this element's own — sorted
    // back together so the list reads as one, newest first.
    const priceFiles = [...ownFiles, ...applyAllFiles].sort((a,b)=> new Date(b.uploaded_at) - new Date(a.uploaded_at));
    let pbItemWeeks = [];
    if(pbSheet && pbItems.length){
      const pbItemIds = pbItems.map(i=>i.id).join(',');
      pbItemWeeks = await dbSelect('price_builder_sheet_item_weeks', 'sheet_item_id=in.('+pbItemIds+')');
    }
    elementData[el.id] = {priceFiles, labourFiles, awRows, weekEntries, assignedRows, labourOperatives, labourAccessRows, priceAccessRows, canSeeLabour, hasPriceAcc, pbSheet, pbItems, pbItemWeeks};
  }));

  return {site, canManage, isMultiSite, fmt, allElements, elementFigures, weeksByElement, elementGroups, groupsById, groupFigures, subAddressesList, selectedSubId, visibleElements, openElements, closedElements, elementData};
}
// #430: the Price tile's main page — a grid of tappable sub-tiles, one per
// Pricing Element (whether it's a plain manual lump-sum + tracker element,
// or one created by issuing a Price Sheet — both are just Pricing
// Elements underneath, so both render the same way here). Tapping a tile
// opens that element's own dedicated page (renderPricingElementDetail)
// instead of everything living on one long scrolling page of expandable
// cards — the point being a multi-discipline job (e.g. "Flat Roofing" and
// "Pitched Roofing" issued as separate sheets/elements) reads as clearly
// separate tiles, and a PM can drill into just the one they want.
// A tile's own colour-coded group is set up per tile (see the ⋮ menu in
// tileHtml below) rather than from one page-level control — pick an existing
// group to join, or start a new one, right from the tile it applies to.
const PB_GROUP_COLORS = [
  {name:'Blue', hex:'#1E88E5'}, {name:'Green', hex:'#2E7D32'}, {name:'Orange', hex:'#E67E22'},
  {name:'Purple', hex:'#8E44AD'}, {name:'Red', hex:'#C0392B'}, {name:'Teal', hex:'#00897B'},
];
window.pbCreateGroupForElement = async function(siteId, subSiteId, elementId){
  const name = await customPrompt('Name this group of tiles', '');
  if(name===null) return;
  const trimmed = name.trim();
  if(!trimmed){ toast('Enter a name for the group.'); return; }
  const existing = await dbSelect('pricing_element_groups', 'site_id=eq.'+siteId+(subSiteId?('&sub_site_id=eq.'+subSiteId):'&sub_site_id=is.null')+'&select=id');
  const color = PB_GROUP_COLORS[existing.length % PB_GROUP_COLORS.length].hex;
  const rows = await dbInsert('pricing_element_groups', {site_id:siteId, sub_site_id:subSiteId||null, name:trimmed, color, created_by:ME.id});
  if(!rows || !rows[0]) return;
  await dbUpdate('pricing_elements', elementId, {group_id: rows[0].id});
  rowActionsMenuOpenFor = null;
  toast('Group created');
  render();
};
window.pbAddElementToGroup = async function(elementId, groupId){
  await dbUpdate('pricing_elements', elementId, {group_id: groupId});
  rowActionsMenuOpenFor = null;
  toast('Added to group');
  render();
};
window.pbRemoveElementFromGroup = async function(elementId){
  await dbUpdate('pricing_elements', elementId, {group_id: null});
  rowActionsMenuOpenFor = null;
  toast('Removed from group');
  render();
};
window.pbRenameGroup = async function(groupId, currentName){
  const name = await customPrompt('Rename group', currentName||'');
  if(name===null) return;
  const trimmed = name.trim();
  if(!trimmed){ toast("Group name can't be empty."); return; }
  await dbUpdate('pricing_element_groups', groupId, {name:trimmed});
  rowActionsMenuOpenFor = null;
  render();
};
window.pbRecolorGroup = async function(groupId){
  const list = PB_GROUP_COLORS.map(c=>c.name).join(', ');
  const typed = await customPrompt(`Colour for this group (one of: ${list})`, '');
  if(typed===null) return;
  const match = PB_GROUP_COLORS.find(c=>c.name.toLowerCase()===typed.trim().toLowerCase());
  if(!match){ toast('Type one of: '+list); return; }
  await dbUpdate('pricing_element_groups', groupId, {color: match.hex});
  rowActionsMenuOpenFor = null;
  render();
};
async function renderPriceTile(siteId){
  const __gen = RENDER_GEN;
  const d = await loadPriceTileData(siteId);
  const {site, canManage, isMultiSite, fmt, elementGroups, groupsById, groupFigures, subAddressesList, selectedSubId, openElements, closedElements, elementFigures} = d;
  const anyClosedSelected = Object.keys(priceElementSelected).length>0;
  // Groups scoped to whichever address tab is currently selected (or the
  // single, non-multi-site set of tiles) — a group from another address
  // shouldn't show up as a place to file a tile here.
  const groupsHere = elementGroups.filter(g => isMultiSite ? g.sub_site_id===selectedSubId : !g.sub_site_id);

  function tileMenuHtml(el){
    if(!canManage) return '';
    const key = 'pbtile-'+el.id;
    const items = el.group_id
      ? `
        <div class="statusmenu-item" onclick="pbRenameGroup('${el.group_id}','${jsAttr((groupsById[el.group_id]||{}).name||'')}')">✎ Rename group</div>
        <div class="statusmenu-item" onclick="pbRecolorGroup('${el.group_id}')">🎨 Change colour</div>
        <div class="statusmenu-item danger" onclick="pbRemoveElementFromGroup('${el.id}')">Remove from group</div>
      `
      : `
        ${groupsHere.map(g=>`<div class="statusmenu-item" onclick="pbAddElementToGroup('${el.id}','${g.id}')">Add to "${escapeHtml(g.name)}"</div>`).join('')}
        <div class="statusmenu-item" onclick="pbCreateGroupForElement('${siteId}',${selectedSubId?`'${selectedSubId}'`:'null'},'${el.id}')">+ New group…</div>
      `;
    return `
      <div style="position:absolute;top:4px;left:4px;" data-rowactions-root onclick="event.stopPropagation();">
        <span class="taskicon" title="Group this tile" style="background:transparent;" onclick="toggleRowActionsMenu('${key}')">⋮</span>
        ${rowActionsMenuOpenFor===key ? `<div class="statusmenu" style="left:0;right:auto;">${items}</div>` : ''}
      </div>
    `;
  }

  function tileHtml(el){
    const f = elementFigures[el.id];
    const overbooked = f.balance<0;
    const closedHidden = el.closed && !canManage && !el.closed_show_price_to_operatives;
    if(closedHidden) return `<div class="tile" style="opacity:.55;cursor:default;"><div class="icon" style="background:#EDEDED;color:#666;">🔒</div><div class="lbl">${escapeHtml(el.name)}</div><div class="sub">Closed</div></div>`;
    const icon = d.elementData[el.id] && d.elementData[el.id].pbSheet ? '💷' : '🧾';
    const group = el.group_id ? groupsById[el.group_id] : null;
    const borderStyle = overbooked ? 'border-color:var(--warn);' : (group ? `border-color:${group.color};border-width:2px;` : '');
    return `<div class="tile" style="${el.closed?'opacity:.7;':''}${borderStyle}" onclick="go('#/site/${siteId}/price/element/${el.id}')">
      ${tileMenuHtml(el)}
      <div class="icon" style="background:#FFF3D9;color:#8A6300;">${icon}</div>
      <div class="lbl">${escapeHtml(el.name)}${el.closed?' <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--slate);">Closed</span>':''}</div>
      <div class="sub">${fmt(f.priceTotal)} · ${fmt(f.bookedIn)} booked</div>
      <div class="sub" style="font-weight:700;color:${f.balance<0?'var(--warn)':'var(--ink)'};">Bal: ${fmt(f.balance)}</div>
      ${overbooked?`<span class="badge-count" style="background:var(--warn);">!</span>`:''}
    </div>`;
  }

  function groupCardHtml(groupId){
    const g = groupsById[groupId]; const fig = groupFigures[groupId];
    if(!g || !fig) return '';
    return `
    <div class="card" style="margin-bottom:10px;border:1.5px solid ${g.color};">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="width:12px;height:12px;border-radius:3px;background:${g.color};flex:0 0 auto;"></span>
        <span class="sectiontitle" style="margin:0;">${escapeHtml(g.name)}</span>
        <span class="stub" style="margin:0 0 0 auto;">${fig.count} tile${fig.count===1?'':'s'}</span>
      </div>
      <div class="sub" style="margin:0;">${fmt(fig.priceTotal)} price · ${fmt(fig.bookedIn)} booked</div>
      <div class="sub" style="margin:2px 0 0;font-weight:700;color:${fig.balance<0?'var(--warn)':'var(--ink)'};">Balance: ${fmt(fig.balance)}</div>
    </div>
    `;
  }

  // Tiles are laid out as: any group cards (each followed by that group's own
  // member tiles, bordered to match), then a final grid of everything not in
  // a group — a grouped set of tiles reads as visually linked without a
  // job-wide Overview mixing every element together.
  const groupIdsInOrder = groupsHere.map(g=>g.id).filter(gid=>groupFigures[gid]);
  const groupedElementIds = new Set();
  groupIdsInOrder.forEach(gid=>{ openElements.forEach(el=>{ if(el.group_id===gid) groupedElementIds.add(el.id); }); });
  const ungroupedOpenElements = openElements.filter(el=>!groupedElementIds.has(el.id));

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${isMultiSite ? `
    <div class="filterrow" style="margin-bottom:14px;">
      ${subAddressesList.map(a=>`<div class="filterchip ${selectedSubId===a.id?'active':''}" onclick="priceSubAddrSelected['${siteId}']='${a.id}';render()">${escapeHtml(a.name)}</div>`).join('') || `<div class="stub" style="margin:0;">No addresses added yet — add one from Site Settings › Multi-Site.</div>`}
    </div>
    ` : ''}

    ${canManage && anyClosedSelected ? `
    <div class="card" style="margin-bottom:14px;background:color-mix(in srgb, var(--brand1) 6%, var(--card, #fff));display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <span class="stub" style="margin:0;font-weight:700;">${Object.keys(priceElementSelected).length} selected</span>
      <div style="display:flex;gap:8px;">
        <button class="darkbtn" style="width:auto;padding:8px 14px;" onclick="closeSelectedPricingElements()">Close selected</button>
        <button class="ghostbtn" style="width:auto;padding:8px 14px;" onclick="priceElementSelected={};render()">Cancel</button>
      </div>
    </div>
    ` : ''}

    ${canManage && !isMultiSite || (isMultiSite && selectedSubId && canManage) ? `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px;position:relative;" data-rowactions-root onclick="event.stopPropagation();">
      <span class="ghostbtn" style="width:auto;padding:8px 14px;cursor:pointer;" onclick="toggleRowActionsMenu('pbtile-page')">⋮ Manage</span>
      ${rowActionsMenuOpenFor==='pbtile-page' ? `<div class="statusmenu" style="top:100%;right:0;left:auto;">
        <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;addPricingElementViaPopup('${siteId}',${selectedSubId?`'${selectedSubId}'`:'null'})">+ Add Sub Tile</div>
      </div>` : ''}
    </div>
    ` : ''}

    ${!openElements.length ? `<div class="empty" style="margin-bottom:14px;">${isMultiSite && !selectedSubId ? 'Add an address above first.' : 'No sub tiles yet — add one above. Each is its own price total &amp; tracker, or a Price Sheet once issued ("+ New Sheet" in Price Sheet creates its own tile automatically).'}</div>` : ''}

    ${groupIdsInOrder.map(gid=>`
      ${groupCardHtml(gid)}
      <div class="tilegrid" style="margin-bottom:14px;">
        ${openElements.filter(el=>el.group_id===gid).map(el=>tileHtml(el)).join('')}
      </div>
    `).join('')}

    ${ungroupedOpenElements.length ? `
    <div class="tilegrid" style="margin-bottom:14px;">
      ${ungroupedOpenElements.map(el=>tileHtml(el)).join('')}
    </div>
    ` : ''}

    ${closedElements.length ? `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:14px;">
      <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;" onclick="priceClosedGroupOpen=!priceClosedGroupOpen;render()">
        <span class="arrow">${priceClosedGroupOpen?'▼':'▶'}</span> Closed (${closedElements.length})
      </p>
      ${priceClosedGroupOpen ? `
      <div style="padding:0 14px 14px;">
      <div class="tilegrid">
        ${closedElements.map(el=>tileHtml(el)).join('')}
      </div>
      </div>
      ` : ''}
    </div>
    ` : ''}
  `, {title:'Price', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back: PRICE_BUILDER_LIVE ? `#/site/${siteId}/price` : `#/site/${siteId}/home`, siteId, tabs:false}); }
}
// #430: a single Pricing Element's own page — everything that used to live
// inline inside its card on the old one-long-page Price tile (Price Total,
// Booked In, weekly build-up/priced-item breakdown, Variation to Price,
// Price Sheet, Labour Invoices) now lives here instead, reached by tapping
// its sub-tile. Re-loads the same shared data as the grid (simplest way to
// keep the figures/access-checks identical) and just renders the one card.
async function renderPricingElementDetail(siteId, elementId){
  const __gen = RENDER_GEN;
  const d = await loadPriceTileData(siteId);
  const {site, canManage, fmt, allElements, elementFigures, weeksByElement, elementData} = d;
  const el = allElements.find(e=>e.id===elementId);
  if(!el || !elementData[elementId]){ toast('Sub tile not found, or you don\'t have access to it.'); go(`#/site/${siteId}/price`); return; }
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${pricingElementCardHtml(el, elementData[el.id], {siteId, canManage, fmt, figures:elementFigures[el.id], weeks:weeksByElement[el.id]||[]})}
  `, {title:el.name, subtitle:fullSiteAddress(site), siteNameSubtitle:true, back: PRICE_BUILDER_LIVE ? `#/site/${siteId}/price/elements` : `#/site/${siteId}/price`, siteId, tabs:false}); }
}
window.addPricingElementViaPopup = async function(siteId, subSiteId){
  const name = await customPrompt('Name this sub tile', '');
  if(name===null) return;
  const trimmed = name.trim();
  if(!trimmed){ toast('Enter a name for the sub tile.'); return; }
  const existing = await dbSelect('pricing_elements', 'site_id=eq.'+siteId+(subSiteId?('&sub_site_id=eq.'+subSiteId):'&sub_site_id=is.null')+'&select=sort_order&order=sort_order.desc&limit=1');
  const nextOrder = existing.length ? Number(existing[0].sort_order||0)+1 : 0;
  const rows = await dbInsert('pricing_elements', {site_id:siteId, sub_site_id:subSiteId||null, name:trimmed, sort_order:nextOrder, created_by:ME.id});
  if(!rows) return;
  toast('Sub tile added');
  render();
};
// #400: renders one Pricing Element's own mini price page — Price
// Total/Booked In/Balance, weekly build-up, Variation to Price, Price
// Sheet (with "apply to all" merge-in) and Labour Invoices, all scoped to
// this element alone. Pure render — every figure it needs was already
// fetched by renderPriceTile above.
function pricingElementCardHtml(el, d, ctx){
  const {siteId, canManage, fmt, figures} = ctx;
  const {autoBookedIn, hasOverride, bookedIn, priceTotal, awNotApprovedTotal, awApprovedTotal, balance} = figures;
  const open = priceElementOpen[el.id] !== undefined ? priceElementOpen[el.id] : true;
  const selected = !!priceElementSelected[el.id];
  const renaming = priceElementRenamingId === el.id;

  const assignedOperatives = (d.assignedRows||[]).map(r=>PROFILES[r.user_id]).filter(p=>p && p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  const assignedIds = new Set(assignedOperatives.map(o=>o.id));
  const orgOperativesForExtra = d.hasPriceAcc ? Object.values(PROFILES).filter(p=>p && p.role==='operative' && !assignedIds.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name)) : [];
  const opEntriesByWeek = {}, extraOpEntriesByWeek = {}, costEntriesByWeek = {};
  (d.weekEntries||[]).forEach(e=>{
    if(e.kind==='cost'){ (costEntriesByWeek[e.week_number]=costEntriesByWeek[e.week_number]||[]).push(e); }
    else if(e.kind==='extra_operative'){ (extraOpEntriesByWeek[e.week_number]=extraOpEntriesByWeek[e.week_number]||[]).push(e); }
    else { if(!opEntriesByWeek[e.week_number]) opEntriesByWeek[e.week_number]={}; opEntriesByWeek[e.week_number][e.operative_id]=e.amount; }
  });
  const labourAccessIds = new Set((d.labourAccessRows||[]).map(a=>a.user_id));
  const priceAccessIds = new Set((d.priceAccessRows||[]).map(a=>a.user_id));
  // #410: one combined "who can see this element" set — a single tick in the
  // Select Operatives popup grants/revokes both the price/build-up grant and
  // the labour-invoice grant together (see toggleElementAccess above).
  const elementAccessIds = new Set([...priceAccessIds, ...labourAccessIds]);
  const weekMap = {};
  const wageOverrideMap = {}; // week_number -> reason text, when a mismatch was deliberately overridden
  let maxWeek = 0;
  (ctx.weeks||[]).forEach(w=>{ weekMap[w.week_number]=w.amount; if(w.wage_mismatch_override_reason) wageOverrideMap[w.week_number]=w.wage_mismatch_override_reason; if(w.week_number>maxWeek) maxWeek=w.week_number; });
  const weeksToShow = d.hasPriceAcc ? (maxWeek+1) : maxWeek;
  // Elements fed by an issued Price Sheet get a per-item weekly
  // booking breakdown instead of the free-form operative build-up — the
  // qty booked in per item, per week (with an optional manual £ override
  // per item/week) is what now drives each week's price_weeks.amount.
  const pbWeeksByItem = {};
  (d.pbItemWeeks||[]).forEach(w=>{ (pbWeeksByItem[w.sheet_item_id]=pbWeeksByItem[w.sheet_item_id]||{})[w.week_number]=w; });
  const filesOpenState = priceFilesSectionOpen[el.id];
  // Auto-open only when there are no files AND no price sheet already
  // covering this element — once a Price Sheet has been issued into
  // it, the upload box is rarely needed so it starts collapsed by default.
  // Operatives never get the upload box at all, so for them every dropdown
  // in this page starts collapsed until they tap it open.
  const filesOpen = filesOpenState===undefined ? (canManage && d.priceFiles.length===0 && !d.pbSheet) : filesOpenState;
  const variationOpen = variationSectionOpen[el.id] !== undefined ? variationSectionOpen[el.id] : canManage;
  const weeklyOpen = weeklyPriceSectionOpen[el.id] !== undefined ? weeklyPriceSectionOpen[el.id] : canManage;
  const labourListOpen = labourInvoicesListOpen[el.id] !== undefined ? labourInvoicesListOpen[el.id] : canManage;
  const awFormOpen = !!additionalWorksFormOpen[el.id];
  const applyAllChecked = !!priceFileApplyToAll[el.id];

  return `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:18px;border:1.5px solid ${el.closed?'var(--line)':'var(--brand1)'};">
      <div style="padding:12px 14px;display:flex;align-items:flex-start;gap:8px;justify-content:space-between;background:${el.closed?'var(--paper)':'transparent'};border-bottom:2px solid ${el.closed?'var(--line)':'var(--brand1)'};">
        <div style="display:flex;align-items:flex-start;gap:8px;min-width:0;">
          ${canManage && !el.closed ? `<input type="checkbox" style="margin-top:4px;width:auto;" ${selected?'checked':''} onchange="togglePricingElementSelected('${el.id}')">` : ''}
          <div style="min-width:0;">
            ${renaming ? `
            <div style="display:flex;gap:6px;align-items:center;">
              <input type="text" id="renamePricingElement_${el.id}" value="${escapeHtml(el.name)}" style="font-weight:700;" oninput="priceElementRenameDraft=this.value">
              <button class="darkbtn" style="width:auto;padding:6px 10px;font-size:11px;" onclick="saveRenamePricingElement('${el.id}')">Save</button>
              <button class="ghostbtn" style="width:auto;padding:6px 10px;font-size:11px;" onclick="cancelRenamePricingElement()">Cancel</button>
            </div>
            ` : `
            <div style="margin:0;cursor:pointer;font-family:'Sora',-apple-system,sans-serif;font-size:15.5px;font-weight:800;letter-spacing:.01em;color:var(--ink);" onclick="priceElementOpen['${el.id}']=${!open};render()">${open?'▼':'▶'} ${escapeHtml(el.name)}${el.closed?' <span style="font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--slate);">Closed</span>':''}</div>
            <div class="stub" style="margin:2px 0 0;">${fmt(priceTotal)} price · ${fmt(bookedIn)} booked in</div>
            `}
          </div>
        </div>
        ${canManage && !renaming ? `
        <div style="position:relative;flex:0 0 auto;" data-rowactions-root data-priceopspicker-root>
          <div class="taskicons">
            <div class="taskicon" title="More actions" onclick="event.stopPropagation();toggleRowActionsMenu('pel_${el.id}')">▾</div>
          </div>
          ${rowActionsMenuOpenFor==='pel_'+el.id ? `
          <div class="statusmenu" style="right:0;left:auto;" onclick="event.stopPropagation()">
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;startRenamePricingElement('${el.id}','${jsAttr(el.name)}')">✎ Edit</div>
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;togglePriceElementOperativesPicker('${el.id}')">👤 Select Operatives</div>
            ${el.closed ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;reopenPricingElement('${el.id}')">↺ Reopen</div>` : ''}
            <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deletePricingElement('${el.id}','${jsAttr(el.name)}')">🗑 Delete</div>
          </div>
          ` : ''}
        </div>
        ` : ''}
      </div>

      ${!open ? '' : `
      <div style="padding:0 14px 14px;">
        ${el.closed && canManage ? `
        <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:8px 10px;background:var(--paper);border-radius:8px;">
          <input type="checkbox" style="width:auto;" ${el.closed_show_price_to_operatives?'checked':''} onchange="togglePricingElementShowWhenClosed('${el.id}', this.checked)">
          Let operatives with access still see the price while this is closed
        </label>
        ` : ''}
        ${canManage ? `
        <label class="stub" style="display:flex;align-items:center;gap:8px;margin:10px 0 12px;padding:8px 10px;background:var(--paper);border-radius:8px;">
          <input type="checkbox" style="width:auto;" ${el.include_in_summary!==false?'checked':''} onchange="toggleIncludeInSummary('${el.id}', this.checked)">
          Include in the Overview summary at the top of the Price tile
        </label>
        ` : ''}

        <div class="formfield" style="${canManage?'':'margin-top:12px;'}">
          <label class="field-label">Price Total</label>
          ${canManage
            ? `<div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" step="0.01" inputmode="decimal" value="${el.price_total!=null?el.price_total:''}" placeholder="0.00" onblur="savePriceField('${el.id}','price_total',this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"></div>`
            : `<p class="stub" style="margin:0;padding-left:12px;font-size:15px;font-weight:700;color:var(--ink);">${fmt(priceTotal)}</p>`}
        </div>
        ${(canManage || awApprovedTotal>0) ? `
        <div class="formfield">
          <label class="field-label">Agreed Variation Costs</label>
          <p class="stub" style="margin:0;padding-left:12px;font-size:15px;font-weight:700;color:var(--ink);">${fmt(awApprovedTotal)}</p>
          <p class="stub" style="margin:4px 0 0;font-size:11px;">${canManage ? 'Total of approved variation labour requests. Approved requests add to total price.' : 'The total value of variations approved so far, added to the price.'}</p>
        </div>
        ` : ''}
        <div class="formfield">
          <label class="field-label">Booked in${!hasOverride ? ' <span style="font-size:9px;font-style:italic;font-weight:600;text-transform:none;letter-spacing:normal;">(auto)</span>' : ''}</label>
          ${canManage
            ? `<div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" step="0.01" inputmode="decimal" value="${hasOverride?el.price_booked_override:''}" placeholder="${autoBookedIn.toFixed(2)}" onblur="savePriceField('${el.id}','price_booked_override',this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"></div>`
            : `<p class="stub" style="margin:0;padding-left:12px;font-size:15px;font-weight:700;color:var(--ink);">${fmt(bookedIn)}</p>`}
          ${canManage ? `<p class="stub" style="margin:4px 0 0;font-size:11px;">Leave blank to auto-total the weekly figures below (currently ${fmt(autoBookedIn)}). Enter a value here to override it.</p>` : ''}
        </div>
        <div class="formfield">
          <label class="field-label">Variations Not Approved <span style="font-size:9px;font-style:italic;font-weight:600;text-transform:none;letter-spacing:normal;">(currently allocated to original price labour)</span></label>
          <p class="stub" style="margin:0;padding-left:12px;font-size:15px;font-weight:700;color:var(--ink);">${fmt(awNotApprovedTotal)}</p>
        </div>
        <div class="formfield" style="margin-bottom:14px;padding-bottom:14px;border-bottom:2px solid var(--brand1);">
          <label class="field-label">Balance</label>
          <p class="stub" style="margin:0;padding-left:12px;font-size:15px;font-weight:700;color:${balance<0?'var(--brand1)':'var(--ink)'};">${fmt(balance)}</p>
          ${balance<0 ? `<p class="stub" style="margin:4px 0 0;font-size:12px;font-weight:800;color:var(--warn);">Speak to Project Manager ASAP as price is overbooked</p>` : ''}
        </div>

        <div class="card" style="padding:0;overflow:hidden;margin:28px 0 0;">
          <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;" onclick="weeklyPriceSectionOpen['${el.id}']=${!weeklyOpen};render()">
            <span class="arrow">${weeklyOpen?'▼':'▶'}</span> Booked In
          </p>
          ${weeklyOpen ? `
          <div style="padding:0 14px 14px;">
          ${weeksToShow<1 ? `<p class="stub" style="margin:0;">${canManage?'Add a figure for Week 1 below.':'No weekly figures yet.'}</p>` : ''}
          ${Array.from({length:Math.max(weeksToShow,0)}, (_,i)=>i+1).map(wk=>{
            const isLatest = wk===weeksToShow;
            const wkOpen = priceWeekRowIsOpen(el.id, wk, isLatest);
            return `
            <div style="border-bottom:1px solid var(--line);margin-bottom:6px;padding-bottom:${wkOpen?'6px':'0'};">
              <p class="ddrow" style="margin:0;padding:8px 0;border:none;border-radius:0;background:transparent;display:flex;align-items:center;gap:6px;" onclick="togglePriceWeekRow('${el.id}',${wk},${isLatest})">
                <span class="arrow">${wkOpen?'▼':'▶'}</span> Week ${wk}
                <span style="margin-left:auto;font-weight:700;font-size:13px;">${weekMap[wk]!=null?fmt(weekMap[wk]):fmt(0)}</span>
              </p>
              ${wkOpen ? `
              <div class="formfield">
                <label class="field-label">${(d.hasPriceAcc||d.pbSheet) ? 'Amount <span style="font-size:9px;font-style:italic;font-weight:600;text-transform:none;letter-spacing:normal;">(auto, from build-up below)</span>' : 'Amount'}</label>
                ${d.pbSheet
                  ? `<p class="stub" style="margin:0;font-size:15px;font-weight:700;color:var(--ink);">${weekMap[wk]!=null?fmt(weekMap[wk]):fmt(0)}</p>`
                  : canManage
                  ? `<div style="display:flex;gap:6px;align-items:center;">
                      <input type="number" step="0.01" inputmode="decimal" value="${weekMap[wk]!=null?weekMap[wk]:''}" placeholder="0.00" style="flex:1;" onblur="savePriceWeek('${el.id}','${siteId}',${wk},this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
                      ${d.hasPriceAcc ? `<button type="button" class="ghostbtn" style="width:auto;padding:9px 10px;font-size:13px;flex:0 0 auto;" title="Recalculate from build-up rows" onclick="recalcPriceWeek('${el.id}','${siteId}',${wk})">↻</button>` : ''}
                    </div>`
                  : `<p class="stub" style="margin:0;">${weekMap[wk]!=null?fmt(weekMap[wk]):'—'}</p>`}
              </div>
              ${d.pbSheet ? priceBuilderItemWeekBreakdownHtml(el.id, siteId, wk, d.pbItems, pbWeeksByItem, canManage, fmt) : ''}
              ${d.pbSheet && canManage ? priceBuilderLabourWagesHtml(el.id, siteId, d.pbSheet.id, wk, assignedOperatives, orgOperativesForExtra, extraOpEntriesByWeek[wk]||[], costEntriesByWeek[wk]||[], fmt) : ''}
              ${d.pbSheet && canManage ? `<button type="button" class="darkbtn" style="width:auto;padding:9px 16px;font-size:13px;margin-top:4px;" onclick="pbWeekSaveAll('${el.id}','${siteId}','${d.pbSheet.id}',${wk})">💾 Save</button>` : ''}
              ${d.pbSheet && wageOverrideMap[wk] ? `<p class="stub" style="margin:6px 0 0;font-size:11px;color:var(--warn);font-weight:600;">⚠ Saved despite wages not matching work booked in — ${escapeHtml(wageOverrideMap[wk])}</p>` : ''}
              ${!d.pbSheet && d.hasPriceAcc ? priceWeekOperativeBreakdownHtml(el.id, siteId, wk, assignedOperatives, orgOperativesForExtra, opEntriesByWeek[wk]||{}, extraOpEntriesByWeek[wk]||[], costEntriesByWeek[wk]||[], fmt) : ''}
              ` : ''}
            </div>
            `;
          }).join('')}
          </div>
          ` : ''}
        </div>

        <div class="card" style="padding:0;overflow:hidden;margin:14px 0 0;">
          <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;" onclick="variationSectionOpen['${el.id}']=${!variationOpen};render()">
            <span class="arrow">${variationOpen?'▼':'▶'}</span> Variation to Price
          </p>
          ${variationOpen ? `
          <div style="padding:0 14px 14px;">
          <div class="statusbtns" style="margin-bottom:${awFormOpen?'10px':'0'};">
            <div class="statusbtn" style="flex:1;background:var(--brand1);border-color:var(--brand1);color:var(--brand1-text);" onclick="additionalWorksFormOpen['${el.id}']=${!awFormOpen};render()">Variation to Price Request</div>
          </div>
          ${awFormOpen ? `
          <div style="margin-bottom:14px;">
            <div class="formfield" style="margin-top:0;">
              <label class="field-label">Amount</label>
              <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" id="awAmount_${el.id}" step="0.01" inputmode="decimal" placeholder="0.00"></div>
            </div>
            <div class="formfield">
              <label class="field-label">Explain the variation</label>
              <textarea id="awNote_${el.id}" rows="3" style="width:100%;font-family:inherit;font-size:13px;padding:10px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;"></textarea>
            </div>
            <button class="darkbtn" onclick="submitAdditionalWorksRequest('${siteId}','${el.id}')">Add Request</button>
          </div>
          ` : ''}
          ${d.awRows.length ? d.awRows.map(r=>`
            <div class="sitecard" style="flex-wrap:wrap;margin-bottom:18px;border-color:var(--brand1);border-width:1.5px;background:color-mix(in srgb, var(--brand1) 6%, var(--card, #fff));">
              ${awRevisingId===r.id ? `
              <div class="info" style="width:100%;">
                <div class="formfield" style="margin:0 0 8px;">
                  <label class="field-label">Amount</label>
                  <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" id="awReviseAmount" step="0.01" inputmode="decimal" value="${r.amount}"></div>
                </div>
                <div class="formfield" style="margin:0 0 8px;">
                  <label class="field-label">Explain the variation</label>
                  <textarea id="awReviseNote" rows="3" style="width:100%;font-family:inherit;font-size:13px;padding:10px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;">${escapeHtml(r.note)}</textarea>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="darkbtn" style="width:auto;padding:8px 12px;" onclick="saveRevisedAdditionalWorks('${siteId}','${r.id}')">${awRevisingOriginalStatus==='rejected'?'Save &amp; Resubmit':awRevisingOriginalStatus==='approved'?'Save':'Save &amp; Approve'}</button>
                  <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="cancelReviseAdditionalWorks()">Cancel</button>
                </div>
              </div>
              ` : awRejectingId===r.id ? `
              <div class="info" style="width:100%;">
                <div class="name">${fmt(r.amount)} — ${escapeHtml(r.note)}</div>
                <div class="formfield" style="margin:8px 0;">
                  <label class="field-label">Reason for rejecting</label>
                  <textarea id="awRejectReason" rows="2" style="width:100%;font-family:inherit;font-size:13px;padding:10px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;" oninput="awRejectReasonDraft=this.value">${escapeHtml(awRejectReasonDraft)}</textarea>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="darkbtn" style="width:auto;padding:8px 12px;background:var(--red);border-color:var(--red);" onclick="confirmRejectAdditionalWorks('${siteId}','${r.id}')">Confirm Reject</button>
                  <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="cancelRejectAdditionalWorks()">Cancel</button>
                </div>
              </div>
              ` : `
              <div class="info">
                <div class="name">${fmt(r.amount)} <span class="statustag ${r.status==='approved'?'approved':r.status==='rejected'?'rejected':'pending'}" style="margin-left:4px;">${r.status==='approved'?'Approved':r.status==='rejected'?'Rejected':'Pending'}</span></div>
                <div class="addr">${escapeHtml(r.note)} — requested by ${escapeHtml(nameOf(r.requested_by))}</div>
                ${r.status==='rejected' && r.rejection_reason ? `<div class="addr" style="color:var(--red);margin-top:2px;">Reason: ${escapeHtml(r.rejection_reason)}</div>` : ''}
                ${r.photo_path ? `<img src="${publicUrl('site-photos', r.photo_path)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;margin-top:6px;display:block;cursor:pointer;" onclick="viewDrawing('${publicUrl('site-photos', r.photo_path)}', true)">` : ''}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                ${(canManage && r.status==='pending') ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;color:var(--ok);border-color:var(--ok);font-family:'Sora',-apple-system,sans-serif;font-weight:700;font-size:10.9px;" onclick="approveAdditionalWorks('${siteId}','${r.id}')">Approve</button>` : ''}
                ${(canManage && r.status==='pending') ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;color:var(--red);border-color:var(--red);font-family:'Sora',-apple-system,sans-serif;font-weight:700;font-size:10.9px;" onclick="startRejectAdditionalWorks('${r.id}')">Decline</button>` : ''}
                ${(canManage && r.status==='pending') ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;font-family:'Sora',-apple-system,sans-serif;font-weight:700;font-size:10.9px;" onclick="startReviseAdditionalWorks('${r.id}','pending')">Revise and Approve</button>` : ''}
                ${(canManage && r.status==='rejected') ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;font-family:'Sora',-apple-system,sans-serif;font-weight:700;font-size:10.9px;" onclick="startReviseAdditionalWorks('${r.id}','rejected')">Revisit</button>` : ''}
                ${(canManage && r.status==='approved') ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;font-family:'Sora',-apple-system,sans-serif;font-weight:700;font-size:10.9px;" onclick="startReviseAdditionalWorks('${r.id}','approved')">Edit</button>` : ''}
                ${(!r.photo_path && (canManage || r.requested_by===ME.id)) ? `<div class="roundplusbtn" style="width:26px;height:26px;font-size:15px;flex:0 0 auto;" title="Add photo" onclick="document.getElementById('awPhotoInput_${r.id}').click()">+</div><input type="file" id="awPhotoInput_${r.id}" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="uploadAwPhoto(this,'${siteId}','${r.id}')">` : ''}
                ${(canManage || (r.requested_by===ME.id && r.status==='pending')) ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;color:var(--red);border-color:var(--red);font-family:'Sora',-apple-system,sans-serif;font-weight:700;font-size:10.9px;" onclick="deleteAdditionalWorksRequest('${siteId}','${r.id}')">Remove</button>` : ''}
              </div>
              `}
            </div>
          `).join('') : `<div class="empty">No variations requested yet.</div>`}
          </div>
          ` : ''}
        </div>

        ${d.pbSheet ? `
        <div class="card" style="margin:14px 0 0;border-color:var(--brand1);">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <p class="sectiontitle" style="margin:0 0 4px;">💷 Price Sheet — ${escapeHtml(d.pbSheet.title)}</p>
            ${canManage ? `<div class="roundplusbtn" style="width:28px;height:28px;font-size:17px;flex:0 0 auto;" title="Add another price sheet" onclick="go('#/site/${siteId}/pricebuilder')">+</div>` : ''}
          </div>
          <p class="stub" style="margin:0 0 10px;">${d.hasPriceAcc ? 'This element\'s own price sheet — view or export it here, scoped to whoever has access to this element only.' : 'The price sheet for this element of work.'}</p>
          <div class="row-gap">
            <button class="darkbtn" style="flex:1;" onclick="exportPriceBuilderSheetPdf('${siteId}','${d.pbSheet.id}')">📄 View PDF</button>
            <button class="ghostbtn" style="flex:1;" onclick="exportPriceBuilderSheet('${d.pbSheet.id}')">⬇ Excel</button>
          </div>
        </div>
        ` : ''}

        ${!d.pbSheet ? `
        <div class="card" style="padding:0;overflow:hidden;margin:14px 0 0;">
          <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;" onclick="priceFilesSectionOpen['${el.id}']=${!filesOpen};render()">
            <span class="arrow">${filesOpen?'▼':'▶'}</span> Price Sheet
          </p>
          ${filesOpen ? `
          <div style="padding:0 14px 14px;">
            ${canManage ? `
            <div class="card" style="margin-bottom:14px;">
              <p class="stub" style="margin:0 0 10px;">PDF or Excel — you can select more than one at a time.</p>
              <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 10px;">
                <input type="checkbox" style="width:auto;" ${applyAllChecked?'checked':''} onchange="togglePriceFileApplyToAll('${el.id}', this.checked)">
                Apply to all Pricing Elements${el.sub_site_id ? ' at this address' : ''}
              </label>
              <div class="ghostbtn" style="text-align:center;cursor:pointer;" onclick="document.getElementById('priceFileUpload_${el.id}').click()">⬆ Upload files</div>
              <input type="file" id="priceFileUpload_${el.id}" accept=".xlsx,.xls,.csv,.pdf" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="uploadPriceFiles('${siteId}','${el.id}',${el.sub_site_id?`'${el.sub_site_id}'`:'null'}, this)">
            </div>
            ` : ''}
            ${d.priceFiles.length ? d.priceFiles.map(f=>`
              <div class="sitecard">
                <div class="info"><div class="name">${/\.(xlsx|xls|csv)$/i.test(f.filename)?'📊':'📄'} ${escapeHtml(f.filename)}${!f.element_id ? ' <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--brand1);">Applies to all</span>' : ''}</div><div class="addr">${new Date(f.uploaded_at).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div></div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="viewPriceFile('${siteId}','${jsAttr(f.storage_path)}','${jsAttr(f.filename)}')">View</button>
                  ${canManage ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;color:var(--warn);" onclick="deletePriceFile('${siteId}','${f.id}','${jsAttr(f.storage_path)}')">Delete</button>` : ''}
                </div>
              </div>
            `).join('') : `<div class="empty">No price files uploaded yet${canManage ? ' — add one above.' : '.'}</div>`}

            ${priceFilePreview.path ? `
            <p class="sectiontitle" style="display:flex;align-items:center;justify-content:space-between;">
              <span>Preview — ${escapeHtml(priceFilePreview.filename||'')}</span>
              <span style="cursor:pointer;font-weight:400;font-size:12.5px;color:var(--slate);" onclick="closePriceFilePreview()">✕ Close</span>
            </p>
            ${priceFilePreview.loading ? `<p class="stub">Loading…</p>`
              : priceFilePreview.error ? `<div class="empty">${escapeHtml(priceFilePreview.error)}</div>`
              : `<div style="overflow-x:auto;background:#fff;border-radius:12px;border:1px solid var(--line);padding:4px;"><style>#priceSheetTable{border-collapse:collapse;font-size:12.5px;} #priceSheetTable td{border:1px solid var(--line);padding:4px 8px;white-space:nowrap;}</style>${priceFilePreview.sheetHtml}</div>`}
            ` : ''}
          </div>
          ` : ''}
        </div>
        ` : ''}

        ${d.canSeeLabour ? `
        <div class="card" style="padding:0;overflow:hidden;margin:14px 0 0;">
          <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;" onclick="labourInvoicesSectionOpen['${el.id}']=!labourInvoicesSectionOpen['${el.id}'];render()">
            <span class="arrow">${labourInvoicesSectionOpen[el.id]?'▼':'▶'}</span> Labour Invoices
          </p>
          ${labourInvoicesSectionOpen[el.id] ? `
          <div style="padding:8px 14px 14px;">
            <div class="card" style="padding:0;overflow:hidden;margin-bottom:14px;">
              <p class="ddrow" style="margin:0;padding:14px 14px 12px;line-height:1.5;border:none;border-radius:0;background:transparent;" onclick="labourInvoicesListOpen['${el.id}']=${!labourListOpen};render()">
                <span class="arrow">${labourListOpen?'▼':'▶'}</span> Invoices
              </p>
              ${labourListOpen ? `
              <div style="padding:0 14px 14px;">
                ${canManage ? `
                <p class="stub" style="margin:0 0 10px;">Upload any file type — you can select more than one at a time.</p>
                <div class="ghostbtn" style="text-align:center;cursor:pointer;margin-bottom:10px;" onclick="document.getElementById('labourInvoiceUpload_${el.id}').click()">⬆ Upload files</div>
                <input type="file" id="labourInvoiceUpload_${el.id}" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="uploadLabourInvoices('${siteId}','${el.id}', this)">
                ` : ''}
                ${d.labourFiles.length ? d.labourFiles.map(f=>`
                  <div class="sitecard">
                    <div class="info"><div class="name">${/\.(xlsx|xls|csv)$/i.test(f.filename)?'📊':/\.pdf$/i.test(f.filename)?'📄':'📎'} ${escapeHtml(f.filename)}</div><div class="addr">${new Date(f.uploaded_at).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div></div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="viewLabourInvoice('${siteId}','${jsAttr(f.storage_path)}','${jsAttr(f.filename)}')">View</button>
                      ${canManage ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;color:var(--warn);" onclick="deleteLabourInvoice('${siteId}','${f.id}','${jsAttr(f.storage_path)}')">Delete</button>` : ''}
                    </div>
                  </div>
                `).join('') : `<div class="empty">No invoices uploaded yet${canManage ? ' — add one above.' : '.'}</div>`}
              </div>
              ` : ''}
            </div>

            ${labourInvoicePreview.path ? `
            <p class="sectiontitle" style="display:flex;align-items:center;justify-content:space-between;">
              <span>Preview — ${escapeHtml(labourInvoicePreview.filename||'')}</span>
              <span style="cursor:pointer;font-weight:400;font-size:12.5px;color:var(--slate);" onclick="closeLabourInvoicePreview()">✕ Close</span>
            </p>
            ${labourInvoicePreview.loading ? `<p class="stub">Loading…</p>`
              : labourInvoicePreview.error ? `<div class="empty">${escapeHtml(labourInvoicePreview.error)}</div>`
              : `<div style="overflow-x:auto;background:#fff;border-radius:12px;border:1px solid var(--line);padding:4px;margin-bottom:14px;"><style>#labourInvoiceSheetTable{border-collapse:collapse;font-size:12.5px;} #labourInvoiceSheetTable td{border:1px solid var(--line);padding:4px 8px;white-space:nowrap;}</style>${labourInvoicePreview.sheetHtml}</div>`}
            ` : ''}
          </div>
          ` : ''}
        </div>
        ` : ''}
      </div>
      `}
    </div>
    ${priceElementOperativesPickerFor===el.id ? `
    <div class="geo-modal-overlay" style="display:flex;" onclick="if(event.target===this){priceElementOperativesPickerFor=null;render();}">
      <div class="geo-modal-card" style="max-height:78vh;overflow-y:auto;">
        <p class="sectiontitle" style="margin-top:0;">Select Operatives — ${escapeHtml(el.name)}</p>
        <p class="stub" style="margin:0 0 12px;">Tap an operative assigned to this site to grant or remove access to this Pricing Element.</p>
        ${assignedOperatives.map(p=>`
          <div class="sitecard" style="padding:9px 11px;gap:8px;cursor:pointer;" onclick="toggleElementAccess('${el.id}','${siteId}','${p.id}',${elementAccessIds.has(p.id)})">
            <div class="info"><div class="name" style="font-size:13px;">${escapeHtml(p.name)}</div></div>
            <span style="font-weight:700;color:var(--brand1);">${elementAccessIds.has(p.id)?'✓':''}</span>
          </div>
        `).join('') || `<div class="empty">No operatives assigned to this site yet.</div>`}
        <button class="darkbtn" style="width:100%;margin-top:14px;" onclick="priceElementOperativesPickerFor=null;render();">Done</button>
      </div>
    </div>
    ` : ''}
    `;
}

// Per-item weekly booking breakdown for a Pricing Element that was created
// by issuing a Price Sheet (el.id === some price_builder_sheets row's
// pricing_element_id). Each priced item gets a qty-booked-this-week input
// (qty × the item's snapshotted rate = that item's contribution for the
// week) plus a manual £ override that's clearly flagged — the sum across
// every item for this week is what gets written through to price_weeks via
// rollUpPriceWeekFromSheetItems, so the existing Booked-In/Balance/Overview
// calc engine above keeps working completely unchanged.
// Qty/Override inputs here are deliberately NOT saved on blur any more — see
// pbWeekSaveAll. Typing a figure used to save-and-re-render immediately,
// which (combined with a freshly-added week bumping which week counts as
// "latest") made the row you were typing into visibly snap shut mid-entry.
// Now nothing is written to the database, and the page doesn't re-render,
// until the "Save" button at the bottom of the week is pressed — so nothing
// can close under you while you're still entering figures. Each input keeps
// a stable id so pbWeekSaveAll can read its live value straight off the DOM.
function priceBuilderItemWeekBreakdownHtml(elId, siteId, wk, items, weeksByItem, canManage, fmt){
  return `
    <div style="margin:-6px 0 12px;">
      <p class="stub" style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--slate-light);">Priced items — qty booked in this week</p>
      ${(items||[]).map(it=>{
        const row = (weeksByItem[it.id]||{})[wk] || null;
        const manual = !!(row && row.is_manual);
        const qty = row && !manual ? row.qty : null;
        const amount = row ? Number(row.amount||0) : 0;
        const rate = Number(it.rate||0);
        const rowId = 'pbwRow_'+it.id+'_'+wk;
        return `
        <div style="display:grid;grid-template-columns:1fr 64px 92px 76px;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);">
          <div style="min-width:0;">
            <div style="font-size:12.5px;font-weight:600;">${escapeHtml(it.name)}${it.option_label?' — '+escapeHtml(it.option_label):''}</div>
            <div style="font-size:10.5px;color:var(--slate);">${it.quantity} ${escapeHtml(PRICE_UNIT_LABEL[it.unit]||it.unit)} on order @ ${fmt(rate)}</div>
          </div>
          ${canManage
            ? `<input type="number" id="pbwQtyInput_${it.id}_${wk}" step="0.1" placeholder="Qty" value="${qty!=null?qty:''}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:5px 6px;font-size:12px;font-family:inherit;" oninput="pbwLiveRecalc('${rowId}',${rate})" ${manual?'disabled':''}>`
            : `<span class="stub" style="margin:0;">${qty!=null?qty:'—'}</span>`}
          ${canManage
            ? `<input type="number" id="pbwManualInput_${it.id}_${wk}" step="0.01" placeholder="Override £" value="${manual&&amount!=null?amount:''}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:5px 6px;font-size:12px;font-family:inherit;" oninput="pbwLiveRecalc('${rowId}',${rate})">`
            : (manual?`<span class="stub" style="margin:0;">${fmt(amount)}</span>`:'')}
          <span class="stub" id="${rowId}" data-rate="${rate}" style="margin:0;font-weight:700;text-align:right;">${fmt(amount)}${manual?`<br><span style="font-size:8px;color:var(--warn);font-weight:800;text-transform:uppercase;letter-spacing:.03em;">Manual</span>`:''}</span>
        </div>
        `;
      }).join('') || `<div class="empty">This sheet has no priced items.</div>`}
      ${canManage && (items||[]).length ? `<p class="stub" style="margin:8px 0 0;font-size:11px;font-style:italic;">Nothing is saved until you press Save below — labour wages entered this week must match the value of work entered here.</p>` : ''}
    </div>
  `;
}
// Live-updates just the one row's total text as you type — purely visual
// (not saved), so the figure you're about to save is visible without
// forcing a full page re-render (which is what caused rows to snap shut —
// see the comment above priceBuilderItemWeekBreakdownHtml).
window.pbwLiveRecalc = function(rowId, rate){
  const span = document.getElementById(rowId);
  // rowId is 'pbwRow_<itemId>_<wk>' — item ids are UUIDs (hyphens, no
  // underscores) so splitting on '_' cleanly separates the three parts.
  const parts = rowId.split('_');
  const itemId = parts[1], wk = parts[2];
  const manualEl = document.getElementById('pbwManualInput_'+itemId+'_'+wk);
  const qtyEl = document.getElementById('pbwQtyInput_'+itemId+'_'+wk);
  if(!span) return;
  const manualVal = manualEl ? String(manualEl.value||'').trim() : '';
  let amount;
  if(manualVal!==''){ amount = Number(manualVal)||0; }
  else { amount = (Number(qtyEl && qtyEl.value)||0) * Number(rate||0); }
  span.textContent = '£' + amount.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
};
// Labour wages entered against a Price-Builder-fed element's week (e.g.
// "Demo weekly wages £300", "Andy's wages £650") — kept as its own ledger
// (same price_week_operative_entries table the free-form build-up uses,
// but never rolled straight into price_weeks here) purely so its total can
// be auto-allocated onto the sheet's own priced items further down, rather
// than being typed in as a qty per item by hand.
function priceBuilderLabourWagesHtml(elementId, siteId, sheetId, wk, assignedOperatives, orgOperatives, extraOpEntries, costEntries, fmt){
  // Every operative assigned to this site gets their own wage row up front —
  // no need to click "+ Add wage" just to log the usual names every week.
  // If they already have an entry this week (however it was created) it
  // shows pre-filled and editable here like any other row; otherwise it's a
  // blank input that creates the entry the moment a wage is typed in.
  const extraOpByOperative = {};
  extraOpEntries.forEach(e=>{ if(e.operative_id) extraOpByOperative[e.operative_id] = e; });
  const assignedIds = new Set(assignedOperatives.map(o=>o.id));
  const assignedRows = assignedOperatives.map(op=>{
    const e = extraOpByOperative[op.id];
    return {operativeId: op.id, entryId: e?e.id:null, label: op.name, amount: e?e.amount:null};
  });
  // Anything else already saved that isn't one of the assigned-operative
  // quick rows above (a manually-typed name, a "cost" line, or an
  // extra_operative entry for someone no longer assigned to the site) still
  // shows as its own editable row underneath, exactly as before.
  const otherRows = [
    ...extraOpEntries.filter(e=>!e.operative_id || !assignedIds.has(e.operative_id)).map(e=>({id:e.id, label: e.operative_id ? ((PROFILES[e.operative_id]&&PROFILES[e.operative_id].name)||'Unknown') : (e.label||'Unnamed'), amount:e.amount})),
    ...costEntries.map(e=>({id:e.id, label:e.label, amount:e.amount})),
  ];
  const total = assignedRows.reduce((s,r)=>s+Number(r.amount||0),0) + otherRows.reduce((s,r)=>s+Number(r.amount||0),0);
  const key = 'pbwage_'+elementId+'_'+wk;
  const adding = !!priceAddOpen[key];
  // Only operatives assigned to THIS site are offered here — previously
  // every operative in the org was pulled in, which made it easy to pick
  // the wrong person on a busy multi-site company.
  const pickable = assignedOperatives;
  return `
    <div style="margin:6px 0 12px;border-top:1px dashed var(--line);padding-top:10px;">
      <p class="stub" style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--slate-light);">Labour wages this week</p>
      ${assignedRows.map(r=>`
        <div style="display:grid;grid-template-columns:1fr 96px;column-gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--line);">
          <span style="font-size:12.5px;font-weight:600;overflow-wrap:anywhere;">${escapeHtml(r.label)}</span>
          <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" step="0.01" inputmode="decimal" value="${r.amount!=null?r.amount:''}" style="width:100%;" onblur="pbWageQuickSet('${elementId}','${siteId}',${wk},'${r.operativeId}',${r.entryId?`'${r.entryId}'`:'null'},this.value)"></div>
        </div>
      `).join('')}
      ${otherRows.length ? otherRows.map(r=>`
        <div style="display:grid;grid-template-columns:1fr 96px 26px;column-gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--line);">
          <span style="font-size:12.5px;font-weight:600;overflow-wrap:anywhere;">${escapeHtml(r.label)}</span>
          <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" step="0.01" inputmode="decimal" value="${r.amount!=null?r.amount:''}" style="width:100%;" onblur="pbWageSetLineValue('${r.id}','${elementId}',${wk},this.value)"></div>
          <div class="roundplusbtn" style="width:24px;height:24px;font-size:14px;" title="Remove" onclick="pbWageDeleteEntry('${r.id}','${elementId}',${wk})">×</div>
        </div>
      `).join('') : (assignedRows.length ? '' : `<div style="font-size:12px;color:var(--slate);padding:4px 0;">No operatives assigned to this site yet — add who was paid and how much below.</div>`)}
      <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-weight:800;font-size:12.5px;">
        <span>Total wages</span><span>${fmt(total)}</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <button class="ghostbtn" style="width:auto;padding:7px 12px;font-size:11px;" onclick="priceAddOpen['${key}']=!priceAddOpen['${key}'];render()">${adding?'× Cancel':'+ Add wage'}</button>
        ${total>0 ? `<button class="darkbtn" style="width:auto;padding:7px 12px;font-size:11px;" onclick="pbWageAutoAllocate('${elementId}','${siteId}','${sheetId}',${wk})" title="Fills each item's qty booked in this week from this total, top-down in sheet order">Auto-allocate to items ↓</button>` : ''}
      </div>
      ${adding ? `
      <div class="formfield" style="margin:8px 0 0;background:color-mix(in srgb, var(--brand1) 5%, transparent);padding:8px;border-radius:8px;">
        <label class="field-label">Who</label>
        <select id="pbwWhoSelect_${key}" style="width:100%;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;" onchange="document.getElementById('pbwManualWrap_${key}').hidden = this.value!=='__manual__';">
          ${pickable.map(o=>`<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
          <option value="__manual__" ${!pickable.length?'selected':''}>Someone else (type name)…</option>
        </select>
        <div id="pbwManualWrap_${key}" ${pickable.length?'hidden':''} style="margin-top:6px;">
          <input type="text" id="pbwManualName_${key}" placeholder="Name" style="width:100%;font-size:13px;padding:8px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;">
        </div>
        <label class="field-label" style="margin-top:8px;">Wage</label>
        <div class="currency-input-wrap"><span class="currency-prefix">£</span><input type="number" id="pbwValue_${key}" step="0.01" inputmode="decimal" placeholder="0.00"></div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="darkbtn" style="width:auto;padding:8px 12px;" onclick="pbWageAddRow('${elementId}','${siteId}',${wk},'${key}')">Add</button>
          <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="priceAddOpen['${key}']=false;render()">Cancel</button>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}
// Pre-set assigned-operative quick row — creates the entry the first time a
// wage is typed for that operative this week, updates it on subsequent
// edits, and deletes it if the field is cleared back to blank.
// The Qty / Override boxes for a week are deliberately not saved until
// "Save" is pressed — but the wage boxes underneath save on blur and then
// redraw the page, which used to wipe every quantity typed above them. This
// redraws and then puts back whatever was in those unsaved boxes.
async function renderKeepingPbWeekInputs(){
  const keep = {};
  document.querySelectorAll('input[id^="pbwQtyInput_"], input[id^="pbwManualInput_"]').forEach(el=>{ keep[el.id] = el.value; });
  await render();
  Object.keys(keep).forEach(id=>{ const el = document.getElementById(id); if(el && el.value !== keep[id]) el.value = keep[id]; });
}
window.pbWageQuickSet = async function(elementId, siteId, week, operativeId, existingEntryId, rawValue){
  const v = String(rawValue||'').trim();
  if(v===''){
    if(existingEntryId) await dbDelete('price_week_operative_entries', existingEntryId);
    priceWeekRowOpen[elementId+':'+week] = true;
    renderKeepingPbWeekInputs();
    return;
  }
  const amount = Number(v);
  if(isNaN(amount) || amount<0){ toast('Enter a number'); renderKeepingPbWeekInputs(); return; }
  let wageRes = null;
  try{
  if(existingEntryId){
    wageRes = await sbFetch('/rest/v1/price_week_operative_entries?id=eq.'+existingEntryId, {method:'PATCH', headers:{'Prefer':'return=representation'}, body: JSON.stringify({amount, updated_at:new Date().toISOString()})});
  } else {
    wageRes = await sbFetch('/rest/v1/price_week_operative_entries', {method:'POST', headers:{'Prefer':'return=representation'}, body: JSON.stringify({site_id:siteId, element_id:elementId, week_number:week, operative_id:operativeId, amount, kind:'extra_operative', entered_by:ME.id, updated_at:new Date().toISOString()})});
  }
  }catch(e){ wageRes = null; }
  if(!wageRes || !wageRes.ok) toast('Wage not saved — check your signal and try again.');
  priceWeekRowOpen[elementId+':'+week] = true;
  renderKeepingPbWeekInputs();
};
window.pbWageAddRow = async function(elementId, siteId, week, key){
  const sel = document.getElementById('pbwWhoSelect_'+key);
  const valEl = document.getElementById('pbwValue_'+key);
  const v = String(valEl && valEl.value || '').trim();
  const amount = v===''?0:Number(v);
  if(isNaN(amount) || amount<0){ toast('Enter a number'); return; }
  if(!sel || sel.value==='__manual__'){
    const nameEl = document.getElementById('pbwManualName_'+key);
    const name = String(nameEl && nameEl.value || '').trim();
    if(!name){ toast('Enter a name'); return; }
    await sbFetch('/rest/v1/price_week_operative_entries', {method:'POST', headers:{'Prefer':'return=representation'}, body: JSON.stringify({site_id:siteId, element_id:elementId, week_number:week, operative_id:null, kind:'cost', label:name, amount, entered_by:ME.id, updated_at:new Date().toISOString()})});
  } else {
    await sbFetch('/rest/v1/price_week_operative_entries', {method:'POST', headers:{'Prefer':'return=representation'}, body: JSON.stringify({site_id:siteId, element_id:elementId, week_number:week, operative_id:sel.value, amount, kind:'extra_operative', entered_by:ME.id, updated_at:new Date().toISOString()})});
  }
  priceAddOpen[key] = false;
  priceWeekRowOpen[elementId+':'+week] = true;
  renderKeepingPbWeekInputs();
};
window.pbWageSetLineValue = async function(entryId, elementId, week, rawValue){
  const v = String(rawValue||'').trim();
  if(v===''){ await dbDelete('price_week_operative_entries', entryId); if(elementId!=null) priceWeekRowOpen[elementId+':'+week] = true; renderKeepingPbWeekInputs(); return; }
  const amount = Number(v);
  if(isNaN(amount) || amount<0){ toast('Enter a number'); renderKeepingPbWeekInputs(); return; }
  await sbFetch('/rest/v1/price_week_operative_entries?id=eq.'+entryId, {method:'PATCH', headers:{'Prefer':'return=representation'}, body: JSON.stringify({amount, updated_at:new Date().toISOString()})});
  if(elementId!=null) priceWeekRowOpen[elementId+':'+week] = true;
  renderKeepingPbWeekInputs();
};
window.pbWageDeleteEntry = async function(entryId, elementId, week){
  await dbDelete('price_week_operative_entries', entryId);
  if(elementId!=null) priceWeekRowOpen[elementId+':'+week] = true;
  renderKeepingPbWeekInputs();
};
// Distributes this week's total entered labour wages across the sheet's own
// priced items, top-down in the same order they're listed on the sheet —
// each item soaks up money (converted to a quantity at its own rate) up to
// however much of it is still left to book (its ordered qty minus whatever
// other weeks have already booked), then whatever's left over rolls onto the
// next item down, and so on until the money or the items run out. Skips —
// and doesn't count against the pool — any item already manually overridden
// for this week, so a PM's own typed-in figure is never silently replaced.
window.pbWageAutoAllocate = async function(elementId, siteId, sheetId, week){
  const entries = await dbSelect('price_week_operative_entries', 'element_id=eq.'+elementId+'&week_number=eq.'+week+'&select=amount');
  let moneyLeft = entries.reduce((s,e)=>s+Number(e.amount||0), 0);
  if(moneyLeft<=0){ toast('Enter at least one labour wage amount first.'); return; }
  const items = await dbSelect('price_builder_sheet_items', 'sheet_id=eq.'+sheetId+'&order=sort_order.asc');
  if(!items.length){ toast('This sheet has no priced items to allocate to.'); return; }
  const itemIds = items.map(i=>i.id);
  const allItemWeeks = await dbSelect('price_builder_sheet_item_weeks', 'sheet_item_id=in.('+itemIds.join(',')+')');
  const priorQtyByItem = {}, thisWeekByItem = {};
  allItemWeeks.forEach(w=>{
    if(w.week_number===week){ thisWeekByItem[w.sheet_item_id] = w; return; }
    priorQtyByItem[w.sheet_item_id] = (priorQtyByItem[w.sheet_item_id]||0) + Number(w.qty||0);
  });
  for(const it of items){
    const existingRow = thisWeekByItem[it.id];
    if(existingRow && existingRow.is_manual){ moneyLeft -= Number(existingRow.amount||0); continue; }
    const rate = Number(it.rate||0);
    const orderedQty = Number(it.quantity||0);
    const remainingQty = Math.max(0, orderedQty - (priorQtyByItem[it.id]||0));
    const remainingValue = remainingQty*rate;
    if(moneyLeft<=0 || remainingValue<=0 || rate<=0){ await pbwUpsertRow(it.id, week, null, 0, false); continue; }
    const take = Math.min(moneyLeft, remainingValue);
    const qty = pbRound2(take/rate);
    await pbwUpsertRow(it.id, week, qty, take, false);
    moneyLeft -= take;
  }
  await rollUpPriceWeekFromSheetItems(elementId, siteId, week);
  priceWeekRowOpen[elementId+':'+week] = true;
  toast(moneyLeft > 0.01 ? `Allocated what the sheet can take — ${fmt2dp(moneyLeft)} of labour wages couldn't be matched (sheet may be fully booked).` : 'Labour wages allocated to items');
  render();
};
function fmt2dp(n){ return '£'+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }
// Upserts one item's week row (qty and/or manual amount) by sheet_item_id +
// week_number — mirrors the on_conflict pattern used for price_weeks itself.
async function pbwUpsertRow(sheetItemId, wk, qty, amount, isManual){
  const res = await sbFetch('/rest/v1/price_builder_sheet_item_weeks?on_conflict=sheet_item_id,week_number', {
    method:'POST',
    headers:{'Prefer':'resolution=merge-duplicates,return=representation'},
    body: JSON.stringify({sheet_item_id:sheetItemId, week_number:wk, qty: (qty===undefined?null:qty), amount: amount||0, is_manual: !!isManual, updated_by: ME.id})
  });
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); return false; }
  return true;
}
// Recomputes a linked Pricing Element's price_weeks total for one week from
// its Price Sheet items' weekly rows — same upsert pattern savePriceWeek
// itself uses, so nothing downstream (Booked In, Balance, Overview) needs to
// change to pick this up.
async function rollUpPriceWeekFromSheetItems(elementId, siteId, wk){
  const sheetRows = await dbSelect('price_builder_sheets', 'pricing_element_id=eq.'+elementId+'&select=id');
  const sheet = sheetRows[0]; if(!sheet) return;
  const items = await dbSelect('price_builder_sheet_items', 'sheet_id=eq.'+sheet.id+'&select=id');
  const itemIds = items.map(i=>i.id);
  const total = itemIds.length
    ? (await dbSelect('price_builder_sheet_item_weeks', 'sheet_item_id=in.('+itemIds.join(',')+')&week_number=eq.'+wk+'&select=amount')).reduce((s,r)=>s+Number(r.amount||0),0)
    : 0;
  const res = await sbFetch('/rest/v1/price_weeks?on_conflict=element_id,week_number', {
    method:'POST',
    headers:{'Prefer':'resolution=merge-duplicates,return=representation'},
    body: JSON.stringify({site_id:siteId, element_id:elementId, week_number:wk, amount:total})
  });
  if(!res.ok){ toast('Save failed — '+(await safeErr(res))); }
}
// The single "Save" button for a Price-Builder-fed element's week — reads
// every item's Qty/Override input straight off the DOM (they're no longer
// auto-saved on blur, see priceBuilderItemWeekBreakdownHtml) and, crucially,
// refuses to save at all unless the labour wages entered for this week add
// up to the same £ value as the work being booked in. Without this check it
// was possible to book in, say, £13.50 worth of tiling against only £10 of
// wages and have it silently accepted — the two figures should always tie
// out for a given week.
window.pbWeekSaveAll = async function(elementId, siteId, sheetId, wk){
  const items = await dbSelect('price_builder_sheet_items', 'sheet_id=eq.'+sheetId+'&order=sort_order.asc');
  if(!items.length){ toast('This sheet has no priced items.'); return; }
  const pending = [];
  let itemsWeekTotal = 0;
  for(const it of items){
    const rate = Number(it.rate||0);
    const qtyEl = document.getElementById('pbwQtyInput_'+it.id+'_'+wk);
    const manualEl = document.getElementById('pbwManualInput_'+it.id+'_'+wk);
    const manualVal = manualEl ? String(manualEl.value||'').trim() : '';
    const qtyVal = qtyEl ? String(qtyEl.value||'').trim() : '';
    if(manualVal!==''){
      const amount = Number(manualVal);
      if(isNaN(amount)){ toast('Enter a valid override amount for '+it.name); return; }
      pending.push({id:it.id, qty:null, amount, isManual:true});
      itemsWeekTotal += amount;
    } else {
      const qty = qtyVal==='' ? null : pbRound2(parseFloat(qtyVal));
      if(qtyVal!=='' && isNaN(qty)){ toast('Enter a valid qty for '+it.name); return; }
      const amount = Math.round((Number(qty)||0)*rate*100)/100;
      pending.push({id:it.id, qty, amount, isManual:false});
      itemsWeekTotal += amount;
    }
  }
  itemsWeekTotal = Math.round(itemsWeekTotal*100)/100;
  const wageEntries = await dbSelect('price_week_operative_entries', 'element_id=eq.'+elementId+'&week_number=eq.'+wk+'&select=amount');
  const wagesTotal = Math.round(wageEntries.reduce((s,e)=>s+Number(e.amount||0),0)*100)/100;
  let overrideReason = null;
  if(Math.abs(itemsWeekTotal - wagesTotal) > 0.01){
    // Real-world lump-sum/day-rate labour sometimes genuinely won't tie out
    // to the penny — rather than hard-blocking every such case, let it
    // through with a reason on record instead of forcing a fudge to the
    // figures just to satisfy the check.
    const reason = await customPrompt(`Labour wages (£${wagesTotal.toFixed(2)}) don't match the value of work entered (£${itemsWeekTotal.toFixed(2)}). Enter a reason to save anyway, or Cancel to go back and adjust the figures instead:`, '');
    if(reason===null) return;
    if(!reason.trim()){ toast('Enter a reason to override, or adjust the figures so they match.'); return; }
    overrideReason = reason.trim();
  }
  for(const row of pending){
    const ok = await pbwUpsertRow(row.id, wk, row.qty, row.amount, row.isManual);
    if(!ok) return;
  }
  await rollUpPriceWeekFromSheetItems(elementId, siteId, wk);
  // Record (or clear) the override note against this week's price_weeks
  // row — rollUpPriceWeekFromSheetItems above only just created/updated
  // that row's amount, so this is a quick follow-up patch rather than a
  // second full upsert.
  await sbFetch('/rest/v1/price_weeks?element_id=eq.'+elementId+'&week_number=eq.'+wk, {
    method:'PATCH', headers:{'Prefer':'return=representation'},
    body: JSON.stringify(overrideReason
      ? {wage_mismatch_override_reason: overrideReason, wage_mismatch_override_by: ME.id, wage_mismatch_override_at: new Date().toISOString()}
      : {wage_mismatch_override_reason: null, wage_mismatch_override_by: null, wage_mismatch_override_at: null})
  });
  priceWeekRowOpen[elementId+':'+wk] = true;
  toast(overrideReason ? 'Saved with override noted' : 'Saved');
  render();
};
