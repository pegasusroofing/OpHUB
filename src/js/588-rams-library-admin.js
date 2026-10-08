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
        <div class="formfield"><label class="field-label">Type</label><select id="rlPart"><option value="general" ${d.part!=='method'?'selected':''}>Safe system of work</option><option value="method" ${d.part==='method'?'selected':''}>Method statement (step by step)</option></select></div>
        <div class="formfield"><label class="field-label">Text</label><textarea id="rlBody" rows="5">${escapeHtml(d.body||'')}</textarea></div>
        <div class="formfield"><label class="field-label">Numbered steps — one per line</label><textarea id="rlList" rows="6">${escapeHtml((d.steps||[]).join('\n'))}</textarea></div>
        <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="ramsLibSave('${it.id}')">Save</button><button class="ghostbtn" style="flex:1;" onclick="ramsLibEditId=null;render()">Cancel</button></div></div>`;
      return ramsLibTemplateEditHtml(it, lib);
    }
    const sub = it.kind==='hazard' ? `${escapeHtml(d.harm||'')} · ${(d.controls||[]).length} controls` : it.kind==='section' ? `${(d.steps||[]).length ? (d.steps||[]).length+' steps' : 'Text'}` : `${(d.hazards||[]).length} hazards · ${(d.sections||[]).length} sections`;
    return `<div class="card ramsitem"><div class="ramsitem-head"><span class="ramsitem-num">${i+1}</span><div style="flex:1;min-width:0;"><div class="ramsitem-title">${escapeHtml(it.title)}</div><div class="stub" style="margin:0;">${sub}</div></div>
      ${it.kind==='hazard' ? `<div class="ramsrrpair">${ramsRRBadge(d.p,d.s)}<span>→</span>${ramsRRBadge(d.rp,d.rs)}</div>` : ''}</div>
      <div class="ramsitem-tools">
        ${ramsLibQ ? '' : `<button ${i===0?'disabled':''} onclick="ramsLibMove('${it.id}',-1)">↑</button><button ${i===n-1?'disabled':''} onclick="ramsLibMove('${it.id}',1)">↓</button>`}
        <button onclick="ramsLibEditId='${it.id}';render()">✎</button><button class="danger" onclick="ramsLibDelete('${it.id}')">🗑</button></div></div>`;
  };
  const html = `
    <div class="card">
    <p class="stub" style="margin:0 0 12px;">The hazards, safe systems of work and templates your team picks from in the RAMS Builder. Changing the library doesn't change RAMS already written for a job.</p>
    <div class="filterrow">${[['hazard','Hazards'],['section','Safe Systems of Work & Method Statements'],['template','Templates']].map(([k,l])=>`<div class="filterchip ${ramsLibTab===k?'active':''}" style="${k==='section'?'flex:2;':''}" onclick="ramsLibTab='${k}';ramsLibEditId=null;render()">${l} (${counts(k)})</div>`).join('')}</div>
    <input type="text" id="ramsLibSearch" placeholder="Search…" value="${escapeHtml(ramsLibQ)}" style="width:100%;margin-bottom:10px;box-sizing:border-box;" oninput="ramsLibQ=this.value;clearTimeout(window._rlq);window._rlq=setTimeout(()=>{render();setTimeout(()=>{const e=document.getElementById('ramsLibSearch');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}},30)},300)">
    ${ramsLibTab==='section' ? [['general','Safe Systems of Work'],['method','Method Statements']].map(([part,lbl])=>{
        const g = items.filter(it=>((it.data||{}).part==='method' ? 'method' : 'general')===part);
        return `<p class="sectiontitle" style="margin:16px 0 8px;">${lbl} (${g.length})</p>
          ${g.map((it,i)=>row(it,i,g.length)).join('') || `<div class="empty" style="padding:8px 0;">None yet.</div>`}
          <button class="ghostbtn" style="margin-top:4px;" onclick="ramsLibNew('${part}')">+ New ${part==='method'?'method statement':'safe system of work'}</button>`;
      }).join('') : `
    ${items.map((it,i)=>row(it,i,items.length)).join('') || `<div class="empty">${lib.length ? 'Nothing here yet.' : 'Your library is empty.'}</div>`}
    <button class="darkbtn" style="margin-top:6px;" onclick="ramsLibNew()">+ New ${ramsLibTab==='template'?'template':'hazard'}</button>`}
    ${!lib.length ? `<button class="ghostbtn" style="margin-top:8px;" onclick="ramsSeedAndReload()">Load the starter library (from your Cleveland Primary School RAMS)</button>` : ''}
    </div>
  `;
  if(__gen === RENDER_GEN) document.getElementById('app').innerHTML = shell(html, {title:'RAMS Library', back:'#/team/libraries'});
}
window.ramsLibNew = async function(part){
  const kind = ramsLibTab;
  const data = kind==='hazard' ? {harm:'', p:3, s:3, rp:1, rs:3, controls:[]} : kind==='template' ? {hazards:[], sections:[], ppe:RAMS_DEFAULT_PPE.slice(), groups:['Client Staff','Employees','Members of Public']} : {part: part==='method'?'method':'general', body:'', steps:[]};
  const title = kind==='hazard' ? 'New hazard' : kind==='template' ? 'New template' : (part==='method' ? 'New method statement' : 'New safe system of work');
  const rows = await dbInsert('rams_library_items', [{org_id:ME.org_id, kind, title, data, sort_order:999, created_by:ME.id}]);
  if(rows && rows[0]){ ramsLibEditId = rows[0].id; ramsLibQ=''; render(); }
};
window.ramsLibSave = async function(id){
  const v = k => { const e = document.getElementById(k); return e ? e.value : ''; };
  const it = (await dbSelect('rams_library_items', 'id=eq.'+id))[0]; if(!it) return;
  const list = v('rlList').split('\n').map(x=>x.trim()).filter(Boolean);
  let data = it.data||{};
  if(it.kind==='hazard') data = {harm:v('rlHarm'), p:+v('rlP'), s:+v('rlS'), rp:+v('rlRP'), rs:+v('rlRS'), controls:list};
  else if(it.kind==='section') data = {part:v('rlPart'), body:v('rlBody'), steps:list};
  else if(it.kind==='template'){
    // Ticked library items are stored by name; custom items saved from a job's RAMS are kept as they were.
    const custom = (k)=> (data[k]||[]).filter(x=>typeof x!=='string');
    const pick = (cls, k)=> Array.from(document.querySelectorAll('.'+cls+':checked')).map(c=> c.value.startsWith('custom:') ? custom(k)[+c.value.slice(7)] : c.value).filter(x=>x!=null);
    data = Object.assign({}, data, {
      hazards: pick('rlTplHz','hazards'),
      sections: pick('rlTplSg','sections').concat(pick('rlTplSm','sections')),
      ppe: Array.from(document.querySelectorAll('.rlTplPpe:checked')).map(c=>c.value),
    });
  }
  const row = await dbUpdate('rams_library_items', id, {title:v('rlTitle').trim()||it.title, data, updated_at:new Date().toISOString()});
  if(row){ ramsLibEditId = null; toast('Saved'); render(); }
};
window.ramsLibDelete = async function(id){
  const it = (await dbSelect('rams_library_items', 'id=eq.'+id))[0]; if(!it) return;
  if(!(await customConfirm(`Delete "${it.title}" from the library?\n\nRAMS already written for jobs keep their own copy.`))) return;
  await dbDelete('rams_library_items', id); render();
};
window.ramsLibMove = async function(id, dir){
  let lib = (await ramsLoadLibrary()).filter(i=>i.kind===ramsLibTab);
  // Sections move within their own group (safe systems of work / method statements); safe systems stay first.
  if(ramsLibTab==='section'){ const pt = i=>((i.data||{}).part==='method'?1:0); lib = lib.filter(i=>!pt(i)).concat(lib.filter(i=>pt(i))); }
  const idx = lib.findIndex(i=>i.id===id), j = idx+dir; if(idx<0 || j<0 || j>=lib.length) return;
  if(ramsLibTab==='section' && (((lib[idx].data||{}).part==='method') !== ((lib[j].data||{}).part==='method'))) return;
  const t = lib[idx]; lib[idx] = lib[j]; lib[j] = t;
  await Promise.all(lib.map((it,k)=> it.sort_order===k ? null : dbUpdate('rams_library_items', it.id, {sort_order:k})));
  render();
};

// Template editor in the library: tick which hazards, safe systems of work,
// method statements and PPE the template brings in.
function ramsLibTemplateEditHtml(it, lib){
  const d = it.data||{};
  const name = x => typeof x==='string' ? x : (x && x.title) || '';
  const inTpl = (k, t) => (d[k]||[]).some(x=>name(x)===t);
  const libH = lib.filter(i=>i.kind==='hazard'), libS = lib.filter(i=>i.kind==='section');
  const custom = k => (d[k]||[]).map((x,i)=>({x,i})).filter(o=>typeof o.x!=='string');
  const box = (cls, val, label, on, extra) => `<label class="ramstplpick"><input type="checkbox" class="${cls}" value="${escapeHtml(val)}" ${on?'checked':''}> <span>${escapeHtml(label)}${extra||''}</span></label>`;
  const group = (title, cls, rows) => `<details class="ramstplgrp" open><summary>${title} <span class="stub" style="display:inline;margin:0;">(<span>${rows.filter(r=>r.on).length}</span> ticked)</span></summary>
      <div style="margin:6px 0 4px;display:flex;gap:6px;"><button class="ghostbtn" style="width:auto;padding:4px 10px;font-size:11px;" onclick="document.querySelectorAll('.${cls}').forEach(c=>c.checked=true)">Tick all</button><button class="ghostbtn" style="width:auto;padding:4px 10px;font-size:11px;" onclick="document.querySelectorAll('.${cls}').forEach(c=>c.checked=false)">Untick all</button></div>
      ${rows.map(r=>box(cls, r.val, r.label, r.on, r.extra)).join('') || '<p class="stub" style="margin:4px 0;">None in the library yet.</p>'}</details>`;
  const cust = (k, part) => custom(k).filter(o=> k!=='sections' || ((o.x.part==='method')===(part==='method'))).map(o=>({val:'custom:'+custom(k).indexOf(o), label:name(o.x), on:true, extra:' <span class="stub" style="display:inline;margin:0;">(saved from a job)</span>'}));
  const hz = libH.map(i=>({val:i.title, label:i.title, on:inTpl('hazards', i.title)})).concat(cust('hazards'));
  const sg = libS.filter(i=>(i.data||{}).part!=='method').map(i=>({val:i.title, label:i.title, on:inTpl('sections', i.title)})).concat(cust('sections','general'));
  const sm = libS.filter(i=>(i.data||{}).part==='method').map(i=>({val:i.title, label:i.title, on:inTpl('sections', i.title)})).concat(cust('sections','method'));
  return `<div class="card ramsitem editing">
    <div class="formfield"><label class="field-label">Template name</label><input id="rlTitle" value="${escapeHtml(it.title)}"></div>
    ${group('Hazards (Risk Assessment)', 'rlTplHz', hz)}
    ${group('Safe Systems of Work', 'rlTplSg', sg)}
    ${group('Method Statements', 'rlTplSm', sm)}
    <p class="field-label" style="margin:12px 0 6px;">Required PPE</p>
    <div class="ramschips">${RAMS_PPE.map(p=>`<label class="ramschip ${(d.ppe||[]).includes(p.key)?'on':''}"><input type="checkbox" class="rlTplPpe" value="${p.key}" ${(d.ppe||[]).includes(p.key)?'checked':''} onchange="this.parentNode.classList.toggle('on',this.checked)"> ${p.icon} ${p.label}</label>`).join('')}</div>
    <div class="row-gap" style="margin-top:12px;"><button class="darkbtn" style="flex:2;" onclick="ramsLibSave('${it.id}')">Save template</button><button class="ghostbtn" style="flex:1;" onclick="ramsLibEditId=null;render()">Cancel</button></div>
  </div>`;
}
