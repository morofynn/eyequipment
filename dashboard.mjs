import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
const site = '6ab03675c10ac3c44d6b415b';
const form = '6ab07eeee61c695afb4777e1';
const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const euro = cents => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const cents = value => value != null && /^\d+(?:[.,]\d{1,2})?$/.test(String(value).trim())
  ? Math.round(Number(String(value).replace(',', '.')) * 100) : null;
const date = value => new Date(value).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

async function orders(WEBFLOW_TOKEN) {
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const response = await fetch(`https://api.webflow.com/v2/sites/${site}/forms/${form}/submissions?offset=${offset}&limit=100`, {
      headers: { Authorization: `Bearer ${WEBFLOW_TOKEN}` }, signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Webflow ${response.status}`);
    const result = await response.json();
    const batch = result.formSubmissions ?? [];
    all.push(...batch);
    if (batch.length < 100 || all.length >= (result.pagination?.total ?? Infinity)) break;
  }
  return all.sort((a, b) => Date.parse(b.dateSubmitted) - Date.parse(a.dateSubmitted));
}

function shell(title, body, extraCss = '') {
  return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${e(title)} · MORO Kiosk</title><style>
  *{box-sizing:border-box}body{background:#f3f2eb;color:#181917;font:16px Arial,sans-serif;margin:0}main{max-width:1140px;margin:auto;padding:40px 22px}h1{font:clamp(38px,6vw,72px) Georgia;margin:.25em 0}.tag{font-size:12px;letter-spacing:.17em;font-weight:bold;color:#426957}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin:26px 0}.card,section{background:white;border-radius:20px;padding:22px}.card strong{display:block;font:32px Georgia;margin-top:8px}section{margin:15px 0;overflow:auto}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:14px 10px;border-bottom:1px solid #e1e4db}th{background:#e0eee4}a{color:#253c31}form{display:flex;gap:10px;flex-wrap:wrap}input,button,.button{padding:12px 18px;border:1px solid #9caaa0;border-radius:24px;font:inherit}button,.button{background:#181917;color:white;text-decoration:none;display:inline-block}dl{display:grid;grid-template-columns:minmax(100px,1fr) 2fr;gap:10px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
  body{background:#f4f1fb}.tag,a{color:#3017b4}th{background:#eeebff}button,.button{background:#170cf1;border-color:#170cf1}.button.secondary{background:white;color:#170cf1}.actions{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.actions a{white-space:nowrap}.row-actions a{margin-right:12px;white-space:nowrap}.details-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.details-grid section{margin:0}.details-grid p{line-height:1.6}.order-total{background:#181917;color:#fff}.order-total td{font-weight:bold}.order-qty{text-align:right}.receipt-preview{max-width:680px;margin:auto}.receipt-preview section{margin:0;padding:0;overflow:visible;border-radius:0}.receipt-preview .r-table th{background:inherit}
  ${extraCss}</style><body><main><p class="tag">MORO KIOSK · OPTI 2027</p>${body}</main></body></html>`;
}

function positions(value) {
  return String(value ?? '').split('\n').flatMap(line => {
    const match = line.match(/^(\d+)\s*[x×]\s*(.+?)(?:\s*\||$)/i);
    return match ? [{ name: match[2], quantity: Number(match[1]) }] : [];
  });
}

const route = (view, id) => `?${view}=${encodeURIComponent(id)}`;
function actions(id, compact = false) {
  return `<a class="${compact?'':'button secondary'}" href="${route('customer',id)}">Gästeansicht</a>
    <a class="${compact?'':'button'}" href="${route('pdf',id)}">Bestell-PDF ↓</a>`;
}

function list(all, query) {
  const filtered = all.filter(({formResponse:f = {}}) =>
    [f.Referenz, f.Betrieb, f.Name, f.Email].some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase())));
  const ranked = new Map();
  let net = 0, valued = 0, newDealers = 0;
  for (const {formResponse:f = {}} of filtered) {
    const value = cents(f.Warenwert_nach_Rabatt_netto_EUR);
    if (value !== null) { net += value; valued++; }
    if (f.Haendlerstatus === 'Neuer Händler') newDealers++;
    for (const { name, quantity } of positions(f.Positionen)) {
      ranked.set(name, (ranked.get(name) ?? 0) + quantity);
    }
  }
  const top = [...ranked].sort((a,b) => b[1]-a[1]).slice(0,5);
  return shell('Bestellungen', `<h1>Bestellungen</h1><form><input name="q" value="${e(query)}" placeholder="Betrieb, Referenz oder E-Mail" aria-label="Bestellungen filtern"><button>Suchen</button></form>
  <div class="cards">${[['Bestellungen',filtered.length],['Neue Händler',newDealers],['Warenwert netto',euro(net)],['Ø Warenwert netto',valued?euro(net/valued):'–']].map(([label,value])=>`<div class="card">${label}<strong>${value}</strong></div>`).join('')}</div>
  <section><h2>Bestelleingänge</h2>${filtered.length?`<table><thead><tr><th>Betrieb / Referenz</th><th>Eingang</th><th>Stück</th><th>Warenwert netto</th><th>Belege</th></tr></thead><tbody>${filtered.map(({id,dateSubmitted,formResponse:f={}})=>`<tr><td><a href="${route('order',id)}"><strong>${e(f.Betrieb || f.Name || 'Bestellung')}</strong></a><br><small>${e(f.Referenz || id)}</small></td><td>${e(date(dateSubmitted))}</td><td>${positions(f.Positionen).reduce((sum,line)=>sum+line.quantity,0)||'–'}</td><td>${cents(f.Warenwert_nach_Rabatt_netto_EUR)===null?'–':euro(cents(f.Warenwert_nach_Rabatt_netto_EUR))}</td><td class="row-actions">${f.Bestellbeleg_oeffnen_PDF?actions(id,true):'–'}</td></tr>`).join('')}</tbody></table>`:'<p>Keine Einträge gefunden.</p>'}</section>
  ${top.length?`<section><h2>Meistbestellte Produkte</h2><table><tbody>${top.map(([name,count])=>`<tr><td>${e(name)}</td><td>${count} Stück</td></tr>`).join('')}</tbody></table></section>`:''}`);
}

