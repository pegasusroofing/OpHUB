/* ================= RAMS BUILDER (trial) — create + edit screens =================
 * Routes:
 *   #/site/<id>/hs/rams/new            start: blank, from a template, or copy another job's RAMS
 *   #/site/<id>/hs/rams/build/<buildId> the editor (Details / Risk Assessment / Method Statement / Issue)
 * Every hazard and every method-statement section is its own item: move up /
 * down, edit, duplicate, delete, add from the library, or write a new one
 * (and optionally save it back to the library). Changes save automatically. */
let ramsEd = null; // {buildId, build, tab, editId, picker, pickerSel:Set, pickerQ, saving}
let ramsSaveTimer = null;
function ramsBuildList(b, k){ return Array.isArray(b[k]) ? b[k] : []; }
function ramsQueueSave(){
  clearTimeout(ramsSaveTimer);
  ramsSaveTimer = setTimeout(ramsSaveNow, 700);
  const el = document.getElementById('ramsSaveState'); if(el) el.textContent = 'Saving…';
}
async function ramsSaveNow(){
  clearTimeout(ramsSaveTimer);
  if(!ramsEd || !ramsEd.build) return;
  const b = ramsEd.build;
  const row = await dbUpdate('rams_builds', b.id, {title:b.title, details:b.details, hazards:b.hazards, sections:b.sections, ppe:b.ppe, updated_at:new Date().toISOString()});
  const el = document.getElementById('ramsSaveState');
  if(el) el.textContent = row ? 'All changes saved' : 'Not saved — check signal';
}
// Client contact as entered on the job's Client Info tab.
function ramsSiteClientContact(site){
  if(!site) return '';
  const who = [site.client_contact_name, site.client_name && site.client_name!==site.client_contact_name ? '('+site.client_name+')' : ''].filter(Boolean).join(' ');
  return [who, site.client_phone, site.client_email].filter(Boolean).join(' · ');
}
// Ticked on every new RAMS (more can be added, any can be unticked).
const RAMS_DEFAULT_PPE = ['hat','boots','hivis','hand','eye'];
function ramsDefaultDetails(site){
  const st = ramsSettings();
  const today = localISODate(new Date());
  const review = new Date(); review.setFullYear(review.getFullYear()+1);
  return {
    raNumber: String(st.nextRa).padStart(10,'0'), msNumber: String(st.nextMs),
    date: today, reviewDate: localISODate(review), author: ME.name||'',
    project: site ? site.name : '', startDate:'', duration:'', clientContact: ramsSiteClientContact(site), description:'',
    address: site ? fullSiteAddress(site) : '', notes:'', mainContractor:'', groups:[],
    emergencyName: ME.name||'', emergencyPhone:'', includeDynamic:true,
  };
}

