import type { APIRoute } from 'astro';
import { signup } from '../../lib/handlers.mjs';
export const prerender=false;
export const config={runtime:'edge'};
export const POST:APIRoute=({request,locals})=>signup(request,(locals as any).runtime.env);
