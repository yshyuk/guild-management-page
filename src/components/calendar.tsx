import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  weekLabels,
  formatDate,
  displayDate,
  parseDate,
  isWithin,
  buildRangeGrid,
} from '@/lib/dates';
import type { ContentType, GuildWarPeriod, MissLog, RaidDeadline, Warning } from '@/lib/types';

const contentStyle: Record<ContentType, string> = {
  길드전: 'bg-pink-100 text-pink-900 border-pink-200',
  공성전: 'bg-amber-100 text-amber-900 border-amber-200',
  강림원정대: 'bg-lime-100 text-lime-900 border-lime-200',
};

type DayLogBadgeProps = {
  log: MissLog;
  compact?: boolean;
  onEditLog: (log: MissLog) => void;
  inSelectedRange: boolean;
};

function DayLogBadge({ log, compact = false, onEditLog, inSelectedRange }: DayLogBadgeProps) {
  return (
    <button
      type="button"
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        if (!inSelectedRange) return;
        onEditLog(log);
      }}
      className={[
        'w-full rounded-xl border text-left transition hover:shadow-sm',
        compact ? 'px-1.5 py-1 text-[11px] leading-4' : 'px-2.5 py-2 text-xs leading-5',
        contentStyle[log.content],
      ].join(' ')}
    >
      {compact ? (
        <div className="flex items-center justify-center font-semibold">{log.members.length}</div>
      ) : (
        <>
          <div className="font-semibold">{log.content}</div>
          <div className="mt-0.5 break-words whitespace-normal">{log.members.join(', ') || '-'}</div>
        </>
      )}
    </button>
  );
}

type DayCellProps = {
  day: Date;
  rangeStart: string;
  rangeEnd: string;
  logs: MissLog[];
  guildWarPeriods: GuildWarPeriod[];
  powerWarPeriods: GuildWarPeriod[];
  raidDeadlines: RaidDeadline[];
  warnings: Warning[];
  onCreateDate: (dateStr: string) => void;
  onEditLog: (log: MissLog) => void;
};

export function DayCell({
  day,
  rangeStart,
  rangeEnd,
  logs,
  guildWarPeriods,
  powerWarPeriods,
  raidDeadlines,
  warnings,
  onCreateDate,
  onEditLog,
}: DayCellProps) {
  const dateStr = formatDate(day);
  const inSelectedRange = isWithin(dateStr, rangeStart, rangeEnd);
  const dayLogs = logs.filter((log) => log.date === dateStr);
  const guildWar = guildWarPeriods.some((period) => isWithin(dateStr, period.start, period.end));
  const powerWar = powerWarPeriods.some((period) => isWithin(dateStr, period.start, period.end));
  const raidDay = raidDeadlines.some((item) => item.date === dateStr);
  const dayWarnings = warnings.filter((w) => w.date === dateStr);
  const dayOfWeek = day.getDay();
  const dayColor =
    dayOfWeek === 0 ? 'text-rose-400' : dayOfWeek === 6 ? 'text-sky-400' : 'text-zinc-700';

  const handleCreate = () => {
    if (!inSelectedRange) return;
    onCreateDate(dateStr);
  };

  return (
    <div
      role="button"
      tabIndex={inSelectedRange ? 0 : -1}
      onClick={handleCreate}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!inSelectedRange) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCreate();
        }
      }}
      className={[
        'relative flex min-h-[110px] w-full flex-col rounded-2xl border p-2 text-left transition sm:min-h-[140px] sm:p-3 md:min-h-[180px]',
        inSelectedRange ? 'cursor-pointer bg-white hover:shadow-sm' : 'bg-zinc-50 text-zinc-400 opacity-65',
        // 총력전(초록) 우선, 그다음 길드전(노랑), 둘 다 아니면 기본
        powerWar
          ? 'border-emerald-500 border-2'
          : guildWar
            ? 'border-amber-400 border-2'
            : 'border-zinc-200',
        raidDay ? 'bg-zinc-100/90' : '',
      ].join(' ')}
    >
      <div className="flex h-5 shrink-0 items-start justify-between sm:h-6">
        <div className={`text-xs font-semibold leading-5 sm:text-sm sm:leading-6 ${dayColor}`}>
          {day.getMonth() + 1}/{day.getDate()}
        </div>
        {dayWarnings.length > 0 && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
            title={dayWarnings.map((w) => w.memberName).join(', ')}
          >
            <AlertTriangle className="h-3 w-3" />
            {dayWarnings.length}
          </span>
        )}
      </div>

      <div className="mt-2 flex-1 space-y-1 sm:mt-3 sm:space-y-1.5">
        <div className="grid gap-1 sm:hidden">
          {dayLogs.map((log) => (
            <DayLogBadge
              key={log.id}
              log={log}
              compact
              onEditLog={onEditLog}
              inSelectedRange={inSelectedRange}
            />
          ))}
        </div>
        <div className="hidden space-y-1.5 sm:block">
          {dayLogs.map((log) => (
            <DayLogBadge key={log.id} log={log} onEditLog={onEditLog} inSelectedRange={inSelectedRange} />
          ))}
        </div>
      </div>
    </div>
  );
}

