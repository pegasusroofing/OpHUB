/* ================= SITE RULES & LAYOUT (signable, like COSHH — everyone on
   site must acknowledge it, not just a generic upload folder). Mirrors the
   COSHH doc/signature pattern exactly (site_layout_docs/site_layout_signatures
   tables, same shape as coshh_docs/coshh_signatures) so the same "sign all"
   / roster-outstanding UX applies; stored in the mc-documents bucket since
   it's still a Main-Contractor tile. */
let siteLayoutPollTimer = null;
let siteLayoutUploadOpen = false;
function siteLayoutDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, isClientView){
  const roster = assignedIds||[];
  return docs.map(r=>{
    const sigs = sigsByDoc[r.id]||[];
    const mine = sigs.find(s=>s.user_id===ME.id);
    const notSigned = roster.filter(id => !sigs.some(s=>s.user_id===id));
    let outstandingHtml;
    if(!roster.length){
      outstandingHtml = sigs.length ? `<div class="signerlist">${sigs.map(s=>`<div style="display:flex;align-items:center;gap:8px;">✓ ${escapeHtml(nameOf(s.user_id))}${s.signature_image_path ? `<img src="${publicUrl('signatures', s.signature_image_path)}" style="height:20px;object-fit:contain;">` : ''} — ${new Date(s.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</div>`).join('')}</div>` : '';
    } else if(!notSigned.length){
      outstandingHtml = `<div class="signerlist"><div style="display:flex;align-items:center;gap:8px;color:var(--good);font-weight:600;">✓ Signed by everyone on site</div></div>`;
    } else {
      outstandingHtml = `<div class="signerlist"><div class="meta" style="margin-bottom:4px;">Still need to sign:</div>${notSigned.map(id=>`<div style="display:flex;align-items:center;gap:8px;">○ ${escapeHtml(nameOf(id))}</div>`).join('')}</div>`;
    }
    const signedCount = sigs.length;
    const outstandingCount = notSigned.length;
    return `
    <div class="ramsdoc" style="padding:10px 12px;">
      <div class="taskrowtop">
        <div class="name" style="font-size:19px;font-weight:800;">${escapeHtml(r.name)}</div>
        ${canAdd ? `<div class="taskicons"><div class="taskicon danger" onclick="deleteSiteLayout('${r.id}','${jsAttr(r.storage_path)}')">🗑</div></div>` : ''}
      </div>
      <div class="meta" style="margin-top:3px;">Uploaded by ${escapeHtml(nameOf(r.uploaded_by))} · ${new Date(r.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}${resignDueLabel(r, site)} · <span class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('mc-documents', r.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(r.name)?r.name:r.name+'.pdf')}')">View document ↗</span></div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        ${canAdd || isClientView ? `
          <div class="siglinebox" style="flex:1;margin-top:0;cursor:default;">
            <span class="name">${signedCount} signed</span><span>${roster.length ? outstandingCount+' outstanding' : ''}</span>
          </div>
        ` : `
          <div class="siglinebox coshhsigbox ${mine?'signed':''}" onclick="${mine?'':`signSiteLayout('${siteId}','${r.id}')`}" style="flex:1;margin-top:0;${mine?'':'cursor:pointer;'}">
            ${mine ? (mine.signature_image_path ? `<img src="${publicUrl('signatures', mine.signature_image_path)}" style="height:24px;max-width:100px;object-fit:contain;">` : `<span class="name">${escapeHtml(ME.name)}</span>`) + `<span>Signed ${new Date(mine.signed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</span>` : 'Not signed yet'}
          </div>
        `}
        ${sigs.length && (canAdd||isClientView) ? `<button class="ghostbtn exportbtn" style="flex:1;margin-top:0;" onclick="exportSignedSiteLayout('${r.id}')">Export Signed PDF</button>` : ''}
      </div>
      ${outstandingHtml}
    </div>`;
  }).join('') || `<div class="empty">No Site Rules &amp; Layout documents uploaded.</div>`;
}
async function fetchSiteLayoutData(siteId){
  const site = SITES.find(s=>s.id===siteId);
  const [docs, assigned] = await Promise.all([
    dbSelect('site_layout_docs', 'site_id=eq.'+siteId+'&order=uploaded_at.desc'),
    dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id'),
  ]);
  await loadAllProfiles();
  const rosterUserIds = assigned.map(a=>a.user_id).filter(uid => PROFILES[uid] && PROFILES[uid].role==='operative');
  let sigsByDoc = {};
  if(docs.length){
    const ids = docs.map(d=>d.id).join(',');
    let sigs = await dbSelect('site_layout_signatures', 'layout_id=in.('+ids+')');
    sigs = filterCurrentCycleSigs(sigs, docs, 'layout_id', site);
    sigs.forEach(s=>{ (sigsByDoc[s.layout_id]=sigsByDoc[s.layout_id]||[]).push(s); });
  }
  return {docs, sigsByDoc, assignedIds: rosterUserIds};
}
async function renderSiteLayout(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canAdd = isManager(ME);
  const isClientView = ME.role==='client';
  await loadAllProfiles();
  const {docs, sigsByDoc, assignedIds} = await fetchSiteLayoutData(siteId);
  const unsignedCount = docs.filter(r=>!(sigsByDoc[r.id]||[]).some(s=>s.user_id===ME.id)).length;
  const uploadForm = `
        <div class="formfield" style="margin-top:0;"><input type="text" id="siteLayoutName" placeholder="Document name, e.g. Site Rules &amp; Layout Plan"></div>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;padding:8px 6px;font-size:11.5px;" onclick="document.getElementById('siteLayoutFile').click()">Choose PDF</div>
        <input type="file" accept="application/pdf" id="siteLayoutFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="document.getElementById('siteLayoutFileName').textContent=this.files[0]?this.files[0].name:''">
        <p class="stub" id="siteLayoutFileName" style="margin:-4px 0 10px;"></p>
        <button class="darkbtn" style="padding:8px 6px;font-size:11.5px;" onclick="addSiteLayout('${siteId}')">Upload</button>
        <p class="stub">Everyone assigned to this site will need to sign to confirm they've read it — same as COSHH.</p>
  `;
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div id="siteLayoutDocsList">${siteLayoutDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, isClientView)}</div>
    ${!canAdd && !isClientView && docs.length ? `
      <button class="darkbtn" style="margin-bottom:10px;padding:8px 6px;font-size:11.5px;" ${unsignedCount?'':'disabled'} onclick="signAllSiteLayout('${siteId}')">
        ${unsignedCount ? `Sign All (${unsignedCount} unsigned)` : 'All documents signed'}
      </button>
    ` : ''}
    ${canAdd ? (docs.length ? `
      <div class="ddrow" onclick="siteLayoutUploadOpen=!siteLayoutUploadOpen;render()"><span class="arrow">${siteLayoutUploadOpen?'▼':'▶'}</span> Upload Document</div>
      ${siteLayoutUploadOpen ? `<div class="card">${uploadForm}</div>` : ''}
    ` : `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Upload Document</p>
        ${uploadForm}
      </div>
    `) : ''}
  `, {title:'Site Rules & Layout', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/mc`, siteId, activeTab:'more'}); }

  if(siteLayoutPollTimer) clearInterval(siteLayoutPollTimer);
  let siteLayoutPollBusy = false;
  siteLayoutPollTimer = setInterval(async ()=>{
    const el = document.getElementById('siteLayoutDocsList');
    if(!el){ clearInterval(siteLayoutPollTimer); siteLayoutPollTimer = null; return; }
    if(siteLayoutPollBusy || document.hidden || navigator.onLine === false) return;
    siteLayoutPollBusy = true;
    try{
      const {docs, sigsByDoc, assignedIds} = await fetchSiteLayoutData(siteId);
      const freshEl = document.getElementById('siteLayoutDocsList');
      if(freshEl) freshEl.innerHTML = siteLayoutDocsHtml(siteId, docs, sigsByDoc, canAdd, assignedIds, site, isClientView);
    } finally { siteLayoutPollBusy = false; }
  }, 7000);
}
window.addSiteLayout = async function(siteId){
  const name = document.getElementById('siteLayoutName').value.trim();
  const fileInput = document.getElementById('siteLayoutFile');
  const file = fileInput.files && fileInput.files[0];
  if(!name || !file){ toast('Add a name and choose a PDF.'); return; }
  const path = siteId+'/site-layout/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('mc-documents', path, file, 'application/pdf');
  if(!stored) return;
  const rows = await dbInsert('site_layout_docs', {site_id:siteId, name, storage_path:stored, uploaded_by:ME.id});
  if(rows){ toast('Uploaded'); render(); }
};
window.signSiteLayout = async function(siteId, layoutId){
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const rows = await dbInsert('site_layout_signatures', {layout_id:layoutId, user_id:ME.id, signature_image_path:ME.signature_path});
  if(rows){ toast('Signed — archived automatically'); render(); }
};
window.signAllSiteLayout = async function(siteId){
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const {docs, sigsByDoc} = await fetchSiteLayoutData(siteId);
  const toSign = docs.filter(r=>!(sigsByDoc[r.id]||[]).some(s=>s.user_id===ME.id));
  if(!toSign.length){ toast('Already signed everything.'); render(); return; }
  const rows = await dbInsert('site_layout_signatures', toSign.map(r=>({layout_id:r.id, user_id:ME.id, signature_image_path:ME.signature_path})));
  if(rows){ toast(`Signed ${toSign.length} document${toSign.length===1?'':'s'}`); render(); }
};
window.deleteSiteLayout = async function(id, storagePath){
  if(!await customConfirm('Delete this document? Any signatures on it will be lost.')) return;
  const ok = await dbDelete('site_layout_docs', id);
  if(ok){ try{ await sbFetch('/storage/v1/object/mc-documents/'+storagePath, {method:'DELETE'}); }catch(e){} toast('Deleted'); render(); }
};
async function buildSignedSiteLayoutPdf(layoutId){
  if(!(await loadLib('PDFLib'))) return null;
  const docs = await dbSelect('site_layout_docs', 'id=eq.'+layoutId+'&select=*');
  const doc = docs[0];
  if(!doc) return null;
  const sigs = await dbSelect('site_layout_signatures', 'layout_id=eq.'+layoutId+'&order=signed_at.asc');
  if(!sigs.length) return null;
  try{
    const srcBytes = await (await fetch(publicUrl('mc-documents', doc.storage_path))).arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(srcBytes, {ignoreEncryption:true});
    const disclaimer = `I have read and understood this Site Rules & Layout document (${doc.name}) and agree to follow it at all times while on this site.`;
    const signers = sigs.map(s=>({
      name: nameOf(s.user_id),
      when: new Date(s.signed_at).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
      imagePath: s.signature_image_path,
    }));
    await drawSignatureTablePages(pdfDoc, {title: doc.name, disclaimer, signers});
    const laySite = SITES.find(s=>s.id===doc.site_id);
    const filename = exportFilename(laySite?laySite.name:'', doc.name+' (Signed)', 'pdf');
    pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await pdfDoc.save();
    return {bytes: outBytes, filename};
  }catch(e){ console.error(e); return null; }
}
window.exportSignedSiteLayout = async function(layoutId){
  toast('Building signed PDF…');
  const built = await buildSignedSiteLayoutPdf(layoutId);
  if(!built){ toast('Could not build the signed PDF — check there are signatures and the source file is a valid PDF.'); return; }
  await deliverPdf(built.bytes, built.filename);
};
