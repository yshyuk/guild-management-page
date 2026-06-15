# 길드전 승패/승률 트래킹 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 길드전 점수 비교표에서 길드원별 5판 O/X 승패를 입력해 시즌별 누적 전적·승률을 보고, 오입력은 전적을 수기 보정한다.

**Architecture:** 누적 카운터(`guild_war_records`, 권위값)와 입력 로그(`guild_war_match_inputs`, append-only) 두 테이블. 카운터는 경기 기록 시 누적, 수정 시 덮어쓰기. 프론트는 ScoreBoard(길드전 탭)에 인라인 컬럼 + 전적수정 모달.

**Tech Stack:** React 18 + TS, Hono(Workers), Drizzle + D1(SQLite), radix-ui, Tailwind, vitest.

스펙: `docs/superpowers/specs/2026-06-15-guild-war-winloss-design.md`

---

## 파일 구조

신규:
- `src/lib/winrate.ts` (+ `src/lib/winrate.test.ts`) — 승률 순수 계산
- `drizzle/0005_guild_war_winloss.sql` — 테이블 2개 추가(데이터 변환 없음)
- `src/worker/routes/guild-war-records.ts` — 승패 API
- `src/components/ui/dialog.tsx` — radix Dialog 래퍼

수정:
- `src/worker/db/schema.ts` — 테이블 2개
- `src/worker/index.ts` — 라우트 등록
- `src/lib/types.ts` — 타입 2개
- `src/components/ScoreBoard.tsx` — 길드전 컬럼 + 기록 + 전적수정 모달

---

## Task 1: 승률 순수 계산 (TDD)

**Files:** Create `src/lib/winrate.ts`, Test `src/lib/winrate.test.ts`

- [ ] **Step 1: 실패 테스트**

`src/lib/winrate.test.ts`:
```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/winrate.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`src/lib/winrate.ts`:
```ts
// 승률(%) 계산. 0경기면 null. 소수 1자리.
export function winRate(wins: number, losses: number): number | null {
  const total = wins + losses;
  if (total <= 0) return null;
  return Math.round((wins / total) * 1000) / 10;
}

// 표시용: 0경기면 '-', 아니면 '66.7%'
export function winRateText(wins: number, losses: number): string {
  const r = winRate(wins, losses);
  return r === null ? '-' : `${r.toFixed(1)}%`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/winrate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/winrate.ts src/lib/winrate.test.ts
git commit -m "feat: 승률 계산 winRate/winRateText + 테스트"
```

---

## Task 2: DB 스키마 + 마이그레이션 + 타입

**Files:** Modify `src/worker/db/schema.ts`, `src/lib/types.ts`; Create `drizzle/0005_guild_war_winloss.sql`

- [ ] **Step 1: 스키마 테이블 추가**

`src/worker/db/schema.ts` 맨 끝(`scores` 테이블 정의 다음)에 추가:
```ts
// 길드전 승패 누적 카운터 (시즌·길드원당 1행, 권위값)
export const guildWarRecords = sqliteTable(
  'guild_war_records',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => scoreSeasons.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    uniqueIndex('guild_war_records_unique').on(t.seasonId, t.memberId),
    index('guild_war_records_season_idx').on(t.seasonId),
  ],
);

// 길드전 경기 입력 로그 (append-only, 입력일 이력)
export const guildWarMatchInputs = sqliteTable(
  'guild_war_match_inputs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => scoreSeasons.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD (입력일)
    wins: integer('wins').notNull(), // 0~5
    losses: integer('losses').notNull(), // 0~5
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index('guild_war_match_inputs_member_idx').on(t.seasonId, t.memberId)],
);
```

- [ ] **Step 2: 마이그레이션 SQL 작성** (손으로 작성 — meta 저널이 0001에 멈춰 있어 `db:generate` 부적합. FK 표기는 `0002_season_scores.sql`와 동일)

`drizzle/0005_guild_war_winloss.sql`:
```sql
CREATE TABLE `guild_war_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `score_seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guild_war_records_unique` ON `guild_war_records` (`season_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `guild_war_records_season_idx` ON `guild_war_records` (`season_id`);--> statement-breakpoint
CREATE TABLE `guild_war_match_inputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`date` text NOT NULL,
	`wins` integer NOT NULL,
	`losses` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `score_seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guild_war_match_inputs_member_idx` ON `guild_war_match_inputs` (`season_id`,`member_id`);
```

