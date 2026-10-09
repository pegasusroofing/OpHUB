/* ================= DELIVERY SCHEDULE (PM/admin side) ================= */
// A 7-day, slot-by-slot view. Days in the past default collapsed (nothing
// to plan there any more); today and future days default expanded. Each
// slot can hold more than one delivery — the ▲▼ buttons both reorder
// within a slot AND, at the top/bottom of a slot, hop the delivery into
// the adjacent time slot, which is what "moving the tile changes its
// time" means here. Sub-priority (1..n) is only ever shown/stored when a
// slot actually has more than one delivery in it — see resequenceSlot.
let pmDeliveryDefaultSlot = null; // same idea for the time slot, when added from a time row's +
window.addDeliveryFrom = function(dateISO, slotKey){ pmDeliveryDefaultDate = dateISO; pmDeliveryDefaultSlot = slotKey||null; deliveryFormDraft = null; go('#/delivery/new'); };
let pmDeliveryDefaultDate = null; // set right before go('#/delivery/new') so the form defaults to the day it was opened from
// Delivery Schedule has two entry points (Admin Centre's quick link, and the
// Delivery Dashboard tile off the Dashboard chooser) that land on the same
// '#/delivery' route — so its back arrow can't be a fixed hash. Whichever
// entry point was actually tapped sets this right before navigating in, and
// renderDeliverySchedulePM's shell() reads it back, instead of always going
// to Admin Centre regardless of where you came from.
let deliveryScheduleBackHash = '#/team';
async function resequenceSlot(dateISO, slotKey){
  const rows = await dbSelect('delivery_tasks', 'org_id=eq.'+ME.org_id+'&scheduled_date=eq.'+dateISO+'&time_slot=eq.'+slotKey);
  rows.sort((a,b)=>((b.high_priority?1:0)-(a.high_priority?1:0)) || (a.sub_priority==null?999:a.sub_priority)-(b.sub_priority==null?999:b.sub_priority) || (a.created_at<b.created_at?-1:1));
  for(let i=0;i<rows.length;i++){
    const want = rows.length>1 ? i+1 : null;
    if(rows[i].sub_priority !== want){ await dbUpdate('delivery_tasks', rows[i].id, {sub_priority:want}); }
  }
}
window.moveDeliveryTask = async function(taskId, dir){
  const rows = await dbSelect('delivery_tasks', 'id=eq.'+taskId);
  const task = rows[0];
  if(!task) return;
  const dateISO = task.scheduled_date;
  const oldSlot = task.time_slot;
  const slotIdx = DELIVERY_TIME_SLOTS.findIndex(s=>s.key===oldSlot);
  const slotTasks = (await dbSelect('delivery_tasks', 'org_id=eq.'+ME.org_id+'&scheduled_date=eq.'+dateISO+'&time_slot=eq.'+oldSlot))
    .sort((a,b)=>((b.high_priority?1:0)-(a.high_priority?1:0)) || (a.sub_priority==null?999:a.sub_priority)-(b.sub_priority==null?999:b.sub_priority) || (a.created_at<b.created_at?-1:1));
  const pos = slotTasks.findIndex(t=>t.id===taskId);
  if(dir==='up'){
    if(pos>0){
      const other = slotTasks[pos-1];
      await dbUpdate('delivery_tasks', task.id, {sub_priority: other.sub_priority});
      await dbUpdate('delivery_tasks', other.id, {sub_priority: task.sub_priority});
    } else if(slotIdx>0){
      const destSlot = DELIVERY_TIME_SLOTS[slotIdx-1].key;
      await dbUpdate('delivery_tasks', task.id, {time_slot: destSlot, sub_priority: 999}); // 999 = "goes last" until resequenceSlot renumbers it
      await resequenceSlot(dateISO, oldSlot);
      await resequenceSlot(dateISO, destSlot);
    } else { toast('Already the earliest slot of the day.'); return; }
  } else {
    if(pos < slotTasks.length-1){
      const other = slotTasks[pos+1];
      await dbUpdate('delivery_tasks', task.id, {sub_priority: other.sub_priority});
      await dbUpdate('delivery_tasks', other.id, {sub_priority: task.sub_priority});
    } else if(slotIdx < DELIVERY_TIME_SLOTS.length-1){
      const destSlot = DELIVERY_TIME_SLOTS[slotIdx+1].key;
      await dbUpdate('delivery_tasks', task.id, {time_slot: destSlot, sub_priority: -999}); // -999 = "goes first" until resequenceSlot renumbers it
      await resequenceSlot(dateISO, oldSlot);
      await resequenceSlot(dateISO, destSlot);
    } else { toast('Already the last slot of the day.'); return; }
  }
  render();
};
function deliveryTaskCardHtml(t, opts){
  const showOrder = opts.slotCount>1;
  return `
    <div class="sitecard" style="flex-wrap:wrap;${t.status==='completed'?'opacity:.6;':''}">
      <div class="info" style="cursor:pointer;" onclick="deliveryFormDraft=null;go('#/delivery/edit/${t.id}')">
        <div class="name">${t.high_priority?'<span style="color:var(--brand1);font-weight:800;">1st DROP · </span>':''}${escapeHtml(t.site_id ? ((SITES.find(s=>s.id===t.site_id)||{}).name||'Unknown site') : deliverySiteLabel(t))}${t.sub_site_label ? '<br>'+subAddrPill(t.sub_site_label) : ''}${!t.site_id ? ' <span class="stub">(not on app)</span>' : ''}${showOrder?` <span class="stub">(order ${t.sub_priority||'?'})</span>`:''}${t.needs_completing?' <span style="color:var(--warn);font-weight:800;">⚠ Needs completing</span>':''}</div>
        <div class="addr">${escapeHtml(t.description||'')}${t.status==='completed'?' · ✓ Completed':''}</div>
        <div class="addr" style="font-weight:700;color:var(--ink);">${escapeHtml(deliveryCollectionLine(t))}</div>
        <div class="addr">🚐 ${t.driver_id && PROFILES[t.driver_id] ? escapeHtml(PROFILES[t.driver_id].name) : '<span style="color:var(--warn);">Unassigned</span>'}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;" onclick="event.stopPropagation()">
        <span class="homebtn" style="width:26px;height:26px;font-size:13px;" onclick="moveDeliveryTask('${t.id}','up')">▲</span>
        <span class="homebtn" style="width:26px;height:26px;font-size:13px;" onclick="moveDeliveryTask('${t.id}','down')">▼</span>
      </div>
    </div>
  `;
}
let deliveryExportBusy = null; // null | 'xlsx' | 'pdf' — which export (if any) is currently building
// Pulls every delivery task across the given ISO dates, in the same
// date→time-slot→sub_priority order the on-screen week view uses, so the
// export always matches what the PM is looking at when they tap it.
async function deliveryScheduleExportRows(daysISO){
  const [tasks, suppliers] = await Promise.all([
    dbSelect('delivery_tasks', 'org_id=eq.'+ME.org_id+'&scheduled_date=in.('+daysISO.join(',')+')&order=scheduled_date.asc,time_slot.asc'),
    dbSelect('suppliers', 'org_id=eq.'+ME.org_id),
    loadAllProfiles(),
  ]);
  const supplierName = {}; suppliers.forEach(s=>{ supplierName[s.id]=s.name; });
  tasks.forEach(t=>{ t._supplierName = supplierName[t.supplier_id]; });
  const slotOrder = {}; DELIVERY_TIME_SLOTS.forEach((s,i)=>slotOrder[s.key]=i);
  tasks.sort((a,b)=>{
    if(a.scheduled_date!==b.scheduled_date) return a.scheduled_date<b.scheduled_date?-1:1;
    if(!!a.high_priority !== !!b.high_priority) return a.high_priority ? -1 : 1;
    const so = (slotOrder[a.time_slot]??99)-(slotOrder[b.time_slot]??99);
    if(so) return so;
    return (a.sub_priority==null?999:a.sub_priority)-(b.sub_priority==null?999:b.sub_priority);
  });
  const slotLabel = {}; DELIVERY_TIME_SLOTS.forEach(s=>slotLabel[s.key]=s.label);
  return tasks.map(t=>({
    date: new Date(t.scheduled_date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}),
    time: slotLabel[t.time_slot] || t.time_slot || '',
    site: deliverySiteFullLabel(t),
    description: t.description || '',
    collection: deliveryCollectionLabel(t),
    driver: (t.driver_id && PROFILES[t.driver_id]) ? PROFILES[t.driver_id].name : 'Unassigned',
    priority: t.high_priority ? '1st drop' : '',
    status: t.status==='completed' ? 'Completed' : (t.needs_completing ? 'Needs completing' : 'Scheduled'),
  }));
}
window.exportDeliveryScheduleExcel = async function(daysISO, weekLabel){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return null; }
  if(deliveryExportBusy) return;
  deliveryExportBusy = 'xlsx'; render();
  try{
    const rows = await deliveryScheduleExportRows(daysISO);
    if(!rows.length){ toast('No deliveries in this week to export.'); return; }
    const filename = exportFilename('', 'Delivery Schedule', 'xlsx');
    const cols = ['Date','Drop','Site','Description','Collection From','Driver','Priority','Status'];
    const rowVals = r=>[r.date,r.time,r.site,r.description,r.collection,r.driver,r.priority,r.status];
    if((await loadLib('ExcelJS'))){
      try{
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Delivery Schedule');
        ws.columns = [{width:16},{width:10},{width:24},{width:30},{width:18},{width:18},{width:9},{width:16}];
        ws.mergeCells(1,1,1,cols.length);
        ws.getCell('A1').value = ((ORG && ORG.name) || 'OpHUB') + ' — Delivery Schedule (' + weekLabel + ')';
        ws.getCell('A1').font = {bold:true, size:13};
        const headerRow = ws.addRow(cols);
        headerRow.eachCell(cell=>{
          cell.font = {bold:true, color:{argb:'FFFFFFFF'}};
          cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF'+((ORG && ORG.color_primary) || DEFAULT_BRAND1).replace('#','').toUpperCase()}};
        });
        rows.forEach(r=>ws.addRow(rowVals(r)));
        const buffer = await wb.xlsx.writeBuffer();
        await deliverExcelBuffer(buffer, filename);
        return;
      }catch(e){ /* fall through to the plain SheetJS export below */ }
    }
    const ws = XLSX.utils.aoa_to_sheet([cols, ...rows.map(rowVals)]);
    ws['!cols'] = [{wch:16},{wch:10},{wch:24},{wch:30},{wch:18},{wch:18},{wch:9},{wch:16}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery Schedule');
    await deliverExcelFile(wb, filename);
  }catch(e){ console.error(e); toast('Could not build the export — please try again.'); }
  finally{ deliveryExportBusy = null; render(); } // finally: the early returns above used to leave the buttons stuck on "Building…"
};
window.exportDeliverySchedulePdf = async function(daysISO, weekLabel){
  if(deliveryExportBusy) return;
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  deliveryExportBusy = 'pdf'; render();
  try{
    const rows = await deliveryScheduleExportRows(daysISO);
    if(!rows.length){ toast('No deliveries in this week to export.'); return; }
    const pdfDoc = await PDFLib.PDFDocument.create();
    const fonts = await havsPdfFonts(pdfDoc);
    const {bold, reg, INK, SLATE, LINE} = fonts;
    const logoImg = await havsFetchLogoImg(pdfDoc);
    const PAGE_W = 841.89, PAGE_H = 595.28, MARGIN = 40, CONTENT_W = PAGE_W-2*MARGIN;
    const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1);
    const WHITE = PDFLib.rgb(1,1,1);
    const cols = [
      {label:'Date', w:0.11}, {label:'Drop', w:0.08}, {label:'Site', w:0.19}, {label:'Description', w:0.24},
      {label:'Collection From', w:0.15}, {label:'Driver', w:0.13}, {label:'Status', w:0.10},
    ];
    let page, y;
    function drawHeader(){
      page.drawRectangle({x:0, y:PAGE_H-76, width:PAGE_W, height:76, color:BRAND});
      if(logoImg){
        const dim = logoImg.scale(1); const s = 40/Math.max(dim.width, dim.height);
        const w = dim.width*s, h = dim.height*s;
        page.drawRectangle({x:MARGIN, y:PAGE_H-76, width:40, height:40, color:WHITE});
        page.drawImage(logoImg, {x:MARGIN+(40-w)/2, y:PAGE_H-76+(40-h)/2, width:w, height:h});
      }
      const textX = logoImg ? MARGIN+52 : MARGIN;
      page.drawText('DELIVERY SCHEDULE', {x:textX, y:PAGE_H-34, size:9, font:bold, color:WHITE, opacity:0.85});
      page.drawText(((ORG && ORG.name) || ''), {x:textX, y:PAGE_H-54, size:13, font:bold, color:WHITE});
      page.drawText(weekLabel, {x:textX, y:PAGE_H-76, size:9.5, font:reg, color:WHITE, opacity:0.9});
    }
    function drawFooter(){
      page.drawLine({start:{x:MARGIN,y:26}, end:{x:PAGE_W-MARGIN,y:26}, thickness:0.75, color:PDFLib.rgb(0.85,0.84,0.80)});
      page.drawText('Generated via OpHUB', {x:MARGIN, y:14, size:8, font:reg, color:SLATE});
    }
    function drawColHeaders(){
      let x = MARGIN;
      cols.forEach(c=>{ page.drawText(c.label, {x, y, size:8.5, font:bold, color:SLATE}); x += c.w*CONTENT_W; });
      y -= 8;
      page.drawLine({start:{x:MARGIN,y}, end:{x:PAGE_W-MARGIN,y}, thickness:0.75, color:LINE});
      y -= 14;
    }
    function newPage(){ page = pdfDoc.addPage([PAGE_W,PAGE_H]); drawHeader(); drawFooter(); y = PAGE_H-98; drawColHeaders(); }
    function ensureSpace(h){ if(y-h<40) newPage(); }
    newPage();
    rows.forEach(r=>{
      ensureSpace(16);
      let x = MARGIN;
      const vals = [r.date, r.time, r.site, r.description, r.collection, r.driver, r.status];
      vals.forEach((v,i)=>{
        const c = cols[i];
        const maxChars = Math.floor((c.w*CONTENT_W)/4.6);
        let text = String(v||'');
        if(text.length>maxChars) text = text.slice(0,maxChars-1)+'…';
        page.drawText(text, {x, y, size:8, font:reg, color: r.priority==='High' && i===2 ? PDFLib.rgb(0.7,0.15,0.15) : INK});
        x += c.w*CONTENT_W;
      });
      y -= 15;
    });
    const bytes = await pdfDoc.save();
    await deliverPdf(bytes, exportFilename('', 'Delivery Schedule', 'pdf'));
  }catch(e){ console.error(e); toast('Could not build the export — please try again.'); }
  finally{ deliveryExportBusy = null; render(); } // finally: the early returns above used to leave the buttons stuck on "Building…"
};
// One day at a time: ‹ and › step back/forward a day, "Jump to" picks any
// date, "Today" comes straight back. (It used to list a whole week of
// collapsible days and the arrows moved a week at a time.) The Excel/PDF
// exports still cover the 7 days starting from the day on screen.
let pmDeliveryDayISO = null; // null = today
window.pmDeliveryStep = function(d){
  const cur = new Date((pmDeliveryDayISO || localISODate(new Date()))+'T12:00:00');
  cur.setDate(cur.getDate()+d);
  const iso = localISODate(cur);
  pmDeliveryDayISO = iso===localISODate(new Date()) ? null : iso;
  render();
};
window.pmDeliveryJump = function(iso){
  if(!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
  pmDeliveryDayISO = iso===localISODate(new Date()) ? null : iso;
  render();
};
async function renderDeliverySchedulePM(){
  const __gen = RENDER_GEN;
  const todayISO = localISODate(new Date());
  const iso = pmDeliveryDayISO || todayISO;
  const day = new Date(iso+'T12:00:00');
  const days = Array.from({length:7}, (_,i)=>{ const d = new Date(day); d.setDate(d.getDate()+i); return d; });
  const daysISO = days.map(localISODate);
  const [tasks, suppliers] = await Promise.all([
    dbSelect('delivery_tasks', 'org_id=eq.'+ME.org_id+'&scheduled_date=eq.'+iso+'&order=time_slot.asc'),
    dbSelect('suppliers', 'org_id=eq.'+ME.org_id),
    loadAllProfiles(),
  ]);
  const supplierName = {}; suppliers.forEach(s=>{ supplierName[s.id]=s.name; });
  tasks.forEach(t=>{ t._supplierName = supplierName[t.supplier_id]; });
  const bySlot = {}; DELIVERY_TIME_SLOTS.forEach(s=>bySlot[s.key]=[]);
  tasks.forEach(t=>{ if(bySlot[t.time_slot]) bySlot[t.time_slot].push(t); });
  Object.keys(bySlot).forEach(k=>bySlot[k].sort((a,b)=>((b.high_priority?1:0)-(a.high_priority?1:0)) || (a.sub_priority==null?999:a.sub_priority)-(b.sub_priority==null?999:b.sub_priority)));
  const dayLabel = day.toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'short'}) + (iso===todayISO ? ' (Today)' : (day.getFullYear()!==new Date().getFullYear() ? ' '+day.getFullYear() : ''));
  const weekLabel = days[0].toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) + ' – ' + days[6].toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <button type="button" style="flex:none;width:52px;height:52px;border-radius:14px;background:var(--brand1);color:var(--brand1-text);border:none;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800;line-height:1;padding:0 0 4px;cursor:pointer;box-shadow:var(--shadow-card);" title="Previous day" aria-label="Previous day" onclick="pmDeliveryStep(-1)">‹</button>
      <div style="flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:center;font-weight:700;font-size:15px;">${escapeHtml(dayLabel)} <span class="stub" style="font-weight:400;">(${tasks.length})</span></div>
      <button type="button" style="flex:none;width:52px;height:52px;border-radius:14px;background:var(--brand1);color:var(--brand1-text);border:none;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800;line-height:1;padding:0 0 4px;cursor:pointer;box-shadow:var(--shadow-card);" title="Next day" aria-label="Next day" onclick="pmDeliveryStep(1)">›</button>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
      <label class="field-label" for="pmDeliveryJumpInput" style="margin:0;flex:none;">Jump to</label>
      <input type="date" id="pmDeliveryJumpInput" value="${iso}" style="flex:1;min-width:0;margin:0;" onchange="pmDeliveryJump(this.value)">
      ${iso!==todayISO ? `<button class="ghostbtn" style="width:auto;flex:none;margin:0;padding:9px 14px;" onclick="pmDeliveryJump('${todayISO}')">Today</button>` : ''}
    </div>
    <button class="darkbtn" style="width:100%;margin-bottom:10px;" onclick="addDeliveryFrom('${iso}')">+ Add Delivery</button>
    <button class="ghostbtn" style="width:100%;margin-bottom:10px;" onclick="driverScheduleDateOffset=${Math.round((new Date(iso+'T12:00:00') - new Date(todayISO+'T12:00:00'))/86400000)};go('#/delivery/driver-view')">👁 Driver view</button>
    <div class="row-gap" style="margin-bottom:4px;">
      <button class="ghostbtn" style="flex:1;" ${deliveryExportBusy?'disabled':''} onclick="exportDeliveryScheduleExcel(${escapeHtml(JSON.stringify(daysISO))},'${jsAttr(weekLabel)}')">${deliveryExportBusy==='xlsx'?'Building…':'📊 Export Excel'}</button>
      <button class="ghostbtn" style="flex:1;" ${deliveryExportBusy?'disabled':''} onclick="exportDeliverySchedulePdf(${escapeHtml(JSON.stringify(daysISO))},'${jsAttr(weekLabel)}')">${deliveryExportBusy==='pdf'?'Building…':'📄 Export PDF'}</button>
    </div>
    <p class="stub" style="margin:0 0 14px;text-align:center;">Exports cover 7 days from this day (${escapeHtml(weekLabel)}).</p>
    ${DELIVERY_TIME_SLOTS.map(slot=>`
      <p class="sectiontitle" style="margin-top:12px;display:flex;align-items:center;">${slot.label}<span class="homebtn" title="Add a delivery in this drop" style="margin-left:auto;flex:none;width:26px;height:26px;font-size:16px;font-weight:800;" onclick="addDeliveryFrom('${iso}','${slot.key}')">+</span></p>
      ${bySlot[slot.key].length ? bySlot[slot.key].map(t=>deliveryTaskCardHtml(t, {slotCount:bySlot[slot.key].length})).join('') : `<div class="empty">Nothing in this drop.</div>`}
    `).join('')}
  `, {title:'Delivery Schedule', back:deliveryScheduleBackHash});
}
let deliveryFormBusy = false, deliveryFormDraft = null, deliveryFormSiteOperatives = [], deliveryFormPhotoBusy = false, deliveryFormDrivers = [];
async function loadDeliveryFormSiteOperatives(siteId){
  if(!siteId){ deliveryFormSiteOperatives = []; return; }
  await loadAllProfiles();
  const rows = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
  deliveryFormSiteOperatives = rows.map(r=>PROFILES[r.user_id]).filter(p=>p && p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
}
async function renderDeliveryForm(taskId){
  const __gen = RENDER_GEN;
  await loadAllProfiles();
  const suppliers = await dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&order=name.asc');
  deliveryFormDrivers = Object.values(PROFILES).filter(p=>p && p.role==='driver').sort((a,b)=>a.name.localeCompare(b.name));
  if(!deliveryFormDraft || deliveryFormDraft._id !== (taskId||'new')){
    if(taskId){
      const rows = await dbSelect('delivery_tasks', 'id=eq.'+taskId);
      const t = rows[0];
      if(!t){ toast('Delivery not found'); go('#/delivery'); return; }
      deliveryFormDraft = {_id:taskId, _manualSite:!t.site_id, manual_site_name:t.manual_site_name||'', manual_site_address:t.manual_site_address||'', _origDate:t.scheduled_date, _origSlot:t.time_slot, _origDriverId:t.driver_id||'', _calendarEventId:t.calendar_event_id||null, site_id:t.site_id||'', description:t.description||'', scheduled_date:t.scheduled_date, time_slot:t.time_slot, collection_type:t.collection_type, supplier_id:t.supplier_id||'', collection_address_manual:t.collection_address_manual||'', site_contact_id:t.site_contact_id||'', photo_path:t.photo_path||null, photo_paths:deliveryPhotos(t), high_priority:!!t.high_priority, driver_id:t.driver_id||'', _status:t.status, _completedAt:t.completed_at, _completedBy:t.completed_by, _completionPhotoPath:t.completion_photo_path, _completionPhotos:deliveryCompletionPhotos(t)};
    } else {
      deliveryFormDraft = {_id:'new', _manualSite:false, manual_site_name:'', manual_site_address:'', photo_paths:[], site_id:'', description:'', scheduled_date:pmDeliveryDefaultDate||localISODate(new Date()), time_slot:pmDeliveryDefaultSlot||'7am', collection_type:'yard', supplier_id:'', collection_address_manual:'', site_contact_id:'', photo_path:null, high_priority:false, driver_id:''};
      pmDeliveryDefaultDate = null; pmDeliveryDefaultSlot = null;
    }
    if(taskId){ const t0 = (await dbSelect('delivery_tasks','id=eq.'+taskId+'&select=sub_site_id'))[0]; deliveryFormDraft.sub_site_id = (t0 && t0.sub_site_id) || ''; }
    await loadDeliveryFormSiteOperatives(deliveryFormDraft.site_id);
  }
  if(deliveryFormDraft.site_id && siteIsMulti(deliveryFormDraft.site_id) && !SUB_ADDR_CACHE[deliveryFormDraft.site_id]) await loadSubAddrs(deliveryFormDraft.site_id);
  // Single driver in the org? Assign them automatically — nothing for the
  // PM to pick. More than one, and it's ambiguous who's doing this
  // delivery, so a driver must be chosen explicitly (see saveDeliveryTask).
  // Only for a brand new delivery: an existing one that has been left (or
  // set) unassigned stays that way rather than being quietly re-assigned.
  if(deliveryFormDrivers.length===1 && !deliveryFormDraft.driver_id && deliveryFormDraft._id==='new'){
    deliveryFormDraft.driver_id = deliveryFormDrivers[0].id;
  }
  // 'none' = deliberately unassigned (an existing delivery with no driver
  // opens that way too), as opposed to '' = nobody has chosen yet.
  if(!deliveryFormDraft.driver_id && deliveryFormDraft._id!=='new') deliveryFormDraft.driver_id = 'none';
  const draft = deliveryFormDraft;
  const sites = SITES.filter(s=>siteStatusKey(s)!=='closed').sort((a,b)=>a.name.localeCompare(b.name));
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    ${draft._status==='completed' ? `
    <div class="card" style="border-color:var(--ok);margin-bottom:16px;">
      <p style="margin:0 0 6px;font-weight:800;color:var(--ok);">✓ Completed${draft._completedAt?' '+new Date(draft._completedAt).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):''}</p>
      ${draft._completedBy && PROFILES[draft._completedBy] ? `<p class="stub" style="margin:0 0 6px;">By ${escapeHtml(PROFILES[draft._completedBy].name)}</p>` : ''}
      ${(draft._completionPhotos||[]).length ? deliveryPhotoThumbsHtml(draft._completionPhotos, 90) : `<p class="stub" style="margin:0;">No completion photo on file.</p>`}
      ${draft._id ? `<button class="ghostbtn" style="width:100%;margin-top:10px;" onclick="reopenDeliveryTask('${draft._id}')">↩ Re-open delivery</button>` : ''}
    </div>
    ` : ''}
    <div class="formfield"><label class="field-label">Site</label>
      ${sites.length>1 ? `<input type="text" id="deliverySiteFilter" placeholder="Type to filter sites — name, address or postcode…" value="${escapeHtml(deliveryFormSiteFilter)}" oninput="filterDeliverySiteOptions(this.value)" style="margin-bottom:6px;">` : ''}
      <select id="deliverySiteSelect" onchange="onDeliveryFormSiteChange(this.value)">
        ${deliverySiteOptionsHtml(sites, draft._manualSite ? '__manual' : draft.site_id, deliveryFormSiteFilter)}
      </select>
      <p class="stub" id="deliverySiteFilterNote" style="margin:4px 0 0;display:none;"></p>
    </div>
    ${!draft._manualSite && draft.site_id ? subAddrSelectHtml('deliverySubAddr', draft.site_id, draft.sub_site_id, "deliveryFormDraft.sub_site_id=this.value", 'Which address on this job?') : ''}
    ${draft._manualSite ? `
    <div class="card" style="margin-bottom:12px;">
      <p class="stub" style="margin:0 0 8px;">For a job that isn't set up on the app. Type the details the driver needs.</p>
      <div class="formfield" style="margin-top:0;"><label class="field-label">Job / site name</label>
        <input type="text" value="${escapeHtml(draft.manual_site_name||'')}" oninput="deliveryFormDraft.manual_site_name=this.value" placeholder="e.g. Smith — garage roof">
      </div>
      <div class="formfield"><label class="field-label">Full address and postcode</label>
        <textarea rows="2" oninput="deliveryFormDraft.manual_site_address=this.value" placeholder="e.g. 14 High Street, Croydon, CR0 1AB">${escapeHtml(draft.manual_site_address||'')}</textarea>
      </div>
    </div>` : ''}
    <div class="formfield"><label class="field-label">Description</label>
      <textarea rows="3" oninput="deliveryFormDraft.description=this.value" placeholder="What's needed?">${escapeHtml(draft.description)}</textarea>
    </div>
    <div class="formfield"><label class="field-label">Collection</label>
      <select onchange="onDeliveryCollectionChange(this.value)">
        <option value="yard" ${draft.collection_type==='yard'?'selected':''}>YARD</option>
        ${suppliers.map(s=>`<option value="supplier:${s.id}" ${draft.collection_type==='supplier'&&draft.supplier_id===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
        <option value="manual" ${deliveryCollectionKind(draft)==='manual'?'selected':''}>Other (type address)</option>
        <option value="none" ${deliveryCollectionKind(draft)==='none'?'selected':''}>No collection</option>
        <option value="clear" ${deliveryCollectionKind(draft)==='clear'?'selected':''}>Clear site</option>
      </select>
    </div>
    ${deliveryCollectionKind(draft)==='manual' ? `
    <div class="formfield"><label class="field-label">Collection address</label>
      <input type="text" value="${escapeHtml(draft.collection_address_manual)}" oninput="deliveryFormDraft.collection_address_manual=this.value" placeholder="Address or pickup details">
    </div>` : ''}
    <div class="formfield"><label class="field-label">Site contact</label>
      ${(()=>{
        // Grouped by role (the group heading shows in bold in the list):
        // Project Managers and Site Managers from the whole company, then
        // the operatives assigned to the chosen site.
        const byName = (x,y)=>x.name.localeCompare(y.name);
        const everyone = Object.values(PROFILES).filter(p=>p && (!p.org_id || p.org_id===ME.org_id)); // the loaded people list is already this company only
        const groups = [
          {label:'Project Managers', people: everyone.filter(p=>p.role==='pm').sort(byName)},
          {label:'Site Managers', people: everyone.filter(p=>p.role==='site_manager').sort(byName)},
          {label:'Operatives on this site', people: deliveryFormSiteOperatives},
        ].filter(g=>g.people.length);
        const opt = o=>`<option value="${o.id}" ${draft.site_contact_id===o.id?'selected':''}>${escapeHtml(o.name)}${o.phone?' — '+escapeHtml(o.phone):' (no phone saved)'}</option>`;
        // Someone chosen earlier who no longer fits a group still shows, so saving doesn't quietly drop them.
        const listed = new Set(groups.flatMap(g=>g.people.map(x=>x.id)));
        const orphan = draft.site_contact_id && !listed.has(draft.site_contact_id) ? PROFILES[draft.site_contact_id] : null;
        return `<select onchange="deliveryFormDraft.site_contact_id=this.value">
        <option value="">None</option>
        ${orphan ? opt(orphan) : ''}
        ${groups.map(g=>`<optgroup label="${escapeHtml(g.label)}">${g.people.map(opt).join('')}</optgroup>`).join('')}
      </select>`;
      })()}
      ${draft.site_id && !deliveryFormSiteOperatives.length ? `<p class="stub" style="margin-top:4px;">No operatives assigned to this site yet.</p>` : ''}
    </div>
    <div class="formfield" style="overflow:hidden;"><label class="field-label">Date</label>
      <input type="date" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;display:block;" value="${draft.scheduled_date}" onchange="deliveryFormDraft.scheduled_date=this.value">
    </div>
    <div class="formfield"><label class="field-label">Drop</label>
      <select onchange="deliveryFormDraft.time_slot=this.value">
        ${DELIVERY_TIME_SLOTS.map(s=>`<option value="${s.key}" ${draft.time_slot===s.key?'selected':''}>${s.label}</option>`).join('')}
      </select>
    </div>
    ${deliveryFormDrivers.length ? `
    <div class="formfield"><label class="field-label">Driver</label>
      <select onchange="deliveryFormDraft.driver_id=this.value">
        ${deliveryFormDrivers.length>1 ? `<option value="" ${!draft.driver_id?'selected':''}>Choose a driver…</option>` : ''}
        ${deliveryFormDrivers.map(dr=>`<option value="${dr.id}" ${draft.driver_id===dr.id?'selected':''}>${escapeHtml(dr.name)}</option>`).join('')}
        <option value="none" ${draft.driver_id==='none'?'selected':''}>Unassigned — no driver yet</option>
      </select>
      <p class="stub" style="margin:4px 0 0;">An unassigned delivery shows on every driver's schedule until one is chosen.</p>
    </div>
    ` : `
    <p class="stub" style="margin:0 0 12px;color:var(--warn);">No delivery drivers set up yet — this will sit unassigned until one is added.</p>
    `}
    <div class="formfield">
      <label class="field-label">Photos (optional)</label>
      ${deliveryPhotoThumbsHtml(draft.photo_paths||[], 80, i=>`removeDeliveryFormPhoto(${i})`)}
      <label class="ghostbtn" style="display:block;text-align:center;cursor:pointer;${deliveryFormPhotoBusy?'opacity:.6;pointer-events:none;':''}">
        ${deliveryFormPhotoBusy ? 'Uploading…' : ((draft.photo_paths||[]).length ? '📷 Add more photos' : '📷 Add photos')}
        <input type="file" accept="image/*" multiple style="display:none;" onchange="onDeliveryPhotoChosen(this)" ${deliveryFormPhotoBusy?'disabled':''}>
      </label>
      <p class="stub" style="margin:4px 0 0;">You can pick several at once.</p>
    </div>
    <div class="card" style="cursor:pointer;" onclick="deliveryFormDraft.high_priority=!deliveryFormDraft.high_priority;if(deliveryFormDraft.high_priority&&DELIVERY_TIME_SLOTS[0])deliveryFormDraft.time_slot=DELIVERY_TIME_SLOTS[0].key;render()">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" ${draft.high_priority?'checked':''} onclick="event.stopPropagation();deliveryFormDraft.high_priority=this.checked;if(this.checked&&DELIVERY_TIME_SLOTS[0]){deliveryFormDraft.time_slot=DELIVERY_TIME_SLOTS[0].key;render();}">
        <span style="font-weight:800;color:var(--brand1);">1st DROP</span>
      </label>
      <p class="stub" style="margin:6px 0 0;">Tick this if it must be the driver's first delivery of the day. Only one delivery can be the 1st drop each day — it shows at the top of the driver's list.</p>
    </div>
    <button class="darkbtn" style="width:100%;margin-top:16px;" ${deliveryFormBusy?'disabled':''} onclick="saveDeliveryTask()">${deliveryFormBusy?'Saving…':(taskId?'Save Changes':'Add to Delivery Schedule')}</button>
    ${taskId ? `<button class="ghostbtn" style="width:100%;margin-top:8px;color:var(--warn);" onclick="deleteDeliveryTask('${taskId}')">Delete Delivery</button>` : ''}
  `, {title: taskId?'Edit Delivery':'Add Delivery', back:'#/delivery'});
}
// Text filter over the Site list on the delivery form. The list is rebuilt
// in place (no screen re-draw, so the keyboard stays up); the site already
// chosen always stays in the list so filtering never silently un-picks it.
let deliveryFormSiteFilter = '';
let deliveryFormSiteList = [];
function deliverySiteOptionsHtml(sites, selectedId, filterText){
  deliveryFormSiteList = sites;
  const q = (filterText||'').trim().toLowerCase();
  const shown = q ? sites.filter(x=>x.id===selectedId || [x.name, x.address, x.postcode].some(v=>(v||'').toLowerCase().includes(q))) : sites;
  return `<option value="">${q ? (shown.length ? 'Choose from '+shown.length+' matching site'+(shown.length===1?'':'s')+'…' : 'No sites match') : 'Choose a site…'}</option>`
    + `<option value="__manual" ${selectedId==='__manual'?'selected':''}>✏️ Other — a job not on the app (type it in)</option>`
    + shown.map(x=>`<option value="${x.id}" ${selectedId===x.id?'selected':''}>${escapeHtml(x.name)}</option>`).join('');
}
window.filterDeliverySiteOptions = function(val){
  deliveryFormSiteFilter = val;
  const sel = document.getElementById('deliverySiteSelect');
  if(!sel) return;
  const current = deliveryFormDraft ? (deliveryFormDraft._manualSite ? '__manual' : deliveryFormDraft.site_id) : '';
  sel.innerHTML = deliverySiteOptionsHtml(deliveryFormSiteList, current, val);
  const note = document.getElementById('deliverySiteFilterNote');
  if(note){
    const n = Math.max(0, sel.options.length-2); // minus the "Choose…" and "Other" rows
    note.style.display = val.trim() ? '' : 'none';
    note.textContent = n ? n+(n===1?' site matches':' sites match')+' — pick from the list above.' : 'No sites match that.';
  }
};
window.onDeliveryFormSiteChange = async function(siteId){
  deliveryFormSiteFilter = '';
  const manual = siteId==='__manual';
  deliveryFormDraft._manualSite = manual;
  deliveryFormDraft.site_id = manual ? '' : siteId;
  deliveryFormDraft.site_contact_id = '';
  deliveryFormDraft.sub_site_id = '';
  if(!manual && siteIsMulti(siteId)) await loadSubAddrs(siteId);
  await loadDeliveryFormSiteOperatives(manual ? '' : siteId);
  render();
};
window.onDeliveryCollectionChange = function(val){
  if(val==='yard'){ deliveryFormDraft.collection_type='yard'; deliveryFormDraft.supplier_id=''; }
  else if(val==='manual'){
    deliveryFormDraft.collection_type='manual'; deliveryFormDraft.supplier_id='';
    // Coming back from No collection / Clear site: start with an empty address box.
    if(deliveryCollectionKind(deliveryFormDraft)!=='manual') deliveryFormDraft.collection_address_manual = '';
  }
  else if(val==='none' || val==='clear'){
    deliveryFormDraft.collection_type='manual'; deliveryFormDraft.supplier_id='';
    deliveryFormDraft.collection_address_manual = val==='none' ? DELIVERY_NO_COLLECTION : DELIVERY_CLEAR_SITE;
  }
  else { deliveryFormDraft.collection_type='supplier'; deliveryFormDraft.supplier_id=val.split(':')[1]; }
  render();
};
window.onDeliveryPhotoChosen = async function(input){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length || deliveryFormPhotoBusy) return;
  deliveryFormPhotoBusy = true; render();
  let failed = 0;
  if(!Array.isArray(deliveryFormDraft.photo_paths)) deliveryFormDraft.photo_paths = [];
  for(const file of files){
    try{
      const dataUrl = await compressImage(file);
      const path = await uploadDataUrl('site-photos', ME.org_id+'/delivery/drafts/'+crypto.randomUUID()+'.jpg', dataUrl);
      if(path) deliveryFormDraft.photo_paths.push(path); else failed++;
    }catch(e){ failed++; }
  }
  deliveryFormDraft.photo_path = deliveryFormDraft.photo_paths[0] || null;
  deliveryFormPhotoBusy = false;
  if(failed) toast(failed+' photo'+(failed===1?'':'s')+' could not be uploaded — try again.');
  render();
};
window.removeDeliveryFormPhoto = function(index){
  if(!deliveryFormDraft || !Array.isArray(deliveryFormDraft.photo_paths)) return;
  deliveryFormDraft.photo_paths.splice(index, 1);
  deliveryFormDraft.photo_path = deliveryFormDraft.photo_paths[0] || null;
  render();
};
window.saveDeliveryTask = async function(){
  const d = deliveryFormDraft;
  if(d._manualSite){
    if(!(d.manual_site_name||'').trim() && !(d.manual_site_address||'').trim()){ toast('Type the job name or address.'); return; }
  } else if(!d.site_id){ toast('Choose a site.'); return; }
  if(!d._manualSite && siteIsMulti(d.site_id) && (SUB_ADDR_CACHE[d.site_id]||[]).length && !d.sub_site_id){ toast('Choose which address on this job.'); return; }
  if(!d.description || !d.description.trim()){ toast('Add a description.'); return; }
  if(!d.scheduled_date){ toast('Choose a date.'); return; }
  if(d.collection_type==='manual' && !d.collection_address_manual.trim()){ toast('Enter a collection address.'); return; }
  if(d.collection_type==='supplier' && !d.supplier_id){ toast('Choose a supplier.'); return; }
  if(deliveryFormDrivers.length>1 && !d.driver_id){ toast('Choose a driver, or pick Unassigned.'); return; }
  // Only one first-drop high priority per day. Booking a second asks
  // whether to swap: Yes moves the flag onto this delivery (the other one
  // is un-flagged after this one saves, and whoever booked it is told); No
  // unticks it here and leaves the existing one alone.
  let highPriorityToClear = [];
  if(d.high_priority){
    const existingHigh = await dbSelect('delivery_tasks', 'org_id=eq.'+ME.org_id+'&scheduled_date=eq.'+d.scheduled_date+'&high_priority=is.true&status=eq.pending&select=id,site_id,manual_site_name,manual_site_address,description,created_by');
    highPriorityToClear = existingHigh.filter(o=>o.id!==d._id);
    if(highPriorityToClear.length){
      const o = highPriorityToClear[0];
      const swap = await customConfirm('There is already a 1st drop on this day ('+deliverySiteLabel(o)+(o.description?' — '+o.description:'')+'). Only one delivery can be the 1st drop — make this one the 1st drop instead?', {confirmLabel:'Yes', cancelLabel:'No'});
      if(!swap){
        d.high_priority = false;
        toast('Kept the existing 1st drop — this one is unticked.');
        render();
        return;
      }
    }
  }
  deliveryFormBusy = true; render();
  const payload = {
    org_id: ME.org_id,
    site_id: d._manualSite ? null : d.site_id,
    manual_site_name: d._manualSite ? ((d.manual_site_name||'').trim() || null) : null,
    manual_site_address: d._manualSite ? ((d.manual_site_address||'').trim() || null) : null,
    sub_site_id: (!d._manualSite && d.sub_site_id) ? d.sub_site_id : null,
    sub_site_label: (!d._manualSite && d.sub_site_id) ? subAddrLabel((SUB_ADDR_CACHE[d.site_id]||[]).find(a=>a.id===d.sub_site_id)) || null : null,
    description: d.description.trim(),
    collection_type: d.collection_type,
    supplier_id: d.collection_type==='supplier' ? d.supplier_id : null,
    collection_address_manual: d.collection_type==='manual' ? d.collection_address_manual.trim() : null,
    site_contact_id: d.site_contact_id || null,
    photo_path: (d.photo_paths && d.photo_paths[0]) || d.photo_path || null,
    photo_paths: Array.isArray(d.photo_paths) ? d.photo_paths : (d.photo_path ? [d.photo_path] : []),
    scheduled_date: d.scheduled_date,
    time_slot: d.time_slot,
    high_priority: !!d.high_priority,
    driver_id: (d.driver_id && d.driver_id!=='none') ? d.driver_id : null,
    needs_completing: false, // saving the full form — whether new or a quick-added stub being properly filled in — means it's no longer "needs completing"
  };
  let ok, savedId;
  if(d._id && d._id!=='new'){
    ok = await dbUpdate('delivery_tasks', d._id, payload);
    savedId = d._id;
  } else {
    payload.created_by = ME.id;
    const rows = await dbInsert('delivery_tasks', payload);
    ok = rows && rows[0];
    savedId = ok && ok.id;
  }
  deliveryFormBusy = false;
  if(ok){
    // Keep whichever slot(s) this touched fully, sequentially ordered —
    // both the slot it landed in, and (on an edit that moved it) the slot
    // it left behind, so nobody's left with a gap or an orphaned sub-order.
    if(d._origDate && (d._origDate!==payload.scheduled_date || d._origSlot!==payload.time_slot)){
      await resequenceSlot(d._origDate, d._origSlot);
    }
    await resequenceSlot(payload.scheduled_date, payload.time_slot);
    if(savedId) await syncDeliveryCalendarEvent(savedId, d._calendarEventId, payload);
    for(const o of highPriorityToClear){
      const cleared = await dbUpdate('delivery_tasks', o.id, {high_priority:false});
      if(cleared && o.created_by && o.created_by!==ME.id){
        postSystemMessageToUser(o.created_by, o.site_id, 'message', `1st drop removed from your delivery (${deliverySiteLabel(o)}: ${o.description||''}) — ${ME.name} made a different delivery the first drop for that day.`, o.id);
      }
    }
    // #notif-review-2026-09: previously a total gap — a driver was never
    // told a job had been assigned to them at all. Only fires when the
    // driver on this job is new or has just changed.
    // The driver it was taken off is told too, so it doesn't just vanish
    // from their list without explanation.
    if(d._origDriverId && d._origDriverId!==(payload.driver_id||'') && d._origDriverId!==ME.id && savedId){
      postSystemMessageToUser(d._origDriverId, payload.site_id, 'message', `A delivery is no longer assigned to you (${deliverySiteLabel(payload)}: ${payload.description})${payload.driver_id ? '' : ' — it is now unassigned'}.`, savedId);
    }
    if(payload.driver_id && payload.driver_id!==d._origDriverId && savedId){
      postSystemMessageToUser(payload.driver_id, payload.site_id, 'delivery_assigned', `You've been assigned a delivery/collection: ${payload.description}`, savedId);
    }
    toast(d._id && d._id!=='new' ? 'Delivery updated' : 'Added to delivery schedule');
    deliveryFormDraft = null;
    // Land on the day the delivery is booked for, so it's there on screen.
    if(payload.scheduled_date) pmDeliveryDayISO = payload.scheduled_date===localISODate(new Date()) ? null : payload.scheduled_date;
    go('#/delivery');
  } else {
    toast('Could not save — check your connection and try again.');
    render();
  }
};
// Every delivery on the schedule now shows up on that site's own Key Dates
// calendar too — kept in sync via delivery_tasks.calendar_event_id, same
// linked-record pattern as a Material PO's scheduled delivery date (see
// changeMaterialDeliveryDate above). No reminder is ever configured on the
// synced entry (reminder_recipient_ids stays empty), so creating/updating it
// never triggers a notification on its own — the only delivery notification
// stays the single one on completion (notifyDeliveryComplete).
async function syncDeliveryCalendarEvent(taskId, existingEventId, payload){
  if(!payload.site_id) return; // a job that isn't on the app has no site calendar to put it on
  const title = 'Delivery: '+payload.description;
  try{
    if(existingEventId){
      await dbUpdate('site_calendar_events', existingEventId, {title, event_date:payload.scheduled_date, site_id:payload.site_id, reminder_sent:false});
    } else {
      const rows = await dbInsert('site_calendar_events', {org_id:payload.org_id, site_id:payload.site_id, title, event_date:payload.scheduled_date, is_private:false, reminder_recipient_ids:[], created_by:ME.id});
      const newEventId = rows && rows[0] && rows[0].id;
      if(newEventId) await dbUpdate('delivery_tasks', taskId, {calendar_event_id:newEventId});
    }
  }catch(e){ /* best-effort — never blocks the delivery save itself */ }
}
window.deleteDeliveryTask = async function(taskId){
  if(!await customConfirm('Delete this delivery? This cannot be undone.')) return;
  const rows = await dbSelect('delivery_tasks', 'id=eq.'+taskId);
  const t = rows[0];
  const ok = await dbDelete('delivery_tasks', taskId);
  if(ok){
    if(t){
      await resequenceSlot(t.scheduled_date, t.time_slot);
      if(t.calendar_event_id) await dbDelete('site_calendar_events', t.calendar_event_id).catch(()=>{});
    }
    deliveryFormDraft = null;
    toast('Delivery deleted');
    go('#/delivery');
  }
  else { toast('Could not delete — try again.'); }
};
