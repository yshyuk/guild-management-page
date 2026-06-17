# 안드로이드 앱(TWA) + 좁은 화면 반응형 최적화 — 설계서

- 작성일: 2026-06-17
- 대상: 갤럭시 Z 폴드(커버/메인), 갤럭시 S24
- 목표: 기존 Cloudflare 웹앱을 **사이드로드용 안드로이드 APK**로 패키징하고, 폴드/S24 화면에 맞게 반응형 최적화

## 1. 배경 / 현재 상태

- 스택: React 19 SPA + Hono Worker + D1, Tailwind v4, `wrangler deploy` 배포
- 이미 URL 접속 가능한 웹앱. 반응형이 일부 들어가 있으나 좁은 화면에서 가로 스크롤 발생
- 확인된 문제 지점:
  - `App.tsx:776` 상단 5탭 — 좁은 폭에서 라벨 끼임
  - `App.tsx:854-866` 대시보드 캘린더 — `sm:min-w-[720px] md:min-w-[840px]`로 **펼친 폴드(~768px)에서 가로 스크롤**
  - `ScoreBoard.tsx:442/467` 길드전 점수표 — `min-w-[860px]` 고정, 8열이라 좁은 화면 항상 가로 스크롤

## 2. 확정된 결정 (브레인스토밍 결과)

| 항목 | 결정 |
|---|---|
| 앱 형태 | 진짜 APK (TWA, Trusted Web Activity) |
| 패키징 도구 | Bubblewrap (`npx @bubblewrap/cli`) — 런타임 의존성 추가 없음 |
| 배포 | 사이드로드(카톡 등 직접 전달), 플레이스토어 미사용 |
| 서비스워커 | **없음** (데이터 항상 최신 유지 — 캐싱이 오히려 독) |
| 폴드 우선순위 | 커버(좁은) + 메인(넓은) 둘 다 |
| 점수표 좁은 화면 | **카드형 B(압축형)**. 넓은 화면은 기존 테이블 유지 |
| 승패 입력 흐름 | **기존과 100% 동일** (OX 탭 순환 → 기록 → 누적 → 초기화). 로직 미변경 |

## 3. 아키텍처 / 작업 4파트

```
파트 1: 반응형 최적화 (웹 코드)        ← 본 작업의 핵심·대부분
파트 2: PWA manifest + 아이콘          ← TWA 전제조건
파트 3: Cloudflare 배포 + assetlinks   ← 정적 파일 + 배포
파트 4: Bubblewrap APK 빌드            ← 사용자 Mac 환경 필요 (런북 제공)
```

의존성: 4 → 3의 지문 필요(빌드 후 SHA-256을 assetlinks에 기입 후 재배포). 1·2·3(파일)은 코드로 완료 가능, 4는 사용자 환경(JDK17/Android SDK)에서 함께 실행.

## 4. 파트별 상세

### 파트 1 — 반응형 최적화

**1-A. 상단 탭바 (`App.tsx`)**
- 좁은 화면(<400px): 아이콘 위 + 작은 라벨(2줄) 또는 라벨 축소. 넓은 화면: 기존 아이콘+텍스트 가로
- 탭 높이 44px(`h-11`) 유지 — 터치 타깃 확보

**1-B. 대시보드 캘린더 (`App.tsx:854-866`)**
- 강제 `sm:min-w-[720px] md:min-w-[840px]` **제거**. 컨테이너에 맞춰 7열 유동 축소
- 좁은 화면에서 날짜 셀 내부 마크/폰트 크기만 축소해 가독성 유지

**1-C. 점수표 카드형 (`ScoreBoard.tsx`)**
- 길드전(`isGuild`) 점수표를 **반응형 분기**:
  - 넓은 화면(`md:` 이상): 기존 테이블 그대로 (`min-w-[860px]` + `overflow-x-auto`)
  - 좁은 화면(`md:` 미만): **카드형 B(압축형)** 렌더
- 카드 B 구성(1인 1카드, 세로 나열, 팝업 아님):
  - 1행: 이름 · 점수 입력(number) · 변동(▲▼)
  - 2행: OX 5칸(`cycleOx`) — 압축형 26~28px, 터치 타깃 확보 위해 최소 높이 보정
  - 3행: 전적(승/패) · 승률 · 최근입력일 · [기록][수정] 버튼
