# 안드로이드 TWA + 좁은화면 반응형 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Cloudflare 웹앱을 사이드로드용 안드로이드 APK(TWA)로 패키징하고, 갤럭시 폴드/S24 좁은 화면에서 가로 스크롤 없이 쓰도록 반응형 최적화한다.

**Architecture:** 코드 변경(파트 1~3 파일)은 이 세션에서 완료하고, APK 빌드(파트 4)는 사용자 Mac 환경(JDK17/Android SDK)에서 실행할 런북으로 제공한다. 점수표는 좁은 화면=카드형 / 넓은 화면=기존 테이블로 분기하며 승패 입력 로직은 변경하지 않는다.

**Tech Stack:** React 19, Tailwind v4, Vite, Cloudflare Workers/D1, Bubblewrap(TWA), PWA manifest. 서비스워커 없음.

**검증 원칙:** 본 작업은 대부분 presentational(CSS/레이아웃) 변경이라 신규 단위테스트 대상 로직이 없다. 각 태스크는 `npm run build`(tsc+vite) 통과 + 기존 `npm test` 무회귀 + devtools 폭(360/768/840px) 수동 확인으로 검증한다.

---

## File Structure

- `index.html` — viewport-fit, manifest/theme-color 링크 (수정)
- `public/manifest.webmanifest` — PWA 매니페스트 (생성)
- `public/icons/icon-192.png|icon-512.png|maskable-512.png` — 앱 아이콘 (생성)
- `public/.well-known/assetlinks.json` — TWA 디지털 자산 링크 (생성, 지문 플레이스홀더)
- `src/index.css` — safe-area 전역 보정 (수정)
- `src/App.tsx` — 탭바 반응형, 캘린더 강제폭 제거 (수정)
- `src/components/ScoreBoard.tsx` — 길드전 점수표 좁은화면 카드형 분기 (수정)
- `docs/android-twa-build.md` — 파트 4 APK 빌드 런북 (생성)

---

## Task 1: 전역 viewport + safe-area

**Files:**
- Modify: `index.html:5`
- Modify: `src/index.css` (말미에 추가)

- [ ] **Step 1: index.html viewport 교체**

`index.html:5` 의 viewport 메타를 아래로 교체:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#fafafa" />
```

- [ ] **Step 2: index.css 말미에 safe-area 패딩 추가**

`src/index.css` 맨 끝에 추가:

```css
/* TWA 전체화면: 상태바·폴드 노치 영역 침범 방지 */
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 에러 없이 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add index.html src/index.css
git commit -m "feat(mobile): viewport-fit + safe-area 전역 적용"
```

---

## Task 2: 상단 탭바 좁은 화면 대응

**Files:**
- Modify: `src/App.tsx:776-792`

좁은 화면에서 5개 탭 라벨이 끼지 않도록 아이콘 위/라벨 아래 세로 배치(좁을 때) → 가로 배치(넓을 때)로 전환하고 좌우 패딩을 줄인다.

- [ ] **Step 1: TabsList 패딩 축소**

`src/App.tsx:776` 의 `p-1.5` → `p-1 sm:p-1.5`, `min-h-[56px]` 유지. 즉 className에서 `p-1.5`만 `p-1 sm:p-1.5`로 교체.

- [ ] **Step 2: 각 TabsTrigger className 교체 (5개 전부 동일 패턴)**

각 `TabsTrigger`의 className에서
`flex h-11 w-full items-center justify-center rounded-[14px] px-4 text-sm font-medium`
부분을
`flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-[14px] px-1 text-[11px] font-medium sm:flex-row sm:gap-0 sm:px-4 sm:text-sm`
로 교체한다 (5개 모두).

그리고 각 아이콘의 `mr-2`를 `mr-0 sm:mr-2`로 교체한다. 예시(현황판):

```tsx
<TabsTrigger value="dashboard" className="flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-[14px] px-1 text-[11px] font-medium text-zinc-600 transition sm:flex-row sm:gap-0 sm:px-4 sm:text-sm data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
  <Calendar className="mr-0 h-4 w-4 sm:mr-2" />현황판
