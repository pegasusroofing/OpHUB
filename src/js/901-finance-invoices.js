/* ================= OpHUB FINANCE — A1 Sales invoices =================
   Draft → Issue (takes the next invoice number, builds the branded PDF and
   keeps it in finance-docs) → Email (send-finance-email) → payments recorded
   until paid. Issued invoices are never edited; mistakes are voided. */
const FIN_INV_STATUS = {draft:'Draft', issued:'Issued', sent:'Sent', part_paid:'Part paid', paid:'Paid', void:'Void'};
function finToday(){ const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function finAddDays(iso, n){ const d = new Date(iso+'T12:00:00'); d.setDate(d.getDate()+(Number(n)||0)); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function finDate(iso){ return iso ? new Date(iso+(String(iso).length===10?'T12:00:00':'')).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) : '—'; }
function finRound(n){ return Math.round((Number(n)||0)*100)/100; }
function finInvOverdue(inv){ return ['issued','sent','part_paid'].includes(inv.status) && inv.due_date && inv.due_date < finToday(); }
function finInvOutstanding(inv){ return ['issued','sent','part_paid'].includes(inv.status) ? finRound(Number(inv.total||0) - Number(inv.paid||0)) : 0; }
function finInvPill(inv){
  if(finInvOverdue(inv)) return `<span class="finpill bad">Overdue</span>`;
  const cls = {draft:'grey', issued:'blue', sent:'blue', part_paid:'warn', paid:'ok', void:'grey'}[inv.status] || 'grey';
  return `<span class="finpill ${cls}">${FIN_INV_STATUS[inv.status]||inv.status}</span>`;
}
// Net / VAT / total for a set of lines.
function finInvTotals(lines, vatTreatment, vatRate){
  const net = finRound((lines||[]).reduce((t,l)=>t + (Number(l.amount)||0), 0));
  const rate = Number(vatRate||20);
  const vatDue = finRound(net*rate/100);
  const vat = vatTreatment==='standard' ? vatDue : 0;
  return {net, vat, total:finRound(net+vat), vatDue, rate};
}

/* ---------- list on the job's Finance page ---------- */
function finInvoicesCardHtml(siteId, invs){
  const live = invs.filter(i=>i.status!=='void');
  const invoiced = live.filter(i=>i.status!=='draft').reduce((t,i)=>t+Number(i.net||0), 0);
  const owed = live.reduce((t,i)=>t+finInvOutstanding(i), 0);
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <p class="sectiontitle" style="margin:0;">Invoices</p>
      <button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="newFinInvoice('${siteId}')">+ New invoice</button>
    </div>
    ${invs.length ? `<p class="stub" style="margin:4px 0 8px;font-style:normal;">Invoiced <b>${finMoney(invoiced)}</b> excl. VAT · Owed <b style="${owed?'color:var(--warn);':''}">${finMoney(owed)}</b></p>
      ${invs.map(i=>`<button type="button" class="pmrow finrow fininvrow" onclick="go('#/site/${siteId}/finance/invoice/${i.id}')">
        <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(i.number||'Draft invoice')} ${finInvPill(i)}</span>
          <span class="pmrow-s">${i.issue_date?finDate(i.issue_date):'Not issued'}${i.due_date && i.status!=='draft'?' · due '+finDate(i.due_date):''}${(i.lines||[])[0]&&(i.lines||[])[0].description?' · '+escapeHtml(String(i.lines[0].description).split('\n')[0].slice(0,50)):''}</span></span>
        <span class="finval">${finMoney(i.total)}</span>
      </button>`).join('')}`
    : `<div class="empty" style="margin:8px 0 0;">No invoices yet.</div>`}
  </div>`;
}

/* ---------- create a draft ---------- */
window.newFinInvoice = async function(siteId){
  const site = SITES.find(s=>s.id===siteId); if(!site) return;
  const [st, jfRows, pos] = await Promise.all([
    finLoadSettings(),
    dbSelect('job_finance', 'site_id=eq.'+siteId),
    dbSelect('client_pos', 'site_id=eq.'+siteId+'&order=is_primary.desc,created_at.asc&select=po_number'),
  ]);
  const jf = jfRows[0] || {};
  const today = finToday();
  const dueDays = jf.due_days!=null ? jf.due_days : st.default_due_days;
  const rows = await dbInsert('fin_invoices', {
    org_id:ME.org_id, site_id:siteId, status:'draft', issue_date:today, due_date:finAddDays(today, dueDays),
    client_po:(pos[0]||{}).po_number||null, bill_name:jf.billing_name||site.client_name||null, bill_address:jf.billing_address||null,
    bill_email:jf.billing_email||site.client_email||null, vat_treatment:jf.vat_treatment||st.default_vat||'standard',
    lines:[{description:'', amount:null}], created_by:ME.id, source:'manual',
  });
  if(rows && rows[0]) go(`#/site/${siteId}/finance/invoice/${rows[0].id}`);
};

