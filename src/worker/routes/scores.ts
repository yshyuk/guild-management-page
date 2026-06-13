import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { scores, scoreSeasons } from '../db/schema';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const type = c.req.query('type');

  // 타입의 전 시즌 점수 (전체 시즌추이 그래프용)
  if (type) {
    const rows = await db
      .select({ seasonId: scores.seasonId, memberId: scores.memberId, score: scores.score })
      .from(scores)
      .innerJoin(scoreSeasons, eq(scores.seasonId, scoreSeasons.id))
      .where(eq(scoreSeasons.type, type));
    return c.json(rows);
  }

  // 단일 시즌 점수
  const seasonId = Number(c.req.query('seasonId'));
  if (Number.isNaN(seasonId)) return c.json({ error: 'seasonId or type is required' }, 400);
  const rows = await db
    .select({ memberId: scores.memberId, score: scores.score })
    .from(scores)
    .where(eq(scores.seasonId, seasonId));
  return c.json(rows);
});

// 셀 단위 upsert. score 가 null/빈값이면 해당 셀 삭제.
app.put('/', async (c) => {
  const body = await c.req.json<{
    seasonId?: number;
    memberId?: number;
    score?: number | null;
  }>();

  if (typeof body.seasonId !== 'number' || typeof body.memberId !== 'number') {
    return c.json({ error: 'seasonId and memberId are required' }, 400);
  }

  const db = getDb(c.env.DB);
  const cell = and(eq(scores.seasonId, body.seasonId), eq(scores.memberId, body.memberId));

  if (body.score === null || body.score === undefined || Number.isNaN(body.score)) {
    await db.delete(scores).where(cell);
    return c.json({ success: true, deleted: true });
  }

  await db
    .insert(scores)
    .values({ seasonId: body.seasonId, memberId: body.memberId, score: body.score })
    .onConflictDoUpdate({
      target: [scores.seasonId, scores.memberId],
      set: { score: body.score },
    });

  return c.json({ success: true });
});

export default app;
