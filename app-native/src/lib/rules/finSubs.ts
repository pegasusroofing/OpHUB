// Subcontractor and operative payment maths (912 finSaCalc / markFinSubAppPaid,
// 9219c finOpCalc). Pure.
import { round2 } from './finance.ts';

/**
 * A subcontractor application, all figures to date. CIS is worked out on the
 * labour part of this payment; a contra charge (plant, services or goods we
 * supplied to them) counts as paid to them, so it does NOT reduce the amount
 * CIS is worked out on (HMRC CISR15030).
 */
export function subAppCalc(o: { applied: number; mat: number; cert: number | null; contra: number; retentionPct: number; cisRate: number; prevNet: number; prevM: number; prevContra: number }) {
  if (o.cert === null) return { cert: null as number | null, applied: o.applied, mat: o.mat };
  const retention = round2((o.cert * o.retentionPct) / 100);
  const net = round2(o.cert - retention - o.contra - o.prevNet);
  const newMat = Math.max(0, round2(o.mat - o.prevM));
  const contraNow = round2(o.contra - o.prevContra);
  const gross = round2(net + contraNow);
  const labour = Math.max(0, round2(gross - newMat));
  const cis = round2((labour * o.cisRate) / 100);
  return { cert: o.cert, applied: o.applied, mat: o.mat, contra: o.contra, contraNow, gross, retention, net, newMat, labour, cis, pay: round2(net - cis), payless: o.cert < o.applied - 0.005 };
}
/** An operative's invoice: CIS on the labour only (materials aren't deducted). */
export function opCalc(lines: { amount?: unknown }[], materials: unknown, cisRate: number) {
  const labour = round2(lines.reduce((t, l) => t + (Number(l.amount) || 0), 0)), mat = round2(Number(materials || 0));
  const ded = round2((labour * cisRate) / 100);
  return { labour, materials: mat, gross: round2(labour + mat), cis_rate: cisRate, cis_deduction: ded, net_pay: round2(labour + mat - ded) };
}