- [ ] **Step 3: 타입 추가**

`src/lib/types.ts` 끝에 추가:
```ts
export type GuildWarRecord = {
  memberId: number;
  wins: number;
  losses: number;
  lastInputDate: string | null;
};

export type GuildWarMatchInput = {
  id: number;
  date: string;
  wins: number;
  losses: number;
};
```

- [ ] **Step 4: 빌드 + 로컬 마이그레이션**

Run:
```bash
npm run build
npm run db:migrate:local
npx wrangler d1 execute guild-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('guild_war_records','guild_war_match_inputs')"
```
Expected: 빌드 성공, 마이그레이션 성공, 두 테이블 이름 조회됨.

- [ ] **Step 5: 커밋**

```bash
git add src/worker/db/schema.ts drizzle/0005_guild_war_winloss.sql src/lib/types.ts
git commit -m "feat: 길드전 승패 테이블(records/match_inputs) + 마이그레이션 + 타입"
```

---

## Task 3: 승패 API 라우트

**Files:** Create `src/worker/routes/guild-war-records.ts`; Modify `src/worker/index.ts`

- [ ] **Step 1: 라우트 작성**

`src/worker/routes/guild-war-records.ts`:
```ts
import { Hono } from 'hono';
import { and, desc, eq, max, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { guildWarRecords, guildWarMatchInputs } from '../db/schema';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

// 시즌 전체 길드원 누적 전적 + 최근 입력일
app.get('/', async (c) => {
  const seasonId = Number(c.req.query('seasonId'));
  if (Number.isNaN(seasonId)) return c.json({ error: 'seasonId is required' }, 400);
  const db = getDb(c.env.DB);

  const recs = await db
    .select({ memberId: guildWarRecords.memberId, wins: guildWarRecords.wins, losses: guildWarRecords.losses })
    .from(guildWarRecords)
    .where(eq(guildWarRecords.seasonId, seasonId));

  const lastDates = await db
    .select({ memberId: guildWarMatchInputs.memberId, lastInputDate: max(guildWarMatchInputs.date) })
    .from(guildWarMatchInputs)
    .where(eq(guildWarMatchInputs.seasonId, seasonId))
    .groupBy(guildWarMatchInputs.memberId);

  const dateMap = new Map(lastDates.map((d) => [d.memberId, d.lastInputDate]));
  return c.json(recs.map((r) => ({ ...r, lastInputDate: dateMap.get(r.memberId) ?? null })));
});

// 한 길드원의 입력 이력(날짜 내림차순)
app.get('/inputs', async (c) => {
  const seasonId = Number(c.req.query('seasonId'));
  const memberId = Number(c.req.query('memberId'));
  if (Number.isNaN(seasonId) || Number.isNaN(memberId)) {
    return c.json({ error: 'seasonId and memberId are required' }, 400);
  }
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: guildWarMatchInputs.id,
      date: guildWarMatchInputs.date,
      wins: guildWarMatchInputs.wins,
      losses: guildWarMatchInputs.losses,
    })
    .from(guildWarMatchInputs)
    .where(and(eq(guildWarMatchInputs.seasonId, seasonId), eq(guildWarMatchInputs.memberId, memberId)))
    .orderBy(desc(guildWarMatchInputs.date), desc(guildWarMatchInputs.id));
  return c.json(rows);
});

// 경기 기록: 카운터 누적 + 로그 1행
app.post('/match', async (c) => {
  const body = await c.req.json<{ seasonId?: number; memberId?: number; date?: string; wins?: number; losses?: number }>();
  const { seasonId, memberId, date, wins, losses } = body;
  if (typeof seasonId !== 'number' || typeof memberId !== 'number' || !date || typeof wins !== 'number' || typeof losses !== 'number') {
    return c.json({ error: 'seasonId, memberId, date, wins, losses are required' }, 400);
  }
  if (wins < 0 || losses < 0 || wins + losses < 1 || wins + losses > 5) {
    return c.json({ error: 'wins+losses must be between 1 and 5' }, 400);
  }
  const db = getDb(c.env.DB);
  await db.insert(guildWarMatchInputs).values({ seasonId, memberId, date, wins, losses });
  await db
    .insert(guildWarRecords)
    .values({ seasonId, memberId, wins, losses })
    .onConflictDoUpdate({
      target: [guildWarRecords.seasonId, guildWarRecords.memberId],
      set: {
        wins: sql`${guildWarRecords.wins} + ${wins}`,
        losses: sql`${guildWarRecords.losses} + ${losses}`,
      },
    });
  const [rec] = await db
    .select({ memberId: guildWarRecords.memberId, wins: guildWarRecords.wins, losses: guildWarRecords.losses })
    .from(guildWarRecords)
    .where(and(eq(guildWarRecords.seasonId, seasonId), eq(guildWarRecords.memberId, memberId)));
  return c.json({ ...rec, lastInputDate: date }, 201);
});

// 전적 수기 수정: 카운터 덮어쓰기
app.put('/', async (c) => {
  const body = await c.req.json<{ seasonId?: number; memberId?: number; wins?: number; losses?: number }>();
  const { seasonId, memberId, wins, losses } = body;
  if (typeof seasonId !== 'number' || typeof memberId !== 'number' || typeof wins !== 'number' || typeof losses !== 'number') {
    return c.json({ error: 'seasonId, memberId, wins, losses are required' }, 400);
  }
  if (wins < 0 || losses < 0) return c.json({ error: 'wins and losses must be >= 0' }, 400);
  const db = getDb(c.env.DB);
  await db
    .insert(guildWarRecords)
    .values({ seasonId, memberId, wins, losses })
    .onConflictDoUpdate({
      target: [guildWarRecords.seasonId, guildWarRecords.memberId],
      set: { wins, losses },
    });
  return c.json({ success: true });
});

export default app;
```

