/* ================= PRICE BUILDER — shared helpers (WIP feature) ================= */
const PRICE_UNIT_LABEL = {lm:'lm', m2:'m2', each:'ea', item:'item'};
// Bonnets & Valleys is only relevant on a plain-tile roof — it stays hidden
// on the tick page until one of the 2 "Plain Tiles" dropdown options (one
// per Strip/Felt & Batten build-up) has actually been ticked on this sheet,
// rather than cluttering every sheet regardless of roof type. Valleys itself
// (with its GRP/Lead dropdown options) is NOT plain-tile-specific — valleys
// exist on interlocking-tile roofs too — so unlike Bonnets & Valleys it
// always shows; it used to be hidden by the same rule, which is what Andy
// was reporting as "I can't see the valleys".
const PB_PLAIN_TILE_KEYS = ['dc9f0840-07e5-4e75-80f2-57779696cfb4::368563ce-5118-4789-8cd4-b112a7a62d48', '572111b5-8768-44ce-af25-f2b917fd18fc::bc79a3a6-6ba9-49e8-ad9b-cc0c3b28645b'];
const PB_HIDE_UNLESS_PLAIN_TILE_IDS = new Set(['ee8d64ba-87c8-4ead-af3f-e68e3b62f777']); // Bonnets & Valleys only
function pbPlainTileTicked(){ return PB_PLAIN_TILE_KEYS.some(k=>!!pbWorking.items[k]); }
// Categories render in this fixed order rather than alphabetically — any
// category not in this list (e.g. one someone adds later) is appended after,
// alphabetically among themselves.
const PRICE_CATEGORY_ORDER = ['Pitched Roofing','Roofline','Leadwork','Loft Insulation','General'];
const PB_OPEN_BY_DEFAULT = ['Pitched Roofing','Roofline','Leadwork','Loft Insulation']; // every other section (General, Additional Items…) starts closed
function sortPriceRateCategories(cats){
  cats.sort((a,b)=>{
    const ai = PRICE_CATEGORY_ORDER.indexOf(a.name), bi = PRICE_CATEGORY_ORDER.indexOf(b.name);
    if(ai>-1 && bi>-1) return ai-bi;
    if(ai>-1) return -1;
    if(bi>-1) return 1;
    return a.name.localeCompare(b.name);
  });
  return cats;
}
// Users list in Admin Centre: role-change/remove buttons are hidden until
// the person's row is tapped, so the list isn't cluttered with buttons by default.
let userActionsOpenFor = {};
window.toggleUserActions = function(userId){ userActionsOpenFor[userId] = !userActionsOpenFor[userId]; render(); };
let operativeToolsOpenByUser = {}; // per-operative nested dropdown toggle inside the Operatives list's Operative Tools row
window.toggleOperativeToolsUser = function(userId){ operativeToolsOpenByUser[userId] = !operativeToolsOpenByUser[userId]; render(); };
// Jumps straight from PUWER (Tool Inspection) into the Operatives list's
// Operative Tools section, already expanded and scrolled to the operative
// in question — PM/admin only, matching who can even see that section in
// the first place. (Moved out of Admin Centre — see renderOperativesList.)
// Jumps from a site's PPE page into Admin Centre's PPE Log/Register section,
// already expanded, with ?from= carrying the exact page to return to (#260)
// — same mechanism as Certifications (#207) and Admin Centre (#248).
window.openAdminPpeRegister = function(siteId){
  if(!isManager(ME)) return;
  go('#/team/libraries/ppelog?from='+encodeURIComponent('#/site/'+siteId+'/ppe'));
};
window.openAdminOperativeTools = function(userId){
  if(!isManager(ME)) return;
  operativeToolsListOpen = true;
  operativeToolsOpenByUser[userId] = true;
  pendingAdminOperativeToolsScrollUserId = userId;
  go('#/operatives');
};
let pendingAdminOperativeToolsScrollUserId = null;
// PM/Admin adding a tool on an operative's behalf, from Admin Centre —
// only one operative's "+ Add Tool" form is open at a time.
let operativeToolsAddOpenFor = null; // operative user_id, or null
let operativeToolsPhotoFile = null;
// Same drafting fix as My Tools (#253): capture typed name/serial before the
// photo-choose re-render replaces the input markup, so it comes back seeded.
let operativeToolsNameDraft = '';
let operativeToolsSerialDraft = '';
window.onOperativeToolsPhotoChosen = function(input, userId){
  const nameEl = document.getElementById('opToolName-'+userId), serialEl = document.getElementById('opToolSerial-'+userId);
  if(nameEl) operativeToolsNameDraft = nameEl.value;
  if(serialEl) operativeToolsSerialDraft = serialEl.value;
  operativeToolsPhotoFile = (input.files && input.files[0]) || null;
  render();
};
window.addOperativeToolFor = async function(userId){
  const name = document.getElementById('opToolName-'+userId).value.trim();
  const serial = document.getElementById('opToolSerial-'+userId).value.trim();
  if(!name){ toast('Enter a tool name.'); return; }
  let photoPath = null;
  if(operativeToolsPhotoFile){
    let dataUrl;
    try{ dataUrl = await compressImage(operativeToolsPhotoFile); }
    catch(e){ toast('Could not process that photo — tool was not saved.'); return false; }
    photoPath = await uploadDataUrl('operative-tools', ME.org_id+'/'+userId+'/'+crypto.randomUUID()+'.jpg', dataUrl);
    if(!photoPath){ toast('Photo failed to upload — check your connection and try again.'); return false; }
  }
  const rows = await dbInsert('operative_tools', {org_id:ME.org_id, user_id:userId, name, serial_number:serial||null, photo_path:photoPath, created_by:ME.id});
  if(rows){ toast('Tool added'); operativeToolsAddOpenFor=null; operativeToolsPhotoFile=null; operativeToolsNameDraft=''; operativeToolsSerialDraft=''; render(); }
  return !!rows;
};
// Add/replace a photo on an already-existing tool record from Admin Centre (#252).
let operativeToolsEditPhotoBusyId = null;
window.onOperativeToolsEditPhotoChosen = async function(input, toolId, userId){
  const file = input.files && input.files[0];
  if(!file) return;
  operativeToolsEditPhotoBusyId = toolId; render();
  let photoPath = null;
  try{
    const dataUrl = await compressImage(file);
    photoPath = await uploadDataUrl('operative-tools', ME.org_id+'/'+userId+'/'+crypto.randomUUID()+'.jpg', dataUrl);
  }catch(e){ photoPath = null; }
  if(photoPath) await dbUpdate('operative_tools', toolId, {photo_path:photoPath});
  operativeToolsEditPhotoBusyId = null;
  toast(photoPath ? 'Photo updated' : 'Photo upload failed');
  render();
};
// PM/admin adding a tool for this operative directly from their PUWER
// inspection page — same shared insert as Admin Centre's Operative Tools
// (so it lands in the operative's own tool file / My Tools too), just
// followed by a re-pull of this page's draft so the new tool shows up in
// the inspection table immediately instead of needing a re-visit.
window.addPuwerOperativeTool = async function(siteId, userId){
  const ok = await addOperativeToolFor(userId);
  if(ok && puwerFillDraft){ await loadPuwerFillDraft(siteId, userId, puwerFillDraft.weekStart); render(); }
};
// Check-In Logs (Admin Centre) — a weekly or monthly view of every
// operative's check-in/out times across every site, for PMs and Admins.
let checkinLogMode = 'weekly'; // 'weekly' | 'monthly'
let checkinLogOffset = 0; // 0 = current week/month, -1 = previous, etc.
function startOfMonth(d, monthOffset){
  const dt = new Date(d);
  dt.setDate(1); dt.setHours(0,0,0,0);
  dt.setMonth(dt.getMonth() + (monthOffset||0));
  return dt.getTime();
}
function checkinLogRange(mode, offset){
  if(mode==='monthly'){
    const start = startOfMonth(Date.now(), offset);
    const end = startOfMonth(Date.now(), offset+1);
    const label = new Date(start).toLocaleDateString('en-GB', {month:'long', year:'numeric'});
    return {start, end, label};
  }
  const thisWeekStart = startOfWeek(Date.now());
  const start = thisWeekStart + offset*7*24*60*60*1000;
  const end = start + 7*24*60*60*1000;
  const endDisplay = new Date(end - 24*60*60*1000);
  const label = `${new Date(start).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} – ${endDisplay.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}`;
  return {start, end, label};
}
window.setCheckinLogMode = function(mode){ checkinLogMode = mode; checkinLogOffset = 0; render(); };
window.shiftCheckinLog = function(dir){ checkinLogOffset += dir; render(); };
// Optional custom date range — when both ends are set it overrides the
// Weekly/Monthly quick view entirely; clearing either goes straight back
// to the standard week/month behaviour above.
let checkinLogFromDate = '';
let checkinLogToDate = '';
window.setCheckinLogFromDate = function(v){ checkinLogFromDate = v; render(); };
window.setCheckinLogToDate = function(v){ checkinLogToDate = v; render(); };
window.clearCheckinLogDateFilter = function(){ checkinLogFromDate = ''; checkinLogToDate = ''; render(); };
function checkinLogEffectiveRange(){
  if(checkinLogFromDate && checkinLogToDate){
    const start = new Date(checkinLogFromDate+'T00:00:00').getTime();
    const end = new Date(checkinLogToDate+'T00:00:00').getTime() + 24*60*60*1000;
    const label = `${new Date(checkinLogFromDate+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} – ${new Date(checkinLogToDate+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}`;
    return {start, end, label, custom:true};
  }
  return checkinLogRange(checkinLogMode, checkinLogOffset);
}
// Multi-select operative filter — empty selection means "everyone".
let checkinLogOperativeIds = [];
let checkinLogOperativeFilterOpen = false;
window.toggleCheckinLogOperativeFilterOpen = function(){ checkinLogOperativeFilterOpen = !checkinLogOperativeFilterOpen; render(); };
window.toggleCheckinLogOperativeId = function(id){
  checkinLogOperativeIds = checkinLogOperativeIds.includes(id) ? checkinLogOperativeIds.filter(x=>x!==id) : [...checkinLogOperativeIds, id];
  render();
};
window.clearCheckinLogOperativeFilter = function(){ checkinLogOperativeIds = []; render(); };
// Pairs up each operative's raw in/out rows (oldest first) into
// {inTs, outTs, hours} sessions per calendar day. A dangling check-in with
// no matching check-out yet (still on site, or they forgot to check out)
// is shown with outTs:null rather than silently dropped.
function pairCheckinSessions(rows){
  const sorted = [...rows].sort((a,b)=>new Date(a.ts)-new Date(b.ts));
  const sessions = [];
  let openIn = null;
  for(const r of sorted){
    if(r.type==='in'){
      if(openIn) sessions.push({inTs:openIn.ts, outTs:null, siteId:openIn.site_id});
      openIn = r;
    } else if(r.type==='out'){
      if(openIn){ sessions.push({inTs:openIn.ts, outTs:r.ts, siteId:openIn.site_id}); openIn = null; }
      else sessions.push({inTs:null, outTs:r.ts, siteId:r.site_id});
    }
  }
  if(openIn) sessions.push({inTs:openIn.ts, outTs:null, siteId:openIn.site_id});
  return sessions;
}
// PPE Log (Admin Centre) — weekly/monthly/yearly view of PPE issued across
// every site, filterable by operative(s). Mirrors the Check-In Logs
// weekly/monthly pattern above, plus a Yearly option.
let ppeLogMode = 'monthly';
let ppeLogOffset = 0;
function startOfYear(d, yearOffset){
  const dt = new Date(d);
  dt.setMonth(0,1); dt.setHours(0,0,0,0);
  dt.setFullYear(dt.getFullYear() + (yearOffset||0));
  return dt.getTime();
}
function ppeLogRange(mode, offset){
  if(mode==='yearly'){
    const start = startOfYear(Date.now(), offset);
    const end = startOfYear(Date.now(), offset+1);
    return {start, end, label: String(new Date(start).getFullYear())};
  }
  if(mode==='monthly'){
    const start = startOfMonth(Date.now(), offset);
    const end = startOfMonth(Date.now(), offset+1);
    const label = new Date(start).toLocaleDateString('en-GB', {month:'long', year:'numeric'});
    return {start, end, label};
  }
  const thisWeekStart = startOfWeek(Date.now());
  const start = thisWeekStart + offset*7*24*60*60*1000;
  const end = start + 7*24*60*60*1000;
  const endDisplay = new Date(end - 24*60*60*1000);
  const label = `${new Date(start).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} – ${endDisplay.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}`;
  return {start, end, label};
}
window.setPpeLogMode = function(mode){ ppeLogMode = mode; ppeLogOffset = 0; render(); };
window.shiftPpeLog = function(dir){ ppeLogOffset += dir; render(); };
let ppeLogOperativeIds = [];
let ppeLogOperativeFilterOpen = false;
window.togglePpeLogOperativeFilterOpen = function(){ ppeLogOperativeFilterOpen = !ppeLogOperativeFilterOpen; render(); };
window.togglePpeLogOperativeId = function(id){
  ppeLogOperativeIds = ppeLogOperativeIds.includes(id) ? ppeLogOperativeIds.filter(x=>x!==id) : [...ppeLogOperativeIds, id];
  render();
};
window.clearPpeLogOperativeFilter = function(){ ppeLogOperativeIds = []; render(); };
window.exportPpeLog = async function(){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  await loadAllProfiles();
  const range = ppeLogRange(ppeLogMode, ppeLogOffset);
  let rows = await dbSelect('ppe_issuances', 'issued_at=gte.'+new Date(range.start).toISOString()+'&issued_at=lt.'+new Date(range.end).toISOString()+'&order=issued_at.asc&select=*');
  if(ppeLogOperativeIds.length) rows = rows.filter(r=>ppeLogOperativeIds.includes(r.user_id));
  if(!rows.length){ toast('No PPE issued in that range.'); return; }
  const data = [];
  rows.forEach(r=>{
    const site = SITES.find(s=>s.id===r.site_id);
    (r.items||['—']).forEach(item=>{
      data.push({
        Operative: nameOf(r.user_id),
        Item: item,
        Site: site ? site.name : '',
        'Issued Date': new Date(r.issued_at).toLocaleDateString('en-GB'),
        Status: r.status==='signed' ? 'Signed' : 'Pending Signature',
        'Issued By': nameOf(r.issued_by),
      });
    });
  });
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:20},{wch:16},{wch:18},{wch:12},{wch:16},{wch:18}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PPE Log');
  await deliverExcelFile(wb, exportFilename('', 'PPE Log ('+range.label+')', 'xlsx'));
};
// A snapshot register — one row per operative, one column per PPE item —
// showing whether they currently hold it (their most recent signed
// issuance of that item), unlike the PPE Log above which is a
// chronological record of every issuance in a period.
window.exportPpeRegister = async function(){
  if(!(await loadLib('XLSX'))){ toast('Excel library failed to load — check connection.'); return; }
  await loadAllProfiles();
  const operatives = Object.values(PROFILES).filter(p=>p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  if(!operatives.length){ toast('No operatives to report on.'); return; }
  const allIssuances = await dbSelect('ppe_issuances', 'status=eq.signed&order=issued_at.desc&select=*');
  const itemNames = Array.from(new Set([...PPE_STANDARD_ITEMS, ...allIssuances.flatMap(i=>i.items||[])])).sort();
  const data = operatives.map(op=>{
    const current = currentPpeForUser(allIssuances, op.id);
    const currentSet = new Set(current);
    const row = {Operative: op.name};
    itemNames.forEach(item=>{ row[item] = currentSet.has(item) ? 'Issued' : ''; });
    const extras = current.filter(c=>!itemNames.includes(c));
    row['Other Items Held'] = extras.join(', ');
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:20}, ...itemNames.map(()=>({wch:12})), {wch:20}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PPE Register');
  await deliverExcelFile(wb, exportFilename('', 'PPE Register', 'xlsx'));
};
window.exportPpeLogPdf = async function(){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  await loadAllProfiles();
  const range = ppeLogRange(ppeLogMode, ppeLogOffset);
  let rows = await dbSelect('ppe_issuances', 'issued_at=gte.'+new Date(range.start).toISOString()+'&issued_at=lt.'+new Date(range.end).toISOString()+'&order=issued_at.asc&select=*');
  if(ppeLogOperativeIds.length) rows = rows.filter(r=>ppeLogOperativeIds.includes(r.user_id));
  if(!rows.length){ toast('No PPE issued in that range.'); return; }
  const lines = [];
  rows.forEach(r=>{
    const site = SITES.find(s=>s.id===r.site_id);
    (r.items||['—']).forEach(item=>{
      lines.push({
        operative: nameOf(r.user_id), item,
        site: site ? site.name : '',
        date: new Date(r.issued_at).toLocaleDateString('en-GB'),
        status: r.status==='signed' ? 'Signed' : 'Pending',
        by: nameOf(r.issued_by),
      });
    });
  });
  const pdfDoc = await PDFLib.PDFDocument.create();
  const fonts = await havsPdfFonts(pdfDoc);
  const {bold, reg, INK, SLATE, LINE} = fonts;
  const logoImg = await havsFetchLogoImg(pdfDoc);
  const PAGE_W = 841.89, PAGE_H = 595.28, MARGIN = 40, CONTENT_W = PAGE_W-2*MARGIN;
  const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1);
  const WHITE = PDFLib.rgb(1,1,1);
  const cols = [
    {key:'operative', label:'Operative', w:0.19},
    {key:'item', label:'Item', w:0.18},
    {key:'site', label:'Site', w:0.19},
    {key:'date', label:'Issued Date', w:0.13},
    {key:'status', label:'Status', w:0.12},
    {key:'by', label:'Issued By', w:0.19},
  ];
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
    page.drawText('PPE ISSUE REGISTER', {x:textX, y:PAGE_H-30, size:9, font:bold, color:WHITE, opacity:0.85});
    page.drawText(((ORG && ORG.name) || '') + ' · ' + range.label, {x:textX, y:PAGE_H-48, size:13, font:bold, color:WHITE});
  }
  function drawFooter(){
    page.drawLine({start:{x:MARGIN,y:26}, end:{x:PAGE_W-MARGIN,y:26}, thickness:0.75, color:PDFLib.rgb(0.85,0.84,0.80)});
    page.drawText('Generated via OpHUB', {x:MARGIN, y:14, size:8, font:reg, color:SLATE});
  }
  function drawColHeaders(){
    let x = MARGIN;
    cols.forEach(c=>{ page.drawText(c.label, {x, y, size:9, font:bold, color:SLATE}); x += c.w*CONTENT_W; });
    y -= 8;
    page.drawLine({start:{x:MARGIN,y}, end:{x:PAGE_W-MARGIN,y}, thickness:0.75, color:LINE});
    y -= 14;
  }
  function newPage(){ page = pdfDoc.addPage([PAGE_W,PAGE_H]); drawHeader(); drawFooter(); y = PAGE_H-92; drawColHeaders(); }
  function ensureSpace(h){ if(y-h<40) newPage(); }
  newPage();
  lines.forEach(ln=>{
    ensureSpace(16);
    let x = MARGIN;
    cols.forEach(c=>{
      let val = String(ln[c.key]||'');
      const maxChars = Math.floor((c.w*CONTENT_W)/5.2);
      if(val.length>maxChars) val = val.slice(0,maxChars-1)+'…';
      page.drawText(val, {x, y, size:9, font:reg, color:INK});
      x += c.w*CONTENT_W;
    });
    y -= 15;
  });
  const bytes = await pdfDoc.save();
  await deliverPdf(bytes, exportFilename('', 'PPE Log ('+range.label+')', 'pdf'));
};
window.toggleTeamSection = function(key){ teamSectionOpen[key] = !teamSectionOpen[key]; render(); };
let odBusy = false;
let themeBusy = false;
let tbtTemplateBusy = false;
window.addTbtTemplate = async function(){
  if(ME.role!=='admin') return;
  const title = document.getElementById('tbtTemplateTitle').value.trim();
  const fileInput = document.getElementById('tbtTemplateFile');
  const file = fileInput.files && fileInput.files[0];
  if(!title || !file){ toast('Add a title and choose a PDF.'); return; }
  tbtTemplateBusy = true; render();
  const path = ME.org_id+'/tbt-templates/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('rams-docs', path, file, 'application/pdf');
  tbtTemplateBusy = false;
  if(!stored){ render(); return; }
  const rows = await dbInsert('tbt_templates', {org_id:ME.org_id, title, storage_path:stored, created_by:ME.id});
  if(rows) toast('Added to the Toolbox Talk Bank');
  render();
};
window.deleteTbtTemplate = async function(templateId, storagePath){
  if(!await customConfirm('Remove this template? Sites already created keep their copy — this only affects sites created from now on.')) return;
  const ok = await dbDelete('tbt_templates', templateId);
  if(ok){ toast('Template removed'); render(); }
};
window.saveCompanyTheme = async function(){
  if(!ME || ME.role!=='admin' || !ORG) return;
  const c1 = document.getElementById('themeColor1').value;
  const c2 = document.getElementById('themeColor2').value;
  themeBusy = true; render();
  const row = await dbUpdate('organizations', ME.org_id, {color_primary: c1, color_secondary: c2});
  themeBusy = false;
  if(!row){ toast('Could not save theme — try again.'); render(); return; }
  ORG.color_primary = c1; ORG.color_secondary = c2;
  applyTheme(ORG);
  toast('Company theme saved.');
  render();
};
window.resetCompanyTheme = async function(){
  if(!ME || ME.role!=='admin' || !ORG) return;
  themeBusy = true; render();
  const row = await dbUpdate('organizations', ME.org_id, {color_primary: null, color_secondary: null});
  themeBusy = false;
  if(!row){ toast('Could not reset theme — try again.'); render(); return; }
  ORG.color_primary = null; ORG.color_secondary = null;
  applyTheme(ORG);
  toast('Company theme reset to default.');
  render();
};
let siteTileModeBusy = false;
window.setSiteTileMode = async function(mode){
  if(!ME || ME.role!=='admin' || !ORG) return;
  if((ORG.site_tile_mode||'initials')===mode) return;
  siteTileModeBusy = true; render();
  const row = await dbUpdate('organizations', ME.org_id, {site_tile_mode: mode});
  siteTileModeBusy = false;
  if(!row){ toast('Could not save — try again.'); render(); return; }
  ORG.site_tile_mode = mode;
  toast('Site tile label updated');
  render();
};
window.connectOneDrive = async function(){
  odBusy = true; render();
  try{
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    const res = await sbFetchOD('/functions/v1/onedrive-oauth-start', {method:'POST', body: JSON.stringify({native:isNative, origin: isNative ? null : location.origin})});
    const d = await res.json();
    odBusy = false;
    if(!res.ok || d.error){ toast(d.error || 'Could not start OneDrive connection.'); render(); return; }
    // Microsoft's sign-in screen refuses to load inside an app's embedded
    // webview (a security measure most OAuth providers enforce) — open it in
    // the system browser instead when running as the native app. On the
    // plain website, a normal same-tab redirect works fine. On native, the
    // callback page hands straight back to the app via a custom URL scheme
    // (see the appUrlOpen listener below), so the browser closes itself.
    if(isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser){
      window.Capacitor.Plugins.Browser.open({url: d.url});
    } else {
      location.href = d.url;
    }
  }catch(e){ odBusy=false; toast('Could not reach the server.'); render(); }
};
window.disconnectOneDrive = async function(){
  if(!await customConfirm('Disconnect OneDrive? Photos will stop syncing until reconnected.')) return;
  const res = await sbFetch('/rest/v1/onedrive_connections?org_id=eq.'+ME.org_id, {method:'DELETE'});
  if(res.ok){ toast('OneDrive disconnected'); render(); } else { toast('Could not disconnect — try again.'); }
};
