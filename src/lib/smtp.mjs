function base64(value) { return btoa(String.fromCharCode(...new TextEncoder().encode(value))); }
function encodedBody(value) { return base64(value).match(/.{1,76}/g).join('\r\n'); }
export function mime(env, mail) {
  const boundary='eq_'+crypto.randomUUID().replaceAll('-','');
  if (!/^[^\s<>\r\n]+@[^\s<>\r\n]+$/.test(env.MAIL_FROM)||! /^[^\s<>\r\n]+@[^\s<>\r\n]+$/.test(mail.to)) throw Error('SMTP_INPUT');
  return [
    `From: eyequipment <${env.MAIL_FROM}>`,`To: <${mail.to}>`,
    `Subject: =?UTF-8?B?${base64(mail.subject)}?=`,`Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@eyequipment.com>`,'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,'',
    `--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encodedBody(mail.text),
    `--${boundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',encodedBody(mail.html),
    `--${boundary}--`,''
  ].join('\r\n');
}
export async function sendSmtp(env,mail,connect) {
  if (!/^[a-z0-9-]+\.kasserver\.com$/i.test(env.SMTP_HOST||'')) throw Error('SMTP_HOST');
  const socket=connect({hostname:env.SMTP_HOST,port:465},{secureTransport:'on'});
  let timer;
  const work=async()=>{
    await socket.opened;
    const reader=socket.readable.getReader(),writer=socket.writable.getWriter();
    let buffer='';const decoder=new TextDecoder();
    async function reply(expected) {
      let count=0;
      while(true) {
        const end=buffer.indexOf('\r\n');
        if(end<0){const chunk=await reader.read();if(chunk.done)throw Error('SMTP_CLOSED');buffer+=decoder.decode(chunk.value,{stream:true});if(buffer.length>16384)throw Error('SMTP_REPLY');continue;}
        const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(++count>100||!/^\d{3}[ -]/.test(line))throw Error('SMTP_REPLY');
        if(line[3]==='-')continue;
        if(!expected.includes(Number(line.slice(0,3))))throw Error('SMTP_REJECTED');
        return;
      }
    }
    async function command(text,expected){await writer.write(new TextEncoder().encode(text+'\r\n'));await reply(expected);}
    await reply([220]);await command('EHLO eyequipment.com',[250]);
    await command('AUTH LOGIN',[334]);await command(base64(env.SMTP_USERNAME),[334]);await command(base64(env.SMTP_PASSWORD),[235]);
    await command(`MAIL FROM:<${env.MAIL_FROM}>`,[250]);await command(`RCPT TO:<${mail.to}>`,[250,251]);await command('DATA',[354]);
    await writer.write(new TextEncoder().encode(mime(env,mail).replace(/(^|\r\n)\./g,'$1..')+'\r\n.\r\n'));await reply([250]);
    // Delivery was accepted; a missing QUIT reply must not turn this into a failed signup.
    await writer.write(new TextEncoder().encode('QUIT\r\n')).catch(()=>{});
  };
  try {await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{socket.close().catch(()=>{});reject(Error('SMTP_TIMEOUT'));},15000);})]);}
  finally {clearTimeout(timer);await socket.close().catch(()=>{});}
}
