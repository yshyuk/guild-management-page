import { Hono } from 'hono';
import { clearSession, matchRole, readSession, writeSession } from '../auth';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

// 로그인 실패 시 지연 — 무차별 대입 속도 저하용
export const LOGIN_FAIL_DELAY_MS = 500;

app.post('/login', async (c) => {
  if (!c.env.AUTH_SECRET) {
    console.error('AUTH_SECRET is not configured');
    return c.json({ error: 'Auth is not configured' }, 500);
  }

  const body = await c.req.json<{ password?: unknown }>().catch(() => ({ password: undefined }));
  const password = typeof body.password === 'string' ? body.password : '';
  const role = await matchRole(password, c.env);
  if (!role) {
    await new Promise((resolve) => setTimeout(resolve, LOGIN_FAIL_DELAY_MS));
    return c.json({ error: 'Invalid password' }, 401);
  }

  await writeSession(c, role);
  return c.json({ role });
});

app.get('/me', async (c) => {
  const role = await readSession(c);
  if (!role) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ role });
});

app.post('/logout', (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

export default app;
