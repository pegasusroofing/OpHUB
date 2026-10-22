/* ============================================================
   OpHUB Finance — new job tidy-up (22 Oct 2026, Andy testing the sandbox).
   1. Client boxes suggest clients from the Directory as you type
      (any <input data-finclient>). Typing a new name adds it to the
      Directory when the job is saved.
   2. Date boxes open the calendar wherever you click on them, not just
      on the little calendar icon (whole app).
   3. A "Getting started" card on a new job's Finance overview.
   4. Delete a job from its Finance Set-up tab — only while nothing
      financial has been booked to it; otherwise it can be closed.
   ============================================================ */
let FIN_CLIENTS = null; // [{id,name,email,address,postcode,sales_vat}] for this company
async function finClientsLoad(force){
  if(FIN_CLIENTS && !force) return FIN_CLIENTS;
  FIN_CLIENTS = await dbSelect('fin_clients', 'org_id=eq.'+ME.org_id+'&order=name.asc&select=id,name,email,address,postcode,sales_vat').catch(()=>[]) || [];
  return FIN_CLIENTS;
}
function finClientByName(name){
  const n = String(name||'').trim().toLowerCase(); if(!n || !FIN_CLIENTS) return null;
  return FIN_CLIENTS.find(c=>String(c.name||'').trim().toLowerCase()===n) || null;
}
function finClientAddr(c){ return c ? [c.address, c.postcode].filter(Boolean).join('\n') : ''; }
// Directory sales VAT -> the job's VAT treatment.
function finClientVatTreatment(c){
  const v = c && c.sales_vat; if(!v) return null;
  if(/^rc/.test(v)) return 'reverse_charge';
  if(v==='0' || v==='ex' || v==='none') return 'zero';
  return 'standard';
}

/* ---- 1. client suggestions ---- */
(function(){
  if(!document.getElementById('finSugCss')){
    const st = document.createElement('style'); st.id = 'finSugCss';
    st.textContent = `.finsug{position:absolute;z-index:10060;background:#fff;border:1px solid #E1E4EA;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);max-height:240px;overflow:auto;padding:4px;}
.finsug button{all:unset;box-sizing:border-box;display:block;width:100%;cursor:pointer;padding:8px 10px;border-radius:7px;font-size:14px;}
.finsug button small{display:block;color:#8A8F98;font-size:11.5px;margin-top:1px;}
.finsug button:hover,.finsug button.on{background:#F2F4F7;}
.finsug .finsug-new{color:#5A5E66;font-size:12.5px;padding:7px 10px;}`;
    document.head.appendChild(st);
  }
  let box = null, input = null, hits = [], idx = -1;
  const close = ()=>{ if(box){ box.remove(); box = null; } hits = []; idx = -1; };
  const place = ()=>{ if(!box || !input) return; const r = input.getBoundingClientRect(); box.style.left = (r.left + window.scrollX)+'px'; box.style.top = (r.bottom + window.scrollY + 4)+'px'; box.style.width = r.width+'px'; };
  const pick = c=>{ if(!input) return; input.value = c.name; input.dispatchEvent(new Event('change', {bubbles:true})); close(); };
  const paint = ()=>{
    const q = String(input.value||'').trim().toLowerCase();
    hits = (FIN_CLIENTS||[]).filter(c=>!q || String(c.name||'').toLowerCase().includes(q)).slice(0, 8);
    const exact = !!finClientByName(input.value);
    if(!hits.length && !q){ close(); return; }
    if(!box){ box = document.createElement('div'); box.className = 'finsug'; document.body.appendChild(box); }
    box.innerHTML = hits.map((c,i)=>`<button type="button" data-i="${i}" class="${i===idx?'on':''}">${escapeHtml(c.name)}${c.email||c.postcode?`<small>${escapeHtml([c.email, c.postcode].filter(Boolean).join(' · '))}</small>`:''}</button>`).join('')
      + (q && !exact ? `<div class="finsug-new">${hits.length ? '' : 'Not in the Directory — '}“${escapeHtml(input.value.trim())}” will be added to the Directory as a new client.</div>` : '');
    box.querySelectorAll('button').forEach(b=>b.addEventListener('mousedown', e=>{ e.preventDefault(); pick(hits[Number(b.dataset.i)]); }));
    place();
  };
  document.addEventListener('focusin', async e=>{
    const el = e.target; if(!(el instanceof HTMLInputElement) || !el.hasAttribute('data-finclient')) return;
    input = el; el.setAttribute('autocomplete', 'off');
    await finClientsLoad(); if(document.activeElement===el) paint();
  });
  document.addEventListener('input', e=>{ if(e.target===input && input.hasAttribute('data-finclient')){ idx = -1; paint(); } });
  document.addEventListener('keydown', e=>{
    if(!box || e.target!==input) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); idx = Math.min(hits.length-1, idx+1); paint(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); idx = Math.max(-1, idx-1); paint(); }
    else if(e.key==='Enter' && idx>=0 && hits[idx]){ e.preventDefault(); pick(hits[idx]); }
    else if(e.key==='Escape'){ close(); }
  });
  document.addEventListener('focusout', e=>{ if(e.target===input) setTimeout(close, 120); });
  window.addEventListener('resize', place); document.addEventListener('scroll', place, true);
})();
// New client typed on a job -> add it to the Directory (name only; details filled in there).
async function finClientEnsure(name){
  name = String(name||'').trim(); if(!name) return null;
  await finClientsLoad();
  let c = finClientByName(name); if(c) return c;
  const ins = await dbInsert('fin_clients', {org_id:ME.org_id, name, created_by:ME.id});
  c = ins && ins[0]; if(c){ FIN_CLIENTS.push(c); FIN_CLIENTS.sort((a,b)=>String(a.name).localeCompare(String(b.name))); }
  return c;
}

