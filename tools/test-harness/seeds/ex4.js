module.exports = function(db){
  require('./ex1')(db);
  const O=db.organizations[0].id, S1='11111111-1111-1111-1111-111111111111';
  db.fin_applications=(db.fin_applications||[]).concat([{id:'ap2',org_id:O,site_id:S1,number:2,status:'draft',valuation_date:'2026-10-25',retention_pct:5,discount_pct:0,previous:0,
    lines:[{kind:'section',item_id:'h1',description:'Main Roof'},{kind:'item',item_id:'i1',description:'Tiling',qty:300,unit:'m2',rate:120,value:36000,pct:50},{kind:'item',item_id:'i2',description:'Ridge',qty:60,unit:'m',rate:200,value:12000,pct:0}],
    variations:[{fin_variation_id:'fv1',description:'V01 Extra flashing',value:1000,pct:100}],dayworks:[{fin_daywork_id:'dw1',description:'DW01 Storm repairs',value:640}],updated_at:'2026-10-25T10:00:00Z'}]);
};