- [ ] **Step 2: 라우트 등록**

`src/worker/index.ts`:
- import 블록에 추가: `import guildWarRecords from './routes/guild-war-records';`
- route 등록 블록에 추가(다른 `api.route` 옆): `api.route('/guild-war-records', guildWarRecords);`

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 타입 에러 없음. (drizzle `max`/`desc`/`sql` import 확인)

- [ ] **Step 4: 커밋**

```bash
git add src/worker/routes/guild-war-records.ts src/worker/index.ts
git commit -m "feat: 길드전 승패 API(records/match/put/inputs) + 라우트 등록"
```

---

## Task 4: Dialog UI 컴포넌트

**Files:** Create `src/components/ui/dialog.tsx`

- [ ] **Step 1: 컴포넌트 작성** (기존 `dropdown-menu.tsx` 패턴, radix-ui Dialog)

`src/components/ui/dialog.tsx`:
```tsx
import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md text-zinc-400 outline-none hover:text-zinc-700">
          <X className="h-4 w-4" />
          <span className="sr-only">닫기</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("mb-3 flex flex-col gap-1", className)} {...props} />
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-lg font-semibold text-zinc-900", className)} {...props} />
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogTitle }
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공. (radix-ui `Dialog` export는 `dropdown-menu.tsx`의 import 패턴과 동일)

- [ ] **Step 3: 커밋**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat: ui/dialog 컴포넌트 추가"
```

---

## Task 5: ScoreBoard 길드전 컬럼 + 5판 기록

**Files:** Modify `src/components/ScoreBoard.tsx`

READ the file first. 기존 표 보기(`view === 'table'`)의 표 블록(`<div className="overflow-hidden rounded-2xl ...">` ~ 닫는 `)}`)을 길드전일 때 컬럼이 확장되도록 교체한다.

- [ ] **Step 1: import 추가**

