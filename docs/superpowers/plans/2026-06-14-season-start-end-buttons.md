# 시즌 시작/종료 버튼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시즌에 시작/종료 버튼과 날짜 수정칸을 추가하고, 종료 전(진행 중) 상태를 허용한다. "전체 시즌추이"는 종료된 시즌(=종료일 있음 또는 최신 시즌 아님)만 표시한다.

**Architecture:** `score_seasons`의 start/end를 NULL 허용으로 바꾸고(데이터 보존 마이그레이션), 정렬을 생성순(id)으로, 종료 판정을 "종료일 있음 OR 최신 시즌 아님"으로 변경한다. 순수 로직(정렬/종료판정)은 Vitest로 TDD하고, API/UI는 `tsc` + 빌드 + 수동 검증한다.

**Tech Stack:** React 19, Hono(Cloudflare Workers), Drizzle ORM + D1(SQLite), Recharts, Tailwind v4, Vitest.

**근거 명세:** `docs/superpowers/specs/2026-06-14-season-start-end-buttons-design.md`

---

## File Structure

- `src/worker/db/schema.ts`, `drizzle/0003_nullable_season_dates.sql` — start/end NULL 허용(데이터 보존)
- `src/lib/types.ts` — `ScoreSeason.start/end: string | null`
- `src/worker/routes/score-seasons.ts` — POST 날짜 선택, PATCH 날짜 설정/비우기
- `src/lib/analysis.ts`, `src/lib/analysis.test.ts` — sortSeasons(생성순) + endedSeasons(새 규칙), TDD
- `src/components/ScoreChart.tsx` — `today` prop 제거(endedSeasons 시그니처 변경 반영)
- `src/components/ScoreBoard.tsx` — 시즌 추가 날짜 선택화 + 선택 시즌 상태/날짜/시작·종료 버튼

---

## Task 1: 스키마 NULL 허용 + 데이터 보존 마이그레이션

**Files:**
- Modify: `src/worker/db/schema.ts:135-136`
- Create: `drizzle/0003_nullable_season_dates.sql`

- [ ] **Step 1: 스키마에서 start/end NOT NULL 제거**

`src/worker/db/schema.ts`의 135~136행을 교체:
```ts
    startDate: text('start_date'), // YYYY-MM-DD (시작 전이면 null)
    endDate: text('end_date'), // YYYY-MM-DD (종료 전이면 null)
```

- [ ] **Step 2: 데이터 보존형 마이그레이션 작성**

`drizzle/0003_nullable_season_dates.sql` 생성:
```sql
CREATE TABLE `__new_score_seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_score_seasons` (`id`,`type`,`name`,`start_date`,`end_date`,`created_at`) SELECT `id`,`type`,`name`,`start_date`,`end_date`,`created_at` FROM `score_seasons`;--> statement-breakpoint
CREATE TABLE `__backup_scores` AS SELECT * FROM `scores`;--> statement-breakpoint
DELETE FROM `scores`;--> statement-breakpoint
DROP TABLE `score_seasons`;--> statement-breakpoint
ALTER TABLE `__new_score_seasons` RENAME TO `score_seasons`;--> statement-breakpoint
INSERT INTO `scores` (`id`,`season_id`,`member_id`,`score`,`created_at`) SELECT `id`,`season_id`,`member_id`,`score`,`created_at` FROM `__backup_scores`;--> statement-breakpoint
DROP TABLE `__backup_scores`;--> statement-breakpoint
CREATE INDEX `score_seasons_type_idx` ON `score_seasons` (`type`);
```

> **중요(데이터 안전)**: `PRAGMA foreign_keys=OFF`는 D1가 마이그레이션을 트랜잭션으로 실행할 때 무효(no-op)다. 따라서 부모 `score_seasons`를 그냥 DROP하면 암시적 행 삭제로 `scores`의 `ON DELETE CASCADE`가 발동해 점수가 전부 삭제된다. 이를 피하려고 `scores`를 임시 테이블에 백업→비우기→부모 교체→복원하는 순서로 작성했다.

- [ ] **Step 3: 로컬 적용 + 데이터 보존 검증**

Run: `npm run db:migrate:local`
Expected: `0003_nullable_season_dates.sql` 적용 성공.

이어서 데이터가 보존됐는지 확인:
Run: `npx wrangler d1 execute guild-db --local --json --command="SELECT (SELECT COUNT(*) FROM score_seasons) seasons,(SELECT COUNT(*) FROM scores) scores;"`
Expected: `seasons` = 4, `scores` = 103 (마이그레이션 전과 동일).

- [ ] **Step 4: Commit**

```bash
git add src/worker/db/schema.ts drizzle/0003_nullable_season_dates.sql
git commit -m "feat: 시즌 시작/종료일 NULL 허용 (데이터 보존 마이그레이션)"
```

