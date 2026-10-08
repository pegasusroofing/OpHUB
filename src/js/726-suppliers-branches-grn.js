/* ================= SUPPLIERS & BRANCHES, BRANCH PICKING, GRN =================
 * Suppliers can hold branches (suppliers.branches jsonb [{id,name,address,phone}]),
 * managed from Admin Centre → Suppliers (#/suppliers). When an order is
 * sent for collection/delivery, or an item is put on the Collection List,
 * a branch can be chosen; it's stored as supplier_branch {id,name,address,phone}.
 * GRN: operatives tick "Goods received" on a delivery coming to site, with
 * notes for any errors and photos; stored on materials.grn
 * {at, by, byName, ok, notes, photos:[storage paths]}. */
window.MAT_SUPPLIERS = window.MAT_SUPPLIERS || [];
function supplierBranches(supplierId){
  const s = (window.MAT_SUPPLIERS||[]).find(x=>x.id===supplierId);
  return s && Array.isArray(s.branches) ? s.branches : [];
}
function branchLabel(b){ return b ? [b.name, b.address].filter(Boolean).join(' — ') : ''; }
// A <select> of the chosen supplier's branches (nothing if it has none).
function branchSelectHtml(selId, supplierId, selected){
  const brs = supplierBranches(supplierId);
  if(!brs.length) return '';
  const selId2 = selected && selected.id;
  return `<div class="formfield" style="margin-top:8px;"><label class="field-label">Branch / address</label>
    <select id="${selId}" onchange="matBranchChoice['${selId}']=this.value">
      <option value="">— Any branch / not specified —</option>
      ${brs.map(b=>`<option value="${b.id}" ${(matBranchChoice[selId]||selId2)===b.id?'selected':''}>${escapeHtml(branchLabel(b))}</option>`).join('')}
    </select></div>`;
}
const matBranchChoice = {};
function readBranch(selId, supplierId){
  const el = document.getElementById(selId);
  const id = el ? el.value : (matBranchChoice[selId]||'');
  if(!id) return null;
  const b = supplierBranches(supplierId).find(x=>x.id===id);
  return b ? {id:b.id, name:b.name||'', address:b.address||'', phone:b.phone||''} : null;
}

