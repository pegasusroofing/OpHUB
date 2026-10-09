/* ================= SNAGGING ================= */
let snagFilter = 'live';
let snagNewPhotos = [];
let snagNewTitle = ''; // kept in JS state (not just read from the DOM at submit)
let snagNewLocation = ''; // because attaching a photo/PDF triggers a re-render mid-form,
                           // which was wiping out whatever had been typed so far.
let closingSnagId = null;
let expandedSnagIds = new Set();
window.toggleSnagExpand = function(id){
  if(expandedSnagIds.has(id)) expandedSnagIds.delete(id); else expandedSnagIds.add(id);
  render();
};
function snagThumbHtml(p){
  const u = publicUrl('site-photos', p);
  return `<img class="snagthumb" src="${u}" style="cursor:pointer;" onclick="viewImage('${u}')" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';this.style.cursor='default';this.removeAttribute('onclick');">`;
}
function snagCardBody(siteId, s, canAdd){
  return `
        ${(()=>{
          const paths = (s.photo_paths && s.photo_paths.length) ? s.photo_paths : (s.photo_path ? [s.photo_path] : []);
          if(!paths.length) return '';
          const canMark = s.status!=='closed' && !isClient(ME);
          return `<div style="display:flex;gap:8px;flex-wrap:wrap;">${paths.map(p=>`<div style="position:relative;">${snagThumbHtml(p)}${canMark ? `<div class="snagmk" onclick="snagMarkupSaved('${siteId}','${s.id}','${jsAttr(p)}')">✏️ Mark up</div>` : ''}</div>`).join('')}</div>`;
        })()}
        ${s.pdf_path ? `<div class="ghostbtn" style="display:block;margin-top:10px;text-align:center;cursor:pointer;" onclick="viewDrawing('${publicUrl('site-photos',s.pdf_path)}', false, '${jsAttr((s.title||'Snag')+' - Attachment.pdf')}')">📄 View PDF</div>` : ''}
        ${s.status==='closed' ? `
          <div class="closurerow">
            ${s.closed_photo_path ? `<img src="${publicUrl('site-photos',s.closed_photo_path)}" style="cursor:pointer;" onclick="viewImage('${publicUrl('site-photos',s.closed_photo_path)}')" onerror="this.onerror=null;this.src='${PHOTO_PLACEHOLDER_INLINE}';this.style.cursor='default';this.removeAttribute('onclick');">` : ''}
            <div class="stub" style="margin-top:0;">Closed by ${escapeHtml(nameOf(s.closed_by))} · ${s.closed_at ? new Date(s.closed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'}) : ''}</div>
          </div>
        ` : isClient(ME) ? '' : `
          ${closingSnagId===s.id ? `
            <div class="card" style="margin:10px 0 0;padding:10px;">
              <p class="stub" style="margin:0 0 8px;">Upload a photo showing this is fixed.</p>
              <div class="ghostbtn" style="cursor:pointer;text-align:center;" onclick="document.getElementById('closeSnagPhotoInput-${s.id}').click()">📷 Add closing photo</div>
              <input type="file" id="closeSnagPhotoInput-${s.id}" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="closeSnagPhoto(this,'${siteId}','${s.id}')">
              <button class="ghostbtn" style="margin-top:8px;" onclick="closingSnagId=null;render()">Cancel</button>
            </div>
          ` : `<button class="ghostbtn" style="margin-top:10px;" onclick="closingSnagId='${s.id}';render()">Close snag</button>`}
        `}
  `;
}
async function renderSnagging(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canAdd = isManager(ME);
  const status = snagFilter==='live' ? 'open' : 'closed';
  const snags = await dbSelect('snags', 'site_id=eq.'+siteId+'&status=eq.'+status+'&order=created_at.desc');

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div class="filterrow">
      <div class="filterchip ${snagFilter==='live'?'active':''}" onclick="snagFilter='live';render()">Live</div>
      <div class="filterchip ${snagFilter==='closed'?'active':''}" onclick="snagFilter='closed';render()">Closed</div>
    </div>

    ${snags.map(s=>{
      // Closed snags collapse to a tappable line item — expand to see the
      // full detail (photos, closing photo/note) rather than always
      // showing every closed snag's full card at once.
      if(s.status!=='closed') return `
      <div class="snag">
        <div class="top">
          <div><div class="title">${escapeHtml(s.title)}</div><div class="loc">${escapeHtml(s.location||'—')}</div></div>
          <span class="statustag2 ${s.status}">${s.status}</span>
        </div>
        ${snagCardBody(siteId, s, canAdd)}
      </div>`;
      const open = expandedSnagIds.has(s.id);
      return `
      <div class="sitecard" style="cursor:pointer;" onclick="toggleSnagExpand('${s.id}')">
        <div class="info"><div class="name">${escapeHtml(s.title)}</div><div class="addr">${escapeHtml(s.location||'—')} · Closed ${s.closed_at ? new Date(s.closed_at).toLocaleDateString(undefined,{day:'2-digit',month:'short'}) : ''}</div></div>
        <span style="font-size:13px;color:var(--slate);">${open?'▼':'▶'}</span>
      </div>
      ${open ? `<div class="snag" style="margin-top:-6px;">${snagCardBody(siteId, s, canAdd)}</div>` : ''}`;
    }).join('') || `<div class="empty">No ${snagFilter} snags.</div>`}

    ${canAdd && snagFilter!=='closed' ? `
      <div class="card" style="margin-top:14px;">
        <p class="sectiontitle" style="margin-top:0;">Add snag</p>
        <div class="formfield"><input type="text" id="snagTitle" placeholder="Issue" value="${escapeHtml(snagNewTitle)}" oninput="snagNewTitle=this.value"></div>
        <div class="formfield"><input type="text" id="snagLoc" placeholder="Location" value="${escapeHtml(snagNewLocation)}" oninput="snagNewLocation=this.value"></div>
        <div class="formfield">
          <label class="field-label">Photos</label>
          ${snagNewPhotos.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">${snagNewPhotos.map((u,idx)=>`<div style="position:relative;"><img src="${u}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;display:block;border:1px solid var(--line);"><div class="taskicon danger" style="position:absolute;top:-6px;right:-6px;background:#fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.25);" onclick="removeSnagNewPhoto(${idx})">✕</div><div class="snagmk" onclick="snagMarkupNew(${idx})">✏️ Mark up</div></div>`).join('')}</div>` : ''}
          <div class="photoupload" style="cursor:pointer;" onclick="document.getElementById('snagPhotoInput').click()">
            <div style="font-size:20px;">📷</div>Take a photo or choose from library
          </div>
          <input type="file" id="snagPhotoInput" accept="image/*" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;" onchange="snagAddPhoto(this)">
        </div>
        <button class="darkbtn" onclick="addSnag('${siteId}')">Add Snag</button>
      </div>
    ` : ''}

    <p class="sectiontitle" style="margin-top:18px;">Export</p>
    ${snagFilter==='live' ? `
    <div style="display:flex;gap:6px;">
      <button class="ghostbtn exportbtn" style="display:block;width:auto;flex:1;" onclick="exportSnaggingPDF('${siteId}','live')">Export Live</button>
      <button class="ghostbtn exportbtn" style="display:block;width:auto;flex:1;" ${snagEmailBusy==='live'?'disabled':''} onclick="emailSnaggingPDF('${siteId}','live')">${snagEmailBusy==='live'?'Emailing…':'Email Live Snags'}</button>
    </div>
    ` : `
    <div style="display:flex;gap:6px;">
      <button class="ghostbtn exportbtn" style="display:block;width:auto;flex:1;" onclick="exportSnaggingPDF('${siteId}','closed')">Export Closed</button>
      <button class="ghostbtn exportbtn" style="display:block;width:auto;flex:1;" ${snagEmailBusy==='closed'?'disabled':''} onclick="emailSnaggingPDF('${siteId}','closed')">${snagEmailBusy==='closed'?'Emailing…':'Email Closed'}</button>
      <button class="ghostbtn exportbtn" style="display:block;width:auto;flex:1;" onclick="exportSnaggingPDF('${siteId}','both')">Export All</button>
    </div>
    `}
  `, {title:'Snagging', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/snagging`, siteId, activeTab:'more'}); }
}
window.snagAddPhoto = async function(input){
  const files = input.files && Array.from(input.files); if(!files || !files.length) return;
  // Same all-or-nothing risk as onReportPhotoChosen: process each photo on
  // its own so one bad file doesn't drop the rest of the batch.
  let failed = 0;
  for(const file of files){
    try{ snagNewPhotos.push(await compressImage(file)); }
    catch(e){ failed++; console.error('compressImage failed for', file && file.name, file && file.type, e); }
  }
  render();
  if(failed) toast(failed===files.length ? 'Could not process photo.' : (failed+' photo'+(failed===1?'':'s')+' could not be processed — the rest were added.'));
  input.value = '';
};
// Draw / add text on a photo before the snag is added.
window.snagMarkupNew = async function(idx){
  const src = snagNewPhotos[idx]; if(!src) return;
  const out = await photoMarkup(src);
  if(out && snagNewPhotos[idx]===src){ snagNewPhotos[idx] = out; render(); }
};
// Mark up a photo on a snag that's already been raised: the marked-up copy
// is uploaded and takes the old photo's place on the snag.
window.snagMarkupSaved = async function(siteId, snagId, path){
  if(isClient(ME)) return;
  const out = await photoMarkup(publicUrl('site-photos', path)+'?v='+Date.now());
  if(!out) return;
  const newPath = await uploadDataUrl('site-photos', siteId+'/snags/'+crypto.randomUUID()+'.jpg', out);
  if(!newPath){ toast('Could not save the marked-up photo — check your connection.'); return; }
  const cur = (await dbSelect('snags', 'id=eq.'+snagId+'&select=photo_path,photo_paths&limit=1'))[0] || {};
  let paths = (cur.photo_paths && cur.photo_paths.length) ? cur.photo_paths.slice() : (cur.photo_path ? [cur.photo_path] : []);
  const i = paths.indexOf(path);
  if(i>=0) paths[i] = newPath; else paths.push(newPath);
  const row = await dbUpdate('snags', snagId, {photo_paths:paths, photo_path:paths[0]||null});
  if(row){ toast('✓ Photo marked up'); render(); }
};
window.removeSnagNewPhoto = function(idx){
  snagNewPhotos.splice(idx,1);
  render();
};
window.addSnag = async function(siteId){
  const title = snagNewTitle.trim();
  const location = snagNewLocation.trim();
  if(!title) return;
  let photoPaths = [];
  let failedPhotos = 0;
  for(const dataUrl of snagNewPhotos){
    const path = await uploadDataUrl('site-photos', siteId+'/snags/'+crypto.randomUUID()+'.jpg', dataUrl);
    if(path) photoPaths.push(path); else failedPhotos++;
  }
  const rows = await dbInsert('snags', {site_id:siteId, title, location, photo_path:photoPaths[0]||null, photo_paths:photoPaths.length?photoPaths:null, status:'open', created_by:ME.id});
  if(rows && failedPhotos>0){
    toast(`Snag added, but ${failedPhotos} photo${failedPhotos>1?'s':''} failed to upload — check your connection.`);
    snagNewPhotos = []; snagNewTitle = ''; snagNewLocation = ''; render(); return;
  }
  if(rows){
    snagNewPhotos = [];
    snagNewTitle = '';
    snagNewLocation = '';
    toast('Snag added');
    // #notif-review-2026-09: previously a push only fired when a snag was
    // CLOSED (to managers) — a new snag being raised went to nobody. Tells
    // the operatives on this site so the team knows what's outstanding.
    postSystemMessageTo(siteId, 'snag_raised', `New snag raised: "${title}"`);
    render();
  }
};
window.closeSnagPhoto = async function(input, siteId, snagId){
  // Belt-and-braces: the "Close snag" button/photo-prompt is already hidden
  // from clients entirely (see snagCardBody), but guard the handler itself
  // too in case this is ever reached another way.
  if(isClient(ME)) return;
  const file = input.files && input.files[0]; if(!file) return;
  try{
    const dataUrl = await compressImage(file);
    const path = await uploadDataUrl('site-photos', siteId+'/snags/'+snagId+'-closed-'+crypto.randomUUID()+'.jpg', dataUrl);
    if(!path) return;
    const row = await dbUpdate('snags', snagId, {status:'closed', closed_photo_path:path, closed_by:ME.id, closed_at:new Date().toISOString()});
    if(row){
      postSystemMessage(siteId, 'snag_closed', `${ME.name} closed a snag: "${row.title||'Untitled'}"`);
      logSiteActivity(siteId, 'snag_closed', `Closed snag "${row.title||'Untitled'}"`);
      closingSnagId = null;
      toast('Snag closed');
      render();
    }
  }catch(e){ toast('Could not process photo.'); }
};
// Site as it should read on every exported document: name plus the full
// address and postcode. If the name is already just the start of the
// address, only the address is used rather than saying it twice.
function pdfSiteLabel(site){
  if(!site) return '';
  const name = (site.name||'').trim();
  const addr = fullSiteAddress(site);
  if(!addr) return name;
  if(!name) return addr;
  const norm = v=>v.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(norm(addr).indexOf(norm(name))===0) return addr;
  return name+', '+addr;
}
// Draws one line of text that must stay on the page: the size is stepped
// down until it fits the space to the right-hand margin, and only if it
// still doesn't fit at the smallest size is it shortened with "…".
function pdfDrawFit(page, text, opts, minSize){
  text = String(text==null?'':text);
  const maxW = (opts.maxWidth || (page.getWidth() - opts.x - 30));
  const o = Object.assign({}, opts); delete o.maxWidth;
  let size = o.size || 12; const floor = Math.min(size, minSize || 8);
  try{
    while(size > floor && o.font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
    if(o.font.widthOfTextAtSize(text, size) > maxW){
      while(text.length > 4 && o.font.widthOfTextAtSize(text+'…', size) > maxW) text = text.slice(0, -1);
      text = text.replace(/[\s,]+$/,'')+'…';
    }
  }catch(e){}
  o.size = size;
  page.drawText(text, o);
}
function pdfHexToRgb(hex){
  const h = (hex||'').replace('#','');
  if(h.length!==6) return PDFLib.rgb(0.306,0.561,0.820);
  const r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255;
  return PDFLib.rgb(r,g,b);
}
// Photos downloaded for a PDF are remembered for a couple of minutes, so
// the same photo used twice in one export (thumbnail + media summary) is
// only downloaded once, and pdfPrefetchImages() can fetch several at a time
// ahead of the page-by-page drawing instead of one after another.
const pdfImageCache = new Map();
function pdfFetchImageBytes(url){
  if(!url || String(url).startsWith('data:')) return pdfFetchImageBytesRaw(url);
  const hit = pdfImageCache.get(url);
  if(hit && (Date.now()-hit.at) < 120000) return hit.p;
  const p = pdfFetchImageBytesRaw(url);
  pdfImageCache.set(url, {p, at:Date.now()});
  // A failed download isn't remembered, so the next export tries again.
  p.then(b=>{ if(!b){ const cur = pdfImageCache.get(url); if(cur && cur.p===p) pdfImageCache.delete(url); } });
  if(pdfImageCache.size > 800){
    const now = Date.now();
    for(const [k,v] of pdfImageCache){ if(now-v.at >= 120000 || pdfImageCache.size > 800) pdfImageCache.delete(k); if(pdfImageCache.size <= 650) break; }
  }
  return p;
}
async function pdfPrefetchImages(urls){
  const list = Array.from(new Set((urls||[]).filter(u=>u && !String(u).startsWith('data:')))).slice(0, 700);
  let next = 0;
  const worker = async ()=>{ while(next < list.length){ const u = list[next++]; try{ await pdfFetchImageBytes(u); }catch(e){} } };
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
}
async function pdfFetchImageBytesRaw(url){
  try{
    // Timed: a single photo that never finishes downloading used to hang
    // the whole PDF build (and leave "Building PDF…" stuck on the button).
    const res = await fetchWithTimeout(url, {}, 20000);
    if(!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }catch(e){ return null; }
}
// Like pdfFetchImageBytes, but downsizes/recompresses via canvas before
// returning — site photos come straight off phone cameras (often several MB,
// many thousands of pixels on a side) and PDFs that embed many of them at
// full original resolution balloon to a size the email function's 2s CPU
// budget (see send-schedule-email's size check below) can choke on. Used
// anywhere a photo is drawn small (a thumbnail, an appendix tile) so the
// bytes we embed are actually sized for how large the photo appears in the
// PDF, not whatever the camera produced. Falls back to the untouched
// original bytes if decoding/canvas fails for any reason (never blocks the
// export over a single bad photo) or if the photo is already smaller than
// maxDim (never upscales/re-encodes a photo that didn't need it).
async function pdfFetchImageBytesScaled(url, maxDim, quality){
  const bytes = await pdfFetchImageBytes(url);
  if(!bytes) return null;
  let objUrl = null;
  try{
    objUrl = URL.createObjectURL(new Blob([bytes]));
    const img = await new Promise((resolve,reject)=>{
      const im = new Image();
      im.onload = ()=>resolve(im);
      im.onerror = ()=>reject(new Error('img-decode-failed'));
      im.src = objUrl;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if(!longest || longest <= maxDim) return bytes;
    const scale = maxDim / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth*scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight*scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1];
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }catch(e){
    return bytes;
  }finally{
    if(objUrl) URL.revokeObjectURL(objUrl);
  }
}
// Shared "Media summary" appendix for exports that only ever embed ONE
// representative photo per row/card (Snagging, Schedule of Works) even when
// several exist — appends dedicated pages at the end showing every photo,
// fixed 2x2 grid, exactly 4 per page (each tile roughly a quarter of the
// page). Call this BEFORE any final page-numbering/footer pass so the
// appendix pages pick up the same footer as the rest of the document.
// `photoRefs` is an array of {path, bucket} — bucket lets callers mix
// buckets if they ever need to (site-photos etc).
// `opts` is optional and defaults to the exact prior behavior (full-size
// tiles, original embedded bytes) so existing callers are untouched:
//   sizeScale — shrinks the photo within its tile (tile/grid layout itself
//     is unchanged), e.g. 0.9 for 10% smaller than the default fit.
//   maxDim/quality — when maxDim is set, photos are downsized/recompressed
//     (via pdfFetchImageBytesScaled) to that many pixels on the long side
//     before embedding, which is what actually shrinks the output file —
//     drawing a photo smaller on the page does NOT shrink the embedded
//     bytes, pdf-lib still embeds whatever was fetched at full size.
async function appendMediaSummaryPages(pdfDoc, photoRefs, opts){
  if(!photoRefs || !photoRefs.length) return;
  // ref.readyPath = an already-small version of the photo (Schedule of Works
  // "mid" size): used as it is, with no download of the original and no
  // shrinking on this device.
  await pdfPrefetchImages(photoRefs.filter(ref=>ref.readyPath).map(ref=>publicUrl(ref.bucket||'site-photos', ref.readyPath)).concat(photoRefs.filter(ref=>!ref.readyPath).slice(0, 140).map(ref=>publicUrl(ref.bucket||'site-photos', ref.path))));
  opts = opts || {};
  const sizeScale = opts.sizeScale || 0.8; // Media Summary photos run 0.8x smaller than their cell's max fit by default
  const maxDim = opts.maxDim || null;
  const quality = opts.quality != null ? opts.quality : 0.8;
  const bold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const reg = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const INK = PDFLib.rgb(0.06,0.06,0.07);
  const SLATE = PDFLib.rgb(0.36,0.37,0.41);
  const HEADBAR = PDFLib.rgb(0.925,0.91,0.87);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 42;
  const CONTENT_W = PAGE_W - 2*MARGIN;
  const cols = 2, rows = 2, gutter = 14, capH = 16, headingH = 40;
  const cellW = (CONTENT_W - gutter) / cols;
  const cellH = (PAGE_H - 2*MARGIN - headingH - gutter - capH*rows) / rows;
  let num = 0;
  for(let i=0; i<photoRefs.length; i+=cols*rows){
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;
    if(i===0){
      page.drawRectangle({x:MARGIN, y:y-26, width:CONTENT_W, height:26, color:HEADBAR});
      page.drawText('Media summary', {x:MARGIN+10, y:y-26+8, size:11.5, font:bold, color:INK});
      y -= 26+10;
    } else {
      y -= headingH; // keep every page's grid starting position consistent
    }
    const startY = y;
    const group = photoRefs.slice(i, i+cols*rows);
    for(let r=0; r<rows; r++){
      const rowItems = group.slice(r*cols, r*cols+cols);
      if(!rowItems.length) break;
      const rowTop = startY - r*(cellH+capH+gutter);
      for(let c=0; c<rowItems.length; c++){
        num++;
        const ref = rowItems[c];
        const cx = MARGIN + c*(cellW+gutter);
        try{
          const url = publicUrl(ref.bucket||'site-photos', ref.readyPath || ref.path);
          // opts.readyMaxDim: on very large jobs even the ready-made 800px
          // version is taken down a step (a quick job on a small file) so
          // the finished PDF stays small enough to email.
          const bytes = ref.readyPath ? (opts.readyMaxDim ? await pdfFetchImageBytesScaled(url, opts.readyMaxDim, opts.readyQuality||0.58) : await pdfFetchImageBytes(url))
            : (maxDim ? await pdfFetchImageBytesScaled(url, maxDim, quality) : await pdfFetchImageBytes(url));
          if(bytes){
            let img; try{ img = await pdfDoc.embedJpg(bytes); }catch(e){ img = await pdfDoc.embedPng(bytes); }
            const dim = img.scale(1);
            const sc = Math.min(cellW/dim.width, cellH/dim.height, 1) * sizeScale;
            const w = dim.width*sc, h = dim.height*sc;
            page.drawImage(img, {x:cx+(cellW-w)/2, y:rowTop-cellH+(cellH-h)/2, width:w, height:h});
            page.drawText('Photo '+num, {x:cx, y:rowTop-cellH-13, size:8.5, font:reg, color:SLATE});
          }
        }catch(e){ /* skip photo if it fails to embed */ }
      }
    }
  }
}
// Shared "Signature Record" pages used by both the RAMS and Toolbox Talk
// signed-PDF exports: a disclaimer paragraph followed by a clean
// Name / Signature / Date table (one row per signer), paginating cleanly if
// the signer list runs past a page.
async function drawSignatureTablePages(pdfDoc, opts){
  const bold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const reg = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const RED = PDFLib.rgb(0.784,0.063,0.180);
  const INK = PDFLib.rgb(0.06,0.06,0.07);
  const SLATE = PDFLib.rgb(0.36,0.37,0.41);
  const LINE = PDFLib.rgb(0.85,0.85,0.85);
  const HEADBG = PDFLib.rgb(0.95,0.94,0.91);
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const MARGIN = 50;
  const TABLE_W = PAGE_W - 2*MARGIN;
  const COL_NAME = 160, COL_SIG = 205, COL_DATE = TABLE_W - COL_NAME - COL_SIG;
  const ROW_H = 46, HEADER_H = 24;

  function wrapText(text, font, size, maxWidth){
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for(const w of words){
      const test = cur ? cur+' '+w : w;
      if(font.widthOfTextAtSize(test, size) > maxWidth && cur){ lines.push(cur); cur = w; }
      else cur = test;
    }
    if(cur) lines.push(cur);
    return lines;
  }

  let page, y;
  function drawTableHeader(){
    page.drawRectangle({x:MARGIN, y:y-HEADER_H, width:TABLE_W, height:HEADER_H, color:HEADBG});
    page.drawText('Name', {x:MARGIN+10, y:y-HEADER_H+7, size:9.5, font:bold, color:INK});
    page.drawText('Signature', {x:MARGIN+COL_NAME+10, y:y-HEADER_H+7, size:9.5, font:bold, color:INK});
    page.drawText('Date', {x:MARGIN+COL_NAME+COL_SIG+10, y:y-HEADER_H+7, size:9.5, font:bold, color:INK});
    page.drawLine({start:{x:MARGIN,y:y-HEADER_H}, end:{x:MARGIN+TABLE_W,y:y-HEADER_H}, thickness:1, color:INK});
    page.drawLine({start:{x:MARGIN+COL_NAME,y:y}, end:{x:MARGIN+COL_NAME,y:y-HEADER_H}, thickness:0.5, color:LINE});
    page.drawLine({start:{x:MARGIN+COL_NAME+COL_SIG,y:y}, end:{x:MARGIN+COL_NAME+COL_SIG,y:y-HEADER_H}, thickness:0.5, color:LINE});
    y -= HEADER_H;
  }
  async function newPage(continued){
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 60;
    page.drawText('Signature Record' + (continued ? ' (continued)' : ''), {x:MARGIN, y, size:18, font:bold, color:RED});
    y -= 8;
    page.drawLine({start:{x:MARGIN,y}, end:{x:PAGE_W-MARGIN,y}, thickness:1.5, color:INK});
    y -= 24;
    page.drawText(opts.title, {x:MARGIN, y, size:12, font:bold, color:INK});
    y -= 20;
    if(!continued){
      wrapText(opts.disclaimer, reg, 9.5, TABLE_W).forEach(line=>{
        page.drawText(line, {x:MARGIN, y, size:9.5, font:reg, color:SLATE});
        y -= 13;
      });
      y -= 12;
    }
    drawTableHeader();
  }
  // Optional standalone "Conducted by" row — a PM/admin who ran the
  // session. Drawn AFTER every operative signature row (not up at the top
  // with the disclaimer) — used by the TBT export; other callers simply
  // omit conductedBy.
  async function drawConductedByBox(){
    const boxH = 40;
    if(y - boxH < 70) await newPage(true);
    page.drawRectangle({x:MARGIN, y:y-boxH, width:TABLE_W, height:boxH, color:HEADBG});
    page.drawText('Conducted by: '+opts.conductedBy.name, {x:MARGIN+10, y:y-16, size:10.5, font:bold, color:INK});
    if(opts.conductedBy.signaturePath){
      try{
        const bytes = await pdfFetchImageBytes(publicUrl('signatures', opts.conductedBy.signaturePath));
        if(bytes){
          let img; try{ img = await pdfDoc.embedPng(bytes); }catch(e){ img = await pdfDoc.embedJpg(bytes); }
          const dim = img.scale(1);
          const bh = 22, bw = 120;
          const s2 = Math.min(bw/dim.width, bh/dim.height);
          const w = dim.width*s2, h = dim.height*s2;
          page.drawImage(img, {x:MARGIN+10, y:y-boxH+8, width:w, height:h});
        }
      }catch(e){}
    }
    y -= boxH + 14;
  }
  await newPage(false);
  for(const s of opts.signers){
    if(y - ROW_H < 70) await newPage(true);
    const rowTop = y;
    page.drawLine({start:{x:MARGIN,y:rowTop-ROW_H}, end:{x:MARGIN+TABLE_W,y:rowTop-ROW_H}, thickness:0.5, color:LINE});
    page.drawLine({start:{x:MARGIN+COL_NAME,y:rowTop}, end:{x:MARGIN+COL_NAME,y:rowTop-ROW_H}, thickness:0.5, color:LINE});
    page.drawLine({start:{x:MARGIN+COL_NAME+COL_SIG,y:rowTop}, end:{x:MARGIN+COL_NAME+COL_SIG,y:rowTop-ROW_H}, thickness:0.5, color:LINE});
    if(s.issued){
      // Issued-by row (COSHH): shaded, labelled, sits above everyone else.
      page.drawRectangle({x:MARGIN, y:rowTop-ROW_H, width:TABLE_W, height:ROW_H, color:HEADBG});
      page.drawText('ISSUED BY:', {x:MARGIN+10, y:rowTop-ROW_H/2+5, size:8, font:bold, color:SLATE});
      page.drawText(s.name, {x:MARGIN+10, y:rowTop-ROW_H/2-8, size:10, font:bold, color:INK});
    } else page.drawText(s.name, {x:MARGIN+10, y:rowTop-ROW_H/2-4, size:10, font:reg, color:INK});
    if(s.imagePath){
      try{
        const bytes = await pdfFetchImageBytes(publicUrl('signatures', s.imagePath));
        if(bytes){
          let img; try{ img = await pdfDoc.embedPng(bytes); }catch(e){ img = await pdfDoc.embedJpg(bytes); }
          const dim = img.scale(1);
          const boxH = 30, boxW = COL_SIG-20;
          const s2 = Math.min(boxW/dim.width, boxH/dim.height);
          const w = dim.width*s2, h = dim.height*s2;
          page.drawImage(img, {x:MARGIN+COL_NAME+10, y:rowTop-ROW_H/2-h/2, width:w, height:h});
        }
      }catch(e){ /* fall back to blank signature cell */ }
    }
    page.drawText(s.when, {x:MARGIN+COL_NAME+COL_SIG+10, y:rowTop-ROW_H/2-4, size:9.5, font:reg, color:SLATE});
    y = rowTop - ROW_H;
  }
  y -= 16;
  if(opts.conductedBy) await drawConductedByBox();
  if(y < 60) await newPage(true);
  page.drawText('Generated ' + new Date().toLocaleString('en-GB') + ' — original document pages are unmodified above.', {x:MARGIN, y, size:8.5, font:reg, color:SLATE});
}
// Builds the Snagging Report PDF bytes for the given scope, shared by both
// the "Export" (deliverPdf) and "Email" (#289 — attaches these same bytes
// via send-snags-email) actions so the two never drift apart.
async function buildSnaggingPdfBytes(siteId, scope){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const site = SITES.find(s=>s.id===siteId);
  let qs = 'site_id=eq.'+siteId+'&order=created_at.asc';
  if(scope==='live') qs += '&status=eq.open';
  else if(scope==='closed') qs += '&status=eq.closed';
  else qs += '&status=in.(open,closed)';
  const snags = await dbSelect('snags', qs);
  if(!snags.length){ toast('No snags to export for that filter.'); return null; }
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
    const openCount = snags.filter(s=>s.status==='open').length;
    const closedCount = snags.filter(s=>s.status==='closed').length;

    // Embed the company logo once (falls back to nothing if it can't be fetched/decoded).
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
      page.drawText('SNAGGING REPORT', {x:textX, y:PAGE_H-40, size:9, font:bold, color:WHITE, opacity:0.85});
      pdfDrawFit(page, pdfSiteLabel(site), {x:textX, y:PAGE_H-60, size:16, font:bold, color:WHITE});
      page.drawText(companyName + ' · ' + scopeLabel + ' snags', {x:textX, y:PAGE_H-76, size:9.5, font:reg, color:WHITE, opacity:0.9});
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
    // Summary strip on the first page only.
    const chipW = 150, chipGap = 14, chipY = y - 34;
    [
      {label:'Total snags', value:String(snags.length), bg:CARDBG, fg:INK},
      {label:'Open', value:String(openCount), bg:WARNBG, fg:WARN},
      {label:'Closed', value:String(closedCount), bg:OKBG, fg:OK},
    ].forEach((c,i)=>{
      const x = MARGIN + i*(chipW+chipGap);
      page.drawRectangle({x, y:chipY, width:chipW, height:44, color:c.bg});
      page.drawText(c.value, {x:x+12, y:chipY+22, size:16, font:bold, color:c.fg});
      page.drawText(c.label.toUpperCase(), {x:x+12, y:chipY+8, size:7.5, font:bold, color:c.fg, opacity:0.8});
    });
    y = chipY - 26;

    await pdfPrefetchImages(snags.map(s=>{ const pp = s.status==='closed' && s.closed_photo_path ? s.closed_photo_path : ((s.photo_paths && s.photo_paths[0]) || s.photo_path); return pp ? publicUrl('site-photos', pp) : null; }));
    for(let i=0;i<snags.length;i++){
      const s = snags[i];
      const hasPhoto = !!((s.photo_paths && s.photo_paths.length) || s.photo_path || (s.status==='closed' && s.closed_photo_path));
      const blockH = hasPhoto ? 130 : 78;
      if(y - blockH < 50){ newPage(); }

      const cardTop = y;
      page.drawRectangle({x:MARGIN, y:cardTop-blockH, width:PAGE_W-2*MARGIN, height:blockH, color:CARDBG});
      const pillColor = s.status==='closed' ? OK : WARN;
      const pillBg = s.status==='closed' ? OKBG : WARNBG;
      const textLeft = MARGIN + 16;
      const imgSlot = 84;
      const textWidth = hasPhoto ? (PAGE_W-2*MARGIN) - imgSlot - 32 : (PAGE_W-2*MARGIN) - 32;
      let ty = cardTop - 22;
      const title = (i+1)+'. '+(s.title.length>52 ? s.title.slice(0,49)+'…' : s.title);
      page.drawText(title, {x:textLeft, y:ty, size:12, font:bold, color:INK});
      const pillW = 56;
      page.drawRectangle({x:MARGIN+(PAGE_W-2*MARGIN)-16-pillW, y:ty-3, width:pillW, height:15, color:pillBg});
      page.drawText(s.status.toUpperCase(), {x:MARGIN+(PAGE_W-2*MARGIN)-16-pillW+8, y:ty+1, size:8, font:bold, color:pillColor});
      ty -= 18;
      page.drawText('Location: '+(s.location||'—'), {x:textLeft, y:ty, size:9.5, font:reg, color:SLATE});
      ty -= 14;
      page.drawText('Raised by '+nameOf(s.created_by)+' · '+new Date(s.created_at).toLocaleDateString('en-GB'), {x:textLeft, y:ty, size:9, font:reg, color:SLATE});
      ty -= 14;
      if(s.status==='closed'){
        page.drawText('Closed by '+nameOf(s.closed_by)+(s.closed_at?' · '+new Date(s.closed_at).toLocaleDateString('en-GB'):''), {x:textLeft, y:ty, size:9, font:reg, color:SLATE});
        ty -= 14;
      }
      if(s.pdf_path){
        page.drawText('PDF attachment on file', {x:textLeft, y:ty, size:8.5, font:reg, color:SLATE});
      }

      if(hasPhoto){
        const photoPath = s.status==='closed' && s.closed_photo_path ? s.closed_photo_path : ((s.photo_paths && s.photo_paths[0]) || s.photo_path);
        const imgX = MARGIN+(PAGE_W-2*MARGIN)-16-imgSlot+8;
        const imgY = cardTop-blockH+14;
        const boxSize = 76;
        try{
          const bytes = await pdfFetchImageBytesScaled(publicUrl('site-photos', photoPath), Math.round(boxSize*3), 0.78);
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

    // Media summary appendix — every photo on every snag, not just the one
    // shown on its card above (a snag can have several via photo_paths).
    const snagPhotoRefs = [];
    snags.forEach(s=>{
      (s.photo_paths||[]).forEach(p=>snagPhotoRefs.push({path:p, bucket:'site-photos'}));
      if(!((s.photo_paths||[]).length) && s.photo_path) snagPhotoRefs.push({path:s.photo_path, bucket:'site-photos'});
      if(s.closed_photo_path) snagPhotoRefs.push({path:s.closed_photo_path, bucket:'site-photos'});
    });
    await appendMediaSummaryPages(pdfDoc, snagPhotoRefs, {maxDim:900, quality:0.72});

    pdfDoc.getPages().forEach((p,idx)=>{ page = p; drawFooter((idx+1)+' of '+pdfDoc.getPageCount()); });

    const exportLabel = scope==='live' ? 'Snagging Report (Live)' : scope==='closed' ? 'Snagging Report (Closed)' : 'Snagging Report (All)';
    const filename = exportFilename(site.name, exportLabel, 'pdf');
    pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await pdfDoc.save();
    return {bytes: outBytes, filename};
  }catch(e){
    console.error(e);
    toast('Could not build the PDF.');
    return null;
  }
}
window.exportSnaggingPDF = async function(siteId, scope){
  const built = await buildSnaggingPdfBytes(siteId, scope);
  if(!built) return;
  await deliverPdf(built.bytes, built.filename);
};
let snagEmailBusy = null; // scope currently sending, or null
window.emailSnaggingPDF = async function(siteId, scope){
  if(snagEmailBusy) return;
  const site = SITES.find(s=>s.id===siteId);
  // No recipient-picker modal here (this sends straight to the caller's own
  // inbox) — so the "CC client contact" choice is a quick Yes/No prompt
  // instead of a tick box, only asked at all when the site has a client
  // email on file.
  let ccClientEmail = null;
  if(site && site.client_email){
    const cc = await customConfirm('CC client contact'+((site.client_contact_name||site.client_name)?' ('+(site.client_contact_name||site.client_name)+')':'')+' on this email?', {confirmLabel:'Yes, CC them', cancelLabel:'No'});
    if(cc) ccClientEmail = site.client_email;
  }
  snagEmailBusy = scope; render();
  try{
    const built = await buildSnaggingPdfBytes(siteId, scope);
    if(!built){ snagEmailBusy = null; render(); return; }
    const scopeLabel = scope==='live' ? 'Live' : scope==='closed' ? 'Closed' : 'All';
    // Upload to Storage first and send only a short path, not the PDF's
    // bytes, in the request body — see the matching comment in
    // confirmScheduleEmail for why (a large inline base64 body could hang
    // rather than fail cleanly on the hosted Edge Runtime).
    const storagePath = siteId+'/snagging-exports/'+uid()+'-'+built.filename.replace(/[^a-z0-9.\-]+/gi,'_');
    const stored = await uploadToStorage('mc-documents', storagePath, new Blob([built.bytes], {type:'application/pdf'}), 'application/pdf');
    if(!stored){ snagEmailBusy = null; render(); return; }
    // timeoutMs: 60000 — this function downloads the PDF from Storage and
    // re-encodes it server-side before calling Resend, which can genuinely
    // take longer than the default 20s for a bigger report; see sbFetch.
    const res = await sbFetch('/functions/v1/send-snags-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({filename: built.filename, storage_path: stored, storage_bucket: 'mc-documents', site_name: site?site.name:'', scope_label: scopeLabel, client_cc_email: ccClientEmail})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Email failed — '+(d.error||res.status)); }
    else { toast('Snagging report emailed to '+(d.to||ME.email)); }
  }catch(e){ console.error(e); toast('Email failed — could not reach the server.'); }
  snagEmailBusy = null; render();
};

// Shared by the Export button and the Email button below — builds the PDF
// bytes without delivering them anywhere, so both callers decide what to do
// with the result (download vs. attach to an email).
async function buildSchedulePdfBytes(siteId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const site = SITES.find(s=>s.id===siteId);
  const allTasksUnfiltered = await dbSelect('schedule_tasks', 'site_id=eq.'+siteId+'&order=position.asc.nullslast,created_at.asc');
  if(!allTasksUnfiltered.length){ toast('No tasks to export yet.'); return null; }
  // Export whatever the PM is currently looking at on the Schedule of Works
  // page (scheduleFilter — the same "To Do / In Progress", "Complete", "All"
  // tabs rendered there), rather than always exporting everything regardless
  // of the filter they've selected.
  const FILTER_LABEL = {active:'To Do / In Progress', done:'Complete', all:'All'};
  const filterLabel = FILTER_LABEL[scheduleFilter] || 'All';
  const allTasks = scheduleFilter==='all' ? allTasksUnfiltered
    : scheduleFilter==='done' ? allTasksUnfiltered.filter(t=>t.status==='done')
    : allTasksUnfiltered.filter(t=>t.status==='todo'||t.status==='progress');
  if(!allTasks.length){ toast('No tasks match the current filter ("'+filterLabel+'") to export.'); return null; }
  let photosByTask = {};
  const ids = allTasks.map(t=>t.id).join(',');
  const photos = await dbSelect('schedule_photos', 'task_id=in.('+ids+')&order=uploaded_at.asc');
  photos.forEach(p=>{ (photosByTask[p.task_id]=photosByTask[p.task_id]||[]).push(p); });
  // Start the photo downloads now (several at a time) so they're ready by
  // the time each task is drawn; drawing picks them up from the shared cache.
  // Small versions where they exist: the row tiles use the 200px one and the
  // Media Summary the 800px one, so a 300-photo job downloads a few MB
  // instead of every full-size original.
  // (Full-size originals of older photos are only pre-loaded for the first
  // 60, so a big old job can't fill a phone's memory.)
  const legacy = photos.filter(p=>!p.thumb_path).slice(0, 60);
  pdfPrefetchImages(photos.filter(p=>p.thumb_path).map(p=>sowPhotoUrl(p,'thumb')).concat(photos.filter(p=>p.mid_path).map(p=>sowPhotoUrl(p,'mid')), legacy.map(p=>publicUrl('site-photos', p.storage_path))));
  toast(photos.length > 40 ? 'Building PDF — '+photos.length+' photos…' : 'Building PDF…');
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
    const PROG = PDFLib.rgb(0.16,0.40,0.70);
    const PROGBG = PDFLib.rgb(0.87,0.92,0.98);
    const TODO = PDFLib.rgb(0.38,0.39,0.44);
    const TODOBG = PDFLib.rgb(0.90,0.90,0.92);
    const PAGE_W = 595.28, PAGE_H = 841.89;
    const MARGIN = 42;
    const companyName = (ORG && ORG.name) || 'OpHUB';
    const todoTasks = allTasks.filter(t=>t.status==='todo');
    const progTasks = allTasks.filter(t=>t.status==='progress');
    const doneTasks = allTasks.filter(t=>t.status==='done');

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
      page.drawText('SCHEDULE OF WORKS — PROGRESS REPORT' + (scheduleFilter!=='all' ? '  ·  ' + filterLabel.toUpperCase() + ' ONLY' : ''), {x:textX, y:PAGE_H-40, size:9, font:bold, color:WHITE, opacity:0.85});
      pdfDrawFit(page, pdfSiteLabel(site), {x:textX, y:PAGE_H-60, size:16, font:bold, color:WHITE});
      page.drawText(companyName + ' · as of ' + new Date().toLocaleDateString('en-GB'), {x:textX, y:PAGE_H-76, size:9.5, font:reg, color:WHITE, opacity:0.9});
    }
    function drawFooter(pageNum){
      page.drawLine({start:{x:MARGIN,y:34}, end:{x:PAGE_W-MARGIN,y:34}, thickness:0.75, color:FAINT});
      page.drawText('Generated via OpHUB', {x:MARGIN, y:20, size:8, font:reg, color:SLATE});
      page.drawText('Page ' + pageNum, {x:PAGE_W-MARGIN-40, y:20, size:8, font:reg, color:SLATE});
    }
    let pageNum = 0;
    // Tracks whichever section (To Do / In Progress / Complete) is currently
    // being drawn, so that when a section's task rows spill onto a new page
    // the section header gets repeated at the top of it. Without this, a
    // page break mid-section left rows with no heading at all — which is
    // what made In Progress photos look like they'd landed inside the
    // Complete section on the next page.
    let currentSection = null;
    function drawSectionHeaderText(label, color){
      page.drawText(label, {x:MARGIN, y, size:11.5, font:bold, color});
      y -= 6;
      page.drawLine({start:{x:MARGIN,y:y-2}, end:{x:PAGE_W-MARGIN,y:y-2}, thickness:1, color:FAINT});
      y -= 16;
    }
    function newPage(){
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      pageNum++;
      drawHeaderBand();
      y = PAGE_H - 118;
      if(currentSection) drawSectionHeaderText(currentSection.label, currentSection.color);
    }
    newPage();

    // Summary strip on the first page only.
    const chipW = 112, chipGap = 10, chipY = y - 34;
    [
      {label:'Total tasks', value:String(allTasks.length), bg:CARDBG, fg:INK},
      {label:'To do', value:String(todoTasks.length), bg:TODOBG, fg:TODO},
      {label:'In progress', value:String(progTasks.length), bg:PROGBG, fg:PROG},
      {label:'Complete', value:String(doneTasks.length), bg:OKBG, fg:OK},
    ].forEach((c,i)=>{
      // The four boxes sit centred across the page (they used to start at
      // the left margin), with the figure and label centred in each box.
      const x = (PAGE_W - (4*chipW + 3*chipGap))/2 + i*(chipW+chipGap);
      page.drawRectangle({x, y:chipY, width:chipW, height:44, color:c.bg});
      const lbl = c.label.toUpperCase();
      page.drawText(c.value, {x:x+(chipW-bold.widthOfTextAtSize(c.value,16))/2, y:chipY+22, size:16, font:bold, color:c.fg});
      page.drawText(lbl, {x:x+(chipW-bold.widthOfTextAtSize(lbl,7))/2, y:chipY+8, size:7, font:bold, color:c.fg, opacity:0.85});
    });
    // Overall progress bar.
    y = chipY - 22;
    // Worked out across every task on the job, not the tab being exported —
    // it used to read 0% on a To Do / In Progress export and 100% on a
    // Complete one, whatever the real figure was.
    const pct = allTasksUnfiltered.length ? Math.round((allTasksUnfiltered.filter(t=>t.status==='done').length/allTasksUnfiltered.length)*100) : 0;
    const barW = PAGE_W - 2*MARGIN;
    page.drawText('Overall progress: ' + pct + '%', {x:MARGIN, y, size:9, font:bold, color:INK});
    y -= 10;
    page.drawRectangle({x:MARGIN, y:y-8, width:barW, height:8, color:TODOBG});
    page.drawRectangle({x:MARGIN, y:y-8, width:barW*(pct/100), height:8, color:OK});
    y -= 28;

    function sectionHeader(label, color){
      currentSection = {label, color};
      if(y - 24 < 60) newPage(); // newPage() draws the header itself via currentSection
      else drawSectionHeaderText(label, color);
    }

    // Truncates text to fit maxWidth using the font's real character widths
    // (not a flat char-count guess) so long task names never run under the
    // status pill or the progress photo thumbnail.
    function truncateToWidth(font, text, size, maxWidth){
      if(font.widthOfTextAtSize(text, size) <= maxWidth) return text;
      let lo = 0, hi = text.length;
      while(lo < hi){
        const mid = Math.ceil((lo+hi)/2);
        const candidate = text.slice(0, mid) + '…';
        if(font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid; else hi = mid-1;
      }
      return text.slice(0, lo) + '…';
    }
    // Each task's photos are grouped by the stage they were taken at
    // (recorded on the photo itself — see the `stage` column added for this
    // — not by the task's current status, so a task that's since moved on
    // to Complete still shows its earlier Before/In Progress photos under
    // their own headings instead of everything collapsing into one bucket).
    // A photo saved before this feature existed has no stage on file; it
    // falls back to the task's current status, same as the one-time DB
    // backfill did.
    const STAGE_SECTIONS = [
      {key:'todo', label:'Before'},
      {key:'progress', label:'In Progress'},
      {key:'done', label:'Completed Photos'},
    ];
    function bucketPhotosByStage(photos, fallbackStatus){
      const buckets = {todo:[], progress:[], done:[]};
      photos.forEach(p=>{
        const s = (p.stage==='todo'||p.stage==='progress'||p.stage==='done') ? p.stage : fallbackStatus;
        (buckets[s] || buckets.todo).push(p);
      });
      return buckets;
    }
    // Every photo for every stage is drawn directly on the task row now —
    // no "+N more in appendix" cap. A task with a lot of photos just grows a
    // taller card, splitting onto a fresh page as a "(continued)" card if a
    // whole stage's photos don't fit in the room left on the current page
    // (splitting is only ever at a stage boundary, never mid-row — a single
    // stage with an extreme photo count can still overflow its card, which
    // is an acceptable rare edge case rather than mid-row pagination math).
    async function drawTaskRow(t, pillColor, pillBg){
      const taskPhotos = photosByTask[t.id] || [];
      const stageBuckets = bucketPhotosByStage(taskPhotos, t.status);
      const cardWidth = PAGE_W-2*MARGIN;
      const cardPad = 14;
      const textLeft = MARGIN + cardPad;
      const thumbSize = 74, thumbGap = 8; // another 1.3x on top of the previous 57pt (which itself was 1.3x of the original 44pt)
      const usableW = cardWidth - 2*cardPad;
      const perRow = Math.max(1, Math.floor((usableW+thumbGap)/(thumbSize+thumbGap)));
      // Laid out row by row: a card fills whatever room is left on the page
      // and carries on as "(continued)" at the top of the next one. (It used
      // to move a whole stage of photos to the next page if it didn't fit,
      // which on jobs with lots of photos left half of every page blank.)
      const headerH = 30;
      const ROW_H = thumbSize+thumbGap, LABEL_H = 14, BOTTOM = 60, PAD_B = 12;
      const items = [];
      STAGE_SECTIONS.forEach(st=>{
        const ph = stageBuckets[st.key];
        if(!ph.length) return;
        for(let r=0; r*perRow<ph.length; r++) items.push({stage:st, total:ph.length, photos:ph.slice(r*perRow, (r+1)*perRow), first:r===0});
      });
      let idx = 0, isFirstChunk = true;
      while(isFirstChunk || idx < items.length){
        const chunkHeaderH = isFirstChunk ? headerH : 20;
        // Not even room for the heading and one row of photos: start a new page.
        const need = chunkHeaderH + (idx < items.length ? LABEL_H + ROW_H : 0) + PAD_B;
        if(y - need < BOTTOM) newPage();
        const room = y - BOTTOM - PAD_B;
        let used = chunkHeaderH, end = idx;
        while(end < items.length){
          const it = items[end];
          const h = ROW_H + ((it.first || end===idx) ? LABEL_H : 0) + ((it.first && end>idx) ? 6 : 0);
          if(used + h > room && end > idx) break;
          used += h; end++;
        }
        const blockH = used + PAD_B;
        const cardTop = y;
        page.drawRectangle({x:MARGIN, y:cardTop-blockH, width:cardWidth, height:blockH, color:CARDBG});
        let ty = cardTop - 20;
        if(isFirstChunk){
          // An In Progress task with a percentage set shows it in the pill
          // ("IN PROGRESS 40%"), which needs a slightly wider pill.
          const pctLabel = (t.status==='progress' && t.percent_complete!=null) ? ' '+t.percent_complete+'%' : '';
          const pillW = pctLabel ? 100 : 76;
          const pillX = MARGIN+cardWidth-16-pillW;
          const nameMaxWidth = pillX - 8 - textLeft;
          const name = truncateToWidth(bold, t.name, 11, nameMaxWidth);
          page.drawText(name, {x:textLeft, y:ty, size:11, font:bold, color:INK});
          page.drawRectangle({x:pillX, y:ty-3, width:pillW, height:15, color:pillBg});
          const pillLabel = t.status==='todo' ? 'TO DO' : t.status==='progress' ? 'IN PROGRESS'+pctLabel : 'COMPLETE';
          page.drawText(pillLabel, {x:pillX+8, y:ty+1, size:7.5, font:bold, color:pillColor});
          ty -= 22;
        } else {
          const contName = truncateToWidth(bold, t.name, 10, cardWidth-2*cardPad-100);
          page.drawText(contName + ' (continued)', {x:textLeft, y:ty, size:10, font:bold, color:SLATE});
          ty -= 16;
        }
        for(let k=idx; k<end; k++){
          const it = items[k];
          if(it.first || k===idx){
            if(it.first && k>idx) ty -= 6; // a little space between one stage's photos and the next heading
            page.drawText(it.stage.label.toUpperCase() + ' (' + it.total + ')' + (it.first ? '' : ' continued'), {x:textLeft, y:ty, size:8, font:bold, color:SLATE});
            ty -= 12;
          }
          let cx = textLeft;
          for(const ph of it.photos){
            try{
              // A ready-made 200px tile needs no shrinking; older photos still get shrunk here.
              const bytes = ph.thumb_path ? await pdfFetchImageBytes(sowPhotoUrl(ph,'thumb')) : await pdfFetchImageBytesScaled(publicUrl('site-photos', ph.storage_path), Math.round(thumbSize*3), 0.78);
              if(bytes){
                let img; try{ img = await pdfDoc.embedJpg(bytes); }catch(e){ img = await pdfDoc.embedPng(bytes); }
                const dim = img.scale(1);
                const sc = thumbSize/Math.max(dim.width, dim.height);
                const w = dim.width*sc, h = dim.height*sc;
                page.drawImage(img, {x:cx+(thumbSize-w)/2, y:ty-thumbSize+(thumbSize-h)/2, width:w, height:h});
              }
            }catch(e){ /* skip photo if it fails to embed */ }
            cx += thumbSize+thumbGap;
          }
          ty -= ROW_H;
        }
        idx = end;
        y = cardTop - blockH - 10;
        isFirstChunk = false;
      }
    }

    // Tasks are listed in the Schedule of Works' own order — loose tasks
    // first, then each section in turn, exactly as on screen — and NOT
    // regrouped by status (it used to put To Do, then In Progress, then
    // Complete, which scattered a section's tasks across the report). Each
    // row still carries its own coloured status pill.
    const rowColours = t=> t.status==='done' ? [OK, OKBG] : (t.status==='progress' ? [PROG, PROGBG] : [TODO, TODOBG]);
    const sowSections = await dbSelect('schedule_sections', 'site_id=eq.'+siteId+'&order=position.asc.nullslast,created_at.asc');
    const sowGroups = [];
    const loose = allTasks.filter(t=>!t.section_id);
    if(loose.length) sowGroups.push({label:'SCHEDULE OF WORKS', tasks: loose});
    sowSections.forEach(sec=>{
      const list = allTasks.filter(t=>t.section_id===sec.id);
      if(list.length) sowGroups.push({label: String(sec.name||'Section').toUpperCase(), tasks: list});
    });
    // Anything pointing at a section that no longer exists still gets listed.
    const known = new Set(sowSections.map(x=>x.id));
    const orphan = allTasks.filter(t=>t.section_id && !known.has(t.section_id));
    if(orphan.length) sowGroups.push({label:'OTHER', tasks: orphan});
    for(const g of sowGroups){
      sectionHeader(truncateToWidth(bold, g.label, 11.5, PAGE_W - 2*MARGIN - 50) + ' (' + g.tasks.length + ')', INK);
      for(const t of g.tasks){ const [fg, bg] = rowColours(t); await drawTaskRow(t, fg, bg); }
      y -= 6;
    }

    // Media summary appendix — every progress photo on every task, not just
    // the single latest one shown on each task's row above.
    const schedulePhotoRefs = [];
    allTasks.forEach(t=>{ (photosByTask[t.id]||[]).forEach(p=>schedulePhotoRefs.push({path:p.storage_path, bucket:'site-photos', readyPath:p.mid_path||null})); });
    // sizeScale 0.9 = the "summary photos" drawn 0.9x smaller within their
    // tile per the PM's request. maxDim/quality is the real fix for emails
    // failing on large reports — every photo on the job gets embedded here,
    // so recompressing down to the resolution this 2x2 grid can actually
    // show (rather than each photo's full original camera resolution) is
    // what brings the attachment size down.
    const bigJob = schedulePhotoRefs.length > 120;
    await appendMediaSummaryPages(pdfDoc, schedulePhotoRefs, {sizeScale:0.8, maxDim: bigJob ? 600 : 900, quality: bigJob ? 0.6 : 0.72, readyMaxDim: bigJob ? 600 : null, readyQuality:0.6});

    pdfDoc.getPages().forEach((p,idx)=>{ page = p; drawFooter((idx+1)+' of '+pdfDoc.getPageCount()); });

    const filename = exportFilename(site.name, 'Schedule of Works' + (scheduleFilter!=='all' ? ' - '+filterLabel : ''), 'pdf');
    pdfDoc.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await pdfDoc.save();
    return {outBytes, filename, site};
  }catch(e){
    console.error(e);
    toast('Could not build the PDF.');
    return null;
  }
}
window.exportSchedulePDF = async function(siteId){
  const built = await buildSchedulePdfBytes(siteId);
  if(built) await deliverPdf(built.outBytes, built.filename);
};
// Email Report — same recipient-tick-list pattern as the material-order
// re-email prompt: a persistent DOM node outside render() so typing/ticking
// isn't reset by a re-render, letting the PM tick several colleagues (or
// type any address) rather than being limited to their own inbox.
window.openScheduleEmailPrompt = async function(siteId){
  await loadAllProfiles();
  const site = SITES.find(s=>s.id===siteId);
  const managers = Object.values(PROFILES).filter(p=>(p.role==='pm'||p.role==='admin') && p.email && !isEstimator(p));
  let ov = document.getElementById('scheduleEmailModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'scheduleEmailModalOverlay';
    ov.className = 'geo-modal-overlay';
    ov.onclick = (e)=>{ if(e.target===ov) window.closeScheduleEmailPrompt(); };
    document.body.appendChild(ov);
  }
  const ticked = managers.filter(p=>p.id===ME.id).map(p=>p.id);
  ov.innerHTML = `
    <div class="geo-modal-card">
      <h3>Email Schedule of Works Report</h3>
      <p class="stub">Tick who should receive it, or add another address below.</p>
      <div style="max-height:180px;overflow-y:auto;margin-bottom:10px;">
        ${managers.map(p=>`
          <label style="display:flex;align-items:center;gap:8px;padding:6px 2px;font-size:13px;font-weight:600;cursor:pointer;">
            <input type="checkbox" class="scheduleEmailTick" value="${escapeHtml(p.email)}" ${ticked.includes(p.id)?'checked':''}>
            ${escapeHtml(p.name)} <span class="stub" style="margin:0;">(${escapeHtml(p.email)})</span>
          </label>
        `).join('') || `<p class="stub">No other PMs/admins found.</p>`}
      </div>
      <div class="formfield"><label class="field-label">Add another address</label><input type="email" id="scheduleEmailExtraInput" placeholder="name@example.com"></div>
      ${ccClientTickHtml(site, 'scheduleEmailCcClient')}
      <button class="darkbtn" id="scheduleEmailConfirmBtn" style="width:100%;" onclick="confirmScheduleEmail('${siteId}')">Confirm &amp; Send</button>
      <button class="geo-modal-cancel" onclick="closeScheduleEmailPrompt()">Cancel</button>
    </div>`;
  ov.style.display = 'flex';
};
window.closeScheduleEmailPrompt = function(){
  const ov = document.getElementById('scheduleEmailModalOverlay');
  if(ov) ov.style.display = 'none';
};
window.confirmScheduleEmail = async function(siteId){
  const ticks = Array.from(document.querySelectorAll('.scheduleEmailTick:checked')).map(el=>el.value);
  const extraInput = document.getElementById('scheduleEmailExtraInput');
  const extra = extraInput ? extraInput.value.trim() : '';
  if(extra){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extra)){ toast('Enter a valid email address.'); return; }
    ticks.push(extra);
  }
  const recipients = Array.from(new Set(ticks));
  if(!recipients.length){ toast('Tick or enter at least one recipient.'); return; }
  const btn = document.getElementById('scheduleEmailConfirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Building PDF…'; }
  const built = await buildSchedulePdfBytes(siteId);
  if(!built){ if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; } return; }
  // 2026-10-02 — this used to base64-encode the whole PDF and send it
  // inline in this request's JSON body. That turned out to be the actual
  // cause of "email failed": a multi-MB base64 string inside an Edge
  // Function's request body doesn't cleanly 413 on this platform, it just
  // hangs until the browser's own fetch gives up — which looks exactly
  // like "could not reach the server" even on a perfectly good connection.
  // Now the PDF is uploaded to Storage first (a plain binary POST, which
  // Storage handles fine at any realistic size) and the email function
  // only gets a short path to download server-side — a tiny request body
  // regardless of how big the report is, so there's no longer a practical
  // size ceiling on this side (only Resend's own ~40MB-per-email cap,
  // which the function surfaces as a clear error if it's ever actually hit).
  if(btn) btn.textContent = 'Uploading PDF…';
  const storagePath = siteId+'/schedule-exports/'+uid()+'-'+built.filename.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('mc-documents', storagePath, new Blob([built.outBytes], {type:'application/pdf'}), 'application/pdf');
  if(!stored){
    // uploadToStorage already toasted the specific reason (timeout,
    // expired session, etc.) — nothing more to add here.
    if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
    return;
  }
  if(btn) btn.textContent = 'Sending…';
  try{
    // timeoutMs: 60000 — this function downloads the PDF from Storage and
    // re-encodes it server-side before calling Resend, which can genuinely
    // take longer than the default 20s for a bigger report; see sbFetch.
    const res = await sbFetch('/functions/v1/send-schedule-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({
      site_id: siteId, filename: built.filename, storage_path: stored, storage_bucket: 'mc-documents', recipients,
      client_cc_email: ccClientEmailIfTicked(SITES.find(s=>s.id===siteId), 'scheduleEmailCcClient'),
    })});
    let d = null, parseFailed = false;
    try{ d = await res.json(); }catch(parseErr){ parseFailed = true; }
    if(res.ok && d && !d.error){
      const card = document.querySelector('#scheduleEmailModalOverlay .geo-modal-card');
      if(card){
        card.innerHTML = `<h3>✓ Email sent</h3><p class="stub" style="margin:0 0 12px;">The Schedule of Works report was emailed to ${recipients.length} recipient${recipients.length>1?'s':''}.</p><button class="darkbtn" style="width:100%;" onclick="closeScheduleEmailPrompt()">Done</button>`;
      } else { closeScheduleEmailPrompt(); toast('Email sent'); }
    } else if(parseFailed){
      console.error('send-schedule-email: non-JSON response, status', res.status);
      toast('Email failed — unexpected response from the server (status '+res.status+'). Please try again.');
      if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
    } else {
      console.error('send-schedule-email failed:', (d&&d.error) || res.status);
      toast('Email failed — '+((d&&d.error) ? String(d.error).slice(0,140) : 'try again.'));
      if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
    }
  }catch(e){
    // A genuine network-level failure — fetch itself never got a response
    // at all (offline, DNS failure, connection dropped mid-request).
    console.error(e);
    toast('Email failed — could not reach the server. Check your connection and try again.');
    if(btn){ btn.disabled = false; btn.textContent = 'Confirm & Send'; }
  }
};
