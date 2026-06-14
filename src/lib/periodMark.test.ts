import { describe, it, expect } from 'vitest';
import { applyMark } from './periodMark';

describe('applyMark', () => {
  it('시작만 누르면 pending에 start만 채워지고 미완성', () => {
    const r = applyMark(null, 'guild', 'start', '2026-06-01');
    expect(r.completed).toBeNull();
    expect(r.pending).toEqual({ kind: 'guild', start: '2026-06-01' });
  });

  it('시작 후 종료를 누르면 기간 완성 + pending 초기화', () => {
    const mid = applyMark(null, 'guild', 'start', '2026-06-01');
    const r = applyMark(mid.pending, 'guild', 'end', '2026-06-14');
    expect(r.completed).toEqual({ kind: 'guild', start: '2026-06-01', end: '2026-06-14' });
    expect(r.pending).toBeNull();
  });

  it('종료를 먼저, 시작을 나중에 눌러도 완성(순서 무관)', () => {
    const mid = applyMark(null, 'power', 'end', '2026-06-14');
    const r = applyMark(mid.pending, 'power', 'start', '2026-06-01');
    expect(r.completed).toEqual({ kind: 'power', start: '2026-06-01', end: '2026-06-14' });
    expect(r.pending).toBeNull();
  });

  it('start>end면 자동 swap', () => {
    const mid = applyMark(null, 'raid', 'start', '2026-06-20');
    const r = applyMark(mid.pending, 'raid', 'end', '2026-06-10');
    expect(r.completed).toEqual({ kind: 'raid', start: '2026-06-10', end: '2026-06-20' });
  });

  it('다른 kind를 누르면 pending이 새 kind로 리셋', () => {
    const mid = applyMark(null, 'guild', 'start', '2026-06-01');
    const r = applyMark(mid.pending, 'power', 'start', '2026-07-01');
    expect(r.completed).toBeNull();
    expect(r.pending).toEqual({ kind: 'power', start: '2026-07-01' });
  });

  it('같은 edge를 다시 누르면 그 값으로 덮어씀', () => {
    const mid = applyMark(null, 'guild', 'start', '2026-06-01');
    const r = applyMark(mid.pending, 'guild', 'start', '2026-06-02');
    expect(r.pending).toEqual({ kind: 'guild', start: '2026-06-02' });
  });
});
