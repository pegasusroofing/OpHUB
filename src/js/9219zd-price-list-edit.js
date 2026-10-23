/* ============================================================
   OpHUB Finance — edit or duplicate a price list / quote (23 Oct 2026, Andy: "when we
   upload a yearly price list I need to be able to edit it and/or duplicate it — the
   supplier didn't pull through").
   Edit: supplier (pick from your suppliers or type), ref, date, and every line (wording,
   code, unit, rate) — add or remove lines. Duplicate: a copy to update for next year.
   ============================================================ */
let finPlEdit = null;
window.openFinPlEdit = async function(qid){
  const [q, items, mats] = await Promise.all([
    dbSelect('fin_quotes', 'id=eq.'+qid).then(r=>r[0]).catch(()=>null),
    dbSelect('fin_quote_items', 'quote_id=eq.'+qid+'&order=position.asc&limit=10000').catch(()=>[]),
    dbSelect('suppliers', 'org_id=eq.'+ME.org_id+'&select=id,name&order=name.asc').catch(()=>[]),
  ]);
  if(!q){ toast('That price list has gone.'); return; }
  finPlEdit = {q:Object.assign({}, q), items:items.map(i=>Object.assign({}, i)), removed:[], mats};
  finPlPaint();
};
function finPlPaint(){
  const E = finPlEdit; if(!E) return;
  let ov = document.getElementById('finPlOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finPlOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  const q = E.q, v = x=>escapeHtml(x==null?'':String(x));
  ov.innerHTML = `<div class="geo-modal-card finpl-card">
    <h3 style="margin:0 0 4px;">${q.site_id ? 'Edit Project Quote' : 'Edit Price List'}</h3>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">${escapeHtml(q.file_name||'')}${q.site_id ? ' · this project only' : ' · applies to every project'}</p>
    <div class="finpl-g">
      <div class="formfield"><label class="field-label">Supplier</label><input type="text" list="finPlSupList" value="${v(q.supplier_name)}" placeholder="Choose or type" oninput="finPlEdit.q.supplier_name=this.value"><datalist id="finPlSupList">${E.mats.map(m=>`<option value="${escapeHtml(m.name)}">`).join('')}</datalist></div>
      <div class="formfield"><label class="field-label">Ref / Year</label><input type="text" value="${v(q.quote_no)}" placeholder="e.g. 2026 price list" oninput="finPlEdit.q.quote_no=this.value"></div>
      <div class="formfield"><label class="field-label">Date</label><input type="date" value="${v(q.quote_date)}" onchange="finPlEdit.q.quote_date=this.value"></div>
    </div>
    <div class="finpl-th"><span>Item</span><span>Code</span><span>Unit</span><span>Rate</span><span></span></div>
    <div class="finpl-lines">${E.items.map((it,i)=>`<div class="finpl-row">
      <input type="text" value="${v(it.description)}" oninput="finPlEdit.items[${i}].description=this.value">
      <input type="text" value="${v(it.code)}" oninput="finPlEdit.items[${i}].code=this.value">
      <input type="text" value="${v(it.unit)}" oninput="finPlEdit.items[${i}].unit=this.value">
      <input type="text" inputmode="decimal" value="${it.rate!=null?it.rate:''}" placeholder="£" oninput="finPlEdit.items[${i}].rate=this.value">
      <button type="button" class="linkbtn" style="color:var(--red);" aria-label="Remove line" onclick="finPlDel(${i})">✕</button></div>`).join('') || '<div class="empty" style="margin:0;">No lines.</div>'}</div>
    <button type="button" class="ghostbtn" style="width:auto;margin:8px 0 0;" onclick="finPlEdit.items.push({description:'',code:'',unit:'',rate:null,active:true});finPlPaint()">+ Add line</button>
    <div style="display:flex;gap:8px;margin-top:14px;"><button class="ghostbtn" style="margin:0;" onclick="document.getElementById('finPlOverlay').style.display='none'">Cancel</button><button class="darkbtn" id="finPlSave" style="margin:0;" onclick="finPlSave()">Save</button></div>
  </div>`;
  ov.style.display = 'flex';
}
window.finPlDel = function(i){ const it = finPlEdit.items.splice(i,1)[0]; if(it && it.id) finPlEdit.removed.push(it.id); finPlPaint(); };
window.finPlSave = async function(){
  const E = finPlEdit; if(!E) return;
  const btn = document.getElementById('finPlSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const q = E.q, sup = String(q.supplier_name||'').trim() || null;
  const ok = await dbUpdate('fin_quotes', q.id, {supplier_name:sup, quote_no:String(q.quote_no||'').trim()||null, quote_date:q.quote_date||null});
  if(!ok){ if(btn){ btn.disabled = false; btn.textContent = 'Save'; } return; }
  for(const id of E.removed) await dbDelete('fin_quote_items', id);
  const num = x=>{ const n = finNum(x); return n===null || isNaN(n) ? null : finRound4(n); };
  const newRows = [];
  for(let i=0;i<E.items.length;i++){
    const it = E.items[i], desc = String(it.description||'').trim(); if(!desc){ if(it.id) await dbDelete('fin_quote_items', it.id); continue; }
    const row = {description:desc.slice(0,300), code:String(it.code||'').trim()||null, unit:String(it.unit||'').trim()||null, rate:num(it.rate), supplier_name:sup, position:i};
    if(it.id) await dbUpdate('fin_quote_items', it.id, row);
    else newRows.push(Object.assign({org_id:ME.org_id, quote_id:q.id, site_id:q.site_id||null, active:true, created_by:ME.id}, row));
  }
  if(newRows.length) await sbFetch('/rest/v1/fin_quote_items', {method:'POST', body:JSON.stringify(newRows)});
  document.getElementById('finPlOverlay').style.display = 'none';
  if(typeof finPqCache!=='undefined') finPqCache = {};
  toast('Saved'); finPlEdit = null;
  const sid = (parseRoute()||[])[1]; if(document.getElementById('finPpBody') && sid) finPpFill(sid); else render();
};
window.finPlDuplicate = async function(qid){
  const [q, items] = await Promise.all([dbSelect('fin_quotes', 'id=eq.'+qid).then(r=>r[0]).catch(()=>null), dbSelect('fin_quote_items', 'quote_id=eq.'+qid+'&order=position.asc&limit=10000').catch(()=>[])]);
  if(!q) return;
  const ref = await customPrompt('Name for the copy (e.g. 2027 price list)', (q.quote_no ? q.quote_no+' (copy)' : 'Copy')); if(ref==null) return;
  const ins = await dbInsert('fin_quotes', {org_id:ME.org_id, site_id:q.site_id||null, purpose:'pquote', supplier_name:q.supplier_name, quote_no:String(ref).trim()||null, quote_date:finToday(), file_path:q.file_path, file_name:q.file_name, lines:[], read_by:'copy', created_by:ME.id});
  const nid = ins && ins[0] && ins[0].id; if(!nid){ toast('Could not copy it.'); return; }
  if(items.length) await sbFetch('/rest/v1/fin_quote_items', {method:'POST', body:JSON.stringify(items.map(i=>({org_id:ME.org_id, quote_id:nid, site_id:i.site_id, supplier_name:i.supplier_name, code:i.code, description:i.description, unit:i.unit, rate:i.rate, position:i.position, active:i.active!==false, created_by:ME.id})))});
  if(typeof finPqCache!=='undefined') finPqCache = {};
  toast('Copied — opening it so you can update it'); render(); openFinPlEdit(nid);
};
// Price List page rows and the project quote strip get Edit / Duplicate.
(function(){
  const rp = renderFinPriceLists;
  renderFinPriceLists = async function(){
    const r = await rp.apply(this, arguments);
    document.querySelectorAll('#app button[onclick^="finPqDelete(\'__all\'"]').forEach(b=>{
      const m = /finPqDelete\('__all','([^']+)'\)/.exec(b.getAttribute('onclick')||''); if(!m) return;
      b.insertAdjacentHTML('beforebegin', `<button class="linkbtn" onclick="openFinPlEdit('${m[1]}')">Edit</button> <button class="linkbtn" onclick="finPlDuplicate('${m[1]}')">Duplicate</button> `);
    });
    document.querySelectorAll('#app .finreptbl-wrap tbody tr').forEach(tr=>{ const b = tr.querySelector('button[onclick^="openFinPlEdit"]'); const sup = tr.querySelector('td[data-l="Supplier"] b'); if(b && sup && sup.textContent.trim()==='—'){ sup.innerHTML = `<button class="linkbtn" style="color:var(--warn);" onclick="${b.getAttribute('onclick')}">No supplier — set it</button>`; } });
    return r;
  };
  const pane = finPqPaneHtml;
  finPqPaneHtml = async function(siteId){
    let h = await pane.apply(this, arguments);
    return h.replace(/<button class="linkbtn" style="color:var\(--red\);" onclick="finPqDelete\('([^']+)','([^']+)'\)">Remove<\/button>/, (m, s, q)=>`<button class="linkbtn" onclick="openFinPlEdit('${q}')">Edit</button> <button class="linkbtn" onclick="finPlDuplicate('${q}')">Duplicate</button> `+m);
  };
  window.finPqPaneHtml = finPqPaneHtml;
  const st = document.createElement('style');
  st.textContent = `.finpl-card{max-width:860px !important;width:min(860px,96vw);max-height:92vh;overflow:auto;}
.finpl-g{display:grid;grid-template-columns:2fr 1.4fr 1fr;gap:10px;}
.finpl-g .formfield{margin:0;}
.finpl-th, .finpl-row{display:grid;grid-template-columns:minmax(0,1fr) 110px 70px 90px 24px;gap:6px;align-items:center;}
.finpl-th{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--slate);margin:12px 0 4px;}
.finpl-th span:nth-child(n+2){text-align:center;}
.finpl-row{padding:3px 0;border-bottom:1px solid #F0F2F5;}
.finpl-row input{height:30px !important;min-height:30px !important;padding:0 8px !important;font-size:13px !important;border-radius:7px !important;margin:0 !important;box-sizing:border-box;width:100%;}
.finpl-row input:nth-child(n+2){text-align:center;}
@media (max-width:640px){ .finpl-g{grid-template-columns:1fr;} .finpl-th, .finpl-row{grid-template-columns:1fr 70px 60px 24px;} .finpl-row input:nth-child(2), .finpl-th span:nth-child(2){display:none;} }`;
  document.head.appendChild(st);
})();
