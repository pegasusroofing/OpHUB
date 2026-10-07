/* ================= LOLER INSPECTIONS (Health & Safety — thorough examination of lifting equipment) =================
   Reuses the same templated report_templates/report_submissions engine as
   Reports/Daily Briefings/MC Inspections (see the comment above
   renderMcInspectionTemplates) — a template flagged is_loler_inspection
   surfaces here instead of the general Reports list, and fill/view reuse
   the same snagging/reports/fill|view routes MC Inspections already shares
   rather than a bespoke path (same "back lands on the general Reports list"
   simplification MC Inspections already has, see the comment there).
   Starting one first asks which Plant register item it's for (or a manual
   one-off entry not tied to the register); the equipment fields on the
   template (loler_make_model/loler_equipment_desc/loler_serial — fixed ids,
   seeded once into the template's first section) get pre-filled from
   whichever was picked. Completing the inspection then advances that
   item's last/next inspection dates automatically (see the plant_item_id
   hook inside submitReport). */
let lolerPickerOpen = false;
let lolerPlantPickOpen = false;
let lolerManualName = '';
window.startLolerInspection = async function(siteId, templateId, plantItemId, manualName){
  const rows = await dbSelect('report_templates', 'id=eq.'+templateId+'&limit=1');
  const t = rows[0];
  if(!t){ toast('Template not found'); return; }
  const answers = {};
  const site = SITES.find(s=>s.id===siteId);
  (t.sections||[]).forEach(s=>(s.items||[]).forEach(it=>{
    if(it.autofill){
      const v = autofillValue(it.autofill, site);
      if(v!==undefined) answers[it.id] = v;
    }
  }));
  let plantItem = null;
  if(plantItemId){
    const pRows = await dbSelect('plant_items', 'id=eq.'+plantItemId+'&limit=1');
    plantItem = pRows[0] || null;
  }
  if(plantItem){
    answers['loler_make_model'] = plantItem.name;
    if(plantItem.description) answers['loler_equipment_desc'] = plantItem.description;
    if(plantItem.serial_number) answers['loler_serial'] = plantItem.serial_number;
  } else if(manualName){
    answers['loler_make_model'] = manualName;
  }
  const inserted = await dbInsert('report_submissions', {
    template_id: t.id, org_id: ME.org_id, site_id: siteId,
    template_name: t.name, sections: t.sections, answers,
    submitted_by: ME.id, status:'in_progress', plant_item_id: plantItem ? plantItem.id : null,
  });
  if(inserted && inserted[0]){
    reportFillDraft = null;
    lolerPickerOpen = false; lolerPlantPickOpen = false; lolerManualName = '';
    toast('LOLER inspection started');
    go(`#/site/${siteId}/snagging/reports/fill/${inserted[0].id}`);
  }
};
window.toggleLolerPlantPick = function(){ lolerPlantPickOpen = !lolerPlantPickOpen; render(); };
async function renderLolerInspections(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canAdd = isManager(ME);
  // Simplifying assumption: only one is_loler_inspection template is
  // expected in practice (the seeded regulatory one) — if an org ever adds
  // a second, this picker always starts from the first and ignores the
  // rest, same trade-off MC Inspections doesn't have to make since it lets
  // a PM pick between several templates by design.
  const templates = await dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&is_loler_inspection=eq.true&archived=eq.false&order=name.asc');
  let submissions = [];
  if(templates.length){
    const ids = templates.map(t=>t.id).join(',');
    submissions = await dbSelect('report_submissions', 'site_id=eq.'+siteId+'&template_id=in.('+ids+')&order=submitted_at.desc&limit=100');
  }
  await loadAllProfiles();
  const plantItems = canAdd && lolerPlantPickOpen ? await dbSelect('plant_items', 'org_id=eq.'+ME.org_id+'&order=name.asc') : [];
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${canAdd ? `
      <button class="darkbtn" style="margin-bottom:10px;" onclick="lolerPickerOpen=!lolerPickerOpen;lolerPlantPickOpen=false;render()">${lolerPickerOpen?'Cancel':'+ New LOLER Inspection'}</button>
      ${lolerPickerOpen ? `
        <div class="card" style="margin-bottom:14px;">
          ${!templates.length ? `<div class="empty">No LOLER Inspection template yet — ask an Admin to set one up via Report Templates.</div>` : `
            ${!lolerPlantPickOpen ? `
              <p class="stub" style="margin:0 0 8px;">Pick the plant item this inspection is for:</p>
              <button class="ghostbtn" style="margin-bottom:8px;" onclick="toggleLolerPlantPick()">Choose From Plant Register</button>
              <div class="formfield" style="margin-top:0;"><input type="text" id="lolerManualName" placeholder="Or type a one-off item name" value="${escapeHtml(lolerManualName)}" oninput="lolerManualName=this.value"></div>
<button class="darkbtn" onclick="(function(){var v=document.getElementById('lolerManualName').value.trim();if(!v){toast('Type an item name first, or choose from the Plant Register.');return;}startLolerInspection('${siteId}','${templates[0].id}',null,v);})()">Start Inspection With This Name</button>
            ` : `
              <p class="stub" style="margin:0 0 8px;">Select an item:</p>
              ${plantItems.map(p=>`
                <div class="sitecard" style="cursor:pointer;" onclick="startLolerInspection('${siteId}','${templates[0].id}','${p.id}',null)">
                  <div class="info"><div class="name">${escapeHtml(p.name)}</div>${p.serial_number?`<div class="addr">${escapeHtml(p.serial_number)}</div>`:''}</div>
                </div>
              `).join('') || `<div class="empty">No items in the plant register yet.</div>`}
              <button class="ghostbtn" style="margin-top:8px;" onclick="toggleLolerPlantPick()">Back</button>
            `}
          `}
        </div>
      ` : ''}
    ` : ''}
    ${submissions.map(s=>`
      <div class="sitecard" style="cursor:pointer;" onclick="go('#/site/${siteId}/snagging/reports/${s.status==='in_progress'?'fill':'view'}/${s.id}')">
        <div class="info">
          <div class="name">${escapeHtml((s.answers && s.answers.loler_make_model) || s.template_name)}</div>
          <div class="addr">${s.status==='in_progress' ? 'Started' : ('Submitted '+new Date(s.submitted_at).toLocaleString('en-GB'))} · ${escapeHtml(nameOf(s.submitted_by))}</div>
        </div>
        <span class="statustag2 ${REPORT_STATUS_CLASS[s.status]||'closed'}">${REPORT_STATUS_LABEL[s.status]||s.status}</span>
      </div>
    `).join('') || `<div class="empty">No LOLER inspections logged yet${templates.length?'.':' — set up a template first.'}</div>`}
  `, {title:'LOLER Inspections', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/havspuwer`, siteId, activeTab:'more'}); }
}
