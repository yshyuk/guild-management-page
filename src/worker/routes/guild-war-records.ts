import { Hono } from 'hono';
import { and, desc, eq, max, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { guildWarRecords, guildWarMatchInputs } from '../db/schema';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

// 시즌 전체 길드원 누적 전적 + 최근 입력일
app.get('/', async (c) => {
  const seasonId = Number(c.req.query('seasonId'));
  if (Number.isNaN(seasonId)) return c.json({ error: 'seasonId is required' }, 400);
  const db = getDb(c.env.DB);

  const recs = await db
    .select({ memberId: guildWarRecords.memberId, wins: guildWarRecords.wins, losses: guildWarRecords.losses })
    .from(guildWarRecords)
    .where(eq(guildWarRecords.seasonId, seasonId));

  const lastDates = await db
    .select({ memberId: guildWarMatchInputs.memberId, lastInputDate: max(guildWarMatchInputs.date) })
    .from(guildWarMatchInputs)
    .where(eq(guildWarMatchInputs.seasonId, seasonId))
    .groupBy(guildWarMatchInputs.memberId);

  const dateMap = new Map(lastDates.map((d) => [d.memberId, d.lastInputDate]));
  return c.json(recs.map((r) => ({ ...r, lastInputDate: dateMap.get(r.memberId) ?? null })));
});

// 한 길드원의 입력 이력(날짜 내림차순)
app.get('/inputs', async (c) => {
  const seasonId = Number(c.req.query('seasonId'));
  const memberId = Number(c.req.query('memberId'));
  if (Number.isNaN(seasonId) || Number.isNaN(memberId)) {
    return c.json({ error: 'seasonId and memberId are required' }, 400);
  }
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: guildWarMatchInputs.id,
      date: guildWarMatchInputs.date,
      wins: guildWarMatchInputs.wins,
      losses: guildWarMatchInputs.losses,
    })
    .from(guildWarMatchInputs)
    .where(and(eq(guildWarMatchInputs.seasonId, seasonId), eq(guildWarMatchInputs.memberId, memberId)))
    .orderBy(desc(guildWarMatchInputs.date), desc(guildWarMatchInputs.id));
  return c.json(rows);
});

// 경기 기록: 카운터 누적 + 로그 1행
app.post('/match', async (c) => {
  const body = await c.req.json<{ seasonId?: number; memberId?: number; date?: string; wins?: number; losses?: number }>();
  const { seasonId, memberId, date, wins, losses } = body;
  if (typeof seasonId !== 'number' || typeof memberId !== 'number' || !date || typeof wins !== 'number' || typeof losses !== 'number') {
    return c.json({ error: 'seasonId, memberId, date, wins, losses are required' }, 400);
  }
  if (wins < 0 || losses < 0 || wins + losses < 1 || wins + losses > 5) {
    return c.json({ error: 'wins+losses must be between 1 and 5' }, 400);
  }
  const db = getDb(c.env.DB);
  // 로그 insert + 카운터 누적 upsert를 batch로 원자 실행(D1은 인터랙티브 트랜잭션 미지원)
  const results = await db.batch([
    db.insert(guildWarMatchInputs).values({ seasonId, memberId, date, wins, losses }),
    db
      .insert(guildWarRecords)
      .values({ seasonId, memberId, wins, losses })
      .onConflictDoUpdate({
        target: [guildWarRecords.seasonId, guildWarRecords.memberId],
        set: {
          wins: sql`${guildWarRecords.wins} + ${wins}`,
          losses: sql`${guildWarRecords.losses} + ${losses}`,
        },
      })
      .returning({ memberId: guildWarRecords.memberId, wins: guildWarRecords.wins, losses: guildWarRecords.losses }),
  ]);
  const rec = results[1][0];
  if (!rec) return c.json({ error: 'Failed to record match' }, 500);
  return c.json({ ...rec, lastInputDate: date }, 201);
});

// 전적 수기 수정: 카운터 덮어쓰기
app.put('/', async (c) => {
  const body = await c.req.json<{ seasonId?: number; memberId?: number; wins?: number; losses?: number }>();
  const { seasonId, memberId, wins, losses } = body;
  if (typeof seasonId !== 'number' || typeof memberId !== 'number' || typeof wins !== 'number' || typeof losses !== 'number') {
    return c.json({ error: 'seasonId, memberId, wins, losses are required' }, 400);
  }
  if (wins < 0 || losses < 0) return c.json({ error: 'wins and losses must be >= 0' }, 400);
  const db = getDb(c.env.DB);
  await db
    .insert(guildWarRecords)
    .values({ seasonId, memberId, wins, losses })
    .onConflictDoUpdate({
      target: [guildWarRecords.seasonId, guildWarRecords.memberId],
      set: { wins, losses },
    });
  return c.json({ success: true });
});

export default app;
