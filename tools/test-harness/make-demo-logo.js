// A plain made-up company logo for the website pictures (Andy, 19 Nov 2026: no RTB Roofing on the website).
// Writes docs/website/demo-logo.png. node make-demo-logo.js
const {chromium} = require('./harness');
const path = require('path');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({viewport: {width: 320, height: 320}});
  await page.setContent(`<html><body style="margin:0;width:320px;height:320px;display:flex;align-items:center;justify-content:center;background:#fff;font-family:Arial,Helvetica,sans-serif">
    <div style="text-align:center">
      <svg width="190" height="92" viewBox="0 0 190 92"><path d="M12 80 L95 14 L178 80" fill="none" stroke="#2F6FB3" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div style="font-weight:800;font-size:44px;letter-spacing:2px;color:#1A1D21;line-height:1;margin-top:4px">YOUR</div>
      <div style="font-weight:700;font-size:28px;letter-spacing:5px;color:#4E8FD1;line-height:1.2">COMPANY</div>
    </div></body></html>`);
  await page.screenshot({path: path.join(__dirname, '..', '..', 'docs', 'website', 'demo-logo.png')});
  await browser.close(); console.log('saved docs/website/demo-logo.png');
})();
