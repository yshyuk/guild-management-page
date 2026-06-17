# 안드로이드 APK(TWA) 빌드 런북

기존 Cloudflare 웹앱을 **사이드로드용 APK**로 감싸는 절차. Bubblewrap(TWA)을 사용한다.
앱은 "라이브 URL을 전체화면으로 띄우는 얇은 래퍼"이므로, **빌드 후 화면 수정은 웹 배포(`npm run deploy`)만으로 반영**된다. APK 재빌드는 앱 이름/아이콘/URL/네이티브 설정을 바꿀 때만 필요하다.

---

## 0. 사전 준비

```bash
java -version        # JDK 17 권장. 없으면 설치(예: brew install --cask temurin@17)
npx @bubblewrap/cli doctor   # Android SDK/JDK 점검 및 자동 설치 유도
```

> Bubblewrap이 처음 실행되면 JDK/Android SDK를 자동으로 내려받는다(수 분 소요).

---

## 1. 배포 URL (고정)

TWA는 고정 HTTPS URL에 묶인다. 이 프로젝트의 배포 주소:

```
https://guild-management-page.yshyuk-63.workers.dev
```

> 이 `yshyuk-63` 서브도메인은 Cloudflare 계정에 종속된 값이라 레포 코드(`wrangler.jsonc`엔 worker 이름만 있음)에는 없다. 커스텀 도메인으로 바꾸면 이 문서와 assetlinks/TWA 재설정 필요.

---

## 2. 웹 자산 배포 (manifest/아이콘/assetlinks 라이브 반영)

```bash
npm run deploy
# 확인:
#   https://guild-management-page.yshyuk-63.workers.dev/manifest.webmanifest
#   https://guild-management-page.yshyuk-63.workers.dev/icons/icon-512.png
#   https://guild-management-page.yshyuk-63.workers.dev/.well-known/assetlinks.json   (아직 지문은 플레이스홀더)
```

---

## 3. TWA 프로젝트 초기화

별도 폴더에서 진행 권장(예: `~/twa-guild`):

```bash
mkdir -p ~/twa-guild && cd ~/twa-guild
npx @bubblewrap/cli init --manifest https://guild-management-page.yshyuk-63.workers.dev/manifest.webmanifest
```

대화형 프롬프트 입력값:

| 항목 | 값 |
|---|---|
| Package ID | `kr.guild.management` |
| App name | `길드 관리` |
| Launcher name | `길드 관리` |
| Display mode | `standalone` |
| Theme color | `#fafafa` |
| Status bar color | `#fafafa` |
| Signing key | 새로 생성(기본값). 비밀번호 기록해 둘 것 |

> 생성된 keystore(`android.keystore`)와 비밀번호는 **분실하면 같은 앱으로 업데이트 불가**하니 안전하게 보관.

---

## 4. APK 빌드

```bash
npx @bubblewrap/cli build
# 산출물: app-release-signed.apk
```

---

## 5. 서명 지문(SHA-256) → assetlinks.json 기입 → 재배포

주소창을 숨기려면 앱 서명 지문을 사이트의 assetlinks에 등록해야 한다.

```bash
# 지문 추출 (둘 중 하나)
npx @bubblewrap/cli fingerprint list
# 또는
keytool -list -v -keystore android.keystore -alias android | grep "SHA256:"
```

추출한 `AA:BB:CC:...` 값을 이 저장소의
`public/.well-known/assetlinks.json` 의 `REPLACE_WITH_KEYSTORE_SHA256_AFTER_BUILD`
자리에 그대로 넣고 재배포:

```bash
# public/.well-known/assetlinks.json 수정 후
npm run deploy
```

검증: <https://developers.google.com/digital-asset-links/tools/generator> 또는
`https://guild-management-page.yshyuk-63.workers.dev/.well-known/assetlinks.json` 가 실제 지문을 담고 있는지 확인.

---

## 6. 배포(사이드로드)

1. `app-release-signed.apk` 를 길드원에게 전달(카톡/드라이브 등)
2. 설치 시 안드로이드에서 **"출처를 알 수 없는 앱 설치 허용"** 필요
3. 첫 실행 시 주소창이 보이면 → assetlinks 지문/도메인 매칭을 재확인(5단계)

---

## 이후 운영

- 화면/기능 수정 → `npm run deploy` 만 하면 앱에 즉시 반영(APK 재설치 불필요)
- APK 재빌드 필요한 경우: 앱 이름/아이콘 변경, 배포 URL 변경, 네이티브 설정 변경
  - 재빌드 시 **동일 keystore**로 서명해야 기존 설치본 업데이트 가능
- 앱 버전 올릴 때: `twa-manifest.json` 의 `appVersionCode`/`appVersionName` 증가 후 `build`