- **승패 입력 로직 미변경**: `cycleOx`(·→O→X→· 순환), `recordMatch`(O=승/X=패 누적, 기록 후 5칸 리셋), `수정`→전적 수정 모달 그대로 호출
- 비길드(공성전 등) 단순 테이블은 변경 없음
- 그래프 뷰 변경 없음

**1-D. 넓은 화면(펼친 폴드 ~768-840px) 활용**
- 점수/통계 탭 등에서 가능한 곳은 2열 활용(기존 `sm:grid-cols-2 xl:grid-cols-3` 보정)

**1-E. 전역**
- `index.html` viewport에 `viewport-fit=cover` 추가
- 좁은 화면 safe-area: 최상위 컨테이너에 `env(safe-area-inset-*)` 패딩 반영(상태바·노치 영역 침범 방지)
- 좁은 화면 패딩/폰트 미세 조정

### 파트 2 — PWA manifest + 아이콘

- `public/manifest.webmanifest`:
  - `name: "길드 관리"`, `short_name: "길드관리"`, `lang: "ko"`
  - `display: "standalone"`, `start_url: "/"`, `scope: "/"`
  - `theme_color`, `background_color`(앱 zinc 톤)
  - `icons`: 192, 512, maskable-512
  - `orientation` 미지정(폴드 회전 허용)
- `public/icons/`: `icon-192.png`, `icon-512.png`, `maskable-512.png`
  - 모티프: 방패/검(길드), zinc 톤. 초기엔 코드/SVG 기반 생성 아이콘으로 시작, 추후 `design-assets`로 교체 가능
- `index.html`: `<link rel="manifest">`, `<meta name="theme-color">`, apple-touch-icon, `viewport-fit=cover`
- 서비스워커 없음

### 파트 3 — 배포 + assetlinks

- `public/.well-known/assetlinks.json` 생성(파트 4의 SHA-256 지문 기입). 초기엔 플레이스홀더, 빌드 후 채움
- `npm run deploy`로 라이브 반영
- **확인 필요(미정)**: 실제 배포 URL — `guild-management-page.<account>.workers.dev` 또는 커스텀 도메인. TWA가 이 URL에 고정됨. 빌드 전 확정 필요

### 파트 4 — Bubblewrap APK (사용자 Mac에서 함께)

- 사전: JDK 17 + Android SDK (`bubblewrap doctor` 자동 설치 유도)
- `npx @bubblewrap/cli init --manifest https://<배포URL>/manifest.webmanifest`
- `twa-manifest.json`: `packageId: kr.guild.management`, `host`, `launcherName: "길드 관리"`, `themeColor`, 새 keystore
- `npx @bubblewrap/cli build` → `app-release-signed.apk` + keystore
- keystore SHA-256 지문 → 파트 3 assetlinks.json 기입 → 재배포(주소창 숨김)
- APK 직접 전달 → 사이드로드 설치
- 산출물: 런북 문서(`docs/android-twa-build.md`)로 명령어 일괄 제공

## 5. 비목표 (YAGNI)

- 플레이스토어 등록, 앱 서명 정책, 자동 업데이트 채널
- 서비스워커/오프라인 캐싱
- 네이티브 푸시알림, Capacitor 플러그인
- App.tsx 구조 리팩토링(61KB 단일 파일) — 이번 범위 밖, 반응형 클래스만 손댐
- 승패 입력 로직/데이터 모델 변경

## 6. 테스트 / 검증

- 기존 vitest 스위트(`npm test`) 깨지지 않음 확인(로직 미변경)
- 빌드 통과: `npm run build`(tsc + vite)
- 수동 검증: 브라우저 devtools 360px / 768px / 840px에서 가로 스크롤 없음, 탭바·캘린더·점수표 카드 정상
- 승패 입력 회귀: OX 탭 순환, 기록 누적, 초기화 동작 동일

## 7. 리스크

- 실제 배포 URL 미확정 시 파트 4 진행 불가 → 빌드 전 확정 필요
- Bubblewrap 첫 실행 시 JDK/SDK 다운로드 시간 소요
- 카드/테이블 분기로 ScoreBoard 코드량 증가 — 동일 데이터·핸들러 재사용으로 중복 최소화