/* ---------- invoice page ---------- */
let finInvDraft = null; // the draft being edited (kept outside render so typing isn't lost)
async function renderFinInvoice(siteId, invId){
  if(!finGuard()) return;
  if(!FIN_SETTINGS) await finLoadSettings();
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const [rows, pays, pos] = await Promise.all([
    dbSelect('fin_invoices', 'id=eq.'+invId),
    dbSelect('fin_payments', 'invoice_id=eq.'+invId+'&order=paid_on.asc'),
    dbSelect('client_pos', 'site_id=eq.'+siteId+'&order=is_primary.desc,created_at.asc&select=po_number'),
  ]);
  if(__gen !== RENDER_GEN) return;
  const inv = rows[0];
  if(!inv || !site){ toast('Invoice not found.'); go(`#/site/${siteId}/finance`); return; }
  if(inv.status==='draft') return renderFinInvoiceDraft(site, inv, pos);
  finInvDraft = null;
  const out = finInvOutstanding(inv);
  const t = finInvTotals(inv.lines, inv.vat_treatment, inv.vat_rate);
  document.getElementById('app').innerHTML = shell(`
    <div class="card finhead">
      <div><div class="finhead-l">Invoice</div><div class="finhead-v">${escapeHtml(inv.number||'—')}</div></div>
      <div><div class="finhead-l">Status</div><div class="finhead-v">${finInvPill(inv)}</div></div>
      <div><div class="finhead-l">Total</div><div class="finhead-v">${finMoney(inv.total)}</div></div>
      <div><div class="finhead-l">Outstanding</div><div class="finhead-v" style="${out>0?'color:var(--warn);':''}">${finMoney(out)}</div></div>
    </div>
    <div class="card">
      <div class="finkv"><span>Issued</span><b>${finDate(inv.issue_date)}</b></div>
      <div class="finkv"><span>Due</span><b>${finDate(inv.due_date)}</b></div>
      <div class="finkv"><span>Client PO</span><b>${escapeHtml(inv.client_po||'—')}</b></div>
      <div class="finkv"><span>Bill to</span><b>${escapeHtml(inv.bill_name||'—')}</b></div>
      <div class="finkv"><span>Sent</span><b>${inv.sent_at ? finDate(inv.sent_at.slice(0,10))+(inv.sent_to?' to '+escapeHtml(inv.sent_to):'') : 'Not emailed yet'}</b></div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Lines</p>
      ${(inv.lines||[]).map(l=>`<div class="finkv"><span style="white-space:pre-wrap;">${escapeHtml(l.description||'')}</span><b>${finMoney(l.amount)}</b></div>`).join('')}
      <div class="finkv fintot"><span>Net</span><b>${finMoney(inv.net)}</b></div>
      <div class="finkv fintot"><span>VAT ${inv.vat_treatment==='standard'?t.rate+'%':inv.vat_treatment==='reverse_charge'?'(reverse charge)':'(zero rated)'}</span><b>${finMoney(inv.vat)}</b></div>
      <div class="finkv fintot big"><span>Total</span><b>${finMoney(inv.total)}</b></div>
    </div>
    <div class="row-gap" style="flex-wrap:wrap;">
      <button class="darkbtn" style="flex:1;min-width:140px;" onclick="openFinInvoicePdf('${inv.id}')">View PDF</button>
      ${inv.status!=='void' ? `<button class="darkbtn" style="flex:1;min-width:140px;" onclick="openFinEmail('${siteId}','${inv.id}')">Email</button>` : ''}
    </div>
    ${typeof finXeroRowHtml==='function' ? finXeroRowHtml('invoice', inv) : ''}
    ${inv.status!=='void' ? `<div class="card" style="margin-top:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <p class="sectiontitle" style="margin:0;">Payments</p>
        ${out>0 ? `<button class="ghostbtn" style="padding:6px 12px;width:auto;flex:none;" onclick="openFinPayment('${inv.id}', ${out})">+ Record payment</button>` : ''}
      </div>
      ${pays.length ? pays.map(p=>`<div class="finkv"><span>${finDate(p.paid_on)}${p.note?' · '+escapeHtml(p.note):''}</span><b>${finMoney(p.amount)} <button class="linkbtn" onclick="deleteFinPayment('${p.id}')">remove</button></b></div>`).join('') : `<p class="stub" style="margin:6px 0 0;font-style:normal;">No payments recorded.</p>`}
    </div>
    <button class="ghostbtn" style="width:100%;margin-top:14px;color:var(--red);" onclick="voidFinInvoice('${inv.id}')">Void this invoice</button>
    <p class="stub" style="margin:6px 0 0;font-style:normal;">Issued invoices can’t be changed. To correct one, void it and raise a new one.</p>` : `<div class="empty">This invoice was voided.</div>`}
  `, {title:inv.number||'Invoice', subtitle:site.name, back:`#/site/${siteId}/finance`, siteId, tabs:false});
}

