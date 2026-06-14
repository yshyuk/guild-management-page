# 현황판 칸 컨텍스트 메뉴 + 강림전 기간화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현황판 달력 칸을 좌클릭하면 길드전/강림전/총력전 시작·종료 및 입력화면 이동을 고르는 메뉴가 뜨고, 시작·종료 2단계로 기간을 생성한다. 더불어 강림전을 마감일→기간 모델로 전환한다.

**Architecture:** 페어링 로직은 순수 함수(`periodMark.ts`)로 분리해 단위 테스트. 메뉴는 `radix-ui` `DropdownMenu`(기존 의존성)로 구현. 강림전은 길드전/총력전과 동일한 `{start,end}` 기간 모델로 통일(DB 마이그레이션 포함).

**Tech Stack:** React 18 + TypeScript, Vite, Hono(Cloudflare Workers), Drizzle ORM + D1(SQLite), radix-ui, Tailwind, vitest.

스펙: `docs/superpowers/specs/2026-06-14-dashboard-cell-context-menu-design.md`

---

## 파일 구조

신규:
- `src/lib/periodMark.ts` — 페어링 상태 reducer(순수 함수)
- `src/lib/periodMark.test.ts` — reducer 단위 테스트
- `src/components/ui/dropdown-menu.tsx` — radix DropdownMenu 래퍼
- `drizzle/0004_raid_periods.sql` — 강림 마감일→기간 마이그레이션

수정:
- `src/worker/db/schema.ts` — `raidDeadlines` date→start/end
- `src/worker/routes/raid-deadlines.ts` — start/end API
- `src/lib/types.ts` — `RaidDeadline`→`RaidPeriod`
- `src/components/calendar.tsx` — DayCell 메뉴화 + raid 기간 렌더 + PeriodCalendar date분기 제거
- `src/App.tsx` — raid 핸들러 기간화, autoAdd 제거, 페어링 상태/배너/메뉴 콜백

---

## Task 1: 페어링 reducer (순수 함수, TDD)

**Files:**
- Create: `src/lib/periodMark.ts`
- Test: `src/lib/periodMark.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/periodMark.test.ts`:
```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/periodMark.test.ts`
Expected: FAIL — `applyMark`/모듈 없음.

- [ ] **Step 3: 구현 작성**

`src/lib/periodMark.ts`:
```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/periodMark.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/periodMark.ts src/lib/periodMark.test.ts
git commit -m "feat: 기간 페어링 reducer(applyMark) + 테스트"
```

---

## Task 2: DropdownMenu UI 컴포넌트

