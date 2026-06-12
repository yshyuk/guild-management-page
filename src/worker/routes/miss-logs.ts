import { Hono } from 'hono';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { getDb, type DB } from '../db/client';
import { missLogs, missLogMembers, members } from '../db/schema';
import type { AppEnv } from '../types';
import type { ContentType } from '@/lib/types';

const app = new Hono<AppEnv>();

type LogBody = {
  date?: string;
  content?: ContentType;
  memberIds?: number[];
};

async function membersByLogIds(db: DB, logIds: number[]): Promise<Map<number, string[]>> {
  const byLog = new Map<number, string[]>();
  if (logIds.length === 0) return byLog;
  const rows = await db
    .select({ missLogId: missLogMembers.missLogId, name: members.name })
    .from(missLogMembers)
    .innerJoin(members, eq(missLogMembers.memberId, members.id))
    .where(inArray(missLogMembers.missLogId, logIds));
  for (const r of rows) {
    const list = byLog.get(r.missLogId) ?? [];
    list.push(r.name);
    byLog.set(r.missLogId, list);
  }
  return byLog;
}

async function loadLog(db: DB, id: number) {
  const [log] = await db.select().from(missLogs).where(eq(missLogs.id, id));
  if (!log) return null;
  const byLog = await membersByLogIds(db, [id]);
  return {
    id: log.id,
    date: log.date,
    content: log.content as ContentType,
    members: byLog.get(id) ?? [],
  };
}

app.get('/', async (c) => {
  const start = c.req.query('start');
  const end = c.req.query('end');
  const db = getDb(c.env.DB);

  const where =
    start && end ? and(gte(missLogs.date, start), lte(missLogs.date, end)) : undefined;

  const logRows = await db
    .select()
    .from(missLogs)
    .where(where)
    .orderBy(asc(missLogs.date), asc(missLogs.id));

  const byLog = await membersByLogIds(
    db,
    logRows.map((l) => l.id),
  );

  return c.json(
    logRows.map((l) => ({
      id: l.id,
      date: l.date,
      content: l.content as ContentType,
      members: byLog.get(l.id) ?? [],
    })),
  );
});

app.post('/', async (c) => {
  const body = await c.req.json<LogBody>();
  if (!body.date || !body.content) {
    return c.json({ error: 'date and content are required' }, 400);
  }
  const memberIds = body.memberIds ?? [];
  const db = getDb(c.env.DB);

  const [created] = await db
    .insert(missLogs)
    .values({ date: body.date, content: body.content })
    .returning();

  if (memberIds.length > 0) {
    await db
      .insert(missLogMembers)
      .values(memberIds.map((memberId) => ({ missLogId: created.id, memberId })));
  }

  const result = await loadLog(db, created.id);
  return c.json(result, 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const body = await c.req.json<LogBody>();
  const db = getDb(c.env.DB);

  const data: { date?: string; content?: ContentType } = {};
  if (body.date) data.date = body.date;
  if (body.content) data.content = body.content;
  if (Object.keys(data).length > 0) {
    await db.update(missLogs).set(data).where(eq(missLogs.id, id));
  }

  if (Array.isArray(body.memberIds)) {
    await db.delete(missLogMembers).where(eq(missLogMembers.missLogId, id));
    if (body.memberIds.length > 0) {
      await db
        .insert(missLogMembers)
        .values(body.memberIds.map((memberId) => ({ missLogId: id, memberId })));
    }
  }

  const result = await loadLog(db, id);
  if (!result) return c.json({ error: 'Miss log not found' }, 404);
  return c.json(result);
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb(c.env.DB);
  await db.delete(missLogs).where(eq(missLogs.id, id));
  return c.json({ success: true });
});

export default app;