/* ---- 2. date boxes: click anywhere to open the calendar (whole app) ---- */
document.addEventListener('click', e=>{
  const el = e.target;
  if(!(el instanceof HTMLInputElement) || el.disabled || el.readOnly) return;
  if(!/^(date|month|week|time|datetime-local)$/.test(el.type)) return;
  try{ if(typeof el.showPicker==='function') el.showPicker(); }catch(err){ /* some browsers refuse; the icon still works */ }
});

/* ---- 3. getting started on a new job ---- */
function finStartCardHtml(siteId, bt, n){
  // n = counts {items, pos, invs, apps}
  if(n.invs || n.apps) return '';
  const step = (done, t, sub, btn)=>`<div class="finstart-step ${done?'done':''}"><span class="finstart-tick">${done?'✓':''}</span><div style="flex:1;min-width:0;"><b>${t}</b><div class="stub" style="margin:2px 0 0;font-style:normal;">${sub}</div></div>${done?'':btn}</div>`;
  const b = (label, js)=>`<button type="button" class="ghostbtn" style="width:auto;flex:none;padding:6px 12px;margin:0;" onclick="${js}">${label}</button>`;
  const steps = bt==='application' ? [
    step(n.items>0, 'Set up the Bill of Quantities', 'The items you’ll value each month. The contract value adds up from these.', b('Open Bill of Quantities', `finProjTabGo('${siteId}','boq')`)),
    step(n.pos>0, 'Add the client’s PO', 'It goes on every application and invoice.', b('Add PO', `openClientPoForm('${siteId}')`)),
    step(false, 'Check retention, VAT and application dates', 'Set from your Finance settings — change them for this job if needed.', b('Project Admin', `finProjTabGo('${siteId}','setup')`)),
    step(false, 'Make the first application', 'When you’re ready to value the work.', b('New application', `newFinApplication('${siteId}')`)),
  ] : [
    step(false, 'Check the contract value, VAT and payment terms', 'Set from your Finance settings — change them for this job if needed.', b('Project Admin', `finProjTabGo('${siteId}','setup')`)),
    step(n.pos>0, 'Add the client’s PO', 'It goes on every invoice.', b('Add PO', `openClientPoForm('${siteId}')`)),
    step(false, 'Raise the first invoice', 'When you’re ready to bill.', b('New invoice', `newFinInvoice('${siteId}')`)),
  ];
  return `<div class="card finstart"><p class="sectiontitle" style="margin-top:0;">Getting started</p>${steps.join('')}</div>`;
}
(function(){
  if(document.getElementById('finStartCss')) return;
  const st = document.createElement('style'); st.id = 'finStartCss';
  st.textContent = `.finstart-step{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #F0F1F4;}
.finstart-step:first-of-type{border-top:0;}
.finstart-tick{width:22px;height:22px;flex:none;border-radius:50%;border:2px solid #D5D9E0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;}
.finstart-step.done .finstart-tick{background:#2E9E5B;border-color:#2E9E5B;}
.finstart-step.done b{text-decoration:line-through;color:#8A8F98;}
.finbillsum{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
.finbillsum .stub{font-style:normal;margin:2px 0 0;white-space:pre-line;}`;
  document.head.appendChild(st);
})();