async function receiptData(formResponse,receipt) {
  const link = new URL(formResponse.Bestellbeleg_oeffnen_PDF);
  if (link.origin !== 'https://moro-kiosk.webflow.io' || !link.hash.startsWith('#beleg=')) throw new Error('Beleg fehlt.');
  return receipt.decode(link.hash.slice(7));
}

function detail(order) {
  const f = order.formResponse ?? {}, id = order.id;
  const lines = positions(f.Positionen);
  const address = parts => parts.filter(Boolean).map(e).join('<br>') || '–';
  const totals = [
    ['Warenwert netto', f.Warenwert_nach_Rabatt_netto_EUR],
    ['Messerabatt', f.Messerabatt_EUR],
    ['Versand netto', f.Versand_netto_EUR],
    ['Umsatzsteuer', f.USt_EUR],
    ['Gesamt inkl. USt.', f.Gesamt_brutto_EUR]
  ].filter(([,value])=>cents(value)!==null);
  return shell('Bestellung',`<a href="?">← Alle Bestellungen</a><h1>${e(f.Betrieb || 'Bestellung')}</h1>
    <p>${e(f.Referenz)} · ${e(date(order.dateSubmitted))} · ${e(f.Haendlerstatus)}</p>
    ${f.Bestellbeleg_oeffnen_PDF?`<nav class="actions">${actions(id)}</nav>`:''}
    <section><h2>Bestellte Produkte</h2>${lines.length?`<table><thead><tr><th>Produkt</th><th class="order-qty">Stück</th></tr></thead>
    <tbody>${lines.map(line=>`<tr><td>${e(line.name)}</td><td class="order-qty">${line.quantity}</td></tr>`).join('')}</tbody></table>`:`<p>${e(f.Positionen||'Keine Positionsliste gespeichert.')}</p>`}</section>
    <div class="details-grid"><section><h2>Rechnung &amp; Kontakt</h2><p>${address([f.Betrieb,f.Name||[f.Vorname,f.Nachname].filter(Boolean).join(' '),f.Rechnungsstrasse,[f.RechnungsPLZ,f.Rechnungsort].filter(Boolean).join(' '),f.Rechnungsland,f.Email,f.Telefon,f.UStId])}</p></section>
    <section><h2>Lieferung</h2><p>${f.Lieferung_abweichend==='Ja'?address([f.Lieferbetrieb,f.Lieferstrasse,[f.LieferPLZ,f.Lieferort].filter(Boolean).join(' '),f.Lieferland]):'Wie Rechnungsanschrift'}</p></section></div>
    <section><h2>Bestellwert</h2><table><tbody>${totals.map(([label,value])=>`<tr class="${label.startsWith('Gesamt')?'order-total':''}"><td>${label}</td><td class="order-qty">${euro(cents(value))}</td></tr>`).join('')}</tbody></table><p>Zahlung auf ${e(f.Zahlungsart||'Rechnung')}</p></section>
    ${f.Anmerkungen?`<section><h2>Anmerkungen</h2><p style="white-space:pre-wrap">${e(f.Anmerkungen)}</p></section>`:''}`);
}

