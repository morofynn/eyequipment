import {json,ready,validOrigin,normalizeEmail,hash,newToken,validToken,rateLimit,body,acknowledgement,consentVersion} from './security.mjs';
import {pendingCustomer,graphql,statusQuery,consent} from './shopify.mjs';
import {sendConfirmation} from './mail.mjs';
export async function signup(request,env) {
  if (!validOrigin(request,env)) return json({error:'Anfrage nicht erlaubt.'},403);
  if (!ready(env)) return json({error:'Die Anmeldung ist vorübergehend nicht verfügbar. Bitte versuche es später erneut.'},503);
  let input;
  try { input=await body(request); } catch { return json({error:'Bitte prüfe deine Eingabe.'},400); }
  const email=normalizeEmail(input.email);
  if (!email || input.consent!==true) return json({error:'Bitte gib eine gültige E-Mail-Adresse ein und bestätige die Anmeldung.'},400);
  if (input.website) return json({message:acknowledgement});
  const db=env.DB, now=Math.floor(Date.now()/1000);
  try {
    if (!await rateLimit(db,'global-signups',30,3600,now)) return json({error:'Bitte versuche es später erneut.'},429);
    const ip=request.headers.get('CF-Connecting-IP');
    const emailKey=await hash(env.RATE_LIMIT_SECRET+':'+email);
    if (ip && !await rateLimit(db,'ip:'+await hash(env.RATE_LIMIT_SECRET+':'+ip),8,3600,now)) return json({error:'Bitte versuche es später erneut.'},429);
    if (!await rateLimit(db,'email:'+emailKey,1,900,now)) return json({message:acknowledgement});
    await db.prepare('DELETE FROM confirmations WHERE expires<?').bind(now).run();
    await db.prepare('DELETE FROM limits WHERE expires<?').bind(now).run();
    const customerId=await pendingCustomer(env,email);
    if (!customerId) return json({message:acknowledgement});
    const token=newToken(), tokenHash=await hash(token);
    await db.prepare('DELETE FROM confirmations WHERE email_hash=?').bind(emailKey).run();
    await db.prepare('INSERT INTO confirmations(token_hash,customer_id,email_hash,consent_version,created,expires) VALUES (?,?,?,?,?,?)').bind(tokenHash,customerId,emailKey,consentVersion,now,now+86400).run();
    const link=new URL((env.MOUNT_PATH || '/newsletter-service')+'/confirm',env.PUBLIC_ORIGIN);link.hash='token='+token;
    try { await sendConfirmation(env,email,link.href); }
    catch {
      await db.prepare('DELETE FROM confirmations WHERE token_hash=?').bind(tokenHash).run();
      await db.prepare('DELETE FROM limits WHERE key=?').bind('email:'+emailKey).run();
      return json({error:'Die Bestätigungsmail konnte nicht versendet werden. Bitte versuche es später erneut.'},503);
    }
    return json({message:acknowledgement});
  } catch(error) {
    const code=['SHOPIFY','SHOPIFY_AUTH'].includes(error?.message)?error.message:'STORAGE_OR_RUNTIME';
    console.warn('newsletter_signup_failed',code);
    return json({error:'Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es später erneut.'},503);
  }
}
export async function confirm(request,env) {
  if (!validOrigin(request,env)) return json({error:'Anfrage nicht erlaubt.'},403);
  if (!ready(env)) return json({error:'Bitte versuche es später erneut.'},503);
  let input;
  try {input=await body(request);} catch {return json({error:'Ungültiger Bestätigungslink.'},400);}
  if (!validToken(input.token)) return json({error:'Ungültiger Bestätigungslink.'},400);
  const db=env.DB, now=Math.floor(Date.now()/1000), key=await hash(input.token);
  try {
    const row=await db.prepare("UPDATE confirmations SET state='processing',lease=? WHERE token_hash=? AND expires>? AND state!='confirmed' AND lease<? RETURNING customer_id").bind(now+60,key,now,now).first();
    if (!row) return json({error:'Dieser Link ist abgelaufen, wurde bereits verwendet oder wird gerade verarbeitet.'},409);
    try {
      const result=await graphql(env,statusQuery,{id:row.customer_id});
      const state=result.customer?.defaultEmailAddress?.marketingState;
      if (state==='PENDING') await consent(env,row.customer_id,'SUBSCRIBED');
      else if (state!=='SUBSCRIBED') throw Error('REVOKED');
      await db.prepare("UPDATE confirmations SET state='confirmed',confirmed=?,lease=0 WHERE token_hash=?").bind(now,key).run();
      return json({message:'Deine Newsletter-Anmeldung ist bestätigt. Vielen Dank!'});
    } catch {
      await db.prepare("UPDATE confirmations SET state='pending',lease=0 WHERE token_hash=?").bind(key).run();
      return json({error:'Die Bestätigung konnte nicht abgeschlossen werden. Bitte versuche es erneut oder melde dich neu an.'},503);
    }
  } catch {return json({error:'Bitte versuche es später erneut.'},503);}
}
