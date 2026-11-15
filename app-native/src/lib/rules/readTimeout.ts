// Which requests give up after 12 seconds (speed review, 15 Nov 2026): only reads (GET / HEAD) of database tables.
// On a weak signal a read could hang for a minute before the screen fell back to its saved copy. Saves, database
// functions (rpc), file uploads and downloads, sign-in and server functions are never cut short.
export const READ_TIMEOUT_MS = 12000;
export const isTimedRead = (url: string, method: string) =>
  (method === 'GET' || method === 'HEAD') && url.includes('/rest/v1/') && !url.includes('/rest/v1/rpc/');
