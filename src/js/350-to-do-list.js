/* ================= TO DO LIST ================= */
let newTodoDraft = '';
let newTodoAssigneeDraft = '';
let newTodoDateDraft = '';
let newTodoCommentDraft = '';
let todoAddOpen = true;
let todoEmailRecipientIds = []; // PM ids ticked in the email picker
let todoEmailFilterText = ''; // filters the PM list when there are more than 10
let todoFilter = 'live';
let todoAssigneeEditId = null;
let todoAssigneeEditDraft = ''; // pm id chosen in the inline assignee-change picker, before Save (✓) commits it
let todoEditId = null; // id of the to-do whose text/date is being edited
let todoEditTextDraft = '';
let todoEditDateDraft = '';
let todoCommentDraft = {}; // todoId -> draft comment text
let todoClosedCommentsOpen = {}; // todoId -> whether a completed to-do's collapsed comments are expanded
let newTodoFilesDraft = []; // File objects picked before the to-do exists — uploaded right after addTodo() creates the row
let todoAttachUploadOpenId = null; // todo id whose "add photo/document" picker is showing
// Multi-tick selection on both the Live and Closed to-do lists (#296) —
// same selection-bar / export-PDF / email pattern as PPE (#198), extended to
// Certifications (#276) and the Operative Dashboard (#270).
let todoSelectedIds = new Set();
let todoBulkExportBusy = false, todoBulkEmailBusy = false;
window.toggleTodoSelect = function(id){
  if(todoSelectedIds.has(id)) todoSelectedIds.delete(id); else todoSelectedIds.add(id);
  render();
};
function todoSelectionBarHtml(todosOnScreen, siteId){
  const idsHere = new Set(todosOnScreen.map(t=>t.id));
  const selectedHere = Array.from(todoSelectedIds).filter(id=>idsHere.has(id));
  if(!selectedHere.length) return '';
  return `
    <div class="row-gap" style="margin-bottom:10px;">
      <button class="darkbtn" style="flex:1;font-size:11.5px;padding:7px;" ${todoBulkExportBusy?'disabled':''} onclick='exportSelectedTodos(${JSON.stringify(selectedHere)})'>${todoBulkExportBusy?'Building…':`Export ${selectedHere.length} (PDF)`}</button>
      <button class="ghostbtn exportbtn" style="flex:1;font-size:11.5px;padding:7px;" ${todoBulkEmailBusy?'disabled':''} onclick='openTodoEmailPicker(${JSON.stringify(siteId)},${JSON.stringify(selectedHere)})'>Email ${selectedHere.length}</button>
    </div>
  `;
}
// Builds a simple text PDF of the selected to-dos (text/status/date/
// assignee) — same buildX/exportSelectedX/emailSelectedX shape as the
// Certifications bundle (#276) and PPE (#198), just drawing rows of text
// instead of merging file pages since a to-do has no source document.
async function buildTodoBundlePdf(ids, siteId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const todos = await dbSelect('todos', 'id=in.('+ids.join(',')+')&order=created_at.asc');
  const site = SITES.find(s=>s.id===siteId);
  const doc = await PDFLib.PDFDocument.create();
  const {bold, reg, INK, SLATE, LINE} = await havsPdfFonts(doc);
  const PAGE_W=595.28, PAGE_H=841.89, MARGIN=44;
  let page = doc.addPage([PAGE_W,PAGE_H]);
  let y = PAGE_H - MARGIN;
  page.drawText('To Do List', {x:MARGIN, y, size:16, font:bold, color:INK}); y -= 18;
  if(site){ pdfDrawFit(page, pdfSiteLabel(site), {x:MARGIN, y, size:10.5, font:bold, color:INK}); y -= 22; } else { y -= 8; }
  todos.forEach(t=>{
    if(y < MARGIN+60){ page = doc.addPage([PAGE_W,PAGE_H]); y = PAGE_H-MARGIN; }
    page.drawText((t.done?'[Done] ':'[Live] ')+t.text, {x:MARGIN, y, size:11, font:bold, color:INK, maxWidth:PAGE_W-2*MARGIN}); y -= 15;
    const meta = [
      t.date_required_by ? 'Required by '+new Date(t.date_required_by+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : null,
      t.assigned_to ? 'Assigned to '+nameOf(t.assigned_to) : 'Unassigned',
    ].filter(Boolean).join(' · ');
    page.drawText(meta, {x:MARGIN, y, size:9.5, font:reg, color:SLATE}); y -= 12;
    page.drawLine({start:{x:MARGIN,y}, end:{x:PAGE_W-MARGIN,y}, thickness:0.5, color:LINE}); y -= 14;
  });
  const bytes = await doc.save();
  const filename = exportFilename(site?site.name:'', 'To Do List ('+todos.length+')', 'pdf');
  return {bytes, filename};
}
window.exportSelectedTodos = async function(ids){
  if(!ids || !ids.length) return;
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  todoBulkExportBusy = true; render();
  try{
    const {bytes, filename} = await buildTodoBundlePdf(ids, todoListLastSiteId);
    await deliverPdf(bytes, filename);
    ids.forEach(id=>todoSelectedIds.delete(id));
  }catch(e){ console.error(e); toast('Could not build the combined PDF.'); }
  todoBulkExportBusy = false; render();
};
// "Assign to a PM" as a filterable dropdown (#298) instead of a plain
// <select> — 'new' targets the Add To Do form's draft assignee, any other
// value is the to-do id being edited inline. Same open/filter/pick pattern
// as the supplier picker (setSupplierPickerFilter) and the OneDrive folder
// pickers elsewhere in the app.
let todoAssigneePickerOpenId = null;
let todoAssigneePickerFilter = '';
window.toggleTodoAssigneePicker = function(key){
  todoAssigneePickerOpenId = todoAssigneePickerOpenId===key ? null : key;
  todoAssigneePickerFilter = '';
  render();
};
window.setTodoAssigneePickerFilter = function(v){ todoAssigneePickerFilter = v; render(); };
function todoAssigneePickerListHtml(key, pmList, currentId){
  const filter = (todoAssigneePickerFilter||'').toLowerCase();
  const list = pmList.filter(p=>!filter || p.name.toLowerCase().includes(filter));
  return `
    <div class="card" style="margin-top:6px;padding:8px;" id="todoAssigneePickerList_${key}">
      ${pmList.length>6 ? `<input type="text" placeholder="Search project managers…" value="${escapeHtml(todoAssigneePickerFilter||'')}" oninput="setTodoAssigneePickerFilter(this.value)" style="margin-bottom:6px;">` : ''}
      <div style="max-height:180px;overflow-y:auto;">
        <div class="statusmenu-item" onclick="pickTodoAssignee('${key}','')">Unassigned</div>
        ${list.map(p=>`<div class="statusmenu-item" style="${currentId===p.id?'font-weight:700;color:var(--brand1);':''}" onclick="pickTodoAssignee('${key}','${p.id}')">${escapeHtml(p.name)}</div>`).join('') || `<div class="empty" style="padding:8px 0;">No matches.</div>`}
      </div>
    </div>
  `;
}
function renderTodoAssigneePickerList(){
  const key = todoAssigneePickerOpenId;
  const wrap = key!=null ? document.getElementById('todoAssigneePickerList_'+key) : null;
  if(!wrap) { render(); return; }
  // Filtering just re-renders the whole card in place via a normal render()
  // call — the list is short enough that this doesn't need the isolated-DOM
  // trick used for the (much longer) email recipient picker.
  render();
}
window.pickTodoAssignee = function(key, pmId){
  if(key==='new'){ newTodoAssigneeDraft = pmId; }
  else { todoAssigneeEditDraft = pmId; }
  todoAssigneePickerOpenId = null;
  render();
};
window.toggleTodoCommentsOpen = function(todoId){ todoClosedCommentsOpen[todoId] = !todoClosedCommentsOpen[todoId]; render(); };
// Email picker — themed HTML email (same look as material order emails)
// listing the live to-dos, sent to whichever project managers are ticked.
// The modal is a persistent DOM node appended outside #app (same pattern as
// the toolbox-talk email prompt) so typing in the filter box or ticking
// checkboxes doesn't get wiped by the page's own render() cycle.
let todoEmailPmListCache = [];
// selectedIds (optional, #296): when given, the email is scoped to just
// those ticked to-do rows instead of the whole live list.
window.openTodoEmailPicker = async function(siteId, selectedIds){
  const pmList = await loadPMList();
  const site = SITES.find(s=>s.id===siteId);
  todoEmailPmListCache = pmList;
  todoEmailRecipientIds = [];
  todoEmailFilterText = '';
  todoEmailSelectedIds = (selectedIds && selectedIds.length) ? selectedIds : null;
  let ov = document.getElementById('todoEmailModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'todoEmailModalOverlay';
    ov.className = 'geo-modal-overlay';
    ov.onclick = (e)=>{ if(e.target===ov) window.closeTodoEmailPicker(); };
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div class="geo-modal-card" style="max-width:400px;">
      <h3>Email To Do List</h3>
      <p class="stub">Choose which project managers should receive the${todoEmailSelectedIds?' '+todoEmailSelectedIds.length+' selected to-do'+(todoEmailSelectedIds.length===1?'':'s'):' live to-do list'} for this site.</p>
      ${pmList.length>10 ? `<div class="formfield"><input type="text" id="todoEmailFilterInput" placeholder="Filter project managers…" oninput="filterTodoEmailPmList(this.value)"></div>` : ''}
      <div id="todoEmailPmListWrap" style="max-height:240px;overflow-y:auto;margin-bottom:14px;"></div>
      ${ccClientTickHtml(site, 'todoEmailCcClient')}
      <button class="darkbtn" id="todoEmailConfirmBtn" style="width:100%;" onclick="confirmEmailTodoList('${siteId}')">Send</button>
      <button class="geo-modal-cancel" onclick="closeTodoEmailPicker()">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
  renderTodoEmailPmList();
};
let todoEmailSelectedIds = null; // set by the #296 multi-select "Email N" action; null = whole live list
function renderTodoEmailPmList(){
  const wrap = document.getElementById('todoEmailPmListWrap');
  if(!wrap) return;
  const filter = (todoEmailFilterText||'').toLowerCase();
  const list = todoEmailPmListCache.filter(p=>!filter || p.name.toLowerCase().includes(filter) || (p.email||'').toLowerCase().includes(filter));
  wrap.innerHTML = list.map(p=>`
    <label style="display:flex;align-items:center;gap:8px;padding:7px 2px;font-size:12.5px;cursor:pointer;">
      <input type="checkbox" style="width:auto;" ${todoEmailRecipientIds.includes(p.id)?'checked':''} onchange="toggleTodoEmailRecipient('${p.id}',this.checked)">
      <span>${escapeHtml(p.name)} <span style="color:var(--slate);font-size:10.5px;">${escapeHtml(p.email||'')}</span></span>
    </label>
  `).join('') || `<div class="empty">No project managers found.</div>`;
}
window.filterTodoEmailPmList = function(v){ todoEmailFilterText = v; renderTodoEmailPmList(); };
window.toggleTodoEmailRecipient = function(id, checked){
  if(checked){ if(!todoEmailRecipientIds.includes(id)) todoEmailRecipientIds.push(id); }
  else { todoEmailRecipientIds = todoEmailRecipientIds.filter(x=>x!==id); }
};
window.closeTodoEmailPicker = function(){
  const ov = document.getElementById('todoEmailModalOverlay');
  if(ov) ov.style.display = 'none';
};
window.confirmEmailTodoList = async function(siteId){
  if(!todoEmailRecipientIds.length){ toast('Pick at least one project manager.'); return; }
  const btn = document.getElementById('todoEmailConfirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  try{
    const res = await sbFetch('/functions/v1/send-todo-email', {method:'POST', body: JSON.stringify({site_id: siteId, recipient_ids: todoEmailRecipientIds, todo_ids: todoEmailSelectedIds||undefined, client_cc_email: ccClientEmailIfTicked(SITES.find(s=>s.id===siteId), 'todoEmailCcClient')})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Email failed — '+(d.error||res.status)); if(btn){ btn.disabled=false; btn.textContent='Send'; } return; }
    toast('To-do list emailed');
    if(todoEmailSelectedIds){ todoEmailSelectedIds.forEach(id=>todoSelectedIds.delete(id)); todoEmailSelectedIds = null; render(); }
    window.closeTodoEmailPicker();
  }catch(e){ console.error(e); toast('Could not send email.'); if(btn){ btn.disabled=false; btn.textContent='Send'; } }
};
let todoListLastSiteId; // undefined initially so the very first render always "changes"
async function renderTodoList(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  // Every piece of to-do UI state below (which filter tab, which row is mid-
  // edit, the draft new-todo fields, the email picker's ticked recipients)
  // was only ever reset when leaving the To Do List page entirely — not when
  // jumping straight from one site's To Do List to a DIFFERENT site's To Do
  // List (e.g. via a notification, or the tab staying on "todos" while the
  // URL's site id changes). That gap could leave things like an in-progress
  // edit or a stuck filter pointing at state that doesn't belong to the site
  // now on screen. The list itself was always fetched fresh and scoped by
  // site_id, but reset all of this whenever the site actually changes too,
  // not just on page change, so nothing can look like it "carried over".
  if(todoListLastSiteId !== siteId){
    todoListLastSiteId = siteId;
    newTodoDraft = ''; newTodoAssigneeDraft = ''; newTodoDateDraft = ''; newTodoCommentDraft = ''; newTodoFilesDraft = [];
    todoAddOpen = true; todoFilter = 'live'; todoAssigneeEditId = null; todoEditId = null;
    todoEmailRecipientIds = []; todoEmailFilterText = ''; todoClosedCommentsOpen = {}; todoAttachUploadOpenId = null;
    todoSelectedIds = new Set(); todoAssigneePickerOpenId = null; todoAssigneePickerFilter = '';
  }
  const [allTodos, pmList] = await Promise.all([
    dbSelect('todos', 'site_id=eq.'+siteId+'&order=created_at.asc'),
    loadPMList(),
  ]);
  const todos = allTodos.filter(t => todoFilter==='live' ? !t.done : t.done);
  let commentsByTodo = {}, attachmentsByTodo = {};
  if(todos.length){
    const ids = todos.map(t=>t.id).join(',');
    const [comments, attachments] = await Promise.all([
      dbSelect('todo_comments', 'todo_id=in.('+ids+')&order=created_at.asc'),
      dbSelect('todo_attachments', 'todo_id=in.('+ids+')&order=uploaded_at.asc'),
    ]);
    comments.forEach(c=>{ (commentsByTodo[c.todo_id]=commentsByTodo[c.todo_id]||[]).push(c); });
    attachments.forEach(a=>{ (attachmentsByTodo[a.todo_id]=attachmentsByTodo[a.todo_id]||[]).push(a); });
  }
  const addForm = `
      <div class="formfield">
        <input type="text" id="newTodoText" placeholder="What needs doing?" value="${escapeHtml(newTodoDraft)}" oninput="newTodoDraft=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();addTodo('${siteId}');}">
      </div>
      <div class="formfield">
        <label class="field-label">Comments (optional)</label>
        <textarea id="newTodoComment" placeholder="Add any notes…" oninput="newTodoCommentDraft=this.value">${escapeHtml(newTodoCommentDraft)}</textarea>
      </div>
      <div class="row-gap" style="align-items:flex-start;">
        <div class="formfield" onclick="openDatePickerRow(this)" style="flex:1 1 0;min-width:0;">
          <label class="field-label" style="min-height:27px;">Date required by (optional)</label>
          <input type="date" id="newTodoDate" value="${escapeHtml(newTodoDateDraft)}" oninput="newTodoDateDraft=this.value" style="width:100%;box-sizing:border-box;">
        </div>
        <div class="formfield" style="flex:1 1 0;min-width:0;">
          <label class="field-label" style="min-height:27px;">Assign to a PM (optional)</label>
          <div class="ddrow" style="margin:0;padding-top:10px;padding-bottom:10px;box-sizing:border-box;min-height:41px;" onclick="toggleTodoAssigneePicker('new')">
            <span class="arrow">${todoAssigneePickerOpenId==='new'?'▼':'▶'}</span> ${newTodoAssigneeDraft ? escapeHtml(nameOf(newTodoAssigneeDraft)) : 'Unassigned'}
          </div>
          ${todoAssigneePickerOpenId==='new' ? todoAssigneePickerListHtml('new', pmList, newTodoAssigneeDraft) : ''}
        </div>
      </div>
      <div class="formfield">
        <label class="field-label">Photos / documents (optional)</label>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;" onclick="document.getElementById('newTodoFilesInput').click()">Choose file(s)</div>
        <input type="file" id="newTodoFilesInput" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="addNewTodoFiles(this)">
        ${newTodoFilesDraft.length ? newTodoFilesDraft.map((f,i)=>`
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;">
            <span class="stub" style="margin:0;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.name)}</span>
            <span style="cursor:pointer;color:var(--warn);font-size:11.5px;font-weight:700;" onclick="removeNewTodoFile(${i})">Remove</span>
          </div>
        `).join('') : ''}
      </div>
      <button class="darkbtn" onclick="addTodo('${siteId}')">Add To Do</button>
  `;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="filterrow">
      <div class="filterchip ${todoFilter==='live'?'active':''}" onclick="todoFilter='live';render()">Live</div>
      <div class="filterchip ${todoFilter==='closed'?'active':''}" onclick="todoFilter='closed';render()">Closed</div>
    </div>

    ${todoSelectionBarHtml(todos, siteId)}
    ${todos.length ? todos.map(t=>`
      <div class="card" style="padding:12.6px;margin-bottom:10.8px;">
        <div style="display:flex;align-items:flex-start;gap:9px;">
          <input type="checkbox" style="width:17px;height:17px;flex:0 0 17px;margin-top:2px;" ${todoSelectedIds.has(t.id)?'checked':''} onclick="toggleTodoSelect('${t.id}')">
          <div style="flex:1;min-width:0;">
            ${todoEditId===t.id ? `
              <div class="formfield" style="margin-top:0;">
                <input type="text" value="${escapeHtml(todoEditTextDraft)}" oninput="todoEditTextDraft=this.value" style="font-size:12.6px;padding:6px 8px;">
              </div>
              <div class="formfield" onclick="openDatePickerRow(this)" style="margin:6px 0 0;">
                <label class="field-label">Date required by</label>
                <input type="date" id="todoEditDateInput" value="${escapeHtml(todoEditDateDraft)}" oninput="todoEditDateDraft=this.value">
              </div>
              <div class="row-gap" style="margin-top:8px;">
                <button class="darkbtn" style="width:auto;padding:7px 14px;font-size:11.7px;" onclick="saveTodoEdit('${siteId}','${t.id}')">Save</button>
                <button class="ghostbtn" style="width:auto;padding:7px 14px;font-size:11.7px;" onclick="todoEditId=null;render()">Cancel</button>
              </div>
            ` : `
              <div style="font-size:16.5px;font-weight:600;${t.done?'text-decoration:line-through;color:var(--slate);':''}">${escapeHtml(t.text)}</div>
              ${t.date_required_by ? (()=>{
                const isOverdue = !t.done && t.date_required_by < localISODate(new Date());
                const dLabel = new Date(t.date_required_by+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});
                return `<div style="display:inline-flex;align-items:center;gap:4px;margin-top:8px;padding:3px 9px;border-radius:12px;font-size:11px;font-weight:700;cursor:pointer;${isOverdue?'background:var(--warn-bg);color:var(--warn);':'background:var(--line);color:var(--slate);'}" onclick="openTodoDateEdit('${siteId}','${t.id}','${t.date_required_by||''}','${jsAttr(t.text)}')">${isOverdue?'⚠ Overdue — ':'Required by '}${dLabel}</div>`;
              })() : ''}
            `}
            ${t.done ? `
              <div style="margin-top:6px;font-size:10.8px;font-style:italic;color:var(--slate);">
                ${t.assigned_to ? 'Assigned to <b style="font-style:normal;">'+escapeHtml(nameOf(t.assigned_to))+'</b>' : 'Unassigned'}
              </div>
            ` : todoAssigneeEditId===t.id ? `
              <div style="margin-top:5px;">
                <div class="ddrow" style="margin:0;" onclick="toggleTodoAssigneePicker('${t.id}')">
                  <span class="arrow">${todoAssigneePickerOpenId===t.id?'▼':'▶'}</span> ${todoAssigneeEditDraft ? escapeHtml(nameOf(todoAssigneeEditDraft)) : 'Unassigned'}
                </div>
                ${todoAssigneePickerOpenId===t.id ? todoAssigneePickerListHtml(t.id, pmList, todoAssigneeEditDraft) : ''}
                <div class="row-gap" style="margin-top:6px;">
                  <span class="taskicon" style="cursor:pointer;width:23.4px;height:23.4px;font-size:12.6px;color:var(--ok);border-color:var(--ok);" onclick="changeTodoAssignee('${siteId}','${t.id}',todoAssigneeEditDraft||'')">✓</span>
                  <span class="taskicon" style="cursor:pointer;width:23.4px;height:23.4px;font-size:12.6px;" onclick="todoAssigneeEditId=null;todoAssigneePickerOpenId=null;render()">✕</span>
                </div>
              </div>
            ` : `
              <div style="margin-top:6px;font-size:10.8px;font-style:italic;color:var(--slate);cursor:pointer;" onclick="todoAssigneeEditId='${t.id}';todoAssigneeEditDraft='${t.assigned_to||''}';render()">
                ${t.assigned_to ? 'Assigned to <b style="font-style:normal;">'+escapeHtml(nameOf(t.assigned_to))+'</b> — tap to change' : 'Tap to assign a project manager'}
              </div>
            `}
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:8px;flex-wrap:wrap;">
          <button class="ghostbtn" style="width:auto;padding:5px 10px;font-size:10px;font-weight:800;white-space:nowrap;background:var(--ok-bg);color:var(--ok);border-color:var(--ok);" onclick="toggleTodo('${siteId}','${t.id}',${t.done})">${t.done?'✓ Completed':'Mark Complete'}</button>
          <div onclick="event.stopPropagation();">
            ${rowActionsMenuHtml('todo-'+t.id, `
              ${!t.done ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;todoEditId='${t.id}';todoEditTextDraft='${jsAttr(t.text)}';todoEditDateDraft='${t.date_required_by||''}';render()">✎ Edit</div>` : ''}
              <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteTodo('${siteId}','${t.id}')">🗑 Delete</div>
            `)}
          </div>
        </div>
        <div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--line);">
          ${(attachmentsByTodo[t.id]||[]).map(a=>`
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
              <span style="font-size:11.5px;cursor:pointer;text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" onclick="viewTodoAttachment('${t.id}','${jsAttr(a.storage_path)}','${jsAttr(a.name)}')">📎 ${escapeHtml(a.name)}</span>
              <span style="cursor:pointer;color:var(--warn);font-size:11px;" onclick="deleteTodoAttachment('${a.id}','${jsAttr(a.storage_path)}')">🗑</span>
            </div>
          `).join('')}
          ${todoAttachUploadOpenId===t.id ? `
            <div style="margin-bottom:6px;">
              <div class="ghostbtn" style="cursor:pointer;text-align:center;padding:6px;font-size:11.5px;" onclick="document.getElementById('todoAttachInput_${t.id}').click()">Choose file(s)</div>
              <input type="file" id="todoAttachInput_${t.id}" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="uploadTodoAttachmentNow(this,'${siteId}','${t.id}')">
            </div>
          ` : `<p class="stub" style="margin:0 0 6px;font-size:11px;cursor:pointer;text-decoration:underline;" onclick="toggleTodoAttachUpload('${t.id}')">+ Add photo/document</p>`}
        </div>
        ${t.done && !todoClosedCommentsOpen[t.id] ? `
        <div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--line);">
          <p class="ddrow" style="margin:0;" onclick="toggleTodoCommentsOpen('${t.id}')"><span class="arrow">▶</span> Comments${(commentsByTodo[t.id]||[]).length ? ' ('+(commentsByTodo[t.id]||[]).length+')' : ''}</p>
        </div>
        ` : `
        <div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--line);">
          ${t.done ? `<p class="ddrow" style="margin:0 0 6px;" onclick="toggleTodoCommentsOpen('${t.id}')"><span class="arrow">▼</span> Comments</p>` : `<p class="field-label" style="margin:0 0 6px;font-size:9px;">Comments</p>`}
          ${(commentsByTodo[t.id]||[]).map(c=>`
            <div style="margin-bottom:6px;font-size:11.3px;">
              <b>${escapeHtml(nameOf(c.created_by))}</b> <span style="color:var(--slate);font-size:9.9px;">${new Date(c.created_at).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
              <div>${escapeHtml(c.body)}</div>
            </div>
          `).join('') || `<p class="stub" style="margin:0 0 8px;font-size:11px;">No comments yet — add one if something isn't possible.</p>`}
          <div class="row-gap">
            <input type="text" placeholder="Add a comment…" value="${escapeHtml(todoCommentDraft[t.id]||'')}" oninput="todoCommentDraft['${t.id}']=this.value" onkeydown="if(event.key==='Enter'){event.preventDefault();addTodoComment('${siteId}','${t.id}');}" style="flex:2;font-size:11.7px;padding:6px 8px;">
            <button class="ghostbtn" style="flex:1;padding:6px 10px;font-size:11.3px;" onclick="addTodoComment('${siteId}','${t.id}')">Comment</button>
          </div>
        </div>
        `}
      </div>
    `).join('') : `<div class="empty">No ${todoFilter} to-dos.</div>`}

    ${todoFilter==='live' ? (() => {
      // No items yet — nothing to hide behind a dropdown, so keep the add
      // form expanded. Once at least one to-do exists, it collapses behind
      // the usual ddrow toggle (closed by default, same as after adding).
      const addOpen = allTodos.length===0 ? true : todoAddOpen;
      return `
        <div class="ddrow" style="margin-top:18px;" onclick="todoAddOpen=!todoAddOpen;render()"><span class="arrow">${addOpen?'▼':'▶'}</span> Add To Do</div>
        ${addOpen ? `<div class="card">${addForm}</div>` : ''}
      `;
    })() : ''}

    ${todoFilter==='live' && todos.length ? `
      <button class="ghostbtn exportbtn" style="margin-top:14px;" onclick="openTodoEmailPicker('${siteId}')">Email To Do List</button>
    ` : ''}
  `, {title:'To Do List', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, activeTab:'todos'}); }
}
// Clicking the "Required by" date text on a to-do row (#293) drops straight
// into edit mode with the date picker already open, rather than requiring
// the separate ✎ edit icon first.
window.openTodoDateEdit = function(siteId, todoId, dateVal, textVal){
  todoEditId = todoId; todoEditTextDraft = textVal||''; todoEditDateDraft = dateVal||'';
  render();
  requestAnimationFrame(()=>{ const el=document.getElementById('todoEditDateInput'); if(el) openDatePickerRow(el); });
};
window.addNewTodoFiles = function(input){
  const files = input.files ? Array.from(input.files) : [];
  newTodoFilesDraft = newTodoFilesDraft.concat(files);
  render();
};
window.removeNewTodoFile = function(idx){
  newTodoFilesDraft.splice(idx, 1);
  render();
};
async function uploadTodoAttachment(todoId, file){
  const path = todoId+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('todo-attachments', path, file, file.type||'application/octet-stream');
  if(!stored) return false;
  const rows = await dbInsert('todo_attachments', {todo_id:todoId, name:file.name, storage_path:stored, size:file.size||null, uploaded_by:ME.id});
  return !!rows;
}
window.addTodo = async function(siteId){
  const text = (newTodoDraft||'').trim();
  if(!text){ toast('Enter what needs doing first.'); return; }
  // dbInsert returns an ARRAY of inserted rows — this used to treat it as
  // the row itself, so row.id was undefined and the first comment, the
  // attachments and the assignee notification all went out with no to-do id.
  const todoRows = await dbInsert('todos', {site_id:siteId, text, assigned_to: newTodoAssigneeDraft||null, date_required_by: newTodoDateDraft||null, created_by:ME.id});
  const row = todoRows && todoRows[0];
  if(row){
    const comment = (newTodoCommentDraft||'').trim();
    if(comment) await dbInsert('todo_comments', {todo_id:row.id, body:comment, created_by:ME.id});
    if(newTodoFilesDraft.length){
      for(const f of newTodoFilesDraft){ await uploadTodoAttachment(row.id, f); }
    }
    if(newTodoAssigneeDraft){
      const site = SITES.find(s=>s.id===siteId);
      postSystemMessage(siteId, 'todo_assigned', (site?site.name+': ':'')+'New to-do assigned to '+nameOf(newTodoAssigneeDraft)+': '+text);
      notifyTodoAssigned(siteId, row.id, newTodoAssigneeDraft);
    }
    newTodoDraft = '';
    newTodoAssigneeDraft = '';
    newTodoDateDraft = '';
    newTodoCommentDraft = '';
    newTodoFilesDraft = [];
    // Add To Do row (#295) stays expanded after adding — only an explicit
    // tap on its own ddrow toggle (or leaving the page) closes it.
    toast('Added to the to-do list');
    render();
  }
};
window.toggleTodoAttachUpload = function(todoId){
  todoAttachUploadOpenId = todoAttachUploadOpenId===todoId ? null : todoId;
  render();
};
window.uploadTodoAttachmentNow = async function(input, siteId, todoId){
  const files = input.files ? Array.from(input.files) : [];
  if(!files.length) return;
  let uploaded = 0;
  for(const f of files){ if(await uploadTodoAttachment(todoId, f)) uploaded++; }
  if(uploaded){ toast(uploaded===1?'Attachment added':uploaded+' attachments added'); todoAttachUploadOpenId = null; }
  render();
};
window.viewTodoAttachment = async function(todoId, storagePath, name){
  try{
    const res = await sbFetchOD('/functions/v1/todo-attachment-access', {method:'POST', body: JSON.stringify({todo_id:todoId, storage_path:storagePath})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Could not open file — '+(d.error||res.status)); return; }
    viewDrawing(d.url, /\.(png|jpe?g|gif|webp)$/i.test(name), name);
  }catch(e){ toast('Could not open file.'); }
};
window.deleteTodoAttachment = async function(id, storagePath){
  if(!await customConfirm('Delete this attachment? This can\'t be undone.')) return;
  const ok = await dbDelete('todo_attachments', id);
  if(ok){
    if(storagePath){ try{ await sbFetch('/storage/v1/object/todo-attachments/'+storagePath, {method:'DELETE'}); }catch(e){ /* non-fatal */ } }
    toast('Attachment deleted');
    render();
  }
};
window.toggleTodo = async function(siteId, id, done){
  const row = await dbUpdate('todos', id, {done: !done});
  if(row){ toast(done ? 'Reopened' : 'Closed'); render(); }
};
window.saveTodoEdit = async function(siteId, id){
  const text = (todoEditTextDraft||'').trim();
  if(!text){ toast('To-do text can\'t be empty.'); return; }
  const row = await dbUpdate('todos', id, {text, date_required_by: todoEditDateDraft||null});
  if(row){
    todoEditId = null;
    toast('To-do updated');
    render();
  }
};
window.changeTodoAssignee = async function(siteId, id, pmId){
  const row = await dbUpdate('todos', id, {assigned_to: pmId || null});
  if(row){
    todoAssigneeEditId = null;
    toast(pmId ? 'Project manager updated' : 'Project manager removed');
    if(pmId){
      const site = SITES.find(s=>s.id===siteId);
      postSystemMessage(siteId, 'todo_assigned', (site?site.name+': ':'')+'To-do assigned to '+nameOf(pmId)+': '+row.text);
    }
    render();
  }
};
window.addTodoComment = async function(siteId, todoId){
  const body = (todoCommentDraft[todoId]||'').trim();
  if(!body) return;
  const rows = await dbInsert('todo_comments', {todo_id:todoId, body, created_by:ME.id});
  if(rows){
    todoCommentDraft[todoId] = '';
    render();
  }
};
window.deleteTodo = async function(siteId, id){
  if(!await customConfirm('Delete this to-do item? This can\'t be undone.')) return;
  const rows = await dbSelect('todos', 'id=eq.'+id+'&select=text');
  const text = rows[0] && rows[0].text;
  const ok = await dbDelete('todos', id);
  if(ok){ toast('To-do deleted'); logSiteActivity(siteId, 'todo_deleted', `Deleted to-do "${text||''}"`); render(); }
};
window.setGeofenceRadius = async function(siteId, radius){
  const row = await dbUpdate('sites', siteId, {geofence_radius_m: radius});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast('Check-in distance set to '+radius+'m');
    render();
  }
};
window.setGeofence = async function(siteId){
  if(!orgAllowsGps()){ toast('GPS check-in & geofencing needs OpHUB Pro or above.'); return; }
  toast('Getting GPS lock…');
  const g = await getGeo();
  if(g.error){ toast(g.error); return; }
  const row = await dbUpdate('sites', siteId, {geofence_lat:g.lat, geofence_lon:g.lon});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    SITES[idx] = row;
    toast('Site location saved — now choose the check-in distance below');
    // Straight into the distance picker rather than leaving it collapsed —
    // setting a location isn't finished until a check-in/out distance is
    // also confirmed, so don't make that a second, easy-to-miss step.
    checkinGeofenceOpen = true;
    render();
  }
};
async function saveGeofenceCoords(siteId, lat, lon){
  const row = await dbUpdate('sites', siteId, {geofence_lat:lat, geofence_lon:lon});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    SITES[idx] = row;
    toast('Site location saved — now choose the check-in distance below');
    checkinGeofenceOpen = true;
    render();
  }
}
// Pop-up giving the PM/admin a choice: capture the phone's current GPS
// position, or type in known co-ordinates for the job (e.g. from a plan or
// Google Maps) instead of having to stand on site.
window.openGeoOptions = function(siteId){
  if(!orgAllowsGps()){ toast('GPS check-in & geofencing needs OpHUB Pro or above.'); return; }
  let ov = document.getElementById('geoModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'geoModalOverlay';
    ov.className = 'geo-modal-overlay';
    ov.onclick = (e)=>{ if(e.target===ov) closeGeoModal(); };
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div class="geo-modal-card">
      <h3>Set site location</h3>
      <p class="stub">Choose how to set the GPS point operatives must check in near.</p>
      <button class="geo-modal-btn" onclick="geoOptionManual('${siteId}')">Input GPS Co-Ordinates<span class="sub2">Type in latitude &amp; longitude</span></button>
      <button class="geo-modal-btn" onclick="geoOptionClick('${siteId}')">Click for GPS Co-Ordinates<span class="sub2">Use this device's current location</span></button>
      <button class="geo-modal-cancel" onclick="closeGeoModal()">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
};
window.closeGeoModal = function(){
  const ov = document.getElementById('geoModalOverlay');
  if(ov) ov.style.display = 'none';
};
window.geoOptionClick = async function(siteId){
  closeGeoModal();
  await window.setGeofence(siteId);
};
window.geoOptionManual = function(siteId){
  const ov = document.getElementById('geoModalOverlay');
  if(!ov) return;
  ov.innerHTML = `
    <div class="geo-modal-card">
      <h3>Input GPS Co-Ordinates</h3>
      <p class="stub">Paste or type the site's latitude and longitude — plain decimal (51.51828) or Google's degrees/minutes/seconds format (51°31'05.8"N) both work. You can also paste a full pair straight from Google into the Latitude box and it'll split itself.</p>
      <div class="formfield"><label class="field-label">Latitude</label><input type="text" id="geoManualLat" placeholder="e.g. 51.51828 or 51°31'05.8&quot;N" oninput="updateGeoMapLink()"></div>
      <div class="formfield"><label class="field-label">Longitude</label><input type="text" id="geoManualLon" placeholder="e.g. -0.15139 or 0°09'05.0&quot;W" oninput="updateGeoMapLink()"></div>
      <p id="geoManualPreview" class="stub" style="display:none;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;margin:-6px 0 6px;"></p>
      <a id="geoManualMapLink" class="stub" style="display:none;margin:0 0 12px;color:var(--blue);" href="#" target="_blank" rel="noopener">Find this spot on the map ↗</a>
      <button class="darkbtn" style="width:100%;" onclick="saveManualGeo('${siteId}')">Save Location</button>
      <button class="geo-modal-cancel" onclick="openGeoOptions('${siteId}')">‹ Back</button>
    </div>`;
};
// Converts one co-ordinate token to decimal degrees. Accepts plain decimal
// ("51.51828", "-0.15139"), decimal with a hemisphere letter ("0.15139 W"),
// and degrees/minutes/seconds as copied straight out of Google Maps/Google
// Search ("51°31'05.8"N", "0°09'05.0"W", also tolerates straight quotes,
// curly quotes, "deg"/"min"/"sec" words, and missing seconds).
function parseCoordToken(raw){
  if(raw==null) return NaN;
  let str = String(raw).trim();
  if(!str) return NaN;
  str = str.replace(/[’′]/g,"'").replace(/[”″]/g,'"');
  // Plain decimal, optionally with a trailing/leading hemisphere letter.
  let m = str.match(/^([NSEW])?\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?$/i);
  if(m){
    let val = parseFloat(m[2]);
    const hem = (m[1]||m[3]||'').toUpperCase();
    if(hem==='S'||hem==='W') val = -Math.abs(val);
    else if(hem==='N'||hem==='E') val = Math.abs(val);
    return val;
  }
  // Degrees° minutes' seconds" [hemisphere]
  m = str.match(/^(-?\d+(?:\.\d+)?)\s*(?:°|deg)\s*(\d+(?:\.\d+)?)?\s*(?:'|min)?\s*(\d+(?:\.\d+)?)?\s*(?:"|sec)?\s*([NSEW])?$/i);
  if(m && (m[2]!=null || m[4]!=null)){
    const deg = parseFloat(m[1]);
    const min = m[2]!=null ? parseFloat(m[2]) : 0;
    const sec = m[3]!=null ? parseFloat(m[3]) : 0;
    let val = Math.abs(deg) + min/60 + sec/3600;
    const hem = (m[4]||'').toUpperCase();
    if(hem==='S'||hem==='W' || deg<0) val = -val;
    return val;
  }
  return NaN;
}
// If someone pastes a full "lat, lon" pair (either decimal or DMS) into a
// single box, split it into the two halves so each can be parsed on its own.
function splitCoordPair(str){
  if(!str) return null;
  const s = String(str).trim();
  // DMS pair: two chunks each ending in a hemisphere letter.
  const dmsMatches = s.match(/-?\d+(?:\.\d+)?\s*(?:°|deg)\s*\d*(?:\.\d+)?\s*(?:'|min)?\s*\d*(?:\.\d+)?\s*(?:"|sec)?\s*[NSEW]/gi);
  if(dmsMatches && dmsMatches.length===2) return [dmsMatches[0].trim(), dmsMatches[1].trim()];
  // Decimal pair separated by comma and/or whitespace, e.g. "51.51828, -0.15139".
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if(m) return [m[1], m[2]];
  return null;
}
window.updateGeoMapLink = function(){
  const latEl = document.getElementById('geoManualLat');
  const lonEl = document.getElementById('geoManualLon');
  if(!latEl || !lonEl) return;
  // Auto-split a full pair pasted into either single box.
  const pastedInLat = splitCoordPair(latEl.value);
  if(pastedInLat && !lonEl.value.trim()){ latEl.value = pastedInLat[0]; lonEl.value = pastedInLat[1]; }
  else {
    const pastedInLon = splitCoordPair(lonEl.value);
    if(pastedInLon && !latEl.value.trim()){ latEl.value = pastedInLon[0]; lonEl.value = pastedInLon[1]; }
  }
  const lat = parseCoordToken(latEl.value);
  const lon = parseCoordToken(lonEl.value);
  const link = document.getElementById('geoManualMapLink');
  const preview = document.getElementById('geoManualPreview');
  const valid = isFinite(lat) && isFinite(lon) && lat>=-90 && lat<=90 && lon>=-180 && lon<=180;
  if(link) link.style.display = valid ? 'block' : 'none';
  if(valid) link.href = `https://www.google.com/maps?q=${lat},${lon}`;
  if(preview){
    if(valid){ preview.textContent = 'Interpreted as: '+lat.toFixed(5)+', '+lon.toFixed(5); preview.style.display='block'; }
    else { preview.style.display = 'none'; }
  }
};
window.saveManualGeo = async function(siteId){
  const lat = parseCoordToken(document.getElementById('geoManualLat').value);
  const lon = parseCoordToken(document.getElementById('geoManualLon').value);
  if(!isFinite(lat) || !isFinite(lon) || lat<-90 || lat>90 || lon<-180 || lon>180){
    toast('Could not read that as a co-ordinate — use decimal (51.51828) or degrees/minutes/seconds (51°31\'05.8"N).');
    return;
  }
  closeGeoModal();
  await saveGeofenceCoords(siteId, lat, lon);
};
