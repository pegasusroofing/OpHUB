/* ================= #(howto) Quick "how this works" tips =================
   2026-10-17 (Andy): a short step-by-step pop-up the first time someone opens
   each main page — different wording for PMs/admins and for operatives —
   with "Don't show this again". Dismissals are saved on the person's
   profile (profiles.howto_dismissed) so they follow them to any phone. */
const HOWTO = {
  home:{title:'Home', pm:['Your numbers are at the top — tap any of them to see more.','Live projects opens all your jobs.','The tiles take you to the calendar, deliveries, HUB, reports and admin.'], op:['Your jobs are listed here — tap one to open it.','Outstanding shows anything you still need to sign.','Check in when you arrive on site.']},
  sites:{title:'Projects', pm:['Use All / Live / Upcoming / Closed to filter your jobs.','Search by name, address or postcode.','+ New project adds a job.','Tap a job to open it.'], op:['Tap a job to open it.','Only jobs you are assigned to show here.']},
  site_home:{title:'The job', pm:['Each tile is one part of the job.','Check In / Out logs your time on site.','The ▾ on a tile lets you hide it from operatives.'], op:['Sign any RAMS, COSHH and toolbox talks first.','Check in when you arrive and check out when you leave.','Schedule of Works is where you update your tasks and add photos.']},
  schedule:{title:'Schedule of Works', pm:['+ Add Task adds a task — the ▾ beside it adds sections, library items or an upload.','Tap To Commence / In Progress / Complete to move a task on.','Photos operatives add show up in your HUB.','Export or email a progress report at the bottom.'], op:['Find your task and tap In Progress when you start.','Add photos as you go.','When it is finished tap Complete and add a completed photo.']},
  hs:{title:'Health & Safety', pm:['RAMS, COSHH and toolbox talks for this job.','A red badge means someone still has to sign.','Use the ▾ on a tile to hide it from operatives.'], op:['Open anything with a red badge and sign it.','Sign before you start work on site.']},
  rams:{title:'RAMS', pm:['Upload or build a RAMS — it is issued to the job straight away.','The pill shows how many operatives have signed.','The ▾ has export, email and delete.'], op:['Tap View to read it.','Tap to sign once you have read and understood it.']},
  coshh:{title:'COSHH', pm:['Add COSHH from the library, build one or upload a PDF.','The pill shows how many operatives have signed.','The ▾ has view, export, replace and delete.'], op:['Tap View to read it.','Tap to sign once you have read it.']},
  tbt:{title:'Toolbox Talks', pm:['Bank TBT: open a talk and tap Issue to this site.','Operatives sign it on their phones.','When everyone has signed it closes itself and is emailed to you.'], op:['Open the live talk and read it.','Tap to sign.']},
  materials:{title:'Materials', pm:['Raise and send material orders here.','Choose delivery or collection, and who is collecting.'], op:['Ask for the materials you need.','Tick items off when you collect them.']},
  checkin:{title:'Check in', pm:['Tap Check In when you arrive on site.','Tap Check Out when you leave.'], op:['Tap Check In when you arrive on site.','Tap Check Out when you leave.','Your location is saved with each one.']},
  messages:{title:'Messages', pm:['Messages for this job.','Type at the bottom to send to the team.'], op:['Messages for this job.','Type at the bottom to send.']},
  drawings:{title:'Drawings', pm:['Upload drawings into folders.','Tap a drawing to view it or mark it up.'], op:['Tap a drawing to view it.']},
  snagging:{title:'Snagging', pm:['Add a snag with a photo.','Mark it done when it is fixed.'], op:['Open a snag to see what needs fixing.','Add a photo when it is done.']},
  delivery:{title:'Delivery Schedule', pm:['Each day is split into drops — use ‹ › to change day.','+ Add Delivery books one; + on a drop books into that drop.','Press and hold a delivery to drag it to another drop.','Driver hours are at the bottom.']},
  calendar:{title:'Calendar', pm:['Every job’s key dates in one place.','Filter by PM or site, or switch on the driver diary.','Tap an item for the details.']},
  reports:{title:'Reports & surveys', pm:['Start a report and pick the job it is for.','Tick reports to export or email several together.']},
  hr:{title:'HR', pm:['Book time off from the holiday calendar.','Read and sign the company policies and handbook.']},
  hub:{title:'HUB', pm:['Everything that needs your attention.','Tap a row to go straight to it.']},
};
function howtoKeyForRoute(){
  const p = parseRoute();
  if(!p.length) return (usesPmHome(ME) || usesOpHome(ME)) ? 'home' : (isManager(ME) ? null : 'sites');
  if(p[0]==='site' && p[1]){
    const pg = p[2] || 'home';
    if(pg==='home') return 'site_home';
    if(pg==='hs') return p[3] && HOWTO[p[3]] ? (p[4] ? null : p[3]) : (p[3] ? null : 'hs');
    if(p[3]) return null;
    return HOWTO[pg] ? pg : null;
  }
  if(p.length===1 && HOWTO[p[0]]) return p[0];
  return null;
}
let howtoShownThisSession = new Set();
function howtoDismissed(){ return (ME && Array.isArray(ME.howto_dismissed)) ? ME.howto_dismissed : []; }
function maybeShowHowTo(){
  try{
    if(!ME || ME._support || ME.role==='client' || ME.role==='driver' || ME.role==='superadmin') return;
    if(howtoDismissed().includes('*')) return;
    const key = howtoKeyForRoute(); if(!key) return;
    const h = HOWTO[key]; const steps = h && (isManager(ME) ? h.pm : h.op); if(!steps || !steps.length) return;
    if(howtoShownThisSession.has(key) || howtoDismissed().includes(key)) return;
    if(document.querySelector('.geo-modal-overlay[style*="flex"]')) return; // another pop-up is up
    howtoShownThisSession.add(key);
    let el = document.getElementById('howtoSheet');
    if(!el){ el = document.createElement('div'); el.id = 'howtoSheet'; document.body.appendChild(el); }
    el.className = 'howto';
    el.innerHTML = `<div class="howto-card" role="dialog" aria-label="How this works">
      <div class="howto-h"><span>💡 ${escapeHtml(h.title)} — how it works</span><button type="button" class="howto-x" aria-label="Close" onclick="closeHowTo('${key}')">×</button></div>
      <ol>${steps.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ol>
      <div class="howto-f">
        <label><input type="checkbox" id="howtoNever"> Don't show this again</label>
        <button type="button" class="darkbtn" onclick="closeHowTo('${key}')">Got it</button>
      </div>
      <div class="howto-off"><span onclick="closeHowTo('*')">Turn off all tips</span></div>
    </div>`;
    el.style.display = 'flex';
  }catch(e){}
}
window.closeHowTo = async function(key){
  const el = document.getElementById('howtoSheet');
  const never = key==='*' || !!(document.getElementById('howtoNever') && document.getElementById('howtoNever').checked);
  if(el) el.style.display = 'none';
  if(!never || !ME) return;
  const next = Array.from(new Set(howtoDismissed().concat(key)));
  ME.howto_dismissed = next;
  try{ await sbFetch('/rest/v1/profiles?id=eq.'+ME.id, {method:'PATCH', headers:{'Prefer':'return=minimal'}, body: JSON.stringify({howto_dismissed: next})}); saveBootSnapshot(); }catch(e){}
  if(key==='*') toast('Tips turned off — turn them back on in Settings.');
};
window.resetHowTo = async function(){
  if(!ME) return;
  ME.howto_dismissed = []; howtoShownThisSession = new Set();
  try{ await sbFetch('/rest/v1/profiles?id=eq.'+ME.id, {method:'PATCH', headers:{'Prefer':'return=minimal'}, body: JSON.stringify({howto_dismissed: []})}); saveBootSnapshot(); }catch(e){}
  toast('Tips are back on');
};
window.addEventListener('hashchange', ()=>{ const el = document.getElementById('howtoSheet'); if(el) el.style.display = 'none'; });
