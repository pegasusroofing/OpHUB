module.exports = function(db){
  require('./ex1.js')(db);
  const O=db.organizations[0].id, S1='11111111-1111-1111-1111-111111111111';
  db.schedule_tasks=[{id:'t1',site_id:S1,name:'Strip roof',title:'Strip roof',status:'done',percent_complete:100,position:0,created_at:'2026-10-01T09:00:00Z'},{id:'t2',site_id:S1,name:'Felt and batten',title:'Felt and batten',status:'progress',percent_complete:40,position:1,created_at:'2026-10-02T09:00:00Z'}];
  db.schedule_sections=[];db.schedule_photos=[];
  db.fin_applications.push({id:'a3',org_id:O,site_id:S1,number:3,status:'draft',valuation_date:'2026-10-25',gross:30000,net_due:8000,lines:[],variations:[],dayworks:[],retention_pct:5});
  db.yard_stock=[{id:'y1',org_id:O,item:'Slate 500x250',unit:'nr',qty:400,active:true,category:'Slates & tiles'}];
  db.yard_moves=[];
  const jf=db.job_finance.find(x=>x.site_id===S1); jf.app_reminder_day=25;
};
