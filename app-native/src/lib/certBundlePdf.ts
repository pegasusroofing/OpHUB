// Ticked certificates as one PDF (320 buildCertBundlePdf): a PDF certificate's
// pages go straight in; a photo gets its own A4 page under its name; anything
// else gets a page saying to open it from the app.
import { openDocLink } from '@/data/hs';
import { embedImage, exportFilename, fetchBytes, INK, PDFDocument, safe, SLATE, StandardFonts } from '@/lib/pdf';
import { certDisplayName, type Cert } from '@/lib/rules/certs';

export async function buildCertBundlePdf(certs: Cert[]): Promise<{ bytes: Uint8Array; filename: string }> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  for (const c of certs) {
    try {
      const bytes = await fetchBytes(await openDocLink('certifications', c.storage_path));
      if (!bytes) continue;
      const title = safe(certDisplayName(c));
      const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      if (isPdf) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        (await doc.copyPages(src, src.getPageIndices())).forEach((p) => doc.addPage(p));
        continue;
      }
      const img = await embedImage(doc, bytes);
      const page = doc.addPage([595.28, 841.89]);
      if (img) {
        const M = 44, maxW = 595.28 - 2 * M, maxH = 841.89 - 2 * M - 30, s = Math.min(maxW / img.width, maxH / img.height, 1);
        page.drawText(title, { x: M, y: 841.89 - M + 8, size: 10, font: bold, color: INK });
        page.drawImage(img, { x: M, y: 841.89 - M - 30 - img.height * s, width: img.width * s, height: img.height * s });
      } else {
        page.drawText(title, { x: 44, y: 780, size: 12, font: bold, color: INK });
        page.drawText("This file type can't be previewed here — open it from the app to view.", { x: 44, y: 760, size: 9, font: reg, color: SLATE });
      }
    } catch { /* skipped, as today */ }
  }
  return { bytes: await doc.save(), filename: exportFilename('', `Certificates (${certs.length})`, 'pdf') };
}
