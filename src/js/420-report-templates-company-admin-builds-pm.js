/* ================= REPORT TEMPLATES (Company Admin builds; PM fills in) ================= */
let editingTemplate = null; // deep-cloned template object being edited, or null
let templateBusy = false;
// Templates are managed entirely from inside a site's Snagging/Variations ›
// Reports screen now (no standalone home-page entry), so the editor needs to
// remember which site to send the admin back to once they're done.
let templatesReturnSiteId = null;
let templatesReturnPath = null; // overrides templatesReturnSiteId's default path when set (e.g. Daily Briefings tile)
async function renderReportTemplates(){
  const __gen = RENDER_GEN;
  const rows = await dbSelect('report_templates', 'org_id=eq.'+ME.org_id+'&archived=eq.false&order=created_at.desc');
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="sectiontitle" style="margin-top:0;">Report Templates</p>
    <p class="stub" style="margin:0 0 14px;">Build reusable inspection / report templates here. Project Managers can fill these in on site and submit them as a report.</p>
    ${rows.map(t=>`
      <div class="sitecard">
        <div class="info"><div class="name">${escapeHtml(t.name)}</div><div class="addr">${(t.sections||[]).length} section${(t.sections||[]).length===1?'':'s'}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="openTemplateEditor('${t.id}')">Edit</button>
          <button class="ghostbtn" style="width:auto;padding:8px 12px;color:var(--warn);" onclick="deleteTemplate('${t.id}','${jsAttr(t.name)}')">Delete</button>
        </div>
      </div>
    `).join('') || `<div class="empty">No templates yet — create your first one below.</div>`}
    <button class="darkbtn" style="margin-top:10px;" onclick="createNewTemplate()">+ New Template</button>
  `, {title:'Report Templates', back:'#/team/libraries', tabs:false}); }
}
window.createNewTemplate = async function(siteId, returnPath){
  templatesReturnSiteId = siteId || null;
  templatesReturnPath = returnPath || null;
  const rows = await dbInsert('report_templates', {org_id:ME.org_id, name:'Untitled Template', created_by:ME.id, sections:[{id:uid(), title:'Section 1', items:[]}]});
  if(rows && rows[0]) go('#/templates/'+rows[0].id);
};
window.openTemplateEditor = function(id, siteId, returnPath){ editingTemplate = null; templatesReturnSiteId = siteId || null; templatesReturnPath = returnPath || null; go('#/templates/'+id); };
window.createDailyBriefingTemplate = async function(siteId){
  templatesReturnSiteId = null;
  templatesReturnPath = `#/site/${siteId}/hs/briefings`;
  // Seed a new Daily Briefing template with an "Operatives On Site" item
  // out of the box — ticks everyone assigned to the site by default and
  // lets the PM untick anyone not actually present or add someone not on
  // the app, rather than relying on whoever builds the template to
  // remember to add this item type themselves.
  const rows = await dbInsert('report_templates', {org_id:ME.org_id, name:'Daily Briefing', created_by:ME.id, is_daily_briefing:true, sections:[{id:uid(), title:'Section 1', items:[{id:uid(), type:'operatives', label:'Operatives On Site', required:false}]}]});
  if(rows && rows[0]) go('#/templates/'+rows[0].id);
};
window.useTemplateAsDailyBriefing = async function(siteId, templateId){
  const row = await dbUpdate('report_templates', templateId, {is_daily_briefing:true});
  if(row){ toast('Added to Daily Briefings'); render(); }
};
window.removeTemplateFromDailyBriefings = async function(siteId, templateId){
  if(!await customConfirm('Remove this template from Daily Briefings? The template itself is kept — this just stops new briefings using it, and existing briefings stay where they are.')) return;
  const row = await dbUpdate('report_templates', templateId, {is_daily_briefing:false});
  if(row){ toast('Removed from Daily Briefings'); render(); }
};
// #409: same "quick create, pre-tagged" pattern as createDailyBriefingTemplate
// above — the actual Main Contractor Inspection templates (daily site
// inspection, fencing, fire extinguishers, welfare, etc.) are being defined
// separately; this just seeds an empty one already flagged correctly and
// sent to the MC Inspections template library instead of the generic one.
window.createMcInspectionTemplate = async function(siteId){
  templatesReturnSiteId = null;
  templatesReturnPath = `#/site/${siteId}/mc/inspections/templates`;
  const rows = await dbInsert('report_templates', {org_id:ME.org_id, name:'Main Contractor Inspection', created_by:ME.id, is_mc_inspection:true, sections:[{id:uid(), title:'Section 1', items:[]}]});
  if(rows && rows[0]) go('#/templates/'+rows[0].id);
};
window.useTemplateAsMcInspection = async function(siteId, templateId){
  const row = await dbUpdate('report_templates', templateId, {is_mc_inspection:true});
  if(row){ toast('Added to Main Contractor Inspections'); render(); }
};
window.removeTemplateFromMcInspections = async function(siteId, templateId){
  if(!await customConfirm('Remove this template from Main Contractor Inspections? The template itself is kept — this just stops new inspections using it, and existing inspections stay where they are.')) return;
  const row = await dbUpdate('report_templates', templateId, {is_mc_inspection:false});
  if(row){ toast('Removed from Main Contractor Inspections'); render(); }
};
window.duplicateTemplate = async function(id){
  const rows = await dbSelect('report_templates', 'id=eq.'+id+'&limit=1');
  if(!rows[0]) return;
  const src = rows[0];
  const copy = await dbInsert('report_templates', {org_id:ME.org_id, name: src.name+' (Copy)', description: src.description, sections: src.sections, created_by: ME.id});
  if(copy){ toast('Template duplicated'); render(); }
};
window.deleteTemplate = async function(id, name){
  if(!await customConfirm(`Delete template "${name}"? Reports already submitted from it are kept.`)) return;
  const ok = await dbDelete('report_templates', id);
  if(ok){ toast('Template deleted'); render(); }
};
async function renderTemplateEditor(templateId){
  const __gen = RENDER_GEN;
  if(!editingTemplate || editingTemplate.id !== templateId){
    const rows = await dbSelect('report_templates', 'id=eq.'+templateId+'&limit=1');
    if(!rows[0]){ toast('Template not found'); go('#/templates'); return; }
    editingTemplate = JSON.parse(JSON.stringify(rows[0]));
    if(!editingTemplate.sections || !editingTemplate.sections.length) editingTemplate.sections = [{id:uid(), title:'Section 1', items:[]}];
  }
  const t = editingTemplate;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="formfield" style="margin-top:0;"><label class="field-label">Template Name</label><input type="text" value="${escapeHtml(t.name)}" oninput="editingTemplate.name=this.value"></div>
    <div class="formfield"><label class="field-label">Description (optional)</label><textarea oninput="editingTemplate.description=this.value">${escapeHtml(t.description||'')}</textarea></div>
    <p class="ddrow" style="margin:0 0 8px;cursor:pointer;" onclick="templateSettingsOpen=!templateSettingsOpen;render()"><span class="arrow">${templateSettingsOpen?'▼':'▶'}</span> Where this template is used <span class="stub" style="font-weight:400;">· ${t.is_daily_briefing?'Daily Briefing':t.is_mc_inspection?'Main Contractor Inspection':t.is_loler_inspection?'LOLER Inspection':'Reports'}</span></p>
    ${templateSettingsOpen ? `<div class="card" style="margin-bottom:12px;"><p class="stub" style="margin:0 0 12px;">Leave all three unticked for a normal report or survey.</p>
    <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin:0 0 8px;">
      <input type="checkbox" ${t.is_daily_briefing?'checked':''} onchange="editingTemplate.is_daily_briefing=this.checked"> Use as a Daily Briefing template — submissions from this template appear in the Daily Briefings tile (Health &amp; Safety) instead of Reports
    </label>
    <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin:0 0 8px;">
      <input type="checkbox" ${t.is_mc_inspection?'checked':''} onchange="editingTemplate.is_mc_inspection=this.checked"> Use as a Main Contractor Inspection template — submissions from this template appear in the Inspections tile (Main Contractor) instead of Reports
    </label>
    <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin:0;">
      <input type="checkbox" ${t.is_loler_inspection?'checked':''} onchange="editingTemplate.is_loler_inspection=this.checked"> Use as a LOLER Inspection template — submissions from this template appear in the LOLER Inspection tile (Health &amp; Safety) instead of Reports, and can be linked to a Plant register item
    </label>
    </div>` : ''}
    <p class="ddrow" style="margin:0 0 8px;cursor:pointer;" onclick="trafficPanelOpen=!trafficPanelOpen;render()"><span class="arrow">${trafficPanelOpen?'▼':'▶'}</span> Traffic light system <span class="stub" style="font-weight:400;">· ${trafficLevels(t.sections) ? 'On — '+trafficLevels(t.sections).map(l=>`<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${trafficHex(l.color)};margin-right:2px;"></span>`).join('') : 'Off'}</span></p>
    ${trafficPanelOpen ? (()=>{ const tr = t.sections[0].traffic || {on:false, levels:[]}; return `<div class="card" style="margin-bottom:12px;">
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700;cursor:pointer;margin-bottom:6px;"><input type="checkbox" style="width:20px;height:20px;flex:0 0 20px;" ${tr.on?'checked':''} onchange="setTemplateTraffic(this.checked)">Use a traffic light system on this template</label>
      <p class="stub" style="margin:0 0 10px;">Each question gets a row of colours to pick its condition. The key below is printed on the report so the reader knows what each colour means. You can switch it off for individual questions in their More options.</p>
      ${tr.on ? `
        <label class="field-label" style="margin-bottom:4px;">Key — what each colour means</label>
        ${(tr.levels||[]).map((l,li)=>`
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="width:18px;height:18px;border-radius:50%;flex:0 0 18px;background:${trafficHex(l.color)};"></span>
            <select style="flex:0 0 96px;width:96px;margin:0;" onchange="editingTemplate.sections[0].traffic.levels[${li}].color=this.value;render()">${TRAFFIC_COLOURS.map(c=>`<option value="${c.k}" ${l.color===c.k?'selected':''}>${c.lbl}</option>`).join('')}</select>
            <input type="text" id="tlvl_${l.id}" value="${escapeHtml(l.label||'')}" oninput="editingTemplate.sections[0].traffic.levels[${li}].label=this.value" placeholder="What this colour means" style="flex:1;min-width:0;margin:0;">
            <button class="ghostbtn" style="width:34px;height:34px;padding:0;flex:0 0 34px;margin:0;color:var(--warn);" title="Remove this colour" onclick="editingTemplate.sections[0].traffic.levels.splice(${li},1);render()">✕</button>
          </div>`).join('')}
        <button class="ghostbtn" style="margin:0;padding:8px;" onclick="addTrafficLevel()">+ Add colour</button>
      ` : ''}
    </div>`; })() : ''}
    <p class="ddrow" id="answerSetsRow" style="margin:0 0 8px;cursor:pointer;" onclick="toggleAnswerSets()"><span class="arrow">${answerSetsDraft?'▼':'▶'}</span> Your answer types <span class="stub" style="font-weight:400;">· ${orgAnswerSets().length ? orgAnswerSets().length+' saved' : 'add your own, e.g. Good / Fair / Poor'}</span></p>
    ${answerSetsDraft ? `<div class="card" style="margin-bottom:12px;">
      <p class="stub" style="margin:0 0 10px;">Make your own sets of answers. They appear in the answer-type list on every question, in every template.</p>
      ${answerSetsDraft.map((a,ai)=>`
        <div style="border:1.5px solid var(--line);border-radius:12px;padding:10px;margin-bottom:8px;">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
            <input type="text" id="aset_${a.id}" value="${escapeHtml(a.name||'')}" oninput="answerSetsDraft[${ai}].name=this.value" placeholder="Name, e.g. Condition" style="flex:1;min-width:0;margin:0;">
            <button class="ghostbtn" style="width:34px;height:34px;padding:0;flex:0 0 34px;margin:0;color:var(--warn);" title="Delete this answer type" onclick="answerSetsDraft.splice(${ai},1);render()">✕</button>
          </div>
          <label class="field-label" style="margin-bottom:4px;">Answers</label>
          ${(a.options||[]).map((o,oi)=>`
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <input type="text" id="aset_${a.id}_${oi}" value="${escapeHtml(o)}" oninput="answerSetsDraft[${ai}].options[${oi}]=this.value" placeholder="Answer ${oi+1}" style="flex:1;min-width:0;margin:0;">
              <button class="ghostbtn" style="width:34px;height:34px;padding:0;flex:0 0 34px;margin:0;color:var(--warn);" title="Remove this answer" onclick="answerSetsDraft[${ai}].options.splice(${oi},1);render()">✕</button>
            </div>`).join('')}
          <button class="ghostbtn" style="margin:0 0 8px;padding:8px;" onclick="addAnswerSetOption(${ai})">+ Add answer</button>
          <label class="stub" style="display:flex;align-items:center;gap:6px;"><input type="checkbox" style="width:auto;" ${a.multi?'checked':''} onchange="answerSetsDraft[${ai}].multi=this.checked">More than one answer can be ticked</label>
        </div>`).join('') || `<div class="empty">None yet.</div>`}
      <div class="row-gap">
        <button class="ghostbtn" style="flex:1;" onclick="addAnswerSet()">+ New answer type</button>
        <button class="darkbtn" style="flex:1;" ${answerSetsBusy?'disabled':''} onclick="saveAnswerSets()">${answerSetsBusy?'Saving…':'Save answer types'}</button>
      </div>
    </div>` : ''}
    ${t.sections.map((s,si)=>`
      <div class="card">
        <div class="formfield" style="margin-top:0;">
          <label class="field-label">Section Title</label>
          <input type="text" value="${escapeHtml(s.title)}" oninput="editingTemplate.sections[${si}].title=this.value" placeholder="Section title">
        </div>
        ${(s.items||[]).map((it,ii)=>renderTemplateItemEditor(si,ii,it)).join('') || `<div class="empty">No questions in this section yet.</div>`}
        <div class="row-gap" style="margin-top:8px;">
          <button class="ghostbtn" style="flex:1;" onclick="addTemplateItem(${si})">+ Add Question</button>
          <button class="ghostbtn" style="flex:1;" onclick="addTemplateItem(${si},'textarea')">+ Add Notes Box</button>
        </div>
        ${t.sections.length>1 ? `<button class="ghostbtn" style="margin-top:8px;color:var(--warn);" onclick="removeTemplateSection(${si})">Remove Section</button>` : ''}
      </div>
    `).join('')}
    <button class="ghostbtn" onclick="addTemplateSection()">+ Add Section</button>
    <div class="card" style="margin-top:12px;">
      <label style="display:flex;align-items:flex-start;gap:10px;font-size:13.5px;font-weight:700;cursor:pointer;"><input type="checkbox" style="width:20px;height:20px;flex:0 0 20px;margin-top:1px;" ${templateShowsUnanswered(t.sections)?'checked':''} onchange="editingTemplate.sections[0].showUnanswered=this.checked"><span>Show unanswered questions<br><span class="stub" style="font-weight:400;">Ticked: the finished report and PDF list every question, even ones left blank. Unticked: questions with no answer are left off.</span></span></label>
    </div>
    <button class="darkbtn" style="margin-top:14px;" ${templateBusy?'disabled':''} onclick="saveTemplate()">${templateBusy?'Saving…':'Save Template'}</button>
  `, {title:'Edit Template', back: templatesReturnPath || (templatesReturnSiteId ? `#/site/${templatesReturnSiteId}/snagging/templates` : '#/templates'), tabs:false}); }
}
let templateSettingsOpen = false;
let templateItemOpen = new Set(); // question ids with "More options" expanded
window.toggleTemplateItemOpen = function(id){ if(templateItemOpen.has(id)) templateItemOpen.delete(id); else templateItemOpen.add(id); render(); };
// Which answers can carry a free-text note beside them when a report is
// filled in. On unless the template has it switched off for that question.
function itemAllowsNote(it){
  if(!it || it.allowNote===false) return false;
  return !['instruction','photo','signature','operatives'].includes(it.type);
}
// One question in the template editor. Kept to the three things that matter
// (the question, the kind of answer, and its order) — everything else sits
// behind "More options" so the page reads as a simple list.
function renderTemplateItemEditor(si, ii, it){
  const P = `editingTemplate.sections[${si}].items[${ii}]`;
  const open = templateItemOpen.has(it.id);
  const last = ii>=(editingTemplate.sections[si].items.length-1);
  const tags = [];
  if(it.required) tags.push('Required');
  if(it.scored) tags.push('Scored');
  if(it.showIf) tags.push('Only shows sometimes');
  if(it.autofill) tags.push('Auto-filled');
  if(itemAllowsNote(it)) tags.push('Notes allowed');
  if(itemHasTraffic(editingTemplate.sections, it)) tags.push('Traffic light');
  const smallBtn = 'width:34px;height:34px;padding:0;flex:0 0 34px;margin:0;';
  // A follow-up question: only asked when an earlier answer matches.
  const parent = it.showIf && it.showIf.qId ? editingTemplate.sections[si].items.find(c=>c.id===it.showIf.qId) : null;
  const condText = parent ? (it.showIf.mode==='notblank' ? 'is answered' : ((it.showIf.values||[]).length ? 'is '+(it.showIf.values||[]).map(v=>pfLbl(parent,v)).join(' or ') : 'is… (pick the answer in More options)')) : '';
  const fuVals = followUpValuesFor(it);
  const usedSet = (it.presetId && (it.type==='choice' || it.type==='multichoice')) ? orgAnswerSets().find(a=>a.id===it.presetId) : null;
  const isYnnv = it.type==='choice' && it.presetId==='builtin_ynnv';
  return `
    <div style="border:1.5px solid ${parent?'var(--brand1)':'var(--line)'};border-radius:12px;padding:10px;margin-bottom:8px;background:var(--card);${parent?'margin-left:16px;':''}">
      ${parent ? `<p class="stub" style="margin:0 0 6px;font-weight:700;color:var(--ink);">↳ Only asked if “${escapeHtml(parent.label||'the question above')}” ${escapeHtml(condText)}</p>` : ''}
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="font-weight:800;font-size:12px;color:var(--slate);flex:0 0 auto;min-width:18px;">${ii+1}.</span>
        <input type="text" id="tplq_${it.id}" value="${escapeHtml(it.label||'')}" oninput="${P}.label=this.value" placeholder="${it.type==='instruction'?'Text to show':it.type==='textarea'?'Heading for the notes box, e.g. Notes':'Type the question'}" style="flex:1;min-width:0;margin:0;">
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <select style="flex:1;min-width:0;margin:0;" onchange="setTemplateItemType(${si},${ii},this.value)">
          ${REPORT_FIELD_TYPES.map(ft=>`<option value="${ft.k}" ${!usedSet && !isYnnv && it.type===ft.k && !(ft.k==='passfail' && it.pfWords)?'selected':''}>${ft.lbl}</option>${ft.k==='passfail' ? `<option value="passfailwords" ${!usedSet && !isYnnv && it.type==='passfail' && it.pfWords?'selected':''}>Pass / Fail / N-A</option><option value="ynnv" ${isYnnv?'selected':''}>Yes / No / N-A / Not Visible</option>` : ''}`).join('')}
          ${orgAnswerSets().length ? `<optgroup label="Your answer types">${orgAnswerSets().map(a=>`<option value="set:${a.id}" ${usedSet && usedSet.id===a.id?'selected':''}>${escapeHtml(a.name||'Untitled')} (${escapeHtml((a.options||[]).join(' / '))})</option>`).join('')}</optgroup>` : ''}
          <option value="__manage__">✏️ Add / edit your own answer types…</option>
        </select>
        <button class="ghostbtn" style="${smallBtn}" ${ii===0?'disabled':''} title="Move up" onclick="moveTemplateItem(${si},${ii},-1)">▲</button>
        <button class="ghostbtn" style="${smallBtn}" ${last?'disabled':''} title="Move down" onclick="moveTemplateItem(${si},${ii},1)">▼</button>
        <button class="ghostbtn" style="${smallBtn}color:var(--warn);" title="Remove" onclick="removeTemplateItem(${si},${ii})">✕</button>
      </div>
      ${((it.type==='choice' || it.type==='multichoice') && !isYnnv) ? `
        <div style="margin-top:8px;padding:8px;border:1px dashed var(--line);border-radius:10px;">
          <label class="field-label" style="margin-bottom:4px;">Answers to pick from${it.type==='multichoice' ? ' (more than one can be ticked)' : ''}</label>
          ${(it.options||[]).map((o,oi)=>`
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <input type="text" id="tplopt_${it.id}_${oi}" value="${escapeHtml(o)}" oninput="${P}.options[${oi}]=this.value" placeholder="Answer ${oi+1}" style="flex:1;min-width:0;margin:0;">
              <button class="ghostbtn" style="${smallBtn}color:var(--warn);" title="Remove this answer" onclick="removeTemplateOption(${si},${ii},${oi})">✕</button>
            </div>`).join('')}
          <button class="ghostbtn" style="margin:0;padding:8px;" onclick="addTemplateOption(${si},${ii})">+ Add answer</button>
        </div>
      ` : ''}
      ${fuVals.length ? `
        <div style="margin-top:8px;">
          <label class="field-label" style="margin-bottom:4px;">Ask a follow-up question if the answer is…</label>
          ${fuVals.length<=4 ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${fuVals.map((v,vi)=>`<button class="ghostbtn" style="width:auto;margin:0;padding:7px 10px;font-size:11.5px;" onclick="addFollowUpQuestion(${si},${ii},${vi})">+ ${escapeHtml(pfLbl(it,v))}</button>`).join('')}</div>`
          : `<select style="margin:0;" onchange="if(this.value!=='')addFollowUpQuestion(${si},${ii},Number(this.value))"><option value="">Pick an answer…</option>${fuVals.map((v,vi)=>`<option value="${vi}">${escapeHtml(v)}</option>`).join('')}</select>`}
        </div>
      ` : ''}
      ${it.type!=='instruction' ? `
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <span class="viewlink" style="cursor:pointer;flex:0 0 auto;" onclick="toggleTemplateItemOpen('${it.id}')">${open?'▼ Hide options':'▶ More options'}</span>
        ${!open && tags.length ? `<span class="stub" style="margin:0;flex:1;min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tags.join(' · ')}</span>` : ''}
      </div>
      ${open ? `
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);">
        <label class="stub" style="display:flex;align-items:center;gap:6px;"><input type="checkbox" style="width:auto;" ${it.required?'checked':''} onchange="${P}.required=this.checked">Must be answered</label>
        ${(trafficLevels(editingTemplate.sections) && !['instruction','photo','signature','operatives'].includes(it.type)) ? `
          <label class="stub" style="display:flex;align-items:center;gap:6px;margin-top:6px;"><input type="checkbox" style="width:auto;" ${it.traffic!==false?'checked':''} onchange="${P}.traffic=this.checked">Show the traffic light on this question</label>
        ` : ''}
      ${!['instruction','photo','signature','operatives'].includes(it.type) ? `
        <label class="stub" style="display:flex;align-items:center;gap:6px;margin-top:6px;"><input type="checkbox" style="width:auto;" ${it.allowNote!==false?'checked':''} onchange="${P}.allowNote=this.checked">Allow a note</label>
      ` : ''}
        ${(it.type!=='photo' && it.type!=='signature' && !it.autofill) ? `
          <label class="stub" style="display:flex;align-items:center;gap:6px;margin-top:6px;"><input type="checkbox" style="width:auto;" ${it.allowMedia!==false?'checked':''} onchange="${P}.allowMedia=this.checked;if(!this.checked)${P}.mediaRequiredWhen=[];render()">Let a photo be added to this answer</label>
          ${it.allowMedia!==false ? renderMediaRequiredEditor(si, ii, it) : ''}
        ` : ''}
        ${(it.type==='passfail' || it.type==='checkbox') ? `
          <label class="stub" style="display:flex;align-items:center;gap:6px;margin-top:6px;"><input type="checkbox" style="width:auto;" ${it.scored?'checked':''} onchange="${P}.scored=this.checked">Count towards score${it.type==='passfail' ? (it.pfWords ? ' (Pass = 1 point, N/A excluded)' : ' (Yes = 1 point, N/A excluded)') : ' (Yes = 1 point)'}</label>
        ` : ''}
        ${(it.type==='text' || it.type==='date') ? `
          <label class="field-label" style="margin-top:8px;margin-bottom:2px;">Fill in automatically with</label>
          <select onchange="${P}.autofill=this.value||null">
            ${AUTOFILL_OPTIONS.filter(o=>!o.k || o.types.includes(it.type)).map(o=>`<option value="${o.k}" ${(it.autofill||'')===o.k?'selected':''}>${o.lbl}</option>`).join('')}
          </select>
        ` : ''}
        ${renderTemplateItemLogicEditor(si, ii, it)}
      </div>` : ''}
      ` : ''}
    </div>
  `;
}
// Answers a follow-up can hang off, in the form the show-if rule stores them.
function followUpValuesFor(it){
  if(it.type==='checkbox') return ['Yes','No'];
  if(it.type==='passfail') return ['Pass','Fail','N/A'];
  if(it.type==='choice' || it.type==='multichoice') return (it.options||[]).map(o=>String(o||'').trim()).filter(Boolean);
  return [];
}
// "+ Yes" / "+ No" under a question: drops a new question straight after it
// (after any follow-ups it already has) that is only asked for that answer.
window.addFollowUpQuestion = function(si, ii, vi){
  const items = editingTemplate.sections[si].items;
  const parent = items[ii]; if(!parent) return;
  const v = followUpValuesFor(parent)[vi]; if(v===undefined) return;
  let at = ii+1;
  while(at<items.length && items[at].showIf && items[at].showIf.qId===parent.id) at++;
  const nu = {id:uid(), type:'text', label:'', required:false, options:[], scored:false, showIf:{qId:parent.id, mode:'equals', values:[v]}, allowMedia:true, mediaRequiredWhen:[]};
  items.splice(at, 0, nu);
  render().then(()=>{ const el = document.getElementById('tplq_'+nu.id); if(el){ el.focus(); el.scrollIntoView({block:'center'}); } });
};
// ---- Your own answer types ---------------------------------------------
// Company-wide sets of answers (e.g. Good / Fair / Poor) that show in the
// answer-type list beside the built-in ones. Picking one makes the question
// a normal multiple-choice with those answers copied in, so reports and
// PDFs need nothing special; presetId just remembers which set it came from.
let trafficPanelOpen = false;
window.setTemplateTraffic = function(on){
  const s0 = editingTemplate.sections[0];
  if(!s0.traffic) s0.traffic = {on:false, levels:[]};
  s0.traffic.on = !!on;
  if(on && !(s0.traffic.levels||[]).length) s0.traffic.levels = trafficDefaultLevels();
  render();
};
window.addTrafficLevel = function(){
  const lv = editingTemplate.sections[0].traffic.levels;
  const used = lv.map(l=>l.color);
  const next = TRAFFIC_COLOURS.find(c=>!used.includes(c.k)) || TRAFFIC_COLOURS[0];
  const l = {id:'tl_'+uid(), color:next.k, label:''};
  lv.push(l);
  render().then(()=>{ const el = document.getElementById('tlvl_'+l.id); if(el) el.focus(); });
};
let answerSetsDraft = null, answerSetsBusy = false;
const YNNV_OPTIONS = ['Yes','No','N/A','Not Visible'];
function orgAnswerSets(){ return (ORG && Array.isArray(ORG.report_answer_sets)) ? ORG.report_answer_sets : []; }
window.toggleAnswerSets = function(){
  answerSetsDraft = answerSetsDraft ? null : JSON.parse(JSON.stringify(orgAnswerSets()));
  render();
};
window.addAnswerSet = function(){
  const a = {id:uid(), name:'', options:['',''], multi:false};
  answerSetsDraft.push(a);
  render().then(()=>{ const el = document.getElementById('aset_'+a.id); if(el) el.focus(); });
};
window.addAnswerSetOption = function(ai){
  const a = answerSetsDraft[ai]; a.options.push('');
  render().then(()=>{ const el = document.getElementById('aset_'+a.id+'_'+(a.options.length-1)); if(el) el.focus(); });
};
window.saveAnswerSets = async function(){
  if(!answerSetsDraft || answerSetsBusy) return;
  const clean = answerSetsDraft.map(a=>({id:a.id, name:String(a.name||'').trim(), multi:!!a.multi, options:(a.options||[]).map(o=>String(o||'').trim()).filter(Boolean)}));
  for(const a of clean){
    if(!a.options.length){ toast('Each answer type needs at least one answer.'); return; }
    if(!a.name) a.name = a.options.join(' / ');
  }
  answerSetsBusy = true; render();
  const row = await dbUpdate('organizations', ME.org_id, {report_answer_sets: clean});
  answerSetsBusy = false;
  if(!row){ toast('Could not save — only a Project Manager or Admin can change this.'); render(); return; }
  if(ORG) ORG.report_answer_sets = clean;
  // Questions in the template on screen that use one of these pick up the new answers.
  if(editingTemplate) (editingTemplate.sections||[]).forEach(sec=>(sec.items||[]).forEach(it=>{
    if(!it.presetId) return;
    const a = clean.find(c=>c.id===it.presetId);
    if(a){ it.options = a.options.slice(); it.type = a.multi ? 'multichoice' : 'choice'; }
  }));
  answerSetsDraft = null;
  toast('Answer types saved');
  render();
};
window.setTemplateItemType = function(si, ii, v){
  const it = editingTemplate.sections[si].items[ii];
  if(v==='__manage__'){
    if(!answerSetsDraft) answerSetsDraft = JSON.parse(JSON.stringify(orgAnswerSets()));
    render().then(()=>{ const el = document.getElementById('answerSetsRow'); if(el) el.scrollIntoView({block:'start', behavior:'smooth'}); });
    return;
  }
  if(v.indexOf('set:')===0){
    const a = orgAnswerSets().find(c=>c.id===v.slice(4));
    if(a){ it.type = a.multi ? 'multichoice' : 'choice'; it.options = (a.options||[]).slice(); it.presetId = a.id; }
  } else if(v==='ynnv'){
    // Built-in four-way answer, shown as buttons like Yes / No / N-A.
    it.type = 'choice'; it.options = YNNV_OPTIONS.slice(); it.presetId = 'builtin_ynnv'; it.asButtons = true;
  } else if(v==='passfailwords'){
    it.type = 'passfail'; it.pfWords = true; delete it.presetId; delete it.asButtons;
  } else { it.type = v; delete it.presetId; delete it.asButtons; delete it.pfWords; }
  if(v.indexOf('set:')===0) delete it.asButtons;
  render();
};
window.addTemplateOption = function(si, ii){
  const it = editingTemplate.sections[si].items[ii];
  if(!Array.isArray(it.options)) it.options = [];
  it.options.push('');
  render().then(()=>{ const el = document.getElementById('tplopt_'+it.id+'_'+(it.options.length-1)); if(el) el.focus(); });
};
window.removeTemplateOption = function(si, ii, oi){
  const it = editingTemplate.sections[si].items[ii];
  (it.options||[]).splice(oi,1);
  render();
};
window.moveTemplateItem = function(si, ii, dir){
  const items = editingTemplate.sections[si].items;
  const target = ii + dir;
  if(target<0 || target>=items.length) return;
  const [moved] = items.splice(ii,1);
  items.splice(target,0,moved);
  render();
};
function renderMediaRequiredEditor(si, ii, it){
  const opts = itemOwnValueOptions(it);
  return `
    <div style="margin-top:4px;padding-left:2px;">
      ${opts ? `
        <label class="field-label" style="margin-bottom:2px;">Require the photo when the answer is…</label>
        <div class="row-gap" style="flex-wrap:wrap;">
          ${opts.map(o=>`<label class="stub" style="display:flex;align-items:center;gap:4px;"><input type="checkbox" style="width:auto;" ${(it.mediaRequiredWhen||[]).includes(o)?'checked':''} onchange="toggleMediaRequiredValue(${si},${ii},${jsLit(o)},this.checked)">${escapeHtml(typeof o==='boolean'?(o?'Yes':'No'):(pfLbl(it,o)))}</label>`).join('')}
        </div>
      ` : `
        <label class="stub" style="display:flex;align-items:center;gap:6px;"><input type="checkbox" style="width:auto;" ${(it.mediaRequiredWhen||[]).includes('__always__')?'checked':''} onchange="editingTemplate.sections[${si}].items[${ii}].mediaRequiredWhen=this.checked?['__always__']:[];render()">Always require the photo</label>
      `}
    </div>
  `;
}
window.toggleMediaRequiredValue = function(si, ii, value, checked){
  const it = editingTemplate.sections[si].items[ii];
  const set = new Set(it.mediaRequiredWhen||[]);
  if(checked) set.add(value); else set.delete(value);
  it.mediaRequiredWhen = Array.from(set);
  render();
};
// Trigger candidates for conditional logic: any earlier question in the SAME
// section that can actually be answered (everything except instruction text)
// — mirrors how SafetyCulture nests a conditional question directly under
// the question that triggers it. Fixed-option questions (Pass/Fail/N-A,
// choice, Yes/No) can trigger on "equals a specific answer" as well as "has
// any answer"; every other type (text, number, date, photo, signature,
// multichoice) can only trigger on "has any answer" since there's no fixed
// list of possible values to pick from.
function possibleTriggerItems(si, ii){
  const items = editingTemplate.sections[si].items;
  const out = [];
  items.forEach((cand,idx)=>{
    if(idx>=ii) return;
    if(cand.type==='instruction') return;
    out.push(cand);
  });
  return out;
}
function itemHasFixedOptions(it){
  return it.type==='passfail' || it.type==='choice' || it.type==='checkbox';
}
function triggerOptionsFor(qId){
  for(const s of editingTemplate.sections){
    for(const cand of (s.items||[])){
      if(cand.id===qId){
        if(cand.type==='passfail') return ['Pass','Fail','N/A'];
        if(cand.type==='checkbox') return ['Yes','No'];
        if(cand.type==='choice') return cand.options||[];
      }
    }
  }
  return [];
}
function renderTemplateItemLogicEditor(si, ii, it){
  const candidates = possibleTriggerItems(si, ii);
  if(!candidates.length && !it.showIf) return '';
  const triggerItem = it.showIf ? candidates.find(c=>c.id===it.showIf.qId) : null;
  const fixedOptions = triggerItem ? itemHasFixedOptions(triggerItem) : false;
  const isEquals = !!it.showIf && it.showIf.mode !== 'notblank';
  return `
    <div style="margin-top:6px;">
      <label class="field-label" style="margin-bottom:2px;">Only show this question if…</label>
      <select onchange="setItemLogicTrigger(${si},${ii},this.value)">
        <option value="">Always show</option>
        ${candidates.map(cand=>`<option value="${cand.id}" ${it.showIf && it.showIf.qId===cand.id?'selected':''}>${escapeHtml(cand.label||'(untitled question)')}</option>`).join('')}
      </select>
      ${it.showIf ? `
        <select style="margin-top:6px;" onchange="setItemLogicMode(${si},${ii},this.value)">
          <option value="notblank" ${!isEquals?'selected':''}>…isn't left blank (any answer given)</option>
          ${fixedOptions ? `<option value="equals" ${isEquals?'selected':''}>…equals a specific answer</option>` : ''}
        </select>
        ${(isEquals && fixedOptions) ? `
          <div class="row-gap" style="margin-top:6px;flex-wrap:wrap;">
            ${triggerOptionsFor(it.showIf.qId).map(o=>`<label class="stub" style="display:flex;align-items:center;gap:4px;"><input type="checkbox" style="width:auto;" ${(it.showIf.values||[]).includes(o)?'checked':''} onchange="toggleItemLogicValue(${si},${ii},'${o.replace(/'/g,"\\'")}',this.checked)">${escapeHtml(pfLbl(triggerItem,o))}</label>`).join('')}
          </div>
        ` : ''}
      ` : ''}
    </div>
  `;
}
window.setItemLogicTrigger = function(si, ii, val){
  const it = editingTemplate.sections[si].items[ii];
  if(!val){ it.showIf = null; render(); return; }
  const cand = editingTemplate.sections[si].items.find(c=>c.id===val);
  const fixedOptions = cand ? itemHasFixedOptions(cand) : false;
  it.showIf = {qId: val, mode: fixedOptions ? 'equals' : 'notblank', values: []};
  render();
};
window.setItemLogicMode = function(si, ii, mode){
  const it = editingTemplate.sections[si].items[ii];
  if(!it.showIf) return;
  it.showIf.mode = mode;
  if(mode==='notblank') it.showIf.values = [];
  render();
};
window.toggleItemLogicValue = function(si, ii, value, checked){
  const it = editingTemplate.sections[si].items[ii];
  if(!it.showIf) return;
  const set = new Set(it.showIf.values||[]);
  if(checked) set.add(value); else set.delete(value);
  it.showIf.values = Array.from(set);
  render();
};
window.addTemplateSection = function(){
  editingTemplate.sections.push({id:uid(), title:'Section '+(editingTemplate.sections.length+1), items:[]});
  render();
};
window.removeTemplateSection = async function(si){
  if(!await customConfirm('Remove this section and all its questions?')) return;
  const gone = editingTemplate.sections.splice(si,1)[0];
  if(si===0 && gone && editingTemplate.sections[0]){
    if(gone.traffic) editingTemplate.sections[0].traffic = gone.traffic;
    if(gone.showUnanswered===false) editingTemplate.sections[0].showUnanswered = false;
  }
  render();
};
window.addTemplateItem = function(si, type){
  editingTemplate.sections[si].items.push({id:uid(), type:type||'text', label: type==='textarea' ? 'Notes' : '', required:false, options:[], scored:false, showIf:null, allowMedia:true, mediaRequiredWhen:[]});
  render();
};
window.removeTemplateItem = function(si, ii){
  editingTemplate.sections[si].items.splice(ii,1);
  render();
};
window.saveTemplate = async function(){
  { const tr = editingTemplate.sections && editingTemplate.sections[0] && editingTemplate.sections[0].traffic;
    if(tr && Array.isArray(tr.levels)) tr.levels = tr.levels.map(l=>Object.assign({}, l, {label:String(l.label||'').trim()})).filter(l=>l.label); }
  (editingTemplate.sections||[]).forEach(sec=>(sec.items||[]).forEach(it=>{ if(Array.isArray(it.options)) it.options = it.options.map(o=>String(o||'').trim()).filter(Boolean); }));
  if(!editingTemplate.name || !editingTemplate.name.trim()){ toast('Give the template a name.'); return; }
  templateBusy = true; render();
  const row = await dbUpdate('report_templates', editingTemplate.id, {
    name: editingTemplate.name.trim(),
    description: editingTemplate.description || null,
    sections: editingTemplate.sections,
    is_daily_briefing: !!editingTemplate.is_daily_briefing,
    is_mc_inspection: !!editingTemplate.is_mc_inspection,
    is_loler_inspection: !!editingTemplate.is_loler_inspection,
    updated_at: new Date().toISOString(),
  });
  templateBusy = false;
  if(row){
    toast('Template saved');
    editingTemplate = null;
    const dest = templatesReturnPath || (templatesReturnSiteId ? `#/site/${templatesReturnSiteId}/snagging/templates` : '#/templates');
    templatesReturnSiteId = null;
    templatesReturnPath = null;
    go(dest);
  } else render();
};
