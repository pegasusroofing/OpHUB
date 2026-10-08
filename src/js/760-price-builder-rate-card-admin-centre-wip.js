/* ================= PRICE BUILDER — RATE CARD (Admin Centre, WIP feature) ================= */
let priceRateAddOpen = false;
let priceRateAddLastCategory = '';
window.addPriceRateItem = async function(){
  const category = document.getElementById('prCategory').value.trim();
  const name = document.getElementById('prName').value.trim();
  const unit = document.getElementById('prUnit').value;
  const isDropdown = document.getElementById('prIsDropdown').checked;
  const rateRaw = document.getElementById('prRate').value.trim();
  if(!category || !name){ toast('Enter a category and item name.'); return; }
  if(!isDropdown && !rateRaw){ toast('Enter a rate, or tick "This is a dropdown".'); return; }
  const row = await dbInsert('price_rate_items', {
    org_id: ME.org_id, category, name, unit,
    is_dropdown: isDropdown,
    rate: isDropdown ? null : parseFloat(rateRaw),
    created_by: ME.id,
  });
  if(row){
    toast('Rate item added'+(isDropdown?' — now add its options below' : ''));
    priceRateAddLastCategory = category;
    if(!isDropdown) priceRateAddOpen = false;
    render();
  }
};
window.savePriceBuilderTerms = async function(){
  const val = document.getElementById('pbTermsField').value;
  const row = await dbUpdate('organizations', ME.org_id, {price_builder_terms: val || null});
  if(row){ if(ORG) ORG.price_builder_terms = val || null; toast('Terms saved'); }
};
window.savePriceRateField = async function(input, itemId, field){
  const raw = input.value.trim();
  if(!raw){ toast((field==='name'?'Item name':'Rate')+" can't be empty."); render(); return; }
  const val = field==='rate' ? parseFloat(raw) : raw;
  if(field==='rate' && Number.isNaN(val)){ toast('Enter a valid number.'); render(); return; }
  const row = await dbUpdate('price_rate_items', itemId, {[field]:val});
  if(row) toast('Rate card updated');
};
window.deletePriceRateItem = async function(itemId, name){
  if(!await customConfirm(`Remove "${name}" from the rate card? This can't be undone — it won't affect any sheet that's already been issued, since those keep their own snapshot of the rates used.`)) return;
  const ok = await dbDelete('price_rate_items', itemId);
  if(ok){ toast('Rate item removed'); render(); }
};
window.addPriceRateOption = async function(itemId){
  const label = await customPrompt('Option name, e.g. "Marley Eternit Concrete Tile"');
  if(!label) return;
  const rateStr = await customPrompt(`Rate for "${label}" (£)`);
  if(rateStr===null) return;
  const rate = parseFloat(rateStr);
  if(Number.isNaN(rate)){ toast('Enter a valid number.'); return; }
  const row = await dbInsert('price_rate_options', {rate_item_id: itemId, label, rate});
  if(row){ toast('Option added'); render(); }
};
window.savePriceRateOptionField = async function(input, optionId, field){
  const raw = input.value.trim();
  if(!raw){ toast((field==='label'?'Option name':'Rate')+" can't be empty."); render(); return; }
  const val = field==='rate' ? parseFloat(raw) : raw;
  if(field==='rate' && Number.isNaN(val)){ toast('Enter a valid number.'); render(); return; }
  const row = await dbUpdate('price_rate_options', optionId, {[field]:val});
  if(row) toast('Option updated');
};
window.deletePriceRateOption = async function(optionId, itemId){
  if(!await customConfirm('Remove this option?')) return;
  const ok = await dbDelete('price_rate_options', optionId);
  if(ok){ toast('Option removed'); render(); }
};
// Bulk import/update — columns: Category, Name, Unit (lm/m2/each), Rate.
// Matches an existing item by Category+Name (case-insensitive) and updates
// its rate/unit in place; anything not matched is added as new. Dropdown
// items (and their options) aren't touched by this — add those manually,
// since a flat rate-per-row sheet can't express the option list.
/* ---------- Price Sheet rate card <-> Excel ----------
   The rate card lives as one workbook, one tab per element of works
   (category) — matches the app's own category headers exactly. Each row is
   one item: Item | Unit | Rate (£) | Option 1 | Option 1 Rate (£) | Option 2
   | Option 2 Rate (£) ... up to 6 option pairs. A plain item just fills in
   Rate and leaves every Option column blank; a dropdown item leaves Rate
   blank and fills in its options across those pairs — adding a new option
   to an existing dropdown is just typing into the next empty pair, and a
   brand new dropdown item only needs at least one pair filled in. Adding a
   whole new element of works is a new tab named after it.
   Download/Upload round-trips this exactly, so this is the one place to
   maintain rates — the in-app editor above is for quick one-off tweaks. */
const PRICE_RATE_OPTION_SLOTS = 6;
const PRICE_RATE_SKIP_SHEETS = ['read me','readme','instructions'];
const PRICE_UNIT_TO_LABEL = {lm:'Linear metre', m2:'m²', each:'Each'};
const PRICE_UNIT_FROM_TEXT = {lm:'lm','linear metre':'lm','linear metres':'lm','linear m':'lm','m':'lm',
  m2:'m2','sq m':'m2','sqm':'m2','m²':'m2','m2 (sq m)':'m2', each:'each',ea:'each','no':'each','nr':'each'};
