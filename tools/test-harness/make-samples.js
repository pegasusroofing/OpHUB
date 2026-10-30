// Sample files for the checks that take a file (BOQ, QUOTE, STMT, SDS, WO). Writes them to shots/samples/.
const fs = require('fs'), path = require('path');
const {PDFDocument, StandardFonts} = require('pdf-lib');
const dir = path.join(__dirname, 'shots', 'samples'); fs.mkdirSync(dir, {recursive:true});
fs.writeFileSync(path.join(dir, 'boq.csv'), 'Ref,Description,Qty,Unit,Rate,Value\n1,Main Roof,,,,\n1.1,Strip and re-slate,100,m2,50,5000\n1.2,Lead flashing,20,m,40,800\n');
fs.writeFileSync(path.join(dir, 'quote.csv'), 'Code,Description,Qty,Unit,Rate\nS1,Slates 500x250,400,no,1.25\nL4,Lead code 4,2,roll,85\n');
fs.writeFileSync(path.join(dir, 'stmt.csv'), 'Date,Reference,Details,Amount\n2026-10-01,INV-100,Invoice,120.00\n2026-10-08,INV-101,Invoice,60.00\nBalance,,,180.00\n');
const pdf = async (name, rows) => { const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica), p = d.addPage(); rows.forEach((t, i) => p.drawText(t, {x:40, y:780 - i * 16, size:10, font:f})); fs.writeFileSync(path.join(dir, name), await d.save()); };
(async () => {
  await pdf('sds.pdf', ['SAFETY DATA SHEET', 'SECTION 1: Identification', 'Product name: Roof Sealant X', 'Manufacturer: Acme Chemicals Ltd', 'SECTION 2: Hazards', 'H315 Causes skin irritation', 'H317 May cause an allergic skin reaction', 'P280 Wear protective gloves']);
  await pdf('wo.pdf', ['WORK ORDER', 'Job Number: RJ-555', 'Address: 12 Mill Lane, Leeds, LS1 2AB', 'Description: Replace slipped tiles over the porch']);
  console.log('written to', dir);
})();
