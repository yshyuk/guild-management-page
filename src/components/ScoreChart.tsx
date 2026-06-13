import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  toScoreMap,
  buildSingleSeasonBars,
  endedSeasons,
  buildTrendData,
  lineColor,
} from '@/lib/analysis';
import type { Member, ScoreSeason, SeasonScore } from '@/lib/types';

type Props = {
  members: Member[];
  seasons: ScoreSeason[];
  selectedSeasonId: number | null;
  allScores: SeasonScore[];
  today: string;
};

const EMPTY = (msg: string) => (
  <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-16 text-center text-sm text-zinc-500">
    {msg}
  </div>
);

export default function ScoreChart({ members, seasons, selectedSeasonId, allScores, today }: Props) {
  const [mode, setMode] = useState<'single' | 'trend'>('single');
  const [memberFilter, setMemberFilter] = useState<string>('all');

  const singleData = useMemo(() => {
    if (selectedSeasonId === null) return [];
    const map = toScoreMap(
      allScores.filter((s) => s.seasonId === selectedSeasonId).map((s) => ({ memberId: s.memberId, score: s.score })),
    );
    return buildSingleSeasonBars(members, map);
  }, [members, allScores, selectedSeasonId]);

  const ended = useMemo(() => endedSeasons(seasons, today), [seasons, today]);
  const trendData = useMemo(() => buildTrendData(members, allScores, ended), [members, allScores, ended]);

  const drawnMembers = useMemo(() => {
    const withScore = members.filter((m) =>
      allScores.some((s) => s.memberId === m.id && ended.some((e) => e.id === s.seasonId)),
    );
    if (memberFilter === 'all') return withScore;
    return withScore.filter((m) => m.name === memberFilter);
  }, [members, allScores, ended, memberFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={['rounded-lg px-3 py-1.5 text-sm font-medium transition', mode === 'single' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}
          >
            단일 시즌
          </button>
          <button
            type="button"
            onClick={() => setMode('trend')}
            className={['rounded-lg px-3 py-1.5 text-sm font-medium transition', mode === 'trend' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}
          >
            전체 시즌추이
          </button>
        </div>
        {mode === 'trend' && (
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger className="w-[200px] rounded-2xl">
              <SelectValue placeholder="길드원 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 길드원</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.name}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {mode === 'single' ? (
        singleData.length === 0 ? (
          EMPTY('입력된 점수가 없습니다. 점수표에서 점수를 입력하세요.')
        ) : (
          <div className="h-[460px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={singleData} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} width={72} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toLocaleString()} />
                <Tooltip
                  formatter={(value) => {
                    const num = typeof value === 'number' ? value : Number(value);
                    return Number.isFinite(num) ? num.toLocaleString() : String(value ?? '');
                  }}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {singleData.map((_, idx) => (
                    <Cell key={idx} fill={lineColor(idx)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      ) : ended.length === 0 ? (
        EMPTY('종료된 시즌이 없습니다. 시즌 종료일이 지나면 추이에 표시됩니다.')
      ) : drawnMembers.length === 0 ? (
        EMPTY('표시할 길드원 점수가 없습니다.')
      ) : (
        <div className="space-y-4">
          <div className="h-[460px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="season" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={72} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toLocaleString()} />
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
                    stroke={lineColor(memberFilter === 'all' ? idx : members.findIndex((x) => x.id === m.id))}
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
          {memberFilter === 'all' && (
            <div className="flex max-h-24 flex-wrap gap-x-4 gap-y-1.5 overflow-auto rounded-2xl border border-zinc-200 p-3">
              {drawnMembers.map((m, idx) => (
                <div key={m.id} className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: lineColor(idx) }} />
                  {m.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
