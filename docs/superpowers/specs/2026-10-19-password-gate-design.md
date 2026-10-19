# 초기 진입 비밀번호 게이트 (조회/관리자 2단계)

작성일: 2026-10-19

## 배경 / 목적

현재 `/api/*` 는 인증이 전혀 없어, URL만 알면 누구나 데이터를 조회·수정할 수 있다.
초기 페이지에서 비밀번호를 입력해야 진입할 수 있게 하고, **조회 전용**과 **관리자(수정 가능)** 권한을 분리한다.

프론트 화면만 막는 방식은 번들에 비밀번호가 노출되고 API 직접 호출을 막지 못하므로 채택하지 않는다.
**보호의 기준은 Worker(서버)** 이며, 프론트 UI 처리는 사용성 목적이다.

## 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 보호 위치 | **Hono Worker 미들웨어** (`/api/*`) — 서버 검증 |
| 권한 | `viewer`(GET만) / `admin`(전체) 2단계, 비밀번호 2개 |
| 세션 유지 | **7일** (서명 쿠키 Max-Age) |
| 세션 저장 | 상태 없음(stateless) — HMAC 서명 쿠키, DB 테이블 추가 없음 |
| 조회 모드 UI | 입력·관리 탭 숨김 + 대시보드/점수 화면의 수정 메뉴·버튼 비활성 |
| 권한 상승 | 헤더의 "관리자 로그인"으로 viewer → admin 전환 |
| 라이브러리 | 추가 없음 (Web Crypto + `hono/cookie`) |

## 서버

### Secrets / 바인딩

| 이름 | 용도 |
|---|---|
| `VIEWER_PASSWORD` | 조회용 비밀번호 |
| `ADMIN_PASSWORD` | 관리자 비밀번호 |
| `AUTH_SECRET` | 쿠키 HMAC 서명 키 (32바이트 이상 랜덤) |

- 운영: `wrangler secret put <NAME>` (코드·`wrangler.jsonc` 에 값 미기재)
- 로컬: `.dev.vars` (이미 gitignore)
- `src/worker/types.ts` 의 `Bindings` 에 3개 추가

### 쿠키 포맷

`gm_session = <role>.<expEpochSec>.<base64url(HMAC-SHA256(AUTH_SECRET, "<role>.<exp>"))>`

- 속성: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`
- 검증: 서명 일치(상수 시간 비교) + `exp > now` + `role ∈ {viewer, admin}`
- 전체 세션 강제 만료: `AUTH_SECRET` 교체

### 라우트 (`src/worker/routes/auth.ts`)

| 메서드 | 경로 | 동작 |
|---|---|---|
| POST | `/api/auth/login` | body `{ password }` → admin 비번 일치 시 admin, viewer 비번 일치 시 viewer 쿠키 발급, `{ role }` 반환. 불일치 401 |
| GET | `/api/auth/me` | 유효 세션이면 `{ role }`, 아니면 401 |
| POST | `/api/auth/logout` | 쿠키 삭제, `{ ok: true }` |

- 비밀번호 비교는 상수 시간 비교(양쪽을 SHA-256 해시 후 비교해 길이 차이도 숨김)
- 로그인 실패 시 소량 지연(예: 500ms)으로 무차별 대입 속도 저하. 별도 rate limit 은 범위 외

### 미들웨어 (`src/worker/auth.ts`)

`/api/auth/*` 를 제외한 모든 `/api/*` 에 적용:

1. 쿠키 없음/위조/만료 → **401** `{ error: 'Unauthorized' }`
2. `GET`/`HEAD` 가 아닌 요청 && role ≠ admin → **403** `{ error: 'Forbidden' }`
3. 통과 시 `c.set('role', role)`

정적 자산(SPA)은 보호하지 않는다 — 데이터는 모두 API 경유이므로 로그인 화면 렌더에 필요.

## 프론트

### 인증 상태

- `src/lib/auth.tsx`: `AuthProvider` / `useAuth()` → `{ role, login(password), logout() }`
- `main.tsx` 에서 `<AuthGate>` 로 `<App />` 감쌈
  - 부팅 시 `GET /api/auth/me` → 로딩 / `LoginScreen` / App 분기
- `src/lib/api.ts`: 응답 401 이면 전역 이벤트(`auth:expired`) 발행 → AuthGate 가 로그인 화면으로 전환

### LoginScreen (`src/components/LoginScreen.tsx`)

- 중앙 카드: 앱 이름, 비밀번호 입력(type=password, autoFocus), "입장" 버튼
- 실패 시 "비밀번호가 올바르지 않습니다" 인라인 에러
- 기존 `Card`/`Input`/`Button` 재사용, 모바일(TWA) 대응

### 조회 모드 UI (role = viewer)

- 탭: `input`, `manage` 트리거/콘텐츠 숨김
- 대시보드 셀 컨텍스트 메뉴, ScoreBoard·StatsBoard·calendar 의 수정 액션 비활성(또는 미노출)
- 헤더: 권한 배지(`조회`/`관리자`) + "관리자 로그인"(viewer일 때) + 로그아웃
- 컴포넌트에는 `canEdit: boolean` prop 또는 `useAuth()` 로 전달

## 테스트

- `src/worker/auth.test.ts` (vitest): 서명 생성/검증, 만료, 위조 서명, 잘못된 role 거부
- 수동: 로컬 `npm run dev` 에서
  - 비로그인 → 로그인 화면, `curl /api/members` → 401
  - viewer → 조회 가능, 입력/관리 탭 없음, `curl -X POST` → 403
  - admin → 전체 기능, 로그아웃 후 로그인 화면 복귀

## 배포 체크리스트

1. `wrangler secret put VIEWER_PASSWORD` / `ADMIN_PASSWORD` / `AUTH_SECRET` (배포 **전**에 설정 — 미설정 시 로그인 불가)
2. README 에 secret 설정 방법 추가
3. 길드원에게 조회용 비밀번호 공유

## 범위 외

- 개인별 계정 / 감사 로그
- IP 기반 rate limiting (필요 시 Cloudflare Rate Limiting 으로 후속)
