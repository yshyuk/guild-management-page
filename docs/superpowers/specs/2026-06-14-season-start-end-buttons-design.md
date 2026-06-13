# 시즌 시작/종료 버튼 설계서

작성일: 2026-06-14
대상 프로젝트: guild-management-page (세나 길드 관리 페이지)

## 개요

총력전/길드전/강림전 시즌에 **시작/종료 버튼**을 추가한다. `시작`을 누르면 그 날짜가 시작일로, `종료`를 누르면 그 날짜가 종료일로 등록된다. 종료 전에는 종료일이 비어 있는 "진행 중" 상태를 허용한다.

확정된 결정(사용자 합의):
1. 컨트롤 구성: **표준** — `[시작]`/`[종료]` 버튼 + 시작일/종료일 날짜 입력칸(직접 수정·비우기 가능).
2. 종료(추이 그래프 포함) 판정: **종료일이 있거나, 최신 시즌이 아니면 종료**. 진행 중일 수 있는 건 가장 최신 시즌 하나뿐.
3. 시즌 정렬: **생성순(id 오름차순)**. "최신 시즌" = id가 가장 큰(마지막 생성) 시즌.
4. 시즌 추가 폼의 시작/종료일: **선택 입력**(빈 값 허용). 이름만 필수.

## 데이터 모델

### score_seasons (변경)
- `start_date`, `end_date` → **NULL 허용**으로 변경 (기존 NOT NULL).
- 의미: 시작 전 시즌은 둘 다 NULL. `시작` 후 start만, `종료` 후 end도 채워짐.

### 마이그레이션 (drizzle/0003)
- **데이터 보존**(wipe 아님). SQLite는 컬럼 nullability를 ALTER로 못 바꾸므로 테이블 재생성 패턴 사용:
  1. `PRAGMA foreign_keys=OFF;`
  2. `CREATE TABLE __new_score_seasons (...)` — start_date/end_date를 nullable로 정의, 그 외 동일.
  3. `INSERT INTO __new_score_seasons SELECT id, type, name, start_date, end_date, created_at FROM score_seasons;` (id 보존)
  4. `DROP TABLE score_seasons; ALTER TABLE __new_score_seasons RENAME TO score_seasons;`
  5. `CREATE INDEX score_seasons_type_idx ...;`
  6. `PRAGMA foreign_keys=ON;`
- id가 보존되므로 `scores.season_id` FK 무결성 유지. 로컬·원격 모두 `wrangler d1 migrations apply`로 적용(데이터 유지).

### 타입 (lib/types.ts)
- `ScoreSeason.start: string | null`, `ScoreSeason.end: string | null`.

## 정렬 + 종료 판정 (lib/analysis.ts)

- `sortSeasons(seasons)`: **id 오름차순** 정렬(생성순). (기존 종료일 기준 정렬 대체)
- `endedSeasons(seasons)`: 종료된 시즌 목록(전체 시즌추이 그래프용). `today` 인자 제거.
  - 규칙: 정렬 후, `latestId = 마지막(최대 id)`. 시즌 s가 종료됨 = `s.end != null || s.id !== latestId`.
  - 즉 비-최신 시즌은 종료일이 없어도 종료로 간주. 최신 시즌은 종료일이 있어야 종료.
- `prevSeason(seasons, currentId)`: 정렬(생성순)상 바로 앞 시즌 — 직전 시즌 변동 계산용(기존 유지).

## ScoreBoard UI (점수 탭, 3타입 공통)

### 선택 시즌 컨트롤 영역 (신규)
- **상태 배지**:
  - `대기`: 시작일·종료일 모두 없음.
  - `진행 중`: 시작일 있고 종료일 없음 + 최신 시즌.
  - `종료`: 종료일이 있거나, 최신 시즌이 아님.
- **시작일/종료일 날짜 입력칸**: 직접 수정·비우기 가능. 변경 시 PATCH 저장.
- **`[시작]` 버튼**: 시작일 = 오늘(`formatDate(new Date())`)로 설정 → PATCH.
- **`[종료]` 버튼**: 종료일 = 오늘로 설정 → PATCH.
- 로컬 상태(seasons)도 PATCH 응답으로 동기화.

### 시즌 추가 폼 (변경)
- 이름 필수, 시작일/종료일 **선택 입력**(빈 값이면 `null`로 생성).

### 그래프 호출
- `ScoreChart`에 넘기던 `today` prop 제거.

## API (routes/score-seasons.ts)

- `POST`: `start`/`end`가 없으면 `null`로 저장. 이름·타입만 필수.
- `PATCH /:id`: 바디에 키가 존재하면(`null` 포함) 해당 필드 갱신 → 날짜 설정/비우기 모두 지원.
  - `name`은 기존처럼 비어있지 않을 때만 갱신.
  - `start`/`end`는 `'start' in body` / `'end' in body`로 판단하여 값(문자열 또는 null) 그대로 반영.
- `serialize` 응답의 `start`/`end`는 `null` 가능.

## ScoreChart (lib 시그니처 변경 반영)

- `endedSeasons(seasons)` 사용(인자에서 `today` 제거). props에서 `today` 제거.
- 단일 시즌 막대 / 전체 시즌추이 동작 자체는 동일.

## 테스트 (lib/analysis.test.ts)

- `sortSeasons`: id 오름차순 정렬 검증.
- `endedSeasons`: (a) 종료일 있는 시즌 포함, (b) 종료일 없는 비-최신 시즌 포함, (c) 종료일 없는 최신 시즌 제외 검증.
- `prevSeason`: 생성순 직전 시즌 검증(기존 케이스 갱신).
- 기존 score/analysis 테스트 전체 유지.

## 영향 파일

- DB/API: `src/worker/db/schema.ts`, `drizzle/0003_*.sql`, `src/worker/routes/score-seasons.ts`
- lib: `src/lib/types.ts`, `src/lib/analysis.ts`, `src/lib/analysis.test.ts`
- UI: `src/components/ScoreBoard.tsx`, `src/components/ScoreChart.tsx`

## 비목표 (Out of Scope)

- StatsBoard 동작 변경 없음(최신 총력전 시즌 = 생성순 마지막, 그대로 사용).
- 강림전은 동일 컴포넌트라 자동 적용.
- 시작/종료에 시간(시:분) 기록은 하지 않음 — 날짜(YYYY-MM-DD)만.

## 리스크

- 0003 마이그레이션이 데이터 보존형 테이블 재생성이라, 적용 전 로컬에서 행 수 검증 후 원격 적용 권장.
- `endedSeasons`의 "최신 시즌" 기준이 id이므로, 과거 시즌을 나중에 생성(백필)하면 그 시즌이 "최신"으로 잡힐 수 있음 — 백필은 가장 마지막에 하지 않도록 유의(혹은 종료일을 채워 종료 처리).
