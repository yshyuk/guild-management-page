import type { Member, ScoreCell } from './types';
import { computeDelta, type Delta } from './score';

export type ScoreIndex = {
  // memberId -> round -> score
  byMember: Map<number, Map<number, number>>;
  maxRound: number;
};

export function indexScores(cells: ScoreCell[]): ScoreIndex {
  const byMember = new Map<number, Map<number, number>>();
  let maxRound = 0;
  for (const cell of cells) {
    let rounds = byMember.get(cell.memberId);
    if (!rounds) {
      rounds = new Map();
      byMember.set(cell.memberId, rounds);
    }
    rounds.set(cell.round, cell.score);
    if (cell.round > maxRound) maxRound = cell.round;
  }
  return { byMember, maxRound };
}

export function scoreAt(index: ScoreIndex, memberId: number, round: number): number | null {
  const v = index.byMember.get(memberId)?.get(round);
  return v === undefined ? null : v;
}

// 특정 차수까지 입력된 가장 마지막(가장 높은 차수) 점수를 반환
export function latestScore(
  index: ScoreIndex,
  memberId: number,
  uptoRound: number,
): { round: number; score: number } | null {
  const rounds = index.byMember.get(memberId);
  if (!rounds) return null;
  for (let r = uptoRound; r >= 1; r -= 1) {
    const s = rounds.get(r);
    if (s !== undefined) return { round: r, score: s };
  }
  return null;
}

export type RankRow = {
  rank: number;
  memberId: number;
  name: string;
  score: number;
  round: number;
  delta: Delta;
};

// 지정한 차수 기준 순위표. 해당 차수에 점수가 없으면 그 이전 마지막 점수를 사용.
export function buildRanking(
  members: Member[],
  index: ScoreIndex,
  round: number,
): RankRow[] {
  const rows = members
    .map((m) => {
      const latest = latestScore(index, m.id, round);
      if (!latest) return null;
      const prev = latest.round > 1 ? scoreAt(index, m.id, latest.round - 1) : null;
      return {
        memberId: m.id,
        name: m.name,
        score: latest.score,
        round: latest.round,
        delta: computeDelta(latest.score, prev),
      };
    })
    .filter((r): r is Omit<RankRow, 'rank'> => r !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

// recharts 멀티라인용 데이터: [{ round: '1차', [name]: score, ... }, ...]
export function buildChartData(
  members: Member[],
  index: ScoreIndex,
): Array<Record<string, number | string | null>> {
  const rounds = Array.from({ length: index.maxRound }, (_, i) => i + 1);
  return rounds.map((r) => {
    const row: Record<string, number | string | null> = { round: `${r}차` };
    for (const m of members) row[m.name] = scoreAt(index, m.id, r);
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
