/* ================= H&S POLICY (org-wide document everyone signs) =================
   Mirrors the RAMS read-and-sign pattern, but there is exactly one current
   document per company (not per site) — uploading a replacement supersedes
   the old one and, same as RAMS, requires everyone to sign the new version
   again. Reachable from every site's H&S file since it applies company-wide,
   and also gated compulsorily on sign-in (see checkHsPolicyGate/renderHsPolicyGate
   below) so nobody can use the app at all with an outstanding signature.
   One signature is valid for a full year and travels with the operative
   between jobs — it's org-wide, not per-site, exactly like PPE. It only
   needs signing again when: (a) a manager uploads a brand new version, or
   (b) the document's own expiry_date is reached, which the resign-check-daily
   cron advances automatically and notifies PMs/admins about ("Updated H&S
   Policy required"). Both cases work the same way under the hood — they
   push resign_cycle_start forward, which is what makes every existing
   signature before that point read as stale (hsPolicySigStillValid below),
   same mechanism as filterCurrentCycleSigs for RAMS/COSHH. */
let hsPolicyUploadOpen = false;
let hsPolicySupersededOpen = false;
function defaultHsPolicyExpiry(){
  const d = new Date(); d.setFullYear(d.getFullYear()+1);
  return localISODate(d);
}
function hsPolicySigStillValid(doc, sig){
  if(!doc || !sig) return false;
  const cycleStart = new Date(doc.resign_cycle_start || doc.uploaded_at);
  return new Date(sig.signed_at) >= cycleStart;
}
async function fetchHsPolicyData(){
  const [docs, superseded] = await Promise.all([
    dbSelect('hs_policy_docs', 'org_id=eq.'+ME.org_id+'&status=eq.current&order=uploaded_at.desc'),
    dbSelect('hs_policy_docs', 'org_id=eq.'+ME.org_id+'&status=eq.superseded&order=uploaded_at.desc'),
  ]);
  const doc = docs[0] || null;
  let sigs = [];
  if(doc) sigs = await dbSelect('hs_policy_signatures', 'policy_id=eq.'+doc.id+'&order=signed_at.asc');
  // hs_policy_docs has no "supersedes" column of its own (it's always a
  // single current slot, replaced wholesale) — only the old row's
  // superseded_by gets set when a new version is uploaded. So "what did the
  // current one replace" is found by looking the other way: whichever
  // superseded doc points its superseded_by at this current doc's id.
  const supersedesDoc = doc ? superseded.find(d=>d.superseded_by===doc.id) : null;
  return {doc, superseded, sigs, nameById: docNameLookup(docs, superseded), supersedesName: supersedesDoc ? supersedesDoc.name : null};
}
async function renderHsPolicy(siteId){
  const __gen = RENDER_GEN;
  const site = SITES.find(s=>s.id===siteId);
  const canManage = isManager(ME);
  await loadAllProfiles();
  const {doc, superseded, sigs, nameById, supersedesName} = await fetchHsPolicyData();
  // Signatures from before the current resign cycle count as expired — same
  // "stale on rollover" treatment RAMS/COSHH use, so an annual expiry (or a
  // brand new upload) genuinely requires everyone to sign again.
  const validSigs = doc ? sigs.filter(s=>hsPolicySigStillValid(doc, s)) : [];
  const signedIds = new Set(validSigs.map(s=>s.user_id));
  const iSigned = doc ? signedIds.has(ME.id) : false;
  const allPeople = Object.values(PROFILES);
  if(__gen === RENDER_GEN){ document.getElementById('app').innerHTML = shell(`
    ${doc ? `
      <div class="card">
        <div style="display:flex;justify-content:space-between;gap:8px;"><span style="font-weight:800;font-size:14px;">${escapeHtml(doc.name)}</span></div>
        <div class="meta">Uploaded ${new Date(doc.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})} by ${escapeHtml(nameOf(doc.uploaded_by))}${doc.expiry_date?' · Expires '+new Date(doc.expiry_date+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}):''}${supersedesName?' · Supersedes "'+escapeHtml(supersedesName)+'"':''}</div>
        <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', doc.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(doc.name)?doc.name:doc.name+'.pdf')}')">View document ↗</div>
        <div style="margin-top:12px;">
          ${iSigned ? `<p class="stub" style="color:var(--ok);margin:0;">✓ You signed this on ${new Date(validSigs.find(s=>s.user_id===ME.id).signed_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} — valid for one year, and travels with you to every site.</p>` : `<button class="darkbtn" onclick="signHsPolicy('${doc.id}')">I have read and understood this policy — Sign</button>`}
        </div>
      </div>
      ${canManage ? `
      <p class="ddrow" onclick="toggleHsPolicySignedList()"><span class="arrow">${hsPolicySignedListOpen?'▼':'▶'}</span> Signed (${signedIds.size} of ${allPeople.length})</p>
      ${hsPolicySignedListOpen ? `<div class="card">
        ${allPeople.map(p=>`
          <div class="sitecard" style="padding:8px 10px;">
            <div class="info"><div class="name">${escapeHtml(p.name)}</div></div>
            ${signedIds.has(p.id) ? `<span class="pill on">Signed</span>` : `<span class="pill off">Outstanding</span>`}
          </div>
        `).join('') || `<div class="empty" style="padding:10px;">No one on the team yet.</div>`}
      </div>` : ''}
      ` : ''}
    ` : `<div class="empty">No H&amp;S Policy document uploaded yet.${canManage?' Upload one from Settings &amp; Admin → Health &amp; Safety.':''}</div>`}

    ${canManage ? `<p class="stub" style="margin:10px 0 0;cursor:pointer;text-decoration:underline;" onclick="go('#/team?from='+encodeURIComponent('#/site/${siteId}/hs/rams'))">Upload / manage versions in Settings &amp; Admin</p>` : ''}
    ${superseded.length ? `
    <p class="ddrow" onclick="hsPolicySupersededOpen=!hsPolicySupersededOpen;render()"><span class="arrow">${hsPolicySupersededOpen?'▼':'▶'}</span> Superseded Versions (${superseded.length})</p>
    ${hsPolicySupersededOpen ? `<div class="card">${superseded.map(d=>`
      <div style="padding:8px 0;border-bottom:1px solid var(--line);">
        <div style="font-weight:700;font-size:12.5px;">${escapeHtml(d.name)}</div>
        <div class="meta">Uploaded ${new Date(d.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})} · superseded${d.superseded_by?' by "'+escapeHtml(nameById[d.superseded_by]||'a newer version')+'"':''}</div>
        <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', d.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(d.name)?d.name:d.name+'.pdf')}')">View document ↗</div>
      </div>
    `).join('')}</div>` : ''}
    ` : ''}
  `, {title:'H&S Policy', subtitle:fullSiteAddress(site), siteNameSubtitle:true, back:`#/site/${siteId}/hs`, siteId, activeTab:'more'}); }
}
let hsPolicySignedListOpen = false;
window.toggleHsPolicySignedList = function(){ hsPolicySignedListOpen = !hsPolicySignedListOpen; render(); };
window.addHsPolicy = async function(siteId){
  const name = document.getElementById('hsPolicyName').value.trim();
  const expiryInput = document.getElementById('hsPolicyExpiry');
  const expiryDate = expiryInput ? expiryInput.value : defaultHsPolicyExpiry();
  const fileInput = document.getElementById('hsPolicyFile');
  const file = fileInput.files && fileInput.files[0];
  if(!name || !file){ toast('Add a name and choose a PDF.'); return; }
  if(!expiryDate){ toast('Set an expiry date.'); return; }
  const path = ME.org_id+'/hs-policy/'+uid()+'-'+file.name.replace(/[^a-z0-9.\-]+/gi,'_');
  const stored = await uploadToStorage('rams-docs', path, file, 'application/pdf');
  if(!stored) return;
  const {doc: oldDoc} = await fetchHsPolicyData();
  const rows = await dbInsert('hs_policy_docs', {org_id:ME.org_id, name, storage_path:stored, expiry_date:expiryDate, uploaded_by:ME.id});
  if(rows){
    if(oldDoc) await dbUpdate('hs_policy_docs', oldDoc.id, {status:'superseded', superseded_by:rows[0].id});
    toast('H&S Policy uploaded — everyone will need to sign it');
    hsPolicyUploadOpen = false;
    hsPolicyGateChecked = false; // re-check the compulsory gate now a new version exists
    render();
  }
};
window.signHsPolicy = async function(policyId){
  if(!ME.signature_path){
    toast('Adopt your signature first — one tap and it\'s used everywhere.');
    go('#/signature');
    return;
  }
  const rows = await dbInsert('hs_policy_signatures', {policy_id:policyId, user_id:ME.id, signature_image_path:ME.signature_path});
  if(rows){
    toast('Signed — thank you');
    hsPolicyGatePending = false;
    render();
  }
};

