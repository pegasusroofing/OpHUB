/* ================= MESSAGES ================= */
// One-way announcements: PMs/Admins post down to operatives (per-site or
// whole company); operative actions elsewhere (material requests, snag
// closures, variations) post automatically up to whichever PM owns the site.
// Notifications are a side effect of something the person just did (checking
// in, assigning a job…). If one can't be sent, that must never show up as a
// "Save failed" error over an action that actually worked — so these go in
// quietly and a failure is only written to the console.
async function quietMessageInsert(row){
  try{
    const res = await sbFetch('/rest/v1/messages', {method:'POST', headers:{'Prefer':'return=minimal'}, body: JSON.stringify(row)});
    if(!res.ok) console.warn('notification not sent:', await safeErr(res));
  }catch(e){ console.warn('notification not sent:', e && e.message); }
}
async function postSystemMessage(siteId, kind, body){
  // Best-effort — never blocks or errors out the action that triggered it.
  try{
    await quietMessageInsert({org_id: ME.org_id, site_id: siteId, sender_id: ME.id, audience:'managers', kind, body});
  }catch(e){ /* silent */ }
}
// Downward variant of the above — PM/admin action that needs to land in
// operatives' Inbox (e.g. a material pick-up assignment). Reaches every
// operative assigned to the site (audience='operatives'); the body should
// name who it's actually for. For a single named person, use
// postSystemMessageToUser below instead (audience='single').
async function postSystemMessageTo(siteId, kind, body){
  try{
    await quietMessageInsert({org_id: ME.org_id, site_id: siteId, sender_id: ME.id, audience:'operatives', kind, body});
  }catch(e){ /* silent */ }
}
// #notif-review-2026-09: "Operative signs in / checks in to a site" was
// previously a total gap — nobody was told at all. Only fires on the
// operative's own check-IN (not check-out, and not a PM/admin self
// check-in), and reaches the rest of the team assigned to that site —
// matches the "Assigned Operatives" recipient in the notifications review.
function notifyOperativeCheckin(siteId, type){
  if(type!=='in' || !ME || ME.role!=='operative') return;
  postSystemMessageTo(siteId, 'operative_checked_in', `${ME.name} checked in on site`);
}
// #notif-review-2026-09: "New RAMS/COSHH/Toolbox Talk published and needs
// signing" was previously a total gap — operatives only found out by
// opening the site themselves (or waiting for the later resign/TBT-overdue
// reminders). Fired the moment a document goes live/current, so the
// operatives assigned to the site know there's something new to sign.
function notifyDocNeedsSigning(siteId, docLabel, docName){
  postSystemMessageTo(siteId, 'doc_needs_signing', `New ${docLabel} published and needs signing: "${docName}"`);
}
// Targeted push to exactly one person — audience='single' + recipient_id,
// which send-message-push resolves to just that one person's devices
// instead of a whole role/site broadcast. relatedId (optional) rides along
// in the messages.related_id column purely so the push payload can carry a
// deep-link id (e.g. a delivery_tasks.id).
async function postSystemMessageToUser(userId, siteId, kind, body, relatedId){
  try{
    // relatedId goes in messages.related_id, NOT parent_id — parent_id is a
    // foreign key to another message, so putting a delivery id in it made
    // every one of these inserts fail and the notification never sent.
    await quietMessageInsert({org_id: ME.org_id, site_id: siteId||null, sender_id: ME.id, audience:'single', recipient_id:userId, kind, body, related_id: relatedId||null});
  }catch(e){ /* silent */ }
}
async function markMessagesRead(ids){
  if(!ids || !ids.length) return;
  try{
    const rows = ids.map(id=>({message_id:id, user_id:ME.id}));
    await sbFetch('/rest/v1/message_reads', {method:'POST', headers:{'Prefer':'resolution=ignore-duplicates,return=minimal'}, body: JSON.stringify(rows)});
  }catch(e){ /* silent */ }
}
let msgDraft = '';
// Manager view is now two tabs instead of two independently-collapsible
// dropdowns — defaults to "From Team" every time a different site is opened,
// but stays wherever the PM last left it while browsing the same site.
let msgActiveTab = 'fromTeam'; // 'fromTeam' | 'sent'
let msgLastSiteId = null;
let msgReplyOpenId = null; // message id whose inline reply box is showing
let msgReplyDraft = '';
let msgSelectedIds = new Set();
let msgReceiptsOpenId = null; // message id whose read-receipt breakdown is expanded (manager, "Sent to Operatives" tab)
window.toggleMsgReceipts = function(id){ msgReceiptsOpenId = msgReceiptsOpenId===id ? null : id; render(); };
async function renderMessages(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  if(!site){ go('#/sites'); return; }
  const mgr = isManager(ME);
  const __pProfiles = loadAllProfiles();
  const __pSiteAssign = mgr ? dbSelect('site_assignments', 'site_id=eq.'+siteId+'&select=user_id') : Promise.resolve([]);

  let broadcasts = [], fromTeam = [];
  if(mgr){
    [broadcasts, fromTeam] = await Promise.all([
      dbSelect('messages', `audience=eq.operatives&parent_id=is.null&or=(site_id.eq.${siteId},site_id.is.null)&order=created_at.desc&limit=50`),
      dbSelect('messages', `audience=eq.managers&parent_id=is.null&site_id=eq.${siteId}&order=created_at.desc&limit=50`),
    ]);
  } else {
    broadcasts = await dbSelect('messages', `audience=eq.operatives&parent_id=is.null&or=(site_id.eq.${siteId},site_id.is.null)&order=created_at.desc&limit=50`);
  }
  const __pAllReads = (mgr && broadcasts.length) ? dbSelect('message_reads', 'message_id=in.('+broadcasts.map(m=>m.id).join(',')+')&select=message_id,user_id,read_at') : Promise.resolve([]);
  await __pProfiles;
  const topLevel = [...broadcasts, ...fromTeam];
  let repliesByParent = {};
  // Captured BEFORE markMessagesRead runs, so a message that was unread when
  // this page loaded still highlights on this render — even though the DB
  // read record gets written a moment later (that's what clears the tab
  // badge/count). Next time the list is opened, it'll already be in
  // message_reads and won't highlight again — "stands out until you've
  // actually looked at the list, then stays normal."
  let unreadMsgIds = new Set();
  if(topLevel.length){
    const ids = topLevel.map(m=>m.id).join(',');
    const replies = await dbSelect('messages', `parent_id=in.(${ids})&order=created_at.asc`);
    replies.forEach(r=>{ (repliesByParent[r.parent_id]=repliesByParent[r.parent_id]||[]).push(r); });
    const allMsgs = [...topLevel, ...replies];
    const allIds = allMsgs.map(m=>m.id);
    const reads = await dbSelect('message_reads', `user_id=eq.${ME.id}&message_id=in.(${allIds.join(',')})&select=message_id`);
    const readSet = new Set(reads.map(r=>r.message_id));
    // Your own sends/raises never highlight as "unread" for you — you
    // already know about those. Anything authored by someone else still does.
    unreadMsgIds = new Set(allMsgs.filter(m=>m.sender_id!==ME.id && !readSet.has(m.id)).map(m=>m.id));
    markMessagesRead(allIds);
  }
  currentUnreadMsgs = 0; // just marked everything shown as read — clear the tab badge immediately
  unreadMsgsCache[siteId] = {count:0, at:Date.now()}; // keep the background badge refresh (see refreshUnreadBadge) from clobbering this with a stale pre-read count

  // Default back to the "From Team" tab every time a different site is
  // opened; otherwise leave the tab exactly where the PM last left it.
  if(msgLastSiteId !== siteId){
    msgLastSiteId = siteId;
    msgActiveTab = 'fromTeam';
  }
  const fromTeamUnreadCount = fromTeam.filter(m=>unreadMsgIds.has(m.id) || (repliesByParent[m.id]||[]).some(r=>unreadMsgIds.has(r.id))).length;
  const sentUnreadCount = broadcasts.filter(m=>unreadMsgIds.has(m.id) || (repliesByParent[m.id]||[]).some(r=>unreadMsgIds.has(r.id))).length;

  // Read receipts (manager view, "Sent to Operatives" tab only) — who among
  // the message's intended audience has actually opened it, and when. A
  // message with a site_id was sent to that site's assigned operatives; a
  // company-wide broadcast (site_id null) was sent to every operative.
  let receiptsByMsg = {};
  if(mgr && broadcasts.length){
    const siteAssignments = await __pSiteAssign;
    const siteOperativeIds = new Set(siteAssignments.map(a=>a.user_id));
    const allOperativeIds = Object.values(PROFILES).filter(p=>p.role==='operative').map(p=>p.id);
    const bIds = broadcasts.map(m=>m.id).join(',');
    const allReads = await __pAllReads;
    const readsByMsg = {};
    allReads.forEach(r=>{ (readsByMsg[r.message_id]=readsByMsg[r.message_id]||[]).push(r); });
    broadcasts.forEach(m=>{
      const roster = (m.site_id ? [...siteOperativeIds] : allOperativeIds).filter(uid=>PROFILES[uid] && PROFILES[uid].role==='operative');
      const reads = readsByMsg[m.id]||[];
      const readByIds = new Set(reads.map(r=>r.user_id));
      receiptsByMsg[m.id] = {
        read: reads.map(r=>({id:r.user_id, at:r.read_at})).sort((a,b)=>new Date(a.at)-new Date(b.at)),
        unread: roster.filter(uid=>!readByIds.has(uid)),
      };
    });
  }

  const kindLabel = {material_request:'Material request', snag_closed:'Snag closed', variation:'Variation raised', todo_assigned:'To Do assigned', price_overbooked:'Price overbooked', additional_works_requested:'Variation to price requested', schedule_flag:'Waste/leftover flag', material_pickup:'Material pickup assigned', message:null};
  // Tapping a message that's about a specific thing (a material request,
  // variation, or closed snag) jumps straight to that tab — same routing
  // table used for push-notification taps in registerPushNotifications().
  const kindRoute = {material_request:'materials', variation:'variations', snag_closed:'snagging/list', todo_assigned:'todos', price_overbooked:'price', additional_works_requested:'price', schedule_flag:'schedule', material_pickup:'materialrequired'};
  const msgRow = m => {
    const dest = m.site_id && kindRoute[m.kind] ? `#/site/${m.site_id}/${kindRoute[m.kind]}` : null;
    const replies = repliesByParent[m.id] || [];
    const replyAudience = m.audience==='operatives' ? 'managers' : 'operatives';
    const selected = msgSelectedIds.has(m.id);
    const isUnread = unreadMsgIds.has(m.id);
    return `
    <div class="card" style="padding:10px 12px;margin-bottom:8px;${dest?'cursor:pointer;':''}${isUnread?'border-left:4px solid var(--brand1);background:color-mix(in srgb, var(--brand1) 7%, var(--card));':''}" ${dest?`onclick="go('${dest}')"`:''}>
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
        <div style="display:flex;align-items:flex-start;gap:8px;flex:1;min-width:0;">
          ${mgr ? `<input type="checkbox" style="width:18px;height:18px;flex:0 0 18px;margin-top:1px;" ${selected?'checked':''} onclick="event.stopPropagation();toggleMsgSelect('${m.id}')">` : ''}
          <div style="min-width:0;">
            <div style="font-size:12px;color:var(--slate);margin-bottom:4px;">${isUnread?`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--brand1);margin-right:5px;"></span>`:''}${escapeHtml(nameOf(m.sender_id))} · ${new Date(m.created_at).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}${!m.site_id?' · All sites':''}${kindLabel[m.kind]?` · <span style="color:var(--blue);">${kindLabel[m.kind]}</span>`:''}</div>
            <div style="font-size:13.5px;${isUnread?'font-weight:700;':''}">${escapeHtml(m.body)}</div>
          </div>
        </div>
        ${mgr ? `<div class="taskicon danger" style="flex:0 0 auto;" onclick="event.stopPropagation();deleteMessage('${siteId}','${m.id}')">🗑</div>` : ''}
      </div>
      ${mgr && m.audience==='operatives' && receiptsByMsg[m.id] ? `
        <div class="stub" style="margin:8px 0 0;cursor:pointer;color:var(--blue);" onclick="event.stopPropagation();toggleMsgReceipts('${m.id}')">
          👁 ${receiptsByMsg[m.id].read.length} viewed${receiptsByMsg[m.id].unread.length?', '+receiptsByMsg[m.id].unread.length+' not yet':''} ${msgReceiptsOpenId===m.id?'▼':'▶'}
        </div>
        ${msgReceiptsOpenId===m.id ? `
          <div style="margin:6px 0 0 14px;padding-left:10px;border-left:2px solid var(--line);" onclick="event.stopPropagation();">
            ${receiptsByMsg[m.id].read.map(r=>`<div style="font-size:11.5px;color:var(--ok);margin-bottom:2px;">✓ ${escapeHtml(nameOf(r.id))} — ${new Date(r.at).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>`).join('')}
            ${receiptsByMsg[m.id].unread.map(uid=>`<div style="font-size:11.5px;color:var(--slate);margin-bottom:2px;">○ ${escapeHtml(nameOf(uid))} — not yet viewed</div>`).join('')}
            ${(!receiptsByMsg[m.id].read.length && !receiptsByMsg[m.id].unread.length) ? `<div class="stub" style="margin:0;">No operatives in this audience yet.</div>` : ''}
          </div>
        ` : ''}
      ` : ''}
      ${replies.length ? `
        <div style="margin:8px 0 0 14px;padding-left:10px;border-left:2px solid var(--line);">
          ${replies.map(r=>`
            <div style="margin-bottom:6px;">
              <div style="font-size:11.5px;color:var(--slate);">${escapeHtml(nameOf(r.sender_id))} · ${new Date(r.created_at).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
              <div style="font-size:13px;">${escapeHtml(r.body)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${msgReplyOpenId===m.id ? `
        <div style="margin-top:8px;" onclick="event.stopPropagation();">
          <textarea style="min-height:60px;" placeholder="Write a reply..." oninput="msgReplyDraft=this.value">${escapeHtml(msgReplyDraft)}</textarea>
          <div class="row-gap" style="margin-top:6px;">
            <button class="darkbtn" style="flex:1;" onclick="sendMessageReply('${siteId}','${m.id}','${replyAudience}','${m.site_id||siteId}')">Send Reply</button>
            <button class="ghostbtn" style="flex:1;" onclick="msgReplyOpenId=null;msgReplyDraft='';render()">Cancel</button>
          </div>
        </div>
      ` : `<div class="stub" style="margin:8px 0 0;color:var(--blue);cursor:pointer;" onclick="event.stopPropagation();msgReplyOpenId='${m.id}';msgReplyDraft='';render()">↩ Reply</div>`}
    </div>`;
  };

  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${mgr ? `
      <div class="card">
        <p class="sectiontitle" style="margin-top:0;">Send a message</p>
        <div class="formfield"><textarea id="msgBody" placeholder="Message to operatives..." oninput="msgDraft=this.value">${escapeHtml(msgDraft)}</textarea></div>
        <div class="formfield">
          <label class="field-label">Send to</label>
          <select id="msgTarget">
            <option value="site">This site's operatives</option>
            <option value="all">All operatives (whole company)</option>
          </select>
        </div>
        <button class="darkbtn" onclick="sendBroadcast('${siteId}')">Send</button>
      </div>

      ${msgSelectedIds.size ? `<button class="darkbtn" style="margin-top:14px;" onclick="deleteSelectedMessages('${siteId}')">Delete ${msgSelectedIds.size} Selected</button>` : ''}

      <div class="filterrow" style="margin-top:18px;">
        <div class="filterchip ${msgActiveTab==='fromTeam'?'active':''}" onclick="msgActiveTab='fromTeam';render()">From Team${fromTeamUnreadCount?' ('+fromTeamUnreadCount+')':''}</div>
        <div class="filterchip ${msgActiveTab==='sent'?'active':''}" onclick="msgActiveTab='sent';render()">Sent to Operatives${sentUnreadCount?' ('+sentUnreadCount+')':''}</div>
      </div>
      <div style="margin-top:10px;">
        ${msgActiveTab==='fromTeam'
          ? (fromTeam.map(msgRow).join('') || `<div class="empty">Nothing from the crew yet.</div>`)
          : (broadcasts.map(msgRow).join('') || `<div class="empty">No messages sent yet.</div>`)}
      </div>
    ` : `
      ${broadcasts.map(msgRow).join('') || `<div class="empty">No messages yet.</div>`}
    `}
  `, {title:'Inbox', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/home`, siteId, activeTab:'messages'}); }
}
// Cross-site Messages view for the operative home bar — renderMessages
// above is scoped to one site's thread; this pulls the "From Team"/broadcast
// messages across EVERY site the operative is assigned to (plus company-wide
// broadcasts) into one aggregated, most-recent-first list, tagged with which
// site each message belongs to. Tapping a row opens that site's own thread.
async function renderMyMessages(){
  const __gen = RENDER_GEN;
  const __pProfiles = loadAllProfiles();
  const mySiteIds = SITES.map(s=>s.id);
  const sitesCsv = mySiteIds.join(',');
  const rows = mySiteIds.length
    ? await dbSelect('messages', `audience=eq.operatives&parent_id=is.null&or=(site_id.in.(${sitesCsv}),site_id.is.null)&order=created_at.desc&limit=100`)
    : await dbSelect('messages', `audience=eq.operatives&parent_id=is.null&site_id=is.null&order=created_at.desc&limit=100`);
  await __pProfiles;
  let unreadMsgIds = new Set();
  if(rows.length){
    const ids = rows.map(m=>m.id);
    const reads = await dbSelect('message_reads', `user_id=eq.${ME.id}&message_id=in.(${ids.join(',')})&select=message_id`);
    const readSet = new Set(reads.map(r=>r.message_id));
    unreadMsgIds = new Set(rows.filter(m=>m.sender_id!==ME.id && !readSet.has(m.id)).map(m=>m.id));
    markMessagesRead(ids);
  }
  currentUnreadMsgs = 0;
  const siteName = id => id ? ((SITES.find(s=>s.id===id)||{}).name || 'a site') : 'All sites';
  const row = m => {
    const isUnread = unreadMsgIds.has(m.id);
    const dest = m.site_id ? `#/site/${m.site_id}/messages` : null;
    return `
    <div class="card" style="padding:10px 12px;margin-bottom:8px;${dest?'cursor:pointer;':''}${isUnread?'border-left:4px solid var(--brand1);background:color-mix(in srgb, var(--brand1) 7%, var(--card));':''}" ${dest?`onclick="go('${dest}')"`:''}>
      <div style="font-size:12px;color:var(--slate);margin-bottom:4px;">${isUnread?`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--brand1);margin-right:5px;"></span>`:''}${escapeHtml(nameOf(m.sender_id))} · ${new Date(m.created_at).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} · <span style="font-weight:600;">${escapeHtml(siteName(m.site_id))}</span></div>
      <div style="font-size:13.5px;${isUnread?'font-weight:700;':''}">${escapeHtml(m.body)}</div>
    </div>`;
  };
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    <p class="stub" style="margin:0 0 14px;">Messages and notifications from your team across all your assigned sites, most recent first.</p>
    ${rows.map(row).join('') || `<div class="empty">No messages yet.</div>`}
  `, {title:'Inbox', back:'#/sites', tabs:false}); }
}
window.toggleMsgSelect = function(id){
  if(msgSelectedIds.has(id)) msgSelectedIds.delete(id); else msgSelectedIds.add(id);
  render();
};
window.deleteSelectedMessages = async function(siteId){
  if(!msgSelectedIds.size) return;
  if(!await customConfirm(`Delete ${msgSelectedIds.size} message${msgSelectedIds.size===1?'':'s'}? This can't be undone.`)) return;
  const ids = Array.from(msgSelectedIds);
  const count = ids.length;
  const res = await sbFetch('/rest/v1/messages?id=in.('+ids.join(',')+')', {method:'DELETE'});
  if(res.ok){
    toast('Messages deleted');
    logSiteActivity(siteId, 'messages_deleted', `Deleted ${count} message${count>1?'s':''}`);
    msgSelectedIds = new Set();
    render();
  } else toast('Could not delete — '+(await safeErr(res)));
};
window.deleteMessage = async function(siteId, messageId){
  if(!await customConfirm('Delete this message? This can\'t be undone.')) return;
  const rows = await dbSelect('messages', 'id=eq.'+messageId+'&select=body');
  const body = rows[0] && rows[0].body;
  const ok = await dbDelete('messages', messageId);
  if(ok){ toast('Message deleted'); logSiteActivity(siteId, 'message_deleted', `Deleted message "${(body||'').slice(0,80)}"`); render(); }
};
window.sendBroadcast = async function(siteId){
  const bodyInput = document.getElementById('msgBody');
  const body = bodyInput.value.trim();
  const target = document.getElementById('msgTarget').value;
  if(!body){ toast('Write a message first.'); return; }
  const rows = await dbInsert('messages', {org_id: ME.org_id, site_id: target==='all' ? null : siteId, sender_id: ME.id, audience:'operatives', kind:'message', body});
  if(rows){
    msgDraft = '';
    toast(target==='all' ? "Sent to all operatives" : "Sent to this site's operatives");
    render();
  }
};
// Reply to a specific message — works both directions: an operative
// replying to a broadcast posts back to the managers' "From your team"
// list, and a manager replying to something from the crew posts back to
// operatives, all nested under the original message rather than starting a
// fresh top-level thread.
window.sendMessageReply = async function(siteId, parentId, audience, targetSiteId){
  const body = (msgReplyDraft||'').trim();
  if(!body){ toast('Write a reply first.'); return; }
  const rows = await dbInsert('messages', {org_id: ME.org_id, site_id: targetSiteId||siteId, sender_id: ME.id, audience, kind:'message', body, parent_id: parentId});
  if(rows){
    msgReplyOpenId = null; msgReplyDraft = '';
    toast('Reply sent');
    render();
  }
};
