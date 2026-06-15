import { describe, it, expect } from 'vitest';
import { winRate, winRateText } from './winrate';

describe('winRate', () => {
  it('0경기면 null', () => {
    expect(winRate(0, 0)).toBeNull();
  });
  it('소수 1자리로 반올림', () => {
    expect(winRate(8, 4)).toBe(66.7);
    expect(winRate(1, 2)).toBe(33.3);
    expect(winRate(2, 0)).toBe(100);
  });
});

describe('winRateText', () => {
  it('0경기면 -', () => {
    expect(winRateText(0, 0)).toBe('-');
  });
  it('퍼센트 문자열(소수1자리)', () => {
    expect(winRateText(8, 4)).toBe('66.7%');
    expect(winRateText(2, 0)).toBe('100.0%');
  });
});
