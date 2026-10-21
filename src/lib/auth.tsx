import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import LoginScreen from '@/components/LoginScreen';
import { AUTH_EXPIRED_EVENT } from '@/lib/api';

export type Role = 'viewer' | 'admin';

type AuthContextValue = {
  role: Role;
  canEdit: boolean;
  logout: () => Promise<void>;
  requestAdminLogin: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthGate');
  return ctx;
}

async function fetchRole(): Promise<Role | null> {
  const res = await fetch('/api/auth/me', { cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`auth/me failed: ${res.status}`);
  return ((await res.json()) as { role: Role }).role;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null | 'loading'>('loading');
  // viewer 가 "관리자 로그인"을 눌렀을 때
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);

  useEffect(() => {
    fetchRole()
      .then(setRole)
      .catch(() => setRole(null));

    const onExpired = () => setRole(null);
    // 앱을 오래 켜둔 뒤 돌아왔을 때 세션 만료 감지 (네트워크 오류는 무시)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      fetchRole()
        .then((next) => { if (next === null) setRole(null); })
        .catch(() => {});
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { role: Role };
    setRole(data.role);
    setAdminLoginOpen(false);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setRole(null);
  }, []);

  const requestAdminLogin = useCallback(() => setAdminLoginOpen(true), []);

  if (role === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 text-sm text-zinc-400">
        불러오는 중...
      </div>
    );
  }

  if (role === null || adminLoginOpen) {
    return (
      <LoginScreen
        adminOnly={adminLoginOpen}
        onLogin={login}
        onCancel={role !== null ? () => setAdminLoginOpen(false) : undefined}
      />
    );
  }

  return (
    <AuthContext.Provider value={{ role, canEdit: role === 'admin', logout, requestAdminLogin }}>
      {children}
    </AuthContext.Provider>
  );
}
