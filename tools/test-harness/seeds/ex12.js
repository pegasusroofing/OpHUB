// Application 2 plus site progress: the Ridge task on the Schedule of Works is 60% done.
module.exports = function(db){
  require('./ex11')(db);
  const S1='11111111-1111-1111-1111-111111111111';
  db.schedule_tasks=(db.schedule_tasks||[]).concat([{id:'stp',site_id:S1,name:'Ridge',status:'progress',percent_complete:60,contract_item_id:'i2',position:9,created_at:'2026-10-01T09:00:00Z'}]);
};