기존 `src/components/ui/select.tsx`와 동일한 shadcn 스타일. radix-ui는 이미 설치되어 있음.

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/ui/dropdown-menu.tsx`:
```tsx
import * as React from "react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[12rem] overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-zinc-800 outline-none",
        "focus:bg-zinc-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn("px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400", className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("mx-1 my-1.5 h-px bg-zinc-200", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
}
```

- [ ] **Step 2: 빌드(타입체크) 확인**

Run: `npm run build`
Expected: 성공(에러 없음). 만약 radix-ui에 `DropdownMenu` named export가 없다는 에러가 나면, `src/components/ui/select.tsx`의 import 형태(`import { Select as SelectPrimitive } from "radix-ui"`)와 동일하므로 동일 패턴이 맞다 — 에러 메시지대로 export명을 확인.

- [ ] **Step 3: 커밋**

```bash
git add src/components/ui/dropdown-menu.tsx
git commit -m "feat: ui/dropdown-menu 컴포넌트 추가"
```

---

## Task 3: 강림전 마감일 → 기간 마이그레이션 (스키마·DB·API·타입·관리탭)

이 태스크는 타입 변경이 여러 파일에 걸쳐 빌드를 동시에 깨므로, 한 묶음으로 끝까지 적용한 뒤 빌드 그린 + 커밋한다.

**Files:**
- Create: `drizzle/0004_raid_periods.sql`
- Modify: `src/worker/db/schema.ts`, `src/worker/routes/raid-deadlines.ts`, `src/lib/types.ts`, `src/components/calendar.tsx`, `src/App.tsx`

- [ ] **Step 1: 마이그레이션 SQL 작성** (0003과 동일한 데이터 보존 패턴; raid_deadlines를 참조하는 FK 없음 → 백업 불필요)

`drizzle/0004_raid_periods.sql`:
```sql
CREATE TABLE `__new_raid_deadlines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_raid_deadlines` (`id`,`start_date`,`end_date`,`created_at`) SELECT `id`,`date`,`date`,`created_at` FROM `raid_deadlines`;--> statement-breakpoint
DROP TABLE `raid_deadlines`;--> statement-breakpoint
ALTER TABLE `__new_raid_deadlines` RENAME TO `raid_deadlines`;--> statement-breakpoint
CREATE INDEX `raid_deadlines_start_idx` ON `raid_deadlines` (`start_date`);--> statement-breakpoint
CREATE INDEX `raid_deadlines_end_idx` ON `raid_deadlines` (`end_date`);
```
> 참고: wrangler는 `migrations_dir: drizzle`의 .sql 파일을 파일명 순으로 적용하며, drizzle `_journal.json`은 wrangler 적용과 무관(drizzle-kit generate 전용)하므로 이번엔 수정 불필요.

- [ ] **Step 2: 스키마 변경**

`src/worker/db/schema.ts` 의 `raidDeadlines` 정의(현재 86~97줄)를 아래로 교체:
```ts
// 강림원정대 기간 (길드전/총력전 기간과 동일 구조)
export const raidDeadlines = sqliteTable(
  'raid_deadlines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    startDate: text('start_date').notNull(), // YYYY-MM-DD
    endDate: text('end_date').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    index('raid_deadlines_start_idx').on(t.startDate),
    index('raid_deadlines_end_idx').on(t.endDate),
  ],
);
```

- [ ] **Step 3: API 라우트 변경** (guild-war-periods.ts와 동형)

`src/worker/routes/raid-deadlines.ts` 전체를 교체:
```ts
import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { raidDeadlines } from '../db/schema';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

function serialize(row: { id: number; startDate: string; endDate: string }) {
  return { id: row.id, start: row.startDate, end: row.endDate };
}

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(raidDeadlines).orderBy(asc(raidDeadlines.startDate));
  return c.json(rows.map(serialize));
});

