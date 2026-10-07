/* ================= HAVS (Hand-Arm Vibration exposure) =================
   Real HSE formula (matches the government HAVS calculator, not the old
   spreadsheet's ambiguous multiplier): for a tool with vibration magnitude
   D (m/s²) used for M minutes, partial daily exposure A(8) = D x
   sqrt(M/480) (480 minutes = a full 8-hour reference day), and that
   converts to "points" as A(8)^2 x 100/6.25 — 100 points = the 2.5 m/s²
   Exposure Action Value (EAV), 400 points = the 5 m/s² Exposure Limit
   Value (ELV). Multiple tools/sessions in the same day combine by simply
   summing their points (equivalent to root-sum-squaring the A(8) values,
   the HSE-approved combination method). An operative can only log entries
   against himself; a PM/Admin can log for any operative assigned to the
   site, one after another, same as the old spreadsheet's multi-operative
   weekly grid — just with a real tool picker and a real per-day duration
   instead of a flat multiplier. */
// Capitalises the first letter of every word in a tool name (e.g. "circular
// saw" -> "Circular Saw") without touching the rest of each word, so
// existing acronyms like "SDS" are left alone. Applied whenever a tool
// name is saved, and again at display time as a safety net for any older
// data that predates this.
function titleCaseWords(str){ return String(str||'').replace(/\b\w/g, c=>c.toUpperCase()); }
function havsA8(magnitude, minutes){ return magnitude * Math.sqrt(minutes/480); }
function havsPoints(magnitude, minutes){ const a8 = havsA8(magnitude, minutes); return (a8*a8)*100/6.25; }
const HAVS_DAY_LABELS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
// Shared logo geometry for every HAVS PDF page header — fixed to the
// original (narrower) page width so the logo lands at the same horizontal
// position on every page even where a page (e.g. the calculator page) has
// been widened for its own table.
const HAVS_LOGO_SIZE = 46; // 1.2x the previous 38pt box
const HAVS_LOGO_RIGHT_X = 595.28 - 44 - HAVS_LOGO_SIZE;
let havsWeekOffset = 0;
// Days default to expanded — a manager can collapse one as they finish it,
// but that's a per-day choice they make, not something we start closed.
let havsDayOpen = {};
window.toggleHavsDay = async function(di, siteId){
  const wasOpen = havsDayOpen[di];
  havsDayOpen[di] = !wasOpen;
  render(); // collapse/expand right away — stays responsive to the tap
  if(wasOpen && siteId){
    const saved = await flushHavsDayDrafts(siteId, di);
    if(saved){ toast('Entries saved'); render(); }
  }
};
// Entry drafts are keyed per day+tool (each relevant tool is a preset box
// on every day). Every operative assigned to the site is listed under the
// tool automatically — a manager just tabs through and types minutes for
// whoever actually used it that day, no dropdown/ticking required — plus
// an "extraUserIds" list for the rare operative who isn't assigned to the
// site but still needs logging here. Typing a whole number and
// tabbing/blurring out of a field commits that one entry immediately —
// there is no separate "Add" step. An operative just types his own minutes
// the same way. Key = `${dayIdx}|${toolId}`.
let havsDraft2 = {};
// Starts open so a PM/operative can pick tools straight away.
let havsSiteToolPickerOpen = true;
let havsNewToolFormOpen = false;
let havsNewToolDraft = {name:'', magnitude:''};
// Inline editing of an already-logged entry's minutes.
let havsEntryEditingId = null;
let havsEntryEditDraft = {};
// Which operatives are ticked for the "Export Selected" button up top.
let havsExportSelectedIds = [];
// 'weekly' = the normal editable current/past-week view, 'completed' = the
// read-only list of weeks a manager has marked done.
let havsActiveTab = 'weekly';
window.setHavsTab = function(tab){ havsActiveTab = tab; render(); };
// Weekly Summary is a dropdown now — auto-expanded only the first time a
// given week is viewed AND it actually has entries logged; keyed by the
// week's Monday date so it re-evaluates correctly as the user pages weeks.
let havsWeeklySummaryOpenByWeek = {};
window.toggleHavsWeeklySummary = function(weekKey){ havsWeeklySummaryOpenByWeek[weekKey] = !havsWeeklySummaryOpenByWeek[weekKey]; render(); };
let havsMarkCompleteBusy = false;
let havsExportAllBusy = false;
let havsEmailAllBusy = false;
window.shiftHavsWeek = async function(dir, siteId){
  // The day-index keys (0-4) in havsDraft2 get reused for whichever week is
  // showing, so a still-typed-but-uncommitted box left open here would
  // otherwise silently bleed into the new week once the offset changes.
  if(siteId) await flushAllHavsDrafts(siteId);
  havsWeekOffset += dir;
  render();
};
function havsWeekDates(offset){
  const weekStart = startOfWeek(Date.now()) + offset*7*24*60*60*1000;
  return [0,1,2,3,4].map(i => new Date(weekStart + i*86400000));
}
// Same as havsWeekDates but from an explicit Monday (YYYY-MM-DD) rather than
// an offset from today — used by the Completed HAVS tab to re-export/email
// an arbitrary past week regardless of where havsWeekOffset currently is.
function havsWeekDatesFromStart(weekStartISO){
  const ms = new Date(weekStartISO+'T00:00:00').getTime();
  return [0,1,2,3,4].map(i => new Date(ms + i*86400000));
}
function havsWeekLabelFor(days){
  return `${days[0].toLocaleDateString('en-GB',{day:'2-digit',month:'short'})} – ${days[4].toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}`;
}
function havsDraft2For(dayIdx, toolId){
  const key = dayIdx+'|'+toolId;
  if(!havsDraft2[key]) havsDraft2[key] = {extraUserIds:[], minutesByUser:{}, addPickerOpen:false};
  return havsDraft2[key];
}
function havsWholeMinutes(raw){
  const s = (raw==null?'':String(raw)).trim();
  if(!s) return {ok:false, empty:true};
  if(!/^\d+$/.test(s)){ toast('Whole numbers only.'); return {ok:false}; }
  const n = parseInt(s, 10);
  if(n<=0 || n>480){ toast('Enter minutes between 1 and 480.'); return {ok:false}; }
  return {ok:true, minutes:n};
}
window.toggleHavsAddPicker = function(dayIdx, toolId){
  const d = havsDraft2For(dayIdx, toolId);
  d.addPickerOpen = !d.addPickerOpen;
  render();
};
window.addHavsExtraOperative = function(dayIdx, toolId, userId){
  if(!userId) return;
  const d = havsDraft2For(dayIdx, toolId);
  if(!d.extraUserIds.includes(userId)) d.extraUserIds.push(userId);
  d.addPickerOpen = false;
  render();
};
window.removeHavsExtraOperative = function(dayIdx, toolId, userId){
  const d = havsDraft2For(dayIdx, toolId);
  d.extraUserIds = d.extraUserIds.filter(id=>id!==userId);
  delete d.minutesByUser[userId];
  render();
};
window.setHavsDraftMinutes = function(dayIdx, toolId, userId, value){
  havsDraft2For(dayIdx, toolId).minutesByUser[userId] = value;
};
// Best-effort: if this entry pushed the operative's total for the day past
// the EAV (100pts) or ELV (400pts) for the first time, post an automatic
// message up to the site's PM/admin — never blocks entry logging on
// failure. Only fires on the commit that actually crosses the line, not on
// every entry once already over.
async function notifyIfHavsThresholdCrossed(siteId, userId, entryDate, justToolId, justMinutes){
  try{
    const [dayEntries, tools] = await Promise.all([
      dbSelect('havs_entries', `site_id=eq.${siteId}&user_id=eq.${userId}&entry_date=eq.${entryDate}&select=tool_id,minutes`),
      dbSelect('havs_tools', 'org_id=eq.'+ME.org_id+'&select=id,vibration_magnitude'),
    ]);
    const magById = {}; tools.forEach(t=>magById[t.id]=Number(t.vibration_magnitude)||0);
    const totalPts = dayEntries.reduce((s,e)=>s+havsPoints(magById[e.tool_id]||0, e.minutes), 0);
    const justAddedPts = havsPoints(magById[justToolId]||0, justMinutes);
    const beforePts = totalPts - justAddedPts;
    const site = SITES.find(s=>s.id===siteId);
    const label = site ? site.name+': ' : '';
    const opName = nameOf(userId);
    const dateLabel = new Date(entryDate+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
    if(beforePts<400 && totalPts>=400){
      await postSystemMessage(siteId, 'havs_elv_exceeded', `${label}${opName} has exceeded the daily HAVS Exposure Limit Value (ELV) on ${dateLabel} — ${totalPts.toFixed(0)} pts. Immediate action required.`);
    } else if(beforePts<100 && totalPts>=100){
      await postSystemMessage(siteId, 'havs_eav_exceeded', `${label}${opName} has passed the daily HAVS Exposure Action Value (EAV) on ${dateLabel} — ${totalPts.toFixed(0)} pts.`);
    }
  }catch(e){ /* best-effort — never blocks entry logging */ }
}
// Saving a box's minutes used to happen the moment it was tabbed/blurred
// out of — a real network round-trip followed by a full re-render. That
// re-render was rebuilding every input on the page right in the middle of
// a Tab keypress, which is exactly what made tabbing between boxes feel
// broken (focus landing nowhere, a half-typed value in the next box getting
// wiped by the render that had been triggered by the PREVIOUS box). Typing
// now only ever updates the in-memory draft (see setHavsDraftMinutes's
// oninput wiring) — nothing is written to the database, and nothing
// re-renders, until the day is actually closed (see toggleHavsDay) or the
// week is switched/saved, at which point every pending box for that day (or
// every day) gets committed here in one go.
async function commitOneHavsDraftEntry(siteId, dayIdx, toolId, userId){
  const d = havsDraft2For(dayIdx, toolId);
  const check = havsWholeMinutes(d.minutesByUser[userId]);
  if(check.empty || !check.ok) return false; // silently skip blank/invalid — a bulk flush shouldn't toast for every empty box
  const date = havsWeekDates(havsWeekOffset)[dayIdx];
  const entry_date = localISODate(date);
  const rows = await dbInsert('havs_entries', {org_id:ME.org_id, site_id:siteId, user_id:userId, entry_date, tool_id:toolId, minutes:check.minutes, created_by:ME.id});
  if(rows){
    delete d.minutesByUser[userId];
    notifyIfHavsThresholdCrossed(siteId, userId, entry_date, toolId, check.minutes);
    return true;
  }
  return false;
}
// Every box still holding a typed-but-uncommitted value for this one day,
// across every tool — this is the actual "save" moment (triggered by
// closing the day, switching week, or saving & closing the whole week).
async function flushHavsDayDrafts(siteId, dayIdx){
  const prefix = dayIdx+'|';
  let any = false;
  for(const key of Object.keys(havsDraft2)){
    if(!key.startsWith(prefix)) continue;
    const toolId = key.slice(prefix.length);
    const draft = havsDraft2[key];
    for(const userId of Object.keys(draft.minutesByUser)){
      if(await commitOneHavsDraftEntry(siteId, dayIdx, toolId, userId)) any = true;
    }
  }
  return any;
}
// All five days' pending drafts — used when switching week (the day-index
// keys 0-4 get reused for whichever week is on screen, so anything left
// sitting in a box would otherwise silently bleed into the new week once
// the offset changes) and before Save & Close locks the week for good.
async function flushAllHavsDrafts(siteId){
  let any = false;
  for(let di=0; di<5; di++){ if(await flushHavsDayDrafts(siteId, di)) any = true; }
  return any;
}
window.toggleHavsExportSelected = function(userId){
  const i = havsExportSelectedIds.indexOf(userId);
  if(i>-1) havsExportSelectedIds.splice(i,1); else havsExportSelectedIds.push(userId);
  render();
};
window.startEditHavsEntry = function(entryId, currentMinutes){
  havsEntryEditingId = entryId;
  havsEntryEditDraft[entryId] = String(currentMinutes);
  render();
};
window.setHavsEntryEditDraft = function(entryId, value){ havsEntryEditDraft[entryId] = value; };
window.saveHavsEntryEdit = async function(entryId){
  if(havsEntryEditingId!==entryId) return; // already saved/cancelled
  const check = havsWholeMinutes(havsEntryEditDraft[entryId]);
  if(check.empty){ havsEntryEditingId = null; render(); return; }
  if(!check.ok) return;
  const row = await dbUpdate('havs_entries', entryId, {minutes:check.minutes});
  if(row){ havsEntryEditingId = null; toast('Entry updated'); render(); }
};
window.deleteHavsEntry = async function(entryId){
  if(!await customConfirm('Remove this HAVS entry?')) return;
  const rows = await dbSelect('havs_entries', 'id=eq.'+entryId+'&select=site_id,user_id,entry_date');
  const havsRow = rows[0];
  const ok = await dbDelete('havs_entries', entryId);
  if(ok){ toast('Entry removed'); if(havsRow) logSiteActivity(havsRow.site_id, 'havs_entry_deleted', `Deleted HAVS entry for ${nameOf(havsRow.user_id)} (${havsRow.entry_date||''})`); render(); }
};
window.toggleHavsSiteToolPicker = function(){ havsSiteToolPickerOpen = !havsSiteToolPickerOpen; render(); };
window.toggleSiteHavsTool = async function(siteId, toolId, isOn){
  if(isOn){
    const res = await sbFetch('/rest/v1/site_havs_tools?site_id=eq.'+siteId+'&tool_id=eq.'+toolId, {method:'DELETE'});
    if(!res.ok){ toast('Could not remove — '+(await safeErr(res))); return; }
  } else {
    const rows = await dbInsert('site_havs_tools', {site_id:siteId, tool_id:toolId});
    if(!rows) return;
  }
  render();
};
window.toggleHavsNewToolForm = function(){ havsNewToolFormOpen = !havsNewToolFormOpen; render(); };
window.setHavsNewToolDraft = function(field, value){ havsNewToolDraft[field] = value; };
window.addHavsToolInline = async function(siteId){
  const name = titleCaseWords((havsNewToolDraft.name||'').trim());
  const mag = parseFloat(havsNewToolDraft.magnitude);
  if(!name){ toast('Enter a tool name.'); return; }
  if(!isFinite(mag) || mag<=0){ toast('Enter a magnitude greater than 0.'); return; }
  const rows = await dbInsert('havs_tools', {org_id:ME.org_id, name, vibration_magnitude:mag, sort_order:999});
  if(!rows) return;
  const linked = await dbInsert('site_havs_tools', {site_id:siteId, tool_id:rows[0].id});
  if(!linked) return;
  havsNewToolDraft = {name:'', magnitude:''};
  havsNewToolFormOpen = false;
  havsSiteToolPickerOpen = false;
  toast('Tool added to the HAVS register and this site');
  render();
};
// Minutes typed into the HAVS grid sit in havsDraft2 (keyed by day and tool
// only) until the day is closed. Opening HAVS on a DIFFERENT site used to
// show those leftover figures there and save them against the wrong site.
// They are now saved to the site they were typed on before the grid is
// cleared for the new one.
let havsDraftSiteId = null;
async function renderHavs(siteId){
  if(havsDraftSiteId && havsDraftSiteId !== siteId && Object.keys(havsDraft2).length){
    try{ await flushAllHavsDrafts(havsDraftSiteId); }catch(e){ console.error(e); }
    havsDraft2 = {};
  }
  havsDraftSiteId = siteId;
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canManage = isManager(ME);
  const days = havsWeekDates(havsWeekOffset);
  const weekLabel = havsWeekLabelFor(days);
  const dateFrom = localISODate(days[0]);
  const dateTo = localISODate(days[4]);

  if(havsActiveTab==='completed'){
    await renderHavsCompletedTab(siteId, site, canManage, __gen);
    return;
  }

  const [allTools, assignedRows, siteToolRows, weekCompletionRows] = await Promise.all([
    dbSelect('havs_tools', 'org_id=eq.'+ME.org_id+'&active=eq.true&order=sort_order.asc'),
    canManage ? dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : Promise.resolve([]),
    dbSelect('site_havs_tools', 'site_id=eq.'+siteId+'&select=tool_id'),
    dbSelect('havs_weekly_completions', `site_id=eq.${siteId}&week_start=eq.${dateFrom}&select=id,completed_at,completed_by`),
  ]);
  const weekCompletion = weekCompletionRows[0] || null;
  const siteToolIds = new Set(siteToolRows.map(r=>r.tool_id));
  // Only the tools this site has been set up to use appear as boxes — an
  // org might have a dozen HAVS tools registered but only two or three are
  // relevant to any one job.
  const tools = allTools.filter(t=>siteToolIds.has(t.id));
  await loadAllProfiles();
  const operativeIds = canManage
    ? assignedRows.map(r=>r.user_id).filter(id => PROFILES[id] && PROFILES[id].role==='operative')
    : [ME.id];
  const operatives = operativeIds.map(id=>PROFILES[id]).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  // Everyone in the org with the operative role — used by "+ Add operative"
  // to cover the rare case of someone not assigned to this site.
  const allOrgOperatives = Object.values(PROFILES).filter(p=>p.role==='operative').sort((a,b)=>a.name.localeCompare(b.name));
  const toolById = {}; tools.forEach(t=>toolById[t.id]=t);
  // Managers can see everyone's entries; an operative only ever sees (and
  // can only ever log against) himself — enforced here, not just in the UI.
  const rawEntries = (operatives.length && tools.length) ? await dbSelect('havs_entries', `site_id=eq.${siteId}&entry_date=gte.${dateFrom}&entry_date=lte.${dateTo}&order=entry_date.asc`) : [];
  const entries = canManage ? rawEntries : rawEntries.filter(e=>e.user_id===ME.id);

  // Days default to expanded — never override a day the user has already
  // opened or closed themselves.
  days.forEach((d,di)=>{ if(havsDayOpen[di]===undefined) havsDayOpen[di] = true; });
  // The Weekly Summary is only shown once the week's been saved & closed
  // (see the button at the bottom of this page) — it used to appear and
  // fill in the moment a single entry existed, mid-week, which read as a
  // "final" rollup while the week was still very much in progress. Auto-
  // expand it the first time a just-closed week is seen; after that it's
  // the user's own toggle to keep or collapse.
  if(havsWeeklySummaryOpenByWeek[dateFrom]===undefined) havsWeeklySummaryOpenByWeek[dateFrom] = !!weekCompletion;
  const weeklySummaryOpen = havsWeeklySummaryOpenByWeek[dateFrom];

  // Per-operative day/week point totals for the summary strip — HAVS limits
  // are personal (per body), so this still needs rolling up per operative
  // even though entry is organised by day/tool.
  const opStats = {};
  operatives.forEach(op=>{ opStats[op.id] = {byDay:[0,0,0,0,0], week:0}; });
  entries.forEach(e=>{
    const tool = toolById[e.tool_id];
    if(!tool) return;
    const di = days.findIndex(d=>localISODate(d)===e.entry_date);
    if(di<0) return;
    if(!opStats[e.user_id]) opStats[e.user_id] = {byDay:[0,0,0,0,0], week:0};
    const pts = havsPoints(tool.vibration_magnitude, e.minutes);
    opStats[e.user_id].byDay[di] += pts;
    opStats[e.user_id].week += pts;
  });

  // No onblur handler any more — it used to fire a network save + full
  // page re-render the instant a box lost focus, which is what made
  // tabbing between boxes feel broken (the re-render triggered by the box
  // you just left would land mid-keystroke in whichever box Tab had just
  // moved focus to, wiping out what was being typed there or knocking focus
  // off it entirely). oninput alone keeps the in-memory draft current —
  // nothing is saved to the database, and nothing re-renders, until the day
  // is closed (see toggleHavsDay/flushHavsDayDrafts).
  function minuteInput(entryKey, oninputJs, currentVal){
    return `<input type="number" min="1" max="480" step="1" inputmode="numeric" placeholder="Mins" value="${escapeHtml(currentVal||'')}" style="width:52px;flex:0 0 52px;padding:4px 5px;font-size:11.5px;min-width:0;box-sizing:border-box;" data-havs-entry-input="${entryKey}" oninput="${oninputJs}" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">`;
  }

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <button class="${havsActiveTab==='weekly'?'darkbtn':'ghostbtn'}" style="flex:1;width:auto;padding:8px 6px;font-size:12px;" onclick="setHavsTab('weekly')">This Week</button>
      <button class="${havsActiveTab==='completed'?'darkbtn':'ghostbtn'}" style="flex:1;width:auto;padding:8px 6px;font-size:12px;" onclick="setHavsTab('completed')">Completed HAVS</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <span class="taskicon" style="width:36px;height:36px;font-size:20px;font-weight:700;" onclick="shiftHavsWeek(-1,'${siteId}')">‹</span>
      <span style="font-weight:800;font-size:13.5px;">${escapeHtml(weekLabel)}</span>
      <span class="taskicon" style="width:36px;height:36px;font-size:20px;font-weight:700;${havsWeekOffset>=0?'opacity:.35;pointer-events:none;':''}" onclick="shiftHavsWeek(1,'${siteId}')">›</span>
    </div>
    <p class="stub" style="text-align:center;margin:0 0 10px;">Daily EAV (action value) = 100 points · Daily ELV (limit value) = 400 points</p>
    ${operatives.length ? `
    <div class="row-gap" style="margin-bottom:14px;">
      <button class="ghostbtn exportbtn" style="flex:1;" ${havsExportAllBusy?'disabled':''} onclick="exportHavsCollective('${siteId}')">${havsExportAllBusy?'Building…':'Export'}</button>
      <button class="ghostbtn exportbtn" style="flex:1;" ${havsEmailAllBusy?'disabled':''} onclick="emailHavsCollective('${siteId}')">${havsEmailAllBusy?'Sending…':'Email'}</button>
    </div>
    ` : ''}
    ${!operatives.length ? `<div class="empty">${canManage ? 'No operatives assigned to this site yet.' : 'You are not assigned to this site.'}</div>` : ''}

    <p class="ddrow" style="margin-top:0;${havsSiteToolPickerOpen?'':'margin-bottom:14px;'}" onclick="toggleHavsSiteToolPicker()"><span class="arrow">${havsSiteToolPickerOpen?'▼':'▶'}</span> Tools On This Site (${tools.length})</p>
    ${havsSiteToolPickerOpen ? `
    <div class="card" style="margin-bottom:14px;">
      <p class="stub" style="margin:0 0 10px;">Tick which HAVS tools are relevant to this site — only these show up as entry boxes below.</p>
      ${allTools.length ? allTools.map(t=>`
        <label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;border-bottom:1px solid var(--line);">
          <input type="checkbox" ${siteToolIds.has(t.id)?'checked':''} onchange="toggleSiteHavsTool('${siteId}','${t.id}',${siteToolIds.has(t.id)})">
          ${escapeHtml(titleCaseWords(t.name))} <span class="stub" style="margin:0;">(${t.vibration_magnitude} m/s²)</span>
        </label>
      `).join('') : `<div class="empty">No HAVS tools set up yet.</div>`}
      ${canManage ? (havsNewToolFormOpen ? `
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
          <input type="text" placeholder="Tool name" style="flex:2;min-width:120px;" value="${escapeHtml(havsNewToolDraft.name)}" oninput="setHavsNewToolDraft('name',this.value)">
          <input type="number" step="0.1" min="0.1" placeholder="Mag (m/s²)" style="flex:0 0 100px;" value="${escapeHtml(havsNewToolDraft.magnitude)}" oninput="setHavsNewToolDraft('magnitude',this.value)">
          <button class="darkbtn" style="flex:0 0 auto;width:auto;padding:8px 12px;" onclick="addHavsToolInline('${siteId}')">Save</button>
        </div>
      ` : `<button class="ghostbtn" style="margin-top:10px;padding:9px 14px;font-size:12.5px;text-transform:none;letter-spacing:.01em;border-radius:9px;" onclick="toggleHavsNewToolForm()">+ Add Tool</button>`) : ''}
    </div>
    ` : ''}
    ${!tools.length ? `<div class="errbox" style="margin-bottom:14px;">${canManage ? 'No tools selected for this site yet — tick some above.' : 'No HAVS tools have been set up for this site yet — ask your PM or admin.'}</div>` : ''}

    ${operatives.length && !weekCompletion ? `<p class="stub" style="margin:0 0 10px;">Weekly Summary appears once this week is saved &amp; closed, below.</p>` : ''}
    ${operatives.length && weekCompletion ? `
    <p class="ddrow" style="margin-top:10px;${weeklySummaryOpen?'':'margin-bottom:14px;'}" onclick="toggleHavsWeeklySummary('${dateFrom}')"><span class="arrow">${weeklySummaryOpen?'▼':'▶'}</span> Weekly Summary${entries.length?` (${entries.length} entr${entries.length===1?'y':'ies'})`:''}</p>
    ${weeklySummaryOpen ? `
    <div class="card" style="margin-bottom:14px;">
      <p class="stub" style="margin:0 0 8px;">Tick an operative to include them in Export Selected below.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">
        ${operatives.map(op=>{
          const st = opStats[op.id] || {byDay:[0,0,0,0,0], week:0};
          return `
          <div style="border:1px solid var(--line);border-radius:8px;padding:8px;min-width:0;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" ${havsExportSelectedIds.includes(op.id)?'checked':''} onchange="toggleHavsExportSelected('${op.id}')">
              <span style="font-weight:700;font-size:11.5px;overflow-wrap:anywhere;">${escapeHtml(op.name)}</span>
            </label>
            <div style="display:flex;gap:3px;margin-top:6px;">
              ${st.byDay.map((pts,i)=>`<span title="${HAVS_DAY_LABELS[i]}: ${pts.toFixed(0)} pts" style="width:20px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;background:${pts>=400?'#FBE1DE':pts>=100?'#FFF3E0':'#E9F7EF'};color:${pts>=400?'var(--brand1)':pts>=100?'#B85C00':'#1E9E52'};">${HAVS_DAY_LABELS[i][0]}</span>`).join('')}
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;gap:6px;">
              <span style="background:var(--paper);color:var(--slate);font-size:9.5px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap;" title="Sum of this week's daily points — informational; the EAV/ELV limits themselves are daily, not weekly.">${st.week.toFixed(0)} pts/wk</span>
              <button class="ghostbtn" style="width:auto;padding:4px 8px;font-size:10px;" onclick="exportHavsIndividual('${siteId}','${op.id}')">Export</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line);">
        <button class="ghostbtn" style="flex:1;width:auto;padding:8px 6px;font-size:11px;" ${havsExportAllBusy?'disabled':''} onclick="exportHavsCollective('${siteId}')">${havsExportAllBusy?'Building…':'Export All Operatives Weekly HAVS'}</button>
        <button class="ghostbtn" style="flex:1;width:auto;padding:8px 6px;font-size:11px;" ${havsEmailAllBusy?'disabled':''} onclick="emailHavsCollective('${siteId}')">${havsEmailAllBusy?'Sending…':'Email All Operatives Weekly HAVS'}</button>
      </div>
      ${havsExportSelectedIds.length ? `
      <button class="ghostbtn" style="width:100%;margin-top:8px;padding:7px 6px;font-size:11px;" onclick="exportHavsSelected('${siteId}')">Export Selected (${havsExportSelectedIds.length})</button>
      ` : ''}
    </div>
    ` : ''}
    ` : ''}

    ${tools.length && operatives.length ? days.map((d,di)=>{
      const dateStr = localISODate(d);
      const isOpen = !!havsDayOpen[di];
      const dayTotalPts = tools.reduce((sum,tool)=>sum + entries.filter(e=>e.entry_date===dateStr && e.tool_id===tool.id).reduce((s,e)=>s+havsPoints(tool.vibration_magnitude, e.minutes),0), 0);
      return `
      <p class="ddrow" style="margin-top:${di===0?0:10}px;" onclick="toggleHavsDay(${di},'${siteId}')">
        <span class="arrow">${isOpen?'▼':'▶'}</span> ${HAVS_DAY_LABELS[di]} <span class="stub" style="font-weight:400;">${d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</span>
        ${dayTotalPts>0 ? (()=>{
          // .status's pill styling (padding/pill-shape/uppercase/colour) only
          // ever applies inside a .sitecard ancestor (see CSS) — this badge
          // sits in a plain .ddrow, so the class alone rendered as bare
          // black text with no background at all. Self-contained inline
          // styles here instead of relying on that scoped class.
          const pillBase = 'font-size:10.8px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:3.24px 8.64px;border-radius:999px;float:right;';
          const [bg,color,label] = dayTotalPts>=400 ? ['#FBE1DE','var(--brand1)','ELV EXCEEDED']
            : dayTotalPts>=100 ? ['var(--warn-bg)','var(--warn)','ACTION NEEDED']
            : ['var(--ok-bg)','var(--ok)','OK'];
          return `<span style="${pillBase}background:${bg};color:${color};">${label}</span>`;
        })() : ''}
      </p>
      ${isOpen ? `
      <div class="card" style="margin-bottom:4px;">
        ${!weekCompletion ? `<p class="stub" style="margin:0 0 8px;">Minutes save when you close ${HAVS_DAY_LABELS[di]} again (tap the day above).</p>` : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">
          ${tools.map(tool=>{
            const sessions = entries.filter(e=>e.entry_date===dateStr && e.tool_id===tool.id).map(e=>{
              const pts = havsPoints(tool.vibration_magnitude, e.minutes);
              const opName = (PROFILES[e.user_id] && PROFILES[e.user_id].name) || '(removed)';
              const canEditThis = canManage || e.user_id===ME.id;
              return {id:e.id, userId:e.user_id, opName, minutes:e.minutes, pts, canEditThis};
            });
            const loggedIds = new Set(sessions.map(s=>s.userId));
            const draft = havsDraft2For(di, tool.id);
            // Default list = every operative assigned to the site who
            // hasn't already logged this tool today, plus anyone manually
            // added via "+ Add operative" — no dropdown/ticking needed for
            // the common case of the whole crew using the same kit.
            const toFillIds = canManage
              ? [...operatives.map(o=>o.id), ...draft.extraUserIds].filter(id=>!loggedIds.has(id))
              : [];
            const pickableExtra = allOrgOperatives.filter(p=>!operatives.some(o=>o.id===p.id) && !draft.extraUserIds.includes(p.id));
            return `
            <div style="border:1px solid var(--line);border-radius:8px;padding:8px 8px;grid-column:span 1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                <span style="font-weight:700;font-size:11.5px;overflow-wrap:anywhere;">${escapeHtml(titleCaseWords(tool.name))}</span>
                <span class="stub" style="font-weight:400;font-size:10px;flex:0 0 auto;">${tool.vibration_magnitude} m/s²</span>
              </div>
              ${sessions.map(s=>`
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--slate);margin-top:4px;gap:6px;">
                  ${havsEntryEditingId===s.id ? `
                    <input type="number" min="1" max="480" step="1" inputmode="numeric" value="${escapeHtml(havsEntryEditDraft[s.id]!==undefined?havsEntryEditDraft[s.id]:s.minutes)}" style="width:56px;flex:0 0 56px;padding:2px 4px;font-size:11px;" oninput="setHavsEntryEditDraft('${s.id}',this.value)" onblur="saveHavsEntryEdit('${s.id}')" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
                    <span style="overflow-wrap:anywhere;flex:1;">${escapeHtml(s.opName)} · ${s.pts.toFixed(0)}pts</span>
                  ` : `
                    <span style="overflow-wrap:anywhere;flex:1;">${escapeHtml(s.opName)} · ${s.minutes}m · ${s.pts.toFixed(0)}pts</span>
                  `}
                  ${s.canEditThis && havsEntryEditingId!==s.id && !weekCompletion ? `
                    <div style="display:flex;gap:4px;flex:0 0 auto;">
                      <span class="taskicon" style="width:18px;height:18px;font-size:9px;" onclick="startEditHavsEntry('${s.id}',${s.minutes})">✎</span>
                      <span class="taskicon danger" style="width:18px;height:18px;font-size:9px;" onclick="deleteHavsEntry('${s.id}')">🗑</span>
                    </div>
                  ` : ''}
                </div>
              `).join('')}
              ${weekCompletion ? `<p class="stub" style="margin:6px 0 0;">🔒 Week locked</p>` : canManage && operatives.length ? `
                ${toFillIds.length ? `
                  <div style="margin-top:8px;">
                    ${toFillIds.map(uid=>`
                      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:3px 0;">
                        <span style="font-size:11px;font-weight:600;overflow-wrap:anywhere;">${escapeHtml(nameOf(uid))}</span>
                        <div style="display:flex;align-items:center;gap:4px;">
                          ${minuteInput(di+'|'+tool.id+'|'+uid, `setHavsDraftMinutes(${di},'${tool.id}','${uid}',this.value)`, draft.minutesByUser[uid])}
                          ${draft.extraUserIds.includes(uid) ? `<span class="taskicon" style="width:16px;height:16px;font-size:8px;" onclick="removeHavsExtraOperative(${di},'${tool.id}','${uid}')">✕</span>` : ''}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
                ${pickableExtra.length ? (draft.addPickerOpen ? `
                  <div style="margin-top:8px;">
                    <select style="width:100%;" onchange="addHavsExtraOperative(${di},'${tool.id}',this.value)">
                      <option value="">Choose operative…</option>
                      ${pickableExtra.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
                    </select>
                  </div>
                ` : `<button type="button" class="ghostbtn" style="width:100%;padding:5px 8px;font-size:10.5px;margin-top:8px;" onclick="toggleHavsAddPicker(${di},'${tool.id}')">+ Add operative</button>`) : ''}
              ` : (!canManage && operatives.length) ? `
                <div style="margin-top:8px;">
                  ${minuteInput(di+'|'+tool.id+'|'+ME.id, `setHavsDraftMinutes(${di},'${tool.id}','${ME.id}',this.value)`, draft.minutesByUser[ME.id])}
                </div>
              ` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
      ` : ''}`;
    }).join('') : ''}
    ${canManage && operatives.length ? `
    <div class="card" style="margin-top:14px;">
      ${weekCompletion ? `
        <p class="stub" style="margin:0 0 6px;">🔒 Saved &amp; closed ${new Date(weekCompletion.completed_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}${weekCompletion.completed_by && PROFILES[weekCompletion.completed_by] ? ' by '+escapeHtml(PROFILES[weekCompletion.completed_by].name) : ''}</p>
        <div class="row-gap">
          <button class="ghostbtn" style="flex:1;padding:8px 6px;font-size:11.5px;" ${havsMarkCompleteBusy?'disabled':''} onclick="reopenHavsWeek('${weekCompletion.id}')">Reopen This Week</button>
          <button class="darkbtn" style="flex:1;padding:8px 6px;font-size:11.5px;" onclick="moveToNextHavsWeek()">Move to Next Week →</button>
        </div>
      ` : `
        <button class="darkbtn" style="width:100%;padding:8px 6px;font-size:11.5px;" ${havsMarkCompleteBusy?'disabled':''} onclick="markHavsWeekComplete('${siteId}','${dateFrom}')">Save &amp; Close for the Week</button>
      `}
    </div>
    ` : ''}
  `, {title:'HAVS', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/havspuwer`, siteId, activeTab:'more'}); }
}

// Read-only list of weeks a manager has marked done, with Export/Email
// still available per week (re-generated from that week's stored dates,
// regardless of where the live "This Week" nav currently sits) plus a
// Reopen action to send a week back to the active tab.
let havsCompletedBusyAction = null; // `${weekStart}|export` etc, disables just that row's buttons
async function renderHavsCompletedTab(siteId, site, canManage, __gen){
  const rows = await dbSelect('havs_weekly_completions', `site_id=eq.${siteId}&select=id,week_start,completed_at,completed_by&order=week_start.desc`);
  if(rows.length) await loadAllProfiles();
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <button class="ghostbtn" style="flex:1;width:auto;padding:8px 6px;font-size:12px;" onclick="setHavsTab('weekly')">This Week</button>
      <button class="darkbtn" style="flex:1;width:auto;padding:8px 6px;font-size:12px;" onclick="setHavsTab('completed')">Completed HAVS</button>
    </div>
    ${!rows.length ? `<div class="empty">No weeks saved &amp; closed yet — use "Save &amp; Close for the Week" on the This Week tab once a week's HAVS register is finished.</div>` : rows.map(r=>{
      const days = havsWeekDatesFromStart(r.week_start);
      const weekLabel = havsWeekLabelFor(days);
      const completedBy = r.completed_by && PROFILES[r.completed_by] ? PROFILES[r.completed_by].name : null;
      const busyKeyExport = r.week_start+'|export', busyKeyEmail = r.week_start+'|email', busyKeyReopen = r.week_start+'|reopen';
      return `
      <div class="card" style="margin-bottom:10px;">
        <p style="font-weight:800;font-size:13px;margin:0 0 2px;">${escapeHtml(weekLabel)}</p>
        <p class="stub" style="margin:0 0 10px;">Completed ${new Date(r.completed_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}${completedBy?' by '+escapeHtml(completedBy):''}</p>
        <div style="display:flex;gap:8px;">
          <button class="ghostbtn" style="flex:1;width:auto;padding:8px 6px;font-size:11px;" ${havsCompletedBusyAction===busyKeyExport?'disabled':''} onclick="exportHavsCompletedWeek('${siteId}','${r.week_start}')">${havsCompletedBusyAction===busyKeyExport?'Building…':'Export'}</button>
          <button class="ghostbtn" style="flex:1;width:auto;padding:8px 6px;font-size:11px;" ${havsCompletedBusyAction===busyKeyEmail?'disabled':''} onclick="emailHavsCompletedWeek('${siteId}','${r.week_start}')">${havsCompletedBusyAction===busyKeyEmail?'Sending…':'Email'}</button>
          ${canManage ? `<button class="ghostbtn" style="flex:1;width:auto;padding:8px 6px;font-size:11px;" ${havsCompletedBusyAction===busyKeyReopen?'disabled':''} onclick="reopenHavsWeek('${r.id}')">Reopen</button>` : ''}
        </div>
      </div>`;
    }).join('')}
  `, {title:'HAVS', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs/havspuwer`, siteId, activeTab:'more'}); }
}
window.exportHavsCompletedWeek = async function(siteId, weekStart){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  havsCompletedBusyAction = weekStart+'|export'; render();
  try{
    const days = havsWeekDatesFromStart(weekStart);
    const weekLabel = havsWeekLabelFor(days);
    const operatives = await havsResolveAllOperatives(siteId);
    await havsExportOperativeSet(siteId, operatives, 'All Operatives', days, weekLabel);
  }catch(err){
    console.error('HAVS completed-week export failed', err);
    toast('Export failed — '+(err && err.message ? err.message : 'unknown error'));
  }
  havsCompletedBusyAction = null; render();
};
window.emailHavsCompletedWeek = async function(siteId, weekStart){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  havsCompletedBusyAction = weekStart+'|email'; render();
  try{
    const days = havsWeekDatesFromStart(weekStart);
    const weekLabel = havsWeekLabelFor(days);
    const operatives = await havsResolveAllOperatives(siteId);
    await havsEmailOperativeSet(siteId, operatives, 'All Operatives', days, weekLabel);
  }catch(err){
    console.error('HAVS completed-week email failed', err);
    toast('Email failed — '+(err && err.message ? err.message : 'unknown error'));
  }
  havsCompletedBusyAction = null; render();
};

/* ---- HAVS PDF export — a real calculator table (Tool / Magnitude / Time /
   Partial A(8) / Points) per day, matching the government HAVS calculator's
   own layout, not just a bare log. Shared by both the individual export and
   the collective one — collective just calls the same page-drawing routine
   once per operative into the SAME document, so everyone lands in one PDF
   one after another, exactly like the old spreadsheet's single-file export. */
function pdfWrapText(font, size, text, maxWidth){
  const words = String(text==null?'':text).split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w=>{
    const test = cur ? cur+' '+w : w;
    if(cur && font.widthOfTextAtSize(test, size) > maxWidth){
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  });
  if(cur) lines.push(cur);
  return lines.length ? lines : [''];
}
async function drawHavsOperativePages(pdfDoc, fonts, siteName, weekLabel, days, op, tools, toolById, entries, logoImg){
  const {bold, reg, italic, INK, SLATE, LINE, HEADBG, RED, AMBER, GREEN, BRAND, WHITE} = fonts;
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const MARGIN = 44;
  const TABLE_W = PAGE_W - 2*MARGIN;
  // Widened Tool column (and shortened header labels) — long tool names
  // like "4in battery grinder (Dewalt or Makita)" were overrunning into the
  // Magnitude column at the old 148pt width and overlapping the numbers.
  // Rows now also wrap and grow in height instead of letting text run on.
  const COLS = [ // [label, width]
    ['Day', 56], ['Tool', 168], ['Mag (m/s²)', 74], ['Mins', 48], ['Partial A(8)', 84], ['Points', TABLE_W-56-168-74-48-84]
  ];
  const ROW_H = 16, HEADER_H = 20, LINE_H = 10.5;
  let page, y;
  function colX(i){ let x = MARGIN; for(let j=0;j<i;j++) x += COLS[j][1]; return x; }
  function drawHeaderBand(){
    page.drawRectangle({x:0, y:PAGE_H-80, width:PAGE_W, height:80, color:BRAND});
    if(logoImg){
      const dim = logoImg.scale(1);
      const s = HAVS_LOGO_SIZE/Math.max(dim.width, dim.height);
      const w = dim.width*s, h = dim.height*s;
      page.drawRectangle({x:HAVS_LOGO_RIGHT_X, y:PAGE_H-72, width:HAVS_LOGO_SIZE, height:HAVS_LOGO_SIZE, color:WHITE});
      page.drawImage(logoImg, {x:HAVS_LOGO_RIGHT_X+(HAVS_LOGO_SIZE-w)/2, y:PAGE_H-72+(HAVS_LOGO_SIZE-h)/2, width:w, height:h});
    }
    page.drawText('HAVS EXPOSURE REPORT', {x:MARGIN, y:PAGE_H-34, size:9, font:bold, color:WHITE, opacity:0.85});
    page.drawText(op.name, {x:MARGIN, y:PAGE_H-54, size:16, font:bold, color:WHITE, maxWidth:PAGE_W-2*MARGIN-(logoImg?HAVS_LOGO_SIZE+8:0)});
    pdfDrawFit(page, siteName + ' · Week ' + weekLabel, {x:MARGIN, y:PAGE_H-70, size:9.5, font:reg, color:WHITE, opacity:0.9, maxWidth:PAGE_W-2*MARGIN-(logoImg?HAVS_LOGO_SIZE+8:0)});
  }
  function drawFooter(){
    page.drawLine({start:{x:MARGIN,y:34}, end:{x:PAGE_W-MARGIN,y:34}, thickness:0.75, color:LINE});
    page.drawText('Generated via OpHUB', {x:MARGIN, y:20, size:8, font:reg, color:SLATE});
    page.drawText('EAV (action) = 100 pts/day · ELV (limit) = 400 pts/day', {x:PAGE_W-MARGIN-220, y:20, size:8, font:reg, color:SLATE});
  }
  function drawTableHeader(){
    page.drawRectangle({x:MARGIN, y:y-HEADER_H, width:TABLE_W, height:HEADER_H, color:HEADBG});
    COLS.forEach((c,i)=>{
      const centered = i>=2;
      const tw = centered ? bold.widthOfTextAtSize(c[0], 7.5) : 0;
      const x = centered ? colX(i) + (COLS[i][1]-tw)/2 : colX(i)+6;
      page.drawText(c[0], {x, y:y-HEADER_H+6, size:7.5, font:bold, color:INK});
    });
    page.drawLine({start:{x:MARGIN,y:y-HEADER_H}, end:{x:MARGIN+TABLE_W,y:y-HEADER_H}, thickness:1, color:INK});
    y -= HEADER_H;
  }
  function newPage(){
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    drawHeaderBand();
    drawFooter();
    y = PAGE_H - 100;
    drawTableHeader();
  }
  function ensureRoom(h){ if(y - h < 60){ newPage(); } }
  function drawRow(cells, opts){
    opts = opts || {};
    const size = opts.size || 8.5;
    const font = opts.bold ? bold : reg;
    const wrapped = cells.map((txt,i)=>pdfWrapText(font, size, txt, COLS[i][1]-12));
    const nLines = Math.max(1, ...wrapped.map(w=>w.length));
    const rh = Math.max(ROW_H, nLines*LINE_H + 7);
    ensureRoom(rh);
    const top = y;
    if(opts.fill) page.drawRectangle({x:MARGIN, y:top-rh, width:TABLE_W, height:rh, color:opts.fill});
    wrapped.forEach((lines,i)=>{
      // Every column is centre-aligned except Day (0) and Tool (1), which
      // stay left-aligned since they carry the longer, wrapped text.
      const centered = i>=2;
      lines.forEach((ln,li)=>{
        const tw = centered ? font.widthOfTextAtSize(ln, size) : 0;
        const x = centered ? colX(i) + (COLS[i][1]-tw)/2 : colX(i)+6;
        page.drawText(ln, {x, y:top-12-li*LINE_H, size, font, color:opts.color||INK});
      });
    });
    page.drawLine({start:{x:MARGIN,y:top-rh}, end:{x:MARGIN+TABLE_W,y:top-rh}, thickness:0.5, color:LINE});
    y = top - rh;
  }

  newPage();
  let weeklyPoints = 0;
  for(let di=0; di<days.length; di++){
    const d = days[di];
    const dateStr = localISODate(d);
    const sessions = entries.filter(e=>e.user_id===op.id && e.entry_date===dateStr);
    const dayLabel = HAVS_DAY_LABELS[di] + ' ' + d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
    if(!sessions.length){
      drawRow([dayLabel, 'No tool use logged', '—', '—', '—', '—'], {color:SLATE});
      continue;
    }
    let dayPoints = 0;
    sessions.forEach((e,i)=>{
      const tool = toolById[e.tool_id];
      const mag = tool ? (Number(tool.vibration_magnitude) || 0) : 0;
      const a8 = havsA8(mag, e.minutes);
      const pts = havsPoints(mag, e.minutes);
      dayPoints += pts;
      drawRow([i===0?dayLabel:'', tool?titleCaseWords(tool.name):'(removed tool)', mag.toFixed(1), e.minutes, a8.toFixed(2), pts.toFixed(1)]);
    });
    weeklyPoints += dayPoints;
    const dayColor = dayPoints>=400 ? RED : dayPoints>=100 ? AMBER : GREEN;
    drawRow(['', '', '', '', 'Daily total:', dayPoints.toFixed(1)+' pts'], {bold:true, color:dayColor});
  }
  ensureRoom(ROW_H+6);
  y -= 6;
  page.drawLine({start:{x:MARGIN,y}, end:{x:MARGIN+TABLE_W,y}, thickness:1, color:INK});
  y -= 4;
  drawRow(['', '', '', '', 'Weekly Total:', weeklyPoints.toFixed(1)+' pts'], {bold:true});
  // Note is drawn at half the normal row text size, in italics, directly
  // under the weekly total.
  ensureRoom(12);
  page.drawText('(informational — limits are daily)', {x:colX(4)+6, y:y-6, size:4.25, font:italic, color:SLATE});
  y -= 12;
  if(weeklyPoints < 500){
    ensureRoom(20);
    const boxH = 18;
    page.drawRectangle({x:MARGIN, y:y-boxH, width:TABLE_W, height:boxH, color:PDFLib.rgb(0.91,0.97,0.93)});
    page.drawText('Exposure likely to be below 2.5m/s²A(8) EAV (100 points daily)', {x:MARGIN+8, y:y-boxH+6, size:8.5, font:bold, color:GREEN, maxWidth:TABLE_W-16});
    y -= boxH;
  }
}
/* HSE HAND-ARM VIBRATION CALCULATOR reference page — a single page,
   prepended to every export, that shows the government trigger-time
   calculation for each tool currently set up in Admin Centre → HAVS Tools.
   Derived straight from the HSE exposure-points formula so it always
   tallies with the same magnitudes used to score the log itself: points
   per hour = A(8)^2 x 100/6.25 at M=60 = 2 x magnitude^2, so trigger time
   to reach N points = N / (2 x magnitude^2) hours. */
async function drawHavsCalculatorPage(pdfDoc, fonts, tools, logoImg){
  const {bold, reg, italic, INK, SLATE, LINE, HEADBG, BRAND, WHITE} = fonts;
  // Widened slightly versus the other HAVS pages — the "(100pts)"/"(400pts)"
  // note text was pushing the Time to EAV/ELV columns too tight to fit.
  const PAGE_W = 660.28, PAGE_H = 841.89;
  const MARGIN = 44;
  const TABLE_W = PAGE_W - 2*MARGIN;
  const TIME_COL_W = (TABLE_W - 210 - 80 - 75) / 2;
  const COLS = [ // [label, width, note]
    ['Tool', 210, null], ['Mag (m/s²)', 80, null], ['Pts / hour', 75, null],
    ['Time to EAV', TIME_COL_W, '(100pts)'], ['Time to ELV', TIME_COL_W, '(400pts)']
  ];
  const ROW_H = 18, HEADER_H = 22, LINE_H = 10.5;
  function colX(i){ let x = MARGIN; for(let j=0;j<i;j++) x += COLS[j][1]; return x; }
  function fmtHrs(h){
    if(!isFinite(h) || h<=0) return '—';
    const totalMin = Math.round(h*60);
    const hh = Math.floor(totalMin/60), mm = totalMin%60;
    return (hh?hh+'h ':'') + mm+'m';
  }
  // Header cells are centred (except Tool) and, where a column has a note
  // (the "(100pts)"/"(400pts)" qualifiers), the note is drawn smaller and
  // in italics right after the main label — both centred as one unit.
  function drawHeaderCell(i, headerY){
    const [label, w, note] = COLS[i];
    const mainW = bold.widthOfTextAtSize(label, 7.5);
    const noteSize = 7.5*0.85;
    const noteW = note ? italic.widthOfTextAtSize(' '+note, noteSize) : 0;
    if(i===0){
      page.drawText(label, {x:colX(i)+6, y:headerY, size:7.5, font:bold, color:INK});
      return;
    }
    const x0 = colX(i) + (w-mainW-noteW)/2;
    page.drawText(label, {x:x0, y:headerY, size:7.5, font:bold, color:INK});
    if(note) page.drawText(' '+note, {x:x0+mainW, y:headerY, size:noteSize, font:italic, color:SLATE});
  }
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({x:0, y:PAGE_H-80, width:PAGE_W, height:80, color:BRAND});
  if(logoImg){
    const dim = logoImg.scale(1);
    const s = HAVS_LOGO_SIZE/Math.max(dim.width, dim.height);
    const w = dim.width*s, h = dim.height*s;
    page.drawRectangle({x:HAVS_LOGO_RIGHT_X, y:PAGE_H-72, width:HAVS_LOGO_SIZE, height:HAVS_LOGO_SIZE, color:WHITE});
    page.drawImage(logoImg, {x:HAVS_LOGO_RIGHT_X+(HAVS_LOGO_SIZE-w)/2, y:PAGE_H-72+(HAVS_LOGO_SIZE-h)/2, width:w, height:h});
  }
  page.drawText('HSE HAND-ARM VIBRATION CALCULATOR', {x:MARGIN, y:PAGE_H-34, size:9, font:bold, color:WHITE, opacity:0.85});
  page.drawText('Tool Exposure Reference', {x:MARGIN, y:PAGE_H-54, size:16, font:bold, color:WHITE});
  page.drawText('Trigger times to the Exposure Action Value (EAV) and Exposure Limit Value (ELV), per HSE methodology', {x:MARGIN, y:PAGE_H-70, size:8.5, font:reg, color:WHITE, opacity:0.9, maxWidth:PAGE_W-2*MARGIN-(logoImg?HAVS_LOGO_SIZE+8:0)});
  let y = PAGE_H - 100;
  page.drawRectangle({x:MARGIN, y:y-HEADER_H, width:TABLE_W, height:HEADER_H, color:HEADBG});
  COLS.forEach((c,i)=>drawHeaderCell(i, y-HEADER_H+7));
  page.drawLine({start:{x:MARGIN,y:y-HEADER_H}, end:{x:MARGIN+TABLE_W,y:y-HEADER_H}, thickness:1, color:INK});
  y -= HEADER_H;
  function ensureRoom(h){ if(y - h < 90){
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({x:0, y:PAGE_H-50, width:PAGE_W, height:50, color:BRAND});
    page.drawText('HSE HAND-ARM VIBRATION CALCULATOR (cont.)', {x:MARGIN, y:PAGE_H-30, size:11, font:bold, color:WHITE});
    y = PAGE_H - 70;
    page.drawRectangle({x:MARGIN, y:y-HEADER_H, width:TABLE_W, height:HEADER_H, color:HEADBG});
    COLS.forEach((c,i)=>drawHeaderCell(i, y-HEADER_H+7));
    page.drawLine({start:{x:MARGIN,y:y-HEADER_H}, end:{x:MARGIN+TABLE_W,y:y-HEADER_H}, thickness:1, color:INK});
    y -= HEADER_H;
  } }
  if(!tools.length){
    ensureRoom(ROW_H);
    page.drawText('No HAVS tools set up yet.', {x:MARGIN+6, y:y-13, size:9, font:reg, color:SLATE});
    y -= ROW_H;
  }
  // Every data column is centred except Tool, which stays left-aligned
  // since it carries the longer, wrapped tool name.
  function drawCentered(text, i, ty, size){
    const w = reg.widthOfTextAtSize(text, size);
    page.drawText(text, {x:colX(i)+(COLS[i][1]-w)/2, y:ty, size, font:reg, color:INK});
  }
  tools.forEach(t=>{
    const mag = Number(t.vibration_magnitude) || 0;
    const ptsPerHour = 2 * mag * mag;
    const eavHours = ptsPerHour>0 ? 100/ptsPerHour : Infinity;
    const elvHours = ptsPerHour>0 ? 400/ptsPerHour : Infinity;
    const nameLines = pdfWrapText(reg, 8.5, titleCaseWords(t.name), COLS[0][1]-12);
    const rh = Math.max(ROW_H, nameLines.length*LINE_H + 7);
    ensureRoom(rh);
    const top = y;
    nameLines.forEach((ln,li)=>page.drawText(ln, {x:colX(0)+6, y:top-12-li*LINE_H, size:8.5, font:reg, color:INK}));
    drawCentered(mag.toFixed(1), 1, top-12, 8.5);
    drawCentered(ptsPerHour.toFixed(1), 2, top-12, 8.5);
    drawCentered(fmtHrs(eavHours), 3, top-12, 8.5);
    drawCentered(fmtHrs(elvHours), 4, top-12, 8.5);
    page.drawLine({start:{x:MARGIN,y:top-rh}, end:{x:MARGIN+TABLE_W,y:top-rh}, thickness:0.5, color:LINE});
    y = top - rh;
  });
  ensureRoom(48);
  y -= 10;
  const note = 'Points/hour and trigger times are calculated from each tool\'s recorded vibration magnitude using the HSE exposure-points method: A(8) = magnitude x sqrt(minutes / 480); points = A(8)^2 x 100 / 6.25. Update a tool\'s magnitude in Admin Centre - HAVS Tools and this page updates to match.';
  page.drawText(note, {x:MARGIN, y, size:7.5, font:reg, color:SLATE, maxWidth:TABLE_W, lineHeight:10});
}
// Fetches the org logo once per export and embeds it into the given
// PDFDocument — every HAVS page header draws it top-right (per RTB's
// request; the app's other exports put it top-left).
// Picks the embed method by the file's actual magic bytes instead of
// guessing with embedJpg-then-embedPng try/catch — that order could hand a
// PNG's bytes to embedJpg, and on some malformed/interlaced PNGs pdf-lib's
// lenient JPEG parser doesn't always throw before producing a corrupted
// decode, which renders as a solid black square in the PDF (the "little
// black box" next to the logo). Sniffing the signature first means each
// file only ever goes through its own correct decoder.
async function pdfEmbedImageBytes(pdfDoc, bytes){
  if(!bytes || bytes.length<4) return null;
  const isPng = bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4E && bytes[3]===0x47;
  const isJpg = bytes[0]===0xFF && bytes[1]===0xD8;
  try{
    if(isPng) return await pdfDoc.embedPng(bytes);
    if(isJpg) return await pdfDoc.embedJpg(bytes);
    // Unknown signature (rare) — fall back to trying both.
    try{ return await pdfDoc.embedPng(bytes); }catch(e){ return await pdfDoc.embedJpg(bytes); }
  }catch(e){ return null; }
}
async function havsFetchLogoImg(pdfDoc){
  try{
    const logoUrl = ORG && ORG.logo_path ? publicUrl('org-logos', ORG.logo_path) : null;
    if(!logoUrl) return null;
    const bytes = await pdfFetchImageBytes(logoUrl);
    if(!bytes) return null;
    return await pdfEmbedImageBytes(pdfDoc, bytes);
  }catch(e){ return null; }
}
// Builds one HAVS PDF for an explicit week (days[0..4]) and operative list:
// Register page (matching the client's required Excel layout) first, then
// each operative's day-by-day detail pages, then the HSE calculator
// reference page last. Shared by every export/email path — current-week
// buttons pass havsWeekDates(havsWeekOffset); the Completed HAVS tab passes
// the stored week's dates instead so a past week can be re-exported exactly
// as it was.
async function buildHavsPdf(siteId, days, weekLabel, operatives, labelForFilename){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return null; }
  const site = SITES.find(s=>s.id===siteId);
  const dateFrom = localISODate(days[0]), dateTo = localISODate(days[4]);
  const [tools, entries] = await Promise.all([
    dbSelect('havs_tools', 'org_id=eq.'+ME.org_id+'&select=*'),
    dbSelect('havs_entries', `site_id=eq.${siteId}&entry_date=gte.${dateFrom}&entry_date=lte.${dateTo}&order=entry_date.asc`),
  ]);
  const toolById = {}; tools.forEach(t=>toolById[t.id]=t);
  const pdfDoc = await PDFLib.PDFDocument.create();
  const fonts = await havsPdfFonts(pdfDoc);
  const logoImg = await havsFetchLogoImg(pdfDoc);
  // Per-operative day-by-day pages first (the original report design),
  // HSE Tool Exposure Reference last — the register-grid page tried in an
  // earlier revision has been dropped per feedback.
  for(const op of operatives){
    await drawHavsOperativePages(pdfDoc, fonts, pdfSiteLabel(site), weekLabel, days, op, tools, toolById, entries, logoImg);
  }
  await drawHavsCalculatorPage(pdfDoc, fonts, tools, logoImg);
  const bytes = await pdfDoc.save();
  const filename = exportFilename(site.name, 'HAVS - '+labelForFilename+' - '+weekLabel, 'pdf');
  return {bytes, filename};
}
function havsBytesToBase64(bytes){
  let binary=''; const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk));
  return btoa(binary);
}
window.exportHavsIndividual = async function(siteId, userId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  try{
    await loadAllProfiles();
    const op = PROFILES[userId];
    if(!op){ toast('Could not find that operative.'); return; }
    const days = havsWeekDates(havsWeekOffset);
    const weekLabel = havsWeekLabelFor(days);
    const {bytes, filename} = await buildHavsPdf(siteId, days, weekLabel, [op], op.name);
    await deliverPdf(bytes, filename);
  }catch(err){
    console.error('HAVS individual export failed', err);
    toast('Export failed — '+(err && err.message ? err.message : 'unknown error'));
  }
};
// Shared by "Export All" and "Export Selected" — both build the same
// register + per-operative + calculator PDF, just with a different
// starting operative list and (for the Completed tab) an explicit past
// week instead of the current one.
async function havsExportOperativeSet(siteId, operatives, labelForFilename, daysOverride, weekLabelOverride){
  const days = daysOverride || havsWeekDates(havsWeekOffset);
  const weekLabel = weekLabelOverride || havsWeekLabelFor(days);
  const {bytes, filename} = await buildHavsPdf(siteId, days, weekLabel, operatives, labelForFilename);
  await deliverPdf(bytes, filename);
}
async function havsEmailOperativeSet(siteId, operatives, labelForFilename, daysOverride, weekLabelOverride){
  const site = SITES.find(s=>s.id===siteId);
  let ccClientEmail = null;
  if(site && site.client_email){
    const cc = await customConfirm('CC client contact'+((site.client_contact_name||site.client_name)?' ('+(site.client_contact_name||site.client_name)+')':'')+' on this email?', {confirmLabel:'Yes, CC them', cancelLabel:'No'});
    if(cc) ccClientEmail = site.client_email;
  }
  const days = daysOverride || havsWeekDates(havsWeekOffset);
  const weekLabel = weekLabelOverride || havsWeekLabelFor(days);
  const {bytes, filename} = await buildHavsPdf(siteId, days, weekLabel, operatives, labelForFilename);
  const content_base64 = havsBytesToBase64(bytes);
  const res = await sbFetch('/functions/v1/send-havs-email', {method:'POST', timeoutMs:60000, body: JSON.stringify({site_id:siteId, filename, content_base64, week_label:weekLabel, client_cc_email: ccClientEmail})});
  const d = await res.json();
  if(!res.ok || d.error){ toast('Email failed — '+(d.error||res.status)); return false; }
  toast('HAVS register emailed to '+ME.email);
  return true;
}
async function havsResolveAllOperatives(siteId){
  await loadAllProfiles();
  const canManage = isManager(ME);
  const assignedRows = canManage ? await dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : [];
  const operativeIds = canManage
    ? assignedRows.map(r=>r.user_id).filter(id => PROFILES[id] && PROFILES[id].role==='operative')
    : [ME.id];
  return operativeIds.map(id=>PROFILES[id]).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
}
window.exportHavsCollective = async function(siteId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  havsExportAllBusy = true; render();
  try{
    const operatives = await havsResolveAllOperatives(siteId);
    if(!operatives.length){ toast('No operatives to export.'); return; }
    await havsExportOperativeSet(siteId, operatives, 'All Operatives');
  }catch(err){
    console.error('HAVS collective export failed', err);
    toast('Export failed — '+(err && err.message ? err.message : 'unknown error'));
  }
  finally{ havsExportAllBusy = false; render(); }
};
window.emailHavsCollective = async function(siteId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  havsEmailAllBusy = true; render();
  try{
    const operatives = await havsResolveAllOperatives(siteId);
    if(!operatives.length){ toast('No operatives to email.'); return; }
    await havsEmailOperativeSet(siteId, operatives, 'All Operatives');
  }catch(err){
    console.error('HAVS collective email failed', err);
    toast('Email failed — '+(err && err.message ? err.message : 'unknown error'));
  }
  finally{ havsEmailAllBusy = false; render(); }
};
window.exportHavsSelected = async function(siteId){
  if(!(await loadLib('PDFLib'))){ toast('PDF library failed to load — check connection.'); return; }
  if(!havsExportSelectedIds.length){ toast('Tick at least one operative in Weekly Summary to export.'); return; }
  try{
    await loadAllProfiles();
    const operatives = havsExportSelectedIds.map(id=>PROFILES[id]).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
    if(!operatives.length){ toast('Could not find those operatives.'); return; }
    await havsExportOperativeSet(siteId, operatives, 'Selected Operatives');
  }catch(err){
    console.error('HAVS selected export failed', err);
    toast('Export failed — '+(err && err.message ? err.message : 'unknown error'));
  }
};
window.markHavsWeekComplete = async function(siteId, weekStart){
  havsMarkCompleteBusy = true; render();
  // Flush anything still sitting typed-but-uncommitted in a box before
  // locking the week — otherwise Save & Close could lock the register with
  // a value the user had just entered silently left out.
  await flushAllHavsDrafts(siteId);
  const row = await dbInsert('havs_weekly_completions', {org_id:ME.org_id, site_id:siteId, week_start:weekStart, completed_by:ME.id});
  if(row){
    // Just locks this week's inputs — stays on the same week (an explicit
    // "Move to next week" button handles moving on, so a PM can check the
    // locked week over before leaving it).
    toast('Week saved & closed — inputs locked');
  }
  havsMarkCompleteBusy = false; render();
};
window.moveToNextHavsWeek = function(){
  havsWeekOffset += 1;
  render();
};
window.reopenHavsWeek = async function(completionId){
  havsMarkCompleteBusy = true; render();
  const ok = await dbDelete('havs_weekly_completions', completionId);
  if(ok) toast('Week reopened');
  havsMarkCompleteBusy = false; render();
};
async function havsPdfFonts(pdfDoc){
  return {
    bold: await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold),
    reg: await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
    italic: await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaOblique),
    INK: PDFLib.rgb(0.06,0.06,0.07),
    SLATE: PDFLib.rgb(0.36,0.37,0.41),
    LINE: PDFLib.rgb(0.85,0.85,0.85),
    HEADBG: PDFLib.rgb(0.95,0.94,0.91),
    RED: PDFLib.rgb(0.757,0.231,0.231),
    AMBER: PDFLib.rgb(0.80,0.53,0.02),
    GREEN: PDFLib.rgb(0.122,0.573,0.322),
    BRAND: pdfHexToRgb((ORG && ORG.color_primary) || DEFAULT_BRAND1),
    WHITE: PDFLib.rgb(1,1,1),
  };
}
