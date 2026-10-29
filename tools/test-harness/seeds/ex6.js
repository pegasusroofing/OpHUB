// An unsigned company policy and the handbook, for the Home "Needs your signature" pop-up.
module.exports = function(db){
  const O=db.organizations[0].id;
  db.company_policies=[{id:'cp1',org_id:O,kind:'policy',title:'Drugs & alcohol',archived:false},{id:'cp2',org_id:O,kind:'handbook',title:'Handbook',archived:false}];
  db.company_policy_signatures=[];
};
