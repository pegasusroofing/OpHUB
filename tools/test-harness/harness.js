// Minimal OpHUB test harness: serves app.html and fakes Supabase in memory.
const {chromium} = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const APP = process.env.APP || require('path').join(__dirname, '..', '..', 'app.html');
const ORG = 'e56d69c8-0000-0000-0000-000000000001';
const S1 = '11111111-1111-1111-1111-111111111111', S2 = '22222222-2222-2222-2222-222222222222', S3='33333333-3333-3333-3333-333333333333';
// PRIVATE=1 (SEC-H3, 27 Oct): the 9 OpHUB file buckets act private - their
// public object URLs answer 400 (as Supabase does); the sign endpoint works.
if(process.env.PRIVATE === '1' && !global.__privateBuckets){
  global.__privateBuckets = ['mc-documents','signatures','site-photos','incident-photos','rams-docs','coshh-docs','coshh-library','drawings','operative-tools','finance-docs'];
  global.__publicHits = global.__publicHits || []; global.__signLog = global.__signLog || [];
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
function seed(role){
  const now = new Date().toISOString();
  const me = {id:'me', name: role==='pm'?'Paula PM':'Andy Admin', email:'a@x.co', role, org_id:ORG, phone:'07000 000000', created_at:now};
  return {
    organizations:[{id:ORG, name:'RTB Roofing Ltd', color_primary:'#E3262B', color_secondary:'#111111', logo_path:'logo.png', created_at:now}],
    profiles:[me,
      {id:'o1',name:'Jake Morris',role:'operative',org_id:ORG,email:'j@x.co'},
      {id:'o2',name:'Tom Hughes',role:'operative',org_id:ORG,email:'t@x.co'},
      {id:'d1',name:'Dave Driver',role:'driver',org_id:ORG,email:'d@x.co'}],
    sites:[
      {id:S1,name:'Studley Rd',address:'Studley Rd, London',postcode:'SW4 6RZ',status:'live',org_id:ORG,created_at:now,job_number:'J101'},
      {id:S2,name:'Cleveland Primary School',address:'Cleveland Rd, Ilford',postcode:'IG1 2EW',status:'live',org_id:ORG,created_at:now,job_number:'J102'},
      {id:S3,name:'Simon De Senlis',address:'Robert Street, Northampton NN1 3AE',postcode:'',status:'upcoming',org_id:ORG,created_at:now},
    ],
    site_assignments:[{id:'sa1',site_id:S1,user_id:'o1'},{id:'sa2',site_id:S2,user_id:'o2'}],
  };
}
function parseVal(v){ if(v==='null') return null; if(v==='true') return true; if(v==='false') return false; return v; }
function match(row, k, expr){
  let neg = false; if(expr.startsWith('not.')){ neg = true; expr = expr.slice(4); }
  const i = expr.indexOf('.'); const op = expr.slice(0,i); const raw = decodeURIComponent(expr.slice(i+1));
  const v = row[k]; let r;
  switch(op){
    case 'eq': r = String(v) === raw; break;
    case 'neq': r = String(v) !== raw; break;
    case 'is': r = raw==='null' ? v==null : v===parseVal(raw); break;
    case 'in': { const list = raw.replace(/^\(|\)$/g,'').split(',').map(s=>s.replace(/^"|"$/g,'')); r = list.includes(String(v)); break; }
    case 'gte': r = v!=null && String(v) >= raw; break;
    case 'lte': r = v!=null && String(v) <= raw; break;
    case 'gt': r = v!=null && String(v) > raw; break;
    case 'lt': r = v!=null && String(v) < raw; break;
    case 'like': case 'ilike': { const re = new RegExp('^'+raw.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/%/g,'.*')+'$', op==='ilike'?'i':''); r = re.test(String(v||'')); break; }
    case 'cs': { if(raw.startsWith('{')){ const want = raw.replace(/^\{|\}$/g,'').split(',').filter(Boolean); r = Array.isArray(v) && want.every(x=>v.map(String).includes(x)); } else r = true; break; }
    default: r = true;
  }
  return neg ? !r : r;
}
const SKIP = new Set(['select','order','limit','offset','on_conflict','or','and']);
function query(db, table, sp){
  let rows = (db[table] = db[table] || []);
  const orq = sp.get('or');
  const orParts = orq ? orq.replace(/^\(|\)$/g,'').match(/[^,{}]+(\{[^}]*\})?/g).map(x=>{ const i = x.indexOf('.'); return [x.slice(0,i), x.slice(i+1)]; }) : null;
  let out = rows.filter(r=>{ if(orParts && !orParts.some(([k,e])=>match(r,k,e))) return false; for(const [k,v] of sp){ if(SKIP.has(k) || k.includes('.')) continue; if(!match(r,k,v)) return false; } return true; });
  const ord = sp.get('order');
  if(ord){ const [col,dir] = ord.split(',')[0].split('.'); out = out.slice().sort((a,b)=>{ const x=a[col], y=b[col]; if(x==y) return 0; if(x==null) return 1; if(y==null) return -1; return (x<y?-1:1)*(dir==='desc'?-1:1); }); }
  const lim = sp.get('limit'); if(lim) out = out.slice(0, +lim);
  return out;
}
let idn = 0;
async function makeContext(browser, role, log, opts){
  opts = opts || {};
  const db = seed(role||'admin'); global.__db = db;
  const ctx = await browser.newContext(opts.shot ? {viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true} : (opts.viewport ? {viewport:opts.viewport} : {}));
  await ctx.route(/supabase\.co/, async route=>{
    if(opts.delay) await new Promise(r=>setTimeout(r, opts.delay));
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const m = req.method();
    const json = (o,s)=>route.fulfill({status:s||200, contentType:'application/json', body:JSON.stringify(o)});
    if(log) log.push(m+' '+p+u.search);
    if(p.startsWith('/auth/v1/token')) return json({access_token:'h.'+Buffer.from(JSON.stringify({sub:'me'})).toString('base64')+'.s', refresh_token:'r', expires_in:3600, user:{id:'me', email:'a@x.co'}});
    if(p.startsWith('/auth/v1/')) return json({});
    if(p.startsWith('/storage/v1/object/sign/') && m==='POST'){ let b={}; try{ b=JSON.parse(req.postData()||'{}'); }catch(e){} const bucket=p.split('/')[5]; if(global.__signLog) global.__signLog.push(bucket+':'+(b.paths||[]).length); return json((b.paths||[]).map(x=>({path:x, signedURL:'/object/sign/'+bucket+'/'+x+'?token=T'}))); }
    if(p.startsWith('/storage/v1/object/public/') && global.__privateBuckets && global.__privateBuckets.includes(p.split('/')[5])){ if(global.__publicHits) global.__publicHits.push(p); return route.fulfill({status:400, contentType:'application/json', body:'{"error":"not found"}'}); }
    if(p.startsWith('/storage/')){ if(m==='GET') return route.fulfill({status:200, contentType:'image/png', body:PNG}); return json({Key:'x'}); }
    if(p.startsWith('/functions/v1/')){ if(global.__fn){ let b={}; try{ b=JSON.parse(req.postData()||'{}'); }catch(e){} const r=global.__fn(p.slice(14), b); if(r) return json(r); } return json({ok:true}); }
    if(p.startsWith('/rest/v1/rpc/')) return json((p.endsWith('check_device_lock_v2')||p.endsWith('check_and_lock_device'))?{ok:true}:[]);
    if(p.startsWith('/rest/v1/')){
      const table = p.slice(9); const sp = u.searchParams;
      // .single() / .maybeSingle() ask for one object (Accept: vnd.pgrst.object): give the first row, or 406 when there is none.
      const one = /vnd.pgrst.object/.test(req.headers()['accept']||'');
      const reply = (rows, st) => !one ? json(rows, st) : rows.length ? json(rows[0], st) : route.fulfill({status:406, contentType:'application/json', body:JSON.stringify({code:'PGRST116', message:'no rows'})});
      if(m==='GET' || m==='HEAD') return reply(query(db, table, sp));
      let body = null; try{ body = JSON.parse(req.postData()||'null'); }catch(e){}
      if(m==='POST'){
        const merge = /merge-duplicates/.test(req.headers()['prefer']||'');
        const keys = merge ? (sp.get('on_conflict') ? sp.get('on_conflict').split(',') : (table==='job_finance' ? ['site_id'] : ['id'])) : null;
        const out = [];
        for(const r0 of (Array.isArray(body)?body:[body])){
          const ex = merge && keys.every(k=>r0[k]!=null) ? (db[table]||[]).find(x=>keys.every(k=>String(x[k])===String(r0[k]))) : null;
          if(ex){ Object.assign(ex, r0); out.push(ex); continue; }
          const r = Object.assign({id:'new-'+table+'-'+Date.now()+'-'+(idn++), created_at:new Date().toISOString()}, r0);
          (db[table] = db[table]||[]).push(r); out.push(r);
        }
        return reply(out, 201);
      }
      if(m==='PATCH'){ const hit = query(db, table, sp); hit.forEach(r=>Object.assign(r, body)); return reply(hit); }
      if(m==='DELETE'){ const hit = query(db, table, sp); db[table] = (db[table]||[]).filter(r=>!hit.includes(r)); return json(hit); }
    }
    return json({});
  });
  await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\//, route=>{
    const u = route.request().url(); const css = u.endsWith('.css');
    route.fulfill({status:200, contentType: css?'text/css':'application/javascript', body: fs.readFileSync(__dirname+'/node_modules/leaflet/dist/leaflet'+(css?'.css':'.js'))});
  });
  await ctx.route(/basemaps\.cartocdn\.com/, route=>route.fulfill({status:200, contentType:'image/png', body:PNG}));
  await ctx.route(/(unpkg\.com|cdn\.jsdelivr\.net)\/(npm\/)?maplibre-gl/, route=>{
    const u = route.request().url(); const css = u.endsWith('.css');
    route.fulfill({status:200, contentType: css?'text/css':'application/javascript', body: fs.readFileSync(__dirname+'/node_modules/maplibre-gl/dist/maplibre-gl'+(css?'.css':'.js'))});
  });
  await ctx.route(/tiles\.openfreemap\.org/, route=>route.fulfill({status:200, contentType:'application/json', body: JSON.stringify({version:8, sources:{}, layers:[{id:'bg', type:'background', paint:{'background-color':'#EEF1F4'}}]})}));
  if(opts.mockGeo){
    await ctx.route(/api\.postcodes\.io/, async route=>{
      const body = JSON.parse(route.request().postData()||'{}');
      const fake = {'SW4 6RZ':[51.4613,-0.1376],'IG1 2EW':[51.5590,0.0741],'NN1 3AE':[52.2440,-0.8930]};
      route.fulfill({status:200, contentType:'application/json', body: JSON.stringify({status:200, result:(body.postcodes||[]).map(q=>({query:q, result: fake[q.toUpperCase()] ? {postcode:q, latitude:fake[q.toUpperCase()][0], longitude:fake[q.toUpperCase()][1]} : null}))})});
    });
  }
  return {ctx, db};
}
function serve(){
  return new Promise(res=>{
    const srv = http.createServer((q,r)=>{
      const f = q.url.split('?')[0]==='/app.html' || q.url==='/' ? APP : null;
      if(!f){ r.writeHead(404); return r.end(); }
      r.writeHead(200, {'Content-Type':'text/html'}); r.end(fs.readFileSync(f));
    });
    srv.listen(0, ()=>res({srv, port: srv.address().port}));
  });
}
async function login(page, port){
  await page.goto('http://localhost:'+port+'/app.html'); await page.waitForSelector('#authEmail');
  await page.fill('#authEmail','a@x.co'); await page.fill('#authPassword','pw123456'); await page.click('button.primarybtn'); await page.waitForTimeout(2500);
}
module.exports = {chromium, makeContext, serve, login, S1, S2, S3, ORG};
