# 현황판 달력 칸 좌클릭 컨텍스트 메뉴 + 강림전 기간화

작성일: 2026-06-14

## 1. 배경 / 목적

현황판(대시보드) 달력에서 날짜 칸을 좌클릭하면 곧바로 입력 화면으로 이동한다.
이를 바꿔, 칸 좌클릭 시 우클릭 메뉴 같은 선택 리스트를 띄워 다음을 한 번에 처리한다.

- 길드전 시작 / 길드전 종료
- 강림전 시작 / 강림전 종료
- 총력전 시작 / 총력전 종료
- 입력 화면 이동 (기존 동작 보존)

즉, 지금까지 **관리 탭에서만 하던 기간 설정을 현황판 달력에서 직접** 할 수 있게 한다.

부수적으로, 강림전이 현재 "마감일(단일 날짜)" 모델이라 시작/종료 개념이 없으므로
**강림전을 기간(start/end) 모델로 변경**한다.

## 2. 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 메뉴 컴포넌트 | `radix-ui`의 `DropdownMenu` (이미 설치됨, 새 의존성 없음). 칸 전체가 트리거 |
| 트리거 | **좌클릭**으로 메뉴 열기 |
| 메뉴 구성 | 길드전(시작/종료) · 강림전(시작/종료) · 총력전(시작/종료) 그룹 + 구분선 + "입력 화면 이동" |
| 기간 생성 방식 | **2단계 페어링** — 한 칸에서 "X 시작", 다른 칸에서 "X 종료" → 기간 POST |
| 강림전 모델 | **마감일 → 기간(start/end)** 으로 마이그레이션 |
| 강림전 시각 표현 | **A안: 회색 음영 유지** (테두리와 자연스럽게 합성) |
| `autoAddNextRaidDeadline`("다음 마감일 자동") | **제거** (기간 모델에선 의미 모호. 길드전·총력전 자동추가는 유지) |
| 기간 수정/삭제 | 범위 밖 — 기존처럼 관리 탭에서. 대시보드 메뉴는 **생성만** |
| 기간 겹침 검증 | 없음 (기존 동작도 허용) |

## 3. 상세 설계

### 3.1 메뉴 UI 컴포넌트

- 신규 파일 `src/components/ui/dropdown-menu.tsx` — 기존 `src/components/ui/select.tsx`와 동일한
  shadcn 스타일 래퍼. `import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"`.
- 필요한 export: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`,
  `DropdownMenuLabel`, `DropdownMenuSeparator`.

### 3.2 DayCell 변경 (`src/components/calendar.tsx`)

- 칸 루트(`div role="button"`)를 `DropdownMenuTrigger`로 감싼다.
- `inSelectedRange === false`면 기존처럼 비활성(메뉴 안 열림).
- 칸 안의 `DayLogBadge` 클릭은 기존대로 `stopPropagation` → 로그 수정으로 동작(메뉴 안 열림).
- 메뉴 항목 onSelect → 부모(App)에서 내려준 콜백 호출:
  - `onPeriodMark(type, 'start'|'end', dateStr)`
  - `onCreateDate(dateStr)` (입력 화면 이동, 기존 콜백 재사용)
- DayCell에 새 props 추가: `onPeriodMark`, `pendingMark`(시각 강조용: 현재 pending에 잡힌 날짜/타입).
- pending으로 잡힌 칸은 ring 강조(`ring-2 ring-zinc-400` 등).

### 3.3 2단계 페어링 상태머신 (`src/App.tsx`)

상태:
```ts
type PeriodKind = 'guild' | 'power' | 'raid';
const [pendingMark, setPendingMark] =
  useState<{ kind: PeriodKind; start?: string; end?: string } | null>(null);
