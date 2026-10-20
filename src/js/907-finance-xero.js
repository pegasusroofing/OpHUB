/* ============================================================
   OpHUB Finance — Xero link (phase E)
   Everything goes through the "xero" edge function, which holds the Xero
   tokens (the app never sees them). Finance users only.
     • Settings: connect / disconnect, account codes, job tracking category,
       "send automatically" switch, check for payments.
     • Sales invoices → Xero (ACCREC) with the PDF attached and job tracking.
     • Approved supplier invoices → Xero bills (ACCPAY) with the invoice attached.
     • Subcontractor (CIS) payments → Xero bills.
     • Payments made in Xero come back onto OpHUB invoices.
     • Billing details: find the client in Xero; anything missing in Xero
       is filled in from OpHUB when an invoice is sent.
   ============================================================ */
const FIN_XERO_KIND = {invoice:'push_invoice', bill:'push_bill', sub:'push_sub_payment'};
let finXeroPulled = false;

async function finXeroCall(action, extra, timeoutMs){
  let res;
  try{
    res = await sbFetch('/functions/v1/xero', {method:'POST', timeoutMs:timeoutMs||45000, body:JSON.stringify(Object.assign({action}, extra||{}))});
  }catch(e){ return {error:'Could not reach the server'}; }
  let j = {};
  try{ j = await res.json(); }catch(e){}
  if(!res.ok && !j.error) j.error = 'Error '+res.status;
  return j;
}
function finXeroConnected(){ return !!(FIN_SETTINGS && FIN_SETTINGS.xero_tenant_name); }

