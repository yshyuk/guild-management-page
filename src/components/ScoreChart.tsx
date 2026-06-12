import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { indexScores, buildChartData, lineColor } from '@/lib/analysis';
import type { Member, ScoreCell } from '@/lib/types';

type Props = {
  members: Member[];
  cells: ScoreCell[];
};

export default function ScoreChart({ members, cells }: Props) {
  const index = useMemo(() => indexScores(cells), [cells]);
  const data = useMemo(() => buildChartData(members, index), [members, index]);

  // 점수가 하나라도 있는 길드원만 선으로 그린다.
  const drawnMembers = useMemo(
    () => members.filter((m) => index.byMember.has(m.id)),
    [members, index],
  );

  if (index.maxRound === 0 || drawnMembers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-16 text-center text-sm text-zinc-500">
        입력된 점수가 없습니다. 점수표에서 점수를 입력하세요.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h-[460px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="round" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              width={64}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <Tooltip
              formatter={(value) => {
                const num = typeof value === 'number' ? value : Number(value);
                return Number.isFinite(num) ? num.toLocaleString() : String(value ?? '');
              }}
              contentStyle={{ borderRadius: 12, fontSize: 12 }}
            />
            {drawnMembers.map((m, idx) => (
              <Line
                key={m.id}
                type="monotone"
                dataKey={m.name}
                stroke={lineColor(idx)}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 길드원 색상 범례 (스크롤 가능) */}
      <div className="flex max-h-24 flex-wrap gap-x-4 gap-y-1.5 overflow-auto rounded-2xl border border-zinc-200 p-3">
        {drawnMembers.map((m, idx) => (
          <div key={m.id} className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: lineColor(idx) }} />
            {m.name}
          </div>
        ))}
      </div>
    </div>
  );
}
