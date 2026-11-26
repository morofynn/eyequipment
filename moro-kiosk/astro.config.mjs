import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output:'server',
  adapter:cloudflare(),
  base:process.env.BASE_URL || '/bestellungen',
  vite:{plugins:[{
    name:'moro-receipt-module',
    resolveId(id){if(id==='virtual:moro-receipt')return '\0virtual:moro-receipt';},
    load(id){
      if(id!=='\0virtual:moro-receipt')return;
      const source=readFileSync(new URL('./receipt.js',import.meta.url),'utf8');
      return `import * as PDFLib from 'pdf-lib'; const window={PDFLib}; ${source}\nexport default window.KioskReceipt;`;
    }
  }]}
});
