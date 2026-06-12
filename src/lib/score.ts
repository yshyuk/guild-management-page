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
export type Bucket = { label: string; min: number; max: number; count: number };

// 값들을 size(기본 500) 단위 구간으로 나눠 인원수를 집계한다. 높은 구간이 위로 오도록 내림차순.
export function bucketize(values: number[], size = 500): Bucket[] {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const startBucket = Math.floor(min / size) * size;
  const endBucket = Math.floor(max / size) * size;
  const buckets: Bucket[] = [];
  for (let b = endBucket; b >= startBucket; b -= size) {
    const count = nums.filter((v) => v >= b && v < b + size).length;
    buckets.push({
      label: `${b.toLocaleString()} ~ ${(b + size - 1).toLocaleString()}`,
      min: b,
      max: b + size - 1,
      count,
    });
  }
  return buckets;
}

// 특정 점수가 속한 구간의 시작값 (size 배수)
export function bucketStart(value: number, size = 500): number {
  return Math.floor(value / size) * size;
}

export function bucketLabel(start: number, size = 500): string {
  return `${start.toLocaleString()} ~ ${(start + size - 1).toLocaleString()}`;
}
