# 길드전 승패/승률 트래킹 (기능 B)

작성일: 2026-06-15

## 배경 / 목적

점수 탭 → 길드전 → 점수 비교표에 길드원별 **승패 입력·누적 전적·승률**을 함께 본다.
매 경기 5판(O/X)을 입력하면 전적에 누적되고 입력일이 기록된다. 오입력은 누적 전적을 수기로 보정한다.

## 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 저장 모델 | **누적 카운터(권위값) + 입력 로그(append-only)** 두 테이블 |
| 누적 단위 | **길드전 score_season별** (선택 시즌 기준, 점수와 동일) |
| 입력 단위 | 한 경기 5판, 각 칸 O(승)/X(패) 토글 → "기록" 시 누적 + 로그 1행 |
| 전적 수정 | 누적 카운터(승/패)를 수기로 덮어쓰기(로그는 불변) |
| 입력일 | 표엔 **최근 입력일**만, 전체 이력은 **전적수정 모달**에서 노출 |
| 승률 | 승/(승+패)×100, 소수 1자리. 0경기면 "-" |
| 표시 위치 | 길드전 점수 비교표(표 보기)에 인라인 컬럼 추가. **길드전 탭에서만** |
| 레이아웃 | A안(인라인): 닉네임·점수·변동 + 5판입력·전적·승률·최근입력일·액션. 넓으면 가로 스크롤 |

## 데이터 모델

### 신규 테이블 (`src/worker/db/schema.ts`)

```ts
// 길드전 승패 누적 카운터 (시즌·길드원당 1행)
export const guildWarRecords = sqliteTable(
  'guild_war_records',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seasonId: integer('season_id').notNull().references(() => scoreSeasons.id, { onDelete: 'cascade' }),
    memberId: integer('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
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
    seasonId: integer('season_id').notNull().references(() => scoreSeasons.id, { onDelete: 'cascade' }),
    memberId: integer('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD (입력일)
    wins: integer('wins').notNull(),   // 0~5
    losses: integer('losses').notNull(), // 0~5
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index('guild_war_match_inputs_member_idx').on(t.seasonId, t.memberId)],
);
```

마이그레이션 `drizzle/0005_guild_war_winloss.sql` (CREATE TABLE 2개 + 인덱스, 데이터 변환 없음 → 단순 추가).

## API (`src/worker/routes/guild-war-records.ts`, index.ts에 `/guild-war-records` 등록)

- **GET `/api/guild-war-records?seasonId=`** → `[{ memberId, wins, losses, lastInputDate }]`
  - records 조회 + match_inputs에서 `max(date)` 시즌·멤버별 그룹으로 구해 병합(lastInputDate 없으면 null)
- **POST `/api/guild-war-records/match`** (경기 기록) → body `{ seasonId, memberId, date, wins, losses }`
  - records upsert: 기존 wins/losses에 **누적 증가**(onConflictDoUpdate로 `wins = wins + ?`), 없으면 생성
  - match_inputs에 1행 insert
  - 검증: wins,losses ≥ 0 && wins+losses ≥ 1 && wins+losses ≤ 5
- **PUT `/api/guild-war-records`** (전적 수기 수정) → body `{ seasonId, memberId, wins, losses }`
  - records upsert **덮어쓰기**(set wins/losses = 값). wins,losses ≥ 0
- **GET `/api/guild-war-records/inputs?seasonId=&memberId=`** → `[{ id, date, wins, losses }]` 날짜 내림차순 (전적수정 모달 이력용)

> drizzle onConflictDoUpdate에서 누적 증가는 `sql\`${guildWarRecords.wins} + ${n}\`` 사용.

## 타입 (`src/lib/types.ts`)

```ts
export type GuildWarRecord = { memberId: number; wins: number; losses: number; lastInputDate: string | null };
export type GuildWarMatchInput = { id: number; date: string; wins: number; losses: number };
```

## 순수 로직 (`src/lib/winrate.ts` + 테스트)

```ts
export function winRate(wins: number, losses: number): number | null; // 0경기 null, 아니면 소수1자리 %
export function winRateText(wins: number, losses: number): string;     // null이면 '-', 아니면 '66.7%'
```

## 프론트엔드 (`src/components/ScoreBoard.tsx`, `type === '길드전'`일 때만)

- 상태: `records: Map<memberId, GuildWarRecord>`, `pendingOX: Map<memberId, ('o'|'x'|null)[5]>`, 모달용 `editTarget`.
- 로드: 시즌 로드시 `GET /guild-war-records?seasonId=` 병행. selectedSeasonId 바뀌면 갱신.
- 표(표 보기)에서 길드전이면 컬럼 추가: **5판 입력**(O/X 5칸 토글) · **전적**(`N승 M패`) · **승률** · **최근 입력일** · **액션([기록][전적수정])**.
  - 길드전 grid 템플릿을 확장(가로 스크롤 컨테이너). 총력전/강림전은 기존 3열 유지.
- **5판 입력**: 각 칸 클릭 → null→O→X→null 순환. **기록** 클릭 → `POST /match`(wins=O수, losses=X수, date=오늘), 성공 시 records 누적 갱신 + O/X 초기화. 한 칸도 없으면 비활성.
- **전적수정 모달**(신규 `ui/dialog.tsx`): 승/패 number 입력(기본=현재값) + 저장(`PUT`) + 그 아래 입력 이력 목록(`GET /inputs` lazy 로드, 날짜·승·패).
- **승률**: `winRateText(wins, losses)`.
- **최근 입력일**: `record.lastInputDate ?? '-'`.

### 신규 UI 컴포넌트 `src/components/ui/dialog.tsx`
- `radix-ui`의 `Dialog`로 shadcn 스타일 래퍼(기존 `dropdown-menu.tsx` 패턴). export: Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogClose. 새 의존성 없음.

## 영향 / 신규 파일

신규: `drizzle/0005_guild_war_winloss.sql`, `src/worker/routes/guild-war-records.ts`, `src/lib/winrate.ts`(+test), `src/components/ui/dialog.tsx`
수정: `src/worker/db/schema.ts`, `src/worker/index.ts`, `src/lib/types.ts`, `src/components/ScoreBoard.tsx`

## 범위 밖

- 총력전/강림전 승패(길드전 전용)
- 그래프(차트) 보기엔 승패 미표시
- 입력 로그 개별 행 삭제/수정(이력은 표시 전용; 정정은 카운터 수기 수정으로)

## 테스트 / 검증

- `npm test`: `winRate`/`winRateText` 단위 테스트(0경기 null/'-', 반올림, 정상)
- `npm run build` 통과
- `npm run db:migrate:local` 후 테이블 생성 확인
- 수동: 길드전 탭에서 5판 O/X 기록 → 전적·승률·입력일 갱신, 전적수정 모달에서 수기 보정 + 이력 표시, 시즌 전환 시 분리 집계, 총력전/강림전 탭엔 승패 컬럼 없음
