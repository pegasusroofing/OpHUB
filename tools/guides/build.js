// Makes the two OpHUB user guide PDFs from their Markdown, with the screenshots from capture.js:
//   docs/guides/OpHUB-Phone-Guide.md  -> docs/guides/OpHUB-Phone-Guide.pdf
//   docs/guides/OpHUB-Laptop-Guide.md -> docs/guides/OpHUB-Laptop-Guide.pdf
// node tools/guides/build.js            (MADE="17 November 2026" to set the date on the title page and header)
// A4, plain black and grey, one accent. Every section starts on a new page; the contents has page numbers and links.
const fs = require('fs');
const os = require('os');
const path = require('path');
const NM = path.join(__dirname, '..', 'test-harness', 'node_modules');
const {chromium} = require(path.join(NM, 'playwright'));
const {PDFDocument} = require(path.join(NM, 'pdf-lib'));

const GUIDES = path.join(__dirname, '..', '..', 'docs', 'guides');
const MADE = process.env.MADE || new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'});
const ACCENT = '#B5121B'; // RTB red, used only for thin rules
const BOOKS = [
  {md: 'OpHUB-Phone-Guide.md', pdf: 'OpHUB-Phone-Guide.pdf', name: 'OpHUB Phone Guide',
    covers: 'How to use OpHUB on a phone: Finance, operatives on site, and project managers.'},
  {md: 'OpHUB-Laptop-Guide.md', pdf: 'OpHUB-Laptop-Guide.pdf', name: 'OpHUB Laptop Guide',
    covers: 'How to use OpHUB on a laptop or office computer: Finance, operatives, and project managers.'},
];

// ---- a small Markdown converter: headings, paragraphs, lists (nested), bold, italic, links, images, quotes ----
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\- _]/gu, '').replace(/ /g, '-');
const inline = (s) => {
  s = s.replace(/\\([*_\\#\[\]()])/g, (m, c) => `\u0000${c.charCodeAt(0)}\u0000`);
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<i>$2</i>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, h) => `<a href="${h}">${t}</a>`);
  return s.replace(/\u0000(\d+)\u0000/g, (m, c) => esc(String.fromCharCode(Number(c))));
};
const IMG = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const LI = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

// Turns the Markdown into a list of blocks: {type: 'h1'|'h2'|'h3'|'p'|'list'|'imgs'|'quote', ...}
const parse = (md) => {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim() || /^---+\s*$/.test(l)) { i++; continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { blocks.push({type: 'h' + m[1].length, text: m[2].trim()}); i++; continue; }
    if (IMG.test(l)) {
      const imgs = [];
      while (i < lines.length && (m = IMG.exec(lines[i]))) { imgs.push({alt: m[1], src: m[2]}); i++; }
      blocks.push({type: 'imgs', imgs}); continue;
    }
    if (/^>\s?/.test(l)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push({type: 'quote', text: q.join(' ')}); continue;
    }
    if (LI.test(l)) {
      const items = [];
      while (i < lines.length && lines[i].trim()) {
        if ((m = LI.exec(lines[i]))) items.push({indent: m[1].length, ordered: /\d/.test(m[2]), num: parseInt(m[2], 10), text: m[3]});
        else if (items.length) items[items.length - 1].text += ' ' + lines[i].trim();
        i++;
      }
      blocks.push({type: 'list', items}); continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|!\[|---)/.test(lines[i]) && !LI.test(lines[i])) { p.push(lines[i].trim()); i++; }
    blocks.push({type: 'p', text: p.join(' ')});
  }
  return blocks;
};
// Nested lists from indentation.
const listHtml = (items, fmt = (it) => inline(it.text)) => {
  let html = '';
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) { html += `</li></${stack.pop().tag}>`; }
    const top = stack[stack.length - 1];
    if (!top || it.indent > top.indent) {
      const tag = it.ordered ? 'ol' : 'ul';
      html += `<${tag}${it.ordered && it.num > 1 ? ` start="${it.num}"` : ''}>`;
      stack.push({indent: it.indent, tag});
    } else html += '</li>';
    html += `<li>${fmt(it)}`;
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
};