// ---------- Create screen ----------
async function renderRamsNew(siteId){
  const __gen = RENDER_GEN;
  if(!isFullManager(ME)){ go('#/site/'+siteId+'/hs/rams'); return; }
  const site = SITES.find(s=>s.id===siteId);
  const [lib, builds] = await Promise.all([
    ramsLoadLibrary(),
    dbSelect('rams_builds', 'org_id=eq.'+ME.org_id+'&select=id,title,site_id,status,updated_at,revision&order=updated_at.desc&limit=500'),
  ]);
  const templates = lib.filter(i=>i.kind==='template');
  const others = (builds||[]).filter(b=>true);
  const siteName = id => { const s = SITES.find(x=>x.id===id); return s ? s.name : 'Another job'; };
  // Jobs that have RAMS to copy, for the job drop-down.
  const bySite = {};
  others.forEach(b=>{ (bySite[b.site_id] = bySite[b.site_id] || []).push(b); });
  const copySites = Object.keys(bySite).map(id=>({id, name: siteName(id), n: bySite[id].length})).sort((x,y)=>x.name.localeCompare(y.name));
  window.RAMS_COPY_SRC = {bySite, sites: copySites};
  const html = `
    <div class="matbanner" style="background:#E7EEF9;color:#1F3B66;"><span>🦺</span><div><b>Create RAMS</b> — builds a <b>Risk Assessment</b> and a <b>Method Statement</b> as two separate documents for this job. Everything stays editable until you issue it. <span class="stub" style="display:inline;">(Trial)</span></div></div>
    <div class="formfield"><label class="field-label">RAMS name</label><input type="text" id="ramsNewTitle" value="${escapeHtml((site?site.name+' — ':'')+'Roof Renewal')}"></div>
    <p class="opmat-h">Start from — tick one or more</p>
    <div class="card" style="padding:4px 14px;">
      ${templates.length>1 ? `<label class="ramsstart"><input type="checkbox" onchange="document.querySelectorAll('.ramsTplPick').forEach(c=>c.checked=this.checked)"> <div><b>Select all templates</b></div></label>` : ''}
      ${templates.map((t,i)=>`<label class="ramsstart"><input type="checkbox" class="ramsTplPick" value="${t.id}"> <div><b>📋 ${escapeHtml(t.title)}</b><div class="stub" style="margin:0;">Template · ${(t.data.hazards||[]).length} hazards · ${(t.data.sections||[]).length} sections</div></div></label>`).join('')}
      <p class="stub" style="margin:8px 0;">Tick nothing to start blank and add hazards and sections yourself from the library. Ticking several combines them — anything in more than one is only added once.</p>
      ${!templates.length ? `<p class="stub" style="margin:10px 0;">No templates yet — ${lib.length ? 'save one from any RAMS.' : `<span class="viewlink" style="cursor:pointer;" onclick="ramsSeedAndReload()">load the starter library</span> (built from your Cleveland Primary School RAMS).`}</p>` : ''}
    </div>
    ${others.length ? `<p class="opmat-h">Or copy another job's RAMS</p>
    <div class="card" style="padding:10px 14px;">
      <div style="padding:2px 0 4px;"><b>⧉ Copy from another job</b><div class="stub" style="margin:0;">Pick the job, then tick one or more of its RAMS. Can be combined with templates above.</div></div>
      <input type="search" id="ramsCopyQ" placeholder="Type to filter jobs…" style="width:100%;margin:6px 0;" oninput="ramsCopyFilter(this.value)">
      <select id="ramsCopySite" style="width:100%;" onchange="ramsCopyPickSite(this.value)">
        <option value="">— Choose a job (${copySites.length}) —</option>
        ${copySites.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} (${c.n})</option>`).join('')}
      </select>
      <div id="ramsCopyList" style="margin-top:8px;"></div>
      <p class="stub" style="margin:6px 0 0;">Copies hazards, sections, PPE and groups — job details (dates, address, numbers) start fresh. Edit anything afterwards.</p>
    </div>` : ''}
    <button class="darkbtn" style="margin-top:6px;" onclick="ramsCreate('${siteId}')">Create RAMS</button>
  `;
  if(__gen === RENDER_GEN) document.getElementById('app').innerHTML = shell(html, {title:'Create RAMS', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/rams`, siteId});
}
window.ramsCopyFilter = function(q){
  const src = window.RAMS_COPY_SRC || {sites:[]}; const sel = document.getElementById('ramsCopySite'); if(!sel) return;
  const cur = sel.value, ql = String(q||'').toLowerCase().trim();
  const list = src.sites.filter(c=>!ql || c.name.toLowerCase().includes(ql));
  sel.innerHTML = `<option value="">— ${list.length ? 'Choose a job ('+list.length+')' : 'No jobs match'} —</option>` + list.map(c=>`<option value="${c.id}" ${c.id===cur?'selected':''}>${escapeHtml(c.name)} (${c.n})</option>`).join('');
  if(list.length===1 && cur!==list[0].id){ sel.value = list[0].id; ramsCopyPickSite(list[0].id); }
};
window.ramsCopyPickSite = function(siteId){
  const box = document.getElementById('ramsCopyList'); if(!box) return;
  const list = ((window.RAMS_COPY_SRC||{}).bySite||{})[siteId] || [];
  box.innerHTML = list.length ? `${list.length>1 ? `<label class="ramsstart"><input type="checkbox" onchange="document.querySelectorAll('.ramsCopyPick').forEach(c=>c.checked=this.checked)"> <div><b>Select all</b></div></label>` : ''}` + list.map(b=>`<label class="ramsstart"><input type="checkbox" class="ramsCopyPick" value="${b.id}"> <div><b>${escapeHtml(b.title)}</b><div class="stub" style="margin:0;">${b.status==='issued' ? 'Issued rev '+b.revision : 'Draft'} · ${new Date(b.updated_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div></div></label>`).join('') : '';
};
window.ramsSeedAndReload = async function(){
  const rows = await ramsSeedLibrary();
  if(rows) toast('Starter library loaded'); render();
};
window.ramsCreate = async function(siteId){
  const site = SITES.find(s=>s.id===siteId);
  const tplIds = Array.from(document.querySelectorAll('.ramsTplPick:checked')).map(c=>c.value);
  const copyIds = Array.from(document.querySelectorAll('.ramsCopyPick:checked')).map(c=>c.value);
  const title = (document.getElementById('ramsNewTitle').value||'').trim() || 'RAMS';
  const details = ramsDefaultDetails(site);
  let hazards = [], sections = [], ppe = RAMS_DEFAULT_PPE.slice();
  // Several templates / copied RAMS are combined; an item in more than one is only added once.
  const key = x => String(x.title||'').trim().toLowerCase();
  const addH = h => { if(h && !hazards.some(x=>key(x)===key(h))) hazards.push(h); };
  const addS = x => { if(x && !sections.some(y=>key(y)===key(x) && y.part===x.part)) sections.push(x); };
  const addGroups = gs => (gs||[]).forEach(g=>{ if(!details.groups.includes(g)) details.groups.push(g); });
  if(tplIds.length){
    const lib = await ramsLoadLibrary();
    const byTitle = (kind, t) => lib.find(i=>i.kind===kind && i.title===t);
    tplIds.forEach(id=>{
      const tpl = lib.find(i=>i.id===id); if(!tpl) return;
      (tpl.data.hazards||[]).forEach(h=> addH(typeof h==='string' ? (byTitle('hazard',h) ? ramsHazardFromLib(byTitle('hazard',h)) : null) : Object.assign({}, h, {id:ramsUid(), controls:(h.controls||[]).slice()})));
      (tpl.data.sections||[]).forEach(x=> addS(typeof x==='string' ? (byTitle('section',x) ? ramsSectionFromLib(byTitle('section',x)) : null) : Object.assign({}, x, {id:ramsUid(), steps:(x.steps||[]).slice()})));
      (tpl.data.ppe||[]).forEach(k=>{ if(!ppe.includes(k)) ppe.push(k); });
      addGroups(tpl.data.groups);
    });
  }
  if(copyIds.length){
    const srcs = await dbSelect('rams_builds', 'id=in.('+copyIds.join(',')+')');
    srcs.sort((x,y)=>copyIds.indexOf(x.id)-copyIds.indexOf(y.id)).forEach((src,i)=>{
      ramsBuildList(src,'hazards').forEach(h=>addH(Object.assign({}, h, {id:ramsUid(), controls:(h.controls||[]).slice()})));
      ramsBuildList(src,'sections').forEach(x=>addS(Object.assign({}, x, {id:ramsUid(), steps:(x.steps||[]).slice()})));
      (src.ppe||[]).forEach(k=>{ if(!ppe.includes(k)) ppe.push(k); });
      const sd = src.details||{};
      addGroups(sd.groups);
      if(i===0 && !tplIds.length) Object.assign(details, {description:sd.description||'', duration:sd.duration||'', includeDynamic: sd.includeDynamic!==false});
    });
  }
  // General precautions first, then method statements, keeping their order.
  sections = sections.filter(x=>x.part!=='method').concat(sections.filter(x=>x.part==='method'));
  const rows = await dbInsert('rams_builds', [{org_id:ME.org_id, site_id:siteId, title, details, hazards, sections, ppe, created_by:ME.id}]);
  if(!rows || !rows[0]) return;
  // Reserve the document numbers.
  const st = ramsSettings();
  saveRamsSettings({nextRa: st.nextRa+1, nextMs: st.nextMs+1});
  logSiteActivity(siteId, 'rams_build_created', `Started RAMS "${title}"`);
  ramsEd = null;
  go('#/site/'+siteId+'/hs/rams/build/'+rows[0].id);
};

