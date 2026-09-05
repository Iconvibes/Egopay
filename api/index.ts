/**
 * Vercel serverless entry point.
 *
 * Wraps the existing Express app (src/app.ts) as a serverless function.
 * The frontend is served as static files by Vercel (see vercel.json), so the
 * Express static/SPA fallback section is inert here — only /api/* reaches
 * this function.
 */
import { createApp } from '../src/app.js';

// Express 5 apps are directly invocable as Node request handlers.
export default createApp();
