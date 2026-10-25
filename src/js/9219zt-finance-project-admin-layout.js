/* ============================================================
   OpHUB Finance — Project Admin, one compact page (25 Oct 2026, Andy: "it's a bit ugly").
   Replaces the 9219u "Project Details" + "Contract Terms" drop-downs with one card:
     Project Details (4 a row on a laptop, 2 a row on a phone)
       Job No · Project Name · Project Address · Project Postcode
       Contract Value · Client · PO Number · Client PO (files)
       Start Date · Status · PM · QS
     then plain sub-headers (no drop-downs): Contract Terms · Retention · Payment ·
     Overheads · Monthly Application Dates · Billing — and one Save button.
   The fields are the same inputs as before (moved, not copied), so saveSiteFinance (900),
   the client → Directory step (9219n), the QS save (9219u) and the job edit (908) all
   still save them. The main client PO's number and files save from here too.
   No value on a client PO any more — the contract value is in Project Details.
   ============================================================ */
function finPaRoHtml(label, val, cls){
  return `<div class="formfield fpa-f ${cls||''}"><label class="field-label">${escapeHtml(label)}</label><div class="fpa-ro">${val ? escapeHtml(val) : '<span class="fpa-dim">—</span>'}</div></div>`;
}
function finPaLayout(){
  const root = document.querySelector('.finptab[data-t="setup"]'); if(!root || root.dataset.pa) return;
  const siteId = (parseRoute()||[])[1]; const site = SITES.find(s=>s.id===siteId);
  const cv = document.getElementById('finContract');
  if(!site || !cv) return;
  root.dataset.pa = '2';   // 9219u's older restructure skips a tab that's already been laid out
  const cards = Array.from(root.querySelectorAll(':scope > .card'));
  const titleOf = c=>{ const t = c.querySelector('.sectiontitle'); return t ? t.textContent.trim().toLowerCase() : ''; };
  const poCard = cards.find(c=>titleOf(c).startsWith('client purchase orders'));
  const jobCard = cards.find(c=>titleOf(c)==='project');
  const detCard = cv.closest('.card');
  const billEl = document.getElementById('finBillName'); const billCard = billEl ? billEl.closest('.card') : null;
  const ff = id=>{ const el = document.getElementById(id); return el ? el.closest('.formfield') : null; };
  const fld = (id, label, key)=>{ const f = ff(id); if(!f) return null; const l = f.querySelector('.field-label'); if(l) l.textContent = label; f.classList.add('fpa-f', 'fk-'+key); return f; };
  const auto = !!(ORG && ORG.auto_job_numbers);
  // Invoice jobs (Andy 26 Oct): no retention, application day or monthly application dates.
  const isInv = !!detCard && Array.from(detCard.querySelectorAll('button[onclick*="setFinBillingType"]')).some(b=>(b.getAttribute('onclick')||'').indexOf(",'application')")>=0);

  const card = document.createElement('div'); card.className = 'card fpa'; card.dataset.coll = '1';
  card.innerHTML = `<div class="fpa-h">Project Details</div>
    <div class="fpa-g fpa-pd" data-s="pd"></div>
    <div class="fpa-sub" data-s="pos"></div>
    <div class="fpa-g fpa-terms">
      <section class="fpa-sec s2"><div class="fpa-h">Contract Terms</div><div class="fpa-sg" data-s="terms"></div></section>
      <section class="fpa-sec s2"><div class="fpa-h">Retention</div><div class="fpa-sg" data-s="ret"></div></section>
      <section class="fpa-sec s3"><div class="fpa-h">Payment</div><div class="fpa-sg" data-s="pay"></div></section>
      <section class="fpa-sec s1"><div class="fpa-h">Overheads</div><div class="fpa-sg" data-s="ohp"></div></section>
      <section class="fpa-sec s4"><div class="fpa-h">Monthly Application Dates <span class="fpa-hint">Filled in from the application day. Change any month by hand</span></div><div data-s="appd"></div></section>
      <section class="fpa-sec s4"><div class="fpa-h">Billing <span class="fpa-hint" data-s="billhint"></span><span class="fpa-hbtn" data-s="billbtn"></span></div><div class="fpa-sg" data-s="bill"></div></section>
    </div>
    <div class="fpa-foot" data-s="foot"></div>`;
  const slot = k=>card.querySelector('[data-s="'+k+'"]');
  const put = (k, f)=>{ if(f) slot(k).appendChild(f); };

  // ---- Project Details ----
  const pd = slot('pd');
  const jn = fld('finJobNo', 'Job No', 'jobno');
  if(jn){ const i = jn.querySelector('input'); if(auto){ i.readOnly = true; i.title = 'Given automatically — Finance › Settings'; if(!i.value) i.placeholder = 'Automatic'; jn.querySelector('.field-label').textContent = 'Job No (auto)'; } pd.appendChild(jn); }
  const roIf = (id, label, key, val)=>{ const f = fld(id, label, key); if(f) pd.appendChild(f); else pd.insertAdjacentHTML('beforeend', finPaRoHtml(label, val, 'fk-'+key)); };
  roIf('finJeName', 'Project Name', 'name', site.name);
  roIf('finJeAddr', 'Project Address', 'addr', site.address);
  roIf('finJePc', 'Project Postcode', 'pc', site.postcode);
  put('pd', fld('finContract', 'Contract Value (£ ex VAT)', 'cv'));
  const cl = fld('finJeClient', 'Client', 'client');
  if(cl){ const i = cl.querySelector('input'); i.placeholder = 'Pick from the Directory or type a new one'; pd.appendChild(cl); }
  else pd.insertAdjacentHTML('beforeend', finPaRoHtml('Client', site.client_name, 'fk-client'));
  pd.insertAdjacentHTML('beforeend', `<div class="formfield fpa-f fk-pono"><label class="field-label">PO Number</label><input type="text" id="finPaPoNo" placeholder="Loading…" disabled data-was=""></div>
    <div class="formfield fpa-f fk-pofile"><label class="field-label">Client PO</label><div class="fpa-up"><span class="fpa-files" id="finPaPoList"><span class="fpa-dim">Loading…</span></span><label class="fpa-upbtn" title="Add the client’s PO — any files, several at once">Upload<input type="file" id="finPaPoFiles" multiple disabled onchange="finPaPoPicked(this)"></label></div></div>`);
  roIf('finJeStart', 'Start Date', 'start', site.start_date ? finDate(site.start_date) : '');
  roIf('finJeStatus', 'Status', 'status', typeof FIN_JOB_STATUS!=='undefined' ? FIN_JOB_STATUS[site.status]||site.status : site.status);
  if(document.getElementById('finJePm')) put('pd', fld('finJePm', 'PM', 'pm'));
  else if(!(typeof isFinanceOnly==='function' && isFinanceOnly())){ const p = site.responsible_pm_id && PROFILES && PROFILES[site.responsible_pm_id]; pd.insertAdjacentHTML('beforeend', finPaRoHtml('PM', p ? p.name : '', 'fk-pm')); }
  pd.insertAdjacentHTML('beforeend', `<div class="formfield fpa-f fk-qs"><label class="field-label">QS</label><select id="finJeQs" data-was="">${typeof finQsOptions==='function' ? finQsOptions('') : '<option value="">None yet</option>'}</select></div>`);
  const cvNote = detCard && detCard.querySelector(':scope > p.stub');
  if(cvNote){ cvNote.className = 'fpa-note'; cvNote.removeAttribute('style'); slot('pos').appendChild(cvNote); }

  // ---- Contract Terms ----
  const paid = detCard && detCard.querySelector('.finpaidby');
  const pp = document.createElement('div'); pp.className = 'formfield fpa-f';
  pp.innerHTML = '<label class="field-label">Payment Procedure</label><div class="fpa-ro fpa-pp"></div>';
  if(paid){ const b = paid.querySelector('b'), btn = paid.querySelector('button'); if(b){ const full = b.textContent.replace(/^[^A-Za-z]+/, '').trim(); b.textContent = /^applications/i.test(full) ? 'Applications' : full; b.title = full; pp.lastChild.appendChild(b); } if(btn){ btn.title = btn.textContent; btn.textContent = 'Change'; pp.lastChild.appendChild(btn); } paid.remove(); }
  else pp.lastChild.innerHTML = '<span class="fpa-dim">Not chosen yet — choose at the top of the page</span>';
  slot('terms').appendChild(pp);
  put('terms', fld('finVat', 'VAT', 'vat'));
  put('ret', fld('finRet', 'Retention %', 'ret'));
  put('ret', fld('finRetLimit', 'Retention Limit %', 'retlim'));
  put('pay', fld('finDue', 'Days to Due Date', 'due'));
  put('pay', fld('finFinal', 'Days to Final Date', 'final'));
  const adf = fld('finAppDay', 'Application Day (of month)', 'appday'); if(adf){ adf.querySelector('input').placeholder = 'e.g. 25'; adf.querySelector('input').title = 'Day of the month the application is due'; slot('pay').appendChild(adf); }
  const oh = ff('finOhpJob');
  if(oh){ const i = oh.querySelector('input'); fld('finOhpJob', 'Overheads %', 'ohp'); i.placeholder = 'Company figure: '+(i.placeholder||'0')+'%'; i.title = 'Leave blank to use the company figure'; slot('ohp').appendChild(oh); }
  else slot('ohp').closest('.fpa-sec').remove();
  const ad = detCard && detCard.querySelector('details.finappdates');
  // Application jobs: a drop-down, closed to start. Typing the application day fills in every month.
  if(ad){ ad.open = false; ad.removeAttribute('style'); slot('appd').appendChild(ad);
    const h = slot('appd').closest('.fpa-sec').querySelector(':scope > .fpa-h'); const sm = ad.querySelector('summary');
    if(h && sm){ sm.innerHTML = h.innerHTML; sm.className = "fpa-h"; h.remove(); }
    finPaAppDatesFill(true);
  }
  else slot('appd').closest('.fpa-sec').remove();
  if(isInv){
    const hide = el=>{ if(el) el.style.display = 'none'; };   // hidden, not removed: Save still reads them
    hide(slot('ret').closest('.fpa-sec')); hide(slot('appd').closest('.fpa-sec')); hide(adf);
  }

  // ---- Billing (from the client in the Directory) ----
  const bill = slot('bill');
  ['finBillName', 'finBillAddr', 'finBillEmail'].forEach(id=>{ const el = document.getElementById(id); if(el) card.appendChild(el); });
  bill.insertAdjacentHTML('beforeend', `<div class="formfield fpa-f"><label class="field-label">Bill To</label><div class="fpa-ro" id="finPaBillName"></div></div>
    <div class="formfield fpa-f"><label class="field-label">Billing Address</label><div class="fpa-ro" id="finPaBillAddr"></div></div>
    <div class="formfield fpa-f"><label class="field-label">Accounts Email</label><div class="fpa-ro" id="finPaBillEmail"></div></div>`);
  const notes = ff('finNotes'); if(notes){ notes.classList.add('fpa-f'); notes.querySelector('.field-label').textContent = 'Payment Notes'; const ta = notes.querySelector('textarea'); ta.rows = 1; ta.placeholder = 'Anything about payment'; bill.appendChild(notes); }
  const dirBtn = billCard && billCard.querySelector('button[onclick^="openFinDirEdit"]');
  if(dirBtn){ dirBtn.className = 'linkbtn'; dirBtn.removeAttribute('style'); slot('billbtn').appendChild(dirBtn); }

  // ---- One Save button; delete sits beside it ----
  const foot = slot('foot');
  const save = document.getElementById('finJobSave'); if(save){ save.removeAttribute('style'); foot.appendChild(save); }
  const del = jobCard && jobCard.querySelector('button[onclick^="finDeleteJob"]'); if(del){ del.removeAttribute('style'); del.classList.add('fpa-del'); foot.appendChild(del); }

  // Anything else still in the old cards (a field added later) is kept, under "More", rather than lost.
  const left = [jobCard, detCard, billCard].filter(Boolean).flatMap(c=>Array.from(c.querySelectorAll('.formfield')).filter(f=>f.querySelector('input:not([type=hidden]),select,textarea')));
  if(left.length){ const sec = document.createElement('section'); sec.className = 'fpa-sec s4'; sec.innerHTML = '<div class="fpa-h">More</div><div class="fpa-sg"></div>'; left.forEach(f=>{ f.classList.add('fpa-f'); sec.lastChild.appendChild(f); }); card.querySelector('.fpa-terms').appendChild(sec); }
  [poCard, jobCard, detCard, billCard].forEach(c=>{ if(c && c.parentNode) c.remove(); });
  root.prepend(card);
  finPaBillPaint();
  const cIn = document.getElementById('finJeClient'); if(cIn) cIn.addEventListener('change', finPaBillPaint);
  finPaLoad(siteId);
}
// Bill to / address / email shown from the Directory client (what invoices use).
function finPaBillPaint(){
  const set = (id, v, dim)=>{ const el = document.getElementById(id); if(el) el.innerHTML = v ? escapeHtml(v) : '<span class="fpa-dim">'+escapeHtml(dim||'—')+'</span>'; };
  const typed = (document.getElementById('finJeClient')||{}).value;
  const name = typed!=null ? String(typed).trim() : finVal('finBillName');
  const c = typeof finClientByName==='function' ? finClientByName(name) : null;
  const hint = document.querySelector('.fpa [data-s="billhint"]');
  if(c){ set('finPaBillName', c.name); set('finPaBillAddr', String(finClientAddr(c)||'').replace(/\n/g, ', ')); set('finPaBillEmail', c.email||'', 'No accounts email yet'); if(hint) hint.textContent = 'From the client in the Directory'; }
  else if(name && name===finVal('finBillName')){ set('finPaBillName', name); set('finPaBillAddr', finVal('finBillAddr').replace(/\n/g, ', ')); set('finPaBillEmail', finVal('finBillEmail')); if(hint) hint.textContent = 'Not in the Directory yet'; }
  else { set('finPaBillName', name, 'No client yet'); set('finPaBillAddr', ''); set('finPaBillEmail', ''); if(hint) hint.textContent = name ? 'New client — added to the Directory when you save' : 'Add a client in Project Details'; }
}
// Main client PO + QS fill in once read (a failed read leaves the PO boxes locked, so nothing is overwritten).
async function finPaLoad(siteId){
  const gen = RENDER_GEN;
  const [pr, qr] = await Promise.all([
    dbSelectChecked('client_pos', 'site_id=eq.'+siteId+'&order=is_primary.desc,created_at.asc').catch(()=>({ok:false})),
    dbSelectChecked('job_finance', 'site_id=eq.'+siteId+'&select=qs_id').catch(()=>({ok:false}))]);
  if(gen !== RENDER_GEN) return;
  const qs = document.getElementById('finJeQs');
  if(qs && qr && qr.ok && qr.data[0] && qr.data[0].qs_id){ qs.innerHTML = finQsOptions(qr.data[0].qs_id); qs.dataset.was = qr.data[0].qs_id; }
  const no = document.getElementById('finPaPoNo'), fi = document.getElementById('finPaPoFiles'), list = document.getElementById('finPaPoList');
  if(!no || !fi || !list) return;
  if(!pr || !pr.ok){ no.placeholder = 'Couldn’t load'; list.innerHTML = '<span class="fpa-dim">Couldn’t load the PO — reload to try again</span>'; return; }
  const pos = pr.data || [];
  const main = pos.find(p=>p.is_primary) || pos[0] || null;
  no.disabled = false; fi.disabled = false;
  no.placeholder = 'As on the client’s order';
  no.value = main ? (main.po_number||'') : ''; no.dataset.was = no.value; no.dataset.id = main ? main.id : '';
  finPaPoFilesPaint(main);
  // Date / description and any other POs (e.g. for a variation) — small line under the grid.
  const sub = document.querySelector('.fpa [data-s="pos"]'); if(!sub) return;
  const others = pos.filter(p=>p!==main);
  const d = p=>[p.po_date ? finDate(p.po_date) : '', p.description||''].filter(Boolean).map(escapeHtml).join(' · ');
  const nFiles = p=>finPoFilesOf(p).length;
  sub.insertAdjacentHTML('afterbegin', `<div class="fpa-pos">${main ? `<span><b>Main PO</b> ${escapeHtml(main.po_number||'')}${d(main) ? ' · '+d(main) : ''} <button type="button" class="linkbtn" onclick="openClientPoForm('${siteId}','${main.id}')">Date, description…</button></span>` : ''}
    ${others.map(p=>`<span><b>PO</b> ${escapeHtml(p.po_number||'')}${d(p) ? ' · '+d(p) : ''}${nFiles(p) ? ` <button type="button" class="linkbtn" onclick="openClientPoFile('${p.id}')">View${nFiles(p)>1?' ('+nFiles(p)+')':''}</button>` : ''} <button type="button" class="linkbtn" onclick="openClientPoForm('${siteId}','${p.id}')">Edit</button></span>`).join('')}
    ${main ? `<button type="button" class="linkbtn" onclick="openClientPoForm('${siteId}')">+ Add another PO</button>` : ''}</div>`);
}
function finPaPoFilesPaint(main){
  const list = document.getElementById('finPaPoList'); if(!list) return;
  const fl = main ? finPoFilesOf(main) : [];
  const fi = document.getElementById('finPaPoFiles'); const picked = fi && fi.files ? fi.files.length : 0;
  let h = '';
  if(fl.length===1) h = `<button type="button" class="fpa-chip" title="${escapeHtml(fl[0].name||'')}" onclick="openClientPoFile('${main.id}',0)">📄 ${escapeHtml(fl[0].name||'PO')}</button>`;
  else if(fl.length>1) h = `<button type="button" class="fpa-chip" onclick="openClientPoFile('${main.id}')">📄 ${fl.length} files · View</button>`;
  if(picked) h += `<span class="fpa-new">+ ${picked} new</span>`;
  list.innerHTML = h || '<span class="fpa-dim">No copy yet</span>';
}
window.finPaPoPicked = function(inp){
  const id = (document.getElementById('finPaPoNo')||{}).dataset.id;
  const big = Array.from(inp.files||[]).some(f=>f.size > 20*1024*1024);
  if(big){ toast('One of the files is over 20 MB.'); inp.value = ''; }
  (id ? dbSelect('client_pos', 'id=eq.'+id).then(r=>r[0]||null).catch(()=>null) : Promise.resolve(null)).then(finPaPoFilesPaint);
};
// Same checks as saving (900), done first so nothing half-saves when one box is wrong.
function finPaCheck(siteId){
  const site = SITES.find(s=>s.id===siteId) || {};
  if(document.getElementById('finJeName') && !finVal('finJeName')) return 'A project needs a name.';
  const jn = document.getElementById('finJobNo');
  if(jn && !jn.readOnly && finVal('finJobNo')!==String(site.job_number||'') && !finVal('finJobNo')) return 'A project needs a project number.';
  const contract = finNum(finVal('finContract')), ret = finNum(finVal('finRet')), retLim = finNum(finVal('finRetLimit')), appDay = finInt(finVal('finAppDay'));
  if(contract!==null && (isNaN(contract) || contract < 0)) return 'Enter the contract value as a number.';
  if(ret!==null && (isNaN(ret) || ret < 0 || ret > 100)) return 'Retention must be between 0 and 100%.';
  if(retLim!==null && (isNaN(retLim) || retLim < 0 || retLim > 100)) return 'Retention limit must be between 0 and 100%.';
  if(appDay!==null && (isNaN(appDay) || appDay < 1 || appDay > 31)) return 'Application date must be a day of the month, 1 to 31.';
  const no = document.getElementById('finPaPoNo'), fi = document.getElementById('finPaPoFiles');
  if(no && !no.disabled){
    const files = Array.from((fi && fi.files) || []);
    if(files.length && !no.value.trim()) return 'Add the client PO number for the PO copy.';
    if(!no.value.trim() && no.dataset.was) return 'A client PO needs a number. To remove the PO, use “Date, description…” under Project Details.';
    if(files.some(f=>f.size > 20*1024*1024)) return 'One of the PO files is over 20 MB.';
  }
  return '';
}
// The main client PO: number and any new files (added to the ones already there).
async function finPaSavePo(siteId){
  const no = document.getElementById('finPaPoNo'), fi = document.getElementById('finPaPoFiles');
  if(!no || no.disabled) return true;
  const num = no.value.trim(), files = Array.from((fi && fi.files) || []), id = no.dataset.id || '';
  if(num===(no.dataset.was||'') && !files.length) return true;
  const row = {po_number:num};
  if(files.length){
    let old = [];
    if(id){
      const r = await dbSelectChecked('client_pos', 'id=eq.'+id+'&select=file_path,file_name,files');
      if(!r.ok){ toast('Couldn’t read the PO’s saved files — check your connection and try again.'); return false; }
      old = finPoFilesOf((r.data||[])[0]||{});
    }
    const all = old.slice();
    for(const f of files){
      const safe = f.name.replace(/[^a-z0-9.\-]+/gi, '_').slice(-80);
      const stored = await uploadToStorage('finance-docs', ME.org_id+'/'+siteId+'/client-po/'+uid()+'-'+safe, f, f.type||'application/octet-stream');
      if(!stored){ toast('The PO file didn’t upload — nothing was saved. Try again.'); return false; }
      all.push({path:stored, name:f.name});
    }
    row.files = all; row.file_path = all[0].path; row.file_name = all[0].name;
  }
  let saved;
  if(id) saved = await dbUpdate('client_pos', id, row);
  else { const r = await dbInsert('client_pos', Object.assign({org_id:ME.org_id, site_id:siteId, created_by:ME.id, is_primary:true}, row)); saved = r && r[0]; }
  if(!saved) return false;
  no.dataset.was = num; no.dataset.id = saved.id; if(fi) fi.value = '';
  return true;
}
(function(){
  const base = finAfterProjectRender;
  finAfterProjectRender = function(){ try{ finPaLayout(); }catch(e){ console.error(e); } return base.apply(this, arguments); };
  const save = window.saveSiteFinance;
  window.saveSiteFinance = async function(siteId){
    if(!document.querySelector('.fpa')) return save.apply(this, arguments);
    const err = finPaCheck(siteId); if(err){ toast(err); return; }
    const btn = document.getElementById('finJobSave'); const was = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
    const ok = await finPaSavePo(siteId);
    if(btn){ btn.disabled = false; btn.textContent = was; }
    if(!ok) return;
    return save.apply(this, arguments);
  };
  const st = document.createElement('style');
  st.textContent = `.fpa{padding:14px 18px 16px !important;}
html.desk.finmode .fpa{padding:16px 22px 18px !important;}
.fpa .fpa-h{display:flex;align-items:baseline;gap:10px;font-size:14px;font-weight:800;color:var(--ink);margin:0 0 8px;padding-bottom:5px;border-bottom:1px solid var(--line,#E6E8EC);grid-column:1 / -1;}
.fpa .fpa-hint{font-size:11.5px;font-weight:500;color:var(--slate);flex:1;min-width:0;}
.fpa .fpa-hbtn{margin-left:auto;} .fpa .fpa-hbtn .linkbtn{font-size:12.5px;padding:0;margin:0;color:var(--blue,#1f6feb);white-space:nowrap;}
.fpa-g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 14px;}
.fpa-terms{margin-top:16px;row-gap:16px;}
.fpa-sec{min-width:0;}
.fpa-sec.s1{grid-column:span 1;} .fpa-sec.s2{grid-column:span 2;} .fpa-sec.s3{grid-column:span 3;} .fpa-sec.s4{grid-column:1 / -1;}
.fpa-sg{display:grid;gap:10px 14px;}
.fpa-sec.s1 .fpa-sg{grid-template-columns:minmax(0,1fr);} .fpa-sec.s2 .fpa-sg{grid-template-columns:repeat(2,minmax(0,1fr));}
.fpa-sec.s3 .fpa-sg{grid-template-columns:repeat(3,minmax(0,1fr));} .fpa-sec.s4 .fpa-sg{grid-template-columns:repeat(4,minmax(0,1fr));}
.fpa .formfield{margin:0 !important;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;}
html .fpa .field-label, html.finmode .fpa .field-label{display:block;font-size:10.5px !important;font-weight:800 !important;text-transform:uppercase !important;letter-spacing:.04em !important;color:var(--slate) !important;margin:0 0 4px !important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;}
html .fpa input[type=text], html .fpa input[type=number], html .fpa input[type=date], html .fpa input[type=email], html .fpa select, html .fpa textarea, .fpa .fpa-ro, .fpa .fpa-up{box-sizing:border-box;width:100%;height:36px !important;min-height:36px !important;margin:0 !important;padding:0 10px !important;font-size:13.5px !important;line-height:34px;border-radius:8px !important;}
html .fpa select{padding:0 24px 0 8px !important;font-size:13px !important;}
html .fpa .fk-vat select{padding-right:20px !important;font-size:12.5px !important;}
html .fpa textarea{line-height:1.35;padding:8px 10px !important;resize:vertical;}
html .fpa input[disabled], html .fpa input[readonly]{background:#F4F5F7 !important;color:#5A5E66;}
.fpa .fpa-ro{display:flex;align-items:center;gap:8px;border:1px solid var(--line,#E1E4EA);background:#F7F8FA;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fpa .fpa-ro b{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
.fpa .fpa-pp .linkbtn{margin-left:auto;font-size:12.5px;padding:0;flex:none;color:var(--blue,#1f6feb);}
.fpa .fpa-dim{color:#9AA0A8;font-weight:500;}
.fpa .fpa-up{display:flex;align-items:center;gap:6px;border:1px solid var(--line,#E1E4EA);background:#fff;padding:0 4px 0 8px !important;}
.fpa .fpa-files{flex:1;min-width:0;display:flex;align-items:center;gap:6px;overflow:hidden;font-size:12.5px;}
.fpa .fpa-chip{all:unset;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
.fpa .fpa-chip:hover{text-decoration:underline;}
.fpa .fpa-new{font-size:11.5px;font-weight:700;color:#2E7D32;white-space:nowrap;}
.fpa .fpa-upbtn{flex:none;position:relative;overflow:hidden;cursor:pointer;font-size:12px;font-weight:700;color:var(--ink);border:1px solid #D1D5DB;border-radius:6px;padding:0 9px;height:26px;line-height:24px;background:#fff;}
.fpa .fpa-upbtn input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
.fpa .fpa-upbtn:has(input[disabled]){opacity:.5;cursor:default;}
.fpa .fpa-sub{margin-top:8px;}
.fpa .fpa-pos{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;font-size:12.5px;color:var(--slate);}
.fpa .fpa-pos b{color:var(--ink);font-weight:700;}
.fpa .fpa-pos .linkbtn{font-size:12.5px;padding:0;margin:0 0 0 4px;color:var(--blue,#1f6feb);}
.fpa .fpa-note{font-size:12px;color:var(--slate);margin:4px 0 0;font-style:normal;}
.fpa .fpa-pos, .fpa .fpa-note{display:none !important;}   /* Andy, 25 Oct: not needed */
.fpa .finappdates{border:0 !important;background:none !important;padding:0 !important;margin:0 !important;box-shadow:none !important;}
.fpa .finappdates > summary, .fpa .finappdates > p.stub{display:none !important;}
.fpa .finappdates-g{grid-template-columns:repeat(6,minmax(0,1fr)) !important;gap:8px 14px !important;padding:0 !important;}
.fpa .finappdates-g label{display:flex;flex-direction:column;gap:3px;min-width:0;margin:0;}
.fpa .finappdates-g label > span{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--slate);}
.fpa .finappdates-g label.set > span{color:#1f4f99;}
.fpa .finappdates-g input{height:32px !important;min-height:32px !important;font-size:13px !important;padding:0 8px !important;}
.fpa .finappdates-g em{font-style:normal;font-size:10.5px;color:#9AA0A8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fpa .fpa-foot{display:flex;align-items:center;gap:14px;margin-top:18px;padding-top:14px;border-top:1px solid var(--line,#E6E8EC);}
.fpa .fpa-foot #finJobSave{width:auto !important;min-width:220px !important;margin:0 !important;height:40px;padding:0 24px !important;font-size:14px !important;}
.fpa .fpa-foot .fpa-del{margin-left:auto;color:#C0392B;font-size:13px;padding:0;}
@media (max-width:900px){
  .fpa-g{grid-template-columns:repeat(2,minmax(0,1fr));}
  .fpa-sec.s1,.fpa-sec.s2,.fpa-sec.s3{grid-column:1 / -1;}
  .fpa-sec .fpa-sg{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}
  .fpa-pd .fk-name{order:1;grid-column:1 / -1;} .fpa-pd .fk-jobno{order:2;} .fpa-pd .fk-status{order:3;}
  .fpa-pd .fk-addr{order:4;grid-column:1 / -1;} .fpa-pd .fk-pc{order:5;} .fpa-pd .fk-start{order:6;}
  .fpa-pd .fk-client{order:7;grid-column:1 / -1;} .fpa-pd .fk-cv{order:8;} .fpa-pd .fk-pono{order:9;}
  .fpa-pd .fk-pofile{order:10;grid-column:1 / -1;} .fpa-pd .fk-pm{order:11;} .fpa-pd .fk-qs{order:12;}
  .fpa .fpa-terms .fpa-sec.s2:first-child .fpa-sg > .formfield{grid-column:1 / -1;}
  .fpa .finappdates-g{grid-template-columns:repeat(3,minmax(0,1fr)) !important;}
}
@media (max-width:560px){
  .fpa{padding:12px 12px 14px !important;}
  .fpa-g, .fpa-sg{gap:8px 10px !important;}
  .fpa .finappdates-g{grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:8px 10px !important;}
  .fpa .fpa-hint{display:none;}
  html .fpa .field-label, html.finmode .fpa .field-label{white-space:normal;}
  .fpa .fpa-foot{flex-wrap:wrap;}
  .fpa .fpa-foot #finJobSave{flex:1 1 100% !important;width:100% !important;max-width:none !important;}
  .fpa .fpa-foot .fpa-del{margin:0 auto;}
  .fpa [data-s="bill"] > .formfield{grid-column:1 / -1;}
}`;
  document.head.appendChild(st);
})();

