/* ============================================================
   OpHUB Finance — standalone (Finance-only companies)
   A company can have Project Management (has_pm), Finance (has_finance) or
   both. A Finance-only company (organizations.has_pm = false, plan 'finance')
   gets just the Finance app:
     • home is #/finance; PM pages are not reachable
     • jobs are created and edited inside Finance
     • POs are raised in Finance (909) rather than from the Materials tile
     • labour comes from timesheets / workers set up in Finance (905)
     • a simple Team page to invite people and give them Finance
   When both are on (e.g. RTB) everything links up as before.
   ============================================================ */
function isFinanceOnly(){ return !!(ORG && ORG.has_pm === false); }

// Called by the router for Finance-only companies. Returns a render promise
// to stop routing, or undefined to let the normal router carry on.
function finOnlyRoute(parts){
  if(!isFinanceUser()){ renderFinNoAccess(); return null; }
  const top = parts[0] || '';
  if(top === 'fin-team') return renderFinTeam() || null;
  const ok = ['finance', 'account', 'signature', 'suppliers', 'join', 'reset'].includes(top)
    || (top === 'site' && parts[2] === 'finance');
  if(!ok){ go('#/finance'); return null; }
  return undefined;
}

function renderFinNoAccess(){
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="text-align:center;padding:28px 18px;">
      <div style="font-size:34px;">🔒</div>
      <p style="font-weight:700;margin:10px 0 4px;">You don’t have OpHUB Finance yet</p>
      <p class="stub" style="margin:0 0 16px;font-style:normal;">Ask your company admin to switch Finance on for you in Finance › Team.</p>
      <button class="ghostbtn" style="width:100%;" onclick="doSignOut()">Sign out</button>
    </div>
  `, {title:'OpHUB Finance', subtitle:(ORG&&ORG.name)||'', tabs:false});
}

// Left-hand menu on desktop for Finance-only companies.
function finOnlyNavItems(){
  return [
    {k:'finance', ic:'pound', lbl:'Overview', go:'#/finance'},
    {k:'finance/jobs', ic:'projects', lbl:'Projects', go:'#/finance/jobs'},
    {k:'finance/sales', ic:'list', lbl:'Sales', go:'#/finance/sales'},
    {k:'finance/purchases', ic:'truck', lbl:'Purchases', go:'#/finance/purchases'},
    {k:'finance/subs', ic:'tools', lbl:'Subcontractors & Labour', go:'#/finance/subs'},
    {k:'finance/reports', ic:'chart', lbl:'Reports', go:'#/finance/reports'},
    {k:'finance/directory', ic:'users', lbl:'Directory', go:'#/finance/directory'},
    {k:'fin-team', ic:'admin', lbl:'Team', go:'#/fin-team'},
    {k:'finance/settings', ic:'gear', lbl:'Finance settings', go:'#/finance/settings'},
    {k:'account', ic:'gear', lbl:'My account', go:'#/account'},
  ].filter(i=>i.show!==false);
}

// Extra buttons on the Finance home for Finance-only companies
// ('new' = the New job button, 'more' = Suppliers / Team / My account).
function finOnlyHomeButtonsHtml(part){
  if(!isFinanceOnly()) return '';
  if(part==='new') return isFullManager(ME) ? `<button class="darkbtn finshort-main" onclick="openFinNewJob()">+ New project</button>` : '';
  return `${isFullManager(ME) ? `<button class="ghostbtn" onclick="go('#/finance/directory/suppliers')">Suppliers</button>` : ''}
    <button class="ghostbtn" onclick="go('#/fin-team')">Team</button>
    <button class="ghostbtn" onclick="go('#/account')">My account</button>`;
}

/* ---------- jobs ---------- */
const FIN_JOB_STATUS = {upcoming:'Upcoming', live:'Live', closed:'Closed'};
window.openFinNewJob = async function(){
  if(!isFinanceOnly()) await loadAllProfiles();
  if(typeof finClientsLoad==='function') await finClientsLoad(true);
  let ov = document.getElementById('finJobOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finJobOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const auto = ORG && ORG.auto_job_numbers;
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>New project</h3>
    <div class="formfield"><label class="field-label">Project name *</label><input type="text" id="finNjName" placeholder="e.g. Richardson Court re-roof"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Project number *</label><input type="text" id="finNjNo" ${auto?`disabled placeholder="Automatic (${escapeHtml(finNextJobNumberLabel())})"`:`value="${escapeHtml(finNextJobNoGuess())}"`}></div>
      <div class="formfield"><label class="field-label">Status</label><select id="finNjStatus">${Object.keys(FIN_JOB_STATUS).map(k=>`<option value="${k}" ${k==='live'?'selected':''}>${FIN_JOB_STATUS[k]}</option>`).join('')}</select></div>
    </div>
    <div class="formfield"><label class="field-label">How do you get paid? *</label><select id="finNjBt" onchange="document.getElementById('finNjCvWrap').hidden=this.value!=='invoice'"><option value="">Choose…</option><option value="invoice">Invoices — I type the contract value</option><option value="application">Applications — against a Bill of Quantities</option></select></div>
    <div class="formfield" id="finNjCvWrap" hidden><label class="field-label">Contract value £ (excl. VAT)</label><input type="text" inputmode="decimal" data-money id="finNjCv" placeholder="Leave blank if not known yet"></div>
    ${isFinanceOnly() ? '' : `<div class="fingrid2">
      <div class="formfield"><label class="field-label">Project manager</label><select id="finNjPm"><option value="">Choose later</option>${Object.values(PROFILES||{}).filter(p=>isFullManager(p) && p.org_id===ME.org_id).sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <div class="formfield"><label class="field-label">Type of job</label><select id="finNjKind"><option value="">Single site</option><option value="multi">Multi-site (plots)</option><option value="repair">Repairs contract</option></select></div>
    </div>`}
    <div class="formfield"><label class="field-label">Client</label><input type="text" id="finNjClient" data-finclient placeholder="Start typing — clients from the Directory"></div>
    <div class="formfield"><label class="field-label">Site address</label><input type="text" id="finNjAddr"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Postcode</label><input type="text" id="finNjPc"></div>
      <div class="formfield"><label class="field-label">Start date</label><input type="date" id="finNjStart"></div>
    </div>
    ${auto ? '' : `<p class="stub" style="margin:0 0 8px;font-style:normal;">Tip: switch on automatic project numbers in Finance › Settings.</p>`}
    <button class="darkbtn" style="width:100%;" id="finNjSave" onclick="saveFinNewJob()">Create project</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finJobOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
  setTimeout(()=>{ const el = document.getElementById('finNjName'); if(el) el.focus(); }, 50);
};
window.saveFinNewJob = async function(){
  const name = finVal('finNjName'), no = finVal('finNjNo');
  if(!name){ toast('Give the project a name.'); return; }
  if(!(ORG && ORG.auto_job_numbers) && !no){ toast('Enter a project number.'); return; }
  const bt = finVal('finNjBt');
  if(!bt){ toast('Choose how you get paid on this project.'); return; }
  const btn = document.getElementById('finNjSave'); if(btn){ btn.disabled = true; btn.textContent = 'Creating…'; }
  // Client comes from the Directory (a new name is added to it).
  const cli = typeof finClientEnsure==='function' ? await finClientEnsure(finVal('finNjClient')) : null;
  const email = (cli && cli.email) || '';
  const newId = crypto.randomUUID();
  const row = {id:newId, org_id:ME.org_id, name, address:finVal('finNjAddr')||null, postcode:finVal('finNjPc')||null,
    job_number: (ORG && ORG.auto_job_numbers) ? null : no, status:finVal('finNjStatus')||'live', start_date:finVal('finNjStart')||null,
    client_name:(cli && cli.name) || finVal('finNjClient')||null, client_email:email||null, created_by:ME.id};
  if(document.getElementById('finNjPm')){ row.responsible_pm_id = finVal('finNjPm')||null; const k = finVal('finNjKind'); row.multi_site = k==='multi'; row.repair_contract = k==='repair'; }
  // Plain insert then re-read (the "return the row" form can be refused by the policy).
  const res = await sbFetch('/rest/v1/sites', {method:'POST', body:JSON.stringify(row)});
  if(btn){ btn.disabled = false; btn.textContent = 'Create project'; }
  if(!res.ok){ toast('Could not create the project — '+(await safeErr(res))); return; }
  const sitesRes = await dbSelectChecked('sites', 'select=*&order=created_at.asc');
  if(sitesRes.ok) SITES = sitesRes.data;
  const made = SITES.find(x=>x.id===newId) || row;
  // Set up in Finance = set up in Projects too: same folders and toolbox talks as a project made there.
  if(!isFinanceOnly() && SITES.find(x=>x.id===newId)){ try{ await Promise.all([typeof preloadTbtBankForSite==='function' ? preloadTbtBankForSite(made) : null, typeof preloadDrawingFoldersForSite==='function' ? preloadDrawingFoldersForSite(made) : null]); }catch(e){} }
  await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:newId, org_id:ME.org_id, billing_type:bt, billing_name:row.client_name||null, billing_email:email||null, billing_address:(cli && typeof finClientAddr==='function' && finClientAddr(cli))||null, vat_treatment:(typeof finClientVatTreatment==='function' && finClientVatTreatment(cli))||null, contract_value:(bt==='invoice' && finNum(finVal('finNjCv'))) ? finRound(finNum(finVal('finNjCv'))) : null, original_value:(bt==='invoice' && finNum(finVal('finNjCv'))) ? finRound(finNum(finVal('finNjCv'))) : null, updated_at:new Date().toISOString(), updated_by:ME.id})});
  if(ORG && ORG.auto_job_numbers) ORG.next_job_number = (ORG.next_job_number||0)+1;
  document.getElementById('finJobOverlay').style.display = 'none';
  toast('Project '+(made.job_number||'')+' created');
  // Land on the job's Finance overview, where Getting started shows what to do next.
  if(typeof finProjTab!=='undefined') finProjTab[newId] = 'overview';
  go('#/site/'+newId+'/finance');
};
// Job card on the job's Finance page (Finance-only companies edit the job here).
function finJobEditHtml(site){
  if(!isFullManager(ME)) return '';
  const st = typeof siteStatusKey==='function' ? siteStatusKey(site) : (site.status||'live');
  return `<div class="card">
    <p class="sectiontitle" style="margin-top:0;">Project</p>
    <p class="stub" style="margin:-6px 0 10px;font-style:normal;">The same details as on the project itself — change them here or there and both update.</p>
    <div class="formfield"><label class="field-label">Project name</label><input type="text" id="finJeName" value="${escapeHtml(site.name||'')}"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Status</label><select id="finJeStatus">${Object.keys(FIN_JOB_STATUS).map(k=>`<option value="${k}" ${st===k?'selected':''}>${FIN_JOB_STATUS[k]}</option>`).join('')}</select></div>
      <div class="formfield"><label class="field-label">Start date</label><input type="date" id="finJeStart" value="${escapeHtml(site.start_date||'')}"></div>
    </div>
    ${isFinanceOnly() ? '' : `<div class="formfield"><label class="field-label">Project manager</label><select id="finJePm"><option value="">None yet</option>${Object.values(PROFILES||{}).filter(p=>isFullManager(p) && p.org_id===ME.org_id).sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(p=>`<option value="${p.id}" ${site.responsible_pm_id===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}</select></div>`}
    <div class="formfield"><label class="field-label">Client</label><input type="text" id="finJeClient" data-finclient value="${escapeHtml(site.client_name||'')}"></div>
    <div class="formfield"><label class="field-label">Site address</label><input type="text" id="finJeAddr" value="${escapeHtml(site.address||'')}"></div>
    <div class="formfield"><label class="field-label">Postcode</label><input type="text" id="finJePc" value="${escapeHtml(site.postcode||'')}"></div>
    <button type="button" class="linkbtn" style="color:#C0392B;margin-top:4px;" onclick="finDeleteJob('${site.id}')">Delete project</button>
  </div>`;
}
// Read the Job card (if shown) into a sites patch; null = nothing to save.
function finJobEditPatch(site){
  if(!document.getElementById('finJeName')) return null;
  const p = {name:finVal('finJeName'), client_name:finVal('finJeClient')||null, address:finVal('finJeAddr')||null, postcode:finVal('finJePc')||null, start_date:finVal('finJeStart')||null};
  if(document.getElementById('finJePm')) p.responsible_pm_id = finVal('finJePm')||null;
  const st = finVal('finJeStatus');
  const cur = typeof siteStatusKey==='function' ? siteStatusKey(site) : site.status;
  if(st && st !== cur){ p.status = st; if(st==='closed'){ p.closed_at = new Date().toISOString(); p.closed_by = ME.id; } else { p.closed_at = null; p.closed_by = null; } }
  if(!p.name) return {error:'A project needs a name.'};
  const changed = Object.keys(p).some(k=>String(p[k]==null?'':p[k]) !== String(site[k]==null?'':site[k]));
  return changed ? p : null;
}

/* ---------- team ---------- */
let finTeamInvite = null;
async function renderFinTeam(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  await loadAllProfiles(true);
  const invites = isManager(ME) ? await dbSelect('invites', 'org_id=eq.'+ME.org_id+'&used_at=is.null&expires_at=gt.'+new Date().toISOString()+'&order=created_at.desc') : [];
  if(__gen !== RENDER_GEN) return;
  const people = Object.values(PROFILES).filter(p=>p.org_id===ME.org_id && p.role!=='superadmin').sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const canFin = isFinanceUser() && ME.role==='admin';
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('settings')}
    <p class="stub" style="margin:0 0 10px;font-style:normal;">Everyone in ${escapeHtml((ORG&&ORG.name)||'your company')}. To add someone: make an invite link, they sign up with it, then switch Finance on for them here.</p>
    <div class="card">
      ${people.map(p=>`<div class="finlabrow">
        <div><b>${escapeHtml(p.name||'')}</b>${p.id===ME.id?' <span class="stub" style="font-style:normal;">(you)</span>':''}<div class="stub" style="margin:2px 0 0;font-style:normal;">${escapeHtml(p.email||'')} · ${escapeHtml(finTeamRole(p))}</div></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          ${p.finance_enabled ? '<span class="finpill ok">Finance on</span>' : '<span class="finpill grey">No Finance</span>'}
          ${canFin && p.id!==ME.id ? `<button class="linkbtn" style="color:var(--blue);" onclick="finTeamToggle('${p.id}')">${p.finance_enabled?'Switch off':'Give Finance'}</button>` : ''}
          ${ME.role==='admin' && p.id!==ME.id && p.role!=='admin' && p.finance_enabled ? `<button class="linkbtn" style="color:var(--blue);" onclick="finTeamMakeAdmin('${p.id}')">Make admin</button>` : ''}
        </div>
      </div>`).join('')}
    </div>
    ${isManager(ME) ? `<div class="card">
      <p class="sectiontitle" style="margin-top:0;">Invite someone</p>
      ${finTeamInvite ? `<div class="sublink" style="word-break:break-all;font-size:12px;">${escapeHtml(finTeamInvite.link)}</div>
        <div class="row-gap" style="margin-top:8px;"><button class="ghostbtn" style="flex:1;" onclick="finTeamCopy()">Copy link</button></div>
        <div class="formfield" style="margin-top:8px;"><label class="field-label">Or email it to</label><div class="row-gap"><input type="email" id="finTeamEmail" style="flex:1;" placeholder="name@company.co.uk"><button class="darkbtn" style="width:auto;flex:none;" onclick="finTeamEmail()">Send</button></div></div>`
      : `<button class="darkbtn" style="width:100%;" onclick="finTeamNewInvite()">Make an invite link</button>`}
      ${invites.length ? `<p class="stub" style="margin:10px 0 0;font-style:normal;">${invites.length} invite link${invites.length===1?'':'s'} not used yet.</p>` : ''}
    </div>` : ''}
  `, {title:'Team', subtitle:'OpHUB Finance', back:'#/finance/settings', tabs:false});
}
function finTeamRole(p){ return p.role==='admin' ? 'Admin' : (p.role==='pm' ? 'Manager' : 'Member'); }
window.finTeamToggle = async function(userId){
  const p = PROFILES[userId]; if(!p) return;
  // Finance users need the manager role to create jobs, suppliers and POs.
  if(!p.finance_enabled && !['pm','admin'].includes(p.role)){
    const r = await dbUpdate('profiles', userId, {role:'pm'});
    if(!r){ toast('Could not update their role.'); return; }
    p.role = 'pm';
  }
  await toggleFinanceAccess(userId);
};
window.finTeamMakeAdmin = async function(userId){
  const p = PROFILES[userId]; if(!p) return;
  if(!await customConfirm('Make '+p.name+' an admin? Admins can give and remove Finance for others.')) return;
  const r = await dbUpdate('profiles', userId, {role:'admin'});
  if(r){ p.role = 'admin'; toast(p.name+' is now an admin'); render(); }
};
window.finTeamNewInvite = async function(){
  const rows = await dbInsert('invites', {org_id:ME.org_id, role:'operative', created_by:ME.id});
  if(!rows || !rows[0]) return;
  finTeamInvite = {id:rows[0].id, link: OPHUB_WEB_URL + '#/join/' + rows[0].id};
  render();
};
window.finTeamCopy = async function(){
  if(!finTeamInvite) return;
  try{ await navigator.clipboard.writeText(finTeamInvite.link); toast('Link copied'); }catch(e){ toast('Select and copy the link.'); }
};
window.finTeamEmail = async function(){
  const email = finVal('finTeamEmail');
  if(!finTeamInvite || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Enter a valid email address.'); return; }
  const res = await sbFetch('/functions/v1/send-invite-email', {method:'POST', body:JSON.stringify({invite_id:finTeamInvite.id, email})});
  const d = await res.json().catch(()=>({}));
  if(!res.ok || d.error){ toast(d.error || 'Could not send the invite.'); return; }
  toast('Invite sent to '+email); finTeamInvite = null; render();
};

// Next project number in the style already used (e.g. J103 → J104, 2661 → 2662).
function finNextJobNoGuess(){
  const by = {};
  SITES.forEach(x=>{ const m = /^([A-Za-z\-\/ ]*)(\d+)$/.exec(String(x.job_number||'').trim()); if(!m) return; const k = m[1]+'|'+m[2].length; const b = by[k] = by[k] || {p:m[1], len:m[2].length, max:0, n:0}; b.n++; b.max = Math.max(b.max, Number(m[2])); });
  const best = Object.values(by).sort((a,b)=>b.n-a.n || b.max-a.max)[0];
  if(!best) return '';
  return best.p + String(best.max+1).padStart(best.len, '0');
}
