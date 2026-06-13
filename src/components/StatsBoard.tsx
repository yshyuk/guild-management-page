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
import { bucketize, findBucket, deltaText, deltaColorClass } from '@/lib/score';
import { toScoreMap, prevSeason, sortSeasons, buildSeasonRanking } from '@/lib/analysis';
import type { Member, ScoreSeason, ScoreType, SeasonScore } from '@/lib/types';

type Props = {
  type: ScoreType;
  members: Member[];
};

export default function StatsBoard({ type, members }: Props) {
  const [seasons, setSeasons] = useState<ScoreSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [allScores, setAllScores] = useState<SeasonScore[]>([]);
  const [powerSeasons, setPowerSeasons] = useState<ScoreSeason[]>([]);
  const [powerAllScores, setPowerAllScores] = useState<SeasonScore[]>([]);
  const [loading, setLoading] = useState(true);

  const sortedSeasons = useMemo(() => sortSeasons(seasons), [seasons]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<ScoreSeason[]>(`/score-seasons?type=${encodeURIComponent(type)}`),
      api.get<SeasonScore[]>(`/scores?type=${encodeURIComponent(type)}`),
    ])
      .then(([s, sc]) => {
        if (cancelled) return;
        setSeasons(s);
        setAllScores(sc);
        const sorted = sortSeasons(s);
        setSelectedSeasonId(sorted.length > 0 ? sorted[sorted.length - 1].id : null);
      })
      .catch(console.error)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [type]);

  // 길드전: 최신 총력전 시즌 분포 분석용 데이터
  useEffect(() => {
    if (type !== '길드전') {
      setPowerSeasons([]);
      setPowerAllScores([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      api.get<ScoreSeason[]>(`/score-seasons?type=${encodeURIComponent('총력전')}`),
      api.get<SeasonScore[]>(`/scores?type=${encodeURIComponent('총력전')}`),
    ])
      .then(([s, sc]) => {
        if (cancelled) return;
        setPowerSeasons(s);
        setPowerAllScores(sc);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [type]);

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );
  const currentMap = useMemo(
    () => toScoreMap(allScores.filter((s) => s.seasonId === selectedSeasonId).map((s) => ({ memberId: s.memberId, score: s.score }))),
    [allScores, selectedSeasonId],
  );
  const prev = useMemo(
    () => (selectedSeasonId ? prevSeason(seasons, selectedSeasonId) : null),
    [seasons, selectedSeasonId],
  );
  const prevMap = useMemo(
    () => (prev ? toScoreMap(allScores.filter((s) => s.seasonId === prev.id).map((s) => ({ memberId: s.memberId, score: s.score }))) : null),
    [prev, allScores],
  );
  const ranking = useMemo(() => buildSeasonRanking(members, currentMap, prevMap), [members, currentMap, prevMap]);
  const buckets = useMemo(() => bucketize(ranking.map((r) => r.score), type), [ranking, type]);
  const maxBucketCount = Math.max(1, ...buckets.map((b) => b.count));

  const powerMap = useMemo(() => {
    const latest = sortSeasons(powerSeasons).at(-1);
    if (!latest) return new Map<number, number>();
    return toScoreMap(powerAllScores.filter((s) => s.seasonId === latest.id).map((s) => ({ memberId: s.memberId, score: s.score })));
  }, [powerSeasons, powerAllScores]);

  const crossDistribution = useMemo(() => {
    if (type !== '길드전' || powerMap.size === 0) return [];
    const groups = new Map<string, { label: string; min: number; members: { member: string; guild: number }[] }>();
    for (const m of members) {
      const power = powerMap.get(m.id);
      const guild = currentMap.get(m.id);
      if (power === undefined || guild === undefined) continue;
      const bucket = findBucket(power, '총력전');
      if (!bucket) continue;
      const g = groups.get(bucket.label) ?? { label: bucket.label, min: bucket.min, members: [] };
      g.members.push({ member: m.name, guild });
      groups.set(bucket.label, g);
    }
    return [...groups.values()]
      .sort((a, b) => b.min - a.min)
      .map((g) => ({ ...g, members: g.members.sort((a, b) => b.guild - a.guild) }));
  }, [type, powerMap, currentMap, members]);

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
      <Card className="rounded-[28px] border-0 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Select value={selectedSeasonId ? String(selectedSeasonId) : undefined} onValueChange={(v) => setSelectedSeasonId(Number(v))}>
            <SelectTrigger className="w-[200px] rounded-2xl">
              <SelectValue placeholder="시즌 선택" />
            </SelectTrigger>
            <SelectContent>
              {sortedSeasons.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-zinc-500">{ranking.length}명 집계</span>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <Card className="rounded-[28px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Trophy className="h-5 w-5 text-amber-500" />길드 내 {type} 순위
            </CardTitle>
            <CardDescription>선택 시즌 점수 기준. 변동은 직전 시즌 대비입니다.</CardDescription>
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
                    <div key={row.memberId} className="grid grid-cols-[0.5fr_1.6fr_1fr_0.9fr] items-center border-t border-zinc-100 px-3 py-2.5 text-sm">
                      <div className="text-center font-semibold text-zinc-700">
                        {row.rank <= 3 ? (
                          <span className={['inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-white', row.rank === 1 ? 'bg-amber-500' : row.rank === 2 ? 'bg-zinc-400' : 'bg-amber-700'].join(' ')}>
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

        <Card className="rounded-[28px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">점수구간별 인원</CardTitle>
            <CardDescription>{type} 구간 기준 · 선택 시즌</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ranking.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
                집계할 점수가 없습니다.
              </div>
            ) : (
              buckets.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 text-right text-xs tabular-nums text-zinc-600">{b.label}</div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-lg bg-zinc-100">
                    <div className="h-full rounded-lg bg-zinc-800/80" style={{ width: `${(b.count / maxBucketCount) * 100}%` }} />
                  </div>
                  <div className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{b.count}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {type === '길드전' && (
        <Card className="rounded-[28px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">같은 총력전 점수구간 · 길드전 점수 분포</CardTitle>
            <CardDescription>
              최신 총력전 시즌 점수 구간으로 묶은 뒤, 각 길드원의 선택 시즌 길드전 점수를 비교합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {crossDistribution.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
                총력전·길드전 점수가 모두 입력된 길드원이 없습니다.
              </div>
            ) : (
              crossDistribution.map((group) => (
                <div key={group.label} className="rounded-2xl border border-zinc-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-800">총력전 {group.label}</span>
                    <Badge variant="secondary" className="rounded-full">{group.members.length}명</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.members.map((m) => (
                      <span key={m.member} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs">
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