/* ---------- Settings card ---------- */
function finXeroSettingsHtml(st){
  const on = !!st.xero_tenant_name;
  return `<div class="card" id="finXeroCard">
    <p class="sectiontitle" style="margin-top:0;">Xero</p>
    ${on ? `<div class="finkv"><span>Connected to</span><b style="color:var(--ok);">✓ ${escapeHtml(st.xero_tenant_name)}</b></div>
      ${st.xero_connected_at ? `<div class="finkv"><span>Since</span><b>${finDate(String(st.xero_connected_at).slice(0,10))}</b></div>` : ''}
      <div class="fingrid2" style="margin-top:10px;">
        <div class="formfield"><label class="field-label">Sales account (invoices)</label><input type="text" id="finXSales" list="finXAccts" value="${escapeHtml(st.xero_sales_account||'200')}"></div>
        <div class="formfield"><label class="field-label">Materials account (bills)</label><input type="text" id="finXPurch" list="finXAccts" value="${escapeHtml(st.xero_purchase_account||'310')}"></div>
        <div class="formfield"><label class="field-label">Subcontract labour account</label><input type="text" id="finXLabour" list="finXAccts" value="${escapeHtml(st.xero_labour_account||'320')}"></div>
        <div class="formfield"><label class="field-label">Xero tracking category</label><input type="text" id="finXTrack" list="finXTracks" value="${escapeHtml(st.xero_tracking_name||'Project')}"></div>
      </div>
      <datalist id="finXAccts"></datalist><datalist id="finXTracks"></datalist>
      <div id="finXAcctsMsg" class="stub" style="margin:0 0 8px;font-style:normal;">Account codes are the numbers in your Xero chart of accounts. <button class="linkbtn" style="color:var(--blue);" onclick="finXeroLoadAccounts()">Load them from Xero</button></div>
      <label class="finswitch" style="display:flex;gap:8px;align-items:flex-start;margin:6px 0 10px;"><input type="checkbox" id="finXAuto" ${st.xero_auto?'checked':''} style="margin-top:3px;"><span>Send to Xero automatically — invoices when issued, supplier invoices when approved. Otherwise use the “Send to Xero” button on each one.</span></label>
      <button class="darkbtn" style="width:100%;" onclick="finXeroSaveSettings()">Save Xero settings</button>
      <div class="row-gap" style="margin-top:8px;">
        <button class="ghostbtn" style="flex:1;" onclick="finXeroPullPayments(true)">Check Xero for payments</button>
        <button class="ghostbtn" style="flex:1;color:var(--red);" onclick="finXeroDisconnect()">Disconnect</button>
      </div>
      <p class="stub" style="margin:8px 0 0;font-style:normal;">Projects go into Xero under a tracking category (default “Project”) — create it once in Xero (Settings › Tracking categories) and OpHUB adds each project to it. CIS: set each subcontractor up as a CIS subcontractor in Xero so Xero works out the deduction on their bill.</p>`
    : `<p class="stub" style="margin:0 0 10px;font-style:normal;">Connect your Xero company so invoices, supplier bills and subcontractor payments go across, and payments come back. Nothing is sent until you connect.</p>
      <button class="darkbtn" style="width:100%;" id="finXConnect" onclick="finXeroConnect()">Connect to Xero</button>
      <div id="finXeroMsg"></div>`}
  </div>`;
}
window.finXeroConnect = async function(){
  const btn = document.getElementById('finXConnect');
  if(btn){ btn.disabled = true; btn.textContent = 'Opening Xero…'; }
  // open the tab straight away (pop-up blockers only allow it inside the tap)
  const win = window.open('', '_blank');
  const j = await finXeroCall('connect');
  if(btn){ btn.disabled = false; btn.textContent = 'Connect to Xero'; }
  if(j.error === 'not_configured'){
    if(win) win.close();
    const m = document.getElementById('finXeroMsg');
    if(m) m.innerHTML = `<div class="card" style="margin:10px 0 0;border-color:var(--warn);background:var(--warn-bg);"><b style="color:var(--warn);">One-off setup needed first</b>
      <ol style="margin:6px 0 0 18px;padding:0;font-size:13px;line-height:1.5;">
        <li>Go to developer.xero.com › My Apps › New app (Web app).</li>
        <li>Redirect URI: <code style="word-break:break-all;">${escapeHtml(SUPABASE_URL)}/functions/v1/xero</code></li>
        <li>Copy the Client ID and make a Client secret.</li>
        <li>Add them in Supabase › Edge Functions › Secrets as <b>XERO_CLIENT_ID</b> and <b>XERO_CLIENT_SECRET</b>.</li>
        <li>Come back here and tap Connect. Try it on Xero’s Demo Company first.</li>
      </ol></div>`;
    return;
  }
  if(j.error || !j.url){ if(win) win.close(); toast('Could not start — '+(j.error||'no link')); return; }
  if(win) win.location.href = j.url; else location.href = j.url;
  toast('Allow access in Xero, then come back here');
  // check every few seconds for up to 3 minutes
  let tries = 0;
  const t = setInterval(async ()=>{
    tries++;
    if(tries > 36 || !location.hash.startsWith('#/finance/settings')){ clearInterval(t); return; }
    const s = await finXeroCall('status');
    if(s.connected){ clearInterval(t); toast('Connected to '+s.tenant_name); render(); }
  }, 5000);
};
window.finXeroDisconnect = async function(){
  if(!confirm('Disconnect OpHUB from Xero? Nothing already in Xero is changed.')) return;
  const j = await finXeroCall('disconnect');
  if(j.error){ toast(j.error); return; }
  toast('Disconnected from Xero'); render();
};
window.finXeroLoadAccounts = async function(){
  const m = document.getElementById('finXAcctsMsg'); if(m) m.textContent = 'Loading from Xero…';
  const j = await finXeroCall('accounts');
  if(j.error){ if(m) m.textContent = 'Could not load — '+j.error; return; }
  const dl = document.getElementById('finXAccts');
  if(dl) dl.innerHTML = (j.accounts||[]).map(a=>`<option value="${escapeHtml(a.code)}">${escapeHtml(a.code+' — '+a.name)}</option>`).join('');
  const dt = document.getElementById('finXTracks');
  if(dt) dt.innerHTML = (j.tracking||[]).map(n=>`<option value="${escapeHtml(n)}"></option>`).join('');
  if(m) m.textContent = (j.accounts||[]).length+' accounts loaded — tap a box to pick one.'+((j.tracking||[]).length ? '' : ' No tracking categories in Xero yet.');
};
window.finXeroSaveSettings = async function(){
  const row = {org_id:ME.org_id, xero_sales_account:finVal('finXSales')||'200', xero_purchase_account:finVal('finXPurch')||'310',
    xero_labour_account:finVal('finXLabour')||'320', xero_tracking_name:finVal('finXTrack')||'Project',
    xero_auto:!!(document.getElementById('finXAuto')||{}).checked, updated_at:new Date().toISOString(), updated_by:ME.id};
  const res = await sbFetch('/rest/v1/fin_settings', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(row)});
  if(!res.ok){ toast('Could not save — '+(await safeErr(res))); return; }
  await finLoadSettings();
  toast('Xero settings saved');
};

