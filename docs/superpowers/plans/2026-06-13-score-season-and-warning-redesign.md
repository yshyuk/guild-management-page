# 점수 시즌 전환 · 경고 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 점수의 차수(round) 개념을 시즌(날짜 구간) 단위로 전환하고, 타입별 점수 구간 재정의 + 현황판 경고 표시(기간·활성 필터·캘린더 표기)를 개선한다.

**Architecture:** 데이터 모델에서 `scores.round`/`scoreSeasons.roundCount`를 제거하고 시즌당 길드원 1점수 구조로 바꾼다. 시즌은 `startDate`/`endDate`를 가지며 `오늘 > endDate`이면 "종료"로 자동 판정되어 전체 시즌추이 그래프에 포함된다. 순수 로직(버킷/시즌 순위/추이)은 Vitest로 TDD하고, API/UI는 `tsc` 타입체크 + 수동 검증한다.

**Tech Stack:** React 19, Hono(Cloudflare Workers), Drizzle ORM + D1(SQLite), Recharts, Tailwind v4, Vitest(신규).

**근거 명세:** `docs/superpowers/specs/2026-06-13-score-season-and-warning-redesign-design.md`

---

## File Structure

- `package.json`, `vitest.config.ts`, `tsconfig.app.json` — Vitest 테스트 인프라
- `src/worker/db/schema.ts`, `drizzle/0002_season_scores.sql` — 스키마 + 데이터 초기화 마이그레이션
- `src/lib/types.ts` — ScoreSeason/ScoreCell/SeasonScore 타입
- `src/worker/routes/scores.ts`, `src/worker/routes/score-seasons.ts` — API
- `src/lib/score.ts` — 타입별 점수 구간 버킷 (순수, TDD)
- `src/lib/analysis.ts` — 시즌 순위/변동/추이/막대 데이터 (순수, TDD)
- `src/components/ScoreBoard.tsx` — 점수표(시즌당 1점수 + 직전 시즌 변동) + 시즌 추가(시작/종료일)
- `src/components/ScoreChart.tsx` — 단일 시즌 막대 / 전체 시즌추이 꺾은선
- `src/components/StatsBoard.tsx` — 통계(차수 제거, 타입 버킷)
- `src/App.tsx`, `src/components/WarningPanel.tsx`, `src/components/calendar.tsx` — 경고 기간·활성 필터 + 캘린더 표기

---

## Task 1: Vitest 테스트 인프라

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.app.json:24`

- [ ] **Step 1: vitest 설치**

Run:
```bash
npm install -D vitest@^3
```
Expected: `package.json`의 devDependencies에 `vitest` 추가, 설치 성공.

- [ ] **Step 2: package.json 스크립트 추가**

`package.json`의 `scripts`에 두 줄 추가 (`lint` 아래):
```json
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 3: vitest.config.ts 생성**

`vitest.config.ts` 생성:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: tsconfig.app.json에서 테스트 파일 제외**

`tsconfig.app.json`의 마지막 `exclude` 줄을 교체:
```json
  "exclude": ["src/worker", "src/**/*.test.ts"]
```

- [ ] **Step 5: 인프라 동작 확인**

