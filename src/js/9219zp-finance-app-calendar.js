/* ============================================================
   OpHUB Finance — application dates on the calendars (25 Oct 2026, Andy: "application dates
   for the pm should pull through to the site calendar … for pms, admins, estimators, qs's").
   Each month's application date for a project (the date set for that month in Project Admin,
   or the day-of-month rule) shows on that project's calendar and on the all-projects
   calendar as "💷 Application due" — or "💷 Application sent" once that month's
   application has gone. They can't be edited there; tap one to open the project's Finance.
   Only managers, Finance users and the project's QS see them (the database checks this too:
   site_application_dates).
   ============================================================ */
function finAppCalAllowed(){
  if(!ME) return false;
  if(['pm','admin'].includes(ME.role)) return true;               // PMs, admins and estimators
  return typeof isFinanceUser==='function' && isFinanceUser();    // QS / Finance users
}
let finAppCalCache = null;   // {at, rows}
async function finAppCalRows(){
  if(finAppCalCache && Date.now()-finAppCalCache.at < 120000) return finAppCalCache.rows;
  let rows = [];
  try{
    const res = await sbFetch('/rest/v1/rpc/site_application_dates', {method:'POST', body:JSON.stringify({p_site_ids:null})});
    if(res.ok) rows = await res.json(); else return finAppCalCache ? finAppCalCache.rows : [];
  }catch(e){ return finAppCalCache ? finAppCalCache.rows : []; }
  finAppCalCache = {at:Date.now(), rows: Array.isArray(rows) ? rows : []};
  return finAppCalCache.rows;
}
function finAppCalEventsFor(rows, from, to, siteId){
  const out = [];
  if(!from || !to) return out;
  const months = [];
  const d = new Date(from.slice(0,7)+'-01T12:00:00'), end = new Date(to.slice(0,7)+'-01T12:00:00');
  while(d <= end){ months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); d.setMonth(d.getMonth()+1); }
  rows.forEach(r=>{
    if(siteId && r.site_id!==siteId) return;
    const site = SITES.find(s=>s.id===r.site_id); if(!site) return;
    const jf = {app_dates:r.app_dates||null, app_reminder_day:r.app_reminder_day};
    const st = {app_reminder_day:r.org_app_day};
    const applied = new Set((r.applied_dates||[]).map(x=>String(x).slice(0,7)));
    months.forEach(ym=>{
      const date = finAppDateFor(jf, st, ym);
      if(!date || date < from || date > to) return;
      const sent = applied.has(ym);
      out.push({_pseudo:'app', _color: sent ? '#1E7A43' : '#B45309', id:'app-'+r.site_id+'-'+ym, _target:r.site_id, site_id:r.site_id, event_date:date,
        title: sent ? '💷 Application sent' : '💷 Application due', _where: site.name});
    });
  });
  return out;
}
// The calendars read site_calendar_events for a date range — add the application dates to that.
(function(){
  const base = dbSelect;
  dbSelect = async function(table, qs){
    const rows = await base.apply(this, arguments);
    try{
      if(table!=='site_calendar_events' || !finAppCalAllowed() || !Array.isArray(rows)) return rows;
      const from = (/event_date=gte\.(\d{4}-\d{2}-\d{2})/.exec(qs||'')||[])[1], to = (/event_date=lte\.(\d{4}-\d{2}-\d{2})/.exec(qs||'')||[])[1];
      if(!from || !to) return rows;
      const site = (/(?:^|&)site_id=eq\.([0-9a-f-]{36})/.exec(qs||'')||[])[1] || null;
      const extra = finAppCalEventsFor(await finAppCalRows(), from, to, site);
      return extra.length ? rows.concat(extra).sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date))) : rows;
    }catch(e){ console.error(e); return rows; }
  };
  window.dbSelect = dbSelect;
  const op = window.openCalPseudo;
  window.openCalPseudo = function(kind, id){
    if(kind==='app'){ go(typeof isFinanceUser==='function' && isFinanceUser() ? '#/site/'+id+'/finance' : '#/site/'+id+'/calendar'); return; }
    return op ? op.apply(this, arguments) : undefined;
  };
})();
