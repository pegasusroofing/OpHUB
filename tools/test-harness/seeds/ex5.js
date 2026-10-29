// A multi-plot job: two plots, one cost on plot 1, one split 50/50.
module.exports = function(db){
  require('./ex1')(db);
  const O=db.organizations[0].id, S1='11111111-1111-1111-1111-111111111111';
  db.sites.find(s=>s.id===S1).multi_site = true;
  db.site_sub_addresses=[{id:'p1',site_id:S1,name:'Plot 1',address:'1 Studley Rd'},{id:'p2',site_id:S1,name:'Plot 2',address:'2 Studley Rd'}];
  db.fin_sub_values=[{site_id:S1,sub_job_id:'p1',value:20000}];
  db.fin_job_costs.find(c=>c.id==='c4').sub_job_id='p1';
  db.fin_job_costs.find(c=>c.id==='c5').split=[{site_id:S1,sub_job_id:'p1',pct:50,amount:160},{site_id:S1,sub_job_id:'p2',pct:50,amount:160}];
};
