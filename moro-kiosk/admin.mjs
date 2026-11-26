import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dashboardHandler } from './dashboard.mjs';
const require=createRequire(import.meta.url);
const receipt={PDFLib:require('pdf-lib')};
const load=name=>readFileSync(new URL(name,import.meta.url),'utf8');
new Function('window',load('./receipt.js'))(receipt);
http.createServer(dashboardHandler(receipt.KioskReceipt,load('./receipt.css'),process.env))
  .listen(Number(process.env.PORT||8788),'127.0.0.1');
