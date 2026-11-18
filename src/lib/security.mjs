export const consentVersion = 'newsletter-2026-11-18';
export const acknowledgement = 'Bitte prüfe deine E-Mails. Falls eine Bestätigung erforderlich ist, erhältst du einen Link zur Anmeldung.';
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
export function validOrigin(request, env) {
  return request.headers.get('Origin') === env.PUBLIC_ORIGIN && new URL(request.url).origin === env.PUBLIC_ORIGIN;
}
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email) ? email : null;
}
export async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function newToken() { return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join(''); }
export function validToken(token) { return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token); }
export async function rateLimit(db, key, maximum, seconds, now) {
  const row = await db.prepare('INSERT INTO limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN limits.expires<=? THEN 1 ELSE limits.count+1 END, expires=CASE WHEN limits.expires<=? THEN excluded.expires ELSE limits.expires END RETURNING count').bind(key, now+seconds, now, now).first();
  return row.count <= maximum;
}
export async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw Error('INPUT');
  const text = await request.text();
  if (text.length > 2048) throw Error('INPUT');
  return JSON.parse(text);
}
export function ready(env) {
  return env.ENABLED === 'true' && env.PUBLIC_ORIGIN?.startsWith('https://') && env.DB && env.SHOPIFY_ADMIN_TOKEN && env.RATE_LIMIT_SECRET?.length >= 32 && /^[a-z0-9-]+\.kasserver\.com$/i.test(env.SMTP_HOST||'') && env.SMTP_USERNAME && env.SMTP_PASSWORD && normalizeEmail(env.MAIL_FROM);
}
