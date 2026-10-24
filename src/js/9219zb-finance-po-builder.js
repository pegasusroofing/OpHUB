/* ============================================================
   OpHUB Finance — New purchase order, reworked (23 Oct 2026, Andy):
   - opens as a side screen (like the drawings viewer), with compact rows;
   - Job on each line (defaults to this job; the PO itself shows the first line's job only,
     other lines' costs are split to their own jobs);
   - Discount % column; cost codes show their number (e.g. 310 – Materials);
   - Site contact: pick the PM, an assigned operative or an admin (or type any name), with a
     contact number — a number is required when there's a contact. It goes on the PO.
   - columns other than Job and Description are centred.
   ============================================================ */
let finNpoPeople = [];
function finNpoCodeOpts(l){
  const codes = (typeof FIN_CODES!=='undefined' && FIN_CODES ? FIN_CODES : []).filter(c=>c.active!==false && c.category!=='labour');
  if(!codes.length) return Object.keys(FIN_COST_CATS).filter(k=>k!=='labour').map(k=>`<option value="${k}" ${(l.cost_code||'materials')===k?'selected':''}>${escapeHtml(FIN_COST_CATS[k])}</option>`).join('');
  const cur = l.cost_code_id || '';
  const sorted = codes.slice().sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''), undefined, {numeric:true}));
  return (cur ? '' : `<option value="" selected>${escapeHtml(FIN_COST_CATS[l.cost_code||'materials']||'Choose…')}</option>`) + sorted.map(c=>`<option value="cc:${c.id}" ${cur===c.id?'selected':''}>${escapeHtml((c.code ? c.code+' – ' : '')+c.name)}</option>`).join('');
}
function finNpoJobOpts(sel){
  const live = SITES.filter(s=>typeof finSiteStatus!=='function' || finSiteStatus(s)!=='closed' || s.id===sel).slice().sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
  return live.map(s=>`<option value="${s.id}" ${s.id===sel?'selected':''}>${escapeHtml(s.job_number || s.name || '')}</option>`).join('');
}
function finNpoLineCalc(l){
  const gross = Number(l.qty||0) * Number(l.rate||0), d = Math.max(0, Math.min(100, Number(l.disc||0)));
  l.amount = finRound(gross * (1 - d/100));
}
finNpoPaint = function(){
  const box = document.getElementById('finNpoLines'); if(!box || !finNewPo) return;
  const codes = (typeof FIN_CODES!=='undefined' && FIN_CODES ? FIN_CODES : []).filter(c=>c.active!==false).sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''), undefined, {numeric:true}));
  finNewPo.lines.forEach(l=>{ if(!l.site_id) l.site_id = finNewPo.siteId; if(l.disc==null) l.disc = 0;
    if(!l.cost_code_id && codes.length){ const c = codes.find(x=>x.category===(l.cost_code||'materials')); if(c) l.cost_code_id = c.id; }   // default to the numbered code for that type
    finNpoLineCalc(l); });
  box.innerHTML = finNewPo.lines.map((l,i)=>`<div class="finb-row finpo-row">
    <label class="finpo-job"><span>Job</span><select onchange="finNpoSet(${i},'site_id',this.value)">${finNpoJobOpts(l.site_id)}</select></label>
    <label class="finb-d"><span>Description</span><input type="text" placeholder="Description" value="${escapeHtml(l.description||'')}" oninput="finNpoSet(${i},'description',this.value)"></label>
    <label><span>Qty</span><input type="text" inputmode="decimal" value="${l.qty!=null?l.qty:''}" oninput="finNpoSet(${i},'qty',this.value)"></label>
    <label><span>Unit</span><input type="text" value="${escapeHtml(l.unit||'')}" placeholder="nr" oninput="finNpoSet(${i},'unit',this.value)"></label>
    <label><span>Rate</span><input type="text" inputmode="decimal" data-money value="${l.rate!=null?l.rate:''}" placeholder="£" oninput="finNpoSet(${i},'rate',this.value)"></label>
    <label><span>Disc %</span><input type="text" inputmode="decimal" value="${Number(l.disc||0) ? l.disc : ''}" placeholder="0" oninput="finNpoSet(${i},'disc',this.value)"></label>
    <label><span>Cost code</span><select onchange="finNpoSet(${i},'cost_code',this.value)">${finNpoCodeOpts(l)}</select></label>
    <label><span>VAT</span><select onchange="finNpoSet(${i},'vat',this.value)">${(typeof finVatKeysWith==='function' ? finVatKeysWith(FIN_VAT_RATES, l.vat||'20') : Object.keys(FIN_VAT_RATES)).map(k=>`<option value="${k}" ${(l.vat||'20')===k?'selected':''}>${FIN_VAT_RATES[k].s}</option>`).join('')}</select></label>
    <b class="finb-net" id="finNpoL-${i}">${finMoney(l.amount)}</b>
    ${finNewPo.lines.length>1 ? `<button class="linkbtn finb-del" aria-label="Remove line" onclick="finNpoDel(${i})">✕</button>` : '<span></span>'}
  </div>`).join('');
  finNpoTotal();
};
window.finNpoSet = function(i, k, v){
  const l = finNewPo.lines[i]; if(!l) return;
  if(k==='qty' || k==='rate' || k==='disc'){ const n = finNum(v); l[k] = (n===null || isNaN(n)) ? (k==='disc' ? 0 : null) : n; }
  else if(k==='cost_code'){
    if(String(v).startsWith('cc:')){ const c = (FIN_CODES||[]).find(x=>x.id===v.slice(3)); l.cost_code_id = c ? c.id : null; l.cost_code = c && FIN_COST_CATS[c.category] ? c.category : 'materials'; }
    else { l.cost_code_id = null; l.cost_code = v || 'materials'; }
  }
  else l[k] = v;
  finNpoLineCalc(l);
  const el = document.getElementById('finNpoL-'+i); if(el) el.textContent = finMoney(l.amount);
  finNpoTotal();
};
window.finNpoAdd = function(){ finNewPo.lines.push({site_id:finNewPo.siteId, description:'', qty:1, unit:'', rate:null, disc:0, amount:0, cost_code:'materials', vat:finNewPo.vat||'20'}); finNpoPaint(); };

