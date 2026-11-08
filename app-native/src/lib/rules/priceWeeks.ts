// A price sheet's Excel (old 400 exportPriceBuilderSheet): after the lines, what's been booked in week by week with a running
// total, and the labour wages entered against it each week (the Price tile's "Labour wages this week"). Pure.
const r2 = (n: number) => Math.round(n * 100) / 100;

export function weeklyBookedIn(weeks: { week_number: number; amount: number | null }[]): [string, number, number][] {
  let running = 0;
  return weeks.slice().sort((a, b) => a.week_number - b.week_number).map((w) => { running = r2(running + Number(w.amount || 0)); return [`Week ${w.week_number}`, r2(Number(w.amount || 0)), running]; });
}

export function weeklyWages(entries: { week_number: number; amount: number | null }[]): [string, number][] {
  const by: Record<number, number> = {};
  entries.forEach((e) => { by[e.week_number] = (by[e.week_number] || 0) + Number(e.amount || 0); });
  return Object.keys(by).map(Number).sort((a, b) => a - b).map((wk) => [`Week ${wk}`, r2(by[wk])]);
}
