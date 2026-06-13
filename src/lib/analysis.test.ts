import { describe, it, expect } from 'vitest';
import {
  sortSeasons,
  prevSeason,
  endedSeasons,
  buildSeasonRanking,
  buildSingleSeasonBars,
  buildTrendData,
} from './analysis';
import type { Member, ScoreSeason, SeasonScore } from './types';

const seasons: ScoreSeason[] = [
  { id: 1, type: '총력전', name: 'S1', start: '2026-01-01', end: '2026-01-31' },
  { id: 2, type: '총력전', name: 'S2', start: '2026-02-01', end: '2026-02-28' },
  { id: 3, type: '총력전', name: 'S3', start: '2026-03-01', end: '2026-03-31' },
];
const members: Member[] = [
  { id: 10, name: '가', active: true },
  { id: 11, name: '나', active: true },
];

describe('prevSeason', () => {
  it('직전 시즌은 종료일 기준 바로 앞', () => {
    expect(prevSeason(seasons, 2)?.id).toBe(1);
    expect(prevSeason(seasons, 1)).toBeNull();
  });
});

describe('endedSeasons', () => {
  it('오늘보다 종료일이 이른 시즌만', () => {
    expect(endedSeasons(seasons, '2026-03-15').map((s) => s.id)).toEqual([1, 2]);
  });
});

describe('buildSeasonRanking', () => {
  it('점수 내림차순 + 직전 시즌 대비 변동', () => {
    const current = new Map([[10, 5000], [11, 4000]]);
    const prev = new Map([[10, 4800], [11, 4500]]);
    const rows = buildSeasonRanking(members, current, prev);
    expect(rows[0].name).toBe('가');
    expect(rows[0].delta.kind).toBe('up');
    expect(rows[1].delta.kind).toBe('down');
  });
  it('점수 없는 길드원은 제외', () => {
    const rows = buildSeasonRanking(members, new Map([[10, 100]]), null);
    expect(rows).toHaveLength(1);
    expect(rows[0].delta.kind).toBe('none');
  });
});

describe('buildSingleSeasonBars', () => {
  it('점수 내림차순 정렬', () => {
    const bars = buildSingleSeasonBars(members, new Map([[10, 100], [11, 300]]));
    expect(bars.map((b) => b.score)).toEqual([300, 100]);
  });
});

describe('buildTrendData', () => {
  it('전달된 시즌만, 점수 없으면 null', () => {
    const all: SeasonScore[] = [
      { seasonId: 1, memberId: 10, score: 100 },
      { seasonId: 2, memberId: 10, score: 200 },
    ];
    const data = buildTrendData(members, all, sortSeasons(seasons).slice(0, 2));
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ season: 'S1', 가: 100, 나: null });
    expect(data[1]).toMatchObject({ season: 'S2', 가: 200, 나: null });
  });
});
