import type { Context, Next } from 'hono';
import { verifyToken, type JwtPayload } from '../lib/auth.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'Non authentifié' }, 401);
  try {
    const payload = verifyToken(token);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Token invalide ou expiré' }, 401);
  }
}

export async function requireAdmin(c: Context, next: Next) {
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'Non authentifié' }, 401);
  try {
    const payload = verifyToken(token);
    if (!payload.isAdmin) return c.json({ error: 'Droits insuffisants' }, 403);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Token invalide ou expiré' }, 401);
  }
}

export async function optionalAuth(c: Context, next: Next) {
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    try { c.set('user', verifyToken(token)); } catch { /* ignore */ }
  }
  await next();
}
