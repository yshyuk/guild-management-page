# 길드 관리 페이지 (Guild Management Page)

세나 길드 운영을 위한 내부 관리 도구. 미참 현황, 총력전/길드전 점수 비교표, 경고 관리를 한 곳에서.

## 스택

- **Frontend**: React 19 + Vite + TypeScript, Tailwind CSS v4, shadcn/ui (radix-ui)
- **Backend**: Hono (Cloudflare Workers)
- **DB**: Cloudflare D1 (SQLite) + Drizzle ORM
- **배포**: Cloudflare (단일 Worker가 `/api/*` 처리 + Static Assets로 SPA 서빙)

## 탭 구성

1. **현황판** — 기간별 미참 캘린더 + 누적 미참 집계 + 경고 현황 패널
2. **입력** — 미참 입력
3. **점수** — 총력전 / 길드전 서브탭. 시즌별 점수표, 점수 입력 시 변동폭 자동 계산(상승 빨강 / 하락 파랑). 점수 칸만 입력, 변동폭은 자동
4. **관리** — 길드원 추가/관리, 길드전 기간 설정, 강림원정대 마감일 설정, 경고 입력

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

> 인증은 두지 않았으므로 URL을 아는 사람은 누구나 접근/수정할 수 있습니다.

## 구조

```
src/
  App.tsx                 # 4개 탭 오케스트레이션 + 공유 상태
  components/
    calendar.tsx          # DayCell, PeriodCalendar (현황판/관리 캘린더)
    ScoreTab.tsx          # 점수 탭: 총력전/길드전 서브탭
    ScoreBoard.tsx        # 점수판 본체 (변동폭 계산/색상)
    WarningPanel.tsx      # 현황판 경고 현황
    WarningManager.tsx    # 관리 탭 경고 입력
    ui/                   # shadcn/ui 컴포넌트
  lib/
    types.ts, dates.ts, score.ts, api.ts
  worker/
    index.ts              # Hono app, /api/* 라우팅 + ASSETS fallback
    db/schema.ts          # Drizzle 스키마
    routes/               # 엔드포인트별 라우트
drizzle/                  # 생성된 D1 마이그레이션
```
