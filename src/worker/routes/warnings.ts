import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { warnings, members } from '../db/schema';
import type { AppEnv } from '../types';

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: warnings.id,
      memberId: warnings.memberId,
      memberName: members.name,
      date: warnings.date,
      reason: warnings.reason,
    })
    .from(warnings)
    .innerJoin(members, eq(warnings.memberId, members.id))
    .orderBy(desc(warnings.date), desc(warnings.id));
  return c.json(rows);
});

app.post('/', async (c) => {
  const body = await c.req.json<{ memberId?: number; date?: string; reason?: string }>();
  if (typeof body.memberId !== 'number' || !body.date) {
    return c.json({ error: 'memberId and date are required' }, 400);
  }
  const db = getDb(c.env.DB);
  const [created] = await db
    .insert(warnings)
    .values({
      memberId: body.memberId,
      date: body.date,
      reason: body.reason?.trim() ?? '',
    })
    .returning();

  const [member] = await db
    .select({ name: members.name })
    .from(members)
    .where(eq(members.id, created.memberId));

  return c.json(
    {
      id: created.id,
      memberId: created.memberId,
      memberName: member?.name ?? '',
      date: created.date,
      reason: created.reason,
    },
    201,
  );
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb(c.env.DB);
  await db.delete(warnings).where(eq(warnings.id, id));
  return c.json({ success: true });
});

export default app;
