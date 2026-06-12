import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { scores } from '../db/schema';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const seasonId = Number(c.req.query('seasonId'));
  if (Number.isNaN(seasonId)) return c.json({ error: 'seasonId is required' }, 400);

  const db = getDb(c.env.DB);
  const rows = await db
    .select({ memberId: scores.memberId, round: scores.round, score: scores.score })
    .from(scores)
    .where(eq(scores.seasonId, seasonId));
  return c.json(rows);
});

// 셀 단위 upsert. score 가 null/빈값이면 해당 셀 삭제.
app.put('/', async (c) => {
  const body = await c.req.json<{
    seasonId?: number;
    memberId?: number;
    round?: number;
    score?: number | null;
  }>();

  if (
    typeof body.seasonId !== 'number' ||
    typeof body.memberId !== 'number' ||
    typeof body.round !== 'number'
  ) {
    return c.json({ error: 'seasonId, memberId, round are required' }, 400);
  }

  const db = getDb(c.env.DB);
  const cell = and(
    eq(scores.seasonId, body.seasonId),
    eq(scores.memberId, body.memberId),
    eq(scores.round, body.round),
  );

  if (body.score === null || body.score === undefined || Number.isNaN(body.score)) {
    await db.delete(scores).where(cell);
    return c.json({ success: true, deleted: true });
  }

  await db
    .insert(scores)
    .values({
      seasonId: body.seasonId,
      memberId: body.memberId,
      round: body.round,
      score: body.score,
    })
    .onConflictDoUpdate({
      target: [scores.seasonId, scores.memberId, scores.round],
      set: { score: body.score },
    });

  return c.json({ success: true });
});

// 차수(열) 삭제 시 해당 차수의 모든 점수 제거.
app.delete('/round', async (c) => {
  const seasonId = Number(c.req.query('seasonId'));
  const round = Number(c.req.query('round'));
  if (Number.isNaN(seasonId) || Number.isNaN(round)) {
    return c.json({ error: 'seasonId and round are required' }, 400);
  }
  const db = getDb(c.env.DB);
  await db.delete(scores).where(and(eq(scores.seasonId, seasonId), eq(scores.round, round)));
  return c.json({ success: true });
});

export default app;