// site contact: PM, assigned operatives, admins — or any name typed
async function finNpoPeopleLoad(siteId){
  await loadAllProfiles().catch(()=>{});
  const site = SITES.find(s=>s.id===siteId) || {};
  const asg = await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id').catch(()=>[]);
  const out = [], seen = new Set();
  const add = (p, tag)=>{ if(!p || seen.has(p.id) || p.active===false) return; seen.add(p.id); out.push({name:p.name||p.email||'', phone:p.phone||'', tag}); };
  if(site.responsible_pm_id) add(PROFILES[site.responsible_pm_id], 'PM');
  asg.forEach(a=>{ const p = PROFILES[a.user_id]; if(p) add(p, isManager(p) ? 'PM' : 'Operative'); });
  Object.values(PROFILES||{}).filter(p=>p && p.org_id===ME.org_id && p.role==='admin').forEach(p=>add(p, 'Admin'));
  finNpoPeople = out;
  const dl = document.getElementById('finNpoPeopleList');
  if(dl) dl.innerHTML = out.map(p=>`<option value="${escapeHtml(p.name)}">${escapeHtml(p.tag+(p.phone?' · '+p.phone:''))}</option>`).join('');
}
window.finNpoContactPicked = function(v){
  const p = finNpoPeople.find(x=>x.name.toLowerCase()===String(v||'').trim().toLowerCase());
  const ph = document.getElementById('finNpoContactPh');
  if(p && p.phone && ph && !ph.value.trim()) ph.value = p.phone;
};

(function(){
  const base = window.openFinNewPo;
  window.openFinNewPo = async function(siteId){
    await Promise.all([base.apply(this, arguments), typeof finCodesLoad==='function' ? finCodesLoad() : null]);
    const ov = document.getElementById('finNpoOverlay'); if(!ov || typeof finNewPo==='undefined' || !finNewPo) return;
    ov.classList.add('finpo-drawer');
    finNewPo.lines.forEach(l=>{ l.site_id = l.site_id || siteId; l.disc = l.disc || 0; });
    const th = ov.querySelector('.finb-th');
    if(th){ th.classList.add('finpo-row'); th.innerHTML = '<span>Job</span><span>Description</span><span>Qty</span><span>Unit</span><span>Rate</span><span>Disc %</span><span>Cost Code</span><span>VAT</span><span class="r">Net</span><span></span>'; }
    const supF = document.getElementById('finNpoSup'); const after = document.getElementById('finNpoNewSup') || (supF && supF.closest('.formfield'));
    if(after && !document.getElementById('finNpoContact')){
      after.insertAdjacentHTML('afterend', `<div class="fingrid2 finpo-contact">
        <div class="formfield"><label class="field-label">Site contact</label><input type="text" id="finNpoContact" list="finNpoPeopleList" placeholder="Start typing a name" autocomplete="off" oninput="finNpoContactPicked(this.value)" onchange="finNpoContactPicked(this.value)"><datalist id="finNpoPeopleList"></datalist></div>
        <div class="formfield"><label class="field-label">Contact number</label><input type="tel" id="finNpoContactPh" placeholder="07…"></div>
      </div>`);
    }
    finNpoPeopleLoad(siteId);
    finNpoPaint();
  };
})();

