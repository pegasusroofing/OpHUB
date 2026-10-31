// Every record id made in the app comes from crypto.randomUUID, which phones' app engine and pages without
// https don't have. The stand-ins used then aren't valid ids, so the database refused the record: a photo
// uploaded but stayed on "uploading" for good. Imported first, so a proper id is always there.
export const makeUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.floor(Math.random() * 16);
  return (c === 'x' ? r : (r % 4) + 8).toString(16);
});
export const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
if (!g.crypto) g.crypto = {};
if (!g.crypto.randomUUID) g.crypto.randomUUID = makeUuid;
