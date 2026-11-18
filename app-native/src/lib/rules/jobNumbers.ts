// Job numbers (Andy, 18 Nov 2026: "so duplicates not made"). One job number per job across the company, whether it's
// set up in Projects or in Finance, typed by hand or given automatically. The database refuses a repeat when numbers are
// automatic; this catches a typed one too, before saving, with the job that has it. Pure.

const key = (n: unknown) => String(n ?? '').trim().toLowerCase();

/** The name of another job that already has this number (ignoring case and spaces at the ends), or null. */
export function jobNumberClash(num: string, sites: readonly { id: string; name?: string | null; job_number?: string | null }[], exceptId?: string): string | null {
  const k = key(num);
  if (!k) return null;
  const hit = sites.find((s) => s.id !== exceptId && key(s.job_number) === k);
  return hit ? hit.name || 'another job' : null;
}

/** The database's own words for a repeated number, made plain (its trigger raises "Job number … is already used"). */
export const jobNumberError = (msg: string | null | undefined) => (/already used on another job/i.test(String(msg || '')) ? String(msg).replace(/^.*?(Job number .* is already used on another job).*$/i, '$1.') : null);
