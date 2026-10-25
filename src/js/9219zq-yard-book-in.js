/* ============================================================
   Yard — book stock in (25 Oct 2026, Andy: "yard book stock in needs to have a section in
   projects and in the finance. allow for pms / drivers to do this, and put in the material
   tab in projects").
   - Projects › Materials: a "⬇ Book into yard" chip for PMs / admins (next to 📦 Yard stock).
   - Drivers: a "Book Stock Into The Yard" tile on their home screen.
   - Finance › Purchases › Yard stock: "⬇ Book stock in" opens the same form.
   The form records the item and qty, who it came from, the PO or delivery note number and a
   photo of the delivery note. Finance users can pick the PO itself (links the booking to it).
   Each section lists the latest bookings in. Drivers can book in only — the count and the
   rates stay with the office (database: "drivers book stock in").
   ============================================================ */
function yardBookInCan(){ return !!ME && (yardCanEdit() || ME.role==='driver'); }
let yardIn = null;   // {photo:File|null}
window.yardBookInOpen = async function(){
  if(!yardBookInCan()){ toast('Only managers, drivers and Finance can book stock in.'); return; }
  const [Y, recent, pos] = await Promise.all([
    yardLoad(true),
    dbSelect('yard_moves', 'org_id=eq.'+ME.org_id+'&kind=eq.in&order=created_at.desc&limit=15&select=id,stock_id,qty,note,ref,supplier_name,po_id,photo_path,created_by,created_at').catch(()=>[]),
    (typeof isFinanceUser==='function' && isFinanceUser()) ? dbSelect('purchase_orders', 'org_id=eq.'+ME.org_id+'&status=not.in.(cancelled,closed)&order=created_at.desc&limit=200&select=id,number,supplier_name,site_id').catch(()=>[]) : Promise.resolve([]),
    typeof loadAllProfiles==='function' ? loadAllProfiles() : null,
  ]);
  const items = Y.items.filter(s=>s.active!==false);
  yardIn = {photo:null};
  const byId = {}; Y.items.forEach(s=>byId[s.id] = s);
  let ov = document.getElementById('yardInOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'yardInOverlay'; ov.className = 'geo-modal-overlay'; }
  document.body.appendChild(ov);
  ov.onclick = e=>{ if(e.target===ov) ov.style.display = 'none'; };
  ov.innerHTML = `<div class="geo-modal-card yardin-card">
    <div class="yardin-h"><h3 style="margin:0;">⬇ Book Stock Into The Yard</h3><button type="button" class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="document.getElementById('yardInOverlay').style.display='none'">✕</button></div>
    ${items.length ? `
    <div class="formfield"><label class="field-label">Item</label><select id="yiItem">${items.map(s=>`<option value="${s.id}">${escapeHtml(s.item)} — ${yardQty(s.qty)} ${escapeHtml(s.unit||'')} in yard</option>`).join('')}</select>
      ${yardCanEdit() ? `<button type="button" class="linkbtn" style="margin-top:4px;" onclick="document.getElementById('yardInOverlay').style.display='none';yardItemOpen('')">+ Not on the list? Add a new item</button>` : `<span class="stub" style="display:block;margin:4px 0 0;font-size:12px;font-style:normal;">Not on the list? Book it with a note and ask the office to add it.</span>`}</div>
    <div class="fingrid2">
      <div class="formfield"><label class="field-label">Qty</label><input type="text" inputmode="decimal" id="yiQty" placeholder="e.g. 40"></div>
      <div class="formfield"><label class="field-label">From (supplier)</label><input type="text" id="yiSup" placeholder="e.g. SIG, or job 2653 leftovers"></div>
    </div>
    ${pos.length ? `<div class="formfield"><label class="field-label">Purchase order (optional)</label><select id="yiPo" onchange="yardInPoPick(this)"><option value="">None</option>${pos.map(p=>`<option value="${p.id}" data-sup="${escapeHtml(p.supplier_name||'')}" data-no="${escapeHtml(p.number||'')}">${escapeHtml(p.number||'PO')} · ${escapeHtml(p.supplier_name||'')}</option>`).join('')}</select></div>` : ''}
    <div class="formfield"><label class="field-label">PO or delivery note number</label><input type="text" id="yiRef" placeholder="e.g. J101-PO-004 or DN 55231"></div>
    <div class="formfield"><label class="field-label">Photo of the delivery note (optional)</label><input type="file" id="yiPhoto" accept="image/*" capture="environment" onchange="yardIn.photo=this.files&&this.files[0]||null"></div>
    <div class="formfield"><label class="field-label">Note (optional)</label><input type="text" id="yiNote" placeholder="e.g. 2 damaged, left in bay 3"></div>
    <button type="button" class="darkbtn" id="yiGo" style="width:100%;" onclick="yardBookInSave()">Book In</button>`
    : `<div class="empty">The yard list is empty. ${yardCanEdit() ? `<button type="button" class="linkbtn" onclick="document.getElementById('yardInOverlay').style.display='none';yardItemOpen('')">Add the first item</button>` : 'Ask the office to add the yard items first.'}</div>`}
    <p class="sectiontitle" style="margin:16px 0 6px;">Recently Booked In</p>
    <div class="yardin-list">${recent.length ? recent.map(m=>{ const s = byId[m.stock_id] || {}; const who = (PROFILES[m.created_by]||{}).name || '';
      return `<div class="yardin-row"><div><b>${escapeHtml(s.item||'Item')}</b><span>${new Date(m.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}${who?' · '+escapeHtml(who):''}${m.supplier_name?' · '+escapeHtml(m.supplier_name):''}${m.ref?' · '+escapeHtml(m.ref):''}${m.note?' · '+escapeHtml(m.note):''}</span></div>
        <div class="yardin-q">+${yardQty(m.qty)} ${escapeHtml(s.unit||'')}${m.photo_path?` <button type="button" class="linkbtn" onclick="viewImage('${jsAttr(publicUrl('site-photos', m.photo_path))}')">📷</button>`:''}</div></div>`; }).join('') : '<div class="empty" style="margin:0;">Nothing booked in yet.</div>'}</div>
  </div>`;
  ov.style.display = 'flex';
};
window.yardInPoPick = function(sel){
  const o = sel.options[sel.selectedIndex]; if(!o || !o.value) return;
  const sup = document.getElementById('yiSup'), ref = document.getElementById('yiRef');
  if(sup && !sup.value) sup.value = o.dataset.sup || '';
  if(ref) ref.value = o.dataset.no || '';
};
let yardInBusy = false;
window.yardBookInSave = async function(){
  if(yardInBusy) return;
  const stockId = finVal('yiItem'); const s = yardCache && yardCache.items.find(x=>x.id===stockId);
  if(!s){ toast('Choose the item.'); return; }
  const q = yardNum(finVal('yiQty'));
  if(q==null || !(q > 0)){ toast('Enter the qty as a number.'); return; }
  yardInBusy = true;
  const btn = document.getElementById('yiGo'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  try{
    let photo = null;
    if(yardIn && yardIn.photo){
      const safe = String(yardIn.photo.name||'delivery.jpg').replace(/[^a-z0-9.\-]+/gi,'_').slice(-60);
      photo = await uploadToStorage('site-photos', ME.org_id+'/yard/'+uid()+'-'+safe, yardIn.photo, yardIn.photo.type||'image/jpeg');
      if(!photo){ return; }
    }
    const row = {org_id:ME.org_id, stock_id:stockId, kind:'in', qty:q, site_id:null, note:finVal('yiNote')||null, created_by:ME.id,
      ref:finVal('yiRef')||null, supplier_name:finVal('yiSup')||null, po_id:finVal('yiPo')||null, photo_path:photo};
    const ins = await dbInsert('yard_moves', row);
    if(!ins) return;
    yardCache = null;
    document.getElementById('yardInOverlay').style.display = 'none';
    toast(`Booked in — ${yardQty(Number(s.qty||0)+q)} ${s.unit||''} now in the yard`);
    render();
  } finally { yardInBusy = false; if(btn){ btn.disabled = false; btn.textContent = 'Book In'; } }
};

// Projects › Materials: chip next to "📦 Yard stock"
(function(){
  if(typeof matTopTabsHtml!=='function') return;
  const base = matTopTabsHtml;
  matTopTabsHtml = function(){
    let h = base.apply(this, arguments);
    if(yardBookInCan()) h = h.replace(/<\/div>\s*$/, `<div class="filterchip yardchip" onclick="yardBookInOpen()">⬇ Book into yard</div></div>`);
    return h;
  };
})();
// Finance yard page and the 📦 Yard stock pop-up: "Book stock in" uses this form
(function(){
  const base = window.yardMoveOpen;
  if(typeof base==='function') window.yardMoveOpen = function(kind, stockId, siteId, materialId){
    if(kind==='in' && !materialId) return yardBookInOpen();
    return base.apply(this, arguments);
  };
})();
// Drivers: a tile on their home screen
(function(){
  if(typeof renderDriverHome!=='function') return;
  const base = renderDriverHome;
  renderDriverHome = async function(){
    const r = await base.apply(this, arguments);
    try{
      const grid = document.querySelector('#app .tilegrid');
      if(grid && !document.getElementById('yardInTile')){
        const t = document.createElement('div'); t.className = 'tile'; t.id = 'yardInTile'; t.onclick = ()=>yardBookInOpen();
        t.innerHTML = `<div class="icon" style="background:#EEF4FF;color:#1D4ED8;">📦</div><div class="lbl">Book Stock Into The Yard</div><div class="sub">Deliveries and leftovers</div>`;
        grid.appendChild(t);
      }
    }catch(e){}
    return r;
  };
})();
(function(){
  const st = document.createElement('style');
  st.textContent = `.yardin-card{max-width:520px;}
.yardin-h{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;}
.yardin-list{display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto;}
.yardin-row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;border:1px solid var(--line,#ECEEF2);border-radius:10px;padding:8px 10px;}
.yardin-row b{display:block;font-size:13.5px;} .yardin-row span{font-size:12px;color:var(--slate);}
.yardin-q{font-weight:800;white-space:nowrap;color:#1E7A43;}`;
  document.head.appendChild(st);
})();
