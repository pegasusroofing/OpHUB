/* ============================================================
   OpHUB Finance › Directory (21 Oct 2026, Andy — like Coreloops' Directory).
   One place for everyone you deal with:
     Clients    fin_clients   (pull from / push to Xero)
     Suppliers  fin_suppliers (pull from Xero; linked to the materials
                supplier list where the name matches — Xero-only suppliers
                stay in Finance and don't clutter Material Requests)
     Labour     fin_labour_rates (CIS subbies + PAYE), plus anyone who
                filled in the sub-contractor sign-up form
   Each client / supplier opens one form with tabs: General, Payment terms,
   Tax, CIS. Cost codes live in Finance › Settings › Cost codes
   (fin_cost_codes; code = the Xero account code).
   ============================================================ */
FIN_SECTIONS.splice(FIN_SECTIONS.findIndex(s=>s.k==='settings'), 0, {k:'directory', l:'Directory', go:'#/finance/directory'});
FIN_SUBS.directory = [['clients','Clients','#/finance/directory/clients'], ['suppliers','Suppliers','#/finance/directory/suppliers'], ['labour','Labour (CIS)','#/finance/directory/labour']];
FIN_SUBS.jobs = FIN_SUBS.jobs.filter(t=>t[0]!=='clients');
FIN_SUBS.purchases = FIN_SUBS.purchases.filter(t=>t[0]!=='suppliers');
FIN_SUBS.subs = FIN_SUBS.subs.filter(t=>t[0]!=='rates');
FIN_SUBS.settings = [['general','Settings','#/finance/settings'], ['codes','Cost codes','#/finance/settings/codes']];

const FIN_DIR_VAT = {'20':'20% (VAT on income / expenses)', '5':'5% reduced rate', '0':'Zero rated', 'ex':'Exempt', 'rc20':'Reverse charge (20%)', 'rc5':'Reverse charge (5%)', 'none':'No VAT'};
const FIN_DIR_VAT_S = {'20':'20%', '5':'5%', '0':'0%', 'ex':'Exempt', 'rc20':'RC 20%', 'rc5':'RC 5%', 'none':'No VAT'};
const FIN_TERMS = {of_following_month:'of the following month', days_after_bill:'days after bill date', days_after_month:'days after bill month', of_current_month:'of the current month'};
const FIN_CIS_REG = {sole_trader:'Sole trader', partnership:'Partnership', company:'Limited company', trust:'Trust'};
const FIN_SUP_CATS = ['Materials', 'Plant & hire', 'Scaffolding', 'Waste', 'Subcontractor', 'Services', 'Travel', 'Other'];
let FIN_CODES = null;
async function finCodesLoad(force){
  if(FIN_CODES && !force) return FIN_CODES;
  FIN_CODES = await dbSelect('fin_cost_codes', 'org_id=eq.'+ME.org_id+'&order=name.asc').catch(()=>[]);
  return FIN_CODES;
}
function finCodeLabel(id){ const c = (FIN_CODES||[]).find(x=>x.id===id); return c ? (c.code ? c.code+' – ' : '')+c.name : ''; }
function finTermsText(r){
  if(!r || r.terms_days==null || !r.terms_type) return '';
  const d = Number(r.terms_days);
  if(r.terms_type==='of_following_month' || r.terms_type==='of_current_month'){ const sfx = (d%10===1&&d!==11)?'st':(d%10===2&&d!==12)?'nd':(d%10===3&&d!==13)?'rd':'th'; return d+sfx+' '+FIN_TERMS[r.terms_type]; }
  return d+' '+FIN_TERMS[r.terms_type];
}
// Due date from a bill date and saved terms (used by purchase invoices / sales).
function finDueFromTerms(dateStr, r){
  if(!dateStr || !r || r.terms_days==null || !r.terms_type) return null;
  const d = new Date(dateStr+'T12:00:00'); const n = Number(r.terms_days);
  const iso = x=>x.toISOString().slice(0,10);
  if(r.terms_type==='days_after_bill'){ d.setDate(d.getDate()+n); return iso(d); }
  if(r.terms_type==='days_after_month'){ const e = new Date(d.getFullYear(), d.getMonth()+1, 0, 12); e.setDate(e.getDate()+n); return iso(e); }
  if(r.terms_type==='of_current_month'){ const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); return iso(new Date(d.getFullYear(), d.getMonth(), Math.min(n, last), 12)); }
  if(r.terms_type==='of_following_month'){ const last = new Date(d.getFullYear(), d.getMonth()+2, 0).getDate(); return iso(new Date(d.getFullYear(), d.getMonth()+1, Math.min(n, last), 12)); }
  return null;
}

/* ---------- old routes now live in the Directory ---------- */
(function(){
  const j = renderFinJobs; renderFinJobs = function(sub){ if(sub==='clients'){ location.replace('#/finance/directory/clients'); return; } return j.apply(this, arguments); };
  const p = renderFinPurchases; renderFinPurchases = function(sub){ if(sub==='suppliers'){ location.replace('#/finance/directory/suppliers'); return; } return p.apply(this, arguments); };
  const s = renderFinanceSettings; renderFinanceSettings = async function(){
    const g = RENDER_GEN;
    await s.apply(this, arguments);
    if(g !== RENDER_GEN || !/^#\/finance\/settings\/?$/.test(location.hash)) return;
    const nav = document.querySelector('#app .finsecnav');
    if(nav && !document.querySelector('#app .finsubtabs')) nav.insertAdjacentHTML('afterend', finSubTabs('settings', 'general'));
  };
})();

async function renderFinDirectory(sub){
  if(!finGuard()) return;
  sub = ['clients','suppliers','labour'].includes(sub) ? sub : 'clients';
  if(sub==='labour') return renderFinLabourRates();
  const __gen = RENDER_GEN;
  if(!FIN_SETTINGS) await finLoadSettings();
  await finCodesLoad();
  let body;
  if(sub==='clients'){
    const [jf, invs] = await Promise.all([
      dbSelect('job_finance', 'org_id=eq.'+ME.org_id+'&select=site_id,contract_value,billing_name,billing_email'),
      dbSelect('fin_invoices', 'org_id=eq.'+ME.org_id+'&status=neq.void&limit=3000&select=site_id,status,total,paid,net,due_date'),
    ]);
    const jfBy = {}; jf.forEach(r=>{ jfBy[r.site_id] = r; });
    body = await finClientsHtml(jfBy, invs);
  } else {
    body = await finSuppliersHtml();
  }
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = shell(`${finSectionNav('directory')}${finSubTabs('directory', sub)}${body}`,
    {title:'Directory', subtitle:'OpHUB Finance', back:finSecBack(), tabs:false});
}

/* ================= Clients: rows open the full edit form ================= */
(function(){
  const base = finClientsHtml;
  finClientsHtml = async function(jfBy, invs){
    let h = await base(jfBy, invs);
    const saved = await dbSelect('fin_clients', 'org_id=eq.'+ME.org_id+'&select=id,name,terms_days,terms_type,sales_vat,vat_registered,cis_registered&limit=5000').catch(()=>[]);
    const by = {}; saved.forEach(c=>{ by[String(c.name).trim().toLowerCase()] = c; });
    // make each row open the editor, and show terms / VAT under the name
    h = h.replace(/<tr data-lf="([^"]*)">\s*<td data-l="Client" class="d"><b>([^<]*)<\/b>/g, (m, lf, nmEsc)=>{
      const nm = nmEsc.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
      const c = by[nm.trim().toLowerCase()];
      const bits = c ? [finTermsText(c), c.sales_vat ? 'Sales VAT '+(FIN_DIR_VAT_S[c.sales_vat]||c.sales_vat) : '', c.cis_registered ? 'CIS' : ''].filter(Boolean) : [];
      return `<tr class="click" data-lf="${lf}" onclick="openFinDirEdit('client','${jsAttr(c ? c.id : '')}','${jsAttr(nm)}')"><td data-l="Client" class="d"><b>${nmEsc}</b>${bits.length?`<div class="fininv-addr">${escapeHtml(bits.join(' · '))}</div>`:''}`;
    });
    return h;
  };
  window.openFinClientForm = function(){ openFinDirEdit('client', '', ''); };
})();