window.exportPriceRateExcel = async function(){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  const items = await dbSelect('price_rate_items', 'org_id=eq.'+ME.org_id+'&active=eq.true&order=category.asc,sort_order.asc,name.asc');
  const dropdownIds = items.filter(i=>i.is_dropdown).map(i=>i.id).join(',');
  const options = dropdownIds ? await dbSelect('price_rate_options', 'rate_item_id=in.('+dropdownIds+')&order=sort_order.asc') : [];
  const optionsByItem = {};
  options.forEach(o=>{ (optionsByItem[o.rate_item_id]=optionsByItem[o.rate_item_id]||[]).push(o); });
  const categories = [];
  items.forEach(it=>{ let c=categories.find(c=>c.name===it.category); if(!c){c={name:it.category, items:[]};categories.push(c);} c.items.push(it); });
  sortPriceRateCategories(categories);

  const wb = XLSX.utils.book_new();
  const readMeRows = [
    ['RTB Price Sheet Rate Card'],
    [''],
    ['One tab per element of works. Each row is one item.'],
    ['Columns: Item | Unit | Rate (£) | Option 1 | Option 1 Rate (£) | Option 2 | Option 2 Rate (£) ... up to 6 pairs.'],
    [''],
    ['A plain item: fill in Rate, leave every Option column blank.'],
    ['A dropdown item: leave Rate blank, fill in Option/Rate pairs (e.g. "Plain Tiles" / 37.50). To add a new'],
    ['option to an item that already has some, just use the next empty pair.'],
    [''],
    ['To add a whole new element of works, add a new tab named after it.'],
    ['Unit is one of: lm (linear metre), m2 (m²), each.'],
    [''],
    ['Uploading this file back to the app REPLACES the entire rate card with what is in it — download the'],
    ['current version first, edit it, then upload the whole thing back rather than a partial file.'],
  ];
  const readMeWs = XLSX.utils.aoa_to_sheet(readMeRows);
  readMeWs['!cols'] = [{wch:100}];
  XLSX.utils.book_append_sheet(wb, readMeWs, 'Read Me');

  categories.forEach(cat=>{
    const header = ['Item', 'Unit', 'Rate (£)'];
    for(let i=1;i<=PRICE_RATE_OPTION_SLOTS;i++) header.push('Option '+i, 'Option '+i+' Rate (£)');
    const rows = [header];
    cat.items.forEach(it=>{
      const row = [it.name, PRICE_UNIT_TO_LABEL[it.unit]||it.unit, it.is_dropdown ? '' : (it.rate!=null?Number(it.rate):'')];
      const opts = optionsByItem[it.id]||[];
      for(let i=0;i<PRICE_RATE_OPTION_SLOTS;i++){
        row.push(opts[i]?opts[i].label:'', opts[i]?Number(opts[i].rate):'');
      }
      rows.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:42},{wch:12},{wch:10}].concat(Array(PRICE_RATE_OPTION_SLOTS).fill(0).flatMap(()=>[{wch:18},{wch:12}]));
    // Sheet names are capped at 31 chars and can't contain \/?*[] — categories
    // here are short enough not to hit that, but strip anything that would.
    const safeName = String(cat.name).replace(/[\\/?*\[\]:]/g,'').slice(0,31) || 'Category';
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });

  await deliverExcelFile(wb, 'RTB_Price_Builder_Rate_Card.xlsx');
};
window.importPriceRateExcel = async function(input){
  const file = input.files && input.files[0]; if(!file) return;
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); input.value=''; return; }
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const newItems = []; // {category, name, unit, rate, is_dropdown, sort_order, options:[{label,rate,sort_order}]}
    let skipped = 0;
    wb.SheetNames.forEach(sheetName=>{
      if(PRICE_RATE_SKIP_SHEETS.includes(sheetName.trim().toLowerCase())) return;
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header:1});
      if(!rows.length) return;
      const category = sheetName.trim();
      let sortOrder = 0;
      // Row 0 is the header (Item/Unit/Rate/Option 1/...) — skip it if it
      // looks like one, otherwise assume every row is data (no header row).
      const looksLikeHeader = rows[0] && String(rows[0][0]||'').trim().toLowerCase()==='item';
      for(let i=looksLikeHeader?1:0; i<rows.length; i++){
        const r = rows[i]; if(!r || !r.length) continue;
        const name = String(r[0]!=null?r[0]:'').trim();
        if(!name) continue;
        const unitRaw = String(r[1]!=null?r[1]:'').trim().toLowerCase();
        const unit = PRICE_UNIT_FROM_TEXT[unitRaw] || 'each';
        const rateRaw = r[2];
        const options = [];
        for(let s=0; s<PRICE_RATE_OPTION_SLOTS; s++){
          const labelCell = r[3 + s*2], rateCell = r[3 + s*2 + 1];
          const label = String(labelCell!=null?labelCell:'').trim();
          const rate = parseFloat(rateCell);
          if(label && !Number.isNaN(rate)) options.push({label, rate, sort_order:options.length});
        }
        if(options.length){
          newItems.push({category, name, unit, rate:null, is_dropdown:true, sort_order:sortOrder++, options});
        } else {
          const rate = parseFloat(rateRaw);
          if(Number.isNaN(rate)){ skipped++; continue; }
          newItems.push({category, name, unit, rate, is_dropdown:false, sort_order:sortOrder++, options:[]});
        }
      }
    });
    if(!newItems.length){ toast('Nothing usable found — check each tab has Item/Unit/Rate (or Option) columns filled in.'); input.value=''; return; }
    let msg = `This will replace the entire rate card with ${newItems.length} item${newItems.length===1?'':'s'} across ${new Set(newItems.map(i=>i.category)).size} categor${new Set(newItems.map(i=>i.category)).size===1?'y':'ies'} from this file.`;
    if(skipped) msg += ` (${skipped} row${skipped===1?'':'s'} skipped — missing rate or options.)`;
    msg += ' Continue?';
    if(!await customConfirm(msg)){ input.value=''; return; }
    // Full replace, but the NEW card goes in first and the old one is only
    // removed once the new rows are safely saved — so a dropped signal
    // half way through can never leave the business with no rate card.
    const existingRes = await dbSelectChecked('price_rate_items', 'org_id=eq.'+ME.org_id+'&select=id');
    if(!existingRes.ok){ toast('Could not reach the server — rate card left unchanged. Check your signal and try again.'); input.value=''; return; }
    const existingIds = existingRes.data.map(r=>r.id);
    const insertedItems = await dbInsert('price_rate_items', newItems.map(it=>({
      org_id: ME.org_id, category: it.category, name: it.name, unit: it.unit,
      rate: it.rate, is_dropdown: it.is_dropdown, sort_order: it.sort_order, created_by: ME.id,
    })));
    let optionRows = [];
    if(insertedItems && insertedItems.length===newItems.length){
      newItems.forEach((it, idx)=>{
        const newId = insertedItems[idx].id;
        it.options.forEach(o=>optionRows.push({rate_item_id:newId, label:o.label, rate:o.rate, sort_order:o.sort_order}));
      });
      if(optionRows.length){
        const optIns = await dbInsert('price_rate_options', optionRows);
        if(!optIns){
          // Undo the half-imported new card and keep the old one.
          await sbFetch('/rest/v1/price_rate_items?id=in.('+insertedItems.map(r=>r.id).join(',')+')', {method:'DELETE'}).catch(()=>{});
          toast('Import failed part way — your existing rate card has been left unchanged.'); input.value=''; render(); return;
        }
      }
    } else {
      if(insertedItems && insertedItems.length) await sbFetch('/rest/v1/price_rate_items?id=in.('+insertedItems.map(r=>r.id).join(',')+')', {method:'DELETE'}).catch(()=>{});
      toast('Import failed — your existing rate card has been left unchanged.'); input.value=''; render(); return;
    }
    // New card is saved — now clear the old rows (options cascade-delete).
    let oldLeft = 0;
    for(let i=0; i<existingIds.length; i+=80){
      const chunk = existingIds.slice(i, i+80);
      try{
        const dr = await sbFetch('/rest/v1/price_rate_items?id=in.('+chunk.join(',')+')', {method:'DELETE'});
        if(!dr.ok) oldLeft += chunk.length;
      }catch(e){ oldLeft += chunk.length; }
    }
    if(oldLeft){ toast(`New rates imported, but ${oldLeft} old item${oldLeft===1?'':'s'} could not be removed — delete the duplicates by hand or import again.`); priceRateAddOpen = false; input.value=''; render(); return; }
    toast(`Rate card replaced — ${newItems.length} item${newItems.length===1?'':'s'}, ${optionRows.length} option${optionRows.length===1?'':'s'}.`);
    priceRateAddOpen = false; input.value=''; render();
  }catch(e){ console.error(e); toast('Could not read that file — check it\'s a valid .xlsx exported from this tool.'); input.value=''; }
};

