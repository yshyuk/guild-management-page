import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { displayDate } from '@/lib/dates';
import type { Warning } from '@/lib/types';

type Props = {
  warnings: Warning[];
};

export default function WarningPanel({ warnings }: Props) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of warnings) map.set(w.memberName, (map.get(w.memberName) ?? 0) + 1);
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
  }, [warnings]);

  return (
    <Card className="rounded-[28px] border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <AlertTriangle className="h-5 w-5 text-amber-500" />경고 현황
        </CardTitle>
        <CardDescription>길드원별 누적 경고 횟수와 경고 내역입니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="overflow-hidden rounded-2xl border border-zinc-200">
          <div className="grid grid-cols-[1.6fr_0.6fr] bg-zinc-50 px-3 py-3 text-xs font-semibold text-zinc-600">
            <div>길드원</div>
            <div className="text-center">경고 횟수</div>
          </div>
          <div className="max-h-[360px] overflow-auto">
            {counts.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-zinc-400">경고 기록이 없습니다.</div>
            ) : (
              counts.map((row) => (
                <div
                  key={row.name}
                  className="grid grid-cols-[1.6fr_0.6fr] items-center border-t border-zinc-100 px-3 py-2.5 text-sm"
                >
                  <div className="font-medium text-zinc-800">{row.name}</div>
                  <div className="text-center">
                    <Badge variant={row.count >= 3 ? 'destructive' : 'secondary'} className="rounded-full">
                      {row.count}회
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-zinc-700">경고 내역</div>
          <div className="max-h-[360px] space-y-2 overflow-auto">
            {warnings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-3 py-8 text-center text-sm text-zinc-400">
                경고 내역이 없습니다.
              </div>
            ) : (
              warnings.map((w) => (
                <div key={w.id} className="rounded-2xl border border-zinc-200 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-800">{w.memberName}</span>
                    <span className="text-xs text-zinc-500">{displayDate(w.date)}</span>
                  </div>
                  {w.reason && <div className="mt-1 text-sm text-zinc-600">{w.reason}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
