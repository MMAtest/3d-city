import { chromium } from 'playwright';
const browser=await chromium.launch({
 executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']
});
for(const item of [
 {name:'centre-mobile',size:[390,844],mobile:true,hash:'#lat=43.29300&lon=5.37000&km=6&ex=1.5&cam=0,50,15000,0,0'},
 {name:'vieux-port-detail',size:[1440,900],mobile:false,hash:'#lat=43.29530&lon=5.37230&km=1.9&ex=1.2&cam=20,55,4600,0,0'},
]){
 const context=await browser.newContext({viewport:{width:item.size[0],height:item.size[1]},locale:'fr-FR',isMobile:item.mobile,hasTouch:item.mobile,deviceScaleFactor:item.mobile?2:1});
 const page=await context.newPage(),errors=[],assets=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('response',r=>{if(r.url().includes('/ign-buildings/')) assets.push([r.status(),r.url().split('/').at(-1)])});
 const start=Date.now();
 await page.goto('http://127.0.0.1:5173/'+item.hash,{waitUntil:'domcontentloaded'});
 try{await page.waitForFunction(()=>['ready','error'].includes(window.__yourPlace?.stage),null,{timeout:120000})}
 catch(e){errors.push('wait '+String(e))}
 await page.waitForTimeout(1000);
 const result=await page.evaluate(()=>({
  stage:window.__yourPlace?.stage,stats:window.__yourPlace?.stats(),marseille:window.__yourPlace?.marseille(),
  timings:window.__yourPlace?.timings,title:document.title,
  overflow:document.documentElement.scrollWidth>innerWidth,
  webgl:!!document.querySelector('canvas#scene'),note:document.querySelector('#marseille-detail-note')?.textContent
 }));
 console.log('METRICS',item.name,'elapsed',((Date.now()-start)/1000).toFixed(1),JSON.stringify(result),'ERR',JSON.stringify(errors),'GZ',JSON.stringify(assets.filter(a=>a[1].includes('gz')).slice(0,22)));
 if(!process.env.SKIP_SCREENSHOT) { try { await page.screenshot({path:'/tmp/marseille-v4-'+item.name+'.png',timeout:50000}); } catch (err) { console.warn('SCREENSHOT_TIMEOUT', item.name, String(err)); } }
 console.log('CASE',item.name,'elapsed',((Date.now()-start)/1000).toFixed(1),JSON.stringify(result),'ERR',JSON.stringify(errors),'GZ',JSON.stringify(assets.filter(a=>a[1].includes('gz')).slice(0,22)));
 if(result.stage!=='ready'||result.stats?.buildings<(item.mobile?55000:9000)||errors.length)process.exitCode=1;
 await context.close();
}
await browser.close();