/* ---------- Send to Xero ---------- */
// Status line + button shown on an invoice, supplier invoice or sub payment.
function finXeroRowHtml(kind, rec){
  if(!finXeroConnected() || !rec) return '';
  const can = kind==='invoice' ? rec.status!=='draft' && rec.status!=='void'
    : kind==='bill' ? rec.status==='approved'
    : ['approved','paid'].includes(rec.status);
  if(!can && !rec.xero_id) return '';
  return `<div class="finxero" id="finXero-${rec.id}">
    ${rec.xero_id ? `<span class="ok">✓ In Xero${rec.xero_synced_at?' · '+finDate(String(rec.xero_synced_at).slice(0,10)):''}</span>` : `<span>Not in Xero yet</span>`}
    ${can ? `<button class="ghostbtn" onclick="finXeroPush('${kind}','${rec.id}')">${rec.xero_id?'Update in Xero':'Send to Xero'}</button>` : ''}
    ${rec.xero_error ? `<div class="err">Last try: ${escapeHtml(rec.xero_error)}</div>` : ''}
  </div>`;
}
window.finXeroPush = async function(kind, id, quiet){
  const box = document.getElementById('finXero-'+id);
  const btn = box && box.querySelector('button');
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }
  const j = await finXeroCall(FIN_XERO_KIND[kind], {id});
  if(j.error){
    toast('Xero: '+j.error);
    if(btn){ btn.disabled = false; btn.textContent = 'Try again'; }
    return false;
  }
  if(!quiet || j.warning) toast(j.warning ? 'Sent to Xero — '+j.warning : 'Sent to Xero');
  if(!quiet) render();
  return true;
};
// Called after issuing an invoice / approving a supplier invoice.
async function finXeroAuto(kind, id){
  if(!finXeroConnected() || !FIN_SETTINGS.xero_auto) return;
  const ok = await finXeroPush(kind, id, true);
  if(ok) toast('Also sent to Xero');
}
// A voided invoice that is already in Xero gets voided there too.
async function finXeroVoid(inv){
  if(!finXeroConnected() || !inv || !inv.xero_id) return;
  const j = await finXeroCall('push_invoice', {id:inv.id});
  toast(j.error ? 'Voided here — void it in Xero by hand ('+j.error+')' : 'Also voided in Xero');
}

/* ---------- Payments back from Xero ---------- */
window.finXeroPullPayments = async function(loud){
  if(!finXeroConnected()) return;
  finXeroPulled = true;
  const j = await finXeroCall('pull_payments', {}, 60000);
  if(j.error){ if(loud) toast('Xero: '+j.error); return; }
  if(j.added){ toast(j.added+' payment'+(j.added===1?'':'s')+' from Xero added ('+finMoney(j.amount)+')'); if(location.hash.startsWith('#/finance') || location.hash.includes('/finance')) render(); }
  else if(loud) toast('Up to date — checked '+j.checked+' invoice'+(j.checked===1?'':'s'));
};
// Once per app session, quietly, when the Finance page opens.
function finXeroMaybePull(){ if(!finXeroPulled && finXeroConnected()) finXeroPullPayments(false); }