// Supplier from the purchase quote: pick it if we know them, otherwise set up a new supplier with that name.
(function(){
  const base = window.finPqRaisePo;
  if(!base) return;
  window.finPqRaisePo = async function(siteId){
    const sel = finPqSel[siteId]; const ids = sel ? Array.from(sel) : [];
    let supName = '';
    if(ids.length){ const it = (await dbSelect('fin_quote_items', 'id=in.('+ids.join(',')+')&select=supplier_name,quote_id').catch(()=>[])); supName = (it.find(x=>x.supplier_name)||{}).supplier_name || '';
      if(!supName && it[0]){ const q = (await dbSelect('fin_quotes', 'id=eq.'+it[0].quote_id+'&select=supplier_name').catch(()=>[]))[0]; supName = q && q.supplier_name || ''; } }
    await base.apply(this, arguments);
    const s = document.getElementById('finNpoSup'); if(!s || !supName || s.value) return;
    const low = supName.trim().toLowerCase();
    const o = Array.from(s.options).find(o=>o.value && o.value!=='__new' && (o.text.toLowerCase()===low || o.text.toLowerCase().includes(low) || low.includes(o.text.toLowerCase())));
    if(o){ s.value = o.value; finNpoSupPicked(o.value); }
    else { s.value = '__new'; finNpoSupPicked('__new'); const n = document.getElementById('finNpoSupName'); if(n) n.value = supName; toast(`${supName} isn't in your suppliers yet — add their orders email, then Raise PO`); }
  };
})();

window.saveFinNewPo = async function(){
  const n = finNewPo; if(!n) return;
  let supId = finVal('finNpoSup'), supName = '';
  if(!supId){ toast('Choose the supplier.'); return; }
  const contact = finVal('finNpoContact'), phone = finVal('finNpoContactPh');
  if(contact && !phone){ toast('Add a contact number for '+contact+'.'); const el = document.getElementById('finNpoContactPh'); if(el) el.focus(); return; }
  if(supId==='__new'){
    supName = finVal('finNpoSupName'); const email = finVal('finNpoSupEmail');
    if(!supName){ toast('Enter the supplier’s name.'); return; }
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Check the supplier’s email.'); return; }
    const made = await dbInsert('suppliers', {org_id:ME.org_id, name:supName, email:email||null, created_by:ME.id});
    supId = made && made[0] ? made[0].id : null;
    if(!supId){ toast('Could not add the supplier.'); return; }
  } else { const s = n.suppliers.find(x=>x.id===supId); supName = s ? s.name : ''; }
  const lines = n.lines.filter(l=>String(l.description||'').trim());
  if(!lines.length){ toast('Add at least one item.'); return; }
  lines.forEach(finNpoLineCalc);
  const items = lines.map(l=>{ const d = Number(l.disc||0); const net = l.rate!=null ? finRound4(Number(l.rate)*(1-d/100)) : null;
    return {item:l.description.trim(), qty:l.qty, unit:l.unit||null, rate:net, list_rate:d ? l.rate : undefined, discount_pct:d || undefined, amount:finRound(l.amount), cost_code:l.cost_code||'materials', cost_code_id:l.cost_code_id||undefined, site_id:l.site_id||n.siteId, vat_rate:l.vat||'20', vat:finVatOf(l), shop_item_id:l.shop_item_id||undefined}; });
  const poSite = lines[0].site_id || n.siteId;   // the PO shows the first line's job only
  const note = [contact ? `Site contact: ${contact} – ${phone}` : '', finVal('finNpoNote')].filter(Boolean).join('\n');
  const btn = document.getElementById('finNpoSave'); if(btn){ btn.disabled = true; btn.textContent = 'Raising…'; }
  const res = await sbFetch('/rest/v1/rpc/fin_new_po', {method:'POST', body:JSON.stringify({p_site:poSite, p_supplier_id:supId||null, p_supplier_name:supName, p_items:items, p_required:finVal('finNpoReq')||null, p_note:note||null, p_delivery:finVal('finNpoDel')||'delivery'})});
  if(btn){ btn.disabled = false; btn.textContent = 'Raise PO'; }
  if(!res.ok){ toast('Could not raise the PO — '+(await safeErr(res))); return; }
  const d = await res.json();
  // FB-17: the plot picker lists the plots of the job the builder was opened from. If the PO has
  // ended up on another job (line 1's job was changed), that plot doesn't belong to it — drop it.
  const sub = poSite===n.siteId ? finVal('finNpoSub') : '';
  const vatTot = finRound(items.reduce((t,x)=>t+Number(x.vat||0),0)), netTot = finRound(items.reduce((t,x)=>t+Number(x.amount||0),0));
  // lines for other jobs: their cost goes to those jobs (split by value)
  const bySite = {}; items.forEach(x=>{ bySite[x.site_id] = (bySite[x.site_id]||0) + Number(x.amount||0); });
  const sites = Object.keys(bySite);
  let split = null;
  if(sites.length > 1){ const tot = netTot || 1; split = sites.map(s=>({site_id:s, pct:finRound(bySite[s]/tot*100)})); const diff = finRound(100 - split.reduce((t,e)=>t+e.pct,0)); split[0].pct = finRound(split[0].pct + diff); }
  if(d && d.id) await dbUpdate('purchase_orders', d.id, Object.assign({vat:vatTot, total:finRound(netTot+vatTot), reference:finVal('finNpoRef')||null, issue_date:finToday(), site_contact:contact||null, site_contact_phone:phone||null},
    sub ? {sub_job_id:sub} : {}, split ? {split, split_sites:sites.filter(s=>s!==poSite)} : {}));
  document.getElementById('finNpoOverlay').style.display = 'none';
  finNewPo = null;
  toast('PO '+d.number+' raised'+(split ? ' — costs split across '+sites.length+' jobs' : ''));
  go('#/site/'+poSite+'/finance/po/'+d.id);
};

