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
    <div class="pmstat" onclick="finSalesGo('${siteId}','invoices')"><b>${finMoney(owed, 0)}</b><span>Owed to you</span></div>
    <div class="pmstat" onclick="finSalesGo('${siteId}','invoices')"><b${overdue?' class="hot"':''}>${finMoney(overdue, 0)}</b><span>Overdue</span></div>
    <div class="pmstat" onclick="finSalesGo('${siteId}','retention')"><b>${finMoney(retHeld, 0)}</b><span>Retention held by client</span></div>
  </div>`;
  const start = finStartCardHtml(siteId, bt, {items:items.filter(finIsItem).length, pos:pos.length, invs:invs.length, apps:apps.length});
  if(start) return tiles + start;
  const todo = [], T = (tone, t, s, n, js)=>todo.push({tone, t, s, n, js});
  const tab = k=>`finProjTabGo('${siteId}','${k}')`;
  if(od.length) T('bad', 'Overdue invoices', finMoney(overdue, 0)+' to chase', od.length, `finSalesGo('${siteId}','invoices')`);
  const isLive = finSiteStatus(site)==='live';
  if(bt==='application' && isLive && typeof finAppDueThisMonth==='function' && finAppDueThisMonth(apps, finAppDateFor(jf, st, finToday().slice(0,7))))
    T('warn', 'Application due this month', 'Value the work and send it to the client', 1, `newFinApplication('${siteId}')`);
  const drafts = invs.filter(i=>i.status==='draft').length + apps.filter(a=>a.status==='draft').length;
  if(drafts) T('blue', 'Drafts not sent yet', 'Invoices or applications still in draft', drafts, `finSalesGo('${siteId}', ${invs.some(i=>i.status==='draft')?"'invoices'":"'apps'"})`);
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
    </div>` : '';
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
      <select class="fgstat-m" aria-label="Status" onchange="finHomeTab=this.value;render()">${[['live','Live'],['upcoming','Upcoming'],['closed','Closed'],['all','All']].map(([k,l])=>`<option value="${k}" ${finHomeTab===k?'selected':''}>${l}</option>`).join('')}</select>
      <select aria-label="PM" onchange="finJobFilt.pm=this.value;render()"><option value="">All PMs</option>${pms.map(p=>`<option value="${p.id}" ${f.pm===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}<option value="none" ${f.pm==='none'?'selected':''}>No PM</option></select>
      <select aria-label="Sort" onchange="finJobFilt.sort=this.value;render()">${[['noza','Newest project no.'],['noaz','Project no. A–Z'],['az','Name A–Z'],['za','Name Z–A'],['start','Start date (newest)']].map(([k,l])=>`<option value="${k}" ${f.sort===k?'selected':''}>Sort: ${l}</option>`).join('')}</select>
    </span>`;
    h = h.replace('<button type="button" class="fgcolbtn"', ctl+'<button type="button" class="fgcolbtn"');
    h = h.replace('⚙ Columns</button>', '⚙<span class="fgcol-t"> Columns</span></button>');
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
    ${kinds.map(k=>`<button type="button" data-a="kind" data-k="${k}">Change to ${escapeHtml(FIN_KIND_LABEL[k].toLowerCase())}</button>`).join('')}
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
  const up = rc.bottom + pop.offsetHeight + 8 > window.innerHeight;
  pop.style.top = (up ? rc.top + window.scrollY - pop.offsetHeight - 4 : rc.bottom + window.scrollY + 4)+'px';
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

/* ---- 12. Bill of Quantities lines in the Coreloops style (Andy, 22 Oct) ----
   Title row: tick, ref, description, ⋮. Under it one row of small boxes:
   Quantity · Unit · Cost rate · Cost price · Sell rate · Sell price · Margin.
   Cost rate × quantity = cost price (the line's budget cost); sell rate × quantity
   = sell price. With no quantity, the prices are lump sums. */
function finCr2(v){ return v==null || isNaN(v) ? '' : Number(v).toFixed(2); }
function finCrNum(x){ const n = finNum(x); return (n===null || isNaN(n)) ? null : n; }
function finCrQty(r){ const q = finCrNum(r.qty); return q!=null && q>0 ? q : null; }
function finCrCostRate(r){ if(r.cost==null || isNaN(r.cost)) return null; const q = finCrQty(r); return q ? finRound(Number(r.cost)/q) : Number(r.cost); }
function finCrMarginHtml(r){
  const v = Number(finItemValue(r)), c = r.cost;
  if(c==null || isNaN(c) || !finItemValue(r)) return '<b>—</b>';
  const m = finRound(v - Number(c)), p = v ? (v - Number(c))/v*100 : null;
  return `<b class="${m<0?'neg':''}">${finMoney(m)}</b><em>${p!=null?finPctTxt(finRound(p)):''}</em>`;
}
function finCrRefresh(i, skip){
  const r = finContractRows[i]; if(!r) return;
  const set = (id, v)=>{ const el = document.getElementById(id); if(el && el.id!==skip && document.activeElement!==el) el.value = v==null ? '' : String(v); };
  set('finCCR-'+i, finCr2(finCrCostRate(r))); set('finCCost-'+i, finCr2(r.cost));
  const auto = finCrNum(r.qty)!==null && finCrNum(r.rate)!==null;
  const vEl = document.getElementById('finCVal-'+i); if(vEl){ vEl.disabled = auto; if(vEl.id!==skip && document.activeElement!==vEl) vEl.value = finCr2(finItemValue(r)); }
  const mg = document.getElementById('finCMg-'+i); if(mg) mg.innerHTML = finCrMarginHtml(r);
  finContractPaintTotal();
}
window.finCrSetCostRate = function(i, v){
  const r = finContractRows[i]; const n = finCrNum(v); const q = finCrQty(r);
  r.cost = n==null ? null : (q ? finRound(n*q) : n); r.cost_basis = ''; r.cost_pct = null;
  finCrRefresh(i, 'finCCR-'+i);
};
window.finCrSetCostPrice = function(i, v){
  const r = finContractRows[i]; const n = finCrNum(v);
  r.cost = n; r.cost_basis = ''; r.cost_pct = null;
  finCrRefresh(i, 'finCCost-'+i);
};
// Quantity / sell rate / sell price: keep the cost rate the same when the quantity changes.
window.finCrSetNum = function(i, key, v){
  const r = finContractRows[i]; const cr = finCrCostRate(r);
  finContractSetNum(i, key, v);
  if(key==='qty' && cr!=null && !r.cost_basis){ const q = finCrQty(r); r.cost = q ? finRound(cr*q) : cr; }
  finCrRefresh(i, key==='qty' ? null : (key==='rate' ? null : 'finCVal-'+i));
};
function finContractPaint(){
  const el = document.getElementById('finContractList'); if(!el) return;
  const tot = finGroupTotals(finContractRows, r=>finItemValue(r));
  const subs = FIN_SUBJOBS[finContractSite] || [];
  const plotSel = i=>subs.length ? `<select class="fincrow-plot" aria-label="${escapeHtml(finSubNoun(finContractSite))}" onchange="finContractRows[${i}].sub=this.value"><option value="">${finContractRows[i].kind==='item' ? 'Plot: as section' : 'Plot: none'}</option>${subs.map(a=>`<option value="${a.id}" ${finContractRows[i].sub===a.id?'selected':''}>${escapeHtml(a.short)}</option>`).join('')}</select>` : '';
  const menu = i=>`<button type="button" class="fincrow-menu" title="Move, change or remove" aria-label="Line options" onclick="finCrowMenu(event, ${i})">⋮</button>`;
  const money = v=>v==null || isNaN(v) ? '' : escapeHtml(String(v));
  el.innerHTML = finContractRows.length ? finContractRows.map((r,i)=>{
    if(r.kind==='section' || r.kind==='subsection') return `<div class="fincrow ${r.kind}">
        <div class="fincrow-head"><input type="checkbox" class="fincsel" aria-label="Tick everything under this" ${finContractGroupTicked(i)?'checked':''} onchange="finContractTickGroup(${i}, this.checked)"><input type="text" class="fincline-ref" placeholder="Ref" value="${escapeHtml(r.ref||'')}" oninput="finContractRows[${i}].ref=this.value">
          <input type="text" class="fincrow-title" placeholder="${r.kind==='section'?'Section, e.g. Main roof':'Sub-section, e.g. Slating'}" value="${escapeHtml(r.description||'')}" oninput="finContractRows[${i}].description=this.value">${menu(i)}</div>
        <div class="fincrow-foot">${plotSel(i)}<b id="finCTot-${i}">${finMoney((tot[i]||{}).value)}</b></div>
      </div>`;
    const v = finItemValue(r);
    const auto = finCrNum(r.qty)!==null && finCrNum(r.rate)!==null;
    return `<div class="fincrow item ${r._sel?'sel':''}">
      <div class="fincrow-head"><input type="checkbox" class="fincsel" aria-label="Tick this line" ${r._sel?'checked':''} onchange="finContractTick(${i}, this.checked)"><input type="text" class="fincline-ref" placeholder="Ref" value="${escapeHtml(r.ref||'')}" oninput="finContractRows[${i}].ref=this.value">
        <textarea rows="1" placeholder="Description" oninput="finContractRows[${i}].description=this.value">${escapeHtml(r.description||'')}</textarea>${menu(i)}</div>
      <div class="fincpills">
        <label class="fincpill"><span>Quantity</span><input type="text" inputmode="decimal" class="w-q" value="${money(r.qty)}" oninput="finCrSetNum(${i},'qty',this.value)"></label>
        <label class="fincpill"><span>Unit</span><input type="text" class="w-u" list="finUnitList" autocomplete="off" placeholder="—" value="${escapeHtml(r.unit||'')}" oninput="finContractRows[${i}].unit=this.value"></label>
        <label class="fincpill cost"><span>Cost rate £</span><input type="text" inputmode="decimal" id="finCCR-${i}" placeholder="0.00" value="${finCr2(finCrCostRate(r))}" oninput="finCrSetCostRate(${i}, this.value)"></label>
        <label class="fincpill cost"><span>Cost price £</span><input type="text" inputmode="decimal" id="finCCost-${i}" placeholder="0.00" value="${finCr2(r.cost)}" oninput="finCrSetCostPrice(${i}, this.value)"></label>
        <label class="fincpill sell"><span>Sell rate £</span><input type="text" inputmode="decimal" value="${finCr2(finCrNum(r.rate))}" placeholder="0.00" oninput="finCrSetNum(${i},'rate',this.value)"></label>
        <label class="fincpill sell"><span>Sell price £</span><input type="text" inputmode="decimal" id="finCVal-${i}" placeholder="0.00" value="${finCr2(v)}" ${auto?'disabled title="Quantity × sell rate"':''} oninput="finCrSetNum(${i},'value',this.value)"></label>
        <span class="fincpill mg"><span>Margin</span><span id="finCMg-${i}" class="fincpill-mg">${finCrMarginHtml(r)}</span></span>
        ${plotSel(i)}
      </div>
    </div>`;
  }).join('') : `<div class="empty" style="margin:0;">No lines yet. Upload a file or add a section and items.</div>`;
  el.insertAdjacentHTML('beforeend', `<datalist id="finUnitList">${finUnitOptions().map(u=>`<option value="${escapeHtml(u)}">`).join('')}</datalist>`);
  finContractPaintTotal();
  finContractBulkPaint();
}

/* ---- 13. Auto-save the Bill of Quantities when lines are added, moved, changed
   or removed — never while typing (that used to redraw the screen). Saves quietly
   in the background, keeps you where you are, and never deletes a line that's
   still on screen. ---- */
let finCtAuto = {busy:false, again:false, at:null, err:''};
async function finContractAutoSave(){
  const siteId = finContractSite; if(!siteId || !finContractRows) return;
  if(finCtAuto.busy){ finCtAuto.again = true; return; }
  finCtAuto.busy = true; finCtAutoPaint('Saving…');
  try{
    const rowsNow = finContractRows;
    const onScreen = new Set(rowsNow.filter(r=>r.id).map(r=>r.id));
    const rows = rowsNow.map((r,_i)=>({_i, r, kind:r.kind||'item', description:String(r.description||'').trim()})).filter(x=>x.description);
    const existing = await dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&select=id');
    let failed = 0;
    for(const e of existing) if(!onScreen.has(e.id)){ if(!(await dbDelete('fin_contract_items', e.id))) failed++; }
    for(let p=0;p<rows.length;p++){
      const {r, kind, description} = rows[p]; const item = kind==='item';
      const data = {kind, ref:String(r.ref||'').trim()||null, description, qty:item?finCrNum(r.qty):null, unit:item?(String(r.unit||'').trim()||null):null, rate:item?finCrNum(r.rate):null,
        value:item ? finItemValue(r) : 0, position:p, sub_job_id:r.sub||null, cost:item && r.cost!=null && !isNaN(r.cost) ? finRound(Number(r.cost)) : null,
        cost_basis:item ? (r.cost_basis||null) : null, cost_pct:item && r.cost_pct!=null ? Number(r.cost_pct) : null};
      if(r.id && existing.some(e=>e.id===r.id)){ if(!(await dbUpdate('fin_contract_items', r.id, data))) failed++; }
      else { const ins = await dbInsert('fin_contract_items', Object.assign({org_id:ME.org_id, site_id:siteId}, data)); if(ins && ins[0]) r.id = ins[0].id; else failed++; }
    }
    const total = finRound(rows.filter(x=>x.kind==='item').reduce((t,x)=>t+(Number(finItemValue(x.r))||0), 0));
    await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:siteId, org_id:ME.org_id, contract_value:total, billing_type:'application', updated_at:new Date().toISOString(), updated_by:ME.id})});
    if(finContractRows===rowsNow && !failed) finContractSnap = finContractSnapOf(finContractRows);
    finCtAuto.at = new Date(); finCtAuto.err = failed ? failed+' line'+(failed===1?'':'s')+' didn’t save' : '';
  }catch(e){ console.error(e); finCtAuto.err = 'Not saved — check your connection'; }
  finCtAuto.busy = false;
  finCtAutoPaint();
  if(finCtAuto.again){ finCtAuto.again = false; finContractAutoSave(); }
}
function finCtAutoPaint(msg){
  let el = document.getElementById('finCtAuto');
  if(!el){ const t = document.getElementById('finContractTotal'); if(!t) return; el = document.createElement('span'); el.id = 'finCtAuto'; el.className = 'finctauto'; t.closest('.fincontot').prepend(el); }
  el.classList.toggle('bad', !!finCtAuto.err && !msg);
  el.textContent = msg || (finCtAuto.err ? finCtAuto.err : finCtAuto.at ? 'Saved ✓ '+finCtAuto.at.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '');
}
(function(){
  const add = window.finContractAdd;
  window.finContractAdd = function(){ const r = add.apply(this, arguments); finContractAutoSave(); setTimeout(()=>{ const rows = document.querySelectorAll('#finContractList .fincrow'); const last = rows[rows.length-1]; const f = last && last.querySelector('textarea, .fincrow-title'); if(f) f.focus(); }, 30); return r; };
  const mv = window.finContractMove;
  window.finContractMove = function(){ const r = mv.apply(this, arguments); finContractAutoSave(); return r; };
  const ap = window.finContractApplyPct;
  if(ap) window.finContractApplyPct = function(){ const r = ap.apply(this, arguments); Promise.resolve(r).then(()=>finContractAutoSave()); return r; };
  // also when you click away from a line you've been typing in
  document.addEventListener('focusout', e=>{
    const row = e.target && e.target.closest ? e.target.closest('#finContractList .fincrow') : null; if(!row) return;
    setTimeout(()=>{ const a = document.activeElement; if(!(a && a.closest && a.closest('.fincrow')===row) && finContractIsDirty()) finContractAutoSave(); }, 50);
  });
})();
// The ⋮ menu changes (kind / remove) save too.
(function(){
  const base = window.finCrowMenu;
  window.finCrowMenu = function(ev, i){
    base(ev, i);
    const pop = document.getElementById('finCrowPop'); if(pop) pop.addEventListener('click', ()=>setTimeout(finContractAutoSave, 0));
  };
})();

