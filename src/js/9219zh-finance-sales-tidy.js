/* ============================================================
   OpHUB Finance — Sales tidy (24 Oct 2026, Andy, on the phone):
   - Retention: "1st Retention Release" / "Final Retention Release" dates can be typed straight
     into the list; they save to the project (job_finance.pc_date, and final_release_date).
   - Invoices and applications: compact rows on the phone.
   ============================================================ */
// The final release date can be set on its own; otherwise it's PC date + defects period.
(function(){
  const base = finRetentionDates;
  finRetentionDates = function(jf, st){
    const r = base.apply(this, arguments);
    if(jf && jf.final_release_date) return Object.assign({}, r, {second:jf.final_release_date});
    return r;
  };
})();
window.finRetSetDate = async function(siteId, n, v){
  const patch = n===1 ? {pc_date:v||null} : {final_release_date:v||null};
  // Keep the project's defects period in step, so Project Admin shows the same final date.
  if(n===2 && v){ const jf = (await dbSelect('job_finance', 'site_id=eq.'+siteId+'&select=pc_date').catch(()=>[]))[0]; if(jf && jf.pc_date){ const a = new Date(jf.pc_date+'T12:00:00'), b = new Date(v+'T12:00:00'); const m = Math.round((b-a)/(1000*3600*24*30.44)); if(m>=0 && m<=120) patch.defects_months = m; } }
  const res = await sbFetch('/rest/v1/job_finance?on_conflict=site_id', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates'}, body:JSON.stringify(Object.assign({site_id:siteId, org_id:ME.org_id, updated_at:new Date().toISOString(), updated_by:ME.id}, patch))});
  if(!res.ok){ toast('Not saved — '+(await safeErr(res))); return; }
  toast((n===1 ? 'Practical completion' : 'Final retention release')+' date saved to the project');
  render();
};
(function(){
  const st = document.createElement('style');
  st.textContent = `.finretd{height:32px !important;min-height:32px !important;padding:0 8px !important;font-size:13px !important;border-radius:8px !important;margin:0 !important;max-width:160px;}
@media (max-width:700px){
  #finSalesList tbody tr{display:flex !important;flex-wrap:wrap;column-gap:8px !important;row-gap:4px !important;padding:8px 10px !important;position:relative;}
  #finSalesList tbody td{flex:0 0 calc((100% - 16px) / 3) !important;display:block !important;text-align:left !important;font-size:12.5px !important;line-height:1.25;padding:2px 0 !important;min-width:0 !important;overflow:hidden;text-overflow:ellipsis;}
  #finSalesList tbody td::before{display:block !important;font-size:9.5px !important;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--slate);margin:0 0 1px !important;content:attr(data-l);}
  #finSalesList tbody td.d{flex:1 1 calc(100% - 40px) !important;font-size:14px !important;padding:0 0 4px !important;border-bottom:1px solid #eef0f3;}
  #finSalesList tbody td.d::before{content:none !important;}
  #finSalesList tbody td.finrowdots{position:absolute !important;top:6px;right:8px;flex:none !important;width:auto !important;padding:0 !important;}
  #finSalesList tbody td.finrowdots::before{content:none !important;}
  #finSalesList tbody td[data-l="Client"], #finSalesList tbody td[data-l="Project"]{flex-basis:calc((100% - 8px) / 2) !important;white-space:nowrap;}
  #finSalesList tbody td.num{font-weight:600;}
  #finSalesList tbody td, #finSalesList tbody td *{text-align:left !important;justify-content:flex-start !important;}
  #finSalesList tbody td[data-l*="Retention"]{flex-basis:calc((100% - 8px) / 2) !important;}
  #finSalesList tbody td.d[data-l="Project"]{flex-basis:calc(100% - 40px) !important;white-space:normal;}
  #finSalesList tbody td[data-l="Application"]:not(.d){font-weight:700;}
  #finSalesList tbody td[data-l="Gross"], #finSalesList tbody td[data-l="Applied"]{font-weight:800;}
  #finSalesList tbody td .finpill{font-size:10.5px;padding:1px 7px;}
  #finSalesList tbody td .ghostbtn, #finSalesList tbody td .linkbtn{padding:4px 8px !important;font-size:12px !important;margin:0 !important;width:auto !important;}
  #finSalesList tbody td .finretd{max-width:none;width:100%;}
  /* Purchase orders (Finance › Purchases and a project's Purchases tab): compact tiles, no Invoiced / Left to invoice, status beside the PO number */
  #finPurList tbody tr, #finPpBody tbody tr{display:flex !important;flex-wrap:wrap;align-items:center;column-gap:8px !important;row-gap:4px !important;padding:8px 10px !important;}
  #finPurList tbody td, #finPpBody tbody td{flex:0 0 calc((100% - 16px) / 3) !important;display:block !important;text-align:left !important;font-size:12.5px !important;line-height:1.25;padding:2px 0 !important;min-width:0 !important;overflow:hidden;text-overflow:ellipsis;}
  #finPurList tbody td *, #finPpBody tbody td *{text-align:left !important;justify-content:flex-start !important;}
  #finPurList tbody td::before, #finPpBody tbody td::before{display:block !important;font-size:9.5px !important;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--slate);margin:0 0 1px !important;content:attr(data-l);}
  #finPurList tbody td.d, #finPpBody tbody td.d{order:-2;flex:1 1 calc(100% - 100px) !important;width:auto !important;font-size:14px !important;padding:0 0 4px !important;}
  #finPurList tbody td.d::before, #finPpBody tbody td.d::before{content:none !important;}
  #finPurList tbody td[data-l="Status"], #finPpBody tbody td[data-l="Status"]{order:-1;flex:none !important;margin-left:auto !important;width:auto !important;max-width:none !important;padding:0 0 4px !important;}
  #finPurList tbody td[data-l="Status"]::before, #finPpBody tbody td[data-l="Status"]::before{content:none !important;}
  #finPurList tbody td[data-l="Status"] .finpill, #finPpBody tbody td[data-l="Status"] .finpill{font-size:10.5px !important;padding:1px 7px !important;}
  #finPurList tbody td[data-l="Supplier"], #finPurList tbody td[data-l="Project"]{flex-basis:calc((100% - 8px) / 2) !important;white-space:nowrap;}
  #finPurList tbody td.num, #finPpBody tbody td.num{font-weight:600;}
  #finPurList tbody td[data-l="Invoiced"], #finPurList tbody td[data-l="Left to invoice"], #finPurList tbody td[data-l="Left To Invoice"],
  #finPpBody tbody td[data-l="Invoiced"], #finPpBody tbody td[data-l="Left To Invoice"], #finPpBody tbody td[data-l="Left to invoice"]{display:none !important;}
  #finPurList tbody td.finrowdots, #finPpBody tbody td.finrowdots{flex:none !important;width:auto !important;order:-1;padding:0 0 4px !important;}
  #finPurList tbody td.finrowdots::before, #finPpBody tbody td.finrowdots::before{content:none !important;}
}`;
  document.head.appendChild(st);
})();
