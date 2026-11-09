// OpHUB offline demo (Andy, 9 Nov 2026): the new app with no internet. Every request meant for Supabase is answered
// here, in the browser, from a pretend company (demo-db.js) - nothing ever reaches the real database. Changes are kept
// on this device (localStorage), so the demo can be used like the real thing; add ?reset-demo to the address to start
// again. A browser port of tools/test-harness/harness.js (the fake database the screen tests use).
(function () {
  var KEY = 'ophub-offline-db';
  var real = window.fetch.bind(window);
  if (/[?&]reset-demo/.test(location.search)) { try { localStorage.removeItem(KEY); localStorage.removeItem('ophub-native-session'); } catch (e) { /* private mode */ } }
  var db;
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
  if (!db) db = JSON.parse(JSON.stringify(window.__OPHUB_DEMO_DB || {}));
  var saveT = null;
  function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* full: the change lasts until the page closes */ } }, 300); }
  window.__ophubOffline = { db: db, reset: function () { try { localStorage.removeItem(KEY); } catch (e) { /* */ } location.reload(); } };

  function parseVal(v) { if (v === 'null') return null; if (v === 'true') return true; if (v === 'false') return false; return v; }
  function esc(s) { return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'); }
  function match(row, k, expr) {
    var neg = false; if (expr.indexOf('not.') === 0) { neg = true; expr = expr.slice(4); }
    var i = expr.indexOf('.'); var op = expr.slice(0, i); var raw = expr.slice(i + 1); try { raw = decodeURIComponent(raw); } catch (e) { /* a literal % */ }
    var v = row[k]; var r;
    switch (op) {
      case 'eq': r = String(v) === raw; break;
      case 'neq': r = String(v) !== raw; break;
      case 'is': r = raw === 'null' ? v == null : v === parseVal(raw); break;
      case 'in': { var list = raw.replace(/^\(|\)$/g, '').split(',').map(function (s) { return s.replace(/^"|"$/g, ''); }); r = list.indexOf(String(v)) >= 0; break; }
      case 'gte': r = v != null && String(v) >= raw; break;
      case 'lte': r = v != null && String(v) <= raw; break;
      case 'gt': r = v != null && String(v) > raw; break;
      case 'lt': r = v != null && String(v) < raw; break;
      case 'like': case 'ilike': { var re = new RegExp('^' + esc(raw).replace(/\*/g, '.*').replace(/%/g, '.*') + '$', op === 'ilike' ? 'i' : ''); r = re.test(String(v || '')); break; }
      case 'cs': { if (raw.charAt(0) === '{') { var want = raw.replace(/^\{|\}$/g, '').split(',').filter(Boolean); r = Array.isArray(v) && want.every(function (x) { return v.map(String).indexOf(x) >= 0; }); } else r = true; break; }
      default: r = true;
    }
    return neg ? !r : r;
  }
  var SKIP = { select: 1, order: 1, limit: 1, offset: 1, on_conflict: 1, or: 1, and: 1, columns: 1 };
  function query(table, sp) {
    var rows = (db[table] = db[table] || []);
    var orq = sp.get('or');
    var orParts = orq ? (orq.replace(/^\(|\)$/g, '').match(/[^,{}]+(\{[^}]*\})?/g) || []).map(function (x) { var i = x.indexOf('.'); return [x.slice(0, i), x.slice(i + 1)]; }) : null;
    var pairs = []; sp.forEach(function (v, k) { pairs.push([k, v]); });
    var out = rows.filter(function (r) {
      if (orParts && !orParts.some(function (p) { return match(r, p[0], p[1]); })) return false;
      for (var j = 0; j < pairs.length; j++) { var k = pairs[j][0]; if (SKIP[k] || k.indexOf('.') >= 0) continue; if (!match(r, k, pairs[j][1])) return false; }
      return true;
    });
    var ord = sp.get('order');
    if (ord) { var o = ord.split(',')[0].split('.'), col = o[0], dir = o[1]; out = out.slice().sort(function (a, b) { var x = a[col], y = b[col]; if (x == y) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1); }); }
    var off = +(sp.get('offset') || 0); if (off) out = out.slice(off);
    var lim = sp.get('limit'); if (lim) out = out.slice(0, +lim);
    return out;
  }
  function b64url(s) { return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function token(sub) {
    var p = (db.profiles || []).filter(function (x) { return x.id === sub; })[0] || {};
    var exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;
    return { access_token: b64url('{"alg":"none"}') + '.' + b64url(JSON.stringify({ sub: sub, exp: exp, role: 'authenticated', email: p.email || '' })) + '.s', token_type: 'bearer', refresh_token: 'r.' + sub, expires_in: 3600 * 24 * 30, expires_at: exp, user: { id: sub, email: p.email || '', aud: 'authenticated', role: 'authenticated' } };
  }
  function json(o, st, hdr) { return new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, hdr || {}) }); }
  var idn = 0;
  function handle(u, method, headers, body) {
    var p = u.pathname, sp = u.searchParams, m = method.toUpperCase();
    // Sign-in: any password; the email picks who you are (e.g. j@x.co is Jake Morris, an operative). Unknown emails sign in as Andy Admin.
    if (p.indexOf('/auth/v1/token') === 0) {
      var b = {}; try { b = JSON.parse(body || '{}'); } catch (e) { /* */ }
      if (b.refresh_token) return json(token(String(b.refresh_token).replace(/^r\./, '') || 'me'));
      var em = String(b.email || '').toLowerCase().trim();
      var who = (db.profiles || []).filter(function (x) { return String(x.email || '').toLowerCase() === em; })[0];
      return json(token(who ? who.id : 'me'));
    }
    if (p.indexOf('/auth/v1/user') === 0) {
      var a = headers.get('authorization') || ''; var sub = 'me';
      try { sub = JSON.parse(atob(a.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || 'me'; } catch (e) { /* */ }
      return json(token(sub).user);
    }
    if (p.indexOf('/auth/v1/') === 0) return json({});
    if (p.indexOf('/storage/v1/object/sign/') === 0 && m === 'POST') {
      var sb = {}; try { sb = JSON.parse(body || '{}'); } catch (e) { /* */ }
      var bucket = p.split('/')[5];
      if (!sb.paths) return json({ signedURL: '/object/sign/' + p.split('/').slice(5).join('/') + '?token=T' });
      return json(sb.paths.map(function (x) { return { path: x, signedURL: '/object/sign/' + bucket + '/' + x + '?token=T' }; }));
    }
    if (p.indexOf('/storage/') === 0) {
      if (m === 'GET') return real(/\.pdf($|\?)/i.test(p) ? '/offline/sample.pdf' : '/offline/photo.jpg');
      return json({ Key: 'x', path: p.split('/').slice(5).join('/') });
    }
    if (p.indexOf('/functions/v1/') === 0) return json({ ok: true, offline: true });
    if (p.indexOf('/rest/v1/rpc/') === 0) { var fn = p.slice(13); return json(/check_device_lock|check_and_lock_device/.test(fn) ? { ok: true } : []); }
    if (p.indexOf('/rest/v1/') === 0) {
      var table = p.slice(9);
      var one = /vnd\.pgrst\.object/.test(headers.get('accept') || '');
      var countHdr = /count=/.test(headers.get('prefer') || '');
      var reply = function (rows, st) {
        var h = countHdr ? { 'Content-Range': '0-' + Math.max(0, rows.length - 1) + '/' + rows.length } : {};
        if (!one) return json(rows, st, h);
        return rows.length ? json(rows[0], st, h) : json({ code: 'PGRST116', message: 'no rows' }, 406);
      };
      if (m === 'GET' || m === 'HEAD') return reply(query(table, sp));
      var data = null; try { data = JSON.parse(body || 'null'); } catch (e) { /* */ }
      if (m === 'POST') {
        var merge = /merge-duplicates/.test(headers.get('prefer') || '');
        var keys = merge ? (sp.get('on_conflict') ? sp.get('on_conflict').split(',') : (table === 'job_finance' ? ['site_id'] : table === 'job_pack_settings' ? ['org_id'] : ['id'])) : null;
        var out = [];
        (Array.isArray(data) ? data : [data]).forEach(function (r0) {
          if (!r0) return;
          var ex = merge && keys.every(function (k) { return r0[k] != null; }) ? (db[table] || []).filter(function (x) { return keys.every(function (k) { return String(x[k]) === String(r0[k]); }); })[0] : null;
          if (ex) { Object.assign(ex, r0); out.push(ex); return; }
          var r = Object.assign({ id: 'off-' + table + '-' + Date.now() + '-' + (idn++), created_at: new Date().toISOString() }, /checkins$/.test(table) ? { ts: new Date().toISOString() } : {}, r0);
          (db[table] = db[table] || []).push(r); out.push(r);
        });
        save(); return reply(out, 201);
      }
      if (m === 'PATCH') { var hit = query(table, sp); hit.forEach(function (r) { Object.assign(r, data); }); save(); return reply(hit); }
      if (m === 'DELETE') { var gone = query(table, sp); db[table] = (db[table] || []).filter(function (r) { return gone.indexOf(r) < 0; }); save(); return json(gone); }
    }
    return json({});
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    if (!/supabase\.co/.test(url)) return real(input, init);
    // Never the real database: everything for Supabase is answered here.
    init = init || {};
    var headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
    var method = init.method || (typeof input !== 'string' && input.method) || 'GET';
    var body = init.body;
    var go = function (b) { try { return Promise.resolve(handle(new URL(url), method, headers, typeof b === 'string' ? b : null)); } catch (e) { return Promise.resolve(json({ message: String(e) }, 500)); } };
    if (body && typeof body !== 'string' && typeof body.text === 'function') return body.text().then(go, function () { return go(null); });
    return go(body);
  };
  // Some uploads use XMLHttpRequest: those to Supabase are answered as done, too.
  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__off = /supabase\.co/.test(String(u)); var a = Array.prototype.slice.call(arguments); if (this.__off) { a[0] = 'GET'; a[1] = '/offline/ok.json'; } return XO.apply(this, a); };
  XMLHttpRequest.prototype.send = function () { if (this.__off) return XS.call(this, null); return XS.apply(this, arguments); };
})();
