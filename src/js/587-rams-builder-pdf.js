/* ================= RAMS BUILDER (trial) — PDFs + issuing =================
 * Builds the Risk Assessment and Method Statement as separate A4 PDFs in the
 * same layout as RTB's existing RAMS (details table, signatures, data
 * protection, groups, hazard tables with pre-control / residual P-S-RR,
 * risk legend, PPE, sign-off sheet, optional dynamic risk assessment).
 * The sign-off sheet's rows are registered as signature boxes (op1..opN and
 * the author as 'pm'), so operatives' signatures drop straight into it. */
const RAMS_SIGN_ROWS = 18;
// Standard PDF fonts only cover Windows-1252; anything else (emoji, odd
// symbols) would throw, so it is swapped or dropped.
const RAMS_WIN1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function ramsPdfSafe(t){
  return String(t==null?'':t).replace(/[→]/g,'->').replace(/[≤]/g,'<=').replace(/[≥]/g,'>=').replace(/[×]/g,'x')
    .split('').filter(c=>{ const n=c.charCodeAt(0); return (n>=32 && n<=126) || (n>=160 && n<=255) || RAMS_WIN1252_EXTRA.includes(c) || c==='\n'; }).join('');
}
async function buildRamsPdf(build, which){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const b = build, d = b.details||{}, st = ramsSettings();
  const isRA = which==='ra';
  const docNo = isRA ? (d.raNumber||'') : (d.msNumber||'');
  const pdf = await PDFLib.PDFDocument.create();
  const bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
  const rgb = PDFLib.rgb;
  const INK = rgb(0.08,0.08,0.09), SLATE = rgb(0.35,0.36,0.4), LINE = rgb(0.55,0.55,0.58), LIGHT = rgb(0.93,0.93,0.94), WHITE = rgb(1,1,1);
  const BRAND = pdfHexToRgb((ORG && ORG.color_primary) || '#8B1A1A');
  const W = 595.28, H = 841.89, M = 36, CW = W-2*M;
  const company = (ORG && ORG.name) || 'Company';
  let logo = null;
  if(ORG && ORG.logo_path){ const bytes = await pdfFetchImageBytes(publicUrl('org-logos', ORG.logo_path)); if(bytes){ try{ logo = await pdf.embedPng(bytes); }catch(e){ try{ logo = await pdf.embedJpg(bytes); }catch(e2){} } } }
  let page, y;
  const pages = [];
  const signBoxes = [];
  function newPage(){ page = pdf.addPage([W,H]); pages.push(page); y = H - M; }
  function ensure(h){ if(y - h < 46) newPage(); }
  function txt(t, x, yy, size, font, color){ page.drawText(ramsPdfSafe(t), {x, y:yy, size, font:font||reg, color:color||INK}); }
  function wrap(t, font, size, maxW){
    const out = [];
    ramsPdfSafe(t).split('\n').forEach(par=>{
      const words = par.split(/\s+/).filter(Boolean); let line = '';
      if(!words.length){ out.push(''); return; }
      words.forEach(w=>{
        let test = line ? line+' '+w : w;
        if(font.widthOfTextAtSize(test, size) > maxW && line){ out.push(line); line = w; }
        else line = test;
        while(font.widthOfTextAtSize(line, size) > maxW && line.length>1){ let k=line.length-1; while(k>1 && font.widthOfTextAtSize(line.slice(0,k),size)>maxW) k--; out.push(line.slice(0,k)); line = line.slice(k); }
      });
      if(line) out.push(line);
    });
    return out;
  }
  function rect(x, yy, w, h, fill, border){ page.drawRectangle({x, y:yy, width:w, height:h, color:fill||undefined, borderColor:border===false?undefined:(border||LINE), borderWidth:border===false?0:0.6}); }
  function bar(label){ ensure(26); rect(M, y-18, CW, 18, BRAND, false); txt(label, M+6, y-13, 10.5, bold, WHITE); y -= 24; }
  function para(t, size){ size = size||9; wrap(t, reg, size, CW).forEach(l=>{ ensure(size+4); txt(l, M, y-size, size, reg); y -= size+3.5; }); y -= 4; }
  function kvTable(rows){
    const lw = 190;
    rows.forEach(([k,v])=>{
      const lines = wrap(v||'', reg, 9, CW-lw-10); const h = Math.max(16, lines.length*11+6);
      ensure(h); rect(M, y-h, lw, h, LIGHT); rect(M+lw, y-h, CW-lw, h);
      txt(k, M+5, y-11.5, 9, bold);
      lines.forEach((l,i)=>txt(l, M+lw+5, y-11.5-i*11, 9, reg));
      y -= h;
    });
    y -= 10;
  }
  // ---- header (first page) ----
  newPage();
  const addr = String(st.address||'').split('\n').map(s=>s.trim()).filter(Boolean);
  let hy = y-12;
  txt(company.toUpperCase(), M, hy, 12, bold); hy -= 13;
  addr.forEach(l=>{ txt(l, M, hy, 9, reg, SLATE); hy -= 11; });
  if(st.phone){ txt('Tel: '+st.phone, M, hy, 9, reg, SLATE); hy -= 11; }
  if(logo){ const dim = logo.scale(1); const s = Math.min(150/dim.width, 64/dim.height); page.drawImage(logo, {x:W-M-dim.width*s, y:y-dim.height*s, width:dim.width*s, height:dim.height*s}); }
  y = Math.min(hy, y-70) - 14;
  const title = isRA ? 'Risk Assessment' : 'Method Statement';
  txt(title, (W - bold.widthOfTextAtSize(title, 18))/2, y-16, 18, bold); y -= 32;
  const fmt = v => v ? (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v+'T00:00:00').toLocaleDateString('en-GB') : v) : '';
  const L = isRA ? 'Risk Assessment' : 'Method Statement';
  bar(isRA ? '1.0 Risk Assessment Details' : 'Method Statement Details');
  kvTable([[L+' Number', docNo], [L+' Date', fmt(d.date)], ...(isRA?[['Risk Review Date', fmt(d.reviewDate)]]:[]), [L+' Author', d.author], ['Project/Contract', d.project], ['Start Date', fmt(d.startDate)], ['Expected Job Duration', d.duration], ['Client Contact', d.clientContact], ['Description', d.description], ['Site Address', d.address]]);
  bar(isRA ? '2.0 Signatures' : 'Signatures');
  { ensure(40); const cols = [['', 120],['Name',110],['Title',90],['Signature',105],['Date',CW-425]]; let x = M;
    cols.forEach(([c,w])=>{ rect(x, y-14, w, 14, LIGHT); txt(c, x+4, y-10, 8.5, bold); x += w; }); y -= 14;
    x = M; const rowH = 26; const vals = ['Document Author', d.author||'', '', '', fmt(d.date)];
    cols.forEach(([c,w],i)=>{ rect(x, y-rowH, w, rowH); if(vals[i]) txt(vals[i], x+4, y-16, 9, i===0?bold:reg); if(i===3) signBoxes.push({p:pages.length, w:'pm', t:'sig', r:[(x+2)/W, (H-(y-2))/H, (w-4)/W, (rowH-4)/H]}); x += w; });
    y -= rowH+12; }
  bar('Data Protection Statement'); para(st.dataProtection, 8.5);
  if(isRA){
    if(d.notes){ bar('3.0 Risk Assessment Notes'); para(d.notes); }
    bar('4.0 Individuals or Groups Affected By This Assessment');
    kvTable([['Groups Affected', (d.groups||[]).join(', ')], ...(d.mainContractor?[['Main Contractor', d.mainContractor]]:[])]);
    bar('5.0 Hazards and Control Procedures');
    const sideW = 66, cellW = sideW/3, midW = CW - 2*sideW;
    (b.hazards||[]).forEach(hz=>{
      const harmLines = wrap(hz.harm||'', reg, 8.5, midW-8);
      const ctrl = (hz.controls||[]).map(c=>wrap(c, reg, 8.5, midW-8));
      const headH = 16 + 12 + Math.max(14, harmLines.length*10.5+4) + 16;
      ensure(headH + (ctrl[0] ? ctrl[0].length*10.5+6 : 0));
      // row 1: titles
      rect(M, y-16, sideW, 16, LIGHT); txt('Pre-Control', M+4, y-11.5, 8, bold);
      rect(M+sideW, y-16, midW, 16, LIGHT); txt('Hazard: '+(hz.title||''), M+sideW+4, y-11.5, 9.5, bold);
      rect(M+sideW+midW, y-16, sideW, 16, LIGHT); txt('Residual Risk', M+sideW+midW+4, y-11.5, 8, bold);
      y -= 16;
      const hH = Math.max(14, harmLines.length*10.5+4);
      ['P','S','RR'].forEach((c,i)=>{ rect(M+i*cellW, y-hH, cellW, hH, LIGHT); txt(c, M+i*cellW+cellW/2-3, y-10, 8, bold); rect(M+sideW+midW+i*cellW, y-hH, cellW, hH, LIGHT); txt(c, M+sideW+midW+i*cellW+cellW/2-3, y-10, 8, bold); });
      rect(M+sideW, y-hH, midW, hH); harmLines.forEach((l,i)=>txt(l, M+sideW+4, y-10-i*10.5, 8.5, reg));
      y -= hH;
      const vals = [[hz.p, hz.s],[hz.rp, hz.rs]];
      const valH = 16;
      vals.forEach(([p,s],side)=>{
        const x0 = side ? M+sideW+midW : M; const rr = (Number(p)||0)*(Number(s)||0); const band = ramsRiskBand(rr);
        [p, s, rr].forEach((v,i)=>{ const isRR = i===2; rect(x0+i*cellW, y-valH, cellW, valH, isRR ? pdfHexToRgb(band.bg) : undefined); txt(String(v), x0+i*cellW+cellW/2-(String(v).length*2.4), y-11.5, 9, bold, isRR && band.fg==='#fff' ? WHITE : INK); });
      });
      rect(M+sideW, y-valH, midW, valH, LIGHT); txt('Control Procedures', M+sideW+4, y-11.5, 9, bold);
      y -= valH;
      ctrl.forEach(lines=>{
        const h = lines.length*10.5+6; ensure(h);
        rect(M+sideW, y-h, midW, h); lines.forEach((l,i)=>txt(l, M+sideW+4, y-10-i*10.5, 8.5, reg));
        y -= h;
      });
      y -= 12;
    });
    // legend
    ensure(80);
    const lg = [['Probability (P)','Severity (S)','Risk Ranking (RR = P x S)']].concat([1,2,3,4,5].map(n=>[n+' '+RAMS_P_LABELS[n], n+' '+RAMS_S_LABELS[n], ['1-2  Very low','3-7  Low priority','8-9  Medium priority','10-14  High priority','15-25  Urgent action required'][n-1]]));
    lg.forEach((r,i)=>{ const cw = CW/3; r.forEach((c,j)=>{ rect(M+j*cw, y-13, cw, 13, i===0?LIGHT:undefined); txt(c, M+j*cw+4, y-9.5, 8, i===0?bold:reg); }); y -= 13; });
    y -= 12;
    if((b.ppe||[]).length){
      bar('6.0 Required PPE');
      const items = RAMS_PPE.filter(p=>b.ppe.includes(p.key)); const cw = CW/3;
      for(let i=0;i<items.length;i+=3){ ensure(30); items.slice(i,i+3).forEach((p,j)=>{ rect(M+j*cw+2, y-26, cw-4, 24, LIGHT, false); rect(M+j*cw+8, y-20, 12, 12, WHITE); txt('X', M+j*cw+11, y-17.5, 9, bold, BRAND); txt(p.label, M+j*cw+28, y-17, 9.5, bold); }); y -= 30; }
      y -= 6;
    }
  } else {
    if(d.emergencyName || d.emergencyPhone){ bar('Emergency Contact Details'); kvTable([['Name', d.emergencyName], ['Telephone Number', d.emergencyPhone]]); }
    const gen = (b.sections||[]).filter(s=>s.part!=='method'), meth = (b.sections||[]).filter(s=>s.part==='method');
    const sectionOut = s=>{
      ensure(40); txt(s.title||'', M, y-12, 11, bold); y -= 18;
      if(s.body) para(s.body, 9);
      (s.steps||[]).forEach((stp,i)=>{ const lines = wrap(stp, reg, 9, CW-22); ensure(lines.length*12+2); txt((i+1)+'.', M+4, y-9, 9, bold); lines.forEach((l,k)=>txt(l, M+20, y-9-k*12, 9, reg)); y -= lines.length*12+2; });
      y -= 10;
    };
    if(gen.length){ bar('General Precautions'); para('To be observed by all staff at all times; any deviation from these control procedures must be authorised by the site manager or safety representative.', 8.5); gen.forEach(sectionOut); }
    if(meth.length){ bar('Method Statements'); meth.forEach(sectionOut); }
  }
  // ---- sign-off sheet ----
  newPage();
  txt('Sign Off Sheet', M, y-16, 16, bold); y -= 34;
  [`I have read and understood the contents of this ${L}.`, 'Anything I did not understand has been explained to me to my satisfaction.', `I agree to follow the ${L} and understand that any ${isRA?'control procedures':'instructions'} are provided for my safety and the safety of others.`]
    .forEach(s=>{ wrap(s, reg, 9.5, CW).forEach(l=>{ txt(l, (W-reg.widthOfTextAtSize(l,9.5))/2, y-10, 9.5, reg); y -= 13; }); y -= 3; });
  y -= 8;
  const cols = [['Print Name', CW*0.42], ['Signed', CW*0.36], ['Date', CW*0.22]];
  let x = M;
  // Issued by — the manager who issued it signs here, above everyone else.
  {
    const ih = 30, lw = CW*0.16;
    rect(M, y-ih, lw, ih, LIGHT); txt('ISSUED BY:', M+5, y-ih/2-3, 9, bold);
    const iCols = [CW*0.42-lw, CW*0.36, CW*0.22];
    x = M+lw;
    iCols.forEach((w,i)=>{ rect(x, y-ih, w, ih); signBoxes.push({p:pages.length, w:'pm', t:['name','sig','date'][i], r:[(x+2)/W, (H-(y-2))/H, (w-4)/W, (ih-4)/H]}); x += w; });
    y -= ih + 14;
  }
  x = M; cols.forEach(([c,w])=>{ rect(x, y-16, w, 16, LIGHT); txt(c, x+5, y-11.5, 9, bold); x += w; }); y -= 16;
  const rowH = Math.min(34, Math.floor((y-60)/RAMS_SIGN_ROWS));
  for(let r=0;r<RAMS_SIGN_ROWS;r++){
    x = M;
    cols.forEach(([c,w],i)=>{ rect(x, y-rowH, w, rowH); signBoxes.push({p:pages.length, w:'op'+(r+1), t:['name','sig','date'][i], r:[(x+2)/W, (H-(y-2))/H, (w-4)/W, (rowH-4)/H]}); x += w; });
    y -= rowH;
  }
  // ---- dynamic risk assessment ----
  if(isRA && d.includeDynamic!==false){
    newPage();
    txt('Dynamic Risk Assessment', (W-bold.widthOfTextAtSize('Dynamic Risk Assessment',15))/2, y-15, 15, bold); y -= 28;
    para('Please note a copy of this Dynamic Risk Assessment must be returned to head office complete with signatures. Tick items covered by the risk assessment, then list in the table below hazards and controls for any additional items on this job.', 8.5);
    const dyn = ['Access / Egress','Adverse Weather','Asbestos','Biological','Excavations','Exposure to Gases','Movement of Vehicles','Chemicals','Confined Space','Dusts / Particles','Electrical','Other Contractors','Limited Headroom','Moving Machinery','Lone Working','Fire','Fumes','Lighting','Flooding','Noise','Scaffold','Work at Height','Slips, Trips or Falls','Extreme Temperatures','Demolition Works','Work Near Water','Vibration','Wastes','Uneven Surfaces','Ladders / Stepladders','Ventilation','Vermin / Weils Disease','Overhead Cables','Hidden Services','Manual Handling'];
    const cw = CW/5;
    for(let i=0;i<dyn.length;i+=5){ dyn.slice(i,i+5).forEach((h,j)=>{ rect(M+j*cw, y-20, cw, 20); rect(M+j*cw+4, y-15, 9, 9, WHITE); txt(h, M+j*cw+17, y-13, 7.5, reg); }); y -= 20; }
    y -= 14;
    txt('Additional task(s) or hazards not covered by the original risk assessment', M, y-10, 9.5, bold); y -= 18;
    const dc = [['Hazard identified',0.2],['Injury risk',0.15],['Control measure adopted',0.25],['L',0.05],['S',0.05],['LxS',0.06],['Proceed Y/N',0.08],['Supervisor',0.08],['Client',0.08]];
    x = M; dc.forEach(([c,f])=>{ rect(x, y-24, CW*f, 24, LIGHT); wrap(c, bold, 7.5, CW*f-6).forEach((l,k)=>txt(l, x+3, y-9-k*9, 7.5, bold)); x += CW*f; }); y -= 24;
    for(let r=0;r<6;r++){ x = M; dc.forEach(([c,f])=>{ rect(x, y-26, CW*f, 26); x += CW*f; }); y -= 26; }
    y -= 12;
    [['15 - 25 = High Risk - STOP - advise your supervisor that the risk is high and seek further advice.','#E0301E'],['8 - 12 = Medium Risk - CAUTION - proceed but take extra precautions.','#F39237'],['1 - 6 = Low Risk - PROCEED with task maintaining controls.','#9BD27A']]
      .forEach(([t,c])=>{ rect(M, y-14, 14, 12, pdfHexToRgb(c), false); txt(t, M+20, y-11, 8.5, reg); y -= 17; });
  }
  // ---- footers ----
  pages.forEach((pg,i)=>{ const f = ramsPdfSafe(`Doc #: ${docNo} || Page ${i+1} of ${pages.length}`); pg.drawText(f, {x:(W-reg.widthOfTextAtSize(f,8))/2, y:20, size:8, font:reg, color:SLATE}); pg.drawText('Generated via OpHUB', {x:M, y:20, size:7, font:reg, color:SLATE}); });
  const bytes = await pdf.save();
  return {bytes, signLayout:{v:2, boxes:signBoxes}, pageCount: pages.length};
}
window.ramsPreview = async function(which){
  await ramsSaveNow();
  toast('Building PDF…');
  try{
    const out = await buildRamsPdf(ramsEd.build, which);
    if(out) viewPdfInApp(out.bytes, (which==='ra'?'Risk Assessment':'Method Statement')+' - '+ramsEd.build.title+'.pdf');
  }catch(e){ console.error(e); customAlert('Could not build the PDF: '+e.message); }
};
window.ramsIssue = async function(siteId){
  await ramsSaveNow();
  const b = ramsEd.build;
  if(!b.hazards.length && !b.sections.length){ toast('Add some hazards or sections first'); return; }
  const miss = ramsMissingInfo(b);
  if(miss.length){ toast('Fill in '+miss.join(' and ')+' on the Info tab first'); ramsSetTab('details'); return; }
  const reissue = b.status==='issued';
  if(!(await customConfirm(reissue
    ? `Re-issue "${b.title}" as revision ${b.revision+1}?\n\nThe current Risk Assessment and Method Statement are marked superseded and everyone on the job is asked to sign the new versions.`
    : `Issue "${b.title}"?\n\nThis adds a Risk Assessment and a Method Statement to this job's RAMS for operatives to sign.`))) return;
  toast('Building documents…');
  try{
    const rev = b.revision+1;
    const made = [];
    for(const which of ['ra','ms']){
      const isRA = which==='ra';
      if(isRA && !b.hazards.length) continue;
      if(!isRA && !b.sections.length) continue;
      const out = await buildRamsPdf(b, which);
      if(!out) return;
      const name = (isRA?'Risk Assessment':'Method Statement')+' — '+b.title+(rev>1?' (rev '+rev+')':'');
      const path = siteId+'/rams/'+uid()+'-'+(isRA?'RA':'MS')+'-'+b.title.replace(/[^a-z0-9.\-]+/gi,'_').slice(0,60)+'.pdf';
      const stored = await uploadToStorage('rams-docs', path, new Blob([out.bytes], {type:'application/pdf'}), 'application/pdf');
      if(!stored){ customAlert('Upload failed — check signal and try again.'); return; }
      const prevId = isRA ? b.ra_doc_id : b.ms_doc_id;
      const rows = await dbInsert('rams_docs', {site_id:siteId, name, storage_path:stored, uploaded_by:ME.id, doc_type:isRA?'Risk Assessment':'Method Statement', supersedes:prevId||null, sign_layout:out.signLayout});
      if(!rows || !rows[0]){ customAlert('Could not save the document.'); return; }
      if(prevId) await dbUpdate('rams_docs', prevId, {status:'superseded', superseded_by:rows[0].id});
      // Issuing it marks it issued straight away — by whoever issued it, with their signature.
      await dbInsert('rams_signatures', {rams_id:rows[0].id, user_id:ME.id, issued:true, signature_image_path: ME.signature_path || null});
      made.push([which, rows[0].id, name, isRA?'Risk Assessment':'Method Statement']);
    }
    const patch = {status:'issued', revision:rev, issued_at:new Date().toISOString(), updated_at:new Date().toISOString()};
    made.forEach(([w,id])=>{ patch[w==='ra'?'ra_doc_id':'ms_doc_id'] = id; });
    const row = await dbUpdate('rams_builds', b.id, patch);
    if(row) Object.assign(b, patch);
    made.forEach(([w,id,name,label])=>notifyDocNeedsSigning(siteId, 'RAMS', name));
    logSiteActivity(siteId, 'rams_build_issued', `Issued RAMS "${b.title}" rev ${rev}`);
    toast(reissue ? 'Re-issued — everyone will be asked to sign again' : 'Issued — operatives can now sign');
    ramsEd = null; go('#/site/'+siteId+'/hs/rams');
  }catch(e){ console.error(e); customAlert('Could not issue: '+e.message); }
};
