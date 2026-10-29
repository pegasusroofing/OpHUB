// Application 2 (draft) after a certified application 1 that certified Tiling at 25%.
module.exports = function(db){
  require('./ex4')(db);
  const O=db.organizations[0].id, S1='11111111-1111-1111-1111-111111111111';
  db.fin_applications = db.fin_applications.filter(a=>a.id!=='a1');
  db.fin_applications.push({id:'ap1',org_id:O,site_id:S1,number:1,status:'certified',cert_net:8550,cert_retention:450,lines:[{kind:'item',item_id:'i1',pct:20,value:36000}],cert_lines:[{item_id:'i1',pct:25}],variations:[]});
};