(function(){
  const st = document.createElement('style');
  st.textContent = `#finNpoOverlay.finpo-drawer{justify-content:flex-end !important;align-items:stretch !important;padding:0 !important;}
#finNpoOverlay.finpo-drawer .geo-modal-card.finbuilder{width:min(1240px, 94vw) !important;max-width:none !important;height:100dvh;max-height:100dvh !important;margin:0 !important;border-radius:16px 0 0 16px !important;animation:finpoIn .18s ease-out;padding:16px 18px !important;}
@keyframes finpoIn{from{transform:translateX(40px);opacity:.6;}to{transform:none;opacity:1;}}
.finpo-drawer .finb-grid{grid-template-columns:minmax(0,1fr) 300px !important;gap:16px !important;}
.finpo-row{grid-template-columns:96px minmax(150px,1fr) 52px 58px 78px 56px 150px 76px 78px 20px !important;gap:6px !important;}
.finb-th.finpo-row{font-size:10.5px;}
.finb-th.finpo-row > span:not(:nth-child(1)):not(:nth-child(2)){text-align:center;}
.finb-row.finpo-row{padding:4px 0 !important;}
.finpo-row input, .finpo-row select{height:30px !important;min-height:30px !important;padding:0 6px !important;font-size:13px !important;border-radius:7px !important;}
.finpo-row label:not(.finb-d):not(.finpo-job) input{text-align:center;}
.finpo-row label:not(.finb-d):not(.finpo-job) select{text-align:center;text-align-last:center;}
.finpo-row .finb-net{text-align:center !important;font-size:13.5px;}
.finpo-drawer .finb-side .formfield{margin-bottom:8px;}
.finpo-drawer .finb-side input, .finpo-drawer .finb-side select{height:34px !important;min-height:34px !important;font-size:13.5px !important;padding:0 10px !important;}
.finpo-drawer .finb-side textarea{font-size:13.5px !important;}
.finpo-contact{gap:8px !important;}
@media (max-width:900px){ .finpo-drawer .finb-grid{grid-template-columns:1fr !important;} .finpo-row{grid-template-columns:1fr 1fr 1fr !important;} .finpo-row .finb-d, .finpo-row .finpo-job{grid-column:1/-1;} .finpo-row label > span{display:block !important;} .finb-th.finpo-row{display:none !important;} #finNpoOverlay.finpo-drawer .geo-modal-card.finbuilder{width:100vw !important;border-radius:0 !important;} }`;
  document.head.appendChild(st);
})();
