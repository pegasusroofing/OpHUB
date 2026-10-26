/* ============================================================
   OpHUB Finance — "Send" pop-up for sales invoices and applications (26 Oct 2026, Andy: like
   Xero's Send Sales Invoice: From, Reply To, To, Subject, Message, Attachments, Send me a copy).
   Clicking Email opens it filled in; everything can be changed before it goes:
   - To: one or more addresses, separated by commas.
   - Subject and Message: written for you, edit as you like; sent exactly as typed.
   - Attachments: the invoice PDF / the application (Excel), plus the Schedule of Works report
     for applications (if the project has one); take any off with ×, add your own files with +.
   Sent through send-finance-email (v4: subject, body_text and up to 6 extra files).
   ============================================================ */
let finSend = null;   // {kind, siteId, id, mode, att:[{key, name, file?, on}], sowRange}
const FIN_SEND_MAX_FILES = 6, FIN_SEND_MAX_MB = 30;

function finSendClient(jf, site, inv){
  return (inv && inv.bill_name) || (jf && jf.billing_name) || (site && site.client_name) || '';
}
function finSendOverlay(){
  let ov = document.getElementById('finMailOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finMailOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) finSendClose(); };
  return ov;
}
window.finSendClose = function(){ const ov = document.getElementById('finMailOverlay'); if(ov) ov.style.display = 'none'; finSend = null; };

function finSendHtml(o){
  return `<div class="geo-modal-card finsend">
    <div class="finsend-h"><div><h3>${escapeHtml(o.title)}</h3><p>Send this document by email. Separate more than one address with commas.</p></div>
</div>
    <div class="finsend-kv"><span>From</span><b>${escapeHtml((ME && ME.name) || '')}${ORG && ORG.name ? ' · '+escapeHtml(ORG.name) : ''}</b>
      <span>Reply To</span><b>${escapeHtml((ME && ME.email) || '')}</b></div>
    <label class="finsend-l" for="finMailTo">To</label>
    <input type="text" id="finMailTo" class="finsend-in" value="${escapeHtml(o.to||'')}" placeholder="accounts@client.co.uk, qs@client.co.uk" autocomplete="off">
    ${o.to ? '' : '<p class="finsend-hint warn">No accounts email saved for this client. Type it here, and add it to the project’s Billing so it’s there next time.</p>'}
    <label class="finsend-l" for="finMailSubj">Subject</label>
    <input type="text" id="finMailSubj" class="finsend-in" value="${escapeHtml(o.subject)}" maxlength="200">
    <label class="finsend-l" for="finMailBody">Message</label>
    <textarea id="finMailBody" class="finsend-in finsend-ta" rows="9">${escapeHtml(o.body)}</textarea>
    <label class="finsend-l">Attachments</label>
    <div class="finsend-att" id="finSendAtt"></div>
    <p class="finsend-hint">Choose which files go with this email.</p>
    <label class="finsend-me"><input type="checkbox" id="finMailMe"> Send me a copy (${escapeHtml((ME && ME.email) || '')})</label>
    <div class="finsend-foot"><button type="button" class="ghostbtn" onclick="finSendClose()">Cancel</button><button type="button" class="darkbtn" id="finMailSend" onclick="finSendGo()">Send</button></div>
  </div>`;
}
function finSendAttPaint(){
  const box = document.getElementById('finSendAtt'); if(!box || !finSend) return;
  const chips = finSend.att.filter(a=>a.on).map((a, i)=>{
    const idx = finSend.att.indexOf(a);
    const sow = a.key==='sow' && finSend.sowRange ? `<select class="finsend-sow" onchange="finSend.sowMode=this.value" title="What goes in the report"><option value="full" ${finSend.sowMode!=='photos'?'selected':''}>Whole schedule</option><option value="photos" ${finSend.sowMode==='photos'?'selected':''}>Photos ${finDate(finSend.sowRange.from)} – ${finDate(finSend.sowRange.to)}</option></select>` : '';
    return `<span class="finsend-chip"><span class="finsend-cn" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>${sow}<button type="button" aria-label="Remove ${escapeHtml(a.name)}" onclick="finSendAttOff(${idx})">✕</button></span>`;
  }).join('');
  const off = finSend.att.filter(a=>!a.on && a.key!=='file');
  box.innerHTML = chips + `<label class="finsend-add" title="Add a file"><input type="file" multiple onchange="finSendAttAdd(this)">+</label>`
    + off.map(a=>`<button type="button" class="finsend-back" onclick="finSendAttOn(${finSend.att.indexOf(a)})">+ ${escapeHtml(a.name)}</button>`).join('');
}
window.finSendAttOff = function(i){ const a = finSend && finSend.att[i]; if(!a) return; if(a.key==='file') finSend.att.splice(i, 1); else a.on = false; finSendAttPaint(); };
window.finSendAttOn = function(i){ const a = finSend && finSend.att[i]; if(a){ a.on = true; finSendAttPaint(); } };
window.finSendAttAdd = function(inp){
  if(!finSend) return;
  Array.from(inp.files || []).forEach(f=>{
    if(f.size > FIN_SEND_MAX_MB*1024*1024){ toast(f.name+' is too big to email (over '+FIN_SEND_MAX_MB+' MB).'); return; }
    if(finSend.att.filter(a=>a.on && a.key!=='main').length >= FIN_SEND_MAX_FILES){ toast('That’s the most files one email can take.'); return; }
    finSend.att.push({key:'file', name:f.name, file:f, on:true});
  });
  inp.value = ''; finSendAttPaint();
};
function finSendOpen(o){
  const ov = finSendOverlay();
  ov.innerHTML = finSendHtml(o);
  ov.style.display = 'flex';
  finSendAttPaint();
  setTimeout(()=>{ const t = document.getElementById('finMailTo'); if(t && !t.value) t.focus(); }, 30);
}

/* ---------- sales invoices ---------- */
window.openFinEmail = async function(siteId, invId, mode){
  const inv = (await dbSelect('fin_invoices', 'id=eq.'+invId))[0]; if(!inv) return;
  const site = SITES.find(x=>x.id===inv.site_id) || SITES.find(x=>x.id===siteId) || {};
  const jf = (await dbSelect('job_finance', 'site_id=eq.'+(inv.site_id||siteId)).catch(()=>[]))[0] || {};
  const client = finSendClient(jf, site, inv), company = (ORG && ORG.name) || '';
  const num = inv.number || '', isCredit = inv.kind==='credit' || Number(inv.total) < 0;
  const docName = isCredit ? 'credit note' : 'sales invoice';
  const reminder = mode==='reminder';
  const subject = reminder
    ? `Reminder: ${isCredit?'Credit Note':'Sales Invoice'} ${num} from ${company}${client ? ' to '+client : ''}`
    : `${isCredit?'Credit Note':'Sales Invoice'} ${num} from ${company}${client ? ' to '+client : ''}`;
  const hi = client ? `Hi ${client},` : 'Hello,';
  const po = inv.client_po ? ` (your PO ${inv.client_po})` : '';
  const body = reminder
    ? `${hi}\n\nThis is a reminder that ${docName} ${num}${po} was due on ${finDate(inv.due_date)}, and ${finMoney(finInvOutstanding(inv))} is still outstanding.\n\nPlease could you let us know when it will be paid?\n\nKind regards,`
    : `${hi}\n\nPlease find attached ${docName} ${num} for ${site.name || 'the works'}${site.job_number ? ' (job '+site.job_number+')' : ''}${po}.\n\nAmount: ${finMoney(inv.total)}${Number(inv.vat||0) ? ' including VAT' : ''}${inv.due_date && !isCredit ? '\nPayment due by: '+finDate(inv.due_date) : ''}\n\n${isCredit ? 'This credit note will be taken off your account.' : 'Our bank details are on the invoice.'} If you have any questions, please let us know.\n\nKind regards,`;
  finSend = {kind:'invoice', siteId: inv.site_id || siteId, id: invId, mode, att:[{key:'main', name: finInvFilename(inv, site), on:true}]};
  finSendOpen({title: reminder ? 'Send Reminder' : (isCredit ? 'Send Credit Note' : 'Send Sales Invoice'), to: inv.bill_email || jf.billing_email || site.client_email || '', subject, body});
};

/* ---------- applications ---------- */
window.openFinAppEmail = async function(siteId, appId){
  // Only a draft is saved first — "Email again" on an applied one must not rewrite its figures (audit FA-09).
  if(typeof finApp!=='undefined' && finApp && finApp.id===appId && typeof finAppCtx!=='undefined' && finAppCtx && !finAppCtx.locked) await saveFinApplication(false);
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a) return;
  const jf = (await dbSelect('job_finance', 'site_id=eq.'+siteId))[0] || {};
  const site = SITES.find(s=>s.id===siteId) || {};
  const client = finSendClient(jf, site, null), company = (ORG && ORG.name) || '';
  const hi = client ? `Hi ${client},` : 'Hello,';
  const val = a.valuation_date ? ` (valued to ${finDate(a.valuation_date)})` : '';
  const subject = `Application for Payment ${a.number} from ${company}${client ? ' to '+client : ''} — ${site.name||''}${site.job_number ? ' ('+site.job_number+')' : ''}`;
  const body = `${hi}\n\nPlease find attached application for payment ${a.number} for ${site.name||'the project'}${val}.\n\nAmount applied for: ${finMoney(a.net_due)} excl. VAT${a.due_date ? '\nDue: '+finDate(a.due_date) : ''}${a.client_po ? '\nYour PO: '+a.client_po : ''}\n\nIf you have any questions, please let us know.\n\nKind regards,`;
  const att = [{key:'main', name: finAppFilename(a), on:true}];
  let sowRange = null;
  try{
    if(typeof finSowHasTasks==='function' && await finSowHasTasks(siteId)){
      sowRange = finSowRange(await finSowPrevDate(a), a);
      att.push({key:'sow', name: finSowFilename(a), on: finSowPrefs().include !== false});
    }
  }catch(e){ console.error(e); }
  finSend = {kind:'application', siteId, id: appId, att, sowRange, sowMode: sowRange ? finSowPrefs().mode : 'full'};
  finSendOpen({title:'Send Application for Payment', to: jf.billing_email || site.client_email || '', subject, body});
};

