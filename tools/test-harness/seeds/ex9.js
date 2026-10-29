// A subcontractor company on the first job with two schedule tasks of its own.
module.exports = function(db){
  const O=db.organizations[0].id, S1='11111111-1111-1111-1111-111111111111';
  db.sites.find(s=>s.id===S1).acting_as_main_contractor = true;
  db.subcontractor_companies=(db.subcontractor_companies||[]).concat([{id:'sc1',org_id:O,site_id:S1,name:'Lead Co',created_at:'2026-10-01T09:00:00Z'}]);
  db.schedule_tasks=(db.schedule_tasks||[]).concat([{id:'st1',site_id:S1,name:'Lead flashings to chimney',status:'todo',subcontractor_company_id:'sc1',position:1,created_at:'2026-10-01T09:00:00Z'},{id:'st2',site_id:S1,name:'Valley lead',status:'progress',percent_complete:40,subcontractor_company_id:'sc1',position:2,created_at:'2026-10-01T09:00:00Z'}]);
};
