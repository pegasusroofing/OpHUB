/* ============================================================
   Map L22 / Proposal P06 (27 Oct 2026): site variations reach Finance at
   their value, not £0.

   A PM/admin types the variation's value on Projects › Variations (800,
   variations.cost_impact). Finance's copy of it (fin_variations.variation_id)
   gets that value as its quoted price, and as its agreed value when it's
   agreed — but only where Finance hasn't typed one (the field is empty).
   800 copies it straight away when the person saving is a Finance user;
   otherwise it is filled here, the next time Finance opens the job's
   Variations (BoQ › Variations) or makes a new application.
   Site variations not in the register yet are imported with the value by
   9219s finCtVariationsFill / 911 finVarFromSite, and an approved one added
   straight onto an application uses it too (902 newFinApplication).
   ============================================================ */
const FIN_VAR_SITE_SYNC_AT = {}; // siteId -> time of the last check (one check per 20 s per job)
async function finVarSiteValuesSync(siteId, force){
  if(!siteId || !(typeof isFinanceUser==='function' && isFinanceUser())) return 0;
  if(typeof isFinanceOnly==='function' && isFinanceOnly()) return 0; // no Projects side
  if(!force && FIN_VAR_SITE_SYNC_AT[siteId] && Date.now()-FIN_VAR_SITE_SYNC_AT[siteId] < 20000) return 0;
  FIN_VAR_SITE_SYNC_AT[siteId] = Date.now();
  const [fvs, svs] = await Promise.all([
    dbSelectNet('fin_variations', 'site_id=eq.'+siteId+'&variation_id=not.is.null&select=id,variation_id,status,quoted,agreed_value').catch(()=>[]),
    dbSelectNet('variations', 'site_id=eq.'+siteId+'&cost_impact=not.is.null&select=id,cost_impact').catch(()=>[]),
  ]);
  if(!Array.isArray(fvs) || !fvs.length || !Array.isArray(svs) || !svs.length) return 0;
  const val = {};
  svs.forEach(v=>{ const n = typeof varValueOf==='function' ? varValueOf(v) : finNum(v.cost_impact); if(n!=null && !isNaN(n)) val[v.id] = n; });
  let n = 0;
  for(const f of fvs){
    const v = val[f.variation_id]; if(v==null) continue;
    const patch = {};
    if(f.quoted==null) patch.quoted = v;                                     // never over a typed price
    if(f.status==='agreed' && f.agreed_value==null) patch.agreed_value = v;
    if(!Object.keys(patch).length) continue;
    try{
      const res = await sbFetch('/rest/v1/fin_variations?id=eq.'+f.id+'&variation_id=eq.'+f.variation_id, {method:'PATCH', headers:{'Prefer':'return=minimal'}, body:JSON.stringify(patch)});
      if(res && res.ok) n++;
    }catch(e){}
  }
  if(n){ try{ if(typeof FIN_VD_DATA!=='undefined' && FIN_VD_DATA) delete FIN_VD_DATA[siteId]; }catch(e){} }
  return n;
}
(function(){
  if(typeof finCtVariationsFill==='function'){
    const base = finCtVariationsFill;
    finCtVariationsFill = async function(siteId){
      try{ await finVarSiteValuesSync(siteId); }catch(e){ console.warn(e); }
      return base.apply(this, arguments);
    };
  }
  const app = window.newFinApplication;
  if(typeof app==='function'){
    window.newFinApplication = async function(siteId){
      try{ await finVarSiteValuesSync(siteId, true); }catch(e){ console.warn(e); }
      return app.apply(this, arguments);
    };
  }
})();