</TabsTrigger>
```

나머지 4개(input/score/stats/manage)도 동일하게 `flex-col ... sm:flex-row` + 아이콘 `mr-0 sm:mr-2` 적용.

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 4: 수동 확인**

devtools 360px: 5탭이 아이콘 위 + 라벨 아래로 한 줄에 모두 보이고 끼임/줄바꿈 없음. 768px+: 기존처럼 아이콘+텍스트 가로.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(mobile): 상단 탭바 좁은화면 아이콘+라벨 세로배치"
```

---

## Task 3: 대시보드 캘린더 강제폭 제거

**Files:**
- Modify: `src/App.tsx:866`

펼친 폴드(~768px=md)에서 캘린더가 `md:min-w-[840px]`로 가로 스크롤되던 것을 제거하고 컨테이너에 맞춰 유동 축소되게 한다.

- [ ] **Step 1: 캘린더 grid className 교체**

`src/App.tsx:866` 의
```tsx
<div className="grid min-w-0 grid-cols-7 gap-1.5 sm:min-w-[720px] sm:gap-2 md:min-w-[840px] xl:min-w-0 xl:gap-3">
```
를
```tsx
<div className="grid min-w-0 grid-cols-7 gap-1 sm:gap-2 xl:gap-3">
```
로 교체 (`sm:min-w-[720px] md:min-w-[840px] xl:min-w-0` 제거).

- [ ] **Step 2: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 수동 확인**

