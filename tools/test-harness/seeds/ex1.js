module.exports = function(db){
  const O=db.organizations[0].id, S1='11111111-1111-1111-1111-111111111111';
  db.fin_settings[0].ohp_pct=10;
  db.fin_variations=[{id:'fv1',org_id:O,site_id:S1,seq:1,number:'V01',title:'Extra flashing',status:'agreed',quoted:1200,agreed_value:1000},{id:'fv2',org_id:O,site_id:S1,seq:2,number:'V02',title:'Gutter swap',status:'submitted',quoted:2500}];
  db.fin_dayworks=[{id:'dw1',org_id:O,site_id:S1,seq:1,number:'DW01',title:'Storm repairs',status:'approved',value:640}];
  db.fin_contract_items=[{id:'h1',org_id:O,site_id:S1,position:0,kind:'section',description:'Main Roof',value:0},{id:'i1',org_id:O,site_id:S1,position:1,kind:'item',description:'Tiling',qty:300,unit:'m2',rate:120,value:36000,cost:24000},{id:'i2',org_id:O,site_id:S1,position:2,kind:'item',description:'Ridge',qty:60,unit:'m',rate:200,value:12000,cost:8000}];
  db.fin_job_costs.push({id:'c4',org_id:O,site_id:S1,category:'plant',cost_date:'2026-10-05',description:'Scaffold hire',net:1250},{id:'c5',org_id:O,site_id:S1,category:'overheads',cost_date:'2026-10-03',description:'Skip',net:320});
  db.fin_invoices.push({id:'v9',org_id:O,site_id:S1,number:'INV-0990',status:'void',issue_date:'2026-09-01',due_date:'2026-09-30',net:500,vat:0,total:500,paid:0,lines:[]},{id:'v8',org_id:O,site_id:S1,number:'INV-0980',status:'sent',issue_date:'2026-08-01',due_date:'2026-08-31',net:2000,vat:0,total:2000,paid:0,vat_treatment:'reverse_charge',lines:[]});
  const j=db.job_finance.find(x=>x.site_id===S1); j.pc_date='2026-10-10'; j.defects_months=12; j.retention_pct=5;
  db.fin_job_budgets=[{id:'b1',org_id:O,site_id:S1,category:'materials',budget:20000},{id:'b2',org_id:O,site_id:S1,category:'labour',budget:9000},{id:'b3',org_id:O,site_id:S1,category:'plant',budget:2500}];
};
