(() => {
  'use strict';
  if (window.EyequipmentAssistant || window !== window.top) return;
  const script = document.currentScript;
  const config = { apiVersion: '2026-07', ...window.EyequipmentAssistantConfig };
  const assets = script?.src ? new URL('.', script.src) : new URL('./', location.href);
  const query = `query AssistantProducts($after: String) {
    products(first: 100, after: $after, query: "tag_not:B2B") {
      nodes { id handle title productType description descriptionHtml tags availableForSale
        relatedProducts: metafield(namespace: "shopyflow--recommendation", key: "related_products") { value }
        featuredImage { url altText } priceRange { minVariantPrice { amount currencyCode } }
      } pageInfo { hasNextPage endCursor }
    }
  }`;
  const text = el => el?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const safe = (value, base = location.href) => {
    try { const u = new URL(value, base); return u.origin === location.origin && /^https?:$/.test(u.protocol) ? u : null; } catch { return null; }
  };
  function instagramURL(value) {
    try{const u=new URL(value);return u.protocol==='https:'&&['instagram.com','www.instagram.com'].includes(u.hostname)&&!u.username&&!u.password?u:null;}catch{return null;}
  }
  function instagramLink() {
    return [...document.querySelectorAll('a[href]')].map(a=>instagramURL(a.getAttribute('href'))).find(Boolean)?.href;
  }
  async function request(url, options = {}) {
    const r = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('Daten nicht erreichbar');
    return r;
  }
  async function page(url) {
    const u = safe(url); if (!u) throw new Error('Ungültige Seite');
    if(restoring && resumePages.has(u.href))return resumePages.get(u.href);
    const r = await request(u.href, { cache: 'no-cache' });
    const doc=new DOMParser().parseFromString(await r.text(), 'text/html');
    if(restoring)resumePages.set(u.href,doc); return doc;
  }
  function navigation(doc) {
    const found = new Map();
    doc.querySelectorAll('nav a[href], footer a[href], .footer-link[href], .navbar-link[href]').forEach(a => {
      const u = safe(a.getAttribute('href')); const title = text(a);
      if (u && title && !u.search && !u.hash && u.pathname !== '/') found.set(u.pathname, { title, url: u.pathname });
    });
    return [...found.values()];
  }
  let nav = navigation(document), catalog = null, selected = null, ticket = 0;
  let steps = [], restoring = false, resumePages = new Map(), saveTimer = 0, contextCollapsed = false;
  const sessionKey = 'eyequipment-assistant-session-v3';
  function readSession() {
    try {
      const state = JSON.parse(sessionStorage.getItem(sessionKey));
      if (state?.version !== 3 || !Number.isFinite(state.updated) || typeof state.open!=='boolean' || Date.now()-state.updated > 30*60*1000 || !Array.isArray(state.steps) || state.steps.length > 128 || state.steps.some(s=>!['choice','info','more','context'].includes(s.kind)||(s.orderSeed!==undefined&&(!Number.isInteger(s.orderSeed)||s.orderSeed<0||s.orderSeed>4294967295))||typeof s.label!=='string'||s.label.length>200||(s.kind==='context'&&(!/^\d+$/.test(s.productId||'')||!['related','question'].includes(s.action))))) return null;
      const aliases={'Passende Ergänzung finden':'Match finden','Passende Kombination finden':'Ein Match finden','Andere Kombination finden':'Anderes Match finden','Passende Kombination dazu':'Match dazu finden'};
      return {...state,steps:state.steps.map(step=>({...step,label:aliases[step.label]||step.label.replace(/^Kombination für /,'Match für ')}))};
    } catch { return null; }
  }
  function saveSession() {
    if (restoring || !feed.childElementCount) return;
    try { sessionStorage.setItem(sessionKey,JSON.stringify({version:3,updated:Date.now(),open:panelOpen,contextCollapsed,steps,scroll:feed.scrollTop,selected:selected?{title:selected.title,url:selected.url}:null})); } catch {}
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer=setTimeout(saveSession,120); }
  const findPage = (pattern, fallback) => nav.find(n => pattern.test(n.title + ' ' + n.url))?.url || fallback;
  const host = document.createElement('div'); host.id = 'eyequipment-assistant';
  host.style.cssText = 'position:relative;z-index:90;';
  host.style.setProperty('--eq-assistant-font', getComputedStyle(document.body).fontFamily);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<link rel="stylesheet" href="${new URL('assistant.css', assets).href}"><button class="launcher" aria-label="eyequipment Assistent öffnen" aria-expanded="false" aria-controls="eq-panel"><span class="orb" aria-hidden="true"></span><span class="launcher-label">Frag eyequipment</span><span class="notification-badge" hidden aria-hidden="true">1</span></button><section class="panel" id="eq-panel" role="dialog" tabindex="-1" aria-label="eyequipment Assistent" hidden><header class="head"><span class="avatar" aria-hidden="true"><span class="orb"></span></span><div><div class="brand">eyequipment</div><div class="sub">Schön, dass du da bist.</div></div><button class="close" aria-label="Schließen">×</button></header><div class="feed" aria-live="polite" aria-relevant="additions"></div><footer class="foot"><button class="back" hidden><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m8 5-5 5 5 5M3 10h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Zurück</span></button><button class="restart"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 7a7 7 0 1 1-.7 6M4 3v4h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Noch mal von vorne</span></button></footer></section>`;
  if (config.styles) { root.querySelector('link').remove(); const style = document.createElement('style'); style.textContent = config.styles; root.prepend(style); }
  document.body.append(host);
  const feed = root.querySelector('.feed'), panel = root.querySelector('.panel'), launcher = root.querySelector('.launcher');
  let panelOpen=false,closeTimer=0;
  function element(tag, cls, content) { const el = document.createElement(tag); if (cls) el.className = cls; if (content) el.textContent = content; return el; }
  function bubble(content, user = false) { feed.append(element('div', user ? 'bubble user' : 'bubble', content)); feed.scrollTop = feed.scrollHeight; }
  function productInformation(p) {
    const box=element('div','bubble product-information');box.append(element('h3','',p.title));
    const doc=new DOMParser().parseFromString(p.descriptionHtml||'', 'text/html');
    doc.querySelectorAll('script,style,iframe,form,img,svg').forEach(el=>el.remove());
    const sections=new Map();let heading='Beschreibung';
    const add=(value,list=false)=>{value=value.replace(/\s+/g,' ').trim();if(!value)return;const values=sections.get(heading)||[];if(!values.some(v=>v.value===value))values.push({value,list});sections.set(heading,values);};
    const normalize=value=>/^(Beschreibung|Details|Informationen|Anwendung|Pflege)\s*:?$/i.test(value.trim())?({informationen:'Anwendung'}[value.trim().replace(/:$/,'').toLowerCase()]||value.trim().replace(/:$/,'')):null;
    function walk(node){
      if(node.nodeType===3){add(node.textContent);return;}
      if(node.nodeType!==1)return;
      const value=text(node),label=normalize(value);
      if(/^H[1-6]$/.test(node.tagName)||label){heading=label||value;return;}
      if(['P','LI'].includes(node.tagName)){
        if(node.querySelector('br')){node.innerHTML.split(/<br\s*\/?\s*>/i).forEach(part=>{const fragment=new DOMParser().parseFromString(part,'text/html');const line=text(fragment.body),title=normalize(line);if(title)heading=title;else {if(/^Pflege, was du liebst/i.test(line))heading='Pflege';add(line,node.tagName==='LI'||/^[–—-]/.test(line));}});}
        else add(value,node.tagName==='LI'&&!/^(Größe|Material|Farbe|Muster)\s*:/i.test(value));return;
      }
      if(node.tagName==='TR'){add([...node.children].map(text).join(': '));return;}
      [...node.childNodes].forEach(walk);
    }
    [...doc.body.childNodes].forEach(walk);
    if(!sections.size)add(p.description||'Alles Wissenswerte findest du auf der Produktseite.');
    const all=[...sections.values()].flat().map(v=>v.value).join(' ').toLowerCase();
    const extra=['Größe','Material','Farbe','Muster'].flatMap(name=>{const values=attributes(p,name);return values.length&&!all.includes(name.toLowerCase()+':')?[{value:name+': '+values.join(', '),list:false}]:[];});
    if(extra.length)sections.set('Details',[...(sections.get('Details')||[]),...extra]);
    for(const [title,values] of sections){if(!values.length)continue;const section=element('section');section.append(element('h4','',title));let list=null;
      values.forEach(({value,list:bullet})=>{if(bullet){if(!list){list=element('ul');section.append(list);}list.append(element('li','',value.replace(/^[–—-]\s*/,'')));}else{list=null;const detail=value.match(/^(Größe|Material|Farbe|Muster)\s*:\s*(.+)$/i);if(detail){const row=element('p','detail-row');row.append(element('strong','',detail[1]+':'),document.createTextNode(' '+detail[2]));section.append(row);}else section.append(element('p','',value));}});box.append(section);
    }
    feed.append(box);feed.scrollTop=feed.scrollHeight;return box;
  }
  const newsletterKey='eq-assistant-newsletter-until-v2',welcomeKey='eq-assistant-welcome-read-v1',pendingNewsletterKey='eq-assistant-newsletter-pending-v2',visitKey='eq-assistant-visit-v1';
  const badge=root.querySelector('.notification-badge');let newsletterPending=false,welcomeUnread=false,welcomeArrived=false;
  const cartNotesKey='eq-assistant-cart-notes-v1';let cartNotes=[];
  const milestoneKey='eq-assistant-cart-milestones-v1';let milestones=[],milestoneSeen={};
  try{const saved=JSON.parse(sessionStorage.getItem(milestoneKey)||'{}');milestones=(saved.notes||[]).filter(n=>['shipping','minimum','wishlist'].includes(n.kind)&&typeof n.id==='string'&&Number.isFinite(n.created)&&Date.now()-n.created<30*60000&&typeof n.unread==='boolean'&&Number.isFinite(n.threshold)&&typeof n.currency==='string').slice(-5);milestoneSeen=saved.seen&&typeof saved.seen==='object'?saved.seen:{};}catch{}
  function saveMilestones(){try{sessionStorage.setItem(milestoneKey,JSON.stringify({notes:milestones,seen:milestoneSeen}));}catch{}}
  let noticeTiming={last:0,suggestion:0};try{noticeTiming={...noticeTiming,...JSON.parse(sessionStorage.getItem('eq-assistant-notice-timing-v1')||'{}')};}catch{}
  let noticeVersion=0;
  function noticeSent(suggestion=false){noticeVersion++;noticeTiming.last=Date.now();if(suggestion)noticeTiming.suggestion=Date.now();try{sessionStorage.setItem('eq-assistant-notice-timing-v1',JSON.stringify(noticeTiming));}catch{}}
  function focusNotice(section){requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!panelOpen||!section.isConnected)return;feed.scrollTop+=section.getBoundingClientRect().top-feed.getBoundingClientRect().top-6;if(reducedMotion())return;section._arrivalAnimation?.cancel();section._arrivalAnimation=section.animate([{opacity:0,transform:'translateY(8px) scale(.97)'},{opacity:1,transform:'translateY(-2px) scale(1)',offset:.7},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:440,delay:240,fill:'backwards',easing:'cubic-bezier(.22,1,.36,1)'});}));}
  function deferNewsletter(){if(!newsletterPending)return;newsletterPending=false;visit.notified=false;try{sessionStorage.removeItem(pendingNewsletterKey);localStorage.removeItem(newsletterKey);}catch{}touchVisit();}
  async function wishlistIds(){try{const value=await Promise.race([window.ShopyflowWishlist?.getWishlist?.(),new Promise(resolve=>setTimeout(()=>resolve(null),2500))]);return new Set((Array.isArray(value)?value:value?.productIds||[]).map(id=>String(id).split('/').pop()));}catch{return new Set();}}
  const cartUnread=()=>cartNotes.some(n=>n.unread)||milestones.some(n=>n.unread);
  try{const saved=JSON.parse(sessionStorage.getItem(cartNotesKey)||'[]');if(Array.isArray(saved))cartNotes=saved.filter(n=>n&&typeof n.id==='string'&&/^\d+$/.test(n.sourceId)&&Number.isFinite(n.created)&&Date.now()-n.created<30*60000&&typeof n.unread==='boolean'&&Array.isArray(n.offers)&&n.offers.length<=2&&n.offers.every(o=>/^\d+$/.test(o.id)&&['match','best','wish'].includes(o.role))).slice(-5);}catch{}
  function saveCartNotes(){try{sessionStorage.setItem(cartNotesKey,JSON.stringify(cartNotes));}catch{}}
  const stored=(key)=>{try{return localStorage.getItem(key);}catch{return null;}};
  const remember=(key,value)=>{try{localStorage.setItem(key,String(value));return true;}catch{return false;}};
  welcomeUnread=!stored(welcomeKey);try{newsletterPending=sessionStorage.getItem(pendingNewsletterKey)==='1'&&Number(stored(newsletterKey))>Date.now()&&newsletterEligible();}catch{}
  function newsletterEligible(){
    if(document.documentElement.dataset.nativeB2b==='true'||window.EyequipmentNativeB2B?.isB2B===true)return false;
    const statuses=[...document.querySelectorAll('[data-eq-newsletter-member-status],[data-newsletter-status]')].map(text).join(' ');
    if(/bereits angemeldet|erfolgreich abonniert|bestätige.*(?:Anmeldung|E-Mail)|Fast geschafft|SUBSCRIBED|PENDING/i.test(statuses))return false;
    // The existing account integration owns authentication and marketing consent.
    // Do not prompt signed-in customers while their consent state is unknown.
    let signedIn=false;try{const auth=JSON.parse(stored('_sf_oauth_tokens')||'null');signedIn=!!auth?.tokens?.access_token&&Number(auth.expiresAt)>Date.now();}catch{}
    return !signedIn||/noch nicht angemeldet|Jetzt abonnieren/.test(statuses);
  }
  function updateBadge(){const count=cartNotes.filter(n=>n.unread).length+milestones.filter(n=>n.unread).length+Number(welcomeUnread&&welcomeArrived)+Number(newsletterPending);badge.textContent=String(Math.min(9,count)||1);badge.hidden=panelOpen||!count;if(!panelOpen)launcher.setAttribute('aria-label','eyequipment Assistent öffnen'+(!badge.hidden?' – neue Nachricht':''));}
  function newsletterInvite(){
    if(restoring){more();return;}
    newsletterPending=false;try{sessionStorage.removeItem(pendingNewsletterKey);}catch{}updateBadge();if(!newsletterEligible())return;
    if(feed.querySelector('.newsletter-invitation'))return;
    const invitation=element('div','bubble newsletter-invitation');invitation.append(element('p','','Lust auf neue Designs und Inspiration? Mit unserem Newsletter bleibst du auf dem Laufenden. Möchtest du dich anmelden?'));
    const buttons=element('div','newsletter-actions');
    const yes=element('button','choice choice-primary','Ja, gerne'),no=element('button','choice choice-secondary','Gerade nicht');yes.type=no.type='button';
    yes.onclick=()=>{remember(newsletterKey,Date.now()+86400000);invitation.remove();openNewsletter();};
    no.onclick=()=>{remember(newsletterKey,Date.now()+86400000);invitation.replaceChildren(element('p','','Alles klar! Viel Freude beim Stöbern.'));if(!feed.querySelector('.choices'))more();};buttons.append(yes,no);invitation.append(buttons);feed.append(invitation);feed.scrollTop=feed.scrollHeight;
  }
  async function openedNotification(){welcomeUnread=false;remember(welcomeKey,1);updateBadge();while(restoring)await new Promise(resolve=>setTimeout(resolve,100));await new Promise(resolve=>requestAnimationFrame(resolve));if(!panelOpen)return;await renderCartNotes();if(newsletterPending&&!cartUnread())newsletterInvite();}
  let visit={start:Date.now(),last:Date.now(),notified:false};
  try{const previous=JSON.parse(sessionStorage.getItem(visitKey)||'null');if(previous&&Number.isFinite(previous.start)&&Date.now()-previous.last<30*60000)visit=previous;}catch{}
  const previousSeen=Number(stored('eq-assistant-last-seen-v1'));if(previousSeen>0&&Date.now()-previousSeen>=3*3600000){visit.returning=true;visit.wishlistNotified=false;}
  function touchVisit(){visit.last=Date.now();remember('eq-assistant-last-seen-v1',visit.last);try{sessionStorage.setItem(visitKey,JSON.stringify(visit));}catch{}}
  touchVisit();
  const activity=()=>{if(Date.now()-visit.last>15000)touchVisit();};
  document.addEventListener('pointerdown',activity,{passive:true});document.addEventListener('keydown',activity,{passive:true});document.addEventListener('scroll',activity,{passive:true});
  setTimeout(()=>{welcomeArrived=true;updateBadge();},4000);
  function newsletterNudge(){
    if(visit.notified||Date.now()-noticeTiming.last<120000||cartUnread()||document.hidden||Date.now()-visit.start<30000||!newsletterEligible())return;
    if(!/^\/(?:shop\/?|products\/[^/]+\/?)?$/.test(location.pathname))return;
    if(Number(stored(newsletterKey))>Date.now())return;
    if(document.querySelector('[data-eq-newsletter-promo]:not(.is-hidden)')||restoring||feed.querySelector('.typing,.form-frame'))return;
    if(!remember(newsletterKey,Date.now()+86400000))return;
    visit.notified=true;touchVisit();newsletterPending=true;noticeSent();
    try{sessionStorage.setItem(pendingNewsletterKey,'1');}catch{}
    if(!panelOpen)updateBadge();else newsletterInvite();
  }
  setTimeout(newsletterNudge,Math.max(0,30000-(Date.now()-visit.start)));
  setInterval(()=>{if(!document.hidden)touchVisit();newsletterNudge();},5000);
  new MutationObserver(()=>{if(!newsletterEligible()){newsletterPending=false;feed.querySelector('.newsletter-invitation')?.remove();}updateBadge();}).observe(document.body,{subtree:true,childList:true,characterData:true});
  window.addEventListener('storage',()=>{welcomeUnread=!stored(welcomeKey);if(!newsletterEligible())newsletterPending=false;updateBadge();});
  updateBadge();
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function typing() {
    const el = element('div', 'typing'); el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'eyequipment antwortet');
    for (let i=0;i<3;i++) { const dot=element('span'); dot.setAttribute('aria-hidden','true'); el.append(dot); }
    feed.append(el); feed.scrollTop=feed.scrollHeight; return el;
  }
  async function respond(label, action, kind='choice', detail={}) {
    if(!restoring&&kind!=='more'&&label!=='Noch mal von vorne'&&feed.querySelector('.typing'))return;
    const id=++ticket;
    feed.querySelectorAll('.choices, .chips').forEach(group=>group.remove());
    steps.push({label,kind,...detail,orderSeed:detail.orderSeed??(restoring?0:Math.floor(Math.random()*4294967295)+1)});
    root.querySelector('.back').hidden=!steps.length;
    if(kind!=='more')bubble(label,true);
    if(!restoring){ const dots=typing(); await new Promise(resolve=>setTimeout(resolve,reducedMotion()?0:380)); dots.remove(); }
    if (id===ticket) { await action(); saveSession(); }
  }
  function choices(items, offset=0, layout='list') {
    feed.querySelectorAll('.choices').forEach(group=>group.remove());
    const group = element('div', 'choices '+layout);group.setAttribute('role','group');
    const main=items.filter(item=>!item.secondary), secondary=items.filter(item=>item.secondary);
    const visible=main.slice(offset).concat(secondary);
    visible.forEach(({ label, action, url, external, secondary, primary, heading, preview, kind='choice' }, index) => {
      if(heading)group.append(element('div','group-heading',heading));
      const el = element(url ? 'a' : 'button', 'choice'+(secondary?' choice-secondary':'')+(primary?' choice-primary':''), label);
      if(preview){try{const imageURL=new URL(preview);if(imageURL.protocol==='https:'){const image=element('img','choice-preview');image.src=imageURL.href;image.alt='';image.loading='lazy';image.addEventListener('error',()=>{image.remove();el.classList.remove('choice-with-preview');},{once:true});const caption=element('span','choice-caption',label);el.replaceChildren(image,caption);el.classList.add('choice-with-preview');}}catch{}}
      el.style.setProperty('--delay', `${Math.min(index,6)*30}ms`);
      if (url) { const u = external ? instagramURL(url) : safe(url); if (!u) return; el.href = u.href; if(external){el.target='_blank';el.rel='noopener noreferrer';} el.addEventListener('click',saveSession); }
      else { el.type = 'button'; el._step={label,kind}; el._action=action; el.onclick = () => { if(group.inert||restoring)return; group.inert=true; respond(label,action,kind); }; }
      group.append(el);
    }); feed.append(group); feed.scrollTop = feed.scrollHeight;
  }
  function home() {
    if(!restoring){cartNotes=cartNotes.filter(n=>n.unread);saveCartNotes();milestones=milestones.filter(n=>n.unread);saveMilestones();}
    ticket++; steps=[]; selected = null; feed.replaceChildren(); root.querySelector('.back').hidden=true;
    bubble('Hi, schön, dass du da bist!\nLass uns dein nächstes Lieblingsdesign finden. Oder kann ich dir bei einer Frage helfen?');
    choices([{label:'Lieblingsdesign finden',primary:true,action:discover},{label:'Eine Frage klären',action:help},{label:'Mehr entdecken',action:more}]);
    feed.scrollTop=0; saveSession();
  }
  function discover(){bubble('Wie möchtest du dein Lieblingsdesign entdecken?');choices([{label:'Was passt zu mir?',primary:true,action:()=>products(true)},{label:'Bestseller entdecken',action:bestsellers},{label:'Alle Designs entdecken',action:()=>products()},{label:'Meine gemerkten Designs',secondary:true,url:findPage(/wunschliste/i,'/wunschliste')}]);}
  function help(){bubble('Worum geht es? Ich zeige dir den passenden Weg.');choices([{label:'Anwendung, Pflege & Service',action:faq},{label:'Bestellung oder Problem',action:service},{label:location.pathname.includes('/products/')?'Frage zu diesem Produkt':'Eine Nachricht schreiben',action:()=>{if(location.pathname.includes('/products/'))selected={title:text(document.querySelector('h1')),url:location.pathname};contact(selected?'Produktfrage':'Allgemeine Anfrage');}}]);}
  function openNewsletter(){if(restoring){more();return;}toggle(false);if(window.EyequipmentNewsletterPopup?.open)window.EyequipmentNewsletterPopup.open();else location.href='/?eq_newsletter=1';}
  function more(){bubble('Was möchtest du noch entdecken?');const instagram=instagramLink();choices([{label:'Für Händler',heading:'Weitere Wege',action:dealers},{label:'Seite finden',action:pages},{label:'Über eyequipment',heading:'Inspiration & eyequipment',url:findPage(/.ber-uns/i,'/ueber-uns')},...(instagram?[{label:'Inspiration auf Instagram ↗',url:instagram,external:true}]:[]),{label:'Newsletter',secondary:true,action:openNewsletter}]);}
  async function task(work) {
    const id = ++ticket, loading = typing();
    try { const result = await work(); loading.remove(); return id === ticket ? result : undefined; }
    catch { loading.remove(); if (id === ticket) { bubble('Die Inhalte sind gerade nicht erreichbar. Du kannst die Seite direkt öffnen oder unser Team kontaktieren.'); choices([{label:'Shop öffnen',url:findPage(/shop/i,'/shop')},{label:'Team kontaktieren',action:()=>contact()}]); } }
  }
  async function loadCatalog() {
    if (catalog && Date.now() - catalog.time < 60000) return catalog.items;
    if(!window.shopyflowConfig?.['sf-domain']&&!config.storeDomain)await new Promise(resolve=>{const end=Date.now()+8000;const timer=setInterval(()=>{if(window.shopyflowConfig?.['sf-domain']||Date.now()>end){clearInterval(timer);resolve();}},100);});
    const sf = window.shopyflowConfig || {}, domain = config.storeDomain || sf['sf-domain'], token = config.publicToken || sf['sf-token'];
    if (!domain || !/^[a-z0-9][a-z0-9.-]*\.myshopify\.com$/i.test(domain) || !token) throw new Error('Shopanbindung fehlt');
    const urls = new Map(); let next = findPage(/shop/i,'/shop'); const visited = new Set();
    while (next) {
      const u = safe(next); if (!u || visited.has(u.href)) throw new Error('Ungültige Katalogpagination'); visited.add(u.href);
      const doc = await page(u.href);
      doc.querySelectorAll('a[sf-product][href]').forEach(a => { const link = safe(a.getAttribute('href')); if (link) urls.set(a.getAttribute('sf-product').split('/').pop(),link.pathname); });
      next = doc.querySelector('a.w-pagination-next')?.getAttribute('href');
    }
    let after = null; const items = [], cursors = new Set();
    do {
      const r = await request(`https://${domain}/api/${config.apiVersion}/graphql.json`, {method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Storefront-Access-Token':token},body:JSON.stringify({query,variables:{after}})});
      const json = await r.json(); if (json.errors || !json.data?.products) throw new Error('Produktabfrage fehlgeschlagen');
      const connection = json.data.products;
      connection.nodes.forEach(p => { const url = urls.get(p.id.split('/').pop()); if (url && !p.tags.some(t=>t.toUpperCase()==='B2B')) items.push({...p,url}); });
      after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
      if (after && cursors.has(after)) throw new Error('Ungültige Produktpagination'); if (after) cursors.add(after);
    } while (after);
    catalog = {time:Date.now(),items}; return items;
  }
  function shopLink(type, filters = {}) {
    const url=safe(findPage(/shop/i,'/shop'));
    if(type)url.searchParams.set('eq_category',type);
    if(filters.Muster)url.searchParams.set('eq_pattern',filters.Muster);
    if(filters.Farbe)url.searchParams.set('eq_color',filters.Farbe);
    if(filters.Highlights)url.searchParams.set('eq_highlight',filters.Highlights);
    return url.href;
  }
  function attributes(product, name) {
    return product.tags.filter(tag=>tag.toLocaleLowerCase('de').startsWith(name.toLocaleLowerCase('de')+':')).map(tag=>tag.slice(tag.indexOf(':')+1).trim()).filter(Boolean);
  }
  function productTypes(items){const order=['Tücher','Mäppchen'];return [...new Set(items.map(p=>p.productType).filter(Boolean))].sort((a,b)=>{const ai=order.indexOf(a),bi=order.indexOf(b);return (ai<0?order.length:ai)-(bi<0?order.length:bi)||a.localeCompare(b,'de');});}
  function typePreview(items,type){const candidates=rank(items.filter(p=>p.productType===type&&p.featuredImage?.url));return candidates[0]?.featuredImage.url;}
  async function products(personal = false) {
    const items = await task(loadCatalog); if (!items) return;
    if (!items.length) { bubble('Aktuell habe ich keine verknüpften Produkte gefunden.'); choices([{label:'Shop öffnen',url:findPage(/shop/i,'/shop')}]); return; }
    bubble(personal?'Sehr gerne! Wofür suchst du ein schönes Design?':'Was darf es sein?');
    const types = productTypes(items);
    choices([...types.map(type=>({label:type,preview:typePreview(items,type),action:()=>productPath(items.filter(p=>p.productType===type),type,personal)})),{label:'Ein Match finden',action:()=>preference(items,null,{Kombination:true})},{label:'Ich bin noch offen',secondary:true,action:()=>productPath(items,null,personal)}]);
  }
  function productPath(items,type,personal) {
    if(personal)return preference(items,type);
    bubble('Möchtest du ein paar Vorschläge oder lieber selbst stöbern?');
    choices([{label:'Finde etwas, das zu mir passt',action:()=>preference(items,type)},{label:'Schlag mir ein paar Designs vor',action:()=>showProducts(rank(items),0,type)},{label:'Alle Designs im Shop entdecken',url:shopLink(type)}]);
  }
  const isBestseller = p=>p.tags.some(tag=>/^bestseller$/i.test(tag));
  async function bestsellers() { const items=await task(loadCatalog); if(items)showProducts(rank(items.filter(isBestseller)),0,null,{Highlights:'bestseller'}); }
  function rank(items) {
    let seed=steps.at(-1)?.orderSeed??0;
    if(seed===0)return [...items].sort((a,b)=>Number(b.availableForSale)-Number(a.availableForSale)||Number(isBestseller(b))-Number(isBestseller(a)));
    const shuffled=[...items].sort((a,b)=>a.id.localeCompare(b.id));
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
    for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    // Shuffle once per suggestion action. Pagination reuses this exact array,
    // and saved action seeds reproduce it after reload or back navigation.
    return shuffled.sort((a,b)=>Number(b.availableForSale)-Number(a.availableForSale));
  }
  function preference(items,type,filters={},step=0) {
    const name=step===0?'Muster':'Farbe';
    const values=[...new Set(items.flatMap(p=>attributes(p,name)))].sort((a,b)=>a.localeCompare(b,'de'));
    if(!values.length)return step===0?preference(items,type,filters,1):filters.Kombination?chooseCombination(rank(items),type,filters):showProducts(rank(items),0,type,filters);
    bubble(step===0?'Welche Muster magst du? Such dir etwas aus – oder lass dich überraschen.':'Und welche Farbe gefällt dir? Ich zeige dir nur Farben, die zu deiner bisherigen Auswahl passen.');
    const next=(subset,updated)=>step===0?preference(subset,type,updated,1):updated.Kombination?chooseCombination(rank(subset),type,updated):showProducts(rank(subset),0,type,updated);
    choices([...values.map(value=>({label:value.charAt(0).toLocaleUpperCase('de')+value.slice(1),action:()=>next(items.filter(p=>attributes(p,name).includes(value)),{...filters,[name]:value})})),{label:step===0?'Alle Muster – überrasche mich':'Alle Farben passen',secondary:true,action:()=>next(items,filters)}],0,'selection');
  }
  async function showProducts(items, offset = 0, type = null, filters = {}) {
    if(filters.Kombination){const all=await task(loadCatalog);if(!all)return;items=items.map(p=>all.find(current=>current.id===p.id)).filter(Boolean);}
    const start=feed.scrollHeight;
    if (!items.length) { bubble('Dafür gibt es gerade keine Treffer.'); choices([{label:'Auswahl ändern',action:products},{label:'Team fragen',action:()=>contact('Produktsuche')}]); return; }
    const preferenceText=Object.entries(filters).filter(([key])=>!['Highlights','Kombination'].includes(key)).map(([key,value])=>`${key.toLocaleLowerCase('de')}: ${value}`).join(' · ');
    bubble(offset?'Hier kommen noch ein paar schöne Designs.':`${filters.Highlights==='bestseller'?'Unsere Bestseller – vielleicht ist dein neuer Favorit dabei!':'Diese Designs könnten dir gefallen!'}${preferenceText?'\nDeine Auswahl: '+preferenceText:''}`);
    const chips=Object.entries({Kategorie:type,Muster:filters.Muster,Farbe:filters.Farbe}).filter(([,value])=>value).map(([name,value])=>({label:`${name}: ${value} ✎`,action:()=>editSelection(name,type,filters)}));
    if(chips.length&&!filters.Kombination)choices(chips,0,'chips');
    // Keep editable chips alongside the result actions, with replayable actions.
    const chipGroup=feed.querySelector('.choices.chips'); if(chipGroup)chipGroup.classList.remove('choices');
    const displayed=filters.Kombination?combination(items):items.slice(offset,offset+3);
    if(filters.Kombination)bubble(displayed.length>1?'Dein Match: Tuch und Mäppchen. Die Gemeinsamkeiten stehen bei jedem Vorschlag.':'Für dieses Design finde ich gerade kein verfügbares Match. Du kannst im Shop weiterstöbern oder deine Auswahl ändern.');
    displayed.forEach(p=>{
      const card=element('article','card');
      const link=element('a','card-link'); link.href=safe(p.url).href; link.setAttribute('aria-label',`${p.title} – zur Produktseite`);
      link.addEventListener('click',()=>{selected=p;saveSession();});
      if (p.featuredImage) { try { const u = new URL(p.featuredImage.url); if (u.protocol === 'https:') { const img=element('img'); img.src=u.href; img.alt=p.featuredImage.altText||p.title; img.loading='lazy'; link.append(img); } } catch {} }
      const body=element('div','card-body'); body.append(element('h3','',p.title));
      const money=p.priceRange.minVariantPrice;
      body.append(element('p','card-attributes',[p.productType,...['Muster','Farbe'].map(name=>{const values=attributes(p,name);return values.length?`${name}: ${values.join(', ')}`:'';})].filter(Boolean).join(' · ')));
      const reason=p.matchReason || (filters.Muster||filters.Farbe?'Passt zu deiner Auswahl'+(isBestseller(p)?' · Bestseller':''):isBestseller(p)?'Ein Bestseller aus unserem Sortiment':'Ein Design aus '+(p.productType||'unserem Sortiment'));
      body.append(element('p','card-reason',reason));
      const price=element('p','card-price','Ab '+new Intl.NumberFormat('de-DE',{style:'currency',currency:money.currencyCode}).format(Number(money.amount)));price.hidden=document.documentElement.dataset.nativeB2b!=='false';body.append(price);
      if(!p.availableForSale)body.append(element('p','card-availability','Aktuell ausverkauft')); link.append(body); card.append(link);
      const info=element('button','info','i'); info.type='button'; info.setAttribute('aria-label',`Informationen zu ${p.title}`);
      info._step={label:`Mehr über ${p.title}`,kind:'info'};
      info._action=()=>{selected=p;const details=productInformation(p);choices([{label:'Eine Frage zu diesem Produkt schreiben',action:()=>contact('Produktfrage')},{label:'Anwendung & Pflege',action:faq}]);if(!restoring)requestAnimationFrame(()=>{feed.scrollTop+=details.getBoundingClientRect().top-feed.getBoundingClientRect().top-20;});};
      info.onclick=()=>respond(info._step.label,info._action,'info');
      card.append(info);
      if(!filters.Kombination&&/^(Tücher|Mäppchen)$/.test(p.productType)) {
        const match=element('button','card-context',p.productType==='Tücher'?'Match mit Mäppchen finden':'Match mit Tuch finden');match.type='button';
        match.setAttribute('aria-label',`Match für ${p.title}`);
        match._step={label:`Match für ${p.title}`,kind:'choice'};match._action=()=>relatedTo(p);
        match.onclick=()=>{if(!restoring)respond(match._step.label,match._action);};card.append(match);
      }
      feed.append(card);
    });
    if(filters.Kombination&&displayed.length===2)matchCart(displayed);
    choices([...(!filters.Kombination&&offset+3<items.length?[{label:'Zeig mir noch ein paar',action:()=>showProducts(items,offset+3,type,filters)}]:[]),{label:filters.Kombination?'Im Shop weiterstöbern':'Alle passenden Designs im Shop',url:filters.Kombination?shopLink(items[0].productType==='Tücher'?'Mäppchen':'Tücher'):shopLink(type,filters)},{label:filters.Kombination?'Anderes Match finden':'Match dazu finden',action:()=>filters.Kombination?products(true):chooseCombination(displayed,type,filters)},{label:'Meine Auswahl ändern',action:()=>products(true)}]);
    feed.scrollTop=start;
  }
  function chooseCombination(items,type,filters={}) {
    if(!items.length){bubble('Für diese Auswahl gibt es gerade keine Designs.');return choices([{label:'Auswahl ändern',action:()=>products(true)}]);}
    bubble('Zu welchem Design suchst du ein Match? Wähle zuerst deinen Favoriten.');
    choices(items.slice(0,3).map(p=>({label:p.title,preview:p.featuredImage?.url,action:()=>relatedTo(p)})).concat(items.length>3?[{label:'Weitere Designs zur Auswahl',secondary:true,action:()=>chooseCombination(items.slice(3),type,filters)}]:[]),0,'selection');
  }
  async function relatedTo(product) {
    selected=product;bubble(`Ich suche ein Match zu „${product.title}“ – ${product.productType==='Tücher'?'ein Mäppchen':'ein Tuch'}, das dazu passt.`);
    return showProducts([product],0,null,{Kombination:true});
  }
  let productPreparation=Promise.resolve();
  function ensureNativeProducts(products){const work=async()=>{
    const readyStart=Date.now();while(!window.Shopyflow?.fetchNew||!window.Shopyflow?.addToCart){if(Date.now()-readyStart>15000)throw Error('Der Warenkorb wird noch geladen.');await new Promise(resolve=>setTimeout(resolve,100));}
    const sdk=window.Shopyflow;
    let bridge=document.querySelector('[data-eq-assistant-match-products]');
    if(!bridge){bridge=document.createElement('div');bridge.hidden=true;bridge.setAttribute('data-eq-assistant-match-products','');document.body.append(bridge);}
    for(const product of products){const id=product.id.split('/').pop();if(![...bridge.children].some(el=>el.getAttribute('sf-product')===id)){const module=document.createElement('div');module.setAttribute('sf-product',id);bridge.append(module);}}
    await sdk.fetchNew();
    const start=Date.now();while(products.some(p=>!sdk.currentProducts?.get(p.id.split('/').pop())?.variants?.length)){if(Date.now()-start>15000)throw Error('Produktoptionen konnten nicht geladen werden.');await new Promise(resolve=>setTimeout(resolve,100));}
    return sdk;
  };const pending=productPreparation.then(work,work);productPreparation=pending.catch(()=>{});return pending;}
  let matchBuying=false;
  let offerBuying=false,cartRendering=false,nextCartRender=0,cartNoteQueue=Promise.resolve(),cartSdk=null;
  let pendingCartAdds=[],milestoneBaseline=null,cartLoadTimer=0;
  async function wishlistNudge(){
    if(!visit.returning||visit.wishlistNotified||Date.now()-visit.start<8000||Date.now()-noticeTiming.last<90000||document.hidden||restoring||cartUnread()||feed.querySelector('.typing,.form-frame')||!window.ShopyflowWishlist?.getWishlist)return;
    visit.wishlistNotified=true;touchVisit();const ids=await wishlistIds();if(!ids.size)return;
    if(Date.now()-noticeTiming.last<90000){visit.wishlistNotified=false;touchVisit();return;}
    deferNewsletter();milestones.push({kind:'wishlist',id:`wishlist-${Date.now()}`,created:Date.now(),unread:true,threshold:0,currency:'EUR'});milestones=milestones.slice(-5);saveMilestones();noticeSent();updateBadge();position();renderCartNotes();
  }
  setInterval(wishlistNudge,2000);
  function milestoneRule(cart){
    const state=window.EyequipmentNativeB2B;if(state?.switching||state?.statusError||state?.cartContextError||document.documentElement.classList.contains('native-b2b-pending'))return null;
    const b2b=!!state?.isB2B,kind=b2b?'minimum':'shipping';
    const threshold=b2b?Number(state.minimumOrder):Number([...document.scripts].map(el=>el.textContent).join('\n').match(/const\s+B2C_SHIPPING_THRESHOLD\s*=\s*(\d+(?:\.\d+)?)/)?.[1]);
    const money=cart?.cost?.[b2b?'subtotalAmount':'totalAmount'];if(!(threshold>0)||!money||money.currencyCode!=='EUR'||!Number.isFinite(Number(money.amount)))return null;
    return {kind,threshold,currency:money.currencyCode,amount:Number(money.amount),key:JSON.stringify([cart.id||'current',kind,threshold,money.currencyCode])};
  }
  function checkCartMilestone(event){
    clearTimeout(cartLoadTimer);const next=milestoneRule(event.cart);if(!next){milestoneBaseline=null;return;}
    const before=milestoneBaseline;milestoneBaseline=next;
    if(!['addToCart','increaseQuantity','decreaseQuantity','updateCartLineItem'].includes(event.type)||!before||(!before.empty&&before.key!==next.key)||(!before.empty&&before.amount>=next.threshold)||next.amount<next.threshold||milestoneSeen[next.key])return;
    milestoneSeen[next.key]=true;cartNotes=cartNotes.filter(note=>!note.unread);saveCartNotes();deferNewsletter();noticeSent();milestones.push({...next,id:`milestone-${Date.now()}`,created:Date.now(),unread:true});milestones=milestones.slice(-5);saveMilestones();updateBadge();position();renderCartNotes();return true;
  }
  const numericId=value=>String(value||'').split('/').pop();
  function cartLines(cart=window.Shopyflow?._cart){const lines=cart?.lines;return Array.isArray(lines)?lines:lines?.nodes||lines?.edges?.map(edge=>edge.node)||[];}
  function cartQuantity(cart,variantId){return cartLines(cart).filter(line=>numericId(line.merchandise?.id)===numericId(variantId)).reduce((sum,line)=>sum+Number(line.quantity||0),0);}
  function cartProductIds(cart=window.Shopyflow?._cart){
    const ids=new Set();for(const line of cartLines(cart)){const productId=line.merchandise?.product?.id;if(productId)ids.add(numericId(productId));else for(const [id,product] of window.Shopyflow?.currentProducts||[]){if(product.variants?.some(v=>v.id===line.merchandise?.id))ids.add(numericId(id));}}return ids;
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[sf-add-to-cart]');if(!button||matchBuying||offerBuying||button.matches('[disabled],[aria-disabled="true"],.sf-disabled'))return;
    const sourceId=numericId(button.closest('[sf-product]')?.getAttribute('sf-product')),variantId=numericId(button.getAttribute('sf-add-to-cart'));
    if(!/^\d+$/.test(sourceId)||!/^\d{6,}$/.test(variantId))return;
    bindCartEvents();
    pendingCartAdds=pendingCartAdds.filter(intent=>Date.now()-intent.created<30000).slice(-9);
    pendingCartAdds.push({sourceId,variantId,existing:cartProductIds().has(sourceId),before:cartQuantity(window.Shopyflow?._cart,variantId),created:Date.now()});
  },true);
  function bindCartEvents(){
    const sdk=window.Shopyflow;if(!sdk?.on||cartSdk===sdk)return;cartSdk=sdk;milestoneBaseline=sdk._cart?milestoneRule(sdk._cart):{empty:true};
    sdk.on('cartLoad',event=>{clearTimeout(cartLoadTimer);cartLoadTimer=setTimeout(()=>{milestoneBaseline=milestoneRule(event.cart);},0);});
    sdk.on('cartUpdate',event=>{
      try{
        const reached=checkCartMilestone(event);
        if(event.type!=='addToCart'||matchBuying||offerBuying||!Array.isArray(event.addedItem))return;
        pendingCartAdds=pendingCartAdds.filter(intent=>Date.now()-intent.created<30000);
        const index=pendingCartAdds.findIndex(intent=>event.addedItem.some(item=>numericId(item.merchandiseId)===intent.variantId)&&cartQuantity(event.cart,intent.variantId)>intent.before);
        if(index<0)return;const [intent]=pendingCartAdds.splice(index,1),inCart=cartProductIds(event.cart);
        pendingCartAdds=pendingCartAdds.filter(other=>other.variantId!==intent.variantId);
        if(intent.existing||reached)return;
        cartNoteQueue=cartNoteQueue.then(()=>createCartNote(intent.sourceId,inCart)).catch(()=>{});
      }catch{}
    });
  }
  window.addEventListener('ShopyflowReady',bindCartEvents);bindCartEvents();
  function sharedStyle(source,product){return ['Muster','Farbe'].flatMap(name=>attributes(source,name).filter(value=>attributes(product,name).includes(value)).map(value=>`${name}: ${value}`));}
  function cartOffers(source,items,inCart,wishes=new Set()){
    const candidates=items.filter(p=>p.availableForSale&&p.id!==source.id&&!inCart.has(numericId(p.id))&&/^(Tücher|Mäppchen)$/.test(p.productType));
    for(let i=candidates.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    let linked=[];try{linked=JSON.parse(source.relatedProducts?.value||'[]');}catch{}
    const score=p=>(Array.isArray(linked)&&linked.includes(p.id)?1000:0)+(p.title.toLocaleLowerCase('de')===source.title.toLocaleLowerCase('de')?100:0)+sharedStyle(source,p).length;
    const offers=[];let pouches=0;
    const add=(product,role)=>{if(!product)return;offers.push({id:numericId(product.id),role});if(product.productType==='Mäppchen')pouches++;};
    const allowed=p=>!offers.some(o=>o.id===numericId(p.id))&&(p.productType!=='Mäppchen'||pouches<1);
    add(candidates.filter(p=>p.productType!==source.productType).sort((a,b)=>score(b)-score(a)).find(p=>score(p)>0),'match');
    const wish=candidates.find(p=>allowed(p)&&wishes.has(numericId(p.id))),best=candidates.find(p=>allowed(p)&&isBestseller(p));
    if(wish&&(!best||Math.random()<.5))add(wish,'wish');else add(best,'best');
    return offers;
  }
  async function createCartNote(sourceId,inCart){
    if(Date.now()-noticeTiming.suggestion<90000||Date.now()-noticeTiming.last<90000)return;
    noticeSent(true);const version=noticeVersion;deferNewsletter();
    if(cartNotes.some(note=>note.sourceId===sourceId&&Date.now()-note.created<10000))return;
    const items=await loadCatalog(),source=items.find(p=>numericId(p.id)===sourceId);if(!source)return;
    const wishes=await wishlistIds();if(noticeVersion!==version)return;const offers=cartOffers(source,items,inCart,wishes);if(!offers.length)return;
    cartNotes.push({id:`${Date.now()}-${Math.floor(Math.random()*1000000)}`,created:Date.now(),sourceId,offers,unread:true});cartNotes=cartNotes.slice(-5);saveCartNotes();updateBadge();position();renderCartNotes();
  }
  async function renderCartNotes(){
    if(!panelOpen||restoring||cartRendering||Date.now()<nextCartRender||feed.querySelector('.typing,.form-frame')||(!cartNotes.length&&!milestones.length))return;
    cartRendering=true;
    try{
      for(const note of milestones){
        if(note.dismissed)continue;
        if([...feed.querySelectorAll('[data-cart-milestone]')].some(el=>el.dataset.cartMilestone===note.id))continue;
        const section=element('section','cart-offer-note');section.dataset.cartMilestone=note.id;
        if(note.kind==='wishlist'){
          section.append(element('div','bubble','Schön, dass du wieder da bist! Auf deiner Wunschliste warten noch gemerkte Designs. Möchtest du sie dir ansehen?'));
          const buttons=element('div','choices'),yes=element('a','choice choice-primary','Ja, gerne'),no=element('button','choice choice-secondary','Gerade nicht');yes.href=findPage(/wunschliste/i,'/wunschliste');no.type='button';yes.addEventListener('click',()=>{note.dismissed=true;saveMilestones();saveSession();});no.onclick=()=>{note.dismissed=true;saveMilestones();section.replaceChildren(element('div','bubble','Alles klar! Viel Freude beim Stöbern.'));};buttons.append(yes,no);section.append(buttons);feed.append(section);if(note.unread)focusNotice(section);note.unread=false;continue;
        }
        const amount=new Intl.NumberFormat('de-DE',{style:'currency',currency:note.currency,minimumFractionDigits:0,maximumFractionDigits:2}).format(note.threshold);
        const message=element('div','bubble milestone-reward'),headline=element('strong','milestone-headline','Geschafft! 🎉'),value=element('strong','milestone-amount',amount);
        message.append(headline,document.createTextNode(note.kind==='minimum'?'Dein Warenkorb hat den Mindestbestellwert von ':'Dein Warenkorb hat die Gratisversand-Grenze von '),value,document.createTextNode(note.kind==='minimum'?' netto erreicht. ':' erreicht. '),element('strong','',note.kind==='minimum'?'Deine Händlerbestellung kann losgehen!':'Der Versand geht auf uns!'),document.createTextNode(' :)'));
        section.append(message);
        const button=element('button','context-share-button','Warenkorb ansehen');button.type='button';button.onclick=()=>{toggle(false);window.Shopyflow?.openCart?.();};section.append(button);feed.append(section);if(note.unread)focusNotice(section);note.unread=false;
      }saveMilestones();updateBadge();position();
      const items=await loadCatalog();if(!panelOpen||restoring||feed.querySelector('.typing,.form-frame'))return;
      for(const note of cartNotes){
        if([...feed.querySelectorAll('[data-cart-note]')].some(el=>el.dataset.cartNote===note.id))continue;
        const source=items.find(p=>numericId(p.id)===note.sourceId);if(!source){note.unread=false;continue;}
        const section=element('section','cart-offer-note');section.dataset.cartNote=note.id;
        section.append(element('div','bubble',`Hey, du hast „${source.title}“ in den Warenkorb gelegt. Dazu könnten diese Designs gut passen:`));
        const row=element('div','cart-offer-row');row.setAttribute('role','list');row.setAttribute('aria-label','Passende Produktempfehlungen');
        for(const offer of note.offers){
          const product=items.find(p=>numericId(p.id)===offer.id&&p.availableForSale);if(!product)continue;
          const card=element('article','cart-offer-card');card.setAttribute('role','listitem');
          card.append(element('span','cart-offer-role',{match:'Dein Match',best:'Bestseller',wish:'Von deiner Wunschliste'}[offer.role]));
          const link=element('a','cart-offer-link');link.href=safe(product.url).href;link.addEventListener('click',saveSession);
          if(product.featuredImage?.url){const image=element('img');image.src=product.featuredImage.url;image.alt='';image.loading='lazy';image.onerror=()=>image.remove();link.append(image);}
          link.append(element('h3','',product.title));card.append(link,element('p','cart-offer-type',product.productType));
          const shared=sharedStyle(source,product);card.append(element('p','cart-offer-reason',offer.role==='best'?'Ein beliebtes Design':offer.role==='wish'?'Bereits von dir gemerkt':shared.slice(0,2).join(' · ')||'Als Match empfohlen'));
          offerCartControl(card,product);row.append(card);
        }
        if(row.children.length){section.append(row);feed.append(section);if(note.unread)focusNotice(section);}
        note.unread=false;
      }
      saveCartNotes();updateBadge();position();
    }catch{nextCartRender=Date.now()+10000;}finally{cartRendering=false;}
  }
  async function offerCartControl(card,product){
    const status=element('span','cart-offer-status');status.setAttribute('role','status');
    const button=element('button','cart-offer-buy','In den Warenkorb');button.type='button';button.disabled=true;button.setAttribute('aria-label',`${product.title} in den Warenkorb`);card.append(status,button);
    const view=()=>{toggle(false);window.Shopyflow?.openCart?.();};
    try{
      const sdk=await ensureNativeProducts([product]),b2b=window.EyequipmentNativeB2B;await b2b?.ensureStatus?.();const wasB2B=!!b2b?.isB2B;
      if(b2b?.switching||b2b?.statusError||b2b?.cartContextError)throw Error();
      if(cartProductIds().has(numericId(product.id))){button.textContent='Im Warenkorb';button.setAttribute('aria-label',`${product.title} im Warenkorb ansehen`);button.disabled=false;button.onclick=view;return;}
      const native=sdk.currentProducts.get(numericId(product.id));if(native.requiresSellingPlan)throw Error();
      const rules=wasB2B?await b2b.getMatchVariants(product.id):[],variants=native.variants.filter(v=>v.availableForSale).map(v=>({...v,quantityRule:rules.find(r=>r.id===v.id)?.quantityRule||v.quantityRule}));
      if(!variants.length||wasB2B&&variants.some(v=>!v.quantityRule))throw Error();
      const select=element('select');select.setAttribute('aria-label',`Variante für ${product.title}`);for(const v of variants){const option=element('option','',v.title);option.value=v.id;select.append(option);}if(variants.length>1)card.insertBefore(select,status);
      const chosen=()=>variants.find(v=>v.id===select.value),amount=rule=>Math.ceil(Math.max(1,Number(rule?.minimum)||1)/Math.max(1,Number(rule?.increment)||1))*Math.max(1,Number(rule?.increment)||1);
      const update=()=>{status.textContent=wasB2B?`${amount(chosen().quantityRule)} × · Händlermenge`:'';};select.onchange=update;update();button.disabled=false;
      button.onclick=async()=>{
        if(restoring||offerBuying||matchBuying||button.disabled)return;offerBuying=true;button.disabled=true;button.textContent='Wird ergänzt …';
        try{
          const state=window.EyequipmentNativeB2B;await state?.ensureStatus?.();if(state?.switching||state?.statusError||state?.cartContextError||!!state?.isB2B!==wasB2B)throw Error();
          const variant=chosen();let rule=variant.quantityRule;if(wasB2B){rule=(await state.getMatchVariants(product.id)).find(v=>v.id===variant.id)?.quantityRule;if(!rule||amount(rule)!==amount(variant.quantityRule))throw Error();}
          const quantity=amount(rule);if(rule?.maximum!=null&&quantity>Number(rule.maximum))throw Error();
          const before=cartQuantity(sdk._cart,variant.id);await sdk.addToCart({lineItems:[{merchandiseId:variant.id,quantity}],useShopifyId:true,getNewCart:false});if(cartQuantity(sdk._cart,variant.id)<before+quantity)throw Error();
          button.textContent='Im Warenkorb';button.setAttribute('aria-label',`${product.title} im Warenkorb ansehen`);status.textContent='Hinzugefügt';button.onclick=view;toggle(false);sdk.openCart?.();
        }catch{button.textContent='Warenkorb prüfen';button.setAttribute('aria-label',`Warenkorb für ${product.title} prüfen`);status.textContent='Bitte vor erneutem Hinzufügen prüfen.';button.onclick=view;}
        finally{button.disabled=false;offerBuying=false;}
      };
    }catch{button.textContent='Produkt öffnen';button.setAttribute('aria-label',`${product.title} öffnen`);button.disabled=false;button.onclick=()=>location.assign(safe(product.url).href);}
  }
  setInterval(()=>{bindCartEvents();renderCartNotes();},1000);
  async function matchCart(pair){
    const box=element('section','match-cart');box.setAttribute('aria-label','Beide Match-Produkte kaufen');
    box.append(element('div','group-heading','Dein Match zusammen bestellen'));
    const summary=element('p','match-summary',pair.map(p=>`${p.title} (${p.productType})`).join(' + '));box.append(summary);
    const status=element('p','note','Produktoptionen werden geladen …');status.setAttribute('role','status');box.append(status);
    const button=element('button','choice choice-primary match-cart-button');button.type='button';button.disabled=true;
    const icon=element('span','match-cart-icon');icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none"><path d="M3 4h2l2 12h11l3-8H6M9 20h.01M18 20h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const buttonLabel=element('span','','Beide in den Warenkorb');button.append(icon,buttonLabel);box.append(button);feed.append(box);
    const selections=[];
    try{
      const sdk=await ensureNativeProducts(pair);
      const b2b=window.EyequipmentNativeB2B;await b2b?.ensureStatus?.();const wasB2B=!!b2b?.isB2B;
      if(b2b?.switching||b2b?.cartContextError||b2b?.statusError)throw Error('Der Warenkorb ist noch nicht bereit.');
      for(const [index,product] of pair.entries()){
        const native=sdk.currentProducts.get(product.id.split('/').pop());
        if(native.requiresSellingPlan)throw Error('Bitte wähle die Kaufoption auf der Produktseite.');
        const rules=b2b?.isB2B?await b2b.getMatchVariants(product.id):[];
        const variants=native.variants.filter(v=>v.availableForSale).map(v=>({...v,quantityRule:rules.find(rule=>rule.id===v.id)?.quantityRule||v.quantityRule}));
        if(!variants.length||b2b?.isB2B&&variants.some(v=>!v.quantityRule))throw Error('Dieses Match ist gerade nicht direkt bestellbar.');
        const row=element('div','match-option'),label=element('label','',`${product.title} · ${product.productType}`);row.append(label);
        const select=element('select');select.id=`eq-match-${Date.now()}-${index}`;label.htmlFor=select.id;
        variants.forEach(v=>{const option=element('option','',v.title==='Default Title'?product.productType:v.title);option.value=v.id;select.append(option);});
        if(variants.length>1)row.append(select);
        const quantity=element('span','match-quantity');row.append(quantity);box.insertBefore(row,status);
        const chosen=()=>variants.find(v=>v.id===select.value),amount=()=>{const rule=chosen().quantityRule,step=Math.max(1,Number(rule?.increment)||1);return Math.ceil(Math.max(1,Number(rule?.minimum)||1)/step)*step;};
        const update=()=>{quantity.textContent=`${amount()} ×`;};select.onchange=update;update();selections.push({chosen,amount});
      }
      status.textContent=b2b?.isB2B?'Die Händler-Mindestmenge gilt je Produkt.':'Je ein Produkt – ein Tuch und ein Mäppchen.';button.disabled=false;
      // Commerce actions are deliberately outside replayable chat choices.
      button.onclick=async()=>{
        if(restoring||matchBuying||offerBuying||button.disabled)return;matchBuying=true;button.disabled=true;buttonLabel.textContent='Wird hinzugefügt …';
        try{
          const current=window.EyequipmentNativeB2B;await current?.ensureStatus?.();
          if(current?.switching||current?.cartContextError||current?.statusError||!!current?.isB2B!==wasB2B)throw Error('Warenkorbstatus hat sich geändert.');
          const lineItems=[];
          for(const [index,selection] of selections.entries()){
            const variant=selection.chosen();let quantity=selection.amount();
            if(current?.isB2B){const fresh=(await current.getMatchVariants(pair[index].id)).find(v=>v.id===variant.id)?.quantityRule;if(!fresh)throw Error('Mengenregel fehlt.');const step=Math.max(1,Number(fresh.increment)||1);quantity=Math.ceil(Math.max(1,Number(fresh.minimum)||1)/step)*step;if(quantity!==selection.amount())throw Error('Die Mindestmenge hat sich geändert. Bitte suche dein Match erneut.');if(fresh.maximum!=null&&quantity>Number(fresh.maximum))throw Error('Dieses Produkt ist gerade nicht in ausreichender Menge bestellbar.');}
            lineItems.push({merchandiseId:variant.id,quantity});
          }
          const quantities=()=>{const raw=sdk._cart?.lines;const lines=Array.isArray(raw)?raw:raw?.nodes||raw?.edges?.map(e=>e.node)||[];return lineItems.map(item=>lines.filter(line=>line.merchandise?.id===item.merchandiseId).reduce((sum,line)=>sum+Number(line.quantity||0),0));};
          const before=quantities();await sdk.addToCart({lineItems,useShopifyId:true,getNewCart:false});
          const after=quantities();if(lineItems.some((item,index)=>after[index]<before[index]+item.quantity))throw Error('Warenkorb-Ergebnis nicht bestätigt.');
          buttonLabel.textContent='Im Warenkorb ansehen';button.disabled=false;status.textContent='Dein Match wurde zum Warenkorb hinzugefügt.';
          button.onclick=()=>{toggle(false);sdk.openCart?.();};toggle(false);sdk.openCart?.();
        }catch{buttonLabel.textContent='Warenkorb prüfen';button.disabled=false;status.textContent='Das Hinzufügen konnte nicht bestätigt werden. Bitte prüfe deinen Warenkorb, bevor du es erneut versuchst.';button.onclick=()=>{toggle(false);sdk.openCart?.();};}
        finally{matchBuying=false;}
      };
    }catch(error){status.textContent=error.message+' Du kannst beide Produkte über ihre Produktseiten bestellen.';button.hidden=true;}
  }
  const productContainer=()=>location.pathname.startsWith('/products/')?document.querySelector('.product-container[sf-product]'):null;
  function nativeControl(attribute){return productContainer()?.querySelector(`[${attribute}]`);}
  function nativeWishlistMarked() {
    const control=nativeControl('sf-add-to-wishlist');
    // Storesynk wishlist 1.0.1 uses sf-active; newer documentation names sf-wishlist-active.
    return !!control&&control.matches('.sf-active,.sf-wishlist-active');
  }
  function nativeAction(attribute) {
    if(restoring)return;
    const control=nativeControl(attribute);
    if(!control||control.matches('[disabled],[aria-disabled="true"],.sf-disabled')||!window.Shopyflow?.currentProducts?.size){bubble('Bitte wähle Menge und Variante direkt auf der Produktseite.');toggle(false);productContainer()?.scrollIntoView({behavior:reducedMotion()?'instant':'smooth',block:'center'});return;}
    if(attribute==='sf-add-to-wishlist'&&nativeWishlistMarked()){location.assign(findPage(/wunschliste/i,'/wunschliste'));return;}
    // Use the existing product control: native quantity, variant, B2B and errors remain authoritative.
    // Never record commerce clicks as replayable dialog steps.
    toggle(false);control.click();
  }
  function shareControl(container) {
    const wrapper=element('div','context-share');
    const button=element('button','context-share-button');button.type='button';
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    icon.innerHTML='<path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
    button.append(icon,element('span','','Produkt teilen'));wrapper.append(button);
    const status=element('div','share-status');status.setAttribute('role','status');status.hidden=true;wrapper.append(status);
    const fallback=element('div','share-fallback');fallback.hidden=true;
    const link=element('input','share-link');link.type='text';link.readOnly=true;link.setAttribute('aria-label','Produktlink zum Kopieren');
    const copy=element('button','context-button','Link kopieren');copy.type='button';fallback.append(link,copy);wrapper.append(fallback);
    const message=value=>{status.textContent=value;status.hidden=!value;};
    const manual=(url,text)=>{link.value=url;fallback.hidden=false;message(text);};
    async function copyLink(url) {
      try{if(!navigator.clipboard?.writeText)throw Error('Clipboard fehlt');await navigator.clipboard.writeText(url);fallback.hidden=true;message('Produktlink kopiert.');}
      catch{manual(url,'Markiere den Produktlink und kopiere ihn.');link.focus();link.select();}
    }
    copy.onclick=()=>copyLink(link.value);
    button.onclick=async()=>{
      if(restoring||button.disabled)return;
      const url=new URL(location.pathname,location.origin).href;
      const data={title:text(container.querySelector('[sf-show-title]'))||text(document.querySelector('h1'))||'eyequipment',url};
      fallback.hidden=true;message('');
      // Call immediately within the click, before any dialog delay or network await.
      if(typeof navigator.share==='function') {
        button.disabled=true;
        try{if(navigator.canShare&&!navigator.canShare(data))throw Error('Teilen nicht verfügbar');await navigator.share(data);}
        catch(error){if(error.name!=='AbortError')manual(url,'Teilen ist hier nicht verfügbar. Du kannst den Link kopieren.');}
        finally{button.disabled=false;}
      }else await copyLink(url);
    };
    return wrapper;
  }
  function setupContext() {
    const container=productContainer();if(!container)return;
    const id=container.getAttribute('sf-product').split('/').pop();
    const context=element('section','product-context');context.setAttribute('aria-label','Aktionen zum aktuellen Produkt');
    const body=element('div','context-body');body.id='eq-context-body';
    const inner=element('div','context-inner');body.append(inner);context.append(body);
    const head=root.querySelector('.head');head.classList.add('product-head');
    const title=head.querySelector('.brand');head.querySelector('.sub').textContent='Das siehst du dir gerade an.';
    const image=element('img','context-image');image.alt='';image.setAttribute('aria-hidden','true');image.hidden=true;head.prepend(image);
    const actions=element('div','context-actions');inner.append(actions);
    function dialogButton(label,actionName) {
      const button=element('button','context-button',label);button.type='button';
      button.onclick=()=>{if(restoring)return;respond(label,async()=>{
        const all=await task(loadCatalog);if(!all)return;const product=all.find(p=>p.id.split('/').pop()===id);
        if(!product){bubble('Dieses Produkt ist gerade nicht im verfügbaren Katalog.');return choices([{label:'Passendes Produkt finden',action:()=>products(true)}]);}
        selected=product;return actionName==='related'?relatedTo(product):contact('Produktfrage');
      },'context',{productId:id,action:actionName});};actions.append(button);
    }
    dialogButton('Match finden','related');dialogButton('Frage zu diesem Produkt','question');
    const commerce=element('div','context-commerce');inner.append(commerce);
    const cart=element('button','context-button','In den Warenkorb');cart.type='button';cart.onclick=()=>nativeAction('sf-add-to-cart');commerce.append(cart);
    const wish=element('button','context-button','♡ Merken');wish.type='button';wish.onclick=()=>nativeAction('sf-add-to-wishlist');commerce.append(wish);
    inner.append(shareControl(container));
    const update=()=>{title.textContent=text(container.querySelector('[sf-show-title]'))||text(document.querySelector('h1'));
      const productImage=[...container.querySelectorAll('img')].find(img=>/^https:\/\//.test(img.currentSrc||img.src)&&!/(?:placeholder|\.svg(?:\?|$))/.test(img.currentSrc||img.src));
      const source=productImage&&(productImage.currentSrc||productImage.src);if(source&&image.getAttribute('src')!==source){image.src=source;image.hidden=false;}
      cart.disabled=!nativeControl('sf-add-to-cart')||!window.Shopyflow?.currentProducts?.size;wish.disabled=!nativeControl('sf-add-to-wishlist')||!window.Shopyflow?.currentProducts?.size;const marked=nativeWishlistMarked();wish.textContent=marked?'♥ Gemerkt · Ansehen':'♡ Merken';wish.classList.toggle('is-saved',marked);wish.title=marked?'Bereits gemerkt – Wunschliste ansehen':'Dieses Produkt auf der Wunschliste merken';};
    update();new MutationObserver(update).observe(container,{subtree:true,attributes:true,childList:true,characterData:true});
    window.addEventListener('ShopyflowReady',update);window.addEventListener('eyequipment:native-b2b-ready',update);
    const fold=element('button','context-toggle');fold.type='button';fold.setAttribute('aria-controls',body.id);
    const foldLabel=element('span');const foldIcon=element('span','context-chevron');foldIcon.setAttribute('aria-hidden','true');foldIcon.innerHTML='<svg viewBox="0 0 16 16" fill="none"><path d="m4 10 4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';fold.append(foldLabel,foldIcon);
    const setCollapsed=value=>{contextCollapsed=value;context.classList.toggle('is-collapsed',value);inner.inert=value;inner.setAttribute('aria-hidden',String(value));fold.setAttribute('aria-expanded',String(!value));foldLabel.textContent=value?'Produktoptionen anzeigen':'Produktoptionen ausblenden';};
    setCollapsed(readSession()?.contextCollapsed===true);
    fold.onclick=()=>{setCollapsed(!contextCollapsed);saveSession();};context.append(fold);
    panel.insertBefore(context,feed);
  }
  setupContext();
  async function editSelection(name,type,filters) {
    const all=await task(loadCatalog);if(!all)return;
    if(name==='Kategorie') {
      bubble('Welche Produktart möchtest du? Muster und Farbe bleiben erhalten.');
      const types=productTypes(all);
      const apply=nextType=>showProducts(rank(all.filter(p=>(!nextType||p.productType===nextType)&&(!filters.Muster||attributes(p,'Muster').includes(filters.Muster))&&(!filters.Farbe||attributes(p,'Farbe').includes(filters.Farbe))&&(!filters.Highlights||isBestseller(p)))),0,nextType,filters);
      return choices([...types.map(value=>({label:value,preview:typePreview(all,value),action:()=>apply(value)})),{label:'Alle Produktarten',secondary:true,action:()=>apply(null)}]);
    }
    const updated={...filters};delete updated[name];
    const base=all.filter(p=>(!type||p.productType===type)&&(!updated.Muster||attributes(p,'Muster').includes(updated.Muster))&&(!updated.Farbe||attributes(p,'Farbe').includes(updated.Farbe))&&(!updated.Highlights||isBestseller(p)));
    const values=[...new Set(base.flatMap(p=>attributes(p,name)))].sort((a,b)=>a.localeCompare(b,'de'));
    bubble(`Welche ${name==='Farbe'?'Farbe':'Muster'} möchtest du stattdessen? Die übrige Auswahl bleibt erhalten.`);
    choices([...values.map(value=>({label:value.charAt(0).toLocaleUpperCase('de')+value.slice(1),action:()=>showProducts(rank(base.filter(p=>attributes(p,name).includes(value))),0,type,{...updated,[name]:value})})),{label:`Alle ${name==='Farbe'?'Farben':'Muster'}`,secondary:true,action:()=>showProducts(rank(base),0,type,updated)}],0,'selection');
  }
  function combination(items) {
    const all=catalog?.items||items;
    const source=items[0];if(!source)return [];
    const opposite=all.filter(p=>p.productType!==source.productType&&/Tücher|Mäppchen/i.test(p.productType)&&p.availableForSale);
    let related=[];try{related=JSON.parse(source.relatedProducts?.value||'[]');}catch{}
    const linked=p=>Array.isArray(related)&&related.includes(p.id);
    const score=p=>(linked(p)?1000:0)+(p.title.toLocaleLowerCase('de')===source.title.toLocaleLowerCase('de')?100:0)+['Muster','Farbe'].reduce((sum,name)=>sum+attributes(p,name).filter(v=>attributes(source,name).includes(v)).length,0);
    const partner=opposite.sort((a,b)=>score(b)-score(a)).find(p=>score(p)>0);
    if(!partner)return [source];
    const same=source.title.toLocaleLowerCase('de')===partner.title.toLocaleLowerCase('de');
    const shared=['Muster','Farbe'].flatMap(name=>attributes(source,name).filter(v=>attributes(partner,name).includes(v)).map(v=>`${name}: ${v}`));
    const reason=linked(partner)?'Von eyequipment als Match empfohlen':same?'Ein Match im gleichen Design':`Ein Match über ${shared.join(' · ')}`;
    return [{...source,matchReason:reason},{...partner,matchReason:reason}];
  }
  async function faq() {
    const doc = await task(()=>page(findPage(/faq/i,'/faq'))); if (!doc) return;
    const sections = [...doc.querySelectorAll('[data-faq-section]')];
    if (!sections.length) { bubble('Die aktuellen Antworten findest du in unseren FAQ.'); choices([{label:'FAQ öffnen',url:findPage(/faq/i,'/faq')}]); return; }
    bubble('Zu welchem Thema möchtest du mehr wissen?');
    choices(sections.map(section=>({label:text(section.querySelector('.faq-topic-title'))||'Fragen & Antworten',action:()=>{
      choices([...section.querySelectorAll('[data-faq-card]')].map(card=>({label:text(card.querySelector('[data-faq-question]')),action:()=>{bubble(text(card.querySelector('[data-faq-answer]')));choices([{label:'Weitere Fragen',action:faq},{label:'Das klärt meine Frage nicht',action:()=>contact('Frage zu den FAQ')}]);}})));
    }})));
  }
  function pages() {
    nav=navigation(document);bubble('Wohin möchtest du? Die Links sind nach Thema gruppiert.');
    const groups=[{title:'Shop & Konto',test:/shop|konto|wunschliste/i},{title:'Hilfe & Kontakt',test:/faq|kontakt|widerruf|bfsg/i},{title:'Über uns & Händler',test:/ueber|h.ndler/i},{title:'Rechtliches & weitere Seiten',test:/.*/}];
    const remaining=new Set(nav);
    const items=groups.flatMap(group=>{const links=[...remaining].filter(n=>group.test.test(n.title+' '+n.url));links.forEach(n=>remaining.delete(n));return links.map((n,index)=>({label:n.title,url:n.url,heading:index===0?group.title:null}));});
    choices(items,0,'page-links');
  }
  function service() { bubble('Wobei brauchst du Hilfe?'); choices([{label:'Meine Bestellungen ansehen',url:findPage(/konto/i,'/konto')},...['Lieferung fehlt','Artikel beschädigt oder falsch','Rückgabe / Widerruf','Problem beim Bestellen','Problem mit dem Konto'].map(label=>({label,action:()=>contact(label)})),{label:'Versand & Serviceantworten',action:faq}]); }
  function dealers() { bubble('Hier findest du die Händlerbereiche. Deine individuellen Preise, Mindestmengen und Standorte werden im angemeldeten Shop angezeigt.'); choices([{label:'Händler werden',primary:true,action:()=>contact('Händlerantrag',true)},{label:'Infos für Händler',secondary:true,url:findPage(/h.ndler/i,'/haendler-werden')},{label:'Zum Kundenkonto',url:findPage(/konto/i,'/konto')},{label:'Frage als Händler',action:()=>contact('Händleranfrage')}]); }
  function contact(subject = 'Allgemeine Anfrage',dealer=false) {
    feed.querySelectorAll('iframe').forEach(frame=>frame.remove());
    ticket++; bubble(dealer?'Schön, dass du eyequipment in deinem Store anbieten möchtest! Füll hier deinen Händlerantrag aus. Wir melden uns bei dir und klären gemeinsam die nächsten Schritte.':'Wir helfen dir gerne persönlich weiter. Schreib uns kurz, worum es geht. Wenn du lieber telefonieren möchtest, ergänze deine Nummer und einen Rückrufwunsch in der Nachricht.');
    const url = safe(dealer?findPage(/h.ndler/i,'/haendler-werden'):findPage(/kontakt/i,'/kontakt')); if (!url) return;
    const loading=typing();
    const frame=element('iframe','form-frame'); frame.title=dealer?'eyequipment Händlerantrag':'eyequipment Kontaktformular'; frame.src=url.href; frame.style.height='1px';
    let prepared=false;
    const timeout=setTimeout(()=>{if(!prepared&&frame.isConnected){frame.remove();loading.remove();bubble('Das Formular braucht gerade etwas länger. Du kannst es direkt auf der Seite öffnen.');}},15000);
    frame.onload=()=>{
      if (prepared || !frame.isConnected) return;
      try {
        const doc=frame.contentDocument;
        const form=[...doc.querySelectorAll('form')].find(f=>dealer?f.querySelector('.dealer-submit-native'):f.querySelector('input[type=email]')&&f.querySelector('textarea')&&!f.hasAttribute('sf-address-form'));
        if (!form) throw new Error('Formular fehlt');
        const wrapper=form.closest('.w-form'); if (!wrapper) throw new Error('Formularbereich fehlt');
        let branch=wrapper;
        while (branch.parentElement && branch.parentElement!==doc.documentElement) { [...branch.parentElement.children].forEach(sibling=>{if(sibling!==branch && !['SCRIPT','STYLE','LINK'].includes(sibling.tagName)) sibling.style.setProperty('display','none','important');}); branch=branch.parentElement; }
        const style=doc.createElement('style'); style.textContent='html,body{background:#fff!important;overflow:auto!important;min-height:0!important}body{padding:4px!important}.w-form{width:100%!important;max-width:none!important;margin:0!important}[data-eq-newsletter-promo],.cart-popup,.minimized,.mobile-product-banner,.custom-lightbox-overlay{display:none!important}.w-form input[type=submit]{max-width:100%!important;transform:none!important;scale:1!important;transition:background .2s,transform .15s!important}.w-form input[type=submit]:hover{background:#333!important}.w-form input[type=submit]:active{transform:scale(.98)!important}'; doc.head.append(style);
        let ancestor=wrapper.parentElement; while(ancestor&&ancestor!==doc.body){ancestor.style.cssText+=';display:block!important;padding:0!important;margin:0!important;width:100%!important;min-height:0!important;height:auto!important;transform:none!important;';ancestor=ancestor.parentElement;}
        wrapper.querySelectorAll('a[href]').forEach(a=>{const link=safe(a.getAttribute('href'),url.href);if(link){a.href=link.href;a.target='_blank';a.rel='noopener noreferrer';}});
        if(dealer){const interest=form.querySelector('select[name=Interesse]');if(interest&&[...interest.options].some(option=>option.value==='Händler werden'))interest.value='Händler werden';}
        else {
          const labels=[...form.querySelectorAll('label')];
          const subjectLabel=labels.find(l=>/betreff/i.test(text(l))); const field=subjectLabel&&doc.getElementById(subjectLabel.htmlFor);
          const product=subject==='Produktfrage'?selected:null;
          if(field)field.value=product?`Produktfrage zu ${product.title}`:subject;
          const textarea=form.querySelector('textarea');
          const reference=product?`Produkt: ${new URL(product.url,location.origin).href}`:`Seitenbezug: ${location.origin}${location.pathname}`;
          textarea.value=`Hallo eyequipment-Team,\n\n${reference}\n\n${product?'Meine Frage':'Meine Nachricht'}:\n`;
        }
        const resize=()=>{frame.style.height=`${Math.ceil(wrapper.getBoundingClientRect().height)+32}px`;}; resize();
        const observer=new frame.contentWindow.ResizeObserver(resize); observer.observe(wrapper);
        prepared=true;
        clearTimeout(timeout);
        requestAnimationFrame(()=>requestAnimationFrame(()=>{loading.remove();frame.classList.add('ready');}));
      } catch { clearTimeout(timeout); loading.remove(); frame.remove(); bubble(dealer?'Bitte öffne deinen Händlerantrag direkt auf der Händlerseite.':'Bitte öffne unser Kontaktformular direkt.'); }
    };
    feed.append(frame); choices([{label:dealer?'Händlerseite direkt öffnen':'Kontaktseite direkt öffnen',url:url.href}]); feed.scrollTop=Math.max(0,frame.offsetTop-feed.offsetTop-130);
  }
  let positionFrame=0;
  let pendingSession=null;
  async function restore(state) {
    if(restoring)return;
    restoring=true; resumePages=new Map();
    root.querySelector('.restart').disabled=true; root.querySelector('.back').disabled=true;
    panel.classList.remove('keyboard-navigation');
    toggle(state.open); feed.hidden=true; feed.setAttribute('aria-live','off');
    const status=element('div','resume-status','Deine Auswahl wird geladen …'); panel.insertBefore(status,feed);
    try {
      home();
      for(const step of state.steps) {
        if(step.kind==='context') {
          await respond(step.label,async()=>{const all=await task(loadCatalog);if(!all)return;const product=all.find(p=>p.id.split('/').pop()===step.productId);if(!product){bubble('Das frühere Produkt ist nicht mehr verfügbar.');return choices([{label:'Lieblingsdesign finden',primary:true,action:discover}]);}selected=product;return step.action==='related'?relatedTo(product):contact('Produktfrage');},'context',{productId:step.productId,action:step.action,orderSeed:step.orderSeed});continue;
        }
        const button=[...feed.querySelectorAll('button')].find(el=>el._step?.kind===step.kind&&el._step?.label===step.label);
        if(!button){bubble('Ein Inhalt hat sich inzwischen geändert. Lass uns von hier aus weitermachen.');choices([{label:'Lieblingsdesign finden',primary:true,action:discover},{label:'Eine Frage klären',action:help}]);break;}
        await respond(step.label,button._action,step.kind,{orderSeed:step.orderSeed});
      }
      if(state.selected && typeof state.selected.title==='string' && state.selected.title.length<=200 && safe(state.selected.url))selected={title:state.selected.title,url:safe(state.selected.url).pathname};
    } finally {
      status.remove(); feed.hidden=false; feed.setAttribute('aria-live','polite'); restoring=false; resumePages.clear();
      root.querySelector('.restart').disabled=false; root.querySelector('.back').disabled=false; root.querySelector('.back').hidden=!steps.length;
      requestAnimationFrame(()=>{feed.scrollTop=Number.isFinite(state.scroll)?state.scroll:feed.scrollHeight;if(panelOpen)panel.focus({preventScroll:true});saveSession();});
    }
  }
  function position() {
    positionFrame=0; host.style.zIndex=!panelOpen?'90':'100000';
    const footer=document.querySelector('footer, .footer, [data-eq-footer]');
    const banner=document.querySelector('.mobile-product-banner'); const bannerRect=banner?.getBoundingClientRect();
    const covered=!!bannerRect && getComputedStyle(banner).display!=='none' && getComputedStyle(banner).visibility!=='hidden' && Number(getComputedStyle(banner).opacity)>0 && bannerRect.top<innerHeight-16 && bannerRect.bottom>innerHeight-70 && bannerRect.right>innerWidth-70;
    const unreadCart=cartUnread();
    if(!panelOpen&&covered&&unreadCart&&innerWidth<=600)launcher.style.bottom=`${Math.max(16,Math.min(innerHeight-70,innerHeight-bannerRect.top+12))}px`;else launcher.style.removeProperty('bottom');
    const hidden=!panelOpen && ((!!footer && footer.getBoundingClientRect().top<innerHeight-16)||(covered&&!unreadCart));
    launcher.classList.toggle('footer-hidden',hidden); launcher.inert=hidden;
  }
  function schedulePosition() { if(!positionFrame)positionFrame=requestAnimationFrame(position); }
  window.addEventListener('scroll',schedulePosition,{passive:true}); window.addEventListener('resize',schedulePosition,{passive:true});
  const footer=document.querySelector('footer, .footer, [data-eq-footer]'); if(footer)new IntersectionObserver(schedulePosition).observe(footer);
  const banner=document.querySelector('.mobile-product-banner'); if(banner)new MutationObserver(schedulePosition).observe(banner,{attributes:true,attributeFilter:['style','class','hidden']});
  if(banner)banner.addEventListener('transitionend',schedulePosition);
  function toggle(open) {
    const wasOpen=panelOpen;panelOpen=open;clearTimeout(closeTimer);panel.inert=!open;
    if(open){panel.classList.remove('is-closing');panel.hidden=false;}
    else if(!panel.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      panel.classList.add('is-closing');closeTimer=setTimeout(()=>{if(!panelOpen){panel.hidden=true;panel.classList.remove('is-closing');position();}},240);
    }else{panel.hidden=true;panel.classList.remove('is-closing');}
    launcher.setAttribute('aria-expanded',String(open));launcher.setAttribute('aria-label',open?'eyequipment Assistent schließen':'eyequipment Assistent öffnen');
    position();updateBadge();
    if(open){if(pendingSession){const state=pendingSession;pendingSession=null;restore({...state,open:true});}else if(!restoring&&!feed.childElementCount)home();openedNotification();panel.focus({preventScroll:true});}
    else if(wasOpen&&!launcher.inert)launcher.focus();
    saveSession();
  }
  launcher.onclick=()=>toggle(!panelOpen); root.querySelector('.close').onclick=()=>toggle(false);
  root.querySelector('.restart').onclick=()=>respond('Noch mal von vorne',home);
  root.querySelector('.back').onclick=()=>restore({open:panelOpen,steps:steps.slice(0,-1)});
  feed.addEventListener('scroll',scheduleSave,{passive:true}); window.addEventListener('pagehide',saveSession);
  window.addEventListener('pageshow',async event=>{panel.classList.remove('keyboard-navigation');if(event.persisted){const saved=readSession();if(saved&&!restoring)await restore(saved);}requestAnimationFrame(()=>{if(panelOpen)panel.focus({preventScroll:true});});});
  root.addEventListener('pointerdown',()=>panel.classList.remove('keyboard-navigation'));
  root.addEventListener('keydown',e=>{if(e.key==='Tab')panel.classList.add('keyboard-navigation');if(e.key==='Escape')toggle(false);});
  ['eyequipment:b2b-update','eyequipment:native-b2b-ready','ShopyflowReady'].forEach(event=>window.addEventListener(event,()=>{catalog=null;feed.querySelectorAll('.card-price').forEach(p=>p.hidden=document.documentElement.dataset.nativeB2b!=='false');}));
  window.EyequipmentAssistant={open:()=>toggle(true),close:()=>toggle(false),refresh:()=>{catalog=null;home();},query};
  position();
  pendingSession=readSession();
  if(pendingSession?.open){const state=pendingSession;pendingSession=null;restore(state).then(openedNotification);}

  // Each highlight radio must have exactly one Finsweet field owner: its label.
  // The shop's DOMContentLoaded setup also adds a field to the input, which
  // Finsweet indexes as a second boolean filter when restored already checked.
  // Run after that setup and before the shop loads Finsweet after its data gate.
  function normalizeShopHighlights(){
    document.querySelectorAll('#wf-form-searchbar input[name="Highlights"],#wf-form-searchbar input[name="Hightlights"]').forEach(input=>{
      const label=input.closest('label');if(!label)return;
      input.removeAttribute('fs-cmsfilter-field');label.setAttribute('fs-cmsfilter-field','badge');
    });
  }
  if(document.readyState==='complete')normalizeShopHighlights();
  else document.addEventListener('DOMContentLoaded',normalizeShopHighlights,{once:true});
  const params=new URLSearchParams(location.search);
  // The native newsletter popup lives on home and product pages. On pages
  // without it, return to home and open that same signup instead of account login.
  if(params.get('eq_newsletter')==='1'){
    const start=Date.now();
    const openWhenReady=()=>{
      if(window.EyequipmentNewsletterPopup?.open){
        const clean=new URL(location.href);clean.searchParams.delete('eq_newsletter');history.replaceState(history.state,'',clean.href);
        toggle(false);window.EyequipmentNewsletterPopup.open();
      }else if(Date.now()-start<15000)setTimeout(openWhenReady,100);
    };openWhenReady();
  }
  const requested=[['Kategorie','eq_category'],['Muster','eq_pattern'],['Farbe','eq_color'],['Highlights','eq_highlight']].filter(([,key])=>params.has(key)).map(([name,key])=>({name,value:params.get(key)}));
  if(requested.length && document.querySelector('#wf-form-searchbar')) {
    const clean=new URL(location.href); ['eq_category','eq_pattern','eq_color','eq_highlight'].forEach(key=>clean.searchParams.delete(key));
    history.replaceState({...history.state,eyequipmentShopFilters:{radios:requested,search:''}},'',clean.href);
    // The shop's own restoration owns initialization and Finsweet readiness.
    // A second click/reset routine races its filter state and can empty the list.
    if(document.readyState!=='loading' && typeof window.restoreShopFilterState==='function')window.restoreShopFilterState();
  }
})();
