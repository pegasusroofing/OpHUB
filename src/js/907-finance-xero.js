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
  const set = (id, v)=>{ const el = document.getElementById(id); if(el && v) el.value = v; };
  set('finBillName', c.name); set('finBillAddr', c.address); set('finBillEmail', c.email);
  const out = document.getElementById('finXeroContacts'); if(out) out.innerHTML = '<p class="stub" style="font-style:normal;color:var(--ok);">Filled in from Xero — tap Save.</p>';
};
function finXeroBillingHtml(){
  if(!finXeroConnected()) return '';
  return `<button type="button" class="ghostbtn" style="width:100%;margin:0 0 6px;" onclick="finXeroFindContact()">Find this client in Xero</button><div id="finXeroContacts"></div>`;
}
