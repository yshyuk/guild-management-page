import type { Member, ScoreSeason, SeasonScore } from './types';
import { computeDelta, type Delta } from './score';

// 단일 시즌: memberId -> score
export function toScoreMap(cells: { memberId: number; score: number }[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cells) m.set(c.memberId, c.score);
  return m;
}

// 시즌 정렬: 종료일 오름차순, id 보조
export function sortSeasons(seasons: ScoreSeason[]): ScoreSeason[] {
  return [...seasons].sort((a, b) => a.end.localeCompare(b.end) || a.id - b.id);
}

// 직전 시즌 (정렬 기준 바로 앞). 첫 시즌이면 null.
export function prevSeason(seasons: ScoreSeason[], currentId: number): ScoreSeason | null {
  const sorted = sortSeasons(seasons);
  const idx = sorted.findIndex((s) => s.id === currentId);
  if (idx <= 0) return null;
  return sorted[idx - 1];
}

// 종료된 시즌만 (오늘 > 종료일), 종료일 오름차순
export function endedSeasons(seasons: ScoreSeason[], today: string): ScoreSeason[] {
  return sortSeasons(seasons).filter((s) => s.end < today);
}

export type RankRow = {
  rank: number;
  memberId: number;
  name: string;
  score: number;
  delta: Delta;
};

// 선택 시즌 순위 + 직전 시즌 대비 변동
export function buildSeasonRanking(
  members: Member[],
  current: Map<number, number>,
  prev: Map<number, number> | null,
): RankRow[] {
  const rows = members
    .map((m) => {
      const score = current.get(m.id);
      if (score === undefined) return null;
      const prevScore = prev?.get(m.id);
      return {
        memberId: m.id,
        name: m.name,
        score,
        delta: computeDelta(score, prevScore ?? null),
      };
    })
    .filter((r): r is Omit<RankRow, 'rank'> => r !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

// 단일 시즌 막대그래프 데이터 (점수 내림차순)
export function buildSingleSeasonBars(
  members: Member[],
  current: Map<number, number>,
): Array<{ name: string; score: number }> {
  return members
    .map((m) => {
      const score = current.get(m.id);
      return score === undefined ? null : { name: m.name, score };
    })
    .filter((r): r is { name: string; score: number } => r !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
}

// 전체 시즌추이 꺾은선 데이터: [{ season: name, [memberName]: score|null }]
// seasons 인자는 종료된 시즌(정렬됨)을 넘긴다.
export function buildTrendData(
  members: Member[],
  allScores: SeasonScore[],
  seasons: ScoreSeason[],
): Array<Record<string, string | number | null>> {
  const bySeason = new Map<number, Map<number, number>>();
  for (const s of allScores) {
    let mm = bySeason.get(s.seasonId);
    if (!mm) {
      mm = new Map();
      bySeason.set(s.seasonId, mm);
    }
    mm.set(s.memberId, s.score);
  }
  return seasons.map((season) => {
    const row: Record<string, string | number | null> = { season: season.name };
    const mm = bySeason.get(season.id);
    for (const m of members) row[m.name] = mm?.get(m.id) ?? null;
    return row;
  });
}

// 길드원별 선 색상 (인덱스 기반, 채도 높은 팔레트 순환)
const LINE_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#ec4899', '#f43f5e', '#84cc16', '#14b8a6', '#0ea5e9',
  '#a855f7', '#e11d48', '#65a30d', '#0891b2', '#7c3aed',
];

export function lineColor(idx: number): string {
  return LINE_PALETTE[idx % LINE_PALETTE.length];
}
