/* ================= HOME CALENDAR (all sites combined, PM/admin only —
   replaces the home bar's old Invite shortcut. Read-only overview: tap an
   event to jump into that site's own Calendar page to add/edit/delete,
   rather than duplicating that whole form here. Filterable by PM and/or a
   multi-select of sites, same rolling Week/2 Weeks/Month window as the
   per-site Calendar (shares calViewMode with it on purpose — one
   consistent "how far ahead am I looking" setting across both). ================= */
let calHomePmFilterIds = [];
let calHomeSiteFilterIds = [];
let calHomePmFilterOpen = false;
let calHomeSiteFilterOpen = false;
window.toggleCalHomePmFilterId = function(id){
  calHomePmFilterIds = calHomePmFilterIds.includes(id) ? calHomePmFilterIds.filter(x=>x!==id) : [...calHomePmFilterIds, id];
  render();
};
window.toggleCalHomeSiteFilterId = function(id){
  calHomeSiteFilterIds = calHomeSiteFilterIds.includes(id) ? calHomeSiteFilterIds.filter(x=>x!==id) : [...calHomeSiteFilterIds, id];
  render();
};
async function renderUnifiedCalendar(){
  const __gen = RENDER_GEN;
  await loadAllProfiles();
  if(!calViewMode) calViewMode = calDefaultViewMode();
  const numDays = CAL_VIEW_DAYS[calViewMode] || 14;
  const today = new Date(); today.setHours(0,0,0,0);
  const days = [];
  for(let i=0;i<numDays;i++){ const d = new Date(today); d.setDate(d.getDate()+i); days.push(d); }
  const startStr = localISODate(days[0]);
  const endStr = localISODate(days[days.length-1]);
  const [events, pmOptions] = await Promise.all([
    dbSelect('site_calendar_events', 'event_date=gte.'+startStr+'&event_date=lte.'+endStr+'&order=event_date.asc,created_at.asc'),
    loadPMList(),
  ]);
  const siteById = {}; SITES.forEach(s=>{ siteById[s.id] = s; });
  const filteredEvents = events.filter(e=>{
    const site = siteById[e.site_id];
    if(!site) return false;
    if(calHomePmFilterIds.length && !calHomePmFilterIds.includes(site.responsible_pm_id)) return false;
    if(calHomeSiteFilterIds.length && !calHomeSiteFilterIds.includes(site.id)) return false;
    return true;
  });
  const eventsByDate = {};
  filteredEvents.forEach(e=>{ (eventsByDate[e.event_date]=eventsByDate[e.event_date]||[]).push(e); });
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${calViewModeDropdownHtml()}
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="position:relative;" data-calhomepmfilter-root>
        <button type="button" onclick="event.stopPropagation();calHomePmFilterOpen=!calHomePmFilterOpen;calHomeSiteFilterOpen=false;render();" style="width:auto;padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;border-radius:20px;border:1px solid var(--line);background:${calHomePmFilterIds.length?'var(--brand1)':'#fff'};color:${calHomePmFilterIds.length?'#fff':'var(--slate)'};cursor:pointer;">
          ${calHomePmFilterIds.length ? (calHomePmFilterIds.length===1 ? escapeHtml(nameOf(calHomePmFilterIds[0])||'1 selected') : calHomePmFilterIds.length+' PMs') : 'Filter by PM'} ${calHomePmFilterOpen?'▲':'▼'}
        </button>
        ${calHomePmFilterOpen ? `
          <div style="position:absolute;left:0;top:calc(100% + 6px);z-index:50;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.18);padding:8px;min-width:170px;">
            ${pmOptions.map(p=>`
              <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;">
                <input type="checkbox" ${calHomePmFilterIds.includes(p.id)?'checked':''} onchange="toggleCalHomePmFilterId('${p.id}')">
                ${escapeHtml(p.name)}
              </label>
            `).join('') || `<div class="stub" style="margin:0;">No PMs yet.</div>`}
            ${calHomePmFilterIds.length ? `<div style="border-top:1px solid var(--line);margin-top:4px;padding-top:6px;text-align:center;"><span style="font-size:11.5px;color:var(--brand1);cursor:pointer;text-decoration:underline;" onclick="calHomePmFilterIds=[];render();">Clear</span></div>` : ''}
          </div>
        ` : ''}
      </div>
      <div style="position:relative;" data-calhomesitefilter-root>
        <button type="button" onclick="event.stopPropagation();calHomeSiteFilterOpen=!calHomeSiteFilterOpen;calHomePmFilterOpen=false;render();" style="width:auto;padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;border-radius:20px;border:1px solid var(--line);background:${calHomeSiteFilterIds.length?'var(--brand1)':'#fff'};color:${calHomeSiteFilterIds.length?'#fff':'var(--slate)'};cursor:pointer;">
          ${calHomeSiteFilterIds.length ? calHomeSiteFilterIds.length+' sites' : 'Filter by site'} ${calHomeSiteFilterOpen?'▲':'▼'}
        </button>
        ${calHomeSiteFilterOpen ? `
          <div style="position:absolute;left:0;top:calc(100% + 6px);z-index:50;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.18);padding:8px;min-width:200px;max-height:240px;overflow-y:auto;">
            ${SITES.map(s=>`
              <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;">
                <input type="checkbox" ${calHomeSiteFilterIds.includes(s.id)?'checked':''} onchange="toggleCalHomeSiteFilterId('${s.id}')">
                ${escapeHtml(s.name)}
              </label>
            `).join('') || `<div class="stub" style="margin:0;">No sites yet.</div>`}
            ${calHomeSiteFilterIds.length ? `<div style="border-top:1px solid var(--line);margin-top:4px;padding-top:6px;text-align:center;"><span style="font-size:11.5px;color:var(--brand1);cursor:pointer;text-decoration:underline;" onclick="calHomeSiteFilterIds=[];render();">Clear</span></div>` : ''}
          </div>
        ` : ''}
      </div>
    </div>
    <p class="stub" style="margin:0 0 14px;">Next ${numDays} days across every site — tap a date to manage it there.</p>
    ${days.map(d=>{
      const dStr = localISODate(d);
      const isToday = dStr===startStr;
      const dayEvents = eventsByDate[dStr]||[];
      const isWeekend = d.getDay()===0 || d.getDay()===6;
      return `
        <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);">
          <div style="flex:0 0 52px;text-align:center;">
            <div style="font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${isWeekend?'var(--brand1)':'var(--slate)'};">${d.toLocaleDateString('en-GB',{weekday:'short'})}</div>
            <div style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;${isToday?'border:2px solid var(--brand1);':''}"><span style="font-size:18px;font-weight:800;color:${isWeekend?'var(--brand1)':'var(--ink)'};">${d.getDate()}</span></div>
          </div>
          <div style="flex:1;min-width:0;">
            ${dayEvents.length ? dayEvents.map(e=>{
              const site = siteById[e.site_id];
              return `
              <div style="cursor:pointer;margin-bottom:6px;" onclick="go('#/site/${e.site_id}/calendar')">
                <span style="font-size:13.5px;${e.is_private?'color:var(--slate);':'color:var(--ink);'}">${e.is_private?'🔒 ':''}${escapeHtml(e.title)}</span>
                <span class="stub" style="margin:0 0 0 6px;font-size:11px;">— ${escapeHtml(site?site.name:'Unknown site')}</span>
              </div>
            `;}).join('') : `<div class="stub" style="margin:0;font-size:12.5px;color:var(--slate-light);">—</div>`}
          </div>
        </div>
      `;
    }).join('')}
  `, {title:'Calendar', subtitle:'All sites', back:'#/sites', tabs:false}); }
}
