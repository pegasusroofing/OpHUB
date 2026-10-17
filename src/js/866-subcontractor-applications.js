/* ================= #(sub-signup) Subcontractor sign-up form — applications =================
   2026-10-17 (Andy): a Google-Forms-style public form (subcontractor.html?org=…)
   subcontractors fill in themselves. Submissions land here for PMs/admins
   to review, approve or reject. */
let subAppTab = 'new';
function subSignupLink(){ return 'https://www.operativehub.co.uk/subcontractor.html?org='+ME.org_id; }
window.copySubSignupLink = async function(){
  try{ await navigator.clipboard.writeText(subSignupLink()); toast('Link copied — paste it into an email or text'); }
  catch(e){ customPrompt('Copy this link:', subSignupLink()); }
};
const SUBAPP_LABELS = {
  trading_name:'Trading name', company_type:'Business type', company_number:'Company number', vat_number:'VAT number', utr:'UTR', cis_status:'CIS status',
  address:'Address', postcode:'Postcode', contact_role:'Position', phone:'Phone', office_phone:'Office phone', website_url:'Website',
  trades:'Trades', other_trade:'Other trade', areas:'Areas covered', team_size:'Operatives available', own_access:'Own access equipment', plant:'Plant / equipment',
  pl_cover:'Public liability cover', pl_expiry:'PL expiry', el_cover:'Employers liability cover', el_expiry:'EL expiry', pi_cover:'Professional indemnity', car_cover:'Contract works cover',
  accreditations:'Accreditations', other_accreditation:'Other accreditation', hs_policy:'Written H&S policy', rams_ability:'Writes own RAMS', competent_person:'H&S competent person',
  riddor:'RIDDOR incidents (3 yrs)', riddor_detail:'RIDDOR detail', enforcement:'HSE notices (3 yrs)', enforcement_detail:'Notices detail',
  operatives:'Operatives', ref1:'Reference 1', ref2:'Reference 2', bank_note:'Payment terms', notes:'Anything else',
};
function subAppValue(v){
  if(Array.isArray(v)) return v.map(x=> (x && typeof x==='object') ? Object.values(x).filter(Boolean).join(' · ') : String(x)).join('\n');
  return String(v==null?'':v);
}
async function renderSubApplications(){
  const __gen = RENDER_GEN;
  const rows = await dbSelect('subcontractor_applications', 'org_id=eq.'+ME.org_id+'&order=created_at.desc&limit=300&select=id,company_name,contact_name,email,phone,status,created_at,data');
  if(__gen !== RENDER_GEN) return;
  const counts = {new:0, approved:0, rejected:0}; rows.forEach(r=>{ counts[r.status] = (counts[r.status]||0)+1; });
  const shown = rows.filter(r=>r.status===subAppTab);
  const chip = (k, l)=>`<button type="button" class="pmchip ${subAppTab===k?'on':''}" onclick="subAppTab='${k}';render()">${l} (${counts[k]||0})</button>`;
  document.getElementById('app').innerHTML = shell(`
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Your sign-up form</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">Send this link to any subcontractor. They fill in their company details, insurance, accreditations and operatives, upload their documents and sign — it lands here.</p>
      <div class="sublink">${escapeHtml(subSignupLink())}</div>
      <div class="row-gap" style="margin-top:10px;">
        <button class="darkbtn" style="flex:1;" onclick="copySubSignupLink()">📋 Copy link</button>
        <button class="ghostbtn" style="flex:1;" onclick="window.open('${subSignupLink()}','_blank')">👁 Open the form</button>
      </div>
    </div>
    <div class="pmchips" style="margin:4px 0 12px;">${chip('new','New')}${chip('approved','Approved')}${chip('rejected','Rejected')}</div>
    ${shown.length ? shown.map(r=>`
      <button type="button" class="pmrow pmrow-card" onclick="go('#/subapplications/${r.id}')">
        <span class="pmrow-txt"><span class="pmrow-t">${escapeHtml(r.company_name)}</span>
        <span class="pmrow-s">${escapeHtml(r.contact_name)} · ${escapeHtml(subAppValue((r.data||{}).trades)||'')} · ${new Date(r.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></span>
        ${ophIcon('chevron', 18, 2.2)}
      </button>`).join('') : `<div class="empty">${subAppTab==='new' ? 'No new applications.' : 'Nothing here yet.'}</div>`}
  `, {title:'Subcontractor sign-up', subtitle:'Applications', back:'#/team/people', tabs:false});
}
async function renderSubApplication(id){
  const __gen = RENDER_GEN;
  await loadAllProfiles();
  const r = (await dbSelect('subcontractor_applications', 'id=eq.'+id))[0];
  if(__gen !== RENDER_GEN) return;
  if(!r){ toast('That application has gone.'); go('#/subapplications'); return; }
  const d = r.data || {};
  const rows = Object.keys(SUBAPP_LABELS).filter(k=>d[k]!=null && subAppValue(d[k]).trim()!=='').map(k=>`<div class="subapp-r"><b>${escapeHtml(SUBAPP_LABELS[k])}</b><span>${escapeHtml(subAppValue(d[k])).replace(/\n/g,'<br>')}</span></div>`).join('');
  const st = {new:'New', approved:'Approved', rejected:'Rejected'}[r.status]||r.status;
  document.getElementById('app').innerHTML = shell(`
    <div class="card">
      <div style="display:flex;align-items:center;gap:8px;"><p class="sectiontitle" style="margin:0;flex:1;">${escapeHtml(r.company_name)}</p><span class="hspill ${r.status==='approved'?'ok':r.status==='rejected'?'':'warn'}">${st}</span></div>
      <p class="stub" style="margin:6px 0 0;font-style:normal;">${escapeHtml(r.contact_name)} · <a href="mailto:${escapeHtml(r.email)}">${escapeHtml(r.email)}</a>${r.phone?` · <a href="tel:${escapeHtml(r.phone)}">${escapeHtml(r.phone)}</a>`:''}</p>
      <p class="stub" style="margin:4px 0 0;">Sent ${new Date(r.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})} · signed by ${escapeHtml(r.signed_name||'')}</p>
      ${r.reviewed_at ? `<p class="stub" style="margin:4px 0 0;">${st} by ${escapeHtml(nameOf(r.reviewed_by)||'')} ${new Date(r.reviewed_at).toLocaleDateString('en-GB')}${r.review_note?' — '+escapeHtml(r.review_note):''}</p>` : ''}
    </div>
    <div class="card">${rows || '<div class="empty">No other details.</div>'}</div>
    <div class="card"><p class="sectiontitle" style="margin-top:0;">Documents (${(r.files||[]).length})</p>
      ${(r.files||[]).map(f=>`<div class="subapp-file" onclick="viewDrawing('${publicUrl('mc-documents', f.path)}', ${/\.(png|jpe?g|webp|gif)$/i.test(f.name||'')}, '${jsAttr(f.name||'Document')}')">📎 <b>${escapeHtml(f.label||'Document')}</b><span>${escapeHtml(f.name||'')}</span></div>`).join('') || '<div class="empty">None uploaded.</div>'}
    </div>
    <div class="row-gap">
      ${r.status!=='approved' ? `<button class="darkbtn" style="flex:1;" onclick="decideSubApp('${r.id}','approved')">✓ Approve</button>` : ''}
      ${r.status!=='rejected' ? `<button class="ghostbtn" style="flex:1;" onclick="decideSubApp('${r.id}','rejected')">Reject</button>` : ''}
    </div>
    ${isFullManager(ME) ? `<button class="ghostbtn" style="margin-top:10px;color:var(--warn);" onclick="deleteSubApp('${r.id}')">🗑 Delete application</button>` : ''}
  `, {title:r.company_name, subtitle:'Subcontractor application', back:'#/subapplications', tabs:false});
}
window.decideSubApp = async function(id, status){
  const note = await customPrompt(status==='approved' ? 'Approve — add a note (optional)' : 'Reject — reason (optional)', '');
  if(note===null) return;
  const row = await dbUpdate('subcontractor_applications', id, {status, reviewed_by:ME.id, reviewed_at:new Date().toISOString(), review_note: note.trim()||null});
  if(row){ toast(status==='approved'?'Approved':'Rejected'); subAppTab = status; render(); }
};
window.deleteSubApp = async function(id){
  if(!(await customConfirm('Delete this application? This can\'t be undone.'))) return;
  if(await dbDelete('subcontractor_applications', id)){ toast('Deleted'); go('#/subapplications'); }
};
