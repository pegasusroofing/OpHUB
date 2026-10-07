/* ================= PER-OPERATIVE CERTIFICATIONS =================
   Replaces the old flat org-wide Certifications sync (single shared
   OneDrive folder, no per-person structure) with a per-operative system:
   each operative gets their own certificate list (CSCS card, manual
   handling, working at height, asbestos awareness, other), reachable from
   (a) the "Operatives" management area (Settings & Admin → Operatives, for
   PMs/admins reviewing anyone's record), (b) every site's Health & Safety →
   Certifications page (auto-lists whoever's assigned to that site, plus the
   viewer's own certs), and (c) an operative's own H&S → Certifications page
   (their permanent self-upload folder). The org's existing Certifications
   OneDrive folder link (above) is now just the ROOT — each operative's own
   subfolder lives inside it and is created automatically the first time a
   PM/admin syncs that operative. */
const CERT_CATEGORIES = [
  {key:'cscs_card', label:'CSCS Card'},
  {key:'manual_handling', label:'Manual Handling'},
  {key:'working_at_height', label:'Working at Height'},
  {key:'asbestos_awareness', label:'Asbestos Awareness'},
  {key:'smsts', label:'SMSTS'},
  {key:'sssts', label:'SSSTS'},
  {key:'manufacturer_installer_card', label:'Manufacturer Installer Card'},
  {key:'other', label:'Other'},
];
function certCategoryLabel(key){ return (CERT_CATEGORIES.find(c=>c.key===key)||{}).label || 'Other'; }
let operativeCertSyncBusy = {};
// Change Folder / Unlink collapsed into a chevron dropdown (#276) — one open at a time.
let opFolderMenuOpenFor = null;
window.toggleOpFolderMenu = function(operativeId){ opFolderMenuOpenFor = opFolderMenuOpenFor===operativeId ? null : operativeId; render(); };
// Generic per-row "▾ more actions" dropdown (#281) — replaces separate
// inline delete/move-up/move-down/edit icon buttons wherever a list row
// offers more than a couple of actions (Schedule of Works sections/tasks,
// Drawings folders). One open at a time, closes on outside click (see the
// document click handler's [data-rowactions-root] check).
let rowActionsMenuOpenFor = null;
window.toggleRowActionsMenu = function(key){ rowActionsMenuOpenFor = rowActionsMenuOpenFor===key ? null : key; render(); };
function rowActionsMenuHtml(key, itemsHtml){
  return `
    <div style="position:relative;flex:0 0 auto;" data-rowactions-root onclick="event.stopPropagation();">
      <span class="taskicon" title="More actions" onclick="toggleRowActionsMenu('${key}')">▾</span>
      ${rowActionsMenuOpenFor===key ? `<div class="statusmenu" style="right:0;left:auto;">${itemsHtml}</div>` : ''}
    </div>
  `;
}
// Certificates ticked for a combined export/email — shared across every
// listing that offers selection (Operative Dashboard, Site Certifications
// "Your Certificates", and the per-operative Admin Centre detail page) so
// the same PDF-bundle flow (#276) doesn't need three separate copies.
let certSelectedIds = new Set();
window.toggleCertSelect = function(id){
  if(certSelectedIds.has(id)) certSelectedIds.delete(id); else certSelectedIds.add(id);
  render();
};