/* ---- Compulsory sign-in gate: nobody (any role bar superadmin) can use the
   app with an outstanding H&S Policy signature. Checked once per app
   load/session (not on every single render — that would mean an extra DB
   round-trip on every navigation) and re-armed whenever something could
   have changed the answer (a fresh upload, or the operative just signed). */
let hsPolicyGateChecked = false;
let hsPolicyGatePending = false;
async function checkHsPolicyGate(){
  if(hsPolicyGateChecked) return hsPolicyGatePending;
  hsPolicyGateChecked = true;
  try{
    const {doc, sigs} = await fetchHsPolicyData();
    if(!doc){ hsPolicyGatePending = false; return false; }
    const mySig = sigs.find(s=>s.user_id===ME.id);
    hsPolicyGatePending = !hsPolicySigStillValid(doc, mySig);
  }catch(e){ hsPolicyGatePending = false; }
  return hsPolicyGatePending;
}
async function renderHsPolicyGate(){
  const __gen = RENDER_GEN;
  const {doc} = await fetchHsPolicyData();
  if(!doc){ hsPolicyGatePending = false; render(); return; } // shouldn't happen, but never trap someone with nothing to sign
  if(__gen !== RENDER_GEN) return;
  document.getElementById('app').innerHTML = `
    <div style="max-width:480px;margin:0 auto;padding:28px 20px 40px;">
      <div style="text-align:center;margin-bottom:18px;">
        <img src="${orgLogoUrl(ORG)}" onerror="this.onerror=null;this.src='${OPHUB_LOGO_INLINE}'" style="height:52px;object-fit:contain;">
      </div>
      <h2 style="text-align:center;margin:0 0 4px;">Health &amp; Safety Policy</h2>
      <p class="stub" style="text-align:center;margin:0 0 20px;">Before you can use OpHUB, please read and sign the current company H&amp;S Policy. This is a one-off for the year and travels with you to every site.</p>
      <div class="card">
        <div style="font-weight:800;font-size:14px;">${escapeHtml(doc.name)}</div>
        <div class="meta">Uploaded ${new Date(doc.uploaded_at).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})}${doc.expiry_date?' · Expires '+new Date(doc.expiry_date+'T00:00:00').toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}):''}</div>
        <div class="viewlink" style="cursor:pointer;" onclick="viewDrawing('${publicUrl('rams-docs', doc.storage_path)}', false, '${jsAttr(/\.pdf$/i.test(doc.name)?doc.name:doc.name+'.pdf')}')">View document ↗</div>
        <div style="margin-top:14px;">
          ${ME.signature_path ? `
            <button class="darkbtn" onclick="signHsPolicyGate('${doc.id}')">I have read and understood this policy — Sign</button>
          ` : `
            <p class="stub" style="color:var(--warn);margin:0 0 8px;">You haven't adopted a signature yet.</p>
            <button class="darkbtn" onclick="go('#/signature')">Adopt Your Signature</button>
          `}
        </div>
      </div>
      <p class="stub" style="text-align:center;margin-top:16px;">Signed in as ${escapeHtml(ME.name)} · <span style="text-decoration:underline;cursor:pointer;" onclick="doSignOut()">Sign out</span></p>
    </div>
  `;
}
window.signHsPolicyGate = async function(policyId){
  if(!ME.signature_path){ toast('Adopt your signature first.'); go('#/signature'); return; }
  const rows = await dbInsert('hs_policy_signatures', {policy_id:policyId, user_id:ME.id, signature_image_path:ME.signature_path});
  if(rows){
    toast('Signed — thank you');
    hsPolicyGatePending = false;
    go('#/sites');
  }
};
