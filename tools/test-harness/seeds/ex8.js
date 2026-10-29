// A current RAMS on the first job that the operative hasn't signed.
module.exports = function(db){
  const O=db.organizations[0].id, S1='11111111-1111-1111-1111-111111111111';
  db.rams_docs=(db.rams_docs||[]).concat([{id:'rd1',org_id:O,site_id:S1,name:'Roof RAMS',status:'current',uploaded_at:'2026-10-01T09:00:00Z',subcontractor_company_id:null}]);
  db.rams_signatures=(db.rams_signatures||[]).filter(s=>s.rams_id!=='rd1');
  if(!(db.site_assignments||[]).some(a=>a.site_id===S1&&a.user_id==='me')) (db.site_assignments=db.site_assignments||[]).push({id:'sa-me',site_id:S1,user_id:'me'});
};
