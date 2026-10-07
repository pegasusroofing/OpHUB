/* ================= SIGNING TEMPLATES LIBRARY ================= */
// Settings → Libraries → Signing Templates. Upload a SAMPLE of a form you use again and
// again (e.g. a client's RAMS form), mark the sign boxes on it once, and
// from then on choose that template when uploading the real document for a
// job: the real document takes the sample's place and keeps the boxes.
let signTplBusy = false;
async function renderSignTemplates(){
  const __gen = RENDER_GEN;
  const list = await dbSelect('sign_layout_templates', 'order=name.asc&select=id,name,page_count,layout,storage_path,file_name,created_at');
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="margin-bottom:12px;">
      <p style="margin:0 0 4px;font-weight:700;">How this works</p>
      <p class="stub" style="margin:0;">1. Upload a sample of a form you use often. 2. Mark every box and say who it's for — Operative 1, Operative 2, the Project Manager, the Client. 3. When you upload that form for a job, pick the template: the boxes are already in place and everyone signs with one tap.</p>
    </div>
    <div class="card" style="margin-bottom:14px;">
      <p style="margin:0 0 8px;font-weight:700;">New template</p>
      <div class="formfield" style="margin-top:0;"><input type="text" id="signTplName" placeholder="Template name, e.g. Hyde RAMS form" maxlength="80"></div>
      <div class="row-gap" style="margin-bottom:6px;">
        <div class="ghostbtn" style="cursor:pointer;text-align:center;flex:1;" onclick="document.getElementById('signTplFile').click()">Choose sample PDF</div>
        <button class="darkbtn" style="flex:1;" ${signTplBusy?'disabled':''} onclick="addSignTemplate()">${signTplBusy?'Uploading…':'Upload & set boxes'}</button>
      </div>
      <input type="file" accept="application/pdf" id="signTplFile" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="const f=this.files[0]; const el=document.getElementById('signTplFileName'); el.textContent = f ? ('✓ '+f.name+' selected') : '';">
      <p class="stub" id="signTplFileName" style="margin:0;font-size:12.5px;"></p>
    </div>
    <p class="sectiontitle">Your templates</p>
    ${list.length ? list.map(tp=>{
      const n = ramsLayoutBoxes(tp.layout).length;
      return `<div class="card" style="margin-bottom:8px;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div style="flex:1;min-width:0;">
            <p style="margin:0;font-weight:700;">${escapeHtml(tp.name)}</p>
            <p class="stub" style="margin:2px 0 0;">${n ? escapeHtml(ramsLayoutSummary(tp.layout)) : '<span style="color:var(--warn);">No boxes set yet</span>'}${tp.page_count ? ' · '+tp.page_count+' pages' : ''}</p>
          </div>
          ${rowActionsMenuHtml('signtpl-'+tp.id, `
            ${tp.storage_path ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;ramsBoxEd=null;go('#/sign-templates/${tp.id}')">✍ Set / edit boxes</div>` : ''}
            ${tp.storage_path ? `<div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;render();viewDrawing('${publicUrl('rams-docs', tp.storage_path)}','${jsAttr(tp.file_name||tp.name+'.pdf')}')">👁 View sample</div>` : ''}
            <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;renameSignTemplate('${tp.id}','${jsAttr(tp.name)}')">✎ Rename</div>
            <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteSignTemplate('${tp.id}')">🗑 Delete</div>
          `)}
        </div>
      </div>`;
    }).join('') : `<div class="empty">No templates yet.</div>`}
  `, {title:'Signing Templates', back:'#/team/libraries', tabs:false});
}
window.addSignTemplate = async function(){
  if(signTplBusy) return;
  const name = document.getElementById('signTplName').value.trim();
  const input = document.getElementById('signTplFile');
  const file = input.files && input.files[0];
  if(!name || !file){ toast('Add a name and choose a sample PDF.'); return; }
  if(!/\.pdf$/i.test(file.name) && file.type!=='application/pdf'){ toast('The sample needs to be a PDF.'); return; }
  signTplBusy = true; render();
  try{
    const path = 'sign-templates/'+ME.org_id+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('rams-docs', path, file, 'application/pdf');
    if(!stored){ signTplBusy = false; render(); return; }
    const rows = await dbInsert('sign_layout_templates', {name: name.slice(0,80), layout:{v:2, boxes:[]}, storage_path: stored, file_name: file.name});
    signTplBusy = false;
    if(rows && rows[0]){ toast('Sample uploaded — now mark the boxes'); ramsBoxEd = null; go('#/sign-templates/'+rows[0].id); }
    else render();
  }catch(e){ console.error(e); signTplBusy = false; toast('Could not upload — please try again.'); render(); }
};
window.renameSignTemplate = async function(id, oldName){
  const name = await customPrompt('Template name:', oldName||'');
  if(!name || !String(name).trim()){ render(); return; }
  await dbUpdate('sign_layout_templates', id, {name:String(name).trim().slice(0,80)});
  render();
};
window.deleteSignTemplate = async function(id){
  if(!await customConfirm('Delete this template? Documents already uploaded with it keep their boxes.', {confirmLabel:'Delete', danger:true})){ render(); return; }
  await dbDelete('sign_layout_templates', id);
  render();
};
// Stamps everyone into the document's own boxes.
//   people = {ops:[…in signing order…], pm, client} — each {plainName,
//   dateText, imagePath, issued}; pm/client may be null.
// A box whose person hasn't signed is left empty. Returns how many
// operatives had no box at all (they still get the summary page).
async function stampRamsSignLayout(pdfDoc, layout, people){
  const boxes = ramsLayoutBoxes(layout);
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const italic = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaOblique);
  const INK = PDFLib.rgb(0.06,0.06,0.07);
  const pages = pdfDoc.getPages();
  const imgCache = new Map();
  const getImg = async path=>{
    if(!path) return null;
    if(!imgCache.has(path)) imgCache.set(path, (async()=>{ try{ const b = await pdfFetchImageBytes(publicUrl('signatures', path)); return b ? await pdfEmbedImageBytes(pdfDoc, b) : null; }catch(e){ return null; } })());
    return imgCache.get(path);
  };
  const personFor = w=>{ const cn = ramsBoxClientNum(w); return cn ? ((people.clients||{})[cn] || null) : (w==='pm' ? people.pm : (people.ops[ramsBoxOpNum(w)-1] || null)); };
  for(const b of boxes){
    const s = personFor(b.w); if(!s) continue;
    const page = pages[b.p-1]; if(!page) continue;
    const {width:W, height:H} = page.getSize();
    const r = {x:b.r[0]*W, y:H - b.r[1]*H - b.r[3]*H, w:b.r[2]*W, h:b.r[3]*H};
    const textIn = (text, f)=>{
      const size = Math.max(6, Math.min(11, r.h*0.55));
      pdfDrawFit(page, text, {x:r.x+3, y:r.y + (r.h-size)/2 + 1, size, font:f, color:INK, maxWidth:r.w-6}, 5);
    };
    if(b.t==='name') textIn(s.plainName, font);
    else if(b.t==='date') textIn(s.dateText, font);
    else {
      const img = await getImg(s.imagePath);
      if(img){
        const d = img.scale(1); const sc = Math.min((r.w*0.92)/d.width, (r.h*0.9)/d.height);
        const w = d.width*sc, h = d.height*sc;
        page.drawImage(img, {x:r.x + (r.w-w)/2, y:r.y + (r.h-h)/2, width:w, height:h});
      } else textIn(s.plainName, italic);
    }
  }
  return Math.max(0, people.ops.length - ramsLayoutSlots(layout));
}
// Shared builder — factored out of exportSignedRams so emailSignedRams (new,
// lets a PM email a subcontractor's signed RAMS straight from the main RAMS
// page's Subcontractor RAMS dropdown, not just from within that
// subcontractor's own tile) can build from exactly the same bytes. Returns
// null (after its own toast) on any failure/no-signatures-yet.
async function buildSignedRamsPdfBytes(ramsId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const docs = await dbSelect('rams_docs', 'id=eq.'+ramsId+'&select=*');
  const doc = docs[0];
  if(!doc){ toast('Document not found.'); return null; }
  const sigs = await dbSelect('rams_signatures', 'rams_id=eq.'+ramsId+'&order=signed_at.asc');
  // Client signatures (emailed link), one per client number; the newest signed one wins.
  const clientRows = await dbSelect('rams_client_signatures', 'rams_id=eq.'+ramsId+'&signed_at=not.is.null&order=signed_at.asc&select=id,client_slot,signer_name,client_name,client_email,signed_at,signature_path');
  if(!sigs.length && !clientRows.length){ toast('No signatures yet.'); return null; }
  const clientsBySlot = {};
  clientRows.forEach(c=>{
    const slot = c.client_slot || 1, nm = c.signer_name || c.client_name || 'Client';
    clientsBySlot[slot] = {
      slot, plainName: nm, issued: false,
      dateText: new Date(c.signed_at).toLocaleDateString('en-GB', {day:'2-digit',month:'2-digit',year:'numeric'}),
      name: nm + ' (Client'+(slot>1?' '+slot:'')+')',
      when: new Date(c.signed_at).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
      imagePath: c.signature_path,
    };
  });
  const clientSigners = Object.values(clientsBySlot).sort((x,y)=>x.slot-y.slot);
  try{
    const srcBytes = await (await fetch(publicUrl('rams-docs', doc.storage_path))).arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(srcBytes, {ignoreEncryption:true});
    const disclaimer = `I have read and understood the contents of this RAMS document (${doc.name}). At all times employees must work in a safe manner both to prevent personal injury or injury/harm to others. Anything I did not understand has been explained to me to my satisfaction.`;
    const signers = sigs.map(s=>({
      plainName: nameOf(s.user_id), issued: !!s.issued,
      dateText: new Date(s.signed_at).toLocaleDateString('en-GB', {day:'2-digit',month:'2-digit',year:'numeric'}),
      // A PM/admin's "issued" record never carries an adopted signature —
      // labelled in the Name column instead so it reads clearly as
      // "issued", not as a missing/blank signature on an operative row.
      name: nameOf(s.user_id) + (s.issued ? ' (Issued — not required to sign)' : ''),
      when: new Date(s.signed_at).toLocaleString('en-GB', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
      imagePath: s.issued ? null : s.signature_image_path,
      // Only used for a Project Manager BOX in the document; the summary page still shows "Issued".
      pmImagePath: s.issued ? ((PROFILES[s.user_id] && PROFILES[s.user_id].signature_path) || null) : null,
    }));
    // Signature boxes marked on this document? Stamp everyone into the
    // document's own sign-off tables. The summary page at the end is then
    // only added if somebody didn't fit (more signers than rows).
    let needSummary = true;
    if(ramsLayoutBoxes(doc.sign_layout).length){
      // Operatives fill Operative 1, 2, 3… in the order they signed. The
      // Project Manager box takes the manager who issued it (with their
      // saved signature, if they have one). The Client box takes the
      // client's emailed-link signature.
      const ops = signers.filter(x=>!x.issued);
      const mgr0 = signers.find(x=>x.issued) || null;
      const mgr = mgr0 ? Object.assign({}, mgr0, {imagePath: mgr0.pmImagePath}) : null;
      const people = {ops, pm: mgr, clients: clientsBySlot};
      const unplaced = await stampRamsSignLayout(pdfDoc, doc.sign_layout, people);
      // The summary page is only added for anyone the document had no box for.
      needSummary = unplaced > 0 || (mgr && !ramsLayoutHas(doc.sign_layout,'pm')) || clientSigners.some(c=>c.slot > ramsLayoutClients(doc.sign_layout));
    }
    if(needSummary) await drawSignatureTablePages(pdfDoc, {title: doc.name, disclaimer, signers: signers.concat(clientSigners)});

    const ramsSite = SITES.find(s=>s.id===doc.site_id);
    const filename = exportFilename(ramsSite?ramsSite.name:'', doc.name+' (Signed)', 'pdf');
    pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await pdfDoc.save();
    return {bytes: outBytes, filename, doc, site: ramsSite};
  }catch(e){
    console.error(e);
    toast('Could not build the signed PDF — the source file may not be a valid PDF.');
    return null;
  }
}
// "Test fill": the document with EVERY signature box filled with sample
// text ("Operative 3", "Client 1"…), so a manager can check the boxes are
// in the right places before anybody signs. Nothing is saved or signed.
window.previewRamsBoxes = async function(ramsId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  toast('Building test fill…');
  try{
    const docs = await dbSelect('rams_docs', 'id=eq.'+ramsId+'&select=*');
    const doc = docs[0];
    if(!doc || !ramsLayoutBoxes(doc.sign_layout).length){ toast('This document has no signature boxes set.'); return; }
    const srcBytes = await (await fetch(publicUrl('rams-docs', doc.storage_path))).arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(srcBytes, {ignoreEncryption:true});
    const today = new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'2-digit',year:'numeric'});
    const sample = label=>({plainName: label, dateText: today, imagePath: null, issued: false});
    const ops = []; for(let i=1; i<=ramsLayoutSlots(doc.sign_layout); i++) ops.push(sample('Operative '+i));
    const clients = {}; for(let i=1; i<=ramsLayoutClients(doc.sign_layout); i++) clients[i] = sample('Client '+i);
    await stampRamsSignLayout(pdfDoc, doc.sign_layout, {ops, pm: sample('Project Manager'), clients});
    const filename = exportFilename('', doc.name+' (TEST FILL - not signed)', 'pdf');
    pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
    await deliverPdf(await pdfDoc.save(), filename);
  }catch(e){ console.error('[previewRamsBoxes]', e); toast('Could not build the test fill — '+((e && e.message) || 'please try again')); }
};
window.exportSignedRams = async function(ramsId){
  toast('Building signed PDF…');
  const built = await buildSignedRamsPdfBytes(ramsId);
  if(!built) return;
  await deliverPdf(built.bytes, built.filename);
};
window.emailSignedRams = async function(siteId, ramsId){
  const site = SITES.find(s=>s.id===siteId);
  const answer = await customPromptWithCc('Email this signed RAMS PDF to:', '', site);
  if(!answer) return;
  const typedTrim = (answer.value||'').trim();
  if(typedTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedTrim)){ toast('Enter a valid email address.'); return; }
  const emailTo = resolvePromptEmailTo(answer);
  if(!emailTo) return; // nothing typed and "CC me a copy" wasn't ticked either
  const trimmed = emailTo.to;
  toast('Building signed PDF…');
  const built = await buildSignedRamsPdfBytes(ramsId);
  if(!built) return;
  const path = siteId+'/rams-exports/'+uid()+'-'+built.filename.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('mc-documents', path, new Blob([built.bytes], {type:'application/pdf'}), 'application/pdf');
  if(!stored){ toast('Could not upload the PDF — try again.'); return; }
  toast('Sending…');
  try{
    const res = await sbFetch('/functions/v1/send-document-email', {method:'POST', body: JSON.stringify({
      site_id: siteId, recipient_email: trimmed, cc_email: emailTo.cc, client_cc_email: ccClientEmailFromPromptAnswer(answer, site), doc_title: built.doc.name+' (Signed RAMS)', file_url: publicUrl('mc-documents', stored),
    })});
    if(res && res.ok){ toast('Emailed'); } else { toast('Could not send the email — please try again.'); }
  }catch(e){ toast('Could not send the email — please try again.'); }
};
window.deleteRams = async function(ramsId, storagePath){
  if(!await customConfirm('Delete this RAMS document and all its signatures? This can\'t be undone.')) return;
  const rows = await dbSelect('rams_docs', 'id=eq.'+ramsId+'&select=site_id,name');
  const ramsRow = rows[0];
  try{ await sbFetch('/storage/v1/object/rams-docs/'+storagePath, {method:'DELETE'}); }catch(e){}
  const ok = await dbDelete('rams_docs', ramsId);
  if(ok){ toast('RAMS document deleted'); if(ramsRow) logSiteActivity(ramsRow.site_id, 'rams_deleted', `Deleted RAMS document "${ramsRow.name||''}"`); render(); }
};
// PM/admin-only: pushes a "please sign" notification to every operative on
// this site who is still missing a signature on at least one current RAMS
// document — nobody who has already signed everything gets pinged. The
// eligible list is worked out fresh here (not from a stale render) and the
// edge function re-checks it server-side too.
window.sendRamsSignReminder = async function(siteId){
  const {docs, sigsByDoc, assignedIds} = await fetchRamsData(siteId);
  if(!docs.length){ toast('No RAMS documents to sign.'); return; }
  // PMs/admins aren't part of the mandatory sign-off any more (they get a
  // one-tap "issued" record instead), so they shouldn't be chased to sign.
  const roster = (assignedIds||[]).filter(id=>PROFILES[id] && PROFILES[id].role==='operative');
  const outstanding = roster.filter(uid => docs.some(d => !(sigsByDoc[d.id]||[]).some(s=>s.user_id===uid)));
  if(!outstanding.length){ toast('Everyone on this site has signed all RAMS documents.'); return; }
  if(!await customConfirm(`Send a sign-reminder notification to ${outstanding.length} operative${outstanding.length===1?'':'s'} who still have RAMS to sign?`)) return;
  try{
    const res = await sbFetch('/functions/v1/send-sign-reminder', {method:'POST', body: JSON.stringify({site_id:siteId, doc_type:'rams', user_ids: outstanding})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Could not send reminder — '+(d.error||res.status)); return; }
    toast(d.sent ? `Reminder sent to ${d.sent} device${d.sent===1?'':'s'}.` : 'No registered devices to notify yet.');
  }catch(e){ console.error(e); toast('Could not send reminder.'); }
};
