// A client's contacts, for a new project (Andy, 18 Nov 2026: "client full row, contact name, contact number split rows,
// contact email ... all pulls through from directory, if multiple contacts allow to choose, or manually type"). Every
// contact OpHUB already knows for the client: the Directory's own (its main email / phone, and its estimating contact),
// and the contacts on the client's past projects and quotes; the same person once. Pure.

export type Contact = { name: string; phone: string; email: string; from: string };
type Dir = { name?: string | null; email?: string | null; phone?: string | null; estimator_name?: string | null; estimator_email?: string | null; estimator_phone?: string | null };
type SiteC = { client_name?: string | null; client_contact_name?: string | null; client_phone?: string | null; client_email?: string | null; created_at?: string | null };
type QuoteC = { client_name?: string | null; contact_name?: string | null; contact_phone?: string | null; contact_email?: string | null };

const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const t = (x: unknown) => String(x ?? '').trim();

export function clientContacts(client: string, dir: readonly Dir[], sites: readonly SiteC[], quotes: readonly QuoteC[]): Contact[] {
  if (!t(client)) return [];
  const raw: Contact[] = [];
  dir.filter((d) => same(d.name, client)).forEach((d) => {
    if (t(d.estimator_name) || t(d.estimator_email) || t(d.estimator_phone)) raw.push({ name: t(d.estimator_name), phone: t(d.estimator_phone), email: t(d.estimator_email), from: 'Directory' });
    if (t(d.email) || t(d.phone)) raw.push({ name: '', phone: t(d.phone), email: t(d.email), from: 'Directory' });
  });
  // Newest projects first, so a changed number on the latest job wins.
  [...sites].filter((s) => same(s.client_name, client)).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .forEach((s) => raw.push({ name: t(s.client_contact_name), phone: t(s.client_phone), email: t(s.client_email), from: 'Past Project' }));
  quotes.filter((q) => same(q.client_name, client)).forEach((q) => raw.push({ name: t(q.contact_name), phone: t(q.contact_phone), email: t(q.contact_email), from: 'Quote' }));
  // One entry per person: by name when there is one, else by email, else by phone; blanks filled from later ones.
  const out: Contact[] = [];
  raw.filter((c) => c.name || c.phone || c.email).forEach((c) => {
    const hit = out.find((o) => (c.name && o.name ? same(o.name, c.name) : (c.email && same(o.email, c.email)) || (!c.email && c.phone && same(o.phone, c.phone)) || (!c.name && !o.name && !!c.email && same(o.email, c.email))));
    if (hit) { hit.phone ||= c.phone; hit.email ||= c.email; hit.name ||= c.name; } else out.push({ ...c });
  });
  return out;
}

/** How a contact reads in the list: the name, or where it came from when there's none (the Directory's own number is the
 *  Main Contact), then the number and email. */
export const contactLabel = (c: Contact) => c.name || (c.from === 'Directory' ? 'Main Contact' : c.from === 'Quote' ? 'Contact From A Quote' : 'Contact From A Past Project');
export const contactSub = (c: Contact) => [c.phone, c.email].filter(Boolean).join(' · ') || c.from;
