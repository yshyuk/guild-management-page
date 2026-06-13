export type ContentType = '길드전' | '공성전' | '강림원정대';
export type ScoreType = '총력전' | '길드전' | '강림전';

export type Member = {
  id: number;
  name: string;
  active: boolean;
};

export type MissLog = {
  id: number;
  date: string;
  content: ContentType;
  members: string[];
};

export type GuildWarPeriod = {
  id: number;
  start: string;
  end: string;
};

export type RaidDeadline = {
  id: number;
  date: string;
};

export type DashboardRangeSettings = {
  start: string;
  end: string;
  isMonthMode: boolean;
  monthBaseDate: string;
};

export type MemberStat = {
  name: string;
  guildWar: number;
  siege: number;
  raid: number;
  total: number;
};

export type Warning = {
  id: number;
  memberId: number;
  memberName: string;
  date: string;
  reason: string;
};

export type ScoreSeason = {
  id: number;
  type: ScoreType;
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
};

// 단일 시즌 점수 (시즌당 길드원 1점수)
export type ScoreCell = {
  memberId: number;
  score: number;
};

// 타입 전체 시즌 점수 (전체 시즌추이 그래프용)
export type SeasonScore = {
  seasonId: number;
  memberId: number;
  score: number;
};
