/* ================= #(subform-in-app) Subcontractor form inside the app =================
   2026-10-18 (Andy): the same questions as the public sign-up form, but filled
   in inside the app (Google-Forms look, like the report forms). Operatives get
   a "Subcontractor form" tile on their Home until they've sent it; once sent
   it shows on their page in Admin (Operatives › person) and in Subcontractor
   sign-up. Admins can switch it off per person (we already have their info)
   from Admin Centre › Invites & Users › tap the person. */
const SUBFORM_SECTIONS = [
  {t:'Your company', q:[
    {k:'company_name', l:'Company name', req:1},
    {k:'trading_name', l:'Trading name (if different)'},
    {k:'company_type', l:'Business type', type:'radio', req:1, o:['Limited company','Sole trader','Partnership','LLP']},
    {k:'company_number', l:'Company number'},
    {k:'vat_number', l:'VAT number'},
    {k:'utr', l:'UTR'},
    {k:'cis_status', l:'CIS status', type:'radio', req:1, o:['Gross payment','20% deduction','30% deduction (not registered)']},
    {k:'address', l:'Business / home address', type:'textarea', req:1},
    {k:'postcode', l:'Postcode', req:1},
  ]},
  {t:'Contact', q:[
    {k:'contact_name', l:'Your name', req:1},
    {k:'email', l:'Email', type:'email', req:1},
    {k:'phone', l:'Mobile', type:'tel', req:1},
  ]},
  {t:'Your work', q:[
    {k:'trades', l:'Trades', type:'checks', req:1, hint:'Tick all that apply', o:['Flat roofing — felt','Single ply / EPDM','Liquid roofing','Pitched roofing — tiling / slating','Leadwork','Roof carpentry','Cladding','Fascias, soffits & gutters','Green roofs','Scaffolding','Labour only','Other']},
    {k:'other_trade', l:'Other trade'},
    {k:'areas', l:'Areas you cover', ph:'e.g. London & Home Counties'},
    {k:'own_access', l:'Do you have your own access equipment?', type:'radio', o:['Yes','No']},
    {k:'plant', l:'Plant / equipment you supply'},
  ]},
  {t:'Insurance', hint:'Upload your current certificates.', q:[
    {k:'pl_cover', l:'Public liability cover', type:'radio', req:1, o:['£1 million','£2 million','£5 million','£10 million','Other']},
    {k:'pl_expiry', l:'Public liability expiry', type:'date', req:1},
    {k:'el_cover', l:'Employers liability cover', type:'radio', o:['£5 million','£10 million','Not applicable (no employees)','Other']},
    {k:'el_expiry', l:'Employers liability expiry', type:'date'},
    {f:'Public liability certificate', l:'Public liability certificate', type:'file', req:1},
    {f:'Employers liability certificate', l:'Employers liability certificate', type:'file'},
  ]},
  {t:'Accreditations & cards', q:[
    {k:'accreditations', l:'Which do you hold?', type:'checks', o:['CHAS','SMAS Worksafe','Constructionline','SafeContractor','Acclaim','NFRC','CompetentRoofer','ISO 9001','ISO 14001','ISO 45001']},
    {k:'other_accreditation', l:'Other accreditation'},
    {f:'Accreditation certificate', l:'Accreditation certificates', type:'file', multi:1},
    {f:'CSCS / skills card', l:'CSCS / skills cards', hint:'Photos or scans of each card', type:'file', multi:1},
  ]},
  {t:'Health & safety', q:[
    {k:'hs_policy', l:'Do you have a written health & safety policy?', type:'radio', req:1, o:['Yes','No']},
    {f:'H&S policy', l:'H&S policy document', type:'file'},
    {k:'rams_ability', l:'Can you produce your own RAMS?', type:'radio', req:1, o:['Yes','No']},
    {k:'riddor', l:'Any RIDDOR-reportable incidents in the last 3 years?', type:'radio', req:1, o:['No','Yes']},
    {k:'riddor_detail', l:'If yes, give details', type:'textarea', showIf:['riddor','Yes']},
    {k:'enforcement', l:'Any HSE improvement / prohibition notices in the last 3 years?', type:'radio', req:1, o:['No','Yes']},
    {k:'enforcement_detail', l:'If yes, give details', type:'textarea', showIf:['enforcement','Yes']},
  ]},
  {t:'Anyone working with you', hint:'Anyone else who may come on our sites with you — name, trade, CSCS card and expiry.', q:[
    {k:'operatives', l:'Names and cards', type:'textarea', ph:'e.g. Dan Jones — labourer — CSCS green, exp 03/2027'},
  ]},
  {t:'References', q:[
    {k:'ref1', l:'Reference 1', ph:'Company, contact name, phone or email'},
    {k:'ref2', l:'Reference 2', ph:'Company, contact name, phone or email'},
  ]},
  {t:'Anything else', q:[{k:'notes', l:'Anything else we should know?', type:'textarea'}]},
];
let SUBFORM = null; // {data:{}, files:{label:[{name,path}]}, agree, signed, busy}
let subformMineCache = {uid:null, at:0, done:null};
function subformDraftKey(){ return 'ophub_subform_'+(ME&&ME.id); }
function subformLoadDraft(){
  if(SUBFORM && SUBFORM.uid===ME.id) return SUBFORM;
  let saved = null; try{ saved = JSON.parse(localStorage.getItem(subformDraftKey())||'null'); }catch(e){}
  SUBFORM = Object.assign({uid:ME.id, data:{contact_name:ME.name||'', email:ME.email||'', phone:ME.phone||''}, files:{}, agree:false, signed:ME.name||'', busy:false}, saved||{}, {busy:false});
  return SUBFORM;
}
function subformSaveDraft(){ try{ const {busy, ...keep} = SUBFORM; localStorage.setItem(subformDraftKey(), JSON.stringify(keep)); }catch(e){} }
// Does this operative still need to fill it in? (cached 60s for the Home tile)
async function subformStillNeeded(force){
  if(!ME || ME.role!=='operative' || ME.subform_required===false) return false;
  if(!force && subformMineCache.uid===ME.id && Date.now()-subformMineCache.at < 60000) return !subformMineCache.done;
  const r = await dbSelectChecked('subcontractor_applications', 'user_id=eq.'+ME.id+'&select=id&limit=1');
  if(!r.ok) return subformMineCache.uid===ME.id ? !subformMineCache.done : false;
  subformMineCache = {uid:ME.id, at:Date.now(), done: r.data.length>0};
  return !subformMineCache.done;
}
function subformTileHtml(tile){
  return tile('reports', 'orange', 'Subcontractor form', 'Please fill in — takes about 5 minutes', "go('#/subform')", '!');
}
window.subformSet = function(k, v){ subformLoadDraft().data[k] = v; subformSaveDraft(); };
window.subformToggleCheck = function(k, v, on){
  const d = subformLoadDraft().data; const arr = Array.isArray(d[k]) ? d[k] : [];
  d[k] = on ? Array.from(new Set(arr.concat([v]))) : arr.filter(x=>x!==v); subformSaveDraft();
};
window.subformPickRadio = function(k, v){ subformLoadDraft().data[k] = v; subformSaveDraft(); render(); };
window.subformFilesChosen = async function(input, label, multi){
  const S = subformLoadDraft();
  const picks = Array.from(input.files||[]); input.value = '';
  if(!picks.length) return;
  for(const f of picks){
    if(f.size > 25*1024*1024){ toast('"'+f.name+'" is bigger than 25MB — please attach a smaller copy.'); continue; }
    if(!/^(application\/pdf|image\/|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)/.test(f.type||'')){ toast('"'+f.name+'" isn’t a PDF, photo or Word file.'); continue; }
    toast('Uploading '+f.name+'…');
    const safe = f.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(0,100) || 'file';
    const path = ME.org_id+'/'+ME.id+'/'+uid()+'-'+safe;
    const stored = await uploadToStorage('subcontractor-apps', path, f, f.type);
    if(!stored){ toast('Could not upload '+f.name+' — try again.'); continue; }
    const list = multi ? (S.files[label]||[]) : [];
    list.push({name:f.name, path: typeof stored==='string' ? stored : path});
    S.files[label] = list;
  }
  subformSaveDraft(); render();
};
window.subformRemoveFile = function(label, i){ const S = subformLoadDraft(); (S.files[label]||[]).splice(i,1); subformSaveDraft(); render(); };
function subformQuestionHtml(q, S, missing){
  const d = S.data;
  if(q.showIf && d[q.showIf[0]]!==q.showIf[1]) return '';
  const id = 'sfq-'+(q.k||q.f).replace(/[^a-z0-9]+/gi,'_');
  const bad = missing && missing.has(q.k||q.f);
  const head = `<div class="sfq-l">${escapeHtml(q.l)}${q.req?'<i>*</i>':''}</div>${q.hint?`<div class="sfq-h">${escapeHtml(q.hint)}</div>`:''}`;
  let body = '';
  const v = d[q.k];
  if(q.type==='radio') body = `<div class="sfq-opts">${q.o.map(o=>`<label class="sfq-opt"><input type="radio" name="${id}" ${v===o?'checked':''} onchange="subformPickRadio('${q.k}','${jsAttr(o)}')"><span>${escapeHtml(o)}</span></label>`).join('')}</div>`;
  else if(q.type==='checks') body = `<div class="sfq-opts">${q.o.map(o=>`<label class="sfq-opt"><input type="checkbox" ${(Array.isArray(v)&&v.includes(o))?'checked':''} onchange="subformToggleCheck('${q.k}','${jsAttr(o)}',this.checked)"><span>${escapeHtml(o)}</span></label>`).join('')}</div>`;
  else if(q.type==='textarea') body = `<textarea class="sfq-in" rows="3" placeholder="${escapeHtml(q.ph||'Your answer')}" oninput="subformSet('${q.k}',this.value)">${escapeHtml(v||'')}</textarea>`;
  else if(q.type==='file'){
    const list = S.files[q.f]||[];
    body = `${list.map((f,i)=>`<div class="sfq-file">📎 <span>${escapeHtml(f.name)}</span><button type="button" onclick="subformRemoveFile('${jsAttr(q.f)}',${i})">✕</button></div>`).join('')}
      ${(!list.length || q.multi) ? `<label class="sfq-up"><input type="file" accept=".pdf,image/*,.doc,.docx" ${q.multi?'multiple':''} onchange="subformFilesChosen(this,'${jsAttr(q.f)}',${q.multi?1:0})">⬆ ${list.length?'Add another':'Add file'}</label>` : ''}`;
  }
  else body = `<input class="sfq-in" type="${q.type||'text'}" value="${escapeHtml(v||'')}" placeholder="${escapeHtml(q.ph||'Your answer')}" oninput="subformSet('${q.k}',this.value)">`;
  return `<div class="sfq ${bad?'bad':''}" id="${id}">${head}${body}${bad?'<div class="sfq-err">This question is required</div>':''}</div>`;
}
let subformMissing = null;
async function renderSubForm(){
  const __gen = RENDER_GEN;
  if(ME.role==='operative' && !(await subformStillNeeded(true))){
    if(__gen !== RENDER_GEN) return;
    document.getElementById('app').innerHTML = shell(`<div class="sfwrap"><div class="sfhead"><div class="sfbar"></div><div class="sfhead-in"><h1>Subcontractor form</h1><p>${ME.subform_required===false ? 'You don’t need to fill this in — we already have your details.' : 'Thanks — your form has been sent. If anything changes, let the office know.'}</p></div></div></div>`, {title:'Your details', back:'#/home', tabs:false});
    return;
  }
  const S = subformLoadDraft();
  if(__gen !== RENDER_GEN) return;
  const orgName = (ORG && ORG.name) || 'us';
  document.getElementById('app').innerHTML = shell(`
    <div class="sfwrap">
      <div class="sfhead"><div class="sfbar"></div><div class="sfhead-in">
        <h1>Subcontractor form</h1>
        <p>Please fill this in for ${escapeHtml(orgName)} — your company details, insurance, cards and health &amp; safety. It saves as you go, so you can come back to it.</p>
        <p class="sfreq">* Required</p>
      </div></div>
      ${SUBFORM_SECTIONS.map((sec,i)=>`
        <div class="sfsec">
          <div class="sfsec-t">${i+1}. ${escapeHtml(sec.t)}</div>${sec.hint?`<div class="sfq-h" style="margin-top:2px;">${escapeHtml(sec.hint)}</div>`:''}
          ${sec.q.map(q=>subformQuestionHtml(q, S, subformMissing)).join('')}
        </div>`).join('')}
      <div class="sfsec">
        <div class="sfsec-t">Declaration</div>
        <label class="sfq-opt" style="align-items:flex-start;${subformMissing&&subformMissing.has('__agree')?'color:var(--warn);':''}"><input type="checkbox" ${S.agree?'checked':''} onchange="subformLoadDraft().agree=this.checked;subformSaveDraft()"><span>I confirm the information given is true and complete, the insurances above are in force, and I will tell you straight away if anything changes.</span></label>
        <div class="sfq ${subformMissing&&subformMissing.has('__signed')?'bad':''}"><div class="sfq-l">Type your full name to sign<i>*</i></div><input class="sfq-in" type="text" value="${escapeHtml(S.signed||'')}" oninput="subformLoadDraft().signed=this.value;subformSaveDraft()"></div>
        <button type="button" class="darkbtn" style="margin-top:14px;" ${S.busy?'disabled':''} onclick="submitSubForm()">${S.busy?'Sending…':'Submit'}</button>
      </div>
    </div>
  `, {title:'Your details', back:'#/home', tabs:false});
}
window.submitSubForm = async function(){
  const S = subformLoadDraft(); if(S.busy) return;
  const d = S.data; const missing = new Set();
  SUBFORM_SECTIONS.forEach(sec=>sec.q.forEach(q=>{
    if(!q.req || (q.showIf && d[q.showIf[0]]!==q.showIf[1])) return;
    if(q.type==='file'){ if(!(S.files[q.f]||[]).length) missing.add(q.f); return; }
    const v = d[q.k]; if(Array.isArray(v) ? !v.length : !String(v||'').trim()) missing.add(q.k);
  }));
  if(d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) missing.add('email');
  if(!S.agree) missing.add('__agree');
  if(!String(S.signed||'').trim()) missing.add('__signed');
  subformMissing = missing.size ? missing : null;
  if(missing.size){
    render(); toast('Please answer the questions marked in red.');
    setTimeout(()=>{ const el = document.querySelector('.sfq.bad'); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}); }, 80);
    return;
  }
  S.busy = true; render();
  const files = []; Object.keys(S.files).forEach(label=>(S.files[label]||[]).forEach(f=>files.push({label, name:f.name, path:f.path, bucket:'subcontractor-apps'})));
  const data = Object.assign({}, d); delete data.company_name; delete data.contact_name; delete data.email;
  const rows = await dbInsert('subcontractor_applications', {org_id:ME.org_id, user_id:ME.id, company_name:String(d.company_name).trim(), contact_name:String(d.contact_name).trim(), email:String(d.email).trim().toLowerCase(), phone:String(d.phone||'').trim()||null, data, files, signed_name:String(S.signed).trim()});
  S.busy = false;
  if(!rows){ toast('Could not send — check signal and try again.'); render(); return; }
  try{ localStorage.removeItem(subformDraftKey()); }catch(e){}
  SUBFORM = null; subformMissing = null; subformMineCache = {uid:ME.id, at:Date.now(), done:true};
  // Let the admins know.
  try{ Object.values(PROFILES).filter(p=>p && p.role==='admin' && p.id!==ME.id).forEach(a=>postSystemMessageToUser(a.id, null, 'message', `${ME.name} has filled in their subcontractor form — see Admin › Operatives › ${ME.name}.`, null)); }catch(e){}
  toast('Thanks — your form has been sent');
  go('#/home');
};
// Managers: the operative's completed form, shown on their Admin page.
async function subformOperativeCardHtml(operativeId){
  if(!isManager(ME)) return '';
  const p = PROFILES[operativeId];
  const rows = await dbSelect('subcontractor_applications', 'user_id=eq.'+operativeId+'&order=created_at.desc&limit=1&select=id,status,created_at');
  const r = rows[0];
  const off = p && p.subform_required===false;
  return `<div class="card" style="margin-top:14px;">
    <div style="display:flex;align-items:center;gap:8px;"><p class="sectiontitle" style="margin:0;flex:1;">Subcontractor form</p>
      ${r ? `<span class="hspill ok">Sent ${new Date(r.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>` : `<span class="hspill ${off?'':'warn'}">${off?'Turned off':'Not sent yet'}</span>`}</div>
    ${r ? `<button type="button" class="ghostbtn" style="margin-top:10px;" onclick="go('#/subapplications/${r.id}')">View form</button>` : `<p class="stub" style="margin:8px 0 0;">${off?'Not asked for — switch it on from Admin Centre › Invites &amp; Users.':'It’s on their Home screen until they send it.'}</p>`}
  </div>`;
}
window.toggleSubformRequired = async function(userId){
  const p = PROFILES[userId]; if(!p) return;
  const next = p.subform_required===false;
  const row = await dbUpdate('profiles', userId, {subform_required: next});
  if(row){ p.subform_required = row.subform_required; toast(next ? 'Subcontractor form switched on' : 'Subcontractor form switched off'); render(); }
  else toast('Could not change it — try again.');
};
