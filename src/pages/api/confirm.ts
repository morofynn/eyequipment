import type { APIRoute } from 'astro';
import { confirm } from '../../lib/handlers.mjs';
export const prerender=false;
export const config={runtime:'edge'};
export const POST:APIRoute=({request,locals})=>confirm(request,(locals as any).runtime.env);
