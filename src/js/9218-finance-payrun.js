/* ============================================================
   OpHUB Finance — weekly pay run (subcontract labour, a week in hand).
   #/finance/labour/payrun
   Pay day (Finance › Settings: weekday + weeks in hand, default Friday,
   one week in hand) pays for the week worked before it: e.g. Friday
   23 Oct pays Mon 12 – Sun 18 Oct. Everyone with sign-ins or timesheets
   that week is listed with gross, CIS and the amount to transfer.
   1. Approve payments  2. Bank file (CSV for a bulk bank transfer)
   3. Mark paid (paid on the pay day — feeds CIS, statements and Xero).
   PAYE staff are listed for information only — they're paid by payroll.
   ============================================================ */
let finRunDay = null;
const FIN_WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function finPayCfg(){ const s = finSettings(); return {wd: s.pay_weekday!=null ? Number(s.pay_weekday) : 5, wih: s.pay_weeks_in_hand!=null ? Number(s.pay_weeks_in_hand) : 1}; }
function finNextPayDay(){ const {wd} = finPayCfg(); const d = new Date(finToday()+'T12:00:00'); while(d.getDay()!==wd) d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }
function finRunWeek(payDay){ return finAddDays(finMonday(payDay), -7*finPayCfg().wih); }
function finSortCode(s){ const d = String(s||'').replace(/\D/g,''); return d.length===6 ? d.slice(0,2)+'-'+d.slice(2,4)+'-'+d.slice(4) : String(s||''); }
function finBankOk(r){ return !!(r && String(r.bank_sort_code||'').replace(/\D/g,'').length===6 && /^\d{8}$/.test(String(r.bank_account_no||'').replace(/\D/g,''))); }

// Lines for one person's week (sign-in days at their rate + timesheet lines), as on a payment.
async function finPayLinesFor(key, from, to, rates){
  const isW = String(key).startsWith('w:'), userId = isW ? null : key, wid = isW ? key.slice(2) : null;
  const [cks, man] = await Promise.all([
    userId ? dbSelect('checkins', 'user_id=eq.'+userId+'&type=eq.in&ts=gte.'+from+'T00:00:00&ts=lte.'+to+'T23:59:59&select=user_id,site_id,ts,type') : Promise.resolve([]),
    dbSelect('fin_labour_manual', (userId ? 'user_id=eq.'+userId : 'worker_id=eq.'+wid)+'&work_date=gte.'+from+'&work_date=lte.'+to),
  ]);
  const r = rates[key] || {};
  const signDays = man.length ? [] : finLabourDaysFrom(cks); // a timesheet replaces sign-ins for that week
  const bySite = {}; signDays.forEach(d=>{ bySite[d.site_id] = (bySite[d.site_id]||0)+1; });
  const lines = Object.keys(bySite).map(s=>({site_id:s, days:bySite[s], rate:Number(r.day_rate||0), amount:finRound(bySite[s]*Number(r.day_rate||0))}));
  man.forEach(m=>{ const d = Number(m.days||0) || 1; lines.push({site_id:m.site_id, days:Number(m.days||0)||1, rate:finRound(Number(m.amount||0)/d), amount:finRound(m.amount), description:m.description||null}); });
  return {lines, r};
}

// The pay run page itself is in 9219c (operative invoices).
