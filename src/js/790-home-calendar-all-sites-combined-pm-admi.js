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
// #(cal-home-expand) Tapping an item on the all-projects calendar opens it
// up in place (details); tapping its title then goes to that day in the
// project's own calendar.
let calHomeOpenId = null;
window.toggleCalHomeItem = function(id){ calHomeOpenId = calHomeOpenId===id ? null : id; render(); };
window.openCalEntryOnSite = function(siteId, dStr){
  const d = new Date(dStr+'T00:00:00');
  calMonthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
  calSelDate = dStr; calInlineDate = null; calEditId = null;
  calHomeOpenId = null;
  go('#/site/'+siteId+'/calendar');
};
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
  const monthMode = calViewMode==='month';
  const mr = monthMode ? calMonthRange() : null;
  const qStart = monthMode ? localISODate(mr.gridStart) : startStr;
  const endStr = monthMode ? localISODate(mr.gridEnd) : localISODate(days[days.length-1]);
  const [events, pmOptions] = await Promise.all([
    dbSelect('site_calendar_events', 'event_date=gte.'+qStart+'&event_date=lte.'+endStr+'&order=event_date.asc,created_at.asc'),
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
  // #(desk-calendar) On a computer the month grid fills the page with the
  // chosen day's items in a panel beside it (phones unchanged).
  const deskSplit = monthMode && isDeskMode();
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
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
      <div style="margin-left:auto;">${calToolsHtml({label:'View'})}</div>
    </div>
    ${deskSplit ? '<div class="caldesk"><div class="caldesk-main">' : ''}
    ${monthMode ? calMonthGridHtml(eventsByDate) : `<p class="stub" style="margin:0 0 14px;">Next ${numDays} days across every site — tap a date to manage it there.</p>`}
    ${deskSplit ? '</div><div class="caldesk-side">' : ''}
    ${(monthMode ? [new Date(calSelDate+'T00:00:00')] : days).map(d=>{
      const dStr = localISODate(d);
      const isToday = dStr===startStr;
      const dayEvents = eventsByDate[dStr]||[];
      const isWeekend = d.getDay()===0 || d.getDay()===6;
      return `
        <div class="calday ${monthMode?'calday-big':''} ${dayEvents.length?'calday-has':''}" style="display:flex;gap:12px;">
          <div style="flex:0 0 52px;text-align:center;">
            <div style="font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${isWeekend?'var(--brand1)':'var(--slate)'};">${d.toLocaleDateString('en-GB',{weekday:'short'})}</div>
            <div style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;${isToday?'border:2px solid var(--brand1);':''}"><span style="font-size:18px;font-weight:800;color:${isWeekend?'var(--brand1)':'var(--ink)'};">${d.getDate()}</span></div>
          </div>
          <div style="flex:1;min-width:0;">
            ${dayEvents.length ? dayEvents.map(e=>{
              const site = siteById[e.site_id];
              return `
              ${calHomeOpenId===e.id ? `
                <div class="calh-card">
                  <button type="button" class="calh-title" onclick="openCalEntryOnSite('${e.site_id}','${e.event_date}')">
                    <span>${e.is_private?'🔒 ':''}${e.recurrence_group_id?'🔁 ':''}${escapeHtml(e.title)}</span>${ophIcon('chevron', 18, 2.4)}
                  </button>
                  <div class="calh-row"><b>Project</b><span>${escapeHtml(site?site.name:'Unknown site')}</span></div>
                  ${site && fullSiteAddress(site) ? `<div class="calh-row"><b>Address</b><span>${escapeHtml(fullSiteAddress(site))}</span></div>` : ''}
                  <div class="calh-row"><b>Date</b><span>${new Date(e.event_date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span></div>
                  ${e.is_private ? `<div class="calh-row"><b>Visibility</b><span>Private — PMs/admins only</span></div>` : ''}
                  ${e.recurrence_group_id ? `<div class="calh-row"><b>Repeats</b><span>Yes</span></div>` : ''}
                  ${(e.reminder_recipient_ids||[]).length ? `<div class="calh-row"><b>Reminder</b><span>${e.reminder_timing==='day_of'?'Day of':e.reminder_timing==='custom'&&e.reminder_date?new Date(e.reminder_date+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'Day before'} → ${escapeHtml((e.reminder_recipient_ids||[]).map(id=>nameOf(id)).filter(Boolean).join(', '))}</span></div>` : ''}
                  ${e.created_by ? `<div class="calh-row"><b>Added by</b><span>${escapeHtml(nameOf(e.created_by)||'')}</span></div>` : ''}
                  <div class="calh-foot"><span class="stub" style="margin:0;font-size:11.5px;">Tap the title to open it in the project calendar</span><button type="button" class="calh-close" onclick="toggleCalHomeItem('${e.id}')">Close</button></div>
                </div>
              ` : `
                <button type="button" class="calh-item" onclick="toggleCalHomeItem('${e.id}')">
                  <span class="calh-dot" style="background:${e.is_private?'var(--slate-light)':'var(--brand1)'};"></span>
                  <span class="calh-txt"><span style="font-size:13.5px;font-weight:600;${e.is_private?'color:var(--slate);':'color:var(--ink);'}">${e.is_private?'🔒 ':''}${escapeHtml(e.title)}</span>
                  <span class="stub" style="margin:0;font-size:11.5px;">${escapeHtml(site?site.name:'Unknown site')}</span></span>
                  <span style="color:var(--slate-light);font-size:16px;">▾</span>
                </button>
              `}
            `;}).join('') : `<div class="stub" style="margin:0;font-size:12.5px;color:var(--slate-light);">—</div>`}
          </div>
        </div>
      `;
    }).join('')}
    ${deskSplit ? '</div></div>' : ''}
  `, {title:'Calendar', subtitle:'All sites', back: usesPmHome(ME) ? '#/home' : '#/sites', tabs:false}); }
}
