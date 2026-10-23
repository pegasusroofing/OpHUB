/* ============================================================
   OpHUB Finance — Projects as a spreadsheet grid (21 Oct 2026, Andy: "2A
   spreadsheet style, job number with the same tile effect").
   A filter box under every column, the job number as a red tile like the
   Projects cards, money columns right-aligned and a dark totals bar.
   Column filters hide rows with .fg-hide, so they work alongside the
   search box (liveFilter) and the Live / Upcoming / Closed chips.
   ============================================================ */
/* Columns can be picked per person (21 Oct, Andy — like Construction
   Manager's "Table options"): ⚙ Columns under the table. Saved on this
   device. Invoiced / Owed are off by default. */
const FIN_JOB_COLS = [
  {k:'job', l:'Job no', fl:'Filter', on:1, lock:1},
  {k:'name', l:'Project', fl:'Filter', on:1, lock:1},
  {k:'client', l:'Client', fl:'Client', on:1},
  {k:'po', l:'Client PO', fl:'PO', on:1},
  {k:'pm', l:'PM', fl:'PM', on:1},
  {k:'status', l:'Status', fl:'Status', on:1},
  {k:'start', l:'Start', on:1},
  {k:'postcode', l:'Postcode', fl:'Postcode', on:0},
  {k:'value', l:'Value', num:1, on:1},
  {k:'invoiced', l:'Invoiced', num:1, on:0},
  {k:'owed', l:'Owed', num:1, on:0},
  {k:'overdue', l:'Overdue', num:1, on:0},
];
function finJobColsOn(){
  let saved = null; try{ saved = JSON.parse(localStorage.getItem('ophub.finJobCols')||'null'); }catch(e){}
  return FIN_JOB_COLS.filter(c=>c.lock || (Array.isArray(saved) ? saved.includes(c.k) : c.on));
}
function finJobGridHtml(sites, o){
  const invBy = {};
  (o.invs||[]).forEach(i=>{ const r = invBy[i.site_id] = invBy[i.site_id] || {inv:0, owed:0, overdue:0};
    if(i.status!=='draft'){ r.inv += Number(i.total||0); const out = finInvOutstandingNet(i); r.owed += out; if(finInvOverdue(i)) r.overdue += out; } });
  const pmName = s=>s.responsible_pm_id ? ((PROFILES[s.responsible_pm_id]||{}).name||'PM') : '';
  const cols = finJobColsOn();
  const rows = sites.map(s=>{
    const p = o.posBy[s.id] || [], v = Number((o.jfBy[s.id]||{}).contract_value||0), m = invBy[s.id] || {inv:0, owed:0, overdue:0};
    const st = finSiteStatus(s), stCls = st==='live' ? 'ok' : st==='upcoming' ? 'grey' : 'blue';
    const cli = o.cliOf(s) || s.client_name || '';
    const po = p.map(x=>x.po_number).join(', ');
    const cell = {
      job:()=>`<td data-l="Job" class="d"><span class="fgjob ${s.job_number?'':'none'}" title="${escapeHtml(s.job_number||'')}">${escapeHtml(s.job_number||'No no.')}</span></td>`,
      name:()=>`<td data-l="Project"><b>${escapeHtml(s.name||'')}</b></td>`,
      client:()=>`<td data-l="Client">${escapeHtml(cli||'—')}</td>`,
      po:()=>`<td data-l="Client PO" class="${po?'':'fgwarn'}">${escapeHtml(po||'No PO')}</td>`,
      pm:()=>`<td data-l="PM">${escapeHtml(pmName(s)||'—')}</td>`,
      status:()=>`<td data-l="Status"><span class="finpill ${stCls}">${st[0].toUpperCase()+st.slice(1)}</span></td>`,
      start:()=>`<td data-l="Start" data-d="${s.start_date||''}">${s.start_date ? finDate(s.start_date) : '—'}</td>`,
      postcode:()=>`<td data-l="Postcode">${escapeHtml(s.postcode||'—')}</td>`,
      value:()=>`<td data-l="Value" class="num" data-v="${v}">${v ? finMoney(v, 0) : '<span class="stub" style="margin:0;">No value</span>'}</td>`,
      invoiced:()=>`<td data-l="Invoiced" class="num">${m.inv ? finMoney(m.inv, 0) : '—'}</td>`,
      owed:()=>`<td data-l="Owed" class="num ${m.overdue?'finbad':''}">${m.owed ? finMoney(m.owed, 0) : '—'}</td>`,
      overdue:()=>`<td data-l="Overdue" class="num ${m.overdue?'finbad':''}">${m.overdue ? finMoney(m.overdue, 0) : '—'}</td>`,
    };
    return {s, v, m, html:`<tr class="click ${finCliHide(cli+' '+(s.client_name||''))}" data-cli="${escapeHtml((cli+' '+(s.client_name||'')).toLowerCase())}" data-lf="${lfText([s.job_number, s.name, cli, s.client_name, po, pmName(s), s.postcode].join(' '))}" onclick="go('#/site/${s.id}/finance')">${cols.map(c=>cell[c.k]()).join('')}</tr>`};
  });
  const t = k=>rows.reduce((a,r)=>a+(k==='v'?r.v:r.m[k]),0);
  const has = k=>cols.some(c=>c.k===k);
  return `<div id="finJobList"><div class="finreptbl-wrap"><table class="fincosttbl fininvtbl fggrid" id="finJobGrid">
    <thead><tr>${cols.map(c=>`<th class="${c.num?'num':''}">${c.l}</th>`).join('')}</tr>
    <tr class="fgfilters">${cols.map((c,i)=>c.fl ? `<th class="fgf"><input type="text" placeholder="${c.fl}" data-col="${i}" oninput="finGridFilter('finJobGrid')" onclick="event.stopPropagation()"></th>` : '<th></th>').join('')}</tr></thead>
    <tbody>${rows.map(r=>r.html).join('')}</tbody>
    </table></div>
    <div class="empty lf-empty" style="${rows.length?'display:none;':''}">No projects here.</div>
    <div class="fgfoot" id="finJobGridFoot">${rows.length ? `<b>${rows.length} project${rows.length===1?'':'s'}</b><span>Value ${finMoney(t('v'), 0)}</span>${has('invoiced')?`<span>Invoiced ${finMoney(t('inv'), 0)}</span>`:''}${has('owed')?`<span>Owed ${finMoney(t('owed'), 0)}</span>`:''}${t('overdue') && (has('owed')||has('overdue')) ? `<span class="fgfoot-bad">${finMoney(t('overdue'), 0)} overdue</span>` : ''}` : '<b>0 projects</b>'}
      <button type="button" class="fgcolbtn" onclick="finJobColsOpen()">⚙ Columns</button></div>
  </div>`;
}
let finJobColsDraft = null;
window.finJobColsOpen = function(){
  finJobColsDraft = new Set(finJobColsOn().map(c=>c.k));
  let ov = document.getElementById('finColsOverlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'finColsOverlay'; ov.className = 'geo-modal-overlay'; document.body.appendChild(ov); }
  ov.onclick = e=>{ if(e.target===ov) ov.style.display='none'; };
  ov.style.display = 'flex'; finJobColsPaint();
};
function finJobColsPaint(){
  const ov = document.getElementById('finColsOverlay'); if(!ov) return;
  ov.innerHTML = `<div class="geo-modal-card fgcols-card">
    <div style="display:flex;justify-content:space-between;align-items:center;"><h3 style="margin:0;">Table columns</h3><button class="ghostbtn finsmall" style="width:auto;margin:0;" onclick="document.getElementById('finColsOverlay').style.display='none'">✕</button></div>
    <p class="stub" style="margin:4px 0 10px;">Tick the columns you want to see. Saved on this device.</p>
    <div class="fgcols-list">${FIN_JOB_COLS.map(c=>{ const on = c.lock || finJobColsDraft.has(c.k); return `<button type="button" class="fgcols-row" ${c.lock?'disabled':''} onclick="finJobColsTog('${c.k}')"><span>${c.l}${c.lock?' <small>(always shown)</small>':''}</span><span class="fgcols-ic ${on?'on':'off'}">${on?'✓':'✕'}</span></button>`; }).join('')}</div>
    <div class="fgcols-btns"><button class="ghostbtn" style="margin:0;" onclick="document.getElementById('finColsOverlay').style.display='none'">Cancel</button><button class="darkbtn" style="margin:0;" onclick="finJobColsSave()">Confirm</button></div>
    <button class="linkbtn" style="margin-top:10px;" onclick="finJobColsDraft=new Set(FIN_JOB_COLS.filter(c=>c.on).map(c=>c.k));finJobColsPaint()">Restore defaults</button>
  </div>`;
}
window.finJobColsTog = function(k){ if(finJobColsDraft.has(k)) finJobColsDraft.delete(k); else finJobColsDraft.add(k); finJobColsPaint(); };
window.finJobColsSave = function(){
  try{ localStorage.setItem('ophub.finJobCols', JSON.stringify(Array.from(finJobColsDraft))); }catch(e){}
  document.getElementById('finColsOverlay').style.display = 'none'; render();
};
window.finGridFilter = function(id){
  const tb = document.getElementById(id); if(!tb) return;
  const fs = Array.from(tb.querySelectorAll('.fgfilters input')).map(i=>({c:Number(i.dataset.col), q:i.value.trim().toLowerCase()})).filter(f=>f.q);
  let n = 0;
  tb.querySelectorAll('tbody tr').forEach(tr=>{
    const ok = fs.every(f=>{ const td = tr.children[f.c]; return td && td.textContent.toLowerCase().includes(f.q); });
    tr.classList.toggle('fg-hide', !ok); if(ok && tr.style.display!=='none') n++;
  });
  const foot = document.getElementById(id+'Foot');
  if(foot){ let note = foot.querySelector('.fgfoot-n'); if(!note){ note = document.createElement('em'); note.className = 'fgfoot-n'; const cb = foot.querySelector('.fgcolbtn'); if(cb) foot.insertBefore(note, cb); else foot.appendChild(note); } note.textContent = fs.length ? n+' shown with filters' : ''; }
};
