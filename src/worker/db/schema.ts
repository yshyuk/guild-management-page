import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

// 길드원
export const members = sqliteTable('members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

// 미참 로그 (content: 길드전 / 공성전 / 강림원정대)
export const missLogs = sqliteTable(
  'miss_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(), // YYYY-MM-DD
    content: text('content').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index('miss_logs_date_idx').on(t.date), index('miss_logs_content_idx').on(t.content)],
);

// 미참 로그 - 길드원 조인
export const missLogMembers = sqliteTable(
  'miss_log_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    missLogId: integer('miss_log_id')
      .notNull()
      .references(() => missLogs.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('miss_log_members_unique').on(t.missLogId, t.memberId),
    index('miss_log_members_member_idx').on(t.memberId),
  ],
);

// 길드전 기간
export const guildWarPeriods = sqliteTable(
  'guild_war_periods',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    startDate: text('start_date').notNull(), // YYYY-MM-DD
    endDate: text('end_date').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    index('guild_war_periods_start_idx').on(t.startDate),
    index('guild_war_periods_end_idx').on(t.endDate),
  ],
);

// 총력전 기간 (길드전 기간과 동일 구조, 현황판에 초록 테두리로 표시)
export const powerWarPeriods = sqliteTable(
  'power_war_periods',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    startDate: text('start_date').notNull(), // YYYY-MM-DD
    endDate: text('end_date').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    index('power_war_periods_start_idx').on(t.startDate),
    index('power_war_periods_end_idx').on(t.endDate),
  ],
);

// 강림원정대 마감일
export const raidDeadlines = sqliteTable(
  'raid_deadlines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull().unique(), // YYYY-MM-DD
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index('raid_deadlines_date_idx').on(t.date)],
);

// 현황판 기간 설정 (단일 행, id='global')
export const dashboardRangeSetting = sqliteTable('dashboard_range_setting', {
  id: text('id').primaryKey().default('global'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  isMonthMode: integer('is_month_mode', { mode: 'boolean' }).notNull().default(false),
  monthBaseDate: text('month_base_date').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

// 경고 (신규)
export const warnings = sqliteTable(
  'warnings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    reason: text('reason').notNull().default(''),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index('warnings_member_idx').on(t.memberId)],
);

// 점수 시즌 (신규) — type: 총력전 / 길드전
export const scoreSeasons = sqliteTable(
  'score_seasons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(), // '총력전' | '길드전'
    name: text('name').notNull(),
    roundCount: integer('round_count').notNull().default(1), // 표시할 차수 개수
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index('score_seasons_type_idx').on(t.type)],
);

// 점수 (신규) — 시즌별/길드원별/차수별 점수
export const scores = sqliteTable(
  'scores',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => scoreSeasons.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(), // 차수 (1, 2, 3, ...)
    score: integer('score').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    uniqueIndex('scores_unique').on(t.seasonId, t.memberId, t.round),
    index('scores_season_idx').on(t.seasonId),
  ],
);
