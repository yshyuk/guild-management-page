# 점수 시즌 전환 · 경고 개선 설계서

작성일: 2026-06-13
대상 프로젝트: guild-management-page (세나 길드 관리 페이지)

## 개요

14개 수정사항을 하나의 구현 단위로 묶는다. 핵심은 **점수의 "차수(round)" 개념을 제거하고 "시즌(날짜 구간)" 단위로 전환**하는 데이터 모델 변경이며, 여기에 경고 표시 개선과 타입별 점수 구간 재정의가 더해진다.

확정된 분기 결정(사용자 합의):
1. **시즌 종료 판정**: 점수 시즌에 종료일을 두고, `오늘 > endDate`이면 종료된 시즌으로 자동 판정. 3개 타입 공통.
2. **경고 초기화**: 길드전 시즌 기준. 현황판 선택 기간 필터로 구현(경고 스키마 변경 없음).
3. **총력전 5980 경계**: 오타로 간주, `5000~6000`으로 처리.
4. **기존 점수 데이터**: 전체 초기화(scores / score_seasons 비우고 새 스키마로 재시작).

## 데이터 모델

### scoreSeasons (변경)
- 제거: `roundCount`
- 추가: `startDate` text(YYYY-MM-DD), `endDate` text(YYYY-MM-DD)
- 의미: 시즌 = 날짜 구간. `오늘 > endDate`이면 **종료된 시즌**(전체 시즌추이 그래프 포함 대상).
- `type`은 기존대로 `총력전 | 길드전 | 강림전` 3종 모두 일급으로 사용.

### scores (변경)
- 제거: `round`
- 유니크 키: `(seasonId, memberId)` — **길드원·시즌당 점수 1개**
- 인덱스: `scores_season_idx` 유지

### 마이그레이션
- 신규 Drizzle 마이그레이션 SQL 생성.
- 기존 `scores`, `score_seasons` 데이터 **전체 삭제** 후 새 스키마로 재생성.
- 로컬: `npm run db:migrate:local`, 원격: `npm run db:migrate:remote`.

### 경고(warnings) 스키마
- **변경 없음.** 현황판 표시 로직(날짜·활성 회원 필터)만 프론트에서 처리.

## API 변경

### routes/scores.ts
- `GET /?seasonId=` : 응답에서 `round` 제거 → `{ memberId, score }[]`
- `GET /?type=총력전` : **신규**. 해당 타입의 전 시즌 점수를 `{ seasonId, memberId, score }[]`로 반환(전체 시즌추이 그래프용). seasonId로 시즌 순서 매핑.
- `PUT /` : `round` 제거. upsert 키 `(seasonId, memberId)`. score가 null/빈값이면 셀 삭제(기존 동작 유지).
- `DELETE /round` : **제거**.

### routes/score-seasons.ts
- `POST /` : body에 `startDate`, `endDate` 추가. `roundCount` 제거.
- `PATCH /:id` : `startDate`, `endDate` 수정 허용. `roundCount` 제거.
- `GET /?type=` : 응답에 `startDate`, `endDate` 포함. `roundCount` 제거.

## 타입 변경 (lib/types.ts)
- `ScoreSeason`: `roundCount` 제거 → `start: string`, `end: string` 추가.
- `ScoreCell`: `round` 제거 → `{ memberId: number; score: number }`. (전체 추이용은 `seasonId` 포함 변형 또는 별도 타입.)

## 점수 구간 (lib/score.ts)

고정 500단위 `bucketize`를 **타입별 커스텀 경계** 방식으로 교체.

- 총력전 경계: `~4000 / 4000~5000 / 5000~6000 / 6000~`
- 길드전 경계: `0~500 / 500~1000 / 1000~1500 / 1500~2000 / 2000~`
- 강림전 경계: `~1000만 / 1000만~1500만 / 1500만~2000만 / 2000만~2500만 / 2500만~3000만 / 3000만~3500만 / 3500만~4000만`
  - 단위 만 = 10,000. 라벨은 만 단위로 표기.
  - 4000만 초과값이 존재하면 `4000만~` 오버플로 버킷으로 안전 처리(데이터 누락 방지).

구현 방향:
- 타입 → 경계 배열(`number[]`) + 라벨 포맷터 매핑.
- `bucketize(values, type)` : 경계 기준으로 구간 인원 집계, 높은 구간이 위로 오도록 내림차순.
- `bucketStart(value, type)` / `bucketLabel(start, type)` : 길드전 교차분포에서 사용(총력전 경계로 그룹핑).

## 경고 (항목 1·2·3·4)