/* ---------- send ---------- */
window.finSendGo = async function(){
  if(!finSend) return;
  const s = finSend;
  const to = finVal('finMailTo').split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);
  if(!to.length || to.some(e=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))){ toast('Check the email address — separate more than one with commas.'); return; }
  const subject = finVal('finMailSubj'), bodyText = (document.getElementById('finMailBody')||{}).value || '';
  if(!subject){ toast('Add a subject.'); return; }
  if(!s.att.some(a=>a.on)){ toast('Attach at least one file.'); return; }
  const me = document.getElementById('finMailMe');
  const btn = document.getElementById('finMailSend'); const reset = ()=>{ if(btn){ btn.disabled = false; btn.textContent = 'Send'; } };
  if(btn){ btn.disabled = true; btn.textContent = 'Preparing…'; }
  const on = k=>s.att.find(a=>a.key===k && a.on);
  const extra = [];
  let mainPath = '', mainName = '', after = null, ref = '', amount = '', due = '', clientPo = '';
  try{
    if(s.kind==='invoice'){
      let inv = (await dbSelect('fin_invoices', 'id=eq.'+s.id))[0]; if(!inv){ reset(); return; }
      const site = SITES.find(x=>x.id===s.siteId) || {};
      if(on('main')){
        if(!inv.pdf_path){ const p = await finStoreInvoicePdf(inv); if(!p){ reset(); return; } inv.pdf_path = p; }
        mainPath = inv.pdf_path; mainName = finInvFilename(inv, site);
      }
      ref = inv.number || ''; amount = finMoney(inv.total); due = finDate(inv.due_date); clientPo = inv.client_po || '';
      after = ()=>dbUpdate('fin_invoices', s.id, {sent_at:new Date().toISOString(), sent_to:to.join(', '), status: inv.status==='issued' ? 'sent' : inv.status});
    } else {
      const a = (await dbSelect('fin_applications', 'id=eq.'+s.id))[0]; if(!a){ reset(); return; }
      let stored = null;
      if(on('main')){
        const buf = await finAppExcelBytes(a); if(!buf){ reset(); return; }
        stored = await uploadToStorage('finance-docs', ME.org_id+'/'+s.siteId+'/applications/Application-'+a.number+'-'+Date.now()+'.xlsx', new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        if(!stored){ reset(); return; }
        mainPath = stored; mainName = finAppFilename(a);
      }
      const sowA = s.att.find(x=>x.key==='sow');
      if(sowA){
        finLsSet(FIN_SOW_LS, {include: !!sowA.on, mode: s.sowMode || 'full'});
        if(sowA.on){
          if(btn) btn.textContent = 'Building the report…';
          const period = s.sowMode==='photos' && s.sowRange ? sowPeriodRange('custom', s.sowRange.from, s.sowRange.to) : {full:true};
          const sow = await finSowBytes(s.siteId, period);
          if(!sow){ toast('The Schedule of Works report couldn’t be built, so nothing was sent.'); reset(); return; }
          const sp = await uploadToStorage('finance-docs', ME.org_id+'/'+s.siteId+'/applications/Application-'+a.number+'-'+Date.now()+'-proof-of-works.pdf', new Blob([sow.outBytes], {type:'application/pdf'}), 'application/pdf');
          if(!sp){ reset(); return; }
          extra.push({storage_path:sp, filename: finSowFilename(a)});
        }
      }
      ref = 'No. '+a.number; amount = finMoney(a.net_due)+' excl. VAT'; due = a.due_date ? finDate(a.due_date) : ''; clientPo = a.client_po || '';
      after = ()=>dbUpdate('fin_applications', s.id, Object.assign(stored ? {excel_path:stored} : {}, {submitted_at:new Date().toISOString(), sent_to:to.join(', '), status: a.status}));
    }
    // Files added with +
    const files = s.att.filter(x=>x.key==='file' && x.on);
    for(let i=0; i<files.length; i++){
      if(btn) btn.textContent = 'Uploading '+(i+1)+' of '+files.length+'…';
      const f = files[i].file, safe = String(f.name||'file').replace(/[^a-z0-9.\-]+/gi,'_').slice(-80);
      const p = await uploadToStorage('finance-docs', ME.org_id+'/'+s.siteId+'/email-attachments/'+uid()+'-'+safe, f, f.type||'application/octet-stream');
      if(!p){ reset(); return; }
      extra.push({storage_path:p, filename: f.name});
    }
  }catch(e){ console.error(e); toast('That didn’t send. Please try again.'); reset(); return; }
  if(!mainPath && !extra.length){ toast('Attach at least one file.'); reset(); return; }
  if(btn) btn.textContent = 'Sending…';
  let res;
  try{
    res = await sbFetch('/functions/v1/send-finance-email', {method:'POST', timeoutMs:90000, body:JSON.stringify({
      kind: s.kind, site_id: s.siteId, storage_path: mainPath, filename: mainName || 'document.pdf', recipients: to, extra_attachments: extra,
      cc: me && me.checked && ME.email ? [ME.email] : [], subject, body_text: bodyText,
      reference: ref, client_po: clientPo, amount, due,
    })});
  }catch(e){ toast('Could not reach the server — check your connection.'); reset(); return; }
  const d = await res.json().catch(()=>({}));
  if(!res.ok || d.error){ toast('Email failed — '+String(d.error||res.status).slice(0,160)); reset(); return; }
  if(after) await after();
  const kind = s.kind;
  finSendClose();
  if(kind==='application' && typeof finApp!=='undefined') finApp = null;
  toast(kind==='invoice' ? 'Invoice sent to '+to.join(', ') : 'Application sent to '+to.join(', '));
  render();
};
// Older buttons call these directly.
window.sendFinEmail = function(){ return finSendGo(); };
window.sendFinAppEmail = function(){ return finSendGo(); };