/* ================= Suppliers ================= */
let finSupBusy = '', finSupCat = '';
async function finSuppliersHtml(){
  const [mat, fin, pinvs] = await Promise.all([
    dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name,email,account_number&order=name.asc'),
    dbSelect('fin_suppliers', 'org_id=eq.'+ME.org_id+'&order=name.asc&limit=5000').catch(()=>[]),
    dbSelect('purchase_invoices', 'org_id=eq.'+ME.org_id+'&select=supplier_id,supplier_name,status,net,total,paid_on&limit=5000').catch(()=>[]),
  ]);
  const key = n=>String(n||'').trim().toLowerCase();
  const rows = {}; // by lower-case name
  fin.forEach(f=>{ rows[key(f.name)] = {name:f.name, email:f.email||'', fin:f, mat:null, n:0, spend:0, owed:0}; });
  mat.forEach(m=>{ const f = fin.find(x=>x.supplier_id===m.id); const k = key(f ? f.name : m.name);
    const r = rows[k] = rows[k] || {name:m.name, email:m.email||'', fin:null, mat:null, n:0, spend:0, owed:0}; r.mat = m; if(!r.email) r.email = m.email||''; });
  pinvs.filter(i=>!['void','rejected'].includes(i.status)).forEach(i=>{
    const m = i.supplier_id && mat.find(x=>x.id===i.supplier_id);
    const k = key(m ? ((fin.find(x=>x.supplier_id===m.id)||{}).name || m.name) : i.supplier_name); if(!k) return;
    const r = rows[k] = rows[k] || {name:i.supplier_name, email:'', fin:null, mat:null, n:0, spend:0, owed:0};
    r.n++; if(i.status==='approved') r.spend += Number(i.net||0); if(i.status==='approved' && !i.paid_on) r.owed += Number(i.total||0);
  });
  let list = Object.values(rows).sort((a,b)=>a.name.localeCompare(b.name));
  const cats = Array.from(new Set(list.map(r=>r.fin && r.fin.category).filter(Boolean))).sort();
  if(finSupCat) list = list.filter(r=>(r.fin && r.fin.category)===finSupCat);
  const inXero = list.filter(r=>r.fin && r.fin.xero_contact_id).length;
  const xConn = typeof finXeroConnected==='function' && finXeroConnected();
  return `<div class="finsechead finsechead-notitle"><h3></h3><div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="ghostbtn" style="width:auto;margin:0;" onclick="finSupPull()" ${finSupBusy?'disabled':''}>${finSupBusy==='pull'?'Pulling…':'⟳ Pull from Xero'}</button>
      <button class="darkbtn" style="width:auto;margin:0;" onclick="openFinDirEdit('supplier','','')">+ New supplier</button></div></div>
    <p class="stub" style="margin:-4px 0 10px;">${list.length} supplier${list.length===1?'':'s'} · ${inXero} linked to Xero${xConn?'':' (Xero not connected yet)'}. Tap one to set VAT, payment terms and a default cost code.</p>
    ${cats.length ? `<div class="finjobfilt"><label>Category<select onchange="finSupCat=this.value;render()"><option value="">All</option>${cats.map(c=>`<option ${finSupCat===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select></label></div>` : ''}
    ${finSearchHtml('Search suppliers', 'finSupList')}
    <div id="finSupList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl fincli-tbl">
      <thead><tr><th>Supplier</th><th>Purchase VAT</th><th>Terms</th><th>Xero</th><th class="num">Invoices</th><th class="num">Spent (net)</th><th class="num">To pay</th></tr></thead>
      <tbody>${list.map(r=>{ const f = r.fin||{};
        return `<tr class="click" data-lf="${lfText([r.name, r.email, f.category].join(' '))}" onclick="openFinDirEdit('supplier','${jsAttr(f.id||'')}','${jsAttr(r.name)}','${jsAttr(r.mat?r.mat.id:'')}')">
        <td data-l="Supplier" class="d"><b>${escapeHtml(r.name)}</b>${r.email?`<div class="fininv-addr">${escapeHtml(r.email)}</div>`:''}${f.category?` <span class="finpill">${escapeHtml(f.category)}</span>`:''}${r.mat?' <span class="finxw-tag" title="Also in the Material Requests supplier list">Materials</span>':''}</td>
        <td data-l="Purchase VAT">${f.foreign_supplier?'Foreign (no VAT)':(f.purchase_vat?escapeHtml(FIN_DIR_VAT_S[f.purchase_vat]||f.purchase_vat):'<span class="stub" style="margin:0;">Not set</span>')}</td>
        <td data-l="Terms">${finTermsText(f) ? escapeHtml(finTermsText(f)) : '<span class="stub" style="margin:0;">Not set</span>'}</td>
        <td data-l="Xero">${f.xero_contact_id?'<span class="finpill ok">In Xero</span>':'—'}</td>
        <td data-l="Invoices" class="num">${r.n}</td><td data-l="Spent" class="num">${finMoney(r.spend)}</td><td data-l="To pay" class="num">${r.owed?finMoney(r.owed):'—'}</td></tr>`; }).join('')}</tbody>
    </table></div><div class="empty lf-empty" style="display:none;">No suppliers match.</div>` : '<div class="empty">No suppliers yet — pull them from Xero or add one.</div>'}</div>`;
}
window.finSupPull = async function(){
  if(finSupBusy) return; finSupBusy = 'pull'; render();
  try{
    const r = await finXeroCall('suppliers', {}, 120000);
    if(r.error){ toast(finCliXeroMsg(r.error)); return; }
    const list = r.suppliers || [];
    const [fin, mat] = await Promise.all([
      dbSelect('fin_suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name,xero_contact_id,supplier_id&limit=5000'),
      dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name'),
    ]);
    const key = n=>String(n||'').trim().toLowerCase();
    const byX = {}, byN = {}, matN = {}; fin.forEach(f=>{ if(f.xero_contact_id) byX[f.xero_contact_id] = f; byN[key(f.name)] = f; }); mat.forEach(m=>{ matN[key(m.name)] = m; });
    const now = new Date().toISOString(); let added = 0, updated = 0;
    for(const x of list){
      const patch = {name:x.name, xero_contact_id:x.id, xero_synced_at:now, updated_at:now}; ['email','phone','address','postcode'].forEach(k=>{ if(x[k]) patch[k] = x[k]; });
      if(x.vat_number){ patch.vat_number = x.vat_number; patch.vat_registered = true; }
      if(x.purchase_vat) patch.purchase_vat = x.purchase_vat; if(x.sales_vat) patch.sales_vat = x.sales_vat;
      if(x.terms_type){ patch.terms_type = x.terms_type; patch.terms_days = x.terms_days; }
      if(x.company_number) patch.company_number = x.company_number;
      const ex = byX[x.id] || byN[key(x.name)];
      if(ex){ const mm = matN[key(x.name)]; if(!ex.supplier_id && mm && !fin.some(f=>f.supplier_id===mm.id)) patch.supplier_id = mm.id; await dbUpdate('fin_suppliers', ex.id, patch); updated++; }
      else { const m = matN[key(x.name)]; const ins = await dbInsert('fin_suppliers', Object.assign({org_id:ME.org_id, created_by:ME.id, supplier_id:(m && !fin.some(f=>f.supplier_id===m.id))?m.id:null}, patch)); if(ins){ added++; fin.push(ins[0]); byN[key(x.name)] = ins[0]; byX[x.id] = ins[0]; } }
    }
    toast(`From Xero: ${list.length} supplier${list.length===1?'':'s'} — ${added} new, ${updated} updated`);
  } finally { finSupBusy = ''; render(); }
};

/* ================= One edit form for clients and suppliers ================= */
let finDir = null; // {kind, id, rec, tab}
window.openFinDirEdit = async function(kind, id, name, matId){
  await finCodesLoad();
  const tbl = kind==='client' ? 'fin_clients' : 'fin_suppliers';
  let rec = id ? (await dbSelect(tbl, 'id=eq.'+id))[0] : null;
  if(!rec && name) rec = (await dbSelect(tbl, 'org_id=eq.'+ME.org_id+'&name=ilike.'+encodeURIComponent(name.replace(/[*%]/g,''))))[0];
  let mat = null;
  if(kind==='supplier'){ const mid = (rec && rec.supplier_id) || matId; if(mid) mat = (await dbSelect('suppliers', 'id=eq.'+mid+'&select=id,name,email,account_number'))[0] || null; }
  if(!rec) rec = {name:name||(mat&&mat.name)||'', email:(mat&&mat.email)||'', supplier_id:mat?mat.id:null};
  finDir = {kind, rec:Object.assign({}, rec), mat, tab:'general', isNew:!rec.id, toX:!rec.id, toMat:false};
  finDirPaint();
};
function finDirPaint(){
  const D = finDir; if(!D) return; const r = D.rec, sup = D.kind==='supplier';
  let ov = document.getElementById('finDirOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finDirOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const v = x=>escapeHtml(x==null?'':String(x));
  const tog = (k, label, sub)=>`<label class="findir-tog ${r[k]?'on':''}"><span><b>${label}</b>${sub?`<small>${sub}</small>`:''}</span><input type="checkbox" ${r[k]?'checked':''} onchange="finDirSet('${k}',this.checked);finDirPaint()"></label>`;
  const inp = (k, label, ph, type)=>`<div class="formfield"><label class="field-label">${label}</label><input type="${type||'text'}" value="${v(r[k])}" placeholder="${escapeHtml(ph||'')}" oninput="finDirSet('${k}',this.value)"></div>`;
  const vatSel = (k, label)=>`<div class="formfield"><label class="field-label">${label}</label><select onchange="finDirSet('${k}',this.value)"><option value="">Not set</option>${(typeof finVatKeysWith==='function' ? finVatKeysWith(FIN_DIR_VAT, r[k]) : Object.keys(FIN_DIR_VAT)).map(x=>`<option value="${x}" ${r[k]===x?'selected':''}>${FIN_DIR_VAT[x]}</option>`).join('')}</select></div>`;
  const codes = FIN_CODES||[];
  const tabs = [['general','General'], ['terms','Payment terms'], ['tax','Tax'], ['cis','CIS']];
  let body = '';
  if(D.tab==='general'){
    body = (sup ? '' : vatSel('sales_vat', 'Default VAT code — used on invoices to this client')) + (sup ? `<div class="formfield"><label class="field-label">Category</label><select onchange="finDirSet('category',this.value)"><option value="">Not set</option>${FIN_SUP_CATS.map(c=>`<option ${r.category===c?'selected':''}>${c}</option>`).join('')}</select></div>` : '')
      + inp('name', (sup?'Supplier':'Client')+' name *', sup?'e.g. Bauder':'e.g. Quinn London Ltd')
      + inp('email', (sup?'Supplier':'Accounts')+' email', 'accounts@…', 'email')
      + `<div class="formfield"><label class="field-label">Address</label><textarea rows="2" oninput="finDirSet('address',this.value)">${v(r.address)}</textarea></div>`
      + `<div class="fingrid2">${inp('postcode','Postcode')}${inp('phone','Phone number','+44', 'tel')}</div>`
      + `<div class="formfield"><label class="field-label">Default cost code</label><select onchange="finDirSet('cost_code_id',this.value||null)"><option value="">None</option>${codes.filter(c=>c.active!==false).map(c=>`<option value="${c.id}" ${r.cost_code_id===c.id?'selected':''}>${escapeHtml((c.code?c.code+' – ':'')+c.name)}</option>`).join('')}</select><p class="stub" style="margin:4px 0 0;">${codes.length?'Saved for reference — invoice coding will use it in a later update.':'Set cost codes up in Finance › Settings › Cost codes.'}</p></div>`
      + (sup ? `${tog('no_sync','Don’t send this supplier’s bills to Xero')}
        <div class="formfield" style="margin-top:8px;"><label class="field-label">Material Requests</label>${D.mat ? `<p class="stub" style="margin:0;font-style:normal;">In the Material Requests supplier list${D.mat.account_number?` · our account no. ${escapeHtml(D.mat.account_number)}`:''}.</p>` : `<label style="display:flex;align-items:center;gap:8px;font-size:13.5px;"><input type="checkbox" id="finDirToMat" ${D.toMat?'checked':''} onchange="finDir.toMat=this.checked" style="width:auto;"> Also add to the Material Requests supplier list</label>`}</div>` : '')
      + `<div class="formfield"><label class="field-label">Notes</label><textarea rows="2" oninput="finDirSet('notes',this.value)">${v(r.notes)}</textarea></div>`;
  } else if(D.tab==='terms'){
    body = tog('terms_agreed', 'Terms agreed', 'Terms and service agreement signed')
      + `<div class="fingrid2"><div class="formfield"><label class="field-label">Payment terms</label><input type="number" min="0" max="365" value="${r.terms_days!=null?r.terms_days:''}" placeholder="e.g. 30" oninput="finDirSet('terms_days',this.value===''?null:Number(this.value))"></div>
        <div class="formfield"><label class="field-label">Terms type</label><select onchange="finDirSet('terms_type',this.value||null);finDirPaint()"><option value="">Choose…</option>${Object.keys(FIN_TERMS).map(k=>`<option value="${k}" ${r.terms_type===k?'selected':''}>${FIN_TERMS[k]}</option>`).join('')}</select></div></div>`
      + `<p class="stub" style="margin:0;font-style:normal;">${finTermsText(r) ? 'Due: <b>'+escapeHtml(finTermsText(r))+'</b>. e.g. a bill dated today is due '+finDate(finDueFromTerms(finToday(), r))+'.' : 'e.g. 30 + “days after bill month” = 30 days end of month.'}</p>`;
  } else if(D.tab==='tax'){
    body = (sup ? tog('foreign_supplier', 'Foreign supplier (ignore VAT)') : '')
      + tog('vat_registered', 'VAT registered')
      + (r.vat_registered ? inp('vat_number', 'VAT number', 'GB…') : '')
      + (sup ? vatSel('sales_vat', 'Default sales VAT rate') + vatSel('purchase_vat', 'Default purchase VAT rate') : vatSel('sales_vat', 'Default VAT code — used on invoices to this client'))
      + `<p class="stub" style="margin:0;">${sup?'Purchase VAT is used as the default on new purchase orders to this supplier.':'New invoices to this client start with this VAT code (e.g. DRC 20%), and so do new projects for them.'}</p>`;
  } else {
    body = tog('cis_registered', 'CIS registered', sup ? 'They are a CIS subcontractor — you deduct CIS from their labour' : 'They deduct CIS from what they pay you')
      + (r.cis_registered ? `<div class="fingrid2"><div class="formfield"><label class="field-label">CIS rate</label><select onchange="finDirSet('cis_rate',Number(this.value))">${Object.keys(FIN_CIS_LABEL).map(k=>`<option value="${k}" ${Number(r.cis_rate!=null?r.cis_rate:20)===Number(k)?'selected':''}>${FIN_CIS_LABEL[k]}</option>`).join('')}</select></div>${sup ? inp('utr','UTR','10 digits') : '<div></div>'}</div>${inp('company_number','Company number')}` : '')
      + (sup ? `<p class="stub" style="margin:4px 0 0;">Labour-only subbies are best kept in Directory › Labour (CIS), where you can record their HMRC verification.</p>` : '');
  }
  ov.innerHTML = `<div class="geo-modal-card findir-card">
    <div class="findir-head"><div><h3 style="margin:0;">${D.isNew?'New '+(sup?'supplier':'client'):escapeHtml(r.name||(sup?'Supplier':'Client'))}</h3><p class="stub" style="margin:2px 0 0;font-style:normal;">${r.xero_contact_id?'Linked to Xero':'Not in Xero yet'}</p></div>
      <button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="document.getElementById('finDirOverlay').style.display='none'">✕</button></div>
    <div class="finsubtabs findir-tabs">${tabs.map(([k,l])=>`<button type="button" class="${D.tab===k?'on':''}" onclick="finDir.tab='${k}';finDirPaint()">${l}</button>`).join('')}</div>
    <div class="findir-body">${body}</div>
    ${!r.xero_contact_id ? `<label style="display:flex;align-items:center;gap:8px;margin:10px 0 0;font-size:13.5px;"><input type="checkbox" id="finDirXero" ${D.toX?'checked':''} onchange="finDir.toX=this.checked" style="width:auto;"> Add to Xero as well</label>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;"><button class="ghostbtn" style="margin:0;" onclick="document.getElementById('finDirOverlay').style.display='none'">Cancel</button><button class="darkbtn" id="finDirSave" style="margin:0;" onclick="saveFinDir()">Save</button></div>
  </div>`;
  ov.style.display = 'flex';
}
window.finDirSet = function(k, val){ if(finDir) finDir.rec[k] = val; };
window.saveFinDir = async function(){
  const D = finDir; if(!D) return; const r = D.rec, sup = D.kind==='supplier', tbl = sup ? 'fin_suppliers' : 'fin_clients';
  const name = String(r.name||'').trim(); if(!name){ toast('Enter the name.'); D.tab='general'; finDirPaint(); return; }
  if(r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)){ toast('Check the email address.'); return; }
  if(r.utr && !/^\d{10}$/.test(String(r.utr).replace(/\s/g,''))){ toast('A UTR is 10 numbers.'); return; }
  const fields = ['name','email','address','postcode','phone','vat_registered','vat_number','sales_vat','purchase_vat','terms_days','terms_type','terms_agreed','cost_code_id','company_number','cis_registered','cis_rate','notes'];
  if(sup) fields.push('category','foreign_supplier','exclude_cost_report','no_sync','utr');
  const row = {}; fields.forEach(k=>{ let x = r[k]; if(x==='') x = null; if(x!==undefined) row[k] = x; });
  row.name = name; if(row.utr) row.utr = String(row.utr).replace(/\s/g,'');
  ['vat_registered','terms_agreed','cis_registered','foreign_supplier','exclude_cost_report','no_sync'].forEach(k=>{ if(k in row) row[k] = !!row[k]; });
  if(sup) row.updated_at = new Date().toISOString();
  const dup = (await dbSelect(tbl, 'org_id=eq.'+ME.org_id+'&name=ilike.'+encodeURIComponent(name.replace(/[*%,()]/g,''))+'&select=id,name').catch(()=>[])).find(x=>x.id!==r.id);
  if(dup){ toast('“'+dup.name+'” is already in the directory.'); return; }
  const btn = document.getElementById('finDirSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const toMat = !!D.toMat, toX = !!D.toX;
  if(sup){
    if(toMat && !D.mat){ const m = await dbInsert('suppliers', {org_id:ME.org_id, name, email:row.email||null, created_by:ME.id}); if(m && m[0]) row.supplier_id = m[0].id; }
    else if(D.mat) row.supplier_id = D.mat.id;
  }
  let rec;
  if(r.id) rec = await dbUpdate(tbl, r.id, row);
  else { const ins = await dbInsert(tbl, Object.assign({org_id:ME.org_id, created_by:ME.id}, row)); rec = ins && ins[0]; }
  if(!rec){ if(btn){ btn.disabled = false; btn.textContent = 'Save'; } return; }
  document.getElementById('finDirOverlay').style.display = 'none';
  let msg = D.isNew ? 'Added' : 'Saved';
  if(toX && !rec.xero_contact_id){
    const lines = String(rec.address||'').split(/\n|,/).map(x=>x.trim()).filter(Boolean);
    const x = await finXeroCall('create_contact', {name:rec.name, email:rec.email||'', phone:rec.phone||'', line1:lines[0]||'', line2:lines.slice(1,-1).join(', '), city:lines.length>1?lines[lines.length-1]:'', postcode:rec.postcode||'', supplier:sup});
    if(x.error) msg += '. '+finCliXeroMsg(x.error);
    else { await dbUpdate(tbl, rec.id, {xero_contact_id:x.contact.id, xero_synced_at:new Date().toISOString()}); msg += x.existed ? ' — already in Xero, linked' : ' and added to Xero'; }
  }
  toast(msg); finDir = null; render();
};

/* new POs: the supplier's default purchase VAT goes on every line */
(function(){
  const base = window.finNpoSupPicked;
  window.finNpoSupPicked = async function(v){
    base(v);
    if(!v || v==='__new' || typeof finNewPo==='undefined' || !finNewPo) return;
    const f = (await dbSelect('fin_suppliers', 'supplier_id=eq.'+v+'&select=purchase_vat,foreign_supplier').catch(()=>[]))[0];
    if(!f) return;
    const map = {'20':'20','5':'5','0':'0','ex':'ex','none':'ex','rc20':'rc','rc5':'rc'};
    const vat = f.foreign_supplier ? 'ex' : (FIN_VAT_RATES[f.purchase_vat] ? f.purchase_vat : map[f.purchase_vat]);
    if(!vat || !FIN_VAT_RATES[vat]) return;
    finNewPo.vat = vat; finNewPo.lines.forEach(l=>{ l.vat = vat; });
    const sel = document.getElementById('finNpoVatAll'); if(sel) sel.value = vat;
    if(typeof finNpoPaint==='function') finNpoPaint();
    toast('VAT set to '+FIN_VAT_RATES[vat].l+' (this supplier’s default)');
  };
})();

/* ================= Labour (CIS) ================= */
async function renderFinLabourRates(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  await loadAllProfiles();
  const [rates, apps] = await Promise.all([finLoadRates(), dbSelect('subcontractor_applications', 'org_id=eq.'+ME.org_id+'&status=neq.rejected&order=created_at.desc&limit=300&select=id,company_name,contact_name,email,phone,status,created_at,data').catch(()=>[])]);
  if(!FIN_SETTINGS) await finLoadSettings();
  if(__gen !== RENDER_GEN) return;
  const users = Object.values(PROFILES).filter(p=>['operative','site_manager'].includes(p.role) && p.org_id===ME.org_id);
  const rows = Object.values(FIN_WORKERS).map(w=>({key:'w:'+w.id, name:w.trading_name||w.name||'Worker', r:w, app:false}))
    .concat(users.map(u=>({key:u.id, name:(rates[u.id]||{}).trading_name || u.name, r:rates[u.id]||{}, app:true})))
    .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const linked = new Set(Object.values(rates).map(r=>r.application_id).filter(Boolean));
  const waiting = apps.filter(a=>!linked.has(a.id));
  const F = {subs:x=>x.r.active!==false && x.r.pay_type!=='paye', unver:x=>x.r.active!==false && x.r.pay_type!=='paye' && !x.r.cis_verified_at, paye:x=>x.r.active!==false && x.r.pay_type==='paye', left:x=>x.r.active===false, all:()=>true};
  if(!F[finPplF]) finPplF = 'subs';
  const list = rows.filter(F[finPplF]);
  const ver = r=>r.pay_type==='paye' ? '—' : r.cis_verified_at ? `<span class="finpill ok">Verified ${finDate(r.cis_verified_at)}</span>${r.cis_verification_no?`<div class="fininv-addr">${escapeHtml(r.cis_verification_no)}</div>`:''}` : '<span class="finpill warn">Unverified</span>';
  const bank = r=>finBankOk(r) ? `${escapeHtml(finSortCode(r.bank_sort_code))} · ••${escapeHtml(String(r.bank_account_no).replace(/\D/g,'').slice(-4))}` : (r.pay_type==='paye' ? '<span class="stub" style="margin:0;">Payroll</span>' : '<span class="finpill warn">Not saved</span>');
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('directory')}${finSubTabs('directory','labour')}
    ${finSecHead('Labour (CIS)', '+ Add a person', "openFinPerson('')")}
    <p class="stub" style="margin:-4px 0 10px;">Subcontractors who invoice you under CIS, and PAYE staff. Check each subbie’s CIS status with HMRC before you pay them.${typeof finXeroConnected==='function' && finXeroConnected() && !(typeof FIN_TRIAL!=='undefined' && FIN_TRIAL) ? ` <button class="linkbtn" onclick="openFinXeroWorkers()">Bring people in from Xero</button>` : ''}</p>
    ${waiting.length ? `<details class="fincli-dd findir-apps" open><summary>${waiting.length} from the sub-contractor sign-up form, not in the directory yet</summary><div>${waiting.map(a=>{ const d = a.data||{};
      return `<div class="findir-app"><div><b>${escapeHtml(a.company_name||d.trading_name||a.contact_name||'Applicant')}</b> <span class="finpill ${a.status==='approved'?'ok':''}">${a.status==='approved'?'Approved':'New'}</span><div class="fininv-addr">${escapeHtml([a.contact_name, d.cis_status, d.utr?'UTR '+d.utr:''].filter(Boolean).join(' · '))}</div></div>
        <button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="finDirFromApp('${a.id}')">Add to directory</button></div>`; }).join('')}</div></details>` : ''}
    <div class="pmchips">${[['subs','CIS subcontractors'],['unver','Not verified'],['paye','PAYE staff'],['left','No longer working for us'],['all','All']].map(([k,l])=>finChip(finPplF===k, l, rows.filter(F[k]).length, `finPplF='${k}';render()`)).join('')}</div>
    ${finSearchHtml('Search name or UTR', 'finPplList')}
    <div id="finPplList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl">
      <thead><tr><th>Name</th><th>CIS</th><th>UTR</th><th>HMRC check</th><th class="num">Day rate</th><th>Bank</th></tr></thead>
      <tbody>${list.map(x=>`<tr class="click" data-lf="${lfText(x.name+' '+(x.r.name||'')+' '+(x.r.utr||''))}" onclick="openFinPerson('${jsAttr(x.key)}')">
        <td data-l="Name" class="d"><b>${escapeHtml(x.name)}</b>${x.r.trading_name && x.r.name && x.r.name!==x.name?`<div class="fininv-addr">${escapeHtml(x.r.name)}</div>`:''}${x.app?'<div class="fininv-addr">Has the app</div>':''}${x.r.application_id?' <span class="finxw-tag">Sign-up form</span>':''}${(x.r.xero_contact_id||x.r.xero_employee_id)?' <span class="finxw-tag">From Xero</span>':''}</td>
        <td data-l="CIS">${x.r.pay_type==='paye'?'PAYE':(FIN_CIS_LABEL[x.r.cis_rate!=null?x.r.cis_rate:20]||'')}</td>
        <td data-l="UTR">${x.r.pay_type==='paye'?'—':(x.r.utr?escapeHtml(x.r.utr):'<span class="finpill warn">Missing</span>')}</td>
        <td data-l="HMRC check">${ver(x.r)}</td>
        <td data-l="Day rate" class="num">${x.r.day_rate!=null?finMoney(x.r.day_rate):'—'}</td>
        <td data-l="Bank">${bank(x.r)}</td></tr>`).join('')}</tbody></table></div><div class="empty lf-empty" style="display:none;">No one matches.</div>` : '<div class="empty">No one here yet.</div>'}</div>
  `, {title:'Directory', subtitle:'OpHUB Finance', back:finSecBack(), tabs:false});
}
const FIN_CIS_FROM_FORM = s=>/gross/i.test(s||'') ? 0 : /30/.test(s||'') ? 30 : 20;
const FIN_REG_FROM_FORM = s=>/limited|ltd|company/i.test(s||'') ? 'company' : /partner/i.test(s||'') ? 'partnership' : /trust/i.test(s||'') ? 'trust' : /sole|self/i.test(s||'') ? 'sole_trader' : null;
let finDirAppBusy = false;
window.finDirFromApp = async function(appId){
  if(finDirAppBusy) return; finDirAppBusy = true; try{ return await finDirFromAppDo(appId); } finally { finDirAppBusy = false; }
};
async function finDirFromAppDo(appId){
  const a = (await dbSelect('subcontractor_applications', 'id=eq.'+appId))[0]; if(!a) return;
  const d = a.data || {};
  const row = {org_id:ME.org_id, user_id:a.user_id||null, active:true, pay_type:'subcontractor', application_id:a.id,
    name:a.contact_name||a.company_name||'Subcontractor', trading_name:d.trading_name||a.company_name||null, email:a.email||null, phone:a.phone||d.phone||null,
    utr:String(d.utr||'').replace(/\s/g,'')||null, cis_rate:FIN_CIS_FROM_FORM(d.cis_status), vat_number:d.vat_number||null, vat_registered:!!d.vat_number,
    company_number:d.company_number||null, address:d.address||null, postcode:d.postcode||null, cis_reg_type:FIN_REG_FROM_FORM(d.company_type), cis_sub_type:FIN_REG_FROM_FORM(d.company_type),
    notes:[d.trades?('Trades: '+subAppValue(d.trades)):'', d.areas?('Areas: '+subAppValue(d.areas)):''].filter(Boolean).join('\n')||null, updated_at:new Date().toISOString()};
  if(row.utr && !/^\d{10}$/.test(row.utr)) row.utr = null;
  let ok;
  if(row.user_id){ const res = await sbFetch('/rest/v1/fin_labour_rates?on_conflict=org_id,user_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=representation'}, body:JSON.stringify(row)}); ok = res.ok; if(!ok) toast('Save failed — '+(await safeErr(res))); }
  else ok = await dbInsert('fin_labour_rates', row);
  if(!ok) return;
  toast('Added from the sign-up form — check their CIS status with HMRC'); render();
};

/* ---------- person editor with General / Pay & bank / CIS tabs ---------- */
let finPer = null;
window.openFinPerson = async function(key){
  const rates = await finLoadRates(); await loadAllProfiles();
  const isApp = key && !key.startsWith('w:');
  const r = key ? Object.assign({}, rates[key] || {}) : {pay_type:'subcontractor', cis_rate:20};
  finPer = {key:key||'', isNew:!key, isApp, r, tab:'general', appName:isApp ? (PROFILES[key]||{}).name : ''};
  finPerPaint();
};
function finPerPaint(){
  const P = finPer; if(!P) return; const r = P.r, v = x=>escapeHtml(x==null?'':String(x));
  let ov = document.getElementById('finPplOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPplOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const inp = (k, label, ph, extra)=>`<div class="formfield"><label class="field-label">${label}</label><input type="text" value="${v(r[k])}" placeholder="${escapeHtml(ph||'')}" ${extra||''} oninput="finPer.r['${k}']=this.value"></div>`;
  const paye = r.pay_type==='paye';
  const tabs = [['general','General'], ['pay','Pay & bank']].concat(paye ? [] : [['cis','CIS']]);
  let body = '';
  if(P.tab==='general'){
    body = (P.isApp ? `<p class="stub" style="margin:0 0 10px;font-style:normal;">Has the app (${escapeHtml((PROFILES[P.key]||{}).email||'')}). Their name comes from their app account.</p>` : inp('name','Name *','e.g. Sam Slater'))
      + inp('trading_name','Trading / company name','If they invoice as a company')
      + `<div class="formfield"><label class="field-label">How they’re paid</label><select onchange="finPer.r.pay_type=this.value;if(this.value==='paye'&&finPer.tab==='cis')finPer.tab='general';finPerPaint()"><option value="subcontractor" ${!paye?'selected':''}>They invoice us (CIS)</option><option value="paye" ${paye?'selected':''}>PAYE (on our payroll)</option></select></div>`
      + (P.isApp ? '' : `<div class="fingrid2">${inp('email','Email (for CIS statements)','', 'type="email"')}${inp('phone','Phone','', 'type="tel"')}</div>`)
      + `<div class="formfield"><label class="field-label">Address</label><textarea rows="2" oninput="finPer.r.address=this.value">${v(r.address)}</textarea></div>`
      + `<div class="fingrid2"><div class="formfield"><label class="field-label">Postcode</label><input type="text" value="${v(r.postcode)}" oninput="this.value=this.value.toUpperCase();finPer.r.postcode=this.value"></div><div></div></div>`
      + `<div class="formfield"><label class="field-label">Notes</label><textarea rows="2" oninput="finPer.r.notes=this.value">${v(r.notes)}</textarea></div>`;
  } else if(P.tab==='pay'){
    body = `<div class="formfield"><label class="field-label">Day rate £</label><input type="text" inputmode="decimal" data-money value="${r.day_rate!=null?r.day_rate:''}" oninput="finPer.r.day_rate=this.value"></div>`
      + (paye ? '<p class="stub" style="margin:0;">PAYE staff are paid through payroll; the day rate prices their days on site.</p>' : `<p class="sectiontitle" style="margin:8px 0 6px;">Bank details (shown on the pay run when you pay them)</p>
      <div class="formfield"><label class="field-label">Account name</label><input type="text" value="${v(r.bank_account_name)}" autocomplete="off" oninput="finPer.r.bank_account_name=this.value"></div>
      <div class="fingrid2"><div class="formfield"><label class="field-label">Sort code</label><input type="text" inputmode="numeric" value="${r.bank_sort_code?v(finSortCode(r.bank_sort_code)):''}" placeholder="00-00-00" autocomplete="off" oninput="finPer.r.bank_sort_code=this.value"></div>
      <div class="formfield"><label class="field-label">Account number</label><input type="text" inputmode="numeric" value="${v(r.bank_account_no)}" placeholder="8 digits" autocomplete="off" oninput="finPer.r.bank_account_no=this.value"></div></div>`);
  } else {
    const verified = !!r.cis_verified_at;
    body = `<div class="findir-tog ${verified?'on':''}" style="cursor:default;"><span><b>${verified?'Verified with HMRC':'Unverified'}</b><small>${verified?'On '+finDate(r.cis_verified_at)+(r.cis_verification_no?' · '+escapeHtml(r.cis_verification_no):''):'Check them with HMRC before their first payment'}</small></span></div>
      <div class="fingrid2"><div class="formfield"><label class="field-label">Registration type</label><select onchange="finPer.r.cis_reg_type=this.value||null"><option value="">Choose…</option>${Object.keys(FIN_CIS_REG).map(k=>`<option value="${k}" ${r.cis_reg_type===k?'selected':''}>${FIN_CIS_REG[k]}</option>`).join('')}</select></div>
      <div class="formfield"><label class="field-label">Subcontractor type</label><select onchange="finPer.r.cis_sub_type=this.value||null"><option value="">Choose…</option>${Object.keys(FIN_CIS_REG).map(k=>`<option value="${k}" ${r.cis_sub_type===k?'selected':''}>${FIN_CIS_REG[k]}</option>`).join('')}</select></div></div>
      <div class="fingrid2"><div class="formfield"><label class="field-label">CIS rate ${finHelp('cis')}</label><select onchange="finPer.r.cis_rate=Number(this.value)">${Object.keys(FIN_CIS_LABEL).map(k=>`<option value="${k}" ${Number(r.cis_rate!=null?r.cis_rate:20)===Number(k)?'selected':''}>${FIN_CIS_LABEL[k]}</option>`).join('')}</select></div>
      ${inp('utr','UTR '+finHelp('utr'),'10 digits','inputmode="numeric"')}</div>
      <div class="fingrid2">${inp('company_number','Company number','For limited companies')}${inp('vat_number','VAT number','GB…')}</div>
      <div class="formfield"><label class="field-label">VAT registered</label><select onchange="finPer.r.vat_registered=this.value==='true'"><option value="false">No</option><option value="true" ${r.vat_registered?'selected':''}>Yes (reverse charge)</option></select></div>
      <div class="fingrid2">${inp('cis_verification_no','HMRC verification number','e.g. V1234567890')}<div class="formfield"><label class="field-label">Verified date</label><input type="date" value="${v(r.cis_verified_at)}" onchange="finPer.r.cis_verified_at=this.value||null"></div></div>
      <div class="findir-hmrc"><button type="button" class="ghostbtn" style="margin:0;" onclick="finCisVerifyHelp()">✓ Verify with HMRC</button>
      <p class="stub" style="margin:6px 0 0;">Have their name, UTR${r.cis_reg_type==='company'?', company number':''} and your contractor UTR (${escapeHtml((FIN_SETTINGS&&FIN_SETTINGS.contractor_utr)||'set it in Finance › Settings')}) ready. Put the verification number and rate HMRC gives you above.</p></div>`;
  }
  ov.innerHTML = `<div class="geo-modal-card findir-card">
    <div class="findir-head"><div><h3 style="margin:0;">${P.isNew?'Add a person':escapeHtml(P.appName||r.trading_name||r.name||'Person')}</h3>${r.application_id?'<p class="stub" style="margin:2px 0 0;font-style:normal;">From the sub-contractor sign-up form</p>':''}</div>
      <button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="document.getElementById('finPplOverlay').style.display='none'">✕</button></div>
    <div class="finsubtabs findir-tabs">${tabs.map(([k,l])=>`<button type="button" class="${P.tab===k?'on':''}" onclick="finPer.tab='${k}';finPerPaint()">${l}</button>`).join('')}</div>
    <div class="findir-body">${body}</div>
    <div style="display:flex;gap:8px;margin-top:12px;"><button class="ghostbtn" style="margin:0;" onclick="document.getElementById('finPplOverlay').style.display='none'">Cancel</button><button class="darkbtn" style="margin:0;" onclick="saveFinPerson()">${P.isNew?'Add person':'Save'}</button></div>
    ${!P.isNew && !P.isApp ? `<button class="linkbtn" style="margin-top:12px;color:var(--slate);" onclick="finPersonActive('${jsAttr(P.key)}', ${r.active===false})">${r.active===false?'Working for us again':'No longer working for us'}</button>` : ''}
  </div>`;
  ov.style.display = 'flex';
}
window.finCisVerifyHelp = function(){
  customAlert('HMRC verification is done through HMRC’s CIS online service (or your payroll/accounts software, e.g. Xero once CIS is switched on). Log in, choose “Verify subcontractors”, enter their details, then type the verification number, rate and today’s date into this form and Save.');
  try{ window.open('https://www.gov.uk/government/publications/construction-industry-scheme-cis-340/cis-340-chapter-3-verifying-subcontractors', '_blank', 'noopener'); }catch(e){}
};
window.saveFinPerson = async function(){
  const P = finPer; if(!P) return; const r = P.r, key = P.key;
  const rate = finNum(r.day_rate==null?'':String(r.day_rate));
  if(rate!==null && isNaN(rate)){ toast('Day rate must be a number.'); return; }
  const pay = r.pay_type || 'subcontractor';
  const sc = String(r.bank_sort_code||'').replace(/\D/g,''), an = String(r.bank_account_no||'').replace(/\D/g,''), utr = String(r.utr||'').replace(/\s/g,'');
  if(sc && sc.length!==6){ toast('Sort code should be 6 numbers.'); P.tab='pay'; finPerPaint(); return; }
  if(an && an.length!==8){ toast('Account number should be 8 numbers.'); P.tab='pay'; finPerPaint(); return; }
  if(utr && !/^\d{10}$/.test(utr)){ toast('A UTR is 10 numbers.'); P.tab='cis'; finPerPaint(); return; }
  const n = x=>{ const s = String(x==null?'':x).trim(); return s || null; };
  const row = {pay_type:pay, day_rate:rate, trading_name:n(r.trading_name), address:n(r.address), postcode:n(r.postcode), notes:n(r.notes), updated_at:new Date().toISOString()};
  if(pay!=='paye') Object.assign(row, {cis_rate:Number(r.cis_rate!=null?r.cis_rate:20), utr:utr||null, vat_registered:!!r.vat_registered, vat_number:n(r.vat_number), company_number:n(r.company_number),
    cis_reg_type:n(r.cis_reg_type), cis_sub_type:n(r.cis_sub_type), cis_verification_no:n(r.cis_verification_no), cis_verified_at:r.cis_verified_at||null,
    bank_account_name:n(r.bank_account_name), bank_sort_code:sc||null, bank_account_no:an||null});
  if(!P.isApp){
    const nm = n(r.name); if(!nm){ toast('Enter their name.'); P.tab='general'; finPerPaint(); return; }
    const em = n(r.email); if(em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){ toast('Check the email address.'); return; }
    Object.assign(row, {name:nm, email:em, phone:n(r.phone)});
  }
  let ok;
  if(P.isNew) ok = await dbInsert('fin_labour_rates', Object.assign({org_id:ME.org_id, user_id:null, active:true}, row));
  else if(P.isApp){ const res = await sbFetch('/rest/v1/fin_labour_rates?on_conflict=org_id,user_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(Object.assign({org_id:ME.org_id, user_id:key}, row))}); ok = res.ok; if(!ok) toast('Save failed — '+(await safeErr(res))); }
  else ok = await dbUpdate('fin_labour_rates', key.slice(2), row);
  if(!ok) return;
  document.getElementById('finPplOverlay').style.display = 'none';
  toast(P.isNew ? 'Added' : 'Saved'); finPer = null; render();
};

/* ================= Settings › Cost codes ================= */
async function renderFinCostCodes(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const codes = await finCodesLoad(true);
  if(__gen !== RENDER_GEN) return;
  const groups = {}; codes.forEach(c=>{ (groups[c.grp||'No group'] = groups[c.grp||'No group'] || []).push(c); });
  document.getElementById('app').innerHTML = shell(`${finSectionNav('settings')}${finSubTabs('settings','codes')}
    ${finSecHead('Cost codes', '+ Add cost code', "openFinCode('')")}
    <p class="stub" style="margin:-4px 0 10px;">The ID is the Xero account code each cost goes to. The type decides which column it adds up in on job costs and reports.</p>
    ${finSearchHtml('Search cost codes', 'finCodeList')}
    <div id="finCodeList">${codes.length ? Object.keys(groups).sort().map(g=>`<p class="sectiontitle" style="margin:12px 0 6px;">${escapeHtml(g)} · ${groups[g].length} cost code${groups[g].length===1?'':'s'}</p>
      <div class="finreptbl-wrap"><table class="fincosttbl fininvtbl"><thead><tr><th>Name</th><th>ID</th><th>Description</th><th>Type</th></tr></thead>
      <tbody>${groups[g].map(c=>`<tr class="click ${c.active===false?'findir-off':''}" data-lf="${lfText([c.name,c.code,c.description].join(' '))}" onclick="openFinCode('${c.id}')">
        <td data-l="Name" class="d"><b>${escapeHtml(c.name)}</b>${c.active===false?' <span class="finpill">Hidden</span>':''}</td><td data-l="ID">${escapeHtml(c.code||'—')}</td>
        <td data-l="Description">${escapeHtml(c.description||'')}</td><td data-l="Type">${escapeHtml(FIN_COST_CATS[c.category]||c.category||'')}</td></tr>`).join('')}</tbody></table></div>`).join('') : '<div class="empty">No cost codes yet.</div>'}</div>`,
    {title:'Settings', subtitle:'OpHUB Finance', back:finSecBack(), tabs:false});
}
window.openFinCode = function(id){
  const c = id ? ((FIN_CODES||[]).find(x=>x.id===id) || {}) : {category:'materials', grp:((FIN_CODES||[])[0]||{}).grp||''};
  let ov = document.getElementById('finCodeOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finCodeOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const v = x=>escapeHtml(x==null?'':String(x));
  const grps = Array.from(new Set((FIN_CODES||[]).map(x=>x.grp).filter(Boolean)));
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>${id?'Edit cost code':'New cost code'}</h3>
    <div class="fingrid2"><div class="formfield"><label class="field-label">Name *</label><input type="text" id="fcName" value="${v(c.name)}" placeholder="e.g. Roofing Materials"></div>
    <div class="formfield"><label class="field-label">ID (Xero account code)</label><input type="text" id="fcCode" value="${v(c.code)}" placeholder="e.g. 310"></div></div>
    <div class="formfield"><label class="field-label">Description</label><textarea id="fcDesc" rows="2">${v(c.description)}</textarea></div>
    <div class="fingrid2"><div class="formfield"><label class="field-label">Type</label><select id="fcCat">${Object.keys(FIN_COST_CATS).map(k=>`<option value="${k}" ${c.category===k?'selected':''}>${FIN_COST_CATS[k]}</option>`).join('')}</select></div>
    <div class="formfield"><label class="field-label">Cost group</label><input type="text" id="fcGrp" value="${v(c.grp)}" list="fcGrpList" placeholder="e.g. Roofing - General"><datalist id="fcGrpList">${grps.map(g=>`<option value="${escapeHtml(g)}">`).join('')}</datalist></div></div>
    ${id ? `<label style="display:flex;align-items:center;gap:8px;margin:4px 0 12px;font-size:13.5px;"><input type="checkbox" id="fcOff" ${c.active===false?'checked':''} style="width:auto;"> Hide this code (keeps old costs on it)</label>` : ''}
    <button class="darkbtn" onclick="saveFinCode('${id||''}')">${id?'Save':'Add cost code'}</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finCodeOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
};
window.saveFinCode = async function(id){
  const name = finVal('fcName'); if(!name){ toast('Enter a name.'); return; }
  const row = {name, code:finVal('fcCode')||null, description:finVal('fcDesc')||null, category:finVal('fcCat')||'materials', grp:finVal('fcGrp')||null};
  if(id){ const off = document.getElementById('fcOff'); row.active = !(off && off.checked); }
  const ok = id ? await dbUpdate('fin_cost_codes', id, row) : await dbInsert('fin_cost_codes', Object.assign({org_id:ME.org_id, created_by:ME.id}, row));
  if(!ok) return;
  document.getElementById('finCodeOverlay').style.display = 'none'; toast(id?'Saved':'Added'); FIN_CODES = null; render();
};

(function(){
  const css = `.findir-card{max-width:640px;width:100%;}
  .findir-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;}
  .findir-tabs{margin:0 0 10px;}
  .findir-body{max-height:62vh;overflow:auto;padding:2px;}
  .findir-tog{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--line,#e2e5ea);border-radius:10px;padding:10px 12px;margin:0 0 10px;cursor:pointer;font-size:13.5px;}
  .findir-tog small{display:block;color:var(--slate);font-size:12px;font-weight:400;margin-top:2px;}
  .findir-tog.on{background:#eefaf1;border-color:#9fd9ae;}
  .findir-tog input{width:auto;margin:0;}
  .findir-hmrc{border:1px dashed var(--line,#d5d9e0);border-radius:10px;padding:10px 12px;margin-top:6px;}
  .findir-apps{border:1px solid #f2d48a;background:#fffaf0;border-radius:10px;padding:10px 12px;margin:0 0 12px;}
  .findir-apps > div{gap:8px !important;max-height:none !important;}
  .findir-app{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;padding:6px 0;border-top:1px solid #f4e3b8;}
  .findir-off td{opacity:.55;}`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();
