// Screenshots of a mock-up page, one per .screen block: node mockup-shots.js onedrive  → shots/mock-onedrive-1.png …
const path = require('path');
const {chromium} = require('playwright');
(async () => {
  const name = process.argv[2] || 'onedrive';
  const browser = await chromium.launch();
  const page = await browser.newPage({viewport: {width: 1400, height: 1000}});
  await page.goto('file:///' + path.join(__dirname, '..', '..', 'docs', 'claude-code', 'mockups', `${name}.html`).replace(/\\/g, '/'));
  await page.waitForTimeout(500);
  const screens = page.locator('.screen');
  for (let i = 0; i < await screens.count(); i++) await screens.nth(i).screenshot({path: path.join(__dirname, 'shots', `mock-${name}-${i + 1}.png`)});
  console.log('made', await screens.count());
  await browser.close();
})();