/* ---- 14. Variations under the Bill of Quantities ---- */
// Variations raised on the Projects side come into the register on their own, and any
// variation can be sent to the operatives' Schedule of Works (Andy, 22 Oct).
let finCtVarBusy = false;
async function finCtVariationsFill(siteId){
  const box = document.getElementById('finCtVars'); if(!box) return;
  const fo = typeof isFinanceOnly==='function' && isFinanceOnly();
  let [vs, siteVars] = await Promise.all([
    dbSelect('fin_variations', 'site_id=eq.'+siteId+'&order=seq.asc').catch(()=>[]),
    fo ? Promise.resolve([]) : dbSelect('variations', 'site_id=eq.'+siteId+'&order=created_at.asc').catch(()=>[]),
  ]);
  const linked = new Set(vs.map(v=>v.variation_id).filter(Boolean));
  const fresh = siteVars.filter(v=>!linked.has(v.id) && v.approval_status!=='declined');
  if(fresh.length && !finCtVarBusy){
    finCtVarBusy = true;
    try{
      for(const v of fresh){
        const amt = finNum(v.cost_impact), ok = amt!==null && !isNaN(amt);
        await finVarInsert(siteId, {title:String(v.description||'Variation').slice(0,200), description:v.description||null, variation_id:v.id, instructed_on:String(v.created_at||'').slice(0,10)||null,
          status: v.approval_status==='approved' ? 'agreed' : 'instructed', quoted: ok ? amt : null, agreed_value: v.approval_status==='approved' && ok ? amt : null, notes:'Raised on site'});
      }
    } finally { finCtVarBusy = false; }
    vs = await dbSelect('fin_variations', 'site_id=eq.'+siteId+'&order=seq.asc').catch(()=>vs);
  }
  if(!document.getElementById('finCtVars')) return;
  const siteBy = {}; siteVars.forEach(v=>siteBy[v.id] = v);
  const inSow = v=>v.schedule_section_id || (v.variation_id && siteBy[v.variation_id] && siteBy[v.variation_id].schedule_section_id);
  const val = v=>v.agreed_value!=null ? Number(v.agreed_value) : (v.quoted!=null ? Number(v.quoted) : null);
  const agreed = vs.filter(v=>v.status==='agreed').reduce((t,v)=>t+(Number(v.agreed_value)||0), 0);
  const pending = vs.filter(v=>!['agreed','rejected'].includes(v.status)).reduce((t,v)=>t+(val(v)||0), 0);
  const sowCell = v=>fo ? '' : `<td data-l="Schedule of Works" onclick="event.stopPropagation()">${inSow(v) ? '<span class="finpill ok">✓ On the schedule</span>' : v.status==='rejected' ? '<span class="stub" style="margin:0;">—</span>' : `<button type="button" class="ghostbtn" style="width:auto;padding:4px 10px;margin:0;font-size:12px;" onclick="finVarToSow('${siteId}','${v.id}')">+ Schedule of Works</button>`}</td>`;
  box.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <p class="sectiontitle" style="margin:0;">Variations</p>
      <button type="button" class="ghostbtn" style="width:auto;padding:6px 12px;margin:0;" onclick="openFinVariation('${siteId}')">+ Add variation</button>
    </div>
    <p class="stub" style="margin:4px 0 10px;font-style:normal;">Agreed <b>${finMoney(agreed)}</b>${pending ? ` · waiting to be agreed ${finMoney(pending)}` : ''}.${fo ? '' : ' Variations raised on site (Projects › Variations) come in here on their own.'} Agreed variations are added to the contract and can be valued on applications.</p>
    ${vs.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>No.</th><th>Title</th><th>Status</th><th class="num">Quoted</th><th class="num">Agreed</th><th class="num">Budget cost</th>${fo?'':'<th>Schedule of Works</th>'}</tr></thead><tbody>
      ${vs.map(v=>`<tr class="click" onclick="openFinVariation('${siteId}','${v.id}')"><td data-l="No."><b>${escapeHtml(v.number||'')}</b></td><td data-l="Title">${escapeHtml(v.title||'')}${v.variation_id?' <span class="finpill grey" title="Raised on the Projects side">Site</span>':''}</td><td data-l="Status"><span class="finpill ${v.status==='agreed'?'ok':v.status==='rejected'?'bad':'grey'}">${escapeHtml(FIN_VAR_STATUS[v.status]||v.status||'')}</span></td><td data-l="Quoted" class="num">${v.quoted!=null?finMoney(v.quoted):'—'}</td><td data-l="Agreed" class="num">${v.agreed_value!=null?finMoney(v.agreed_value):'—'}</td><td data-l="Budget cost" class="num">${v.cost_estimate!=null?finMoney(v.cost_estimate):'—'}</td>${sowCell(v)}</tr>`).join('')}
    </tbody></table></div>` : '<div class="empty" style="margin:0;">No variations yet.</div>'}`;
}
window.finVarToSow = async function(siteId, finVarId){
  if(typeof FIN_TRIAL!=='undefined' && FIN_TRIAL && !(typeof finIsSandbox==='function' && finIsSandbox())){ toast('Finance trial — switched off while testing (nothing is added to the Schedule of Works yet).'); return; }
  const v = (await dbSelect('fin_variations', 'id=eq.'+finVarId))[0]; if(!v) return;
  if(v.schedule_section_id){ toast('Already on the Schedule of Works.'); return; }
  const sv = v.variation_id ? (await dbSelect('variations', 'id=eq.'+v.variation_id))[0] : null;
  if(sv && sv.schedule_section_id){ await dbUpdate('fin_variations', v.id, {schedule_section_id:sv.schedule_section_id}); toast('Already on the Schedule of Works.'); finCtVariationsFill(siteId); return; }
  if(!await customConfirm(`Add “${v.title}” to the operatives’ Schedule of Works? It goes in as its own section (no prices).`)) return;
  const sec = await addVariationSection(siteId, (v.number ? v.number+' ' : '')+(v.title||'Variation work'));
  if(!sec){ toast('Could not add to the schedule — try again.'); return; }
  await dbUpdate('fin_variations', v.id, {schedule_section_id:sec.id});
  if(sv) await dbUpdate('variations', sv.id, {schedule_section_id:sec.id});
  toast(`Added to the Schedule of Works as “${sec.name}”`);
  finCtVariationsFill(siteId);
};
(function(){
  const base = renderFinContract;
  renderFinContract = async function(siteId){
    const r = await base.apply(this, arguments);
    const save = document.getElementById('finContractSave');
    if(save && !document.getElementById('finCtVars')){
      const card = document.createElement('div'); card.className = 'card'; card.id = 'finCtVars'; card.innerHTML = '<p class="stub">Loading variations…</p>';
      const after = save.nextElementSibling && save.nextElementSibling.matches('p.stub') ? save.nextElementSibling : save;
      after.insertAdjacentElement('afterend', card); card.style.marginTop = '16px';
      finCtVariationsFill(siteId);
    }
    finCtAutoPaint();
    return r;
  };
})();

(function(){
  const st = document.createElement('style');
  st.textContent = `.fincpills{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;}
.fincpill{display:inline-flex;align-items:center;gap:4px;height:32px;box-sizing:border-box;padding:0 2px 0 8px;border:1px solid #E1E4EA;border-radius:8px;background:#fff;font-size:12.5px;color:var(--slate);font-weight:600;white-space:nowrap;}
.fincpill > span:first-child{white-space:nowrap;}
.fincpill input{all:unset;box-sizing:border-box;width:68px;height:28px;padding:0 6px;border-radius:6px;font-size:13.5px;font-weight:700;color:var(--ink);text-align:right;}
.fincpill input.w-q{width:56px;} .fincpill input.w-u{width:64px;text-align:left;}
.fincpill input[id^=finCCost],.fincpill input[id^=finCVal]{width:96px;}
.fincpill input:focus{background:#F2F4F7;}
.fincpill input:disabled{color:var(--ink);opacity:1;}
.fincpill.cost{background:#FFFBF2;border-color:#F1E3C4;} .fincpill.sell{background:#F4F8FF;border-color:#D9E5F7;}
.fincpill.mg{padding-right:10px;} .fincpill-mg{display:inline-flex;gap:6px;align-items:baseline;} .fincpill-mg b{color:#1E6B45;font-size:13.5px;} .fincpill-mg b.neg{color:var(--red);} .fincpill-mg em{font-style:normal;font-size:12px;color:var(--slate);}
.fincpills .fincrow-plot{height:32px;font-size:12.5px;}
.finctauto{display:block;font-size:11.5px;color:#1E6B45;font-weight:600;text-align:right;} .finctauto.bad{color:var(--red);}
@media (max-width:600px){ .fincpill input{width:70px;} }`;
  document.head.appendChild(st);
})();

/* ---- 15. Bill of Quantities: count sections and items separately (Andy, 22 Oct) ---- */
(function(){
  const base = window.finContractPaintTotal;
  window.finContractPaintTotal = function(){
    const r = base.apply(this, arguments);
    const rows = finContractRows || [];
    const secs = rows.filter(x=>x.kind==='section').length, subs = rows.filter(x=>x.kind==='subsection').length, items = rows.filter(finIsItem).length;
    const t = Array.from(document.querySelectorAll('.card .sectiontitle')).find(p=>p.textContent.trim().startsWith('Lines'));
    if(t){
      let c = document.getElementById('finCtCount');
      if(!c){ c = document.createElement('span'); c.id = 'finCtCount'; c.className = 'finctcount'; t.appendChild(c); }
      c.textContent = [secs ? secs+' section'+(secs===1?'':'s') : '', subs ? subs+' sub-section'+(subs===1?'':'s') : '', items+' item'+(items===1?'':'s')].filter(Boolean).join(' · ');
    }
    return r;
  };
  const st = document.createElement('style'); st.textContent = '.finctcount{font-size:12.5px;font-weight:600;color:var(--slate);margin-left:10px;}'; document.head.appendChild(st);
})();

/* ---- 16. Add a line from inside an application (Andy, 22 Oct: "if we forget something
   or want to add something"). The line goes into the Bill of Quantities (under a header
   you pick, or a new one) and straight into this application at 0% done. ---- */
(function(){
  const base = renderFinApplication;
  renderFinApplication = async function(siteId, appId){
    const r = await base.apply(this, arguments);
    const lines = document.getElementById('finAppLines');
    if(lines && finAppCtx && finApp && !finAppCtx.locked && !document.getElementById('finAppAddLineBtn')){
      lines.insertAdjacentHTML('afterend', `<div class="row-gap" style="margin-top:10px;flex-wrap:wrap;align-items:center;" id="finAppAddLineBtn">
        ${finAppCtx.locked ? '' : `<button type="button" class="ghostbtn" onclick="finAppAddLineOpen('${siteId}','item')">+ Add a line</button>
        <button type="button" class="ghostbtn" onclick="finAppAddLineOpen('${siteId}','section')">+ Add a section</button>`}
      </div>
      ${finAppCtx.locked ? '' : `<p class="stub" style="margin:6px 0 0;font-style:normal;font-size:12px;">New lines are added to the project’s Bill of Quantities too, so they carry on to the next application.</p>`}`);
    }
    return r;
  };
})();
window.finAppAddLineOpen = function(siteId, kind){
  const heads = (finApp.lines||[]).filter(l=>l.kind==='section' || l.kind==='subsection');
  let ov = document.getElementById('finAppLineOv');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finAppLineOv'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display = 'none'; };
  const item = kind==='item';
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${item ? 'Add a line' : 'Add a section'}</h3>
    ${item ? `<div class="formfield"><label class="field-label">Goes under</label><select id="falUnder" onchange="document.getElementById('falNewHeadWrap').hidden=this.value!=='__new'">
      ${heads.map(h=>`<option value="${h.item_id}">${h.kind==='subsection'?'— ':''}${escapeHtml((h.ref?h.ref+' ':'')+(h.description||'Section'))}</option>`).join('')}
      <option value="__new">New section…</option><option value="">No section (at the end)</option></select></div>
    <div class="formfield" id="falNewHeadWrap" hidden><label class="field-label">New section</label><input type="text" id="falNewHead" placeholder="e.g. Extras"></div>` : ''}
    <div style="display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;">
      <div class="formfield"><label class="field-label">Ref</label><input type="text" id="falRef"></div>
      <div class="formfield"><label class="field-label">${item?'Description *':'Section *'}</label><input type="text" id="falDesc" placeholder="${item?'e.g. Extra roof outlet':'e.g. Extras'}"></div>
    </div>
    ${item ? `<div class="fincpills" style="margin:4px 0 12px;">
      <label class="fincpill"><span>Quantity</span><input type="text" inputmode="decimal" class="w-q" id="falQty"></label>
      <label class="fincpill"><span>Unit</span><input type="text" class="w-u" id="falUnit" list="falUnits" autocomplete="off" placeholder="—"></label>
      <label class="fincpill sell"><span>Sell rate £</span><input type="text" inputmode="decimal" id="falRate" placeholder="0.00"></label>
      <label class="fincpill sell"><span>or lump sum £</span><input type="text" inputmode="decimal" id="falValue" placeholder="0.00"></label>
      <label class="fincpill cost"><span>Cost rate £</span><input type="text" inputmode="decimal" id="falCost" placeholder="0.00"></label>
      <datalist id="falUnits">${FIN_UNITS.map(u=>`<option value="${escapeHtml(u)}">`).join('')}</datalist>
    </div>` : ''}
    <button class="darkbtn" style="width:100%;" id="falSave" onclick="finAppAddLineSave('${siteId}','${kind}')">${item?'Add line':'Add section'}</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finAppLineOv').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
  setTimeout(()=>{ const d = document.getElementById('falDesc'); if(d) d.focus(); }, 50);
};
// Core: put one new header / line into the Bill of Quantities and this application.
// e = {kind:'item'|'section', under:headerItemId|''|'__new', newHead, ref, desc, qty, unit, rate, value, cost, pct}
async function finAppAddLineCore(siteId, e){
  const item = e.kind==='item';
  const boq = await dbSelect('fin_contract_items', 'site_id=eq.'+siteId+'&order=position.asc');
  const groupEnd = (arr, idx, key)=>{ const lvl = arr[idx].kind; let k = idx+1; while(k<arr.length){ const kk = arr[k].kind; if(kk==='section' || (lvl==='subsection' && kk==='subsection')) break; k++; } return k; };
  let at = boq.length;
  if(item && e.under && e.under!=='__new'){ const hi = boq.findIndex(b=>b.id===e.under); if(hi>=0) at = groupEnd(boq, hi); }
  const newRows = [];
  if(!item || e.newHead) newRows.push({kind:'section', ref:item ? null : (e.ref||null), description:item ? e.newHead : e.desc, value:0});
  if(item) newRows.push({kind:'item', ref:e.ref||null, description:e.desc, qty:e.qty, unit:e.unit||null, rate:e.rate, value:e.value, cost:e.cost});
  const made = [];
  for(const nr of newRows){ const ins = await dbInsert('fin_contract_items', Object.assign({org_id:ME.org_id, site_id:siteId, position:0}, nr)); if(!(ins && ins[0])) throw new Error('insert'); made.push(ins[0]); }
  const order = boq.slice(0, at).concat(made, boq.slice(at));
  for(let p=0;p<order.length;p++) if(order[p].position!==p) await dbUpdate('fin_contract_items', order[p].id, {position:p});
  const total = finRound(order.filter(finIsItem).reduce((t,b)=>t+Number(b.value||0), 0));
  await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:siteId, org_id:ME.org_id, contract_value:total, updated_at:new Date().toISOString(), updated_by:ME.id})});
  if(finAppCtx && finAppCtx.jf) finAppCtx.jf.contract_value = total;
  const appLines = finApp.lines || (finApp.lines = []);
  const toLine = b=>finIsItem(b) ? {kind:'item', item_id:b.id, ref:b.ref||'', description:b.description, qty:b.qty!=null?Number(b.qty):null, unit:b.unit||'', rate:b.rate!=null?Number(b.rate):null, value:Number(b.value||0), pct:finPct(e.pct||0)} : {kind:b.kind, item_id:b.id, ref:b.ref||'', description:b.description};
  let li = appLines.length;
  if(item && e.under && e.under!=='__new'){ const hi = appLines.findIndex(l=>l.item_id===e.under); if(hi>=0) li = groupEnd(appLines, hi); }
  appLines.splice(li, 0, ...made.map(toLine));
  if(typeof finContractRows!=='undefined' && finContractSite===siteId) finContractRows = null;
  return made;
}
window.finAppAddLineSave = async function(siteId, kind){
  const item = kind==='item';
  const desc = finVal('falDesc'); if(!desc){ toast(item ? 'Add a description.' : 'Give the section a name.'); return; }
  const qty = finCrNum(finVal('falQty')), rate = finCrNum(finVal('falRate')), lump = finCrNum(finVal('falValue')), crate = finCrNum(finVal('falCost'));
  const value = item ? (qty!=null && rate!=null ? finRound(qty*rate) : lump) : 0;
  if(item && value==null){ toast('Enter a quantity and sell rate, or a lump sum.'); return; }
  const under = item ? finVal('falUnder') : '';
  const newHead = item && under==='__new' ? finVal('falNewHead') : '';
  if(item && under==='__new' && !newHead){ toast('Name the new section.'); return; }
  const btn = document.getElementById('falSave'); if(btn){ btn.disabled = true; btn.textContent = 'Adding…'; }
  try{
    await finAppAddLineCore(siteId, {kind, under, newHead, ref:finVal('falRef')||null, desc, qty, unit:finVal('falUnit')||null, rate, value, cost: crate!=null ? (qty ? finRound(crate*qty) : crate) : null, pct:0});
    document.getElementById('finAppLineOv').style.display = 'none';
    await finAppSaveSoft();
    toast(item ? 'Line added — and to the Bill of Quantities' : 'Section added');
    render();
  }catch(err){ console.error(err); toast('Could not add the line — try again.'); if(btn){ btn.disabled = false; btn.textContent = item?'Add line':'Add section'; } }
};

