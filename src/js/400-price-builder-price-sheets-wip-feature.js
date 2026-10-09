/* ================= PRICE BUILDER — price sheets (WIP feature) =================
   Separate from the Pricing Elements system above (see #PB-wip) — builds a
   tick-box price sheet from the org's rate card (Settings & Admin ›
   Price Sheet Rate Card) for a specific site, to issue to a
   subcontractor. Draft sheets are only ever visible to PM/admin (RLS also
   enforces this); issuing one snapshots every line's rate so a later rate
   card edit never changes an already-issued sheet, and makes it visible
   read-only to anyone assigned to the site. */
const PRICE_BUILDER_FMT = n => '£' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
let priceBuilderNewOpen = false;
let priceBuilderNewAssignees = []; // userIds ticked on the "+ New Sheet" form, before the sheet even exists
// Ticking an assignee chip re-renders the whole form (to show it as
// selected), which would otherwise wipe out a Title the user had typed but
// not yet blurred out of — so the title is kept in this draft var and fed
// back in as the input's value, the same way pbWorking.title survives
// re-renders once a sheet exists.
let priceBuilderNewTitleDraft = '';
window.pbNewToggleAssignee = function(userId){
  const idx = priceBuilderNewAssignees.indexOf(userId);
  if(idx>-1) priceBuilderNewAssignees.splice(idx,1); else priceBuilderNewAssignees.push(userId);
  render();
};
// Shared tick-chip UI for "who is this sheet for" — ticking someone here is
// what (once the sheet is issued) grants them access to the Pricing Element
// in the Price tile, via grantElementAccessBulk — replacing the old
// free-text Subcontractor field, which never linked through to anything.
function pbAssigneeChipsHtml(operatives, selectedIds, toggleFn){
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;">
    ${(operatives||[]).map(p=>{
      const on = selectedIds.includes(p.id);
      return `<div onclick="${toggleFn}('${p.id}')" style="padding:6px 10px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${on?'var(--brand1)':'var(--line)'};background:${on?'var(--brand1)':'#fff'};color:${on?'var(--brand1-text)':'var(--ink)'};">${on?'✓ ':''}${escapeHtml(p.name)}</div>`;
    }).join('') || `<div class="empty" style="padding:8px;">No operatives assigned to this site yet.</div>`}
  </div>`;
}
async function renderPriceBuilderSheets(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canManage = canUsePriceBuilder(); // PMs + admin, see canUsePriceBuilder
  const [sheets, assignedOperatives] = await Promise.all([
    dbSelect('price_builder_sheets', 'site_id=eq.'+siteId+'&order=created_at.desc'),
    priceBuilderNewOpen ? siteAssignedOperatives(siteId) : Promise.resolve([]),
  ]);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="row-gap" style="align-items:flex-start;margin-bottom:14px;">
      <p class="stub" style="margin:0;flex:1;">${canManage ? 'Tick-box price sheets built from the company rate card, ready to issue to a subcontractor.' : 'Price sheets issued for this project.'}</p>
      ${canManage && sheets.length ? `<div class="roundplusbtn" style="width:34px;height:34px;font-size:19px;flex:0 0 auto;" title="New Sheet" onclick="priceBuilderNewOpen=!priceBuilderNewOpen;render()">+</div>` : ''}
    </div>
    ${sheets.filter(s=>canManage || (isManager(ME) && s.status==='issued') || (s.status==='issued' && (s.assigned_user_ids||[]).includes(ME.id))).map(s=>`
      <div class="sitecard" style="cursor:pointer;" onclick="go('#/site/${siteId}/pricebuilder/${s.status==='issued'?'view':'edit'}/${s.id}')">
        <div class="info">
          <div class="name">${escapeHtml(s.title||'Price')}</div>
          ${s.subcontractor_name?`<div class="sub">${escapeHtml(s.subcontractor_name)}</div>`:''}
        </div>
        <span class="pill ${s.status==='issued'?'on':'off'}">${s.status==='issued'?'Issued':'Draft'}</span>
        ${rowActionsMenuHtml('pbsheetrow'+s.id, `
          ${s.status==='issued' ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;exportPriceBuilderSheet('${s.id}')">⬇ Export to Excel</div>` : ''}
          ${s.status==='issued' ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;emailPriceBuilderSheetPdf('${siteId}','${s.id}')">✉️ Email</div>` : ''}
          ${canManage && s.status==='issued' ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;go('#/site/${siteId}/pricebuilder/edit/${s.id}')">✏️ Edit</div>` : ''}
          ${canManage && s.status==='issued' ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;unissuePriceBuilderSheet('${siteId}','${s.id}')">↩️ Un-issue</div>` : ''}
          ${canManage ? `<div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deletePriceBuilderSheet('${siteId}','${s.id}')">🗑 Delete</div>` : ''}
        `)}
      </div>
    `).join('') || `<div class="empty">${canManage?'No sheets yet — create your first one below.':'Nothing issued yet.'}</div>`}
    ${canManage ? (priceBuilderNewOpen ? `
      <div class="card" style="margin-top:14px;">
        <div class="formfield" style="margin-top:0;"><label class="field-label">Title</label><input type="text" id="pbNewTitle" value="${escapeHtml(priceBuilderNewTitleDraft)}" placeholder="Price" oninput="const p=this.selectionStart; this.value=titleCaseWords(this.value); this.setSelectionRange(p,p); priceBuilderNewTitleDraft=this.value"></div>
        <div class="formfield"><label class="field-label">Assign to</label>${pbAssigneeChipsHtml(assignedOperatives, priceBuilderNewAssignees, 'pbNewToggleAssignee')}</div>
        <div class="row-gap">
          <button class="darkbtn" style="flex:1;" onclick="createPriceBuilderSheet('${siteId}')">Create</button>
          <button class="ghostbtn" style="flex:1;" onclick="priceBuilderNewOpen=false;priceBuilderNewAssignees=[];priceBuilderNewTitleDraft='';render()">Cancel</button>
        </div>
      </div>
    ` : (sheets.length ? '' : `<button class="darkbtn" style="margin-top:14px;" onclick="priceBuilderNewOpen=true;render()">+ New Sheet</button>`)) : ''}
  `, {title:'Price Sheet', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/price`, siteId, tabs:false}); }
}
window.createPriceBuilderSheet = async function(siteId){
  const title = document.getElementById('pbNewTitle').value.trim() || 'Price';
  await loadAllProfiles();
  const assignedUserIds = priceBuilderNewAssignees.slice();
  const subcontractor_name = assignedUserIds.map(id=>PROFILES[id]&&PROFILES[id].name).filter(Boolean).join(', ') || null;
  const rows = await dbInsert('price_builder_sheets', {org_id:ME.org_id, site_id:siteId, title, subcontractor_name, assigned_user_ids:assignedUserIds, created_by:ME.id});
  if(rows && rows[0]){ priceBuilderNewOpen = false; priceBuilderNewAssignees = []; priceBuilderNewTitleDraft = ''; go(`#/site/${siteId}/pricebuilder/edit/${rows[0].id}`); }
};
window.pbRenameSheet = async function(sheetId, value){
  const title = value.trim();
  if(!title){ toast("Title can't be empty."); render(); return; }
  const row = await dbUpdate('price_builder_sheets', sheetId, {title});
  if(row) toast('Sheet renamed'); else render();
};
// Deleting a draft is unconditional (nothing's been booked against a sheet
// that was never issued). Deleting an issued sheet is only allowed once
// nothing's booked/allocated against any of its items — checked both via
// price_builder_sheet_item_weeks (the per-item weekly build-up) and via a
// manual Booked In override on the Pricing Element it fed, since either one
// would otherwise be silently orphaned. If it goes ahead, the Pricing
// Element and any still-untouched Schedule of Works section/tasks it
// created are cleaned up too rather than left behind as an empty tile.
window.deletePriceBuilderSheet = async function(siteId, sheetId){
  const sheetRows = await dbSelect('price_builder_sheets', 'id=eq.'+sheetId);
  const sheet = sheetRows[0];
  if(!sheet){ toast('Sheet not found.'); render(); return; }

  let el = null;
  if(sheet.status==='issued'){
    const items = await dbSelect('price_builder_sheet_items', 'sheet_id=eq.'+sheetId+'&select=id');
    if(items.length){
      const itemIds = items.map(i=>i.id).join(',');
      const weeks = await dbSelect('price_builder_sheet_item_weeks', 'sheet_item_id=in.('+itemIds+')&select=amount');
      const totalAllocated = weeks.reduce((s,w)=>s+Number(w.amount||0),0);
      if(totalAllocated > 0){ toast("Can't delete — this sheet has bookings against it. Remove them first."); return; }
    }
    if(sheet.pricing_element_id){
      el = (await dbSelect('pricing_elements', 'id=eq.'+sheet.pricing_element_id))[0] || null;
      if(el && el.price_booked_override!=null && Number(el.price_booked_override)>0){ toast("Can't delete — its price tile has a manual Booked In amount set. Clear that first."); return; }
    }
  }

  if(!await customConfirm(sheet.status==='issued' ? 'Delete this issued sheet? This removes its price tile and its Schedule of Works section (with all its tasks) too. This can\'t be undone.' : 'Delete this draft sheet? This can\'t be undone.')) return;

  // The reciprocal Schedule of Works section this sheet created goes with
  // it — deleted in full, tasks and all, rather than left behind as an
  // orphaned section once the sheet that populated it is gone.
  if(sheet.schedule_section_id){
    const tasks = await dbSelect('schedule_tasks', 'section_id=eq.'+sheet.schedule_section_id+'&select=id');
    for(const t of tasks) await dbDelete('schedule_tasks', t.id);
    await dbDelete('schedule_sections', sheet.schedule_section_id);
  }
  if(sheet.pricing_element_id) await dbDelete('pricing_elements', sheet.pricing_element_id);

  const ok = await dbDelete('price_builder_sheets', sheetId);
  if(ok){ toast('Sheet deleted'); go(`#/site/${siteId}/pricebuilder`); }
};

