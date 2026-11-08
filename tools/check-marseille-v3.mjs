import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'],
});
const cases = [
  { name:'fr-cours-ortho', url:'#lat=43.29290&lon=5.38400&km=1.9&ex=1.2&cam=25,58,4200,0,0', mobile:false },
  { name:'fr-vieux-port-mobile-ortho', url:'#lat=43.29530&lon=5.37230&km=1.9&ex=1.2&cam=20,54,4600,0,0', mobile:true },
];
for (const item of cases) {
  const context=await browser.newContext({
    locale:'fr-FR',
    viewport: item.mobile?{width:390,height:844}:{width:1440,height:900},
    isMobile:item.mobile, hasTouch:item.mobile, deviceScaleFactor:item.mobile?2:1,
  });
  const page=await context.newPage();
  const errors=[], requests=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', msg=>{if(msg.type()==='error') errors.push(msg.text())});
  page.on('response', res=>{if(res.url().includes('/ortho/marseille/'))requests.push([res.status(),res.url().split('/').pop()])});
  const began=Date.now();
  await page.goto('http://127.0.0.1:5173/'+item.url,{waitUntil:'domcontentloaded'});
  try {await page.waitForFunction(()=>window.__yourPlace?.stage==='ready'||window.__yourPlace?.stage==='error',null,{timeout:120000});}catch(e){errors.push(String(e))}
  try {await page.waitForFunction(()=>window.__yourPlace?.marseille()?.orthosShown > 0,null,{timeout:30000});}catch(e){errors.push('ortho timeout: '+String(e))}
  await page.waitForTimeout(1500);
  const v=await page.evaluate(()=>({
    language:document.documentElement.lang,
    title:document.title,
    stage:window.__yourPlace?.stage,
    stats:window.__yourPlace?.stats(),
    data:window.__yourPlace?.marseille(),
    photosToggle:document.querySelector('#ortho-switch')?.getAttribute('aria-checked'),
    sceneLabels:document.querySelector('.marseille-explore-lead')?.textContent,
    overflow:document.documentElement.scrollWidth>innerWidth,
    loaders:window.__yourPlace?.timings,
  }));
  await page.screenshot({path:'/tmp/marseille-v3-'+item.name+'.png',fullPage:true});
  console.log('CASE',item.name,JSON.stringify(v),'MS',Date.now()-began,'ERR',JSON.stringify(errors),'ASSETS',JSON.stringify(requests));
  if(!item.mobile){
    await page.locator('#ortho-switch').click();
    await page.waitForTimeout(400);
    await page.screenshot({path:'/tmp/marseille-v3-fr-cours-no-ortho.png',fullPage:true});
    console.log('PHOTO_SWITCH_OFF',await page.locator('#ortho-switch').getAttribute('aria-checked'));
  }
  await context.close();
}
await browser.close();