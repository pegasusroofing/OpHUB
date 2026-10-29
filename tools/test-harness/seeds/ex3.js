module.exports = function(db){
  require('./ex1')(db);
  const O=db.organizations[0].id, S1='11111111-1111-1111-1111-111111111111';
  db.variations=(db.variations||[]).concat([{id:'sv1',org_id:O,site_id:S1,description:'Replace rotten fascia (site)',cost_impact:'£850',approval_status:'approved',created_at:'2026-10-20T09:00:00Z'},{id:'sv2',org_id:O,site_id:S1,description:'Extra lead work',cost_impact:'',approval_status:'pending',created_at:'2026-10-21T09:00:00Z'}]);
};