`src/components/ScoreBoard.tsx` 상단 import에 추가:
```ts
import { winRateText } from '@/lib/winrate';
import type { Member, ScoreSeason, ScoreType, SeasonScore, GuildWarRecord } from '@/lib/types';
```
(기존 `import type { Member, ScoreSeason, ScoreType, SeasonScore } from '@/lib/types';` 줄을 위로 교체)

- [ ] **Step 2: 상태 + 헬퍼 추가** (다른 useState/함수 근처, `const today = ...` 아래)

```ts
  const isGuild = type === '길드전';
  const [records, setRecords] = useState<Record<number, GuildWarRecord>>({});
  const [oxByMember, setOxByMember] = useState<Record<number, Array<'o' | 'x' | null>>>({});

  // 길드전 전적 로드 (시즌 변경 시)
  useEffect(() => {
    if (!isGuild || selectedSeasonId === null) {
      setRecords({});
      return;
    }
    let cancelled = false;
    api
      .get<GuildWarRecord[]>(`/guild-war-records?seasonId=${selectedSeasonId}`)
      .then((rows) => {
        if (!cancelled) setRecords(Object.fromEntries(rows.map((r) => [r.memberId, r])));
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [isGuild, selectedSeasonId]);

  const getOx = (memberId: number): Array<'o' | 'x' | null> =>
    oxByMember[memberId] ?? [null, null, null, null, null];

  const cycleOx = (memberId: number, idx: number) => {
    setOxByMember((prev) => {
      const cur = prev[memberId] ?? [null, null, null, null, null];
      const next = [...cur];
      next[idx] = cur[idx] === null ? 'o' : cur[idx] === 'o' ? 'x' : null;
      return { ...prev, [memberId]: next };
    });
  };

  const recordMatch = async (memberId: number) => {
    if (selectedSeasonId === null) return;
    const ox = getOx(memberId);
    const wins = ox.filter((v) => v === 'o').length;
    const losses = ox.filter((v) => v === 'x').length;
    if (wins + losses < 1) return;
    try {
      const updated = await api.post<GuildWarRecord>('/guild-war-records/match', {
        seasonId: selectedSeasonId,
        memberId,
        date: today,
        wins,
        losses,
      });
      setRecords((prev) => ({ ...prev, [memberId]: updated }));
      setOxByMember((prev) => ({ ...prev, [memberId]: [null, null, null, null, null] }));
    } catch (error) {
      console.error(error);
    }
  };

  const gridCols = isGuild
    ? 'grid-cols-[minmax(110px,1.3fr)_84px_56px_180px_92px_64px_84px_120px]'
    : 'grid-cols-[1.6fr_1fr_0.9fr]';
```

- [ ] **Step 3: 표 보기 블록 교체**