/* ---- Billing summary from the Directory (replaces the big Billing form) ---- */
function finBillingSummaryHtml(siteId, site, jf){
  const name = site.client_name || jf.billing_name || '';
  const c = finClientByName(name);
  const addr = c ? finClientAddr(c) : (jf.billing_address||'');
  const email = c ? (c.email||'') : (jf.billing_email||'');
  const nm = c ? c.name : name;
  return `<div class="card">
    <div class="finbillsum">
      <div style="min-width:0;">
        <p class="sectiontitle" style="margin:0;">Bill to</p>
        ${nm ? `<div style="font-weight:700;margin-top:6px;">${escapeHtml(nm)}</div>
          <div class="stub">${escapeHtml([addr, email].filter(Boolean).join('\n') || 'No address or accounts email yet')}</div>
          ${c ? '' : '<div class="stub" style="color:#B26B00;">Not in the Directory yet.</div>'}`
        : `<div class="stub">No client on this job yet — add one in the Project card above.</div>`}
      </div>
      ${nm ? `<button type="button" class="ghostbtn" style="width:auto;flex:none;padding:6px 12px;margin:0;" onclick="openFinDirEdit('client', ${c?`'${c.id}'`:'null'}, '${jsAttr(nm)}')">${c?'Edit in Directory':'Add to Directory'}</button>` : ''}
    </div>
    <input type="hidden" id="finBillName" value="${escapeHtml(nm)}">
    <input type="hidden" id="finBillAddr" value="${escapeHtml(addr)}">
    <input type="hidden" id="finBillEmail" value="${escapeHtml(email)}">
    <div class="formfield" style="margin:12px 0 0;"><label class="field-label">Payment notes for this job</label><textarea id="finNotes" rows="2" placeholder="Anything about payment on this project">${escapeHtml(jf.notes||'')}</textarea></div>
  </div>`;
}
// Keep the job's billing details in step with the Directory (invoices read them from the job).
async function finBillingSync(siteId, site, jf){
  const c = finClientByName(site.client_name || jf.billing_name);
  if(!c || !jf.site_id) return;
  const want = {billing_name:c.name, billing_email:c.email||null, billing_address:finClientAddr(c)||null};
  if(Object.keys(want).some(k=>String(want[k]||'')!==String(jf[k]||''))){
    await sbFetch('/rest/v1/job_finance?site_id=eq.'+siteId, {method:'PATCH', body:JSON.stringify(Object.assign({updated_at:new Date().toISOString(), updated_by:ME.id}, want))}).catch(()=>{});
    Object.assign(jf, want);
  }
}

/* ---- 4. delete a job from Finance ---- */
window.finDeleteJob = async function(siteId){
  const site = SITES.find(s=>s.id===siteId); if(!site) return;
  const q = t=>dbSelect(t, 'site_id=eq.'+siteId+'&select=id&limit=1').catch(()=>[{id:'?'}]);
  const tabs = [['fin_invoices','invoices'], ['fin_applications','applications'], ['purchase_orders','purchase orders'], ['purchase_invoices','purchase invoices'], ['fin_job_costs','costs'], ['fin_subcontracts','subcontracts'], ['fin_variations','variations'], ['fin_plant_hires','plant hire'], ['fin_job_budgets','budgets']];
  const got = await Promise.all(tabs.map(t=>q(t[0])));
  const used = tabs.filter((t,i)=>got[i] && got[i].length).map(t=>t[1]);
  if(used.length){
    if(await customConfirm(`“${site.name}” already has ${used.join(', ')} booked to it, so it can’t be deleted — that would wipe financial records. Close it instead? (It moves to Closed and drops off the live lists.)`)){
      const row = await dbUpdate('sites', siteId, {status:'closed', closed_at:new Date().toISOString(), closed_by:ME.id});
      if(row){ Object.assign(site, row); toast('Project closed'); go('#/finance/jobs'); }
    }
    return;
  }
  // Nothing financial on it — hand over to the normal delete (it asks to confirm, and
  // PMs can only close a job that has Projects data in it).
  await deleteSite(siteId, site.name);
  if(!SITES.find(s=>s.id===siteId)) go('#/finance/jobs');
};

