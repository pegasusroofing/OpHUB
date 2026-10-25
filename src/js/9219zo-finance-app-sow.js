/* ============================================================
   OpHUB Finance — proof of works on applications (25 Oct 2026, Andy: "on the applications,
   add a pop up on the export to include the pdf report from schedule of works … as proof
   of works").
   - Download PDF: asks first; with the report, the Schedule of Works pages are added to the
     end of the application PDF (one file).
   - Download Excel: asks first; with the report, the Schedule of Works PDF downloads as well.
   - Email to client: a tick box "Attach the Schedule of Works report" (with which report),
     sent as a second attachment.
   Report choice: the whole Schedule of Works, or just the photos taken since the last
   application. Only offered when the project has a Schedule of Works.
   ============================================================ */
const FIN_SOW_LS = 'ophub.finSowProof';
async function finSowHasTasks(siteId){
  const r = await dbSelectChecked('schedule_tasks', 'site_id=eq.'+siteId+'&select=id&limit=1').catch(()=>({ok:false}));
  return !!(r && r.ok && r.data && r.data.length);
}
// Valuation date of the application before this one (the start of "since the last application").
async function finSowPrevDate(a){
  const r = await dbSelectChecked('fin_applications', 'site_id=eq.'+a.site_id+'&number=lt.'+a.number+'&status=not.in.(draft,void)&select=valuation_date&order=number.desc&limit=1').catch(()=>({ok:false}));
  return r && r.ok && r.data[0] ? r.data[0].valuation_date : null;
}
function finSowRange(prev, a){
  const to = String(a.valuation_date || finToday()).slice(0,10);
  if(!prev) return null;
  const f = new Date(String(prev).slice(0,10)+'T00:00:00'); f.setDate(f.getDate()+1);
  const from = typeof localISODate==='function' ? localISODate(f) : f.toISOString().slice(0,10);
  return from <= to ? {from, to} : null;
}
function finSowPrefs(){ return finLsGet(FIN_SOW_LS, {include:true, mode:'full'}); }
function finSowChoiceHtml(range, prefix){
  const p = finSowPrefs();
  const mode = range ? p.mode : 'full';
  return `<div class="finsow-opts">
      <label class="finsow-o"><input type="radio" name="${prefix}Mode" value="full" ${mode!=='photos'?'checked':''}><span><b>Whole Schedule of Works</b><em>Every task, its progress and photos</em></span></label>
      ${range ? `<label class="finsow-o"><input type="radio" name="${prefix}Mode" value="photos" ${mode==='photos'?'checked':''}><span><b>Photos since the last application</b><em>${finDate(range.from)} – ${finDate(range.to)}</em></span></label>` : ''}
    </div>`;
}
function finSowReadChoice(prefix, range){
  const el = document.querySelector(`input[name="${prefix}Mode"]:checked`);
  const mode = el ? el.value : 'full';
  return {mode, period: mode==='photos' && range ? sowPeriodRange('custom', range.from, range.to) : {full:true}};
}
// The pop-up before a download. Resolves {include, mode, period} or null (cancelled).
function finSowAsk(a, how){
  return new Promise(async resolve=>{
    if(!(await finSowHasTasks(a.site_id))) return resolve({include:false});
    const range = finSowRange(await finSowPrevDate(a), a);
    let ov = document.getElementById('finSowOv');
    if(!ov){ ov = document.createElement('div'); ov.id = 'finSowOv'; ov.className = 'geo-modal-overlay'; }
    document.body.appendChild(ov);
    const done = v=>{ ov.style.display = 'none'; ov.innerHTML = ''; resolve(v); };
    ov.onclick = e=>{ if(e.target===ov) done(null); };
    ov.innerHTML = `<div class="geo-modal-card" style="max-width:460px;">
      <h3 style="margin:0 0 6px;">Add Proof Of Works?</h3>
      <p class="stub" style="margin:0 0 12px;font-style:normal;">Include the Schedule of Works report with Application ${a.number}, ${how==='pdf' ? 'as extra pages at the end of the PDF' : 'as a PDF downloaded with the Excel'}.</p>
      ${finSowChoiceHtml(range, 'finSowDl')}
      <button type="button" class="darkbtn" style="width:100%;margin:12px 0 8px;" id="finSowYes">Include the report</button>
      <button type="button" class="ghostbtn" style="width:100%;margin:0 0 8px;" id="finSowNo">Export without it</button>
      <button type="button" class="geo-modal-cancel" id="finSowCancel">Cancel</button>
    </div>`;
    ov.style.display = 'flex';
    document.getElementById('finSowYes').onclick = ()=>{ const c = finSowReadChoice('finSowDl', range); finLsSet(FIN_SOW_LS, {include:true, mode:c.mode}); done(Object.assign({include:true}, c)); };
    document.getElementById('finSowNo').onclick = ()=>{ finLsSet(FIN_SOW_LS, Object.assign(finSowPrefs(), {include:false})); done({include:false}); };
    document.getElementById('finSowCancel').onclick = ()=>done(null);
  });
}
// The Schedule of Works PDF (all tasks, whatever tab is showing on the SoW page).
async function finSowBytes(siteId, period){
  const keep = typeof scheduleFilter!=='undefined' ? scheduleFilter : null;
  try{
    if(keep!==null) scheduleFilter = 'all';
    toast('Building the Schedule of Works report…');
    return await buildSchedulePdfBytes(siteId, period);
  } finally { if(keep!==null) scheduleFilter = keep; }
}
function finSowFilename(a){ return finAppFilename(a).replace(/\.xlsx$/i, '')+' - Proof of works.pdf'; }