기존 표 블록(`) : (` 다음의 `<div className="overflow-hidden rounded-2xl border border-zinc-200">` ... 직전 `)}`까지)을 아래로 교체:
```tsx
            ) : (
              <div className={`${isGuild ? 'overflow-x-auto' : 'overflow-hidden'} rounded-2xl border border-zinc-200`}>
                <div className={`grid ${gridCols} ${isGuild ? 'min-w-[860px]' : ''} bg-zinc-50 px-3 py-3 text-xs font-semibold text-zinc-600`}>
                  <div>{type} 점수변동</div>
                  <div className="text-right">점수</div>
                  <div className="text-right">변동</div>
                  {isGuild && (
                    <>
                      <div className="text-center">5판 입력</div>
                      <div className="text-center">전적</div>
                      <div className="text-right">승률</div>
                      <div className="text-center">최근 입력</div>
                      <div className="text-center">액션</div>
                    </>
                  )}
                </div>
                <div className="max-h-[680px] overflow-auto">
                  {members.map((member, idx) => {
                    const score = getScore(member.id);
                    const delta = computeDelta(score, prevMap?.get(member.id) ?? null);
                    const rec = records[member.id];
                    const wins = rec?.wins ?? 0;
                    const losses = rec?.losses ?? 0;
                    const ox = getOx(member.id);
                    return (
                      <div
                        key={member.id}
                        className={`grid ${gridCols} ${isGuild ? 'min-w-[860px]' : ''} items-center border-t border-zinc-100 px-3 py-1.5 text-sm ${idx % 2 === 1 ? 'bg-zinc-50/60' : ''}`}
                      >
                        <div className="font-medium text-zinc-800">{member.name}</div>
                        <div className="px-1">
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={score ?? ''}
                            onChange={(e) => handleScoreChange(member.id, e.target.value)}
                            onBlur={() => void persistCell(member.id)}
                            className="h-8 rounded-lg text-right"
                          />
                        </div>
                        <div className={`text-right text-xs font-semibold tabular-nums ${deltaColorClass(delta)}`}>
                          {deltaText(delta) || '-'}
                        </div>
                        {isGuild && (
                          <>
                            <div className="flex justify-center gap-1">
                              {ox.map((v, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => cycleOx(member.id, i)}
                                  className={[
                                    'h-6 w-6 rounded-md border text-xs font-semibold',
                                    v === 'o'
                                      ? 'border-rose-200 bg-rose-100 text-rose-600'
                                      : v === 'x'
                                        ? 'border-sky-200 bg-sky-100 text-sky-600'
                                        : 'border-zinc-200 bg-zinc-50 text-zinc-300',
                                  ].join(' ')}
                                >
                                  {v === 'o' ? 'O' : v === 'x' ? 'X' : '·'}
                                </button>
                              ))}
                            </div>
                            <div className="text-center text-xs tabular-nums">
                              <span className="font-semibold text-rose-500">{wins}승</span>{' '}
                              <span className="font-semibold text-sky-500">{losses}패</span>
                            </div>
                            <div className="text-right text-xs font-semibold tabular-nums">{winRateText(wins, losses)}</div>
                            <div className="text-center text-xs text-zinc-400">{rec?.lastInputDate ?? '-'}</div>
                            <div className="flex justify-center gap-1">
                              <Button
                                className="h-7 rounded-lg px-2 text-xs"
                                onClick={() => void recordMatch(member.id)}
                                disabled={ox.every((v) => v === null)}
                              >
                                기록
                              </Button>
                              <Button
                                variant="outline"
                                className="h-7 rounded-lg px-2 text-xs"
                                onClick={() => openEdit(member.id)}
                              >
                                수정
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
```

> 이 단계에서 `openEdit`는 아직 없으므로 임시로 `onClick={() => {}}` 로 두고 빌드 → Task 6에서 `openEdit` 구현하며 교체. (또는 Task 6 코드까지 한 번에 넣어도 됨)

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 성공(임시 onClick이면 미사용 경고 없음). 길드전 외 타입은 기존 3열 유지.

- [ ] **Step 5: 커밋**

```bash
git add src/components/ScoreBoard.tsx
git commit -m "feat: 길드전 점수표에 5판 입력·전적·승률·최근입력일 컬럼 + 기록"
```

---

## Task 6: 전적수정 모달 (수기 보정 + 입력 이력)

**Files:** Modify `src/components/ScoreBoard.tsx`

- [ ] **Step 1: import 추가**

```ts
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { GuildWarMatchInput } from '@/lib/types';
```
(타입 import는 기존 `@/lib/types` 줄에 `GuildWarMatchInput` 추가해도 됨)

- [ ] **Step 2: 모달 상태 + 핸들러 추가**

```ts
  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [editWins, setEditWins] = useState('');
  const [editLosses, setEditLosses] = useState('');
  const [editHistory, setEditHistory] = useState<GuildWarMatchInput[]>([]);

  const openEdit = (memberId: number) => {
    const rec = records[memberId];
    setEditTarget(memberId);
    setEditWins(String(rec?.wins ?? 0));
    setEditLosses(String(rec?.losses ?? 0));
    setEditHistory([]);
    if (selectedSeasonId !== null) {
      api
        .get<GuildWarMatchInput[]>(`/guild-war-records/inputs?seasonId=${selectedSeasonId}&memberId=${memberId}`)
        .then(setEditHistory)
        .catch(console.error);
    }
  };

  const saveEdit = async () => {
    if (editTarget === null || selectedSeasonId === null) return;
    const wins = Number(editWins);
    const losses = Number(editLosses);
    if (Number.isNaN(wins) || Number.isNaN(losses) || wins < 0 || losses < 0) return;
    try {
      await api.put('/guild-war-records', { seasonId: selectedSeasonId, memberId: editTarget, wins, losses });
      setRecords((prev) => ({
        ...prev,
        [editTarget]: { memberId: editTarget, wins, losses, lastInputDate: prev[editTarget]?.lastInputDate ?? null },
      }));
      setEditTarget(null);
    } catch (error) {
      console.error(error);
    }
  };
```

