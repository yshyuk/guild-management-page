// 승률(%) 계산. 0경기면 null. 소수 1자리.
export function winRate(wins: number, losses: number): number | null {
  const total = wins + losses;
  if (total <= 0) return null;
  return Math.round((wins / total) * 1000) / 10;
}

// 표시용: 0경기면 '-', 아니면 '66.7%'
export function winRateText(wins: number, losses: number): string {
  const r = winRate(wins, losses);
  return r === null ? '-' : `${r.toFixed(1)}%`;
}
