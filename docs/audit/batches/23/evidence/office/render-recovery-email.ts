import {chromium} from '/Users/adam/Documents/Claude Projects/Series LLC Website/webapp/node_modules/playwright';
import {isolateBrowser} from '../repo/webapp/scripts/browser-isolation';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const html=readFileSync(new URL('../evidence-recovery/green/recovery-email.html',import.meta.url),'utf8');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}})});
const browser=await chromium.launch();const {blocked}=isolateBrowser(browser);
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto(`http://127.0.0.1:${server.port}`);
 await page.screenshot({path:fileURLToPath(new URL('recovery-email.png',import.meta.url))});
 await page.setViewportSize({width:375,height:812});
 await page.screenshot({path:fileURLToPath(new URL('recovery-email-narrow.png',import.meta.url))});
 console.log(JSON.stringify({text:await page.locator('body').innerText(),link:await page.getByRole('link').getAttribute('href'),blocked:[...blocked],noHorizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)}));
 if(blocked.size)throw new Error('nonlocal request');
}finally{await browser.close();server.stop(true);}
