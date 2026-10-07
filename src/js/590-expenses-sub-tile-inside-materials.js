/* ================= EXPENSES (sub-tile inside Materials) ================= */
// Opened from the Expenses sub-tile inside the project's Materials tile.
// A quick way to get receipts to the office: photograph or attach them, say
// which job each is for, Save — and they are emailed to the company's
// preset expenses address (Settings › Branding & Integrations › Expenses
// Email). One screen can carry several entries, each for a different job,
// for fuel, or for a job that isn't on the app (typed in).
let expDraft = null;
function expNewEntry(siteId){ return {key: uid(), job: siteId ? 'site:'+siteId : '', manual:'', note:'', files:[]}; }
function expJobLabel(e){
  if(e.job==='fuel') return 'Fuel'+(e.manual ? ' — '+e.manual : '');
  if(e.job==='manual') return e.manual || 'Not on the app';
  const s = SITES.find(x=>'site:'+x.id===e.job);
  return s ? s.name : '';
}
function expRowLabel(r){
  if(r.site_id){ const s = SITES.find(x=>x.id===r.site_id); return s ? s.name : 'Job'; }
  return (r.category==='fuel' ? 'Fuel'+(r.manual_label ? ' — '+r.manual_label : '') : (r.manual_label || 'Not on the app'));
}
async function renderExpenses(siteId){
  const __gen = RENDER_GEN;
  if(isClient(ME)){ go(`#/site/${siteId}/home`); return; }
  if(!expDraft || expDraft.siteId !== siteId) expDraft = {siteId, entries:[expNewEntry(siteId)], ccMe:false, busy:false, progress:''};
  const d = expDraft;
  await loadOrg();
  const keepMonths = (ORG && ORG.expenses_retention_months) || 3;
  const since = new Date(); since.setMonth(since.getMonth()-keepMonths);
  const recent = await dbSelect('expenses', (isFullManager(ME) ? '' : 'created_by=eq.'+ME.id+'&')+'created_at=gte.'+since.toISOString()+'&order=created_at.desc&limit=200');
  if(isFullManager(ME)) await loadAllProfiles();
  if(__gen !== RENDER_GEN) return;
  const toEmail = (ORG && ORG.expenses_email) || '';
  const jobOptions = e=>`
    <option value="">Choose a job…</option>
    <optgroup label="Jobs on the app">${SITES.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(s=>`<option value="site:${s.id}" ${e.job==='site:'+s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}</optgroup>
    <optgroup label="Something else">
      <option value="fuel" ${e.job==='fuel'?'selected':''}>⛽ Fuel</option>
      <option value="manual" ${e.job==='manual'?'selected':''}>✏️ A job not on the app (type it in)</option>
    </optgroup>`;
  const totalFiles = d.entries.reduce((n,e)=>n+e.files.length, 0);
  document.getElementById('app').innerHTML = shell(`
    <div class="card" style="margin-bottom:12px;">
      <p style="margin:0 0 4px;font-weight:700;">🧾 Send receipts to the office</p>
      <p class="stub" style="margin:0;">Add a photo or file of each receipt and say which job it's for. ${toEmail ? `When you save, each receipt is emailed <b>on its own</b> to <b>${escapeHtml(toEmail)}</b>, labelled with the job — so 6 receipts is 6 emails.` : `<span style="color:var(--warn);font-weight:700;">No expenses email address is set up yet.</span> ${isManager(ME) ? `<span class="viewlink" style="cursor:pointer;" onclick="go('#/team/company/expensesemail')">Add one in Settings › Branding &amp; Integrations</span>.` : 'Ask a manager to add one in Settings.'}`}</p>
    </div>
    ${d.entries.map((e,i)=>`
    <div class="card" style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <p style="margin:0;flex:1;font-weight:700;">Receipt${d.entries.length>1 ? ' group '+(i+1) : 's'}</p>
        ${d.entries.length>1 ? `<span class="viewlink" style="cursor:pointer;color:var(--danger,#B23A3A);" onclick="expRemoveEntry('${e.key}')">Remove</span>` : ''}
      </div>
      <div class="formfield" style="margin-top:0;"><label class="field-label">Which job is this for?</label>
        <select onchange="expSetJob('${e.key}',this.value)">${jobOptions(e)}</select>
      </div>
      ${e.job==='manual' ? `<div class="formfield"><label class="field-label">Job name / address</label><input type="text" maxlength="120" value="${escapeHtml(e.manual)}" oninput="expField('${e.key}','manual',this.value)" placeholder="e.g. 14 High Street, Brentwood"></div>` : ''}
      ${e.job==='fuel' ? `<div class="formfield"><label class="field-label">Vehicle (optional)</label><input type="text" maxlength="60" value="${escapeHtml(e.manual)}" oninput="expField('${e.key}','manual',this.value)" placeholder="e.g. Van reg AB12 CDE"></div>` : ''}
      <div class="formfield"><label class="field-label">Note (optional)</label><input type="text" maxlength="300" value="${escapeHtml(e.note)}" oninput="expField('${e.key}','note',this.value)" placeholder="What it was for, or the amount"></div>
      ${e.files.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 2px;">${e.files.map((f,k)=>`
        <div style="position:relative;width:64px;height:64px;flex:0 0 64px;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--paper);display:flex;align-items:center;justify-content:center;">
          ${f.preview ? `<img src="${f.preview}" style="width:64px;height:64px;object-fit:cover;display:block;">` : `<span style="font-size:10px;font-weight:700;text-align:center;padding:2px;word-break:break-all;line-height:1.15;">📄<br>${escapeHtml((f.name||'file').slice(0,14))}</span>`}
          <div class="taskphotodel" title="Remove" onclick="expRemoveFile('${e.key}',${k})">×</div>
        </div>`).join('')}</div>` : ''}
      <div class="row-gap" style="margin-top:10px;">
        <label class="ghostbtn" style="flex:1;display:block;text-align:center;cursor:pointer;margin:0;${d.busy?'opacity:.6;pointer-events:none;':''}">📷 Take photo
          <input type="file" accept="image/*" capture="environment" style="display:none;" onchange="expAddFiles('${e.key}',this)"></label>
        <label class="ghostbtn" style="flex:1;display:block;text-align:center;cursor:pointer;margin:0;${d.busy?'opacity:.6;pointer-events:none;':''}">📎 Photos / files
          <input type="file" accept="image/*,application/pdf" multiple style="display:none;" onchange="expAddFiles('${e.key}',this)"></label>
      </div>
    </div>`).join('')}
    <button class="ghostbtn" style="width:100%;margin:0 0 12px;" ${d.busy?'disabled':''} onclick="expAddEntry()">+ Add receipts for another job</button>
    <label style="display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:14px;cursor:pointer;">
      <input type="checkbox" style="width:20px;height:20px;flex:0 0 20px;" ${d.ccMe?'checked':''} onchange="expDraft.ccMe=this.checked"> CC me a copy${ME.email ? ` <span class="stub">(${escapeHtml(ME.email)})</span>` : ''}
    </label>
    <button class="darkbtn" style="width:85%;margin:0 auto;display:block;padding:12.75px;font-size:12.75px;" ${d.busy || !totalFiles ? 'disabled' : ''} onclick="expSave()">${d.busy ? (d.progress || 'Saving…') : (totalFiles ? `Save &amp; send ${totalFiles} receipt${totalFiles===1?'':'s'} (${totalFiles} email${totalFiles===1?'':'s'})` : 'Save &amp; send')}</button>
    <p class="sectiontitle" style="margin-top:22px;">Sent receipts</p>
    <p class="stub" style="margin:-4px 0 8px;">Kept for ${keepMonths} months, then deleted automatically.</p>
    ${recent.length ? recent.map(r=>{ const open = expRecentOpen.has(r.id); const nf = (r.file_paths||[]).length; return `
      <div class="sitecard" style="cursor:pointer;" onclick="expToggleRecent('${r.id}')">
        <div class="info">
          <div class="name">${escapeHtml(expRowLabel(r))}</div>
          <div class="addr">${new Date(r.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} · ${nf} file${nf===1?'':'s'} · ${r.emailed_at ? `<span style="color:var(--good,#1F9D62);font-weight:600;">✓ Emailed</span>` : `<span style="color:var(--warn);font-weight:700;">Not emailed yet</span>`}</div>
        </div>
        <div style="color:var(--slate);flex:0 0 auto;">${open?'▼':'▶'}</div>
      </div>
      ${open ? `
      <div class="card" style="margin:-4px 0 10px;">
        ${r.note ? `<p class="stub" style="margin:0 0 6px;">${escapeHtml(r.note)}</p>` : ''}
        ${isFullManager(ME) && r.created_by!==ME.id ? `<p class="stub" style="margin:0 0 6px;">Sent by ${escapeHtml(nameOf(r.created_by))}</p>` : ''}
        <p class="stub" style="margin:0 0 8px;">${r.emailed_at ? `<span style="color:var(--good,#1F9D62);font-weight:600;">✓ Emailed${r.emailed_to ? ' to '+escapeHtml(r.emailed_to) : ''}</span>` : `<span style="color:var(--warn);font-weight:700;">Not emailed yet</span>${r.created_by===ME.id ? ` · <span class="viewlink" style="cursor:pointer;" onclick="expResend('${r.batch_id}')">Send now</span>` : ''}`}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${(r.file_paths||[]).map((p,k)=>`<button class="ghostbtn" style="width:auto;padding:8px 12px;margin:0;" onclick="${/\.pdf$/i.test(p) ? `viewDrawing('${publicUrl('site-photos',p)}','${jsAttr((r.file_names||[])[k]||'receipt.pdf')}')` : `viewImage('${publicUrl('site-photos',p)}')`}">View ${k+1}</button>`).join('')}
          ${r.emailed_at && (r.created_by===ME.id || isFullManager(ME)) ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;margin:0;" onclick="expResendSent('${r.batch_id}','${r.id}',${nf})">✉️ Resend</button>` : ''}
          ${isFullManager(ME) ? `<button class="ghostbtn" style="width:auto;padding:8px 12px;margin:0;color:var(--warn);" onclick="expDelete('${r.id}')">🗑 Delete</button>` : ''}
        </div>
      </div>` : ''}`; }).join('') : `<div class="empty">Nothing sent in the last ${keepMonths} months.</div>`}
  `, {title:'Expenses', back:`#/site/${siteId}/materials`, siteId, activeTab:'materials'});
}
let expRecentOpen = new Set();
window.expToggleRecent = function(id){ if(expRecentOpen.has(id)) expRecentOpen.delete(id); else expRecentOpen.add(id); render(); };
function expEntry(key){ return expDraft ? expDraft.entries.find(e=>e.key===key) : null; }
window.expSetJob = function(key, v){ const e = expEntry(key); if(!e) return; e.job = v; if(v!=='manual' && v!=='fuel') e.manual = ''; render(); };
window.expField = function(key, f, v){ const e = expEntry(key); if(e) e[f] = v; };
window.expAddEntry = function(){ if(!expDraft) return; expDraft.entries.push(expNewEntry(null)); render(); };
window.expRemoveEntry = function(key){ if(!expDraft) return; expDraft.entries = expDraft.entries.filter(e=>e.key!==key); if(!expDraft.entries.length) expDraft.entries.push(expNewEntry(expDraft.siteId)); render(); };
window.expRemoveFile = function(key, i){ const e = expEntry(key); if(!e) return; e.files.splice(i,1); render(); };
window.expAddFiles = async function(key, input){
  const e = expEntry(key); const files = input.files ? Array.from(input.files) : [];
  if(!e || !files.length) return;
  for(const f of files){
    const isPdf = f.type==='application/pdf' || /\.pdf$/i.test(f.name||'');
    if(isPdf){
      if(f.size > 15*1024*1024){ toast((f.name||'That file')+' is over 15MB — too big to send.'); continue; }
      e.files.push({name:f.name||'receipt.pdf', file:f, isPdf:true, preview:null});
    } else {
      try{
        // Shrunk now so the upload at Save is quick; plenty sharp to read a receipt.
        const dataUrl = await compressImage(f, {maxW:1500, quality:0.8});
        let preview = dataUrl; try{ preview = await shrinkDataUrl(dataUrl, 160, 0.7); }catch(err){}
        e.files.push({name:f.name||'receipt.jpg', dataUrl, isPdf:false, preview});
      }catch(err){ /* compressImage has already said why */ }
    }
  }
  try{ input.value = ''; }catch(err){}
  render();
};
window.expSave = async function(){
  const d = expDraft; if(!d || d.busy) return;
  const entries = d.entries.filter(e=>e.files.length);
  if(!entries.length){ toast('Add at least one photo or file.'); return; }
  for(const e of entries){
    if(!e.job){ toast('Choose which job each set of receipts is for.'); return; }
    if(e.job==='manual' && !e.manual.trim()){ toast('Type the job name for the one that\'s not on the app.'); return; }
  }
  d.busy = true; d.progress = 'Uploading…'; render();
  const batchId = crypto.randomUUID();
  try{
    const rows = [];
    let done = 0; const total = entries.reduce((n,e)=>n+e.files.length, 0);
    for(const e of entries){
      const stored = await runPool(e.files, 3, async f=>{
        const path = 'expenses/'+ME.org_id+'/'+batchId+'/'+crypto.randomUUID()+(f.isPdf ? '.pdf' : '.jpg');
        const p = f.isPdf ? await uploadToStorage('site-photos', path, f.file, 'application/pdf') : await uploadDataUrl('site-photos', path, f.dataUrl);
        done++; d.progress = 'Uploading '+done+' of '+total+'…';
        const btn = document.querySelector('button[onclick="expSave()"]'); if(btn) btn.textContent = d.progress;
        return p ? {path:p, name:f.name} : null;
      });
      const ok = stored.filter(Boolean);
      if(ok.length < e.files.length) throw new Error('Some files did not upload — check your connection and try again.');
      const siteId = e.job.indexOf('site:')===0 ? e.job.slice(5) : null;
      rows.push({batch_id:batchId, site_id:siteId, manual_label: siteId ? null : (e.manual.trim() || null), category: e.job==='fuel' ? 'fuel' : (siteId ? 'materials' : 'other'), note: e.note.trim() || null, file_paths: ok.map(x=>x.path), file_names: ok.map(x=>x.name)});
    }
    const saved = await dbInsert('expenses', rows);
    if(!saved) throw new Error('Could not save — please try again.');
    d.progress = 'Sending email…'; const btn = document.querySelector('button[onclick="expSave()"]'); if(btn) btn.textContent = d.progress;
    const ccMe = d.ccMe;
    expDraft = {siteId:d.siteId, entries:[expNewEntry(d.siteId)], ccMe:false, busy:false, progress:''};
    await expSendBatch(batchId, ccMe, true);
  }catch(err){
    console.error('[expSave]', err);
    d.busy = false; d.progress = '';
    toast((err && err.message) || 'Could not save — please try again.');
  }
  render();
};
async function expSendBatch(batchId, ccMe, justSaved){
  try{
    const res = await sbFetch('/functions/v1/send-expenses-email', {method:'POST', timeoutMs:120000, body: JSON.stringify({batch_id: batchId, cc_me: !!ccMe})});
    let out = null; try{ out = await res.json(); }catch(e){}
    if(res.ok && out && out.ok){ const ne = out.emails || out.files || 0; customAlert('✓ '+(ne ? ne+' receipt'+(ne===1?'':'s')+' saved and emailed'+(ne>1 ? ' — one email each' : '') : 'Receipts saved and emailed')+(out.to ? ', to '+out.to : '')+(ccMe && ME.email ? ', with a copy to you' : '')+'.'); return true; }
    toast((justSaved ? 'Saved, but the email did not send — ' : 'Could not send — ')+((out && out.error) || res.status)+(justSaved ? ' Use "Send now" below.' : ''));
  }catch(e){
    toast((justSaved ? 'Saved, but the email did not send — ' : 'Could not send — ')+'check your connection.'+(justSaved ? ' Use "Send now" below.' : ''));
  }
  return false;
}
// Sends an entry that has already been emailed again (one email per receipt).
window.expResendSent = async function(batchId, expenseId, n){
  if(!await customConfirm(`Email ${n===1?'this receipt':'these '+n+' receipts'} to the office again?`)) return;
  toast('Sending…');
  try{
    const res = await sbFetch('/functions/v1/send-expenses-email', {method:'POST', timeoutMs:120000, body: JSON.stringify({batch_id: batchId, expense_id: expenseId, resend: true})});
    let out = null; try{ out = await res.json(); }catch(e){}
    if(res.ok && out && out.ok) customAlert('✓ Sent again'+(out.to ? ' to '+out.to : '')+(out.emails>1 ? ' — '+out.emails+' emails' : '')+'.');
    else toast('Could not send — '+((out && out.error) || res.status));
  }catch(e){ toast('Could not send — check your connection.'); }
  render();
};
window.expDelete = async function(id){
  if(!await customConfirm("Delete this expense entry? This removes it from the app only — any email already sent to the office stays sent. This can't be undone.")) return;
  const ok = await dbDelete('expenses', id);
  if(ok){ expRecentOpen.delete(id); toast('Expense deleted'); } else toast('Could not delete — only a Project Manager or Admin can.');
  render();
};
window.expResend = async function(batchId){ toast('Sending…'); await expSendBatch(batchId, false, false); render(); };
window.saveExpensesEmail = async function(){
  const el = document.getElementById('expensesEmailInput'); if(!el) return;
  const v = el.value.trim();
  if(v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){ toast('Enter a valid email address.'); return; }
  const rEl = document.getElementById('expensesRetentionInput');
  const months = rEl && [3,6,9,12].includes(Number(rEl.value)) ? Number(rEl.value) : 3;
  const row = await dbUpdate('organizations', ME.org_id, {expenses_email: v || null, expenses_retention_months: months});
  if(row){ if(ORG){ ORG.expenses_email = v || null; ORG.expenses_retention_months = months; } toast(v ? 'Expenses settings saved' : 'Saved — no expenses email set'); render(); }
  else toast('Could not save — only a Project Manager or Admin can change this.');
};