// ---- the book: title page, contents, then one chunk per forced page break ----
const book = (b, pages, join = new Set()) => {
  const blocks = parse(fs.readFileSync(path.join(GUIDES, b.md), 'utf8'));
  const chunks = [];
  // Title page.
  chunks.push(`<section class="title"><div class="tbox"><div class="tname">${esc(b.name)}</div><div class="rule"></div>
    <div class="tco">RTB Roofing Ltd</div><div class="tmade">Made ${esc(MADE)}</div><p class="tcovers">${esc(b.covers)}</p></div></section>`);
  // Contents, from the Markdown's own contents list, with page numbers.
  const ci = blocks.findIndex((x) => x.type === 'h2' && /^Contents$/i.test(x.text));
  const contents = blocks[ci + 1];
  const pageOf = (id) => (pages && pages[id] != null ? pages[id] : '00');
  const tocItems = contents.items.map((it) => {
    const m = /^\[([^\]]+)\]\(#([^)]+)\)$/.exec(it.text.trim());
    if (m) return `<a class="toc" href="#${m[2]}"><span class="tt">${inline(m[1])}</span><span class="dots"></span><span class="pg">${pageOf(m[2])}</span></a>`;
    // A part ("**Part 1: ...**"): links to its own heading.
    const t = it.text.replace(/\*\*/g, '').trim(), id = slug(t);
    return `<a class="toc part" href="#${id}"><span class="tt">${inline(t)}</span><span class="dots"></span><span class="pg">${pageOf(id)}</span></a>`;
  });
  chunks.push(`<section class="contents"><h2 class="ch">Contents</h2>${listHtml(contents.items.map((it, k) => ({...it, ordered: false, html: tocItems[k]})), (it) => it.html)}</section>`);
  // The body: skip the title, the intro (it's on the title page) and the contents.
  const body = blocks.slice(ci + 2);
  let cur = null, afterPart = '';
  const ids = [];
  const open = (cls, id) => { if (cur) chunks.push(cur + '</section>'); cur = `<section class="${cls}"${id ? ` data-id="${id}"` : ''}>`; };
  for (const x of body) {
    if (x.type === 'h1') { const id = slug(x.text); ids.push(id); open('part', id); cur += `<h1 id="${id}">${inline(x.text)}</h1>`; afterPart = id; continue; }
    if (x.type === 'h2') {
      const id = slug(x.text); ids.push(id);
      if (!cur || !join.has(afterPart)) open('sec', id);
      afterPart = '';
      cur += `<h2 id="${id}">${inline(x.text)}</h2>`;
      continue;
    }
    if (!cur) open('sec');
    if (x.type === 'h3') cur += `<h3>${inline(x.text)}</h3>`;
    else if (x.type === 'p') cur += /^\*\*What This Does In /.test(x.text) ? `<p class="link">${inline(x.text)}</p>` : /^\*\*What it's for:\*\*/.test(x.text) ? `<p class="for">${inline(x.text)}</p>` : `<p>${inline(x.text)}</p>`;
    else if (x.type === 'quote') cur += `<div class="note">${inline(x.text)}</div>`;
    else if (x.type === 'list') cur += listHtml(x.items);
    else if (x.type === 'imgs') {
      const figs = x.imgs.map((im) => {
        const f = path.join(GUIDES, im.src);
        if (!fs.existsSync(f)) throw new Error(`${b.md}: no picture ${im.src}`);
        const kind = /\/phone\//.test(im.src) ? 'phone' : 'laptop';
        return `<figure class="${kind}"><img src="${'file:///' + f.replace(/\\/g, '/')}"><figcaption>${inline(im.alt)}</figcaption></figure>`;
      });
      // Phone pictures in a row, side by side; laptop pictures full width, one under the other.
      const laptop = x.imgs.some((im) => !/\/phone\//.test(im.src));
      cur += laptop ? figs.map((f) => `<div class="figs">${f}</div>`).join('') : `<div class="figs">${figs.join('')}</div>`;
    }
  }
  if (cur) chunks.push(cur + '</section>');
  // A part heading on its own page is a divider page: the heading and its few lines, a third of the way down.
  return {chunks: chunks.map((c) => (/^<section class="part"/.test(c) && !c.includes('<h2') ? c.replace('class="part"', 'class="part divider"') : c)), ids};
};

const CSS = `
  @page { size: A4; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 11.5pt; line-height: 1.45; color: #1a1a1a; }
  section { break-before: page; }
  section:first-child { break-before: auto; }
  h1, h2, h3 { font-weight: 700; color: #111; break-after: avoid; }
  h1 { font-size: 24pt; margin: 0 0 6mm; padding-bottom: 3mm; border-bottom: 1.2pt solid ${ACCENT}; }
  h2 { font-size: 17pt; margin: 0 0 3.5mm; }
  h2.ch { font-size: 20pt; border-bottom: 1.2pt solid ${ACCENT}; padding-bottom: 3mm; margin-bottom: 5mm; }
  section.part h2 { margin-top: 9mm; }
  section.divider { padding-top: 70mm; }
  section.divider h1 { font-size: 28pt; }
  section.divider p { font-size: 13pt; color: #333; }
  h3 { font-size: 13pt; margin: 4mm 0 2mm; }
  p { margin: 0 0 2.6mm; }
  p.for { color: #333; }
  p.link { background: #f2f2f2; border-left: 2pt solid #9a9a9a; padding: 2mm 3mm; margin: 3mm 0; break-inside: avoid; }
  .note { border-left: 2pt solid ${ACCENT}; background: #f5f5f5; padding: 2.5mm 3.5mm; margin: 3mm 0 4mm; break-inside: avoid; }
  ol, ul { margin: 0 0 3mm; padding-left: 7mm; }
  li { margin: 0 0 1.4mm; }
  li > ul, li > ol { margin: 1.4mm 0 0; }
  a { color: inherit; text-decoration: none; }
  .figs { display: flex; justify-content: center; gap: 8mm; margin: 4mm 0 2mm; break-inside: avoid; }
  figure { margin: 0; break-inside: avoid; text-align: center; }
  figure img { display: block; border: 0.75pt solid #b5b5b5; }
  figure.phone img { width: 65mm; }
  figure.laptop { width: 100%; }
  figure.laptop img { width: 100%; box-sizing: border-box; }
  figcaption { color: #6b6b6b; font-size: 9.5pt; margin-top: 1.8mm; }
  /* title page */
  section.title { height: 240mm; display: flex; align-items: center; }
  .tbox { width: 100%; }
  .tname { font-size: 34pt; font-weight: 700; color: #111; line-height: 1.15; }
  .rule { width: 40mm; border-top: 2pt solid ${ACCENT}; margin: 7mm 0 8mm; }
  .tco { font-size: 16pt; color: #222; font-weight: 600; }
  .tmade { font-size: 12pt; color: #6b6b6b; margin-top: 2mm; }
  .tcovers { font-size: 13pt; color: #333; margin-top: 14mm; max-width: 150mm; }
  /* contents */
  section.contents ul { list-style: none; padding-left: 0; margin: 0; }
  section.contents li { margin: 0; }
  section.contents li > ul { padding-left: 7mm; margin: 0 0 1.5mm; }
  a.toc { display: flex; align-items: baseline; font-size: 10.5pt; line-height: 1.5; }
  a.toc.part { font-weight: 700; font-size: 11.5pt; margin-top: 2.5mm; }
  a.toc .dots { flex: 1; border-bottom: 0.6pt dotted #9a9a9a; margin: 0 2mm; transform: translateY(-1mm); }
  a.toc .pg { color: #444; min-width: 7mm; text-align: right; }
`;
const html = (chunks) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${chunks.join('\n')}</body></html>`;
const MARGIN = {top: '18mm', bottom: '17mm', left: '15mm', right: '15mm'};
const head = (name) => `<div style="width:100%;font-family:'Segoe UI',Arial,sans-serif;font-size:8pt;color:#777;padding:0 15mm;display:flex;justify-content:space-between;">
  <span>${esc(name)}</span><span>${esc(MADE)}</span></div>`;
const foot = `<div style="width:100%;font-family:'Segoe UI',Arial,sans-serif;font-size:8pt;color:#777;text-align:center;">
  Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`;

(async () => {
  const browser = await chromium.launch({args: ['--disable-lcd-text']});
  const page = await browser.newPage();
  const tmp = path.join(os.tmpdir(), `ophub-guide-${process.pid}.html`);
  const load = async (h) => {
    fs.writeFileSync(tmp, h);
    await page.goto('file:///' + tmp.replace(/\\/g, '/'));
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; }))); });
    const bad = await page.evaluate(() => [...document.images].filter((im) => !im.naturalWidth).map((im) => im.src));
    if (bad.length) throw new Error('pictures that did not load: ' + bad.join(', '));
  };
  const pdf = (opts = {}) => page.pdf({format: 'A4', margin: MARGIN, printBackground: true, preferCSSPageSize: false, ...opts});
  const count = async (buf) => (await PDFDocument.load(buf)).getPageCount();
  for (const b of BOOKS) {
    const pagesOf = async (c) => { await load(html([c])); return count(await pdf({displayHeaderFooter: true, headerTemplate: head(b.name), footerTemplate: foot})); };
    // A part's heading page takes its first section too, if that section still fits as it would on its own page.
    const join = new Set();
    {
      const alone = book(b, null).chunks, both = book(b, null, new Set(book(b, null).ids)).chunks;
      for (const c of both) {
        const m = /^<section class="part" data-id="([^"]+)">/.exec(c);
        const sec = m && / id="([^"]+)"[^]*?<h2 id="([^"]+)"/.exec(c);
        if (!sec) continue;
        const own = alone.find((x) => x.includes(`<h2 id="${sec[2]}"`));
        if ((await pagesOf(c)) <= (await pagesOf(own))) join.add(m[1]);
      }
    }
    // Pass 1: how many pages each chunk takes (every chunk starts on a new page, so they add up).
    const {chunks} = book(b, null, join);
    const starts = [];
    let at = 1;
    for (const c of chunks) {
      starts.push(at);
      const n = await pagesOf(c);
      // A section running onto a second page: listed, so it can be checked by eye.
      if (n > 1 && process.env.VERBOSE) console.log(`  pages ${at}-${at + n - 1}: ${(/ id="([^"]+)"/.exec(c) || [, c.slice(0, 40)])[1]}`);
      at += n;
    }
    // Which page each heading is on.
    const pages = {};
    chunks.forEach((c, k) => { for (const m of c.matchAll(/ id="([^"]+)"/g)) pages[m[1]] = starts[k]; });
    // Pass 2: the whole book with page numbers in the contents.
    const final = book(b, pages, join);
    await load(html(final.chunks));
    if (process.env.KEEP_HTML) fs.writeFileSync(path.join(os.tmpdir(), 'ophub-guide-full-' + b.pdf.replace(/.pdf$/, '') + '.html'), html(final.chunks)); // KEEP_HTML=1: a copy to look at
    const full = await pdf({displayHeaderFooter: true, headerTemplate: head(b.name), footerTemplate: foot});
    // The title page, without the header and footer.
    await load(html([final.chunks[0]]));
    const title = await pdf({displayHeaderFooter: false});
    const doc = await PDFDocument.load(full);
    const [tp] = await doc.copyPages(await PDFDocument.load(title), [0]);
    doc.removePage(0); doc.insertPage(0, tp);
    doc.setTitle(b.name); doc.setAuthor('RTB Roofing Ltd'); doc.setSubject(b.covers); doc.setCreator('OpHUB guides (tools/guides/build.js)');
    const out = await doc.save();
    fs.writeFileSync(path.join(GUIDES, b.pdf), out);
    const n = doc.getPageCount();
    console.log(`${b.pdf}: ${n} pages, ${(out.length / 1048576).toFixed(1)} MB${n !== at - 1 ? `  (contents numbers expected ${at - 1} pages)` : ''}`);
  }
  fs.rmSync(tmp, {force: true});
  await browser.close();
})();