// ---------- Admin Centre → Suppliers ----------
let suppliersAdminOpen = null; // supplier id whose branches are open
async function renderSuppliersAdmin(){
  const __gen = RENDER_GEN;
  if(!isFullManager(ME)){ go('#/team'); return; }
  const suppliers = await dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&order=name.asc');
  window.MAT_SUPPLIERS = suppliers;
  const html = `
    <p class="stub" style="margin:0 2px 12px;">Supplier names, order emails and branches. Branches can be picked when you order for collection or add to a Collection List.</p>
    ${suppliers.map(s=>{
      const open = suppliersAdminOpen===s.id; const brs = Array.isArray(s.branches) ? s.branches : [];
      return `<div class="card" style="padding:0;overflow:hidden;margin-bottom:10px;">
        <div class="ddrow" style="margin:0;padding:12px;" onclick="suppliersAdminOpen=${open?'null':`'${s.id}'`};render()">
          <span class="arrow">${open?'▼':'▶'}</span><b style="flex:1;min-width:0;">${escapeHtml(s.name)}${s.favourite?' <span style="color:#D9A441;">★</span>':''}</b>
          <span class="stub" style="margin:0;white-space:nowrap;">${brs.length} branch${brs.length===1?'':'es'}</span>
        </div>
        ${open ? `<div style="padding:0 12px 12px;">
          <div class="formfield"><label class="field-label">Name</label><input type="text" value="${escapeHtml(s.name)}" onblur="saveSupplierField(this,'${s.id}','name')"></div>
          <div class="formfield"><label class="field-label">Order email</label><input type="email" value="${escapeHtml(s.email||'')}" onblur="saveSupplierField(this,'${s.id}','email')"></div>
          <p class="opmat-h" style="margin-top:6px;">Branches</p>
          ${brs.map(b=>`<div class="supbranch">
            <input type="text" placeholder="Branch name, e.g. Stockton" value="${escapeHtml(b.name||'')}" onblur="saveBranchField('${s.id}','${b.id}','name',this.value)">
            <input type="text" placeholder="Address" value="${escapeHtml(b.address||'')}" onblur="saveBranchField('${s.id}','${b.id}','address',this.value)">
            <div style="display:flex;gap:6px;"><input type="tel" placeholder="Phone (optional)" style="flex:1;" value="${escapeHtml(b.phone||'')}" onblur="saveBranchField('${s.id}','${b.id}','phone',this.value)"><button class="ghostbtn" style="width:auto;color:var(--warn);" onclick="deleteBranch('${s.id}','${b.id}')">🗑</button></div>
          </div>`).join('') || `<p class="stub" style="margin:0 0 8px;">No branches yet.</p>`}
          <div class="row-gap"><button class="ghostbtn" style="flex:1;" onclick="addBranch('${s.id}')">+ Add branch</button><button class="ghostbtn" style="flex:1;color:var(--warn);" onclick="deleteSupplier(null,'${s.id}')">Delete supplier</button></div>
        </div>` : ''}
      </div>`;
    }).join('') || `<div class="empty">No suppliers yet.</div>`}
    ${supplierAddOpen ? `<div class="card">
      <div class="formfield"><input type="text" id="supName" placeholder="Supplier name"></div>
      <div class="formfield"><input type="email" id="supEmail" placeholder="Supplier order email"></div>
      <div class="row-gap"><button class="darkbtn" style="flex:1;" onclick="addSupplier(null)">Add Supplier</button><button class="ghostbtn" style="flex:1;" onclick="supplierAddOpen=false;render()">Cancel</button></div>
    </div>` : `<button class="darkbtn" onclick="supplierAddOpen=true;render()">+ Add Supplier</button>`}
  `;
  if(__gen === RENDER_GEN) document.getElementById('app').innerHTML = shell(html, {title:'Suppliers', back:'#/team/libraries'});
}
async function updateSupplierBranches(supplierId, fn){
  const s = (await dbSelect('suppliers', 'id=eq.'+supplierId))[0]; if(!s) return null;
  const brs = fn((Array.isArray(s.branches) ? s.branches : []).map(b=>Object.assign({}, b)));
  return await dbUpdate('suppliers', supplierId, {branches: brs});
}
window.addBranch = async function(supplierId){
  const row = await updateSupplierBranches(supplierId, brs=>brs.concat([{id:'b'+Math.random().toString(36).slice(2,9), name:'', address:'', phone:''}]));
  if(row) render();
};
window.saveBranchField = async function(supplierId, branchId, field, value){
  const row = await updateSupplierBranches(supplierId, brs=>brs.map(b=>b.id===branchId ? Object.assign(b, {[field]: String(value||'').trim()}) : b));
  if(row){ const s = (window.MAT_SUPPLIERS||[]).find(x=>x.id===supplierId); if(s) s.branches = row.branches; toast('Saved'); }
};
window.deleteBranch = async function(supplierId, branchId){
  if(!(await customConfirm('Delete this branch?'))) return;
  const row = await updateSupplierBranches(supplierId, brs=>brs.filter(b=>b.id!==branchId));
  if(row) render();
};

