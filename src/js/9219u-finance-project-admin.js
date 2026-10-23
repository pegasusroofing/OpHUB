/* ============================================================
   OpHUB Finance — Project Admin laid out like Construction Manager (23 Oct 2026, Andy):
   one "Project Details" section — Job No, Customer, Start Date, Contract Value,
   Client PO & PO Number, Project Manager, QS — then a "Contract Terms" sub-section for
   retention, application dates, VAT and paid by. Bill to isn't shown (it lives on the
   client in the Directory). QS is saved on job_finance.qs_id.
   ============================================================ */
if(typeof FIN_SET_ICONS!=='undefined') Object.assign(FIN_SET_ICONS, {'project details':['🏗','#fdecec','#c62828'], 'contract terms':['📄','#eef4ff','#1f4f99']});
function finQsOptions(cur){
  const ps = Object.values(PROFILES||{}).filter(p=>p.org_id===ME.org_id && p.active!==false && (isFullManager(p) || p.finance_enabled)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  return `<option value="">None yet</option>${ps.map(p=>`<option value="${p.id}" ${cur===p.id?'selected':''}>${escapeHtml(p.name||'')}</option>`).join('')}`;
}
function finPaRestructure(){
  const root = document.querySelector('.finptab[data-t="setup"]'); if(!root || root.dataset.pa) return;
  const siteId = (parseRoute()||[])[1]; if(!siteId) return;
  root.dataset.pa = '1';
  const cards = Array.from(root.querySelectorAll(':scope > .card'));
  const titleOf = c=>{ const t = c.querySelector('.sectiontitle'); return t ? t.textContent.trim().toLowerCase() : ''; };
  const poCard = cards.find(c=>titleOf(c).startsWith('client purchase orders'));
  const jobCard = cards.find(c=>titleOf(c)==='project');
  const detCard = cards.find(c=>titleOf(c)==='project details');
  const billCard = cards.find(c=>c.querySelector('#finBillName'));
  if(!detCard) return;
  const ff = id=>{ const el = document.getElementById(id); return el ? el.closest('.formfield') : null; };
  const lab = (f, t)=>{ const l = f && f.querySelector('.field-label'); if(l) l.textContent = t; return f; };
  // ---- Project Details ----
  const pd = document.createElement('div'); pd.className = 'card finpd';
  pd.innerHTML = '<p class="sectiontitle" style="margin:0;">Project Details</p><div class="finpd-g"></div>';
  const g = pd.querySelector('.finpd-g');
  const put = f=>{ if(f) g.appendChild(f); };
  put(lab(ff('finJobNo'), 'Job No'));
  put(lab(ff('finJeName'), 'Project Name'));
  put(lab(ff('finJeClient'), 'Customer'));
  put(lab(ff('finJeStart'), 'Start Date'));
  put(lab(ff('finContract'), 'Contract Value (£, excl. VAT)'));
  put(lab(ff('finJePm'), 'Project Manager'));
  const qs = document.createElement('div'); qs.className = 'formfield';
  qs.innerHTML = `<label class="field-label">QS</label><select id="finJeQs">${finQsOptions('')}</select>`; g.appendChild(qs);
  put(lab(ff('finJeStatus'), 'Status'));
  put(lab(ff('finJeAddr'), 'Site Address'));
  put(lab(ff('finJePc'), 'Postcode'));
  // Client PO & PO Number
  if(poCard){
    const po = document.createElement('div'); po.className = 'formfield finpd-po';
    const add = poCard.querySelector('button[onclick^="openClientPoForm"]');
    po.innerHTML = '<label class="field-label">Client PO &amp; PO Number</label><div class="finpd-polist"></div>';
    const list = po.querySelector('.finpd-polist');
    poCard.querySelectorAll('.finpo, .empty').forEach(x=>{ if(x.classList.contains('empty')) x.textContent = 'No client PO yet.'; list.appendChild(x); });
    const tot = Array.from(poCard.querySelectorAll('p.stub')).find(p=>/Total of POs/.test(p.textContent)); if(tot) list.appendChild(tot);
    if(add){ add.textContent = '+ Add PO'; add.style.marginTop = '6px'; list.appendChild(add); }
    g.appendChild(po);
    poCard.remove();
  }
  const del = jobCard && jobCard.querySelector('button[onclick^="finDeleteJob"]');
  if(del) pd.appendChild(del);
  if(jobCard) jobCard.remove();
  // ---- Contract Terms (what's left of the old details card) ----
  const t = detCard.querySelector('.sectiontitle'); if(t) t.textContent = 'Contract Terms';
  detCard.classList.add('finterms');
  if(billCard) billCard.style.display = 'none';
  root.prepend(pd);
  // QS value
  dbSelect('job_finance', 'site_id=eq.'+siteId+'&select=qs_id').then(r=>{ const s = document.getElementById('finJeQs'); if(s && r[0] && r[0].qs_id){ s.innerHTML = finQsOptions(r[0].qs_id); s.dataset.was = r[0].qs_id; } }).catch(()=>{});
}
(function(){
  const base = finAfterProjectRender;
  finAfterProjectRender = function(){ try{ finPaRestructure(); }catch(e){ console.error(e); } return base.apply(this, arguments); };
  const save = window.saveSiteFinance;
  window.saveSiteFinance = async function(siteId){
    const s = document.getElementById('finJeQs');
    if(s && (s.value||'') !== (s.dataset.was||'')){
      const res = await sbFetch('/rest/v1/job_finance', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({site_id:siteId, org_id:ME.org_id, qs_id:s.value||null, updated_at:new Date().toISOString(), updated_by:ME.id})});
      if(!res.ok){ toast('Could not save the QS — '+(await safeErr(res))); return; }
      s.dataset.was = s.value||'';
    }
    return save.apply(this, arguments);
  };
  const st = document.createElement('style');
  st.textContent = `.finpd-g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 14px;margin-top:4px;}
.finpd-g .formfield{margin:0 !important;min-width:0;}
.finpd-g .field-label{font-size:11.5px !important;margin-bottom:3px;}
.finpd-g input, .finpd-g select, .finterms .fingrid2 input, .finterms .fingrid2 select{height:36px !important;min-height:36px !important;font-size:13.5px !important;padding-top:0 !important;padding-bottom:0 !important;line-height:34px !important;box-sizing:border-box;}
.finterms .fingrid2{grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:10px 14px !important;}
.finterms .fingrid2 .formfield{margin:0 !important;} .finterms .field-label{font-size:11.5px !important;margin-bottom:3px;}
.finterms .fingrid2 > details{grid-column:1 / -1;}
@media (max-width:1000px){ .finterms .fingrid2{grid-template-columns:repeat(2,minmax(0,1fr)) !important;} }
.finpd-g .finpd-po{grid-column:1 / -1;}
.finpd-polist{border:1px solid var(--line);border-radius:10px;padding:6px 10px;background:#FAFBFC;}
.finpd-polist .finpo{padding:6px 0;}
.finpd-polist .ghostbtn{width:auto !important;padding:5px 12px !important;font-size:12.5px !important;}
.finpd > .linkbtn{margin-top:10px;}
@media (max-width:1000px){ .finpd-g{grid-template-columns:repeat(2,minmax(0,1fr));} }
@media (max-width:560px){ .finpd-g{grid-template-columns:1fr;} }`;
  document.head.appendChild(st);
})();
