/* ================= RAMS ================= */
let ramsPollTimer = null;
// "Multi-page signing" (signature boxes inside the document itself, like the
// Hyde forms, and sending to the client to sign) is tucked away per document
// behind a tick box, so a normal RAMS shows none of that.
let ramsMultiState = {}; // rams_id -> true/false once someone has ticked/unticked it
function ramsMultiOn(r){
  if(ramsMultiState[r.id] != null) return ramsMultiState[r.id];
  const lay = r.sign_layout;
  if(lay && lay.multi != null) return !!lay.multi;
  if(Object.keys(ramsClientSigs[r.id]||{}).length) return true;
  // Older uploads that already had boxes set (the builder's own sign-off sheet doesn't count).
  return ramsLayoutBoxes(lay).length > 0 && !/^(Risk Assessment|Method Statement) — /.test(r.name||'');
}
window.ramsSetMulti = async function(ramsId, on){
  ramsMultiState[ramsId] = on;
  try{
    const r = (await dbSelect('rams_docs', 'id=eq.'+ramsId+'&select=sign_layout'))[0];
    const lay = Object.assign({v:2, boxes:[]}, (r && r.sign_layout) || {}, {multi: !!on});
    await dbUpdate('rams_docs', ramsId, {sign_layout: lay});
  }catch(e){}
  render();
};
function ramsIssuedLine(s){
  const sig = s.signature_image_path || (PROFILES[s.user_id] && PROFILES[s.user_id].signature_path) || null;
  return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 0;"><b style="letter-spacing:.3px;">ISSUED BY:</b> ${escapeHtml(nameOf(s.user_id))}${sig ? `<img src="${publicUrl('signatures', sig)}" style="height:22px;max-width:110px;object-fit:contain;">` : ''} <span class="stub">${new Date(s.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</span></div>`;
}
function ramsDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, isClientView, nameById){
  nameById = nameById || {};
  // PMs/admins aren't required to sign RAMS at all (they instead get a
  // one-tap "issued" record — see signRams/the siglinebox below), so the
  // mandatory roster/"still need to sign" tracking only ever counts
  // operatives — same rule the "!" outstanding-signature badge elsewhere
  // already uses (anyOperativeMissingSignature).
  const roster = (assignedIds||[]).filter(id=>PROFILES[id] && PROFILES[id].role==='operative');
  const iAmManager = isManager(ME);
  return docs.map(r=>{
    const sigs = sigsByDoc[r.id]||[];
    const mine = sigs.find(s=>s.user_id===ME.id);
    const notSigned = roster.filter(id => !sigs.some(s=>s.user_id===id));
    let outstandingHtml;
    const sigLine = s => `${s.issued ? '📝 Issued by' : '✓'} ${escapeHtml(nameOf(s.user_id))}${(!s.issued && s.signature_image_path) ? `<img src="${publicUrl('signatures', s.signature_image_path)}" style="height:20px;object-fit:contain;">` : ''} — ${new Date(s.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}`;
    // Signing progress, spelled out person by person, so it is obvious who
    // has signed, who hasn't, and (when the document has signature boxes)
    // which set of boxes each signature goes into. The old single line
    // "signed by all operatives" said nothing about who or how many.
    {
      const hasBoxes = ramsLayoutBoxes(r.sign_layout).length > 0 && ramsMultiOn(r);
      const slots = ramsLayoutSlots(r.sign_layout);
      const d = t=>new Date(t).toLocaleDateString(undefined,{day:'2-digit',month:'short'});
      // Operative signatures in the order they signed = Operative 1, 2, 3… boxes.
      const opSigs = sigs.filter(x=>!x.issued).slice().sort((x,y)=>new Date(x.signed_at)-new Date(y.signed_at));
      const boxNote = n=> hasBoxes ? (n<=slots ? ` <span class="stub">→ Operative ${n} boxes</span>` : ` <span class="stub" style="color:var(--warn);">→ no box left, goes on the summary page</span>`) : '';
      const signedRows = opSigs.map((x,i)=>`<div style="display:flex;align-items:center;gap:6px;padding:2px 0;flex-wrap:wrap;"><span style="color:var(--good,#1F9D62);font-weight:700;">✓</span> ${escapeHtml(nameOf(x.user_id))}${x.signature_image_path ? `<img src="${publicUrl('signatures', x.signature_image_path)}" style="height:18px;object-fit:contain;">` : ''} <span class="stub">${d(x.signed_at)}</span>${boxNote(i+1)}</div>`).join('');
      const waitingRows = notSigned.map((id,i)=>`<div style="display:flex;align-items:center;gap:6px;padding:2px 0;flex-wrap:wrap;">○ ${escapeHtml(nameOf(id))} <span class="stub">not signed yet${hasBoxes && canAdd ? (opSigs.length+i+1<=slots ? ' — will take the next free operative boxes' : '') : ''}</span></div>`).join('');
      const total = roster.length, done = total - notSigned.length;
      let head;
      if(!total) head = canAdd ? `<span class="stub">No operatives are assigned to this job yet, so nobody is being asked to sign. Assign them to the job and they'll see this to sign.</span>` : '';
      else if(!notSigned.length) head = `<span style="color:var(--good,#1F9D62);font-weight:700;">✓ All ${total} operative${total===1?'':'s'} on this job ${total===1?'has':'have'} signed</span>`;
      else head = `<b>${done} of ${total}</b> operative${total===1?'':'s'} signed`;
      let notes = '';
      if(hasBoxes && canAdd){
        if(total > slots) notes += `<div class="stub" style="margin-top:4px;color:var(--warn);">⚠ ${total} operatives on this job but the document only has boxes for ${slots}. The extra ${total-slots} will be listed on a summary page at the end.</div>`;
        else if(slots > total) notes += `<div class="stub" style="margin-top:4px;">Boxes for ${slots} operatives, ${total} on this job — the spare ${slots-total} stay blank.</div>`;
        notes += `<div class="stub" style="margin-top:4px;">Each operative taps once to sign; their name, signature and date go into every box set for them. <span class="viewlink" style="cursor:pointer;" onclick="previewRamsBoxes('${r.id}')">👁 Test fill — see every box filled with sample names</span></div>`;
      }
      outstandingHtml = (head || signedRows || waitingRows) ? `<div class="signerlist">${head ? `<div style="margin-bottom:4px;">${head}</div>` : ''}${signedRows}${waitingRows}${notes}</div>` : '';
    }
    // Everyone who's issued/signed this doc, beyond just the roster's
    // outstanding operatives — shown underneath so a PM's "issued" record is
    // visible even though they're not part of the mandatory roster above.
    const issuedBy = sigs.filter(s=>s.issued);
    const issuedHtml = issuedBy.length ? `<div class="signerlist" style="margin-bottom:0;">${issuedBy.map(ramsIssuedLine).join('')}</div>` : '';
    const anyIssued = issuedBy.length > 0;
    const multi = ramsMultiOn(r);
    return `
    <div class="ramsdoc" style="padding:10px 12px;">
      <div class="taskrowtop">
        <div class="name" style="font-size:16.5px;font-weight:800;flex:1;min-width:0;">${escapeHtml(r.name)}</div>
        ${canAdd ? `<div class="taskicons" style="flex:0 0 auto;white-space:nowrap;">${rowActionsMenuHtml('ramsdoc-'+r.id, `
          ${/\.pdf$/i.test(r.storage_path||'') ? `<div class="statusmenu-item" style="white-space:nowrap;" onclick="rowActionsMenuOpenFor=null;ramsSetMulti('${r.id}',${multi?'false':'true'})">${multi?'☑':'☐'} Multi-page sign required</div>` : ''}
          <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteRams('${r.id}','${jsAttr(r.storage_path)}')">🗑 Delete</div>`)}</div>` : ''}
      </div>
      <div class="meta" style="margin-top:3px;">Uploaded by ${escapeHtml(nameOf(r.uploaded_by))} · ${new Date(r.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}${r.supersedes?' · Supersedes "'+escapeHtml(nameById[r.supersedes]||'an earlier version')+'"':''}${resignDueLabel(r, site)} · <span class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', r.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(r.name)?r.name:r.name+'.pdf')}')">View document ↗</span></div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        ${isClientView ? `
          <div class="siglinebox" style="flex:1;margin-top:0;cursor:default;">
            <span class="name">${sigs.length} signed</span><span>${roster.length ? notSigned.length+' outstanding' : ''}</span>
          </div>
        ` : `
          ${iAmManager && (anyIssued || mine) ? '' : `<div class="siglinebox ramssigbox ${mine?'signed':''}" onclick="${mine?'':`signRams('${siteId}','${r.id}')`}" style="flex:1;margin-top:0;${mine?'':'cursor:pointer;'}">
            ${mine ? (mine.signature_image_path ? `<img src="${publicUrl('signatures', mine.signature_image_path)}" style="height:24px;max-width:100px;object-fit:contain;">` : `<span class="name">${escapeHtml(ME.name)}</span>`) + `<span>Signed ${new Date(mine.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</span>` : (iAmManager ? 'Tap to mark as issued' : 'Tap to sign')}
          </div>`}
        `}
        ${(sigs.length || Object.values(ramsClientSigs[r.id]||{}).some(c=>c.signed_at)) && (canAdd||isClientView) ? `<button class="ghostbtn exportbtn" style="flex:1;margin-top:0;" onclick="exportSignedRams('${r.id}')">Export Signed PDF</button>` : ''}
      </div>
      ${issuedHtml}
      ${outstandingHtml}
      ${canAdd && /\.pdf$/i.test(r.storage_path||'') ? `${multi ? `<div class="stub" style="margin:8px 0 0;font-weight:700;">Multi-page sign</div><div class="card" style="margin:6px 0 0;padding:8px 12px;background:var(--paper2,#F7F6F2);">
        <div class="meta"><span class="viewlink" style="cursor:pointer;" onclick="ramsBoxEd=null;go('#/site/${siteId}/hs/rams/boxes/${r.id}')">✍ ${ramsLayoutBoxes(r.sign_layout).length ? 'Signature boxes set ('+escapeHtml(ramsLayoutSummary(r.sign_layout))+') — edit' : 'Set signature boxes (sign into the document itself)'}</span></div>
        ${ramsClientLineHtml(siteId, r)}
      </div>` : ''}` : ''}
    </div>`;
  }).join('') || `<div class="empty">No RAMS uploaded.</div>`;
}
// Shared by RAMS + COSHH: every document must be re-signed by everyone once
// 12 months have passed since it was last "reset" (resign_cycle_start,
// defaults to upload date) — but only while the project is still active/live.
// A closed project freezes whatever signatures it already has; nobody gets
// chased for a re-sign on a finished job. The daily resign-check cron is
// what actually advances resign_cycle_start (and notifies) when a doc goes
// overdue on a live site — see the resign-check-daily edge function.
function resignCycleStart(doc){ return doc.resign_cycle_start || doc.uploaded_at; }
function resignDueLabel(doc, site){
  if(!site || siteStatusKey(site)!=='live') return '';
  const due = new Date(resignCycleStart(doc));
  due.setFullYear(due.getFullYear()+1);
  return ` · Re-sign due ${due.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}`;
}
// Drops any signature that predates the document's current resign cycle —
// on an active site that means anyone who signed before the last annual
// reset shows up as "not signed" again, forcing a genuine re-sign. Closed
// sites skip this filter entirely so old signatures stay valid forever.
// #393: this used to check `site.status!=='active'` literally — but some
// sites in the database have `status` stored as 'live' instead of 'active'
// (same meaning, see siteStatusKey), so for those specific sites this filter
// silently never applied: every historical signature stayed valid forever
// on the actual RAMS/COSHH pages, while computeOutstandingRows (which always
// forced the filter on) correctly reset them each cycle — the two screens
// disagreeing about whether something still needed signing. Routes both
// through the same siteStatusKey() live/upcoming/closed check now.
function filterCurrentCycleSigs(sigs, docs, docKeyField, site){
  if(!site || siteStatusKey(site)!=='live') return sigs;
  const cycleStart = {}; docs.forEach(d=>{ cycleStart[d.id] = new Date(resignCycleStart(d)); });
  return sigs.filter(s => new Date(s.signed_at) >= (cycleStart[s[docKeyField]] || 0));
}
// #394: roster-wide "does any operative assigned to this site still need to
// sign the current RAMS/COSHH?" check — a manager's own personal signature
// status isn't a meaningful flag for them (and COSHH can't be signed by a
// PM/admin at all — #237/#327), so this is what actually powers the "!"
// notification a PM/admin sees, shared between the Health & Safety tile page
// and the Site Home H&S tile so the flag means the same thing in both places.
async function anyOperativeMissingSignature(table, docKeyField, docRows, site, operativeIds){
  if(!docRows.length || !operativeIds.length) return false;
  const ids = docRows.map(d=>d.id).join(',');
  const sigsRaw = await dbSelect(table, docKeyField+'=in.('+ids+')&select='+docKeyField+',user_id,signed_at');
  const sigs = filterCurrentCycleSigs(sigsRaw, docRows, docKeyField, site);
  const signedByDoc = {};
  sigs.forEach(s=>{ (signedByDoc[s[docKeyField]]=signedByDoc[s[docKeyField]]||new Set()).add(s.user_id); });
  return docRows.some(d=>operativeIds.some(uid=>!(signedByDoc[d.id]||new Set()).has(uid)));
}
// Shared by every "supersedes/superseded_by" document list (RAMS, H&S
// Policy, Drawings) — builds a plain id->name lookup out of however many
// doc arrays are passed (current + superseded together cover every id
// either field could ever point at) so the UI can say exactly which
// document was replaced, instead of the generic "an earlier version"/
// "superseded" wording that left it to guesswork.
function docNameLookup(...lists){
  const m = {};
  lists.forEach(arr=>(arr||[]).forEach(d=>{ if(d && d.id) m[d.id] = d.name; }));
  return m;
}
async function fetchRamsData(siteId){
  const site = SITES.find(s=>s.id===siteId);
  const [docs, superseded, assigned] = await Promise.all([
    // subcontractor_company_id=is.null excludes subcontractor-specific RAMS
    // (uploaded via renderSubRams into this same table) from RTB's own main
    // site roster — those are scoped to that subcontractor's own operatives
    // only (see renderSubRams/fetchSubRamsData) and should never be pulled
    // into every ordinary company operative's sign list here.
    dbSelect('rams_docs', 'site_id=eq.'+siteId+'&status=eq.current&subcontractor_company_id=is.null&order=uploaded_at.desc'),
    dbSelect('rams_docs', 'site_id=eq.'+siteId+'&status=eq.superseded&subcontractor_company_id=is.null&order=uploaded_at.desc'),
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
  ]);
  let sigsByDoc = {};
  if(docs.length){
    const ids = docs.map(d=>d.id).join(',');
    let sigs = await dbSelect('rams_signatures', 'rams_id=in.('+ids+')');
    sigs = filterCurrentCycleSigs(sigs, docs, 'rams_id', site);
    sigs.forEach(s=>{ (sigsByDoc[s.rams_id]=sigsByDoc[s.rams_id]||[]).push(s); });
    // Client signing requests (emailed link) — managers only; the newest per
    // document wins, with a signed one always beating an unsigned resend.
    if(isManager(ME)){
      const cs = await dbSelect('rams_client_signatures', 'rams_id=in.('+ids+')&order=requested_at.asc&select=id,rams_id,client_slot,client_name,client_email,requested_at,expires_at,signed_at,signer_name');
      const map = {};
      cs.forEach(c=>{ const m = (map[c.rams_id] = map[c.rams_id] || {}); const slot = c.client_slot || 1; const cur = m[slot]; if(!cur || c.signed_at || !cur.signed_at) m[slot] = c; });
      ramsClientSigs = map;
    }
  }
  return {docs, superseded, sigsByDoc, assignedIds: assigned.map(a=>a.user_id), nameById: docNameLookup(docs, superseded)};
}
let ramsClientSigs = {}; // rams_id -> {clientNumber: latest signing request} (see fetchRamsData)
let ramsClientSendBusy = false;
function ramsClientLineHtml(siteId, r){
  const bySlot = ramsClientSigs[r.id] || {};
  // One line per client the document has boxes for (at least Client 1), plus any already sent.
  const count = Math.max(1, ramsLayoutClients(r.sign_layout), ...Object.keys(bySlot).map(Number));
  const d = t=>new Date(t).toLocaleDateString(undefined,{day:'2-digit',month:'short'});
  let out = '';
  for(let slot=1; slot<=count; slot++){
    const c = bySlot[slot];
    const label = count>1 ? 'Client '+slot : 'Client';
    const send = `<span class="viewlink" style="cursor:pointer;" onclick="sendRamsToClient('${siteId}','${r.id}',${slot})">`;
    if(c && c.signed_at) out += `<div class="meta" style="margin-top:6px;color:var(--good,#1F9D62);font-weight:600;">✓ ${label} signed — ${escapeHtml(c.signer_name||c.client_name||c.client_email)} · ${d(c.signed_at)}</div>`;
    else if(c){
      const expired = new Date(c.expires_at).getTime() < Date.now();
      out += `<div class="meta" style="margin-top:6px;">✉ ${expired ? label+' link expired' : 'Waiting for '+label.toLowerCase()+' to sign'} — ${escapeHtml(c.client_email)} · sent ${d(c.requested_at)} · ${send}Send again</span></div>`;
    } else out += `<div class="meta" style="margin-top:6px;">${send}✉ Send to ${label.toLowerCase()} to sign (no app needed)</span></div>`;
  }
  return out;
}
// Emails the client a private link to read and sign this document in their
// browser. No account or app on their side. Their signature then fills the
// Client box(es) in the document on export.
window.sendRamsToClient = async function(siteId, ramsId, slot){
  if(ramsClientSendBusy) return;
  slot = slot || 1;
  const site = SITES.find(x=>x.id===siteId);
  const prev = (ramsClientSigs[ramsId] || {})[slot];
  const email = await customPrompt((slot>1 ? 'Client '+slot : 'Client')+'\'s email address — they\'ll get a private link to read and sign this document:', (prev && prev.client_email) || (slot===1 && site && site.client_email) || '');
  if(email==null) return;
  const em = String(email).trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){ toast('Enter a valid email address.'); return; }
  const name = await customPrompt('Client\'s name (optional — shown in the email and on the signing page):', (prev && prev.client_name) || '');
  if(name==null) return;
  ramsClientSendBusy = true; toast('Sending…');
  try{
    const res = await sbFetch('/functions/v1/client-sign', {method:'POST', timeoutMs:30000, body: JSON.stringify({action:'request', rams_id: ramsId, client_email: em, client_name: String(name).trim()})});
    if(res && res.ok){
      // Say which client this request is for, so their signature lands in that client's boxes.
      if(slot>1){ try{ const out = await res.json(); if(out && out.id) await sbFetch('/rest/v1/rpc/set_client_sign_slot', {method:'POST', body: JSON.stringify({p_id: out.id, p_slot: slot})}); }catch(e){ console.error('[set_client_sign_slot]', e); } }
      toast('Sent to '+em);
    }
    else toast('Could not send — '+(await safeErr(res)));
  }catch(e){ console.error('[sendRamsToClient]', e); toast('Could not send — '+((e && e.message) || 'check your connection')); }
  ramsClientSendBusy = false;
  render();
};
let ramsUploadOpen = false;
let ramsSupersededOpen = false;
const RAMS_DOC_TYPES = ['Risk Assessment','Method Statement','RAMS'];
// The H&S Policy (org-wide, see fetchHsPolicyData/signHsPolicy above) now
// lives inside RAMS as a collapsible section rather than its own tile —
// auto-expanded while the current user hasn't signed it yet, collapsed once
// they have. hsPolicyInRamsOverride tracks a manual toggle so a signed user
// can still reopen it to check the document; null means "follow signed
// status automatically".
let hsPolicyInRamsOverride = null;
window.toggleHsPolicyInRams = function(){
  hsPolicyInRamsOverride = !(hsPolicyInRamsOverride===null ? hsPolicyInRamsOpenDefault : hsPolicyInRamsOverride);
  render();
};
let hsPolicyInRamsOpenDefault = true; // updated each render from actual signed status
async function hsPolicySectionHtml(siteId){
  const {doc, sigs} = await fetchHsPolicyData();
  if(!doc) return '';
  const validSigs = sigs.filter(s=>hsPolicySigStillValid(doc, s));
  const mySig = validSigs.find(s=>s.user_id===ME.id);
  const iSigned = !!mySig;
  hsPolicyInRamsOpenDefault = !iSigned;
  const isOpen = hsPolicyInRamsOverride===null ? hsPolicyInRamsOpenDefault : hsPolicyInRamsOverride;
  const canManage = isManager(ME);
  const isClientView = ME.role==='client';
  return `
    <p class="ddrow" onclick="toggleHsPolicyInRams()"><span class="arrow">${isOpen?'▼':'▶'}</span> H&amp;S Policy ${(iSigned||isClientView)?'':'<span class="badge-count" style="position:static;display:inline-block;margin-left:4px;">!</span>'}</p>
    ${isOpen ? `
    <div class="card">
      <div style="font-weight:800;font-size:14px;">${escapeHtml(doc.name)}</div>
      <div class="meta">Uploaded ${new Date(doc.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})} by ${escapeHtml(nameOf(doc.uploaded_by))}${doc.expiry_date?' · Expires '+new Date(doc.expiry_date+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}):''}</div>
      <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', doc.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(doc.name)?doc.name:doc.name+'.pdf')}')">View document ↗</div>
      <div style="margin-top:12px;">
        ${isClientView ? '' : (iSigned ? `<p class="stub" style="color:var(--ok);margin:0;">✓ You signed this on ${new Date(mySig.signed_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} — valid for one year, and travels with you to every site.</p>` : `<div class="siglinebox" style="margin-top:0;cursor:pointer;" onclick="signHsPolicy('${doc.id}')">Tap to confirm you've read and understood this policy</div>`)}
      </div>
      ${canManage ? `<p class="stub" style="margin-top:12px;cursor:pointer;text-decoration:underline;" onclick="go('#/site/${siteId}/hs/policy')">View signed status / superseded versions</p><p class="stub" style="margin-top:4px;">Upload a new version from Settings &amp; Admin → Health &amp; Safety.</p>` : ''}
    </div>
    ` : ''}
  `;
}
let ramsSubOpenFor = {}; // subcontractor_company_id -> bool, dropdown state on the main RAMS page
window.toggleRamsSub = function(companyId){
  ramsSubOpenFor[companyId] = !ramsSubOpenFor[companyId];
  render();
};
async function renderRams(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canAdd = isManager(ME);
  const isClientView = ME.role==='client';
  await loadAllProfiles();
  const {docs, superseded, sigsByDoc, assignedIds, nameById} = await fetchRamsData(siteId);
  // Signing templates (Settings → Signing Templates) offered on the upload form.
  const signTemplates = canAdd ? (await dbSelect('sign_layout_templates', 'order=name.asc&select=id,name,layout')).filter(tp=>ramsLayoutBoxes(tp.layout).length) : [];
  const hsPolicyHtml = await hsPolicySectionHtml(siteId);
  const ramsBuilderHtml = await ramsBuilderCardHtml(siteId);
  // Completed subcontractor RAMS surface here too (read-only, grouped per
  // company in a dropdown) — same idea as the Subcontractor Inspections
  // section on the main Inspections page — but they stay out of the sign
  // roster/count above (fetchRamsData excludes them) since they're scoped
  // to that subcontractor's own operatives only.
  let ramsSubCompanies = [], ramsByCompany = {};
  if(canAdd){
    const allSubCompanies = await dbSelect('subcontractor_companies', 'site_id=eq.'+siteId+'&select=id,name&order=name.asc');
    if(allSubCompanies.length){
      const companyIds = allSubCompanies.map(c=>c.id).join(',');
      const subRamsDocs = await dbSelect('rams_docs', 'subcontractor_company_id=in.('+companyIds+')&status=eq.current&order=uploaded_at.desc');
      subRamsDocs.forEach(d=>{ (ramsByCompany[d.subcontractor_company_id]=ramsByCompany[d.subcontractor_company_id]||[]).push(d); });
      ramsSubCompanies = allSubCompanies.filter(c=>(ramsByCompany[c.id]||[]).length);
    }
  }
  const uploadForm = `
        <div class="formfield" style="margin-top:0;"><input type="text" id="ramsName" placeholder="Document name, e.g. Working at Height"></div>
        <div class="formfield"><label class="field-label">Document Type</label>
          <select id="ramsDocType">${RAMS_DOC_TYPES.map(t=>`<option value="${t}" ${t==='RAMS'?'selected':''}>${t}</option>`).join('')}</select>
        </div>
        ${docs.length ? `<div class="formfield"><label class="field-label">Supersedes (optional)</label>
          <select id="ramsSupersedes"><option value="">— New document, doesn't replace anything —</option>${docs.map(d=>`<option value="${d.id}">${escapeHtml(d.name)} (${escapeHtml(d.doc_type||'RAMS')})</option>`).join('')}</select>
          <p class="stub" style="margin:4px 0 0;">Picking one keeps the old version on file (marked Superseded) and requires everyone to sign the new one again.</p>
        </div>` : ''}
        <label class="selallrow" style="margin:4px 0 6px;font-size:12.5px;"><input type="checkbox" onchange="document.getElementById('ramsUpMulti').style.display=this.checked?'':'none';if(!this.checked){const t=document.getElementById('ramsSignTemplate');if(t)t.value='';}"> Multi-page sign required</label>
        <div id="ramsUpMulti" style="display:none;">
        <div class="formfield"><label class="field-label">Signing template</label>
          ${signTemplates.length ? `<select id="ramsSignTemplate"><option value="">— None (signatures listed on a page at the end) —</option>${signTemplates.map(tp=>`<option value="${tp.id}">${escapeHtml(tp.name)} · ${escapeHtml(ramsLayoutSummary(tp.layout))}</option>`).join('')}</select>
          <p class="stub" style="margin:4px 0 0;">Pick the template for this form and the sign boxes are put in for you.</p>` : `<p class="stub" style="margin:0;">None set up yet. <span class="viewlink" style="cursor:pointer;" onclick="go('#/sign-templates')">Create one in Signing Templates</span> to have signatures drop straight into the document's own boxes.</p>`}
        </div>
        </div>
        <div class="row-gap" style="margin-bottom:6px;">
          <div class="ghostbtn" style="cursor:pointer;text-align:center;flex:1;" onclick="document.getElementById('ramsFile').click()">Choose PDF</div>
          <button class="darkbtn" style="flex:2;" onclick="addRams('${siteId}')">Upload</button>
        </div>
        <input type="file" accept="application/pdf" id="ramsFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="const f=this.files[0]; const el=document.getElementById('ramsFileName'); el.innerHTML = f ? ('✓ <b>'+escapeHtml(f.name)+'</b> selected') : ''; el.style.color = f ? 'var(--brand1,#1A1D21)' : '';">
        <p class="stub" id="ramsFileName" style="margin:-4px 0 10px;font-size:12.5px;"></p>
        <p class="stub">Original PDF is stored untouched. Each signature is recorded separately, so multiple operatives can sign without corrupting the file — see the note in chat.</p>
  `;

  const unsignedRamsCount = docs.filter(r=> canAdd ? !(sigsByDoc[r.id]||[]).some(s=>s.issued || s.user_id===ME.id) : !(sigsByDoc[r.id]||[]).some(s=>s.user_id===ME.id)).length;

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div id="ramsDocsList" style="margin-top:12px;">${ramsDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, isClientView, nameById)}</div>

    ${docs.length && !isClientView && !(canAdd && !unsignedRamsCount) ? `
      <button class="darkbtn" style="margin-bottom:10px;padding:8px 6px;font-size:11.5px;" ${unsignedRamsCount?'':'disabled'} onclick="signAllRams('${siteId}')">
        ${isManager(ME)
          ? (unsignedRamsCount ? `Mark All RAMS as Issued (${unsignedRamsCount})` : 'All RAMS documents marked as issued')
          : (unsignedRamsCount ? `Sign All RAMS Documents (${unsignedRamsCount} unsigned)` : 'All RAMS documents signed')}
      </button>
    ` : ''}
    ${canAdd && docs.length ? `<button class="ghostbtn" style="margin-bottom:14px;padding:8px 6px;font-size:11.5px;" onclick="sendRamsSignReminder('${siteId}')">🔔 Ask Outstanding to Sign</button>` : ''}

    ${canAdd ? (docs.length ? `
      <div class="ddrow" onclick="ramsUploadOpen=!ramsUploadOpen;render()"><span class="arrow">${ramsUploadOpen?'▼':'▶'}</span> Create / Upload RAMS</div>
      ${ramsUploadOpen ? `<div class="card">${ramsBuilderHtml}${ramsBuilderHtml ? '<p class="sectiontitle" style="margin-top:16px;">📄 Upload RAMS (PDF)</p>' : ''}${uploadForm}</div>` : ''}
    ` : `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Create / Upload RAMS</p>
        ${ramsBuilderHtml}${ramsBuilderHtml ? '<p class="sectiontitle" style="margin-top:16px;">📄 Upload RAMS (PDF)</p>' : ''}
        ${uploadForm}
      </div>
    `) : ''}
    ${superseded.length ? `
    <p class="ddrow" onclick="ramsSupersededOpen=!ramsSupersededOpen;render()"><span class="arrow">${ramsSupersededOpen?'▼':'▶'}</span> Superseded Documents (${superseded.length})</p>
    ${ramsSupersededOpen ? `<div class="card">${superseded.map(r=>`
      <div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:12.5px;">${escapeHtml(r.name)}</div>
          <div class="meta">Uploaded ${new Date(r.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})} · superseded${r.superseded_by?' by "'+escapeHtml(nameById[r.superseded_by]||'a newer version')+'"':''}</div>
          <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', r.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(r.name)?r.name:r.name+'.pdf')}')">View document ↗</div>
        </div>
        ${canAdd ? `<div class="taskicon danger" style="flex:0 0 auto;" onclick="deleteRams('${r.id}','${jsAttr(r.storage_path)}')">🗑</div>` : ''}
      </div>
    `).join('')}</div>` : ''}
    ` : ''}
    ${canAdd && ramsSubCompanies.length ? `
    ${ramsSubCompanies.map(c=>{
      const cdocs = ramsByCompany[c.id]||[];
      const open = !!ramsSubOpenFor[c.id];
      return `
      <div>
        <p class="ddrow" onclick="toggleRamsSub('${c.id}')">
          <span class="arrow">${open?'▼':'▶'}</span> Subcontractor RAMS — ${escapeHtml(c.name)} <span class="stub" style="display:inline;margin:0;">(${cdocs.length})</span>
        </p>
        ${open ? `<div class="card" style="margin-top:6px;">
          ${cdocs.map(d=>`
            <div style="padding:8px 0;border-bottom:1px solid var(--line);">
              <div style="font-weight:700;font-size:12.5px;">${escapeHtml(d.name)}</div>
              <div class="meta">Uploaded ${new Date(d.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}</div>
              <div class="row-gap" style="margin-top:2px;">
                <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', d.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(d.name)?d.name:d.name+'.pdf')}')">View document ↗</div>
                <div class="viewlink" style="cursor:pointer;" onclick="exportSignedRams('${d.id}')">⬇ Export</div>
                <div class="viewlink" style="cursor:pointer;" onclick="emailSignedRams('${siteId}','${d.id}')">✉️ Email</div>
              </div>
            </div>
          `).join('')}
          <button class="ghostbtn" style="margin-top:6px;" onclick="go('#/site/${siteId}/mc/subcontractors/${c.id}/rams')">Open ${escapeHtml(c.name)}'s RAMS</button>
        </div>` : ''}
      </div>
      `;
    }).join('')}
    ` : ''}
    <div style="margin-top:22px;">${hsPolicyHtml}</div>
  `, {title:'RAMS', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs`, siteId, activeTab:'more'}); }

  if(ramsPollTimer) clearInterval(ramsPollTimer);
  let ramsPollBusy = false;
  ramsPollTimer = setInterval(async ()=>{
    const el = document.getElementById('ramsDocsList');
    if(!el){ clearInterval(ramsPollTimer); ramsPollTimer = null; return; }
    // On a slow/limited connection a single poll can take longer than the
    // 7s interval — without this guard the next tick fires anyway and a
    // second request piles on top of the first, doubling data use for
    // nothing. Also skip entirely while the tab is hidden or the device is
    // offline, rather than queuing a request that has no chance of landing.
    if(ramsPollBusy || document.hidden || navigator.onLine === false) return;
    ramsPollBusy = true;
    try{
      const {docs, sigsByDoc, assignedIds, nameById} = await fetchRamsData(siteId);
      const freshEl = document.getElementById('ramsDocsList');
      if(freshEl) freshEl.innerHTML = ramsDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, isClientView, nameById);
    } finally { ramsPollBusy = false; }
  }, 7000);
}
window.addRams = async function(siteId){
  const name = document.getElementById('ramsName').value.trim();
  const fileInput = document.getElementById('ramsFile');
  const file = fileInput.files && fileInput.files[0];
  const docType = document.getElementById('ramsDocType') ? document.getElementById('ramsDocType').value : 'RAMS';
  const supersedesEl = document.getElementById('ramsSupersedes');
  const supersedesId = supersedesEl ? supersedesEl.value : '';
  if(!name || !file){ toast('Add a name and choose a PDF.'); return; }
  const path = siteId+'/rams/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('rams-docs', path, file, 'application/pdf');
  if(!stored) return;
  // A signing template chosen on the form: the new document takes on that template's boxes.
  let signLayout = null, signTplName = '';
  const tplEl = document.getElementById('ramsSignTemplate');
  if(tplEl && tplEl.value){
    const tps = await dbSelect('sign_layout_templates', 'id=eq.'+tplEl.value+'&select=name,layout');
    if(tps[0] && ramsLayoutBoxes(tps[0].layout).length){ signLayout = {v:2, boxes: ramsLayoutBoxes(tps[0].layout), multi:true}; signTplName = tps[0].name; }
  }
  const newRow = {site_id:siteId, name, storage_path:stored, uploaded_by:ME.id, doc_type:docType, supersedes: supersedesId||null};
  if(signLayout) newRow.sign_layout = signLayout;
  const rows = await dbInsert('rams_docs', newRow);
  if(rows){
    if(supersedesId) await dbUpdate('rams_docs', supersedesId, {status:'superseded', superseded_by:rows[0].id});
    // Uploading it is issuing it: recorded straight away as issued by whoever uploaded it.
    if(isManager(ME)) await dbInsert('rams_signatures', {rams_id:rows[0].id, user_id:ME.id, issued:true, signature_image_path: ME.signature_path || null});
    toast(signLayout ? 'RAMS uploaded — sign boxes set from "'+signTplName+'"' : 'RAMS uploaded');
    notifyDocNeedsSigning(siteId, docType==='COSHH'?'COSHH':'RAMS', name);
    ramsUploadOpen = false; render();
  }
};
window.signRams = async function(siteId, ramsId){
  // PMs/admins don't do the operative's "read, understood, adopted
  // signature" flow at all — a plain one-tap "issued" record instead,
  // shown and exported distinctly (see ramsDocsHtml/buildSignedRamsPdfBytes).
  if(isManager(ME)){
    const rows = await dbInsert('rams_signatures', {rams_id:ramsId, user_id:ME.id, issued:true, signature_image_path: ME.signature_path || null});
    if(rows){ toast('Marked as issued'); render(); }
    return;
  }
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const rows = await dbInsert('rams_signatures', {rams_id:ramsId, user_id:ME.id, signature_image_path:ME.signature_path});
  if(rows){ toast('Signed — archived automatically'); render(); }
};
// One tap signs (or, for a PM/admin, marks issued on) every current RAMS
// document at this site the user hasn't already covered — mirrors
// signAllCoshh. Each document stays its own separate record, so
// exportSignedRams still produces one PDF per document.
window.signAllRams = async function(siteId){
  const {docs, sigsByDoc} = await fetchRamsData(siteId);
  const toSign = docs.filter(r=> isManager(ME) ? !(sigsByDoc[r.id]||[]).some(s=>s.issued || s.user_id===ME.id) : !(sigsByDoc[r.id]||[]).some(s=>s.user_id===ME.id));
  if(!toSign.length){ toast(isManager(ME)?'Already marked as issued on everything.':'Already signed everything.'); render(); return; }
  if(isManager(ME)){
    const rows = await dbInsert('rams_signatures', toSign.map(r=>({rams_id:r.id, user_id:ME.id, issued:true, signature_image_path: ME.signature_path || null})));
    if(rows){ toast(`Marked as issued on ${toSign.length} document${toSign.length===1?'':'s'}`); render(); }
    return;
  }
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const rows = await dbInsert('rams_signatures', toSign.map(r=>({rams_id:r.id, user_id:ME.id, signature_image_path:ME.signature_path})));
  if(rows){ toast(`Signed ${toSign.length} document${toSign.length===1?'':'s'}`); render(); }
};