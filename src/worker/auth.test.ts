import { describe, expect, it } from 'vitest';
import app from './index';
import { matchRole, parseSessionValue, safeEqual } from './auth';

const env = {
  DB: {} as D1Database,
  ASSETS: { fetch: async () => new Response('asset', { status: 404 }) } as unknown as Fetcher,
  VIEWER_PASSWORD: 'view-pw',
  ADMIN_PASSWORD: 'admin-pw',
  AUTH_SECRET: 'test-secret-0123456789abcdef0123456789',
};

async function login(password: string) {
  return app.request(
    '/api/auth/login',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) },
    env,
  );
}

async function sessionCookie(password: string) {
  const res = await login(password);
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0];
}

describe('parseSessionValue', () => {
  it('유효한 role 과 미래 만료를 통과시킨다', () => {
    expect(parseSessionValue('admin.2000', 1000)).toBe('admin');
    expect(parseSessionValue('viewer.2000', 1000)).toBe('viewer');
  });

  it('만료·잘못된 role·형식 오류를 거부한다', () => {
    expect(parseSessionValue('admin.1000', 1000)).toBeNull();
    expect(parseSessionValue('root.2000', 1000)).toBeNull();
    expect(parseSessionValue('admin', 1000)).toBeNull();
    expect(parseSessionValue('admin.abc', 1000)).toBeNull();
  });
});

describe('safeEqual / matchRole', () => {
  it('같은 문자열만 일치한다', async () => {
    expect(await safeEqual('abc', 'abc')).toBe(true);
    expect(await safeEqual('abc', 'abd')).toBe(false);
    expect(await safeEqual('abc', 'abcd')).toBe(false);
  });

  it('비밀번호로 role 을 판별하고, 미설정 비밀번호는 매칭하지 않는다', async () => {
    expect(await matchRole('admin-pw', env)).toBe('admin');
    expect(await matchRole('view-pw', env)).toBe('viewer');
    expect(await matchRole('nope', env)).toBeNull();
    expect(await matchRole('', { ADMIN_PASSWORD: '', VIEWER_PASSWORD: '' })).toBeNull();
  });
});

describe('API 보호', () => {
  it('세션 없으면 401', async () => {
    const res = await app.request('/api/members', {}, env);
    expect(res.status).toBe(401);
  });

  it('위조된 쿠키는 401', async () => {
    const res = await app.request('/api/members', { headers: { Cookie: 'gm_session=admin.9999999999.forged' } }, env);
    expect(res.status).toBe(401);
  });

  it('틀린 비밀번호는 401 이고 쿠키를 주지 않는다', async () => {
    const res = await login('wrong');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('로그인 쿠키는 HttpOnly·Secure·7일', async () => {
    const res = await login('view-pw');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: 'viewer' });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('Max-Age=604800');
  });

  it('/me 는 현재 role 을 돌려준다', async () => {
    const cookie = await sessionCookie('admin-pw');
    const res = await app.request('/api/auth/me', { headers: { Cookie: cookie } }, env);
    expect(await res.json()).toEqual({ role: 'admin' });
  });

  it('viewer 의 쓰기 요청은 403', async () => {
    const cookie = await sessionCookie('view-pw');
    const res = await app.request('/api/members', { method: 'POST', headers: { Cookie: cookie } }, env);
    expect(res.status).toBe(403);
  });

  it('admin 의 쓰기 요청은 미들웨어를 통과한다', async () => {
    const cookie = await sessionCookie('admin-pw');
    // DB 를 건드리지 않도록 없는 경로로 확인 → 미들웨어 통과 후 정적 자산 폴백(404)
    const res = await app.request('/api/__nope__', { method: 'POST', headers: { Cookie: cookie } }, env);
    expect(res.status).toBe(404);
  });

  it('AUTH_SECRET 이 바뀌면 기존 세션은 무효', async () => {
    const cookie = await sessionCookie('admin-pw');
    const res = await app.request(
      '/api/auth/me',
      { headers: { Cookie: cookie } },
      { ...env, AUTH_SECRET: 'rotated-secret-0123456789abcdef' },
    );
    expect(res.status).toBe(401);
  });
});
