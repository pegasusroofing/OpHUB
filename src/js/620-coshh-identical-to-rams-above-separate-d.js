/* ================= COSHH (identical to RAMS above — separate document type) ================= */
let coshhPollTimer = null;
function coshhDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, isClientView){
  const roster = assignedIds||[];
  return docs.map(r=>{
    const sigs = sigsByDoc[r.id]||[];
    const mine = sigs.find(s=>s.user_id===ME.id);
    const notSigned = roster.filter(id => !sigs.some(s=>s.user_id===id));
    let outstandingHtml;
    if(!roster.length){
      outstandingHtml = sigs.length ? `<div class="signerlist">${sigs.map(s=>`<div style="display:flex;align-items:center;gap:8px;">✓ ${escapeHtml(nameOf(s.user_id))}${s.signature_image_path ? `<img src="${publicUrl('signatures', s.signature_image_path)}" style="height:20px;object-fit:contain;">` : ''} — ${new Date(s.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</div>`).join('')}</div>` : '';
    } else if(!notSigned.length){
      outstandingHtml = `<div class="signerlist"><div style="display:flex;align-items:center;gap:8px;color:var(--good);font-weight:600;">✓ COSHH signed by all operatives</div></div>`;
    } else {
      outstandingHtml = `<div class="signerlist"><div class="meta" style="margin-bottom:4px;">Still need to sign:</div>${notSigned.map(id=>`<div style="display:flex;align-items:center;gap:8px;">○ ${escapeHtml(nameOf(id))}</div>`).join('')}</div>`;
    }
    // PMs/admins don't sign COSHH themselves (mirrors the operative-only
    // roster rule for TBT) — so their slot where a sign box would sit instead
    // shows a "who's signed" summary plus how many are still outstanding.
    const signedCount = sigs.length;
    const outstandingCount = notSigned.length;
    return `
    <div class="ramsdoc" style="padding:10px 12px;">
      <div class="taskrowtop">
        <div class="name" style="font-size:19px;font-weight:800;">${escapeHtml(r.name)}</div>
        ${canAdd ? `<div class="taskicons">
          <input type="file" accept="application/pdf" id="coshhReplaceInput-${r.id}" style="display:none;" onchange="replaceCoshhFile(this,'${siteId}','${r.id}','${jsAttr(r.storage_path)}')">
          <div class="taskicon" title="Replace this file (resets signatures)" onclick="document.getElementById('coshhReplaceInput-${r.id}').click()">🔁</div>
          <div class="taskicon" title="Save to Admin Centre COSHH" onclick="startCoshhSaveToLibrary('${siteId}','${r.id}','${jsAttr(r.name)}','${jsAttr(r.storage_path)}')">⬆️</div>
          <div class="taskicon danger" onclick="deleteCoshh('${r.id}','${jsAttr(r.storage_path)}')">🗑</div>
        </div>` : ''}
      </div>
      <div class="meta" style="margin-top:3px;">Uploaded by ${escapeHtml(nameOf(r.uploaded_by))} · ${new Date(r.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}${resignDueLabel(r, site)} · <span class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('coshh-docs', r.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(r.name)?r.name:r.name+'.pdf')}')">View document ↗</span></div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        ${(canAdd && isManager(ME)) || isClientView ? `
          <div class="siglinebox" style="flex:1;margin-top:0;cursor:default;">
            <span class="name">${signedCount} signed</span><span>${roster.length ? outstandingCount+' outstanding' : ''}</span>
          </div>
        ` : `
          <div class="siglinebox coshhsigbox ${mine?'signed':''}" onclick="${mine?'':`signCoshh('${siteId}','${r.id}')`}" style="flex:1;margin-top:0;${mine?'':'cursor:pointer;'}">
            ${mine ? (mine.signature_image_path ? `<img src="${publicUrl('signatures', mine.signature_image_path)}" style="height:24px;max-width:100px;object-fit:contain;">` : `<span class="name">${escapeHtml(ME.name)}</span>`) + `<span>Signed ${new Date(mine.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</span>` : 'Not signed yet'}
          </div>
        `}
        ${sigs.length && (canAdd||isClientView) ? `<button class="ghostbtn exportbtn" style="flex:1;margin-top:0;" onclick="exportSignedCoshh('${r.id}')">Export Signed PDF</button>` : ''}
      </div>
      ${outstandingHtml}
    </div>`;
  }).join('') || `<div class="empty">No COSHH uploaded.</div>`;
}
async function fetchCoshhData(siteId){
  const site = SITES.find(s=>s.id===siteId);
  // #327: PMs/admins can no longer sign COSHH (#237), so the roster used to
  // compute "who's still outstanding" must be operative-only — otherwise a
  // PM/admin who's assigned to the site shows up permanently unsigned since
  // they structurally have no way to sign, inflating the outstanding count
  // forever and never letting it reach zero.
  const [docs, assigned] = await Promise.all([
    // subcontractor_company_id=is.null — same fix as fetchRamsData: exclude
    // subcontractor-specific COSHH from the main site roster.
    dbSelect('coshh_docs', 'site_id=eq.'+siteId+'&subcontractor_company_id=is.null&order=uploaded_at.desc'),
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
  ]);
  await loadAllProfiles();
  const rosterUserIds = assigned.map(a=>a.user_id).filter(uid => PROFILES[uid] && PROFILES[uid].role==='operative');
  let sigsByDoc = {};
  if(docs.length){
    const ids = docs.map(d=>d.id).join(',');
    let sigs = await dbSelect('coshh_signatures', 'coshh_id=in.('+ids+')');
    sigs = filterCurrentCycleSigs(sigs, docs, 'coshh_id', site);
    sigs.forEach(s=>{ (sigsByDoc[s.coshh_id]=sigsByDoc[s.coshh_id]||[]).push(s); });
  }
  return {docs, sigsByDoc, assignedIds: rosterUserIds};
}
let coshhUploadOpen = false;
let coshhSubOpenFor = {}; // subcontractor_company_id -> bool, dropdown state on the main COSHH page
window.toggleCoshhSub = function(companyId){
  coshhSubOpenFor[companyId] = !coshhSubOpenFor[companyId];
  render();
};
async function renderCoshh(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canAdd = isManager(ME);
  const isClientView = ME.role==='client';
  await loadAllProfiles();
  const {docs, sigsByDoc, assignedIds} = await fetchCoshhData(siteId);
  const unsignedCoshhCount = docs.filter(r=>!(sigsByDoc[r.id]||[]).some(s=>s.user_id===ME.id)).length;
  const signedCoshhCount = docs.filter(r=>(sigsByDoc[r.id]||[]).length>0).length;
  // Completed subcontractor COSHH — same read-only dropdown-per-company
  // pattern as Subcontractor RAMS/Inspections above.
  let coshhSubCompanies = [], coshhByCompany = {};
  if(canAdd){
    const allSubCompanies = await dbSelect('subcontractor_companies', 'site_id=eq.'+siteId+'&select=id,name&order=name.asc');
    if(allSubCompanies.length){
      const companyIds = allSubCompanies.map(c=>c.id).join(',');
      const subCoshhDocs = await dbSelect('coshh_docs', 'subcontractor_company_id=in.('+companyIds+')&order=uploaded_at.desc');
      subCoshhDocs.forEach(d=>{ (coshhByCompany[d.subcontractor_company_id]=coshhByCompany[d.subcontractor_company_id]||[]).push(d); });
      coshhSubCompanies = allSubCompanies.filter(c=>(coshhByCompany[c.id]||[]).length);
    }
  }
  const uploadForm = `
        <div class="formfield" style="margin-top:0;"><input type="text" id="coshhName" placeholder="Document name, e.g. Solvent-Based Adhesive"></div>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;padding:8px 6px;font-size:11.5px;" onclick="document.getElementById('coshhFile').click()">Choose PDF</div>
        <input type="file" accept="application/pdf" id="coshhFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('coshhFileName').textContent=this.files[0]?this.files[0].name:''">
        <p class="stub" id="coshhFileName" style="margin:-4px 0 10px;"></p>
        <button class="darkbtn" style="padding:8px 6px;font-size:11.5px;" onclick="addCoshh('${siteId}')">Upload</button>
        <p class="stub">Original PDF is stored untouched. Each signature is recorded separately, so multiple operatives can sign without corrupting the file — see the note in chat.</p>
        <button class="ghostbtn" style="margin-top:6px;padding:8px 6px;font-size:11.5px;" onclick="startCoshhLibraryPick('${siteId}')">📚 Add from Library</button>
  `;

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div id="coshhDocsList">${coshhDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, isClientView)}</div>

    ${!canAdd && !isClientView && docs.length ? `
      <button class="darkbtn" style="margin-bottom:10px;padding:8px 6px;font-size:11.5px;" ${unsignedCoshhCount?'':'disabled'} onclick="signAllCoshh('${siteId}')">
        ${unsignedCoshhCount ? `Sign All COSHH Documents (${unsignedCoshhCount} unsigned)` : 'All COSHH documents signed'}
      </button>
    ` : ''}
    ${canAdd && (docs.length || signedCoshhCount) ? `
      <div class="row-gap" style="margin-bottom:14px;">
        ${docs.length ? `<button class="ghostbtn" style="flex:1;padding:8px 6px;font-size:11.5px;" onclick="sendCoshhSignReminder('${siteId}')">🔔 Ask Outstanding to Sign</button>` : ''}
        ${signedCoshhCount ? `<button class="ghostbtn" style="flex:1;padding:8px 6px;font-size:11.5px;" ${coshhEmailAllBusy?'disabled':''} onclick="emailAllSignedCoshh('${siteId}')">${coshhEmailAllBusy?'Building & sending…':`✉️ Email All Signed (${signedCoshhCount})`}</button>` : ''}
      </div>
    ` : ''}

    ${canAdd ? (docs.length ? `
      <div class="ddrow" onclick="coshhUploadOpen=!coshhUploadOpen;render()"><span class="arrow">${coshhUploadOpen?'▼':'▶'}</span> Upload COSHH</div>
      ${coshhUploadOpen ? `<div class="card">${uploadForm}</div>` : ''}
    ` : `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Upload COSHH</p>
        ${uploadForm}
      </div>
    `) : ''}
    ${canAdd && coshhSubCompanies.length ? `
    <p class="sectiontitle" style="margin-top:22px;">Subcontractor COSHH</p>
    ${coshhSubCompanies.map(c=>{
      const cdocs = coshhByCompany[c.id]||[];
      const open = !!coshhSubOpenFor[c.id];
      return `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:10px;">
        <p class="ddrow" style="margin:0;padding:12px 14px;border:none;border-radius:0;background:transparent;" onclick="toggleCoshhSub('${c.id}')">
          <span class="arrow">${open?'▼':'▶'}</span> ${escapeHtml(c.name)} <span class="stub" style="display:inline;">(${cdocs.length} document${cdocs.length===1?'':'s'})</span>
        </p>
        ${open ? `<div style="padding:0 14px 14px;">
          ${cdocs.map(d=>`
            <div style="padding:8px 0;border-bottom:1px solid var(--line);">
              <div style="font-weight:700;font-size:12.5px;">${escapeHtml(d.name)}</div>
              <div class="meta">Uploaded ${new Date(d.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}</div>
              <div class="row-gap" style="margin-top:2px;">
                <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('coshh-docs', d.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(d.name)?d.name:d.name+'.pdf')}')">View document ↗</div>
                <div class="viewlink" style="cursor:pointer;" onclick="exportSignedCoshh('${d.id}')">⬇ Export</div>
                <div class="viewlink" style="cursor:pointer;" onclick="emailSignedCoshh('${siteId}','${d.id}')">✉️ Email</div>
              </div>
            </div>
          `).join('')}
          <button class="ghostbtn" style="margin-top:6px;" onclick="go('#/site/${siteId}/mc/subcontractors/${c.id}/coshh')">Open ${escapeHtml(c.name)}'s COSHH</button>
        </div>` : ''}
      </div>
      `;
    }).join('')}
    ` : ''}
  `, {title:'COSHH', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs`, siteId, activeTab:'more'}); }

  if(coshhPollTimer) clearInterval(coshhPollTimer);
  let coshhPollBusy = false;
  coshhPollTimer = setInterval(async ()=>{
    const el = document.getElementById('coshhDocsList');
    if(!el){ clearInterval(coshhPollTimer); coshhPollTimer = null; return; }
    if(coshhPollBusy || document.hidden || navigator.onLine === false) return;
    coshhPollBusy = true;
    try{
      const {docs, sigsByDoc, assignedIds} = await fetchCoshhData(siteId);
      const freshEl = document.getElementById('coshhDocsList');
      if(freshEl) freshEl.innerHTML = coshhDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, isClientView);
    } finally { coshhPollBusy = false; }
  }, 7000);
}
window.addCoshh = async function(siteId){
  const name = document.getElementById('coshhName').value.trim();
  const fileInput = document.getElementById('coshhFile');
  const file = fileInput.files && fileInput.files[0];
  if(!name || !file){ toast('Add a name and choose a PDF.'); return; }
  const path = siteId+'/coshh/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('coshh-docs', path, file, 'application/pdf');
  if(!stored) return;
  const rows = await dbInsert('coshh_docs', {site_id:siteId, name, storage_path:stored, uploaded_by:ME.id});
  // Deliberately leaves the Upload COSHH dropdown open — closing it after
  // every upload made it awkward to add several documents in a row. It only
  // needs collapsing once the operative(s) have actually signed, which
  // happens naturally the next time the page is opened fresh.
  if(rows){ toast('COSHH uploaded'); notifyDocNeedsSigning(siteId, 'COSHH', name); render(); }
};
// Replaces a COSHH document's file in place (an edit, not a new document —
// unlike RAMS "supersede" this doesn't keep the old file). Resets every
// existing signature on it so operatives sign the replacement afresh.
window.replaceCoshhFile = async function(input, siteId, coshhId, oldStoragePath){
  const file = input.files && input.files[0];
  if(!file) return;
  if(!await customConfirm('Replace this COSHH document with a new file? Everyone who has already signed will need to sign again.')){ input.value=''; return; }
  const path = siteId+'/coshh/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('coshh-docs', path, file, 'application/pdf');
  if(!stored) return;
  const nowIso = new Date().toISOString();
  const row = await dbUpdate('coshh_docs', coshhId, {storage_path: stored, uploaded_by:ME.id, uploaded_at: nowIso, resign_cycle_start: nowIso, last_resign_notified_at: null});
  if(row){
    try{ await sbFetch('/rest/v1/coshh_signatures?coshh_id=eq.'+coshhId, {method:'DELETE'}); }catch(e){}
    try{ if(oldStoragePath && oldStoragePath!==stored) await sbFetch('/storage/v1/object/coshh-docs/'+oldStoragePath, {method:'DELETE'}); }catch(e){}
    toast('COSHH document replaced — signatures reset');
    render();
  }
};
window.signCoshh = async function(siteId, coshhId){
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const rows = await dbInsert('coshh_signatures', {coshh_id:coshhId, user_id:ME.id, signature_image_path:ME.signature_path});
  if(rows){ toast('Signed — archived automatically'); render(); }
};
// One tap signs every COSHH document at this site the user hasn't already
// signed — each document still stays its own separate record, so
// exportSignedCoshh still produces one PDF per document with its own
// signature page; this just removes the need to open and sign each one in
// turn.
window.signAllCoshh = async function(siteId){
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const {docs, sigsByDoc} = await fetchCoshhData(siteId);
  const toSign = docs.filter(r=>!(sigsByDoc[r.id]||[]).some(s=>s.user_id===ME.id));
  if(!toSign.length){ toast('Already signed everything.'); render(); return; }
  const rows = await dbInsert('coshh_signatures', toSign.map(r=>({coshh_id:r.id, user_id:ME.id, signature_image_path:ME.signature_path})));
  if(rows){ toast(`Signed ${toSign.length} document${toSign.length===1?'':'s'}`); render(); }
};
// Shared PDF builder behind both the single "Export Signed PDF" button and
// the bulk "Email All Signed COSHH" action — builds the signed PDF for one
// COSHH document and returns its bytes/base64/filename, or null if there's
// nothing to build (no doc, no signatures, or PDFLib not ready). Doesn't
// toast on the "nothing to build" cases so a bulk caller can just skip it.
async function buildSignedCoshhPdf(coshhId){
  if(!(await loadLib('PDFLib'))) return null;
  const docs = await dbSelect('coshh_docs', 'id=eq.'+coshhId+'&select=*');
  const doc = docs[0];
  if(!doc) return null;
  const sigs = await dbSelect('coshh_signatures', 'coshh_id=eq.'+coshhId+'&order=signed_at.asc');
  if(!sigs.length) return null;
  try{
    const srcBytes = await (await fetch(publicUrl('coshh-docs', doc.storage_path))).arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(srcBytes, {ignoreEncryption:true});
    const disclaimer = `I have read and understood the contents of this COSHH document (${doc.name}). At all times employees must work in a safe manner both to prevent personal injury or injury/harm to others. Anything I did not understand has been explained to me to my satisfaction.`;
    const signers = sigs.map(s=>({
      name: nameOf(s.user_id),
      when: new Date(s.signed_at).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
      imagePath: s.signature_image_path,
    }));
    await drawSignatureTablePages(pdfDoc, {title: doc.name, disclaimer, signers});

    const coshhSite = SITES.find(s=>s.id===doc.site_id);
    const filename = exportFilename(coshhSite?coshhSite.name:'', doc.name+' (Signed)', 'pdf');
    pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await pdfDoc.save();
    let binary=''; const chunk=0x8000;
    for(let i=0;i<outBytes.length;i+=chunk) binary += String.fromCharCode.apply(null, outBytes.subarray(i,i+chunk));
    const base64 = btoa(binary);
    return {bytes: outBytes, base64, filename, doc};
  }catch(e){
    console.error(e);
    return null;
  }
}
window.exportSignedCoshh = async function(coshhId){
  toast('Building signed PDF…');
  const built = await buildSignedCoshhPdf(coshhId);
  if(!built){ toast('Could not build the signed PDF — check there are signatures and the source file is a valid PDF.'); return; }
  await deliverPdf(built.bytes, built.filename);
};
// Emails every currently-signed COSHH document at this site as its own
// separate PDF attachment, all on a single email — as opposed to Export
// Signed PDF which downloads one document at a time.
let coshhEmailAllBusy = false;
window.emailAllSignedCoshh = async function(siteId){
  const site = SITES.find(s=>s.id===siteId);
  let ccClientEmail = null;
  if(site && site.client_email){
    const cc = await customConfirm('CC client contact'+((site.client_contact_name||site.client_name)?' ('+(site.client_contact_name||site.client_name)+')':'')+' on this email?', {confirmLabel:'Yes, CC them', cancelLabel:'No'});
    if(cc) ccClientEmail = site.client_email;
  }
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  coshhEmailAllBusy = true; render();
  toast('Building PDFs…');
  try{
    const {docs, sigsByDoc} = await fetchCoshhData(siteId);
    const signedDocs = docs.filter(r=>(sigsByDoc[r.id]||[]).length>0);
    if(!signedDocs.length){ toast('No signed COSHH documents to email yet.'); return; }
    const parts = [];
    for(const d of signedDocs){
      const built = await buildSignedCoshhPdf(d.id);
      if(built && built.bytes) parts.push(built.bytes);
    }
    if(!parts.length){ toast('Could not build any of the signed COSHH documents.'); return; }
    // 2026-10-03: sent as ONE combined PDF behind a link. Posting every
    // signed document as its own attachment in a single request was failing
    // ("could not reach the server") on sites with more than a few.
    const filename = exportFilename(site?site.name:'', `Signed COSHH (${parts.length})`, 'pdf');
    const outBytes = await mergePdfBytes(parts, filename.replace(/\.pdf$/i,''));
    toast('Sending…');
    const ok = await emailPdfAsLink({siteId, bytes: outBytes, filename, title: `Signed COSHH — ${parts.length} document${parts.length===1?'':'s'}`, to: ME.email, clientCc: ccClientEmail});
    toast(ok ? `${parts.length} signed COSHH document${parts.length===1?'':'s'} emailed to ${ME.email}` : 'Email failed — please try again.');
  }catch(e){ console.error(e); toast('Email failed — could not reach the server.'); }
  finally{ coshhEmailAllBusy = false; render(); }
};
// Emails ONE signed COSHH document via a typed-in address — as opposed to
// emailAllSignedCoshh above, which emails every signed doc at a site to
// the caller's own address. Lets a PM email a subcontractor's signed COSHH
// straight from the main COSHH page's Subcontractor COSHH dropdown.
window.emailSignedCoshh = async function(siteId, coshhId){
  const site = SITES.find(s=>s.id===siteId);
  const answer = await customPromptWithCc('Email this signed COSHH PDF to:', '', site);
  if(!answer) return;
  const typedTrim = (answer.value||'').trim();
  if(typedTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedTrim)){ toast('Enter a valid email address.'); return; }
  const emailTo = resolvePromptEmailTo(answer);
  if(!emailTo) return; // nothing typed and "CC me a copy" wasn't ticked either
  const trimmed = emailTo.to;
  toast('Building signed PDF…');
  const built = await buildSignedCoshhPdf(coshhId);
  if(!built){ toast('Could not build the signed PDF — check there are signatures and the source file is a valid PDF.'); return; }
  const path = siteId+'/coshh-exports/'+uid()+'-'+built.filename.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('mc-documents', path, new Blob([built.bytes], {type:'application/pdf'}), 'application/pdf');
  if(!stored){ toast('Could not upload the PDF — try again.'); return; }
  toast('Sending…');
  try{
    const res = await sbFetch('/functions/v1/send-document-email', {method:'POST', body: JSON.stringify({
      site_id: siteId, recipient_email: trimmed, cc_email: emailTo.cc, client_cc_email: ccClientEmailFromPromptAnswer(answer, site), doc_title: built.doc.name+' (Signed COSHH)', file_url: publicUrl('mc-documents', stored),
    })});
    if(res && res.ok){ toast('Emailed'); } else { toast('Could not send the email — please try again.'); }
  }catch(e){ toast('Could not send the email — please try again.'); }
};
window.deleteCoshh = async function(coshhId, storagePath){
  if(!await customConfirm('Delete this COSHH document and all its signatures? This can\'t be undone.')) return;
  const rows = await dbSelect('coshh_docs', 'id=eq.'+coshhId+'&select=site_id,name');
  const coshhRow = rows[0];
  try{ await sbFetch('/storage/v1/object/coshh-docs/'+storagePath, {method:'DELETE'}); }catch(e){}
  const ok = await dbDelete('coshh_docs', coshhId);
  if(ok){ toast('COSHH document deleted'); if(coshhRow) logSiteActivity(coshhRow.site_id, 'coshh_deleted', `Deleted COSHH document "${coshhRow.name||''}"`); render(); }
};
// PM/admin-only: same "Ask Outstanding to Sign" push as RAMS, but for COSHH.
window.sendCoshhSignReminder = async function(siteId){
  const {docs, sigsByDoc, assignedIds} = await fetchCoshhData(siteId);
  if(!docs.length){ toast('No COSHH documents to sign.'); return; }
  const roster = assignedIds||[];
  const outstanding = roster.filter(uid => docs.some(d => !(sigsByDoc[d.id]||[]).some(s=>s.user_id===uid)));
  if(!outstanding.length){ toast('Everyone on this site has signed all COSHH documents.'); return; }
  if(!await customConfirm(`Send a sign-reminder notification to ${outstanding.length} operative${outstanding.length===1?'':'s'} who still have COSHH to sign?`)) return;
  try{
    const res = await sbFetch('/functions/v1/send-sign-reminder', {method:'POST', body: JSON.stringify({site_id:siteId, doc_type:'coshh', user_ids: outstanding})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Could not send reminder — '+(d.error||res.status)); return; }
    toast(d.sent ? `Reminder sent to ${d.sent} device${d.sent===1?'':'s'}.` : 'No registered devices to notify yet.');
  }catch(e){ console.error(e); toast('Could not send reminder.'); }
};