function renderFinInvoiceDraft(site, inv, pos){
  if(!finInvDraft || finInvDraft.id!==inv.id) finInvDraft = JSON.parse(JSON.stringify(inv));
  const d = finInvDraft;
  if(!Array.isArray(d.lines) || !d.lines.length) d.lines = [{description:'', amount:null}];
  const poOpts = pos.map(p=>p.po_number);
  if(d.client_po && !poOpts.includes(d.client_po)) poOpts.push(d.client_po);
  document.getElementById('app').innerHTML = shell(`
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Draft invoice</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">The invoice number is given when you issue it.</p>
      <div class="fingrid2">
        <div class="formfield"><label class="field-label">Invoice date</label><input type="date" id="finInvDate" value="${d.issue_date||''}" onchange="finInvDraft.issue_date=this.value"></div>
        <div class="formfield"><label class="field-label">Due date</label><input type="date" id="finInvDue" value="${d.due_date||''}" onchange="finInvDraft.due_date=this.value"></div>
      </div>
      <div class="formfield"><label class="field-label">Client PO</label>
        ${poOpts.length ? `<select id="finInvPo" onchange="finInvDraft.client_po=this.value||null">${poOpts.map(p=>`<option value="${escapeHtml(p)}" ${d.client_po===p?'selected':''}>${escapeHtml(p)}</option>`).join('')}<option value="" ${!d.client_po?'selected':''}>No PO</option></select>`
          : `<input type="text" id="finInvPo" value="${escapeHtml(d.client_po||'')}" placeholder="No client PO on this project yet" oninput="finInvDraft.client_po=this.value||null">`}
      </div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Bill to</p>
      <div class="formfield"><label class="field-label">Company</label><input type="text" id="finInvBillName" value="${escapeHtml(d.bill_name||'')}" oninput="finInvDraft.bill_name=this.value"></div>
      <div class="formfield"><label class="field-label">Address</label><textarea id="finInvBillAddr" rows="3" oninput="finInvDraft.bill_address=this.value">${escapeHtml(d.bill_address||'')}</textarea></div>
      <div class="formfield"><label class="field-label">Accounts email</label><input type="email" id="finInvBillEmail" value="${escapeHtml(d.bill_email||'')}" oninput="finInvDraft.bill_email=this.value"></div>
    </div>
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Lines</p>
      <div id="finInvLines">${d.lines.map((l,i)=>finInvLineHtml(l,i)).join('')}</div>
      <button class="ghostbtn" style="width:100%;margin-top:4px;" onclick="finInvAddLine()">+ Add line</button>
      <div class="formfield" style="margin-top:12px;"><label class="field-label">VAT</label><select id="finInvVat" onchange="finInvDraft.vat_treatment=this.value;finInvPaintTotals()">${Object.keys(FIN_VAT_LABEL).map(k=>`<option value="${k}" ${d.vat_treatment===k?'selected':''}>${FIN_VAT_LABEL[k]}</option>`).join('')}</select></div>
      <div id="finInvTotals"></div>
    </div>
    <div class="card">
      <div class="formfield" style="margin:0;"><label class="field-label">Note on the invoice (optional)</label><textarea id="finInvNotes" rows="2" oninput="finInvDraft.notes=this.value">${escapeHtml(d.notes||'')}</textarea></div>
    </div>
    <button class="darkbtn" style="width:100%;" id="finInvIssue" onclick="issueFinInvoice('${site.id}')">Issue invoice</button>
    <div class="row-gap" style="margin-top:10px;">
      <button class="ghostbtn" style="flex:1;" onclick="saveFinInvoiceDraft(true)">Save draft</button>
      <button class="ghostbtn" style="flex:1;color:var(--red);" onclick="deleteFinInvoiceDraft('${site.id}')">Delete draft</button>
    </div>
  `, {title:'New invoice', subtitle:site.name, back:`#/site/${site.id}/finance`, siteId:site.id, tabs:false});
  finInvPaintTotals();
}
function finInvLineHtml(l, i){
  return `<div class="finline">
    <textarea rows="2" placeholder="Description" oninput="finInvDraft.lines[${i}].description=this.value">${escapeHtml(l.description||'')}</textarea>
    <div class="finline-r">
      <input type="text" inputmode="decimal" data-money placeholder="£ amount" value="${l.amount!=null?escapeHtml(String(l.amount)):''}" oninput="finInvDraft.lines[${i}].amount=finNum(this.value);finInvPaintTotals()">
      ${finInvDraft.lines.length>1 ? `<button class="linkbtn" onclick="finInvRemoveLine(${i})">remove</button>` : ''}
    </div>
  </div>`;
}
window.finInvAddLine = function(){ finInvDraft.lines.push({description:'', amount:null}); document.getElementById('finInvLines').innerHTML = finInvDraft.lines.map((l,i)=>finInvLineHtml(l,i)).join(''); };
window.finInvRemoveLine = function(i){ finInvDraft.lines.splice(i,1); document.getElementById('finInvLines').innerHTML = finInvDraft.lines.map((l,j)=>finInvLineHtml(l,j)).join(''); finInvPaintTotals(); };
window.finInvPaintTotals = function(){
  const el = document.getElementById('finInvTotals'); if(!el || !finInvDraft) return;
  const t = finInvTotals(finInvDraft.lines.map(l=>({amount:isNaN(l.amount)?0:l.amount})), finInvDraft.vat_treatment, finInvDraft.vat_rate);
  el.innerHTML = `<div class="finkv fintot"><span>Net</span><b>${finMoney(t.net)}</b></div>
    <div class="finkv fintot"><span>VAT</span><b>${finMoney(t.vat)}</b></div>
    ${finInvDraft.vat_treatment==='reverse_charge' ? `<p class="stub" style="margin:2px 0 6px;font-style:normal;">Reverse charge: the client pays ${finMoney(t.vatDue)} VAT to HMRC. This is printed on the invoice.</p>` : ''}
    <div class="finkv fintot big"><span>Total</span><b>${finMoney(t.total)}</b></div>`;
};
function finInvDraftRow(){
  const d = finInvDraft;
  const lines = d.lines.map(l=>({description:String(l.description||'').trim(), amount:(l.amount===null||isNaN(l.amount))?null:finRound(l.amount)})).filter(l=>l.description || l.amount!==null);
  const t = finInvTotals(lines, d.vat_treatment, d.vat_rate);
  return {issue_date:d.issue_date||null, due_date:d.due_date||null, client_po:d.client_po||null, bill_name:d.bill_name||null, bill_address:d.bill_address||null,
    bill_email:(d.bill_email||'').trim()||null, vat_treatment:d.vat_treatment||'standard', lines, net:t.net, vat:t.vat, total:t.total, notes:d.notes||null, updated_at:new Date().toISOString()};
}
window.saveFinInvoiceDraft = async function(showToast){
  if(!finInvDraft) return null;
  const row = await dbUpdate('fin_invoices', finInvDraft.id, finInvDraftRow());
  if(row && showToast) toast('Draft saved');
  return row;
};
window.deleteFinInvoiceDraft = async function(siteId){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to delete'; return; }
  if(await dbDelete('fin_invoices', finInvDraft.id)){ finInvDraft = null; toast('Draft deleted'); go(`#/site/${siteId}/finance`); }
};
window.issueFinInvoice = async function(siteId){
  const row = finInvDraftRow();
  if(!row.lines.length){ toast('Add at least one line.'); return; }
  if(row.lines.some(l=>l.amount===null)){ toast('Every line needs an amount.'); return; }
  if(row.lines.some(l=>!l.description)){ toast('Every line needs a description.'); return; }
  if(!row.bill_name){ toast('Add who the invoice is to.'); return; }
  if(!row.issue_date || !row.due_date){ toast('Add the invoice date and due date.'); return; }
  if(row.bill_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.bill_email)){ toast('Enter a valid accounts email.'); return; }
  const btn = document.getElementById('finInvIssue'); const reset = ()=>{ if(btn){ btn.disabled=false; btn.textContent='Issue invoice'; } };
  if(btn){ btn.disabled = true; btn.textContent = 'Issuing…'; }
  const saved = await dbUpdate('fin_invoices', finInvDraft.id, row);
  if(!saved){ reset(); return; }
  const res = await sbFetch('/rest/v1/rpc/fin_take_invoice_number', {method:'POST', body:'{}'});
  if(!res.ok){ toast('Could not get an invoice number — '+(await safeErr(res))); reset(); return; }
  const number = await res.json();
  const issued = await dbUpdate('fin_invoices', finInvDraft.id, {number, status:'issued'});
  if(!issued){ reset(); return; }
  if(btn) btn.textContent = 'Making the PDF…';
  await finStoreInvoicePdf(issued);
  finInvDraft = null;
  toast('Invoice '+number+' issued');
  render();
  if(typeof finXeroAuto==='function') finXeroAuto('invoice', issued.id);
};
// Builds the PDF and keeps it with the invoice (finance-docs/<org>/<site>/invoices/...).
async function finStoreInvoicePdf(inv){
  const site = SITES.find(s=>s.id===inv.site_id);
  const bytes = await finBuildInvoicePdf(inv, site, await finLoadSettings());
  if(!bytes) return null;
  const path = ME.org_id+'/'+inv.site_id+'/invoices/'+String(inv.number||inv.id).replace(/[^a-z0-9\-]+/gi,'_')+'-'+Date.now()+'.pdf';
  const stored = await uploadToStorage('finance-docs', path, new Blob([bytes], {type:'application/pdf'}), 'application/pdf');
  if(!stored) return null;
  await dbUpdate('fin_invoices', inv.id, {pdf_path:stored});
  return stored;
}
function finInvFilename(inv, site){ return 'Invoice '+String(inv.number||'draft')+' - '+String((site&&site.name)||'').replace(/[\\/:*?"<>|]+/g,'')+'.pdf'; }
window.openFinInvoicePdf = async function(invId){
  let inv = (await dbSelect('fin_invoices', 'id=eq.'+invId))[0]; if(!inv) return;
  if(!inv.pdf_path){ const p = await finStoreInvoicePdf(inv); if(!p) return; inv.pdf_path = p; }
  const url = await resolveStorageUrl(publicUrl('finance-docs', inv.pdf_path));
  viewPdfInApp(url, finInvFilename(inv, SITES.find(s=>s.id===inv.site_id)));
};
window.voidFinInvoice = async function(invId){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='Tap again to void — this can’t be undone'; return; }
  const row = await dbUpdate('fin_invoices', invId, {status:'void', updated_at:new Date().toISOString()});
  if(row){ toast('Invoice voided'); render(); if(typeof finXeroVoid==='function') finXeroVoid(row); }
};

/* ---------- payments ---------- */
window.openFinPayment = function(invId, outstanding){
  let ov = document.getElementById('finPayOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPayOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>Record payment</h3>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Amount received (£)</label><input type="text" inputmode="decimal" data-money id="finPayAmt" value="${outstanding}"></div>
      <div class="formfield"><label class="field-label">Date received</label><input type="date" id="finPayDate" value="${finToday()}"></div>
    </div>
    <div class="formfield"><label class="field-label">Note (optional)</label><input type="text" id="finPayNote" placeholder="e.g. BACS, remittance ref"></div>
    <button class="darkbtn" style="width:100%;" onclick="saveFinPayment('${invId}')">Save payment</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finPayOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.saveFinPayment = async function(invId){
  const amt = finNum(finVal('finPayAmt'));
  if(amt===null || isNaN(amt) || amt<=0){ toast('Enter the amount received.'); return; }
  const rows = await dbInsert('fin_payments', {org_id:ME.org_id, invoice_id:invId, amount:finRound(amt), paid_on:finVal('finPayDate')||finToday(), note:finVal('finPayNote')||null, created_by:ME.id});
  if(!rows) return;
  document.getElementById('finPayOverlay').style.display = 'none';
  toast('Payment recorded'); render();
};
window.deleteFinPayment = async function(id){
  const btn = event && event.target;
  if(btn && btn.dataset.sure!=='1'){ btn.dataset.sure='1'; btn.textContent='tap again'; return; }
  if(await dbDelete('fin_payments', id)){ toast('Payment removed'); render(); }
};

/* ---------- email ---------- */
window.openFinEmail = async function(siteId, invId){
  const inv = (await dbSelect('fin_invoices', 'id=eq.'+invId))[0]; if(!inv) return;
  let ov = document.getElementById('finMailOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finMailOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>Email invoice ${escapeHtml(inv.number||'')}</h3>
    <div class="formfield"><label class="field-label">To</label><input type="text" id="finMailTo" value="${escapeHtml(inv.bill_email||'')}" placeholder="accounts@client.co.uk (use commas for more than one)"></div>
    <label class="finswitch"><input type="checkbox" id="finMailMe" checked> Send me a copy (${escapeHtml(ME.email||'')})</label>
    <div class="formfield"><label class="field-label">Message (optional)</label><textarea id="finMailMsg" rows="3" placeholder="Added under the invoice details"></textarea></div>
    <button class="darkbtn" style="width:100%;" id="finMailSend" onclick="sendFinEmail('${siteId}','${invId}')">Send</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finMailOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.sendFinEmail = async function(siteId, invId){
  const to = finVal('finMailTo').split(/[,;\s]+/).map(s=>s.trim()).filter(Boolean);
  if(!to.length || to.some(e=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))){ toast('Check the email address.'); return; }
  const btn = document.getElementById('finMailSend'); const reset = ()=>{ if(btn){ btn.disabled=false; btn.textContent='Send'; } };
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  let inv = (await dbSelect('fin_invoices', 'id=eq.'+invId))[0];
  if(!inv){ reset(); return; }
  if(!inv.pdf_path){ const p = await finStoreInvoicePdf(inv); if(!p){ reset(); return; } inv.pdf_path = p; }
  const site = SITES.find(s=>s.id===siteId);
  let res;
  try{
    res = await sbFetch('/functions/v1/send-finance-email', {method:'POST', timeoutMs:60000, body:JSON.stringify({
      kind:'invoice', site_id:siteId, storage_path:inv.pdf_path, filename:finInvFilename(inv, site), recipients:to,
      cc: document.getElementById('finMailMe').checked && ME.email ? [ME.email] : [],
      reference:inv.number, client_po:inv.client_po||'', amount:finMoney(inv.total), due:finDate(inv.due_date), message:finVal('finMailMsg'),
    })});
  }catch(e){ toast('Could not reach the server — check your connection.'); reset(); return; }
  const d = await res.json().catch(()=>({}));
  if(!res.ok || d.error){ toast('Email failed — '+String(d.error||res.status).slice(0,140)); reset(); return; }
  await dbUpdate('fin_invoices', invId, {sent_at:new Date().toISOString(), sent_to:to.join(', '), status: inv.status==='issued' ? 'sent' : inv.status});
  document.getElementById('finMailOverlay').style.display = 'none';
  toast('Invoice emailed'); render();
};

/* ---------- the PDF ---------- */
function finHexRgb(hex, fallback){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex||'').trim());
  if(!m) return fallback;
  const n = parseInt(m[1], 16);
  return PDFLib.rgb(((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255);
}
function finWrap(text, font, size, width){
  const out = [];
  String(text||'').split(/\r?\n/).forEach(para=>{
    const words = para.split(/\s+/); let cur = '';
    words.forEach(w=>{ const t = cur ? cur+' '+w : w; if(font.widthOfTextAtSize(t, size) > width && cur){ out.push(cur); cur = w; } else cur = t; });
    out.push(cur);
  });
  return out;
}
async function finBuildInvoicePdf(inv, site, st){
  if(!(await loadLib('PDFLib'))){ toast('Could not load the PDF tool — check your connection.'); return null; }
  try{
    const pdf = await PDFLib.PDFDocument.create();
    const reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
    const bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, M = 44;
    const INK = PDFLib.rgb(0.07,0.08,0.09), SLATE = PDFLib.rgb(0.36,0.39,0.45), LINE = PDFLib.rgb(0.86,0.88,0.9), WHITE = PDFLib.rgb(1,1,1);
    const BRAND = finHexRgb(ORG && ORG.color_primary, PDFLib.rgb(0.78,0.06,0.18));
    let page = pdf.addPage([W, H]);
    let logo = null;
    if(ORG && ORG.logo_path){
      try{ const b = await pdfFetchImageBytes(publicUrl('org-logos', ORG.logo_path)); if(b){ try{ logo = await pdf.embedPng(b); }catch(e){ logo = await pdf.embedJpg(b); } } }catch(e){}
    }
    const txt = (s, x, y, o)=> page.drawText(String(s==null?'':s), Object.assign({x, y, size:10, font:reg, color:INK}, o||{}));
    const right = (s, xr, y, o)=>{ const f = (o&&o.font)||reg, sz = (o&&o.size)||10; txt(s, xr - f.widthOfTextAtSize(String(s), sz), y, o); };
    // Header band
    page.drawRectangle({x:0, y:H-96, width:W, height:96, color:BRAND});
    let hx = M;
    if(logo){ const d = logo.scale(1), s = 52/Math.max(d.width, d.height); page.drawRectangle({x:M, y:H-76, width:56, height:56, color:WHITE}); page.drawImage(logo, {x:M+2+(52-d.width*s)/2, y:H-74+(52-d.height*s)/2, width:d.width*s, height:d.height*s}); hx = M+70; }
    txt((ORG&&ORG.name)||'', hx, H-48, {font:bold, size:16, color:WHITE});
    if(st.company_vat_no) txt('VAT No. '+st.company_vat_no, hx, H-64, {size:9, color:WHITE});
    right(inv.status==='void' ? 'VOID' : 'INVOICE', W-M, H-54, {font:bold, size:24, color:WHITE});
    // Bill to + details
    let y = H-130;
    txt('BILL TO', M, y, {font:bold, size:8.5, color:SLATE});
    let by = y-15;
    txt(inv.bill_name||'', M, by, {font:bold, size:11}); by -= 14;
    finWrap(inv.bill_address||'', reg, 10, 230).forEach(l=>{ txt(l, M, by); by -= 13; });
    const det = [['Invoice no.', inv.number||'Draft'], ['Invoice date', finDate(inv.issue_date)], ['Due date', finDate(inv.due_date)], ['Project no.', (site&&site.job_number)||'—'], ['Your PO', inv.client_po||'—'], ['Site', (site&&site.name)||'']];
    let dy = y;
    det.forEach(([k,v])=>{ txt(k, 330, dy, {size:9, color:SLATE}); const lines = finWrap(v, bold, 10, W-M-420); lines.forEach((l,i)=>{ txt(l, 420, dy-(i*12), {font:bold, size:10}); }); dy -= 15 + (lines.length-1)*12; });
    if(site && site.address){ finWrap(typeof fullSiteAddress==='function' ? fullSiteAddress(site) : site.address, reg, 9, W-M-420).slice(0,3).forEach(l=>{ txt(l, 420, dy+3, {size:9, color:SLATE}); dy -= 11; }); }
    y = Math.min(by, dy) - 22;
    // Lines table
    page.drawRectangle({x:M, y:y-6, width:W-2*M, height:22, color:PDFLib.rgb(0.95,0.96,0.97)});
    txt('DESCRIPTION', M+8, y+1, {font:bold, size:8.5, color:SLATE}); right('AMOUNT (£)', W-M-8, y+1, {font:bold, size:8.5, color:SLATE});
    y -= 26;
    for(const l of (inv.lines||[])){
      const lines = finWrap(l.description||'', reg, 10, W-2*M-130);
      if(y - lines.length*13 < 170){ page = pdf.addPage([W, H]); y = H-M; }
      lines.forEach((ln,i)=>{ txt(ln, M+8, y-i*13); });
      right(Number(l.amount||0).toLocaleString('en-GB',{minimumFractionDigits:2, maximumFractionDigits:2}), W-M-8, y);
      const last = y - (lines.length-1)*13;
      page.drawLine({start:{x:M, y:last-7}, end:{x:W-M, y:last-7}, thickness:0.6, color:LINE});
      y = last - 22;
    }
    // Totals
    y -= 8;
    const t = finInvTotals(inv.lines, inv.vat_treatment, inv.vat_rate);
    const tot = (k, v, big)=>{ txt(k, W-M-210, y, {font:big?bold:reg, size:big?12:10, color:big?INK:SLATE}); right(v, W-M-8, y, {font:bold, size:big?12:10}); y -= big?20:16; };
    tot('Net', finMoney(inv.net));
    tot(inv.vat_treatment==='standard' ? 'VAT @ '+t.rate+'%' : inv.vat_treatment==='reverse_charge' ? 'VAT (reverse charge)' : 'VAT (zero rated)', finMoney(inv.vat));
    page.drawLine({start:{x:W-M-210, y:y+10}, end:{x:W-M, y:y+10}, thickness:1, color:INK});
    y -= 4; tot('Total due', finMoney(inv.total), true);
    if(inv.vat_treatment==='reverse_charge'){
      y -= 4;
      finWrap('Reverse charge: customer to account to HMRC for the VAT. VAT at '+t.rate+'% on this supply: '+finMoney(t.vatDue)+'. (Domestic reverse charge for building and construction services.)', reg, 9, W-2*M).forEach(l=>{ txt(l, M, y, {size:9, color:SLATE}); y -= 12; });
    }
    if(inv.notes){ y -= 6; finWrap(inv.notes, reg, 10, W-2*M).forEach(l=>{ txt(l, M, y); y -= 13; }); }
    // Footer: payment details
    const fy = 120;
    page.drawLine({start:{x:M, y:fy+18}, end:{x:W-M, y:fy+18}, thickness:0.6, color:LINE});
    txt('PAYMENT DETAILS', M, fy, {font:bold, size:8.5, color:SLATE});
    const pay = [st.bank_account_name ? 'Account name: '+st.bank_account_name : '', st.bank_name ? 'Bank: '+st.bank_name : '', st.bank_sort_code ? 'Sort code: '+st.bank_sort_code : '', st.bank_account_no ? 'Account no.: '+st.bank_account_no : '', 'Reference: '+(inv.number||'')].filter(Boolean);
    let py = fy-14; pay.forEach(p=>{ txt(p, M, py, {size:9.5}); py -= 12; });
    let cy = fy-14;
    [st.company_address||'', st.company_reg_no ? 'Company no. '+st.company_reg_no : '', st.company_vat_no ? 'VAT no. '+st.company_vat_no : ''].filter(Boolean).forEach(s=>finWrap(s, reg, 9, 220).forEach(l=>{ txt(l, 330, cy, {size:9, color:SLATE}); cy -= 11; }));
    if(st.invoice_footer){ finWrap(st.invoice_footer, reg, 8.5, W-2*M).slice(0,3).forEach((l,i)=>txt(l, M, 40-i*10, {size:8.5, color:SLATE})); }
    const pages = pdf.getPages();
    pages.forEach((p,i)=>{ if(pages.length>1) p.drawText((i+1)+' of '+pages.length, {x:W-M-30, y:24, size:8, font:reg, color:SLATE}); });
    pdf.setTitle('Invoice '+(inv.number||''));
    return await pdf.save();
  }catch(e){ console.error(e); toast('Could not build the invoice PDF.'); return null; }
}