// ---------- Editor ----------
async function renderRamsBuild(siteId, buildId){
  const __gen = RENDER_GEN;
  if(!isFullManager(ME)){ go('#/site/'+siteId+'/hs/rams'); return; }
  const site = SITES.find(s=>s.id===siteId);
  if(!ramsEd || ramsEd.buildId!==buildId){
    const b = (await dbSelect('rams_builds', 'id=eq.'+buildId))[0];
    if(!b){ toast('RAMS not found'); go('#/site/'+siteId+'/hs/rams'); return; }
    b.hazards = ramsBuildList(b,'hazards'); b.sections = ramsBuildList(b,'sections'); b.ppe = Array.isArray(b.ppe)?b.ppe:[]; b.details = Object.assign(ramsDefaultDetails(site), b.details||{});
    if(!b.details.clientContact) b.details.clientContact = ramsSiteClientContact(site);
    ramsEd = {buildId, build:b, tab:'details', editId:null, picker:null, pickerSel:new Set(), pickerQ:'', lib:null};
  }
  if(ramsEd.picker && !ramsEd.lib) ramsEd.lib = await ramsLoadLibrary();
  const b = ramsEd.build, tab = ramsEd.tab;
  const tabs = [['details', ramsMissingInfo(b).length ? 'Info ⚠' : 'Info'],['ra','RA ('+b.hazards.length+')'],['ssow','SSOW ('+b.sections.filter(x=>x.part!=='method').length+')'],['ms','MS ('+b.sections.filter(x=>x.part==='method').length+')'],['issue','Issue']];
  let body = '';
  if(tab==='details') body = ramsDetailsHtml(b);
  else if(tab==='ra') body = ramsHazardsHtml(b);
  else if(tab==='ssow') body = ramsSectionsHtml(b, 'general');
  else if(tab==='ms') body = ramsSectionsHtml(b, 'method');
  else body = ramsIssueHtml(b, siteId);
  const html = `
    <div class="ramsed-top">
      <input class="ramsed-title" value="${escapeHtml(b.title)}" oninput="ramsEd.build.title=this.value;ramsQueueSave()">
      <span id="ramsSaveState" class="stub" style="margin:0;white-space:nowrap;">${b.status==='issued' ? '✓ Issued rev '+b.revision+' · edits need re-issuing' : 'Draft · saves automatically'}</span>
    </div>
    <div class="filterrow ramsed-tabs">${tabs.map(([k,l])=>`<div class="filterchip ${tab===k?'active':''}" onclick="ramsSetTab('${k}')">${l}</div>`).join('')}</div>
    ${body}
    ${ramsEd.picker ? ramsPickerHtml() : ''}
  `;
  if(__gen === RENDER_GEN) document.getElementById('app').innerHTML = shell(html, {title:'RAMS Builder', subtitle:site?site.name:'', siteNameSubtitle:true, back:`#/site/${siteId}/hs/rams`, siteId});
}
const RAMS_TAB_ORDER = ['details','ra','ssow','ms','issue'];
function ramsNextBtn(from){
  const nx = RAMS_TAB_ORDER[RAMS_TAB_ORDER.indexOf(from)+1];
  const lbl = {ra:'Next: Risk Assessment', ssow:'Next: Safe Systems of Work', ms:'Next: Method Statements', issue:'Next: Issue'}[nx];
  return nx ? `<button class="darkbtn" style="margin-top:14px;" onclick="ramsNext('${from}')">${lbl} ›</button>` : '';
}
window.ramsNext = function(from){
  if(from==='details'){
    const miss = ramsMissingInfo(ramsEd.build);
    if(miss.length){ toast('Please fill in: '+miss.join(' and ')); render(); return; }
  }
  ramsSetTab(RAMS_TAB_ORDER[RAMS_TAB_ORDER.indexOf(from)+1]);
};
window.ramsSetTab = function(k){ ramsSaveNow(); ramsEd.tab = k; ramsEd.editId = null; ramsEd.picker = null; render(); try{ window.scrollTo(0,0); }catch(e){} };
// Info fields that must be filled before moving on / issuing.
const RAMS_REQUIRED = [['clientContact','Client contact'],['description','Description of works']];
function ramsMissingInfo(b){ return RAMS_REQUIRED.filter(([k])=>!String((b.details||{})[k]||'').trim()).map(([,l])=>l); }
function ramsField(label, key, type, extra){
  const v = ramsEd.build.details[key];
  const req = RAMS_REQUIRED.some(([k])=>k===key);
  if(req){
    const bad = !String(v||'').trim();
    return `<div class="formfield" ${extra||''}><label class="field-label">${label} <span style="color:#C0392B;">*</span></label><input type="${type||'text'}" value="${escapeHtml(v||'')}" placeholder="Required" style="${bad?'border-color:#C0392B;':''}" oninput="ramsEd.build.details['${key}']=this.value;this.style.borderColor=this.value.trim()?'':'#C0392B';ramsQueueSave()"></div>`;
  }
  if(type==='textarea') return `<div class="formfield"><label class="field-label">${label}</label><textarea rows="3" oninput="ramsEd.build.details['${key}']=this.value;ramsQueueSave()">${escapeHtml(v||'')}</textarea></div>`;
  return `<div class="formfield" ${extra||''}><label class="field-label">${label}</label><input type="${type||'text'}" value="${escapeHtml(v||'')}" oninput="ramsEd.build.details['${key}']=this.value;ramsQueueSave()" onchange="ramsEd.build.details['${key}']=this.value;ramsQueueSave()"></div>`;
}
function ramsDetailsHtml(b){
  const d = b.details;
  return `
    <div class="card" style="padding:12px 14px;">
      <p class="sectiontitle" style="margin-top:0;">Document details</p>
      <div class="row-gap">${ramsField('Risk Assessment no.','raNumber')}${ramsField('Method Statement no.','msNumber')}</div>
      <div class="row-gap">${ramsField('Date','date','date')}${ramsField('Review date','reviewDate','date')}</div>
      ${ramsField('Author','author')}
      ${ramsField('Project / contract','project')}
      <div class="row-gap">${ramsField('Start date','startDate','date')}${ramsField('Expected duration','duration')}</div>
      ${ramsField('Client contact (from the Client Info tab)','clientContact')}
      ${ramsField('Description of works','description')}
      ${ramsField('Site address','address')}
      ${ramsField('Main contractor','mainContractor')}
      ${ramsField('Risk assessment notes (e.g. site supervisor & phone)','notes','textarea')}
      <div class="row-gap">${ramsField('Emergency contact','emergencyName')}${ramsField('Emergency phone','emergencyPhone','tel')}</div>
    </div>
    <div class="card" style="padding:12px 14px;">
      <p class="sectiontitle" style="margin-top:0;">Groups affected</p>
      <div class="ramschips">${RAMS_GROUPS.concat((d.groups||[]).filter(g=>!RAMS_GROUPS.includes(g))).map(g=>`<label class="ramschip ${d.groups.includes(g)?'on':''}"><input type="checkbox" ${d.groups.includes(g)?'checked':''} onchange="ramsToggleArr('groups','${jsAttr(g)}',this.checked)"> ${escapeHtml(g)}</label>`).join('')}</div>
      <button class="ghostbtn" style="width:auto;margin-top:8px;" onclick="ramsAddGroup()">+ Add group</button>
    </div>
    <div class="card" style="padding:12px 14px;">
      <p class="sectiontitle" style="margin-top:0;">Required PPE</p>
      <div class="ramschips">${RAMS_PPE.map(p=>`<label class="ramschip ${b.ppe.includes(p.key)?'on':''}"><input type="checkbox" ${b.ppe.includes(p.key)?'checked':''} onchange="ramsTogglePpe('${p.key}',this.checked)"> ${p.icon} ${p.label}</label>`).join('')}</div>
    </div>
    <label class="selallrow"><input type="checkbox" ${d.includeDynamic!==false?'checked':''} onchange="ramsEd.build.details.includeDynamic=this.checked;ramsQueueSave()"> Include the Dynamic Risk Assessment page</label>
    <p class="stub" style="margin:10px 0 0;"><span style="color:#C0392B;">*</span> Required</p>
    ${ramsNextBtn('details')}
  `;
}
window.ramsToggleArr = function(key, val, on){ const a = ramsEd.build.details[key] = (ramsEd.build.details[key]||[]).filter(x=>x!==val); if(on) a.push(val); ramsQueueSave(); render(); };
window.ramsTogglePpe = function(key, on){ const b = ramsEd.build; b.ppe = b.ppe.filter(x=>x!==key); if(on) b.ppe.push(key); ramsQueueSave(); render(); };
window.ramsAddGroup = async function(){ const v = await customPrompt('Group affected', ''); if(v && v.trim()){ ramsToggleArr('groups', v.trim(), true); } };

