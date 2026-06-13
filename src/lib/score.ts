// 점수판 변동폭 계산 및 색상

export type Delta = {
  value: number | null; // null = 변동폭 표시 안 함(첫 차수 또는 직전 값 없음)
  kind: 'up' | 'down' | 'flat' | 'none';
};

/**
 * 직전 차수 점수 대비 변동폭을 계산한다.
 * @param current 현재 차수 점수 (없으면 null)
 * @param prev 직전 차수 점수 (없으면 null)
 */
export function computeDelta(current: number | null, prev: number | null): Delta {
  if (current === null || prev === null) {
    return { value: null, kind: 'none' };
  }
  const diff = current - prev;
  if (diff > 0) return { value: diff, kind: 'up' };
  if (diff < 0) return { value: diff, kind: 'down' };
  return { value: 0, kind: 'flat' };
}

// 변동폭 표시용 텍스트 (상승 +820, 하락 500, 변동없음 -)
export function deltaText(delta: Delta): string {
  if (delta.kind === 'none') return '';
  if (delta.kind === 'flat') return '-';
  if (delta.kind === 'up') return `+${delta.value}`;
  // down: 음수값이므로 절댓값으로 표시 (이미지처럼)
  return String(Math.abs(delta.value ?? 0));
}

// 변동폭 색상 클래스: 상승=빨강, 하락=파랑, 그 외 회색
export function deltaColorClass(delta: Delta): string {
  if (delta.kind === 'up') return 'text-rose-500';
  if (delta.kind === 'down') return 'text-sky-500';
  return 'text-zinc-400';
}

// ── 점수구간(버킷) ────────────────────────────────────
import type { ScoreType } from './types';

export type BucketDef = { label: string; min: number; max: number }; // [min, max] 양끝 포함(정수)
export type Bucket = BucketDef & { count: number };

// 타입별 점수 구간 (내림차순: 높은 구간이 먼저). 점수는 정수이므로 inclusive 경계 사용.
// 총력전은 비균등(5000~5980, 6000~)이라 5981~5999는 의도된 빈 구간.
const BUCKETS: Record<ScoreType, BucketDef[]> = {
  총력전: [
    { label: '6000 ~', min: 6000, max: Infinity },
    { label: '5000 ~ 5980', min: 5000, max: 5980 },
    { label: '4000 ~ 5000', min: 4000, max: 4999 },
    { label: '~ 4000', min: -Infinity, max: 3999 },
  ],
  길드전: [
    { label: '2000 ~', min: 2000, max: Infinity },
    { label: '1500 ~ 2000', min: 1500, max: 1999 },
    { label: '1000 ~ 1500', min: 1000, max: 1499 },
    { label: '500 ~ 1000', min: 500, max: 999 },
    { label: '0 ~ 500', min: 0, max: 499 },
  ],
  강림전: [
    { label: '4000만 ~', min: 40000000, max: Infinity },
    { label: '3500만 ~ 4000만', min: 35000000, max: 39999999 },
    { label: '3000만 ~ 3500만', min: 30000000, max: 34999999 },
    { label: '2500만 ~ 3000만', min: 25000000, max: 29999999 },
    { label: '2000만 ~ 2500만', min: 20000000, max: 24999999 },
    { label: '1500만 ~ 2000만', min: 15000000, max: 19999999 },
    { label: '1000만 ~ 1500만', min: 10000000, max: 14999999 },
    { label: '~ 1000만', min: -Infinity, max: 9999999 },
  ],
};

export function bucketsFor(type: ScoreType): BucketDef[] {
  return BUCKETS[type];
}

// 값이 속한 구간. 어느 구간에도 없으면 null(총력전 5981~5999).
export function findBucket(value: number, type: ScoreType): BucketDef | null {
  return BUCKETS[type].find((b) => value >= b.min && value <= b.max) ?? null;
}

// 타입 구간별 인원 집계. 모든 구간을 항상 반환(0명 포함), 내림차순.
export function bucketize(values: number[], type: ScoreType): Bucket[] {
  const nums = values.filter((v) => Number.isFinite(v));
  return BUCKETS[type].map((b) => ({
    ...b,
    count: nums.filter((v) => v >= b.min && v <= b.max).length,
  }));
}
