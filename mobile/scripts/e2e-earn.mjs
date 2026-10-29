#!/usr/bin/env node
/** Local fake-HTTP Earn browser checks. Start Expo DEV web separately; no native/device claims. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const mobile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=path.resolve(mobile,'..');
const api=(process.env.EARN_API_URL||'http://127.0.0.1:4510').replace(/\/$/,'');
const production=process.env.EARN_PRODUCTION_ONLY==='1';
const base=(production?process.env.EARN_PRODUCTION_BASE:process.env.EARN_WEB_BASE)||`http://127.0.0.1:${production?4513:4512}`;
for(const origin of [api,base])assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname),'Local fictional origins only');
const port=Number(new URL(api).port||80),manage=process.env.EARN_MANAGE_API==='1';
assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535,'Use a local test API port');
const widths=(process.env.EARN_WIDTHS||(manage&&!production?'360,1280':'360')).split(',').map(Number);
assert.ok(widths.every(n=>[360,1280].includes(n)),'Use EARN_WIDTHS=360,1280');
const modulePath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(modulePath.startsWith('/')?pathToFileURL(modulePath).href:modulePath);
const out=path.resolve(process.env.EARN_SCREEN_DIR||path.join(workspace,'docs/earn-client/screens'));
await mkdir(out,{recursive:true});
const results=[];
let server,browser,activePage,audioDir;
async function stop(child){if(!child||child.exitCode!==null||child.signalCode!==null)return;const finished=once(child,'exit');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);try{await finished;}finally{clearTimeout(timer);}}
async function health(){const response=await fetch(api+'/health',{signal:AbortSignal.timeout(1500)});const value=await response.json();assert.ok(response.ok&&value.mode==='fake'&&Object.values(value.providers||{}).length&&Object.values(value.providers).every(v=>v==='fake')&&value.earn?.developmentFixture===true,'Fresh fake server and fake providers required');return value;}
async function startApi(){
 if(!manage){await health();return;}
 const probe=createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(port,'127.0.0.1',resolve);});await new Promise(resolve=>probe.close(resolve));
 audioDir=await mkdtemp(path.join(tmpdir(),'dutygraph-earn-browser-'));
 const env={...process.env,PORT:String(port),HOST:'127.0.0.1',DEV_SERVER_AUDIO_DIR:audioDir};
 for(const key of Object.keys(env))if(/^(OPENAI_|ANTHROPIC_|RESEND_)/.test(key)||['DUTYGRAPH_ORIGIN','DEV_SERVER_DATA_FILE','DEV_ADMIN_TOKEN'].includes(key))delete env[key];
 server=spawn(process.execPath,['--import','tsx','src/index.ts'],{cwd:path.join(workspace,'dev-server'),env,stdio:['ignore','ignore','inherit']});
 let ready=false;for(let attempt=0;attempt<100;attempt++){if(server.exitCode!==null)throw new Error('Owned fake server exited before readiness');try{await health();ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
 assert.ok(ready,'Owned fake server became ready');
}
async function stopApi(){await stop(server);server=null;if(audioDir){await rm(audioDir,{recursive:true,force:true});audioDir=null;}}
async function visible(page,text){await page.getByText(text,{exact:true}).filter({visible:true}).first().waitFor();}
function button(page,name){if(typeof name==='string'&&['Scoreboard','Earn','My work','Find the gaps'].includes(name))name=new RegExp('^'+name+'(?:\\.|$)');return page.getByRole('button',{name,exact:true}).filter({visible:true}).first();}
async function click(page,name){assert.deepEqual(page.__earnRenderWarnings||[],[],`No React render warnings before ${name}`);await button(page,name).click();}
async function back(page){await page.getByRole('button',{name:'Back',exact:true}).filter({visible:true}).first().click();}
async function me(page){for(let n=0;n<10;n++){const tab=page.getByRole('tab',{name:'Me',exact:true});if(await tab.isVisible()){await tab.click();await visible(page,'You');return;}await back(page);}throw new Error('Me tab was not reachable');}
async function shot(page,width,name){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: no document horizontal overflow`);await page.screenshot({path:path.join(out,`${name}-${width}.png`)});}
async function acknowledgement(page,pattern,action){const pending=page.waitForResponse(r=>r.request().method()==='POST'&&pattern.test(new URL(r.url()).pathname));await action();const response=await pending;assert.ok(response.ok(),`Write acknowledged: ${new URL(response.url()).pathname}`);const body=response.request().postDataJSON();assert.ok(response.request().headers()['idempotency-key'],'Every write carries idempotency key');assert.ok(!['personId','companyId','tenantId'].some(k=>Object.hasOwn(body,k)),'Identity is not in the write body');return{body,data:await response.json()};}
async function enroll(page){await page.goto(`${base}/mobile/enroll?t=${'d'.repeat(64)}`,{waitUntil:'domcontentloaded'});await button(page,'Connect this phone').waitFor({timeout:120000});await click(page,'Connect this phone');await click(page,"Yes, that's me");await click(page,'Not now');await page.getByRole('tab',{name:'Me',exact:true}).waitFor();await me(page);}
async function installBrowserStubs(context){await context.addInitScript(()=>{
 window.__earnCopyMode='success';window.__earnCopied=[];window.__earnShared=[];window.__earnMicrophoneRequests=0;
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.__earnCopyMode==='failure')throw new DOMException('Deliberate copy refusal','NotAllowedError');window.__earnCopied.push(text);},readText:async()=>window.__earnCopied.at(-1)||''}});
 const exec=document.execCommand?.bind(document);document.execCommand=(command,...args)=>{if(command==='copy'){if(window.__earnCopyMode==='failure')throw new Error('Deliberate legacy copy refusal');return true;}return exec?.(command,...args)??false;};
 Object.defineProperty(navigator,'share',{configurable:true,value:async value=>{window.__earnShared.push(value.text);}});
 for(const name of ['SpeechRecognition','webkitSpeechRecognition'])Object.defineProperty(window,name,{configurable:true,value:undefined});
 if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{window.__earnMicrophoneRequests++;throw new Error('No microphone use in this browser test');};
 });}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void Promise.all([stopApi(),browser?.close()]).finally(()=>process.exit(1));});
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
 for(const width of widths){
  await startApi();const context=await browser.newContext({viewport:{width,height:900},colorScheme:'dark',reducedMotion:'reduce'});await installBrowserStubs(context);
  const page=await context.newPage();activePage=page;page.setDefaultTimeout(30000);const errors=[],requests=[];page.__earnRenderWarnings=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&/Unexpected text node|React does not recognize|Each child in a list|Cannot update a component/.test(message.text()))page.__earnRenderWarnings.push(message.text());});
  page.on('request',request=>{const pathname=new URL(request.url()).pathname;if(pathname.startsWith('/api/mobile/v1/earn/'))requests.push({path:pathname,method:request.method()});});
  await enroll(page);
  if(production){
   assert.equal(await button(page,'Scoreboard').count(),0);await click(page,'My work');await visible(page,'This connection contains development examples. Earn is not available in this build.');
   assert.ok(!requests.some(r=>['/api/mobile/v1/earn/summary','/api/mobile/v1/earn/drafts'].includes(r.path)),'Production gate rejects before requesting Earn seed data');
   await shot(page,width,'production-fixture-refused');assert.deepEqual(errors,[]);results.push({width,production:true,passed:true,seedRequests:0});
   console.log(`PASS production Earn development-fixture refusal at ${width}px; legacy enrollment still worked.`);
   await context.close();await stopApi();continue;
  }
  await button(page,'Scoreboard').waitFor();await shot(page,width,'me-earned-entry');
  await click(page,'Scoreboard');await visible(page,'Earned · paid');await visible(page,'Time saved');await visible(page,"Your company's pay rules apply.");
  const names=['Alex Moreno','Dana Cole','Marcus Lee','Noah Reed','Priya Shah','Zoe Ellis'];const text=await page.locator('body').innerText();let previous=-1;for(const name of names){const index=text.indexOf(name);assert.ok(index>previous,`Team names in order: ${name}`);previous=index;}
  assert.ok(!/\b(rank|medal|top performer)\b/i.test(text));assert.ok(!/Paid cards: \d+ of \d+/.test(text),'No cap by default');await shot(page,width,'scoreboard');
  await me(page);await click(page,'My work');await button(page,/^Restock the service van,/).waitFor();await shot(page,width,'my-work-gallery');await click(page,/^Restock the service van,/);await visible(page,'Draft state: waiting');
  for(const text of ['Place: Service bay 2, rear yard','Tool: Parts trolley · Get it from: Inside the stores door','Material: Seal kits · Get it from: Shelf B3'])await page.getByText(text,{exact:false}).filter({visible:true}).first().waitFor();
  const ticks=page.getByRole('checkbox').filter({visible:true});assert.equal(await ticks.count(),3);await ticks.first().click();await page.waitForFunction(()=>document.querySelector('[role=checkbox]')?.getAttribute('aria-checked')==='true');assert.equal(await ticks.first().getAttribute('aria-checked'),'true');await shot(page,width,'manual-card');await page.getByText('Material: Seal kits · Get it from: Shelf B3',{exact:false}).filter({visible:true}).first().scrollIntoViewIfNeeded();await shot(page,width,'manual-card-materials');
  const first=await acknowledgement(page,/\/earn\/drafts\/[^/]+\/confirm$/,()=>click(page,'Confirm'));assert.equal(first.body.expectedVersion,1);assert.equal(first.data.draft.state,'confirmed');await visible(page,'Draft state: confirmed');
  await back(page);await click(page,/^Check the stock return,/);await button(page,'Add Hands to').waitFor();await click(page,'Add Hands to');await page.getByLabel('Hands to detail',{exact:true}).fill('Hand the checked stock list to the dispatch lead.');await click(page,'Done adding detail');
  const second=await acknowledgement(page,/\/earn\/drafts\/[^/]+\/confirm$/,()=>click(page,'Confirm'));assert.equal(second.body.expectedVersion,1);assert.equal(second.body.card.slots.handsTo.basis,'told_me');assert.equal(second.data.draft.state,'confirmed');await visible(page,'Draft state: confirmed');
  await me(page);await click(page,'Earn');await visible(page,'Pool not funded yet');await shot(page,width,'earn-rules');
  await click(page,'Copy Find tasks only I know');await visible(page,'Copied.');assert.ok(await page.evaluate(()=>window.__earnCopied.some(text=>text.includes('one at a time'))));
  await page.evaluate(()=>{window.__earnCopyMode='failure';});await click(page,'Copy question 1');await visible(page,'Copy did not work. Use Share instead.');await click(page,'Share question 1');assert.equal(await page.evaluate(()=>window.__earnShared.length),1);
  await click(page,'Say a task out loud');await visible(page,'Voice is not available here. Type instead.');assert.equal(await button(page,'Start listening').isEnabled(),false);await click(page,'Type instead');
  await page.getByLabel('Task name',{exact:true}).fill('Check the returns tray before dispatch');await page.getByLabel('Part of my job',{exact:true}).fill('Keep dispatch ready');await click(page,'Hands-on work');await page.getByLabel('Task words',{exact:true}).fill('I check the returned parts list before the dispatch handoff.');
  const created=await acknowledgement(page,/\/earn\/drafts$/,()=>click(page,'Save app draft'));assert.equal(created.body.sourceNote,'app');assert.equal(created.data.drafts[0].state,'waiting');assert.equal(created.data.drafts[0].via,'app');await visible(page,'Draft saved');await click(page,'Open My work');await button(page,/^Check the returns tray before dispatch,/).waitFor();await click(page,/^Check the returns tray before dispatch,/);await visible(page,'Draft state: waiting');await shot(page,width,'typed-voice-draft-waiting');
  const rejected=await acknowledgement(page,/\/earn\/drafts\/[^/]+\/not-mine$/,()=>click(page,'Not mine'));assert.equal(rejected.body.expectedVersion,1);assert.equal(rejected.data.state,'not_mine');await visible(page,'Draft state: not mine');
  await me(page);await click(page,'Find the gaps');await click(page,/^Returns wait for a check\./);await click(page,'I have a fix');await visible(page,'Voice is not available here. Type instead.');await click(page,'Type instead');await page.getByLabel('What would you change?',{exact:true}).fill('Move the returns checklist to the dispatch handoff tray.');await page.getByLabel('Hours a week before',{exact:true}).fill('20');await page.getByLabel('Hours a week after (proposed)',{exact:true}).fill('5');
  const fix=await acknowledgement(page,/\/earn\/fixes$/,()=>click(page,'Send fix'));assert.equal(fix.body.kind,'new_steps');assert.equal(fix.body.hoursAfter,5);await visible(page,'Fix sent. Your manager can review it.');await shot(page,width,'gap-fix');
  await me(page);
  await page.route('**/api/mobile/v1/earn/drafts?state=waiting',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'TEMPORARY_FAILURE',message:'Deliberate local Earn outage. Try again.',retryable:true})}));await click(page,'My work');await visible(page,'Deliberate local Earn outage. Try again.');await shot(page,width,'error-state');await page.unroute('**/api/mobile/v1/earn/drafts?state=waiting');await click(page,'Try again');await page.getByText('Deliberate local Earn outage. Try again.',{exact:true}).filter({visible:true}).first().waitFor({state:'hidden'});await page.getByText(/^Your Task Cards/).filter({visible:true}).first().waitFor();
  await me(page);await button(page,'Earn').waitFor();await page.route('**/api/mobile/v1/earn/summary',async route=>{const response=await route.fetch();const body=await response.json();body.settings.enabled=false;body.claims=[];for(const key of ['earnedPaidCents','earnedWaitingCents'])body.me[key]=0;await route.fulfill({response,json:body});});
  // Use the existing visible Earn entry once, then verify its off-state and refreshed Me links.
  await click(page,'Earn');await visible(page,'Earn is not turned on for this company.');assert.ok(!/\$\d/.test(await page.locator('body').innerText()),'No money shown while Earn off');await shot(page,width,'earn-off');await me(page);await button(page,'Earn').waitFor({state:'hidden'});await button(page,'Scoreboard').waitFor({state:'hidden'});assert.equal(await button(page,'Earn').count(),0);assert.equal(await button(page,'Scoreboard').count(),0);
  assert.equal(await page.evaluate(()=>window.__earnMicrophoneRequests),0,'No browser microphone was opened');assert.deepEqual(errors,[],'No page errors');assert.deepEqual(page.__earnRenderWarnings,[],'No React render warnings');
  results.push({width,passed:true,pageErrors:0,microphoneCalls:0,flows:['real participant enrollment','Me Scoreboard and name-only team counts','hands-on details and local ticks','versioned Confirm','local missing-slot edit carried on Confirm','Copy success/refusal and stubbed Share','typed voice fallback saves waiting app draft','Not mine acknowledgement','typed fix acknowledgement','intercepted outage/retry/empty state','intercepted Earn off hidden links']});
  console.log(`PASS Earn fake-HTTP phone web ${width}px; no page errors, overflow or microphone use.`);await context.close();await stopApi();
 }
 await writeFile(path.join(out,production?'production-results.json':'journey-results.json'),JSON.stringify({fakeHttp:true,productionGuardOnly:production,generatedAt:new Date().toISOString(),results},null,2)+'\n');
}catch(error){if(activePage&&!activePage.isClosed())console.error('Failed fictional Earn page:',(await activePage.locator('body').innerText()).slice(-10000));throw error;}
finally{await browser?.close();await stopApi();}
