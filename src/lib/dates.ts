import type { GuildWarPeriod } from './types';

export const weekLabels: readonly string[] = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function displayDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function getWeekEnd(date: Date): Date {
  return addDays(getWeekStart(date), 6);
}

export function isWithin(dateStr: string, startStr: string, endStr: string): boolean {
  return dateStr >= startStr && dateStr <= endStr;
}

export function buildRangeGrid(startStr: string, endStr: string): Date[] {
  const startDate = parseDate(startStr);
  const endDate = parseDate(endStr);
  const gridStart = getWeekStart(startDate);
  const gridEnd = getWeekEnd(endDate);
  const days: Date[] = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function getMonthRange(baseDateStr: string): { start: string; end: string } {
  const base = parseDate(baseDateStr);
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { start: formatDate(start), end: formatDate(end) };
}

export function shiftCustomRange(
  startStr: string,
  endStr: string,
  direction: number,
): { start: string; end: string } {
  const diffDays =
    Math.round((parseDate(endStr).getTime() - parseDate(startStr).getTime()) / (1000 * 60 * 60 * 24)) +
    1;

  return {
    start: formatDate(addDays(parseDate(startStr), direction * diffDays)),
    end: formatDate(addDays(parseDate(endStr), direction * diffDays)),
  };
}

export function shiftMonth(baseDateStr: string, direction: number): string {
  const base = parseDate(baseDateStr);
  const moved = new Date(base.getFullYear(), base.getMonth() + direction, 1);
  return formatDate(moved);
}

export function sortByDate<T extends Record<string, string | number>>(items: T[], key: keyof T): T[] {
  return [...items].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

export function getLatestGuildWarPeriod(periods: GuildWarPeriod[]): GuildWarPeriod | null {
  if (periods.length === 0) return null;
  return [...periods].sort((a, b) => a.end.localeCompare(b.end)).at(-1) ?? null;
}

export function getActiveOrPreviousGuildWarPeriod(
  periods: GuildWarPeriod[],
  baseDateStr: string,
): GuildWarPeriod | null {
  if (periods.length === 0) return null;
  const active = [...periods]
    .filter((period) => isWithin(baseDateStr, period.start, period.end))
    .sort((a, b) => b.start.localeCompare(a.start) || b.end.localeCompare(a.end));
  if (active.length > 0) return active[0] ?? null;

  const ended = [...periods]
    .filter((period) => period.end < baseDateStr)
    .sort((a, b) => a.end.localeCompare(b.end));

  if (ended.length > 0) return ended.at(-1) ?? null;

  return [...periods].sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
}

export function getNextRaidSunday(dateStr: string): string {
  const base = parseDate(dateStr);
  const plus14 = addDays(base, 14);
  const sundayOffset = (7 - plus14.getDay()) % 7;
  return formatDate(addDays(plus14, sundayOffset));
}

export function getNextGuildWarPeriod(
  periods: GuildWarPeriod[],
): { start: string; end: string } | null {
  const latest = getLatestGuildWarPeriod(periods);
  if (!latest) return null;

  const latestEnd = parseDate(latest.end);
  const nextStart = addDays(latestEnd, 8);
  const nextEnd = addDays(nextStart, 41);

  return {
    start: formatDate(nextStart),
    end: formatDate(nextEnd),
  };
}