function ramsRRBadge(p, s){ const rr = (Number(p)||0)*(Number(s)||0); const band = ramsRiskBand(rr); return `<span class="ramsrr" style="background:${band.bg};color:${band.fg};">${rr}</span>`; }
function ramsItemTools(kind, id, i, n){
  return `<div class="ramsitem-tools">
    <button title="Move up" ${i===0?'disabled':''} onclick="ramsMove('${kind}','${id}',-1)">↑</button>
    <button title="Move down" ${i===n-1?'disabled':''} onclick="ramsMove('${kind}','${id}',1)">↓</button>
    <button title="Edit" onclick="ramsEdit('${id}')">✎</button>
    <button title="Duplicate" onclick="ramsDup('${kind}','${id}')">⧉</button>
    <button title="Delete" class="danger" onclick="ramsDel('${kind}','${id}')">🗑</button>
  </div>`;
}
function ramsSelect(val, onch, labels){ return `<select onchange="${onch}">${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(val)===n?'selected':''}>${n} — ${labels[n]}</option>`).join('')}</select>`; }
function ramsHazardsHtml(b){
  const n = b.hazards.length;
  return `
    <p class="stub" style="margin:0 0 10px;">Each hazard is its own item. P = probability, S = severity, RR = P × S. Pre-control on the left, residual (after controls) on the right.</p>
    ${b.hazards.map((h,i)=>{
      if(ramsEd.editId===h.id) return `<div class="card ramsitem editing">
        <div class="formfield"><label class="field-label">Hazard</label><input type="text" value="${escapeHtml(h.title)}" oninput="ramsH('${h.id}').title=this.value;ramsQueueSave()"></div>
        <div class="formfield"><label class="field-label">Harm / who could be hurt and how</label><input type="text" value="${escapeHtml(h.harm)}" oninput="ramsH('${h.id}').harm=this.value;ramsQueueSave()"></div>
        <div class="ramsriskedit">
          <div><div class="field-label">Before controls</div>P ${ramsSelect(h.p, `ramsH('${h.id}').p=+this.value;ramsQueueSave();render()`, RAMS_P_LABELS)} S ${ramsSelect(h.s, `ramsH('${h.id}').s=+this.value;ramsQueueSave();render()`, RAMS_S_LABELS)} ${ramsRRBadge(h.p,h.s)}</div>
          <div><div class="field-label">Residual (after controls)</div>P ${ramsSelect(h.rp, `ramsH('${h.id}').rp=+this.value;ramsQueueSave();render()`, RAMS_P_LABELS)} S ${ramsSelect(h.rs, `ramsH('${h.id}').rs=+this.value;ramsQueueSave();render()`, RAMS_S_LABELS)} ${ramsRRBadge(h.rp,h.rs)}</div>
        </div>
        <div class="formfield"><label class="field-label">Control procedures — one per line</label><textarea rows="${Math.min(14, Math.max(4, h.controls.length+2))}" oninput="ramsH('${h.id}').controls=this.value.split('\\n').map(x=>x.trim()).filter(Boolean);ramsQueueSave()">${escapeHtml(h.controls.join('\n'))}</textarea></div>
        <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="ramsEd.editId=null;ramsSaveNow();render()">Done</button><button class="ghostbtn" style="flex:1;" onclick="ramsSaveToLibrary('hazard','${h.id}')">⭳ Save to library</button></div>
      </div>`;
      return `<div class="card ramsitem">
        <div class="ramsitem-head"><span class="ramsitem-num">${i+1}</span><div style="flex:1;min-width:0;"><div class="ramsitem-title">${escapeHtml(h.title||'Untitled hazard')}</div><div class="stub" style="margin:0;">${escapeHtml(h.harm||'')}</div></div>
          <div class="ramsrrpair" title="Pre-control → residual">${ramsRRBadge(h.p,h.s)}<span>→</span>${ramsRRBadge(h.rp,h.rs)}</div></div>
        <ul class="ramsitem-list">${h.controls.slice(0,3).map(c=>`<li>${escapeHtml(c)}</li>`).join('')}${h.controls.length>3?`<li class="more" onclick="ramsEdit('${h.id}')">+ ${h.controls.length-3} more control${h.controls.length-3>1?'s':''}</li>`:''}</ul>
        ${ramsItemTools('hazards', h.id, i, n)}
      </div>`;
    }).join('') || `<div class="empty">No hazards yet.</div>`}
    <div class="row-gap" style="margin-top:6px;"><button class="darkbtn" style="flex:1;" onclick="ramsOpenPicker('hazard')">+ Add from library</button><button class="ghostbtn" style="flex:1;" onclick="ramsNewItem('hazard')">+ New hazard</button></div>
    ${ramsNextBtn('ra')}
  `;
}
function ramsSectionsHtml(b, onlyPart){
  const parts = [['general','Safe Systems of Work'],['method','Method Statements']].filter(([p])=>!onlyPart || p===onlyPart);
  const isM = onlyPart==='method';
  return `
    <p class="stub" style="margin:0 0 10px;">${isM ? 'The step-by-step method statements — each is its own section. They print after the safe systems of work in the Method Statement document.' : 'Safe systems of work (general precautions) — each is its own section. They print first in the Method Statement document.'}</p>
    ${parts.map(([part,label])=>{
      const list = b.sections.filter(s=>s.part===part);
      return (onlyPart ? '' : `<p class="opmat-h">${label}</p>`) + (list.map((s,i)=>{
        if(ramsEd.editId===s.id) return `<div class="card ramsitem editing">
          <div class="formfield"><label class="field-label">Heading</label><input type="text" value="${escapeHtml(s.title)}" oninput="ramsS('${s.id}').title=this.value;ramsQueueSave()"></div>
          <div class="formfield"><label class="field-label">Type</label><select onchange="ramsS('${s.id}').part=this.value;ramsQueueSave();render()"><option value="general" ${s.part==='general'?'selected':''}>Safe system of work</option><option value="method" ${s.part==='method'?'selected':''}>Method statement (step by step)</option></select></div>
          <div class="formfield"><label class="field-label">Text</label><textarea rows="5" oninput="ramsS('${s.id}').body=this.value;ramsQueueSave()">${escapeHtml(s.body)}</textarea></div>
          <div class="formfield"><label class="field-label">Numbered steps / points — one per line (optional)</label><textarea rows="${Math.min(14, Math.max(4, s.steps.length+2))}" oninput="ramsS('${s.id}').steps=this.value.split('\\n').map(x=>x.trim()).filter(Boolean);ramsQueueSave()">${escapeHtml(s.steps.join('\n'))}</textarea></div>
          <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="ramsEd.editId=null;ramsSaveNow();render()">Done</button><button class="ghostbtn" style="flex:1;" onclick="ramsSaveToLibrary('section','${s.id}')">⭳ Save to library</button></div>
        </div>`;
        return `<div class="card ramsitem">
          <div class="ramsitem-head"><span class="ramsitem-num">${i+1}</span><div style="flex:1;min-width:0;"><div class="ramsitem-title">${escapeHtml(s.title||'Untitled section')}</div>
          ${s.body ? `<div class="stub ramsclamp" style="margin:2px 0 0;">${escapeHtml(s.body)}</div>` : ''}</div></div>
          ${s.steps.length ? `<ol class="ramsitem-list">${s.steps.slice(0,3).map(c=>`<li>${escapeHtml(c)}</li>`).join('')}${s.steps.length>3?`<li class="more" onclick="ramsEdit('${s.id}')">+ ${s.steps.length-3} more</li>`:''}</ol>` : ''}
          ${ramsItemTools('sections', s.id, i, list.length)}
        </div>`;
      }).join('') || `<div class="empty" style="padding:10px;">None yet.</div>`);
    }).join('')}
    <div class="row-gap" style="margin-top:10px;"><button class="darkbtn" style="flex:1;" onclick="ramsOpenPicker('section','${isM?'method':'general'}')">+ Add from library</button><button class="ghostbtn" style="flex:1;" onclick="ramsNewItem('section','${isM?'method':'general'}')">+ New ${isM?'method statement':'safe system of work'}</button></div>
    ${ramsNextBtn(isM?'ms':'ssow')}
  `;
}
window.ramsH = id => ramsEd.build.hazards.find(h=>h.id===id) || {};
window.ramsS = id => ramsEd.build.sections.find(s=>s.id===id) || {};
window.ramsEdit = function(id){ ramsEd.editId = id; render(); };
window.ramsMove = function(kind, id, dir){
  const b = ramsEd.build, arr = b[kind];
  const idx = arr.findIndex(x=>x.id===id); if(idx<0) return;
  // Sections move within their own part (general / method).
  let j = idx + dir;
  if(kind==='sections'){ const part = arr[idx].part; while(j>=0 && j<arr.length && arr[j].part!==part) j += dir; }
  if(j<0 || j>=arr.length) return;
  const t = arr[idx]; arr[idx] = arr[j]; arr[j] = t;
  ramsQueueSave(); render();
};
window.ramsDup = function(kind, id){
  const arr = ramsEd.build[kind]; const idx = arr.findIndex(x=>x.id===id); if(idx<0) return;
  const c = JSON.parse(JSON.stringify(arr[idx])); c.id = ramsUid(); c.title = c.title+' (copy)';
  arr.splice(idx+1, 0, c); ramsEd.editId = c.id; ramsQueueSave(); render();
};
window.ramsDel = async function(kind, id){
  const it = ramsEd.build[kind].find(x=>x.id===id); if(!it) return;
  if(!(await customConfirm(`Remove "${it.title||'this item'}" from this RAMS?\n\nIt stays in the library.`))) return;
  ramsEd.build[kind] = ramsEd.build[kind].filter(x=>x.id!==id); ramsQueueSave(); render();
};
window.ramsNewItem = function(kind, part){
  if(kind==='hazard'){ const h = {id:ramsUid(), title:'', harm:'', p:3, s:3, rp:1, rs:3, controls:[]}; ramsEd.build.hazards.push(h); ramsEd.editId = h.id; }
  else { const s = {id:ramsUid(), part: part==='method'?'method':'general', title:'', body:'', steps:[]}; ramsEd.build.sections.push(s); ramsEd.editId = s.id; }
  ramsQueueSave(); render();
  setTimeout(()=>{ const el = document.querySelector('.ramsitem.editing input'); if(el){ el.scrollIntoView({block:'center'}); el.focus(); } }, 60);
};
window.ramsSaveToLibrary = async function(kind, id){
  const it = kind==='hazard' ? ramsH(id) : ramsS(id);
  if(!it.title){ toast('Give it a heading first'); return; }
  const lib = await ramsLoadLibrary();
  const existing = lib.find(x=>x.kind===kind && (x.id===it.libId || x.title===it.title));
  const data = kind==='hazard' ? {harm:it.harm, p:it.p, s:it.s, rp:it.rp, rs:it.rs, controls:it.controls} : {part:it.part, body:it.body, steps:it.steps};
  if(existing){
    if(!(await customConfirm(`"${existing.title}" is already in the library.\n\nReplace the library copy with this version? (Other jobs' RAMS are not changed.)`))) return;
    await dbUpdate('rams_library_items', existing.id, {title:it.title, data, updated_at:new Date().toISOString()});
  } else {
    const rows = await dbInsert('rams_library_items', [{org_id:ME.org_id, kind, title:it.title, data, sort_order:999, created_by:ME.id}]);
    if(rows && rows[0]) it.libId = rows[0].id;
  }
  ramsEd.lib = null; toast('Saved to the library'); ramsQueueSave();
};
// Library picker (multi-tick with select all)
window.ramsOpenPicker = async function(kind, part){ ramsEd.picker = kind; ramsEd.pickerPart = part||null; ramsEd.pickerSel = new Set(); ramsEd.pickerQ = ''; ramsEd.lib = null; render(); };
function ramsPickerHtml(){
  const kind = ramsEd.picker, q = ramsEd.pickerQ.toLowerCase();
  const lib = (ramsEd.lib||[]).filter(i=>i.kind===kind && (!ramsEd.pickerPart || ((i.data||{}).part==='method' ? 'method' : 'general')===ramsEd.pickerPart));
  const inUse = new Set((kind==='hazard' ? ramsEd.build.hazards : ramsEd.build.sections).map(x=>x.libId).filter(Boolean));
  const shown = lib.filter(i=>!q || i.title.toLowerCase().includes(q));
  const allIds = shown.map(i=>i.id);
  return `<div class="geo-modal-overlay" style="display:flex;" onclick="if(event.target===this){ramsEd.picker=null;render();}">
    <div class="geo-modal-card ramspicker">
      <h3 style="margin:0 0 8px;">Add ${kind==='hazard'?'hazards':(ramsEd.pickerPart==='method'?'method statements':(ramsEd.pickerPart==='general'?'safe systems of work':'sections'))} from the library</h3>
      <input type="search" placeholder="Search…" value="${escapeHtml(ramsEd.pickerQ)}" oninput="ramsEd.pickerQ=this.value;clearTimeout(window._rpq);window._rpq=setTimeout(()=>{render();setTimeout(()=>{const e=document.querySelector('.ramspicker input[type=search]');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}},30)},250)" style="width:100%;margin-bottom:8px;">
      ${shown.length>1 ? `<label class="selallrow" style="margin-bottom:6px;"><input type="checkbox" ${allIds.every(id=>ramsEd.pickerSel.has(id))?'checked':''} onchange="${escapeHtml(`ramsPickerAll(this.checked, ${JSON.stringify(allIds)})`)}"> Select all (${shown.length})</label>` : ''}
      <div class="ramspicker-list">
        ${shown.map(i=>`<label class="ramspicker-row"><input type="checkbox" ${ramsEd.pickerSel.has(i.id)?'checked':''} onchange="ramsPickerTick('${i.id}',this.checked)"><div><b>${escapeHtml(i.title)}</b>${inUse.has(i.id)?' <span class="opmat-pill" style="background:#E3EEFA;color:#1F5FA6;">already added</span>':''}<div class="stub" style="margin:0;">${escapeHtml(kind==='hazard' ? (i.data.harm||'') : ((i.data.part==='method'?'Method statement · ':'')+(i.data.body||'').slice(0,90)))}</div></div></label>`).join('') || `<div class="empty" style="padding:12px;">${(ramsEd.lib||[]).length ? 'Nothing matches.' : `The library is empty. <span class="viewlink" style="cursor:pointer;" onclick="ramsSeedAndReload()">Load the starter library</span>`}</div>`}
      </div>
      <div class="row-gap" style="margin-top:10px;"><button class="darkbtn" style="flex:2;" onclick="ramsPickerAdd()">Add ${ramsEd.pickerSel.size||''} selected</button><button class="ghostbtn" style="flex:1;" onclick="ramsEd.picker=null;render()">Cancel</button></div>
    </div></div>`;
}
window.ramsPickerTick = function(id, on){ if(on) ramsEd.pickerSel.add(id); else ramsEd.pickerSel.delete(id); render(); };
window.ramsPickerAll = function(on, ids){ ids.forEach(id=>{ if(on) ramsEd.pickerSel.add(id); else ramsEd.pickerSel.delete(id); }); render(); };
window.ramsPickerAdd = function(){
  const lib = ramsEd.lib||[]; const kind = ramsEd.picker;
  const picked = lib.filter(i=>ramsEd.pickerSel.has(i.id));
  if(!picked.length){ toast('Tick at least one'); return; }
  if(kind==='hazard') picked.forEach(i=>ramsEd.build.hazards.push(ramsHazardFromLib(i)));
  else picked.forEach(i=>ramsEd.build.sections.push(ramsSectionFromLib(i)));
  ramsEd.picker = null; ramsQueueSave(); toast(picked.length+' added'); render();
};

