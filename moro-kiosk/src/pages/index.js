import receipt from 'virtual:moro-receipt';
import receiptCss from '../../receipt.css?raw';
import { dashboardHandler } from '../../dashboard.mjs';

export const prerender = false;
export async function ALL({ request, locals }) {
  const headers = new Headers();
  let status = 500;
  let body = 'Bestellübersicht gerade nicht verfügbar.';
  const run = dashboardHandler(receipt, receiptCss, locals.runtime?.env ?? {});
  await run({
    headers: Object.fromEntries(request.headers),
    method: request.method,
    url: new URL(request.url).pathname + new URL(request.url).search
  }, {
    setHeader: (key,value) => headers.set(key,value),
    writeHead(code, values) {
      status = code;
      for (const [key,value] of Object.entries(values)) headers.set(key,value);
    },
    end(value) { body = value; }
  });
  return new Response(body,{status,headers});
}