/* ---------- Download PDF ---------- */
(function(){
  const base = window.downloadFinAppPdf;
  window.downloadFinAppPdf = async function(id){
    if(finApp && finApp.id===id && document.getElementById('finAppSave')) await saveFinApplication(false);
    const a = (await dbSelect('fin_applications', 'id=eq.'+id))[0]; if(!a) return;
    const c = await finSowAsk(a, 'pdf'); if(!c) return;
    if(!c.include) return base.apply(this, arguments);
    if(!(await loadLib('PDFLib'))){ toast('Could not load the PDF tool — check your connection.'); return; }
    const appBytes = await finAppPdfBytes(a); if(!appBytes) return;
    const sow = await finSowBytes(a.site_id, c.period);
    if(!sow){ toast('The Schedule of Works report couldn’t be built — downloading the application on its own.'); return deliverPdf(appBytes, finAppFilename(a).replace(/\.xlsx$/i, '.pdf')); }
    try{
      const out = await PDFLib.PDFDocument.create();
      for(const bytes of [appBytes, sow.outBytes]){
        const src = await PDFLib.PDFDocument.load(bytes);
        (await out.copyPages(src, src.getPageIndices())).forEach(p=>out.addPage(p));
      }
      out.setTitle('Application '+a.number+' with proof of works');
      return deliverPdf(await out.save(), finAppFilename(a).replace(/\.xlsx$/i, '')+' with proof of works.pdf');
    }catch(e){ console.error(e); toast('Couldn’t join the two PDFs — downloading them separately.'); await deliverPdf(appBytes, finAppFilename(a).replace(/\.xlsx$/i, '.pdf')); return deliverPdf(sow.outBytes, finSowFilename(a)); }
  };
})();

/* ---------- Download Excel ---------- */
(function(){
  const base = window.downloadFinAppExcel;
  window.downloadFinAppExcel = async function(id){
    if(finApp && finApp.id===id && document.getElementById('finAppSave')) await saveFinApplication(false);
    const a = (await dbSelect('fin_applications', 'id=eq.'+id))[0]; if(!a) return;
    const c = await finSowAsk(a, 'xlsx'); if(!c) return;
    const r = await base.apply(this, arguments);
    if(c.include){ const sow = await finSowBytes(a.site_id, c.period); if(sow) await deliverPdf(sow.outBytes, finSowFilename(a)); }
    return r;
  };
})();

