import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Table2, TrendingUp, Play, Flag } from 'lucide-react';
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
import { toScoreMap, prevSeason, sortSeasons, endedSeasons } from '@/lib/analysis';
import { formatDate } from '@/lib/dates';
import ScoreChart from '@/components/ScoreChart';
import { winRateText } from '@/lib/winrate';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Member, ScoreSeason, ScoreType, SeasonScore, GuildWarRecord, GuildWarMatchInput } from '@/lib/types';

type Props = {
  type: ScoreType;
  members: Member[];
};

export default function ScoreBoard({ type, members }: Props) {
  const today = formatDate(new Date());
  const isGuild = type === '길드전';
  const [records, setRecords] = useState<Record<number, GuildWarRecord>>({});
  const [oxByMember, setOxByMember] = useState<Record<number, Array<'o' | 'x' | null>>>({});
  const [seasons, setSeasons] = useState<ScoreSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [allScores, setAllScores] = useState<SeasonScore[]>([]);
  const [scoreMap, setScoreMap] = useState<Record<number, number>>({});
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newSeasonStart, setNewSeasonStart] = useState('');
  const [newSeasonEnd, setNewSeasonEnd] = useState('');
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

  // 길드전 전적 로드 (시즌 변경 시)
  useEffect(() => {
    if (!isGuild || selectedSeasonId === null) {
      setRecords({});
      return;
    }
    let cancelled = false;
    api
      .get<GuildWarRecord[]>(`/guild-war-records?seasonId=${selectedSeasonId}`)
      .then((rows) => {
        if (!cancelled) setRecords(Object.fromEntries(rows.map((r) => [r.memberId, r])));
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [isGuild, selectedSeasonId]);

  const getOx = (memberId: number): Array<'o' | 'x' | null> =>
    oxByMember[memberId] ?? [null, null, null, null, null];

  const cycleOx = (memberId: number, idx: number) => {
    setOxByMember((prev) => {
      const cur = prev[memberId] ?? [null, null, null, null, null];
      const next = [...cur];
      next[idx] = cur[idx] === null ? 'o' : cur[idx] === 'o' ? 'x' : null;
      return { ...prev, [memberId]: next };
    });
  };

  const recordMatch = async (memberId: number) => {
    if (selectedSeasonId === null) return;
    const ox = getOx(memberId);
    const wins = ox.filter((v) => v === 'o').length;
    const losses = ox.filter((v) => v === 'x').length;
    if (wins + losses < 1) return;
    try {
      const updated = await api.post<GuildWarRecord>('/guild-war-records/match', {
        seasonId: selectedSeasonId,
        memberId,
        date: today,
        wins,
        losses,
      });
      setRecords((prev) => ({ ...prev, [memberId]: updated }));
      setOxByMember((prev) => ({ ...prev, [memberId]: [null, null, null, null, null] }));
    } catch (error) {
      console.error(error);
    }
  };

  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [editWins, setEditWins] = useState('');
  const [editLosses, setEditLosses] = useState('');
  const [editHistory, setEditHistory] = useState<GuildWarMatchInput[]>([]);

  const openEdit = (memberId: number) => {
    const rec = records[memberId];
    setEditTarget(memberId);
    setEditWins(String(rec?.wins ?? 0));
    setEditLosses(String(rec?.losses ?? 0));
    setEditHistory([]);
    if (selectedSeasonId !== null) {
      api
        .get<GuildWarMatchInput[]>(`/guild-war-records/inputs?seasonId=${selectedSeasonId}&memberId=${memberId}`)
        .then(setEditHistory)
        .catch(console.error);
    }
  };

  const saveEdit = async () => {
    if (editTarget === null || selectedSeasonId === null) return;
    const wins = Math.floor(Number(editWins));
    const losses = Math.floor(Number(editLosses));
    if (Number.isNaN(wins) || Number.isNaN(losses) || wins < 0 || losses < 0) return;
    try {
      await api.put('/guild-war-records', { seasonId: selectedSeasonId, memberId: editTarget, wins, losses });
      setRecords((prev) => ({
        ...prev,
        [editTarget]: { memberId: editTarget, wins, losses, lastInputDate: prev[editTarget]?.lastInputDate ?? null },
      }));
      setEditTarget(null);
    } catch (error) {
      console.error(error);
    }
  };

  const gridCols = isGuild
    ? 'grid-cols-[minmax(110px,1.3fr)_84px_56px_180px_92px_64px_84px_120px]'
    : 'grid-cols-[1.6fr_1fr_0.9fr]';

  const addSeason = async () => {
    const name = newSeasonName.trim();
    if (!name) return;
    try {
      const created = await api.post<ScoreSeason>('/score-seasons', {
        type,
        name,
        start: newSeasonStart || null,
        end: newSeasonEnd || null,
      });
      setSeasons((prev) => [...prev, created]);
      setSelectedSeasonId(created.id);
      setNewSeasonName('');
      setNewSeasonStart('');
      setNewSeasonEnd('');
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

  const updateSeason = async (patch: { start?: string | null; end?: string | null }) => {
    if (!selectedSeason) return;
    try {
      const updated = await api.patch<ScoreSeason>(`/score-seasons/${selectedSeason.id}`, patch);
      setSeasons((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (error) {
      console.error(error);
    }
  };

  const selectedEnded = useMemo(
    () => (selectedSeason ? endedSeasons(seasons).some((s) => s.id === selectedSeason.id) : false),
    [seasons, selectedSeason],
  );
  const selectedStatus = !selectedSeason
    ? ''
    : selectedEnded
      ? '종료'
      : selectedSeason.start != null
        ? '진행 중'
        : '대기';

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

        {selectedSeason && (
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3">
            <div className="flex items-center gap-2 pb-1">
              <span className="text-sm font-medium text-zinc-700">{selectedSeason.name}</span>
              <span
                className={[
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  selectedStatus === '진행 중'
                    ? 'bg-emerald-100 text-emerald-700'
                    : selectedStatus === '대기'
                      ? 'bg-zinc-200 text-zinc-600'
                      : 'bg-sky-100 text-sky-700',
                ].join(' ')}
              >
                {selectedStatus}
              </span>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">시작일</label>
              <Input
                type="date"
                value={selectedSeason.start ?? ''}
                onChange={(e) => void updateSeason({ start: e.target.value || null })}
                className="h-9 w-[150px] rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">종료일</label>
              <Input
                type="date"
                value={selectedSeason.end ?? ''}
                onChange={(e) => void updateSeason({ end: e.target.value || null })}
                className="h-9 w-[150px] rounded-2xl"
              />
            </div>
            <Button variant="outline" className="rounded-2xl" onClick={() => void updateSeason({ start: today })}>
              <Play className="mr-1 h-4 w-4" />시작
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => void updateSeason({ end: today })}>
              <Flag className="mr-1 h-4 w-4" />종료
            </Button>
          </div>
        )}
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
                type={type}
                members={members}
                seasons={seasons}
                selectedSeasonId={selectedSeasonId}
                allScores={allScores}
              />
            ) : (
              <div className={`${isGuild ? 'overflow-x-auto' : 'overflow-hidden'} rounded-2xl border border-zinc-200`}>
                <div className={`grid ${gridCols} ${isGuild ? 'min-w-[860px]' : ''} bg-zinc-50 px-3 py-3 text-xs font-semibold text-zinc-600`}>
                  <div>{type} 점수변동</div>
                  <div className="text-right">점수</div>
                  <div className="text-right">변동</div>
                  {isGuild && (
                    <>
                      <div className="text-center">5판 입력</div>
                      <div className="text-center">전적</div>
                      <div className="text-right">승률</div>
                      <div className="text-center">최근 입력</div>
                      <div className="text-center">액션</div>
                    </>
                  )}
                </div>
                <div className="max-h-[680px] overflow-auto">
                  {members.map((member, idx) => {
                    const score = getScore(member.id);
                    const delta = computeDelta(score, prevMap?.get(member.id) ?? null);
                    const rec = records[member.id];
                    const wins = rec?.wins ?? 0;
                    const losses = rec?.losses ?? 0;
                    const ox = getOx(member.id);
                    return (
                      <div
                        key={member.id}
                        className={`grid ${gridCols} ${isGuild ? 'min-w-[860px]' : ''} items-center border-t border-zinc-100 px-3 py-1.5 text-sm ${idx % 2 === 1 ? 'bg-zinc-50/60' : ''}`}
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
                        {isGuild && (
                          <>
                            <div className="flex justify-center gap-1">
                              {ox.map((v, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => cycleOx(member.id, i)}
                                  className={[
                                    'h-6 w-6 rounded-md border text-xs font-semibold',
                                    v === 'o'
                                      ? 'border-rose-200 bg-rose-100 text-rose-600'
                                      : v === 'x'
                                        ? 'border-sky-200 bg-sky-100 text-sky-600'
                                        : 'border-zinc-200 bg-zinc-50 text-zinc-300',
                                  ].join(' ')}
                                >
                                  {v === 'o' ? 'O' : v === 'x' ? 'X' : '·'}
                                </button>
                              ))}
                            </div>
                            <div className="text-center text-xs tabular-nums">
                              <span className="font-semibold text-rose-500">{wins}승</span>{' '}
                              <span className="font-semibold text-sky-500">{losses}패</span>
                            </div>
                            <div className="text-right text-xs font-semibold tabular-nums">{winRateText(wins, losses)}</div>
                            <div className="text-center text-xs text-zinc-400">{rec?.lastInputDate ?? '-'}</div>
                            <div className="flex justify-center gap-1">
                              <Button
                                className="h-7 rounded-lg px-2 text-xs"
                                onClick={() => void recordMatch(member.id)}
                                disabled={ox.every((v) => v === null)}
                              >
                                기록
                              </Button>
                              <Button
                                variant="outline"
                                className="h-7 rounded-lg px-2 text-xs"
                                onClick={() => openEdit(member.id)}
                              >
                                수정
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              전적 수정 {editTarget !== null ? `· ${members.find((m) => m.id === editTarget)?.name ?? ''}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">승</label>
              <Input type="number" inputMode="numeric" value={editWins} onChange={(e) => setEditWins(e.target.value)} className="h-9 w-20 rounded-xl text-right" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">패</label>
              <Input type="number" inputMode="numeric" value={editLosses} onChange={(e) => setEditLosses(e.target.value)} className="h-9 w-20 rounded-xl text-right" />
            </div>
            <Button className="h-9 rounded-xl" onClick={() => void saveEdit()}>저장</Button>
          </div>
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold text-zinc-500">입력 이력</div>
            {editHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400">입력 이력이 없습니다.</div>
            ) : (
              <div className="max-h-48 space-y-1 overflow-auto">
                {editHistory.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-xs">
                    <span className="text-zinc-500">{h.date}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold text-rose-500">{h.wins}승</span>{' '}
                      <span className="font-semibold text-sky-500">{h.losses}패</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