Run: `npx vitest run --passWithNoTests`
Expected: 종료 코드 0 (테스트 파일 없음, 통과 처리).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.app.json
git commit -m "chore: Vitest 테스트 인프라 추가"
```

---

## Task 2: 스키마 변경 + 데이터 초기화 마이그레이션

**Files:**
- Modify: `src/worker/db/schema.ts:128-164`
- Create: `drizzle/0002_season_scores.sql`

- [ ] **Step 1: scoreSeasons 스키마 교체**

`src/worker/db/schema.ts`에서 `scoreSeasons` 정의(128~141행)를 교체:
```ts
// 점수 시즌 — type: 총력전 / 길드전 / 강림전. start~end 날짜 구간.
export const scoreSeasons = sqliteTable(
  'score_seasons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    name: text('name').notNull(),
    startDate: text('start_date').notNull(), // YYYY-MM-DD
    endDate: text('end_date').notNull(), // YYYY-MM-DD (오늘 > end 이면 종료된 시즌)
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index('score_seasons_type_idx').on(t.type)],
);
```

- [ ] **Step 2: scores 스키마 교체**

같은 파일에서 `scores` 정의(143~164행)를 교체:
```ts
// 점수 — 시즌별/길드원별 단일 점수 (차수 없음)
export const scores = sqliteTable(
  'scores',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => scoreSeasons.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    uniqueIndex('scores_unique').on(t.seasonId, t.memberId),
    index('scores_season_idx').on(t.seasonId),
  ],
);
```

- [ ] **Step 3: 마이그레이션 SQL 작성 (기존 점수 데이터 전체 초기화)**

`drizzle/0002_season_scores.sql` 생성:
```sql
DROP TABLE IF EXISTS `scores`;--> statement-breakpoint
DROP TABLE IF EXISTS `score_seasons`;--> statement-breakpoint
CREATE TABLE `score_seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `score_seasons_type_idx` ON `score_seasons` (`type`);--> statement-breakpoint
CREATE TABLE `scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`score` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `score_seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scores_unique` ON `scores` (`season_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `scores_season_idx` ON `scores` (`season_id`);
```

- [ ] **Step 4: 로컬 마이그레이션 적용**

Run: `npm run db:migrate:local`
Expected: `0002_season_scores.sql` 적용 성공. (실패 시: 로컬 D1을 초기화하려면 `.wrangler` 상태 확인 후 재적용.)

- [ ] **Step 5: Commit**

```bash
git add src/worker/db/schema.ts drizzle/0002_season_scores.sql
git commit -m "feat: 점수 스키마를 시즌 단위로 전환 (차수 제거, 데이터 초기화)"
```

> 원격 적용은 최종 배포 시 `npm run db:migrate:remote` (Task 13에서 안내). **원격 점수 데이터가 삭제되므로 실행 전 사용자 재확인.**

---

## Task 3: 공유 타입 변경

**Files:**
- Modify: `src/lib/types.ts:51-62`

- [ ] **Step 1: ScoreSeason / ScoreCell 교체 + SeasonScore 추가**

`src/lib/types.ts`의 `ScoreSeason`/`ScoreCell` 정의(51~62행)를 교체:
```ts
export type ScoreSeason = {
  id: number;
  type: ScoreType;
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
};

// 단일 시즌 점수 (시즌당 길드원 1점수)
export type ScoreCell = {
  memberId: number;
  score: number;
};

// 타입 전체 시즌 점수 (전체 시즌추이 그래프용)
export type SeasonScore = {
  seasonId: number;
  memberId: number;
  score: number;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: 점수 타입을 시즌 단위로 변경 (ScoreSeason/ScoreCell/SeasonScore)"
```

> 이 시점에서 `tsc`는 아직 실패한다(라우트/컴포넌트가 옛 필드 사용). Task 4~10에서 해소.

---

## Task 4: scores 라우트 — 차수 제거 + 타입 전체 조회

**Files:**
- Modify: `src/worker/routes/scores.ts` (전체 교체)

- [ ] **Step 1: 라우트 전체 교체**

`src/worker/routes/scores.ts` 전체를 교체:
```ts
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { scores, scoreSeasons } from '../db/schema';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const type = c.req.query('type');

  // 타입의 전 시즌 점수 (전체 시즌추이 그래프용)
  if (type) {
    const rows = await db
      .select({ seasonId: scores.seasonId, memberId: scores.memberId, score: scores.score })
      .from(scores)
      .innerJoin(scoreSeasons, eq(scores.seasonId, scoreSeasons.id))
      .where(eq(scoreSeasons.type, type));
    return c.json(rows);
  }

  // 단일 시즌 점수
  const seasonId = Number(c.req.query('seasonId'));
  if (Number.isNaN(seasonId)) return c.json({ error: 'seasonId or type is required' }, 400);
  const rows = await db
    .select({ memberId: scores.memberId, score: scores.score })
    .from(scores)
    .where(eq(scores.seasonId, seasonId));
  return c.json(rows);
});

// 셀 단위 upsert. score 가 null/빈값이면 해당 셀 삭제.
app.put('/', async (c) => {
  const body = await c.req.json<{
    seasonId?: number;
    memberId?: number;
    score?: number | null;
  }>();

  if (typeof body.seasonId !== 'number' || typeof body.memberId !== 'number') {
    return c.json({ error: 'seasonId and memberId are required' }, 400);
  }

  const db = getDb(c.env.DB);
  const cell = and(eq(scores.seasonId, body.seasonId), eq(scores.memberId, body.memberId));

  if (body.score === null || body.score === undefined || Number.isNaN(body.score)) {
    await db.delete(scores).where(cell);
    return c.json({ success: true, deleted: true });
  }

  await db
    .insert(scores)
    .values({ seasonId: body.seasonId, memberId: body.memberId, score: body.score })
    .onConflictDoUpdate({
      target: [scores.seasonId, scores.memberId],
      set: { score: body.score },
    });

  return c.json({ success: true });
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add src/worker/routes/scores.ts
git commit -m "feat: scores 라우트 차수 제거 + 타입 전체 조회 추가"
```

---

## Task 5: score-seasons 라우트 — 시작/종료일 지원

**Files:**
- Modify: `src/worker/routes/score-seasons.ts` (전체 교체)

- [ ] **Step 1: 라우트 전체 교체**

`src/worker/routes/score-seasons.ts` 전체를 교체:
```ts
import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { scoreSeasons } from '../db/schema';
import type { AppEnv } from '../types';
import type { ScoreType } from '@/lib/types';

const app = new Hono<AppEnv>();

const VALID_TYPES: ScoreType[] = ['총력전', '길드전', '강림전'];

function serialize(row: {
  id: number;
  type: string;
  name: string;
  startDate: string;
  endDate: string;
}) {
  return {
    id: row.id,
    type: row.type as ScoreType,
    name: row.name,
    start: row.startDate,
    end: row.endDate,
  };
}

app.get('/', async (c) => {
  const type = c.req.query('type');
  const db = getDb(c.env.DB);
  const where = type ? eq(scoreSeasons.type, type) : undefined;
  const rows = await db
    .select()
    .from(scoreSeasons)
    .where(where)
    .orderBy(asc(scoreSeasons.endDate), asc(scoreSeasons.id));
  return c.json(rows.map(serialize));
});

app.post('/', async (c) => {
  const body = await c.req.json<{ type?: string; name?: string; start?: string; end?: string }>();
  const name = body.name?.trim();
  if (!body.type || !VALID_TYPES.includes(body.type as ScoreType)) {
    return c.json({ error: 'valid type is required' }, 400);
  }
  if (!name) return c.json({ error: 'name is required' }, 400);
  if (!body.start || !body.end) return c.json({ error: 'start and end are required' }, 400);

  const db = getDb(c.env.DB);
  const [created] = await db
    .insert(scoreSeasons)
    .values({ type: body.type, name, startDate: body.start, endDate: body.end })
    .returning();
  return c.json(serialize(created), 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<{ name?: string; start?: string; end?: string }>();
  const data: { name?: string; startDate?: string; endDate?: string } = {};
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (typeof body.start === 'string' && body.start) data.startDate = body.start;
  if (typeof body.end === 'string' && body.end) data.endDate = body.end;
  if (Object.keys(data).length === 0) {
    return c.json({ error: 'No valid fields provided' }, 400);
  }

  const db = getDb(c.env.DB);
  const [updated] = await db
    .update(scoreSeasons)
    .set(data)
    .where(eq(scoreSeasons.id, id))
    .returning();
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(serialize(updated));
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb(c.env.DB);
  await db.delete(scoreSeasons).where(eq(scoreSeasons.id, id));
  return c.json({ success: true });
});

export default app;
```

- [ ] **Step 2: Commit**

```bash
git add src/worker/routes/score-seasons.ts
git commit -m "feat: score-seasons 라우트 시작/종료일 지원 (roundCount 제거)"
```

---

## Task 6: 점수 구간 버킷 — 타입별 경계 (TDD)

**Files:**
- Test: `src/lib/score.test.ts`
- Modify: `src/lib/score.ts:39-70` (버킷 섹션 교체)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/score.test.ts` 생성:
```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `bucketize`/`findBucket`이 새 시그니처(type 인자)와 맞지 않거나 미정의.

- [ ] **Step 3: 버킷 섹션 구현 교체**

`src/lib/score.ts`의 39행(`// ── 점수구간(버킷) ──`)부터 파일 끝(70행)까지를 교체:
```ts
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
```

> 참고: 기존 `bucketStart`/`bucketLabel`은 제거된다(Task 10의 교차분포가 `findBucket`을 사용).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (score 관련 테스트 전부 통과).

- [ ] **Step 5: Commit**

```bash
git add src/lib/score.ts src/lib/score.test.ts
git commit -m "feat: 타입별 점수 구간 버킷 + 테스트"
```

---

## Task 7: 시즌 분석 로직 — 순위/변동/추이 (TDD)

**Files:**
- Test: `src/lib/analysis.test.ts`
- Modify: `src/lib/analysis.ts` (전체 교체)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/analysis.test.ts` 생성:
```ts
import { describe, it, expect } from 'vitest';
import {
  sortSeasons,
  prevSeason,
  endedSeasons,
  buildSeasonRanking,
  buildSingleSeasonBars,
  buildTrendData,
} from './analysis';
import type { Member, ScoreSeason, SeasonScore } from './types';

const seasons: ScoreSeason[] = [
  { id: 1, type: '총력전', name: 'S1', start: '2026-01-01', end: '2026-01-31' },
  { id: 2, type: '총력전', name: 'S2', start: '2026-02-01', end: '2026-02-28' },
  { id: 3, type: '총력전', name: 'S3', start: '2026-03-01', end: '2026-03-31' },
];
const members: Member[] = [
  { id: 10, name: '가', active: true },
  { id: 11, name: '나', active: true },
];

describe('prevSeason', () => {
  it('직전 시즌은 종료일 기준 바로 앞', () => {
    expect(prevSeason(seasons, 2)?.id).toBe(1);
    expect(prevSeason(seasons, 1)).toBeNull();
  });
});

describe('endedSeasons', () => {
  it('오늘보다 종료일이 이른 시즌만', () => {
    expect(endedSeasons(seasons, '2026-03-15').map((s) => s.id)).toEqual([1, 2]);
  });
});

describe('buildSeasonRanking', () => {
  it('점수 내림차순 + 직전 시즌 대비 변동', () => {
    const current = new Map([[10, 5000], [11, 4000]]);
    const prev = new Map([[10, 4800], [11, 4500]]);
    const rows = buildSeasonRanking(members, current, prev);
    expect(rows[0].name).toBe('가');
    expect(rows[0].delta.kind).toBe('up');
    expect(rows[1].delta.kind).toBe('down');
  });
  it('점수 없는 길드원은 제외', () => {
    const rows = buildSeasonRanking(members, new Map([[10, 100]]), null);
    expect(rows).toHaveLength(1);
    expect(rows[0].delta.kind).toBe('none');
  });
});

describe('buildSingleSeasonBars', () => {
  it('점수 내림차순 정렬', () => {
    const bars = buildSingleSeasonBars(members, new Map([[10, 100], [11, 300]]));
    expect(bars.map((b) => b.score)).toEqual([300, 100]);
  });
});

describe('buildTrendData', () => {
  it('전달된 시즌만, 점수 없으면 null', () => {
    const all: SeasonScore[] = [
      { seasonId: 1, memberId: 10, score: 100 },
      { seasonId: 2, memberId: 10, score: 200 },
    ];
    const data = buildTrendData(members, all, sortSeasons(seasons).slice(0, 2));
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ season: 'S1', 가: 100, 나: null });
    expect(data[1]).toMatchObject({ season: 'S2', 가: 200, 나: null });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — analysis 함수 미정의/시그니처 불일치.

- [ ] **Step 3: analysis.ts 전체 교체**

`src/lib/analysis.ts` 전체를 교체:
```ts
import type { Member, ScoreSeason, SeasonScore } from './types';
import { computeDelta, type Delta } from './score';

// 단일 시즌: memberId -> score
export function toScoreMap(cells: { memberId: number; score: number }[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cells) m.set(c.memberId, c.score);
  return m;
}

// 시즌 정렬: 종료일 오름차순, id 보조
export function sortSeasons(seasons: ScoreSeason[]): ScoreSeason[] {
  return [...seasons].sort((a, b) => a.end.localeCompare(b.end) || a.id - b.id);
}

// 직전 시즌 (정렬 기준 바로 앞). 첫 시즌이면 null.
export function prevSeason(seasons: ScoreSeason[], currentId: number): ScoreSeason | null {
  const sorted = sortSeasons(seasons);
  const idx = sorted.findIndex((s) => s.id === currentId);
  if (idx <= 0) return null;
  return sorted[idx - 1];
}

// 종료된 시즌만 (오늘 > 종료일), 종료일 오름차순
export function endedSeasons(seasons: ScoreSeason[], today: string): ScoreSeason[] {
  return sortSeasons(seasons).filter((s) => s.end < today);
}

export type RankRow = {
  rank: number;
  memberId: number;
  name: string;
  score: number;
  delta: Delta;
};

// 선택 시즌 순위 + 직전 시즌 대비 변동
export function buildSeasonRanking(
  members: Member[],
  current: Map<number, number>,
  prev: Map<number, number> | null,
): RankRow[] {
  const rows = members
    .map((m) => {
      const score = current.get(m.id);
      if (score === undefined) return null;
      const prevScore = prev?.get(m.id);
      return {
        memberId: m.id,
        name: m.name,
        score,
        delta: computeDelta(score, prevScore ?? null),
      };
    })
    .filter((r): r is Omit<RankRow, 'rank'> => r !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

// 단일 시즌 막대그래프 데이터 (점수 내림차순)
export function buildSingleSeasonBars(
  members: Member[],
  current: Map<number, number>,
): Array<{ name: string; score: number }> {
  return members
    .map((m) => {
      const score = current.get(m.id);
      return score === undefined ? null : { name: m.name, score };
    })
    .filter((r): r is { name: string; score: number } => r !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
}

// 전체 시즌추이 꺾은선 데이터: [{ season: name, [memberName]: score|null }]
// seasons 인자는 종료된 시즌(정렬됨)을 넘긴다.
export function buildTrendData(
  members: Member[],
  allScores: SeasonScore[],
  seasons: ScoreSeason[],
): Array<Record<string, string | number | null>> {
  const bySeason = new Map<number, Map<number, number>>();
  for (const s of allScores) {
    let mm = bySeason.get(s.seasonId);
    if (!mm) {
      mm = new Map();
      bySeason.set(s.seasonId, mm);
    }
    mm.set(s.memberId, s.score);
  }
  return seasons.map((season) => {
    const row: Record<string, string | number | null> = { season: season.name };
    const mm = bySeason.get(season.id);
    for (const m of members) row[m.name] = mm?.get(m.id) ?? null;
    return row;
  });
}

// 길드원별 선 색상 (인덱스 기반, 채도 높은 팔레트 순환)
const LINE_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef',
  '#ec4899', '#f43f5e', '#84cc16', '#14b8a6', '#0ea5e9',
  '#a855f7', '#e11d48', '#65a30d', '#0891b2', '#7c3aed',
];

export function lineColor(idx: number): string {
  return LINE_PALETTE[idx % LINE_PALETTE.length];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (score + analysis 전부 통과).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis.ts src/lib/analysis.test.ts
git commit -m "feat: 시즌 기반 순위/변동/추이 로직 + 테스트"
```

---

## Task 8: ScoreBoard — 점수표(시즌당 1점수 + 직전 시즌 변동)

**Files:**
- Modify: `src/components/ScoreBoard.tsx` (전체 교체)

- [ ] **Step 1: 컴포넌트 전체 교체**

`src/components/ScoreBoard.tsx` 전체를 교체:
```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Table2, TrendingUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { computeDelta, deltaText, deltaColorClass } from '@/lib/score';
import { toScoreMap, prevSeason, sortSeasons } from '@/lib/analysis';
import { formatDate } from '@/lib/dates';
import ScoreChart from '@/components/ScoreChart';
import type { Member, ScoreSeason, ScoreType, SeasonScore } from '@/lib/types';

type Props = {
  type: ScoreType;
  members: Member[];
};

export default function ScoreBoard({ type, members }: Props) {
  const today = formatDate(new Date());
  const [seasons, setSeasons] = useState<ScoreSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [allScores, setAllScores] = useState<SeasonScore[]>([]);
  const [scoreMap, setScoreMap] = useState<Record<number, number>>({});
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newSeasonStart, setNewSeasonStart] = useState(today);
  const [newSeasonEnd, setNewSeasonEnd] = useState(today);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'chart'>('table');

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );
  const sortedSeasons = useMemo(() => sortSeasons(seasons), [seasons]);

  // 시즌 목록 + 타입 전체 점수 로드
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<ScoreSeason[]>(`/score-seasons?type=${encodeURIComponent(type)}`),
      api.get<SeasonScore[]>(`/scores?type=${encodeURIComponent(type)}`),
    ])
      .then(([seasonData, scoreData]) => {
        if (cancelled) return;
        setSeasons(seasonData);
        setAllScores(scoreData);
        setSelectedSeasonId((prev) => {
          if (prev && seasonData.some((s) => s.id === prev)) return prev;
          const sorted = sortSeasons(seasonData);
          return sorted.length > 0 ? sorted[sorted.length - 1].id : null;
        });
      })
      .catch(console.error)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [type]);

  // 선택 시즌 점수맵 파생
  useEffect(() => {
    if (selectedSeasonId === null) {
      setScoreMap({});
      return;
    }
    const map: Record<number, number> = {};
    for (const s of allScores) if (s.seasonId === selectedSeasonId) map[s.memberId] = s.score;
    setScoreMap(map);
  }, [selectedSeasonId, allScores]);

  const prev = useMemo(
    () => (selectedSeasonId ? prevSeason(seasons, selectedSeasonId) : null),
    [seasons, selectedSeasonId],
  );
  const prevMap = useMemo(() => {
    if (!prev) return null;
    return toScoreMap(
      allScores.filter((s) => s.seasonId === prev.id).map((s) => ({ memberId: s.memberId, score: s.score })),
    );
  }, [prev, allScores]);

  const getScore = useCallback(
    (memberId: number): number | null => {
      const v = scoreMap[memberId];
      return v === undefined ? null : v;
    },
    [scoreMap],
  );

  const handleScoreChange = (memberId: number, raw: string) => {
    setScoreMap((prev) => {
      const next = { ...prev };
      if (raw.trim() === '') delete next[memberId];
      else {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) next[memberId] = parsed;
      }
      return next;
    });
  };

  const persistCell = async (memberId: number) => {
    if (selectedSeasonId === null) return;
    const value = getScore(memberId);
    try {
      await api.put('/scores', { seasonId: selectedSeasonId, memberId, score: value });
      setAllScores((prev) => {
        const others = prev.filter((s) => !(s.seasonId === selectedSeasonId && s.memberId === memberId));
        return value === null ? others : [...others, { seasonId: selectedSeasonId, memberId, score: value }];
      });
    } catch (error) {
      console.error(error);
    }
  };

  const addSeason = async () => {
    const name = newSeasonName.trim();
    if (!name || !newSeasonStart || !newSeasonEnd) return;
    try {
      const created = await api.post<ScoreSeason>('/score-seasons', {
        type,
        name,
        start: newSeasonStart,
        end: newSeasonEnd,
      });
      setSeasons((prev) => [...prev, created]);
      setSelectedSeasonId(created.id);
      setNewSeasonName('');
    } catch (error) {
      console.error(error);
    }
  };

  const deleteSeason = async () => {
    if (!selectedSeason) return;
    if (!window.confirm(`'${selectedSeason.name}' 시즌을 삭제하시겠습니까? 입력된 점수도 함께 삭제됩니다.`)) return;
    try {
      const removedId = selectedSeason.id;
      await api.del(`/score-seasons/${removedId}`);
      setAllScores((prev) => prev.filter((s) => s.seasonId !== removedId));
      setSeasons((prev) => {
        const next = prev.filter((s) => s.id !== removedId);
        const sorted = sortSeasons(next);
        setSelectedSeasonId(sorted.length > 0 ? sorted[sorted.length - 1].id : null);
        return next;
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Card className="rounded-[28px] border-0 shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <CardTitle className="text-xl">{type} 점수 비교표</CardTitle>
            <CardDescription>
              점수를 입력하면 직전 시즌 대비 변동폭이 자동 표시됩니다. (상승 빨강 / 하락 파랑)
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedSeasonId ? String(selectedSeasonId) : undefined}
              onValueChange={(value) => setSelectedSeasonId(Number(value))}
            >
              <SelectTrigger className="w-[200px] rounded-2xl">
                <SelectValue placeholder="시즌 선택" />
              </SelectTrigger>
              <SelectContent>
                {sortedSeasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="rounded-2xl" onClick={deleteSeason} disabled={!selectedSeason}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">새 시즌 이름</label>
            <Input
              value={newSeasonName}
              onChange={(e) => setNewSeasonName(e.target.value)}
              placeholder="예: 6월 시즌"
              className="w-[200px] rounded-2xl"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addSeason();
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">시작일</label>
            <Input type="date" value={newSeasonStart} onChange={(e) => setNewSeasonStart(e.target.value)} className="rounded-2xl" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">종료일</label>
            <Input type="date" value={newSeasonEnd} min={newSeasonStart} onChange={(e) => setNewSeasonEnd(e.target.value)} className="rounded-2xl" />
          </div>
          <Button className="rounded-2xl" onClick={() => void addSeason()}>
            <Plus className="mr-1 h-4 w-4" />시즌 추가
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-400">불러오는 중...</div>
        ) : !selectedSeason ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-16 text-center text-sm text-zinc-500">
            등록된 시즌이 없습니다. 위에서 새 시즌을 추가하세요.
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-16 text-center text-sm text-zinc-500">
            활성 길드원이 없습니다. 관리 탭에서 길드원을 추가하세요.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <div className="inline-flex rounded-xl bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => setView('table')}
                  className={['flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition', view === 'table' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}
                >
                  <Table2 className="h-4 w-4" />점수표
                </button>
                <button
                  type="button"
                  onClick={() => setView('chart')}
                  className={['flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition', view === 'chart' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}
                >
                  <TrendingUp className="h-4 w-4" />그래프
                </button>
              </div>
            </div>

            {view === 'chart' ? (
              <ScoreChart
                members={members}
                seasons={seasons}
                selectedSeasonId={selectedSeasonId}
                allScores={allScores}
                today={today}
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-zinc-200">
                <div className="grid grid-cols-[1.6fr_1fr_0.9fr] bg-zinc-50 px-3 py-3 text-xs font-semibold text-zinc-600">
                  <div>{type} 점수변동</div>
                  <div className="text-right">점수</div>
                  <div className="text-right">변동</div>
                </div>
                <div className="max-h-[680px] overflow-auto">
                  {members.map((member, idx) => {
                    const score = getScore(member.id);
                    const delta = computeDelta(score, prevMap?.get(member.id) ?? null);
                    return (
                      <div
                        key={member.id}
                        className={['grid grid-cols-[1.6fr_1fr_0.9fr] items-center border-t border-zinc-100 px-3 py-1.5 text-sm', idx % 2 === 1 ? 'bg-zinc-50/60' : ''].join(' ')}
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
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ScoreBoard.tsx
git commit -m "feat: 점수표를 시즌당 1점수 + 직전 시즌 변동으로 전환 (차수 UI 제거)"
```

> 이 시점에서 `ScoreChart` props가 아직 옛 형태라 `tsc`는 실패한다. Task 9에서 해소.

---

## Task 9: ScoreChart — 단일 시즌 막대 / 전체 시즌추이 꺾은선

**Files:**
- Modify: `src/components/ScoreChart.tsx` (전체 교체)

- [ ] **Step 1: 컴포넌트 전체 교체**

`src/components/ScoreChart.tsx` 전체를 교체:
```tsx
import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  toScoreMap,
  buildSingleSeasonBars,
  endedSeasons,
  buildTrendData,
  lineColor,
} from '@/lib/analysis';
import type { Member, ScoreSeason, SeasonScore } from '@/lib/types';

type Props = {
  members: Member[];
  seasons: ScoreSeason[];
  selectedSeasonId: number | null;
  allScores: SeasonScore[];
  today: string;
};

const EMPTY = (msg: string) => (
  <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-16 text-center text-sm text-zinc-500">
    {msg}
  </div>
);

export default function ScoreChart({ members, seasons, selectedSeasonId, allScores, today }: Props) {
  const [mode, setMode] = useState<'single' | 'trend'>('single');
  const [memberFilter, setMemberFilter] = useState<string>('all');

  const singleData = useMemo(() => {
    if (selectedSeasonId === null) return [];
    const map = toScoreMap(
      allScores.filter((s) => s.seasonId === selectedSeasonId).map((s) => ({ memberId: s.memberId, score: s.score })),
    );
    return buildSingleSeasonBars(members, map);
  }, [members, allScores, selectedSeasonId]);

  const ended = useMemo(() => endedSeasons(seasons, today), [seasons, today]);
  const trendData = useMemo(() => buildTrendData(members, allScores, ended), [members, allScores, ended]);

  const drawnMembers = useMemo(() => {
    const withScore = members.filter((m) =>
      allScores.some((s) => s.memberId === m.id && ended.some((e) => e.id === s.seasonId)),
    );
    if (memberFilter === 'all') return withScore;
    return withScore.filter((m) => m.name === memberFilter);
  }, [members, allScores, ended, memberFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={['rounded-lg px-3 py-1.5 text-sm font-medium transition', mode === 'single' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}
          >
            단일 시즌
          </button>
          <button
            type="button"
            onClick={() => setMode('trend')}
            className={['rounded-lg px-3 py-1.5 text-sm font-medium transition', mode === 'trend' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'].join(' ')}
          >
            전체 시즌추이
          </button>
        </div>
        {mode === 'trend' && (
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger className="w-[200px] rounded-2xl">
              <SelectValue placeholder="길드원 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 길드원</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.name}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {mode === 'single' ? (
        singleData.length === 0 ? (
          EMPTY('입력된 점수가 없습니다. 점수표에서 점수를 입력하세요.')
        ) : (
          <div className="h-[460px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={singleData} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} width={72} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toLocaleString()} />
                <Tooltip
                  formatter={(value) => {
                    const num = typeof value === 'number' ? value : Number(value);
                    return Number.isFinite(num) ? num.toLocaleString() : String(value ?? '');
                  }}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {singleData.map((_, idx) => (
                    <Cell key={idx} fill={lineColor(idx)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      ) : ended.length === 0 ? (
        EMPTY('종료된 시즌이 없습니다. 시즌 종료일이 지나면 추이에 표시됩니다.')
      ) : drawnMembers.length === 0 ? (
        EMPTY('표시할 길드원 점수가 없습니다.')
      ) : (
        <div className="space-y-4">
          <div className="h-[460px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="season" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={72} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toLocaleString()} />
                <Tooltip
                  formatter={(value) => {
                    const num = typeof value === 'number' ? value : Number(value);
                    return Number.isFinite(num) ? num.toLocaleString() : String(value ?? '');
                  }}
                  contentStyle={{ borderRadius: 12, fontSize: 12 }}
                />
                {drawnMembers.map((m, idx) => (
                  <Line
                    key={m.id}
                    type="monotone"
                    dataKey={m.name}
                    stroke={lineColor(memberFilter === 'all' ? idx : members.findIndex((x) => x.id === m.id))}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {memberFilter === 'all' && (
            <div className="flex max-h-24 flex-wrap gap-x-4 gap-y-1.5 overflow-auto rounded-2xl border border-zinc-200 p-3">
              {drawnMembers.map((m, idx) => (
                <div key={m.id} className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: lineColor(idx) }} />
                  {m.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: ScoreBoard/ScoreChart 관련 에러 없음. (StatsBoard는 아직 옛 코드라 에러 가능 — Task 10에서 해소.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ScoreChart.tsx
git commit -m "feat: 그래프 단일 시즌 막대 / 전체 시즌추이 꺾은선 + 길드원 필터"
```

---

## Task 10: StatsBoard — 차수 제거 + 타입 버킷

**Files:**
- Modify: `src/components/StatsBoard.tsx` (전체 교체)

- [ ] **Step 1: 컴포넌트 전체 교체**

`src/components/StatsBoard.tsx` 전체를 교체:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { bucketize, findBucket, deltaText, deltaColorClass } from '@/lib/score';
import { toScoreMap, prevSeason, sortSeasons, buildSeasonRanking } from '@/lib/analysis';
import type { Member, ScoreSeason, ScoreType, SeasonScore } from '@/lib/types';

type Props = {
  type: ScoreType;
  members: Member[];
};

export default function StatsBoard({ type, members }: Props) {
  const [seasons, setSeasons] = useState<ScoreSeason[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [allScores, setAllScores] = useState<SeasonScore[]>([]);
  const [powerSeasons, setPowerSeasons] = useState<ScoreSeason[]>([]);
  const [powerAllScores, setPowerAllScores] = useState<SeasonScore[]>([]);
  const [loading, setLoading] = useState(true);

  const sortedSeasons = useMemo(() => sortSeasons(seasons), [seasons]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<ScoreSeason[]>(`/score-seasons?type=${encodeURIComponent(type)}`),
      api.get<SeasonScore[]>(`/scores?type=${encodeURIComponent(type)}`),
    ])
      .then(([s, sc]) => {
        if (cancelled) return;
        setSeasons(s);
        setAllScores(sc);
        const sorted = sortSeasons(s);
        setSelectedSeasonId(sorted.length > 0 ? sorted[sorted.length - 1].id : null);
      })
      .catch(console.error)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [type]);

  // 길드전: 최신 총력전 시즌 분포 분석용 데이터
  useEffect(() => {
    if (type !== '길드전') {
      setPowerSeasons([]);
      setPowerAllScores([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      api.get<ScoreSeason[]>(`/score-seasons?type=${encodeURIComponent('총력전')}`),
      api.get<SeasonScore[]>(`/scores?type=${encodeURIComponent('총력전')}`),
    ])
      .then(([s, sc]) => {
        if (cancelled) return;
        setPowerSeasons(s);
        setPowerAllScores(sc);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [type]);

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );
  const currentMap = useMemo(
    () => toScoreMap(allScores.filter((s) => s.seasonId === selectedSeasonId).map((s) => ({ memberId: s.memberId, score: s.score }))),
    [allScores, selectedSeasonId],
  );
  const prev = useMemo(
    () => (selectedSeasonId ? prevSeason(seasons, selectedSeasonId) : null),
    [seasons, selectedSeasonId],
  );
  const prevMap = useMemo(
    () => (prev ? toScoreMap(allScores.filter((s) => s.seasonId === prev.id).map((s) => ({ memberId: s.memberId, score: s.score }))) : null),
    [prev, allScores],
  );
  const ranking = useMemo(() => buildSeasonRanking(members, currentMap, prevMap), [members, currentMap, prevMap]);
  const buckets = useMemo(() => bucketize(ranking.map((r) => r.score), type), [ranking, type]);
  const maxBucketCount = Math.max(1, ...buckets.map((b) => b.count));

  const powerMap = useMemo(() => {
    const latest = sortSeasons(powerSeasons).at(-1);
    if (!latest) return new Map<number, number>();
    return toScoreMap(powerAllScores.filter((s) => s.seasonId === latest.id).map((s) => ({ memberId: s.memberId, score: s.score })));
  }, [powerSeasons, powerAllScores]);

  const crossDistribution = useMemo(() => {
    if (type !== '길드전' || powerMap.size === 0) return [];
    const groups = new Map<string, { label: string; min: number; members: { member: string; guild: number }[] }>();
    for (const m of members) {
      const power = powerMap.get(m.id);
      const guild = currentMap.get(m.id);
      if (power === undefined || guild === undefined) continue;
      const bucket = findBucket(power, '총력전');
      if (!bucket) continue;
      const g = groups.get(bucket.label) ?? { label: bucket.label, min: bucket.min, members: [] };
      g.members.push({ member: m.name, guild });
      groups.set(bucket.label, g);
    }
    return [...groups.values()]
      .sort((a, b) => b.min - a.min)
      .map((g) => ({ ...g, members: g.members.sort((a, b) => b.guild - a.guild) }));
  }, [type, powerMap, currentMap, members]);

  if (loading) {
    return (
      <Card className="rounded-[28px] border-0 shadow-sm">
        <CardContent className="py-16 text-center text-sm text-zinc-400">불러오는 중...</CardContent>
      </Card>
    );
  }

  if (!selectedSeason) {
    return (
      <Card className="rounded-[28px] border-0 shadow-sm">
        <CardContent className="py-16 text-center text-sm text-zinc-500">
          등록된 {type} 시즌이 없습니다. 점수 탭에서 시즌을 추가하고 점수를 입력하세요.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-[28px] border-0 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Select value={selectedSeasonId ? String(selectedSeasonId) : undefined} onValueChange={(v) => setSelectedSeasonId(Number(v))}>
            <SelectTrigger className="w-[200px] rounded-2xl">
              <SelectValue placeholder="시즌 선택" />
            </SelectTrigger>
            <SelectContent>
              {sortedSeasons.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-zinc-500">{ranking.length}명 집계</span>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <Card className="rounded-[28px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Trophy className="h-5 w-5 text-amber-500" />길드 내 {type} 순위
            </CardTitle>
            <CardDescription>선택 시즌 점수 기준. 변동은 직전 시즌 대비입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
                입력된 점수가 없습니다.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-zinc-200">
                <div className="grid grid-cols-[0.5fr_1.6fr_1fr_0.9fr] bg-zinc-50 px-3 py-3 text-xs font-semibold text-zinc-600">
                  <div className="text-center">순위</div>
                  <div>닉네임</div>
                  <div className="text-right">점수</div>
                  <div className="text-right">변동</div>
                </div>
                <div className="max-h-[640px] overflow-auto">
                  {ranking.map((row) => (
                    <div key={row.memberId} className="grid grid-cols-[0.5fr_1.6fr_1fr_0.9fr] items-center border-t border-zinc-100 px-3 py-2.5 text-sm">
                      <div className="text-center font-semibold text-zinc-700">
                        {row.rank <= 3 ? (
                          <span className={['inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-white', row.rank === 1 ? 'bg-amber-500' : row.rank === 2 ? 'bg-zinc-400' : 'bg-amber-700'].join(' ')}>
                            {row.rank}
                          </span>
                        ) : (
                          row.rank
                        )}
                      </div>
                      <div className="font-medium text-zinc-800">{row.name}</div>
                      <div className="text-right tabular-nums">{row.score.toLocaleString()}</div>
                      <div className={`text-right text-xs font-semibold tabular-nums ${deltaColorClass(row.delta)}`}>
                        {deltaText(row.delta) || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">점수구간별 인원</CardTitle>
            <CardDescription>{type} 구간 기준 · 선택 시즌</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ranking.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
                집계할 점수가 없습니다.
              </div>
            ) : (
              buckets.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 text-right text-xs tabular-nums text-zinc-600">{b.label}</div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-lg bg-zinc-100">
                    <div className="h-full rounded-lg bg-zinc-800/80" style={{ width: `${(b.count / maxBucketCount) * 100}%` }} />
                  </div>
                  <div className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{b.count}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {type === '길드전' && (
        <Card className="rounded-[28px] border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">같은 총력전 점수구간 · 길드전 점수 분포</CardTitle>
            <CardDescription>
              최신 총력전 시즌 점수 구간으로 묶은 뒤, 각 길드원의 선택 시즌 길드전 점수를 비교합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {crossDistribution.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
                총력전·길드전 점수가 모두 입력된 길드원이 없습니다.
              </div>
            ) : (
              crossDistribution.map((group) => (
                <div key={group.label} className="rounded-2xl border border-zinc-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-800">총력전 {group.label}</span>
                    <Badge variant="secondary" className="rounded-full">{group.members.length}명</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.members.map((m) => (
                      <span key={m.member} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs">
                        <span className="font-medium text-zinc-800">{m.member}</span>
                        <span className="tabular-nums text-zinc-500">길 {m.guild.toLocaleString()}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc -b`
Expected: 점수/통계 관련 에러 없음. (남은 에러는 App/calendar/WarningPanel 관련일 수 있음 — Task 11~12에서 해소.)

- [ ] **Step 3: Commit**

```bash
git add src/components/StatsBoard.tsx
git commit -m "feat: 통계 탭 차수 제거 + 타입별 점수구간 + 직전 시즌 변동"
```

---

## Task 11: 현황판 경고 — 기간·활성 필터

**Files:**
- Modify: `src/App.tsx:202-203` (필터 추가), `src/App.tsx:882` (WarningPanel props)
- Modify: `src/components/WarningPanel.tsx:33` (설명 문구)

- [ ] **Step 1: App에 기간·활성 필터 memo 추가**

`src/App.tsx`에서 `inactiveMembers` memo(203행) 바로 아래에 추가:
```tsx
  const activeMemberIds = useMemo<Set<number>>(
    () => new Set(activeMembers.map((m) => m.id)),
    [activeMembers],
  );
  const dashboardWarnings = useMemo<Warning[]>(
    () => warnings.filter((w) => activeMemberIds.has(w.memberId) && isWithin(w.date, rangeStart, rangeEnd)),
    [warnings, activeMemberIds, rangeStart, rangeEnd],
  );
```

- [ ] **Step 2: WarningPanel에 필터된 경고 전달**

`src/App.tsx`의 `<WarningPanel warnings={warnings} />`(882행)를 교체:
```tsx
                <WarningPanel warnings={dashboardWarnings} />
```

- [ ] **Step 3: WarningPanel 설명 문구 갱신**

`src/components/WarningPanel.tsx`의 `CardDescription`(33행)을 교체:
```tsx
        <CardDescription>선택한 기간 · 활성 길드원 기준 누적 경고와 내역입니다.</CardDescription>
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc -b`
Expected: 경고 관련 에러 없음. (calendar DayCell의 warnings prop은 Task 12에서 추가.)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/WarningPanel.tsx
git commit -m "feat: 현황판 경고를 선택 기간·활성 길드원 기준으로 필터"
```

---

## Task 12: 캘린더 경고 표기

**Files:**
- Modify: `src/components/calendar.tsx:19` (import), `:61-71` (props 타입), `:73-89` (구조 분해 + 계산), `:99-127` (마커 렌더)
- Modify: `src/App.tsx:835-846` (DayCell에 warnings 전달)

- [ ] **Step 1: calendar.tsx import에 Warning 타입 + 아이콘 추가**

`src/components/calendar.tsx` 상단 import 교체 — 2행의 lucide import와 19행의 types import를 각각 교체:
```tsx
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
```
```tsx
import type { ContentType, GuildWarPeriod, MissLog, RaidDeadline, Warning } from '@/lib/types';
```

- [ ] **Step 2: DayCellProps에 warnings 추가**

`DayCellProps` 타입(61~71행)에서 `raidDeadlines` 줄 아래에 추가:
```tsx
  raidDeadlines: RaidDeadline[];
  warnings: Warning[];
```

- [ ] **Step 3: DayCell 구조 분해 + 당일 경고 계산**

`export function DayCell({ ... })`의 구조 분해(73~83행)에서 `raidDeadlines,` 아래에 `warnings,` 추가, 그리고 본문 `const raidDay = ...`(89행) 아래에 한 줄 추가:
```tsx
  const raidDay = raidDeadlines.some((item) => item.date === dateStr);
  const dayWarnings = warnings.filter((w) => w.date === dateStr);
```

- [ ] **Step 4: 경고 마커 렌더**

`src/components/calendar.tsx`에서 날짜 숫자 블록(123~127행)을 교체 — 상단 우측에 경고 마커 추가:
```tsx
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
```

- [ ] **Step 5: App에서 DayCell에 warnings 전달**

`src/App.tsx`의 `<DayCell ... />`(835~846행)에서 `raidDeadlines={raidDeadlines}` 아래에 추가:
```tsx
                        raidDeadlines={raidDeadlines}
                        warnings={dashboardWarnings}
```

- [ ] **Step 6: 타입체크**

Run: `npx tsc -b`
Expected: 에러 없음 (전체 통과).

- [ ] **Step 7: Commit**

```bash
git add src/components/calendar.tsx src/App.tsx
git commit -m "feat: 현황판 캘린더에 활성 길드원 경고 표기"
```

---

## Task 13: 최종 검증 + 배포 안내

**Files:** 없음 (검증)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: score + analysis 테스트 전부 PASS.

- [ ] **Step 2: 전체 빌드**

Run: `npm run build`
Expected: `tsc -b` 타입체크 통과 + `vite build` 성공.

- [ ] **Step 3: 로컬 dev 수동 검증 (14개 항목)**

Run: `npm run dev` 후 브라우저에서 확인:
- 항목 1: 현황판 기간 이동 시 경고 현황이 해당 기간 경고만 표시
- 항목 2: 관리 탭에서 길드원 탈퇴 처리 → 현황판 경고/캘린더에서 사라짐, 점수/통계 탭에 안 보임
- 항목 3: 경고 있는 날짜 셀에 앰버 ⚠ 마커 + 건수
- 항목 4: 현황판에서 "길드전 시즌 선택" 후 다른 시즌으로 이동 → 경고 누적이 시즌별로 초기화
- 항목 5: 통계(총력전) 구간 `~4000 / 4000~5000 / 5000~5980 / 6000~`
- 항목 6: 통계(길드전) 구간 `0~500 … 2000~`
- 항목 7~9: 점수 탭 그래프 "전체 시즌추이"에서 종료된(종료일 지난) 시즌만 x축에 표시
- 항목 10: 점수 탭에 "차수 추가/삭제" 버튼 없음, 시즌 추가에 시작/종료일 입력
- 항목 11a: 그래프 "단일 시즌" → 점수 내림차순 막대
- 항목 11b: 그래프 "전체 시즌추이" → 전체 길드원 꺾은선, 드롭다운에서 특정 길드원만 표시
- 항목 12: 총력전/강림전 탭에서도 동일 동작
- 항목 13: 통계 탭에 차수 선택 없음, 시즌 선택만
- 항목 14: 통계(강림전) 구간 `~1000만 … 3500만~4000만`

- [ ] **Step 4: 원격 배포 (사용자 확인 후)**

> **원격 D1 점수 데이터가 삭제된다.** 사용자에게 재확인 후 실행:
```bash
npm run db:migrate:remote
npm run deploy
```

- [ ] **Step 5: 최종 Commit (필요 시)**

빌드 산출물/문서 변경이 있으면:
```bash
git add -A
git commit -m "chore: 점수 시즌 전환·경고 개선 마무리"
```

---

## Self-Review 결과

- **Spec 커버리지**: 14개 항목 ↔ 항목 1·2(Task 11), 3(Task 12), 4(Task 11 + 안내), 5·6·14(Task 6), 7·8·9(Task 7·9), 10(Task 8), 11·12(Task 9), 13(Task 10). 데이터 모델/초기화 = Task 2~5. 모두 매핑됨.
- **Placeholder**: 없음.
- **타입 일관성**: `ScoreSeason{start,end}`, `ScoreCell{memberId,score}`, `SeasonScore{seasonId,memberId,score}`가 types→routes→lib→components 전반 일치. `bucketize(values, type)`/`findBucket(value, type)`/`buildSeasonRanking/buildTrendData/buildSingleSeasonBars` 시그니처가 호출부와 일치.
