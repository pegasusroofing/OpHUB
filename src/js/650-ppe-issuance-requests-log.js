/* ================= PPE (issuance, requests, log) =================
   PPE issuances are deliberately org-wide on SELECT (see RLS) rather than
   filtered by has_site_access, because the whole point is that an
   operative's current PPE list travels with them to whatever site they're
   next assigned to, and a PM/admin needs to see it regardless of which site
   originally issued it. Site of issue is still recorded (site_id) so it can
   be filtered for a per-site export. */
const PPE_STANDARD_ITEMS = ['Gloves','Hi-Vis Vest','Dust Mask','Hard Hat','Safety Boots'];
let ppeIssueOpen = false;
let ppeIssueOperativeIds = []; // multi-tick (#261) — issue the same PPE to several operatives in one action
let ppeIssueSelectedItems = [];
let ppeIssueCustomItem = '';
let ppeRequestOpen = false;
let ppeRequestItem = '';
let ppeRequestCustom = '';
let ppeRequestDate = '';
let ppeTeamOpenFor = {}; // operative id -> whether their issuance history is expanded (PM/admin view)
let ppeRequestsOpen = true;
let ppeExportOperativeIds = []; // empty = everyone
let ppeExportFilterOpen = false;
let selectedPpeIds = new Set(); // ticked ppe_issuances rows, for combined export/email
let bulkPpeExportBusy = false;
let bulkPpeEmailBusy = false;
window.togglePpeSelect = function(id){
  if(selectedPpeIds.has(id)) selectedPpeIds.delete(id); else selectedPpeIds.add(id);
  render();
};
window.deletePpeIssuance = async function(issuanceId){
  if(!await customConfirm('Delete this PPE issuance record? This can\'t be undone.')) return;
  const rows = await dbSelect('ppe_issuances', 'id=eq.'+issuanceId+'&select=site_id,user_id');
  const ppeRow = rows[0];
  const ok = await dbDelete('ppe_issuances', issuanceId);
  if(ok){ selectedPpeIds.delete(issuanceId); toast('Record deleted'); if(ppeRow) logSiteActivity(ppeRow.site_id, 'ppe_issuance_deleted', `Deleted PPE issuance record for ${nameOf(ppeRow.user_id)}`); render(); }
};
window.exportSelectedPpe = async function(siteId){
  if(!selectedPpeIds.size) return;
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  bulkPpeExportBusy = true; render();
  toast('Building PDF…');
  try{
    const ids = Array.from(selectedPpeIds);
    const merged = await PDFLib.PDFDocument.create();
    let any = false;
    for(const id of ids){
      const built = await buildPpeIssuancePdf(id);
      if(!built) continue;
      const src = await PDFLib.PDFDocument.load(built.bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(p=>merged.addPage(p));
      any = true;
    }
    if(!any){ toast('Could not build any of the selected records.'); bulkPpeExportBusy=false; render(); return; }
    const site = SITES.find(s=>s.id===siteId);
    const filename = exportFilename(site?site.name:'', `PPE Issued (${ids.length})`, 'pdf');
    merged.setTitle(filename.replace(/\.pdf$/i,''));
    const outBytes = await merged.save();
    await deliverPdf(outBytes, filename);
    selectedPpeIds = new Set();
  }catch(e){ console.error(e); toast('Could not build the combined PDF.'); }
  bulkPpeExportBusy = false; render();
};
window.emailSelectedPpe = async function(){
  if(!selectedPpeIds.size) return;
  bulkPpeEmailBusy = true; render();
  toast('Building PDFs…');
  try{
    const ids = Array.from(selectedPpeIds);
    const attachments = [];
    for(const id of ids){
      const built = await buildPpeIssuancePdf(id);
      if(built){
        let binary=''; const chunk=0x8000;
        for(let i=0;i<built.bytes.length;i+=chunk) binary += String.fromCharCode.apply(null, built.bytes.subarray(i,i+chunk));
        attachments.push({filename: built.filename, content_base64: btoa(binary)});
      }
    }
    if(!attachments.length){ toast('Could not build any of the selected records.'); bulkPpeEmailBusy=false; render(); return; }
    const res = await sbFetch('/functions/v1/send-report-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({attachments})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Email failed — '+(d.error||res.status)); }
    else { toast(`${attachments.length} record(s) emailed to ${ME.email}`); selectedPpeIds = new Set(); }
  }catch(e){ toast('Email failed — could not reach the server.'); }
  bulkPpeEmailBusy = false; render();
};
// Requested PPE (ppe_requests), selectable/exportable the same way issued
// PPE already is (#198) — #263 extends that multi-tick export/email flow to
// the requests list too. Requests don't have a signed-issuance PDF to reuse,
// so this builds its own light one-page summary PDF instead.
let selectedPpeRequestIds = new Set();
let bulkPpeReqExportBusy = false, bulkPpeReqEmailBusy = false;
window.togglePpeRequestSelect = function(id){
  if(selectedPpeRequestIds.has(id)) selectedPpeRequestIds.delete(id); else selectedPpeRequestIds.add(id);
  render();
};
async function buildPpeRequestsSummaryPdf(siteId, requests){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  await loadAllProfiles();
  const site = SITES.find(s=>s.id===siteId);
  const pdfDoc = await PDFLib.PDFDocument.create();
  const fonts = await havsPdfFonts(pdfDoc);
  const logoImg = await havsFetchLogoImg(pdfDoc);
  const {bold, reg, INK, SLATE, LINE, BRAND, WHITE} = fonts;
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 44;
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({x:0, y:PAGE_H-80, width:PAGE_W, height:80, color:BRAND});
  if(logoImg){
    const dim = logoImg.scale(1); const s = HAVS_LOGO_SIZE/Math.max(dim.width, dim.height);
    const w = dim.width*s, h = dim.height*s;
    page.drawRectangle({x:HAVS_LOGO_RIGHT_X, y:PAGE_H-72, width:HAVS_LOGO_SIZE, height:HAVS_LOGO_SIZE, color:WHITE});
    page.drawImage(logoImg, {x:HAVS_LOGO_RIGHT_X+(HAVS_LOGO_SIZE-w)/2, y:PAGE_H-72+(HAVS_LOGO_SIZE-h)/2, width:w, height:h});
  }
  page.drawText('REQUESTED PPE', {x:MARGIN, y:PAGE_H-34, size:9, font:bold, color:WHITE, opacity:0.85});
  pdfDrawFit(page, pdfSiteLabel(site), {x:MARGIN, y:PAGE_H-54, size:16, font:bold, color:WHITE});
  let y = PAGE_H-110;
  requests.forEach(r=>{
    page.drawText(nameOf(r.user_id)+' — '+r.item_name, {x:MARGIN, y, size:11, font:bold, color:INK});
    y -= 14;
    page.drawText('Status: '+cap1(r.status)+(r.date_needed?' · Needed by '+new Date(r.date_needed+'T00:00:00').toLocaleDateString('en-GB'):''), {x:MARGIN, y, size:9, font:reg, color:SLATE});
    y -= 10;
    page.drawLine({start:{x:MARGIN,y}, end:{x:PAGE_W-MARGIN,y}, thickness:0.5, color:LINE});
    y -= 16;
  });
  page.drawText('Generated via OpHUB', {x:MARGIN, y:20, size:8, font:reg, color:SLATE});
  const bytes = await pdfDoc.save();
  const filename = exportFilename(site?site.name:'', `Requested PPE (${requests.length})`, 'pdf');
  return {bytes, filename};
}
window.exportSelectedPpeRequests = async function(siteId){
  if(!selectedPpeRequestIds.size) return;
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  bulkPpeReqExportBusy = true; render();
  try{
    const ids = Array.from(selectedPpeRequestIds);
    const requests = await dbSelect('ppe_requests', 'id=in.('+ids.join(',')+')&select=*');
    const {bytes, filename} = await buildPpeRequestsSummaryPdf(siteId, requests);
    await deliverPdf(bytes, filename);
    selectedPpeRequestIds = new Set();
  }catch(e){ console.error(e); toast('Could not build the PDF.'); }
  bulkPpeReqExportBusy = false; render();
};
window.emailSelectedPpeRequests = async function(siteId){
  if(!selectedPpeRequestIds.size) return;
  bulkPpeReqEmailBusy = true; render();
  try{
    const ids = Array.from(selectedPpeRequestIds);
    const requests = await dbSelect('ppe_requests', 'id=in.('+ids.join(',')+')&select=*');
    const {bytes, filename} = await buildPpeRequestsSummaryPdf(requests.length?requests[0].site_id:null, requests);
    let binary=''; const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk));
    const res = await sbFetch('/functions/v1/send-report-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({attachments:[{filename, content_base64:btoa(binary)}]})});
    const d = await res.json();
    if(!res.ok || d.error){ toast('Email failed — '+(d.error||res.status)); }
    else { toast('Requested PPE emailed to '+ME.email); selectedPpeRequestIds = new Set(); }
  }catch(e){ toast('Email failed — could not reach the server.'); }
  bulkPpeReqEmailBusy = false; render();
};
window.togglePpeIssueOpen = function(){ ppeIssueOpen = !ppeIssueOpen; if(ppeIssueOpen){ ppeIssueOperativeIds=[]; ppeIssueSelectedItems=[]; ppeIssueCustomItem=''; } render(); };
window.togglePpeIssueItem = function(item){ ppeIssueSelectedItems = ppeIssueSelectedItems.includes(item) ? ppeIssueSelectedItems.filter(i=>i!==item) : [...ppeIssueSelectedItems, item]; render(); };
window.setPpeIssueCustomItem = function(v){ ppeIssueCustomItem = v; };
window.togglePpeIssueOperative = function(id){ ppeIssueOperativeIds = ppeIssueOperativeIds.includes(id) ? ppeIssueOperativeIds.filter(x=>x!==id) : [...ppeIssueOperativeIds, id]; render(); };
window.togglePpeTeamOpenFor = function(id){ ppeTeamOpenFor[id] = !ppeTeamOpenFor[id]; render(); };
window.togglePpeRequestsOpen = function(){ ppeRequestsOpen = !ppeRequestsOpen; render(); };
window.togglePpeExportFilterOpen = function(){ ppeExportFilterOpen = !ppeExportFilterOpen; render(); };
window.togglePpeExportOperativeId = function(id){ ppeExportOperativeIds = ppeExportOperativeIds.includes(id) ? ppeExportOperativeIds.filter(x=>x!==id) : [...ppeExportOperativeIds, id]; render(); };
window.clearPpeExportOperativeFilter = function(){ ppeExportOperativeIds = []; render(); };
window.togglePpeRequestOpen = function(){ ppeRequestOpen = !ppeRequestOpen; if(ppeRequestOpen){ ppeRequestItem=''; ppeRequestCustom=''; ppeRequestDate=''; } render(); };
window.setPpeRequestItem = function(v){ ppeRequestItem = v; render(); };
window.setPpeRequestCustom = function(v){ ppeRequestCustom = v; };
window.setPpeRequestDate = function(v){ ppeRequestDate = v; };

