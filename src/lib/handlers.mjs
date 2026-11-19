import {json,ready,validOrigin,normalizeEmail,hash,rateLimit,body,acknowledgement} from './security.mjs';
import {subscribeCustomer} from './shopify.mjs';
export async function signup(request,env) {
  if (!validOrigin(request,env)) return json({error:'Anfrage nicht erlaubt.'},403);
  if (!ready(env)) return json({error:'Die Anmeldung ist vorübergehend nicht verfügbar. Bitte versuche es später erneut.'},503);
  let input;
  try { input=await body(request); } catch { return json({error:'Bitte prüfe deine Eingabe.'},400); }
  const email=normalizeEmail(input.email);
  if (!email || input.consent!==true) return json({error:'Bitte gib eine gültige E-Mail-Adresse ein und bestätige die Anmeldung.'},400);
  if (input.website) return json({message:acknowledgement});
  const db=env.DB, now=Math.floor(Date.now()/1000);
  let reservedEmailKey;
  try {
    if (!await rateLimit(db,'global-signups',30,3600,now)) return json({error:'Bitte versuche es später erneut.'},429);
    const ip=request.headers.get('CF-Connecting-IP');
    const emailKey=await hash(env.RATE_LIMIT_SECRET+':'+email);
    if (ip && !await rateLimit(db,'ip:'+await hash(env.RATE_LIMIT_SECRET+':'+ip),8,3600,now)) return json({error:'Bitte versuche es später erneut.'},429);
    if (!await rateLimit(db,'email:'+emailKey,1,900,now)) return json({message:acknowledgement});
    reservedEmailKey='email:'+emailKey;
    await db.prepare('DELETE FROM limits WHERE expires<?').bind(now).run();
    await subscribeCustomer(env,email);
    return json({message:acknowledgement});
  } catch(error) {
    if (reservedEmailKey) await db.prepare('DELETE FROM limits WHERE key=?').bind(reservedEmailKey).run().catch(()=>{});
    const code=['SHOPIFY','SHOPIFY_AUTH'].includes(error?.message)?error.message:'STORAGE_OR_RUNTIME';
    console.warn('newsletter_signup_failed',code);
    return json({error:'Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es später erneut.'},503);
  }
}
