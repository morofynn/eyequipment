import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
export default defineConfig({ output: 'server', adapter:cloudflare(), base: process.env.BASE_URL || '/newsletter-service' });