// Saving the job: the client in the Project card decides who's billed (added to the Directory if new).
(function(){
  const base = window.saveSiteFinance;
  window.saveSiteFinance = async function(siteId){
    const el = document.getElementById('finJeClient');
    if(el && el.value.trim() && document.getElementById('finBillName')){
      const c = await finClientEnsure(el.value);
      if(c){ el.value = c.name;
        document.getElementById('finBillName').value = c.name;
        document.getElementById('finBillAddr').value = finClientAddr(c);
        document.getElementById('finBillEmail').value = c.email||''; }
    }
    return base.apply(this, arguments);
  };
})();

/* ---- 5. A project's Finance page looks like the Finance overview (Andy, 22 Oct:
   "this view is great … change the view in the projects in the finance to this style") ----
   Same big tab bar as Finance, then four money tiles and a "Needs attention" list for
   just this job. A brand-new job shows Getting started instead. */
function finProjTabsHtml(siteId, bt){
  const cur = finProjTabCur(siteId);
  const tabs = FIN_PTABS.filter(t=>t.k!=='boq' || bt==='application');
  if(cur==='boq' && bt!=='application') finProjTab[siteId] = 'overview';
  return `<nav class="finsecnav finptabs" role="tablist">${tabs.map(t=>`<button type="button" role="tab" data-t="${t.k}" class="${t.k===(finProjTab[siteId]||cur)?'on':''}" onclick="finProjTabGo('${siteId}','${t.k}')">${t.l}</button>`).join('')}</nav>`;
}
function finJobOverviewHtml(d){
  const {siteId, site, jf, st, bt, invs, apps, items, pos, pinvs, hires} = d;
  const live = invs.filter(i=>i.status!=='void');
  const owed = live.reduce((t,i)=>t+finInvOutstanding(i), 0);
  const od = live.filter(finInvOverdue), overdue = od.reduce((t,i)=>t+finInvOutstanding(i), 0);
  const retHeld = typeof finRetentionHeld==='function' ? finRetentionHeld(apps) : 0;
  const tiles = `<div class="pmstats finstats">
    <div class="pmstat" onclick="finProjTabGo('${siteId}','setup')"><b>${finMoney(jf.contract_value||0, 0)}</b><span>Contract value</span></div>
    <div class="pmstat" onclick="finProjTabGo('${siteId}','sales')"><b>${finMoney(owed, 0)}</b><span>Owed to you</span></div>
    <div class="pmstat" onclick="finProjTabGo('${siteId}','sales')"><b${overdue?' class="hot"':''}>${finMoney(overdue, 0)}</b><span>Overdue</span></div>
    <div class="pmstat" onclick="finProjTabGo('${siteId}','sales')"><b>${finMoney(retHeld, 0)}</b><span>Retention held by client</span></div>
  </div>`;
  const start = finStartCardHtml(siteId, bt, {items:items.length, pos:pos.length, invs:invs.length, apps:apps.length});
  if(start) return tiles + start;
  const todo = [], T = (tone, t, s, n, js)=>todo.push({tone, t, s, n, js});
  const tab = k=>`finProjTabGo('${siteId}','${k}')`;
  if(od.length) T('bad', 'Overdue invoices', finMoney(overdue, 0)+' to chase', od.length, tab('sales'));
  const isLive = finSiteStatus(site)==='live';
  if(bt==='application' && isLive && typeof finAppDueThisMonth==='function' && finAppDueThisMonth(apps, finAppDateFor(jf, st, finToday().slice(0,7))))
    T('warn', 'Application due this month', 'Value the work and send it to the client', 1, `newFinApplication('${siteId}')`);
  const drafts = invs.filter(i=>i.status==='draft').length + apps.filter(a=>a.status==='draft').length;
  if(drafts) T('blue', 'Drafts not sent yet', 'Invoices or applications still in draft', drafts, tab('sales'));
  const toApp = pinvs.filter(p=>['to_approve','query'].includes(p.status));
  if(toApp.length) T('warn', 'Purchase invoices to approve', finMoney(toApp.reduce((t,p)=>t+Number(p.net||0),0), 0)+' excl. VAT', toApp.length, tab('purchases'));
  const longHire = hires.filter(h=>!h.off_hire && finPlantCost(h).days>28);
  if(longHire.length) T('warn', 'Plant on hire over 4 weeks', longHire.map(h=>h.item).join(', '), longHire.length, tab('purchases'));
  if(!pos.length && isLive) T('grey', 'No client PO', 'It goes on every invoice and application', 1, `openClientPoForm('${siteId}')`);
  if(!Number(jf.contract_value) && isLive) T('grey', 'No contract value', bt==='application' ? 'Set up the Bill of Quantities' : 'Add it in Project Admin', 1, bt==='application' ? tab('boq') : tab('setup'));
  const c = finClientByName(site.client_name);
  if(site.client_name && !c) T('grey', 'Client not in the Directory', site.client_name, 1, `openFinDirEdit('client', null, '${jsAttr(site.client_name)}')`);
  else if(c && !c.email) T('grey', 'No accounts email for the client', c.name+' — invoices need somewhere to go', 1, `openFinDirEdit('client', '${c.id}')`);
  const list = todo.length ? `<div class="card fintodo">
      <p class="sectiontitle" style="margin-top:0;">Needs attention</p>
      ${todo.map(x=>`<button type="button" class="fintodo-i" onclick="${escapeHtml(x.js)}"><span class="fintodo-n t-${x.tone}">${x.n}</span><span class="fintodo-t"><b>${escapeHtml(x.t)}</b><em>${escapeHtml(x.s)}</em></span><span class="fintodo-c">›</span></button>`).join('')}
    </div>` : `<div class="card"><p class="stub" style="margin:0;font-style:normal;">Nothing needs your attention on this job right now.</p></div>`;
  return tiles + list;
}

