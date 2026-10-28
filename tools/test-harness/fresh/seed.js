// Sample company data for the fresh-eyes test. Call seed(db) after makeContext.
const S1='11111111-1111-1111-1111-111111111111', S2='22222222-2222-2222-2222-222222222222';
module.exports = function seed(db){
  const O=db.organizations[0].id; db.organizations[0].has_finance=true; db.profiles[0].finance_enabled=true;
  db.sites.forEach((s,i)=>{ s.client_name=['Bellway Homes','Persimmon','Forma London'][i]; s.start_date=['2026-08-03','2026-09-14','2026-11-02'][i]; s.responsible_pm_id='me'; if(!s.job_number) s.job_number='J103'; });
  db.fin_settings=[{org_id:O, pay_weekday:5, pay_weeks_in_hand:1, company_name:'RTB Roofing Ltd'}];
  db.job_finance=[{site_id:S1, org_id:O, billing_type:'application', contract_value:48000, original_value:46000, vat_treatment:'reverse_charge', billing_name:'Bellway Homes', billing_email:'accounts@bellway.example'},{site_id:S2, org_id:O, billing_type:'invoice', contract_value:126500, vat_treatment:'standard', billing_name:'Persimmon', billing_email:'ap@persimmon.example'}];
  db.fin_applications=[{id:'a1', org_id:O, site_id:S1, number:2, status:'certified', valuation_date:'2026-10-15', gross:21500, net_due:9800, cert_date:'2026-10-18', cert_gross:21000, cert_retention:1050, cert_previous:10450, cert_discount:0, cert_net:9500, lines:[]}];
  db.fin_invoices=[{id:'v1', org_id:O, site_id:S1, number:'INV-1001', status:'sent', issue_date:'2026-10-01', due_date:'2026-10-31', net:15000, vat:0, total:15000, paid:0, vat_treatment:'reverse_charge', lines:[{description:'Application 1',amount:15000}]},{id:'v2', org_id:O, site_id:S2, number:'INV-1002', status:'paid', issue_date:'2026-09-01', due_date:'2026-09-30', net:42000, vat:8400, total:50400, paid:50400, lines:[]},{id:'v3', org_id:O, site_id:S2, number:'INV-1003', status:'sent', issue_date:'2026-09-15', due_date:'2026-10-10', net:12000, vat:2400, total:14400, paid:0, lines:[{description:'Roof works stage 2',amount:12000}]}];
  db.fin_job_costs=[{id:'c1', org_id:O, site_id:S1, category:'materials', cost_date:'2026-10-02', description:'Slates', net:9850}, {id:'c3', org_id:O, site_id:S2, category:'materials', cost_date:'2026-09-20', description:'Membrane', net:31200}];
  db.suppliers=(db.suppliers||[]).concat([{id:'sup1', org_id:O, name:'SIG Roofing', email:'orders@sig.example'},{id:'sup2', org_id:O, name:'Travis Perkins', email:'tp@tp.example'}]);
  db.purchase_orders=[{id:'po1', org_id:O, site_id:S1, number:'J101-PO-001', supplier_id:'sup1', supplier_name:'SIG Roofing', status:'open', value:1800, total:1800, items:[{description:'Batten 25x50',qty:100,unit:'m',rate:18}], created_at:'2026-10-05T09:00:00Z'}];
  db.purchase_invoices=[{id:'pi1', org_id:O, site_id:S1, po_id:'po1', supplier_id:'sup1', supplier_name:'SIG Roofing', invoice_no:'SIG-88231', invoice_date:'2026-10-12', due_date:'2026-11-12', net:1800, vat:360, total:2160, status:'to_approve', created_at:'2026-10-13T09:00:00Z'}];
  db.fin_labour_rates=[{id:'w1', org_id:O, name:'Dan Fixer', pay_type:'subcontractor', day_rate:200, cis_rate:20, active:true, bank_sort_code:'123456', bank_account_no:'12345678', bank_account_name:'D FIXER'},{id:'r1',org_id:O,user_id:'o1',day_rate:150,cis_rate:20,pay_type:'subcontractor'},{id:'r2',org_id:O,user_id:'o2',day_rate:120,pay_type:'paye'}];
  db.fin_labour_manual=[];
  db.profiles.push({id:'pm2', name:'Dave Price', role:'pm', org_id:O, email:'dave@rtb.example'});
  db.fin_inbox=[{id:'ib1', org_id:O, source:'email', from_email:'accounts@travisperkins.example', subject:'Invoice 7781', status:'new', stage:'query', received_at:'2026-10-19T08:00:00Z', file_path:O+'/inbox/tp-7781.pdf', file_name:'tp-7781.pdf', content_type:'application/pdf', extracted:{read:true, supplier:'Travis Perkins', invoice_no:'7781', date:'2026-10-17', net:200, vat:40, total:240}, query_reason:'Couldn’t find a PO, job number or site address on it', comments:[]},
    {id:'ib2', org_id:O, source:'email', from_email:'sales@jewson.example', subject:'Your invoice', status:'new', stage:'query', received_at:'2026-10-19T09:00:00Z', file_path:O+'/inbox/jewson.pdf', file_name:'jewson.pdf', content_type:'application/pdf', extracted:{read:true, supplier:'Jewson', invoice_no:'J-5521', date:'2026-10-18', net:500, vat:100, total:600}, query_reason:'More than one job matches — choose which', comments:[]}];
  db.fin_settings[0].xero_tenant_name='RTB Roofing Ltd'; db.fin_settings[0].xero_auto=false; db.fin_settings[0].default_due_days=30;
  db.checkins=[]; db.fin_sub_payments=[]; db.fin_subcontracts=[{id:'sc1', org_id:O, site_id:S1, seq:1, number:'SC-001', name:'Lead Co', description:'Leadwork', order_value:6000, retention_pct:5, cis_rate:20, status:'active'}]; db.fin_sub_apps=[];
  db.pricing_elements=[{id:'e1',site_id:S1,name:'Flat roof',sort_order:0,price_total:10000,closed:false}];
};
module.exports.S1=S1; module.exports.S2=S2;
// A PM (not a Finance user) with things waiting from the office.
module.exports.pm = function(db){
  const O=db.organizations[0].id; db.organizations[0].has_finance=true; db.profiles[0].role='pm'; db.profiles[0].finance_enabled=false;
  db.sites.forEach((s,i)=>{ s.client_name=['Bellway Homes','Persimmon','Forma London'][i]; s.responsible_pm_id='me'; if(!s.job_number) s.job_number='J103'; });
  db.sites[0].price_enabled=true; db.sites[1].price_enabled=false;
  db.site_assignments.push({id:'sax',site_id:S1,user_id:'me'},{id:'say',site_id:S2,user_id:'me'});
  db.pricing_elements=[{id:'e1',site_id:S1,name:'Flat roof',sort_order:0,price_total:10000,closed:false},{id:'e2',site_id:S1,name:'Pitched roof',sort_order:1,price_total:24000,closed:false}];
  db.price_weeks=[{id:'pw1',site_id:S1,element_id:'e1',week_number:1,amount:1200},{id:'pw2',site_id:S1,element_id:'e1',week_number:2,amount:1500}];
  db.fin_inbox=[{id:'ib2', org_id:O, source:'email', from_email:'sales@jewson.example', status:'new', stage:'with_pm', assigned_pm:'me', assigned_at:'2026-10-20T08:00:00Z', received_at:'2026-10-19T09:00:00Z', file_path:O+'/inbox/jewson.pdf', file_name:'jewson.pdf', content_type:'application/pdf', extracted:{supplier:'Jewson', invoice_no:'J-5521', date:'2026-10-18', total:600}, comments:[{name:'Andy Cramp', at:'2026-10-20T08:00:00Z', text:'Sent to you to book: Is this the school job?'}]}];
  db.wage_pushes=[{id:'wp1', org_id:O, site_id:S1, src_key:'pay|x|'+S1, person_name:'Dan Fixer', week_start:'2026-10-12', days:0, amount:400, description:'Invoice DF-17', status:'pending'}];
}; module.exports.S2=S2;
