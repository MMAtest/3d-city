import { chromium } from 'playwright';

const url = 'http://127.0.0.1:5173/#lat=43.29300&lon=5.37000&km=6&ex=1.5&cam=0,52,15000,0,0';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(err.message));
const start = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
try {
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__yourPlace?.stage), null, { timeout: 120000 });
} catch (e) {
  console.log('TIMEOUT', String(e));
}
await page.waitForTimeout(1200);
console.log('RESULT', JSON.stringify(await page.evaluate(() => ({
  stage: window.__yourPlace?.stage,
  source: window.__yourPlace?.source,
  stats: window.__yourPlace?.stats(),
  notice: window.__yourPlace?.notice(),
  timings: window.__yourPlace?.timings,
  title: document.title,
  url: location.href,
})), null, 2));
console.log('SECONDS', (Date.now()-start)/1000, 'ERRORS', JSON.stringify(errors.slice(0,20)));
await page.screenshot({ path: '/tmp/marseille-centre-3d.png', fullPage: true });
await browser.close();