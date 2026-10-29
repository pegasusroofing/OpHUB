// A person not on the app with one certificate, on the first job.
module.exports = function(db){
  const O=db.organizations[0].id, S1='11111111-1111-1111-1111-111111111111';
  db.certification_manual_people=[{id:'mp1',org_id:O,site_id:S1,name:'Sam Subbie',created_at:'2026-10-01T09:00:00Z'}];
  db.operative_certifications=(db.operative_certifications||[]).concat([{id:'mc1',org_id:O,manual_person_id:'mp1',category:'cscs_card',name:'cscs.pdf',storage_path:'o/manual/mp1/x.pdf',created_at:'2026-10-01T10:00:00Z'}]);
};
