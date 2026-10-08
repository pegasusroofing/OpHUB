/* ================= RAMS LIBRARY (Admin Centre → Libraries) =================
 * Company library of hazards, method-statement sections and templates used by
 * the RAMS Builder. Editing here never changes a job's RAMS that already
 * pulled an item in (jobs hold their own copies). Route: #/rams-library */
let ramsLibTab = 'hazard';
let ramsLibEditId = null;
let ramsLibQ = '';
async function renderRamsLibrary(){
  const __gen = RENDER_GEN;
  if(!isFullManager(ME)){ go('#/team'); return; }
  const lib = await ramsLoadLibrary();
  const items = lib.filter(i=>i.kind===ramsLibTab && (!ramsLibQ || i.title.toLowerCase().includes(ramsLibQ.toLowerCase())));
  const counts = k => lib.filter(i=>i.kind===k).length;
  const row = (it, i, n) => {
    const d = it.data||{};
    if(ramsLibEditId===it.id){
      if(it.kind==='hazard') return `<div class="card ramsitem editing">
        <div class="formfield"><label class="field-label">Hazard</label><input id="rlTitle" value="${escapeHtml(it.title)}"></div>
        <div class="formfield"><label class="field-label">Harm</label><input id="rlHarm" value="${escapeHtml(d.harm||'')}"></div>
        <div class="ramsriskedit"><div><div class="field-label">Before controls</div>P <select id="rlP">${[1,2,3,4,5].map(n=>`<option ${d.p==n?'selected':''}>${n}</option>`).join('')}</select> S <select id="rlS">${[1,2,3,4,5].map(n=>`<option ${d.s==n?'selected':''}>${n}</option>`).join('')}</select></div>
        <div><div class="field-label">Residual</div>P <select id="rlRP">${[1,2,3,4,5].map(n=>`<option ${d.rp==n?'selected':''}>${n}</option>`).join('')}</select> S <select id="rlRS">${[1,2,3,4,5].map(n=>`<option ${d.rs==n?'selected':''}>${n}</option>`).join('')}</select></div></div>
        <div class="formfield"><label class="field-label">Control procedures — one per line</label><textarea id="rlList" rows="8">${escapeHtml((d.controls||[]).join('\n'))}</textarea></div>
        <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="ramsLibSave('${it.id}')">Save</button><button class="ghostbtn" style="flex:1;" onclick="ramsLibEditId=null;render()">Cancel</button></div></div>`;
      if(it.kind==='section') return `<div class="card ramsitem editing">
        <div class="formfield"><label class="field-label">Heading</label><input id="rlTitle" value="${escapeHtml(it.title)}"></div>
        <div class="formfield"><label class="field-label">Type</label><select id="rlPart"><option value="general" ${d.part!=='method'?'selected':''}>General precaution / safe system of work</option><option value="method" ${d.part==='method'?'selected':''}>Method statement (step by step)</option></select></div>
        <div class="formfield"><label class="field-label">Text</label><textarea id="rlBody" rows="5">${escapeHtml(d.body||'')}</textarea></div>
        <div class="formfield"><label class="field-label">Numbered steps — one per line</label><textarea id="rlList" rows="6">${escapeHtml((d.steps||[]).join('\n'))}</textarea></div>
        <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="ramsLibSave('${it.id}')">Save</button><button class="ghostbtn" style="flex:1;" onclick="ramsLibEditId=null;render()">Cancel</button></div></div>`;
      return `<div class="card ramsitem editing"><div class="formfield"><label class="field-label">Template name</label><input id="rlTitle" value="${escapeHtml(it.title)}"></div>
        <p class="stub">To change what's in a template: create a RAMS from it on any job, edit it, then use Issue → Save as a template.</p>
        <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="ramsLibSave('${it.id}')">Save</button><button class="ghostbtn" style="flex:1;" onclick="ramsLibEditId=null;render()">Cancel</button></div></div>`;
    }
    const sub = it.kind==='hazard' ? `${escapeHtml(d.harm||'')} · ${(d.controls||[]).length} controls` : it.kind==='section' ? `${d.part==='method'?'Method statement':'General'} · ${(d.steps||[]).length} steps` : `${(d.hazards||[]).length} hazards · ${(d.sections||[]).length} sections`;
    return `<div class="card ramsitem"><div class="ramsitem-head"><span class="ramsitem-num">${i+1}</span><div style="flex:1;min-width:0;"><div class="ramsitem-title">${escapeHtml(it.title)}</div><div class="stub" style="margin:0;">${sub}</div></div>
      ${it.kind==='hazard' ? `<div class="ramsrrpair">${ramsRRBadge(d.p,d.s)}<span>→</span>${ramsRRBadge(d.rp,d.rs)}</div>` : ''}</div>
      <div class="ramsitem-tools">
        ${ramsLibQ ? '' : `<button ${i===0?'disabled':''} onclick="ramsLibMove('${it.id}',-1)">↑</button><button ${i===n-1?'disabled':''} onclick="ramsLibMove('${it.id}',1)">↓</button>`}
        <button onclick="ramsLibEditId='${it.id}';render()">✎</button><button class="danger" onclick="ramsLibDelete('${it.id}')">🗑</button></div></div>`;
  };
  const html = `
    <div class="matbanner" style="background:#E7EEF9;color:#1F3B66;"><span>📚</span><div><b>RAMS Library</b> — the hazards, safe systems of work and templates your team picks from in the RAMS Builder. Changing the library doesn't change RAMS already written for a job.</div></div>
    <div class="filterrow">${[['hazard','Hazards'],['section','Sections'],['template','Templates']].map(([k,l])=>`<div class="filterchip ${ramsLibTab===k?'active':''}" onclick="ramsLibTab='${k}';ramsLibEditId=null;render()">${l} (${counts(k)})</div>`).join('')}</div>
    <input type="search" placeholder="Search…" value="${escapeHtml(ramsLibQ)}" style="width:100%;margin-bottom:10px;" oninput="ramsLibQ=this.value;clearTimeout(window._rlq);window._rlq=setTimeout(()=>{render();setTimeout(()=>{const e=document.querySelector('input[type=search]');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}},30)},300)">
    ${items.map((it,i)=>row(it,i,items.length)).join('') || `<div class="empty">${lib.length ? 'Nothing here yet.' : 'Your library is empty.'}</div>`}
    ${ramsLibTab!=='template' ? `<button class="darkbtn" style="margin-top:6px;" onclick="ramsLibNew()">+ New ${ramsLibTab==='hazard'?'hazard':'section / safe system of work'}</button>` : ''}
    ${!lib.length ? `<button class="ghostbtn" style="margin-top:8px;" onclick="ramsSeedAndReload()">Load the starter library (from your Cleveland Primary School RAMS)</button>` : ''}
  `;
  if(__gen === RENDER_GEN) document.getElementById('app').innerHTML = shell(html, {title:'RAMS Library', back:'#/team/libraries'});
}
window.ramsLibNew = async function(){
  const kind = ramsLibTab;
  const data = kind==='hazard' ? {harm:'', p:3, s:3, rp:1, rs:3, controls:[]} : {part:'general', body:'', steps:[]};
  const rows = await dbInsert('rams_library_items', [{org_id:ME.org_id, kind, title:kind==='hazard'?'New hazard':'New section', data, sort_order:999, created_by:ME.id}]);
  if(rows && rows[0]){ ramsLibEditId = rows[0].id; ramsLibQ=''; render(); }
};
window.ramsLibSave = async function(id){
  const v = k => { const e = document.getElementById(k); return e ? e.value : ''; };
  const it = (await dbSelect('rams_library_items', 'id=eq.'+id))[0]; if(!it) return;
  const list = v('rlList').split('\n').map(x=>x.trim()).filter(Boolean);
  let data = it.data||{};
  if(it.kind==='hazard') data = {harm:v('rlHarm'), p:+v('rlP'), s:+v('rlS'), rp:+v('rlRP'), rs:+v('rlRS'), controls:list};
  else if(it.kind==='section') data = {part:v('rlPart'), body:v('rlBody'), steps:list};
  const row = await dbUpdate('rams_library_items', id, {title:v('rlTitle').trim()||it.title, data, updated_at:new Date().toISOString()});
  if(row){ ramsLibEditId = null; toast('Saved'); render(); }
};
window.ramsLibDelete = async function(id){
  const it = (await dbSelect('rams_library_items', 'id=eq.'+id))[0]; if(!it) return;
  if(!(await customConfirm(`Delete "${it.title}" from the library?\n\nRAMS already written for jobs keep their own copy.`))) return;
  await dbDelete('rams_library_items', id); render();
};
window.ramsLibMove = async function(id, dir){
  const lib = (await ramsLoadLibrary()).filter(i=>i.kind===ramsLibTab);
  const idx = lib.findIndex(i=>i.id===id), j = idx+dir; if(idx<0 || j<0 || j>=lib.length) return;
  const t = lib[idx]; lib[idx] = lib[j]; lib[j] = t;
  await Promise.all(lib.map((it,k)=> it.sort_order===k ? null : dbUpdate('rams_library_items', it.id, {sort_order:k})));
  render();
};
