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
import { Input } from '@/components/ui/input';
import {
  toScoreMap,
  buildSingleSeasonBars,
  endedSeasons,
  buildTrendData,
  lineColor,
} from '@/lib/analysis';
import { bucketsFor, findBucket } from '@/lib/score';
import type { Member, ScoreSeason, ScoreType, SeasonScore } from '@/lib/types';

type Props = {
  type: ScoreType;
  members: Member[];
  seasons: ScoreSeason[];
  selectedSeasonId: number | null;
  allScores: SeasonScore[];
};

// 종목별 y축 눈금 단위 (강림전은 점수가 수천만 단위 → 250만)
const Y_AXIS_UNIT: Record<ScoreType, number> = {
  강림전: 2_500_000,
  길드전: 100,
  총력전: 500,
};

// 종목별 y축 고정 최소값 (강림전 1000만)
const Y_AXIS_MIN: Record<ScoreType, number> = {
  강림전: 10_000_000,
  길드전: 0,
  총력전: 3000,
};

// 강림전은 점수가 수천만 단위라 '만' 단위로 축약 표시
function formatScore(type: ScoreType, v: number): string {
  return type === '강림전' ? `${(v / 10000).toLocaleString()}만` : v.toLocaleString();
}

// 고정 최소값(bottom)부터 데이터 최대값을 덮는 지점까지 unit 간격으로 눈금 배열 생성
function buildYTicks(bottom: number, maxValue: number, unit: number): number[] {
  const safeMax = Number.isFinite(maxValue) ? maxValue : bottom;
  let top = Math.ceil(safeMax / unit) * unit;
  if (top <= bottom) top = bottom + unit;
  const ticks: number[] = [];
  for (let v = bottom; v <= top; v += unit) ticks.push(v);
  return ticks;
}

const EMPTY = (msg: string) => (
  <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-16 text-center text-sm text-zinc-500">
    {msg}
  </div>
);

export default function ScoreChart({ type, members, seasons, selectedSeasonId, allScores }: Props) {
  const yUnit = Y_AXIS_UNIT[type];
  const yMin = Y_AXIS_MIN[type];
  const [mode, setMode] = useState<'single' | 'trend'>('single');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [bucketScore, setBucketScore] = useState<string>('');

  const singleData = useMemo(() => {
    if (selectedSeasonId === null) return [];
    const map = toScoreMap(
      allScores.filter((s) => s.seasonId === selectedSeasonId).map((s) => ({ memberId: s.memberId, score: s.score })),
    );
    return buildSingleSeasonBars(members, map);
  }, [members, allScores, selectedSeasonId]);

  const ended = useMemo(() => endedSeasons(seasons), [seasons]);
  const trendData = useMemo(() => buildTrendData(members, allScores, ended), [members, allScores, ended]);

  const singleTicks = useMemo(() => {
    const max = singleData.reduce((m, d) => Math.max(m, d.score ?? 0), 0);
    return buildYTicks(yMin, max, yUnit);
  }, [singleData, yMin, yUnit]);

  const trendTicks = useMemo(() => {
    let max = 0;
    for (const row of trendData) {
      for (const [key, val] of Object.entries(row)) {
        if (key === 'season') continue;
        if (typeof val === 'number') max = Math.max(max, val);
      }
    }
    return buildYTicks(yMin, max, yUnit);
  }, [trendData, yMin, yUnit]);

  // 선택 시즌 점수맵 (점수 구간 필터 소속 판정 기준)
  const selectedScoreMap = useMemo(
    () =>
      toScoreMap(
        allScores
          .filter((s) => s.seasonId === selectedSeasonId)
          .map((s) => ({ memberId: s.memberId, score: s.score })),
      ),
    [allScores, selectedSeasonId],
  );

  // 입력 점수가 속한 구간 (빈칸이면 필터 없음)
  const activeBucket = useMemo(() => {
    const n = Number(bucketScore);
    if (bucketScore.trim() === '' || Number.isNaN(n)) return null;
    return findBucket(n, type);
  }, [bucketScore, type]);

  const drawnMembers = useMemo(() => {
    let withScore = members.filter((m) =>
      allScores.some((s) => s.memberId === m.id && ended.some((e) => e.id === s.seasonId)),
    );
    if (activeBucket) {
      withScore = withScore.filter((m) => {
        const v = selectedScoreMap.get(m.id);
        return v !== undefined && v >= activeBucket.min && v <= activeBucket.max;
      });
    }
    if (memberFilter === 'all') return withScore;
    return withScore.filter((m) => m.name === memberFilter);
  }, [members, allScores, ended, memberFilter, activeBucket, selectedScoreMap]);

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
          <div className="flex flex-wrap items-center gap-2">
            <Select value={memberFilter} onValueChange={setMemberFilter}>
              <SelectTrigger className="w-[160px] rounded-2xl">
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
            <Input
              type="number"
              inputMode="numeric"
              value={bucketScore}
              onChange={(e) => setBucketScore(e.target.value)}
              placeholder="점수 입력(구간 필터)"
              title="선택 시즌 점수 기준으로 해당 구간 길드원만 표시"
              className="w-[150px] rounded-2xl"
            />
            <Select
              value={activeBucket?.label ?? 'all'}
              onValueChange={(v) => {
                if (v === 'all') {
                  setBucketScore('');
                  return;
                }
                const b = bucketsFor(type).find((x) => x.label === v);
                if (b) setBucketScore(String(Number.isFinite(b.min) ? b.min : b.max));
              }}
            >
              <SelectTrigger className="w-[170px] rounded-2xl">
                <SelectValue placeholder="구간 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">구간 전체</SelectItem>
                {bucketsFor(type).map((b) => (
                  <SelectItem key={b.label} value={b.label}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                <YAxis tick={{ fontSize: 12 }} width={72} domain={[singleTicks[0], singleTicks[singleTicks.length - 1]]} ticks={singleTicks} tickFormatter={(v: number) => formatScore(type, v)} />
                <Tooltip
                  formatter={(value) => {
                    const num = typeof value === 'number' ? value : Number(value);
                    return Number.isFinite(num) ? formatScore(type, num) : String(value ?? '');
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
                <YAxis tick={{ fontSize: 12 }} width={72} domain={[trendTicks[0], trendTicks[trendTicks.length - 1]]} ticks={trendTicks} tickFormatter={(v: number) => formatScore(type, v)} />
                <Tooltip
                  formatter={(value) => {
                    const num = typeof value === 'number' ? value : Number(value);
                    return Number.isFinite(num) ? formatScore(type, num) : String(value ?? '');
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