/* ---------- Email: a tick box in the email pop-up, sent as a second attachment ---------- */
let finSowMail = null;   // {appId, range}
(function(){
  const base = window.openFinAppEmail;
  window.openFinAppEmail = async function(siteId, appId){
    const r = await base.apply(this, arguments);
    finSowMail = null;
    try{
      const card = document.querySelector('#finMailOverlay .geo-modal-card'); const send = document.getElementById('finMailSend');
      if(!card || !send || !(await finSowHasTasks(siteId))) return r;
      const a = (await dbSelect('fin_applications', 'id=eq.'+appId+'&select=id,site_id,number,valuation_date'))[0]; if(!a) return r;
      const range = finSowRange(await finSowPrevDate(a), a);
      finSowMail = {appId, range};
      const box = document.createElement('div'); box.className = 'finsow-mail';
      box.innerHTML = `<label class="finswitch"><input type="checkbox" id="finMailSow" ${finSowPrefs().include?'checked':''} onchange="document.getElementById('finMailSowOpts').hidden=!this.checked"> Attach the Schedule of Works report (proof of works)</label>
        <div id="finMailSowOpts" ${finSowPrefs().include?'':'hidden'}>${finSowChoiceHtml(range, 'finSowMail')}</div>`;
      send.insertAdjacentElement('beforebegin', box);
      const intro = card.querySelector('p.stub'); if(intro) intro.innerHTML = intro.innerHTML.replace('Sent as an Excel file.', 'Sent as an Excel file (plus the Schedule of Works report if ticked).');
    }catch(e){ console.error(e); }
    return r;
  };
})();
window.sendFinAppEmail = async function(siteId, appId){
  const to = finVal('finMailTo').split(/[,;\s]+/).map(s=>s.trim()).filter(Boolean);
  if(!to.length || to.some(e=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))){ toast('Check the email address.'); return; }
  const btn = document.getElementById('finMailSend'); const reset = ()=>{ if(btn){ btn.disabled=false; btn.textContent='Send'; } };
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a){ reset(); return; }
  const buf = await finAppExcelBytes(a); if(!buf){ reset(); return; }
  const path = ME.org_id+'/'+siteId+'/applications/Application-'+a.number+'-'+Date.now()+'.xlsx';
  const stored = await uploadToStorage('finance-docs', path, new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if(!stored){ reset(); return; }
  // Proof of works, if ticked
  const extra = [];
  const sowBox = document.getElementById('finMailSow');
  if(sowBox && sowBox.checked && finSowMail && finSowMail.appId===appId){
    const c = finSowReadChoice('finSowMail', finSowMail.range);
    finLsSet(FIN_SOW_LS, {include:true, mode:c.mode});
    if(btn) btn.textContent = 'Building the report…';
    const sow = await finSowBytes(siteId, c.period);
    if(!sow){ toast('The Schedule of Works report couldn’t be built, so it wasn’t sent.'); reset(); return; }
    if(btn) btn.textContent = 'Sending…';
    const sp = await uploadToStorage('finance-docs', ME.org_id+'/'+siteId+'/applications/Application-'+a.number+'-'+Date.now()+'-proof-of-works.pdf', new Blob([sow.outBytes], {type:'application/pdf'}), 'application/pdf');
    if(!sp){ reset(); return; }
    extra.push({storage_path:sp, filename:finSowFilename(a)});
  } else if(sowBox) finLsSet(FIN_SOW_LS, Object.assign(finSowPrefs(), {include:false}));
  let res;
  try{
    res = await sbFetch('/functions/v1/send-finance-email', {method:'POST', timeoutMs:90000, body:JSON.stringify({
      kind:'application', site_id:siteId, storage_path:stored, filename:finAppFilename(a), recipients:to, extra_attachments:extra,
      cc: document.getElementById('finMailMe').checked && ME.email ? [ME.email] : [],
      reference:'No. '+a.number, client_po:a.client_po||'', amount:finMoney(a.net_due)+' excl. VAT', due:a.due_date?finDate(a.due_date):'', message:finVal('finMailMsg'),
    })});
  }catch(e){ toast('Could not reach the server — check your connection.'); reset(); return; }
  const d = await res.json().catch(()=>({}));
  if(!res.ok || d.error){ toast('Email failed — '+String(d.error||res.status).slice(0,140)); reset(); return; }
  await dbUpdate('fin_applications', appId, {excel_path:stored, submitted_at:new Date().toISOString(), sent_to:to.join(', '), status: a.status});
  document.getElementById('finMailOverlay').style.display = 'none';
  finApp = null; toast(extra.length ? 'Application emailed with the Schedule of Works report' : 'Application emailed'); render();
};
(function(){
  const st = document.createElement('style');
  st.textContent = `.finsow-opts{display:flex;flex-direction:column;gap:6px;}
.finsow-o{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line,#ECEEF2);border-radius:10px;padding:9px 11px;cursor:pointer;}
.finsow-o input{width:auto !important;margin:3px 0 0 !important;flex:none;}
.finsow-o span{display:flex;flex-direction:column;} .finsow-o b{font-size:14px;} .finsow-o em{font-style:normal;font-size:12.5px;color:var(--slate);}
.finsow-o:has(input:checked){border-color:var(--brand1,#E3262B);background:#FFF7F7;}
.finsow-mail{margin:4px 0 12px;display:flex;flex-direction:column;gap:8px;}`;
  document.head.appendChild(st);
})();
