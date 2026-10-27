/* ================= OpHUB FINANCE — Phase F: invoice inbox =================
   Purchase invoices arrive two ways: dropped in here (upload, several at
   once), or forwarded from an email inbox to the finance-inbox function (see
   Finance settings for the address and key). Each PDF is read in the app:
   supplier, invoice number, date, net / VAT / total, and our PO number —
   which tells it the job. You check, change anything that's wrong, and file
   it; filing makes a purchase invoice on the job with the same checks as
   adding one by hand (over the PO, duplicate, not received). */

let finInboxTab = 'new';
/* ---------- FX-P1: claiming an inbox item to file it ----------
   The claim marks it "filed" before the purchase invoice is saved. If the save never finishes
   (signal drops, app closed) the item used to be left "filed" with no invoice and vanished.
   Now: such stuck items are listed as new again, and can be claimed again once 5 minutes have
   passed since the last claim (the claim time is kept in extracted.claimed_at — fin_inbox has
   no updated_at). The re-claim only goes through if nobody has claimed it since, so two people
   still can't file it twice. Proper fix: one RPC that claims, saves and links in one go. */
const FIN_INBOX_STUCK_MS = 5*60*1000;
const FIN_INBOX_OPEN_Q = 'or=(status.eq.new,and(status.eq.filed,purchase_invoice_id.is.null))';
function finInboxStuck(it){ return !!(it && it.status==='filed' && !it.purchase_invoice_id); }
function finInboxIsOpen(it){ return !!(it && (it.status==='new' || finInboxStuck(it))); }
// Stuck rows are shown (and handled) exactly like new ones.
function finInboxAsNew(rows){ return (rows||[]).map(r=>finInboxStuck(r) ? Object.assign({}, r, {status:'new', __stuck:true}) : r); }
function finInboxExNoClaim(ex){ if(!ex || typeof ex!=='object') return ex || null; const o = Object.assign({}, ex); delete o.claimed_at; return Object.keys(o).length ? o : null; }
// Returns {ok:true, revert:<patch to put it back>} or {ok:false, why:'offline'|'taken'|'busy'}.
async function finInboxClaim(it){
  const now = new Date().toISOString();
  const exNow = Object.assign({}, it.extracted||{}, {claimed_at:now});
  const revert = {status:'new', extracted:finInboxExNoClaim(it.extracted)};
  let r = await dbUpdate('fin_inbox', it.id+'&status=eq.new', {status:'filed', extracted:exNow});
  if(r===null) return {ok:false, why:'offline'};
  if(r) return {ok:true, revert};
  const cur = await dbSelectChecked('fin_inbox', 'id=eq.'+it.id+'&select=status,purchase_invoice_id,extracted,received_at');
  if(!cur.ok) return {ok:false, why:'offline'};
  const row = cur.data[0];
  if(!finInboxStuck(row)) return {ok:false, why:'taken'};
  const was = row.extracted && row.extracted.claimed_at;
  const since = was || row.received_at;
  if(since && Date.now() - new Date(since).getTime() < FIN_INBOX_STUCK_MS) return {ok:false, why:'busy'};
  const cond = '&status=eq.filed&purchase_invoice_id=is.null&extracted->>claimed_at='+(was ? 'eq.'+encodeURIComponent(was) : 'is.null');
  r = await dbUpdate('fin_inbox', it.id+cond, {status:'filed', extracted:Object.assign({}, row.extracted||{}, it.extracted||{}, {claimed_at:now})});
  if(r===null) return {ok:false, why:'offline'};
  return r ? {ok:true, revert} : {ok:false, why:'taken'};
}
// FX-P1 (27 Oct): file an inbox item in ONE database step (fin_inbox_file): the
// item is locked, the purchase invoice added and linked, and the item marked
// filed all together, so it can't be left "filed" with no invoice. pi = the
// purchase invoice fields. Returns {ok:true, pi}, {ok:false, why} (same "why"
// values as finInboxClaim, plus 'error' with a message), or {missing:true}
// when the function isn't on the server yet (then the old claim / insert path runs).
async function finInboxFileRpc(id, pi){
  let res;
  try{ res = await sbFetch('/rest/v1/rpc/fin_inbox_file', {method:'POST', body:JSON.stringify({p_id:id, p_pi:pi})}); }
  catch(e){ return {ok:false, why:'offline'}; }
  if(!res.ok){
    let code = '', msg = '';
    try{ const j = await res.json(); code = j.code || ''; msg = j.message || ''; }catch(e){}
    if(res.status===404 || code==='PGRST202' || code==='42883') return {missing:true};
    return {ok:false, why:'error', msg: msg || String(res.status)};
  }
  let d = null; try{ d = await res.json(); }catch(e){}
  if(d && d.ok && d.pi) return {ok:true, pi:d.pi};
  const why = d && d.why;
  return {ok:false, why: why==='busy' ? 'busy' : why==='taken' ? 'taken' : 'error',
    msg: why==='bad_site' ? 'that project isn’t one of yours' : why==='bad_po' ? 'that PO wasn’t found' : why==='bad_amount' ? 'check the amounts' : why==='not_allowed' ? 'you need Finance access to file invoices' : 'please try again'};
}
function finInboxClaimToast(c){
  if(c && c.why==='error'){ toast('Couldn’t file it — '+(c.msg||'please try again')+'. It’s still in the inbox.'); return; }
  toast(c.why==='offline' ? 'Couldn’t reach the server — it’s still in the inbox. Check your signal and try again.'
    : c.why==='busy' ? 'Someone started filing this a moment ago. If it’s still here in 5 minutes, file it again.'
    : 'This one has just been filed by someone else.');
}
const FIN_PO_RE = /\b([A-Z0-9]{1,12}-PO-\d{3,4})\b/i;
function finParseDate(s){
  if(!s) return null;
  let m = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(s);
  if(m){ let y = +m[3]; if(y < 100) y += 2000; const d = new Date(y, +m[2]-1, +m[1], 12); return isNaN(d) ? null : d.toISOString().slice(0,10); }
  m = /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})/i.exec(s);
  if(m){ const mi = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase()); const d = new Date(+m[3], mi, +m[1], 12); return d.toISOString().slice(0,10); }
  return null;
}
// Pull the useful fields out of an invoice's text. Rough by nature: you
// check them before filing.
function finReadInvoiceText(text, ctx){
  const t = String(text||'').replace(/\u00a0/g,' ');
  const flat = t.replace(/\s+/g,' ');
  const out = {};
  const amt = s=>Number(String(s).replace(/,/g,''));
  // our PO number → job
  const pm = FIN_PO_RE.exec(flat);
  if(pm){ out.po_number = pm[1].toUpperCase(); const po = (ctx.pos||[]).find(p=>p.number.toUpperCase()===out.po_number); if(po){ out.po_id = po.id; out.site_id = po.site_id; out.supplier = po.supplier_name; } }
  // supplier: a known supplier named in the text
  if(!out.supplier){ const s = (ctx.suppliers||[]).filter(s=>s.name && s.name.length>2).sort((a,b)=>b.name.length-a.name.length).find(s=>flat.toLowerCase().includes(s.name.toLowerCase())); if(s) out.supplier = s.name; }
  let m = /(?:invoice|inv)\s*(?:no\.?|number|num|#|ref(?:erence)?)\s*[:\-.]?\s*([A-Z0-9][A-Z0-9\-\/]{2,24})/i.exec(flat);
  if(m) out.invoice_no = m[1];
  m = /(?:invoice\s*date|tax\s*point|date\s*of\s*invoice|dated?)\s*[:\-.]?\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{2,4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?\s+[0-9]{4})/i.exec(flat);
  out.date = finParseDate(m ? m[1] : (/([0-9]{1,2}[\/.][0-9]{1,2}[\/.][0-9]{4})/.exec(flat)||[])[1]);
  const money = '£?\\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{2})|[0-9]+\\.[0-9]{2})';
  const last = re=>{ let r, v = null; const g = new RegExp(re, 'gi'); while((r = g.exec(flat))) v = amt(r[r.length-1]); return v; };
  out.total = last('(?:invoice\\s*total|total\\s*(?:due|payable|amount|inc\\.?\\s*vat|including\\s*vat)|amount\\s*(?:due|payable)|balance\\s*due|grand\\s*total)\\s*[:\\-]?\\s*(?:GBP)?\\s*'+money);
  out.vat = last('(?:total\\s*)?vat(?:\\s*(?:@|at)?\\s*20(?:\\.00)?\\s*%)?(?:\\s*amount)?\\s*[:\\-]?\\s*(?:GBP)?\\s*'+money);
  out.net = last('(?:net\\s*(?:total|amount|value)?|sub\\s*-?\\s*total|goods\\s*(?:total|value)?|total\\s*(?:ex|excl?\\.?|excluding)\\s*vat)\\s*[:\\-]?\\s*(?:GBP)?\\s*'+money);
  if(out.total==null && out.net!=null && out.vat!=null) out.total = finRound(out.net+out.vat);
  if(out.net==null && out.total!=null && out.vat!=null) out.net = finRound(out.total-out.vat);
  if(out.vat==null && out.net!=null && out.total!=null) out.vat = finRound(out.total-out.net);
  // no PO match: a job number or job name in the text
  if(!out.site_id){ const s = (ctx.sites||[]).find(s=>(s.job_number && s.job_number.length>=3 && new RegExp('\\b'+s.job_number.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(flat)) || (s.name && s.name.length>6 && flat.toLowerCase().includes(s.name.toLowerCase()))); if(s) out.site_id = s.id; }
  return out;
}
async function finPdfText(url){
  if(!(await loadLib('pdfjsLib'))) return '';
  const res = await fetch(url); if(!res.ok) return '';
  const pdf = await pdfjsLib.getDocument({data:new Uint8Array(await res.arrayBuffer())}).promise;
  let text = '';
  for(let p=1; p<=Math.min(pdf.numPages, 4); p++){
    const tc = await (await pdf.getPage(p)).getTextContent();
    const rows = {};
    tc.items.forEach(it=>{ const y = Math.round(it.transform[5]/3)*3; (rows[y] = rows[y]||[]).push({x:it.transform[4], s:it.str}); });
    text += Object.keys(rows).map(Number).sort((a,b)=>b-a).map(y=>rows[y].sort((a,b)=>a.x-b.x).map(t=>t.s).join(' ')).join('\n') + '\n';
  }
  return text;
}
// Read any new items that haven't been read yet (PDFs only; photos are typed in).
async function finInboxReadPending(items, ctx){
  let changed = false;
  for(const it of items){
    if(it.extracted || it.status!=='new' || it.__stuck) continue;
    let ex = {};
    if(/pdf/i.test(it.content_type||'') || /\.pdf$/i.test(it.file_name||'')){
      try{ const url = await resolveStorageUrl(publicUrl('finance-docs', it.file_path)); ex = finReadInvoiceText(await finPdfText(url), ctx); ex.read = true; }catch(e){ ex = {read:false}; }
    } else ex = {read:false, photo:true};
    const patch = {extracted:ex};
    if(ex.site_id) patch.site_id = ex.site_id;
    if(ex.po_id) patch.po_id = ex.po_id;
    await dbUpdate('fin_inbox', it.id+'&status=eq.new', patch); // FA-03: leave it alone if it's been filed meanwhile
    changed = true;
  }
  return changed;
}

async function renderFinInbox(){
  if(!finGuard()) return;
  const __gen = RENDER_GEN;
  const [items, pos, suppliers] = await Promise.all([
    dbSelect('fin_inbox', 'org_id=eq.'+ME.org_id+'&'+(finInboxTab==='new' ? FIN_INBOX_OPEN_Q : 'status=eq.'+finInboxTab)+'&order=received_at.desc&limit=100').then(r=>finInboxTab==='new' ? finInboxAsNew(r) : r),
    dbSelect('purchase_orders', 'org_id=eq.'+ME.org_id+'&status=neq.cancelled&select=id,number,site_id,supplier_name,value'),
    dbSelect('suppliers', 'select=id,name'),
  ]);
  if(__gen !== RENDER_GEN) return;
  const ctx = {pos, suppliers, sites:SITES};
  if(finInboxTab==='new' && items.some(i=>!i.extracted && !i.__stuck)){
    document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('purchases')}${finSubTabs('purchases','inbox')}<div class="empty">Reading ${items.filter(i=>!i.extracted).length} new invoice${items.filter(i=>!i.extracted).length===1?'':'s'}…</div>`, {title:'Invoice inbox', subtitle:'OpHUB Finance', back:'#/finance', tabs:false});
    if(await finInboxReadPending(items, ctx)) return render();
  }
  const counts = {new:'', filed:'', ignored:''};
  const chip = (k,l)=>`<button type="button" class="pmchip ${finInboxTab===k?'on':''}" onclick="finInboxTab='${k}';render()">${l}</button>`;
  const liveSites = SITES.slice().sort((a,b)=>String(b.job_number||'').localeCompare(String(a.job_number||''), undefined, {numeric:true}));
  document.getElementById('app').innerHTML = shell(`
    ${finSectionNav('purchases')}${finSubTabs('purchases','inbox')}
    <div class="card">
      <p class="sectiontitle" style="margin-top:0;">Add purchase invoices</p>
      <p class="stub" style="margin:0 0 10px;font-style:normal;">Drop in PDFs (or photos) of purchase invoices, as many as you like. The app reads each one and finds the project from our PO number. Invoices emailed to your inbox address land here too (see Finance settings).</p>
      <input type="file" id="finInboxUpload" multiple accept="application/pdf,image/*" onchange="finInboxUpload(this.files)">
    </div>
    <div class="pmchips" style="margin:0 0 10px;">${chip('new','To file')}${chip('filed','Filed')}${chip('ignored','Ignored')}</div>
    ${items.length ? items.map(it=>finInboxCardHtml(it, pos, liveSites)).join('') : `<div class="empty">${finInboxTab==='new' ? 'Nothing waiting. New invoices appear here.' : 'Nothing here.'}</div>`}
  `, {title:'Invoice inbox', subtitle:'OpHUB Finance · purchases', back:'#/finance/purchases', tabs:false});
}
function finInboxCardHtml(it, pos, sites){
  const ex = it.extracted || {};
  const done = it.status!=='new';
  const posFor = pos.filter(p=>p.site_id===it.site_id);
  const v = x=> x==null ? '' : escapeHtml(String(x));
  return `<div class="card fininbox" id="finInb-${it.id}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
      <div style="min-width:0;"><b>${escapeHtml(ex.supplier || it.from_email || 'Purchase invoice')}</b>
        <div class="stub" style="margin:2px 0 0;font-style:normal;">${it.source==='email' ? 'Emailed'+(it.from_email?' by '+escapeHtml(it.from_email):'') : 'Uploaded'} · ${finDate(String(it.received_at).slice(0,10))}${it.subject?' · '+escapeHtml(it.subject):''}</div></div>
      <button class="ghostbtn" style="width:auto;flex:none;padding:5px 10px;" onclick="openFinDoc('${jsAttr(it.file_path)}','${jsAttr(it.file_name||'')}')">View</button>
    </div>
    ${ex.read===false ? `<p class="stub" style="margin:6px 0 0;font-style:normal;color:var(--warn);">${ex.photo?'A photo can’t be read automatically — type the details in.':'This PDF has no readable text — type the details in.'}</p>` : (ex.po_number ? `<p class="stub" style="margin:6px 0 0;font-style:normal;color:var(--ok);">Found our PO ${escapeHtml(ex.po_number)}${ex.po_id?'':' (not recognised)'}</p>` : '')}
    ${done ? `<p class="stub" style="margin:8px 0 0;font-style:normal;">${it.status==='filed'?'Filed to '+escapeHtml(((SITES.find(s=>s.id===it.site_id)||{}).name)||'a project'):'Ignored'}${it.status==='ignored'?` · <button class="linkbtn" style="color:var(--blue);" onclick="finInboxSet('${it.id}','new')">put back</button>`:''}</p>` : `
    <div class="fingrid2" style="margin-top:8px;">
      <div class="formfield"><label class="field-label">Supplier</label><input type="text" data-k="supplier" value="${v(ex.supplier)}"></div>
      <div class="formfield"><label class="field-label">Invoice no.</label><input type="text" data-k="invoice_no" value="${v(ex.invoice_no)}"></div>
      <div class="formfield"><label class="field-label">Date</label><input type="date" data-k="date" value="${v(ex.date)}"></div>
      <div class="formfield"><label class="field-label">Net £</label><input type="text" inputmode="decimal" data-money data-k="net" value="${v(ex.net)}"></div>
      <div class="formfield"><label class="field-label">VAT £</label><input type="text" inputmode="decimal" data-money data-k="vat" value="${v(ex.vat)}"></div>
      <div class="formfield"><label class="field-label">Total £</label><input type="text" inputmode="decimal" data-money data-k="total" value="${v(ex.total)}"></div>
      <div class="formfield"><label class="field-label">Project</label><select data-k="site_id" onchange="finInboxPickJob('${it.id}', this.value)"><option value="">Choose the project…</option>${sites.map(s=>`<option value="${s.id}" ${it.site_id===s.id?'selected':''}>${escapeHtml((s.job_number?s.job_number+' · ':'')+s.name)}</option>`).join('')}</select></div>
      <div class="formfield"><label class="field-label">PO</label><select data-k="po_id"><option value="">No PO</option>${posFor.map(p=>`<option value="${p.id}" ${it.po_id===p.id?'selected':''}>${escapeHtml(p.number)} · ${escapeHtml(p.supplier_name||'')}</option>`).join('')}</select></div>
    </div>
    <div class="row-gap"><button class="darkbtn" style="flex:2;" onclick="finInboxFile('${it.id}')">File to project</button><button class="ghostbtn" style="flex:1;" onclick="finInboxSet('${it.id}','ignored')">Ignore</button></div>`}
  </div>`;
}
window.finInboxPickJob = async function(id, siteId){
  // Keep anything typed on the card (supplier, invoice no., amounts) — it's rebuilt from 'extracted'.
  const card = document.getElementById('finInb-'+id);
  const it = (await dbSelect('fin_inbox', 'id=eq.'+id+'&select=extracted'))[0] || {};
  const ex = Object.assign({}, it.extracted||{});
  if(card) card.querySelectorAll('[data-k]').forEach(el=>{ const k = el.dataset.k; if(k==='site_id' || k==='po_id') return; ex[k] = el.dataset.money!==undefined ? (finNum(el.value)) : el.value.trim(); });
  await dbUpdate('fin_inbox', id, {site_id:siteId||null, po_id:null, extracted:ex}); render();
};
window.finInboxSet = async function(id, status){ if(await dbUpdate('fin_inbox', id, {status})) render(); };
window.finInboxUpload = async function(files){
  files = Array.from(files||[]); if(!files.length) return;
  let n = 0;
  for(const f of files){
    if(f.size > 20*1024*1024){ toast(f.name+' is over 20 MB — skipped.'); continue; }
    const safe = f.name.replace(/[^a-z0-9.\-]+/gi,'_').slice(-80);
    const stored = await uploadToStorage('finance-docs', ME.org_id+'/inbox/'+uid()+'-'+safe, f, f.type||'application/octet-stream');
    if(!stored) continue;
    const r = await dbInsert('fin_inbox', {org_id:ME.org_id, source:'upload', status:'new', received_at:new Date().toISOString(), file_path:stored, file_name:f.name, content_type:f.type||null, created_by:ME.id});
    if(r) n++;
  }
  finInboxTab = 'new';
  toast(n+' invoice'+(n===1?'':'s')+' added — reading them now');
  render();
};
window.finInboxFile = async function(id){
  const card = document.getElementById('finInb-'+id); if(!card) return;
  const g = k=>{ const el = card.querySelector(`[data-k="${k}"]`); return el ? el.value.trim() : ''; };
  const it = (await dbSelect('fin_inbox', 'id=eq.'+id))[0]; if(!it) return;
  if(!finInboxIsOpen(it)){ toast('Already filed.'); render(); return; }
  const siteId = g('site_id'), poId = g('po_id'), supplier = g('supplier'), no = g('invoice_no');
  let net = finNum(g('net')), vat = finNum(g('vat')), total = finNum(g('total'));
  if(!siteId){ toast('Choose the project.'); return; }
  if(!supplier){ toast('Enter the supplier.'); return; }
  if((net===null || isNaN(net)) && total!==null && !isNaN(total)){ net = finRound(total/1.2); vat = finRound(total-net); }
  if(net===null || isNaN(net)){ toast('Enter the net amount (or the total).'); return; }
  if(vat===null || isNaN(vat)) vat = 0;
  if(total===null || isNaN(total)) total = finRound(net+vat);
  const flags = [];
  if(no){
    const dup = await dbSelect('purchase_invoices', 'invoice_no=eq.'+encodeURIComponent(no)+'&select=id,supplier_name');
    if(dup.some(d=>String(d.supplier_name||'').trim().toLowerCase()===supplier.toLowerCase())) flags.push('possible duplicate of an invoice already entered');
  }
  let po = null;
  if(poId){
    po = (await dbSelect('purchase_orders', 'id=eq.'+poId))[0];
    if(po){
      const others = await dbSelect('purchase_invoices', 'po_id=eq.'+poId+'&status=neq.rejected&select=net');
      const sofar = others.reduce((t,i)=>t+Number(i.net||0), 0) + net;
      if(po.value!=null && sofar > Number(po.value)+0.005) flags.push(finMoney(sofar-Number(po.value))+' over the PO value of '+finMoney(po.value));
      const mats = (po.material_ids||[]).length ? await dbSelect('materials', 'id=in.('+po.material_ids.join(',')+')&select=grn') : [];
      if(mats.length && !mats.some(m=>m.grn)) flags.push('nothing on this PO has been marked received yet');
    }
  } else flags.push('no PO');
  // FX-P1: one server step (claim + purchase invoice + link) when the database has it.
  const one = await finInboxFileRpc(id, {site_id:siteId, po_id:poId||null, supplier_name:supplier, invoice_no:no||null, invoice_date:g('date')||finToday(),
    net:finRound(net), vat:finRound(vat), total:finRound(total), status: flags.length ? 'query' : 'to_approve', query_note: flags.length ? flags.join('; ') : null});
  let pi;
  if(!one.missing){
    if(!one.ok){ finInboxClaimToast(one); if(one.why!=='offline') render(); return; }
    pi = [one.pi];
  } else {
  // FA-03: claim it first (only works while it's still "new"), so two people can't file it twice.
  const claim = await finInboxClaim(it);
  if(!claim.ok){ finInboxClaimToast(claim); if(claim.why!=='offline') render(); return; }
  pi = await dbInsert('purchase_invoices', {org_id:ME.org_id, site_id:siteId, po_id:poId||null, no_po:!poId, kind:'invoice', supplier_id:po?po.supplier_id:null, supplier_name:supplier,
    invoice_no:no||null, invoice_date:g('date')||finToday(), net:finRound(net), vat:finRound(vat), total:finRound(total), status: flags.length ? 'query' : 'to_approve', query_note: flags.length ? flags.join('; ') : null,
    file_path:it.file_path, file_name:it.file_name, created_by:ME.id});
  if(!pi || !pi[0]){ await dbUpdate('fin_inbox', id+'&purchase_invoice_id=is.null', claim.revert); return; } // didn't save — put it back
  await dbUpdate('fin_inbox', id, {status:'filed', site_id:siteId, po_id:poId||null, purchase_invoice_id:pi[0].id});
  }
  if(typeof finCheckInvoiceLines==='function') finCheckInvoiceLines(pi[0].id).then(r=>{ if(r && r.notes.length) toast(r.notes.length+' line difference'+(r.notes.length===1?'':'s')+' with the PO — see Purchases'); });
  toast(flags.length ? 'Filed and flagged: '+flags[0] : 'Filed — waiting for approval');
  render();
};
window.finInboxNewKey = async function(){
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
  const key = Array.from(bytes, b=>('0'+b.toString(16)).slice(-2)).join('');
  const res = await sbFetch('/rest/v1/fin_settings', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify({org_id:ME.org_id, inbox_key:key, updated_at:new Date().toISOString(), updated_by:ME.id})});
  if(!res.ok){ toast('Could not make a key — '+(await safeErr(res))); return; }
  toast('New inbox key made — update it in your email forwarding'); render();
};
function finInboxSettingsHtml(st){
  const url = SUPABASE_URL+'/functions/v1/finance-inbox?key='+(st.inbox_key||'<make a key first>');
  return `<div class="card">
    <p class="sectiontitle" style="margin-top:0;">Invoice inbox (email)</p>
    <p class="stub" style="margin:0 0 10px;font-style:normal;">Set up a shared mailbox such as invoices@ in Microsoft 365, and have its attachments sent to the address below — Power Automate (“When a new email arrives in a shared mailbox” → HTTP POST), Zapier or Make can all do this. Purchase invoices then appear in Finance › Purchases › Purchase invoices, already read. Keep this address private: anyone with it can add invoices to your inbox.</p>
    ${st.inbox_key ? `<div class="sublink" style="word-break:break-all;font-size:12px;">${escapeHtml(url)}</div>
      <p class="stub" style="margin:6px 0 0;font-style:normal;">Send JSON: <code>{"from": "...", "subject": "...", "attachments": [{"filename": "...", "content_type": "application/pdf", "content_base64": "..."}]}</code>. Power Automate’s own attachment format (Name, ContentType, ContentBytes) also works.</p>` : ''}
    <button class="ghostbtn" style="width:100%;margin-top:8px;" onclick="finInboxNewKey()">${st.inbox_key?'Make a new key (stops the old one)':'Make an inbox key'}</button>
  </div>`;
}