function ramsIssueHtml(b, siteId){
  const st = ramsSettings();
  return `
    <div class="card" style="padding:12px 14px;">
      <p class="sectiontitle" style="margin-top:0;">Issue to this job</p>
      <p class="stub" style="margin:0 0 10px;">Creates two documents in this job's RAMS list — <b>Risk Assessment</b> (${b.hazards.length} hazards) and <b>Method Statement</b> (${b.sections.length} sections) — each with a sign-off sheet that operatives sign in the app, exactly like an uploaded RAMS.${b.status==='issued' ? ' <b>Re-issuing replaces the current versions and everyone is asked to sign again.</b>' : ''}</p>
      <div class="row-gap"><button class="ghostbtn" style="flex:1;" onclick="ramsPreview('ra')">👁 Preview Risk Assessment</button><button class="ghostbtn" style="flex:1;" onclick="ramsPreview('ms')">👁 Preview Method Statement</button></div>
      <button class="darkbtn" style="margin-top:10px;" onclick="ramsIssue('${siteId}')">${b.status==='issued' ? '↻ Re-issue (rev '+(b.revision+1)+')' : '✓ Issue Risk Assessment & Method Statement'}</button>
    </div>
    <div class="card" style="padding:12px 14px;">
      <p class="sectiontitle" style="margin-top:0;">Reuse</p>
      <button class="ghostbtn" onclick="ramsSaveAsTemplate()">📋 Save as a template</button>
      <p class="stub" style="margin:6px 0 0;">Saves these hazards, sections, PPE and groups — exactly as edited here — as a template for future jobs.</p>
    </div>
    <div class="card" style="padding:12px 14px;">
      <p class="sectiontitle" style="margin-top:0;">Company details on the documents</p>
      <div class="formfield"><label class="field-label">Address (one line per row)</label><textarea id="ramsSetAddr" rows="4">${escapeHtml(st.address)}</textarea></div>
      <div class="formfield"><label class="field-label">Telephone</label><input type="tel" id="ramsSetPhone" value="${escapeHtml(st.phone)}"></div>
      <div class="formfield"><label class="field-label">Data protection statement</label><textarea id="ramsSetDp" rows="5">${escapeHtml(st.dataProtection)}</textarea></div>
      <button class="ghostbtn" onclick="ramsSaveCompany()">Save company details</button>
    </div>
    <button class="ghostbtn" style="color:var(--warn);margin-top:4px;" onclick="ramsDeleteBuild('${siteId}')">Delete this RAMS draft</button>
  `;
}
window.ramsSaveCompany = async function(){
  const ok = await saveRamsSettings({address:document.getElementById('ramsSetAddr').value, phone:document.getElementById('ramsSetPhone').value, dataProtection:document.getElementById('ramsSetDp').value});
  toast(ok ? 'Saved' : 'Could not save — admins only');
};
window.ramsSaveAsTemplate = async function(){
  const b = ramsEd.build;
  const name = await customPrompt('Template name', b.title);
  if(!name || !name.trim()) return;
  const strip = x => { const c = JSON.parse(JSON.stringify(x)); delete c.id; return c; };
  const rows = await dbInsert('rams_library_items', [{org_id:ME.org_id, kind:'template', title:name.trim(), sort_order:999, created_by:ME.id,
    data:{hazards:b.hazards.map(strip), sections:b.sections.map(strip), ppe:b.ppe.slice(), groups:(b.details.groups||[]).slice()}}]);
  toast(rows ? 'Template saved' : 'Could not save');
};
window.ramsDeleteBuildRow = async function(siteId, id){
  const b = (await dbSelect('rams_builds', 'id=eq.'+id+'&select=id,title,status'))[0]; if(!b) return;
  if(!(await customConfirm(`Delete "${b.title}"?${b.status==='issued' ? '\n\nThe issued documents stay in the RAMS list — only this editable copy is deleted.' : ''}`))) return;
  if(await dbDelete('rams_builds', id)){ if(ramsEd && ramsEd.buildId===id) ramsEd = null; toast('Deleted'); render(); }
};
window.ramsDeleteBuild = async function(siteId){
  const b = ramsEd.build;
  if(!(await customConfirm(`Delete "${b.title}"?${b.status==='issued' ? '\n\nThe issued documents stay in the RAMS list — only this editable copy is deleted.' : ''}`))) return;
  await dbDelete('rams_builds', b.id); ramsEd = null; go('#/site/'+siteId+'/hs/rams');
};