> 원격 적용은 main push 시 CI(`wrangler d1 migrations apply --remote`)가 자동 수행하며, 이 마이그레이션은 데이터를 보존한다.

---

## Task 2: 공유 타입 NULL 허용

**Files:**
- Modify: `src/lib/types.ts:55-56`

- [ ] **Step 1: ScoreSeason start/end 를 nullable 로**

`src/lib/types.ts`의 55~56행을 교체:
```ts
  start: string | null; // YYYY-MM-DD (시작 전이면 null)
  end: string | null; // YYYY-MM-DD (종료 전이면 null)
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: ScoreSeason start/end 를 nullable 로 변경"
```

> 이 시점에서 `tsc`는 라우트/컴포넌트의 옛 가정 때문에 실패할 수 있다. Task 3~5에서 해소.

---

## Task 3: score-seasons 라우트 — 날짜 선택/비우기 지원

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
  startDate: string | null;
  endDate: string | null;
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
  const rows = await db.select().from(scoreSeasons).where(where).orderBy(asc(scoreSeasons.id));
  return c.json(rows.map(serialize));
});

app.post('/', async (c) => {
  const body = await c.req.json<{ type?: string; name?: string; start?: string | null; end?: string | null }>();
  const name = body.name?.trim();
  if (!body.type || !VALID_TYPES.includes(body.type as ScoreType)) {
    return c.json({ error: 'valid type is required' }, 400);
  }
  if (!name) return c.json({ error: 'name is required' }, 400);

  const db = getDb(c.env.DB);
  const [created] = await db
    .insert(scoreSeasons)
    .values({ type: body.type, name, startDate: body.start ?? null, endDate: body.end ?? null })
    .returning();
  return c.json(serialize(created), 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<{ name?: string; start?: string | null; end?: string | null }>();
  const data: { name?: string; startDate?: string | null; endDate?: string | null } = {};
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if ('start' in body) data.startDate = body.start ?? null;
  if ('end' in body) data.endDate = body.end ?? null;
  if (Object.keys(data).length === 0) {
    return c.json({ error: 'No valid fields provided' }, 400);
  }

  const db = getDb(c.env.DB);
  const [updated] = await db.update(scoreSeasons).set(data).where(eq(scoreSeasons.id, id)).returning();
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
git commit -m "feat: score-seasons 날짜 선택 생성 + PATCH 날짜 설정/비우기"
```

---

## Task 4: 정렬·종료판정 로직 변경 (TDD)

**Files:**
- Modify: `src/lib/analysis.ts:11-27`
- Modify: `src/lib/analysis.test.ts` (전체 교체)

- [ ] **Step 1: 테스트를 새 기대값으로 교체 (실패 유도)**

`src/lib/analysis.test.ts` 전체를 교체:
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

describe('sortSeasons', () => {
  it('생성순(id 오름차순)으로 정렬', () => {
    const shuffled = [seasons[2], seasons[0], seasons[1]];
    expect(sortSeasons(shuffled).map((s) => s.id)).toEqual([1, 2, 3]);
  });
});

describe('prevSeason', () => {
  it('직전 시즌은 생성순 바로 앞', () => {
    expect(prevSeason(seasons, 2)?.id).toBe(1);
    expect(prevSeason(seasons, 1)).toBeNull();
  });
});

describe('endedSeasons', () => {
  it('종료일이 없어도 최신 시즌이 아니면 종료로 본다', () => {
    const s: ScoreSeason[] = [
      { id: 1, type: '총력전', name: 'S1', start: '2026-01-01', end: '2026-01-31' },
      { id: 2, type: '총력전', name: 'S2', start: '2026-02-01', end: null },
      { id: 3, type: '총력전', name: 'S3', start: '2026-03-01', end: null },
    ];
    // 1: 종료일 있음, 2: 종료일 없지만 최신 아님 → 둘 다 종료. 3: 최신 + 종료일 없음 → 제외
    expect(endedSeasons(s).map((x) => x.id)).toEqual([1, 2]);
  });
  it('최신 시즌도 종료일이 있으면 포함', () => {
    const s: ScoreSeason[] = [
      { id: 1, type: '총력전', name: 'S1', start: null, end: null },
      { id: 2, type: '총력전', name: 'S2', start: '2026-02-01', end: '2026-02-28' },
    ];
    expect(endedSeasons(s).map((x) => x.id)).toEqual([1, 2]);
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
Expected: FAIL — `sortSeasons`(생성순) 미반영, `endedSeasons`가 `today` 인자를 받는 옛 시그니처라 호출 불일치 및 기대값 불일치.

- [ ] **Step 3: sortSeasons / endedSeasons 구현 교체**

`src/lib/analysis.ts`의 11~27행(주석 포함)을 교체:
```ts
// 시즌 정렬: 생성순(id 오름차순)
export function sortSeasons(seasons: ScoreSeason[]): ScoreSeason[] {
  return [...seasons].sort((a, b) => a.id - b.id);
}

// 직전 시즌 (생성순 바로 앞). 첫 시즌이면 null.
export function prevSeason(seasons: ScoreSeason[], currentId: number): ScoreSeason | null {
  const sorted = sortSeasons(seasons);
  const idx = sorted.findIndex((s) => s.id === currentId);
  if (idx <= 0) return null;
  return sorted[idx - 1];
}

// 종료된 시즌(전체 시즌추이 포함 대상): 종료일이 있거나, 최신(마지막 생성) 시즌이 아니면 종료.
export function endedSeasons(seasons: ScoreSeason[]): ScoreSeason[] {
  const sorted = sortSeasons(seasons);
  if (sorted.length === 0) return [];
  const latestId = sorted[sorted.length - 1].id;
  return sorted.filter((s) => s.end != null || s.id !== latestId);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (score 6 + analysis 8 = 14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis.ts src/lib/analysis.test.ts
git commit -m "feat: 시즌 정렬 생성순 + 종료판정(종료일 또는 최신 아님)"
```

---

## Task 5: UI — 시즌 시작/종료 버튼 + 날짜 컨트롤

**Files:**
- Modify: `src/components/ScoreChart.tsx:30-36`, `:44`, `:56`
- Modify: `src/components/ScoreBoard.tsx` (여러 곳)

### 5a. ScoreChart — today prop 제거

- [ ] **Step 1: Props 에서 today 제거**

`src/components/ScoreChart.tsx`의 30~36행(`type Props = {...}`)을 교체:
```tsx
type Props = {
  members: Member[];
  seasons: ScoreSeason[];
  selectedSeasonId: number | null;
  allScores: SeasonScore[];
};
```

- [ ] **Step 2: 구조 분해에서 today 제거**

`src/components/ScoreChart.tsx`의 44행을 교체:
```tsx
export default function ScoreChart({ members, seasons, selectedSeasonId, allScores }: Props) {
```

- [ ] **Step 3: endedSeasons 호출에서 today 제거**

`src/components/ScoreChart.tsx`의 56행을 교체:
```tsx
  const ended = useMemo(() => endedSeasons(seasons), [seasons]);
```

### 5b. ScoreBoard — 추가폼 날짜 선택화 + 선택 시즌 컨트롤

- [ ] **Step 4: import 에 아이콘 + endedSeasons 추가**

`src/components/ScoreBoard.tsx`의 2행을 교체:
```tsx
import { Plus, Trash2, Table2, TrendingUp, Play, Flag } from 'lucide-react';
```
그리고 21행을 교체:
```tsx
import { toScoreMap, prevSeason, sortSeasons, endedSeasons } from '@/lib/analysis';
```

- [ ] **Step 5: 새 시즌 날짜 기본값을 빈 값으로**

`src/components/ScoreBoard.tsx`의 38~39행을 교체:
```tsx
  const [newSeasonStart, setNewSeasonStart] = useState('');
  const [newSeasonEnd, setNewSeasonEnd] = useState('');
```

- [ ] **Step 6: addSeason 을 날짜 선택 입력으로**

`src/components/ScoreBoard.tsx`의 `addSeason`(130~146행)을 교체:
```tsx
  const addSeason = async () => {
    const name = newSeasonName.trim();
    if (!name) return;
    try {
      const created = await api.post<ScoreSeason>('/score-seasons', {
        type,
        name,
        start: newSeasonStart || null,
        end: newSeasonEnd || null,
      });
      setSeasons((prev) => [...prev, created]);
      setSelectedSeasonId(created.id);
      setNewSeasonName('');
      setNewSeasonStart('');
      setNewSeasonEnd('');
    } catch (error) {
      console.error(error);
    }
  };
```

- [ ] **Step 7: updateSeason + 상태 계산 추가**

`src/components/ScoreBoard.tsx`의 `deleteSeason` 함수 닫는 중괄호 뒤(164행과 165행의 빈 줄 사이)에 추가:
```tsx
  const updateSeason = async (patch: { start?: string | null; end?: string | null }) => {
    if (!selectedSeason) return;
    try {
      const updated = await api.patch<ScoreSeason>(`/score-seasons/${selectedSeason.id}`, patch);
      setSeasons((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (error) {
      console.error(error);
    }
  };

  const selectedEnded = useMemo(
    () => (selectedSeason ? endedSeasons(seasons).some((s) => s.id === selectedSeason.id) : false),
    [seasons, selectedSeason],
  );
  const selectedStatus = !selectedSeason
    ? ''
    : selectedEnded
      ? '종료'
      : selectedSeason.start != null
        ? '진행 중'
        : '대기';
```

- [ ] **Step 8: 선택 시즌 컨트롤 UI 추가**

`src/components/ScoreBoard.tsx`의 시즌 추가 폼 블록을 닫는 `</div>`(222행) 바로 다음, `</CardHeader>`(223행) 바로 앞에 추가:
```tsx
        {selectedSeason && (
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3">
            <div className="flex items-center gap-2 pb-1">
              <span className="text-sm font-medium text-zinc-700">{selectedSeason.name}</span>
              <span
                className={[
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  selectedStatus === '진행 중'
                    ? 'bg-emerald-100 text-emerald-700'
                    : selectedStatus === '대기'
                      ? 'bg-zinc-200 text-zinc-600'
                      : 'bg-sky-100 text-sky-700',
                ].join(' ')}
              >
                {selectedStatus}
              </span>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">시작일</label>
              <Input
                type="date"
                value={selectedSeason.start ?? ''}
                onChange={(e) => void updateSeason({ start: e.target.value || null })}
                className="h-9 w-[150px] rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">종료일</label>
              <Input
                type="date"
                value={selectedSeason.end ?? ''}
                onChange={(e) => void updateSeason({ end: e.target.value || null })}
                className="h-9 w-[150px] rounded-2xl"
              />
            </div>
            <Button variant="outline" className="rounded-2xl" onClick={() => void updateSeason({ start: today })}>
              <Play className="mr-1 h-4 w-4" />시작
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => void updateSeason({ end: today })}>
              <Flag className="mr-1 h-4 w-4" />종료
            </Button>
          </div>
        )}
```

- [ ] **Step 9: ScoreChart 호출에서 today prop 제거**

`src/components/ScoreBoard.tsx`의 `<ScoreChart .../>`(258~264행)을 교체:
```tsx
              <ScoreChart
                members={members}
                seasons={seasons}
                selectedSeasonId={selectedSeasonId}
                allScores={allScores}
              />
```

- [ ] **Step 10: 타입체크 + 테스트 + 빌드**

Run: `npx tsc -b`
Expected: exit 0 (에러 없음).

Run: `npm test`
Expected: 14 tests PASS.

Run: `npm run build`
Expected: `tsc -b` + `vite build` 성공.

- [ ] **Step 11: Commit**

```bash
git add src/components/ScoreChart.tsx src/components/ScoreBoard.tsx
git commit -m "feat: 시즌 시작/종료 버튼 + 날짜 수정칸 + 상태 배지"
```

---

## Task 6: 최종 검증 + 배포 안내

**Files:** 없음 (검증)

- [ ] **Step 1: 전체 테스트 + 빌드**

Run: `npm test` → 14 PASS
Run: `npm run build` → 성공

- [ ] **Step 2: 로컬 dev 수동 검증**

Run: `npm run dev` 후 점수 탭에서:
- 시즌 선택 시 상태 배지(대기/진행 중/종료) 표시
- `[시작]` 클릭 → 시작일이 오늘로 채워지고 상태 `진행 중`
- `[종료]` 클릭 → 종료일이 오늘로 채워지고 상태 `종료`
- 종료일 칸 비우기 → 최신 시즌이면 `진행 중`으로 복귀
- 시즌 추가 시 날짜 비워도 생성됨
- 그래프 "전체 시즌추이"에 종료된 시즌(종료일 있음 또는 최신 아님)만 표시, 최신 미종료 시즌은 제외

- [ ] **Step 3: 배포 (사용자 확인 후)**

main 병합/푸시 시 CI가 0003 마이그레이션을 원격에 적용(데이터 보존) 후 배포한다. 사용자 확인 후 진행.

---

## Self-Review 결과

- **Spec 커버리지**: 데이터 모델 NULL 허용+보존 마이그레이션(Task 1), 타입(Task 2), API POST 선택·PATCH 설정/비우기(Task 3), 생성순 정렬+종료판정(Task 4), 시작/종료 버튼·날짜칸·상태 배지·추가폼 선택입력·그래프 today 제거(Task 5). 모두 매핑됨.
- **Placeholder**: 없음.
- **타입 일관성**: `ScoreSeason.start/end: string | null`이 schema(nullable)→route(serialize/`?? null`)→types→analysis(`s.end != null`)→ScoreBoard(`?? ''`, `|| null`)에서 일관. `endedSeasons(seasons)` 단일 인자 시그니처가 analysis 정의·ScoreChart·ScoreBoard 호출과 일치. `updateSeason({start?,end?})` PATCH 바디가 라우트의 `'start' in body`/`'end' in body` 처리와 일치.
