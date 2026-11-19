import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../popup-cloud.js',import.meta.url),'utf8');
function fixture({hostname='eyequipment.webflow.io',elapsed=0,seen=false,b2b=false,path='/',query='',popupBlocked=false,fetcher=()=>{throw Error('No network expected')}}={}) {
  let now=1800000000000;
  const listeners={},timers=[],storage=new Map(seen?[['eq-newsletter-login-promo-shown',String(now)]]:[]);
  const node=()=>({disabled:false,isConnected:true,setAttribute(){},removeAttribute(){},getClientRects:()=>[1],focus(){document.activeElement=this}});
  const email=node(),submit=node(),message=node(),page=node(),form=node(),root=node(),panel=node();
  root.classes=new Set(['is-hidden']);root.classList={contains:x=>root.classes.has(x),add:x=>root.classes.add(x),toggle:(x,on)=>on?root.classes.add(x):root.classes.delete(x)};
  form.querySelector=s=>s==='input[type=email]'?email:s==='[type=submit]'?submit:null;form.append=()=>{};form.reportValidity=()=>true;
  root.querySelector=s=>s==='.eq-newsletter-popup'?panel:s==='[data-eq-newsletter-signup]'?form:message;
  panel.querySelectorAll=()=>[email,submit];panel.contains=x=>[email,submit].includes(x);
  const document={activeElement:page,hidden:false,body:{append(){},children:[root,page],style:{overflow:'auto'}},querySelector:s=>s==='[data-eq-newsletter-promo]'?root:null,createElement:()=>node(),addEventListener:(n,f)=>listeners[n]=f};
  const child={messages:[],postMessage(data,origin){this.messages.push({data,origin})}};
  const window={EyequipmentNativeB2B:{isB2B:b2b},addEventListener:(n,f)=>listeners[n]=f,open:()=>popupBlocked?null:child};
  class MockDate extends Date {static now(){return now}}
  vm.runInNewContext(code,{window,document,location:{hostname,pathname:path,search:query},performance:{timeOrigin:now-elapsed},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Date:MockDate,URLSearchParams,setTimeout:(f,ms)=>{const t={f,ms};timers.push(t);return t},clearTimeout(){},AbortSignal,MutationObserver:class {constructor(fn){} observe(){}},fetch:fetcher});
  return {window,document,root,submit,form,email,child,message,listeners,timers,tick:async ms=>{now+=ms;await timers.shift()?.f()}};
}

let f=fixture();assert.equal(f.timers[0].ms,30000);await f.tick(30000);assert(!f.root.classes.has('is-hidden'));
let calls=[];
f=fixture({fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({message:'Bitte bestätige deine E-Mail.'})};}});
f.email.value='test@example.invalid';f.window.open=()=>{throw Error('No new window allowed')};
await f.listeners.submit({target:f.form,preventDefault(){},stopImmediatePropagation(){}});
assert.equal(calls.length,1);assert.equal(calls[0].url,'/newsletter-service/api/signup');assert.equal(calls[0].options.credentials,'same-origin');assert.equal(JSON.parse(calls[0].options.body).consent,true);assert.equal(f.submit.disabled,true);assert.match(f.message.textContent,/bestätige/);
await f.listeners.submit({target:f.form,preventDefault(){},stopImmediatePropagation(){}});assert.equal(calls.length,1);
f=fixture({fetcher:async()=>({ok:false,json:async()=>({error:'Noch nicht verfügbar.'})})});f.email.value='test@example.invalid';await f.listeners.submit({target:f.form,preventDefault(){},stopImmediatePropagation(){}});assert.equal(f.submit.disabled,false);assert.equal(f.message.textContent,'Noch nicht verfügbar.');
assert(!code.includes('window.open'));assert(!code.includes('postMessage'));assert(!code.includes('preview_theme_id'));
console.log('PASS: inline same-origin signup, no new window, 30s timing, no false success on server error, duplicate prevention.');
