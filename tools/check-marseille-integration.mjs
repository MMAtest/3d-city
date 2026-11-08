import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
});
const cases = [
  { name: 'overview', hash: '#lat=43.29300&lon=5.37000&km=6&ex=1.5&cam=0,52,15000,0,0', small: false },
  { name: 'cours-julien', hash: '#lat=43.29290&lon=5.38400&km=1.9&ex=1.2', small: false },
  { name: 'vieux-port-mobile', hash: '#lat=43.29530&lon=5.37230&km=1.9&ex=1.2', small: true },
  { name: 'overview-mobile', hash: '#lat=43.29300&lon=5.37000&km=6&ex=1.5', small: true },
];
for (const check of cases) {
  const context = await browser.newContext(check.small ? {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [], network = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('response', (res) => { if (res.url().includes('/afflue/') && !res.ok()) network.push(res.url() + ' ' + res.status()); });
  const start=Date.now();
  await page.goto('http://127.0.0.1:5173/' + check.hash, { waitUntil: 'domcontentloaded' });
  try { await page.waitForFunction(() => window.__yourPlace?.stage === 'ready' || window.__yourPlace?.stage === 'error', null, { timeout: 90000 }); }
  catch (error) { errors.push('TIMEOUT '+String(error)); }
  await page.waitForTimeout(1000);
  const result = await page.evaluate(() => ({
    stage: window.__yourPlace?.stage,
    title: document.title,
    stats: window.__yourPlace?.stats(),
    marseille: window.__yourPlace?.marseille(),
    source: window.__yourPlace?.source,
    timings: window.__yourPlace?.timings,
    bodyOverflows: document.documentElement.scrollWidth > innerWidth,
    sampleMenu: Array.from(document.querySelectorAll('.marseille-stop')).slice(0,3).map(x=>x.textContent),
    note: document.querySelector('#marseille-detail-note')?.textContent,
  }));
  await page.screenshot({path:'/tmp/marseille-v2-'+check.name+'.png'});
  console.log('CASE',check.name, 'SEC', ((Date.now()-start)/1000).toFixed(1), JSON.stringify(result), 'ERRORS',JSON.stringify(errors.slice(0,8)), 'NETWORK', JSON.stringify(network.slice(0,5)));
  await context.close();
}
await browser.close();