app.post('/', async (c) => {
  const body = await c.req.json<{ start?: string; end?: string }>();
  if (!body.start || !body.end) {
    return c.json({ error: 'start and end are required' }, 400);
  }
  const db = getDb(c.env.DB);
  const [created] = await db
    .insert(raidDeadlines)
    .values({ startDate: body.start, endDate: body.end })
    .returning();
  return c.json(serialize(created), 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<{ start?: string; end?: string }>();
  const data: { startDate?: string; endDate?: string } = {};
  if (body.start) data.startDate = body.start;
  if (body.end) data.endDate = body.end;
  if (Object.keys(data).length === 0) {
    return c.json({ error: 'No valid fields provided' }, 400);
  }

  const db = getDb(c.env.DB);
  const [updated] = await db
    .update(raidDeadlines)
    .set(data)
    .where(eq(raidDeadlines.id, id))
    .returning();
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(serialize(updated));
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb(c.env.DB);
  await db.delete(raidDeadlines).where(eq(raidDeadlines.id, id));
  return c.json({ success: true });
});

export default app;
```

- [ ] **Step 4: 타입 변경**

`src/lib/types.ts` 의 `RaidDeadline`(23~26줄) 을 교체:
```ts
export type RaidPeriod = {
  id: number;
  start: string;
  end: string;
};
```

- [ ] **Step 5: calendar.tsx — RaidDeadline 제거, raid 기간 렌더, PeriodCalendar date 분기 제거**

5a. import(19줄): `RaidDeadline` → `RaidPeriod`
```ts
import type { ContentType, GuildWarPeriod, MissLog, RaidPeriod, Warning } from '@/lib/types';
```

5b. `DayCellProps`(68줄): raid prop 타입 변경
```ts
  raidDeadlines: RaidPeriod[];
```

5c. raidDay 계산(91줄)을 기간 기반으로:
```ts
  const raidDay = raidDeadlines.some((period) => isWithin(dateStr, period.start, period.end));
```

5d. `PeriodCalendar`를 기간 전용으로 단순화. 현재 `PeriodCalendarProps`(163~175줄)와 본문에서 `type`/date 분기를 제거한다.

`PeriodCalendarProps` 교체:
```ts
type PeriodCalendarProps = {
  title: string;
  description: string;
  baseDate: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  rangeStart: string;
  rangeEnd: string;
  items: GuildWarPeriod[];
  selectedId: number | null;
  onSelect: (item: GuildWarPeriod) => void;
};
```
함수 시그니처에서 `type,` 제거(177~189줄 구조분해에서 `type` 삭제).

본문 `hit` 계산(229~232줄)을 교체:
```ts
            const hit = items.find((item) => isWithin(dateStr, item.start, item.end));
```
`hit` 표시(252~258줄)를 교체:
```ts
                {hit && (
                  <div className="mt-2 rounded-lg bg-zinc-900 px-2 py-1 text-[11px] text-white">
                    {displayDate(hit.start)} ~ {displayDate(hit.end)}
                  </div>
                )}
```
> `RaidPeriod`와 `GuildWarPeriod`는 동일 구조라 raid도 `GuildWarPeriod[]` 자리에 그대로 전달 가능(구조적 타이핑).

- [ ] **Step 6: App.tsx — raid 상태/핸들러 기간화 + autoAdd 제거**

6a. import(62줄): `RaidDeadline` → `RaidPeriod`

6b. 상태(89, 96줄):
```ts
  const [raidDeadlines, setRaidDeadlines] = useState<RaidPeriod[]>([]);
```
`raidDraftDate`(96줄) 한 줄을 두 줄로 교체:
```ts
  const [raidDraftStart, setRaidDraftStart] = useState<string>(today);
  const [raidDraftEnd, setRaidDraftEnd] = useState<string>(today);
```

6c. fetch then(180줄): `data: RaidDeadline[]` → `data: RaidPeriod[]`

6d. `selectGuildWarPeriod`(553줄)과 `selectPowerWarPeriod`(625줄)의 인자 타입에서 RaidDeadline 제거 + `'start' in item` 가드 제거:
```ts
  const selectGuildWarPeriod = (item: GuildWarPeriod) => {
    setEditingGuildWarId(item.id);
    setGuildWarDraftStart(item.start);
    setGuildWarDraftEnd(item.end);
  };
```
```ts
  const selectPowerWarPeriod = (item: GuildWarPeriod) => {
    setEditingPowerWarId(item.id);
    setPowerWarDraftStart(item.start);
    setPowerWarDraftEnd(item.end);
  };
```

6e. `saveRaidDeadline`(666~692줄) 전체를 start/end 기반으로 교체:
```ts
  const saveRaidDeadline = async () => {
    if (!raidDraftStart || !raidDraftEnd) return;
    try {
      if (editingRaidId) {
        const res = await fetch(`/api/raid-deadlines/${editingRaidId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: raidDraftStart, end: raidDraftEnd }),
        });
        if (!res.ok) throw new Error('Failed to update raid period');
        const updated = (await res.json()) as RaidPeriod;
        setRaidDeadlines((prev) => sortByDate(prev.map((i) => (i.id === updated.id ? updated : i)), 'start'));
      } else {
        const res = await fetch('/api/raid-deadlines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: raidDraftStart, end: raidDraftEnd }),
        });
        if (!res.ok) throw new Error('Failed to create raid period');
        const created = (await res.json()) as RaidPeriod;
        setRaidDeadlines((prev) => sortByDate([...prev, created], 'start'));
      }
      setEditingRaidId(null);
    } catch (error) {
      console.error(error);
    }
  };
```

6f. `selectRaidDeadline`(694~698줄) 교체:
```ts
  const selectRaidDeadline = (item: RaidPeriod) => {
    setEditingRaidId(item.id);
    setRaidDraftStart(item.start);
    setRaidDraftEnd(item.end);
  };
```

6g. `deleteRaidDeadline`(700~710줄)의 catch까지 유지하되, 삭제 후 draft 초기화 라인 추가(선택). 본문 중 `setRaidDeadlines` 호출은 그대로 유효. 삭제 성공 블록 끝에 추가:
```ts
      setEditingRaidId(null);
      setRaidDraftStart(rangeStart);
      setRaidDraftEnd(rangeEnd);
```
(기존 `setEditingRaidId(null)` 한 줄을 위 3줄로 교체)

6h. `autoAddNextRaidDeadline`(712~730줄) 함수 **전체 삭제**. 더불어 import(49줄)에서 `getNextRaidSunday` 제거.

6i. 관리 탭 강림 카드 JSX 수정:
- 입력칸(1118~1120줄 영역): 마감일 단일 date input 1개를 시작/종료 2개로 교체. 길드전 카드(1085~1090줄)의 시작/종료 input 구조를 참고해 동일 형태로:
```tsx
                      <div className="space-y-2">
                        <label className="text-sm font-medium">시작일</label>
                        <Input type="date" value={raidDraftStart} onChange={(e) => setRaidDraftStart(e.target.value)} className="rounded-2xl" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">종료일</label>
                        <Input type="date" value={raidDraftEnd} min={raidDraftStart} onChange={(e) => setRaidDraftEnd(e.target.value)} className="rounded-2xl" />
                      </div>
```
- 저장 버튼(1121줄): 라벨 `'마감일 추가'` → `'기간 추가'`
- "다음 마감일 자동" 버튼(1122줄) **삭제** (`autoAddNextRaidDeadline` 참조 제거). 이 버튼이 `Wand2` 아이콘의 유일한 사용처인지 확인 후, 그렇다면 import에서 `Wand2` 제거(길드전/총력전 자동 버튼이 `Wand2`를 쓰면 유지).
- 카드 타이틀(1113줄): "강림원정대 마감일 설정" → "강림원정대 기간 설정"
- `PeriodCalendar`(1125~1136줄): `type="date"` prop **삭제**(컴포넌트에서 제거됨). `items={raidDeadlines}`, `onSelect={selectRaidDeadline}` 유지.

6j. 현황판 범례(806~809줄)의 강림 박스 문구를 기간형으로:
```tsx
                    <div className="hidden rounded-2xl border border-zinc-200 bg-zinc-100/90 px-4 py-3 text-sm text-zinc-700 md:block">
                      <div className="font-medium text-zinc-800">강림전 시즌</div>
                      회색 음영
                    </div>
```

- [ ] **Step 7: 빌드 그린 확인**

Run: `npm run build`
Expected: 타입 에러 없음. (남은 RaidDeadline 참조나 type/getNextRaidSunday 미사용 에러가 있으면 그 위치를 수정)

- [ ] **Step 8: 로컬 마이그레이션 적용 & 데이터 보존 확인**

Run:
```bash
npm run db:migrate:local
npx wrangler d1 execute guild-db --local --command "SELECT id,start_date,end_date FROM raid_deadlines LIMIT 5"
```
Expected: 마이그레이션 성공. 기존 마감일 행이 있었다면 `start_date == end_date == 기존 date`로 보존됨(없으면 빈 결과 — 정상).

- [ ] **Step 9: 커밋**

```bash
git add drizzle/0004_raid_periods.sql src/worker/db/schema.ts src/worker/routes/raid-deadlines.ts src/lib/types.ts src/components/calendar.tsx src/App.tsx
git commit -m "feat: 강림전 마감일 → 기간(start/end) 모델로 전환 + 마이그레이션"
```

---

## Task 4: 칸 좌클릭 메뉴 + 2단계 페어링 wiring

**Files:**
- Modify: `src/components/calendar.tsx` (DayCell 메뉴화), `src/App.tsx` (페어링 상태/콜백/배너)

- [ ] **Step 1: DayCell에 메뉴 도입**

`src/components/calendar.tsx`:

1a. import 추가(상단 import 블록):
```ts
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { PeriodKind } from '@/lib/periodMark';
```

1b. `DayCellProps`(61~72줄)에 콜백/강조 prop 추가, 기존 `onCreateDate`/`onEditLog` 유지:
```ts
type DayCellProps = {
  day: Date;
  rangeStart: string;
  rangeEnd: string;
  logs: MissLog[];
  guildWarPeriods: GuildWarPeriod[];
  powerWarPeriods: GuildWarPeriod[];
  raidDeadlines: RaidPeriod[];
  warnings: Warning[];
  onCreateDate: (dateStr: string) => void;
  onEditLog: (log: MissLog) => void;
  onPeriodMark: (kind: PeriodKind, edge: 'start' | 'end', dateStr: string) => void;
  markedDate: string | null;
};
```

1c. 함수 구조분해에 `onPeriodMark, markedDate` 추가.

1d. `handleCreate`(97~100줄)는 유지(메뉴의 "입력 화면 이동"에서 사용). 셀 루트 `div`(102~125줄)를 메뉴로 감싼다. `inSelectedRange`일 때만 메뉴를 달고, 아니면 기존 비활성 div 그대로.

루트 렌더를 아래 구조로 교체(셀 div의 className/내용은 기존 유지하되 `onClick`/`onKeyDown` 제거, ring 강조 추가):
```tsx
  const marked = markedDate !== null && dateStr === markedDate;

  const cell = (
    <div
      role="button"
      tabIndex={inSelectedRange ? 0 : -1}
      className={[
        'relative flex min-h-[110px] w-full flex-col rounded-2xl border p-2 text-left transition sm:min-h-[140px] sm:p-3 md:min-h-[180px]',
        inSelectedRange ? 'cursor-pointer bg-white hover:shadow-sm' : 'bg-zinc-50 text-zinc-400 opacity-65',
        powerWar ? 'border-emerald-500 border-2' : guildWar ? 'border-amber-400 border-2' : 'border-zinc-200',
        raidDay ? 'bg-zinc-100/90' : '',
        marked ? 'ring-2 ring-zinc-400' : '',
      ].join(' ')}
    >
      {/* ↓ 기존 셀 내부(날짜/경고/로그 뱃지) 그대로 유지 */}
      {/* 126~158줄의 내부 JSX를 여기로 이동 */}
    </div>
  );

  if (!inSelectedRange) return cell;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{cell}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>길드전</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onPeriodMark('guild', 'start', dateStr)}>길드전 시작</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPeriodMark('guild', 'end', dateStr)}>길드전 종료</DropdownMenuItem>
        <DropdownMenuLabel>강림전</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onPeriodMark('raid', 'start', dateStr)}>강림전 시작</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPeriodMark('raid', 'end', dateStr)}>강림전 종료</DropdownMenuItem>
        <DropdownMenuLabel>총력전</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onPeriodMark('power', 'start', dateStr)}>총력전 시작</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPeriodMark('power', 'end', dateStr)}>총력전 종료</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onCreateDate(dateStr)} className="text-blue-600 font-medium">
          입력 화면 이동
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
```
> 셀 내부 로그 뱃지(`DayLogBadge`)는 기존대로 `stopPropagation`을 하므로, 뱃지 클릭 시 메뉴가 열리지 않고 로그 수정으로 동작한다. 기존 코드 유지.

- [ ] **Step 2: App.tsx — 페어링 상태/콜백/배너**

2a. import 추가:
```ts
import { applyMark, type PeriodKind, type PendingMark } from '@/lib/periodMark';
```

2b. 상태 추가(다른 useState 근처):
```ts
  const [pendingMark, setPendingMark] = useState<PendingMark | null>(null);
```

2c. 생성 헬퍼 + 마크 핸들러 추가(다른 핸들러 근처, 예: `selectGuildWarRangeFromToday` 위/아래):
```ts
  const createPeriodByKind = async (kind: PeriodKind, start: string, end: string) => {
    const endpoint =
      kind === 'guild' ? '/api/guild-war-periods' : kind === 'power' ? '/api/power-war-periods' : '/api/raid-deadlines';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end }),
      });
      if (!res.ok) throw new Error(`Failed to create ${kind} period`);
      const created = (await res.json()) as GuildWarPeriod;
      const setter =
        kind === 'guild' ? setGuildWarPeriods : kind === 'power' ? setPowerWarPeriods : setRaidDeadlines;
      setter((prev) => sortByDate([...prev, created], 'start'));
    } catch (error) {
      console.error(error);
    }
  };

  const handlePeriodMark = (kind: PeriodKind, edge: 'start' | 'end', dateStr: string) => {
    const { pending, completed } = applyMark(pendingMark, kind, edge, dateStr);
    setPendingMark(pending);
    if (completed) void createPeriodByKind(completed.kind, completed.start, completed.end);
  };
```
> `setRaidDeadlines`는 `RaidPeriod[]` setter이지만 `created`(GuildWarPeriod 동형)와 구조가 같아 호환. 타입 에러가 나면 `created`를 `as GuildWarPeriod & RaidPeriod` 대신 각 분기에서 setter별로 분리.

2d. DayCell 렌더(842~856줄)에 prop 2개 추가:
```tsx
                      <DayCell
                        key={day.toISOString()}
                        day={day}
                        rangeStart={rangeStart}
                        rangeEnd={rangeEnd}
                        logs={logs}
                        guildWarPeriods={guildWarPeriods}
                        powerWarPeriods={powerWarPeriods}
                        raidDeadlines={raidDeadlines}
                        warnings={dashboardWarnings}
                        onCreateDate={loadNewEntry}
                        onEditLog={loadExistingEntry}
                        onPeriodMark={handlePeriodMark}
                        markedDate={pendingMark ? (pendingMark.start ?? pendingMark.end ?? null) : null}
                      />
```

2e. 페어링 안내 배너 — 달력 그리드 위(CardContent 안 그리드 `div` 바로 앞, 832줄 `<CardContent ...>` 직후)에 삽입:
```tsx
                  {pendingMark && (
                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-300 bg-amber-50 px-4 py-2 text-sm">
                      <span className="text-zinc-700">
                        {kindLabel(pendingMark.kind)} {pendingMark.start ? '시작' : '종료'}{' '}
                        <strong>{displayDate(pendingMark.start ?? pendingMark.end ?? '')}</strong> 선택됨 — 나머지 날짜 칸을 선택하세요.
                      </span>
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setPendingMark(null)}>
                        취소
                      </Button>
                    </div>
                  )}
```
`kindLabel` 헬퍼를 컴포넌트 밖(파일 상단, 다른 const 근처)에 추가:
```ts
const kindLabel = (kind: PeriodKind) => (kind === 'guild' ? '길드전' : kind === 'power' ? '총력전' : '강림전');
```
> `displayDate`가 App.tsx에 import되어 있는지 확인(미import면 `@/lib/dates`에서 추가). 832줄 `CardContent`가 `overflow-x-auto`이므로 배너는 그 안 최상단에 위치하면 됨.

- [ ] **Step 3: 빌드 그린 확인**

Run: `npm run build`
Expected: 타입 에러 없음.

- [ ] **Step 4: 단위 테스트 재확인**

Run: `npm test`
Expected: 기존 + periodMark 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/components/calendar.tsx src/App.tsx
git commit -m "feat: 현황판 칸 좌클릭 메뉴 + 2단계 페어링 기간 생성"
```

---

## Task 5: 통합 검증 (수동)

**Files:** 없음(실행만)

- [ ] **Step 1: 개발 서버 실행 및 시나리오 점검**

Run: `npm run dev` (또는 프로젝트의 dev 명령)

수동 체크리스트:
- [ ] 현황판에서 범위 내 칸 좌클릭 → 메뉴 팝업(7개 항목) 표시
- [ ] 범위 밖(흐린) 칸은 메뉴 안 열림
- [ ] "길드전 시작" 후 다른 칸 "길드전 종료" → 노란 테두리 기간 생성, 배너가 떴다 사라짐
- [ ] "총력전 시작/종료" → 초록 테두리 기간 생성
- [ ] "강림전 시작/종료" → 회색 음영 기간 생성
- [ ] 종료를 먼저 누르고 시작을 나중에 눌러도 생성됨
- [ ] 배너의 "취소" 클릭 시 pending 해제
- [ ] 로그 뱃지 클릭 → 메뉴 안 열리고 입력 수정으로 이동
- [ ] "입력 화면 이동" → 해당 날짜로 입력 탭 이동
- [ ] 관리 탭 강림원정대 카드: 시작/종료 입력으로 기간 추가·수정·삭제 동작, "다음 마감일 자동" 버튼 사라짐
- [ ] 관리 탭 강림 캘린더: 기간이 막대로 표시됨

- [ ] **Step 2: (이상 없으면) 완료**

이상 발견 시 systematic-debugging으로 원인 추적 후 해당 Task로 복귀.

---

## Self-Review 결과

- **스펙 커버리지:** 메뉴(Task4)·페어링(Task1+4)·강림 기간화/마이그레이션(Task3)·회색음영 A안(Task3 5c/6j)·autoAdd 제거(Task3 6h/6i)·드롭다운 컴포넌트(Task2) 모두 태스크로 매핑됨.
- **플레이스홀더:** 없음(모든 코드 블록 실제 내용).
- **타입 일관성:** `PeriodKind`/`PendingMark`/`applyMark`(Task1) → calendar/App(Task4) 동일 사용. `RaidPeriod`(Task3) 일관 적용. `createPeriodByKind`의 raid setter 호환성은 주석으로 폴백 명시.
