/* ============================================================
   OpHUB — Projects suppliers ↔ Finance Directory suppliers (23 Oct 2026, Andy: "link the
   suppliers in the projects with the supplier in the directory, without either one
   affecting either").
   Two separate records, joined by fin_suppliers.supplier_id → suppliers.id:
   - Projects (Admin › Suppliers): name, order email, account no., branches — for ordering.
   - Finance Directory: accounts email, VAT, terms, cost code, Xero — for paying.
   Linking only joins them (so POs, VAT defaults and spend line up); nothing is copied
   across and editing one never changes the other.
   ============================================================ */
let finLinkMat = null, finLinkFin = null;
async function finLinkLoad(){
  const [mat, fin] = await Promise.all([
    dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name,email&order=name.asc').catch(()=>[]),
    typeof isFinanceUser==='function' && isFinanceUser() ? dbSelect('fin_suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name,supplier_id&order=name.asc&limit=5000').catch(()=>[]) : Promise.resolve([]),
  ]);
  finLinkMat = mat; finLinkFin = fin;
}

/* ---- Directory supplier form: "Projects Supplier" link ---- */
(function(){
  const base = finDirPaint;
  finDirPaint = function(){
    const r = base.apply(this, arguments);
    const D = finDir; if(!D || D.kind!=='supplier') return r;
    const lab = Array.from(document.querySelectorAll('#finDirOverlay .field-label')).find(l=>/Material Requests/.test(l.textContent));
    const ff = lab && lab.closest('.formfield'); if(!ff) return r;
    const paint = ()=>{
      const mats = finLinkMat || [];
      const used = {}; (finLinkFin||[]).forEach(f=>{ if(f.supplier_id && f.id!==D.rec.id) used[f.supplier_id] = f.name; });
      const cur = D.unlink ? '' : D.toMat ? '__new' : (D.mat ? D.mat.id : '');
      ff.innerHTML = `<label class="field-label">Projects Supplier (ordering)</label>
        <select onchange="finDirLinkPick(this.value)"><option value="" ${!cur?'selected':''}>Not linked</option>${mats.map(m=>`<option value="${m.id}" ${cur===m.id?'selected':''}>${escapeHtml(m.name)}${used[m.id]?' (linked to '+escapeHtml(used[m.id])+')':''}</option>`).join('')}<option value="__new" ${cur==='__new'?'selected':''}>+ Add to the Projects supplier list</option></select>
        <p class="stub" style="margin:4px 0 0;font-style:normal;font-size:12px;">Links this Directory record to the supplier you order from on projects. They stay separate — changing one never changes the other.</p>`;
    };
    if(!finLinkMat) finLinkLoad().then(paint); else paint();
    return r;
  };
  window.finDirLinkPick = function(v){
    const D = finDir; if(!D) return;
    D.toMat = v==='__new'; D.unlink = !v && !!(D.rec.id && D.rec.supplier_id);
    D.mat = v && v!=='__new' ? ((finLinkMat||[]).find(m=>m.id===v) || null) : null;
  };
  const save = window.saveFinDir;
  window.saveFinDir = async function(){
    const D = finDir; const unlinkId = D && D.kind==='supplier' && D.unlink && D.rec.id ? D.rec.id : null;
    const r = await save.apply(this, arguments);
    if(unlinkId) await dbUpdate('fin_suppliers', unlinkId, {supplier_id:null});
    finLinkMat = null;
    return r;
  };
  const open = window.openFinDirEdit;
  window.openFinDirEdit = async function(){ await finLinkLoad(); return open.apply(this, arguments); };
})();

/* ---- Projects › Admin › Suppliers: show / set the Finance Directory link ---- */
(function(){
  const base = renderSuppliersAdmin;
  renderSuppliersAdmin = async function(){
    const r = await base.apply(this, arguments);
    if(!(typeof isFinanceUser==='function' && isFinanceUser())) return r;
    const id = typeof suppliersAdminOpen!=='undefined' ? suppliersAdminOpen : null; if(!id) return r;
    await finLinkLoad();
    const nameIn = document.querySelector(`input[onblur*="saveSupplierField(this,'${id}','name')"]`); const ff = nameIn && nameIn.closest('.formfield'); if(!ff) return r;
    const linked = (finLinkFin||[]).find(f=>f.supplier_id===id);
    ff.insertAdjacentHTML('afterend', `<div class="formfield"><label class="field-label">Finance Directory (accounts)</label>
      <select onchange="finMatLinkPick('${id}', this.value)"><option value="" ${!linked?'selected':''}>Not linked</option>${(finLinkFin||[]).map(f=>`<option value="${f.id}" ${linked && linked.id===f.id?'selected':''}>${escapeHtml(f.name)}${f.supplier_id && f.supplier_id!==id ? ' (linked to another)' : ''}</option>`).join('')}<option value="__new">+ Add to the Finance Directory</option></select>
      <p class="stub" style="margin:4px 0 0;font-style:normal;font-size:12px;">Links this supplier to its accounts record (VAT, terms, Xero). They stay separate — changing one never changes the other.</p></div>`);
    return r;
  };
  window.finMatLinkPick = async function(matId, v){
    const prev = (finLinkFin||[]).filter(f=>f.supplier_id===matId);
    if(v==='__new'){
      const m = (finLinkMat||[]).find(x=>x.id===matId) || {};
      for(const p of prev) await dbUpdate('fin_suppliers', p.id, {supplier_id:null});
      const ins = await dbInsert('fin_suppliers', {org_id:ME.org_id, created_by:ME.id, name:m.name, supplier_id:matId});
      toast(ins ? 'Added to the Finance Directory and linked' : 'Could not add it'); render(); return;
    }
    for(const p of prev) if(p.id!==v) await dbUpdate('fin_suppliers', p.id, {supplier_id:null});
    if(v){
      const f = (finLinkFin||[]).find(x=>x.id===v);
      if(f && f.supplier_id && f.supplier_id!==matId && !(await customConfirm(`${f.name} is linked to another Projects supplier. Link it to this one instead?`))){ render(); return; }
      await dbUpdate('fin_suppliers', v, {supplier_id:matId});
    }
    toast(v ? 'Linked to the Finance Directory' : 'Unlinked'); render();
  };
})();

/* A supplier added on a PO (Projects list) links itself to a Directory record of the same name, if there's one not already linked. */
(function(){
  const save = window.saveFinNewPo; if(!save) return;
  window.saveFinNewPo = async function(){
    const wasNew = (document.getElementById('finNpoSup')||{}).value==='__new';
    const name = wasNew ? finVal('finNpoSupName') : '';
    const r = await save.apply(this, arguments);
    if(wasNew && name){
      const [m, f] = await Promise.all([
        dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&name=ilike.'+encodeURIComponent(name.replace(/[*%,()]/g,''))+'&select=id').catch(()=>[]),
        dbSelect('fin_suppliers', 'org_id=eq.'+ME.org_id+'&name=ilike.'+encodeURIComponent(name.replace(/[*%,()]/g,''))+'&supplier_id=is.null&select=id').catch(()=>[]),
      ]);
      if(m.length===1 && f.length===1) await dbUpdate('fin_suppliers', f[0].id, {supplier_id:m[0].id});
    }
    return r;
  };
})();
