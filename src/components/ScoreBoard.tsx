import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import type { Member, ScoreCell, ScoreSeason, ScoreType } from '@/lib/types';

type Props = {
  type: ScoreType;
  members: Member[];
};

function cellKey(memberId: number, round: number): string {
  return `${memberId}:${round}`;
}

export default function ScoreBoard({ type, members }: Props) {
  const [seasons, setSeasons] = useState<ScoreSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [scoreMap, setScoreMap] = useState<Record<string, number>>({});
  const [newSeasonName, setNewSeasonName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );
  const roundCount = selectedSeason?.roundCount ?? 0;
  const rounds = useMemo(
    () => Array.from({ length: roundCount }, (_, i) => i + 1),
    [roundCount],
  );

  // 시즌 목록 로드 (type 변경 시)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ScoreSeason[]>(`/score-seasons?type=${encodeURIComponent(type)}`)
      .then((data) => {
        if (cancelled) return;
        setSeasons(data);
        setSelectedSeasonId((prev) => {
          if (prev && data.some((s) => s.id === prev)) return prev;
          return data.length > 0 ? data[data.length - 1].id : null;
        });
      })
      .catch(console.error)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [type]);

  // 선택된 시즌 점수 로드
  useEffect(() => {
    if (selectedSeasonId === null) {
      setScoreMap({});
      return;
    }
    let cancelled = false;
    api
      .get<ScoreCell[]>(`/scores?seasonId=${selectedSeasonId}`)
      .then((cells) => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const cell of cells) map[cellKey(cell.memberId, cell.round)] = cell.score;
        setScoreMap(map);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [selectedSeasonId]);

  const getScore = useCallback(
    (memberId: number, round: number): number | null => {
      const v = scoreMap[cellKey(memberId, round)];
      return v === undefined ? null : v;
    },
    [scoreMap],
  );

  const handleScoreChange = (memberId: number, round: number, raw: string) => {
    setScoreMap((prev) => {
      const next = { ...prev };
      const key = cellKey(memberId, round);
      if (raw.trim() === '') {
        delete next[key];
      } else {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) next[key] = parsed;
      }
      return next;
    });
  };

  const persistCell = async (memberId: number, round: number) => {
    if (selectedSeasonId === null) return;
    const value = getScore(memberId, round);
    try {
      await api.put('/scores', {
        seasonId: selectedSeasonId,
        memberId,
        round,
        score: value,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const updateSeasonRoundCount = async (nextCount: number) => {
    if (!selectedSeason) return;
    const safeCount = Math.max(1, nextCount);
    try {
      const updated = await api.patch<ScoreSeason>(`/score-seasons/${selectedSeason.id}`, {
        roundCount: safeCount,
      });
      setSeasons((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (error) {
      console.error(error);
    }
  };

  const addRound = () => updateSeasonRoundCount(roundCount + 1);

  const removeLastRound = async () => {
    if (!selectedSeason || roundCount <= 1) return;
    const removed = roundCount;
    try {
      await api.del(`/scores/round?seasonId=${selectedSeason.id}&round=${removed}`);
    } catch (error) {
      console.error(error);
    }
    setScoreMap((prev) => {
      const next = { ...prev };
      for (const m of members) delete next[cellKey(m.id, removed)];
      return next;
    });
    await updateSeasonRoundCount(roundCount - 1);
  };

  const addSeason = async () => {
    const name = newSeasonName.trim();
    if (!name) return;
    try {
      const created = await api.post<ScoreSeason>('/score-seasons', {
        type,
        name,
        roundCount: 1,
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
    const confirmed = window.confirm(`'${selectedSeason.name}' 시즌을 삭제하시겠습니까? 입력된 점수도 함께 삭제됩니다.`);
    if (!confirmed) return;
    try {
      await api.del(`/score-seasons/${selectedSeason.id}`);
      setSeasons((prev) => {
        const next = prev.filter((s) => s.id !== selectedSeason.id);
        setSelectedSeasonId(next.length > 0 ? next[next.length - 1].id : null);
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
              점수를 입력하면 직전 차수 대비 변동폭이 자동 표시됩니다. (상승 빨강 / 하락 파랑)
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
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="rounded-2xl"
              onClick={deleteSeason}
              disabled={!selectedSeason}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">새 시즌</label>
            <div className="flex gap-2">
              <Input
                value={newSeasonName}
                onChange={(e) => setNewSeasonName(e.target.value)}
                placeholder="시즌 이름 (예: 6월 1주차)"
                className="w-[220px] rounded-2xl"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addSeason();
                }}
              />
              <Button className="rounded-2xl" onClick={() => void addSeason()}>
                <Plus className="mr-1 h-4 w-4" />시즌 추가
              </Button>
            </div>
          </div>
          {selectedSeason && (
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-2xl" onClick={addRound}>
                <Plus className="mr-1 h-4 w-4" />차수 추가
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => void removeLastRound()}
                disabled={roundCount <= 1}
              >
                <Trash2 className="mr-1 h-4 w-4" />마지막 차수 삭제
              </Button>
            </div>
          )}
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
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[120px] border-b border-zinc-200 bg-white px-3 py-2 text-left font-semibold text-zinc-700">
                    {type} 점수변동
                  </th>
                  {rounds.map((r) => (
                    <th
                      key={r}
                      className="min-w-[88px] border-b border-l border-zinc-200 bg-zinc-50 px-2 py-2 text-center font-semibold text-zinc-700"
                    >
                      {r}차
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member, idx) => (
                  <React.Fragment key={member.id}>
                    {/* 점수 입력 행 */}
                    <tr>
                      <td
                        rowSpan={2}
                        className={[
                          'sticky left-0 z-10 border-b border-zinc-200 bg-white px-3 py-2 text-left font-medium text-zinc-800',
                          idx % 2 === 1 ? 'bg-zinc-50/60' : 'bg-white',
                        ].join(' ')}
                      >
                        {member.name}
                      </td>
                      {rounds.map((r) => (
                        <td key={r} className="border-l border-zinc-200 px-1 pt-1">
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={getScore(member.id, r) ?? ''}
                            onChange={(e) => handleScoreChange(member.id, r, e.target.value)}
                            onBlur={() => void persistCell(member.id, r)}
                            className="h-8 rounded-lg text-center"
                          />
                        </td>
                      ))}
                    </tr>
                    {/* 변동폭 표시 행 */}
                    <tr>
                      {rounds.map((r) => {
                        const delta = computeDelta(
                          getScore(member.id, r),
                          r > 1 ? getScore(member.id, r - 1) : null,
                        );
                        return (
                          <td
                            key={r}
                            className="border-b border-l border-zinc-200 px-1 pb-1 text-center text-xs font-semibold"
                          >
                            <span className={deltaColorClass(delta)}>{deltaText(delta) || ' '}</span>
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
