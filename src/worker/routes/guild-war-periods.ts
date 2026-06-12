import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { guildWarPeriods } from '../db/schema';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

function serialize(row: { id: number; startDate: string; endDate: string }) {
  return { id: row.id, start: row.startDate, end: row.endDate };
}

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(guildWarPeriods).orderBy(asc(guildWarPeriods.startDate));
  return c.json(rows.map(serialize));
});

app.post('/', async (c) => {
  const body = await c.req.json<{ start?: string; end?: string }>();
  if (!body.start || !body.end) {
    return c.json({ error: 'start and end are required' }, 400);
  }
  const db = getDb(c.env.DB);
  const [created] = await db
    .insert(guildWarPeriods)
    .values({ startDate: body.start, endDate: body.end })
    .returning();
  return c.json(serialize(created), 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<{ start?: string; end?: string }>();
  const data: { startDate?: string; endDate?: string } = {};
  if (body.start) data.startDate = body.start;
  if (body.end) data.endDate = body.end;
  if (Object.keys(data).length === 0) {
    return c.json({ error: 'No valid fields provided' }, 400);
  }

  const db = getDb(c.env.DB);
  const [updated] = await db
    .update(guildWarPeriods)
    .set(data)
    .where(eq(guildWarPeriods.id, id))
    .returning();
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(serialize(updated));
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb(c.env.DB);
  await db.delete(guildWarPeriods).where(eq(guildWarPeriods.id, id));
  return c.json({ success: true });
});

export default app;
