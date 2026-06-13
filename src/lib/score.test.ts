import { describe, it, expect } from 'vitest';
import { bucketize, findBucket } from './score';

describe('findBucket 총력전', () => {
  it('5980은 5000~5980 구간', () => {
    expect(findBucket(5980, '총력전')?.label).toBe('5000 ~ 5980');
  });
  it('6000은 6000~ 구간', () => {
    expect(findBucket(6000, '총력전')?.label).toBe('6000 ~');
  });
  it('5990은 의도된 빈 구간 (어디에도 속하지 않음)', () => {
    expect(findBucket(5990, '총력전')).toBeNull();
  });
  it('3999는 ~4000 구간', () => {
    expect(findBucket(3999, '총력전')?.label).toBe('~ 4000');
  });
});

describe('bucketize 길드전', () => {
  it('구간별 인원 집계', () => {
    const byLabel = Object.fromEntries(
      bucketize([0, 499, 500, 1200, 2500], '길드전').map((b) => [b.label, b.count]),
    );
    expect(byLabel['0 ~ 500']).toBe(2);
    expect(byLabel['500 ~ 1000']).toBe(1);
    expect(byLabel['1000 ~ 1500']).toBe(1);
    expect(byLabel['2000 ~']).toBe(1);
  });
});

describe('bucketize 강림전', () => {
  it('만 단위 구간 집계', () => {
    const byLabel = Object.fromEntries(
      bucketize([9999999, 12000000, 39999999, 41000000], '강림전').map((b) => [b.label, b.count]),
    );
    expect(byLabel['~ 1000만']).toBe(1);
    expect(byLabel['1000만 ~ 1500만']).toBe(1);
    expect(byLabel['3500만 ~ 4000만']).toBe(1);
    expect(byLabel['4000만 ~']).toBe(1);
  });
});