// ---------- GRN (goods received) ----------
let grnOpenFor = null;      // material id whose GRN form is open
let grnDraft = {ok:true, notes:'', photos:[]}; // photos: data URLs (compressed)
window.openGrn = function(id){ grnOpenFor = grnOpenFor===id ? null : id; grnDraft = {ok:true, notes:'', photos:[]}; render(); };
function grnFormHtml(siteId, m){
  return `<div class="grnform">
    <label class="grnchk"><input type="checkbox" ${grnDraft.ok?'checked':''} onchange="grnDraft.ok=this.checked;render()"> Everything received and correct</label>
    <div class="formfield" style="margin-top:8px;"><label class="field-label">${grnDraft.ok ? 'Notes (optional)' : 'What\'s wrong? (shortages, damage, wrong items)'}</label>
      <textarea rows="3" oninput="grnDraft.notes=this.value" placeholder="${grnDraft.ok?'e.g. left by the welfare unit':'e.g. 2 packs short, 1 damaged'}">${escapeHtml(grnDraft.notes)}</textarea></div>
    ${grnDraft.photos.length ? `<div class="grnthumbs">${grnDraft.photos.map((p,i)=>`<div class="grnthumb"><img src="${p}"><span onclick="grnDraft.photos.splice(${i},1);render()">✕</span></div>`).join('')}</div>` : ''}
    <label class="ghostbtn" style="display:block;text-align:center;cursor:pointer;margin:0 0 8px;">📷 Add photos<input type="file" accept="image/*" multiple style="display:none;" onchange="grnAddPhotos(this)"></label>
    <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="saveGrn('${siteId}','${m.id}')">✓ Save GRN</button><button class="ghostbtn" style="flex:1;" onclick="grnOpenFor=null;render()">Cancel</button></div>
  </div>`;
}
window.grnAddPhotos = async function(input){
  const files = Array.from(input.files||[]);
  for(const f of files){ try{ const d = await compressImage(f, {maxW:1600, quality:0.82}); if(d) grnDraft.photos.push(d); }catch(e){} }
  render();
};
window.saveGrn = async function(siteId, matId){
  if(!grnDraft.ok && !grnDraft.notes.trim()){ toast('Add a note saying what\'s wrong'); return; }
  toast('Saving…');
  const paths = [];
  for(const d of grnDraft.photos){
    const p = await uploadDataUrl('site-photos', siteId+'/grn/'+matId+'/'+uid()+'.jpg', d);
    if(p) paths.push(p);
  }
  if(paths.length < grnDraft.photos.length){ customAlert('Some photos could not upload — check signal and try again.'); return; }
  const grn = {at:new Date().toISOString(), by:ME.id, byName:ME.name||'', ok:!!grnDraft.ok, notes:grnDraft.notes.trim(), photos:paths};
  const row = await dbUpdate('materials', matId, {grn});
  if(!row) return;
  const item = row.item + (row.qty ? ' × '+row.qty : '');
  logSiteActivity(siteId, 'material_grn', `Goods received: ${item}${grn.ok ? '' : ' — PROBLEM: '+grn.notes}`);
  if(!grn.ok || grn.notes || paths.length) postSystemMessage(siteId, 'material_grn', `${ME.name} received "${item}"${grn.ok ? '' : ' with a problem'}${grn.notes ? ': '+grn.notes : ''}${paths.length ? ' ('+paths.length+' photo'+(paths.length>1?'s':'')+')' : ''}`);
  grnOpenFor = null; grnDraft = {ok:true, notes:'', photos:[]};
  toast(grn.ok ? 'Goods received ✓' : 'Saved — managers told about the problem');
  render();
};
function matGrnTag(g){
  return g.ok ? `<span class="opmat-pill" style="background:#DDF3E3;color:#1E7A3C;">GRN ✓</span>` : `<span class="opmat-pill" style="background:#FDE2E0;color:#B3261E;">GRN ⚠</span>`;
}
function matDoneTag(m){
  if(m.status==='cancelled') return `<span class="opmat-pill" style="background:#EEE;color:#666;">Cancelled</span>`;
  if(m.status==='sent' || m.merchant || m.sent_at) return `<span class="opmat-pill" style="background:#E3EEFA;color:#1F5FA6;">${m.fulfilment==='collection'?'Collection':'Ordered'}</span>`;
  if(/Collection List/.test(m.order_note||'')) return `<span class="opmat-pill" style="background:#FCEFD2;color:#8A5A00;">To collect</span>`;
  return `<span class="opmat-pill" style="background:#EEE;color:#666;">Closed</span>`;
}
function matGrnDetailHtml(m){
  const g = m.grn; if(!g) return '';
  return `<div class="grndetail ${g.ok?'ok':'bad'}">
    <b>${g.ok ? '✓ Goods received' : '⚠ Received with a problem'}</b> · ${escapeHtml(g.byName||nameOf(g.by))} · ${new Date(g.at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
    ${g.notes ? `<div style="margin-top:4px;white-space:pre-wrap;">${escapeHtml(g.notes)}</div>` : ''}
    ${(g.photos||[]).length ? `<div class="grnthumbs" style="margin-top:6px;">${g.photos.map(p=>`<div class="grnthumb" onclick="event.stopPropagation();viewDrawing('${publicUrl('site-photos', p)}', true)"><img src="${publicUrl('site-photos', p)}"></div>`).join('')}</div>` : ''}
  </div>`;
}
