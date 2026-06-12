import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { scoreSeasons } from '../db/schema';
import type { AppEnv } from '../types';
import type { ScoreType } from '@/lib/types';

const app = new Hono<AppEnv>();

const VALID_TYPES: ScoreType[] = ['총력전', '길드전', '강림전'];

function serialize(row: { id: number; type: string; name: string; roundCount: number }) {
  return { id: row.id, type: row.type as ScoreType, name: row.name, roundCount: row.roundCount };
}

app.get('/', async (c) => {
  const type = c.req.query('type');
  const db = getDb(c.env.DB);
  const where = type ? eq(scoreSeasons.type, type) : undefined;
  const rows = await db
    .select()
    .from(scoreSeasons)
    .where(where)
    .orderBy(asc(scoreSeasons.id));
  return c.json(rows.map(serialize));
});

app.post('/', async (c) => {
  const body = await c.req.json<{ type?: string; name?: string; roundCount?: number }>();
  const name = body.name?.trim();
  if (!body.type || !VALID_TYPES.includes(body.type as ScoreType)) {
    return c.json({ error: 'valid type is required' }, 400);
  }
  if (!name) return c.json({ error: 'name is required' }, 400);

  const db = getDb(c.env.DB);
  const roundCount = Math.max(1, body.roundCount ?? 1);
  const [created] = await db
    .insert(scoreSeasons)
    .values({ type: body.type, name, roundCount })
    .returning();
  return c.json(serialize(created), 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<{ name?: string; roundCount?: number }>();
  const data: { name?: string; roundCount?: number } = {};
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (typeof body.roundCount === 'number') data.roundCount = Math.max(1, body.roundCount);
  if (Object.keys(data).length === 0) {
    return c.json({ error: 'No valid fields provided' }, 400);
  }

  const db = getDb(c.env.DB);
  const [updated] = await db
    .update(scoreSeasons)
    .set(data)
    .where(eq(scoreSeasons.id, id))
    .returning();
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(serialize(updated));
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb(c.env.DB);
  await db.delete(scoreSeasons).where(eq(scoreSeasons.id, id));
  return c.json({ success: true });
});

export default app;
