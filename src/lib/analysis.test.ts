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

describe('sortSeasons', () => {
  it('생성순(id 오름차순)으로 정렬', () => {
    const shuffled = [seasons[2], seasons[0], seasons[1]];
    expect(sortSeasons(shuffled).map((s) => s.id)).toEqual([1, 2, 3]);
  });
});

describe('prevSeason', () => {
  it('직전 시즌은 생성순 바로 앞', () => {
    expect(prevSeason(seasons, 2)?.id).toBe(1);
    expect(prevSeason(seasons, 1)).toBeNull();
  });
});

describe('endedSeasons', () => {
  it('종료일이 없어도 최신 시즌이 아니면 종료로 본다', () => {
    const s: ScoreSeason[] = [
      { id: 1, type: '총력전', name: 'S1', start: '2026-01-01', end: '2026-01-31' },
      { id: 2, type: '총력전', name: 'S2', start: '2026-02-01', end: null },
      { id: 3, type: '총력전', name: 'S3', start: '2026-03-01', end: null },
    ];
    // 1: 종료일 있음, 2: 종료일 없지만 최신 아님 → 둘 다 종료. 3: 최신 + 종료일 없음 → 제외
    expect(endedSeasons(s).map((x) => x.id)).toEqual([1, 2]);
  });
  it('최신 시즌도 종료일이 있으면 포함', () => {
    const s: ScoreSeason[] = [
      { id: 1, type: '총력전', name: 'S1', start: null, end: null },
      { id: 2, type: '총력전', name: 'S2', start: '2026-02-01', end: '2026-02-28' },
    ];
    expect(endedSeasons(s).map((x) => x.id)).toEqual([1, 2]);
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