(function(){
  const st = document.createElement('style');
  st.textContent = `.geo-modal-card.finsend{max-width:640px !important;width:100% !important;text-align:left;padding:22px 24px 18px;max-height:92vh;overflow:auto;}
.finsend-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;}
.finsend-h h3{margin:0;font-size:19px;} .finsend-h p{margin:3px 0 0;font-size:13px;color:var(--slate);}
.finsend-x{all:unset;cursor:pointer;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--slate);}
.finsend-x:hover{background:rgba(16,24,40,.06);}
.finsend-kv{display:grid;grid-template-columns:90px 1fr;gap:6px 10px;font-size:13.5px;margin-bottom:14px;}
.finsend-kv span{color:var(--ink);font-weight:600;} .finsend-kv b{font-weight:400;color:var(--slate);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.finsend-l{display:block;font-size:13.5px;font-weight:700;margin:12px 0 6px;color:var(--ink);}
.finsend .finsend-in{width:100%;box-sizing:border-box;border:1px solid var(--line,#E2E5EA);border-radius:8px;padding:9px 11px;font-size:14px;background:#fff;margin:0;}
.finsend .finsend-in:focus{outline:none;border-color:#2F6FDE;box-shadow:0 0 0 3px rgba(47,111,222,.15);}
.finsend .finsend-ta{min-height:180px;resize:vertical;line-height:1.5;font-family:inherit;}
.finsend-hint{margin:6px 0 0;font-size:12.5px;color:var(--slate);} .finsend-hint.warn{color:#B45309;}
.finsend-att{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.finsend-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line,#E2E5EA);border-radius:999px;padding:5px 6px 5px 12px;font-size:13px;background:#fff;max-width:100%;}
.finsend-cn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px;}
.finsend-chip button{all:unset;cursor:pointer;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--slate);}
.finsend-chip button:hover{background:rgba(16,24,40,.08);color:var(--ink);}
.finsend-sow{font-size:12px !important;height:24px !important;min-height:24px !important;padding:0 6px !important;border-radius:6px !important;width:auto !important;margin:0 !important;}
.finsend-add{width:32px;height:32px;border:1px solid var(--line,#E2E5EA);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;background:#fff;color:var(--ink);}
.finsend-add:hover{background:rgba(16,24,40,.05);} .finsend-add input{display:none;}
.finsend-back{all:unset;cursor:pointer;font-size:12.5px;color:var(--slate);border:1px dashed var(--line,#D5D9E0);border-radius:999px;padding:5px 10px;}
.finsend-back:hover{color:var(--ink);}
.finsend-me{display:flex;align-items:center;gap:10px;margin:16px 0 4px;font-size:14px;cursor:pointer;}
.finsend-me input{width:18px !important;height:18px;margin:0 !important;}
.finsend-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;}
.finsend-foot button{width:auto !important;margin:0 !important;padding:9px 20px !important;}
@media (max-width:600px){ .geo-modal-card.finsend{padding:16px;} .finsend-kv{grid-template-columns:72px 1fr;} .finsend-cn{max-width:200px;} }`;
  document.head.appendChild(st);
})();
