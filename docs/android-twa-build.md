# 안드로이드 APK(TWA) 빌드 런북

기존 Cloudflare 웹앱을 **사이드로드용 APK**로 감싸는 절차. Bubblewrap(TWA)을 사용한다.
앱은 "라이브 URL을 전체화면으로 띄우는 얇은 래퍼"이므로, **빌드 후 화면 수정은 웹 배포(`npm run deploy`)만으로 반영**된다.

> ⚠️ **이 빌드는 당신 터미널(TTY)에서 실행해야 합니다.** Bubblewrap은 첫 실행 시 JDK/SDK 설치를 대화형으로 묻기 때문에, 자동화(비대화형) 셸에서는 `readline was closed` 오류로 실행이 불가합니다. 아래 명령들을 **macOS 터미널 앱에 직접** 붙여넣어 실행하세요.

---

## 이미 준비된 것 (자동 처리 완료)

- ✅ PWA manifest / 아이콘(방패+검) / `assetlinks.json` — 레포에 포함, 배포 시 라이브 반영
- ✅ **서명 키스토어**: `.twa/android-twa.keystore` (alias `android`, 비밀번호 `guildtwa2026`)
- ✅ **SHA-256 지문이 `assetlinks.json`에 미리 기입됨** → 빌드 후 지문 왕복·재배포 불필요
- ✅ **`.twa/twa-manifest.json`** 미리 작성 → 대화형 `init` 생략 가능

> 🔐 `.twa/` 는 `.gitignore`로 제외됨(키스토어는 비밀). **키스토어 파일과 비밀번호를 반드시 따로 백업**하세요 — 분실하면 같은 앱으로 업데이트가 불가능합니다.

---

## 0. 사전

```bash
java -version    # 설치돼 있으면 OK (Bubblewrap이 자체 JDK17도 받음)
```

---

## 1. 웹 배포 (필수 — Bubblewrap이 manifest/아이콘을 라이브 URL에서 가져옴)

```bash
cd <레포 경로>
npm run deploy
```

배포 후 아래가 200으로 떠야 한다:
- https://guild-management-page.yshyuk-63.workers.dev/manifest.webmanifest
- https://guild-management-page.yshyuk-63.workers.dev/icons/icon-512.png
- https://guild-management-page.yshyuk-63.workers.dev/.well-known/assetlinks.json

> 배포를 안 하면 Bubblewrap이 manifest/아이콘을 못 받아 빌드가 실패한다. (TWA 앱 자체는 라이브 URL을 띄우므로, 배포해야 폰에서 반응형 변경도 보인다.)

---

## 2. 빌드 디렉터리 준비

미리 만들어 둔 `twa-manifest.json` 과 키스토어를 빌드용 폴더로 복사:

```bash
mkdir -p ~/twa-guild
cp .twa/twa-manifest.json ~/twa-guild/
cp .twa/android-twa.keystore ~/twa-guild/
cd ~/twa-guild
```

---

## 3. 안드로이드 프로젝트 생성 + 빌드

```bash
# 첫 실행 시 "JDK/SDK 설치할까요? (Y/n)" → Y 입력, 안드로이드 SDK 라이선스 동의
npx @bubblewrap/cli@latest build
```

- 키스토어 비밀번호를 물으면 둘 다 `guildtwa2026` 입력
  (또는 미리 환경변수로: `export BUBBLEWRAP_KEYSTORE_PASSWORD=guildtwa2026 BUBBLEWRAP_KEY_PASSWORD=guildtwa2026`)
- `build`가 프로젝트 미생성 상태라며 멈추면 한 번만:
  ```bash
  npx @bubblewrap/cli@latest update   # twa-manifest.json 기준 프로젝트 생성
  npx @bubblewrap/cli@latest build
  ```

산출물: `~/twa-guild/app-release-signed.apk`

---

## 4. 폰에 설치 (사이드로드)

1. `app-release-signed.apk` 를 폰으로 전송(USB/카톡 나에게/드라이브 등)
2. 폰에서 설치 시 **"출처를 알 수 없는 앱 설치 허용"** 켜기
3. 실행 → 전체화면으로 길드 관리 앱이 뜸
   - 주소창이 안 보이면 정상(assetlinks 지문이 이미 맞음)
   - 혹시 상단에 주소 바가 보이면 → §1 배포가 됐는지, assetlinks가 라이브인지 확인

---

## 이후 운영

- **화면/기능 수정** → `npm run deploy` 만 하면 앱에 즉시 반영(APK 재설치 불필요)
- **APK 재빌드 필요한 경우**: 앱 이름/아이콘/URL/네이티브 설정 변경 시
  - 반드시 **같은 키스토어**(`.twa/android-twa.keystore`)로 서명해야 기존 설치본 업데이트 가능
  - 버전 올릴 때: `twa-manifest.json` 의 `appVersionCode`(정수 +1) / `appVersionName` 수정 후 `build`
- **커스텀 도메인으로 변경 시**: `twa-manifest.json` 의 host/URL들 + `assetlinks.json` 재설정 후 재빌드

---

## 참고: 키스토어/지문 정보

- 키스토어: `.twa/android-twa.keystore`, alias `android`, 비밀번호 `guildtwa2026`
- 패키지명: `kr.guild.management`
- SHA-256 지문(=assetlinks에 기입됨):
  `31:24:A6:AE:5D:27:3D:1D:01:FE:C0:C2:7B:CD:2C:36:AB:37:99:64:27:06:60:60:88:2C:3C:E1:82:1D:3F:1D`
