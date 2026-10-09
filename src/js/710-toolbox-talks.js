/* ================= TOOLBOX TALKS =================
   PMs upload a weekly PDF as "Bank TBT", then tap "Issue for Signing" to make
   it the one Live TBT — operatives only ever see the currently-live talk plus
   any they've personally already signed (enforced in the RLS policy on
   toolbox_talks, not just hidden client-side). Signing uses the same adopted
   signature as RAMS, and once complete a PM can export a signed PDF just like
   RAMS. */
let tbtFilter = 'live'; // PM tab state: bank | live | completed
let tbtSubOpenFor = {}; // subcontractor_company_id -> bool, dropdown state on the main Toolbox Talks page
window.toggleTbtSub = function(companyId){
  tbtSubOpenFor[companyId] = !tbtSubOpenFor[companyId];
  render();
};
let tbtLastSiteId = null, tbtLastHasLive = null; // tracks when to auto-reapply the default tab (see renderToolboxTalks)
let selectedTbtIds = new Set(); // ticked toolbox talks in the Completed tab, for a combined email
window.toggleTbtSelect = function(id){
  if(selectedTbtIds.has(id)) selectedTbtIds.delete(id); else selectedTbtIds.add(id);
  render();
};
const TBT_STATUS_LABEL = {bank:'BANK', live:'LIVE', completed:'COMPLETED'};
const TBT_STATUS_CLASS = {bank:'pending', live:'open', completed:'closed'};
async function renderToolboxTalks(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const isPM = isManager(ME);
  // subcontractor_company_id=is.null — same fix as fetchRamsData: a
  // subcontractor's own Toolbox Talks (renderSubTbt, same table) must never
  // surface on RTB's own main Toolbox Talks list/sign roster.
  const __pProfiles = loadAllProfiles();
  const __pSubCos = isPM ? dbSelect('subcontractor_companies', 'site_id=eq.'+siteId+'&select=id,name&order=name.asc') : Promise.resolve([]);
  const __pAssigned = isPM ? dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : Promise.resolve([]);
  const talks = await dbSelect('toolbox_talks', 'site_id=eq.'+siteId+'&subcontractor_company_id=is.null&order=created_at.desc');
  const __pSigs = (isPM && talks.length) ? dbSelect('toolbox_talk_signatures', 'tbt_id=in.('+talks.map(t=>t.id).join(',')+')&select=tbt_id,user_id') : Promise.resolve([]);
  await __pProfiles;
  // Completed subcontractor Toolbox Talks — same read-only dropdown-per-
  // company pattern as Subcontractor RAMS/COSHH/Inspections above.
  let tbtSubCompanies = [], tbtByCompany = {};
  if(isPM){
    const allSubCompanies = await __pSubCos;
    if(allSubCompanies.length){
      const companyIds = allSubCompanies.map(c=>c.id).join(',');
      const subTalks = await dbSelect('toolbox_talks', 'subcontractor_company_id=in.('+companyIds+')&order=created_at.desc');
      subTalks.forEach(t=>{ (tbtByCompany[t.subcontractor_company_id]=tbtByCompany[t.subcontractor_company_id]||[]).push(t); });
      tbtSubCompanies = allSubCompanies.filter(c=>(tbtByCompany[c.id]||[]).length);
    }
  }
  let sigCounts = {};
  let outstandingByTalk = {};
  if(isPM && talks.length){
    const ids = talks.map(t=>t.id).join(',');
    const [sigs, assignedRows] = await Promise.all([__pSigs, __pAssigned]);
    const signedByTalk = {};
    // Only operatives count towards the standard signature roster — the PM
    // running the talk has their own "Carried out by" line on the detail
    // page instead, so they're excluded here (matches renderToolboxTalkView).
    sigs.filter(s=>PROFILES[s.user_id] && PROFILES[s.user_id].role==='operative').forEach(s=>{ sigCounts[s.tbt_id] = (sigCounts[s.tbt_id]||0)+1; (signedByTalk[s.tbt_id]=signedByTalk[s.tbt_id]||new Set()).add(s.user_id); });
    const roster = assignedRows.map(a=>a.user_id).filter(uid=>PROFILES[uid] && PROFILES[uid].role==='operative');
    talks.filter(t=>t.status==='live').forEach(t=>{
      const signed = signedByTalk[t.id] || new Set();
      outstandingByTalk[t.id] = roster.filter(uid=>!signed.has(uid)).map(uid=>nameOf(uid));
    });
  }
  if(isPM){
    // Default to the Live tab whenever there's a live talk to sign; otherwise
    // default to Bank TBT, since there's nothing live to show. Only reapplies
    // when the site changes or the live/no-live state actually flips, so a PM
    // who's deliberately browsing Completed doesn't get yanked out of it.
    const hasLive = talks.some(t=>t.status==='live');
    if(tbtLastSiteId !== siteId){ tbtLastSiteId = siteId; tbtLastHasLive = hasLive; tbtFilter = hasLive ? 'live' : 'bank'; }
    else if(tbtLastHasLive !== hasLive){ tbtLastHasLive = hasLive; tbtFilter = hasLive ? 'live' : 'bank'; }
  }
  const visibleTalks = isPM ? talks.filter(t=>t.status===tbtFilter) : talks;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const issuedThisMonth = talks.some(t=>(t.status==='live'||t.status==='completed') && new Date(t.created_at) >= monthStart);
  // A talk can be re-issued live every month and never actually get signed
  // off — "issued this month" alone would then wrongly read as compliant
  // forever. If this site has never had a single TBT actually COMPLETED,
  // the monthly prompt must still show regardless of what's merely live.
  const everCompleted = talks.some(t=>t.status==='completed');
  const tbtStillDue = !issuedThisMonth || !everCompleted;
  const dayOfMonth = now.getDate();
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${isPM && tbtStillDue ? `
    <div class="card" style="border:1.5px solid var(--warn);margin-bottom:10px;">
      <p style="margin:0;font-weight:600;color:var(--warn);">${!everCompleted ? '⚠ No Toolbox Talk has ever been completed at this site' : dayOfMonth>7 ? '⚠ Toolbox Talk overdue' : '⚠ Toolbox Talk due this month'}</p>
      <p class="stub" style="margin:4px 0 0;">${!everCompleted ? 'This site has never had a Toolbox Talk signed off and completed. Issue one from Bank TBT below and get it fully signed.' : dayOfMonth>7 ? "This site hasn't had a Toolbox Talk issued this month — compulsory by the 7th. Issue one from Bank TBT below." : 'No Toolbox Talk issued yet this month. Issue one from Bank TBT by the 7th — you can of course do more as needed.'}</p>
    </div>
    ` : ''}
    ${isPM ? `
    <div class="filterrow">
      <div class="filterchip ${tbtFilter==='bank'?'active':''}" onclick="tbtFilter='bank';selectedTbtIds=new Set();render()">Bank TBT</div>
      <div class="filterchip ${tbtFilter==='live'?'active':''}" onclick="tbtFilter='live';selectedTbtIds=new Set();render()">Live TBT</div>
      <div class="filterchip ${tbtFilter==='completed'?'active':''}" onclick="tbtFilter='completed';selectedTbtIds=new Set();render()">Completed TBT</div>
    </div>
    ` : ''}

    ${isPM && tbtFilter==='completed' && selectedTbtIds.size>0 ? `
      <button class="darkbtn" style="margin-bottom:10px;" onclick="openEmailSelectedTbtsPrompt('${siteId}')">✉ Email ${selectedTbtIds.size} Selected (individual PDFs, one email)</button>
    ` : ''}
    ${visibleTalks.map(t=>`
      <div class="card" style="margin-bottom:10px;" onclick="${isPM && tbtFilter==='completed' ? `toggleTbtSelect('${t.id}')` : `go('#/site/${siteId}/hs/tbt/${t.id}')`}">
        <div class="top" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="display:flex;align-items:flex-start;gap:8px;min-width:0;">
            ${isPM && tbtFilter==='completed' ? `<input type="checkbox" style="width:17px;height:17px;flex:0 0 17px;margin-top:2px;" ${selectedTbtIds.has(t.id)?'checked':''} onclick="event.stopPropagation();toggleTbtSelect('${t.id}')">` : ''}
            <div><div class="title">${escapeHtml(t.title)}</div><div class="loc">${new Date(t.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div></div>
          </div>
          <span style="display:flex;align-items:center;gap:6px;flex:none;"><span class="statustag2 ${TBT_STATUS_CLASS[t.status]||'closed'}">${TBT_STATUS_LABEL[t.status]||t.status}</span>${isPM && t.status==='live' ? `<span class="taskicon danger" title="Delete" onclick="event.stopPropagation();deleteToolboxTalk('${siteId}','${t.id}','${jsAttr(t.storage_path)}',${sigCounts[t.id]||0})">🗑</span>` : ''}</span>
        </div>
        ${isPM ? `<div class="stub" style="margin:8px 0 0;">${sigCounts[t.id]||0} signed</div>` : ''}
        ${isPM && t.status==='live' && outstandingByTalk[t.id] ? (outstandingByTalk[t.id].length ? `<div class="stub" style="margin:2px 0 0;color:var(--warn);">Still to sign: ${outstandingByTalk[t.id].map(escapeHtml).join(', ')}</div>` : `<div class="stub" style="margin:2px 0 0;color:var(--ok);">Everyone assigned has signed</div>`) : ''}
        ${isPM && tbtFilter==='completed' ? `<button class="ghostbtn" style="margin-top:8px;" onclick="event.stopPropagation();go('#/site/${siteId}/hs/tbt/${t.id}')">Open</button>` : ''}
      </div>
    `).join('') || `<div class="empty">No ${isPM ? TBT_STATUS_LABEL[tbtFilter].toLowerCase()+' ' : ''}toolbox talks${isPM?'':' yet'}.</div>`}

    ${isPM && tbtFilter==='bank' ? `
    <button class="ghostbtn" style="margin-bottom:10px;" ${tbtSyncBusy?'disabled':''} onclick="syncTbtBankFromLibrary('${siteId}')">${tbtSyncBusy?'Syncing…':'🔄 Sync Bank TBT from Admin Centre Library'}</button>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Upload a toolbox talk</p>
      <div class="formfield"><input type="text" id="tbtTitle" placeholder="Title, e.g. Week 24 — Manual Handling"></div>
      <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('tbtFile').click()">Choose PDF</div>
      <input type="file" accept="application/pdf" id="tbtFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('tbtFileName').textContent=this.files[0]?this.files[0].name:''">
      <p class="stub" id="tbtFileName" style="margin:-4px 0 10px;"></p>
      <button class="darkbtn" onclick="addToolboxTalk('${siteId}')">Upload</button>
      <p class="stub">New uploads go into Bank TBT — operatives can't see them until you tap "Issue for Signing".</p>
    </div>
    ` : ''}
    ${isPM && tbtSubCompanies.length ? `
    <p class="sectiontitle" style="margin-top:22px;">Subcontractor Toolbox Talks</p>
    ${tbtSubCompanies.map(c=>{
      const ctalks = tbtByCompany[c.id]||[];
      const open = !!tbtSubOpenFor[c.id];
      return `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px;">
        <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;" onclick="toggleTbtSub('${c.id}')">
          <span class="arrow">${open?'▼':'▶'}</span> ${escapeHtml(c.name)} <span class="stub" style="display:inline;">(${ctalks.length})</span>
        </p>
        ${open ? `<div style="padding:0 14px 14px;">
          ${ctalks.map(t=>`
            <div style="padding:8px 0;border-bottom:1px solid var(--line);">
              <div class="sitecard" style="cursor:pointer;padding:0;border:none;" onclick="go('#/site/${siteId}/mc/subcontractors/${c.id}/tbt/${t.id}')">
                <div class="info"><div class="name">${escapeHtml(t.title)}</div><div class="addr">${new Date(t.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div></div>
                <span class="statustag2 ${TBT_STATUS_CLASS[t.status]||'closed'}">${TBT_STATUS_LABEL[t.status]||t.status}</span>
              </div>
              <div class="row-gap" style="margin-top:4px;">
                <div class="viewlink" style="cursor:pointer;" onclick="exportSignedToolboxTalk('${t.id}')">⬇ Export</div>
                <div class="viewlink" style="cursor:pointer;" onclick="emailSignedToolboxTalk('${siteId}','${t.id}')">✉️ Email</div>
              </div>
            </div>
          `).join('')}
          <button class="ghostbtn" style="margin-top:6px;" onclick="go('#/site/${siteId}/mc/subcontractors/${c.id}/tbt')">Open ${escapeHtml(c.name)}'s Toolbox Talks</button>
        </div>` : ''}
      </div>
      `;
    }).join('')}
    ` : ''}
  `, {title:'Toolbox Talks', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs`, siteId, activeTab:'more'}); }
}
let tbtReplaceFileOpen = null;
let tbtReplaceBusy = false;
let tbtCompanyWideBusy = null;
let tbtNotifyBusy = null;
// PM/admin-only: pushes a "please sign" notification to every operative
// still outstanding on this specific live toolbox talk.
window.notifyOutstandingTbt = async function(siteId, tbtId){
  const rows = await dbSelect('toolbox_talk_signatures', 'tbt_id=eq.'+tbtId+'&select=user_id');
  await loadAllProfiles();
  const assignedRows = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
  const signedIds = new Set(rows.map(r=>r.user_id));
  const outstandingIds = assignedRows.map(a=>a.user_id).filter(uid=>PROFILES[uid] && PROFILES[uid].role==='operative' && !signedIds.has(uid));
  if(!outstandingIds.length){ toast('Everyone has signed this toolbox talk.'); return; }
  if(!await customConfirm(`Send a sign-reminder notification to ${outstandingIds.length} operative${outstandingIds.length===1?'':'s'} who still need to sign this toolbox talk?`)) return;
  tbtNotifyBusy = tbtId; render();
  try{
    const res = await sbFetch('/functions/v1/send-sign-reminder', {method:'POST', body: JSON.stringify({site_id:siteId, doc_type:'tbt', tbt_id:tbtId, user_ids: outstandingIds})});
    const d = await res.json();
    tbtNotifyBusy = null;
    if(!res.ok || d.error){ toast('Could not send reminder — '+(d.error||res.status)); render(); return; }
    toast(d.sent ? `Reminder sent to ${d.sent} device${d.sent===1?'':'s'}.` : 'No registered devices to notify yet.');
    render();
  }catch(e){ console.error(e); tbtNotifyBusy = null; toast('Could not send reminder.'); render(); }
};
// Issues a Bank TBT for signing at every currently-live site in the org at
// once — each site gets its own independent live copy (mirrors the per-site
// issue logic: any other live talk at that site is closed first), so
// signatures, auto-completion and per-site emailing all work exactly the
// same as issuing one site at a time.
window.issueToolboxTalkCompanyWide = async function(tbtId, title){
  if(!await customConfirm(`Issue "${title}" for signing at every live site company-wide?`)) return;
  tbtCompanyWideBusy = tbtId; render();
  try{
    const rows = await dbSelect('toolbox_talks', 'id=eq.'+tbtId+'&select=*');
    const source = rows && rows[0];
    if(!source){ tbtCompanyWideBusy=null; toast('Toolbox talk not found.'); render(); return; }
    const liveSites = SITES.filter(s=>siteStatusKey(s)==='live');
    let issued = 0;
    for(const site of liveSites){
      try{
        const others = await dbSelect('toolbox_talks', 'site_id=eq.'+site.id+'&status=eq.live&subcontractor_company_id=is.null&select=id');
        for(const o of others){ await dbUpdate('toolbox_talks', o.id, {status:'completed'}); }
        const created = await dbInsert('toolbox_talks', {site_id:site.id, org_id:source.org_id, title:source.title, storage_path:source.storage_path, status:'live', created_by:ME.id});
        if(created && created[0]){ issued++; notifyDocNeedsSigning(site.id, 'TBT', source.title); }
      }catch(e){ /* keep going for other sites */ }
    }
    tbtCompanyWideBusy = null;
    toast(`Issued for signing at ${issued} live site${issued===1?'':'s'} — original kept in Bank TBT`);
    render();
  }catch(e){ console.error(e); tbtCompanyWideBusy=null; toast('Could not issue company-wide — try again.'); render(); }
};
window.handleTbtActionMenu = function(action, siteId, tbtId, title, storagePath){
  if(action==='edit') renameToolboxTalk(tbtId, title);
  else if(action==='replace'){ tbtReplaceFileOpen = tbtReplaceFileOpen===tbtId ? null : tbtId; render(); }
  else if(action==='delete') deleteToolboxTalk(siteId, tbtId, storagePath);
};
window.renameToolboxTalk = async function(tbtId, currentTitle){
  const next = await customPrompt('Rename toolbox talk', currentTitle);
  if(next==null) return;
  const trimmed = next.trim();
  if(!trimmed || trimmed===currentTitle) return;
  const row = await dbUpdate('toolbox_talks', tbtId, {title: trimmed});
  if(row){ toast('Title updated'); render(); }
};
window.replaceToolboxTalkFile = async function(siteId, tbtId){
  const input = document.getElementById('tbtReplaceInput-'+tbtId);
  const file = input && input.files && input.files[0];
  if(!file){ toast('Choose a PDF first.'); return; }
  tbtReplaceBusy = true; render();
  const path = siteId+'/tbt/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('rams-docs', path, file, 'application/pdf');
  if(!stored){ tbtReplaceBusy = false; render(); return; }
  const row = await dbUpdate('toolbox_talks', tbtId, {storage_path: stored});
  tbtReplaceBusy = false;
  if(row){ tbtReplaceFileOpen = null; toast('File replaced'); }
  render();
};
window.addToolboxTalk = async function(siteId){
  const title = document.getElementById('tbtTitle').value.trim();
  const fileInput = document.getElementById('tbtFile');
  const file = fileInput.files && fileInput.files[0];
  if(!title || !file){ toast('Add a title and choose a PDF.'); return; }
  const path = siteId+'/tbt/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('rams-docs', path, file, 'application/pdf');
  if(!stored) return;
  const rows = await dbInsert('toolbox_talks', {site_id:siteId, org_id:ME.org_id, title, storage_path:stored, status:'bank', created_by:ME.id});
  if(rows){ tbtFilter='bank'; toast('Toolbox talk uploaded to Bank TBT'); render(); }
};
async function renderToolboxTalkView(siteId, tbtId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const isPM = isManager(ME);
  const isClientView = ME.role==='client';
  const rows = await dbSelect('toolbox_talks', 'id=eq.'+tbtId+'&select=*');
  const talk = rows && rows[0];
  if(!talk){ toast('Could not load that toolbox talk — it may no longer be live.'); go(`#/site/${siteId}/hs/tbt`); return; }
  const sigs = await dbSelect('toolbox_talk_signatures', 'tbt_id=eq.'+tbtId+'&order=signed_at.asc');
  await loadAllProfiles();
  const mine = sigs.find(s=>s.user_id===ME.id);
  const isLive = talk.status==='live';
  const assignedRows = isPM ? await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : [];
  // The standard signature roster is the operatives who attended — the PM
  // running the talk isn't counted as one of them (and doesn't show up as
  // "outstanding" if they haven't personally ticked "sign"); their part is
  // the separate "Carried out by" line/signature at the bottom instead.
  const operativeRoster = assignedRows.filter(a=>PROFILES[a.user_id] && PROFILES[a.user_id].role==='operative');
  const operativeSigs = sigs.filter(s=>PROFILES[s.user_id] && PROFILES[s.user_id].role==='operative');
  const signedIds = new Set(operativeSigs.map(s=>s.user_id));
  const outstanding = operativeRoster.filter(a=>!signedIds.has(a.user_id));
  const conductor = talk.created_by && PROFILES[talk.created_by] ? PROFILES[talk.created_by] : null;

  // Once at least one person has signed, the document is locked: title can
  // no longer be edited, the file can't be replaced, and it can't be
  // deleted — only Export / Close / Email remain available from here on.
  const hasAnySignature = sigs.length > 0;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <p class="sectiontitle" style="margin-top:0;font-size:17px;font-weight:800;">${escapeHtml(talk.title)}</p>
        <span class="statustag2 ${TBT_STATUS_CLASS[talk.status]||'closed'}">${TBT_STATUS_LABEL[talk.status]||talk.status}</span>
      </div>
      <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', talk.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(talk.title)?talk.title:talk.title+'.pdf')}')">View document ↗</div>
      ${isClientView ? `
      <div class="siglinebox" style="margin-top:14px;cursor:default;">
        <span class="name">${sigs.length} signed</span>
      </div>
      ${sigs.length ? `<button class="ghostbtn exportbtn" style="margin-top:8px;" onclick="exportSignedToolboxTalk('${tbtId}')">Export Signed TBT</button>` : ''}
      ` : `
      <div class="siglinebox ${mine?'signed':''}" style="margin-top:14px;${mine||!isLive?'':'cursor:pointer;'}" onclick="${mine||!isLive?'':`signToolboxTalk('${siteId}','${tbtId}')`}">
        ${mine ? (mine.signature_image_path ? `<img src="${publicUrl('signatures', mine.signature_image_path)}" style="height:34px;max-width:140px;object-fit:contain;">` : `<span class="name">${escapeHtml(ME.name)}</span>`) + `<span>Signed ${new Date(mine.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</span>` : (isLive ? 'Tap to sign' : 'Not live — can\'t sign')}
      </div>
      `}
    </div>
    ${isPM ? `
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Manager controls</p>
      ${talk.status==='bank' ? `
      <div class="row-gap">
        <button class="darkbtn" style="flex:1;" onclick="setToolboxTalkStatus('${siteId}','${tbtId}','live')">Issue to This Site</button>
        <button class="ghostbtn" style="flex:1;" ${tbtCompanyWideBusy===tbtId?'disabled':''} onclick="issueToolboxTalkCompanyWide('${tbtId}','${jsAttr(talk.title)}')">${tbtCompanyWideBusy===tbtId?'Issuing…':'📢 Issue Company-Wide'}</button>
      </div>
      ` : ''}
      <div class="row-gap" style="margin-top:8px;align-items:stretch;">
        ${sigs.length ? `<button class="ghostbtn exportbtn" style="flex:1;font-size:11px;padding:6px 4px;" onclick="exportSignedToolboxTalk('${tbtId}')">Export Signed TBT</button>` : '<div style="flex:1;"></div>'}
        ${talk.status==='live' ? `<button style="flex:1;font-size:11px;padding:6px 4px;border:none;border-radius:9px;font-weight:700;background:var(--brand1);color:var(--brand1-text);" onclick="setToolboxTalkStatus('${siteId}','${tbtId}','completed')">Close TBT</button>` : '<div style="flex:1;"></div>'}
        ${sigs.length ? `<button class="ghostbtn exportbtn" style="flex:1;font-size:11px;padding:6px 4px;" ${tbtEmailBusy===tbtId?'disabled':''} onclick="emailTbtManual('${siteId}','${tbtId}')">${tbtEmailBusy===tbtId?'Sending…':'Email TBT'}</button>` : '<div style="flex:1;"></div>'}
      </div>
      ${hasAnySignature && talk.status==='live' ? `<button class="ghostbtn" style="margin-top:8px;color:var(--warn);font-size:11px;padding:6px 4px;" onclick="deleteToolboxTalk('${siteId}','${tbtId}','${jsAttr(talk.storage_path)}',${sigs.length})">🗑 Delete TBT</button>` : ''}
      ${!hasAnySignature ? `
      <div class="row-gap" style="margin-top:8px;">
        <select style="flex:1;min-width:0;margin:0;font-size:11px;padding:6px 4px;" onchange="handleTbtActionMenu(this.value,'${siteId}','${tbtId}','${jsAttr(talk.title)}','${jsAttr(talk.storage_path)}');this.selectedIndex=0;">
          <option value="" selected disabled>More actions ▾</option>
          <option value="edit">Edit Title</option>
          <option value="replace">Replace File</option>
          <option value="delete">Delete</option>
        </select>
      </div>
      ` : ''}
      ${tbtReplaceFileOpen===tbtId && !hasAnySignature ? `
      <div class="card" style="margin-top:10px;">
        <p class="stub" style="margin:0 0 8px;">Choose a new PDF to replace the current document. The title stays the same — only the file changes.</p>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:8px;" onclick="document.getElementById('tbtReplaceInput-${tbtId}').click()">Choose PDF</div>
        <input type="file" accept="application/pdf" id="tbtReplaceInput-${tbtId}" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('tbtReplaceFileName-${tbtId}').textContent=this.files[0]?this.files[0].name:''">
        <p class="stub" id="tbtReplaceFileName-${tbtId}" style="margin:-4px 0 10px;"></p>
        <button class="darkbtn" ${tbtReplaceBusy?'disabled':''} onclick="replaceToolboxTalkFile('${siteId}','${tbtId}')">${tbtReplaceBusy?'Uploading…':'Replace File'}</button>
      </div>
      ` : ''}
      <p class="sectiontitle" style="margin-top:18px;">${operativeSigs.length} signed</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px 8px;">
        ${operativeSigs.map(s=>`<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px;padding:6px 2px;border:1px solid var(--line);border-radius:8px;font-size:10.5px;">
          ${s.signature_image_path ? `<img src="${publicUrl('signatures', s.signature_image_path)}" style="height:16px;object-fit:contain;">` : '✓'}
          <span style="font-weight:700;line-height:1.15;">${escapeHtml(nameOf(s.user_id))}</span>
          <span style="color:var(--slate);font-size:9px;">${new Date(s.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</span>
        </div>`).join('')}
      </div>
      ${!operativeSigs.length ? `<div class="empty">No one has signed yet.</div>` : ''}
      ${isLive ? `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px;gap:8px;">
        <p class="sectiontitle" style="margin:0;">${outstanding.length} still to sign</p>
        ${outstanding.length ? `<button class="ghostbtn" style="width:auto;padding:5px 10px;font-size:10.5px;" ${tbtNotifyBusy===tbtId?'disabled':''} onclick="notifyOutstandingTbt('${siteId}','${tbtId}')">${tbtNotifyBusy===tbtId?'Sending…':'🔔 Notify outstanding'}</button>` : ''}
      </div>
      ${outstanding.map(a=>`<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--line);color:var(--warn);font-size:10.5px;">✗ ${escapeHtml(nameOf(a.user_id))}</div>`).join('') || `<div class="empty">Everyone assigned has signed.</div>`}
      ` : ''}
    </div>
    ` : ''}
  `, {title:talk.title, subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/tbt`, siteId, activeTab:'more'}); }
}
window.signToolboxTalk = async function(siteId, tbtId){
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const rows = await dbInsert('toolbox_talk_signatures', {tbt_id:tbtId, user_id:ME.id, signature_image_path:ME.signature_path});
  if(rows){
    toast('Signed');
    await maybeAutoCompleteToolboxTalk(siteId, tbtId);
    render();
  }
};
// Once every operative assigned to this site has signed a live TBT, close it
// automatically and email a signed copy to the responsible PM (or every
// PM/admin if no one's been set as this site's owner) — best-effort, never
// blocks the signing flow itself if anything here fails.
async function maybeAutoCompleteToolboxTalk(siteId, tbtId){
  try{
    await loadAllProfiles();
    const [assigned, sigs] = await Promise.all([
      dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
      dbSelect('toolbox_talk_signatures', 'tbt_id=eq.'+tbtId+'&select=user_id'),
    ]);
    // Only operatives need to sign for auto-completion — the PM running the
    // talk is recorded separately as "Carried out by" and never taps sign.
    const operativeAssigned = assigned.filter(a=>PROFILES[a.user_id] && PROFILES[a.user_id].role==='operative');
    if(!operativeAssigned.length) return; // nobody assigned to compare against yet
    const signedIds = new Set(sigs.map(s=>s.user_id));
    if(!operativeAssigned.every(a=>signedIds.has(a.user_id))) return;
    const row = await dbUpdate('toolbox_talks', tbtId, {status:'completed'});
    if(row){
      toast('Everyone has signed — TBT closed automatically');
      await emailCompletedTbtToPM(siteId, tbtId);
    }
  }catch(e){ /* best-effort */ }
}
let tbtEmailBusy = null;
window.emailTbtManual = async function(siteId, tbtId){
  tbtEmailBusy = tbtId; render();
  try{
    const built = await buildSignedToolboxTalkPdfBytes(tbtId);
    if(!built){ tbtEmailBusy=null; toast('Could not build the PDF to email.'); render(); return; }
    const site = SITES.find(s=>s.id===siteId);
    await loadAllProfiles();
    let recipients = [];
    if(site && site.responsible_pm_id && PROFILES[site.responsible_pm_id] && PROFILES[site.responsible_pm_id].email){
      recipients = [PROFILES[site.responsible_pm_id].email];
    } else {
      recipients = Object.values(PROFILES).filter(p=>(p.role==='pm'||p.role==='admin') && p.email && !isEstimator(p)).map(p=>p.email);
    }
    if(!recipients.length){ tbtEmailBusy=null; toast('No project manager email found to send to.'); render(); return; }
    let binary=''; const chunk=0x8000;
    for(let i=0;i<built.outBytes.length;i+=chunk) binary += String.fromCharCode.apply(null, built.outBytes.subarray(i,i+chunk));
    const base64 = btoa(binary);
    const res = await sbFetch('/functions/v1/send-tbt-completion', {method:'POST', timeoutMs:60000, body: JSON.stringify({
      site_id: siteId, recipients, site_name: site?site.name:'', tbt_title: built.talk.title, filename: built.filename, pdf_base64: base64,
    })});
    tbtEmailBusy = null;
    if(res.ok) toast('Toolbox Talk emailed'); else toast('Could not send email — try again.');
    render();
  }catch(e){ console.error(e); tbtEmailBusy=null; toast('Could not send email — try again.'); render(); }
};
// Completed tab multi-select: email several toolbox talks in one message,
// each as its own signed PDF attachment. Address popup follows the same
// pattern as the material-order re-email prompt (persistent DOM node outside
// render(), so typing the address doesn't get reset by a re-render).
window.openEmailSelectedTbtsPrompt = async function(siteId){
  if(!selectedTbtIds.size) return;
  const site = SITES.find(s=>s.id===siteId);
  await loadAllProfiles();
  let defaultEmail = '';
  if(site && site.responsible_pm_id && PROFILES[site.responsible_pm_id]) defaultEmail = PROFILES[site.responsible_pm_id].email || '';
  if(!defaultEmail && ME && ME.email) defaultEmail = ME.email;
  let ov = document.getElementById('tbtEmailModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'tbtEmailModalOverlay';
    ov.className = 'geo-modal-overlay';
    ov.onclick = (e)=>{ if(e.target===ov) window.closeTbtEmailPrompt(); };
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div class="geo-modal-card">
      <h3>Email ${selectedTbtIds.size} Toolbox Talk${selectedTbtIds.size>1?'s':''}</h3>
      <p class="stub">Each selected talk is attached as its own signed PDF, in one email.</p>
      <div class="formfield"><label class="field-label">Send to</label><input type="email" id="tbtEmailAddressInput" value="${escapeHtml(defaultEmail)}" placeholder="name@example.com"></div>
      <button class="darkbtn" id="tbtEmailConfirmBtn" style="width:100%;" onclick="confirmEmailSelectedTbts('${siteId}')">Confirm &amp; Send</button>
      <button class="geo-modal-cancel" onclick="closeTbtEmailPrompt()">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
};
window.closeTbtEmailPrompt = function(){
  const ov = document.getElementById('tbtEmailModalOverlay');
  if(ov) ov.style.display = 'none';
};
window.confirmEmailSelectedTbts = async function(siteId){
  const input = document.getElementById('tbtEmailAddressInput');
  const email = input ? input.value.trim() : '';
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Enter a valid email address.'); return; }
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  const btn = document.getElementById('tbtEmailConfirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Building PDFs…'; }
  const ids = Array.from(selectedTbtIds);
  const attachments = [];
  const titles = [];
  let skipped = 0;
  for(const id of ids){
    try{
      const built = await buildSignedToolboxTalkPdfBytes(id);
      if(!built){ skipped++; continue; }
      let binary=''; const chunk=0x8000;
      for(let i=0;i<built.outBytes.length;i+=chunk) binary += String.fromCharCode.apply(null, built.outBytes.subarray(i,i+chunk));
      attachments.push({filename: built.filename, content: btoa(binary)});
      titles.push(built.talk.title);
    }catch(e){ console.error(e); skipped++; }
  }
  if(!attachments.length){
    toast('None of the selected talks have signatures to build a PDF from.');
    if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
    return;
  }
  if(btn) btn.textContent = 'Sending…';
  const site = SITES.find(s=>s.id===siteId);
  try{
    const res = await sbFetch('/functions/v1/send-tbt-completion', {method:'POST', timeoutMs:60000, body: JSON.stringify({
      site_id: siteId, recipients:[email], site_name: site?site.name:'', tbt_titles: titles, attachments,
    })});
    const d = await res.json();
    if(res.ok && !d.error){
      const skipNote = skipped ? `<p class="stub" style="margin:0 0 12px;color:var(--warn);">${skipped} selected talk${skipped>1?'s were':' was'} skipped — no signatures yet.</p>` : '';
      const card = document.querySelector('#tbtEmailModalOverlay .geo-modal-card');
      if(card){
        card.innerHTML = `<h3>✓ Email sent</h3><p class="stub" style="margin:0 0 12px;">${attachments.length} Toolbox Talk PDF${attachments.length>1?'s':''} emailed to ${escapeHtml(email)}.</p>${skipNote}<button class="darkbtn" style="width:100%;" onclick="closeTbtEmailPrompt();selectedTbtIds=new Set();render()">Done</button>`;
      } else { selectedTbtIds = new Set(); render(); }
    } else {
      console.error('send-tbt-completion failed:', d.error || res.status);
      toast('Email failed — '+(d.error ? String(d.error).slice(0,140) : 'try again.'));
      if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
    }
  }catch(e){
    console.error(e);
    toast('Email failed — could not reach the server.');
    if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
  }
};
async function emailCompletedTbtToPM(siteId, tbtId){
  try{
    const built = await buildSignedToolboxTalkPdfBytes(tbtId);
    if(!built) return;
    const site = SITES.find(s=>s.id===siteId);
    await loadAllProfiles();
    let recipients = [];
    if(site && site.responsible_pm_id && PROFILES[site.responsible_pm_id] && PROFILES[site.responsible_pm_id].email){
      recipients = [PROFILES[site.responsible_pm_id].email];
    } else {
      recipients = Object.values(PROFILES).filter(p=>(p.role==='pm'||p.role==='admin') && p.email && !isEstimator(p)).map(p=>p.email);
    }
    if(!recipients.length) return;
    let binary=''; const chunk=0x8000;
    for(let i=0;i<built.outBytes.length;i+=chunk) binary += String.fromCharCode.apply(null, built.outBytes.subarray(i,i+chunk));
    const base64 = btoa(binary);
    await sbFetch('/functions/v1/send-tbt-completion', {method:'POST', timeoutMs:60000, body: JSON.stringify({
      site_id: siteId, recipients, site_name: site?site.name:'', tbt_title: built.talk.title, filename: built.filename, pdf_base64: base64,
    })});
  }catch(e){ /* best-effort */ }
}
window.setToolboxTalkStatus = async function(siteId, tbtId, newStatus){
  if(newStatus==='live'){
    // Only one toolbox talk is ever "live" per site at a time — automatically
    // mark any other live talk at this site as completed first. Scoped to
    // subcontractor_company_id=is.null so issuing RTB's own TBT never
    // auto-completes a subcontractor's own separately-live toolbox talk.
    const others = await dbSelect('toolbox_talks', 'site_id=eq.'+siteId+'&status=eq.live&subcontractor_company_id=is.null&select=id');
    for(const o of others){ await dbUpdate('toolbox_talks', o.id, {status:'completed'}); }

    // Issuing a Bank TBT for signing makes an independent live copy rather
    // than converting the bank item in place — that way the original stays
    // in Bank TBT, ready to reuse next time (e.g. next week's toolbox talk),
    // and signatures attach only to the live copy that was actually issued.
    const rows = await dbSelect('toolbox_talks', 'id=eq.'+tbtId+'&select=*');
    const source = rows && rows[0];
    if(!source){ toast('Toolbox talk not found.'); return; }
    if(source.status==='bank'){
      const created = await dbInsert('toolbox_talks', {site_id:siteId, org_id:source.org_id, title:source.title, storage_path:source.storage_path, status:'live', created_by:ME.id});
      if(created && created[0]){
        tbtFilter = 'live';
        toast('Issued for signing — original kept in Bank TBT for reuse');
        notifyDocNeedsSigning(siteId, 'TBT', source.title);
        go(`#/site/${siteId}/hs/tbt/${created[0].id}`);
      }
      return;
    }
  }
  const row = await dbUpdate('toolbox_talks', tbtId, {status:newStatus});
  if(row){
    tbtFilter = newStatus;
    toast(newStatus==='live' ? 'Issued for signing' : 'Marked as completed');
    if(newStatus==='live') notifyDocNeedsSigning(siteId, 'TBT', row.title);
    render();
  }
};
window.deleteToolboxTalk = async function(siteId, tbtId, storagePath, signedCount){
  const n = Number(signedCount)||0;
  if(!await customConfirm(n ? 'Delete this toolbox talk? '+n+' '+(n===1?'person has':'people have')+' already signed it — their signatures will be deleted too. This can\'t be undone.' : 'Delete this toolbox talk and all its signatures? This can\'t be undone.', n ? {confirmLabel:'Yes — delete', danger:true} : undefined)) return;
  const tbtRows = await dbSelect('toolbox_talks', 'id=eq.'+tbtId+'&select=title');
  const tbtTitle = tbtRows[0] && tbtRows[0].title;
  const ok = await dbDelete('toolbox_talks', tbtId);
  if(ok){
    logSiteActivity(siteId, 'toolbox_talk_deleted', `Deleted toolbox talk "${tbtTitle||''}"`);
    // The same PDF can be shared by several talks now — the Bank TBT
    // original, the live copy issued from it, and copies pre-loaded into
    // other sites all point at the same storage_path. Only remove the
    // actual file once nothing else references it, otherwise deleting one
    // copy would break the document link on every other copy.
    try{
      const [stillUsed, stillUsedAsTemplate] = await Promise.all([
        dbSelect('toolbox_talks', 'storage_path=eq.'+encodeURIComponent(storagePath)+'&select=id&limit=1'),
        dbSelect('tbt_templates', 'storage_path=eq.'+encodeURIComponent(storagePath)+'&select=id&limit=1'),
      ]);
      if(!stillUsed.length && !stillUsedAsTemplate.length){
        await sbFetch('/storage/v1/object/rams-docs/'+storagePath, {method:'DELETE'});
      }
    }catch(e){ /* non-fatal — the file being left behind is harmless */ }
    toast('Toolbox talk deleted');
    go(`#/site/${siteId}/hs/tbt`);
  }
};
// Shared by exportSignedToolboxTalk (manual export) and the auto-complete
// email below — builds the signed-copy PDF and hands back its bytes without
// delivering it anywhere, so both callers can decide what to do with it.
async function buildSignedToolboxTalkPdfBytes(tbtId){
  if(!(await loadLib('PDFLib'))) return null;
  const rows = await dbSelect('toolbox_talks', 'id=eq.'+tbtId+'&select=*');
  const talk = rows[0];
  if(!talk) return null;
  const sigs = await dbSelect('toolbox_talk_signatures', 'tbt_id=eq.'+tbtId+'&order=signed_at.asc');
  if(!sigs.length) return null;
  await loadAllProfiles();
  const srcBytes = await (await fetch(publicUrl('rams-docs', talk.storage_path))).arrayBuffer();
  const pdfDoc = await PDFLib.PDFDocument.load(srcBytes, {ignoreEncryption:true});
  const disclaimer = `I have read and understood the contents of this Toolbox Talk (${talk.title}). At all times employees must work in a safe manner both to prevent personal injury or injury/harm to others. Anything I did not understand has been explained to me to my satisfaction.`;
  // Operatives only in the signature grid — the PM/admin who conducted the
  // talk gets their own standalone "Conducted by" row instead (mirrors the
  // in-app "Carried out by" card / roster-exclusion logic).
  const signers = sigs.filter(s=>PROFILES[s.user_id] && PROFILES[s.user_id].role==='operative').map(s=>({
    name: nameOf(s.user_id),
    when: new Date(s.signed_at).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    imagePath: s.signature_image_path,
  }));
  // Whoever actually tapped "sign" as the PM/manager running this talk is
  // the one whose signature should show here — that's captured live in
  // toolbox_talk_signatures (signature_image_path), same as an operative's.
  // Falls back to the talk's creator (using their generally-adopted profile
  // signature) only if no manager has signed it yet, e.g. an export pulled
  // before anyone in charge has actually signed.
  const managerSig = sigs.find(s=>PROFILES[s.user_id] && isManager(PROFILES[s.user_id]));
  let conductedBy = null;
  if(managerSig){
    conductedBy = {name: nameOf(managerSig.user_id), signaturePath: managerSig.signature_image_path};
  } else {
    const conductorProfile = talk.created_by && PROFILES[talk.created_by] ? PROFILES[talk.created_by] : null;
    conductedBy = conductorProfile ? {name: conductorProfile.name, signaturePath: conductorProfile.signature_path} : null;
  }
  await drawSignatureTablePages(pdfDoc, {title: talk.title, disclaimer, signers, conductedBy});

  const tbtSite = SITES.find(s=>s.id===talk.site_id);
  const filename = exportFilename(tbtSite?tbtSite.name:'', talk.title+' (Signed)', 'pdf');
  pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
  const outBytes = await pdfDoc.save();
  return {outBytes, filename, talk};
}
window.exportSignedToolboxTalk = async function(tbtId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  toast('Building signed PDF…');
  try{
    const built = await buildSignedToolboxTalkPdfBytes(tbtId);
    if(!built){ toast('No signatures yet.'); return; }
    await deliverPdf(built.outBytes, built.filename);
  }catch(e){
    console.error(e);
    toast('Could not build the signed PDF — the source file may not be a valid PDF.');
  }
};
window.emailSignedToolboxTalk = async function(siteId, tbtId){
  const site = SITES.find(s=>s.id===siteId);
  const answer = await customPromptWithCc('Email this signed Toolbox Talk PDF to:', '', site);
  if(!answer) return;
  const typedTrim = (answer.value||'').trim();
  if(typedTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedTrim)){ toast('Enter a valid email address.'); return; }
  const emailTo = resolvePromptEmailTo(answer);
  if(!emailTo) return; // nothing typed and "CC me a copy" wasn't ticked either
  const trimmed = emailTo.to;
  toast('Building signed PDF…');
  try{
    const built = await buildSignedToolboxTalkPdfBytes(tbtId);
    if(!built){ toast('No signatures yet.'); return; }
    const path = siteId+'/tbt-exports/'+uid()+'-'+built.filename.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('mc-documents', path, new Blob([built.outBytes], {type:'application/pdf'}), 'application/pdf');
    if(!stored){ toast('Could not upload the PDF — try again.'); return; }
    toast('Sending…');
    const res = await sbFetch('/functions/v1/send-document-email', {method:'POST', body: JSON.stringify({
      site_id: siteId, recipient_email: trimmed, cc_email: emailTo.cc, client_cc_email: ccClientEmailFromPromptAnswer(answer, site), doc_title: (built.talk&&built.talk.title||'Toolbox Talk')+' (Signed Toolbox Talk)', file_url: publicUrl('mc-documents', stored),
    })});
    if(res && res.ok){ toast('Emailed'); } else { toast('Could not send the email — please try again.'); }
  }catch(e){
    console.error(e);
    toast('Could not send the email — please try again.');
  }
};
