// The small square OpHUB logo every OpHUB email falls back to when a company has no logo of its own
// (https://operativehub.co.uk/assets/ophub-mark.png - it was missing, so those emails showed a broken picture; Andy,
// 19 Nov 2026). A tight square crop of assets/ophub-logo.png, 160 x 160. node make-ophub-mark.js
const {chromium} = require('./harness');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'ophub-logo.png')).toString('base64');
  const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 160, height: 160}});
  await p.setContent(`<html><body style="margin:0;width:160px;height:160px;overflow:hidden;background:#fff"><div style="width:160px;height:160px;background:url(data:image/png;base64,${src}) no-repeat;background-size:215px 215px;background-position:-28px -27px"></div></body></html>`);
  await p.screenshot({path: path.join(__dirname, '..', '..', 'assets', 'ophub-mark.png')});
  await b.close(); console.log('saved assets/ophub-mark.png');
})();
