import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Table2, TrendingUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { computeDelta, deltaText, deltaColorClass } from '@/lib/score';
import { toScoreMap, prevSeason, sortSeasons } from '@/lib/analysis';
import { formatDate } from '@/lib/dates';
import ScoreChart from '@/components/ScoreChart';
import type { Member, ScoreSeason, ScoreType, SeasonScore } from '@/lib/types';

type Props = {
  type: ScoreType;
  members: Member[];
};

export default function ScoreBoard({ type, members }: Props) {
  const today = formatDate(new Date());
  const [seasons, setSeasons] = useState<ScoreSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [allScores, setAllScores] = useState<SeasonScore[]>([]);
  const [scoreMap, setScoreMap] = useState<Record<number, number>>({});
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newSeasonStart, setNewSeasonStart] = useState(today);
  const [newSeasonEnd, setNewSeasonEnd] = useState(today);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'chart'>('table');

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );
  const sortedSeasons = useMemo(() => sortSeasons(seasons), [seasons]);

  // 시즌 목록 + 타입 전체 점수 로드
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<ScoreSeason[]>(`/score-seasons?type=${encodeURIComponent(type)}`),
      api.get<SeasonScore[]>(`/scores?type=${encodeURIComponent(type)}`),
    ])
      .then(([seasonData, scoreData]) => {
        if (cancelled) return;
        setSeasons(seasonData);
        setAllScores(scoreData);
        setSelectedSeasonId((prev) => {
          if (prev && seasonData.some((s) => s.id === prev)) return prev;
          const sorted = sortSeasons(seasonData);
          return sorted.length > 0 ? sorted[sorted.length - 1].id : null;
        });
      })
      .catch(console.error)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [type]);

  // 선택 시즌 점수맵 파생
  useEffect(() => {
    if (selectedSeasonId === null) {
      setScoreMap({});
      return;
    }
    const map: Record<number, number> = {};
    for (const s of allScores) if (s.seasonId === selectedSeasonId) map[s.memberId] = s.score;
    setScoreMap(map);
  }, [selectedSeasonId, allScores]);

  const prev = useMemo(
    () => (selectedSeasonId ? prevSeason(seasons, selectedSeasonId) : null),
    [seasons, selectedSeasonId],
  );
  const prevMap = useMemo(() => {
    if (!prev) return null;
    return toScoreMap(
      allScores.filter((s) => s.seasonId === prev.id).map((s) => ({ memberId: s.memberId, score: s.score })),
    );
  }, [prev, allScores]);

  const getScore = useCallback(
    (memberId: number): number | null => {
      const v = scoreMap[memberId];
      return v === undefined ? null : v;
    },
    [scoreMap],
  );

  const handleScoreChange = (memberId: number, raw: string) => {
    setScoreMap((prev) => {
      const next = { ...prev };
      if (raw.trim() === '') delete next[memberId];
      else {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) next[memberId] = parsed;
      }
      return next;
    });
  };

  const persistCell = async (memberId: number) => {
    if (selectedSeasonId === null) return;
    const value = getScore(memberId);
    try {
      await api.put('/scores', { seasonId: selectedSeasonId, memberId, score: value });
      setAllScores((prev) => {
        const others = prev.filter((s) => !(s.seasonId === selectedSeasonId && s.memberId === memberId));
        return value === null ? others : [...others, { seasonId: selectedSeasonId, memberId, score: value }];
      });
    } catch (error) {
      console.error(error);
    }
  };

  const addSeason = async () => {
    const name = newSeasonName.trim();
    if (!name || !newSeasonStart || !newSeasonEnd) return;
    try {
      const created = await api.post<ScoreSeason>('/score-seasons', {
        type,
        name,
        start: newSeasonStart,
        end: newSeasonEnd,
      });
      setSeasons((prev) => [...prev, created]);
      setSelectedSeasonId(created.id);
      setNewSeasonName('');
    } catch (error) {
      console.error(error);
    }
  };

  const deleteSeason = async () => {
    if (!selectedSeason) return;
    if (!window.confirm(`'${selectedSeason.name}' 시즌을 삭제하시겠습니까? 입력된 점수도 함께 삭제됩니다.`)) return;
    try {
      const removedId = selectedSeason.id;
      await api.del(`/score-seasons/${removedId}`);
      setAllScores((prev) => prev.filter((s) => s.seasonId !== removedId));
      setSeasons((prev) => {
        const next = prev.filter((s) => s.id !== removedId);
        const sorted = sortSeasons(next);
        setSelectedSeasonId(sorted.length > 0 ? sorted[sorted.length - 1].id : null);
        return next;
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Card className="rounded-[28px] border-0 shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <CardTitle className="text-xl">{type} 점수 비교표</CardTitle>
            <CardDescription>
              점수를 입력하면 직전 시즌 대비 변동폭이 자동 표시됩니다. (상승 빨강 / 하락 파랑)
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedSeasonId ? String(selectedSeasonId) : undefined}
              onValueChange={(value) => setSelectedSeasonId(Number(value))}
            >
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
            <Button variant="outline" size="icon" className="rounded-2xl" onClick={deleteSeason} disabled={!selectedSeason}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">새 시즌 이름</label>
            <Input
              value={newSeasonName}
              onChange={(e) => setNewSeasonName(e.target.value)}
              placeholder="예: 6월 시즌"
              className="w-[200px] rounded-2xl"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addSeason();
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">시작일</label>
            <Input type="date" value={newSeasonStart} onChange={(e) => setNewSeasonStart(e.target.value)} className="rounded-2xl" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">종료일</label>
            <Input type="date" value={newSeasonEnd} min={newSeasonStart} onChange={(e) => setNewSeasonEnd(e.target.value)} className="rounded-2xl" />
          </div>
          <Button className="rounded-2xl" onClick={() => void addSeason()}>
            <Plus className="mr-1 h-4 w-4" />시즌 추가
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-400">불러오는 중...</div>
        ) : !selectedSeason ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-16 text-center text-sm text-zinc-500">
            등록된 시즌이 없습니다. 위에서 새 시즌을 추가하세요.
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-16 text-center text-sm text-zinc-500">
            활성 길드원이 없습니다. 관리 탭에서 길드원을 추가하세요.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <div className="inline-flex rounded-xl bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => setView('table')}
                  className={['flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition', view === 'table' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}
                >
                  <Table2 className="h-4 w-4" />점수표
                </button>
                <button
                  type="button"
                  onClick={() => setView('chart')}
                  className={['flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition', view === 'chart' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}
                >
                  <TrendingUp className="h-4 w-4" />그래프
                </button>
              </div>
            </div>

            {view === 'chart' ? (
              <ScoreChart
                members={members}
                seasons={seasons}
                selectedSeasonId={selectedSeasonId}
                allScores={allScores}
                today={today}
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-zinc-200">
                <div className="grid grid-cols-[1.6fr_1fr_0.9fr] bg-zinc-50 px-3 py-3 text-xs font-semibold text-zinc-600">
                  <div>{type} 점수변동</div>
                  <div className="text-right">점수</div>
                  <div className="text-right">변동</div>
                </div>
                <div className="max-h-[680px] overflow-auto">
                  {members.map((member, idx) => {
                    const score = getScore(member.id);
                    const delta = computeDelta(score, prevMap?.get(member.id) ?? null);
                    return (
                      <div
                        key={member.id}
                        className={['grid grid-cols-[1.6fr_1fr_0.9fr] items-center border-t border-zinc-100 px-3 py-1.5 text-sm', idx % 2 === 1 ? 'bg-zinc-50/60' : ''].join(' ')}
                      >
                        <div className="font-medium text-zinc-800">{member.name}</div>
                        <div className="px-1">
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={score ?? ''}
                            onChange={(e) => handleScoreChange(member.id, e.target.value)}
                            onBlur={() => void persistCell(member.id)}
                            className="h-8 rounded-lg text-right"
                          />
                        </div>
                        <div className={`text-right text-xs font-semibold tabular-nums ${deltaColorClass(delta)}`}>
                          {deltaText(delta) || '-'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
