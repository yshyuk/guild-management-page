export type PeriodKind = 'guild' | 'power' | 'raid';

export type PendingMark = { kind: PeriodKind; start?: string; end?: string };

export type CompletedPeriod = { kind: PeriodKind; start: string; end: string };

export type MarkResult = { pending: PendingMark | null; completed: CompletedPeriod | null };

export function applyMark(
  current: PendingMark | null,
  kind: PeriodKind,
  edge: 'start' | 'end',
  date: string,
): MarkResult {
  // 다른 kind면 새로 시작
  const base: PendingMark = current && current.kind === kind ? { ...current } : { kind };
  base[edge] = date;

  if (base.start && base.end) {
    let { start, end } = base;
    if (start > end) [start, end] = [end, start];
    return { pending: null, completed: { kind, start, end } };
  }
  return { pending: base, completed: null };
}
