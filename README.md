# 길드 관리 페이지 (Guild Management Page)

세나 길드 운영을 위한 내부 관리 도구. 미참 현황, 총력전/길드전 점수 비교표, 경고 관리를 한 곳에서.

## 스택

- **Frontend**: React 19 + Vite + TypeScript, Tailwind CSS v4, shadcn/ui (radix-ui), Recharts(차트)
- **Backend**: Hono (Cloudflare Workers)
- **DB**: Cloudflare D1 (SQLite) + Drizzle ORM
- **배포**: Cloudflare (단일 Worker가 `/api/*` 처리 + Static Assets로 SPA 서빙)

## 탭 구성

1. **현황판** — 기간별 미참 캘린더 + 누적 미참 집계 + 경고 현황 패널
2. **입력** — 미참 입력
3. **점수** — 총력전 / 길드전 / 강림전 서브탭. 시즌별 점수표(점수 칸만 입력, 변동폭 자동 계산: 상승 빨강 / 하락 파랑). 점수표 ↔ **그래프**(차수별 변화추이 꺾은선) 보기 전환
4. **통계** — 총력전 / 길드전 / 강림전 서브탭. 길드 내 순위(변동 색강조), 점수구간별(500점 단위) 인원집계, 길드전은 "같은 총력전 구간의 길드전 점수 분포"도 표시
5. **관리** — 길드원 추가/관리, 길드전 기간 설정, 강림원정대 마감일 설정, 경고 입력

## 개발

```bash
npm install

# 로컬 D1 마이그레이션 적용
npm run db:migrate:local

# 개발 서버 (Vite + 로컬 Worker + 로컬 D1)
npm run dev
```

스키마를 바꾼 뒤:

```bash
npm run db:generate          # drizzle 마이그레이션 SQL 생성
npm run db:migrate:local     # 로컬 적용
```

## 배포 (Cloudflare)

1. 실제 D1 데이터베이스 생성 후 `wrangler.jsonc`의 `database_id` 교체:
   ```bash
   npx wrangler d1 create guild-db
   ```
2. 원격 마이그레이션 적용:
   ```bash
   npm run db:migrate:remote
   ```
3. 배포:
   ```bash
   npm run deploy
   ```

## 접근 비밀번호

첫 화면에서 비밀번호를 입력해야 들어갈 수 있습니다. 비밀번호는 2종류입니다.

| 권한 | 비밀번호 | 가능한 작업 |
|---|---|---|
| 조회 | `VIEWER_PASSWORD` | 현황판·점수·통계 보기 (입력·관리 탭 숨김, 수정 불가) |
| 관리자 | `ADMIN_PASSWORD` | 전체 기능 |

- 검증은 Worker(`/api/*` 미들웨어)에서 합니다. 로그인하지 않으면 401, 조회 권한으로 수정을 시도하면 403입니다.
- 세션은 HMAC 서명 쿠키(HttpOnly)로 **7일** 유지됩니다.
- 모든 세션을 강제로 끊으려면 `AUTH_SECRET`을 교체합니다.

**운영 secret 설정** (최초 배포 **전**에 필수 — 없으면 아무도 로그인할 수 없습니다):

```bash
npx wrangler secret put VIEWER_PASSWORD
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put AUTH_SECRET     # 예: openssl rand -hex 32 출력값
```

**로컬 개발**: 프로젝트 루트의 `.dev.vars`(gitignore 대상)에 같은 키를 넣습니다.

```
VIEWER_PASSWORD=view-local
ADMIN_PASSWORD=admin-local
AUTH_SECRET=<openssl rand -hex 32>
```

## 구조

```
src/
  App.tsx                 # 4개 탭 오케스트레이션 + 공유 상태
  components/
    calendar.tsx          # DayCell, PeriodCalendar (현황판/관리 캘린더)
    ScoreTab.tsx          # 점수 탭: 총력전/길드전/강림전 서브탭
    ScoreBoard.tsx        # 점수판 본체 (변동폭 계산/색상, 점수표↔그래프 전환)
    ScoreChart.tsx        # 변화추이 꺾은선 차트 (Recharts)
    StatsTab.tsx          # 통계 탭: 타입별 서브탭
    StatsBoard.tsx        # 순위표 + 구간집계 + 길드전 분포
    WarningPanel.tsx      # 현황판 경고 현황
    WarningManager.tsx    # 관리 탭 경고 입력
    ui/                   # shadcn/ui 컴포넌트
  lib/
    types.ts, dates.ts, score.ts, analysis.ts, api.ts
  worker/
    index.ts              # Hono app, /api/* 라우팅 + ASSETS fallback
    db/schema.ts          # Drizzle 스키마
    routes/               # 엔드포인트별 라우트
drizzle/                  # 생성된 D1 마이그레이션
```