### 항목 1·4 — 선택 기간 경고만 + 길드전 시즌 초기화
- 현황판 `WarningPanel`은 **현황판 캘린더 선택 기간(rangeStart~rangeEnd) 내 경고만** 집계·표시.
- 누적 경고 횟수도 해당 기간 경고만 카운트 → 길드전 시즌 기간을 선택하면 자연히 시즌별 초기화.
- App에서 기간·활성 필터를 적용한 경고 목록을 `WarningPanel`에 전달.

### 항목 2 — 탈퇴 회원 숨김
- `WarningPanel`, 캘린더 경고 표기에서 **활성 회원 경고만** 표시.
- 점수/통계 탭·미참집계는 이미 `activeMembers`만 사용 → 충족.
- 관리 탭 `WarningManager`(입력·전체 목록)는 변경 없음(전체 표시 유지).

### 항목 3 — 캘린더 경고 표기
- `DayCell`에 해당 날짜의 활성 회원 경고가 있으면 모서리에 작은 앰버 ⚠ 마커 + 건수 표시.
- `DayCell`에 활성 회원 경고 배열(또는 날짜별 건수 맵)을 prop으로 전달.

## 점수 탭 — ScoreBoard (점수표)

- "차수 추가 / 마지막 차수 삭제" 버튼 **삭제**(항목 10).
- 새 시즌 추가 폼: 이름 + **시작일 + 종료일** 입력.
- 점수표 = 길드원당 **점수 입력 칸 1개** + **변동 칸**.
  - 변동 = **직전 시즌 대비**(상승 빨강 / 하락 파랑). 직전 시즌 = 같은 타입에서 endDate 기준 바로 앞 시즌.
- 점수표 ↔ 그래프 토글 유지.

## 점수 탭 — ScoreChart (그래프)

그래프 뷰 안에 하위 토글 **[단일 시즌 | 전체 시즌추이]** (항목 11·12, 3타입 공통).

### 단일 시즌
- 선택 시즌의 길드원 점수를 **내림차순 막대그래프**(Recharts BarChart).
- x축 = 길드원, y축 = 점수.

### 전체 시즌추이
- **종료된 시즌만**(오늘 > endDate)을 x축으로 한 꺾은선(LineChart).
- x축 = 시즌(endDate 오름차순), 각 길드원이 선 하나.
- 상단 드롭다운: 기본 "전체 길드원", **특정 길드원 선택 시 그 길드원 추이만** 표시.

## 통계 탭 — StatsBoard (항목 13)

- **차수(round) 선택 제거**, **시즌 선택만** 유지.
- 순위표·점수구간 인원집계: 선택 시즌의 단일 점수 기준, 변동은 **직전 시즌 대비**.
- 점수구간: 타입별 커스텀 경계 사용.
- 길드전 "같은 총력전 구간 분포": 최신 총력전 시즌의 단일 점수로 그룹핑(총력전 경계 사용).

## lib/analysis.ts 재작성

차수 기반 인덱스를 시즌 기반으로 교체.
- 시즌 내 길드원 점수 조회(단일 점수).
- 순위 + 직전 시즌 대비 변동.
- 전체 시즌추이 차트 데이터: `{ season: label, [name]: score }[]` (종료 시즌만).
- 단일 시즌 막대 데이터: `{ name, score }[]` 내림차순.

## 영향 파일

- DB/API: `src/worker/db/schema.ts`, `drizzle/*(신규 마이그레이션)`, `src/worker/routes/scores.ts`, `src/worker/routes/score-seasons.ts`
- lib: `src/lib/types.ts`, `src/lib/score.ts`, `src/lib/analysis.ts`
- UI: `src/components/ScoreBoard.tsx`, `src/components/ScoreChart.tsx`, `src/components/StatsBoard.tsx`, `src/components/WarningPanel.tsx`, `src/components/calendar.tsx`, `src/App.tsx`

## 비목표 (Out of Scope)

- 인증/권한(기존대로 없음).
- 점수 시즌과 현황판 총력전/길드전 기간(powerWarPeriods/guildWarPeriods)의 통합 — 별개 유지.
- 경고 스키마 확장(시즌 컬럼 추가 등) — 기간 필터로 대체.

## 리스크

- **전체 초기화**: 원격 D1에 실데이터가 있을 경우 점수·시즌 데이터 소실. 사용자 합의 완료(전체 초기화 선택). 마이그레이션 실행 전 재확인 필요.
- 강림전 점수 스케일(천만 단위)로 인한 그래프 y축·툴팁 포맷, 버킷 라벨 가독성.
- 직전 시즌 정의가 endDate 동률일 때 모호 → id 보조 정렬로 결정.