devtools 360/768px: 캘린더 7열이 화면폭에 맞게 줄어들고 가로 스크롤이 없다. 날짜 셀 내용이 잘리지 않는지 확인(잘리면 셀 내부 폰트/마크는 calendar.tsx에서 별도 조정 — 본 태스크 범위 밖, 필요 시 후속).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(mobile): 대시보드 캘린더 강제폭 제거(펼친폴드 가로스크롤 해소)"
```

---

## Task 4: 길드전 점수표 좁은화면 카드형(B 압축형)

**Files:**
- Modify: `src/components/ScoreBoard.tsx:441-532`

`view === 'table'` 분기에서 `isGuild`일 때 좁은 화면(<md)은 카드형, md 이상은 기존 테이블로 렌더한다. 비길드는 변경 없음. 모든 핸들러(getScore/handleScoreChange/persistCell/computeDelta/getOx/cycleOx/recordMatch/openEdit, records/recordingIds)는 기존 것을 그대로 재사용한다.

- [ ] **Step 1: 길드전 테이블 wrapper에 `hidden md:block` 추가**

`src/components/ScoreBoard.tsx:441` 의
```tsx
<div className={`${isGuild ? 'overflow-x-auto' : 'overflow-hidden'} rounded-2xl border border-zinc-200`}>
```
를
```tsx
<div className={`${isGuild ? 'hidden overflow-x-auto md:block' : 'overflow-hidden'} rounded-2xl border border-zinc-200`}>
```
로 교체한다. (테이블은 넓은 화면에서만 표시)

- [ ] **Step 2: 길드전 카드 리스트를 테이블 wrapper 바로 앞에 추가**

`src/components/ScoreBoard.tsx:441` 의 위 wrapper `<div>` **바로 앞 줄**에 아래 블록을 삽입한다(좁은 화면 전용 카드):

```tsx
{isGuild && (
  <div className="space-y-2.5 md:hidden">
    {members.map((member) => {
      const score = getScore(member.id);
      const delta = computeDelta(score, prevMap?.get(member.id) ?? null);
      const rec = records[member.id];
      const wins = rec?.wins ?? 0;
      const losses = rec?.losses ?? 0;
      const ox = getOx(member.id);
      return (
        <div key={member.id} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-zinc-800">{member.name}</div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                value={score ?? ''}
                onChange={(e) => handleScoreChange(member.id, e.target.value)}
                onBlur={() => void persistCell(member.id)}
                className="h-8 w-[72px] rounded-lg text-right"
              />
              <span className={`min-w-[42px] text-right text-xs font-semibold tabular-nums ${deltaColorClass(delta)}`}>
                {deltaText(delta) || '-'}
              </span>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="w-7 text-[11px] text-zinc-400">5판</span>
            {ox.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => cycleOx(member.id, i)}
                className={[
                  'h-8 w-8 rounded-md border text-xs font-semibold',
                  v === 'o'
                    ? 'border-rose-200 bg-rose-100 text-rose-600'
                    : v === 'x'
                      ? 'border-sky-200 bg-sky-100 text-sky-600'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-300',
                ].join(' ')}
              >
                {v === 'o' ? 'O' : v === 'x' ? 'X' : '·'}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs tabular-nums">
              <span><span className="font-semibold text-rose-500">{wins}승</span> <span className="font-semibold text-sky-500">{losses}패</span></span>
              <span className="font-semibold text-zinc-600">{winRateText(wins, losses)}</span>
              <span className="text-zinc-400">{rec?.lastInputDate ?? '-'}</span>
            </div>
            <div className="flex gap-1.5">
              <Button
                className="h-7 rounded-lg px-3 text-xs"
                onClick={() => void recordMatch(member.id)}
                disabled={ox.every((v) => v === null) || !!recordingIds[member.id]}
              >
                기록
              </Button>
              <Button
                variant="outline"
                className="h-7 rounded-lg px-3 text-xs"
                onClick={() => openEdit(member.id)}
              >
                수정
              </Button>
            </div>
          </div>
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 2.5: 삽입 위치 정확성 확인**

삽입한 카드 블록은 `{view === 'chart' ? (<ScoreChart/>) : (` 의 else 분기 안, 테이블 wrapper `<div>` 직전에 있어야 한다. JSX 형제 요소로 나란히 있게 되므로 상위가 단일 표현식이면 `<>...</>`로 감싸야 할 수 있다. 현재 else는 `(`로 시작해 단일 `<div>`를 반환하므로, 카드 블록 + 테이블 div 두 형제를 감싸기 위해 else 본문을 `<>` … `</>`로 감싼다:

`{view === 'chart' ? (` … `) : (` 다음을 `<>`로 열고, 테이블 wrapper div 닫힘 `</div>` 다음(원래 `)` 직전)에 `</>`를 추가한다.

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 빌드 성공 (JSX 구조 에러 없을 것)

- [ ] **Step 4: 기존 테스트 무회귀**

Run: `npm test`
Expected: 기존 테스트 전부 통과 (로직 미변경)

- [ ] **Step 5: 수동 확인**

devtools 360px: 길드전 점수표가 카드형으로 나오고 가로 스크롤 없음. OX 탭 순환·기록·수정 동작 정상. 768px+: 기존 테이블 그대로. 비길드(공성전) 탭: 변경 없음.

- [ ] **Step 6: Commit**

```bash
git add src/components/ScoreBoard.tsx
git commit -m "feat(mobile): 길드전 점수표 좁은화면 카드형(B 압축형) 분기"
```

---

## Task 5: PWA manifest + 아이콘

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`
- Modify: `index.html` (head)

- [ ] **Step 1: 아이콘 생성**

방패 모티프 SVG를 만들어 PNG 3종(192/512/maskable-512)으로 렌더한다. 외부 라이브러리 없이 `sharp`가 없으면, SVG를 직접 작성 후 macOS `qlmanage`/`rsvg`/`sips` 또는 Node 스크립트로 변환. (구현 시 사용 가능한 도구로 생성하되 결과 파일 경로는 위 3개로 고정)

zinc 배경(#18181b) + 흰 방패/검 심볼, maskable은 안전영역 80% 안에 심볼 배치.

- [ ] **Step 2: manifest.webmanifest 생성**

`public/manifest.webmanifest`:

```json
{
  "name": "길드 관리",
  "short_name": "길드관리",
  "lang": "ko",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#fafafa",
  "theme_color": "#fafafa",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 3: index.html head에 링크 추가**

`index.html` `<head>` 안(title 위)에 추가:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

- [ ] **Step 4: 빌드 + 매니페스트 dist 복사 확인**

Run: `npm run build && ls dist/client/manifest.webmanifest dist/client/icons/`
Expected: manifest와 아이콘 3종이 dist에 복사됨 (vite는 public/을 정적 복사. 실제 출력 경로가 다르면 확인 후 경로 조정)

- [ ] **Step 5: Commit**

```bash
git add public/manifest.webmanifest public/icons index.html
git commit -m "feat(pwa): manifest + 앱 아이콘 + head 링크 추가"
```

---

## Task 6: assetlinks.json (지문 플레이스홀더)

**Files:**
- Create: `public/.well-known/assetlinks.json`

- [ ] **Step 1: assetlinks.json 생성**

`public/.well-known/assetlinks.json` (지문은 파트4 빌드 후 채움):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "kr.guild.management",
      "sha256_cert_fingerprints": ["REPLACE_WITH_KEYSTORE_SHA256_AFTER_BUILD"]
    }
  }
]
```

- [ ] **Step 2: 빌드에서 .well-known 복사 확인**

Run: `npm run build && ls dist/client/.well-known/assetlinks.json`
Expected: 파일 존재 (없으면 vite publicDir 설정/경로 확인)

- [ ] **Step 3: Commit**

```bash
git add public/.well-known/assetlinks.json
git commit -m "feat(twa): assetlinks.json 추가(지문은 빌드 후 기입)"
```

---

## Task 7: 파트 4 APK 빌드 런북 문서

**Files:**
- Create: `docs/android-twa-build.md`

- [ ] **Step 1: 런북 작성**

`docs/android-twa-build.md` 에 아래 절차를 기록:
1. 사전: JDK 17 설치 확인(`java -version`), `npx @bubblewrap/cli doctor`로 Android SDK 자동 설치
2. 배포 URL: `guild-management-page.yshyuk-63.workers.dev` (고정)
3. `npx @bubblewrap/cli init --manifest https://guild-management-page.yshyuk-63.workers.dev/manifest.webmanifest`
4. `twa-manifest.json` 설정값: packageId `kr.guild.management`, launcherName `길드 관리`, themeColor `#fafafa`, host `guild-management-page.yshyuk-63.workers.dev`
5. `npx @bubblewrap/cli build` → `app-release-signed.apk` + keystore 생성
6. `npx @bubblewrap/cli fingerprint` 또는 keytool로 SHA-256 추출 → `public/.well-known/assetlinks.json`의 `REPLACE_...` 자리에 기입
7. `npm run deploy` 재배포(주소창 숨김 적용)
8. `app-release-signed.apk`를 길드원에게 전달 → 사이드로드 설치(출처 불명 앱 허용 필요)

- [ ] **Step 2: Commit**

```bash
git add docs/android-twa-build.md
git commit -m "docs(twa): APK 빌드 런북 추가"
```

---

## Self-Review 결과

- **Spec 커버리지:** 파트1(Task2-4,1) / 파트2(Task5) / 파트3 파일(Task6) / 파트4 런북(Task7) / 전역 safe-area(Task1) 모두 태스크 존재. 파트4 실제 빌드는 사용자 환경 필요 → 런북으로 위임(스펙 §4 일치).
- **플레이스홀더:** assetlinks 지문은 의도된 미정값(빌드 후 기입)으로 명시. 그 외 플레이스홀더 없음.
- **타입/네이밍 일관성:** ScoreBoard 카드에서 쓰는 핸들러·변수명(getScore/handleScoreChange/persistCell/computeDelta/getOx/cycleOx/recordMatch/openEdit/records/recordingIds/prevMap/winRateText/deltaText/deltaColorClass)은 기존 정의와 일치 확인.
- **배포 URL(고정):** `https://guild-management-page.yshyuk-63.workers.dev` — Task7(빌드)에 반영됨.
