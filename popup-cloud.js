(() => {
  'use strict';
  if (!['eyequipment.webflow.io','eyequipment.com','www.eyequipment.com'].includes(location.hostname) || window.EyequipmentNewsletterPopup) return;
  const config = { delay: 30000, ready: true, endpoint: '/newsletter-service/api/signup' };
  const submittedReturn = false;
  const preview = new URLSearchParams(location.search).get('eq_newsletter_preview') === '1';
  const shownKey = 'eq-newsletter-login-promo-shown';
  const dismissedKey = 'eq-newsletter-login-promo-dismissed';

  const pendingKey = 'eq-newsletter-signup-pending-v1';
  const stateEndpoint = 'https://shopify.com/102208405891/account/customer/api/2026-07/graphql';
  const stateQuery = 'query NewsletterPopupState { customer { emailAddress { emailAddress marketingState } orders(first: 1) { nodes { id } } } }';
  const root = document.querySelector('[data-eq-newsletter-promo]');
  if (!root) return;
  document.body.append(root);
  const panel = root.querySelector('.eq-newsletter-popup');
  const form = root.querySelector('[data-eq-newsletter-signup]');
  const email = form.querySelector('input[type=email]');
  const submit = form.querySelector('[type=submit]');
  const privacy = form.querySelector('#eq-newsletter-privacy a');
  if (privacy) privacy.href = '/datenschutz';
  const message = root.querySelector('[data-eq-newsletter-message]');
  let previousFocus, previousOverflow, background = [], busy = false, checking = false;
  let already = false, pending = false;
  new MutationObserver(() => {
    const disabled = !config.ready || busy || already || pending || submittedReturn;
    if (submit.disabled !== disabled) submit.disabled = disabled;
  }).observe(submit, {attributes:true,attributeFilter:['disabled']});
  const read = key => { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } };
  const remember = key => { try { localStorage.setItem(key, String(Date.now())); } catch {} };
  const recent = (key, days = 30) => !(preview && [shownKey,dismissedKey].includes(key)) && Date.now() - read(key) < days * 86400000;
  const b2b = () => window.EyequipmentNativeB2B?.isB2B === true;
  const focusable = () => [...panel.querySelectorAll('a[href],button,input,[tabindex="0"]')].filter(e => !e.disabled && e.getClientRects().length);
  email.autocomplete = 'email'; email.inputMode = 'email'; email.placeholder = 'du@beispiel.de'; email.maxLength = 254;
  panel.tabIndex = -1;
  form.method = 'post'; form.action = config.endpoint;
  function status(text) { message.textContent = text; }
  function setOpen(open) {
    if (open === !root.classList.contains('is-hidden')) return;
    root.classList.toggle('is-hidden', !open); root.setAttribute('aria-hidden', String(!open));
    if (open) {
      previousFocus = document.activeElement; previousOverflow = document.body.style.overflow;
      background = [...document.body.children].filter(e => e !== root && !['SCRIPT','STYLE'].includes(e.tagName)).map(e => [e,e.inert]);
      background.forEach(([e]) => e.inert = true); document.body.style.overflow = 'hidden';
      (email.disabled ? focusable()[0] || panel : email).focus();
    } else {
      document.body.style.overflow = previousOverflow || ''; background.forEach(([e,v]) => e.inert = v); background = [];
      if (previousFocus?.isConnected) previousFocus.focus();
    }
  }
  async function customerState() {
    let session;
    try { session = JSON.parse(localStorage.getItem('_sf_oauth_tokens') || 'null'); } catch { return null; }
    if (!session?.tokens?.access_token || Number(session.expiresAt) <= Date.now() + 5000) return null;
    const response = await fetch(stateEndpoint, {method:'POST',headers:{'Content-Type':'application/json',Authorization:session.tokens.access_token},body:JSON.stringify({query:stateQuery}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(6000)});
    const data = await response.json();
    if (!response.ok || data.errors || !data.data?.customer) throw Error('STATUS');
    return data.data.customer;
  }
  function reset() {
    submit.disabled = !config.ready || already || pending || submittedReturn;
    status(submittedReturn ? 'Deine Anmeldung wurde übermittelt. Bitte prüfe deine E-Mails und bestätige den Link, falls du eine Bestätigung erhältst.' : already ? 'Du bist bereits für den Newsletter angemeldet.' : !config.ready ? 'Staging-Vorschau: Die Shopify-Anmeldung ist noch nicht freigeschaltet.' : '');
  }
  async function open(manual = true) {
    if (checking || !root.classList.contains('is-hidden')) return;
    checking = true;
    try {
      let customer;
      try { customer = await customerState(); } catch { if (!manual) return; }
      const state = customer?.emailAddress?.marketingState;
      already = state === 'SUBSCRIBED'; pending = state === 'PENDING';
      if (!manual && (already || state === 'PENDING' || b2b() || recent(pendingKey, 1) || recent(shownKey) || recent(dismissedKey))) return;
      if (customer?.emailAddress?.emailAddress) email.value = customer.emailAddress.emailAddress;
      reset();
      if (state === 'PENDING') { status('Bitte bestätige deine Anmeldung über den Link in deiner E-Mail.'); submit.disabled = true; }
      if (!manual) root.setAttribute('data-eq-newsletter-opened-after-ms', String(Math.round(Date.now() - performance.timeOrigin)));
      setOpen(true); remember(shownKey);
    } finally { checking = false; }
  }
  function close(rememberChoice = false) { if (rememberChoice) remember(dismissedKey); setOpen(false); }
  reset(); root.classList.add('is-hidden'); root.setAttribute('aria-hidden', 'true');
  document.addEventListener('click', e => {
    if (e.target.closest('[data-eq-newsletter-open]')) { e.preventDefault(); open(); }
    if (e.target.closest('[data-eq-newsletter-close]') || e.target === root) { e.preventDefault(); close(true); }
  });
  document.addEventListener('keydown', e => {
    if (root.classList.contains('is-hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    if (e.key === 'Tab') {
      const list = focusable(), first = list[0], last = list.at(-1);
      if (!first) { e.preventDefault(); panel.focus(); }
      else if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('submit', async e => {
    if (e.target !== form) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (!config.ready || busy || already || pending || !form.reportValidity()) return;
    busy=true;submit.disabled=true;form.setAttribute('aria-busy','true');
    status('Deine Anmeldung wird übermittelt …');
    try {
      const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({email:email.value.trim(),consent:true,website:''}),signal:AbortSignal.timeout(45000)});
      const data=await response.json();
      if (!response.ok || typeof data.message!=='string') throw Error(typeof data.error==='string'?data.error:'Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es erneut.');
      pending=true;remember(pendingKey);status(data.message);
    } catch(error) {
      status(error?.name==='TimeoutError'?'Die Antwort dauert länger. Bitte prüfe dein Postfach, bevor du es erneut versuchst.':error?.name==='TypeError'?'Die Anmeldung ist gerade nicht erreichbar. Bitte versuche es erneut.':error.message);
    } finally {busy=false;form.removeAttribute('aria-busy');submit.disabled=already||pending;}
  }, true);
  window.addEventListener('pageshow', () => { busy = false; form.removeAttribute('aria-busy'); reset(); });
  let timer;
  function schedule() {
    clearTimeout(timer);
    const remaining = config.delay - (Date.now() - performance.timeOrigin);
    if (remaining > 0) { timer = setTimeout(schedule, remaining); return; }
    if (document.hidden || document.querySelector('#eq-consent-dialog[open],dialog[open]')) { timer = setTimeout(schedule,1000); return; }
    if (location.pathname === '/' || location.pathname === '/shop' || /^\/products\//.test(location.pathname)) open(false);
  }
  if (new URLSearchParams(location.search).get('newsletter') === '1' || new URLSearchParams(location.search).get('eq_newsletter') === '1') open();
  else schedule();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  window.EyequipmentNewsletterPopup = {open:() => open(),close:() => close(),version:'2026-11-18',delay:config.delay};
})();