// A user's "current" PPE: for each distinct item name, the most recent
// signed issuance that included it — matches "live update across sites",
// since it's recomputed from the full org-wide issuance history, not tied
// to any one site.
function currentPpeForUser(issuances, userId){
  const mine = issuances.filter(i=>i.user_id===userId && i.status==='signed').sort((a,b)=>new Date(b.issued_at)-new Date(a.issued_at));
  const seen = {};
  mine.forEach(i=>{ (i.items||[]).forEach(item=>{ if(!seen[item]) seen[item] = i.issued_at; }); });
  return Object.keys(seen).sort();
}
async function renderPpe(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canManage = isManager(ME);
  await loadAllProfiles();
  const allOperatives = Object.values(PROFILES).filter(p=>p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  // Site-assigned operatives (for the "issue to" picker and the team list) —
  // everyone assigned to this site, PM/admin included on the list only if
  // they're an operative-role account too (rare), so filter to role.
  const assignedRows = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
  const assignedIds = new Set(assignedRows.map(a=>a.user_id));
  const siteOperatives = allOperatives.filter(p=>assignedIds.has(p.id));

  const [allIssuances, allRequests] = await Promise.all([
    dbSelect('ppe_issuances', canManage ? 'order=issued_at.desc' : 'user_id=eq.'+ME.id+'&order=issued_at.desc'),
    dbSelect('ppe_requests', canManage ? 'site_id=eq.'+siteId+'&order=created_at.desc' : 'user_id=eq.'+ME.id+'&order=created_at.desc'),
  ]);

  if(__gen !== RENDER_GEN) return;

  if(!canManage){
    // ===== Operative view: My PPE =====
    const myCurrent = currentPpeForUser(allIssuances, ME.id);
    const pending = allIssuances.filter(i=>i.user_id===ME.id && i.status==='pending_signature');
    const myRequests = allRequests;
    document.getElementById('app').innerHTML = shell(`
      <p class="sectiontitle" style="margin-top:0;">My Current PPE</p>
      <div class="card">
        ${myCurrent.length ? `<div style="display:flex;flex-wrap:wrap;gap:10px;">${myCurrent.map(i=>`<span class="plaintag">${escapeHtml(i)}</span>`).join('')}</div>` : `<div class="empty">Nothing issued yet.</div>`}
      </div>
      ${pending.length ? `
      <p class="sectiontitle">Awaiting Your Signature</p>
      ${pending.map(i=>`
        <div class="card">
          <div style="font-weight:700;font-size:12.5px;">${(i.items||[]).map(escapeHtml).join(', ')}</div>
          <div class="meta">Issued ${new Date(i.issued_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} by ${escapeHtml(nameOf(i.issued_by))}</div>
          <button class="darkbtn" style="margin-top:8px;" onclick="signPpeIssuance('${i.id}')">I confirm receipt of this PPE — Sign</button>
        </div>
      `).join('')}
      ` : ''}
      <p class="sectiontitle">Request PPE</p>
      ${ppeRequestOpen ? `
      <div class="card">
        <div class="formfield" style="margin-top:0;"><label class="field-label">Item</label>
          <select onchange="setPpeRequestItem(this.value)">
            <option value="">— Choose —</option>
            ${PPE_STANDARD_ITEMS.map(it=>`<option value="${escapeHtml(it)}" ${ppeRequestItem===it?'selected':''}>${escapeHtml(it)}</option>`).join('')}
            <option value="__other" ${ppeRequestItem==='__other'?'selected':''}>Other…</option>
          </select>
        </div>
        ${ppeRequestItem==='__other' ? `<div class="formfield"><input type="text" id="ppeRequestCustomInput" placeholder="Item name" value="${escapeHtml(ppeRequestCustom)}" oninput="setPpeRequestCustom(this.value)"></div>` : ''}
        <div class="formfield" onclick="openDatePickerRow(this)"><label class="field-label">Date needed</label><input type="date" id="ppeRequestDateInput" value="${escapeHtml(ppeRequestDate)}" onchange="setPpeRequestDate(this.value)"></div>
        <div class="row-gap">
          <button class="darkbtn" style="flex:1;" onclick="submitPpeRequest('${siteId}')">Submit Request</button>
          <button class="ghostbtn" style="flex:1;" onclick="togglePpeRequestOpen()">Cancel</button>
        </div>
      </div>
      ` : `<button class="darkbtn" onclick="togglePpeRequestOpen()">+ Request PPE</button>`}
      ${myRequests.length ? `
      <p class="sectiontitle">My Requests</p>
      ${myRequests.map(r=>`
        <div class="sitecard" style="padding:8px 10px;flex-direction:column;align-items:stretch;">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <span class="name" style="font-weight:800;">${escapeHtml(r.item_name)}</span>
            <span class="pill ${r.status==='fulfilled'?'on':(r.status==='cancelled'?'':'off')}">${cap1(r.status)}</span>
          </div>
          <div class="meta">${r.date_needed ? 'Needed by '+new Date(r.date_needed+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : 'No date given'}</div>
        </div>
      `).join('')}
      ` : ''}
    `, {title:'PPE', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs`, siteId, activeTab:'more'});
    return;
  }

  // ===== PM/Admin view =====
  const pendingReqs = allRequests.filter(r=>r.status==='pending');
  document.getElementById('app').innerHTML = shell(`
    ${ppeIssueOpen ? `
    <p class="sectiontitle" style="margin-top:0;">Issue PPE</p>
    <div class="card">
      <label class="field-label">Operative(s) — tick one or more to issue the same PPE to all of them</label>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;max-height:220px;overflow-y:auto;">
        ${siteOperatives.map(p=>`
          <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;">
            <input type="checkbox" style="width:16px;height:16px;margin:0;" ${ppeIssueOperativeIds.includes(p.id)?'checked':''} onchange="togglePpeIssueOperative('${p.id}')"> ${escapeHtml(p.name)}
          </label>
        `).join('') || `<div class="empty" style="padding:10px;">No operatives assigned to this site.</div>`}
      </div>
      <label class="field-label">Items</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        ${PPE_STANDARD_ITEMS.map(it=>`
          <label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--line);border-radius:20px;font-size:12.5px;font-weight:700;cursor:pointer;background:${ppeIssueSelectedItems.includes(it)?'var(--brand1)':'#fff'};color:${ppeIssueSelectedItems.includes(it)?'#fff':'var(--ink)'};">
            <input type="checkbox" style="margin:0;" ${ppeIssueSelectedItems.includes(it)?'checked':''} onchange="togglePpeIssueItem('${it}')"> ${escapeHtml(it)}
          </label>
        `).join('')}
      </div>
      <div class="formfield"><label class="field-label">Add another item</label><input type="text" id="ppeIssueCustomInput" placeholder="e.g. Safety Glasses" value="${escapeHtml(ppeIssueCustomItem)}" oninput="setPpeIssueCustomItem(this.value)"></div>
      <div class="row-gap">
        <button class="darkbtn" style="flex:1;" ${ppeIssueBusy?'disabled':''} onclick="submitPpeIssuance('${siteId}')">${ppeIssueBusy?'Issuing…':('Issue PPE'+(ppeIssueOperativeIds.length>1?' to '+ppeIssueOperativeIds.length:''))}</button>
        <button class="ghostbtn" style="flex:1;" onclick="togglePpeIssueOpen()">Cancel</button>
      </div>
      <p class="stub">Issuing marks this as fulfilled straight away — hand the items to each operative as you issue them.</p>
    </div>
    ` : `<button class="darkbtn" style="margin-top:0;" onclick="togglePpeIssueOpen()">+ Issue PPE</button>`}

    <p class="ddrow" onclick="togglePpeRequestsOpen()"><span class="arrow">${ppeRequestsOpen?'▼':'▶'}</span> PPE Requests ${pendingReqs.length?'('+pendingReqs.length+' pending)':''}</p>
    ${ppeRequestsOpen ? `<div class="card">
      <p class="stub" style="margin:0 0 8px;">Fulfilled requests move into Site Issued PPE below, under the operative's name. Tick requests to export/email them, same as issued PPE.</p>
      ${selectedPpeRequestIds.size ? `
      <div class="row-gap" style="margin-bottom:8px;">
        <button class="darkbtn" style="flex:1;font-size:11.5px;padding:7px;" ${bulkPpeReqExportBusy?'disabled':''} onclick="exportSelectedPpeRequests('${siteId}')">${bulkPpeReqExportBusy?'Building…':`Export ${selectedPpeRequestIds.size} (PDF)`}</button>
        <button class="ghostbtn exportbtn" style="flex:1;font-size:11.5px;padding:7px;" ${bulkPpeReqEmailBusy?'disabled':''} onclick="emailSelectedPpeRequests()">${bulkPpeReqEmailBusy?'Emailing…':`Email ${selectedPpeRequestIds.size}`}</button>
      </div>
      ` : ''}
      ${allRequests.filter(r=>r.status!=='fulfilled').length ? allRequests.filter(r=>r.status!=='fulfilled').map(r=>`
        <div class="sitecard" style="padding:8px 10px;flex-wrap:wrap;">
          <input type="checkbox" style="width:16px;height:16px;flex:0 0 16px;margin-right:2px;" ${selectedPpeRequestIds.has(r.id)?'checked':''} onchange="togglePpeRequestSelect('${r.id}')">
          <div class="info"><div class="name">${escapeHtml(nameOf(r.user_id))} — ${escapeHtml(r.item_name)}</div><div class="addr">${r.date_needed?'Needed by '+new Date(r.date_needed+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'No date given'}</div></div>
          ${r.status==='pending' ? `
          <div style="display:flex;gap:6px;">
            <button class="darkbtn" style="width:auto;padding:6px 10px;font-size:11px;" onclick="fulfillPpeRequest('${r.id}')">Fulfil</button>
            <button class="ghostbtn" style="width:auto;padding:6px 10px;font-size:11px;" onclick="cancelPpeRequest('${r.id}')">Cancel</button>
          </div>
          ` : `<span class="pill ${r.status==='fulfilled'?'on':''}">${cap1(r.status)}</span>`}
        </div>
      `).join('') : `<div class="empty" style="padding:10px;">No requests yet.</div>`}
    </div>` : ''}

    <p class="sectiontitle">Site Issued PPE — ${escapeHtml(site.name)}</p>
    ${siteOperatives.length ? siteOperatives.map(p=>{
      const current = currentPpeForUser(allIssuances, p.id);
      const issuedHistory = allIssuances.filter(i=>i.user_id===p.id).map(i=>({kind:'issuance', id:i.id, items:i.items||[], status:i.status, at:i.issued_at}));
      const fulfilledReqHistory = allRequests.filter(r=>r.user_id===p.id && r.status==='fulfilled').map(r=>({kind:'request', id:r.id, items:[r.item_name], status:'fulfilled', at:r.fulfilled_at||r.created_at}));
      const history = [...issuedHistory, ...fulfilledReqHistory].sort((a,b)=>new Date(b.at)-new Date(a.at));
      const pendingCount = issuedHistory.filter(i=>i.status==='pending_signature').length;
      const selectedHere = history.filter(i=>i.kind==='issuance' && selectedPpeIds.has(i.id));
      return `
      <p class="ddrow" onclick="togglePpeTeamOpenFor('${p.id}')"><span class="arrow">${ppeTeamOpenFor[p.id]?'▼':'▶'}</span> ${escapeHtml(p.name)}</p>
      ${ppeTeamOpenFor[p.id] ? `<div class="card">
        ${selectedHere.length ? `
        <div class="row-gap" style="margin-bottom:8px;">
          <button class="darkbtn" style="flex:1;font-size:11.5px;padding:7px;" ${bulkPpeExportBusy?'disabled':''} onclick="exportSelectedPpe('${siteId}')">${bulkPpeExportBusy?'Building…':`Export ${selectedHere.length} (PDF)`}</button>
          <button class="ghostbtn exportbtn" style="flex:1;font-size:11.5px;padding:7px;" ${bulkPpeEmailBusy?'disabled':''} onclick="emailSelectedPpe()">${bulkPpeEmailBusy?'Emailing…':`Email ${selectedHere.length}`}</button>
        </div>
        ` : ''}
        ${history.map(i=>`
          <div class="sitecard" style="padding:5px 8px;flex-direction:column;align-items:stretch;font-size:11px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
              <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                ${i.kind==='issuance' ? `<input type="checkbox" style="width:14px;height:14px;flex:0 0 14px;margin:0;" ${selectedPpeIds.has(i.id)?'checked':''} onchange="togglePpeSelect('${i.id}')">` : ''}
                <span style="font-weight:700;font-size:11px;">${i.items.map(escapeHtml).join(', ')}${i.kind==='request'?' (via request)':''}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex:0 0 auto;">
                <span class="pill" style="font-size:9px;padding:2px 7px;" >${i.kind==='request'?'Fulfilled':(i.status==='signed'?'Signed':'Pending')}</span>
                ${canManage && i.kind==='issuance' ? `<span class="taskicon danger" style="width:18px;height:18px;font-size:11px;" title="Delete" onclick="deletePpeIssuance('${i.id}')">🗑</span>` : ''}
              </div>
            </div>
            <div class="meta" style="font-size:9.5px;margin-top:1px;">Issued ${new Date(i.at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}${i.kind==='issuance'&&i.status==='signed'?' · exportable':''}</div>
            ${i.kind==='issuance'&&i.status==='signed' ? `<div class="viewlink" style="cursor:pointer;font-size:10.5px;" onclick="exportPpeIssuancePdf('${i.id}')">Export signed PDF ↗</div>` : ''}
          </div>
        `).join('') || `<div class="empty" style="padding:10px;">No history yet.</div>`}
      </div>` : ''}
      `;
    }).join('') : `<div class="empty">No operatives assigned to this site yet.</div>`}

    <p class="stub" style="margin-top:14px;font-style:italic;">A PPE register can be downloaded from the <span style="text-decoration:underline;cursor:pointer;font-style:normal;" onclick="openAdminPpeRegister('${siteId}')">Admin Centre</span>.</p>
  `, {title:'PPE', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs`, siteId, activeTab:'more'});
}
function cap1(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : ''; }
let ppeIssueBusy = false;
window.submitPpeIssuance = async function(siteId){
  const userIds = ppeIssueOperativeIds;
  const customInput = document.getElementById('ppeIssueCustomInput');
  const custom = customInput ? customInput.value.trim() : '';
  const items = [...ppeIssueSelectedItems];
  if(custom) items.push(custom);
  if(!userIds.length || !items.length){ toast('Tick at least one operative and one item.'); return; }
  // Issuing PPE is done by the PM in person, handing the items over there and
  // then — so it auto-fulfils immediately rather than sitting stuck in
  // "pending_signature" until the operative happens to open the app. The
  // operative can still see it was issued under My Current PPE straight away.
  // #261: one row per ticked operative, same items, issued in a single batch insert.
  ppeIssueBusy = true; render();
  const now = new Date().toISOString();
  const rows = await dbInsert('ppe_issuances', userIds.map(userId=>({org_id:ME.org_id, site_id:siteId, user_id:userId, items, issued_by:ME.id, status:'signed', signed_at:now})));
  ppeIssueBusy = false;
  if(rows){ toast('PPE issued to '+userIds.length+' operative'+(userIds.length===1?'':'s')); ppeIssueOpen=false; ppeIssueSelectedItems=[]; ppeIssueCustomItem=''; ppeIssueOperativeIds=[]; }
  render();
};
window.signPpeIssuance = async function(issuanceId){
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const row = await dbUpdate('ppe_issuances', issuanceId, {status:'signed', signed_at:new Date().toISOString(), signature_image_path:ME.signature_path});
  if(row){ toast('Signed — thank you'); render(); }
};
window.submitPpeRequest = async function(siteId){
  let itemName = ppeRequestItem;
  if(itemName==='__other'){
    const customInput = document.getElementById('ppeRequestCustomInput');
    itemName = customInput ? customInput.value.trim() : '';
  }
  const dateInput = document.getElementById('ppeRequestDateInput');
  const dateNeeded = dateInput ? dateInput.value : ppeRequestDate;
  if(!itemName){ toast('Choose or type an item.'); return; }
  const rows = await dbInsert('ppe_requests', {org_id:ME.org_id, site_id:siteId, user_id:ME.id, item_name:itemName, date_needed: dateNeeded||null});
  if(rows){ toast('Request sent'); ppeRequestOpen=false; render(); }
};
window.fulfillPpeRequest = async function(requestId){
  const row = await dbUpdate('ppe_requests', requestId, {status:'fulfilled', fulfilled_at:new Date().toISOString(), fulfilled_by:ME.id});
  if(row){ toast('Marked fulfilled'); render(); }
};
window.cancelPpeRequest = async function(requestId){
  const row = await dbUpdate('ppe_requests', requestId, {status:'cancelled', fulfilled_at:new Date().toISOString(), fulfilled_by:ME.id});
  if(row){ toast('Request cancelled'); render(); }
};
window.exportPpeSiteReport = async function(siteId){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  const site = SITES.find(s=>s.id===siteId);
  await loadAllProfiles();
  const assignedRows = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id');
  const assignedIds = new Set(assignedRows.map(a=>a.user_id));
  let operatives = Object.values(PROFILES).filter(p=>p.role==='operative' && assignedIds.has(p.id));
  if(ppeExportOperativeIds.length) operatives = operatives.filter(p=>ppeExportOperativeIds.includes(p.id));
  if(!operatives.length){ toast('No operatives to export.'); return; }
  const allIssuances = await dbSelect('ppe_issuances', 'order=issued_at.desc');
  const data = [];
  operatives.forEach(op=>{
    const history = allIssuances.filter(i=>i.user_id===op.id);
    if(!history.length){ data.push({Operative:op.name, Item:'', 'Issued Date':'', Status:'No PPE issued', 'Issued By':''}); return; }
    history.forEach(i=>{
      (i.items||['—']).forEach(item=>{
        data.push({
          Operative: op.name,
          Item: item,
          'Issued Date': new Date(i.issued_at).toLocaleDateString('en-GB'),
          Status: i.status==='signed' ? 'Signed' : 'Pending Signature',
          'Issued By': nameOf(i.issued_by),
        });
      });
    });
  });
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:20},{wch:16},{wch:12},{wch:16},{wch:18}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PPE');
  await deliverExcelFile(wb, exportFilename(site.name, 'PPE Report', 'xlsx'));
};
async function buildPpeIssuancePdf(issuanceId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const rows = await dbSelect('ppe_issuances', 'id=eq.'+issuanceId+'&select=*');
  const i = rows[0]; if(!i) return null;
  await loadAllProfiles();
  const site = SITES.find(s=>s.id===i.site_id);
  const pdfDoc = await PDFLib.PDFDocument.create();
  const fonts = await havsPdfFonts(pdfDoc);
  const {bold, reg, INK, SLATE, LINE} = fonts;
  const logoImg = await havsFetchLogoImg(pdfDoc);
  const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 44, CONTENT_W = PAGE_W-2*MARGIN;
  const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1);
  const WHITE = PDFLib.rgb(1,1,1);
  const page = pdfDoc.addPage([PAGE_W,PAGE_H]);
  page.drawRectangle({x:0, y:PAGE_H-92, width:PAGE_W, height:92, color:BRAND});
  if(logoImg){
    const dim = logoImg.scale(1); const s = 40/Math.max(dim.width, dim.height);
    const w = dim.width*s, h = dim.height*s;
    page.drawRectangle({x:MARGIN, y:PAGE_H-76, width:40, height:40, color:WHITE});
    page.drawImage(logoImg, {x:MARGIN+(40-w)/2, y:PAGE_H-76+(40-h)/2, width:w, height:h});
  }
  const textX = logoImg ? MARGIN+52 : MARGIN;
  page.drawText('PPE ISSUANCE RECORD', {x:textX, y:PAGE_H-40, size:9, font:bold, color:WHITE, opacity:0.85});
  page.drawText(nameOf(i.user_id), {x:textX, y:PAGE_H-60, size:16, font:bold, color:WHITE});
  pdfDrawFit(page, pdfSiteLabel(site) + ' · ' + new Date(i.issued_at).toLocaleDateString('en-GB'), {x:textX, y:PAGE_H-76, size:9.5, font:reg, color:WHITE, opacity:0.9});
  let y = PAGE_H-130;
  page.drawText('Items issued', {x:MARGIN, y, size:9.5, font:bold, color:SLATE}); y -= 16;
  (i.items||[]).forEach(item=>{ page.drawText('• '+item, {x:MARGIN, y, size:11.5, font:reg, color:INK}); y -= 16; });
  y -= 8;
  page.drawLine({start:{x:MARGIN,y:y+8}, end:{x:PAGE_W-MARGIN,y:y+8}, thickness:0.5, color:LINE});
  y -= 8;
  page.drawText('Issued by '+nameOf(i.issued_by)+' on '+new Date(i.issued_at).toLocaleDateString('en-GB'), {x:MARGIN, y, size:10, font:reg, color:SLATE}); y -= 34;
  page.drawText('I confirm I have received the above PPE items and will use/maintain them as instructed.', {x:MARGIN, y, size:9.5, font:reg, color:SLATE}); y -= 22;
  page.drawText('Signed by '+nameOf(i.user_id)+' · '+(i.signed_at?new Date(i.signed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):''), {x:MARGIN, y, size:9.5, font:bold, color:SLATE});
  y -= 20;
  if(i.signature_image_path){
    try{
      const bytes = await pdfFetchImageBytes(publicUrl('signatures', i.signature_image_path));
      if(bytes){ let img; try{ img = await pdfDoc.embedPng(bytes); }catch(e){ img = await pdfDoc.embedJpg(bytes); } const dim = img.scale(1); const s = 28/dim.height; page.drawImage(img, {x:MARGIN, y:y-28, width:dim.width*s, height:28}); }
    }catch(e){}
  }
  page.drawLine({start:{x:MARGIN,y:34}, end:{x:PAGE_W-MARGIN,y:34}, thickness:0.75, color:PDFLib.rgb(0.85,0.84,0.80)});
  page.drawText('Generated via OpHUB', {x:MARGIN, y:20, size:8, font:reg, color:SLATE});
  const bytes = await pdfDoc.save();
  const filename = exportFilename(site?site.name:'', 'PPE - '+nameOf(i.user_id)+' - '+new Date(i.issued_at).toLocaleDateString('en-GB'), 'pdf');
  return {bytes, filename};
}
window.exportPpeIssuancePdf = async function(issuanceId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  toast('Building PDF…');
  try{
    const built = await buildPpeIssuancePdf(issuanceId);
    if(!built){ toast('Record not found.'); return; }
    await deliverPdf(built.bytes, built.filename);
  }catch(e){ console.error('PPE PDF export failed', e); toast('Export failed — '+(e && e.message ? e.message : 'unknown error')); }
};