// Card on the job's RAMS screen (managers): create + list of builds.
async function ramsBuilderCardHtml(siteId){
  if(!isFullManager(ME)) return '';
  const builds = await dbSelect('rams_builds', 'site_id=eq.'+siteId+'&select=id,title,status,revision,updated_at&order=updated_at.desc');
  return `<div style="margin-bottom:6px;">
    <p class="sectiontitle" style="margin:0;">🦺 Create RAMS <span class="opmat-pill" style="background:#FCEFD2;color:#8A5A00;">Trial</span></p><p class="stub" style="margin:4px 0 12px;">Write a Risk Assessment and Method Statement from your library, issue them as two documents.</p>
    ${(builds||[]).map(b=>`<div class="ramsbuildrow" onclick="ramsEd=null;go('#/site/${siteId}/hs/rams/build/${b.id}')"><b>${escapeHtml(b.title)}</b><span class="opmat-pill" style="${b.status==='issued'?'background:#DDF3E3;color:#1E7A3C;':'background:#EEE;color:#555;'}">${b.status==='issued'?'Issued rev '+b.revision:'Draft'}</span><span class="taskicon danger" title="Delete" style="margin-left:auto;" onclick="event.stopPropagation();ramsDeleteBuildRow('${siteId}','${b.id}')">🗑</span><span class="arrow">›</span></div>`).join('')}
    <button class="darkbtn" style="margin-top:10px;" onclick="go('#/site/${siteId}/hs/rams/new')">+ Create RAMS</button>
  </div>`;
}