let havsToolAddOpen = false;
window.saveHavsToolField = async function(input, toolId, field){
  const raw = input.value.trim();
  if(!raw){ toast((field==='name'?'Tool name':'Magnitude')+" can't be empty."); render(); return; }
  const val = field==='vibration_magnitude' ? parseFloat(raw) : titleCaseWords(raw);
  if(field==='vibration_magnitude' && (!isFinite(val) || val<=0)){ toast('Enter a magnitude greater than 0.'); render(); return; }
  if(String(val) === input.defaultValue) return;
  const row = await dbUpdate('havs_tools', toolId, {[field]:val});
  if(row) toast('Tool updated');
};
window.addHavsTool = async function(){
  const name = titleCaseWords(document.getElementById('havsToolName').value.trim());
  const mag = parseFloat(document.getElementById('havsToolMag').value);
  if(!name){ toast('Enter a tool name.'); return; }
  if(!isFinite(mag) || mag<=0){ toast('Enter a vibration magnitude greater than 0.'); return; }
  const rows = await dbInsert('havs_tools', {org_id:ME.org_id, name, vibration_magnitude:mag, sort_order:999});
  if(rows){ havsToolAddOpen = false; toast('Tool added'); render(); }
};
window.deleteHavsTool = async function(toolId, name){
  if(!await customConfirm(`Remove "${name}"? Past HAVS entries using it are kept, but it won't be selectable for new entries.`)) return;
  // Tools are referenced by past entries (ON DELETE RESTRICT), so
  // deactivate rather than hard-delete — keeps historical exposure records
  // intact while taking it out of the picker for new entries.
  const row = await dbUpdate('havs_tools', toolId, {active:false});
  if(row){ toast('Tool removed'); render(); }
};
window.cancelMaterial = async function(siteId, matId){
  const reason = await customPrompt('Why are you cancelling this request? This will be visible to your Project Manager.');
  if(reason === null) return;
  if(!reason.trim()){ toast('A reason is required to cancel.'); return; }
  const row = await dbUpdate('materials', matId, {status:'cancelled', cancel_reason: reason.trim(), cancelled_by: ME.id});
  if(row){ toast('Request cancelled'); render(); }
};
window.addMaterial = async function(siteId){
  const item = document.getElementById('matItem').value.trim();
  const qty = document.getElementById('matQty').value.trim();
  const requiredByEl = document.getElementById('matRequiredBy');
  const requiredBy = requiredByEl ? requiredByEl.value : '';
  if(!item) return;
  const rows = await dbInsert('materials', {site_id:siteId, item, qty:qty||'1', required_by_date: requiredBy||null, requested_by:ME.id, status:'pending'});
  if(rows){
    postSystemMessage(siteId, 'material_request', `${ME.name} requested material: ${item} (qty ${qty||'1'})`+(requiredBy?` — required by ${requiredBy}`:''));
    toast('Request added'); render();
  }
};
// The "delivery or collection" part of the send step, shared by a single
// order and a grouped (collated) order. Collection asks who is collecting:
// a driver (the order goes onto the Delivery Schedule as one job) or a site
// operative (each item goes onto the Material List, assigned to them).
function orderSupplierFor(key){
  if(key==='group') return groupSupplierId;
  if(sendingMaterial && sendingMaterial.matId===key) return sendingMaterial.supplierId;
  return materialSupplierChoice[key];
}
function orderFulfilmentHtml(key, drivers, siteOps){
  return `
    ${branchSelectHtml('reqBranch_'+key, orderSupplierFor(key))}
    <div class="formfield"><label class="field-label">Delivery or collection</label>
      <select id="reqMode_${key}" onchange="onOrderModeChange('${key}')">
        <option value="delivery">Delivery — supplier delivers to site</option>
        <option value="collection">Collection — we pick it up</option>
      </select>
    </div>
    <p class="stub" id="reqModeNote_${key}" style="margin:0 0 8px;">The supplier will see this date on the order.</p>
    <div class="formfield" onclick="openDatePickerRow(this)"><label class="field-label" id="reqDateLabel_${key}">Choose Delivery Date</label><input type="date" id="reqDeliveryDate_${key}" min="${localISODate(new Date())}"></div>
    <div id="reqCollect_${key}" style="display:none;">
      <div class="formfield"><label class="field-label">Who is collecting</label>
        <select id="reqCollector_${key}" onchange="onOrderModeChange('${key}')">
          <option value="">Choose…</option>
          ${drivers.length ? `<optgroup label="Driver — adds to the Delivery Schedule">${drivers.map(d=>`<option value="driver:${d.id}">🚐 ${escapeHtml(d.name)}</option>`).join('')}</optgroup>` : ''}
          ${siteOps.length ? `<optgroup label="Operative — adds to the Collection List">${siteOps.map(o=>`<option value="op:${o.id}">👷 ${escapeHtml(o.name)}</option>`).join('')}</optgroup>` : ''}
        </select>
      </div>
      ${!drivers.length && !siteOps.length ? `<p class="stub" style="margin:0 0 8px;color:var(--warn);">No drivers or site operatives to choose from yet.</p>` : ''}
      <div class="formfield" id="reqSlotWrap_${key}" style="display:none;"><label class="field-label">Collection drop</label>
        <select id="reqSlot_${key}">${DELIVERY_TIME_SLOTS.map(x=>`<option value="${x.key}">${x.label}</option>`).join('')}</select>
      </div>
    </div>
    <div class="formfield"><label class="field-label">Note (optional)</label>
      <textarea id="reqNote_${key}" rows="2" maxlength="500" placeholder="e.g. which branch, what each item is for…"></textarea>
    </div>
    ${siteOps.filter(o=>o.email).length ? `
    <div class="formfield"><label class="field-label">Also email a copy to (optional)</label>
      <div style="border:1.5px solid var(--line);border-radius:8px;padding:6px 10px;max-height:170px;overflow-y:auto;background:#fff;">
        ${siteOps.filter(o=>o.email).map(o=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13.5px;cursor:pointer;"><input type="checkbox" class="reqCc_${key}" value="${o.id}" style="width:17px;height:17px;flex:0 0 17px;"> ${escapeHtml(o.name)}</label>`).join('')}
      </div>
      <p class="stub" style="margin:4px 0 0;">Operatives assigned to this site. Anyone ticked is copied in on the order email.</p>
    </div>` : ''}`;
}
window.onOrderModeChange = function(key){
  const g = id=>document.getElementById(id+'_'+key);
  const collecting = g('reqMode') && g('reqMode').value==='collection';
  if(g('reqCollect')) g('reqCollect').style.display = collecting ? '' : 'none';
  if(g('reqDateLabel')) g('reqDateLabel').textContent = collecting ? 'Choose Collection Date' : 'Choose Delivery Date';
  const who = g('reqCollector') ? g('reqCollector').value : '';
  if(g('reqSlotWrap')) g('reqSlotWrap').style.display = (collecting && who.indexOf('driver:')===0) ? '' : 'none';
};
// Reads the send step. Returns null (after a toast) if something is missing.
function readOrderFulfilment(key){
  const g = id=>document.getElementById(id+'_'+key);
  const date = g('reqDeliveryDate') ? g('reqDeliveryDate').value : '';
  const mode = g('reqMode') && g('reqMode').value==='collection' ? 'collection' : 'delivery';
  if(!date){ toast((mode==='collection'?'Collection':'Delivery')+' date is required before sending.'); return null; }
  const branch = readBranch('reqBranch_'+key, orderSupplierFor(key));
  const typedNote = g('reqNote') ? g('reqNote').value.trim() : '';
  // The supplier sees the branch on the order (it goes out in the note).
  const note = branch ? ('Branch: '+branchLabel(branch)+(branch.phone?' ('+branch.phone+')':'')+(typedNote ? ' — '+typedNote : '')) : typedNote;
  const ccIds = Array.from(document.querySelectorAll('.reqCc_'+key+':checked')).map(el=>el.value);
  if(mode==='delivery') return {mode, date, note, ccIds, branch, collectorKind:null, collectorId:null, slot:null};
  const who = g('reqCollector') ? g('reqCollector').value : '';
  if(!who){ toast('Choose who is collecting.'); return null; }
  const parts = who.split(':');
  return {mode, date, note, ccIds, branch, collectorKind:parts[0], collectorId:parts[1], slot: g('reqSlot') ? g('reqSlot').value : '7am'};
}
// After the order is saved: puts a collection onto the driver's Delivery
// Schedule (one job for the whole order) or the operative's Material List.
// Sending an order that has ALREADY been sent once (an amendment, a re-send)
// used to put the collection on the Delivery Schedule / Material List a
// second time, so the driver ended up with duplicates. Now a re-send asks
// first; "No" still sends the email, it just doesn't book it again.
async function confirmRebookCollection(f, materials){
  if(!f || f.mode!=='collection') return true;
  const sentBefore = (materials||[]).some(m=>m && (m.sent_at || m.email_sent_at));
  if(!sentBefore) return true;
  const where = f.collectorKind==='driver' ? 'Delivery Schedule' : 'Collection List';
  const who = (PROFILES[f.collectorId]||{}).name || 'them';
  return await customConfirm(`This order has been sent before. Add it to the ${where} for ${who} again? Choose No if it is already on there — the email will still be sent.`, {confirmLabel:'Yes — add it again', cancelLabel:'No — email only'});
}
async function bookOrderCollection(siteId, f, supplier, toMe, materials){
  if(!f || f.mode!=='collection') return '';
  if(f.skipBooking) return ' — not added to the '+(f.collectorKind==='driver'?'Delivery Schedule':'Collection List')+' again';
  const who = PROFILES[f.collectorId];
  const whoName = who ? who.name : 'them';
  const dateLabel = new Date(f.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'});
  const itemsText = materials.map(m=>m.item+(m.qty?' x '+m.qty:'')).join('; ');
  try{
    if(f.collectorKind==='driver'){
      const payload = {
        org_id: ME.org_id, site_id: siteId,
        description: 'Collect order: '+itemsText+(f.note ? ' — Note: '+f.note : ''),
        collection_type: (toMe || f.branch) ? 'manual' : 'supplier',
        supplier_id: toMe ? null : supplier.id,
        collection_address_manual: f.branch ? (supplier.name+' '+branchLabel(f.branch)) : (toMe ? 'Supplier to be confirmed' : null),
        scheduled_date: f.date, time_slot: f.slot||'7am', high_priority:false,
        driver_id: f.collectorId, needs_completing:false, created_by: ME.id,
      };
      const rows = await dbInsert('delivery_tasks', payload);
      const saved = rows && rows[0];
      if(!saved) return ' — but it could not be added to the Delivery Schedule, add it by hand';
      try{ await resequenceSlot(payload.scheduled_date, payload.time_slot); await syncDeliveryCalendarEvent(saved.id, null, payload); }catch(e){}
      if(f.collectorId!==ME.id) postSystemMessageToUser(f.collectorId, siteId, 'delivery_assigned', `You've been assigned a collection for ${dateLabel}: ${itemsText}${f.note ? ' — Note: '+f.note : ''}`, saved.id);
      return ' — added to the Delivery Schedule for '+whoName+', '+dateLabel;
    }
    const nowIso = new Date().toISOString();
    const rows = await dbInsert('material_required_items', materials.map(m=>({
      site_id: siteId, org_id: ME.org_id, item: m.item+' (collect '+dateLabel+(f.note ? ' — '+f.note : '')+')', qty: m.qty||null,
      supplier_id: toMe ? null : supplier.id, supplier_branch: f.branch||null, status:'assigned', assigned_to: f.collectorId, assigned_at: nowIso, created_by: ME.id,
    })));
    if(!rows) return ' — but it could not be added to the Collection List, add it by hand';
    if(f.collectorId!==ME.id) postSystemMessageToUser(f.collectorId, siteId, 'message', `Material to collect on ${dateLabel}${toMe?'':' from '+supplier.name}: ${itemsText}${f.note ? ' — Note: '+f.note : ''}`, null);
    return ' — added to the Collection List for '+whoName+' to collect '+dateLabel;
  }catch(e){ console.error('bookOrderCollection failed', e); return ' — but the collection could not be booked, add it by hand'; }
}
window.beginSendMaterial = async function(matId){
  const supplierId = materialSupplierChoice[matId];
  if(!supplierId){ customAlert('Please choose a supplier before sending this order.'); return; }
  if(supplierId===SUPPLIER_EMAIL_ME && !ME.email){ toast('There is no email address on your profile.'); return; }
  const rows = supplierId===SUPPLIER_EMAIL_ME ? [emailMeSupplier()] : await dbSelect('suppliers', 'id=eq.'+supplierId+'&select=name');
  const supplier = rows && rows[0];
  if(!supplier){ toast('Could not find that supplier.'); return; }
  sendingMaterial = {matId, supplierId, supplierName: supplierId===SUPPLIER_EMAIL_ME ? 'me' : supplier.name};
  render();
};
window.confirmSendMaterial = async function(siteId, matId){
  if(!sendingMaterial || sendingMaterial.matId !== matId) return;
  const supplierId = sendingMaterial.supplierId;
  const fulfil = readOrderFulfilment(matId);
  if(!fulfil) return;
  const requiredForDelivery = fulfil.date;
  const toMe = supplierId===SUPPLIER_EMAIL_ME;
  const suppliers = toMe ? [emailMeSupplier()] : await dbSelect('suppliers', 'id=eq.'+supplierId+'&select=*');
  const supplier = suppliers && suppliers[0];
  if(!supplier){ toast('Could not find that supplier.'); return; }
  const material = (await dbSelect('materials', 'id=eq.'+matId+'&select=*'))[0];
  if(!(await confirmRebookCollection(fulfil, material ? [material] : []))) fulfil.skipBooking = true;
  // Goes straight to 'closed' — an order that's just been sent to a merchant
  // doesn't need a separate manual "Close request" step afterwards.
  const row = await dbUpdate('materials', matId, {status:'closed', merchant: toMe ? 'Emailed to '+ME.name : supplier.name, supplier_id: toMe ? null : supplierId, sent_at:new Date().toISOString(), required_for_delivery:requiredForDelivery, fulfilment:fulfil.mode, collector_id:fulfil.collectorId||null, order_note:fulfil.note||null, supplier_branch:fulfil.branch||null});
  if(!row){ return; }
  sendingMaterial = null;
  delete materialSupplierChoice[matId];
  const collectNote = await bookOrderCollection(siteId, fulfil, supplier, toMe, material ? [material] : []);
  toast((toMe ? 'Emailing the order to you…' : 'Order routed to '+supplier.name+' — emailing…'));
  render();
  try{
    const res = await sbFetch('/functions/v1/send-material-order', {method:'POST', body: JSON.stringify({
      material_id: matId, supplier_email: supplier.email, supplier_name: toMe ? ME.name : supplier.name,
      item: material ? material.item : '', qty: material ? material.qty : '', site_id: siteId,
      required_for_delivery: requiredForDelivery,
      note: fulfil.note || null, cc_user_ids: fulfil.ccIds || [],
      fulfilment: fulfil.mode, collector_name: (fulfil.collectorId && PROFILES[fulfil.collectorId]) ? PROFILES[fulfil.collectorId].name : null,
    })});
    const d = await res.json();
    if(res.ok && !d.error){
      await dbUpdate('materials', matId, {email_sent_at:new Date().toISOString()});
      toast((toMe ? 'Order emailed to you at '+supplier.email : 'Order emailed to '+supplier.name+' (you\'ve been CC\'d)')+((fulfil.ccIds||[]).length ? ' — copied to '+fulfil.ccIds.length+' operative'+(fulfil.ccIds.length>1?'s':'') : '')+collectNote);
    } else {
      console.error('send-material-order failed:', d.error || res.status);
      toast('Routed to '+supplier.name+', but the order email failed to send — '+(d.error ? String(d.error).slice(0,140) : 'check it manually.'));
    }
  }catch(e){
    console.error('send-material-order failed:', e);
    toast('Routed to '+supplier.name+', but the order email failed to send — check it manually.');
  }
  render();
};
// "Send again" on an order that's already been sent (reopened or closed):
// ticks it and jumps to the panel at the top, where the supplier (or Email
// to me) and delivery/collection are chosen — tick more to send them together.
window.sendMaterialAgain = async function(matId){
  selectedMaterialIds.add(matId);
  await render();
  try{ window.scrollTo({top:0, behavior:'smooth'}); }catch(e){ window.scrollTo(0,0); }
  toast('Choose a supplier at the top, then send. Tick more orders to send them together.');
};
let materialSelectableIds = [];
window.selectAllMaterials = function(){
  materialSelectableIds.forEach(id=>selectedMaterialIds.add(id));
  render();
};
window.clearMaterialSelection = function(){
  selectedMaterialIds = new Set(); groupSupplierId = null; supplierPickerFor = null; sendingGroup = false;
};
// Closed tab, several ticked: put them all back to live in one go.
window.reopenSelectedMaterials = async function(siteId){
  const ids = Array.from(selectedMaterialIds);
  if(!ids.length) return;
  if(!await customConfirm('Reopen '+ids.length+' closed order'+(ids.length>1?'s':'')+'? They go back to the Live/Pending tab.', {confirmLabel:'Yes — reopen'})) return;
  const results = await Promise.all(ids.map(id=>dbUpdate('materials', id, {status:'sent'})));
  const done = results.filter(Boolean).length;
  clearMaterialSelection();
  toast(done===ids.length ? done+' order'+(done>1?'s':'')+' reopened' : done+' of '+ids.length+' reopened — the rest could not be changed.');
  render();
};
window.deleteSelectedMaterials = async function(siteId){
  const ids = Array.from(selectedMaterialIds);
  if(!ids.length) return;
  if(!await customConfirm('Delete '+ids.length+' closed order'+(ids.length>1?'s':'')+'? This can\'t be undone.', {confirmLabel:'Yes — delete', danger:true})) return;
  const rows = await dbSelect('materials', 'id=in.('+ids.join(',')+')&select=id,item');
  let done = 0;
  for(const id of ids){
    if(await dbDelete('materials', id)){
      done++;
      const r = rows.find(x=>x.id===id);
      logSiteActivity(siteId, 'material_request_deleted', `Deleted material request "${(r&&r.item)||''}"`);
    }
  }
  clearMaterialSelection();
  toast(done===ids.length ? done+' order'+(done>1?'s':'')+' deleted' : done+' of '+ids.length+' deleted.');
  render();
};
window.toggleMaterialSelect = function(matId){
  if(selectedMaterialIds.has(matId)) selectedMaterialIds.delete(matId);
  else selectedMaterialIds.add(matId);
  render();
};
window.confirmSendGroupedMaterial = async function(siteId){
  if(!groupSupplierId || !selectedMaterialIds.size) return;
  const fulfil = readOrderFulfilment('group');
  if(!fulfil) return;
  const requiredForDelivery = fulfil.date;
  const toMe = groupSupplierId===SUPPLIER_EMAIL_ME;
  if(toMe && !ME.email){ toast('There is no email address on your profile.'); return; }
  const suppliers = toMe ? [emailMeSupplier()] : await dbSelect('suppliers', 'id=eq.'+groupSupplierId+'&select=*');
  const supplier = suppliers && suppliers[0];
  if(!supplier){ toast('Could not find that supplier.'); return; }
  const matIds = Array.from(selectedMaterialIds);
  const materials = await dbSelect('materials', 'id=in.('+matIds.join(',')+')&select=*');
  if(!materials || !materials.length){ toast('Could not load the selected requests.'); return; }
  if(!(await confirmRebookCollection(fulfil, materials))) fulfil.skipBooking = true;
  const nowIso = new Date().toISOString();
  const updateResults = await Promise.all(matIds.map(id => dbUpdate('materials', id, {status:'closed', merchant: toMe ? 'Emailed to '+ME.name : supplier.name, supplier_id: toMe ? null : groupSupplierId, sent_at:nowIso, required_for_delivery:requiredForDelivery, fulfilment:fulfil.mode, collector_id:fulfil.collectorId||null, order_note:fulfil.note||null, supplier_branch:fulfil.branch||null})));
  if(updateResults.some(r=>!r)){ toast('Some requests could not be updated — check them manually.'); }
  sendingGroup = false;
  selectedMaterialIds = new Set();
  groupSupplierId = null;
  const collectNote = await bookOrderCollection(siteId, fulfil, supplier, toMe, materials);
  toast(toMe ? 'Emailing the order to you…' : 'Order routed to '+supplier.name+' — emailing…');
  render();
  try{
    const res = await sbFetch('/functions/v1/send-material-order', {method:'POST', body: JSON.stringify({
      supplier_email: supplier.email, supplier_name: toMe ? ME.name : supplier.name, site_id: siteId,
      required_for_delivery: requiredForDelivery,
      note: fulfil.note || null, cc_user_ids: fulfil.ccIds || [],
      fulfilment: fulfil.mode, collector_name: (fulfil.collectorId && PROFILES[fulfil.collectorId]) ? PROFILES[fulfil.collectorId].name : null,
      items: materials.map(m=>({item:m.item, qty:m.qty})),
    })});
    const d = await res.json();
    if(res.ok && !d.error){
      await Promise.all(matIds.map(id => dbUpdate('materials', id, {email_sent_at:new Date().toISOString()})));
      toast((toMe ? 'Order emailed to you at '+supplier.email : 'Order emailed to '+supplier.name+' (you\'ve been CC\'d)')+((fulfil.ccIds||[]).length ? ' — copied to '+fulfil.ccIds.length+' operative'+(fulfil.ccIds.length>1?'s':'') : '')+collectNote);
    } else {
      console.error('send-material-order failed:', d.error || res.status);
      toast('Routed to '+supplier.name+', but the order email failed to send — '+(d.error ? String(d.error).slice(0,140) : 'check it manually.'));
    }
  }catch(e){
    console.error('send-material-order failed:', e);
    toast('Routed to '+supplier.name+', but the order email failed to send — check it manually.');
  }
  render();
};
window.closeMaterial = async function(siteId, matId){
  const row = await dbUpdate('materials', matId, {status:'closed'});
  if(row){ toast('Material request closed'); logSiteActivity(siteId, 'material_request_closed', `Closed material request "${row.item||''}"`); render(); }
};
window.reopenMaterial = async function(siteId, matId){
  // Reopened requests go back to 'sent' (not 'pending') when they'd already
  // been ordered, so the merchant/email history stays visible and it lands
  // back in the Live tab rather than looking like a brand new request.
  const row = await dbUpdate('materials', matId, {status:'sent'});
  if(row){ toast('Material request reopened'); render(); }
};
// Re-email popup: shows the address it was originally sent to (from the
// supplier record), lets it be edited for this one send, and confirms once
// the email has actually gone out. Built as a persistent DOM node outside
// the normal render() cycle (same pattern as the GPS options modal) so
// typing in the address field doesn't get reset by an app-wide re-render.
window.openReemailPrompt = async function(siteId, matId){
  const rows = await dbSelect('materials', 'id=eq.'+matId+'&select=*');
  const material = rows && rows[0];
  if(!material || !material.supplier_id){ toast('Missing supplier details — cannot re-email.'); return; }
  const suppliers = await dbSelect('suppliers', 'id=eq.'+material.supplier_id+'&select=*');
  const supplier = suppliers && suppliers[0];
  if(!supplier){ toast('Could not find that supplier.'); return; }
  let ov = document.getElementById('reemailModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'reemailModalOverlay';
    ov.className = 'geo-modal-overlay';
    ov.onclick = (e)=>{ if(e.target===ov) window.closeReemailPrompt(); };
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div class="geo-modal-card">
      <h3>Re-email order</h3>
      <p class="stub">This order was originally emailed to the address below — edit it if you need to send it somewhere else this time.</p>
      <div class="formfield"><label class="field-label">Send to</label><input type="email" id="reemailAddressInput" value="${escapeHtml(supplier.email)}"></div>
      <button class="darkbtn" id="reemailConfirmBtn" style="width:100%;" onclick="confirmReemail('${siteId}','${matId}','${jsAttr(supplier.name)}')">Confirm &amp; Send</button>
      <button class="geo-modal-cancel" onclick="closeReemailPrompt()">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
};
window.closeReemailPrompt = function(){
  const ov = document.getElementById('reemailModalOverlay');
  if(ov) ov.style.display = 'none';
};
window.confirmReemail = async function(siteId, matId, supplierName){
  const input = document.getElementById('reemailAddressInput');
  const email = input ? input.value.trim() : '';
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Enter a valid email address.'); return; }
  const btn = document.getElementById('reemailConfirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  const rows = await dbSelect('materials', 'id=eq.'+matId+'&select=*');
  const material = rows && rows[0];
  if(!material){ toast('Could not find that request.'); window.closeReemailPrompt(); return; }
  try{
    const res = await sbFetch('/functions/v1/send-material-order', {method:'POST', body: JSON.stringify({
      material_id: matId, supplier_email: email, supplier_name: supplierName,
      item: material.item, qty: material.qty, site_id: siteId,
      required_for_delivery: material.required_for_delivery,
    })});
    const d = await res.json();
    if(res.ok && !d.error){
      await dbUpdate('materials', matId, {email_sent_at:new Date().toISOString()});
      const card = document.querySelector('#reemailModalOverlay .geo-modal-card');
      if(card){
        card.innerHTML = `<h3>✓ Email sent</h3><p class="stub" style="margin:0 0 16px;">The order was re-emailed to ${escapeHtml(email)}.</p><button class="darkbtn" style="width:100%;" onclick="closeReemailPrompt();render()">Done</button>`;
      } else { render(); }
    } else {
      console.error('send-material-order failed:', d.error || res.status);
      toast('Re-email failed — '+(d.error ? String(d.error).slice(0,140) : 'check it manually.'));
      if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
    }
  }catch(e){
    console.error('send-material-order failed:', e);
    toast('Re-email failed — could not reach the server.');
    if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
  }
};
// Edit a material request (item, quantity, required-by date). Built as its
// own pop-up outside the normal screen re-draw so typing isn't interrupted.
window.openMaterialEdit = async function(siteId, matId){
  const m = (await dbSelect('materials', 'id=eq.'+matId+'&select=*'))[0];
  if(!m){ toast('Could not find that request.'); render(); return; }
  let ov = document.getElementById('materialEditOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'materialEditOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) closeMaterialEdit(); };
  const alreadySent = m.status==='sent' || (m.status==='closed' && m.merchant);
  ov.innerHTML = `
    <div class="geo-modal-card">
      <h3>Edit material request</h3>
      ${alreadySent ? `<p class="stub" style="margin:0 0 10px;color:var(--warn);">This order has already been sent. Changing it here does not tell the supplier — use Send again if they need the new details.</p>` : ''}
      <div class="formfield"><label class="field-label">Item</label><input type="text" id="matEditItem" value="${escapeHtml(m.item||'')}"></div>
      <div class="formfield"><label class="field-label">Quantity</label><input type="text" id="matEditQty" value="${escapeHtml(m.qty||'')}"></div>
      <div class="formfield" onclick="openDatePickerRow(this)"><label class="field-label">Required by (optional)</label><input type="date" id="matEditRequiredBy" value="${escapeHtml(m.required_by_date||'')}"></div>
      <button class="darkbtn" id="matEditSaveBtn" style="width:100%;margin-bottom:8px;" onclick="saveMaterialEdit('${siteId}','${matId}')">Save changes</button>
      <button class="geo-modal-cancel" onclick="closeMaterialEdit()">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
  render();
};
window.closeMaterialEdit = function(){
  const ov = document.getElementById('materialEditOverlay');
  if(ov){ ov.style.display = 'none'; ov.innerHTML = ''; }
};
window.saveMaterialEdit = async function(siteId, matId){
  const item = (document.getElementById('matEditItem').value||'').trim();
  const qty = (document.getElementById('matEditQty').value||'').trim();
  const requiredBy = document.getElementById('matEditRequiredBy').value || null;
  if(!item){ toast('Enter the item.'); return; }
  const btn = document.getElementById('matEditSaveBtn');
  if(btn){ if(btn.disabled) return; btn.disabled = true; btn.textContent = 'Saving…'; }
  const row = await dbUpdate('materials', matId, {item, qty: qty||'1', required_by_date: requiredBy});
  if(!row){ if(btn){ btn.disabled = false; btn.textContent = 'Save changes'; } if(row===undefined) toast('Could not save — you may not have permission to change this request.'); return; }
  closeMaterialEdit();
  logSiteActivity(siteId, 'material_request_edited', `Edited material request "${item}"`);
  toast('Request updated');
  render();
};
window.deleteMaterial = async function(siteId, matId){
  if(!await customConfirm('Delete this material request? This can\'t be undone.')) return;
  const rows = await dbSelect('materials', 'id=eq.'+matId+'&select=item');
  const item = rows[0] && rows[0].item;
  const ok = await dbDelete('materials', matId);
  if(ok){ toast('Material request deleted'); logSiteActivity(siteId, 'material_request_deleted', `Deleted material request "${item||''}"`); render(); }
};
