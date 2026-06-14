# 통계 비교에 "직전 완료 총력전" 사용 (기능 A)

작성일: 2026-06-14

## 배경 / 목적

총력전은 길드전 기간 안에서 여러 번 열린다(예: 길드전 4/1~5/31 안에 총력전 4/1~4/5, 4/30~5/4, 5/10~5/20).
통계 탭 → 길드전 → **"같은 총력전 점수구간·길드전 점수 분포"** 비교는 길드전 성과를 총력전 점수와 비교하기 위한 것인데,
현재 기준 총력전을 `sortSeasons(powerSeasons).at(-1)`(최신 **생성** 시즌)으로 잡아 아직 정산 안 끝난 진행 중 시즌을 가리킬 수 있다.

목적: 비교 기준을 **직전(가장 최근 완료된) 총력전 시즌**으로 바꾼다. 총력전이 종료·정산되면 그 시즌이 새 "직전"이 된다.

## 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| "직전 완료 총력전" 판정 | `end != null && end < 오늘`인 총력전 시즌 중 **종료일(end)이 가장 최근**인 것 |
| 동률 처리 | 종료일이 같으면 생성순(id) 뒤 시즌 |
| 완료 시즌 없을 때 | 비교 비활성 + "정산 완료된 총력전 시즌이 없습니다." 안내 |
| 기준 시즌 표시 | 비교 카드에 사용 중인 총력전 시즌 **이름 + 종료일** 노출 |
| 범위 | 프론트엔드만. DB/API 변경 없음 |

> `end < today` (strictly before): 종료일이 오늘인 시즌은 아직 "직전"으로 안 침(다음 날부터 포함). 날짜는 YYYY-MM-DD 문자열 비교.

## 상세 설계

### 1. 순수 헬퍼 (`src/lib/analysis.ts`)

```ts
// 종료일이 today 이전(end != null && end < today)인 시즌 중 종료일 최신을 반환. 없으면 null.
export function latestSettledSeason(
  seasons: ScoreSeason[],
  today: string,
): ScoreSeason | null
```
- 후보 필터: `s.end != null && s.end < today`
- 정렬: `end` 내림차순, 동률 시 `id` 내림차순 → 첫 번째 반환
- 후보 없으면 `null`
- 단위 테스트(`src/lib/analysis.test.ts`에 추가): 종료일 없는 시즌 제외 / 미래 종료일 제외 / 오늘 종료일 제외 / 여러 완료 시즌 중 최신 / 동률 시 id 뒤 / 빈 결과 null

### 2. `StatsBoard.tsx`

- `import { formatDate } from '@/lib/dates'` 추가, `const today = formatDate(new Date())`
- `import { latestSettledSeason }` 추가
- `powerMap` 변경:
  ```ts
  const powerMap = useMemo(() => {
    const settled = latestSettledSeason(powerSeasons, today);
    if (!settled) return new Map<number, number>();
    return toScoreMap(
      powerAllScores.filter((s) => s.seasonId === settled.id).map((s) => ({ memberId: s.memberId, score: s.score })),
    );
  }, [powerSeasons, powerAllScores, today]);
  ```
- 기준 총력전 시즌 객체도 메모해 두기(이름·종료일 표시용):
  ```ts
  const settledPowerSeason = useMemo(() => latestSettledSeason(powerSeasons, today), [powerSeasons, today]);
  ```

### 3. 비교 카드 UX (`type === '길드전'` 블록)

- CardDescription 아래(또는 CardTitle 옆)에 기준 시즌 표시:
  - `settledPowerSeason` 있으면: `기준 총력전: <이름> (종료 <종료일>)`
  - 없으면 카드 본문을 "정산 완료된 총력전 시즌이 없습니다."로 대체
- 기존 `crossDistribution.length === 0` 빈 상태 메시지는 유지하되, 위 "완료 총력전 없음"이 우선

## 영향 파일

- `src/lib/analysis.ts` (+ `src/lib/analysis.test.ts`)
- `src/components/StatsBoard.tsx`

## 범위 밖

- 점수 탭 → 총력전 → 그래프(ScoreChart) 동작 불변
- 길드전 쪽 `currentMap`(선택 시즌) 로직 불변
- 기능 B(길드전 승패/승률)는 별도 사이클

## 테스트 / 검증

- `npm test`: `latestSettledSeason` 단위 테스트 통과
- `npm run build` 통과
- 수동: 통계 탭 길드전에서 기준 총력전 이름·종료일이 직전 완료 시즌으로 표시되는지, 진행 중 시즌이 기준에서 제외되는지 확인