- [ ] **Step 3: Task 5의 임시 onClick 교체**

`onClick={() => {}}`(수정 버튼) → `onClick={() => openEdit(member.id)}` (이미 Task5에서 openEdit으로 넣었다면 생략)

- [ ] **Step 4: 모달 JSX 추가**

`ScoreBoard` 최상위 `</Card>` 바로 앞(반환 JSX 끝부분)에 추가:
```tsx
      <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              전적 수정 {editTarget !== null ? `· ${members.find((m) => m.id === editTarget)?.name ?? ''}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">승</label>
              <Input type="number" inputMode="numeric" value={editWins} onChange={(e) => setEditWins(e.target.value)} className="h-9 w-20 rounded-xl text-right" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">패</label>
              <Input type="number" inputMode="numeric" value={editLosses} onChange={(e) => setEditLosses(e.target.value)} className="h-9 w-20 rounded-xl text-right" />
            </div>
            <Button className="h-9 rounded-xl" onClick={() => void saveEdit()}>저장</Button>
          </div>
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold text-zinc-500">입력 이력</div>
            {editHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400">입력 이력이 없습니다.</div>
            ) : (
              <div className="max-h-48 space-y-1 overflow-auto">
                {editHistory.map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-xs">
                    <span className="text-zinc-500">{h.date}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold text-rose-500">{h.wins}승</span>{' '}
                      <span className="font-semibold text-sky-500">{h.losses}패</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 5: 빌드 + 테스트**

Run: `npm run build` (성공), `npm test` (전체 PASS)

- [ ] **Step 6: 커밋**

```bash
git add src/components/ScoreBoard.tsx
git commit -m "feat: 길드전 전적수정 모달(수기 보정 + 입력 이력)"
```

---

## Task 7: 통합 검증 (수동)

- [ ] **Step 1: dev 실행 후 점검**

Run: `npm run dev`

체크리스트:
- [ ] 점수 탭 → 길드전 → 점수표에 5판 입력/전적/승률/최근입력/액션 컬럼 표시
- [ ] 총력전·강림전 탭은 기존 3열만(승패 컬럼 없음)
- [ ] O/X 5칸 토글(· → O → X → ·), '기록' 시 전적 누적·승률·최근입력일 갱신·O/X 초기화
- [ ] '수정' → 모달에서 승/패 수기 저장 시 전적 반영, 입력 이력 표시
- [ ] 시즌 드롭다운 전환 시 전적이 시즌별로 분리
- [ ] 좁은 화면에서 표 가로 스크롤

- [ ] **Step 2: 이상 없으면 완료.** 이상 시 systematic-debugging으로 원인 추적 후 해당 Task 복귀.

---

## Self-Review 결과

- **스펙 커버리지:** 데이터모델(T2)·API 4종(T3)·승률(T1)·Dialog(T4)·인라인 컬럼+5판기록(T5)·전적수정+이력(T6)·길드전 전용(T5 `isGuild`)·시즌별(seasonId 전반) 모두 매핑.
- **플레이스홀더:** 없음(모든 코드 블록 실제 내용). Task5→6의 `openEdit` 임시 처리만 명시적 순서 의존(주석으로 안내).
- **타입 일관성:** `GuildWarRecord{memberId,wins,losses,lastInputDate}` / `GuildWarMatchInput{id,date,wins,losses}` 가 API 반환·프론트·모달에서 일관. POST `/match`가 `GuildWarRecord`(+lastInputDate=date) 반환 → `setRecords` 형태 일치.
