import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEmail,newToken,hash,validOrigin,ready} from '../src/lib/security.mjs';
import {mime,sendSmtp} from '../src/lib/smtp.mjs';
import {signup,confirm} from '../src/lib/handlers.mjs';
import {pendingCustomer,consentMutation,accessToken} from '../src/lib/shopify.mjs';
test('strict email/origin validation and random hashed tokens',async()=>{
  assert.equal(normalizeEmail(' TEST+shop@Example.com '),'test+shop@example.com');
  for(const email of ['a@b','a@b.com\r\nBcc: victim@example.com','bad <a@b.com>'])assert.equal(normalizeEmail(email),null);
  const token=newToken();assert.equal(token.length,64);assert.notEqual(token,newToken());assert.equal((await hash(token)).length,64);
  assert.equal(validOrigin(new Request('https://eyequipment.webflow.io/newsletter-service/api/signup',{headers:{Origin:'https://eyequipment.com.attacker.invalid'}}),{PUBLIC_ORIGIN:'https://eyequipment.webflow.io'}),false);
});
test('no success acknowledgement when server is not configured',async()=>{
  const request=new Request('https://eyequipment.webflow.io/newsletter-service/api/signup',{method:'POST',headers:{Origin:'https://eyequipment.webflow.io','Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',consent:true})});
  assert.equal(ready({}),false);const response=await signup(request,{PUBLIC_ORIGIN:'https://eyequipment.webflow.io'});assert.equal(response.status,503);assert.match((await response.json()).error,/nicht verfügbar/);
});
test('already subscribed customer is preserved without mutations or duplicate welcome reset',async()=>{
  let calls=0;const customer=await pendingCustomer({SHOPIFY_ADMIN_TOKEN:'test'},'test@example.com',async(url,options)=>{calls++;assert(!JSON.parse(options.body).query.includes('mutation'));return Response.json({data:{customers:{nodes:[{id:'gid://shopify/Customer/1',defaultEmailAddress:{emailAddress:'test@example.com',marketingState:'SUBSCRIBED'}}]}}});});assert.equal(customer,null);assert.equal(calls,1);
});
test('new customer is pending until proof of mailbox control',async()=>{
  const requests=[];await pendingCustomer({SHOPIFY_ADMIN_TOKEN:'test'},'test@example.com',async(url,options)=>{const data=JSON.parse(options.body);requests.push(data);return requests.length===1?Response.json({data:{customers:{nodes:[]}}}):Response.json({data:{customerCreate:{customer:{id:'gid://shopify/Customer/1'},userErrors:[]}}});});
  assert.equal(requests[1].variables.input.emailMarketingConsent.marketingState,'PENDING');assert.deepEqual(requests[1].variables.input.tags,['newsletter']);
});
test('own-store client credentials are server-side and reuse a valid expiring token',async()=>{
  let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(new URLSearchParams(options.body).get('grant_type'),'client_credentials');return Response.json({access_token:'test-only-token',expires_in:86399});};
  const env={SHOPIFY_CLIENT_ID:'test-client',SHOPIFY_CLIENT_SECRET:'test-secret'};
  assert.equal(await accessToken(env,fetcher),'test-only-token');assert.equal(await accessToken(env,fetcher),'test-only-token');assert.equal(calls,1);
});
test('reused or expired confirmation cannot reach Shopify',async()=>{
  const env={ENABLED:'true',PUBLIC_ORIGIN:'https://eyequipment.webflow.io',SHOPIFY_ADMIN_TOKEN:'test',RATE_LIMIT_SECRET:'x'.repeat(32),SMTP_HOST:'w0123456.kasserver.com',SMTP_USERNAME:'test',SMTP_PASSWORD:'test',MAIL_FROM:'info@eyequipment.com',DB:{prepare(){return {bind(){return this;},async first(){return null;}}}}};
  const response=await confirm(new Request(env.PUBLIC_ORIGIN+'/newsletter-service/api/confirm',{method:'POST',headers:{Origin:env.PUBLIC_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({token:'a'.repeat(64)})}),env);assert.equal(response.status,409);
});
test('MIME safely encodes Unicode content and rejects header injection',()=>{
  const mail={to:'test@example.com',subject:'Bestätigen',text:'Text',html:'<p>Hallo</p>'};const message=mime({MAIL_FROM:'info@eyequipment.com'},mail);assert.match(message,/Subject: =\?UTF-8\?B\?/);assert.match(message,/multipart\/alternative/);assert.throws(()=>mime({MAIL_FROM:'info@eyequipment.com\r\nBcc: test@example.com'},mail));
});
test('missing proxy IP still enforces durable global and email limits before Shopify',async()=>{
  const keys=[];const db={prepare(){return {args:[],bind(...args){this.args=args;return this;},async first(){keys.push(this.args[0]);return {count:1};},async run(){}};}};
  const env={ENABLED:'true',PUBLIC_ORIGIN:'https://eyequipment.webflow.io',DB:db,SHOPIFY_ADMIN_TOKEN:'test',RATE_LIMIT_SECRET:'x'.repeat(32),SMTP_HOST:'w0123456.kasserver.com',SMTP_USERNAME:'test',SMTP_PASSWORD:'test',MAIL_FROM:'info@eyequipment.com'};
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({data:{customers:{nodes:[{id:'gid://shopify/Customer/1',defaultEmailAddress:{emailAddress:'test@example.com',marketingState:'SUBSCRIBED'}}]}}});
  try {
    const response=await signup(new Request(env.PUBLIC_ORIGIN+'/newsletter-service/api/signup',{method:'POST',headers:{Origin:env.PUBLIC_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',consent:true})}),env);
    assert.equal(response.status,200);assert.equal(keys[0],'global-signups');assert.match(keys[1],/^email:/);
  } finally {globalThis.fetch=previous;}
});
test('SMTP uses TLS, waits for DATA acceptance, and fails on server rejection',async()=>{
  async function run(reject=false){const commands=[];let controller;const socket={opened:Promise.resolve(),readable:new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode('220 ready\r\n'));}}),writable:new WritableStream({write(bytes){const text=new TextDecoder().decode(bytes);commands.push(text);const n=commands.length;const reply=n===1?'250-server\r\n250 AUTH LOGIN':n===2||n===3?'334 challenge':n===4?'235 ok':n===5?'250 ok':n===6?(reject?'550 denied':'250 ok'):n===7?'354 data':n===8?'250 accepted':null;if(reply)controller.enqueue(new TextEncoder().encode(reply+'\r\n'));}}),async close(){}};const promise=sendSmtp({SMTP_HOST:'w0123456.kasserver.com',SMTP_USERNAME:'user',SMTP_PASSWORD:'secret',MAIL_FROM:'info@eyequipment.com'},{to:'test@example.com',subject:'Hallo',text:'Text',html:'<p>Text</p>'},(address,options)=>{assert.equal(address.port,465);assert.equal(options.secureTransport,'on');return socket;});if(reject)await assert.rejects(promise,/SMTP_REJECTED/);else await promise;return commands;}
  const commands=await run();assert.equal(commands.at(-1),'QUIT\r\n');assert.match(commands[7],/Content-Type: multipart/);await run(true);
});
