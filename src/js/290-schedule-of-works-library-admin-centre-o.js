/* ================= Schedule of Works — Library (Admin Centre). Org-wide
   reusable templates a PM/admin builds once here, then picks from any
   site's Schedule of Works "+ → From Library" to copy the whole
   section/task structure in — every copied row is immediately just an
   ordinary editable/deletable schedule_sections/schedule_tasks row, the
   template itself is never referenced live again after the copy. ================= */
let sowLibOpenTemplateId = null;
let sowLibSectionsCache = {};
let sowLibTasksCache = {};
async function loadSowLibContents(templateId){
  const [secs, tasks] = await Promise.all([
    dbSelect('sow_library_sections', 'template_id=eq.'+templateId+'&order=position.asc.nullslast,created_at.asc'),
    dbSelect('sow_library_tasks', 'template_id=eq.'+templateId+'&order=position.asc.nullslast,created_at.asc'),
  ]);
  sowLibSectionsCache[templateId] = secs;
  sowLibTasksCache[templateId] = tasks;
}
window.addSowLibTemplate = async function(){
  const name = await customPrompt('Template name', '');
  if(name===null) return;
  const trimmed = name.trim(); if(!trimmed){ toast('Enter a name.'); return; }
  const rows = await dbInsert('sow_library_templates', {org_id:ME.org_id, name:trimmed, created_by:ME.id});
  if(rows && rows[0]){
    toast('Template created');
    sowLibOpenTemplateId = rows[0].id;
    await loadSowLibContents(rows[0].id);
    render();
  }
};
window.renameSowLibTemplate = async function(id){
  const t = (await dbSelect('sow_library_templates', 'id=eq.'+id+'&select=name'))[0];
  const name = await customPrompt('Template name', t?t.name:'');
  if(name===null) return;
  const trimmed = name.trim(); if(!trimmed){ toast('Name can\'t be empty.'); return; }
  const row = await dbUpdate('sow_library_templates', id, {name:trimmed});
  if(row){ toast('Renamed'); render(); }
};
window.deleteSowLibTemplate = async function(id){
  if(!await customConfirm('Delete this library template? This can\'t be undone (sites that already used it keep their own copied tasks).')) return;
  const ok = await dbDelete('sow_library_templates', id);
  if(ok){ toast('Template deleted'); if(sowLibOpenTemplateId===id) sowLibOpenTemplateId=null; render(); }
};
window.toggleSowLibTemplate = async function(id){
  if(sowLibOpenTemplateId===id){ sowLibOpenTemplateId=null; render(); return; }
  sowLibOpenTemplateId = id;
  await loadSowLibContents(id);
  render();
};
window.addSowLibSection = async function(templateId){
  const input = document.getElementById('sowLibNewSectionName-'+templateId);
  const name = input.value.trim(); if(!name) return;
  const secs = sowLibSectionsCache[templateId]||[];
  const position = secs.length ? Math.max(...secs.map(s=>s.position||0))+1 : 0;
  const rows = await dbInsert('sow_library_sections', {template_id:templateId, name, position});
  if(rows){ input.value=''; await loadSowLibContents(templateId); toast('Section added'); render(); }
};
window.addSowLibTask = async function(templateId, sectionId){
  const input = document.getElementById(sectionId ? ('sowLibNewTaskName-'+sectionId) : ('sowLibNewTaskName-'+templateId));
  const name = input.value.trim(); if(!name) return;
  const tasks = sowLibTasksCache[templateId]||[];
  const position = tasks.length ? Math.max(...tasks.map(t=>t.position||0))+1 : 0;
  const row = {template_id:templateId, name, position};
  if(sectionId) row.section_id = sectionId;
  const rows = await dbInsert('sow_library_tasks', row);
  if(rows){ input.value=''; await loadSowLibContents(templateId); toast('Task added'); render(); }
};
window.renameSowLibSection = async function(templateId, sectionId){
  const secs = sowLibSectionsCache[templateId]||[];
  const s = secs.find(x=>x.id===sectionId);
  const name = await customPrompt('Section name', s?s.name:'');
  if(name===null) return;
  const trimmed = name.trim(); if(!trimmed){ toast('Name can\'t be empty.'); return; }
  const row = await dbUpdate('sow_library_sections', sectionId, {name:trimmed});
  if(row){ await loadSowLibContents(templateId); render(); }
};
window.deleteSowLibSection = async function(templateId, sectionId){
  if(!await customConfirm('Delete this section? Its tasks in the library are deleted too.')) return;
  const ok = await dbDelete('sow_library_sections', sectionId);
  if(ok){ await loadSowLibContents(templateId); toast('Section deleted'); render(); }
};
window.renameSowLibTask = async function(templateId, taskId){
  const tasks = sowLibTasksCache[templateId]||[];
  const t = tasks.find(x=>x.id===taskId);
  const name = await customPrompt('Task name', t?t.name:'');
  if(name===null) return;
  const trimmed = name.trim(); if(!trimmed){ toast('Name can\'t be empty.'); return; }
  const row = await dbUpdate('sow_library_tasks', taskId, {name:trimmed});
  if(row){ await loadSowLibContents(templateId); render(); }
};
window.deleteSowLibTask = async function(templateId, taskId){
  if(!await customConfirm('Delete this task?')) return;
  const ok = await dbDelete('sow_library_tasks', taskId);
  if(ok){ await loadSowLibContents(templateId); toast('Task deleted'); render(); }
};