// A small "+" above the certificate list, replacing what used to be a big
// always-open upload form pinned under it — tap it to reveal the same
// upload form right there, collapse again once done.
let certAddOpenFor = {};
window.toggleCertAddFor = function(key){ certAddOpenFor[key] = !certAddOpenFor[key]; render(); };
function certAddToggleHtml(operativeId, prefix, label){
  return `
    <div class="drawheaderrow" style="margin-bottom:${certAddOpenFor[prefix]?'10px':'12px'};">
      <span>${label||'Add a certificate'}</span>
      <div class="roundplusbtn" onclick="toggleCertAddFor('${prefix}')">${certAddOpenFor[prefix]?'−':'+'}</div>
    </div>
    ${certAddOpenFor[prefix] ? operativeCertUploadFormHtml(operativeId, prefix) : ''}
  `;
}
function operativeCertUploadFormHtml(operativeId, prefix){
  return `
    <div class="card" style="margin-top:10px;">
      <p class="field-label" style="margin-bottom:6px;">Upload a certificate</p>
      <select id="${prefix}CertCategory" class="stub" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;margin-bottom:8px;background:var(--card);" onchange="document.getElementById('${prefix}CertOtherRow').style.display=this.value==='other'?'block':'none';">
        ${CERT_CATEGORIES.map(c=>`<option value="${c.key}">${c.label}</option>`).join('')}
      </select>
      <div id="${prefix}CertOtherRow" style="display:none;margin-bottom:8px;">
        <input type="text" id="${prefix}CertOtherDesc" placeholder="Describe the certificate type" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;box-sizing:border-box;">
      </div>
      <p class="field-label" style="margin-bottom:6px;cursor:pointer;" onclick="openDatePickerRow(document.getElementById('${prefix}CertExpiry'))">Expiry date (optional)</p>
      <input type="date" id="${prefix}CertExpiry" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:8px;margin-bottom:8px;box-sizing:border-box;">
      <label class="ghostbtn" style="display:block;text-align:center;margin-bottom:8px;cursor:pointer;position:relative;">
        <span id="${prefix}CertFileName">Choose file…</span>
        <input type="file" id="${prefix}CertFile" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;" onchange="document.getElementById('${prefix}CertFileName').textContent=this.files[0]?this.files[0].name:'Choose file…'">
      </label>
      <button class="darkbtn" style="width:100%;" onclick="uploadOperativeCert('${operativeId}','${prefix}')">Upload</button>
    </div>`;
}
// #337: small per-row icon showing where a certificate stands with OneDrive —
// a cloud for anything pulled in from (or already pushed out to) OneDrive,
// and a phone for a manual upload still sitting local-only, awaiting the
// user to multi-select it and use "Upload to OneDrive".
function certSourceIconHtml(f){
  const onOneDrive = f.source==='onedrive' || !!f.pushed_to_onedrive_at;
  return onOneDrive
    ? `<span title="Synced with OneDrive" style="flex:0 0 auto;font-size:13px;line-height:1;">☁️</span>`
    : `<span title="Uploaded from phone — not yet pushed to OneDrive" style="flex:0 0 auto;font-size:13px;line-height:1;">📱</span>`;
}
// Shared "at a glance" summary — same stat-card row used on both the
// manager-facing operative detail (renderOperativeDetail) and the
// operative's own My Dashboard (renderOperativeDashboard), so a certificate
// count/expiry/missing-type picture reads identically in both places (part
// of aligning Operatives + Certifications into one coherent system).
// The standard requirement — every operative is expected to hold these
// four, regardless of what other certificates they happen to have. "Missing
// Types" on the summary cards counts against this fixed list, not the full
// CERT_CATEGORIES set (which includes site/role-specific extras like SMSTS).
const CERT_STANDARD_REQUIRED = ['working_at_height', 'asbestos_awareness', 'manual_handling', 'cscs_card'];
function operativeCertStats(certs){
  const now = new Date(); now.setHours(0,0,0,0);
  const in30 = new Date(now); in30.setDate(in30.getDate()+30);
  let expired = 0, expiringSoon = 0;
  certs.forEach(c=>{
    if(!c.expiry_date) return;
    const d = new Date(c.expiry_date+'T00:00:00');
    if(d < now) expired++;
    else if(d <= in30) expiringSoon++;
  });
  const gotCats = new Set(certs.map(c=>c.category));
  const missingKeys = CERT_STANDARD_REQUIRED.filter(k=>!gotCats.has(k));
  return {total: certs.length, expired, expiringSoon, missing: missingKeys.length, missingKeys};
}
let certMissingInfoOpen = false;
window.toggleCertMissingInfo = function(){ certMissingInfoOpen = !certMissingInfoOpen; render(); };
function operativeCertSummaryCardsHtml(certs){
  const s = operativeCertStats(certs);
  const stat = (value, label, warnIf, dangerIf, onclick) => `
    <div class="card" style="flex:1;min-width:84px;text-align:center;${onclick?'cursor:pointer;':''}" ${onclick?`onclick="${onclick}"`:''}>
      <div style="font-size:22px;font-weight:800;color:${dangerIf&&value?'var(--red)':(warnIf&&value?'var(--warn)':'var(--ink)')};">${value}</div>
      <div class="meta" style="margin-top:2px;overflow-wrap:break-word;">${label}</div>
    </div>`;
  return `
    <div class="row-gap" style="flex-wrap:wrap;margin-bottom:${certMissingInfoOpen?'6px':'16px'};">
      ${stat(s.total, s.total===1?'Certificate':'Certificates')}
      ${stat(s.expiringSoon, 'Expiring Soon', true, false)}
      ${stat(s.expired, 'Expired', false, true)}
      ${stat(s.missing, 'Missing Types', true, false, 'toggleCertMissingInfo()')}
    </div>
    ${certMissingInfoOpen ? `
      <p class="stub" style="margin:0 0 16px;">${s.missingKeys.length ? 'Missing: '+s.missingKeys.map(k=>escapeHtml(certCategoryLabel(k))).join(', ') : 'All standard requirements are on file.'}</p>
    ` : ''}
  `;
}
// #382: every certificate list — compact or not — is now the same genuinely
// single-line-per-certificate row: name + meta on the left, expiry/category
// (if manageable) in the middle, a View icon, and a "▾" dropdown (Rename /
// Delete) on the right, replacing both the old bulkier 3-row full-size card
// and the standalone bin icon. No file-type badge anymore — it wasn't
// telling anyone anything they needed on a day-to-day basis.
// #392: some existing uploads (mostly older OneDrive-synced rows) have no
// `name` value stored at all — with nothing to fall back to, both the row's
// title and its meta line rendered fully blank. Falls back to a cleaned-up
// version of the storage path's file name, so every row shows *something*
// recognisable regardless of how the record was created.
function certDisplayName(f){
  if(f.name && f.name.trim()) return f.name;
  if(f.storage_path){
    const base = f.storage_path.split('/').pop() || '';
    const cleaned = base.replace(/^[0-9a-fA-F-]{36}-/, '');
    try{ return decodeURIComponent(cleaned) || base || 'Certificate'; }catch(e){ return cleaned || base || 'Certificate'; }
  }
  return 'Certificate';
}
function operativeCertListHtml(certs, canManage, opts){
  opts = opts || {};
  if(!certs.length) return `<div class="empty">No certificates yet.</div>`;
  const byCat = {};
  certs.forEach(c=>{ (byCat[c.category]=byCat[c.category]||[]).push(c); });
  return CERT_CATEGORIES.map(cat=>{
    const list = byCat[cat.key]||[];
    if(!list.length) return '';
    return `
      <p class="field-label" style="margin:10px 0 4px;">${cat.label} (${list.length})</p>
      ${list.map(f=>`
        <div class="card" style="margin-bottom:4px;padding:6px 8px;">
          <div style="display:flex;align-items:center;gap:6px;">
            ${opts.selectable?`<input type="checkbox" style="width:14px;height:14px;flex:0 0 14px;margin:0;" ${certSelectedIds.has(f.id)?'checked':''} onchange="toggleCertSelect('${f.id}')">`:''}
            ${certSourceIconHtml(f)}
            <div style="min-width:0;flex:1;">
              <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;">${escapeHtml(certDisplayName(f))}</div>
              <div class="stub" style="font-size:9.5px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.category==='other'&&f.other_type_description?escapeHtml(f.other_type_description)+' · ':''}${f.expiry_date?'Expires '+new Date(f.expiry_date+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):escapeHtml(certDisplayName(f))}</div>
            </div>
            ${canManage?`
              <div style="flex:0 0 78px;width:78px;max-width:78px;overflow:hidden;">
                <input type="date" id="certExpiry_${f.id}" value="${f.expiry_date||''}" placeholder="Expiry" title="Expiry date" style="display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:3px 2px;font-size:9px;border:1.5px solid var(--line);border-radius:6px;" onclick="openDatePickerRow(this)" onchange="setOperativeCertExpiry('${f.id}',this.value,this)" onblur="certExpiryPickerClosed()">
              </div>
            `:''}
            <div class="taskicon" style="flex:0 0 auto;width:24px;height:24px;font-size:13px;position:relative;top:-2px;" title="View" onclick="viewOperativeCertFile('${jsAttr(f.storage_path)}','${jsAttr(certDisplayName(f))}')">👁</div>
            ${canManage?rowActionsMenuHtml('certrow-'+f.id, `
              <div class="statusmenu-item" onclick="rowActionsMenuOpenFor=null;renameOperativeCertFile('${f.id}','${jsAttr(certDisplayName(f))}')">✎ Rename</div>
              <div class="statusmenu-item danger" onclick="rowActionsMenuOpenFor=null;deleteOperativeCertFile('${f.id}','${jsAttr(f.storage_path)}')">🗑 Delete</div>
              <div class="statusmenu-item" style="cursor:default;" onclick="event.stopPropagation();">
                <div style="margin-bottom:4px;">Cert Type</div>
                <select class="stub" title="Category" style="width:100%;box-sizing:border-box;padding:5px 6px;border:1.5px solid var(--line);border-radius:6px;background:var(--card);font-size:11px;" onchange="changeOperativeCertCategory('${f.id}',this.value)">
                  ${CERT_CATEGORIES.map(c=>`<option value="${c.key}" ${c.key===f.category?'selected':''}>${c.label}</option>`).join('')}
                </select>
              </div>
            `):''}
          </div>
        </div>
      `).join('')}
    `;
  }).join('');
}
window.uploadOperativeCert = async function(operativeId, prefix){
  const catSel = document.getElementById(prefix+'CertCategory');
  const fileInput = document.getElementById(prefix+'CertFile');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if(!file){ toast('Choose a file to upload.'); return; }
  const category = catSel ? catSel.value : 'other';
  const otherDescEl = document.getElementById(prefix+'CertOtherDesc');
  const otherDesc = category==='other' && otherDescEl ? otherDescEl.value.trim() : '';
  const expiryEl = document.getElementById(prefix+'CertExpiry');
  const expiry = expiryEl && expiryEl.value ? expiryEl.value : null;
  const path = ME.org_id+'/'+operativeId+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('certifications', path, file, file.type || 'application/octet-stream');
  if(!stored) return;
  const rows = await dbInsert('operative_certifications', {org_id: ME.org_id, operative_id: operativeId, category, other_type_description: otherDesc||null, expiry_date: expiry, name: file.name, storage_path: stored, size: file.size, source:'upload', uploaded_by: ME.id});
  if(rows){ toast('Certificate uploaded'); certAddOpenFor[prefix] = false; render(); }
};
window.viewOperativeCertFile = async function(storagePath, name){
  try{
    const res = await sbFetchOD('/functions/v1/operative-certification-file-access', {method:'POST', body: JSON.stringify({storage_path:storagePath})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Could not open file — '+(d.error||res.status)); return; }
    viewDrawing(d.url, /\.(png|jpe?g|gif|webp)$/i.test(name), name);
  }catch(e){ toast('Could not open file.'); }
};
window.deleteOperativeCertFile = async function(fileId, storagePath){
  if(!await customConfirm('Delete this certificate? This can\'t be undone.')) return;
  const ok = await dbDelete('operative_certifications', fileId);
  if(ok){
    if(storagePath){ try{ await sbFetch('/storage/v1/object/certifications/'+storagePath, {method:'DELETE'}); }catch(e){ /* non-fatal */ } }
    toast('Certificate deleted');
    render();
  }
};
window.renameOperativeCertFile = async function(fileId, currentName){
  const next = await customPrompt('Rename certificate', currentName);
  if(next===null) return;
  const name = next.trim();
  if(!name){ toast('Name cannot be blank.'); return; }
  const row = await dbUpdate('operative_certifications', fileId, {name});
  if(row){ toast('Renamed'); render(); }
};
window.changeOperativeCertCategory = async function(fileId, category){
  const row = await dbUpdate('operative_certifications', fileId, {category});
  if(row){ toast('Moved to '+certCategoryLabel(category)); render(); }
};
// #325: expiry date is now editable on every certification record, not just
// at upload time — this lets a PM/admin retroactively set/change/clear the
// expiry on an existing cert, and the value flows straight into the
// Training Matrix export since that reads expiry_date off the same row.
// The phone's date picker fires "change" every time the day/month/year is
// moved, not just when the tick/Done is pressed — and this used to re-render
// the whole page on each one, which destroyed the input and slammed the
// calendar shut mid-pick. Each change is still saved straight away, but
// while the picker's input is still focused nothing is re-rendered; the
// refresh (and the confirmation toast) waits until the picker is actually
// closed (see certExpiryPickerClosed, wired to the input's blur).
let certExpiryPendingToast = null;
window.setOperativeCertExpiry = async function(fileId, value, el){
  const expiry = value ? value : null;
  const row = await dbUpdate('operative_certifications', fileId, {expiry_date: expiry});
  if(!row) return;
  const msg = expiry ? 'Expiry date set' : 'Expiry date cleared';
  if(el && document.activeElement === el && document.body.contains(el)){ certExpiryPendingToast = msg; return; }
  certExpiryPendingToast = null;
  toast(msg); render();
};
window.certExpiryPickerClosed = function(){
  if(!certExpiryPendingToast) return;
  const msg = certExpiryPendingToast; certExpiryPendingToast = null;
  toast(msg); render();
};
// Shared selection bar (#276) — appears above any certificate listing that
// opts into selection, showing Export (bundles the ticked certs into one
// PDF) and Email (sends that PDF) as two distinct actions, exactly like the
// existing PPE multi-select pattern (#198).
let certBulkExportBusy = false, certBulkEmailBusy = false, certBulkPushBusy = false;
// #337: a third bulk action, "Upload to OneDrive" — only shown when an
// operativeId is supplied (the manual-people lists don't have a OneDrive
// folder to push to), and only actually pushes whichever of the selected
// certs are still phone-only (source='upload', never pushed).
function certListSelectionBarHtml(certs, key, operativeId, pmList){
  const idsHere = new Set(certs.map(c=>c.id));
  const selectedHere = Array.from(certSelectedIds).filter(id=>idsHere.has(id));
  if(!selectedHere.length) return '';
  const byId = {}; certs.forEach(c=>{ byId[c.id]=c; });
  const pushableCount = operativeId ? selectedHere.filter(id=>byId[id] && byId[id].source==='upload' && !byId[id].pushed_to_onedrive_at).length : 0;
  const pickerOpen = !!certEmailPickerOpenFor[key];
  const recipChoice = certEmailRecipientChoiceFor[key] || '';
  return `
    <div class="row-gap" style="margin-bottom:${pickerOpen?'8px':(operativeId?'8px':'10px')};">
      <button class="darkbtn" style="flex:1;font-size:11.5px;padding:7px;" ${certBulkExportBusy?'disabled':''} onclick='exportSelectedCerts(${JSON.stringify(selectedHere)})'>${certBulkExportBusy?'Building…':`Export ${selectedHere.length} (PDF)`}</button>
      <button class="ghostbtn exportbtn" style="flex:1;font-size:11.5px;padding:7px;" onclick="toggleCertEmailPickerFor('${key}')">Email ${selectedHere.length}</button>
    </div>
    ${pickerOpen ? `
    <div class="card" style="margin-bottom:10px;padding:10px;">
      <p class="field-label" style="margin-bottom:6px;">Send to</p>
      <select class="stub" style="width:100%;padding:8px;border:1.5px solid var(--line);border-radius:8px;background:var(--card);margin-bottom:8px;" onchange="setCertEmailRecipientChoiceFor('${key}',this.value)">
        <option value="">Myself (${escapeHtml(ME.email)})</option>
        ${(pmList||[]).map(p=>`<option value="${p.id}" ${recipChoice===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
        <option value="custom" ${recipChoice==='custom'?'selected':''}>Custom email address…</option>
      </select>
      ${recipChoice==='custom' ? `<input type="text" placeholder="name@example.com" value="${escapeHtml(certEmailCustomAddrFor[key]||'')}" oninput="certEmailCustomAddrFor['${key}']=this.value;" style="width:100%;padding:8px;border:1.5px solid var(--line);border-radius:8px;margin-bottom:8px;box-sizing:border-box;">` : ''}
      ${recipChoice ? `<label style="display:flex;align-items:center;gap:8px;padding:2px 2px 8px;font-size:13px;font-weight:600;cursor:pointer;"><input type="checkbox" ${certEmailCcMeFor[key]?'checked':''} onchange="certEmailCcMeFor['${key}']=this.checked;" style="width:18px;height:18px;flex:none;"> CC me a copy</label>` : ''}
      <button class="darkbtn" style="width:100%;" ${certBulkEmailBusy?'disabled':''} onclick='sendCertEmailFor(${JSON.stringify(key)},${JSON.stringify(selectedHere)})'>${certBulkEmailBusy?'Sending…':'Send'}</button>
    </div>
    ` : ''}
    ${operativeId ? `
    <div class="row-gap" style="margin-bottom:10px;">
      <button class="ghostbtn exportbtn" style="flex:1;font-size:11.5px;padding:7px;" ${certBulkPushBusy||!pushableCount?'disabled':''} onclick='pushSelectedCertsToOneDrive(${JSON.stringify(selectedHere)},${JSON.stringify(operativeId)})'>${certBulkPushBusy?'Uploading…':(pushableCount?`☁ Upload ${pushableCount} to OneDrive`:'☁ Upload to OneDrive')}</button>
    </div>
    ` : ''}
  `;
}
// Bundles the given certificate files into one PDF — PDFs get their pages
// copied straight in, images get placed on their own page under a heading;
// anything else (e.g. a Word doc synced from OneDrive) gets a placeholder
// note since it can't be flattened into a PDF page client-side.
async function buildCertBundlePdf(certIds){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const certs = await dbSelect('operative_certifications', 'id=in.('+certIds.join(',')+')&select=*');
  const merged = await PDFLib.PDFDocument.create();
  const fonts = await havsPdfFonts(merged);
  for(const c of certs){
    try{
      const res = await sbFetchOD('/functions/v1/operative-certification-file-access', {method:'POST', body: JSON.stringify({storage_path:c.storage_path})});
      const d = await res.json();
      if(!res.ok || d.error || !d.url) continue;
      const fr = await fetch(d.url);
      const bytes = new Uint8Array(await fr.arrayBuffer());
      if(/\.pdf$/i.test(c.name)){
        const src = await PDFLib.PDFDocument.load(bytes);
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(p=>merged.addPage(p));
      } else if(/\.(png|jpe?g)$/i.test(c.name)){
        let img; try{ img = await merged.embedJpg(bytes); }catch(e){ img = await merged.embedPng(bytes); }
        const dim = img.scale(1);
        const PAGE_W=595.28, PAGE_H=841.89, MARGIN=44;
        const maxW = PAGE_W-2*MARGIN, maxH = PAGE_H-2*MARGIN-30;
        const s = Math.min(maxW/dim.width, maxH/dim.height, 1);
        const page = merged.addPage([PAGE_W,PAGE_H]);
        page.drawText(c.name, {x:MARGIN, y:PAGE_H-MARGIN+8, size:10, font:fonts.bold, color:fonts.INK});
        page.drawImage(img, {x:MARGIN, y:PAGE_H-MARGIN-30-dim.height*s, width:dim.width*s, height:dim.height*s});
      } else {
        const page = merged.addPage([595.28,841.89]);
        page.drawText(c.name, {x:44, y:780, size:12, font:fonts.bold, color:fonts.INK});
        page.drawText('This file type can\'t be previewed here — open it from the app to view.', {x:44, y:760, size:9, font:fonts.reg, color:fonts.SLATE});
      }
    }catch(e){ console.error('Cert bundle: skipped', c && c.name, e); }
  }
  const bytes = await merged.save();
  const filename = exportFilename('', 'Certificates ('+certs.length+')', 'pdf');
  return {bytes, filename};
}
window.exportSelectedCerts = async function(ids){
  if(!ids || !ids.length) return;
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  certBulkExportBusy = true; render();
  try{
    const {bytes, filename} = await buildCertBundlePdf(ids);
    await deliverPdf(bytes, filename);
    ids.forEach(id=>certSelectedIds.delete(id));
  }catch(e){ console.error(e); toast('Could not build the combined PDF.'); }
  certBulkExportBusy = false; render();
};
window.emailSelectedCerts = async function(ids, recipient){
  if(!ids || !ids.length) return;
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  certBulkEmailBusy = true; render();
  try{
    const {bytes, filename} = await buildCertBundlePdf(ids);
    let binary=''; const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk));
    const payload = Object.assign({filename, content_base64:btoa(binary)}, recipient||{});
    const res = await sbFetch('/functions/v1/send-certificates-email', {method:'POST', timeoutMs:60000, body: JSON.stringify(payload)});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Email failed — '+(d.error||res.status)); }
    else { toast('Certificates emailed to '+(d.to||ME.email)); ids.forEach(id=>certSelectedIds.delete(id)); }
  }catch(e){ toast('Email failed — could not reach the server.'); }
  certBulkEmailBusy = false; render();
};
// #337: pushes only the explicitly ticked, still-phone-only certificates up
// to OneDrive (source='upload' rows with no item_id yet) — unlike Sync Now,
// which is pull-only. Reuses the same edge function with cert_ids set, so
// it only touches the rows the user selected.
window.pushSelectedCertsToOneDrive = async function(ids, operativeId){
  if(!ids || !ids.length) return;
  certBulkPushBusy = true; render();
  try{
    const res = await sbFetch('/functions/v1/sync-operative-certification', {method:'POST', body: JSON.stringify({operative_id: operativeId, cert_ids: ids})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Upload to OneDrive failed — '+(d.error||res.status)); }
    else{
      toast(d.pushed ? `Uploaded ${d.pushed} to OneDrive.` : 'Nothing to upload — already on OneDrive.');
      ids.forEach(id=>certSelectedIds.delete(id));
    }
  }catch(e){ toast('Upload to OneDrive failed — could not reach the server.'); }
  certBulkPushBusy = false; render();
};
window.syncOperativeCertifications = async function(operativeId){
  operativeCertSyncBusy[operativeId] = true; render();
  try{
    const res = await sbFetch('/functions/v1/sync-operative-certification', {method:'POST', body: JSON.stringify({operative_id: operativeId})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Sync failed — '+(d.error||res.status)); }
    else{
      toast(`Synced — ${d.pulled||0} pulled in from OneDrive.`);
      const p = PROFILES[operativeId]; if(p) p.onedrive_last_synced_at = new Date().toISOString();
    }
  }catch(e){ toast('Sync failed — could not reach the server.'); }
  operativeCertSyncBusy[operativeId] = false; render();
};

let operativeSearchQuery = '';
// #391: this page's site/cert counts were being fetched fresh — as two
// whole-table, cross-org queries — on every single keystroke in the search
// box (oninput called render(), which re-enters this function). Typing a
// name fired dozens of unfiltered network round-trips. Counts don't change
// tap to tap, so cache them for a short TTL like loadAllProfiles does, and
// debounce the search box itself so filtering only actually re-renders once
// typing pauses instead of on every character.
let _opListCountsCache = null, _opListCountsAt = 0;
const OPLIST_COUNTS_TTL_MS = 30000;
let _opSearchDebounceTimer = null;
window.onOperativeSearchInput = function(v){
  operativeSearchQuery = v;
  clearTimeout(_opSearchDebounceTimer);
  _opSearchDebounceTimer = setTimeout(render, 250);
};
async function renderOperativesList(){
  const __gen = RENDER_GEN;
  const opListFrom = routeQuery().get('from');
  await loadAllProfiles();
  const operatives = Object.values(PROFILES).filter(p=>p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  if(!_opListCountsCache || (Date.now()-_opListCountsAt) >= OPLIST_COUNTS_TTL_MS){
    const [assignRows, certRows] = await Promise.all([
      dbSelect('site_assignments', 'select=site_id,user_id'),
      dbSelect('operative_certifications', 'org_id=eq.'+ME.org_id+'&select=operative_id'),
    ]);
    _opListCountsCache = {assignRows, certRows};
    _opListCountsAt = Date.now();
  }
  const {assignRows, certRows} = _opListCountsCache;
  const siteCountByOp = {};
  assignRows.forEach(r=>{ (siteCountByOp[r.user_id]=siteCountByOp[r.user_id]||new Set()).add(r.site_id); });
  const certCountByOp = {};
  certRows.forEach(r=>{ certCountByOp[r.operative_id] = (certCountByOp[r.operative_id]||0)+1; });
  const q = operativeSearchQuery.trim().toLowerCase();
  const filtered = q ? operatives.filter(o=>o.name.toLowerCase().includes(q)) : operatives;

  // #notif-review-2026-09 (Operative Tools move): was a dropdown buried in
  // Admin Centre — now lives here, below the operative list, since this is
  // where a PM already is when they're thinking about operatives generally.
  // Editing an individual operative's own tools also works from their own
  // page (renderOperativeDetail) — same underlying operative_tools rows and
  // the same add/delete/photo handlers either way, just two doors in.
  let operativeToolsHtmlBlock = '';
  if(operativeToolsListOpen){
    const allTools = await dbSelect('operative_tools', 'org_id=eq.'+ME.org_id+'&order=created_at.asc');
    const toolsByUser = {};
    allTools.forEach(t=>{ (toolsByUser[t.user_id]=toolsByUser[t.user_id]||[]).push(t); });
    operativeToolsHtmlBlock = operatives.map(p=>{
      const tools = toolsByUser[p.id]||[];
      return `
        <p class="ddrow" id="oplist-optool-${p.id}" style="margin-top:0;" onclick="toggleOperativeToolsUser('${p.id}')"><span class="arrow">${operativeToolsOpenByUser[p.id]?'▼':'▶'}</span> ${escapeHtml(p.name)} (${tools.length})</p>
        ${operativeToolsOpenByUser[p.id] ? `
          <div class="card" style="margin-bottom:10px;">
            ${tools.map(t=>`
              <div class="sitecard" style="padding:8px 10px;">
                ${t.photo_path ? `<img src="${publicUrl('operative-tools', t.photo_path)}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;flex:0 0 40px;border:1px solid var(--line);" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';">` : `<div class="swatch" style="flex:0 0 40px;width:40px;height:40px;">🔧</div>`}
                <div class="info"><div class="name">${escapeHtml(t.name)}</div>${t.serial_number?`<div class="addr">Serial: ${escapeHtml(t.serial_number)}</div>`:''}</div>
                <span class="stub" style="text-decoration:underline;cursor:pointer;flex:0 0 auto;" onclick="document.getElementById('opToolEditPhoto-${t.id}').click()">${operativeToolsEditPhotoBusyId===t.id?'Uploading…':(t.photo_path?'Change photo':'Add photo')}</span>
                <input type="file" id="opToolEditPhoto-${t.id}" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="onOperativeToolsEditPhotoChosen(this,'${t.id}','${p.id}')">
                <div class="taskicon danger" onclick="deleteOperativeTool('${t.id}','${jsAttr(t.photo_path||'')}')">🗑</div>
              </div>
            `).join('') || `<div class="empty" style="padding:10px;">No tools logged yet.</div>`}
            ${operativeToolsAddOpenFor===p.id ? `
              <div class="formfield" style="margin-top:10px;"><input type="text" id="opToolName-${p.id}" value="${escapeHtml(operativeToolsNameDraft)}" placeholder="Tool name, e.g. Impact Driver"></div>
              <div class="formfield"><input type="text" id="opToolSerial-${p.id}" value="${escapeHtml(operativeToolsSerialDraft)}" placeholder="Serial / item number"></div>
              <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('opToolPhotoInput-${p.id}').click()">${operativeToolsPhotoFile ? 'Photo chosen: '+escapeHtml(operativeToolsPhotoFile.name) : 'Choose Photo'}</div>
              <input type="file" id="opToolPhotoInput-${p.id}" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="onOperativeToolsPhotoChosen(this,'${p.id}')">
              <div class="row-gap">
                <button class="darkbtn" style="flex:1;" onclick="addOperativeToolFor('${p.id}')">Save Tool</button>
                <button class="ghostbtn" style="flex:1;" onclick="operativeToolsAddOpenFor=null;operativeToolsPhotoFile=null;operativeToolsNameDraft='';operativeToolsSerialDraft='';render()">Cancel</button>
              </div>
            ` : `
              <button class="darkbtn" style="margin-top:10px;padding:9px 14px;font-size:12.5px;text-transform:none;letter-spacing:.01em;border-radius:9px;" onclick="operativeToolsAddOpenFor='${p.id}';operativeToolsPhotoFile=null;render()">+ Add Tool</button>
            `}
          </div>
        ` : ''}
      `;
    }).join('') || `<div class="empty">No operatives yet.</div>`;
  }

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <input type="text" placeholder="Search operatives…" value="${escapeHtml(operativeSearchQuery)}" oninput="onOperativeSearchInput(this.value)" style="width:100%;padding:12px;border:1.5px solid var(--line);border-radius:10px;margin-bottom:14px;">
    <button class="ghostbtn" style="width:100%;margin-bottom:14px;" onclick="exportTrainingMatrixExcel()">📊 Export Training Matrix (Excel)</button>
    <button class="ghostbtn" style="width:100%;margin-bottom:14px;" onclick="exportTrainingMatrixPdf()">📄 Export Training Matrix (PDF)</button>
    ${filtered.length ? filtered.map(o=>`
      <div class="sitecard" style="cursor:pointer;" onclick="go('#/operatives/${o.id}${opListFrom ? '?listFrom='+encodeURIComponent(opListFrom) : ''}')">
        <div class="swatch">${(o.name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</div>
        <div class="info"><div class="name">${escapeHtml(o.name)}</div><div class="addr">${(siteCountByOp[o.id]?siteCountByOp[o.id].size:0)} site${(siteCountByOp[o.id]&&siteCountByOp[o.id].size===1)?'':'s'} · ${certCountByOp[o.id]||0} certificate${(certCountByOp[o.id]||0)===1?'':'s'}${o.phone?' · 📞 '+escapeHtml(o.phone):''}</div></div>
      </div>
    `).join('') : `<div class="empty">No operatives found.</div>`}

    <p class="ddrow" style="margin-top:18px;" onclick="toggleOperativeToolsListSection()"><span class="arrow">${operativeToolsListOpen?'▼':'▶'}</span> Operative Tools</p>
    ${operativeToolsListOpen ? `
    <div class="card">
      <p class="stub" style="margin:0 0 10px;">Each operative's own logged power tools — name, serial/item number, and photo. Used to auto-populate PUWER Tool Inspections.</p>
      ${operativeToolsHtmlBlock}
    </div>
    ` : ''}
  `, {title:'Operatives', back: opListFrom || '#/team', tabs:false}); }
  // Jumped in from PUWER's "Open in Operatives" link — scroll straight to
  // that operative's row inside the now-expanded Operative Tools section.
  if(pendingAdminOperativeToolsScrollUserId){
    const targetUserId = pendingAdminOperativeToolsScrollUserId; pendingAdminOperativeToolsScrollUserId = null;
    const el = document.getElementById('oplist-optool-'+targetUserId);
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }
}
let operativeToolsListOpen = false;
window.toggleOperativeToolsListSection = function(){ operativeToolsListOpen = !operativeToolsListOpen; render(); };
let operativeNameEditOpen = {};
let operativePhoneEditOpen = {};
window.toggleOperativeNameEdit = function(operativeId){
  operativeNameEditOpen[operativeId] = !operativeNameEditOpen[operativeId];
  render();
};
window.toggleOperativePhoneEdit = function(operativeId){
  operativePhoneEditOpen[operativeId] = !operativePhoneEditOpen[operativeId];
  render();
};
async function renderOperativeDetail(operativeId){
  const __gen = RENDER_GEN;
  const fromSiteId = routeQuery().get('from');
  const listFrom = routeQuery().get('listFrom');
  await loadAllProfiles();
  const operative = PROFILES[operativeId];
  if(!operative){ go('#/operatives'); return; }
  const [assignedRows, certs, myTools] = await Promise.all([
    dbSelect('site_assignments', 'user_id=eq.'+operativeId+'&select=site_id'),
    dbSelect('operative_certifications', 'operative_id=eq.'+operativeId+'&order=created_at.desc'),
    dbSelect('operative_tools', 'user_id=eq.'+operativeId+'&order=created_at.asc'),
  ]);
  const siteIds = new Set(assignedRows.map(r=>r.site_id));
  const liveSiteCount = SITES.filter(s=>siteIds.has(s.id) && siteStatusKey(s)==='live').length;
  const pmList = Object.values(PROFILES).filter(p=>isManager(p)).sort((a,b)=>a.name.localeCompare(b.name));
  const folderLinked = !!operative.onedrive_folder_id;
  const syncBusy = !!operativeCertSyncBusy[operativeId];

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="sectiontitle" style="margin-top:0;">Details</p>
    <div class="card" style="margin-bottom:16px;">
      <label class="field-label">Name</label>
      ${operativeNameEditOpen[operativeId] ? `
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input type="text" id="opName_${operativeId}" value="${escapeHtml(operative.name||'')}" placeholder="Full name" style="flex:2;min-width:0;">
        <button class="darkbtn" style="flex:1;min-width:0;width:auto;padding:10px 6px;" onclick="saveOperativeName('${operativeId}')">Save</button>
      </div>` : `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;">
        <div style="font-weight:700;font-size:15px;">${escapeHtml(operative.name||'—')}</div>
        <button class="darkbtn" style="flex:0 0 auto;width:auto;padding:8px 14px;" onclick="toggleOperativeNameEdit('${operativeId}')">Edit</button>
      </div>`}
      <label class="field-label">Contact number</label>
      ${operativePhoneEditOpen[operativeId] ? `
      <div style="display:flex;gap:8px;">
        <input type="tel" id="opPhone_${operativeId}" value="${escapeHtml(operative.phone||'')}" placeholder="e.g. 07123 456789" style="flex:2;min-width:0;">
        <button class="darkbtn" style="flex:1;min-width:0;width:auto;padding:10px 6px;" onclick="saveOperativePhone('${operativeId}')">Save</button>
      </div>` : `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="font-weight:700;font-size:15px;">${escapeHtml(operative.phone||'—')}</div>
        <button class="darkbtn" style="flex:0 0 auto;width:auto;padding:8px 14px;" onclick="toggleOperativePhoneEdit('${operativeId}')">Edit</button>
      </div>`}
    </div>

    <div class="row-gap" style="flex-wrap:wrap;margin-bottom:16px;">
      <div class="card" style="flex:1;min-width:110px;text-align:center;">
        <div style="font-size:26px;font-weight:800;color:var(--ink);">${siteIds.size}</div>
        <div class="meta" style="margin-top:2px;">Sites Assigned</div>
      </div>
      <div class="card" style="flex:1;min-width:110px;text-align:center;">
        <div style="font-size:26px;font-weight:800;color:var(--ink);">${liveSiteCount}</div>
        <div class="meta" style="margin-top:2px;">Live Now</div>
      </div>
    </div>

    ${operativeCertSummaryCardsHtml(certs)}

    <p class="sectiontitle" style="margin-top:0;">OneDrive Sync</p>
    ${folderLinked ? `
      <p class="stub" style="margin:0 0 4px;color:var(--ok);">📁 Linked to "${escapeHtml(operative.onedrive_folder_name||'')}"</p>
      <p class="stub" style="margin:0 0 10px;">${operative.onedrive_last_synced_at ? 'Last synced '+new Date(operative.onedrive_last_synced_at).toLocaleString('en-GB') : 'Not synced yet.'}</p>
      <p class="stub" style="margin:0 0 10px;">Tip: Sync Now pulls in anything new added to this operative's OneDrive folder. To send a phone-uploaded certificate the other way, tick it below and use "Upload to OneDrive".</p>
      <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;">
        <button class="darkbtn" style="flex:1;" ${syncBusy?'disabled':''} onclick="syncOperativeCertifications('${operativeId}')">${syncBusy?'Syncing…':'🔄 Sync Now'}</button>
        <div style="position:relative;flex:0 0 auto;" data-opfoldermenu-root>
          <span class="taskicon" title="More actions" onclick="event.stopPropagation();toggleOpFolderMenu('${operativeId}')">▾</span>
          ${opFolderMenuOpenFor===operativeId ? `
          <div class="statusmenu" style="right:0;left:auto;">
            <div class="statusmenu-item" onclick="opFolderMenuOpenFor=null;startOperativeFolderPicker('${operativeId}')">Change Folder</div>
            <div class="statusmenu-item" onclick="opFolderMenuOpenFor=null;unlinkOperativeFolder('${operativeId}')">Unlink</div>
          </div>
          ` : ''}
        </div>
      </div>
    ` : `
      <p class="stub" style="margin:0 0 10px;">Link this operative's own OneDrive folder to sync their certificates — anything added to it gets pulled in here on Sync Now, and a certificate uploaded here can be sent to it by ticking it and choosing "Upload to OneDrive".</p>
      <button class="darkbtn" style="margin-bottom:16px;" onclick="startOperativeFolderPicker('${operativeId}')">Link OneDrive Folder</button>
    `}

    <p class="sectiontitle">Certificates</p>
    <p class="stub" style="margin:0 0 10px;">This is ${escapeHtml(operative.name)}'s record in the company Training Matrix — everything here rolls straight into the exports below and into their own My Dashboard.</p>
    ${certListSelectionBarHtml(certs, 'op-'+operativeId, operativeId, pmList)}
    ${certAddToggleHtml(operativeId, 'opdet')}
    ${operativeCertListHtml(certs, true, {selectable:true})}
    <button class="ghostbtn" style="width:100%;margin-top:14px;" onclick="exportTrainingMatrixExcel()">📊 Export Full Training Matrix (Excel)</button>

    <p class="sectiontitle">Tools</p>
    <p class="stub" style="margin:0 0 10px;">${escapeHtml(operative.name)}'s own logged power tools — name, serial/item number, and photo. Used to auto-populate PUWER Tool Inspections.</p>
    <div class="card">
      ${myTools.map(t=>`
        <div class="sitecard" style="padding:8px 10px;">
          ${t.photo_path ? `<img src="${publicUrl('operative-tools', t.photo_path)}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;flex:0 0 40px;border:1px solid var(--line);" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';">` : `<div class="swatch" style="flex:0 0 40px;width:40px;height:40px;">🔧</div>`}
          <div class="info"><div class="name">${escapeHtml(t.name)}</div>${t.serial_number?`<div class="addr">Serial: ${escapeHtml(t.serial_number)}</div>`:''}</div>
          <span class="stub" style="text-decoration:underline;cursor:pointer;flex:0 0 auto;" onclick="document.getElementById('opToolEditPhoto-${t.id}').click()">${operativeToolsEditPhotoBusyId===t.id?'Uploading…':(t.photo_path?'Change photo':'Add photo')}</span>
          <input type="file" id="opToolEditPhoto-${t.id}" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="onOperativeToolsEditPhotoChosen(this,'${t.id}','${operativeId}')">
          <div class="taskicon danger" onclick="deleteOperativeTool('${t.id}','${jsAttr(t.photo_path||'')}')">🗑</div>
        </div>
      `).join('') || `<div class="empty" style="padding:10px;">No tools logged yet.</div>`}
      ${operativeToolsAddOpenFor===operativeId ? `
        <div class="formfield" style="margin-top:10px;"><input type="text" id="opToolName-${operativeId}" value="${escapeHtml(operativeToolsNameDraft)}" placeholder="Tool name, e.g. Impact Driver"></div>
        <div class="formfield"><input type="text" id="opToolSerial-${operativeId}" value="${escapeHtml(operativeToolsSerialDraft)}" placeholder="Serial / item number"></div>
        <div class="ghostbtn" style="cursor:pointer;text-align:center;margin-bottom:10px;" onclick="document.getElementById('opToolPhotoInput-${operativeId}').click()">${operativeToolsPhotoFile ? 'Photo chosen: '+escapeHtml(operativeToolsPhotoFile.name) : 'Choose Photo'}</div>
        <input type="file" id="opToolPhotoInput-${operativeId}" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="onOperativeToolsPhotoChosen(this,'${operativeId}')">
        <div class="row-gap">
          <button class="darkbtn" style="flex:1;" onclick="addOperativeToolFor('${operativeId}')">Save Tool</button>
          <button class="ghostbtn" style="flex:1;" onclick="operativeToolsAddOpenFor=null;operativeToolsPhotoFile=null;operativeToolsNameDraft='';operativeToolsSerialDraft='';render()">Cancel</button>
        </div>
      ` : `
        <button class="darkbtn" style="margin-top:10px;padding:9px 14px;font-size:12.5px;text-transform:none;letter-spacing:.01em;border-radius:9px;" onclick="operativeToolsAddOpenFor='${operativeId}';operativeToolsPhotoFile=null;render()">+ Add Tool</button>
      `}
    </div>
  `, {title: operative.name, subtitle:'Operative', back: fromSiteId ? `#/site/${fromSiteId}/hs/certifications` : (listFrom ? `#/operatives?from=${encodeURIComponent(listFrom)}` : '#/operatives'), tabs:false}); }
}
// Site-scoped Certifications page. An operative sees just their own
// permanent certificate folder. A PM/admin sees their own certs, a compact
// row per operative assigned to this site (tap the name to open their full
// record, tap the "+" to quick-upload a certificate for them right here —
// no big drop-down), a shortcut to the org-wide Operatives dashboard, and
// the option to add someone who isn't a registered operative at all (e.g. a
// subcontractor) — their name and certificates are saved against this site
// so they aren't lost, but no operative account/login is ever created.
let siteCertOpen = {};
let siteCertManualOpen = {};
let siteCertManualAddOpen = false;
function operativeInitials(name){ return (name||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
// #383: renderSiteCertifications (manager + operative branches) and
// renderOperativesHub (the Dashboard/Certification picker) have both been
// folded into renderOperativeDashboard(siteId) below — one "Operative
// Dashboard" that shows the all-operatives site overview to a PM/admin and
// the operative's own personal dashboard to everyone else, with the H&S
// "Operatives" tile going straight there instead of via an intermediate
// picker. `#/site/:id/hs/certifications` is kept as a redirect below so any
// existing links/back-references still land somewhere valid.
function manualPersonCertUploadFormHtml(manualPersonId, prefix){
  return operativeCertUploadFormHtml(manualPersonId, prefix).replace(
    `onclick="uploadOperativeCert('${manualPersonId}','${prefix}')"`,
    `onclick="uploadManualPersonCert('${manualPersonId}','${prefix}')"`
  );
}
function manualCertAddToggleHtml(manualPersonId, prefix){
  return `
    <div class="drawheaderrow" style="margin-bottom:${certAddOpenFor[prefix]?'10px':'12px'};">
      <span>Add a certificate</span>
      <div class="roundplusbtn" onclick="toggleCertAddFor('${prefix}')">${certAddOpenFor[prefix]?'−':'+'}</div>
    </div>
    ${certAddOpenFor[prefix] ? manualPersonCertUploadFormHtml(manualPersonId, prefix) : ''}
  `;
}
window.addManualCertPerson = async function(siteId){
  const input = document.getElementById('manualCertPersonName');
  const name = input ? input.value.trim() : '';
  if(!name){ toast('Enter a name.'); return; }
  const rows = await dbInsert('certification_manual_people', {org_id: ME.org_id, site_id: siteId, name, created_by: ME.id});
  if(rows){ siteCertManualAddOpen = false; toast('Added — you can now upload certificates for them.'); render(); }
};
window.removeManualCertPerson = async function(manualPersonId){
  if(!await customConfirm('Remove this person? Their certificates will be deleted too — this can\'t be undone.')) return;
  const certs = await dbSelect('operative_certifications', 'manual_person_id=eq.'+manualPersonId+'&select=storage_path');
  const ok = await dbDelete('certification_manual_people', manualPersonId);
  if(ok){
    for(const c of certs){ if(c.storage_path){ try{ await sbFetch('/storage/v1/object/certifications/'+c.storage_path, {method:'DELETE'}); }catch(e){} } }
    toast('Removed');
    render();
  }
};
window.uploadManualPersonCert = async function(manualPersonId, prefix){
  const catSel = document.getElementById(prefix+'CertCategory');
  const fileInput = document.getElementById(prefix+'CertFile');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if(!file){ toast('Choose a file to upload.'); return; }
  const category = catSel ? catSel.value : 'other';
  const otherDescEl = document.getElementById(prefix+'CertOtherDesc');
  const otherDesc = category==='other' && otherDescEl ? otherDescEl.value.trim() : '';
  const expiryEl = document.getElementById(prefix+'CertExpiry');
  const expiry = expiryEl && expiryEl.value ? expiryEl.value : null;
  const path = ME.org_id+'/manual/'+manualPersonId+'/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('certifications', path, file, file.type || 'application/octet-stream');
  if(!stored) return;
  const rows = await dbInsert('operative_certifications', {org_id: ME.org_id, manual_person_id: manualPersonId, category, other_type_description: otherDesc||null, expiry_date: expiry, name: file.name, storage_path: stored, size: file.size, source:'upload', uploaded_by: ME.id});
  if(rows){ toast('Certificate uploaded'); certAddOpenFor[prefix] = false; render(); }
};

/* ---- Training Matrix export — all operatives × their certificate
   categories, branded Excel and PDF, named "Training Matrix" ---- */
async function trainingMatrixData(){
  await loadAllProfiles();
  const operatives = Object.values(PROFILES).filter(p=>p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  const certs = await dbSelect('operative_certifications', 'select=operative_id,category,name,expiry_date');
  const byOp = {};
  // #273: track a count AND the soonest expiry date per operative/category,
  // so the Training Matrix can surface expiry alongside "has this cert".
  certs.forEach(c=>{
    const bucket = (byOp[c.operative_id]=byOp[c.operative_id]||{});
    const entry = (bucket[c.category] = bucket[c.category] || {count:0, expiry:null});
    entry.count += 1;
    if(c.expiry_date && (!entry.expiry || c.expiry_date < entry.expiry)) entry.expiry = c.expiry_date;
  });
  return {operatives, byOp};
}
window.exportTrainingMatrixExcel = async function(){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return null; }
  const {operatives, byOp} = await trainingMatrixData();
  if(!operatives.length){ toast('No operatives to report.'); return; }
  const filename = exportFilename('', 'Training Matrix', 'xlsx');
  const rowFor = o=>{
    const row = {Operative: o.name};
    CERT_CATEGORIES.forEach(c=>{
      const entry = (byOp[o.id]||{})[c.key];
      row[c.label] = entry ? (entry.expiry ? 'Expires '+new Date(entry.expiry+'T00:00:00').toLocaleDateString('en-GB') : '✓') : '';
    });
    return row;
  };
  // Branded via ExcelJS (company logo top-right, brand-coloured header row,
  // org name as the sheet title) — same treatment as the Price Sheet Excel
  // export. Falls back to the plain SheetJS file below if ExcelJS isn't
  // available, same "nice-to-have, never blocks the export" rule as there.
  if((await loadLib('ExcelJS'))){
    try{
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Training Matrix');
      const cols = ['Operative', ...CERT_CATEGORIES.map(c=>c.label)];
      ws.columns = [{width:26}, ...CERT_CATEGORIES.map(()=>({width:18}))];
      ws.mergeCells(1,1,1,cols.length);
      ws.getCell('A1').value = ((ORG && ORG.name) || 'OpHUB') + ' — Training Matrix';
      ws.getCell('A1').font = {bold:true, size:14};
      ws.getCell('A2').value = 'Exported '+new Date().toLocaleDateString('en-GB');
      ws.getCell('A2').font = {italic:true, size:9, color:{argb:'FF7A7A7A'}};
      const headerRow = ws.addRow(cols);
      headerRow.eachCell(cell=>{
        cell.font = {bold:true, color:{argb:'FFFFFFFF'}};
        cell.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF'+((ORG && ORG.color_primary) || DEFAULT_BRAND1).replace('#','').toUpperCase()}};
      });
      operatives.forEach(o=>{
        const r = rowFor(o);
        ws.addRow(cols.map(c=>r[c]));
      });
      const logoUrl = ORG && ORG.logo_path ? publicUrl('org-logos', ORG.logo_path) : null;
      if(logoUrl){
        try{
          const res = await fetch(logoUrl);
          if(res.ok){
            const buf = await res.arrayBuffer();
            const ctype = (res.headers.get('content-type')||'').toLowerCase();
            const ext = ctype.includes('png') ? 'png' : (ctype.includes('gif') ? 'gif' : 'jpeg');
            const imageId = wb.addImage({buffer: buf, extension: ext});
            ws.addImage(imageId, {tl:{col:cols.length-1.1, row:0.05}, ext:{width:60, height:60}});
          }
        }catch(e){ /* logo is a nice-to-have — export still proceeds without it */ }
      }
      const buffer = await wb.xlsx.writeBuffer();
      await deliverExcelBuffer(buffer, filename);
      return;
    }catch(e){ /* fall through to the plain SheetJS export below */ }
  }
  const data = operatives.map(rowFor);
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:24}, ...CERT_CATEGORIES.map(()=>({wch:18}))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Training Matrix');
  await deliverExcelFile(wb, filename);
};
window.exportTrainingMatrixPdf = async function(){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  const {operatives, byOp} = await trainingMatrixData();
  if(!operatives.length){ toast('No operatives to report.'); return; }
  const pdfDoc = await PDFLib.PDFDocument.create();
  const fonts = await havsPdfFonts(pdfDoc);
  const {bold, reg, INK, SLATE, LINE} = fonts;
  const logoImg = await havsFetchLogoImg(pdfDoc);
  const PAGE_W = 841.89, PAGE_H = 595.28, MARGIN = 40, CONTENT_W = PAGE_W-2*MARGIN;
  const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1);
  const WHITE = PDFLib.rgb(1,1,1);
  const nameW = 0.28, colW = (1-nameW)/CERT_CATEGORIES.length;
  let page, y;
  function drawHeader(){
    page.drawRectangle({x:0, y:PAGE_H-70, width:PAGE_W, height:70, color:BRAND});
    if(logoImg){
      const dim = logoImg.scale(1); const s = 32/Math.max(dim.width, dim.height);
      const w = dim.width*s, h = dim.height*s;
      page.drawRectangle({x:MARGIN, y:PAGE_H-52, width:32, height:32, color:WHITE});
      page.drawImage(logoImg, {x:MARGIN+(32-w)/2, y:PAGE_H-52+(32-h)/2, width:w, height:h});
    }
    const textX = logoImg ? MARGIN+42 : MARGIN;
    page.drawText('TRAINING MATRIX', {x:textX, y:PAGE_H-30, size:9, font:bold, color:WHITE, opacity:0.85});
    page.drawText(((ORG && ORG.name) || ''), {x:textX, y:PAGE_H-48, size:13, font:bold, color:WHITE});
  }
  function drawFooter(){
    page.drawLine({start:{x:MARGIN,y:26}, end:{x:PAGE_W-MARGIN,y:26}, thickness:0.75, color:PDFLib.rgb(0.85,0.84,0.80)});
    page.drawText('Generated via OpHUB', {x:MARGIN, y:14, size:8, font:reg, color:SLATE});
  }
  function drawColHeaders(){
    let x = MARGIN;
    page.drawText('Operative', {x, y, size:9, font:bold, color:SLATE}); x += nameW*CONTENT_W;
    CERT_CATEGORIES.forEach(c=>{ page.drawText(c.label, {x, y, size:7.5, font:bold, color:SLATE}); x += colW*CONTENT_W; });
    y -= 8;
    page.drawLine({start:{x:MARGIN,y}, end:{x:PAGE_W-MARGIN,y}, thickness:0.75, color:LINE});
    y -= 14;
  }
  function newPage(){ page = pdfDoc.addPage([PAGE_W,PAGE_H]); drawHeader(); drawFooter(); y = PAGE_H-92; drawColHeaders(); }
  function ensureSpace(h){ if(y-h<40) newPage(); }
  newPage();
  operatives.forEach(o=>{
    ensureSpace(16);
    let x = MARGIN;
    let name = o.name||'';
    const maxChars = Math.floor((nameW*CONTENT_W)/5.2);
    if(name.length>maxChars) name = name.slice(0,maxChars-1)+'…';
    page.drawText(name, {x, y, size:9, font:reg, color:INK}); x += nameW*CONTENT_W;
    CERT_CATEGORIES.forEach(c=>{
      const entry = (byOp[o.id]||{})[c.key];
      // #273: show the expiry date in the cell when one's set, else just Y/-.
      const cellText = entry ? (entry.expiry ? new Date(entry.expiry+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}) : 'Y') : '-';
      page.drawText(cellText, {x, y, size:7.5, font:bold, color: entry?PDFLib.rgb(0.16,0.5,0.25):SLATE});
      x += colW*CONTENT_W;
    });
    y -= 15;
  });
  const bytes = await pdfDoc.save();
  await deliverPdf(bytes, exportFilename('', 'Training Matrix', 'pdf'));
};
window.unlinkOneDriveFolder = async function(siteId){
  if(!await customConfirm('Unlink this OneDrive folder? Photos will go back to the generic OpHUB folder until you link a new one.')) return;
  const row = await dbUpdate('sites', siteId, {onedrive_folder_id: null, onedrive_folder_name: null, onedrive_drive_id: null});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast('Folder unlinked');
    render();
  }
};
window.unlinkMaterialOrdersFolder = async function(siteId){
  if(!await customConfirm("Unlink this Material PO's folder? Daily sync will stop until you link a new one.")) return;
  const row = await dbUpdate('sites', siteId, {material_orders_folder_id: null, material_orders_folder_name: null, material_orders_drive_id: null});
  if(row){
    const idx = SITES.findIndex(s=>s.id===siteId);
    if(idx>-1) SITES[idx] = row;
    toast('Folder unlinked');
    render();
  }
};

window.removeTeamMember = async function(userId, name){
  if(!await customConfirm(`Remove ${name||'this person'} from the team? They will immediately lose access, and their email will be free to sign up fresh again later.`)) return;
  // Goes through an edge function rather than a plain profiles DELETE — a
  // client-side delete only removes the profiles row via RLS and leaves the
  // underlying auth.users account behind, which silently blocks that email
  // from ever registering again (and is invisible everywhere, including the
  // Super Admin panel) since Supabase Auth won't let a still-existing
  // account's email sign up a second time.
  try{
    const res = await sbFetch('/functions/v1/remove-team-member', {method:'POST', body: JSON.stringify({user_id: userId})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Could not remove — '+(d.error||res.status)); return; }
    delete PROFILES[userId];
    toast(`${d.deleted||name||'Team member'} removed`);
    render();
  }catch(e){ toast('Could not remove — check your connection and try again.'); }
};
window.generateInvite = async function(){
  const roleEl = document.getElementById('newInviteRole');
  const role = roleEl ? roleEl.value : 'operative';
  invitesBusy = true; render();
  const rows = await dbInsert('invites', {org_id: ME.org_id, role, created_by: ME.id});
  invitesBusy = false;
  if(rows && rows[0]){
    newInviteId = rows[0].id;
    newInviteLink = OPHUB_WEB_URL + '#/join/' + rows[0].id;
    toast('Invite link created');
  }
  render();
};
window.copyInviteLink = async function(){
  if(!newInviteLink) return;
  const label = `${(ORG && ORG.name) || 'Company'} x OpHUB Invite Link`;
  try{ await navigator.clipboard.writeText(label+'\n'+newInviteLink); toast('Link copied'); }
  catch(e){ toast('Could not copy — select and copy the link manually.'); }
};
window.sendInviteEmail = async function(){
  if(!newInviteId){ toast('Generate an invite link first.'); return; }
  const input = document.getElementById('inviteEmailInput');
  const email = input ? input.value.trim() : '';
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Enter a valid email address.'); return; }
  inviteEmailBusy = true; render();
  try{
    const res = await sbFetch('/functions/v1/send-invite-email', {method:'POST', body: JSON.stringify({invite_id: newInviteId, email})});
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.error){ toast(data.error || 'Could not send the invite email.'); }
    else { toast('Invite email sent to '+email); }
  }catch(e){ toast('Could not send the invite email.'); }
  inviteEmailBusy = false;
  render();
};
window.revokeInvite = async function(inviteId){
  if(!await customConfirm('Revoke this invite link?')) return;
  const ok = await dbDelete('invites', inviteId);
  if(ok){ toast('Invite revoked'); if(newInviteLink && newInviteLink.endsWith(inviteId)){ newInviteLink=null; newInviteId=null; } render(); }
};
window.createPermanentInvite = async function(){
  permanentInviteBusy = true; render();
  // 10-year expiry so it's effectively permanent without needing a DB
  // change to make expires_at nullable — is_reusable is what actually
  // keeps it alive across multiple sign-ups, not this date.
  const farFuture = new Date(Date.now() + 1000*60*60*24*365*10).toISOString();
  const rows = await dbInsert('invites', {org_id: ME.org_id, role:'operative', created_by: ME.id, is_reusable:true, expires_at: farFuture});
  permanentInviteBusy = false;
  if(rows) toast('Permanent invite link created');
  render();
};
window.copyPermanentInviteLink = async function(inviteId){
  const link = OPHUB_WEB_URL + '#/join/' + inviteId;
  const label = `${(ORG && ORG.name) || 'Company'} x OpHUB Invite Link`;
  try{ await navigator.clipboard.writeText(label+'\n'+link); toast('Link copied'); }
  catch(e){ toast('Could not copy — tap and hold the link above to copy it manually.'); }
};
window.revokePermanentInvite = async function(inviteId){
  if(!await customConfirm('This stops the current link from working — anyone who already joined stays on your team, but the link itself won\'t sign anyone new up any more. You can create a fresh one straight after. Continue?')) return;
  const ok = await dbDelete('invites', inviteId);
  if(ok){ toast('Old link revoked'); render(); }
};
window.unlockDevice = async function(deviceId){
  if(!await customConfirm('Unlock this device? Whoever next signs in on it will lock it to themselves.')) return;
  const res = await sbFetch('/rest/v1/device_locks?device_id=eq.'+encodeURIComponent(deviceId), {method:'DELETE'});
  if(res.ok){ toast('Device unlocked'); render(); }
  else{ toast('Could not unlock — '+(await safeErr(res))); }
};
// #333: approve a new device pending against an account that already has an
// approved device — separate from Unlock so approving is its own explicit,
// auditable action rather than reusing the wipe-the-row delete flow.
window.approvePendingDevice = async function(deviceId){
  const res = await sbFetch('/rest/v1/rpc/approve_pending_device', {method:'POST', body: JSON.stringify({p_device_id: deviceId})});
  const d = await res.json().catch(()=>({}));
  if(res.ok && d.ok){ toast('Device approved'); render(); }
  else{ toast('Could not approve — '+(d.error||res.status)); }
};
