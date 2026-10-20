/* ============================================================
   OpHUB Finance — document switcher on every project page (Andy, 20 Oct:
   "change the document type without having to go back multiple pages").
   A bar at the top of every project Finance page: the project, a
   "Go to" list of its document types, and "+ New" for each kind.
   Added automatically by shell() (finShellPrefix) for #/site/<id>/finance… pages.
   ============================================================ */
const FIN_DOC_TYPES = [
  {k:'overview', l:'Project finance', go:id=>`#/site/${id}/finance`},
  {k:'apps', l:'Applications', anchor:'fin-a-apps'},
  {k:'invoices', l:'Sales invoices', anchor:'fin-a-invoices'},
  {k:'variations', l:'Variations', go:id=>`#/site/${id}/finance/variations`},
  {k:'pos', l:'Purchase orders', anchor:'fin-a-purchasing'},
  {k:'pinvs', l:'Supplier invoices', anchor:'fin-a-purchasing'},
  {k:'shopping', l:'Shopping list', go:id=>`#/site/${id}/finance/shopping`},
  {k:'subs', l:'Subcontractors', anchor:'finScSlot'},
  {k:'costs', l:'All costs', go:id=>`#/site/${id}/finance/costs`},
  {k:'parts', l:id=>finSubKind(id)==='repair' ? 'Costs by repair job' : 'Costs by plot', go:id=>`#/site/${id}/finance/parts`, when:id=>!!finSubKind(id)},
  {k:'budget', l:'Budget & forecast', go:id=>`#/site/${id}/finance/budget`},
  {k:'contract', l:'Priced schedule of works', go:id=>`#/site/${id}/finance/contract`},
];
const FIN_NEW_TYPES = [
  {l:'Application', fn:'newFinApplication'},
  {l:'Sales invoice', fn:'newFinInvoice'},
  {l:'Variation', fn:'openFinVariation'},
  {l:'Purchase order', fn:'openFinNewPo'},
  {l:'Supplier invoice', fn:'openPurchaseInvoiceForm'},
  {l:'Subcontract order', fn:'openFinSubcontract'},
  {l:'Plant hire', fn:'openFinPlantForm'},
  {l:'Cost', fn:'openFinJobCost'},
];
function finCurrentDocType(parts){
  const p = parts[3] || '';
  return {invoice:'invoices', application:'apps', po:'pos', sub:'subs', costs:'costs', parts:'parts', budget:'budget', variations:'variations', shopping:'shopping', contract:'contract'}[p] || 'overview';
}
function finShellPrefix(opts){
  if(typeof isFinanceUser!=='function' || !isFinanceUser()) return '';
  const parts = typeof parseRoute==='function' ? parseRoute() : [];
  if(parts[0]!=='site' || parts[2]!=='finance' || !parts[1]) return '';
  const id = parts[1], s = SITES.find(x=>x.id===id); if(!s) return '';
  const cur = finCurrentDocType(parts);
  return `<div class="finprojbar">
    <button type="button" class="finprojbar-p" onclick="go('#/site/${id}/finance')" title="Project finance"><b>${escapeHtml(s.job_number||'')}</b> ${escapeHtml(s.name||'')}</button>
    <select class="finprojbar-s" aria-label="Go to" onchange="finDocGo('${id}', this.value)">
      ${FIN_DOC_TYPES.filter(t=>!t.when || t.when(id)).map(t=>`<option value="${t.k}" ${t.k===cur?'selected':''}>${typeof t.l==='function' ? t.l(id) : t.l}</option>`).join('')}
    </select>
    <select class="finprojbar-n" aria-label="New" onchange="finDocNew('${id}', this.value);this.value=''">
      <option value="">+ New</option>${FIN_NEW_TYPES.map((t,i)=>`<option value="${i}">${t.l}</option>`).join('')}
    </select>
  </div>`;
}
window.finDocGo = function(siteId, k){
  const t = FIN_DOC_TYPES.find(x=>x.k===k); if(!t) return;
  if(t.go){ go(t.go(siteId)); return; }
  const onOverview = String(location.hash||'').replace(/\?.*$/,'') === '#/site/'+siteId+'/finance';
  if(onOverview){ finScrollToAnchor(t.anchor); return; }
  window.__finScrollTo = t.anchor; go('#/site/'+siteId+'/finance');
};
window.finDocNew = function(siteId, i){
  const t = FIN_NEW_TYPES[Number(i)]; if(!t || typeof window[t.fn]!=='function') return;
  window[t.fn](siteId);
};
function finScrollToAnchor(id){
  let tries = 0;
  const t = setInterval(()=>{ const el = document.getElementById(id); tries++; if(el){ clearInterval(t); el.scrollIntoView({behavior:'smooth', block:'start'}); el.classList.add('finflash'); setTimeout(()=>el.classList.remove('finflash'), 1400); } else if(tries>40) clearInterval(t); }, 100);
}
// Called after the project Finance page renders.
function finAfterProjectRender(){ if(window.__finScrollTo){ const a = window.__finScrollTo; window.__finScrollTo = null; finScrollToAnchor(a); } }

/* ---------- who can see material costs (Finance › Settings) ---------- */
async function finCostsAccessFill(){
  const box = document.getElementById('finCostAccess'); if(!box) return;
  await loadAllProfiles(true);
  const people = Object.values(PROFILES).filter(p=>p.org_id===ME.org_id && !p.finance_enabled && ['pm','site_manager','operative','admin'].includes(p.role)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const canEdit = ME.role==='admin' && isFinanceUser();
  box.innerHTML = `<p class="sectiontitle" style="margin-top:0;">Who can see material costs</p>
    <p class="stub" style="margin:-4px 0 10px;">Prices on the project shopping lists (and in the Materials tile) are hidden from everyone except Finance users and the people switched on here.</p>
    ${people.map(p=>`<div class="finkv"><span>${escapeHtml(p.name)} <em class="stub" style="font-size:12px;">${escapeHtml(typeof personRoleLabel==='function'?personRoleLabel(p):p.role)}</em></span><b>${canEdit ? `<label class="finswitch" style="margin:0;"><input type="checkbox" ${p.see_costs?'checked':''} onchange="finSetSeeCosts('${p.id}', this.checked)"> ${p.see_costs?'Can see':'Hidden'}</label>` : (p.see_costs?'Can see':'Hidden')}</b></div>`).join('') || '<p class="stub">Nobody else in the team yet.</p>'}`;
}
window.finSetSeeCosts = async function(userId, on){
  const r = await dbUpdate('profiles', userId, {see_costs:!!on});
  if(!r || r.see_costs !== !!on){ toast('Only an admin with Finance can change this.'); return; }
  if(PROFILES[userId]) PROFILES[userId].see_costs = !!on;
  toast(on ? 'They can now see material costs' : 'Material costs hidden from them'); finCostsAccessFill();
};