export function dashboardHandler(receipt,receiptCss,{WEBFLOW_TOKEN,MORO_ADMIN_PASSWORD}) {
return async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; img-src https://cdn.prod.website-files.com; frame-ancestors https://moro-kiosk.webflow.io; form-action 'self'; base-uri 'none'");
  const body = (status, html) => { res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'}); res.end(html); };
  if (!WEBFLOW_TOKEN || !MORO_ADMIN_PASSWORD || MORO_ADMIN_PASSWORD.length<24) {
    console.warn('MORO dashboard configuration:', !WEBFLOW_TOKEN ? 'Webflow token missing' : !MORO_ADMIN_PASSWORD ? 'Admin password missing' : 'Admin password too short');
    return body(503,'Das Dashboard wird eingerichtet.');
  }
  const expected = Buffer.from('Basic '+Buffer.from('moro:'+MORO_ADMIN_PASSWORD).toString('base64'));
  const auth = Buffer.from(req.headers.authorization ?? '');
  if (expected.length !== auth.length || !timingSafeEqual(expected,auth)) {
    res.setHeader('WWW-Authenticate','Basic realm="MORO Kiosk"');
    return body(401,'Anmeldung erforderlich.');
  }
  if (req.method !== 'GET') return body(405,'Methode nicht unterstützt.');
  try {
    const url = new URL(req.url,'http://localhost');
    const all = await orders(WEBFLOW_TOKEN);
    const id = url.searchParams.get('order') || url.searchParams.get('pdf') || url.searchParams.get('customer');
    if (!id) return body(200,list(all,(url.searchParams.get('q') ?? '').slice(0,150)));
    const order = all.find(row => row.id===id);
    if (!order) return body(404,shell('Bestellung fehlt','<h1>Bestellung nicht gefunden</h1>'));
    const f = order.formResponse ?? {};
    if (url.searchParams.has('pdf') || url.searchParams.has('customer')) {
      if (!f.Bestellbeleg_oeffnen_PDF) return body(404,shell('Beleg fehlt','<h1>Für diesen Eintrag gibt es keinen PDF-Beleg.</h1>'));
      const data = await receiptData(f,receipt);
      if (url.searchParams.has('customer')) {
        const { c: customer, h: dealer, ...guest } = data;
        return body(200,shell('Gästeansicht',`<nav class="actions"><a class="button secondary" href="${route('order',id)}">← Zur Bestellung</a><a class="button" href="${route('pdf',id)}&amp;view=customer">Gäste-PDF ↓</a></nav>
        <div class="receipt-preview">${receipt.html(guest)}</div>`,receiptCss));
      }
      if (url.searchParams.get('view')==='customer') { delete data.c; delete data.h; }
      const pdf = await receipt.makePdf(data);
      res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="MORO-Bestellbeleg.pdf"'});
      return res.end(Buffer.from(pdf));
    }
    return body(200,detail(order));
  } catch {
    return body(502,shell('Daten nicht verfügbar','<h1>Daten gerade nicht verfügbar</h1><p>Bitte versuche es erneut. Falls der Fehler bleibt, prüfe Webflow-Zugang und Beleg.</p>'));
  }
};
}
