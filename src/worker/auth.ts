import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import type { AppEnv, Role } from './types';

// 세션 쿠키: 값은 "<role>.<만료 epoch초>", HMAC 서명은 hono signed cookie 가 처리한다.
// 만료는 Max-Age(클라이언트 제어)만 믿지 않고 값 안의 exp 로 서버에서 다시 검증한다.
export const SESSION_COOKIE = 'gm_session';
export const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

const ROLES: readonly Role[] = ['viewer', 'admin'];

export function parseSessionValue(value: string, nowSec: number): Role | null {
  const [role, expRaw] = value.split('.');
  const exp = Number(expRaw);
  if (!ROLES.includes(role as Role)) return null;
  if (!Number.isFinite(exp) || exp <= nowSec) return null;
  return role as Role;
}

export async function readSession(c: Context<AppEnv>): Promise<Role | null> {
  const secret = c.env.AUTH_SECRET;
  if (!secret) return null;
  const value = await getSignedCookie(c, secret, SESSION_COOKIE);
  if (!value) return null;
  return parseSessionValue(value, Math.floor(Date.now() / 1000));
}

export async function writeSession(c: Context<AppEnv>, role: Role) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  await setSignedCookie(c, SESSION_COOKIE, `${role}.${exp}`, c.env.AUTH_SECRET, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: SESSION_TTL_SEC,
  });
}

export function clearSession(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// 해시 후 고정 길이 비교 → 길이·내용 모두 타이밍으로 새지 않음
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

// admin 비밀번호를 먼저 확인. 미설정(빈 값) 비밀번호는 절대 매칭하지 않는다.
export async function matchRole(
  password: string,
  env: { ADMIN_PASSWORD?: string; VIEWER_PASSWORD?: string },
): Promise<Role | null> {
  if (!password) return null;
  if (env.ADMIN_PASSWORD && (await safeEqual(password, env.ADMIN_PASSWORD))) return 'admin';
  if (env.VIEWER_PASSWORD && (await safeEqual(password, env.VIEWER_PASSWORD))) return 'viewer';
  return null;
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// /api/auth/* 를 제외한 모든 API: 미인증 401, viewer 의 쓰기 요청 403
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.path.startsWith('/api/auth/')) return next();

  const role = await readSession(c);
  if (!role) return c.json({ error: 'Unauthorized' }, 401);
  if (role !== 'admin' && !READ_METHODS.has(c.req.method)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  c.set('role', role);
  return next();
};
