/* ================= VARIATIONS ================= */
let varDraft = null;
let varFilter = 'live';
let expandedVariationIds = new Set();
window.toggleVariationExpand = function(id){
  if(expandedVariationIds.has(id)) expandedVariationIds.delete(id); else expandedVariationIds.add(id);
  render();
};
// #290: PM decision workflow for an operative-raised variation — Approve /
// Decline / Modify-then-Approve — separate from #300's requirement that
// pricing/approval never auto-closes the variation: approval_status and the
// live/closed `status` field are intentionally independent columns, so
// approving one never flips the other.
let varEditingId = null; // id of the variation currently being modified-then-approved
let varEditDescDraft = '';
let varDecliningId = null; // id whose decline-reason box is open
let varDeclineReasonDraft = '';
window.approveVariation = async function(siteId, id){
  const row = await dbUpdate('variations', id, {approval_status:'approved', decided_by:ME.id, decided_at:new Date().toISOString(), decline_reason:null});
  if(row){ toast('Variation approved'); postSystemMessage(siteId, 'variation', `${ME.name} approved a variation: ${row.description||''}`); render(); }
};
window.startDeclineVariation = function(id){ varDecliningId = id; varDeclineReasonDraft = ''; render(); };
window.cancelDeclineVariation = function(){ varDecliningId = null; render(); };
window.confirmDeclineVariation = async function(siteId, id){
  const input = document.getElementById('varDeclineReason');
  const reason = String(input ? input.value : varDeclineReasonDraft || '').trim();
  if(!reason){ toast('Enter a reason for declining.'); return; }
  const row = await dbUpdate('variations', id, {approval_status:'declined', decided_by:ME.id, decided_at:new Date().toISOString(), decline_reason:reason});
  if(row){ varDecliningId = null; toast('Variation declined'); render(); }
};
window.startModifyVariation = function(id, currentDesc){ varEditingId = id; varEditDescDraft = currentDesc||''; render(); };
window.cancelModifyVariation = function(){ varEditingId = null; render(); };
window.saveModifyAndApproveVariation = async function(siteId, id){
  const input = document.getElementById('varEditDesc');
  const desc = String(input ? input.value : varEditDescDraft || '').trim();
  if(!desc){ toast('Enter a description.'); return; }
  const row = await dbUpdate('variations', id, {description:desc, approval_status:'approved', decided_by:ME.id, decided_at:new Date().toISOString(), decline_reason:null});
  if(row){ varEditingId = null; toast('Modified and approved'); render(); }
};
window.deleteVariation = async function(siteId, id){
  if(!await customConfirm('Delete this variation? This cannot be undone.')) return;
  const rows = await dbSelect('variations', 'id=eq.'+id+'&select=description');
  const description = rows[0] && rows[0].description;
  const ok = await dbDelete('variations', id);
  if(ok){ toast('Variation deleted'); logSiteActivity(siteId, 'variation_deleted', `Deleted variation "${description||''}"`); render(); }
};
async function renderVariations(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  varDraft = varDraft || {photo:null, desc:''};
  const variations = await dbSelect('variations', 'site_id=eq.'+siteId+'&status=eq.'+varFilter+'&order=created_at.desc');

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="filterrow">
      <div class="filterchip ${varFilter==='live'?'active':''}" onclick="varFilter='live';render()">Live</div>
      <div class="filterchip ${varFilter==='closed'?'active':''}" onclick="varFilter='closed';render()">Closed</div>
    </div>

    ${variations.map(v=>{
      // Every variation is now a tappable line item that expands to show
      // the photo/closing detail, rather than always showing the full card.
      const open = expandedVariationIds.has(v.id);
      const approvalLabel = v.approval_status==='approved' ? 'Approved' : v.approval_status==='declined' ? 'Declined' : 'Awaiting decision';
      const approvalColor = v.approval_status==='approved' ? 'var(--ok)' : v.approval_status==='declined' ? 'var(--red)' : 'var(--warn)';
      return `
      <div class="sitecard" style="cursor:pointer;" onclick="toggleVariationExpand('${v.id}')">
        <div class="info"><div class="name">${escapeHtml(v.description)}</div><div class="addr">${escapeHtml(nameOf(v.created_by))} · ${new Date(v.created_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'})}</div></div>
        <span class="statustag2 ${v.status}">${v.status}</span>
        ${v.status!=='closed' ? `<span class="statustag" style="margin-left:6px;color:${approvalColor};border-color:${approvalColor};">${approvalLabel}</span>` : ''}
        <span style="font-size:13px;color:var(--slate);margin-left:6px;">${open?'▼':'▶'}</span>
      </div>
      ${open ? `
      <div class="snag" style="margin-top:-6px;">
        ${v.photo_path ? `<img class="snagthumb" src="${publicUrl('site-photos', v.photo_path)}" style="cursor:pointer;" onclick="viewImage('${publicUrl('site-photos', v.photo_path)}')" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';this.style.cursor='default';this.removeAttribute('onclick');">` : ''}
        ${v.approval_status==='declined' && v.decline_reason ? `<div class="stub" style="margin:6px 0 0;color:var(--red);">Reason: ${escapeHtml(v.decline_reason)}</div>` : ''}
        ${v.status==='closed' ? `
          <div class="closurerow">
            <div class="stub" style="margin-top:0;">Closed${v.closed_at ? ' · '+new Date(v.closed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'}) : ''}</div>
          </div>
        ` : (isManager(ME) ? (
          varEditingId===v.id ? `
          <div style="margin-top:10px;">
            <div class="formfield" style="margin:0 0 8px;">
              <label class="field-label">Description</label>
              <textarea id="varEditDesc" rows="3" style="width:100%;font-family:inherit;font-size:13px;padding:10px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;" oninput="varEditDescDraft=this.value">${escapeHtml(v.description)}</textarea>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="darkbtn" style="width:auto;padding:8px 12px;" onclick="saveModifyAndApproveVariation('${siteId}','${v.id}')">Save &amp; Approve</button>
              <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="cancelModifyVariation()">Cancel</button>
            </div>
          </div>
          ` : varDecliningId===v.id ? `
          <div style="margin-top:10px;">
            <div class="formfield" style="margin:0 0 8px;">
              <label class="field-label">Reason for declining</label>
              <textarea id="varDeclineReason" rows="2" style="width:100%;font-family:inherit;font-size:13px;padding:10px;border-radius:8px;border:1px solid var(--line);box-sizing:border-box;" oninput="varDeclineReasonDraft=this.value"></textarea>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="darkbtn" style="width:auto;padding:8px 12px;background:var(--red);border-color:var(--red);" onclick="confirmDeclineVariation('${siteId}','${v.id}')">Confirm Decline</button>
              <button class="ghostbtn" style="width:auto;padding:8px 12px;" onclick="cancelDeclineVariation()">Cancel</button>
            </div>
          </div>
          ` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:10px;align-items:center;">
            ${v.approval_status==='pending' ? `<button class="ghostbtn" style="width:100%;padding:8px 12px;color:var(--ok);border-color:var(--ok);" onclick="approveVariation('${siteId}','${v.id}')">Approve</button>` : ''}
            ${v.approval_status==='pending' ? `<button class="ghostbtn" style="width:100%;padding:8px 12px;color:var(--red);border-color:var(--red);" onclick="startDeclineVariation('${v.id}')">Decline</button>` : ''}
            <button class="ghostbtn" style="width:100%;padding:8px 12px;" onclick="startModifyVariation('${v.id}','${jsAttr(v.description)}')">Modify &amp; Approve</button>
            ${v.approval_status==='approved' ? (v.schedule_section_id ? `<span class="stub" style="margin:0;color:var(--ok);align-self:center;">✓ In Schedule of Works</span>` : `<button class="ghostbtn" style="width:100%;padding:8px 12px;" onclick="addVariationToSchedule('${siteId}','${v.id}')">+ Add to Schedule of Works</button>`) : `<span class="stub" style="margin:0;align-self:center;font-size:11px;">Approve to add to Schedule of Works</span>`}
            <button class="ghostbtn" style="width:100%;padding:8px 12px;" onclick="closeVariation('${siteId}','${v.id}')">Mark as closed</button>
            <button class="ghostbtn" style="width:100%;padding:8px 12px;color:var(--red);border-color:var(--red);" onclick="deleteVariation('${siteId}','${v.id}')">Delete</button>
          </div>
          `
        ) : '')}
      </div>
      ` : ''}`;
    }).join('') || `<div class="empty">No ${varFilter} variations.</div>`}

    ${varFilter!=='closed' ? `
    <div class="card" style="margin-top:14px;">
      <p class="sectiontitle" style="margin-top:0;">Raise a variation</p>
      <div class="formfield">
        <label class="field-label">Photo evidence</label>
        <div class="photoupload" style="cursor:pointer;" onclick="document.getElementById('varPhotoInput').click()">
          ${varDraft.photo ? `<img src="${varDraft.photo}">` : `<div style="font-size:22px;">📷</div>Tap to add a photo`}
        </div>
        <input type="file" id="varPhotoInput" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="varPhoto(this)">
      </div>
      <div class="formfield">
        <label class="field-label">Description</label>
        <textarea id="varDesc" placeholder="What's changed and why..." oninput="varDraft.desc=this.value">${escapeHtml(varDraft.desc)}</textarea>
      </div>
      <button class="primarybtn" ${(varDraft.photo)?'':'disabled'} onclick="submitVariation('${siteId}')">Submit Variation</button>
    </div>
    ` : ''}

    <p class="sectiontitle" style="margin-top:18px;">Export</p>
    <div style="display:flex;gap:6px;">
      <button class="ghostbtn exportbtn" style="display:block;width:auto;flex:1;" onclick="exportVariationsPDF('${siteId}','live')">Export live (PDF)</button>
      <button class="ghostbtn exportbtn" style="display:block;width:auto;flex:1;" onclick="exportVariationsPDF('${siteId}','closed')">Export closed (PDF)</button>
      <button class="ghostbtn exportbtn" style="display:block;width:auto;flex:1;" onclick="exportVariationsPDF('${siteId}','both')">Export all (PDF)</button>
    </div>
  `, {title:'Variations', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/snagging`, siteId, activeTab:'more'}); }
}
window.varPhoto = async function(input){
  const file = input.files && input.files[0]; if(!file) return;
  try{ varDraft.photo = await compressImage(file); render(); }
  catch(e){ toast('Could not process photo.'); }
};
window.submitVariation = async function(siteId){
  const desc = (varDraft.desc||'').trim();
  const path = await uploadDataUrl('site-photos', siteId+'/variations/'+crypto.randomUUID()+'.jpg', varDraft.photo);
  if(!path) return;
  const rows = await dbInsert('variations', {site_id:siteId, photo_path:path, description:desc||'—', created_by:ME.id, status:'live'});
  if(rows){
    postSystemMessage(siteId, 'variation', `${ME.name} raised a variation: ${desc||'(no description)'}`);
    varDraft = null;
    toast('Variation submitted');
    render();
  }
};
window.closeVariation = async function(siteId, varId){
  const row = await dbUpdate('variations', varId, {status:'closed', closed_at:new Date().toISOString()});
  if(row){ toast('Variation closed'); logSiteActivity(siteId, 'variation_closed', `Closed variation "${row.description||''}"`); render(); }
};
window.exportVariationsPDF = async function(siteId, scope){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  const site = SITES.find(s=>s.id===siteId);
  let qs = 'site_id=eq.'+siteId+'&order=created_at.asc';
  if(scope==='live') qs += '&status=eq.live';
  else if(scope==='closed') qs += '&status=eq.closed';
  else qs += '&status=in.(live,closed)';
  const variations = await dbSelect('variations', qs);
  if(!variations.length){ toast('No variations to export for that filter.'); return; }
  await loadAllProfiles();
  toast('Building PDF…');
  try{
    const pdfDoc = await PDFLib.PDFDocument.create();
    const bold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const reg = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1);
    const WHITE = PDFLib.rgb(1,1,1);
    const INK = PDFLib.rgb(0.06,0.06,0.07);
    const SLATE = PDFLib.rgb(0.36,0.37,0.41);
    const FAINT = PDFLib.rgb(0.85,0.84,0.80);
    const CARDBG = PDFLib.rgb(0.976,0.969,0.949);
    const OK = PDFLib.rgb(0.2,0.55,0.35);
    const OKBG = PDFLib.rgb(0.90,0.95,0.91);
    const WARN = PDFLib.rgb(0.69,0.45,0.06);
    const WARNBG = PDFLib.rgb(0.97,0.92,0.83);
    const PAGE_W = 595.28, PAGE_H = 841.89;
    const MARGIN = 42;
    const scopeLabel = scope==='live' ? 'Live' : scope==='closed' ? 'Closed' : 'All';
    const companyName = (ORG && ORG.name) || 'OpHUB';
    const liveCount = variations.filter(v=>v.status==='live').length;
    const closedCount = variations.filter(v=>v.status==='closed').length;

    let logoImg = null;
    const logoUrl = ORG && ORG.logo_path ? publicUrl('org-logos', ORG.logo_path) : null;
    if(logoUrl){
      const bytes = await pdfFetchImageBytes(logoUrl);
      if(bytes){ try{ logoImg = await pdfDoc.embedJpg(bytes); }catch(e){ try{ logoImg = await pdfDoc.embedPng(bytes); }catch(e2){} } }
    }

    let page, y;
    function drawHeaderBand(){
      page.drawRectangle({x:0, y:PAGE_H-92, width:PAGE_W, height:92, color:BRAND});
      if(logoImg){
        const dim = logoImg.scale(1);
        const s = 40/Math.max(dim.width, dim.height);
        const w = dim.width*s, h = dim.height*s;
        page.drawRectangle({x:MARGIN, y:PAGE_H-76, width:40, height:40, color:WHITE});
        page.drawImage(logoImg, {x:MARGIN+(40-w)/2, y:PAGE_H-76+(40-h)/2, width:w, height:h});
      }
      const textX = logoImg ? MARGIN+52 : MARGIN;
      page.drawText('VARIATIONS REPORT', {x:textX, y:PAGE_H-40, size:9, font:bold, color:WHITE, opacity:0.85});
      pdfDrawFit(page, pdfSiteLabel(site), {x:textX, y:PAGE_H-60, size:16, font:bold, color:WHITE});
      page.drawText(companyName + ' · ' + scopeLabel + ' variations', {x:textX, y:PAGE_H-76, size:9.5, font:reg, color:WHITE, opacity:0.9});
    }
    function drawFooter(pageNum){
      page.drawLine({start:{x:MARGIN,y:34}, end:{x:PAGE_W-MARGIN,y:34}, thickness:0.75, color:FAINT});
      page.drawText('Generated via OpHUB', {x:MARGIN, y:20, size:8, font:reg, color:SLATE});
      page.drawText('Page ' + pageNum, {x:PAGE_W-MARGIN-40, y:20, size:8, font:reg, color:SLATE});
    }
    let pageNum = 0;
    function newPage(){
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      pageNum++;
      drawHeaderBand();
      y = PAGE_H - 118;
    }
    newPage();
    const chipW = 150, chipGap = 14, chipY = y - 34;
    [
      {label:'Total variations', value:String(variations.length), bg:CARDBG, fg:INK},
      {label:'Live', value:String(liveCount), bg:WARNBG, fg:WARN},
      {label:'Closed', value:String(closedCount), bg:OKBG, fg:OK},
    ].forEach((c,i)=>{
      const x = MARGIN + i*(chipW+chipGap);
      page.drawRectangle({x, y:chipY, width:chipW, height:44, color:c.bg});
      page.drawText(c.value, {x:x+12, y:chipY+22, size:16, font:bold, color:c.fg});
      page.drawText(c.label.toUpperCase(), {x:x+12, y:chipY+8, size:7.5, font:bold, color:c.fg, opacity:0.8});
    });
    y = chipY - 26;

    await pdfPrefetchImages(variations.map(v=>v.photo_path ? publicUrl('site-photos', v.photo_path) : null));
    for(let i=0;i<variations.length;i++){
      const v = variations[i];
      const blockH = 130;
      if(y - blockH < 50){ newPage(); }

      const cardTop = y;
      page.drawRectangle({x:MARGIN, y:cardTop-blockH, width:PAGE_W-2*MARGIN, height:blockH, color:CARDBG});
      const pillColor = v.status==='closed' ? OK : WARN;
      const pillBg = v.status==='closed' ? OKBG : WARNBG;
      const textLeft = MARGIN + 16;
      const imgSlot = 84;
      const textWidth = (PAGE_W-2*MARGIN) - imgSlot - 32;
      let ty = cardTop - 22;
      const desc = (v.description||'').length>90 ? v.description.slice(0,87)+'…' : (v.description||'');
      const descLines = wrapPlainText(desc, reg, 12, textWidth);
      page.drawText((i+1)+'. '+(descLines[0]||''), {x:textLeft, y:ty, size:12, font:bold, color:INK});
      const pillW = 56;
      page.drawRectangle({x:MARGIN+(PAGE_W-2*MARGIN)-16-pillW, y:ty-3, width:pillW, height:15, color:pillBg});
      page.drawText(v.status.toUpperCase(), {x:MARGIN+(PAGE_W-2*MARGIN)-16-pillW+8, y:ty+1, size:8, font:bold, color:pillColor});
      ty -= 18;
      if(descLines[1]){ page.drawText(descLines[1], {x:textLeft, y:ty, size:10, font:reg, color:INK}); ty -= 14; }
      page.drawText('Raised by '+nameOf(v.created_by)+' · '+new Date(v.created_at).toLocaleDateString('en-GB'), {x:textLeft, y:ty, size:9, font:reg, color:SLATE});
      ty -= 14;
      if(v.status==='closed' && v.closed_at){
        page.drawText('Closed '+new Date(v.closed_at).toLocaleDateString('en-GB'), {x:textLeft, y:ty, size:9, font:reg, color:SLATE});
      }

      if(v.photo_path){
        const imgX = MARGIN+(PAGE_W-2*MARGIN)-16-imgSlot+8;
        const imgY = cardTop-blockH+14;
        const boxSize = 76;
        try{
          const bytes = await pdfFetchImageBytesScaled(publicUrl('site-photos', v.photo_path), Math.round(boxSize*3), 0.78);
          if(bytes){
            let img; try{ img = await pdfDoc.embedJpg(bytes); }catch(e){ img = await pdfDoc.embedPng(bytes); }
            const dim = img.scale(1);
            const s2 = boxSize/Math.max(dim.width, dim.height);
            const w = dim.width*s2, h = dim.height*s2;
            page.drawImage(img, {x:imgX+(boxSize-w)/2, y:imgY+(boxSize-h)/2, width:w, height:h});
          }
        }catch(e){ /* skip photo if it fails to embed */ }
      }

      y = cardTop - blockH - 14;
    }

    const variationPhotoRefs = variations.filter(v=>v.photo_path).map(v=>({path:v.photo_path, bucket:'site-photos'}));
    await appendMediaSummaryPages(pdfDoc, variationPhotoRefs, {maxDim:900, quality:0.72});

    pdfDoc.getPages().forEach((p,idx)=>{ page = p; drawFooter((idx+1)+' of '+pdfDoc.getPageCount()); });

    const exportLabel = scope==='live' ? 'Variations Report (Live)' : scope==='closed' ? 'Variations Report (Closed)' : 'Variations Report (All)';
    const filename = exportFilename(site.name, exportLabel, 'pdf');
    pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await pdfDoc.save();
    await deliverPdf(outBytes, filename);
  }catch(e){
    console.error(e);
    toast('Could not build the PDF.');
  }
};
// Simple word-wrap into at most 2 lines for the variations export card —
// mirrors the same idea as wrapText() in drawSignatureTablePages but kept
// local since it only needs a 2-line cap, not unlimited wrapping.
function wrapPlainText(text, font, size, maxWidth){
  const words = (text||'').split(' ');
  const lines = [];
  let cur = '';
  for(const w of words){
    const test = cur ? cur+' '+w : w;
    if(font.widthOfTextAtSize(test, size) > maxWidth && cur){ lines.push(cur); cur = w; }
    else cur = test;
    if(lines.length>=2) break;
  }
  if(cur && lines.length<2) lines.push(cur);
  return lines;
}
