// Finding the handover documents in the job's OneDrive folder (Andy, 8 Nov 2026: "now the job has OneDrive linked it
// should search for the warranties etc"). A PDF or photo counts by its own name or the folders it sits in. Pure.
export type HoKind = 'guarantee' | 'datasheet';

const GUAR = /guarant|warrant|\bibg\b|insurance[ -]?backed/i;
const SHEET = /data ?sheet|\bdop\b|declaration of performance|\btds\b|technical (data|information|sheet)|product (data|information)|\bbba\b|agr[eé]ment|safety data|\bsds\b|\bmsds\b|spec(ification)? sheet/i;
const FILE = /\.(pdf|jpe?g|png)$/i;

/** What a OneDrive file is, from its name and folder path ("Job/Handover/Warranties"); null = not a handover document. */
export function hoKindOf(name: string, folderPath: string): HoKind | null {
  if (!FILE.test(name || '')) return null;
  const own = String(name || ''), where = String(folderPath || '');
  if (GUAR.test(own)) return 'guarantee';
  if (SHEET.test(own)) return 'datasheet';
  if (GUAR.test(where)) return 'guarantee';
  if (SHEET.test(where)) return 'datasheet';
  return null;
}

/** Folders not worth opening when searching: photo folders and the job's own exports. */
export const hoSkipFolder = (name: string) => /photos?\b|^images?$|^pictures?$|om-exports|^archive$|^old$/i.test(String(name || '').trim());

/** The same file isn't offered twice: compared by name, case and spacing ignored. */
export const hoSameName = (a: string, b: string) => String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') === String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');
