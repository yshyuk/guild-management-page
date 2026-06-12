import { useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { bucketize, bucketStart, bucketLabel, deltaText, deltaColorClass } from '@/lib/score';
import { indexScores, buildRanking, latestScore } from '@/lib/analysis';
import type { Member, ScoreCell, ScoreSeason, ScoreType } from '@/lib/types';

type Props = {
  type: ScoreType;
  members: Member[];
};

const BUCKET_SIZE = 500;

export default function StatsBoard({ type, members }: Props) {
  const [seasons, setSeasons] = useState<ScoreSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [cells, setCells] = useState<ScoreCell[]>([]);
  const [round, setRound] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // 길드전 전용: 총력전 점수 (같은 구간 분포 분석용)
  const [powerCells, setPowerCells] = useState<ScoreCell[]>([]);

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );
  const roundCount = selectedSeason?.roundCount ?? 0;
  const rounds = useMemo(() => Array.from({ length: roundCount }, (_, i) => i + 1), [roundCount]);

  // 시즌 목록 로드
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ScoreSeason[]>(`/score-seasons?type=${encodeURIComponent(type)}`)
      .then((data) => {
        if (cancelled) return;
        setSeasons(data);
        setSelectedSeasonId(data.length > 0 ? data[data.length - 1].id : null);
      })
      .catch(console.error)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [type]);

  // 선택 시즌 점수 로드 + 기본 차수 = 마지막 차수
  useEffect(() => {
    if (selectedSeasonId === null) {
      setCells([]);
      return;
    }
    let cancelled = false;
    api
      .get<ScoreCell[]>(`/scores?seasonId=${selectedSeasonId}`)
      .then((data) => {
        if (cancelled) return;
        setCells(data);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [selectedSeasonId]);

  useEffect(() => {
    if (roundCount > 0) setRound(roundCount);
  }, [roundCount, selectedSeasonId]);

  // 길드전일 때 최신 총력전 시즌 점수 로드
  useEffect(() => {
    if (type !== '길드전') {
      setPowerCells([]);
      return;
    }
    let cancelled = false;
    api
      .get<ScoreSeason[]>(`/score-seasons?type=${encodeURIComponent('총력전')}`)
      .then(async (pSeasons) => {
        if (cancelled || pSeasons.length === 0) return;
        const latest = pSeasons[pSeasons.length - 1];
        const pCells = await api.get<ScoreCell[]>(`/scores?seasonId=${latest.id}`);
        if (!cancelled) setPowerCells(pCells);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [type]);

  const index = useMemo(() => indexScores(cells), [cells]);
  const ranking = useMemo(() => buildRanking(members, index, round), [members, index, round]);

  // 점수구간별 인원집계 (선택 차수 기준)
  const buckets = useMemo(() => bucketize(ranking.map((r) => r.score), BUCKET_SIZE), [ranking]);
  const maxBucketCount = Math.max(1, ...buckets.map((b) => b.count));

  // 길드전: 같은 총력전 점수구간별 길드전 점수 분포
  const powerIndex = useMemo(() => indexScores(powerCells), [powerCells]);
  const crossDistribution = useMemo(() => {
    if (type !== '길드전' || powerIndex.maxRound === 0) return [];
    // 멤버를 총력전(최신 차수) 점수 구간으로 묶고, 각자의 길드전(선택 차수) 점수를 모은다.
    const groups = new Map<number, { member: string; guild: number; power: number }[]>();
    for (const m of members) {
      const power = latestScore(powerIndex, m.id, powerIndex.maxRound);
      const guild = latestScore(index, m.id, round);
      if (!power || !guild) continue;
      const start = bucketStart(power.score, BUCKET_SIZE);
      const list = groups.get(start) ?? [];
      list.push({ member: m.name, guild: guild.score, power: power.score });
      groups.set(start, list);
    }
    return [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([start, list]) => ({
        start,
        label: bucketLabel(start, BUCKET_SIZE),
        members: list.sort((a, b) => b.guild - a.guild),
      }));
  }, [type, powerIndex, index, members, round]);

  if (loading) {
    return (
      <Card className="rounded-[28px] border-0 shadow-sm">
        <CardContent className="py-16 text-center text-sm text-zinc-400">불러오는 중...</CardContent>
      </Card>
    );
  }

  if (!selectedSeason) {
    return (
      <Card className="rounded-[28px] border-0 shadow-sm">
        <CardContent className="py-16 text-center text-sm text-zinc-500">
          등록된 {type} 시즌이 없습니다. 점수 탭에서 시즌을 추가하고 점수를 입력하세요.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 컨트롤 */}
      <Card className="rounded-[28px] border-0 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Select
            value={selectedSeasonId ? String(selectedSeasonId) : undefined}
            onValueChange={(v) => setSelectedSeasonId(Number(v))}
          >
            <SelectTrigger className="w-[200px] rounded-2xl">
              <SelectValue placeholder="시즌 선택" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(round)} onValueChange={(v) => setRound(Number(v))}>
            <SelectTrigger className="w-[120px] rounded-2xl">
              <SelectValue placeholder="차수" />
            </SelectTrigger>
            <SelectContent>
              {rounds.map((r) => (
                <SelectItem key={r} value={String(r)}>
                  {r}차 기준
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-zinc-500">{ranking.length}명 집계</span>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        {/* 순위표 */}
        <Card className="rounded-[28px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Trophy className="h-5 w-5 text-amber-500" />길드 내 {type} 순위
            </CardTitle>
            <CardDescription>{round}차 점수 기준. 변동은 직전 차수 대비입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
                입력된 점수가 없습니다.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-zinc-200">
                <div className="grid grid-cols-[0.5fr_1.6fr_1fr_0.9fr] bg-zinc-50 px-3 py-3 text-xs font-semibold text-zinc-600">
                  <div className="text-center">순위</div>
                  <div>닉네임</div>
                  <div className="text-right">점수</div>
                  <div className="text-right">변동</div>
                </div>
                <div className="max-h-[640px] overflow-auto">
                  {ranking.map((row) => (
                    <div
                      key={row.memberId}
                      className="grid grid-cols-[0.5fr_1.6fr_1fr_0.9fr] items-center border-t border-zinc-100 px-3 py-2.5 text-sm"
                    >
                      <div className="text-center font-semibold text-zinc-700">
                        {row.rank <= 3 ? (
                          <span
                            className={[
                              'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-white',
                              row.rank === 1 ? 'bg-amber-500' : row.rank === 2 ? 'bg-zinc-400' : 'bg-amber-700',
                            ].join(' ')}
                          >
                            {row.rank}
                          </span>
                        ) : (
                          row.rank
                        )}
                      </div>
                      <div className="font-medium text-zinc-800">{row.name}</div>
                      <div className="text-right tabular-nums">{row.score.toLocaleString()}</div>
                      <div className={`text-right text-xs font-semibold tabular-nums ${deltaColorClass(row.delta)}`}>
                        {deltaText(row.delta) || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 점수구간별 인원집계 */}
        <Card className="rounded-[28px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">점수구간별 인원</CardTitle>
            <CardDescription>{BUCKET_SIZE}점 단위 · {round}차 기준</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {buckets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
                집계할 점수가 없습니다.
              </div>
            ) : (
              buckets.map((b) => (
                <div key={b.min} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 text-right text-xs tabular-nums text-zinc-600">{b.label}</div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-lg bg-zinc-100">
                    <div
                      className="h-full rounded-lg bg-zinc-800/80"
                      style={{ width: `${(b.count / maxBucketCount) * 100}%` }}
                    />
                  </div>
                  <div className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{b.count}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* 길드전 전용: 같은 총력전 구간별 길드전 점수 분포 */}
      {type === '길드전' && (
        <Card className="rounded-[28px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">같은 총력전 점수구간 · 길드전 점수 분포</CardTitle>
            <CardDescription>
              최신 총력전 점수 구간({BUCKET_SIZE}점 단위)으로 묶은 뒤, 각 길드원의 {round}차 길드전 점수를 비교합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {crossDistribution.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
                총력전·길드전 점수가 모두 입력된 길드원이 없습니다.
              </div>
            ) : (
              crossDistribution.map((group) => (
                <div key={group.start} className="rounded-2xl border border-zinc-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-800">총력전 {group.label}</span>
                    <Badge variant="secondary" className="rounded-full">{group.members.length}명</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.members.map((m) => (
                      <span
                        key={m.member}
                        className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs"
                      >
                        <span className="font-medium text-zinc-800">{m.member}</span>
                        <span className="tabular-nums text-zinc-500">길 {m.guild.toLocaleString()}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