// Working state for the sheet currently being built — items keyed by
// rate_item_id. Loaded fresh from the DB whenever a different sheet is
// opened (pbWorking.sheetId !== the one being rendered), so switching
// sheets never bleeds one sheet's ticks into another's, but re-renders of
// the SAME sheet (every tick/quantity change calls render()) don't stomp
// on what's still only sitting in memory and hasn't been saved yet.
// #PB-tickconfirm: sheets are built in two passes now — 'tick' (every
// category shown, checkboxes only, nothing else to fill in yet) then
// 'confirm' (only the ticked items, grouped in the same order as the rate
// card spreadsheet, each with its qty/option/text now editable). Re-opening
// a sheet that already has ticked items on it jumps straight to 'confirm'
// (see the phase default below) since there's nothing left to tick-only.
let pbWorking = {sheetId:null, title:'', assignedUserIds:[], phase:'tick', populateSOW:true, items:{}, customRows:[]};
// Set at the top of every renderPriceBuilderEdit render so the global
// pbChangeOption handler (an inline onchange, outside that function's own
// closure) can still look up an option's label/rate by id.
let pbOptionsByItemCache = {};
// Sum of price_builder_sheet_item_weeks.amount already booked in against each
// saved sheet-item id (set alongside pbOptionsByItemCache, on every reload of
// a sheet's items from the DB) — a row with anything booked against it can't
// be removed from the sheet, since that would orphan the booking history.
let pbAllocatedByItemId = {};
function pbEntryAllocated(entry){ return !!(entry && entry.id && Number(pbAllocatedByItemId[entry.id]||0) > 0); }
function pbResolvedRate(entry, item){
  if(entry.isManualRate && entry.rateOverride!=null) return Number(entry.rateOverride);
  return item.is_dropdown ? (entry.optionRate!=null?Number(entry.optionRate):0) : Number(item.rate||0);
}
function pbLineTotal(entry, item){
  const qty = Number(entry.quantity)||0;
  const rate = pbResolvedRate(entry, item);
  return qty * rate;
}
function pbCustomLineTotal(row){ return (Number(row.quantity)||0) * (Number(row.rate)||0); }
// Collapsible category headers in the builder — keyed by category name,
// default open (undefined -> true) so nothing that used to always show
// suddenly disappears the first time someone opens the page.
let pbCategoryOpen = {};
// Only the first section (the main roof element) starts open; everything
// below it — and Additional Items — starts closed until tapped.
function pbCatIsOpen(name, first){ return pbCategoryOpen[name]===undefined ? !!first : pbCategoryOpen[name]; }
window.pbToggleCategory = function(name, first){ pbCategoryOpen[name] = !pbCatIsOpen(name, first); render(); };
async function renderPriceBuilderEdit(siteId, sheetId){
  const __gen = RENDER_GEN;
  if(!canUsePriceBuilder()){ toast('Only PMs and admins can edit Price Sheets.'); go(`#/site/${siteId}/price`); return; }
  const site = SITES.find(s=>s.id===siteId);
  const sheetRows = await dbSelect('price_builder_sheets', 'id=eq.'+sheetId);
  const sheet = sheetRows[0];
  if(!sheet){ toast('Sheet not found.'); go(`#/site/${siteId}/pricebuilder`); return; }

  const priceRateItems = await dbSelect('price_rate_items', 'org_id=eq.'+ME.org_id+'&active=eq.true&order=category.asc,sort_order.asc,name.asc');
  const dropdownIds = priceRateItems.filter(i=>i.is_dropdown).map(i=>i.id).join(',');
  const priceRateOptions = dropdownIds ? await dbSelect('price_rate_options', 'rate_item_id=in.('+dropdownIds+')&order=sort_order.asc') : [];
  const optionsByItem = {};
  // A "None" option in the spreadsheet (e.g. "Additional Items": None /
  // Counter Battens / Redland Spec Uplift / ...) means "nothing extra
  // applies" — it's not something to price, so it's never offered as a
  // choice here. Not ticking any real option already means the item simply
  // isn't included on the sheet, which is exactly what "None" was standing
  // in for. (The rate card's own admin editor still shows it, since that's
  // for editing the card itself, not building a sheet.)
  priceRateOptions.forEach(o=>{
    if((o.label||'').trim().toLowerCase()==='none') return;
    (optionsByItem[o.rate_item_id]=optionsByItem[o.rate_item_id]||[]).push(o);
  });
  pbOptionsByItemCache = optionsByItem;
  const itemsById = {}; priceRateItems.forEach(it=>itemsById[it.id]=it);
  const assignedOperatives = await siteAssignedOperatives(siteId);

  if(pbWorking.sheetId !== sheetId){
    const existingItems = await dbSelect('price_builder_sheet_items', 'sheet_id=eq.'+sheetId);
    const items = {};
    const customRows = [];
    // Booked/allocated amounts already logged per sheet item — needed so a
    // row that's had money booked in against it (weekly build-up on the
    // linked Pricing Element) can't be silently deleted out from under that
    // booking when this sheet is re-edited after issuing.
    pbAllocatedByItemId = {};
    if(existingItems.length){
      const itemIdList = existingItems.map(r=>r.id).join(',');
      const weeks = await dbSelect('price_builder_sheet_item_weeks', 'sheet_item_id=in.('+itemIdList+')&select=sheet_item_id,amount');
      weeks.forEach(w=>{ pbAllocatedByItemId[w.sheet_item_id] = (pbAllocatedByItemId[w.sheet_item_id]||0) + Number(w.amount||0); });
    }
    existingItems.forEach(row=>{
      if(!row.rate_item_id){
        // No linked rate item — either a genuine custom row, or a rate item
        // since deleted from the card. Either way it still has its own
        // name/rate/quantity saved on the row itself, so keep it as a
        // custom row rather than silently dropping it.
        customRows.push({localId:uid(), id:row.id, name:row.name||'', rate:row.rate, quantity:row.quantity, unit:row.unit||'item'});
        return;
      }
      const linkedItem = itemsById[row.rate_item_id];
      const nameOverride = (linkedItem && row.name && row.name!==linkedItem.name) ? row.name : null;
      // row.rate is whatever was actually charged — the option's own rate,
      // or (if is_manual_rate) an override typed on the confirm page. Look
      // the option's real rate up from the current rate card rather than
      // trusting row.rate for it, so a manual override on reload doesn't
      // get mistaken for the option's price (or vice versa).
      let optionRate = null;
      if(row.option_id){
        const opt = (optionsByItem[row.rate_item_id]||[]).find(o=>o.id===row.option_id);
        optionRate = opt ? Number(opt.rate) : (row.is_manual_rate ? null : Number(row.rate));
      }
      // Dropdown items are multi-select, so a saved row's key has to include
      // its option_id (several rows can share the same rate_item_id, one per
      // option ticked) — a plain item still keys off its own id, same as
      // before, since it only ever has one row.
      const key = row.option_id ? (row.rate_item_id+'::'+row.option_id) : row.rate_item_id;
      items[key] = {
        id: row.id,
        rateItemId: row.rate_item_id,
        quantity:row.quantity, optionId:row.option_id||null, optionRate, optionLabel:row.option_label||null, nameOverride,
        rateOverride: row.is_manual_rate ? Number(row.rate) : null,
        isManualRate: !!row.is_manual_rate,
      };
    });
    pbWorking = {sheetId, title:sheet.title, assignedUserIds:(sheet.assigned_user_ids||[]).slice(), phase:(existingItems.length?'confirm':'tick'), populateSOW: !sheet.schedule_section_id, items, customRows};
  }

  const categories = [];
  priceRateItems.forEach(it=>{
    let cat = categories.find(c=>c.name===it.category);
    if(!cat){ cat = {name:it.category, items:[]}; categories.push(cat); }
    cat.items.push(it);
  });
  sortPriceRateCategories(categories);

  let grandTotal = 0;
  Object.keys(pbWorking.items).forEach(key=>{ const entry = pbWorking.items[key]; const item = itemsById[entry.rateItemId]; if(item) grandTotal += pbLineTotal(entry, item); });
  pbWorking.customRows.forEach(row=>{ grandTotal += pbCustomLineTotal(row); });
  const tickedCount = Object.keys(pbWorking.items).length + pbWorking.customRows.length;

  if(__gen !== RENDER_GEN) return;

  // ---------- Phase 1: tick everything you want first, nothing else ----------
  if(pbWorking.phase!=='confirm'){
    document.getElementById('app').innerHTML = shell(`
      <div class="formfield" style="margin-top:0;"><label class="field-label">Title</label><input type="text" value="${escapeHtml(pbWorking.title)}" onblur="pbWorking.title=this.value.trim()||pbWorking.title;render()"></div>
      <div class="formfield"><label class="field-label">Assign to</label>${pbAssigneeChipsHtml(assignedOperatives, pbWorking.assignedUserIds, 'pbToggleAssignee')}</div>
      <p class="stub" style="margin:0 0 10px;">Tick everything that belongs on this sheet — you'll set quantities next, once everything's ticked.</p>

      ${categories.map((cat,ci)=>{
        const open = pbCatIsOpen(cat.name, PB_OPEN_BY_DEFAULT.includes(cat.name));
        const catIds = new Set(cat.items.map(it=>it.id)); const nTicked = Object.keys(pbWorking.items).filter(k=>catIds.has(pbWorking.items[k].rateItemId)).length;
        return `
        <p class="ddrow" style="margin-top:14px;margin-bottom:8px;" onclick="pbToggleCategory('${jsAttr(cat.name)}',${PB_OPEN_BY_DEFAULT.includes(cat.name)})"><span class="arrow">${open?'▼':'▶'}</span> ${escapeHtml(cat.name)}${nTicked ? ` <span class="stub" style="font-weight:400;">· ${nTicked} ticked</span>` : ''}</p>
        ${open ? cat.items.filter(it=>!PB_HIDE_UNLESS_PLAIN_TILE_IDS.has(it.id) || pbPlainTileTicked()).map(it=>{
          const opts = optionsByItem[it.id]||[];
          if(it.is_dropdown){
            // Multi-select — any number of options can be ticked for the
            // same item (e.g. two different tile types on one sheet), each
            // becoming its own line with its own qty on the confirm page.
            // There's no separate item-level checkbox here: picking any
            // option is what ticks it.
            return `
            <div class="sitecard" style="padding:8px 10px;flex-wrap:wrap;align-items:center;gap:8px;">
              <div class="info" style="flex:1 1 100%;">
                <div class="name">${escapeHtml(it.name)}</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
                  ${opts.map(o=>{
                    const key = it.id+'::'+o.id;
                    const on = !!pbWorking.items[key];
                    return `<div onclick="pbToggleDropdownOption('${it.id}','${o.id}',${!on},'${jsAttr(o.label)}',${o.rate})" style="padding:6px 10px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${on?'var(--brand1)':'var(--line)'};background:${on?'var(--brand1)':'#fff'};color:${on?'var(--brand1-text)':'var(--ink)'};">${on?'✓ ':''}${escapeHtml(o.label)}</div>`;
                  }).join('') || `<div class="empty" style="padding:6px;">No options set up for this item yet.</div>`}
                </div>
              </div>
            </div>
          `;}
          const ticked = !!pbWorking.items[it.id];
          return `
          <div class="sitecard" style="padding:8px 10px;flex-wrap:wrap;align-items:center;gap:8px;cursor:pointer;" onclick="pbToggleItem('${it.id}',${!ticked})">
            <input type="checkbox" style="width:20px;height:20px;flex:0 0 20px;" ${ticked?'checked':''} onclick="event.stopPropagation();pbToggleItem('${it.id}',this.checked)" onchange="event.stopPropagation()">
            <div class="info">
              <div class="name">${escapeHtml(it.name)}</div>
            </div>
          </div>
        `;}).join('') : ''}
      `;}).join('') || `<div class="empty">No rate card items yet — add some from Settings &amp; Admin › Price Sheet Rate Card first.</div>`}

      <div class="card" style="margin-top:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="sectiontitle" style="margin:0;">Ticked</span>
          <span style="font-size:18px;font-weight:800;">${tickedCount}</span>
        </div>
      </div>
      <div class="row-gap" style="margin-top:10px;">
        <button class="ghostbtn" style="flex:1;" onclick="savePriceBuilderDraft('${siteId}','${sheetId}')">Save Draft</button>
        <button class="darkbtn" style="flex:1;" onclick="pbGoToConfirm()">Continue — set quantities →</button>
      </div>
    `, {title:'Price Sheet', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/pricebuilder`, siteId, tabs:false});
    return;
  }

  // ---------- Phase 2: confirm — grouped in spreadsheet order, qty/text/options ----------
  document.getElementById('app').innerHTML = shell(`
    <div class="formfield" style="margin-top:0;"><label class="field-label">Title</label><input type="text" value="${escapeHtml(pbWorking.title)}" onblur="pbWorking.title=this.value.trim()||pbWorking.title;render()"></div>
    <div class="formfield"><label class="field-label">Assign to</label>${pbAssigneeChipsHtml(assignedOperatives, pbWorking.assignedUserIds, 'pbToggleAssignee')}</div>
    <p class="stub" style="margin:0 0 10px;">Every ticked item, grouped and ordered the same way as the rate card. Set a quantity for each — you can still edit the wording, or untick something you don't need after all.</p>

    ${categories.map(cat=>{
      // A plain item contributes at most one row (key === its own id); a
      // multi-select dropdown item can contribute several — one per ticked
      // option (key === "<itemId>::<optionId>") — so rows are built by
      // scanning every ticked entry rather than assuming one-per-item.
      const catRows = [];
      cat.items.forEach(it=>{
        Object.keys(pbWorking.items).forEach(key=>{
          const entry = pbWorking.items[key];
          if(entry.rateItemId===it.id) catRows.push({key, entry, it});
        });
      });
      if(!catRows.length) return '';
      return `
      <p class="sectiontitle" style="margin:14px 0 6px;">${escapeHtml(cat.name)}</p>
      <div class="drawheaderrow" style="grid-template-columns:1fr 70px 48px 40px 62px 24px;display:grid;gap:6px;padding:0 10px;margin:0 0 4px;">
        <span>Item</span><span style="text-align:right;">Rate</span><span style="text-align:right;">Qty</span><span>Unit</span><span style="text-align:right;">Total</span><span></span>
      </div>
      ${catRows.map(({key, entry, it})=>{
        const baseRate = it.is_dropdown ? (entry.optionRate!=null?Number(entry.optionRate):0) : Number(it.rate||0);
        const displayRate = entry.isManualRate && entry.rateOverride!=null ? Number(entry.rateOverride) : baseRate;
        const opts = optionsByItem[it.id]||[];
        // Grid (not flex) so Rate/Qty/Unit/Total line up in fixed columns
        // across every row regardless of how long the item text is or
        // whether it wraps to a second line.
        return `
        <div class="sitecard" style="display:grid;grid-template-columns:1fr 70px 48px 40px 62px 24px;gap:6px;align-items:start;padding:8px 10px;">
          <div style="min-width:0;max-width:80%;">
            <input type="text" value="${escapeHtml(entry.nameOverride||it.name)}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:13px;font-weight:600;font-family:inherit;box-sizing:border-box;" onblur="pbSetItemName('${key}', this.value)">
            ${it.is_dropdown ? `
            <select style="width:100%;margin-top:4px;border:1px solid var(--line);border-radius:6px;padding:4px 6px;font-size:11.5px;font-family:inherit;color:var(--slate);background:#fff;" onchange="pbChangeOption('${key}','${it.id}', this.value)">
              ${opts.map(o=>`<option value="${o.id}" ${entry.optionId===o.id?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}
            </select>
            ` : ''}
            ${entry.isManualRate?`<div class="sub" style="margin-top:2px;color:var(--warn);font-weight:700;">⚠ Manual rate — non-conforming</div>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:2px;">£<input type="number" step="0.01" inputmode="decimal" value="${displayRate!=null?displayRate:''}" style="width:100%;min-width:0;height:32px;line-height:32px;box-sizing:border-box;font-size:13.6px;font-weight:700;border:1px solid var(--line);border-radius:6px;padding:0 4px;font-family:inherit;" onblur="pbSetRateOverride('${key}', this.value, ${baseRate})"></div>
          <input type="number" step="0.01" inputmode="decimal" placeholder="Qty" value="${entry.quantity!=null?entry.quantity:''}" style="width:100%;min-width:0;height:32px;line-height:32px;box-sizing:border-box;border:1px solid var(--line);border-radius:6px;padding:0 4px;font-size:13px;font-family:inherit;" onblur="pbSetQuantity('${key}', this.value)">
          <span class="stub" style="margin:2px 0 0;">${PRICE_UNIT_LABEL[it.unit]}</span>
          <span class="stub" style="margin:2px 0 0;font-size:13.2px;font-weight:700;text-align:right;">${PRICE_BUILDER_FMT(pbLineTotal(entry, it))}</span>
          ${pbEntryAllocated(entry)
            ? `<div class="taskicon" title="Can't remove — already booked in against" style="justify-self:center;opacity:.35;cursor:not-allowed;">🔒</div>`
            : `<div class="taskicon danger" title="Untick" onclick="pbRemoveEntry('${key}')" style="justify-self:center;">🗑</div>`}
        </div>
      `;}).join('')}
    `;}).join('')}

    <p class="ddrow" style="margin-top:14px;" onclick="pbToggleCategory('__custom',false)"><span class="arrow">${pbCatIsOpen('__custom',false)?'▼':'▶'}</span> Additional Items${pbWorking.customRows.length ? ` <span class="stub" style="font-weight:400;">· ${pbWorking.customRows.length} added</span>` : ''}</p>
    ${pbCatIsOpen('__custom',false) ? `
      <p class="stub" style="margin:0 0 8px;">Items not on the rate card — add as many as you need, just for this sheet.</p>
      ${pbWorking.customRows.map((row,idx)=>`
        <div class="sitecard" style="padding:8px 10px;flex-wrap:wrap;align-items:center;gap:8px;">
          <input type="text" placeholder="Item description" value="${escapeHtml(row.name)}" style="flex:1 1 140px;min-width:110px;border:1px solid var(--line);border-radius:6px;padding:7px 8px;font-size:13px;font-family:inherit;" onblur="pbSetCustomField(${idx},'name',this.value)">
          <div style="display:flex;align-items:center;gap:6px;flex:0 0 auto;">
            <input type="number" step="0.01" inputmode="decimal" placeholder="Qty" value="${row.quantity!=null?row.quantity:''}" style="width:64px;height:32px;box-sizing:border-box;border:1px solid var(--line);border-radius:6px;padding:0 8px;font-size:13px;font-family:inherit;" onblur="pbSetCustomField(${idx},'quantity',this.value)">
            <select style="width:64px;height:32px;box-sizing:border-box;border:1px solid var(--line);border-radius:6px;padding:0 4px;font-size:12.5px;font-family:inherit;background:#fff;" onchange="pbSetCustomField(${idx},'unit',this.value)">
              ${Object.keys(PRICE_UNIT_LABEL).map(u=>`<option value="${u}" ${(row.unit||'item')===u?'selected':''}>${PRICE_UNIT_LABEL[u]}</option>`).join('')}
            </select>
            <input type="number" step="0.01" inputmode="decimal" placeholder="Rate £" value="${row.rate!=null?row.rate:''}" style="width:80px;height:32px;box-sizing:border-box;border:1px solid var(--line);border-radius:6px;padding:0 8px;font-size:13.6px;font-family:inherit;" onblur="pbSetCustomField(${idx},'rate',this.value)">
          </div>
          <span class="stub" style="margin:0;font-weight:700;min-width:64px;text-align:right;">${PRICE_BUILDER_FMT(pbCustomLineTotal(row))}</span>
          ${row.id && Number(pbAllocatedByItemId[row.id]||0)>0
            ? `<div class="taskicon" title="Can't remove — already booked in against" style="opacity:.35;cursor:not-allowed;">🔒</div>`
            : `<div class="taskicon danger" onclick="pbRemoveCustomRow(${idx})">🗑</div>`}
        </div>
      `).join('') || ''}
      <button class="ghostbtn" style="margin-top:4px;" onclick="pbAddCustomRow()">+ Add item</button>
    ` : ''}

    <label class="stub" style="display:flex;align-items:center;gap:8px;margin:14px 0 0;padding:10px 12px;background:var(--paper);border-radius:8px;">
      <input type="checkbox" style="width:auto;" ${pbWorking.populateSOW?'checked':''} onchange="pbToggleSOW(this.checked)" ${sheet.schedule_section_id?'disabled':''}>
      ${sheet.schedule_section_id ? 'Already populated into the Schedule of Works' : 'Also create a Schedule of Works section for this sheet — one task per item, so the SOW matches the price sheet'}
    </label>

    <div class="card" style="margin-top:14px;position:sticky;bottom:70px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="sectiontitle" style="margin:0;">Total</span>
        <span style="font-size:18px;font-weight:800;">${PRICE_BUILDER_FMT(grandTotal)}</span>
      </div>
    </div>
    ${sheet.status==='issued' ? `
    <button class="darkbtn" style="margin-top:8px;" onclick="savePriceBuilderEdits('${siteId}','${sheetId}')">Save Changes</button>
    ` : `
    <div class="row-gap" style="margin-top:10px;">
      <button class="ghostbtn" style="flex:1;" onclick="pbBackToTick()">← Back to tick list</button>
      <button class="ghostbtn" style="flex:1;" onclick="savePriceBuilderDraft('${siteId}','${sheetId}')">Save Draft</button>
    </div>
    <button class="darkbtn" style="margin-top:8px;" onclick="issuePriceBuilderSheet('${siteId}','${sheetId}')">Submit for Issuing</button>
    `}
  `, {title:'Price Sheet', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:sheet.status==='issued'?`#/site/${siteId}/pricebuilder/view/${sheetId}`:`#/site/${siteId}/pricebuilder`, siteId, tabs:false});
}
window.pbGoToConfirm = function(){
  if(!Object.keys(pbWorking.items).length && !pbWorking.customRows.length){ toast('Tick at least one item first.'); return; }
  pbWorking.phase = 'confirm';
  render();
};
window.pbBackToTick = function(){
  pbWorking.phase = 'tick';
  render();
};
window.pbToggleSOW = function(checked){ pbWorking.populateSOW = checked; render(); };
window.pbToggleItem = function(itemId, checked){
  if(checked) pbWorking.items[itemId] = pbWorking.items[itemId] || {rateItemId:itemId, quantity:'', optionId:null, optionRate:null, optionLabel:null, nameOverride:null, rateOverride:null, isManualRate:false};
  else delete pbWorking.items[itemId];
  render();
};
// Removes one line from the sheet, whether it's a plain item (key === the
// rate item's own id) or one of possibly several option lines ticked off a
// multi-select dropdown item (key === "<rateItemId>::<optionId>").
window.pbRemoveEntry = function(key){
  const entry = pbWorking.items[key];
  if(pbEntryAllocated(entry)){ toast("Can't remove — this item already has bookings against it."); return; }
  delete pbWorking.items[key];
  render();
};
window.pbToggleAssignee = function(userId){
  const idx = pbWorking.assignedUserIds.indexOf(userId);
  if(idx>-1) pbWorking.assignedUserIds.splice(idx,1); else pbWorking.assignedUserIds.push(userId);
  render();
};
window.pbSetItemName = function(key, value){
  const entry = pbWorking.items[key]; if(!entry) return;
  entry.nameOverride = value.trim() || null;
  render();
};
// Qty spinners step in 0.1s (1.1, 1.2, 1.3…) but the box stays a free-text
// number field underneath — typed values are just rounded to 2dp on blur so
// measurements always store/display the same precision either way.
const pbRound2 = n => Math.round((Number(n)||0)*100)/100;
window.pbSetQuantity = function(key, value){
  const entry = pbWorking.items[key]; if(!entry) return;
  entry.quantity = value==='' ? '' : pbRound2(parseFloat(value));
  render();
};
// Dropdown items are multi-select on the tick (first) page — any number of
// options can be ticked for the same item, each becoming its own line (its
// own key, "<rateItemId>::<optionId>") with its own qty on the confirm
// page. Label/rate come straight from the template that's already showing
// them, so this never needs a round trip to look the option back up.
window.pbToggleDropdownOption = function(itemId, optionId, checked, label, rate){
  const key = itemId+'::'+optionId;
  if(checked){
    pbWorking.items[key] = {rateItemId:itemId, quantity:'', optionId, optionRate:Number(rate), optionLabel:label, nameOverride:null, rateOverride:null, isManualRate:false};
  } else {
    delete pbWorking.items[key];
  }
  render();
};
// Confirm-page select for a dropdown-derived line — lets the option itself
// still be changed here (e.g. Valleys: GRP → Lead) rather than having to go
// back to the tick page, pulling the new option's rate/formula through
// automatically. Since the key encodes the option id, changing option means
// moving the entry to a new key; any manual rate override is cleared
// because it was flagging the OLD option's rate as non-conforming, not the
// new one's.
window.pbChangeOption = function(oldKey, itemId, newOptionId){
  const entry = pbWorking.items[oldKey]; if(!entry) return;
  const opts = pbOptionsByItemCache[itemId] || [];
  const o = opts.find(o=>o.id===newOptionId); if(!o) return;
  if(o.id===entry.optionId) return; // unchanged
  const newKey = itemId+'::'+o.id;
  delete pbWorking.items[oldKey];
  pbWorking.items[newKey] = {...entry, optionId:o.id, optionRate:Number(o.rate), optionLabel:o.label, rateOverride:null, isManualRate:false};
  render();
};
// Manual rate override on the confirm page — editing the £ cell away from
// the rate-card/option value asks for confirmation and flags the line as a
// manual, non-conforming rate (shown on the row and carried through to the
// saved sheet item) rather than silently accepting it.
window.pbSetRateOverride = async function(key, value, baseRate){
  const entry = pbWorking.items[key]; if(!entry) return;
  const val = parseFloat(value);
  if(value===''||Number.isNaN(val)){ toast('Enter a valid rate.'); render(); return; }
  const base = Number(baseRate)||0;
  if(Math.abs(val-base) < 0.005){ entry.isManualRate=false; entry.rateOverride=null; render(); return; }
  const ok = await customConfirm(`This changes the rate from ${PRICE_BUILDER_FMT(base)} to ${PRICE_BUILDER_FMT(val)} — different from the rate card. It'll be flagged as a manual, non-conforming rate on this sheet. Continue?`);
  if(!ok){ render(); return; }
  entry.rateOverride = val; entry.isManualRate = true; render();
};
window.pbAddCustomRow = function(){
  pbWorking.customRows.push({localId:uid(), id:null, name:'', rate:'', quantity:'', unit:'item'});
  render();
};
window.pbRemoveCustomRow = function(idx){
  const row = pbWorking.customRows[idx];
  if(row && row.id && Number(pbAllocatedByItemId[row.id]||0)>0){ toast("Can't remove — this item already has bookings against it."); return; }
  pbWorking.customRows.splice(idx,1);
  render();
};
window.pbSetCustomField = function(idx, field, value){
  const row = pbWorking.customRows[idx]; if(!row) return;
  if(field==='name') row.name = value.trim();
  else if(field==='quantity') row.quantity = value==='' ? '' : pbRound2(parseFloat(value));
  else if(field==='unit') row.unit = value || 'item';
  else row[field] = value==='' ? '' : parseFloat(value);
  render();
};
// Shared by Save Draft, Issue and Save Changes (editing an already-issued
// sheet) — persists pbWorking to the DB. Existing line items are UPDATED in
// place, keeping their own id, rather than deleted-and-reinserted — a sheet
// item's id is what price_builder_sheet_item_weeks (weekly bookings/
// allocations) hangs off, and ON DELETE CASCADE there means delete-and-
// reinsert would silently wipe any booking already logged against it. A row
// that's no longer ticked but still has a booking against it is left in
// place rather than deleted (the UI already stops you removing it — see
// pbEntryAllocated — so this is just a safety net for anything that slips
// through). Returns the grand total plus which rows were kept/added/removed,
// so Issue/Save Changes can mirror the same changes onto the linked Schedule
// of Works.
async function pbPersist(siteId, sheetId, status){
  const priceRateItems = await dbSelect('price_rate_items', 'org_id=eq.'+ME.org_id);
  const itemsById = {}; priceRateItems.forEach(it=>itemsById[it.id]=it);

  // Existing DB rows for this sheet — fetched WITH enough fields to
  // reconstruct the same content-based key pbWorking.items uses
  // (rate_item_id, or rate_item_id::option_id for dropdown-derived items).
  // We match on this key rather than trusting entry.id alone, because
  // re-ticking an item (or any code path that rebuilds the in-memory entry
  // object from scratch) drops the previously-saved id — and matching by
  // id alone in that case would wrongly treat the still-existing DB row as
  // "removed", deleting it (and, via pbSyncScheduleTasks, its linked SOW
  // task) even though nothing was actually meant to be removed.
  const existing = await dbSelect('price_builder_sheet_items', 'sheet_id=eq.'+sheetId+'&select=id,rate_item_id,option_id');
  const existingIds = existing.map(r=>r.id);
  const existingKeyToId = {}; // content key -> db id, for rate-card-linked rows only
  existing.forEach(r=>{
    if(!r.rate_item_id) return; // custom row — no stable content key, matched by id only
    const key = r.option_id ? (r.rate_item_id+'::'+r.option_id) : r.rate_item_id;
    existingKeyToId[key] = r.id;
  });

  const rows = [];
  let total = 0; let sortOrder = 0;
  Object.keys(pbWorking.items).forEach(key=>{
    const entry = pbWorking.items[key];
    const item = itemsById[entry.rateItemId]; if(!item) return;
    const qty = Number(entry.quantity)||0;
    if(!qty) return; // ticked but no quantity yet — don't save a zero line
    if(item.is_dropdown && !entry.optionId) return; // ticked but no option chosen yet
    const lineTotal = pbLineTotal(entry, item);
    total += lineTotal;
    // Prefer the id already tracked on the entry; if missing (e.g. the row
    // was untouched but the in-memory entry was rebuilt), recover it from
    // the existing DB rows via the content key so this row is UPDATED
    // rather than mistaken for new/removed.
    const resolvedId = entry.id || existingKeyToId[key] || null;
    rows.push({
      id: resolvedId, _key: key,
      sheet_id: sheetId, rate_item_id: item.id, category: item.category, name: entry.nameOverride||item.name, unit: item.unit,
      rate: pbResolvedRate(entry, item), quantity: qty,
      option_id: entry.optionId||null, option_label: entry.optionLabel||null,
      is_manual_rate: !!entry.isManualRate,
      line_total: lineTotal, sort_order: sortOrder++,
    });
  });
  // Custom rows — no linked rate_item_id, name/rate saved directly on the row.
  // These can't be content-keyed reliably (name/rate can legitimately
  // change), so they still rely on their own tracked .id.
  pbWorking.customRows.forEach((row, rowIdx)=>{
    const qty = Number(row.quantity)||0;
    const rate = Number(row.rate)||0;
    if(!row.name || !qty || !rate) return; // incomplete custom row — don't save a blank/zero line
    const lineTotal = qty * rate;
    total += lineTotal;
    rows.push({
      id: row.id || null, _customIdx: rowIdx,
      sheet_id: sheetId, rate_item_id: null, category: 'Additional Items', name: row.name, unit: row.unit||'item',
      rate, quantity: qty, option_id: null, option_label: null, is_manual_rate: false,
      line_total: lineTotal, sort_order: sortOrder++,
    });
  });

  const keptIds = new Set(rows.filter(r=>r.id).map(r=>r.id));
  const allocated = existingIds.length ? (await dbSelect('price_builder_sheet_item_weeks', 'sheet_item_id=in.('+existingIds.join(',')+')&select=sheet_item_id,amount')) : [];
  const allocByItemId = {};
  allocated.forEach(w=>{ allocByItemId[w.sheet_item_id] = (allocByItemId[w.sheet_item_id]||0) + Number(w.amount||0); });

  const removedIds = []; let blockedRemovalCount = 0;
  for(const id of existingIds){
    if(keptIds.has(id)) continue;
    if(Number(allocByItemId[id]||0) > 0){ blockedRemovalCount++; continue; } // safety net — see comment above
    await dbDelete('price_builder_sheet_items', id);
    removedIds.push(id);
  }

  const toInsert = rows.filter(r=>!r.id).map(({id, _key, _customIdx, ...rest})=>({...rest, __key:_key, __customIdx:_customIdx}));
  const toUpdate = rows.filter(r=>r.id);
  const insertedRows = [];
  // dbInsert/dbUpdate already toast their own error on failure (e.g. a
  // dropped connection out on site), but on their own that's easy to miss
  // in the middle of ticking/issuing a sheet — and everything below this
  // point (saving the sheet's total, marking it "issued") used to go ahead
  // regardless, so a failed item save could leave a sheet that LOOKS issued
  // successfully but has no line items behind its total. `itemSaveFailed`
  // tracks that so the caller can stop and tell the user plainly, instead
  // of quietly finishing with a total and nothing underneath it.
  let itemSaveFailed = false;
  if(toInsert.length){
    const toInsertClean = toInsert.map(({__key, __customIdx, ...rest})=>rest);
    const insertResult = await dbInsert('price_builder_sheet_items', toInsertClean);
    if(!insertResult) itemSaveFailed = true;
    const inserted = insertResult || [];
    // Match inserted rows back to their source (by sort_order, which is
    // unique per save) so we can back-fill the new DB id onto pbWorking.
    inserted.forEach(savedRow=>{
      const src = toInsert.find(r=>r.sort_order===savedRow.sort_order);
      if(src && src.__key && pbWorking.items[src.__key]) pbWorking.items[src.__key].id = savedRow.id;
      if(src && src.__customIdx!=null && pbWorking.customRows[src.__customIdx]) pbWorking.customRows[src.__customIdx].id = savedRow.id;
      insertedRows.push(savedRow);
    });
  }
  const updatedRows = [];
  for(const row of toUpdate){
    const {id, _key, _customIdx, ...patchRow} = row;
    const saved = await dbUpdate('price_builder_sheet_items', id, patchRow);
    if(!saved) itemSaveFailed = true;
    // Back-fill in case the id was recovered via content-key matching above
    // (entry.id was missing but we found the existing row) — so the
    // in-memory entry carries the correct id for any subsequent save in
    // this same edit session.
    if(_key && pbWorking.items[_key]) pbWorking.items[_key].id = id;
    if(_customIdx!=null && pbWorking.customRows[_customIdx]) pbWorking.customRows[_customIdx].id = id;
    updatedRows.push(saved || row);
  }
  if(itemSaveFailed){
    // Stop here — don't save the sheet's total or flip its status. The
    // per-request toast from dbInsert/dbUpdate already told the user why;
    // this just makes sure the sheet itself doesn't end up in the
    // "has a total, has no items" state that started this whole guard.
    return {total, rows: [...updatedRows, ...insertedRows], addedRows: insertedRows, removedIds, blockedRemovalCount, failed: true};
  }

  await loadAllProfiles();
  const subcontractor_name = pbWorking.assignedUserIds.map(id=>PROFILES[id]&&PROFILES[id].name).filter(Boolean).join(', ') || null;
  const sheetRows = await dbSelect('price_builder_sheets', 'id=eq.'+sheetId);
  const existingSheet = sheetRows[0];
  const patch = {title: pbWorking.title, subcontractor_name, assigned_user_ids: pbWorking.assignedUserIds, total, updated_at: new Date().toISOString()};
  if(status){
    patch.status = status;
    // Keep the original issue stamp on a re-save of an already-issued sheet.
    if(!existingSheet || !existingSheet.issued_at){ patch.issued_by = ME.id; patch.issued_at = new Date().toISOString(); }
  }
  await dbUpdate('price_builder_sheets', sheetId, patch);
  return {total, rows: [...updatedRows, ...insertedRows], addedRows: insertedRows, removedIds, blockedRemovalCount};
}
window.savePriceBuilderDraft = async function(siteId, sheetId){
  const {blockedRemovalCount, failed} = await pbPersist(siteId, sheetId, null);
  if(failed){ toast('Draft NOT saved — some items failed to save. Check your signal and try again.'); render(); return; }
  toast(blockedRemovalCount ? `Draft saved — ${blockedRemovalCount} item(s) kept because they already have bookings against them.` : 'Draft saved');
  render();
};
window.issuePriceBuilderSheet = async function(siteId, sheetId){
  const itemKeys = Object.keys(pbWorking.items);
  if(!itemKeys.length && !pbWorking.customRows.length){ toast('Tick at least one item, or add a custom row, before issuing.'); return; }
  // A tick with no quantity typed in is treated as "not actually wanted" —
  // pbPersist already silently drops these when saving a draft, but issuing
  // used to hard-block on the very same thing (confusing when it's really
  // just a stray tick left over from earlier, e.g. ticking a dropdown option
  // by mistake while browsing). So issuing only needs to confirm there's at
  // least ONE line that will actually make it onto the sheet — anything
  // still qty-less at this point just quietly doesn't get saved, exactly
  // like a draft save would treat it.
  const hasQtyOnAnyTicked = itemKeys.some(key=>Number(pbWorking.items[key].quantity)>0);
  const hasValidCustomRow = pbWorking.customRows.some(row=>row.name && Number(row.quantity) && Number(row.rate));
  if(!hasQtyOnAnyTicked && !hasValidCustomRow){ toast('Enter a quantity for at least one ticked item (or add a custom row) before issuing.'); return; }
  const sheetRows = await dbSelect('price_builder_sheets', 'id=eq.'+sheetId);
  const sheet = sheetRows[0];
  if(!sheet){ toast('Sheet not found.'); return; }

  // Issuing creates the sub tile this sheet feeds in the Price tile — confirm
  // (or rename) that tile's name before going ahead, since it doesn't have
  // to match the sheet's own title (e.g. sheet "Flat Roof Q3 Update" but a
  // tile you'd rather just call "Flat Roofing"). Only asked the first time —
  // re-confirming an already-issued sheet's existing tile isn't possible
  // anyway since issuing is one-way.
  let subTileName = sheet.pricing_element_id ? null : pbWorking.title;
  if(!sheet.pricing_element_id){
    const typed = await customPrompt('Name this sub tile in the Price tile', pbWorking.title);
    if(typed===null) return;
    subTileName = typed.trim() || pbWorking.title;
  }

  if(!await customConfirm('Issue this sheet? It becomes read-only and visible to everyone assigned to this site — you can\'t un-issue it.')) return;

  const issuePersist = await pbPersist(siteId, sheetId, 'issued');
  const {total, rows, failed} = issuePersist;
  if(failed){ toast('Sheet NOT issued — some items failed to save. Check your signal and try again.'); render(); return; }

  // Create (or update) the single Pricing Element this sheet feeds — the
  // existing Price tile's own assignment/build-up UI takes it from here.
  let pricingElementId = sheet.pricing_element_id;
  if(!pricingElementId){
    const existingEls = await dbSelect('pricing_elements', 'site_id=eq.'+siteId+'&select=sort_order&order=sort_order.desc&limit=1');
    const nextOrder = existingEls.length ? Number(existingEls[0].sort_order||0)+1 : 0;
    const newEls = await dbInsert('pricing_elements', {site_id:siteId, name: subTileName, sort_order: nextOrder, price_total: total, created_by: ME.id});
    if(newEls && newEls[0]) pricingElementId = newEls[0].id;
  } else {
    await dbUpdate('pricing_elements', pricingElementId, {price_total: total});
  }

  // Whoever was ticked "Assign to" on this sheet gets access to the
  // Pricing Element it just fed, straight away — no separate trip into the
  // Price tile's own "Select Operatives" picker needed for these people.
  if(pricingElementId) await grantElementAccessBulk(pricingElementId, siteId, pbWorking.assignedUserIds);

  // Optionally mirror this sheet into the Schedule of Works — one section
  // named after the sheet, one task per item, in the same order.
  let scheduleSectionId = sheet.schedule_section_id;
  if(pbWorking.populateSOW && !scheduleSectionId){
    const secPos = await nextSectionPosition(siteId);
    const secRows = await dbInsert('schedule_sections', {site_id:siteId, name: pbWorking.title, position: secPos, created_by: ME.id});
    const newSection = secRows && secRows[0];
    if(newSection){
      scheduleSectionId = newSection.id;
      let taskPos = await nextTaskPosition(siteId);
      const taskRows = rows.map(r=>({site_id:siteId, section_id:newSection.id, sheet_item_id:r.id, name:r.name, status:'todo', position: taskPos++}));
      if(taskRows.length) await dbInsert('schedule_tasks', taskRows);
    }
  } else if(scheduleSectionId){
    // Re-issuing a sheet that already has its Schedule of Works section
    // (un-issued, items added, issued again): keep that section in step —
    // renames/removals via pbSyncScheduleTasks, then a task for every item
    // that still has none (items added while it was back in draft never
    // got one before).
    await pbSyncScheduleTasks(siteId, sheet, issuePersist);
    const linked = await dbSelect('schedule_tasks', 'section_id=eq.'+scheduleSectionId+'&sheet_item_id=not.is.null&select=sheet_item_id');
    const haveTask = new Set(linked.map(t=>t.sheet_item_id));
    const missing = rows.filter(r=>r && r.id && !haveTask.has(r.id));
    if(missing.length){
      let taskPos = await nextTaskPosition(siteId);
      await dbInsert('schedule_tasks', missing.map(r=>({site_id:siteId, section_id:scheduleSectionId, sheet_item_id:r.id, name:r.name, status:'todo', position: taskPos++})));
    }
  }

  const linkPatch = {};
  if(pricingElementId && pricingElementId!==sheet.pricing_element_id) linkPatch.pricing_element_id = pricingElementId;
  if(scheduleSectionId && scheduleSectionId!==sheet.schedule_section_id) linkPatch.schedule_section_id = scheduleSectionId;
  if(Object.keys(linkPatch).length) await dbUpdate('price_builder_sheets', sheetId, linkPatch);

  toast('Sheet issued');
  // #notif-review-2026-09: previously nobody was told a sheet had been
  // issued to them — push to each assigned operative, plus an email via
  // notify-price-sheet-issued (best-effort, never blocks the issue itself).
  if(pbWorking.assignedUserIds.length){
    for(const uid2 of pbWorking.assignedUserIds){
      postSystemMessageToUser(uid2, siteId, 'price_sheet_issued', `A price sheet ("${pbWorking.title}") has been issued to you on ${SITES.find(s=>s.id===siteId)?.name||'this site'}`, sheetId);
    }
    sbFetch('/functions/v1/notify-price-sheet-issued', {method:'POST', body: JSON.stringify({site_id:siteId, sheet_id:sheetId, sheet_title:pbWorking.title, user_ids:pbWorking.assignedUserIds})}).catch(()=>{});
  }
  pbWorking = {sheetId:null, title:'', assignedUserIds:[], phase:'tick', populateSOW:true, items:{}, customRows:[]};
  go(`#/site/${siteId}/pricebuilder/view/${sheetId}`);
};
// Un-issue — PM/admin only. Issuing is normally one-way (the app says so at
// the confirm prompt), but that assumes the sheet's line items actually made
// it into the database when it was issued. When they didn't (a dropped
// connection mid-issue used to leave a sheet marked "issued" with a total
// but no items behind it — see the itemSaveFailed guard in pbPersist), the
// only way back to a fixable state is un-issuing it. Just flips status back
// to draft — the linked Pricing Element and Schedule of Works section (if
// any) are left exactly as they are, so re-issuing later reuses them rather
// than creating duplicates, same as any other re-save of an already-linked
// sheet.
window.unissuePriceBuilderSheet = async function(siteId, sheetId){
  if(!canUsePriceBuilder()){ toast('Only PMs and admins can un-issue a sheet.'); return; }
  if(!await customConfirm('Un-issue this sheet? It goes back to draft and stops being visible to whoever it was issued to, until it\'s issued again.', {confirmLabel:'Un-issue', cancelLabel:'Cancel'})) return;
  const row = await dbUpdate('price_builder_sheets', sheetId, {status:'draft'});
  if(row){ toast('Sheet un-issued — back to draft'); go(`#/site/${siteId}/pricebuilder/edit/${sheetId}`); }
};
// Mirrors a Price Sheet edit onto the Schedule of Works section it already
// fed (only relevant once a sheet has been issued with "populate SOW"
// ticked) — renames a linked task when its item's wording changed, adds a
// task for any newly-added item, and removes the task for a removed item
// (unless that task's already done/in progress, in which case it's just
// unlinked so the completed record stays on the schedule rather than
// vanishing).
async function pbSyncScheduleTasks(siteId, sheet, persistResult){
  if(!sheet.schedule_section_id) return;
  const tasks = await dbSelect('schedule_tasks', 'section_id=eq.'+sheet.schedule_section_id+'&sheet_item_id=not.is.null');
  const taskByItemId = {}; tasks.forEach(t=>{ taskByItemId[t.sheet_item_id] = t; });

  // Kept items whose wording changed — update the linked task's name to match.
  for(const row of persistResult.rows){
    const task = taskByItemId[row.id];
    if(task && task.name !== row.name) await dbUpdate('schedule_tasks', task.id, {name: row.name});
  }
  // Newly added items — one new task each, appended to the same section.
  if(persistResult.addedRows.length){
    let taskPos = await nextTaskPosition(siteId);
    const taskRows = persistResult.addedRows.map(r=>({site_id:siteId, section_id:sheet.schedule_section_id, sheet_item_id:r.id, name:r.name, status:'todo', position: taskPos++}));
    await dbInsert('schedule_tasks', taskRows);
  }
  // Removed items — delete the linked task if it hasn't been started or
  // finished yet, otherwise just unlink it so the completed task stays put
  // as a record of the work actually done.
  for(const itemId of persistResult.removedIds){
    const task = taskByItemId[itemId];
    if(!task) continue;
    if(task.status==='done' || task.completed_at) await dbUpdate('schedule_tasks', task.id, {sheet_item_id:null});
    else await dbDelete('schedule_tasks', task.id);
  }
}
// Editing an already-issued sheet — unlike the one-way "Submit for Issuing"
// action, this can be used any number of times. Persists the same way a
// fresh issue does (so a row's own id, and any bookings hanging off it,
// survive — see pbPersist), then keeps the Pricing Element's price total and
// the mirrored Schedule of Works section in sync with whatever changed.
window.savePriceBuilderEdits = async function(siteId, sheetId){
  const itemKeys = Object.keys(pbWorking.items);
  const hasQtyOnAnyTicked = itemKeys.some(key=>Number(pbWorking.items[key].quantity)>0);
  const hasValidCustomRow = pbWorking.customRows.some(row=>row.name && Number(row.quantity) && Number(row.rate));
  if(!hasQtyOnAnyTicked && !hasValidCustomRow){ toast('Enter a quantity for at least one ticked item (or add a custom row).'); return; }
  if(!await customConfirm('Save changes to this issued sheet? Anything already booked in against a line stays untouched.')) return;

  const sheetRows = await dbSelect('price_builder_sheets', 'id=eq.'+sheetId);
  const sheet = sheetRows[0];
  if(!sheet){ toast('Sheet not found.'); return; }

  const persistResult = await pbPersist(siteId, sheetId, 'issued');
  // Same guard the draft and issue paths already had: if any line failed to
  // save, stop here — don't update the total, don't say "Sheet updated", and
  // keep the edits on screen so nothing typed is lost.
  if(persistResult.failed){ toast('Sheet NOT updated — some items failed to save. Check your signal and try again.'); render(); return; }

  if(sheet.pricing_element_id){
    await dbUpdate('pricing_elements', sheet.pricing_element_id, {price_total: persistResult.total});
    await grantElementAccessBulk(sheet.pricing_element_id, siteId, pbWorking.assignedUserIds);
  }

  await pbSyncScheduleTasks(siteId, sheet, persistResult);

  toast(persistResult.blockedRemovalCount ? `Sheet updated — ${persistResult.blockedRemovalCount} item(s) kept because they already have bookings against them.` : 'Sheet updated');
  pbWorking = {sheetId:null, title:'', assignedUserIds:[], phase:'tick', populateSOW:true, items:{}, customRows:[]};
  go(`#/site/${siteId}/pricebuilder/view/${sheetId}`);
};
async function renderPriceBuilderView(siteId, sheetId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const sheetRows = await dbSelect('price_builder_sheets', 'id=eq.'+sheetId);
  const sheet = sheetRows[0];
  if(!sheet){ toast('Sheet not found, or not issued yet.'); go(`#/site/${siteId}/price`); return; }
  const items = await dbSelect('price_builder_sheet_items', 'sheet_id=eq.'+sheetId+'&order=sort_order.asc');
  const categories = [];
  items.forEach(it=>{
    let cat = categories.find(c=>c.name===it.category);
    if(!cat){ cat = {name:it.category, items:[]}; categories.push(cat); }
    cat.items.push(it);
  });
  sortPriceRateCategories(categories);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="card" style="margin-bottom:14px;">
      <input type="text" class="sectiontitle" value="${escapeHtml(sheet.title)}" style="margin:0 0 6px;width:100%;box-sizing:border-box;border:none;background:transparent;padding:0;font-family:inherit;" oninput="const p=this.selectionStart; this.value=titleCaseWords(this.value); this.setSelectionRange(p,p);" onblur="pbRenameSheet('${sheetId}', this.value)">
      ${sheet.subcontractor_name ? `<p class="stub" style="margin:0 0 6px;">For: ${escapeHtml(sheet.subcontractor_name)}</p>` : ''}
      <p class="stub" style="margin:0;">Issued ${new Date(sheet.issued_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})} by ${escapeHtml(nameOf(sheet.issued_by))}</p>
    </div>
    ${categories.map(cat=>`
      <p class="sectiontitle" style="margin:14px 0 6px;">${escapeHtml(cat.name)}</p>
      <div class="drawheaderrow" style="grid-template-columns:1fr 70px 48px 40px 62px;display:grid;gap:6px;padding:0 10px;margin:0 0 4px;">
        <span>Item</span><span style="text-align:right;">Rate</span><span style="text-align:center;">Qty</span><span style="text-align:center;">Unit</span><span style="text-align:right;">Total</span>
      </div>
      ${cat.items.map(it=>`
        <div class="sitecard" style="display:grid;grid-template-columns:1fr 70px 48px 40px 62px;gap:6px;align-items:center;padding:8px 10px;">
          <div style="min-width:0;">
            <div class="name" style="font-size:0.9em;">${escapeHtml(it.option_label ? it.name+' - '+it.option_label : it.name)}</div>
            ${it.is_manual_rate?`<div class="sub" style="margin-top:2px;color:var(--warn);font-weight:700;">⚠ Manual</div>`:''}
          </div>
          <span class="stub" style="margin:0;font-weight:700;text-align:right;">${PRICE_BUILDER_FMT(it.rate)}</span>
          <span class="stub" style="margin:0;text-align:center;">${it.quantity}</span>
          <span class="stub" style="margin:0;text-align:center;">${PRICE_UNIT_LABEL[it.unit]||it.unit}</span>
          <span class="stub" style="margin:0;font-weight:700;text-align:right;">${PRICE_BUILDER_FMT(it.line_total)}</span>
        </div>
      `).join('')}
    `).join('') || `<div class="empty">No items on this sheet.</div>`}
    <div class="card" style="margin-top:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="sectiontitle" style="margin:0;">Total</span>
        <span style="font-size:18px;font-weight:800;">${PRICE_BUILDER_FMT(sheet.total)}</span>
      </div>
    </div>
    <div class="row-gap" style="margin-top:10px;align-items:stretch;">
      <button class="darkbtn" style="flex:1;" onclick="exportPriceBuilderSheetPdf('${siteId}','${sheetId}')">📄 View PDF</button>
      ${rowActionsMenuHtml('pbsheetview'+sheetId, `
        <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;exportPriceBuilderSheet('${sheetId}')">⬇ Export to Excel</div>
        <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;emailPriceBuilderSheetPdf('${siteId}','${sheetId}')">✉️ Email</div>
        ${canUsePriceBuilder() ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;go('#/site/${siteId}/pricebuilder/edit/${sheetId}')">✏️ Edit</div>` : ''}
        ${canUsePriceBuilder() ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;unissuePriceBuilderSheet('${siteId}','${sheetId}')">↩️ Un-issue</div>` : ''}
        ${canUsePriceBuilder() ? `<div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deletePriceBuilderSheet('${siteId}','${sheetId}')">🗑 Delete</div>` : ''}
      `)}
    </div>
  `, {title:'Price Sheet', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/pricebuilder`, siteId, tabs:false}); }
}
// Live Total/Taken/Balance for a Price Sheet — once issued, a sheet
// feeds exactly one Pricing Element (sheet.pricing_element_id), so "Taken"
// and "Balance" here are always read straight off that element's own
// Booked-In figure (auto-summed from price_weeks, or its manual override)
// rather than a value frozen at export time — matches the "Subcontractor
// SOW" style sheet's Total/Taken/Balance block, kept live.
async function pbSheetLiveFigures(sheet){
  const total = Number(sheet.total)||0;
  if(!sheet.pricing_element_id) return {total, taken:0, balance:total};
  const elRows = await dbSelect('pricing_elements', 'id=eq.'+sheet.pricing_element_id);
  const el = elRows[0];
  if(!el) return {total, taken:0, balance:total};
  const weeks = await dbSelect('price_weeks', 'element_id=eq.'+el.id+'&select=amount');
  const autoBookedIn = weeks.reduce((s,w)=>s+Number(w.amount||0),0);
  const hasOverride = el.price_booked_override!==null && el.price_booked_override!==undefined;
  const taken = hasOverride ? Number(el.price_booked_override) : autoBookedIn;
  const elTotal = Number(el.price_total!=null?el.price_total:total);
  return {total: elTotal, taken, balance: elTotal-taken};
}
// Turns one price sheet (issued or still-draft) into a clean single-tab
// Excel — the actual document you hand to a subcontractor/operative,
// grouped by element of works the same way the app shows it, with a live
// Total / Taken / Balance block at the bottom (Taken/Balance pulled fresh
// from the linked Pricing Element, same as the PDF export). Works from
// what's already saved on the sheet, so Save Draft first if you want an
// export to include your latest edits.
window.exportPriceBuilderSheet = async function(sheetId){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  const sheetRows = await dbSelect('price_builder_sheets', 'id=eq.'+sheetId);
  const sheet = sheetRows[0];
  if(!sheet){ toast('Sheet not found.'); return; }
  const site = sheet.site_id ? SITES.find(s=>s.id===sheet.site_id) : null;
  // "Project Name - Price Sheet name - Price List" — requested so the
  // downloaded file is identifiable on its own once it's out of the app
  // (in an email thread, a Downloads folder, sent on to a subcontractor),
  // rather than just the sheet title which can be ambiguous across sites.
  const exportFileName = [site && site.name, sheet.title||'Price Sheet', 'Price List']
    .filter(Boolean).join(' - ').replace(/[\\/?*\[\]:]/g,'').slice(0,150);
  await loadAllProfiles();
  const items = await dbSelect('price_builder_sheet_items', 'sheet_id=eq.'+sheetId+'&order=sort_order.asc');
  const categories = [];
  items.forEach(it=>{ let c=categories.find(c=>c.name===it.category); if(!c){c={name:it.category, items:[]};categories.push(c);} c.items.push(it); });
  sortPriceRateCategories(categories);
  const {total, taken, balance} = await pbSheetLiveFigures(sheet);
  // Live week-by-week booked-in breakdown — same weeks that drive the
  // Pricing Element's own Taken figure, so the export shows exactly how
  // "Taken" was arrived at rather than just the final number.
  const weekRows = sheet.pricing_element_id ? await dbSelect('price_weeks', 'element_id=eq.'+sheet.pricing_element_id+'&order=week_number.asc&select=week_number,amount') : [];
  // Labour wages entered against this element, per week — same ledger the
  // "Labour wages this week" section on the Price tile writes to.
  const wageEntryRows = sheet.pricing_element_id ? await dbSelect('price_week_operative_entries', 'element_id=eq.'+sheet.pricing_element_id+'&select=week_number,amount') : [];
  const wagesByWeek = {};
  wageEntryRows.forEach(w=>{ wagesByWeek[w.week_number] = (wagesByWeek[w.week_number]||0) + Number(w.amount||0); });
  const wageWeeks = Object.keys(wagesByWeek).map(Number).sort((a,b)=>a-b);

  const rows = [];
  rows.push([sheet.title || 'Price Sheet']);
  if(site){
    rows.push(['Site:', pdfSiteLabel(site)]);
    rows.push(['Job No:', site.job_number || '']);
    rows.push(['Address:', fullSiteAddress(site) || '']);
    rows.push(['PM:', site.responsible_pm_id ? nameOf(site.responsible_pm_id) : '']);
  }
  if(sheet.subcontractor_name) rows.push(['For:', sheet.subcontractor_name]);
  rows.push([sheet.status==='issued' ? 'Issued:' : 'Status:', sheet.status==='issued' ? new Date(sheet.issued_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}) : 'Draft']);
  rows.push([]);
  rows.push(['Item', 'Qty', 'Unit', 'Rate (£)', 'Line Total (£)', 'Notes']);
  const headerRowIdx = rows.length - 1;
  categories.forEach(cat=>{
    rows.push([cat.name]);
    cat.items.forEach(it=>{
      const itemText = it.option_label ? `${it.name} - ${it.option_label}` : it.name;
      rows.push([itemText, Number(it.quantity), PRICE_UNIT_LABEL[it.unit]||it.unit, Number(it.rate), Number(it.line_total), it.is_manual_rate?'Manual — non-conforming':'']);
    });
  });
  rows.push([]);
  rows.push(['', '', '', 'Total', total]);
  rows.push(['', '', '', 'Taken', taken]);
  rows.push(['', '', '', 'Balance', balance]);
  const totalRowIdx = rows.length - 3;
  const grandRowIdx = rows.length - 1;

  let weekDataStartIdx = -1, weekDataEndIdx = -1;
  if(weekRows.length){
    rows.push([]);
    rows.push(['Weekly Booked In']);
    rows.push(['Week', 'Amount (£)', 'Running Total (£)']);
    let running = 0;
    weekDataStartIdx = rows.length;
    weekRows.forEach(w=>{ running += Number(w.amount||0); rows.push(['Week '+w.week_number, Number(w.amount||0), running]); });
    weekDataEndIdx = rows.length - 1;
  }

  let wageDataStartIdx = -1, wageDataEndIdx = -1;
  if(wageWeeks.length){
    rows.push([]);
    rows.push(['Labour Wages']);
    rows.push(['Week', 'Total Wages (£)']);
    wageDataStartIdx = rows.length;
    wageWeeks.forEach(wk=>{ rows.push(['Week '+wk, Math.round(wagesByWeek[wk]*100)/100]); });
    wageDataEndIdx = rows.length - 1;
  }

  // ExcelJS builds the file when it's loaded (it's the only one of the two
  // libraries that can embed an image), so the export carries the company
  // logo top-right same as the PDF export does. If ExcelJS failed to load
  // for any reason, fall back to the plain SheetJS/XLSX file below — same
  // data, just without the logo — rather than blocking the export entirely.
  if((await loadLib('ExcelJS'))){
    try{
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Price Sheet');
      ws.columns = [{width:42},{width:8},{width:14},{width:12},{width:14},{width:22}];
      rows.forEach(r=>ws.addRow(r));
      const gbp = '"£"#,##0.00';
      for(let r=totalRowIdx; r<=grandRowIdx; r++) ws.getCell('E'+(r+1)).numFmt = gbp;
      for(let r=headerRowIdx+1; r<totalRowIdx; r++){ ws.getCell('D'+(r+1)).numFmt = gbp; ws.getCell('E'+(r+1)).numFmt = gbp; }
      for(let r=weekDataStartIdx; r<=weekDataEndIdx; r++){ ws.getCell('B'+(r+1)).numFmt = gbp; ws.getCell('C'+(r+1)).numFmt = gbp; }
      for(let r=wageDataStartIdx; r<=wageDataEndIdx; r++) ws.getCell('B'+(r+1)).numFmt = gbp;
      ws.getRow(1).font = {bold:true, size:14};
      ws.getRow(headerRowIdx+1).font = {bold:true};

      const logoUrl = ORG && ORG.logo_path ? publicUrl('org-logos', ORG.logo_path) : null;
      if(logoUrl){
        try{
          const res = await fetch(logoUrl);
          if(res.ok){
            const buf = await res.arrayBuffer();
            const ctype = (res.headers.get('content-type')||'').toLowerCase();
            const ext = ctype.includes('png') ? 'png' : (ctype.includes('gif') ? 'gif' : 'jpeg');
            const imageId = wb.addImage({buffer: buf, extension: ext});
            // Anchored top-right, above the title/item table — column F is
            // the sheet's last column (index 5, 0-based) so the logo sits
            // clear of the Item/Qty/Rate columns.
            ws.addImage(imageId, {tl:{col:5.1, row:0.1}, ext:{width:90, height:90}});
          }
        }catch(e){ /* logo is a nice-to-have — export still proceeds without it */ }
      }

      const buffer = await wb.xlsx.writeBuffer();
      // deliverExcelBuffer handles the native app too — a plain <a download>
      // does nothing inside the Android/iOS WebView.
      await deliverExcelBuffer(buffer, exportFileName+'.xlsx');
      return;
    }catch(e){ /* fall through to the plain SheetJS export below */ }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:42},{wch:8},{wch:14},{wch:12},{wch:14},{wch:22}];
  for(let r=totalRowIdx; r<=grandRowIdx; r++){ const addr = 'E'+(r+1); if(ws[addr]) ws[addr].z = '"£"#,##0.00'; }
  for(let r=headerRowIdx+1; r<totalRowIdx; r++){
    const rateCell = ws['D'+(r+1)], totalCell = ws['E'+(r+1)];
    if(rateCell && typeof rateCell.v==='number') rateCell.z = '"£"#,##0.00';
    if(totalCell && typeof totalCell.v==='number') totalCell.z = '"£"#,##0.00';
  }
  for(let r=weekDataStartIdx; r<=weekDataEndIdx; r++){
    const amtCell = ws['B'+(r+1)], runCell = ws['C'+(r+1)];
    if(amtCell) amtCell.z = '"£"#,##0.00';
    if(runCell) runCell.z = '"£"#,##0.00';
  }
  for(let r=wageDataStartIdx; r<=wageDataEndIdx; r++){
    const addr = 'B'+(r+1); if(ws[addr]) ws[addr].z = '"£"#,##0.00';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Price Sheet');
  await deliverExcelFile(wb, exportFileName+'.xlsx');
};
// The "Subcontractor SOW" style PDF — same layout as the reference sheet
// (site name, itemised list with no column header row, Total / Taken /
// Balance block bottom-right) but built with the app's own PDF header/brand
// conventions (org logo + brand colour bar, same fonts/spacing every other
// export in OpHUB uses) instead of a plain black-and-white look. Taken and
// Balance are always the live figures off the linked Pricing Element.
// Shared PDF-building logic for a Price Sheet — factored out so both the
// "View PDF" download flow (exportPriceBuilderSheetPdf) and the "Email"
// flow (emailPriceBuilderSheetPdf, added alongside the row-actions dropdown
// on renderPriceBuilderView) build from exactly the same bytes rather than
// duplicating this whole function. Returns null (after its own toast) on
// any failure instead of throwing, so both callers can just check for that.
async function buildPriceBuilderSheetPdfBytes(siteId, sheetId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const sheetRows = await dbSelect('price_builder_sheets', 'id=eq.'+sheetId);
  const sheet = sheetRows[0];
  if(!sheet){ toast('Sheet not found.'); return null; }
  const site = SITES.find(s=>s.id===siteId);
  await loadAllProfiles();
  const items = await dbSelect('price_builder_sheet_items', 'sheet_id=eq.'+sheetId+'&order=sort_order.asc');
  const {total, taken, balance} = await pbSheetLiveFigures(sheet);
  const weekRows = sheet.pricing_element_id ? await dbSelect('price_weeks', 'element_id=eq.'+sheet.pricing_element_id+'&order=week_number.asc&select=week_number,amount') : [];

  const pdfDoc = await PDFLib.PDFDocument.create();
  const fonts = await havsPdfFonts(pdfDoc);
  const {bold, reg, italic, INK, SLATE, LINE, BRAND, WHITE} = fonts;
  const logoImg = await havsFetchLogoImg(pdfDoc);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 44, CONTENT_W = PAGE_W-2*MARGIN;
  const cols = [
    {key:'name', label:'Item', x:0, w:0.46, align:'left'},
    {key:'quantity', label:'Qty', x:0.46, w:0.12, align:'right'},
    {key:'unit', label:'Unit', x:0.58, w:0.12, align:'left'},
    {key:'rate', label:'Rate £', x:0.70, w:0.14, align:'right'},
    {key:'line_total', label:'Total £', x:0.84, w:0.16, align:'right'},
  ];
  // #(price-pdf-column-gutter): columns sit edge-to-edge with zero gap, so a
  // right-aligned value (Qty) butts straight up against the very next
  // left-aligned column's text (Unit) with nothing between them — "120m",
  // "14No." — reading as one misaligned run instead of two columns. A small
  // fixed inset on the inner edge of every right/left-aligned cell (not
  // center, which is already visually centred in its own column) keeps that
  // gap without changing the column boundaries the headers line up to.
  const CELL_PAD = 5;
  function drawCell(page, text, col, y, opts){
    const cw = col.w*CONTENT_W;
    const font = (opts&&opts.font) || reg;
    const size = (opts&&opts.size) || 9.5;
    const color = (opts&&opts.color) || INK;
    const w = font.widthOfTextAtSize(text, size);
    let x = MARGIN + col.x*CONTENT_W;
    if(col.align==='right') x += cw - w - CELL_PAD;
    else if(col.align==='center') x += (cw-w)/2;
    // The Item column sits at the page's own left margin (col.x===0), not
    // against another column's edge, and its body text is drawn separately
    // (outside drawCell, to support wrapping) with no pad — so padding only
    // the header here would knock "Item" out of line with the rows under it.
    else if(col.x>0) x += CELL_PAD;
    page.drawText(text, {x, y, size, font, color});
  }
  const jobBits = [];
  if(site && site.job_number) jobBits.push('Job No: '+site.job_number);
  if(site && site.responsible_pm_id) jobBits.push('PM: '+nameOf(site.responsible_pm_id));
  const jobLine = jobBits.join('   ·   ');
  let page, y;
  function drawHeader(){
    const headerH = jobLine ? 100 : 84;
    page.drawRectangle({x:0, y:PAGE_H-headerH, width:PAGE_W, height:headerH, color:BRAND});
    if(logoImg){
      // Logo box is 1.3x its previous size (38 -> ~49) and vertically
      // centred in the header band, rather than pinned high near the top —
      // it used to read as sitting too high and too small against the
      // title text below it.
      const LOGO_BOX = 38*1.3;
      const dim = logoImg.scale(1); const s = LOGO_BOX/Math.max(dim.width, dim.height);
      const w = dim.width*s, h = dim.height*s;
      const logoX = PAGE_W-MARGIN-LOGO_BOX;
      const logoY = PAGE_H - headerH/2 - LOGO_BOX/2;
      page.drawRectangle({x:logoX, y:logoY, width:LOGO_BOX, height:LOGO_BOX, color:WHITE});
      page.drawImage(logoImg, {x:logoX+(LOGO_BOX-w)/2, y:logoY+(LOGO_BOX-h)/2, width:w, height:h});
    }
    const textX = MARGIN;
    page.drawText('SUBCONTRACTOR SOW', {x:textX, y:PAGE_H-36, size:9, font:bold, color:WHITE, opacity:0.85});
    page.drawText(sheet.title||'Price Sheet', {x:textX, y:PAGE_H-58, size:16, font:bold, color:WHITE});
    // Site NAME as well as its address — this used to be address-only, which
    // reads fine for a site whose name already looks like an address, but is
    // ambiguous wherever the two differ (multi-site jobs, a site named after
    // the client rather than the postal address, etc).
    const addrLine = site ? pdfSiteLabel(site) : null;
    if(addrLine){
      page.drawText(addrLine, {x:textX, y:PAGE_H-73, size:9, font:italic, color:WHITE, opacity:0.85});
    }
    if(jobLine){
      // Job number itself is bolded so it stands out against the PM name
      // alongside it, rather than the whole line reading with equal weight.
      let cx = textX;
      const drawPart = (text, f)=>{ page.drawText(text, {x:cx, y:PAGE_H-88, size:8.5, font:f, color:WHITE, opacity:0.85}); cx += f.widthOfTextAtSize(text, 8.5); };
      if(site && site.job_number){
        drawPart('Job No: ', reg);
        drawPart(site.job_number, bold);
        if(site.responsible_pm_id) drawPart('   ·   PM: '+nameOf(site.responsible_pm_id), reg);
      } else if(site && site.responsible_pm_id){
        drawPart('PM: '+nameOf(site.responsible_pm_id), reg);
      }
    }
  }
  function drawFooter(){
    page.drawLine({start:{x:MARGIN,y:26}, end:{x:PAGE_W-MARGIN,y:26}, thickness:0.75, color:PDFLib.rgb(0.85,0.84,0.80)});
    page.drawText('Generated via OpHUB'+(sheet.subcontractor_name?' · For: '+sheet.subcontractor_name:''), {x:MARGIN, y:14, size:8, font:reg, color:SLATE});
  }
  function newPage(){ page = pdfDoc.addPage([PAGE_W,PAGE_H]); drawHeader(); drawFooter(); y = PAGE_H-(jobLine?128:112); }
  function drawColumnHeaders(){
    cols.forEach(col=>drawCell(page, col.label, col, y, {font:bold, size:9, color:SLATE}));
    y -= 8;
    page.drawLine({start:{x:MARGIN,y}, end:{x:PAGE_W-MARGIN,y}, thickness:0.75, color:INK});
    y -= 18;
  }
  function ensureSpace(h){ if(y-h<80){ newPage(); drawColumnHeaders(); } }
  function ensureSpacePlain(h){ if(y-h<80) newPage(); }
  // Word-wrap plain paragraph text to the page's content width, for the
  // Terms & Conditions page — long clauses need to break across lines (and
  // pages) rather than run off the edge.
  function wrapText(text, font, size, maxWidth){
    const words = text.split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    words.forEach(w=>{
      const test = cur ? cur+' '+w : w;
      if(cur && font.widthOfTextAtSize(test, size) > maxWidth){ lines.push(cur); cur = w; }
      else cur = test;
    });
    if(cur) lines.push(cur);
    return lines;
  }
  const terms = ORG && ORG.price_builder_terms && ORG.price_builder_terms.trim();
  newPage();
  drawColumnHeaders();
  const nameColW = cols[0].w*CONTENT_W - 4;
  items.forEach(it=>{
    const nameText = it.option_label ? `${it.name} — ${it.option_label}` : it.name;
    // Wrap the item text to the Item column's own width instead of
    // truncating with an ellipsis — a row that wraps to more than one line
    // grows to fit, and the row height is reserved up front (ensureSpace)
    // so a wrapped row is never split across a page break.
    const nameLines = wrapText(nameText, reg, 10, nameColW);
    const lineH = 13;
    const rowH = Math.max(24, nameLines.length*lineH + 10);
    ensureSpace(rowH);
    nameLines.forEach((line, i)=>{
      page.drawText(line, {x: MARGIN + cols[0].x*CONTENT_W, y: y - i*lineH, size:10, font:reg, color:INK});
    });
    drawCell(page, String(it.quantity), cols[1], y, {size:10});
    drawCell(page, PRICE_UNIT_LABEL[it.unit]||it.unit||'', cols[2], y, {size:10});
    drawCell(page, Number(it.rate).toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2}), cols[3], y, {size:10});
    drawCell(page, Number(it.line_total).toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2}), cols[4], y, {font:bold, size:10});
    y -= rowH;
    page.drawLine({start:{x:MARGIN,y:y+(rowH-14)}, end:{x:PAGE_W-MARGIN,y:y+(rowH-14)}, thickness:0.5, color:LINE});
  });

  ensureSpacePlain(90);
  y -= 10;
  const boxW = 210, boxX = PAGE_W-MARGIN-boxW;
  const summaryRows = [['Total', total], ['Taken', taken], ['Balance', balance]];
  // Row offsets, not a flat i*18 — Balance is the final, bolded result after
  // the divider line and sat right on top of it looked cramped against
  // Taken above; giving it extra breathing room (28 instead of 36) below the
  // divider (which moves with it, staying roughly centred in the new gap)
  // fixes that without touching the even Total/Taken spacing above it.
  const summaryRowY = [0, 18, 44];
  summaryRows.forEach(([label, val], i)=>{
    const rowY = y - summaryRowY[i];
    page.drawText(label, {x:boxX, y:rowY, size:10, font: i===2?bold:reg, color: i===2 && val<0 ? PDFLib.rgb(0.757,0.231,0.231) : INK});
    const valText = '£ '+Number(val).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
    const font = i===2?bold:reg;
    const w = font.widthOfTextAtSize(valText, 10);
    page.drawText(valText, {x:boxX+boxW-w, y:rowY, size:10, font, color: i===2 && val<0 ? PDFLib.rgb(0.757,0.231,0.231) : INK});
  });
  page.drawLine({start:{x:boxX,y:y-32}, end:{x:boxX+boxW,y:y-32}, thickness:0.75, color:LINE});
  y -= summaryRowY[2] + 10;

  // Live week-by-week booked-in breakdown, same figures that drive the
  // Taken total above — shows the maths behind it rather than just the
  // final number.
  if(weekRows.length){
    ensureSpacePlain(40);
    y -= 20;
    page.drawText('Weekly Booked In', {x:MARGIN, y, size:11, font:bold, color:INK});
    y -= 18;
    const wkCols = [
      {label:'Week', x:0, w:0.3, align:'left'},
      {label:'Amount £', x:0.3, w:0.35, align:'right'},
      {label:'Running Total £', x:0.65, w:0.35, align:'right'},
    ];
    ensureSpacePlain(20);
    wkCols.forEach(col=>drawCell(page, col.label, col, y, {font:bold, size:9, color:SLATE}));
    y -= 8;
    page.drawLine({start:{x:MARGIN,y}, end:{x:PAGE_W-MARGIN,y}, thickness:0.75, color:INK});
    y -= 16;
    let running = 0;
    weekRows.forEach(w=>{
      running += Number(w.amount||0);
      ensureSpacePlain(18);
      drawCell(page, 'Week '+w.week_number, wkCols[0], y, {size:9.5});
      drawCell(page, Number(w.amount||0).toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2}), wkCols[1], y, {size:9.5});
      drawCell(page, running.toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2}), wkCols[2], y, {size:9.5, font:bold});
      y -= 16;
    });
  }

  // Terms & Conditions (org-wide text set in Settings & Admin › Price
  // Builder — Rate Card), verbatim — only when the org has actually set
  // some, so a sheet never ships with fabricated/placeholder wording.
  // Placed on its own fresh page(s) at the very END of the document, after
  // the priced items and booked-in breakdown, so the price/build-up is the
  // first thing read.
  if(terms){
    newPage();
    page.drawText('Terms & Conditions', {x:MARGIN, y, size:13, font:bold, color:INK});
    y -= 22;
    terms.split(/\n+/).forEach(para=>{
      if(!para.trim()){ y -= 8; return; }
      wrapText(para.trim(), reg, 9.5, CONTENT_W).forEach(line=>{
        if(y < 70){ newPage(); }
        page.drawText(line, {x:MARGIN, y, size:9.5, font:reg, color:INK});
        y -= 14;
      });
      y -= 6;
    });
  }

  const bytes = await pdfDoc.save();
  const filename = exportFilename(site?site.name:'', sheet.title||'Price Sheet', 'pdf');
  return {bytes, filename, site, sheet};
}
window.exportPriceBuilderSheetPdf = async function(siteId, sheetId){
  const built = await buildPriceBuilderSheetPdfBytes(siteId, sheetId);
  if(!built) return;
  await deliverPdf(built.bytes, built.filename, {emailAction: ()=>emailPriceBuilderSheetPdf(siteId, sheetId)});
};
// Emails a Price Sheet PDF to an address typed in — same pattern as
// emailSiteInductionPdf: upload the freshly-built PDF to storage, then hand
// the edge function a link rather than a base64 attachment (some of these
// can run to several pages with a full rate breakdown).
window.emailPriceBuilderSheetPdf = async function(siteId, sheetId){
  const answer = await customPromptWithCc('Email this price sheet PDF to:', '');
  if(!answer) return;
  const typedTrim = (answer.value||'').trim();
  if(typedTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedTrim)){ toast('Enter a valid email address.'); return; }
  const emailTo = resolvePromptEmailTo(answer);
  if(!emailTo) return; // nothing typed and "CC me a copy" wasn't ticked either
  const trimmed = emailTo.to;
  toast('Building PDF…');
  const built = await buildPriceBuilderSheetPdfBytes(siteId, sheetId);
  if(!built) return;
  const path = siteId+'/price-builder/'+uid()+'-'+built.filename.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('mc-documents', path, new Blob([built.bytes], {type:'application/pdf'}), 'application/pdf');
  if(!stored){ toast('Could not upload the PDF — try again.'); return; }
  toast('Sending…');
  try{
    const res = await sbFetch('/functions/v1/send-price-builder-email', {method:'POST', body: JSON.stringify({
      site_id: siteId, recipient_email: trimmed, cc_email: emailTo.cc,
      sheet_title: built.sheet.title, file_url: publicUrl('mc-documents', stored),
    })});
    if(res && res.ok){ toast('Emailed'); } else { toast('Could not send the email — '+(await safeErr(res))); }
  }catch(e){
    // #(email-price-sheet-silent-fail) 2026-09-25 — this failed for Andy
    // with no trace at all in Supabase's own request logs (the upload just
    // before it succeeded every time), meaning the fetch below never
    // actually left the browser — something threw before/while the request
    // was being made. Surfacing the real error here (instead of the old
    // generic "try again") so the next failure is diagnosable from the
    // toast itself rather than invisible.
    console.error('[emailPriceBuilderSheetPdf]', e);
    toast('Could not send the email — '+((e && e.message) || e || 'unknown error'));
  }
};
