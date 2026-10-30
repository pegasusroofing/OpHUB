// The old app's dbUpdate / dbDelete counted a change as done only when the row came back: the
// database's rules can refuse a delete or update without an error (0 rows). mustHit turns
// "nothing changed" into an error so callers that check .error see it.
export function mustHit<T extends { error: unknown; data: unknown }>(r: T): T {
  if (r.error || (Array.isArray(r.data) && r.data.length)) return r;
  return { ...r, error: { message: 'Nothing was changed — you may not have permission.' } };
}