/* ---- 18. Excel round trip (Andy, 22 Oct: "exports as an excel and then allows changes
   to be uploaded … also for when we certify").
   • Application: the downloaded Excel already comes back in (yellow % cells, variations,
     dayworks). Now a NEW row typed under CONTRACT WORKS (no ID, a description and a
     qty × rate or contract value) becomes a new Bill of Quantities line under the header
     above it, at the % typed.
   • Certificate: upload the client's marked-up copy of the same Excel. Their % complete
     per line is read, the certified total, retention and net are worked out and filled
     into the certificate, and each line's certified % is kept with the certificate. ---- */
async function finXlRows(file){
  if(!(await loadLib('XLSX'))){ toast('Could not load the Excel reader — check your connection.'); return null; }
  try{ const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array'}); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:true, defval:''}); }
  catch(e){ toast('Could not read that file.'); return null; }
}
function finXlCols(rows){
  const hi = rows.findIndex(r=>r.some(c=>/^description$/i.test(String(c).trim())));
  const H = (hi>=0 ? rows[hi] : []).map(c=>String(c).trim().toLowerCase());
  const col = (re, d)=>{ const i = H.findIndex(h=>re.test(h)); return i>=0 ? i : d; };
  return {hi, ref:col(/^ref/,1), desc:col(/^description$/,2), qty:col(/^(qty|quantity)$/,3), unit:col(/^unit$/,4), rate:col(/^rate$/,5), value:col(/^contract value$/,6), pct:col(/^% ?complete/,7), gross:col(/^value to date$/,8)};
}
const finXlNum = v=>{ if(typeof v==='number') return v; const n = Number(String(v||'').replace(/[£,%\s]/g,'')); return (String(v||'').trim()==='' || isNaN(n)) ? null : n; };
(function(){
  const base = window.uploadFinAppExcel;
  window.uploadFinAppExcel = async function(file){
    if(!file || !finApp) return;
    const rows = await finXlRows(file); if(!rows) return;
    const C = finXlCols(rows);
    let inContract = false, head = '', added = 0;
    const adds = [];
    rows.forEach((r, ri)=>{
      if(ri<=C.hi) return;
      const id = String(r[0]||'').trim(), desc = String(r[C.desc]||'').trim();
      if(/^CONTRACT WORKS$/i.test(desc)){ inContract = true; return; }
      if(/^(VARIATIONS|DAYWORKS)$/i.test(desc) || /^Gross valuation/i.test(desc)){ inContract = false; return; }
      if(!inContract) return;
      const m = /^H:(.+)$/.exec(id); if(m){ head = m[1]; return; }
      if(id || !desc) return;
      const qty = finXlNum(r[C.qty]), rate = finXlNum(r[C.rate]), val = finXlNum(r[C.value]);
      const value = qty!=null && rate!=null ? finRound(qty*rate) : val;
      if(value==null) return;
      adds.push({kind:'item', under:(finApp.lines||[]).some(l=>l.item_id===head) ? head : '', ref:String(r[C.ref]||'').trim()||null, desc, qty, unit:String(r[C.unit]||'').trim()||null, rate, value, cost:null, pct:finXlNum(r[C.pct])||0});
    });
    if(adds.length){
      try{ for(const e of adds){ await finAppAddLineCore(finApp.site_id, e); added++; } }
      catch(e){ console.error(e); toast('Some new lines from the Excel could not be added.'); }
    }
    const res = await base.call(this, file);
    if(added) toast(`${added} new line${added===1?'':'s'} added from the Excel (and to the Bill of Quantities)`);
    return res;
  };
})();

let finCertLines = null; // [{item_id, description, value, pct, gross}] from the client's Excel
window.finCertFromExcel = async function(file, appId){
  if(!file) return;
  const a = (await dbSelect('fin_applications', 'id=eq.'+appId))[0]; if(!a) return;
  const rows = await finXlRows(file); if(!rows) return;
  const C = finXlCols(rows);
  const byId = {}; rows.forEach((r,ri)=>{ if(ri>C.hi){ const id = String(r[0]||'').trim(); if(id) byId[id] = r; } });
  const lines = [], diffs = [];
  let gross = 0, found = 0;
  (a.lines||[]).filter(finIsItem).forEach(l=>{
    const r = byId['L:'+l.item_id]; const pct = r ? finXlNum(r[C.pct]) : null;
    const p = pct!=null ? finPct(pct) : finPct(l.pct); if(r) found++;
    const g = finRound(Number(l.value||0)*p/100); gross += g;
    lines.push({item_id:l.item_id, description:l.description, value:Number(l.value||0), applied_pct:finPct(l.pct), pct:p, gross:g});
    if(p!==finPct(l.pct)) diffs.push(l.description+': '+finPct(l.pct)+'% → '+p+'%');
  });
  (a.variations||[]).forEach((v,i)=>{ const r = byId['V:'+(v.variation_id||('x'+i))]; const p = r && finXlNum(r[C.pct])!=null ? finPct(finXlNum(r[C.pct])) : finPct(v.pct); const val = r && finXlNum(r[C.value])!=null ? finXlNum(r[C.value]) : Number(v.value||0); if(r) found++; gross += finRound(val*p/100); if(p!==finPct(v.pct) || val!==Number(v.value||0)) diffs.push((v.description||'Variation')+' changed'); });
  (a.dayworks||[]).forEach((d,i)=>{ const r = byId['D:'+i]; const val = r && finXlNum(r[C.value])!=null ? finXlNum(r[C.value]) : Number(d.value||0); if(r) found++; gross += finRound(val); if(val!==Number(d.value||0)) diffs.push((d.description||'Daywork')+' changed'); });
  if(!found){ toast('That doesn’t look like this application’s Excel — download it from OpHUB, send it to the client and upload their copy.'); return; }
  gross = finRound(gross);
  const jf = (await dbSelect('job_finance', 'site_id=eq.'+a.site_id))[0] || {};
  let ret = finRound(gross*finPct(a.retention_pct)/100);
  if(jf.retention_limit_pct && jf.contract_value) ret = Math.min(ret, finRound(jf.contract_value*jf.retention_limit_pct/100));
  const set = (id, v)=>{ const el = document.getElementById(id); if(el) el.value = String(finRound(v)); };
  set('finCertGross', gross); set('finCertRet', ret);
  if(typeof finCertCalc==='function') finCertCalc();
  finCertLines = lines;
  const box = document.getElementById('finCertXlNote');
  if(box) box.innerHTML = `<b>Read from the client’s Excel:</b> certified to date ${finMoney(gross)}. ${diffs.length ? diffs.length+(diffs.length===1?' line differs':' lines differ')+' from what you applied for:<br>'+diffs.slice(0,8).map(escapeHtml).join('<br>')+(diffs.length>8?'<br>…and '+(diffs.length-8)+' more':'') : 'Every line matches what you applied for.'} Check the figures, then save.`;
  toast('Certificate filled in from the Excel');
};
(function(){
  const slot = finCertSlotRender;
  finCertSlotRender = function(a){
    slot.apply(this, arguments);
    const save = document.getElementById('finCertSave');
    if(save && !document.getElementById('finCertXl')){
      finCertLines = null;
      save.closest('.card').querySelector('.sectiontitle').insertAdjacentHTML('afterend', `<div id="finCertXl" class="finnote" style="margin:0 0 12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;"><span>Client sent back the Excel with their figures? Upload it and the certificate fills itself in.</span>
        <label class="ghostbtn" style="width:auto;margin:0;padding:6px 12px;cursor:pointer;">Upload client’s Excel<input type="file" accept=".xlsx,.xls" style="display:none;" onchange="finCertFromExcel(this.files[0],'${a.id}')"></label></div>
        <div id="finCertXlNote" class="stub" style="margin:6px 0 0;font-style:normal;"></div></div>`);
    }
    // Certified lines kept with the certificate.
    if(a.cert_net!=null && Array.isArray(a.cert_lines) && a.cert_lines.length){
      const el = document.getElementById('finCertSlot'); const card = el && el.querySelector('.card');
      const diff = a.cert_lines.filter(l=>finPct(l.pct)!==finPct(l.applied_pct));
      if(card && !card.querySelector('.fincertlines')) card.insertAdjacentHTML('beforeend', `<details class="fincertlines" style="margin-top:10px;"><summary class="linkbtn" style="cursor:pointer;">Certified line by line${diff.length?` · ${diff.length} differ${diff.length===1?'s':''} from applied`:''}</summary>
        <table class="fincosttbl" style="margin-top:6px;"><thead><tr><th>Line</th><th class="num">Applied %</th><th class="num">Certified %</th><th class="num">Certified £</th></tr></thead><tbody>
        ${a.cert_lines.map(l=>`<tr><td>${escapeHtml(l.description||'')}</td><td class="num">${finPct(l.applied_pct)}%</td><td class="num" style="${finPct(l.pct)<finPct(l.applied_pct)?'color:var(--red);font-weight:700;':''}">${finPct(l.pct)}%</td><td class="num">${finMoney(l.gross)}</td></tr>`).join('')}
        </tbody></table></details>`);
    }
  };
  const save = window.saveFinCertificate;
  window.saveFinCertificate = async function(siteId, appId){
    await dbUpdate('fin_applications', appId, {cert_lines:finCertLines||null}); finCertLines = null;
    return save.apply(this, arguments);
  };
})();

/* ---- 17. Application lines compact: description on the left, % / qty done on the same row (Andy, 22 Oct) ---- */
(function(){
  const st = document.createElement('style');
  st.textContent = `#finAppLines .finitem{display:flex;align-items:center;gap:12px;padding:7px 2px !important;}
#finAppLines .finitem-d{flex:1 1 auto;min-width:0;font-size:14px !important;line-height:1.3 !important;}
#finAppLines .finitem-d em{font-size:12px !important;margin-top:1px !important;}
#finAppLines .finitem-in{flex:none;margin-top:0 !important;align-items:center;gap:8px !important;}
#finAppLines .finitem-in label{flex-direction:row;align-items:center;gap:5px !important;width:auto !important;font-size:11.5px !important;white-space:nowrap;}
#finAppLines .finitem-in input{width:64px;height:30px !important;min-height:30px !important;padding:0 8px !important;font-size:13.5px !important;border-radius:7px !important;margin:0 !important;}
#finAppLines .finitem-in .finitem-sum{padding-bottom:0;font-size:12px;min-width:64px;}
#finAppLines .finitem-in b{padding-bottom:0;font-size:14px !important;min-width:92px;text-align:right;}
#finAppLines .finapphead{padding:9px 14px !important;margin-top:8px;border-radius:9px;}
#finAppLines .finapphead b{font-size:13px;}
#finAppLines .finappfill{margin:2px 0 0 !important;padding:0 !important;font-size:12px;}
#finAppLines .finappfill .linkbtn{font-size:12px !important;padding:2px 4px !important;}
@media (max-width:700px){ #finAppLines .finitem{flex-wrap:wrap;} #finAppLines .finitem-in{width:100%;justify-content:flex-end;} }`;
  document.head.appendChild(st);
})();

/* ---- 19. Smaller buttons across Finance pages (Andy, 22 Oct). Pop-ups keep their
   full-width buttons; on the page itself buttons size to their words. ---- */
(function(){
  const st = document.createElement('style');
  st.textContent = `html.finmode .scrollarea .darkbtn, html.finmode .scrollarea .ghostbtn, html.finmode .scrollarea .primarybtn{
  width:auto !important;flex:0 0 auto !important;min-width:0 !important;min-height:30px !important;height:30px !important;
  padding:0 12px !important;font-size:12.5px !important;font-weight:700 !important;border-radius:7px !important;margin-top:0;line-height:1;white-space:nowrap;}
html.finmode .scrollarea label.ghostbtn{display:inline-flex !important;align-items:center;}
html.finmode .scrollarea .row-gap{justify-content:flex-start;gap:8px !important;}
html.finmode .finprojbar .finprojbar-n{height:34px !important;min-height:34px !important;padding:0 30px 0 14px !important;font-size:13px !important;width:auto !important;flex:0 0 auto !important;border-radius:8px !important;}
@media (max-width:600px){ html.finmode .scrollarea .row-gap .darkbtn, html.finmode .scrollarea .row-gap .ghostbtn{flex:1 1 auto !important;} }`;
  document.head.appendChild(st);
})();

// Open the job's Sales tab on a given sub-tab (apps / invoices / retention).
window.finSalesGo = function(siteId, sub){
  if(typeof finSalesSub!=='undefined') finSalesSub[siteId] = sub;
  finProjTabGo(siteId, 'sales');
  if(typeof finSalesSubGo==='function' && document.querySelector('.finsalestabs button[data-s="'+sub+'"]')) finSalesSubGo(siteId, sub);
};

/* ---------- Client's default VAT code goes on their new invoices (Andy, 22 Oct) ---------- */
(function(){
  const map = {'20':'20','5':'5','rc20':'rc20','rc5':'rc5','0':'0','ex':'ex','none':'ex'};
  const base = renderFinInvoiceDraft;
  renderFinInvoiceDraft = function(site, inv, pos){
    const fresh = !finInvDraft || finInvDraft.id!==inv.id;
    if(fresh && FIN_CLIENTS){
      const c = finClientByName(inv.bill_name || site.client_name);
      const code = c && map[c.sales_vat];
      if(code && FIN_INV_VAT[code]){
        finInvDraft = JSON.parse(JSON.stringify(inv));
        if(!Array.isArray(finInvDraft.lines) || !finInvDraft.lines.length) finInvDraft.lines = [{description:'', amount:null}];
        const dflt = finInvVatFromTreatment(finInvDraft.vat_treatment, finInvDraft.vat_rate);
        finInvDraft.lines.forEach(l=>{ if(!l.vat || l.vat===dflt) l.vat = code; });
      }
    }
    return base.apply(this, arguments);
  };
  // make sure clients are loaded before a draft invoice draws
  const rfi = renderFinInvoice;
  renderFinInvoice = async function(){ if(typeof finClientsLoad==='function') await finClientsLoad(); return rfi.apply(this, arguments); };
})();

/* ===== Phone fixes, 23 Oct 2026 (Andy testing on his phone) ===== */
/* phone fix 1 (23 Oct) */
(function(){ const st = document.createElement('style'); st.textContent = `@media (max-width:700px){
  .fgfoot{flex-wrap:wrap;gap:6px 10px;}
  .fgfoot-ctl{order:5;flex:1 1 calc(100% - 96px);min-width:0;margin-left:0 !important;gap:6px;}
  .fgfoot-ctl select{flex:1 1 0;min-width:0;width:0 !important;padding:0 18px 0 6px !important;font-size:11.5px !important;}
  .fgfoot .fgcolbtn{order:6;flex:none;margin-left:0 !important;padding:5px 8px;}
}`; document.head.appendChild(st); })();

/* phone fix 2 (23 Oct) */
(function(){ const st = document.createElement('style'); st.textContent = `@media (max-width:700px){
  .fggrid tbody tr{display:flex !important;flex-wrap:wrap;align-items:center;column-gap:10px;padding:8px 12px !important;}
  .fggrid tbody td{flex:1 1 100%;width:auto !important;max-width:none !important;min-width:0 !important;padding:2px 0 !important;font-size:13px !important;justify-content:space-between !important;text-align:right !important;}
  .fggrid tbody td::before{font-size:12px !important;}
  .fggrid td[data-l="Job"]{flex:0 0 auto !important;order:-3;padding:0 0 6px !important;margin:0 !important;}
  .fggrid td[data-l="Project"]{flex:1 1 0 !important;order:-2;justify-content:flex-start !important;text-align:left !important;padding:0 0 6px !important;font-size:14px !important;}
  .fggrid td[data-l="Project"]::before{content:none !important;}
  .fggrid td[data-l="Job"], .fggrid td[data-l="Project"]{border-bottom:1px solid #eef0f3 !important;}
  .fggrid td[data-l="Status"]{padding-top:2px !important;}
  .fggrid .fgjob{padding:4px 9px !important;font-size:11px !important;border-radius:7px !important;}
}`; document.head.appendChild(st); })();

/* phone fix 3 (23 Oct) */
(function(){ const st = document.createElement('style'); st.textContent = `html.finmode .finsecnav, html.finmode .finsubtabs{overflow-y:hidden !important;overscroll-behavior-x:contain;}
html.finmode .finsecnav button, html.finmode .finsubtabs button{line-height:1.2 !important;}`; document.head.appendChild(st); })();

/* phone fix 5 (23 Oct) */
(function(){ const st = document.createElement('style'); st.textContent = `@media (max-width:600px){
  .finprojbar{flex-wrap:nowrap !important;align-items:center;}
  .finprojbar .finprojbar-p{display:none !important;}
  html.finmode .finprojbar .finprojbar-n{flex:0 0 auto !important;margin-left:auto !important;width:auto !important;min-width:110px;max-width:140px;}
}`; document.head.appendChild(st); })();

/* phone fix 8 (23 Oct) */
(function(){ const st = document.createElement('style'); st.textContent = `@media (max-width:700px){
  #finAppLines .finitem-in{width:100%;justify-content:flex-start !important;flex-wrap:wrap;gap:6px 8px !important;}
  #finAppLines .finitem-in label{font-size:11px !important;}
  #finAppLines .finitem-in input, .fincertin input{width:54px !important;padding:0 6px !important;}
  #finAppLines .finitem-in .finitem-sum{display:none;}
  #finAppLines .finitem-in b{margin-left:auto;min-width:0 !important;}
  .fincertg, .finappliedg{min-width:0 !important;}
  .fincertmode #finAppLines .finitem-in .finitem-sum, .fincertshow #finAppLines .finitem-in .finitem-sum{display:block;flex-basis:100%;}
}`; document.head.appendChild(st); })();

/* phone fix 10 (23 Oct) */
(function(){ const st = document.createElement('style'); st.textContent = `.finappflow{margin-top:16px !important;}
#finCertSlot + .finappflow{margin-top:16px !important;}
.finappbtns{margin-bottom:4px;}`; document.head.appendChild(st); })();

/* phone fix 12 (23 Oct) */
(function(){ const st = document.createElement('style'); st.textContent = `@media (max-width:700px){
  .fincs-r{grid-template-columns:minmax(0,1fr) 84px 84px !important;gap:6px !important;font-size:12.5px !important;}
  .fincs-r.big{font-size:14px !important;}
  .fincs-r > b{font-size:12.5px;overflow-wrap:anywhere;}
  .fincs-r .finpctin{width:64px !important;}
  .fincertin{font-size:10.5px !important;}
  #finAppLines .finitem{flex-wrap:wrap;}
  #finAppLines .finitem-d{flex-basis:100% !important;}
}`; document.head.appendChild(st); })();

/* phone fix 4 (23 Oct): Live / Upcoming / Closed / All on phones (column filters are hidden there) */
(function(){ const st = document.createElement('style'); st.textContent = `.fgstat-m{display:none;} @media (max-width:700px){ .fgstat-m{display:block;} .fgcol-t{display:none;} }`; document.head.appendChild(st); })();