```

동작 `onPeriodMark(kind, edge, dateStr)`:
1. 현재 pending의 kind와 다르면 pending을 새 kind로 리셋.
2. `edge === 'start'`면 `start = dateStr`, `'end'`면 `end = dateStr` 세팅(같은 kind 유지).
3. `start`와 `end`가 둘 다 채워지면:
   - `start > end`면 swap.
   - 해당 kind의 POST 호출(아래 매핑)로 기간 생성 + 로컬 state 갱신(기존 save 로직 재사용/분리).
   - `pendingMark`를 `null`로 초기화.
4. 한쪽만 채워진 상태면 대기. 상단에 안내 배너 표시:
   - 예: `"길드전 시작 6/1 선택됨 — 종료일 칸을 선택하세요"` + **취소** 버튼(`setPendingMark(null)`).

kind → API/state 매핑:
| kind | endpoint | state setter |
|---|---|---|
| guild | `POST /api/guild-war-periods` | `setGuildWarPeriods` |
| power | `POST /api/power-war-periods` | `setPowerWarPeriods` |
| raid | `POST /api/raid-deadlines` (start/end 바디) | `setRaidDeadlines` |

> 생성 헬퍼를 `createPeriod(kind, start, end)` 하나로 묶어 중복 제거.

### 3.4 강림전 기간화 마이그레이션

**스키마** (`src/worker/db/schema.ts`)
- `raidDeadlines` 테이블: `date: text unique` 제거 → `startDate: text('start_date')`, `endDate: text('end_date')` 추가.
- 인덱스: `raid_deadlines_date_idx` → `raid_deadlines_start_idx`(start_date), `_end_idx`(end_date).
- 테이블명은 `raid_deadlines` 유지(리스크 최소).

**마이그레이션 SQL** (`drizzle/0004_raid_periods.sql`, 0003과 동일한 데이터 보존 패턴)
- `__new_raid_deadlines`(start_date/end_date) 생성
- `INSERT ... SELECT id, date AS start_date, date AS end_date, created_at FROM raid_deadlines`
  (기존 마감일 → 1일 기간으로 보존)
- 기존 테이블 DROP → RENAME → 인덱스 재생성
- `drizzle/meta/_journal.json` 갱신 (drizzle-kit generate로 생성하되, 데이터 복제 INSERT는 수동 보강)

**API** (`src/worker/routes/raid-deadlines.ts`)
- `serialize`: `{ id, start, end }` 반환
- `POST`/`PATCH`: 바디 `{ start, end }` 검증·저장 (guild-war-periods.ts와 동형)
- 경로명 `/api/raid-deadlines` 유지

**타입** (`src/lib/types.ts`)
- `RaidDeadline { id, date }` → **`RaidPeriod { id, start, end }`** 로 이름·형태 모두 변경(길드전과 동형).
  사용처(`src/App.tsx`, `src/components/calendar.tsx`의 `PeriodCalendar` props union 등) 일괄 수정.

**프론트** (`src/App.tsx`)
- state: `raidDraftDate` → `raidDraftStart` / `raidDraftEnd`
- `saveRaidDeadline`: start/end 기반으로 (guild/power save와 동형)
- `selectRaidDeadline`: `item.start`/`item.end` 세팅
- `autoAddNextRaidDeadline` 및 "다음 마감일 자동" 버튼 **제거** (`getNextRaidSunday` 사용처도 정리)
- 관리 탭 강림 `PeriodCalendar`: `type='date'` → `type='period'`, 라벨 "마감일" → "기간"
- 현황판 범례: "강림 마감일 / 회색 음영" → "강림전 시즌 / 회색 음영"

**DayCell 표시** (`src/components/calendar.tsx`)
- `raidDay = raidDeadlines.some(p => isWithin(dateStr, p.start, p.end))` (기존 `item.date === dateStr` 대체)
- 회색 음영(`raidDay ? 'bg-zinc-100/90'`) **유지** (A안)

**영향 없음 확인됨**
- `warnings` 로직: 강림 마감일 미참조
- `memberStats`의 강림 카운트: `강림원정대` 미참 로그 기반 (마감일 무관)

## 4. 영향 파일 목록

신규:
- `src/components/ui/dropdown-menu.tsx`
- `drizzle/0004_raid_periods.sql` (+ meta 갱신)

수정:
- `src/worker/db/schema.ts`
- `src/worker/routes/raid-deadlines.ts`
- `src/lib/types.ts`
- `src/App.tsx`
- `src/components/calendar.tsx`

## 5. 범위 밖 (이번에 안 함)

- 대시보드에서 기간 수정/삭제 (관리 탭 유지)
- 기간 겹침 검증
- 직전 논의했던 "현황판 기간 선택 드롭다운 2개" (별도 작업)

## 6. 테스트 / 검증

- `npm run build` (타입체크) 통과
- `npm run db:migrate:local` 적용 후 기존 강림 마감일 데이터가 1일 기간으로 보존되는지 확인
- 수동: 칸 좌클릭 → 메뉴 → 길드전/총력전/강림전 각각 시작·종료 페어링으로 기간 생성, 음영/테두리 렌더 확인, "입력 화면 이동" 동작 확인, 페어링 취소 동작 확인