type PeriodCalendarProps = {
  title: string;
  description: string;
  baseDate: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  rangeStart: string;
  rangeEnd: string;
  items: GuildWarPeriod[] | RaidDeadline[];
  type: 'period' | 'date';
  selectedId: number | null;
  onSelect: (item: GuildWarPeriod | RaidDeadline) => void;
};

export function PeriodCalendar({
  title,
  description,
  baseDate,
  onPrevMonth,
  onNextMonth,
  rangeStart,
  rangeEnd,
  items,
  type,
  selectedId,
  onSelect,
}: PeriodCalendarProps) {
  const gridDays = useMemo(() => buildRangeGrid(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  return (
    <Card className="rounded-[28px] border-0 shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="icon" className="rounded-2xl" onClick={onPrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[120px] text-center text-sm font-semibold">
              {parseDate(baseDate).getFullYear()}년 {parseDate(baseDate).getMonth() + 1}월
            </div>
            <Button variant="outline" size="icon" className="rounded-2xl" onClick={onNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-7 gap-2">
          {weekLabels.map((label, idx) => {
            const color = idx === 0 ? 'text-rose-400' : idx === 6 ? 'text-sky-400' : 'text-zinc-500';
            return (
              <div
                key={label}
                className={`px-1 py-1 text-center text-[11px] font-semibold sm:px-2 sm:text-sm ${color}`}
              >
                {label}
              </div>
            );
          })}
          {gridDays.map((day) => {
            const dateStr = formatDate(day);
            const inSelectedRange = isWithin(dateStr, rangeStart, rangeEnd);
            const hit =
              type === 'period'
                ? (items as GuildWarPeriod[]).find((item) => isWithin(dateStr, item.start, item.end))
                : (items as RaidDeadline[]).find((item) => item.date === dateStr);
            const dayOfWeek = day.getDay();
            const dayColor =
              dayOfWeek === 0 ? 'text-rose-400' : dayOfWeek === 6 ? 'text-sky-400' : 'text-zinc-700';

            return (
              <button
                type="button"
                key={day.toISOString()}
                onClick={() => hit && onSelect(hit)}
                className={[
                  'relative min-h-[86px] w-full rounded-2xl border p-2 text-left',
                  inSelectedRange ? 'bg-white' : 'bg-zinc-50 opacity-60',
                  hit ? 'border-zinc-900' : 'border-zinc-200',
                  selectedId !== null && hit?.id === selectedId ? 'ring-2 ring-zinc-300' : '',
                ].join(' ')}
              >
                <div className={`text-xs font-semibold ${dayColor}`}>
                  {day.getMonth() + 1}/{day.getDate()}
                </div>
                {hit && (
                  <div className="mt-2 rounded-lg bg-zinc-900 px-2 py-1 text-[11px] text-white">
                    {type === 'period'
                      ? `${displayDate((hit as GuildWarPeriod).start)} ~ ${displayDate((hit as GuildWarPeriod).end)}`
                      : displayDate((hit as RaidDeadline).date)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
