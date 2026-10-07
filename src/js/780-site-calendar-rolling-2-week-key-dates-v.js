/* ================= SITE CALENDAR (rolling 2-week key-dates view — visible to
   everyone with site access; private items are PM/admin-only, gated by RLS
   as well as hidden client-side. PMs can pick people to email a same-day
   reminder to — handled by the send-calendar-reminders daily cron.) ================= */
let calAddOpen = false;
let calDraft = {title:'', date:'', private:false, remind:false, timing:'day_before', customDate:'', recipientIds:new Set(), repeat:'none'};
let calEditId = null;
// When set (a 'YYYY-MM-DD' string), the Add/Edit form renders inline within
// that specific day's row instead of at the top of the page — used by the
// per-row "+" and "✎" so a PM/admin filling it in doesn't have to scroll up
// to the top-of-page form. Mutually exclusive with calAddOpen (the
// top-of-page "Add a key date" toggle) — opening one closes the other.
let calInlineDate = null;
let calViewMode = null; // 'week' | 'twoweek' | 'month' — set on first render, role-based default (#287)
let calViewModePickerOpen = false;
const CAL_VIEW_DAYS = {week:7, twoweek:14, month:30};
const CAL_VIEW_LABELS = {week:'Week', twoweek:'2 Weeks', month:'Month'};
// #287: default view is monthly for PM/admin, two-weekly for operatives —
// only applied the first time the calendar is opened this session, so a
// deliberate later choice (setCalViewMode) always sticks.
function calDefaultViewMode(){ return isManager(ME) ? 'month' : 'twoweek'; }
window.toggleCalViewModePicker = function(){ calViewModePickerOpen = !calViewModePickerOpen; render(); };
function calViewModeDropdownHtml(){
  return `
    <div style="position:relative;margin-bottom:12px;" data-rowactions-root onclick="event.stopPropagation();">
      <div class="ddrow" style="margin:0;" onclick="toggleCalViewModePicker()">
        <span class="arrow">${calViewModePickerOpen?'▼':'▶'}</span> View: ${CAL_VIEW_LABELS[calViewMode]}
      </div>
      ${calViewModePickerOpen ? `
        <div class="statusmenu" style="right:auto;left:0;top:100%;">
          ${Object.keys(CAL_VIEW_DAYS).map(mode=>`<div class="statusmenu-item" style="${calViewMode===mode?'font-weight:700;color:var(--brand1);':''}" onclick="setCalViewMode('${mode}')">${CAL_VIEW_LABELS[mode]}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}
const CAL_REPEAT_LABELS = {none:'None', daily:'Daily', weekly:'Weekly', monthly:'Monthly'};
function calResetDraft(defaultDate){
  calDraft = {title:'', date:defaultDate||'', private:false, remind:false, timing:'day_before', customDate:'', recipientIds:new Set(), repeat:'none'};
}
// Opens the same "Add a key date" form used by the top-of-page +, but
// pre-filled with the date whose row "+" button was tapped, and rendered
// inline within that day's row (not at the top) so a PM/admin doesn't have
// to scroll up to fill it in. Tapping the same row's "+" again closes it.
window.openCalAddForDate = function(dateStr){
  calEditId = null;
  calAddOpen = false;
  if(calInlineDate === dateStr){ calInlineDate = null; calResetDraft(); }
  else { calInlineDate = dateStr; calResetDraft(dateStr); }
  render();
};
window.closeCalForm = function(){
  calAddOpen = false; calInlineDate = null; calEditId = null; calResetDraft();
  render();
};
// #: date badge reads as "16th" within the anchor ("today") month, and
// "1st Oct" once the rolling day list crosses into a different month — the
// month suffix drops again once "today" itself rolls into that month.
function ordinalSuffix(n){
  if(n>=11 && n<=13) return 'th';
  switch(n%10){ case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}
function calDayBadgeLabel(d, anchorMonth){
  const day = d.getDate();
  const label = day+ordinalSuffix(day);
  return d.getMonth()===anchorMonth ? label : label+' '+d.toLocaleDateString('en-GB',{month:'short'});
}
// Turns a "Repeats" choice into a concrete list of event_date strings,
// starting from startDateStr. Deliberately NOT an infinite/virtual
// recurrence engine — it materialises real rows up to a 1-year horizon (or
// 60 occurrences, whichever comes first), and stops early at the site's
// closed_at date, or generates only the single date if the site is
// already closed by the time it's created. setSiteStatus() also sweeps
// away any future recurring instances the moment a site is closed, so a
// job closing mid-series doesn't leave stray future key dates behind.
function calRecurrenceOccurrences(startDateStr, freq, siteObj){
  if(!freq || freq==='none' || !startDateStr) return [startDateStr];
  const maxCount = 60;
  const horizon = new Date(startDateStr+'T00:00:00'); horizon.setFullYear(horizon.getFullYear()+1);
  const closedBoundary = siteObj && siteObj.closed_at ? siteObj.closed_at.slice(0,10) : null;
  const alreadyClosed = siteObj && siteStatusKey(siteObj)==='closed';
  const dates = [];
  let d = new Date(startDateStr+'T00:00:00');
  for(let i=0;i<maxCount;i++){
    if(d>horizon) break;
    const dStr = localISODate(d);
    if(closedBoundary && dStr>closedBoundary) break;
    if(alreadyClosed && i>0) break;
    dates.push(dStr);
    if(freq==='daily') d.setDate(d.getDate()+1);
    else if(freq==='weekly') d.setDate(d.getDate()+7);
    else if(freq==='monthly') d.setMonth(d.getMonth()+1);
    else break;
  }
  return dates;
}
// Turns the event date + the chosen timing ("day before" / "day of" /
// "custom") into the actual date the reminder email goes out on.
function calReminderDateFor(eventDate, timing, customDate){
  if(timing==='custom') return customDate||eventDate;
  if(timing==='day_of') return eventDate;
  if(!eventDate) return eventDate;
  const d = new Date(eventDate+'T00:00:00'); d.setDate(d.getDate()-1);
  return localISODate(d);
}
window.setCalViewMode = function(mode){
  if(!CAL_VIEW_DAYS[mode]) return;
  calViewMode = mode;
  calViewModePickerOpen = false;
  render();
};
async function renderSiteCalendar(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const mgr = isManager(ME);
  if(!calViewMode) calViewMode = calDefaultViewMode();
  await loadAllProfiles();
  const numDays = CAL_VIEW_DAYS[calViewMode] || 14;
  const today = new Date(); today.setHours(0,0,0,0);
  const days = [];
  for(let i=0;i<numDays;i++){ const d = new Date(today); d.setDate(d.getDate()+i); days.push(d); }
  const startStr = localISODate(days[0]);
  const endStr = localISODate(days[days.length-1]);
  const [events, assignments] = await Promise.all([
    dbSelect('site_calendar_events', 'site_id=eq.'+siteId+'&event_date=gte.'+startStr+'&event_date=lte.'+endStr+'&order=event_date.asc,created_at.asc'),
    mgr ? dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : Promise.resolve([]),
  ]);
  const pmOptions = mgr ? await loadPMList() : [];
  const operativeOptions = mgr ? Object.values(PROFILES).filter(p=>assignments.some(a=>a.user_id===p.id)).sort((a,b)=>a.name.localeCompare(b.name)) : [];
  const recipientOptions = [...pmOptions, ...operativeOptions];
  const eventsByDate = {};
  events.forEach(e=>{ (eventsByDate[e.event_date]=eventsByDate[e.event_date]||[]).push(e); });

  // Shared Add/Edit form markup, reused both at the top of the page (opened
  // via the "Add a key date" header +) and inline within a specific day's
  // row (opened via that row's own "+" or "✎") — so a PM/admin filling it in
  // from a row further down the list never has to scroll back up to the top.
  // Date picker deliberately has NO max: any future date can be booked here,
  // however far ahead, not just one falling inside the currently-visible
  // rolling window — the row for that date will simply show it automatically
  // once the window rolls forward to include it (min stays "today" so past
  // dates aren't picked by mistake).
  function calFormHtml(){
    return `
      <div class="card" style="margin:8px 0 14px;">
        <div class="formfield"><label class="field-label">What's happening</label><input type="text" id="calTitle" placeholder="e.g. Scaffold delivery" value="${escapeHtml(calDraft.title)}" oninput="calDraft.title=this.value"></div>
        <div class="formfield" onclick="openDatePickerRow(this)"><label class="field-label">Date</label><input type="date" id="calDate" min="${startStr}" value="${escapeHtml(calDraft.date)}" oninput="calDraft.date=this.value"></div>
        ${mgr && !calEditId ? `
          <p class="field-label" style="margin:0 0 6px;">Repeats</p>
          <div class="row-gap" style="margin-bottom:12px;flex-wrap:wrap;">
            ${Object.keys(CAL_REPEAT_LABELS).map(freq=>`<div class="filterchip ${calDraft.repeat===freq?'active':''}" style="flex:1;min-width:70px;text-align:center;" onclick="calDraft.repeat='${freq}';render();">${CAL_REPEAT_LABELS[freq]}</div>`).join('')}
          </div>
          ${calDraft.repeat!=='none' ? `<p class="stub" style="margin:-6px 0 12px;">Creates this key date on a repeating basis (up to a year ahead) and stops automatically once the site is closed.</p>` : ''}
        ` : ''}
        ${mgr ? `<label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 10px;"><input type="checkbox" style="width:auto;" ${calDraft.private?'checked':''} onchange="calDraft.private=this.checked">Private — only PMs/admins can see this</label>` : `<p class="stub" style="margin:0 0 10px;">A PM/admin can open this afterwards to make it private or add an email reminder.</p>`}
        ${recipientOptions.length ? `
          <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 10px;"><input type="checkbox" style="width:auto;" ${calDraft.remind?'checked':''} onchange="calDraft.remind=this.checked;render();">Email a reminder</label>
          ${calDraft.remind ? `
            <p class="field-label" style="margin:0 0 6px;">Send the reminder</p>
            <div class="row-gap" style="margin-bottom:${calDraft.timing==='custom'?'8px':'12px'};">
              <div class="filterchip ${calDraft.timing==='day_before'?'active':''}" style="flex:1;text-align:center;" onclick="calDraft.timing='day_before';render();">Day before</div>
              <div class="filterchip ${calDraft.timing==='day_of'?'active':''}" style="flex:1;text-align:center;" onclick="calDraft.timing='day_of';render();">Day of</div>
              <div class="filterchip ${calDraft.timing==='custom'?'active':''}" style="flex:1;text-align:center;" onclick="calDraft.timing='custom';render();">Custom date</div>
            </div>
            ${calDraft.timing==='custom' ? `<div class="formfield" onclick="openDatePickerRow(this)"><input type="date" id="calReminderCustomDate" value="${escapeHtml(calDraft.customDate)}" oninput="calDraft.customDate=this.value"></div>` : ''}
            <p class="field-label" style="margin:0 0 6px;">Send it to</p>
            <div style="max-height:160px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:8px;margin-bottom:12px;">
              ${recipientOptions.map(p=>`
                <label class="stub" style="display:flex;align-items:center;gap:8px;margin:0 0 6px;"><input type="checkbox" style="width:auto;" ${calDraft.recipientIds.has(p.id)?'checked':''} onchange="toggleCalRecipient('${p.id}')">${escapeHtml(p.name)}${p.role!=='operative'?' ('+roleLabel(p.role)+')':''}</label>
              `).join('')}
            </div>
            <p class="stub" style="margin:-6px 0 12px;">You'll be copied on the reminder too, as the person who created it.</p>
          ` : ''}
        ` : ''}
        <div class="row-gap">
          <button class="darkbtn" style="flex:1;" onclick="${calEditId?`saveCalEventEdit('${siteId}')`:`addCalEvent('${siteId}')`}">${calEditId?'Save':'Add Key Date'}</button>
          <button class="ghostbtn" style="width:auto;padding:10px 16px;" onclick="closeCalForm()">Cancel</button>
        </div>
        ${!calEditId && mgr ? `<button class="ghostbtn" style="width:100%;margin-top:8px;" onclick="addCalEventToDeliverySchedule('${siteId}')">🚚 Also Add to Delivery Schedule</button>` : ''}
      </div>
    `;
  }

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${calViewModeDropdownHtml()}
    <div class="row-gap" style="align-items:flex-start;margin-bottom:14px;">
      <p class="stub" style="margin:0;flex:1;">Next ${numDays} days${mgr ? ' — private items only you and other PMs/admins can see.' : '.'}</p>
      <div class="ghostbtn" style="width:auto;padding:6px 12px;font-size:11.5px;flex:0 0 auto;" onclick="exportSiteCalendarIcs('${siteId}')">📅 Add to Phone Calendar</div>
    </div>
    <div class="drawheaderrow" style="margin-bottom:${calAddOpen?'10px':'14px'};">
      <span>Add a key date</span>
      <div class="roundplusbtn" onclick="calAddOpen=!calAddOpen; calInlineDate=null; calEditId=null; if(calAddOpen) calResetDraft('${startStr}'); render();">${calAddOpen?'−':'+'}</div>
    </div>
    ${calAddOpen ? calFormHtml() : ''}
    ${days.map(d=>{
      const dStr = localISODate(d);
      const isToday = dStr===startStr;
      const dayEvents = eventsByDate[dStr]||[];
      const isWeekend = d.getDay()===0 || d.getDay()===6;
      const inlineHere = calInlineDate===dStr;
      return `
        <div style="padding:10px 0;border-bottom:1px solid var(--line);">
          <div style="display:flex;gap:12px;">
            <div style="flex:0 0 64px;max-width:64px;overflow:hidden;text-align:center;">
              <div style="font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${isWeekend?'var(--brand1)':'var(--slate)'};">${d.toLocaleDateString('en-GB',{weekday:'short'})}</div>
              <div style="display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;max-width:100%;padding:0 5px;border-radius:14px;box-sizing:border-box;${isToday?'border:2px solid var(--brand1);':''}"><span style="font-size:${d.getMonth()===today.getMonth()?'14px':'11.5px'};font-weight:800;white-space:nowrap;color:${isWeekend?'var(--brand1)':'var(--ink)'};">${calDayBadgeLabel(d, today.getMonth())}</span></div>
            </div>
            <div style="flex:1;min-width:0;">
              ${dayEvents.length ? dayEvents.map(e=>`
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                  <span style="font-size:13.5px;${e.is_private?'color:var(--slate);':'color:var(--ink);'}">${e.is_private?'🔒 ':''}${e.recurrence_group_id?'🔁 ':''}${escapeHtml(e.title)}</span>
                  ${mgr ? `
                    <span style="display:flex;gap:6px;flex:0 0 auto;">
                      <span class="taskicon" style="width:22px;height:22px;font-size:11px;" onclick="openCalEditEvent('${e.id}','${jsAttr(e.title)}','${e.event_date}',${e.is_private?'true':'false'},${escapeHtml(JSON.stringify([...(e.reminder_recipient_ids||[])]))},'${e.reminder_timing||''}','${e.reminder_date||''}')">✎</span>
                      <span class="taskicon danger" style="width:22px;height:22px;font-size:11px;" onclick="deleteCalEvent('${siteId}','${e.id}','${e.recurrence_group_id||''}','${e.event_date}')">🗑</span>
                    </span>
                  ` : ''}
                </div>
              `).join('') : `<div class="stub" style="margin:0;font-size:12.5px;color:var(--slate-light);">—</div>`}
            </div>
            <div class="taskicon" style="flex:0 0 auto;width:24px;height:24px;font-size:13px;align-self:flex-start;margin-top:2px;${inlineHere?'background:var(--brand1);color:#fff;':''}" title="Add a key date for this day" onclick="openCalAddForDate('${dStr}')">${inlineHere?'−':'+'}</div>
          </div>
          ${inlineHere ? calFormHtml() : ''}
        </div>
      `;
    }).join('')}
  `, {title:'Calendar', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, tabs:false}); }
}
window.toggleCalRecipient = function(id){
  if(calDraft.recipientIds.has(id)) calDraft.recipientIds.delete(id); else calDraft.recipientIds.add(id);
  render();
};
window.openCalEditEvent = function(id, title, date, isPrivate, recipientIds, reminderTiming, reminderDate){
  calEditId = id;
  calAddOpen = false;
  calInlineDate = date; // show the edit form inline on the event's own row, not at the top
  calDraft = {
    title, date, private:isPrivate,
    remind: !!(recipientIds && recipientIds.length),
    timing: reminderTiming || 'day_before',
    customDate: reminderTiming==='custom' ? (reminderDate||'') : '',
    recipientIds:new Set(recipientIds||[]),
  };
  render();
};
// "Add to delivery schedule" from a site's Key Dates calendar — pulls the
// title/date straight through into a stub delivery (YARD collection, 7am
// slot, no site contact yet) and saves it immediately rather than sending
// the PM into the full delivery form. It's deliberately incomplete, so it's
// flagged needs_completing — the PM Delivery Schedule list shows a "Needs
// completing" badge on it until someone opens and saves it properly.
window.addCalEventToDeliverySchedule = async function(siteId){
  const title = (calDraft.title||'').trim();
  if(!title){ toast('Enter what this date is for first.'); return; }
  if(!calDraft.date){ toast('Pick a date first.'); return; }
  const payload = {
    org_id: ME.org_id, site_id: siteId, created_by: ME.id,
    description: title, scheduled_date: calDraft.date, time_slot: '7am',
    collection_type: 'yard', high_priority: false, needs_completing: true,
  };
  const rows = await dbInsert('delivery_tasks', payload);
  if(rows && rows[0]){
    await resequenceSlot(calDraft.date, '7am');
    toast('Added to Delivery Schedule — open it to fill in collection details, which drop and site contact.');
    calAddOpen = false; calInlineDate = null; calEditId = null; calResetDraft();
    deliveryFormDraft = null;
    go('#/delivery/edit/'+rows[0].id);
  } else {
    toast('Could not add — check your connection and try again.');
  }
};
window.addCalEvent = async function(siteId){
  const title = (calDraft.title||'').trim();
  if(!title){ toast('Enter what this date is for.'); return; }
  if(!calDraft.date){ toast('Pick a date.'); return; }
  // Operatives can add a key date, but only a plain one — no private
  // toggle, no repeat, no email reminder (a PM/admin can open it afterwards
  // to add any of that; see the "operative insert key date" RLS policy,
  // which requires exactly these defaults from a non-PM caller).
  const mgr = isManager(ME);
  if(mgr && calDraft.remind && calDraft.timing==='custom' && !calDraft.customDate){ toast('Pick a custom reminder date.'); return; }
  const remind = mgr && calDraft.remind && calDraft.recipientIds.size>0;
  const site = SITES.find(s=>s.id===siteId);
  const repeat = mgr ? (calDraft.repeat || 'none') : 'none';
  const occurrences = calRecurrenceOccurrences(calDraft.date, repeat, site);
  const recurrenceGroupId = (repeat!=='none' && occurrences.length>1) ? (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+'-'+Math.random().toString(36).slice(2))) : null;
  const rows = occurrences.map(eventDate=>({
    site_id:siteId, org_id:ME.org_id, title, event_date:eventDate, is_private: mgr ? calDraft.private : false,
    reminder_recipient_ids: remind ? [...calDraft.recipientIds] : [],
    reminder_timing: remind ? calDraft.timing : null,
    reminder_date: remind ? calReminderDateFor(eventDate, calDraft.timing, calDraft.customDate) : null,
    reminder_sent: false,
    created_by:ME.id,
    repeat_freq: repeat!=='none' ? repeat : null,
    recurrence_group_id: recurrenceGroupId,
  }));
  const row = await dbInsert('site_calendar_events', rows);
  if(row){
    toast(rows.length>1 ? `Added ${rows.length} repeating key dates` : 'Added to the calendar');
    calAddOpen = false; calInlineDate = null; calEditId = null; calResetDraft();
    render();
  }
};
window.saveCalEventEdit = async function(siteId){
  const title = (calDraft.title||'').trim();
  if(!title){ toast('Enter what this date is for.'); return; }
  if(!calDraft.date){ toast('Pick a date.'); return; }
  if(calDraft.remind && calDraft.timing==='custom' && !calDraft.customDate){ toast('Pick a custom reminder date.'); return; }
  const remind = calDraft.remind && calDraft.recipientIds.size>0;
  const row = await dbUpdate('site_calendar_events', calEditId, {
    title, event_date:calDraft.date, is_private:calDraft.private,
    reminder_recipient_ids: remind ? [...calDraft.recipientIds] : [],
    reminder_timing: remind ? calDraft.timing : null,
    reminder_date: remind ? calReminderDateFor(calDraft.date, calDraft.timing, calDraft.customDate) : null,
    reminder_sent:false,
  });
  if(row){
    toast('Updated');
    calAddOpen = false; calInlineDate = null; calEditId = null; calResetDraft();
    render();
  }
};
window.deleteCalEvent = async function(siteId, id, recurrenceGroupId, eventDate){
  const evRows = await dbSelect('site_calendar_events', 'id=eq.'+id+'&select=title');
  const evTitle = evRows[0] && evRows[0].title;
  if(recurrenceGroupId){
    const whole = await customConfirm('This is part of a repeating series. Delete this AND all future occurrences? (Cancel deletes just this one date.)');
    if(whole){
      const res = await sbFetch('/rest/v1/site_calendar_events?recurrence_group_id=eq.'+recurrenceGroupId+'&event_date=gte.'+eventDate, {method:'DELETE'});
      if(res.ok){ toast('Series deleted'); logSiteActivity(siteId, 'calendar_event_deleted', `Deleted calendar event series "${evTitle||''}"`); render(); } else { toast('Delete failed — '+(await safeErr(res))); }
      return;
    }
  } else {
    if(!await customConfirm('Delete this key date? This can\'t be undone.')) return;
  }
  const ok = await dbDelete('site_calendar_events', id);
  if(ok){ toast('Deleted'); logSiteActivity(siteId, 'calendar_event_deleted', `Deleted calendar event "${evTitle||''}"`); render(); }
};