/* ---------- Billing details from Xero ---------- */
window.finXeroFindContact = async function(){
  const name = finVal('finBillName');
  if(!name){ toast('Type the client name first'); return; }
  const out = document.getElementById('finXeroContacts'); if(out) out.innerHTML = '<p class="stub" style="font-style:normal;">Searching Xero…</p>';
  const j = await finXeroCall('contact', {name});
  if(!out) return;
  if(j.error){ out.innerHTML = `<p class="stub" style="font-style:normal;color:var(--red);">${escapeHtml(j.error)}</p>`; return; }
  const list = j.contacts||[];
  window.__finXeroContacts = list;
  out.innerHTML = list.length ? list.map((c,i)=>`<button type="button" class="pmrow pmrow-card" style="margin:4px 0;" onclick="finXeroUseContact(${i})"><span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(c.name)}</span><span class="pmrow-s">${escapeHtml([c.email, c.address.replace(/\n/g, ', ')].filter(Boolean).join(' · ')||'No email or address in Xero')}</span></span></button>`).join('')
    : `<p class="stub" style="font-style:normal;">Not found in Xero — it will be added when the first invoice is sent.</p>`;
};
window.finXeroUseContact = function(i){
  const c = (window.__finXeroContacts||[])[i]; if(!c) return;
  const set = (id, v)=>{ const el = document.getElementById(id); if(el) el.value = v || ''; };
  set('finBillName', c.name); set('finBillAddr', c.address); set('finBillEmail', c.email);
  const q = document.getElementById('finCustQ'); if(q) q.value = '';
  const out = document.getElementById('finXeroContacts'); if(out) out.innerHTML = `<p class="stub" style="font-style:normal;color:var(--ok);margin:6px 0;">✓ ${escapeHtml(c.name)} filled in below — tap Save.</p>`;
};
function finXeroBillingHtml(){
  const x = finXeroConnected();
  return `<div class="fincust">
    <div class="fincust-row">
      <input type="search" id="finCustQ" placeholder="${x ? 'Search your Xero customers…' : 'Search customers…'}" autocomplete="off" oninput="finCustSearchSoon(this.value)">
      <button type="button" class="ghostbtn" onclick="openFinNewCustomer()">+ New customer</button>
    </div>
    <div id="finXeroContacts"></div>
    ${x ? '' : '<p class="stub" style="margin:4px 0 0;font-style:normal;font-size:12.5px;">Xero isn’t connected yet, so this searches customers already on your projects. Connect Xero in Finance › Settings to search Xero too.</p>'}
  </div>`;
}
/* Search: Xero customers (when connected) + billing details already used on other projects. */
let finCustTimer = null, finCustLocal = null;
window.finCustSearchSoon = function(q){ clearTimeout(finCustTimer); finCustTimer = setTimeout(()=>finCustSearch(q), 350); };
async function finCustSearch(q){
  q = String(q||'').trim();
  const out = document.getElementById('finXeroContacts'); if(!out) return;
  if(q.length < 2){ out.innerHTML = ''; return; }
  out.innerHTML = '<p class="stub" style="font-style:normal;margin:6px 0;">Searching…</p>';
  if(!finCustLocal){ const rows = await dbSelect('job_finance', 'org_id=eq.'+ME.org_id+'&billing_name=not.is.null&select=billing_name,billing_address,billing_email,updated_at&order=updated_at.desc&limit=2000'); const seen = {}; finCustLocal = []; rows.forEach(r=>{ const k = String(r.billing_name).trim().toLowerCase(); if(k && !seen[k]){ seen[k] = 1; finCustLocal.push({name:r.billing_name, address:r.billing_address||'', email:r.billing_email||'', src:'local'}); } }); }
  const ql = q.toLowerCase();
  const local = finCustLocal.filter(c=>c.name.toLowerCase().includes(ql)).slice(0, 6);
  let xero = [], err = '';
  if(finXeroConnected()){ const j = await finXeroCall('contact', {name:q}); if(j.error) err = j.error; else xero = (j.contacts||[]).map(c=>Object.assign({src:'xero'}, c)); }
  const cur = document.getElementById('finCustQ'); if(!cur || cur.value.trim()!==q) return; // a newer search is running
  const xn = new Set(xero.map(c=>c.name.toLowerCase()));
  const list = xero.concat(local.filter(c=>!xn.has(c.name.toLowerCase())));
  window.__finXeroContacts = list;
  out.innerHTML = (err ? `<p class="stub" style="font-style:normal;color:var(--red);margin:6px 0;">Xero: ${escapeHtml(err)}</p>` : '')
    + (list.length ? `<div class="fincust-list">${list.map((c,i)=>`<button type="button" class="pmrow" onclick="finXeroUseContact(${i})"><span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(c.name)} <span class="fincust-src ${c.src}">${c.src==='xero'?'Xero':'Used before'}</span></span><span class="pmrow-s">${escapeHtml([c.email, String(c.address||'').replace(/\n/g, ', ')].filter(Boolean).join(' · ')||'No email or address')}</span></span></button>`).join('')}</div>`
      : `<p class="stub" style="font-style:normal;margin:6px 0;">No customer called “${escapeHtml(q)}”. <button type="button" class="linkbtn" onclick="openFinNewCustomer('${jsAttr(q)}')">Add them as a new customer</button></p>`);
}
/* New customer: added to Xero straight away when it's connected, and filled into the billing boxes. */
window.openFinNewCustomer = function(name){
  let ov = document.getElementById('finCustOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finCustOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const x = finXeroConnected();
  ov.innerHTML = `<div class="geo-modal-card" style="max-width:520px;">
    <h3>New customer</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">${x ? 'Added to Xero as a customer and used for this project’s invoices.' : 'Used for this project’s invoices. It’s added to Xero when Xero is connected and the first invoice is sent.'}</p>
    <div class="formfield"><label class="field-label">Company name</label><input type="text" id="finNcName" value="${escapeHtml(name||'')}"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Contact first name</label><input type="text" id="finNcFirst"></div>
      <div class="formfield"><label class="field-label">Contact last name</label><input type="text" id="finNcLast"></div>
      <div class="formfield"><label class="field-label">Accounts email</label><input type="email" id="finNcEmail"></div>
      <div class="formfield"><label class="field-label">Phone</label><input type="tel" id="finNcPhone"></div>
    </div>
    <div class="formfield"><label class="field-label">Address line 1</label><input type="text" id="finNcL1"></div>
    <div class="formfield"><label class="field-label">Address line 2</label><input type="text" id="finNcL2"></div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Town / city</label><input type="text" id="finNcCity"></div>
      <div class="formfield"><label class="field-label">Postcode</label><input type="text" id="finNcPc"></div>
    </div>
    <button class="darkbtn" style="width:100%;" id="finNcSave" onclick="saveFinNewCustomer()">${x ? 'Add to Xero' : 'Use this customer'}</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finCustOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
  setTimeout(()=>{ const el = document.getElementById(name ? 'finNcEmail' : 'finNcName'); if(el) el.focus(); }, 50);
};
window.saveFinNewCustomer = async function(){
  const v = id=>finVal(id);
  const name = v('finNcName'), email = v('finNcEmail');
  if(!name){ toast('Enter the company name.'); return; }
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Check the email address.'); return; }
  const address = [v('finNcL1'), v('finNcL2'), v('finNcCity'), v('finNcPc')].filter(Boolean).join('\n');
  let c = {name, email, address};
  if(finXeroConnected()){
    const btn = document.getElementById('finNcSave'); if(btn){ btn.disabled = true; btn.textContent = 'Adding to Xero…'; }
    const j = await finXeroCall('create_contact', {name, email, phone:v('finNcPhone'), first_name:v('finNcFirst'), last_name:v('finNcLast'), line1:v('finNcL1'), line2:v('finNcL2'), city:v('finNcCity'), postcode:v('finNcPc')});
    if(btn){ btn.disabled = false; btn.textContent = 'Add to Xero'; }
    if(j.error){ toast('Xero: '+j.error); return; }
    if(j.contact) c = {name:j.contact.name, email:j.contact.email || email, address:j.contact.address || address};
    toast(j.existed ? 'Already in Xero — using their details' : 'Added to Xero');
  }
  window.__finXeroContacts = [c]; finXeroUseContact(0);
  finCustLocal = null;
  document.getElementById('finCustOverlay').style.display = 'none';
};