/* Monthly application dates follow the application day: each month's box shows its date (the day,
   or the month's last day if shorter). A date picked by hand stays as it is. */
document.addEventListener('input', e=>{ if(e.target && e.target.id==='finAppDay') finPaAppDatesFill(false); });
function finPaAppDatesFill(first){
  const day = finInt(finVal('finAppDay'));
  document.querySelectorAll('.finappdates input[data-ym]').forEach(el=>{
    const ym = el.dataset.ym;
    const def = day && day>=1 && day<=31 ? ym+'-'+String(Math.min(day, new Date(+ym.slice(0,4), +ym.slice(5,7), 0).getDate())).padStart(2,'0') : '';
    const hand = first ? (!!el.value && el.value!==el.dataset.def) : el.parentNode.classList.contains('set');
    if(!hand) el.value = def;
    el.dataset.def = def;
    const em = el.parentNode.querySelector('em'); if(em) em.textContent = def ? (hand ? 'Normally '+finDate(def) : 'Application day') : 'No day set';
    el.parentNode.classList.toggle('set', hand);
  });
}
(function(){
  const st = document.createElement('style');
  st.textContent = `.fpa details.finappdates > summary{display:flex !important;align-items:baseline;gap:10px;padding:0 0 5px !important;margin:0 0 8px;cursor:pointer;list-style:none;font-size:inherit;}
.fpa details.finappdates > summary::-webkit-details-marker{display:none;}
.fpa details.finappdates > summary::after{content:'';width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);margin:-3px 0 0 4px;opacity:.55;transition:transform .15s;}
.fpa details.finappdates[open] > summary::after{transform:rotate(-135deg);margin-top:3px;}
.fpa details.finappdates[open] > summary{margin-bottom:10px;}`;
  document.head.appendChild(st);
})();
