/* ============================================================
   OpHUB Finance — Projects as a spreadsheet grid (21 Oct 2026, Andy: "2A
   spreadsheet style, job number with the same tile effect").
   A filter box under every column, the job number as a red tile like the
   Projects cards, money columns right-aligned and a dark totals bar.
   Column filters hide rows with .fg-hide, so they work alongside the
   search box (liveFilter) and the Live / Upcoming / Closed chips.
   ============================================================ */
function finJobGridHtml(sites, o){
  const invBy = {};
  (o.invs||[]).forEach(i=>{ const r = invBy[i.site_id] = invBy[i.site_id] || {inv:0, owed:0, overdue:0};
    if(i.status!=='draft'){ r.inv += Number(i.total||0); const out = finInvOutstanding(i); r.owed += out; if(finInvOverdue(i)) r.overdue += out; } });
  const pmName = s=>s.responsible_pm_id ? ((PROFILES[s.responsible_pm_id]||{}).name||'PM') : '';
  const rows = sites.map(s=>{
    const p = o.posBy[s.id] || [], v = Number((o.jfBy[s.id]||{}).contract_value||0), m = invBy[s.id] || {inv:0, owed:0, overdue:0};
    const st = finSiteStatus(s), stCls = st==='live' ? 'ok' : st==='upcoming' ? 'grey' : 'blue';
    const cli = o.cliOf(s) || s.client_name || '';
    const po = p.map(x=>x.po_number).join(', ');
    return {s, v, m, html:`<tr class="click ${finCliHide(cli+' '+(s.client_name||''))}" data-cli="${escapeHtml((cli+' '+(s.client_name||'')).toLowerCase())}" data-lf="${lfText([s.job_number, s.name, cli, s.client_name, po, pmName(s)].join(' '))}" onclick="go('#/site/${s.id}/finance')">
      <td data-l="Job" class="d"><span class="fgjob ${s.job_number?'':'none'}" title="${escapeHtml(s.job_number||'')}">${escapeHtml(s.job_number||'No no.')}</span></td>
      <td data-l="Project"><b>${escapeHtml(s.name||'')}</b></td>
      <td data-l="Client">${escapeHtml(cli||'—')}</td>
      <td data-l="Client PO" class="${po?'':'fgwarn'}">${escapeHtml(po||'No PO')}</td>
      <td data-l="PM">${escapeHtml(pmName(s)||'—')}</td>
      <td data-l="Status"><span class="finpill ${stCls}">${st[0].toUpperCase()+st.slice(1)}</span></td>
      <td data-l="Start">${s.start_date ? finDate(s.start_date) : '—'}</td>
      <td data-l="Value" class="num">${v ? finMoney(v, 0) : '<span class="stub" style="margin:0;">No value</span>'}</td>
      <td data-l="Invoiced" class="num">${m.inv ? finMoney(m.inv, 0) : '—'}</td>
      <td data-l="Owed" class="num ${m.overdue?'finbad':''}">${m.owed ? finMoney(m.owed, 0) : '—'}</td></tr>`};
  });
  const t = k=>rows.reduce((a,r)=>a+(k==='v'?r.v:r.m[k]),0);
  const flt = (i, ph)=>`<th class="fgf"><input type="text" placeholder="${ph}" data-col="${i}" oninput="finGridFilter('finJobGrid')" onclick="event.stopPropagation()"></th>`;
  return `<div id="finJobList"><div class="finreptbl-wrap"><table class="fincosttbl fininvtbl fggrid" id="finJobGrid">
    <thead><tr><th>Job no</th><th>Project</th><th>Client</th><th>Client PO</th><th>PM</th><th>Status</th><th>Start</th><th class="num">Value</th><th class="num">Invoiced</th><th class="num">Owed</th></tr>
    <tr class="fgfilters">${flt(0,'Filter')}${flt(1,'Filter')}${flt(2,'Client')}${flt(3,'PO')}${flt(4,'PM')}${flt(5,'Status')}<th></th><th></th><th></th><th></th></tr></thead>
    <tbody>${rows.map(r=>r.html).join('')}</tbody>
    </table></div>
    <div class="empty lf-empty" style="${rows.length?'display:none;':''}">No projects here.</div>
    ${rows.length ? `<div class="fgfoot" id="finJobGridFoot"><b>${rows.length} project${rows.length===1?'':'s'}</b><span>Value ${finMoney(t('v'), 0)}</span><span>Invoiced ${finMoney(t('inv'), 0)}</span><span>Owed ${finMoney(t('owed'), 0)}</span>${t('overdue') ? `<span class="fgfoot-bad">${finMoney(t('overdue'), 0)} overdue</span>` : ''}</div>` : ''}
  </div>`;
}
window.finGridFilter = function(id){
  const tb = document.getElementById(id); if(!tb) return;
  const fs = Array.from(tb.querySelectorAll('.fgfilters input')).map(i=>({c:Number(i.dataset.col), q:i.value.trim().toLowerCase()})).filter(f=>f.q);
  let n = 0;
  tb.querySelectorAll('tbody tr').forEach(tr=>{
    const ok = fs.every(f=>{ const td = tr.children[f.c]; return td && td.textContent.toLowerCase().includes(f.q); });
    tr.classList.toggle('fg-hide', !ok); if(ok && tr.style.display!=='none') n++;
  });
  const foot = document.getElementById(id+'Foot');
  if(foot){ let note = foot.querySelector('.fgfoot-n'); if(!note){ note = document.createElement('em'); note.className = 'fgfoot-n'; foot.appendChild(note); } note.textContent = fs.length ? n+' shown with filters' : ''; }
};
