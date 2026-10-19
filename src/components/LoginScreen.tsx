import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Lock, Swords } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  /** viewer → admin 전환 시 true */
  adminOnly?: boolean;
  onLogin: (password: string) => Promise<boolean>;
  onCancel?: () => void;
};

export default function LoginScreen({ adminOnly = false, onLogin, onCancel }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await onLogin(password);
      if (!ok) {
        setError('비밀번호가 올바르지 않습니다.');
        setPassword('');
      }
    } catch {
      setError('연결에 실패했습니다. 잠시 후 다시 시도하세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <Card className="rounded-[28px] border-0 shadow-sm">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-sm ring-1 ring-zinc-900/10">
                <Swords className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                  GUILD MANAGER
                </div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-900">길드 컨텐츠 참여 관리</h1>
              </div>
              <p className="text-sm text-zinc-500">
                {adminOnly ? '관리자 비밀번호를 입력하세요.' : '입장하려면 비밀번호를 입력하세요.'}
              </p>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  aria-invalid={error ? true : undefined}
                  className="h-11 rounded-2xl pl-10"
                />
              </div>
              {error && <p className="text-sm text-rose-500">{error}</p>}
              <Button type="submit" className="h-11 w-full rounded-2xl" disabled={!password || submitting}>
                {submitting ? '확인 중...' : '입장'}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" className="h-11 w-full rounded-2xl" onClick={onCancel}>
                  취소
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
