import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { members } from '../db/schema';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

function serialize(row: { id: number; name: string; active: boolean }) {
  return { id: row.id, name: row.name, active: row.active };
}

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(members).orderBy(asc(members.name));
  return c.json(rows.map(serialize));
});

app.post('/', async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();
  if (!name) return c.json({ error: 'Name is required' }, 400);

  const db = getDb(c.env.DB);
  const [created] = await db
    .insert(members)
    .values({ name, active: true })
    .returning();
  return c.json(serialize(created), 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid member id' }, 400);

  const body = await c.req.json<{ name?: string; active?: boolean }>();
  const data: { name?: string; active?: boolean } = {};

  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) return c.json({ error: 'Name cannot be empty' }, 400);
    data.name = trimmed;
  }
  if (typeof body.active === 'boolean') data.active = body.active;

  if (Object.keys(data).length === 0) {
    return c.json({ error: 'No valid fields provided' }, 400);
  }

  const db = getDb(c.env.DB);
  const [updated] = await db
    .update(members)
    .set(data)
    .where(eq(members.id, id))
    .returning();
  if (!updated) return c.json({ error: 'Member not found' }, 404);
  return c.json(serialize(updated));
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid member id' }, 400);

  const db = getDb(c.env.DB);
  await db.delete(members).where(eq(members.id, id));
  return c.json({ success: true });
});

export default app;
