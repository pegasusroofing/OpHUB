/* ============================================================
   OpHUB Finance › Projects › Clients (21 Oct 2026, Andy): one list of
   clients that talks to Xero — "Pull from Xero" brings in every Xero
   customer, "+ New client" adds one here and in Xero, and a client only
   in OpHUB can be pushed to Xero. Each client's jobs sit in a drop-down.
   Stored in fin_clients (finance only); clients named on projects /
   invoices but not saved yet are still listed.
   ============================================================ */
let finCliBusy = '';
async function finClientsHtml(jfBy, invs){
  const saved = await dbSelect('fin_clients', 'org_id=eq.'+ME.org_id+'&order=name.asc&limit=5000').catch(()=>[]);
  const by = {};
  const key = n=>String(n||'').trim().toLowerCase();
  saved.forEach(c=>{ by[key(c.name)] = {name:c.name, rec:c, email:c.email||'', jobs:[], live:0, owed:0, overdue:0}; });
  SITES.forEach(s=>{ const name = (jfBy[s.id]||{}).billing_name || s.client_name || ''; if(!name) return;
    const c = by[key(name)] = by[key(name)] || {name, rec:null, email:(jfBy[s.id]||{}).billing_email||s.client_email||'', jobs:[], live:0, owed:0, overdue:0};
    c.jobs.push(s); if(finSiteStatus(s)==='live') c.live++; if(!c.email) c.email = (jfBy[s.id]||{}).billing_email||s.client_email||''; });
  (invs||[]).forEach(i=>{ const s = SITES.find(x=>x.id===i.site_id); if(!s || i.status==='void') return; const name = (jfBy[s.id]||{}).billing_name || s.client_name || ''; const c = by[key(name)]; if(!c) return;
    c.owed += finInvOutstanding(i); if(finInvOverdue(i)) c.overdue += finInvOutstanding(i); });
  const noClient = SITES.filter(s=>!((jfBy[s.id]||{}).billing_name || s.client_name));
  const list = Object.values(by).sort((a,b)=>a.name.localeCompare(b.name));
  const inXero = list.filter(c=>c.rec && c.rec.xero_contact_id).length;
  const jobsDd = c=>c.jobs.length ? `<details class="fincli-dd" onclick="event.stopPropagation()"><summary>${c.jobs.length} job${c.jobs.length===1?'':'s'} · ${c.live} live</summary><div>${c.jobs.map(j=>`<button type="button" class="linkbtn" onclick="go('#/site/${j.id}/finance')">${escapeHtml(finRepJobOr(j))}</button>`).join('')}</div></details>` : '<span class="stub" style="margin:0;">No jobs yet</span>';
  const xTag = c=>c.rec && c.rec.xero_contact_id ? '<span class="finpill ok">In Xero</span>' : `<button type="button" class="ghostbtn finsmall" onclick="event.stopPropagation();finCliPush('${jsAttr(c.name)}')" ${finCliBusy?'disabled':''}>Add to Xero</button>`;
  return `<div class="finsechead"><h3>Clients</h3><div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="ghostbtn" style="width:auto;margin:0;" onclick="finCliPull()" ${finCliBusy?'disabled':''}>${finCliBusy==='pull'?'Pulling…':'⟳ Pull from Xero'}</button>
      <button class="darkbtn" style="width:auto;margin:0;" onclick="openFinClientForm()">+ New client</button></div></div>
    <p class="stub" style="margin:-4px 0 10px;">${list.length} client${list.length===1?'':'s'} · ${inXero} in Xero. New clients you add here go into Xero too.</p>
    ${finSearchHtml('Search clients', 'finClientList')}
    <div id="finClientList">${list.length ? `<div class="finreptbl-wrap"><table class="fincosttbl fininvtbl fincli-tbl">
      <thead><tr><th>Client</th><th>Jobs</th><th>Xero</th><th class="num">Owed</th></tr></thead>
      <tbody>${list.map(c=>`<tr data-lf="${lfText([c.name, c.email, c.jobs.map(j=>j.name+' '+(j.job_number||'')).join(' ')].join(' '))}">
        <td data-l="Client" class="d"><b>${escapeHtml(c.name)}</b>${c.email?`<div class="fininv-addr">${escapeHtml(c.email)}</div>`:''}</td>
        <td data-l="Jobs">${jobsDd(c)}</td>
        <td data-l="Xero">${xTag(c)}</td>
        <td data-l="Owed" class="num">${c.owed ? finMoney(c.owed, 0) : '—'}${c.overdue?`<div class="fininv-addr finbad">${finMoney(c.overdue, 0)} overdue</div>`:''}</td></tr>`).join('')}</tbody>
    </table></div><div class="empty lf-empty" style="display:none;">No clients match.</div>` : '<div class="empty">No clients yet — pull them from Xero or add one.</div>'}</div>
    ${noClient.length ? `<details class="fincli-dd" style="margin-top:10px;"><summary>${noClient.length} job${noClient.length===1?'':'s'} with no client set</summary><div>${noClient.map(j=>`<button type="button" class="linkbtn" onclick="go('#/site/${j.id}/finance')">${escapeHtml(finRepJobOr(j))}</button>`).join('')}</div></details>` : ''}`;
}
function finCliXeroMsg(err){
  const e = String(err||'');
  if(/not_configured|not connected/i.test(e)) return 'Xero isn’t connected yet — connect it in Finance › Settings, then try again.';
  return 'Xero: '+e.slice(0,140);
}
window.finCliPull = async function(){
  if(finCliBusy) return; finCliBusy = 'pull'; render();
  try{
    const r = await finXeroCall('customers', {}, 90000);
    if(r.error){ toast(finCliXeroMsg(r.error)); return; }
    const list = r.customers || [];
    const saved = await dbSelect('fin_clients', 'org_id=eq.'+ME.org_id+'&select=id,name,xero_contact_id&limit=5000');
    const byX = {}, byN = {}; saved.forEach(c=>{ if(c.xero_contact_id) byX[c.xero_contact_id] = c; byN[String(c.name).trim().toLowerCase()] = c; });
    let added = 0, linked = 0;
    const now = new Date().toISOString();
    for(const x of list){
      const patch = {name:x.name, email:x.email||null, phone:x.phone||null, address:x.address||null, postcode:x.postcode||null, xero_contact_id:x.id, xero_synced_at:now};
      const ex = byX[x.id] || byN[String(x.name).trim().toLowerCase()];
      if(ex){ await dbUpdate('fin_clients', ex.id, patch); linked++; }
      else { const ins = await dbInsert('fin_clients', Object.assign({org_id:ME.org_id, created_by:ME.id}, patch)); if(ins) added++; }
    }
    toast(`From Xero: ${list.length} customer${list.length===1?'':'s'} — ${added} new, ${linked} updated`);
  } finally { finCliBusy = ''; render(); }
};
async function finCliToXero(rec){
  const lines = String(rec.address||'').split(/\n|,/).map(x=>x.trim()).filter(Boolean);
  const r = await finXeroCall('create_contact', {name:rec.name, email:rec.email||'', phone:rec.phone||'', line1:lines[0]||'', line2:lines.slice(1,-1).join(', '), city:lines.length>1?lines[lines.length-1]:'', postcode:rec.postcode||''});
  if(r.error) return {error:r.error};
  await dbUpdate('fin_clients', rec.id, {xero_contact_id:r.contact.id, xero_synced_at:new Date().toISOString()});
  return {ok:true, existed:r.existed};
}
window.finCliPush = async function(name){
  if(finCliBusy) return;
  let rec = (await dbSelect('fin_clients', 'org_id=eq.'+ME.org_id+'&name=ilike.'+encodeURIComponent(name.replace(/[*%]/g,''))))[0];
  if(!rec){
    const s = SITES.find(x=>String(x.client_name||'').trim().toLowerCase()===name.trim().toLowerCase());
    const ins = await dbInsert('fin_clients', {org_id:ME.org_id, created_by:ME.id, name:name.trim(), email:(s&&s.client_email)||null});
    rec = ins && ins[0];
  }
  if(!rec){ toast('Could not save the client.'); return; }
  finCliBusy = 'push'; render();
  try{ const r = await finCliToXero(rec); toast(r.error ? finCliXeroMsg(r.error) : (r.existed ? 'Already in Xero — linked' : 'Added to Xero')); }
  finally { finCliBusy = ''; render(); }
};
window.openFinClientForm = function(){
  let ov = document.getElementById('finCliOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finCliOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.innerHTML = `<div class="geo-modal-card">
    <h3>New client</h3>
    <div class="formfield"><label class="field-label">Company / client name</label><input type="text" id="finCliName" placeholder="e.g. Forma London"></div>
    <div class="formfield"><label class="field-label">Accounts email</label><input type="email" id="finCliEmail" placeholder="accounts@…"></div>
    <div class="formfield"><label class="field-label">Phone</label><input type="tel" id="finCliPhone"></div>
    <div class="formfield"><label class="field-label">Address</label><textarea id="finCliAddr" rows="2" placeholder="Street, town"></textarea></div>
    <div class="formfield"><label class="field-label">Postcode</label><input type="text" id="finCliPc" oninput="this.value=this.value.toUpperCase()"></div>
    <label style="display:flex;align-items:center;gap:8px;margin:4px 0 12px;font-size:13.5px;"><input type="checkbox" id="finCliXero" checked style="width:auto;"> Add to Xero as well</label>
    <button class="darkbtn" id="finCliSave" onclick="saveFinClient()">Save client</button>
    <button class="geo-modal-cancel" onclick="document.getElementById('finCliOverlay').style.display='none'">Cancel</button>
  </div>`;
  ov.style.display = 'flex';
  setTimeout(()=>{ const el = document.getElementById('finCliName'); if(el) el.focus(); }, 50);
};
window.saveFinClient = async function(){
  const name = finVal('finCliName'); if(!name){ toast('Enter the client name.'); return; }
  const dup = await dbSelect('fin_clients', 'org_id=eq.'+ME.org_id+'&name=ilike.'+encodeURIComponent(name.replace(/[*%]/g,'')));
  if(dup.length){ toast('“'+dup[0].name+'” is already a client.'); return; }
  const btn = document.getElementById('finCliSave'); if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  const ins = await dbInsert('fin_clients', {org_id:ME.org_id, created_by:ME.id, name, email:finVal('finCliEmail')||null, phone:finVal('finCliPhone')||null, address:finVal('finCliAddr')||null, postcode:finVal('finCliPc')||null});
  const rec = ins && ins[0];
  if(!rec){ if(btn){ btn.disabled = false; btn.textContent = 'Save client'; } return; }
  const toX = document.getElementById('finCliXero') && document.getElementById('finCliXero').checked;
  document.getElementById('finCliOverlay').style.display = 'none';
  if(toX){ const r = await finCliToXero(rec); toast(r.error ? 'Client saved. '+finCliXeroMsg(r.error) : 'Client saved and added to Xero'); }
  else toast('Client saved');
  render();
};
(function(){
  const css = `.fincli-dd summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--ink);list-style:none;}
  .fincli-dd summary::-webkit-details-marker{display:none;}
  .fincli-dd summary::after{content:' ▾';color:var(--slate);}
  .fincli-dd[open] summary::after{content:' ▴';}
  .fincli-dd > div{display:flex;flex-direction:column;align-items:flex-start;gap:2px;margin-top:6px;max-height:220px;overflow:auto;}
  .fincli-dd .linkbtn{font-size:12.5px;padding:2px 0;text-align:left;}
  .fincli-tbl td{vertical-align:top;}`;
  try{ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }catch(e){}
})();
