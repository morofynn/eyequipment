export function confirmationMail(email, link) {
  return {
    to:email, subject:'Bestätige deine Newsletter-Anmeldung bei eyequipment',
    text:`Bitte bestätige deine Newsletter-Anmeldung: ${link}\nDer Link gilt 24 Stunden. Wenn du dich nicht angemeldet hast, ignoriere diese Mail.`,
    html:`<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff;color:#000;font-family:Arial,sans-serif"><table role="presentation" width="100%" style="width:100%;table-layout:fixed;border-collapse:collapse"><tr><td align="center" style="padding:32px 20px"><div style="max-width:520px;margin:auto"><p style="font-family:Georgia,serif;font-size:38px;text-align:center;margin:0 0 40px">eyequipment</p><h1 style="font-size:28px;line-height:1.2;text-align:center">Bestätige deine Anmeldung</h1><p style="font-size:16px;line-height:1.6;text-align:center">Ein Klick fehlt noch: Bestätige deine E-Mail-Adresse, um unseren Newsletter zu erhalten.</p><p style="text-align:center;margin:28px 0"><a href="${link}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:18px 24px;border-radius:999px;font-weight:bold">Newsletter bestätigen</a></p><p style="font-size:14px;line-height:1.6;text-align:center">Der Link gilt 24 Stunden. Wenn du dich nicht angemeldet hast, kannst du diese E-Mail ignorieren.</p></div></td></tr><tr><td style="background:#000;color:#fff;padding:28px 20px;text-align:center;font-size:14px;line-height:1.6">Fragen? <a style="color:#fff" href="mailto:info@eyequipment.com">info@eyequipment.com</a></td></tr></table></body></html>`
  };
}
export async function sendConfirmation(env, email, link, fetcher=fetch) {
  const { connect }=await import('cloudflare:sockets');
  const { sendSmtp }=await import('./smtp.mjs');
  await sendSmtp(env,confirmationMail(email,link),connect);
}
