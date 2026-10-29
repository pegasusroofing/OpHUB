// An invoice the office has sent the PM to book, and a wage push on their job.
module.exports = function(db){
  const O=db.organizations[0].id, S1='11111111-1111-1111-1111-111111111111';
  db.sites.find(s=>s.id===S1).responsible_pm_id = 'me';
  db.fin_inbox=[{id:'fi1',org_id:O,assigned_pm:'me',status:'new',assigned_at:'2026-10-28T09:00:00Z',extracted:{supplier:'SIG Roofing',invoice_no:'SIG-1234',date:'2026-10-27',total:842.5},comments:[{name:'Sue (office)',text:'Is this Studley Rd?'}],file_path:'o/inbox/x.pdf',file_name:'x.pdf'}];
  db.wage_pushes=[{id:'wp1',org_id:O,site_id:S1,status:'pending',week_start:'2026-10-19',amount:1200}];
};