/* ---- 6. Bill of Quantities and Project Admin are their own tabs (Andy, 22 Oct) ---- */
FIN_PTABS.splice(0, FIN_PTABS.length, {k:'overview', l:'Overview'}, {k:'sales', l:'Sales'}, {k:'purchases', l:'Purchases'}, {k:'subs', l:'Subcontractors & Labour'}, {k:'boq', l:'Bill of Quantities'}, {k:'setup', l:'Project Admin'});

/* ---- 7. In-app links (<a href="#/…">) go forward, not "back" ----
   The router treats a hash change it didn't make as a Back swipe, so plain links
   (e.g. "Set a budget") landed on the project home. Send them through go(). */
document.addEventListener('click', e=>{
  if(e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target && e.target.closest ? e.target.closest('a[href^="#/"]') : null;
  if(!a || a.target) return;
  e.preventDefault(); go(a.getAttribute('href'));
});

/* ---- 8. Retention: compact (Andy: "the retention rows and section is way too big") ---- */
function finRetentionCardHtml(siteId, jf, st, apps){
  const held = finRetentionHeld(apps);
  const d = finRetentionDates(jf, st);
  const alerts = finRetentionAlerts(jf, st, held);
  const act = (n, date, invId)=> invId ? `<button class="linkbtn" onclick="go('#/site/${siteId}/finance/invoice/${invId}')">View invoice</button>`
    : (held && date ? `<button class="linkbtn" onclick="raiseRetentionInvoice('${siteId}',${n})">Raise invoice</button>` : '<span class="stub" style="margin:0;">—</span>');
  const due = (n, date)=>date ? finDate(date) : '<span class="stub" style="margin:0;font-style:normal;">Set PC date</span>';
  return `<div class="card finret">
    <div class="finret-h"><p class="sectiontitle" style="margin:0;">Retention</p><span>Held to date <b>${finMoney(held)}</b></span></div>
    ${alerts.length ? `<div class="finchecks" style="margin:6px 0 0;">${alerts.map(x=>`<span>${x.half===1?'First':'Second'} half due ${finDate(x.date)}</span>`).join('')}</div>` : ''}
    <table class="finret-t"><thead><tr><th>Release</th><th>Due</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      <tr><td>1st half · practical completion</td><td>${due(1, d.first)}</td><td class="num">${finMoney(finRetHalf(held, 1))}</td><td class="r">${act(1, d.first, jf.ret1_invoice_id)}</td></tr>
      <tr><td>2nd half · end of defects</td><td>${due(2, d.second)}</td><td class="num">${finMoney(finRetHalf(held, 2))}</td><td class="r">${act(2, d.second, jf.ret2_invoice_id)}</td></tr>
    </tbody></table>
    <div class="finret-f">
      <label>Practical completion<input type="date" id="finPcDate" value="${jf.pc_date||''}"></label>
      <label>Defects (months)<input type="number" min="0" step="1" id="finDefects" value="${jf.defects_months!=null?jf.defects_months:(st.default_defects_months!=null?st.default_defects_months:12)}"></label>
      <button class="ghostbtn" onclick="saveFinRetentionDates('${siteId}')">Save dates</button>
    </div>
  </div>`;
}

/* ---- 9. Projects list: Live / Upcoming / Closed / All is a drop-down in the Status column ---- */
function finJobStatusSelHtml(){
  const counts = {live:0, upcoming:0, closed:0, all:SITES.length}; SITES.forEach(s=>{ const k = finSiteStatus(s); counts[k] = (counts[k]||0)+1; });
  return `<select class="fgstat" onchange="finHomeTab=this.value;render()" onclick="event.stopPropagation()" aria-label="Status">${[['live','Live'],['upcoming','Upcoming'],['closed','Closed'],['all','All']].map(([k,l])=>`<option value="${k}" ${finHomeTab===k?'selected':''}>${l} (${counts[k]||0})</option>`).join('')}</select>`;
}
(function(){
  const base = finJobGridHtml;
  finJobGridHtml = function(sites, o){
    let h = base(sites, o);
    const cols = finJobColsOn(); const i = cols.findIndex(c=>c.k==='status');
    if(i>=0) h = h.replace(`<th class="fgf"><input type="text" placeholder="Status" data-col="${i}" oninput="finGridFilter('finJobGrid')" onclick="event.stopPropagation()"></th>`, `<th class="fgf">${finJobStatusSelHtml()}</th>`);
    // PM and Sort live in the black bar next to Columns (Andy, 22 Oct).
    const f = finJobFilt;
    const pms = Array.from(new Set(SITES.map(x=>x.responsible_pm_id).filter(Boolean))).map(id=>({id, name:(PROFILES[id]||{}).name||'PM'})).sort((a,b)=>a.name.localeCompare(b.name));
    const ctl = `<span class="fgfoot-ctl">
      <select aria-label="PM" onchange="finJobFilt.pm=this.value;render()"><option value="">All PMs</option>${pms.map(p=>`<option value="${p.id}" ${f.pm===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}<option value="none" ${f.pm==='none'?'selected':''}>No PM</option></select>
      <select aria-label="Sort" onchange="finJobFilt.sort=this.value;render()">${[['noza','Newest project no.'],['noaz','Project no. A–Z'],['az','Name A–Z'],['za','Name Z–A'],['start','Start date (newest)']].map(([k,l])=>`<option value="${k}" ${f.sort===k?'selected':''}>Sort: ${l}</option>`).join('')}</select>
    </span>`;
    h = h.replace('<button type="button" class="fgcolbtn"', ctl+'<button type="button" class="fgcolbtn"');
    return h;
  };
})();

(function(){
  if(document.getElementById('finNjCss2')) return;
  const st = document.createElement('style'); st.id = 'finNjCss2';
  st.textContent = `.finjobchips{display:none !important;}
html .finjobfilt > label:not(.fin-searchlbl):not(.fincli-lbl){display:none !important;}
.fgfoot-ctl{display:flex;gap:6px;margin-left:auto;}
.fgfoot-ctl ~ .fgcolbtn{margin-left:0 !important;}
.fgfoot-ctl ~ .fgfoot-n{margin-left:4px !important;}
.fgfoot-ctl select{height:28px !important;min-height:28px !important;margin:0 !important;padding:0 24px 0 10px !important;font-size:12px !important;font-weight:600 !important;color:#fff !important;background-color:#262A31 !important;border:1px solid #3A3F48 !important;border-radius:8px !important;box-shadow:none !important;width:auto;}
.fgfoot-ctl select option{color:#111;background:#fff;}
.fggrid td[data-l="Job"]{width:auto !important;min-width:96px;}
.fggrid .fgjob{width:auto !important;min-width:58px !important;max-width:none !important;overflow:visible !important;text-overflow:clip !important;white-space:nowrap;padding:7px 10px !important;}
.fggrid .fgfilters select.fgstat{width:100%;min-width:96px;box-sizing:border-box;margin:0 !important;height:26px !important;min-height:26px !important;padding:0 18px 0 6px !important;font-size:11.5px !important;font-weight:500 !important;line-height:24px !important;color:var(--ink);border:1px solid var(--line) !important;border-radius:7px !important;background-color:#fff !important;background-position:right 6px center !important;background-size:10px !important;text-align:center;text-align-last:center;box-shadow:none !important;}
.fggrid .fgfilters select.fgstat option{text-align:left;font-size:13px;}
.finret-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}
.finret-h span{font-size:13px;color:var(--slate);} .finret-h b{color:var(--ink);font-size:15px;margin-left:4px;}
.finret-t{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px;}
.finret-t th{font-size:11px;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.04em;text-align:left;padding:4px 6px;border-bottom:1px solid var(--line);}
.finret-t td{padding:6px;border-bottom:1px solid #F0F1F4;} .finret-t .num{text-align:right;} .finret-t .r{text-align:right;white-space:nowrap;}
.finret-f{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-top:10px;}
.finret-f label{display:flex;flex-direction:column;gap:3px;font-size:11.5px;font-weight:700;color:var(--slate);}
.finret-f input{margin:0;padding:6px 8px;font-size:13px;width:160px;} .finret-f input[type=number]{width:90px;}
.finret-f .ghostbtn{width:auto;margin:0;padding:7px 14px;}`;
  document.head.appendChild(st);
})();

/* ---- 10. Project Admin sections are drop-downs, closed to start (Andy, 22 Oct) ----
   Same rows as Finance › Settings. A card whose title sits inside a row with a
   button (Client purchase orders, Bill to) gets the title lifted out first. */
(function(){
  if(typeof FIN_SET_ICONS!=='undefined') Object.assign(FIN_SET_ICONS, {
    'client purchase orders':['🧾','#fff4e0','#a35f00'], 'project':['🏗','#fdecec','#c62828'],
    'project details':['⚙','#f1f3f6','#4a5260'], 'bill to':['🏢','#e8f4fb','#1b6a96'],
  });
  const base = window.finAfterProjectRender || (typeof finAfterProjectRender==='function' ? finAfterProjectRender : null);
  finAfterProjectRender = function(){
    if(base) base.apply(this, arguments);
    const root = document.querySelector('.finptab[data-t="setup"]'); if(!root) return;
    root.querySelectorAll(':scope > .card').forEach(card=>{
      const first = card.firstElementChild;
      if(first && first.classList.contains('sectiontitle')) return;
      const t = card.querySelector('.sectiontitle'); if(!t) return;
      card.insertBefore(t, card.firstChild); t.style.margin = '0';
    });
    finCollapseCards(root, 'settings');
    root.classList.add('finadmin-dd');
  };
})();
(function(){
  const st = document.createElement('style');
  st.textContent = `.finadmin-dd > .card.fincoll{margin:10px 0 0 !important;}
.finadmin-dd > #finJobSave{margin-top:16px;max-width:260px;}
.fincosttool-sm{padding:12px 16px !important;}
.fincosttool-sm .fincosttool-row{gap:6px;flex-wrap:wrap;}
.fincosttool-sm .fincosttool-t{font-weight:800;font-size:13.5px;margin-right:6px;}
.fincosttool-sm select{flex:0 1 210px !important;height:32px !important;min-height:32px !important;padding:0 26px 0 10px !important;font-size:13px !important;border-radius:8px !important;}
.fincosttool-sm .finpctin{height:32px !important;box-sizing:border-box;width:80px;padding:0 8px !important;border-radius:8px;}
.fincosttool-sm .darkbtn,.fincosttool-sm .ghostbtn{box-sizing:border-box;}
.fincosttool-sm .finpctin input{height:30px !important;border:0 !important;min-height:32px !important;width:56px !important;font-size:13px !important;padding:0 6px !important;}
.fincosttool-sm .ghostbtn,.fincosttool-sm .darkbtn{height:32px;padding:0 12px !important;font-size:12.5px !important;border-radius:8px !important;}
html.finmode .finptab.finset-dd[style*="none"], html.desk.finmode .finptab.finset-dd[style*="none"]{display:none !important;}`;
  document.head.appendChild(st);
})();

/* ---- 11. Bill of Quantities lines (Andy, 22 Oct) ----
   Units: a list that narrows as you type (plus any unit already used on the job).
   Move up / down, Header / Sub-header / Item and Remove sit in a ⋮ menu at the end
   of each line's text row instead of a row of controls underneath. */
const FIN_UNITS = ['m²','m','lm','m³','nr','item','sum','prov sum','PC sum','hr','day','week','kg','t','roll','sheet','pack','bag','box','set','pair','lot','%'];
function finUnitOptions(){
  const used = (typeof finContractRows!=='undefined' && finContractRows ? finContractRows : []).map(r=>String(r.unit||'').trim()).filter(Boolean);
  return Array.from(new Set(FIN_UNITS.concat(used)));
}
window.finCrowMenu = function(ev, i){
  ev.stopPropagation();
  const old = document.getElementById('finCrowPop'); if(old){ const same = old.dataset.i===String(i); old.remove(); if(same) return; }
  const r = finContractRows[i]; if(!r) return;
  const pop = document.createElement('div'); pop.id = 'finCrowPop'; pop.className = 'fincrow-pop'; pop.dataset.i = String(i);
  const kinds = Object.keys(FIN_KIND_LABEL).filter(k=>k!==r.kind);
  pop.innerHTML = `${i>0?`<button type="button" data-a="up">↑ Move up</button>`:''}${i<finContractRows.length-1?`<button type="button" data-a="down">↓ Move down</button>`:''}
    ${kinds.map(k=>`<button type="button" data-a="kind" data-k="${k}">Make it ${escapeHtml(FIN_KIND_LABEL[k].toLowerCase())}</button>`).join('')}
    <button type="button" data-a="del" class="danger">✕ Remove line</button>`;
  pop.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return; e.stopPropagation(); pop.remove();
    const a = b.dataset.a;
    if(a==='up') finContractMove(i, -1); else if(a==='down') finContractMove(i, 1);
    else if(a==='kind'){ finContractRows[i].kind = b.dataset.k; finContractPaint(); }
    else if(a==='del'){ finContractRows.splice(i, 1); finContractPaint(); }
  });
  document.body.appendChild(pop);
  const rc = ev.currentTarget.getBoundingClientRect();
  pop.style.top = (rc.bottom + window.scrollY + 4)+'px';
  pop.style.left = Math.max(8, rc.right + window.scrollX - pop.offsetWidth)+'px';
  setTimeout(()=>document.addEventListener('click', function close(){ pop.remove(); document.removeEventListener('click', close); }), 0);
};
(function(){
  const st = document.createElement('style');
  st.textContent = `.fincrow-head{align-items:center;grid-template-columns:22px 64px minmax(0,1fr) 34px !important;}
.fincrow-menu{all:unset;box-sizing:border-box;cursor:pointer;flex:none;width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:var(--slate);}
.fincrow-menu:hover{background:rgba(0,0,0,.06);color:var(--ink);}
.fincrow-pop{position:absolute;z-index:10060;background:#fff;border:1px solid #E1E4EA;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:4px;min-width:170px;}
.fincrow-pop button{all:unset;box-sizing:border-box;display:block;width:100%;cursor:pointer;padding:8px 12px;border-radius:7px;font-size:13.5px;}
.fincrow-pop button:hover{background:#F2F4F7;}
.fincrow-pop button.danger{color:#C0392B;border-top:1px solid #F0F1F4;margin-top:2px;}
.fincrow-foot:empty{display:none;}
.fincrow.section .fincrow-foot,.fincrow.subsection .fincrow-foot{justify-content:flex-end;margin-top:4px;}`;
  document.head.appendChild(st);
})();
