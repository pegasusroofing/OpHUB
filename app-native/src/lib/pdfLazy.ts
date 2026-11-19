// The PDF (and Word) builders, loaded the first time they're used (speed review, 15 Nov 2026: pdf-lib and the
// builders were about a fifth of what every screen downloaded at start-up). Each name here is the builder of the same
// name in lib/pdfKit.ts, taking the same arguments and giving the same answer; it fetches the PDF code first if it
// isn't here yet. Screens, components and data files import builders from here, never from the builders' own files.
// On the web the PDF code also loads by itself a few seconds after the app opens (preloadPdfKit), so an export still
// works when the signal drops later; on phones it's all in the app already.
import type * as Kit from '@/lib/pdfKit';
import type { PDFDocument as PdfDoc } from 'pdf-lib';

type K = typeof Kit;
let kitP: Promise<K> | null = null;
/** The PDF code (loaded once; tried again next time if there was no signal). */
export const pdfKit = (): Promise<K> => (kitP ??= import('@/lib/pdfKit').catch((e: unknown) => { kitP = null; throw e; }));
export const preloadPdfKit = () => { void pdfKit().catch(() => undefined); };

type Later<F> = F extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never;
const lazy = <N extends keyof K>(name: N): Later<K[N]> =>
  (async (...a: unknown[]) => ((await pdfKit())[name] as unknown as (...x: unknown[]) => unknown)(...a)) as unknown as Later<K[N]>;

/** pdf-lib's PDFDocument.create / load. */
export const PDFDocument = {
  create: async (...a: Parameters<typeof PdfDoc.create>) => (await pdfKit()).PDFDocument.create(...a),
  load: async (...a: Parameters<typeof PdfDoc.load>) => (await pdfKit()).PDFDocument.load(...a),
};
// eslint-disable-next-line @typescript-eslint/no-redeclare -- the type of what create / load give back, under the same name
export type PDFDocument = PdfDoc;

export const buildAppPdf = lazy('buildAppPdf');
export const buildCertBundlePdf = lazy('buildCertBundlePdf');
export const buildCoshhPdf = lazy('buildCoshhPdf');
export const buildCppPdf = lazy('buildCppPdf');
export const buildHavsPdf = lazy('buildHavsPdf');
export const buildIncidentPdf = lazy('buildIncidentPdf');
export const buildInductionPdf = lazy('buildInductionPdf');
export const buildInvoicePdf = lazy('buildInvoicePdf');
export const buildOmPdf = lazy('buildOmPdf');
export const buildOmWord = lazy('buildOmWord');
export const buildPermitPdf = lazy('buildPermitPdf');
export const buildPoPdf = lazy('buildPoPdf');
export const buildRamsPdf = lazy('buildRamsPdf');
export const buildRepairReport = lazy('buildRepairReport');
export const buildReportPdf = lazy('buildReportPdf');
export const buildSignedHsPdf = lazy('buildSignedHsPdf');
export const buildSignedLayoutPdf = lazy('buildSignedLayoutPdf');
export const buildSignedTbtPdf = lazy('buildSignedTbtPdf');
export const buildSnagPdf = lazy('buildSnagPdf');
export const buildSowPdf = lazy('buildSowPdf');
export const buildSubNoticePdf = lazy('buildSubNoticePdf');
export const buildTbtPdf = lazy('buildTbtPdf');
export const buildVariationsPdf = lazy('buildVariationsPdf');
export const cisStatement = lazy('cisStatement');
export const deliverDocx = lazy('deliverDocx');
export const drawSignatureTable = lazy('drawSignatureTable');
export const emailHavsPdf = lazy('emailHavsPdf');
export const emailIncidentPdf = lazy('emailIncidentPdf');
export const emailPuwerPdf = lazy('emailPuwerPdf');
export const emailSowPdf = lazy('emailSowPdf');
export const exportDeliverySchedule = lazy('exportDeliverySchedule');
export const exportRepairReport = lazy('exportRepairReport');
export const exportTablePdf = lazy('exportTablePdf');
export const exportTrainingMatrixExcel = lazy('exportTrainingMatrixExcel');
export const exportTrainingMatrixPdf = lazy('exportTrainingMatrixPdf');
export const buildPuwerPdf = lazy('buildPuwerPdf');
export const permitAttachment = lazy('permitAttachment');
export const ppeEmailPdfs = lazy('ppeEmailPdfs');
export const ppeExportPdf = lazy('ppeExportPdf');
export const stampSignLayout = lazy('stampSignLayout');
